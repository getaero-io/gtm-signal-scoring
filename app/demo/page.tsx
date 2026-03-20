'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function DemoPage() {
  const [form, setForm] = useState({ full_name: '', email: '', company: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; atlas_score?: number; message?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'form' }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-10">
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request received!</h2>
          <p className="text-gray-500 text-sm mb-4">{result.message}</p>
          {result.atlas_score != null && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">Atlas Score:</span>
              <span className={`font-bold ${result.atlas_score >= 60 ? 'text-emerald-600' : 'text-gray-700'}`}>
                {result.atlas_score}
              </span>
            </div>
          )}
          <div className="mt-6">
            <a href="/leads" className="text-sm text-blue-600 hover:underline">View in Leads Inbox →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Request a Demo</h1>
        <p className="text-sm text-gray-500 mt-1">Fill out the form and we'll route your request automatically.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Alex Rivera"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="alex@yourcompany.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
            <input
              type="text"
              value={form.company}
              onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
              placeholder="Acme Inc."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Tell us about what you're working on..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {result?.error && (
            <p className="text-sm text-red-600">{result.error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Request Demo'}
          </button>
        </form>
      </div>
    </div>
  );
}
