export interface ScoreBreakdown {
  total: number;
  tech_adoption: number;
  seniority: number;
  engagement: number;
  enrichment: number;
}

export interface TrendPoint {
  date: string;
  score: number;
  is_observed: boolean; // true = real data, false = derived
}

export interface Signal {
  id: string;
  account_id: string;
  type: SignalType;
  date: string;
  impact: number;
  metadata: Record<string, any>;
  description: string;
}

export type SignalType =
  | 'tech_adoption'
  | 'job_change'
  | 'company_growth'
  | 'engagement';

export interface ScoringWeights {
  techAdoption: number;
  techDecayPerMonth: number;
  seniorityMultipliers: Record<string, number>;
  p0ContactValue: number;
  employeeCountTiers: Array<{ min: number; max: number; points: number }>;
  techPerPoint: number;
}
