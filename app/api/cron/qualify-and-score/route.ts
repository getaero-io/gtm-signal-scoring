import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { writeQuery } from "@/lib/db-write";
import { qualifyLead } from "@/lib/outbound/engine/qualifier";
import { routeLead } from "@/lib/outbound/engine/router";
import { computeAccountScore } from "@/lib/outbound/engine/account-scorer";
import { computeEngagementSignals } from "@/lib/outbound/engine/engagement";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = { qualified: 0, nurtured: 0, errors: 0, accounts_scored: 0 };

  // Phase 1: Qualify new leads
  const newLeads = await query<{ id: string }>(
    `SELECT id FROM inbound.leads WHERE status = 'new' ORDER BY created_at ASC LIMIT 50`
  );

  for (const lead of newLeads) {
    try {
      const result = await qualifyLead(lead.id);
      result.qualified ? results.qualified++ : results.nurtured++;
      await routeLead(lead.id).catch(() => {});
    } catch {
      results.errors++;
    }
  }

  // Phase 2: Recompute account scores for recently-updated domains
  const recentDomains = await query<{ company_domain: string }>(
    `SELECT DISTINCT company_domain FROM inbound.leads
     WHERE company_domain IS NOT NULL AND updated_at > NOW() - INTERVAL '2 hours'`
  );

  for (const { company_domain } of recentDomains) {
    try {
      const leads = await query<{
        id: string; qualification_score: number | null; status: string;
        company_name: string; metadata: any;
      }>(
        `SELECT id, qualification_score, status, company_name, metadata
         FROM inbound.leads WHERE company_domain = $1`,
        [company_domain]
      );

      const contacts = [];
      for (const lead of leads) {
        let eng = { total_touchpoints: 0, velocity_score: 0, positive_intent: false,
                    meeting_requested: false, has_active_conversation: false, channel_count: 0 };
        try {
          const e = await computeEngagementSignals(lead.id);
          eng = { total_touchpoints: e.total_touchpoints, velocity_score: e.velocity_score,
                  positive_intent: e.positive_intent, meeting_requested: e.meeting_requested,
                  has_active_conversation: e.has_active_conversation, channel_count: e.channel_count };
        } catch {}
        contacts.push({ icp_score: lead.qualification_score || 0, qualified: lead.status === "qualified", engagement: eng });
      }

      const meta = leads[0]?.metadata || {};
      const score = computeAccountScore(contacts, {
        is_cpg: meta.is_cpg === true,
        retailer_count: typeof meta.retailer_count === "number" ? meta.retailer_count : 0,
        employee_count: typeof meta.employee_count === "number" ? meta.employee_count : 0,
      });

      const keyContacts = leads
        .filter(l => l.qualification_score && l.qualification_score > 0)
        .sort((a, b) => (b.qualification_score || 0) - (a.qualification_score || 0))
        .slice(0, 5)
        .map(l => ({ lead_id: l.id, name: '', icp_score: l.qualification_score || 0 }));

      await writeQuery(
        `INSERT INTO inbound.account_scores (domain, company_name, account_score, account_tier,
          best_contact_score, avg_contact_score, contact_count, qualified_contact_count,
          total_engagement_touchpoints, has_active_conversation, best_velocity_score,
          any_positive_intent, any_meeting_requested, key_contacts, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (domain) DO UPDATE SET
           account_score=EXCLUDED.account_score, account_tier=EXCLUDED.account_tier,
           best_contact_score=EXCLUDED.best_contact_score, avg_contact_score=EXCLUDED.avg_contact_score,
           contact_count=EXCLUDED.contact_count, qualified_contact_count=EXCLUDED.qualified_contact_count,
           total_engagement_touchpoints=EXCLUDED.total_engagement_touchpoints,
           has_active_conversation=EXCLUDED.has_active_conversation,
           best_velocity_score=EXCLUDED.best_velocity_score,
           any_positive_intent=EXCLUDED.any_positive_intent,
           any_meeting_requested=EXCLUDED.any_meeting_requested,
           key_contacts=EXCLUDED.key_contacts, updated_at=NOW()`,
        [company_domain, leads[0]?.company_name || company_domain,
         score.account_score, score.account_tier,
         score.best_contact_score, score.avg_contact_score,
         score.contact_count, score.qualified_contact_count,
         score.total_engagement_touchpoints, score.has_active_conversation,
         score.best_velocity_score, score.any_positive_intent, score.any_meeting_requested,
         JSON.stringify(keyContacts)]
      );
      results.accounts_scored++;
    } catch {}
  }

  return NextResponse.json({ ok: true, ...results });
}
