import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  TransactionRow,
  CategoryBreakdownItem,
  FinanceKpis,
  FixedCostItem,
  PreviewConfig,
  AccountBalanceConfig,
  QuickImportConfig,
  ExportReminderStatus,
  BANK_PRESETS,
  CATEGORY_DEFINITIONS,
  DEFAULT_FIXED_COSTS,
  DEFAULT_PREVIEW_CONFIG,
  getCategoryMeta,
} from '../../shared/finance-types';

const ALL_CATEGORIES = CATEGORY_DEFINITIONS.map((c) => c.id);
const getCategoryLabelDe = (cat: string) => getCategoryMeta(cat).labelDe;

const IDB_NAME = 'thassi_finance_fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'downloads_dir_handle';

async function saveDirHandleToIdb(handle: any): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadDirHandleFromIdb(): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

interface OverviewPayload {
  availableMonths: string[];
  activeMonth: string;
  totalTransactionCount: number;
  transactions: TransactionRow[];
  kpis: FinanceKpis;
  previewConfig: PreviewConfig;
  balanceConfig: AccountBalanceConfig;
  quickImportConfig: QuickImportConfig;
  exportReminder?: ExportReminderStatus;
  categoryBreakdown: CategoryBreakdownItem[];
  allBudgets: CategoryBreakdownItem[];
  fixedCosts?: FixedCostItem[];
  recurringFixed: TransactionRow[];
}

interface ImportReport {
  importedCount: number;
  skippedDuplicates: number;
  totalParsed: number;
  format: string;
  fileName?: string;
  kpis?: FinanceKpis;
}

type DrawerType = null | 'fixed' | 'transactions' | 'sync' | 'settings';

function getApiBase(): string {
  const path = window.location.pathname;
  const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  if (ingressMatch) {
    return `${ingressMatch[1]}/api/apps/finance-analytics`;
  }
  return '/api/apps/finance-analytics';
}

const API_BASE = getApiBase();

function fmtEur(val: number, masked = false, showPlus = false): string {
  if (masked) return '••••••';
  const abs = Math.abs(val || 0);
  const formatted = abs.toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (val < -0.005) return `-€ ${formatted}`;
  if (val > 0.005 && showPlus) return `+€ ${formatted}`;
  return `€ ${formatted}`;
}

function fmtCompactEur(val: number, masked = false, showPlus = false): string {
  if (masked) return '••••';
  const abs = Math.abs(val || 0);
  const formatted = abs.toLocaleString('de-AT', {
    minimumFractionDigits: abs >= 100 ? 0 : 2,
    maximumFractionDigits: abs >= 100 ? 0 : 2,
  });
  if (val < -0.005) return `-€ ${formatted}`;
  if (val > 0.005 && showPlus) return `+€ ${formatted}`;
  return `€ ${formatted}`;
}

export function App() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Slide-over drawer for secondary views (keeps main page ultra-clean)
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [txPage, setTxPage] = useState<number>(1);
  const TX_PER_PAGE = 50;

  // Chart interaction states
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [hoveredDonutSlice, setHoveredDonutSlice] = useState<string | null>(null);
  const [donutMode, setDonutMode] = useState<'variable' | 'total'>('variable');

  // Privacy mask
  const [privacyMasked, setPrivacyMasked] = useState<boolean>(false);

  // Inline balance edit
  const [editingBalance, setEditingBalance] = useState<boolean>(false);
  const [balanceDraft, setBalanceDraft] = useState<string>('');

  // Inline budget edit
  const [editingBudgetCat, setEditingBudgetCat] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<string>('');
  const [savingBudget, setSavingBudget] = useState<boolean>(false);

  // Fixed costs edit state
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [fixedNameDraft, setFixedNameDraft] = useState<string>('');
  const [fixedAmountDraft, setFixedAmountDraft] = useState<string>('');
  const [newFixedName, setNewFixedName] = useState<string>('');
  const [newFixedAmount, setNewFixedAmount] = useState<string>('');
  const [newFixedGroup, setNewFixedGroup] = useState<
    'Wohnen & Energie' | 'Versicherungen' | 'Abos & Internet'
  >('Wohnen & Energie');

  // Inline new transaction form in drawer
  const [showAddTx, setShowAddTx] = useState<boolean>(false);
  const [newTxDate, setNewTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [newTxPayee, setNewTxPayee] = useState<string>('');
  const [newTxCategory, setNewTxCategory] = useState<string>('Groceries');
  const [newTxAmount, setNewTxAmount] = useState<string>('');

  // Settings drawer state
  const [settingsBalance, setSettingsBalance] = useState<string>('');
  const [settingsAccountName, setSettingsAccountName] = useState<string>('');
  const [settingsIban, setSettingsIban] = useState<string>('');
  const [settingsAutoAdjust, setSettingsAutoAdjust] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Import & Bank-Sync state
  const [importAccount] = useState<string>('Girokonto');
  const [importReplaceAll, setImportReplaceAll] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [scanningDownloads, setScanningDownloads] = useState<boolean>(false);
  const [globalDragOver, setGlobalDragOver] = useState<boolean>(false);
  const [localDirHandle, setLocalDirHandle] = useState<any | null>(null);
  const [localDirName, setLocalDirName] = useState<string>('');
  const [verfuegerDraft, setVerfuegerDraft] = useState<string>('');
  const [bankPresetId, setBankPresetId] = useState<string>('george_at');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const processedLocalFilesRef = useRef<Set<string>>(new Set());

  const notify = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const fetchOverview = async (monthOverride?: string) => {
    try {
      const targetMonth = monthOverride !== undefined ? monthOverride : selectedMonth;
      const query = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : '';
      const res = await fetch(`${API_BASE}/overview${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OverviewPayload = await res.json();
      setOverview(data);
      if (!selectedMonth && data.activeMonth) {
        setSelectedMonth(data.activeMonth);
      }
      if (data.balanceConfig) {
        setSettingsBalance(String(data.balanceConfig.currentBalance));
        setSettingsAccountName(data.balanceConfig.accountName || 'Girokonto');
        setSettingsIban(data.balanceConfig.iban || '');
        setSettingsAutoAdjust(Boolean(data.balanceConfig.autoAdjustOnImport));
      }
      if (data.quickImportConfig) {
        setVerfuegerDraft(data.quickImportConfig.verfuegernummer || '');
        setBankPresetId(data.quickImportConfig.bankId || 'george_at');
      }
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Laden der Finanzdaten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview('');
    loadDirHandleFromIdb().then((h) => {
      if (h) {
        setLocalDirHandle(h);
        setLocalDirName(h.name || 'Downloads');
      }
    });

    const applyHashNavigation = () => {
      const hash = (window.location.hash || '').toLowerCase();
      if (hash.includes('export') || hash.includes('sync') || hash.includes('import')) {
        setActiveDrawer('sync');
      } else if (hash.includes('settings')) {
        setActiveDrawer('settings');
      } else if (hash.includes('fixed')) {
        setActiveDrawer('fixed');
      } else if (hash.includes('tx') || hash.includes('transactions')) {
        setActiveDrawer('transactions');
      }
    };
    applyHashNavigation();
    window.addEventListener('hashchange', applyHashNavigation);
    return () => window.removeEventListener('hashchange', applyHashNavigation);
  }, []);

  // Global window drag & drop for George ZIP / CSV
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        setGlobalDragOver(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setGlobalDragOver(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.files?.length) {
        e.preventDefault();
        setGlobalDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) {
          void handleImmediateFileImport(f);
        }
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [selectedMonth, importAccount]);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    setTxPage(1);
    fetchOverview(newMonth);
  };

  const stepMonth = (delta: number) => {
    if (!overview || overview.availableMonths.length === 0) return;
    const months = overview.availableMonths;
    const currentIdx = months.indexOf(selectedMonth);
    if (currentIdx === -1) {
      handleMonthChange(months[0]);
      return;
    }
    const nextIdx = currentIdx - delta;
    if (nextIdx >= 0 && nextIdx < months.length) {
      handleMonthChange(months[nextIdx]);
    }
  };

  const handleSaveInlineBalance = async () => {
    const num = Number(balanceDraft.replace(',', '.'));
    if (!Number.isFinite(num)) {
      setEditingBalance(false);
      return;
    }
    try {
      await fetch(`${API_BASE}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentBalance: num }),
      });
      setEditingBalance(false);
      await fetchOverview(selectedMonth);
      notify('Kontostand aktualisiert');
    } catch {
      setEditingBalance(false);
    }
  };

  const handleSaveCategoryBudget = async (category: string) => {
    const num = Number(budgetDraft.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      setEditingBudgetCat(null);
      return;
    }
    setSavingBudget(true);
    try {
      await fetch(`${API_BASE}/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, monthly_limit: num }),
      });
      setEditingBudgetCat(null);
      await fetchOverview(selectedMonth);
      notify(`Budget ${getCategoryLabelDe(category)}: € ${num.toFixed(0)}`);
    } finally {
      setSavingBudget(false);
    }
  };

  const fixedCostsList: FixedCostItem[] = useMemo(() => {
    if (overview?.fixedCosts && overview.fixedCosts.length > 0) {
      return overview.fixedCosts;
    }
    return DEFAULT_FIXED_COSTS;
  }, [overview]);

  const saveFixedCostsList = async (updated: FixedCostItem[]) => {
    await fetch(`${API_BASE}/fixed-costs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updated }),
    });
    await fetchOverview(selectedMonth);
  };

  const handleSaveFixedEdit = async (item: FixedCostItem) => {
    const parsedAmount = Number(fixedAmountDraft.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setEditingFixedId(null);
      return;
    }
    const updated = fixedCostsList.map((f) =>
      f.id === item.id
        ? {
            ...f,
            name: fixedNameDraft.trim() || f.name,
            amount: Number(parsedAmount.toFixed(2)),
          }
        : f
    );
    setEditingFixedId(null);
    await saveFixedCostsList(updated);
    notify(`Fixkosten "${item.name}" gespeichert`);
  };

  const handleDeleteFixedCost = async (id: string) => {
    const updated = fixedCostsList.filter((f) => f.id !== id);
    await saveFixedCostsList(updated);
    notify('Fixkosten-Position entfernt');
  };

  const handleAddFixedCost = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(newFixedAmount.replace(',', '.'));
    if (!newFixedName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const category =
      newFixedGroup === 'Versicherungen'
        ? 'Insurance & Finance'
        : newFixedGroup === 'Abos & Internet'
          ? 'Subscriptions & Telecom'
          : 'Housing & Utilities';
    const newItem: FixedCostItem = {
      id: `fixed-${Date.now()}`,
      name: newFixedName.trim(),
      amount: Number(amount.toFixed(2)),
      category,
      groupLabel: newFixedGroup,
      matchPattern: newFixedName.trim().toLowerCase(),
    };
    await saveFixedCostsList([...fixedCostsList, newItem]);
    setNewFixedName('');
    setNewFixedAmount('');
    notify(`Fixkosten "${newItem.name}" hinzugefügt`);
  };

  const handleRecategorizeTx = async (txId: number, newCategory: string, applyToPayee = true) => {
    try {
      await fetch(`${API_BASE}/transactions/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId, category: newCategory, applyToPayee }),
      });
      await fetchOverview(selectedMonth);
      notify(`Kategorie → ${getCategoryLabelDe(newCategory)}`);
    } catch {
      setErrorMsg('Kategorie konnte nicht geändert werden');
    }
  };

  const handleDeleteTx = async (txId: number) => {
    try {
      await fetch(`${API_BASE}/transactions/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId }),
      });
      await fetchOverview(selectedMonth);
      notify('Buchung gelöscht');
    } catch {
      setErrorMsg('Buchung konnte nicht gelöscht werden');
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(newTxAmount.replace(',', '.'));
    if (!newTxPayee.trim() || !Number.isFinite(amountNum) || amountNum === 0) return;
    const finalAmount =
      newTxCategory === 'Salary & Income' ? Math.abs(amountNum) : -Math.abs(amountNum);

    await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_date: newTxDate,
        payee: newTxPayee.trim(),
        category: newTxCategory,
        amount: finalAmount,
        account: 'Girokonto',
        is_recurring: false,
        notes: '',
      }),
    });
    setNewTxPayee('');
    setNewTxAmount('');
    setShowAddTx(false);
    await fetchOverview(selectedMonth);
    notify('Buchung hinzugefügt');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const bal = Number(settingsBalance.replace(',', '.'));
      await fetch(`${API_BASE}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBalance: Number.isFinite(bal) ? bal : 0,
          accountName: settingsAccountName.trim() || 'Girokonto',
          iban: settingsIban.trim(),
          autoAdjustOnImport: settingsAutoAdjust,
        }),
      });
      await fetchOverview(selectedMonth);
      notify('Kontoeinstellungen gespeichert');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleImmediateFileImport = async (file: File): Promise<boolean> => {
    setImporting(true);
    setImportReport(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);

      const res = await fetch(`${API_BASE}/import-bank-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Content: b64,
          fileName: file.name,
          accountName: importAccount || 'Girokonto',
          replaceAll: importReplaceAll,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import fehlgeschlagen');
      setImportReport({ ...data, fileName: file.name });
      await fetchOverview(selectedMonth);
      notify(
        `${file.name}: +${data.importedCount ?? 0} Buchungen (${
          data.skippedDuplicates ?? 0
        } Duplikate übersprungen)`
      );
      return true;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Datei-Import');
      return false;
    } finally {
      setImporting(false);
    }
  };

  const linkAndScanLocalDownloadsFolder = async (promptIfMissing = true): Promise<boolean> => {
    setScanningDownloads(true);
    try {
      let dirHandle = localDirHandle;
      if (!dirHandle && promptIfMissing && typeof (window as any).showDirectoryPicker === 'function') {
        dirHandle = await (window as any).showDirectoryPicker({
          id: 'thassi_bank_downloads',
          startIn: 'downloads',
          mode: 'read',
        });
        if (dirHandle) {
          setLocalDirHandle(dirHandle);
          setLocalDirName(dirHandle.name || 'Downloads');
          await saveDirHandleToIdb(dirHandle);
        }
      }

      if (dirHandle) {
        const candidates: Array<{ file: File; mtime: number }> = [];
        const cutoffMs = Date.now() - 35 * 86400000;
        for await (const entry of dirHandle.values()) {
          if (entry.kind !== 'file') continue;
          const lower = String(entry.name || '').toLowerCase();
          if (
            !lower.endsWith('.zip') &&
            !lower.endsWith('.csv') &&
            !lower.endsWith('.xml') &&
            !lower.endsWith('.sta') &&
            !lower.endsWith('.mt940')
          ) {
            continue;
          }
          const file: File = await entry.getFile();
          if (file.size >= 40 && file.size <= 15 * 1024 * 1024 && file.lastModified >= cutoffMs) {
            candidates.push({ file, mtime: file.lastModified });
          }
        }
        candidates.sort((a, b) => b.mtime - a.mtime);

        for (const cand of candidates.slice(0, 3)) {
          const sig = `${cand.file.name}:${cand.file.size}:${cand.file.lastModified}`;
          if (processedLocalFilesRef.current.has(sig) && !promptIfMissing) continue;
          processedLocalFilesRef.current.add(sig);
          const ok = await handleImmediateFileImport(cand.file);
          if (ok) return true;
        }
      }

      const res = await fetch(`${API_BASE}/quick-import/scan-downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      const events = Array.isArray(data.events) ? data.events : [];
      const totalImported = events.reduce(
        (acc: number, ev: any) => acc + (Number(ev.insertedCount) || 0),
        0
      );
      if (totalImported > 0) {
        notify(`${totalImported} Buchungen aus Downloads importiert`);
        await fetchOverview(selectedMonth);
        return true;
      } else if (promptIfMissing) {
        notify('Keine neuen Exporte im Ordner gefunden');
      }
      return false;
    } catch {
      return false;
    } finally {
      setScanningDownloads(false);
    }
  };

  const handleOpenBankPopup = () => {
    const preset = BANK_PRESETS.find((b) => b.id === bankPresetId);
    const quickCfg = overview?.quickImportConfig;
    const url = preset?.url || quickCfg?.loginUrl || 'https://george.sparkasse.at/index.html#/login';
    const verfueger = verfuegerDraft.trim() || quickCfg?.verfuegernummer || '';
    if (verfueger) {
      navigator.clipboard?.writeText(verfueger).catch(() => {});
      notify(`Verfügernummer (${verfueger}) kopiert — George geöffnet`);
    }
    const width = 1080;
    const height = 780;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    window.open(
      url,
      'thassi_bank_login',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  const triggerFileExport = (format: 'csv_de' | 'csv_en' | 'tax_report' | 'json') => {
    const m = selectedMonth || 'all';
    const url = `${API_BASE}/export?format=${encodeURIComponent(format)}&month=${encodeURIComponent(
      m
    )}&category=${encodeURIComponent(filterCategory)}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Filtered transactions for Drawer
  const filteredTransactions = useMemo(() => {
    const all = overview?.transactions || [];
    const q = searchQuery.trim().toLowerCase();
    return all.filter((tx) => {
      if (filterCategory !== 'ALL' && tx.category !== filterCategory) return false;
      if (q) {
        const hay = `${tx.payee} ${tx.notes || ''} ${tx.category} ${getCategoryLabelDe(
          tx.category
        )} ${tx.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overview, filterCategory, searchQuery]);

  const pagedTransactions = useMemo(() => {
    const start = (txPage - 1) * TX_PER_PAGE;
    return filteredTransactions.slice(start, start + TX_PER_PAGE);
  }, [filteredTransactions, txPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / TX_PER_PAGE));

  // Variable Budgets sorted by highest spend first, then highest budget
  const variableBudgets = useMemo(() => {
    if (!overview) return [];
    const source = overview.allBudgets?.length ? overview.allBudgets : overview.categoryBreakdown;
    return source
      .filter((c) => c.group === 'living' || c.group === 'lifestyle')
      .sort((a, b) => b.spent - a.spent || b.budgetLimit - a.budgetLimit);
  }, [overview]);

  const fixedCostsTotal = useMemo(() => {
    return Number(fixedCostsList.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  }, [fixedCostsList]);

  const fixedCostsPaidTotal = useMemo(() => {
    return Number(
      fixedCostsList
        .filter((f) => f.paidThisMonth)
        .reduce((sum, f) => sum + (f.actualPaidAmount ?? f.amount), 0)
        .toFixed(2)
    );
  }, [fixedCostsList]);

  const fixedCostsPaidCount = useMemo(
    () => fixedCostsList.filter((f) => f.paidThisMonth).length,
    [fixedCostsList]
  );

  // Calendar & Variable KPIs
  const kpis = overview?.kpis;
  const elapsedDays = kpis?.elapsedDaysInMonth ?? 9;
  const daysInMonth = kpis?.daysInMonth ?? 30;
  const remainingDays = kpis?.remainingDaysInMonth ?? Math.max(0, daysInMonth - elapsedDays);
  const monthTimePct =
    daysInMonth > 0 ? Math.min(100, Math.round((elapsedDays / daysInMonth) * 1000) / 10) : 100;

  const varSpent = kpis?.expensesMonthVariable ?? 0;
  const varBudget = kpis?.variableBudgetTotal ?? 1590;
  const varRemaining = kpis?.variableBudgetRemaining ?? Number((varBudget - varSpent).toFixed(2));
  const varExtrapolated = kpis?.variableExtrapolatedSpend ?? varSpent;
  const varExtrapolatedRem =
    kpis?.variableExtrapolatedRemaining ?? Number((varBudget - varExtrapolated).toFixed(2));
  const varDailyFree =
    remainingDays > 0 && varRemaining > 0 ? Number((varRemaining / remainingDays).toFixed(2)) : 0;

  const todayStrictSpend = kpis?.expensesToday ?? 0;
  const weekVarSpend = kpis?.expensesWeekVariable ?? kpis?.expensesWeek ?? 0;

  // Build Daily Cumulative Spend Series for Big Diagram 1 (Burn & Extrapolation Chart)
  const dailyChartSeries = useMemo(() => {
    const dailyVar = new Array<number>(daysInMonth + 1).fill(0);
    const dailyFixed = new Array<number>(daysInMonth + 1).fill(0);
    const txs = overview?.transactions || [];
    const activeYm = overview?.activeMonth || selectedMonth;

    for (const tx of txs) {
      if (tx.amount >= 0) continue;
      if (tx.category === 'Investments') continue;
      if (activeYm && activeYm !== 'all' && !tx.tx_date.startsWith(activeYm)) continue;
      const dayNum = Number(tx.tx_date.slice(8, 10));
      if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > daysInMonth) continue;
      const grp = getCategoryMeta(tx.category).group;
      if (grp === 'living' || grp === 'lifestyle') {
        dailyVar[dayNum] += Math.abs(tx.amount);
      } else {
        dailyFixed[dayNum] += Math.abs(tx.amount);
      }
    }

    const points: Array<{
      day: number;
      dailyVar: number;
      dailyFixed: number;
      cumVar: number | null;
      extrapVar: number | null;
      idealPace: number;
    }> = [];

    let runningVar = 0;
    const dailyRate = elapsedDays > 0 ? varSpent / elapsedDays : 0;

    for (let d = 1; d <= daysInMonth; d++) {
      runningVar += dailyVar[d];
      const isActual = d <= elapsedDays;
      const isProjected = d >= elapsedDays;
      points.push({
        day: d,
        dailyVar: Number(dailyVar[d].toFixed(2)),
        dailyFixed: Number(dailyFixed[d].toFixed(2)),
        cumVar: isActual ? Number(runningVar.toFixed(2)) : null,
        extrapVar: isProjected
          ? Number((varSpent + dailyRate * (d - elapsedDays)).toFixed(2))
          : null,
        idealPace: Number(((varBudget / daysInMonth) * d).toFixed(2)),
      });
    }
    return points;
  }, [overview, daysInMonth, elapsedDays, varSpent, varBudget, selectedMonth]);

  // Build Slices for Big Diagram 2 (Donut Chart)
  const donutSlices = useMemo(() => {
    const palette = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];
    if (donutMode === 'variable') {
      const items: Array<{ id: string; label: string; value: number; color: string }> = [];
      variableBudgets.forEach((cat, idx) => {
        if (cat.spent > 0) {
          items.push({
            id: cat.category,
            label: cat.labelDe,
            value: cat.spent,
            color: cat.remaining < 0 ? '#ef4444' : palette[idx % palette.length],
          });
        }
      });
      if (varRemaining > 0) {
        items.push({
          id: '__remaining__',
          label: 'Restbudget frei',
          value: varRemaining,
          color: '#10b981',
        });
      }
      return items;
    } else {
      return [
        {
          id: '__fixed_paid__',
          label: 'Fixkosten abgebucht',
          value: fixedCostsPaidTotal,
          color: '#ef4444',
        },
        {
          id: '__fixed_open__',
          label: 'Fixkosten offen',
          value: Math.max(0, fixedCostsTotal - fixedCostsPaidTotal),
          color: '#52525b',
        },
        {
          id: '__var_spent__',
          label: 'Variabel ausgegeben',
          value: varSpent,
          color: '#f59e0b',
        },
        {
          id: '__var_free__',
          label: 'Variabel frei',
          value: Math.max(0, varRemaining),
          color: '#10b981',
        },
      ].filter((x) => x.value > 0);
    }
  }, [donutMode, variableBudgets, varRemaining, fixedCostsPaidTotal, fixedCostsTotal, varSpent]);

  if (loading && !overview) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-canvas)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        FINANZDATEN WERDEN GELADEN...
      </div>
    );
  }

  const exportReminder = overview?.exportReminder;
  const latestTxDate =
    exportReminder?.latestTxDate ||
    overview?.transactions?.[0]?.tx_date ||
    kpis?.expensesDayDate ||
    null;
  const daysSinceLatestTx =
    exportReminder?.daysSinceLatestTx ??
    (latestTxDate
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(`${latestTxDate}T12:00:00Z`).getTime()) / 86400000)
        )
      : null);
  const isDataStale =
    exportReminder !== undefined
      ? exportReminder.due
      : daysSinceLatestTx === null || daysSinceLatestTx >= 7;

  // SVG Burn Chart Dimensions & Scaling
  const chartW = 720;
  const chartH = 230;
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const maxChartY = Math.max(varBudget * 1.12, varExtrapolated * 1.1, varSpent * 1.1, 500);

  const xForDay = (d: number) =>
    padL + ((d - 1) / Math.max(1, daysInMonth - 1)) * plotW;
  const yForVal = (v: number) =>
    padT + plotH - Math.min(1, Math.max(0, v / maxChartY)) * plotH;

  const actualPoints = dailyChartSeries.filter((p) => p.cumVar !== null);
  const actualPolyline = actualPoints
    .map((p) => `${xForDay(p.day).toFixed(1)},${yForVal(p.cumVar || 0).toFixed(1)}`)
    .join(' ');
  const actualArea =
    actualPoints.length > 0
      ? `${xForDay(1).toFixed(1)},${(padT + plotH).toFixed(1)} ${actualPolyline} ${xForDay(
          actualPoints[actualPoints.length - 1].day
        ).toFixed(1)},${(padT + plotH).toFixed(1)}`
      : '';

  const extrapPoints = dailyChartSeries.filter((p) => p.extrapVar !== null);
  const extrapPolyline = extrapPoints
    .map((p) => `${xForDay(p.day).toFixed(1)},${yForVal(p.extrapVar || 0).toFixed(1)}`)
    .join(' ');

  const budgetY = yForVal(varBudget);
  const hoveredPoint =
    hoveredDay !== null ? dailyChartSeries.find((p) => p.day === hoveredDay) || null : null;

  // Donut Chart Geometry
  const donutTotal = donutSlices.reduce((s, x) => s + x.value, 0) || 1;
  const donutR = 78;
  const donutCircumference = 2 * Math.PI * donutR;
  let donutCumulativeOffset = 0;
  const activeDonutSlice = donutSlices.find((s) => s.id === hoveredDonutSlice) || null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px',
        position: 'relative',
      }}
    >
      {/* Global Drag & Drop Overlay */}
      {globalDragOver && (
        <div
          style={{
            position: 'fixed',
            inset: '12px',
            zIndex: 2500,
            background: 'rgba(9, 9, 11, 0.94)',
            border: '1px dashed #10b981',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#10b981' }}>
            GEORGE ZIP / CSV HIER LOSLASSEN
          </div>
          <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
            Sofortiger Import (CAMT.053 XML / CSV)
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.csv,.txt,.xml,.sta,.mt940,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImmediateFileImport(f);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      {/* =====================================================================
          COMPACT TOP BAR (ZERO CLUTTER, PAGELET / DRAWER TRIGGERS)
         ===================================================================== */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 24px',
          background: 'var(--bg-canvas)',
        }}
      >
        {/* Left: Title + Giro Balance + Data Freshness */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isDataStale ? '#f59e0b' : '#10b981',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: '#fafafa',
              }}
            >
              FINANZEN
            </span>
          </div>

          {/* Giro Balance Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              background: '#111113',
              border: '1px solid var(--line-hairline)',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ color: '#52525b' }}>GIRO</span>
            {editingBalance ? (
              <input
                type="text"
                autoFocus
                value={balanceDraft}
                onChange={(e) => setBalanceDraft(e.target.value)}
                onBlur={handleSaveInlineBalance}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveInlineBalance();
                  if (e.key === 'Escape') setEditingBalance(false);
                }}
                style={{
                  width: '80px',
                  background: '#141417',
                  border: '1px solid #52525b',
                  borderRadius: '3px',
                  color: '#fafafa',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  padding: '0 4px',
                  outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={() => {
                  setBalanceDraft(String(kpis?.currentBalance ?? 0));
                  setEditingBalance(true);
                }}
                title="Kontostand anpassen"
                style={{
                  color: (kpis?.currentBalance ?? 0) >= 0 ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {fmtEur(kpis?.currentBalance ?? 0, privacyMasked, true)}
              </span>
            )}
          </div>

          {/* Freshness Timestamp */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#52525b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Stand: {latestTxDate ? latestTxDate.split('-').reverse().join('.') : '—'}
            {daysSinceLatestTx !== null ? ` (${daysSinceLatestTx}d)` : ''}
          </span>

          {statusBanner && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#10b981',
                fontWeight: 600,
              }}
            >
              {statusBanner}
            </span>
          )}
          {errorMsg && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#ef4444',
                fontWeight: 600,
              }}
            >
              {errorMsg}
            </span>
          )}
        </div>

        {/* Right: Month Switcher + Pagelet Drawer Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Month Switcher */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#111113',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              height: '28px',
            }}
          >
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                padding: '0 8px',
                height: '100%',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ‹
            </button>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fafafa',
                padding: '0 6px',
                height: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {overview?.availableMonths.map((m) => (
                <option key={m} value={m} style={{ background: '#111113', color: '#fafafa' }}>
                  {m}
                </option>
              ))}
              <option value="all" style={{ background: '#111113', color: '#fafafa' }}>
                ALLE
              </option>
            </select>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                padding: '0 8px',
                height: '100%',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ›
            </button>
          </div>

          {/* Drawer Triggers (Pagelets) */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'fixed' ? null : 'fixed')}
            style={{
              height: '28px',
              padding: '0 10px',
              background: activeDrawer === 'fixed' ? '#fafafa' : '#111113',
              color: activeDrawer === 'fixed' ? '#09090b' : '#a1a1aa',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            FIXKOSTEN ({fixedCostsPaidCount}/{fixedCostsList.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterCategory('ALL');
              setActiveDrawer(activeDrawer === 'transactions' ? null : 'transactions');
            }}
            style={{
              height: '28px',
              padding: '0 10px',
              background: activeDrawer === 'transactions' ? '#fafafa' : '#111113',
              color: activeDrawer === 'transactions' ? '#09090b' : '#a1a1aa',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            BUCHUNGEN ({overview?.totalTransactionCount || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'sync' ? null : 'sync')}
            style={{
              height: '28px',
              padding: '0 10px',
              background: activeDrawer === 'sync' ? '#fafafa' : '#111113',
              color: activeDrawer === 'sync' ? '#09090b' : '#a1a1aa',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            SYNC / EXPORT
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'settings' ? null : 'settings')}
            style={{
              height: '28px',
              padding: '0 10px',
              background: activeDrawer === 'settings' ? '#fafafa' : '#111113',
              color: activeDrawer === 'settings' ? '#09090b' : '#a1a1aa',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            SETUP
          </button>

          <button
            type="button"
            onClick={() => setPrivacyMasked((p) => !p)}
            style={{
              height: '28px',
              padding: '0 8px',
              background: 'transparent',
              border: '1px solid var(--line-subtle)',
              borderRadius: '4px',
              color: privacyMasked ? '#fafafa' : '#52525b',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            {privacyMasked ? 'SHOW' : 'HIDE'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              height: '28px',
              padding: '0 10px',
              background: '#fafafa',
              border: '1px solid #fafafa',
              borderRadius: '4px',
              color: '#09090b',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {importing ? 'IMPORT...' : '+ IMPORT'}
          </button>
        </div>
      </header>

      {/* =====================================================================
          1. THIN MONTH PROGRESS BAR (EDGE-TO-EDGE)
         ===================================================================== */}
      <div
        style={{
          position: 'relative',
          background: '#111113',
          borderTop: '1px solid var(--line-hairline)',
          borderBottom: '1px solid var(--line-hairline)',
          padding: '6px 24px 8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.06em',
            color: '#a1a1aa',
            marginBottom: '5px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>
            MONATSFORTSCHRITT · <strong style={{ color: '#fafafa' }}>TAG {elapsedDays}</strong> /{' '}
            {daysInMonth}
          </span>
          <span>
            <strong style={{ color: '#fafafa' }}>{monthTimePct.toFixed(0)}%</strong> VERSTRICHEN ·{' '}
            <strong style={{ color: '#10b981' }}>{remainingDays} TAGE</strong> ÜBRIG
          </span>
        </div>
        <div
          style={{
            height: '3px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.07)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${monthTimePct}%`,
              background: '#fafafa',
              borderRadius: '2px',
            }}
          />
        </div>
      </div>

      {/* =====================================================================
          2. HARD NUMBERS STRIP (BOLD GREEN & RED NUMBERS)
         ===================================================================== */}
      {kpis && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            borderBottom: '1px solid var(--line-hairline)',
            background: 'var(--bg-canvas)',
          }}
        >
          {/* KPI 1: HEUTE */}
          <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                color: '#52525b',
              }}
            >
              <span>HEUTE</span>
              <span>TAGESLIMIT FREI</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: todayStrictSpend > 0 ? '#ef4444' : '#10b981',
                }}
              >
                {todayStrictSpend > 0
                  ? fmtEur(-todayStrictSpend, privacyMasked)
                  : fmtEur(0, privacyMasked)}
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: varDailyFree > 0 ? '#10b981' : '#ef4444',
                }}
              >
                {fmtEur(varDailyFree, privacyMasked, true)}/d
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpis.expensesDay > 0 ? (
                <>
                  Letzte Buchung ({kpis.expensesDayDate.slice(8, 10)}.
                  {kpis.expensesDayDate.slice(5, 7)}.):{' '}
                  <strong style={{ color: '#ef4444' }}>
                    {fmtEur(-kpis.expensesDay, privacyMasked)}
                  </strong>
                </>
              ) : (
                'Keine Buchung heute'
              )}
            </div>
          </div>

          {/* KPI 2: 7 TAGE (WOCHE) */}
          <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                color: '#52525b',
              }}
            >
              <span>7 TAGE (VARIABEL)</span>
              <span>TAGESSCHNITT</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: weekVarSpend > 0 ? '#ef4444' : '#10b981',
                }}
              >
                {weekVarSpend > 0
                  ? fmtEur(-weekVarSpend, privacyMasked)
                  : fmtEur(0, privacyMasked)}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#a1a1aa' }}>
                Ø {fmtEur(-(weekVarSpend / 7), privacyMasked)}/d
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Gesamt 7d inkl. Fix:{' '}
              <strong style={{ color: '#ef4444' }}>
                {fmtEur(-kpis.expensesWeek, privacyMasked)}
              </strong>
            </div>
          </div>

          {/* KPI 3: MONAT (VARIABEL & FIX) */}
          <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                color: '#52525b',
              }}
            >
              <span>MONAT VARIABEL</span>
              <span>EINNAHMEN</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: '#ef4444',
                }}
              >
                {fmtEur(-varSpent, privacyMasked)}
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#10b981',
                }}
              >
                {fmtEur(kpis.income, privacyMasked, true)}
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                Fixplan:{' '}
                <strong style={{ color: '#ef4444' }}>
                  {fmtEur(-fixedCostsTotal, privacyMasked)}
                </strong>
              </span>
              <span>
                Gebucht:{' '}
                <strong style={{ color: '#ef4444' }}>
                  {fmtEur(-kpis.expenses, privacyMasked)}
                </strong>
              </span>
            </div>
          </div>

          {/* KPI 4: RESTBUDGET & EXTRAPOLATION */}
          <div style={{ padding: '16px 24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                color: '#52525b',
              }}
            >
              <span>RESTBUDGET (VON {fmtCompactEur(varBudget, privacyMasked)})</span>
              <span>MONATSENDE-PROGNOSE</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: varRemaining >= 0 ? '#10b981' : '#ef4444',
                }}
              >
                {fmtEur(varRemaining, privacyMasked, true)}
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444',
                }}
              >
                {fmtEur(varExtrapolatedRem, privacyMasked, true)}
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                Hochrechnung:{' '}
                <strong style={{ color: varExtrapolated > varBudget ? '#ef4444' : '#fafafa' }}>
                  ~{fmtEur(-varExtrapolated, privacyMasked)}
                </strong>
              </span>
              <span style={{ color: varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                {varExtrapolatedRem >= 0 ? 'IM BUDGET' : 'ÜBERZUG'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          3. BIG DIAGRAMS ROW (2 LARGE INTERACTIVE CHARTS)
          Left: Monthly Cumulative Burn & Extrapolation Trajectory (SVG)
          Right: Budget & Spend Allocation Donut Diagram (SVG)
         ===================================================================== */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 1fr)',
          borderBottom: '1px solid var(--line-hairline)',
          background: 'var(--bg-canvas)',
        }}
      >
        {/* BIG DIAGRAM 1: BURN & EXTRAPOLATION CURVE */}
        <div
          style={{
            padding: '18px 24px',
            borderRight: '1px solid var(--line-hairline)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#fafafa',
                }}
              >
                AUSGABEN-VERLAUF & EXTRAPOLATION (TAG 1–{daysInMonth})
              </span>
              {hoveredPoint && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    padding: '2px 8px',
                    background: '#141417',
                    border: '1px solid var(--line-subtle)',
                    borderRadius: '3px',
                    color: '#fafafa',
                  }}
                >
                  Tag {hoveredPoint.day}:{' '}
                  <strong style={{ color: '#ef4444' }}>
                    {hoveredPoint.cumVar !== null
                      ? fmtEur(-hoveredPoint.cumVar, privacyMasked)
                      : `~${fmtEur(-(hoveredPoint.extrapVar || 0), privacyMasked)}`}
                  </strong>{' '}
                  (Soll: {fmtEur(hoveredPoint.idealPace, privacyMasked)})
                </span>
              )}
            </div>

            {/* Chart Legend with Hard Numbers */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '3px',
                    background: '#ef4444',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: '#a1a1aa' }}>Ist:</span>
                <strong style={{ color: '#ef4444' }}>{fmtCompactEur(-varSpent, privacyMasked)}</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '2px',
                    borderBottom: `2px dashed ${varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444'}`,
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: '#a1a1aa' }}>Prognose:</span>
                <strong style={{ color: varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444' }}>
                  ~{fmtCompactEur(-varExtrapolated, privacyMasked)}
                </strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '2px',
                    background: '#10b981',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: '#a1a1aa' }}>Limit:</span>
                <strong style={{ color: '#10b981' }}>{fmtCompactEur(varBudget, privacyMasked)}</strong>
              </span>
            </div>
          </div>

          {/* Interactive SVG Trajectory Chart */}
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            style={{ width: '100%', height: '230px', display: 'block', overflow: 'visible' }}
            onMouseLeave={() => setHoveredDay(null)}
          >
            <defs>
              <linearGradient id="burnAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const val = Math.round(maxChartY * frac);
              const y = yForVal(val);
              return (
                <g key={frac}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={chartW - padR}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="#52525b"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {privacyMasked ? '•••' : `€${val}`}
                  </text>
                </g>
              );
            })}

            {/* Green Budget Limit Ceiling Line */}
            <line
              x1={padL}
              y1={budgetY}
              x2={chartW - padR}
              y2={budgetY}
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={chartW - padR - 4}
              y={budgetY - 5}
              textAnchor="end"
              fill="#10b981"
              fontSize="10"
              fontWeight="700"
              fontFamily="var(--font-mono)"
            >
              BUDGET {fmtCompactEur(varBudget, privacyMasked)}
            </text>

            {/* Ideal Linear Pace Diagonal (Day 1 -> Day 30 Budget) */}
            <line
              x1={xForDay(1)}
              y1={yForVal(0)}
              x2={xForDay(daysInMonth)}
              y2={budgetY}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />

            {/* Today Vertical Marker */}
            <line
              x1={xForDay(elapsedDays)}
              y1={padT}
              x2={xForDay(elapsedDays)}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
            />
            <text
              x={xForDay(elapsedDays)}
              y={padT - 4}
              textAnchor="middle"
              fill="#fafafa"
              fontSize="9"
              fontWeight="700"
              fontFamily="var(--font-mono)"
            >
              HEUTE (T{elapsedDays})
            </text>

            {/* Daily Spend Impulse Bars along bottom */}
            {dailyChartSeries.map((pt) => {
              if (pt.dailyVar <= 0) return null;
              const barH = Math.max(3, (pt.dailyVar / maxChartY) * plotH);
              return (
                <rect
                  key={`bar-${pt.day}`}
                  x={xForDay(pt.day) - 3}
                  y={padT + plotH - barH}
                  width="6"
                  height={barH}
                  rx="1"
                  fill="rgba(239, 68, 68, 0.35)"
                />
              );
            })}

            {/* Actual Cumulative Burn Area & Solid Red Line */}
            {actualArea && <polygon points={actualArea} fill="url(#burnAreaGrad)" />}
            {actualPolyline && (
              <polyline
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                points={actualPolyline}
              />
            )}

            {/* Extrapolated Trajectory Dashed Line (Green if under budget, Red if over) */}
            {extrapPolyline && (
              <polyline
                fill="none"
                stroke={varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444'}
                strokeWidth="2.2"
                strokeDasharray="5 4"
                points={extrapPolyline}
              />
            )}

            {/* Current Day Node & Month-End Extrapolation Node */}
            <circle
              cx={xForDay(elapsedDays)}
              cy={yForVal(varSpent)}
              r="4.5"
              fill="#ef4444"
              stroke="#09090b"
              strokeWidth="1.5"
            />
            <circle
              cx={xForDay(daysInMonth)}
              cy={yForVal(varExtrapolated)}
              r="4.5"
              fill={varExtrapolatedRem >= 0 ? '#10b981' : '#ef4444'}
              stroke="#09090b"
              strokeWidth="1.5"
            />

            {/* X-Axis Day Ticks */}
            {[1, 5, 10, 15, 20, 25, daysInMonth].map((d) => (
              <text
                key={`x-${d}`}
                x={xForDay(d)}
                y={chartH - 6}
                textAnchor="middle"
                fill={d === elapsedDays ? '#fafafa' : '#52525b'}
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {d}.
              </text>
            ))}

            {/* Invisible Hover Columns for Smooth Day Inspection */}
            {dailyChartSeries.map((pt) => {
              const colW = plotW / daysInMonth;
              return (
                <rect
                  key={`hit-${pt.day}`}
                  x={xForDay(pt.day) - colW / 2}
                  y={padT}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => setHoveredDay(pt.day)}
                />
              );
            })}
          </svg>
        </div>

        {/* BIG DIAGRAM 2: BUDGET & ALLOCATION DONUT RING */}
        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#fafafa',
              }}
            >
              VERTEILUNG & RESTBUDGET
            </span>
            <div
              style={{
                display: 'inline-flex',
                background: '#111113',
                border: '1px solid var(--line-subtle)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setDonutMode('variable')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  border: 'none',
                  background: donutMode === 'variable' ? '#fafafa' : 'transparent',
                  color: donutMode === 'variable' ? '#09090b' : '#a1a1aa',
                  cursor: 'pointer',
                }}
              >
                VARIABEL
              </button>
              <button
                type="button"
                onClick={() => setDonutMode('total')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  border: 'none',
                  background: donutMode === 'total' ? '#fafafa' : 'transparent',
                  color: donutMode === 'total' ? '#09090b' : '#a1a1aa',
                  cursor: 'pointer',
                }}
              >
                INKL. FIX
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '190px 1fr',
              alignItems: 'center',
              gap: '16px',
              margin: 'auto 0',
            }}
          >
            {/* SVG Donut Ring */}
            <div style={{ position: 'relative', width: '190px', height: '190px' }}>
              <svg viewBox="0 0 200 200" style={{ width: '190px', height: '190px' }}>
                <circle
                  cx="100"
                  cy="100"
                  r={donutR}
                  fill="none"
                  stroke="#141417"
                  strokeWidth="20"
                />
                {donutSlices.map((slice) => {
                  const pct = slice.value / donutTotal;
                  const dash = Math.max(0, pct * donutCircumference - 2);
                  const offset = -donutCumulativeOffset;
                  donutCumulativeOffset += pct * donutCircumference;
                  const isHovered = hoveredDonutSlice === slice.id;
                  return (
                    <circle
                      key={slice.id}
                      cx="100"
                      cy="100"
                      r={donutR}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={isHovered ? '24' : '18'}
                      strokeDasharray={`${dash} ${donutCircumference}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 100 100)"
                      style={{ cursor: 'pointer', transition: 'stroke-width 120ms ease' }}
                      onMouseEnter={() => setHoveredDonutSlice(slice.id)}
                      onMouseLeave={() => setHoveredDonutSlice(null)}
                    />
                  );
                })}
              </svg>

              {/* Center Hard Numbers */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  textAlign: 'center',
                  padding: '0 22px',
                }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: '#a1a1aa',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {activeDonutSlice ? activeDonutSlice.label : 'RESTBUDGET'}
                </div>
                <div
                  style={{
                    fontSize: '19px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    color: activeDonutSlice
                      ? activeDonutSlice.color
                      : varRemaining >= 0
                        ? '#10b981'
                        : '#ef4444',
                    marginTop: '2px',
                  }}
                >
                  {activeDonutSlice
                    ? fmtCompactEur(activeDonutSlice.value, privacyMasked)
                    : fmtCompactEur(varRemaining, privacyMasked, true)}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: '#52525b',
                    marginTop: '2px',
                  }}
                >
                  {activeDonutSlice
                    ? `${Math.round((activeDonutSlice.value / donutTotal) * 100)}%`
                    : `${Math.round((varRemaining / Math.max(1, varBudget)) * 100)}% frei`}
                </div>
              </div>
            </div>

            {/* Compact Hard-Number Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {donutSlices.map((slice) => {
                const isFree = slice.id.includes('remaining') || slice.id.includes('free');
                return (
                  <div
                    key={slice.id}
                    onMouseEnter={() => setHoveredDonutSlice(slice.id)}
                    onMouseLeave={() => setHoveredDonutSlice(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontVariantNumeric: 'tabular-nums',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '2px',
                          background: slice.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: '#a1a1aa',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {slice.label}
                      </span>
                    </div>
                    <strong style={{ color: isFree ? '#10b981' : '#ef4444', flexShrink: 0 }}>
                      {isFree
                        ? fmtCompactEur(slice.value, privacyMasked, true)
                        : fmtCompactEur(-slice.value, privacyMasked)}
                    </strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. BUDGET BARS (HIGH-IMPACT BARS + HARD GREEN/RED NUMBERS)
         ===================================================================== */}
      <section style={{ padding: '18px 24px 36px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#fafafa',
            }}
          >
            BUDGET-BALKEN & PROGNOSE (KLICK AUF BALKEN = BUCHUNGEN · KLICK AUF LIMIT = ANPASSEN)
          </span>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            WEISSER STRICH = HEUTE ({monthTimePct.toFixed(0)}%)
          </span>
        </div>

        <div
          style={{
            border: '1px solid var(--line-hairline)',
            borderRadius: '4px',
            overflow: 'hidden',
            background: '#09090b',
          }}
        >
          {variableBudgets.map((cat) => {
            const isEditingThis = editingBudgetCat === cat.category;
            const isOver = cat.remaining < 0;
            const isExtrapOver = cat.extrapolatedRemaining < 0;
            const barPct =
              cat.budgetLimit > 0 ? Math.min(100, (cat.spent / cat.budgetLimit) * 100) : 0;
            const extrapBarPct =
              cat.budgetLimit > 0
                ? Math.min(100, (cat.extrapolatedSpend / cat.budgetLimit) * 100)
                : 0;
            const fillColor = isOver ? '#ef4444' : isExtrapOver ? '#f59e0b' : '#10b981';

            return (
              <div
                key={cat.category}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '210px 1fr 310px',
                  alignItems: 'center',
                  gap: '18px',
                  padding: '13px 18px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                {/* Col 1: Category Name */}
                <div
                  onClick={() => {
                    setFilterCategory(cat.category);
                    setActiveDrawer('transactions');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#fafafa', fontSize: '13px' }}>
                    {cat.labelDe}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: '#52525b',
                    }}
                  >
                    {Math.round(barPct)}%
                  </span>
                </div>

                {/* Col 2: Bold Budget Bar + Extrapolation Fill + Today Marker */}
                <div
                  onClick={() => {
                    setFilterCategory(cat.category);
                    setActiveDrawer('transactions');
                  }}
                  style={{
                    position: 'relative',
                    height: '12px',
                    width: '100%',
                    background: '#141417',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  {/* Extrapolated Ghost Fill */}
                  {cat.extrapolatedSpend > cat.spent && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${extrapBarPct}%`,
                        background: isExtrapOver
                          ? 'rgba(239, 68, 68, 0.32)'
                          : 'rgba(16, 185, 129, 0.22)',
                      }}
                    />
                  )}
                  {/* Actual Spend Fill */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${barPct}%`,
                      background: fillColor,
                      borderRadius: '2px',
                    }}
                  />
                  {/* Month Progress Tick */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${monthTimePct}%`,
                      top: 0,
                      bottom: 0,
                      width: '2px',
                      background: 'rgba(255, 255, 255, 0.7)',
                    }}
                  />
                </div>

                {/* Col 3: Hard Numbers (Remaining + Spent/Budget + Extrapolated) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '12px',
                  }}
                >
                  {/* Bold Green/Red Remaining */}
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: isOver ? '#ef4444' : '#10b981',
                    }}
                  >
                    {fmtEur(cat.remaining, privacyMasked, true)}
                  </span>

                  {/* Spent / Editable Limit */}
                  <span style={{ color: '#a1a1aa' }}>
                    <strong style={{ color: cat.spent > 0 ? '#ef4444' : '#a1a1aa' }}>
                      {fmtCompactEur(-cat.spent, privacyMasked)}
                    </strong>{' '}
                    /{' '}
                    {isEditingThis ? (
                      <input
                        type="text"
                        autoFocus
                        value={budgetDraft}
                        onChange={(e) => setBudgetDraft(e.target.value)}
                        onBlur={() => handleSaveCategoryBudget(cat.category)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCategoryBudget(cat.category);
                          if (e.key === 'Escape') setEditingBudgetCat(null);
                        }}
                        style={{
                          width: '54px',
                          background: '#141417',
                          border: '1px solid #fafafa',
                          borderRadius: '2px',
                          color: '#fafafa',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          padding: '0 4px',
                          textAlign: 'right',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={savingBudget}
                        onClick={() => {
                          setBudgetDraft(String(cat.budgetLimit));
                          setEditingBudgetCat(cat.category);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px dashed #52525b',
                          padding: 0,
                          color: '#fafafa',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {fmtCompactEur(cat.budgetLimit, privacyMasked)}
                      </button>
                    )}
                  </span>

                  {/* Extrapolated End-of-Month */}
                  <span
                    title="Hochrechnung Monatsende"
                    style={{
                      fontWeight: 700,
                      color: isExtrapOver ? '#ef4444' : '#10b981',
                    }}
                  >
                    → {fmtCompactEur(cat.extrapolatedRemaining, privacyMasked, true)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Summary Row for Fixkosten (Clicks open Fixkosten Drawer) */}
          <div
            onClick={() => setActiveDrawer('fixed')}
            style={{
              display: 'grid',
              gridTemplateColumns: '210px 1fr 310px',
              alignItems: 'center',
              gap: '18px',
              padding: '13px 18px',
              background: '#111113',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#fafafa', fontSize: '13px' }}>
                Fixkosten ({fixedCostsPaidCount}/{fixedCostsList.length})
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#a1a1aa' }}>
                {fixedCostsTotal > 0
                  ? Math.round((fixedCostsPaidTotal / fixedCostsTotal) * 100)
                  : 0}
                %
              </span>
            </div>

            <div
              style={{
                position: 'relative',
                height: '12px',
                width: '100%',
                background: '#141417',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${
                    fixedCostsTotal > 0
                      ? Math.min(100, (fixedCostsPaidTotal / fixedCostsTotal) * 100)
                      : 0
                  }%`,
                  background: '#ef4444',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: '12px',
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>
                {fmtEur(-fixedCostsPaidTotal, privacyMasked)}
              </span>
              <span style={{ color: '#a1a1aa' }}>
                von <strong style={{ color: '#fafafa' }}>{fmtEur(fixedCostsTotal, privacyMasked)}</strong>
              </span>
              <span style={{ color: '#a1a1aa', fontWeight: 600 }}>DETAILS ›</span>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. SLIDE-OVER DRAWERS / PAGELETS (FOR SECONDARY DETAILS)
         ===================================================================== */}
      {activeDrawer && (
        <div
          onClick={() => setActiveDrawer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 94vw)',
              height: '100vh',
              background: '#09090b',
              borderLeft: '1px solid var(--line-subtle)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '14px 24px',
                borderBottom: '1px solid var(--line-hairline)',
                background: '#111113',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                {(
                  [
                    { id: 'fixed', label: `FIXKOSTEN (${fmtCompactEur(fixedCostsTotal)})` },
                    { id: 'transactions', label: `BUCHUNGEN (${filteredTransactions.length})` },
                    { id: 'sync', label: 'SYNC & EXPORT' },
                    { id: 'settings', label: 'SETUP' },
                  ] as Array<{ id: Exclude<DrawerType, null>; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDrawer(tab.id)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      borderRadius: '4px',
                      border: '1px solid var(--line-subtle)',
                      background: activeDrawer === tab.id ? '#fafafa' : 'transparent',
                      color: activeDrawer === tab.id ? '#09090b' : '#a1a1aa',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line-subtle)',
                  borderRadius: '4px',
                  color: '#fafafa',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                SCHLIESSEN ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* DRAWER 1: FIXKOSTEN */}
              {activeDrawer === 'fixed' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: '16px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#a1a1aa' }}>MONATLICHE FIXKOSTEN</div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444' }}>
                        {fmtEur(-fixedCostsTotal, privacyMasked)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#a1a1aa' }}>ABGEBUCHT / OFFEN</div>
                      <div style={{ fontSize: '15px', fontWeight: 700 }}>
                        <span style={{ color: '#10b981' }}>
                          {fmtEur(fixedCostsPaidTotal, privacyMasked)}
                        </span>{' '}
                        /{' '}
                        <span style={{ color: '#ef4444' }}>
                          {fmtEur(Math.max(0, fixedCostsTotal - fixedCostsPaidTotal), privacyMasked)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--line-hairline)',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: '#52525b',
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '8px' }}>STATUS</th>
                        <th style={{ padding: '8px' }}>POSITION</th>
                        <th style={{ padding: '8px' }}>GRUPPE</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>BETRAG</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedCostsList.map((item) => {
                        const isEditing = editingFixedId === item.id;
                        return (
                          <tr
                            key={item.id}
                            style={{ borderBottom: '1px solid var(--line-hairline)' }}
                          >
                            <td
                              style={{
                                padding: '10px 8px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: item.paidThisMonth ? '#10b981' : '#52525b',
                                fontWeight: 700,
                              }}
                            >
                              {item.paidThisMonth
                                ? `BEZAHLT (${item.matchedTxDate?.slice(8, 10)}.${item.matchedTxDate?.slice(5, 7)}.)`
                                : 'OFFEN'}
                            </td>
                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={fixedNameDraft}
                                  onChange={(e) => setFixedNameDraft(e.target.value)}
                                  style={{
                                    background: '#141417',
                                    border: '1px solid #fafafa',
                                    color: '#fafafa',
                                    padding: '2px 6px',
                                    fontSize: '12px',
                                  }}
                                />
                              ) : (
                                item.name
                              )}
                            </td>
                            <td
                              style={{
                                padding: '10px 8px',
                                fontSize: '11px',
                                color: '#a1a1aa',
                              }}
                            >
                              {item.groupLabel}
                            </td>
                            <td
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#ef4444',
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={fixedAmountDraft}
                                  onChange={(e) => setFixedAmountDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveFixedEdit(item);
                                  }}
                                  style={{
                                    width: '72px',
                                    background: '#141417',
                                    border: '1px solid #fafafa',
                                    color: '#fafafa',
                                    fontFamily: 'var(--font-mono)',
                                    textAlign: 'right',
                                    padding: '2px 6px',
                                  }}
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingFixedId(item.id);
                                    setFixedNameDraft(item.name);
                                    setFixedAmountDraft(String(item.amount));
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {fmtEur(-item.amount, privacyMasked)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              {isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => handleSaveFixedEdit(item)}
                                  style={{
                                    background: '#10b981',
                                    border: 'none',
                                    color: '#09090b',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  OK
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFixedCost(item.id)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#52525b',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Add Fixed Cost Row */}
                  <form
                    onSubmit={handleAddFixedCost}
                    style={{
                      marginTop: '16px',
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Neue Fixkosten-Position"
                      value={newFixedName}
                      onChange={(e) => setNewFixedName(e.target.value)}
                      style={{
                        flex: 1,
                        height: '32px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontSize: '12px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Betrag €"
                      value={newFixedAmount}
                      onChange={(e) => setNewFixedAmount(e.target.value)}
                      style={{
                        width: '100px',
                        height: '32px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                      }}
                    />
                    <select
                      value={newFixedGroup}
                      onChange={(e) => setNewFixedGroup(e.target.value as any)}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontSize: '12px',
                      }}
                    >
                      <option value="Wohnen & Energie">Wohnen & Energie</option>
                      <option value="Versicherungen">Versicherungen</option>
                      <option value="Abos & Internet">Abos & Internet</option>
                    </select>
                    <button
                      type="submit"
                      style={{
                        height: '32px',
                        padding: '0 14px',
                        background: '#fafafa',
                        color: '#09090b',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      + HINZUFÜGEN
                    </button>
                  </form>
                </div>
              )}

              {/* DRAWER 2: TRANSACTIONS */}
              {activeDrawer === 'transactions' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Suche Empfänger / Text..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setTxPage(1);
                      }}
                      style={{
                        flex: 1,
                        height: '32px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontSize: '12px',
                      }}
                    />
                    <select
                      value={filterCategory}
                      onChange={(e) => {
                        setFilterCategory(e.target.value);
                        setTxPage(1);
                      }}
                      style={{
                        height: '32px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontSize: '12px',
                      }}
                    >
                      <option value="ALL">Alle Kategorien</option>
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {getCategoryLabelDe(c)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowAddTx((s) => !s)}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        background: '#fafafa',
                        color: '#09090b',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      + BUCHUNG
                    </button>
                  </div>

                  {showAddTx && (
                    <form
                      onSubmit={handleAddTransaction}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '14px',
                        padding: '10px',
                        background: '#111113',
                        border: '1px solid var(--line-subtle)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <input
                        type="date"
                        value={newTxDate}
                        onChange={(e) => setNewTxDate(e.target.value)}
                        style={{
                          height: '28px',
                          background: '#141417',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Empfänger"
                        value={newTxPayee}
                        onChange={(e) => setNewTxPayee(e.target.value)}
                        style={{
                          flex: 1,
                          height: '28px',
                          padding: '0 8px',
                          background: '#141417',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          fontSize: '12px',
                        }}
                      />
                      <select
                        value={newTxCategory}
                        onChange={(e) => setNewTxCategory(e.target.value)}
                        style={{
                          height: '28px',
                          background: '#141417',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          fontSize: '12px',
                        }}
                      >
                        {ALL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {getCategoryLabelDe(c)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Betrag €"
                        value={newTxAmount}
                        onChange={(e) => setNewTxAmount(e.target.value)}
                        style={{
                          width: '84px',
                          height: '28px',
                          padding: '0 8px',
                          background: '#141417',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          background: '#10b981',
                          color: '#09090b',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        SPEICHERN
                      </button>
                    </form>
                  )}

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--line-hairline)',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: '#52525b',
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '8px' }}>DATUM</th>
                        <th style={{ padding: '8px' }}>EMPFÄNGER</th>
                        <th style={{ padding: '8px' }}>KATEGORIE</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>BETRAG</th>
                        <th style={{ padding: '8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTransactions.map((tx) => (
                        <tr
                          key={tx.id}
                          style={{ borderBottom: '1px solid var(--line-hairline)' }}
                        >
                          <td
                            style={{
                              padding: '8px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: '#a1a1aa',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tx.tx_date}
                          </td>
                          <td style={{ padding: '8px', fontSize: '12px', fontWeight: 500 }}>
                            <div>{tx.payee}</div>
                            {tx.notes && (
                              <div style={{ fontSize: '10px', color: '#52525b' }}>{tx.notes}</div>
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <select
                              value={tx.category}
                              onChange={(e) => handleRecategorizeTx(tx.id, e.target.value, true)}
                              style={{
                                background: '#141417',
                                border: '1px solid var(--line-subtle)',
                                color: '#a1a1aa',
                                fontSize: '11px',
                                padding: '2px 6px',
                              }}
                            >
                              {ALL_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {getCategoryLabelDe(c)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td
                            style={{
                              padding: '8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fmtEur(tx.amount, privacyMasked, true)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(tx.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#52525b',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {totalPages > 1 && (
                    <div
                      style={{
                        marginTop: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                      }}
                    >
                      <button
                        type="button"
                        disabled={txPage <= 1}
                        onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                        style={{
                          padding: '4px 10px',
                          background: '#111113',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          cursor: 'pointer',
                        }}
                      >
                        ‹ ZURÜCK
                      </button>
                      <span>
                        SEITE {txPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={txPage >= totalPages}
                        onClick={() => setTxPage((p) => Math.min(totalPages, p + 1))}
                        style={{
                          padding: '4px 10px',
                          background: '#111113',
                          border: '1px solid var(--line-subtle)',
                          color: '#fafafa',
                          cursor: 'pointer',
                        }}
                      >
                        WEITER ›
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DRAWER 3: SYNC & EXPORT */}
              {activeDrawer === 'sync' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '28px',
                      border: '1px dashed #10b981',
                      borderRadius: '4px',
                      background: '#111113',
                      textAlign: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
                      GEORGE ZIP / CAMT.053 XML / CSV IMPORTIEREN
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: '#a1a1aa',
                        marginTop: '4px',
                      }}
                    >
                      Klicken oder Datei direkt auf das Fenster ziehen
                    </div>
                  </div>

                  {importReport && (
                    <div
                      style={{
                        padding: '12px',
                        background: '#111113',
                        border: '1px solid #10b981',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                      }}
                    >
                      <strong style={{ color: '#10b981' }}>
                        +{importReport.importedCount} importiert
                      </strong>{' '}
                      · {importReport.skippedDuplicates} Duplikate übersprungen (
                      {importReport.format})
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleOpenBankPopup}
                      style={{
                        padding: '8px 14px',
                        background: '#fafafa',
                        color: '#09090b',
                        border: 'none',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      GEORGE PORTAL ÖFFNEN
                    </button>
                    <button
                      type="button"
                      onClick={() => void linkAndScanLocalDownloadsFolder(true)}
                      style={{
                        padding: '8px 14px',
                        background: '#111113',
                        color: '#fafafa',
                        border: '1px solid var(--line-subtle)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {scanningDownloads ? 'SCANNE...' : 'DOWNLOADS-ORDNER SCANNEN'}
                    </button>
                  </div>

                  <div
                    style={{
                      paddingTop: '14px',
                      borderTop: '1px solid var(--line-hairline)',
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => triggerFileExport('csv_de')}
                      style={{
                        padding: '6px 12px',
                        background: '#111113',
                        border: '1px solid var(--line-subtle)',
                        color: '#a1a1aa',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      CSV EXPORT (DE)
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerFileExport('tax_report')}
                      style={{
                        padding: '6px 12px',
                        background: '#111113',
                        border: '1px solid var(--line-subtle)',
                        color: '#a1a1aa',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      STEUER-BERICHT
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerFileExport('json')}
                      style={{
                        padding: '6px 12px',
                        background: '#111113',
                        border: '1px solid var(--line-subtle)',
                        color: '#a1a1aa',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      JSON BACKUP
                    </button>
                  </div>
                </div>
              )}

              {/* DRAWER 4: SETUP */}
              {activeDrawer === 'settings' && (
                <form
                  onSubmit={handleSaveSettings}
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: '#a1a1aa',
                        marginBottom: '4px',
                      }}
                    >
                      AKTUELLER KONTOSTAND (€)
                    </label>
                    <input
                      type="text"
                      value={settingsBalance}
                      onChange={(e) => setSettingsBalance(e.target.value)}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: '#a1a1aa',
                        marginBottom: '4px',
                      }}
                    >
                      KONTOBEZEICHNUNG
                    </label>
                    <input
                      type="text"
                      value={settingsAccountName}
                      onChange={(e) => setSettingsAccountName(e.target.value)}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: '#a1a1aa',
                        marginBottom: '4px',
                      }}
                    >
                      IBAN
                    </label>
                    <input
                      type="text"
                      value={settingsIban}
                      onChange={(e) => setSettingsIban(e.target.value)}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        background: '#141417',
                        border: '1px solid var(--line-subtle)',
                        color: '#fafafa',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    style={{
                      height: '34px',
                      background: '#10b981',
                      color: '#09090b',
                      border: 'none',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    SPEICHERN
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
