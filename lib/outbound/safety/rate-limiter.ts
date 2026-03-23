/**
 * Rate Limiter
 *
 * Prevents accidental bulk message sending by enforcing per-action rate limits.
 * Uses a sliding window approach stored in PostgreSQL.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";

interface RateLimitConfig {
  maxPerWindow: number;
  windowMinutes: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  outbound_reply: { maxPerWindow: 10, windowMinutes: 60 },      // Max 10 replies per hour
  slack_notification: { maxPerWindow: 30, windowMinutes: 60 },   // Max 30 Slack messages per hour
  llm_call: { maxPerWindow: 50, windowMinutes: 60 },             // Max 50 LLM calls per hour
  webhook_process: { maxPerWindow: 100, windowMinutes: 60 },     // Max 100 webhook processes per hour
  bulk_approve: { maxPerWindow: 5, windowMinutes: 15 },          // Max 5 bulk approvals per 15 min
};

/**
 * Check if an action is within rate limits.
 * Returns { allowed: true } or { allowed: false, retryAfterSec, currentCount, limit }.
 */
export async function checkRateLimit(
  actionType: string,
  actor: string = 'system'
): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
  retryAfterSec?: number;
}> {
  const config = RATE_LIMITS[actionType];
  if (!config) {
    // Unknown action type — allow by default but log
    console.warn(`[rate-limiter] Unknown action type: ${actionType}`);
    return { allowed: true, currentCount: 0, limit: Infinity };
  }

  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);

  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM inbound.rate_limit_log
     WHERE action_type = $1 AND actor = $2 AND window_start >= $3`,
    [actionType, actor, windowStart.toISOString()]
  );

  const currentCount = parseInt(rows[0]?.count || '0', 10);

  if (currentCount >= config.maxPerWindow) {
    // Estimate when the window resets
    const oldestInWindow = await query<{ window_start: string }>(
      `SELECT window_start FROM inbound.rate_limit_log
       WHERE action_type = $1 AND actor = $2 AND window_start >= $3
       ORDER BY window_start ASC LIMIT 1`,
      [actionType, actor, windowStart.toISOString()]
    );

    const retryAfterSec = oldestInWindow[0]
      ? Math.ceil((new Date(oldestInWindow[0].window_start).getTime() + config.windowMinutes * 60 * 1000 - Date.now()) / 1000)
      : config.windowMinutes * 60;

    return {
      allowed: false,
      currentCount,
      limit: config.maxPerWindow,
      retryAfterSec: Math.max(retryAfterSec, 0),
    };
  }

  return { allowed: true, currentCount, limit: config.maxPerWindow };
}

/**
 * Record an action for rate limiting purposes.
 * Call this AFTER the action is performed.
 */
export async function recordAction(actionType: string, actor: string = 'system'): Promise<void> {
  await writeQuery(
    `INSERT INTO inbound.rate_limit_log (action_type, actor, window_start) VALUES ($1, $2, NOW())`,
    [actionType, actor]
  );
}

/**
 * Convenience: check + record in one call. Throws if rate-limited.
 */
export async function enforceRateLimit(actionType: string, actor: string = 'system'): Promise<void> {
  const result = await checkRateLimit(actionType, actor);
  if (!result.allowed) {
    throw new RateLimitError(
      `Rate limit exceeded for ${actionType}: ${result.currentCount}/${result.limit} in window. Retry in ${result.retryAfterSec}s`,
      result.retryAfterSec || 60
    );
  }
  await recordAction(actionType, actor);
}

export class RateLimitError extends Error {
  retryAfterSec: number;
  constructor(message: string, retryAfterSec: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}
