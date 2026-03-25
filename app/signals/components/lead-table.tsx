'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScoreBreakdown } from './score-breakdown';

interface Lead {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  source: string;
  status: string;
  qualification_score: number | null;
  atlas_score: number | null;
  created_at: string;
  icp_score: number | null;
  icp_passed: boolean | null;
  icp_breakdown: Record<string, { score: number; weight: number; rules_matched: string[] }> | null;
  icp_flags: string[] | null;
}

function tierLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Tier 1', color: 'text-emerald-400' };
  if (score >= 50) return { label: 'Tier 2', color: 'text-amber-400' };
  if (score >= 30) return { label: 'Tier 3', color: 'text-zinc-400' };
  return { label: 'Tier 4', color: 'text-red-400' };
}

export function LeadTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ tier: '', source: '', status: '', sort: 'score_desc' });
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.tier) params.set('tier', filters.tier);
      if (filters.source) params.set('source', filters.source);
      if (filters.status) params.set('status', filters.status);
      params.set('sort', filters.sort);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/signals/leads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold">
          Scored Leads {!loading && `(${total.toLocaleString()})`}
        </h2>
        <div className="flex gap-2 text-xs">
          <select
            value={filters.tier}
            onChange={(e) => { setFilters(f => ({ ...f, tier: e.target.value })); setOffset(0); }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
          >
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
          </select>
          <select
            value={filters.source}
            onChange={(e) => { setFilters(f => ({ ...f, source: e.target.value })); setOffset(0); }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
          >
            <option value="">All Sources</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => { setFilters(f => ({ ...f, status: e.target.value })); setOffset(0); }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
          >
            <option value="">All Statuses</option>
            <option value="qualified">Qualified</option>
            <option value="nurture">Nurture</option>
            <option value="new">New</option>
          </select>
          <select
            value={filters.sort}
            onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value }))}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
          >
            <option value="score_desc">Score (High-Low)</option>
            <option value="score_asc">Score (Low-High)</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
              <th className="text-left px-4 py-2">Lead</th>
              <th className="text-left px-4 py-2">Company</th>
              <th className="text-left px-4 py-2">Source</th>
              <th className="text-right px-4 py-2">Score</th>
              <th className="text-center px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">Loading...</td>
              </tr>
            )}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">No leads found</td>
              </tr>
            )}
            {!loading && leads.map((lead) => {
              const score = lead.icp_score ?? lead.qualification_score ?? lead.atlas_score ?? 0;
              const { label, color } = tierLabel(score);
              const isExpanded = expandedId === lead.id;

              return (
                <tr key={lead.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer group" onClick={() => setExpandedId(isExpanded ? null : lead.id)}>
                  <td className="px-4 py-2" colSpan={isExpanded ? 7 : undefined}>
                    {isExpanded ? (
                      <div className="space-y-3 py-2">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-zinc-200 font-medium">{lead.full_name || '\u2014'}</p>
                            <p className="text-xs text-zinc-500 font-mono">{lead.email}</p>
                          </div>
                          <span className="text-xs text-zinc-600">at</span>
                          <span className="text-zinc-400">{lead.company_name || '\u2014'}</span>
                          <span className="font-mono text-xs text-zinc-500">{lead.source}</span>
                          <span className={`font-mono text-xs font-semibold ${color}`}>{label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            lead.status === 'qualified' ? 'bg-emerald-500/20 text-emerald-400' :
                            lead.status === 'nurture' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-zinc-700 text-zinc-400'
                          }`}>{lead.status}</span>
                        </div>
                        {lead.icp_breakdown && (
                          <ScoreBreakdown
                            breakdown={lead.icp_breakdown}
                            flags={lead.icp_flags || []}
                            total={score}
                            passed={lead.icp_passed ?? false}
                          />
                        )}
                        {!lead.icp_breakdown && (
                          <p className="text-xs text-zinc-600">No ICP breakdown data available for this lead.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="text-zinc-200">{lead.full_name || '\u2014'}</p>
                        <p className="text-xs text-zinc-500 font-mono">{lead.email}</p>
                      </>
                    )}
                  </td>
                  {!isExpanded && (
                    <>
                      <td className="px-4 py-2 text-zinc-400">{lead.company_name || '\u2014'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-500">{lead.source}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{score}</td>
                      <td className={`px-4 py-2 text-center font-mono text-xs font-semibold ${color}`}>{label}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          lead.status === 'qualified' ? 'bg-emerald-500/20 text-emerald-400' :
                          lead.status === 'nurture' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>{lead.status}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500 font-mono">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                    </>
                  )}
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
  );
}
