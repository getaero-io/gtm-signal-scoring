export interface ContactInput {
  icp_score: number;
  qualified: boolean;
  engagement: {
    total_touchpoints: number;
    velocity_score: number;
    positive_intent: boolean;
    meeting_requested: boolean;
    has_active_conversation: boolean;
    channel_count: number;
  };
}

export interface CompanySignals {
  is_cpg: boolean;
  retailer_count: number;
  employee_count: number;
}

export interface AccountScoreResult {
  account_score: number;
  account_tier: "T1" | "T2" | "T3";
  best_contact_score: number;
  avg_contact_score: number;
  contact_count: number;
  qualified_contact_count: number;
  total_engagement_touchpoints: number;
  has_active_conversation: boolean;
  best_velocity_score: number;
  any_positive_intent: boolean;
  any_meeting_requested: boolean;
  active_channels_count: number;
}

export function computeAccountTier(score: number): "T1" | "T2" | "T3" {
  if (score >= 70) return "T1";
  if (score >= 40) return "T2";
  return "T3";
}

/**
 * Compute an account-level score from all contacts at a domain + company signals.
 *
 * Formula (0-100):
 *   - Best contact ICP score (40% weight)
 *   - Engagement rollup (30% weight)
 *   - Company fit signals (20% weight)
 *   - Contact coverage (10% weight)
 */
export function computeAccountScore(
  contacts: ContactInput[],
  companySignals: CompanySignals
): AccountScoreResult {
  if (contacts.length === 0) {
    return {
      account_score: 0,
      account_tier: "T3",
      best_contact_score: 0,
      avg_contact_score: 0,
      contact_count: 0,
      qualified_contact_count: 0,
      total_engagement_touchpoints: 0,
      has_active_conversation: false,
      best_velocity_score: 0,
      any_positive_intent: false,
      any_meeting_requested: false,
      active_channels_count: 0,
    };
  }

  const scores = contacts.map((c) => c.icp_score);
  const bestContactScore = Math.max(...scores);
  const avgContactScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const qualifiedCount = contacts.filter((c) => c.qualified).length;

  const totalTouchpoints = contacts.reduce(
    (sum, c) => sum + c.engagement.total_touchpoints,
    0
  );
  const hasActiveConv = contacts.some(
    (c) => c.engagement.has_active_conversation
  );
  const bestVelocity = Math.max(
    ...contacts.map((c) => c.engagement.velocity_score)
  );
  const anyPositiveIntent = contacts.some((c) => c.engagement.positive_intent);
  const anyMeetingRequested = contacts.some(
    (c) => c.engagement.meeting_requested
  );
  const maxChannels = Math.max(
    ...contacts.map((c) => c.engagement.channel_count)
  );

  // 1. Best contact score (already 0-100)
  const contactComponent = bestContactScore;

  // 2. Engagement component (0-100)
  let engagementComponent = 0;
  engagementComponent += Math.min(totalTouchpoints * 5, 30);
  engagementComponent += bestVelocity * 0.2;
  if (anyPositiveIntent) engagementComponent += 20;
  if (anyMeetingRequested) engagementComponent += 20;
  if (hasActiveConv) engagementComponent += 10;
  engagementComponent = Math.min(engagementComponent, 100);

  // 3. Company fit (0-100)
  let companyComponent = 0;
  if (companySignals.is_cpg) companyComponent += 40;
  if (companySignals.retailer_count > 0 && companySignals.retailer_count <= 4)
    companyComponent += 30;
  if (companySignals.employee_count > 0 && companySignals.employee_count < 50)
    companyComponent += 20;
  else if (
    companySignals.employee_count >= 50 &&
    companySignals.employee_count < 200
  )
    companyComponent += 10;
  if (qualifiedCount > 0) companyComponent += 10;
  companyComponent = Math.min(companyComponent, 100);

  // 4. Coverage (0-100)
  let coverageComponent = 0;
  coverageComponent += Math.min(contacts.length * 15, 50);
  coverageComponent += Math.min(qualifiedCount * 25, 50);
  coverageComponent = Math.min(coverageComponent, 100);

  const accountScore = Math.round(
    contactComponent * 0.4 +
      engagementComponent * 0.3 +
      companyComponent * 0.2 +
      coverageComponent * 0.1
  );

  return {
    account_score: Math.min(100, Math.max(0, accountScore)),
    account_tier: computeAccountTier(Math.min(100, Math.max(0, accountScore))),
    best_contact_score: bestContactScore,
    avg_contact_score: Math.round(avgContactScore * 10) / 10,
    contact_count: contacts.length,
    qualified_contact_count: qualifiedCount,
    total_engagement_touchpoints: totalTouchpoints,
    has_active_conversation: hasActiveConv,
    best_velocity_score: bestVelocity,
    any_positive_intent: anyPositiveIntent,
    any_meeting_requested: anyMeetingRequested,
    active_channels_count: maxChannels,
  };
}
