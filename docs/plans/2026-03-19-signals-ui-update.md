# Signals UI Update — Email Validation Data Model

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the GTM Signal Scoring UI to surface the highest-quality email-validation signals from the Neon DB (`dl_resolved.resolved_people` grouped by domain), replacing the dead Apollo tech-stack model with a working email-enrichment signal model, then deploy to Vercel.

**Architecture:** The DB has no company entities — accounts are derived by grouping `resolved_people` by domain. Signals are email validation outcomes (zerobounce), founder identity completeness, and enrichment coverage. The scoring engine replaces `tech_adoption` with `email_quality`, `seniority` with `contact_identity`, `engagement` with `founder_match`, and `enrichment` with `data_coverage`. The UI updates column labels, detail cards, and signal descriptions to match.

**Tech Stack:** Next.js 16 App Router · Tailwind CSS v4 · pg (PostgreSQL driver) · lucide-react · Recharts (already installed, use for charts) · Neon DB via `dl_resolved.resolved_people`

---

## DB Reality Check (read this first)

The new DB has **453 matched people records** in `dl_resolved.resolved_people`, all entity_type = "person", grouped by `identity_payload->'domain'`:

| Provider | Count | What it has |
|---|---|---|
| google_search | 267 | Domain only, mostly empty results |
| zerobounce | 144 | Email + `result.status` (valid/invalid), `result.firstname/lastname`, `result.free_email` |
| crustdata | 28 | Domain + empty people results |
| apollo | 7 | Person title, organization name, obfuscated last name |
| dropleads | 7 | Domain + search results |

**Key fields per person record:**
- `identity_payload.email[0]` — email address (zerobounce records only)
- `identity_payload.domain[0]` — company domain (all records)
- `raw_payload.result.status` — "valid"/"invalid"/"catch-all" (zerobounce)
- `raw_payload.result.firstname/lastname` — contact name (zerobounce)
- `raw_payload.result.free_email` — boolean (zerobounce)
- `raw_payload.__deepline_identity.context_cols_from_enrich.brand_name` — company display name
- `raw_payload.__deepline_identity.context_cols_from_enrich.grok_founder_title` — "Founder"/"Co-Founder"/"CEO"/etc.
- `raw_payload.__deepline_identity.context_cols_from_enrich.first_name/last_name` — from original CSV

**Signal scoring logic (adapted from zero-context-test):**

| Signal | Points | Rationale |
|---|---|---|
| Valid business email (free_email=false) | +40 | Primary outreach signal — deliverable & professional |
| Valid free email (free_email=true) | +20 | Reachable but lower authority |
| Founder/CEO/Owner title (is_p0) | +20 | Decision-maker contact = highest GTM intent |
| Named contact (has first+last name) | +15 | Identity confirmed, not anonymous |
| MX record found (mx_found=true) | +5 | Domain has working email server |

---

## Task 1: Update Type Definitions

**Files:**
- Modify: `types/scoring.ts`

**Context:** The current `ScoreBreakdown` has `tech_adoption`, `seniority`, `engagement`, `enrichment`. These need to map to the new signal model. `SignalType` needs email signal types.

**Step 1: Update types/scoring.ts**

Replace the file with:

```typescript
export interface ScoreBreakdown {
  total: number;
  email_quality: number;      // was tech_adoption: valid email + deliverability
  contact_identity: number;   // was seniority: named contact with title
  founder_match: number;      // was engagement: is this a P0 founder/decision-maker?
  data_coverage: number;      // was enrichment: how complete is the enrichment?
}

export type SignalType =
  | 'email_validated'
  | 'founder_identified'
  | 'contact_named'
  | 'domain_active';

export interface Signal {
  id: string;
  account_id: string;
  type: SignalType;
  date: string;
  impact: number;
  metadata: Record<string, any>;
  description: string;
}

export interface TrendPoint {
  date: string;
  score: number;
  is_observed: boolean;
}

export interface ScoringWeights {
  validBusinessEmailPoints: number;
  validFreeEmailPoints: number;
  namedContactPoints: number;
  founderMatchPoints: number;
  mxFoundPoints: number;
}
```

**Step 2: Verify no TypeScript errors (will fix in subsequent tasks)**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about missing fields — that's fine, we fix them next.

---

## Task 2: Update Scoring Config & Engine

**Files:**
- Modify: `lib/scoring/config.ts`
- Modify: `lib/scoring/engine.ts`

**Context:** The engine currently scores tech stack (empty in new DB) and Apollo contacts (wrong format). Replace with email-validation signal scoring. The `calculateAtlasScore` function receives contacts (which now carry email validation data via the `email` field and `is_p0` flag) and a new `emailValidated` count.

**Step 1: Rewrite lib/scoring/config.ts**

```typescript
import { ScoringWeights } from '@/types/scoring';

export const SCORING_WEIGHTS: ScoringWeights = {
  validBusinessEmailPoints: 40, // zerobounce valid + free_email=false
  validFreeEmailPoints: 20,     // zerobounce valid + free_email=true
  namedContactPoints: 15,       // contact has first+last name
  founderMatchPoints: 20,       // title matches P0 (founder/CEO/owner)
  mxFoundPoints: 5,             // domain has MX record
};
```

**Step 2: Rewrite lib/scoring/engine.ts**

```typescript
import { ScoreBreakdown, TrendPoint, Signal } from '@/types/scoring';
import { Contact } from '@/types/accounts';
import { SCORING_WEIGHTS } from './config';

export function calculateAtlasScore(params: {
  contacts: Contact[];
  validBusinessEmails: number;
  validFreeEmails: number;
  mxFound: boolean;
}): ScoreBreakdown {
  const { contacts, validBusinessEmails, validFreeEmails, mxFound } = params;

  // Email quality: capped at 40
  const emailQuality = Math.min(
    40,
    validBusinessEmails * SCORING_WEIGHTS.validBusinessEmailPoints +
      validFreeEmails * SCORING_WEIGHTS.validFreeEmailPoints
  );

  // Contact identity: named contacts, capped at 15
  const namedContacts = contacts.filter(
    c => c.full_name && c.full_name !== 'Unknown' && !c.full_name.includes('@')
  ).length;
  const contactIdentity = Math.min(15, namedContacts * SCORING_WEIGHTS.namedContactPoints);

  // Founder match: P0 contacts, capped at 20
  const founderMatch = Math.min(
    20,
    contacts.filter(c => c.is_p0).length * SCORING_WEIGHTS.founderMatchPoints
  );

  // Data coverage: MX found = domain is active
  const dataCoverage = mxFound ? SCORING_WEIGHTS.mxFoundPoints : 0;

  const total = Math.min(100, 20 + emailQuality + contactIdentity + founderMatch + dataCoverage);

  return {
    total: Math.round(total),
    email_quality: Math.round(emailQuality),
    contact_identity: Math.round(contactIdentity),
    founder_match: Math.round(founderMatch),
    data_coverage: Math.round(dataCoverage),
  };
}

export function generate30DayTrend(params: {
  enrichedAt: string;
  currentScore: number;
}): TrendPoint[] {
  const { enrichedAt, currentScore } = params;
  const trend: TrendPoint[] = [];
  const now = new Date();
  const enrichmentDate = new Date(enrichedAt);

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const is_observed = date >= enrichmentDate;
    trend.push({
      date: date.toISOString(),
      score: is_observed ? currentScore : 20, // 20 = base before enrichment
      is_observed,
    });
  }

  return trend;
}

export function detectSignals(params: {
  contacts: Contact[];
  validBusinessEmails: number;
  validFreeEmails: number;
  mxFound: boolean;
  accountId: string;
  enrichedAt: string;
}): Signal[] {
  const { contacts, validBusinessEmails, validFreeEmails, mxFound, accountId, enrichedAt } = params;
  const signals: Signal[] = [];

  if (validBusinessEmails > 0) {
    signals.push({
      id: `email-business-${accountId}`,
      account_id: accountId,
      type: 'email_validated',
      date: enrichedAt,
      impact: SCORING_WEIGHTS.validBusinessEmailPoints,
      metadata: { count: validBusinessEmails, type: 'business' },
      description: `${validBusinessEmails} valid business email${validBusinessEmails > 1 ? 's' : ''} verified`,
    });
  } else if (validFreeEmails > 0) {
    signals.push({
      id: `email-free-${accountId}`,
      account_id: accountId,
      type: 'email_validated',
      date: enrichedAt,
      impact: SCORING_WEIGHTS.validFreeEmailPoints,
      metadata: { count: validFreeEmails, type: 'free' },
      description: `${validFreeEmails} valid email${validFreeEmails > 1 ? 's' : ''} verified (free provider)`,
    });
  }

  const founders = contacts.filter(c => c.is_p0);
  if (founders.length > 0) {
    signals.push({
      id: `founder-${accountId}`,
      account_id: accountId,
      type: 'founder_identified',
      date: enrichedAt,
      impact: SCORING_WEIGHTS.founderMatchPoints,
      metadata: { titles: founders.map(f => f.title).filter(Boolean) },
      description: `Founder/decision-maker identified: ${founders.map(f => f.full_name).join(', ')}`,
    });
  }

  const namedContacts = contacts.filter(
    c => c.full_name && c.full_name !== 'Unknown' && !c.full_name.includes('@')
  );
  if (namedContacts.length > 0 && founders.length === 0) {
    signals.push({
      id: `named-${accountId}`,
      account_id: accountId,
      type: 'contact_named',
      date: enrichedAt,
      impact: SCORING_WEIGHTS.namedContactPoints,
      metadata: { count: namedContacts.length },
      description: `${namedContacts.length} named contact${namedContacts.length > 1 ? 's' : ''} identified`,
    });
  }

  if (mxFound) {
    signals.push({
      id: `mx-${accountId}`,
      account_id: accountId,
      type: 'domain_active',
      date: enrichedAt,
      impact: SCORING_WEIGHTS.mxFoundPoints,
      metadata: {},
      description: 'Domain has active MX record — email server confirmed',
    });
  }

  return signals.sort((a, b) => b.impact - a.impact);
}
```

**Step 3: Verify types compile**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit 2>&1 | head -40
```

---

## Task 3: Update Data Layer to Pass New Score Inputs

**Files:**
- Modify: `lib/data/companies.ts`

**Context:** The current `transformDomainToAccount` calls `calculateAtlasScore({ techStack: [], contacts, employeeCount })`. It needs to pass `validBusinessEmails`, `validFreeEmails`, and `mxFound` from the DB aggregate. The DB query in `DOMAIN_AGG_CTE` already counts `valid_email_count` (zerobounce valid). We need to also count business vs free emails and detect MX presence.

**Step 1: Update DOMAIN_AGG_CTE to gather richer aggregates**

In `lib/data/companies.ts`, replace the `DOMAIN_AGG_CTE` with:

```typescript
const DOMAIN_AGG_CTE = `
  WITH domain_records AS (
    SELECT
      jsonb_array_elements_text(identity_payload->'domain') AS domain,
      id,
      provider,
      identity_payload,
      raw_payload,
      created_at
    FROM dl_resolved.resolved_people
    WHERE is_match = true AND identity_payload ? 'domain'
  ),
  domain_agg AS (
    SELECT
      domain,
      MAX(raw_payload->'__deepline_identity'->'context_cols_from_enrich'->>'brand_name') AS brand_name,
      COUNT(*) AS record_count,
      -- Business emails: valid + not free provider
      COUNT(*) FILTER (
        WHERE provider = 'zerobounce'
          AND raw_payload->'result'->>'status' = 'valid'
          AND (raw_payload->'result'->>'free_email') = 'false'
      ) AS valid_business_email_count,
      -- Free emails: valid + free provider
      COUNT(*) FILTER (
        WHERE provider = 'zerobounce'
          AND raw_payload->'result'->>'status' = 'valid'
          AND (raw_payload->'result'->>'free_email') = 'true'
      ) AS valid_free_email_count,
      -- MX found on any zerobounce record
      BOOL_OR(
        provider = 'zerobounce' AND (raw_payload->'result'->>'mx_found') = 'true'
      ) AS mx_found,
      MAX(created_at) AS updated_at,
      MIN(created_at) AS created_at
    FROM domain_records
    GROUP BY domain
  )
`;
```

**Step 2: Update DomainAggregate interface**

```typescript
interface DomainAggregate {
  domain: string;
  brand_name: string | null;
  record_count: string;
  valid_business_email_count: string;
  valid_free_email_count: string;
  mx_found: boolean;
  updated_at: string;
  created_at: string;
}
```

**Step 3: Update `transformDomainToAccount` to use new fields**

Replace the function body:

```typescript
function transformDomainToAccount(agg: DomainAggregate, contacts: Contact[]): Account {
  const name = agg.brand_name || agg.domain;
  const validBusinessEmails = parseInt(agg.valid_business_email_count || '0');
  const validFreeEmails = parseInt(agg.valid_free_email_count || '0');
  const mxFound = agg.mx_found ?? false;

  const scoreBreakdown = calculateAtlasScore({
    contacts,
    validBusinessEmails,
    validFreeEmails,
    mxFound,
  });

  const trend30d = generate30DayTrend({
    enrichedAt: agg.created_at,
    currentScore: scoreBreakdown.total,
  });

  const p0Count = contacts.filter(c => c.is_p0).length;

  return {
    id: agg.domain,
    name,
    domain: agg.domain,
    industry: undefined,
    logo_url: undefined,
    atlas_score: scoreBreakdown.total,
    score_breakdown: scoreBreakdown,
    trend_30d: trend30d,
    p0_penetration: {
      current: p0Count,
      total: contacts.length,
    },
    tech_stack: [],
    key_contacts: contacts.filter(c => c.is_p0).length > 0
      ? contacts.filter(c => c.is_p0)
      : contacts.slice(0, 3), // fallback: show up to 3 contacts if no P0
    created_at: agg.created_at,
    updated_at: agg.updated_at,
  };
}
```

**Step 4: Update `getAccountSignals` to use new detectSignals signature**

In `getAccountSignals`, update to:

```typescript
export async function getAccountSignals(account: Account) {
  const validBusinessEmails = account.score_breakdown.email_quality >= 40 ? 1 : 0;
  const validFreeEmails =
    account.score_breakdown.email_quality >= 20 && account.score_breakdown.email_quality < 40 ? 1 : 0;

  return detectSignals({
    contacts: account.key_contacts,
    validBusinessEmails,
    validFreeEmails,
    mxFound: account.score_breakdown.data_coverage > 0,
    accountId: account.id,
    enrichedAt: account.updated_at,
  });
}
```

**Step 5: Type check**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit 2>&1 | head -30
```

Expected: clean (0 errors).

**Step 6: Commit**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && git add lib/data/companies.ts lib/scoring/engine.ts lib/scoring/config.ts types/scoring.ts && git commit -m "feat: update scoring model for email-validation signals"
```

---

## Task 4: Update AccountsTable UI

**Files:**
- Modify: `components/accounts/AccountsTable.tsx`

**Context:** Current columns: Account, Industry, Atlas Score, 30-Day Trend, P0 Contacts, Tech Stack. New columns should be: Account (domain), Email Signal (badge: Business/Free/None), Founder Found (yes/no badge), Atlas Score, Enriched. Remove Industry and Tech Stack columns (no data).

**Step 1: Read the current file**

Read `components/accounts/AccountsTable.tsx` to see the full component before editing.

**Step 2: Rewrite AccountsTable.tsx**

```typescript
'use client';

import Link from 'next/link';
import { Account } from '@/types/accounts';
import ScoreDisplay from '@/components/scoring/ScoreDisplay';
import TrendSparkline from '@/components/scoring/TrendSparkline';

interface Props {
  accounts: Account[];
}

function EmailBadge({ account }: { account: Account }) {
  const emailScore = account.score_breakdown.email_quality;
  if (emailScore >= 40) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Business Email
      </span>
    );
  }
  if (emailScore >= 20) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Free Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      No Email
    </span>
  );
}

function FounderBadge({ account }: { account: Account }) {
  const founderScore = account.score_breakdown.founder_match;
  if (founderScore > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        ✓ Founder
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">—</span>;
}

export default function AccountsTable({ accounts }: Props) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No accounts found</p>
        <p className="text-sm mt-1">Try adjusting your search.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 w-64">Account</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Email Signal</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Founder</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Atlas Score</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">30-Day Trend</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Enriched</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map(account => (
            <tr key={account.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/accounts/${encodeURIComponent(account.id)}`}
                  className="group"
                >
                  <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {account.name}
                  </span>
                  <br />
                  <span className="text-xs text-gray-400">{account.domain}</span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <EmailBadge account={account} />
              </td>
              <td className="px-4 py-3">
                <FounderBadge account={account} />
              </td>
              <td className="px-4 py-3">
                <ScoreDisplay score={account.atlas_score} size="sm" />
              </td>
              <td className="px-4 py-3">
                <TrendSparkline data={account.trend_30d} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(account.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
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

**Step 3: Type check**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit 2>&1 | head -20
```

---

## Task 5: Update ScoreBreakdown Component

**Files:**
- Modify: `components/scoring/ScoreBreakdown.tsx`

**Context:** The breakdown shows: Base Score (20), Tech Adoption, Contact Seniority, P0 Engagement, Company Size. Update labels to match new model: Email Quality, Contact Identity, Founder Match, Domain Active.

**Step 1: Read the current file**

Read `components/scoring/ScoreBreakdown.tsx`.

**Step 2: Rewrite ScoreBreakdown.tsx**

```typescript
import { ScoreBreakdown } from '@/types/scoring';

interface Props {
  breakdown: ScoreBreakdown;
}

interface BreakdownItem {
  label: string;
  description: string;
  score: number;
  max: number;
  color: string;
}

export default function ScoreBreakdownDisplay({ breakdown }: Props) {
  const items: BreakdownItem[] = [
    {
      label: 'Email Quality',
      description: 'Valid business or personal email verified',
      score: breakdown.email_quality,
      max: 40,
      color: 'bg-emerald-500',
    },
    {
      label: 'Founder Match',
      description: 'Decision-maker / P0 contact identified',
      score: breakdown.founder_match,
      max: 20,
      color: 'bg-purple-500',
    },
    {
      label: 'Contact Identity',
      description: 'Named contact with confirmed identity',
      score: breakdown.contact_identity,
      max: 15,
      color: 'bg-blue-500',
    },
    {
      label: 'Domain Active',
      description: 'MX record confirmed — domain receives email',
      score: breakdown.data_coverage,
      max: 5,
      color: 'bg-gray-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <span className="text-2xl font-bold text-gray-900">{breakdown.total}</span>
          <span className="text-gray-400 text-sm ml-1">/ 100</span>
        </div>
        <span className="text-xs text-gray-400">Base 20 pts + signals</span>
      </div>

      {/* Component bars */}
      {items.map(item => (
        <div key={item.label}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <p className="text-xs text-gray-400">{item.description}</p>
            </div>
            <span className="text-sm font-semibold text-gray-900 ml-4 shrink-0">
              {item.score}
              <span className="text-gray-400 font-normal">/{item.max}</span>
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${item.color} rounded-full transition-all`}
              style={{ width: `${Math.round((item.score / item.max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Task 6: Update Account Detail Page

**Files:**
- Modify: `app/accounts/[id]/page.tsx`

**Context:** The current detail page has: Score Breakdown, Company Info (industry/domain/P0/tech), 30-Day Trend, Tech Stack card, P0 Contacts card, Intent Signals card. Remove Tech Stack card. Update Company Info to show Email Signal + Founder status. Update signals to use new format.

**Step 1: Read current app/accounts/[id]/page.tsx**

**Step 2: Rewrite the page**

Key changes:
- Remove tech stack card
- Replace "Company Info" fields (remove industry, tech stack count; add email status, founder status, MX status)
- Update signals card to show email/founder signals with correct icons
- Add email validation details to contacts section (show email address if present)

Replace the full page component with this structure:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAccountById, getAccountSignals } from '@/lib/data/companies';
import ScoreDisplay from '@/components/scoring/ScoreDisplay';
import ScoreBreakdownDisplay from '@/components/scoring/ScoreBreakdown';
import TrendChart from '@/components/scoring/TrendChart';
import { Signal } from '@/types/scoring';
import { Contact } from '@/types/accounts';
import { Mail, User, Building2, Globe, Zap } from 'lucide-react';

// Signal type → icon + color
const SIGNAL_CONFIG = {
  email_validated: { icon: '✉', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  founder_identified: { icon: '👤', color: 'text-purple-600', bg: 'bg-purple-50' },
  contact_named: { icon: '🏷', color: 'text-blue-600', bg: 'bg-blue-50' },
  domain_active: { icon: '🌐', color: 'text-gray-600', bg: 'bg-gray-50' },
} as const;

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
        {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{contact.full_name}</span>
          {contact.is_p0 && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
              P0
            </span>
          )}
          <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
            {contact.seniority}
          </span>
        </div>
        {contact.title && (
          <p className="text-xs text-gray-500 mt-0.5">{contact.title}</p>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
          >
            <Mail className="w-3 h-3" />
            {contact.email}
          </a>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 inline-block"
          >
            LinkedIn ↗
          </a>
        )}
      </div>
    </div>
  );
}

function SignalItem({ signal }: { signal: Signal }) {
  const config = SIGNAL_CONFIG[signal.type] || { icon: '⚡', color: 'text-gray-600', bg: 'bg-gray-50' };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bg}`}>
      <span className="text-lg shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.color}`}>{signal.description}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(signal.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
      <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
        +{signal.impact}
      </span>
    </div>
  );
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccountById(id);

  if (!account) notFound();

  const signals = await getAccountSignals(account);
  const hasEmail = account.score_breakdown.email_quality > 0;
  const hasFounder = account.score_breakdown.founder_match > 0;
  const mxActive = account.score_breakdown.data_coverage > 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-800 transition-colors">Accounts</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{account.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            <a
              href={`https://${account.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-1 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {account.domain}
            </a>
          </div>
          <ScoreDisplay score={account.atlas_score} size="lg" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column */}
          <div className="space-y-6">

            {/* Score Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                Score Breakdown
              </h2>
              <ScoreBreakdownDisplay breakdown={account.score_breakdown} />
            </div>

            {/* Account Signals Summary */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                Signal Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
                  </span>
                  {hasEmail ? (
                    <span className="font-medium text-emerald-600">
                      {account.score_breakdown.email_quality >= 40 ? 'Business ✓' : 'Free ✓'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not found</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <User className="w-4 h-4" /> Founder
                  </span>
                  {hasFounder ? (
                    <span className="font-medium text-purple-600">Identified ✓</span>
                  ) : (
                    <span className="text-gray-400">Unknown</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Globe className="w-4 h-4" /> MX Record
                  </span>
                  {mxActive ? (
                    <span className="font-medium text-blue-600">Active ✓</span>
                  ) : (
                    <span className="text-gray-400">Unconfirmed</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> P0 Contacts
                  </span>
                  <span className="font-medium text-gray-900">
                    {account.p0_penetration.current}/{account.p0_penetration.total}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right 2 columns */}
          <div className="lg:col-span-2 space-y-6">

            {/* Trend */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                30-Day Score Trend
              </h2>
              <TrendChart data={account.trend_30d} />
            </div>

            {/* Contacts */}
            {account.key_contacts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                  Contacts ({account.key_contacts.length})
                </h2>
                <div className="space-y-2">
                  {account.key_contacts.map(c => (
                    <ContactCard key={c.id} contact={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Intent Signals */}
            {signals.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Intent Signals
                </h2>
                <div className="space-y-2">
                  {signals.map(s => (
                    <SignalItem key={s.id} signal={s} />
                  ))}
                </div>
              </div>
            )}

            {/* No data state */}
            {account.key_contacts.length === 0 && signals.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400">
                <p className="text-sm">No contacts or signals found for this domain.</p>
                <p className="text-xs mt-1">Enrich this account to generate signals.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
```

**Step 3: Type check**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && git add -A && git commit -m "feat: update UI for email-validation signal model"
```

---

## Task 7: Update Home Page (Accounts List)

**Files:**
- Modify: `app/page.tsx`

**Context:** The home page shows the table and a summary header. Update the subtitle and summary stats to reflect the email-enrichment context.

**Step 1: Read app/page.tsx**

**Step 2: Update the page**

Change the subtitle from:
```
"Account intelligence powered by real signals — Atlas scoring model"
```
to:
```
"Founder contact intelligence — ranked by email quality & decision-maker match"
```

Update the summary line from showing "X accounts" to showing:
- Total accounts
- Accounts with valid email
- Accounts with founder identified

Add a stats bar above the table:

```typescript
// After fetching { accounts, total }, also compute quick stats:
const withEmail = accounts.filter(a => a.score_breakdown.email_quality > 0).length;
const withFounder = accounts.filter(a => a.score_breakdown.founder_match > 0).length;
```

Then in JSX, add above the table:

```tsx
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
```

**Step 3: Type check + commit**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npx tsc --noEmit && git add app/page.tsx && git commit -m "feat: update home page stats for email enrichment context"
```

---

## Task 8: Quick Visual Smoke Test

**Goal:** Verify the app loads, shows accounts, and navigates to detail pages.

**Step 1: Start dev server**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && npm run dev &
```

Wait 5 seconds, then:

**Step 2: Test accounts list API**

```bash
curl -s http://localhost:3000/api/accounts?limit=5 | python3 -m json.tool | head -60
```

Expected: JSON with `data` array of 5 accounts, each having `atlas_score`, `score_breakdown.email_quality`, `score_breakdown.founder_match`.

**Step 3: Test account detail API**

Take the first account's `id` from above and run:

```bash
DOMAIN=$(curl -s http://localhost:3000/api/accounts?limit=1 | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
curl -s "http://localhost:3000/api/accounts/${DOMAIN}" | python3 -m json.tool | head -40
```

Expected: account object with contacts and signals arrays.

**Step 4: Open in browser**

Navigate to `http://localhost:3000` — verify:
- Stats bar shows totals
- Table shows Email Signal and Founder badges
- Click an account with a valid email — detail page shows email address in contact card

**Step 5: Stop dev server**

```bash
kill %1 2>/dev/null || pkill -f "next dev"
```

**Step 6: Commit final state**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && git add -A && git commit -m "chore: verify UI working with new DB"
```

---

## Task 9: Deploy to Vercel

**Context:** Need to push the app to a live Vercel instance with the `DATABASE_URL` env var set. The user likely has Vercel CLI installed.

**Step 1: Check Vercel CLI and login status**

```bash
vercel whoami 2>&1
```

If not logged in:
```bash
vercel login
```

**Step 2: Link project to Vercel (if not already linked)**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && vercel link
```

Follow prompts:
- Scope: user's Vercel account
- Project name: `gtm-signal-scoring` (or accept default)
- Link to existing? → No (create new)

**Step 3: Set DATABASE_URL environment variable**

```bash
vercel env add DATABASE_URL production
```

When prompted, paste:
```
postgresql://dl_tenant_read:npg_i4HVYMDOJ3Pr@ep-withered-haze-adr26e87-pooler.c-2.us-east-1.aws.neon.tech/org_jh77fcm06nxbyq6gkyb1a7d7b58323ck?channel_binding=require&sslmode=require
```

Then add for preview too:
```bash
vercel env add DATABASE_URL preview
# (paste same value)
```

**Step 4: Deploy to production**

```bash
cd /Users/jaitoor/dev/gtm-signal-scoring && vercel --prod
```

Wait for deployment to complete. Copy the production URL.

**Step 5: Verify live deployment**

```bash
PROD_URL=$(vercel ls gtm-signal-scoring --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['url'])" 2>/dev/null || echo "check vercel dashboard")
echo "Production URL: https://$PROD_URL"
curl -s "https://${PROD_URL}/api/accounts?limit=3" | python3 -m json.tool | head -20
```

Expected: accounts from live DB with non-zero atlas scores.

---

## Completion Checklist

- [ ] `types/scoring.ts` — new field names (email_quality, contact_identity, founder_match, data_coverage)
- [ ] `lib/scoring/config.ts` — email-validation weights
- [ ] `lib/scoring/engine.ts` — new calculateAtlasScore, detectSignals, generate30DayTrend signatures
- [ ] `lib/data/companies.ts` — richer domain aggregate query + updated transform function
- [ ] `components/accounts/AccountsTable.tsx` — Email Signal + Founder badges, removed Industry/Tech Stack cols
- [ ] `components/scoring/ScoreBreakdown.tsx` — updated labels and descriptions
- [ ] `app/accounts/[id]/page.tsx` — removed tech stack card, added contact email display, updated signals
- [ ] `app/page.tsx` — updated subtitle + stats bar
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] Live API returns accounts with signals from live DB
- [ ] Deployed to Vercel production URL
