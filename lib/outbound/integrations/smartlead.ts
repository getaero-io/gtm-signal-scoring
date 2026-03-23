/**
 * Outbound sequencing client — routes through Deepline unified API to Lemlist.
 *
 * Uses the same Deepline gateway (POST /api/v2/integrations/execute)
 * with provider: "lemlist".
 *
 * Confirmed operations via Deepline:
 *   - lemlist_list_campaigns
 *   - lemlist_add_to_campaign
 *   - lemlist_get_campaign_stats
 *
 * For reply sending (not yet enabled in Deepline), falls back to direct
 * Lemlist API at https://api.lemlist.com/api.
 *
 * Requires: DEEPLINE_API_KEY env var (shared with other Deepline calls).
 *           LEMLIST_API_KEY env var (for direct fallback only).
 */

const DEEPLINE_API_URL =
  "https://code.deepline.com/api/v2/integrations/execute";

const LEMLIST_API_BASE = "https://api.lemlist.com/api";

function getDeeplineApiKey(): string {
  const key = process.env.DEEPLINE_API_KEY;
  if (!key) throw new Error("DEEPLINE_API_KEY environment variable is not set");
  return key;
}

function getLemlistApiKey(): string {
  const key = process.env.LEMLIST_API_KEY;
  if (!key) throw new Error("LEMLIST_API_KEY environment variable is not set");
  return key;
}

interface DeeplineResponse<T = unknown> {
  result: T;
}

async function deeplineLemlist<T = unknown>(
  operation: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(DEEPLINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeeplineApiKey()}`,
    },
    body: JSON.stringify({
      provider: "lemlist",
      operation,
      payload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(
      `Deepline/Lemlist error: ${res.status} ${res.statusText} — ${body.slice(0, 300)} (${operation})`
    );
  }

  const json = (await res.json()) as DeeplineResponse<T>;
  return json.result;
}

/**
 * Direct Lemlist API call (fallback for operations not yet in Deepline).
 * Lemlist uses basic auth: API key as username, empty password.
 */
async function lemlistDirect<T = unknown>(
  path: string,
  opts?: RequestInit
): Promise<T> {
  const apiKey = getLemlistApiKey();
  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");

  const res = await fetch(`${LEMLIST_API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
      ...opts?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(
      `Lemlist API error: ${res.status} ${res.statusText} — ${body.slice(0, 300)} (${opts?.method ?? "GET"} ${path})`
    );
  }

  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all campaigns in Lemlist.
 */
export async function listCampaigns(): Promise<
  { _id: string; name: string }[]
> {
  return deeplineLemlist<{ _id: string; name: string }[]>(
    "lemlist_list_campaigns",
    {}
  );
}

/**
 * Add a lead to a Lemlist campaign (via Deepline).
 */
export async function addToNurtureCampaign(opts: {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  campaignSlug: string;
}): Promise<{ pushed: number; failed: number }> {
  const result = await deeplineLemlist<{
    data: { pushed: number; failed: number };
  }>("lemlist_add_to_campaign", {
    campaign_id: opts.campaignSlug,
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
  campaignId: string
): Promise<Record<string, unknown>> {
  return deeplineLemlist<Record<string, unknown>>(
    "lemlist_get_campaign_stats",
    { campaign_id: campaignId }
  );
}

/**
 * Send a reply to a lead in a campaign.
 *
 * Falls back to direct Lemlist API since reply sending
 * is not yet enabled in Deepline's Lemlist provider.
 */
export async function sendSmartLeadReply(opts: {
  leadId: string;
  message: string;
  campaignId: string;
}): Promise<void> {
  // Try Deepline first
  try {
    await deeplineLemlist("lemlist_send_email", {
      campaign_id: opts.campaignId,
      lead_id: opts.leadId,
      message: opts.message,
    });
    return;
  } catch (err) {
    // Deepline operation not yet available — fall back to direct API
    console.log(
      "[lemlist] Deepline send not available, falling back to direct API:",
      (err as Error).message
    );
  }

  // Direct Lemlist API fallback
  await lemlistDirect(
    `/campaigns/${opts.campaignId}/leads/${opts.leadId}/reply`,
    {
      method: "POST",
      body: JSON.stringify({ message: opts.message }),
    }
  );
}

/**
 * Send a LinkedIn reply to a lead in a campaign.
 *
 * Uses the Lemlist API to send a LinkedIn message. Lemlist handles
 * the LinkedIn connection — the API routes the reply through the
 * LinkedIn step associated with the campaign.
 */
export async function sendLinkedInReply(opts: {
  leadId: string;
  message: string;
  campaignId: string;
}): Promise<void> {
  // Try Deepline first
  try {
    await deeplineLemlist("lemlist_send_linkedin_message", {
      campaign_id: opts.campaignId,
      lead_id: opts.leadId,
      message: opts.message,
    });
    return;
  } catch (err) {
    console.log(
      "[lemlist] Deepline LinkedIn send not available, falling back to direct API:",
      (err as Error).message
    );
  }

  // Direct Lemlist API fallback — same endpoint, different channel indicator
  await lemlistDirect(
    `/campaigns/${opts.campaignId}/leads/${opts.leadId}/reply`,
    {
      method: "POST",
      body: JSON.stringify({ message: opts.message, channel: "linkedin" }),
    }
  );
}

/**
 * Get leads that have replied in a campaign.
 *
 * Falls back to direct Lemlist API since export is not yet
 * confirmed in Deepline's Lemlist provider.
 */
export async function getLeadReplies(
  campaignId: string
): Promise<unknown[]> {
  // Try Deepline first
  try {
    const result = await deeplineLemlist<unknown[]>(
      "lemlist_export_campaign_leads",
      { campaign_id: campaignId, status: "replied" }
    );
    return Array.isArray(result) ? result : [];
  } catch {
    // Fall back to direct Lemlist API
    console.log(
      "[lemlist] Deepline export not available, falling back to direct API"
    );
  }

  const data = await lemlistDirect<unknown[]>(
    `/campaigns/${campaignId}/export?status=replied`
  );

  if (!Array.isArray(data)) {
    throw new Error(
      `Lemlist: expected array of leads for campaign ${campaignId}, got ${typeof data}`
    );
  }

  return data;
}
