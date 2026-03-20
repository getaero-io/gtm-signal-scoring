'use client';

import Link from 'next/link';
import { Account } from '@/types/accounts';
import { ScoreDisplay } from '@/components/scoring/ScoreDisplay';
import { TrendSparkline } from '@/components/scoring/TrendSparkline';

interface Props {
  accounts: Account[];
}

function EmailBadge({ account }: { account: Account }) {
  const emailScore = account.score_breakdown.email_quality;
  if (emailScore >= 40) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Business Email
      </span>
    );
  }
  if (emailScore >= 20) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Free Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      No Email
    </span>
  );
}

function FounderBadge({ account }: { account: Account }) {
  const founderScore = account.score_breakdown.founder_match;
  if (founderScore > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        ✓ Founder
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">&mdash;</span>;
}

export default function AccountsTable({ accounts }: Props) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No accounts found</p>
        <p className="text-sm mt-1">Try adjusting your search.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 w-64">Account</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Email Signal</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Founder</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Atlas Score</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">30-Day Trend</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Enriched</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map(account => (
            <tr key={account.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/accounts/${encodeURIComponent(account.id)}`}
                  className="group"
                >
                  <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {account.name}
                  </span>
                  <br />
                  <span className="text-xs text-gray-400">{account.domain}</span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <EmailBadge account={account} />
              </td>
              <td className="px-4 py-3">
                <FounderBadge account={account} />
              </td>
              <td className="px-4 py-3">
                <ScoreDisplay score={account.atlas_score} size="sm" />
              </td>
              <td className="px-4 py-3">
                <TrendSparkline data={account.trend_30d} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(account.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
