# HeyReach Webhook Cut-Over Procedure

How to add a new white-label instance (e.g., Spring Cash) to receive webhook events from the primary Deepline platform without changing any HeyReach configuration.

## Background

HeyReach supports only a single webhook destination URL per account. Rather than switching the destination (which would break the primary instance), the platform uses a **relay approach**: the primary instance receives all webhooks and fans them out to secondary instances.

The relay is implemented in `src/webhooks/relay.ts`. It uses `Promise.allSettled` so one target failing never blocks the others. The relay is fire-and-forget from the primary instance's perspective.

## Architecture

```
HeyReach → Primary Instance (/api/webhooks/ingest)
                ├── Process locally (as before)
                └── Relay to WEBHOOK_RELAY_TARGETS
                        └── Spring Cash Instance (/api/webhooks/ingest)
                                └── Process with Spring Cash config
```

## Pre-Cutover Checklist

Before enabling the relay, confirm each item:

- [ ] **Spring Cash instance deployed** — `vercel --prod` completed, health endpoint returns `{"ok":true}`
- [ ] **Database migrated** — Schema created in the Spring Cash Neon database
- [ ] **Slack app installed** — Bot is in the workspace, channels created, tokens set
- [ ] **All env vars set** — Verify with `vercel env ls` on the Spring Cash project
- [ ] **Config customized** — ICP definitions, routing rules, and response templates updated for Spring Cash
- [ ] **Login tested** — Can sign in to the Spring Cash dashboard
- [ ] **Config editor tested** — Can view and edit YAML files through the web UI

## Enabling the Relay

On the **primary instance** (not Spring Cash), set the relay target:

```bash
# In the primary Deepline project directory
vercel env add WEBHOOK_RELAY_TARGETS
# Value: https://spring-cash-gtm.vercel.app/api/webhooks/ingest
```

For multiple secondary instances, use comma-separated URLs:

```
https://spring-cash-gtm.vercel.app/api/webhooks/ingest,https://other-instance.vercel.app/api/webhooks/ingest
```

Then redeploy the primary instance:

```bash
vercel --prod
```

No changes to HeyReach configuration are required. The primary instance continues to receive webhooks at its existing URL and now also forwards them.

## Testing

### 1. Send a test webhook

```bash
curl -X POST https://YOUR-PRIMARY.vercel.app/api/webhooks/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "type": "reply_received",
    "lead": {
      "name": "Cutover Test",
      "company": "Test Corp",
      "title": "CFO"
    },
    "message": "Testing the relay."
  }'
```

### 2. Verify on both instances

- **Primary dashboard**: Confirm the test event appears in webhook events
- **Spring Cash dashboard**: Confirm the same event was received and stored
- **Primary Slack**: Check that the primary Slack workspace received the message
- **Spring Cash Slack**: Check that the Spring Cash Slack workspace received the message

### 3. Verify with a real HeyReach event

Wait for an organic reply to come through HeyReach, or trigger one manually. Confirm it appears on both dashboards.

## Monitoring the First 24 Hours

After enabling the relay in production:

1. **Check primary logs** for relay errors:
   ```bash
   vercel logs --follow
   ```
   Look for "Relay to ... failed" messages indicating the secondary instance is not accepting webhooks.

2. **Check Spring Cash logs** for ingest errors:
   ```bash
   # In the Spring Cash project directory
   vercel logs --follow
   ```

3. **Compare event counts**: After 24 hours, verify that the Spring Cash webhook_events table has roughly the same number of new events as the primary instance (they should match exactly, minus any that arrived before the relay was enabled).

4. **Check Slack channels**: Verify that qualified leads and reply drafts are appearing in the correct Slack workspace for each instance.

## Rollback

If something goes wrong, disable the relay by removing the environment variable on the primary instance:

```bash
# In the primary Deepline project directory
vercel env rm WEBHOOK_RELAY_TARGETS
vercel --prod
```

This immediately stops forwarding. The primary instance continues to operate normally. No data is lost on the primary side; the Spring Cash instance simply stops receiving new events until the relay is re-enabled.

## Adding More Instances

To add another white-label instance later:

1. Deploy the new instance (follow `docs/SETUP.md`)
2. Append its webhook URL to `WEBHOOK_RELAY_TARGETS` (comma-separated)
3. Redeploy the primary instance

The relay fans out to all targets in parallel. One failing target does not block delivery to others.
