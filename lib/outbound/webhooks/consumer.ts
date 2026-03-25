/**
 * Webhook Event Consumer
 *
 * Reads new webhook events from the deepline identity store
 * (dl_cache.enrichment_event) and processes reply events through
 * the auto-reply pipeline: template match → LLM draft → Slack approval.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { loadConfig } from "../config/loader";
import { matchResponseTemplate, draftReply } from "../lemlist/draft-reply";
import { postMessage } from "../slack/client";
import { formatOutboundReply } from "../slack/messages";
import { scoreLead } from "../engine/scorer";
import { upsertLearning } from "../db/learnings";

interface EnrichmentEventRow {
  row_id: string;
  source: string;
  doc: {
    raw_payload?: {
      event_type?: string;
      source_platform?: string;
      reply_text?: string;
      campaign_id?: string;
      campaign_name?: string;
      first_name?: string;
      last_name?: string;
      company?: string;
      email?: string;
      linkedin_url?: string;
      received_at?: string;
      original_payload?: Record<string, unknown>;
    };
    identity_payload?: Record<string, string[]>;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export const APP_ID = process.env.APP_ID || "replybot";

export async function processWebhookEvents(): Promise<{
  total: number;
  processed: number;
  skipped: number;
  errors: number;
}> {
  await ensureTrackingTable();

  const events = await query<EnrichmentEventRow>(
    `SELECT e.row_id, e.source, e.doc, e.created_at, e.updated_at
     FROM dl_cache.enrichment_event e
     LEFT JOIN inbound.processed_webhook_events p
       ON p.event_row_id = e.row_id AND p.app_id = $1
     WHERE p.event_row_id IS NULL
       AND e.source LIKE 'cache:local:event_tamdb_write:%'
     ORDER BY e.created_at ASC
     LIMIT 20`,
    [APP_ID]
  );

  if (events.length === 0) {
    return { total: 0, processed: 0, skipped: 0, errors: 0 };
  }

  console.log(`[webhook/consumer] Found ${events.length} new events to process`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const raw = event.doc?.raw_payload;
      if (!raw) {
        await markProcessed(event.row_id, "skipped", "no raw_payload");
        skipped++;
        continue;
      }

      const eventType = raw.event_type || "unknown";

      if (!isReplyEvent(eventType)) {
        await markProcessed(event.row_id, "skipped", `event_type=${eventType}`);
        skipped++;
        continue;
      }

      if (!raw.reply_text) {
        await markProcessed(event.row_id, "skipped", "no reply_text");
        skipped++;
        continue;
      }

      await processReplyEvent(event, raw);
      await markProcessed(event.row_id, "processed");
      processed++;
    } catch (err) {
      console.error(`[webhook/consumer] Error processing ${event.row_id}:`, err);
      await markProcessed(event.row_id, "error", String(err));
      errors++;
    }
  }

  return { total: events.length, processed, skipped, errors };
}

function isReplyEvent(eventType: string): boolean {
  const replyTypes = [
    "reply",
    "email_replied",
    "email_reply",
    "reply_received",
    "linkedinreplied",
    "linkedin_replied",
    "every message/inmail reply received",
    "instantly_replied",
  ];
  return replyTypes.includes(eventType.toLowerCase());
}

async function processReplyEvent(
  event: EnrichmentEventRow,
  raw: NonNullable<EnrichmentEventRow["doc"]["raw_payload"]>
): Promise<void> {
  const config = loadConfig();
  const prospectName =
    [raw.first_name, raw.last_name].filter(Boolean).join(" ") || "Unknown";
  const companyName = raw.company || "Unknown Company";
  const sourcePlatform = raw.source_platform || "unknown";

  // Upsert lead
  const existingLead = raw.email
    ? await query<{ id: string }>(
        `SELECT id FROM inbound.leads WHERE email = $1`,
        [raw.email]
      ).then(r => r[0] ?? null)
    : null;

  let leadId: string;
  if (existingLead) {
    leadId = existingLead.id;
    await writeQuery(
      `UPDATE inbound.leads SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        company_name = COALESCE($3, company_name),
        full_name = COALESCE($4, full_name),
        updated_at = NOW()
      WHERE id = $5`,
      [raw.first_name, raw.last_name, companyName, prospectName, leadId]
    );
  } else {
    const rows = await writeQuery<{ id: string }>(
      `INSERT INTO inbound.leads (id, full_name, first_name, last_name, email, company, company_name, source, status, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, $6, 'replied', $7)
       RETURNING id`,
      [
        prospectName,
        raw.first_name || null,
        raw.last_name || null,
        raw.email || null,
        companyName,
        sourcePlatform,
        JSON.stringify({
          deepline_event_row_id: event.row_id,
          campaign_id: raw.campaign_id,
          linkedin_url: raw.linkedin_url,
        }),
      ]
    );
    leadId = rows[0].id;
  }

  // Match response template
  const template = matchResponseTemplate(raw.reply_text!, config.response_templates);
  console.log(`[webhook/consumer] Matched template: ${template.name}`);

  // Load lead details
  const lead = await query<{
    id: string;
    title: string | null;
    company_domain: string | null;
  }>(`SELECT id, title, company_domain FROM inbound.leads WHERE id = $1`, [leadId])
    .then(r => r[0] ?? null);

  // Pick rep
  const reps = config.routing.reps;
  const repIndex = Math.floor(Math.random() * reps.length);
  const repName = reps[repIndex]?.name || "Tej";

  // Draft reply via LLM
  const draftedResponse = await draftReply({
    replyText: raw.reply_text!,
    prospectName,
    prospectTitle: lead?.title || null,
    companyName,
    companyDescription: null,
    campaignName: raw.campaign_name || "Unknown Campaign",
    originalMessage: null,
    repName,
    template,
    companyContext: config.company_context,
  });

  // Score lead against ICP + write signals
  const replyChannel = raw.event_type?.toLowerCase().includes("linkedin") ? "linkedin" : "email";
  try {
    const leadData: Record<string, unknown> = {
      email: raw.email,
      first_name: raw.first_name,
      last_name: raw.last_name,
      company_name: companyName,
      title: lead?.title,
      company_domain: lead?.company_domain,
      linkedin_url: raw.linkedin_url,
    };

    const icpEntries = Object.entries(config.icp_definitions);
    if (icpEntries.length > 0) {
      const [icpName, icpDef] = icpEntries[0];
      const scoreResult = scoreLead(leadData, icpDef);
      console.log(`[webhook/consumer] ICP score (${icpName}): ${scoreResult.total}`);

      await writeQuery(
        `UPDATE inbound.leads SET qualification_score = $1, updated_at = NOW() WHERE id = $2`,
        [scoreResult.total, leadId]
      ).catch(() => {});

      await upsertLearning({
        entity_type: "lead",
        entity_id: leadId,
        category: "icp_score",
        key: icpName,
        value: JSON.stringify({ total: scoreResult.total, passed: scoreResult.passed, flags: scoreResult.flags }),
        confidence: 80,
        source: `${sourcePlatform}_webhook`,
        metadata: { breakdown: scoreResult.breakdown },
      }).catch(() => {});
    }

    await upsertLearning({
      entity_type: "lead",
      entity_id: leadId,
      category: "reply_signal",
      key: "intent",
      value: template.name,
      confidence: 70,
      source: `${sourcePlatform}_webhook`,
      metadata: { template: template.name, campaign_id: raw.campaign_id },
    }).catch(() => {});

    await upsertLearning({
      entity_type: "lead",
      entity_id: leadId,
      category: "reply_signal",
      key: "channel",
      value: replyChannel,
      confidence: 90,
      source: `${sourcePlatform}_webhook`,
      metadata: { campaign_id: raw.campaign_id },
    }).catch(() => {});
  } catch (err) {
    console.warn("[webhook/consumer] Scoring/signal write failed:", err);
  }

  // Record in webhook_events
  await writeQuery(
    `INSERT INTO inbound.webhook_events (source, event_type, raw_payload, status, lead_id, processed_at, created_at)
     VALUES ($1, $2, $3, 'processed', $4, NOW(), $5::timestamptz)`,
    [sourcePlatform, raw.event_type || "unknown", JSON.stringify(raw), leadId, raw.received_at || new Date().toISOString()]
  ).catch((err: unknown) => console.warn("[webhook/consumer] Failed to record webhook_event:", err));

  // Create conversation record
  const convRows = await writeQuery<{ id: number }>(
    `INSERT INTO inbound.conversations (lead_id, direction, channel, original_message, drafted_response, status, metadata)
     VALUES ($1, 'inbound', $2, $3, $4, 'pending', $5)
     RETURNING id`,
    [
      leadId,
      replyChannel,
      raw.reply_text,
      draftedResponse,
      JSON.stringify({
        deepline_event_row_id: event.row_id,
        campaign_id: raw.campaign_id,
        campaign_name: raw.campaign_name,
        source_platform: sourcePlatform,
        template_matched: template.name,
        rep_name: repName,
      }),
    ]
  );
  const convId = convRows[0].id;

  // Post to Slack
  const slackChannel = process.env.SLACK_CHANNEL_OUTBOUND || "replybot";
  const campaignUrl = getCampaignUrl(sourcePlatform, raw.campaign_id);

  const { text, blocks } = formatOutboundReply({
    leadName: prospectName,
    companyName,
    campaignName: raw.campaign_name || "Unknown Campaign",
    originalReply: raw.reply_text!,
    draftedResponse,
    campaignUrl,
    provider: sourcePlatform,
    conversationId: convId,
  });

  const slackResult = await postMessage({ channel: slackChannel, text, blocks });

  await writeQuery(
    `UPDATE inbound.conversations SET slack_message_ts = $1, slack_channel = $2 WHERE id = $3`,
    [slackResult.ts, slackResult.channel, convId]
  );

  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      leadId,
      "webhook_reply_received",
      JSON.stringify({
        conversation_id: convId,
        template: template.name,
        campaign_id: raw.campaign_id,
        source_platform: sourcePlatform,
        rep: repName,
        deepline_event_row_id: event.row_id,
      }),
    ]
  );

  console.log(`[webhook/consumer] Processed ${sourcePlatform} reply from ${raw.email}, conversation: ${convId}`);
}

function getCampaignUrl(platform: string, campaignId?: string): string {
  if (!campaignId) return '#';
  switch (platform) {
    case 'lemlist': return `https://app.lemlist.com/campaigns/${campaignId}`;
    case 'smartlead': return `https://app.smartlead.ai/app/email-campaign/${campaignId}/overview`;
    case 'heyreach': return `https://app.heyreach.io/campaigns/${campaignId}`;
    case 'instantly': return `https://app.instantly.ai/app/campaigns/${campaignId}`;
    default: return '#';
  }
}

async function ensureTrackingTable(): Promise<void> {
  await writeQuery(
    `CREATE TABLE IF NOT EXISTS inbound.processed_webhook_events (
      event_row_id UUID NOT NULL,
      app_id TEXT NOT NULL DEFAULT 'replybot',
      status TEXT NOT NULL DEFAULT 'processed',
      detail TEXT,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_row_id, app_id)
    )`
  );
}

async function markProcessed(
  eventRowId: string,
  status: string,
  detail?: string
): Promise<void> {
  await writeQuery(
    `INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status, detail)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_row_id, app_id) DO NOTHING`,
    [eventRowId, APP_ID, status, detail || null]
  );
}
