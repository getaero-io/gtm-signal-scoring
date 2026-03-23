/**
 * Outbound Reply Check — Trigger.dev Scheduled Task
 *
 * Polls SmartLead for new replies every 15 minutes during business hours
 * (Mon-Fri 8am-6pm). For each new reply:
 *   1. Upserts the lead in the leads table
 *   2. Matches the reply against response templates
 *   3. Drafts an AI response via LLM
 *   4. Stores the conversation and sends to Slack for human review
 */

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { query } from "../lib/db";
import { writeQuery } from "../lib/db-write";
import { generateResponse } from "../lib/outbound/llm";
import { loadConfig } from "../lib/outbound/config/loader";
import { postMessage } from "../lib/outbound/slack/client";
import { formatOutboundReply } from "../lib/outbound/slack/messages";
import { getLeadReplies } from "../lib/outbound/integrations/smartlead";
import type { ResponseTemplate } from "../lib/outbound/config/types";

async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCampaignIds(): string[] {
  const raw = process.env.LEMLIST_CAMPAIGN_IDS ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Match reply text against response templates using the trigger regex.
 * Falls back to the last template if none match.
 */
function matchTemplate(
  replyText: string,
  templates: ResponseTemplate[]
): ResponseTemplate {
  for (const tpl of templates) {
    try {
      if (new RegExp(tpl.trigger, "i").test(replyText)) {
        return tpl;
      }
    } catch {
      // Invalid regex — skip this template
    }
  }
  // Fallback to last template
  return templates[templates.length - 1];
}

/**
 * Build a context string from the lead data using the template's context_fields.
 */
function buildContext(
  lead: Record<string, unknown>,
  reply: Record<string, unknown>,
  contextFields: string[]
): string {
  const parts: string[] = [];
  for (const field of contextFields) {
    const value = lead[field] ?? reply[field];
    if (value != null && value !== "") {
      parts.push(`${field}: ${String(value)}`);
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Scheduled task
// ---------------------------------------------------------------------------

export const outboundReplyCheck = schedules.task({
  id: "outbound-reply-check",
  cron: "*/15 8-18 * * 1-5",
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async () => {
    const campaignIds = getCampaignIds();
    if (!campaignIds.length) {
      logger.warn("LEMLIST_CAMPAIGN_IDS is empty — nothing to poll");
      return { processed: 0, skipped: 0, errors: 0 };
    }

    const config = loadConfig();
    const templates = config.response_templates;
    if (!templates.length) {
      logger.error("No response templates configured — cannot draft replies");
      return { processed: 0, skipped: 0, errors: 0 };
    }

    const slackChannel =
      process.env.SLACK_CHANNEL_OUTBOUND || "#outbound-replies";

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const campaignId of campaignIds) {
      let replies: unknown[];
      try {
        replies = await getLeadReplies(campaignId);
      } catch (err) {
        logger.error(`Failed to fetch replies for campaign ${campaignId}`, {
          error: (err as Error).message,
        });
        errors++;
        continue;
      }

      logger.log(
        `Campaign ${campaignId}: ${replies.length} replied leads found`
      );

      for (const rawReply of replies) {
        const reply = rawReply as Record<string, unknown>;
        const smartleadLeadId = String(
          reply.id ?? reply.lead_id ?? reply.smartlead_lead_id ?? ""
        );
        const email = String(reply.email ?? "");
        const replyText = String(
          reply.reply ?? reply.message ?? reply.text ?? ""
        );
        const firstName = String(reply.first_name ?? reply.firstName ?? "");
        const lastName = String(reply.last_name ?? reply.lastName ?? "");
        const companyName = String(
          reply.company_name ?? reply.companyName ?? ""
        );

        if (!smartleadLeadId) {
          logger.warn("Reply missing lead ID — skipping", { reply });
          skipped++;
          continue;
        }

        try {
          // Check if already processed
          const existing = await queryOne(
            `SELECT id FROM conversations
             WHERE metadata->>'smartlead_lead_id' = $1
               AND metadata->>'campaign_id' = $2`,
            [smartleadLeadId, campaignId]
          );

          if (existing) {
            skipped++;
            continue;
          }

          // Upsert lead
          const leadRows = await writeQuery<{ id: number }>(
            `INSERT INTO inbound.leads (email, first_name, last_name, company_name, status, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'replied', $5, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET
               status = 'replied',
               updated_at = NOW()
             RETURNING id`,
            [
              email,
              firstName,
              lastName,
              companyName,
              JSON.stringify({
                smartlead_lead_id: smartleadLeadId,
                campaign_id: campaignId,
              }),
            ]
          );

          const leadId = leadRows[0]?.id;
          if (!leadId) {
            logger.error("Lead upsert returned no ID", { email });
            errors++;
            continue;
          }

          // Fetch full lead record for context building
          const lead =
            (await queryOne<Record<string, unknown>>(
              "SELECT * FROM leads WHERE id = $1",
              [leadId]
            )) ?? {};

          // Match reply against response templates
          const template = matchTemplate(replyText, templates);
          logger.log(`Matched template "${template.name}" for reply`, {
            smartleadLeadId,
          });

          // Build context from template's context_fields
          const context = buildContext(lead, reply, template.context_fields);

          // Generate AI response
          const userMessage = `Reply from lead:\n${replyText}\n\nContext:\n${context}`;
          const draftedResponse = await generateResponse({
            systemPrompt: template.system_prompt,
            userMessage,
            maxTokens: template.max_tokens,
            temperature: template.temperature,
          });

          // Store conversation with status='pending'
          const convRows = await writeQuery<{ id: number }>(
            `INSERT INTO inbound.conversations
               (lead_id, direction, channel, original_message, drafted_response, status, metadata, created_at, updated_at)
             VALUES ($1, 'inbound', 'linkedin', $2, $3, 'pending', $4, NOW(), NOW())
             RETURNING id`,
            [
              leadId,
              replyText,
              draftedResponse,
              JSON.stringify({
                smartlead_lead_id: smartleadLeadId,
                campaign_id: campaignId,
                template_name: template.name,
              }),
            ]
          );

          const conversationId = convRows[0]?.id ?? 0;

          // Send to Slack
          const leadName =
            [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
          const { text, blocks } = formatOutboundReply({
            leadName,
            companyName: companyName || "Unknown",
            campaignName: campaignId,
            originalReply: replyText,
            draftedResponse,
            smartleadUrl: `https://app.lemlist.com/campaigns/${campaignId}`,
            conversationId,
          });

          const slackResult = await postMessage({
            channel: slackChannel,
            text,
            blocks,
          });

          // Update conversation with Slack metadata
          await writeQuery(
            `UPDATE inbound.conversations
             SET slack_message_ts = $1, slack_channel = $2, updated_at = NOW()
             WHERE id = $3`,
            [slackResult.ts, slackResult.channel, conversationId]
          );

          processed++;
        } catch (err) {
          logger.error(
            `Error processing reply from lead ${smartleadLeadId} in campaign ${campaignId}`,
            { error: (err as Error).message, stack: (err as Error).stack }
          );
          errors++;
        }
      }
    }

    logger.log("Outbound reply check complete", {
      processed,
      skipped,
      errors,
      campaigns: campaignIds.length,
    });

    return { processed, skipped, errors };
  },
});
