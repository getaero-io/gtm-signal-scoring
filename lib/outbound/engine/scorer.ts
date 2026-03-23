import type { ICPDefinition } from "../config/types";

export interface ScoreResult {
  total: number;
  breakdown: Record<string, number>;
  flags: string[];
  passed: boolean;
}

type Operator =
  | "equals"
  | "contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "not_in"
  | "regex";

/**
 * Evaluate a single condition against a lead field value.
 * Returns true if the condition is satisfied.
 * Handles null/undefined gracefully — missing values never match
 * (except for not_in, where a missing value is considered "not in" the list).
 */
function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  conditionValue: string | number | string[]
): boolean {
  // not_in is special: a missing value means it's not in the list
  if (operator === "not_in") {
    if (fieldValue == null) return true;
    const list = Array.isArray(conditionValue)
      ? conditionValue
      : [String(conditionValue)];
    const normalized = String(fieldValue).toLowerCase();
    return !list.some((v) => String(v).toLowerCase() === normalized);
  }

  // For all other operators, null/undefined means no match
  if (fieldValue == null) return false;

  switch (operator as Operator) {
    case "equals": {
      return (
        String(fieldValue).toLowerCase() ===
        String(conditionValue).toLowerCase()
      );
    }

    case "contains": {
      return String(fieldValue)
        .toLowerCase()
        .includes(String(conditionValue).toLowerCase());
    }

    case "gt": {
      return Number(fieldValue) > Number(conditionValue);
    }

    case "lt": {
      return Number(fieldValue) < Number(conditionValue);
    }

    case "gte": {
      return Number(fieldValue) >= Number(conditionValue);
    }

    case "lte": {
      return Number(fieldValue) <= Number(conditionValue);
    }

    case "in": {
      const list = Array.isArray(conditionValue)
        ? conditionValue
        : [String(conditionValue)];
      const normalized = String(fieldValue).toLowerCase();
      return list.some((v) => String(v).toLowerCase() === normalized);
    }

    case "regex": {
      try {
        const re = new RegExp(String(conditionValue), "i");
        return re.test(String(fieldValue));
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Resolve a dotted field path (e.g. "company.industry") from a lead object.
 */
function getField(lead: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = lead;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Score a lead against an ICP definition.
 *
 * For each scoring category, evaluate every rule. Accumulate points but
 * cap at the category weight. Then apply anti-fit penalties. The total
 * is clamped to >= 0, and `passed` is true when total >= icp.thresholds.qualified.
 */
export function scoreLead(
  lead: Record<string, unknown>,
  icp: ICPDefinition
): ScoreResult {
  const breakdown: Record<string, number> = {};
  const flags: string[] = [];

  // --- Scoring categories ---
  for (const category of icp.scoring) {
    let categoryScore = 0;

    for (const rule of category.rules) {
      const fieldValue = getField(lead, rule.signal);
      if (evaluateCondition(fieldValue, rule.operator, rule.value)) {
        categoryScore += rule.points;
      }
    }

    // Cap at category weight (don't go below 0 either for a category)
    breakdown[category.category] = Math.min(
      Math.max(categoryScore, 0),
      category.weight
    );
  }

  // --- Anti-fit penalties ---
  for (const antiFit of icp.anti_fit) {
    const fieldValue = getField(lead, antiFit.signal);
    if (evaluateCondition(fieldValue, antiFit.operator, antiFit.value)) {
      const penaltyKey = `penalty_${antiFit.flag}`;
      breakdown[penaltyKey] = antiFit.penalty; // penalty is negative
      flags.push(antiFit.flag);
    }
  }

  // --- Total ---
  const total = Math.max(
    0,
    Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  );

  return {
    total,
    breakdown,
    flags,
    passed: total >= icp.thresholds.qualified,
  };
}
