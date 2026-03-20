'use client';

import { useState } from 'react';
import { Rep } from '@/types/inbound';
import { Trash2 } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  Senior: 'bg-purple-100 text-purple-700',
  AE: 'bg-blue-100 text-blue-700',
  SDR: 'bg-gray-100 text-gray-600',
};

interface Props {
  rep: Rep;
  onDelete: (id: string) => void;
}

export default function RepCard({ rep, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting || !confirm(`Remove ${rep.name}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reps/${rep.id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`Failed to delete rep: HTTP ${res.status}`);
        return;
      }
      onDelete(rep.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm">
        {rep.name.split(' ').slice(0, 2).map(w => w.charAt(0)).join('')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{rep.name}</div>
        <div className="text-sm text-gray-400">{rep.email}</div>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[rep.role] ?? ROLE_COLORS.SDR}`}>
        {rep.role}
      </span>
      <div className="text-xs text-gray-400 whitespace-nowrap">
        {rep.max_leads_per_day}/day
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Remove ${rep.name}`}
        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
