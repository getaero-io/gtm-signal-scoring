# gtm-signal-scoring

> **This is an example implementation for one company's GTM motion.** The scoring model, signal sources, ICP definitions, and outbound workflows are calibrated for a specific context. Personalize the Atlas scoring weights, P0 title patterns, qualification rules, response templates, and integration hooks for your own use before deploying to production.

A standalone, open-source GTM signal scoring and outbound automation platform. Turns your PostgreSQL database into a ranked account intelligence layer with AI-powered reply drafting, Slack-based approval workflows, and configurable lead routing — built on real signals, not synthetic data.

## What It Does

### Signal Scoring
- Scores every account using the **Atlas algorithm** (tech stack, contact seniority, P0 penetration)
- 30-day score trends with observed vs derived data clearly labeled
- Configurable ICP definitions and qualification rules via YAML

### Outbound Reply Engine
- Receives inbound replies via **Lemlist webhooks**
- Drafts AI-powered responses using **OpenAI GPT-5-mini** with company context
- Posts to **Slack** for human review with Approve / Edit / Reject buttons
- **Undo Send** — approved messages queue for 60 seconds before delivery
- Routes qualified leads to reps (round-robin) and syncs to **Attio CRM**

### Safety & Security
- API key authentication on all dashboard routes
- Slack signature verification (HMAC-SHA256)
- Rate limiting on replies, webhooks, LLM calls
- SSRF protection on domain scraping
- LLM prompt injection guardrails
- PII redaction in logs

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

## Prerequisites

- **Node.js 20+**
- **PostgreSQL** (Neon recommended) with `dl_resolved` and `dl_graph` schemas
- **Deepline CLI** installed and authenticated (for enrichment)

## Quick Start

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

# Deepline enrichment API
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

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Accounts dashboard — scored accounts with trends |
| `/leads` | Inbound leads inbox — status, scoring, assignment |
| `/routing` | Visual routing flow editor (ReactFlow) |
| `/team` | Sales rep management — roles, capacity |
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

## Scheduled Tasks (Trigger.dev)

| Task | Schedule | Description |
|------|----------|-------------|
| `inbound-qualification` | Every hour | Qualifies new leads against ICP definitions |
| `outbound-reply-check` | Every 15 min (business hours) | Polls for new Lemlist replies |

Configure in `trigger.config.ts`. Requires a [Trigger.dev](https://trigger.dev) account.

## Scoring Model

> **[docs/SCORING_MODEL.md](docs/SCORING_MODEL.md) is a working example, not a universal template.** The weights, title patterns, and thresholds are calibrated for one company's GTM motion and backtested against their pipeline data. Override them with values that reflect your ICP, deal stages, and conversion signals before deploying.

**Example weights (customize in `lib/scoring/scoring-config.json`):**
- Base: 20 points
- Tech adoption: up to +15 per tool (with time decay)
- Contact seniority: C-Level +25, VP +20, Director +15, Manager +10
- P0 engagement: +10 per qualified contact
- Company size: +5 to +20
- Max: 100 points

## Database Schema

### Core (populated by Deepline)
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

## Security

- **API Authentication** — All dashboard API routes require `x-api-key` header (configurable via `INTERNAL_API_KEY`)
- **Webhook Verification** — Lemlist uses shared secret; Slack uses HMAC-SHA256 signature verification
- **Rate Limiting** — Configurable limits per action type (replies, webhooks, LLM calls)
- **SSRF Protection** — Domain validation before server-side requests (rejects IPs, localhost, internal hosts)
- **Prompt Injection Guards** — Reply text capped at 2000 chars, marked as untrusted in LLM prompts
- **PII Redaction** — Email addresses redacted in all log output
- **Input Validation** — Zod schemas on all write endpoints
- **Error Sanitization** — No internal details leaked in API error responses
- **Undo Send** — 60-second delay before message delivery with cancellation support

## Integrations

| Integration | Type | Purpose |
|---|---|---|
| Deepline CLI | Required | Company/contact enrichment |
| PostgreSQL / Neon | Required | Primary datastore |
| OpenAI | Required (outbound) | LLM reply drafting |
| Slack | Required (outbound) | Approval workflow |
| Lemlist | Required (outbound) | Email campaign replies |
| Attio | Optional | CRM sync for qualified leads |
| Trigger.dev | Optional | Scheduled qualification + polling |
| HubSpot | Optional plugin | CRM sync |
| Notion | Optional plugin | Database sync |
| Anthropic | Optional | AI qualification |
| Exa | Optional | Web search enrichment fallback |

## Customization

The scoring model and outbound engine are intentionally opinionated. See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) to adapt:

- Atlas scoring weights (`lib/scoring/scoring-config.json`)
- P0 title/department patterns (`lib/scoring/scoring-config.json`)
- ICP definitions (`config/outbound/icp-definitions.yaml`)
- Qualification rules and filters (`config/outbound/qualification-rules.yaml`)
- Response templates and triggers (`config/outbound/response-templates.yaml`)
- Routing rules and rep assignment (`config/outbound/routing-rules.yaml`)
- Company context for LLM prompts (`config/outbound/company-context/`)

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

## License

MIT — see [LICENSE](LICENSE).
