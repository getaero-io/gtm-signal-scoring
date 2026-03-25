interface Props {
  totals: {
    total: string;
    avg_score: string;
    median_score: string;
    qualified: string;
    nurture: string;
    tier1: string;
    tier2: string;
  };
}

export function OverviewCards({ totals }: Props) {
  const total = Number(totals.total) || 1;

  const cards = [
    { label: 'Total Leads', value: Number(totals.total).toLocaleString(), sub: null },
    { label: 'Avg Score', value: totals.avg_score, sub: `Median: ${totals.median_score}` },
    {
      label: 'Tier 1 (70+)',
      value: Number(totals.tier1).toLocaleString(),
      sub: `${((Number(totals.tier1) / total) * 100).toFixed(1)}% of total`,
    },
    {
      label: 'Tier 2 (50-69)',
      value: Number(totals.tier2).toLocaleString(),
      sub: `${((Number(totals.tier2) / total) * 100).toFixed(1)}% of total`,
    },
    { label: 'Qualified', value: Number(totals.qualified).toLocaleString(), sub: null },
    { label: 'Nurture', value: Number(totals.nurture).toLocaleString(), sub: null },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{card.label}</p>
          <p className="text-2xl font-semibold mt-1 font-mono">{card.value}</p>
          {card.sub && <p className="text-xs text-zinc-500 mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}
