import http from 'node:http';
import { defineThassiApp } from '@thassi/sdk';
import { renderUnifiedDashboardHtml } from '../../../thassi_host/src/ambient-dashboard.js';
import {
  getHassSidebarStylerScript,
  syncHassFrontendFiles,
} from '../../../thassi_host/src/hass-sidebar-sync.js';
import {
  CATEGORY_DEFINITIONS,
  DEFAULT_BALANCE_CONFIG,
  DEFAULT_EXPORT_REMINDER_CONFIG,
  DEFAULT_FIXED_COSTS,
  DEFAULT_PREVIEW_CONFIG,
  getCategoryMeta,
  type AccountBalanceConfig,
  type CategoryBreakdownItem,
  type CategoryBudgetRow,
  type ExportReminderConfig,
  type ExportReminderStatus,
  type FinanceKpis,
  type FixedCostItem,
  type PreviewConfig,
  type TransactionRow,
} from '../shared/finance-types.js';
import {
  autoCategorizeTransaction,
  buildSunburstHierarchy,
  detectRecurringFlag,
  getDefaultCategoryBudgets,
  normalizePayeeName,
} from './categorizer.js';
import {
  computeTransactionRef,
  decodeBankFileBuffer,
} from './parser.js';
import {
  buildSampleGeorgeLiveExportCsv,
  clearCookieVault,
  getCookieHeaderForUrl,
  getQuickImportConfig,
  ingestStatementIntoDatabase,
  renderQuickImportPortalHtml,
  saveCookiesToVault,
  saveQuickImportConfig,
  scanDownloadsFolderForNewExports,
} from './quick-import.js';

try {
  syncHassFrontendFiles();
} catch {}

const LEGACY_DUMMY_PAYEES = [
  'Monthly Salary Deposit',
  'Wohnung Miete & Betriebskosten',
  'Flatex MSCI World ETF Sparplan',
  'SPAR Gourmet Einkauf',
  'Wien Energie / Strom & Gas Teilbetrag',
  'HOFER KG Filiale',
  'Fitness Studio Membership',
  'Specialty Coffee & Bakery',
  'BILLA Plus Einkauf',
  'Spotify & Cloud Storage Subscriptions',
  'ÖBB Tickets & Klimaticket',
  'Shelly Smart Home Modules',
];

export default defineThassiApp((ctx) => {
  // 1. Initialize & Migrate SQLite Schema
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_date TEXT NOT NULL,
      payee TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      account TEXT NOT NULL DEFAULT 'Girokonto',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      tx_ref TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );
  `);

  try {
    ctx.db.exec(`ALTER TABLE transactions ADD COLUMN tx_ref TEXT NOT NULL DEFAULT '';`);
  } catch {
    // Column already exists
  }

  for (const dummyPayee of LEGACY_DUMMY_PAYEES) {
    ctx.db.execute('DELETE FROM transactions WHERE payee = ?', [dummyPayee]);
  }
  ctx.db.execute('DELETE FROM transactions WHERE tx_ref = ?', ['2026110901:-22.40']);
  ctx.db.exec('DELETE FROM transactions WHERE id IN (2345, 2346, 2347, 2348);');

  // Ensure all default budget categories exist
  for (const b of getDefaultCategoryBudgets()) {
    ctx.db.execute(
      'INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)',
      [b.category, b.monthly_limit]
    );
  }

  // One-time smart re-categorization migration for legacy rows
  const migrationDone = ctx.db.kvGet<boolean>('finance_categorizer_v4_migrated');
  if (!migrationDone) {
    const allRows = ctx.db.query<TransactionRow>('SELECT * FROM transactions');
    ctx.db.exec('BEGIN TRANSACTION;');
    try {
      for (const r of allRows) {
        const cleanPayee = normalizePayeeName(r.payee, r.notes);
        const newCat = autoCategorizeTransaction(cleanPayee, r.notes, r.amount);
        const newRec = detectRecurringFlag(cleanPayee, r.notes, newCat, r.is_recurring === 1);
        const txRef = r.tx_ref || computeTransactionRef(r.tx_date, r.amount, cleanPayee, r.notes);
        if (
          cleanPayee !== r.payee ||
          newCat !== r.category ||
          newRec !== r.is_recurring ||
          txRef !== r.tx_ref
        ) {
          ctx.db.execute(
            'UPDATE transactions SET payee = ?, category = ?, is_recurring = ?, tx_ref = ? WHERE id = ?',
            [cleanPayee, newCat, newRec, txRef, r.id]
          );
        }
      }
      // Update fixed-category budgets to match user's explicit Fixkosten
      ctx.db.execute('UPDATE category_budgets SET monthly_limit = 1760 WHERE category = ?', [
        'Housing & Utilities',
      ]);
      ctx.db.execute('UPDATE category_budgets SET monthly_limit = 285 WHERE category = ?', [
        'Insurance & Finance',
      ]);
      ctx.db.execute('UPDATE category_budgets SET monthly_limit = 90 WHERE category = ?', [
        'Subscriptions',
      ]);
      ctx.db.exec('COMMIT;');
      ctx.db.kvSet('finance_categorizer_v4_migrated', true);
    } catch {
      ctx.db.exec('ROLLBACK;');
    }
  }

  function getFixedCostsConfig(): FixedCostItem[] {
    const saved = ctx.db.kvGet<FixedCostItem[]>('finance_fixed_costs_v1');
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    ctx.db.kvSet('finance_fixed_costs_v1', DEFAULT_FIXED_COSTS);
    return DEFAULT_FIXED_COSTS;
  }

  function saveFixedCostsConfig(items: FixedCostItem[]): FixedCostItem[] {
    const cleaned = items
      .filter((x) => x && x.name && Number.isFinite(Number(x.amount)))
      .map((x, idx) => ({
        id: x.id || `fix-${idx}-${Date.now()}`,
        name: x.name.trim(),
        amount: Number(Math.abs(Number(x.amount)).toFixed(2)),
        category: x.category || 'Housing & Utilities',
        groupLabel: x.groupLabel || 'Wohnen & Energie',
        matchPattern: x.matchPattern || x.name.toLowerCase(),
        isEstimate: Boolean(x.isEstimate),
      }));
    ctx.db.kvSet('finance_fixed_costs_v1', cleaned);
    return cleaned;
  }

  function evaluateFixedCostsWithTransactions(
    items: FixedCostItem[],
    txs: TransactionRow[]
  ): FixedCostItem[] {
    const expenseTxs = txs.filter((t) => t.amount < 0);
    return items.map((item) => {
      let rx: RegExp | null = null;
      try {
        rx = new RegExp(item.matchPattern || item.name, 'i');
      } catch {
        rx = null;
      }
      const matched = expenseTxs.find((t) => {
        const hay = `${t.payee} ${t.notes}`.toLowerCase();
        if (rx && rx.test(hay)) return true;
        return hay.includes(item.name.toLowerCase());
      });
      return {
        ...item,
        paidThisMonth: Boolean(matched),
        actualPaidAmount: matched ? Math.abs(matched.amount) : null,
        matchedTxDate: matched ? matched.tx_date : null,
      };
    });
  }

  function getPreviewConfig(): PreviewConfig {
    const saved = ctx.db.kvGet<Partial<PreviewConfig>>('finance_preview_config') || {};
    return {
      hiddenByDefault: saved.hiddenByDefault ?? DEFAULT_PREVIEW_CONFIG.hiddenByDefault,
      primaryMetric: saved.primaryMetric || DEFAULT_PREVIEW_CONFIG.primaryMetric,
      enabledElements: Array.isArray(saved.enabledElements)
        ? saved.enabledElements
        : DEFAULT_PREVIEW_CONFIG.enabledElements,
      previewBudgetCategories:
        Array.isArray(saved.previewBudgetCategories) && saved.previewBudgetCategories.length > 0
          ? saved.previewBudgetCategories
          : DEFAULT_PREVIEW_CONFIG.previewBudgetCategories,
      excludeRoundUpsInExpenses:
        saved.excludeRoundUpsInExpenses ?? DEFAULT_PREVIEW_CONFIG.excludeRoundUpsInExpenses,
    };
  }

  function savePreviewConfig(partial: Partial<PreviewConfig>): PreviewConfig {
    const current = getPreviewConfig();
    const updated: PreviewConfig = {
      ...current,
      ...partial,
    };
    ctx.db.kvSet('finance_preview_config', updated);
    return updated;
  }

  function getBalanceConfig(): AccountBalanceConfig {
    const saved = ctx.db.kvGet<Partial<AccountBalanceConfig>>('finance_balance_config') || {};
    return {
      currentBalance:
        typeof saved.currentBalance === 'number' && Number.isFinite(saved.currentBalance)
          ? Number(saved.currentBalance.toFixed(2))
          : DEFAULT_BALANCE_CONFIG.currentBalance,
      accountName: saved.accountName || DEFAULT_BALANCE_CONFIG.accountName,
      iban: saved.iban || DEFAULT_BALANCE_CONFIG.iban,
      autoAdjustOnImport: saved.autoAdjustOnImport ?? DEFAULT_BALANCE_CONFIG.autoAdjustOnImport,
      updatedAt: saved.updatedAt || DEFAULT_BALANCE_CONFIG.updatedAt,
    };
  }

  function saveBalanceConfig(partial: Partial<AccountBalanceConfig>): AccountBalanceConfig {
    const current = getBalanceConfig();
    const updated: AccountBalanceConfig = {
      ...current,
      ...partial,
      currentBalance:
        partial.currentBalance !== undefined
          ? Number(Number(partial.currentBalance).toFixed(2))
          : current.currentBalance,
      updatedAt: new Date().toISOString(),
    };
    ctx.db.kvSet('finance_balance_config', updated);
    return updated;
  }

  function getExportReminderConfig(): ExportReminderConfig {
    const saved = ctx.db.kvGet<Partial<ExportReminderConfig>>('finance_export_reminder_config');
    return {
      reminderIntervalDays:
        typeof saved?.reminderIntervalDays === 'number' && saved.reminderIntervalDays >= 1
          ? Math.min(90, Math.round(saved.reminderIntervalDays))
          : DEFAULT_EXPORT_REMINDER_CONFIG.reminderIntervalDays,
      remindOnNewMonth:
        typeof saved?.remindOnNewMonth === 'boolean'
          ? saved.remindOnNewMonth
          : DEFAULT_EXPORT_REMINDER_CONFIG.remindOnNewMonth,
      snoozedUntil: saved?.snoozedUntil || null,
      lastBankSyncAt: saved?.lastBankSyncAt || null,
      lastDataExportAt: saved?.lastDataExportAt || null,
    };
  }

  function saveExportReminderConfig(partial: Partial<ExportReminderConfig>): ExportReminderConfig {
    const current = getExportReminderConfig();
    const updated: ExportReminderConfig = {
      ...current,
      ...partial,
      reminderIntervalDays:
        typeof partial.reminderIntervalDays === 'number' && partial.reminderIntervalDays >= 1
          ? Math.min(90, Math.round(partial.reminderIntervalDays))
          : current.reminderIntervalDays,
    };
    ctx.db.kvSet('finance_export_reminder_config', updated);
    return updated;
  }

  function computeExportReminderStatus(): ExportReminderStatus {
    const cfg = getExportReminderConfig();
    const quickCfg = getQuickImportConfig(ctx.db);
    const latestRow = ctx.db.queryOne<{ latest_date: string | null }>(
      'SELECT MAX(tx_date) as latest_date FROM transactions'
    );
    const latestTxDate = latestRow?.latest_date || null;
    const nowMs = Date.now();

    const daysSinceLatestTx = latestTxDate
      ? Math.max(0, Math.floor((nowMs - new Date(`${latestTxDate}T12:00:00Z`).getTime()) / 86400000))
      : null;

    const effectiveLastSyncIso = cfg.lastBankSyncAt || quickCfg.lastAutoImportAt || null;
    const daysSinceLastSync = effectiveLastSyncIso
      ? Math.max(0, Math.floor((nowMs - new Date(effectiveLastSyncIso).getTime()) / 86400000))
      : daysSinceLatestTx;

    const daysSinceLastExport = cfg.lastDataExportAt
      ? Math.max(0, Math.floor((nowMs - new Date(cfg.lastDataExportAt).getTime()) / 86400000))
      : null;

    const isSnoozed = Boolean(
      cfg.snoozedUntil && new Date(cfg.snoozedUntil).getTime() > nowMs
    );

    const currentMonthYm = new Date(nowMs).toISOString().slice(0, 7);
    const isNewMonthMissingBookings = Boolean(
      cfg.remindOnNewMonth &&
        latestTxDate &&
        latestTxDate.slice(0, 7) < currentMonthYm &&
        new Date(nowMs).getDate() >= 2
    );

    const intervalDays = cfg.reminderIntervalDays || 7;
    const isTxStale = daysSinceLatestTx === null || daysSinceLatestTx >= intervalDays;
    const isSyncStale = daysSinceLastSync !== null && daysSinceLastSync >= intervalDays;
    const rawDue = isTxStale || isSyncStale || isNewMonthMissingBookings;
    const due = !isSnoozed && rawDue;

    const effectiveAgeDays =
      daysSinceLastSync !== null && daysSinceLatestTx !== null
        ? Math.min(daysSinceLastSync, daysSinceLatestTx)
        : (daysSinceLatestTx ?? daysSinceLastSync ?? 99);

    let urgency: 'ok' | 'warn' | 'overdue' = 'ok';
    if (due) {
      urgency = effectiveAgeDays >= Math.max(14, intervalDays * 2) ? 'overdue' : 'warn';
    }

    const fmtDateDe = (iso: string | null) => {
      if (!iso) return 'Keine';
      const [y, m, d] = iso.slice(0, 10).split('-');
      return d && m && y ? `${d}.${m}.${y}` : iso;
    };

    let headlineDe = 'Bank-Export & Finanzdaten aktuell';
    let detailDe = latestTxDate
      ? `Letzte Buchung vom ${fmtDateDe(latestTxDate)} (vor ${daysSinceLatestTx}T)`
      : 'Noch keine Buchungen vorhanden';

    if (due) {
      if (daysSinceLatestTx === null) {
        headlineDe = 'Erster Bank-Export fällig';
        detailDe = 'Noch keine Kontoauszüge importiert — Jetzt aus George exportieren & synchronisieren.';
      } else if (isNewMonthMissingBookings && effectiveAgeDays < intervalDays) {
        headlineDe = `Monats-Export für ${currentMonthYm} empfohlen`;
        detailDe = `Letzte Buchung vom ${fmtDateDe(latestTxDate)} — Neuen Kontoauszug exportieren & abgleichen.`;
      } else {
        headlineDe = `Bank-Export fällig (vor ${effectiveAgeDays} Tagen)`;
        detailDe = `Letzte Buchung: ${fmtDateDe(latestTxDate)} (Intervall: alle ${intervalDays} Tage) — Jetzt Kontoauszug exportieren.`;
      }
    } else if (isSnoozed && cfg.snoozedUntil) {
      headlineDe = `Export-Erinnerung pausiert bis ${fmtDateDe(cfg.snoozedUntil)}`;
    }

    return {
      ...cfg,
      lastBankSyncAt: effectiveLastSyncIso,
      latestTxDate,
      daysSinceLatestTx,
      daysSinceLastSync,
      daysSinceLastExport,
      isSnoozed,
      due,
      urgency,
      headlineDe,
      detailDe,
    };
  }

  function resolveDefaultTargetMonth(): string {
    const months = ctx.db.query<{ ym: string; cnt: number }>(`
      SELECT
        substr(tx_date, 1, 7) as ym,
        COUNT(*) as cnt
      FROM transactions
      GROUP BY ym
      ORDER BY ym DESC
    `);
    if (months.length === 0) return new Date().toISOString().slice(0, 7);
    return months[0].ym;
  }

  function computeDailyAndWeeklyExpenses(excludeRoundUps: boolean): {
    expensesToday: number;
    expensesDay: number;
    expensesDayDate: string;
    expensesDayLabel: string;
    expensesWeek: number;
    expensesWeekVariable: number;
    expensesWeekRangeLabel: string;
  } {
    const roundUpClause = excludeRoundUps
      ? `AND category != 'Investments' AND payee NOT LIKE '%Notgroschen%'`
      : `AND category != 'Investments'`;
    const variableClause = `${roundUpClause} AND is_recurring = 0 AND category NOT IN ('Housing & Utilities', 'Insurance & Finance', 'Subscriptions')`;

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayRow = ctx.db.queryOne<{ spent: number }>(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date = ?`,
      [todayIso]
    );

    const expensesToday = todayRow?.spent ?? 0;
    let expensesDay = expensesToday;
    let expensesDayDate = todayIso;
    let expensesDayLabel = 'Heute';

    if (expensesDay === 0) {
      const latestDayRow = ctx.db.queryOne<{ tx_date: string; spent: number }>(
        `SELECT tx_date, COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${roundUpClause}
         GROUP BY tx_date
         ORDER BY tx_date DESC
         LIMIT 1`
      );
      if (latestDayRow && latestDayRow.spent > 0) {
        expensesDay = latestDayRow.spent;
        expensesDayDate = latestDayRow.tx_date;
        const [, mm, dd] = latestDayRow.tx_date.split('-');
        expensesDayLabel = `Letzte Buchung (${dd}.${mm}.)`;
      }
    }

    // 7-day window from today
    const sevenDaysAgoIso = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const weekRow = ctx.db.queryOne<{ spent: number }>(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
      [sevenDaysAgoIso, todayIso]
    );
    const weekVarRow = ctx.db.queryOne<{ spent: number }>(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${variableClause} AND tx_date >= ? AND tx_date <= ?`,
      [sevenDaysAgoIso, todayIso]
    );

    let expensesWeek = weekRow?.spent ?? 0;
    let expensesWeekVariable = weekVarRow?.spent ?? 0;
    let expensesWeekRangeLabel = 'Letzte 7 Tage';

    if (expensesWeek === 0 && expensesDayDate) {
      const refEndMs = new Date(`${expensesDayDate}T12:00:00Z`).getTime();
      const refStartIso = new Date(refEndMs - 6 * 86400000).toISOString().slice(0, 10);
      const fallbackWeek = ctx.db.queryOne<{ spent: number }>(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      const fallbackWeekVar = ctx.db.queryOne<{ spent: number }>(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${variableClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      if (fallbackWeek && fallbackWeek.spent > 0) {
        expensesWeek = fallbackWeek.spent;
        expensesWeekVariable = fallbackWeekVar?.spent ?? 0;
        const [, m1, d1] = refStartIso.split('-');
        const [, m2, d2] = expensesDayDate.split('-');
        expensesWeekRangeLabel = `7 Tage (${d1}.${m1}.–${d2}.${m2}.)`;
      }
    }

    return {
      expensesToday,
      expensesDay,
      expensesDayDate,
      expensesDayLabel,
      expensesWeek,
      expensesWeekVariable,
      expensesWeekRangeLabel,
    };
  }

  function getMonthCalendarProgress(activeMonth: string): {
    elapsedDays: number;
    daysInMonth: number;
    remainingDays: number;
  } {
    if (!activeMonth || activeMonth === 'all' || !/^\d{4}-\d{2}$/.test(activeMonth)) {
      return { elapsedDays: 30, daysInMonth: 30, remainingDays: 0 };
    }
    const [yrStr, moStr] = activeMonth.split('-');
    const yr = Number(yrStr);
    const mo = Number(moStr);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const now = new Date();
    const todayYm = now.toISOString().slice(0, 7);

    if (activeMonth < todayYm) {
      return { elapsedDays: daysInMonth, daysInMonth, remainingDays: 0 };
    }
    if (activeMonth > todayYm) {
      return { elapsedDays: 1, daysInMonth, remainingDays: daysInMonth - 1 };
    }
    const elapsedDays = Math.max(1, Math.min(daysInMonth, now.getDate()));
    return {
      elapsedDays,
      daysInMonth,
      remainingDays: Math.max(0, daysInMonth - elapsedDays),
    };
  }

  function computeCategoryBreakdown(
    whereClause: string,
    params: unknown[],
    activeMonth: string
  ): {
    categoryBreakdown: CategoryBreakdownItem[];
    allBudgets: CategoryBreakdownItem[];
    totalMonthlyBudget: number;
    variableBudgetTotal: number;
    variableSpentTotal: number;
    variableExtrapolatedTotal: number;
    elapsedDaysInMonth: number;
    daysInMonth: number;
    remainingDaysInMonth: number;
  } {
    const { elapsedDays, daysInMonth, remainingDays } = getMonthCalendarProgress(activeMonth);
    const budgets = ctx.db.query<CategoryBudgetRow>('SELECT * FROM category_budgets');
    const budgetMap = new Map(budgets.map((b) => [b.category, Number(b.monthly_limit)]));

    const rawCategories = ctx.db.query<{
      category: string;
      tx_count: number;
      spent: number;
    }>(
      `
      SELECT
        category,
        COUNT(*) as tx_count,
        COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
      FROM transactions
      WHERE amount < 0 AND ${whereClause}
      GROUP BY category
      ORDER BY spent DESC
    `,
      params
    );

    const spentMap = new Map(rawCategories.map((c) => [c.category, c]));

    // Combine all defined expense categories + any custom ones in DB
    const allCatNames = new Set<string>();
    for (const def of CATEGORY_DEFINITIONS) {
      if (def.group !== 'income') allCatNames.add(def.id);
    }
    for (const b of budgets) allCatNames.add(b.category);
    for (const r of rawCategories) allCatNames.add(r.category);

    const allBudgets: CategoryBreakdownItem[] = Array.from(allCatNames).map((catName) => {
      const meta = getCategoryMeta(catName);
      const stat = spentMap.get(catName);
      const spent = stat?.spent ?? 0;
      const txCount = stat?.tx_count ?? 0;
      const budgetLimit = budgetMap.get(catName) ?? meta.defaultBudget;
      const pctUsed =
        budgetLimit > 0 ? Math.min(100, Math.round((spent / budgetLimit) * 100)) : 0;
      const remaining = Number((budgetLimit - spent).toFixed(2));

      const isVariable = meta.group === 'living' || meta.group === 'lifestyle';
      const extrapolatedSpend =
        remainingDays > 0 && isVariable
          ? Number(((spent / elapsedDays) * daysInMonth).toFixed(2))
          : meta.group === 'fixed'
            ? Number(Math.max(spent, budgetLimit).toFixed(2))
            : spent;
      const extrapolatedRemaining = Number((budgetLimit - extrapolatedSpend).toFixed(2));
      const extrapolatedPct =
        budgetLimit > 0 ? Math.round((extrapolatedSpend / budgetLimit) * 100) : 0;
      const dailyAllowanceRemaining =
        remainingDays > 0 && remaining > 0 ? Number((remaining / remainingDays).toFixed(2)) : 0;

      return {
        category: catName,
        labelDe: meta.labelDe,
        color: meta.color,
        icon: meta.icon,
        group: meta.group,
        tx_count: txCount,
        spent,
        budgetLimit,
        pctUsed,
        remaining,
        overBudget: budgetLimit > 0 && spent > budgetLimit,
        extrapolatedSpend,
        extrapolatedRemaining,
        extrapolatedPct,
        dailyAllowanceRemaining,
      };
    });

    allBudgets.sort((a, b) => b.spent - a.spent || b.budgetLimit - a.budgetLimit);

    const categoryBreakdown = allBudgets.filter((c) => c.spent > 0 || c.budgetLimit > 0);
    const totalMonthlyBudget = Number(
      allBudgets
        .filter((c) => c.group !== 'savings' && c.group !== 'income')
        .reduce((sum, c) => sum + c.budgetLimit, 0)
        .toFixed(2)
    );

    const variableItems = allBudgets.filter(
      (c) => c.group === 'living' || c.group === 'lifestyle'
    );
    const variableBudgetTotal = Number(
      variableItems.reduce((sum, c) => sum + c.budgetLimit, 0).toFixed(2)
    );
    const variableSpentTotal = Number(
      variableItems.reduce((sum, c) => sum + c.spent, 0).toFixed(2)
    );
    const variableExtrapolatedTotal = Number(
      variableItems.reduce((sum, c) => sum + c.extrapolatedSpend, 0).toFixed(2)
    );

    return {
      categoryBreakdown,
      allBudgets,
      totalMonthlyBudget,
      variableBudgetTotal,
      variableSpentTotal,
      variableExtrapolatedTotal,
      elapsedDaysInMonth: elapsedDays,
      daysInMonth,
      remainingDaysInMonth: remainingDays,
    };
  }

  async function computeSummaryAndPublishSensors(monthFilter?: string): Promise<{
    kpis: FinanceKpis;
    categoryBreakdown: CategoryBreakdownItem[];
    allBudgets: CategoryBreakdownItem[];
    previewGroupBudgets: CategoryBreakdownItem[];
    previewConfig: PreviewConfig;
    balanceConfig: AccountBalanceConfig;
    exportReminder: ExportReminderStatus;
    fixedCosts: FixedCostItem[];
  }> {
    const previewConfig = getPreviewConfig();
    const balanceConfig = getBalanceConfig();
    const quickImportConfig = getQuickImportConfig(ctx.db);
    const exportReminder = computeExportReminderStatus();

    const activeMonth =
      monthFilter && monthFilter !== 'all' ? monthFilter : resolveDefaultTargetMonth();
    const whereClause = monthFilter === 'all' ? '1=1' : 'substr(tx_date, 1, 7) = ?';
    const params = monthFilter === 'all' ? [] : [activeMonth];

    const totals = ctx.db.queryOne<{
      income: number;
      expenses: number;
      investments: number;
      net: number;
    }>(
      `
      SELECT
        COALESCE(ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2), 0) as income,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category != 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as expenses,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category = 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as investments,
        COALESCE(ROUND(SUM(amount), 2), 0) as net
      FROM transactions
      WHERE ${whereClause}
    `,
      params
    ) || { income: 0, expenses: 0, investments: 0, net: 0 };

    const groceriesRow = ctx.db.queryOne<{ total: number }>(
      `
      SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as total
      FROM transactions
      WHERE amount < 0 AND category = 'Groceries' AND ${whereClause}
    `,
      params
    );
    const grocerySpend = groceriesRow?.total ?? 0;

    const totalSavedOrInvested = Math.max(0, totals.income - totals.expenses);
    const savingsRatePct =
      totals.income > 0 ? Number(((totalSavedOrInvested / totals.income) * 100).toFixed(1)) : 0;

    const dayWeek = computeDailyAndWeeklyExpenses(previewConfig.excludeRoundUpsInExpenses);
    const {
      categoryBreakdown,
      allBudgets,
      totalMonthlyBudget,
      variableBudgetTotal,
      variableSpentTotal,
      variableExtrapolatedTotal,
      elapsedDaysInMonth,
      daysInMonth,
      remainingDaysInMonth,
    } = computeCategoryBreakdown(whereClause, params, activeMonth);

    const periodTxsForFixed = ctx.db.query<TransactionRow>(
      `SELECT * FROM transactions WHERE amount < 0 AND ${whereClause}`,
      params
    );
    const fixedCosts = evaluateFixedCostsWithTransactions(getFixedCostsConfig(), periodTxsForFixed);
    const fixedCostsTotal = Number(
      fixedCosts.reduce((sum, f) => sum + f.amount, 0).toFixed(2)
    );
    const fixedCostsPaidThisMonth = Number(
      fixedCosts
        .filter((f) => f.paidThisMonth)
        .reduce((sum, f) => sum + (f.actualPaidAmount ?? f.amount), 0)
        .toFixed(2)
    );

    const previewGroupBudgets = previewConfig.previewBudgetCategories
      .map((cat) => allBudgets.find((b) => b.category === cat))
      .filter((b): b is CategoryBreakdownItem => Boolean(b));

    const kpis: FinanceKpis = {
      activeMonth,
      currentBalance: balanceConfig.currentBalance,
      accountName: balanceConfig.accountName,
      iban: balanceConfig.iban,
      income: totals.income,
      expenses: totals.expenses,
      investments: totals.investments,
      net: totals.net,
      grocerySpend,
      savingsRatePct,
      expensesToday: dayWeek.expensesToday,
      expensesDay: dayWeek.expensesDay,
      expensesDayDate: dayWeek.expensesDayDate,
      expensesDayLabel: dayWeek.expensesDayLabel,
      expensesWeek: dayWeek.expensesWeek,
      expensesWeekVariable: dayWeek.expensesWeekVariable,
      expensesWeekRangeLabel: dayWeek.expensesWeekRangeLabel,
      expensesMonthVariable: variableSpentTotal,
      fixedCostsTotal,
      fixedCostsPaidThisMonth,
      variableBudgetTotal,
      variableBudgetRemaining: Number((variableBudgetTotal - variableSpentTotal).toFixed(2)),
      variableExtrapolatedSpend: variableExtrapolatedTotal,
      variableExtrapolatedRemaining: Number(
        (variableBudgetTotal - variableExtrapolatedTotal).toFixed(2)
      ),
      elapsedDaysInMonth,
      daysInMonth,
      remainingDaysInMonth,
      totalMonthlyBudget: Number((variableBudgetTotal + fixedCostsTotal).toFixed(2)),
      haConnected: true,
    };

    // Store rich summary in /data/shared.db for Horizon Dashboard & cross-app use
    ctx.sharedDb.kvSet('finance_summary', {
      activeMonth,
      currentBalance: balanceConfig.currentBalance,
      accountName: balanceConfig.accountName,
      iban: balanceConfig.iban,
      income: totals.income,
      expenses: totals.expenses,
      investments: totals.investments,
      netCashflow: totals.net,
      grocerySpend,
      savingsRatePct,
      expensesDay: dayWeek.expensesDay,
      expensesDayDate: dayWeek.expensesDayDate,
      expensesDayLabel: dayWeek.expensesDayLabel,
      expensesWeek: dayWeek.expensesWeek,
      expensesWeekRangeLabel: dayWeek.expensesWeekRangeLabel,
      totalMonthlyBudget,
      previewConfig,
      previewGroupBudgets,
      exportReminder,
      quickImportConfig: {
        bankId: quickImportConfig.bankId,
        loginUrl: quickImportConfig.loginUrl,
        verfuegernummer: quickImportConfig.verfuegernummer,
        autoLoginEnabled: quickImportConfig.autoLoginEnabled,
        saveCookiesEnabled: quickImportConfig.saveCookiesEnabled,
        savedCookieCount: quickImportConfig.savedCookieCount,
        lastAutoImportAt: quickImportConfig.lastAutoImportAt,
        lastAutoImportFile: quickImportConfig.lastAutoImportFile,
      },
      updatedAt: new Date().toISOString(),
    });

    // Publish Home Assistant sensors asynchronously so HTTP API responses never block
    void (async () => {
      try {
        const haStatus = await ctx.ha.getStatus();
        if (!haStatus.connected) return;
        await Promise.allSettled([
          ctx.ha.publishSensor('current_balance', balanceConfig.currentBalance, {
            friendly_name: `Kontostand (${balanceConfig.accountName})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:bank',
            iban: balanceConfig.iban,
          }),
          ctx.ha.publishSensor('daily_expenses', dayWeek.expensesDay, {
            friendly_name: `Tagesausgaben (${dayWeek.expensesDayLabel})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:cash-minus',
            date: dayWeek.expensesDayDate,
          }),
          ctx.ha.publishSensor('weekly_expenses', dayWeek.expensesWeek, {
            friendly_name: `Wochenausgaben (${dayWeek.expensesWeekRangeLabel})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:calendar-week',
          }),
          ctx.ha.publishSensor('net_cashflow', totals.net, {
            friendly_name: `Net Cashflow (${activeMonth})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:cash-multiple',
            period_month: activeMonth,
            income_eur: totals.income,
            expenses_eur: totals.expenses,
            investments_eur: totals.investments,
            savings_rate_pct: savingsRatePct,
          }),
          ctx.ha.publishSensor('monthly_expenses', totals.expenses, {
            friendly_name: `Living Expenses (${activeMonth})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:credit-card-outline',
            period_month: activeMonth,
          }),
          ctx.ha.publishSensor('grocery_spend', grocerySpend, {
            friendly_name: `Grocery Spend (${activeMonth})`,
            unit_of_measurement: 'EUR',
            icon: 'mdi:cart-check',
            period_month: activeMonth,
          }),
          ctx.ha.publishSensor('savings_rate', savingsRatePct, {
            friendly_name: `Savings & Investment Rate (${activeMonth})`,
            unit_of_measurement: '%',
            icon: 'mdi:piggy-bank-outline',
            period_month: activeMonth,
          }),
          ctx.ha.publishSensor('export_reminder', exportReminder.due ? 'fällig' : 'aktuell', {
            friendly_name: 'Finanz Bank-Export Erinnerung',
            icon: exportReminder.due ? 'mdi:bell-alert-outline' : 'mdi:check-circle-outline',
            due: exportReminder.due,
            urgency: exportReminder.urgency,
            latest_tx_date: exportReminder.latestTxDate,
            days_since_latest_tx: exportReminder.daysSinceLatestTx,
            headline: exportReminder.headlineDe,
            detail: exportReminder.detailDe,
          }),
        ]);
      } catch {
        // Ignore background HA publish error
      }
    })();

    return {
      kpis,
      categoryBreakdown,
      allBudgets,
      previewGroupBudgets,
      previewConfig,
      balanceConfig,
      exportReminder,
      fixedCosts,
    };
  }

  // 2. REST API Routes (/api/apps/finance-analytics/*)

  ctx.route('GET', '/dashboard', async () => {
    const summary = await computeSummaryAndPublishSensors();
    return {
      kpis: summary.kpis,
      previewConfig: summary.previewConfig,
      previewGroupBudgets: summary.previewGroupBudgets,
      allBudgets: summary.allBudgets,
      balanceConfig: summary.balanceConfig,
      exportReminder: summary.exportReminder,
      fixedCosts: summary.fixedCosts,
      quickImportConfig: getQuickImportConfig(ctx.db),
    };
  });

  ctx.route('GET', '/overview', async (req, { db, sharedDb }) => {
    const requestedMonth = req.query.month || undefined;
    const summary = await computeSummaryAndPublishSensors(requestedMonth);
    const activeMonth = summary.kpis.activeMonth;
    const whereClause = requestedMonth === 'all' ? '1=1' : 'substr(tx_date, 1, 7) = ?';
    const params = requestedMonth === 'all' ? [] : [activeMonth];

    const availableMonths = db
      .query<{ ym: string }>(
        'SELECT DISTINCT substr(tx_date, 1, 7) as ym FROM transactions ORDER BY ym DESC'
      )
      .map((r) => r.ym);

    const periodTransactions = db.query<TransactionRow>(
      `SELECT * FROM transactions WHERE ${whereClause} ORDER BY tx_date DESC, id DESC`,
      params
    );

    const recurringFixed = db.query<TransactionRow>(
      `SELECT * FROM transactions WHERE is_recurring = 1 AND amount < 0 AND category != 'Investments' AND ${whereClause} ORDER BY ABS(amount) DESC`,
      params
    );

    const sunburstGroups = buildSunburstHierarchy(
      periodTransactions,
      'groups',
      summary.previewConfig.excludeRoundUpsInExpenses
    );
    const sunburstMerchants = buildSunburstHierarchy(
      periodTransactions,
      'merchants',
      summary.previewConfig.excludeRoundUpsInExpenses
    );

    const mealPlannerToday = sharedDb.kvGet<{
      date: string;
      dinner: string | null;
      totalCalories: number;
      openGroceries: number;
    }>('meal_planner_today');

    return {
      kpis: summary.kpis,
      activeMonth,
      availableMonths,
      transactions: periodTransactions.slice(0, 350),
      totalTransactionCount: periodTransactions.length,
      categoryBreakdown: summary.categoryBreakdown,
      allBudgets: summary.allBudgets,
      previewGroupBudgets: summary.previewGroupBudgets,
      previewConfig: summary.previewConfig,
      balanceConfig: summary.balanceConfig,
      exportReminder: summary.exportReminder,
      quickImportConfig: getQuickImportConfig(db),
      fixedCosts: summary.fixedCosts,
      recurringFixed,
      sunburstGroups,
      sunburstMerchants,
      mealPlannerToday: mealPlannerToday || null,
    };
  });

  ctx.route('POST', '/fixed-costs', async (req) => {
    const body = (req.body || {}) as {
      items?: FixedCostItem[];
      resetDefaults?: boolean;
    };
    const next = body.resetDefaults
      ? saveFixedCostsConfig(DEFAULT_FIXED_COSTS)
      : Array.isArray(body.items)
        ? saveFixedCostsConfig(body.items)
        : getFixedCostsConfig();
    const summary = await computeSummaryAndPublishSensors();
    return {
      fixedCosts: summary.fixedCosts,
      configuredItems: next,
      kpis: summary.kpis,
    };
  });

  // Update Horizon Dashboard Preview Configuration
  ctx.route('POST', '/preview-config', async (req) => {
    const body = (req.body || {}) as Partial<PreviewConfig>;
    const updated = savePreviewConfig(body);
    const summary = await computeSummaryAndPublishSensors();
    return {
      previewConfig: updated,
      previewGroupBudgets: summary.previewGroupBudgets,
      kpis: summary.kpis,
    };
  });

  // Update Account Balance Configuration (Aktueller Kontostand)
  ctx.route('POST', '/balance', async (req) => {
    const body = (req.body || {}) as Partial<AccountBalanceConfig>;
    const updated = saveBalanceConfig(body);
    const summary = await computeSummaryAndPublishSensors();
    return {
      balanceConfig: updated,
      kpis: summary.kpis,
    };
  });

  // Update single or batch Monthly Budgets
  ctx.route('POST', '/budgets', async (req, { db }) => {
    const body = (req.body || {}) as {
      category?: string;
      monthly_limit?: number;
      budgets?: Array<{ category: string; monthly_limit: number }>;
    };

    if (Array.isArray(body.budgets)) {
      db.exec('BEGIN TRANSACTION;');
      try {
        for (const item of body.budgets) {
          if (!item.category) continue;
          db.execute(
            `INSERT INTO category_budgets (category, monthly_limit)
             VALUES (?, ?)
             ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
            [item.category.trim(), Math.max(0, Number(item.monthly_limit) || 0)]
          );
        }
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    } else if (body.category && body.monthly_limit !== undefined) {
      db.execute(
        `INSERT INTO category_budgets (category, monthly_limit)
         VALUES (?, ?)
         ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
        [body.category.trim(), Math.max(0, Number(body.monthly_limit) || 0)]
      );
    } else {
      return { status: 400, body: { error: 'category and monthly_limit (or budgets array) required' } };
    }

    const summary = await computeSummaryAndPublishSensors();
    return {
      updated: true,
      allBudgets: summary.allBudgets,
      kpis: summary.kpis,
    };
  });

  ctx.route('DELETE', '/budgets', async (req, { db }) => {
    const cat = (req.query.category || '').trim();
    if (!cat) return { status: 400, body: { error: 'category query param required' } };
    db.execute('DELETE FROM category_budgets WHERE category = ?', [cat]);
    const summary = await computeSummaryAndPublishSensors();
    return { deleted: cat, allBudgets: summary.allBudgets };
  });

  // Add a single transaction
  ctx.route('POST', '/transactions', async (req, { db }) => {
    const body = (req.body || {}) as Partial<TransactionRow> & { adjustBalance?: boolean };
    if (!body.payee?.trim() || body.amount === undefined) {
      return { status: 400, body: { error: 'Payee and amount are required' } };
    }
    const amt = Number(Number(body.amount).toFixed(2));
    const cleanPayee = normalizePayeeName(body.payee, body.notes || '');
    const category =
      body.category?.trim() || autoCategorizeTransaction(cleanPayee, body.notes || '', amt);
    const txDate = body.tx_date || new Date().toISOString().slice(0, 10);
    const isRec =
      body.is_recurring !== undefined
        ? body.is_recurring
          ? 1
          : 0
        : detectRecurringFlag(cleanPayee, body.notes || '', category);
    const txRef = computeTransactionRef(txDate, amt, cleanPayee, body.notes || '');

    db.execute(
      `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes, tx_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txDate,
        cleanPayee,
        category,
        amt,
        (body.account || 'Girokonto').trim(),
        isRec,
        (body.notes || '').trim(),
        txRef,
      ]
    );

    const balCfg = getBalanceConfig();
    if (body.adjustBalance ?? balCfg.autoAdjustOnImport) {
      saveBalanceConfig({ currentBalance: balCfg.currentBalance + amt });
    }

    const summary = await computeSummaryAndPublishSensors();
    return { added: true, kpis: summary.kpis };
  });

  // Update an existing transaction (category, recurring flag, payee, notes)
  ctx.route('PUT', '/transactions', async (req, { db }) => {
    const body = (req.body || {}) as Partial<TransactionRow>;
    if (!body.id) {
      return { status: 400, body: { error: 'Transaction id is required' } };
    }
    const existing = db.queryOne<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [
      Number(body.id),
    ]);
    if (!existing) {
      return { status: 404, body: { error: 'Transaction not found' } };
    }

    const nextCategory = body.category?.trim() || existing.category;
    const nextRecurring =
      body.is_recurring !== undefined ? (body.is_recurring ? 1 : 0) : existing.is_recurring;
    const nextPayee = body.payee?.trim() || existing.payee;
    const nextNotes = body.notes !== undefined ? body.notes.trim() : existing.notes;

    db.execute(
      'UPDATE transactions SET payee = ?, category = ?, is_recurring = ?, notes = ? WHERE id = ?',
      [nextPayee, nextCategory, nextRecurring, nextNotes, Number(body.id)]
    );

    const summary = await computeSummaryAndPublishSensors();
    return { updated: true, kpis: summary.kpis };
  });

  ctx.route('DELETE', '/transactions', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM transactions WHERE id = ?', [id]);
    const summary = await computeSummaryAndPublishSensors();
    return { deleted: id, kpis: summary.kpis };
  });

  // Universal Bank Statement Importer (ZIP Bundle, CSV UTF-16LE/UTF-8, SEPA CAMT.053 XML, SWIFT MT940, JSON)
  ctx.route('POST', '/import-bank-csv', async (req, { db }) => {
    const body = (req.body || {}) as {
      csvText?: string;
      base64Content?: string;
      fileName?: string;
      accountName?: string;
      replaceAll?: boolean;
    };

    let rawInput: string | Buffer = '';
    if (body.base64Content) {
      rawInput = Buffer.from(body.base64Content, 'base64');
    } else if (body.csvText) {
      rawInput = body.csvText;
    }

    if (
      (typeof rawInput === 'string' && !rawInput.trim()) ||
      (Buffer.isBuffer(rawInput) && rawInput.length === 0)
    ) {
      return { status: 400, body: { error: 'csvText or base64Content is required' } };
    }

    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      rawInput,
      {
        fileName: body.fileName || 'Manual-Import.csv',
        accountName: body.accountName,
        replaceAll: body.replaceAll,
        onBalanceDetected: (bal, iban, acct) => {
          saveBalanceConfig({
            currentBalance: bal,
            ...(iban ? { iban } : {}),
            ...(acct ? { accountName: acct } : {}),
          });
        },
      }
    );

    if (parseResult.transactions.length === 0) {
      return { status: 400, body: { error: 'Keine gültigen Buchungszeilen in der Datei erkannt.' } };
    }

    saveExportReminderConfig({
      lastBankSyncAt: new Date().toISOString(),
      snoozedUntil: null,
    });

    const summary = await computeSummaryAndPublishSensors();
    return {
      importedCount: insertedCount,
      skippedDuplicates,
      totalParsed: parseResult.transactions.length,
      format: parseResult.format,
      kpis: summary.kpis,
      exportReminder: summary.exportReminder,
    };
  });

  // 2b. 1-Click File Export (CSV DE Excel UTF-8 BOM, CSV EN, Steuer-/Fixkosten-Report, JSON Backup) & Reminder Config
  ctx.route('POST', '/reminder/config', async (req) => {
    const body = (req.body || {}) as {
      reminderIntervalDays?: number;
      remindOnNewMonth?: boolean;
      snoozeDays?: number;
      markSyncedNow?: boolean;
    };

    const patch: Partial<ExportReminderConfig> = {};
    if (typeof body.reminderIntervalDays === 'number') {
      patch.reminderIntervalDays = body.reminderIntervalDays;
    }
    if (typeof body.remindOnNewMonth === 'boolean') {
      patch.remindOnNewMonth = body.remindOnNewMonth;
    }
    if (typeof body.snoozeDays === 'number') {
      patch.snoozedUntil =
        body.snoozeDays > 0
          ? new Date(Date.now() + body.snoozeDays * 86400000).toISOString()
          : null;
    }
    if (body.markSyncedNow) {
      patch.lastBankSyncAt = new Date().toISOString();
      patch.snoozedUntil = null;
    }

    saveExportReminderConfig(patch);
    const summary = await computeSummaryAndPublishSensors();
    return {
      exportReminder: summary.exportReminder,
    };
  });

  ctx.route('GET', '/export', async (req, { db }) => {
    const format = (req.query.format || 'csv_de') as
      | 'csv_de'
      | 'csv_en'
      | 'tax_report'
      | 'json';
    const monthFilter = req.query.month || 'all';
    const categoryFilter = req.query.category || 'ALL';

    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (monthFilter && monthFilter !== 'all') {
      if (monthFilter.length === 4) {
        clauses.push('substr(tx_date, 1, 4) = ?');
        params.push(monthFilter);
      } else {
        clauses.push('substr(tx_date, 1, 7) = ?');
        params.push(monthFilter);
      }
    }
    if (categoryFilter && categoryFilter !== 'ALL') {
      clauses.push('category = ?');
      params.push(categoryFilter);
    }

    const rows = db.query<TransactionRow>(
      `SELECT * FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY tx_date DESC, id DESC`,
      params
    );

    saveExportReminderConfig({
      lastDataExportAt: new Date().toISOString(),
    });
    const summary = await computeSummaryAndPublishSensors(
      monthFilter !== 'all' && monthFilter.length === 7 ? monthFilter : undefined
    );

    const dateStamp = new Date().toISOString().slice(0, 10);
    const scopeLabel = monthFilter === 'all' ? 'Gesamt' : monthFilter;

    if (format === 'json') {
      const payload = {
        exportedAt: new Date().toISOString(),
        scope: scopeLabel,
        account: summary.balanceConfig,
        kpis: summary.kpis,
        categoryBreakdown: summary.categoryBreakdown,
        transactionCount: rows.length,
        transactions: rows,
      };
      const fileName = `Thassi_Finanzen_Backup_${scopeLabel}_${dateStamp}.json`;
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
        body: JSON.stringify(payload, null, 2),
      };
    }

    if (format === 'tax_report') {
      const escDe = (val: string | number | null | undefined) => {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
      };
      const fmtNumDe = (n: number) => n.toFixed(2).replace('.', ',');
      const lines: string[] = [];
      lines.push(
        `# THASSI FINANZ- & STEUERBERICHT (${scopeLabel}) — Exportiert am ${dateStamp}`
      );
      lines.push(
        `Konto;${escDe(summary.balanceConfig.accountName)};IBAN;${escDe(summary.balanceConfig.iban)};Aktueller Kontostand;${fmtNumDe(summary.balanceConfig.currentBalance)} EUR`
      );
      lines.push('');
      lines.push('ABSCHNITT 1: KATEGORIE-ZUSAMMENFASSUNG');
      lines.push('Kategorie (DE);Kategorie-ID;Gruppe;Buchungen;Ausgaben (EUR);Monatsbudget (EUR);Auslastung (%)');
      for (const cat of summary.categoryBreakdown) {
        lines.push(
          [
            escDe(cat.labelDe),
            escDe(cat.category),
            escDe(cat.group),
            cat.tx_count,
            fmtNumDe(cat.spent),
            fmtNumDe(cat.budgetLimit),
            `${cat.pctUsed}%`,
          ].join(';')
        );
      }
      lines.push('');
      lines.push('ABSCHNITT 2: EINZELBUCHUNGEN');
      lines.push('Buchungsdatum;Empfänger / Zahlungspflichtiger;Kategorie (DE);Kategorie-ID;Typ;Betrag (EUR);Konto;Notiz;Referenz');
      for (const r of rows) {
        const meta = getCategoryMeta(r.category);
        lines.push(
          [
            r.tx_date,
            escDe(r.payee),
            escDe(meta.labelDe),
            escDe(r.category),
            r.is_recurring ? 'Fixkosten' : 'Variabel',
            fmtNumDe(r.amount),
            escDe(r.account),
            escDe(r.notes),
            escDe(r.tx_ref || ''),
          ].join(';')
        );
      }
      const csvWithBom = '\uFEFF' + lines.join('\r\n');
      const fileName = `Thassi_Finanzbericht_${scopeLabel}_${dateStamp}.csv`;
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
        body: csvWithBom,
      };
    }

    if (format === 'csv_en') {
      const escEn = (val: string | number | null | undefined) => {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
      };
      const lines: string[] = [
        'Date,Payee,Category_DE,Category_ID,Type,Amount_EUR,Account,Notes,Reference',
      ];
      for (const r of rows) {
        const meta = getCategoryMeta(r.category);
        lines.push(
          [
            r.tx_date,
            escEn(r.payee),
            escEn(meta.labelDe),
            escEn(r.category),
            r.is_recurring ? 'FIXED' : 'VARIABLE',
            r.amount.toFixed(2),
            escEn(r.account),
            escEn(r.notes),
            escEn(r.tx_ref || ''),
          ].join(',')
        );
      }
      const fileName = `Thassi_Transactions_${scopeLabel}_${dateStamp}.csv`;
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
        body: lines.join('\r\n'),
      };
    }

    // Default: csv_de (German Excel/Sparkasse compatible `;`-delimited UTF-8 with BOM and comma decimals)
    const escDe = (val: string | number | null | undefined) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const fmtNumDe = (n: number) => n.toFixed(2).replace('.', ',');
    const lines: string[] = [
      'Buchungsdatum;Empfänger;Kategorie;Kategorie_ID;Fixkosten;Betrag;Währung;Konto;Verwendungszweck;Buchungsreferenz',
    ];
    for (const r of rows) {
      const meta = getCategoryMeta(r.category);
      lines.push(
        [
          r.tx_date,
          escDe(r.payee),
          escDe(meta.labelDe),
          escDe(r.category),
          r.is_recurring ? 'Ja' : 'Nein',
          fmtNumDe(r.amount),
          'EUR',
          escDe(r.account),
          escDe(r.notes),
          escDe(r.tx_ref || ''),
        ].join(';')
      );
    }
    const csvWithBom = '\uFEFF' + lines.join('\r\n');
    const fileName = `Thassi_Buchungen_${scopeLabel}_${dateStamp}.csv`;
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      body: csvWithBom,
    };
  });

  // 3. Quick Import Routes (Online-Banking Flyout Browser, Cookie Vault, Auto-Download Watcher)
  ctx.route('GET', '/quick-import/config', (_req, { db }) => {
    return {
      config: getQuickImportConfig(db),
      balanceConfig: getBalanceConfig(),
    };
  });

  ctx.route('POST', '/quick-import/config', (req, { db }) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const updated = saveQuickImportConfig(db, body);
    return { config: updated };
  });

  ctx.route('POST', '/quick-import/cookies/clear', (_req, { db }) => {
    clearCookieVault(db);
    return { cleared: true, config: getQuickImportConfig(db) };
  });

  ctx.route('GET', '/quick-import/portal', (req, { db }) => {
    const cfg = getQuickImportConfig(db);
    const ingressBase = ((req.headers['x-ingress-path'] as string) || '').replace(/\/+$/, '');
    const html = renderQuickImportPortalHtml(cfg, ingressBase);
    return {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    };
  });

  ctx.route('GET', '/quick-import/proxy', async (req, { db }) => {
    const cfg = getQuickImportConfig(db);
    const targetUrl = req.query.url || cfg.loginUrl;
    try {
      const cookieHeader = getCookieHeaderForUrl(db, targetUrl);
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        redirect: 'follow',
      });

      const rawSetCookies =
        typeof upstreamRes.headers.getSetCookie === 'function'
          ? upstreamRes.headers.getSetCookie()
          : upstreamRes.headers.get('set-cookie')
            ? [upstreamRes.headers.get('set-cookie')!]
            : [];
      if (rawSetCookies.length > 0) {
        saveCookiesToVault(db, targetUrl, rawSetCookies);
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      const contentDisp = upstreamRes.headers.get('content-disposition') || '';
      const arrBuf = await upstreamRes.arrayBuffer();
      const buf = Buffer.from(arrBuf);

      // If the response is a downloadable CSV / XML / MT940 file, auto-import immediately!
      if (
        /attachment/i.test(contentDisp) ||
        /text\/csv|application\/csv/i.test(contentType) ||
        /\.(csv|sta|mt940|xml)(\?|$)/i.test(targetUrl)
      ) {
        const decoded = decodeBankFileBuffer(buf);
        const fileNameMatch = contentDisp.match(/filename="?([^";]+)"?/i);
        const fileName = fileNameMatch ? fileNameMatch[1] : 'OnlineBanking-Export.csv';
        const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
          db,
          decoded,
          {
            fileName,
            accountName: cfg.defaultAccountName,
            onBalanceDetected: (bal, iban, acct) => {
              saveBalanceConfig({
                currentBalance: bal,
                ...(iban ? { iban } : {}),
                ...(acct ? { accountName: acct } : {}),
              });
            },
          }
        );
        await computeSummaryAndPublishSensors();
        return {
          imported: true,
          fileName,
          format: parseResult.format,
          insertedCount,
          skippedDuplicates,
        };
      }

      return {
        proxiedUrl: targetUrl,
        status: upstreamRes.status,
        savedCookieCount: getQuickImportConfig(db).savedCookieCount,
      };
    } catch (err) {
      return {
        status: 502,
        body: {
          error: 'Could not reach bank URL directly via proxy',
          details: err instanceof Error ? err.message : String(err),
        },
      };
    }
  });

  ctx.route('POST', '/quick-import/scan-downloads', async (_req, { db }) => {
    const events = scanDownloadsFolderForNewExports(db, (bal, iban, acct) => {
      saveBalanceConfig({
        currentBalance: bal,
        ...(iban ? { iban } : {}),
        ...(acct ? { accountName: acct } : {}),
      });
    });
    if (events.length > 0) {
      saveExportReminderConfig({
        lastBankSyncAt: new Date().toISOString(),
        snoozedUntil: null,
      });
    }
    const summary = await computeSummaryAndPublishSensors();
    return {
      scanned: true,
      events,
      config: getQuickImportConfig(db),
      kpis: summary.kpis,
      exportReminder: summary.exportReminder,
    };
  });

  ctx.route('POST', '/quick-import/simulate-download', async (req, { db }) => {
    const body = (req.body || {}) as { accountName?: string };
    const { fileName, csvContent } = buildSampleGeorgeLiveExportCsv();
    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      csvContent,
      {
        fileName,
        accountName: body.accountName || 'Girokonto',
      }
    );

    saveExportReminderConfig({
      lastBankSyncAt: new Date().toISOString(),
      snoozedUntil: null,
    });

    const summary = await computeSummaryAndPublishSensors();
    return {
      imported: true,
      fileName,
      csvContent,
      format: parseResult.format,
      insertedCount,
      skippedDuplicates,
      kpis: summary.kpis,
      exportReminder: summary.exportReminder,
      config: getQuickImportConfig(db),
    };
  });

  // 4. Scheduled Background Cron Job (Sensor Sync + Auto-Downloads Watcher)
  ctx.scheduleJob({
    id: 'sync-finance-sensors',
    name: 'Publish Finance Sensors & Watch Downloads for Quick Import',
    description:
      'Watches Downloads folder for new bank exports and publishes current_balance, daily_expenses, weekly_expenses, net_cashflow, and budget sensors to Home Assistant.',
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      scanDownloadsFolderForNewExports(ctx.db, (bal, iban, acct) => {
        saveBalanceConfig({
          currentBalance: bal,
          ...(iban ? { iban } : {}),
          ...(acct ? { accountName: acct } : {}),
        });
      });
      const { kpis } = await computeSummaryAndPublishSensors();
      return `[${kpis.activeMonth}] Balance: €${kpis.currentBalance} | Day: -€${kpis.expensesDay} | Week: -€${kpis.expensesWeek} | Expenses: -€${kpis.expenses}`;
    },
  });
});
