import { Handle, Position } from '@xyflow/react';
import { Database } from 'lucide-react';

interface NodeData {
  label: string;
}

export default function EnrichNode({ data }: { data: NodeData }) {
  return (
    <div className="bg-white border-2 border-emerald-400 rounded-xl px-4 py-3 min-w-[160px] shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <Database size={13} className="text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Enrich</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
}
