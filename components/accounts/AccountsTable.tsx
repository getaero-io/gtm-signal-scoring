'use client';

import { Account } from '@/types/accounts';

interface Props {
  accounts: Account[];
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-gray-400 text-xs">&mdash;</span>;

  const colors: Record<string, string> = {
    'Tier 1': 'bg-emerald-100 text-emerald-800',
    'Tier 2': 'bg-blue-100 text-blue-800',
    'Tier 3': 'bg-yellow-100 text-yellow-800',
    'Skip': 'bg-red-100 text-red-700',
  };
  const colorClass = colors[tier] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {tier}
    </span>
  );
}

function EmailStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        None
      </span>
    );
  }

  if (status === 'valid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Valid
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Invalid
    </span>
  );
}

function RetailersCell({ count, list }: { count: number; list: string | null }) {
  const retailers = list ? list.split(',').map(r => r.trim()).filter(Boolean) : [];
  const preview = retailers.slice(0, 3).join(', ');
  const remaining = retailers.length > 3 ? ` +${retailers.length - 3}` : '';

  return (
    <div>
      <span className="font-medium text-gray-900">{count}</span>
      {preview && (
        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]" title={list || ''}>
          {preview}{remaining}
        </div>
      )}
    </div>
  );
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
            <th className="text-left px-4 py-3 font-semibold text-gray-600 w-56">Brand</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Domain</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Retailers</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Tier</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">ICP Score</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Founder</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Email Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map(account => (
            <tr key={account.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <span className="font-medium text-gray-900">{account.name}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-gray-500">{account.domain}</span>
              </td>
              <td className="px-4 py-3">
                <RetailersCell count={account.retailer_count} list={account.retailers_list} />
              </td>
              <td className="px-4 py-3">
                <TierBadge tier={account.sc_tier} />
              </td>
              <td className="px-4 py-3">
                {account.icp_score != null ? (
                  <span className={`font-semibold ${account.icp_score >= 60 ? 'text-emerald-600' : account.icp_score >= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
                    {Math.round(account.icp_score)}
                  </span>
                ) : (
                  <span className="text-gray-400">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3">
                {account.founder_name ? (
                  <div>
                    <span className="text-gray-900">{account.founder_name}</span>
                    {account.founder_title && (
                      <div className="text-xs text-gray-400 truncate max-w-[140px]" title={account.founder_title}>
                        {account.founder_title}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3">
                <EmailStatusBadge status={account.email_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
