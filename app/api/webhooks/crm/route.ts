/**
 * Unified CRM Webhook Endpoint
 *
 * Routes incoming webhooks to the correct handler based on source detection:
 *   - Attio (CRM): HMAC-signed, record.created/updated/deleted for people/companies/deals
 *   - Webflow (forms): form_submission events with normalized field extraction
 *
 * POST /api/webhooks/crm
 * POST /api/webhooks/crm?source=attio
 * POST /api/webhooks/crm?source=webflow
 *
 * Detection logic (if no ?source= param):
 *   - Has x-attio-signature header → Attio
 *   - Has triggerType or _wf_trigger → Webflow
 *   - Has object.api_slug or event_type matching record.* → Attio
 *   - Otherwise → Webflow (default for form submissions)
 */

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { resolveIdentity } from "@/lib/identity/resolve";
import { postMessage } from "@/lib/outbound/slack/client";

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------

type CrmSource = "attio" | "webflow";

function detectSource(req: NextRequest, payload: Record<string, any>): CrmSource {
  const param = req.nextUrl.searchParams.get("source")?.toLowerCase();
  if (param === "attio") return "attio";
  if (param === "webflow") return "webflow";

  // Header-based detection
  if (req.headers.get("x-attio-signature")) return "attio";

  // Payload-based detection
  if (payload.object?.api_slug) return "attio";
  if (typeof payload.event_type === "string" && payload.event_type.startsWith("record.")) return "attio";
  if (payload.triggerType || payload._wf_trigger || payload.trigger_type) return "webflow";

  // Default to webflow for form-like payloads
  return "webflow";
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

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source = detectSource(req, payload);

  if (source === "attio") {
    return handleAttio(req, rawBody, payload);
  }
  return handleWebflow(req, payload);
}

// ===========================================================================
// ATTIO HANDLER
// ===========================================================================

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// --- Attio field extractors ---

function attioText(values: Record<string, any>, field: string): string | null {
  const arr = values?.[field];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.value ?? arr[0]?.plain_text ?? arr[0]?.first_name ?? arr[0]?.last_name
    ?? arr[0]?.email_address ?? arr[0]?.domain ?? arr[0]?.original_url ?? null;
}

function attioFirstName(values: Record<string, any>): string | null {
  const arr = values?.name;
  return Array.isArray(arr) && arr.length > 0 ? arr[0]?.first_name ?? null : null;
}

function attioLastName(values: Record<string, any>): string | null {
  const arr = values?.name;
  return Array.isArray(arr) && arr.length > 0 ? arr[0]?.last_name ?? null : null;
}

function attioFullName(values: Record<string, any>): string | null {
  const arr = values?.name;
  return Array.isArray(arr) && arr.length > 0 ? arr[0]?.full_name ?? null : null;
}

function attioEmail(values: Record<string, any>): string | null {
  const arr = values?.email_addresses;
  return Array.isArray(arr) && arr.length > 0 ? arr[0]?.email_address ?? null : null;
}

function attioDomain(values: Record<string, any>): string | null {
  const arr = values?.domains ?? values?.primary_domain ?? values?.website;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0]?.domain ?? arr[0]?.value ?? arr[0]?.original_url ?? null;
}

function attioCompanyName(values: Record<string, any>): string | null {
  const arr = values?.name;
  return Array.isArray(arr) && arr.length > 0 ? arr[0]?.value ?? arr[0]?.plain_text ?? null : null;
}

async function handleAttioPerson(record: any, eventType: string): Promise<string | null> {
  const values = record.values || {};
  const email = attioEmail(values);

  if (!email) {
    console.log("[webhooks/crm] Attio person without email, skipping");
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
    const rows = await writeQuery<{ id: string }>(
      `UPDATE inbound.leads SET status = 'deleted', updated_at = NOW() WHERE email = $1 RETURNING id`,
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

async function handleAttioCompany(record: any): Promise<void> {
  const values = record.values || {};
  const domain = attioDomain(values);
  if (!domain) return;

  const companyName = attioCompanyName(values);
  await writeQuery(
    `UPDATE inbound.leads SET company_name = COALESCE($2, company_name), updated_at = NOW()
     WHERE company_domain = $1`,
    [domain, companyName]
  );
}

async function handleAttio(req: NextRequest, rawBody: string, payload: any) {
  // Signature verification
  const secret = process.env.ATTIO_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-attio-signature");
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const eventType: string = payload.event_type ?? "unknown";
  const objectSlug: string = payload.object?.api_slug ?? "unknown";
  const record = payload.record ?? {};
  const recordId: string = record.id?.record_id ?? "unknown";

  try {
    // Store raw webhook event
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

    let leadId: string | null = null;

    if (objectSlug === "people") {
      leadId = await handleAttioPerson(record, eventType);
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
          console.warn("[webhooks/crm] Attio resolveIdentity failed:", err);
        }
      }
    } else if (objectSlug === "companies") {
      await handleAttioCompany(record);
    }

    if (eventId) {
      await writeQuery(
        `UPDATE inbound.webhook_events SET status = 'processed', lead_id = $2 WHERE id = $1`,
        [eventId, leadId]
      );
    }

    console.log(`[webhooks/crm] attio ${eventType} ${objectSlug} record_id=${recordId} lead_id=${leadId ?? "n/a"}`);
    return NextResponse.json({ ok: true, source: "attio", lead_id: leadId });
  } catch (err) {
    console.error("[webhooks/crm] Attio error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ===========================================================================
// WEBFLOW HANDLER
// ===========================================================================

async function handleWebflow(req: NextRequest, body: any) {
  // Auth
  const secret = process.env.WEBFLOW_WEBHOOK_SECRET || process.env.CRM_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const triggerType = body.triggerType || body.trigger_type || "form_submission";
    const payload = body.payload || body.data || body;

    // Log event
    await writeQuery(
      `INSERT INTO inbound.webhook_events (source, event_type, raw_payload, status, processed_at, created_at)
       VALUES ('webflow', $1, $2, $3, NOW(), NOW())`,
      [triggerType, JSON.stringify(body), triggerType === "form_submission" ? "processed" : "received"]
    ).catch((err: unknown) => console.warn("[webhooks/crm] Webflow log failed:", err));

    if (triggerType !== "form_submission") {
      return NextResponse.json({ ok: true, source: "webflow", event_type: triggerType, action: "logged" });
    }

    const formData = payload.data || payload.formData || payload;
    const formName = payload.name || payload.formName || "Contact Form";
    const normalized = normalizeFormFields(formData);

    const email = normalized.email;
    const fullName = normalized.name;
    const company = normalized.company;
    const phone = normalized.phone;
    const message = normalized.message;
    const title = normalized.title;
    const domain = normalized.website ? extractDomain(normalized.website) : null;

    if (!email && !fullName) {
      return NextResponse.json({ ok: true, source: "webflow", action: "skipped", reason: "no identifiers" });
    }

    // Upsert lead
    let leadId: string | null = null;

    if (email) {
      const existing = await query<{ id: string }>(`SELECT id FROM inbound.leads WHERE email = $1 LIMIT 1`, [email]);
      leadId = existing[0]?.id ?? null;
    }

    const meta = JSON.stringify({
      webflow_form: formName,
      webflow_message: message,
      webflow_phone: phone,
      webflow_submitted_at: new Date().toISOString(),
    });

    if (leadId) {
      await writeQuery(
        `UPDATE inbound.leads SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [meta, leadId]
      );
    } else {
      const result = await writeQuery<{ id: string }>(
        `INSERT INTO inbound.leads (email, full_name, company_name, company_domain, title, source, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'webflow', 'new', $6, NOW(), NOW())
         ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
           metadata = COALESCE(inbound.leads.metadata, '{}'::jsonb) || $6::jsonb, updated_at = NOW()
         RETURNING id`,
        [email, fullName, company, domain, title, meta]
      );
      leadId = result[0]?.id ?? null;
    }

    // Routing log
    if (leadId) {
      await writeQuery(
        `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
        [leadId, "form_submitted", JSON.stringify({ form_name: formName, source: "webflow" })]
      ).catch(() => {});
    }

    // Slack notification
    const slackChannel = process.env.SLACK_CHANNEL_INBOUND || process.env.SLACK_CHANNEL_OUTBOUND || "replybot";
    await postMessage({
      channel: slackChannel,
      text: `📋 New form submission: ${fullName || email || "Unknown"}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `*📋 Form: ${formName}*`,
              fullName ? `*Name:* ${fullName}` : null,
              email ? `*Email:* ${email}` : null,
              company ? `*Company:* ${company}` : null,
              title ? `*Title:* ${title}` : null,
              phone ? `*Phone:* ${phone}` : null,
              message ? `*Message:* ${message.substring(0, 200)}${message.length > 200 ? "..." : ""}` : null,
            ].filter(Boolean).join("\n"),
          },
        },
      ],
    }).catch((err: unknown) => console.warn("[webhooks/crm] Slack post failed:", err));

    console.log(`[webhooks/crm] webflow form "${formName}" from ${email || fullName}, lead_id=${leadId}`);
    return NextResponse.json({ ok: true, source: "webflow", lead_id: leadId, form_name: formName });
  } catch (err) {
    console.error("[webhooks/crm] Webflow error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Webflow form field normalizer
// ---------------------------------------------------------------------------

function normalizeFormFields(data: Record<string, string>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== "string") continue;
    const k = key.toLowerCase().trim();

    if (k.includes("email")) result.email = value;
    else if (k === "name" || k === "full name" || k === "your name" || k === "full_name") result.name = value;
    else if (k === "first name" || k === "first_name" || k === "firstname") result.firstName = value;
    else if (k === "last name" || k === "last_name" || k === "lastname") result.lastName = value;
    else if (k.includes("company") || k.includes("organization")) result.company = value;
    else if (k.includes("phone") || k.includes("tel")) result.phone = value;
    else if (k.includes("message") || k.includes("comment") || k.includes("note") || k === "how can we help") result.message = value;
    else if (k.includes("title") || k.includes("role") || k.includes("position")) result.title = value;
    else if (k.includes("website") || k.includes("url") || k.includes("domain")) result.website = value;
  }

  if (!result.name && (result.firstName || result.lastName)) {
    result.name = [result.firstName, result.lastName].filter(Boolean).join(" ");
  }
  return result;
}

function extractDomain(url: string): string | null {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0] || null;
  }
}
