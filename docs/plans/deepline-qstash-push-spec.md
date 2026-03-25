# Deepline Cloud: QStash Push on New tamdb Events

## Overview

When Deepline cloud writes a new webhook event to `dl_cache.enrichment_event`, it should also publish a QStash message to notify the gtm-signal-scoring app that new events are available for processing.

This replaces the previous architecture where each provider (Lemlist, SmartLead, HeyReach) sent webhooks directly to the app. Now tamdb is the single source of truth, and the app only reads from tamdb.

## Trigger

When a new row is inserted into `dl_cache.enrichment_event` with `source LIKE 'cache:local:event_tamdb_write:%'`.

## Action

POST to QStash publish endpoint:

```
POST https://qstash.upstash.io/v2/publish/{APP_WEBHOOK_URL}/api/events/process
Authorization: Bearer ${QSTASH_TOKEN}
Content-Type: application/json
Upstash-Deduplication-Id: {event_row_id}

{
  "event_row_id": "<row_id>",
  "source": "<source column value>",
  "timestamp": "<created_at>"
}
```

## Configuration (env vars on Deepline cloud)

| Variable | Description |
|----------|-------------|
| `QSTASH_TOKEN` | From Upstash QStash dashboard → REST API token |
| `APP_WEBHOOK_URL` | The app's base URL, e.g. `https://gtm-signal-scoring.vercel.app` |

## Dedup

QStash has built-in dedup via the `Upstash-Deduplication-Id` header. Use `event_row_id` (UUID) as the dedup key. This prevents duplicate notifications if the same event triggers multiple writes.

## Retry

QStash retries automatically (3 attempts with exponential backoff by default). The app's cron fallback (`GET /api/events/process` every 5 minutes via `vercel.json`) catches anything QStash misses.

## App-Side Processing

The app's event processor (`POST /api/events/process`) does NOT use the QStash body payload to process events. It simply treats the notification as a "wake up" signal and queries tamdb directly:

```sql
SELECT e.row_id, e.source, e.doc, e.created_at, e.updated_at
FROM dl_cache.enrichment_event e
LEFT JOIN inbound.processed_webhook_events p ON p.event_row_id = e.row_id
WHERE p.event_row_id IS NULL
  AND e.source LIKE 'cache:local:event_tamdb_write:%'
ORDER BY e.created_at ASC
LIMIT 20
```

This means:
- The QStash payload is informational only (for logging/debugging)
- The app is idempotent — re-triggering processes nothing if all events are already handled
- No data passes through QStash that isn't already in tamdb

## Implementation Options

1. **Application-level (recommended):** After Deepline cloud writes to tamdb, it also calls QStash publish in the same code path. Simplest, no Postgres extensions needed.

2. **Postgres trigger + pg_notify + listener:** A trigger on `dl_cache.enrichment_event` INSERT fires `pg_notify`. A Deepline cloud worker listens and publishes to QStash.

3. **Postgres trigger + pg_cron:** A `pg_cron` job every 30 seconds checks for new events and publishes to QStash.

**Recommendation:** Option 1. It's the simplest path and keeps the notification logic close to the write logic. Options 2-3 add infrastructure complexity for marginal benefit since the app already has a cron fallback.

## Example Implementation (Node.js)

```typescript
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// After writing to tamdb:
await qstash.publishJSON({
  url: `${process.env.APP_WEBHOOK_URL}/api/events/process`,
  body: { event_row_id: rowId, source, timestamp: new Date().toISOString() },
  deduplicationId: rowId,
});
```
