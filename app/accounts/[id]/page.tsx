import { notFound } from 'next/navigation';
import Link from 'next/link';
import { query } from '@/lib/db';
import { Globe, Mail, User } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface LeadRow {
  id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  linkedin_url: string | null;
  qualification_score: number | null;
  status: string;
  source: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface AccountScoreRow {
  domain: string;
  account_score: number | null;
  account_tier: string | null;
  best_contact_score: number | null;
  contact_count: number | null;
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const domain = decodeURIComponent(id);

  const [leads, accountScores] = await Promise.all([
    query<LeadRow>(
      `SELECT id, full_name, email, title, linkedin_url, qualification_score, status, source, metadata, created_at
       FROM inbound.leads
       WHERE company_domain = $1
       ORDER BY COALESCE(qualification_score, 0) DESC, created_at DESC`,
      [domain]
    ),
    query<AccountScoreRow>(
      `SELECT domain, account_score, account_tier, best_contact_score, contact_count
       FROM inbound.account_scores
       WHERE domain = $1`,
      [domain]
    ),
  ]);

  if (leads.length === 0) notFound();

  const brand = leads[0];
  const companyName = brand.metadata?.company_name || domain;
  const accountScore = accountScores[0];
  const retailers = brand.metadata?.retailers_list || '';
  const retailerCount = brand.metadata?.retailer_count || 0;
  const tier = brand.metadata?.sc_tier || accountScore?.account_tier || null;
  const bestScore = Math.max(...leads.map(l => l.qualification_score ?? 0));

  const tierColors: Record<string, string> = {
    'Tier 1': 'bg-emerald-100 text-emerald-800',
    'Tier 2': 'bg-blue-100 text-blue-800',
    'Tier 3': 'bg-yellow-100 text-yellow-800',
    'Skip': 'bg-red-100 text-red-700',
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-800 transition-colors">
          TAM Database
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">{companyName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
          <a
            href={`https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-1 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {domain}
          </a>
        </div>
        <div className="flex items-center gap-3">
          {tier && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier] || 'bg-gray-100 text-gray-600'}`}>
              {tier}
            </span>
          )}
          {bestScore > 0 && (
            <div className="text-right">
              <div className={`text-2xl font-bold ${bestScore >= 60 ? 'text-emerald-600' : bestScore >= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
                {bestScore}
              </div>
              <div className="text-xs text-gray-400">ICP Score</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-gray-900">{leads.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Contacts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-gray-900">{retailerCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Retailers</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-emerald-600">{leads.filter(l => l.email).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">With Email</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-purple-600">{leads.filter(l => l.status === 'qualified').length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Qualified</div>
        </div>
      </div>

      {/* Retailers */}
      {retailers && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Retail Distribution</h2>
          <div className="flex flex-wrap gap-2">
            {retailers.split(',').map((r: string) => r.trim()).filter(Boolean).map((r: string) => (
              <span key={r} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contacts table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Contacts ({leads.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Title</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">ICP Score</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{lead.full_name}</span>
                  </div>
                  {lead.linkedin_url && (
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-blue-600 ml-6"
                    >
                      LinkedIn
                    </a>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                      <Mail className="w-3 h-3" />
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{lead.title || '\u2014'}</td>
                <td className="px-4 py-3">
                  {lead.qualification_score != null ? (
                    <span className={`font-semibold ${lead.qualification_score >= 60 ? 'text-emerald-600' : lead.qualification_score >= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {Math.round(lead.qualification_score)}
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    lead.status === 'qualified' ? 'bg-emerald-100 text-emerald-700' :
                    lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {lead.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
