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

**Built with:** Next.js, PostgreSQL (Neon), [Deepline](https://deepline.com) enrichment, OpenAI, Slack, Lemlist, Attio CRM

---

## Features

### Signal Scoring (Atlas Algorithm)
- Scores every account using tech stack adoption, contact seniority, and P0 penetration signals
- 30-day score trends with observed vs. derived data clearly labeled
- Configurable ICP definitions and qualification rules via YAML
- Backtested scoring weights you can override for your GTM motion

### Outbound Reply Engine
- Receives inbound replies via **Lemlist webhooks**
- Drafts AI-powered responses using **OpenAI GPT-5-mini** with full company context
- Posts to **Slack** for human review with Approve / Edit / Reject buttons
- **Undo Send** — approved messages queue for 60 seconds before delivery
- Round-robin lead routing to sales reps with **Attio CRM** sync

### Lead Qualification Pipeline
- AI-powered qualification against configurable ICP definitions
- Website scraping + LLM analysis for product-market fit scoring
- Automatic routing: qualified leads go to reps, others enter nurture campaigns
- Full audit trail of every routing decision

### Safety & Security
- API key authentication on all dashboard routes
- Slack HMAC-SHA256 signature verification
- Rate limiting on replies, webhooks, LLM calls (sliding-window, DB-backed)
- SSRF protection on domain scraping (rejects IPs, localhost, internal hosts, cloud metadata)
- LLM prompt injection guardrails (text capping, untrusted input labeling)
- PII redaction in all log output
- Zod input validation on every write endpoint
- Error sanitization — no internal details leaked in API responses

---

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Lemlist    │───▶│  Webhook API │───▶│  LLM Draft  │
│  (replies)   │    │  /api/outbound│   │  (OpenAI)   │
└─────────────┘    └──────┬───────┘    └──────┬──────┘
                          │                    │
                   ┌──────▼────────────────────▼──────┐
                   │         PostgreSQL (Neon)          │
                   │  inbound.leads | conversations    │
                   │  qualification_results | routing   │
                   │  message_queue | rate_limit_log   │
                   └──────┬───────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │     Slack Approval     │
              │  Approve │ Edit │ Undo │
              └───────────┬───────────┘
                          │
            ┌─────────────▼─────────────┐
            │   Message Queue (60s)      │
            │   → Lemlist / SmartLead    │
            │   → Attio CRM sync        │
            └───────────────────────────┘
```

**Data flow:** [Deepline](https://deepline.com) enriches company and contact records → Atlas algorithm scores accounts → qualified leads route to sales reps → outbound replies get AI-drafted responses → Slack approval workflow → message queue with undo-send → CRM sync.

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

# Message queue & rate limiting
psql $DATABASE_URL -f scripts/migrate-message-queue.sql
```

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

# Slack integration
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_OUTBOUND=replybot
SLACK_CHANNEL_INBOUND=replybot

# Lemlist / outbound platform
LEMLIST_API_KEY=...
LEMLIST_WEBHOOK_SECRET=your-shared-secret
LEMLIST_CAMPAIGN_IDS=camp_abc,camp_def

# Deepline enrichment API (https://deepline.com)
DEEPLINE_API_KEY=...
DEEPLINE_CLI_PATH=/usr/local/bin/deepline
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

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Accounts dashboard — scored accounts with 30-day trends |
| `/leads` | Inbound leads inbox — status, scoring, rep assignment |
| `/routing` | Visual routing flow editor (ReactFlow) |
| `/team` | Sales rep management — roles, capacity, round-robin |
| `/scoring` | Scoring config viewer with edit prompts |
| `/demo` | Public lead submission form |
| `/accounts/[id]` | Account detail — score breakdown, contacts, signals |

## API Routes

### Public (webhook endpoints — no API key required)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/inbound` | Inbound lead submission + enrichment |
| POST | `/api/outbound/lemlist/webhook` | Lemlist reply webhook |
| POST | `/api/outbound/slack/interactions` | Slack button actions |
| POST | `/api/outbound/slack/events` | Slack event subscriptions |
| GET | `/api/outbound/health` | Health check |

### Protected (require `x-api-key` header)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/accounts` | List accounts with search/pagination |
| GET | `/api/accounts/[id]` | Account detail + signals |
| GET | `/api/leads` | List leads with pagination |
| GET | `/api/leads/[id]` | Lead detail + email logs |
| GET/POST | `/api/reps` | List / create sales reps |
| PATCH/DELETE | `/api/reps/[id]` | Update / deactivate rep |
| GET/POST | `/api/routing` | Get / save routing config |
| POST | `/api/outbound/config/reload` | Reload YAML config |

### Test (dev only — blocked in production)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/outbound/test/outbound-reply` | Test reply flow |
| POST | `/api/outbound/test/qualified-lead` | Test qualification notification |

---

## Outbound Configuration (YAML)

All outbound behavior is configured via YAML files in `config/outbound/`:

```
config/outbound/
├── icp-definitions.yaml        # ICP scoring criteria
├── qualification-rules.yaml    # Lead qualification rules + filters
├── routing-rules.yaml          # Rep assignment + channel routing
├── response-templates.yaml     # Reply templates with trigger regex
└── company-context/
    ├── personas.yaml           # Buyer persona definitions
    ├── messaging-frameworks.yaml
    ├── proof-points.yaml
    ├── references.yaml
    └── use-cases.yaml
```

Reload config without redeployment:
```bash
curl -X POST https://your-app.vercel.app/api/outbound/config/reload \
  -H "x-api-key: $INTERNAL_API_KEY"
```

---

## Scheduled Tasks (Trigger.dev)

| Task | Schedule | Description |
|------|----------|-------------|
| `inbound-qualification` | Every hour | Qualifies new leads against ICP definitions |
| `outbound-reply-check` | Every 15 min (business hours) | Polls for new Lemlist replies |

Configure in `trigger.config.ts`. Requires a [Trigger.dev](https://trigger.dev) account.

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

## Database Schema

### Core (populated by [Deepline](https://deepline.com))
- `dl_resolved.resolved_companies` — enriched company records
- `dl_resolved.resolved_people` — contacts linked via `super_company_id`

### Outbound Engine (`inbound` schema)
- `inbound.leads` — lead records with qualification metadata
- `inbound.conversations` — message threads with draft/final responses
- `inbound.qualification_results` — ICP scoring results + LLM reasoning
- `inbound.routing_log` — audit trail of all routing actions
- `inbound.message_queue` — queued messages with undo-send support
- `inbound.rate_limit_log` — sliding-window rate limit tracking

See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) for full details.

---

## Security

- **API Authentication** — All dashboard API routes require `x-api-key` header (configurable via `INTERNAL_API_KEY`)
- **Webhook Verification** — Lemlist uses shared secret; Slack uses HMAC-SHA256 signature verification
- **Rate Limiting** — Configurable sliding-window limits per action type (replies, webhooks, LLM calls)
- **SSRF Protection** — Domain validation before server-side requests (rejects IPs, localhost, internal hosts, cloud metadata endpoints)
- **Prompt Injection Guards** — Reply text capped at 2000 chars, marked as untrusted in LLM prompts
- **PII Redaction** — Email addresses redacted in all log output
- **Input Validation** — Zod schemas on all write endpoints
- **Error Sanitization** — No internal details leaked in API error responses
- **Undo Send** — 60-second delay before message delivery with cancellation support

---

## Integrations

| Integration | Type | Purpose |
|---|---|---|
| [Deepline](https://deepline.com) CLI | Required | Company/contact enrichment |
| PostgreSQL / [Neon](https://neon.tech) | Required | Primary datastore |
| OpenAI | Required (outbound) | LLM reply drafting |
| Slack | Required (outbound) | Approval workflow |
| Lemlist | Required (outbound) | Email campaign replies |
| Attio | Optional | CRM sync for qualified leads |
| [Trigger.dev](https://trigger.dev) | Optional | Scheduled qualification + polling |
| HubSpot | Optional plugin | CRM sync |
| Notion | Optional plugin | Database sync |
| Anthropic | Optional | AI qualification |
| Exa | Optional | Web search enrichment fallback |

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

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel link
vercel env pull  # pulls env vars to .env.local
vercel deploy --prod
```

### Trigger.dev (scheduled tasks)

```bash
npx trigger.dev@latest deploy
```

---

## Related

- **[Deepline](https://deepline.com)** — The enrichment engine that powers contact and company data
- **[docs/SCORING_MODEL.md](docs/SCORING_MODEL.md)** — Full Atlas algorithm documentation (backtested example)
- **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** — How to adapt scoring, ICP, and outbound config
- **[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** — Complete schema reference
- **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** — Integration setup guides

---

## Keywords

`gtm` `go-to-market` `signal-scoring` `outbound` `lead-generation` `lead-qualification` `sales-automation` `account-intelligence` `icp-scoring` `deepline` `lemlist` `slack` `attio` `crm` `ai-reply` `llm` `next.js` `postgresql` `neon`

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built with <a href="https://deepline.com">Deepline</a>
</p>
