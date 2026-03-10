/**
 * Notion Plugin (Optional)
 *
 * Enable by setting:
 *   ENABLE_NOTION=true
 *   NOTION_API_KEY=ntn_...
 *   NOTION_DATABASE_ID=...
 */

import { Account } from '@/types/accounts';
import { isPluginEnabled } from '@/lib/integrations/plugins/registry';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notionRequest(path: string, options: RequestInit = {}) {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error('NOTION_API_KEY not configured');

  const res = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function pushAccountToNotion(account: Account): Promise<{ success: boolean; error?: string; url?: string }> {
  if (!isPluginEnabled('notion')) {
    return { success: false, error: 'Notion plugin not enabled' };
  }

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    return { success: false, error: 'NOTION_DATABASE_ID not configured' };
  }

  try {
    const page = await notionRequest('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [{ text: { content: account.name } }],
          },
          'Atlas Score': {
            number: account.atlas_score,
          },
          Domain: {
            url: account.domain ? `https://${account.domain}` : null,
          },
          'P0 Contacts': {
            number: account.p0_penetration.current,
          },
          'Tech Stack Size': {
            number: account.tech_stack.length,
          },
          'Last Scored': {
            date: { start: new Date().toISOString() },
          },
        },
      }),
    });

    return { success: true, url: page.url };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
