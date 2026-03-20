import { query } from '@/lib/db';
import { Account, Contact } from '@/types/accounts';
import { calculateAtlasScore, generate30DayTrend, detectSignals } from '@/lib/scoring/engine';
import { determineSeniority, isP0Contact } from '@/lib/scoring/p0-detection';

interface DomainAggregate {
  domain: string;
  brand_name: string | null;
  record_count: string;
  valid_business_email_count: string;
  valid_free_email_count: string;
  mx_found: boolean;
  updated_at: string;
  created_at: string;
}

interface PersonRecord {
  id: string;
  provider: string;
  identity_payload: Record<string, any>;
  raw_payload: Record<string, any>;
  created_at: string;
}

const DOMAIN_AGG_CTE = `
  WITH domain_records AS (
    SELECT
      jsonb_array_elements_text(identity_payload->'domain') AS domain,
      id,
      provider,
      identity_payload,
      raw_payload,
      created_at
    FROM dl_resolved.resolved_people
    WHERE is_match = true AND identity_payload ? 'domain'
  ),
  domain_agg AS (
    SELECT
      domain,
      MAX(raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'brand_name') AS brand_name,
      COUNT(*) AS record_count,
      COUNT(*) FILTER (
        WHERE provider = 'zerobounce'
          AND raw_payload->'result'->>'status' = 'valid'
          AND (raw_payload->'result'->>'free_email') = 'false'
      ) AS valid_business_email_count,
      COUNT(*) FILTER (
        WHERE provider = 'zerobounce'
          AND raw_payload->'result'->>'status' = 'valid'
          AND (raw_payload->'result'->>'free_email') = 'true'
      ) AS valid_free_email_count,
      BOOL_OR(
        provider = 'zerobounce' AND (raw_payload->'result'->>'mx_found') = 'true'
      ) AS mx_found,
      MAX(created_at) AS updated_at,
      MIN(created_at) AS created_at
    FROM domain_records
    GROUP BY domain
  )
`;

export async function getAccounts(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ accounts: Account[]; total: number }> {
  const { search = '', limit = 50, offset = 0 } = params;
  const searchParam = `%${search}%`;

  const domains = await query<DomainAggregate>(
    `${DOMAIN_AGG_CTE}
    SELECT * FROM domain_agg
    WHERE LOWER(domain) LIKE LOWER($1) OR LOWER(COALESCE(brand_name, '')) LIKE LOWER($1)
    ORDER BY valid_business_email_count DESC, valid_free_email_count DESC, updated_at DESC
    LIMIT $2 OFFSET $3`,
    [searchParam, limit, offset]
  );

  const countResult = await query<{ total: string }>(
    `${DOMAIN_AGG_CTE}
    SELECT COUNT(*) AS total FROM domain_agg
    WHERE LOWER(domain) LIKE LOWER($1) OR LOWER(COALESCE(brand_name, '')) LIKE LOWER($1)`,
    [searchParam]
  );
  const total = parseInt(countResult[0]?.total || '0');

  const accounts = domains.map(d => transformDomainToAccount(d, []));
  return { accounts, total };
}

export async function getAccountById(id: string): Promise<Account | null> {
  const domain = decodeURIComponent(id);

  const domains = await query<DomainAggregate>(
    `${DOMAIN_AGG_CTE}
    SELECT * FROM domain_agg WHERE domain = $1`,
    [domain]
  );

  if (domains.length === 0) return null;

  const contacts = await getContactsForDomain(domain);
  return transformDomainToAccount(domains[0], contacts);
}

export async function getAccountSignals(account: Account) {
  // Fetch raw email counts directly from DB for accurate signal descriptions
  const rows = await query<{ valid_business: string; valid_free: string; mx: boolean }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload->'result'->>'status' = 'valid'
           AND (raw_payload->'result'->>'free_email') = 'false'
       ) AS valid_business,
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload->'result'->>'status' = 'valid'
           AND (raw_payload->'result'->>'free_email') = 'true'
       ) AS valid_free,
       BOOL_OR(
         provider = 'zerobounce' AND (raw_payload->'result'->>'mx_found') = 'true'
       ) AS mx
     FROM dl_resolved.resolved_people
     WHERE is_match = true
       AND identity_payload->'domain' @> jsonb_build_array($1::text)`,
    [account.id]
  );

  const row = rows[0];
  return detectSignals({
    contacts: account.key_contacts,
    validBusinessEmails: parseInt(row?.valid_business || '0'),
    validFreeEmails: parseInt(row?.valid_free || '0'),
    mxFound: row?.mx ?? false,
    accountId: account.id,
    enrichedAt: account.updated_at,
  });
}

function transformDomainToAccount(agg: DomainAggregate, contacts: Contact[]): Account {
  const name = agg.brand_name || agg.domain;
  const validBusinessEmails = parseInt(agg.valid_business_email_count || '0');
  const validFreeEmails = parseInt(agg.valid_free_email_count || '0');
  const mxFound = agg.mx_found ?? false;

  const scoreBreakdown = calculateAtlasScore({
    contacts,
    validBusinessEmails,
    validFreeEmails,
    mxFound,
  });

  const trend30d = generate30DayTrend({
    enrichedAt: agg.created_at,
    currentScore: scoreBreakdown.total,
  });

  const p0Count = contacts.filter(c => c.is_p0).length;

  return {
    id: agg.domain,
    name,
    domain: agg.domain,
    industry: undefined,
    logo_url: undefined,
    atlas_score: scoreBreakdown.total,
    score_breakdown: scoreBreakdown,
    trend_30d: trend30d,
    p0_penetration: {
      current: p0Count,
      total: contacts.length,
    },
    tech_stack: [],
    key_contacts:
      p0Count > 0
        ? contacts.filter(c => c.is_p0)
        : contacts.slice(0, 3),
    created_at: agg.created_at,
    updated_at: agg.updated_at,
  };
}

async function getContactsForDomain(domain: string): Promise<Contact[]> {
  const records = await query<PersonRecord>(
    `SELECT id, provider, identity_payload, raw_payload, created_at
     FROM dl_resolved.resolved_people
     WHERE is_match = true
       AND identity_payload->'domain' @> jsonb_build_array($1::text)`,
    [domain]
  );

  const contacts: Contact[] = [];
  const seenEmails = new Set<string>();

  for (const record of records) {
    const contact = extractContactFromRecord(record, domain);
    if (!contact) continue;

    if (contact.email) {
      if (seenEmails.has(contact.email)) continue;
      seenEmails.add(contact.email);
    }

    contacts.push(contact);
  }

  return contacts;
}

function extractContactFromRecord(record: PersonRecord, domain: string): Contact | null {
  const identityPayload = record.identity_payload || {};
  const rawPayload = record.raw_payload || {};
  const result = rawPayload.result || {};
  const context = rawPayload.__deepline_identity?.context_cols_from_enrich || {};

  const email = identityPayload.email?.[0];

  const firstName =
    result.firstname ||
    result.first_name ||
    result.firstName ||
    context.first_name ||
    '';
  const lastName =
    result.lastname ||
    result.last_name ||
    result.lastName ||
    context.last_name ||
    '';
  const fullName =
    `${firstName} ${lastName}`.trim() ||
    identityPayload.person_name?.[0] ||
    (email ? email.split('@')[0] : '');

  if (!email && !fullName) return null;

  const title =
    context.grok_founder_title ||
    result.title ||
    identityPayload.title?.[0];

  const seniority = determineSeniority(title);
  const is_p0 = isP0Contact(title, undefined);

  return {
    id: record.id,
    account_id: domain,
    full_name: fullName || 'Unknown',
    email,
    title,
    seniority,
    is_p0,
    linkedin_url: identityPayload.linkedin?.[0],
  };
}
