import { Handle, Position } from '@xyflow/react';
import { User } from 'lucide-react';

interface NodeData {
  label: string;
  role?: string;
}

const ROLE_STYLES: Record<string, { border: string; text: string }> = {
  Senior: { border: 'border-purple-400', text: 'text-purple-600' },
  AE: { border: 'border-blue-400', text: 'text-blue-600' },
  SDR: { border: 'border-gray-400', text: 'text-gray-600' },
};

export default function AssignNode({ data }: { data: NodeData }) {
  const style = ROLE_STYLES[data.role ?? 'SDR'] ?? ROLE_STYLES.SDR;
  return (
    <div className={`bg-white border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-md ${style.border}`}>
      <div className={`flex items-center gap-2 mb-1 ${style.text}`}>
        <User size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Assign</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      {data.role && <div className="text-xs text-gray-400 mt-0.5">{data.role} queue</div>}
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
      <Handle type="source" position={Position.Right} className="!bg-gray-300" />
    </div>
  );
}
