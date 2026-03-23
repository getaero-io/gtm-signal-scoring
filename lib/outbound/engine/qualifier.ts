import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { loadConfig } from "../config/loader";
import { scoreLead } from "./scorer";
import { analyzeWebsite } from "../llm";

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

const DEEPLINE_API_URL =
  "https://code.deepline.com/api/v2/integrations/execute";

interface QualificationResult {
  qualified: boolean;
  score: number;
  reason: string;
}

/**
 * Evaluate whether a lead's data satisfies all initial_filters of a rule.
 * Uses the same operator semantics as the scorer's evaluateCondition.
 */
function matchesFilters(
  lead: Record<string, unknown>,
  filters: { field: string; operator: string; value: string | number | string[] }[]
): boolean {
  for (const filter of filters) {
    const fieldValue = getField(lead, filter.field);
    if (!evaluateFilterCondition(fieldValue, filter.operator, filter.value)) {
      return false;
    }
  }
  return true;
}

function getField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateFilterCondition(
  fieldValue: unknown,
  operator: string,
  conditionValue: string | number | string[]
): boolean {
  if (operator === "not_in") {
    if (fieldValue == null) return true;
    const list = Array.isArray(conditionValue)
      ? conditionValue
      : [String(conditionValue)];
    const normalized = String(fieldValue).toLowerCase();
    return !list.some((v) => String(v).toLowerCase() === normalized);
  }

  if (fieldValue == null) return false;

  switch (operator) {
    case "equals":
      return (
        String(fieldValue).toLowerCase() ===
        String(conditionValue).toLowerCase()
      );
    case "contains":
      return String(fieldValue)
        .toLowerCase()
        .includes(String(conditionValue).toLowerCase());
    case "gt":
      return Number(fieldValue) > Number(conditionValue);
    case "lt":
      return Number(fieldValue) < Number(conditionValue);
    case "gte":
      return Number(fieldValue) >= Number(conditionValue);
    case "lte":
      return Number(fieldValue) <= Number(conditionValue);
    case "in": {
      const list = Array.isArray(conditionValue)
        ? conditionValue
        : [String(conditionValue)];
      const normalized = String(fieldValue).toLowerCase();
      return list.some((v) => String(v).toLowerCase() === normalized);
    }
    case "regex":
      try {
        return new RegExp(String(conditionValue), "i").test(
          String(fieldValue)
        );
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Validate that a domain is safe for server-side requests (prevent SSRF).
 * Rejects IP addresses, localhost, internal hostnames, and private ranges.
 */
function isSafePublicDomain(input: string): boolean {
  try {
    const urlStr = input.startsWith("http") ? input : `https://${input}`;
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Reject bare IP addresses
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
    // Reject IPv6
    if (hostname.startsWith('[') || hostname.includes(':')) return false;
    // Reject localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    // Reject private/internal TLDs
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.corp') || hostname.endsWith('.lan')) return false;
    // Must have at least one dot (i.e., be a proper FQDN)
    if (!hostname.includes('.')) return false;
    // Reject common metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Scrape a website via the Deepline API.
 * Returns the raw text content or null on failure.
 */
async function scrapeWebsite(url: string): Promise<string | null> {
  const apiKey = process.env.DEEPLINE_API_KEY;
  if (!apiKey) {
    console.error("[qualifier] DEEPLINE_API_KEY is not set, skipping website scrape");
    return null;
  }

  try {
    const response = await fetch(DEEPLINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        provider: "apify",
        operation: "scrape_website",
        payload: { url, maxPages: 3 },
      }),
    });

    if (!response.ok) {
      console.error(
        `[qualifier] Deepline scrape failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    // The API returns content in the result field; fall back to stringifying the whole response
    return typeof data.result === "string"
      ? data.result
      : typeof data.content === "string"
        ? data.content
        : JSON.stringify(data);
  } catch (err) {
    console.error("[qualifier] Website scrape error:", err);
    return null;
  }
}

/**
 * Qualify a lead end-to-end:
 *   1. Load lead from DB
 *   2. Match against qualification rules
 *   3. Optionally scrape + analyze the company website
 *   4. Score against the referenced ICP definition
 *   5. Persist results and update lead status
 */
export async function qualifyLead(
  leadId: number
): Promise<QualificationResult> {
  const config = loadConfig();

  // 1. Fetch lead from DB
  const lead = await queryOne<Record<string, unknown>>(
    "SELECT * FROM inbound.leads WHERE id = $1",
    [leadId]
  );

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  // 2. Set status to 'qualifying'
  await writeQuery("UPDATE inbound.leads SET status = $1 WHERE id = $2", [
    "qualifying",
    leadId,
  ]);

  // 3. Find the first matching qualification rule
  const matchedRule = config.qualification_rules.find((rule) =>
    matchesFilters(lead, rule.initial_filters)
  );

  if (!matchedRule) {
    // No rule matched — mark as nurture with reason
    await writeQuery("UPDATE inbound.leads SET status = $1 WHERE id = $2", [
      "nurture",
      leadId,
    ]);
    return {
      qualified: false,
      score: 0,
      reason: "No qualification rule matched this lead",
    };
  }

  // 4. Website analysis (if enabled and lead has a domain)
  let websiteAnalysis: Record<string, unknown> = {};

  if (matchedRule.website_analysis.enabled && lead.company_domain) {
    const domain = String(lead.company_domain);
    if (!isSafePublicDomain(domain)) {
      console.warn(`[qualifier] Rejecting unsafe domain: ${domain}`);
    } else {
      const url = domain.startsWith("http") ? domain : `https://${domain}`;
      const content = await scrapeWebsite(url);

      if (content) {
        try {
          websiteAnalysis = await analyzeWebsite({
            websiteContent: content,
            analysisPrompt: matchedRule.website_analysis.prompt,
          });
        } catch (err) {
          console.error("[qualifier] Website analysis failed:", err);
        }
      }
    }
  }

  // 5. Merge website analysis data into lead data for scoring
  const enrichedLead: Record<string, unknown> = {
    ...lead,
    ...websiteAnalysis,
  };

  // 6. Score against the ICP referenced by the rule
  const icp = config.icp_definitions[matchedRule.icp_ref];
  if (!icp) {
    throw new Error(
      `ICP definition "${matchedRule.icp_ref}" referenced by rule "${matchedRule.name}" not found`
    );
  }

  const scoreResult = scoreLead(enrichedLead, icp);

  const status = scoreResult.passed ? "qualified" : "nurture";
  const reason = scoreResult.passed
    ? `Qualified via "${matchedRule.name}" with score ${scoreResult.total}/${icp.thresholds.qualified}`
    : scoreResult.flags.length > 0
      ? `Anti-fit flags: ${scoreResult.flags.join(", ")}. Score ${scoreResult.total}/${icp.thresholds.qualified}`
      : `Score ${scoreResult.total} below threshold ${icp.thresholds.qualified}`;

  // 7. Store result in qualification_results table
  await writeQuery(
    `INSERT INTO inbound.qualification_results
       (lead_id, rule_name, icp_ref, score, breakdown, flags, qualified, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      leadId,
      matchedRule.name,
      matchedRule.icp_ref,
      scoreResult.total,
      JSON.stringify(scoreResult.breakdown),
      JSON.stringify(scoreResult.flags),
      scoreResult.passed,
      reason,
    ]
  );

  // 8. Update lead status
  await writeQuery(
    "UPDATE inbound.leads SET status = $1, qualification_score = $2 WHERE id = $3",
    [status, scoreResult.total, leadId]
  );

  // 9. Return result
  return {
    qualified: scoreResult.passed,
    score: scoreResult.total,
    reason,
  };
}
