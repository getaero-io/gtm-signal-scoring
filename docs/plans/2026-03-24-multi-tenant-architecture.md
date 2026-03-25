# Multi-Tenant Architecture Plan

**Status:** Design only — no implementation
**Date:** 2026-03-24
**Author:** Generated via Claude Code

## Current State

Two separate Vercel projects deploying the same Git repo with different config:

| Instance | Vercel Project | Config Dir | URL |
|----------|---------------|------------|-----|
| Spring Cash | `gtm-signal-scoring` | `config/spring-cash/` | `gtm-signal-scoring.vercel.app` |
| Deepline Internal | `gtm-signal-scoring-deepline` | `config/deepline/` | `gtm-signal-scoring-deepline.vercel.app` |

Tenant isolation is achieved via `TENANT_CONFIG_DIR` env var pointing to a config directory. Both instances share the same database and same codebase.

### Problems with Current Approach

1. **No data isolation** — both tenants write to the same `inbound.*` tables. A lead from Spring Cash campaigns is indistinguishable from a Deepline lead at the DB level.
2. **Config is filesystem-based** — adding a new tenant requires a code deploy with new YAML files.
3. **Scaling** — each new tenant needs a new Vercel project, env var setup, and webhook registration. This is manual and error-prone.
4. **Shared credentials** — both instances use the same `DATABASE_URL`, `DEEPLINE_API_KEY`, etc. No per-tenant credential scoping.

---

## Target Architecture

### Tenant Resolution

**Option A: Subdomain-based (Recommended)**

```
spring-cash.app.deepline.com  →  tenant_id = "spring-cash"
deepline.app.deepline.com     →  tenant_id = "deepline"
acme.app.deepline.com         →  tenant_id = "acme"
```

Resolution happens in Next.js proxy (middleware):
```typescript
// proxy.ts
export default function proxy(req: NextRequest) {
  const hostname = req.headers.get("host") || "";
  const tenantSlug = hostname.split(".")[0];
  // Inject tenant context into headers for downstream use
  req.headers.set("x-tenant-id", tenantSlug);
}
```

**Option B: Path-based**

```
app.deepline.com/t/spring-cash/api/...
app.deepline.com/t/deepline/api/...
```

Less clean but simpler DNS. Not recommended for API-heavy use.

**Option C: Header-based (API only)**

```
Authorization: Bearer <tenant-scoped-api-key>
X-Tenant-ID: spring-cash
```

Best for pure API use cases (no UI). Tenant resolved from API key lookup.

### Database Isolation

**Phase 1: Row-Level Isolation (Recommended first step)**

Add `tenant_id TEXT NOT NULL` column to all `inbound.*` tables:

```sql
ALTER TABLE inbound.leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inbound.conversations ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inbound.routing_log ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inbound.message_queue ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- Indexes for tenant-scoped queries
CREATE INDEX idx_leads_tenant ON inbound.leads(tenant_id);
CREATE INDEX idx_conversations_tenant ON inbound.conversations(tenant_id);
CREATE INDEX idx_message_queue_tenant ON inbound.message_queue(tenant_id);
```

All queries include `WHERE tenant_id = $tenantId` via a query wrapper:

```typescript
function tenantQuery<T>(sql: string, params: any[], tenantId: string): Promise<T[]> {
  // Automatically append tenant_id filter
  // Or use Postgres RLS (Row Level Security) policies
}
```

**Phase 2: Postgres Row-Level Security (RLS)**

```sql
-- Enable RLS on all tenant tables
ALTER TABLE inbound.leads ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON inbound.leads
  USING (tenant_id = current_setting('app.tenant_id'));

-- Set tenant context per connection
SET app.tenant_id = 'spring-cash';
```

RLS is enforced at the database level — even buggy application code can't leak cross-tenant data.

**Phase 3: Separate Schemas (Optional, for compliance)**

```sql
CREATE SCHEMA tenant_spring_cash;
CREATE SCHEMA tenant_deepline;
```

Full schema isolation for tenants with compliance requirements (SOC 2, HIPAA). Most tenants won't need this.

### Config Storage

**Phase 1: Keep filesystem YAML, load from DB override**

```
1. Load base config from config/{tenant}/ (YAML files in repo)
2. Check DB for tenant-specific overrides (inbound.tenant_config table)
3. Merge: DB overrides win over YAML defaults
```

This lets tenants customize via API while keeping YAML as the source of truth for defaults.

**Phase 2: Full DB-backed config**

```sql
CREATE TABLE inbound.tenant_config (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  config_type TEXT NOT NULL,  -- 'icp', 'routing', 'templates', 'company_context', 'faqs'
  config_data JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(tenant_id, config_type)
);
```

Config CRUD via API:
- `GET /api/config/:type` — read current config
- `PUT /api/config/:type` — update config (versioned)
- `GET /api/config/:type/history` — config change history

### Authentication & Authorization

**Phase 1: Tenant-scoped API keys**

```sql
CREATE TABLE inbound.api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- bcrypt hash of the API key
  name TEXT NOT NULL,       -- "Production key", "Staging key"
  scopes TEXT[] NOT NULL,   -- ["read", "write", "admin"]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
```

API key format: `dl_sk_<tenant_id>_<random>` — tenant is embedded in the key for fast resolution without a DB lookup.

**Phase 2: JWT with tenant claims**

For UI-based access, issue JWTs with tenant context:

```json
{
  "sub": "user_123",
  "tenant_id": "spring-cash",
  "role": "admin",
  "scopes": ["read", "write", "config"]
}
```

### Webhook Routing

Each tenant gets their own webhook URLs:

```
https://app.deepline.com/api/webhooks/lemlist?tenant=spring-cash
https://app.deepline.com/api/webhooks/lemlist?tenant=deepline
```

Or subdomain-based:
```
https://spring-cash.app.deepline.com/api/outbound/lemlist/webhook
https://deepline.app.deepline.com/api/outbound/lemlist/webhook
```

Webhook handler extracts tenant from URL/subdomain and processes in that tenant context.

### Credential Management

Each tenant brings their own credentials for external services:

```sql
CREATE TABLE inbound.tenant_credentials (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,     -- 'lemlist', 'hubspot', 'slack', 'openai'
  credential_type TEXT NOT NULL, -- 'api_key', 'oauth_token', 'webhook_secret'
  encrypted_value TEXT NOT NULL, -- AES-256-GCM encrypted
  metadata JSONB,             -- provider-specific config (e.g., campaign IDs)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider, credential_type)
);
```

Credentials encrypted at rest. Decrypted only when needed for API calls. Encryption key stored in env var, rotatable.

---

## Migration Path

### From Current (2 Projects) → Single Multi-Tenant Deployment

**Step 1: Add `tenant_id` to existing tables**
- Add column with default value matching current tenant
- Backfill existing rows: Spring Cash data gets `tenant_id = 'spring-cash'`, etc.
- Add indexes

**Step 2: Update all queries to include tenant context**
- Create a `TenantContext` that flows through the request lifecycle
- Wrap `query()` and `writeQuery()` to automatically inject tenant filter
- Audit all raw SQL for missing tenant filters

**Step 3: Add tenant resolution middleware**
- Parse tenant from subdomain/header/API key
- Inject into request context
- Reject requests without valid tenant

**Step 4: Migrate config to DB**
- Seed DB with current YAML configs for each tenant
- Update `loadConfig()` to read from DB
- Keep YAML as fallback/defaults

**Step 5: Single Vercel project with wildcard domain**
- `*.app.deepline.com` → single Vercel deployment
- Remove `TENANT_CONFIG_DIR` env var (config from DB)
- Decommission the two separate Vercel projects

**Step 6: Tenant onboarding flow**
- API to create new tenant
- Auto-provision: DB records, default config, API keys
- Webhook registration helper per tenant

---

## Estimated Effort

| Step | Effort | Risk |
|------|--------|------|
| Add tenant_id + backfill | 1 day | Low — additive change |
| Tenant-scoped queries | 2-3 days | Medium — must audit all SQL |
| Tenant resolution middleware | 0.5 day | Low |
| DB-backed config | 2-3 days | Medium — YAML→DB migration |
| Single deployment + domain | 1 day | Low |
| Tenant onboarding API | 1-2 days | Low |
| **Total** | **~8-10 days** | |

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tenant resolution | Subdomain | Clean URLs, easy to understand, works for both API and UI |
| DB isolation (Phase 1) | Row-level with `tenant_id` | Simplest to implement, sufficient for current scale |
| DB isolation (Phase 2) | Postgres RLS | Defense-in-depth, prevents application bugs from leaking data |
| Config storage | YAML defaults + DB overrides | Gradual migration, keeps developer workflow familiar |
| Credential storage | Encrypted in DB | Tenants must own their own provider credentials |

---

## Open Questions

1. **Billing**: Should we meter API calls per tenant? What pricing model?
2. **Rate limiting**: Per-tenant rate limits or shared?
3. **Data retention**: Per-tenant data retention policies?
4. **Audit logging**: Cross-tenant audit log vs. per-tenant?
5. **Slack workspace**: One Slack app per tenant, or multi-workspace Slack app?
