/**
 * HubSpot CRM Integration for Outbound Flow
 *
 * Routes ALL HubSpot operations through the Deepline gateway API
 * (POST /api/v2/integrations/execute with provider: "hubspot").
 *
 * Requires:
 *   ENABLE_HUBSPOT=true
 *   DEEPLINE_API_KEY=...
 */

import { isPluginEnabled } from '@/lib/integrations/plugins/registry';

const DEEPLINE_API_URL =
  'https://code.deepline.com/api/v2/integrations/execute';

function getDeeplineApiKey(): string {
  const key = process.env.DEEPLINE_API_KEY;
  if (!key) throw new Error('DEEPLINE_API_KEY environment variable is not set');
  return key;
}

interface DeeplineResponse<T = unknown> {
  result: T;
}

async function deeplineHubSpot<T = unknown>(
  operation: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(DEEPLINE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getDeeplineApiKey()}`,
    },
    body: JSON.stringify({
      provider: 'hubspot',
      operation,
      payload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown');
    throw new Error(
      `Deepline HubSpot ${operation} failed (${res.status}): ${body.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as DeeplineResponse<T>;
  return data.result;
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
    const searchResult = await deeplineHubSpot<HubSpotSearchResult>(
      'search_contacts',
      {
        filterGroups: [
          {
            filters: [
              { propertyName: 'email', operator: 'EQ', value: opts.email },
            ],
          },
        ],
        properties: ['email', 'firstname', 'lastname'],
      }
    );

    const properties: Record<string, string> = {
      email: opts.email,
    };
    if (opts.firstName) properties.firstname = opts.firstName;
    if (opts.lastName) properties.lastname = opts.lastName;
    if (opts.company) properties.company = opts.company;
    if (opts.jobTitle) properties.jobtitle = opts.jobTitle;
    if (opts.leadStatus) properties.hs_lead_status = opts.leadStatus;
    if (opts.qualificationScore != null)
      properties.gtm_qualification_score = String(opts.qualificationScore);
    if (opts.source) properties.gtm_lead_source = opts.source;

    let contactId: string;

    if (searchResult.results?.length > 0) {
      contactId = searchResult.results[0].id;
      await deeplineHubSpot('update_contact', {
        contactId,
        properties,
      });
    } else {
      const created = await deeplineHubSpot<{ id: string }>(
        'create_contact',
        { properties }
      );
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
    await deeplineHubSpot('update_contact', { contactId, properties });
  } catch (err) {
    console.error('[hubspot] Contact update failed (non-fatal):', err);
  }
}

/**
 * Create a deal in HubSpot associated with a contact and optionally a company.
 * Returns the deal ID or null on failure.
 */
export async function createHubSpotDeal(opts: {
  contactId: string;
  companyId?: string;
  dealName: string;
  pipeline: string;
  stage: string;
  ownerId?: string;
  properties?: Record<string, string>;
}): Promise<string | null> {
  if (!isPluginEnabled('hubspot')) return null;

  try {
    const props: Record<string, string> = {
      dealname: opts.dealName,
      pipeline: opts.pipeline,
      dealstage: opts.stage,
      ...opts.properties,
    };
    if (opts.ownerId) props.hubspot_owner_id = opts.ownerId;

    const associations = [
      {
        to: { id: opts.contactId },
        types: [
          { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
        ],
      },
      ...(opts.companyId
        ? [
            {
              to: { id: opts.companyId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 5,
                },
              ],
            },
          ]
        : []),
    ];

    const result = await deeplineHubSpot<{ id: string }>('create_deal', {
      properties: props,
      associations,
    });

    return result.id;
  } catch (err) {
    console.error('[hubspot] Deal creation error:', (err as Error).message);
    return null;
  }
}

/**
 * Find a HubSpot owner by their email address.
 * Returns the owner ID or null if not found.
 */
export async function findHubSpotOwnerByEmail(
  email: string
): Promise<string | null> {
  if (!isPluginEnabled('hubspot')) return null;

  try {
    const result = await deeplineHubSpot<{
      results: Array<{ id: string }>;
    }>('list_owners', { email, limit: 1 });

    return result.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Find an existing HubSpot company by domain, or create one if it doesn't exist.
 * Returns the company ID or null on failure.
 */
export async function findOrCreateHubSpotCompany(
  domain: string,
  name?: string
): Promise<string | null> {
  if (!isPluginEnabled('hubspot')) return null;

  try {
    // Search by domain
    const searchResult = await deeplineHubSpot<HubSpotSearchResult>(
      'search_companies',
      {
        filterGroups: [
          {
            filters: [
              { propertyName: 'domain', operator: 'EQ', value: domain },
            ],
          },
        ],
        limit: 1,
      }
    );

    if (searchResult.results?.[0]?.id) return searchResult.results[0].id;

    // Create
    const created = await deeplineHubSpot<{ id: string }>(
      'create_company',
      {
        properties: { domain, name: name || domain },
      }
    );

    return created.id;
  } catch {
    return null;
  }
}
