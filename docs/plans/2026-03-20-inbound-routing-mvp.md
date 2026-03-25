# Inbound Routing MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Default.com-inspired inbound lead routing system on the existing GTM Signal Scoring app — visual canvas routing, auto-enrichment from Neon DB, auto-reply emails, and a leads inbox showing synthetic Spring Cash CPG brand leads.

**Architecture:** Inbound leads arrive via POST /api/inbound, get auto-enriched by matching the email domain against our existing `dl_resolved.resolved_people` data, then a saved React Flow routing graph is executed to assign the lead to a rep and send a personalized auto-reply. The routing canvas (`/routing`) lets users drag-and-drop nodes to build routing logic and save it to the DB. A leads inbox (`/leads`) shows all inbound leads with their routing trace.

**Tech Stack:** Next.js 16 App Router, React 19, `@xyflow/react` v12 (React Flow canvas), `nodemailer` (email), `pg` (existing Postgres client), Tailwind v4, lucide-react, Neon PostgreSQL (existing + new `inbound` schema via write user)

---

## IMPORTANT: DB Write Access

The existing `DATABASE_URL` uses `dl_tenant_read` — a read-only user. New tables need a write user. After Task 1 creates the schema, add `DATABASE_WRITE_URL` to `.env.local` pointing to the same Neon DB but with a write-capable user (create via Neon console → Settings → Roles). If you only have one connection string with write access, set `DATABASE_WRITE_URL` to the same value as `DATABASE_URL` but with the admin/owner credentials.

---

## Task 1: Install Packages + DB Migration

**Files:**
- Run: `npm install @xyflow/react nodemailer @types/nodemailer`
- Create: `scripts/migrate.sql` (run manually in Neon console)

**Step 1: Install packages**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring
npm install @xyflow/react nodemailer @types/nodemailer
```

Expected: `added N packages` with no errors. `@xyflow/react` is React Flow v12 (replaces the old `reactflow` package).

**Step 2: Create the migration SQL**

Create `scripts/migrate.sql`:

```sql
-- Run this in Neon console (SQL editor) with a write-capable user

CREATE SCHEMA IF NOT EXISTS inbound;

CREATE TABLE IF NOT EXISTS inbound.reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'SDR', -- 'Senior', 'SDR', 'AE'
  max_leads_per_day INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound.routing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default Routing',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Form fields
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  domain TEXT, -- extracted from email
  message TEXT,
  source TEXT NOT NULL DEFAULT 'form', -- 'form' | 'webhook' | 'seed'
  -- Enrichment (from Neon DB lookup)
  atlas_score INTEGER,
  email_quality INTEGER,
  founder_match INTEGER,
  contact_identity INTEGER,
  is_founder_detected BOOLEAN DEFAULT false,
  valid_business_emails INTEGER DEFAULT 0,
  valid_free_emails INTEGER DEFAULT 0,
  mx_found BOOLEAN DEFAULT false,
  enrichment_data JSONB DEFAULT '{}', -- raw contacts / signals
  -- Routing
  assigned_rep_id UUID REFERENCES inbound.reps(id),
  routing_path JSONB DEFAULT '[]', -- array of {nodeId, nodeType, result}
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'assigned' | 'replied' | 'converted'
  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enriched_at TIMESTAMPTZ,
  routed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inbound.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES inbound.leads(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  template TEXT NOT NULL, -- 'founder' | 'standard'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' -- 'sent' | 'failed'
);

-- Seed 3 default reps
INSERT INTO inbound.reps (name, email, role, max_leads_per_day) VALUES
  ('Alex Rivera', 'alex@example.com', 'Senior', 10),
  ('Jordan Kim', 'jordan@example.com', 'AE', 15),
  ('Sam Chen', 'sam@example.com', 'SDR', 20)
ON CONFLICT (email) DO NOTHING;

-- Seed default routing config (will be overwritten by canvas saves)
INSERT INTO inbound.routing_configs (name, nodes, edges) VALUES (
  'Default Routing',
  '[
    {"id":"trigger-1","type":"triggerNode","position":{"x":100,"y":200},"data":{"label":"Inbound Lead","source":"form"}},
    {"id":"enrich-1","type":"enrichNode","position":{"x":350,"y":200},"data":{"label":"Enrich from DB"}},
    {"id":"condition-1","type":"conditionNode","position":{"x":600,"y":200},"data":{"label":"Atlas Score","field":"atlas_score","operator":"gte","value":60}},
    {"id":"assign-senior","type":"assignNode","position":{"x":850,"y":100},"data":{"label":"Assign Senior Rep","role":"Senior"}},
    {"id":"assign-sdr","type":"assignNode","position":{"x":850,"y":320},"data":{"label":"Assign SDR Queue","role":"SDR"}},
    {"id":"reply-founder","type":"autoReplyNode","position":{"x":1100,"y":100},"data":{"label":"Founder Reply","template":"founder"}},
    {"id":"reply-standard","type":"autoReplyNode","position":{"x":1100,"y":320},"data":{"label":"Standard Reply","template":"standard"}}
  ]',
  '[
    {"id":"e1","source":"trigger-1","target":"enrich-1"},
    {"id":"e2","source":"enrich-1","target":"condition-1"},
    {"id":"e3","source":"condition-1","target":"assign-senior","sourceHandle":"true"},
    {"id":"e4","source":"condition-1","target":"assign-sdr","sourceHandle":"false"},
    {"id":"e5","source":"assign-senior","target":"reply-founder"},
    {"id":"e6","source":"assign-sdr","target":"reply-standard"}
  ]'
) ON CONFLICT DO NOTHING;
```

**Step 3: Run the migration**

Open Neon console → your project → SQL Editor → paste `scripts/migrate.sql` → Run.

**Step 4: Add write URL to env**

In `.env.local`, add below `DATABASE_URL`:

```
DATABASE_WRITE_URL=<your-neon-write-user-connection-string>
```

If you have a write-capable version of the same URL (admin/owner role in Neon console), use that. Otherwise, create a new role in Neon → Settings → Roles → New Role with CREATEDB privileges, then use that connection string.

**Step 5: Commit**

```bash
git add scripts/migrate.sql package.json package-lock.json
git commit -m "chore: install @xyflow/react + nodemailer, add DB migration SQL"
```

---

## Task 2: TypeScript Types for Inbound Routing

**Files:**
- Create: `types/inbound.ts`

**Step 1: Create the types file**

```typescript
// types/inbound.ts

export type RepRole = 'Senior' | 'AE' | 'SDR';
export type LeadStatus = 'new' | 'assigned' | 'replied' | 'converted';
export type EmailTemplate = 'founder' | 'standard';
export type LeadSource = 'form' | 'webhook' | 'seed';

export interface Rep {
  id: string;
  name: string;
  email: string;
  role: RepRole;
  max_leads_per_day: number;
  is_active: boolean;
  created_at: string;
}

export interface RoutingNodeData {
  label: string;
  // triggerNode
  source?: 'form' | 'webhook';
  // conditionNode
  field?: string;
  operator?: 'gte' | 'lte' | 'eq' | 'contains';
  value?: number | string;
  // assignNode
  role?: RepRole;
  rep_id?: string;
  // autoReplyNode
  template?: EmailTemplate;
  // notifyNode
  slack_webhook_url?: string;
}

export interface RoutingConfig {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: RoutingNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
  }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutingTraceStep {
  nodeId: string;
  nodeType: string;
  label: string;
  result: string;
  success: boolean;
}

export interface EnrichmentResult {
  atlas_score: number;
  email_quality: number;
  founder_match: number;
  contact_identity: number;
  is_founder_detected: boolean;
  valid_business_emails: number;
  valid_free_emails: number;
  mx_found: boolean;
  contacts: Array<{
    full_name: string;
    email?: string;
    title?: string;
    is_p0: boolean;
  }>;
}

export interface InboundLead {
  id: string;
  full_name: string;
  email: string;
  company?: string;
  domain?: string;
  message?: string;
  source: LeadSource;
  // Enrichment
  atlas_score?: number;
  email_quality?: number;
  founder_match?: number;
  contact_identity?: number;
  is_founder_detected?: boolean;
  valid_business_emails?: number;
  valid_free_emails?: number;
  mx_found?: boolean;
  enrichment_data?: EnrichmentResult;
  // Routing
  assigned_rep_id?: string;
  assigned_rep?: Rep;
  routing_path?: RoutingTraceStep[];
  status: LeadStatus;
  submitted_at: string;
  enriched_at?: string;
  routed_at?: string;
}

export interface EmailLog {
  id: string;
  lead_id: string;
  to_email: string;
  subject: string;
  body: string;
  template: EmailTemplate;
  sent_at: string;
  status: 'sent' | 'failed';
}

export interface InboundFormPayload {
  full_name: string;
  email: string;
  company?: string;
  message?: string;
  source?: LeadSource;
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add types/inbound.ts
git commit -m "feat: add TypeScript types for inbound routing entities"
```

---

## Task 3: DB Write Client + Data Layer

**Files:**
- Create: `lib/db-write.ts`
- Create: `lib/data/leads.ts`
- Create: `lib/data/reps.ts`
- Create: `lib/data/routing.ts`

**Step 1: Create write-capable DB client**

```typescript
// lib/db-write.ts
import { Pool } from 'pg';

// Uses DATABASE_WRITE_URL for write operations (new inbound.* tables)
// Falls back to DATABASE_URL if write URL not set (dev convenience)
const writePool = new Pool({
  connectionString: process.env.DATABASE_WRITE_URL || process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function writeQuery<T = Record<string, any>>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const client = await writePool.connect();
  try {
    const result = await client.query<T & Record<string, any>>(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export default writePool;
```

**Step 2: Create leads data layer**

```typescript
// lib/data/leads.ts
import { query } from '@/lib/db';
import { writeQuery } from '@/lib/db-write';
import { InboundLead, InboundFormPayload, EnrichmentResult, RoutingTraceStep } from '@/types/inbound';

// Extract domain from email address
export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

// Look up enrichment data for a domain from our existing Neon DB
export async function enrichDomainFromNeon(domain: string): Promise<EnrichmentResult | null> {
  const rows = await query<{
    valid_business: string;
    valid_free: string;
    mx: boolean;
    contacts: any[];
  }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload->'result'->>'status' = 'valid'
           AND (raw_payload->'result'->>'free_email') = 'false'
       ) AS valid_business,
       COUNT(*) FILTER (
         WHERE provider = 'zerobounce'
           AND raw_payload->'result'->>'status' = 'valid'
           AND (raw_payload->'result'->>'free_email') = 'true'
       ) AS valid_free,
       BOOL_OR(
         provider = 'zerobounce' AND (raw_payload->'result'->>'mx_found') = 'true'
       ) AS mx,
       json_agg(json_build_object(
         'full_name', COALESCE(
           raw_payload->'result'->>'firstname' || ' ' || raw_payload->'result'->>'lastname',
           identity_payload->'person_name'->>0,
           ''
         ),
         'email', identity_payload->'email'->>0,
         'title', COALESCE(
           raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title',
           raw_payload->'result'->>'title'
         ),
         'is_p0', (
           raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title' IS NOT NULL
           AND raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'grok_founder_title' != ''
         )
       )) FILTER (WHERE identity_payload->'email'->>0 IS NOT NULL) AS contacts
     FROM dl_resolved.resolved_people
     WHERE is_match = true
       AND identity_payload->'domain' @> jsonb_build_array($1::text)`,
    [domain]
  );

  if (!rows[0]) return null;

  const row = rows[0];
  const validBusiness = parseInt(row.valid_business || '0');
  const validFree = parseInt(row.valid_free || '0');
  const mxFound = row.mx ?? false;
  const contacts = (row.contacts || []).filter((c: any) => c.full_name?.trim());

  // No data at all
  if (validBusiness === 0 && validFree === 0 && contacts.length === 0) return null;

  const emailQuality = Math.min(40, validBusiness * 40 + validFree * 20);
  const namedContacts = contacts.filter((c: any) => c.full_name && c.full_name.trim() && !c.full_name.includes('@'));
  const contactIdentity = Math.min(15, namedContacts.length * 15);
  const founders = contacts.filter((c: any) => c.is_p0);
  const founderMatch = Math.min(20, founders.length * 20);
  const dataCoverage = mxFound ? 5 : 0;
  const atlasScore = Math.min(100, 20 + emailQuality + contactIdentity + founderMatch + dataCoverage);

  return {
    atlas_score: Math.round(atlasScore),
    email_quality: Math.round(emailQuality),
    founder_match: Math.round(founderMatch),
    contact_identity: Math.round(contactIdentity),
    is_founder_detected: founders.length > 0,
    valid_business_emails: validBusiness,
    valid_free_emails: validFree,
    mx_found: mxFound,
    contacts: contacts.slice(0, 5),
  };
}

export async function createLead(
  payload: InboundFormPayload,
  enrichment?: EnrichmentResult | null
): Promise<InboundLead> {
  const domain = extractDomain(payload.email);

  const rows = await writeQuery<InboundLead>(
    `INSERT INTO inbound.leads (
       full_name, email, company, domain, message, source,
       atlas_score, email_quality, founder_match, contact_identity,
       is_founder_detected, valid_business_emails, valid_free_emails,
       mx_found, enrichment_data, enriched_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
       CASE WHEN $7 IS NOT NULL THEN now() ELSE NULL END
     ) RETURNING *`,
    [
      payload.full_name,
      payload.email,
      payload.company || null,
      domain,
      payload.message || null,
      payload.source || 'form',
      enrichment?.atlas_score ?? null,
      enrichment?.email_quality ?? null,
      enrichment?.founder_match ?? null,
      enrichment?.contact_identity ?? null,
      enrichment?.is_founder_detected ?? false,
      enrichment?.valid_business_emails ?? 0,
      enrichment?.valid_free_emails ?? 0,
      enrichment?.mx_found ?? false,
      enrichment ? JSON.stringify(enrichment) : '{}',
    ]
  );

  return rows[0];
}

export async function updateLeadRouting(
  leadId: string,
  params: {
    assigned_rep_id?: string;
    routing_path: RoutingTraceStep[];
    status: string;
  }
): Promise<void> {
  await writeQuery(
    `UPDATE inbound.leads SET
       assigned_rep_id = $2,
       routing_path = $3,
       status = $4,
       routed_at = now()
     WHERE id = $1`,
    [
      leadId,
      params.assigned_rep_id || null,
      JSON.stringify(params.routing_path),
      params.status,
    ]
  );
}

export async function getLeads(limit = 50, offset = 0): Promise<{ leads: InboundLead[]; total: number }> {
  const [rows, countRows] = await Promise.all([
    writeQuery<InboundLead>(
      `SELECT l.*, row_to_json(r.*) as assigned_rep
       FROM inbound.leads l
       LEFT JOIN inbound.reps r ON r.id = l.assigned_rep_id
       ORDER BY l.submitted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    writeQuery<{ total: string }>('SELECT COUNT(*) as total FROM inbound.leads'),
  ]);

  return {
    leads: rows,
    total: parseInt(countRows[0]?.total || '0'),
  };
}

export async function getLeadById(id: string): Promise<InboundLead | null> {
  const rows = await writeQuery<InboundLead>(
    `SELECT l.*, row_to_json(r.*) as assigned_rep
     FROM inbound.leads l
     LEFT JOIN inbound.reps r ON r.id = l.assigned_rep_id
     WHERE l.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function logEmail(params: {
  lead_id: string;
  to_email: string;
  subject: string;
  body: string;
  template: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  await writeQuery(
    `INSERT INTO inbound.email_logs (lead_id, to_email, subject, body, template, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.lead_id, params.to_email, params.subject, params.body, params.template, params.status]
  );
}

export async function getEmailLogs(leadId: string) {
  return writeQuery(
    `SELECT * FROM inbound.email_logs WHERE lead_id = $1 ORDER BY sent_at DESC`,
    [leadId]
  );
}
```

**Step 3: Create reps data layer**

```typescript
// lib/data/reps.ts
import { writeQuery } from '@/lib/db-write';
import { Rep } from '@/types/inbound';

export async function getReps(): Promise<Rep[]> {
  return writeQuery<Rep>(
    `SELECT * FROM inbound.reps WHERE is_active = true ORDER BY role, name`
  );
}

export async function getRepByRole(role: string): Promise<Rep | null> {
  // Simple round-robin: pick the rep with that role who has fewest leads today
  const rows = await writeQuery<Rep>(
    `SELECT r.*,
       COUNT(l.id) FILTER (
         WHERE l.submitted_at::date = CURRENT_DATE
       ) as leads_today
     FROM inbound.reps r
     LEFT JOIN inbound.leads l ON l.assigned_rep_id = r.id
     WHERE r.is_active = true AND r.role = $1
     GROUP BY r.id
     HAVING COUNT(l.id) FILTER (WHERE l.submitted_at::date = CURRENT_DATE) < r.max_leads_per_day
     ORDER BY leads_today ASC, r.name ASC
     LIMIT 1`,
    [role]
  );
  return rows[0] || null;
}

export async function createRep(data: { name: string; email: string; role: string; max_leads_per_day: number }): Promise<Rep> {
  const rows = await writeQuery<Rep>(
    `INSERT INTO inbound.reps (name, email, role, max_leads_per_day)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.email, data.role, data.max_leads_per_day]
  );
  return rows[0];
}

export async function updateRep(id: string, data: { name?: string; role?: string; max_leads_per_day?: number; is_active?: boolean }): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.role !== undefined) { fields.push(`role = $${i++}`); values.push(data.role); }
  if (data.max_leads_per_day !== undefined) { fields.push(`max_leads_per_day = $${i++}`); values.push(data.max_leads_per_day); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(data.is_active); }

  if (fields.length === 0) return;
  values.push(id);

  await writeQuery(
    `UPDATE inbound.reps SET ${fields.join(', ')} WHERE id = $${i}`,
    values
  );
}

export async function deleteRep(id: string): Promise<void> {
  await writeQuery(`UPDATE inbound.reps SET is_active = false WHERE id = $1`, [id]);
}
```

**Step 4: Create routing config data layer**

```typescript
// lib/data/routing.ts
import { writeQuery } from '@/lib/db-write';
import { RoutingConfig } from '@/types/inbound';

export async function getActiveRoutingConfig(): Promise<RoutingConfig | null> {
  const rows = await writeQuery<RoutingConfig>(
    `SELECT * FROM inbound.routing_configs WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0] || null;
}

export async function saveRoutingConfig(
  nodes: any[],
  edges: any[],
  name = 'Default Routing'
): Promise<RoutingConfig> {
  // Upsert: update existing active config or insert new
  const existing = await getActiveRoutingConfig();

  if (existing) {
    const rows = await writeQuery<RoutingConfig>(
      `UPDATE inbound.routing_configs
       SET nodes = $1, edges = $2, name = $3, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [JSON.stringify(nodes), JSON.stringify(edges), name, existing.id]
    );
    return rows[0];
  }

  const rows = await writeQuery<RoutingConfig>(
    `INSERT INTO inbound.routing_configs (name, nodes, edges, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING *`,
    [name, JSON.stringify(nodes), JSON.stringify(edges)]
  );
  return rows[0];
}
```

**Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add lib/db-write.ts lib/data/leads.ts lib/data/reps.ts lib/data/routing.ts
git commit -m "feat: add write DB client and data layers for leads, reps, routing"
```

---

## Task 4: App Shell Navigation

**Files:**
- Create: `components/Nav.tsx`
- Modify: `app/layout.tsx`
- Create: `app/routing/page.tsx` (placeholder)
- Create: `app/leads/page.tsx` (placeholder)
- Create: `app/team/page.tsx` (placeholder)

**Step 1: Create the Nav component**

```tsx
// components/Nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GitBranch, Inbox, Users } from 'lucide-react';

const links = [
  { href: '/', label: 'Accounts', icon: LayoutDashboard },
  { href: '/routing', label: 'Routing', icon: GitBranch },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/team', label: 'Team', icon: Users },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center h-14 gap-8">
        <span className="text-white font-bold text-sm tracking-wide">
          GTM Signal
        </span>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
```

**Step 2: Update layout.tsx to include Nav**

Replace `app/layout.tsx`:

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'GTM Signal Scoring',
  description: 'Inbound lead routing powered by real enrichment signals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-gray-50 min-h-screen">
        <Nav />
        <main className="max-w-screen-xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
```

**Step 3: Fix app/page.tsx** — remove the wrapping `<div className="min-h-screen bg-gray-50">` and the `<header>` since Nav now handles those. Replace `app/page.tsx`:

```tsx
// app/page.tsx
import AccountsTable from '@/components/accounts/AccountsTable';
import { getAccounts } from '@/lib/data/companies';

export default async function HomePage() {
  const { accounts, total } = await getAccounts({});

  const withEmail = accounts.filter(a => a.score_breakdown.email_quality > 0).length;
  const withFounder = accounts.filter(a => a.score_breakdown.founder_match > 0).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Founder contact intelligence — ranked by email quality & decision-maker match
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Accounts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{withEmail}</div>
          <div className="text-xs text-gray-500 mt-0.5">Valid Email Found</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{withFounder}</div>
          <div className="text-xs text-gray-500 mt-0.5">Founder Identified</div>
        </div>
      </div>

      <AccountsTable accounts={accounts} />
    </div>
  );
}
```

**Step 4: Create placeholder pages**

```tsx
// app/routing/page.tsx
export default function RoutingPage() {
  return <div className="text-gray-500">Routing canvas coming in Task 8...</div>;
}
```

```tsx
// app/leads/page.tsx
export default function LeadsPage() {
  return <div className="text-gray-500">Leads inbox coming in Task 9...</div>;
}
```

```tsx
// app/team/page.tsx
export default function TeamPage() {
  return <div className="text-gray-500">Team config coming in Task 11...</div>;
}
```

**Step 5: Test in browser**

```bash
npm run dev
```

Visit `http://localhost:3000` — should see dark top nav with Accounts, Routing, Leads, Team links. Click each — placeholders should render. Accounts page should still show the accounts table.

**Step 6: Commit**

```bash
git add components/Nav.tsx app/layout.tsx app/page.tsx app/routing/page.tsx app/leads/page.tsx app/team/page.tsx
git commit -m "feat: add persistent nav shell and placeholder pages for routing/leads/team"
```

---

## Task 5: POST /api/inbound Webhook Endpoint

**Files:**
- Create: `app/api/inbound/route.ts`

**Step 1: Create the route**

```typescript
// app/api/inbound/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createLead, enrichDomainFromNeon, extractDomain } from '@/lib/data/leads';
import { getActiveRoutingConfig } from '@/lib/data/routing';
import { executeRouting } from '@/lib/routing/engine';
import { InboundFormPayload } from '@/types/inbound';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as InboundFormPayload;

    if (!body.full_name || !body.email) {
      return NextResponse.json(
        { error: 'full_name and email are required' },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // 1. Enrich from Neon DB
    const domain = extractDomain(body.email);
    const enrichment = domain ? await enrichDomainFromNeon(domain) : null;

    // 2. Save lead
    const lead = await createLead(body, enrichment);

    // 3. Execute routing in background (non-blocking for form UX)
    const routingConfig = await getActiveRoutingConfig();
    if (routingConfig) {
      // Run async — don't await, return fast to caller
      executeRouting(routingConfig, lead).catch(err => {
        console.error('Routing execution failed for lead', lead.id, err);
      });
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      enriched: enrichment !== null,
      atlas_score: lead.atlas_score,
      message: 'Lead received. We\'ll be in touch shortly.',
    });
  } catch (error) {
    console.error('Error processing inbound lead:', error);
    return NextResponse.json(
      { error: 'Failed to process lead' },
      { status: 500 }
    );
  }
}

// GET for health check / testing
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'POST /api/inbound' });
}
```

**Step 2: Create the routing execution engine** (stub — will be filled in Task 9)

```typescript
// lib/routing/engine.ts
import { RoutingConfig, InboundLead, RoutingTraceStep } from '@/types/inbound';
import { getRepByRole } from '@/lib/data/reps';
import { updateLeadRouting, logEmail } from '@/lib/data/leads';
import { sendEmail } from '@/lib/email';

export async function executeRouting(
  config: RoutingConfig,
  lead: InboundLead
): Promise<RoutingTraceStep[]> {
  const { nodes, edges } = config;
  const trace: RoutingTraceStep[] = [];
  let assignedRepId: string | undefined;
  let currentStatus = 'new';

  // Start from trigger node
  let currentNodeId = nodes.find(n => n.type === 'triggerNode')?.id;

  while (currentNodeId) {
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    let result = '';
    let success = true;
    let nextNodeId: string | undefined;
    let branch: string | undefined;

    try {
      switch (node.type) {
        case 'triggerNode': {
          result = `Lead received from ${lead.source}`;
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'enrichNode': {
          result = lead.atlas_score != null
            ? `Enriched — Atlas Score: ${lead.atlas_score}`
            : 'No enrichment data found in DB';
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'conditionNode': {
          const { field, operator, value } = node.data;
          const leadValue = (lead as any)[field as string];
          let conditionMet = false;

          if (operator === 'gte') conditionMet = Number(leadValue) >= Number(value);
          else if (operator === 'lte') conditionMet = Number(leadValue) <= Number(value);
          else if (operator === 'eq') conditionMet = String(leadValue) === String(value);
          else if (operator === 'contains') conditionMet = String(leadValue || '').includes(String(value));

          branch = conditionMet ? 'true' : 'false';
          result = `${field} ${operator} ${value}: ${conditionMet ? 'YES → high-score path' : 'NO → standard path'}`;
          nextNodeId = edges.find(e => e.source === currentNodeId && e.sourceHandle === branch)?.target;
          break;
        }

        case 'assignNode': {
          const rep = await getRepByRole(node.data.role || 'SDR');
          if (rep) {
            assignedRepId = rep.id;
            currentStatus = 'assigned';
            result = `Assigned to ${rep.name} (${rep.role})`;
          } else {
            result = `No available ${node.data.role} rep found`;
            success = false;
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'autoReplyNode': {
          const template = node.data.template || 'standard';
          const emailResult = await sendEmail({
            lead,
            template: template as 'founder' | 'standard',
          });
          if (emailResult.success) {
            currentStatus = 'replied';
            result = `Auto-reply sent (${template} template)`;
          } else {
            result = `Email failed: ${emailResult.error}`;
            success = false;
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'notifyNode': {
          // Slack webhook notification
          const webhookUrl = node.data.slack_webhook_url;
          if (webhookUrl) {
            try {
              await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: `New inbound lead: *${lead.full_name}* from ${lead.domain || lead.email} — Atlas Score: ${lead.atlas_score ?? 'N/A'}`,
                }),
              });
              result = 'Slack notification sent';
            } catch {
              result = 'Slack notification failed';
              success = false;
            }
          } else {
            result = 'No Slack webhook configured';
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        default: {
          result = `Unknown node type: ${node.type}`;
          nextNodeId = undefined;
        }
      }
    } catch (err: any) {
      result = `Error: ${err.message}`;
      success = false;
    }

    trace.push({
      nodeId: currentNodeId,
      nodeType: node.type,
      label: node.data.label,
      result,
      success,
    });

    currentNodeId = nextNodeId;
  }

  // Persist routing results
  await updateLeadRouting(lead.id, {
    assigned_rep_id: assignedRepId,
    routing_path: trace,
    status: currentStatus,
  });

  return trace;
}
```

**Step 3: Create the email utility** (stub — templates in Task 10)

```typescript
// lib/email.ts
import { InboundLead, EmailTemplate } from '@/types/inbound';
import { logEmail } from '@/lib/data/leads';

const FOUNDER_TEMPLATE = (lead: InboundLead) => ({
  subject: `Quick note from GTM Signal — ${lead.company || lead.domain || 'your company'}`,
  body: `Hi ${lead.full_name.split(' ')[0]},

I noticed you're a founder at ${lead.company || lead.domain} — I wanted to make sure you got straight to the right person on our team rather than waiting in a queue.

Your company scored highly in our enrichment signals, which tells us you're exactly the type of team we work best with.

I'd love to set up 15 minutes to learn more about what you're working on. Are you available later this week?

Best,
The GTM Signal Team`,
});

const STANDARD_TEMPLATE = (lead: InboundLead) => ({
  subject: `Thanks for reaching out — GTM Signal`,
  body: `Hi ${lead.full_name.split(' ')[0]},

Thanks for getting in touch! We've received your request and a member of our team will follow up with you shortly.

In the meantime, feel free to reply to this email with any questions.

Best,
The GTM Signal Team`,
});

export async function sendEmail(params: {
  lead: InboundLead;
  template: EmailTemplate;
}): Promise<{ success: boolean; error?: string }> {
  const { lead, template } = params;
  const { subject, body } =
    template === 'founder' ? FOUNDER_TEMPLATE(lead) : STANDARD_TEMPLATE(lead);

  // If SMTP not configured, just log and return success (for demo)
  if (!process.env.SMTP_HOST) {
    console.log(`[Email] Would send ${template} email to ${lead.email}: ${subject}`);
    await logEmail({
      lead_id: lead.id,
      to_email: lead.email,
      subject,
      body,
      template,
      status: 'sent',
    });
    return { success: true };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'GTM Signal <noreply@gtmsignal.com>',
      to: lead.email,
      subject,
      text: body,
    });

    await logEmail({ lead_id: lead.id, to_email: lead.email, subject, body, template, status: 'sent' });
    return { success: true };
  } catch (err: any) {
    await logEmail({ lead_id: lead.id, to_email: lead.email, subject, body, template, status: 'failed' });
    return { success: false, error: err.message };
  }
}
```

**Step 4: Test the endpoint**

Start the dev server: `npm run dev`

```bash
curl -X POST http://localhost:3000/api/inbound \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Jane Smith","email":"jane@supermush.com","company":"Super Mush","message":"Interested in your product"}'
```

Expected response:
```json
{
  "success": true,
  "lead_id": "<uuid>",
  "enriched": true,
  "atlas_score": 75,
  "message": "Lead received. We'll be in touch shortly."
}
```

**Step 5: Commit**

```bash
git add app/api/inbound/route.ts lib/routing/engine.ts lib/email.ts
git commit -m "feat: add POST /api/inbound endpoint with enrichment and routing execution"
```

---

## Task 6: Seed Synthetic Leads from Spring Cash

**Files:**
- Create: `scripts/seed-leads.ts`

**Step 1: Create the seed script**

```typescript
// scripts/seed-leads.ts
// Run with: npx tsx scripts/seed-leads.ts

import { Pool } from 'pg';
import { createLead, enrichDomainFromNeon } from '../lib/data/leads';

// Spring cash domains with won/lost status
const SPRING_CASH_DOMAINS = [
  { domain: 'divafam.com', status: 'won' },
  { domain: 'clixo.com', status: 'won' },
  { domain: 'idrinkvybes.com', status: 'won' },
  { domain: 'choconovaus.com', status: 'lost' },
  { domain: 'planet-bake.com', status: 'won' },
  { domain: 'nucolato.com', status: 'won' },
  { domain: 'eatprimi.com', status: 'won' },
  { domain: 'goatfuel.com', status: 'lost' },
  { domain: 'santanasnacks.com', status: 'won' },
  { domain: 'drinklaurels.com', status: 'won' },
  { domain: 'sunnyfoods.us', status: 'won' },
  { domain: 'supermush.com', status: 'won' },
  { domain: 'c23.com', status: 'won' },
  { domain: 'theplugdrink.com', status: 'won' },
  { domain: 'flockfoods.com', status: 'won' },
  { domain: 'neurogum.com', status: 'won' },
  { domain: 'hippiewater.com', status: 'won' },
  { domain: 'drinkspade.com', status: 'won' },
  { domain: 'drinkjiant.com', status: 'won' },
  { domain: 'pureover.com', status: 'won' },
];

// Generate plausible contact names for a CPG brand domain
function generateContact(domain: string): { full_name: string; email: string; company: string } {
  const brand = domain
    .replace(/\.(com|us|shop|organic)$/, '')
    .replace(/[^a-z]/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const firstNames = ['Alex', 'Jordan', 'Casey', 'Sam', 'Taylor', 'Morgan', 'Riley', 'Jamie', 'Drew', 'Quinn'];
  const lastNames = ['Chen', 'Rivera', 'Kim', 'Park', 'Nguyen', 'Lee', 'Smith', 'Johnson', 'Williams', 'Brown'];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  return {
    full_name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}@${domain}`,
    company: brand,
  };
}

async function seed() {
  console.log('Seeding synthetic leads from Spring Cash domains...');

  let seeded = 0;
  let failed = 0;

  for (const { domain, status } of SPRING_CASH_DOMAINS) {
    try {
      const contact = generateContact(domain);
      console.log(`[${domain}] Enriching...`);

      const enrichment = await enrichDomainFromNeon(domain);

      const lead = await createLead(
        {
          ...contact,
          message: `Interested in GTM signal scoring for our CPG brand.`,
          source: 'seed',
        },
        enrichment
      );

      console.log(`  ✓ Created lead ${lead.id} — Atlas: ${lead.atlas_score ?? 'N/A'} (${domain}) [${status}]`);
      seeded++;

      // Small delay to avoid overwhelming the DB
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      console.error(`  ✗ Failed for ${domain}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${seeded} seeded, ${failed} failed`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
```

**Step 2: Install tsx for running TypeScript scripts**

```bash
npm install --save-dev tsx
```

**Step 3: Run the seed**

```bash
npx tsx scripts/seed-leads.ts
```

Expected: 20 lines like `✓ Created lead <uuid> — Atlas: 75 (supermush.com) [won]`

Some domains may show `Atlas: N/A` if not in our Neon DB — that's expected.

**Step 4: Verify in DB**

```bash
# In Neon console SQL editor:
SELECT full_name, email, domain, atlas_score, status, submitted_at
FROM inbound.leads
ORDER BY submitted_at DESC
LIMIT 25;
```

Expected: 20 rows with varied atlas scores.

**Step 5: Commit**

```bash
git add scripts/seed-leads.ts package.json package-lock.json
git commit -m "feat: seed script for synthetic Spring Cash CPG brand leads"
```

---

## Task 7: Routing Config API (Save/Load)

**Files:**
- Create: `app/api/routing/route.ts`
- Create: `app/api/reps/route.ts`

**Step 1: Create routing config API**

```typescript
// app/api/routing/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getActiveRoutingConfig, saveRoutingConfig } from '@/lib/data/routing';

export async function GET() {
  try {
    const config = await getActiveRoutingConfig();
    return NextResponse.json({ config });
  } catch (err) {
    console.error('Error fetching routing config:', err);
    return NextResponse.json({ error: 'Failed to fetch routing config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nodes, edges, name } = await request.json();
    if (!nodes || !edges) {
      return NextResponse.json({ error: 'nodes and edges are required' }, { status: 400 });
    }
    const config = await saveRoutingConfig(nodes, edges, name);
    return NextResponse.json({ config, saved: true });
  } catch (err) {
    console.error('Error saving routing config:', err);
    return NextResponse.json({ error: 'Failed to save routing config' }, { status: 500 });
  }
}
```

**Step 2: Create reps API**

```typescript
// app/api/reps/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getReps, createRep, updateRep, deleteRep } from '@/lib/data/reps';

export async function GET() {
  try {
    const reps = await getReps();
    return NextResponse.json({ reps });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch reps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json({ error: 'name, email, role required' }, { status: 400 });
    }
    const rep = await createRep({
      name: body.name,
      email: body.email,
      role: body.role,
      max_leads_per_day: body.max_leads_per_day || 20,
    });
    return NextResponse.json({ rep });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create rep' }, { status: 500 });
  }
}
```

```typescript
// app/api/reps/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { updateRep, deleteRep } from '@/lib/data/reps';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  await updateRep(id, body);
  return NextResponse.json({ updated: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteRep(id);
  return NextResponse.json({ deleted: true });
}
```

**Step 3: Test**

```bash
curl http://localhost:3000/api/routing
# Expected: { config: { id: "...", nodes: [...], edges: [...] } }

curl http://localhost:3000/api/reps
# Expected: { reps: [{id, name, email, role, ...}, ...] }
```

**Step 4: Commit**

```bash
git add app/api/routing/route.ts app/api/reps/route.ts app/api/reps/[id]/route.ts
git commit -m "feat: add routing config and reps API endpoints"
```

---

## Task 8: Leads Inbox Page

**Files:**
- Create: `app/api/leads/route.ts`
- Create: `app/api/leads/[id]/route.ts`
- Replace: `app/leads/page.tsx`
- Create: `components/leads/LeadsTable.tsx`
- Create: `components/leads/LeadDrawer.tsx`

**Step 1: Create leads API routes**

```typescript
// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLeads } from '@/lib/data/leads';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');
  const { leads, total } = await getLeads(limit, offset);
  return NextResponse.json({ leads, total, limit, offset });
}
```

```typescript
// app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, getEmailLogs } from '@/lib/data/leads';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, emails] = await Promise.all([
    getLeadById(id),
    getEmailLogs(id),
  ]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ lead, emails });
}
```

**Step 2: Create LeadsTable component**

```tsx
// components/leads/LeadsTable.tsx
'use client';

import { InboundLead } from '@/types/inbound';
import { User, Mail, Building2, TrendingUp, CheckCircle2, Clock, Zap } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  replied: 'bg-emerald-100 text-emerald-700',
  converted: 'bg-purple-100 text-purple-700',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  new: <Clock size={11} />,
  assigned: <User size={11} />,
  replied: <Mail size={11} />,
  converted: <CheckCircle2 size={11} />,
};

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 60 ? 'text-emerald-600' : score >= 40 ? 'text-yellow-600' : 'text-gray-500';
  return <span className={`font-bold text-sm ${color}`}>{score}</span>;
}

interface Props {
  leads: InboundLead[];
  onSelectLead: (lead: InboundLead) => void;
  selectedId?: string;
}

export default function LeadsTable({ leads, onSelectLead, selectedId }: Props) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Zap size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No leads yet. Submit via the form or run the seed script.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Atlas</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signals</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                selectedId === lead.id ? 'bg-blue-50' : ''
              }`}
            >
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900">{lead.full_name}</div>
                <div className="text-xs text-gray-400">{lead.email}</div>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <Building2 size={12} className="text-gray-400" />
                  <span className="text-gray-700">{lead.company || lead.domain || '—'}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-center">
                <ScoreBadge score={lead.atlas_score ?? undefined} />
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-1">
                  {lead.is_founder_detected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium">
                      ✓ Founder
                    </span>
                  )}
                  {(lead.valid_business_emails ?? 0) > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">
                      ✓ Email
                    </span>
                  )}
                  {lead.mx_found && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      MX
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-gray-600 text-xs">
                {(lead.assigned_rep as any)?.name || <span className="text-gray-400">Unassigned</span>}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[lead.status] || STATUS_STYLES.new}`}>
                  {STATUS_ICONS[lead.status]}
                  {lead.status}
                </span>
              </td>
              <td className="py-3 px-4 text-xs text-gray-400">
                {new Date(lead.submitted_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Create LeadDrawer component**

```tsx
// components/leads/LeadDrawer.tsx
'use client';

import { InboundLead, RoutingTraceStep } from '@/types/inbound';
import { X, CheckCircle2, XCircle, ChevronRight, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  lead: InboundLead | null;
  onClose: () => void;
}

export default function LeadDrawer({ lead, onClose }: Props) {
  const [emails, setEmails] = useState<any[]>([]);

  useEffect(() => {
    if (!lead) { setEmails([]); return; }
    fetch(`/api/leads/${lead.id}`)
      .then(r => r.json())
      .then(data => setEmails(data.emails || []));
  }, [lead?.id]);

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="w-[480px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{lead.full_name}</h2>
            <p className="text-sm text-gray-500">{lead.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-6">
          {/* Score */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Enrichment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">{lead.atlas_score ?? '—'}</div>
                <div className="text-xs text-gray-500">Atlas Score</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Email Quality</span>
                  <span className="font-medium text-emerald-600">{lead.email_quality ?? 0}/40</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Founder Match</span>
                  <span className="font-medium text-purple-600">{lead.founder_match ?? 0}/20</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Contact ID</span>
                  <span className="font-medium text-blue-600">{lead.contact_identity ?? 0}/15</span>
                </div>
              </div>
            </div>
          </section>

          {/* Routing Trace */}
          {lead.routing_path && lead.routing_path.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Routing Path</h3>
              <div className="space-y-1">
                {(lead.routing_path as RoutingTraceStep[]).map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-gray-50">
                    {step.success
                      ? <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                      : <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />}
                    <div>
                      <span className="font-medium text-gray-700">{step.label}</span>
                      <span className="text-gray-400 mx-1">—</span>
                      <span className="text-gray-600">{step.result}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Assigned Rep */}
          {(lead.assigned_rep as any)?.name && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assigned To</h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                  {(lead.assigned_rep as any).name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{(lead.assigned_rep as any).name}</div>
                  <div className="text-xs text-gray-400">{(lead.assigned_rep as any).role}</div>
                </div>
              </div>
            </section>
          )}

          {/* Emails */}
          {emails.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Auto-Replies Sent</h3>
              {emails.map((email: any) => (
                <div key={email.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Mail size={11} className="text-gray-400" />
                    <span className="font-medium text-gray-700">{email.subject}</span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded-full ${
                      email.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>{email.status}</span>
                  </div>
                  <p className="text-gray-500 whitespace-pre-line leading-relaxed">{email.body}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Replace leads page**

```tsx
// app/leads/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { InboundLead } from '@/types/inbound';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadDrawer from '@/components/leads/LeadDrawer';
import { Inbox, RefreshCw } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLead, setSelectedLead] = useState<InboundLead | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox size={22} /> Leads Inbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">{total} total leads</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLeads}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <a
            href="/demo"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            + Submit Lead
          </a>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Loading...
        </div>
      ) : (
        <LeadsTable
          leads={leads}
          onSelectLead={setSelectedLead}
          selectedId={selectedLead?.id}
        />
      )}

      <LeadDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
```

**Step 5: Test in browser**

```bash
npm run dev
```

Visit `http://localhost:3000/leads` — should show leads table with 20 seeded leads. Click any row to open the drawer with enrichment details and routing trace.

**Step 6: Commit**

```bash
git add app/api/leads/ app/leads/page.tsx components/leads/
git commit -m "feat: leads inbox with table and detail drawer"
```

---

## Task 9: Visual Routing Canvas

**Files:**
- Replace: `app/routing/page.tsx`
- Create: `components/routing/RoutingCanvas.tsx`
- Create: `components/routing/nodes/TriggerNode.tsx`
- Create: `components/routing/nodes/EnrichNode.tsx`
- Create: `components/routing/nodes/ConditionNode.tsx`
- Create: `components/routing/nodes/AssignNode.tsx`
- Create: `components/routing/nodes/AutoReplyNode.tsx`
- Create: `components/routing/NodeSidebar.tsx`

**Step 1: Create custom node components**

```tsx
// components/routing/nodes/TriggerNode.tsx
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

export default function TriggerNode({ data }: { data: any }) {
  return (
    <div className="bg-blue-600 text-white rounded-xl px-4 py-3 min-w-[160px] shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Trigger</span>
      </div>
      <div className="text-sm font-medium">{data.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-blue-300" />
    </div>
  );
}
```

```tsx
// components/routing/nodes/EnrichNode.tsx
import { Handle, Position } from '@xyflow/react';
import { Database } from 'lucide-react';

export default function EnrichNode({ data }: { data: any }) {
  return (
    <div className="bg-white border-2 border-emerald-400 rounded-xl px-4 py-3 min-w-[160px] shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <Database size={13} className="text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Enrich</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
}
```

```tsx
// components/routing/nodes/ConditionNode.tsx
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export default function ConditionNode({ data }: { data: any }) {
  return (
    <div className="bg-white border-2 border-yellow-400 rounded-xl px-4 py-3 min-w-[180px] shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch size={13} className="text-yellow-500" />
        <span className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">Condition</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">
        {data.field} {data.operator} {data.value}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-yellow-400" />
      {/* True branch — top */}
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: '30%' }}
        className="!bg-emerald-400"
      />
      {/* False branch — bottom */}
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: '70%' }}
        className="!bg-red-400"
      />
      {/* Labels */}
      <div className="absolute -right-8 text-xs text-emerald-600 font-medium" style={{ top: '18%' }}>Yes</div>
      <div className="absolute -right-7 text-xs text-red-500 font-medium" style={{ top: '60%' }}>No</div>
    </div>
  );
}
```

```tsx
// components/routing/nodes/AssignNode.tsx
import { Handle, Position } from '@xyflow/react';
import { User } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  Senior: 'border-purple-400 text-purple-600',
  AE: 'border-blue-400 text-blue-600',
  SDR: 'border-gray-400 text-gray-600',
};

export default function AssignNode({ data }: { data: any }) {
  const colorClass = ROLE_COLORS[data.role || 'SDR'] || ROLE_COLORS.SDR;
  return (
    <div className={`bg-white border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-md ${colorClass.split(' ')[0]}`}>
      <div className={`flex items-center gap-2 mb-1 ${colorClass.split(' ')[1]}`}>
        <User size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Assign</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      {data.role && <div className="text-xs text-gray-400 mt-0.5">{data.role} queue</div>}
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <Handle type="source" position={Position.Right} className="!bg-gray-300" />
    </div>
  );
}
```

```tsx
// components/routing/nodes/AutoReplyNode.tsx
import { Handle, Position } from '@xyflow/react';
import { Mail } from 'lucide-react';

export default function AutoReplyNode({ data }: { data: any }) {
  const isFounder = data.template === 'founder';
  return (
    <div className={`bg-white border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-md ${
      isFounder ? 'border-purple-400' : 'border-gray-300'
    }`}>
      <div className={`flex items-center gap-2 mb-1 ${isFounder ? 'text-purple-600' : 'text-gray-500'}`}>
        <Mail size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Auto-Reply</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      {data.template && (
        <div className="text-xs text-gray-400 mt-0.5">{data.template} template</div>
      )}
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
    </div>
  );
}
```

**Step 2: Create NodeSidebar**

```tsx
// components/routing/NodeSidebar.tsx
'use client';

import { Zap, Database, GitBranch, User, Mail, BellRing } from 'lucide-react';

const NODE_TYPES = [
  { type: 'triggerNode', label: 'Trigger', icon: Zap, color: 'bg-blue-100 text-blue-700', defaultData: { label: 'Inbound Lead', source: 'form' } },
  { type: 'enrichNode', label: 'Enrich', icon: Database, color: 'bg-emerald-100 text-emerald-700', defaultData: { label: 'Enrich from DB' } },
  { type: 'conditionNode', label: 'Condition', icon: GitBranch, color: 'bg-yellow-100 text-yellow-700', defaultData: { label: 'Atlas Score', field: 'atlas_score', operator: 'gte', value: 60 } },
  { type: 'assignNode', label: 'Assign Rep', icon: User, color: 'bg-purple-100 text-purple-700', defaultData: { label: 'Assign to Rep', role: 'SDR' } },
  { type: 'autoReplyNode', label: 'Auto-Reply', icon: Mail, color: 'bg-gray-100 text-gray-700', defaultData: { label: 'Send Email', template: 'standard' } },
  { type: 'notifyNode', label: 'Notify Slack', icon: BellRing, color: 'bg-orange-100 text-orange-700', defaultData: { label: 'Slack Alert' } },
];

interface Props {
  onAddNode: (type: string, defaultData: any) => void;
}

export default function NodeSidebar({ onAddNode }: Props) {
  return (
    <div className="w-52 bg-white border-r border-gray-200 p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Drag to add</p>
      {NODE_TYPES.map(({ type, label, icon: Icon, color, defaultData }) => (
        <button
          key={type}
          onClick={() => onAddNode(type, defaultData)}
          className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80 ${color}`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">Click a node to add it to the canvas at a new position.</p>
      </div>
    </div>
  );
}
```

**Step 3: Create the main RoutingCanvas component**

```tsx
// components/routing/RoutingCanvas.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import EnrichNode from './nodes/EnrichNode';
import ConditionNode from './nodes/ConditionNode';
import AssignNode from './nodes/AssignNode';
import AutoReplyNode from './nodes/AutoReplyNode';
import NodeSidebar from './NodeSidebar';
import { Save, CheckCircle2 } from 'lucide-react';

const nodeTypes = {
  triggerNode: TriggerNode,
  enrichNode: EnrichNode,
  conditionNode: ConditionNode,
  assignNode: AssignNode,
  autoReplyNode: AutoReplyNode,
};

const DEFAULT_NODES: Node[] = [
  { id: 'trigger-1', type: 'triggerNode', position: { x: 60, y: 180 }, data: { label: 'Inbound Lead', source: 'form' } },
  { id: 'enrich-1', type: 'enrichNode', position: { x: 280, y: 180 }, data: { label: 'Enrich from DB' } },
  { id: 'condition-1', type: 'conditionNode', position: { x: 500, y: 180 }, data: { label: 'Atlas Score ≥ 60', field: 'atlas_score', operator: 'gte', value: 60 } },
  { id: 'assign-senior', type: 'assignNode', position: { x: 740, y: 80 }, data: { label: 'Assign Senior Rep', role: 'Senior' } },
  { id: 'assign-sdr', type: 'assignNode', position: { x: 740, y: 300 }, data: { label: 'Assign SDR Queue', role: 'SDR' } },
  { id: 'reply-founder', type: 'autoReplyNode', position: { x: 980, y: 80 }, data: { label: 'Founder Reply', template: 'founder' } },
  { id: 'reply-standard', type: 'autoReplyNode', position: { x: 980, y: 300 }, data: { label: 'Standard Reply', template: 'standard' } },
];

const DEFAULT_EDGES: Edge[] = [
  { id: 'e1', source: 'trigger-1', target: 'enrich-1' },
  { id: 'e2', source: 'enrich-1', target: 'condition-1' },
  { id: 'e3', source: 'condition-1', target: 'assign-senior', sourceHandle: 'true', animated: true, style: { stroke: '#10b981' } },
  { id: 'e4', source: 'condition-1', target: 'assign-sdr', sourceHandle: 'false', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e5', source: 'assign-senior', target: 'reply-founder' },
  { id: 'e6', source: 'assign-sdr', target: 'reply-standard' },
];

export default function RoutingCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load saved config on mount
  useEffect(() => {
    fetch('/api/routing')
      .then(r => r.json())
      .then(data => {
        if (data.config?.nodes?.length > 0) {
          setNodes(data.config.nodes);
          setEdges(data.config.edges);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const handleAddNode = useCallback((type: string, defaultData: any) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaultData,
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, name: 'Default Routing' }),
      });
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading routing config...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <NodeSidebar onAddNode={handleAddNode} />

      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Default Routing</span>
            <span className="text-xs text-gray-400 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Live</span>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={12} /> Saved {savedAt}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save & Publish'}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap className="!bg-gray-100" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Replace routing page**

```tsx
// app/routing/page.tsx
import RoutingCanvas from '@/components/routing/RoutingCanvas';

export default function RoutingPage() {
  return (
    <div className="-mx-4 -my-6" style={{ height: 'calc(100vh - 56px)' }}>
      <RoutingCanvas />
    </div>
  );
}
```

**Step 5: Add ReactFlowProvider to layout** — React Flow needs a provider. Wrap in `app/layout.tsx`:

```tsx
// app/layout.tsx — add ReactFlowProvider
import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import { ReactFlowProvider } from '@xyflow/react';
import './globals.css';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'GTM Signal Scoring',
  description: 'Inbound lead routing powered by real enrichment signals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-gray-50 min-h-screen">
        <Nav />
        <ReactFlowProvider>
          <main className="max-w-screen-xl mx-auto px-4 py-6">
            {children}
          </main>
        </ReactFlowProvider>
      </body>
    </html>
  );
}
```

Wait — `ReactFlowProvider` is a Client Component. Since `app/layout.tsx` is a Server Component, this won't work directly. Create a wrapper:

```tsx
// components/Providers.tsx
'use client';

import { ReactFlowProvider } from '@xyflow/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
```

Then in `app/layout.tsx`:
```tsx
import Providers from '@/components/Providers';
// wrap children: <Providers>{children}</Providers>
```

**Step 6: Test**

```bash
npm run dev
```

Visit `http://localhost:3000/routing` — should see the routing canvas with 7 pre-built nodes. Try:
- Drag nodes around the canvas
- Connect two nodes by dragging from one handle to another
- Click "Save & Publish" — should persist to DB
- Refresh page — nodes should reload from DB

**Step 7: Commit**

```bash
git add app/routing/page.tsx components/routing/ components/Providers.tsx app/layout.tsx
git commit -m "feat: visual routing canvas with React Flow and pre-built default routing graph"
```

---

## Task 10: Team Config Page

**Files:**
- Replace: `app/team/page.tsx`
- Create: `components/team/RepCard.tsx`

**Step 1: Create RepCard**

```tsx
// components/team/RepCard.tsx
'use client';

import { Rep } from '@/types/inbound';
import { Trash2, User } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  Senior: 'bg-purple-100 text-purple-700',
  AE: 'bg-blue-100 text-blue-700',
  SDR: 'bg-gray-100 text-gray-600',
};

interface Props {
  rep: Rep;
  onDelete: (id: string) => void;
}

export default function RepCard({ rep, onDelete }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold">
        {rep.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{rep.name}</div>
        <div className="text-sm text-gray-400">{rep.email}</div>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[rep.role] || ROLE_COLORS.SDR}`}>
        {rep.role}
      </span>
      <div className="text-right text-xs text-gray-400">
        <div className="font-medium text-gray-700">{rep.max_leads_per_day}</div>
        <div>leads/day</div>
      </div>
      <button
        onClick={() => onDelete(rep.id)}
        className="text-gray-300 hover:text-red-400 transition-colors"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
```

**Step 2: Replace team page**

```tsx
// app/team/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Rep, RepRole } from '@/types/inbound';
import RepCard from '@/components/team/RepCard';
import { Users, Plus } from 'lucide-react';

export default function TeamPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'SDR' as RepRole, max_leads_per_day: 20 });

  const fetchReps = async () => {
    setLoading(true);
    const res = await fetch('/api/reps');
    const data = await res.json();
    setReps(data.reps || []);
    setLoading(false);
  };

  useEffect(() => { fetchReps(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setAdding(true);
    await fetch('/api/reps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ name: '', email: '', role: 'SDR', max_leads_per_day: 20 });
    setAdding(false);
    fetchReps();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/reps/${id}`, { method: 'DELETE' });
    fetchReps();
  };

  const byRole = (role: string) => reps.filter(r => r.role === role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} /> Team Configuration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {reps.length} reps — routing assigns leads by role and daily capacity
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Reps list */}
        <div className="lg:col-span-2 space-y-6">
          {['Senior', 'AE', 'SDR'].map(role => (
            <div key={role}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{role} Reps</h2>
              {loading ? (
                <div className="text-sm text-gray-400">Loading...</div>
              ) : byRole(role).length === 0 ? (
                <div className="text-sm text-gray-300 italic">No {role} reps yet</div>
              ) : (
                <div className="space-y-2">
                  {byRole(role).map(rep => (
                    <RepCard key={rep.id} rep={rep} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add rep form */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Plus size={16} /> Add Rep
            </h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Alex Rivera"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="alex@company.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as RepRole }))}
                >
                  <option value="Senior">Senior Rep</option>
                  <option value="AE">Account Executive</option>
                  <option value="SDR">SDR</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max leads/day</label>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.max_leads_per_day}
                  onChange={e => setForm(f => ({ ...f, max_leads_per_day: parseInt(e.target.value) || 20 }))}
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add Rep'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Test**

Visit `http://localhost:3000/team` — should show 3 seeded reps (Alex, Jordan, Sam). Try adding a new rep. Verify it appears in the correct role group.

**Step 4: Commit**

```bash
git add app/team/page.tsx components/team/
git commit -m "feat: team configuration page with round-robin rep management"
```

---

## Task 11: Public Demo Request Form

**Files:**
- Create: `app/demo/page.tsx`

**Step 1: Create the public form**

```tsx
// app/demo/page.tsx
'use client';

import { useState } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';

export default function DemoPage() {
  const [form, setForm] = useState({ full_name: '', email: '', company: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ atlas_score?: number; lead_id?: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'form' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">You're in the queue!</h1>
          <p className="text-gray-500 text-sm mb-4">
            We've received your request. Our routing engine scored your account
            {result.atlas_score != null && (
              <> at <span className="font-bold text-emerald-600">{result.atlas_score}/100</span></>
            )} and assigned it to the right rep.
          </p>
          <p className="text-xs text-gray-400">Check your email for an auto-reply shortly.</p>
          <div className="mt-6 flex gap-3 justify-center">
            <a href="/leads" className="text-sm text-blue-600 hover:underline">View Leads Inbox →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
          <Zap size={12} /> Inbound Routing Demo
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Request a Demo</h1>
        <p className="text-gray-500 text-sm mt-2">
          Submit your info and watch the routing engine work in real time.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Alex Rivera"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Email *</label>
            <input
              required
              type="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="alex@supermush.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Super Mush Co."
              value={form.company}
              onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Tell us about what you're working on..."
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Routing your lead...' : 'Request Demo →'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Test end-to-end**

```bash
npm run dev
```

1. Visit `http://localhost:3000/demo`
2. Fill in: `Alex Rivera`, `alex@supermush.com`, `Super Mush`
3. Submit — should see success screen with atlas score (supermush.com is in our DB)
4. Visit `http://localhost:3000/leads` — should see the new lead at the top, status `replied`
5. Click the lead — routing trace should show all 7 nodes fired, email logged

**Step 3: Commit**

```bash
git add app/demo/page.tsx
git commit -m "feat: public demo request form with real-time routing feedback"
```

---

## Task 12: Deploy to Vercel

**Step 1: Set environment variables in Vercel**

```bash
vercel env add DATABASE_WRITE_URL production
# Paste the write-capable Neon connection string

vercel env add SMTP_HOST production
# Optional: only if you have SMTP (e.g., smtp.gmail.com)
```

Or via Vercel dashboard: Settings → Environment Variables → add `DATABASE_WRITE_URL`.

**Step 2: Build check**

```bash
npm run build
```

Fix any TypeScript or build errors before deploying.

**Step 3: Deploy**

```bash
vercel --prod
```

Expected: build succeeds, URL returned.

**Step 4: Run seed on production**

After deploy, run seed against production DB (already seeded if you ran Task 6 against production Neon):

```bash
DATABASE_WRITE_URL=<prod-write-url> npx tsx scripts/seed-leads.ts
```

**Step 5: Smoke test production**

1. Visit `https://gtm-signal-scoring.vercel.app/demo` — submit a lead with `@supermush.com` email
2. Visit `https://gtm-signal-scoring.vercel.app/leads` — confirm lead appears with routing trace
3. Visit `https://gtm-signal-scoring.vercel.app/routing` — confirm canvas loads with saved config
4. Visit `https://gtm-signal-scoring.vercel.app/team` — confirm 3 reps visible

**Step 6: Final commit**

```bash
git add .
git commit -m "feat: inbound routing MVP — canvas, leads inbox, auto-reply, team config, Spring Cash synthetic leads"
git push origin main
```

---

## Appendix: Quick Reference

### Key file locations
- Inbound API: `app/api/inbound/route.ts`
- Routing engine: `lib/routing/engine.ts`
- Email utility: `lib/email.ts`
- DB write client: `lib/db-write.ts`
- Lead data layer: `lib/data/leads.ts`
- Routing canvas: `components/routing/RoutingCanvas.tsx`

### Environment variables needed
```
DATABASE_URL=<existing read-only neon url>
DATABASE_WRITE_URL=<write-capable neon url>
SMTP_HOST=<optional — email sending>
SMTP_PORT=587
SMTP_USER=<optional>
SMTP_PASS=<optional>
SMTP_FROM=GTM Signal <noreply@gtmsignal.com>
```

### Test the inbound webhook
```bash
curl -X POST http://localhost:3000/api/inbound \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Jane Smith","email":"jane@neurogum.com","company":"Neuro","source":"webhook"}'
```
