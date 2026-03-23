/**
 * Inbound Qualification — Trigger.dev Scheduled Task
 *
 * Runs every hour. Picks up leads with status='new', qualifies them
 * against the configured ICP definitions, then routes qualified leads
 * to reps and nurture leads to campaigns.
 */

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { query } from "../lib/db";
import { qualifyLead } from "../lib/outbound/engine/qualifier";
import { routeLead } from "../lib/outbound/engine/router";

// ---------------------------------------------------------------------------
// Scheduled task
// ---------------------------------------------------------------------------

export const inboundQualification = schedules.task({
  id: "inbound-qualification",
  cron: "0 * * * *",
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async () => {
    // Fetch unqualified leads, oldest first, capped at 50 per run
    const leads = await query<{ id: number }>(
      `SELECT id FROM leads WHERE status = 'new' ORDER BY created_at ASC LIMIT 50`
    );

    if (!leads.length) {
      logger.log("No new leads to qualify");
      return { total: 0, qualified: 0, nurtured: 0, errors: 0 };
    }

    logger.log(`Found ${leads.length} new leads to qualify`);

    let qualified = 0;
    let nurtured = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        // Qualify
        const result = await qualifyLead(lead.id);

        if (result.qualified) {
          qualified++;
        } else {
          nurtured++;
        }

        logger.log(`Lead ${lead.id}: ${result.qualified ? "qualified" : "nurture"} (score=${result.score})`, {
          leadId: lead.id,
          qualified: result.qualified,
          score: result.score,
          reason: result.reason,
        });

        // Route based on qualification outcome
        await routeLead(lead.id);
      } catch (err) {
        logger.error(`Error processing lead ${lead.id}`, {
          leadId: lead.id,
          error: (err as Error).message,
          stack: (err as Error).stack,
        });
        errors++;
      }
    }

    logger.log("Inbound qualification run complete", {
      total: leads.length,
      qualified,
      nurtured,
      errors,
    });

    return { total: leads.length, qualified, nurtured, errors };
  },
});
