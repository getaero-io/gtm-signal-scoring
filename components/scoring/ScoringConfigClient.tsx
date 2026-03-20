'use client';

import { useState } from 'react';
import { Copy, Check, FileJson, Sparkles } from 'lucide-react';

interface Props {
  config: Record<string, unknown>;
}

function buildClaudePrompt(config: Record<string, unknown>): string {
  const s = (config as any).scoring;
  const p = (config as any).p0Detection;

  return `I need to update the GTM Signal Atlas scoring configuration for this Next.js project.

The scoring config is at: lib/scoring/scoring-config.json

## Current scoring rules

Atlas score is calculated as:
  base (${s.baseScore}) + emailQuality + contactIdentity + founderMatch + dataCoverage

Each signal:
- Valid business email: +${s.emailQuality.validBusinessEmailPoints} pts each (max ${s.emailQuality.maxPoints})
- Valid free email (Gmail/etc): +${s.emailQuality.validFreeEmailPoints} pts each (max ${s.emailQuality.maxPoints})
- Named contact identified: +${s.contactIdentity.namedContactPoints} pts each (max ${s.contactIdentity.maxPoints})
- Founder/decision-maker (P0): +${s.founderMatch.founderMatchPoints} pts each (max ${s.founderMatch.maxPoints})
- Active MX record found: +${s.dataCoverage.mxFoundPoints} pts

## P0 (decision-maker) detection

C-level titles — auto-qualify as P0:
  ${p.cLevelTitles.join(', ')}

VP/Head-of titles — qualify if department matches revenueDepartments:
  ${p.vpTitles.join(', ')}

Director titles — qualify if department matches revenueDepartments:
  ${p.directorTitles.join(', ')}

Revenue departments (used with VP/Director filter):
  ${p.revenueDepartments.join(', ')}

## How to make changes

Edit lib/scoring/scoring-config.json — that file is the single source of truth for all weights and detection rules. The TypeScript engine reads from it at startup. No other files need to change.

Examples of what I might ask:
- "Double the points for valid business emails to 80"
- "Add 'managing director' and 'gm' to the C-level titles list"
- "Add 'partnerships' to the revenue departments"
- "Lower the MX record bonus to 2 points"
- "Add a cap so emailQuality can't exceed 60"

Please make the following change: [DESCRIBE YOUR CHANGE HERE]`;
}

export default function ScoringConfigClient({ config }: Props) {
  const [copied, setCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const jsonString = JSON.stringify(config, null, 2);
  const prompt = buildClaudePrompt(config);

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyJson() {
    navigator.clipboard.writeText(jsonString).then(() => {
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      {/* Claude Code prompt card */}
      <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-purple-400" />
            <span className="text-xs font-semibold text-gray-300">Claude Code prompt — edit this config</span>
          </div>
          <button
            onClick={copyPrompt}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
        <pre className="p-4 text-xs text-gray-300 leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
          {prompt}
        </pre>
      </div>

      {/* JSON config */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileJson size={14} className="text-emerald-500" />
            <span className="text-xs font-semibold text-gray-700">lib/scoring/scoring-config.json</span>
          </div>
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {jsonCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {jsonCopied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
        <pre className="p-4 text-xs text-gray-700 leading-relaxed overflow-x-auto font-mono bg-gray-50">
          {jsonString}
        </pre>
      </div>

      {/* Quick reference */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Score weights</h3>
          <div className="space-y-2 text-xs">
            {[
              { label: 'Base score', value: (config as any).scoring.baseScore, color: 'text-gray-500' },
              { label: 'Valid business email', value: `+${(config as any).scoring.emailQuality.validBusinessEmailPoints} pts (max ${(config as any).scoring.emailQuality.maxPoints})`, color: 'text-emerald-600' },
              { label: 'Valid free email', value: `+${(config as any).scoring.emailQuality.validFreeEmailPoints} pts (max ${(config as any).scoring.emailQuality.maxPoints})`, color: 'text-yellow-600' },
              { label: 'Named contact', value: `+${(config as any).scoring.contactIdentity.namedContactPoints} pts (max ${(config as any).scoring.contactIdentity.maxPoints})`, color: 'text-blue-600' },
              { label: 'Founder / P0', value: `+${(config as any).scoring.founderMatch.founderMatchPoints} pts (max ${(config as any).scoring.founderMatch.maxPoints})`, color: 'text-purple-600' },
              { label: 'MX record', value: `+${(config as any).scoring.dataCoverage.mxFoundPoints} pts`, color: 'text-gray-600' },
            ].map(row => (
              <div key={row.label} className="flex justify-between">
                <span className="text-gray-500">{row.label}</span>
                <span className={`font-semibold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">P0 detection</h3>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-gray-400 block mb-1">C-Level (auto-qualify)</span>
              <div className="flex flex-wrap gap-1">
                {(config as any).p0Detection.cLevelTitles.map((t: string) => (
                  <span key={t} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-400 block mb-1">VP / Head of + revenue dept</span>
              <div className="flex flex-wrap gap-1">
                {(config as any).p0Detection.vpTitles.map((t: string) => (
                  <span key={t} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-400 block mb-1">Revenue depts</span>
              <div className="flex flex-wrap gap-1">
                {(config as any).p0Detection.revenueDepartments.map((t: string) => (
                  <span key={t} className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
