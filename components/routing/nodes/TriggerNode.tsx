import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

interface NodeData {
  label: string;
  source?: string;
}

export default function TriggerNode({ data }: { data: NodeData }) {
  return (
    <div className="bg-blue-600 text-white rounded-xl px-4 py-3 min-w-[160px] shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Trigger</span>
      </div>
      <div className="text-sm font-medium">{data.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-blue-300" />
    </div>
  );
}
