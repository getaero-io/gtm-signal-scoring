import { describe, it, expect } from "vitest";
import {
  computeAccountScore,
  computeAccountTier,
  type ContactInput,
  type CompanySignals,
} from "../lib/outbound/engine/account-scorer";

function makeContact(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    icp_score: 50,
    qualified: false,
    ...overrides,
    engagement: {
      total_touchpoints: 0,
      velocity_score: 0,
      positive_intent: false,
      meeting_requested: false,
      has_active_conversation: false,
      channel_count: 1,
      ...overrides.engagement,
    },
  };
}

const defaultCompanySignals: CompanySignals = {
  is_cpg: false,
  retailer_count: 0,
  employee_count: 0,
};

describe("computeAccountTier", () => {
  it("returns T1 for score 70", () => {
    expect(computeAccountTier(70)).toBe("T1");
  });

  it("returns T2 for score 69", () => {
    expect(computeAccountTier(69)).toBe("T2");
  });

  it("returns T2 for score 40", () => {
    expect(computeAccountTier(40)).toBe("T2");
  });

  it("returns T3 for score 39", () => {
    expect(computeAccountTier(39)).toBe("T3");
  });

  it("returns T1 for score 100", () => {
    expect(computeAccountTier(100)).toBe("T1");
  });

  it("returns T3 for score 0", () => {
    expect(computeAccountTier(0)).toBe("T3");
  });
});

describe("computeAccountScore", () => {
  it("returns all zeros for empty contacts", () => {
    const result = computeAccountScore([], defaultCompanySignals);

    expect(result).toEqual({
      account_score: 0,
      account_tier: "T3",
      best_contact_score: 0,
      avg_contact_score: 0,
      contact_count: 0,
      qualified_contact_count: 0,
      total_engagement_touchpoints: 0,
      has_active_conversation: false,
      best_velocity_score: 0,
      any_positive_intent: false,
      any_meeting_requested: false,
      max_contact_channels: 0,
    });
  });

  it("computes T1 for high-scoring qualified contacts with engagement", () => {
    const contacts: ContactInput[] = [
      makeContact({
        icp_score: 90,
        qualified: true,
        engagement: {
          total_touchpoints: 8,
          velocity_score: 80,
          positive_intent: true,
          meeting_requested: true,
          has_active_conversation: true,
          channel_count: 3,
        },
      }),
      makeContact({
        icp_score: 75,
        qualified: true,
        engagement: {
          total_touchpoints: 4,
          velocity_score: 50,
          positive_intent: true,
          meeting_requested: false,
          has_active_conversation: false,
          channel_count: 2,
        },
      }),
    ];

    const companySignals: CompanySignals = {
      is_cpg: true,
      retailer_count: 3,
      employee_count: 30,
    };

    const result = computeAccountScore(contacts, companySignals);

    expect(result.account_tier).toBe("T1");
    expect(result.account_score).toBeGreaterThanOrEqual(70);
    expect(result.best_contact_score).toBe(90);
    expect(result.avg_contact_score).toBe(82.5);
    expect(result.qualified_contact_count).toBe(2);
    expect(result.has_active_conversation).toBe(true);
    expect(result.any_positive_intent).toBe(true);
    expect(result.any_meeting_requested).toBe(true);
    expect(result.contact_count).toBe(2);
  });

  it("computes T3 for no qualified contacts and no engagement", () => {
    const contacts: ContactInput[] = [
      makeContact({
        icp_score: 20,
        qualified: false,
        engagement: {
          total_touchpoints: 0,
          velocity_score: 0,
          positive_intent: false,
          meeting_requested: false,
          has_active_conversation: false,
          channel_count: 1,
        },
      }),
    ];

    const result = computeAccountScore(contacts, defaultCompanySignals);

    expect(result.account_tier).toBe("T3");
    expect(result.account_score).toBeLessThan(40);
    expect(result.qualified_contact_count).toBe(0);
    expect(result.any_positive_intent).toBe(false);
    expect(result.any_meeting_requested).toBe(false);
    expect(result.has_active_conversation).toBe(false);
  });

  it("boosts score when meeting is requested", () => {
    const baseContact = makeContact({
      icp_score: 60,
      qualified: true,
      engagement: {
        total_touchpoints: 3,
        velocity_score: 40,
        positive_intent: false,
        meeting_requested: false,
        has_active_conversation: false,
        channel_count: 1,
      },
    });

    const meetingContact = makeContact({
      icp_score: 60,
      qualified: true,
      engagement: {
        total_touchpoints: 3,
        velocity_score: 40,
        positive_intent: false,
        meeting_requested: true,
        has_active_conversation: false,
        channel_count: 1,
      },
    });

    const companySignals: CompanySignals = {
      is_cpg: true,
      retailer_count: 2,
      employee_count: 30,
    };

    const withoutMeeting = computeAccountScore([baseContact], companySignals);
    const withMeeting = computeAccountScore([meetingContact], companySignals);

    expect(withMeeting.account_score).toBeGreaterThan(
      withoutMeeting.account_score
    );
    expect(withMeeting.any_meeting_requested).toBe(true);
    expect(withoutMeeting.any_meeting_requested).toBe(false);
  });

  it("caps account score at 100", () => {
    const contacts: ContactInput[] = [
      makeContact({
        icp_score: 100,
        qualified: true,
        engagement: {
          total_touchpoints: 50,
          velocity_score: 100,
          positive_intent: true,
          meeting_requested: true,
          has_active_conversation: true,
          channel_count: 5,
        },
      }),
    ];

    const companySignals: CompanySignals = {
      is_cpg: true,
      retailer_count: 3,
      employee_count: 25,
    };

    const result = computeAccountScore(contacts, companySignals);

    expect(result.account_score).toBeLessThanOrEqual(100);
  });
});
