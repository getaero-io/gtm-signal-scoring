import { query } from '@/lib/db';
import { writeQuery } from '@/lib/db-write';
import { InboundLead, InboundFormPayload, EnrichmentResult, RoutingTraceStep } from '@/types/inbound';
import { enrichDomainFromExa } from '@/lib/ai/exa';

export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export async function enrichDomainFromNeon(domain: string): Promise<EnrichmentResult | null> {
  const rows = await query<{
    valid_business: string;
    valid_free: string;
    mx: boolean;
    contacts: any[];
  }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload::jsonb->'result'->>'status' = 'valid'
           AND (raw_payload::jsonb->'result'->>'free_email') = 'false'
       ) AS valid_business,
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload::jsonb->'result'->>'status' = 'valid'
           AND (raw_payload::jsonb->'result'->>'free_email') = 'true'
       ) AS valid_free,
       BOOL_OR(
         provider = 'zerobounce' AND (raw_payload::jsonb->'result'->>'mx_found') = 'true'
       ) AS mx,
       json_agg(json_build_object(
         'full_name', COALESCE(
           raw_payload::jsonb->'result'->>'firstname' || ' ' || raw_payload::jsonb->'result'->>'lastname',
           identity_payload::jsonb->'person_name'->>0,
           ''
         ),
         'email', identity_payload::jsonb->'email'->>0,
         'title', COALESCE(
           raw_payload::jsonb->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title',
           raw_payload::jsonb->'result'->>'title'
         ),
         'is_p0', (
           raw_payload::jsonb->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title' IS NOT NULL
           AND raw_payload::jsonb->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title' != ''
         )
       )) FILTER (WHERE identity_payload::jsonb->'email'->>0 IS NOT NULL) AS contacts
     FROM dl_resolved.resolved_people
     WHERE is_match = true
       AND identity_payload::jsonb->'domain' @> jsonb_build_array($1::text)`,
    [domain]
  );

  if (!rows[0]) return null;

  const row = rows[0];
  const validBusiness = parseInt(row.valid_business || '0');
  const validFree = parseInt(row.valid_free || '0');
  const mxFound = row.mx ?? false;
  const contacts = (row.contacts || []).filter((c: any) => c.full_name?.trim());

  if (validBusiness === 0 && validFree === 0 && contacts.length === 0) {
    // Neon has no data for this domain — try Exa web research
    return enrichDomainFromExa(domain);
  }

  const emailQuality = Math.min(40, validBusiness * 40 + validFree * 20);
  const namedContacts = contacts.filter((c: any) => c.full_name && c.full_name.trim() && !c.full_name.includes('@'));
  const contactIdentity = Math.min(15, namedContacts.length * 15);
  const founders = contacts.filter((c: any) => c.is_p0);
  const founderMatch = Math.min(20, founders.length * 20);
  const dataCoverage = mxFound ? 5 : 0;
  const atlasScore = Math.min(100, 20 + emailQuality + contactIdentity + founderMatch + dataCoverage);

  return {
    atlas_score: Math.round(atlasScore),
    email_quality: Math.round(emailQuality),
    founder_match: Math.round(founderMatch),
    contact_identity: Math.round(contactIdentity),
    is_founder_detected: founders.length > 0,
    valid_business_emails: validBusiness,
    valid_free_emails: validFree,
    mx_found: mxFound,
    contacts: contacts.slice(0, 5),
  };
}

export async function createLead(
  payload: InboundFormPayload,
  enrichment?: EnrichmentResult | null
): Promise<InboundLead> {
  const domain = extractDomain(payload.email);

  const rows = await writeQuery<InboundLead>(
    `INSERT INTO inbound.leads (
       full_name, email, company, domain, message, source,
       atlas_score, email_quality, founder_match, contact_identity,
       is_founder_detected, valid_business_emails, valid_free_emails,
       mx_found, enrichment_data, enriched_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::int,$8::int,$9::int,$10::int,$11::boolean,$12::int,$13::int,$14::boolean,$15::jsonb,
       CASE WHEN $7 IS NOT NULL THEN now() ELSE NULL END
     ) RETURNING *`,
    [
      payload.full_name,
      payload.email,
      payload.company || null,
      domain,
      payload.message || null,
      payload.source || 'form',
      enrichment?.atlas_score ?? null,
      enrichment?.email_quality ?? null,
      enrichment?.founder_match ?? null,
      enrichment?.contact_identity ?? null,
      enrichment?.is_founder_detected ?? false,
      enrichment?.valid_business_emails ?? 0,
      enrichment?.valid_free_emails ?? 0,
      enrichment?.mx_found ?? false,
      enrichment ? JSON.stringify(enrichment) : null,
    ]
  );

  return rows[0];
}

export async function updateLeadRouting(
  leadId: string,
  params: {
    assigned_rep_id?: string;
    routing_path: RoutingTraceStep[];
    status: string;
  }
): Promise<void> {
  await writeQuery(
    `UPDATE inbound.leads SET
       assigned_rep_id = $2,
       routing_path = $3,
       status = $4,
       routed_at = now()
     WHERE id = $1`,
    [
      leadId,
      params.assigned_rep_id || null,
      JSON.stringify(params.routing_path),
      params.status,
    ]
  );
}

export async function getLeads(limit = 50, offset = 0): Promise<{ leads: InboundLead[]; total: number }> {
  const [rows, countRows] = await Promise.all([
    writeQuery<InboundLead>(
      `SELECT l.*, row_to_json(r.*) as assigned_rep
       FROM inbound.leads l
       LEFT JOIN inbound.reps r ON r.id = l.assigned_rep_id
       ORDER BY l.submitted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    writeQuery<{ total: string }>('SELECT COUNT(*) as total FROM inbound.leads'),
  ]);

  return {
    leads: rows,
    total: parseInt(countRows[0]?.total || '0'),
  };
}

export async function getLeadById(id: string): Promise<InboundLead | null> {
  const rows = await writeQuery<InboundLead>(
    `SELECT l.*, row_to_json(r.*) as assigned_rep
     FROM inbound.leads l
     LEFT JOIN inbound.reps r ON r.id = l.assigned_rep_id
     WHERE l.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function logEmail(params: {
  lead_id: string;
  to_email: string;
  subject: string;
  body: string;
  template: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  await writeQuery(
    `INSERT INTO inbound.email_logs (lead_id, to_email, subject, body, template, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.lead_id, params.to_email, params.subject, params.body, params.template, params.status]
  );
}

export async function getEmailLogs(leadId: string) {
  return writeQuery(
    `SELECT * FROM inbound.email_logs WHERE lead_id = $1 ORDER BY sent_at DESC`,
    [leadId]
  );
}
