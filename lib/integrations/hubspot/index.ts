/**
 * HubSpot Plugin (Optional)
 *
 * Enable by setting:
 *   ENABLE_HUBSPOT=true
 *   HUBSPOT_ACCESS_TOKEN=pat-na1-...
 *   HUBSPOT_PORTAL_ID=...
 */

import { Account } from '@/types/accounts';
import { isPluginEnabled } from '@/lib/integrations/plugins/registry';

const HUBSPOT_API = 'https://api.hubapi.com';

async function hubspotRequest(path: string, options: RequestInit = {}) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN not configured');

  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function syncAccountToHubSpot(account: Account): Promise<{ success: boolean; error?: string }> {
  if (!isPluginEnabled('hubspot')) {
    return { success: false, error: 'HubSpot plugin not enabled' };
  }

  try {
    // Search for existing company by domain
    const searchResult = await hubspotRequest('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'domain',
                operator: 'EQ',
                value: account.domain,
              },
            ],
          },
        ],
        properties: ['domain', 'name'],
      }),
    });

    const properties = {
      gtm_icp_score: String(account.icp_score ?? 0),
      gtm_account_score: String(account.account_score ?? 0),
      gtm_sc_tier: account.sc_tier || '',
      gtm_last_scored: new Date().toISOString(),
    };

    if (searchResult.results?.length > 0) {
      // Update existing
      const companyId = searchResult.results[0].id;
      await hubspotRequest(`/crm/v3/objects/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    } else {
      // Create new
      await hubspotRequest('/crm/v3/objects/companies', {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            name: account.name,
            domain: account.domain,
            ...properties,
          },
        }),
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
