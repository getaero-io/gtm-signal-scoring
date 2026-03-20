'use client';

import { useCallback, useEffect, useState } from 'react';
import { Rep } from '@/types/inbound';
import RepCard from '@/components/team/RepCard';
import { Users } from 'lucide-react';

const ROLES = ['Senior', 'AE', 'SDR'] as const;

export default function TeamPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', role: 'SDR' as string, max_leads_per_day: 20 });
  const [adding, setAdding] = useState(false);

  const fetchReps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reps');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReps(data.reps ?? []);
    } catch (err) {
      console.error('Failed to fetch reps:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReps(); }, [fetchReps]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role) return;
    setAdding(true);
    try {
      const res = await fetch('/api/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm({ name: '', email: '', role: 'SDR', max_leads_per_day: 20 });
      await fetchReps();
    } catch (err) {
      console.error('Failed to add rep:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = useCallback((id: string) => {
    setReps(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Users size={22} className="text-gray-700" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure routing reps and capacity</p>
        </div>
      </div>

      {/* Add rep form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Rep</h2>
        <form onSubmit={handleAdd}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="rep-name" className="text-xs font-medium text-gray-600">Name</label>
              <input id="rep-name" type="text" placeholder="Alex Rivera" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rep-email" className="text-xs font-medium text-gray-600">Email</label>
              <input id="rep-email" type="email" placeholder="alex@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rep-role" className="text-xs font-medium text-gray-600">Role</label>
              <select id="rep-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rep-capacity" className="text-xs font-medium text-gray-600">Max leads/day</label>
              <input id="rep-capacity" type="number" placeholder="20" value={form.max_leads_per_day} onChange={e => setForm(f => ({ ...f, max_leads_per_day: parseInt(e.target.value) || 20 }))} min={1} max={100} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={adding} className="col-span-2 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {adding ? 'Adding...' : 'Add Rep'}
            </button>
          </div>
        </form>
      </div>

      {/* Reps list */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
        ) : reps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No reps configured yet.</p>
        ) : (
          reps.map(rep => (
            <RepCard key={rep.id} rep={rep} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}
