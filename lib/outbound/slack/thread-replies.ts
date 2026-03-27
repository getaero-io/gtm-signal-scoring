/**
 * Thread Reply Handler
 *
 * Captures user replies in Slack threads and saves them as the final_response
 * for the corresponding conversation. Works two ways:
 *
 * 1. After clicking "Edit" — conversation is in 'editing' status
 * 2. Direct reply in thread — conversation is still 'pending'
 *
 * In both cases, the user's thread reply becomes the final_response,
 * and the conversation moves to 'pending' (ready for Approve).
 */

import { query } from '@/lib/db';
import { writeQuery } from '@/lib/db-write';
import { postThreadReply, updateMessage } from './client';

interface ThreadReplyOpts {
  threadTs: string;
  channel: string;
  userId: string;
  text: string;
  messageTs: string;
}

export async function handleThreadReply(opts: ThreadReplyOpts): Promise<void> {
  const { threadTs, channel, userId, text, messageTs } = opts;

  // Find the conversation by slack_message_ts (the parent message ts)
  const conv = await query<{
    id: number;
    status: string;
    drafted_response: string;
    final_response: string | null;
    lead_id: string;
    slack_channel: string | null;
    original_message: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, status, drafted_response, final_response, lead_id, slack_channel, original_message, metadata
     FROM inbound.conversations
     WHERE slack_message_ts = $1
     LIMIT 1`,
    [threadTs]
  ).then(r => r[0] ?? null);

  if (!conv) {
    // Not a thread under one of our bot messages — ignore
    return;
  }

  // Only capture replies for pending or editing conversations
  if (conv.status !== 'pending' && conv.status !== 'editing') {
    console.log(`[thread-replies] Conversation ${conv.id} is ${conv.status}, ignoring thread reply`);
    return;
  }

  console.log(`[thread-replies] Capturing reply for conversation ${conv.id} from user ${userId}`);

  // Save the user's reply as final_response and set status back to pending
  await writeQuery(
    `UPDATE inbound.conversations
     SET final_response = $1, status = 'pending', approved_by = $2, updated_at = NOW()
     WHERE id = $3`,
    [text, userId, conv.id]
  );

  // Log to routing_log
  await writeQuery(
    `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
    [
      conv.lead_id,
      'outbound_reply_edited',
      JSON.stringify({
        conversation_id: conv.id,
        edited_by: userId,
        had_edit_button: conv.status === 'editing',
      }),
    ]
  );

  // Confirm in thread
  await postThreadReply({
    channel,
    threadTs,
    text: `Got it — saved your edited reply. Hit *Approve & Send* on the original message when ready.`,
  });

  // Update the parent message to show the new draft
  try {
    const leadName = (conv.metadata as any)?.lead_name || 'Lead';
    const companyName = (conv.metadata as any)?.company_name || '';
    const campaignName = (conv.metadata as any)?.campaign_name || '';
    const provider = (conv.metadata as any)?.source_platform || 'lemlist';
    const convId = conv.id;

    await updateMessage({
      channel,
      ts: threadTs,
      text: `Reply from ${leadName} — edited draft ready for approval`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*LinkedIn Reply from ${leadName}*${companyName ? `\nCompany: ${companyName}` : ''}${campaignName ? `\nCampaign: ${campaignName}` : ''}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Their reply:*\n${conv.original_message}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Edited response:* _(by <@${userId}>)_\n${text}`,
          },
        },
        {
          type: 'actions',
          block_id: `actions_${convId}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve & Send', emoji: true },
              style: 'primary',
              action_id: 'approve_response',
              value: String(convId),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reject', emoji: true },
              style: 'danger',
              action_id: 'reject_response',
              value: String(convId),
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Conversation ID: ${convId} | Provider: ${provider}`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.warn('[thread-replies] Failed to update parent message (non-fatal):', err);
  }
}
