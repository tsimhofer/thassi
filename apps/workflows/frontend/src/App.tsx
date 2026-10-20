import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';
import type {
  SavedWorkflow,
  CanvasWorkflowNode,
  ApiCredentialsStatus,
  WorkflowRunReport,
  NodeExecutionResult,
} from '../../shared/types.js';

const API_BASE = `${getHostBaseUrl()}/api/apps/workflows`;

interface AxonFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

interface AxonItem {
  id: string;
  name: string;
  domainCode: string;
  category: string;
  description: string;
  fields: AxonFieldSchema[];
  defaultInput: Record<string, string>;
  lastStatus?: 'success' | 'error' | 'idle';
  lastDurationMs?: number | null;
  lastExecutedAt?: string | null;
  lastSummary?: string | null;
  totalRuns?: number;
}

interface AxonExecutionResponse {
  actionId: string;
  axonId: string;
  status: 'success' | 'error';
  durationMs: number;
  executedAt: string;
  summary: string;
  data: unknown;
}

interface HaEntityOption {
  entityId: string;
  friendlyName: string;
  state: string;
}

const DOMAIN_FILTERS: Array<{ code: string; label: string }> = [
  { code: 'ALL', label: 'All' },
  { code: 'PC', label: 'Developer PC' },
  { code: 'HA', label: 'Home Assistant' },
  { code: 'MARKET', label: 'Supermarkets & EAN' },
  { code: 'ENERGY', label: 'Energy & Fuel' },
  { code: 'NET', label: 'Network' },
  { code: 'MEDIA', label: 'Media' },
  { code: 'YT', label: 'YouTube' },
  { code: 'MAPS', label: 'Maps & Routes' },
  { code: 'GCAL', label: 'Calendar' },
  { code: 'FIT', label: 'Health & Fit' },
  { code: 'GMAIL', label: 'Gmail' },
  { code: 'DRIVE', label: 'Drive' },
  { code: 'FIN', label: 'Finance' },
  { code: 'MEALS', label: 'Nutrition' },
  { code: '3DP', label: '3D Print' },
  { code: 'VISION', label: 'Vision' },
  { code: 'WX', label: 'Weather' },
  { code: 'GH', label: 'GitHub' },
  { code: 'AI', label: 'Gemini' },
  { code: 'HTTP', label: 'HTTP' },
  { code: 'SYS', label: 'System' },
];

const GLOBAL_CSS = `
  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-focus: rgba(255, 255, 255, 0.22);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --dot-idle: #3f3f46;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    background-color: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    user-select: text !important;
  }

  .tabular {
    font-variant-numeric: tabular-nums;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .axon-row {
    display: grid;
    grid-template-columns: 72px 230px 1fr 140px;
    align-items: center;
    height: 44px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line-hairline);
    cursor: pointer;
    transition: background-color 80ms ease;
    gap: 16px;
  }

  .axon-row:hover {
    background-color: var(--bg-elevated);
  }

  .axon-row.selected {
    background-color: var(--bg-elevated);
  }

  .domain-tab {
    background: none;
    border: none;
    border-bottom: 1px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    padding: 10px 0;
    cursor: pointer;
    white-space: nowrap;
    margin-bottom: -1px;
  }

  .domain-tab:hover {
    color: var(--text-secondary);
  }

  .domain-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .field-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    padding: 7px 10px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
  }

  .field-input:focus {
    border-color: var(--line-focus);
  }

  .btn-primary {
    background: #fafafa;
    color: #09090b;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-primary:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    padding: 5px 12px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    height: 30px;
    display: inline-flex;
    align-items: center;
  }

  .btn-ghost:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  @media (max-width: 1024px) {
    .main-split {
      grid-template-columns: 1fr !important;
    }
    .axon-row {
      grid-template-columns: 56px 170px 1fr 80px;
    }
  }
`;

export default function App() {
  const [axons, setAxons] = useState<AxonItem[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [credentialsStatus, setCredentialsStatus] = useState<ApiCredentialsStatus | null>(null);
  const [haEntities, setHaEntities] = useState<HaEntityOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Navigation & Filters
  const [activeView, setActiveView] = useState<'axons' | 'chains' | 'credentials'>('axons');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Axon & Inspector State
  const [selectedAxonId, setSelectedAxonId] = useState<string>('ha.get_state');
  const [axonInputs, setAxonInputs] = useState<Record<string, Record<string, string>>>({});
  const [upstreamText, setUpstreamText] = useState<string>('');
  const [executingAxon, setExecutingAxon] = useState<boolean>(false);
  const [lastExecution, setLastExecution] = useState<Record<string, AxonExecutionResponse>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Chains (Workflows) State
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [runningChain, setRunningChain] = useState<boolean>(false);
  const [chainReport, setChainReport] = useState<WorkflowRunReport | null>(null);

  // Credentials State
  const [geminiKey, setGeminiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [googleToken, setGoogleToken] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bootstrap`);
      const data = await res.json();
      const loadedAxons: AxonItem[] = data.axons || [];
      setAxons(loadedAxons);

      // Initialize default inputs for each axon
      setAxonInputs((prev) => {
        const next = { ...prev };
        for (const a of loadedAxons) {
          if (!next[a.id]) {
            next[a.id] = { ...(a.defaultInput || {}) };
          }
        }
        return next;
      });

      const wfList: SavedWorkflow[] = data.workflows || [];
      setWorkflows(wfList);
      setSelectedChainId((prev) => prev || wfList[0]?.id || null);
      setCredentialsStatus(data.credentialsStatus || null);
      setHaEntities(data.haEntities || []);
    } catch (err) {
      console.error('Failed to load Axons bootstrap:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const filteredAxons = useMemo(() => {
    return axons.filter((a) => {
      if (domainFilter !== 'ALL' && a.domainCode !== domainFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.domainCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [axons, domainFilter, searchQuery]);

  const selectedAxon = useMemo(
    () => axons.find((a) => a.id === selectedAxonId) || filteredAxons[0] || null,
    [axons, selectedAxonId, filteredAxons]
  );

  const handleInputChange = (axonId: string, key: string, value: string) => {
    setAxonInputs((prev) => ({
      ...prev,
      [axonId]: {
        ...(prev[axonId] || {}),
        [key]: value,
      },
    }));
  };

  const handleExecuteAxon = async (axon: AxonItem) => {
    setExecutingAxon(true);
    try {
      const currentInput = axonInputs[axon.id] || axon.defaultInput || {};
      const res = await fetch(`${API_BASE}/execute-axon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          axonId: axon.id,
          input: currentInput,
          upstreamText: upstreamText || undefined,
        }),
      });
      const payload = await res.json();
      if (payload.result) {
        setLastExecution((prev) => ({ ...prev, [axon.id]: payload.result }));
      }
      if (Array.isArray(payload.axons)) {
        setAxons(payload.axons);
      }
    } catch (err) {
      console.error('Error executing axon:', err);
    } finally {
      setExecutingAxon(false);
    }
  };

  const handleRunChain = async (wf: SavedWorkflow) => {
    setRunningChain(true);
    try {
      const res = await fetch(`${API_BASE}/execute-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: wf }),
      });
      const data = await res.json();
      if (data.report) {
        setChainReport(data.report);
      }
      await loadBootstrap();
    } finally {
      setRunningChain(false);
    }
  };

  const handleAddNodeToChain = async (wf: SavedWorkflow, axon: AxonItem) => {
    const newNode: CanvasWorkflowNode = {
      id: `node_${Date.now()}`,
      typeId: axon.id,
      name: axon.name,
      subtitle: axon.id,
      category: (axon.category as any) || 'custom',
      icon: axon.domainCode,
      accentColor: '#fafafa',
      n8nType: `axon.${axon.id}`,
      x: 120 + wf.nodes.length * 220,
      y: 160,
      config: { ...(axonInputs[axon.id] || axon.defaultInput || {}) },
    };
    const prevLast = wf.nodes[wf.nodes.length - 1];
    const updatedEdges = prevLast
      ? [
          ...(wf.edges || []),
          {
            id: `edge_${Date.now()}`,
            sourceNodeId: prevLast.id,
            targetNodeId: newNode.id,
          },
        ]
      : wf.edges || [];

    const updatedWf: SavedWorkflow = {
      ...wf,
      nodes: [...wf.nodes, newNode],
      edges: updatedEdges,
    };

    const res = await fetch(`${API_BASE}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: updatedWf }),
    });
    const data = await res.json();
    if (data.workflows) {
      setWorkflows(data.workflows);
    }
  };

  const handleRemoveNodeFromChain = async (wf: SavedWorkflow, nodeId: string) => {
    const updatedWf: SavedWorkflow = {
      ...wf,
      nodes: wf.nodes.filter((n) => n.id !== nodeId),
      edges: (wf.edges || []).filter(
        (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
      ),
    };
    const res = await fetch(`${API_BASE}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: updatedWf }),
    });
    const data = await res.json();
    if (data.workflows) {
      setWorkflows(data.workflows);
    }
  };

  const handleSaveCredentials = async () => {
    setSavingCreds(true);
    try {
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
      if (data.credentialsStatus) {
        setCredentialsStatus(data.credentialsStatus);
      }
      setGeminiKey('');
      setGithubToken('');
      setGoogleToken('');
    } finally {
      setSavingCreds(false);
    }
  };

  const copyJson = (id: string, value: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: axons.length };
    for (const a of axons) {
      counts[a.domainCode] = (counts[a.domainCode] || 0) + 1;
    }
    return counts;
  }, [axons]);

  const totalExecutions = useMemo(
    () => axons.reduce((sum, a) => sum + (a.totalRuns || 0), 0),
    [axons]
  );

  const selectedChain = useMemo(
    () => workflows.find((w) => w.id === selectedChainId) || workflows[0] || null,
    [workflows, selectedChainId]
  );

  const activeExec = selectedAxon ? lastExecution[selectedAxon.id] : undefined;

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 48px' }}>
      <style>{GLOBAL_CSS}</style>

      {/* 1. HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingBottom: 24,
          borderBottom: '1px solid var(--line-hairline)',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Axons
          </h1>
          <span
            className="tabular"
            style={{ fontSize: 12.5, color: 'var(--text-muted)' }}
          >
            {axons.length} Connectors · {Object.keys(domainCounts).length - 1} Domains ·{' '}
            {totalExecutions} Runs · {haEntities.length > 0 ? 'HA Connected' : 'HA Standby'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <nav style={{ display: 'flex', gap: 20 }}>
            {(
              [
                { id: 'axons', label: 'Catalog & Inspector' },
                { id: 'chains', label: `Chains (${workflows.length})` },
                { id: 'credentials', label: 'Credentials' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color:
                    activeView === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeView === 'axons' && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter axons..."
              className="field-input"
              style={{ width: 220, height: 30 }}
            />
          )}
        </div>
      </header>

      {/* ===================================================================== */}
      {/* VIEW 1: AXON CATALOG & INSPECTOR */}
      {/* ===================================================================== */}
      {activeView === 'axons' && (
        <>
          {/* DOMAIN FILTER STRIP */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              borderBottom: '1px solid var(--line-hairline)',
              overflowX: 'auto',
            }}
          >
            {DOMAIN_FILTERS.filter((df) => df.code === 'ALL' || domainCounts[df.code]).map(
              (df) => (
                <button
                  key={df.code}
                  className={`domain-tab ${domainFilter === df.code ? 'active' : ''}`}
                  onClick={() => setDomainFilter(df.code)}
                >
                  {df.label}{' '}
                  <span
                    className="tabular"
                    style={{ color: 'var(--text-muted)', marginLeft: 4 }}
                  >
                    {domainCounts[df.code] || 0}
                  </span>
                </button>
              )
            )}
          </div>

          {/* MASTER-DETAIL SPLIT */}
          <div
            className="main-split"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 440px',
              minHeight: 'calc(100vh - 160px)',
            }}
          >
            {/* LEFT: AXON TABLE */}
            <div style={{ paddingRight: 32, paddingTop: 16 }}>
              {/* COLUMN HEADERS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '72px 230px 1fr 140px',
                  padding: '0 12px 8px 12px',
                  borderBottom: '1px solid var(--line-hairline)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  gap: 16,
                }}
              >
                <span>Domain</span>
                <span>Axon ID</span>
                <span>Function / Output</span>
                <span style={{ textAlign: 'right' }}>Latency</span>
              </div>

              {loading ? (
                <div style={{ padding: '32px 12px', color: 'var(--text-muted)' }}>
                  Loading Axons...
                </div>
              ) : filteredAxons.length === 0 ? (
                <div style={{ padding: '32px 12px', color: 'var(--text-muted)' }}>
                  No matching Axons.
                </div>
              ) : (
                filteredAxons.map((axon) => {
                  const isSelected = selectedAxon?.id === axon.id;
                  const statusColor =
                    axon.lastStatus === 'success'
                      ? 'var(--dot-ok)'
                      : axon.lastStatus === 'error'
                        ? 'var(--dot-err)'
                        : 'var(--dot-idle)';

                  return (
                    <div
                      key={axon.id}
                      className={`axon-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedAxonId(axon.id)}
                    >
                      {/* Col 1: Status dot + Domain Code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {axon.domainCode}
                        </span>
                      </div>

                      {/* Col 2: Technical Axon ID */}
                      <div
                        className="mono"
                        style={{
                          fontSize: 12.5,
                          color: isSelected
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {axon.id}
                      </div>

                      {/* Col 3: Name & Last Summary or Description */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 10,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            flexShrink: 0,
                          }}
                        >
                          {axon.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {axon.lastSummary || axon.description}
                        </span>
                      </div>

                      {/* Col 4: Latency & Run Count */}
                      <div
                        className="tabular mono"
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          textAlign: 'right',
                        }}
                      >
                        {axon.lastDurationMs != null ? `${axon.lastDurationMs} ms` : '—'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT: INSPECTOR PANEL */}
            <aside
              style={{
                borderLeft: '1px solid var(--line-hairline)',
                paddingLeft: 32,
                paddingTop: 16,
                position: 'sticky',
                top: 16,
                alignSelf: 'start',
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
              }}
            >
              {selectedAxon ? (
                <div>
                  {/* Axon Header */}
                  <div
                    style={{
                      paddingBottom: 16,
                      borderBottom: '1px solid var(--line-hairline)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 12, color: 'var(--text-muted)' }}
                      >
                        {selectedAxon.id}
                      </span>
                      <span
                        className="tabular mono"
                        style={{ fontSize: 11, color: 'var(--text-muted)' }}
                      >
                        {selectedAxon.totalRuns || 0} runs
                      </span>
                    </div>
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      {selectedAxon.name}
                    </h2>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      {selectedAxon.description}
                    </p>
                  </div>

                  {selectedAxon.domainCode === 'PC' && <PcBridgeKvmWidget />}

                  {/* Parameters Form */}
                  <div
                    style={{
                      padding: '16px 0',
                      borderBottom: '1px solid var(--line-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Parameters
                    </div>

                    {selectedAxon.fields.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                        No input parameters required.
                      </div>
                    ) : (
                      selectedAxon.fields.map((field) => {
                        const val =
                          axonInputs[selectedAxon.id]?.[field.key] ??
                          selectedAxon.defaultInput?.[field.key] ??
                          '';
                        return (
                          <div key={field.key}>
                            <label
                              style={{
                                display: 'block',
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                marginBottom: 4,
                              }}
                            >
                              {field.label}{' '}
                              <span
                                className="mono"
                                style={{ fontSize: 11, color: 'var(--text-muted)' }}
                              >
                                ({field.key})
                              </span>
                            </label>
                            {field.type === 'select' && field.options ? (
                              <select
                                className="field-input"
                                value={val}
                                onChange={(e) =>
                                  handleInputChange(
                                    selectedAxon.id,
                                    field.key,
                                    e.target.value
                                  )
                                }
                              >
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === 'textarea' ? (
                              <textarea
                                className="field-input"
                                rows={3}
                                value={val}
                                placeholder={field.placeholder}
                                onChange={(e) =>
                                  handleInputChange(
                                    selectedAxon.id,
                                    field.key,
                                    e.target.value
                                  )
                                }
                              />
                            ) : (
                              <input
                                type="text"
                                className="field-input"
                                list={
                                  field.key === 'entityId' ? 'ha-entities-datalist' : undefined
                                }
                                value={val}
                                placeholder={field.placeholder}
                                onChange={(e) =>
                                  handleInputChange(
                                    selectedAxon.id,
                                    field.key,
                                    e.target.value
                                  )
                                }
                              />
                            )}
                          </div>
                        );
                      })
                    )}

                    <datalist id="ha-entities-datalist">
                      {haEntities.map((ent) => (
                        <option key={ent.entityId} value={ent.entityId}>
                          {ent.friendlyName} ({ent.state})
                        </option>
                      ))}
                    </datalist>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        gap: 8,
                      }}
                    >
                      <button
                        className="btn-primary"
                        disabled={executingAxon}
                        onClick={() => handleExecuteAxon(selectedAxon)}
                      >
                        {executingAxon ? 'Executing...' : 'Execute Axon'}
                      </button>

                      {selectedChain && (
                        <button
                          className="btn-ghost"
                          onClick={() => handleAddNodeToChain(selectedChain, selectedAxon)}
                          title={`Append to chain "${selectedChain.name}"`}
                        >
                          + Append to Chain
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Execution Output */}
                  <div style={{ paddingTop: 16 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Output Payload
                      </span>
                      {activeExec && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            className="tabular mono"
                            style={{
                              fontSize: 11,
                              color:
                                activeExec.status === 'success'
                                  ? 'var(--dot-ok)'
                                  : 'var(--dot-err)',
                            }}
                          >
                            {activeExec.status.toUpperCase()} · {activeExec.durationMs} ms
                          </span>
                          <button
                            onClick={() => copyJson(selectedAxon.id, activeExec.data)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            {copiedId === selectedAxon.id ? 'Copied' : 'Copy JSON'}
                          </button>
                        </div>
                      )}
                    </div>

                    {activeExec ? (
                      <div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text-primary)',
                            paddingBottom: 10,
                            marginBottom: 10,
                            borderBottom: '1px solid var(--line-hairline)',
                          }}
                        >
                          {activeExec.summary}
                        </div>
                        <pre
                          className="mono"
                          style={{
                            fontSize: 11.5,
                            lineHeight: 1.55,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-elevated)',
                            padding: 12,
                            borderRadius: 4,
                            overflowX: 'auto',
                            maxHeight: 420,
                            overflowY: 'auto',
                          }}
                        >
                          {JSON.stringify(activeExec.data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                        Click &ldquo;Execute Axon&rdquo; to query live data.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: AXON CHAINS (TOPOLOGICAL PIPELINES) */}
      {/* ===================================================================== */}
      {activeView === 'chains' && (
        <div style={{ paddingTop: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 16,
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            <div style={{ display: 'flex', gap: 24 }}>
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => setSelectedChainId(wf.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color:
                      selectedChain?.id === wf.id
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {wf.name}
                </button>
              ))}
            </div>

            {selectedChain && (
              <button
                className="btn-primary"
                disabled={runningChain}
                onClick={() => handleRunChain(selectedChain)}
              >
                {runningChain ? 'Running Chain...' : 'Execute Chain'}
              </button>
            )}
          </div>

          {selectedChain && (
            <div style={{ paddingTop: 16 }}>
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  marginBottom: 16,
                }}
              >
                {selectedChain.description}
              </p>

              {/* Sequence Table */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 220px 240px 1fr 80px',
                  padding: '0 12px 8px 12px',
                  borderBottom: '1px solid var(--line-hairline)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  gap: 16,
                }}
              >
                <span>Step</span>
                <span>Axon ID</span>
                <span>Label</span>
                <span>Parameters / Result</span>
                <span style={{ textAlign: 'right' }}>Action</span>
              </div>

              {selectedChain.nodes.map((node, index) => {
                const stepResult: NodeExecutionResult | undefined =
                  chainReport?.workflowId === selectedChain.id
                    ? chainReport.nodeResults[node.id]
                    : undefined;

                return (
                  <div
                    key={node.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '48px 220px 240px 1fr 80px',
                      alignItems: 'center',
                      padding: '12px',
                      borderBottom: '1px solid var(--line-hairline)',
                      gap: 16,
                    }}
                  >
                    <span
                      className="tabular mono"
                      style={{ fontSize: 12, color: 'var(--text-muted)' }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span
                      className="mono"
                      style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}
                    >
                      {node.typeId}
                    </span>

                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {node.name}
                    </span>

                    <div
                      className="mono"
                      style={{
                        fontSize: 12,
                        color: stepResult
                          ? stepResult.status === 'success'
                            ? 'var(--text-primary)'
                            : 'var(--dot-err)'
                          : 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stepResult
                        ? `${stepResult.outputSummary} (${stepResult.durationMs} ms)`
                        : JSON.stringify(node.config)}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleRemoveNodeFromChain(selectedChain, node.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: CREDENTIALS & TOKENS */}
      {/* ===================================================================== */}
      {activeView === 'credentials' && (
        <div style={{ maxWidth: 560, paddingTop: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              paddingBottom: 12,
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            Shared Connector Credentials
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              paddingTop: 16,
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  Google Gemini API Key
                </label>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: credentialsStatus?.geminiConfigured
                      ? 'var(--dot-ok)'
                      : 'var(--text-muted)',
                  }}
                >
                  {credentialsStatus?.geminiConfigured ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>
              <input
                type="password"
                className="field-input"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  GitHub Personal Access Token
                </label>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: credentialsStatus?.githubConfigured
                      ? 'var(--dot-ok)'
                      : 'var(--text-muted)',
                  }}
                >
                  {credentialsStatus?.githubConfigured ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>
              <input
                type="password"
                className="field-input"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  Google OAuth2 Access Token Override (optional)
                </label>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: credentialsStatus?.googleConfigured
                      ? 'var(--dot-ok)'
                      : 'var(--text-muted)',
                  }}
                >
                  {credentialsStatus?.googleConfigured ? 'AUTHORIZED' : 'NOT SET'}
                </span>
              </div>
              <input
                type="password"
                className="field-input"
                value={googleToken}
                onChange={(e) => setGoogleToken(e.target.value)}
                placeholder="ya29..."
              />
            </div>

            <div style={{ paddingTop: 8 }}>
              <button
                className="btn-primary"
                disabled={savingCreds}
                onClick={handleSaveCredentials}
              >
                {savingCreds ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PcBridgeKvmWidget() {
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<string>('primary');
  const [keyText, setKeyText] = useState<string>('');
  const [status, setStatus] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/pc-bridge/frame`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data.frameDataUrl) setFrameDataUrl(data.frameDataUrl);
        if (data.status) setStatus(data.status);
        if (data.requestedMonitor) setMonitor(data.requestedMonitor);
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 750);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const switchMonitor = async (m: string) => {
    setMonitor(m);
    await fetch(`${API_BASE}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setMonitor: m }),
    }).catch(() => {});
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normalizedY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    await fetch(`${API_BASE}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'click',
        monitor,
        normalizedX,
        normalizedY,
      }),
    }).catch(() => {});
  };

  const handleSendText = async () => {
    if (!keyText) return;
    const txt = keyText;
    setKeyText('');
    await fetch(`${API_BASE}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', monitor, text: txt }),
    }).catch(() => {});
  };

  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: '1px solid var(--line-hairline)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Interactive Web-VNC · {status?.hostname || 'DESKTOP-M8TJERB'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'primary', label: 'Center' },
            { id: '0', label: 'Right' },
            { id: '1', label: 'Left' },
            { id: 'all', label: 'All 3' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => switchMonitor(m.id)}
              className="mono"
              style={{
                background: monitor === m.id ? 'var(--text-primary)' : 'var(--bg-input)',
                color: monitor === m.id ? 'var(--bg-canvas)' : 'var(--text-secondary)',
                border: '1px solid var(--line-hairline)',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 10.5,
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {frameDataUrl ? (
        <img
          src={frameDataUrl}
          onClick={handleImageClick}
          alt="Live PC Screen Mirror"
          title="Click anywhere to send mouse click to DESKTOP-M8TJERB"
          style={{
            width: '100%',
            borderRadius: 4,
            border: '1px solid var(--line-hairline)',
            display: 'block',
            cursor: 'crosshair',
            background: '#050506',
          }}
        />
      ) : (
        <div
          className="mono"
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            fontSize: 11.5,
            color: 'var(--text-muted)',
            border: '1px solid var(--line-hairline)',
            borderRadius: 4,
          }}
        >
          Syncing live frame from DESKTOP-M8TJERB...
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          type="text"
          className="field-input"
          value={keyText}
          onChange={(e) => setKeyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSendText();
            }
          }}
          placeholder="Type text / PIN to PC + Enter..."
          style={{ flex: 1, padding: '5px 8px', fontSize: 11.5 }}
        />
        <button
          className="btn-ghost"
          onClick={handleSendText}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
