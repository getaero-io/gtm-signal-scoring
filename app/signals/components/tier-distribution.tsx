interface Tier {
  tier: string;
  count: string;
}

const tierColors: Record<string, string> = {
  'Tier 1': 'bg-emerald-500',
  'Tier 2': 'bg-amber-500',
  'Tier 3': 'bg-zinc-500',
  'Tier 4': 'bg-red-500/60',
};

const tierDescriptions: Record<string, string> = {
  'Tier 1': 'High priority — strong ICP fit, reachable, timing signals',
  'Tier 2': 'Nurture — good fit, build relationship before outreach',
  'Tier 3': 'Low priority — partial fit or limited contact info',
  'Tier 4': 'Skip — poor fit, unreachable, or inactive',
};

export function TierDistribution({ tiers }: { tiers: Tier[] }) {
  const total = tiers.reduce((sum, t) => sum + Number(t.count), 0) || 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-4">Tier Distribution</h2>

      <div className="flex h-6 rounded overflow-hidden mb-4">
        {tiers.map((t) => (
          <div
            key={t.tier}
            className={`${tierColors[t.tier] || 'bg-zinc-600'}`}
            style={{ width: `${(Number(t.count) / total) * 100}%` }}
            title={`${t.tier}: ${t.count}`}
          />
        ))}
        {tiers.length === 0 && <div className="w-full bg-zinc-800" />}
      </div>

      <div className="space-y-2">
        {tiers.map((t) => (
          <div key={t.tier} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${tierColors[t.tier] || 'bg-zinc-600'}`} />
              <span className="text-zinc-300">{t.tier}</span>
              <span className="text-xs text-zinc-500">{tierDescriptions[t.tier]}</span>
            </div>
            <span className="font-mono text-zinc-400">
              {Number(t.count).toLocaleString()} ({((Number(t.count) / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
        {tiers.length === 0 && (
          <p className="text-sm text-zinc-600">No tier data available</p>
        )}
      </div>
    </div>
  );
}
