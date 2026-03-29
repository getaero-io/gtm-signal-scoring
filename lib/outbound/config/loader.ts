import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type {
  ICPDefinition, QualificationRule, RoutingConfig, ResponseTemplate,
  Persona, MessagingFramework, UseCase, Reference, ProofPoint, Faq, AppConfig,
} from "./types";

const CONFIG_DIR = join(process.cwd(), "config");
const TENANTS_DIR = join(CONFIG_DIR, "tenants");
const FALLBACK_CONTEXT_DIR = join(CONFIG_DIR, "company-context");

function loadYamlFile<T>(filepath: string): T {
  const content = readFileSync(filepath, "utf-8");
  return parse(content) as T;
}

// ---------------------------------------------------------------------------
// Tenant mapping
// ---------------------------------------------------------------------------

interface TenantMapping {
  default_tenant: string;
  campaigns: { campaign_id: string; tenant: string }[];
  campaign_patterns: { pattern: string; tenant: string }[];
}

let cachedTenantMapping: TenantMapping | null = null;

function loadTenantMapping(): TenantMapping {
  if (cachedTenantMapping) return cachedTenantMapping;
  const mappingPath = join(CONFIG_DIR, "tenant-mapping.yaml");
  if (!existsSync(mappingPath)) {
    cachedTenantMapping = { default_tenant: "deepline", campaigns: [], campaign_patterns: [] };
    return cachedTenantMapping;
  }
  cachedTenantMapping = loadYamlFile<TenantMapping>(mappingPath);
  return cachedTenantMapping;
}

/**
 * Resolve a tenant slug from a campaign ID and/or campaign name.
 * Priority: exact campaign_id match → pattern match on name → TENANT_ID env → default_tenant.
 */
export function resolveTenant(campaignId?: string | null, campaignName?: string | null): string {
  const mapping = loadTenantMapping();

  if (campaignId) {
    const exact = mapping.campaigns.find((c) => c.campaign_id === campaignId);
    if (exact) return exact.tenant;
  }

  if (campaignName) {
    for (const p of mapping.campaign_patterns) {
      if (new RegExp(p.pattern, "i").test(campaignName)) {
        return p.tenant;
      }
    }
  }

  return process.env.TENANT_ID || mapping.default_tenant;
}

// ---------------------------------------------------------------------------
// Tenant context loading
// ---------------------------------------------------------------------------

function tenantOrFallback(contextDir: string, filename: string): string {
  const tenantPath = join(contextDir, filename);
  if (existsSync(tenantPath)) return tenantPath;
  return join(FALLBACK_CONTEXT_DIR, filename);
}

function loadTenantContext(tenant: string): { companyContext: AppConfig["company_context"]; responseTemplates: ResponseTemplate[] } {
  const tenantDir = join(TENANTS_DIR, tenant);
  const hasTenantDir = existsSync(tenantDir);
  const contextDir = hasTenantDir ? tenantDir : FALLBACK_CONTEXT_DIR;

  const personasRaw = loadYamlFile<{ personas: Persona[] }>(tenantOrFallback(contextDir, "personas.yaml"));
  const messagingRaw = loadYamlFile<MessagingFramework>(tenantOrFallback(contextDir, "messaging-frameworks.yaml"));
  const useCasesRaw = loadYamlFile<{ use_cases: UseCase[] }>(tenantOrFallback(contextDir, "use-cases.yaml"));
  const referencesRaw = loadYamlFile<{ references: Reference[] }>(tenantOrFallback(contextDir, "references.yaml"));
  const proofPointsRaw = loadYamlFile<{ proof_points: ProofPoint[] }>(tenantOrFallback(contextDir, "proof-points.yaml"));

  const faqsPath = join(contextDir, "faqs.yaml");
  const faqsRaw = existsSync(faqsPath)
    ? loadYamlFile<{ faqs: Faq[] }>(faqsPath)
    : { faqs: [] as Faq[] };

  let responseTemplates: ResponseTemplate[];
  const tenantTemplatesPath = join(contextDir, "response-templates.yaml");
  if (existsSync(tenantTemplatesPath)) {
    const raw = loadYamlFile<{ templates: ResponseTemplate[] }>(tenantTemplatesPath);
    responseTemplates = raw.templates;
  } else {
    const raw = loadYamlFile<{ templates: ResponseTemplate[] }>(join(CONFIG_DIR, "response-templates.yaml"));
    responseTemplates = raw.templates;
  }

  return {
    companyContext: {
      personas: personasRaw.personas,
      messaging: messagingRaw,
      use_cases: useCasesRaw.use_cases,
      references: referencesRaw.references,
      proof_points: proofPointsRaw.proof_points,
      faqs: faqsRaw.faqs,
    },
    responseTemplates,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const configCache = new Map<string, AppConfig>();

/**
 * Load app config.
 * - loadConfig() — uses default tenant (from TENANT_ID env or tenant-mapping default)
 * - loadConfig(true) — force reload default tenant
 * - loadConfig("deepline") — load for specific tenant
 */
export function loadConfig(forceReloadOrTenant?: boolean | string): AppConfig {
  const forceReload = typeof forceReloadOrTenant === "boolean" ? forceReloadOrTenant : false;
  const tenant = typeof forceReloadOrTenant === "string" ? forceReloadOrTenant : null;
  const resolvedTenant = tenant || process.env.TENANT_ID || loadTenantMapping().default_tenant;

  if (!forceReload && configCache.has(resolvedTenant)) {
    return configCache.get(resolvedTenant)!;
  }

  // Global configs (shared across tenants)
  const icp_definitions = loadYamlFile<Record<string, ICPDefinition>>(
    join(CONFIG_DIR, "icp-definitions.yaml")
  );
  const qualRaw = loadYamlFile<{ rules: QualificationRule[] }>(
    join(CONFIG_DIR, "qualification-rules.yaml")
  );
  const routing = loadYamlFile<RoutingConfig>(join(CONFIG_DIR, "routing-rules.yaml"));

  // Tenant-specific
  const { companyContext, responseTemplates } = loadTenantContext(resolvedTenant);

  const config: AppConfig = {
    icp_definitions,
    qualification_rules: qualRaw.rules,
    routing,
    response_templates: responseTemplates,
    company_context: companyContext,
  };

  configCache.set(resolvedTenant, config);
  console.log(`[config] Loaded config for tenant: ${resolvedTenant}`);
  return config;
}

export function reloadConfig(): AppConfig {
  configCache.clear();
  cachedTenantMapping = null;
  return loadConfig(true);
}
