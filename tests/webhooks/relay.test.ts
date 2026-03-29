import { describe, it, expect, vi, beforeEach } from "vitest";
import { relayWebhook } from "../../src/webhooks/relay.js";

describe("relayWebhook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zeroes when targets array is empty", async () => {
    const result = await relayWebhook({ foo: "bar" }, "heyreach", []);

    expect(result).toEqual({
      successes: 0,
      failures: 0,
      errors: [],
    });
  });

  it("relays payload to all configured targets", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const payload = { event: "reply_received", lead_id: "123" };
    const targets = [
      "https://instance-a.example.com/api/webhooks",
      "https://instance-b.example.com/api/webhooks",
    ];

    const result = await relayWebhook(payload, "smartlead", targets);

    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(result.errors).toEqual([]);

    // Verify each target was called with correct URL, method, and body
    expect(mockFetch).toHaveBeenCalledTimes(2);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://instance-a.example.com/api/webhooks?source=smartlead",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      })
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://instance-b.example.com/api/webhooks?source=smartlead",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      })
    );
  });

  it("handles fetch failures gracefully without throwing", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockRejectedValueOnce(new Error("Connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    const targets = [
      "https://good.example.com/api/webhooks",
      "https://bad.example.com/api/webhooks",
    ];

    const result = await relayWebhook({ data: 1 }, "heyreach", targets);

    expect(result.successes).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Connection refused");
  });

  it("counts non-ok HTTP responses as failures", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });
    vi.stubGlobal("fetch", mockFetch);

    const targets = ["https://down.example.com/api/webhooks"];

    const result = await relayWebhook({ x: 1 }, "smartlead", targets);

    expect(result.successes).toBe(0);
    expect(result.failures).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("500");
  });

  it("appends source query param correctly to URLs with existing params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const targets = ["https://example.com/api/webhooks?token=abc"];

    await relayWebhook({}, "heyreach", targets);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/webhooks?token=abc&source=heyreach",
      expect.anything()
    );
  });
});
