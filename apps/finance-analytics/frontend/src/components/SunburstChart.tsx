import React, { useState } from 'react';
import type { SunburstRing1Node } from '../../../shared/finance-types.js';

interface SunburstChartProps {
  groupsData: { totalExpenses: number; ring1: SunburstRing1Node[] };
  merchantsData: { totalExpenses: number; ring1: SunburstRing1Node[] };
  activeCategoryFilter: string;
  onSelectCategory: (category: string) => void;
  dataHidden?: boolean;
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArcSegment(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
): string {
  const fullSweep = endAngle - startAngle;
  const gap = fullSweep > 0.06 ? 0.016 : 0.004;
  const sa = startAngle + gap / 2;
  const ea = Math.max(sa + 0.004, endAngle - gap / 2);

  // Clamp near-full circle so SVG arc doesn't collapse
  const clampedEa = ea - sa >= Math.PI * 2 - 0.01 ? sa + Math.PI * 2 - 0.015 : ea;

  const p1 = polarToCartesian(cx, cy, rOuter, sa);
  const p2 = polarToCartesian(cx, cy, rOuter, clampedEa);
  const p3 = polarToCartesian(cx, cy, rInner, clampedEa);
  const p4 = polarToCartesian(cx, cy, rInner, sa);
  const largeArc = clampedEa - sa > Math.PI ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const SunburstChart: React.FC<SunburstChartProps> = ({
  groupsData,
  merchantsData,
  activeCategoryFilter,
  onSelectCategory,
  dataHidden = false,
}) => {
  const [hierarchyMode, setHierarchyMode] = useState<'groups' | 'merchants'>('groups');
  const [hoveredItem, setHoveredItem] = useState<{
    title: string;
    subtitle: string;
    value: number;
    pct: number;
    color: string;
  } | null>(null);

  const activeData = hierarchyMode === 'groups' ? groupsData : merchantsData;
  const { totalExpenses, ring1 } = activeData;

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;

  const formatEur = (val: number) => {
    if (dataHidden) return '•••• €';
    return `€${val.toLocaleString('de-AT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  let curAngle = -Math.PI / 2;
  const innerSegments: Array<{
    key: string;
    d: string;
    color: string;
    node: SunburstRing1Node;
    pct: number;
  }> = [];

  const outerSegments: Array<{
    key: string;
    d: string;
    color: string;
    parentName: string;
    name: string;
    label: string;
    value: number;
    txCount: number;
    pct: number;
    filterCategory?: string;
  }> = [];

  if (totalExpenses > 0) {
    for (const seg of ring1) {
      const sweep = (seg.value / totalExpenses) * Math.PI * 2;
      const nextAngle = curAngle + sweep;
      const pct = Number(((seg.value / totalExpenses) * 100).toFixed(1));

      innerSegments.push({
        key: `r1-${seg.id}`,
        d: describeArcSegment(cx, cy, 56, 94, curAngle, nextAngle),
        color: seg.color,
        node: seg,
        pct,
      });

      let childAngle = curAngle;
      const childrenTotal = seg.children.reduce((s, c) => s + c.value, 0) || 1;
      for (const child of seg.children) {
        const childSweep = (child.value / childrenTotal) * sweep;
        const childNext = childAngle + childSweep;
        const childPct = Number(((child.value / totalExpenses) * 100).toFixed(1));

        if (childSweep > 0.012) {
          outerSegments.push({
            key: `r2-${seg.id}-${child.name}`,
            d: describeArcSegment(cx, cy, 98, 138, childAngle, childNext),
            color: child.color,
            parentName: seg.label,
            name: child.name,
            label: child.label,
            value: child.value,
            txCount: child.txCount,
            pct: childPct,
            filterCategory: child.filterCategory,
          });
        }
        childAngle = childNext;
      }

      curAngle = nextAngle;
    }
  }

  const centerTitle = hoveredItem
    ? hoveredItem.title
    : activeCategoryFilter !== 'all'
      ? activeCategoryFilter
      : 'Gesamtausgaben';
  const centerValue = hoveredItem ? formatEur(hoveredItem.value) : formatEur(totalExpenses);
  const centerSub = hoveredItem
    ? `${hoveredItem.pct}% · ${hoveredItem.subtitle}`
    : activeCategoryFilter !== 'all'
      ? 'Klick zum Zurücksetzen'
      : hierarchyMode === 'groups'
        ? 'Gruppen → Kategorien'
        : 'Kategorien → Händler';

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
          <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>☀️ Ausgaben-Sunburst</span>
            {activeCategoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 99,
                  border: '1px solid #38bdf8',
                  background: 'rgba(56, 189, 248, 0.14)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                }}
              >
                Filter: {activeCategoryFilter} ✕
              </button>
            )}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Innenring: {hierarchyMode === 'groups' ? 'Ausgabengruppen' : 'Kategorien'} • Außenring:{' '}
            {hierarchyMode === 'groups' ? 'Kategorien' : 'Top-Empfänger'}
          </p>
        </div>

        <div
          style={{
            display: 'inline-flex',
            background: '#090f1d',
            padding: 3,
            borderRadius: 10,
            border: '1px solid #1e293b',
          }}
        >
          <button
            type="button"
            onClick={() => setHierarchyMode('groups')}
            style={{
              border: 'none',
              borderRadius: 7,
              padding: '5px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: hierarchyMode === 'groups' ? '#1e293b' : 'transparent',
              color: hierarchyMode === 'groups' ? '#38bdf8' : '#94a3b8',
            }}
          >
            Gruppen → Kategorien
          </button>
          <button
            type="button"
            onClick={() => setHierarchyMode('merchants')}
            style={{
              border: 'none',
              borderRadius: 7,
              padding: '5px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: hierarchyMode === 'merchants' ? '#1e293b' : 'transparent',
              color: hierarchyMode === 'merchants' ? '#38bdf8' : '#94a3b8',
            }}
          >
            Kategorien → Händler
          </button>
        </div>
      </div>

      {totalExpenses <= 0 ? (
        <div style={{ padding: 36, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          Keine Ausgaben im gewählten Zeitraum vorhanden.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 300px) 1fr',
            gap: 20,
            alignItems: 'center',
          }}
        >
          {/* SVG Sunburst Ring */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg
              viewBox={`0 0 ${size} ${size}`}
              width={size}
              height={size}
              style={{ overflow: 'visible', maxWidth: '100%' }}
            >
              {/* Inner Ring */}
              {innerSegments.map((seg) => {
                const isSelected =
                  seg.node.filterCategory && activeCategoryFilter === seg.node.filterCategory;
                return (
                  <path
                    key={seg.key}
                    d={seg.d}
                    fill={seg.color}
                    fillOpacity={isSelected ? 1 : 0.86}
                    stroke={isSelected ? '#ffffff' : '#090f1d'}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{
                      cursor: seg.node.filterCategory ? 'pointer' : 'default',
                      transition: 'fill-opacity 0.18s ease, transform 0.18s ease',
                    }}
                    onMouseEnter={() =>
                      setHoveredItem({
                        title: seg.node.label,
                        subtitle: `${seg.node.txCount} Buchungen`,
                        value: seg.node.value,
                        pct: seg.pct,
                        color: seg.color,
                      })
                    }
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => {
                      if (seg.node.filterCategory) {
                        onSelectCategory(
                          activeCategoryFilter === seg.node.filterCategory
                            ? 'all'
                            : seg.node.filterCategory
                        );
                      }
                    }}
                  />
                );
              })}

              {/* Outer Ring */}
              {outerSegments.map((seg) => {
                const isSelected =
                  seg.filterCategory && activeCategoryFilter === seg.filterCategory;
                return (
                  <path
                    key={seg.key}
                    d={seg.d}
                    fill={seg.color}
                    fillOpacity={isSelected ? 0.98 : 0.68}
                    stroke={isSelected ? '#ffffff' : '#090f1d'}
                    strokeWidth={isSelected ? 1.5 : 0.8}
                    style={{
                      cursor: seg.filterCategory ? 'pointer' : 'default',
                      transition: 'fill-opacity 0.15s ease',
                    }}
                    onMouseEnter={() =>
                      setHoveredItem({
                        title: seg.label,
                        subtitle: `${seg.parentName} (${seg.txCount}×)`,
                        value: seg.value,
                        pct: seg.pct,
                        color: seg.color,
                      })
                    }
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => {
                      if (seg.filterCategory) {
                        onSelectCategory(
                          activeCategoryFilter === seg.filterCategory ? 'all' : seg.filterCategory
                        );
                      }
                    }}
                  />
                );
              })}

              {/* Center Interactive Readout */}
              <circle
                cx={cx}
                cy={cy}
                r={50}
                fill="rgba(9, 15, 29, 0.92)"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1}
                onClick={() => activeCategoryFilter !== 'all' && onSelectCategory('all')}
                style={{ cursor: activeCategoryFilter !== 'all' ? 'pointer' : 'default' }}
              />
              <text
                x={cx}
                y={cy - 14}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontWeight="600"
              >
                {centerTitle.length > 18 ? `${centerTitle.slice(0, 17)}…` : centerTitle}
              </text>
              <text
                x={cx}
                y={cy + 5}
                textAnchor="middle"
                fill={hoveredItem?.color || '#f8fafc'}
                fontSize="14"
                fontWeight="700"
              >
                {centerValue}
              </text>
              <text x={cx} y={cy + 21} textAnchor="middle" fill="#64748b" fontSize="9.5">
                {centerSub.length > 22 ? `${centerSub.slice(0, 21)}…` : centerSub}
              </text>
            </svg>
          </div>

          {/* Interactive Legend List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ring1.slice(0, 7).map((item) => {
              const pct = totalExpenses > 0 ? Math.round((item.value / totalExpenses) * 100) : 0;
              const isSelected =
                item.filterCategory && activeCategoryFilter === item.filterCategory;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.filterCategory) {
                      onSelectCategory(
                        activeCategoryFilter === item.filterCategory ? 'all' : item.filterCategory
                      );
                    }
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 11px',
                    borderRadius: 10,
                    background: isSelected
                      ? 'rgba(56, 189, 248, 0.14)'
                      : 'rgba(9, 15, 29, 0.55)',
                    border: isSelected
                      ? '1px solid rgba(56, 189, 248, 0.45)'
                      : '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: item.filterCategory ? 'pointer' : 'default',
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{item.label}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>({pct}%)</span>
                  </div>
                  <strong style={{ color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    {formatEur(item.value)}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
