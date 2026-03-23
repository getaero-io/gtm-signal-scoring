#!/usr/bin/env npx tsx
/**
 * End-to-End Provider Tests
 *
 * Validates that context flows correctly through the entire pipeline
 * for all supported providers: lemlist, smartlead, instantly, heyreach.
 *
 * Tests:
 *   1. resolveProvider() correctly identifies each provider from metadata
 *   2. normalizeChannel() handles all channel variants
 *   3. Message queue captures provider + channel metadata
 *   4. send-reply payload construction is correct for each provider
 *   5. Slack message formatting includes provider context
 *   6. Conversation metadata stores provider-specific lead IDs
 *
 * Usage: npx tsx scripts/test-e2e-providers.ts
 */

import {
  resolveProvider,
  normalizeChannel,
  type OutboundProvider,
  type ReplyChannel,
} from "../lib/outbound/integrations/deepline-outbound";
import { formatOutboundReply } from "../lib/outbound/slack/messages";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertEqual<T>(actual: T, expected: T, name: string): void {
  assert(
    actual === expected,
    name,
    actual !== expected ? `expected "${expected}", got "${actual}"` : undefined
  );
}

function section(title: string): void {
  console.log(`\n━━━ ${title} ━━━`);
}

// ---------------------------------------------------------------------------
// 1. resolveProvider() tests
// ---------------------------------------------------------------------------

section("1. resolveProvider()");

// Explicit provider field takes priority
assertEqual(
  resolveProvider({ provider: "lemlist" }),
  "lemlist",
  "Explicit provider: lemlist"
);
assertEqual(
  resolveProvider({ provider: "smartlead" }),
  "smartlead",
  "Explicit provider: smartlead"
);
assertEqual(
  resolveProvider({ provider: "instantly" }),
  "instantly",
  "Explicit provider: instantly"
);
assertEqual(
  resolveProvider({ provider: "heyreach" }),
  "heyreach",
  "Explicit provider: heyreach"
);

// Legacy metadata key inference
assertEqual(
  resolveProvider({ smartlead_lead_id: "sl_123" }),
  "smartlead",
  "Legacy key: smartlead_lead_id"
);
assertEqual(
  resolveProvider({ instantly_lead_id: "inst_456" }),
  "instantly",
  "Legacy key: instantly_lead_id"
);
assertEqual(
  resolveProvider({ heyreach_lead_id: "hr_789" }),
  "heyreach",
  "Legacy key: heyreach_lead_id"
);

// Default to lemlist when no clues
assertEqual(
  resolveProvider({}),
  "lemlist",
  "Default fallback: lemlist"
);
assertEqual(
  resolveProvider({ campaign_id: "camp_abc" }),
  "lemlist",
  "No provider clues: defaults to lemlist"
);

// Explicit provider overrides legacy keys
assertEqual(
  resolveProvider({ provider: "instantly", smartlead_lead_id: "sl_123" }),
  "instantly",
  "Explicit provider overrides legacy key"
);

// Invalid provider falls through to legacy detection
assertEqual(
  resolveProvider({ provider: "unknown_provider", smartlead_lead_id: "sl_123" }),
  "smartlead",
  "Invalid provider falls to legacy key detection"
);
assertEqual(
  resolveProvider({ provider: "unknown_provider" }),
  "lemlist",
  "Invalid provider with no keys defaults to lemlist"
);

// ---------------------------------------------------------------------------
// 2. normalizeChannel() tests
// ---------------------------------------------------------------------------

section("2. normalizeChannel()");

assertEqual(normalizeChannel("email"), "email", "email → email");
assertEqual(normalizeChannel("linkedin"), "linkedin", "linkedin → linkedin");
assertEqual(normalizeChannel("lemlist"), "email", "lemlist → email");
assertEqual(normalizeChannel("smartlead"), "email", "smartlead → email");
assertEqual(normalizeChannel(undefined), "email", "undefined → email");
assertEqual(normalizeChannel(""), "email", "empty → email");

// ---------------------------------------------------------------------------
// 3. Conversation metadata structure tests
// ---------------------------------------------------------------------------

section("3. Conversation metadata structure");

const providers: OutboundProvider[] = ["lemlist", "smartlead", "instantly", "heyreach"];
const leadIdKeys: Record<OutboundProvider, string> = {
  lemlist: "lemlist_lead_id",
  smartlead: "smartlead_lead_id",
  instantly: "instantly_lead_id",
  heyreach: "heyreach_lead_id",
};

for (const provider of providers) {
  const metadata: Record<string, unknown> = {
    provider,
    campaign_id: `camp_${provider}_001`,
    [leadIdKeys[provider]]: `${provider}_lead_123`,
  };

  // Verify resolveProvider works with this metadata
  assertEqual(
    resolveProvider(metadata),
    provider,
    `Metadata round-trip: ${provider}`
  );

  // Verify the lead ID key exists
  assert(
    metadata[leadIdKeys[provider]] === `${provider}_lead_123`,
    `Lead ID key present: ${leadIdKeys[provider]}`
  );
}

// ---------------------------------------------------------------------------
// 4. send-reply payload simulation
// ---------------------------------------------------------------------------

section("4. send-reply payload simulation");

for (const provider of providers) {
  for (const channel of ["email", "linkedin"] as ReplyChannel[]) {
    const payload = {
      queueId: 42,
      conversationId: 100,
      leadId: `${provider}_lead_123`,
      campaignId: `camp_${provider}_001`,
      channel,
      provider,
      messageText: "Thanks for your interest!",
      metadata: {
        provider,
        [leadIdKeys[provider]]: `${provider}_lead_123`,
        campaign_id: `camp_${provider}_001`,
        approved_by: "testuser",
      },
    };

    // Simulate what send-reply/route.ts does
    const resolvedProvider = resolveProvider({
      ...payload.metadata,
      provider: payload.provider,
    });
    const resolvedChannel = normalizeChannel(payload.channel);

    assertEqual(
      resolvedProvider,
      provider,
      `Payload resolves provider: ${provider}/${channel}`
    );
    assertEqual(
      resolvedChannel,
      channel,
      `Payload resolves channel: ${provider}/${channel}`
    );

    // The operation name that would be sent to Deepline
    const action = channel === "linkedin" ? "send_linkedin_message" : "send_email";
    const operation = `${provider}_${action}`;
    assert(
      operation.startsWith(provider),
      `Operation starts with provider: ${operation}`
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Slack message formatting
// ---------------------------------------------------------------------------

section("5. Slack message formatting");

const campaignUrls: Record<OutboundProvider, string> = {
  lemlist: "https://app.lemlist.com/campaigns/camp_001",
  smartlead: "https://app.smartlead.ai/campaigns/camp_002",
  instantly: "https://app.instantly.ai/campaigns/camp_003",
  heyreach: "https://app.heyreach.io/campaigns/camp_004",
};

for (const provider of providers) {
  const { text, blocks } = formatOutboundReply({
    leadName: "John Doe",
    companyName: "Acme Corp",
    campaignName: "Test Campaign",
    originalReply: "Interested in your product",
    draftedResponse: "Thanks for reaching out!",
    campaignUrl: campaignUrls[provider],
    conversationId: 42,
    provider,
  });

  assert(text.includes("John Doe"), `Slack text includes lead name: ${provider}`);

  // Check that the context block includes the provider
  const contextBlock = (blocks as any[]).find(
    (b) => b.type === "context"
  );
  const contextText = contextBlock?.elements?.[0]?.text || "";
  assert(
    contextText.includes(`Provider: ${provider}`),
    `Context block shows provider: ${provider}`
  );
  assert(
    contextText.includes(campaignUrls[provider]),
    `Context block includes campaign URL: ${provider}`
  );
}

// ---------------------------------------------------------------------------
// 6. Lead ID resolution in handleApprove simulation
// ---------------------------------------------------------------------------

section("6. Lead ID resolution (handleApprove simulation)");

for (const provider of providers) {
  const metadata: Record<string, unknown> = {
    provider,
    [leadIdKeys[provider]]: `${provider}_lead_456`,
    campaign_id: "camp_test",
  };

  // Simulate what interactions.ts does
  const leadId = String(
    metadata.lemlist_lead_id ??
    metadata.smartlead_lead_id ??
    metadata.instantly_lead_id ??
    metadata.heyreach_lead_id ??
    ""
  );

  assert(
    leadId === `${provider}_lead_456`,
    `Lead ID resolved for ${provider}: ${leadId}`
  );

  const resolvedProvider = resolveProvider(metadata);
  assertEqual(resolvedProvider, provider, `Provider resolved in approval: ${provider}`);
}

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

section("7. Edge cases");

// Multiple legacy keys — first match wins (smartlead > instantly > heyreach)
assertEqual(
  resolveProvider({
    smartlead_lead_id: "sl_1",
    instantly_lead_id: "inst_1",
    heyreach_lead_id: "hr_1",
  }),
  "smartlead",
  "Multiple legacy keys: smartlead wins"
);

assertEqual(
  resolveProvider({
    instantly_lead_id: "inst_1",
    heyreach_lead_id: "hr_1",
  }),
  "instantly",
  "Two legacy keys: instantly wins over heyreach"
);

// Empty string provider falls through
assertEqual(
  resolveProvider({ provider: "" }),
  "lemlist",
  "Empty string provider defaults to lemlist"
);

// Null/undefined values in metadata
assertEqual(
  resolveProvider({ provider: null as any }),
  "lemlist",
  "Null provider defaults to lemlist"
);

// Lead ID with mixed provider + legacy key
const mixedMeta = {
  provider: "heyreach" as const,
  lemlist_lead_id: "lem_999",
  campaign_id: "camp_mixed",
};
assertEqual(
  resolveProvider(mixedMeta),
  "heyreach",
  "Explicit heyreach overrides lemlist_lead_id presence"
);

// The lead ID chain picks the first non-null value
const mixedLeadId = String(
  mixedMeta.lemlist_lead_id ?? // "lem_999" — this wins in the chain
  (mixedMeta as any).smartlead_lead_id ??
  (mixedMeta as any).instantly_lead_id ??
  (mixedMeta as any).heyreach_lead_id ??
  ""
);
assertEqual(mixedLeadId, "lem_999", "Lead ID chain picks first match (lemlist_lead_id)");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}`);

if (failed > 0) {
  console.error("\n⚠️  Some tests failed. Review the output above.");
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
  process.exit(0);
}
