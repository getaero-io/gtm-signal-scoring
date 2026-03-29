import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleLemlistWebhook } from "../../src/lemlist/webhook-handler.js";
import { relayWebhook } from "../../src/webhooks/relay.js";
import { query } from "../../src/db/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  try {
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Capture webhook event in local store (non-blocking — don't let failures prevent processing)
    try {
      const eventType = payload?.type || 'unknown';
      await query(
        `INSERT INTO webhook_events (source, event_type, raw_payload, status, received_at)
         VALUES ($1, $2, $3::jsonb, 'received', NOW())`,
        ['lemlist', eventType, JSON.stringify(payload)]
      );
    } catch (captureErr) {
      console.error('[lemlist/webhook] Failed to capture webhook event:', captureErr);
    }

    const result = await handleLemlistWebhook(payload);

    const relayTargets = (process.env.WEBHOOK_RELAY_TARGETS || '').split(',').filter(Boolean);
    if (relayTargets.length > 0) {
      relayWebhook(payload, 'lemlist', relayTargets).catch(err =>
        console.error('[lemlist/webhook] Relay error:', err)
      );
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("[api/lemlist/webhook] Error:", err);
    return res.status(200).json({ ok: true, error: "processing error" });
  }
}
