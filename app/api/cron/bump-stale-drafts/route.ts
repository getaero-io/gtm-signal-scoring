/**
 * Cron: bump stale pending drafts every 12 hours.
 *
 * Finds conversations stuck in "pending" for 12+ hours,
 * posts a reminder to the Slack thread, and adds approve/skip buttons.
 * If a draft has already been bumped 3+ times, auto-skips it.
 */
import { NextRequest, NextResponse } from "next/server";
import { writeQuery } from "@/lib/db-write";
import { query } from "@/lib/db";
import { postThreadReply, updateMessage } from "@/lib/outbound/slack/client";

interface StaleDraft {
  id: number;
  lead_id: string;
  drafted_response: string;
  slack_message_ts: string;
  slack_channel: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const stale = await query<StaleDraft>(
      `SELECT id, lead_id, drafted_response, slack_message_ts, slack_channel, metadata, created_at
       FROM inbound.conversations
       WHERE status = 'pending'
         AND slack_message_ts IS NOT NULL
         AND slack_channel IS NOT NULL
         AND created_at < NOW() - INTERVAL '12 hours'
       ORDER BY created_at ASC`
    );

    let bumped = 0;
    let autoSkipped = 0;

    for (const conv of stale) {
      const bumpCount = Number(conv.metadata?.bump_count ?? 0);
      const hoursOld = Math.round(
        (Date.now() - new Date(conv.created_at).getTime()) / (1000 * 60 * 60)
      );

      if (bumpCount >= 3) {
        await writeQuery(
          `UPDATE inbound.conversations
           SET status = 'skipped', updated_at = NOW(),
               metadata = metadata || '{"auto_skipped": true}'::jsonb
           WHERE id = $1`,
          [conv.id]
        );

        await updateMessage({
          channel: conv.slack_channel,
          ts: conv.slack_message_ts,
          text: `Auto-skipped after ${hoursOld}h with no action`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Auto-skipped* — no action after ${hoursOld} hours. No message was sent.\n\n~${conv.drafted_response.slice(0, 200)}${conv.drafted_response.length > 200 ? "..." : ""}~`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Skipped at ${new Date().toISOString()} | Conversation #${conv.id}`,
                },
              ],
            },
          ],
        });

        await writeQuery(
          `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
          [
            conv.lead_id,
            "draft_auto_skipped",
            JSON.stringify({ conversation_id: conv.id, hours_old: hoursOld, bump_count: bumpCount }),
          ]
        );

        autoSkipped++;
        continue;
      }

      await postThreadReply({
        channel: conv.slack_channel,
        threadTs: conv.slack_message_ts,
        text: [
          `This draft has been waiting ${hoursOld} hours. Approve it, skip it, or it'll auto-skip after 36h.`,
          "",
          `_Bump ${bumpCount + 1}/3 — next bump in 12h_`,
        ].join("\n"),
      });

      await writeQuery(
        `UPDATE inbound.conversations
         SET metadata = metadata || $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ bump_count: bumpCount + 1, last_bumped: new Date().toISOString() }), conv.id]
      );

      bumped++;
    }

    return NextResponse.json({
      ok: true,
      total_stale: stale.length,
      bumped,
      auto_skipped: autoSkipped,
    });
  } catch (err) {
    console.error("[cron/bump-stale-drafts] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
