import React, { useEffect, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('finance-analytics');

interface TransactionRow {
  id: number;
  tx_date: string;
  payee: string;
  category: string;
  amount: number;
  account: string;
  is_recurring: number;
  notes: string;
}

interface CategoryBreakdownItem {
  category: string;
  tx_count: number;
  spent: number;
  budgetLimit: number;
}

interface FinanceKpis {
  income: number;
  expenses: number;
  investments: number;
  net: number;
  grocerySpend: number;
  savingsRatePct: number;
  haConnected: boolean;
}

const CATEGORIES = [
  'Groceries',
  'Housing & Utilities',
  'Investments',
  'Dining & Coffee',
  'Health & Fitness',
  'Subscriptions',
  'Transport',
  'Shopping & Tech',
  'Income',
];

const SAMPLE_AUSTRIAN_BANK_CSV = `Buchungstag;Empfänger;Verwendungszweck;Betrag
18.10.2026;BILLA AG Filiale Wien;Wocheneinkauf Lebensmittel;-46,80
18.10.2026;Wolt Österreich;Abendessen Bestellung;-24,50
18.10.2026;OMV Tankstelle;Tanken;-58,20`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'import'>('dashboard');
  const [kpis, setKpis] = useState<FinanceKpis>({
    income: 0,
    expenses: 0,
    investments: 0,
    net: 0,
    grocerySpend: 0,
    savingsRatePct: 0,
    haConnected: false,
  });
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownItem[]>([]);
  const [recurringFixed, setRecurringFixed] = useState<TransactionRow[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);

  // New Transaction Form
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState('');

  // Bank CSV Import Form
  const [csvText, setCsvText] = useState('');
  const [accountName, setAccountName] = useState('Girokonto');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadOverview = async (monthOverride?: string) => {
    const m = monthOverride !== undefined ? monthOverride : selectedMonth;
    const query = m ? `?month=${encodeURIComponent(m)}` : '';
    const data = await api.get<{
      kpis: FinanceKpis;
      activeMonth?: string;
      availableMonths?: string[];
      transactions: TransactionRow[];
      categoryBreakdown: CategoryBreakdownItem[];
      recurringFixed: TransactionRow[];
    }>(`/overview${query}`);
    setKpis(data.kpis);
    setTransactions(data.transactions);
    setCategoryBreakdown(data.categoryBreakdown);
    setRecurringFixed(data.recurringFixed);
    if (data.availableMonths) setAvailableMonths(data.availableMonths);
    if (!m && data.activeMonth) setSelectedMonth(data.activeMonth);
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payee.trim() || !amount) return;
    const rawVal = Math.abs(Number(amount));
    const signedAmount = txType === 'expense' ? -rawVal : rawVal;

    await api.post('/transactions', {
      tx_date: txDate,
      payee,
      amount: signedAmount,
      category: category || undefined,
      is_recurring: isRecurring ? 1 : 0,
      notes,
    });

    setPayee('');
    setAmount('');
    setNotes('');
    notify('Transaction saved to SQLite & synced to Home Assistant sensors!');
    await loadOverview();
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    try {
      const res = await api.post<{ importedCount: number }>('/import-bank-csv', {
        csvText,
        accountName,
      });
      notify(`Imported and auto-categorized ${res.importedCount} bank transaction(s)!`);
      await loadOverview();
      setActiveTab('transactions');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Sparkasse / George CSV exports use UTF-16LE (BOM 0xFF 0xFE)
    const isUtf16Le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
    const decoded = new TextDecoder(isUtf16Le ? 'utf-16le' : 'utf-8').decode(buf);
    setCsvText(decoded);
    notify(`Loaded "${file.name}" (${isUtf16Le ? 'UTF-16LE George CSV' : 'UTF-8 CSV'}) — click Import below!`);
  };

  const visibleTransactions =
    filterCat === 'all'
      ? transactions
      : transactions.filter((t) => t.category === filterCat);

  const recurringMonthlyTotal = recurringFixed.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0
  );

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>
            💶 Finance & Budget Analytics
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            Sparkasse George Girokonto (AT22 2025 6010 0120 1324) • Auto-Categorized Ledger • Live HA Sensors
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              void loadOverview(e.target.value);
            }}
            style={{ ...btnTab, background: '#0f172a', color: '#38bdf8' }}
          >
            <option value="all">📅 All Months (Full Year)</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>
                📅 Month: {ym}
              </option>
            ))}
          </select>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={activeTab === 'dashboard' ? btnPrimary : btnTab}
          >
            📊 Cashflow & Budgets
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            style={activeTab === 'transactions' ? btnPrimary : btnTab}
          >
            🧾 Transactions ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('import')}
            style={activeTab === 'import' ? btnPrimary : btnTab}
          >
            📥 Import George CSV
          </button>
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0284c7',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {/* Top KPI Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={kpiCard('#4ade80')}>
          <div style={kpiLabel}>Monthly Income</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#4ade80' }}>
            +€{kpis.income.toFixed(2)}
          </div>
          <div style={kpiSub}>Inflows & Salary</div>
        </div>

        <div style={kpiCard('#f43f5e')}>
          <div style={kpiLabel}>Living Expenses</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#f43f5e' }}>
            -€{kpis.expenses.toFixed(2)}
          </div>
          <div style={kpiSub}>Groceries: €{kpis.grocerySpend.toFixed(2)}</div>
        </div>

        <div style={kpiCard('#a855f7')}>
          <div style={kpiLabel}>ETF & Investments</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#a855f7' }}>
            €{kpis.investments.toFixed(2)}
          </div>
          <div style={kpiSub}>Long-term wealth building</div>
        </div>

        <div style={kpiCard('#38bdf8')}>
          <div style={kpiLabel}>Savings & Investment Rate</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#38bdf8' }}>
            {kpis.savingsRatePct}%
          </div>
          <div style={kpiSub}>Unallocated Cashflow: €{kpis.net.toFixed(2)}</div>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
          {/* Category Spending vs Monthly Budgets */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>📊 Category Spending vs. Monthly Budget</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              {categoryBreakdown.map((c) => {
                const pct = Math.min(100, Math.round((c.spent / c.budgetLimit) * 100));
                const overBudget = c.spent > c.budgetLimit;
                const barColor =
                  c.category === 'Investments'
                    ? '#a855f7'
                    : overBudget
                      ? '#ef4444'
                      : pct > 80
                        ? '#f59e0b'
                        : '#38bdf8';

                return (
                  <div key={c.category}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: 6,
                      }}
                    >
                      <div>
                        <strong>{c.category}</strong>{' '}
                        <span style={{ color: '#64748b', fontSize: 12 }}>
                          ({c.tx_count} tx)
                        </span>
                      </div>
                      <div>
                        <strong style={{ color: overBudget ? '#ef4444' : '#f8fafc' }}>
                          €{c.spent.toFixed(2)}
                        </strong>{' '}
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>
                          / €{c.budgetLimit.toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 10,
                        background: '#0f172a',
                        borderRadius: 99,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recurring Fixed Costs & Published HA Sensors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>🔁 Recurring Monthly Costs</h3>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  €{recurringMonthlyTotal.toFixed(2)}/mo
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {recurringFixed.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#0f172a',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong>{r.payee}</strong>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{r.category}</div>
                    </div>
                    <strong style={{ color: '#f8fafc' }}>
                      €{Math.abs(r.amount).toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>🏠 Published Home Assistant Sensors</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <code>sensor.thassi_finance_analytics_net_cashflow</code>
                <code>sensor.thassi_finance_analytics_monthly_expenses</code>
                <code>sensor.thassi_finance_analytics_grocery_spend</code>
                <code>sensor.thassi_finance_analytics_savings_rate</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <form onSubmit={handleAddTransaction} style={{ ...cardStyle, alignSelf: 'start' }}>
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>+ Log Transaction</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setTxType('expense')}
                style={{
                  ...btnTab,
                  background: txType === 'expense' ? '#ef4444' : '#0f172a',
                  borderColor: txType === 'expense' ? '#ef4444' : '#334155',
                }}
              >
                − Expense
              </button>
              <button
                type="button"
                onClick={() => setTxType('income')}
                style={{
                  ...btnTab,
                  background: txType === 'income' ? '#22c55e' : '#0f172a',
                  borderColor: txType === 'income' ? '#22c55e' : '#334155',
                }}
              >
                + Income
              </button>
            </div>

            <label style={labelStyle}>Payee / Merchant</label>
            <input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. SPAR, Hofer, Wien Energie..."
              style={inputStyle}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Amount (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="42.50"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <label style={labelStyle}>Category (Leave blank to auto-categorize!)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            >
              <option value="">✨ Auto-Detect from Merchant Name</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional description"
              style={inputStyle}
            />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                marginBottom: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              Recurring monthly fixed cost / subscription
            </label>

            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Save Transaction
            </button>
          </form>

          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <h3 style={{ margin: 0 }}>Transaction Ledger ({visibleTransactions.length})</h3>
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                style={{ ...inputStyle, width: 200, marginBottom: 0 }}
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleTransactions.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: '#0f172a',
                    borderRadius: 10,
                    border: '1px solid #334155',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {t.payee}{' '}
                      {t.is_recurring === 1 && (
                        <span
                          style={{
                            fontSize: 10,
                            background: '#1e293b',
                            color: '#38bdf8',
                            padding: '2px 6px',
                            borderRadius: 99,
                            marginLeft: 6,
                          }}
                        >
                          🔁 Recurring
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {t.tx_date} • <span style={{ color: '#38bdf8' }}>{t.category}</span>
                      {t.notes ? ` • ${t.notes}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <strong
                      style={{
                        fontSize: 15,
                        color: t.amount >= 0 ? '#4ade80' : '#f8fafc',
                      }}
                    >
                      {t.amount >= 0 ? `+€${t.amount.toFixed(2)}` : `-€${Math.abs(t.amount).toFixed(2)}`}
                    </strong>
                    <button
                      onClick={async () => {
                        await api.delete(`/transactions?id=${t.id}`);
                        await loadOverview();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <form onSubmit={handleImportCsv} style={cardStyle}>
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>
              📥 Import Bank Statement CSV Export
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              Supports Austrian/German and international bank CSV exports (<code>;</code> or <code>,</code> delimiters, <code>DD.MM.YYYY</code> or <code>YYYY-MM-DD</code> dates, and European decimal commas like <code>-46,80</code>). Merchants like <em>BILLA, SPAR, Hofer, Wien Energie, Flatex, ÖBB, Netflix</em> are categorized automatically!
            </p>
            <label style={labelStyle}>Select George / Bank CSV File (UTF-16LE or UTF-8)</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileSelect}
              style={inputStyle}
            />
            <label style={labelStyle}>Account Label</label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              style={inputStyle}
            />
            <label style={labelStyle}>Or Paste Bank CSV Rows</label>
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
            />
            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Import & Auto-Categorize Transactions
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 20,
};

function kpiCard(borderColor: string): React.CSSProperties {
  return {
    background: '#1e293b',
    border: '1px solid #334155',
    borderTop: `3px solid ${borderColor}`,
    borderRadius: 12,
    padding: 16,
  };
}

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const kpiSub: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  marginTop: 6,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnTab: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
};
