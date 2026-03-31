'use client';

import { useState } from 'react';
import { Save, Check, AlertTriangle } from 'lucide-react';

interface Props {
  yamlContent: string;
}

interface Rule {
  signal: string;
  operator: string;
  value: any;
  points: number;
}

interface Category {
  category: string;
  weight: number;
  rules: Rule[];
}

interface AntiPenalty {
  signal: string;
  operator: string;
  value: any;
  penalty: number;
  flag: string;
}

interface ParsedConfig {
  name: string;
  description: string;
  categories: Category[];
  thresholds: { qualified: number; nurture: number };
  antifit: AntiPenalty[];
}

function parseYaml(raw: string): ParsedConfig | null {
  try {
    // Simple YAML parser for this specific structure
    const lines = raw.split('\n');
    let name = '';
    let description = '';
    const categories: Category[] = [];
    const antifit: AntiPenalty[] = [];
    let thresholds = { qualified: 60, nurture: 30 };

    // Extract name
    const nameLine = lines.find(l => l.trim().startsWith('name:'));
    if (nameLine) name = nameLine.split('name:')[1].trim().replace(/^"|"$/g, '');

    // Extract description
    const descIdx = lines.findIndex(l => l.trim().startsWith('description:'));
    if (descIdx >= 0) {
      const parts: string[] = [];
      for (let i = descIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^\s{4}\S/) && !line.trim().startsWith('-')) {
          parts.push(line.trim());
        } else {
          break;
        }
      }
      description = parts.join(' ');
      if (!description) {
        // inline description
        description = lines[descIdx].split('description:')[1]?.trim().replace(/^>/, '').trim() || '';
      }
    }

    // Parse scoring categories
    let inScoring = false;
    let inAntifit = false;
    let currentCat: Category | null = null;
    let currentAnti: Partial<AntiPenalty> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === 'scoring:') { inScoring = true; inAntifit = false; continue; }
      if (trimmed === 'thresholds:') { inScoring = false; inAntifit = false; continue; }
      if (trimmed === 'anti_fit:') { inScoring = false; inAntifit = true; continue; }

      // Parse thresholds
      if (trimmed.startsWith('qualified:') && !inScoring && !inAntifit) {
        thresholds.qualified = parseInt(trimmed.split(':')[1].trim());
      }
      if (trimmed.startsWith('nurture:') && !inScoring && !inAntifit) {
        thresholds.nurture = parseInt(trimmed.split(':')[1].trim());
      }

      if (inScoring) {
        if (trimmed.startsWith('- category:')) {
          if (currentCat) categories.push(currentCat);
          currentCat = {
            category: trimmed.split('- category:')[1].trim().replace(/^"|"$/g, ''),
            weight: 0,
            rules: [],
          };
        } else if (trimmed.startsWith('weight:') && currentCat) {
          currentCat.weight = parseInt(trimmed.split(':')[1].trim());
        } else if (trimmed.startsWith('- signal:') && currentCat) {
          const rule: Rule = {
            signal: trimmed.split('- signal:')[1].trim().replace(/^"|"$/g, ''),
            operator: '',
            value: '',
            points: 0,
          };
          // Look ahead for operator, value, points
          for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
            const next = lines[j].trim();
            if (next.startsWith('- signal:') || next.startsWith('- category:') || next === 'thresholds:' || next === 'anti_fit:') break;
            if (next.startsWith('operator:')) rule.operator = next.split(':')[1].trim().replace(/^"|"$/g, '');
            if (next.startsWith('points:')) rule.points = parseInt(next.split(':')[1].trim());
            if (next.startsWith('value:')) {
              const val = next.split(':').slice(1).join(':').trim();
              if (val === 'true') rule.value = true;
              else if (val === 'false') rule.value = false;
              else if (val === '' || val === undefined) {
                // Array value - collect subsequent lines
                const arr: string[] = [];
                for (let k = j + 1; k < lines.length; k++) {
                  const arrLine = lines[k].trim();
                  if (arrLine.startsWith('- "') || arrLine.startsWith("- '") || arrLine.startsWith('- ')) {
                    if (arrLine.startsWith('- signal:') || arrLine.startsWith('- category:')) break;
                    arr.push(arrLine.replace(/^- /, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                  } else {
                    break;
                  }
                }
                if (arr.length > 0) rule.value = arr;
              }
              else if (!isNaN(Number(val))) rule.value = Number(val);
              else rule.value = val.replace(/^"|"$/g, '');
            }
          }
          currentCat.rules.push(rule);
        }
      }

      if (inAntifit) {
        if (trimmed.startsWith('- signal:')) {
          if (currentAnti && currentAnti.signal) antifit.push(currentAnti as AntiPenalty);
          currentAnti = {
            signal: trimmed.split('- signal:')[1].trim().replace(/^"|"$/g, ''),
            operator: '',
            value: '',
            penalty: 0,
            flag: '',
          };
        } else if (currentAnti) {
          if (trimmed.startsWith('operator:')) currentAnti.operator = trimmed.split(':')[1].trim().replace(/^"|"$/g, '');
          if (trimmed.startsWith('penalty:')) currentAnti.penalty = parseInt(trimmed.split(':')[1].trim());
          if (trimmed.startsWith('flag:')) currentAnti.flag = trimmed.split(':')[1].trim().replace(/^"|"$/g, '');
          if (trimmed.startsWith('value:')) {
            const val = trimmed.split(':').slice(1).join(':').trim();
            if (val === 'true') currentAnti.value = true;
            else if (val === 'false') currentAnti.value = false;
            else if (val === '') {
              // Array
              const arr: string[] = [];
              for (let k = i + 1; k < lines.length; k++) {
                const arrLine = lines[k].trim();
                if (arrLine.startsWith('- "') || arrLine.startsWith("- '")) {
                  arr.push(arrLine.replace(/^- /, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                } else if (arrLine.startsWith('- ') && !arrLine.startsWith('- signal:')) {
                  arr.push(arrLine.replace(/^- /, '').replace(/^"|"$/g, ''));
                } else {
                  break;
                }
              }
              if (arr.length > 0) currentAnti.value = arr;
            }
            else if (!isNaN(Number(val))) currentAnti.value = Number(val);
            else currentAnti.value = val.replace(/^"|"$/g, '');
          }
        }
      }
    }

    if (currentCat) categories.push(currentCat);
    if (currentAnti && currentAnti.signal) antifit.push(currentAnti as AntiPenalty);

    return { name, description, categories, thresholds, antifit };
  } catch {
    return null;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  emergence_youth: 'border-l-blue-500',
  first_po_readiness: 'border-l-emerald-500',
  reachability: 'border-l-yellow-500',
  retailer_fit: 'border-l-purple-500',
  engagement: 'border-l-orange-500',
  frequency: 'border-l-pink-500',
  heat: 'border-l-red-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  emergence_youth: 'Emergence / Youth',
  first_po_readiness: 'First PO Readiness',
  reachability: 'Reachability',
  retailer_fit: 'Retailer Fit',
  engagement: 'Engagement',
  frequency: 'Frequency',
  heat: 'Heat',
};

function formatValue(val: any): string {
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

export default function ScoringConfigClient({ yamlContent }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(yamlContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const parsed = parseYaml(yamlContent);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/config/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: 'icp-definitions.yaml',
          content,
          message: 'config: update ICP definitions from dashboard',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!parsed) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500 mb-4">Could not parse YAML. Showing raw content:</p>
        <pre className="text-xs text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
          {yamlContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Thresholds bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-700">{parsed.thresholds.qualified}</div>
          <div className="text-xs text-emerald-600 mt-0.5">Qualified Threshold</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{parsed.thresholds.nurture}</div>
          <div className="text-xs text-yellow-600 mt-0.5">Nurture Threshold</div>
        </div>
      </div>

      {/* Scoring categories */}
      <div className="space-y-4">
        {parsed.categories.map(cat => (
          <div key={cat.category} className={`bg-white rounded-xl border border-gray-200 overflow-hidden border-l-4 ${CATEGORY_COLORS[cat.category] || 'border-l-gray-400'}`}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">
                {CATEGORY_LABELS[cat.category] || cat.category}
              </h3>
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                Weight: {cat.weight}
              </span>
            </div>
            <div className="px-5 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left py-1 pr-4 font-medium">Signal</th>
                    <th className="text-left py-1 pr-4 font-medium">Operator</th>
                    <th className="text-left py-1 pr-4 font-medium">Value</th>
                    <th className="text-right py-1 font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cat.rules.map((rule, i) => (
                    <tr key={i} className="text-gray-700">
                      <td className="py-1.5 pr-4 font-mono text-gray-600">{rule.signal}</td>
                      <td className="py-1.5 pr-4">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{rule.operator}</span>
                      </td>
                      <td className="py-1.5 pr-4 max-w-[200px] truncate" title={formatValue(rule.value)}>
                        {formatValue(rule.value)}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-emerald-600">+{rule.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Anti-fit penalties */}
      {parsed.antifit.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden border-l-4 border-l-red-400">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
            <AlertTriangle size={14} className="text-red-500" />
            <h3 className="text-sm font-semibold text-gray-800">Anti-Fit Penalties</h3>
          </div>
          <div className="px-5 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1 pr-4 font-medium">Signal</th>
                  <th className="text-left py-1 pr-4 font-medium">Operator</th>
                  <th className="text-left py-1 pr-4 font-medium">Value</th>
                  <th className="text-right py-1 pr-4 font-medium">Penalty</th>
                  <th className="text-left py-1 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.antifit.map((af, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className="py-1.5 pr-4 font-mono text-gray-600">{af.signal}</td>
                    <td className="py-1.5 pr-4">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{af.operator}</span>
                    </td>
                    <td className="py-1.5 pr-4 max-w-[200px] truncate" title={formatValue(af.value)}>
                      {formatValue(af.value)}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-semibold text-red-600">{af.penalty}</td>
                    <td className="py-1.5 text-gray-500 font-mono">{af.flag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit YAML */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            config/spring-cash/icp-definitions.yaml
          </span>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check size={12} /> Saved
              </span>
            )}
            {error && (
              <span className="text-xs text-red-600">{error}</span>
            )}
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setContent(yamlContent); setError(''); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                >
                  <Save size={12} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
              >
                Edit YAML
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full p-4 text-xs text-gray-700 font-mono bg-gray-50 focus:outline-none resize-y"
            rows={30}
            spellCheck={false}
          />
        ) : (
          <pre className="p-4 text-xs text-gray-700 font-mono bg-gray-50 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
            {yamlContent}
          </pre>
        )}
      </div>
    </div>
  );
}
