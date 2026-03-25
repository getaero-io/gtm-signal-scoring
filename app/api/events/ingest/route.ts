/**
 * Webhook Ingest Endpoint
 *
 * Receives webhooks from outbound platforms (Lemlist, SmartLead, HeyReach, Instantly)
 * and writes them into tamdb (dl_cache.enrichment_event) as the source of truth.
 * The event processor (/api/events/process) then picks them up.
 *
 * POST /api/events/ingest?provider=lemlist
 */

import { NextRequest, NextResponse } from "next/server";
import { writeQuery } from "@/lib/db-write";

interface NormalizedPayload {
  event_type: string;
  source_platform: string;
  reply_text?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  campaign_id?: string;
  campaign_name?: string;
  linkedin_url?: string;
  received_at: string;
  original_payload: Record<string, unknown>;
}

function normalizeLemlist(payload: Record<string, unknown>): NormalizedPayload {
  return {
    event_type: String(payload.type || "unknown"),
    source_platform: "lemlist",
    reply_text: payload.replyText as string | undefined,
    email: payload.email as string | undefined,
    first_name: payload.firstName as string | undefined,
    last_name: payload.lastName as string | undefined,
    company: payload.companyName as string | undefined,
    campaign_id: payload.campaignId as string | undefined,
    campaign_name: payload.campaignName as string | undefined,
    linkedin_url: payload.linkedinUrl as string | undefined,
    received_at: new Date().toISOString(),
    original_payload: payload,
  };
}

function normalizeSmartLead(payload: Record<string, unknown>): NormalizedPayload {
  const lead = (payload.lead || payload) as Record<string, unknown>;
  return {
    event_type: String(payload.event_type || payload.type || "unknown"),
    source_platform: "smartlead",
    reply_text:
      ((payload.reply as Record<string, unknown>)?.text as string) ||
      (payload.reply_text as string) ||
      (payload.body as string),
    email: (lead.email as string) || undefined,
    first_name: (lead.first_name || lead.firstName) as string | undefined,
    last_name: (lead.last_name || lead.lastName) as string | undefined,
    company: (lead.company_name || lead.companyName) as string | undefined,
    campaign_id: (payload.campaign_id || lead.campaign_id) as string | undefined,
    campaign_name: payload.campaign_name as string | undefined,
    received_at: new Date().toISOString(),
    original_payload: payload,
  };
}

function normalizeHeyReach(payload: Record<string, unknown>): NormalizedPayload {
  const lead = (payload.lead || payload.contact || payload) as Record<string, unknown>;
  return {
    event_type: String(payload.event || payload.type || "unknown"),
    source_platform: "heyreach",
    reply_text:
      ((payload.message as Record<string, unknown>)?.body as string) ||
      (payload.reply_text as string) ||
      (payload.body as string),
    email: (lead.email as string) || undefined,
    first_name: (lead.firstName || lead.first_name) as string | undefined,
    last_name: (lead.lastName || lead.last_name) as string | undefined,
    company: (lead.companyName || lead.company) as string | undefined,
    campaign_id: (payload.campaignId || payload.campaign_id) as string | undefined,
    campaign_name: payload.campaignName as string | undefined,
    linkedin_url: (lead.linkedinUrl || lead.linkedin_url) as string | undefined,
    received_at: new Date().toISOString(),
    original_payload: payload,
  };
}

function normalizeInstantly(payload: Record<string, unknown>): NormalizedPayload {
  return {
    event_type: String(payload.event_type || payload.type || "unknown"),
    source_platform: "instantly",
    reply_text: (payload.reply_text || payload.body) as string | undefined,
    email: payload.email as string | undefined,
    first_name: payload.first_name as string | undefined,
    last_name: payload.last_name as string | undefined,
    company: payload.company as string | undefined,
    campaign_id: payload.campaign_id as string | undefined,
    campaign_name: payload.campaign_name as string | undefined,
    received_at: new Date().toISOString(),
    original_payload: payload,
  };
}

const normalizers: Record<string, (p: Record<string, unknown>) => NormalizedPayload> = {
  lemlist: normalizeLemlist,
  smartlead: normalizeSmartLead,
  heyreach: normalizeHeyReach,
  instantly: normalizeInstantly,
};

export async function POST(req: NextRequest) {
  try {
    const provider = req.nextUrl.searchParams.get("provider");
    if (!provider || !normalizers[provider]) {
      return NextResponse.json(
        { error: `Invalid provider. Use: ${Object.keys(normalizers).join(", ")}` },
        { status: 400 }
      );
    }

    // Optional: verify provider-specific secrets
    const secretEnvKey = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
    const expectedSecret = process.env[secretEnvKey];
    if (expectedSecret) {
      const headerSecret =
        req.headers.get(`x-${provider}-secret`) ||
        req.headers.get("x-webhook-secret") ||
        req.nextUrl.searchParams.get("secret");
      if (headerSecret !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const payload = await req.json();
    const normalized = normalizers[provider](payload);

    // Write to tamdb as source of truth
    const source = `cache:local:event_tamdb_write:event:${provider}-${Date.now()}`;
    const doc = { raw_payload: normalized };

    const rows = await writeQuery<{ row_id: string }>(
      `INSERT INTO dl_cache.enrichment_event (row_id, source, doc, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
       RETURNING row_id`,
      [source, JSON.stringify(doc)]
    );

    const rowId = rows[0]?.row_id;
    console.log(`[events/ingest] Wrote ${provider} event to tamdb: ${rowId}`);

    return NextResponse.json({ ok: true, row_id: rowId, provider });
  } catch (err) {
    console.error("[events/ingest] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
