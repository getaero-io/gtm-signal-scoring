/**
 * Slack events handler (Vercel Functions version).
 * Handles URL verification challenge and event subscriptions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // Handle URL verification challenge (no signature check needed)
  if (event?.type === "url_verification") {
    return res.status(200).json({ challenge: event.challenge });
  }

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = (req.headers["x-slack-request-timestamp"] as string) || "";
    const signature = (req.headers["x-slack-signature"] as string) || "";
    if (!verifySignature(signingSecret, timestamp, rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  console.log(`[slack/events] Received: ${event?.event?.type || event?.type || "unknown"}`);
  return res.status(200).json({ ok: true });
}

function verifySignature(secret: string, timestamp: string, body: string, signature: string): boolean {
  try {
    const sigBaseString = `v0:${timestamp}:${body}`;
    const expected = "v0=" + createHmac("sha256", secret).update(sigBaseString).digest("hex");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
