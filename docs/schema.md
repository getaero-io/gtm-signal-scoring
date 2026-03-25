# Deepline Platform Schema Reference

> For vibe coders building on Deepline's Postgres internals.

## Quick Start

```sql
-- Get unprocessed reply events for your app
SELECT * FROM get_unprocessed_events('my_app', 50);

-- Browse all contacts with flattened fields
SELECT email, full_name, title, brand_name, domain
FROM v_contacts
WHERE email_status = 'valid' AND is_founder = true;

-- Browse all webhook events with flattened fields
SELECT event_type, source_platform, email, reply_text, campaign_name
FROM v_events
WHERE event_type = 'reply';

-- Mark an event as processed by your app
INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status)
VALUES ('some-uuid', 'my_app', 'processed')
ON CONFLICT (event_row_id, app_id) DO NOTHING;
```

---

## Views

### `v_contacts`

Flattened view of `dl_resolved.resolved_people`. Every row is a resolved person record from Deepline's identity resolution pipeline.

| Column | Type | Description |
|--------|------|-------------|
| `row_id` | UUID | Primary identifier |
| `email` | TEXT | Primary email address |
| `first_name` | TEXT | First name |
| `last_name` | TEXT | Last name |
| `full_name` | TEXT | Full name (combined) |
| `title` | TEXT | Job title (falls back to founder title) |
| `is_founder` | BOOLEAN | True if Deepline detected a founder title |
| `brand_name` | TEXT | Company/brand name from enrichment |
| `domain` | TEXT | Primary domain |
| `email_status` | TEXT | ZeroBounce validation: `valid`, `invalid`, `catch-all`, `unknown` |
| `is_free_email` | BOOLEAN | True if Gmail, Yahoo, etc. |
| `mx_found` | BOOLEAN | True if domain has MX records |
| `linkedin_url` | TEXT | LinkedIn profile URL |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Last update time |

**Example: Find all valid founders at non-free-email domains**
```sql
SELECT email, full_name, title, brand_name, domain
FROM v_contacts
WHERE is_founder = true
  AND email_status = 'valid'
  AND is_free_email = false
ORDER BY created_at DESC;
```

### `v_events`

Flattened view of `dl_cache.enrichment_event`. Every row is a webhook event from an outbound platform (Lemlist, SmartLead, HeyReach, Instantly) that flowed through Deepline.

| Column | Type | Description |
|--------|------|-------------|
| `row_id` | UUID | Event identifier (use for dedup/claiming) |
| `source` | TEXT | Raw source string (e.g. `cache:local:event_tamdb_write:lemlist`) |
| `event_type` | TEXT | Event classification: `reply`, `email_replied`, `linkedinreplied`, etc. |
| `source_platform` | TEXT | Platform name: `lemlist`, `smartlead`, `heyreach`, `instantly` |
| `reply_text` | TEXT | The prospect's reply message |
| `email` | TEXT | Prospect's email |
| `first_name` | TEXT | Prospect's first name |
| `last_name` | TEXT | Prospect's last name |
| `company` | TEXT | Prospect's company name |
| `campaign_id` | TEXT | Campaign identifier on the source platform |
| `campaign_name` | TEXT | Human-readable campaign name |
| `linkedin_url` | TEXT | Prospect's LinkedIn URL |
| `received_at` | TEXT | When the event was received by the platform |
| `created_at` | TIMESTAMPTZ | When the event landed in tamdb |
| `updated_at` | TIMESTAMPTZ | Last update time |

**Example: Get all reply events from the last 24 hours**
```sql
SELECT source_platform, email, first_name, reply_text, campaign_name
FROM v_events
WHERE event_type IN ('reply', 'email_replied', 'linkedinreplied')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## Functions

### `get_unprocessed_events(app_id, limit)`

Returns events from `v_events` that haven't been claimed by the given `app_id`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `p_app_id` | TEXT | `'replybot'` | Your app's identifier |
| `p_limit` | INT | `20` | Max events to return |

```sql
-- Get 50 unprocessed events for your custom app
SELECT * FROM get_unprocessed_events('my_slack_bot', 50);
```

---

## Tables

### `inbound.processed_webhook_events`

Tracks which events each app has processed. Composite primary key `(event_row_id, app_id)` allows multiple independent apps to process the same event stream.

| Column | Type | Description |
|--------|------|-------------|
| `event_row_id` | UUID | FK to `dl_cache.enrichment_event.row_id` |
| `app_id` | TEXT | Your app's identifier (default: `replybot`) |
| `status` | TEXT | `processed`, `skipped`, `error` |
| `detail` | TEXT | Optional detail (e.g. skip reason, error message) |
| `processed_at` | TIMESTAMPTZ | When the event was processed |

**Claiming events (idempotent):**
```sql
INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status, detail)
VALUES ($1, 'my_app', 'processed', NULL)
ON CONFLICT (event_row_id, app_id) DO NOTHING;
```

### `inbound.leads`

Lead records created by the event processor.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `full_name` | TEXT | Display name |
| `first_name` | TEXT | First name |
| `last_name` | TEXT | Last name |
| `email` | TEXT | Email address |
| `company_name` | TEXT | Company name |
| `source` | TEXT | Lead source platform |
| `status` | TEXT | `replied`, `qualified`, `nurture`, `disqualified` |
| `qualification_score` | INT | ICP qualification score |
| `atlas_score` | INT | Alternative score (batch scoring) |
| `metadata` | JSONB | Flexible metadata (campaign_id, hubspot_deal_id, etc.) |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Last update |

**Tier mapping:**
| Tier | Score Range | Meaning |
|------|------------|---------|
| Tier 1 | 70+ | High priority — strong ICP fit, reachable |
| Tier 2 | 50-69 | Nurture — good fit, build relationship |
| Tier 3 | 30-49 | Low priority — partial fit or limited contact info |
| Tier 4 | 0-29 | Skip — poor fit, unreachable, or inactive |

```sql
-- Canonical score expression
SELECT *, COALESCE(qualification_score, atlas_score, 0) AS score
FROM inbound.leads
WHERE COALESCE(qualification_score, atlas_score, 0) >= 70
ORDER BY score DESC;
```

### `inbound.conversations`

Drafted replies pending Slack approval.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `lead_id` | UUID | FK to leads |
| `direction` | TEXT | `inbound` |
| `channel` | TEXT | `email` or `linkedin` |
| `original_message` | TEXT | The prospect's reply |
| `drafted_response` | TEXT | LLM-generated response |
| `status` | TEXT | `pending`, `approved`, `rejected`, `sent` |
| `slack_message_ts` | TEXT | Slack message timestamp (for updating) |
| `slack_channel` | TEXT | Slack channel ID |
| `metadata` | JSONB | Campaign info, template matched, rep assigned |

### `inbound.learnings`

Signal store for enrichment data, ICP scores, and reply intent signals.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `entity_type` | TEXT | `lead`, `company` |
| `entity_id` | TEXT | Lead ID or domain |
| `category` | TEXT | `icp_score`, `reply_signal`, `vector_enrichment` |
| `key` | TEXT | Signal key (e.g. ICP name, `intent`, `channel`) |
| `value` | TEXT | Signal value (JSON for complex data) |
| `confidence` | INT | 0-100 confidence score |
| `source` | TEXT | Data source (e.g. `lemlist_webhook`, `vector.co`) |
| `metadata` | JSONB | Additional context |

---

## Building Your Own App

1. **Pick an `app_id`** — any unique string (e.g. `my_slack_bot`, `crm_sync`)
2. **Poll for events** — `SELECT * FROM get_unprocessed_events('my_app', 50)`
3. **Process each event** — do whatever your app does
4. **Mark as processed** — `INSERT INTO inbound.processed_webhook_events (event_row_id, app_id, status) VALUES ($1, 'my_app', 'processed') ON CONFLICT DO NOTHING`
5. **Repeat** — on a cron, QStash push, or manual trigger

The Replybot reference app (`APP_ID=replybot`) does exactly this: poll → match reply template → LLM draft → Slack approval → send.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Read-only Postgres connection string (tamdb) |
| `DATABASE_WRITE_URL` | Yes | Read-write Postgres connection string |
| `APP_ID` | No | Your app's identifier (default: `replybot`) |
| `QSTASH_CURRENT_SIGNING_KEY` | No | For QStash push notifications |
| `QSTASH_NEXT_SIGNING_KEY` | No | For QStash key rotation |
| `OPENAI_API_KEY` | No | For LLM reply drafting |
| `SLACK_BOT_TOKEN` | No | For Slack notifications |
| `DEEPLINE_API_KEY` | No | For Deepline gateway integrations (HubSpot, etc.) |
