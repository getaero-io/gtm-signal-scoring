# Integrations

## Deepline CLI (Required)

Deepline is the data backbone. This app reads from the `dl_resolved` and `dl_graph` schemas that Deepline populates.

### Setup

1. Install Deepline CLI: see [Deepline docs](https://deepline.ai/docs)
2. Set `DEEPLINE_CLI_PATH` in `.env.local`
3. Run `deepline auth` to authenticate

### What Deepline Provides

| Schema | Table | Used For |
|---|---|---|
| `dl_resolved` | `resolved_companies` | Account list, enrichment data |
| `dl_resolved` | `resolved_people` | Contacts, seniority scoring |
| `dl_graph` | `adoptions` | Entity resolution tracking |

### Enrichment Trigger

From the account detail page, click **Run Enrichment** to re-enrich a company via the CLI. This calls `deepline enrich --domain=<domain>`.

---

## HubSpot (Optional Plugin)

Sync Atlas scores and P0 penetration back to HubSpot company records.

### Setup

1. Create a HubSpot private app with `crm.objects.companies.write` scope
2. Set in `.env.local`:
   ```env
   ENABLE_HUBSPOT=true
   HUBSPOT_ACCESS_TOKEN=pat-na1-...
   HUBSPOT_PORTAL_ID=12345678
   ```

### HubSpot Custom Properties

The plugin writes these custom properties to company records:

| Property | Value |
|---|---|
| `gtm_atlas_score` | Atlas score (0–100) |
| `gtm_p0_penetration` | "2/8" (current/total) |
| `gtm_tech_count` | Number of tech stack items |
| `gtm_last_scored` | ISO timestamp |

Create these properties in HubSpot Settings > Properties before syncing.

---

## Notion (Optional Plugin)

Push account summaries to a Notion database for team visibility.

### Setup

1. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Share your target database with the integration
3. Set in `.env.local`:
   ```env
   ENABLE_NOTION=true
   NOTION_API_KEY=ntn_...
   NOTION_DATABASE_ID=your-database-id
   ```

### Notion Database Schema

The plugin expects these properties in your Notion database:

| Property | Type |
|---|---|
| Name | Title |
| Atlas Score | Number |
| Domain | URL |
| P0 Contacts | Number |
| Tech Stack Size | Number |
| Last Scored | Date |
