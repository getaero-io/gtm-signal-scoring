import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { loadConfig } from "../config/loader";
import type { AppConfig, RoutingRule } from "../config/types";
import { postMessage } from "../slack/client";
import { formatQualifiedLead } from "../slack/messages";
import { upsertAttioPerson, upsertAttioCompany } from "../integrations/attio";
import { addToCampaign, type OutboundProvider } from "../integrations/deepline-outbound";
import { upsertHubSpotContact, createHubSpotDeal, findHubSpotOwnerByEmail, findOrCreateHubSpotCompany } from "../integrations/hubspot";

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lead {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  company_domain: string | null;
  title: string | null;
  status: string;
  source: string | null;
  assigned_rep: string | null;
  attio_id: string | null;
  campaign_id: string | null;
  metadata: Record<string, unknown>;
}

interface QualificationResult {
  id: number;
  lead_id: number;
  rule_set: string;
  website_summary: string | null;
  product_description: string | null;
  score: number;
  passed: boolean;
  score_breakdown: Record<string, unknown>;
  flags: string[];
  llm_reasoning: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Round-robin rep assignment
// ---------------------------------------------------------------------------

async function getNextRep(config: AppConfig): Promise<{ name: string; slack_id: string; email?: string }> {
  const reps = config.routing.reps;
  if (!reps.length) throw new Error("No reps configured in routing rules");

  // Use an atomic counter in the routing_log to determine next rep
  // Count existing qualified assignments to determine round-robin position
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM inbound.routing_log WHERE action = 'qualified_to_rep'`
  );
  const totalAssignments = parseInt(result?.count || '0', 10);
  const rep = reps[totalAssignments % reps.length];
  return rep;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findRule(
  rules: RoutingRule[],
  name: string
): RoutingRule | undefined {
  return rules.find((r) => r.name === name);
}

function resolveChannel(
  rule: RoutingRule | undefined,
  config: AppConfig
): string {
  return (
    rule?.params?.slack_channel ||
    process.env.SLACK_CHANNEL_INBOUND ||
    config.routing.default_channel
  );
}

async function logRouting(
  leadId: number,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details) VALUES ($1, $2, $3)`,
    [leadId, action, JSON.stringify(details)]
  );
}

// ---------------------------------------------------------------------------
// Route: Qualified
// ---------------------------------------------------------------------------

async function routeQualified(
  lead: Lead,
  qualResult: QualificationResult,
  config: AppConfig
): Promise<void> {
  // 1. Assign rep via round-robin
  const rep = await getNextRep(config);

  // 2. Update lead.assigned_rep and status in DB
  await writeQuery(
    `UPDATE inbound.leads SET assigned_rep = $1, status = 'qualified', updated_at = NOW() WHERE id = $2`,
    [rep.name, lead.id]
  );

  // 3. Resolve Slack channel from routing rule
  const rule = findRule(config.routing.rules, "qualified_to_rep");
  const channel = resolveChannel(rule, config);

  // 4. Format and send Slack message
  const { text, blocks } = formatQualifiedLead({
    leadName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown",
    companyName: lead.company_name || "Unknown",
    companyDomain: lead.company_domain || "unknown",
    productDescription: qualResult.product_description || "N/A",
    score: qualResult.score,
    assignedRep: rep.name,
    fitSummary: qualResult.llm_reasoning || "No summary available",
    flags: qualResult.flags ?? [],
    leadId: lead.id,
  });

  const slackResult = await postMessage({ channel, text, blocks });

  // 5. Upsert person in Attio (only if we have an email)
  let attioId = lead.attio_id;
  if (lead.email) {
    const attioResult = await upsertAttioPerson({
      email: lead.email,
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
      companyDomain: lead.company_domain || undefined,
      jobTitle: lead.title || undefined,
      customAttributes: {
        lead_status: [{ option: "qualified" }],
        qualification_score: [{ value: qualResult.score }],
      },
    });
    attioId = attioResult.recordId;
  }

  // 5b. Upsert company in Attio (if we have a domain)
  if (lead.company_domain) {
    await upsertAttioCompany({
      domain: lead.company_domain,
      name: lead.company_name || lead.company_domain,
      customAttributes: {
        qualification_score: [{ value: qualResult.score }],
        lead_status: [{ option: "qualified" }],
      },
    }).catch((err) => console.warn('[router] Attio company upsert failed:', err));
  }

  // 6. Upsert contact in HubSpot (non-blocking)
  let hubspotId: string | null = null;
  if (lead.email) {
    const hsResult = await upsertHubSpotContact({
      email: lead.email,
      firstName: lead.first_name || undefined,
      lastName: lead.last_name || undefined,
      company: lead.company_name || undefined,
      jobTitle: lead.title || undefined,
      leadStatus: 'OPEN',
      qualificationScore: qualResult.score,
      source: 'gtm-signal-scoring',
    });
    hubspotId = hsResult?.contactId ?? null;
  }

  // 6b. Create HubSpot deal associated with contact + company
  let hubspotDealId: string | null = null;
  if (hubspotId) {
    const companyId = lead.company_domain
      ? await findOrCreateHubSpotCompany(lead.company_domain, lead.company_name || undefined)
      : null;

    const hubspotConfig = config.routing.hubspot;
    const ownerEmail = rep.email;
    const ownerId = ownerEmail ? await findHubSpotOwnerByEmail(ownerEmail) : null;

    hubspotDealId = await createHubSpotDeal({
      contactId: hubspotId,
      companyId: companyId ?? undefined,
      dealName: `${lead.company_name || lead.first_name || 'Lead'} — Inbound Qualified`,
      pipeline: hubspotConfig?.pipeline_id || 'default',
      stage: hubspotConfig?.stages?.qualified || 'qualifiedtobuy',
      ownerId: ownerId ?? undefined,
      properties: {
        gtm_qualification_score: String(qualResult.score),
        gtm_lead_source: lead.source || 'unknown',
      },
    });

    if (hubspotDealId) {
      await writeQuery(
        `UPDATE inbound.leads SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{hubspot_deal_id}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(hubspotDealId), lead.id]
      ).catch(() => {});
    }
  }

  // 7. Store attio_id and hubspot_id on lead
  await writeQuery(
    `UPDATE inbound.leads SET attio_id = COALESCE($1, attio_id), hubspot_id = COALESCE($2, hubspot_id), updated_at = NOW() WHERE id = $3`,
    [attioId !== lead.attio_id ? attioId : null, hubspotId, lead.id]
  );

  // 8. Log to routing_log
  await logRouting(lead.id, "qualified_to_rep", {
    rep: rep.name,
    rep_slack_id: rep.slack_id,
    channel,
    slack_ts: slackResult.ts,
    qualification_score: qualResult.score,
    attio_id: attioId,
    hubspot_id: hubspotId,
    hubspot_deal_id: hubspotDealId,
  });
}

// ---------------------------------------------------------------------------
// Route: Nurture
// ---------------------------------------------------------------------------

async function routeNurture(
  lead: Lead,
  qualResult: QualificationResult,
  config: AppConfig
): Promise<void> {
  // 1. Find nurture routing rule, provider, and campaign slug
  const rule = findRule(config.routing.rules, "nurture_to_campaign");
  const provider: OutboundProvider =
    (rule?.params?.provider as OutboundProvider) || "lemlist";
  const campaignSlug =
    rule?.params?.campaign_id || rule?.params?.lemlist_campaign || "default-nurture";

  // 2. Add lead to nurture campaign via Deepline (if email exists)
  let campaignId = lead.campaign_id;
  if (lead.email) {
    await addToCampaign(provider, {
      email: lead.email,
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
      companyName: lead.company_name || "",
      campaignId: campaignSlug,
    });
    campaignId = campaignSlug;
  }

  // 3. Upsert person in Attio with nurture status
  let attioId = lead.attio_id;
  if (lead.email) {
    const attioResult = await upsertAttioPerson({
      email: lead.email,
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
      companyDomain: lead.company_domain || undefined,
      customAttributes: {
        lead_status: [{ option: "nurture" }],
        qualification_score: [{ value: qualResult.score }],
        nurture_campaign: [{ value: campaignSlug }],
      },
    });
    attioId = attioResult.recordId;
  }

  // 3b. Upsert company in Attio (if we have a domain)
  if (lead.company_domain) {
    await upsertAttioCompany({
      domain: lead.company_domain,
      name: lead.company_name || lead.company_domain,
      customAttributes: {
        qualification_score: [{ value: qualResult.score }],
        lead_status: [{ option: "nurture" }],
      },
    }).catch((err) => console.warn('[router] Attio company upsert failed:', err));
  }

  // 4. Upsert contact in HubSpot (non-blocking)
  let hubspotId: string | null = null;
  if (lead.email) {
    const hsResult = await upsertHubSpotContact({
      email: lead.email,
      firstName: lead.first_name || undefined,
      lastName: lead.last_name || undefined,
      company: lead.company_name || undefined,
      jobTitle: lead.title || undefined,
      leadStatus: 'ATTEMPTED_TO_CONTACT',
      qualificationScore: qualResult.score,
      source: 'gtm-signal-scoring',
    });
    hubspotId = hsResult?.contactId ?? null;
  }

  // 4b. Create HubSpot deal for nurture leads
  let hubspotDealId: string | null = null;
  if (hubspotId) {
    const companyId = lead.company_domain
      ? await findOrCreateHubSpotCompany(lead.company_domain, lead.company_name || undefined)
      : null;

    const hubspotConfig = config.routing.hubspot;

    hubspotDealId = await createHubSpotDeal({
      contactId: hubspotId,
      companyId: companyId ?? undefined,
      dealName: `${lead.company_name || lead.first_name || 'Lead'} — Nurture`,
      pipeline: hubspotConfig?.pipeline_id || 'default',
      stage: hubspotConfig?.stages?.nurture || 'appointmentscheduled',
      properties: {
        gtm_qualification_score: String(qualResult.score),
        gtm_lead_source: lead.source || 'unknown',
      },
    });

    if (hubspotDealId) {
      await writeQuery(
        `UPDATE inbound.leads SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{hubspot_deal_id}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(hubspotDealId), lead.id]
      ).catch(() => {});
    }
  }

  // 5. Store attio_id, hubspot_id, and campaign_id on lead
  await writeQuery(
    `UPDATE inbound.leads SET attio_id = COALESCE($1, attio_id), hubspot_id = COALESCE($2, hubspot_id), campaign_id = COALESCE($3, campaign_id), status = 'nurture', updated_at = NOW() WHERE id = $4`,
    [attioId, hubspotId, campaignId, lead.id]
  );

  // 6. Log to routing_log
  await logRouting(lead.id, "nurture_to_campaign", {
    campaign_slug: campaignSlug,
    campaign_id: campaignId,
    qualification_score: qualResult.score,
    attio_id: attioId,
    hubspot_id: hubspotId,
    hubspot_deal_id: hubspotDealId,
    has_email: !!lead.email,
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function routeLead(leadId: number): Promise<void> {
  const config = loadConfig();

  const lead = await queryOne<Lead>(
    `SELECT id, first_name, last_name, email, company_name, company_domain, title, status, source, assigned_rep, attio_id, campaign_id, metadata FROM inbound.leads WHERE id = $1`,
    [leadId]
  );

  if (!lead) {
    throw new Error(`routeLead: lead ${leadId} not found`);
  }

  const qualResult = await queryOne<QualificationResult>(
    `SELECT id, lead_id, rule_set, website_summary, product_description, score, passed, score_breakdown, flags, llm_reasoning, created_at FROM inbound.qualification_results WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadId]
  );

  if (!qualResult) {
    throw new Error(
      `routeLead: no qualification result found for lead ${leadId}`
    );
  }

  if (qualResult.passed) {
    await routeQualified(lead, qualResult, config);
  } else {
    await routeNurture(lead, qualResult, config);
  }
}
