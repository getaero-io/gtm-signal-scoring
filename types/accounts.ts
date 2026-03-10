import { ScoreBreakdown, TrendPoint } from './scoring';

export interface Account {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  logo_url?: string;

  // Scoring (computed)
  atlas_score: number;
  score_breakdown: ScoreBreakdown;
  trend_30d: TrendPoint[];

  // Derived metrics
  p0_penetration: {
    current: number;
    total: number;
  };
  tech_stack: TechStackItem[];
  key_contacts: Contact[];

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  full_name: string;
  email?: string;
  title?: string;
  seniority: SeniorityLevel;
  is_p0: boolean;
  linkedin_url?: string;
}

export type SeniorityLevel =
  | 'C-Level'
  | 'VP'
  | 'Director'
  | 'Manager'
  | 'Senior'
  | 'Entry-Level'
  | 'Individual Contributor';

export interface TechStackItem {
  id: string;
  account_id: string;
  name: string;
  category?: string;
  source: string;
  adopted_at: string;
}
