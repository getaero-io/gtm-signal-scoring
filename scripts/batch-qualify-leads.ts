import { pool } from "../src/db/client.js";
import { qualifyLead } from "../lib/outbound/engine/qualifier.js";
import { routeLead } from "../lib/outbound/engine/router.js";

async function main() {
  const batchSize = parseInt(process.argv[2] || "50", 10);
  const dryRun = process.argv.includes("--dry-run");

  const { rows: leads } = await pool.query(
    `SELECT id FROM inbound.leads WHERE status = 'new' ORDER BY created_at ASC LIMIT $1`,
    [batchSize]
  );

  console.log(`[batch-qualify] Found ${leads.length} leads (batch=${batchSize}, dryRun=${dryRun})`);

  let qualified = 0, nurtured = 0, errors = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would qualify lead ${lead.id}`);
        continue;
      }

      const result = await qualifyLead(lead.id);
      result.qualified ? qualified++ : nurtured++;

      await routeLead(lead.id).catch((e: Error) =>
        console.warn(`[batch-qualify] Routing failed for ${lead.id}: ${e.message}`)
      );

      if ((i + 1) % 10 === 0) {
        console.log(`[batch-qualify] ${i + 1}/${leads.length} (Q:${qualified} N:${nurtured} E:${errors})`);
      }
    } catch (err) {
      errors++;
      console.error(`[batch-qualify] Error on ${lead.id}: ${(err as Error).message}`);
    }
  }

  console.log(`[batch-qualify] Done: ${leads.length} processed (Q:${qualified} N:${nurtured} E:${errors})`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
