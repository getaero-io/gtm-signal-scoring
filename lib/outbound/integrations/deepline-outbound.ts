/**
 * Unified Outbound Client — routes all sequencing through Deepline's gateway.
 *
 * Supports multiple providers: lemlist, smartlead, instantly, heyreach.
 * Each provider uses the same Deepline API (POST /api/v2/integrations/execute)
 * with provider-specific operation names.
 *
 * Provider operation naming convention:
 *   {provider}_list_campaigns
 *   {provider}_add_to_campaign
 *   {provider}_get_campaign_stats
 *   {provider}_send_email
 *   {provider}_send_linkedin_message
 *   {provider}_export_campaign_leads
 *
 * Requires: DEEPLINE_API_KEY env var.
 */

const DEEPLINE_API_URL =
  "https://code.deepline.com/api/v2/integrations/execute";

export type OutboundProvider = "lemlist" | "smartlead" | "instantly" | "heyreach";

export type ReplyChannel = "email" | "linkedin";

function getDeeplineApiKey(): string {
  const key = process.env.DEEPLINE_API_KEY;
  if (!key) throw new Error("DEEPLINE_API_KEY environment variable is not set");
  return key;
}

interface DeeplineResponse<T = unknown> {
  result: T;
}

// ---------------------------------------------------------------------------
// Core Deepline call
// ---------------------------------------------------------------------------

async function deeplineCall<T = unknown>(
  provider: OutboundProvider,
  operation: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(DEEPLINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeeplineApiKey()}`,
    },
    body: JSON.stringify({ provider, operation, payload }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(
      `Deepline/${provider} error: ${res.status} ${res.statusText} — ${body.slice(0, 300)} (${operation})`
    );
  }

  const json = (await res.json()) as DeeplineResponse<T>;
  return json.result;
}

// ---------------------------------------------------------------------------
// Operation name builder
// ---------------------------------------------------------------------------

function op(provider: OutboundProvider, action: string): string {
  return `${provider}_${action}`;
}

// ---------------------------------------------------------------------------
// Public API — provider-agnostic
// ---------------------------------------------------------------------------

/**
 * List all campaigns for a given provider.
 */
export async function listCampaigns(
  provider: OutboundProvider
): Promise<{ _id: string; name: string }[]> {
  return deeplineCall<{ _id: string; name: string }[]>(
    provider,
    op(provider, "list_campaigns"),
    {}
  );
}

/**
 * Add a lead to a campaign.
 */
export async function addToCampaign(
  provider: OutboundProvider,
  opts: {
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
    campaignId: string;
  }
): Promise<{ pushed: number; failed: number }> {
  const result = await deeplineCall<{
    data: { pushed: number; failed: number };
  }>(provider, op(provider, "add_to_campaign"), {
    campaign_id: opts.campaignId,
    contacts: [
      {
        email: opts.email,
        first_name: opts.firstName,
        last_name: opts.lastName,
        company: opts.companyName,
      },
    ],
  });

  return result.data;
}

/**
 * Get campaign statistics.
 */
export async function getCampaignStats(
  provider: OutboundProvider,
  campaignId: string
): Promise<Record<string, unknown>> {
  return deeplineCall<Record<string, unknown>>(
    provider,
    op(provider, "get_campaign_stats"),
    { campaign_id: campaignId }
  );
}

/**
 * Send a reply to a lead in a campaign.
 * Routes through the correct Deepline operation based on channel.
 */
export async function sendReply(
  provider: OutboundProvider,
  opts: {
    leadId: string;
    message: string;
    campaignId: string;
    channel: ReplyChannel;
  }
): Promise<void> {
  const action =
    opts.channel === "linkedin" ? "send_linkedin_message" : "send_email";

  await deeplineCall(provider, op(provider, action), {
    campaign_id: opts.campaignId,
    lead_id: opts.leadId,
    message: opts.message,
  });
}

/**
 * Get leads that have replied in a campaign.
 *
 * Uses list_campaign_leads (returns structured JSON) instead of
 * export_campaign_leads (returns CSV text).
 * Paginates through all replied leads and flattens the nested lead object.
 */
export async function getLeadReplies(
  provider: OutboundProvider,
  campaignId: string
): Promise<unknown[]> {
  const all: unknown[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const result = await deeplineCall<{ data?: unknown[] }>(
      provider,
      op(provider, "list_campaign_leads"),
      { campaign_id: campaignId, status: "REPLIED", limit, offset }
    );
    const items = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    if (items.length === 0) break;

    for (const item of items as Record<string, unknown>[]) {
      const lead = (item.lead ?? {}) as Record<string, unknown>;
      // Flatten the nested structure so consumers see top-level fields
      all.push({
        ...lead,
        id: lead.id,
        lead_id: lead.id,
        smartlead_lead_id: lead.id,
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company_name: lead.company_name,
        companyName: lead.company_name,
        status: (item as Record<string, unknown>).status,
        campaign_lead_map_id: (item as Record<string, unknown>).campaign_lead_map_id,
      });
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Convenience: resolve provider from conversation metadata
// ---------------------------------------------------------------------------

/**
 * Determine the outbound provider from conversation metadata.
 * Falls back to 'lemlist' for backwards compatibility.
 */
export function resolveProvider(
  metadata: Record<string, unknown>
): OutboundProvider {
  const provider = metadata.provider as string | undefined;
  if (
    provider === "lemlist" ||
    provider === "smartlead" ||
    provider === "instantly" ||
    provider === "heyreach"
  ) {
    return provider;
  }
  // Legacy: infer from metadata keys
  if (metadata.smartlead_lead_id) return "smartlead";
  if (metadata.instantly_lead_id) return "instantly";
  if (metadata.heyreach_lead_id) return "heyreach";
  return "lemlist";
}

/**
 * Normalize channel string to ReplyChannel type.
 * 'linkedin' stays 'linkedin', everything else becomes 'email'.
 */
export function normalizeChannel(channel: string | undefined): ReplyChannel {
  return channel === "linkedin" ? "linkedin" : "email";
}
