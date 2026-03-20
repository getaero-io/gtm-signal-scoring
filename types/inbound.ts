// types/inbound.ts

export type RepRole = 'Senior' | 'AE' | 'SDR';
export type LeadStatus = 'new' | 'assigned' | 'replied' | 'converted';
export type EmailTemplate = 'founder' | 'standard';
export type LeadSource = 'form' | 'webhook' | 'seed';

export interface Rep {
  id: string;
  name: string;
  email: string;
  role: RepRole;
  max_leads_per_day: number;
  is_active: boolean;
  created_at: string;
}

export interface RoutingNodeData {
  label: string;
  // triggerNode
  source?: 'form' | 'webhook';
  // conditionNode
  field?: string;
  operator?: 'gte' | 'lte' | 'eq' | 'contains';
  value?: number | string;
  // assignNode
  role?: RepRole;
  rep_id?: string;
  // autoReplyNode
  template?: EmailTemplate;
  // notifyNode
  slack_webhook_url?: string;
}

export interface RoutingConfig {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: RoutingNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
  }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutingTraceStep {
  nodeId: string;
  nodeType: string;
  label: string;
  result: string;
  success: boolean;
}

export interface EnrichmentResult {
  atlas_score: number;
  email_quality: number;
  founder_match: number;
  contact_identity: number;
  is_founder_detected: boolean;
  valid_business_emails: number;
  valid_free_emails: number;
  mx_found: boolean;
  contacts: Array<{
    full_name: string;
    email?: string;
    title?: string;
    is_p0: boolean;
  }>;
}

export interface InboundLead {
  id: string;
  full_name: string;
  email: string;
  company?: string;
  domain?: string;
  message?: string;
  source: LeadSource;
  // Enrichment
  atlas_score?: number;
  email_quality?: number;
  founder_match?: number;
  contact_identity?: number;
  is_founder_detected?: boolean;
  valid_business_emails?: number;
  valid_free_emails?: number;
  mx_found?: boolean;
  enrichment_data?: EnrichmentResult;
  // Routing
  assigned_rep_id?: string;
  assigned_rep?: Rep;
  routing_path?: RoutingTraceStep[];
  status: LeadStatus;
  submitted_at: string;
  enriched_at?: string;
  routed_at?: string;
}

export interface EmailLog {
  id: string;
  lead_id: string;
  to_email: string;
  subject: string;
  body: string;
  template: EmailTemplate;
  sent_at: string;
  status: 'sent' | 'failed';
}

export interface InboundFormPayload {
  full_name: string;
  email: string;
  company?: string;
  message?: string;
  source?: LeadSource;
}
