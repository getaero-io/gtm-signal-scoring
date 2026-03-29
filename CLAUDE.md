# GTM Signal Routing Platform

## What This Is
GTM signal routing platform with three core systems:
1. **ReplyBot** — LinkedIn/email reply drafting with Slack approval workflow (approve/reject/edit, 60s undo window)
2. **Lead Scoring** — ICP-based scoring engine driven by YAML config
3. **TAM Database** — PostgreSQL database of leads, conversations, webhook events, qualification results

## Architecture
```
api/                    → Vercel serverless endpoints
src/engine/scorer.ts    → Lead scoring logic
src/engine/qualifier.ts → Qualification pipeline (filter → scrape → analyze → score)
src/engine/router.ts    → Routing decisions (to rep or nurture campaign)
src/slack/              → Slack message formatting + interaction handlers
src/webhooks/           → Webhook ingest, relay, and consumer
src/db/                 → PostgreSQL client, schema, queries
src/auth/               → Session auth, password hashing, middleware
trigger/                → Background jobs (reply polling, qualification, signals)
config/                 → All YAML configuration
public/dashboard/       → Web dashboard
public/config/          → Config editor UI
public/login.html       → Login page
```

## Key Config Files (edit these to customize behavior)
- `config/icp-definitions.yaml` — ICP scoring rules, weights, thresholds, anti-fit penalties
- `config/qualification-rules.yaml` — Lead qualification filters and website analysis prompts
- `config/routing-rules.yaml` — Rep assignment (round-robin), Slack channels, nurture campaigns
- `config/response-templates.yaml` — Reply templates (regex triggers, system prompts, tone)
- `config/company-context/` — Personas, messaging frameworks, use-cases, proof points

## Common Tasks
- **Change scoring weights**: Edit `config/icp-definitions.yaml` → category `weight` fields
- **Add scoring rule**: Add entry under `categories[].rules` in ICP definition
- **Change reply tone**: Edit `system_prompt` in `config/response-templates.yaml`
- **Add/remove a rep**: Edit `reps` array in `config/routing-rules.yaml`
- **Change qualified threshold**: Edit `thresholds.qualified` in ICP definition
- **Add anti-fit penalty**: Add entry under `anti_fit` in ICP definition
- **Update company context**: Edit files in `config/company-context/`
- **Import leads from CSV**: `npx tsx scripts/import-cpg-to-tamdb.ts data/your-file.csv`

## Testing
```
npm test                           # All tests
npx vitest run tests/scorer.test   # Scorer only
npx vitest run tests/auth          # Auth tests
npm run validate-config            # Validate YAML configs
```

## Database
- PostgreSQL (Neon), schema in `src/db/schema.sql`
- Tables: leads, conversations, qualification_results, routing_log, webhook_events, context_docs, learnings
- All tables in `inbound` schema
- Run migration: `npx tsx -e "import{readFileSync}from'fs';import pg from'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query(readFileSync('src/db/schema.sql','utf-8'));console.log('done');await p.end()"`

## Environment Variables
See `env.example` for complete list with descriptions.

## Webhook Relay
The primary instance can fan-out webhooks to secondary instances via `WEBHOOK_RELAY_TARGETS` env var. See `docs/CUTOVER.md` for details.
