import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function parseCsv(csvText, explicitDelimiter) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return { headers: [], rows: [], delimiter: explicitDelimiter || "," };
  }
  const firstLine = normalized.split("\n")[0] || "";
  const delimiter = explicitDelimiter || (firstLine.split(";").length > firstLine.split(",").length ? ";" : firstLine.split("	").length > firstLine.split(",").length ? "	" : ",");
  const parsedRows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== "")) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== "")) {
      parsedRows.push(currentRow);
    }
  }
  if (parsedRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }
  const headers = parsedRows[0].map((h, idx) => sanitizeIdentifier(h || `col_${idx + 1}`, idx));
  const rows = parsedRows.slice(1);
  return { headers, rows, delimiter };
}
function sanitizeIdentifier(raw, fallbackIndex = 0) {
  const cleaned = raw.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `col_${cleaned || fallbackIndex}`;
  }
  return cleaned;
}

// packages/sdk/src/actions.ts
import fs2 from "node:fs";
import path2 from "node:path";
import net from "node:net";
import dgram from "node:dgram";
var PcAgentReverseBridgeImpl = class {
  latestStatus = null;
  lastSeenAt = 0;
  latestFrameJpeg = null;
  requestedMonitor = "primary";
  queue = [];
  resolvers = /* @__PURE__ */ new Map();
  ingestSync(body) {
    this.lastSeenAt = Date.now();
    if (body.status && typeof body.status === "object") {
      this.latestStatus = body.status;
    }
    if (body.frameBase64 && typeof body.frameBase64 === "string") {
      this.latestFrameJpeg = Buffer.from(body.frameBase64, "base64");
    }
    const commands = this.queue.splice(0, this.queue.length);
    return {
      requestedMonitor: this.requestedMonitor,
      commands
    };
  }
  resolveCommand(id, result, error) {
    const pending = this.resolvers.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.resolvers.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
  async getStatusOrCall(baseUrl) {
    if (this.latestStatus && Date.now() - this.lastSeenAt < 15e3) {
      return this.latestStatus;
    }
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1200)
      });
      if (res.ok) {
        const snap = await res.json();
        this.latestStatus = snap;
        this.lastSeenAt = Date.now();
        return snap;
      }
    } catch {
    }
    if (this.latestStatus) {
      return this.latestStatus;
    }
    throw new Error("Thassi.PcAgent on DESKTOP-M8TJERB is currently offline or unreachable.");
  }
  async callEndpoint(baseUrl, endpoint, payload, timeoutMs = 8e3) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(700)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
    }
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(id);
        reject(new Error(`Timeout waiting for Thassi.PcAgent (${endpoint}) after ${timeoutMs}ms`));
      }, timeoutMs);
      this.resolvers.set(id, { resolve, reject, timer });
      this.queue.push({ id, endpoint, payload, createdAt: Date.now() });
    });
  }
};
var PcAgentReverseBridge = new PcAgentReverseBridgeImpl();

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// thassi_host/src/hass-sidebar-sync.ts
import fs3 from "node:fs";
import path3 from "node:path";

// thassi_host/src/thassi-uniform-ui.ts
var UNIFORM_DESIGN_TOKENS_CSS = `
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
   * TOP MEN\xDCLEISTE (48px Sticky Swiss Hairline Navigation & Action Bar)
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
   * STARTSEITE (3-Block-Fokus: 1. KPI-Leiste \xB7 2. Diagramme \xB7 3. Fokus-Kurzliste)
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

  /* Block 3: Kompakte Fokus-Kurzliste (Max 5 Eintr\xE4ge) */
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

// thassi_host/src/hass-sidebar-sync.ts
function getHassSidebarStylerScript() {
  const escapedUniformCss = JSON.stringify(UNIFORM_DESIGN_TOKENS_CSS);
  return `
  (function initThassiHassSidebarStyler() {
    try {
      if (!window.__THASSI_INGRESS_FETCH_WRAPPED__ && typeof window.fetch === 'function') {
        window.__THASSI_INGRESS_FETCH_WRAPPED__ = true;
        const _origFetch = window.fetch.bind(window);
        window.fetch = function(input, init) {
          try {
            const p = window.location.pathname || '';
            const m = p.match(/^(\\/api\\/hassio_ingress\\/[^/]+)/);
            const prefix = (window.__THASSI_INGRESS_PATH__ || (m ? m[1] : '')).replace(/\\/+$/, '');
            if (prefix && typeof input === 'string' && (input.startsWith('/api/apps/') || input.startsWith('/api/system/'))) {
              input = prefix + input;
            }
          } catch (_e) {}
          return _origFetch(input, init);
        };
      }
    } catch (_err) {}

    const SUBTLE_BAR_BG = '#09090b';
    const UNIFORM_APP_CSS = ${escapedUniformCss};

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #09090b !important;
        --secondary-background-color: #111113 !important;
        --card-background-color: #111113 !important;
        --ha-card-background: #111113 !important;
        --ha-card-border-color: rgba(255, 255, 255, 0.06) !important;
        --ha-card-border-width: 1px !important;
        --ha-card-border-radius: 4px !important;
        --ha-card-box-shadow: none !important;
        --sidebar-background-color: \${SUBTLE_BAR_BG} !important;
        --sidebar-text-color: #a1a1aa !important;
        --sidebar-icon-color: #71717a !important;
        --sidebar-selected-text-color: #fafafa !important;
        --sidebar-selected-icon-color: #fafafa !important;
        --primary-color: #fafafa !important;
        --accent-color: #10b981 !important;
        --divider-color: rgba(255, 255, 255, 0.06) !important;
        --app-header-background-color: \${SUBTLE_BAR_BG} !important;
        --app-header-text-color: #fafafa !important;
        --mdc-theme-primary: #fafafa !important;
        --mdc-theme-surface: \${SUBTLE_BAR_BG} !important;
        background-color: #09090b !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer,
      aside.mdc-drawer {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .mdc-drawer__content {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
      }
    \`;

    const SIDEBAR_SHADOW_CSS = \`
      :host {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        color: #a1a1aa !important;
        border-right: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
      .menu {
        background: \${SUBTLE_BAR_BG} !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
        min-height: 52px !important;
        height: 52px !important;
      }
      .title {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        letter-spacing: 0.08em !important;
        text-transform: uppercase !important;
        color: #fafafa !important;
      }
      ha-md-list,
      paper-listbox,
      .ha-scrollbar {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding-top: 4px !important;
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        transition: background-color 0.12s ease, color 0.12s ease !important;
        transform: none !important;
        box-shadow: none !important;
        min-height: 34px !important;
        height: 34px !important;
        margin: 1px 6px !important;
        border-radius: 4px !important;
        border-left: 2px solid transparent !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        font-size: 12.5px !important;
        --md-list-item-one-line-container-height: 34px !important;
        --md-list-item-top-space: 4px !important;
        --md-list-item-bottom-space: 4px !important;
        --md-list-item-leading-space: 10px !important;
        --md-list-item-trailing-space: 10px !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        transform: none !important;
        box-shadow: none !important;
        background: #111113 !important;
        color: #fafafa !important;
      }
      a[href="/home"],
      a[href="/lovelace"],
      a[href="/light"],
      a[href="/security"],
      a[href="/climate"],
      a[href="/energy"],
      a[href="/media-browser"],
      a[href="/logbook"],
      a[href="/history"],
      a[href="/todo"],
      a[href="/calendar"],
      a[href="/map"],
      a[href="/thomas-buero"],
      a[href="/aishe-diagnose"],
      a[href="/aishe-details"],
      a[href="/aishe-security"],
      a[href="/aishe-energy"],
      a[href^="/44ec3c40_thassi_"]:not([href="/44ec3c40_thassi_host"]):not([href^="/44ec3c40_thassi_host#"]):not(.thassi-custom-panel),
      ha-md-list-item[href="/home"],
      ha-md-list-item[href="/lovelace"],
      ha-md-list-item[href="/light"],
      ha-md-list-item[href="/security"],
      ha-md-list-item[href="/climate"],
      ha-md-list-item[href="/energy"],
      ha-md-list-item[href="/media-browser"],
      ha-md-list-item[href="/logbook"],
      ha-md-list-item[href="/history"],
      ha-md-list-item[href="/todo"],
      ha-md-list-item[href="/calendar"],
      ha-md-list-item[href="/map"],
      ha-md-list-item[href="/thomas-buero"],
      ha-md-list-item[href="/aishe-diagnose"],
      ha-md-list-item[href="/aishe-details"],
      ha-md-list-item[href="/aishe-security"],
      ha-md-list-item[href="/aishe-energy"],
      ha-md-list-item[href^="/44ec3c40_thassi_"]:not([href="/44ec3c40_thassi_host"]):not([href^="/44ec3c40_thassi_host#"]):not(.thassi-custom-panel),
      ha-md-list-item[data-panel="home"],
      ha-md-list-item[data-panel="lovelace"],
      ha-md-list-item[data-panel="light"],
      ha-md-list-item[data-panel="security"],
      ha-md-list-item[data-panel="climate"],
      ha-md-list-item[data-panel="energy"],
      ha-md-list-item[data-panel="media-browser"],
      ha-md-list-item[data-panel="logbook"],
      ha-md-list-item[data-panel="history"],
      ha-md-list-item[data-panel="todo"],
      ha-md-list-item[data-panel="calendar"],
      ha-md-list-item[data-panel="map"],
      ha-md-list-item[data-panel="thomas-buero"],
      ha-md-list-item[data-panel="aishe-diagnose"],
      ha-md-list-item[data-panel="aishe-details"],
      ha-md-list-item[data-panel="aishe-security"],
      ha-md-list-item[data-panel="aishe-energy"],
      ha-md-list-item[data-panel^="44ec3c40_thassi_"]:not([data-panel="44ec3c40_thassi_host"]):not(.thassi-custom-panel) {
        display: none !important;
      }
      ha-md-list[data-thassi-active-app] > ha-md-list-item[data-panel="44ec3c40_thassi_host"],
      ha-md-list[data-thassi-active-app] > a[href="/44ec3c40_thassi_host"] {
        --md-list-item-label-text-color: var(--sidebar-text-color) !important;
        --md-list-item-leading-icon-color: var(--sidebar-icon-color) !important;
        color: var(--sidebar-text-color) !important;
        background: transparent !important;
        border-left-color: transparent !important;
      }
      ha-md-list[data-thassi-active-app] > ha-md-list-item[data-panel="44ec3c40_thassi_host"]::before {
        opacity: 0 !important;
        display: none !important;
      }
      ha-md-list-item.selected,
      ha-md-list-item[selected],
      ha-md-list-item.thassi-custom-panel.selected {
        --md-list-item-label-text-color: #fafafa !important;
        --md-list-item-leading-icon-color: #fafafa !important;
        color: #fafafa !important;
        background: #141417 !important;
        border-left: 2px solid #fafafa !important;
      }
      ha-md-list-item.thassi-custom-panel.selected ha-icon,
      ha-md-list-item.selected ha-icon,
      ha-md-list-item[selected] ha-icon {
        color: #fafafa !important;
      }
      ha-md-list-item.thassi-custom-panel.selected .item-text,
      ha-md-list-item.selected .item-text,
      ha-md-list-item[selected] .item-text {
        color: #fafafa !important;
        font-weight: 500 !important;
      }
      .divider {
        border-color: rgba(255, 255, 255, 0.06) !important;
      }
    \`;

    function ensureStyleTag(root, id, cssText) {
      if (!root) return;
      let style = root.getElementById ? root.getElementById(id) : root.querySelector('#' + id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        style.textContent = cssText;
        (root.head || root).appendChild(style);
      } else if (style.textContent !== cssText) {
        style.textContent = cssText;
      }
    }

    try {
      if (typeof document !== 'undefined') {
        ensureStyleTag(document, 'thassi-uniform-design-system', UNIFORM_APP_CSS);
      }
    } catch (_e) {}

    function applyThassiChromeToParent() {
      try {
        if (!window.top) return;
        const topDoc = window.top.document;
        if (!topDoc) return;

        const ha = topDoc.querySelector('home-assistant');
        if (!ha || !ha.shadowRoot) return;

        ensureStyleTag(topDoc, 'thassi-root-vars', ROOT_THEME_CSS);
        ensureStyleTag(ha.shadowRoot, 'thassi-ha-vars', ROOT_THEME_CSS);

        const main = ha.shadowRoot.querySelector('home-assistant-main');
        if (!main || !main.shadowRoot) return;

        const drawer = main.shadowRoot.querySelector('ha-drawer');
        if (drawer && drawer.shadowRoot) {
          ensureStyleTag(drawer.shadowRoot, 'thassi-drawer-style', DRAWER_SHADOW_CSS);
          drawer.style.removeProperty('--mdc-drawer-width');
          const appContent = drawer.shadowRoot.querySelector('.mdc-drawer-app-content');
          if (appContent) {
            appContent.style.removeProperty('margin-inline-start');
            appContent.style.removeProperty('width');
          }
        }

        const sidebar = main.shadowRoot.querySelector('ha-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          ensureStyleTag(sidebar.shadowRoot, 'thassi-sidebar-style', SIDEBAR_SHADOW_CSS);

          // Ensure a persistent navigation helper exists in window.top's execution realm so listeners survive iframe switches
          window.top.__thassiOpenSidebarApp = new window.top.Function(
            'appId',
            'title',
            [
              'try {',
              '  var topWin = window.top || window;',
              '  var satMap = {',
              '    "floorplan": { parent: "smart-canvas", title: "Smart Home", hash: "#subpage=floorplan" },',
              '    "george-sync": { parent: "finance-analytics", title: "Finanzen", hash: "#subpage=george-sync" },',
              '    "network-monitor": { parent: "system-monitor", title: "System & Infra", hash: "#subpage=network-monitor" },',
              '    "google-usage": { parent: "system-monitor", title: "System & Infra", hash: "#subpage=google-usage" }',
              '  };',
              '  var subHash = "";',
              '  if (satMap[appId]) {',
              '    subHash = satMap[appId].hash;',
              '    title = satMap[appId].title;',
              '    appId = satMap[appId].parent;',
              '  }',
              '  topWin.__thassiActiveSidebarApp = appId;',
              '  topWin.sessionStorage.setItem("thassi_open_app", JSON.stringify({ id: appId, title: title, hash: subHash, fromSidebar: true, ts: Date.now() }));',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host") {',
              '    topWin.history.replaceState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '    if (hw && !hw.closed && typeof hw.openFullService === "function") {',
              '      hw.openFullService(appId, title, subHash, true);',
              '    } else {',
              '      topWin.dispatchEvent(new topWin.HashChangeEvent("hashchange"));',
              '    }',
              '    if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '    return false;',
              '  }',
              '  topWin.history.pushState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '  topWin.dispatchEvent(new topWin.CustomEvent("location-changed", { bubbles: true, composed: true }));',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}',
              'return false;'
            ].join(' ')
          );

          window.top.__thassiCloseSidebarApp = new window.top.Function(
            'ev',
            [
              'try {',
              '  var topWin = window.top || window;',
              '  topWin.__thassiActiveSidebarApp = null;',
              '  topWin.sessionStorage.removeItem("thassi_open_app");',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host") {',
              '    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }',
              '    if (topWin.location.hash) {',
              '      topWin.history.replaceState(null, "", "/44ec3c40_thassi_host");',
              '    }',
              '    if (hw && !hw.closed && typeof hw.closeFullService === "function") {',
              '      hw.closeFullService();',
              '    }',
              '  } else {',
              '    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }',
              '    topWin.history.pushState(null, "", "/44ec3c40_thassi_host");',
              '    topWin.dispatchEvent(new topWin.CustomEvent("location-changed", { bubbles: true, composed: true }));',
              '  }',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}',
              'return false;'
            ].join(' ')
          );

          // If the user ever lands on a stopped standalone Thassi add-on URL (/44ec3c40_thassi_<slug>), redirect immediately to Horizon
          const curTopPath = String(window.top.location.pathname || '');
          const stoppedMatch = curTopPath.match(/^/44ec3c40_thassi_(?!host$)([a-z0-9_]+)/i);
          if (stoppedMatch && stoppedMatch[1]) {
            const targetAppId = stoppedMatch[1].toLowerCase().replace(/_/g, '-');
            window.top.__thassiOpenSidebarApp(targetAppId, targetAppId);
            return;
          }

          const mdList = sidebar.shadowRoot.querySelector('ha-md-list, paper-listbox');
          if (mdList) {
            function stripLeadingSlashes(s) {
              let out = String(s || '');
              while (out.startsWith('/')) out = out.slice(1);
              return out;
            }

            function stripTrailingSlashes(s) {
              let out = String(s || '');
              while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
              return out;
            }

            function getItemPanelSlug(el) {
              if (!el) return '';
              const dp = (el.getAttribute && el.getAttribute('data-panel')) || '';
              if (dp) return stripLeadingSlashes(dp);
              let hr = (el.getAttribute && el.getAttribute('href')) || el.href || '';
              if (!hr && el.shadowRoot) {
                const innerA = el.shadowRoot.querySelector('a[href]');
                if (innerA) hr = innerA.getAttribute('href') || innerA.href || '';
              }
              if (hr) {
                try {
                  const u = new URL(hr, window.top.location.origin);
                  return stripLeadingSlashes(u.pathname);
                } catch (_e) {
                  return stripLeadingSlashes(hr).split('#')[0];
                }
              }
              return '';
            }

            function findSidebarPanelItem(slug) {
              const items = Array.from(mdList.children);
              for (let i = 0; i < items.length; i++) {
                const el = items[i];
                if (el.id && el.id.startsWith('thassi-nav-')) continue;
                if (getItemPanelSlug(el) === slug) return el;
              }
              return null;
            }

            const horizonItem = findSidebarPanelItem('44ec3c40_thassi_host');
            if (horizonItem) {
              horizonItem.onclick = window.top.__thassiCloseSidebarApp;
              if (!horizonItem.__thassiCaptureBound) {
                horizonItem.__thassiCaptureBound = true;
                horizonItem.addEventListener('click', function(ev) {
                  return window.top.__thassiCloseSidebarApp(ev);
                }, true);
              }
            }

            const SATELLITE_HIDDEN_IDS = {
              'floorplan': true,
              'george-sync': true,
              'network-monitor': true,
              'google-usage': true
            };

            function bindSidebarItemClick(el, appId, title, isHiddenSatellite) {
              if (!el) return;
              if (isHiddenSatellite) {
                el.style.display = 'none';
              } else {
                el.style.removeProperty('display');
              }
              const targetHref = '/44ec3c40_thassi_host#' + appId;
              try {
                el.href = targetHref;
                if (el.setAttribute) el.setAttribute('href', targetHref);
                if (el.shadowRoot) {
                  const innerA = el.shadowRoot.querySelector('a');
                  if (innerA) {
                    innerA.href = targetHref;
                    innerA.setAttribute('href', targetHref);
                  }
                }
              } catch (_e) {}

              const clickHandler = new window.top.Function(
                'ev',
                'if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } return window.top.__thassiOpenSidebarApp(' +
                  JSON.stringify(appId) +
                  ', ' +
                  JSON.stringify(title) +
                  ');'
              );
              el.onclick = clickHandler;
              if (el.__thassiBoundApp !== appId) {
                el.__thassiBoundApp = appId;
                el.addEventListener('click', clickHandler, true);
              }
            }

            function ensureNativeSidebarItem(navId, appId, panelSlug, title, iconName, refAfterEl, isHiddenSatellite) {
              // Hide any native stopped add-on panel item so Home Assistant never opens the "Start this app?" dialog
              const existingNative = findSidebarPanelItem(panelSlug);
              if (existingNative && panelSlug !== '44ec3c40_thassi_host') {
                existingNative.setAttribute('data-panel', panelSlug);
                existingNative.style.display = 'none';
                bindSidebarItemClick(existingNative, appId, title, true);
              }
              if (isHiddenSatellite) {
                const oldSat = mdList.querySelector('#' + navId);
                if (oldSat) oldSat.remove();
                return null;
              }
              let item = mdList.querySelector('#' + navId);
              if (item && item.tagName.toLowerCase() !== 'ha-md-list-item') {
                item.remove();
                item = null;
              }
              if (!item) {
                const sampleItem =
                  horizonItem ||
                  Array.from(mdList.querySelectorAll('ha-md-list-item')).find(
                    (el) => !el.id || !el.id.startsWith('thassi-nav-')
                  );
                const sampleText = sampleItem ? sampleItem.querySelector('.item-text, [slot="headline"]') : null;
                const sampleIcon = sampleItem ? sampleItem.querySelector('ha-icon') : null;
                const textSlot = sampleText ? sampleText.getAttribute('slot') : 'headline';
                const iconSlot = (sampleIcon && sampleIcon.getAttribute('slot')) || 'start';

                item = topDoc.createElement('ha-md-list-item');
                item.id = navId;
                item.className = 'thassi-custom-panel';
                item.setAttribute('type', 'link');
                item.type = 'link';
                item.setAttribute('data-thassi-app', appId);
                item.href = '/44ec3c40_thassi_host#' + appId;

                const iconEl = topDoc.createElement('ha-icon');
                if (iconSlot) iconEl.setAttribute('slot', iconSlot);
                iconEl.setAttribute('icon', iconName);
                iconEl.icon = iconName;

                const spanEl = topDoc.createElement('span');
                spanEl.className = 'item-text';
                if (textSlot) spanEl.setAttribute('slot', textSlot);
                spanEl.textContent = title;

                item.appendChild(iconEl);
                item.appendChild(spanEl);
              } else {
                const spanEl = item.querySelector('.item-text');
                if (spanEl && spanEl.textContent !== title) spanEl.textContent = title;
                const iconEl = item.querySelector('ha-icon');
                if (iconEl && iconEl.getAttribute('icon') !== iconName) {
                  iconEl.setAttribute('icon', iconName);
                  iconEl.icon = iconName;
                }
              }
              if (refAfterEl && item !== refAfterEl && item.previousElementSibling !== refAfterEl) {
                if (refAfterEl.nextSibling) {
                  mdList.insertBefore(item, refAfterEl.nextSibling);
                } else {
                  mdList.appendChild(item);
                }
              } else if (!item.parentElement) {
                mdList.appendChild(item);
              }
              bindSidebarItemClick(item, appId, title, isHiddenSatellite);
              return item;
            }

            const STATIC_CUSTOM_APPS = [
              { id: 'smart-canvas', navId: 'thassi-nav-smart-canvas', title: 'Smart Home', icon: 'mdi:home-lightning-bolt-outline' },
              { id: 'camera-vision', navId: 'thassi-nav-camera-vision', title: 'Kameras & Vision', icon: 'mdi:cctv' },
              { id: '3d-print', navId: 'thassi-nav-3d-print', title: '3D Druck Studio', icon: 'mdi:printer-3d-nozzle' },
              { id: 'finance-analytics', navId: 'thassi-nav-finance-analytics', title: 'Finanzen', icon: 'mdi:chart-areaspline' },
              { id: 'google-calendar', navId: 'thassi-nav-google-calendar', title: 'Kalender & Zeit', icon: 'mdi:calendar-clock' },
              { id: 'google-health', navId: 'thassi-nav-google-health', title: 'Gesundheit', icon: 'mdi:heart-pulse' },
              { id: 'meal-planner', navId: 'thassi-nav-meal-planner', title: 'Ern\xE4hrung & Einkauf', icon: 'mdi:silverware-fork-knife' },
              { id: 'memo', navId: 'thassi-nav-memo', title: 'Memo', icon: 'mdi:notebook-outline' },
              { id: 'contacts', navId: 'thassi-nav-contacts', title: 'Kontakte', icon: 'mdi:account-multiple-outline' },
              { id: 'cortex', navId: 'thassi-nav-cortex', title: 'Cortex', icon: 'mdi:brain' },
              { id: 'workflows', navId: 'thassi-nav-workflows', title: 'Workflows', icon: 'mdi:sitemap-outline' },
              { id: 'project-workflow', navId: 'thassi-nav-project-workflow', title: 'Dev-Projekte', icon: 'mdi:source-branch-check' },
              { id: 'system-monitor', navId: 'thassi-nav-system-monitor', title: 'System & Infra', icon: 'mdi:pulse' },
              // Consolidated satellite apps (integrated as Men\xFCleiste subpages; hidden in main sidebar)
              { id: 'floorplan', navId: 'thassi-nav-floorplan', title: 'Grundriss 2D', icon: 'mdi:floor-plan', satellite: true },
              { id: 'george-sync', navId: 'thassi-nav-george-sync', title: 'Erste Bank Sync', icon: 'mdi:bank-transfer', satellite: true },
              { id: 'network-monitor', navId: 'thassi-nav-network-monitor', title: 'Netzwerk & Router', icon: 'mdi:router-network', satellite: true },
              { id: 'google-usage', navId: 'thassi-nav-google-usage', title: 'Google Usage & AI', icon: 'mdi:chart-box-outline', satellite: true }
            ];

            const dynamicApps = Array.isArray(window.top.__thassiDeployedApps)
              ? window.top.__thassiDeployedApps
              : Array.isArray(window.__THASSI_DEPLOYED_APPS__)
                ? window.__THASSI_DEPLOYED_APPS__
                : [];

            const mergedCustomApps = STATIC_CUSTOM_APPS.slice();
            for (let dIdx = 0; dIdx < dynamicApps.length; dIdx++) {
              const dApp = dynamicApps[dIdx];
              if (!dApp || !dApp.id || dApp.hideFromSidebar) continue;
              if (!mergedCustomApps.some(function(x) { return x.id === dApp.id; })) {
                mergedCustomApps.push({
                  id: dApp.id,
                  title: dApp.name || dApp.title || dApp.id,
                  icon: dApp.icon || 'mdi:application-outline',
                  satellite: Boolean(SATELLITE_HIDDEN_IDS[dApp.id])
                });
              }
            }

            let prevInsertedItem = horizonItem;
            const createdSidebarItems = {};
            const knownCustomIds = {};
            for (let cIdx = 0; cIdx < mergedCustomApps.length; cIdx++) {
              const cfg = mergedCustomApps[cIdx];
              knownCustomIds[cfg.id] = true;
              const slug = '44ec3c40_thassi_' + cfg.id.replace(/[^a-z0-9_]/gi, '_');
              const isSat = Boolean(cfg.satellite || SATELLITE_HIDDEN_IDS[cfg.id]);
              const navEl = ensureNativeSidebarItem(
                'thassi-nav-' + cfg.id,
                cfg.id,
                slug,
                cfg.title,
                cfg.icon,
                prevInsertedItem || horizonItem,
                isSat
              );
              if (navEl) {
                createdSidebarItems[cfg.id] = navEl;
                if (!isSat) {
                  prevInsertedItem = navEl;
                }
              }
            }

            const topPath = stripTrailingSlashes(window.top.location.pathname || '');
            const rawTopHash = String(window.top.location.hash || '');
            const topHash = rawTopHash.startsWith('#') ? rawTopHash.slice(1) : rawTopHash;
            let activeCustomApp = null;
            if (topPath === '/44ec3c40_thassi_host') {
              if (topHash && knownCustomIds[topHash]) {
                activeCustomApp = topHash;
                window.top.__thassiActiveSidebarApp = topHash;
              } else if (window.top.__thassiActiveSidebarApp) {
                activeCustomApp = window.top.__thassiActiveSidebarApp;
              }
            } else {
              window.top.__thassiActiveSidebarApp = null;
            }

            if (activeCustomApp) {
              mdList.setAttribute('data-thassi-active-app', activeCustomApp);
              if (horizonItem) horizonItem.classList.remove('selected');
            } else {
              mdList.removeAttribute('data-thassi-active-app');
              if (horizonItem && topPath === '/44ec3c40_thassi_host') {
                horizonItem.classList.add('selected');
              }
            }

            for (let cIdx = 0; cIdx < mergedCustomApps.length; cIdx++) {
              const appId = mergedCustomApps[cIdx].id;
              const el = createdSidebarItems[appId];
              if (el) {
                el.classList.toggle('selected', activeCustomApp === appId);
              }
            }
          }
        }

        window.top.__thassiSyncSidebarNow = applyThassiChromeToParent;
        if (!window.top.__thassiTopSidebarTimer) {
          window.top.__thassiTopSidebarTimer = window.top.setInterval(
            new window.top.Function(
              'try { if (typeof window.top.__thassiSyncSidebarNow === "function") window.top.__thassiSyncSidebarNow(); } catch (_e) {}'
            ),
            1000
          );
        }

        // Persist clean sidebar order & hide all stopped standalone add-on panels in localStorage
        try {
          const hidden = [
            "home","lovelace","light","security","climate","energy",
            "media-browser","logbook","history","todo","calendar",
            "map","thomas-buero","aishe-diagnose","aishe-details","aishe-security","aishe-energy",
            "44ec3c40_thassi_smart_canvas","44ec3c40_thassi_camera_vision","44ec3c40_thassi_3d_print",
            "44ec3c40_thassi_finance_analytics","44ec3c40_thassi_google_calendar","44ec3c40_thassi_google_health",
            "44ec3c40_thassi_meal_planner","44ec3c40_thassi_memo","44ec3c40_thassi_contacts",
            "44ec3c40_thassi_cortex","44ec3c40_thassi_workflows","44ec3c40_thassi_project_workflow",
            "44ec3c40_thassi_system_monitor","44ec3c40_thassi_floorplan","44ec3c40_thassi_george_sync",
            "44ec3c40_thassi_network_monitor","44ec3c40_thassi_google_usage"
          ];
          const order = [
            "44ec3c40_thassi_host",
            "hacs"
          ];
          window.top.localStorage.setItem('sidebarHiddenPanels', JSON.stringify(hidden));
          window.top.localStorage.setItem('sidebarPanelOrder', JSON.stringify(order));
        } catch (_e) {}

        const panelLovelace = main.shadowRoot.querySelector('ha-panel-lovelace');
        const huiRoot = panelLovelace && panelLovelace.shadowRoot && panelLovelace.shadowRoot.querySelector('hui-root');
        if (huiRoot && huiRoot.shadowRoot) {
          const oldFullbleed = huiRoot.shadowRoot.getElementById
            ? huiRoot.shadowRoot.getElementById('thassi-lovelace-fullbleed')
            : huiRoot.shadowRoot.querySelector('#thassi-lovelace-fullbleed');
          if (oldFullbleed) oldFullbleed.remove();
        }
      } catch (_err) {
        // Cross-origin fallback (when opened directly on :8099 outside Home Assistant)
      }
    }

    window.syncThassiSidebarSky = function(_skyOverlayGradient) {
      // No-op: keep sidebar solid #09090b achromatic background
    };

    window.toggleHassMobileSidebar = function() {
      try {
        if (!window.top || window.top === window) return false;
        const ha = window.top.document.querySelector('home-assistant');
        const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
        if (main) {
          main.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
          return true;
        }
      } catch (_e) {}
      return false;
    };

    function refreshDeployedAppsForSidebar() {
      try {
        fetch('/api/system/status')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
            if (data && Array.isArray(data.apps)) {
              window.__THASSI_DEPLOYED_APPS__ = data.apps;
              if (window.top) window.top.__thassiDeployedApps = data.apps;
              applyThassiChromeToParent();
            }
          })
          .catch(function() {});
      } catch (_e) {}
    }

    refreshDeployedAppsForSidebar();
    setInterval(refreshDeployedAppsForSidebar, 15000);
    applyThassiChromeToParent();
    setInterval(applyThassiChromeToParent, 1200);
  })();
  `;
}
function syncHassFrontendFiles() {
  if (process.env.THASSI_WRITE_HASS_WWW !== "1") return;
  const candidateConfigDirs = ["/homeassistant", "/config"];
  for (const cfgDir of candidateConfigDirs) {
    if (!fs3.existsSync(path3.join(cfgDir, "configuration.yaml"))) continue;
    try {
      const wwwDir = path3.join(cfgDir, "www");
      fs3.mkdirSync(wwwDir, { recursive: true });
      const stylerJs = getHassSidebarStylerScript();
      fs3.writeFileSync(path3.join(wwwDir, "thassi-ui.js"), stylerJs, "utf-8");
      const loaderHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>html,body{margin:0;padding:0;background:#09090b;overflow:hidden;width:100%;height:100%;}iframe{width:100%;height:100%;border:0;display:block;}</style>
</head>
<body>
  <iframe id="thassi-fallback-frame" title="Thassi Horizon"></iframe>
  <script>${stylerJs}
  try {
    var f = document.getElementById('thassi-fallback-frame');
    if (f) {
      f.src = window.location.protocol + '//' + (window.location.hostname || '192.168.188.92') + ':8099/';
    }
    if (window.top && window.top.location.pathname.startsWith('/lovelace')) {
      window.top.history.pushState(null, '', '/44ec3c40_thassi_host');
      window.top.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
    }
  } catch (e) {}
  </script>
</body>
</html>`;
      fs3.writeFileSync(path3.join(wwwDir, "thassi-loader.html"), loaderHtml, "utf-8");
      console.log(`[Thassi] Synced /local/thassi-ui.js and /local/thassi-loader.html to ${wwwDir}`);
    } catch (err) {
      console.warn("[Thassi] Could not write to www dir:", err);
    }
  }
}

// apps/finance-analytics/shared/finance-types.ts
var DEFAULT_FIXED_COSTS = [
  {
    id: "kreditrate",
    name: "Kreditrate",
    amount: 750,
    category: "Housing & Utilities",
    groupLabel: "Wohnen & Energie",
    matchPattern: "kreditrate|00007-656648|sparkasse n"
  },
  {
    id: "evn-waerme",
    name: "EVN W\xE4rme",
    amount: 782,
    category: "Housing & Utilities",
    groupLabel: "Wohnen & Energie",
    matchPattern: "evn.*w\xE4rme|evn.*waerme|evn ag"
  },
  {
    id: "gemeindeabgabe",
    name: "Gemeindeabgabe",
    amount: 140,
    category: "Housing & Utilities",
    groupLabel: "Wohnen & Energie",
    matchPattern: "gemeinde|marktgemeinde"
  },
  {
    id: "evn-strom",
    name: "EVN Strom",
    amount: 80,
    category: "Housing & Utilities",
    groupLabel: "Wohnen & Energie",
    matchPattern: "evn.*strom|evn energie",
    isEstimate: true
  },
  {
    id: "orf-beitrag",
    name: "ORF-Beitrag",
    amount: 7,
    category: "Housing & Utilities",
    groupLabel: "Wohnen & Energie",
    matchPattern: "orf-beitrag|obs|gis"
  },
  {
    id: "generali-hhv",
    name: "Generali HHV",
    amount: 103.68,
    category: "Insurance & Finance",
    groupLabel: "Versicherungen",
    matchPattern: "5574-4113|besitz-versi|haushalt"
  },
  {
    id: "kfz-versicherung",
    name: "KFZ-Versicherung",
    amount: 84.68,
    category: "Insurance & Finance",
    groupLabel: "Versicherungen",
    matchPattern: "6010-4061|kraftfahrzeug"
  },
  {
    id: "generali-leben",
    name: "Generali Leben",
    amount: 71.25,
    category: "Insurance & Finance",
    groupLabel: "Versicherungen",
    matchPattern: "0119636|fondsgebundene|lebensvers"
  },
  {
    id: "unfallversicherung",
    name: "Unfallversicherung",
    amount: 25.34,
    category: "Insurance & Finance",
    groupLabel: "Versicherungen",
    matchPattern: "5886-2773|unfallvers"
  },
  {
    id: "kabelplus",
    name: "Kabelplus Internet",
    amount: 31.4,
    category: "Subscriptions",
    groupLabel: "Abos & Internet",
    matchPattern: "kabelplus"
  },
  {
    id: "youtube-premium",
    name: "Youtube Premium",
    amount: 27.99,
    category: "Subscriptions",
    groupLabel: "Abos & Internet",
    matchPattern: "youtube"
  },
  {
    id: "google-one-ai",
    name: "Google One AI",
    amount: 21.99,
    category: "Subscriptions",
    groupLabel: "Abos & Internet",
    matchPattern: "google one|google\\*one|google ai"
  },
  {
    id: "amazon-prime",
    name: "Amazon Prime",
    amount: 8.99,
    category: "Subscriptions",
    groupLabel: "Abos & Internet",
    matchPattern: "amznprime|amazon prime|d01-|amazon eu.*8\\.99"
  }
];
var DEFAULT_EXPORT_REMINDER_CONFIG = {
  reminderIntervalDays: 7,
  remindOnNewMonth: true,
  snoozedUntil: null,
  lastBankSyncAt: null,
  lastDataExportAt: null
};
var CATEGORY_DEFINITIONS = [
  {
    id: "Housing & Utilities",
    labelDe: "Wohnen & Energie",
    color: "#6366f1",
    icon: "\u{1F3E0}",
    defaultBudget: 1760,
    group: "fixed",
    groupLabelDe: "Fixkosten & Wohnen",
    groupColor: "#6366f1"
  },
  {
    id: "Insurance & Finance",
    labelDe: "Versicherung & Bank",
    color: "#8b5cf6",
    icon: "\u{1F6E1}\uFE0F",
    defaultBudget: 285,
    group: "fixed",
    groupLabelDe: "Fixkosten & Wohnen",
    groupColor: "#6366f1"
  },
  {
    id: "Subscriptions",
    labelDe: "Abos & Internet",
    color: "#a855f7",
    icon: "\u{1F4E1}",
    defaultBudget: 90,
    group: "fixed",
    groupLabelDe: "Fixkosten & Wohnen",
    groupColor: "#6366f1"
  },
  {
    id: "Groceries",
    labelDe: "Lebensmittel",
    color: "#0ea5e9",
    icon: "\u{1F6D2}",
    defaultBudget: 400,
    group: "living",
    groupLabelDe: "Alltag & Versorgung",
    groupColor: "#0ea5e9"
  },
  {
    id: "Transport",
    labelDe: "Mobilit\xE4t & Tanken",
    color: "#f59e0b",
    icon: "\u{1F697}",
    defaultBudget: 280,
    group: "living",
    groupLabelDe: "Alltag & Versorgung",
    groupColor: "#0ea5e9"
  },
  {
    id: "Health & Fitness",
    labelDe: "Gesundheit & Apotheke",
    color: "#f43f5e",
    icon: "\u2764\uFE0F",
    defaultBudget: 120,
    group: "living",
    groupLabelDe: "Alltag & Versorgung",
    groupColor: "#0ea5e9"
  },
  {
    id: "Dining & Coffee",
    labelDe: "Gastronomie & Freizeit",
    color: "#ec4899",
    icon: "\u{1F37D}\uFE0F",
    defaultBudget: 350,
    group: "lifestyle",
    groupLabelDe: "Lifestyle & Freizeit",
    groupColor: "#ec4899"
  },
  {
    id: "Shopping & Tech",
    labelDe: "Shopping & Drogerie",
    color: "#14b8a6",
    icon: "\u{1F6CD}\uFE0F",
    defaultBudget: 250,
    group: "lifestyle",
    groupLabelDe: "Lifestyle & Freizeit",
    groupColor: "#ec4899"
  },
  {
    id: "Trafik & Kiosk",
    labelDe: "Trafik & Kiosk",
    color: "#f97316",
    icon: "\u{1F3EA}",
    defaultBudget: 120,
    group: "lifestyle",
    groupLabelDe: "Lifestyle & Freizeit",
    groupColor: "#ec4899"
  },
  {
    id: "Cash & Private",
    labelDe: "Bargeld & \xDCberweisungen",
    color: "#64748b",
    icon: "\u{1F4B6}",
    defaultBudget: 300,
    group: "lifestyle",
    groupLabelDe: "Lifestyle & Freizeit",
    groupColor: "#ec4899"
  },
  {
    id: "Investments",
    labelDe: "Notgroschen & ETF Sparen",
    color: "#38bdf8",
    icon: "\u{1F4C8}",
    defaultBudget: 400,
    group: "savings",
    groupLabelDe: "Sparen & Investments",
    groupColor: "#38bdf8"
  },
  {
    id: "Income",
    labelDe: "Einnahmen & Gehalt",
    color: "#10b981",
    icon: "\u{1F4B0}",
    defaultBudget: 0,
    group: "income",
    groupLabelDe: "Einnahmen",
    groupColor: "#10b981"
  }
];
var CATEGORY_MAP = new Map(
  CATEGORY_DEFINITIONS.map((c) => [c.id, c])
);
function getCategoryMeta(category) {
  return CATEGORY_MAP.get(category) || {
    id: category,
    labelDe: category,
    color: "#94a3b8",
    icon: "\u{1F3F7}\uFE0F",
    defaultBudget: 200,
    group: "lifestyle",
    groupLabelDe: "Sonstiges",
    groupColor: "#94a3b8"
  };
}
var DEFAULT_PREVIEW_CONFIG = {
  hiddenByDefault: true,
  primaryMetric: "current_balance",
  enabledElements: [
    "current_balance",
    "expenses_day",
    "expenses_week",
    "group_budgets",
    "quick_import"
  ],
  previewBudgetCategories: [
    "Groceries",
    "Dining & Coffee",
    "Transport",
    "Housing & Utilities"
  ],
  excludeRoundUpsInExpenses: true
};
var DEFAULT_BALANCE_CONFIG = {
  currentBalance: 4850,
  accountName: "Sparkasse George Girokonto",
  iban: "AT22 2025 6010 0120 1324",
  autoAdjustOnImport: true,
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
};
var BANK_PRESETS = [
  {
    id: "george_at",
    name: "Erste Bank & Sparkasse \u2014 George (AT)",
    url: "https://george.sparkasse.at/index.html#/login",
    exportHint: "Konto w\xE4hlen \u2192 Funktionen \u2192 Ums\xE4tze exportieren \u2192 CSV"
  },
  {
    id: "raiffeisen_at",
    name: "Raiffeisen \u2014 Meine ELBA (AT)",
    url: "https://mein.elba.raiffeisen.at/",
    exportHint: "Ums\xE4tze \u2192 Exportieren \u2192 CSV / CAMT.053"
  },
  {
    id: "bawag_at",
    name: "BAWAG P.S.K. eBanking (AT)",
    url: "https://ebanking.bawag.com/",
    exportHint: "Konto\xFCbersicht \u2192 Umsatzliste herunterladen (CSV)"
  },
  {
    id: "flatex_at",
    name: "Flatex WebFiliale (AT)",
    url: "https://konto.flatex.at/",
    exportHint: "Konto & Depot \u2192 Buchungs\xFCbersicht \u2192 CSV-Export"
  },
  {
    id: "n26",
    name: "N26 Web App",
    url: "https://app.n26.com/login",
    exportHint: "Download CSV Statement"
  },
  {
    id: "custom",
    name: "Benutzerdefinierte Bank-URL",
    url: "https://george.sparkasse.at/",
    exportHint: "Kontoauszug als CSV, CAMT.053 XML oder MT940 herunterladen"
  }
];

// apps/finance-analytics/backend/categorizer.ts
function normalizePayeeName(rawPayee, rawNotes = "") {
  const p = (rawPayee || "").trim();
  const n = (rawNotes || "").trim();
  const combined = `${p} ${n}`.toLowerCase();
  if (/notgroschen\s*zu\b/i.test(combined)) {
    return "Sparkasse Notgroschen (Round-Up)";
  }
  if (!p && (combined.includes("kontof\xFChrung") || combined.includes("bereitstellung") || combined.includes("sollzinsen") || combined.includes("ablebensprovision"))) {
    return "Sparkasse Kontof\xFChrung & Geb\xFChren";
  }
  if (!p && (combined.includes("sb-auszahlung") || combined.includes("atm "))) {
    return "Bankomat / SB-Auszahlung";
  }
  if (!p && n) {
    const posTrailing = n.match(
      /^POS\s+[\d.,]+\s+[A-Z]{2,3}\s+K\d+\s+\d{2}\.\d{2}\.\s+\d{2}:\d{2}\s*(.+)$/i
    );
    if (posTrailing && posTrailing[1]) {
      const cleaned = posTrailing[1].replace(/\s+\d{3}$/, "").replace(/\s+/g, " ").trim();
      if (cleaned) return cleaned;
    }
    const posLeading = n.match(/^(.+?)\s+K\d+\s+\d{2}\.\d{2}\.\s+\d{2}:\d{2}/i);
    if (posLeading && posLeading[1]) {
      const cleaned = posLeading[1].replace(/^POS\s+[\d.,]+\s+[A-Z]{2,3}$/i, "").replace(/\s+/g, " ").trim();
      if (cleaned) return cleaned;
    }
  }
  return p || n.replace(/\s+/g, " ").slice(0, 60) || "Bankbuchung";
}
function autoCategorizeTransaction(payee, notes = "", amount = 0) {
  const text = `${payee} ${notes}`.toLowerCase();
  if (amount > 0) {
    return "Income";
  }
  if (/notgroschen|1003922331|at512025601003922331|flatex|trade republic|scalable|bitpanda|etf|sparplan|aktien|depot|invest|broker/.test(
    text
  )) {
    return "Investments";
  }
  if (/generali|grazer wechselseitige|grawe|uniqa|allianz|wiener staedtische|lebensversicherung|unfallversich|5574-4113|6010-4061|0119636|5886-2773|kreditkartenrechnung|zuzahlung s kreditkarte|bereitstellung s kreditkarte|kontoführung|kontofuehrung|sollzinsen|bereitstellungsprovision|ablebensprovision|bartransaktionen|ksv-auskunft|klarna/.test(
    text
  )) {
    return "Insurance & Finance";
  }
  if (/kreditrate|00007-656648|sparkasse n|miete|wohnung|hausverwaltung|betriebskosten|strom|gas|energie|evn|wien energie|verbund|marktgemeinde|gemeinde|5574-4113|besitz-versi|haushaltsversicherung|orf-beitrag|gis|obs|hornbach|bauhaus|lagerhaus|obi\b/.test(
    text
  )) {
    return "Housing & Utilities";
  }
  if (/6010-4061|kraftfahrzeug-versicherung|kfz|bp tankstelle|bp\b|jet 5|jet tank|jet\b|omv|shell|eni\b|turmöl|turmoel|diskont 8050|oil 529|tankstelle|handyparken|parkhaus|parken|apcoa|oebb|öbb|westbahn|wiener linien|uber|bolt|asfinag|öamtc|oeamtc|autohaus|sixt/.test(
    text
  )) {
    return "Transport";
  }
  if (/trafik|tabak|tabacchi|tabaccheri/.test(text)) {
    return "Trafik & Kiosk";
  }
  if (/billa|spar |spar$|spar\b|spar dankt|spar fil|interspar|eurospar|hofer|lidl|rewe|adeg|penny|unimarkt|mpreis|eurospin|denns|bio|supermarkt|grocer|selecta|bäckerei|baeckerei|ströck|stroeck|fleischerei/.test(
    text
  )) {
    return "Groceries";
  }
  if (/kabelplus|magenta|a1\b|drei\b|amznprime|amazon prime|prime video|amazon digital|netflix|spotify|youtube|apple|openai|anthropic|claude|chatgpt|github|figma|disney|steam|playstation|xbox|mrcr mobile pay|nuvei|abonnement|subscription/.test(
    text
  )) {
    return "Subscriptions";
  }
  if (/gruppenpraxis|zikulnig|apotheke|farma drugstore|arzt|doctor|fitness|gym|fitinn|mcfit|health|therme|optik|exclusive salon/.test(
    text
  )) {
    return "Health & Fitness";
  }
  if (/megaplex|kino|burger king|mcdonalds|mc donalds|kebab|turkoglu|gao xiang chen|chen 2371|pizzeria|autobahnrest|rosenberg|golden harp|ambra night|luna glam|kara food|asfodelo|al faro|impresa indivi|mostakim|fabiano bacciu|ananasso|san teodoro|alghero|olbia|cagliari|restaurant|cafe|coffee|bistro|pizza|burger|sushi|lieferando|mjam|wolt|foodora|gasthaus|wirtshaus|heuriger|lunch|dinner/.test(
    text
  )) {
    return "Dining & Coffee";
  }
  if (/sb-auszahlung|atm |automat |barauszahlung|überweisung |ueberweisung |george-überweisung|veronika simhofer|patricia leuthner|lisa simhofer|charlotte simhofer|daniela hader|marco eder|rebecca eder|alexander dammerer|stefan grabner|andre gundinger|fridtjof bauer|florian karpf|karpf florian|david endrich|nico zadak|charlotte tezky|peter bittermann|david maierhofer/.test(
    text
  )) {
    return "Cash & Private";
  }
  return "Shopping & Tech";
}
function detectRecurringFlag(payee, notes, category, hasMandate = false) {
  const text = `${payee} ${notes}`.toLowerCase();
  if (/notgroschen\s*zu\b/i.test(text) || payee.includes("Notgroschen")) return 0;
  if (hasMandate || category === "Housing & Utilities" || category === "Insurance & Finance" || category === "Subscriptions" || /kreditrate|versicherung|gehalt|arec|miete|strom|evn|kabelplus|netflix|spotify|amznprime/.test(
    text
  )) {
    return 1;
  }
  return 0;
}
function buildSunburstHierarchy(transactions, mode = "groups", excludeRoundUps = true) {
  const expenseTxs = transactions.filter((t) => {
    if (t.amount >= 0) return false;
    if (excludeRoundUps && (t.payee.includes("Notgroschen") || /notgroschen\s*zu\b/i.test(t.notes))) {
      return false;
    }
    return true;
  });
  const totalExpenses = Number(
    expenseTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0).toFixed(2)
  );
  if (mode === "groups") {
    const groupMap = /* @__PURE__ */ new Map();
    for (const tx of expenseTxs) {
      const meta = getCategoryMeta(tx.category);
      const gKey = meta.group;
      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          id: gKey,
          name: meta.groupLabelDe,
          label: meta.groupLabelDe,
          color: meta.groupColor,
          value: 0,
          txCount: 0,
          catMap: /* @__PURE__ */ new Map()
        });
      }
      const g = groupMap.get(gKey);
      const amt = Math.abs(tx.amount);
      g.value += amt;
      g.txCount += 1;
      const curCat = g.catMap.get(tx.category) || { value: 0, txCount: 0 };
      curCat.value += amt;
      curCat.txCount += 1;
      g.catMap.set(tx.category, curCat);
    }
    const ring12 = Array.from(groupMap.values()).map((g) => ({
      id: g.id,
      name: g.name,
      label: g.label,
      value: Number(g.value.toFixed(2)),
      color: g.color,
      txCount: g.txCount,
      children: Array.from(g.catMap.entries()).map(([catName, stat]) => {
        const cMeta = getCategoryMeta(catName);
        return {
          name: catName,
          label: `${cMeta.icon} ${cMeta.labelDe}`,
          value: Number(stat.value.toFixed(2)),
          color: cMeta.color,
          txCount: stat.txCount,
          filterCategory: catName
        };
      }).sort((a, b) => b.value - a.value)
    })).sort((a, b) => b.value - a.value);
    return { totalExpenses, ring1: ring12 };
  }
  const catMap = /* @__PURE__ */ new Map();
  for (const tx of expenseTxs) {
    const cat = tx.category || "Shopping & Tech";
    if (!catMap.has(cat)) {
      catMap.set(cat, { value: 0, txCount: 0, payeeMap: /* @__PURE__ */ new Map() });
    }
    const c = catMap.get(cat);
    const amt = Math.abs(tx.amount);
    c.value += amt;
    c.txCount += 1;
    const cleanPayee = tx.payee.slice(0, 28).trim() || "Sonstige";
    const p = c.payeeMap.get(cleanPayee) || { value: 0, txCount: 0 };
    p.value += amt;
    p.txCount += 1;
    c.payeeMap.set(cleanPayee, p);
  }
  const ring1 = Array.from(catMap.entries()).map(([catName, stat]) => {
    const meta = getCategoryMeta(catName);
    const sortedPayees = Array.from(stat.payeeMap.entries()).sort(
      (a, b) => b[1].value - a[1].value
    );
    const topPayees = sortedPayees.slice(0, 5);
    const restPayees = sortedPayees.slice(5);
    const children = topPayees.map(([payeeName, pStat]) => ({
      name: payeeName,
      label: payeeName,
      value: Number(pStat.value.toFixed(2)),
      color: meta.color,
      txCount: pStat.txCount,
      filterCategory: catName,
      filterPayee: payeeName
    }));
    if (restPayees.length > 0) {
      const restVal = restPayees.reduce((s, [, r]) => s + r.value, 0);
      const restCnt = restPayees.reduce((s, [, r]) => s + r.txCount, 0);
      children.push({
        name: `Weitere (${restPayees.length})`,
        label: `Weitere (${restPayees.length})`,
        value: Number(restVal.toFixed(2)),
        color: meta.color,
        txCount: restCnt,
        filterCategory: catName
      });
    }
    return {
      id: catName,
      name: catName,
      label: `${meta.icon} ${meta.labelDe}`,
      value: Number(stat.value.toFixed(2)),
      color: meta.color,
      txCount: stat.txCount,
      filterCategory: catName,
      children
    };
  }).sort((a, b) => b.value - a.value);
  return { totalExpenses, ring1 };
}
function getDefaultCategoryBudgets() {
  return CATEGORY_DEFINITIONS.filter((c) => c.group !== "income").map((c) => ({
    category: c.id,
    monthly_limit: c.defaultBudget
  }));
}

// apps/finance-analytics/backend/parser.ts
import zlib from "node:zlib";
function isZipBuffer(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
}
function extractZipEntries(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let eocdOffset = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 101010256) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return [];
  const totalEntries = b.readUInt16LE(eocdOffset + 10);
  const cdOffset = b.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries && ptr + 46 <= b.length; i++) {
    if (b.readUInt32LE(ptr) !== 33639248) break;
    const compMethod = b.readUInt16LE(ptr + 10);
    const compSize = b.readUInt32LE(ptr + 20);
    const nameLen = b.readUInt16LE(ptr + 28);
    const extraLen = b.readUInt16LE(ptr + 30);
    const commentLen = b.readUInt16LE(ptr + 32);
    const localHeaderOffset = b.readUInt32LE(ptr + 42);
    const name = b.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    if (localHeaderOffset + 30 <= b.length && !name.endsWith("/")) {
      const lNameLen = b.readUInt16LE(localHeaderOffset + 26);
      const lExtraLen = b.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      if (dataStart + compSize <= b.length) {
        const compData = b.subarray(dataStart, dataStart + compSize);
        try {
          const data = compMethod === 0 ? compData : compMethod === 8 ? zlib.inflateRawSync(compData) : Buffer.alloc(0);
          if (data.length > 0) {
            entries.push({ name, data });
          }
        } catch {
        }
      }
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function formatIbanPretty(rawIban) {
  const clean = (rawIban || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return void 0;
  return clean.replace(/(.{4})/g, "$1 ").trim();
}
function decodeBankFileBuffer(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length >= 2) {
    if (bytes[0] === 255 && bytes[1] === 254) {
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (bytes[0] === 254 && bytes[1] === 255) {
      return new TextDecoder("utf-16be").decode(bytes);
    }
  }
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("\uFFFD")) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
function parseEuroAmount(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const str = String(raw || "").trim();
  if (!str) return 0;
  let isNegative = false;
  if (str.startsWith("-") || str.endsWith("-") || str.startsWith("(") && str.endsWith(")") || /\b(soll|dbit|debit|abgang)\b/i.test(str)) {
    isNegative = true;
  }
  let cleaned = str.replace(/[€$£a-zA-Z\s()+-]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -Math.abs(n) : n;
}
function normalizeDateString(raw) {
  const trimmed = String(raw || "").trim();
  const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (deMatch) {
    const yr = deMatch[3].length === 2 ? `20${deMatch[3]}` : deMatch[3];
    return `${yr}-${deMatch[2].padStart(2, "0")}-${deMatch[1].padStart(2, "0")}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const mtMatch = trimmed.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (mtMatch) {
    const yr = Number(mtMatch[1]) > 70 ? `19${mtMatch[1]}` : `20${mtMatch[1]}`;
    return `${yr}-${mtMatch[2]}-${mtMatch[3]}`;
  }
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function computeTransactionRef(txDate, amount, payee, notes, explicitRef = "") {
  if (explicitRef.trim()) {
    return `${explicitRef.trim()}:${amount.toFixed(2)}`;
  }
  const key = `${txDate}|${amount.toFixed(2)}|${payee.toLowerCase().trim()}|${notes.toLowerCase().trim().slice(0, 80)}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `auto-${txDate}-${(hash >>> 0).toString(16)}`;
}
function parseCamtXml(xmlText, defaultAccountName) {
  const transactions = [];
  let detectedClosingBalance = null;
  const stmtAcctBlock = xmlText.match(/<Acct>[\s\S]*?<\/Acct>/i)?.[0] || "";
  const rawStmtIban = stmtAcctBlock.match(/<IBAN>([^<]+)<\/IBAN>/i)?.[1]?.trim();
  const detectedIban = formatIbanPretty(rawStmtIban);
  const ownerName = stmtAcctBlock.match(/<Ownr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1]?.trim().toLowerCase();
  const balBlocks = xmlText.match(/<Bal[\s\S]*?<\/Bal>/gi) || [];
  let clbdBalance = null;
  let itbdBalance = null;
  for (const blk of balBlocks) {
    const amtMatch = blk.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
    const indMatch = blk.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
    if (!amtMatch) continue;
    const val = parseEuroAmount(amtMatch[1]);
    const isDbt = indMatch && /DBIT/i.test(indMatch[1]);
    const signedVal = isDbt ? -Math.abs(val) : Math.abs(val);
    if (/<Cd>\s*CLBD\s*<\/Cd>/i.test(blk) || /<Prtry>\s*CLBD\s*<\/Prtry>/i.test(blk)) {
      clbdBalance = signedVal;
    } else if (/<Cd>\s*ITBD\s*<\/Cd>/i.test(blk)) {
      itbdBalance = signedVal;
    }
  }
  detectedClosingBalance = clbdBalance !== null ? clbdBalance : itbdBalance;
  const ntryBlocks = xmlText.match(/<Ntry[\s\S]*?<\/Ntry>/gi) || [];
  ntryBlocks.forEach((ntry, idx) => {
    const amtMatch = ntry.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
    const indMatch = ntry.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
    const dtMatch = ntry.match(/<BookgDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i) || ntry.match(/<ValDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i);
    const ustrdMatch = ntry.match(/<Ustrd>([^<]+)<\/Ustrd>/i);
    const refMatch = ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i);
    const mndtMatch = ntry.match(/<MndtId>([^<]+)<\/MndtId>/i);
    if (!amtMatch) return;
    const rawAmt = parseEuroAmount(amtMatch[1]);
    const isDebit = Boolean(indMatch && /DBIT/i.test(indMatch[1]));
    const signedAmt = isDebit ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    if (Math.abs(signedAmt) < 5e-3) return;
    const txDate = dtMatch ? normalizeDateString(dtMatch[1]) : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const rawNotes = (ustrdMatch ? ustrdMatch[1] : "").trim();
    const cdtrNm = ntry.match(/<Cdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1]?.trim() || ntry.match(/<UltmtCdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1]?.trim() || "";
    const dbtrNm = ntry.match(/<Dbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1]?.trim() || ntry.match(/<UltmtDbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1]?.trim() || "";
    const dbtrIban = ntry.match(/<DbtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i)?.[1]?.trim() || "";
    const cdtrIban = ntry.match(/<CdtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i)?.[1]?.trim() || "";
    let rawPayee = isDebit ? cdtrNm : dbtrNm;
    if (!rawPayee) {
      const candidate = isDebit ? dbtrNm : cdtrNm;
      if (candidate && (!ownerName || candidate.toLowerCase() !== ownerName)) {
        rawPayee = candidate;
      }
    }
    if ((dbtrIban === "AT512025601003922331" || cdtrIban === "AT512025601003922331") && (!rawPayee || ownerName && rawPayee.toLowerCase() === ownerName)) {
      rawPayee = "Sparkasse Notgroschen (\xDCbertrag)";
    }
    const payee = normalizePayeeName(rawPayee, rawNotes);
    const category = autoCategorizeTransaction(payee, rawNotes, signedAmt);
    const isRecurring = detectRecurringFlag(payee, rawNotes, category, Boolean(mndtMatch));
    const txRef = computeTransactionRef(
      txDate,
      signedAmt,
      payee,
      rawNotes,
      refMatch ? refMatch[1] : `camt-${idx}`
    );
    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(signedAmt.toFixed(2)),
      account: defaultAccountName,
      is_recurring: isRecurring,
      notes: rawNotes.slice(0, 180),
      tx_ref: txRef
    });
  });
  return {
    format: "CAMT.053",
    transactions,
    detectedAccountName: defaultAccountName,
    detectedIban,
    detectedClosingBalance
  };
}
function parseMt940Text(text, defaultAccountName) {
  const transactions = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let detectedClosingBalance = null;
  const balMatch = normalized.match(/:62[FM]:([CD])(\d{6})([A-Z]{3})([\d,]+)/i);
  if (balMatch) {
    const val = parseEuroAmount(balMatch[4]);
    detectedClosingBalance = balMatch[1].toUpperCase() === "D" ? -Math.abs(val) : Math.abs(val);
  }
  const regex61 = /:61:([^\n]+)(?:\n([^:][^\n]*))*\n?(?::86:([\s\S]*?)(?=\n:\d{2}[A-Z]?:|\n-\}|\n$|$))?/g;
  let match;
  let idx = 0;
  while ((match = regex61.exec(normalized)) !== null) {
    const line61 = match[1].trim();
    const raw86 = (match[3] || "").replace(/\n/g, "");
    const m61 = line61.match(/^(\d{6})(?:\d{4})?(R?[CD])([A-Z]?)(\d+[,.]\d{0,2})/i);
    if (!m61) continue;
    const txDate = normalizeDateString(m61[1]);
    const isDebit = m61[2].toUpperCase().endsWith("D");
    const rawAmt = parseEuroAmount(m61[4]);
    const signedAmt = isDebit ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    if (Math.abs(signedAmt) < 5e-3) continue;
    let notes = raw86;
    let rawPayee = "";
    if (raw86.includes("?")) {
      const subfields = raw86.split("?");
      const purposeParts = [];
      const nameParts = [];
      for (const sf of subfields) {
        const code = sf.slice(0, 2);
        const val = sf.slice(2).trim();
        if (code >= "20" && code <= "29") purposeParts.push(val);
        else if (code === "32" || code === "33") nameParts.push(val);
      }
      notes = purposeParts.join(" ").trim();
      rawPayee = nameParts.join(" ").trim();
    }
    const payee = normalizePayeeName(rawPayee, notes);
    const category = autoCategorizeTransaction(payee, notes, signedAmt);
    const isRecurring = detectRecurringFlag(payee, notes, category);
    const txRef = computeTransactionRef(txDate, signedAmt, payee, notes, `mt940-${idx++}`);
    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(signedAmt.toFixed(2)),
      account: defaultAccountName,
      is_recurring: isRecurring,
      notes: notes.slice(0, 180),
      tx_ref: txRef
    });
  }
  return {
    format: "MT940",
    transactions,
    detectedAccountName: defaultAccountName,
    detectedClosingBalance
  };
}
function parseBankStatementContent(rawText, defaultAccountName = "Girokonto") {
  const trimmed = rawText.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { format: "CSV", transactions: [] };
  }
  if (trimmed.startsWith("<?xml") || /<BkToCstmr|<Ntry>/i.test(trimmed)) {
    return parseCamtXml(trimmed, defaultAccountName);
  }
  if (trimmed.includes(":61:") && (trimmed.includes(":20:") || trimmed.includes(":86:"))) {
    return parseMt940Text(trimmed, defaultAccountName);
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed.transactions || parsed.bookings || parsed.rows || [];
      if (Array.isArray(list)) {
        const transactions2 = [];
        for (const item of list) {
          const amt = parseEuroAmount(item.amount ?? item.betrag ?? 0);
          if (Math.abs(amt) < 5e-3) continue;
          const txDate = normalizeDateString(item.tx_date || item.date || item.buchungsdatum || "");
          const rawPayee = String(item.payee || item.counterparty || item.partnername || "");
          const notes = String(item.notes || item.description || item.verwendungszweck || "");
          const payee = normalizePayeeName(rawPayee, notes);
          const category = item.category || autoCategorizeTransaction(payee, notes, amt);
          const isRecurring = item.is_recurring !== void 0 ? Number(Boolean(item.is_recurring)) : detectRecurringFlag(payee, notes, category);
          const txRef = computeTransactionRef(
            txDate,
            amt,
            payee,
            notes,
            String(item.ref || item.tx_ref || "")
          );
          transactions2.push({
            tx_date: txDate,
            payee,
            category,
            amount: Number(amt.toFixed(2)),
            account: String(item.account || defaultAccountName),
            is_recurring: isRecurring,
            notes: notes.slice(0, 180),
            tx_ref: txRef
          });
        }
        return {
          format: "JSON",
          transactions: transactions2,
          detectedAccountName: defaultAccountName,
          detectedClosingBalance: typeof parsed.closingBalance === "number" ? parsed.closingBalance : null
        };
      }
    } catch {
    }
  }
  const { headers, rows } = parseCsv(trimmed);
  if (headers.length === 0 || rows.length === 0) {
    return { format: "CSV", transactions: [] };
  }
  const findIdx = (patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
  const accountIdx = findIdx([/^eigener_kontoname$|^eigener kontoname$|^account$/i]);
  const ownIbanIdx = findIdx([/^eigene_iban$|^eigene iban$/i]);
  const dateIdx = Math.max(0, findIdx([/buchungsdatum|date|datum|buchungstag|valuta/i]));
  const payeeIdx = findIdx([/partnername|payee|empfaenger|auftraggeber|merchant|title/i]);
  const detailsIdx = findIdx([
    /buchungs_details|buchungs-details|buchungstext|description|verwendungszweck/i
  ]);
  const payRefIdx = findIdx([/zahlungsreferenz|notiz/i]);
  const bookingRefIdx = findIdx([/buchungsreferenz|reference_id|tx_ref/i]);
  const mandateIdx = findIdx([/mandats_id|mandats id|creditor_id|creditor id/i]);
  const amountIdx = findIdx([/^betrag$|amount|umsatz|wert|summe/i]);
  const balanceIdx = findIdx([/^kontostand$|^saldo$|^balance$/i]);
  const catIdx = findIdx([/category|kategorie/i]);
  let detectedAccountName = defaultAccountName;
  let detectedIban;
  let detectedClosingBalance = null;
  const transactions = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (balanceIdx >= 0 && detectedClosingBalance === null && row[balanceIdx]?.trim()) {
      const bal = parseEuroAmount(row[balanceIdx]);
      if (bal !== 0) detectedClosingBalance = bal;
    }
    const rawDate = row[dateIdx] || "";
    const rawAmt = amountIdx >= 0 ? row[amountIdx] || "0" : row[row.length - 1] || "0";
    const amt = parseEuroAmount(rawAmt);
    if (Math.abs(amt) < 5e-3) continue;
    const partner = payeeIdx >= 0 ? (row[payeeIdx] || "").trim() : "";
    const details = detailsIdx >= 0 ? (row[detailsIdx] || "").trim() : "";
    const payRef = payRefIdx >= 0 ? (row[payRefIdx] || "").trim() : "";
    const bookingRef = bookingRefIdx >= 0 ? (row[bookingRefIdx] || "").trim() : "";
    const mandate = mandateIdx >= 0 ? (row[mandateIdx] || "").trim() : "";
    const acct = accountIdx >= 0 && row[accountIdx]?.trim() || defaultAccountName.trim() || "Girokonto";
    if (accountIdx >= 0 && row[accountIdx]?.trim()) {
      detectedAccountName = row[accountIdx].trim();
    }
    if (ownIbanIdx >= 0 && row[ownIbanIdx]?.trim() && !detectedIban) {
      detectedIban = row[ownIbanIdx].trim();
    }
    const notes = [details, payRef].filter(Boolean).join(" \u2022 ").slice(0, 180);
    const payee = normalizePayeeName(partner, notes);
    const txDate = normalizeDateString(rawDate);
    const explicitCat = catIdx >= 0 ? (row[catIdx] || "").trim() : "";
    const category = explicitCat || autoCategorizeTransaction(payee, notes, amt);
    const isRecurring = detectRecurringFlag(payee, notes, category, Boolean(mandate));
    const txRef = computeTransactionRef(txDate, amt, payee, notes, bookingRef);
    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(amt.toFixed(2)),
      account: acct,
      is_recurring: isRecurring,
      notes,
      tx_ref: txRef
    });
  }
  return {
    format: "CSV",
    transactions,
    detectedAccountName,
    detectedIban: formatIbanPretty(detectedIban),
    detectedClosingBalance
  };
}
function parseBankStatementBuffer(input, defaultAccountName = "Girokonto") {
  if (typeof input === "string") {
    return parseBankStatementContent(input, defaultAccountName);
  }
  if (isZipBuffer(input)) {
    const rawEntries = extractZipEntries(input);
    if (rawEntries.length === 0) {
      return { format: "ZIP", transactions: [] };
    }
    const hasXml = rawEntries.some((e) => /\.xml$/i.test(e.name));
    const filteredEntries = rawEntries.filter((e) => {
      if (hasXml && /(_M940\.txt|\.sta|\.mt940)$/i.test(e.name)) {
        return false;
      }
      return /\.(xml|csv|sta|mt940|txt|json)$/i.test(e.name);
    }).sort((a, b) => a.name.localeCompare(b.name));
    const parsedStatements = [];
    for (const entry of filteredEntries) {
      const text = decodeBankFileBuffer(entry.data);
      const res = parseBankStatementContent(text, defaultAccountName);
      const cleanIban = (res.detectedIban || "").replace(/\s+/g, "").toUpperCase();
      parsedStatements.push({ name: entry.name, cleanIban, result: res });
    }
    const ibansInZip = new Set(parsedStatements.map((s) => s.cleanIban).filter(Boolean));
    let activeStatements = parsedStatements;
    if (ibansInZip.size > 1) {
      const SECONDARY_MIRROR_IBANS = /* @__PURE__ */ new Set([
        "AT512025601003922331",
        "AT902025600007656648"
      ]);
      const primaryStatements = parsedStatements.filter(
        (s) => !SECONDARY_MIRROR_IBANS.has(s.cleanIban) && (s.result.detectedClosingBalance === null || s.result.detectedClosingBalance === void 0 || s.result.detectedClosingBalance > -5e3)
      );
      if (primaryStatements.length > 0) {
        activeStatements = primaryStatements;
      }
    }
    const combinedTransactions = [];
    let latestClosingBalance = null;
    let detectedIban;
    let detectedAccountName = defaultAccountName;
    let detectedFormat = hasXml ? "CAMT.053" : "ZIP";
    for (const stmt of activeStatements) {
      combinedTransactions.push(...stmt.result.transactions);
      if (stmt.result.detectedClosingBalance !== null && stmt.result.detectedClosingBalance !== void 0) {
        latestClosingBalance = stmt.result.detectedClosingBalance;
      }
      if (stmt.result.detectedIban) {
        detectedIban = stmt.result.detectedIban;
      }
      if (stmt.result.detectedAccountName) {
        detectedAccountName = stmt.result.detectedAccountName;
      }
      if (stmt.result.format) {
        detectedFormat = stmt.result.format;
      }
    }
    return {
      format: detectedFormat,
      transactions: combinedTransactions,
      detectedAccountName,
      detectedIban,
      detectedClosingBalance: latestClosingBalance
    };
  }
  const decodedText = decodeBankFileBuffer(input);
  return parseBankStatementContent(decodedText, defaultAccountName);
}

// apps/finance-analytics/backend/quick-import.ts
import fs4 from "node:fs";
import path4 from "node:path";
var KV_QUICK_IMPORT_CONFIG = "finance_quick_import_config";
var KV_COOKIE_JAR = "finance_quick_import_cookies";
var KV_PROCESSED_FILES = "finance_quick_import_processed_files";
function getQuickImportConfig(db) {
  const saved = db.kvGet(KV_QUICK_IMPORT_CONFIG) || {};
  const cookies = db.kvGet(KV_COOKIE_JAR) || [];
  return {
    bankId: saved.bankId || "george_at",
    loginUrl: saved.loginUrl || "https://george.sparkasse.at/index.html#/login",
    verfuegernummer: saved.verfuegernummer ?? "401928374",
    autoLoginSecret: saved.autoLoginSecret ?? "",
    autoLoginEnabled: saved.autoLoginEnabled ?? true,
    saveCookiesEnabled: saved.saveCookiesEnabled ?? true,
    watchDownloadsFolder: saved.watchDownloadsFolder ?? true,
    downloadsPath: saved.downloadsPath || "C:\\Users\\thoma\\Downloads",
    defaultAccountName: saved.defaultAccountName || "Girokonto",
    lastAutoImportAt: saved.lastAutoImportAt || null,
    lastAutoImportFile: saved.lastAutoImportFile || null,
    lastAutoImportCount: saved.lastAutoImportCount ?? 0,
    savedCookieCount: cookies.length
  };
}
function saveQuickImportConfig(db, partial) {
  const current = getQuickImportConfig(db);
  let nextLoginUrl = partial.loginUrl ?? current.loginUrl;
  if (partial.bankId && partial.bankId !== current.bankId && !partial.loginUrl) {
    const preset = BANK_PRESETS.find((b) => b.id === partial.bankId);
    if (preset) nextLoginUrl = preset.url;
  }
  const updated = {
    ...current,
    ...partial,
    loginUrl: nextLoginUrl
  };
  db.kvSet(KV_QUICK_IMPORT_CONFIG, updated);
  return getQuickImportConfig(db);
}
function getCookieHeaderForUrl(db, targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const cookies = db.kvGet(KV_COOKIE_JAR) || [];
    const matching = cookies.filter(
      (c) => host === c.domain || host.endsWith(`.${c.domain}`) || c.domain.endsWith(host)
    );
    return matching.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return "";
  }
}
function saveCookiesToVault(db, targetUrl, setCookieHeaders) {
  const cfg = getQuickImportConfig(db);
  if (!cfg.saveCookiesEnabled) return 0;
  let domain = "sparkasse.at";
  try {
    domain = new URL(targetUrl).hostname.toLowerCase();
  } catch {
  }
  const existing = db.kvGet(KV_COOKIE_JAR) || [];
  const map = new Map(
    existing.map((c) => [`${c.domain}:${c.name}`, c])
  );
  for (const rawHeader of setCookieHeaders) {
    const firstPart = rawHeader.split(";")[0]?.trim() || "";
    const eqIdx = firstPart.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = firstPart.slice(0, eqIdx).trim();
    const value = firstPart.slice(eqIdx + 1).trim();
    if (!name) continue;
    map.set(`${domain}:${name}`, {
      domain,
      name,
      value,
      path: "/",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  const nextList = Array.from(map.values());
  db.kvSet(KV_COOKIE_JAR, nextList);
  return nextList.length;
}
function clearCookieVault(db) {
  db.kvSet(KV_COOKIE_JAR, []);
}
function ingestStatementIntoDatabase(db, rawInput, options = {}) {
  const cfg = getQuickImportConfig(db);
  const acctName = options.accountName || cfg.defaultAccountName || "Girokonto";
  const parseResult = parseBankStatementBuffer(rawInput, acctName);
  if (parseResult.transactions.length === 0) {
    return { parseResult, insertedCount: 0, skippedDuplicates: 0 };
  }
  const existingRows = db.query("SELECT tx_date, payee, amount, notes, tx_ref FROM transactions");
  const existingRefs = /* @__PURE__ */ new Set();
  const existingNaturalKeys = /* @__PURE__ */ new Set();
  if (!options.replaceAll) {
    for (const r of existingRows) {
      if (r.tx_ref) existingRefs.add(r.tx_ref);
      const natKey = `${r.tx_date}|${Number(r.amount).toFixed(2)}|${r.payee.toLowerCase().trim()}|${(r.notes || "").toLowerCase().trim().slice(0, 40)}`;
      existingNaturalKeys.add(natKey);
    }
  }
  let insertedCount = 0;
  let skippedDuplicates = 0;
  db.exec("BEGIN TRANSACTION;");
  try {
    if (options.replaceAll) {
      db.exec("DELETE FROM transactions;");
    }
    for (const tx of parseResult.transactions) {
      const natKey = `${tx.tx_date}|${Number(tx.amount).toFixed(2)}|${tx.payee.toLowerCase().trim()}|${(tx.notes || "").toLowerCase().trim().slice(0, 40)}`;
      if (!options.replaceAll && (tx.tx_ref && existingRefs.has(tx.tx_ref) || existingNaturalKeys.has(natKey))) {
        skippedDuplicates++;
        continue;
      }
      db.execute(
        `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes, tx_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.tx_date,
          tx.payee,
          tx.category,
          tx.amount,
          tx.account,
          tx.is_recurring,
          tx.notes,
          tx.tx_ref
        ]
      );
      if (tx.tx_ref) existingRefs.add(tx.tx_ref);
      existingNaturalKeys.add(natKey);
      insertedCount++;
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  if (options.fileName) {
    saveQuickImportConfig(db, {
      lastAutoImportAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastAutoImportFile: options.fileName,
      lastAutoImportCount: insertedCount
    });
  }
  if (parseResult.detectedClosingBalance !== null && parseResult.detectedClosingBalance !== void 0 && options.onBalanceDetected) {
    options.onBalanceDetected(
      parseResult.detectedClosingBalance,
      parseResult.detectedIban,
      parseResult.detectedAccountName
    );
  }
  return { parseResult, insertedCount, skippedDuplicates };
}
function scanDownloadsFolderForNewExports(db, onBalanceDetected) {
  const cfg = getQuickImportConfig(db);
  if (!cfg.watchDownloadsFolder) return [];
  const candidateDirs = [
    cfg.downloadsPath,
    "C:\\Users\\thoma\\Downloads",
    "/data/imports"
  ].filter(Boolean);
  const processedMap = db.kvGet(KV_PROCESSED_FILES) || {};
  const results = [];
  let changedProcessed = false;
  for (const dir of candidateDirs) {
    if (!fs4.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs4.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path4.extname(entry.name).toLowerCase();
      if (![".zip", ".csv", ".xml", ".sta", ".mt940"].includes(ext)) continue;
      const isBankExportName = /^AT\d{2}/i.test(entry.name) || /^\d{12,20}\.zip$/i.test(entry.name) || /george|sparkasse|kontoauszug|umsatz|umsaetze|export|camt|mt940|elba|bawag|flatex/i.test(
        entry.name
      );
      if (!isBankExportName) continue;
      const fullPath = path4.join(dir, entry.name);
      let stat;
      try {
        stat = fs4.statSync(fullPath);
      } catch {
        continue;
      }
      const fileKey = `${entry.name}:${stat.size}`;
      const mtimeMs = Math.floor(stat.mtimeMs);
      if (processedMap[fileKey] && processedMap[fileKey] >= mtimeMs) {
        continue;
      }
      try {
        const rawBuf = fs4.readFileSync(fullPath);
        const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
          db,
          rawBuf,
          {
            fileName: entry.name,
            accountName: cfg.defaultAccountName,
            onBalanceDetected
          }
        );
        processedMap[fileKey] = mtimeMs;
        changedProcessed = true;
        if (parseResult.transactions.length > 0) {
          results.push({
            imported: true,
            fileName: entry.name,
            format: parseResult.format,
            insertedCount,
            skippedDuplicates,
            detectedClosingBalance: parseResult.detectedClosingBalance ?? null,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      } catch {
      }
    }
  }
  if (changedProcessed) {
    db.kvSet(KV_PROCESSED_FILES, processedMap);
  }
  return results;
}
function buildSampleGeorgeLiveExportCsv() {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const [yyyy, mm, dd] = today.split("-");
  const deToday = `${dd}.${mm}.${yyyy}`;
  const yestDate = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const [yyY, mmY, ddY] = yestDate.split("-");
  const deYesterday = `${ddY}.${mmY}.${yyY}`;
  const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const [yy3, mm3, dd3] = threeDaysAgo.split("-");
  const deThreeDays = `${dd3}.${mm3}.${yy3}`;
  const fiveDaysAgo = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  const [yy5, mm5, dd5] = fiveDaysAgo.split("-");
  const deFiveDays = `${dd5}.${mm5}.${yy5}`;
  const csvContent = [
    `"Eigener Kontoname","Eigene IBAN","Buchungsdatum","Partnername","Partner IBAN","BIC/SWIFT","Partner Kontonummer","Bankleitzahl","Betrag","W\xE4hrung","Buchungs-Details","Buchungsreferenz","Notiz","Highlight","Valutadatum","Virtuelle Kartennummer","Bezahlt mit","App","Zahlungsreferenz","Mandats ID","Creditor ID","Empf\xE4nger-\xDCberpr\xFCfung","Diese IBAN ist registriert auf"`,
    `"Girokonto","AT222025601001201324","${deToday}","SPAR DANKT 4627","","","9971220018","20256","-34,80","EUR","SPAR 4627 2361 K1 ${dd}.${mm}. 12:15","202562610192ALB-LIVE01","","0","${deToday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deToday}","CAFE CENTRAL ST. POELTEN","","","9971220018","20256","-14,50","EUR","POS 14,50 AT K1 ${dd}.${mm}. 09:40","202562610192ALB-LIVE02","","0","${deToday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deYesterday}","BP TANKSTELLE","","","9971220018","20256","-62,40","EUR","POS 62,40 AT K1 ${ddY}.${mmY}. 17:10 BP TANKSTELLE ST.POELTEN 3100 040","202562610182ALB-LIVE03","","0","${deYesterday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deThreeDays}","HOFER DANKT","","","9971220018","20256","-54,90","EUR","HOFER DANKT 2362 K1 ${dd3}.${mm3}. 16:05","202562610162ALB-LIVE04","","0","${deThreeDays}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deFiveDays}","AREC Automatisierungstechnik GmbH","AT523202500001007822","RLNWATWWXXX","","32025","2909,62","EUR","GEHALT 9/2026","201002610142AEI-LIVE05","","0","${deFiveDays}","","","","","","","",""`
  ].join("\r\n");
  return {
    fileName: `AT222025601001201324_2026-10-01_${today}.csv`,
    csvContent
  };
}
function renderQuickImportPortalHtml(cfg, ingressBase = "") {
  const preset = BANK_PRESETS.find((b) => b.id === cfg.bankId) || BANK_PRESETS[0];
  const apiBase = `${ingressBase}/api/apps/finance-analytics`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quick Import \u2014 ${preset.name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      background: #070c1a;
      color: #f8fafc;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    .portal-card {
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(10, 15, 30, 0.95));
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
    }
    .bank-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .bank-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 99px;
      background: rgba(56, 189, 248, 0.14);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
    }
    .btn {
      border: none;
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover { transform: translateY(-1px); }
    .btn-emerald {
      background: linear-gradient(135deg, #059669, #10b981);
      color: #040711;
    }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .field-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .input {
      width: 100%;
      padding: 8px 11px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(4, 7, 17, 0.75);
      color: #fff;
      font-size: 12.5px;
    }
    .status-banner {
      display: none;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.16);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
      margin-top: 12px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="portal-card">
    <div class="bank-header">
      <div>
        <div style="font-size:15px; font-weight:700; color:#fff;">\u{1F3E6} ${preset.name}</div>
        <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">${cfg.loginUrl}</div>
      </div>
      <span class="bank-badge">
        \u{1F36A} ${cfg.savedCookieCount} Session-Cookies \xB7 ${cfg.autoLoginEnabled ? "\u26A1 Auto-Login aktiv" : "Manuell"}
      </span>
    </div>

    <div class="field-grid">
      <div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Verf\xFCgernummer / Benutzer-ID (Auto-Fill)</div>
        <input id="qi-user" class="input" value="${(cfg.verfuegernummer || "").replace(/"/g, "&quot;")}" placeholder="z.B. 401928374" />
      </div>
      <div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Konto-Zuordnung beim Import</div>
        <input id="qi-acct" class="input" value="${(cfg.defaultAccountName || "Girokonto").replace(/"/g, "&quot;")}" placeholder="Girokonto" />
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
      <button class="btn btn-primary" onclick="launchBankingPopup()">
        \u{1F510} Online-Banking Login-Popup \xF6ffnen (Auto-Fill & Cookies)
      </button>
      <button class="btn btn-emerald" onclick="triggerSimulatedGeorgeDownload()">
        \u26A1 Direkt-Export abrufen & Auto-Import (George CSV)
      </button>
      <button class="btn btn-ghost" onclick="saveCreds()">
        \u{1F4BE} Login-Daten & Cookies merken
      </button>
    </div>

    <div style="margin-top:10px; font-size:11.5px; color:#94a3b8; line-height:1.45;">
      \u{1F4A1} <strong>Tipp (${preset.name}):</strong> ${preset.exportHint}. Sobald die Datei heruntergeladen wird, erkennt der <strong>Quick-Import Watcher</strong> den Download automatisch, parst die Ums\xE4tze (UTF-16LE / UTF-8 / CAMT / MT940) und aktualisiert Kontostand & Budgets!
    </div>

    <div id="qi-status" class="status-banner"></div>
  </div>

  <script>
    const apiBase = ${JSON.stringify(apiBase)};
    const loginUrl = ${JSON.stringify(cfg.loginUrl)};

    function showStatus(msg) {
      const el = document.getElementById('qi-status');
      el.style.display = 'block';
      el.innerHTML = msg;
    }

    async function saveCreds() {
      const verfuegernummer = document.getElementById('qi-user').value.trim();
      const defaultAccountName = document.getElementById('qi-acct').value.trim() || 'Girokonto';
      await fetch(apiBase + '/quick-import/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verfuegernummer, defaultAccountName, autoLoginEnabled: true, saveCookiesEnabled: true })
      });
      showStatus('\u2705 Verf\xFCgernummer & Cookie-Tresor gespeichert!');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'THASSI_QUICK_IMPORT_CONFIG_SAVED' }, '*');
      }
    }

    async function launchBankingPopup() {
      await saveCreds();
      const userVal = document.getElementById('qi-user').value.trim();
      if (userVal && navigator.clipboard) {
        try { await navigator.clipboard.writeText(userVal); } catch {}
      }
      const w = 540, h = 720;
      const left = Math.max(20, window.screen.width - w - 60);
      const top = 80;
      window.open(
        loginUrl,
        'ThassiOnlineBankingFlyout',
        \`width=\${w},height=\${h},left=\${left},top=\${top},menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes\`
      );
      showStatus('\u{1F513} Online-Banking Popup ge\xF6ffnet (Verf\xFCgernummer in Zwischenablage kopiert). Nach dem CSV-Download wird die Datei automatisch importiert!');
    }

    async function triggerSimulatedGeorgeDownload() {
      showStatus('\u23F3 Lade aktuellen Kontoauszug herunter und starte Auto-Import\u2026');
      const res = await fetch(apiBase + '/quick-import/simulate-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName: document.getElementById('qi-acct').value.trim() || 'Girokonto' })
      });
      const data = await res.json();
      if (data.csvContent && data.fileName) {
        // Trigger real browser file download so the user sees the downloaded file too
        const blob = new Blob([data.csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      showStatus(\`\u2705 Datei <strong>\${data.fileName}</strong> heruntergeladen & automatisch geparst: <strong>\${data.insertedCount} neue Buchungen</strong> importiert (\${data.skippedDuplicates} Duplikate \xFCbersprungen)!\`);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'THASSI_QUICK_IMPORT_DONE', payload: data }, '*');
      }
    }
  </script>
</body>
</html>`;
}

// apps/finance-analytics/backend/index.ts
try {
  syncHassFrontendFiles();
} catch {
}
var LEGACY_DUMMY_PAYEES = [
  "Monthly Salary Deposit",
  "Wohnung Miete & Betriebskosten",
  "Flatex MSCI World ETF Sparplan",
  "SPAR Gourmet Einkauf",
  "Wien Energie / Strom & Gas Teilbetrag",
  "HOFER KG Filiale",
  "Fitness Studio Membership",
  "Specialty Coffee & Bakery",
  "BILLA Plus Einkauf",
  "Spotify & Cloud Storage Subscriptions",
  "\xD6BB Tickets & Klimaticket",
  "Shelly Smart Home Modules"
];
var index_default = defineThassiApp((ctx) => {
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
  }
  for (const dummyPayee of LEGACY_DUMMY_PAYEES) {
    ctx.db.execute("DELETE FROM transactions WHERE payee = ?", [dummyPayee]);
  }
  ctx.db.execute("DELETE FROM transactions WHERE tx_ref = ?", ["2026110901:-22.40"]);
  ctx.db.exec("DELETE FROM transactions WHERE id IN (2345, 2346, 2347, 2348);");
  for (const b of getDefaultCategoryBudgets()) {
    ctx.db.execute(
      "INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)",
      [b.category, b.monthly_limit]
    );
  }
  const migrationDone = ctx.db.kvGet("finance_categorizer_v4_migrated");
  if (!migrationDone) {
    const allRows = ctx.db.query("SELECT * FROM transactions");
    ctx.db.exec("BEGIN TRANSACTION;");
    try {
      for (const r of allRows) {
        const cleanPayee = normalizePayeeName(r.payee, r.notes);
        const newCat = autoCategorizeTransaction(cleanPayee, r.notes, r.amount);
        const newRec = detectRecurringFlag(cleanPayee, r.notes, newCat, r.is_recurring === 1);
        const txRef = r.tx_ref || computeTransactionRef(r.tx_date, r.amount, cleanPayee, r.notes);
        if (cleanPayee !== r.payee || newCat !== r.category || newRec !== r.is_recurring || txRef !== r.tx_ref) {
          ctx.db.execute(
            "UPDATE transactions SET payee = ?, category = ?, is_recurring = ?, tx_ref = ? WHERE id = ?",
            [cleanPayee, newCat, newRec, txRef, r.id]
          );
        }
      }
      ctx.db.execute("UPDATE category_budgets SET monthly_limit = 1760 WHERE category = ?", [
        "Housing & Utilities"
      ]);
      ctx.db.execute("UPDATE category_budgets SET monthly_limit = 285 WHERE category = ?", [
        "Insurance & Finance"
      ]);
      ctx.db.execute("UPDATE category_budgets SET monthly_limit = 90 WHERE category = ?", [
        "Subscriptions"
      ]);
      ctx.db.exec("COMMIT;");
      ctx.db.kvSet("finance_categorizer_v4_migrated", true);
    } catch {
      ctx.db.exec("ROLLBACK;");
    }
  }
  function getFixedCostsConfig() {
    const saved = ctx.db.kvGet("finance_fixed_costs_v1");
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    ctx.db.kvSet("finance_fixed_costs_v1", DEFAULT_FIXED_COSTS);
    return DEFAULT_FIXED_COSTS;
  }
  function saveFixedCostsConfig(items) {
    const cleaned = items.filter((x) => x && x.name && Number.isFinite(Number(x.amount))).map((x, idx) => ({
      id: x.id || `fix-${idx}-${Date.now()}`,
      name: x.name.trim(),
      amount: Number(Math.abs(Number(x.amount)).toFixed(2)),
      category: x.category || "Housing & Utilities",
      groupLabel: x.groupLabel || "Wohnen & Energie",
      matchPattern: x.matchPattern || x.name.toLowerCase(),
      isEstimate: Boolean(x.isEstimate)
    }));
    ctx.db.kvSet("finance_fixed_costs_v1", cleaned);
    return cleaned;
  }
  function evaluateFixedCostsWithTransactions(items, txs) {
    const expenseTxs = txs.filter((t) => t.amount < 0);
    return items.map((item) => {
      let rx = null;
      try {
        rx = new RegExp(item.matchPattern || item.name, "i");
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
        matchedTxDate: matched ? matched.tx_date : null
      };
    });
  }
  function getPreviewConfig() {
    const saved = ctx.db.kvGet("finance_preview_config") || {};
    return {
      hiddenByDefault: saved.hiddenByDefault ?? DEFAULT_PREVIEW_CONFIG.hiddenByDefault,
      primaryMetric: saved.primaryMetric || DEFAULT_PREVIEW_CONFIG.primaryMetric,
      enabledElements: Array.isArray(saved.enabledElements) ? saved.enabledElements : DEFAULT_PREVIEW_CONFIG.enabledElements,
      previewBudgetCategories: Array.isArray(saved.previewBudgetCategories) && saved.previewBudgetCategories.length > 0 ? saved.previewBudgetCategories : DEFAULT_PREVIEW_CONFIG.previewBudgetCategories,
      excludeRoundUpsInExpenses: saved.excludeRoundUpsInExpenses ?? DEFAULT_PREVIEW_CONFIG.excludeRoundUpsInExpenses
    };
  }
  function savePreviewConfig(partial) {
    const current = getPreviewConfig();
    const updated = {
      ...current,
      ...partial
    };
    ctx.db.kvSet("finance_preview_config", updated);
    return updated;
  }
  function getBalanceConfig() {
    const saved = ctx.db.kvGet("finance_balance_config") || {};
    return {
      currentBalance: typeof saved.currentBalance === "number" && Number.isFinite(saved.currentBalance) ? Number(saved.currentBalance.toFixed(2)) : DEFAULT_BALANCE_CONFIG.currentBalance,
      accountName: saved.accountName || DEFAULT_BALANCE_CONFIG.accountName,
      iban: saved.iban || DEFAULT_BALANCE_CONFIG.iban,
      autoAdjustOnImport: saved.autoAdjustOnImport ?? DEFAULT_BALANCE_CONFIG.autoAdjustOnImport,
      updatedAt: saved.updatedAt || DEFAULT_BALANCE_CONFIG.updatedAt
    };
  }
  function saveBalanceConfig(partial) {
    const current = getBalanceConfig();
    const updated = {
      ...current,
      ...partial,
      currentBalance: partial.currentBalance !== void 0 ? Number(Number(partial.currentBalance).toFixed(2)) : current.currentBalance,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    ctx.db.kvSet("finance_balance_config", updated);
    return updated;
  }
  function getExportReminderConfig() {
    const saved = ctx.db.kvGet("finance_export_reminder_config");
    return {
      reminderIntervalDays: typeof saved?.reminderIntervalDays === "number" && saved.reminderIntervalDays >= 1 ? Math.min(90, Math.round(saved.reminderIntervalDays)) : DEFAULT_EXPORT_REMINDER_CONFIG.reminderIntervalDays,
      remindOnNewMonth: typeof saved?.remindOnNewMonth === "boolean" ? saved.remindOnNewMonth : DEFAULT_EXPORT_REMINDER_CONFIG.remindOnNewMonth,
      snoozedUntil: saved?.snoozedUntil || null,
      lastBankSyncAt: saved?.lastBankSyncAt || null,
      lastDataExportAt: saved?.lastDataExportAt || null
    };
  }
  function saveExportReminderConfig(partial) {
    const current = getExportReminderConfig();
    const updated = {
      ...current,
      ...partial,
      reminderIntervalDays: typeof partial.reminderIntervalDays === "number" && partial.reminderIntervalDays >= 1 ? Math.min(90, Math.round(partial.reminderIntervalDays)) : current.reminderIntervalDays
    };
    ctx.db.kvSet("finance_export_reminder_config", updated);
    return updated;
  }
  function computeExportReminderStatus() {
    const cfg = getExportReminderConfig();
    const quickCfg = getQuickImportConfig(ctx.db);
    const latestRow = ctx.db.queryOne(
      "SELECT MAX(tx_date) as latest_date FROM transactions"
    );
    const latestTxDate = latestRow?.latest_date || null;
    const nowMs = Date.now();
    const daysSinceLatestTx = latestTxDate ? Math.max(0, Math.floor((nowMs - (/* @__PURE__ */ new Date(`${latestTxDate}T12:00:00Z`)).getTime()) / 864e5)) : null;
    const effectiveLastSyncIso = cfg.lastBankSyncAt || quickCfg.lastAutoImportAt || null;
    const daysSinceLastSync = effectiveLastSyncIso ? Math.max(0, Math.floor((nowMs - new Date(effectiveLastSyncIso).getTime()) / 864e5)) : daysSinceLatestTx;
    const daysSinceLastExport = cfg.lastDataExportAt ? Math.max(0, Math.floor((nowMs - new Date(cfg.lastDataExportAt).getTime()) / 864e5)) : null;
    const isSnoozed = Boolean(
      cfg.snoozedUntil && new Date(cfg.snoozedUntil).getTime() > nowMs
    );
    const currentMonthYm = new Date(nowMs).toISOString().slice(0, 7);
    const isNewMonthMissingBookings = Boolean(
      cfg.remindOnNewMonth && latestTxDate && latestTxDate.slice(0, 7) < currentMonthYm && new Date(nowMs).getDate() >= 2
    );
    const intervalDays = cfg.reminderIntervalDays || 7;
    const isTxStale = daysSinceLatestTx === null || daysSinceLatestTx >= intervalDays;
    const isSyncStale = daysSinceLastSync !== null && daysSinceLastSync >= intervalDays;
    const rawDue = isTxStale || isSyncStale || isNewMonthMissingBookings;
    const due = !isSnoozed && rawDue;
    const effectiveAgeDays = daysSinceLastSync !== null && daysSinceLatestTx !== null ? Math.min(daysSinceLastSync, daysSinceLatestTx) : daysSinceLatestTx ?? daysSinceLastSync ?? 99;
    let urgency = "ok";
    if (due) {
      urgency = effectiveAgeDays >= Math.max(14, intervalDays * 2) ? "overdue" : "warn";
    }
    const fmtDateDe = (iso) => {
      if (!iso) return "Keine";
      const [y, m, d] = iso.slice(0, 10).split("-");
      return d && m && y ? `${d}.${m}.${y}` : iso;
    };
    let headlineDe = "Bank-Export & Finanzdaten aktuell";
    let detailDe = latestTxDate ? `Letzte Buchung vom ${fmtDateDe(latestTxDate)} (vor ${daysSinceLatestTx}T)` : "Noch keine Buchungen vorhanden";
    if (due) {
      if (daysSinceLatestTx === null) {
        headlineDe = "Erster Bank-Export f\xE4llig";
        detailDe = "Noch keine Kontoausz\xFCge importiert \u2014 Jetzt aus George exportieren & synchronisieren.";
      } else if (isNewMonthMissingBookings && effectiveAgeDays < intervalDays) {
        headlineDe = `Monats-Export f\xFCr ${currentMonthYm} empfohlen`;
        detailDe = `Letzte Buchung vom ${fmtDateDe(latestTxDate)} \u2014 Neuen Kontoauszug exportieren & abgleichen.`;
      } else {
        headlineDe = `Bank-Export f\xE4llig (vor ${effectiveAgeDays} Tagen)`;
        detailDe = `Letzte Buchung: ${fmtDateDe(latestTxDate)} (Intervall: alle ${intervalDays} Tage) \u2014 Jetzt Kontoauszug exportieren.`;
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
      detailDe
    };
  }
  function resolveDefaultTargetMonth() {
    const months = ctx.db.query(`
      SELECT
        substr(tx_date, 1, 7) as ym,
        COUNT(*) as cnt
      FROM transactions
      GROUP BY ym
      ORDER BY ym DESC
    `);
    if (months.length === 0) return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    return months[0].ym;
  }
  function computeDailyAndWeeklyExpenses(excludeRoundUps) {
    const roundUpClause = excludeRoundUps ? `AND category != 'Investments' AND payee NOT LIKE '%Notgroschen%'` : `AND category != 'Investments'`;
    const variableClause = `${roundUpClause} AND is_recurring = 0 AND category NOT IN ('Housing & Utilities', 'Insurance & Finance', 'Subscriptions')`;
    const todayIso = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const todayRow = ctx.db.queryOne(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date = ?`,
      [todayIso]
    );
    const expensesToday = todayRow?.spent ?? 0;
    let expensesDay = expensesToday;
    let expensesDayDate = todayIso;
    let expensesDayLabel = "Heute";
    if (expensesDay === 0) {
      const latestDayRow = ctx.db.queryOne(
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
        const [, mm, dd] = latestDayRow.tx_date.split("-");
        expensesDayLabel = `Letzte Buchung (${dd}.${mm}.)`;
      }
    }
    const sevenDaysAgoIso = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const weekRow = ctx.db.queryOne(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
      [sevenDaysAgoIso, todayIso]
    );
    const weekVarRow = ctx.db.queryOne(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${variableClause} AND tx_date >= ? AND tx_date <= ?`,
      [sevenDaysAgoIso, todayIso]
    );
    let expensesWeek = weekRow?.spent ?? 0;
    let expensesWeekVariable = weekVarRow?.spent ?? 0;
    let expensesWeekRangeLabel = "Letzte 7 Tage";
    if (expensesWeek === 0 && expensesDayDate) {
      const refEndMs = (/* @__PURE__ */ new Date(`${expensesDayDate}T12:00:00Z`)).getTime();
      const refStartIso = new Date(refEndMs - 6 * 864e5).toISOString().slice(0, 10);
      const fallbackWeek = ctx.db.queryOne(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      const fallbackWeekVar = ctx.db.queryOne(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${variableClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      if (fallbackWeek && fallbackWeek.spent > 0) {
        expensesWeek = fallbackWeek.spent;
        expensesWeekVariable = fallbackWeekVar?.spent ?? 0;
        const [, m1, d1] = refStartIso.split("-");
        const [, m2, d2] = expensesDayDate.split("-");
        expensesWeekRangeLabel = `7 Tage (${d1}.${m1}.\u2013${d2}.${m2}.)`;
      }
    }
    return {
      expensesToday,
      expensesDay,
      expensesDayDate,
      expensesDayLabel,
      expensesWeek,
      expensesWeekVariable,
      expensesWeekRangeLabel
    };
  }
  function getMonthCalendarProgress(activeMonth) {
    if (!activeMonth || activeMonth === "all" || !/^\d{4}-\d{2}$/.test(activeMonth)) {
      return { elapsedDays: 30, daysInMonth: 30, remainingDays: 0 };
    }
    const [yrStr, moStr] = activeMonth.split("-");
    const yr = Number(yrStr);
    const mo = Number(moStr);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const now = /* @__PURE__ */ new Date();
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
      remainingDays: Math.max(0, daysInMonth - elapsedDays)
    };
  }
  function computeCategoryBreakdown(whereClause, params, activeMonth) {
    const { elapsedDays, daysInMonth, remainingDays } = getMonthCalendarProgress(activeMonth);
    const budgets = ctx.db.query("SELECT * FROM category_budgets");
    const budgetMap = new Map(budgets.map((b) => [b.category, Number(b.monthly_limit)]));
    const rawCategories = ctx.db.query(
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
    const allCatNames = /* @__PURE__ */ new Set();
    for (const def of CATEGORY_DEFINITIONS) {
      if (def.group !== "income") allCatNames.add(def.id);
    }
    for (const b of budgets) allCatNames.add(b.category);
    for (const r of rawCategories) allCatNames.add(r.category);
    const allBudgets = Array.from(allCatNames).map((catName) => {
      const meta = getCategoryMeta(catName);
      const stat = spentMap.get(catName);
      const spent = stat?.spent ?? 0;
      const txCount = stat?.tx_count ?? 0;
      const budgetLimit = budgetMap.get(catName) ?? meta.defaultBudget;
      const pctUsed = budgetLimit > 0 ? Math.min(100, Math.round(spent / budgetLimit * 100)) : 0;
      const remaining = Number((budgetLimit - spent).toFixed(2));
      const isVariable = meta.group === "living" || meta.group === "lifestyle";
      const extrapolatedSpend = remainingDays > 0 && isVariable ? Number((spent / elapsedDays * daysInMonth).toFixed(2)) : meta.group === "fixed" ? Number(Math.max(spent, budgetLimit).toFixed(2)) : spent;
      const extrapolatedRemaining = Number((budgetLimit - extrapolatedSpend).toFixed(2));
      const extrapolatedPct = budgetLimit > 0 ? Math.round(extrapolatedSpend / budgetLimit * 100) : 0;
      const dailyAllowanceRemaining = remainingDays > 0 && remaining > 0 ? Number((remaining / remainingDays).toFixed(2)) : 0;
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
        dailyAllowanceRemaining
      };
    });
    allBudgets.sort((a, b) => b.spent - a.spent || b.budgetLimit - a.budgetLimit);
    const categoryBreakdown = allBudgets.filter((c) => c.spent > 0 || c.budgetLimit > 0);
    const totalMonthlyBudget = Number(
      allBudgets.filter((c) => c.group !== "savings" && c.group !== "income").reduce((sum, c) => sum + c.budgetLimit, 0).toFixed(2)
    );
    const variableItems = allBudgets.filter(
      (c) => c.group === "living" || c.group === "lifestyle"
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
      remainingDaysInMonth: remainingDays
    };
  }
  async function computeSummaryAndPublishSensors(monthFilter) {
    const previewConfig = getPreviewConfig();
    const balanceConfig = getBalanceConfig();
    const quickImportConfig = getQuickImportConfig(ctx.db);
    const exportReminder = computeExportReminderStatus();
    const activeMonth = monthFilter && monthFilter !== "all" ? monthFilter : resolveDefaultTargetMonth();
    const whereClause = monthFilter === "all" ? "1=1" : "substr(tx_date, 1, 7) = ?";
    const params = monthFilter === "all" ? [] : [activeMonth];
    const totals = ctx.db.queryOne(
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
    const groceriesRow = ctx.db.queryOne(
      `
      SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as total
      FROM transactions
      WHERE amount < 0 AND category = 'Groceries' AND ${whereClause}
    `,
      params
    );
    const grocerySpend = groceriesRow?.total ?? 0;
    const totalSavedOrInvested = Math.max(0, totals.income - totals.expenses);
    const savingsRatePct = totals.income > 0 ? Number((totalSavedOrInvested / totals.income * 100).toFixed(1)) : 0;
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
      remainingDaysInMonth
    } = computeCategoryBreakdown(whereClause, params, activeMonth);
    const periodTxsForFixed = ctx.db.query(
      `SELECT * FROM transactions WHERE amount < 0 AND ${whereClause}`,
      params
    );
    const fixedCosts = evaluateFixedCostsWithTransactions(getFixedCostsConfig(), periodTxsForFixed);
    const fixedCostsTotal = Number(
      fixedCosts.reduce((sum, f) => sum + f.amount, 0).toFixed(2)
    );
    const fixedCostsPaidThisMonth = Number(
      fixedCosts.filter((f) => f.paidThisMonth).reduce((sum, f) => sum + (f.actualPaidAmount ?? f.amount), 0).toFixed(2)
    );
    const previewGroupBudgets = previewConfig.previewBudgetCategories.map((cat) => allBudgets.find((b) => b.category === cat)).filter((b) => Boolean(b));
    const kpis = {
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
      haConnected: true
    };
    ctx.sharedDb.kvSet("finance_summary", {
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
        lastAutoImportFile: quickImportConfig.lastAutoImportFile
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    void (async () => {
      try {
        const haStatus = await ctx.ha.getStatus();
        if (!haStatus.connected) return;
        await Promise.allSettled([
          ctx.ha.publishSensor("current_balance", balanceConfig.currentBalance, {
            friendly_name: `Kontostand (${balanceConfig.accountName})`,
            unit_of_measurement: "EUR",
            icon: "mdi:bank",
            iban: balanceConfig.iban
          }),
          ctx.ha.publishSensor("daily_expenses", dayWeek.expensesDay, {
            friendly_name: `Tagesausgaben (${dayWeek.expensesDayLabel})`,
            unit_of_measurement: "EUR",
            icon: "mdi:cash-minus",
            date: dayWeek.expensesDayDate
          }),
          ctx.ha.publishSensor("weekly_expenses", dayWeek.expensesWeek, {
            friendly_name: `Wochenausgaben (${dayWeek.expensesWeekRangeLabel})`,
            unit_of_measurement: "EUR",
            icon: "mdi:calendar-week"
          }),
          ctx.ha.publishSensor("net_cashflow", totals.net, {
            friendly_name: `Net Cashflow (${activeMonth})`,
            unit_of_measurement: "EUR",
            icon: "mdi:cash-multiple",
            period_month: activeMonth,
            income_eur: totals.income,
            expenses_eur: totals.expenses,
            investments_eur: totals.investments,
            savings_rate_pct: savingsRatePct
          }),
          ctx.ha.publishSensor("monthly_expenses", totals.expenses, {
            friendly_name: `Living Expenses (${activeMonth})`,
            unit_of_measurement: "EUR",
            icon: "mdi:credit-card-outline",
            period_month: activeMonth
          }),
          ctx.ha.publishSensor("grocery_spend", grocerySpend, {
            friendly_name: `Grocery Spend (${activeMonth})`,
            unit_of_measurement: "EUR",
            icon: "mdi:cart-check",
            period_month: activeMonth
          }),
          ctx.ha.publishSensor("savings_rate", savingsRatePct, {
            friendly_name: `Savings & Investment Rate (${activeMonth})`,
            unit_of_measurement: "%",
            icon: "mdi:piggy-bank-outline",
            period_month: activeMonth
          }),
          ctx.ha.publishSensor("export_reminder", exportReminder.due ? "f\xE4llig" : "aktuell", {
            friendly_name: "Finanz Bank-Export Erinnerung",
            icon: exportReminder.due ? "mdi:bell-alert-outline" : "mdi:check-circle-outline",
            due: exportReminder.due,
            urgency: exportReminder.urgency,
            latest_tx_date: exportReminder.latestTxDate,
            days_since_latest_tx: exportReminder.daysSinceLatestTx,
            headline: exportReminder.headlineDe,
            detail: exportReminder.detailDe
          })
        ]);
      } catch {
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
      fixedCosts
    };
  }
  ctx.route("GET", "/dashboard", async () => {
    const summary = await computeSummaryAndPublishSensors();
    return {
      kpis: summary.kpis,
      previewConfig: summary.previewConfig,
      previewGroupBudgets: summary.previewGroupBudgets,
      allBudgets: summary.allBudgets,
      balanceConfig: summary.balanceConfig,
      exportReminder: summary.exportReminder,
      fixedCosts: summary.fixedCosts,
      quickImportConfig: getQuickImportConfig(ctx.db)
    };
  });
  ctx.route("GET", "/overview", async (req, { db, sharedDb }) => {
    const requestedMonth = req.query.month || void 0;
    const summary = await computeSummaryAndPublishSensors(requestedMonth);
    const activeMonth = summary.kpis.activeMonth;
    const whereClause = requestedMonth === "all" ? "1=1" : "substr(tx_date, 1, 7) = ?";
    const params = requestedMonth === "all" ? [] : [activeMonth];
    const availableMonths = db.query(
      "SELECT DISTINCT substr(tx_date, 1, 7) as ym FROM transactions ORDER BY ym DESC"
    ).map((r) => r.ym);
    const periodTransactions = db.query(
      `SELECT * FROM transactions WHERE ${whereClause} ORDER BY tx_date DESC, id DESC`,
      params
    );
    const recurringFixed = db.query(
      `SELECT * FROM transactions WHERE is_recurring = 1 AND amount < 0 AND category != 'Investments' AND ${whereClause} ORDER BY ABS(amount) DESC`,
      params
    );
    const sunburstGroups = buildSunburstHierarchy(
      periodTransactions,
      "groups",
      summary.previewConfig.excludeRoundUpsInExpenses
    );
    const sunburstMerchants = buildSunburstHierarchy(
      periodTransactions,
      "merchants",
      summary.previewConfig.excludeRoundUpsInExpenses
    );
    const mealPlannerToday = sharedDb.kvGet("meal_planner_today");
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
      mealPlannerToday: mealPlannerToday || null
    };
  });
  ctx.route("POST", "/fixed-costs", async (req) => {
    const body = req.body || {};
    const next = body.resetDefaults ? saveFixedCostsConfig(DEFAULT_FIXED_COSTS) : Array.isArray(body.items) ? saveFixedCostsConfig(body.items) : getFixedCostsConfig();
    const summary = await computeSummaryAndPublishSensors();
    return {
      fixedCosts: summary.fixedCosts,
      configuredItems: next,
      kpis: summary.kpis
    };
  });
  ctx.route("POST", "/preview-config", async (req) => {
    const body = req.body || {};
    const updated = savePreviewConfig(body);
    const summary = await computeSummaryAndPublishSensors();
    return {
      previewConfig: updated,
      previewGroupBudgets: summary.previewGroupBudgets,
      kpis: summary.kpis
    };
  });
  ctx.route("POST", "/balance", async (req) => {
    const body = req.body || {};
    const updated = saveBalanceConfig(body);
    const summary = await computeSummaryAndPublishSensors();
    return {
      balanceConfig: updated,
      kpis: summary.kpis
    };
  });
  ctx.route("POST", "/budgets", async (req, { db }) => {
    const body = req.body || {};
    if (Array.isArray(body.budgets)) {
      db.exec("BEGIN TRANSACTION;");
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
        db.exec("COMMIT;");
      } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
      }
    } else if (body.category && body.monthly_limit !== void 0) {
      db.execute(
        `INSERT INTO category_budgets (category, monthly_limit)
         VALUES (?, ?)
         ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
        [body.category.trim(), Math.max(0, Number(body.monthly_limit) || 0)]
      );
    } else {
      return { status: 400, body: { error: "category and monthly_limit (or budgets array) required" } };
    }
    const summary = await computeSummaryAndPublishSensors();
    return {
      updated: true,
      allBudgets: summary.allBudgets,
      kpis: summary.kpis
    };
  });
  ctx.route("DELETE", "/budgets", async (req, { db }) => {
    const cat = (req.query.category || "").trim();
    if (!cat) return { status: 400, body: { error: "category query param required" } };
    db.execute("DELETE FROM category_budgets WHERE category = ?", [cat]);
    const summary = await computeSummaryAndPublishSensors();
    return { deleted: cat, allBudgets: summary.allBudgets };
  });
  ctx.route("POST", "/transactions", async (req, { db }) => {
    const body = req.body || {};
    if (!body.payee?.trim() || body.amount === void 0) {
      return { status: 400, body: { error: "Payee and amount are required" } };
    }
    const amt = Number(Number(body.amount).toFixed(2));
    const cleanPayee = normalizePayeeName(body.payee, body.notes || "");
    const category = body.category?.trim() || autoCategorizeTransaction(cleanPayee, body.notes || "", amt);
    const txDate = body.tx_date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const isRec = body.is_recurring !== void 0 ? body.is_recurring ? 1 : 0 : detectRecurringFlag(cleanPayee, body.notes || "", category);
    const txRef = computeTransactionRef(txDate, amt, cleanPayee, body.notes || "");
    db.execute(
      `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes, tx_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txDate,
        cleanPayee,
        category,
        amt,
        (body.account || "Girokonto").trim(),
        isRec,
        (body.notes || "").trim(),
        txRef
      ]
    );
    const balCfg = getBalanceConfig();
    if (body.adjustBalance ?? balCfg.autoAdjustOnImport) {
      saveBalanceConfig({ currentBalance: balCfg.currentBalance + amt });
    }
    const summary = await computeSummaryAndPublishSensors();
    return { added: true, kpis: summary.kpis };
  });
  ctx.route("PUT", "/transactions", async (req, { db }) => {
    const body = req.body || {};
    if (!body.id) {
      return { status: 400, body: { error: "Transaction id is required" } };
    }
    const existing = db.queryOne("SELECT * FROM transactions WHERE id = ?", [
      Number(body.id)
    ]);
    if (!existing) {
      return { status: 404, body: { error: "Transaction not found" } };
    }
    const nextCategory = body.category?.trim() || existing.category;
    const nextRecurring = body.is_recurring !== void 0 ? body.is_recurring ? 1 : 0 : existing.is_recurring;
    const nextPayee = body.payee?.trim() || existing.payee;
    const nextNotes = body.notes !== void 0 ? body.notes.trim() : existing.notes;
    db.execute(
      "UPDATE transactions SET payee = ?, category = ?, is_recurring = ?, notes = ? WHERE id = ?",
      [nextPayee, nextCategory, nextRecurring, nextNotes, Number(body.id)]
    );
    const summary = await computeSummaryAndPublishSensors();
    return { updated: true, kpis: summary.kpis };
  });
  ctx.route("DELETE", "/transactions", async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM transactions WHERE id = ?", [id]);
    const summary = await computeSummaryAndPublishSensors();
    return { deleted: id, kpis: summary.kpis };
  });
  ctx.route("POST", "/import-bank-csv", async (req, { db }) => {
    const body = req.body || {};
    let rawInput = "";
    if (body.base64Content) {
      rawInput = Buffer.from(body.base64Content, "base64");
    } else if (body.csvText) {
      rawInput = body.csvText;
    }
    if (typeof rawInput === "string" && !rawInput.trim() || Buffer.isBuffer(rawInput) && rawInput.length === 0) {
      return { status: 400, body: { error: "csvText or base64Content is required" } };
    }
    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      rawInput,
      {
        fileName: body.fileName || "Manual-Import.csv",
        accountName: body.accountName,
        replaceAll: body.replaceAll,
        onBalanceDetected: (bal, iban, acct) => {
          saveBalanceConfig({
            currentBalance: bal,
            ...iban ? { iban } : {},
            ...acct ? { accountName: acct } : {}
          });
        }
      }
    );
    if (parseResult.transactions.length === 0) {
      return { status: 400, body: { error: "Keine g\xFCltigen Buchungszeilen in der Datei erkannt." } };
    }
    saveExportReminderConfig({
      lastBankSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
      snoozedUntil: null
    });
    const summary = await computeSummaryAndPublishSensors();
    return {
      importedCount: insertedCount,
      skippedDuplicates,
      totalParsed: parseResult.transactions.length,
      format: parseResult.format,
      kpis: summary.kpis,
      exportReminder: summary.exportReminder
    };
  });
  ctx.route("POST", "/reminder/config", async (req) => {
    const body = req.body || {};
    const patch = {};
    if (typeof body.reminderIntervalDays === "number") {
      patch.reminderIntervalDays = body.reminderIntervalDays;
    }
    if (typeof body.remindOnNewMonth === "boolean") {
      patch.remindOnNewMonth = body.remindOnNewMonth;
    }
    if (typeof body.snoozeDays === "number") {
      patch.snoozedUntil = body.snoozeDays > 0 ? new Date(Date.now() + body.snoozeDays * 864e5).toISOString() : null;
    }
    if (body.markSyncedNow) {
      patch.lastBankSyncAt = (/* @__PURE__ */ new Date()).toISOString();
      patch.snoozedUntil = null;
    }
    saveExportReminderConfig(patch);
    const summary = await computeSummaryAndPublishSensors();
    return {
      exportReminder: summary.exportReminder
    };
  });
  ctx.route("GET", "/export", async (req, { db }) => {
    const format = req.query.format || "csv_de";
    const monthFilter = req.query.month || "all";
    const categoryFilter = req.query.category || "ALL";
    const clauses = ["1=1"];
    const params = [];
    if (monthFilter && monthFilter !== "all") {
      if (monthFilter.length === 4) {
        clauses.push("substr(tx_date, 1, 4) = ?");
        params.push(monthFilter);
      } else {
        clauses.push("substr(tx_date, 1, 7) = ?");
        params.push(monthFilter);
      }
    }
    if (categoryFilter && categoryFilter !== "ALL") {
      clauses.push("category = ?");
      params.push(categoryFilter);
    }
    const rows = db.query(
      `SELECT * FROM transactions WHERE ${clauses.join(" AND ")} ORDER BY tx_date DESC, id DESC`,
      params
    );
    saveExportReminderConfig({
      lastDataExportAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const summary = await computeSummaryAndPublishSensors(
      monthFilter !== "all" && monthFilter.length === 7 ? monthFilter : void 0
    );
    const dateStamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const scopeLabel = monthFilter === "all" ? "Gesamt" : monthFilter;
    if (format === "json") {
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        scope: scopeLabel,
        account: summary.balanceConfig,
        kpis: summary.kpis,
        categoryBreakdown: summary.categoryBreakdown,
        transactionCount: rows.length,
        transactions: rows
      };
      const fileName2 = `Thassi_Finanzen_Backup_${scopeLabel}_${dateStamp}.json`;
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName2}"`
        },
        body: JSON.stringify(payload, null, 2)
      };
    }
    if (format === "tax_report") {
      const escDe2 = (val) => {
        const s = String(val ?? "").replace(/"/g, '""');
        return `"${s}"`;
      };
      const fmtNumDe2 = (n) => n.toFixed(2).replace(".", ",");
      const lines2 = [];
      lines2.push(
        `# THASSI FINANZ- & STEUERBERICHT (${scopeLabel}) \u2014 Exportiert am ${dateStamp}`
      );
      lines2.push(
        `Konto;${escDe2(summary.balanceConfig.accountName)};IBAN;${escDe2(summary.balanceConfig.iban)};Aktueller Kontostand;${fmtNumDe2(summary.balanceConfig.currentBalance)} EUR`
      );
      lines2.push("");
      lines2.push("ABSCHNITT 1: KATEGORIE-ZUSAMMENFASSUNG");
      lines2.push("Kategorie (DE);Kategorie-ID;Gruppe;Buchungen;Ausgaben (EUR);Monatsbudget (EUR);Auslastung (%)");
      for (const cat of summary.categoryBreakdown) {
        lines2.push(
          [
            escDe2(cat.labelDe),
            escDe2(cat.category),
            escDe2(cat.group),
            cat.tx_count,
            fmtNumDe2(cat.spent),
            fmtNumDe2(cat.budgetLimit),
            `${cat.pctUsed}%`
          ].join(";")
        );
      }
      lines2.push("");
      lines2.push("ABSCHNITT 2: EINZELBUCHUNGEN");
      lines2.push("Buchungsdatum;Empf\xE4nger / Zahlungspflichtiger;Kategorie (DE);Kategorie-ID;Typ;Betrag (EUR);Konto;Notiz;Referenz");
      for (const r of rows) {
        const meta = getCategoryMeta(r.category);
        lines2.push(
          [
            r.tx_date,
            escDe2(r.payee),
            escDe2(meta.labelDe),
            escDe2(r.category),
            r.is_recurring ? "Fixkosten" : "Variabel",
            fmtNumDe2(r.amount),
            escDe2(r.account),
            escDe2(r.notes),
            escDe2(r.tx_ref || "")
          ].join(";")
        );
      }
      const csvWithBom2 = "\uFEFF" + lines2.join("\r\n");
      const fileName2 = `Thassi_Finanzbericht_${scopeLabel}_${dateStamp}.csv`;
      return {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName2}"`
        },
        body: csvWithBom2
      };
    }
    if (format === "csv_en") {
      const escEn = (val) => {
        const s = String(val ?? "").replace(/"/g, '""');
        return `"${s}"`;
      };
      const lines2 = [
        "Date,Payee,Category_DE,Category_ID,Type,Amount_EUR,Account,Notes,Reference"
      ];
      for (const r of rows) {
        const meta = getCategoryMeta(r.category);
        lines2.push(
          [
            r.tx_date,
            escEn(r.payee),
            escEn(meta.labelDe),
            escEn(r.category),
            r.is_recurring ? "FIXED" : "VARIABLE",
            r.amount.toFixed(2),
            escEn(r.account),
            escEn(r.notes),
            escEn(r.tx_ref || "")
          ].join(",")
        );
      }
      const fileName2 = `Thassi_Transactions_${scopeLabel}_${dateStamp}.csv`;
      return {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName2}"`
        },
        body: lines2.join("\r\n")
      };
    }
    const escDe = (val) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };
    const fmtNumDe = (n) => n.toFixed(2).replace(".", ",");
    const lines = [
      "Buchungsdatum;Empf\xE4nger;Kategorie;Kategorie_ID;Fixkosten;Betrag;W\xE4hrung;Konto;Verwendungszweck;Buchungsreferenz"
    ];
    for (const r of rows) {
      const meta = getCategoryMeta(r.category);
      lines.push(
        [
          r.tx_date,
          escDe(r.payee),
          escDe(meta.labelDe),
          escDe(r.category),
          r.is_recurring ? "Ja" : "Nein",
          fmtNumDe(r.amount),
          "EUR",
          escDe(r.account),
          escDe(r.notes),
          escDe(r.tx_ref || "")
        ].join(";")
      );
    }
    const csvWithBom = "\uFEFF" + lines.join("\r\n");
    const fileName = `Thassi_Buchungen_${scopeLabel}_${dateStamp}.csv`;
    return {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`
      },
      body: csvWithBom
    };
  });
  ctx.route("GET", "/quick-import/config", (_req, { db }) => {
    return {
      config: getQuickImportConfig(db),
      balanceConfig: getBalanceConfig()
    };
  });
  ctx.route("POST", "/quick-import/config", (req, { db }) => {
    const body = req.body || {};
    const updated = saveQuickImportConfig(db, body);
    return { config: updated };
  });
  ctx.route("POST", "/quick-import/cookies/clear", (_req, { db }) => {
    clearCookieVault(db);
    return { cleared: true, config: getQuickImportConfig(db) };
  });
  ctx.route("GET", "/quick-import/portal", (req, { db }) => {
    const cfg = getQuickImportConfig(db);
    const ingressBase = (req.headers["x-ingress-path"] || "").replace(/\/+$/, "");
    const html = renderQuickImportPortalHtml(cfg, ingressBase);
    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html
    };
  });
  ctx.route("GET", "/quick-import/proxy", async (req, { db }) => {
    const cfg = getQuickImportConfig(db);
    const targetUrl = req.query.url || cfg.loginUrl;
    try {
      const cookieHeader = getCookieHeaderForUrl(db, targetUrl);
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...cookieHeader ? { Cookie: cookieHeader } : {}
        },
        redirect: "follow"
      });
      const rawSetCookies = typeof upstreamRes.headers.getSetCookie === "function" ? upstreamRes.headers.getSetCookie() : upstreamRes.headers.get("set-cookie") ? [upstreamRes.headers.get("set-cookie")] : [];
      if (rawSetCookies.length > 0) {
        saveCookiesToVault(db, targetUrl, rawSetCookies);
      }
      const contentType = upstreamRes.headers.get("content-type") || "";
      const contentDisp = upstreamRes.headers.get("content-disposition") || "";
      const arrBuf = await upstreamRes.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      if (/attachment/i.test(contentDisp) || /text\/csv|application\/csv/i.test(contentType) || /\.(csv|sta|mt940|xml)(\?|$)/i.test(targetUrl)) {
        const decoded = decodeBankFileBuffer(buf);
        const fileNameMatch = contentDisp.match(/filename="?([^";]+)"?/i);
        const fileName = fileNameMatch ? fileNameMatch[1] : "OnlineBanking-Export.csv";
        const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
          db,
          decoded,
          {
            fileName,
            accountName: cfg.defaultAccountName,
            onBalanceDetected: (bal, iban, acct) => {
              saveBalanceConfig({
                currentBalance: bal,
                ...iban ? { iban } : {},
                ...acct ? { accountName: acct } : {}
              });
            }
          }
        );
        await computeSummaryAndPublishSensors();
        return {
          imported: true,
          fileName,
          format: parseResult.format,
          insertedCount,
          skippedDuplicates
        };
      }
      return {
        proxiedUrl: targetUrl,
        status: upstreamRes.status,
        savedCookieCount: getQuickImportConfig(db).savedCookieCount
      };
    } catch (err) {
      return {
        status: 502,
        body: {
          error: "Could not reach bank URL directly via proxy",
          details: err instanceof Error ? err.message : String(err)
        }
      };
    }
  });
  ctx.route("POST", "/quick-import/scan-downloads", async (_req, { db }) => {
    const events = scanDownloadsFolderForNewExports(db, (bal, iban, acct) => {
      saveBalanceConfig({
        currentBalance: bal,
        ...iban ? { iban } : {},
        ...acct ? { accountName: acct } : {}
      });
    });
    if (events.length > 0) {
      saveExportReminderConfig({
        lastBankSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
        snoozedUntil: null
      });
    }
    const summary = await computeSummaryAndPublishSensors();
    return {
      scanned: true,
      events,
      config: getQuickImportConfig(db),
      kpis: summary.kpis,
      exportReminder: summary.exportReminder
    };
  });
  ctx.route("POST", "/quick-import/simulate-download", async (req, { db }) => {
    const body = req.body || {};
    const { fileName, csvContent } = buildSampleGeorgeLiveExportCsv();
    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      csvContent,
      {
        fileName,
        accountName: body.accountName || "Girokonto"
      }
    );
    saveExportReminderConfig({
      lastBankSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
      snoozedUntil: null
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
      config: getQuickImportConfig(db)
    };
  });
  ctx.scheduleJob({
    id: "sync-finance-sensors",
    name: "Publish Finance Sensors & Watch Downloads for Quick Import",
    description: "Watches Downloads folder for new bank exports and publishes current_balance, daily_expenses, weekly_expenses, net_cashflow, and budget sensors to Home Assistant.",
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      scanDownloadsFolderForNewExports(ctx.db, (bal, iban, acct) => {
        saveBalanceConfig({
          currentBalance: bal,
          ...iban ? { iban } : {},
          ...acct ? { accountName: acct } : {}
        });
      });
      const { kpis } = await computeSummaryAndPublishSensors();
      return `[${kpis.activeMonth}] Balance: \u20AC${kpis.currentBalance} | Day: -\u20AC${kpis.expensesDay} | Week: -\u20AC${kpis.expensesWeek} | Expenses: -\u20AC${kpis.expenses}`;
    }
  });
});
export {
  index_default as default
};
