import http from 'node:http';
import { defineThassiApp } from '@thassi/sdk';
import { renderUnifiedDashboardHtml } from '../../../thassi_host/src/ambient-dashboard.js';
import { syncHassFrontendFiles } from '../../../thassi_host/src/hass-sidebar-sync.js';
import {
  CATEGORY_DEFINITIONS,
  DEFAULT_BALANCE_CONFIG,
  DEFAULT_PREVIEW_CONFIG,
  getCategoryMeta,
  type AccountBalanceConfig,
  type CategoryBreakdownItem,
  type CategoryBudgetRow,
  type FinanceKpis,
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

// Zero-downtime live hot-patch for Thassi Horizon Dashboard so updated #widget-finances & #quick-import-flyout are served on /
const globalAny = globalThis as unknown as {
  __thassiOrigEmit?: typeof http.Server.prototype.emit;
};
if (!globalAny.__thassiOrigEmit) {
  globalAny.__thassiOrigEmit = http.Server.prototype.emit;
}
http.Server.prototype.emit = function (event: string, ...args: unknown[]): boolean {
  if (event === 'request') {
    const req = args[0] as http.IncomingMessage | undefined;
    const res = args[1] as http.ServerResponse | undefined;
    if (req && res && (req.method === 'GET' || !req.method)) {
      const safeUrl = (req.url || '/').split('?')[0].replace(/\/+/g, '/');
      const standalone = ((req.headers['x-thassi-standalone-app'] as string) || '').trim();
      if (!standalone && (safeUrl === '/' || safeUrl === '/index.html')) {
        const ingressPath = ((req.headers['x-ingress-path'] as string) || '').replace(/\/+$/, '');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderUnifiedDashboardHtml(ingressPath));
        return true;
      }
    }
  }
  return globalAny.__thassiOrigEmit!.apply(this, [event, ...args] as never);
};

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

  // Ensure all default budget categories exist
  for (const b of getDefaultCategoryBudgets()) {
    ctx.db.execute(
      'INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)',
      [b.category, b.monthly_limit]
    );
  }

  // One-time smart re-categorization migration for legacy rows
  const migrationDone = ctx.db.kvGet<boolean>('finance_categorizer_v2_migrated');
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
      ctx.db.exec('COMMIT;');
      ctx.db.kvSet('finance_categorizer_v2_migrated', true);
    } catch {
      ctx.db.exec('ROLLBACK;');
    }
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

  function resolveDefaultTargetMonth(): string {
    const months = ctx.db.query<{ ym: string; cnt: number; inc: number }>(`
      SELECT
        substr(tx_date, 1, 7) as ym,
        COUNT(*) as cnt,
        SUM(CASE WHEN amount > 500 THEN amount ELSE 0 END) as inc
      FROM transactions
      GROUP BY ym
      ORDER BY ym DESC
    `);
    if (months.length === 0) return new Date().toISOString().slice(0, 7);
    const fullMonth = months.find((m) => m.cnt >= 8 || m.inc > 1000);
    return fullMonth ? fullMonth.ym : months[0].ym;
  }

  function computeDailyAndWeeklyExpenses(excludeRoundUps: boolean): {
    expensesDay: number;
    expensesDayDate: string;
    expensesDayLabel: string;
    expensesWeek: number;
    expensesWeekRangeLabel: string;
  } {
    const roundUpClause = excludeRoundUps
      ? `AND category != 'Investments' AND payee NOT LIKE '%Notgroschen%'`
      : `AND category != 'Investments'`;

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayRow = ctx.db.queryOne<{ spent: number }>(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date = ?`,
      [todayIso]
    );

    let expensesDay = todayRow?.spent ?? 0;
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
        expensesDayLabel = `Letzter Tag (${dd}.${mm}.)`;
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

    let expensesWeek = weekRow?.spent ?? 0;
    let expensesWeekRangeLabel = 'Aktuelle Woche (7T)';

    if (expensesWeek === 0 && expensesDayDate) {
      const refEndMs = new Date(`${expensesDayDate}T12:00:00Z`).getTime();
      const refStartIso = new Date(refEndMs - 6 * 86400000).toISOString().slice(0, 10);
      const fallbackWeek = ctx.db.queryOne<{ spent: number }>(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      if (fallbackWeek && fallbackWeek.spent > 0) {
        expensesWeek = fallbackWeek.spent;
        const [, m1, d1] = refStartIso.split('-');
        const [, m2, d2] = expensesDayDate.split('-');
        expensesWeekRangeLabel = `7 Tage (${d1}.${m1}.–${d2}.${m2}.)`;
      }
    }

    return {
      expensesDay,
      expensesDayDate,
      expensesDayLabel,
      expensesWeek,
      expensesWeekRangeLabel,
    };
  }

  function computeCategoryBreakdown(whereClause: string, params: unknown[]): {
    categoryBreakdown: CategoryBreakdownItem[];
    allBudgets: CategoryBreakdownItem[];
    totalMonthlyBudget: number;
  } {
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
      const remaining = Number(Math.max(0, budgetLimit - spent).toFixed(2));
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

    return { categoryBreakdown, allBudgets, totalMonthlyBudget };
  }

  async function computeSummaryAndPublishSensors(monthFilter?: string): Promise<{
    kpis: FinanceKpis;
    categoryBreakdown: CategoryBreakdownItem[];
    allBudgets: CategoryBreakdownItem[];
    previewGroupBudgets: CategoryBreakdownItem[];
    previewConfig: PreviewConfig;
    balanceConfig: AccountBalanceConfig;
  }> {
    const previewConfig = getPreviewConfig();
    const balanceConfig = getBalanceConfig();
    const quickImportConfig = getQuickImportConfig(ctx.db);

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
    const { categoryBreakdown, allBudgets, totalMonthlyBudget } = computeCategoryBreakdown(
      whereClause,
      params
    );

    const previewGroupBudgets = previewConfig.previewBudgetCategories
      .map((cat) => allBudgets.find((b) => b.category === cat))
      .filter((b): b is CategoryBreakdownItem => Boolean(b));

    const haStatus = await ctx.ha.getStatus();

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
      expensesDay: dayWeek.expensesDay,
      expensesDayDate: dayWeek.expensesDayDate,
      expensesDayLabel: dayWeek.expensesDayLabel,
      expensesWeek: dayWeek.expensesWeek,
      expensesWeekRangeLabel: dayWeek.expensesWeekRangeLabel,
      totalMonthlyBudget,
      haConnected: haStatus.connected,
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
      quickImportConfig: {
        bankId: quickImportConfig.bankId,
        loginUrl: quickImportConfig.loginUrl,
        autoLoginEnabled: quickImportConfig.autoLoginEnabled,
        saveCookiesEnabled: quickImportConfig.saveCookiesEnabled,
        savedCookieCount: quickImportConfig.savedCookieCount,
        lastAutoImportAt: quickImportConfig.lastAutoImportAt,
        lastAutoImportFile: quickImportConfig.lastAutoImportFile,
      },
      updatedAt: new Date().toISOString(),
    });

    if (haStatus.connected) {
      await ctx.ha.publishSensor('current_balance', balanceConfig.currentBalance, {
        friendly_name: `Kontostand (${balanceConfig.accountName})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:bank',
        iban: balanceConfig.iban,
      });

      await ctx.ha.publishSensor('daily_expenses', dayWeek.expensesDay, {
        friendly_name: `Tagesausgaben (${dayWeek.expensesDayLabel})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:cash-minus',
        date: dayWeek.expensesDayDate,
      });

      await ctx.ha.publishSensor('weekly_expenses', dayWeek.expensesWeek, {
        friendly_name: `Wochenausgaben (${dayWeek.expensesWeekRangeLabel})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:calendar-week',
      });

      await ctx.ha.publishSensor('net_cashflow', totals.net, {
        friendly_name: `Net Cashflow (${activeMonth})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:cash-multiple',
        period_month: activeMonth,
        income_eur: totals.income,
        expenses_eur: totals.expenses,
        investments_eur: totals.investments,
        savings_rate_pct: savingsRatePct,
      });

      await ctx.ha.publishSensor('monthly_expenses', totals.expenses, {
        friendly_name: `Living Expenses (${activeMonth})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:credit-card-outline',
        period_month: activeMonth,
      });

      await ctx.ha.publishSensor('grocery_spend', grocerySpend, {
        friendly_name: `Grocery Spend (${activeMonth})`,
        unit_of_measurement: 'EUR',
        icon: 'mdi:cart-check',
        period_month: activeMonth,
      });

      await ctx.ha.publishSensor('savings_rate', savingsRatePct, {
        friendly_name: `Savings & Investment Rate (${activeMonth})`,
        unit_of_measurement: '%',
        icon: 'mdi:piggy-bank-outline',
        period_month: activeMonth,
      });
    }

    return {
      kpis,
      categoryBreakdown,
      allBudgets,
      previewGroupBudgets,
      previewConfig,
      balanceConfig,
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
      quickImportConfig: getQuickImportConfig(db),
      recurringFixed,
      sunburstGroups,
      sunburstMerchants,
      mealPlannerToday: mealPlannerToday || null,
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

  // Universal Bank Statement Importer (CSV UTF-16LE/UTF-8, SEPA CAMT.053 XML, SWIFT MT940, JSON)
  ctx.route('POST', '/import-bank-csv', async (req, { db }) => {
    const body = (req.body || {}) as {
      csvText?: string;
      base64Content?: string;
      fileName?: string;
      accountName?: string;
      replaceAll?: boolean;
    };

    let rawText = body.csvText || '';
    if (!rawText && body.base64Content) {
      const buf = Buffer.from(body.base64Content, 'base64');
      rawText = decodeBankFileBuffer(buf);
    }

    if (!rawText.trim()) {
      return { status: 400, body: { error: 'csvText or base64Content is required' } };
    }

    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      rawText,
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

    const summary = await computeSummaryAndPublishSensors();
    return {
      importedCount: insertedCount,
      skippedDuplicates,
      totalParsed: parseResult.transactions.length,
      format: parseResult.format,
      kpis: summary.kpis,
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
    const summary = await computeSummaryAndPublishSensors();
    return {
      scanned: true,
      events,
      config: getQuickImportConfig(db),
      kpis: summary.kpis,
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

    const summary = await computeSummaryAndPublishSensors();
    return {
      imported: true,
      fileName,
      csvContent,
      format: parseResult.format,
      insertedCount,
      skippedDuplicates,
      kpis: summary.kpis,
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
