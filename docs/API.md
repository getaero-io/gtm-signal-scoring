# API Reference

Full API route documentation for GTM Signal Scoring. For setup and getting started, see the [README](../README.md).

---

## Authentication

All protected routes require an `x-api-key` header matching the `INTERNAL_API_KEY` environment variable. In development, if `INTERNAL_API_KEY` is not set, auth is skipped.

Webhook endpoints (Lemlist, Slack) use their own verification:
- **Lemlist** — `x-lemlist-secret` header checked against `LEMLIST_WEBHOOK_SECRET`
- **Slack** — HMAC-SHA256 signature verification using `SLACK_SIGNING_SECRET`

---

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

Test endpoints are disabled when `NODE_ENV === 'production'` unless `ALLOW_TEST_ENDPOINTS=true`.

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

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for full column-level details.

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
