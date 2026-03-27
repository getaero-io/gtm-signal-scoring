'use client';

import { useState, useEffect, useCallback } from 'react';

interface Reply {
  id: number;
  lead_id: string;
  direction: string;
  channel: string;
  original_message: string;
  drafted_response: string | null;
  final_response: string | null;
  status: string;
  approved_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  lead_name: string;
  lead_email: string;
  company_name: string;
  lead_source: string;
}

interface Funnel {
  total: string;
  pending: string;
  approved: string;
  sent: string;
  rejected: string;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'needs_response', label: 'Needs Response' },
  { value: 'responded', label: 'Responded' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'rejected', label: 'Rejected' },
];

const statusBadge: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  approved: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  approved_queued: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  sent: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

function FunnelCards({ funnel }: { funnel: Funnel }) {
  const cards = [
    { label: 'Total', value: funnel.total, color: 'text-zinc-100' },
    { label: 'Pending', value: funnel.pending, color: 'text-amber-400' },
    { label: 'Approved', value: funnel.approved, color: 'text-blue-400' },
    { label: 'Sent', value: funnel.sent, color: 'text-emerald-400' },
    { label: 'Rejected', value: funnel.rejected, color: 'text-red-400' },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{c.label}</p>
          <p className={`text-2xl font-semibold mt-1 font-mono ${c.color}`}>{Number(c.value).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

function ReplyDetail({ reply, onClose }: { reply: Reply; onClose: () => void }) {
  const badge = statusBadge[reply.status] || { bg: 'bg-zinc-700', text: 'text-zinc-400' };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-zinc-100 font-medium">{reply.lead_name}</h3>
          <p className="text-xs text-zinc-500 font-mono">{reply.lead_email}</p>
          {reply.company_name && (
            <p className="text-xs text-zinc-400 mt-0.5">{reply.company_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded font-medium ${badge.bg} ${badge.text}`}>
            {reply.status}
          </span>
          <span className="text-xs text-zinc-600 font-mono">
            {reply.channel} via {reply.lead_source}
          </span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">
            Close
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Inbound message</p>
          <div className="bg-zinc-950 border border-zinc-800 rounded p-3 text-sm text-zinc-300 whitespace-pre-wrap">
            {reply.original_message}
          </div>
        </div>

        {reply.drafted_response && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Drafted response</p>
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 text-sm text-zinc-300 whitespace-pre-wrap">
              {reply.drafted_response}
            </div>
          </div>
        )}

        {reply.final_response && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Final response (sent)</p>
            <div className="bg-zinc-950 border border-emerald-900/30 rounded p-3 text-sm text-zinc-300 whitespace-pre-wrap">
              {reply.final_response}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 text-xs text-zinc-600 pt-2 border-t border-zinc-800">
        <span>Received {new Date(reply.created_at).toLocaleString()}</span>
        {reply.sent_at && <span>Sent {new Date(reply.sent_at).toLocaleString()}</span>}
        {reply.approved_by && <span>Approved by {reply.approved_by}</span>}
      </div>
    </div>
  );
}

export default function RepliesPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [total, setTotal] = useState(0);
  const [funnel, setFunnel] = useState<Funnel>({ total: '0', pending: '0', approved: '0', sent: '0', rejected: '0' });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const fetchReplies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/signals/replies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
        setTotal(data.total || 0);
        setFunnel(data.funnel || funnel);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const expandedReply = replies.find((r) => r.id === expandedId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a href="/signals" className="text-xs text-zinc-500 hover:text-zinc-300 font-mono">
                Dashboard
              </a>
              <span className="text-zinc-700">/</span>
              <span className="text-xs text-zinc-300 font-mono">Replies</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Replies Inbox</h1>
            <p className="text-zinc-400 mt-1">Track inbound replies and response status</p>
          </div>
        </div>

        <FunnelCards funnel={funnel} />

        {expandedReply && (
          <ReplyDetail reply={expandedReply} onClose={() => setExpandedId(null)} />
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Conversations {!loading && `(${total.toLocaleString()})`}
            </h2>
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setStatusFilter(f.value); setOffset(0); setExpandedId(null); }}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    statusFilter === f.value
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left px-4 py-2">Lead</th>
                  <th className="text-left px-4 py-2">Company</th>
                  <th className="text-left px-4 py-2">Channel</th>
                  <th className="text-left px-4 py-2">Message Preview</th>
                  <th className="text-center px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">Loading...</td>
                  </tr>
                )}
                {!loading && replies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                      {statusFilter ? 'No replies matching this filter' : 'No replies yet'}
                    </td>
                  </tr>
                )}
                {!loading && replies.map((reply) => {
                  const badge = statusBadge[reply.status] || { bg: 'bg-zinc-700', text: 'text-zinc-400' };
                  const isSelected = expandedId === reply.id;
                  const preview = reply.original_message.length > 80
                    ? reply.original_message.slice(0, 80) + '...'
                    : reply.original_message;

                  return (
                    <tr
                      key={reply.id}
                      onClick={() => setExpandedId(isSelected ? null : reply.id)}
                      className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
                      } ${reply.status === 'pending' ? 'border-l-2 border-l-amber-500/50' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <p className={`${reply.status === 'pending' ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
                          {reply.lead_name}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono">{reply.lead_email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs">
                        {reply.company_name || '\u2014'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono text-zinc-500">{reply.channel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs max-w-xs truncate">
                        {preview}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                          {reply.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500 font-mono whitespace-nowrap">
                        {new Date(reply.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="px-4 py-3 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="hover:text-zinc-300 disabled:opacity-30"
              >
                Previous
              </button>
              <span>Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}</span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="hover:text-zinc-300 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
