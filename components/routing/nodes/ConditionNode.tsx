import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

interface NodeData {
  label: string;
  field?: string;
  operator?: string;
  value?: string | number;
}

export default function ConditionNode({ data }: { data: NodeData }) {
  return (
    <div className="relative bg-white border-2 border-yellow-400 rounded-xl px-4 py-3 min-w-[180px] shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch size={13} className="text-yellow-500" />
        <span className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">Condition</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">
        {data.field} {data.operator} {data.value}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-yellow-400" />
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: '30%' }}
        className="!bg-emerald-400"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: '70%' }}
        className="!bg-red-400"
      />
      <div className="absolute -right-8 text-xs text-emerald-600 font-medium" style={{ top: '18%' }}>Yes</div>
      <div className="absolute -right-7 text-xs text-red-500 font-medium" style={{ top: '60%' }}>No</div>
    </div>
  );
}
