import { query } from '@/lib/db';
import { Account } from '@/types/accounts';
import { tenantSourceFilter, tenantFilter } from './tenant-filter';

interface AccountRow {
  domain: string;
  brand_name: string;
  founder_name: string | null;
  founder_email: string | null;
  founder_title: string | null;
  email_status: string | null;
  retailer_count: string;
  retailers_list: string | null;
  sc_tier: string | null;
  icp_score: string | null;
  account_score: string | null;
  account_tier: string | null;
  contact_count: string;
  created_at: string;
  updated_at: string;
}

export async function getAccounts(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ accounts: Account[]; total: number; stats: { totalAccounts: number; withEmail: number; qualified: number } }> {
  const { search = '', limit = 50, offset = 0 } = params;
  const searchParam = `%${search}%`;

  // Tenant-aware source filtering (Spring Cash only sees CPG leads)
  const tf = tenantSourceFilter('l', 1);
  const searchIdx = tf.nextParam;

  const rows = await query<AccountRow>(
    `WITH brand_agg AS (
      SELECT
        l.company_domain AS domain,
        MAX(l.company_name) AS brand_name,
        -- Pick the best founder: prefer leads with email, then highest qualification_score
        (ARRAY_AGG(l.full_name ORDER BY
          CASE WHEN l.email IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(l.qualification_score, 0) DESC
          NULLS LAST
        ))[1] AS founder_name,
        (ARRAY_AGG(l.email ORDER BY
          CASE WHEN l.email IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(l.qualification_score, 0) DESC
          NULLS LAST
        ))[1] AS founder_email,
        (ARRAY_AGG(l.title ORDER BY
          CASE WHEN l.email IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(l.qualification_score, 0) DESC
          NULLS LAST
        ))[1] AS founder_title,
        (ARRAY_AGG(l.metadata->>'email_status' ORDER BY
          CASE WHEN l.email IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(l.qualification_score, 0) DESC
          NULLS LAST
        ))[1] AS email_status,
        MAX(COALESCE((l.metadata->>'retailer_count')::int, 0)) AS retailer_count,
        MAX(l.metadata->>'retailers_list') AS retailers_list,
        MAX(l.metadata->>'sc_tier') AS sc_tier,
        MAX(l.qualification_score) AS icp_score,
        COUNT(*) AS contact_count,
        MIN(l.created_at) AS created_at,
        MAX(l.updated_at) AS updated_at
      FROM inbound.leads l
      WHERE l.company_domain IS NOT NULL AND l.company_domain != ''
        ${tf.clause}
      GROUP BY l.company_domain
    )
    SELECT
      b.*,
      a.account_score,
      a.account_tier
    FROM brand_agg b
    LEFT JOIN inbound.account_scores a ON a.domain = b.domain
    WHERE LOWER(b.brand_name) LIKE LOWER($${searchIdx}) OR LOWER(b.domain) LIKE LOWER($${searchIdx})
    ORDER BY a.account_score DESC NULLS LAST, b.icp_score DESC NULLS LAST
    LIMIT $${searchIdx + 1} OFFSET $${searchIdx + 2}`,
    [...tf.params, searchParam, limit, offset]
  );

  const ctf = tenantFilter(1);
  const countSearchIdx = ctf.nextParam;
  const countResult = await query<{ total: string }>(
    `SELECT COUNT(DISTINCT company_domain) AS total
     FROM inbound.leads
     WHERE company_domain IS NOT NULL AND company_domain != ''
       ${ctf.clause}
       AND (LOWER(company_name) LIKE LOWER($${countSearchIdx}) OR LOWER(company_domain) LIKE LOWER($${countSearchIdx}))`,
    [...ctf.params, searchParam]
  );
  const total = parseInt(countResult[0]?.total || '0');

  // Stats: always global for this tenant (no search filter)
  const stf = tenantFilter(1);
  const statsResult = await query<{ total_accounts: string; with_email: string; qualified: string }>(
    `SELECT
       COUNT(DISTINCT company_domain) AS total_accounts,
       COUNT(DISTINCT CASE WHEN email IS NOT NULL THEN company_domain END) AS with_email,
       COUNT(DISTINCT CASE WHEN status = 'qualified' THEN company_domain END) AS qualified
     FROM inbound.leads
     WHERE company_domain IS NOT NULL AND company_domain != ''
       ${stf.clause}`,
    [...stf.params]
  );
  const s = statsResult[0];

  const accounts: Account[] = rows.map(r => ({
    id: r.domain,
    name: r.brand_name || r.domain,
    domain: r.domain,
    founder_name: r.founder_name,
    founder_email: r.founder_email,
    founder_title: r.founder_title,
    email_status: r.email_status,
    retailer_count: parseInt(r.retailer_count || '0'),
    retailers_list: r.retailers_list,
    sc_tier: r.sc_tier,
    icp_score: r.icp_score ? parseFloat(r.icp_score) : null,
    account_score: r.account_score ? parseFloat(r.account_score) : null,
    account_tier: r.account_tier,
    contact_count: parseInt(r.contact_count || '0'),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return {
    accounts,
    total,
    stats: {
      totalAccounts: parseInt(s?.total_accounts || '0'),
      withEmail: parseInt(s?.with_email || '0'),
      qualified: parseInt(s?.qualified || '0'),
    },
  };
}
