import { query } from '@/lib/db';
import { Send } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface QualifiedLead {
  company_name: string;
  full_name: string;
  email: string | null;
  title: string | null;
  qualification_score: number | null;
  qualified_at: string;
}

export default async function RoutingPage() {
  const leads = await query<QualifiedLead>(
    `SELECT
       company_name,
       full_name,
       email,
       title,
       qualification_score,
       updated_at AS qualified_at
     FROM inbound.leads
     WHERE status = 'qualified'
     ORDER BY qualification_score DESC NULLS LAST, updated_at DESC
     LIMIT 200`
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Send size={22} /> Outbound Queue
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Qualified leads ready for outreach &mdash; {leads.length} total
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          No qualified leads yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Brand</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">ICP Score</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Qualified Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{lead.company_name || '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-900">{lead.full_name}</td>
                  <td className="px-4 py-3">
                    {lead.email ? (
                      <span className="text-blue-600">{lead.email}</span>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{lead.title || '\u2014'}</td>
                  <td className="px-4 py-3">
                    {lead.qualification_score != null ? (
                      <span className={`font-semibold ${lead.qualification_score >= 60 ? 'text-emerald-600' : 'text-yellow-600'}`}>
                        {Math.round(lead.qualification_score)}
                      </span>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(lead.qualified_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
