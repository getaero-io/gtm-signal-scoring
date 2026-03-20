'use client';

import { useEffect, useState } from 'react';
import { InboundLead } from '@/types/inbound';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadDrawer from '@/components/leads/LeadDrawer';
import { Inbox, RefreshCw } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLead, setSelectedLead] = useState<InboundLead | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox size={22} /> Leads Inbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">{total} total leads</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLeads}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <a
            href="/demo"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            + Submit Lead
          </a>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Loading...
        </div>
      ) : (
        <LeadsTable
          leads={leads}
          onSelectLead={setSelectedLead}
          selectedId={selectedLead?.id}
        />
      )}

      <LeadDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
