import { pool } from "../src/db/client.js";

const DEEPLINE_API_URL = "https://code.deepline.com/api/v2/integrations/execute";

async function main() {
  const apiKey = process.env.DEEPLINE_API_KEY;
  if (!apiKey) throw new Error("DEEPLINE_API_KEY required");

  let totalSynced = 0;
  let hasMore = true;
  let cursor: string | null = null;

  console.log("[attio-sync] Starting Attio → leads sync...");

  while (hasMore) {
    const res = await fetch(DEEPLINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        provider: "attio",
        operation: "attio_list_records",
        payload: { object: "people", limit: 50, ...(cursor ? { offset: cursor } : {}) },
      }),
    });

    if (!res.ok) {
      console.error(`[attio-sync] API error: ${res.status} ${await res.text().catch(() => "")}`);
      break;
    }

    const json = (await res.json()) as any;
    const records = json.result?.data || [];
    cursor = json.result?.next_cursor || null;
    hasMore = !!cursor && records.length > 0;

    for (const record of records) {
      const vals = record.values || {};
      const email = vals.email_addresses?.[0]?.email_address;
      if (!email) continue;

      const firstName = vals.name?.[0]?.first_name || null;
      const lastName = vals.name?.[0]?.last_name || null;
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
      const title = vals.job_title?.[0]?.value || null;
      const linkedin = vals.linkedin?.[0]?.value || null;
      const companyDomain = vals.company?.[0]?.domain || null;
      const attioId = record.id?.record_id || null;

      try {
        await pool.query(
          `INSERT INTO inbound.leads (email, first_name, last_name, full_name, title, linkedin_url, company_domain, attio_id, source, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'attio', 'new', '{}')
           ON CONFLICT (email) DO UPDATE SET
             first_name = COALESCE(inbound.leads.first_name, EXCLUDED.first_name),
             last_name = COALESCE(inbound.leads.last_name, EXCLUDED.last_name),
             full_name = COALESCE(inbound.leads.full_name, EXCLUDED.full_name),
             title = COALESCE(inbound.leads.title, EXCLUDED.title),
             linkedin_url = COALESCE(inbound.leads.linkedin_url, EXCLUDED.linkedin_url),
             company_domain = COALESCE(inbound.leads.company_domain, EXCLUDED.company_domain),
             attio_id = COALESCE(EXCLUDED.attio_id, inbound.leads.attio_id),
             updated_at = NOW()`,
          [email, firstName, lastName, fullName, title, linkedin, companyDomain, attioId]
        );
        totalSynced++;
      } catch (err) {
        console.warn(`[attio-sync] Skipping ${email}:`, (err as Error).message);
      }
    }

    console.log(`[attio-sync] Batch done (${records.length} records, ${totalSynced} synced)`);
  }

  console.log(`[attio-sync] Complete. ${totalSynced} records synced.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
