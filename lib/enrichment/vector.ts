/**
 * Vector.co company enrichment provider — routes through Deepline gateway API.
 *
 * Looks up firmographic data (industry, headcount, funding, tech stack)
 * for a given domain. Results are cached in inbound.vector_cache with
 * a 7-day TTL to avoid redundant API calls.
 */

import { query } from '@/lib/db';
import { writeQuery } from '@/lib/db-write';

const DEEPLINE_API_URL =
  'https://code.deepline.com/api/v2/integrations/execute';

export interface VectorCompanyData {
  name: string;
  domain: string;
  industry: string;
  sub_industry: string;
  employee_count: number;
  revenue_range: string;
  founded_year: number;
  funding_total: number;
  funding_stage: string;
  technologies: string[];
  description: string;
  headquarters: { city: string; state: string; country: string };
  social_profiles: { linkedin?: string; twitter?: string };
}

/**
 * Call the Vector.co API through the Deepline gateway.
 * Returns null if the API key is missing, the domain is not found, or the request fails.
 */
export async function enrichFromVector(domain: string): Promise<VectorCompanyData | null> {
  const apiKey = process.env.DEEPLINE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(DEEPLINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        provider: 'vector',
        operation: 'company_lookup',
        payload: { domain },
      }),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      console.error('[vector] Deepline API error:', res.status);
      return null;
    }

    const data = await res.json();
    return (data.result as VectorCompanyData) ?? null;
  } catch (err) {
    console.error('[vector] Enrichment failed:', (err as Error).message);
    return null;
  }
}

/**
 * Cached wrapper around enrichFromVector.
 * Checks inbound.vector_cache first (7-day TTL), then falls back to a live API call
 * and persists the result for future lookups.
 */
export async function enrichFromVectorCached(domain: string): Promise<VectorCompanyData | null> {
  // Check cache (7-day TTL)
  const cached = await query<{ data: VectorCompanyData }>(
    `SELECT data FROM inbound.vector_cache WHERE domain = $1 AND fetched_at > NOW() - INTERVAL '7 days'`,
    [domain]
  ).catch(() => []);

  if (cached[0]) return cached[0].data;

  const data = await enrichFromVector(domain);
  if (data) {
    await writeQuery(
      `INSERT INTO inbound.vector_cache (domain, data) VALUES ($1, $2)
       ON CONFLICT (domain) DO UPDATE SET data = $2, fetched_at = NOW()`,
      [domain, JSON.stringify(data)]
    ).catch(() => {});
  }
  return data;
}
