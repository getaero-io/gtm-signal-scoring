# Atlas Scoring Model

> This model is calibrated for one company's ICP. Adjust the weights in `lib/scoring/config.ts` for your own signals and buyer profile.

## Overview

The Atlas score is a composite signal score (0–100) calculated server-side from real database signals. It is **not** a predictive ML model — it is a transparent, rule-based scoring function where every point is traceable to a real data source.

## Algorithm

```
Atlas Score = min(100, Base + TechAdoption + Seniority + Engagement + Enrichment)
```

### Base Score: 20 points

Every matched company starts at 20. This represents a minimum "in-universe" signal — the company exists in the database and was matched by Deepline.

### Tech Adoption: up to +15 per technology

For each technology in the company's tech stack:

```
tech_points = 15 - (months_since_adoption * 2)
tech_points = max(0, tech_points)
```

- A technology adopted today: +15 points
- A technology adopted 6 months ago: +3 points
- A technology adopted 8+ months ago: 0 points (fully decayed)

**Data source:** Apollo `current_technologies` enrichment (observed). No adoption date from Apollo means the current date is used as proxy — marked as derived in trends.

### Seniority: capped at +50 points

For each contact associated with the company:

| Title Pattern | Points |
|---|---|
| C-Level (CEO, CTO, CFO, CMO, COO, Chief *) | +25 |
| VP / Vice President / Head of | +20 |
| Director | +15 |
| Manager / Lead | +10 |
| Senior / Sr. | +7 |
| Entry-Level / Junior / Associate | +3 |
| Individual Contributor | +5 |

Total seniority is capped at 50 points to prevent contact-spamming from inflating scores.

**Data source:** `dl_resolved.resolved_people` linked via `super_company_id`.

### Engagement: +10 per P0 contact

A contact is P0 if they meet either condition:
1. C-Level title (auto-qualifies)
2. VP, Head of, or Director title **in a revenue-relevant department** (Sales, Marketing, Revenue, Growth, Business, Commercial, Partnerships)

P0 contacts are your highest-value outreach targets. Each one adds +10 to the score.

**Data source:** Derived from contact titles in `dl_resolved.resolved_people`.

### Enrichment: +5 to +20 points

Based on company employee count from Apollo enrichment:

| Employee Count | Points |
|---|---|
| 1–50 | +5 |
| 51–200 | +10 |
| 201–1000 | +15 |
| 1001+ | +20 |

**Data source:** `raw_payload.result.data.organization.estimated_num_employees` (Apollo).

## Observed vs Derived Data

Every data point in this app is labeled:

- **Observed** — comes directly from a real data source (Apollo enrichment, `dl_resolved` database)
- **Derived** — calculated algorithmically from observed data (score interpolation, trend generation)

The 30-day trend chart uses blue dots to indicate observed data points and dashed lines for derived/interpolated values.

## Customization

Edit `lib/scoring/config.ts` to change:

```typescript
export const SCORING_WEIGHTS: ScoringWeights = {
  techAdoption: 15,          // points per tech at adoption time
  techDecayPerMonth: 2,      // points lost per month of age
  seniorityMultipliers: { ... },
  p0ContactValue: 10,        // points per P0 contact
  employeeCountTiers: [ ... ],
};

export const P0_TITLE_PATTERNS = [ ... ];    // C-Level patterns
export const P0_VP_PATTERNS = [ ... ];       // VP/Head patterns
export const P0_DIRECTOR_PATTERNS = [ ... ]; // Director patterns
export const REVENUE_DEPT_PATTERNS = [ ... ]; // Revenue dept patterns
```

## Known Limitations

1. **Apollo tech data has no adoption date** — adoption dates default to "now", making tech scores static until Deepline graph data is populated
2. **`super_company_id` linkage** — contacts are only linked to companies when Deepline populates `super_company_id` in `resolved_people`
3. **Single-tenant** — scores are not normalized across tenants; absolute scores only make sense within your own database
