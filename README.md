<p align="center">
  <a href="https://deepline.com">
    <img src="docs/images/deepline-logo.svg" alt="Deepline" width="200" />
  </a>
</p>

<h1 align="center">GTM Signal Scoring</h1>

<p align="center">
  Open-source go-to-market signal scoring and outbound automation.<br/>
  Account intelligence, AI-powered reply drafting, lead qualification, and sales routing — powered by <a href="https://deepline.com">Deepline</a>.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="docs/API.md">API Docs</a> &middot;
  <a href="https://deepline.com">Deepline</a> &middot;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-blue" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Deepline-enrichment-purple" alt="Deepline" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/github/stars/getaero-io/gtm-signal-scoring?style=social" alt="GitHub stars" />
</p>

---

> **This repo has been anonymized.** Company names, signals, scoring weights, and configuration values have been scrubbed or replaced with representative examples — they are not real or accurate. The architecture, code patterns, and integrations are production-tested, but the specific data you see is illustrative. Customize the Atlas scoring weights, P0 title patterns, ICP definitions, qualification rules, and integration hooks for your own go-to-market motion before deploying.

## What is this?

A standalone GTM engineering platform that turns your PostgreSQL database into a ranked account intelligence layer. Built for sales and revenue teams who want **signal-based prioritization**, **automated outbound reply handling**, and **lead qualification** — without relying on expensive all-in-one platforms.

**Built with:** Next.js, PostgreSQL (Neon), [Deepline](https://deepline.com) enrichment, OpenAI, Slack, Lemlist/SmartLead/Instantly/HeyReach, Attio CRM, HubSpot

---

## Features

### Signal Scoring (Atlas Algorithm)

- Scores every account using tech stack adoption, contact seniority, and P0 penetration signals
- 30-day score trends with observed vs. derived data clearly labeled
- Configurable ICP definitions and qualification rules via YAML
- Backtested scoring weights you can override for your GTM motion

### Outbound Reply Engine

- **Multi-provider**: Lemlist, SmartLead, Instantly, HeyReach — all routed through [Deepline](https://deepline.com) gateway
- Receives inbound replies via **webhooks** (Lemlist) and **polling** (SmartLead/Instantly/HeyReach via Trigger.dev)
- Drafts AI-powered responses using **OpenAI GPT-5-mini** with full company context
- Posts to **Slack** for human review with Approve / Edit / Reject buttons
- **Undo Send** — approved messages queue for 60s via [Upstash QStash](https://upstash.com/qstash) before delivery
- Round-robin lead routing to sales reps with **Attio CRM** + **HubSpot** sync

### Lead Qualification Pipeline

- AI-powered qualification against configurable ICP definitions
- Website scraping + LLM analysis for product-market fit scoring
- Automatic routing: qualified leads go to reps, others enter nurture campaigns
- Full audit trail of every routing decision

### Safety & Security

- API key auth, Slack HMAC-SHA256 verification, Lemlist shared secret, QStash signature verification
- Sliding-window rate limiting (DB-backed), SSRF protection, PII redaction
- LLM prompt injection guardrails, Zod input validation, error sanitization
- 60-second undo-send queue via QStash with cancellation support

---

## Architecture

```text
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Lemlist     │───▶│  Webhook API │───▶│  LLM Draft  │
│  SmartLead   │    │ /api/outbound│    │  (OpenAI)   │
│  Instantly   │    └──────┬───────┘    └──────┬──────┘
│  HeyReach    │           │                    │
└─────────────┘     ┌──────▼────────────────────▼──────┐
                    │         PostgreSQL (Neon)          │
                    │  inbound.leads | conversations     │
                    │  qualification_results | routing    │
                    │  message_queue | rate_limit_log    │
                    └──────┬────────────────────────────┘
                           │
               ┌───────────▼───────────┐
               │     Slack Approval     │
               │  Approve │ Edit │ Undo │
               └───────────┬───────────┘
                           │
              ┌────────────▼────────────┐
              │  QStash (60s delay)      │
              │  → /api/send-reply       │
              │  → Deepline Gateway      │
              │  → Provider-specific API │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Attio + HubSpot CRM    │
              └─────────────────────────┘
```

**Data flow:** [Deepline](https://deepline.com) enriches company and contact records → Atlas algorithm scores accounts → qualified leads route to sales reps → outbound replies get AI-drafted responses → Slack approval workflow → QStash delayed queue with undo-send → Deepline gateway sends via correct provider → CRM sync.

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** ([Neon](https://neon.tech) recommended) with `dl_resolved` and `dl_graph` schemas
- **[Deepline CLI](https://deepline.com)** installed and authenticated (for enrichment)

### Install

```bash
git clone https://github.com/getaero-io/gtm-signal-scoring
cd gtm-signal-scoring
npm install
cp .env.example .env.local
# Edit .env.local — see Environment Variables below
```

### Run Database Migrations

```bash
# Core schema (accounts, scoring)
psql $DATABASE_URL -f scripts/migrate.sql

# Outbound engine (leads, conversations, qualification, routing)
psql $DATABASE_URL -f scripts/migrate-outbound.sql

# Message queue with QStash support
psql $DATABASE_WRITE_URL -f scripts/migrate-qstash-message-id.sql

# Rate limiting
psql $DATABASE_URL -f scripts/migrate-message-queue.sql
```

### Set Up QStash (Undo-Send Queue)

1. Create a free account at [console.upstash.com](https://console.upstash.com/qstash)
2. Copy your **QStash Token**, **Current Signing Key**, and **Next Signing Key**
3. Add them to `.env.local` (see Environment Variables below)
4. On Vercel: add via [Upstash Marketplace integration](https://vercel.com/integrations/upstash) or manually in Project Settings → Environment Variables

### Start Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

### Required

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### Outbound Engine

```env
# Write connection (falls back to DATABASE_URL if not set)
DATABASE_WRITE_URL=postgresql://user:pass@host:5432/db

# OpenAI for LLM reply drafting
OPENAI_API_KEY=sk-...

# Slack integration (https://api.slack.com/apps)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_OUTBOUND=replybot
SLACK_CHANNEL_INBOUND=replybot

# Lemlist (https://app.lemlist.com/settings/integrations)
LEMLIST_API_KEY=...
LEMLIST_WEBHOOK_SECRET=your-shared-secret
LEMLIST_CAMPAIGN_IDS=camp_abc,camp_def

# Deepline gateway — routes to Lemlist/SmartLead/Instantly/HeyReach
DEEPLINE_API_KEY=...
DEEPLINE_CLI_PATH=/usr/local/bin/deepline
```

### QStash (Undo-Send Queue)

Get these from [console.upstash.com/qstash](https://console.upstash.com/qstash):

```env
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...
```

### Security

```env
# API key for dashboard routes (leave empty in dev to skip auth)
INTERNAL_API_KEY=your-secret-api-key

# Message queue delay in seconds (default: 60)
MESSAGE_SEND_DELAY_SECONDS=60

# Enable test endpoints in production (default: disabled)
ALLOW_TEST_ENDPOINTS=false
```

### AI & Search

```env
# Anthropic (for AI qualification)
ANTHROPIC_API_KEY=sk-ant-...

# Exa web search (fallback enrichment)
EXA_API_KEY=...
```

### Optional Integrations

```env
# HubSpot
ENABLE_HUBSPOT=false
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_PORTAL_ID=

# Notion
ENABLE_NOTION=false
NOTION_API_KEY=
NOTION_DATABASE_ID=

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="GTM Signal <noreply@example.com>"
```

---

## Scoring Model

> **[docs/SCORING_MODEL.md](docs/SCORING_MODEL.md) is a working example, not a universal template.** The weights, title patterns, and thresholds are calibrated for one company's GTM motion and backtested against their pipeline data. Override them with values that reflect your ICP, deal stages, and conversion signals before deploying.

**Example weights (customize in `lib/scoring/scoring-config.json`):**

- Base: 20 points
- Tech adoption: up to +15 per tool (with time decay)
- Contact seniority: C-Level +25, VP +20, Director +15, Manager +10
- P0 engagement: +10 per qualified contact
- Company size: +5 to +20
- Max: 100 points

---

## Customization

The scoring model and outbound engine are intentionally opinionated. See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) to adapt:

- Atlas scoring weights (`lib/scoring/scoring-config.json`)
- P0 title/department patterns (`lib/scoring/scoring-config.json`)
- ICP definitions (`config/outbound/icp-definitions.yaml`)
- Qualification rules and filters (`config/outbound/qualification-rules.yaml`)
- Response templates and triggers (`config/outbound/response-templates.yaml`)
- Routing rules and rep assignment (`config/outbound/routing-rules.yaml`)
- Company context for LLM prompts (`config/outbound/company-context/`)

---

## Integrations

| Integration | Type | Purpose | Setup |
| --- | --- | --- | --- |
| [Deepline](https://deepline.com) CLI | Required | Company/contact enrichment + outbound gateway | [deepline.com](https://deepline.com) |
| PostgreSQL / [Neon](https://neon.tech) | Required | Primary datastore | [neon.tech](https://console.neon.tech) |
| [OpenAI](https://platform.openai.com) | Required (outbound) | LLM reply drafting (GPT-5-mini) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| [Slack](https://api.slack.com) | Required (outbound) | Approval workflow | [api.slack.com/apps](https://api.slack.com/apps) |
| [Upstash QStash](https://upstash.com/qstash) | Required (outbound) | Undo-send message queue | [console.upstash.com/qstash](https://console.upstash.com/qstash) |
| [Lemlist](https://lemlist.com) | Outbound provider | Email/LinkedIn campaigns | [app.lemlist.com](https://app.lemlist.com/settings/integrations) |
| [SmartLead](https://smartlead.ai) | Outbound provider | Email campaigns (via Deepline) | [smartlead.ai](https://app.smartlead.ai) |
| [Instantly](https://instantly.ai) | Outbound provider | Email campaigns (via Deepline) | [instantly.ai](https://app.instantly.ai) |
| [HeyReach](https://heyreach.io) | Outbound provider | LinkedIn campaigns (via Deepline) | [heyreach.io](https://app.heyreach.io) |
| Attio | Optional | CRM sync for qualified leads | [attio.com](https://attio.com) |
| HubSpot | Optional | CRM sync | [developers.hubspot.com](https://developers.hubspot.com) |
| [Trigger.dev](https://trigger.dev) | Optional | Scheduled qualification + polling | [trigger.dev](https://trigger.dev) |
| Notion | Optional | Database sync | [notion.so](https://www.notion.so/my-integrations) |
| Anthropic | Optional | AI qualification | [console.anthropic.com](https://console.anthropic.com) |
| Exa | Optional | Web search enrichment fallback | [exa.ai](https://exa.ai) |

---

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel link
vercel env pull  # pulls env vars to .env.local

# Add QStash via Upstash marketplace (auto-provisions env vars):
vercel integration add upstash
# Or set manually in Vercel dashboard → Settings → Environment Variables:
#   QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY

vercel deploy --prod
```

### Trigger.dev (scheduled tasks)

```bash
npx trigger.dev@latest deploy
```

---

## Documentation

- **[docs/API.md](docs/API.md)** — API routes, frontend pages, webhook auth, YAML config, scheduled tasks, database schema, security details
- **[docs/SCORING_MODEL.md](docs/SCORING_MODEL.md)** — Full Atlas algorithm documentation (backtested example)
- **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** — How to adapt scoring, ICP, and outbound config
- **[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** — Complete schema reference
- **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** — Integration setup guides
- **[Deepline](https://deepline.com)** — The enrichment engine that powers contact and company data

---

## Keywords

`gtm` `go-to-market` `signal-scoring` `outbound` `lead-generation` `lead-qualification` `sales-automation` `account-intelligence` `icp-scoring` `deepline` `lemlist` `smartlead` `instantly` `heyreach` `slack` `attio` `hubspot` `crm` `ai-reply` `llm` `qstash` `next.js` `postgresql` `neon`

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built with <a href="https://deepline.com">Deepline</a>
</p>
