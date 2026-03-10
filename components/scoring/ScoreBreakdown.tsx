import { ScoreBreakdown as ScoreBreakdownType } from '@/types/scoring';

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdownType;
}

const BREAKDOWN_LABELS: Record<keyof Omit<ScoreBreakdownType, 'total'>, string> = {
  tech_adoption: 'Tech Adoption',
  seniority: 'Contact Seniority',
  engagement: 'P0 Engagement',
  enrichment: 'Company Size',
};

export function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const components = (Object.keys(BREAKDOWN_LABELS) as Array<keyof typeof BREAKDOWN_LABELS>).map(
    key => ({
      key,
      label: BREAKDOWN_LABELS[key],
      value: breakdown[key],
    })
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500">Base Score</span>
        <span className="text-sm font-bold text-gray-700">20</span>
      </div>
      {components.map(({ key, label, value }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">{label}</span>
            <span className="text-sm font-semibold text-gray-800">+{value}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (value / 50) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <div className="border-t pt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Total (Atlas Score)</span>
        <span className="text-lg font-bold text-gray-900">{breakdown.total}</span>
      </div>
    </div>
  );
}
