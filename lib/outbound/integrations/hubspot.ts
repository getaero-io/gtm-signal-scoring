/**
 * HubSpot CRM Integration for Outbound Flow
 *
 * Syncs leads/contacts to HubSpot when they are qualified, approved, or routed.
 * Uses the HubSpot CRM v3 API directly (no SDK dependency).
 *
 * Requires:
 *   ENABLE_HUBSPOT=true
 *   HUBSPOT_ACCESS_TOKEN=pat-na1-...
 */

import { isPluginEnabled } from '@/lib/integrations/plugins/registry';

const HUBSPOT_API = 'https://api.hubapi.com';

async function hubspotRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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
    const body = await res.text().catch(() => 'unknown');
    throw new Error(`HubSpot API error ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

interface HubSpotSearchResult {
  results: Array<{ id: string; properties: Record<string, string> }>;
}

/**
 * Upsert a contact in HubSpot, matching by email.
 * Returns the HubSpot contact ID.
 */
export async function upsertHubSpotContact(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  leadStatus?: string;
  qualificationScore?: number;
  source?: string;
}): Promise<{ contactId: string } | null> {
  if (!isPluginEnabled('hubspot')) return null;

  try {
    // Search for existing contact by email
    const searchResult = await hubspotRequest<HubSpotSearchResult>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: 'email', operator: 'EQ', value: opts.email },
            ],
          },
        ],
        properties: ['email', 'firstname', 'lastname'],
      }),
    });

    const properties: Record<string, string> = {
      email: opts.email,
    };
    if (opts.firstName) properties.firstname = opts.firstName;
    if (opts.lastName) properties.lastname = opts.lastName;
    if (opts.company) properties.company = opts.company;
    if (opts.jobTitle) properties.jobtitle = opts.jobTitle;
    if (opts.leadStatus) properties.hs_lead_status = opts.leadStatus;
    if (opts.qualificationScore != null) properties.gtm_qualification_score = String(opts.qualificationScore);
    if (opts.source) properties.gtm_lead_source = opts.source;

    let contactId: string;

    if (searchResult.results?.length > 0) {
      contactId = searchResult.results[0].id;
      await hubspotRequest(`/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    } else {
      const created = await hubspotRequest<{ id: string }>('/crm/v3/objects/contacts', {
        method: 'POST',
        body: JSON.stringify({ properties }),
      });
      contactId = created.id;
    }

    return { contactId };
  } catch (err) {
    console.error('[hubspot] Contact upsert failed (non-fatal):', err);
    return null;
  }
}

/**
 * Update a HubSpot contact's properties by contact ID.
 */
export async function updateHubSpotContact(
  contactId: string,
  properties: Record<string, string>
): Promise<void> {
  if (!isPluginEnabled('hubspot')) return;

  try {
    await hubspotRequest(`/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  } catch (err) {
    console.error('[hubspot] Contact update failed (non-fatal):', err);
  }
}
