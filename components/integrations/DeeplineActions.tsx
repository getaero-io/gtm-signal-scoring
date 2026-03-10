'use client';

import { useState } from 'react';
import { enrichAccount } from '@/app/actions/deepline';

interface DeeplineActionsProps {
  accountId: string;
  domain?: string;
}

export function DeeplineActions({ accountId, domain }: DeeplineActionsProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null);

  if (!domain) return null;

  async function handleEnrich() {
    setLoading(true);
    setResult(null);
    try {
      const res = await enrichAccount(domain!);
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-2">Deepline</h2>
      <p className="text-xs text-gray-500 mb-4">
        Re-enrich this account with the latest signals from Deepline CLI.
      </p>
      <button
        onClick={handleEnrich}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Running...' : 'Run Enrichment'}
      </button>
      {result && (
        <div
          className={`mt-3 p-3 rounded text-xs font-mono ${
            result.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.output || result.error}
        </div>
      )}
    </div>
  );
}
