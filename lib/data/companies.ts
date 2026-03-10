import { query } from '@/lib/db';
import { DBCompany, DBPerson } from '@/types/database';
import { Account, Contact, TechStackItem } from '@/types/accounts';
import { calculateAtlasScore, generate30DayTrend, detectSignals } from '@/lib/scoring/engine';
import { determineSeniority, isP0Contact } from '@/lib/scoring/p0-detection';

export async function getAccounts(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ accounts: Account[]; total: number }> {
  const { search = '', limit = 50, offset = 0 } = params;

  let sql = `
    SELECT id, display_name, identity_payload, raw_payload, created_at, updated_at
    FROM dl_resolved.resolved_companies
    WHERE is_match = true
  `;

  const queryParams: any[] = [];

  if (search) {
    sql += ` AND LOWER(display_name) LIKE LOWER($${queryParams.length + 1})`;
    queryParams.push(`%${search}%`);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
  queryParams.push(limit, offset);

  const companies = await query<DBCompany>(sql, queryParams);

  const accounts = await Promise.all(
    companies.map(company => transformCompanyToAccount(company))
  );

  let countSql = `SELECT COUNT(*) as total FROM dl_resolved.resolved_companies WHERE is_match = true`;
  const countParams: any[] = [];
  if (search) {
    countSql += ` AND LOWER(display_name) LIKE LOWER($1)`;
    countParams.push(`%${search}%`);
  }
  const countResult = await query<{ total: string }>(countSql, countParams);
  const total = parseInt(countResult[0]?.total || '0');

  return { accounts, total };
}

export async function getAccountById(id: string): Promise<Account | null> {
  const companies = await query<DBCompany>(
    `SELECT * FROM dl_resolved.resolved_companies WHERE id = $1`,
    [id]
  );

  if (companies.length === 0) return null;

  return transformCompanyToAccount(companies[0]);
}

export async function getAccountSignals(account: Account) {
  return detectSignals({
    techStack: account.tech_stack,
    contacts: account.key_contacts,
  });
}

async function transformCompanyToAccount(company: DBCompany): Promise<Account> {
  const rawPayload = company.raw_payload || {};

  // Apollo enrichment data
  const org = rawPayload.result?.data?.organization || {};

  const identityPayload = company.identity_payload || {};
  const domain =
    identityPayload.domain?.[0] ||
    org.primary_domain ||
    (org.website_url as string | undefined)?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const industry = org.industry || org.industries?.[0];
  const employeeCount: number | undefined = org.estimated_num_employees;

  // Tech stack from Apollo enrichment (observed data)
  const techStack = getTechStackFromApollo(company.id, org);

  // Contacts from resolved_people
  const contacts = await getContactsForCompany(company.id);

  // Atlas scoring
  const scoreBreakdown = calculateAtlasScore({ techStack, contacts, employeeCount });

  // 30-day trend (derived from tech adoption dates; Apollo data has no dates so marked derived)
  const trend30d = generate30DayTrend({ techStack, currentScore: scoreBreakdown.total });

  const p0Count = contacts.filter(c => c.is_p0).length;

  return {
    id: company.id,
    name: company.display_name || org.name || 'Unknown Company',
    domain,
    industry,
    logo_url: org.logo_url,
    atlas_score: scoreBreakdown.total,
    score_breakdown: scoreBreakdown,
    trend_30d: trend30d,
    p0_penetration: {
      current: p0Count,
      total: contacts.length,
    },
    tech_stack: techStack,
    key_contacts: contacts.filter(c => c.is_p0),
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}

function getTechStackFromApollo(companyId: string, org: any): TechStackItem[] {
  const technologies: any[] = org.current_technologies || [];
  // Apollo data has no adoption date — use company updated_at as proxy, marked as observed
  const adoptedAt = new Date().toISOString();

  return technologies.map((tech: any, index: number) => ({
    id: `apollo-${companyId}-${index}`,
    account_id: companyId,
    name: tech.name || tech,
    category: tech.category,
    source: 'Apollo (observed)',
    adopted_at: adoptedAt,
  }));
}

async function getContactsForCompany(companyId: string): Promise<Contact[]> {
  // Use super_company_id to link people to companies
  const people = await query<DBPerson>(
    `SELECT * FROM dl_resolved.resolved_people WHERE super_company_id = $1 AND is_match = true`,
    [companyId]
  );

  return people.map(person => {
    const rawPayload = person.raw_payload || {};
    const identityPayload = person.identity_payload || {};

    // Apollo person data
    const personData = rawPayload.result?.data?.[0] || {};

    const firstName = personData.firstName || '';
    const lastName = personData.lastName || '';
    const fullName = personData.fullName || `${firstName} ${lastName}`.trim() || person.display_name || 'Unknown';

    const email =
      identityPayload.email?.[0] ||
      personData.email;

    const linkedinUrl =
      identityPayload.linkedin?.[0] ||
      personData.linkedinUrl ||
      personData.linkedinPublicUrl;

    const currentJob = personData.experiences?.[0];
    const title = currentJob?.title || personData.headline || personData.jobTitle;
    const department = currentJob?.companyName;

    const seniority = determineSeniority(title);
    const is_p0 = isP0Contact(title, department);

    return {
      id: person.id,
      account_id: companyId,
      full_name: fullName,
      email,
      title,
      seniority,
      is_p0,
      linkedin_url: linkedinUrl,
    };
  });
}
