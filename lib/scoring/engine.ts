import { ScoreBreakdown, TrendPoint, Signal } from '@/types/scoring';
import { Contact, TechStackItem } from '@/types/accounts';
import { SCORING_WEIGHTS } from './config';

export function calculateAtlasScore(params: {
  techStack: TechStackItem[];
  contacts: Contact[];
  employeeCount?: number;
}): ScoreBreakdown {
  const { techStack, contacts, employeeCount } = params;

  // 1. Tech Adoption Score
  const techScore = calculateTechAdoptionScore(techStack);

  // 2. Seniority Score
  const seniorityScore = calculateSeniorityScore(contacts);

  // 3. Engagement Score (P0 contacts)
  const engagementScore = calculateEngagementScore(contacts);

  // 4. Enrichment Score (company size)
  const enrichmentScore = calculateEnrichmentScore(employeeCount);

  const total = Math.min(
    100,
    20 + techScore + seniorityScore + engagementScore + enrichmentScore
  );

  return {
    total: Math.round(total),
    tech_adoption: Math.round(techScore),
    seniority: Math.round(seniorityScore),
    engagement: Math.round(engagementScore),
    enrichment: Math.round(enrichmentScore),
  };
}

function calculateTechAdoptionScore(techStack: TechStackItem[]): number {
  const now = new Date();
  let score = 0;

  for (const tech of techStack) {
    const adoptedDate = new Date(tech.adopted_at);
    const monthsAgo = Math.floor(
      (now.getTime() - adoptedDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    // Base points minus decay
    const techPoints =
      SCORING_WEIGHTS.techAdoption -
      monthsAgo * SCORING_WEIGHTS.techDecayPerMonth;

    score += Math.max(0, techPoints);
  }

  return score;
}

function calculateSeniorityScore(contacts: Contact[]): number {
  let score = 0;

  for (const contact of contacts) {
    const multiplier = SCORING_WEIGHTS.seniorityMultipliers[contact.seniority] || 0;
    score += multiplier;
  }

  return Math.min(50, score); // Cap at 50 points
}

function calculateEngagementScore(contacts: Contact[]): number {
  const p0Count = contacts.filter(c => c.is_p0).length;
  return p0Count * SCORING_WEIGHTS.p0ContactValue;
}

function calculateEnrichmentScore(employeeCount?: number): number {
  if (!employeeCount) return 0;

  const tier = SCORING_WEIGHTS.employeeCountTiers.find(
    t => employeeCount >= t.min && employeeCount <= t.max
  );

  return tier?.points || 0;
}

export function generate30DayTrend(params: {
  techStack: TechStackItem[];
  currentScore: number;
}): TrendPoint[] {
  const { techStack, currentScore } = params;
  const trend: TrendPoint[] = [];
  const now = new Date();

  // Generate daily points for last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Check if we have adoption data for this date
    const adoptionsOnDate = techStack.filter(tech => {
      const adoptedDate = new Date(tech.adopted_at);
      return adoptedDate <= date;
    });

    // If we have real data (adoptions), mark as observed
    const is_observed = adoptionsOnDate.length > 0;

    // Calculate score for this date
    // For observed dates, use tech stack size as proxy
    // For derived dates, interpolate
    const score = is_observed
      ? Math.min(100, 20 + adoptionsOnDate.length * 5)
      : currentScore; // Simplified - could interpolate

    trend.push({
      date: date.toISOString(),
      score,
      is_observed,
    });
  }

  return trend;
}

export function detectSignals(params: {
  techStack: TechStackItem[];
  contacts: Contact[];
}): Signal[] {
  const { techStack, contacts } = params;
  const signals: Signal[] = [];

  // Tech adoption signals
  techStack.forEach(tech => {
    signals.push({
      id: `tech-${tech.id}`,
      account_id: tech.account_id,
      type: 'tech_adoption',
      date: tech.adopted_at,
      impact: SCORING_WEIGHTS.techAdoption,
      metadata: {
        technology: tech.name,
        category: tech.category,
        source: tech.source,
      },
      description: `Adopted ${tech.name}`,
    });
  });

  // TODO: Job change signals (requires historical data)
  // TODO: Company growth signals (requires historical employee count)

  return signals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
