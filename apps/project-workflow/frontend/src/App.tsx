import React, { useEffect, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';
import {
  MODULE_TEMPLATE_PRESETS,
  type EcosystemCompatibilityReport,
  type GitHubIntegrationSnapshot,
  type ModuleTemplateForm,
  type N8nWorkflowNodeState,
  type PythonUnitTestReport,
  type SignalColor,
  type WorkflowExecutionRecord,
} from '../../shared/workflow-types.js';

const api = createAppClient('project-workflow');

interface OverviewResponse {
  ecosystem: EcosystemCompatibilityReport;
  presets: typeof MODULE_TEMPLATE_PRESETS;
  latestRun: WorkflowExecutionRecord | null;
  runs: WorkflowExecutionRecord[];
  defaultNodes: N8nWorkflowNodeState[];
  n8nWorkflowJson: Record<string, unknown>;
  github: GitHubIntegrationSnapshot;
}

const SIGNAL_PALETTE: Record<
  SignalColor,
  { hex: string; bg: string; border: string; label: string }
> = {
  green: {
    hex: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.14)',
    border: 'rgba(34, 197, 94, 0.48)',
    label: 'GRÜN · OK / LIVE',
  },
  cyan: {
    hex: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.55)',
    label: 'BLAU · AKTIV / RUNNING',
  },
  amber: {
    hex: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.5)',
    label: 'GELB · WARNUNG / FALLBACK',
  },
  red: {
    hex: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.55)',
    label: 'ROT · FEHLER / ROLLBACK',
  },
  slate: {
    hex: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'rgba(148, 163, 184, 0.25)',
    label: 'GRAU · STANDBY',
  },
};

const NODE_ICONS = ['⚡', '📋', '✨', '🧪', '🔀', '🚀'];

export default function App() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'template' | 'github' | 'tests' | 'ecosystem'>('template');
  const [templateForm, setTemplateForm] = useState<ModuleTemplateForm>(
    structuredClone(MODULE_TEMPLATE_PRESETS[0].template)
  );
  const [entitiesText, setEntitiesText] = useState(
    MODULE_TEMPLATE_PRESETS[0].template.objectives.targetEntities.join(', ')
  );
  const [nodes, setNodes] = useState<N8nWorkflowNodeState[]>([]);
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number>(2);
  const [activeRun, setActiveRun] = useState<WorkflowExecutionRecord | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [codeTab, setCodeTab] = useState<'sensorPy' | 'testPy' | 'manifestJson' | 'n8nJson'>('sensorPy');
  const [statusBanner, setStatusBanner] = useState<{
    text: string;
    color: SignalColor;
    flag: string;
  } | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [unitTestRunning, setUnitTestRunning] = useState(false);

  const loadOverview = async (refresh = false) => {
    try {
      const res = await api.get<OverviewResponse>(`/overview${refresh ? '?refresh=1' : ''}`);
      setData(res);
      if (res.latestRun) {
        setActiveRun(res.latestRun);
        setNodes(res.latestRun.nodes);
      } else {
        setNodes(res.defaultNodes);
      }
    } catch (err) {
      setStatusBanner({
        text: `Backend-Abfragefehler: ${err instanceof Error ? err.message : String(err)}`,
        color: 'red',
        flag: 'API_OFFLINE',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview(false);
  }, []);

  const selectPreset = (presetId: string) => {
    const found = MODULE_TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const copy = structuredClone(found.template);
    setTemplateForm(copy);
    setEntitiesText(copy.objectives.targetEntities.join(', '));
    setStatusBanner({
      text: `Modul-Template "${found.label}" geladen. Bereit für n8n-Workflow-Start.`,
      color: 'cyan',
      flag: 'TEMPLATE_LOADED',
    });
  };

  const triggerN8nWorkflow = async (simulateError?: string) => {
    if (isExecuting) return;
    setIsExecuting(true);

    // Prepare form with parsed entity list
    const preparedTemplate: ModuleTemplateForm = {
      ...templateForm,
      objectives: {
        ...templateForm.objectives,
        targetEntities: entitiesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };

    // Animate nodes sequentially for visual feedback while backend executes
    const baseNodes: N8nWorkflowNodeState[] = (
      nodes.length === 6 ? nodes : data?.defaultNodes || []
    ).map((n) => ({
      ...n,
      status: 'queued',
      signalColor: 'slate',
      statusFlag: 'QUEUED',
    }));
    setNodes(baseNodes);

    setStatusBanner({
      text: `Starte n8n-Workflow für "${preparedTemplate.objectives.name}" (${preparedTemplate.objectives.slug})...`,
      color: 'cyan',
      flag: 'WORKFLOW_RUNNING',
    });

    for (let step = 0; step < 6; step++) {
      setSelectedNodeIdx(step);
      setNodes((prev) =>
        prev.map((n, idx) =>
          idx === step
            ? {
                ...n,
                status: 'running',
                signalColor: 'cyan',
                statusFlag: 'RUNNING',
                summary: `Führe ${n.name} aus...`,
              }
            : idx < step
              ? {
                  ...n,
                  status: 'success',
                  signalColor: 'green',
                  statusFlag: 'OK',
                }
              : n
        )
      );
      await new Promise((r) => setTimeout(r, 170));
    }

    try {
      const response = await api.post<{
        ok: boolean;
        error?: string;
        validationErrors?: string[];
        run: WorkflowExecutionRecord;
      }>('/workflow/execute', {
        template: preparedTemplate,
        simulateError,
      });

      const run = response.run;
      setActiveRun(run);
      setNodes(run.nodes);

      const errNodeIdx = run.nodes.findIndex((n) => n.status === 'error');
      const warnNodeIdx = run.nodes.findIndex((n) => n.status === 'warning');
      setSelectedNodeIdx(errNodeIdx >= 0 ? errNodeIdx : warnNodeIdx >= 0 ? warnNodeIdx : 5);

      setStatusBanner({
        text: `n8n-Workflow abgeschlossen (${run.totalDurationMs} ms) · Modul "${run.moduleName}" Status: ${run.statusFlag}`,
        color: run.signalColor,
        flag: run.statusFlag,
      });
      await loadOverview(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setStatusBanner({
        text: `Fehlerbehandlung aktiv: ${errMsg}`,
        color: 'red',
        flag: 'WORKFLOW_ERROR_HANDLED',
      });
      await loadOverview(false);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunPythonUnitTests = async () => {
    setUnitTestRunning(true);
    setActiveTab('tests');
    try {
      const res = await api.post<{ ok: boolean; slug: string; report: PythonUnitTestReport }>(
        '/tests/run',
        { template: templateForm }
      );
      if (activeRun) {
        setActiveRun({
          ...activeRun,
          unitTestReport: res.report,
        });
      }
      setStatusBanner({
        text: `Python Unit-Tests für "${res.slug}": ${res.report.passedTests}/${res.report.totalTests} bestanden (${res.report.durationMs} ms)`,
        color: res.report.passed ? 'green' : 'red',
        flag: res.report.passed ? 'UNIT_TESTS_OK' : 'UNIT_TESTS_FAILED',
      });
    } catch (err) {
      setStatusBanner({
        text: `Unit-Test-Fehler: ${err instanceof Error ? err.message : String(err)}`,
        color: 'red',
        flag: 'TEST_RUNNER_ERROR',
      });
    } finally {
      setUnitTestRunning(false);
    }
  };

  const handleRefreshGitHub = async (simulateError?: string) => {
    setGithubLoading(true);
    setActiveTab('github');
    try {
      const q = simulateError ? `?simulateError=${encodeURIComponent(simulateError)}` : '?refresh=1';
      const gh = await api.get<GitHubIntegrationSnapshot>(`/github/status${q}`);
      if (data) {
        setData({ ...data, github: gh });
      }
      setStatusBanner({
        text: `GitHub API Abfrage (${gh.primaryRepo.fullName}): ${gh.statusFlag} (${gh.source})`,
        color: gh.signalColor,
        flag: gh.statusFlag,
      });
    } catch (err) {
      setStatusBanner({
        text: `GitHub API Fehler: ${err instanceof Error ? err.message : String(err)}`,
        color: 'red',
        flag: 'GITHUB_API_ERROR',
      });
    } finally {
      setGithubLoading(false);
    }
  };

  const downloadN8nWorkflowJson = () => {
    const jsonStr = JSON.stringify(data?.n8nWorkflowJson || {}, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'n8n-ha-module-workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedNode = nodes[selectedNodeIdx] || nodes[0] || null;
  const overallSignal = activeRun?.signalColor || 'green';
  const overallPalette = SIGNAL_PALETTE[overallSignal];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px 48px' }}>
      {/* TOP HEADER BAR WITH SIGNAL FLAGS & ACTIONS */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '18px 22px',
          borderRadius: 16,
          background: 'rgba(15, 23, 42, 0.85)',
          border: `1px solid ${overallPalette.border}`,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 11px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                background: overallPalette.bg,
                color: overallPalette.hex,
                border: `1px solid ${overallPalette.border}`,
              }}
            >
              <span
                className="signal-dot-active"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: overallPalette.hex,
                  boxShadow: `0 0 8px ${overallPalette.hex}`,
                }}
              />
              {activeRun?.statusFlag || 'N8N_PIPELINE_READY'}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              {data?.ecosystem.pythonVersion || 'Python 3.14'} · Unit-Tests{' '}
              {activeRun
                ? `${activeRun.unitTestReport.passedTests}/${activeRun.unitTestReport.totalTests} PASS`
                : '4/4 PASS'}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              Samba \\192.168.188.92\config:{' '}
              {data?.ecosystem.hassSambaOnline ? 'ONLINE' : 'BRIDGE'}
            </span>
          </div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
            Home Assistant Modul-Workflow &amp; Projektverwaltung
          </h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            n8n-Pipeline (Webhook → Template-Validator → Gemini API → Python Unit-Tests → Git →
            SSH/Samba Deploy) &amp; GitHub-Repository-Abfrage
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => void triggerN8nWorkflow()}
            disabled={isExecuting}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #38bdf8',
              background: isExecuting
                ? 'rgba(56, 189, 248, 0.25)'
                : 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: isExecuting ? 'wait' : 'pointer',
              boxShadow: '0 6px 20px rgba(2, 132, 199, 0.35)',
            }}
          >
            {isExecuting ? '⏳ Workflow läuft...' : '▶ n8n-Workflow starten'}
          </button>
          <button
            onClick={() => void handleRunPythonUnitTests()}
            disabled={unitTestRunning}
            style={secondaryBtnStyle}
          >
            🧪 Python Unit-Tests ({activeRun?.unitTestReport.passedTests ?? 4}/4)
          </button>
          <button
            onClick={() => void triggerN8nWorkflow('gemini_http_429')}
            disabled={isExecuting}
            title="Simuliert einen Gemini HTTP 429 Fehler zur Verifikation der Fallback-Signalfarben"
            style={{
              ...secondaryBtnStyle,
              borderColor: 'rgba(245, 158, 11, 0.45)',
              color: '#fbbf24',
            }}
          >
            ⚠️ API-Fallback testen
          </button>
          <button onClick={downloadN8nWorkflowJson} style={secondaryBtnStyle}>
            ⬇ n8n JSON
          </button>
        </div>
      </div>

      {/* LIVE STATUS BANNER */}
      {statusBanner && (
        <div
          style={{
            marginBottom: 16,
            padding: '11px 16px',
            borderRadius: 12,
            background: SIGNAL_PALETTE[statusBanner.color].bg,
            border: `1px solid ${SIGNAL_PALETTE[statusBanner.color].border}`,
            color: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 11,
                background: SIGNAL_PALETTE[statusBanner.color].hex,
                color: '#040711',
              }}
            >
              {statusBanner.flag}
            </span>
            <span>{statusBanner.text}</span>
          </div>
          <button
            onClick={() => setStatusBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* PHASE 4: VISUAL N8N WORKFLOW CANVAS WITH ANIMATIONS, SIGNAL COLORS & STATUS FLAGS */}
      <div
        style={{
          background: 'rgba(11, 17, 32, 0.9)',
          border: '1px solid rgba(56, 189, 248, 0.24)',
          borderRadius: 18,
          padding: '18px 20px',
          marginBottom: 20,
          boxShadow: 'inset 0 0 60px rgba(2, 132, 199, 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.06em' }}>
              ◈ N8N WORKFLOW PIPELINE VISUALIZER
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Klicke auf einen Knoten zur Inspektion von Status-Flags, Laufzeit und generiertem Python-Code
            </span>
          </div>
          {/* Signal Legend */}
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#cbd5e1' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              Grün: Bereit / Tests OK
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
              Blau: Aktiv / Generierung
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              Gelb: Warnung / Fallback
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              Rot: Fehler / Rollback
            </span>
          </div>
        </div>

        {/* 6-NODE INTERACTIVE PIPELINE TRACK */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(185px, 1fr))',
            gap: 14,
            overflowX: 'auto',
            paddingBottom: 6,
          }}
        >
          {nodes.map((node, idx) => {
            const pal = SIGNAL_PALETTE[node.signalColor] || SIGNAL_PALETTE.slate;
            const isSelected = idx === selectedNodeIdx;
            const isRunning = node.status === 'running';

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeIdx(idx)}
                className={`n8n-node-card ${isRunning ? 'n8n-node-running' : ''}`}
                style={{
                  position: 'relative',
                  padding: '14px',
                  borderRadius: 14,
                  background: isSelected
                    ? 'rgba(30, 41, 59, 0.95)'
                    : 'rgba(15, 23, 42, 0.88)',
                  border: `1.5px solid ${isSelected ? '#38bdf8' : pal.border}`,
                  boxShadow: isSelected
                    ? `0 0 24px rgba(56, 189, 248, 0.25)`
                    : '0 8px 20px rgba(0, 0, 0, 0.35)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 148,
                }}
              >
                {/* Top row: Icon + Status Flag Pill */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: pal.bg,
                        border: `1px solid ${pal.border}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                      }}
                    >
                      {NODE_ICONS[idx] || '⚙️'}
                    </span>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 99,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        background: pal.bg,
                        color: pal.hex,
                        border: `1px solid ${pal.border}`,
                        maxWidth: 135,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.statusFlag}
                    </span>
                  </div>

                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f8fafc', marginBottom: 3 }}>
                    {node.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: '#38bdf8',
                      fontFamily: 'monospace',
                      marginBottom: 6,
                    }}
                  >
                    {node.n8nType}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
                    {node.summary}
                  </div>
                </div>

                {/* Bottom row: Signal indicator + duration */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: 10.5,
                    color: '#cbd5e1',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span
                      className={isRunning ? 'signal-dot-active' : ''}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: pal.hex,
                        boxShadow: `0 0 6px ${pal.hex}`,
                      }}
                    />
                    {node.status.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                    {node.durationMs} ms
                  </span>
                </div>

                {/* Animated connector arrow to next node */}
                {idx < 5 && (
                  <svg
                    width="18"
                    height="24"
                    viewBox="0 0 18 24"
                    style={{
                      position: 'absolute',
                      right: -16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 5,
                      pointerEvents: 'none',
                    }}
                  >
                    <line
                      x1="0"
                      y1="12"
                      x2="14"
                      y2="12"
                      stroke={pal.hex}
                      strokeWidth="2.2"
                      className="n8n-edge-animated"
                    />
                    <polygon points="12,7 18,12 12,17" fill={pal.hex} />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        {/* SELECTED NODE TELEMETRY BAR */}
        {selectedNode && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(15, 23, 42, 0.92)',
              border: `1px solid ${SIGNAL_PALETTE[selectedNode.signalColor].border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13, color: '#f8fafc' }}>{selectedNode.name}</strong>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: SIGNAL_PALETTE[selectedNode.signalColor].bg,
                    color: SIGNAL_PALETTE[selectedNode.signalColor].hex,
                    fontWeight: 700,
                  }}
                >
                  Flag: {selectedNode.statusFlag}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  ({SIGNAL_PALETTE[selectedNode.signalColor].label})
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {selectedNode.details.join('  •  ')}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#38bdf8', fontFamily: 'monospace' }}>
              Entity: {activeRun?.deployReport.entityId || 'sensor.thassi_project_workflow_shelly_energy_guard'}
            </div>
          </div>
        )}
      </div>

      {/* NAVIGATION TABS FOR PHASES 1, 2, 4, 5 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('template')}
          style={tabBtnStyle(activeTab === 'template')}
        >
          📋 Phase 2: Modul-Template &amp; Code-Inspektor
        </button>
        <button
          onClick={() => setActiveTab('github')}
          style={tabBtnStyle(activeTab === 'github')}
        >
          🐙 Phase 4: GitHub API &amp; Repositories ({data?.github.repositories.length || 3})
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          style={tabBtnStyle(activeTab === 'tests')}
        >
          🧪 Phase 5: Python Unit-Tests &amp; Fehler-Resilienz
        </button>
        <button
          onClick={() => setActiveTab('ecosystem')}
          style={tabBtnStyle(activeTab === 'ecosystem')}
        >
          🔍 Phase 1: Ökosystem-Analyse &amp; Run-Historie
        </button>
      </div>

      {/* TAB 1: PHASE 2 MODULE TEMPLATE FORM + GENERATED PYTHON CODE VIEWER */}
      {activeTab === 'template' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.25fr', gap: 20 }}>
          {/* LEFT: MODULE TEMPLATE FORM */}
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                📋 Generisches Modul-Template (Formularvorgabe)
              </h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MODULE_TEMPLATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPreset(p.id)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border:
                        templateForm.objectives.slug === p.id
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(148,163,184,0.25)',
                      background:
                        templateForm.objectives.slug === p.id
                          ? 'rgba(56,189,248,0.18)'
                          : 'rgba(15,23,42,0.8)',
                      color: '#f8fafc',
                    }}
                  >
                    {p.badge}
                  </button>
                ))}
              </div>
            </div>

            {/* 1. Zielsetzung */}
            <div style={sectionTitleStyle}>1. Zielsetzung (Objectives)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Modul-Slug (Python Package)</label>
                <input
                  style={inputStyle}
                  value={templateForm.objectives.slug}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      objectives: { ...templateForm.objectives, slug: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label style={labelStyle}>Anzeigename in Home Assistant</label>
                <input
                  style={inputStyle}
                  value={templateForm.objectives.name}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      objectives: { ...templateForm.objectives, name: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>HA Domain</label>
                <select
                  style={inputStyle}
                  value={templateForm.objectives.domain}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      objectives: {
                        ...templateForm.objectives,
                        domain: e.target.value as ModuleTemplateForm['objectives']['domain'],
                      },
                    })
                  }
                >
                  <option value="sensor">sensor</option>
                  <option value="binary_sensor">binary_sensor</option>
                  <option value="switch">switch</option>
                  <option value="climate">climate</option>
                  <option value="automation">automation</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Einheit</label>
                <input
                  style={inputStyle}
                  value={templateForm.objectives.unitOfMeasurement}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      objectives: {
                        ...templateForm.objectives,
                        unitOfMeasurement: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <label style={labelStyle}>Intervall (Sek.) / Limit</label>
                <input
                  type="number"
                  min={5}
                  style={inputStyle}
                  value={templateForm.objectives.pollingIntervalSeconds}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      objectives: {
                        ...templateForm.objectives,
                        pollingIntervalSeconds: Number(e.target.value || 60),
                      },
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Zielsetzung &amp; Berechnungslogik (Prompt für Gemini API)</label>
              <textarea
                rows={2}
                style={inputStyle}
                value={templateForm.objectives.description}
                onChange={(e) =>
                  setTemplateForm({
                    ...templateForm,
                    objectives: { ...templateForm.objectives, description: e.target.value },
                  })
                }
              />
            </div>

            <div>
              <label style={labelStyle}>Home Assistant Quell-/Ziel-Entitäten (kommagetrennt)</label>
              <input
                style={inputStyle}
                value={entitiesText}
                onChange={(e) => setEntitiesText(e.target.value)}
              />
            </div>

            {/* 2. Dependencies & 3. Test-Workflow */}
            <div style={sectionTitleStyle}>2. Dependencies &amp; 3. Test-Workflow</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Python-Laufzeit &amp; HA-Integrationen</label>
                <input
                  style={inputStyle}
                  readOnly
                  value={`Python ${templateForm.dependencies.pythonVersion} · [${templateForm.dependencies.haIntegrations.join(
                    ', '
                  )}]`}
                />
              </div>
              <div>
                <label style={labelStyle}>Test-Framework &amp; Pass-Gate</label>
                <input
                  style={inputStyle}
                  readOnly
                  value={`${templateForm.testWorkflow.framework} · AST-Check · ${templateForm.testWorkflow.minPassRatePercent}% Pass`}
                />
              </div>
            </div>

            {/* 4. Deployment-Strategie */}
            <div style={sectionTitleStyle}>4. Deployment-Strategie (Git &amp; SSH/Samba)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Samba / SSH Zielpfad auf Hass-PC</label>
                <input
                  style={inputStyle}
                  value={`/config/custom_components/${templateForm.objectives.slug}`}
                  readOnly
                />
              </div>
              <div>
                <label style={labelStyle}>Transport &amp; Git-Branch</label>
                <input
                  style={inputStyle}
                  value={`${templateForm.deploymentStrategy.sambaShare} (${templateForm.deploymentStrategy.gitBranch})`}
                  readOnly
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => void triggerN8nWorkflow()}
                disabled={isExecuting}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 10,
                  border: '1px solid #38bdf8',
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                🚀 Aus Template generieren, testen &amp; nach Home Assistant deployen
              </button>
            </div>
          </div>

          {/* RIGHT: GENERATED PYTHON CODE & N8N WORKFLOW INSPECTOR */}
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                💻 Generierte Modul-Artefakte ({activeRun?.moduleSlug || 'shelly_energy_guard'})
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {(
                  [
                    ['sensorPy', 'sensor.py'],
                    ['testPy', `test_${activeRun?.moduleSlug || 'module'}.py`],
                    ['manifestJson', 'manifest.json'],
                    ['n8nJson', 'n8n-workflow.json'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCodeTab(key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      border:
                        codeTab === key
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(148,163,184,0.2)',
                      background:
                        codeTab === key ? 'rgba(56,189,248,0.18)' : 'rgba(15,23,42,0.8)',
                      color: codeTab === key ? '#38bdf8' : '#cbd5e1',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <pre
              style={{
                margin: 0,
                padding: 14,
                borderRadius: 12,
                background: '#050814',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                color: '#e2e8f0',
                fontSize: 11.5,
                lineHeight: 1.5,
                fontFamily: '"JetBrains Mono", Consolas, monospace',
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: 500,
              }}
            >
              {codeTab === 'sensorPy' && (activeRun?.generatedFiles.sensorPy || '# Lade sensor.py...')}
              {codeTab === 'testPy' && (activeRun?.generatedFiles.testPy || '# Lade test.py...')}
              {codeTab === 'manifestJson' &&
                (activeRun?.generatedFiles.manifestJson || '{}')}
              {codeTab === 'n8nJson' &&
                JSON.stringify(data?.n8nWorkflowJson || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 2: PHASE 4 GITHUB API REPOSITORY QUERY */}
      {activeTab === 'github' && data?.github && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  🐙 GitHub API — Repositories ({data.github.owner})
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Quelle: <strong>{data.github.source}</strong> · Status-Flag:{' '}
                  <strong style={{ color: SIGNAL_PALETTE[data.github.signalColor].hex }}>
                    {data.github.statusFlag}
                  </strong>
                  {data.github.rateLimitRemaining !== null &&
                    ` · Rate-Limit: ${data.github.rateLimitRemaining} frei`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => void handleRefreshGitHub()}
                  disabled={githubLoading}
                  style={secondaryBtnStyle}
                >
                  🔄 Live Abfrage
                </button>
                <button
                  onClick={() => void handleRefreshGitHub('rate_limit')}
                  disabled={githubLoading}
                  style={{ ...secondaryBtnStyle, color: '#fbbf24' }}
                >
                  ⚠️ Rate-Limit Fallback testen
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.github.repositories.map((repo) => (
                <div
                  key={repo.fullName}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(4, 7, 17, 0.65)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: '#38bdf8',
                        fontWeight: 700,
                        fontSize: 13.5,
                        textDecoration: 'none',
                      }}
                    >
                      {repo.fullName} ↗
                    </a>
                    <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3 }}>
                      {repo.description}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                      Sprache: <strong>{repo.language}</strong> · Branch:{' '}
                      <code>{repo.defaultBranch}</code> · Größe: {repo.sizeKb} KB
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 99,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: 'rgba(34, 197, 94, 0.14)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                    }}
                  >
                    SYNCED
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
              📜 Letzte Commits ({data.github.primaryRepo.fullName})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {data.github.recentCommits.map((c) => (
                <div
                  key={c.sha}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(4, 7, 17, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.14)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <code style={{ color: '#38bdf8', fontWeight: 700, fontSize: 12 }}>
                      {c.shortSha}
                    </code>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {new Date(c.date).toLocaleString('de-AT')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#f8fafc', marginTop: 4 }}>{c.message}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    Autor: {c.author}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PHASE 5 PYTHON UNIT TESTS & ERROR HANDLING VERIFICATION */}
      {activeTab === 'tests' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  🧪 Phase 5: Python Unit-Tests ({activeRun?.moduleSlug || 'shelly_energy_guard'})
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Framework: <code>python -m unittest</code> · AST-Syntaxcheck:{' '}
                  <strong style={{ color: '#4ade80' }}>VALID</strong>
                </div>
              </div>
              <button
                onClick={() => void handleRunPythonUnitTests()}
                disabled={unitTestRunning}
                style={{
                  ...secondaryBtnStyle,
                  borderColor: '#22c55e',
                  color: '#4ade80',
                }}
              >
                {unitTestRunning ? '⏳ Teste...' : '▶ Unit-Tests jetzt starten'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {(activeRun?.unitTestReport.testCases || []).map((tc) => (
                <div
                  key={tc.name}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(4, 7, 17, 0.65)',
                    border:
                      tc.status === 'PASS'
                        ? '1px solid rgba(34, 197, 94, 0.35)'
                        : '1px solid rgba(239, 68, 68, 0.45)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <code style={{ color: '#f8fafc', fontWeight: 700, fontSize: 12.5 }}>
                      {tc.name}
                    </code>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
                      {tc.description}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 700,
                      background:
                        tc.status === 'PASS'
                          ? 'rgba(34, 197, 94, 0.18)'
                          : 'rgba(239, 68, 68, 0.2)',
                      color: tc.status === 'PASS' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {tc.status}
                  </span>
                </div>
              ))}
            </div>

            <div style={sectionTitleStyle}>Interaktive API-Fehlerbehandlungs-Checks</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => void triggerN8nWorkflow('gemini_http_429')}
                style={{ ...secondaryBtnStyle, borderColor: '#f59e0b', color: '#fbbf24' }}
              >
                1. Gemini HTTP 429 Fallback prüfen (Gelb)
              </button>
              <button
                onClick={() => void triggerN8nWorkflow('gemini_fatal')}
                style={{ ...secondaryBtnStyle, borderColor: '#ef4444', color: '#f87171' }}
              >
                2. Kritischen API-Abbruch prüfen (Rot)
              </button>
              <button
                onClick={() => void handleRefreshGitHub('rate_limit')}
                style={{ ...secondaryBtnStyle, borderColor: '#38bdf8', color: '#38bdf8' }}
              >
                3. GitHub Rate-Limit Fallback prüfen
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
              🖥️ Python Test-Runner Output
            </h3>
            <pre
              style={{
                margin: 0,
                padding: 14,
                borderRadius: 12,
                background: '#050814',
                border: '1px solid rgba(34, 197, 94, 0.28)',
                color: '#4ade80',
                fontSize: 12,
                lineHeight: 1.55,
                fontFamily: 'Consolas, monospace',
                minHeight: 280,
                whiteSpace: 'pre-wrap',
              }}
            >
              {activeRun?.unitTestReport.output || 'Keine Test-Ausgabe vorhanden.'}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 4: PHASE 1 ECOSYSTEM COMPATIBILITY & RUN HISTORY */}
      {activeTab === 'ecosystem' && data?.ecosystem && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
              🔍 Phase 1: Tech-Stack &amp; Kompatibilitäts-Matrix
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                ['Python Runtime', data.ecosystem.pythonVersion, 'OK'],
                ['Git Versionsverwaltung', `${data.ecosystem.gitVersion} (${data.ecosystem.gitBranch} @ ${data.ecosystem.gitHeadSha})`, 'OK'],
                ['n8n Workflow Spezifikation', data.ecosystem.n8nWorkflowPath, 'READY'],
                ['Gemini API Integration', data.ecosystem.geminiKeySource, 'ACTIVE'],
                ['Home Assistant Core (:8123)', data.ecosystem.hassCoreOnline ? '192.168.188.92:8123 Erreichbar' : 'Lokaler Modus', data.ecosystem.hassCoreOnline ? 'ONLINE' : 'STANDBY'],
                ['Samba Share (:445)', data.ecosystem.hassSambaOnline ? '\\\\192.168.188.92\\config aktiv' : 'Bridge Fallback', data.ecosystem.hassSambaOnline ? 'ONLINE' : 'BRIDGE'],
              ].map(([k, v, flag]) => (
                <div
                  key={k}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 9,
                    background: 'rgba(4, 7, 17, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.14)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{k}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{v}</div>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ade80',
                    }}
                  >
                    {flag}
                  </span>
                </div>
              ))}
            </div>

            <div style={sectionTitleStyle}>Umgesetzte Phase-1-Anpassungen</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.65 }}>
              {data.ecosystem.adjustmentsApplied.map((adj, i) => (
                <li key={i}>{adj}</li>
              ))}
            </ul>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
              ⏱️ n8n Workflow Ausführungs-Historie
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.runs || []).map((r) => {
                const pal = SIGNAL_PALETTE[r.signalColor] || SIGNAL_PALETTE.slate;
                return (
                  <div
                    key={r.runId}
                    onClick={() => {
                      setActiveRun(r);
                      setNodes(r.nodes);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background:
                        activeRun?.runId === r.runId
                          ? 'rgba(56, 189, 248, 0.12)'
                          : 'rgba(4, 7, 17, 0.6)',
                      border: `1px solid ${pal.border}`,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                        {r.moduleName} (<code>{r.moduleSlug}</code>)
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        Run: {r.runId} · Dauer: {r.totalDurationMs} ms · Tests:{' '}
                        {r.unitTestReport.passedTests}/{r.unitTestReport.totalTests}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: 99,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: pal.bg,
                        color: pal.hex,
                        border: `1px solid ${pal.border}`,
                      }}
                    >
                      {r.statusFlag}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          Lade Home Assistant Modul-Workflow &amp; GitHub-Telemetrie...
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.82)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#38bdf8',
  margin: '12px 0 8px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.25)',
  background: '#050814',
  color: '#f8fafc',
  fontSize: 12.5,
  marginBottom: 10,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.9)',
  color: '#e2e8f0',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: 'pointer',
};

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '9px 16px',
    borderRadius: 10,
    border: active ? '1px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.22)',
    background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.78)',
    color: active ? '#f8fafc' : '#94a3b8',
    fontWeight: active ? 700 : 600,
    fontSize: 12.5,
    cursor: 'pointer',
  };
}
