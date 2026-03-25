interface Source {
  source: string;
  count: string;
  avg_score: string;
  tier1: string;
  tier2: string;
  tier3: string;
  tier4: string;
}

export function SourceTable({ sources }: { sources: Source[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold">By Source — Where the Best Leads Are</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
              <th className="text-left px-4 py-2">Source</th>
              <th className="text-right px-4 py-2">Count</th>
              <th className="text-right px-4 py-2">Avg Score</th>
              <th className="text-right px-4 py-2">Tier 1</th>
              <th className="text-right px-4 py-2">Tier 2</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-2 font-mono text-zinc-300">{s.source}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(s.count).toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{s.avg_score}</td>
                <td className="px-4 py-2 text-right font-mono text-emerald-400">{Number(s.tier1).toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono text-amber-400">{Number(s.tier2).toLocaleString()}</td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-600">No source data available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
