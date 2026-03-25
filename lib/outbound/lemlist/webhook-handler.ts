/**
 * Lemlist Webhook Handler
 *
 * Receives webhook payloads from Lemlist when a lead replies,
 * drafts an LLM-powered response, and posts to Slack for approval.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { loadConfig } from "../config/loader";
import { matchResponseTemplate, draftReply } from "./draft-reply";
import { postMessage } from "../slack/client";
import { formatOutboundReply } from "../slack/messages";
import { enforceRateLimit, RateLimitError } from "../safety/rate-limiter";
import { scoreLead } from "../engine/scorer";
import { upsertLearning } from "../db/learnings";

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

interface LemlistWebhookPayload {
  type: string;
  campaignId?: string;
  campaignName?: string;
  leadId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  replyText?: string;
  [key: string]: unknown;
}

export async function handleLemlistWebhook(
  payload: LemlistWebhookPayload
): Promise<{ ok: boolean; conversation_id?: number }> {
  const redactedEmail = payload.email ? `${payload.email.slice(0, 3)}***@${payload.email.split('@')[1] || '***'}` : 'none';
  console.log("[lemlist/webhook] Received event:", payload.type, redactedEmail);

  const REPLY_EVENTS = ["emailsReplied", "linkedinReplied"];
  if (!REPLY_EVENTS.includes(payload.type)) {
    console.log("[lemlist/webhook] Ignoring non-reply event:", payload.type);
    return { ok: true };
  }

  const replyText = payload.replyText;
  if (!replyText) {
    console.warn("[lemlist/webhook] No replyText in payload");
    return { ok: true };
  }

  // Rate limit webhook processing
  try {
    await enforceRateLimit('webhook_process');
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.warn("[lemlist/webhook] Rate limited:", err.message);
      return { ok: false, error: 'Rate limit exceeded' } as any;
    }
    throw err;
  }

  const config = loadConfig();
  const prospectName =
    [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
    "Unknown";
  const companyName = payload.companyName || "Unknown Company";

  // 1. Upsert lead in DB
  const existingLead = payload.email
    ? await queryOne<{ id: string }>(
        `SELECT id FROM inbound.leads WHERE email = $1`,
        [payload.email]
      )
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
      [
        payload.firstName,
        payload.lastName,
        companyName,
        prospectName,
        leadId,
      ]
    );
  } else {
    const rows = await writeQuery<{ id: string }>(
      `INSERT INTO inbound.leads (id, full_name, first_name, last_name, email, company, company_name, source, status, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, 'lemlist', 'replied', $6)
       RETURNING id`,
      [
        prospectName,
        payload.firstName || null,
        payload.lastName || null,
        payload.email || null,
        companyName,
        JSON.stringify({
          provider: "lemlist",
          lemlist_lead_id: payload.leadId,
          lemlist_campaign_id: payload.campaignId,
        }),
      ]
    );
    leadId = rows[0].id;
  }

  // 2. Match response template
  const template = matchResponseTemplate(replyText, config.response_templates);
  console.log("[lemlist/webhook] Matched template:", template.name);

  // 3. Load lead details
  const lead = await queryOne<{
    id: string;
    title: string | null;
    company_domain: string | null;
  }>(`SELECT id, title, company_domain FROM inbound.leads WHERE id = $1`, [leadId]);

  // 4. Pick rep (simple random from config)
  const reps = config.routing.reps;
  const repIndex = Math.floor(Math.random() * reps.length);
  const repName = reps[repIndex]?.name || "Tej";

  // 5. Draft reply via LLM
  const draftedResponse = await draftReply({
    replyText,
    prospectName,
    prospectTitle: lead?.title || null,
    companyName,
    companyDescription: null,
    campaignName: payload.campaignName || "Unknown Campaign",
    originalMessage: null,
    repName,
    template,
    companyContext: config.company_context,
  });

  console.log(
    "[lemlist/webhook] LLM drafted response:",
    draftedResponse.slice(0, 100)
  );

  // 5b. Score lead against ICP + write intent signals
  const replyChannel = payload.type === "linkedinReplied" ? "linkedin" : "email";
  try {
    const leadData: Record<string, unknown> = {
      email: payload.email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      company_name: companyName,
      title: lead?.title,
      company_domain: lead?.company_domain,
    };

    const icpEntries = Object.entries(config.icp_definitions);
    if (icpEntries.length > 0) {
      const [icpName, icpDef] = icpEntries[0];
      const scoreResult = scoreLead(leadData, icpDef);
      console.log(`[lemlist/webhook] ICP score (${icpName}): ${scoreResult.total}, passed: ${scoreResult.passed}`);

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
        source: "lemlist_webhook",
        metadata: { breakdown: scoreResult.breakdown },
      }).catch((err: unknown) => console.warn("[lemlist/webhook] Failed to write ICP score learning:", err));
    }

    await upsertLearning({
      entity_type: "lead",
      entity_id: leadId,
      category: "reply_signal",
      key: "intent",
      value: template.name,
      confidence: 70,
      source: "lemlist_webhook",
      metadata: { template: template.name, campaign_id: payload.campaignId },
    }).catch((err: unknown) => console.warn("[lemlist/webhook] Failed to write intent learning:", err));

    await upsertLearning({
      entity_type: "lead",
      entity_id: leadId,
      category: "reply_signal",
      key: "channel",
      value: replyChannel,
      confidence: 90,
      source: "lemlist_webhook",
      metadata: { campaign_id: payload.campaignId, campaign_name: payload.campaignName },
    }).catch((err: unknown) => console.warn("[lemlist/webhook] Failed to write channel learning:", err));
  } catch (err) {
    console.warn("[lemlist/webhook] Scoring/signal write failed (non-blocking):", err);
  }

  // 6. Create conversation record
  const convRows = await writeQuery<{ id: number }>(
    `INSERT INTO inbound.conversations (lead_id, direction, channel, original_message, drafted_response, status, metadata)
     VALUES ($1, 'inbound', $2, $3, $4, 'pending', $5)
     RETURNING id`,
    [
      leadId,
      replyChannel,
      replyText,
      draftedResponse,
      JSON.stringify({
        provider: "lemlist",
        lemlist_lead_id: payload.leadId,
        campaign_id: payload.campaignId,
        campaign_name: payload.campaignName,
        template_matched: template.name,
        rep_name: repName,
      }),
    ]
  );
  const convId = convRows[0].id;

  // 7. Post to Slack
  const slackChannel = process.env.SLACK_CHANNEL_OUTBOUND || "replybot";
  const { text, blocks } = formatOutboundReply({
    leadName: prospectName,
    companyName,
    campaignName: payload.campaignName || "Unknown Campaign",
    originalReply: replyText,
    draftedResponse,
    campaignUrl: `https://app.lemlist.com/campaigns/${payload.campaignId || ""}`,
    provider: "lemlist",
    conversationId: convId,
  });

  const slackResult = await postMessage({
    channel: slackChannel,
    text,
    blocks,
  });

  // 8. Store Slack message reference
  await writeQuery(
    `UPDATE inbound.conversations SET slack_message_ts = $1, slack_channel = $2 WHERE id = $3`,
    [slackResult.ts, slackResult.channel, convId]
  );

  // 9. Log routing action
  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      leadId,
      "lemlist_reply_received",
      JSON.stringify({
        conversation_id: convId,
        template: template.name,
        campaign_id: payload.campaignId,
        rep: repName,
      }),
    ]
  );

  console.log("[lemlist/webhook] Posted to Slack, conversation:", convId);
  return { ok: true, conversation_id: convId };
}
