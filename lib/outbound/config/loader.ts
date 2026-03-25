import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { existsSync } from "fs";
import type {
  ICPDefinition, QualificationRule, RoutingConfig, ResponseTemplate,
  Persona, MessagingFramework, UseCase, Reference, ProofPoint, Faq, AppConfig,
} from "./types";

const tenant = process.env.TENANT_CONFIG_DIR || "outbound";
const CONFIG_DIR = join(process.cwd(), "config", tenant);
const COMPANY_CONTEXT_DIR = join(CONFIG_DIR, "company-context");

function loadYaml<T>(filename: string): T {
  const content = readFileSync(join(CONFIG_DIR, filename), "utf-8");
  return parse(content) as T;
}

function loadCompanyYaml<T>(filename: string): T {
  const content = readFileSync(join(COMPANY_CONTEXT_DIR, filename), "utf-8");
  return parse(content) as T;
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(forceReload = false): AppConfig {
  if (cachedConfig && !forceReload) return cachedConfig;

  const icp_definitions = loadYaml<Record<string, ICPDefinition>>("icp-definitions.yaml");
  const qualRaw = loadYaml<{ rules: QualificationRule[] }>("qualification-rules.yaml");
  const routing = loadYaml<RoutingConfig>("routing-rules.yaml");
  const respRaw = loadYaml<{ templates: ResponseTemplate[] }>("response-templates.yaml");

  const personasRaw = loadCompanyYaml<{ personas: Persona[] }>("personas.yaml");
  const messagingRaw = loadCompanyYaml<MessagingFramework>("messaging-frameworks.yaml");
  const useCasesRaw = loadCompanyYaml<{ use_cases: UseCase[] }>("use-cases.yaml");
  const referencesRaw = loadCompanyYaml<{ references: Reference[] }>("references.yaml");
  const proofPointsRaw = loadCompanyYaml<{ proof_points: ProofPoint[] }>("proof-points.yaml");

  const faqsPath = join(COMPANY_CONTEXT_DIR, "faqs.yaml");
  const faqsRaw = existsSync(faqsPath)
    ? loadCompanyYaml<{ faqs: Faq[] }>("faqs.yaml")
    : { faqs: [] };

  cachedConfig = {
    icp_definitions,
    qualification_rules: qualRaw.rules,
    routing,
    response_templates: respRaw.templates,
    company_context: {
      personas: personasRaw.personas,
      messaging: messagingRaw,
      use_cases: useCasesRaw.use_cases,
      references: referencesRaw.references,
      proof_points: proofPointsRaw.proof_points,
      faqs: faqsRaw.faqs,
    },
  };

  return cachedConfig;
}

export function reloadConfig(): AppConfig {
  return loadConfig(true);
}
