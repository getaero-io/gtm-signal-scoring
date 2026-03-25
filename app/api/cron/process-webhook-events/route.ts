/**
 * Cron: process new webhook events from deepline identity store.
 *
 * Polls dl_cache.enrichment_event for new events written by
 * deepline cloud jobs (SmartLead/HeyReach webhooks), then
 * runs reply events through the auto-reply pipeline.
 *
 * Schedule: every 2 minutes via vercel.json crons
 */
import { NextRequest, NextResponse } from "next/server";
import { processWebhookEvents } from "@/lib/outbound/webhooks/consumer";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processWebhookEvents();
    console.log("[cron/process-webhook-events]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/process-webhook-events] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
