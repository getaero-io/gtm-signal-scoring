import AccountsTable from '@/components/accounts/AccountsTable';
import { getAccounts } from '@/lib/data/companies';

export default async function HomePage() {
  const { accounts, total } = await getAccounts({});

  const withEmail = accounts.filter(a => a.score_breakdown.email_quality > 0).length;
  const withFounder = accounts.filter(a => a.score_breakdown.founder_match > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {process.env.NEXT_PUBLIC_APP_NAME || 'GTM Signal Scoring'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Founder contact intelligence &mdash; ranked by email quality &amp; decision-maker match
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">Accounts</h2>
          <span className="text-sm text-gray-500">
            {total.toLocaleString()} total
          </span>
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
      </main>
    </div>
  );
}
