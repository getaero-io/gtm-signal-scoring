import { OverviewCards } from './components/overview-cards';
import { SourceTable } from './components/source-table';
import { TierDistribution } from './components/tier-distribution';
import { LeadTable } from './components/lead-table';
import { writeQuery } from '@/lib/db-write';
import { tenantFilter } from '@/lib/data/tenant-filter';

export const dynamic = 'force-dynamic';

async function getOverview() {
  try {
    const tf = tenantFilter(1);
    const [totals, tiers] = await Promise.all([
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
      FROM inbound.leads WHERE 1=1 ${tf.clause}`, tf.params),

      writeQuery<{ tier: string; count: string }>(`SELECT
        CASE
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 70 THEN 'Tier 1'
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 50 THEN 'Tier 2'
          WHEN COALESCE(qualification_score, atlas_score, 0) >= 30 THEN 'Tier 3'
          ELSE 'Tier 4'
        END as tier,
        COUNT(*) as count
      FROM inbound.leads WHERE 1=1 ${tf.clause} GROUP BY 1 ORDER BY 1`, tf.params),
    ]);
    return { totals: totals[0], tiers };
  } catch (error) {
    console.error('[signals/page] Overview error:', (error as Error).message);
    return { totals: { total: '0', avg_score: '0', median_score: '0', qualified: '0', nurture: '0', tier1: '0', tier2: '0' }, tiers: [] };
  }
}

async function getSources() {
  try {
    const tf = tenantFilter(1);
    const sources = await writeQuery<{
      source: string; count: string; avg_score: string;
      tier1: string; tier2: string; tier3: string; tier4: string;
    }>(`SELECT
      COALESCE(source, '(unnamed)') as source,
      COUNT(*) as count,
      ROUND(AVG(COALESCE(qualification_score, atlas_score, 0))) as avg_score,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) >= 70) as tier1,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) BETWEEN 50 AND 69) as tier2,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) BETWEEN 30 AND 49) as tier3,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) < 30) as tier4
    FROM inbound.leads
    WHERE 1=1 ${tf.clause}
    GROUP BY 1
    ORDER BY avg_score DESC`, tf.params);
    return sources;
  } catch (error) {
    console.error('[signals/page] Sources error:', (error as Error).message);
    return [];
  }
}

export default async function SignalsPage() {
  const [overview, sources] = await Promise.all([getOverview(), getSources()]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signals Dashboard</h1>
          <p className="text-zinc-400 mt-1">Lead scoring, qualification, and source performance</p>
        </div>

        <OverviewCards totals={overview.totals} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TierDistribution tiers={overview.tiers} />
          <SourceTable sources={sources} />
        </div>

        <LeadTable />
      </div>
    </div>
  );
}
