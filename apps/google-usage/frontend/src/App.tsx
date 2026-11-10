import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('google-usage');

interface GoogleUsageBudgetConfig {
  monthlyBudgetEur: number;
  totalPrepaidCreditsEur: number;
  billingTier: 'free_tier' | 'pay_as_you_go' | 'vertex_credits';
  alertThresholdPct: number;
  updatedAt: string;
}

interface GoogleApiCallRecord {
  id: string;
  timestamp: string;
  appId: string;
  appLabel: string;
  service: string;
  endpoint: string;
  model: string;
  promptPreview: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'ok' | 'fallback' | 'error';
  estimatedCostUsd: number;
  estimatedCostEur: number;
  tokenAccountingSource: 'exact_metadata' | 'char_estimate' | 'oauth_sync';
}

interface ModelPricingSpec {
  modelPrefix: string;
  displayName: string;
  provider: string;
  inputPricePer1MUsd: number;
  outputPricePer1MUsd: number;
  freeTierRpm: number;
  freeTierRpd: number;
  paidTierRpm: number;
  contextWindowTokens: number;
  outputLimitTokens: number;
}

interface LiveGeminiModelInfo {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedMethods: string[];
  pricing: ModelPricingSpec;
}

interface ServiceSummary {
  id: string;
  name: string;
  apiHost: string;
  appId: string;
  appPath: string;
  status: 'ok' | 'warn' | 'error';
  statusLabel: string;
  callsCount: number;
  tokensCount: number;
  recordsSynced: number;
  lastActivityAt: string | null;
  estimatedCostEur: number;
  quotaNote: string;
}

interface ModelBreakdownItem {
  model: string;
  displayName: string;
  calls: number;
  cloudCalls: number;
  fallbackCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  estimatedCostEur: number;
  estimatedCostUsd: number;
}

interface DailyUsageItem {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEur: number;
}

interface OverviewPayload {
  fetchedAt: string;
  geminiKey: {
    configured: boolean;
    keyPreview: string | null;
    source: string;
    totalDiscoveredKeys: number;
  };
  googleOAuth: {
    hasCredentials: boolean;
    authorized: boolean;
    hasRefreshToken: boolean;
    expiryDate: number | null;
    clientIdPreview: string | null;
    redirectUri: string | null;
    scopes: string[];
  };
  budget: GoogleUsageBudgetConfig;
  kpis: {
    totalApiCalls: number;
    todayApiCalls: number;
    monthApiCalls: number;
    geminiCloudCalls: number;
    localFallbackCalls: number;
    workspaceSyncedRecords: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    todayTokens: number;
    monthTokens: number;
    avgLatencyMs: number;
    billedMonthEur: number;
    theoreticalCostMonthEur: number;
    theoreticalCostTotalEur: number;
    theoreticalCostMonthUsd: number;
    theoreticalCostTotalUsd: number;
    remainingCreditsEur: number;
    budgetUsedPct: number;
  };
  services: ServiceSummary[];
  modelsBreakdown: ModelBreakdownItem[];
  dailyUsage: DailyUsageItem[];
  callLog: GoogleApiCallRecord[];
  liveModels: {
    models: LiveGeminiModelInfo[];
    fetchedAt: string;
    liveOk: boolean;
    error?: string;
  };
  pricingReference: ModelPricingSpec[];
}

type PageTab = 'overview' | 'call_log' | 'models_quotas' | 'credits_oauth';

function formatRelativeTime(isoOrDate: string | number | null | undefined): string {
  if (!isoOrDate) return 'Noch kein Sync';
  const d = typeof isoOrDate === 'number' ? new Date(isoOrDate) : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 0) {
    const absMin = Math.round(Math.abs(diffSec) / 60);
    if (absMin < 60) return `in ${absMin}m`;
    return `in ${Math.round(absMin / 60)}h`;
  }
  if (diffSec < 10) return 'gerade eben';
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `vor ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `vor ${diffDays}d`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEur(val: number, decimals = 4): string {
  return `€ ${(val || 0).toLocaleString('de-AT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export default function App() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'call_log' || t === 'models_quotas' || t === 'credits_oauth') return t;
    return 'overview';
  });

  // Call log filters
  const [logAppFilter, setLogAppFilter] = useState<string>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');

  // Inline / Tab Budget editing
  const [editingBudgetInline, setEditingBudgetInline] = useState<boolean>(false);
  const [budgetForm, setBudgetForm] = useState<{
    monthlyBudgetEur: string;
    totalPrepaidCreditsEur: string;
    billingTier: 'free_tier' | 'pay_as_you_go' | 'vertex_credits';
    alertThresholdPct: string;
  }>({
    monthlyBudgetEur: '10.00',
    totalPrepaidCreditsEur: '25.00',
    billingTier: 'free_tier',
    alertThresholdPct: '80',
  });
  const [budgetSaving, setBudgetSaving] = useState<boolean>(false);
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null);

  // Live API Ping & Token Accounting Tester
  const [pingModel, setPingModel] = useState<string>('gemini-2.5-flash');
  const [pingPrompt, setPingPrompt] = useState<string>(
    'Antworte in exakt einem kurzen Satz auf Deutsch: Bestätige, dass die Thassi Google Usage & Token-Telemetrie aktiv ist.'
  );
  const [pingRunning, setPingRunning] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{
    ok: boolean;
    latencyMs: number;
    model: string;
    replyText?: string;
    error?: string;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    cost?: { usd: number; eur: number };
  } | null>(null);

  const loadOverview = useCallback(async (forceRefreshModels = false) => {
    try {
      setRefreshing(true);
      setError(null);
      const query = forceRefreshModels ? '?refreshModels=1' : '';
      const res = await api.get<OverviewPayload>(`/overview${query}`);
      setData(res);
      if (res.budget) {
        setBudgetForm({
          monthlyBudgetEur: String(res.budget.monthlyBudgetEur.toFixed(2)),
          totalPrepaidCreditsEur: String(res.budget.totalPrepaidCreditsEur.toFixed(2)),
          billingTier: res.budget.billingTier,
          alertThresholdPct: String(res.budget.alertThresholdPct),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(false);
    const timer = setInterval(() => loadOverview(false), 30_000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  const handleSaveBudget = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBudgetSaving(true);
    setBudgetNotice(null);
    try {
      await api.post('/budget', {
        monthlyBudgetEur: parseFloat(budgetForm.monthlyBudgetEur.replace(',', '.')) || 10,
        totalPrepaidCreditsEur:
          parseFloat(budgetForm.totalPrepaidCreditsEur.replace(',', '.')) || 25,
        billingTier: budgetForm.billingTier,
        alertThresholdPct: parseInt(budgetForm.alertThresholdPct, 10) || 80,
      });
      setEditingBudgetInline(false);
      setBudgetNotice('Budget- & Credit-Einstellungen gespeichert.');
      await loadOverview(false);
    } catch (err) {
      setBudgetNotice(
        `Fehler beim Speichern: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleRunPing = async () => {
    setPingRunning(true);
    setPingResult(null);
    try {
      const res = await api.post<{
        ok: boolean;
        latencyMs: number;
        model: string;
        replyText?: string;
        error?: string;
        usageMetadata?: {
          promptTokenCount: number;
          candidatesTokenCount: number;
          totalTokenCount: number;
        };
        cost?: { usd: number; eur: number };
      }>('/ping', {
        model: pingModel,
        prompt: pingPrompt,
      });
      setPingResult(res);
      await loadOverview(false);
    } catch (err) {
      setPingResult({
        ok: false,
        latencyMs: 0,
        model: pingModel,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPingRunning(false);
    }
  };

  const filteredCallLog = useMemo(() => {
    if (!data) return [];
    return data.callLog.filter((item) => {
      if (logAppFilter !== 'all' && item.appId !== logAppFilter) return false;
      if (logStatusFilter !== 'all' && item.status !== logStatusFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const match =
          item.promptPreview.toLowerCase().includes(q) ||
          item.model.toLowerCase().includes(q) ||
          item.service.toLowerCase().includes(q) ||
          item.appLabel.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, logAppFilter, logStatusFilter, logSearch]);

  if (loading && !data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#09090b',
          color: '#a1a1aa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.8125rem',
        }}
      >
        Lade Google Usage, Token-Telemetrie & AI Credits...
      </div>
    );
  }

  const kpis = data?.kpis;
  const budget = data?.budget;
  const geminiConfigured = Boolean(data?.geminiKey.configured);
  const oauthAuthorized = Boolean(data?.googleOAuth.authorized);
  const budgetAlert =
    kpis && budget ? kpis.budgetUsedPct >= budget.alertThresholdPct : false;

  const billingTierLabel =
    budget?.billingTier === 'pay_as_you_go'
      ? 'Pay-as-you-go (Tier 1)'
      : budget?.billingTier === 'vertex_credits'
        ? 'Cloud / Vertex AI Credits'
        : 'AI Studio Free Tier (0 € Abrechnung)';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#fafafa',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: '24px 32px 64px',
        maxWidth: '1440px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        :root {
          --bg-canvas: #09090b;
          --bg-elevated: #111113;
          --bg-input: #141417;
          --bg-hover: rgba(255, 255, 255, 0.03);
          --line-hairline: rgba(255, 255, 255, 0.06);
          --line-subtle: rgba(255, 255, 255, 0.12);
          --text-primary: #fafafa;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --status-ok: #10b981;
          --status-warn: #f59e0b;
          --status-danger: #ef4444;
        }
        * { box-sizing: border-box; }
        .mono {
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }
        .section-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .btn-quiet {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--line-subtle);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .btn-quiet:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border-color: rgba(255, 255, 255, 0.22);
        }
        .btn-primary {
          background: #fafafa;
          color: #09090b;
          border: 1px solid #fafafa;
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 120ms ease;
        }
        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }
        .btn-primary:disabled, .btn-quiet:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .input-clean {
          background: var(--bg-input);
          color: var(--text-primary);
          border: 1px solid var(--line-subtle);
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 0.8125rem;
          outline: none;
        }
        .input-clean:focus {
          border-color: rgba(255, 255, 255, 0.28);
        }
        .row-hover:hover {
          background: var(--bg-hover);
        }
      `}</style>

      {/* 1. HEADER & LIVE TELEMETRY STATUS STRIP */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: '#fafafa',
              }}
            >
              Google Usage, AI Credits & Quotas
            </h1>
            <span
              className="mono"
              style={{
                fontSize: '0.6875rem',
                color: '#a1a1aa',
                padding: '2px 7px',
                border: '1px solid var(--line-hairline)',
                borderRadius: '4px',
              }}
            >
              THASSI TELEMETRIE
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '14px',
              marginTop: '8px',
              fontSize: '0.75rem',
              color: '#a1a1aa',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: geminiConfigured ? '#10b981' : '#ef4444',
                }}
              />
              <span>
                Gemini API:{' '}
                <strong className="mono" style={{ color: '#fafafa', fontWeight: 500 }}>
                  {data?.geminiKey.keyPreview || 'Nicht konfiguriert'}
                </strong>{' '}
                ({data?.geminiKey.source})
              </span>
            </span>

            <span style={{ color: '#52525b' }}>·</span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: oauthAuthorized ? '#10b981' : '#f59e0b',
                }}
              />
              <span>
                Google OAuth2:{' '}
                <strong style={{ color: '#fafafa', fontWeight: 500 }}>
                  {oauthAuthorized
                    ? `Autorisiert (${data?.googleOAuth.scopes.length || 0} Scopes)`
                    : 'Nicht autorisiert'}
                </strong>
              </span>
            </span>

            <span style={{ color: '#52525b' }}>·</span>

            <span className="mono" style={{ color: '#a1a1aa' }}>
              Stand: {formatDateTime(data?.fetchedAt)} ({formatRelativeTime(data?.fetchedAt)})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn-quiet"
            onClick={() => {
              window.location.href = '/apps/cortex/?tab=vault';
            }}
          >
            API Keys & Vault
          </button>
          <button
            className="btn-quiet"
            onClick={() => {
              setActiveTab('models_quotas');
              handleRunPing();
            }}
            disabled={pingRunning}
          >
            {pingRunning ? 'Ping läuft...' : 'Live-Ping testen'}
          </button>
          <button
            className="btn-primary"
            onClick={() => loadOverview(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Aktualisiere...' : 'Daten & Quotas aktualisieren'}
          </button>
        </div>
      </header>

      {/* 2. USER INPUT / QUOTA ALERT BANNER (if action required) */}
      {(!geminiConfigured || !oauthAuthorized || budgetAlert || error) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 14px',
            marginTop: '12px',
            background: '#111113',
            border: '1px solid var(--line-subtle)',
            borderLeft: `2px solid ${
              error || !geminiConfigured ? '#ef4444' : '#f59e0b'
            }`,
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: error || !geminiConfigured ? '#ef4444' : '#f59e0b',
                flexShrink: 0,
              }}
            />
            <span style={{ color: '#fafafa' }}>
              {error
                ? `Fehler beim Abrufen der Nutzungsdaten: ${error}`
                : !geminiConfigured
                  ? 'Benutzereingabe erforderlich: Kein Google Gemini API-Key hinterlegt — KI-Anfragen laufen nur im lokalen Fallback.'
                  : !oauthAuthorized
                    ? 'Hinweis: Google OAuth2 ist noch nicht autorisiert — Google Calendar, Drive & Fitness APIs können im Vault verbunden werden.'
                    : `Budget-Warnung: ${kpis?.budgetUsedPct}% des monatlichen AI-Credit-Budgets (${formatEur(budget?.monthlyBudgetEur || 10, 2)}) erreicht.`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(!geminiConfigured || !oauthAuthorized) && (
              <button
                className="btn-quiet"
                onClick={() => {
                  window.location.href = '/apps/cortex/?tab=vault';
                }}
              >
                Im Credentials Vault einrichten
              </button>
            )}
            {budgetAlert && (
              <button
                className="btn-quiet"
                onClick={() => setActiveTab('credits_oauth')}
              >
                Budget anpassen
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. 4-COLUMN HAIRLINE KPI STRIP */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          borderBottom: '1px solid var(--line-hairline)',
          borderTop: '1px solid var(--line-hairline)',
          marginTop: '16px',
        }}
      >
        {/* KPI 1: API CALLS */}
        <div
          style={{
            padding: '18px 20px 18px 0',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span className="section-label">GOOGLE API CALLS (GESAMT)</span>
            <span
              className="mono"
              style={{ fontSize: '0.6875rem', color: '#10b981' }}
            >
              Ø {kpis?.avgLatencyMs || 0} ms
            </span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: '1.75rem',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              marginTop: '8px',
              color: '#fafafa',
            }}
          >
            {(kpis?.totalApiCalls || 0).toLocaleString('de-AT')}
          </div>
          <div
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: '#a1a1aa',
              marginTop: '6px',
              display: 'flex',
              gap: '10px',
            }}
          >
            <span>Heute: {kpis?.todayApiCalls || 0}</span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>Monat: {kpis?.monthApiCalls || 0}</span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>Cloud: {kpis?.geminiCloudCalls || 0}</span>
          </div>
        </div>

        {/* KPI 2: GEMINI TOKENS */}
        <div
          style={{
            padding: '18px 20px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span className="section-label">GEMINI TOKEN-VOLUMEN</span>
            <span className="mono" style={{ fontSize: '0.6875rem', color: '#a1a1aa' }}>
              Heute: {(kpis?.todayTokens || 0).toLocaleString('de-AT')}
            </span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: '1.75rem',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              marginTop: '8px',
              color: '#fafafa',
            }}
          >
            {(kpis?.totalTokens || 0).toLocaleString('de-AT')}
          </div>
          <div
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: '#a1a1aa',
              marginTop: '6px',
              display: 'flex',
              gap: '10px',
            }}
          >
            <span>In: {(kpis?.totalInputTokens || 0).toLocaleString('de-AT')}</span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>Out: {(kpis?.totalOutputTokens || 0).toLocaleString('de-AT')}</span>
          </div>
        </div>

        {/* KPI 3: AI CREDITS & MONTHLY BUDGET */}
        <div
          style={{
            padding: '18px 20px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span className="section-label">AI CREDITS & MONATSBUDGET</span>
            <button
              onClick={() => setEditingBudgetInline(!editingBudgetInline)}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                fontSize: '0.6875rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              {editingBudgetInline ? 'Schließen' : 'Limit ändern'}
            </button>
          </div>

          {editingBudgetInline ? (
            <form
              onSubmit={handleSaveBudget}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '8px',
              }}
            >
              <input
                type="number"
                step="0.50"
                className="input-clean mono"
                style={{ width: '90px', padding: '4px 8px' }}
                value={budgetForm.monthlyBudgetEur}
                onChange={(e) =>
                  setBudgetForm((s) => ({ ...s, monthlyBudgetEur: e.target.value }))
                }
              />
              <span className="mono" style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                €/Monat
              </span>
              <button type="submit" className="btn-primary" style={{ padding: '4px 10px' }}>
                OK
              </button>
            </form>
          ) : (
            <div
              className="mono"
              style={{
                fontSize: '1.75rem',
                fontWeight: 600,
                letterSpacing: '-0.03em',
                marginTop: '8px',
                color: '#fafafa',
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
              }}
            >
              <span>{formatEur(kpis?.theoreticalCostMonthEur || 0, 4)}</span>
              <span style={{ fontSize: '0.8125rem', color: '#52525b', fontWeight: 400 }}>
                / {formatEur(budget?.monthlyBudgetEur || 10, 2)}
              </span>
            </div>
          )}

          {/* 2px Hairline Progress Bar */}
          <div
            style={{
              height: '2px',
              background: 'rgba(255,255,255,0.08)',
              width: '100%',
              marginTop: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(2, kpis?.budgetUsedPct || 0))}%`,
                background:
                  (kpis?.budgetUsedPct || 0) >= 90
                    ? '#ef4444'
                    : (kpis?.budgetUsedPct || 0) >= 75
                      ? '#f59e0b'
                      : '#10b981',
              }}
            />
          </div>

          <div
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: '#a1a1aa',
              marginTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{billingTierLabel}</span>
            <span>Guthaben: {formatEur(kpis?.remainingCreditsEur || 0, 2)}</span>
          </div>
        </div>

        {/* KPI 4: OAUTH2 & QUOTA STATUS */}
        <div style={{ padding: '18px 0 18px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span className="section-label">WORKSPACE SYNC & QUOTAS</span>
            <span
              className="mono"
              style={{
                fontSize: '0.6875rem',
                color: data?.liveModels.liveOk ? '#10b981' : '#f59e0b',
              }}
            >
              {data?.liveModels.models.length || 0} Modelle live
            </span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: '1.75rem',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              marginTop: '8px',
              color: '#fafafa',
            }}
          >
            {(kpis?.workspaceSyncedRecords || 0).toLocaleString('de-AT')}{' '}
            <span style={{ fontSize: '0.875rem', color: '#a1a1aa', fontWeight: 400 }}>
              Objekte
            </span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: '#a1a1aa',
              marginTop: '6px',
              display: 'flex',
              gap: '10px',
            }}
          >
            <span>
              Dienste: {data?.services.filter((s) => s.status === 'ok').length || 0}/
              {data?.services.length || 5} OK
            </span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>Fallback-Runs: {kpis?.localFallbackCalls || 0}</span>
          </div>
        </div>
      </section>

      {/* 4. CLEAN TEXT-LINK NAVIGATION TABS */}
      <nav
        style={{
          display: 'flex',
          gap: '28px',
          borderBottom: '1px solid var(--line-hairline)',
          marginTop: '8px',
          marginBottom: '24px',
        }}
      >
        {(
          [
            { id: 'overview', label: 'Übersicht & Dienste' },
            {
              id: 'call_log',
              label: `API Call-Log (${data?.callLog.length || 0})`,
            },
            {
              id: 'models_quotas',
              label: `Modelle & Live-Quotas (${data?.liveModels.models.length || 0})`,
            },
            { id: 'credits_oauth', label: 'Credits, Budget & OAuth2' },
          ] as Array<{ id: PageTab; label: string }>
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '1px solid #fafafa' : '1px solid transparent',
                color: active ? '#fafafa' : '#52525b',
                padding: '12px 0',
                fontSize: '0.8125rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                transition: 'color 120ms ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* TAB 1: ÜBERSICHT & DIENSTE */}
      {activeTab === 'overview' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr',
            gap: '32px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Google Services & Apps Breakdown */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span className="section-label">
                GOOGLE API-DIENSTE & ANGEBUNDENE THASSI APPS
              </span>
              <span className="mono" style={{ fontSize: '0.6875rem', color: '#52525b' }}>
                5 SCHNITTSTELLEN
              </span>
            </div>

            <div>
              {(data?.services || []).map((svc) => (
                <div
                  key={svc.id}
                  className="row-hover"
                  style={{
                    padding: '14px 8px',
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '16px',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            svc.status === 'ok'
                              ? '#10b981'
                              : svc.status === 'warn'
                                ? '#f59e0b'
                                : '#ef4444',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: '#fafafa',
                        }}
                      >
                        {svc.name}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: '0.6875rem',
                          color: '#a1a1aa',
                          border: '1px solid var(--line-hairline)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {svc.statusLabel}
                      </span>
                    </div>

                    <div
                      className="mono"
                      style={{
                        fontSize: '0.75rem',
                        color: '#52525b',
                        marginTop: '4px',
                      }}
                    >
                      {svc.apiHost} · {svc.quotaNote}
                    </div>

                    <div
                      className="mono"
                      style={{
                        fontSize: '0.75rem',
                        color: '#a1a1aa',
                        marginTop: '6px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <span>Calls: {svc.callsCount.toLocaleString('de-AT')}</span>
                      {svc.tokensCount > 0 && (
                        <span>
                          Tokens: {svc.tokensCount.toLocaleString('de-AT')}
                        </span>
                      )}
                      <span>
                        Datensätze: {svc.recordsSynced.toLocaleString('de-AT')}
                      </span>
                      <span>
                        Letzte Aktivität: {formatRelativeTime(svc.lastActivityAt)}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: svc.estimatedCostEur > 0 ? '#fafafa' : '#a1a1aa',
                      }}
                    >
                      {formatEur(svc.estimatedCostEur, 4)}
                    </div>
                    <button
                      className="btn-quiet"
                      style={{ marginTop: '6px', padding: '4px 9px', fontSize: '0.6875rem' }}
                      onClick={() => {
                        window.location.href = svc.appPath;
                      }}
                    >
                      App öffnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Model Breakdown & 14-Day Daily Activity */}
          <div
            style={{
              paddingLeft: '24px',
              borderLeft: '1px solid var(--line-hairline)',
            }}
          >
            {/* Model Breakdown */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span className="section-label">VERBRAUCH NACH KI-MODELL</span>
              <span className="mono" style={{ fontSize: '0.6875rem', color: '#52525b' }}>
                TOKENS & CREDITS
              </span>
            </div>

            <div>
              {(data?.modelsBreakdown || []).length === 0 ? (
                <div
                  style={{
                    padding: '16px 0',
                    fontSize: '0.8125rem',
                    color: '#52525b',
                  }}
                >
                  Noch keine Modell-Aufrufe protokolliert.
                </div>
              ) : (
                (data?.modelsBreakdown || []).map((m) => {
                  const sharePct =
                    (kpis?.totalTokens || 0) > 0
                      ? Math.round((m.totalTokens / (kpis?.totalTokens || 1)) * 100)
                      : 0;
                  return (
                    <div
                      key={m.model}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--line-hairline)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <div>
                          <span
                            className="mono"
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: '#fafafa',
                            }}
                          >
                            {m.model}
                          </span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#a1a1aa',
                              marginLeft: '8px',
                            }}
                          >
                            ({m.calls} Calls · Ø {m.avgLatencyMs} ms)
                          </span>
                        </div>
                        <span
                          className="mono"
                          style={{ fontSize: '0.8125rem', color: '#fafafa' }}
                        >
                          {formatEur(m.estimatedCostEur, 4)}
                        </span>
                      </div>

                      <div
                        className="mono"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: '#a1a1aa',
                          marginTop: '4px',
                        }}
                      >
                        <span>
                          {m.totalTokens.toLocaleString('de-AT')} Tokens (In:{' '}
                          {m.inputTokens.toLocaleString('de-AT')} / Out:{' '}
                          {m.outputTokens.toLocaleString('de-AT')})
                        </span>
                        <span>{sharePct}%</span>
                      </div>

                      <div
                        style={{
                          height: '2px',
                          background: 'rgba(255,255,255,0.06)',
                          marginTop: '6px',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.max(2, sharePct)}%`,
                            background: m.fallbackCalls > 0 ? '#f59e0b' : '#10b981',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 14-Day Daily Activity Table */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '24px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span className="section-label">14-TAGE TAGESVERLAUF (CALLS & TOKENS)</span>
              <span className="mono" style={{ fontSize: '0.6875rem', color: '#52525b' }}>
                CHRONOLOGISCH
              </span>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.75rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--line-hairline)',
                      color: '#52525b',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 0', fontWeight: 600 }}>DATUM</th>
                    <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>
                      CALLS
                    </th>
                    <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>
                      TOKENS
                    </th>
                    <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>
                      WERT (EUR)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...(data?.dailyUsage || [])]
                    .reverse()
                    .map((day) => (
                      <tr
                        key={day.date}
                        className="mono row-hover"
                        style={{
                          borderBottom: '1px solid var(--line-hairline)',
                          color: day.calls > 0 ? '#fafafa' : '#52525b',
                        }}
                      >
                        <td style={{ padding: '7px 0' }}>{day.date}</td>
                        <td style={{ padding: '7px 0', textAlign: 'right' }}>
                          {day.calls}
                        </td>
                        <td style={{ padding: '7px 0', textAlign: 'right' }}>
                          {day.totalTokens.toLocaleString('de-AT')}
                        </td>
                        <td style={{ padding: '7px 0', textAlign: 'right' }}>
                          {formatEur(day.costEur, 4)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: API CALL-LOG */}
      {activeTab === 'call_log' && (
        <div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              paddingBottom: '14px',
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="section-label">FILTER:</span>
              <select
                className="input-clean"
                value={logAppFilter}
                onChange={(e) => setLogAppFilter(e.target.value)}
              >
                <option value="all">Alle Apps ({data?.callLog.length || 0})</option>
                <option value="cortex">Cortex AI</option>
                <option value="3d-print">3D-Print CAD Studio</option>
                <option value="google-usage">Live-Quota-Tests</option>
              </select>

              <select
                className="input-clean"
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
              >
                <option value="all">Alle Status</option>
                <option value="ok">Cloud OK (Gemini API)</option>
                <option value="fallback">Lokal Fallback (0 Credits)</option>
                <option value="error">Fehler</option>
              </select>

              <input
                type="text"
                className="input-clean"
                placeholder="Prompt, Modell oder Dienst suchen..."
                style={{ width: '260px' }}
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </div>

            <div className="mono" style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
              Zeige {filteredCallLog.length} von {data?.callLog.length || 0} Einträgen
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
              }}
            >
              <thead>
                <tr
                  className="section-label"
                  style={{
                    borderBottom: '1px solid var(--line-hairline)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '10px 8px 10px 0' }}>ZEITPUNKT</th>
                  <th style={{ padding: '10px 8px' }}>APP / QUELLE</th>
                  <th style={{ padding: '10px 8px' }}>MODELL / ENDPOINT</th>
                  <th style={{ padding: '10px 8px' }}>PROMPT / AKTION</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>IN TOKENS</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>OUT TOKENS</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>LATENZ</th>
                  <th style={{ padding: '10px 0 10px 8px', textAlign: 'right' }}>
                    CREDITS (EUR)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCallLog.map((row) => (
                  <tr
                    key={row.id}
                    className="row-hover"
                    style={{
                      borderBottom: '1px solid var(--line-hairline)',
                    }}
                  >
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px 10px 0',
                        fontSize: '0.75rem',
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDateTime(row.timestamp)}
                    </td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.75rem',
                          color: '#fafafa',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background:
                              row.status === 'ok'
                                ? '#10b981'
                                : row.status === 'fallback'
                                  ? '#f59e0b'
                                  : '#ef4444',
                          }}
                        />
                        {row.appLabel}
                      </span>
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        fontSize: '0.75rem',
                        color: '#fafafa',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.model}
                      {row.tokenAccountingSource === 'exact_metadata' && (
                        <span
                          style={{
                            marginLeft: '6px',
                            fontSize: '0.625rem',
                            color: '#10b981',
                            border: '1px solid rgba(16,185,129,0.3)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                          }}
                        >
                          EXACT
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: '#a1a1aa',
                        maxWidth: '420px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.promptPreview}
                    >
                      {row.promptPreview}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#a1a1aa',
                      }}
                    >
                      {row.inputTokens.toLocaleString('de-AT')}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#a1a1aa',
                      }}
                    >
                      {row.outputTokens.toLocaleString('de-AT')}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.latencyMs} ms
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 0 10px 8px',
                        textAlign: 'right',
                        color: row.estimatedCostEur > 0 ? '#fafafa' : '#52525b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatEur(row.estimatedCostEur, 5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MODELLE & LIVE-QUOTAS */}
      {activeTab === 'models_quotas' && (
        <div>
          {/* Interactive Live API Ping & Token Accounting Box */}
          <div
            style={{
              padding: '18px 20px',
              background: '#111113',
              border: '1px solid var(--line-hairline)',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span className="section-label">
                LIVE GEMINI API PING & EXAKTER TOKEN-ACCOUNTING TEST
              </span>
              <span className="mono" style={{ fontSize: '0.6875rem', color: '#a1a1aa' }}>
                Liest usageMetadata direkt von generativelanguage.googleapis.com
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr auto',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <select
                className="input-clean mono"
                value={pingModel}
                onChange={(e) => setPingModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="gemma-3-27b-it">gemma-3-27b-it</option>
              </select>

              <input
                type="text"
                className="input-clean"
                value={pingPrompt}
                onChange={(e) => setPingPrompt(e.target.value)}
                placeholder="Test-Prompt für Token-Messung..."
              />

              <button
                className="btn-primary"
                onClick={handleRunPing}
                disabled={pingRunning}
              >
                {pingRunning ? 'Sende Anfrage...' : 'Live-Ping ausführen'}
              </button>
            </div>

            {pingResult && (
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--line-hairline)',
                  fontSize: '0.8125rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: pingResult.ok ? '#10b981' : '#ef4444',
                      }}
                    />
                    <strong className="mono">
                      {pingResult.ok ? 'HTTP 200 OK' : 'FEHLER'}
                    </strong>
                  </span>
                  <span className="mono" style={{ color: '#a1a1aa' }}>
                    Modell: {pingResult.model}
                  </span>
                  <span className="mono" style={{ color: '#a1a1aa' }}>
                    Latenz: {pingResult.latencyMs} ms
                  </span>
                  {pingResult.usageMetadata && (
                    <>
                      <span className="mono" style={{ color: '#10b981' }}>
                        Prompt Tokens: {pingResult.usageMetadata.promptTokenCount}
                      </span>
                      <span className="mono" style={{ color: '#10b981' }}>
                        Output Tokens: {pingResult.usageMetadata.candidatesTokenCount}
                      </span>
                      <span className="mono" style={{ color: '#fafafa', fontWeight: 600 }}>
                        Gesamt: {pingResult.usageMetadata.totalTokenCount} Tokens
                      </span>
                    </>
                  )}
                  {pingResult.cost && (
                    <span className="mono" style={{ color: '#a1a1aa' }}>
                      Kosten: {formatEur(pingResult.cost.eur, 6)} ($
                      {pingResult.cost.usd.toFixed(6)})
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    color: pingResult.ok ? '#fafafa' : '#ef4444',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                  }}
                >
                  {pingResult.ok ? `Antwort: "${pingResult.replyText}"` : pingResult.error}
                </div>
              </div>
            )}
          </div>

          {/* Live Models Table */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            <span className="section-label">
              VERFÜGBARE GOOGLE GEMINI & GEMMA MODELLE (LIVE VOM API KEY)
            </span>
            <span className="mono" style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
              Status:{' '}
              {data?.liveModels.liveOk
                ? `Live synchronisiert (${formatRelativeTime(data.liveModels.fetchedAt)})`
                : `Referenz-Liste (${data?.liveModels.error || 'Offline'})`}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
              }}
            >
              <thead>
                <tr
                  className="section-label"
                  style={{
                    borderBottom: '1px solid var(--line-hairline)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '10px 8px 10px 0' }}>MODELL-ID</th>
                  <th style={{ padding: '10px 8px' }}>NAME</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                    MAX INPUT TOKENS
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                    MAX OUTPUT TOKENS
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                    FREE QUOTA (RPM / RPD)
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                    PREIS / 1M INPUT
                  </th>
                  <th style={{ padding: '10px 0 10px 8px', textAlign: 'right' }}>
                    PREIS / 1M OUTPUT
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.liveModels.models || []).map((m) => (
                  <tr
                    key={m.id}
                    className="row-hover"
                    style={{
                      borderBottom: '1px solid var(--line-hairline)',
                    }}
                  >
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px 10px 0',
                        fontWeight: 600,
                        color: '#fafafa',
                      }}
                    >
                      {m.id}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#a1a1aa' }}>
                      {m.displayName}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#fafafa',
                      }}
                    >
                      {m.inputTokenLimit.toLocaleString('de-AT')}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#a1a1aa',
                      }}
                    >
                      {m.outputTokenLimit.toLocaleString('de-AT')}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#a1a1aa',
                      }}
                    >
                      {m.pricing.freeTierRpm} RPM / {m.pricing.freeTierRpd} RPD
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        color: '#fafafa',
                      }}
                    >
                      ${m.pricing.inputPricePer1MUsd.toFixed(3)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 0 10px 8px',
                        textAlign: 'right',
                        color: '#fafafa',
                      }}
                    >
                      ${m.pricing.outputPricePer1MUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CREDITS, BUDGET & OAUTH2 */}
      {activeTab === 'credits_oauth' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Budget & AI Credits Configuration */}
          <div>
            <div
              style={{
                paddingBottom: '10px',
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: '16px',
              }}
            >
              <span className="section-label">
                AI CREDITS & MONATLICHES BUDGET KONFIGURIEREN
              </span>
            </div>

            <form
              onSubmit={handleSaveBudget}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#a1a1aa',
                    marginBottom: '6px',
                  }}
                >
                  Google Abrechnungs-Stufe (Billing Tier)
                </label>
                <select
                  className="input-clean"
                  style={{ width: '100%' }}
                  value={budgetForm.billingTier}
                  onChange={(e) =>
                    setBudgetForm((s) => ({
                      ...s,
                      billingTier: e.target.value as GoogleUsageBudgetConfig['billingTier'],
                    }))
                  }
                >
                  <option value="free_tier">
                    Google AI Studio — Free Tier (0,00 € Abrechnung, Rate-Limits aktiv)
                  </option>
                  <option value="pay_as_you_go">
                    Google AI Studio — Pay-as-you-go (Tier 1, Abrechnung pro 1M Tokens)
                  </option>
                  <option value="vertex_credits">
                    Google Cloud / Vertex AI — Prepaid Credit-Guthaben
                  </option>
                </select>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: '#a1a1aa',
                      marginBottom: '6px',
                    }}
                  >
                    Monatsbudget-Limit (EUR)
                  </label>
                  <input
                    type="number"
                    step="0.50"
                    className="input-clean mono"
                    style={{ width: '100%' }}
                    value={budgetForm.monthlyBudgetEur}
                    onChange={(e) =>
                      setBudgetForm((s) => ({ ...s, monthlyBudgetEur: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: '#a1a1aa',
                      marginBottom: '6px',
                    }}
                  >
                    Gesamtes AI-Credit-Guthaben (EUR)
                  </label>
                  <input
                    type="number"
                    step="1.00"
                    className="input-clean mono"
                    style={{ width: '100%' }}
                    value={budgetForm.totalPrepaidCreditsEur}
                    onChange={(e) =>
                      setBudgetForm((s) => ({
                        ...s,
                        totalPrepaidCreditsEur: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#a1a1aa',
                    marginBottom: '6px',
                  }}
                >
                  Warnschwelle bei Budget-Auslastung (%)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  className="input-clean mono"
                  style={{ width: '140px' }}
                  value={budgetForm.alertThresholdPct}
                  onChange={(e) =>
                    setBudgetForm((s) => ({ ...s, alertThresholdPct: e.target.value }))
                  }
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={budgetSaving}
                >
                  {budgetSaving ? 'Speichere...' : 'Budget & Tarif speichern'}
                </button>
                {budgetNotice && (
                  <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
                    {budgetNotice}
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Right Column: OAuth2 & API Key Inspector */}
          <div
            style={{
              paddingLeft: '24px',
              borderLeft: '1px solid var(--line-hairline)',
            }}
          >
            <div
              style={{
                paddingBottom: '10px',
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: '16px',
              }}
            >
              <span className="section-label">
                GOOGLE AUTHENTIFIZIERUNG & OAUTH2 SCOPES
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '0.8125rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span style={{ color: '#a1a1aa' }}>Aktiver Gemini API Key</span>
                <span className="mono" style={{ color: '#fafafa' }}>
                  {data?.geminiKey.keyPreview || 'Nicht hinterlegt'} ({data?.geminiKey.totalDiscoveredKeys || 0} Keys erkannt)
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span style={{ color: '#a1a1aa' }}>Google OAuth2 Client-ID</span>
                <span className="mono" style={{ color: '#fafafa' }}>
                  {data?.googleOAuth.clientIdPreview || 'Nicht konfiguriert'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span style={{ color: '#a1a1aa' }}>OAuth2 Refresh-Token</span>
                <span
                  className="mono"
                  style={{
                    color: data?.googleOAuth.hasRefreshToken ? '#10b981' : '#f59e0b',
                  }}
                >
                  {data?.googleOAuth.hasRefreshToken
                    ? 'Vorhanden (Auto-Refresh aktiv)'
                    : 'Kein Refresh-Token'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span style={{ color: '#a1a1aa' }}>Access-Token Ablauf</span>
                <span className="mono" style={{ color: '#fafafa' }}>
                  {data?.googleOAuth.expiryDate
                    ? `${new Date(data.googleOAuth.expiryDate).toLocaleString('de-AT')} (${formatRelativeTime(data.googleOAuth.expiryDate)})`
                    : '—'}
                </span>
              </div>

              <div>
                <div
                  className="section-label"
                  style={{ marginBottom: '8px', marginTop: '4px' }}
                >
                  AUTORISIERTE GOOGLE OAUTH2 SCOPES ({data?.googleOAuth.scopes.length || 0})
                </div>
                {(data?.googleOAuth.scopes || []).length === 0 ? (
                  <div style={{ color: '#52525b', fontSize: '0.75rem' }}>
                    Keine aktiven OAuth2 Scopes gespeichert.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {(data?.googleOAuth.scopes || []).map((sc) => (
                      <div
                        key={sc}
                        className="mono"
                        style={{
                          fontSize: '0.75rem',
                          color: '#a1a1aa',
                          padding: '4px 8px',
                          background: '#111113',
                          border: '1px solid var(--line-hairline)',
                        }}
                      >
                        {sc}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '8px' }}>
                <button
                  className="btn-quiet"
                  onClick={() => {
                    window.location.href = '/apps/cortex/?tab=vault';
                  }}
                >
                  Zentralen Credentials Vault in Cortex öffnen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
