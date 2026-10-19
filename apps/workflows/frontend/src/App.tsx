import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';
import {
  NodePaletteTemplate,
  SavedWorkflow,
  CanvasWorkflowNode,
  CanvasWorkflowEdge,
  ApiCredentialsStatus,
  WorkflowRunReport,
  NodeExecutionResult,
  IntegrationCategory,
} from '../../shared/types.js';

const API_BASE = `${getHostBaseUrl()}/api/apps/workflows`;

const NODE_WIDTH = 228;
const NODE_HEIGHT = 96;

interface HaEntityOption {
  entityId: string;
  friendlyName: string;
  state: string;
}

function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function App() {
  const [palette, setPalette] = useState<NodePaletteTemplate[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<SavedWorkflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<ApiCredentialsStatus | null>(null);
  const [haEntities, setHaEntities] = useState<HaEntityOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningWorkflow, setRunningWorkflow] = useState<boolean>(false);
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals
  const [showKeysModal, setShowKeysModal] = useState<boolean>(false);
  const [showCustomNodeModal, setShowCustomNodeModal] = useState<boolean>(false);

  // API Keys Form
  const [geminiKey, setGeminiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [googleToken, setGoogleToken] = useState('');

  // Custom Node Form
  const [customNodeName, setCustomNodeName] = useState('');
  const [customNodeSubtitle, setCustomNodeSubtitle] = useState('');
  const [customNodeIcon, setCustomNodeIcon] = useState('🧩');
  const [customNodeEndpoint, setCustomNodeEndpoint] = useState('https://api.example.com/v1');

  // Canvas Dragging State
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Wire Connection Dragging State
  const [connectingFrom, setConnectingFrom] = useState<{
    sourceNodeId: string;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bootstrap`);
      const data = await res.json();
      setPalette(data.palette || []);
      const wfList: SavedWorkflow[] = data.workflows || [];
      setWorkflows(wfList);
      setActiveWorkflow((prev) => {
        if (prev) {
          return wfList.find((w) => w.id === prev.id) || wfList[0] || null;
        }
        return wfList[0] || null;
      });
      setCredentialsStatus(data.credentialsStatus || null);
      setHaEntities(data.haEntities || []);
    } catch (err) {
      console.error('Failed to load workflows bootstrap:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const saveWorkflowToBackend = async (wf: SavedWorkflow, silent = false) => {
    setActiveWorkflow(wf);
    setWorkflows((prev) => {
      const idx = prev.findIndex((item) => item.id === wf.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = wf;
        return copy;
      }
      return [wf, ...prev];
    });
    try {
      await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: wf }),
      });
      if (!silent) notify('Workflow saved');
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  // Add node from palette (either at drop coordinates or auto-positioned)
  const addNodeFromTemplate = (
    tpl: NodePaletteTemplate,
    dropX?: number,
    dropY?: number
  ) => {
    if (!activeWorkflow) return;
    const existingCount = activeWorkflow.nodes.length;
    const x = dropX ?? 120 + (existingCount % 4) * 260;
    const y = dropY ?? 140 + Math.floor(existingCount / 4) * 140;

    const newNode: CanvasWorkflowNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      typeId: tpl.typeId,
      category: tpl.category,
      name: tpl.name,
      subtitle: tpl.subtitle,
      icon: tpl.icon,
      accentColor: tpl.accentColor,
      n8nType: tpl.n8nType,
      x: Math.max(20, Math.round(x)),
      y: Math.max(20, Math.round(y)),
      config: { ...tpl.defaultConfig },
      lastStatus: 'idle',
    };

    const nextEdges = [...activeWorkflow.edges];
    // If a node is currently selected and user clicked palette item, auto-connect it!
    if (selectedNodeId && dropX === undefined) {
      nextEdges.push({
        id: `edge-${Date.now()}`,
        sourceNodeId: selectedNodeId,
        targetNodeId: newNode.id,
      });
    }

    const updated: SavedWorkflow = {
      ...activeWorkflow,
      nodes: [...activeWorkflow.nodes, newNode],
      edges: nextEdges,
    };
    setSelectedNodeId(newNode.id);
    saveWorkflowToBackend(updated, true);
  };

  // Drag & Drop from Left Sidebar onto Canvas
  const handlePaletteDragStart = (e: React.DragEvent, tpl: NodePaletteTemplate) => {
    e.dataTransfer.setData('application/thassi-node-type', tpl.typeId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const typeId = e.dataTransfer.getData('application/thassi-node-type');
    if (!typeId || !canvasRef.current) return;
    const tpl = palette.find((p) => p.typeId === typeId);
    if (!tpl) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dropX = e.clientX - rect.left - NODE_WIDTH / 2 + canvasRef.current.scrollLeft;
    const dropY = e.clientY - rect.top - NODE_HEIGHT / 2 + canvasRef.current.scrollTop;
    addNodeFromTemplate(tpl, dropX, dropY);
  };

  // Pointer dragging of existing nodes on canvas
  const handleNodePointerDown = (e: React.PointerEvent, node: CanvasWorkflowNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const pointerY = e.clientY - rect.top + canvasRef.current.scrollTop;
    setDraggingNode({
      nodeId: node.id,
      offsetX: pointerX - node.x,
      offsetY: pointerY - node.y,
    });
  };

  // Start drawing a connection wire from output port
  const handleOutputPortPointerDown = (e: React.PointerEvent, node: CanvasWorkflowNode) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const startX = node.x + NODE_WIDTH;
    const startY = node.y + NODE_HEIGHT / 2;
    setConnectingFrom({
      sourceNodeId: node.id,
      startX,
      startY,
      currX: startX,
      currY: startY,
    });
  };

  // Complete connection wire on input port
  const handleInputPortPointerUp = (e: React.PointerEvent, targetNode: CanvasWorkflowNode) => {
    e.stopPropagation();
    if (!connectingFrom || !activeWorkflow) return;
    if (connectingFrom.sourceNodeId !== targetNode.id) {
      const exists = activeWorkflow.edges.some(
        (edge) =>
          edge.sourceNodeId === connectingFrom.sourceNodeId &&
          edge.targetNodeId === targetNode.id
      );
      if (!exists) {
        const updated: SavedWorkflow = {
          ...activeWorkflow,
          edges: [
            ...activeWorkflow.edges,
            {
              id: `e-${Date.now()}`,
              sourceNodeId: connectingFrom.sourceNodeId,
              targetNodeId: targetNode.id,
            },
          ],
        };
        saveWorkflowToBackend(updated, true);
      }
    }
    setConnectingFrom(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current || !activeWorkflow) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const pointerY = e.clientY - rect.top + canvasRef.current.scrollTop;

    if (draggingNode) {
      const nextX = Math.max(16, Math.round(pointerX - draggingNode.offsetX));
      const nextY = Math.max(16, Math.round(pointerY - draggingNode.offsetY));
      setActiveWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === draggingNode.nodeId ? { ...n, x: nextX, y: nextY } : n
          ),
        };
      });
    } else if (connectingFrom) {
      setConnectingFrom({
        ...connectingFrom,
        currX: pointerX,
        currY: pointerY,
      });
    }
  };

  const handleCanvasPointerUp = () => {
    if (draggingNode && activeWorkflow) {
      saveWorkflowToBackend(activeWorkflow, true);
    }
    setDraggingNode(null);
    setConnectingFrom(null);
  };

  const handleDeleteEdge = (edgeId: string) => {
    if (!activeWorkflow) return;
    const updated: SavedWorkflow = {
      ...activeWorkflow,
      edges: activeWorkflow.edges.filter((e) => e.id !== edgeId),
    };
    saveWorkflowToBackend(updated, true);
  };

  const handleDeleteSelectedNode = () => {
    if (!activeWorkflow || !selectedNodeId) return;
    const updated: SavedWorkflow = {
      ...activeWorkflow,
      nodes: activeWorkflow.nodes.filter((n) => n.id !== selectedNodeId),
      edges: activeWorkflow.edges.filter(
        (e) => e.sourceNodeId !== selectedNodeId && e.targetNodeId !== selectedNodeId
      ),
    };
    setSelectedNodeId(null);
    saveWorkflowToBackend(updated, true);
    notify('Node removed');
  };

  const handleCreateNewWorkflow = () => {
    const newWf: SavedWorkflow = {
      id: `wf-${Date.now()}`,
      name: `New Workflow ${workflows.length + 1}`,
      description: 'Drag nodes from the left sidebar onto the canvas and connect them.',
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: `node-${Date.now()}`,
          typeId: 'trigger.manual',
          category: 'trigger',
          name: 'Manual Trigger',
          subtitle: 'Starts workflow on click',
          icon: '⚡',
          accentColor: '#f59e0b',
          n8nType: 'n8n-nodes-base.webhook',
          x: 80,
          y: 180,
          config: { webhookPath: '/webhook/custom', payloadHint: 'Hello Workflow!' },
        },
      ],
      edges: [],
    };
    setSelectedNodeId(newWf.nodes[0].id);
    saveWorkflowToBackend(newWf);
  };

  const handleRunWorkflow = async () => {
    if (!activeWorkflow) return;
    setRunningWorkflow(true);
    setActiveWorkflow({
      ...activeWorkflow,
      nodes: activeWorkflow.nodes.map((n) => ({ ...n, lastStatus: 'running' })),
    });

    try {
      const res = await fetch(`${API_BASE}/execute-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: activeWorkflow }),
      });
      const data = await res.json();
      if (data.ok && data.report) {
        const report: WorkflowRunReport = data.report;
        const updated: SavedWorkflow = {
          ...activeWorkflow,
          nodes: activeWorkflow.nodes.map((n) => {
            const nr: NodeExecutionResult | undefined = report.nodeResults[n.id];
            if (!nr) return { ...n, lastStatus: 'idle' };
            return {
              ...n,
              lastStatus: nr.status,
              lastOutput: nr.outputSummary,
              lastDurationMs: nr.durationMs,
            };
          }),
        };
        saveWorkflowToBackend(updated, true);
        notify(`Workflow executed (${Object.keys(report.nodeResults).length} nodes OK)`);
      }
    } catch (err) {
      notify('Execution failed');
    } finally {
      setRunningWorkflow(false);
    }
  };

  const handleTestSingleNode = async (node: CanvasWorkflowNode) => {
    if (!activeWorkflow) return;
    setTestingNodeId(node.id);
    try {
      const res = await fetch(`${API_BASE}/execute-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        const r: NodeExecutionResult = data.result;
        const updated: SavedWorkflow = {
          ...activeWorkflow,
          nodes: activeWorkflow.nodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  lastStatus: r.status,
                  lastOutput:
                    typeof r.outputData === 'object'
                      ? JSON.stringify(r.outputData, null, 2)
                      : r.outputSummary,
                  lastDurationMs: r.durationMs,
                }
              : n
          ),
        };
        saveWorkflowToBackend(updated, true);
        notify(`Tested "${node.name}" (${r.durationMs}ms)`);
      }
    } finally {
      setTestingNodeId(null);
    }
  };

  const handleExportN8nJson = () => {
    if (!activeWorkflow) return;
    const n8nJson = {
      name: activeWorkflow.name,
      nodes: activeWorkflow.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.n8nType,
        typeVersion: 1,
        position: [n.x, n.y],
        parameters: n.config,
      })),
      connections: activeWorkflow.edges.reduce((acc: Record<string, any>, edge) => {
        const src = activeWorkflow.nodes.find((n) => n.id === edge.sourceNodeId);
        const tgt = activeWorkflow.nodes.find((n) => n.id === edge.targetNodeId);
        if (src && tgt) {
          acc[src.name] = acc[src.name] || { main: [[]] };
          acc[src.name].main[0].push({
            node: tgt.name,
            type: 'main',
            index: 0,
          });
        }
        return acc;
      }, {}),
    };

    const blob = new Blob([JSON.stringify(n8nJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.n8n.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported n8n workflow JSON');
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: geminiKey,
        githubToken,
        googleOAuthToken: googleToken,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setCredentialsStatus(data.credentialsStatus);
      setGeminiKey('');
      setGithubToken('');
      setGoogleToken('');
      setShowKeysModal(false);
      notify('API credentials saved');
    }
  };

  const handleCreateCustomNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNodeName.trim()) return;
    const res = await fetch(`${API_BASE}/custom-nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customNodeName,
        subtitle: customNodeSubtitle || 'Custom API Node',
        icon: customNodeIcon || '🧩',
        endpointOrHint: customNodeEndpoint,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setPalette(data.palette);
      setCustomNodeName('');
      setCustomNodeSubtitle('');
      setShowCustomNodeModal(false);
      notify('Custom node added to palette');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#090d16] text-slate-100 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading Workflows Canvas...</div>
      </div>
    );
  }

  const selectedNode =
    activeWorkflow?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedTemplate =
    palette.find((p) => p.typeId === selectedNode?.typeId) ?? null;

  const filteredPalette = palette.filter(
    (item) => categoryFilter === 'all' || item.category === categoryFilter
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d16] text-slate-100 overflow-hidden">
      {/* SUPER SIMPLE TOP BAR */}
      <header className="h-14 shrink-0 bg-slate-900/95 border-b border-slate-800 px-4 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-sm text-white bg-sky-500/15 border border-sky-500/30 px-3 py-1.5 rounded-xl">
            <span>🔗 Workflows</span>
          </div>

          {/* Workflow Switcher */}
          <select
            value={activeWorkflow?.id || ''}
            onChange={(e) => {
              const found = workflows.find((w) => w.id === e.target.value);
              if (found) {
                setActiveWorkflow(found);
                setSelectedNodeId(null);
              }
            }}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name} ({wf.nodes.length} nodes)
              </option>
            ))}
          </select>

          {/* Editable Workflow Name */}
          {activeWorkflow && (
            <input
              type="text"
              value={activeWorkflow.name}
              onChange={(e) =>
                setActiveWorkflow({ ...activeWorkflow, name: e.target.value })
              }
              onBlur={() => saveWorkflowToBackend(activeWorkflow, true)}
              className="hidden md:block bg-transparent border border-transparent hover:border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-200 focus:outline-none"
            />
          )}

          <button
            onClick={handleCreateNewWorkflow}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
          >
            + New Workflow
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {toast && (
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              ✓ {toast}
            </span>
          )}

          <button
            onClick={() => setShowKeysModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
          >
            🔑 API Keys
          </button>

          <button
            onClick={handleExportN8nJson}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
          >
            ⬇ Export n8n JSON
          </button>

          <button
            onClick={handleRunWorkflow}
            disabled={runningWorkflow}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer transition-all"
          >
            {runningWorkflow ? '⏳ Running...' : '▶ Run Workflow'}
          </button>
        </div>
      </header>

      {/* MAIN 3-PANE WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: DRAG & DROP NODE PALETTE */}
        <aside className="w-72 shrink-0 bg-slate-900/90 border-r border-slate-800 flex flex-col z-10">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Drag Nodes to Canvas
              </span>
              <button
                onClick={() => setShowCustomNodeModal(true)}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
              >
                + Custom Node
              </button>
            </div>

            {/* Quick API Category Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'trigger', label: '⚡ Trigger' },
                  { id: 'gemini', label: '✨ Gemini' },
                  { id: 'gmail', label: '📧 Gmail' },
                  { id: 'gcal', label: '📅 Calendar' },
                  { id: 'github', label: '🐙 GitHub' },
                  { id: 'homeassistant', label: '🏠 HA' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Draggable Node Cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredPalette.map((tpl) => (
              <div
                key={tpl.typeId}
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, tpl)}
                onClick={() => addNodeFromTemplate(tpl)}
                title="Drag onto canvas or click to add"
                className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-600 transition-all cursor-grab active:cursor-grabbing flex items-center gap-3 group"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{
                    backgroundColor: `${tpl.accentColor}22`,
                    border: `1px solid ${tpl.accentColor}55`,
                  }}
                >
                  {tpl.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                      {tpl.name}
                    </span>
                    <span className="text-[10px] text-slate-500 group-hover:text-sky-400">
                      + Add
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{tpl.subtitle}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 bg-slate-950/50">
            💡 <strong>Tip:</strong> Drag any node onto the grid, then drag from its right dot{' '}
            <span className="text-sky-400 font-bold">●</span> to another node&apos;s left dot to connect them.
          </div>
        </aside>

        {/* CENTER: DRAG & DROP VISUAL WORKFLOW CANVAS */}
        <div
          ref={canvasRef}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onClick={() => setSelectedNodeId(null)}
          className="flex-1 relative overflow-auto workflow-canvas-grid"
        >
          <div className="relative min-w-[1600px] min-h-[1000px]">
            {/* SVG Layer for Bézier Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {activeWorkflow?.edges.map((edge) => {
                const src = activeWorkflow.nodes.find((n) => n.id === edge.sourceNodeId);
                const tgt = activeWorkflow.nodes.find((n) => n.id === edge.targetNodeId);
                if (!src || !tgt) return null;

                const x1 = src.x + NODE_WIDTH;
                const y1 = src.y + NODE_HEIGHT / 2;
                const x2 = tgt.x;
                const y2 = tgt.y + NODE_HEIGHT / 2;
                const pathD = buildBezierPath(x1, y1, x2, y2);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                  <g key={edge.id} className="pointer-events-auto group">
                    {/* Invisible wider stroke for easy clicking */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEdge(edge.id);
                      }}
                      className="cursor-pointer"
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={runningWorkflow ? '#38bdf8' : '#64748b'}
                      strokeWidth={2.5}
                      className={runningWorkflow ? 'edge-animated' : 'group-hover:stroke-rose-400 transition-colors'}
                    />
                    {/* Small delete button at midpoint on hover */}
                    <g
                      transform={`translate(${midX}, ${midY})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEdge(edge.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                    >
                      <circle r={10} fill="#1e293b" stroke="#f43f5e" strokeWidth={1.5} />
                      <text
                        textAnchor="middle"
                        dy="3.5"
                        fill="#fda4af"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        ×
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Active Connection Wire Being Dragged */}
              {connectingFrom && (
                <path
                  d={buildBezierPath(
                    connectingFrom.startX,
                    connectingFrom.startY,
                    connectingFrom.currX,
                    connectingFrom.currY
                  )}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                />
              )}
            </svg>

            {/* Nodes Layer */}
            {activeWorkflow?.nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const firstConfigValue = Object.values(node.config)[0] || node.subtitle;

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                  }}
                  style={{
                    width: `${NODE_WIDTH}px`,
                    minHeight: `${NODE_HEIGHT}px`,
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    borderColor: isSelected ? '#38bdf8' : 'rgba(51, 65, 85, 0.9)',
                  }}
                  className={`absolute top-0 left-0 rounded-2xl bg-slate-900/95 border-2 shadow-xl transition-shadow cursor-grab active:cursor-grabbing ${
                    isSelected ? 'ring-4 ring-sky-500/20' : 'hover:border-slate-600'
                  }`}
                >
                  {/* Top Color Bar */}
                  <div
                    className="h-1.5 rounded-t-2xl"
                    style={{ backgroundColor: node.accentColor }}
                  />

                  {/* Left Input Port (for non-triggers) */}
                  {node.category !== 'trigger' && (
                    <div
                      onPointerUp={(e) => handleInputPortPointerUp(e, node)}
                      title="Drop wire here to connect input"
                      className="
                        absolute -left-2.5 top-1/2 -translate-y-1/2
                        w-5 h-5 rounded-full bg-slate-950 border-2 border-slate-400
                        hover:border-sky-400 hover:scale-125 transition-all cursor-crosshair
                        flex items-center justify-center
                      "
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    </div>
                  )}

                  {/* Right Output Port */}
                  <div
                    onPointerDown={(e) => handleOutputPortPointerDown(e, node)}
                    title="Drag from here to connect to another node"
                    className="
                      absolute -right-2.5 top-1/2 -translate-y-1/2
                      w-5 h-5 rounded-full bg-slate-950 border-2 border-sky-400
                      hover:bg-sky-500/20 hover:scale-125 transition-all cursor-crosshair
                      flex items-center justify-center
                    "
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  </div>

                  {/* Card Body */}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{node.icon}</span>
                        <span className="text-xs font-bold text-white truncate">
                          {node.name}
                        </span>
                      </div>

                      {node.lastStatus === 'success' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                          ✓ OK
                        </span>
                      )}
                      {node.lastStatus === 'running' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 animate-pulse shrink-0">
                          ...
                        </span>
                      )}
                      {node.lastStatus === 'error' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">
                          ERR
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {firstConfigValue}
                    </div>

                    {node.lastOutput && (
                      <div className="text-[10px] text-emerald-300/90 bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-2 py-1 truncate">
                        {node.lastOutput}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT INSPECTOR DRAWER (Only visible when a node is selected) */}
        {selectedNode && activeWorkflow && (
          <aside className="w-80 shrink-0 bg-slate-900/95 border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto z-10">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{selectedNode.icon}</span>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Node Settings
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {selectedNode.n8nType}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  ✕
                </button>
              </div>

              {/* Node Name */}
              <div className="text-xs space-y-1">
                <label className="block text-slate-400 font-medium">Node Label</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => {
                    const updated: SavedWorkflow = {
                      ...activeWorkflow,
                      nodes: activeWorkflow.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, name: e.target.value } : n
                      ),
                    };
                    saveWorkflowToBackend(updated, true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold"
                />
              </div>

              {/* Dynamic Node Config Fields */}
              {(selectedTemplate?.fields ||
                Object.keys(selectedNode.config).map((k) => ({
                  key: k,
                  label: k,
                  type: 'text' as const,
                  placeholder: undefined as string | undefined,
                  options: undefined as Array<{ label: string; value: string }> | undefined,
                }))
              ).map((field) => (
                <div key={field.key} className="text-xs space-y-1">
                  <label className="block text-slate-400 font-medium">{field.label}</label>

                  {field.type === 'select' && field.options ? (
                    <select
                      value={selectedNode.config[field.key] || ''}
                      onChange={(e) => {
                        const updated: SavedWorkflow = {
                          ...activeWorkflow,
                          nodes: activeWorkflow.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? {
                                  ...n,
                                  config: { ...n.config, [field.key]: e.target.value },
                                }
                              : n
                          ),
                        };
                        saveWorkflowToBackend(updated, true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      rows={4}
                      value={selectedNode.config[field.key] || ''}
                      placeholder={field.placeholder}
                      onChange={(e) => {
                        const updated: SavedWorkflow = {
                          ...activeWorkflow,
                          nodes: activeWorkflow.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? {
                                  ...n,
                                  config: { ...n.config, [field.key]: e.target.value },
                                }
                              : n
                          ),
                        };
                        saveWorkflowToBackend(updated, true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        list={field.key === 'entityId' ? 'ha-entities-list' : undefined}
                        value={selectedNode.config[field.key] || ''}
                        placeholder={field.placeholder}
                        onChange={(e) => {
                          const updated: SavedWorkflow = {
                            ...activeWorkflow,
                            nodes: activeWorkflow.nodes.map((n) =>
                              n.id === selectedNode.id
                                ? {
                                    ...n,
                                    config: { ...n.config, [field.key]: e.target.value },
                                  }
                                : n
                            ),
                          };
                          saveWorkflowToBackend(updated, true);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                      />
                      {field.key === 'entityId' && haEntities.length > 0 && (
                        <datalist id="ha-entities-list">
                          {haEntities.map((ent) => (
                            <option key={ent.entityId} value={ent.entityId}>
                              {ent.friendlyName} ({ent.state})
                            </option>
                          ))}
                        </datalist>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Test Single Node Button */}
              <button
                onClick={() => handleTestSingleNode(selectedNode)}
                disabled={testingNodeId === selectedNode.id}
                className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer transition-all"
              >
                {testingNodeId === selectedNode.id ? 'Testing Node...' : '▶ Test This Node'}
              </button>

              {/* Last Output Box */}
              {selectedNode.lastOutput && (
                <div className="space-y-1 pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Last Node Output:
                  </span>
                  <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {selectedNode.lastOutput}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={handleDeleteSelectedNode}
                className="w-full py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer"
              >
                🗑 Delete Node
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* SIMPLE API KEYS MODAL */}
      {showKeysModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">🔑 API Connections</h3>
              <button
                onClick={() => setShowKeysModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            {credentialsStatus && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  ✨ Gemini: {credentialsStatus.geminiConfigured ? '✅ Ready' : '⚪ Local Mode'}
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  🐙 GitHub: {credentialsStatus.githubConfigured ? '✅ Token Set' : '✅ Public API'}
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  📧 Gmail/Cal: {credentialsStatus.googleConfigured ? '✅ OAuth Set' : '⚪ Sandbox'}
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  🏠 Home Assistant: {credentialsStatus.haConfigured ? '✅ Connected' : '✅ Ready'}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveApiKeys} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Gemini API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">GitHub Personal Access Token</label>
                <input
                  type="password"
                  placeholder="ghp_..."
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Google OAuth Access Token (Gmail & Calendar)
                </label>
                <input
                  type="password"
                  placeholder="ya29...."
                  value={googleToken}
                  onChange={(e) => setGoogleToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeysModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold"
                >
                  Save Keys
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIMPLE CUSTOM NODE CREATOR MODAL */}
      {showCustomNodeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">🧩 Create Custom n8n Node</h3>
              <button
                onClick={() => setShowCustomNodeModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCustomNode} className="space-y-3 text-xs">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Icon</label>
                  <input
                    type="text"
                    value={customNodeIcon}
                    onChange={(e) => setCustomNodeIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-slate-400 mb-1">Node Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Telegram Bot Notify"
                    value={customNodeName}
                    onChange={(e) => setCustomNodeName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Short Description</label>
                <input
                  type="text"
                  placeholder="Sends message via webhook"
                  value={customNodeSubtitle}
                  onChange={(e) => setCustomNodeSubtitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Default API Endpoint</label>
                <input
                  type="text"
                  value={customNodeEndpoint}
                  onChange={(e) => setCustomNodeEndpoint(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomNodeModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold"
                >
                  Add to Palette
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
