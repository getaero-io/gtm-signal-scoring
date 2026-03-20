export interface ScoreBreakdown {
  total: number;
  email_quality: number;      // valid email + deliverability (max 40)
  contact_identity: number;   // named contact with title (max 15)
  founder_match: number;      // P0 founder/decision-maker match (max 20)
  data_coverage: number;      // MX record confirmed (max 5)
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
