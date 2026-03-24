import { ScoreBreakdown } from '@/types/scoring';

interface Props {
  breakdown: ScoreBreakdown;
}

interface BreakdownItem {
  label: string;
  description: string;
  score: number;
  max: number;
  color: string;
}

export default function ScoreBreakdownDisplay({ breakdown }: Props) {
  const items: BreakdownItem[] = [
    {
      label: 'Email Quality',
      description: 'Valid business or personal email verified',
      score: breakdown.email_quality,
      max: 40,
      color: 'bg-emerald-500',
    },
    {
      label: 'Founder Match',
      description: 'Decision-maker / P0 contact identified',
      score: breakdown.founder_match,
      max: 20,
      color: 'bg-purple-500',
    },
    {
      label: 'Contact Identity',
      description: 'Named contact with confirmed identity',
      score: breakdown.contact_identity,
      max: 15,
      color: 'bg-blue-500',
    },
    {
      label: 'Tech Stack',
      description: 'Technology detection + ICP match',
      score: breakdown.tech_stack,
      max: 15,
      color: 'bg-orange-500',
    },
    {
      label: 'Domain Active',
      description: 'MX record confirmed — domain receives email',
      score: breakdown.data_coverage,
      max: 5,
      color: 'bg-gray-400',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <span className="text-2xl font-bold text-gray-900">{breakdown.total}</span>
          <span className="text-gray-400 text-sm ml-1">/ 100</span>
        </div>
        <span className="text-xs text-gray-400">Base 20 pts + signals</span>
      </div>

      {items.map(item => (
        <div key={item.label}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <p className="text-xs text-gray-400">{item.description}</p>
            </div>
            <span className="text-sm font-semibold text-gray-900 ml-4 shrink-0">
              {item.score}
              <span className="text-gray-400 font-normal">/{item.max}</span>
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${item.color} rounded-full transition-all`}
              style={{ width: `${Math.round((item.score / item.max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
