import React, { useEffect, useState } from 'react';
import type {
  AccountBalanceConfig,
  CategoryBreakdownItem,
  FinanceKpis,
  PreviewConfig,
  PreviewElementId,
  PreviewPrimaryMetric,
} from '../../../shared/finance-types.js';

interface PreviewConfigPanelProps {
  previewConfig: PreviewConfig;
  balanceConfig: AccountBalanceConfig;
  allBudgets: CategoryBreakdownItem[];
  kpis: FinanceKpis;
  onUpdatePreviewConfig: (partial: Partial<PreviewConfig>) => Promise<void>;
  onUpdateBalanceConfig: (partial: Partial<AccountBalanceConfig>) => Promise<void>;
  onOpenQuickImport: () => void;
}

const ELEMENT_OPTIONS: Array<{
  id: PreviewElementId;
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    id: 'current_balance',
    title: 'Aktueller Kontostand',
    subtitle: 'Zeigt den aktuellen Girokonto-Saldo im Preview an',
    icon: '🏦',
  },
  {
    id: 'expenses_day',
    title: 'Total Expenses (Day) · Tagesausgaben',
    subtitle: 'Heutige Ausgaben bzw. letzter Buchungstag',
    icon: '📅',
  },
  {
    id: 'expenses_week',
    title: 'Total Expenses (Week) · Wochenausgaben',
    subtitle: 'Kumulierte Ausgaben der letzten 7 Tage',
    icon: '📆',
  },
  {
    id: 'group_budgets',
    title: 'Budgets for Different Groups · Gruppen-Budgets',
    subtitle: 'Fortschrittsbalken für ausgewählte Budget-Kategorien',
    icon: '🎯',
  },
  {
    id: 'quick_import',
    title: 'Quick Import (Online-Banking Flyout)',
    subtitle: 'Schnell-Import Button für den Online-Banking Popup-Browser direkt im Preview',
    icon: '⚡',
  },
];

const PRIMARY_METRIC_OPTIONS: Array<{ id: PreviewPrimaryMetric; label: string }> = [
  { id: 'current_balance', label: 'Aktueller Kontostand' },
  { id: 'expenses_day', label: 'Total Expenses (Day)' },
  { id: 'expenses_week', label: 'Total Expenses (Week)' },
  { id: 'net_cashflow', label: 'Monats-Cashflow (Netto)' },
];

export const PreviewConfigPanel: React.FC<PreviewConfigPanelProps> = ({
  previewConfig,
  balanceConfig,
  allBudgets,
  kpis,
  onUpdatePreviewConfig,
  onUpdateBalanceConfig,
  onOpenQuickImport,
}) => {
  const [balanceInput, setBalanceInput] = useState(String(balanceConfig.currentBalance));
  const [accountInput, setAccountInput] = useState(balanceConfig.accountName);
  const [ibanInput, setIbanInput] = useState(balanceConfig.iban);
  const [simRevealed, setSimRevealed] = useState(!previewConfig.hiddenByDefault);

  useEffect(() => {
    setBalanceInput(String(balanceConfig.currentBalance));
    setAccountInput(balanceConfig.accountName);
    setIbanInput(balanceConfig.iban);
  }, [balanceConfig]);

  useEffect(() => {
    setSimRevealed(!previewConfig.hiddenByDefault);
  }, [previewConfig.hiddenByDefault]);

  const toggleElement = async (elId: PreviewElementId) => {
    const exists = previewConfig.enabledElements.includes(elId);
    const next = exists
      ? previewConfig.enabledElements.filter((x) => x !== elId)
      : [...previewConfig.enabledElements, elId];
    await onUpdatePreviewConfig({ enabledElements: next });
  };

  const toggleBudgetGroup = async (cat: string) => {
    const exists = previewConfig.previewBudgetCategories.includes(cat);
    const next = exists
      ? previewConfig.previewBudgetCategories.filter((x) => x !== cat)
      : [...previewConfig.previewBudgetCategories, cat];
    await onUpdatePreviewConfig({ previewBudgetCategories: next });
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(balanceInput.replace(',', '.'));
    if (!Number.isFinite(num)) return;
    await onUpdateBalanceConfig({
      currentBalance: num,
      accountName: accountInput.trim() || 'Girokonto',
      iban: ibanInput.trim(),
    });
  };

  const maskOrFormat = (val: number, prefix = '€') => {
    if (!simRevealed) return '•••••• €';
    return `${prefix}${val.toLocaleString('de-AT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const primaryHeadlineValue = (() => {
    if (!simRevealed) return '🔒 •••••• €';
    switch (previewConfig.primaryMetric) {
      case 'current_balance':
        return maskOrFormat(kpis.currentBalance, '€');
      case 'expenses_day':
        return maskOrFormat(kpis.expensesDay, '-€');
      case 'expenses_week':
        return maskOrFormat(kpis.expensesWeek, '-€');
      default:
        return `${kpis.net >= 0 ? '+' : '-'}€${Math.abs(kpis.net).toFixed(2)}`;
    }
  })();

  const selectedBudgets = previewConfig.previewBudgetCategories
    .map((c) => allBudgets.find((b) => b.category === c))
    .filter((b): b is CategoryBreakdownItem => Boolean(b));

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(51, 65, 85, 0.7)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
          🎛️ Dashboard Preview Konfiguration (Horizon Widget)
        </h3>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Wähle aus, welche Finanzdaten und Schnellaktionen in der Dashboard-Kachel (
          <code>#widget-finances</code>) auf der Horizon-Hauptseite angezeigt werden.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 18,
        }}
      >
        {/* Left Column: Checkboxes & Privacy Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Privacy Default Toggle */}
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 14px',
              borderRadius: 12,
              background: previewConfig.hiddenByDefault
                ? 'rgba(168, 85, 247, 0.14)'
                : 'rgba(9, 15, 29, 0.6)',
              border: previewConfig.hiddenByDefault
                ? '1px solid rgba(168, 85, 247, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>
                🔒 Daten im Dashboard-Preview standardmäßig ausblenden
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                Werte sind versteckt (<code>•••• €</code>) — Klick im Preview schaltet Sichtbarkeit um
              </div>
            </div>
            <input
              type="checkbox"
              checked={previewConfig.hiddenByDefault}
              onChange={(e) => onUpdatePreviewConfig({ hiddenByDefault: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#a855f7', cursor: 'pointer' }}
            />
          </label>

          {/* Primary Headline Selector */}
          <div
            style={{
              padding: '11px 14px',
              borderRadius: 12,
              background: 'rgba(9, 15, 29, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
              Hauptwert in der kompakten Preview-Kopfzeile:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PRIMARY_METRIC_OPTIONS.map((opt) => {
                const active = previewConfig.primaryMetric === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdatePreviewConfig({ primaryMetric: opt.id })}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: active ? '1px solid #38bdf8' : '1px solid #1e293b',
                      background: active ? 'rgba(56, 189, 248, 0.16)' : '#040711',
                      color: active ? '#38bdf8' : '#cbd5e1',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selectable UI Elements */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginTop: 2 }}>
            Angezeigte Elemente im Preview auswählen:
          </div>
          {ELEMENT_OPTIONS.map((el) => {
            const checked = previewConfig.enabledElements.includes(el.id);
            return (
              <label
                key={el.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '9px 13px',
                  borderRadius: 11,
                  background: checked ? 'rgba(56, 189, 248, 0.1)' : 'rgba(9, 15, 29, 0.45)',
                  border: checked
                    ? '1px solid rgba(56, 189, 248, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{el.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: '#f8fafc' }}>
                      {el.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{el.subtitle}</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleElement(el.id)}
                  style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </label>
            );
          })}

          {/* Group Selection when group_budgets is enabled */}
          {previewConfig.enabledElements.includes('group_budgets') && (
            <div
              style={{
                padding: '10px 13px',
                borderRadius: 11,
                background: 'rgba(9, 15, 29, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 8 }}>
                Budget-Gruppen für Preview auswählen:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allBudgets
                  .filter((b) => b.group !== 'income')
                  .map((b) => {
                    const selected = previewConfig.previewBudgetCategories.includes(b.category);
                    return (
                      <button
                        key={b.category}
                        type="button"
                        onClick={() => toggleBudgetGroup(b.category)}
                        style={{
                          border: selected ? `1px solid ${b.color}` : '1px solid #1e293b',
                          background: selected ? 'rgba(56, 189, 248, 0.14)' : '#040711',
                          color: selected ? '#fff' : '#94a3b8',
                          borderRadius: 99,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: selected ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {b.icon} {b.labelDe}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Aktueller Kontostand Form + Live Interactive Preview Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <form
            onSubmit={handleSaveBalance}
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'rgba(9, 15, 29, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: '#38bdf8', marginBottom: 10 }}>
              🏦 Aktuellen Kontostand festlegen / synchronisieren
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                  Aktueller Kontostand (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  style={smallInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                  Kontoname
                </label>
                <input
                  value={accountInput}
                  onChange={(e) => setAccountInput(e.target.value)}
                  style={smallInputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={ibanInput}
                onChange={(e) => setIbanInput(e.target.value)}
                placeholder="IBAN"
                style={{ ...smallInputStyle, flex: 1, marginBottom: 0 }}
              />
              <button
                type="submit"
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  background: '#0284c7',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Saldo speichern
              </button>
            </div>
          </form>

          {/* Live Horizon Preview Replica */}
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              background: 'rgba(6, 10, 22, 0.85)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: '#a855f7',
                  fontWeight: 700,
                }}
              >
                Live-Vorschau · Horizon Widget
              </span>
              <button
                type="button"
                onClick={() => setSimRevealed((v) => !v)}
                style={{
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                  borderRadius: 99,
                  padding: '3px 9px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {simRevealed ? '🙈 Verbergen' : '👁️ Klick zum Anzeigen'}
              </button>
            </div>

            <div
              onClick={() => setSimRevealed((v) => !v)}
              title="Klicken, um Sichtbarkeit der Finanzdaten umzuschalten"
              style={{
                textAlign: 'right',
                cursor: 'pointer',
                paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>
                {primaryHeadlineValue}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)' }}>
                {simRevealed
                  ? `${kpis.accountName} · ${kpis.activeMonth}`
                  : 'Daten geschützt · Klicken zum Einblenden'}
              </div>
            </div>

            <div
              onClick={() => setSimRevealed((v) => !v)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 14px',
                marginTop: 12,
                cursor: 'pointer',
              }}
            >
              {previewConfig.enabledElements.includes('current_balance') && (
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Aktueller Kontostand
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#4ade80' }}>
                    {maskOrFormat(kpis.currentBalance, '€')}
                  </div>
                </div>
              )}
              {previewConfig.enabledElements.includes('expenses_day') && (
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Ausgaben ({kpis.expensesDayLabel})
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f87171' }}>
                    {maskOrFormat(kpis.expensesDay, '-€')}
                  </div>
                </div>
              )}
              {previewConfig.enabledElements.includes('expenses_week') && (
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Woche (7 Tage)
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fbbf24' }}>
                    {maskOrFormat(kpis.expensesWeek, '-€')}
                  </div>
                </div>
              )}
            </div>

            {previewConfig.enabledElements.includes('group_budgets') &&
              selectedBudgets.length > 0 && (
                <div
                  onClick={() => setSimRevealed((v) => !v)}
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  {selectedBudgets.slice(0, 4).map((b) => (
                    <div key={b.category}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ color: '#cbd5e1' }}>
                          {b.icon} {b.labelDe}
                        </span>
                        <span style={{ color: '#94a3b8' }}>
                          {simRevealed
                            ? `€${b.spent.toFixed(0)} / €${b.budgetLimit.toFixed(0)}`
                            : '••• / ••• €'}
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: 4,
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: 99,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: simRevealed ? `${b.pctUsed}%` : '0%',
                            height: '100%',
                            background: b.overBudget ? '#ef4444' : b.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {previewConfig.enabledElements.includes('quick_import') && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={onOpenQuickImport}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    background: 'rgba(56, 189, 248, 0.14)',
                    color: '#38bdf8',
                    borderRadius: 10,
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Quick Import (Online-Banking Flyout)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const smallInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#040711',
  color: '#f8fafc',
  fontSize: 12.5,
};
