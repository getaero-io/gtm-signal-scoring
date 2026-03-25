import { OverviewCards } from './components/overview-cards';
import { SourceTable } from './components/source-table';
import { TierDistribution } from './components/tier-distribution';
import { LeadTable } from './components/lead-table';

export default async function SignalsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const [overviewRes, sourcesRes] = await Promise.all([
    fetch(`${baseUrl}/api/signals/overview`, { cache: 'no-store' }),
    fetch(`${baseUrl}/api/signals/sources`, { cache: 'no-store' }),
  ]);

  const overview = overviewRes.ok
    ? await overviewRes.json()
    : { totals: { total: '0', avg_score: '0', median_score: '0', qualified: '0', nurture: '0', tier1: '0', tier2: '0' }, tiers: [] };
  const sources = sourcesRes.ok
    ? await sourcesRes.json()
    : { sources: [] };

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
          <SourceTable sources={sources.sources} />
        </div>

        <LeadTable />
      </div>
    </div>
  );
}
