# Setup Guide

Step-by-step instructions for deploying your own instance of the GTM Signal Routing Platform.

## Prerequisites

- GitHub account with access to this repository
- Vercel account (Pro plan recommended for cron job frequency)
- Slack workspace with admin privileges (to install the bot)
- Node.js 20+ and npm installed locally
- A Neon account (or any PostgreSQL provider, but Neon integrates directly with Vercel)

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_ORG/zero-context-test.git
cd zero-context-test
npm install
```

If you are creating a white-label deployment, fork the repo first, then clone the fork.

## 2. Create a Vercel Project

```bash
npm i -g vercel       # if not already installed
vercel login
vercel link           # follow the prompts to create or link a project
```

Choose a project name that reflects the deployment (e.g., `spring-cash-gtm`).

## 3. Add Neon Database

The easiest path is through the Vercel integration, which auto-provisions a database and sets `DATABASE_URL`:

```bash
vercel integration add neon
```

Alternatively, create a Neon project manually at https://console.neon.tech and copy the connection string.

## 4. Pull Environment Variables

After the Neon integration sets `DATABASE_URL`:

```bash
vercel env pull .env.local
```

This creates `.env.local` with any variables already configured in Vercel.

## 5. Run Database Migration

```bash
npx tsx -e "import{readFileSync}from'fs';import pg from'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query(readFileSync('src/db/schema.sql','utf-8'));console.log('done');await p.end()"
```

Or load `.env.local` first if running outside Vercel:

```bash
source .env.local
npx tsx src/db/migrate.ts
```

## 6. Create the Slack App

See [docs/slack-setup.md](slack-setup.md) for detailed instructions. The short version:

1. Update URLs in `slack-app-manifest.json` to point to your Vercel deployment
2. Go to https://api.slack.com/apps → Create New App → From an app manifest
3. Paste the updated manifest
4. Install to your workspace
5. Copy the Bot Token and Signing Secret

## 7. Set Environment Variables

Set each variable in Vercel (Settings → Environment Variables) or via CLI:

```bash
vercel env add SESSION_SECRET          # Random 64-char hex string
vercel env add LOGIN_PASSWORD_HASH     # scrypt hash of your login password
vercel env add SLACK_BOT_TOKEN         # From Slack app (xoxb-...)
vercel env add SLACK_SIGNING_SECRET    # From Slack app → Basic Information
vercel env add SLACK_CHANNEL_OUTBOUND  # e.g., #outbound-replies
vercel env add SLACK_CHANNEL_INBOUND   # e.g., #qualified-leads
vercel env add OPENAI_API_KEY          # From https://platform.openai.com/api-keys
vercel env add CRON_SECRET             # Random string for cron auth
vercel env add ADMIN_API_KEY           # Random string for admin endpoints
vercel env add GITHUB_TOKEN            # Fine-grained PAT with repo contents read/write
vercel env add GITHUB_REPO             # owner/repo-name
vercel env add TRIGGER_ACCESS_TOKEN    # From Trigger.dev project settings
```

Optional integrations (add if applicable):

```bash
vercel env add DEEPLINE_API_KEY
vercel env add LEMLIST_API_KEY
vercel env add LEMLIST_CAMPAIGN_IDS
vercel env add WEBHOOK_RELAY_TARGETS   # PRIMARY instance only — see docs/CUTOVER.md
```

Generate a `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

Generate a `LOGIN_PASSWORD_HASH` (replace `your-password`):

```bash
npx tsx -e "import{scryptSync,randomBytes}from'crypto';const s=randomBytes(16).toString('hex');console.log(s+':'+scryptSync('your-password',s,64).toString('hex'))"
```

See `env.example` for the complete list with descriptions.

## 8. Import Data (Optional)

If you have a CSV of leads to import:

```bash
npx tsx scripts/import-cpg-to-tamdb.ts data/your-file.csv
```

## 9. Deploy

```bash
vercel --prod
```

## 10. Verify the Deployment

1. **Health endpoint**: `curl https://YOUR-PROJECT.vercel.app/api/health` should return `{"ok":true}`
2. **Login**: Visit `https://YOUR-PROJECT.vercel.app/login.html` and sign in with your password
3. **Dashboard**: After login, visit `/dashboard/` to confirm data loads
4. **Config editor**: Visit `/config/` to confirm YAML configs are editable
5. **Slack**: Send a test webhook to `/api/webhooks/ingest` and confirm a Slack message appears

## 11. Set Up Trigger.dev (Background Jobs)

Trigger.dev runs the background jobs (reply polling, qualification pipeline, signal discovery).

1. Create a project at https://trigger.dev
2. Copy the project access token
3. Set `TRIGGER_ACCESS_TOKEN` in Vercel env vars
4. Deploy the Trigger.dev jobs:

```bash
npx trigger deploy
```

## 12. Customization

### Via the Web Config Editor

Visit `/config/` after logging in. You can edit all YAML configuration files directly in the browser. Changes are committed to the GitHub repo automatically (requires `GITHUB_TOKEN` and `GITHUB_REPO`).

### Via Claude Code

Open the repo in Claude Code. The `CLAUDE.md` file at the root gives Claude full context about the architecture, config files, and common tasks. Example prompts:

- "Add a new ICP rule that penalizes companies with fewer than 10 employees"
- "Change the reply tone to be more formal"
- "Add a new rep named Sarah to the routing rules"

### Via Direct Git

Edit the YAML files in `config/` directly and push. The next Vercel deployment picks up the changes automatically.
