# Customization Guide

This app is built for one company's specific ICP and data pipeline. Here's how to adapt it for yours.

## 1. Atlas Scoring Weights

Edit `lib/scoring/config.ts`:

```typescript
export const SCORING_WEIGHTS = {
  techAdoption: 15,       // Increase if tech signals are stronger in your ICP
  techDecayPerMonth: 2,   // Decrease for longer relevant windows
  seniorityMultipliers: {
    'C-Level': 25,        // Adjust if your ICP skews toward specific seniority
    'VP': 20,
    'Director': 15,
    'Manager': 10,
  },
  p0ContactValue: 10,     // Increase if P0 penetration is your primary signal
  employeeCountTiers: [   // Adjust tiers for your ICP size range
    { min: 0, max: 50, points: 5 },
    { min: 51, max: 200, points: 10 },
    { min: 201, max: 1000, points: 15 },
    { min: 1001, max: Infinity, points: 20 },
  ],
};
```

## 2. P0 Contact Definition

Edit the patterns in `lib/scoring/config.ts`:

```typescript
// Who auto-qualifies as P0 regardless of department
export const P0_TITLE_PATTERNS = [
  /\b(ceo|chief executive)\b/i,
  // Add your C-suite patterns
];

// Who qualifies only in revenue-relevant departments
export const P0_VP_PATTERNS = [/\b(vp|vice president)\b/i, /\bhead of\b/i];
export const P0_DIRECTOR_PATTERNS = [/\bdirector\b/i];

// What counts as "revenue-relevant"
export const REVENUE_DEPT_PATTERNS = [
  /\b(sales|revenue|marketing|growth|business|commercial|partnerships)\b/i,
];
```

## 3. Data Extraction

The app reads enrichment data from `raw_payload.result.data.organization` (Apollo format). If you use a different enrichment provider, update `getTechStackFromApollo` in `lib/data/companies.ts`:

```typescript
function getTechStackFromApollo(companyId: string, org: any): TechStackItem[] {
  // Adapt to your enrichment provider's schema
  const technologies = org.current_technologies || org.tech_stack || [];
  // ...
}
```

## 4. Adding Signals

To add a new signal type (e.g., job changes, funding):

1. Add the type to `SignalType` in `types/scoring.ts`
2. Add detection logic in `lib/scoring/engine.ts` > `detectSignals()`
3. Add scoring logic in `calculateAtlasScore()` if it affects the score

## 5. Adding a Plugin

To add a new optional integration (e.g., Salesforce):

1. Create `lib/integrations/salesforce/index.ts`
2. Register it in `lib/integrations/plugins/registry.ts`:
   ```typescript
   { name: 'salesforce', enabled: process.env.ENABLE_SALESFORCE === 'true', ... }
   ```
3. Add env vars to `.env.example`
4. Document in `docs/INTEGRATIONS.md`
