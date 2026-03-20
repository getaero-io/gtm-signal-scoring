/**
 * Returns the correct model handle for AI generation calls.
 * - ANTHROPIC_API_KEY → uses @ai-sdk/anthropic directly (no gateway needed)
 * - AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN → uses plain model string through AI Gateway
 * Falls back gracefully: returns null when no credentials are configured.
 */

export function getAnthropicModel(modelId = 'claude-haiku-4.5') {
  if (process.env.ANTHROPIC_API_KEY) {
    const { createAnthropic } = require('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelId);
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    // Plain string routes through AI Gateway automatically
    return `anthropic/${modelId}`;
  }
  return null;
}

export function hasAICredentials(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN
  );
}
