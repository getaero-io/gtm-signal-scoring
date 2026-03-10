'use client';

import Link from 'next/link';
import { Account } from '@/types/accounts';
import { ScoreDisplay } from '@/components/scoring/ScoreDisplay';
import { TrendSparkline } from '@/components/scoring/TrendSparkline';

interface AccountsTableProps {
  accounts: Account[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function AccountsTable({ accounts, pagination }: AccountsTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="bg-white shadow-md rounded-lg p-12 text-center">
        <p className="text-gray-500 text-lg">No accounts found.</p>
        <p className="text-gray-400 text-sm mt-2">
          Check your DATABASE_URL and ensure dl_resolved.resolved_companies has matched rows.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Industry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Atlas Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                30-Day Trend
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P0 Contacts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tech Stack
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map(account => (
              <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {account.name}
                  </Link>
                  {account.domain && (
                    <div className="text-sm text-gray-500">{account.domain}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {account.industry || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <ScoreDisplay score={account.atlas_score} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TrendSparkline data={account.trend_30d} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {account.p0_penetration.current} / {account.p0_penetration.total}
                  </div>
                  {account.p0_penetration.total > 0 && (
                    <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full"
                        style={{
                          width: `${Math.round(
                            (account.p0_penetration.current / account.p0_penetration.total) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {account.tech_stack.length > 0
                    ? `${account.tech_stack.length} tools`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
        <div className="text-sm text-gray-700">
          Showing {pagination.offset + 1}–{pagination.offset + accounts.length} of{' '}
          {pagination.total.toLocaleString()} accounts
        </div>
      </div>
    </div>
  );
}
