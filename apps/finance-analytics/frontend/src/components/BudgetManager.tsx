import React, { useEffect, useState } from 'react';
import type { CategoryBreakdownItem } from '../../../shared/finance-types.js';

interface BudgetManagerProps {
  allBudgets: CategoryBreakdownItem[];
  previewBudgetCategories: string[];
  onSaveBudgets: (budgets: Array<{ category: string; monthly_limit: number }>) => Promise<void>;
  onTogglePreviewCategory: (category: string) => Promise<void>;
  dataHidden?: boolean;
  compactMode?: boolean;
}

export const BudgetManager: React.FC<BudgetManagerProps> = ({
  allBudgets,
  previewBudgetCategories,
  onSaveBudgets,
  onTogglePreviewCategory,
  dataHidden = false,
  compactMode = false,
}) => {
  const [draftLimits, setDraftLimits] = useState<Record<string, number>>({});
  const [editingMode, setEditingMode] = useState(!compactMode);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLimit, setNewCatLimit] = useState('200');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const b of allBudgets) {
      map[b.category] = b.budgetLimit;
    }
    setDraftLimits(map);
  }, [allBudgets]);

  const expenseBudgets = allBudgets.filter((b) => b.group !== 'income');

  const totalBudgetLimit = expenseBudgets.reduce(
    (sum, b) => sum + (draftLimits[b.category] ?? b.budgetLimit),
    0
  );
  const totalSpent = expenseBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalPct =
    totalBudgetLimit > 0 ? Math.min(100, Math.round((totalSpent / totalBudgetLimit) * 100)) : 0;

  const fmt = (val: number) =>
    dataHidden
      ? '•••• €'
      : `€${val.toLocaleString('de-AT', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}`;

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(draftLimits).map(([category, monthly_limit]) => ({
        category,
        monthly_limit: Math.max(0, Number(monthly_limit) || 0),
      }));
      await onSaveBudgets(payload);
      if (compactMode) setEditingMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      await onSaveBudgets([
        {
          category: newCatName.trim(),
          monthly_limit: Math.max(0, Number(newCatLimit) || 150),
        },
      ]);
      setNewCatName('');
      setNewCatLimit('200');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(51, 65, 85, 0.7)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header & Total Monthly Budget Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
            🎯 Monatliche Budgets & Gruppenlimits
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Gesamtbudget: <strong>{fmt(totalSpent)}</strong> von{' '}
            <strong>{fmt(totalBudgetLimit)}</strong> ({totalPct}%)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {compactMode && (
            <button
              type="button"
              onClick={() => setEditingMode((v) => !v)}
              style={{
                border: '1px solid #334155',
                background: editingMode ? '#38bdf8' : '#0f172a',
                color: editingMode ? '#040711' : '#e2e8f0',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {editingMode ? 'Fertig' : '⚙️ Budgets anpassen'}
            </button>
          )}
          {editingMode && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAll}
              style={{
                border: 'none',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#fff',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {saving ? 'Speichert…' : '💾 Alle Budgets speichern'}
            </button>
          )}
        </div>
      </div>

      {/* Overall Monthly Budget Progress Bar */}
      <div
        style={{
          width: '100%',
          height: 8,
          background: '#090f1d',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${totalPct}%`,
            height: '100%',
            background:
              totalSpent > totalBudgetLimit
                ? '#ef4444'
                : totalPct > 85
                  ? '#f59e0b'
                  : 'linear-gradient(90deg, #38bdf8, #10b981)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Category Budget Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(compactMode && !editingMode ? expenseBudgets.slice(0, 7) : expenseBudgets).map((b) => {
          const limit = draftLimits[b.category] ?? b.budgetLimit;
          const pct = limit > 0 ? Math.min(100, Math.round((b.spent / limit) * 100)) : 0;
          const over = limit > 0 && b.spent > limit;
          const isPinnedInPreview = previewBudgetCategories.includes(b.category);

          return (
            <div
              key={b.category}
              style={{
                background: 'rgba(9, 15, 29, 0.58)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                padding: '10px 13px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15 }}>{b.icon}</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>
                      {b.labelDe}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>
                      ({b.category} · {b.tx_count}×)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {editingMode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftLimits((prev) => ({
                            ...prev,
                            [b.category]: Math.max(0, (prev[b.category] ?? b.budgetLimit) - 50),
                          }))
                        }
                        style={stepBtnStyle}
                      >
                        −50
                      </button>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        value={limit}
                        onChange={(e) =>
                          setDraftLimits((prev) => ({
                            ...prev,
                            [b.category]: Number(e.target.value),
                          }))
                        }
                        style={{
                          width: 82,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid #334155',
                          background: '#040711',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: 12.5,
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>€/Mo</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftLimits((prev) => ({
                            ...prev,
                            [b.category]: (prev[b.category] ?? b.budgetLimit) + 50,
                          }))
                        }
                        style={stepBtnStyle}
                      >
                        +50
                      </button>
                      <button
                        type="button"
                        onClick={() => onTogglePreviewCategory(b.category)}
                        title="In der Horizon Dashboard-Vorschau anzeigen/ausblenden"
                        style={{
                          border: isPinnedInPreview
                            ? '1px solid #a855f7'
                            : '1px solid rgba(255,255,255,0.12)',
                          background: isPinnedInPreview
                            ? 'rgba(168, 85, 247, 0.2)'
                            : 'rgba(255,255,255,0.03)',
                          color: isPinnedInPreview ? '#d8b4fe' : '#64748b',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {isPinnedInPreview ? '📌 Preview' : 'Pin'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                      <strong style={{ color: over ? '#f87171' : '#f8fafc' }}>
                        {fmt(b.spent)}
                      </strong>{' '}
                      <span style={{ color: '#64748b' }}>/ {fmt(limit)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  width: '100%',
                  height: 7,
                  background: '#040711',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: over ? '#ef4444' : pct > 85 ? '#f59e0b' : b.color,
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Custom Budget Group Form */}
      {editingMode && (
        <form
          onSubmit={handleAddCustomCategory}
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Neue Budget-Gruppe (z.B. Urlaub, Hobby)…"
            style={{
              flex: 1,
              minWidth: 180,
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#090f1d',
              color: '#f8fafc',
              fontSize: 12.5,
            }}
          />
          <input
            type="number"
            value={newCatLimit}
            onChange={(e) => setNewCatLimit(e.target.value)}
            placeholder="Limit €"
            style={{
              width: 100,
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#090f1d',
              color: '#f8fafc',
              fontSize: 12.5,
            }}
          />
          <button
            type="submit"
            style={{
              border: '1px solid #38bdf8',
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#38bdf8',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Gruppe hinzufügen
          </button>
        </form>
      )}
    </div>
  );
};

const stepBtnStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#94a3b8',
  borderRadius: 6,
  padding: '3px 6px',
  fontSize: 11,
  cursor: 'pointer',
};
