import scoringConfig from '@/lib/scoring/scoring-config.json';
import ScoringConfigClient from '@/components/scoring/ScoringConfigClient';

export const metadata = { title: 'Scoring Config' };

export default function ScoringPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scoring Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Atlas score weights and decision-maker detection rules — edit via Claude Code
        </p>
      </div>
      <ScoringConfigClient config={scoringConfig} />
    </div>
  );
}
