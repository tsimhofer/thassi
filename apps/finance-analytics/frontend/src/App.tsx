import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AccountBalanceConfig,
  CATEGORY_DEFINITIONS,
  CategoryBreakdownItem,
  FinanceKpis,
  getCategoryMeta,
  PreviewConfig,
  QuickImportConfig,
  SunburstRing1Node,
  TransactionRow,
} from '../../shared/finance-types';
import { SunburstChart } from './components/SunburstChart';
import { BudgetManager } from './components/BudgetManager';
import { PreviewConfigPanel } from './components/PreviewConfigPanel';
import { QuickImportFlyout } from './components/QuickImportFlyout';

interface OverviewResponse {
  kpis: FinanceKpis;
  activeMonth: string;
  availableMonths: string[];
  transactions: TransactionRow[];
  totalTransactionCount: number;
  categoryBreakdown: CategoryBreakdownItem[];
  allBudgets: CategoryBreakdownItem[];
  previewGroupBudgets: CategoryBreakdownItem[];
  previewConfig: PreviewConfig;
  balanceConfig: AccountBalanceConfig;
  quickImportConfig: QuickImportConfig;
  recurringFixed: TransactionRow[];
  sunburstGroups: { totalExpenses: number; ring1: SunburstRing1Node[] };
  sunburstMerchants: { totalExpenses: number; ring1: SunburstRing1Node[] };
  mealPlannerToday: {
    date: string;
    dinner: string | null;
    totalCalories: number;
    openGroceries: number;
  } | null;
}

function resolveApiBase(): string {
  const path = window.location.pathname;
  const appMatch = path.match(/^(.*?)\/apps\/finance-analytics/);
  if (appMatch) {
    return `${appMatch[1]}/api/apps/finance-analytics`;
  }
  return '/api/apps/finance-analytics';
}

function resolveDashboardHref(): string {
  const path = window.location.pathname;
  const appMatch = path.match(/^(.*?)\/apps\/finance-analytics/);
  if (appMatch && appMatch[1]) {
    return `${appMatch[1]}/`;
  }
  return '/';
}

export function formatEur(val: number, hidden = false): string {
  if (hidden) return '•••• €';
  return (
    Number(val || 0).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €'
  );
}

type ActiveTab = 'overview' | 'preview_budgets' | 'transactions';

export default function App() {
  const apiBase = useMemo(() => resolveApiBase(), []);
  const dashboardHref = useMemo(() => resolveDashboardHref(), []);

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Privacy mask toggle on main page
  const [privacyMasked, setPrivacyMasked] = useState<boolean>(false);

  // Quick Import Flyout state
  const [quickImportOpen, setQuickImportOpen] = useState<boolean>(false);

  // Inline balance edit state on Overview KPI card
  const [editingBalanceInline, setEditingBalanceInline] = useState<boolean>(false);
  const [inlineBalanceInput, setInlineBalanceInput] = useState<string>('');

  // Overview bottom card toggle ('recent' | 'recurring')
  const [bottomListMode, setBottomListMode] = useState<'recent' | 'recurring'>('recent');

  // Transactions filter & search state
  const [txSearch, setTxSearch] = useState<string>('');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('ALL');
  const [showAddTxForm, setShowAddTxForm] = useState<boolean>(false);

  // New Transaction Form
  const [txDate, setTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [txPayee, setTxPayee] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [txCategory, setTxCategory] = useState<string>('');
  const [txRecurring, setTxRecurring] = useState<boolean>(false);

  // Toast feedback
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  const fetchOverview = useCallback(
    async (monthOverride?: string) => {
      try {
        const m = monthOverride !== undefined ? monthOverride : selectedMonth;
        const q = m ? `?month=${encodeURIComponent(m)}` : '';
        const res = await fetch(`${apiBase}/overview${q}`);
        const json: OverviewResponse = await res.json();
        setData(json);
        if (!m && json.activeMonth) {
          setSelectedMonth(json.activeMonth);
        }
      } catch (err) {
        console.error('Failed to load finance overview:', err);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, selectedMonth]
  );

  useEffect(() => {
    fetchOverview('');
  }, []);

  // Support URL hash shortcuts (#quick-import, #preview-config, #budgets, #transactions)
  useEffect(() => {
    const checkHash = () => {
      const h = window.location.hash.toLowerCase();
      if (h === '#quick-import') {
        setQuickImportOpen(true);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (h === '#preview-config' || h === '#budgets') {
        setActiveTab('preview_budgets');
      } else if (h === '#transactions') {
        setActiveTab('transactions');
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    fetchOverview(newMonth);
  };

  const handleStepMonth = (delta: number) => {
    if (!data || data.availableMonths.length === 0) return;
    const months = data.availableMonths; // sorted DESC
    const idx = months.indexOf(selectedMonth);
    if (idx === -1) return;
    const targetIdx = idx - delta;
    if (targetIdx >= 0 && targetIdx < months.length) {
      handleMonthChange(months[targetIdx]);
    }
  };

  // Save Preview Configuration
  const handleSavePreviewConfig = async (partial: Partial<PreviewConfig>) => {
    const res = await fetch(`${apiBase}/preview-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (res.ok) {
      await fetchOverview(selectedMonth);
      showToast('Dashboard-Preview Konfiguration gespeichert');
    }
  };

  // Save Account Balance
  const handleSaveBalance = async (partial: Partial<AccountBalanceConfig>) => {
    const res = await fetch(`${apiBase}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (res.ok) {
      await fetchOverview(selectedMonth);
      showToast('Aktueller Kontostand aktualisiert');
    }
  };

  // Save Batch Budgets
  const handleSaveBulkBudgets = async (
    updates: Array<{ category: string; monthly_limit: number }>
  ) => {
    const res = await fetch(`${apiBase}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgets: updates }),
    });
    if (res.ok) {
      await fetchOverview(selectedMonth);
      showToast(`Monatsbudgets gespeichert (${updates.length} Gruppen)`);
    }
  };

  // Toggle pinning a budget group to the Horizon Dashboard preview
  const handleTogglePreviewPin = async (category: string) => {
    if (!data) return;
    const current = data.previewConfig.previewBudgetCategories || [];
    const exists = current.includes(category);
    const nextPinned = exists
      ? current.filter((c) => c !== category)
      : [...current, category];
    const nextElements = data.previewConfig.enabledElements.includes('group_budgets')
      ? data.previewConfig.enabledElements
      : [...data.previewConfig.enabledElements, 'group_budgets' as const];
    await handleSavePreviewConfig({
      enabledElements: nextElements,
      previewBudgetCategories: nextPinned,
    });
  };

  // Quick Import Handlers
  const handleSaveQuickImportConfig = async (cfg: Partial<QuickImportConfig>) => {
    const res = await fetch(`${apiBase}/quick-import/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (res.ok) {
      await fetchOverview(selectedMonth);
    }
  };

  const handleClearCookies = async () => {
    await fetch(`${apiBase}/quick-import/cookies/clear`, { method: 'POST' });
    await fetchOverview(selectedMonth);
    showToast('Cookie-Tresor geleert');
  };

  const handleScanDownloads = async () => {
    const res = await fetch(`${apiBase}/quick-import/scan-downloads`, { method: 'POST' });
    const json = await res.json();
    await fetchOverview(selectedMonth);
    return { events: json.events || [] };
  };

  const handleSimulateDownload = async () => {
    const res = await fetch(`${apiBase}/quick-import/simulate-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName: data?.quickImportConfig.defaultAccountName || 'Girokonto' }),
    });
    const json = await res.json();
    await fetchOverview(selectedMonth);
    showToast(`George Export importiert: ${json.insertedCount || 0} neue Buchungen`);
    return json;
  };

  const handleAutoImportFile = async (file: File, accountName: string) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Content = window.btoa(binary);
    const res = await fetch(`${apiBase}/import-bank-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        base64Content,
        accountName,
      }),
    });
    const json = await res.json();
    await fetchOverview(selectedMonth);
    showToast(
      `Importiert (${file.name}): ${json.importedCount || 0} neu, ${json.skippedDuplicates || 0} Duplikate übersprungen`
    );
  };

  // Create manual transaction
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txPayee || !txAmount) return;
    const rawAmt = Math.abs(Number(txAmount));
    const signedAmount = txType === 'income' ? rawAmt : -rawAmt;
    const res = await fetch(`${apiBase}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_date: txDate,
        payee: txPayee,
        notes: txNotes,
        amount: signedAmount,
        category: txCategory || undefined,
        is_recurring: txRecurring ? 1 : 0,
      }),
    });
    if (res.ok) {
      setTxPayee('');
      setTxNotes('');
      setTxAmount('');
      setShowAddTxForm(false);
      const addedMonth = txDate.slice(0, 7);
      setSelectedMonth(addedMonth);
      await fetchOverview(addedMonth);
      showToast('Buchung gespeichert');
    }
  };

  const handleUpdateTxCategory = async (
    tx: TransactionRow,
    newCategory: string,
    newRecurring: boolean
  ) => {
    await fetch(`${apiBase}/transactions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tx.id,
        category: newCategory,
        is_recurring: newRecurring ? 1 : 0,
      }),
    });
    await fetchOverview(selectedMonth);
    showToast(`Kategorie auf "${getCategoryMeta(newCategory).labelDe}" aktualisiert`);
  };

  const handleDeleteTx = async (id: number) => {
    await fetch(`${apiBase}/transactions?id=${id}`, { method: 'DELETE' });
    await fetchOverview(selectedMonth);
    showToast('Buchung gelöscht');
  };

  const handleSelectCategoryFromSunburst = (cat: string) => {
    if (!cat || txCategoryFilter === cat) {
      setTxCategoryFilter('ALL');
    } else {
      setTxCategoryFilter(cat);
      showToast(`Gefiltert nach "${getCategoryMeta(cat).labelDe}"`);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter((t) => {
      if (txCategoryFilter !== 'ALL' && t.category !== txCategoryFilter) return false;
      if (txSearch.trim()) {
        const q = txSearch.toLowerCase();
        const matchPayee = (t.payee || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchCat = (t.category || '').toLowerCase().includes(q);
        const matchDe = getCategoryMeta(t.category).labelDe.toLowerCase().includes(q);
        if (!matchPayee && !matchNotes && !matchCat && !matchDe) return false;
      }
      return true;
    });
  }, [data, txCategoryFilter, txSearch]);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, color: '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif' }}>
        Lade thassi.finances...
      </div>
    );
  }

  const {
    kpis,
    allBudgets,
    recurringFixed,
    balanceConfig,
    previewConfig,
    quickImportConfig,
    sunburstGroups,
    sunburstMerchants,
  } = data;

  const budgetUtilizationPct =
    kpis.totalMonthlyBudget > 0
      ? Math.round((kpis.expenses / kpis.totalMonthlyBudget) * 100)
      : 0;

  const recurringMonthlySum = recurringFixed.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0
  );

  const allCategoryIds = Array.from(
    new Set([
      ...CATEGORY_DEFINITIONS.map((c) => c.id),
      ...allBudgets.map((b) => b.category),
    ])
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        padding: '20px 26px 48px',
      }}
    >
      {/* Top Navigation & Action Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          paddingBottom: 16,
          marginBottom: 20,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href={dashboardHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 9,
              background: '#111827',
              border: '1px solid #1e293b',
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
            }}
            title="Zurück zum Thassi Horizon Dashboard"
          >
            ← Dashboard
          </a>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                💶 thassi.finances
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(16,185,129,0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.3)',
                  fontWeight: 700,
                }}
              >
                v1.1 • Sparkasse George Ready
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {balanceConfig.accountName}{' '}
              {balanceConfig.iban ? `• ${balanceConfig.iban}` : ''} •{' '}
              {data.totalTransactionCount} Buchungen im Zeitraum ({selectedMonth})
            </div>
          </div>
        </div>

        {/* Center Clean 3-Tab Navigation */}
        <div
          style={{
            display: 'flex',
            background: '#111827',
            padding: 4,
            borderRadius: 11,
            border: '1px solid #1e293b',
            gap: 4,
          }}
        >
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'overview' ? '#1e293b' : 'transparent',
              color: activeTab === 'overview' ? '#f8fafc' : '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📊 Übersicht
          </button>
          <button
            onClick={() => setActiveTab('preview_budgets')}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'preview_budgets' ? '#1e293b' : 'transparent',
              color: activeTab === 'preview_budgets' ? '#f8fafc' : '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🎛️ Preview & Budgets
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'transactions' ? '#1e293b' : 'transparent',
              color: activeTab === 'transactions' ? '#f8fafc' : '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🧾 Buchungen ({data.totalTransactionCount})
          </button>
        </div>

        {/* Right Controls: Month Picker, Privacy Toggle, Quick Import */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#111827',
              border: '1px solid #1e293b',
              borderRadius: 9,
              padding: 2,
            }}
          >
            <button
              onClick={() => handleStepMonth(-1)}
              title="Vorheriger Monat"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ◀
            </button>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: 'none',
                padding: '5px 6px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {data.availableMonths.map((m) => (
                <option key={m} value={m} style={{ background: '#0f172a' }}>
                  📅 {m}
                </option>
              ))}
              <option value="all" style={{ background: '#0f172a' }}>
                📅 Gesamtzeitraum
              </option>
            </select>
            <button
              onClick={() => handleStepMonth(1)}
              title="Nächster Monat"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ▶
            </button>
          </div>

          <button
            onClick={() => setPrivacyMasked(!privacyMasked)}
            title="Zahlen auf dieser Seite ein-/ausblenden"
            style={{
              padding: '7px 11px',
              borderRadius: 9,
              border: '1px solid #1e293b',
              background: privacyMasked ? 'rgba(245,158,11,0.15)' : '#111827',
              color: privacyMasked ? '#fbbf24' : '#94a3b8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {privacyMasked ? '🔒 Privat' : '👁️ Sichtbar'}
          </button>

          <button
            onClick={() => setQuickImportOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 9,
              border: '1px solid rgba(56,189,248,0.45)',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(2,132,199,0.28)',
            }}
          >
            ⚡ Quick Import
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 10,
            background: toast.ok ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
            border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`,
            color: toast.ok ? '#34d399' : '#f87171',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: CLEAN OVERVIEW                                                 */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* Sub-bar: Dashboard Preview Status Pill & Round-up Filter */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('preview_budgets')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: '#111827',
                  border: '1px solid #1e293b',
                  color: '#cbd5e1',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <span>
                  {previewConfig.hiddenByDefault
                    ? '🔒 Dashboard-Preview: Standardmäßig versteckt (Klick zum Anzeigen)'
                    : '👁️ Dashboard-Preview: Direkt sichtbar'}
                </span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>Anpassen →</span>
              </button>

              {txCategoryFilter !== 'ALL' && (
                <button
                  onClick={() => setTxCategoryFilter('ALL')}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    background: 'rgba(56,189,248,0.15)',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Filter: {getCategoryMeta(txCategoryFilter).labelDe} ✕
                </button>
              )}
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                color: '#94a3b8',
                cursor: 'pointer',
                background: '#111827',
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid #1e293b',
              }}
            >
              <input
                type="checkbox"
                checked={previewConfig.excludeRoundUpsInExpenses}
                onChange={() =>
                  handleSavePreviewConfig({
                    excludeRoundUpsInExpenses: !previewConfig.excludeRoundUpsInExpenses,
                  })
                }
              />
              <span>Notgroschen-Aufrundungssparen separat als Sparen werten</span>
            </label>
          </div>

          {/* 4 Clean KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            {/* Card 1: Aktueller Kontostand */}
            <div
              style={{
                background: 'linear-gradient(145deg, #111827, #0f172a)',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  🏦 Aktueller Kontostand
                </span>
                <button
                  onClick={() => {
                    setInlineBalanceInput(String(balanceConfig.currentBalance));
                    setEditingBalanceInline(!editingBalanceInline);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {editingBalanceInline ? 'Abbrechen' : '✏️ Ändern'}
                </button>
              </div>

              {editingBalanceInline ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    type="number"
                    step="0.01"
                    value={inlineBalanceInput}
                    onChange={(e) => setInlineBalanceInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#090d16',
                      border: '1px solid #38bdf8',
                      borderRadius: 7,
                      padding: '6px 9px',
                      color: '#f8fafc',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                  <button
                    onClick={async () => {
                      const val = Number(inlineBalanceInput);
                      if (Number.isFinite(val)) {
                        await handleSaveBalance({ currentBalance: val });
                        setEditingBalanceInline(false);
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: 'none',
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: balanceConfig.currentBalance >= 0 ? '#38bdf8' : '#f87171',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {formatEur(balanceConfig.currentBalance, privacyMasked)}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                {balanceConfig.accountName} • Stand{' '}
                {balanceConfig.updatedAt?.slice(0, 10) || 'Heute'}
              </div>
            </div>

            {/* Card 2: Ausgaben (Tag & Woche) */}
            <div
              style={{
                background: 'linear-gradient(145deg, #111827, #0f172a)',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                }}
              >
                📅 Ausgaben (Tag / Woche)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
                    {formatEur(kpis.expensesDay, privacyMasked)}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {kpis.expensesDayLabel || `Tag (${kpis.expensesDayDate})`}
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: '#1e293b' }} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>
                    {formatEur(kpis.expensesWeek, privacyMasked)}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    7-Tage ({kpis.expensesWeekRangeLabel})
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Monats-Cashflow */}
            <div
              style={{
                background: 'linear-gradient(145deg, #111827, #0f172a)',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                }}
              >
                💸 Monats-Cashflow ({kpis.activeMonth})
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: kpis.net >= 0 ? '#10b981' : '#ef4444',
                  letterSpacing: '-0.02em',
                }}
              >
                {kpis.net >= 0 && !privacyMasked ? '+' : ''}
                {formatEur(kpis.net, privacyMasked)}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 11,
                  marginTop: 6,
                  color: '#94a3b8',
                }}
              >
                <span style={{ color: '#34d399' }}>
                  ↑ {formatEur(kpis.income, privacyMasked)}
                </span>
                <span style={{ color: '#f87171' }}>
                  ↓ {formatEur(kpis.expenses, privacyMasked)}
                </span>
              </div>
            </div>

            {/* Card 4: Monatsbudget & Sparquote */}
            <div
              style={{
                background: 'linear-gradient(145deg, #111827, #0f172a)',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  🎯 Monatsbudget & Sparquote
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: kpis.savingsRatePct >= 15 ? '#34d399' : '#fbbf24',
                  }}
                >
                  Sparquote {privacyMasked ? '••%' : `${kpis.savingsRatePct}%`}
                </span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: budgetUtilizationPct <= 100 ? '#f8fafc' : '#ef4444',
                }}
              >
                {formatEur(kpis.expenses, privacyMasked)}{' '}
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  / {formatEur(kpis.totalMonthlyBudget, privacyMasked)}
                </span>
              </div>
              <div
                style={{
                  height: 7,
                  background: '#090d16',
                  borderRadius: 999,
                  overflow: 'hidden',
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, budgetUtilizationPct)}%`,
                    height: '100%',
                    background:
                      budgetUtilizationPct > 100
                        ? '#ef4444'
                        : budgetUtilizationPct > 85
                        ? '#f59e0b'
                        : '#10b981',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main Visual Row: Sunburst Chart + Monthly Group Budgets */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
              gap: 18,
              marginBottom: 20,
            }}
          >
            <SunburstChart
              groupsData={sunburstGroups}
              merchantsData={sunburstMerchants}
              activeCategoryFilter={txCategoryFilter === 'ALL' ? '' : txCategoryFilter}
              onSelectCategory={handleSelectCategoryFromSunburst}
              dataHidden={privacyMasked}
            />

            <BudgetManager
              allBudgets={allBudgets}
              previewBudgetCategories={previewConfig.previewBudgetCategories}
              onSaveBudgets={handleSaveBulkBudgets}
              onTogglePreviewCategory={handleTogglePreviewPin}
              dataHidden={privacyMasked}
              compactMode={true}
            />
          </div>

          {/* Clean Recent & Recurring Transactions Card */}
          <div
            style={{
              background: '#111827',
              border: '1px solid #1e293b',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setBottomListMode('recent')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: bottomListMode === 'recent' ? '#1e293b' : 'transparent',
                    color: bottomListMode === 'recent' ? '#f8fafc' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🧾 Letzte Buchungen ({filteredTransactions.length})
                </button>
                <button
                  onClick={() => setBottomListMode('recurring')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: bottomListMode === 'recurring' ? '#1e293b' : 'transparent',
                    color: bottomListMode === 'recurring' ? '#f8fafc' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔄 Wiederkehrende Fixkosten ({formatEur(recurringMonthlySum, privacyMasked)})
                </button>
              </div>

              <button
                onClick={() => setActiveTab('transactions')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Alle Buchungen verwalten →
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 8,
              }}
            >
              {(bottomListMode === 'recent'
                ? filteredTransactions.slice(0, 9)
                : recurringFixed.slice(0, 9)
              ).map((tx) => {
                const catMeta = getCategoryMeta(tx.category);
                return (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '9px 12px',
                      borderRadius: 9,
                      background: '#090d16',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 17 }}>{catMeta.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {tx.payee}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {tx.tx_date} • {catMeta.labelDe}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        marginLeft: 10,
                        color: tx.amount >= 0 ? '#34d399' : '#f8fafc',
                      }}
                    >
                      {tx.amount >= 0 && !privacyMasked ? '+' : ''}
                      {formatEur(tx.amount, privacyMasked)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PREVIEW CONFIG & MONTHLY BUDGETS                               */}
      {/* ===================================================================== */}
      {activeTab === 'preview_budgets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <PreviewConfigPanel
            previewConfig={previewConfig}
            balanceConfig={balanceConfig}
            allBudgets={allBudgets}
            kpis={kpis}
            onUpdatePreviewConfig={handleSavePreviewConfig}
            onUpdateBalanceConfig={handleSaveBalance}
            onOpenQuickImport={() => setQuickImportOpen(true)}
          />

          <BudgetManager
            allBudgets={allBudgets}
            previewBudgetCategories={previewConfig.previewBudgetCategories}
            onSaveBudgets={handleSaveBulkBudgets}
            onTogglePreviewCategory={handleTogglePreviewPin}
            dataHidden={privacyMasked}
            compactMode={false}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TRANSACTIONS & MANUAL BOOKINGS                                 */}
      {/* ===================================================================== */}
      {activeTab === 'transactions' && (
        <div
          style={{
            background: '#111827',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                🧾 Buchungen ({filteredTransactions.length} von {data.totalTransactionCount})
              </h3>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Durchsuche Buchungen, ändere Kategorien live oder erfasse neue Buchungen
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 Händler oder Text suchen..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                style={{
                  background: '#090d16',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '7px 12px',
                  color: '#f8fafc',
                  fontSize: 12,
                  minWidth: 210,
                }}
              />
              <select
                value={txCategoryFilter}
                onChange={(e) => setTxCategoryFilter(e.target.value)}
                style={{
                  background: '#090d16',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '7px 12px',
                  color: '#f8fafc',
                  fontSize: 12,
                }}
              >
                <option value="ALL">Alle Gruppen ({data.transactions.length})</option>
                {allCategoryIds.map((c) => (
                  <option key={c} value={c}>
                    {getCategoryMeta(c).icon} {getCategoryMeta(c).labelDe}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowAddTxForm(!showAddTxForm)}
                style={{
                  padding: '7px 13px',
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: showAddTxForm ? '#1e293b' : '#0284c7',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showAddTxForm ? '✕ Schließen' : '+ Buchung erfassen'}
              </button>
            </div>
          </div>

          {/* Collapsible Manual Booking Form */}
          {showAddTxForm && (
            <form
              onSubmit={handleAddTransaction}
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Datum
                </label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Empfänger / Händler
                </label>
                <input
                  type="text"
                  placeholder="z.B. BILLA, EVN"
                  value={txPayee}
                  onChange={(e) => setTxPayee(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Notiz / Buchungstext
                </label>
                <input
                  type="text"
                  placeholder="Optional..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Betrag (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="45.90"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Typ
                </label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as 'expense' | 'income')}
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                >
                  <option value="expense">Ausgabe (-)</option>
                  <option value="income">Einnahme (+)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Gruppe
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 7,
                    padding: '7px 9px',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                >
                  <option value="">✨ Auto-Kategorie</option>
                  {allCategoryIds.map((c) => (
                    <option key={c} value={c}>
                      {getCategoryMeta(c).labelDe}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Speichern
              </button>
            </form>
          )}

          {/* Transactions Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #1e293b',
                    color: '#94a3b8',
                    textAlign: 'left',
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '10px 8px' }}>Datum</th>
                  <th style={{ padding: '10px 8px' }}>Händler / Empfänger</th>
                  <th style={{ padding: '10px 8px' }}>Notiz / Details</th>
                  <th style={{ padding: '10px 8px' }}>Gruppe</th>
                  <th style={{ padding: '10px 8px' }}>Fixkosten</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Betrag</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{
                      borderBottom: '1px solid rgba(30,41,59,0.55)',
                    }}
                  >
                    <td style={{ padding: '10px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {tx.tx_date}
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: '#f8fafc' }}>
                      {tx.payee}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: '#64748b',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={tx.notes}
                    >
                      {tx.notes}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <select
                        value={tx.category}
                        onChange={(e) =>
                          handleUpdateTxCategory(tx, e.target.value, Boolean(tx.is_recurring))
                        }
                        style={{
                          background: '#090d16',
                          color: '#e2e8f0',
                          border: '1px solid #334155',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 12,
                        }}
                      >
                        {allCategoryIds.map((c) => (
                          <option key={c} value={c}>
                            {getCategoryMeta(c).icon} {getCategoryMeta(c).labelDe}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(tx.is_recurring)}
                        onChange={(e) =>
                          handleUpdateTxCategory(tx, tx.category, e.target.checked)
                        }
                      />
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        color: tx.amount >= 0 ? '#34d399' : '#f8fafc',
                      }}
                    >
                      {tx.amount >= 0 && !privacyMasked ? '+' : ''}
                      {formatEur(tx.amount, privacyMasked)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        title="Buchung löschen"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Global Quick Import Flyout */}
      <QuickImportFlyout
        isOpen={quickImportOpen}
        onClose={() => setQuickImportOpen(false)}
        config={quickImportConfig}
        onUpdateConfig={handleSaveQuickImportConfig}
        onClearCookies={handleClearCookies}
        onScanDownloads={handleScanDownloads}
        onSimulateDownload={handleSimulateDownload}
        onAutoImportFile={handleAutoImportFile}
      />
    </div>
  );
}
