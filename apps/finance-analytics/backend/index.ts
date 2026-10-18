import { defineThassiApp, parseCsv } from '@thassi/sdk';

export interface TransactionRow {
  id: number;
  tx_date: string;       // YYYY-MM-DD
  payee: string;
  category: string;
  amount: number;        // positive = income, negative = expense
  account: string;
  is_recurring: number;  // 0 or 1
  notes: string;
}

export interface CategoryBudgetRow {
  category: string;
  monthly_limit: number;
}

const DEFAULT_BUDGETS: CategoryBudgetRow[] = [
  { category: 'Groceries', monthly_limit: 450 },
  { category: 'Housing & Utilities', monthly_limit: 1100 },
  { category: 'Dining & Coffee', monthly_limit: 200 },
  { category: 'Health & Fitness', monthly_limit: 120 },
  { category: 'Subscriptions', monthly_limit: 80 },
  { category: 'Transport', monthly_limit: 150 },
  { category: 'Investments', monthly_limit: 800 },
  { category: 'Shopping & Tech', monthly_limit: 250 },
];

const STARTER_TRANSACTIONS: Array<Omit<TransactionRow, 'id'>> = [
  {
    tx_date: '2026-10-01',
    payee: 'Monthly Salary Deposit',
    category: 'Income',
    amount: 3650.0,
    account: 'Girokonto',
    is_recurring: 1,
    notes: 'Net monthly salary',
  },
  {
    tx_date: '2026-10-02',
    payee: 'Wohnung Miete & Betriebskosten',
    category: 'Housing & Utilities',
    amount: -890.0,
    account: 'Girokonto',
    is_recurring: 1,
    notes: 'Monthly rent + building operating costs',
  },
  {
    tx_date: '2026-10-03',
    payee: 'Flatex MSCI World ETF Sparplan',
    category: 'Investments',
    amount: -650.0,
    account: 'Flatex Depot',
    is_recurring: 1,
    notes: 'Automated monthly ETF investment',
  },
  {
    tx_date: '2026-10-04',
    payee: 'SPAR Gourmet Einkauf',
    category: 'Groceries',
    amount: -78.4,
    account: 'Girokonto',
    is_recurring: 0,
    notes: 'Weekly meal prep ingredients',
  },
  {
    tx_date: '2026-10-06',
    payee: 'Wien Energie / Strom & Gas Teilbetrag',
    category: 'Housing & Utilities',
    amount: -112.0,
    account: 'Girokonto',
    is_recurring: 1,
    notes: 'Electricity and heating',
  },
  {
    tx_date: '2026-10-08',
    payee: 'HOFER KG Filiale',
    category: 'Groceries',
    amount: -64.2,
    account: 'Girokonto',
    is_recurring: 0,
    notes: 'Produce, oats, skyr, salmon',
  },
  {
    tx_date: '2026-10-10',
    payee: 'Fitness Studio Membership',
    category: 'Health & Fitness',
    amount: -39.9,
    account: 'Girokonto',
    is_recurring: 1,
    notes: 'Monthly gym subscription',
  },
  {
    tx_date: '2026-10-11',
    payee: 'Specialty Coffee & Bakery',
    category: 'Dining & Coffee',
    amount: -18.5,
    account: 'Kreditkarte',
    is_recurring: 0,
    notes: 'Weekend coffee & pastry',
  },
  {
    tx_date: '2026-10-13',
    payee: 'BILLA Plus Einkauf',
    category: 'Groceries',
    amount: -52.8,
    account: 'Girokonto',
    is_recurring: 0,
    notes: 'Household & dinner items',
  },
  {
    tx_date: '2026-10-14',
    payee: 'Spotify & Cloud Storage Subscriptions',
    category: 'Subscriptions',
    amount: -24.98,
    account: 'Kreditkarte',
    is_recurring: 1,
    notes: 'Digital recurring services',
  },
  {
    tx_date: '2026-10-16',
    payee: 'ÖBB Tickets & Klimaticket',
    category: 'Transport',
    amount: -45.0,
    account: 'Girokonto',
    is_recurring: 0,
    notes: 'Rail travel',
  },
  {
    tx_date: '2026-10-17',
    payee: 'Shelly Smart Home Modules',
    category: 'Shopping & Tech',
    amount: -68.9,
    account: 'Kreditkarte',
    is_recurring: 0,
    notes: 'Shelly Plus 2PM relays for HA',
  },
];

export function autoCategorizeTransaction(payee: string, notes = '', amount = 0): string {
  if (amount > 0) {
    return 'Income';
  }
  const text = `${payee} ${notes}`.toLowerCase();
  if (/billa|spar|hofer|lidl|rewe|adeg|denns|bio|supermarkt|grocer|markt/.test(text)) {
    return 'Groceries';
  }
  if (/miete|wohnung|strom|gas|energie|evn|wien energie|internet|magenta|a1|drei|versicherung|gis|orf/.test(text)) {
    return 'Housing & Utilities';
  }
  if (/flatex|trade republic|scalable|etf|sparplan|aktien|depot|invest|broker/.test(text)) {
    return 'Investments';
  }
  if (/restaurant|cafe|coffee|bistro|pizza|burger|sushi|lieferando|mjam|wolt|foodora|bar|lunch|dinner/.test(text)) {
    return 'Dining & Coffee';
  }
  if (/fitness|gym|fitinn|mcfit|apotheke|arzt|doctor|dm |bipa|health|sport/.test(text)) {
    return 'Health & Fitness';
  }
  if (/netflix|spotify|youtube|apple|google|openai|anthropic|github|prime|abonnement|subscription/.test(text)) {
    return 'Subscriptions';
  }
  if (/oebb|öbb|wiener linien|tankstelle|omv|bp |shell|eni|uber|bolt|parken|ticket/.test(text)) {
    return 'Transport';
  }
  return 'Shopping & Tech';
}

function parseEuroAmount(raw: string): number {
  const cleaned = raw.replace(/[€$£\s]/g, '').trim();
  if (!cleaned) return 0;
  // European format: "1.234,56" or "-78,40"
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  // Match DD.MM.YYYY (Austrian/German bank format)
  const deMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (deMatch) {
    return `${deMatch[3]}-${deMatch[2]}-${deMatch[1]}`;
  }
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Schema for Finance & Budget Analytics
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_date TEXT NOT NULL,
      payee TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      account TEXT NOT NULL DEFAULT 'Girokonto',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );
  `);

  const budgetCount =
    ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM category_budgets')?.cnt ?? 0;
  if (budgetCount === 0) {
    for (const b of DEFAULT_BUDGETS) {
      ctx.db.execute(
        'INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)',
        [b.category, b.monthly_limit]
      );
    }
  }

  const txCount =
    ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM transactions')?.cnt ?? 0;
  if (txCount === 0) {
    for (const tx of STARTER_TRANSACTIONS) {
      ctx.db.execute(
        `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tx.tx_date, tx.payee, tx.category, tx.amount, tx.account, tx.is_recurring, tx.notes]
      );
    }
  }

  async function computeSummaryAndPublishSensors() {
    const totals = ctx.db.queryOne<{
      income: number;
      expenses: number;
      investments: number;
      net: number;
    }>(`
      SELECT
        COALESCE(ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2), 0) as income,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category != 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as expenses,
        COALESCE(ROUND(SUM(CASE WHEN amount < 0 AND category = 'Investments' THEN ABS(amount) ELSE 0 END), 2), 0) as investments,
        COALESCE(ROUND(SUM(amount), 2), 0) as net
      FROM transactions
    `) || { income: 0, expenses: 0, investments: 0, net: 0 };

    const groceriesRow = ctx.db.queryOne<{ total: number }>(`
      SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as total
      FROM transactions
      WHERE amount < 0 AND category = 'Groceries'
    `);
    const grocerySpend = groceriesRow?.total ?? 0;

    // Savings Rate = (Net Free Cashflow + Investments) / Income
    const totalSavedOrInvested = Math.max(0, totals.income - totals.expenses);
    const savingsRatePct =
      totals.income > 0 ? Number(((totalSavedOrInvested / totals.income) * 100).toFixed(1)) : 0;

    // Store summary in /data/shared.db for cross-app use
    ctx.sharedDb.kvSet('finance_summary', {
      income: totals.income,
      expenses: totals.expenses,
      investments: totals.investments,
      netCashflow: totals.net,
      grocerySpend,
      savingsRatePct,
      updatedAt: new Date().toISOString(),
    });

    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor('net_cashflow', totals.net, {
        friendly_name: 'Monthly Net Cashflow',
        unit_of_measurement: 'EUR',
        icon: 'mdi:cash-multiple',
        income_eur: totals.income,
        expenses_eur: totals.expenses,
        investments_eur: totals.investments,
        savings_rate_pct: savingsRatePct,
      });

      await ctx.ha.publishSensor('monthly_expenses', totals.expenses, {
        friendly_name: 'Monthly Living Expenses',
        unit_of_measurement: 'EUR',
        icon: 'mdi:credit-card-outline',
      });

      await ctx.ha.publishSensor('grocery_spend', grocerySpend, {
        friendly_name: 'Monthly Grocery Spend',
        unit_of_measurement: 'EUR',
        icon: 'mdi:cart-Check',
      });

      await ctx.ha.publishSensor('savings_rate', savingsRatePct, {
        friendly_name: 'Monthly Savings & Investment Rate',
        unit_of_measurement: '%',
        icon: 'mdi:piggy-bank-outline',
      });
    }

    return {
      ...totals,
      grocerySpend,
      savingsRatePct,
      haConnected: haStatus.connected,
    };
  }

  // 2. REST API Routes (/api/apps/finance-analytics/*)

  ctx.route('GET', '/overview', async (_req, { db, sharedDb }) => {
    const kpis = await computeSummaryAndPublishSensors();
    const transactions = db.query<TransactionRow>(
      'SELECT * FROM transactions ORDER BY tx_date DESC, id DESC LIMIT 200'
    );
    const budgets = db.query<CategoryBudgetRow>('SELECT * FROM category_budgets');
    const budgetMap = new Map(budgets.map((b) => [b.category, b.monthly_limit]));

    const rawCategories = db.query<{
      category: string;
      tx_count: number;
      spent: number;
    }>(`
      SELECT
        category,
        COUNT(*) as tx_count,
        ROUND(SUM(ABS(amount)), 2) as spent
      FROM transactions
      WHERE amount < 0
      GROUP BY category
      ORDER BY spent DESC
    `);

    const categoryBreakdown = rawCategories.map((c) => ({
      ...c,
      budgetLimit: budgetMap.get(c.category) ?? 300,
    }));

    const recurringFixed = db.query<TransactionRow>(
      'SELECT * FROM transactions WHERE is_recurring = 1 AND amount < 0 ORDER BY ABS(amount) DESC'
    );

    const mealPlannerToday = sharedDb.kvGet<{
      date: string;
      dinner: string | null;
      totalCalories: number;
      openGroceries: number;
    }>('meal_planner_today');

    return {
      kpis,
      transactions,
      categoryBreakdown,
      recurringFixed,
      mealPlannerToday: mealPlannerToday || null,
    };
  });

  // Add a single transaction
  ctx.route('POST', '/transactions', async (req, { db }) => {
    const body = (req.body || {}) as Partial<TransactionRow>;
    if (!body.payee?.trim() || body.amount === undefined) {
      return { status: 400, body: { error: 'Payee and amount are required' } };
    }
    const amt = Number(body.amount);
    const category =
      body.category?.trim() || autoCategorizeTransaction(body.payee, body.notes || '', amt);
    const txDate = body.tx_date || new Date().toISOString().slice(0, 10);

    db.execute(
      `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        txDate,
        body.payee.trim(),
        category,
        amt,
        (body.account || 'Girokonto').trim(),
        body.is_recurring ? 1 : 0,
        (body.notes || '').trim(),
      ]
    );

    const kpis = await computeSummaryAndPublishSensors();
    return { added: true, kpis };
  });

  ctx.route('DELETE', '/transactions', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM transactions WHERE id = ?', [id]);
    const kpis = await computeSummaryAndPublishSensors();
    return { deleted: id, kpis };
  });

  // Update a category monthly budget target
  ctx.route('POST', '/budgets', (req, { db }) => {
    const body = (req.body || {}) as { category?: string; monthly_limit?: number };
    if (!body.category || body.monthly_limit === undefined) {
      return { status: 400, body: { error: 'category and monthly_limit are required' } };
    }
    db.execute(
      `INSERT INTO category_budgets (category, monthly_limit)
       VALUES (?, ?)
       ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
      [body.category, Number(body.monthly_limit)]
    );
    return { updated: true };
  });

  // Smart Bank Export CSV Importer (supports Austrian/German/English CSV headers & European decimal commas)
  ctx.route('POST', '/import-bank-csv', async (req, { db }) => {
    const body = (req.body || {}) as { csvText?: string; accountName?: string };
    if (!body.csvText?.trim()) {
      return { status: 400, body: { error: 'csvText is required' } };
    }

    const { headers, rows } = parseCsv(body.csvText);
    if (headers.length === 0 || rows.length === 0) {
      return { status: 400, body: { error: 'No rows found in CSV' } };
    }

    // Auto-detect date, payee, amount, category, and notes columns
    const findIdx = (patterns: RegExp[]) =>
      headers.findIndex((h) => patterns.some((p) => p.test(h)));

    const dateIdx = Math.max(0, findIdx([/date|datum|buchungstag|valuta/i]));
    const payeeIdx = Math.max(
      dateIdx === 0 ? 1 : 0,
      findIdx([/payee|description|empfaenger|auftraggeber|buchungstext|partner|merchant|title/i])
    );
    const amountIdx = findIdx([/amount|betrag|umsatz|wert|summe|eur/i]);
    const catIdx = findIdx([/category|kategorie/i]);
    const notesIdx = findIdx([/notes|verwendungszweck|referenz|info/i]);

    let importedCount = 0;
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const row of rows) {
        const rawDate = row[dateIdx] || '';
        const rawPayee = row[payeeIdx] || 'Bank Transaction';
        const rawAmt = amountIdx >= 0 ? row[amountIdx] || '0' : row[row.length - 1] || '0';
        const amt = parseEuroAmount(rawAmt);
        if (amt === 0 && !rawPayee.trim()) continue;

        const txDate = normalizeDateString(rawDate);
        const notes = notesIdx >= 0 ? row[notesIdx] || '' : '';
        const explicitCat = catIdx >= 0 ? (row[catIdx] || '').trim() : '';
        const category =
          explicitCat || autoCategorizeTransaction(rawPayee, notes, amt);

        db.execute(
          `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [txDate, rawPayee.trim(), category, amt, (body.accountName || 'CSV Import').trim(), notes]
        );
        importedCount++;
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const kpis = await computeSummaryAndPublishSensors();
    return { importedCount, kpis };
  });

  // 3. Scheduled Background Cron Job
  ctx.scheduleJob({
    id: 'sync-finance-sensors',
    name: 'Publish Finance & Budget Sensors to Home Assistant',
    description:
      'Publishes net_cashflow, monthly_expenses, grocery_spend, and savings_rate sensors to Home Assistant.',
    intervalMinutes: 30,
    runOnStart: true,
    handler: async () => {
      const kpis = await computeSummaryAndPublishSensors();
      return `Income: €${kpis.income} | Expenses: €${kpis.expenses} | Investments: €${kpis.investments} | Savings Rate: ${kpis.savingsRatePct}%`;
    },
  });
});
