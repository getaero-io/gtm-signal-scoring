import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
} from "../../src/auth/session.js";

const TEST_SECRET = "test-secret-key-for-unit-tests";

describe("session tokens", () => {
  it("creates and verifies a valid session token", () => {
    const token = createSessionToken(TEST_SECRET);
    const result = verifySessionToken(token, TEST_SECRET);
    expect(result).toEqual({ valid: true });
  });

  it("rejects expired tokens", () => {
    const token = createSessionToken(TEST_SECRET, -1);
    const result = verifySessionToken(token, TEST_SECRET);
    expect(result).toEqual({ valid: false });
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken(TEST_SECRET);
    // Flip the last 4 characters of the signature
    const tampered = token.slice(0, -4) + "dead";
    const result = verifySessionToken(tampered, TEST_SECRET);
    expect(result).toEqual({ valid: false });
  });
});

describe("password hashing", () => {
  it("hashes and verifies correct password", async () => {
    const hash = await hashPassword("my-secure-password");
    const valid = await verifyPassword("my-secure-password", hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("my-secure-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });
});
