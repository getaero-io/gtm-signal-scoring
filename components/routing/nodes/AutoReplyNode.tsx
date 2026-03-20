import { Handle, Position } from '@xyflow/react';
import { Mail } from 'lucide-react';

interface NodeData {
  label: string;
  template?: string;
}

export default function AutoReplyNode({ data }: { data: NodeData }) {
  const isFounder = data.template === 'founder';
  return (
    <div className={`bg-white border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-md ${isFounder ? 'border-purple-400' : 'border-gray-300'}`}>
      <div className={`flex items-center gap-2 mb-1 ${isFounder ? 'text-purple-600' : 'text-gray-500'}`}>
        <Mail size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Auto-Reply</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      {data.template && (
        <div className="text-xs text-gray-400 mt-0.5">{data.template} template</div>
      )}
      <Handle type="target" position={Position.Left} className="!bg-gray-300" />
    </div>
  );
}
