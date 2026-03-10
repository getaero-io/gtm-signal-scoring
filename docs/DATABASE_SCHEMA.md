# Database Schema

This app expects a PostgreSQL database populated by Deepline with the following schemas.

## `dl_resolved` Schema

### `resolved_companies`

| Column | Type | Description |
|---|---|---|
| `id` | text | Unique company identifier |
| `display_name` | text | Company name |
| `identity_payload` | jsonb | Resolved identifiers (domain, etc.) |
| `raw_payload` | jsonb | Provider enrichment data (Apollo org object) |
| `is_match` | boolean | Whether this row passed Deepline matching |
| `created_at` | timestamptz | First seen |
| `updated_at` | timestamptz | Last enriched |

**Key paths in `raw_payload`:**
```
raw_payload.result.data.organization.name
raw_payload.result.data.organization.industry
raw_payload.result.data.organization.estimated_num_employees
raw_payload.result.data.organization.current_technologies[]
raw_payload.result.data.organization.logo_url
raw_payload.result.data.organization.primary_domain
```

### `resolved_people`

| Column | Type | Description |
|---|---|---|
| `id` | text | Unique person identifier |
| `display_name` | text | Person name |
| `super_company_id` | text | Links to `resolved_companies.id` |
| `identity_payload` | jsonb | Resolved identifiers (email, linkedin) |
| `raw_payload` | jsonb | Provider person data |
| `is_match` | boolean | Whether this row passed matching |

**Key paths in `raw_payload`:**
```
raw_payload.result.data[0].firstName
raw_payload.result.data[0].lastName
raw_payload.result.data[0].fullName
raw_payload.result.data[0].experiences[0].title
raw_payload.result.data[0].experiences[0].companyName
```

## `dl_graph` Schema

### `adoptions`

Tracks which entities (companies/people) have been identified and resolved. Not a technology adoption table.

| Column | Type | Description |
|---|---|---|
| `row_id` | uuid | Source row identifier |
| `entity_id` | uuid | Resolved entity (links to `entities`) |
| `confidence` | text | Resolution confidence (0–1) |
| `adopted_at` | timestamptz | Resolution timestamp |

### `entities`

| Column | Type | Description |
|---|---|---|
| `entity_id` | uuid | Entity identifier |
| `entity_type` | text | `company` or `person` |
| `parent_entity_id` | uuid | Parent entity (nullable) |

## Minimum Data Requirements

For meaningful scores, you need:
- **Companies:** `raw_payload.result.data.organization` populated (Apollo enrichment)
- **People:** `super_company_id` set and `raw_payload` with title data
- Without enrichment: companies score at base (20 pts)
