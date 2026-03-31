export interface Account {
  id: string;
  name: string;
  domain: string;
  founder_name: string | null;
  founder_email: string | null;
  founder_title: string | null;
  email_status: string | null;
  retailer_count: number;
  retailers_list: string | null;
  sc_tier: string | null;
  icp_score: number | null;
  account_score: number | null;
  account_tier: string | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

// Legacy types kept for backward compatibility with scoring engine & integrations
export type SeniorityLevel =
  | 'C-Level'
  | 'VP'
  | 'Director'
  | 'Manager'
  | 'Senior'
  | 'Entry-Level'
  | 'Individual Contributor';

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

export interface TechStackItem {
  id: string;
  account_id: string;
  name: string;
  category?: string;
  source: string;
  adopted_at: string;
}
