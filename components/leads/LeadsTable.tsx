'use client';

import { InboundLead } from '@/types/inbound';
import { User, Mail, Building2, Clock, CheckCircle2, Zap } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  replied: 'bg-emerald-100 text-emerald-700',
  converted: 'bg-purple-100 text-purple-700',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  new: <Clock size={11} />,
  assigned: <User size={11} />,
  replied: <Mail size={11} />,
  converted: <CheckCircle2 size={11} />,
};

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 60 ? 'text-emerald-600' : score >= 40 ? 'text-yellow-600' : 'text-gray-500';
  return <span className={`font-bold text-sm ${color}`}>{score}</span>;
}

interface Props {
  leads: InboundLead[];
  onSelectLead: (lead: InboundLead) => void;
  selectedId?: string;
}

export default function LeadsTable({ leads, onSelectLead, selectedId }: Props) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Zap size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No leads yet. Submit via the form or run the seed script.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Atlas</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signals</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                selectedId === lead.id ? 'bg-blue-50' : ''
              }`}
            >
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900">{lead.full_name}</div>
                <div className="text-xs text-gray-400">{lead.email}</div>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <Building2 size={12} className="text-gray-400" />
                  <span className="text-gray-700">{lead.company || lead.domain || '—'}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-center">
                <ScoreBadge score={lead.atlas_score ?? undefined} />
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-1 flex-wrap">
                  {lead.is_founder_detected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium">
                      Founder
                    </span>
                  )}
                  {(lead.valid_business_emails ?? 0) > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">
                      Email
                    </span>
                  )}
                  {lead.mx_found && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      MX
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-gray-600 text-xs">
                {lead.assigned_rep?.name || <span className="text-gray-400">Unassigned</span>}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[lead.status] || STATUS_STYLES.new}`}>
                  {STATUS_ICONS[lead.status]}
                  {lead.status}
                </span>
              </td>
              <td className="py-3 px-4 text-xs text-gray-400">
                {new Date(lead.submitted_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
