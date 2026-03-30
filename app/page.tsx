import AccountsTable from '@/components/accounts/AccountsTable';
import { getAccounts } from '@/lib/data/companies';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { accounts, total } = await getAccounts({});

  const withEmail = accounts.filter(a => a.score_breakdown.email_quality > 0).length;
  const withFounder = accounts.filter(a => a.score_breakdown.founder_match > 0).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Founder contact intelligence — ranked by email quality &amp; decision-maker match
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Accounts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{withEmail}</div>
          <div className="text-xs text-gray-500 mt-0.5">Valid Email Found</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{withFounder}</div>
          <div className="text-xs text-gray-500 mt-0.5">Founder Identified</div>
        </div>
      </div>

      <AccountsTable accounts={accounts} />
    </div>
  );
}
