/**
 * Slack Interactivity Handler
 *
 * Handles button clicks from Block Kit messages:
 *   - approve_response: Queue reply via QStash → Deepline (any provider)
 *   - reject_response:  Mark conversation as rejected, update Slack message
 *   - edit_response:    Opens thread for manual edit — user replies in thread
 *
 * Slack sends a POST to /slack/interactions with a URL-encoded `payload` param.
 * We must respond within 3 seconds, so heavy work is done after ack.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { updateMessage, postThreadReply } from "./client";
import { upsertAttioPerson } from "../integrations/attio";
import { upsertHubSpotContact } from "../integrations/hubspot";
import { resolveProvider, normalizeChannel } from "../integrations/deepline-outbound";
import { queueMessage, cancelMessage } from "../safety/message-queue";
import { enforceRateLimit, RateLimitError } from "../safety/rate-limiter";
import crypto from "crypto";

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackAction {
  action_id: string;
  value: string;
  block_id: string;
}

interface SlackInteractionPayload {
  type: string;
  user: { id: string; username: string; name: string };
  actions: SlackAction[];
  channel: { id: string; name: string };
  message: { ts: string; blocks: unknown[] };
  response_url: string;
  token: string;
}

interface Conversation {
  id: number;
  lead_id: number;
  channel: string;
  original_message: string;
  drafted_response: string;
  final_response: string | null;
  status: string;
  slack_message_ts: string | null;
  slack_channel: string | null;
  metadata: Record<string, unknown>;
}

interface Lead {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_domain: string | null;
  title: string | null;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8")
  );
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleApprove(
  conversationId: number,
  userId: string,
  userName: string,
  channel: string,
  messageTs: string
): Promise<void> {
  const conv = await queryOne<Conversation>(
    `SELECT id, lead_id, channel, original_message, drafted_response, final_response, status, slack_message_ts, slack_channel, metadata
     FROM inbound.conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conv) {
    console.error(`[interactions] Conversation ${conversationId} not found`);
    return;
  }

  if (conv.status !== "pending") {
    await postThreadReply({
      channel,
      threadTs: messageTs,
      text: `This response has already been ${conv.status}.`,
    });
    return;
  }

  // Rate limit check
  try {
    await enforceRateLimit('outbound_reply', userName);
  } catch (err) {
    if (err instanceof RateLimitError) {
      await postThreadReply({
        channel,
        threadTs: messageTs,
        text: `Rate limit reached. Too many approvals recently — please wait ${err.retryAfterSec} seconds before approving more.`,
      });
      return;
    }
    throw err;
  }

  const responseText = conv.final_response || conv.drafted_response;
  const metadata = conv.metadata ?? {};
  const campaignId = String(metadata.campaign_id ?? "");
  const leadId = String(
    metadata.lemlist_lead_id ??
    metadata.smartlead_lead_id ??
    metadata.instantly_lead_id ??
    metadata.heyreach_lead_id ??
    ""
  );

  // Resolve provider and channel from conversation metadata
  const provider = resolveProvider(metadata);
  const replyChannel = normalizeChannel(conv.channel);

  // 1. Queue reply with undo-send delay via QStash
  let queueId: number | null = null;
  if (leadId && campaignId) {
    try {
      const queued = await queueMessage({
        conversationId,
        leadId,
        channel: replyChannel,
        provider,
        messageText: responseText,
        metadata: {
          ...metadata,
          approved_by: userName,
          reply_channel: conv.channel,
        },
      });
      queueId = queued.queueId;
    } catch (err) {
      console.error("[interactions] Queue failed:", err);
      await postThreadReply({
        channel,
        threadTs: messageTs,
        text: `Failed to queue reply: ${(err as Error).message}. Please try again.`,
      });
      return;
    }
  }

  // 2. Update Attio (non-blocking — don't fail the approval if Attio is down)
  const lead = await queryOne<Lead>(
    `SELECT id, email, first_name, last_name, company_domain, title FROM inbound.leads WHERE id = $1`,
    [conv.lead_id]
  );

  if (lead?.email) {
    upsertAttioPerson({
      email: lead.email,
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
      companyDomain: lead.company_domain || undefined,
      jobTitle: lead.title || undefined,
      customAttributes: {
        last_outbound_reply: [{ value: new Date().toISOString() }],
      },
    }).catch((err) =>
      console.error("[interactions] Attio upsert failed (non-fatal):", err)
    );

    // Sync to HubSpot (non-blocking)
    upsertHubSpotContact({
      email: lead.email,
      firstName: lead.first_name || undefined,
      lastName: lead.last_name || undefined,
      jobTitle: lead.title || undefined,
      leadStatus: 'IN_PROGRESS',
      source: 'gtm-signal-scoring',
    }).catch((err) =>
      console.error("[interactions] HubSpot upsert failed (non-fatal):", err)
    );
  }

  // 3. Mark conversation as approved (queued for send)
  await writeQuery(
    `UPDATE inbound.conversations
     SET status = 'approved_queued', final_response = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3`,
    [responseText, userName, conversationId]
  );

  // 4. Update Slack message to show approved state with undo option
  const undoBlocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approved* by <@${userId}> — sending in ~60 seconds\n\n*Response:*\n${responseText}`,
      },
    },
    {
      type: "actions",
      block_id: `undo_${conversationId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Undo Send", emoji: true },
          style: "danger",
          action_id: "undo_send",
          value: JSON.stringify({ queueId, conversationId }),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Queued at ${new Date().toISOString()} | Conversation #${conversationId}`,
        },
      ],
    },
  ];

  await updateMessage({
    channel,
    ts: messageTs,
    text: `Approved by ${userName} — sending in ~60 seconds (click Undo to cancel)`,
    blocks: undoBlocks,
  });

  // 5. Log routing action
  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      conv.lead_id,
      "outbound_reply_approved",
      JSON.stringify({
        conversation_id: conversationId,
        approved_by: userName,
        campaign_id: campaignId,
        provider,
        channel: replyChannel,
      }),
    ]
  );
}

async function handleReject(
  conversationId: number,
  userId: string,
  userName: string,
  channel: string,
  messageTs: string
): Promise<void> {
  const conv = await queryOne<Conversation>(
    `SELECT id, status, original_message, drafted_response, lead_id FROM inbound.conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conv) return;

  if (conv.status !== "pending") {
    await postThreadReply({
      channel,
      threadTs: messageTs,
      text: `This response has already been ${conv.status}.`,
    });
    return;
  }

  await writeQuery(
    `UPDATE inbound.conversations SET status = 'rejected', approved_by = $1, updated_at = NOW() WHERE id = $2`,
    [userName, conversationId]
  );

  await updateMessage({
    channel,
    ts: messageTs,
    text: `Rejected by ${userName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Rejected* by <@${userId}>\n\n~${conv.drafted_response}~`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Rejected at ${new Date().toISOString()} | Conversation #${conversationId}`,
          },
        ],
      },
    ],
  });

  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      conv.lead_id,
      "outbound_reply_rejected",
      JSON.stringify({ conversation_id: conversationId, rejected_by: userName }),
    ]
  );
}

async function handleEdit(
  conversationId: number,
  userId: string,
  userName: string,
  channel: string,
  messageTs: string
): Promise<void> {
  const conv = await queryOne<Conversation>(
    `SELECT id, status, drafted_response, lead_id FROM inbound.conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conv || conv.status !== "pending") return;

  // Mark conversation as editing
  await writeQuery(
    `UPDATE inbound.conversations SET status = 'editing', approved_by = $1, updated_at = NOW() WHERE id = $2`,
    [userName, conversationId]
  );

  // Log to routing_log
  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      conv.lead_id,
      "outbound_reply_editing",
      JSON.stringify({ conversation_id: conversationId, edited_by: userName }),
    ]
  );

  // Post a thread reply prompting the user to edit
  await postThreadReply({
    channel,
    threadTs: messageTs,
    text: `<@${userId}> — reply in this thread with your edited response. I'll use your reply as the final message.\n\n*Current draft:*\n${conv.drafted_response}`,
  });
}

async function handleUndoSend(
  queueId: number,
  conversationId: number,
  userId: string,
  userName: string,
  channel: string,
  messageTs: string
): Promise<void> {
  const cancelled = await cancelMessage(queueId, userName);

  if (cancelled) {
    // Revert conversation status back to pending
    await writeQuery(
      `UPDATE inbound.conversations SET status = 'pending', approved_by = NULL, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    await updateMessage({
      channel,
      ts: messageTs,
      text: `Send cancelled by ${userName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Send cancelled* by <@${userId}> — message was NOT sent.\nConversation returned to pending status.`,
          },
        },
        {
          type: "actions",
          block_id: `outbound_${conversationId}`,
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve & Send", emoji: true },
              style: "primary",
              action_id: "approve_response",
              value: String(conversationId),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Reject", emoji: true },
              style: "danger",
              action_id: "reject_response",
              value: String(conversationId),
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Cancelled at ${new Date().toISOString()} | Conversation #${conversationId}`,
            },
          ],
        },
      ],
    });

    await writeQuery(
      `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES (
        (SELECT lead_id FROM inbound.conversations WHERE id = $1),
        $2, $3, NOW())`,
      [
        conversationId,
        "outbound_reply_cancelled",
        JSON.stringify({ conversation_id: conversationId, cancelled_by: userName, queue_id: queueId }),
      ]
    );
  } else {
    await postThreadReply({
      channel,
      threadTs: messageTs,
      text: `Could not cancel — the message may have already been sent or was previously cancelled.`,
    });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Process a Slack interaction payload. Call this from your HTTP handler
 * AFTER verifying the request signature and parsing the payload.
 */
export async function handleInteraction(
  payload: SlackInteractionPayload
): Promise<void> {
  if (payload.type !== "block_actions") return;

  for (const action of payload.actions) {
    const userId = payload.user.id;
    const userName = payload.user.username || payload.user.name;
    const channel = payload.channel.id;
    const messageTs = payload.message.ts;

    switch (action.action_id) {
      case "undo_send": {
        let parsed: { queueId: number; conversationId: number };
        try {
          parsed = JSON.parse(action.value);
        } catch {
          console.warn("[interactions] Invalid undo_send value:", action.value);
          continue;
        }
        await handleUndoSend(parsed.queueId, parsed.conversationId, userId, userName, channel, messageTs);
        break;
      }

      case "approve_response":
      case "reject_response":
      case "edit_response": {
        const conversationId = parseInt(action.value, 10);
        if (isNaN(conversationId)) {
          console.warn("[interactions] Non-numeric action value:", action.value);
          continue;
        }

        if (action.action_id === "approve_response") {
          await handleApprove(conversationId, userId, userName, channel, messageTs);
        } else if (action.action_id === "reject_response") {
          await handleReject(conversationId, userId, userName, channel, messageTs);
        } else {
          await handleEdit(conversationId, userId, userName, channel, messageTs);
        }
        break;
      }

      default:
        console.warn("[interactions] Unknown action_id:", action.action_id);
    }
  }
}
