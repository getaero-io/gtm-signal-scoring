interface Breakdown {
  [category: string]: { score: number; weight: number; rules_matched: string[] };
}

interface Props {
  breakdown: Breakdown;
  flags: string[];
  total: number;
  passed: boolean;
}

const categoryLabels: Record<string, { label: string; description: string }> = {
  emergence_youth: { label: 'Account Fit', description: 'Domain age, expo signals, company size' },
  first_po_readiness: { label: 'First PO Readiness', description: 'Retailer count, ecommerce, CPG brand' },
  reachability: { label: 'Reachability', description: 'Email validation, founder detection, LinkedIn' },
  retailer_fit: { label: 'Retailer Fit', description: 'Target retailer presence (Costco, Walmart, etc.)' },
  company_fit: { label: 'Company Fit', description: 'Industry, TLD, decision-maker title' },
  intent_signals: { label: 'Intent Signals', description: 'Reply status, lead source' },
  engagement: { label: 'Engagement', description: 'Qualification score threshold' },
};

export function ScoreBreakdown({ breakdown, flags, total, passed }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Score Breakdown</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-mono font-bold">{total}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
            passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
          }`}>{passed ? 'QUALIFIED' : 'NURTURE'}</span>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(breakdown || {}).map(([key, cat]) => {
          const meta = categoryLabels[key] || { label: key, description: '' };
          const pct = cat.weight > 0 ? (cat.score / cat.weight) * 100 : 0;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">{meta.label}</span>
                <span className="font-mono text-zinc-400">{cat.score}/{cat.weight}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full rounded ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-zinc-600'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              {cat.rules_matched && cat.rules_matched.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {cat.rules_matched.map((rule, i) => (
                    <span key={i} className="text-[10px] bg-zinc-800 text-zinc-500 px-1 py-0.5 rounded font-mono">{rule}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-zinc-600 mt-0.5">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {flags && flags.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <p className="text-xs text-red-400 font-semibold mb-1">Anti-Fit Flags</p>
          <div className="flex flex-wrap gap-1">
            {flags.map((flag, i) => (
              <span key={i} className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono">{flag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
