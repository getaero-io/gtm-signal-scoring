#!/usr/bin/env npx tsx
/**
 * Register Lemlist Webhooks
 *
 * Registers webhooks for both emailsReplied and linkedinReplied events.
 * Requires LEMLIST_API_KEY and a target URL (defaults to NEXT_PUBLIC_BASE_URL).
 *
 * Usage:
 *   npx tsx scripts/register-lemlist-webhooks.ts
 *   npx tsx scripts/register-lemlist-webhooks.ts --url=https://your-domain.com
 */

import "dotenv/config";

const API_KEY = process.env.LEMLIST_API_KEY;
if (!API_KEY) {
  console.error("Missing LEMLIST_API_KEY in environment");
  process.exit(1);
}

const baseUrl =
  process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null);

if (!baseUrl) {
  console.error(
    "No target URL. Set NEXT_PUBLIC_BASE_URL or pass --url=https://..."
  );
  process.exit(1);
}

const targetUrl = `${baseUrl}/api/outbound/lemlist/webhook`;

const EVENT_TYPES = ["emailsReplied", "linkedinReplied"] as const;

const AUTH_HEADER = "Basic " + Buffer.from(`:${API_KEY}`).toString("base64");

async function listWebhooks(): Promise<any[]> {
  const res = await fetch("https://api.lemlist.com/api/hooks", {
    headers: { Authorization: AUTH_HEADER },
  });
  if (!res.ok) {
    console.error("Failed to list webhooks:", res.status, await res.text());
    return [];
  }
  return res.json();
}

async function registerWebhook(type: string): Promise<void> {
  const res = await fetch("https://api.lemlist.com/api/hooks", {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, targetUrl }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  Failed to register ${type}: ${res.status} ${body}`);
    return;
  }

  const data = await res.json();
  console.log(`  Registered ${type} → ${targetUrl}`);
  console.log(`  Webhook ID: ${data._id || data.id || "unknown"}`);
}

async function main() {
  console.log("Lemlist Webhook Registration");
  console.log(`Target URL: ${targetUrl}\n`);

  // List existing webhooks
  const existing = await listWebhooks();
  console.log(`Found ${existing.length} existing webhook(s):`);
  for (const hook of existing) {
    console.log(`  - ${hook.type} → ${hook.targetUrl} (id: ${hook._id})`);
  }
  console.log();

  for (const eventType of EVENT_TYPES) {
    const alreadyRegistered = existing.some(
      (h) => h.type === eventType && h.targetUrl === targetUrl
    );

    if (alreadyRegistered) {
      console.log(`${eventType}: already registered for ${targetUrl}`);
    } else {
      console.log(`${eventType}: registering...`);
      await registerWebhook(eventType);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
