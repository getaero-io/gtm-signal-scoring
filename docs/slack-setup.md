# Slack App Setup

Instructions for creating and configuring the Slack app for your GTM platform instance.

## 1. Update the Manifest URLs

Before creating the app, update `slack-app-manifest.json` with your deployment URL.

Replace both occurrences of the base URL:

```
"request_url": "https://zero-context-test.vercel.app/slack/interactions"
"request_url": "https://zero-context-test.vercel.app/slack/events"
```

Change to your deployment URL:

```
"request_url": "https://YOUR-PROJECT.vercel.app/slack/interactions"
"request_url": "https://YOUR-PROJECT.vercel.app/slack/events"
```

You can also update the `display_information.name` field if you want a different bot name (e.g., "SpringCashBot" instead of "DeepReplyBot").

## 2. Create the Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Select **From an app manifest**
4. Choose your workspace
5. Paste the contents of your updated `slack-app-manifest.json`
6. Click **Create**

## 3. Install to Workspace

1. On the app page, go to **Install App** in the sidebar
2. Click **Install to Workspace**
3. Authorize the requested permissions

## 4. Copy Credentials

You need two values from the Slack app:

**Bot User OAuth Token** (`SLACK_BOT_TOKEN`):
- Go to **OAuth & Permissions** in the sidebar
- Copy the **Bot User OAuth Token** (starts with `xoxb-`)

**Signing Secret** (`SLACK_SIGNING_SECRET`):
- Go to **Basic Information** in the sidebar
- Under **App Credentials**, copy the **Signing Secret**

## 5. Create Required Channels

Create these channels in your Slack workspace (names are configurable via env vars):

| Channel | Env Var | Purpose |
|---------|---------|---------|
| `#outbound-replies` | `SLACK_CHANNEL_OUTBOUND` | Reply drafts for approval (approve/reject/edit buttons) |
| `#qualified-leads` | `SLACK_CHANNEL_INBOUND` | Newly qualified leads with scoring breakdown |
| `#hot-leads` | (optional) | High-priority leads routed by scoring rules |

Invite the bot to each channel: type `/invite @DeepReplyBot` (or your bot name) in each channel.

## 6. Set Environment Variables

In your Vercel project:

```bash
vercel env add SLACK_BOT_TOKEN         # xoxb-... from step 4
vercel env add SLACK_SIGNING_SECRET    # Signing secret from step 4
vercel env add SLACK_CHANNEL_OUTBOUND  # #outbound-replies (or your channel name)
vercel env add SLACK_CHANNEL_INBOUND   # #qualified-leads (or your channel name)
```

Then redeploy:

```bash
vercel --prod
```

## 7. Bot Permissions Reference

The manifest requests these bot scopes (no changes needed if using the manifest):

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send messages to channels the bot is in |
| `chat:write.public` | Send messages to channels the bot is not in |
| `reactions:read` | Read emoji reactions on messages |
| `channels:history` | Read messages in public channels |
| `groups:history` | Read messages in private channels |
| `im:history` | Read direct messages |
| `mpim:history` | Read group direct messages |

## 8. Test the Integration

Send a test webhook to verify end-to-end:

```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/webhooks/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "type": "reply_received",
    "lead": {
      "name": "Test User",
      "company": "Test Corp",
      "title": "VP Engineering"
    },
    "message": "Thanks for reaching out, I would love to learn more about your platform."
  }'
```

If everything is configured correctly:
1. The webhook is ingested and stored in the database
2. The qualification pipeline runs
3. A Slack message appears in `#outbound-replies` (for reply drafts) or `#qualified-leads` (for qualified inbound leads)

## Troubleshooting

**Bot messages not appearing**: Verify the bot is invited to the channel. Check `vercel logs` for errors.

**Interactivity not working (buttons do nothing)**: Confirm the `request_url` in the manifest points to your actual deployment URL with the `/slack/interactions` path.

**"dispatch_failed" errors**: The Slack events URL is unreachable. Verify your deployment is live and the `/slack/events` endpoint responds to Slack's URL verification challenge.

**Signing verification failures**: Double-check `SLACK_SIGNING_SECRET` matches the value in Slack app Basic Information. The signing secret is different from the bot token.
