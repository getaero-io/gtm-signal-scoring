# Spring Cash Instance — Complete Setup Guide

Everything you need to get the Spring Cash GTM platform running. Designed to be followed step-by-step via Claude Code.

## Instance Details

| Item | Value |
|------|-------|
| URL | https://gtm-signals-scoring-springcash.vercel.app |
| Login | `springcash2026!` |
| Vercel Project | `gtm-signals-scoring-springcash` |
| Tenant ID | `spring-cash` |
| Database | Neon PostgreSQL (provisioned) |
| GitHub Repo | `getaero-io/gtm-signal-scoring` (shared with Deepline) |

---

## 1. Slack App Setup (Required for ReplyBot)

### Create the app

1. Go to https://api.slack.com/apps
2. Click **Create New App** > **From a manifest**
3. Select your Spring Cash Slack workspace
4. Paste the manifest from `docs/slack-manifest-springcash.json`
5. Click **Create**

### Install to workspace

1. Go to **Install App** in the left sidebar
2. Click **Install to Workspace** > **Allow**

### Copy credentials

1. **Bot Token**: Go to **OAuth & Permissions** > copy the **Bot User OAuth Token** (starts with `xoxb-`)
2. **Signing Secret**: Go to **Basic Information** > **App Credentials** > copy **Signing Secret**

### Create Slack channels

Create these channels in your workspace:
- `#outbound-replies` — where ReplyBot posts draft replies for approval
- `#qualified-leads` — where qualified inbound leads are posted

Invite the bot to both channels: `/invite @SpringCashBot`

### Set env vars

```bash
# Via Vercel CLI (recommended)
vercel env add SLACK_BOT_TOKEN production    # paste xoxb-... token
vercel env add SLACK_SIGNING_SECRET production  # paste signing secret
vercel env add SLACK_CHANNEL_OUTBOUND production  # outbound-replies
vercel env add SLACK_CHANNEL_INBOUND production   # qualified-leads
```

### Redeploy

```bash
vercel deploy --prod
```

---

## 2. OpenAI API Key (Required for ReplyBot)

The ReplyBot uses GPT-5-mini to draft replies.

```bash
vercel env add OPENAI_API_KEY production  # paste your OpenAI API key
vercel deploy --prod
```

---

## 3. Config Editor (GitHub Integration)

The config editor saves changes by committing to GitHub (which triggers a Vercel redeploy).

1. Create a GitHub fine-grained PAT at https://github.com/settings/tokens?type=beta
   - Repository: `getaero-io/gtm-signal-scoring`
   - Permissions: **Contents** (Read and Write)
2. Set the env var:

```bash
vercel env add GITHUB_TOKEN production  # paste the PAT
vercel deploy --prod
```

---

## 4. Customizing Scoring & Behavior

All configuration is in YAML files under `config/tenants/spring-cash/`:

| File | What it controls |
|------|-----------------|
| `icp-definitions.yaml` | Scoring rules, weights, thresholds, anti-fit penalties |
| `qualification-rules.yaml` | Lead qualification filters and prompts |
| `routing-rules.yaml` | Rep assignment, Slack channels, nurture campaigns |
| `response-templates.yaml` | Reply templates (regex triggers, system prompts, tone) |
| `company-context/personas.yaml` | Buyer personas |
| `company-context/messaging-frameworks.yaml` | Value props, positioning |
| `company-context/use-cases.yaml` | Use cases and stories |
| `company-context/proof-points.yaml` | Case studies, metrics |
| `company-context/faqs.yaml` | Common questions and answers |

### Edit via Config Editor UI

1. Go to https://gtm-signals-scoring-springcash.vercel.app/config/
2. Log in with `springcash2026!`
3. Select a file, edit, and save

### Edit via Claude Code

```bash
# Read current config
cat config/tenants/spring-cash/icp-definitions.yaml

# Edit and commit
# ... make changes ...
git add config/tenants/spring-cash/
git commit -m "update: adjust scoring weights"
git push origin main
```

Changes auto-deploy via Vercel.

---

## 5. Importing Leads

```bash
# Import from CSV (upserts by email)
DATABASE_URL="<your-neon-connection-string>" npx tsx scripts/import-cpg-to-tamdb.ts data/your-file.csv
```

CSV columns auto-mapped: `email`, `first_name`, `last_name`, `company_name`, `domain`/`company_domain`, `linkedin_url`, `title`, `founder_name`, `founder_email`, `brand_name`, etc.

---

## 6. Testing the Full Flow

### Login
```bash
curl -s https://gtm-signals-scoring-springcash.vercel.app/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"password":"springcash2026!"}'
# Should return: {"ok":true} with Set-Cookie header
```

### Health check
```bash
curl https://gtm-signals-scoring-springcash.vercel.app/api/health
# Should return: {"ok":true,"time":"..."}
```

### Config list (needs auth)
```bash
curl https://gtm-signals-scoring-springcash.vercel.app/api/config/list \
  -H "Cookie: session=<session-token>"
```

### Test webhook
```bash
curl "https://gtm-signals-scoring-springcash.vercel.app/api/webhooks/ingest?source=heyreach" \
  -X POST -H "Content-Type: application/json" \
  -d '{"type":"reply_received","lead":{"email":"test@example.com"}}'
```

---

## 7. Architecture Overview

```
Browser --> /login.html (static)
        --> /dashboard/ (static, fetches API)
        --> /config/ (static, fetches API)

API (Vercel Functions):
  /api/auth/login     - Password login, sets session cookie
  /api/auth/check     - Verify session
  /api/auth/logout    - Clear session
  /api/config/list    - List YAML config files
  /api/config/read    - Read a config file
  /api/config/write   - Write config (commits to GitHub)
  /api/health         - Health check
  /api/webhooks/ingest - Universal webhook receiver
  /api/lemlist/webhook - Lemlist-specific webhook

Webhook Flow:
  HeyReach/Lemlist --> /api/webhooks/ingest (Deepline primary)
                      --> Relay to Spring Cash (fan-out)
                      --> Store in DB
                      --> Score lead
                      --> Draft reply via LLM
                      --> Post to Slack for approval
```

---

## 8. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TENANT_ID` | Yes | `spring-cash` |
| `SESSION_SECRET` | Yes | 64-char hex for session cookies |
| `LOGIN_PASSWORD_HASH` | Yes | scrypt hash of login password |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `SLACK_BOT_TOKEN` | For ReplyBot | Slack bot token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | For ReplyBot | Slack app signing secret |
| `SLACK_CHANNEL_OUTBOUND` | For ReplyBot | Channel for reply approvals |
| `SLACK_CHANNEL_INBOUND` | For ReplyBot | Channel for qualified leads |
| `OPENAI_API_KEY` | For ReplyBot | GPT-5-mini API key |
| `GITHUB_TOKEN` | For Config Editor | GitHub PAT with repo contents access |
| `GITHUB_REPO` | For Config Editor | `getaero-io/gtm-signal-scoring` |
| `CRON_SECRET` | For cron jobs | Bearer token for scheduled endpoints |

---

## 9. Common Tasks

| Task | How |
|------|-----|
| Change scoring weights | Edit `config/tenants/spring-cash/icp-definitions.yaml` |
| Add a new rep | Edit `config/tenants/spring-cash/routing-rules.yaml` |
| Change reply tone | Edit `response-templates.yaml` > `system_prompt` |
| Import leads from CSV | `npx tsx scripts/import-cpg-to-tamdb.ts data/file.csv` |
| View dashboard | https://gtm-signals-scoring-springcash.vercel.app/dashboard/ |
| Edit config in browser | https://gtm-signals-scoring-springcash.vercel.app/config/ |
| Check logs | `vercel logs gtm-signals-scoring-springcash` |
| Redeploy | `vercel deploy --prod` |
