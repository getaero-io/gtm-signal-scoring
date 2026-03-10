# gtm-signal-scoring

> **This is an example implementation for one company's GTM motion.** The scoring model, signal sources, and P0 definitions are calibrated for a specific ICP and data pipeline. You should personalize the Atlas scoring weights, P0 title patterns, and integration hooks for your own context before using in production.

A standalone, open-source GTM signal scoring app that turns your PostgreSQL database into a ranked account intelligence layer. Built on real signals — no synthetic data.

## What It Does

- Scores every account in your `dl_resolved` database using the **Atlas algorithm**
- Surfaces real signals: tech stack adoptions, contact seniority, P0 penetration
- Shows 30-day score trends with observed vs derived data clearly labeled
- Integrates with Deepline CLI (required) for enrichment
- Optional plugins for HubSpot and Notion

## Prerequisites

- **Node.js 20+**
- **PostgreSQL** with `dl_resolved` and `dl_graph` schemas (populated by Deepline)
- **Deepline CLI** installed and authenticated

## Quick Start

```bash
git clone https://github.com/your-org/gtm-signal-scoring
cd gtm-signal-scoring
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and DEEPLINE_CLI_PATH
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
DEEPLINE_CLI_PATH=/usr/local/bin/deepline

# Optional - HubSpot
ENABLE_HUBSPOT=false
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_PORTAL_ID=

# Optional - Notion
ENABLE_NOTION=false
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

## Scoring Model

See [docs/SCORING_MODEL.md](docs/SCORING_MODEL.md) for the full Atlas algorithm.

**TL;DR:**
- Base: 20 points
- Tech adoption: up to +15 per tool (with time decay)
- Contact seniority: C-Level +25, VP +20, Director +15, Manager +10
- P0 engagement: +10 per qualified contact
- Company size: +5 to +20
- Max: 100 points

## Database Schema

Expects the `dl_resolved` schema from Deepline:
- `dl_resolved.resolved_companies` — enriched company records
- `dl_resolved.resolved_people` — contacts linked via `super_company_id`

See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) for full details.

## Integrations

| Integration | Type | Docs |
|---|---|---|
| Deepline CLI | Required | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| HubSpot | Optional plugin | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| Notion | Optional plugin | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |

## Customization

The scoring model is intentionally opinionated. See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) to adapt:
- Atlas scoring weights (`lib/scoring/config.ts`)
- P0 title/department patterns (`lib/scoring/config.ts`)
- Data extraction paths for your enrichment provider

## License

MIT — see [LICENSE](LICENSE).
