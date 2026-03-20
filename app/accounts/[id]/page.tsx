import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAccountById, getAccountSignals } from '@/lib/data/companies';
import { ScoreDisplay } from '@/components/scoring/ScoreDisplay';
import ScoreBreakdownDisplay from '@/components/scoring/ScoreBreakdown';
import { TrendChart } from '@/components/scoring/TrendChart';
import { Signal } from '@/types/scoring';
import { Contact } from '@/types/accounts';
import { Mail, User, Building2, Globe, Zap } from 'lucide-react';

const SIGNAL_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  email_validated: { icon: '\u2709', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  founder_identified: { icon: '\uD83D\uDC64', color: 'text-purple-600', bg: 'bg-purple-50' },
  contact_named: { icon: '\uD83C\uDFF7', color: 'text-blue-600', bg: 'bg-blue-50' },
  domain_active: { icon: '\uD83C\uDF10', color: 'text-gray-600', bg: 'bg-gray-50' },
};

function ContactCard({ contact }: { contact: Contact }) {
  const initials = contact.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{contact.full_name}</span>
          {contact.is_p0 && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
              P0
            </span>
          )}
          <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
            {contact.seniority}
          </span>
        </div>
        {contact.title && (
          <p className="text-xs text-gray-500 mt-0.5">{contact.title}</p>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
          >
            <Mail className="w-3 h-3" />
            {contact.email}
          </a>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 inline-block"
          >
            LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

function SignalItem({ signal }: { signal: Signal }) {
  const config = SIGNAL_CONFIG[signal.type] ?? {
    icon: '\u26A1',
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bg}`}>
      <span className="text-lg shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.color}`}>{signal.description}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(signal.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
        +{signal.impact}
      </span>
    </div>
  );
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccountById(id);

  if (!account) notFound();

  const signals = await getAccountSignals(account);
  const hasEmail = account.score_breakdown.email_quality > 0;
  const hasFounder = account.score_breakdown.founder_match > 0;
  const mxActive = account.score_breakdown.data_coverage > 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-800 transition-colors">
            Accounts
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{account.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            <a
              href={`https://${account.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-1 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {account.domain}
            </a>
          </div>
          <ScoreDisplay score={account.atlas_score} size="lg" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Score Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                Score Breakdown
              </h2>
              <ScoreBreakdownDisplay breakdown={account.score_breakdown} />
            </div>

            {/* Signal Summary */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                Signal Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
                  </span>
                  {hasEmail ? (
                    <span className="font-medium text-emerald-600">
                      {account.score_breakdown.email_quality >= 40 ? 'Business' : 'Free'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not found</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <User className="w-4 h-4" /> Founder
                  </span>
                  {hasFounder ? (
                    <span className="font-medium text-purple-600">Identified</span>
                  ) : (
                    <span className="text-gray-400">Unknown</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Globe className="w-4 h-4" /> MX Record
                  </span>
                  {mxActive ? (
                    <span className="font-medium text-blue-600">Active</span>
                  ) : (
                    <span className="text-gray-400">Unconfirmed</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> P0 Contacts
                  </span>
                  <span className="font-medium text-gray-900">
                    {account.p0_penetration.current}/{account.p0_penetration.total}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Trend */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                30-Day Score Trend
              </h2>
              <TrendChart data={account.trend_30d} />
            </div>

            {/* Contacts */}
            {account.key_contacts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                  Contacts ({account.key_contacts.length})
                </h2>
                <div className="space-y-2">
                  {account.key_contacts.map(c => (
                    <ContactCard key={c.id} contact={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Intent Signals */}
            {signals.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Intent Signals
                </h2>
                <div className="space-y-2">
                  {signals.map(s => (
                    <SignalItem key={s.id} signal={s} />
                  ))}
                </div>
              </div>
            )}

            {account.key_contacts.length === 0 && signals.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400">
                <p className="text-sm">No contacts or signals found for this domain.</p>
                <p className="text-xs mt-1">Enrich this account to generate signals.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
