import { pool } from "../src/db/client.js";
import { computeAccountScore } from "../lib/outbound/engine/account-scorer.js";
import { computeEngagementSignals } from "../lib/outbound/engine/engagement.js";

interface LeadRow {
  id: string;
  email: string;
  full_name: string;
  company_domain: string;
  company_name: string;
  title: string;
  qualification_score: number | null;
  status: string;
  metadata: Record<string, unknown>;
}

async function main() {
  const { rows: leads } = await pool.query<LeadRow>(
    `SELECT id, email, full_name, company_domain, company_name, title,
            qualification_score, status, metadata
     FROM inbound.leads
     WHERE company_domain IS NOT NULL AND company_domain != ''
     ORDER BY company_domain`
  );

  console.log(`[account-scores] ${leads.length} leads with domains`);

  // Group by domain
  const byDomain = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const d = lead.company_domain.toLowerCase();
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(lead);
  }

  console.log(`[account-scores] ${byDomain.size} unique domains`);

  let processed = 0;
  for (const [domain, domainLeads] of byDomain) {
    const contacts = [];
    for (const lead of domainLeads) {
      let engagement = {
        total_touchpoints: 0, velocity_score: 0, positive_intent: false,
        meeting_requested: false, has_active_conversation: false, channel_count: 0,
      };
      try {
        const eng = await computeEngagementSignals(lead.id);
        engagement = {
          total_touchpoints: eng.total_touchpoints, velocity_score: eng.velocity_score,
          positive_intent: eng.positive_intent, meeting_requested: eng.meeting_requested,
          has_active_conversation: eng.has_active_conversation, channel_count: eng.channel_count,
        };
      } catch {}

      contacts.push({
        icp_score: lead.qualification_score || 0,
        qualified: lead.status === "qualified",
        engagement,
      });
    }

    const firstLead = domainLeads[0];
    const meta = firstLead.metadata || {};
    const result = computeAccountScore(contacts, {
      is_cpg: meta.is_cpg === true || meta.is_cpg === "true",
      retailer_count: typeof meta.retailer_count === "number" ? meta.retailer_count : 0,
      employee_count: typeof meta.employee_count === "number" ? meta.employee_count : 0,
    });

    const keyContacts = domainLeads
      .filter((l) => l.qualification_score && l.qualification_score > 0)
      .sort((a, b) => (b.qualification_score || 0) - (a.qualification_score || 0))
      .slice(0, 5)
      .map((l) => ({
        lead_id: l.id, name: l.full_name, title: l.title,
        icp_score: l.qualification_score || 0, is_qualified: l.status === "qualified",
      }));

    await pool.query(
      `INSERT INTO inbound.account_scores (
        domain, company_name, account_score, account_tier,
        best_contact_score, avg_contact_score, contact_count, qualified_contact_count,
        is_cpg, retailer_count, employee_count,
        total_engagement_touchpoints, has_active_conversation, best_velocity_score,
        any_positive_intent, any_meeting_requested, key_contacts, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      ON CONFLICT (domain) DO UPDATE SET
        company_name = COALESCE(EXCLUDED.company_name, inbound.account_scores.company_name),
        account_score = EXCLUDED.account_score, account_tier = EXCLUDED.account_tier,
        best_contact_score = EXCLUDED.best_contact_score, avg_contact_score = EXCLUDED.avg_contact_score,
        contact_count = EXCLUDED.contact_count, qualified_contact_count = EXCLUDED.qualified_contact_count,
        total_engagement_touchpoints = EXCLUDED.total_engagement_touchpoints,
        has_active_conversation = EXCLUDED.has_active_conversation,
        best_velocity_score = EXCLUDED.best_velocity_score,
        any_positive_intent = EXCLUDED.any_positive_intent,
        any_meeting_requested = EXCLUDED.any_meeting_requested,
        key_contacts = EXCLUDED.key_contacts, updated_at = NOW()`,
      [
        domain, firstLead.company_name || domain,
        result.account_score, result.account_tier,
        result.best_contact_score, result.avg_contact_score,
        result.contact_count, result.qualified_contact_count,
        meta.is_cpg === true || meta.is_cpg === "true",
        typeof meta.retailer_count === "number" ? meta.retailer_count : 0,
        typeof meta.employee_count === "number" ? meta.employee_count : 0,
        result.total_engagement_touchpoints, result.has_active_conversation,
        result.best_velocity_score, result.any_positive_intent, result.any_meeting_requested,
        JSON.stringify(keyContacts),
      ]
    );

    processed++;
    if (processed % 100 === 0) {
      console.log(`[account-scores] ${processed}/${byDomain.size} domains scored`);
    }
  }

  console.log(`[account-scores] Done. ${processed} account scores computed.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
