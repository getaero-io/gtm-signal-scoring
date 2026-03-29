import { createHmac, randomBytes, timingSafeEqual, scrypt } from "node:crypto";

const DEFAULT_TTL_SECONDS = 604800; // 7 days

export function createSessionToken(
  secret: string,
  expiresInSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${nonce}.${expiresAt}`;
  const hmacSig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `${payload}.${hmacSig}`;
}

export function verifySessionToken(
  token: string,
  secret: string
): { valid: boolean } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false };

    const [nonce, expiresAtStr, sig] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt)) return { valid: false };

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt < now) return { valid: false };

    // Recompute HMAC and compare with timing-safe equality
    const expectedSig = createHmac("sha256", secret)
      .update(`${nonce}.${expiresAtStr}`)
      .digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");

    if (sigBuf.length !== expectedBuf.length) return { valid: false };
    if (!timingSafeEqual(sigBuf, expectedBuf)) return { valid: false };

    return { valid: true };
  } catch {
    return { valid: false };
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    const [saltHex, keyHex] = hash.split(":");
    if (!saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const expectedKey = Buffer.from(keyHex, "hex");

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    if (derivedKey.length !== expectedKey.length) return false;
    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}
