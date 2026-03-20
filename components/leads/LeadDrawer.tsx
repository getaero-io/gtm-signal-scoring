'use client';

import { InboundLead, EmailLog, RoutingTraceStep } from '@/types/inbound';
import { X, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  lead: InboundLead | null;
  onClose: () => void;
}

export default function LeadDrawer({ lead, onClose }: Props) {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) { setEmails([]); setEmailError(null); return; }
    const controller = new AbortController();
    fetch(`/api/leads/${lead.id}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setEmails(data.emails ?? []))
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch email logs:', err);
          setEmailError('Failed to load emails');
        }
      });
    return () => controller.abort();
  }, [lead?.id]);

  if (!lead) return null;

  const rep = lead.assigned_rep;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{lead.full_name}</h2>
            <p className="text-sm text-gray-500">{lead.email}</p>
          </div>
          <button onClick={onClose} aria-label="Close lead drawer" className="text-gray-400 hover:text-gray-600">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Enrichment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">{lead.atlas_score ?? '—'}</div>
                <div className="text-xs text-gray-500">Atlas Score</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Email Quality</span>
                  <span className="font-medium text-emerald-600">{lead.email_quality ?? 0}/40</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Founder Match</span>
                  <span className="font-medium text-purple-600">{lead.founder_match ?? 0}/20</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Contact ID</span>
                  <span className="font-medium text-blue-600">{lead.contact_identity ?? 0}/15</span>
                </div>
              </div>
            </div>
          </section>

          {lead.routing_path && lead.routing_path.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Routing Path</h3>
              <div className="space-y-1">
                {lead.routing_path.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-gray-50">
                    {step.success
                      ? <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                      : <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />}
                    <div>
                      <span className="font-medium text-gray-700">{step.label}</span>
                      <span className="text-gray-400 mx-1">--</span>
                      <span className="text-gray-600">{step.result}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {rep && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assigned To</h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                  {rep.name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{rep.name}</div>
                  <div className="text-xs text-gray-400">{rep.role}</div>
                </div>
              </div>
            </section>
          )}

          {(emails.length > 0 || emailError) && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Auto-Replies Sent</h3>
              {emailError && emails.length === 0 && (
                <p className="text-xs text-red-500">{emailError}</p>
              )}
              {emails.map(email => (
                <div key={email.id} className="border border-gray-100 rounded-lg p-3 text-xs mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Mail size={11} className="text-gray-400" />
                    <span className="font-medium text-gray-700">{email.subject}</span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded-full ${
                      email.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>{email.status}</span>
                  </div>
                  <p className="text-gray-500 whitespace-pre-line leading-relaxed">{email.body}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
