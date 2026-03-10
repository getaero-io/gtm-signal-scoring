import { ScoringWeights } from '@/types/scoring';

export const SCORING_WEIGHTS: ScoringWeights = {
  techAdoption: 15,
  techDecayPerMonth: 2,
  seniorityMultipliers: {
    'C-Level': 25,
    'VP': 20,
    'Director': 15,
    'Manager': 10,
    'Senior': 7,
    'Entry-Level': 3,
    'Individual Contributor': 5,
  },
  p0ContactValue: 10,
  employeeCountTiers: [
    { min: 0, max: 50, points: 5 },
    { min: 51, max: 200, points: 10 },
    { min: 201, max: 1000, points: 15 },
    { min: 1001, max: Infinity, points: 20 },
  ],
  techPerPoint: 1,
};

export const P0_TITLE_PATTERNS = [
  /\b(ceo|chief executive)\b/i,
  /\b(cto|chief technology)\b/i,
  /\b(cfo|chief financial)\b/i,
  /\b(cmo|chief marketing)\b/i,
  /\b(coo|chief operating)\b/i,
  /\bchief\b/i,
];

export const P0_VP_PATTERNS = [
  /\b(vp|vice president)\b/i,
  /\bhead of\b/i,
];

export const P0_DIRECTOR_PATTERNS = [
  /\bdirector\b/i,
];

export const REVENUE_DEPT_PATTERNS = [
  /\b(sales|revenue|marketing|growth|business|commercial|partnerships)\b/i,
];
