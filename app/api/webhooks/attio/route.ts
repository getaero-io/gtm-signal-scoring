/**
 * Attio Webhook Endpoint
 *
 * Receives Attio webhook POST events (record.created, record.updated, record.deleted)
 * for people, companies, and deals. Upserts into TAM DB accordingly.
 *
 * POST /api/webhooks/attio
 *
 * Auth: HMAC SHA256 signature verification via x-attio-signature header
 * (skipped if ATTIO_WEBHOOK_SECRET is not configured).
 */

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { writeQuery } from "@/lib/db-write";
import { resolveIdentity } from "@/lib/identity/resolve";

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}

// ---------------------------------------------------------------------------
// Field extractors — Attio wraps every value in an array of objects
// ---------------------------------------------------------------------------

function attioText(values: Record<string, any>, field: string): string | null {
  const arr = values?.[field];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  // text / plain_text / value — Attio uses different shapes per field type
  return (
    arr[0]?.value ??
    arr[0]?.plain_text ??
    arr[0]?.first_name ??
    arr[0]?.last_name ??
    arr[0]?.email_address ??
    arr[0]?.domain ??
    arr[0]?.original_url ??
    null
  );
}

function attioFirstName(values: Record<string, any>): string | null {
  const arr = values?.name;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.first_name ?? null;
}

function attioLastName(values: Record<string, any>): string | null {
  const arr = values?.name;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.last_name ?? null;
}

function attioFullName(values: Record<string, any>): string | null {
  const arr = values?.name;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.full_name ?? null;
}

function attioEmail(values: Record<string, any>): string | null {
  const arr = values?.email_addresses;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.email_address ?? null;
}

function attioDomain(values: Record<string, any>): string | null {
  const arr = values?.domains ?? values?.primary_domain ?? values?.website;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.domain ?? arr[0]?.value ?? arr[0]?.original_url ?? null;
}

function attioCompanyName(values: Record<string, any>): string | null {
  const arr = values?.name;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.value ?? arr[0]?.plain_text ?? null;
}

// ---------------------------------------------------------------------------
// Handlers per object type
// ---------------------------------------------------------------------------

async function handlePerson(
  record: any,
  eventType: string,
  eventId: string
): Promise<string | null> {
  const values = record.values || {};
  const email = attioEmail(values);

  if (!email) {
    console.log("[webhooks/attio] Person record without email, skipping lead upsert");
    return null;
  }

  const firstName = attioFirstName(values);
  const lastName = attioLastName(values);
  const fullName = attioFullName(values) || [firstName, lastName].filter(Boolean).join(" ") || null;
  const title = attioText(values, "job_title") || attioText(values, "title");
  const linkedinUrl = attioText(values, "linkedin") || attioText(values, "linkedin_url");
  const companyName = attioText(values, "company") || attioText(values, "company_name");
  const companyDomain = attioDomain(values);
  const attioId = record.id?.record_id ?? null;

  if (eventType === "record.deleted") {
    // Soft-delete: mark status as deleted rather than removing the row
    const rows = await writeQuery<{ id: string }>(
      `UPDATE inbound.leads SET status = 'deleted', updated_at = NOW()
       WHERE email = $1 RETURNING id`,
      [email]
    );
    return rows[0]?.id ?? null;
  }

  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO inbound.leads
       (email, first_name, last_name, full_name, title, linkedin_url,
        company_domain, company_name, attio_id, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'attio', 'new', '{}'::jsonb, NOW(), NOW())
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

  return rows[0]?.id ?? null;
}

async function handleCompany(
  record: any,
  eventType: string
): Promise<void> {
  const values = record.values || {};
  const domain = attioDomain(values);
  if (!domain) {
    console.log("[webhooks/attio] Company record without domain, skipping enrichment");
    return;
  }

  const companyName = attioCompanyName(values);

  // Enrich existing leads that match this company domain
  await writeQuery(
    `UPDATE inbound.leads SET
       company_name = COALESCE($2, company_name),
       updated_at   = NOW()
     WHERE company_domain = $1`,
    [domain, companyName]
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Signature verification
  const secret = process.env.ATTIO_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-attio-signature");
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType: string = payload.event_type ?? "unknown";
  const objectSlug: string = payload.object?.api_slug ?? "unknown";
  const record = payload.record ?? {};
  const recordId: string = record.id?.record_id ?? "unknown";

  try {
    // 1. Store raw webhook event
    const eventRows = await writeQuery<{ id: string }>(
      `INSERT INTO inbound.webhook_events
         (source, event_type, raw_payload, status, metadata, received_at, created_at)
       VALUES ('attio', $1, $2, 'pending', $3, NOW(), NOW())
       RETURNING id`,
      [
        `${objectSlug}.${eventType}`,
        rawBody,
        JSON.stringify({ object: objectSlug, record_id: recordId }),
      ]
    );
    const eventId = eventRows[0]?.id ?? null;

    // 2. Process by object type
    let leadId: string | null = null;

    if (objectSlug === "people") {
      leadId = await handlePerson(record, eventType, eventId);
      if (leadId) {
        try {
          const values = record.values || {};
          await resolveIdentity({
            leadId,
            email: attioEmail(values),
            linkedinUrl: attioText(values, "linkedin") || attioText(values, "linkedin_url"),
            firstName: attioFirstName(values),
            lastName: attioLastName(values),
            companyDomain: attioDomain(values),
            companyName: attioText(values, "company") || attioText(values, "company_name"),
            attioId: record.id?.record_id ?? null,
          });
        } catch (err) {
          console.warn("[webhooks/attio] resolveIdentity failed:", err);
        }
      }
    } else if (objectSlug === "companies") {
      await handleCompany(record, eventType);
    }
    // deals: stored as webhook_event only (no additional processing)

    // 3. Update webhook event with lead_id and mark processed
    if (eventId) {
      await writeQuery(
        `UPDATE inbound.webhook_events SET status = 'processed', lead_id = $2 WHERE id = $1`,
        [eventId, leadId]
      );
    }

    console.log(
      `[webhooks/attio] ${eventType} ${objectSlug} record_id=${recordId} lead_id=${leadId ?? "n/a"}`
    );

    return NextResponse.json({ ok: true, lead_id: leadId });
  } catch (err) {
    console.error("[webhooks/attio] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
