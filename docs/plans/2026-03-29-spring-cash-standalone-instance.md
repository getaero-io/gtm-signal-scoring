# Spring Cash Standalone Instance — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Spring Cash Vercel instance a fully independent, self-service GTM platform — working ReplyBot, lead scoring, config editor, dashboard, and Slack integration — all behind their own login, owned by the Spring Cash team.

**Architecture:** Same codebase, separate Vercel project (`gtm-signals-scoring-springcash`), separate Neon Postgres database, separate Slack app, separate env vars. The Spring Cash team logs in, sees their leads, edits their scoring config, and gets ReplyBot draft replies in their own Slack. No code fork — tenant isolation via `TENANT_ID=spring-cash` env var and per-tenant config directories.

**Tech Stack:** Next.js 16 (App Router), Vercel Functions, Neon PostgreSQL, Slack Web API, OpenAI GPT-5-mini, YAML config, scrypt auth

---

## Current State (What Already Works)

From the previous deployment session (2026-03-29):

| Component | Status | Notes |
|-----------|--------|-------|
| Vercel project | Deployed | `gtm-signals-scoring-springcash`, project ID `prj_erm6lbZzyVnPhr5tvxRIWMezPiC6` |
| `api/health` | Working | Returns `{"ok":true}` |
| `api/auth/login` | Working | Password: `springcash2026!` |
| `api/webhooks/ingest` | Working | Accepts SmartLead/HeyReach/Lemlist payloads |
| `api/config/list,read,write` | Working | Config CRUD endpoints |
| Database | Provisioned | Neon PostgreSQL, 5,958 CPG leads imported |
| Webhook relay | Configured | Deepline fans out to Spring Cash via `WEBHOOK_RELAY_TARGETS` |
| Login page (`/login.html`) | Working | Static HTML served by Vercel |

## What's Broken / Missing

| Issue | Impact | Root Cause |
|-------|--------|------------|
| **Next.js App Router routes don't work** | Dashboard, Slack interactions, leads API, signals API — all return 404 | `buildCommand: "echo skip"` skips Next.js build entirely |
| **Config loader can't find tenant configs** | Spring Cash gets Deepline's company context and response templates | Loader looks in `config/tenants/spring-cash/` but files are at `config/spring-cash/` |
| **No Slack app** | ReplyBot can't post/receive messages | Requires manual Slack app creation by Ryan |
| **No OpenAI key** | ReplyBot can't draft AI responses | Requires `OPENAI_API_KEY` env var |
| **No GitHub token** | Config editor can't save changes | Requires `GITHUB_TOKEN` env var |
| **No Trigger.dev connection** | Background jobs (reply polling, qualification) don't run | Requires separate Trigger.dev project or shared project with tenant routing |
| **Shared ICP/qualification/routing configs** | Spring Cash uses Deepline's scoring rules | Config files at `config/` root are shared; Spring Cash needs own copies |
| **Config editor shows ALL tenant configs** | Spring Cash can see/edit Deepline configs | `api/config/list` walks entire `config/` dir |
| **No cron jobs** | Stale draft bumping, event processing don't run | `vercel.json` crons exist but the routes they call are Next.js App Router routes |

---

## Implementation Tasks

### Task 1: Fix the Config Loader Path

The config loader at `lib/outbound/config/loader.ts` looks for tenant configs in `config/tenants/{tenant}/` but the actual files are at `config/{tenant}/`. This means Spring Cash (and all tenants) fall back to shared defaults.

**Files:**
- Modify: `lib/outbound/config/loader.ts:10` — change `TENANTS_DIR`

**Step 1: Read the current loader**

```bash
cat lib/outbound/config/loader.ts
```

Confirm line 10: `const TENANTS_DIR = join(CONFIG_DIR, "tenants");`

**Step 2: Fix the path**

Change line 10 from:
```typescript
const TENANTS_DIR = join(CONFIG_DIR, "tenants");
```
to:
```typescript
const TENANTS_DIR = CONFIG_DIR;
```

This makes `loadTenantContext("spring-cash")` look in `config/spring-cash/` which is where the files actually are.

**Step 3: Verify config files exist**

```bash
ls config/spring-cash/
ls config/spring-cash/company-context/
```

Expected: `icp-definitions.yaml`, `qualification-rules.yaml`, `routing-rules.yaml`, `response-templates.yaml`, and 6 company-context YAML files.

**Step 4: Commit**

```bash
git add lib/outbound/config/loader.ts
git commit -m "fix: config loader path — look in config/{tenant}/ not config/tenants/{tenant}/"
```

---

### Task 2: Give Spring Cash Its Own ICP/Qualification/Routing Configs

Currently the loader reads ICP definitions, qualification rules, and routing rules from `config/` root (shared). Spring Cash needs its own copies so they can customize scoring independently.

**Files:**
- Modify: `lib/outbound/config/loader.ts:134-141` — load from tenant dir first, fall back to shared
- Verify: `config/spring-cash/icp-definitions.yaml`, `config/spring-cash/qualification-rules.yaml`, `config/spring-cash/routing-rules.yaml` already exist

**Step 1: Check if Spring Cash already has these files**

```bash
ls -la config/spring-cash/icp-definitions.yaml config/spring-cash/qualification-rules.yaml config/spring-cash/routing-rules.yaml
```

These should already exist from the initial setup.

**Step 2: Update loader to prefer tenant-specific configs**

In `lib/outbound/config/loader.ts`, change the global config loading (around lines 134-141) from:

```typescript
const icp_definitions = loadYamlFile<Record<string, ICPDefinition>>(
  join(CONFIG_DIR, "icp-definitions.yaml")
);
const qualRaw = loadYamlFile<{ rules: QualificationRule[] }>(
  join(CONFIG_DIR, "qualification-rules.yaml")
);
const routing = loadYamlFile<RoutingConfig>(join(CONFIG_DIR, "routing-rules.yaml"));
```

to:

```typescript
const tenantDir = join(TENANTS_DIR, resolvedTenant);

function tenantOrShared(filename: string): string {
  const tenantPath = join(tenantDir, filename);
  if (existsSync(tenantPath)) return tenantPath;
  return join(CONFIG_DIR, filename);
}

const icp_definitions = loadYamlFile<Record<string, ICPDefinition>>(
  tenantOrShared("icp-definitions.yaml")
);
const qualRaw = loadYamlFile<{ rules: QualificationRule[] }>(
  tenantOrShared("qualification-rules.yaml")
);
const routing = loadYamlFile<RoutingConfig>(tenantOrShared("routing-rules.yaml"));
```

**Step 3: Commit**

```bash
git add lib/outbound/config/loader.ts
git commit -m "feat: load ICP/qualification/routing configs from tenant dir with shared fallback"
```

---

### Task 3: Scope the Config Editor to Current Tenant

The config list endpoint (`api/config/list.ts`) walks the entire `config/` directory, showing configs for ALL tenants. Spring Cash should only see their own configs.

**Files:**
- Modify: `api/config/list.ts` — scope to current tenant
- Modify: `api/config/read.ts` — scope to current tenant
- Modify: `api/config/write.ts` — scope to current tenant

**Step 1: Update list endpoint**

In `api/config/list.ts`, change:

```typescript
const CONFIG_DIR = join(process.cwd(), 'config');
```

to scope by tenant:

```typescript
const BASE_CONFIG_DIR = join(process.cwd(), 'config');

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const tenant = process.env.TENANT_ID || 'deepline';
    const tenantDir = join(BASE_CONFIG_DIR, tenant);

    // List tenant-specific configs only
    const files = walkDir(tenantDir);
    return res.json({ files, tenant });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
```

**Step 2: Update read endpoint**

In `api/config/read.ts`, change `CONFIG_DIR` to resolve within the tenant's directory:

```typescript
const BASE_CONFIG_DIR = join(process.cwd(), 'config');

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const tenant = process.env.TENANT_ID || 'deepline';
  const CONFIG_DIR = join(BASE_CONFIG_DIR, tenant);

  const file = req.query.file as string;
  if (!file) return res.status(400).json({ error: 'file parameter required' });

  const resolved = resolve(CONFIG_DIR, file);
  if (!resolved.startsWith(CONFIG_DIR)) return res.status(403).json({ error: 'Invalid path' });

  try {
    const content = readFileSync(resolved, 'utf-8');
    return res.json({ file, content });
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
}
```

**Step 3: Update write endpoint**

In `api/config/write.ts`, prefix the GitHub path with the tenant directory:

```typescript
const tenant = process.env.TENANT_ID || 'deepline';
const filePath = `config/${tenant}/${file}`;
```

**Step 4: Commit**

```bash
git add api/config/list.ts api/config/read.ts api/config/write.ts
git commit -m "feat: scope config editor to current tenant's config directory"
```

---

### Task 4: Enable Next.js Build for Spring Cash

The Spring Cash Vercel project currently uses `buildCommand: "echo skip"` which prevents the Next.js build. This means all `app/api/` routes (Slack interactions, leads, signals, dashboard) return 404.

**Files:**
- No code changes — Vercel project settings update only

**Step 1: Update build command via Vercel API**

```bash
# Get the Vercel auth token
TOKEN=$(cat ~/Library/Application\ Support/com.vercel.cli/auth.json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# Update Spring Cash project to use standard Next.js build
curl -s -X PATCH "https://api.vercel.com/v9/projects/prj_erm6lbZzyVnPhr5tvxRIWMezPiC6" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"buildCommand": null, "framework": "nextjs"}'
```

Setting `buildCommand: null` lets Vercel auto-detect Next.js and use the default `next build`.

**Step 2: Trigger a production deployment**

```bash
vercel deploy --prod
```

**Step 3: Verify App Router routes work**

```bash
# Slack interactions endpoint (should return 405 for GET, not 404)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/outbound/slack/interactions

# Signals overview (should return auth error, not 404)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/signals/overview

# Health endpoint (should still work)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/outbound/health
```

**Step 4: Verify login page and dashboard load**

```bash
curl -s https://gtm-signals-scoring-springcash.vercel.app/login.html | head -5
curl -s https://gtm-signals-scoring-springcash.vercel.app/dashboard/ | head -5
curl -s https://gtm-signals-scoring-springcash.vercel.app/config/ | head -5
```

---

### Task 5: Create Standalone Slack Interaction Handler (Vercel Functions)

The Slack interaction and event handlers are Next.js App Router routes at `app/api/outbound/slack/`. The `vercel.json` rewrites `/slack/interactions` → `/api/slack/interactions` and `/slack/events` → `/api/slack/events`. Since Task 4 enables the Next.js build, these routes should work. But as a safety measure, we should also create standalone Vercel Function versions at `api/slack/` so the Slack manifest URLs (`/slack/interactions`, `/slack/events`) work regardless of the build setup.

**Files:**
- Create: `api/slack/interactions.ts`
- Create: `api/slack/events.ts`

**Step 1: Create `api/slack/interactions.ts`**

```typescript
/**
 * Slack interactions handler (Vercel Functions version).
 * Handles button clicks from ReplyBot messages (approve, reject, edit, undo).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Parse raw body for signature verification
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers["x-slack-request-timestamp"] as string || "";
    const signature = req.headers["x-slack-signature"] as string || "";
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  // Parse payload
  let payload: any;
  try {
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");
    payload = payloadStr ? JSON.parse(payloadStr) : JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "invalid payload" });
  }

  // Import and delegate to the shared interaction handler
  try {
    const { handleInteraction } = await import("../../lib/outbound/slack/interactions.js");
    // Ack immediately — Slack needs response within 3s
    handleInteraction(payload).catch((err: Error) => {
      console.error("[slack/interactions] Error:", err.message);
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[slack/interactions] Import error:", err);
    return res.status(200).json({ ok: true }); // Still ack to Slack
  }
}

function verifySlackSignature(
  secret: string, timestamp: string, body: string, signature: string
): boolean {
  try {
    const sigBaseString = `v0:${timestamp}:${body}`;
    const mySignature = "v0=" + createHmac("sha256", secret).update(sigBaseString).digest("hex");
    return timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

**Step 2: Create `api/slack/events.ts`**

```typescript
/**
 * Slack events handler (Vercel Functions version).
 * Handles URL verification challenge and event subscriptions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // Handle URL verification challenge (no signature check needed)
  if (event?.type === "url_verification") {
    return res.status(200).json({ challenge: event.challenge });
  }

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers["x-slack-request-timestamp"] as string || "";
    const signature = req.headers["x-slack-signature"] as string || "";
    const sigBaseString = `v0:${timestamp}:${rawBody}`;
    const mySignature = "v0=" + createHmac("sha256", signingSecret).update(sigBaseString).digest("hex");
    try {
      if (!timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature))) {
        return res.status(401).json({ error: "invalid signature" });
      }
    } catch {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  // Ack — event processing is fire-and-forget
  console.log(`[slack/events] Received event: ${event?.event?.type || event?.type || "unknown"}`);
  return res.status(200).json({ ok: true });
}
```

**Step 3: Commit**

```bash
git add api/slack/interactions.ts api/slack/events.ts
git commit -m "feat: add standalone Slack interaction/event handlers as Vercel Functions"
```

---

### Task 6: Create Cron-Compatible Event Processing Endpoint

The `vercel.json` crons call `/api/cron/send-approved`, `/api/cron/bump-stale-drafts`, and `/api/events/process`. These are Next.js App Router routes. We need Vercel Function versions so crons work on the Spring Cash instance.

**Files:**
- Create: `api/cron/send-approved.ts`
- Create: `api/cron/bump-stale-drafts.ts`
- Create: `api/events/process.ts`

**Step 1: Read existing App Router cron handlers**

```bash
cat app/api/cron/bump-stale-drafts/route.ts
cat app/api/send-reply/route.ts
cat app/api/events/process/route.ts
```

**Step 2: Create Vercel Function versions**

Each cron handler should:
1. Verify `CRON_SECRET` from `Authorization: Bearer <token>` header
2. Import and call the same underlying logic
3. Return JSON result

For `api/cron/send-approved.ts`:
```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Import send logic — adapt from app/api/send-reply/route.ts
  try {
    // Query for conversations with status='approved' and send them
    const { query } = await import("../../src/db/client.js");
    const result = await query(
      "SELECT id FROM conversations WHERE status = 'approved' AND sent_at IS NULL"
    );
    return res.json({ ok: true, pending: result.rows.length });
  } catch (err: any) {
    console.error("[cron/send-approved]", err);
    return res.status(500).json({ error: err.message });
  }
}
```

*(Exact implementation depends on reading the existing App Router route — adapt accordingly.)*

**Step 3: Commit**

```bash
git add api/cron/ api/events/
git commit -m "feat: add Vercel Function cron handlers for Spring Cash instance"
```

---

### Task 7: Create the ReplyBot Consumer as a Vercel Function Cron

The outbound reply check currently runs as a Trigger.dev scheduled task. For Spring Cash to work independently without Trigger.dev, we need a cron-based alternative.

**Files:**
- Create: `api/cron/reply-check.ts`
- Modify: `vercel.json` — add cron entry

**Step 1: Create the cron endpoint**

Create `api/cron/reply-check.ts` that:
1. Verifies `CRON_SECRET`
2. Calls `get_unprocessed_events('replybot', 50)` to get new reply events
3. For each event: match template → LLM draft → post to Slack → mark processed
4. Returns summary

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../../src/db/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // Get unprocessed events
    const events = await query(
      "SELECT * FROM inbound.get_unprocessed_events($1, $2)",
      [process.env.APP_ID || "replybot", 50]
    );

    if (events.rows.length === 0) {
      return res.json({ ok: true, processed: 0, message: "no new events" });
    }

    // Import dependencies
    const { loadConfig } = await import("../../lib/outbound/config/loader.js");
    const { generateResponse } = await import("../../lib/outbound/llm.js");
    const { postMessage } = await import("../../lib/outbound/slack/client.js");
    const { formatOutboundReply } = await import("../../lib/outbound/slack/messages.js");

    const config = loadConfig();
    const templates = config.response_templates;
    const slackChannel = process.env.SLACK_CHANNEL_OUTBOUND || "#outbound-replies";

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const event of events.rows) {
      try {
        const replyText = event.reply_text;
        if (!replyText) {
          // Mark as skipped
          await query(
            `INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status, detail)
             VALUES ($1, $2, 'skipped', 'no reply text')
             ON CONFLICT (event_row_id, app_id) DO NOTHING`,
            [event.row_id, process.env.APP_ID || "replybot"]
          );
          skipped++;
          continue;
        }

        // Match template
        let matchedTemplate = templates[templates.length - 1]; // default fallback
        for (const tpl of templates) {
          try {
            if (new RegExp(tpl.trigger, "i").test(replyText)) {
              matchedTemplate = tpl;
              break;
            }
          } catch { /* skip invalid regex */ }
        }

        // Generate AI response
        const userMessage = `Reply from lead:\n${replyText}\n\nContext:\nName: ${event.first_name || ""} ${event.last_name || ""}\nCompany: ${event.company || ""}\nEmail: ${event.email || ""}`;
        const draftedResponse = await generateResponse({
          systemPrompt: matchedTemplate.system_prompt,
          userMessage,
          maxTokens: matchedTemplate.max_tokens,
          temperature: matchedTemplate.temperature,
        });

        // Post to Slack
        const leadName = [event.first_name, event.last_name].filter(Boolean).join(" ") || "Unknown";
        const { text, blocks } = formatOutboundReply({
          leadName,
          companyName: event.company || "Unknown",
          campaignName: event.campaign_name || event.campaign_id || "Unknown",
          originalReply: replyText,
          draftedResponse,
          campaignUrl: "",
          provider: event.source_platform || "unknown",
          conversationId: 0,
        });

        await postMessage({ channel: slackChannel, text, blocks });

        // Mark as processed
        await query(
          `INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status)
           VALUES ($1, $2, 'processed')
           ON CONFLICT (event_row_id, app_id) DO NOTHING`,
          [event.row_id, process.env.APP_ID || "replybot"]
        );

        processed++;
      } catch (err: any) {
        console.error(`[reply-check] Error processing event ${event.row_id}:`, err.message);
        await query(
          `INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status, detail)
           VALUES ($1, $2, 'error', $3)
           ON CONFLICT (event_row_id, app_id) DO NOTHING`,
          [event.row_id, process.env.APP_ID || "replybot", err.message]
        ).catch(() => {});
        errors++;
      }
    }

    return res.json({ ok: true, processed, skipped, errors, total: events.rows.length });
  } catch (err: any) {
    console.error("[reply-check] Fatal:", err);
    return res.status(500).json({ error: err.message });
  }
}
```

**Step 2: Add cron entry to vercel.json**

Add to the `crons` array:
```json
{ "path": "/api/cron/reply-check", "schedule": "*/15 8-18 * * 1-5" }
```

**Step 3: Commit**

```bash
git add api/cron/reply-check.ts vercel.json
git commit -m "feat: add ReplyBot consumer as Vercel cron (replaces Trigger.dev for standalone tenants)"
```

---

### Task 8: Create the Inbound Qualification Cron

Same pattern as Task 7 — port the Trigger.dev qualification job to a Vercel Function cron.

**Files:**
- Create: `api/cron/qualify-leads.ts`
- Modify: `vercel.json` — add cron entry

**Step 1: Create the cron endpoint**

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../../src/db/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const { qualifyLead } = await import("../../lib/outbound/engine/qualifier.js");
    const { routeLead } = await import("../../lib/outbound/engine/router.js");

    const leads = await query(
      "SELECT id FROM leads WHERE status = 'new' ORDER BY created_at ASC LIMIT 50"
    );

    if (leads.rows.length === 0) {
      return res.json({ ok: true, total: 0, qualified: 0, nurtured: 0, errors: 0 });
    }

    let qualified = 0, nurtured = 0, errors = 0;

    for (const lead of leads.rows) {
      try {
        const result = await qualifyLead(lead.id);
        if (result.qualified) qualified++;
        else nurtured++;
        await routeLead(lead.id);
      } catch (err: any) {
        console.error(`[qualify-leads] Error on lead ${lead.id}:`, err.message);
        errors++;
      }
    }

    return res.json({ ok: true, total: leads.rows.length, qualified, nurtured, errors });
  } catch (err: any) {
    console.error("[qualify-leads] Fatal:", err);
    return res.status(500).json({ error: err.message });
  }
}
```

**Step 2: Add cron entry**

```json
{ "path": "/api/cron/qualify-leads", "schedule": "0 * * * *" }
```

**Step 3: Commit**

```bash
git add api/cron/qualify-leads.ts vercel.json
git commit -m "feat: add inbound qualification cron (replaces Trigger.dev for standalone tenants)"
```

---

### Task 9: Add `CRON_SECRET` Env Var to Spring Cash

**Step 1: Generate a random secret**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Step 2: Set via Vercel API**

```bash
curl -s -X POST "https://api.vercel.com/v10/projects/prj_erm6lbZzyVnPhr5tvxRIWMezPiC6/env" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"CRON_SECRET","value":"<generated-secret>","type":"encrypted","target":["production","preview"]}'
```

---

### Task 10: Ensure Database Schema Has Required Functions

The ReplyBot consumer calls `inbound.get_unprocessed_events()` and uses `inbound.processed_webhook_events`. Verify these exist in the Spring Cash database.

**Files:**
- No code changes — database migration only

**Step 1: Check if the function exists**

```bash
DATABASE_URL="<spring-cash-url>" node --input-type=module -e "
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(\"SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'inbound' AND routine_name = 'get_unprocessed_events'\");
console.log('Function exists:', r.rows.length > 0);
await pool.end();
"
```

**Step 2: If missing, create the function and table**

```sql
-- processed_webhook_events table
CREATE TABLE IF NOT EXISTS inbound.processed_webhook_events (
  event_row_id UUID NOT NULL,
  app_id TEXT NOT NULL DEFAULT 'replybot',
  status TEXT NOT NULL DEFAULT 'processed',
  detail TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_row_id, app_id)
);

-- get_unprocessed_events function
CREATE OR REPLACE FUNCTION inbound.get_unprocessed_events(
  p_app_id TEXT DEFAULT 'replybot',
  p_limit INT DEFAULT 20
) RETURNS TABLE (
  row_id UUID, source TEXT, event_type TEXT, source_platform TEXT,
  reply_text TEXT, email TEXT, first_name TEXT, last_name TEXT,
  company TEXT, campaign_id TEXT, campaign_name TEXT, linkedin_url TEXT,
  received_at TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
) AS $$
  SELECT e.*
  FROM v_events e
  LEFT JOIN inbound.processed_webhook_events p
    ON p.event_row_id = e.row_id AND p.app_id = p_app_id
  WHERE p.event_row_id IS NULL
  ORDER BY e.created_at ASC
  LIMIT p_limit;
$$ LANGUAGE SQL;
```

**Step 3: Verify**

```sql
SELECT * FROM inbound.get_unprocessed_events('replybot', 5);
```

---

### Task 11: Deploy and Verify End-to-End

**Step 1: Push all changes**

```bash
git push origin main
```

**Step 2: Wait for Vercel auto-deploy (both instances)**

Check deployment status:
```bash
curl -s "https://api.vercel.com/v6/deployments?projectId=prj_erm6lbZzyVnPhr5tvxRIWMezPiC6&limit=1" \
  -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.deployments[0].state, j.deployments[0].url)})"
```

**Step 3: Verify all endpoints**

```bash
# Health
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/health

# Login
curl -s -X POST https://gtm-signals-scoring-springcash.vercel.app/api/auth/login \
  -H "Content-Type: application/json" -d '{"password":"springcash2026!"}'

# Config list (should show ONLY spring-cash configs)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/config/list \
  -H "Cookie: session=<token>"

# Webhook ingest
curl -s -X POST "https://gtm-signals-scoring-springcash.vercel.app/api/webhooks/ingest?source=test" \
  -H "Content-Type: application/json" \
  -d '{"type":"reply_received","lead":{"email":"test@example.com","name":"Test"},"message":"Interested!"}'

# Slack interactions (should return 405 for GET)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/slack/interactions

# Reply check cron (with CRON_SECRET)
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/cron/reply-check \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

### Task 12: Manual Steps for Ryan (Spring Cash Owner)

These require Slack workspace admin access and can't be automated:

**12a: Create Slack App**

1. Go to https://api.slack.com/apps
2. Click **Create New App** > **From a manifest**
3. Select the Spring Cash Slack workspace
4. Paste contents of `docs/slack-manifest-springcash.json`
5. Click **Create** > **Install to Workspace** > **Allow**

**12b: Copy Credentials to Vercel**

1. Copy **Bot User OAuth Token** from OAuth & Permissions page
2. Copy **Signing Secret** from Basic Information > App Credentials
3. Set env vars:

```bash
vercel env add SLACK_BOT_TOKEN        # paste xoxb-... token
vercel env add SLACK_SIGNING_SECRET   # paste signing secret
vercel env add SLACK_CHANNEL_OUTBOUND # #outbound-replies
vercel env add SLACK_CHANNEL_INBOUND  # #qualified-leads
```

**12c: Add OpenAI API Key**

```bash
vercel env add OPENAI_API_KEY         # paste sk-... key
```

**12d: Add GitHub Token (for Config Editor)**

1. Create fine-grained PAT at https://github.com/settings/tokens?type=beta
   - Repository: `getaero-io/gtm-signal-scoring`
   - Permissions: Contents (Read and Write)
2. Set env var:

```bash
vercel env add GITHUB_TOKEN           # paste ghp_... token
vercel env add GITHUB_REPO            # getaero-io/gtm-signal-scoring
```

**12e: Create Slack Channels**

1. Create `#outbound-replies` and `#qualified-leads` channels
2. Invite the bot: `/invite @SpringCashBot`

**12f: Redeploy**

```bash
vercel deploy --prod
```

---

## Architecture Summary (After Implementation)

```
Spring Cash Instance (gtm-signals-scoring-springcash.vercel.app)
├── Login (/login.html) → password: springcash2026!
├── Dashboard (/dashboard/) → leads explorer, signals, scoring
├── Config Editor (/config/) → edits config/spring-cash/*.yaml via GitHub API
│
├── API Layer (Vercel Functions)
│   ├── /api/auth/* → session auth (scrypt + HMAC-SHA256)
│   ├── /api/config/* → YAML CRUD (scoped to spring-cash tenant)
│   ├── /api/health → health check
│   ├── /api/webhooks/ingest → webhook receiver (SmartLead/HeyReach/Lemlist)
│   ├── /api/slack/interactions → Slack button handler (approve/reject/edit)
│   ├── /api/slack/events → Slack event subscriptions
│   └── /api/cron/* → scheduled jobs
│
├── Cron Jobs (Vercel Crons)
│   ├── reply-check (*/15 min, business hours) → poll events → LLM draft → Slack
│   ├── qualify-leads (hourly) → ICP scoring → route to rep/nurture
│   ├── send-approved (every min) → send approved replies
│   └── bump-stale-drafts (daily 8am) → remind on stale drafts
│
├── Config (config/spring-cash/)
│   ├── icp-definitions.yaml → scoring rules, weights, thresholds
│   ├── qualification-rules.yaml → lead filters
│   ├── routing-rules.yaml → rep assignment, channels
│   ├── response-templates.yaml → reply templates, LLM prompts
│   └── company-context/ → personas, messaging, FAQs, proof points
│
└── Database (Neon PostgreSQL — separate from Deepline)
    ├── inbound.leads → 5,958+ CPG leads
    ├── inbound.conversations → draft replies
    ├── inbound.webhook_events → audit trail
    ├── inbound.processed_webhook_events → dedup tracking
    └── dl_cache.enrichment_event → event queue
```

**What Spring Cash Can Do Independently:**
- Log in and view their leads dashboard
- Edit scoring rules, response templates, company context via config editor
- Receive webhook events from outbound platforms
- Get AI-drafted replies in their Slack with approve/reject/edit buttons
- Score and qualify inbound leads automatically
- Import leads from CSV

**What's Shared:**
- Codebase (same GitHub repo, same Vercel deploys)
- Deepline can relay webhooks to Spring Cash via `WEBHOOK_RELAY_TARGETS`
