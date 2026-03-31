/**
 * Daily Attio Sync Cron
 *
 * Reconciles TAM DB with Attio by pulling people, companies, and deals
 * via the Deepline integration API and upserting into the database.
 *
 * GET /api/cron/sync-attio
 * Auth: CRON_SECRET Bearer token
 * Schedule: daily at 06:00 UTC (configured in vercel.json)
 */

import { NextRequest, NextResponse } from "next/server";
import { writeQuery } from "@/lib/db-write";
import { resolveIdentity } from "@/lib/identity/resolve";

export const maxDuration = 300;

const DEEPLINE_API_URL = "https://code.deepline.com/api/v2/integrations/execute";
const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Deepline API client
// ---------------------------------------------------------------------------

interface DeeplineResponse {
  result?: {
    data?: {
      data?: any[];
    };
  };
}

async function fetchAttioRecords(
  object: "people" | "companies" | "deals",
  limit: number,
  offset: number
): Promise<any[]> {
  const apiKey = process.env.DEEPLINE_API_KEY;
  if (!apiKey) throw new Error("DEEPLINE_API_KEY is not configured");

  const res = await fetch(DEEPLINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      provider: "attio",
      operation: "attio_query_records",
      payload: { object, limit, offset },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deepline API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json: DeeplineResponse = await res.json();
  return json.result?.data?.data ?? [];
}

async function paginateAttioRecords(
  object: "people" | "companies" | "deals"
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchAttioRecords(object, PAGE_SIZE, offset);
    all.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;

    // Safety cap to avoid runaway pagination
    if (all.length >= 5000) {
      console.warn(`[cron/sync-attio] Hit safety cap of 5000 ${object} records`);
      break;
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Field extractors (same logic as webhook endpoint)
// ---------------------------------------------------------------------------

function av(values: Record<string, any>, field: string): string | null {
  const arr = values?.[field];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return (
    arr[0]?.value ??
    arr[0]?.plain_text ??
    arr[0]?.email_address ??
    arr[0]?.domain ??
    arr[0]?.original_url ??
    null
  );
}

function personFields(record: any) {
  const v = record.values || {};
  const nameArr = v.name;
  const firstName = Array.isArray(nameArr) ? nameArr[0]?.first_name ?? null : null;
  const lastName = Array.isArray(nameArr) ? nameArr[0]?.last_name ?? null : null;
  const fullName = Array.isArray(nameArr)
    ? (nameArr[0]?.full_name ?? ([firstName, lastName].filter(Boolean).join(" ") || null))
    : null;

  const emailArr = v.email_addresses;
  const email = Array.isArray(emailArr) ? emailArr[0]?.email_address ?? null : null;

  const title = av(v, "job_title") || av(v, "title");
  const linkedinUrl = av(v, "linkedin") || av(v, "linkedin_url");
  const companyName = av(v, "company") || av(v, "company_name");

  const domainArr = v.domains ?? v.primary_domain ?? v.website;
  const companyDomain = Array.isArray(domainArr)
    ? domainArr[0]?.domain ?? domainArr[0]?.value ?? null
    : null;

  const attioId = record.id?.record_id ?? null;

  return { email, firstName, lastName, fullName, title, linkedinUrl, companyDomain, companyName, attioId };
}

function companyFields(record: any) {
  const v = record.values || {};
  const nameArr = v.name;
  const companyName = Array.isArray(nameArr)
    ? nameArr[0]?.value ?? nameArr[0]?.plain_text ?? null
    : null;

  const domainArr = v.domains ?? v.primary_domain ?? v.website;
  const domain = Array.isArray(domainArr)
    ? domainArr[0]?.domain ?? domainArr[0]?.value ?? null
    : null;

  return { companyName, domain };
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

async function upsertPerson(record: any): Promise<boolean> {
  const { email, firstName, lastName, fullName, title, linkedinUrl, companyDomain, companyName, attioId } =
    personFields(record);

  if (!email) return false;

  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO inbound.leads
       (email, first_name, last_name, full_name, title, linkedin_url,
        company_domain, company_name, attio_id, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'attio-sync', 'new', '{}'::jsonb, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
       first_name   = COALESCE(EXCLUDED.first_name, inbound.leads.first_name),
       last_name    = COALESCE(EXCLUDED.last_name, inbound.leads.last_name),
       full_name    = COALESCE(EXCLUDED.full_name, inbound.leads.full_name),
       title        = COALESCE(EXCLUDED.title, inbound.leads.title),
       linkedin_url = COALESCE(EXCLUDED.linkedin_url, inbound.leads.linkedin_url),
       company_domain = COALESCE(EXCLUDED.company_domain, inbound.leads.company_domain),
       company_name = COALESCE(EXCLUDED.company_name, inbound.leads.company_name),
       attio_id     = COALESCE(EXCLUDED.attio_id, inbound.leads.attio_id),
       updated_at   = NOW()
     RETURNING id`,
    [email, firstName, lastName, fullName, title, linkedinUrl, companyDomain, companyName, attioId]
  );

  const leadId = rows[0]?.id;
  if (leadId) {
    try {
      await resolveIdentity({
        leadId,
        email,
        linkedinUrl,
        firstName,
        lastName,
        companyDomain,
        companyName,
        attioId,
      });
    } catch (err) {
      console.warn("[cron/sync-attio] resolveIdentity failed:", err);
    }
  }

  return true;
}

async function enrichCompany(record: any): Promise<boolean> {
  const { companyName, domain } = companyFields(record);
  if (!domain) return false;

  const result = await writeQuery(
    `UPDATE inbound.leads SET
       company_name = COALESCE($2, company_name),
       updated_at   = NOW()
     WHERE company_domain = $1`,
    [domain, companyName]
  );

  return true;
}

async function logDealEvent(record: any): Promise<void> {
  const recordId = record.id?.record_id ?? "unknown";
  await writeQuery(
    `INSERT INTO inbound.webhook_events
       (source, event_type, raw_payload, status, metadata, received_at, created_at)
     VALUES ('attio-sync', 'deal', $1, 'processed', $2, NOW(), NOW())`,
    [JSON.stringify(record), JSON.stringify({ record_id: recordId })]
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET Bearer token
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = {
    people: { total: 0, upserted: 0, skipped: 0 },
    companies: { total: 0, enriched: 0, skipped: 0 },
    deals: { total: 0, logged: 0 },
    errors: [] as string[],
  };

  try {
    // --- People ---
    try {
      const people = await paginateAttioRecords("people");
      results.people.total = people.length;

      for (const record of people) {
        try {
          const ok = await upsertPerson(record);
          ok ? results.people.upserted++ : results.people.skipped++;
        } catch (err) {
          results.people.skipped++;
          results.errors.push(`person ${record.id?.record_id}: ${String(err).slice(0, 100)}`);
        }
      }
    } catch (err) {
      results.errors.push(`people fetch: ${String(err).slice(0, 200)}`);
    }

    // --- Companies ---
    try {
      const companies = await paginateAttioRecords("companies");
      results.companies.total = companies.length;

      for (const record of companies) {
        try {
          const ok = await enrichCompany(record);
          ok ? results.companies.enriched++ : results.companies.skipped++;
        } catch (err) {
          results.companies.skipped++;
          results.errors.push(`company ${record.id?.record_id}: ${String(err).slice(0, 100)}`);
        }
      }
    } catch (err) {
      results.errors.push(`companies fetch: ${String(err).slice(0, 200)}`);
    }

    // --- Deals ---
    try {
      const deals = await paginateAttioRecords("deals");
      results.deals.total = deals.length;

      for (const record of deals) {
        try {
          await logDealEvent(record);
          results.deals.logged++;
        } catch (err) {
          results.errors.push(`deal ${record.id?.record_id}: ${String(err).slice(0, 100)}`);
        }
      }
    } catch (err) {
      results.errors.push(`deals fetch: ${String(err).slice(0, 200)}`);
    }

    console.log(
      `[cron/sync-attio] Done: people=${results.people.upserted}/${results.people.total} ` +
        `companies=${results.companies.enriched}/${results.companies.total} ` +
        `deals=${results.deals.logged}/${results.deals.total} ` +
        `errors=${results.errors.length}`
    );

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/sync-attio] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
