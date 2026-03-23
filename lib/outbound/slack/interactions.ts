/**
 * Slack Interactivity Handler
 *
 * Handles button clicks from Block Kit messages:
 *   - approve_response: Send the drafted reply via SmartLead/Lemlist, update conversation + Slack message
 *   - reject_response:  Mark conversation as rejected, update Slack message
 *   - edit_response:    (placeholder) Opens thread for manual edit — user replies in thread
 *
 * Slack sends a POST to /slack/interactions with a URL-encoded `payload` param.
 * We must respond within 3 seconds, so heavy work is done after ack.
 */

import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { updateMessage, postThreadReply } from "./client";
import { sendSmartLeadReply } from "../integrations/smartlead";
import { upsertAttioPerson } from "../integrations/attio";
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
    `SELECT id, lead_id, original_message, drafted_response, final_response, status, slack_message_ts, slack_channel, metadata
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

  const responseText = conv.final_response || conv.drafted_response;
  const metadata = conv.metadata ?? {};
  const lemlistLeadId = String(metadata.lemlist_lead_id ?? "");
  const smartleadLeadId = String(metadata.smartlead_lead_id ?? "");
  const campaignId = String(metadata.campaign_id ?? "");

  // 1. Send reply via SmartLead or Lemlist
  if ((lemlistLeadId || smartleadLeadId) && campaignId) {
    try {
      await sendSmartLeadReply({
        leadId: lemlistLeadId || smartleadLeadId,
        message: responseText,
        campaignId,
      });
    } catch (err) {
      console.error("[interactions] Reply send failed:", err);
      await postThreadReply({
        channel,
        threadTs: messageTs,
        text: `Failed to send reply: ${(err as Error).message}. Please send manually.`,
      });
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
  }

  // 3. Mark conversation as approved
  await writeQuery(
    `UPDATE inbound.conversations
     SET status = 'approved', final_response = $1, approved_by = $2, sent_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [responseText, userName, conversationId]
  );

  // 4. Update Slack message to show approved state
  await updateMessage({
    channel,
    ts: messageTs,
    text: `Approved by ${userName} and sent`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Approved and sent* by <@${userId}>\n\n*Response:*\n${responseText}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Sent at ${new Date().toISOString()} | Conversation #${conversationId}`,
          },
        ],
      },
    ],
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
  channel: string,
  messageTs: string
): Promise<void> {
  const conv = await queryOne<Conversation>(
    `SELECT id, status, drafted_response FROM inbound.conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conv || conv.status !== "pending") return;

  // Post a thread reply prompting the user to edit
  await postThreadReply({
    channel,
    threadTs: messageTs,
    text: `<@${userId}> — reply in this thread with your edited response. I'll use your reply as the final message.\n\n*Current draft:*\n${conv.drafted_response}`,
  });
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
    const conversationId = parseInt(action.value, 10);
    if (isNaN(conversationId)) {
      console.warn("[interactions] Non-numeric action value:", action.value);
      continue;
    }

    const userId = payload.user.id;
    const userName = payload.user.username || payload.user.name;
    const channel = payload.channel.id;
    const messageTs = payload.message.ts;

    switch (action.action_id) {
      case "approve_response":
        await handleApprove(conversationId, userId, userName, channel, messageTs);
        break;

      case "reject_response":
        await handleReject(conversationId, userId, userName, channel, messageTs);
        break;

      case "edit_response":
        await handleEdit(conversationId, userId, channel, messageTs);
        break;

      default:
        console.warn("[interactions] Unknown action_id:", action.action_id);
    }
  }
}
