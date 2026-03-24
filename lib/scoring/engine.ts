import { ScoreBreakdown, TrendPoint, Signal } from '@/types/scoring';
import { Contact, TechStackItem } from '@/types/accounts';
import { SCORING_WEIGHTS } from './config';

export function calculateAtlasScore(params: {
  contacts: Contact[];
  validBusinessEmails: number;
  validFreeEmails: number;
  mxFound: boolean;
  techStack?: TechStackItem[];
}): ScoreBreakdown {
  const { contacts, validBusinessEmails, validFreeEmails, mxFound, techStack = [] } = params;

  const emailQuality = Math.min(
    40,
    validBusinessEmails * SCORING_WEIGHTS.validBusinessEmailPoints +
      validFreeEmails * SCORING_WEIGHTS.validFreeEmailPoints
  );

  const namedContacts = contacts.filter(
    c => c.full_name && c.full_name !== 'Unknown' && !c.full_name.includes('@')
  ).length;
  const contactIdentity = Math.min(15, namedContacts * SCORING_WEIGHTS.namedContactPoints);

  const founderMatch = Math.min(
    20,
    contacts.filter(c => c.is_p0).length * SCORING_WEIGHTS.founderMatchPoints
  );

  const dataCoverage = mxFound ? SCORING_WEIGHTS.mxFoundPoints : 0;

  const techStackScore = calculateTechStackScore(techStack);

  const total = Math.min(100, 20 + emailQuality + contactIdentity + founderMatch + dataCoverage + techStackScore);

  return {
    total: Math.round(total),
    email_quality: Math.round(emailQuality),
    contact_identity: Math.round(contactIdentity),
    founder_match: Math.round(founderMatch),
    data_coverage: Math.round(dataCoverage),
    tech_stack: Math.round(techStackScore),
  };
}

function calculateTechStackScore(techStack: TechStackItem[]): number {
  if (techStack.length === 0) return 0;

  let score = SCORING_WEIGHTS.techStackDetectedPoints;

  const icpSet = new Set(SCORING_WEIGHTS.icpTechnologies.map(t => t.toLowerCase()));
  const hasIcpMatch = techStack.some(item => icpSet.has(item.name.toLowerCase()));
  if (hasIcpMatch) {
    score += SCORING_WEIGHTS.icpMatchBonusPoints;
  }

  return Math.min(15, score);
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
      score: is_observed ? currentScore : 20,
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
  techStack?: TechStackItem[];
  accountId: string;
  enrichedAt: string;
}): Signal[] {
  const { contacts, validBusinessEmails, validFreeEmails, mxFound, techStack = [], accountId, enrichedAt } = params;
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

  if (techStack.length > 0) {
    const icpSet = new Set(SCORING_WEIGHTS.icpTechnologies.map(t => t.toLowerCase()));
    const icpMatches = techStack.filter(item => icpSet.has(item.name.toLowerCase()));
    const impact = calculateTechStackScore(techStack);

    signals.push({
      id: `techstack-${accountId}`,
      account_id: accountId,
      type: 'tech_stack_detected',
      date: enrichedAt,
      impact,
      metadata: {
        count: techStack.length,
        technologies: techStack.map(t => t.name),
        icp_matches: icpMatches.map(t => t.name),
      },
      description: icpMatches.length > 0
        ? `${techStack.length} technologies detected, ${icpMatches.length} ICP match${icpMatches.length > 1 ? 'es' : ''}: ${icpMatches.map(t => t.name).join(', ')}`
        : `${techStack.length} technolog${techStack.length > 1 ? 'ies' : 'y'} detected`,
    });
  }

  return signals.sort((a, b) => b.impact - a.impact);
}
