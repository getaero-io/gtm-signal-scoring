import { Handle, Position } from '@xyflow/react';
import { BellRing } from 'lucide-react';

interface NodeData { label: string; slack_webhook_url?: string; }

export default function NotifyNode({ data }: { data: NodeData }) {
  return (
    <div className="bg-white border-2 border-orange-400 rounded-xl px-4 py-3 min-w-[160px] shadow-md">
      <div className="flex items-center gap-2 mb-1 text-orange-600">
        <BellRing size={13} />
        <span className="text-xs font-semibold uppercase tracking-wide">Notify</span>
      </div>
      <div className="text-sm font-medium text-gray-800">{data.label}</div>
      {data.slack_webhook_url && (
        <div className="text-xs text-gray-400 mt-0.5">Slack configured</div>
      )}
      <Handle type="target" position={Position.Left} className="!bg-orange-300" />
      <Handle type="source" position={Position.Right} className="!bg-orange-300" />
    </div>
  );
}
