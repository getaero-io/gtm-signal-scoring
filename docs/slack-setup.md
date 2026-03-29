# Slack App Setup Guide

Step-by-step instructions for creating Slack apps for the GTM Signal Scoring platform. You need one Slack app per tenant (Deepline and Spring Cash are separate Slack workspaces with separate apps).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create the Slack App from Manifest](#2-create-the-slack-app-from-manifest)
3. [Install the App to Your Workspace](#3-install-the-app-to-your-workspace)
4. [Copy Credentials](#4-copy-credentials)
5. [Create Slack Channels](#5-create-slack-channels)
6. [Set Vercel Environment Variables](#6-set-vercel-environment-variables)
7. [Verify the Setup](#7-verify-the-setup)
8. [Troubleshooting](#8-troubleshooting)
9. [Permissions Reference](#9-permissions-reference)
10. [Instance-Specific Details](#10-instance-specific-details)

---

## 1. Prerequisites

Before you start, make sure you have:

- Admin access to the Slack workspace where you want to install the app
- Access to the Vercel project for your tenant (either `gtm-signals-scoring-deepline` or `gtm-signals-scoring-springcash`)
- The Vercel CLI installed (`npm i -g vercel`) and logged in (`vercel login`)

---

## 2. Create the Slack App from Manifest

Slack lets you create an app by uploading a JSON manifest, which pre-configures all permissions, event subscriptions, and URLs. This repo includes ready-to-use manifests for both tenants.

### For Deepline

Use the manifest at: `docs/slack-manifest-deepline.json`

- App name: **DeepReplyBot**
- Interactivity URL: `https://gtm-signals-scoring-deepline.vercel.app/slack/interactions`
- Events URL: `https://gtm-signals-scoring-deepline.vercel.app/slack/events`

### For Spring Cash

Use the manifest at: `docs/slack-manifest-springcash.json`

- App name: **SpringCashBot**
- Interactivity URL: `https://gtm-signals-scoring-springcash.vercel.app/slack/interactions`
- Events URL: `https://gtm-signals-scoring-springcash.vercel.app/slack/events`

### Steps

1. Open https://api.slack.com/apps in your browser.
2. Click the green **Create New App** button.
3. In the dialog, select **From an app manifest**.
4. Choose the Slack workspace you want to install the app in, then click **Next**.
5. Select the **JSON** tab (it defaults to YAML -- make sure you switch to JSON).
6. Delete any placeholder text in the editor, then paste the entire contents of the correct manifest file (`slack-manifest-deepline.json` or `slack-manifest-springcash.json`).
7. Click **Next**.
8. Review the summary. You should see:
   - Bot name matches (DeepReplyBot or SpringCashBot)
   - Interactivity is enabled with the correct URL
   - Event subscriptions show `reaction_added` and `reaction_removed`
   - Bot scopes include `chat:write`, `chat:write.public`, `reactions:read`, and the history scopes
9. Click **Create**.

The app is now created but not yet installed.

---

## 3. Install the App to Your Workspace

1. After creating the app, you land on the **Basic Information** page.
2. In the left sidebar, click **Install App**.
3. Click the **Install to Workspace** button.
4. Slack shows a permission consent screen. Review the permissions and click **Allow**.

The app is now installed and has a Bot User OAuth Token.

---

## 4. Copy Credentials

You need two values from the Slack app. Keep them somewhere safe -- you will paste them into Vercel in the next step.

### Bot User OAuth Token

1. In the left sidebar, click **OAuth & Permissions**.
2. Under **OAuth Tokens for Your Workspace**, copy the **Bot User OAuth Token**.
   - It starts with `xoxb-`.
   - It looks like `xoxb-XXXX-XXXX-XXXX` (a long string of characters).

### Signing Secret

1. In the left sidebar, click **Basic Information**.
2. Scroll down to **App Credentials**.
3. Click **Show** next to **Signing Secret**, then copy the value.
   - It is a 32-character hex string.
   - Example: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

**Important:** The Signing Secret is NOT the same as the Client Secret. Make sure you copy the **Signing Secret** (the second item under App Credentials, not the first).

---

## 5. Create Slack Channels

Create the following channels in your Slack workspace. The channel names are up to you -- you will map them to env vars in the next step.

| Purpose | Suggested Channel Name | Description |
|---------|----------------------|-------------|
| Reply approvals | `#outbound-replies` | AI-drafted replies appear here with Approve / Edit / Reject buttons |
| Qualified leads | `#qualified-leads` | Newly qualified inbound leads with ICP scoring breakdown |
| Hot leads (optional) | `#hot-leads` | High-priority leads routed by scoring rules |

After creating each channel, invite the bot:

1. Open the channel in Slack.
2. Type `/invite @DeepReplyBot` (or `@SpringCashBot` for the Spring Cash workspace).
3. Press Enter. You should see a message confirming the bot was added.

If the bot does not appear in autocomplete, go back to https://api.slack.com/apps and confirm the app is installed (Step 3).

---

## 6. Set Vercel Environment Variables

Each Vercel project needs four Slack-related environment variables. Run these commands from the repo root.

### Deepline

```bash
# Link to the Deepline Vercel project (skip if already linked)
vercel link

# Set the environment variables (you will be prompted for the values)
vercel env add SLACK_BOT_TOKEN        # Paste the xoxb-... token from Step 4
vercel env add SLACK_SIGNING_SECRET   # Paste the signing secret from Step 4
vercel env add SLACK_CHANNEL_OUTBOUND # Type: #outbound-replies (or your channel name)
vercel env add SLACK_CHANNEL_INBOUND  # Type: #qualified-leads (or your channel name)
```

When prompted for which environments, select **Production**, **Preview**, and **Development** (press `a` to select all, then Enter).

### Spring Cash

```bash
# Link to the Spring Cash Vercel project
vercel link

# Set the environment variables (these are DIFFERENT values from Deepline)
vercel env add SLACK_BOT_TOKEN        # Paste the xoxb-... token from the Spring Cash app
vercel env add SLACK_SIGNING_SECRET   # Paste the signing secret from the Spring Cash app
vercel env add SLACK_CHANNEL_OUTBOUND # Type: #outbound-replies (or your channel name)
vercel env add SLACK_CHANNEL_INBOUND  # Type: #qualified-leads (or your channel name)
```

### Redeploy

After setting the env vars, trigger a production deployment so the new values take effect:

```bash
vercel --prod
```

### Full Env Var Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-123...` | Bot User OAuth Token from OAuth & Permissions page |
| `SLACK_SIGNING_SECRET` | Yes | `a1b2c3d4...` | Signing Secret from Basic Information page |
| `SLACK_CHANNEL_OUTBOUND` | Yes | `#outbound-replies` | Channel where reply drafts are posted for approval |
| `SLACK_CHANNEL_INBOUND` | Yes | `#qualified-leads` | Channel where qualified inbound leads are posted |

See `env.example` in the repo root for the complete list of all environment variables (not just Slack).

---

## 7. Verify the Setup

### Test 1: Health Check

Confirm the deployment is live:

```bash
# Deepline
curl -s https://gtm-signals-scoring-deepline.vercel.app/health

# Spring Cash
curl -s https://gtm-signals-scoring-springcash.vercel.app/health
```

You should get a 200 response with a JSON body.

### Test 2: Slack Events URL Verification

Slack automatically verifies the events URL when you create the app from a manifest. If it failed during creation, go to your app settings:

1. Open https://api.slack.com/apps and select your app.
2. Click **Event Subscriptions** in the sidebar.
3. The Request URL should show a green checkmark next to "Verified".
4. If it shows an error, click the URL field and press **Save Changes** to re-trigger verification. If it still fails, check that the deployment is live and the `/slack/events` endpoint is responding.

### Test 3: End-to-End

Send a test webhook to see if a Slack message appears:

```bash
# Deepline
curl -X POST https://gtm-signals-scoring-deepline.vercel.app/api/webhooks/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "type": "reply_received",
    "lead": {
      "name": "Test User",
      "company": "Test Corp",
      "title": "VP Engineering"
    },
    "message": "Thanks for reaching out, I would love to learn more."
  }'

# Spring Cash
curl -X POST https://gtm-signals-scoring-springcash.vercel.app/api/webhooks/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "type": "reply_received",
    "lead": {
      "name": "Test User",
      "company": "Test Corp",
      "title": "VP Engineering"
    },
    "message": "Thanks for reaching out, I would love to learn more."
  }'
```

If everything is working:
1. The webhook is ingested and stored in the database.
2. The qualification pipeline runs.
3. A Slack message appears in `#outbound-replies` with **Approve & Send**, **Edit**, and **Reject** buttons.
4. Clicking a button triggers the interactivity handler and updates the message.

---

## 8. Troubleshooting

### Bot messages not appearing in the channel

- Confirm the bot is invited to the channel (type `/invite @DeepReplyBot` in the channel).
- Check that `SLACK_CHANNEL_OUTBOUND` matches the actual channel name (include the `#`).
- Check Vercel function logs: run `vercel logs --follow` or view them in the Vercel dashboard under the Functions tab.

### Buttons do nothing when clicked

- Go to your app at https://api.slack.com/apps, then click **Interactivity & Shortcuts** in the sidebar.
- Confirm **Interactivity** is toggled ON.
- Confirm the **Request URL** exactly matches:
  - Deepline: `https://gtm-signals-scoring-deepline.vercel.app/slack/interactions`
  - Spring Cash: `https://gtm-signals-scoring-springcash.vercel.app/slack/interactions`

### "dispatch_failed" error in Slack

This means Slack cannot reach your events URL.

- Confirm the deployment is live by hitting the `/health` endpoint.
- Go to **Event Subscriptions** in your app settings and check that the Request URL shows "Verified".
- If the URL changed (e.g., you moved to a custom domain), update it in both **Event Subscriptions** AND **Interactivity & Shortcuts**.

### Signing verification failures (401 errors in function logs)

- Double-check that `SLACK_SIGNING_SECRET` is the **Signing Secret** from Basic Information, NOT the Client Secret.
- Make sure the env var is set for the correct environment (Production). Run `vercel env ls` to check.
- If you regenerated the signing secret in Slack, update it in Vercel and redeploy.

### "SLACK_BOT_TOKEN env var is required" error

- The `SLACK_BOT_TOKEN` environment variable is not set or is empty.
- Run `vercel env ls` to confirm it exists, and `vercel env add SLACK_BOT_TOKEN` to set it.
- Redeploy after setting: `vercel --prod`.

### Undo Send button not working

- The Undo Send button appears after approving a reply and has a ~60-second window.
- If clicking it does nothing, the interactivity URL may be misconfigured (see "Buttons do nothing" above).
- If it says "Could not cancel", the 60-second window has passed and the reply was already sent.

---

## 9. Permissions Reference

These are the bot OAuth scopes requested by the manifest. You do not need to configure these manually -- they are set automatically when you create the app from the manifest.

| Scope | Why It Is Needed |
|-------|-----------------|
| `chat:write` | Post messages (reply drafts, qualified leads) to channels the bot is a member of |
| `chat:write.public` | Post messages to public channels the bot has not been invited to (fallback) |
| `reactions:read` | Read emoji reactions on messages (used for reaction-based workflows) |
| `channels:history` | Read message history in public channels (needed to read thread replies for the Edit flow) |
| `groups:history` | Read message history in private channels (same as above, for private channels) |
| `im:history` | Read direct message history (if the bot is used in DMs) |
| `mpim:history` | Read group DM history (if the bot is used in group DMs) |

### Subscribed Bot Events

| Event | Why It Is Needed |
|-------|-----------------|
| `reaction_added` | Detect when a user reacts to a bot message (potential workflow triggers) |
| `reaction_removed` | Detect when a reaction is removed |

---

## 10. Instance-Specific Details

### Deepline

| Setting | Value |
|---------|-------|
| App name | DeepReplyBot |
| Manifest file | `docs/slack-manifest-deepline.json` |
| Vercel project URL | `https://gtm-signals-scoring-deepline.vercel.app` |
| Interactivity URL | `https://gtm-signals-scoring-deepline.vercel.app/slack/interactions` |
| Events URL | `https://gtm-signals-scoring-deepline.vercel.app/slack/events` |
| Tenant ID env var | `TENANT_ID=deepline` |

### Spring Cash

| Setting | Value |
|---------|-------|
| App name | SpringCashBot |
| Manifest file | `docs/slack-manifest-springcash.json` |
| Vercel project URL | `https://gtm-signals-scoring-springcash.vercel.app` |
| Interactivity URL | `https://gtm-signals-scoring-springcash.vercel.app/slack/interactions` |
| Events URL | `https://gtm-signals-scoring-springcash.vercel.app/slack/events` |
| Tenant ID env var | `TENANT_ID=spring-cash` |

### Updating URLs Later (Custom Domains)

If you move to a custom domain (e.g., `app.springcash.com`), you need to update two places:

1. **Slack App Settings** -- Go to https://api.slack.com/apps, select your app, and update:
   - **Interactivity & Shortcuts** > Request URL
   - **Event Subscriptions** > Request URL
2. **Manifest file in this repo** -- Update the manifest JSON file so future app recreations use the correct URL.

You do NOT need to change any Vercel environment variables when changing the domain -- the Slack URLs are configured on the Slack side only.
