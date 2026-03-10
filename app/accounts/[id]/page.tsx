import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScoreDisplay } from '@/components/scoring/ScoreDisplay';
import { ScoreBreakdown } from '@/components/scoring/ScoreBreakdown';
import { TrendChart } from '@/components/scoring/TrendChart';
import { Account } from '@/types/accounts';
import { Signal } from '@/types/scoring';

interface AccountDetailData {
  account: Account;
  signals: Signal[];
}

async function getAccount(id: string): Promise<AccountDetailData> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/accounts/${id}`, {
    cache: 'no-store',
  });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Failed to fetch account');

  return res.json();
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account, signals } = await getAccount(id);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="text-sm text-gray-500 mb-2">
            <Link href="/" className="hover:text-gray-700">
              Accounts
            </Link>
            {' / '}
            <span className="text-gray-900">{account.name}</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
              {account.domain && (
                <p className="text-sm text-gray-500 mt-0.5">{account.domain}</p>
              )}
            </div>
            <ScoreDisplay score={account.atlas_score} size="lg" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column */}
          <div className="space-y-6">
            {/* Score Breakdown */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Atlas Score Breakdown
              </h2>
              <ScoreBreakdown breakdown={account.score_breakdown} />
              <p className="mt-4 text-xs text-gray-400">
                Scores are calculated from real signals. See{' '}
                <a
                  href="https://github.com/your-org/gtm-signal-scoring/blob/main/docs/SCORING_MODEL.md"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  SCORING_MODEL.md
                </a>{' '}
                for methodology.
              </p>
            </div>

            {/* Company Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Company Info</h2>
              <dl className="space-y-2 text-sm">
                {account.industry && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Industry</dt>
                    <dd className="text-gray-900 font-medium">{account.industry}</dd>
                  </div>
                )}
                {account.domain && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Domain</dt>
                    <dd className="text-gray-900 font-medium">{account.domain}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">P0 Contacts</dt>
                  <dd className="text-gray-900 font-medium">
                    {account.p0_penetration.current} / {account.p0_penetration.total}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Tech Stack</dt>
                  <dd className="text-gray-900 font-medium">
                    {account.tech_stack.length} tools
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-6">
            {/* 30-Day Trend */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                30-Day Score Trend
              </h2>
              <TrendChart data={account.trend_30d} />
            </div>

            {/* Tech Stack */}
            {account.tech_stack.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Tech Stack
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    (observed via Apollo)
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {account.tech_stack.map(tech => (
                    <span
                      key={tech.id}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                    >
                      {tech.name}
                      {tech.category && (
                        <span className="ml-1 text-blue-400">· {tech.category}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Key Contacts (P0) */}
            {account.key_contacts.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  P0 Contacts
                </h2>
                <div className="divide-y divide-gray-100">
                  {account.key_contacts.map(contact => (
                    <div key={contact.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.full_name}</p>
                        {contact.title && (
                          <p className="text-xs text-gray-500">{contact.title}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                          {contact.seniority}
                        </span>
                        {contact.linkedin_url && (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            LinkedIn
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signals */}
            {signals.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Intent Signals
                </h2>
                <div className="divide-y divide-gray-100">
                  {signals.map(signal => (
                    <div key={signal.id} className="py-3 flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-900">{signal.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(signal.date).toLocaleDateString()} ·{' '}
                          <span className="capitalize">{signal.type.replace('_', ' ')}</span>
                        </p>
                      </div>
                      <span className="text-xs text-green-600 font-medium ml-4 shrink-0">
                        +{signal.impact} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
