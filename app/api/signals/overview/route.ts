import { NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET() {
  try {
    const [totals, tiers, recentLeads] = await Promise.all([
      writeQuery<{
        total: string; avg_score: string; median_score: string;
        qualified: string; nurture: string; tier1: string; tier2: string;
      }>(`SELECT
        COUNT(*) as total,
        ROUND(AVG(COALESCE(qualification_score, atlas_score, 0))) as avg_score,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(qualification_score, atlas_score, 0)) as median_score,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE status = 'nurture') as nurture,
        COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) >= 70) as tier1,
        COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) BETWEEN 50 AND 69) as tier2
      FROM inbound.leads`),

      writeQuery<{ tier: string; count: string }>(`SELECT
        CASE
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 70 THEN 'Tier 1'
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 50 THEN 'Tier 2'
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 30 THEN 'Tier 3'
          ELSE 'Tier 4'
        END as tier,
        COUNT(*) as count
      FROM inbound.leads GROUP BY 1 ORDER BY 1`),

      writeQuery<any>(`SELECT id, full_name, email,
        COALESCE(company_name, company) as company_name, source, status,
        COALESCE(qualification_score, atlas_score, 0) as qualification_score,
        atlas_score,
        COALESCE(created_at, submitted_at) as created_at
      FROM inbound.leads ORDER BY COALESCE(created_at, submitted_at) DESC LIMIT 10`),
    ]);

    return NextResponse.json({
      totals: totals[0],
      tiers,
      recent_leads: recentLeads,
    });
  } catch (error) {
    console.error('[signals/overview] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch overview', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
