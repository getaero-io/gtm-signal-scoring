/**
 * Slack interactions handler (Vercel Functions fallback).
 *
 * The primary handler is the Next.js App Router route at
 * app/api/outbound/slack/interactions/route.ts which has full
 * approve/reject/edit/undo logic.
 *
 * This fallback handles signature verification and acks Slack
 * within 3 seconds. It delegates to the shared handleInteraction()
 * but catches import failures gracefully (e.g. if Next.js isn't built).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = (req.headers["x-slack-request-timestamp"] as string) || "";
    const signature = (req.headers["x-slack-signature"] as string) || "";
    if (!verifySignature(signingSecret, timestamp, rawBody, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  // Parse payload from URL-encoded body
  let payload: any;
  try {
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");
    if (payloadStr) {
      payload = JSON.parse(payloadStr);
    } else {
      payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (payload?.payload) {
        payload = typeof payload.payload === "string" ? JSON.parse(payload.payload) : payload.payload;
      }
    }
  } catch {
    return res.status(400).json({ error: "invalid payload" });
  }

  if (!payload) {
    return res.status(400).json({ error: "missing payload" });
  }

  // Log the interaction
  const actionIds = (payload.actions || []).map((a: any) => a.action_id).join(",");
  console.log(`[slack/interactions] Received: ${actionIds || payload.type || "unknown"}`);

  // Ack immediately — Slack needs response within 3s
  // The full handler runs async after ack
  res.status(200).json({ ok: true });

  // Try to delegate to the shared interaction handler
  try {
    const mod = await import("../../lib/outbound/slack/interactions.js");
    await mod.handleInteraction(payload);
  } catch (err: any) {
    console.error("[slack/interactions] Handler error (non-fatal, already acked):", err.message);
  }
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
