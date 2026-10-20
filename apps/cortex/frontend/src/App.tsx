import React, { useEffect, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('cortex');

type ResponsePattern =
  | 'SYNTHESIS_BRIEF'
  | 'ACTION_PLAN'
  | 'KNOWLEDGE_EXTRACT'
  | 'DECISION_MATRIX'
  | 'DATA_TABLE';

interface CortexBlueprint {
  id: string;
  name: string;
  code: string;
  description: string;
  promptTemplate: string;
  contextScopes: string[];
  responsePattern: ResponsePattern;
  autoExecuteAxons: boolean;
  autoSaveToMemo: boolean;
}

interface ProposedAxonCall {
  axonId: string;
  reason: string;
  input: Record<string, any>;
  executed?: boolean;
  status?: 'success' | 'error';
  resultSummary?: string;
}

interface ContextBlock {
  scope: string;
  summary: string;
  content: string;
}

interface CortexRunResult {
  runId: number;
  modelUsed: string;
  responsePattern: ResponsePattern;
  durationMs: number;
  contextBlocks: ContextBlock[];
  responseText: string;
  proposedActions: ProposedAxonCall[];
  savedMemoSummary?: string | null;
  createdAt: string;
}

interface CortexRunHistoryRow {
  id: number;
  blueprint_id: string;
  prompt: string;
  topic_query: string;
  context_scopes: string;
  response_pattern: ResponsePattern;
  model_used: string;
  enriched_context: string;
  response_text: string;
  proposed_actions_json: string;
  duration_ms: number;
  created_at: string;
}

const CONTEXT_SCOPE_OPTIONS = [
  { id: 'memo', code: 'MEMO', label: 'Memo (Drive / .md / DB)' },
  { id: 'ha', code: 'HA', label: 'Home Assistant Live' },
  { id: 'calendar', code: 'GCAL', label: 'Google Calendar' },
  { id: 'finance', code: 'FIN', label: 'Finanzen & Ledger' },
  { id: 'health', code: 'FIT', label: 'Health & Biometrics' },
  { id: 'meals', code: 'MEALS', label: 'Meal Planner' },
  { id: 'pc', code: 'PC', label: 'Workstation PC' },
  { id: 'energy', code: 'ENERGY', label: 'EPEX Spot (aWATTar)' },
];

const RESPONSE_PATTERNS: Array<{
  id: ResponsePattern;
  code: string;
  label: string;
  hint: string;
}> = [
  {
    id: 'SYNTHESIS_BRIEF',
    code: 'BRIEF',
    label: 'Executive Dossier',
    hint: 'Kernaussage, Fakten aus Live-Daten & nächste Schritte',
  },
  {
    id: 'ACTION_PLAN',
    code: 'AGENT',
    label: 'Quasi-Agentischer Axon-Plan',
    hint: 'Generiert ausführbare Thassi Axon-Aufrufe (HA, PC, Kalender, Memo)',
  },
  {
    id: 'KNOWLEDGE_EXTRACT',
    code: 'EXTRACT',
    label: 'Wissens-Kristallisator',
    hint: 'Extrahiert strukturierte Fakten & Markdown für Memo',
  },
  {
    id: 'DECISION_MATRIX',
    code: 'MATRIX',
    label: 'Entscheidungs-Matrix',
    hint: 'Quantitativer Optionen-Vergleich mit Empfehlung',
  },
  {
    id: 'DATA_TABLE',
    code: 'TABLE',
    label: 'Tabellen-Synthese',
    hint: 'Präzise Markdown-Datentabelle mit Kennzahlen',
  },
];

const CORTEX_STYLES = `
  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --bg-btn: #17171a;
    --bg-btn-hover: #202025;
    --bg-btn-on: #1f2128;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-btn: rgba(255, 255, 255, 0.14);
    --line-btn-on: rgba(255, 255, 255, 0.36);
    --line-focus: rgba(255, 255, 255, 0.24);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .tactile-btn {
    background: var(--bg-btn);
    color: var(--text-secondary);
    border: 1px solid var(--line-btn);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.35);
    border-radius: 5px;
    padding: 6px 13px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: transform 70ms ease, background 110ms ease, border-color 110ms ease, color 110ms ease;
  }

  .tactile-btn:hover:not(:disabled) {
    background: var(--bg-btn-hover);
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  .tactile-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
  }

  .tactile-btn.active {
    background: var(--bg-btn-on);
    color: var(--text-primary);
    border-color: var(--line-btn-on);
  }

  .tactile-btn.primary {
    background: var(--text-primary);
    color: var(--bg-canvas);
    border-color: var(--text-primary);
  }

  .tactile-btn.primary:hover:not(:disabled) {
    background: #e4e4e7;
    color: var(--bg-canvas);
  }

  .cortex-input {
    background: var(--bg-input);
    border: 1px solid var(--line-btn);
    border-radius: 4px;
    padding: 7px 11px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
    width: 100%;
  }

  .cortex-input:focus {
    border-color: var(--line-focus);
  }

  .bp-row {
    display: grid;
    grid-template-columns: 82px 1fr 90px;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line-hairline);
    cursor: pointer;
    transition: background 90ms ease;
  }

  .bp-row:hover {
    background: var(--bg-elevated);
  }

  .bp-row.selected {
    background: #151519;
    border-left: 2px solid var(--text-primary);
    padding-left: 10px;
  }

  @media (max-width: 1024px) {
    .cortex-split {
      grid-template-columns: 1fr !important;
    }
  }
`;

export default function App() {
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [geminiKeyPreview, setGeminiKeyPreview] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');

  const [blueprints, setBlueprints] = useState<CortexBlueprint[]>([]);
  const [selectedBpId, setSelectedBpId] = useState<string>('daily-executive-brief');
  const [runs, setRuns] = useState<CortexRunHistoryRow[]>([]);

  // Active Composer State
  const [prompt, setPrompt] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [contextScopes, setContextScopes] = useState<string[]>([
    'memo',
    'calendar',
    'ha',
    'finance',
    'pc',
  ]);
  const [responsePattern, setResponsePattern] = useState<ResponsePattern>('SYNTHESIS_BRIEF');
  const [model, setModel] = useState<string>('gemini-3.8-flash');
  const [autoExecuteAxons, setAutoExecuteAxons] = useState<boolean>(false);
  const [autoSaveToMemo, setAutoSaveToMemo] = useState<boolean>(false);

  // Active Execution Result
  const [running, setRunning] = useState<boolean>(false);
  const [activeResult, setActiveResult] = useState<CortexRunResult | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'output' | 'context' | 'history'>('output');
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const selectBlueprint = (bp: CortexBlueprint, customTopic?: string) => {
    setSelectedBpId(bp.id);
    setPrompt(bp.promptTemplate);
    setContextScopes(bp.contextScopes);
    setResponsePattern(bp.responsePattern);
    setAutoExecuteAxons(bp.autoExecuteAxons);
    setAutoSaveToMemo(bp.autoSaveToMemo);
    if (customTopic !== undefined) {
      setTopic(customTopic);
    }
  };

  const loadBootstrap = async () => {
    try {
      const data = await api.get<{
        geminiConfigured: boolean;
        geminiKeyPreview: string | null;
        blueprints: CortexBlueprint[];
        runs: CortexRunHistoryRow[];
      }>('/bootstrap');
      setGeminiConfigured(data.geminiConfigured);
      setGeminiKeyPreview(data.geminiKeyPreview);
      setBlueprints(data.blueprints || []);
      setRuns(data.runs || []);

      const params = new URLSearchParams(window.location.search);
      const urlTopic = params.get('topic') || '';
      if (urlTopic && data.blueprints?.length) {
        const memoBp =
          data.blueprints.find((b) => b.id === 'memo-deep-research') || data.blueprints[0];
        selectBlueprint(memoBp, urlTopic);
      } else if (data.blueprints?.length && !prompt) {
        selectBlueprint(data.blueprints[0]);
      }

      if (data.runs?.length > 0 && !activeResult) {
        const latest = data.runs[0];
        let parsedActions: ProposedAxonCall[] = [];
        try {
          parsedActions = JSON.parse(latest.proposed_actions_json || '[]');
        } catch {}
        setActiveResult({
          runId: latest.id,
          modelUsed: latest.model_used,
          responsePattern: latest.response_pattern,
          durationMs: latest.duration_ms,
          contextBlocks: latest.enriched_context
            ? [{ scope: latest.context_scopes.toUpperCase(), summary: 'Gespeicherter Kontext', content: latest.enriched_context }]
            : [],
          responseText: latest.response_text,
          proposedActions: parsedActions,
          createdAt: latest.created_at,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadBootstrap();
  }, []);

  const toggleScope = (scopeId: string) => {
    setContextScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleRunCortex = async () => {
    if (running) return;
    setRunning(true);
    setInspectorTab('output');
    try {
      const res = await api.post<CortexRunResult>('/run', {
        blueprintId: selectedBpId,
        prompt,
        topic,
        contextScopes,
        responsePattern,
        model,
        autoExecuteAxons,
        autoSaveToMemo,
      });
      setActiveResult(res);
      notify(`Cortex abgeschlossen (${res.durationMs} ms · ${res.modelUsed})`);
      await loadBootstrap();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleExecuteProposedAxon = async (idx: number, action: ProposedAxonCall) => {
    try {
      const res = await api.post<{
        ok: boolean;
        status: 'success' | 'error';
        summary: string;
      }>('/execute-action', {
        axonId: action.axonId,
        input: action.input,
      });
      notify(`${action.axonId}: ${res.summary}`);
      if (activeResult) {
        const updated = [...activeResult.proposedActions];
        updated[idx] = {
          ...action,
          executed: true,
          status: res.status,
          resultSummary: res.summary,
        };
        setActiveResult({ ...activeResult, proposedActions: updated });
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveOutputToMemo = async () => {
    if (!activeResult) return;
    try {
      const title =
        activeResult.responseText.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
        topic ||
        `Cortex ${activeResult.responsePattern} (${new Date().toLocaleDateString('de-AT')})`;
      const res = await api.post<{ summary: string }>('/execute-action', {
        axonId: 'memo.note.upsert',
        input: {
          title,
          content: activeResult.responseText,
          tags: `cortex,${activeResult.responsePattern.toLowerCase()}`,
          saveAsMarkdownFile: 'true',
        },
      });
      notify(res.summary);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveBlueprint = async () => {
    const bpName = window.prompt('Name für diese Spezial-Anfrage (Blueprint):', topic || 'Neue Cortex-Anfrage');
    if (!bpName) return;
    try {
      await api.post('/blueprints', {
        name: bpName,
        code: responsePattern.slice(0, 6),
        description: `Scopes: ${contextScopes.join(', ')} · Pattern: ${responsePattern}`,
        promptTemplate: prompt,
        contextScopes,
        responsePattern,
        autoExecuteAxons,
        autoSaveToMemo,
      });
      notify(`Spezial-Anfrage "${bpName}" gespeichert`);
      await loadBootstrap();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    try {
      await api.post('/config', { geminiApiKey: apiKeyInput.trim() });
      setApiKeyInput('');
      setShowKeyModal(false);
      notify('Gemini API Key gespeichert');
      await loadBootstrap();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '32px 48px', maxWidth: 1440 }}>
      <style>{CORTEX_STYLES}</style>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#141417',
            border: '1px solid var(--line-focus)',
            color: 'var(--text-primary)',
            padding: '8px 14px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      {/* HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--line-hairline)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Cortex
          </h1>
          <span
            style={{
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: geminiConfigured ? 'var(--dot-ok)' : 'var(--dot-warn)',
                display: 'inline-block',
              }}
            />
            {geminiConfigured
              ? `Google Gemini API verbunden (${geminiKeyPreview || 'Auto-Discovered'})`
              : 'Gemini API Key fehlt'}{' '}
            · {blueprints.length} Spezial-Anfragen · {runs.length} Ausführungen
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="cortex-input"
            style={{ width: 175 }}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gemini-3.8-flash">gemini-3.8-flash</option>
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
          </select>
          <button className="tactile-btn" onClick={() => setShowKeyModal(!showKeyModal)}>
            API Key
          </button>
          <button
            className="tactile-btn"
            onClick={() => {
              window.location.href = '/apps/memo/';
            }}
          >
            Zu Memo ↗
          </button>
        </div>
      </header>

      {showKeyModal && (
        <form
          onSubmit={handleSaveApiKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 14,
            marginBottom: 20,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line-btn)',
            borderRadius: 5,
          }}
        >
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            GEMINI_API_KEY:
          </span>
          <input
            className="cortex-input"
            type="password"
            placeholder="AIzaSy..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <button type="submit" className="tactile-btn primary">
            Speichern
          </button>
        </form>
      )}

      {/* MASTER-DETAIL SPLIT */}
      <div
        className="cortex-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1.05fr) minmax(460px, 1.35fr)',
          gap: 36,
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: BLUEPRINTS, CONTEXT INJECTORS, PATTERN & PROMPT COMPOSER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 1. SPEZIAL-ANFRAGEN (BLUEPRINTS) */}
          <section>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 8,
                borderBottom: '1px solid var(--line-hairline)',
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
                1. SPEZIAL-ANFRAGEN (VORLAGEN)
              </span>
              <button className="tactile-btn" style={{ padding: '3px 9px', fontSize: 11 }} onClick={handleSaveBlueprint}>
                + Als Vorlage sichern
              </button>
            </div>

            {blueprints.map((bp) => {
              const isSel = selectedBpId === bp.id;
              return (
                <div
                  key={bp.id}
                  className={`bp-row ${isSel ? 'selected' : ''}`}
                  onClick={() => selectBlueprint(bp)}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isSel ? 'var(--text-primary)' : 'var(--dot-ok)',
                      }}
                    />
                    {bp.code}
                  </span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {bp.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {bp.description}
                    </div>
                  </div>
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {bp.contextScopes.length} Quellen
                  </span>
                </div>
              );
            })}
          </section>

          {/* 2. LOKALE DATEN-ANREICHERUNG (CONTEXT SCOPES) */}
          <section>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 10,
              }}
            >
              2. LOKALE DATEN-ANREICHERUNG (LIVE-KONTEXT INJEKTION)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CONTEXT_SCOPE_OPTIONS.map((sc) => {
                const active = contextScopes.includes(sc.id);
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className={`tactile-btn ${active ? 'active' : ''}`}
                    onClick={() => toggleScope(sc.id)}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: active ? 'var(--dot-ok)' : 'var(--text-muted)',
                      }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{sc.code}</span>
                    <span>{sc.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. GEZIELTES ANTWORT-MUSTER (RESPONSE PATTERN) */}
          <section>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 10,
              }}
            >
              3. ANTWORT-MUSTER & AGENTEN-MODUS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {RESPONSE_PATTERNS.map((pat) => {
                const active = responsePattern === pat.id;
                return (
                  <button
                    key={pat.id}
                    type="button"
                    className={`tactile-btn ${active ? 'active' : ''}`}
                    onClick={() => setResponsePattern(pat.id)}
                    title={pat.hint}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{pat.code}</span>
                    <span>{pat.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {RESPONSE_PATTERNS.find((p) => p.id === responsePattern)?.hint}
            </div>
          </section>

          {/* 4. FOKUS-THEMA & PROMPT COMPOSER */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                FOKUS-THEMA / SUCHBEGRIFF FÜR MEMO ({'{{topic}}'})
              </label>
              <input
                className="cortex-input"
                placeholder="z.B. BambuLab X1C, Stromverbrauch, Büro Licht, Monatsbudget..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                ANWEISUNG / PROMPT AN GEMINI
              </label>
              <textarea
                className="cortex-input"
                rows={5}
                style={{ lineHeight: 1.55, resize: 'vertical' }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                paddingTop: 4,
              }}
            >
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoExecuteAxons}
                    onChange={(e) => setAutoExecuteAxons(e.target.checked)}
                  />
                  Vorgeschlagene Axons sofort ausführen
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoSaveToMemo}
                    onChange={(e) => setAutoSaveToMemo(e.target.checked)}
                  />
                  Antwort als .md in Memo speichern
                </label>
              </div>

              <button
                className="tactile-btn primary"
                style={{ padding: '8px 18px', fontSize: 12.5 }}
                onClick={() => void handleRunCortex()}
                disabled={running}
              >
                {running ? 'Reichere Daten an & frage Gemini...' : 'Mit Live-Daten ausführen'}
              </button>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: STRUCTURED RESPONSE, QUASI-AGENTIC AXON ACTIONS & CONTEXT INSPECTOR */}
        <aside
          style={{
            borderLeft: '1px solid var(--line-hairline)',
            paddingLeft: 32,
            minHeight: 580,
          }}
        >
          {/* Inspector Sub-Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--line-hairline)',
              paddingBottom: 10,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { id: 'output', label: 'GEMINI ANTWORT & AKTIONEN' },
                {
                  id: 'context',
                  label: `INJIZIERTER KONTEXT (${activeResult?.contextBlocks?.length || 0})`,
                },
                { id: 'history', label: `VERLAUF (${runs.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setInspectorTab(t.id as 'output' | 'context' | 'history')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    color:
                      inspectorTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeResult && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="tactile-btn"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => {
                    void navigator.clipboard.writeText(activeResult.responseText);
                    notify('Antwort kopiert');
                  }}
                >
                  Kopieren
                </button>
                <button
                  className="tactile-btn"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => void handleSaveOutputToMemo()}
                >
                  In Memo (.md) sichern
                </button>
              </div>
            )}
          </div>

          {running ? (
            <div style={{ padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Sammle lokale Live-Daten ({contextScopes.join(', ').toUpperCase()}) und generiere{' '}
              <code>{responsePattern}</code> via <code>{model}</code>...
            </div>
          ) : inspectorTab === 'history' ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="bp-row"
                  onClick={() => {
                    let parsedActions: ProposedAxonCall[] = [];
                    try {
                      parsedActions = JSON.parse(r.proposed_actions_json || '[]');
                    } catch {}
                    setActiveResult({
                      runId: r.id,
                      modelUsed: r.model_used,
                      responsePattern: r.response_pattern,
                      durationMs: r.duration_ms,
                      contextBlocks: [
                        {
                          scope: r.context_scopes.toUpperCase(),
                          summary: 'Historischer Kontext-Snapshot',
                          content: r.enriched_context,
                        },
                      ],
                      responseText: r.response_text,
                      proposedActions: parsedActions,
                      createdAt: r.created_at,
                    });
                    setInspectorTab('output');
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    #{r.id} · {r.response_pattern.slice(0, 6)}
                  </span>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.prompt}
                  </div>
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.duration_ms} ms
                  </span>
                </div>
              ))}
            </div>
          ) : inspectorTab === 'context' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activeResult?.contextBlocks?.length ? (
                activeResult.contextBlocks.map((b, idx) => (
                  <div
                    key={idx}
                    style={{
                      paddingBottom: 14,
                      borderBottom: '1px solid var(--line-hairline)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      [{b.scope}] — {b.summary}
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--line-hairline)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 240,
                        overflowY: 'auto',
                      }}
                    >
                      {b.content || '(Keine Detaildaten)'}
                    </pre>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  Noch kein Kontext-Snapshot vorhanden.
                </div>
              )}
            </div>
          ) : activeResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>
                  RUN #{activeResult.runId} · {activeResult.modelUsed} ·{' '}
                  {activeResult.responsePattern}
                </span>
                <span>{activeResult.durationMs} ms</span>
              </div>

              {/* QUASI-AGENTIC PROPOSED AXON CALLS */}
              {activeResult.proposedActions && activeResult.proposedActions.length > 0 && (
                <div
                  style={{
                    border: '1px solid var(--line-btn)',
                    borderRadius: 5,
                    padding: 14,
                    background: 'var(--bg-elevated)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-primary)',
                    }}
                  >
                    QUASI-AGENTISCHE AXON-AKTIONEN ({activeResult.proposedActions.length})
                  </div>

                  {activeResult.proposedActions.map((act, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        paddingTop: 8,
                        borderTop: '1px solid var(--line-hairline)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background:
                                act.status === 'error'
                                  ? 'var(--dot-err)'
                                  : act.executed
                                    ? 'var(--dot-ok)'
                                    : 'var(--dot-warn)',
                            }}
                          />
                          {act.axonId}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {act.reason}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {act.resultSummary
                            ? `Ergebnis: ${act.resultSummary}`
                            : `Input: ${JSON.stringify(act.input)}`}
                        </div>
                      </div>

                      <button
                        className="tactile-btn primary"
                        onClick={() => void handleExecuteProposedAxon(idx, act)}
                      >
                        {act.executed ? 'Erneut ausführen' : 'Axon ausführen'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* GEMINI MARKDOWN / STRUCTURED RESPONSE */}
              <pre
                style={{
                  margin: 0,
                  padding: 18,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '68vh',
                  overflowY: 'auto',
                }}
              >
                {activeResult.responseText}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Wähle links eine Spezial-Anfrage oder gib einen Prompt ein und klicke auf „Mit
              Live-Daten ausführen“.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
