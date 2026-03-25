export interface ICPDefinition {
  name: string;
  description: string;
  scoring: {
    category: string;
    weight: number;
    rules: {
      signal: string;
      operator: "contains" | "equals" | "gt" | "lt" | "gte" | "lte" | "in" | "not_in" | "regex";
      value: string | number | string[];
      points: number;
    }[];
  }[];
  thresholds: {
    qualified: number;
    nurture: number;
  };
  anti_fit: {
    signal: string;
    operator: string;
    value: string | number | string[];
    penalty: number;
    flag: string;
  }[];
}

export interface QualificationRule {
  name: string;
  description: string;
  initial_filters: {
    field: string;
    operator: string;
    value: string | number | string[];
  }[];
  website_analysis: {
    enabled: boolean;
    prompt: string;
    extract_fields: string[];
  };
  icp_ref: string;
}

export interface RoutingRule {
  name: string;
  conditions: {
    field: string;
    operator: string;
    value: string | number | string[];
  }[];
  action: "assign_rep" | "nurture_campaign" | "slack_alert" | "attio_update";
  params: Record<string, string>;
}

export interface HubSpotRoutingConfig {
  pipeline_id: string;
  stages: {
    qualified: string;
    nurture: string;
    hot: string;
  };
  owner_mapping: Record<string, string>;
}

export interface RoutingConfig {
  default_channel: string;
  rep_assignment: "round_robin" | "manual" | "territory";
  reps: { name: string; slack_id: string; email?: string; territory?: string }[];
  rules: RoutingRule[];
  hubspot?: HubSpotRoutingConfig;
}

export interface ResponseTemplate {
  name: string;
  trigger: string;
  system_prompt: string;
  context_fields: string[];
  max_tokens: number;
  temperature: number;
}

export interface Persona {
  name: string;
  titles: string[];
  pain_points: string[];
  motivations: string[];
  messaging_angle: string;
}

export interface ValueProposition {
  key: string;
  headline: string;
  detail: string;
  when_to_use: string;
}

export interface ObjectionHandler {
  objection: string;
  response_framework: string;
}

export interface MessagingFramework {
  company: { name: string; tagline: string; elevator_pitch: string };
  value_propositions: ValueProposition[];
  objection_handling: ObjectionHandler[];
  tone_guidelines: string[];
}

export interface UseCase {
  name: string;
  title: string;
  scenario: string;
  spring_cash_role: string;
  ideal_for: string[];
  keywords: string[];
}

export interface Reference {
  name: string;
  type: string;
  content: string;
  when_to_use: string;
}

export interface ProofPoint {
  name: string;
  category: string;
  retailer?: string;
  summary: string;
  quotable_result: string;
}

export interface Faq {
  question: string;
  answer: string;
  keywords: string[];
}

export interface CompanyContext {
  personas: Persona[];
  messaging: MessagingFramework;
  use_cases: UseCase[];
  references: Reference[];
  proof_points: ProofPoint[];
  faqs: Faq[];
}

export interface AppConfig {
  icp_definitions: Record<string, ICPDefinition>;
  qualification_rules: QualificationRule[];
  routing: RoutingConfig;
  response_templates: ResponseTemplate[];
  company_context: CompanyContext;
}
