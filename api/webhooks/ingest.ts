/**
 * Universal webhook ingest endpoint.
 *
 * Receives webhooks from SmartLead, HeyReach (and future platforms),
 * normalizes the payload, and writes directly to dl_cache.enrichment_event.
 * The cron consumer then picks up new events and runs the auto-reply pipeline.
 *
 * POST /api/webhooks/ingest?source=smartlead
 * POST /api/webhooks/ingest?source=heyreach
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../../src/db/client.js";
import { relayWebhook } from "../../src/webhooks/relay.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  try {
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "invalid payload" });
    }

    const sourcePlatform =
      (req.query.source as string) ||
      detectPlatform(payload);

    const normalized = normalizePayload(payload, sourcePlatform);

    // Capture webhook event in local store (non-blocking — don't let failures prevent processing)
    try {
      const eventType = normalized.event_type || 'unknown';
      await query(
        `INSERT INTO webhook_events (source, event_type, raw_payload, status, received_at)
         VALUES ($1, $2, $3::jsonb, 'received', NOW())`,
        [sourcePlatform, eventType, JSON.stringify(payload)]
      );
    } catch (captureErr) {
      console.error('[webhooks/ingest] Failed to capture webhook event:', captureErr);
    }

    const source = `cache:local:event_tamdb_write:event:${sourcePlatform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const identityPayload: Record<string, string[]> = {};
    if (normalized.email) identityPayload.email = [normalized.email];
    if (normalized.linkedin_url) identityPayload.linkedin = [normalized.linkedin_url];
    if (normalized.first_name || normalized.last_name) {
      identityPayload.person_name = [
        [normalized.first_name, normalized.last_name].filter(Boolean).join(" "),
      ];
    }
    if (normalized.company) identityPayload.company_name = [normalized.company];

    const doc = {
      identity_payload: identityPayload,
      raw_payload: {
        event_type: normalized.event_type,
        source_platform: sourcePlatform,
        reply_text: normalized.reply_text,
        campaign_id: normalized.campaign_id,
        campaign_name: normalized.campaign_name,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        company: normalized.company,
        email: normalized.email,
        linkedin_url: normalized.linkedin_url,
        received_at: new Date().toISOString(),
        original_payload: payload,
      },
      entity_type: "event",
    };

    const result = await query(
      `INSERT INTO dl_cache.enrichment_event
        (row_id, source, doc, extracted_potential_identifier_keys, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       RETURNING row_id`,
      [
        source,
        JSON.stringify(doc),
        JSON.stringify(Object.keys(identityPayload)),
      ]
    );

    console.log(
      `[webhooks/ingest] Wrote ${sourcePlatform} event: ${result.rows[0].row_id} (${normalized.event_type})`
    );

    // Fan-out to relay targets (fire-and-forget, non-blocking)
    const relayTargets = (process.env.WEBHOOK_RELAY_TARGETS || '').split(',').filter(Boolean);
    if (relayTargets.length > 0) {
      relayWebhook(payload, sourcePlatform, relayTargets).catch(err =>
        console.error('[webhooks/ingest] Relay error:', err)
      );
    }

    return res.status(202).json({
      ok: true,
      event_row_id: result.rows[0].row_id,
      event_type: normalized.event_type,
      source_platform: sourcePlatform,
    });
  } catch (err) {
    console.error("[webhooks/ingest] Error:", err);
    return res.status(500).json({ error: "internal error" });
  }
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(payload: Record<string, unknown>): string {
  if (payload.event && typeof payload.event === "string") return "smartlead";
  if (payload.profileUrl || payload.emailAddress) return "heyreach";
  if (payload.type && typeof payload.type === "string") return "lemlist";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Payload normalization (same logic as the deepline cloud job)
// ---------------------------------------------------------------------------

interface NormalizedEvent {
  event_type: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  reply_text: string | null;
  campaign_id: string;
  campaign_name: string;
  linkedin_url: string | null;
}

function normalizePayload(
  row: Record<string, any>,
  sourcePlatform: string
): NormalizedEvent {
  const event_type = (
    row.event || row.type || "unknown"
  ).toString().toLowerCase();

  const lead = row.lead && typeof row.lead === "object" ? row.lead : {};
  const reply = row.reply && typeof row.reply === "object" ? row.reply : {};

  return {
    event_type,
    email: lead.email || row.emailAddress || row.email || null,
    first_name: lead.first_name || row.firstName || row.first_name || null,
    last_name: lead.last_name || row.lastName || row.last_name || null,
    company:
      lead.company_name ||
      row.companyName ||
      row.company_name ||
      row.company ||
      null,
    reply_text: reply.body || row.replyText || row.message_text || null,
    campaign_id: (row.campaign_id || row.campaignId || "").toString(),
    campaign_name: row.campaign_name || row.campaignName || "",
    linkedin_url: row.profileUrl || row.linkedin_url || null,
  };
}
