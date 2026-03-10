import { AccountsTable } from '@/components/accounts/AccountsTable';

async function getAccounts() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/accounts`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch accounts');
  }

  return res.json();
}

export default async function HomePage() {
  const data = await getAccounts();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {process.env.NEXT_PUBLIC_APP_NAME || 'GTM Signal Scoring'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Account intelligence powered by real signals — Atlas scoring model
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">Accounts</h2>
          <span className="text-sm text-gray-500">
            {data.pagination.total.toLocaleString()} total
          </span>
        </div>
        <AccountsTable accounts={data.data} pagination={data.pagination} />
      </main>
    </div>
  );
}
