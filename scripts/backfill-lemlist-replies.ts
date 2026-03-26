#!/usr/bin/env npx tsx
/**
 * Backfill Lemlist Replies
 *
 * Two modes:
 *   1. --from-api (default): Pull replies from Lemlist API, ingest to tamdb, process
 *   2. --reprocess: Re-run the event processor on existing tamdb events (clears processed tracking)
 *
 * Usage:
 *   npx tsx scripts/backfill-lemlist-replies.ts                     # pull from API, last 7 days
 *   npx tsx scripts/backfill-lemlist-replies.ts --days=3            # last 3 days
 *   npx tsx scripts/backfill-lemlist-replies.ts --dry-run           # preview only
 *   npx tsx scripts/backfill-lemlist-replies.ts --process           # also trigger event processor
 *   npx tsx scripts/backfill-lemlist-replies.ts --reprocess         # re-process existing tamdb events
 *   npx tsx scripts/backfill-lemlist-replies.ts --reprocess --days=7  # re-process last 7 days only
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const LEMLIST_API_KEY = process.env.LEMLIST_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY; // for authenticated endpoints

if (!LEMLIST_API_KEY) {
  console.error("Missing LEMLIST_API_KEY in .env.local");
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const daysArg = args.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? parseInt(daysArg.split("=")[1]) : 7;
const DRY_RUN = args.includes("--dry-run");
const AUTO_PROCESS = args.includes("--process");

const LEMLIST_BASE = "https://api.lemlist.com/api";
const AUTH_HEADER =
  "Basic " + Buffer.from(":" + LEMLIST_API_KEY).toString("base64");

interface LemlistActivity {
  _id: string;
  type: string;
  text?: string;
  messagePreview?: string;
  replyText?: string;
  leadFirstName?: string;
  leadLastName?: string;
  leadEmail?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  sendUserName?: string;
  campaignName?: string;
  campaignId?: string;
  sequenceStep?: number;
  isFirst?: boolean;
  aiLeadInterestScore?: number;
  createdAt?: string;
  jobTitle?: string;
  companyDomain?: string;
  companyName?: string;
  latest_org?: string;
  linkedinUrl?: string;
  linkedinUrlSalesNav?: string;
}

async function fetchActivities(
  type: "emailsReplied" | "linkedinReplied",
  limit = 100
): Promise<LemlistActivity[]> {
  const all: LemlistActivity[] = [];
  let offset = 0;

  while (true) {
    const url = `${LEMLIST_BASE}/activities?type=${type}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: AUTH_HEADER },
    });

    if (!res.ok) {
      console.error(
        `Lemlist API error (${type}): ${res.status} ${res.statusText}`
      );
      break;
    }

    const items: LemlistActivity[] = await res.json();
    if (!items.length) break;

    all.push(...items);
    offset += items.length;

    // Lemlist returns up to `limit` items per page
    if (items.length < limit) break;

    // Rate limit: Lemlist allows ~10 req/s
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

function isWithinDays(dateStr: string | undefined, days: number): boolean {
  if (!dateStr) return true; // include if no date
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

async function ingestActivity(activity: LemlistActivity, pool: import("pg").Pool): Promise<string | null> {
  // Normalize the activity into the same shape the ingest endpoint uses
  const normalized = {
    event_type: String(activity.type || "unknown"),
    source_platform: "lemlist",
    reply_text: (activity.replyText || activity.text || activity.messagePreview) as string | undefined,
    email: (activity.email || activity.leadEmail) as string | undefined,
    first_name: (activity.firstName || activity.leadFirstName) as string | undefined,
    last_name: (activity.lastName || activity.leadLastName) as string | undefined,
    company: (activity.companyName || activity.latest_org) as string | undefined,
    campaign_id: activity.campaignId,
    campaign_name: activity.campaignName,
    linkedin_url: (activity.linkedinUrl || activity.linkedinUrlSalesNav) as string | undefined,
    received_at: new Date().toISOString(),
    original_payload: {
      type: activity.type,
      text: activity.text,
      replyText: activity.replyText,
      messagePreview: activity.messagePreview,
      email: activity.email,
      leadEmail: activity.leadEmail,
      firstName: activity.firstName,
      leadFirstName: activity.leadFirstName,
      lastName: activity.lastName,
      leadLastName: activity.leadLastName,
      companyName: activity.companyName,
      companyDomain: activity.companyDomain,
      campaignId: activity.campaignId,
      campaignName: activity.campaignName,
      sendUserName: activity.sendUserName,
      sequenceStep: activity.sequenceStep,
      isFirst: activity.isFirst,
      aiLeadInterestScore: activity.aiLeadInterestScore,
      createdAt: activity.createdAt,
      jobTitle: activity.jobTitle,
      linkedinUrl: activity.linkedinUrl,
      linkedinUrlSalesNav: activity.linkedinUrlSalesNav,
      latest_org: activity.latest_org,
      _id: activity._id,
    },
  };

  const source = `cache:local:event_tamdb_write:event:lemlist-${Date.now()}`;
  const doc = JSON.stringify({ raw_payload: normalized });

  try {
    const result = await pool.query(
      `INSERT INTO dl_cache.enrichment_event (row_id, source, doc, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2::jsonb, NOW(), NOW())
       RETURNING row_id`,
      [source, doc]
    );
    return result.rows[0]?.row_id;
  } catch (err) {
    console.error(`  Ingest failed:`, (err as Error).message);
    return null;
  }
}

async function triggerProcessor(): Promise<void> {
  console.log("\nTriggering event processor...");
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Use CRON_SECRET if available (for the GET fallback path)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    headers["Authorization"] = `Bearer ${cronSecret}`;
  }

  const res = await fetch(`${BASE_URL}/api/events/process`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    console.error(`Processor error: ${res.status} ${await res.text()}`);
    return;
  }

  const data = await res.json();
  console.log("Processor result:", JSON.stringify(data, null, 2));
}

async function main() {
  console.log(`Fetching Lemlist replies from the last ${DAYS} days...`);
  if (DRY_RUN) console.log("(DRY RUN — no ingest)\n");

  // Fetch both email and LinkedIn replies
  const [emailReplies, linkedinReplies] = await Promise.all([
    fetchActivities("emailsReplied"),
    fetchActivities("linkedinReplied"),
  ]);

  console.log(`  Email replies: ${emailReplies.length}`);
  console.log(`  LinkedIn replies: ${linkedinReplies.length}`);

  // Combine and filter to last N days
  const allReplies = [...emailReplies, ...linkedinReplies].filter((a) =>
    isWithinDays(a.createdAt, DAYS)
  );

  // Dedup by _id
  const seen = new Set<string>();
  const unique = allReplies.filter((a) => {
    if (seen.has(a._id)) return false;
    seen.add(a._id);
    return true;
  });

  console.log(`  After date filter + dedup: ${unique.length} replies\n`);

  if (!unique.length) {
    console.log("No replies found. Done.");
    return;
  }

  // Print summary table
  console.log("Reply summary:");
  console.log("─".repeat(100));
  console.log(
    "Date".padEnd(12) +
    "Type".padEnd(18) +
    "From".padEnd(25) +
    "Campaign".padEnd(20) +
    "Reply (preview)"
  );
  console.log("─".repeat(100));

  for (const a of unique) {
    const date = a.createdAt
      ? new Date(a.createdAt).toISOString().slice(0, 10)
      : "unknown";
    const name = [a.leadFirstName || a.firstName, a.leadLastName || a.lastName]
      .filter(Boolean)
      .join(" ")
      .slice(0, 23);
    const campaign = (a.campaignName || "").slice(0, 18);
    const replyText = (a.text || a.replyText || a.messagePreview || "").slice(0, 40);
    const channel = a.type?.includes("linkedin") ? "linkedin" : "email";

    console.log(
      date.padEnd(12) +
      channel.padEnd(18) +
      name.padEnd(25) +
      campaign.padEnd(20) +
      replyText
    );
  }
  console.log("─".repeat(100));

  if (DRY_RUN) {
    console.log("\nDry run complete. Use without --dry-run to ingest.");
    return;
  }

  // Connect directly to DB
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_WRITE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Ingest each reply directly into tamdb
    console.log(`\nIngesting ${unique.length} replies into tamdb (direct DB write)...`);
    let ingested = 0;
    let failed = 0;

    for (const activity of unique) {
      const name = [activity.leadFirstName || activity.firstName, activity.leadLastName || activity.lastName]
        .filter(Boolean)
        .join(" ");
      const channel = activity.type?.includes("linkedin") ? "LI" : "EM";

      const rowId = await ingestActivity(activity, pool);
      if (rowId) {
        ingested++;
        console.log(`  [${channel}] ${name} → ${rowId}`);
      } else {
        failed++;
        console.log(`  [${channel}] ${name} → FAILED`);
      }
    }

    console.log(`\nIngested: ${ingested}, Failed: ${failed}`);

    if (AUTO_PROCESS && ingested > 0) {
      await triggerProcessor();
    } else if (ingested > 0) {
      console.log(
        "\nRun the event processor to draft replies:\n" +
        `  curl -H "Authorization: Bearer $CRON_SECRET" ${BASE_URL}/api/events/process`
      );
    }
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Reprocess mode — re-run the consumer on existing tamdb events
// ---------------------------------------------------------------------------

async function reprocess() {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Show what's in tamdb
    const events = await pool.query(`
      SELECT e.row_id, e.source, e.doc, e.created_at,
             p.status as processed_status
      FROM dl_cache.enrichment_event e
      LEFT JOIN inbound.processed_webhook_events p
        ON p.event_row_id = e.row_id AND p.app_id = 'replybot'
      WHERE e.source LIKE 'cache:local:event_tamdb_write:%'
        AND e.created_at > NOW() - INTERVAL '${DAYS} days'
      ORDER BY e.created_at DESC
    `);

    console.log(`Found ${events.rows.length} events in tamdb (last ${DAYS} days):\n`);

    const alreadyProcessed = events.rows.filter((r: any) => r.processed_status);
    const unprocessed = events.rows.filter((r: any) => !r.processed_status);

    console.log(`  Already processed: ${alreadyProcessed.length}`);
    console.log(`  Unprocessed: ${unprocessed.length}\n`);

    for (const r of events.rows) {
      const raw = typeof r.doc === "string" ? JSON.parse(r.doc) : r.doc;
      const payload = raw?.raw_payload || {};
      const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "?";
      const text = (payload.reply_text || payload.original_payload?.text || payload.original_payload?.replyText || "").slice(0, 50);
      const status = r.processed_status ? `[${r.processed_status}]` : "[pending]";
      const date = new Date(r.created_at).toISOString().slice(0, 16);

      console.log(`  ${status.padEnd(12)} ${date}  ${(payload.source_platform || "?").padEnd(10)} ${name.padEnd(20)} ${text}`);
    }

    if (DRY_RUN) {
      console.log("\nDry run. Use --reprocess without --dry-run to clear processed tracking and re-run.");
      return;
    }

    if (alreadyProcessed.length === 0 && unprocessed.length === 0) {
      console.log("\nNo events to reprocess.");
      return;
    }

    // Clear processed tracking for these events so the consumer picks them up again
    if (alreadyProcessed.length > 0) {
      const rowIds = alreadyProcessed.map((r: any) => r.row_id);
      const result = await pool.query(
        `DELETE FROM inbound.processed_webhook_events
         WHERE app_id = 'replybot' AND event_row_id = ANY($1::uuid[])`,
        [rowIds]
      );
      console.log(`\nCleared ${result.rowCount} processed tracking records.`);
    }

    // Now trigger the processor
    console.log("Triggering event processor...\n");
    const headers: Record<string, string> = {};
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

    const res = await fetch(`${BASE_URL}/api/events/process`, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      console.error(`Processor error: ${res.status} ${await res.text()}`);
    } else {
      const data = await res.json();
      console.log("Processor result:", JSON.stringify(data, null, 2));
    }
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const REPROCESS = args.includes("--reprocess");

if (REPROCESS) {
  reprocess().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
