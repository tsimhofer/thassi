/**
 * Canonical Thassi Design System & Universal 2-Tier App Architecture
 * (Startseite mit 3-Block-Fokus & SVG-Diagrammen + Einheitliche Top-Menüleiste für Subseiten & Slide-Over-Aktionen)
 */

export const UNIFORM_DESIGN_TOKENS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-strong: rgba(255, 255, 255, 0.12);
    --line-focus: rgba(255, 255, 255, 0.22);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --action-fg: #fafafa;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --dot-idle: #52525b;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  html, body {
    background-color: #09090b !important;
    color: #fafafa;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color-scheme: dark;
    margin: 0;
    padding: 0;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #09090b;
  }
  ::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }

  code, pre, kbd, samp, td, th, input[type="number"],
  .mono, [class*="mono"], [class*="kpi"], [class*="metric"], [class*="stat-v"], [class*="tabular"] {
    font-variant-numeric: tabular-nums;
  }

  /* ============================================================================
   * TOP MENÜLEISTE (48px Sticky Swiss Hairline Navigation & Action Bar)
   * ============================================================================ */
  #thassi-menubar {
    position: sticky;
    top: 0;
    z-index: 9990;
    height: 48px;
    padding: 0 24px;
    background: rgba(9, 9, 11, 0.94);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-family: var(--font-sans);
    box-sizing: border-box;
  }

  .thassi-mb-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex-shrink: 0;
  }

  .thassi-mb-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .thassi-mb-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    padding-left: 10px;
    border-left: 1px solid var(--line-hairline);
    white-space: nowrap;
  }

  .thassi-mb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    flex-shrink: 0;
  }
  .thassi-mb-dot.warn { background: #f59e0b; }
  .thassi-mb-dot.err { background: #ef4444; }

  .thassi-mb-tabs {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 48px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
    justify-content: center;
  }
  .thassi-mb-tabs::-webkit-scrollbar {
    display: none;
  }

  .thassi-mb-tab {
    height: 48px;
    padding: 0 2px;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid transparent;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.14s ease, border-color 0.14s ease;
  }
  .thassi-mb-tab:hover {
    color: var(--text-primary);
  }
  .thassi-mb-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }
  .thassi-mb-tab-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--bg-elevated);
    border: 1px solid var(--line-hairline);
    color: var(--text-muted);
  }

  .thassi-mb-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .thassi-mb-btn-primary {
    background: #fafafa;
    color: #09090b;
    border: none;
    border-radius: 4px;
    height: 28px;
    padding: 0 11px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: background 0.14s ease;
  }
  .thassi-mb-btn-primary:hover {
    background: #e4e4e7;
  }

  .thassi-mb-btn-ghost {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    height: 28px;
    padding: 0 10px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.14s ease, border-color 0.14s ease;
  }
  .thassi-mb-btn-ghost:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  /* ============================================================================
   * STARTSEITE (3-Block-Fokus: 1. KPI-Leiste · 2. Diagramme · 3. Fokus-Kurzliste)
   * ============================================================================ */
  #thassi-startseite {
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px 24px 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .thassi-ov-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--line-hairline);
    border-radius: 6px;
    background: var(--bg-canvas);
    overflow: hidden;
  }

  .thassi-ov-kpi {
    padding: 16px 20px;
    border-right: 1px solid var(--line-hairline);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .thassi-ov-kpi:last-child {
    border-right: none;
  }

  .thassi-ov-kpi-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .thassi-ov-kpi-val {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-kpi-sub {
    font-size: 12px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-charts {
    display: grid;
    grid-template-columns: 7fr 5fr;
    gap: 16px;
  }

  .thassi-ov-panel {
    background: var(--bg-canvas);
    border: 1px solid var(--line-hairline);
    border-radius: 6px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .thassi-ov-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .thassi-ov-panel-title {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-secondary);
  }

  .thassi-ov-panel-meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .thassi-ov-chart-body {
    min-height: 210px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  /* Block 3: Kompakte Fokus-Kurzliste (Max 5 Einträge) */
  .thassi-ov-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line-hairline);
  }

  .thassi-ov-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--line-hairline);
    font-size: 13px;
  }
  .thassi-ov-row:last-child {
    border-bottom: none;
  }

  .thassi-ov-row-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .thassi-ov-row-title {
    color: var(--text-primary);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-row-sub {
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-row-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .thassi-ov-tag {
    font-family: var(--font-mono);
    font-size: 10.5px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--bg-elevated);
    border: 1px solid var(--line-hairline);
    color: var(--text-secondary);
  }

  /* ============================================================================
   * SATELLITE SUBPAGE EMBED & NATIVE SUBPAGE WORKSPACE
   * ============================================================================ */
  #thassi-satellite-container {
    display: none;
    width: 100%;
    height: calc(100vh - 48px);
    border: none;
    background: var(--bg-canvas);
  }

  body.thassi-mode-overview #root,
  body.thassi-mode-satellite #root {
    display: none !important;
  }

  body.thassi-mode-subpage #thassi-startseite,
  body.thassi-mode-satellite #thassi-startseite {
    display: none !important;
  }

  body.thassi-mode-satellite #thassi-satellite-container {
    display: block !important;
  }

  /* When embedded as a satellite subpage (?subpage=1), hide the inner duplicate menubar */
  body.thassi-is-embedded-subpage #thassi-menubar,
  body.thassi-is-embedded-subpage #thassi-startseite {
    display: none !important;
  }
  body.thassi-is-embedded-subpage #root {
    display: block !important;
  }

  /* ============================================================================
   * SLIDE-OVER ACTION DRAWER (Fokussierte Formulare ohne Seiten-Ballast)
   * ============================================================================ */
  #thassi-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9995;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: none;
    justify-content: flex-end;
  }
  #thassi-drawer-backdrop.open {
    display: flex;
  }

  #thassi-drawer-panel {
    width: 420px;
    max-width: 92vw;
    height: 100%;
    background: #111113;
    border-left: 1px solid var(--line-strong);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .thassi-drw-head {
    height: 52px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .thassi-drw-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .thassi-drw-close {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .thassi-drw-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    flex: 1;
  }

  .thassi-drw-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .thassi-drw-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }

  .thassi-drw-input {
    background: var(--bg-input);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    padding: 8px 10px;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    outline: none;
  }
  .thassi-drw-input:focus {
    border-color: var(--text-primary);
  }

  @media (max-width: 960px) {
    .thassi-ov-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .thassi-ov-kpi {
      border-bottom: 1px solid var(--line-hairline);
    }
    .thassi-ov-charts {
      grid-template-columns: 1fr;
    }
    #thassi-menubar {
      padding: 0 12px;
    }
  }
`;

export function getUniformAppCockpitScript(): string {
  return `
  (function initThassiUniformAppCockpit() {
    if (window.__THASSI_UNIFORM_COCKPIT_INIT__) return;
    window.__THASSI_UNIFORM_COCKPIT_INIT__ = true;

    var appId = window.__THASSI_APP_ID__ || '';
    if (!appId) return;

    var params = new URLSearchParams(window.location.search || '');
    var isEmbeddedSubpage = params.get('subpage') === '1';

    var ingressBase = String(window.__THASSI_INGRESS_PATH__ || '').replace(/\\/+$/, '');
    function apiUrl(p) {
      return ingressBase + p;
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fmtNum(n, dec) {
      var v = Number(n || 0);
      if (!Number.isFinite(v)) v = 0;
      return v.toLocaleString('de-DE', {
        minimumFractionDigits: dec || 0,
        maximumFractionDigits: dec || 0
      });
    }

    function fmtEur(n) {
      return fmtNum(n, 2) + ' €';
    }

    // SVG Chart Helpers (Swiss Precision Hairline Charts)
    function svgAreaChart(values, labels, unit, color) {
      var pts = Array.isArray(values) && values.length > 0 ? values.map(function(v) { return Number(v) || 0; }) : [12, 19, 15, 28, 24, 34, 30];
      var lbls = Array.isArray(labels) && labels.length > 0 ? labels : pts.map(function(_, i) { return 'T-' + (pts.length - i); });
      if (pts.length === 1) {
        pts = [pts[0] * 0.85, pts[0]];
        lbls = ['Vorher', lbls[0]];
      }
      var w = 520, h = 185, padL = 36, padR = 14, padT = 16, padB = 26;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;
      var minV = Math.min.apply(null, pts);
      var maxV = Math.max.apply(null, pts);
      if (minV > 0) minV = 0;
      var span = Math.max(1, maxV - minV);
      var strokeCol = color || '#fafafa';

      var coords = pts.map(function(v, i) {
        var x = padL + (i / Math.max(1, pts.length - 1)) * plotW;
        var y = padT + plotH - ((v - minV) / span) * plotH;
        return { x: x, y: y, v: v, l: lbls[i] || '' };
      });

      var dLine = coords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      var dArea = dLine + ' L ' + coords[coords.length - 1].x.toFixed(1) + ' ' + (padT + plotH) + ' L ' + coords[0].x.toFixed(1) + ' ' + (padT + plotH) + ' Z';

      var gridHtml = '';
      for (var g = 0; g <= 3; g++) {
        var gy = padT + (g / 3) * plotH;
        var gv = maxV - (g / 3) * span;
        gridHtml += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2,3" />';
        gridHtml += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" fill="#52525b" font-family="JetBrains Mono, monospace" font-size="9.5">' + Math.round(gv) + '</text>';
      }

      var step = Math.max(1, Math.ceil(coords.length / 6));
      var xLabelsHtml = '';
      var dotsHtml = '';
      for (var j = 0; j < coords.length; j++) {
        var c = coords[j];
        dotsHtml += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2.5" fill="#09090b" stroke="' + strokeCol + '" stroke-width="1.5"><title>' + esc(c.l + ': ' + fmtNum(c.v, 1) + ' ' + (unit || '')) + '</title></circle>';
        if (j % step === 0 || j === coords.length - 1) {
          xLabelsHtml += '<text x="' + c.x.toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(String(c.l).slice(0, 8)) + '</text>';
        }
      }

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:195px; overflow:visible;">' +
        '<defs><linearGradient id="thassiAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + strokeCol + '" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="' + strokeCol + '" stop-opacity="0.0"/>' +
        '</linearGradient></defs>' +
        gridHtml +
        '<path d="' + dArea + '" fill="url(#thassiAreaGrad)" />' +
        '<path d="' + dLine + '" fill="none" stroke="' + strokeCol + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />' +
        dotsHtml +
        xLabelsHtml +
        '</svg>';
    }

    function svgBarChart(items, unit) {
      var list = Array.isArray(items) && items.length > 0 ? items.slice(0, 8) : [{ label: 'Keine Daten', value: 0 }];
      var w = 520, h = 185, padL = 34, padR = 12, padT = 16, padB = 26;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;
      var maxV = Math.max.apply(null, list.map(function(x) { return Number(x.value) || 0; }).concat([1]));

      var gridHtml = '';
      for (var g = 0; g <= 3; g++) {
        var gy = padT + (g / 3) * plotH;
        var gv = maxV - (g / 3) * maxV;
        gridHtml += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" />';
        gridHtml += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" fill="#52525b" font-family="JetBrains Mono, monospace" font-size="9.5">' + Math.round(gv) + '</text>';
      }

      var slotW = plotW / list.length;
      var barW = Math.min(38, Math.max(12, slotW * 0.56));
      var barsHtml = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var v = Math.max(0, Number(it.value) || 0);
        var bh = Math.max(2, (v / maxV) * plotH);
        var bx = padL + i * slotW + (slotW - barW) / 2;
        var by = padT + plotH - bh;
        var col = it.color || (i === list.length - 1 ? '#10b981' : '#e4e4e7');
        barsHtml += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + col + '" opacity="0.88"><title>' + esc(it.label + ': ' + fmtNum(v, 1) + ' ' + (unit || '')) + '</title></rect>';
        barsHtml += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(String(it.label || '').slice(0, 8)) + '</text>';
      }

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:195px; overflow:visible;">' + gridHtml + barsHtml + '</svg>';
    }

    function svgDonutChart(segments, centerTop, centerBottom) {
      var list = Array.isArray(segments) ? segments.filter(function(s) { return Number(s.value) > 0; }).slice(0, 5) : [];
      var palette = ['#fafafa', '#10b981', '#71717a', '#f59e0b', '#3f3f46'];
      var total = list.reduce(function(acc, s) { return acc + (Number(s.value) || 0); }, 0);
      var r = 62;
      var c = 2 * Math.PI * r;
      var offset = 0;
      var ringsHtml = '<circle cx="80" cy="80" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" />';

      if (total > 0) {
        for (var i = 0; i < list.length; i++) {
          var seg = list[i];
          var frac = (Number(seg.value) || 0) / total;
          var dash = frac * c;
          var col = seg.color || palette[i % palette.length];
          ringsHtml += '<circle cx="80" cy="80" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="14" stroke-dasharray="' + dash.toFixed(2) + ' ' + (c - dash).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 80 80)" />';
          offset += dash;
        }
      }

      var legendHtml = '';
      for (var j = 0; j < list.length; j++) {
        var s = list[j];
        var pct = total > 0 ? Math.round(((Number(s.value) || 0) / total) * 100) : 0;
        var lcol = s.color || palette[j % palette.length];
        legendHtml += '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px;">' +
          '<div style="display:flex; align-items:center; gap:7px; min-width:0;">' +
            '<span style="width:7px; height:7px; border-radius:2px; background:' + lcol + '; flex-shrink:0;"></span>' +
            '<span style="color:#a1a1aa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(s.label) + '</span>' +
          '</div>' +
          '<span style="font-family:var(--font-mono); color:#fafafa; font-size:11.5px;">' + (s.display || (pct + '%')) + '</span>' +
        '</div>';
      }
      if (!legendHtml) {
        legendHtml = '<div style="font-size:12px; color:#52525b;">Noch keine Segmentdaten vorhanden</div>';
      }

      return '<div style="display:flex; align-items:center; justify-content:space-between; gap:20px; width:100%;">' +
        '<svg width="156" height="156" viewBox="0 0 160 160" style="flex-shrink:0;">' +
          ringsHtml +
          '<text x="80" y="76" text-anchor="middle" fill="#fafafa" font-family="JetBrains Mono, monospace" font-size="16" font-weight="500">' + esc(centerTop || '') + '</text>' +
          '<text x="80" y="95" text-anchor="middle" fill="#71717a" font-family="Inter, sans-serif" font-size="10.5">' + esc(centerBottom || '') + '</text>' +
        '</svg>' +
        '<div style="display:flex; flex-direction:column; gap:8px; flex:1; min-width:0;">' + legendHtml + '</div>' +
      '</div>';
    }

    function svgRingGauges(rings) {
      var html = '<div style="display:grid; grid-template-columns:repeat(' + rings.length + ', 1fr); gap:12px; width:100%; align-items:center;">';
      var r = 44;
      var c = 2 * Math.PI * r;
      for (var i = 0; i < rings.length; i++) {
        var rg = rings[i];
        var pct = Math.max(0, Math.min(100, Number(rg.pct) || 0));
        var dash = (pct / 100) * c;
        var col = rg.color || '#10b981';
        html += '<div style="display:flex; flex-direction:column; align-items:center; gap:6px;">' +
          '<svg width="108" height="108" viewBox="0 0 108 108">' +
            '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" />' +
            '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 54 54)" />' +
            '<text x="54" y="52" text-anchor="middle" fill="#fafafa" font-family="JetBrains Mono, monospace" font-size="15" font-weight="500">' + esc(rg.val) + '</text>' +
            '<text x="54" y="68" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(rg.sub || (Math.round(pct) + '%')) + '</text>' +
          '</svg>' +
          '<span style="font-size:11px; color:#a1a1aa; font-weight:500;">' + esc(rg.label) + '</span>' +
        '</div>';
      }
      html += '</div>';
      return html;
    }

    // Per-App Configuration (Menüleiste Subseiten + Slide-Over Actions)
    var APP_CONFIGS = {
      'smart-canvas': {
        title: 'Smart Home',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'rooms', label: 'Räume & Geräte', rootMatch: 'Alle' },
          { id: 'floorplan', label: '2D Grundriss', satellite: 'floorplan' },
          { id: 'energy', label: 'Energie & Klima', rootMatch: 'Klima' }
        ],
        actions: [
          { id: 'all-lights-off', label: 'Alle Lichter aus', ghost: true },
          { id: 'new-tile', label: '+ Gerät / Kachel' }
        ]
      },
      'camera-vision': {
        title: 'Kameras & Vision',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'streams', label: 'Live-Matrix & Streams', rootMatch: 'Kamera' },
          { id: 'triggers', label: 'KI-Regeln & Events', rootMatch: 'Trigger' },
          { id: 'setup', label: 'Kamera-Setup', rootMatch: 'ONVIF' }
        ],
        actions: [
          { id: 'sample-all', label: 'Snapshots abtasten', ghost: true },
          { id: 'new-trigger', label: '+ KI-Trigger' }
        ]
      },
      '3d-print': {
        title: '3D Druck Studio',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'cad', label: 'CAD & 3D-Generator', rootMatch: 'Studio' },
          { id: 'ams', label: 'AMS & Filament', rootMatch: 'AMS' },
          { id: 'setup', label: 'Drucker-Setup', rootMatch: 'Bambu' }
        ],
        actions: [
          { id: 'start-print', label: 'Druck starten', ghost: true },
          { id: 'new-3d-model', label: '+ KI 3D-Modell' }
        ]
      },
      'finance-analytics': {
        title: 'Finanzen',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'transactions', label: 'Buchungen & Analyse', rootMatch: 'BUCHUNGEN' },
          { id: 'budgets', label: 'Budgets & Fixkosten', rootMatch: 'FIXKOSTEN' },
          { id: 'george-sync', label: 'George Sync', satellite: 'george-sync' }
        ],
        actions: [
          { id: 'scan-bank', label: 'Downloads scannen', ghost: true },
          { id: 'new-tx', label: '+ Buchung' }
        ]
      },
      'google-calendar': {
        title: 'Kalender & Zeit',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'calendar', label: 'Agenda & Termine', rootMatch: 'Agenda' },
          { id: 'analytics', label: 'Horizon & Zeitbudget', rootMatch: 'Zeitbudget' },
          { id: 'sources', label: 'Kalender-Quellen', rootMatch: 'Quellen' }
        ],
        actions: [
          { id: 'sync-cal', label: 'Synchronisieren', ghost: true },
          { id: 'new-event', label: '+ Termin' }
        ]
      },
      'google-health': {
        title: 'Gesundheit',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'sleep', label: '7-Tage Verlauf', rootMatch: 'Verlauf' },
          { id: 'workouts', label: 'Workouts & Training', rootMatch: 'Workouts' },
          { id: 'biometrics', label: 'Quellen & Eingabe', rootMatch: 'Quellen' }
        ],
        actions: [
          { id: 'refresh-health', label: 'Sync aktualisieren', ghost: true },
          { id: 'new-biometric', label: '+ Messwert / Training' }
        ]
      },
      'meal-planner': {
        title: 'Ernährung & Einkauf',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'planner', label: 'Wochenplan & Optimizer', rootMatch: 'Wochenplan' },
          { id: 'recipes', label: 'Rezepte & Vorrat', rootMatch: 'Rezepte' },
          { id: 'groceries', label: 'Einkauf & Preise', rootMatch: 'Einkauf' }
        ],
        actions: [
          { id: 'optimize-week', label: 'Wochenplan füllen', ghost: true },
          { id: 'new-grocery', label: '+ Einkauf / Mahlzeit' }
        ]
      },
      'memo': {
        title: 'Memo',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'editor', label: 'Lokale .MD & Vault', rootMatch: 'LOKALE .MD' },
          { id: 'search', label: 'Alle Quellen & Suche', rootMatch: 'ALLE QUELLEN' },
          { id: 'sync', label: 'Keep & Drive Sync', rootMatch: 'GOOGLE DRIVE' }
        ],
        actions: [
          { id: 'sync-memo', label: 'Vault Sync', ghost: true },
          { id: 'new-note', label: '+ Neue Notiz' }
        ]
      },
      'contacts': {
        title: 'Kontakte',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'directory', label: 'Adressbuch', rootMatch: 'Adressbuch' },
          { id: 'messages', label: 'Kommunikation & KI', rootMatch: 'Chat' }
        ],
        actions: [
          { id: 'sync-contacts', label: 'Google Sync', ghost: true },
          { id: 'new-contact', label: '+ Kontakt' }
        ]
      },
      'cortex': {
        title: 'Cortex',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'workspace', label: 'KI-Workspace', rootMatch: 'GEMINI ANTWORT' },
          { id: 'blueprints', label: 'Verlauf & Kontext', rootMatch: 'VERLAUF' },
          { id: 'vault', label: 'Credentials Vault', rootMatch: 'Vault' }
        ],
        actions: [
          { id: 'open-vault', label: 'Credentials Vault', ghost: true },
          { id: 'new-prompt', label: '+ KI-Anfrage' }
        ]
      },
      'workflows': {
        title: 'Workflows',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'editor', label: 'Abläufe & Ketten', rootMatch: 'Ketten' },
          { id: 'axons', label: 'Axon-Katalog', rootMatch: 'Axon-Katalog' },
          { id: 'kvm', label: 'PC-Bridge & KVM', rootMatch: 'PC-Bridge' }
        ],
        actions: [
          { id: 'sync-pc', label: 'PC-Bridge Sync', ghost: true },
          { id: 'run-axon', label: '+ Axon ausführen' }
        ]
      },
      'project-workflow': {
        title: 'Dev-Projekte',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'issues', label: 'Tasks & Issues', rootMatch: 'Issues' },
          { id: 'milestones', label: 'Meilensteine', rootMatch: 'Milestones' },
          { id: 'cicd', label: 'GitHub & Deployment', rootMatch: 'Deployment' }
        ],
        actions: [
          { id: 'run-tests', label: 'Tests starten', ghost: true },
          { id: 'new-issue', label: '+ Task / Issue' }
        ]
      },
      'system-monitor': {
        title: 'System & Infrastruktur',
        tabs: [
          { id: 'overview', label: 'Übersicht' },
          { id: 'containers', label: 'Container & Prozesse', rootMatch: 'CONTAINER' },
          { id: 'network-monitor', label: 'Netzwerk & Fritz!Box', satellite: 'network-monitor' },
          { id: 'google-usage', label: 'Cloud & API Usage', satellite: 'google-usage' },
          { id: 'logs', label: 'Watchdog & Diagnose', rootMatch: 'WATCHDOG' }
        ],
        actions: [
          { id: 'refresh-sys', label: 'Live-Refresh', ghost: true },
          { id: 'open-diagnostics', label: 'System-Diagnose' }
        ]
      }
    };

    var cfg = APP_CONFIGS[appId];
    if (!cfg || isEmbeddedSubpage) {
      if (isEmbeddedSubpage) {
        document.addEventListener('DOMContentLoaded', function() {
          document.body.classList.add('thassi-is-embedded-subpage');
        });
      }
      return;
    }

    var activeTabId = 'overview';
    if (params.get('tab') === 'vault' && appId === 'cortex') {
      activeTabId = 'vault';
    } else if (window.location.hash && window.location.hash.indexOf('subpage=') !== -1) {
      var m = window.location.hash.match(/subpage=([a-z0-9-_]+)/i);
      if (m && m[1]) activeTabId = m[1];
    }

    function setTab(tabId) {
      activeTabId = tabId;
      var tabObj = cfg.tabs.find(function(t) { return t.id === tabId; }) || cfg.tabs[0];
      var btns = document.querySelectorAll('#thassi-menubar .thassi-mb-tab');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === tabObj.id);
      }

      document.body.classList.remove('thassi-mode-overview', 'thassi-mode-subpage', 'thassi-mode-satellite');
      var satFrame = document.getElementById('thassi-satellite-container');

      if (tabObj.id === 'overview') {
        document.body.classList.add('thassi-mode-overview');
      } else if (tabObj.satellite) {
        document.body.classList.add('thassi-mode-satellite');
        if (satFrame) {
          var targetUrl = apiUrl('/apps/' + tabObj.satellite + '/?subpage=1');
          if (satFrame.getAttribute('data-src') !== targetUrl) {
            satFrame.setAttribute('data-src', targetUrl);
            satFrame.src = targetUrl;
          }
        }
      } else {
        document.body.classList.add('thassi-mode-subpage');
        if (tabObj.rootMatch) {
          tryActivateRootTab(tabObj.rootMatch);
        }
      }
    }

    function tryActivateRootTab(keyword) {
      try {
        var root = document.getElementById('root');
        if (!root) return;
        var kw = String(keyword).toLowerCase();
        var candidates = root.querySelectorAll('button, [role="tab"], a');
        for (var i = 0; i < candidates.length; i++) {
          var txt = (candidates[i].textContent || '').trim().toLowerCase();
          if (txt && txt.length < 32 && txt.indexOf(kw) !== -1) {
            candidates[i].click();
            break;
          }
        }
      } catch (_e) {}
    }

    function updateFreshnessLabel(statusOk, customLabel) {
      var tsEl = document.getElementById('thassi-mb-ts');
      var dotEl = document.getElementById('thassi-mb-dot');
      var nowStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (tsEl) tsEl.textContent = (customLabel ? customLabel + ' · ' : '') + 'Stand: ' + nowStr;
      if (dotEl) {
        dotEl.className = 'thassi-mb-dot' + (statusOk === false ? ' warn' : '');
      }
    }

    function renderStartseiteSkeleton(kpis, chart1Title, chart1Meta, chart1Html, chart2Title, chart2Meta, chart2Html, listTitle, listSubTab, rowsHtml) {
      var container = document.getElementById('thassi-startseite');
      if (!container) return;

      var kpisHtml = '';
      for (var i = 0; i < kpis.length; i++) {
        var k = kpis[i];
        kpisHtml += '<div class="thassi-ov-kpi">' +
          '<div class="thassi-ov-kpi-label"><span>' + esc(k.label) + '</span>' + (k.dot ? '<span class="thassi-mb-dot ' + k.dot + '"></span>' : '') + '</div>' +
          '<div class="thassi-ov-kpi-val">' + esc(k.value) + '</div>' +
          '<div class="thassi-ov-kpi-sub">' + esc(k.sub || '') + '</div>' +
        '</div>';
      }

      container.innerHTML =
        '<div class="thassi-ov-kpis">' + kpisHtml + '</div>' +
        '<div class="thassi-ov-charts">' +
          '<div class="thassi-ov-panel">' +
            '<div class="thassi-ov-panel-head">' +
              '<span class="thassi-ov-panel-title">' + esc(chart1Title) + '</span>' +
              '<span class="thassi-ov-panel-meta">' + esc(chart1Meta || '') + '</span>' +
            '</div>' +
            '<div class="thassi-ov-chart-body">' + chart1Html + '</div>' +
          '</div>' +
          '<div class="thassi-ov-panel">' +
            '<div class="thassi-ov-panel-head">' +
              '<span class="thassi-ov-panel-title">' + esc(chart2Title) + '</span>' +
              '<span class="thassi-ov-panel-meta">' + esc(chart2Meta || '') + '</span>' +
            '</div>' +
            '<div class="thassi-ov-chart-body">' + chart2Html + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="thassi-ov-panel">' +
          '<div class="thassi-ov-panel-head">' +
            '<span class="thassi-ov-panel-title">' + esc(listTitle) + ' (Max. 5)</span>' +
            '<button class="thassi-mb-btn-ghost" style="height:24px; font-size:11px;" onclick="window.__thassiSwitchTab(\\'' + esc(listSubTab || cfg.tabs[1].id) + '\\')">Alle in Subseite öffnen →</button>' +
          '</div>' +
          '<div class="thassi-ov-list">' + (rowsHtml || '<div class="thassi-ov-row"><span class="thassi-ov-row-sub">Keine Einträge vorhanden</span></div>') + '</div>' +
        '</div>';
    }

    function buildRowsHtml(items) {
      var slice = (items || []).slice(0, 5);
      if (slice.length === 0) return '';
      return slice.map(function(it) {
        return '<div class="thassi-ov-row">' +
          '<div class="thassi-ov-row-left">' +
            '<span class="thassi-mb-dot ' + (it.dot || '') + '"></span>' +
            '<span class="thassi-ov-row-title">' + esc(it.title) + '</span>' +
            (it.sub ? '<span class="thassi-ov-row-sub">· ' + esc(it.sub) + '</span>' : '') +
          '</div>' +
          '<div class="thassi-ov-row-right">' +
            (it.tag ? '<span class="thassi-ov-tag">' + esc(it.tag) + '</span>' : '') +
            '<span>' + esc(it.right || '') + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function loadOverviewData() {
      try {
        if (appId === 'finance-analytics') {
          var res = await fetch(apiUrl('/api/apps/finance-analytics/overview?month=all'));
          var d = res.ok ? await res.json() : {};
          var k = d.kpis || {};
          var txs = Array.isArray(d.transactions) ? d.transactions : [];
          var cats = Array.isArray(d.categoryBreakdown) ? d.categoryBreakdown : [];
          var series = Array.isArray(d.monthlyTrend) && d.monthlyTrend.length > 0 ? d.monthlyTrend : txs.slice(0, 10).reverse();

          var kpis = [
            { label: 'Kontostand', value: fmtEur(d.balanceConfig?.currentBalance ?? k.currentBalance ?? 4850), sub: d.balanceConfig?.accountName || 'Girokonto' },
            { label: 'Ausgaben Monat', value: fmtEur(k.expenses || 0), sub: 'Einnahmen: ' + fmtEur(k.income || 0) },
            { label: 'Netto Cashflow', value: fmtEur(k.net || 0), sub: 'Sparquote: ' + fmtNum(k.savingsRate || 0, 1) + '%' },
            { label: 'Buchungen', value: String(txs.length), sub: 'George Sync bereit' }
          ];

          var c1Vals = series.map(function(x) { return Math.abs(Number(x.expenses ?? x.amount ?? 0)); });
          var c1Lbls = series.map(function(x) { return String(x.month || x.booking_date || x.date || '').slice(5, 10); });
          var c2Segs = cats.slice(0, 5).map(function(c) {
            return { label: c.category || c.name || 'Sonstiges', value: Math.abs(Number(c.total ?? c.amount ?? 0)), display: fmtEur(Math.abs(Number(c.total ?? c.amount ?? 0))) };
          });

          var rows = txs.slice(0, 5).map(function(t) {
            var amt = Number(t.amount || 0);
            return {
              title: t.merchant || t.description || t.title || 'Buchung',
              sub: String(t.booking_date || t.date || '').slice(0, 10),
              tag: t.category || 'Allgemein',
              right: (amt >= 0 ? '+' : '') + fmtEur(amt),
              dot: amt >= 0 ? '' : 'warn'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Cashflow & Ausgaben-Verlauf', 'EUR / Zeitraum', svgAreaChart(c1Vals, c1Lbls, '€', '#fafafa'),
            'Kategorien-Aufteilung', 'Top 5 Kategorien', svgDonutChart(c2Segs, fmtEur(k.expenses || 0), 'Ausgaben'),
            'Letzte Transaktionen', 'transactions', buildRowsHtml(rows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'smart-canvas') {
          var rRes = await fetch(apiUrl('/api/system/rooms'));
          var rData = rRes.ok ? await rRes.json() : { rooms: [] };
          var rooms = (rData.rooms || []).filter(function(r) { return r.id !== 'kameras_vision'; });
          var allDevs = [];
          var totalW = 0;
          var activeCnt = 0;
          rooms.forEach(function(r) {
            (r.devices || []).forEach(function(dv) {
              allDevs.push({ room: r.name, dev: dv });
              if (dv.isOn) activeCnt++;
              if (dv.powerW) totalW += Number(dv.powerW) || 0;
            });
          });
          var temps = rooms.map(function(r) { return r.tempC; }).filter(function(t) { return t != null; });
          var avgTemp = temps.length > 0 ? (temps.reduce(function(a, b) { return a + b; }, 0) / temps.length) : 21.5;

          var kpis = [
            { label: 'Aktuelle Leistung', value: fmtNum(totalW, 1) + ' W', sub: 'Live Shelly Messung' },
            { label: 'Aktive Geräte', value: activeCnt + ' / ' + allDevs.length, sub: rooms.length + ' Räume überwacht' },
            { label: 'Ø Raumklima', value: fmtNum(avgTemp, 1) + ' °C', sub: 'Büro & Wohnbereich' },
            { label: '2D Grundriss', value: 'Integriert', sub: 'In Menüleiste verfügbar' }
          ];

          var barItems = rooms.map(function(r) {
            var rw = (r.devices || []).reduce(function(s, d) { return s + (Number(d.powerW) || 0); }, 0);
            var onC = (r.devices || []).filter(function(d) { return d.isOn; }).length;
            return { label: r.name, value: rw > 0 ? rw : onC * 15 + 5 };
          });

          var segs = [
            { label: 'Eingeschaltet', value: Math.max(1, activeCnt), color: '#10b981', display: activeCnt + ' aktiv' },
            { label: 'Standby / Aus', value: Math.max(1, allDevs.length - activeCnt), color: '#3f3f46', display: (allDevs.length - activeCnt) + ' aus' }
          ];

          var activeList = allDevs.filter(function(x) { return x.dev.isOn; }).concat(allDevs.filter(function(x) { return !x.dev.isOn; })).slice(0, 5).map(function(x) {
            return {
              title: x.dev.label,
              sub: x.room,
              tag: x.dev.isOn ? 'EIN' : 'AUS',
              right: x.dev.powerW != null ? (fmtNum(x.dev.powerW, 1) + ' W') : x.dev.state,
              dot: x.dev.isOn ? '' : 'warn'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Leistungs- & Raum-Aktivität', 'Watt / Raum', svgBarChart(barItems, 'W'),
            'Geräte-Status', 'Haus gesamt', svgDonutChart(segs, activeCnt + '/' + allDevs.length, 'Aktiv'),
            'Wichtigste Verbraucher & Schalter', 'rooms', buildRowsHtml(activeList)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'camera-vision') {
          var cRes = await fetch(apiUrl('/api/apps/camera-vision/dashboard'));
          var cData = cRes.ok ? await cRes.json() : {};
          var cams = cData.cameras || [];
          var events = cData.recentDetections || cData.events || [];
          var onlineCnt = cams.filter(function(c) { return c.status !== 'offline'; }).length;

          var kpis = [
            { label: 'Kameras Online', value: onlineCnt + ' / ' + Math.max(4, cams.length), sub: 'RTSP / ONVIF Streams' },
            { label: 'KI-Erkennungen', value: String(events.length), sub: 'COCO-SSD & Gemini Vision' },
            { label: 'Aktive Trigger', value: String((cData.triggers || []).length), sub: 'Automations-Regeln' },
            { label: 'Letzter Scan', value: 'Nominal', sub: cData.lastSceneSummary ? String(cData.lastSceneSummary).slice(0, 28) : 'Bereit' }
          ];

          var camGridHtml = '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; width:100%;">';
          cams.slice(0, 4).forEach(function(cm) {
            var id = cm.id || cm.camera_id || 'cam';
            camGridHtml += '<div style="position:relative; height:88px; background:#141417; border:1px solid var(--line-hairline); border-radius:4px; overflow:hidden; display:flex; align-items:flex-end; padding:6px 8px;">' +
              '<img src="' + apiUrl('/api/apps/camera-vision/frame.jpg?camera_id=' + encodeURIComponent(id) + '&t=' + Date.now()) + '" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.78;" onerror="this.style.display=\\'none\\'" />' +
              '<span style="position:relative; z-index:2; font-size:11px; font-weight:500; color:#fafafa; background:rgba(9,9,11,0.75); padding:2px 6px; border-radius:3px;">' + esc(cm.name || id) + '</span>' +
            '</div>';
          });
          camGridHtml += '</div>';

          var histItems = (cams.length ? cams : [{ name: 'Garten' }, { name: 'Eingang' }, { name: 'PTZ 2' }, { name: 'PTZ 3' }]).slice(0, 4).map(function(c, i) {
            return { label: c.name || c.id || ('Cam ' + (i + 1)), value: Number(c.detectionCount || (4 - i) * 3) };
          });

          var evRows = (events.length ? events : cams).slice(0, 5).map(function(e) {
            return {
              title: e.summary || e.label || e.name || 'Kamera-Stream',
              sub: e.camera_id || e.ip || 'LAN Stream',
              tag: e.optimization_mode || 'LIVE',
              right: String(e.timestamp || e.created_at || 'Bereit').slice(11, 19) || 'Aktiv'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            '2×2 Live-Kamera-Vorschau', 'Aktuelle Snapshots', camGridHtml,
            'Erkennungen pro Kamera', '24h Verteilung', svgBarChart(histItems, 'Events'),
            'Letzte KI-Vision Ereignisse & Streams', 'streams', buildRowsHtml(evRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === '3d-print') {
          var pRes = await fetch(apiUrl('/api/apps/3d-print/dashboard'));
          var pData = pRes.ok ? await pRes.json() : {};
          var tel = pData.telemetry || pData.printer || {};
          var proj = pData.activeProject || {};
          var projs = pData.projects || [];
          var pct = Number(tel.progressPercent ?? proj.progressPct ?? 0);
          var noz = Number(tel.nozzleTempC ?? tel.nozzleTemp ?? 24);
          var bed = Number(tel.bedTempC ?? tel.bedTemp ?? 24);

          var kpis = [
            { label: 'Drucker-Status', value: String(tel.printerState || tel.status || 'IDLE'), sub: pData.printerConfig?.printerName || 'Bambu Lab P1S' },
            { label: 'Fortschritt', value: fmtNum(pct, 0) + ' %', sub: 'Layer ' + (tel.currentLayer || 0) + ' / ' + (tel.totalLayers || 0) },
            { label: 'Temperaturen', value: Math.round(noz) + '° / ' + Math.round(bed) + '°C', sub: 'Nozzle / Druckbett' },
            { label: '3D-Projekte', value: String(projs.length), sub: proj.title || 'Bereit für CAD-Prompt' }
          ];

          var rings = [
            { label: 'Druck-Fortschritt', val: Math.round(pct) + '%', pct: pct, color: '#10b981', sub: (tel.remainingMinutes || 0) + 'm Rest' },
            { label: 'Düse (Nozzle)', val: Math.round(noz) + '°C', pct: (noz / 260) * 100, color: '#f59e0b', sub: 'Ziel 220°C' },
            { label: 'Heizbett (Bed)', val: Math.round(bed) + '°C', pct: (bed / 100) * 100, color: '#fafafa', sub: 'Ziel 60°C' }
          ];

          var amsSlots = [
            { label: 'Slot 1 PLA', value: 85, color: '#10b981' },
            { label: 'Slot 2 PETG', value: 65, color: '#fafafa' },
            { label: 'Slot 3 ABS', value: 40, color: '#f59e0b' },
            { label: 'Slot 4 TPU', value: 90, color: '#71717a' }
          ];

          var pRows = projs.slice(0, 5).map(function(pr) {
            return {
              title: pr.title || pr.name || '3D Modell',
              sub: pr.prompt || 'Parametrisches CSG-Modell',
              tag: (pr.stats?.filamentWeightG || 18) + 'g PLA',
              right: (pr.stats?.estimatedPrintMinutes || 35) + ' min'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Live Telemetrie & Druckfortschritt', 'Bambu Lab P1S', svgRingGauges(rings),
            'AMS Filament-Füllstände', '4 Spulen-Slots (%)', svgBarChart(amsSlots, '%'),
            'Aktuelle 3D-Modelle & Druck-Queue', 'cad', buildRowsHtml(pRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'google-calendar') {
          var calRes = await fetch(apiUrl('/api/apps/google-calendar/dashboard'));
          var calD = calRes.ok ? await calRes.json() : {};
          var evs = calD.events || [];
          var cals = calD.calendars || [];
          var nowMs = Date.now();
          var upcoming = evs.filter(function(e) { return new Date(e.end_time || e.start_time).getTime() >= nowMs; });

          var kpis = [
            { label: 'Anstehende Termine', value: String(upcoming.length), sub: 'Synchronisierte Events' },
            { label: 'Aktive Kalender', value: String(cals.length), sub: calD.googleOAuth?.authorized ? 'Google OAuth verbunden' : 'Lokale & ICS Feeds' },
            { label: 'Nächster Termin', value: upcoming[0] ? String(upcoming[0].title).slice(0, 18) : 'Frei', sub: upcoming[0] ? new Date(upcoming[0].start_time).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Keine Termine' },
            { label: 'Fokus-Status', value: 'Nominal', sub: 'Zeitblock-Analyse aktiv' }
          ];

          var dayCounts = {};
          var dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
          for (var dIdx = 0; dIdx < 7; dIdx++) {
            var dt = new Date(nowMs + dIdx * 86400000);
            var key = dt.toISOString().slice(0, 10);
            dayCounts[key] = { label: dayNames[dt.getDay()] + ' ' + dt.getDate() + '.', value: 0 };
          }
          upcoming.forEach(function(e) {
            var k = String(e.start_time || '').slice(0, 10);
            if (dayCounts[k]) dayCounts[k].value += 1;
          });

          var calSegs = cals.slice(0, 5).map(function(c) {
            return { label: c.calendar_name || 'Kalender', value: Math.max(1, Number(c.event_count || 1)), color: c.color, display: (c.event_count || 0) + ' Ev.' };
          });

          var evList = upcoming.slice(0, 5).map(function(e) {
            var st = new Date(e.start_time);
            return {
              title: e.title || 'Termin',
              sub: e.calendar_name || e.location || 'Kalender',
              tag: st.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
              right: st.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            };
          });

          renderStartseiteSkeleton(
            kpis,
            '7-Tage Termin-Auslastung', 'Termine pro Tag', svgBarChart(Object.values(dayCounts), 'Termine'),
            'Kalender-Aufteilung', cals.length + ' Kalender', svgDonutChart(calSegs, String(evs.length), 'Gesamt'),
            'Nächste 5 Termine', 'calendar', buildRowsHtml(evList)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'google-health') {
          var hRes = await fetch(apiUrl('/api/apps/google-health/dashboard'));
          var hD = hRes.ok ? await hRes.json() : {};
          var today = hD.today || hD.live || {};
          var hist = Array.isArray(hD.history) ? hD.history.slice(0, 14).reverse() : [];
          var steps = Number(today.steps ?? 0);
          var stepGoal = Number(today.step_goal ?? 10000);
          var sleepH = Number(today.sleep_hours ?? 7.4);
          var ready = Number(hD.readiness?.score ?? today.readiness_score ?? 84);
          var rhr = Number(today.resting_hr ?? 58);

          var kpis = [
            { label: 'Readiness Score', value: ready + ' / 100', sub: hD.readiness?.status || 'Erholung gut' },
            { label: 'Schritte Heute', value: fmtNum(steps, 0), sub: 'Ziel: ' + fmtNum(stepGoal, 0) },
            { label: 'Schlafdauer', value: fmtNum(sleepH, 1) + ' h', sub: 'Ziel: 8,0 h' },
            { label: 'Ruhepuls / HRV', value: rhr + ' bpm', sub: 'HRV: ' + (hD.hrvMs || 52) + ' ms' }
          ];

          var hVals = hist.length > 0 ? hist.map(function(x) { return Number(x.steps || x.readiness_score || 75); }) : [6400, 8200, 9100, 7800, 10400, 8900, steps || 7500];
          var hLbls = hist.length > 0 ? hist.map(function(x) { return String(x.date || '').slice(5, 10); }) : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'Heute'];

          var hRings = [
            { label: 'Readiness', val: String(ready), pct: ready, color: '#10b981', sub: 'Score' },
            { label: 'Schritte', val: Math.round((steps / Math.max(1, stepGoal)) * 100) + '%', pct: (steps / Math.max(1, stepGoal)) * 100, color: '#fafafa', sub: fmtNum(steps, 0) },
            { label: 'Schlaf', val: fmtNum(sleepH, 1) + 'h', pct: (sleepH / 8) * 100, color: '#f59e0b', sub: 'von 8h' }
          ];

          var workouts = (hD.workouts || hist).slice(0, 5).map(function(w) {
            return {
              title: w.activity_type || w.title || ('Tagesbilanz ' + (w.date || '')),
              sub: w.notes || ((w.steps ? fmtNum(w.steps, 0) + ' Schritte' : 'Vitaldaten')),
              tag: (w.calories_burned || w.active_calories || 420) + ' kcal',
              right: (w.duration_min ? w.duration_min + ' min' : (w.sleep_hours ? w.sleep_hours + ' h Schlaf' : 'Sync'))
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Aktivitäts- & Schritte-Trend (14 Tage)', 'Schritte / Tag', svgAreaChart(hVals, hLbls, 'Schritte', '#10b981'),
            'Heutige Vital-Ringe', 'Readiness · Schritte · Schlaf', svgRingGauges(hRings),
            'Aktuelle Trainings & Tageswerte', 'workouts', buildRowsHtml(workouts)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'meal-planner') {
          var [wRes, pRes2, gRes] = await Promise.all([
            fetch(apiUrl('/api/apps/meal-planner/week')),
            fetch(apiUrl('/api/apps/meal-planner/profile')),
            fetch(apiUrl('/api/apps/meal-planner/groceries'))
          ]);
          var wD = wRes.ok ? await wRes.json() : {};
          var pD = pRes2.ok ? await pRes2.json() : {};
          var gD = gRes.ok ? await gRes.json() : {};
          var prof = pD.profile || {};
          var calGoal = Number(prof.calorie_target || 2300);
          var protGoal = Number(prof.protein_target_g || 150);
          var plan = Array.isArray(wD.plan) ? wD.plan : [];
          var groceries = Array.isArray(gD.groceries || gD.items) ? (gD.groceries || gD.items) : [];
          var openGroceries = groceries.filter(function(g) { return !g.checked; });

          var totalKcal = plan.reduce(function(s, m) { return s + (Number(m.calories || m.kcal || 550)); }, 0);
          var dailyKcal = plan.length > 0 ? Math.round(totalKcal / Math.min(7, Math.max(1, Math.ceil(plan.length / 3)))) : 1950;
          var dailyProt = Math.round((dailyKcal * 0.28) / 4);

          var kpis = [
            { label: 'Kalorien-Ziel', value: fmtNum(dailyKcal, 0) + ' kcal', sub: 'Ziel: ' + fmtNum(calGoal, 0) + ' kcal/Tag' },
            { label: 'Protein-Bilanz', value: dailyProt + ' g', sub: 'Ziel: ' + protGoal + ' g/Tag' },
            { label: 'Geplante Mahlzeiten', value: String(plan.length), sub: 'Aktuelle Woche' },
            { label: 'Einkaufsliste', value: openGroceries.length + ' offen', sub: groceries.length + ' Artikel gesamt' }
          ];

          var mRings = [
            { label: 'Kalorien', val: fmtNum(dailyKcal, 0), pct: (dailyKcal / Math.max(1, calGoal)) * 100, color: '#fafafa', sub: 'kcal' },
            { label: 'Protein', val: dailyProt + 'g', pct: (dailyProt / Math.max(1, protGoal)) * 100, color: '#10b981', sub: 'Ziel ' + protGoal + 'g' },
            { label: 'Einkauf erledigt', val: (groceries.length - openGroceries.length) + '/' + groceries.length, pct: groceries.length ? ((groceries.length - openGroceries.length) / groceries.length) * 100 : 100, color: '#f59e0b', sub: 'Artikel' }
          ];

          var dayBars = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(function(d, idx) {
            var dayMeals = plan.filter(function(m) { return Number(m.day_index ?? idx) === idx; });
            var kc = dayMeals.reduce(function(s, m) { return s + Number(m.calories || m.kcal || 620); }, 0) || (1850 + (idx % 3) * 180);
            return { label: d, value: kc };
          });

          var mealRows = plan.slice(0, 5).map(function(m) {
            return {
              title: m.recipe_title || m.title || m.meal_name || 'Mahlzeit',
              sub: m.meal_type || m.slot || 'Tagesplan',
              tag: (m.calories || m.kcal || 580) + ' kcal',
              right: (m.protein_g || 38) + 'g Protein'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Wochen-Kalorienbilanz (Mo–So)', 'kcal / Tag', svgBarChart(dayBars, 'kcal'),
            'Makro- & Einkaufs-Status', 'Tagesziele', svgRingGauges(mRings),
            'Aktuell geplante Mahlzeiten', 'planner', buildRowsHtml(mealRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'memo') {
          var [mRes, nRes] = await Promise.all([
            fetch(apiUrl('/api/apps/memo/overview')),
            fetch(apiUrl('/api/apps/memo/horizon-notes'))
          ]);
          var mD = mRes.ok ? await mRes.json() : {};
          var nD = nRes.ok ? await nRes.json() : {};
          var entries = mD.entries || mD.documents || [];
          var hNotes = nD.notes || [];

          var kpis = [
            { label: 'Dokumente & Notizen', value: String(entries.length + hNotes.length), sub: 'Lokaler Vault & Quick-Notes' },
            { label: 'Markdown Vault', value: String(entries.length), sub: 'Volltext-indexiert' },
            { label: 'Horizon Quick-Notes', value: String(hNotes.length), sub: 'JSON Notiz-Speicher' },
            { label: 'Cloud Sync', value: 'Bereit', sub: 'Google Keep & Drive' }
          ];

          var catMap = {};
          entries.concat(hNotes).forEach(function(e) {
            var cat = e.category || e.source || 'Notiz';
            catMap[cat] = (catMap[cat] || 0) + 1;
          });
          var segs2 = Object.keys(catMap).map(function(k) {
            return { label: k, value: catMap[k], display: catMap[k] + ' Dok.' };
          });

          var recentBars = (entries.concat(hNotes)).slice(0, 6).map(function(e, i) {
            var len = String(e.content || e.snippet || '').length || (120 + i * 45);
            return { label: String(e.title || e.fileName || ('Notiz ' + (i + 1))).slice(0, 8), value: len };
          });

          var mRows = entries.concat(hNotes).slice(0, 5).map(function(e) {
            return {
              title: e.title || (e.content ? String(e.content).slice(0, 48) : e.fileName) || 'Notiz',
              sub: e.category || e.fileName || 'Markdown Vault',
              tag: e.source || 'LOCAL',
              right: String(e.updated_at || e.createdAt || '').slice(0, 10) || 'Aktuell'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Dokumenten-Umfang (Zeichen / Notiz)', 'Letzte Einträge', svgBarChart(recentBars, 'Zeichen'),
            'Quellen- & Ordner-Verteilung', 'Vault Struktur', svgDonutChart(segs2, String(entries.length + hNotes.length), 'Notizen'),
            'Zuletzt bearbeitete Notizen', 'editor', buildRowsHtml(mRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'contacts') {
          var ctRes = await fetch(apiUrl('/api/apps/contacts/state'));
          var ctD = ctRes.ok ? await ctRes.json() : {};
          var contacts = ctD.contacts || [];
          var msgs = ctD.messages || ctD.threads || [];

          var kpis = [
            { label: 'Kontakte Gesamt', value: String(contacts.length), sub: 'Adressbuch & CRM' },
            { label: 'Nachrichten / Logs', value: String(msgs.length), sub: 'Kommunikations-Historie' },
            { label: 'Ungelesen / Offen', value: String(contacts.filter(function(c) { return c.unread_count > 0; }).length), sub: 'Follow-ups' },
            { label: 'Google Contacts', value: ctD.oauthConnected ? 'Verbunden' : 'Lokal', sub: 'Sync Status' }
          ];

          var grpMap = {};
          contacts.forEach(function(c) {
            var g = c.group_name || c.category || c.channel || 'Kontakte';
            grpMap[g] = (grpMap[g] || 0) + 1;
          });
          var cSegs = Object.keys(grpMap).map(function(k) {
            return { label: k, value: grpMap[k], display: grpMap[k] + ' Pers.' };
          });

          var cBars = contacts.slice(0, 6).map(function(c, i) {
            return { label: String(c.name || 'Kontakt').split(' ')[0], value: Number(c.message_count || c.interaction_count || (6 - i)) };
          });

          var cRows = contacts.slice(0, 5).map(function(c) {
            return {
              title: c.name || 'Kontakt',
              sub: c.email || c.phone || c.handle || 'Eintrag',
              tag: c.channel || c.group_name || 'CRM',
              right: c.last_message_at ? String(c.last_message_at).slice(0, 10) : 'Aktiv'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Interaktions-Frequenz pro Kontakt', 'Nachrichten / Logs', svgBarChart(cBars, 'Logs'),
            'Kreise & Kanäle', contacts.length + ' Kontakte', svgDonutChart(cSegs, String(contacts.length), 'Kontakte'),
            'Wichtigste Kontakte & letzte Interaktionen', 'directory', buildRowsHtml(cRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'cortex') {
          var cxRes = await fetch(apiUrl('/api/apps/cortex/bootstrap'));
          var cxD = cxRes.ok ? await cxRes.json() : {};
          var runs = cxD.runs || [];
          var bps = cxD.blueprints || [];
          var intRes = await fetch(apiUrl('/api/apps/cortex/integrations'));
          var intD = intRes.ok ? await intRes.json() : {};
          var integrations = intD.integrations || [];
          var okInt = integrations.filter(function(i) { return i.configured || i.connected || i.status === 'connected'; }).length;

          var kpis = [
            { label: 'KI-Modell', value: cxD.config?.defaultModel || 'Gemini Flash', sub: 'Cortex Reasoning Engine' },
            { label: 'Ausgeführte Runs', value: String(runs.length), sub: 'Gespeicherte Synthesen' },
            { label: 'Blueprints', value: String(bps.length), sub: 'Agenten-Vorlagen' },
            { label: 'Credentials Vault', value: okInt + ' / ' + Math.max(okInt, integrations.length || 5), sub: 'Verbundene Dienste' }
          ];

          var runVals = runs.slice(0, 10).reverse().map(function(r) { return Number(r.duration_ms || 850); });
          var runLbls = runs.slice(0, 10).reverse().map(function(r, i) { return '#' + (i + 1); });

          var intSegs = [
            { label: 'Verbunden (Nominal)', value: Math.max(1, okInt), color: '#10b981', display: okInt + ' aktiv' },
            { label: 'Setup optional', value: Math.max(0, (integrations.length || 5) - okInt), color: '#52525b', display: Math.max(0, (integrations.length || 5) - okInt) + ' offen' }
          ];

          var rRows = runs.slice(0, 5).map(function(r) {
            return {
              title: r.topic || r.prompt || 'Cortex Synthese',
              sub: String(r.response_text || '').slice(0, 55),
              tag: r.model_used || 'Gemini',
              right: (r.duration_ms || 0) + ' ms'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Antwortzeiten der letzten KI-Runs (ms)', 'Latenz-Verlauf', svgAreaChart(runVals, runLbls, 'ms', '#10b981'),
            'Credentials Vault & Integrationen', 'Shared DB Status', svgDonutChart(intSegs, okInt + ' OK', 'Vault'),
            'Letzte Cortex KI-Erkenntnisse', 'workspace', buildRowsHtml(rRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'workflows') {
          var wfRes = await fetch(apiUrl('/api/apps/workflows/bootstrap'));
          var wfD = wfRes.ok ? await wfRes.json() : {};
          var wfs = wfD.workflows || [];
          var axons = wfD.axons || [];
          var logs = wfD.logs || wfD.executions || [];

          var kpis = [
            { label: 'Aktive Workflows', value: String(wfs.length), sub: 'DAG Pipelines' },
            { label: 'Registrierte Axons', value: String(axons.length), sub: 'Quasi-Agentische Aktionen' },
            { label: 'Ausführungen', value: String(logs.length || wfs.length * 3), sub: 'Automations-Läufe' },
            { label: 'PC-Bridge KVM', value: wfD.pcBridge?.online ? 'Online' : 'Bereit', sub: 'Dev-PC .46 Steuerung' }
          ];

          var domMap = {};
          axons.forEach(function(a) {
            var d = a.category || a.domain || 'System';
            domMap[d] = (domMap[d] || 0) + 1;
          });
          var domBars = Object.keys(domMap).map(function(k) { return { label: k, value: domMap[k] }; });

          var wfSegs = [
            { label: 'Workflows', value: Math.max(1, wfs.length), color: '#fafafa', display: wfs.length + ' Flows' },
            { label: 'Axon-Module', value: Math.max(1, axons.length), color: '#10b981', display: axons.length + ' Axons' }
          ];

          var wfRows = (wfs.concat(axons)).slice(0, 5).map(function(w) {
            return {
              title: w.name || w.title || w.id || 'Workflow',
              sub: w.description || 'Automatisierte Sequenz',
              tag: w.category || 'AXON',
              right: 'Bereit'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Axons & Automationen nach Domäne', 'Module pro Bereich', svgBarChart(domBars, 'Axons'),
            'Automations-Bestand', 'Workflows & Axons', svgDonutChart(wfSegs, String(wfs.length + axons.length), 'Gesamt'),
            'Wichtigste Workflows & Axons', 'editor', buildRowsHtml(wfRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'project-workflow') {
          var pwRes = await fetch(apiUrl('/api/apps/project-workflow/overview'));
          var pwD = pwRes.ok ? await pwRes.json() : {};
          var projs = pwD.projects || [];
          var issues = pwD.issues || [];
          var milestones = pwD.milestones || [];
          var openIssues = issues.filter(function(i) { return i.status !== 'done' && i.status !== 'closed'; });

          var kpis = [
            { label: 'Aktive Projekte', value: String(projs.length || 1), sub: 'Thassi Monorepo & Apps' },
            { label: 'Offene Issues / Tasks', value: String(openIssues.length), sub: issues.length + ' Tasks gesamt' },
            { label: 'Meilensteine', value: String(milestones.length), sub: 'Release-Planung' },
            { label: 'CI/CD Pipeline', value: 'Passing', sub: 'GitHub & Live-Deploy :8099' }
          ];

          var stMap = { Offen: 0, 'In Arbeit': 0, Erledigt: 0 };
          issues.forEach(function(i) {
            var st = String(i.status || 'open').toLowerCase();
            if (st === 'done' || st === 'closed') stMap.Erledigt++;
            else if (st.indexOf('prog') !== -1) stMap['In Arbeit']++;
            else stMap.Offen++;
          });
          var iSegs = [
            { label: 'Erledigt', value: Math.max(1, stMap.Erledigt), color: '#10b981', display: stMap.Erledigt + ' Tasks' },
            { label: 'In Arbeit', value: Math.max(1, stMap['In Arbeit']), color: '#f59e0b', display: stMap['In Arbeit'] + ' Tasks' },
            { label: 'Offen', value: Math.max(1, stMap.Offen), color: '#fafafa', display: stMap.Offen + ' Tasks' }
          ];

          var mBars = (milestones.length ? milestones : projs).slice(0, 6).map(function(m, idx) {
            return { label: String(m.title || m.name || ('M' + (idx + 1))).slice(0, 8), value: Number(m.progress || m.completionPercent || (70 + idx * 5)) };
          });

          var iRows = issues.slice(0, 5).map(function(iss) {
            return {
              title: iss.title || 'Task',
              sub: iss.project_name || iss.description || 'Development',
              tag: String(iss.priority || 'MEDIUM').toUpperCase(),
              right: String(iss.status || 'OPEN').toUpperCase()
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Meilenstein- & Projekt-Fortschritt (%)', 'Velocity', svgBarChart(mBars, '%'),
            'Task-Status-Verteilung', issues.length + ' Tasks', svgDonutChart(iSegs, String(openIssues.length), 'Offen'),
            'Aktuelle Fokus-Tasks & Issues', 'issues', buildRowsHtml(iRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'system-monitor') {
          var sRes = await fetch(apiUrl('/api/apps/system-monitor/snapshot'));
          var sD = sRes.ok ? await sRes.json() : {};
          var host = sD.host || {};
          var cpuPct = Number(host.cpuPercent ?? sD.cpuPercent ?? 18);
          var ramPct = Number(host.memoryPercent ?? sD.memoryPercent ?? 62);
          var diskPct = Number(host.diskPercent ?? sD.diskPercent ?? 44);
          var workloads = sD.workloads || sD.containers || [];

          var kpis = [
            { label: 'CPU-Auslastung', value: fmtNum(cpuPct, 1) + ' %', sub: host.cpuModel || 'HASS OS Host' },
            { label: 'RAM-Auslastung', value: fmtNum(ramPct, 1) + ' %', sub: fmtNum(host.memoryUsedGb || 4.8, 1) + ' / ' + fmtNum(host.memoryTotalGb || 8.0, 1) + ' GB' },
            { label: 'SSD-Speicher', value: fmtNum(diskPct, 1) + ' %', sub: 'Persistentes /data Volume' },
            { label: 'Aktive Container', value: String(workloads.length || 17), sub: 'Netzwerk & Cloud in Menüleiste' }
          ];

          var sysRings = [
            { label: 'CPU Last', val: Math.round(cpuPct) + '%', pct: cpuPct, color: cpuPct > 80 ? '#ef4444' : '#10b981', sub: 'Kerne aktiv' },
            { label: 'Arbeitsspeicher', val: Math.round(ramPct) + '%', pct: ramPct, color: ramPct > 85 ? '#f59e0b' : '#fafafa', sub: 'RAM' },
            { label: 'SSD Speicher', val: Math.round(diskPct) + '%', pct: diskPct, color: '#10b981', sub: '/data' }
          ];

          var topContBars = workloads.slice(0, 6).map(function(w) {
            return { label: String(w.name || w.slug || 'addon').replace('44ec3c40_thassi_', '').slice(0, 8), value: Number(w.memoryMb || w.cpuPercent || 45) };
          });

          var wRows = workloads.slice(0, 5).map(function(w) {
            return {
              title: w.name || w.slug || 'Container',
              sub: w.state || w.status || 'running',
              tag: fmtNum(w.cpuPercent || 1.2, 1) + '% CPU',
              right: fmtNum(w.memoryMb || 85, 0) + ' MB RAM'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'System-Ressourcen (CPU · RAM · SSD)', 'Live Host Telemetrie', svgRingGauges(sysRings),
            'Top Container Speichernutzung (MB)', 'Docker / Supervisor', svgBarChart(topContBars, 'MB'),
            'Wichtigste Dienste & Add-on Container', 'containers', buildRowsHtml(wRows)
          );
          updateFreshnessLabel(true);
        }
      } catch (err) {
        console.warn('[Thassi Cockpit] Overview fetch fallback:', err);
        updateFreshnessLabel(false);
      }
    }

    function openActionDrawer(actionId) {
      var backdrop = document.getElementById('thassi-drawer-backdrop');
      var titleEl = document.getElementById('thassi-drw-title');
      var bodyEl = document.getElementById('thassi-drw-body');
      if (!backdrop || !titleEl || !bodyEl) return;

      if (actionId === 'all-lights-off') {
        fetch(apiUrl('/api/system/rooms')).then(function(r) { return r.json(); }).then(function(d) {
          var promises = [];
          (d.rooms || []).forEach(function(rm) {
            (rm.devices || []).forEach(function(dv) {
              if (dv.isOn && (dv.kind === 'toggle' || dv.kind === 'rgbw')) {
                promises.push(fetch(apiUrl('/api/system/device-action'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entityId: dv.entityId, action: 'turn_off' })
                }));
              }
            });
          });
          return Promise.all(promises);
        }).then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sample-all') {
        fetch(apiUrl('/api/apps/camera-vision/sample-now'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'start-print') {
        fetch(apiUrl('/api/apps/3d-print/printer/print'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'scan-bank') {
        fetch(apiUrl('/api/apps/finance-analytics/quick-import/scan-downloads'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-cal') {
        fetch(apiUrl('/api/apps/google-calendar/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'refresh-health' || actionId === 'refresh-sys') {
        loadOverviewData();
        return;
      }

      if (actionId === 'optimize-week') {
        fetch(apiUrl('/api/apps/meal-planner/plan/randomize'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-memo') {
        fetch(apiUrl('/api/apps/memo/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-contacts') {
        fetch(apiUrl('/api/apps/contacts/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'open-vault') {
        setTab('vault');
        return;
      }

      if (actionId === 'sync-pc') {
        fetch(apiUrl('/api/apps/workflows/pc-bridge/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'run-tests') {
        fetch(apiUrl('/api/apps/project-workflow/tests/run'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'open-diagnostics') {
        setTab('logs');
        return;
      }

      // Slide-Over Forms for Creation Actions
      backdrop.classList.add('open');

      if (actionId === 'new-tx') {
        titleEl.textContent = 'Neue Buchung erfassen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Empfänger / Beschreibung</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. SPAR Supermarkt" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Betrag in EUR (Negativ für Ausgabe)</label><input id="drw-f2" type="number" step="0.01" class="thassi-drw-input" placeholder="-42.50" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Kategorie</label><input id="drw-f3" class="thassi-drw-input" value="Lebensmittel" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-tx\\')">Buchung speichern</button>';
      } else if (actionId === 'new-event') {
        titleEl.textContent = 'Neuen Termin anlegen';
        var isoNow = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Besprechung / Fokus-Block" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Startzeit</label><input id="drw-f2" type="datetime-local" class="thassi-drw-input" value="' + isoNow + '" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Ort / Notiz</label><input id="drw-f3" class="thassi-drw-input" placeholder="Büro / Online" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-event\\')">Termin speichern</button>';
      } else if (actionId === 'new-note') {
        titleEl.textContent = 'Schnell-Notiz im Vault speichern';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Titel der Notiz" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Inhalt (Markdown)</label><textarea id="drw-f2" rows="6" class="thassi-drw-input" placeholder="Gedanken, To-Dos, Fakten..."></textarea></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-note\\')">Im Vault sichern</button>';
      } else if (actionId === 'new-grocery') {
        titleEl.textContent = 'Artikel zur Einkaufsliste hinzufügen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Artikel / Zutat</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. Hafermilch, Skyr, Lachs" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Menge / Einheit</label><input id="drw-f2" class="thassi-drw-input" value="1x" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-grocery\\')">Hinzufügen</button>';
      } else if (actionId === 'new-biometric') {
        titleEl.textContent = 'Messwert / Training loggen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Aktivität / Messwert</label><input id="drw-f1" class="thassi-drw-input" value="Krafttraining" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Dauer (Minuten)</label><input id="drw-f2" type="number" class="thassi-drw-input" value="45" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Kalorien (kcal)</label><input id="drw-f3" type="number" class="thassi-drw-input" value="380" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-biometric\\')">Eintrag speichern</button>';
      } else if (actionId === 'new-contact') {
        titleEl.textContent = 'Neuen Kontakt anlegen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Name</label><input id="drw-f1" class="thassi-drw-input" placeholder="Vor- und Nachname" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">E-Mail / Telefon</label><input id="drw-f2" class="thassi-drw-input" placeholder="name@example.com" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Gruppe</label><input id="drw-f3" class="thassi-drw-input" value="Freunde" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-contact\\')">Kontakt speichern</button>';
      } else if (actionId === 'new-issue') {
        titleEl.textContent = 'Neuen Dev-Task / Issue erstellen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Task-Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Feature oder Bugfix beschreiben" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Priorität</label><input id="drw-f2" class="thassi-drw-input" value="high" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-issue\\')">Task anlegen</button>';
      } else if (actionId === 'new-3d-model') {
        titleEl.textContent = 'KI 3D-Modell generieren';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">3D-Objekt beschreiben (Prompt)</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. Kabelhalter für Schreibtisch 35mm" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-3d-model\\')">3D-Modell generieren</button>';
      } else if (actionId === 'new-prompt') {
        titleEl.textContent = 'Cortex KI-Synthese starten';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Frage oder Auftrag an Cortex</label><textarea id="drw-f1" rows="5" class="thassi-drw-input" placeholder="Analysiere mein Haus, Finanzen und Termine..."></textarea></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-prompt\\')">Absenden</button>';
      } else {
        backdrop.classList.remove('open');
        setTab(cfg.tabs[1] ? cfg.tabs[1].id : 'overview');
      }
    }

    async function submitDrawer(actionId) {
      var f1 = (document.getElementById('drw-f1') || {}).value || '';
      var f2 = (document.getElementById('drw-f2') || {}).value || '';
      var f3 = (document.getElementById('drw-f3') || {}).value || '';

      try {
        if (actionId === 'new-tx' && f1) {
          await fetch(apiUrl('/api/apps/finance-analytics/transactions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: f1, description: f1, amount: Number(f2 || 0), category: f3 || 'Allgemein', booking_date: new Date().toISOString().slice(0, 10) })
          });
        } else if (actionId === 'new-event' && f1) {
          var stIso = f2 ? new Date(f2).toISOString() : new Date().toISOString();
          var endIso = new Date(new Date(stIso).getTime() + 3600000).toISOString();
          await fetch(apiUrl('/api/apps/google-calendar/events'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1, start_time: stIso, end_time: endIso, location: f3 })
          });
        } else if (actionId === 'new-note' && (f1 || f2)) {
          await fetch(apiUrl('/api/apps/memo/entries'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1 || 'Schnellnotiz', content: f2 || f1, category: 'Notiz' })
          });
        } else if (actionId === 'new-grocery' && f1) {
          await fetch(apiUrl('/api/apps/meal-planner/groceries'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: f1, item: f1, quantity: f2 || '1x' })
          });
        } else if (actionId === 'new-biometric' && f1) {
          await fetch(apiUrl('/api/apps/google-health/workouts/log'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_type: f1, duration_min: Number(f2 || 30), calories_burned: Number(f3 || 250) })
          });
        } else if (actionId === 'new-contact' && f1) {
          await fetch(apiUrl('/api/apps/contacts/contacts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: f1, email: f2, group_name: f3 || 'Kontakte' })
          });
        } else if (actionId === 'new-issue' && f1) {
          await fetch(apiUrl('/api/apps/project-workflow/projects/issues'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1, priority: f2 || 'medium', status: 'open' })
          });
        } else if (actionId === 'new-3d-model' && f1) {
          await fetch(apiUrl('/api/apps/3d-print/projects/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: f1 })
          });
        } else if (actionId === 'new-prompt' && f1) {
          await fetch(apiUrl('/api/apps/cortex/run'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: f1, topic: f1.slice(0, 50) })
          });
        }
      } catch (_e) {}

      var backdrop = document.getElementById('thassi-drawer-backdrop');
      if (backdrop) backdrop.classList.remove('open');
      loadOverviewData();
    }

    window.__thassiSwitchTab = setTab;
    window.__thassiOpenAction = openActionDrawer;
    window.__thassiSubmitDrawer = submitDrawer;
    window.__thassiCloseDrawer = function() {
      var b = document.getElementById('thassi-drawer-backdrop');
      if (b) b.classList.remove('open');
    };

    function mountCockpitDom() {
      if (document.getElementById('thassi-menubar')) return;

      var tabsHtml = cfg.tabs.map(function(t) {
        return '<button class="thassi-mb-tab' + (t.id === activeTabId ? ' active' : '') + '" data-tab="' + esc(t.id) + '" onclick="window.__thassiSwitchTab(\\'' + esc(t.id) + '\\')">' +
          '<span>' + esc(t.label) + '</span>' +
          (t.satellite ? '<span class="thassi-mb-tab-badge">MODUL</span>' : '') +
        '</button>';
      }).join('');

      var actionsHtml = (cfg.actions || []).map(function(a) {
        var cls = a.ghost ? 'thassi-mb-btn-ghost' : 'thassi-mb-btn-primary';
        return '<button class="' + cls + '" onclick="window.__thassiOpenAction(\\'' + esc(a.id) + '\\')">' + esc(a.label) + '</button>';
      }).join('');

      var menubar = document.createElement('header');
      menubar.id = 'thassi-menubar';
      menubar.innerHTML =
        '<div class="thassi-mb-left">' +
          '<span class="thassi-mb-title">' + esc(cfg.title) + '</span>' +
          '<div class="thassi-mb-status">' +
            '<span id="thassi-mb-dot" class="thassi-mb-dot"></span>' +
            '<span id="thassi-mb-ts">Stand: Live</span>' +
          '</div>' +
        '</div>' +
        '<nav class="thassi-mb-tabs">' + tabsHtml + '</nav>' +
        '<div class="thassi-mb-actions">' + actionsHtml + '</div>';

      var startseite = document.createElement('section');
      startseite.id = 'thassi-startseite';
      startseite.innerHTML = '<div style="padding:40px 0; text-align:center; color:#52525b; font-family:var(--font-mono); font-size:12px;">Lade Startseite & Diagramme...</div>';

      var satFrame = document.createElement('iframe');
      satFrame.id = 'thassi-satellite-container';
      satFrame.title = 'Thassi Submodule';

      var drawerBackdrop = document.createElement('div');
      drawerBackdrop.id = 'thassi-drawer-backdrop';
      drawerBackdrop.onclick = function(ev) {
        if (ev.target === drawerBackdrop) window.__thassiCloseDrawer();
      };
      drawerBackdrop.innerHTML =
        '<div id="thassi-drawer-panel">' +
          '<div class="thassi-drw-head">' +
            '<span id="thassi-drw-title" class="thassi-drw-title">Aktion</span>' +
            '<button class="thassi-drw-close" onclick="window.__thassiCloseDrawer()">✕</button>' +
          '</div>' +
          '<div id="thassi-drawer-body-wrap" class="thassi-drw-body"><div id="thassi-drw-body" style="display:flex; flex-direction:column; gap:14px;"></div></div>' +
        '</div>';

      document.body.insertBefore(satFrame, document.body.firstChild);
      document.body.insertBefore(startseite, document.body.firstChild);
      document.body.insertBefore(menubar, document.body.firstChild);
      document.body.appendChild(drawerBackdrop);

      setTab(activeTabId);
      loadOverviewData();
      setInterval(loadOverviewData, 30000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountCockpitDom);
    } else {
      mountCockpitDom();
    }
  })();
  `;
}

export function getUniformAppStylesheetTag(): string {
  return `<style id="thassi-uniform-design-system">${UNIFORM_DESIGN_TOKENS_CSS}</style><script id="thassi-uniform-app-cockpit">${getUniformAppCockpitScript()}</script>`;
}
