export interface DBCompany {
  id: string;
  display_name: string;
  identity_payload: Record<string, any>;
  raw_payload: Record<string, any>;
  is_match: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBPerson {
  id: string;
  company_id: string;
  display_name: string;
  identity_payload: Record<string, any>;
  raw_payload: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DBAdoption {
  row_id: string;
  entity_id: string;
  confidence: string;
  reason: Record<string, any>;
  adopted_at: string;
}

export interface DBEntity {
  id: string;
  entity_type: string;
  name: string;
  metadata: Record<string, any>;
}
