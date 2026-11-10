export interface TransactionRow {
  id: number;
  tx_date: string;       // YYYY-MM-DD
  payee: string;
  category: string;
  amount: number;        // positive = income, negative = expense
  account: string;
  is_recurring: number;  // 0 or 1
  notes: string;
  tx_ref?: string;       // Unique bank booking reference for deduplication
}

export interface CategoryBudgetRow {
  category: string;
  monthly_limit: number;
}

export interface CategoryBreakdownItem {
  category: string;
  labelDe: string;
  color: string;
  icon: string;
  group: 'fixed' | 'living' | 'lifestyle' | 'savings' | 'income';
  tx_count: number;
  spent: number;
  budgetLimit: number;
  pctUsed: number;
  remaining: number;
  overBudget: boolean;
  /** Projected end-of-month spend based on current daily burn rate */
  extrapolatedSpend: number;
  /** Projected end-of-month remaining budget (budgetLimit - extrapolatedSpend) */
  extrapolatedRemaining: number;
  /** Projected percentage of budget used by end of month */
  extrapolatedPct: number;
  /** Remaining allowance per day for the rest of the month */
  dailyAllowanceRemaining: number;
}

export interface FixedCostItem {
  id: string;
  name: string;
  amount: number;
  category: string;
  groupLabel: 'Wohnen & Energie' | 'Versicherungen' | 'Abos & Internet';
  matchPattern: string;
  isEstimate?: boolean;
  paidThisMonth?: boolean;
  actualPaidAmount?: number | null;
  matchedTxDate?: string | null;
}

export const DEFAULT_FIXED_COSTS: FixedCostItem[] = [
  {
    id: 'kreditrate',
    name: 'Kreditrate',
    amount: 750.0,
    category: 'Housing & Utilities',
    groupLabel: 'Wohnen & Energie',
    matchPattern: 'kreditrate|00007-656648|sparkasse n',
  },
  {
    id: 'evn-waerme',
    name: 'EVN Wärme',
    amount: 782.0,
    category: 'Housing & Utilities',
    groupLabel: 'Wohnen & Energie',
    matchPattern: 'evn.*wärme|evn.*waerme|evn ag',
  },
  {
    id: 'gemeindeabgabe',
    name: 'Gemeindeabgabe',
    amount: 140.0,
    category: 'Housing & Utilities',
    groupLabel: 'Wohnen & Energie',
    matchPattern: 'gemeinde|marktgemeinde',
  },
  {
    id: 'evn-strom',
    name: 'EVN Strom',
    amount: 80.0,
    category: 'Housing & Utilities',
    groupLabel: 'Wohnen & Energie',
    matchPattern: 'evn.*strom|evn energie',
    isEstimate: true,
  },
  {
    id: 'orf-beitrag',
    name: 'ORF-Beitrag',
    amount: 7.0,
    category: 'Housing & Utilities',
    groupLabel: 'Wohnen & Energie',
    matchPattern: 'orf-beitrag|obs|gis',
  },
  {
    id: 'generali-hhv',
    name: 'Generali HHV',
    amount: 103.68,
    category: 'Insurance & Finance',
    groupLabel: 'Versicherungen',
    matchPattern: '5574-4113|besitz-versi|haushalt',
  },
  {
    id: 'kfz-versicherung',
    name: 'KFZ-Versicherung',
    amount: 84.68,
    category: 'Insurance & Finance',
    groupLabel: 'Versicherungen',
    matchPattern: '6010-4061|kraftfahrzeug',
  },
  {
    id: 'generali-leben',
    name: 'Generali Leben',
    amount: 71.25,
    category: 'Insurance & Finance',
    groupLabel: 'Versicherungen',
    matchPattern: '0119636|fondsgebundene|lebensvers',
  },
  {
    id: 'unfallversicherung',
    name: 'Unfallversicherung',
    amount: 25.34,
    category: 'Insurance & Finance',
    groupLabel: 'Versicherungen',
    matchPattern: '5886-2773|unfallvers',
  },
  {
    id: 'kabelplus',
    name: 'Kabelplus Internet',
    amount: 31.4,
    category: 'Subscriptions',
    groupLabel: 'Abos & Internet',
    matchPattern: 'kabelplus',
  },
  {
    id: 'youtube-premium',
    name: 'Youtube Premium',
    amount: 27.99,
    category: 'Subscriptions',
    groupLabel: 'Abos & Internet',
    matchPattern: 'youtube',
  },
  {
    id: 'google-one-ai',
    name: 'Google One AI',
    amount: 21.99,
    category: 'Subscriptions',
    groupLabel: 'Abos & Internet',
    matchPattern: 'google one|google\\*one|google ai',
  },
  {
    id: 'amazon-prime',
    name: 'Amazon Prime',
    amount: 8.99,
    category: 'Subscriptions',
    groupLabel: 'Abos & Internet',
    matchPattern: 'amznprime|amazon prime|d01-|amazon eu.*8\\.99',
  },
];

export type PreviewElementId =
  | 'current_balance'
  | 'expenses_day'
  | 'expenses_week'
  | 'group_budgets'
  | 'quick_import';

export type PreviewPrimaryMetric =
  | 'current_balance'
  | 'expenses_day'
  | 'expenses_week'
  | 'net_cashflow';

export interface PreviewConfig {
  /** Whether data inside the dashboard preview is hidden/masked by default (click to toggle visibility) */
  hiddenByDefault: boolean;
  /** Which metric is shown in the compact top-right header when revealed */
  primaryMetric: PreviewPrimaryMetric;
  /** Which UI elements are rendered inside the dashboard preview widget */
  enabledElements: PreviewElementId[];
  /** Which category budgets are shown in the "budgets for different groups" preview section */
  previewBudgetCategories: string[];
  /** Treat Notgroschen round-ups as savings rather than living expenses */
  excludeRoundUpsInExpenses: boolean;
}

export interface AccountBalanceConfig {
  currentBalance: number;
  accountName: string;
  iban: string;
  autoAdjustOnImport: boolean;
  updatedAt: string;
}

export interface QuickImportConfig {
  bankId: 'george_at' | 'raiffeisen_at' | 'bawag_at' | 'n26' | 'flatex_at' | 'custom';
  loginUrl: string;
  verfuegernummer: string;
  autoLoginSecret: string;
  autoLoginEnabled: boolean;
  saveCookiesEnabled: boolean;
  watchDownloadsFolder: boolean;
  downloadsPath: string;
  defaultAccountName: string;
  lastAutoImportAt: string | null;
  lastAutoImportFile: string | null;
  lastAutoImportCount: number;
  savedCookieCount: number;
}

export interface ExportReminderConfig {
  /** Remind when latest transaction or bank sync is older than N days (default: 7) */
  reminderIntervalDays: number;
  /** Also remind when a new calendar month starts and no booking exists in the new month yet */
  remindOnNewMonth: boolean;
  /** ISO timestamp until which the reminder is snoozed, or null */
  snoozedUntil: string | null;
  /** ISO timestamp of the last bank statement import/sync */
  lastBankSyncAt: string | null;
  /** ISO timestamp of the last CSV/JSON export from Thassi */
  lastDataExportAt: string | null;
}

export interface ExportReminderStatus extends ExportReminderConfig {
  latestTxDate: string | null;
  daysSinceLatestTx: number | null;
  daysSinceLastSync: number | null;
  daysSinceLastExport: number | null;
  isSnoozed: boolean;
  due: boolean;
  urgency: 'ok' | 'warn' | 'overdue';
  headlineDe: string;
  detailDe: string;
}

export const DEFAULT_EXPORT_REMINDER_CONFIG: ExportReminderConfig = {
  reminderIntervalDays: 7,
  remindOnNewMonth: true,
  snoozedUntil: null,
  lastBankSyncAt: null,
  lastDataExportAt: null,
};

export interface FinanceKpis {
  activeMonth: string;
  currentBalance: number;
  accountName: string;
  iban: string;
  income: number;
  expenses: number;
  investments: number;
  net: number;
  grocerySpend: number;
  savingsRatePct: number;
  /** Strict spend today (tx_date === today) */
  expensesToday?: number;
  /** Total expenses today (or on reference day) */
  expensesDay: number;
  expensesDayDate: string;
  expensesDayLabel: string;
  /** Total expenses over the last 7 days (week) */
  expensesWeek: number;
  /** Variable everyday expenses over the last 7 days (excluding fixed debits) */
  expensesWeekVariable?: number;
  expensesWeekRangeLabel: string;
  /** Variable everyday expenses in activeMonth (Alltag & Lifestyle) */
  expensesMonthVariable?: number;
  /** Total configured monthly Fixed Costs (Fixkosten) */
  fixedCostsTotal?: number;
  /** Fixed costs already debited in activeMonth */
  fixedCostsPaidThisMonth?: number;
  /** Total configured monthly budget across variable categories */
  variableBudgetTotal?: number;
  /** Remaining variable budget in activeMonth */
  variableBudgetRemaining?: number;
  /** Extrapolated end-of-month variable spend */
  variableExtrapolatedSpend?: number;
  /** Extrapolated end-of-month remaining variable budget */
  variableExtrapolatedRemaining?: number;
  /** Calendar progress in activeMonth */
  elapsedDaysInMonth?: number;
  daysInMonth?: number;
  remainingDaysInMonth?: number;
  /** Total configured monthly budget across all expense categories */
  totalMonthlyBudget: number;
  haConnected: boolean;
}

export interface SunburstChildNode {
  name: string;
  label: string;
  value: number;
  color: string;
  txCount: number;
  filterCategory?: string;
  filterPayee?: string;
}

export interface SunburstRing1Node {
  id: string;
  name: string;
  label: string;
  value: number;
  color: string;
  txCount: number;
  filterCategory?: string;
  children: SunburstChildNode[];
}

export interface CategoryMeta {
  id: string;
  labelDe: string;
  color: string;
  icon: string;
  defaultBudget: number;
  group: 'fixed' | 'living' | 'lifestyle' | 'savings' | 'income';
  groupLabelDe: string;
  groupColor: string;
}

export const CATEGORY_DEFINITIONS: CategoryMeta[] = [
  {
    id: 'Housing & Utilities',
    labelDe: 'Wohnen & Energie',
    color: '#6366f1',
    icon: '🏠',
    defaultBudget: 1760,
    group: 'fixed',
    groupLabelDe: 'Fixkosten & Wohnen',
    groupColor: '#6366f1',
  },
  {
    id: 'Insurance & Finance',
    labelDe: 'Versicherung & Bank',
    color: '#8b5cf6',
    icon: '🛡️',
    defaultBudget: 285,
    group: 'fixed',
    groupLabelDe: 'Fixkosten & Wohnen',
    groupColor: '#6366f1',
  },
  {
    id: 'Subscriptions',
    labelDe: 'Abos & Internet',
    color: '#a855f7',
    icon: '📡',
    defaultBudget: 90,
    group: 'fixed',
    groupLabelDe: 'Fixkosten & Wohnen',
    groupColor: '#6366f1',
  },
  {
    id: 'Groceries',
    labelDe: 'Lebensmittel',
    color: '#0ea5e9',
    icon: '🛒',
    defaultBudget: 400,
    group: 'living',
    groupLabelDe: 'Alltag & Versorgung',
    groupColor: '#0ea5e9',
  },
  {
    id: 'Transport',
    labelDe: 'Mobilität & Tanken',
    color: '#f59e0b',
    icon: '🚗',
    defaultBudget: 280,
    group: 'living',
    groupLabelDe: 'Alltag & Versorgung',
    groupColor: '#0ea5e9',
  },
  {
    id: 'Health & Fitness',
    labelDe: 'Gesundheit & Apotheke',
    color: '#f43f5e',
    icon: '❤️',
    defaultBudget: 120,
    group: 'living',
    groupLabelDe: 'Alltag & Versorgung',
    groupColor: '#0ea5e9',
  },
  {
    id: 'Dining & Coffee',
    labelDe: 'Gastronomie & Freizeit',
    color: '#ec4899',
    icon: '🍽️',
    defaultBudget: 350,
    group: 'lifestyle',
    groupLabelDe: 'Lifestyle & Freizeit',
    groupColor: '#ec4899',
  },
  {
    id: 'Shopping & Tech',
    labelDe: 'Shopping & Drogerie',
    color: '#14b8a6',
    icon: '🛍️',
    defaultBudget: 250,
    group: 'lifestyle',
    groupLabelDe: 'Lifestyle & Freizeit',
    groupColor: '#ec4899',
  },
  {
    id: 'Trafik & Kiosk',
    labelDe: 'Trafik & Kiosk',
    color: '#f97316',
    icon: '🏪',
    defaultBudget: 120,
    group: 'lifestyle',
    groupLabelDe: 'Lifestyle & Freizeit',
    groupColor: '#ec4899',
  },
  {
    id: 'Cash & Private',
    labelDe: 'Bargeld & Überweisungen',
    color: '#64748b',
    icon: '💶',
    defaultBudget: 300,
    group: 'lifestyle',
    groupLabelDe: 'Lifestyle & Freizeit',
    groupColor: '#ec4899',
  },
  {
    id: 'Investments',
    labelDe: 'Notgroschen & ETF Sparen',
    color: '#38bdf8',
    icon: '📈',
    defaultBudget: 400,
    group: 'savings',
    groupLabelDe: 'Sparen & Investments',
    groupColor: '#38bdf8',
  },
  {
    id: 'Income',
    labelDe: 'Einnahmen & Gehalt',
    color: '#10b981',
    icon: '💰',
    defaultBudget: 0,
    group: 'income',
    groupLabelDe: 'Einnahmen',
    groupColor: '#10b981',
  },
];

export const CATEGORY_MAP = new Map<string, CategoryMeta>(
  CATEGORY_DEFINITIONS.map((c) => [c.id, c])
);

export function getCategoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_MAP.get(category) || {
      id: category,
      labelDe: category,
      color: '#94a3b8',
      icon: '🏷️',
      defaultBudget: 200,
      group: 'lifestyle',
      groupLabelDe: 'Sonstiges',
      groupColor: '#94a3b8',
    }
  );
}

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  hiddenByDefault: true,
  primaryMetric: 'current_balance',
  enabledElements: [
    'current_balance',
    'expenses_day',
    'expenses_week',
    'group_budgets',
    'quick_import',
  ],
  previewBudgetCategories: [
    'Groceries',
    'Dining & Coffee',
    'Transport',
    'Housing & Utilities',
  ],
  excludeRoundUpsInExpenses: true,
};

export const DEFAULT_BALANCE_CONFIG: AccountBalanceConfig = {
  currentBalance: 4850.0,
  accountName: 'Sparkasse George Girokonto',
  iban: 'AT22 2025 6010 0120 1324',
  autoAdjustOnImport: true,
  updatedAt: new Date().toISOString(),
};

export const BANK_PRESETS = [
  {
    id: 'george_at' as const,
    name: 'Erste Bank & Sparkasse — George (AT)',
    url: 'https://george.sparkasse.at/index.html#/login',
    exportHint: 'Konto wählen → Funktionen → Umsätze exportieren → CSV',
  },
  {
    id: 'raiffeisen_at' as const,
    name: 'Raiffeisen — Meine ELBA (AT)',
    url: 'https://mein.elba.raiffeisen.at/',
    exportHint: 'Umsätze → Exportieren → CSV / CAMT.053',
  },
  {
    id: 'bawag_at' as const,
    name: 'BAWAG P.S.K. eBanking (AT)',
    url: 'https://ebanking.bawag.com/',
    exportHint: 'Kontoübersicht → Umsatzliste herunterladen (CSV)',
  },
  {
    id: 'flatex_at' as const,
    name: 'Flatex WebFiliale (AT)',
    url: 'https://konto.flatex.at/',
    exportHint: 'Konto & Depot → Buchungsübersicht → CSV-Export',
  },
  {
    id: 'n26' as const,
    name: 'N26 Web App',
    url: 'https://app.n26.com/login',
    exportHint: 'Download CSV Statement',
  },
  {
    id: 'custom' as const,
    name: 'Benutzerdefinierte Bank-URL',
    url: 'https://george.sparkasse.at/',
    exportHint: 'Kontoauszug als CSV, CAMT.053 XML oder MT940 herunterladen',
  },
];
