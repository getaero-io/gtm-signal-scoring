'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import EnrichNode from './nodes/EnrichNode';
import ConditionNode from './nodes/ConditionNode';
import AssignNode from './nodes/AssignNode';
import AutoReplyNode from './nodes/AutoReplyNode';
import NotifyNode from './nodes/NotifyNode';
import NodeSidebar from './NodeSidebar';
import { Save, CheckCircle2 } from 'lucide-react';

const nodeTypes = {
  triggerNode: TriggerNode,
  enrichNode: EnrichNode,
  conditionNode: ConditionNode,
  assignNode: AssignNode,
  autoReplyNode: AutoReplyNode,
  notifyNode: NotifyNode,
};

const DEFAULT_NODES: Node[] = [
  { id: 'trigger-1', type: 'triggerNode', position: { x: 60, y: 180 }, data: { label: 'Inbound Lead', source: 'form' } },
  { id: 'enrich-1', type: 'enrichNode', position: { x: 280, y: 180 }, data: { label: 'Enrich from DB' } },
  { id: 'condition-1', type: 'conditionNode', position: { x: 500, y: 180 }, data: { label: 'Atlas Score \u2265 60', field: 'atlas_score', operator: 'gte', value: 60 } },
  { id: 'assign-senior', type: 'assignNode', position: { x: 740, y: 80 }, data: { label: 'Assign Senior Rep', role: 'Senior' } },
  { id: 'assign-sdr', type: 'assignNode', position: { x: 740, y: 300 }, data: { label: 'Assign SDR Queue', role: 'SDR' } },
  { id: 'reply-founder', type: 'autoReplyNode', position: { x: 980, y: 80 }, data: { label: 'Founder Reply', template: 'founder' } },
  { id: 'reply-standard', type: 'autoReplyNode', position: { x: 980, y: 300 }, data: { label: 'Standard Reply', template: 'standard' } },
];

const DEFAULT_EDGES: Edge[] = [
  { id: 'e1', source: 'trigger-1', target: 'enrich-1' },
  { id: 'e2', source: 'enrich-1', target: 'condition-1' },
  { id: 'e3', source: 'condition-1', target: 'assign-senior', sourceHandle: 'true', animated: true, style: { stroke: '#10b981' } },
  { id: 'e4', source: 'condition-1', target: 'assign-sdr', sourceHandle: 'false', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e5', source: 'assign-senior', target: 'reply-founder' },
  { id: 'e6', source: 'assign-sdr', target: 'reply-standard' },
];

export default function RoutingCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/routing', { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (data.config?.nodes?.length > 0) {
          setNodes(data.config.nodes);
          if (Array.isArray(data.config.edges)) {
            setEdges(data.config.edges);
          }
        }
        setLoaded(true);
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error('Failed to load routing config:', err);
        setLoaded(true);
      });
    return () => controller.abort();
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const handleAddNode = useCallback((type: string, defaultData: Record<string, unknown>) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaultData,
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, name: 'Default Routing' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(new Date().toLocaleTimeString());
      setSaveError(null);
    } catch (err) {
      console.error('Failed to save routing config:', err);
      setSaveError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading routing config...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <NodeSidebar onAddNode={handleAddNode} />
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Default Routing</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Live</span>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={12} /> Saved {savedAt}
              </span>
            )}
            {saveError && (
              <span className="text-xs text-red-500">{saveError}</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save & Publish'}
            </button>
          </div>
        </div>
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap className="!bg-gray-100" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
