'use client';

import { Zap, Database, GitBranch, User, Mail, BellRing } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NodeTypeConfig {
  type: string;
  label: string;
  icon: LucideIcon;
  color: string;
  defaultData: Record<string, unknown>;
}

const NODE_TYPES: NodeTypeConfig[] = [
  { type: 'triggerNode', label: 'Trigger', icon: Zap, color: 'bg-blue-100 text-blue-700', defaultData: { label: 'Inbound Lead', source: 'form' } },
  { type: 'enrichNode', label: 'Enrich', icon: Database, color: 'bg-emerald-100 text-emerald-700', defaultData: { label: 'Enrich from DB' } },
  { type: 'conditionNode', label: 'Condition', icon: GitBranch, color: 'bg-yellow-100 text-yellow-700', defaultData: { label: 'Atlas Score', field: 'atlas_score', operator: 'gte', value: 60 } },
  { type: 'assignNode', label: 'Assign Rep', icon: User, color: 'bg-purple-100 text-purple-700', defaultData: { label: 'Assign to Rep', role: 'SDR' } },
  { type: 'autoReplyNode', label: 'Auto-Reply', icon: Mail, color: 'bg-gray-100 text-gray-700', defaultData: { label: 'Send Email', template: 'standard' } },
  { type: 'notifyNode', label: 'Notify Slack', icon: BellRing, color: 'bg-orange-100 text-orange-700', defaultData: { label: 'Slack Alert' } },
];

interface Props {
  onAddNode: (type: string, defaultData: Record<string, unknown>) => void;
}

export default function NodeSidebar({ onAddNode }: Props) {
  return (
    <div className="w-52 bg-white border-r border-gray-200 p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add nodes</p>
      {NODE_TYPES.map(({ type, label, icon: Icon, color, defaultData }) => (
        <button
          key={type}
          onClick={() => onAddNode(type, defaultData)}
          className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80 ${color}`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">Click a node type to add it to the canvas.</p>
      </div>
    </div>
  );
}
