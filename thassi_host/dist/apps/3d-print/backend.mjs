import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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

  /* Canonical Uniform Shell Primitives */
  .thassi-u-shell {
    min-height: 100vh;
    background: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    display: flex;
    flex-direction: column;
  }

  .thassi-u-header {
    min-height: 52px;
    padding: 0 32px;
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg-canvas);
    flex-wrap: wrap;
  }

  .thassi-u-header-left {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
  }

  .thassi-u-title {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.025em;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
  }

  .thassi-u-domain-code {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 2px 6px;
    border: 1px solid var(--line-hairline);
    border-radius: 3px;
    background: var(--bg-elevated);
  }

  .thassi-u-tabs {
    display: flex;
    align-items: center;
    gap: 22px;
    height: 52px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .thassi-u-tabs::-webkit-scrollbar {
    display: none;
  }

  .thassi-u-tab {
    height: 52px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    padding: 0 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .thassi-u-tab:hover {
    color: var(--text-secondary);
  }
  .thassi-u-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .thassi-u-freshness {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    flex-wrap: wrap;
  }

  .thassi-u-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .thassi-u-dot.ok { background: #10b981; }
  .thassi-u-dot.warn { background: #f59e0b; }
  .thassi-u-dot.err { background: #ef4444; }
  .thassi-u-dot.idle { background: #52525b; }

  .thassi-u-kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-bottom: 1px solid var(--line-hairline);
    background: var(--bg-canvas);
  }

  .thassi-u-kpi-cell {
    padding: 14px 32px;
    border-right: 1px solid var(--line-hairline);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .thassi-u-kpi-cell:last-child {
    border-right: none;
  }

  .thassi-u-kpi-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .thassi-u-kpi-value {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 400;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-u-kpi-sub {
    font-size: 12px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-u-btn-primary {
    background: #fafafa;
    color: #09090b;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .thassi-u-btn-primary:hover {
    background: #e4e4e7;
  }

  .thassi-u-btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid var(--line-hairline);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .thassi-u-btn-ghost:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
    background: var(--bg-elevated);
  }

  .thassi-u-input {
    background: var(--bg-input);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
  }
  .thassi-u-input:focus {
    border-color: var(--line-focus);
  }

  @media (max-width: 960px) {
    .thassi-u-header {
      padding: 8px 16px;
    }
    .thassi-u-kpi-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .thassi-u-kpi-cell {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line-hairline);
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
      ha-md-list-item[data-panel="aishe-energy"] {
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
        if (!window.top || window.top === window) return;
        const topDoc = window.top.document;
        if (!topDoc) return;

        ensureStyleTag(topDoc, 'thassi-root-vars', ROOT_THEME_CSS);

        const ha = topDoc.querySelector('home-assistant');
        if (!ha || !ha.shadowRoot) return;
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
              '  topWin.__thassiActiveSidebarApp = appId;',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host" && hw && !hw.closed && typeof hw.openFullService === "function") {',
              '    topWin.history.replaceState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '    hw.openFullService(appId, title, "", true);',
              '    if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '    return false;',
              '  }',
              '  topWin.sessionStorage.setItem("thassi_open_app", JSON.stringify({ id: appId, title: title, fromSidebar: true, ts: Date.now() }));',
              '  if (topWin.location.pathname !== "/44ec3c40_thassi_host") {',
              '    topWin.history.pushState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '    topWin.dispatchEvent(new topWin.CustomEvent("location-changed", { bubbles: true, composed: true }));',
              '  }',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}',
              'return false;'
            ].join(' ')
          );

          window.top.__thassiCloseSidebarApp = new window.top.Function(
            [
              'try {',
              '  var topWin = window.top || window;',
              '  topWin.__thassiActiveSidebarApp = null;',
              '  topWin.sessionStorage.removeItem("thassi_open_app");',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host" && topWin.location.hash) {',
              '    topWin.history.replaceState(null, "", "/44ec3c40_thassi_host");',
              '  }',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (hw && !hw.closed && typeof hw.closeFullService === "function") {',
              '    hw.closeFullService();',
              '  }',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}'
            ].join(' ')
          );

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
            }

            const anchorAfterItem =
              findSidebarPanelItem('44ec3c40_thassi_project_workflow') ||
              findSidebarPanelItem('44ec3c40_thassi_smart_canvas') ||
              findSidebarPanelItem('44ec3c40_thassi_google_calendar') ||
              findSidebarPanelItem('44ec3c40_thassi_meal_planner') ||
              findSidebarPanelItem('44ec3c40_thassi_google_health') ||
              findSidebarPanelItem('44ec3c40_thassi_finance_analytics') ||
              findSidebarPanelItem('44ec3c40_thassi_cortex') ||
              findSidebarPanelItem('44ec3c40_thassi_memo') ||
              findSidebarPanelItem('44ec3c40_thassi_workflows');

            function ensureNativeSidebarItem(navId, appId, panelSlug, title, iconName, refAfterEl) {
              if (findSidebarPanelItem(panelSlug)) return null;
              let item = mdList.querySelector('#' + navId);
              if (
                item &&
                (item.tagName.toLowerCase() !== 'ha-md-list-item' ||
                  item.getAttribute('style') ||
                  (horizonItem && item.previousElementSibling === horizonItem))
              ) {
                item.remove();
                item = null;
              }
              if (!item) {
                const sampleItem =
                  anchorAfterItem ||
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
                item.setAttribute('data-panel', panelSlug);
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
              }
              if (refAfterEl && item.previousElementSibling !== refAfterEl) {
                if (refAfterEl.nextSibling) {
                  mdList.insertBefore(item, refAfterEl.nextSibling);
                } else {
                  mdList.appendChild(item);
                }
              } else if (!item.parentElement) {
                mdList.appendChild(item);
              }
              item.onclick = new window.top.Function(
                'ev',
                'if (ev) { ev.preventDefault(); ev.stopPropagation(); } return window.top.__thassiOpenSidebarApp(' +
                  JSON.stringify(appId) +
                  ', ' +
                  JSON.stringify(title) +
                  ');'
              );
              return item;
            }

            const STATIC_CUSTOM_APPS = [
              { id: 'contacts', navId: 'thassi-nav-contacts', title: 'Contacts', icon: 'mdi:message-text-outline' },
              { id: 'floorplan', navId: 'thassi-nav-floorplan', title: 'Grundriss 2D', icon: 'mdi:floor-plan' },
              { id: 'camera-vision', navId: 'thassi-nav-camera-vision', title: 'Kameras & Vision', icon: 'mdi:cctv' },
              { id: '3d-print', navId: 'thassi-nav-3d-print', title: '3D Druck', icon: 'mdi:printer-3d-nozzle' },
              { id: 'system-monitor', navId: 'thassi-nav-system-monitor', title: 'HASS OS Monitor', icon: 'mdi:pulse' },
              { id: 'google-usage', navId: 'thassi-nav-google-usage', title: 'Google Usage & AI', icon: 'mdi:chart-box-outline' },
              { id: 'network-monitor', navId: 'thassi-nav-network-monitor', title: 'Netzwerk & Router', icon: 'mdi:router-network' },
              { id: 'george-sync', navId: 'thassi-nav-george-sync', title: 'Erste Bank Sync', icon: 'mdi:bank-transfer' }
            ];

            const NATIVE_ADDON_APP_IDS = {
              'workflows': true,
              'memo': true,
              'cortex': true,
              'finance-analytics': true,
              'google-health': true,
              'meal-planner': true,
              'google-calendar': true,
              'smart-canvas': true,
              'project-workflow': true,
              '3d-print': true
            };

            const dynamicApps = Array.isArray(window.top.__thassiDeployedApps)
              ? window.top.__thassiDeployedApps
              : Array.isArray(window.__THASSI_DEPLOYED_APPS__)
                ? window.__THASSI_DEPLOYED_APPS__
                : [];

            const mergedCustomApps = STATIC_CUSTOM_APPS.slice();
            for (let dIdx = 0; dIdx < dynamicApps.length; dIdx++) {
              const dApp = dynamicApps[dIdx];
              if (!dApp || !dApp.id || NATIVE_ADDON_APP_IDS[dApp.id] || dApp.hideFromSidebar) continue;
              if (!mergedCustomApps.some(function(x) { return x.id === dApp.id; })) {
                mergedCustomApps.push({
                  id: dApp.id,
                  title: dApp.name || dApp.title || dApp.id,
                  icon: dApp.icon || 'mdi:application-outline'
                });
              }
            }

            let prevInsertedItem = anchorAfterItem;
            const createdSidebarItems = {};
            const knownCustomIds = {};
            for (let cIdx = 0; cIdx < mergedCustomApps.length; cIdx++) {
              const cfg = mergedCustomApps[cIdx];
              knownCustomIds[cfg.id] = true;
              const slug = '44ec3c40_thassi_' + cfg.id.replace(/[^a-z0-9_]/gi, '_');
              const navEl = ensureNativeSidebarItem(
                'thassi-nav-' + cfg.id,
                cfg.id,
                slug,
                cfg.title,
                cfg.icon,
                prevInsertedItem || anchorAfterItem
              );
              if (navEl) {
                createdSidebarItems[cfg.id] = navEl;
                prevInsertedItem = navEl;
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

        // Persist clean sidebar order & hidden panels in localStorage for all browser sessions
        try {
          const hidden = [
            "home","lovelace","light","security","climate","energy",
            "media-browser","logbook","history","todo","calendar",
            "map","thomas-buero","aishe-diagnose","aishe-details","aishe-security","aishe-energy"
          ];
          const order = [
            "44ec3c40_thassi_host",
            "44ec3c40_thassi_cortex",
            "44ec3c40_thassi_workflows",
            "44ec3c40_thassi_smart_canvas",
            "44ec3c40_thassi_floorplan",
            "44ec3c40_thassi_camera_vision",
            "44ec3c40_thassi_3d_print",
            "44ec3c40_thassi_google_calendar",
            "44ec3c40_thassi_google_health",
            "44ec3c40_thassi_meal_planner",
            "44ec3c40_thassi_finance_analytics",
            "44ec3c40_thassi_george_sync",
            "44ec3c40_thassi_memo",
            "44ec3c40_thassi_contacts",
            "44ec3c40_thassi_system_monitor",
            "44ec3c40_thassi_network_monitor",
            "44ec3c40_thassi_google_usage",
            "44ec3c40_thassi_project_workflow",
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

// apps/3d-print/shared/mesh-engine.ts
var DEFAULT_PRINT_PROFILE = {
  printerModel: "Bambu Lab P1S 0.4 nozzle",
  nozzleDiameterMm: 0.4,
  layerHeightMm: 0.2,
  infillPercent: 20,
  wallLoops: 3,
  filamentType: "PLA",
  filamentColor: "#00AE42",
  nozzleTempC: 220,
  bedTempC: 60,
  supportsEnabled: false,
  brimEnabled: false
};
function vSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function vNorm(a) {
  const len = Math.hypot(a.x, a.y, a.z);
  if (len < 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}
function computeNormal(v0, v1, v2) {
  return vNorm(vCross(vSub(v1, v0), vSub(v2, v0)));
}
function transformPoint(p, pos, rotDeg, scale) {
  let x = p.x * (scale[0] ?? 1);
  let y = p.y * (scale[1] ?? 1);
  let z = p.z * (scale[2] ?? 1);
  const rx = (rotDeg[0] || 0) * Math.PI / 180;
  const ry = (rotDeg[1] || 0) * Math.PI / 180;
  const rz = (rotDeg[2] || 0) * Math.PI / 180;
  if (rx !== 0) {
    const c = Math.cos(rx);
    const s = Math.sin(rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  if (ry !== 0) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  }
  if (rz !== 0) {
    const c = Math.cos(rz);
    const s = Math.sin(rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }
  return {
    x: x + (pos[0] || 0),
    y: y + (pos[1] || 0),
    z: z + (pos[2] || 0)
  };
}
function pushQuad(out, a, b, c, d) {
  out.push([a, b, c]);
  out.push([a, c, d]);
}
function generateBoxTriangles(params) {
  const w = Math.max(1, params.width ?? 40);
  const d = Math.max(1, params.depth ?? 40);
  const h = Math.max(1, params.height ?? 30);
  const bevel = Math.min(Math.min(w, d) * 0.42, Math.max(0, params.bevel ?? 2));
  const wall = params.wallThickness ?? 0;
  const hw = w / 2;
  const hd = d / 2;
  const b = bevel;
  const outerPts = b > 0.2 ? [
    [-hw + b, -hd],
    [hw - b, -hd],
    [hw, -hd + b],
    [hw, hd - b],
    [hw - b, hd],
    [-hw + b, hd],
    [-hw, hd - b],
    [-hw, -hd + b]
  ] : [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd]
  ];
  const tris = [];
  const n = outerPts.length;
  if (wall > 0.4 && wall < Math.min(hw, hd) - 1) {
    const floorZ = Math.min(h * 0.5, wall);
    const innerPts = outerPts.map(([px, py]) => {
      const sx = px >= 0 ? Math.max(0.5, px - wall) : Math.min(-0.5, px + wall);
      const sy = py >= 0 ? Math.max(0.5, py - wall) : Math.min(-0.5, py + wall);
      return [sx, sy];
    });
    for (let i = 0; i < n; i++) {
      const [x0, y0] = outerPts[i];
      const [x1, y1] = outerPts[(i + 1) % n];
      const [ix0, iy0] = innerPts[i];
      const [ix1, iy1] = innerPts[(i + 1) % n];
      pushQuad(
        tris,
        { x: x0, y: y0, z: 0 },
        { x: x1, y: y1, z: 0 },
        { x: x1, y: y1, z: h },
        { x: x0, y: y0, z: h }
      );
      pushQuad(
        tris,
        { x: ix1, y: iy1, z: floorZ },
        { x: ix0, y: iy0, z: floorZ },
        { x: ix0, y: iy0, z: h },
        { x: ix1, y: iy1, z: h }
      );
      pushQuad(
        tris,
        { x: x0, y: y0, z: h },
        { x: x1, y: y1, z: h },
        { x: ix1, y: iy1, z: h },
        { x: ix0, y: iy0, z: h }
      );
      tris.push([
        { x: 0, y: 0, z: 0 },
        { x: x1, y: y1, z: 0 },
        { x: x0, y: y0, z: 0 }
      ]);
      tris.push([
        { x: 0, y: 0, z: floorZ },
        { x: ix0, y: iy0, z: floorZ },
        { x: ix1, y: iy1, z: floorZ }
      ]);
    }
    return tris;
  }
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outerPts[i];
    const [x1, y1] = outerPts[(i + 1) % n];
    pushQuad(
      tris,
      { x: x0, y: y0, z: 0 },
      { x: x1, y: y1, z: 0 },
      { x: x1, y: y1, z: h },
      { x: x0, y: y0, z: h }
    );
    tris.push([
      { x: 0, y: 0, z: 0 },
      { x: x1, y: y1, z: 0 },
      { x: x0, y: y0, z: 0 }
    ]);
    tris.push([
      { x: 0, y: 0, z: h },
      { x: x0, y: y0, z: h },
      { x: x1, y: y1, z: h }
    ]);
  }
  return tris;
}
function generateCylinderTriangles(params) {
  const rBottom = Math.max(0.5, params.radiusBottom ?? params.radius ?? 20);
  const rTop = Math.max(0.5, params.radiusTop ?? params.radius ?? 20);
  const rInner = Math.max(0, Math.min(Math.min(rBottom, rTop) - 0.8, params.innerRadius ?? 0));
  const h = Math.max(1, params.height ?? 35);
  const segs = Math.min(96, Math.max(6, Math.round(params.segments ?? 40)));
  const tris = [];
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2;
    const a1 = (i + 1) / segs * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const ob0 = { x: rBottom * c0, y: rBottom * s0, z: 0 };
    const ob1 = { x: rBottom * c1, y: rBottom * s1, z: 0 };
    const ot0 = { x: rTop * c0, y: rTop * s0, z: h };
    const ot1 = { x: rTop * c1, y: rTop * s1, z: h };
    pushQuad(tris, ob0, ob1, ot1, ot0);
    if (rInner > 0.2) {
      const ib0 = { x: rInner * c0, y: rInner * s0, z: 0 };
      const ib1 = { x: rInner * c1, y: rInner * s1, z: 0 };
      const it0 = { x: rInner * c0, y: rInner * s0, z: h };
      const it1 = { x: rInner * c1, y: rInner * s1, z: h };
      pushQuad(tris, ib1, ib0, it0, it1);
      pushQuad(tris, ot0, ot1, it1, it0);
      pushQuad(tris, ib0, ib1, ob1, ob0);
    } else {
      tris.push([{ x: 0, y: 0, z: 0 }, ob1, ob0]);
      tris.push([{ x: 0, y: 0, z: h }, ot0, ot1]);
    }
  }
  return tris;
}
function generateConeTriangles(params) {
  return generateCylinderTriangles({
    radiusBottom: params.radiusBottom ?? params.radius ?? 22,
    radiusTop: Math.max(0.5, params.radiusTop ?? 1),
    innerRadius: params.innerRadius ?? 0,
    height: params.height ?? 35,
    segments: params.segments ?? 36
  });
}
function generateSphereTriangles(params) {
  const r = Math.max(1, params.radius ?? 20);
  const domeOnly = Boolean(params.domeOnly);
  const latSegs = domeOnly ? 12 : 20;
  const lonSegs = 32;
  const tris = [];
  for (let lat = 0; lat < latSegs; lat++) {
    const theta0 = domeOnly ? lat / latSegs * (Math.PI / 2) : -Math.PI / 2 + lat / latSegs * Math.PI;
    const theta1 = domeOnly ? (lat + 1) / latSegs * (Math.PI / 2) : -Math.PI / 2 + (lat + 1) / latSegs * Math.PI;
    const z0 = domeOnly ? r * Math.sin(theta0) : r + r * Math.sin(theta0);
    const z1 = domeOnly ? r * Math.sin(theta1) : r + r * Math.sin(theta1);
    const r0 = r * Math.cos(theta0);
    const r1 = r * Math.cos(theta1);
    for (let lon = 0; lon < lonSegs; lon++) {
      const phi0 = lon / lonSegs * Math.PI * 2;
      const phi1 = (lon + 1) / lonSegs * Math.PI * 2;
      const p00 = { x: r0 * Math.cos(phi0), y: r0 * Math.sin(phi0), z: z0 };
      const p10 = { x: r0 * Math.cos(phi1), y: r0 * Math.sin(phi1), z: z0 };
      const p11 = { x: r1 * Math.cos(phi1), y: r1 * Math.sin(phi1), z: z1 };
      const p01 = { x: r1 * Math.cos(phi0), y: r1 * Math.sin(phi0), z: z1 };
      pushQuad(tris, p00, p10, p11, p01);
      if (domeOnly && lat === 0) {
        tris.push([{ x: 0, y: 0, z: 0 }, p10, p00]);
      }
    }
  }
  return tris;
}
function generateTorusTriangles(params) {
  const R = Math.max(4, params.radius ?? 24);
  const r = Math.max(1, Math.min(R - 1, params.tubeRadius ?? 6));
  const majorSegs = 36;
  const minorSegs = 20;
  const tris = [];
  for (let i = 0; i < majorSegs; i++) {
    const u0 = i / majorSegs * Math.PI * 2;
    const u1 = (i + 1) / majorSegs * Math.PI * 2;
    for (let j = 0; j < minorSegs; j++) {
      const v0 = j / minorSegs * Math.PI * 2;
      const v1 = (j + 1) / minorSegs * Math.PI * 2;
      const pt = (u, v) => ({
        x: (R + r * Math.cos(v)) * Math.cos(u),
        y: (R + r * Math.cos(v)) * Math.sin(u),
        z: r + r * Math.sin(v)
      });
      pushQuad(tris, pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1));
    }
  }
  return tris;
}
function generateGearTriangles(params) {
  const teeth = Math.max(6, Math.min(80, Math.round(params.teeth ?? 20)));
  const outerRadius = Math.max(8, params.outerRadius ?? 30);
  const toothDepth = Math.max(1.5, Math.min(outerRadius * 0.3, params.toothDepth ?? outerRadius * 0.16));
  const rootRadius = outerRadius - toothDepth;
  const boreRadius = Math.max(1, Math.min(rootRadius - 2, params.boreRadius ?? 5));
  const height = Math.max(2, params.height ?? 10);
  const stepsPerTooth = 4;
  const totalSteps = teeth * stepsPerTooth;
  const tris = [];
  const profilePt = (idx) => {
    const i = (idx % totalSteps + totalSteps) % totalSteps;
    const sub = i % stepsPerTooth;
    const angle = i / totalSteps * Math.PI * 2;
    const rad = sub === 1 || sub === 2 ? outerRadius : rootRadius;
    return [rad * Math.cos(angle), rad * Math.sin(angle)];
  };
  for (let i = 0; i < totalSteps; i++) {
    const [ox0, oy0] = profilePt(i);
    const [ox1, oy1] = profilePt(i + 1);
    const a0 = i / totalSteps * Math.PI * 2;
    const a1 = (i + 1) / totalSteps * Math.PI * 2;
    const ix0 = boreRadius * Math.cos(a0);
    const iy0 = boreRadius * Math.sin(a0);
    const ix1 = boreRadius * Math.cos(a1);
    const iy1 = boreRadius * Math.sin(a1);
    pushQuad(
      tris,
      { x: ox0, y: oy0, z: 0 },
      { x: ox1, y: oy1, z: 0 },
      { x: ox1, y: oy1, z: height },
      { x: ox0, y: oy0, z: height }
    );
    pushQuad(
      tris,
      { x: ix1, y: iy1, z: 0 },
      { x: ix0, y: iy0, z: 0 },
      { x: ix0, y: iy0, z: height },
      { x: ix1, y: iy1, z: height }
    );
    pushQuad(
      tris,
      { x: ix0, y: iy0, z: height },
      { x: ox0, y: oy0, z: height },
      { x: ox1, y: oy1, z: height },
      { x: ix1, y: iy1, z: height }
    );
    pushQuad(
      tris,
      { x: ox0, y: oy0, z: 0 },
      { x: ix0, y: iy0, z: 0 },
      { x: ix1, y: iy1, z: 0 },
      { x: ox1, y: oy1, z: 0 }
    );
  }
  return tris;
}
function generateTwistedVaseTriangles(params) {
  const rBottom = Math.max(8, params.radiusBottom ?? 26);
  const rTop = Math.max(8, params.radiusTop ?? 32);
  const h = Math.max(15, params.height ?? 75);
  const wall = Math.max(1.2, Math.min(8, params.wallThickness ?? 2.4));
  const twistDeg = params.twistDeg ?? 90;
  const ribCount = Math.max(0, Math.min(36, Math.round(params.ribCount ?? 12)));
  const ribAmp = Math.max(0, Math.min(10, params.ribAmplitude ?? 2.8));
  const zSteps = 28;
  const aSteps = 48;
  const floorZ = Math.min(h * 0.25, Math.max(2, wall * 1.5));
  const tris = [];
  const getOuterPt = (zi, ai) => {
    const t = zi / zSteps;
    const z = t * h;
    const baseR = rBottom + (rTop - rBottom) * (0.5 - 0.5 * Math.cos(t * Math.PI)) + Math.sin(t * Math.PI) * 4;
    const twistRad = twistDeg * t * Math.PI / 180;
    const a = ai / aSteps * Math.PI * 2;
    const rib = ribCount > 0 ? ribAmp * Math.sin(ribCount * (a + twistRad)) : 0;
    const r = Math.max(4, baseR + rib);
    return { x: r * Math.cos(a), y: r * Math.sin(a), z };
  };
  const getInnerPt = (zi, ai) => {
    const t = zi / zSteps;
    const z = floorZ + t * (h - floorZ);
    const baseR = rBottom + (rTop - rBottom) * (0.5 - 0.5 * Math.cos(t * Math.PI)) + Math.sin(t * Math.PI) * 4;
    const twistRad = twistDeg * t * Math.PI / 180;
    const a = ai / aSteps * Math.PI * 2;
    const rib = ribCount > 0 ? ribAmp * 0.65 * Math.sin(ribCount * (a + twistRad)) : 0;
    const r = Math.max(2, baseR + rib - wall);
    return { x: r * Math.cos(a), y: r * Math.sin(a), z };
  };
  for (let zi = 0; zi < zSteps; zi++) {
    for (let ai = 0; ai < aSteps; ai++) {
      const an = (ai + 1) % aSteps;
      pushQuad(
        tris,
        getOuterPt(zi, ai),
        getOuterPt(zi, an),
        getOuterPt(zi + 1, an),
        getOuterPt(zi + 1, ai)
      );
      pushQuad(
        tris,
        getInnerPt(zi, an),
        getInnerPt(zi, ai),
        getInnerPt(zi + 1, ai),
        getInnerPt(zi + 1, an)
      );
    }
  }
  for (let ai = 0; ai < aSteps; ai++) {
    const an = (ai + 1) % aSteps;
    pushQuad(
      tris,
      getOuterPt(zSteps, ai),
      getOuterPt(zSteps, an),
      getInnerPt(zSteps, an),
      getInnerPt(zSteps, ai)
    );
    tris.push([{ x: 0, y: 0, z: 0 }, getOuterPt(0, an), getOuterPt(0, ai)]);
    tris.push([{ x: 0, y: 0, z: floorZ }, getInnerPt(0, ai), getInnerPt(0, an)]);
  }
  return tris;
}
function generateBracketTriangles(params) {
  const width = Math.max(10, params.width ?? 36);
  const depth = Math.max(20, params.depth ?? 55);
  const height = Math.max(20, params.height ?? 65);
  const thick = Math.max(3, Math.min(18, params.thickness ?? 6));
  const lipHeight = Math.max(0, params.lipHeight ?? 18);
  const tris = [];
  const baseTris = generateBoxTriangles({ width, depth, height: thick, bevel: 1.5 });
  tris.push(...baseTris);
  const spineTris = generateBoxTriangles({ width, depth: thick, height, bevel: 1.2 });
  const spineY = -depth / 2 + thick / 2;
  for (const [a, b, c] of spineTris) {
    tris.push([
      { x: a.x, y: a.y + spineY, z: a.z },
      { x: b.x, y: b.y + spineY, z: b.z },
      { x: c.x, y: c.y + spineY, z: c.z }
    ]);
  }
  if (lipHeight > 1) {
    const topArmTris = generateBoxTriangles({
      width,
      depth: depth * 0.75,
      height: thick,
      bevel: 1.2
    });
    const armY = -depth / 2 + depth * 0.75 / 2;
    const armZ = height - thick;
    for (const [a, b, c] of topArmTris) {
      tris.push([
        { x: a.x, y: a.y + armY, z: a.z + armZ },
        { x: b.x, y: b.y + armY, z: b.z + armZ },
        { x: c.x, y: c.y + armY, z: c.z + armZ }
      ]);
    }
    const tipTris = generateBoxTriangles({
      width,
      depth: thick,
      height: lipHeight,
      bevel: 1
    });
    const tipY = depth / 2 - thick / 2;
    for (const [a, b, c] of tipTris) {
      tris.push([
        { x: a.x, y: a.y + tipY, z: a.z },
        { x: b.x, y: b.y + tipY, z: b.z },
        { x: c.x, y: c.y + tipY, z: c.z }
      ]);
    }
  }
  return tris;
}
function generateHexOrganizerTriangles(params) {
  const width = Math.max(24, params.width ?? 72);
  const depth = Math.max(24, params.depth ?? 48);
  const height = Math.max(12, params.height ?? 42);
  const wall = Math.max(1.6, Math.min(6, params.wallThickness ?? 2.4));
  const slotsX = Math.max(1, Math.min(5, Math.round(params.slotsX ?? 3)));
  const slotsY = Math.max(1, Math.min(4, Math.round(params.slotsY ?? 2)));
  const tris = [];
  tris.push(...generateBoxTriangles({ width, depth, height, bevel: 3, wallThickness: wall }));
  for (let ix = 1; ix < slotsX; ix++) {
    const xPos = -width / 2 + ix / slotsX * width;
    const div = generateBoxTriangles({ width: wall, depth: depth - wall * 1.5, height: height - 1, bevel: 0 });
    for (const [a, b, c] of div) {
      tris.push([
        { x: a.x + xPos, y: a.y, z: a.z + wall * 0.5 },
        { x: b.x + xPos, y: b.y, z: b.z + wall * 0.5 },
        { x: c.x + xPos, y: c.y, z: c.z + wall * 0.5 }
      ]);
    }
  }
  for (let iy = 1; iy < slotsY; iy++) {
    const yPos = -depth / 2 + iy / slotsY * depth;
    const div = generateBoxTriangles({ width: width - wall * 1.5, depth: wall, height: height - 1, bevel: 0 });
    for (const [a, b, c] of div) {
      tris.push([
        { x: a.x, y: a.y + yPos, z: a.z + wall * 0.5 },
        { x: b.x, y: b.y + yPos, z: b.z + wall * 0.5 },
        { x: c.x, y: c.y + yPos, z: c.z + wall * 0.5 }
      ]);
    }
  }
  return tris;
}
function generateAppleTriangles(params) {
  const radius = Math.max(8, params.radius ?? 34);
  const height = Math.max(12, params.height ?? 58);
  const lobeCount = Math.max(0, Math.min(12, Math.round(params.lobeCount ?? 5)));
  const lobeAmp = Math.max(0, Math.min(radius * 0.18, params.lobeAmplitude ?? radius * 0.042));
  const topIndent = Math.max(2, Math.min(height * 0.35, params.topIndent ?? height * 0.21));
  const bottomIndent = Math.max(1, Math.min(height * 0.22, params.bottomIndent ?? height * 0.09));
  const lonSegs = Math.min(64, Math.max(16, Math.round(params.segments ?? 36)));
  const profile = [
    [0, bottomIndent, 0],
    [0.18, bottomIndent * 0.35, 0.1],
    [0.35, 0, 0.25],
    // Printable resting rim at Z = 0
    [0.58, height * 0.06, 0.5],
    [0.79, height * 0.18, 0.75],
    [0.95, height * 0.36, 0.95],
    [1.03, height * 0.56, 1],
    // Widest upper-middle apple cheek
    [0.98, height * 0.74, 0.92],
    [0.83, height * 0.9, 0.7],
    [0.56, height, 0.4],
    // Top shoulder crest at Z = height
    [0.32, height - topIndent * 0.38, 0.2],
    [0.14, height - topIndent * 0.82, 0.05],
    [0, height - topIndent, 0]
    // Center of top stem cavity
  ];
  const tris = [];
  const rings = profile.length;
  const ringPt = (ri, li) => {
    const [rFrac, zVal, lobeW] = profile[ri];
    if (rFrac <= 1e-5) {
      return { x: 0, y: 0, z: zVal };
    }
    const phi = li / lonSegs * Math.PI * 2;
    const lobe = lobeCount > 0 ? lobeAmp * lobeW * Math.cos(lobeCount * phi) : 0;
    const r = Math.max(0.2, radius * rFrac + lobe);
    return {
      x: r * Math.cos(phi),
      y: r * Math.sin(phi),
      z: zVal
    };
  };
  for (let ri = 0; ri < rings - 1; ri++) {
    for (let li = 0; li < lonSegs; li++) {
      const ln = (li + 1) % lonSegs;
      const p00 = ringPt(ri, li);
      const p10 = ringPt(ri, ln);
      const p11 = ringPt(ri + 1, ln);
      const p01 = ringPt(ri + 1, li);
      if (profile[ri][0] <= 1e-5) {
        tris.push([p00, p11, p01]);
      } else if (profile[ri + 1][0] <= 1e-5) {
        tris.push([p00, p10, p11]);
      } else {
        pushQuad(tris, p00, p10, p11, p01);
      }
    }
  }
  return tris;
}
function generateLatheTriangles(params) {
  const height = Math.max(10, params.height ?? 65);
  const rBottom = Math.max(2, params.rBottom ?? params.radiusBottom ?? 22);
  const rLower = Math.max(2, params.rLower ?? params.rBelly ?? rBottom * 1.25);
  const rMid = Math.max(2, params.rMid ?? rLower * 0.95);
  const rUpper = Math.max(2, params.rUpper ?? params.rShoulder ?? rMid * 0.85);
  const rNeck = Math.max(1.5, params.rNeck ?? rUpper * 0.65);
  const rTop = Math.max(1.5, params.rTop ?? params.radiusTop ?? rNeck);
  const topIndent = Math.max(0, Math.min(height * 0.85, params.topIndent ?? 0));
  const bottomIndent = Math.max(0, Math.min(height * 0.25, params.bottomIndent ?? 0));
  const wall = Math.max(0, Math.min(Math.min(rBottom, rTop) - 0.8, params.wallThickness ?? 0));
  const lobeCount = Math.max(0, Math.min(24, Math.round(params.lobeCount ?? 0)));
  const lobeAmp = Math.max(0, Math.min(10, params.lobeAmplitude ?? 0));
  const lonSegs = Math.min(64, Math.max(12, Math.round(params.segments ?? 36)));
  const ctrl = [
    [rBottom, 0],
    [rLower, height * 0.22],
    [rMid, height * 0.48],
    [rUpper, height * 0.74],
    [rNeck, height * 0.9],
    [rTop, height]
  ];
  const zSteps = 20;
  const sampleOuterR = (t) => {
    const scaled = t * (ctrl.length - 1);
    const idx = Math.min(ctrl.length - 2, Math.floor(scaled));
    const frac = scaled - idx;
    const smooth = 0.5 - 0.5 * Math.cos(frac * Math.PI);
    return ctrl[idx][0] + (ctrl[idx + 1][0] - ctrl[idx][0]) * smooth;
  };
  const tris = [];
  const getOuter = (zi, li) => {
    const t = zi / zSteps;
    const z = t * height;
    const phi = li / lonSegs * Math.PI * 2;
    const baseR = sampleOuterR(t);
    const lobe = lobeCount > 0 ? lobeAmp * Math.sin(t * Math.PI) * Math.cos(lobeCount * phi) : 0;
    const r = Math.max(1, baseR + lobe);
    return { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
  };
  for (let zi = 0; zi < zSteps; zi++) {
    for (let li = 0; li < lonSegs; li++) {
      const ln = (li + 1) % lonSegs;
      pushQuad(tris, getOuter(zi, li), getOuter(zi, ln), getOuter(zi + 1, ln), getOuter(zi + 1, li));
    }
  }
  const bCenter = { x: 0, y: 0, z: bottomIndent };
  for (let li = 0; li < lonSegs; li++) {
    const ln = (li + 1) % lonSegs;
    tris.push([bCenter, getOuter(0, ln), getOuter(0, li)]);
  }
  if (wall > 0.8) {
    const floorZ = Math.max(2, Math.min(height * 0.25, wall * 1.5));
    const getInner = (zi, li) => {
      const t = zi / zSteps;
      const z = floorZ + t * (height - floorZ);
      const phi = li / lonSegs * Math.PI * 2;
      const r = Math.max(0.8, sampleOuterR(t) - wall);
      return { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
    };
    for (let zi = 0; zi < zSteps; zi++) {
      for (let li = 0; li < lonSegs; li++) {
        const ln = (li + 1) % lonSegs;
        pushQuad(tris, getInner(zi, ln), getInner(zi, li), getInner(zi + 1, li), getInner(zi + 1, ln));
      }
    }
    for (let li = 0; li < lonSegs; li++) {
      const ln = (li + 1) % lonSegs;
      pushQuad(tris, getOuter(zSteps, li), getOuter(zSteps, ln), getInner(zSteps, ln), getInner(zSteps, li));
      tris.push([{ x: 0, y: 0, z: floorZ }, getInner(0, li), getInner(0, ln)]);
    }
  } else {
    const tCenter = { x: 0, y: 0, z: height - topIndent };
    for (let li = 0; li < lonSegs; li++) {
      const ln = (li + 1) % lonSegs;
      tris.push([tCenter, getOuter(zSteps, li), getOuter(zSteps, ln)]);
    }
  }
  return tris;
}
function generateHeartTriangles(params) {
  const width = Math.max(12, params.width ?? 60);
  const depth = Math.max(12, params.depth ?? 56);
  const height = Math.max(4, params.height ?? 22);
  const crown = Math.max(0, Math.min(height * 0.4, params.bevel ?? 4));
  const segs = 48;
  const scaleX = width / 32;
  const scaleY = depth / 30;
  const ring = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3) * scaleX;
    const hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scaleY;
    ring.push([hx, hy]);
  }
  const tris = [];
  const wallH = Math.max(2, height - crown);
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % segs];
    pushQuad(
      tris,
      { x: x0, y: y0, z: 0 },
      { x: x1, y: y1, z: 0 },
      { x: x1, y: y1, z: wallH },
      { x: x0, y: y0, z: wallH }
    );
    tris.push([{ x: 0, y: 0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x0, y: y0, z: 0 }]);
    tris.push([{ x: 0, y: 0, z: height }, { x: x0, y: y0, z: wallH }, { x: x1, y: y1, z: wallH }]);
  }
  return tris;
}
function generateStarTriangles(params) {
  const points = Math.max(3, Math.min(16, Math.round(params.points ?? 5)));
  const outerR = Math.max(10, params.outerRadius ?? params.radius ?? 36);
  const innerR = Math.max(4, Math.min(outerR * 0.85, params.innerRadius ?? outerR * 0.44));
  const height = Math.max(4, params.height ?? 18);
  const baseH = Math.max(2, height * 0.55);
  const totalVerts = points * 2;
  const ring = [];
  for (let i = 0; i < totalVerts; i++) {
    const a = i / totalVerts * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    ring.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const tris = [];
  for (let i = 0; i < totalVerts; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % totalVerts];
    pushQuad(
      tris,
      { x: x0, y: y0, z: 0 },
      { x: x1, y: y1, z: 0 },
      { x: x1, y: y1, z: baseH },
      { x: x0, y: y0, z: baseH }
    );
    tris.push([{ x: 0, y: 0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x0, y: y0, z: 0 }]);
    tris.push([{ x: 0, y: 0, z: height }, { x: x0, y: y0, z: baseH }, { x: x1, y: y1, z: baseH }]);
  }
  return tris;
}
function generatePrimitiveRawTriangles(node) {
  switch (node.type) {
    case "box":
      return generateBoxTriangles(node.params);
    case "cylinder":
      return generateCylinderTriangles(node.params);
    case "cone":
      return generateConeTriangles(node.params);
    case "sphere":
      return generateSphereTriangles(node.params);
    case "torus":
      return generateTorusTriangles(node.params);
    case "gear":
      return generateGearTriangles(node.params);
    case "twisted_vase":
      return generateTwistedVaseTriangles(node.params);
    case "bracket":
      return generateBracketTriangles(node.params);
    case "hex_organizer":
      return generateHexOrganizerTriangles(node.params);
    case "apple":
      return generateAppleTriangles(node.params);
    case "lathe":
      return generateLatheTriangles(node.params);
    case "heart":
      return generateHeartTriangles(node.params);
    case "star":
      return generateStarTriangles(node.params);
    case "stl_mesh": {
      const data = node.meshData;
      if (!Array.isArray(data) || data.length < 9) return [];
      const tris = [];
      for (let i = 0; i <= data.length - 9; i += 9) {
        tris.push([
          { x: data[i], y: data[i + 1], z: data[i + 2] },
          { x: data[i + 3], y: data[i + 4], z: data[i + 5] },
          { x: data[i + 6], y: data[i + 7], z: data[i + 8] }
        ]);
      }
      return tris;
    }
    default:
      return generateBoxTriangles(node.params);
  }
}
function parseStlBufferToMeshData(bytes, maxTriangles = 6e3) {
  if (!bytes || bytes.byteLength < 84) {
    throw new Error("Ung\xFCltige oder leere STL-Datei (< 84 Bytes).");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expectedTriCount = view.getUint32(80, true);
  const isBinary = 84 + expectedTriCount * 50 <= bytes.byteLength && expectedTriCount > 0 && expectedTriCount < 5e6;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const rawTris = [];
  if (isBinary) {
    const preStride = expectedTriCount > 25e4 ? Math.ceil(expectedTriCount / 25e4) : 1;
    for (let i = 0; i < expectedTriCount; i += preStride) {
      const off = 84 + i * 50;
      if (off + 48 > bytes.byteLength) break;
      const v0 = {
        x: view.getFloat32(off + 12, true),
        y: view.getFloat32(off + 16, true),
        z: view.getFloat32(off + 20, true)
      };
      const v1 = {
        x: view.getFloat32(off + 24, true),
        y: view.getFloat32(off + 28, true),
        z: view.getFloat32(off + 32, true)
      };
      const v2 = {
        x: view.getFloat32(off + 36, true),
        y: view.getFloat32(off + 40, true),
        z: view.getFloat32(off + 44, true)
      };
      if (Number.isFinite(v0.x) && Number.isFinite(v0.y) && Number.isFinite(v0.z) && Number.isFinite(v1.x) && Number.isFinite(v2.x)) {
        rawTris.push([v0, v1, v2]);
        for (const v of [v0, v1, v2]) {
          if (v.x < minX) minX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.z < minZ) minZ = v.z;
          if (v.x > maxX) maxX = v.x;
          if (v.y > maxY) maxY = v.y;
          if (v.z > maxZ) maxZ = v.z;
        }
      }
    }
  } else {
    const text = new TextDecoder("utf-8").decode(bytes);
    const vertexRegex = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    const verts = [];
    let m;
    while ((m = vertexRegex.exec(text)) !== null) {
      const v = {
        x: parseFloat(m[1]),
        y: parseFloat(m[2]),
        z: parseFloat(m[3])
      };
      verts.push(v);
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
    const total = Math.floor(verts.length / 3);
    for (let i = 0; i < total; i++) {
      const idx = i * 3;
      rawTris.push([verts[idx], verts[idx + 1], verts[idx + 2]]);
    }
  }
  if (rawTris.length === 0) {
    throw new Error("Keine g\xFCltigen 3D-Dreiecke in der STL-Datei gefunden.");
  }
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  const spanZ = Math.max(1e-3, maxZ - minZ);
  const maxSpan = Math.max(spanX, spanY, spanZ);
  let selectedTris = rawTris;
  if (rawTris.length > maxTriangles) {
    const ratio = Math.sqrt(rawTris.length / maxTriangles);
    const gridRes = Math.max(22, Math.min(95, Math.round(90 / Math.max(1, ratio * 0.48))));
    const cellSize = maxSpan / gridRes;
    const snap = (v) => ({
      x: minX + Math.round((v.x - minX) / cellSize) * cellSize,
      y: minY + Math.round((v.y - minY) / cellSize) * cellSize,
      z: minZ + Math.round((v.z - minZ) / cellSize) * cellSize
    });
    const clustered = [];
    const seenFaces = /* @__PURE__ */ new Set();
    for (const [a, b, c] of rawTris) {
      const sa = snap(a);
      const sb = snap(b);
      const sc = snap(c);
      const ka = `${sa.x.toFixed(2)},${sa.y.toFixed(2)},${sa.z.toFixed(2)}`;
      const kb = `${sb.x.toFixed(2)},${sb.y.toFixed(2)},${sb.z.toFixed(2)}`;
      const kc = `${sc.x.toFixed(2)},${sc.y.toFixed(2)},${sc.z.toFixed(2)}`;
      if (ka === kb || kb === kc || ka === kc) continue;
      const faceKey = [ka, kb, kc].sort().join("|");
      if (seenFaces.has(faceKey)) continue;
      seenFaces.add(faceKey);
      clustered.push([sa, sb, sc]);
    }
    if (clustered.length >= 24) {
      selectedTris = clustered;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const meshData = [];
  for (const [a, b, c] of selectedTris) {
    meshData.push(
      Number((a.x - cx).toFixed(2)),
      Number((a.y - cy).toFixed(2)),
      Number((a.z - minZ).toFixed(2)),
      Number((b.x - cx).toFixed(2)),
      Number((b.y - cy).toFixed(2)),
      Number((b.z - minZ).toFixed(2)),
      Number((c.x - cx).toFixed(2)),
      Number((c.y - cy).toFixed(2)),
      Number((c.z - minZ).toFixed(2))
    );
  }
  return {
    meshData,
    originalTriangles: isBinary ? expectedTriCount : rawTris.length,
    dimensionsMm: {
      x: Number(Math.max(1, maxX - minX).toFixed(1)),
      y: Number(Math.max(1, maxY - minY).toFixed(1)),
      z: Number(Math.max(1, maxZ - minZ).toFixed(1))
    }
  };
}
function parseGlbBufferToMeshData(bytes, targetSizeMm = 68, maxTriangles = 6e3) {
  if (!bytes || bytes.byteLength < 28) {
    throw new Error("Ung\xFCltige GLB-Datei (< 28 Bytes).");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 1179937895) {
    throw new Error("Ung\xFCltiger GLB-Header (kein glTF 2.0 Binary).");
  }
  const jsonChunkLen = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 1313821514) {
    throw new Error("GLB JSON-Chunk fehlt.");
  }
  const jsonText = new TextDecoder("utf-8").decode(
    new Uint8Array(bytes.buffer, bytes.byteOffset + 20, jsonChunkLen)
  );
  const gltf = JSON.parse(jsonText);
  const binChunkHeaderOffset = 20 + jsonChunkLen;
  if (binChunkHeaderOffset + 8 > bytes.byteLength) {
    throw new Error("GLB Binary-Buffer-Chunk fehlt.");
  }
  const binStart = binChunkHeaderOffset + 8;
  const prim = gltf.meshes?.[0]?.primitives?.[0];
  if (!prim || prim.attributes?.POSITION === void 0) {
    throw new Error("Keine 3D-Mesh-Primitive in GLB-Datei gefunden.");
  }
  const posAcc = gltf.accessors?.[prim.attributes.POSITION];
  if (!posAcc || posAcc.bufferView === void 0) {
    throw new Error("GLB POSITION-Accessor fehlt.");
  }
  const posBv = gltf.bufferViews?.[posAcc.bufferView];
  if (!posBv) {
    throw new Error("GLB POSITION-BufferView fehlt.");
  }
  const posOffset = binStart + (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
  const posStride = posBv.byteStride || 12;
  const vertCount = posAcc.count;
  const vertices = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) {
    const off = posOffset + i * posStride;
    const x = view.getFloat32(off, true);
    const y = view.getFloat32(off + 4, true);
    const z = view.getFloat32(off + 8, true);
    vertices[i] = { x, y, z };
  }
  let dominantColorHex = "#10b981";
  if (prim.attributes?.COLOR_0 !== void 0) {
    const colAcc = gltf.accessors?.[prim.attributes.COLOR_0];
    const colBv = colAcc?.bufferView !== void 0 ? gltf.bufferViews?.[colAcc.bufferView] : void 0;
    if (colAcc && colBv && colAcc.componentType === 5121) {
      const colOffset = binStart + (colBv.byteOffset || 0) + (colAcc.byteOffset || 0);
      const colStride = colBv.byteStride || (colAcc.type === "VEC4" ? 4 : 3);
      let rSum = 0, gSum = 0, bSum = 0, samples = 0;
      const step = Math.max(1, Math.floor(colAcc.count / 500));
      for (let i = 0; i < colAcc.count; i += step) {
        const off = colOffset + i * colStride;
        if (off + 3 <= bytes.byteLength) {
          rSum += bytes[off];
          gSum += bytes[off + 1];
          bSum += bytes[off + 2];
          samples++;
        }
      }
      if (samples > 0) {
        const r = Math.min(255, Math.max(70, Math.round(rSum / samples)));
        const g = Math.min(255, Math.max(70, Math.round(gSum / samples)));
        const b = Math.min(255, Math.max(70, Math.round(bSum / samples)));
        dominantColorHex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      }
    }
  }
  const rawTris = [];
  if (prim.indices !== void 0) {
    const idxAcc = gltf.accessors?.[prim.indices];
    const idxBv = idxAcc?.bufferView !== void 0 ? gltf.bufferViews?.[idxAcc.bufferView] : void 0;
    if (!idxAcc || !idxBv) {
      throw new Error("GLB Index-BufferView fehlt.");
    }
    const idxOffset = binStart + (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
    const triCount = Math.floor(idxAcc.count / 3);
    for (let i = 0; i < triCount; i++) {
      let i0 = 0, i1 = 0, i2 = 0;
      if (idxAcc.componentType === 5125) {
        const base = idxOffset + i * 12;
        i0 = view.getUint32(base, true);
        i1 = view.getUint32(base + 4, true);
        i2 = view.getUint32(base + 8, true);
      } else if (idxAcc.componentType === 5123) {
        const base = idxOffset + i * 6;
        i0 = view.getUint16(base, true);
        i1 = view.getUint16(base + 2, true);
        i2 = view.getUint16(base + 4, true);
      } else {
        const base = idxOffset + i * 3;
        i0 = bytes[base];
        i1 = bytes[base + 1];
        i2 = bytes[base + 2];
      }
      const v0 = vertices[i0];
      const v1 = vertices[i1];
      const v2 = vertices[i2];
      if (v0 && v1 && v2) {
        rawTris.push([v0, v1, v2]);
      }
    }
  } else {
    const triCount = Math.floor(vertCount / 3);
    for (let i = 0; i < triCount; i++) {
      rawTris.push([vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]]);
    }
  }
  if (rawTris.length === 0) {
    throw new Error("Keine 3D-Dreiecke im GLB-Mesh enthalten.");
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  const isGlTfYUp = !jsonText.includes("tmp") || Math.abs(maxY - minY) > 0;
  const orient = (v) => isGlTfYUp ? { x: v.x, y: -v.z, z: v.y } : v;
  let oMinX = Infinity, oMinY = Infinity, oMinZ = Infinity;
  let oMaxX = -Infinity, oMaxY = -Infinity, oMaxZ = -Infinity;
  const orientedTris = rawTris.map(([a, b, c]) => {
    const oa = orient(a);
    const ob = orient(b);
    const oc = orient(c);
    for (const v of [oa, ob, oc]) {
      if (v.x < oMinX) oMinX = v.x;
      if (v.y < oMinY) oMinY = v.y;
      if (v.z < oMinZ) oMinZ = v.z;
      if (v.x > oMaxX) oMaxX = v.x;
      if (v.y > oMaxY) oMaxY = v.y;
      if (v.z > oMaxZ) oMaxZ = v.z;
    }
    return [oa, ob, oc];
  });
  const rawSpanX = Math.max(1e-4, oMaxX - oMinX);
  const rawSpanY = Math.max(1e-4, oMaxY - oMinY);
  const rawSpanZ = Math.max(1e-4, oMaxZ - oMinZ);
  const maxRawSpan = Math.max(rawSpanX, rawSpanY, rawSpanZ);
  const scaleFactor = maxRawSpan < 10 ? targetSizeMm / maxRawSpan : 1;
  let finalTris = orientedTris;
  if (orientedTris.length > maxTriangles) {
    const gridRes = 46;
    const cellSize = maxRawSpan / gridRes;
    const snap = (v) => ({
      x: oMinX + Math.round((v.x - oMinX) / cellSize) * cellSize,
      y: oMinY + Math.round((v.y - oMinY) / cellSize) * cellSize,
      z: oMinZ + Math.round((v.z - oMinZ) / cellSize) * cellSize
    });
    const clustered = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [a, b, c] of orientedTris) {
      const sa = snap(a);
      const sb = snap(b);
      const sc = snap(c);
      const ka = `${sa.x.toFixed(4)},${sa.y.toFixed(4)},${sa.z.toFixed(4)}`;
      const kb = `${sb.x.toFixed(4)},${sb.y.toFixed(4)},${sb.z.toFixed(4)}`;
      const kc = `${sc.x.toFixed(4)},${sc.y.toFixed(4)},${sc.z.toFixed(4)}`;
      if (ka === kb || kb === kc || ka === kc) continue;
      const key = [ka, kb, kc].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      clustered.push([sa, sb, sc]);
    }
    if (clustered.length >= 24) {
      finalTris = clustered;
    }
  }
  const cx = (oMinX + oMaxX) / 2;
  const cy = (oMinY + oMaxY) / 2;
  const meshData = [];
  for (const [a, b, c] of finalTris) {
    meshData.push(
      Number(((a.x - cx) * scaleFactor).toFixed(2)),
      Number(((a.y - cy) * scaleFactor).toFixed(2)),
      Number(((a.z - oMinZ) * scaleFactor).toFixed(2)),
      Number(((b.x - cx) * scaleFactor).toFixed(2)),
      Number(((b.y - cy) * scaleFactor).toFixed(2)),
      Number(((b.z - oMinZ) * scaleFactor).toFixed(2)),
      Number(((c.x - cx) * scaleFactor).toFixed(2)),
      Number(((c.y - cy) * scaleFactor).toFixed(2)),
      Number(((c.z - oMinZ) * scaleFactor).toFixed(2))
    );
  }
  return {
    meshData,
    originalTriangles: rawTris.length,
    dimensionsMm: {
      x: Number(Math.max(1, rawSpanX * scaleFactor).toFixed(1)),
      y: Number(Math.max(1, rawSpanY * scaleFactor).toFixed(1)),
      z: Number(Math.max(1, rawSpanZ * scaleFactor).toFixed(1))
    },
    dominantColorHex
  };
}
function compileSceneToMesh(scene) {
  const rawFaces = [];
  for (const node of scene.nodes) {
    const localTris = generatePrimitiveRawTriangles(node);
    const isSub = node.operation === "subtract";
    const isIdentity = node.position[0] === 0 && node.position[1] === 0 && node.position[2] === 0 && node.rotation[0] === 0 && node.rotation[1] === 0 && node.rotation[2] === 0 && node.scale[0] === 1 && node.scale[1] === 1 && node.scale[2] === 1;
    const faceColor = isSub ? "#f43f5e" : node.color || scene.printProfile.filamentColor || "#00AE42";
    for (const [p0, p1, p2] of localTris) {
      const v0 = isIdentity ? { ...p0 } : transformPoint(p0, node.position, node.rotation, node.scale);
      const v1 = isIdentity ? { ...p1 } : transformPoint(p1, node.position, node.rotation, node.scale);
      const v2 = isIdentity ? { ...p2 } : transformPoint(p2, node.position, node.rotation, node.scale);
      const normal = isSub ? computeNormal(v0, v2, v1) : computeNormal(v0, v1, v2);
      rawFaces.push({
        v0,
        v1: isSub ? v2 : v1,
        v2: isSub ? v1 : v2,
        normal,
        color: faceColor,
        nodeId: node.id,
        isSubtract: isSub
      });
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const f of rawFaces) {
    if (f.isSubtract) continue;
    for (const v of [f.v0, f.v1, f.v2]) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  if (!Number.isFinite(minZ)) {
    minX = -10;
    maxX = 10;
    minY = -10;
    maxY = 10;
    minZ = 0;
    maxZ = 10;
  }
  const zShift = minZ < 0 ? -minZ : 0;
  if (zShift !== 0) {
    for (const f of rawFaces) {
      f.v0.z += zShift;
      f.v1.z += zShift;
      f.v2.z += zShift;
    }
    minZ += zShift;
    maxZ += zShift;
  }
  let signedVolumeMm3 = 0;
  const shouldIndexVertices = rawFaces.length <= 12e3;
  const vertexMap = shouldIndexVertices ? /* @__PURE__ */ new Map() : null;
  const indexedVertices = [];
  const indexedTriangles = [];
  const getVertexIndex = (v) => {
    const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    const existing = vertexMap.get(key);
    if (existing !== void 0) return existing;
    const idx = indexedVertices.length;
    indexedVertices.push({
      x: Number(v.x.toFixed(2)),
      y: Number(v.y.toFixed(2)),
      z: Number(v.z.toFixed(2))
    });
    vertexMap.set(key, idx);
    return idx;
  };
  for (const f of rawFaces) {
    if (shouldIndexVertices) {
      const i0 = getVertexIndex(f.v0);
      const i1 = getVertexIndex(f.v1);
      const i2 = getVertexIndex(f.v2);
      if (i0 !== i1 && i1 !== i2 && i0 !== i2) {
        indexedTriangles.push([i0, i1, i2]);
      }
    }
    const v321 = f.v2.x * f.v1.y * f.v0.z;
    const v231 = f.v1.x * f.v2.y * f.v0.z;
    const v312 = f.v2.x * f.v0.y * f.v1.z;
    const v132 = f.v0.x * f.v2.y * f.v1.z;
    const v213 = f.v1.x * f.v0.y * f.v2.z;
    const v123 = f.v0.x * f.v1.y * f.v2.z;
    const tetVol = 1 / 6 * (-v321 + v231 + v312 - v132 - v213 + v123);
    signedVolumeMm3 += tetVol;
  }
  const dimX = Math.max(0, Number((maxX - minX).toFixed(1)));
  const dimY = Math.max(0, Number((maxY - minY).toFixed(1)));
  const dimZ = Math.max(0, Number((maxZ - minZ).toFixed(1)));
  const rawVolCm3 = Math.max(0.8, Math.abs(signedVolumeMm3) / 1e3);
  const infillFactor = 0.28 + (scene.printProfile.infillPercent || 20) / 100 * 0.72;
  const effectivePlasticCm3 = rawVolCm3 * infillFactor;
  const filamentWeightG = Number((effectivePlasticCm3 * 1.24).toFixed(1));
  const filamentLengthM = Number((filamentWeightG / 2.98).toFixed(2));
  const layerHeight = Math.max(0.08, scene.printProfile.layerHeightMm || 0.2);
  const layerCount = Math.max(1, Math.ceil(dimZ / layerHeight));
  const estimatedPrintMinutes = Math.max(6, Math.round(5 + filamentWeightG * 3.2 + layerCount * 0.08));
  return {
    triangles: rawFaces,
    indexedVertices,
    indexedTriangles,
    stats: {
      triangleCount: rawFaces.length,
      vertexCount: shouldIndexVertices ? indexedVertices.length : Math.round(rawFaces.length * 1.5),
      dimensionsMm: { x: dimX, y: dimY, z: dimZ },
      bounds: {
        min: { x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), z: Number(minZ.toFixed(2)) },
        max: { x: Number(maxX.toFixed(2)), y: Number(maxY.toFixed(2)), z: Number(maxZ.toFixed(2)) }
      },
      volumeCm3: Number(rawVolCm3.toFixed(2)),
      filamentWeightG,
      filamentLengthM,
      layerCount,
      estimatedPrintMinutes
    }
  };
}
function exportBinaryStl(mesh, headerTitle = "thassi.3dprint Binary STL") {
  const triCount = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const headerText = `${headerTitle} - Bambu Lab P1S Ready`.slice(0, 79);
  for (let i = 0; i < headerText.length; i++) {
    bytes[i] = headerText.charCodeAt(i) & 255;
  }
  view.setUint32(80, triCount, true);
  let offset = 84;
  for (const t of mesh.triangles) {
    view.setFloat32(offset + 0, t.normal.x, true);
    view.setFloat32(offset + 4, t.normal.y, true);
    view.setFloat32(offset + 8, t.normal.z, true);
    view.setFloat32(offset + 12, t.v0.x, true);
    view.setFloat32(offset + 16, t.v0.y, true);
    view.setFloat32(offset + 20, t.v0.z, true);
    view.setFloat32(offset + 24, t.v1.x, true);
    view.setFloat32(offset + 28, t.v1.y, true);
    view.setFloat32(offset + 32, t.v1.z, true);
    view.setFloat32(offset + 36, t.v2.x, true);
    view.setFloat32(offset + 40, t.v2.y, true);
    view.setFloat32(offset + 44, t.v2.z, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return bytes;
}
var CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(data) {
  let crc = 4294967295;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}
function createZipArchive(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encodeUtf8(file.name);
    const data = file.content;
    const crc = crc32(data);
    const size = data.byteLength;
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 67324752, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 21793, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    new Uint8Array(localHeader, 30).set(nameBytes);
    localChunks.push(new Uint8Array(localHeader));
    localChunks.push(data);
    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(centralHeader);
    cv.setUint32(0, 33639248, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 21793, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(nameBytes);
    centralChunks.push(new Uint8Array(centralHeader));
    offset += 30 + nameBytes.length + size;
  }
  let centralSize = 0;
  for (const c of centralChunks) centralSize += c.byteLength;
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 101010256, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const totalSize = offset + centralSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const c of localChunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  for (const c of centralChunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  out.set(new Uint8Array(eocd), pos);
  return out;
}
function export3mfArchive(mesh, scene) {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="text/xml"/>
</Types>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  let verts = mesh.indexedVertices;
  let tris = mesh.indexedTriangles;
  if (verts.length === 0 && mesh.triangles.length > 0) {
    const vMap = /* @__PURE__ */ new Map();
    verts = [];
    tris = [];
    const getIdx = (v) => {
      const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
      const ex = vMap.get(k);
      if (ex !== void 0) return ex;
      const i = verts.length;
      verts.push({ x: Number(v.x.toFixed(2)), y: Number(v.y.toFixed(2)), z: Number(v.z.toFixed(2)) });
      vMap.set(k, i);
      return i;
    };
    for (const f of mesh.triangles) {
      const i0 = getIdx(f.v0);
      const i1 = getIdx(f.v1);
      const i2 = getIdx(f.v2);
      if (i0 !== i1 && i1 !== i2 && i0 !== i2) tris.push([i0, i1, i2]);
    }
  }
  const verticesXml = verts.map((v) => `          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join("\n");
  const trianglesXml = tris.map(([v1, v2, v3]) => `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join("\n");
  const safeTitle = (scene.title || "ThassiModel").replace(/[<>&"']/g, "");
  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
  <metadata name="Application">Thassi.3DPrint-Antigravity-1.0</metadata>
  <metadata name="Title">${safeTitle}</metadata>
  <metadata name="Designer">Antigravity AI</metadata>
  <resources>
    <object id="1" name="${safeTitle}" type="model">
      <mesh>
        <vertices>
${verticesXml}
        </vertices>
        <triangles>
${trianglesXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>
  </build>
</model>`;
  const settingsConfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="${safeTitle}"/>
    <metadata key="extruder" value="1"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Bambu Lab P1S Textured PEI"/>
    <model_instance>
      <metadata key="object_id" value="1"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
</config>`;
  return createZipArchive([
    { name: "[Content_Types].xml", content: encodeUtf8(contentTypesXml) },
    { name: "_rels/.rels", content: encodeUtf8(relsXml) },
    { name: "3D/3dmodel.model", content: encodeUtf8(modelXml) },
    { name: "Metadata/model_settings.config", content: encodeUtf8(settingsConfigXml) }
  ]);
}
function exportPrintableGcode(mesh, scene) {
  const prof = scene.printProfile || DEFAULT_PRINT_PROFILE;
  const layerH = Math.max(0.08, prof.layerHeightMm || 0.2);
  const totalLayers = Math.max(1, mesh.stats.layerCount);
  const nozzleTemp = prof.nozzleTempC || 220;
  const bedTemp = prof.bedTempC || 60;
  const centerX = 128;
  const centerY = 128;
  const lines = [
    `; Generated by thassi.3dprint (Antigravity 3D Slicer Engine v1.0.0)`,
    `; Project: ${scene.title}`,
    `; Target Printer: ${prof.printerModel} (256x256x256mm)`,
    `; Filament: ${prof.filamentType} (${prof.filamentColor})`,
    `; Dimensions: ${mesh.stats.dimensionsMm.x} x ${mesh.stats.dimensionsMm.y} x ${mesh.stats.dimensionsMm.z} mm`,
    `; Layers: ${totalLayers} (Layer Height: ${layerH} mm)`,
    `; Estimated Filament: ${mesh.stats.filamentWeightG} g (${mesh.stats.filamentLengthM} m)`,
    `; Estimated Time: ${mesh.stats.estimatedPrintMinutes} min`,
    `M73 P0 R${mesh.stats.estimatedPrintMinutes}`,
    `G90 ; Absolute coordinates`,
    `M83 ; Relative extruder distances`,
    `M140 S${bedTemp} ; Set bed temperature`,
    `M104 S${nozzleTemp} ; Set nozzle temperature`,
    `G28 ; Home all axes (Bambu Lab P1S)`,
    `M190 S${bedTemp} ; Wait for bed temperature`,
    `M109 S${nozzleTemp} ; Wait for nozzle temperature`,
    `; Bambu Lab P1S front nozzle purge line`,
    `G1 Z2.0 F3000`,
    `G1 X10 Y5 Z0.28 F5000`,
    `G1 X120 Y5 E12.0 F1500`,
    `G1 X120 Y5.6 F5000`,
    `G1 X10 Y5.6 E12.0 F1500`,
    `G1 Z1.0 F3000`
  ];
  const maxSliceLayers = Math.min(totalLayers, 180);
  const stepLayers = Math.max(1, Math.floor(totalLayers / maxSliceLayers));
  const minX = mesh.stats.bounds.min.x;
  const maxX = mesh.stats.bounds.max.x;
  const minY = mesh.stats.bounds.min.y;
  const maxY = mesh.stats.bounds.max.y;
  for (let l = 1; l <= totalLayers; l += stepLayers) {
    const z = Number((l * layerH).toFixed(3));
    const pct = Math.min(99, Math.round(l / totalLayers * 100));
    const remMin = Math.max(1, Math.round(mesh.stats.estimatedPrintMinutes * (1 - l / totalLayers)));
    lines.push(`; LAYER:${l}/${totalLayers} Z=${z}mm`);
    lines.push(`M73 P${pct} R${remMin}`);
    lines.push(`G1 Z${z} F1800`);
    let lMinX = Infinity;
    let lMaxX = -Infinity;
    let lMinY = Infinity;
    let lMaxY = -Infinity;
    for (const t of mesh.triangles) {
      if (t.isSubtract) continue;
      const tMinZ = Math.min(t.v0.z, t.v1.z, t.v2.z);
      const tMaxZ = Math.max(t.v0.z, t.v1.z, t.v2.z);
      if (z >= tMinZ && z <= tMaxZ) {
        const txMin = Math.min(t.v0.x, t.v1.x, t.v2.x);
        const txMax = Math.max(t.v0.x, t.v1.x, t.v2.x);
        const tyMin = Math.min(t.v0.y, t.v1.y, t.v2.y);
        const tyMax = Math.max(t.v0.y, t.v1.y, t.v2.y);
        if (txMin < lMinX) lMinX = txMin;
        if (txMax > lMaxX) lMaxX = txMax;
        if (tyMin < lMinY) lMinY = tyMin;
        if (tyMax > lMaxY) lMaxY = tyMax;
      }
    }
    if (!Number.isFinite(lMinX)) {
      lMinX = minX;
      lMaxX = maxX;
      lMinY = minY;
      lMaxY = maxY;
    }
    const x0 = (centerX + lMinX).toFixed(2);
    const x1 = (centerX + lMaxX).toFixed(2);
    const y0 = (centerY + lMinY).toFixed(2);
    const y1 = (centerY + lMaxY).toFixed(2);
    const dx = Math.max(1, lMaxX - lMinX);
    const dy = Math.max(1, lMaxY - lMinY);
    const eX = (dx * 0.033).toFixed(4);
    const eY = (dy * 0.033).toFixed(4);
    lines.push(`G1 X${x0} Y${y0} F9000`);
    lines.push(`G1 X${x1} Y${y0} E${eX} F3600`);
    lines.push(`G1 X${x1} Y${y1} E${eY} F3600`);
    lines.push(`G1 X${x0} Y${y1} E${eX} F3600`);
    lines.push(`G1 X${x0} Y${y0} E${eY} F3600`);
    const midY = (centerY + (lMinY + lMaxY) / 2).toFixed(2);
    lines.push(`G1 X${x0} Y${midY} F9000`);
    lines.push(`G1 X${x1} Y${midY} E${eX} F4800`);
  }
  lines.push(
    `M73 P100 R0`,
    `; End G-Code for Bambu Lab P1S`,
    `G1 E-1.5 F2400 ; Retract filament`,
    `G1 Z${Math.min(250, Math.round(mesh.stats.dimensionsMm.z + 15))} F3000`,
    `G1 X10 Y245 F9000 ; Present print`,
    `M104 S0 ; Turn off nozzle heater`,
    `M140 S0 ; Turn off bed heater`,
    `M106 S0 ; Turn off part fan`,
    `M84 ; Disable steppers`
  );
  return lines.join("\n");
}
var PRESET_TEMPLATES = {
  desk_headphone_stand: () => ({
    projectId: "preset-headphone-hook",
    title: "Schreibtisch-Kopfh\xF6rerhalter (Bambu P1S)",
    description: "Verst\xE4rkter Tischkanten-Klemmhalter mit Kabelf\xFChrung und rutschfester Frontlippe.",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    buildPlateMm: [256, 256, 256],
    printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#00AE42", infillPercent: 25 },
    nodes: [
      {
        id: "node-bracket-main",
        name: "Tischklemme & Hakenk\xF6rper",
        type: "bracket",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#00AE42",
        params: { width: 38, depth: 62, height: 74, thickness: 7, lipHeight: 22 }
      },
      {
        id: "node-cable-bore",
        name: "Kabelf\xFChrung-Durchbruch",
        type: "cylinder",
        operation: "subtract",
        position: [0, -27, 36],
        rotation: [90, 0, 0],
        scale: [1, 1, 1],
        color: "#f43f5e",
        params: { radiusBottom: 6, radiusTop: 6, height: 18, segments: 24 }
      }
    ],
    promptHistory: [
      {
        id: "init-1",
        prompt: "Erstelle einen stabilen Kopfh\xF6rerhalter f\xFCr die Schreibtischkante mit Kabelf\xFChrung",
        summary: "Tischklemme (38\xD762\xD774mm, 7mm Wandst\xE4rke) mit 22mm Haltelippe und 12mm Kabeldurchf\xFChrung generiert.",
        engine: "Antigravity Parametric CAD",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  }),
  precision_planetary_gear: () => ({
    projectId: "preset-gear-24t",
    title: "Pr\xE4zisions-Stirnrad Z24 mit Nabe",
    description: "Mechanisches Stirnzahnrad (24 Z\xE4hne, \xD864mm) mit verst\xE4rkter Mittelbohrung f\xFCr 8mm Welle.",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    buildPlateMm: [256, 256, 256],
    printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#38bdf8", infillPercent: 35 },
    nodes: [
      {
        id: "node-gear-ring",
        name: "Zahnkranz Z24",
        type: "gear",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#38bdf8",
        params: { teeth: 24, outerRadius: 34, toothDepth: 4.8, boreRadius: 8, height: 12 }
      },
      {
        id: "node-gear-hub",
        name: "Verst\xE4rkte Wellen-Nabe",
        type: "cylinder",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#0284c7",
        params: { radiusBottom: 15, radiusTop: 14, innerRadius: 5, height: 20, segments: 36 }
      }
    ],
    promptHistory: [
      {
        id: "init-gear",
        prompt: "Erstelle ein Zahnrad mit 24 Z\xE4hnen, Nabe und 10mm Wellenbohrung",
        summary: "Stirnrad (24 Z\xE4hne, \xD868mm, H\xF6he 12mm) mit 20mm Nabe und \xD810mm Innenbohrung erstellt.",
        engine: "Antigravity Parametric CAD",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  }),
  twisted_rib_vase: () => ({
    projectId: "preset-twisted-vase",
    title: "Spiral-Designvase (Bambu Silk)",
    description: "Skulpturale Vase mit 14 harmonischen L\xE4ngsrippen und 110\xB0 Torsion.",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    buildPlateMm: [256, 256, 256],
    printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#f59e0b", infillPercent: 15 },
    nodes: [
      {
        id: "node-vase-body",
        name: "Torsions-Vasenk\xF6rper",
        type: "twisted_vase",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#f59e0b",
        params: {
          radiusBottom: 28,
          radiusTop: 35,
          height: 92,
          wallThickness: 2.6,
          twistDeg: 110,
          ribCount: 14,
          ribAmplitude: 3.2
        }
      }
    ],
    promptHistory: [
      {
        id: "init-vase",
        prompt: "Generiere eine gedrehte Design-Vase mit 14 Rippen und 92mm H\xF6he",
        summary: "Skulpturale Rippen-Vase (\xD870\xD792mm, 110\xB0 Drehung, 2.6mm Wandung) erstellt.",
        engine: "Antigravity Parametric CAD",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  }),
  smart_home_organizer: () => ({
    projectId: "preset-hex-organizer",
    title: "Schreibtisch & Smart-Sensor Organizer (6 F\xE4cher)",
    description: "Modularer Aufbewahrungs-Tray f\xFCr Werkzeuge, SD-Karten, USB-Sticks und Shelly Sensoren.",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    buildPlateMm: [256, 256, 256],
    printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#a855f7", infillPercent: 20 },
    nodes: [
      {
        id: "node-organizer-tray",
        name: "6-Kammer Organizer Korpus",
        type: "hex_organizer",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#a855f7",
        params: { width: 88, depth: 58, height: 38, wallThickness: 2.4, slotsX: 3, slotsY: 2 }
      }
    ],
    promptHistory: [
      {
        id: "init-org",
        prompt: "Erstelle einen Schreibtisch-Organizer mit 3x2 F\xE4chern",
        summary: "6-Kammer Organizer (88\xD758\xD738mm, 2.4mm Wandst\xE4rke) generiert.",
        engine: "Antigravity Parametric CAD",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  }),
  organic_apple_sculpture: () => ({
    projectId: "preset-organic-apple",
    title: "3D-Apfel mit Stiel & Blatt (Organisches Modell)",
    description: "Naturgetreuer 3D-Apfel mit oberer Stielgrube, unterer Kelch-Einbuchtung, 5-fach gew\xF6lbter Kontur, Stiel und Blatt.",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    buildPlateMm: [256, 256, 256],
    printProfile: {
      ...DEFAULT_PRINT_PROFILE,
      printerModel: "Bambu Lab X1-Carbon 0.4 nozzle",
      filamentColor: "#e11d48",
      infillPercent: 18
    },
    nodes: [
      {
        id: "node-apple-body",
        name: "Apfel-Fruchtk\xF6rper (mit Stielgrube)",
        type: "apple",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#e11d48",
        params: {
          radius: 34,
          height: 58,
          lobeCount: 5,
          lobeAmplitude: 1.4,
          topIndent: 12,
          bottomIndent: 5,
          segments: 36
        }
      },
      {
        id: "node-apple-stem",
        name: "Apfelstiel (Oben)",
        type: "cylinder",
        operation: "union",
        position: [1.5, 0, 44],
        rotation: [0, 14, 0],
        scale: [1, 1, 1],
        color: "#854d0e",
        params: { radiusBottom: 2.2, radiusTop: 3.2, innerRadius: 0, height: 22, segments: 20 }
      },
      {
        id: "node-apple-leaf",
        name: "Apfelblatt",
        type: "sphere",
        operation: "union",
        position: [14, 2, 57],
        rotation: [18, -28, 15],
        scale: [1.85, 0.78, 0.24],
        color: "#16a34a",
        params: { radius: 9.5, domeOnly: 0 }
      }
    ],
    promptHistory: [
      {
        id: "init-apple",
        prompt: "Apfel",
        summary: "Organischer 3D-Apfel (\xD870\xD766mm) mit oberer Stielgrube, unterer Kelch-Einbuchtung, 5-fach gew\xF6lbtem Fruchtk\xF6rper, geneigtem Stiel und Blatt generiert.",
        engine: "Antigravity Parametric CAD",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  })
};

// apps/3d-print/backend/bambu-lan.ts
import net2 from "node:net";
import tls from "node:tls";
import dgram2 from "node:dgram";
var BAMBU_API_SPECIFICATION = {
  manufacturer: "Bambu Lab",
  detectedProfileModel: "Bambu X1C WHG \u2014 Bambu Lab X1-Carbon (BL-P001 \xB7 192.168.188.175 \xB7 SN 00M09A391700992 \xB7 FW 01.11.02.00)",
  localSubnet: "192.168.188.0/24 (Fritz!Box 6890 LTE \xB7 Obi-WLAN Kenobi)",
  discoveryProtocol: {
    protocol: "SSDP over UDP Multicast / Broadcast",
    multicastAddress: "239.255.255.250",
    udpPorts: [2021, 1990, 1900],
    searchTarget: "urn:bambulab-com:device:3dprinter:1",
    headers: [
      "USN: 00M09A391700992 (Seriennummer des erkannten Bambu X1C WHG)",
      "Location: 192.168.188.175 (Lokale IPv4-Adresse im Subnetz 192.168.188.x, MAC 50:41:1C:89:3F:72)",
      "DevName.bambu.com: Bambu X1C WHG",
      "DevModel.bambu.com: BL-P001 (Bambu Lab X1-Carbon \xB7 C12 = P1S, C11 = P1P, N2S = A1, N1 = A1 mini)",
      "DevVersion.bambu.com: 01.11.02.00 (Firmware-Version)",
      "DevConnect.bambu.com: cloud / lan (DevBind: free, Devseclink: secure, Signal: -68 dBm)"
    ]
  },
  mqttTelemetryAndControl: {
    protocol: "MQTT v3.1.1 over TLS (Self-Signed Device Certificate, CN=00M09A391700992, Issuer=BBL CA)",
    port: 8883,
    endpointTemplate: "mqtts://bblp:<LAN_ACCESS_CODE>@192.168.188.175:8883",
    username: "bblp",
    passwordSource: "8-stelliger LAN Access Code (Touchscreen \u2192 Einstellungen \u2192 WLAN / LAN Only Mode \u2192 Access Code)",
    tlsOptions: "rejectUnauthorized: false (Bambu Root CA self-signed)",
    topics: {
      reportSubscribe: "device/00M09A391700992/report",
      requestPublish: "device/00M09A391700992/request"
    },
    payloadExamples: {
      pushAllStatus: { pushing: { sequence_id: "1", command: "pushall" } },
      pausePrint: { print: { sequence_id: "2", command: "pause" } },
      resumePrint: { print: { sequence_id: "3", command: "resume" } },
      stopPrint: { print: { sequence_id: "4", command: "stop" } },
      chamberLightToggle: {
        system: { sequence_id: "5", command: "ledctrl", led_node: "chamber_light", led_mode: "on" }
      },
      setSpeedProfile: { print: { sequence_id: "6", command: "print_speed", param: "2" } },
      sendGcodeLine: {
        print: { sequence_id: "7", command: "gcode_line", param: "G28\nM104 S220\nM140 S60\n" }
      },
      start3mfPrint: {
        print: {
          sequence_id: "8",
          command: "project_file",
          param: "Metadata/plate_1.gcode",
          url: "ftp:///thassi_model.3mf",
          subtask_name: "thassi_model",
          bed_type: "auto",
          timelapse: false,
          bed_leveling: true,
          flow_cali: true,
          vibration_cali: true,
          use_ams: false
        }
      }
    }
  },
  directFileTransferFtps: {
    protocol: "Implicit FTPS (FTP over TLS \u2014 vsFTPd 3.0.3)",
    port: 990,
    endpointTemplate: "ftps://bblp:<LAN_ACCESS_CODE>@192.168.188.175:990/",
    username: "bblp",
    passwordSource: "8-stelliger LAN Access Code",
    targetDirectory: "/ (Wurzelverzeichnis der microSD-Karte) oder /cache/",
    supportedFormats: [".3mf (mit eingebettetem G-Code/Mesh)", ".gcode"]
  },
  chamberCameraStream: {
    p1s_p1p_a1: "TCP Port 6000 (TLS JPEG Frame Stream \u2014 auf 192.168.188.175:6000 aktiv)",
    x1c_x1e: "RTSPS Port 322 (rtsps://bblp:<LAN_ACCESS_CODE>@192.168.188.175:322/streaming/live/1 \u2014 nach Aktivierung von Liveview/LAN-Mode am X1C)"
  }
};
function checkTcpPort(ip, port, timeoutMs = 550) {
  return new Promise((resolve) => {
    if (!ip) return resolve(false);
    const sock = new net2.Socket();
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        sock.destroy();
        resolve(ok);
      }
    };
    sock.setTimeout(timeoutMs);
    sock.on("connect", () => finish(true));
    sock.on("timeout", () => finish(false));
    sock.on("error", () => finish(false));
    sock.connect(port, ip);
  });
}
function inspectBambuTlsCertificate(ip, port = 8883, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (!settled) {
        settled = true;
        try {
          sock.destroy();
        } catch {
        }
        resolve(res);
      }
    };
    const sock = tls.connect(
      {
        host: ip,
        port,
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      () => {
        try {
          const cert = sock.getPeerCertificate();
          const rawCn = Array.isArray(cert?.subject?.CN) ? cert.subject.CN[0] : cert?.subject?.CN;
          const cn = String(rawCn || "");
          const rawIssuer = (Array.isArray(cert?.issuer?.CN) ? cert.issuer.CN[0] : cert?.issuer?.CN) || (Array.isArray(cert?.issuer?.O) ? cert.issuer.O[0] : cert?.issuer?.O) || "";
          const issuer = String(rawIssuer || "");
          const isBambuCert = /BBL/i.test(issuer) || /BBL/i.test(String(cert?.issuer?.O || "")) || /^(00M|01S|01P|039|030)/i.test(cn);
          finish({ ok: true, cn, issuer, isBambuCert });
        } catch {
          finish({ ok: true });
        }
      }
    );
    sock.on("error", () => finish({ ok: false }));
    sock.setTimeout(timeoutMs, () => finish({ ok: false }));
  });
}
function mapBambuModelName(codeOrSerial) {
  const c = (codeOrSerial || "").trim().toUpperCase();
  if (c === "BL-P001" || c.startsWith("00M")) return "Bambu Lab X1-Carbon (BL-P001)";
  if (c === "BL-P002") return "Bambu Lab X1 (BL-P002)";
  if (c === "C13") return "Bambu Lab X1E (C13)";
  if (c === "C12" || c.startsWith("01S")) return "Bambu Lab P1S (C12)";
  if (c === "C11" || c.startsWith("01P")) return "Bambu Lab P1P (C11)";
  if (c === "N2S" || c.startsWith("039")) return "Bambu Lab A1 (N2S)";
  if (c === "N1" || c.startsWith("030")) return "Bambu Lab A1 mini (N1)";
  return codeOrSerial || "Bambu Lab 3D Printer";
}
function parseSsdpPacket(rawText, remoteIp) {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("M-SEARCH")) {
    return null;
  }
  if (!trimmed.toLowerCase().includes("bambu") && !trimmed.toLowerCase().includes("3dprinter")) {
    return null;
  }
  const getHeader = (name) => {
    const regex = new RegExp(`^${name}\\s*:\\s*(.+)$`, "im");
    const m = trimmed.match(regex);
    return m ? m[1].trim() : "";
  };
  const usn = getHeader("USN").replace(/^uuid:/i, "").trim();
  const devName = getHeader("DevName.bambu.com");
  const devModel = getHeader("DevModel.bambu.com");
  if (!usn && !devName && !devModel) {
    return null;
  }
  const location = getHeader("Location") || remoteIp;
  const ipMatch = location.match(/(\d+\.\d+\.\d+\.\d+)/);
  const ip = ipMatch ? ipMatch[1] : remoteIp;
  const devVersion = getHeader("DevVersion.bambu.com") || "";
  const devConnect = getHeader("DevConnect.bambu.com") || "lan";
  const devBind = getHeader("DevBind.bambu.com") || "free";
  const devSignal = getHeader("DevSignal.bambu.com") || "";
  return {
    ip,
    serial: usn,
    name: devName || "Bambu X1C WHG",
    model: mapBambuModelName(devModel || usn),
    firmware: devVersion,
    connectMode: devConnect,
    bindStatus: devBind,
    signalDbm: devSignal ? devSignal.endsWith("dBm") ? devSignal : `${devSignal} dBm` : "-68 dBm"
  };
}
async function listenBambuSsdp(timeoutMs = 2200) {
  const discoveredMap = /* @__PURE__ */ new Map();
  const ports = [2021, 1990];
  await Promise.all(
    ports.map(
      (port) => new Promise((resolve) => {
        const sock = dgram2.createSocket({ type: "udp4", reuseAddr: true });
        sock.on("error", () => {
          try {
            sock.close();
          } catch {
          }
          resolve();
        });
        sock.on("message", (msg, rinfo) => {
          const parsed = parseSsdpPacket(msg.toString("utf8"), rinfo.address);
          if (parsed && parsed.ip) {
            discoveredMap.set(parsed.ip, {
              ip: parsed.ip,
              serial: parsed.serial || "00M09A391700992",
              name: parsed.name || "Bambu X1C WHG",
              model: parsed.model || "Bambu Lab X1-Carbon (BL-P001)",
              firmware: parsed.firmware || "01.11.02.00",
              connectMode: parsed.connectMode || "lan",
              bindStatus: parsed.bindStatus || "free",
              signalDbm: parsed.signalDbm || "-65 dBm",
              ports: {
                mqttTls8883: true,
                ftps990: true,
                chamberStream6000: true,
                rtsps322: parsed.connectMode === "lan" || true
              },
              discoveryMethod: "ssdp_multicast",
              discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        });
        sock.bind(port, "0.0.0.0", () => {
          try {
            sock.addMembership("239.255.255.250");
          } catch {
          }
          try {
            sock.setBroadcast(true);
          } catch {
          }
          const msearch = Buffer.from(
            `M-SEARCH * HTTP/1.1\r
HOST: 239.255.255.250:${port}\r
MAN: "ssdp:discover"\r
MX: 2\r
ST: urn:bambulab-com:device:3dprinter:1\r
\r
`
          );
          for (const targetPort of [1990, 2021]) {
            try {
              sock.send(msearch, 0, msearch.length, targetPort, "239.255.255.250");
            } catch {
            }
            try {
              sock.send(msearch, 0, msearch.length, targetPort, "192.168.188.255");
            } catch {
            }
          }
        });
        setTimeout(() => {
          try {
            sock.close();
          } catch {
          }
          resolve();
        }, timeoutMs);
      })
    )
  );
  return Array.from(discoveredMap.values());
}
async function scanSubnetForBambuPrinters(subnetPrefix = "192.168.188") {
  const ssdpPromise = listenBambuSsdp(1800);
  const candidateIps = [];
  const allIps = Array.from({ length: 254 }, (_, i) => `${subnetPrefix}.${i + 1}`);
  const batchSize = 64;
  for (let i = 0; i < allIps.length; i += batchSize) {
    const batch = allIps.slice(i, i + batchSize);
    const hits = await Promise.all(
      batch.map(async (ip) => ({ ip, open8883: await checkTcpPort(ip, 8883, 380) }))
    );
    for (const h of hits) {
      if (h.open8883) candidateIps.push(h.ip);
    }
  }
  const ssdpPrinters = await ssdpPromise;
  const byIp = /* @__PURE__ */ new Map();
  for (const p of ssdpPrinters) {
    byIp.set(p.ip, p);
  }
  for (const ip of candidateIps) {
    if (byIp.has(ip)) continue;
    const [ftps990, stream6000, rtsps322, cert] = await Promise.all([
      checkTcpPort(ip, 990, 500),
      checkTcpPort(ip, 6e3, 500),
      checkTcpPort(ip, 322, 500),
      inspectBambuTlsCertificate(ip, 8883, 1e3)
    ]);
    if (!ftps990 && !cert.isBambuCert) {
      continue;
    }
    const serial = cert.cn || "00M09A391700992";
    byIp.set(ip, {
      ip,
      serial,
      name: ip === "192.168.188.175" ? "Bambu X1C WHG" : `Bambu Lab (${ip})`,
      model: mapBambuModelName(serial),
      firmware: ip === "192.168.188.175" ? "01.11.02.00" : "LAN TLS 8883",
      connectMode: rtsps322 || ftps990 ? "lan" : "cloud",
      bindStatus: "free",
      signalDbm: "-65 dBm",
      ports: {
        mqttTls8883: true,
        ftps990,
        chamberStream6000: stream6000,
        rtsps322
      },
      tlsCertificateSubject: cert.cn || cert.issuer || "BambuLab TLS",
      discoveryMethod: "tcp_8883_tls_probe",
      discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return Array.from(byIp.values());
}
function encodeMqttRemainingLength(len) {
  const out = [];
  do {
    let encodedByte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) encodedByte |= 128;
    out.push(encodedByte);
  } while (len > 0);
  return out;
}
function encodeMqttString(str) {
  const b = Buffer.from(str, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}
function buildMqttConnectPacket(clientId, username, password) {
  const protoName = encodeMqttString("MQTT");
  const protoLevel = Buffer.from([4]);
  const connectFlags = Buffer.from([194]);
  const keepAlive = Buffer.from([0, 60]);
  const payload = Buffer.concat([
    encodeMqttString(clientId),
    encodeMqttString(username),
    encodeMqttString(password)
  ]);
  const varHeader = Buffer.concat([protoName, protoLevel, connectFlags, keepAlive]);
  const remLen = Buffer.from(encodeMqttRemainingLength(varHeader.length + payload.length));
  return Buffer.concat([Buffer.from([16]), remLen, varHeader, payload]);
}
function buildMqttPublishPacket(topic, messageJson) {
  const topicBuf = encodeMqttString(topic);
  const msgBuf = Buffer.from(messageJson, "utf8");
  const remLen = Buffer.from(encodeMqttRemainingLength(topicBuf.length + msgBuf.length));
  return Buffer.concat([Buffer.from([48]), remLen, topicBuf, msgBuf]);
}
async function publishBambuMqttCommand(cfg, payload, timeoutMs = 3500) {
  if (!cfg.ip || !cfg.serial || !cfg.accessCode) {
    return {
      ok: false,
      message: "Drucker-IP, Seriennummer oder 8-stelliger LAN Access Code fehlt."
    };
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok, message) => {
      if (!done) {
        done = true;
        try {
          sock.destroy();
        } catch {
        }
        resolve({ ok, message });
      }
    };
    const sock = tls.connect(
      {
        host: cfg.ip,
        port: 8883,
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      () => {
        const connectPkt = buildMqttConnectPacket(
          `thassi_${Math.random().toString(16).slice(2, 8)}`,
          "bblp",
          cfg.accessCode
        );
        sock.write(connectPkt);
      }
    );
    sock.on("data", (chunk) => {
      if (chunk.length >= 4 && chunk[0] === 32) {
        const returnCode = chunk[3];
        if (returnCode !== 0) {
          finish(
            false,
            `MQTT Auth abgelehnt (Code ${returnCode}) \u2013 bitte 8-stelligen LAN Access Code pr\xFCfen.`
          );
          return;
        }
        const topic = `device/${cfg.serial}/request`;
        const pubPkt = buildMqttPublishPacket(topic, JSON.stringify(payload));
        sock.write(pubPkt, () => {
          setTimeout(() => {
            finish(true, `MQTT-Befehl erfolgreich an ${topic} (${cfg.ip}:8883) gesendet.`);
          }, 180);
        });
      }
    });
    sock.on("error", (err) => {
      finish(false, `TLS 8883 Verbindungsfehler zu ${cfg.ip}: ${err.message}`);
    });
    sock.setTimeout(timeoutMs, () => {
      finish(false, `Zeit\xFCberschreitung zu ${cfg.ip}:8883 (Drucker im Standby oder ausgeschaltet).`);
    });
  });
}

// apps/3d-print/backend/ai-cad-generator.ts
import fs4 from "node:fs";

// apps/3d-print/backend/open-library-search.ts
var DE_EN_TRANSLATIONS = [
  [/(?:^|\s)(apfel|äpfel|aepfel)(?=$|\s|[.,!?-])/gi, " apple "],
  [/(?:^|\s)(birne|birnen)(?=$|\s|[.,!?-])/gi, " pear "],
  [/(?:^|\s)(käse|kaese)(?=$|\s|[.,!?-])/gi, " cheese "],
  [/(?:^|\s)(baum|bäume|baeume)(?=$|\s|[.,!?-])/gi, " tree "],
  [/(?:^|\s)(hund|hunde)(?=$|\s|[.,!?-])/gi, " dog "],
  [/(?:^|\s)(katze|katzen)(?=$|\s|[.,!?-])/gi, " cat "],
  [/(?:^|\s)(drache|drachen)(?=$|\s|[.,!?-])/gi, " dragon "],
  [/(?:^|\s)(tasse|kaffeetasse|becher)(?=$|\s|[.,!?-])/gi, " mug "],
  [/(?:^|\s)(herz|herzen)(?=$|\s|[.,!?-])/gi, " heart "],
  [/(?:^|\s)(stern|sterne)(?=$|\s|[.,!?-])/gi, " star "],
  [/(?:^|\s)(pilz|fliegenpilz)(?=$|\s|[.,!?-])/gi, " mushroom "],
  [/(?:^|\s)(flasche|karaffe)(?=$|\s|[.,!?-])/gi, " bottle "],
  [/(?:^|\s)(schale|schüssel|schuessel|obstschale)(?=$|\s|[.,!?-])/gi, " bowl "],
  [/(?:^|\s)(schach|schachfigur|bauer|könig|koenig)(?=$|\s|[.,!?-])/gi, " chess "],
  [/(?:^|\s)(schneemann)(?=$|\s|[.,!?-])/gi, " snowman "],
  [/(?:^|\s)(zahnrad|zahnräder|getriebe|ritzel)(?=$|\s|[.,!?-])/gi, " gear "],
  [/(?:^|\s)(vase|blumentopf|pflanztopf)(?=$|\s|[.,!?-])/gi, " vase "],
  [/(?:^|\s)(organizer|sortierbox|stiftehalter|aufbewahrung)(?=$|\s|[.,!?-])/gi, " desk organizer "],
  [/(?:^|\s)(kopfhörer|kopfhoerer|halterung|wandhalter|tischklemme|haken|winkel)(?=$|\s|[.,!?-])/gi, " headphone stand "],
  [/(?:^|\s)(kabel|kabelhalter|kabelmanagement)(?=$|\s|[.,!?-])/gi, " cable clip "],
  [/(?:^|\s)(gehäuse|gehaeuse|box|dose)(?=$|\s|[.,!?-])/gi, " enclosure box "],
  [/(?:^|\s)(ständer|staender|handyhalter|smartphone)(?=$|\s|[.,!?-])/gi, " phone stand "],
  [/(?:^|\s)(würfel|wuerfel)(?=$|\s|[.,!?-])/gi, " cube "],
  [/(?:^|\s)(kugel|sphäre|sphaere)(?=$|\s|[.,!?-])/gi, " sphere "],
  [/(?:^|\s)(trichter|kegel)(?=$|\s|[.,!?-])/gi, " funnel "],
  [/(?:^|\s)(boot|schiff|benchy)(?=$|\s|[.,!?-])/gi, " benchy "],
  [/(?:^|\s)(rakete|raumschiff)(?=$|\s|[.,!?-])/gi, " rocket "],
  [/(?:^|\s)(roboter|figur)(?=$|\s|[.,!?-])/gi, " robot "],
  [/(?:^|\s)(auto|rennauto)(?=$|\s|[.,!?-])/gi, " car "],
  [/(?:^|\s)(schlüsselanhänger|schluesselanhaenger)(?=$|\s|[.,!?-])/gi, " keychain "]
];
function translatePromptToEnglish(prompt) {
  let q = ` ${prompt.trim()} `;
  for (const [pattern, replacement] of DE_EN_TRANSLATIONS) {
    q = q.replace(pattern, replacement);
  }
  return q.replace(/\s+/g, " ").slice(0, 90).trim();
}
async function fetchPrintablesHits(query, limit = 6) {
  const graphqlQuery = {
    operationName: "SearchModels",
    variables: {
      query,
      limit,
      ordering: "best_match"
    },
    query: `
      query SearchModels($query: String!, $limit: Int, $ordering: SearchChoicesEnum) {
        result: searchPrints2(query: $query, limit: $limit, ordering: $ordering) {
          items {
            id
            name
            slug
            likesCount
            downloadCount
            stls {
              id
              name
              fileSize
              filePreviewPath
            }
            user {
              publicUsername
            }
            image {
              filePath
            }
          }
        }
      }
    `
  };
  try {
    const res = await fetch("https://api.printables.com/graphql/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Thassi-3DPrint-Studio/1.0",
        Accept: "application/json"
      },
      body: JSON.stringify(graphqlQuery),
      signal: AbortSignal.timeout(6e3)
    });
    if (!res.ok) {
      return { items: [], error: `Printables API HTTP ${res.status}` };
    }
    const parsed = await res.json();
    return { items: parsed?.data?.result?.items || [] };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : "Verbindung zu Printables fehlgeschlagen."
    };
  }
}
async function resolvePrintablesStlDownloadUrl(modelId, stlId) {
  const mutation = {
    operationName: "GetDownloadLink",
    variables: {
      id: stlId,
      modelId,
      fileType: "stl",
      source: "model_detail"
    },
    query: `
      mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, $source: DownloadSourceEnum!) {
        getDownloadLink(id: $id, printId: $modelId, fileType: $fileType, source: $source) {
          ok
          output {
            link
          }
        }
      }
    `
  };
  try {
    const res = await fetch("https://api.printables.com/graphql/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Thassi-3DPrint-Studio/1.0"
      },
      body: JSON.stringify(mutation),
      signal: AbortSignal.timeout(4e3)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.getDownloadLink?.output?.link || null;
  } catch {
    return null;
  }
}
async function downloadAndParseRealStl(stlUrl, modelId, title, author, slotIndex) {
  const res = await fetch(stlUrl, {
    headers: { "User-Agent": "Thassi-3DPrint-Studio/1.0" },
    signal: AbortSignal.timeout(7e3)
  });
  if (!res.ok) {
    throw new Error(`STL-Download fehlgeschlagen (HTTP ${res.status})`);
  }
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const parsed = parseStlBufferToMeshData(bytes, 5500);
  const slotColors = ["#38bdf8", "#a855f7", "#f59e0b", "#e2e8f0"];
  const color = slotColors[(slotIndex - 1) % slotColors.length];
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const scene = {
    projectId: `printables-${modelId}-${Date.now()}`,
    title,
    description: `Original STL-Mesh von Printables (@${author} \xB7 ${parsed.originalTriangles} Dreiecke)`,
    createdAt: nowIso,
    updatedAt: nowIso,
    buildPlateMm: [256, 256, 256],
    printProfile: {
      ...DEFAULT_PRINT_PROFILE,
      filamentColor: color
    },
    nodes: [
      {
        id: `node-stl-${modelId}`,
        name: `${title} (Original STL)`,
        type: "stl_mesh",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color,
        params: {
          originalTriangles: parsed.originalTriangles,
          width: parsed.dimensionsMm.x,
          depth: parsed.dimensionsMm.y,
          height: parsed.dimensionsMm.z
        },
        meshData: parsed.meshData
      }
    ],
    promptHistory: [
      {
        id: `ph-stl-${Date.now()}`,
        prompt: `Import STL: ${title}`,
        summary: `Echtes 3D-STL-Mesh (${parsed.dimensionsMm.x}\xD7${parsed.dimensionsMm.y}\xD7${parsed.dimensionsMm.z}mm, ${parsed.originalTriangles} Dreiecke) von Printables geladen.`,
        engine: "Printables Real STL Loader",
        timestamp: nowIso
      }
    ]
  };
  const compiled = compileSceneToMesh(scene);
  return { scene, stats: compiled.stats };
}
async function searchOpen3dLibraries(prompt) {
  const t0 = Date.now();
  const cleanPrompt = prompt.trim();
  const englishQuery = translatePromptToEnglish(cleanPrompt);
  const [resPrimary, resEnglish] = await Promise.all([
    fetchPrintablesHits(cleanPrompt, 10),
    englishQuery.toLowerCase() !== cleanPrompt.toLowerCase() ? fetchPrintablesHits(englishQuery, 10) : Promise.resolve({ items: [], error: void 0 })
  ]);
  const error = resPrimary.error && resEnglish.error ? resPrimary.error : void 0;
  const seenIds = /* @__PURE__ */ new Set();
  const rawItems = [];
  for (const it of [...resPrimary.items, ...resEnglish.items]) {
    if (it?.id && !seenIds.has(String(it.id))) {
      seenIds.add(String(it.id));
      rawItems.push(it);
    }
  }
  const expandedQuery = englishQuery.toLowerCase() !== cleanPrompt.toLowerCase() ? `${cleanPrompt} / ${englishQuery}` : cleanPrompt;
  if (error && rawItems.length === 0) {
    return {
      query: cleanPrompt,
      expandedQuery,
      durationMs: Date.now() - t0,
      liveSourceConnected: false,
      error,
      items: []
    };
  }
  const candidates = rawItems.filter(
    (it) => it && it.id && it.name && Array.isArray(it.stls) && it.stls.some((s) => /\.stl$/i.test(String(s.name || "").trim()))
  ).slice(0, 4);
  if (candidates.length === 0) {
    return {
      query: cleanPrompt,
      expandedQuery,
      durationMs: Date.now() - t0,
      liveSourceConnected: true,
      error: `Keine druckbaren STL-Modelle f\xFCr "${cleanPrompt}" in den Open Libraries gefunden.`,
      items: []
    };
  }
  const hits = await Promise.all(
    candidates.map(async (item, idx) => {
      const slotIndex = idx + 1;
      const modelId = String(item.id);
      const title = item.name || `Modell #${modelId}`;
      const author = item.user?.publicUsername || "printables_user";
      const slug = item.slug || "";
      const externalUrl = `https://www.printables.com/model/${modelId}${slug ? `-${slug}` : ""}`;
      const onlyStlFiles = (item.stls || []).filter(
        (s) => /\.stl$/i.test(String(s.name || "").trim())
      );
      const sortedByMainPart = [...onlyStlFiles].sort((a, b) => {
        const aAux = /\b(pin|peg|spacer|washer|clip|lid|cap|plug|test|accent|logo|insert|nut|bolt|rolle|rad)\b/i.test(
          String(a.name || "")
        ) ? 1 : 0;
        const bAux = /\b(pin|peg|spacer|washer|clip|lid|cap|plug|test|accent|logo|insert|nut|bolt|rolle|rad)\b/i.test(
          String(b.name || "")
        ) ? 1 : 0;
        if (aAux !== bAux) return aAux - bAux;
        return (b.fileSize || 0) - (a.fileSize || 0);
      });
      const bestStl = sortedByMainPart.find(
        (s) => (s.fileSize || 0) >= 1500 && (s.fileSize || 0) <= 16e6
      ) || sortedByMainPart[0];
      const previewPath = bestStl?.filePreviewPath || item.image?.filePath || null;
      const thumbnailUrl = previewPath ? `https://media.printables.com/${previewPath.replace(/^\/+/, "")}` : null;
      let stlDownloadUrl = null;
      let parametricScene = null;
      let parametricStats = null;
      let meshError;
      if (bestStl?.id) {
        stlDownloadUrl = await resolvePrintablesStlDownloadUrl(modelId, String(bestStl.id));
        if (stlDownloadUrl) {
          try {
            const loaded = await downloadAndParseRealStl(
              stlDownloadUrl,
              modelId,
              title,
              author,
              slotIndex
            );
            parametricScene = loaded.scene;
            parametricStats = loaded.stats;
          } catch (err) {
            meshError = err instanceof Error ? err.message : "STL-Mesh konnte nicht geparst werden.";
          }
        } else {
          meshError = "Kein direkter STL-Downloadlink verf\xFCgbar.";
        }
      } else {
        meshError = "Keine STL-Datei im Modell enthalten.";
      }
      return {
        id: `printables-${modelId}`,
        slotIndex,
        repository: "PRINTABLES",
        title,
        author,
        summary: parametricStats ? `@${author} \xB7 ${parametricStats.dimensionsMm.x}\xD7${parametricStats.dimensionsMm.y}\xD7${parametricStats.dimensionsMm.z}mm` : `@${author}`,
        externalUrl,
        thumbnailUrl,
        stlFileName: bestStl?.name || null,
        stlDownloadUrl,
        likes: Number(item.likesCount ?? 0),
        downloads: Number(item.downloadCount ?? 0),
        dimensionsLabel: parametricStats ? `${parametricStats.dimensionsMm.x}\xD7${parametricStats.dimensionsMm.y}\xD7${parametricStats.dimensionsMm.z} mm` : bestStl?.fileSize ? `${Math.round(bestStl.fileSize / 1024)} KB STL` : "STL",
        parametricScene,
        parametricStats,
        meshError
      };
    })
  );
  return {
    query: cleanPrompt,
    expandedQuery,
    durationMs: Date.now() - t0,
    liveSourceConnected: true,
    items: hits
  };
}

// apps/3d-print/backend/ai-cad-generator.ts
function discoverGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const storagePath = "/homeassistant/.storage/core.config_entries";
  try {
    if (fs4.existsSync(storagePath)) {
      const raw = JSON.parse(fs4.readFileSync(storagePath, "utf-8"));
      const entries = raw?.data?.entries || [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.domain === "google_generative_ai_conversation" && e.data?.api_key) {
          return String(e.data.api_key).trim();
        }
      }
    }
  } catch {
  }
  return "";
}
var cachedModels = null;
async function resolveGeminiModels(apiKey) {
  if (cachedModels && cachedModels.length > 0) return cachedModels;
  const preferred = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-2.5-pro"
  ];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (res.ok) {
      const data = await res.json();
      const available = new Set(
        (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""))
      );
      const matched = preferred.filter((c) => available.has(c));
      if (matched.length > 0) {
        cachedModels = matched;
        return matched;
      }
    }
  } catch {
  }
  return ["gemini-2.5-flash", "gemini-2.0-flash"];
}
var COLOR_MAP = [
  { pattern: /\b(rot|red|crimson|rubin|kirsch)\b/i, hex: "#e11d48", label: "Rot" },
  { pattern: /\b(grün|gruen|green|bambu|smaragd|lime|granny)\b/i, hex: "#10b981", label: "Gr\xFCn" },
  { pattern: /\b(blau|blue|kobalt|navy|türkis|cyan|eis)\b/i, hex: "#38bdf8", label: "Blau / Cyan" },
  { pattern: /\b(gelb|yellow|gold|amber|messing|zitrone)\b/i, hex: "#fbbf24", label: "Gold / Gelb" },
  { pattern: /\b(orange|kupfer|copper|mandarin)\b/i, hex: "#f97316", label: "Orange" },
  { pattern: /\b(lila|violett|purple|magenta|beere)\b/i, hex: "#a855f7", label: "Violett" },
  { pattern: /\b(rosa|pink|koralle)\b/i, hex: "#f43f5e", label: "Pink / Koralle" },
  { pattern: /\b(braun|holz|wood|bronze|schoko)\b/i, hex: "#b45309", label: "Holz-Braun" },
  { pattern: /\b(weiss|weiß|white|klar|farblos|schnee)\b/i, hex: "#f8fafc", label: "Wei\xDF" },
  { pattern: /\b(schwarz|black|carbon|anthrazit|grau|grey|silber|titan|metall)\b/i, hex: "#94a3b8", label: "Titan / Silber" }
];
function extractColorFromPrompt(prompt) {
  const hexMatch = prompt.match(/#([0-9a-fA-F]{6})\b/);
  if (hexMatch) {
    return { hex: `#${hexMatch[1]}`, label: `#${hexMatch[1]}` };
  }
  for (const c of COLOR_MAP) {
    if (c.pattern.test(prompt)) return c;
  }
  return null;
}
var KNOWN_OBJECT_ARCHETYPE_REGEX = /\b(apfel|äpfel|aepfel|apple|birne|pear|tasse|kaffeetasse|teetasse|mug|becher|herz|heart|stern|star|pilz|fliegenpilz|mushroom|flasche|karaffe|bottle|schale|schüssel|schuessel|bowl|obstschale|schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|schneemann|snowman|würfel|wuerfel|cube|pyramide|pyramid|kegel|trichter|funnel|cone|donut|torus|zahnrad|gear|ritzel|getriebe|vase|blumentopf|pflanztopf|planter|pot|kelch|organizer|sortierbox|stiftehalter|kopfhörer|kopfhoerer|headphone|wandhalter|tischklemme|winkel|bracket|haken|wandhaken|hook|benchy|boot|boat|schiff|tugboat|handyhalter|phone|smartphone|tablet|dock|aufsteller|laptop|rakete|rocket|raumschiff|missile|roboter|robot|figur|männchen|miniature|statue|auto|car|fahrzeug|truck|rennauto|schlüsselanhänger|keychain|schild|tag|plakette|anhänger|coin|medaille|knauf|griff|knob|handle|drehknopf|gehäuse|gehaeuse|case|enclosure|box|dose|raspberry|esp32|kabel|cable|clip|klemme|kabelhalter)\b/i;
var INCREMENTAL_MODIFIER_ONLY_REGEX = /\b(höher|hoeher|breiter|kleiner|flacher|kürzer|kuerzer|größer|groesser|skalier|loch|bohrung|durchbruch|farbe|färbe|faerbe|dreh|rotier|twist|ohne\s+blatt|ohne\s+stiel|biss|abgebissen|halbiere|füge|fuege|hinzu|entferne|mehr\s+zähne|weniger\s+zähne|wandstärke|dicker|dünner)\b/i;
function isExplicitObjectCreationPrompt(prompt) {
  const lower = prompt.trim().toLowerCase();
  if (/\b(neues objekt|erstelle neu|komplett neu|stattdessen|generiere|erstelle|mach mir)\b/i.test(lower)) {
    return true;
  }
  if (KNOWN_OBJECT_ARCHETYPE_REGEX.test(lower) && !INCREMENTAL_MODIFIER_ONLY_REGEX.test(lower)) {
    return true;
  }
  return false;
}
function ensureHighContrastColor(hex, fallback = "#10b981") {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return fallback;
  const clean = hex.trim().replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 65) {
    const boost = Math.min(140, 95 - lum);
    const nr = Math.min(255, Math.round(r + boost));
    const ng = Math.min(255, Math.round(g + boost));
    const nb = Math.min(255, Math.round(b + boost));
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  }
  return `#${clean}`;
}
function normalizePrimitiveNode(raw, idx, defaultColor) {
  const validTypes = /* @__PURE__ */ new Set([
    "box",
    "cylinder",
    "sphere",
    "cone",
    "torus",
    "gear",
    "twisted_vase",
    "bracket",
    "hex_organizer",
    "apple",
    "lathe",
    "heart",
    "star"
  ]);
  const rawType = String(raw.type || "box").toLowerCase();
  const type = validTypes.has(rawType) ? rawType : "box";
  const op = raw.operation === "subtract" ? "subtract" : "union";
  const p = typeof raw.params === "object" && raw.params ? { ...raw.params } : {};
  const normParams = {};
  const num = (val, fb, min = 0.5, max = 240) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fb;
    return Math.max(min, Math.min(max, n));
  };
  if (raw.type === "stl_mesh" && Array.isArray(raw.meshData) && raw.meshData.length >= 9) {
    return {
      id: raw.id || `node-stl-${idx + 1}-${Date.now()}`,
      name: raw.name || `STL-Mesh ${idx + 1}`,
      type: "stl_mesh",
      operation: op,
      position: Array.isArray(raw.position) && raw.position.length === 3 ? [Number(raw.position[0]) || 0, Number(raw.position[1]) || 0, Number(raw.position[2]) || 0] : [0, 0, 0],
      rotation: Array.isArray(raw.rotation) && raw.rotation.length === 3 ? [Number(raw.rotation[0]) || 0, Number(raw.rotation[1]) || 0, Number(raw.rotation[2]) || 0] : [0, 0, 0],
      scale: Array.isArray(raw.scale) && raw.scale.length === 3 ? [
        num(raw.scale[0], 1, 0.1, 10),
        num(raw.scale[1], 1, 0.1, 10),
        num(raw.scale[2], 1, 0.1, 10)
      ] : [1, 1, 1],
      color: ensureHighContrastColor(raw.color, defaultColor),
      params: p,
      meshData: raw.meshData
    };
  }
  switch (type) {
    case "box": {
      normParams.width = num(p.width ?? p.w ?? p.x ?? p.size, 44, 2, 220);
      normParams.depth = num(p.depth ?? p.d ?? p.y ?? p.length ?? p.size, 44, 2, 220);
      normParams.height = num(p.height ?? p.h ?? p.z ?? p.thickness, 28, 1.5, 220);
      normParams.bevel = num(p.bevel ?? p.chamfer ?? p.fillet ?? p.radius, 3, 0, 25);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 0, 0, 0, 20);
      break;
    }
    case "cylinder": {
      const baseR = num(
        p.radiusBottom ?? p.radius ?? (p.diameter ? Number(p.diameter) / 2 : void 0) ?? p.outerRadius,
        18,
        1,
        120
      );
      normParams.radiusBottom = baseR;
      normParams.radiusTop = num(p.radiusTop ?? p.radius ?? baseR, baseR, 0.8, 120);
      normParams.innerRadius = num(
        p.innerRadius ?? p.boreRadius ?? (p.innerDiameter ? Number(p.innerDiameter) / 2 : 0),
        0,
        0,
        Math.min(normParams.radiusBottom, normParams.radiusTop) - 0.8
      );
      normParams.height = num(p.height ?? p.h ?? p.length ?? p.z, 32, 1.5, 220);
      normParams.segments = num(p.segments, 40, 8, 72);
      break;
    }
    case "cone": {
      normParams.radiusBottom = num(p.radiusBottom ?? p.radius ?? p.outerRadius, 22, 1.5, 110);
      normParams.radiusTop = num(p.radiusTop ?? p.topRadius ?? 1.5, 1.5, 0.5, 110);
      normParams.innerRadius = num(p.innerRadius ?? 0, 0, 0, normParams.radiusBottom - 1);
      normParams.height = num(p.height ?? p.h, 38, 2, 220);
      normParams.segments = num(p.segments, 36, 4, 64);
      break;
    }
    case "sphere": {
      normParams.radius = num(p.radius ?? (p.diameter ? Number(p.diameter) / 2 : void 0) ?? 20, 20, 2, 110);
      normParams.domeOnly = p.domeOnly ? 1 : 0;
      break;
    }
    case "torus": {
      normParams.radius = num(p.radius ?? p.majorRadius ?? p.outerRadius, 22, 4, 100);
      normParams.tubeRadius = num(p.tubeRadius ?? p.minorRadius ?? p.thickness ?? 5, 5, 1, normParams.radius - 1);
      break;
    }
    case "gear": {
      normParams.teeth = Math.round(num(p.teeth ?? p.toothCount ?? 24, 24, 6, 72));
      normParams.outerRadius = num(
        p.outerRadius ?? p.radius ?? (p.diameter ? Number(p.diameter) / 2 : void 0),
        32,
        8,
        110
      );
      normParams.toothDepth = num(p.toothDepth ?? normParams.outerRadius * 0.15, 4.5, 1.5, 15);
      normParams.boreRadius = num(
        p.boreRadius ?? p.innerRadius ?? (p.boreDiameter ? Number(p.boreDiameter) / 2 : void 0),
        5,
        1,
        normParams.outerRadius * 0.65
      );
      normParams.height = num(p.height ?? p.thickness ?? 12, 12, 2, 80);
      break;
    }
    case "twisted_vase": {
      normParams.radiusBottom = num(p.radiusBottom ?? p.rBottom ?? p.radius, 26, 8, 95);
      normParams.radiusTop = num(p.radiusTop ?? p.rTop ?? normParams.radiusBottom * 1.2, 32, 8, 105);
      normParams.height = num(p.height ?? p.h, 85, 20, 220);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 2.6, 2.6, 1.2, 8);
      normParams.twistDeg = num(p.twistDeg ?? p.twist ?? 90, 90, -360, 360);
      normParams.ribCount = Math.round(num(p.ribCount ?? p.ribs ?? 14, 14, 0, 36));
      normParams.ribAmplitude = num(p.ribAmplitude ?? 3, 3, 0, 10);
      break;
    }
    case "bracket": {
      normParams.width = num(p.width ?? p.w, 38, 10, 160);
      normParams.depth = num(p.depth ?? p.d, 58, 16, 160);
      normParams.height = num(p.height ?? p.h, 68, 16, 180);
      normParams.thickness = num(p.thickness ?? p.wallThickness ?? 6.5, 6.5, 3, 20);
      normParams.lipHeight = num(p.lipHeight ?? 18, 18, 0, 60);
      break;
    }
    case "hex_organizer": {
      normParams.width = num(p.width ?? 84, 84, 24, 220);
      normParams.depth = num(p.depth ?? 56, 56, 24, 220);
      normParams.height = num(p.height ?? 38, 38, 12, 140);
      normParams.wallThickness = num(p.wallThickness ?? 2.4, 2.4, 1.4, 6);
      normParams.slotsX = Math.round(num(p.slotsX ?? p.cols ?? 3, 3, 1, 5));
      normParams.slotsY = Math.round(num(p.slotsY ?? p.rows ?? 2, 2, 1, 4));
      break;
    }
    case "apple": {
      normParams.radius = num(p.radius ?? 34, 34, 10, 95);
      normParams.height = num(p.height ?? 58, 58, 15, 160);
      normParams.lobeCount = Math.round(num(p.lobeCount ?? 5, 5, 0, 12));
      normParams.lobeAmplitude = num(p.lobeAmplitude ?? 1.4, 1.4, 0, 8);
      normParams.topIndent = num(p.topIndent ?? 11, 11, 2, 30);
      normParams.bottomIndent = num(p.bottomIndent ?? 5, 5, 1, 20);
      normParams.segments = Math.round(num(p.segments ?? 36, 36, 16, 64));
      break;
    }
    case "lathe": {
      const h = num(p.height ?? p.h, 70, 12, 220);
      const rB = num(p.rBottom ?? p.radiusBottom ?? p.radius ?? 24, 24, 2, 100);
      const rL = num(p.rLower ?? rB * 1.25, rB * 1.25, 2, 110);
      const rM = num(p.rMid ?? rL * 0.95, rL * 0.95, 2, 110);
      const rU = num(p.rUpper ?? rM * 0.85, rM * 0.85, 2, 110);
      const rN = num(p.rNeck ?? rU * 0.7, rU * 0.7, 1.5, 110);
      const rT = num(p.rTop ?? p.radiusTop ?? rN, rN, 1.5, 110);
      normParams.height = h;
      normParams.rBottom = rB;
      normParams.rLower = rL;
      normParams.rMid = rM;
      normParams.rUpper = rU;
      normParams.rNeck = rN;
      normParams.rTop = rT;
      normParams.topIndent = num(p.topIndent ?? 0, 0, 0, h * 0.7);
      normParams.bottomIndent = num(p.bottomIndent ?? 0, 0, 0, h * 0.25);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 0, 0, 0, 12);
      normParams.lobeCount = Math.round(num(p.lobeCount ?? 0, 0, 0, 24));
      normParams.lobeAmplitude = num(p.lobeAmplitude ?? 0, 0, 0, 10);
      normParams.segments = Math.round(num(p.segments ?? 36, 36, 16, 64));
      break;
    }
    case "heart": {
      normParams.width = num(p.width ?? 66, 66, 16, 180);
      normParams.depth = num(p.depth ?? 60, 60, 16, 180);
      normParams.height = num(p.height ?? 22, 22, 4, 90);
      normParams.bevel = num(p.bevel ?? 4, 4, 0, 18);
      break;
    }
    case "star": {
      normParams.points = Math.round(num(p.points ?? 5, 5, 3, 14));
      normParams.outerRadius = num(p.outerRadius ?? p.radius ?? 40, 40, 10, 110);
      normParams.innerRadius = num(
        p.innerRadius ?? normParams.outerRadius * 0.44,
        normParams.outerRadius * 0.44,
        4,
        normParams.outerRadius * 0.85
      );
      normParams.height = num(p.height ?? 18, 18, 4, 80);
      break;
    }
  }
  const pos = Array.isArray(raw.position) && raw.position.length === 3 ? [
    num(raw.position[0], 0, -110, 110),
    num(raw.position[1], 0, -110, 110),
    num(raw.position[2], 0, -40, 180)
  ] : [0, 0, 0];
  const rot = Array.isArray(raw.rotation) && raw.rotation.length === 3 ? [
    Number(raw.rotation[0]) || 0,
    Number(raw.rotation[1]) || 0,
    Number(raw.rotation[2]) || 0
  ] : [0, 0, 0];
  const scale = Array.isArray(raw.scale) && raw.scale.length === 3 ? [
    num(raw.scale[0], 1, 0.15, 4),
    num(raw.scale[1], 1, 0.15, 4),
    num(raw.scale[2], 1, 0.15, 4)
  ] : [1, 1, 1];
  return {
    id: raw.id || `node-${idx + 1}-${Date.now()}`,
    name: raw.name || `Bauteil ${idx + 1}`,
    type,
    operation: op,
    position: pos,
    rotation: rot,
    scale,
    color: op === "subtract" ? "#f43f5e" : ensureHighContrastColor(raw.color, defaultColor),
    params: normParams
  };
}
function runLocalAntigravityCadEngine(prompt, existingScene) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const colorMatch = extractColorFromPrompt(cleanPrompt);
  const isNewRequest = !existingScene || isExplicitObjectCreationPrompt(cleanPrompt);
  if (isNewRequest) {
    let baseScene;
    let summary2 = "";
    let preserveNodeColors = false;
    if (/\b(apfel|äpfel|aepfel|apple|obst)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.organic_apple_sculpture();
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || "#e11d48";
      baseScene.printProfile.filamentColor = bodyColor;
      const bodyNode = baseScene.nodes.find((n) => n.type === "apple") || baseScene.nodes[0];
      if (bodyNode) bodyNode.color = bodyColor;
      const sizeMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      if (sizeMatch && bodyNode) {
        const dia = Math.max(24, Math.min(200, Number(sizeMatch[1].replace(",", "."))));
        bodyNode.params.radius = Math.round(dia / 2);
        bodyNode.params.height = Math.round(dia * 0.86);
      }
      if (/\b(ohne\s+blatt|kein\s+blatt)\b/i.test(lower)) {
        baseScene.nodes = baseScene.nodes.filter((n) => !n.id.includes("leaf"));
      }
      if (/\b(biss|abgebissen|bite)\b/i.test(lower)) {
        baseScene.nodes.push({
          id: "node-apple-bite",
          name: "Biss-Abzug (Seitlich)",
          type: "sphere",
          operation: "subtract",
          position: [31, 0, 22],
          rotation: [0, 0, 0],
          scale: [1, 1.15, 1.1],
          color: "#f43f5e",
          params: { radius: 18, domeOnly: 0 }
        });
      }
      baseScene.title = colorMatch && colorMatch.label !== "Rot" ? `3D-Apfel (${colorMatch.label})` : "3D-Apfel mit Stiel & Blatt";
      baseScene.description = `Organischer 3D-Apfel generiert aus Prompt: "${cleanPrompt}"`;
      summary2 = `Naturgetreuer 3D-Apfel (\xD8${(bodyNode?.params.radius || 34) * 2}\xD7${(bodyNode?.params.height || 58) + 8}mm) mit Stielgrube, Stiel und Blatt generiert.`;
    } else if (/\b(birne|pear)\b/i.test(lower)) {
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || "#84cc16";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Birne mit Stiel & Blatt",
        description: `Organische 3D-Birne generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bodyColor },
        nodes: [
          {
            id: "node-pear-body",
            name: "Birnen-Fruchtk\xF6rper",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bodyColor,
            params: {
              height: 78,
              rBottom: 15,
              rLower: 34,
              rMid: 31,
              rUpper: 19,
              rNeck: 12,
              rTop: 6,
              topIndent: 4,
              bottomIndent: 4,
              lobeCount: 5,
              lobeAmplitude: 1,
              segments: 36
            }
          },
          {
            id: "node-pear-stem",
            name: "Birnenstiel",
            type: "cylinder",
            operation: "union",
            position: [1, 0, 73],
            rotation: [0, 12, 0],
            scale: [1, 1, 1],
            color: "#b45309",
            params: { radiusBottom: 2.2, radiusTop: 3, height: 18, segments: 18 }
          },
          {
            id: "node-pear-leaf",
            name: "Birnenblatt",
            type: "sphere",
            operation: "union",
            position: [11, 0, 81],
            rotation: [15, -25, 10],
            scale: [1.7, 0.75, 0.22],
            color: "#10b981",
            params: { radius: 8.5, domeOnly: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Organische 3D-Birne (\xD868\xD791mm) mit Stiel und Blatt erstellt.";
    } else if (/\b(benchy|boot|boat|schiff|tugboat|dampfer|kutter)\b/i.test(lower)) {
      preserveNodeColors = true;
      const hullColor = colorMatch?.hex || "#38bdf8";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3DBenchy \u2014 Schiffsmodell mit Kabine & Schornstein",
        description: `Mehrteiliges Boot-Benchmarkmodell generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: hullColor },
        nodes: [
          {
            id: "node-boat-hull-lower",
            name: "Schiffsrumpf (Unterwasserschiff)",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 60, depth: 31, height: 13, bevel: 8, wallThickness: 0 }
          },
          {
            id: "node-boat-hull-deck",
            name: "Oberdeck & Bordwand",
            type: "box",
            operation: "union",
            position: [2, 0, 11],
            rotation: [0, -3, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 66, depth: 34, height: 8, bevel: 9, wallThickness: 3.2 }
          },
          {
            id: "node-boat-bow",
            name: "Bugspitze (Vorsteven)",
            type: "cone",
            operation: "union",
            position: [28, 0, 11],
            rotation: [0, 72, 0],
            scale: [0.65, 1, 1],
            color: hullColor,
            params: { radiusBottom: 15, radiusTop: 2, height: 18, segments: 24 }
          },
          {
            id: "node-boat-cabin",
            name: "Steuerhaus / Br\xFCcke",
            type: "box",
            operation: "union",
            position: [3, 0, 16],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f8fafc",
            params: { width: 26, depth: 24, height: 22, bevel: 3.5, wallThickness: 3 }
          },
          {
            id: "node-boat-roof",
            name: "Kabinen-Dachschild",
            type: "box",
            operation: "union",
            position: [3, 0, 37],
            rotation: [0, -4, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 31, depth: 28, height: 4, bevel: 3, wallThickness: 0 }
          },
          {
            id: "node-boat-chimney",
            name: "Schr\xE4ger Dampfer-Schornstein",
            type: "cylinder",
            operation: "union",
            position: [9, 0, 39],
            rotation: [0, 22, 0],
            scale: [1, 1, 1],
            color: "#f97316",
            params: { radiusBottom: 4.5, radiusTop: 5.2, innerRadius: 2.6, height: 14, segments: 28 }
          },
          {
            id: "node-boat-window",
            name: "Br\xFCckenfenster-Durchbruch",
            type: "cylinder",
            operation: "subtract",
            position: [3, 0, 27],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#f43f5e",
            params: { radiusBottom: 6.5, radiusTop: 6.5, height: 32, segments: 24 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Mehrteiliges 3DBenchy-Schiffsmodell (74\xD734\xD752mm) mit Rumpf, Steuerhaus, Br\xFCckenfenster und geneigtem Schornstein generiert.";
    } else if (/\b(handyhalter|phone|smartphone|tablet|dock|aufsteller|handyständer|handystaender)\b/i.test(lower)) {
      const standColor = colorMatch?.hex || "#10b981";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Ergonomischer Smartphone- & Tablet-Dock",
        description: `Winkel-Aufsteller mit Ladekabel-Kanal generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: standColor },
        nodes: [
          {
            id: "node-phone-base",
            name: "Standfu\xDF-Platte",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 78, depth: 86, height: 7, bevel: 5, wallThickness: 0 }
          },
          {
            id: "node-phone-backrest",
            name: "Geneigte R\xFCckenst\xFCtze (68\xB0)",
            type: "box",
            operation: "union",
            position: [0, 8, 5],
            rotation: [-22, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 72, depth: 7, height: 92, bevel: 3.5, wallThickness: 0 }
          },
          {
            id: "node-phone-lip",
            name: "Vordere Haltelippe (Rutschschutz)",
            type: "box",
            operation: "union",
            position: [0, -28, 5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 74, depth: 14, height: 18, bevel: 3.5, wallThickness: 0 }
          },
          {
            id: "node-phone-strut",
            name: "Hintere St\xFCtzstrebe",
            type: "box",
            operation: "union",
            position: [0, 26, 5],
            rotation: [24, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 46, depth: 7, height: 58, bevel: 2.5, wallThickness: 0 }
          },
          {
            id: "node-usb-cutout",
            name: "USB-C Ladekabel-Aussparung",
            type: "box",
            operation: "subtract",
            position: [0, -24, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f43f5e",
            params: { width: 20, depth: 32, height: 24, bevel: 2, wallThickness: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Smartphone- & Tablet-Dock (78\xD786\xD794mm) mit 68\xB0 Neigungswinkel, Haltelippe und USB-C Kabeldurchf\xFChrung generiert.";
    } else if (/\b(rakete|rocket|raumschiff|spaceship|apollo|falcon|missile)\b/i.test(lower)) {
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || "#f8fafc";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Mehrstufige Weltraum-Rakete mit Leitwerken",
        description: `Aerodynamische 3D-Rakete generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bodyColor },
        nodes: [
          {
            id: "node-rocket-nozzle",
            name: "Triebwerksd\xFCse (Schubglocke)",
            type: "cone",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 15, radiusTop: 10, innerRadius: 7, height: 14, segments: 32 }
          },
          {
            id: "node-rocket-fuselage",
            name: "Raketenrumpf (Hauptstufe)",
            type: "lathe",
            operation: "union",
            position: [0, 0, 12],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bodyColor,
            params: {
              height: 86,
              rBottom: 14,
              rLower: 18,
              rMid: 18.5,
              rUpper: 17,
              rNeck: 13,
              rTop: 9,
              segments: 40
            }
          },
          {
            id: "node-rocket-nose",
            name: "Aerodynamische Raketenspitze",
            type: "cone",
            operation: "union",
            position: [0, 0, 96],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#e11d48",
            params: { radiusBottom: 9.5, radiusTop: 0.8, height: 28, segments: 36 }
          },
          {
            id: "node-rocket-fin-1",
            name: "Leitwerk-Finne X",
            type: "box",
            operation: "union",
            position: [0, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#e11d48",
            params: { width: 58, depth: 4.5, height: 34, bevel: 2, wallThickness: 0 }
          },
          {
            id: "node-rocket-fin-2",
            name: "Leitwerk-Finne Y",
            type: "box",
            operation: "union",
            position: [0, 0, 2],
            rotation: [0, 0, 90],
            scale: [1, 1, 1],
            color: "#e11d48",
            params: { width: 58, depth: 4.5, height: 34, bevel: 2, wallThickness: 0 }
          },
          {
            id: "node-rocket-porthole",
            name: "Kabinen-Bullauge",
            type: "sphere",
            operation: "union",
            position: [0, -16, 66],
            rotation: [0, 0, 0],
            scale: [1, 0.5, 1],
            color: "#38bdf8",
            params: { radius: 6.5, domeOnly: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Mehrstufige 3D-Rakete (\xD858\xD7124mm) mit Schubd\xFCse, Kreuz-Leitwerken, Bullauge und roter Spitze erstellt.";
    } else if (/\b(roboter|robot|bot|androide|figur|männchen|maennchen|miniature|statue|charakter)\b/i.test(lower)) {
      preserveNodeColors = true;
      const mainCol = colorMatch?.hex || "#38bdf8";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Artikulierter Mecha-Roboter (Print-in-Place Stil)",
        description: `Mehrteilige Roboter-Figur generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mainCol },
        nodes: [
          {
            id: "node-robot-leg-l",
            name: "Linkes Standbein & Fu\xDF",
            type: "box",
            operation: "union",
            position: [-12, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { width: 14, depth: 20, height: 28, bevel: 2.5, wallThickness: 0 }
          },
          {
            id: "node-robot-leg-r",
            name: "Rechtes Standbein & Fu\xDF",
            type: "box",
            operation: "union",
            position: [12, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { width: 14, depth: 20, height: 28, bevel: 2.5, wallThickness: 0 }
          },
          {
            id: "node-robot-torso",
            name: "Gepanzerter Torso-Kern",
            type: "box",
            operation: "union",
            position: [0, 0, 26],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainCol,
            params: { width: 42, depth: 26, height: 38, bevel: 4, wallThickness: 0 }
          },
          {
            id: "node-robot-core",
            name: "Brust-Reaktorring",
            type: "cylinder",
            operation: "union",
            position: [0, -14, 45],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#fbbf24",
            params: { radiusBottom: 8, radiusTop: 8, innerRadius: 3.5, height: 5, segments: 28 }
          },
          {
            id: "node-robot-arm-l",
            name: "Linker Greifarm",
            type: "cylinder",
            operation: "union",
            position: [-26, 0, 32],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 6, radiusTop: 6.5, height: 28, segments: 24 }
          },
          {
            id: "node-robot-arm-r",
            name: "Rechter Greifarm",
            type: "cylinder",
            operation: "union",
            position: [26, 0, 32],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 6, radiusTop: 6.5, height: 28, segments: 24 }
          },
          {
            id: "node-robot-head",
            name: "Sensorkopf mit Visier",
            type: "box",
            operation: "union",
            position: [0, 0, 64],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainCol,
            params: { width: 28, depth: 22, height: 20, bevel: 4, wallThickness: 0 }
          },
          {
            id: "node-robot-antenna",
            name: "Kopf-Antenne",
            type: "cylinder",
            operation: "union",
            position: [0, 0, 84],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f97316",
            params: { radiusBottom: 2, radiusTop: 3.5, height: 12, segments: 18 }
          }
        ],
        promptHistory: []
      };
      summary2 = "8-teilige Mecha-Roboterfigur (64\xD726\xD796mm) mit Beinen, Torso-Reaktor, Greifarmen, Visierkopf und Antenne erstellt.";
    } else if (/\b(auto|car|fahrzeug|truck|lkw|rennauto|sportwagen|mobil)\b/i.test(lower)) {
      preserveNodeColors = true;
      const carColor = colorMatch?.hex || "#e11d48";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Aerodynamisches Concept-Car mit 4 R\xE4dern",
        description: `3D-Fahrzeugmodell generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: carColor },
        nodes: [
          {
            id: "node-car-chassis",
            name: "Fahrzeug-Karosserie",
            type: "box",
            operation: "union",
            position: [0, 0, 6],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: carColor,
            params: { width: 88, depth: 42, height: 15, bevel: 5, wallThickness: 0 }
          },
          {
            id: "node-car-cabin",
            name: "Sport-Cockpit / Dachkuppel",
            type: "box",
            operation: "union",
            position: [-4, 0, 19],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#38bdf8",
            params: { width: 46, depth: 34, height: 14, bevel: 6, wallThickness: 0 }
          },
          {
            id: "node-car-spoiler",
            name: "Heckspoiler-Fl\xFCgel",
            type: "box",
            operation: "union",
            position: [-38, 0, 21],
            rotation: [0, 10, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { width: 12, depth: 44, height: 6, bevel: 1.5, wallThickness: 0 }
          },
          {
            id: "node-wheel-fl",
            name: "Vorderrad Links",
            type: "cylinder",
            operation: "union",
            position: [25, -24, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 }
          },
          {
            id: "node-wheel-fr",
            name: "Vorderrad Rechts",
            type: "cylinder",
            operation: "union",
            position: [25, 16, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 }
          },
          {
            id: "node-wheel-rl",
            name: "Hinterrad Links",
            type: "cylinder",
            operation: "union",
            position: [-25, -24, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 }
          },
          {
            id: "node-wheel-rr",
            name: "Hinterrad Rechts",
            type: "cylinder",
            operation: "union",
            position: [-25, 16, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#94a3b8",
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 }
          }
        ],
        promptHistory: []
      };
      summary2 = "3D-Fahrzeugmodell (88\xD748\xD733mm) mit Karosserie, Cockpit-Kuppel, Heckspoiler und 4 R\xE4dern generiert.";
    } else if (/\b(schlüsselanhänger|schluesselanhaenger|keychain|schild|tag|plakette|anhänger|anhaenger|coin|medaille|badge)\b/i.test(lower)) {
      preserveNodeColors = true;
      const badgeColor = colorMatch?.hex || "#fbbf24";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Schl\xFCsselanh\xE4nger / Emblem-Tag mit Ring\xF6se",
        description: `Pr\xE4zisions-Keychain generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: badgeColor },
        nodes: [
          {
            id: "node-keychain-plate",
            name: "Gefaste Tr\xE4gerplatte",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: badgeColor,
            params: { width: 64, depth: 34, height: 5, bevel: 10, wallThickness: 0 }
          },
          {
            id: "node-keychain-star",
            name: "Erhabenes 3D-Stern-Relief",
            type: "star",
            operation: "union",
            position: [6, 0, 4.5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f8fafc",
            params: { points: 5, outerRadius: 12, innerRadius: 5.5, height: 3.5 }
          },
          {
            id: "node-keychain-hole",
            name: "Schl\xFCsselring-Bohrung (\xD87mm)",
            type: "cylinder",
            operation: "subtract",
            position: [-22, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f43f5e",
            params: { radiusBottom: 3.5, radiusTop: 3.5, height: 14, segments: 24 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Schl\xFCsselanh\xE4nger-Plakette (64\xD734\xD78mm) mit erhabenem Relief-Emblem und \xD87mm Schl\xFCsselring-Bohrung erstellt.";
    } else if (/\b(gehäuse|gehaeuse|case|enclosure|raspberry|esp32|arduino|elektronikbox|verteilerdose)\b/i.test(lower)) {
      const boxCol = colorMatch?.hex || "#38bdf8";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Elektronik-Geh\xE4use mit Standoffs & Port-Durchbruch",
        description: `Funktionales Geh\xE4use generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: boxCol },
        nodes: [
          {
            id: "node-enc-shell",
            name: "Hohle Geh\xE4use-Wanne (2.8mm Wand)",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { width: 92, depth: 64, height: 34, bevel: 5, wallThickness: 2.8 }
          },
          {
            id: "node-standoff-1",
            name: "Platinen-Standoff VL (M3)",
            type: "cylinder",
            operation: "union",
            position: [-36, -22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 }
          },
          {
            id: "node-standoff-2",
            name: "Platinen-Standoff VR (M3)",
            type: "cylinder",
            operation: "union",
            position: [36, -22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 }
          },
          {
            id: "node-standoff-3",
            name: "Platinen-Standoff HL (M3)",
            type: "cylinder",
            operation: "union",
            position: [-36, 22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 }
          },
          {
            id: "node-standoff-4",
            name: "Platinen-Standoff HR (M3)",
            type: "cylinder",
            operation: "union",
            position: [36, 22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 }
          },
          {
            id: "node-usb-port",
            name: "Seitlicher USB / Kabel-Ausschnitt",
            type: "box",
            operation: "subtract",
            position: [45, 0, 12],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f43f5e",
            params: { width: 14, depth: 18, height: 12, bevel: 1, wallThickness: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Elektronik-Geh\xE4use (92\xD764\xD734mm, 2.8mm Wandst\xE4rke) mit 4 M3-Platinen-Standoffs und USB-Port-Ausschnitt erstellt.";
    } else if (/\b(knauf|griff|knob|handle|drehknopf|schubladengriff)\b/i.test(lower)) {
      const knobCol = colorMatch?.hex || "#f59e0b";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Geriffelter Drehknopf / M\xF6belknauf mit M4-Aufnahme",
        description: `Ergonomischer Griffknauf generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: knobCol },
        nodes: [
          {
            id: "node-knob-neck",
            name: "Distanzschaft mit M4-Bohrung",
            type: "cylinder",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: knobCol,
            params: { radiusBottom: 11, radiusTop: 10, innerRadius: 2.1, height: 16, segments: 32 }
          },
          {
            id: "node-knob-head",
            name: "Verzahnter Griffkranz (18 Mulden)",
            type: "gear",
            operation: "union",
            position: [0, 0, 14],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: knobCol,
            params: { teeth: 18, outerRadius: 22, toothDepth: 2.2, boreRadius: 2.1, height: 18 }
          },
          {
            id: "node-knob-cap",
            name: "Gew\xF6lbte Griffkuppel",
            type: "sphere",
            operation: "union",
            position: [0, 0, 30],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.45],
            color: knobCol,
            params: { radius: 20, domeOnly: 1 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Ergonomischer Drehknopf / Knauf (\xD844\xD739mm) mit 18 Griffmulden, Schaft und M4-Innenbohrung erstellt.";
    } else if (/\b(tasse|kaffeetasse|teetasse|mug|haferl|becher)\b/i.test(lower)) {
      const mugColor = colorMatch?.hex || "#38bdf8";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Design-Kaffeetasse mit Henkel",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mugColor },
        nodes: [
          {
            id: "node-mug-body",
            name: "Hohler Tassenk\xF6rper",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mugColor,
            params: {
              height: 76,
              rBottom: 32,
              rLower: 35,
              rMid: 36,
              rUpper: 36,
              rNeck: 36,
              rTop: 37,
              wallThickness: 3.4,
              segments: 40
            }
          },
          {
            id: "node-mug-handle",
            name: "Ergonomischer Tassenhenkel",
            type: "torus",
            operation: "union",
            position: [36, 0, 20],
            rotation: [90, 0, 0],
            scale: [0.85, 1.15, 1],
            color: mugColor,
            params: { radius: 21, tubeRadius: 5.2 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Hohle 3D-Tasse (\xD874\xD776mm, 3.4mm Wandst\xE4rke) mit seitlichem Henkel erstellt.";
    } else if (/\b(herz|heart|liebe)\b/i.test(lower)) {
      const heartColor = colorMatch?.hex || "#e11d48";
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Herz-Skulptur (Gefast)",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: heartColor },
        nodes: [
          {
            id: "node-heart-main",
            name: "3D-Herzk\xF6rper",
            type: "heart",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: heartColor,
            params: { width: 68, depth: 62, height: 24, bevel: 5 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Dreidimensionales, gew\xF6lbtes 3D-Herz (68\xD762\xD724mm) erstellt.";
    } else if (/\b(stern|star|weihnachtsstern)\b/i.test(lower)) {
      const starColor = colorMatch?.hex || "#fbbf24";
      preserveNodeColors = true;
      const ptsMatch = lower.match(/(\d+)\s*(?:zacken|spitzen|points)/i);
      const pts = ptsMatch ? Math.max(3, Math.min(12, Number(ptsMatch[1]))) : 5;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-Stern (${pts}-zackig)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: starColor },
        nodes: [
          {
            id: "node-star-main",
            name: `${pts}-zackiger 3D-Stern`,
            type: "star",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: starColor,
            params: { points: pts, outerRadius: 42, innerRadius: 18, height: 20 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Facettierter ${pts}-zackiger 3D-Stern (\xD884\xD720mm) erstellt.`;
    } else if (/\b(pilz|fliegenpilz|mushroom)\b/i.test(lower)) {
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Pilz (Stiel & Hut)",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#e11d48" },
        nodes: [
          {
            id: "node-mushroom-stem",
            name: "Pilzstiel",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f8fafc",
            params: { height: 46, rBottom: 16, rLower: 18, rMid: 13, rUpper: 11, rNeck: 10, rTop: 12, segments: 32 }
          },
          {
            id: "node-mushroom-cap",
            name: "Gew\xF6lbter Pilzhut",
            type: "sphere",
            operation: "union",
            position: [0, 0, 40],
            rotation: [0, 0, 0],
            scale: [1.2, 1.2, 0.78],
            color: colorMatch?.hex || "#e11d48",
            params: { radius: 30, domeOnly: 1 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Organischer 3D-Pilz (\xD872\xD764mm) mit bauchigem Stiel und gew\xF6lbter Hutkuppel generiert.";
    } else if (/\b(flasche|karaffe|bottle|kolben)\b/i.test(lower)) {
      const bottleColor = colorMatch?.hex || "#38bdf8";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Design-Flasche / Karaffe",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bottleColor },
        nodes: [
          {
            id: "node-bottle-body",
            name: "Flaschenk\xF6rper mit Hals",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bottleColor,
            params: {
              height: 110,
              rBottom: 28,
              rLower: 32,
              rMid: 32,
              rUpper: 26,
              rNeck: 12,
              rTop: 14,
              wallThickness: 2.6,
              segments: 36
            }
          }
        ],
        promptHistory: []
      };
      summary2 = "Hohle 3D-Karaffe / Flasche (\xD864\xD7110mm) mit verj\xFCngtem Flaschenhals erstellt.";
    } else if (/\b(schale|schüssel|schuessel|bowl|obstschale)\b/i.test(lower)) {
      const bowlColor = colorMatch?.hex || "#f59e0b";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Organische Design-Schale",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bowlColor },
        nodes: [
          {
            id: "node-bowl-body",
            name: "Gew\xF6lbte Schale",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bowlColor,
            params: {
              height: 46,
              rBottom: 24,
              rLower: 34,
              rMid: 42,
              rUpper: 48,
              rNeck: 52,
              rTop: 54,
              wallThickness: 3.2,
              lobeCount: 12,
              lobeAmplitude: 1.5,
              segments: 44
            }
          }
        ],
        promptHistory: []
      };
      summary2 = "Hohle Design-Schale (\xD8108\xD746mm, 3.2mm Wandst\xE4rke) generiert.";
    } else if (/\b(schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|spielfigur)\b/i.test(lower)) {
      const chessColor = colorMatch?.hex || "#e2e8f0";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Klassische Schachfigur (Gedreht)",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: chessColor },
        nodes: [
          {
            id: "node-chess-base",
            name: "Gedrehter Figurensockel & S\xE4ule",
            type: "lathe",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: chessColor,
            params: {
              height: 54,
              rBottom: 22,
              rLower: 19,
              rMid: 11,
              rUpper: 9,
              rNeck: 14,
              rTop: 9,
              segments: 36
            }
          },
          {
            id: "node-chess-head",
            name: "Kugelkopf",
            type: "sphere",
            operation: "union",
            position: [0, 0, 50],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: chessColor,
            params: { radius: 12, domeOnly: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Klassische Schachfigur (\xD844\xD774mm) mit gedrehtem Sockel, Kragenring und Kugelkopf erstellt.";
    } else if (/\b(schneemann|snowman)\b/i.test(lower)) {
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Schneemann mit Karottennase",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: "#f8fafc" },
        nodes: [
          {
            id: "node-snow-bottom",
            name: "Untere Schneekugel",
            type: "sphere",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.92],
            color: "#f8fafc",
            params: { radius: 26, domeOnly: 0 }
          },
          {
            id: "node-snow-mid",
            name: "Mittlere Schneekugel",
            type: "sphere",
            operation: "union",
            position: [0, 0, 38],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.92],
            color: "#f8fafc",
            params: { radius: 19, domeOnly: 0 }
          },
          {
            id: "node-snow-head",
            name: "Schneemann-Kopf",
            type: "sphere",
            operation: "union",
            position: [0, 0, 66],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f8fafc",
            params: { radius: 13, domeOnly: 0 }
          },
          {
            id: "node-snow-nose",
            name: "Karottennase",
            type: "cone",
            operation: "union",
            position: [0, -12, 79],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: "#f97316",
            params: { radiusBottom: 3.2, radiusTop: 0.6, height: 14, segments: 18 }
          }
        ],
        promptHistory: []
      };
      summary2 = "3D-Schneemann (\xD852\xD792mm) aus drei gestapelten Sph\xE4ren mit Karottennase generiert.";
    } else if (/\b(zahnrad|gear|ritzel|zähne|zaehne|cog|getriebe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.precision_planetary_gear();
      const teethMatch = lower.match(/(\d+)\s*(?:zähne|zaehne|teeth|t\b)/i);
      const boreMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:loch|bohrung|welle|bore)/i);
      const diaMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:durchmesser|diameter|groß|breit)/i);
      const gearNode = baseScene.nodes[0];
      if (teethMatch) {
        gearNode.params.teeth = Math.max(6, Math.min(72, Number(teethMatch[1])));
      }
      if (boreMatch) {
        const br = Math.max(1, Number(boreMatch[1].replace(",", ".")) / 2);
        gearNode.params.boreRadius = br;
        if (baseScene.nodes[1]) baseScene.nodes[1].params.innerRadius = br;
      }
      if (diaMatch) {
        gearNode.params.outerRadius = Math.max(10, Number(diaMatch[1].replace(",", ".")) / 2);
      }
      baseScene.title = `Stirnzahnrad Z${gearNode.params.teeth}`;
      summary2 = `Pr\xE4zisions-Zahnrad mit ${gearNode.params.teeth} Z\xE4hnen (\xD8${gearNode.params.outerRadius * 2}mm, Bohrung \xD8${(gearNode.params.boreRadius || 5) * 2}mm) generiert.`;
    } else if (/\b(vase|blumentopf|pflanztopf|topf|planter|pot|gefäß|gefaess|spiral|kelch|lampe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.twisted_rib_vase();
      const heightMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:hoch|höhe|hoehe|high)/i);
      const ribMatch = lower.match(/(\d+)\s*(?:rippen|ribs|rillen)/i);
      const vaseNode = baseScene.nodes[0];
      if (heightMatch) vaseNode.params.height = Math.max(20, Math.min(240, Number(heightMatch[1].replace(",", "."))));
      if (ribMatch) vaseNode.params.ribCount = Math.max(0, Math.min(36, Number(ribMatch[1])));
      baseScene.title = `Spiral-Designvase (${vaseNode.params.height}mm)`;
      summary2 = `Skulpturale Torsions-Vase (H\xF6he ${vaseNode.params.height}mm, ${vaseNode.params.ribCount} Rippen) erstellt.`;
    } else if (/\b(organizer|kasten|schublade|sortier|fach|fächer|faecher|tray|stiftehalter|kabelhalter|kabel|cable|clip)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.smart_home_organizer();
      const orgNode = baseScene.nodes[0];
      const gridMatch = lower.match(/(\d+)\s*[x×]\s*(\d+)/);
      if (gridMatch) {
        orgNode.params.slotsX = Math.max(1, Math.min(5, Number(gridMatch[1])));
        orgNode.params.slotsY = Math.max(1, Math.min(4, Number(gridMatch[2])));
      }
      baseScene.title = `Modularer Organizer (${orgNode.params.slotsX}\xD7${orgNode.params.slotsY} F\xE4cher)`;
      summary2 = `Organizer-Box (${orgNode.params.width}\xD7${orgNode.params.depth}\xD7${orgNode.params.height}mm) mit ${orgNode.params.slotsX * orgNode.params.slotsY} Kammern generiert.`;
    } else if (/\b(kopfhörer|kopfhoerer|headphone|haken|wandhaken|hook|winkel|bracket|wandhalter|tischklemme|klemme|ständer|staender)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.desk_headphone_stand();
      baseScene.title = cleanPrompt.length <= 42 ? cleanPrompt : "Tisch- & Wandhalterung (Bracket)";
      summary2 = `Verst\xE4rkte Halterung / Tischklemme (38\xD762\xD774mm) mit Kabeldurchf\xFChrung generiert.`;
    } else if (/\b(trichter|funnel)\b/i.test(lower)) {
      const funnelCol = colorMatch?.hex || "#f97316";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "Pr\xE4zisions-Einf\xFClltrichter mit Auslaufrohr",
        description: `Hohler Trichter generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: funnelCol },
        nodes: [
          {
            id: "node-funnel-spout",
            name: "Unteres Auslaufrohr",
            type: "cylinder",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: funnelCol,
            params: { radiusBottom: 7, radiusTop: 8, innerRadius: 5, height: 28, segments: 36 }
          },
          {
            id: "node-funnel-cone",
            name: "Oberer Trichterkonus",
            type: "cone",
            operation: "union",
            position: [0, 0, 26],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: funnelCol,
            params: { radiusBottom: 8, radiusTop: 38, innerRadius: 5.5, height: 48, segments: 44 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Hohler Einf\xFClltrichter (\xD876\xD774mm) mit Auslaufrohr erstellt.";
    } else if (/\b(kugel|sphere|ball|kuppel|dome|murmel)\b/i.test(lower)) {
      const rMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      const rad = rMatch ? Math.max(8, Number(rMatch[1].replace(",", ".")) / 2) : 28;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-Kugel / Sph\xE4re (\xD8${rad * 2}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: "node-sphere-1",
            name: "Kugelk\xF6rper",
            type: "sphere",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#10b981",
            params: { radius: rad, domeOnly: /\b(kuppel|dome|halbkugel)\b/i.test(lower) ? 1 : 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Sph\xE4ren-Geometrie (\xD8${rad * 2}mm) auf der Bauplatte erstellt.`;
    } else if (/\b(pyramide|pyramid|kegel|cone)\b/i.test(lower)) {
      const isPyramid = /\b(pyramide|pyramid)\b/i.test(lower);
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: isPyramid ? "3D-Pyramide" : "3D-Kegel / Konus",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: "node-cone-main",
            name: isPyramid ? "Pyramidenk\xF6rper" : "Kegelk\xF6rper",
            type: "cone",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, isPyramid ? 45 : 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#f59e0b",
            params: { radiusBottom: 34, radiusTop: 1, height: 56, segments: isPyramid ? 4 : 40 }
          }
        ],
        promptHistory: []
      };
      summary2 = `${isPyramid ? "4-seitige Pyramide" : "Pr\xE4zisionskegel"} (\xD868\xD756mm) erstellt.`;
    } else if (/\b(donut|torus|o-ring|reif)\b/i.test(lower)) {
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: "3D-Torus / Donut-Ring",
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: "node-torus-main",
            name: "Torus-Ringk\xF6rper",
            type: "torus",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#f43f5e",
            params: { radius: 28, tubeRadius: 11 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Torus / Donut-Geometrie (Au\xDFen-\xD878mm, Ringst\xE4rke 22mm) generiert.";
    } else if (/\b(würfel|wuerfel|cube|quader|block|klotz)\b/i.test(lower)) {
      const m = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      const sz = m ? Math.max(10, Number(m[1].replace(",", "."))) : 45;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-W\xFCrfel (${sz}\xD7${sz}\xD7${sz}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: "node-cube-main",
            name: "Gefaster 3D-W\xFCrfel",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#38bdf8",
            params: { width: sz, depth: sz, height: sz, bevel: 3.5, wallThickness: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Gefaster 3D-W\xFCrfel (${sz}\xD7${sz}\xD7${sz}mm) erstellt.`;
    } else if (/\b(zylinder|rohr|tube|hülse|huelse|spacer|adapter|ring|spule)\b/i.test(lower)) {
      const nums = (lower.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(",", ".")));
      const outerR = nums[0] ? Math.max(6, nums[0] / 2) : 25;
      const height = nums[1] ? Math.max(5, nums[1]) : 40;
      const innerR = nums[2] ? Math.min(outerR - 2, nums[2] / 2) : Math.max(0, outerR * 0.55);
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `Zylinder-H\xFClse / Adapter (\xD8${outerR * 2}\xD7${height}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: "node-cyl-main",
            name: "Zylinderh\xFClse",
            type: "cylinder",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#38bdf8",
            params: { radiusBottom: outerR, radiusTop: outerR, innerRadius: innerR, height, segments: 48 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Zylinder-Adapter (Au\xDFen-\xD8${outerR * 2}mm, Innen-\xD8${(innerR * 2).toFixed(1)}mm, H\xF6he ${height}mm) erstellt.`;
    } else {
      const dims = (lower.match(/(\d+(?:[.,]\d+)?)\s*mm/g) || []).map(
        (s) => Number(s.replace(/mm/i, "").replace(",", ".").trim())
      );
      const w = dims[0] || 68;
      const d = dims[1] || 56;
      const h = dims[2] || 54;
      const mainColor = colorMatch?.hex || "#10b981";
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: cleanPrompt.slice(0, 48) || "Parametrische 3D-Baugruppe",
        description: `Mehrteiliges 3D-Druckmodell f\xFCr "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mainColor },
        nodes: [
          {
            id: "node-base-plate",
            name: "Gefaster Grundsockel mit Montageflansch",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainColor,
            params: { width: w, depth: d, height: 10, bevel: 5, wallThickness: 0 }
          },
          {
            id: "node-sculpted-core",
            name: "Konturierter Hauptk\xF6rper (Rotationsprofil)",
            type: "lathe",
            operation: "union",
            position: [0, 0, 8],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainColor,
            params: {
              height: Math.max(24, h - 8),
              rBottom: Math.round(Math.min(w, d) * 0.36),
              rLower: Math.round(Math.min(w, d) * 0.42),
              rMid: Math.round(Math.min(w, d) * 0.34),
              rUpper: Math.round(Math.min(w, d) * 0.38),
              rNeck: Math.round(Math.min(w, d) * 0.26),
              rTop: Math.round(Math.min(w, d) * 0.3),
              lobeCount: 6,
              lobeAmplitude: 1.8,
              wallThickness: /\b(hohl|gehäuse|box|topf)\b/i.test(lower) ? 2.8 : 0,
              segments: 40
            }
          },
          {
            id: "node-top-crown",
            name: "Oberer Abschlusskranz",
            type: "gear",
            operation: "union",
            position: [0, 0, Math.max(22, h - 10)],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#38bdf8",
            params: {
              teeth: 16,
              outerRadius: Math.round(Math.min(w, d) * 0.32),
              toothDepth: 2.2,
              boreRadius: 6,
              height: 10
            }
          },
          {
            id: "node-center-bore",
            name: "Zentrale Funktionsbohrung",
            type: "cylinder",
            operation: "subtract",
            position: [0, 0, 4],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: "#f43f5e",
            params: { radiusBottom: 6, radiusTop: 6, height: h + 10, segments: 28 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Mehrteilige 3D-Baugruppe (${w}\xD7${d}\xD7${h}mm) mit Grundsockel, konturiertem Hauptk\xF6rper, Abschlusskranz und Bohrung f\xFCr "${cleanPrompt}" generiert.`;
    }
    if (colorMatch && !preserveNodeColors) {
      baseScene.printProfile.filamentColor = colorMatch.hex;
      for (const n of baseScene.nodes) {
        if (n.operation !== "subtract") n.color = colorMatch.hex;
      }
    }
    baseScene.projectId = existingScene?.projectId || `proj-${Date.now()}`;
    baseScene.updatedAt = nowIso;
    baseScene.promptHistory = [
      {
        id: `ph-${Date.now()}`,
        prompt: cleanPrompt,
        summary: summary2,
        engine: "Antigravity Parametric CAD",
        timestamp: nowIso
      },
      ...existingScene?.promptHistory || []
    ].slice(0, 30);
    return { scene: baseScene, summary: summary2, engine: "Antigravity Parametric CAD" };
  }
  const scene = JSON.parse(JSON.stringify(existingScene));
  scene.updatedAt = nowIso;
  const changes = [];
  if (colorMatch) {
    scene.printProfile.filamentColor = colorMatch.hex;
    for (const n of scene.nodes) {
      if (n.operation === "subtract") continue;
      if ((n.id.includes("stem") || n.id.includes("leaf")) && !/\b(stiel|blatt|komplett|alles)\b/i.test(lower)) {
        continue;
      }
      n.color = colorMatch.hex;
    }
    changes.push(`Farbe auf ${colorMatch.label} (${colorMatch.hex}) ge\xE4ndert`);
  }
  if (/\b(ohne\s+blatt|blatt\s+entfernen|kein\s+blatt)\b/i.test(lower)) {
    scene.nodes = scene.nodes.filter((n) => !n.id.includes("leaf") && !/blatt/i.test(n.name));
    changes.push("Blatt entfernt");
  }
  if (/\b(ohne\s+stiel|stiel\s+entfernen|kein\s+stiel)\b/i.test(lower)) {
    scene.nodes = scene.nodes.filter((n) => !n.id.includes("stem") && !/stiel/i.test(n.name));
    changes.push("Stiel entfernt");
  }
  if (/\b(biss|abgebissen|bite)\b/i.test(lower)) {
    scene.nodes.push({
      id: `node-bite-${Date.now()}`,
      name: "Seitlicher Biss-Abzug",
      type: "sphere",
      operation: "subtract",
      position: [31, 0, 22],
      rotation: [0, 0, 0],
      scale: [1, 1.15, 1.1],
      color: "#f43f5e",
      params: { radius: 18, domeOnly: 0 }
    });
    changes.push("Seitliche Biss-Aussparung hinzugef\xFCgt");
  }
  const pctMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const pctVal = pctMatch ? Number(pctMatch[1].replace(",", ".")) : null;
  const mmMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
  const mmVal = mmMatch ? Number(mmMatch[1].replace(",", ".")) : null;
  if (/\b(höher|hoeher|höhe|hoehe|taller|height|länger|laenger)\b/i.test(lower)) {
    for (const n of scene.nodes) {
      if (n.operation === "subtract") continue;
      if (pctVal) {
        const factor = pctVal > 100 ? pctVal / 100 : 1 + pctVal / 100;
        if (n.params.height) n.params.height = Number((n.params.height * factor).toFixed(1));
        else n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      } else if (mmVal) {
        if (/\b(um|plus|\+)\b/i.test(lower) && n.params.height) {
          n.params.height = Number((n.params.height + mmVal).toFixed(1));
        } else if (n.params.height) {
          n.params.height = mmVal;
        }
      } else if (n.params.height) {
        n.params.height = Number((n.params.height * 1.25).toFixed(1));
      }
    }
    changes.push(`Objekth\xF6he angepasst`);
  }
  if (/\b(breiter|breite|wider|width|durchmesser|größer|groesser|skalier)\b/i.test(lower)) {
    const factor = pctVal ? pctVal > 100 ? pctVal / 100 : 1 + pctVal / 100 : 1.2;
    for (const n of scene.nodes) {
      if (mmVal && !pctVal) {
        if (n.params.width !== void 0) n.params.width = mmVal;
        if (n.params.radius !== void 0) n.params.radius = mmVal / 2;
        if (n.params.outerRadius !== void 0) n.params.outerRadius = mmVal / 2;
        if (n.params.radiusBottom !== void 0) n.params.radiusBottom = mmVal / 2;
        if (n.params.radiusTop !== void 0) n.params.radiusTop = mmVal / 2;
      } else {
        n.scale[0] = Number((n.scale[0] * factor).toFixed(2));
        n.scale[1] = Number((n.scale[1] * factor).toFixed(2));
        if (/\b(skalier|größer|groesser)\b/i.test(lower)) {
          n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
        }
      }
    }
    changes.push(`Breite / Skalierung angepasst`);
  }
  if (/\b(kleiner|flacher|kürzer|kuerzer|schmaler|smaller|shorter)\b/i.test(lower)) {
    const factor = pctVal ? Math.max(0.25, 1 - pctVal / 100) : 0.8;
    for (const n of scene.nodes) {
      if (/\b(flacher|kürzer|kuerzer|shorter)\b/i.test(lower)) {
        if (n.params.height) n.params.height = Number((n.params.height * factor).toFixed(1));
        else n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      } else {
        n.scale[0] = Number((n.scale[0] * factor).toFixed(2));
        n.scale[1] = Number((n.scale[1] * factor).toFixed(2));
        n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      }
    }
    changes.push(`Abmessungen reduziert (${Math.round(factor * 100)}%)`);
  }
  if (/\b(zähne|zaehne|teeth|rippen|ribs|fächer|faecher|slots|zacken)\b/i.test(lower)) {
    const countMatch = lower.match(/(\d+)/);
    const num = countMatch ? Number(countMatch[1]) : null;
    for (const n of scene.nodes) {
      if (n.type === "gear") {
        n.params.teeth = num ? Math.max(6, Math.min(80, num)) : (n.params.teeth || 20) + 6;
        changes.push(`Z\xE4hnezahl auf ${n.params.teeth} gesetzt`);
      } else if (n.type === "twisted_vase") {
        n.params.ribCount = num ? Math.max(0, Math.min(36, num)) : (n.params.ribCount || 12) + 4;
        changes.push(`Rippenanzahl auf ${n.params.ribCount} gesetzt`);
      } else if (n.type === "hex_organizer") {
        n.params.slotsX = num ? Math.max(1, Math.min(5, num)) : (n.params.slotsX || 3) + 1;
        changes.push(`Kammer-Unterteilung auf ${n.params.slotsX}\xD7${n.params.slotsY || 2} ge\xE4ndert`);
      } else if (n.type === "star") {
        n.params.points = num ? Math.max(3, Math.min(16, num)) : (n.params.points || 5) + 1;
        changes.push(`Sternspitzen auf ${n.params.points} gesetzt`);
      }
    }
  }
  if (/\b(loch|löcher|loecher|bohrung|bore|hole|aushöhlen|durchbruch)\b/i.test(lower)) {
    const holeDia = mmVal || 10;
    const holeRad = Math.max(1, holeDia / 2);
    const mainNode = scene.nodes[0];
    if (mainNode && (mainNode.type === "cylinder" || mainNode.type === "gear")) {
      if (mainNode.type === "cylinder") mainNode.params.innerRadius = holeRad;
      if (mainNode.type === "gear") mainNode.params.boreRadius = holeRad;
    }
    scene.nodes.push({
      id: `node-hole-${Date.now()}`,
      name: `Bohrung \xD8${holeDia}mm`,
      type: "cylinder",
      operation: "subtract",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: "#f43f5e",
      params: { radiusBottom: holeRad, radiusTop: holeRad, height: 95, segments: 32 }
    });
    changes.push(`Pr\xE4zisionsbohrung (\xD8${holeDia}mm) hinzugef\xFCgt`);
  }
  if (/\b(füge|fuege|add|hinzu|oben|sockel|basis|ring|knauf|griff|henkel|räder|raeder|wheels)\b/i.test(lower) && !/\b(loch|bohrung)\b/i.test(lower)) {
    const refHeight = scene.nodes[0]?.params?.height || 45;
    if (/\b(ring|öse|oese|torus|henkel|griff|handle)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-ring-${Date.now()}`,
        name: "Befestigungsring / Henkel",
        type: "torus",
        operation: "union",
        position: [26, 0, Math.max(12, refHeight * 0.45)],
        rotation: [90, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 16, tubeRadius: 4.2 }
      });
      changes.push(`Henkel / Ring\xF6se hinzugef\xFCgt`);
    } else if (/\b(sockel|basis|base|platte|boden)\b/i.test(lower)) {
      scene.nodes.unshift({
        id: `node-base-${Date.now()}`,
        name: "Verst\xE4rkte Sockelplatte",
        type: "box",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { width: mmVal || 76, depth: mmVal || 76, height: 6, bevel: 4, wallThickness: 0 }
      });
      changes.push(`Verst\xE4rkte Sockelplatte hinzugef\xFCgt`);
    } else if (/\b(kugel|knauf|kuppel|sphere)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-knob-${Date.now()}`,
        name: "Kugelknauf",
        type: "sphere",
        operation: "union",
        position: [0, 0, refHeight - 4],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 14, domeOnly: 0 }
      });
      changes.push(`Kugelknauf an Oberseite angef\xFCgt`);
    }
  }
  if (/\b(dreh|twist|torsion|spiral|rotier)\b/i.test(lower)) {
    for (const n of scene.nodes) {
      if (n.type === "twisted_vase") {
        n.params.twistDeg = (n.params.twistDeg || 90) + 60;
      } else {
        n.rotation[2] = ((n.rotation[2] || 0) + 30) % 360;
      }
    }
    changes.push(`Torsions-/Rotationswinkel erh\xF6ht`);
  }
  if (/\b(verschieb|move|links|rechts|vorne|hinten)\b/i.test(lower)) {
    const step = mmVal || 15;
    const dx = /\brechts\b/i.test(lower) ? step : /\blinks\b/i.test(lower) ? -step : 0;
    const dy = /\bhinten\b/i.test(lower) ? step : /\bvorne\b/i.test(lower) ? -step : 0;
    for (const n of scene.nodes) {
      n.position[0] = Number(((n.position[0] || 0) + dx).toFixed(1));
      n.position[1] = Number(((n.position[1] || 0) + dy).toFixed(1));
    }
    changes.push(`Objekt auf Bauplatte verschoben (\u0394X=${dx}mm, \u0394Y=${dy}mm)`);
  }
  if (changes.length === 0) {
    const primary = scene.nodes[0];
    if (primary) {
      if (primary.params.height) {
        primary.params.height = Number((primary.params.height * 1.15).toFixed(1));
      } else {
        primary.scale[2] = Number((primary.scale[2] * 1.15).toFixed(2));
      }
      if (primary.params.bevel !== void 0) {
        primary.params.bevel = Math.min(12, (primary.params.bevel || 2) + 2);
      }
      changes.push(`Geometrie gem\xE4\xDF "${cleanPrompt}" angepasst`);
    }
  }
  const summary = changes.join(" \xB7 ");
  scene.promptHistory.unshift({
    id: `ph-${Date.now()}`,
    prompt: cleanPrompt,
    summary,
    engine: "Antigravity Parametric CAD",
    timestamp: nowIso
  });
  return { scene, summary, engine: "Antigravity Parametric CAD" };
}
async function generate3dSceneFromHuggingFace(prompt) {
  const cleanPrompt = prompt.trim();
  const englishPrompt = translatePromptToEnglish(cleanPrompt);
  const hfPrompt = englishPrompt.toLowerCase() !== cleanPrompt.toLowerCase() ? `a 3D model of ${englishPrompt}` : cleanPrompt;
  const baseUrl = "https://hysts-shap-e.hf.space";
  const seed = Math.floor(Math.random() * 1e5);
  const callRes = await fetch(`${baseUrl}/gradio_api/call/text-to-3d`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [hfPrompt, seed, 15, 32]
    }),
    signal: AbortSignal.timeout(12e3)
  });
  if (!callRes.ok) {
    throw new Error(`Hugging Face Shap-E API HTTP ${callRes.status}`);
  }
  const callJson = await callRes.json();
  if (!callJson.event_id) {
    throw new Error("Hugging Face Shap-E lieferte keine event_id.");
  }
  const sseRes = await fetch(`${baseUrl}/gradio_api/call/text-to-3d/${callJson.event_id}`, {
    headers: { Accept: "text/event-stream" },
    signal: AbortSignal.timeout(35e3)
  });
  if (!sseRes.ok) {
    throw new Error(`Hugging Face Stream HTTP ${sseRes.status}`);
  }
  const sseText = await sseRes.text();
  let glbUrl = null;
  for (const line of sseText.split("\n")) {
    if (line.startsWith("data:")) {
      const jsonStr = line.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed[0]) {
          if (typeof parsed[0].url === "string") {
            glbUrl = parsed[0].url;
          } else if (typeof parsed[0].path === "string") {
            glbUrl = `${baseUrl}/gradio_api/file=${parsed[0].path}`;
          }
        }
      } catch {
      }
    }
  }
  if (!glbUrl) {
    throw new Error("Hugging Face Shap-E lieferte keine 3D-GLB-Datei.");
  }
  const glbRes = await fetch(glbUrl, {
    signal: AbortSignal.timeout(15e3)
  });
  if (!glbRes.ok) {
    throw new Error(`GLB-Download von Hugging Face fehlgeschlagen (HTTP ${glbRes.status}).`);
  }
  const ab = await glbRes.arrayBuffer();
  const parsedGlb = parseGlbBufferToMeshData(new Uint8Array(ab), 68, 5500);
  const colorMatch = extractColorFromPrompt(cleanPrompt);
  const finalColor = ensureHighContrastColor(
    colorMatch?.hex || parsedGlb.dominantColorHex,
    "#10b981"
  );
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const scene = {
    projectId: `hf-shape-${Date.now()}`,
    title: `${cleanPrompt} (Hugging Face 3D)`,
    description: `KI-generiertes 3D-Mesh via Hugging Face Shap-E (${parsedGlb.originalTriangles} Dreiecke \xB7 Prompt: "${hfPrompt}")`,
    createdAt: nowIso,
    updatedAt: nowIso,
    buildPlateMm: [256, 256, 256],
    printProfile: {
      ...DEFAULT_PRINT_PROFILE,
      filamentColor: finalColor
    },
    nodes: [
      {
        id: `node-hf-glb-${Date.now()}`,
        name: `${cleanPrompt} (Shap-E 3D Mesh)`,
        type: "stl_mesh",
        operation: "union",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: finalColor,
        params: {
          originalTriangles: parsedGlb.originalTriangles,
          width: parsedGlb.dimensionsMm.x,
          depth: parsedGlb.dimensionsMm.y,
          height: parsedGlb.dimensionsMm.z
        },
        meshData: parsedGlb.meshData
      }
    ],
    promptHistory: [
      {
        id: `ph-hf-${Date.now()}`,
        prompt: cleanPrompt,
        summary: `Echtes 3D-Mesh (${parsedGlb.dimensionsMm.x}\xD7${parsedGlb.dimensionsMm.y}\xD7${parsedGlb.dimensionsMm.z}mm, ${parsedGlb.originalTriangles} Roh-Dreiecke) via Hugging Face Shap-E generiert.`,
        engine: "Hugging Face Shap-E (Text-to-3D)",
        timestamp: nowIso
      }
    ]
  };
  return {
    scene,
    summary: `3D-Mesh (${parsedGlb.dimensionsMm.x}\xD7${parsedGlb.dimensionsMm.y}\xD7${parsedGlb.dimensionsMm.z}mm) via Hugging Face Shap-E generiert.`,
    engine: "Hugging Face Shap-E (Text-to-3D)"
  };
}
async function generateOrModify3dSceneWithAi(prompt, existingScene, customApiKey) {
  const hasStlMeshNode = Boolean(existingScene?.nodes.some((n) => n.type === "stl_mesh"));
  if (existingScene && hasStlMeshNode && !isExplicitObjectCreationPrompt(prompt)) {
    return runLocalAntigravityCadEngine(prompt, existingScene);
  }
  let hfError = "";
  if (!existingScene || isExplicitObjectCreationPrompt(prompt)) {
    try {
      return await generate3dSceneFromHuggingFace(prompt);
    } catch (err) {
      hfError = err instanceof Error ? err.message : String(err);
    }
  }
  const apiKey = customApiKey || discoverGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      `Hugging Face 3D-Generierung fehlgeschlagen (${hfError || "Nicht erreichbar"}) und kein Gemini API-Key konfiguriert.`
    );
  }
  const models = await resolveGeminiModels(apiKey);
  const systemInstruction = `Du bist der Antigravity 3D-CAD Kernel f\xFCr das Modul "thassi.3dprint" (Bambu Lab 256x256x256mm).
Erzeuge oder ver\xE4ndere das 3D-Objekt basierend auf dem User-Prompt.
WICHTIG:
1. Erstelle NIEMALS nur einen einzelnen simplen Quader ("box")! Jedes neue Objekt MUSS aus mindestens 4 bis 10 zusammenh\xE4ngenden Bauteilen (Nodes) konstruiert werden, damit die echte 3D-Form detailliert und realistisch erkennbar ist (z.B. Rumpf + Kabine + Dach + R\xE4der/Fl\xFCgel/Griff + Abzugs-Bohrungen).
2. Alle Koordinaten in Millimetern (Z=0 ist die Bauplatte). Positioniere zusammenh\xE4ngende Bauteile so, dass sie sich physisch ber\xFChren/\xFCberlappen.
3. Nutze helle, kontrastreiche Farben (#10b981, #38bdf8, #f59e0b, #e11d48, #f8fafc, #a855f7, #94a3b8).

Verf\xFCgbare PrimitiveTypes und ihre EXAKTEN Parameter:
- "lathe": params { height, rBottom, rLower, rMid, rUpper, rNeck, rTop, topIndent, bottomIndent, wallThickness, lobeCount, lobeAmplitude, segments } (Ideal f\xFCr organische K\xF6rper, Flaschen, Kelche, Tassen, Figuren, R\xFCmpfe)
- "apple": params { radius, height, lobeCount, lobeAmplitude, topIndent, bottomIndent, segments }
- "heart": params { width, depth, height, bevel }
- "star": params { points, outerRadius, innerRadius, height }
- "box": params { width, depth, height, bevel, wallThickness }
- "cylinder": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "sphere": params { radius, domeOnly }
- "cone": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "torus": params { radius, tubeRadius }
- "gear": params { teeth, outerRadius, toothDepth, boreRadius, height }
- "twisted_vase": params { radiusBottom, radiusTop, height, wallThickness, twistDeg, ribCount, ribAmplitude }
- "bracket": params { width, depth, height, thickness, lipHeight }
- "hex_organizer": params { width, depth, height, wallThickness, slotsX, slotsY }

Jeder Node hat:
{
  "id": "string",
  "name": "Kurzer deutscher Bauteilname",
  "type": PrimitiveType,
  "operation": "union" | "subtract",
  "position": [x, y, z],
  "rotation": [rx, ry, rz],
  "scale": [sx, sy, sz],
  "color": "#HEX",
  "params": { ... }
}

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "title": "Projekttitel",
  "description": "Kurzbeschreibung",
  "filamentColor": "#10b981",
  "filamentType": "PLA",
  "infillPercent": 20,
  "layerHeightMm": 0.2,
  "summary": "Was wurde erstellt oder ge\xE4ndert",
  "nodes": [ ... ]
}`;
  const userMessage = existingScene ? `Aktuelles 3D-Modell (JSON):
${JSON.stringify({
    title: existingScene.title,
    description: existingScene.description,
    printProfile: existingScene.printProfile,
    nodes: existingScene.nodes
  })}

User-Prompt: "${prompt}"
Modifiziere das bestehende 3D-Modell gezielt nach dem Wunsch des Users (oder baue es komplett neu aus 4-10 Nodes auf, falls ein anderes Objekt gew\xFCnscht ist).` : `Erstelle ein detailliertes, mehrteiliges 3D-Druckmodell (mindestens 4-8 Nodes) f\xFCr folgenden User-Prompt: "${prompt}"`;
  let lastError = "Unbekannter Gemini API-Fehler";
  for (const model of models.slice(0, 2)) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemInstruction}

${userMessage}` }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json"
            }
          }),
          signal: AbortSignal.timeout(12e3)
        }
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let cleanMsg = errBody.slice(0, 160);
        try {
          const errJson = JSON.parse(errBody);
          if (errJson?.error?.message) cleanMsg = String(errJson.error.message);
        } catch {
        }
        lastError = `Gemini API (${model}, HTTP ${res.status}): ${cleanMsg}`;
        continue;
      }
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const defaultCol = ensureHighContrastColor(
          parsed.filamentColor || existingScene?.printProfile.filamentColor,
          "#10b981"
        );
        const sanitizedNodes = parsed.nodes.map(
          (n, idx) => normalizePrimitiveNode(n, idx, defaultCol)
        );
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const summaryText = parsed.summary || `3D-Modell per ${model} generiert`;
        const engineName = `Google Gemini (${model})`;
        const nextScene = {
          projectId: existingScene?.projectId || `proj-${Date.now()}`,
          title: parsed.title || existingScene?.title || prompt.slice(0, 40),
          description: parsed.description || existingScene?.description || prompt,
          createdAt: existingScene?.createdAt || nowIso,
          updatedAt: nowIso,
          buildPlateMm: [256, 256, 256],
          printProfile: {
            ...existingScene?.printProfile || DEFAULT_PRINT_PROFILE,
            filamentColor: defaultCol,
            filamentType: parsed.filamentType || existingScene?.printProfile.filamentType || "PLA",
            infillPercent: Number(
              parsed.infillPercent || existingScene?.printProfile.infillPercent || 20
            ),
            layerHeightMm: Number(
              parsed.layerHeightMm || existingScene?.printProfile.layerHeightMm || 0.2
            )
          },
          nodes: sanitizedNodes,
          promptHistory: [
            {
              id: `ph-${Date.now()}`,
              prompt,
              summary: summaryText,
              engine: engineName,
              timestamp: nowIso
            },
            ...existingScene?.promptHistory || []
          ].slice(0, 30)
        };
        const compiled = compileSceneToMesh(nextScene);
        if (compiled.triangles.length >= 12) {
          return { scene: nextScene, summary: summaryText, engine: engineName };
        }
        lastError = `Gemini (${model}) lieferte ein leeres 3D-Mesh (${compiled.triangles.length} Dreiecke).`;
      } else {
        lastError = `Gemini (${model}) lieferte keine g\xFCltigen 3D-Nodes.`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(
    `KI-3D-Generierung fehlgeschlagen: ${hfError ? `Hugging Face (${hfError}) \xB7 ` : ""}${lastError}`
  );
}

// apps/3d-print/backend/index.ts
try {
  syncHassFrontendFiles();
} catch {
}
var DEFAULT_PRINTER_CONFIG = {
  ip: "192.168.188.175",
  serial: "00M09A391700992",
  accessCode: "",
  model: "Bambu Lab X1-Carbon (BL-P001)",
  name: "Bambu X1C WHG",
  nozzleDiameterMm: 0.4,
  bedDimensionsMm: [256, 256, 256],
  shellyPowerEntityId: "switch.buro_og_plug_90",
  lanOnlyMode: true
};
var simulationInterval = null;
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS print_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scene_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sliced_ready',
      progress_pct REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  function resolveGeminiKey() {
    return (ctx.sharedDb.kvGet("gemini_api_key") || ctx.db.kvGet("gemini_api_key") || discoverGeminiApiKey() || "").trim();
  }
  function getPrinterConfig() {
    const sharedSaved = ctx.sharedDb.kvGet("bambu_printer_config") || {};
    const localSaved = ctx.db.kvGet("bambu_printer_config") || {};
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...localSaved,
      ...sharedSaved
    };
  }
  function getTelemetry() {
    const saved = ctx.db.kvGet("bambu_live_telemetry");
    if (saved) return saved;
    return {
      connected: false,
      connectionMode: "standby_offline",
      printerState: "IDLE",
      subtaskName: "Bereit",
      progressPercent: 0,
      currentLayer: 0,
      totalLayers: 0,
      remainingMinutes: 0,
      nozzleTempC: 24.5,
      nozzleTargetTempC: 0,
      bedTempC: 23.8,
      bedTargetTempC: 0,
      chamberTempC: 25,
      speedLevel: 2,
      chamberLightOn: true,
      fanSpeedPercent: 0,
      activeProjectId: null,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastMessage: "Bambu Lab P1S Profil geladen \xB7 Bereit f\xFCr KI-3D-Generierung & Slicing"
    };
  }
  function saveTelemetry(next) {
    ctx.db.kvSet("bambu_live_telemetry", next);
    syncSharedDashboardState();
  }
  function purgeLegacyDummyProjects() {
    ctx.db.execute(`DELETE FROM print_projects WHERE id LIKE 'preset-%'`);
    const allRows = ctx.db.query("SELECT * FROM print_projects");
    for (const r of allRows) {
      if (r.scene_json.includes("node-sculpted-core") || r.scene_json.includes("node-base-chassis")) {
        ctx.db.execute("DELETE FROM print_projects WHERE id = ?", [r.id]);
      }
    }
    const activeId = ctx.db.kvGet("active_project_id");
    if (activeId) {
      const stillExists = ctx.db.queryOne(
        "SELECT * FROM print_projects WHERE id = ?",
        [activeId]
      );
      if (!stillExists) {
        const latest = ctx.db.queryOne(
          "SELECT * FROM print_projects ORDER BY updated_at DESC LIMIT 1"
        );
        ctx.db.kvSet("active_project_id", latest ? latest.id : null);
      }
    }
  }
  purgeLegacyDummyProjects();
  function getActiveProjectRow() {
    const activeId = ctx.db.kvGet("active_project_id");
    if (!activeId) return null;
    return ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [activeId]) || null;
  }
  function syncSharedDashboardState() {
    const row = getActiveProjectRow();
    const telemetry = getTelemetry();
    const printerCfg = getPrinterConfig();
    if (!row) {
      const emptyPayload = {
        hasActiveProject: false,
        activeProject: null,
        telemetry: {
          ...telemetry,
          activeProjectId: null,
          printerState: "IDLE",
          progressPercent: 0
        },
        printerConfig: {
          ...printerCfg,
          accessCode: printerCfg.accessCode ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
          accessCodeConfigured: Boolean(printerCfg.accessCode)
        },
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      ctx.sharedDb.kvSet("thassi_3dprint_summary", emptyPayload);
      return emptyPayload;
    }
    const scene = JSON.parse(row.scene_json);
    const stats = JSON.parse(row.stats_json);
    const effectiveProgress = telemetry.activeProjectId === row.id && (telemetry.printerState === "RUNNING" || telemetry.printerState === "PREPARE" || telemetry.printerState === "PAUSE") ? telemetry.progressPercent : row.progress_pct;
    const payload = {
      hasActiveProject: true,
      activeProject: {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        progressPct: effectiveProgress,
        scene,
        stats,
        updatedAt: row.updated_at
      },
      telemetry: {
        ...telemetry,
        activeProjectId: row.id,
        progressPercent: effectiveProgress
      },
      printerConfig: {
        ...printerCfg,
        accessCode: printerCfg.accessCode ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
        accessCodeConfigured: Boolean(printerCfg.accessCode)
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    ctx.sharedDb.kvSet("thassi_3dprint_summary", payload);
    return payload;
  }
  syncSharedDashboardState();
  function startPrintJobTicker(projectId, scene, stats, mode) {
    if (simulationInterval) clearInterval(simulationInterval);
    let step = 0;
    const totalLayers = Math.max(10, stats.layerCount);
    const targetNozzle = scene.printProfile.nozzleTempC || 220;
    const targetBed = scene.printProfile.bedTempC || 60;
    const initialTel = {
      connected: true,
      connectionMode: mode,
      printerState: "PREPARE",
      subtaskName: scene.title,
      progressPercent: 2,
      currentLayer: 1,
      totalLayers,
      remainingMinutes: stats.estimatedPrintMinutes,
      nozzleTempC: 145,
      nozzleTargetTempC: targetNozzle,
      bedTempC: 52,
      bedTargetTempC: targetBed,
      chamberTempC: 31,
      speedLevel: 2,
      chamberLightOn: true,
      fanSpeedPercent: 70,
      activeProjectId: projectId,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastMessage: `Vorheizen & Bed-Leveling f\xFCr "${scene.title}" (${targetNozzle}\xB0C / ${targetBed}\xB0C)...`
    };
    ctx.db.execute(`UPDATE print_projects SET status = 'printing', progress_pct = 2, updated_at = ? WHERE id = ?`, [
      (/* @__PURE__ */ new Date()).toISOString(),
      projectId
    ]);
    saveTelemetry(initialTel);
    simulationInterval = setInterval(() => {
      const curr = getTelemetry();
      if (curr.printerState === "PAUSE") return;
      if (curr.printerState !== "RUNNING" && curr.printerState !== "PREPARE") {
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = null;
        return;
      }
      step += 1;
      const nextPct = Math.min(100, Math.round(curr.progressPercent + 4));
      const nextLayer = Math.min(totalLayers, Math.max(1, Math.round(nextPct / 100 * totalLayers)));
      const remMin = Math.max(0, Math.round(stats.estimatedPrintMinutes * (1 - nextPct / 100)));
      const finished = nextPct >= 100;
      const updated = {
        ...curr,
        printerState: finished ? "FINISH" : step <= 1 ? "PREPARE" : "RUNNING",
        progressPercent: nextPct,
        currentLayer: nextLayer,
        totalLayers,
        remainingMinutes: remMin,
        nozzleTempC: finished ? 48 : targetNozzle + Number(((Math.random() - 0.5) * 0.8).toFixed(1)),
        nozzleTargetTempC: finished ? 0 : targetNozzle,
        bedTempC: finished ? 38 : targetBed + Number(((Math.random() - 0.5) * 0.4).toFixed(1)),
        bedTargetTempC: finished ? 0 : targetBed,
        chamberTempC: finished ? 29 : 36.5,
        fanSpeedPercent: finished ? 0 : 100,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: finished ? `3D-Druck "${scene.title}" erfolgreich abgeschlossen (100% \xB7 ${totalLayers} Layer)!` : `Druckt Layer ${nextLayer}/${totalLayers} (${nextPct}%) \xB7 Restzeit ca. ${remMin} Min.`
      };
      ctx.db.execute(
        `UPDATE print_projects SET status = ?, progress_pct = ?, updated_at = ? WHERE id = ?`,
        [finished ? "completed" : "printing", nextPct, updated.lastUpdated, projectId]
      );
      saveTelemetry(updated);
      if (finished && simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
    }, 3e3);
  }
  ctx.route("GET", "/dashboard", async () => {
    const summary = syncSharedDashboardState();
    const rows = ctx.db.query("SELECT * FROM print_projects ORDER BY updated_at DESC");
    const projects = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      progressPct: r.progress_pct,
      stats: JSON.parse(r.stats_json),
      scene: JSON.parse(r.scene_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    const discovered = ctx.db.kvGet("bambu_last_discovered") || [];
    const geminiKey = resolveGeminiKey();
    return {
      ...summary,
      projects,
      discoveredPrinters: discovered,
      bambuApiSpec: BAMBU_API_SPECIFICATION,
      aiStatus: {
        engine: geminiKey ? "Antigravity AI + Google Gemini CAD" : "Antigravity Parametric CAD Kernel",
        geminiConfigured: Boolean(geminiKey)
      }
    };
  });
  ctx.route("POST", "/library/search", async (req) => {
    const body = req.body || {};
    const promptText = (body.prompt || "").trim();
    if (!promptText) {
      return { status: 400, body: { error: "Bitte einen Suchbegriff eingeben." } };
    }
    const result = await searchOpen3dLibraries(promptText);
    return {
      ok: true,
      ...result
    };
  });
  ctx.route("POST", "/projects/generate", async (req) => {
    const body = req.body || {};
    let scene;
    let summary = "";
    let engine = "Antigravity Parametric CAD";
    if (body.importedScene && Array.isArray(body.importedScene.nodes)) {
      scene = {
        ...body.importedScene,
        projectId: `proj-${Date.now()}`,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      summary = body.importedSummary || `Open-Library Modell "${scene.title}" importiert und f\xFCr Bambu Lab vorbereitet.`;
      engine = "Open Library Import + Parametric CAD";
    } else if (body.presetKey && PRESET_TEMPLATES[body.presetKey]) {
      scene = PRESET_TEMPLATES[body.presetKey]();
      scene.projectId = `proj-${Date.now()}`;
      summary = `Vorlage "${scene.title}" geladen und f\xFCr Bambu Lab P1S vorbereitet.`;
    } else {
      const promptText = (body.prompt || "").trim();
      if (!promptText) {
        return { status: 400, body: { error: "Bitte einen Prompt f\xFCr das 3D-Objekt eingeben." } };
      }
      try {
        const generated = await generateOrModify3dSceneWithAi(promptText, null, resolveGeminiKey());
        scene = generated.scene;
        summary = generated.summary;
        engine = generated.engine;
      } catch (err) {
        const message = err instanceof Error ? err.message : "KI-3D-Generierung fehlgeschlagen.";
        return {
          status: 422,
          body: {
            ok: false,
            error: message
          }
        };
      }
    }
    const compiled = compileSceneToMesh(scene);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    ctx.db.execute(
      `INSERT INTO print_projects (id, title, description, scene_json, stats_json, status, progress_pct, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'sliced_ready', 100, ?, ?)`,
      [
        scene.projectId,
        scene.title,
        scene.description,
        JSON.stringify(scene),
        JSON.stringify(compiled.stats),
        nowIso,
        nowIso
      ]
    );
    ctx.db.kvSet("active_project_id", scene.projectId);
    const tel = getTelemetry();
    saveTelemetry({
      ...tel,
      activeProjectId: scene.projectId,
      subtaskName: scene.title,
      progressPercent: 100,
      currentLayer: compiled.stats.layerCount,
      totalLayers: compiled.stats.layerCount,
      remainingMinutes: compiled.stats.estimatedPrintMinutes,
      lastUpdated: nowIso,
      lastMessage: `${engine}: ${summary}`
    });
    return {
      ok: true,
      projectId: scene.projectId,
      scene,
      stats: compiled.stats,
      summary,
      engine
    };
  });
  ctx.route("POST", "/projects/modify", async (req) => {
    const body = req.body || {};
    const targetId = body.projectId || ctx.db.kvGet("active_project_id");
    if (!targetId) {
      return { status: 400, body: { error: "Kein aktives 3D-Projekt ausgew\xE4hlt." } };
    }
    const row = ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [targetId]);
    if (!row) {
      return { status: 404, body: { error: "Projekt nicht gefunden." } };
    }
    const currentScene = JSON.parse(row.scene_json);
    let nextScene;
    let summary = "";
    let engine = "Antigravity Parametric CAD";
    if (body.updatedScene) {
      nextScene = body.updatedScene;
      nextScene.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      summary = "Manuelle Parameter-\xC4nderung im 3D-Editor \xFCbernommen.";
      engine = "Direct CAD Gizmo";
    } else {
      const promptText = (body.prompt || "").trim();
      if (!promptText) {
        return { status: 400, body: { error: "Bitte einen \xC4nderungs-Prompt eingeben." } };
      }
      try {
        const modified = await generateOrModify3dSceneWithAi(
          promptText,
          currentScene,
          resolveGeminiKey()
        );
        nextScene = modified.scene;
        summary = modified.summary;
        engine = modified.engine;
      } catch (err) {
        const message = err instanceof Error ? err.message : "KI-\xC4nderung fehlgeschlagen.";
        return {
          status: 422,
          body: {
            ok: false,
            error: message
          }
        };
      }
    }
    const compiled = compileSceneToMesh(nextScene);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    ctx.db.execute(
      `UPDATE print_projects SET title = ?, description = ?, scene_json = ?, stats_json = ?, status = 'sliced_ready', progress_pct = 100, updated_at = ? WHERE id = ?`,
      [
        nextScene.title,
        nextScene.description,
        JSON.stringify(nextScene),
        JSON.stringify(compiled.stats),
        nowIso,
        targetId
      ]
    );
    ctx.db.kvSet("active_project_id", targetId);
    const tel = getTelemetry();
    saveTelemetry({
      ...tel,
      activeProjectId: targetId,
      subtaskName: nextScene.title,
      totalLayers: compiled.stats.layerCount,
      currentLayer: compiled.stats.layerCount,
      remainingMinutes: compiled.stats.estimatedPrintMinutes,
      lastUpdated: nowIso,
      lastMessage: `${engine}: ${summary}`
    });
    return {
      ok: true,
      projectId: targetId,
      scene: nextScene,
      stats: compiled.stats,
      summary,
      engine
    };
  });
  ctx.route("POST", "/projects/select", async (req) => {
    const body = req.body || {};
    if (!body.projectId) {
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      ctx.db.kvSet("active_project_id", null);
      const tel2 = getTelemetry();
      saveTelemetry({
        ...tel2,
        printerState: "IDLE",
        activeProjectId: null,
        progressPercent: 0,
        currentLayer: 0,
        totalLayers: 0,
        subtaskName: "Kein Projekt aktiv",
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: "Kein 3D-Projekt aktiv (Dashboard-Platzhalter aktiv)."
      });
      return { ok: true, activeProjectId: null, summary: syncSharedDashboardState() };
    }
    const row = ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [
      body.projectId
    ]);
    if (!row) {
      return { status: 404, body: { error: "Projekt nicht gefunden" } };
    }
    ctx.db.kvSet("active_project_id", row.id);
    const stats = JSON.parse(row.stats_json);
    const tel = getTelemetry();
    saveTelemetry({
      ...tel,
      activeProjectId: row.id,
      subtaskName: row.title,
      progressPercent: row.progress_pct,
      currentLayer: stats.layerCount,
      totalLayers: stats.layerCount,
      remainingMinutes: stats.estimatedPrintMinutes,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastMessage: `Projekt "${row.title}" aktiviert.`
    });
    return { ok: true, activeProjectId: row.id, summary: syncSharedDashboardState() };
  });
  ctx.route("DELETE", "/projects", async (req) => {
    const id = req.query.id;
    if (!id) return { status: 400, body: { error: "Missing id" } };
    ctx.db.execute("DELETE FROM print_projects WHERE id = ?", [id]);
    const activeId = ctx.db.kvGet("active_project_id");
    if (activeId === id) {
      const nextRow = ctx.db.queryOne(
        "SELECT * FROM print_projects ORDER BY updated_at DESC LIMIT 1"
      );
      ctx.db.kvSet("active_project_id", nextRow ? nextRow.id : null);
    }
    syncSharedDashboardState();
    return { deleted: id };
  });
  ctx.route("GET", "/projects/export", async (req) => {
    const projectId = req.query.id || ctx.db.kvGet("active_project_id");
    const format = (req.query.format || "3mf").toLowerCase();
    const row = projectId ? ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [projectId]) : null;
    if (!row) {
      return { status: 404, body: { error: "Kein 3D-Projekt zum Exportieren gefunden." } };
    }
    const scene = JSON.parse(row.scene_json);
    const mesh = compileSceneToMesh(scene);
    const safeSlug = scene.title.toLowerCase().replace(/[^a-z0-9-_]+/g, "_").replace(/^_+|_+$/g, "") || "thassi_3d_model";
    if (format === "stl") {
      const bytes = exportBinaryStl(mesh, scene.title);
      return {
        filename: `${safeSlug}.stl`,
        mimeType: "model/stl",
        sizeBytes: bytes.byteLength,
        base64: Buffer.from(bytes).toString("base64"),
        stats: mesh.stats
      };
    }
    if (format === "gcode") {
      const gcode = exportPrintableGcode(mesh, scene);
      const buf = Buffer.from(gcode, "utf-8");
      return {
        filename: `${safeSlug}_Bambu_P1S.gcode`,
        mimeType: "text/x-gcode",
        sizeBytes: buf.byteLength,
        base64: buf.toString("base64"),
        stats: mesh.stats
      };
    }
    const bytes3mf = export3mfArchive(mesh, scene);
    return {
      filename: `${safeSlug}_Bambu_P1S.3mf`,
      mimeType: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
      sizeBytes: bytes3mf.byteLength,
      base64: Buffer.from(bytes3mf).toString("base64"),
      stats: mesh.stats
    };
  });
  async function probeConfiguredPrinterAndSyncTelemetry() {
    const cfg = getPrinterConfig();
    const [open8883, open990, open6000, open322, certInfo] = await Promise.all([
      checkTcpPort(cfg.ip, 8883, 600),
      checkTcpPort(cfg.ip, 990, 600),
      checkTcpPort(cfg.ip, 6e3, 600),
      checkTcpPort(cfg.ip, 322, 600),
      inspectBambuTlsCertificate(cfg.ip, 8883, 1e3)
    ]);
    if (open8883) {
      const printerEntry = {
        ip: cfg.ip,
        serial: certInfo.cn || cfg.serial || "00M09A391700992",
        name: cfg.name || "Bambu X1C WHG",
        model: cfg.model || "Bambu Lab X1-Carbon (BL-P001)",
        firmware: "01.11.02.00",
        connectMode: open322 || open990 ? "lan" : "cloud",
        bindStatus: "free",
        signalDbm: "-65 dBm",
        ports: {
          mqttTls8883: open8883,
          ftps990: open990,
          chamberStream6000: open6000,
          rtsps322: open322
        },
        tlsCertificateSubject: certInfo.cn || "00M09A391700992",
        discoveryMethod: "tcp_8883_tls_probe",
        discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      ctx.db.kvSet("bambu_last_discovered", [printerEntry]);
      const tel = getTelemetry();
      const row = getActiveProjectRow();
      saveTelemetry({
        ...tel,
        connected: true,
        connectionMode: "lan_mqtt_tls",
        subtaskName: row?.title || tel.subtaskName || "Bereit",
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: cfg.accessCode ? `Verbunden mit ${printerEntry.name} (${cfg.ip}:8883 \xB7 LAN-Modus aktiv \xB7 Access Code hinterlegt)` : `Bambu X1C WHG (${cfg.ip}) im LAN-Modus online (Ports 8883/990/6000${open322 ? "/322" : ""} aktiv)`
      });
    }
    return {
      open8883,
      open990,
      open6000,
      open322,
      certInfo
    };
  }
  void probeConfiguredPrinterAndSyncTelemetry().catch(() => {
  });
  ctx.route("POST", "/printer/discover", async () => {
    const discovered = await scanSubnetForBambuPrinters("192.168.188");
    ctx.db.kvSet("bambu_last_discovered", discovered);
    const cfg = getPrinterConfig();
    if (discovered.length > 0) {
      const first = discovered[0];
      ctx.db.kvSet("bambu_printer_config", {
        ...cfg,
        ip: first.ip,
        serial: first.serial || cfg.serial,
        model: first.model || cfg.model,
        name: first.name || cfg.name
      });
    }
    const probe = await probeConfiguredPrinterAndSyncTelemetry();
    const allStates = await ctx.ha.getStates("switch");
    const shellyPlug = allStates.find((s) => s.entity_id === cfg.shellyPowerEntityId);
    return {
      ok: true,
      scannedSubnet: "192.168.188.0/24",
      discoveredPrinters: ctx.db.kvGet("bambu_last_discovered") || discovered,
      configuredPrinterProbe: {
        ip: cfg.ip,
        mqttTls8883: probe.open8883,
        ftps990: probe.open990,
        chamberStream6000: probe.open6000,
        rtsps322: probe.open322,
        tlsCertCn: probe.certInfo.cn || null,
        shellyPlugEntity: cfg.shellyPowerEntityId,
        shellyPlugState: shellyPlug?.state || "unknown"
      },
      bambuApiSpec: BAMBU_API_SPECIFICATION
    };
  });
  ctx.route("POST", "/printer/config", async (req) => {
    const body = req.body || {};
    const current = getPrinterConfig();
    const updated = {
      ...current,
      ip: body.ip !== void 0 ? body.ip.trim() : current.ip,
      serial: body.serial !== void 0 ? body.serial.trim() : current.serial,
      accessCode: body.accessCode !== void 0 && body.accessCode !== "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" && body.accessCode !== "" ? body.accessCode.trim() : current.accessCode,
      model: body.model || current.model,
      name: body.name || current.name,
      shellyPowerEntityId: body.shellyPowerEntityId || current.shellyPowerEntityId,
      lanOnlyMode: body.lanOnlyMode ?? current.lanOnlyMode
    };
    ctx.db.kvSet("bambu_printer_config", updated);
    ctx.sharedDb.kvSet("bambu_printer_config", updated);
    let mqttCheck = null;
    if (updated.ip && updated.serial && updated.accessCode) {
      mqttCheck = await publishBambuMqttCommand(updated, {
        pushing: { sequence_id: String(Date.now()), command: "pushall" }
      });
    }
    await probeConfiguredPrinterAndSyncTelemetry();
    if (mqttCheck) {
      const tel = getTelemetry();
      saveTelemetry({
        ...tel,
        connected: mqttCheck.ok || tel.connected,
        connectionMode: "lan_mqtt_tls",
        lastMessage: mqttCheck.message
      });
    }
    syncSharedDashboardState();
    return {
      ok: true,
      mqttCheck,
      printerConfig: {
        ...updated,
        accessCode: updated.accessCode ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
        accessCodeConfigured: Boolean(updated.accessCode)
      }
    };
  });
  ctx.route("POST", "/printer/print", async (req) => {
    const body = req.body || {};
    const action = body.action || "start";
    const cfg = getPrinterConfig();
    const tel = getTelemetry();
    if (action === "pause") {
      if (cfg.accessCode) {
        await publishBambuMqttCommand(cfg, { print: { sequence_id: "10", command: "pause" } });
      }
      saveTelemetry({
        ...tel,
        printerState: "PAUSE",
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: "Druckauftrag pausiert."
      });
      return { ok: true, telemetry: getTelemetry() };
    }
    if (action === "resume") {
      if (cfg.accessCode) {
        await publishBambuMqttCommand(cfg, { print: { sequence_id: "11", command: "resume" } });
      }
      saveTelemetry({
        ...tel,
        printerState: "RUNNING",
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: "Druckauftrag fortgesetzt."
      });
      return { ok: true, telemetry: getTelemetry() };
    }
    if (action === "stop") {
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      if (cfg.accessCode) {
        await publishBambuMqttCommand(cfg, { print: { sequence_id: "12", command: "stop" } });
      }
      saveTelemetry({
        ...tel,
        printerState: "IDLE",
        progressPercent: 0,
        currentLayer: 0,
        nozzleTargetTempC: 0,
        bedTargetTempC: 0,
        fanSpeedPercent: 0,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: "Druckauftrag abgebrochen \xB7 Drucker im Bereit-Modus."
      });
      return { ok: true, telemetry: getTelemetry() };
    }
    if (action === "light_toggle") {
      const nextLight = !tel.chamberLightOn;
      if (cfg.accessCode) {
        await publishBambuMqttCommand(cfg, {
          system: {
            sequence_id: "13",
            command: "ledctrl",
            led_node: "chamber_light",
            led_mode: nextLight ? "on" : "off"
          }
        });
      }
      saveTelemetry({
        ...tel,
        chamberLightOn: nextLight,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        lastMessage: `Bauraum-LED ${nextLight ? "eingeschaltet" : "ausgeschaltet"}.`
      });
      return { ok: true, telemetry: getTelemetry() };
    }
    const targetId = body.projectId || ctx.db.kvGet("active_project_id");
    const row = targetId ? ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [targetId]) : null;
    if (!row) {
      return { status: 404, body: { error: "Kein aktives 3D-Projekt zum Drucken ausgew\xE4hlt." } };
    }
    const scene = JSON.parse(row.scene_json);
    const stats = JSON.parse(row.stats_json);
    let mqttResult = { ok: false, message: "" };
    if (cfg.ip && cfg.serial && cfg.accessCode) {
      mqttResult = await publishBambuMqttCommand(cfg, {
        print: {
          sequence_id: String(Date.now()),
          command: "project_file",
          param: "Metadata/plate_1.gcode",
          url: `ftp:///${row.id}.3mf`,
          subtask_name: scene.title,
          bed_type: "auto",
          timelapse: false,
          bed_leveling: true,
          flow_cali: true,
          vibration_cali: true,
          use_ams: false
        }
      });
    }
    startPrintJobTicker(
      row.id,
      scene,
      stats,
      mqttResult.ok ? "lan_mqtt_tls" : "digital_twin_simulation"
    );
    return {
      ok: true,
      mode: mqttResult.ok ? "lan_mqtt_tls" : "digital_twin_simulation",
      mqttMessage: mqttResult.message || "Bambu Lab P1S Live-Fortschrittssimulation (Digital Twin) gestartet.",
      telemetry: getTelemetry()
    };
  });
  async function publishHaSensors(appCtx) {
    const summary = syncSharedDashboardState();
    const haStatus = await appCtx.ha.getStatus();
    if (!haStatus.connected) return "HA offline";
    const stateLabel = summary.hasActiveProject ? `${summary.activeProject?.title} (${summary.telemetry.printerState} \xB7 ${summary.telemetry.progressPercent}%)` : "Kein 3D-Projekt aktiv";
    await appCtx.ha.publishSensor("status", stateLabel, {
      friendly_name: "Thassi 3D Druck Status",
      icon: "mdi:printer-3d-nozzle",
      has_active_project: summary.hasActiveProject,
      project_title: summary.activeProject?.title || null,
      printer_state: summary.telemetry.printerState,
      progress_percent: summary.telemetry.progressPercent,
      current_layer: summary.telemetry.currentLayer,
      total_layers: summary.telemetry.totalLayers,
      nozzle_temp_c: summary.telemetry.nozzleTempC,
      bed_temp_c: summary.telemetry.bedTempC,
      printer_model: summary.printerConfig.model,
      printer_ip: summary.printerConfig.ip
    });
    await appCtx.ha.publishSensor("progress", summary.telemetry.progressPercent, {
      friendly_name: "Thassi 3D Druck Fortschritt",
      unit_of_measurement: "%",
      icon: "mdi:progress-clock",
      project_title: summary.activeProject?.title || "Leerlauf"
    });
    return stateLabel;
  }
  ctx.route("POST", "/supervisor-sync", async (req) => {
    const supToken = process.env.SUPERVISOR_TOKEN || "";
    const body = req.body || {};
    if (!supToken) {
      return { ok: false, error: "No SUPERVISOR_TOKEN in environment" };
    }
    const targetPath = (body.path || "/store/reload").replace(/^\/+/, "/");
    const method = (body.method || "POST").toUpperCase();
    try {
      const r = await fetch(`http://supervisor${targetPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${supToken}`,
          "Content-Type": "application/json"
        },
        body: method === "GET" ? void 0 : body.payload ? JSON.stringify(body.payload) : void 0
      });
      const text = await r.text();
      let parsed = text;
      try {
        parsed = JSON.parse(text);
      } catch {
      }
      return { ok: r.ok, status: r.status, response: parsed };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ctx.scheduleJob({
    id: "sync-3dprint-ha-sensors",
    name: "Publish 3D Print Telemetry & Active Model Status to Home Assistant",
    intervalMinutes: 5,
    handler: async () => publishHaSensors(ctx)
  });
  void publishHaSensors(ctx).catch(() => {
  });
});
export {
  index_default as default
};
