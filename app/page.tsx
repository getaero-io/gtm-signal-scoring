import AccountsTable from '@/components/accounts/AccountsTable';
import { getAccounts } from '@/lib/data/companies';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { accounts, stats } = await getAccounts({});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">TAM Database</h1>
        <p className="text-sm text-gray-500 mt-1">
          Emerging CPG brands &mdash; ranked by ICP fit &amp; retailer distribution
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{(stats.totalAccounts ?? 0).toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Brands</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{(stats.withEmail ?? 0).toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-0.5">With Email</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{(stats.qualified ?? 0).toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-0.5">Qualified</div>
        </div>
      </div>

      <AccountsTable accounts={accounts} />
    </div>
  );
}
