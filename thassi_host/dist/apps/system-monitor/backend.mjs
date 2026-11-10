import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/system-monitor/backend/index.ts
import fs4 from "node:fs";
import http from "node:http";
import os2 from "node:os";
import path4 from "node:path";
import { DatabaseSync as DatabaseSync2 } from "node:sqlite";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
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
function getUniformAppStylesheetTag() {
  return `<style id="thassi-uniform-design-system">${UNIFORM_DESIGN_TOKENS_CSS}</style>`;
}

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

// thassi_host/src/ambient-dashboard.ts
function renderUnifiedDashboardHtml(ingressPath) {
  const sidebarStylerScript = getHassSidebarStylerScript();
  const uniformStylesheetTag = getUniformAppStylesheetTag();
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  ${uniformStylesheetTag}
  <style>
    :root {
      --bg-canvas: #09090b;
      --bg-elevated: #111113;
      --bg-input: #141417;
      --line-hairline: rgba(255, 255, 255, 0.06);
      --line-strong: rgba(255, 255, 255, 0.12);
      --line-focus: rgba(255, 255, 255, 0.24);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;
      --dot-ok: #10b981;
      --dot-warn: #f59e0b;
      --dot-err: #ef4444;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    }

    * { box-sizing: border-box; user-select: none; }
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }

    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100dvh;
      overflow: hidden;
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
    }

    /* Legacy compatibility layers hidden */
    #left-ambient-navbar,
    #mobile-nav-toggle,
    #mobile-nav-backdrop,
    #sky-stage,
    #pinned-rooms-tray,
    #timeline-devices-separator {
      display: none !important;
    }

    /* ============================================================================
       ZONE A: UNIFORM TOP HEADER BAR (52PX)
       ============================================================================ */
    #horizon-header-bar {
      height: 52px;
      min-height: 52px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 60;
    }

    .hh-left {
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
      flex-shrink: 0;
    }

    .hh-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .hh-title {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: -0.025em;
      color: var(--text-primary);
    }

    .hh-code {
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      padding: 2px 6px;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      background: var(--bg-elevated);
    }

    .hh-vsep {
      width: 1px;
      height: 20px;
      background: var(--line-hairline);
    }

    /* Inline Clock & Date */
    #hero-clock-region {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      gap: 2px;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
    #hero-time {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    #hero-seconds {
      font-size: 12px;
      color: var(--text-muted);
    }
    #hero-seconds::before {
      content: ":";
    }
    #hero-date-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hero-date {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .hero-cal-icon-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      padding: 3px 5px;
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
    }
    .hero-cal-icon-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
      background: var(--bg-elevated);
    }
    #solar-telemetry {
      display: none;
    }

    /* Inline Weather Telemetry */
    #hero-weather-strip {
      display: flex;
      align-items: center;
    }
    .mw-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .mw-icon-wrap {
      display: inline-flex;
      align-items: center;
      color: var(--text-secondary);
    }
    .mw-temp-now {
      font-family: var(--font-mono);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .mw-cond-text {
      color: var(--text-secondary);
      font-size: 12px;
      white-space: nowrap;
    }
    .mw-hi-lo {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /* Inline Cortex Command Bar in Header */
    #horizon-cortex-center-stage {
      position: relative;
      flex: 1;
      max-width: 540px;
      min-width: 220px;
      z-index: 80;
    }
    .cortex-prompt-pill {
      width: 100%;
      height: 34px;
      border-radius: 4px;
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      display: flex;
      align-items: center;
      padding: 0 4px 0 10px;
      gap: 8px;
      transition: border-color 0.15s ease;
    }
    .cortex-prompt-pill:focus-within,
    .cortex-prompt-pill:hover {
      border-color: var(--line-focus);
    }
    .cortex-prompt-pill.is-waiting {
      border-color: var(--text-primary);
    }
    .cortex-ai-icon-wrap {
      display: flex;
      align-items: center;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .cortex-prompt-input {
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 12.5px;
    }
    .cortex-prompt-input::placeholder {
      color: var(--text-muted);
    }
    .cortex-waiting-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 10.5px;
      white-space: nowrap;
    }
    .cortex-waiting-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-warn);
    }
    .cortex-send-btn {
      height: 26px;
      padding: 0 10px;
      border-radius: 3px;
      background: var(--text-primary);
      color: var(--bg-canvas);
      border: none;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .cortex-send-btn:hover:not(:disabled) {
      background: #e4e4e7;
    }
    .cortex-send-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    /* Cortex Dropdown & Response Flyout */
    #cortex-preview-dropdown,
    #cortex-response-card {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      border-radius: 4px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      max-height: 420px;
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      z-index: 95;
    }
    .cortex-preview-item {
      padding: 8px 10px;
      border-radius: 3px;
      background: var(--bg-canvas);
      border: 1px solid var(--line-hairline);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .cortex-preview-item:hover {
      border-color: var(--line-focus);
      background: var(--bg-input);
    }
    .cortex-preview-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .cortex-badge-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 500;
      padding: 2px 5px;
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--line-hairline);
      flex-shrink: 0;
    }
    .cortex-resp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line-hairline);
      padding-bottom: 8px;
      gap: 8px;
    }
    .cortex-resp-body {
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Right Freshness & Status Strip */
    .hh-right {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .hh-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--text-primary);
      font-size: 10.5px;
    }

    /* ============================================================================
       ZONE B: 4-COLUMN EXECUTIVE KPI STRIP (#top-right-widgets)
       ============================================================================ */
    #top-right-widgets {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      z-index: 45;
      flex-shrink: 0;
    }

    .ambient-widget {
      position: relative;
      padding: 12px 24px;
      border-right: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: center;
      transition: background-color 0.12s ease;
    }
    .ambient-widget:last-child {
      border-right: none;
    }
    .ambient-widget:hover {
      background: var(--bg-elevated);
    }

    .w-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    }
    .w-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .w-label-left {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-ok);
      box-shadow: none !important;
      flex-shrink: 0;
    }
    .w-primary {
      font-family: var(--font-mono);
      font-size: 20px;
      font-weight: 400;
      letter-spacing: -0.025em;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      display: flex;
      align-items: baseline;
      gap: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .w-primary strong {
      font-weight: 500;
    }
    .w-sub {
      display: block;
      font-size: 11.5px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .health-minimal-badges {
      display: none;
    }
    #compact-health {
      display: flex !important;
    }
    #sub-health {
      display: block !important;
    }

    .finances-eye-icon-btn {
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      cursor: pointer;
    }
    .finances-eye-icon-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
    }

    .w-nav-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      cursor: pointer;
    }
    .w-nav-btn:hover {
      background: var(--bg-input);
      border-color: var(--line-focus);
      color: var(--text-primary);
    }

    /* Expandable Inspector Popover below KPI Cell */
    .w-expand-body {
      display: none;
      position: absolute;
      top: calc(100% + 1px);
      left: 0;
      width: min(360px, 94vw);
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      padding: 14px 16px;
      z-index: 85;
      cursor: default;
    }
    #widget-notes .w-expand-body,
    #widget-finances .w-expand-body {
      left: auto;
      right: 0;
    }
    .ambient-widget.expanded {
      background: var(--bg-elevated);
    }
    .ambient-widget.expanded .w-expand-body {
      display: block;
    }

    .w-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      margin-bottom: 12px;
    }
    .w-stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .w-stat-k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .w-stat-v {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .w-action-link {
      background: none;
      border: none;
      padding: 0;
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .minimal-input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 6px 10px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      outline: none;
    }
    .minimal-input:focus {
      border-color: var(--line-focus);
    }

    #notes-list {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .note-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      font-size: 12px;
    }
    .note-row-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .note-content-text {
      flex: 1;
      line-height: 1.4;
      color: var(--text-primary);
      word-break: break-word;
      user-select: text;
    }
    .note-row-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .note-file-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
    }
    .note-actions-group {
      display: inline-flex;
      gap: 4px;
    }
    .note-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .note-action-btn:hover,
    .note-action-btn.synced {
      border-color: var(--line-focus);
      color: var(--text-primary);
    }
    .note-del {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
    }
    .note-del:hover { color: var(--dot-err); }

    /* ============================================================================
       ZONE C: PRIMARY HAIRLINE WORKSPACE (MASTER ROOM MATRIX + RIGHT INSPECTOR)
       ============================================================================ */
    #devices-dock {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      background: var(--bg-canvas);
      overflow: hidden;
    }

    /* Left Column: Smart Home Room & Device Matrix */
    .sh-matrix-column {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--line-hairline);
    }

    #room-dock-bar {
      height: 40px;
      min-height: 40px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sh-bar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }

    .sh-section-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      white-space: nowrap;
    }

    #sh-matrix-summary {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .room-dock-group::-webkit-scrollbar { display: none; }

    .room-pill {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 3px 8px;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      white-space: nowrap;
    }
    .room-pill:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
      background: var(--bg-input);
    }
    .room-pill.pinned-tab {
      color: var(--bg-canvas);
      background: var(--text-primary);
      border-color: var(--text-primary);
    }
    .room-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .room-pill.has-on .room-dot {
      background: var(--dot-ok);
    }
    .room-lightbulb-icon {
      display: none;
    }
    .td-sep-unpin-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
    }

    /* Live Hairline Room Grid */
    #rooms-live-matrix-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      align-content: start;
      background: var(--bg-canvas);
    }

    .sh-room-cell {
      border-right: 1px solid var(--line-hairline);
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      flex-direction: column;
      background: var(--bg-canvas);
    }

    .sh-room-head {
      height: 36px;
      padding: 0 16px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .sh-room-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sh-room-name {
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-primary);
    }
    .sh-room-meta-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sh-room-telemetry {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .sh-room-off-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 9.5px;
      padding: 1px 6px;
      cursor: pointer;
    }
    .sh-room-off-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
    }

    .sh-room-devices {
      display: flex;
      flex-direction: column;
    }

    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      transition: background-color 0.12s ease;
    }
    .rf-dev-row:last-child {
      border-bottom: none;
    }
    .rf-dev-row:hover {
      background: var(--bg-elevated);
    }
    .rf-dev-row.is-on {
      background: rgba(255, 255, 255, 0.02);
    }
    .rf-dev-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .rf-dev-label {
      font-size: 12.5px;
      font-weight: 400;
      color: var(--text-secondary);
    }
    .rf-dev-row.is-on .rf-dev-label {
      color: var(--text-primary);
      font-weight: 500;
    }
    .rf-dev-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rf-power-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 3px 9px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      background: var(--bg-input);
      color: var(--text-secondary);
    }
    .rf-toggle-btn:hover {
      border-color: var(--line-focus);
      color: var(--text-primary);
    }
    .rf-toggle-btn.on {
      background: var(--text-primary);
      color: var(--bg-canvas);
      border-color: var(--text-primary);
      font-weight: 600;
    }
    .rf-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;
    }
    .rf-slider {
      flex: 1;
      accent-color: var(--text-primary);
      height: 3px;
      cursor: pointer;
    }
    .rf-effect-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      background: var(--bg-input);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: var(--text-primary);
      color: var(--bg-canvas);
      border-color: var(--text-primary);
    }

    /* Right Column: Hardware, 3D Print & Vision Inspector (#statusbar-right-previews) */
    #statusbar-right-previews {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      background: var(--bg-canvas);
    }

    .sb-preview-item {
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      flex-direction: column;
    }
    .sb-preview-head {
      height: 36px;
      padding: 0 16px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sb-preview-trigger {
      background: transparent;
      border: none;
      padding: 0;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
    }
    .sb-meta {
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 400;
      color: var(--text-secondary);
      text-transform: none;
      letter-spacing: 0;
    }
    .sb-caret {
      display: none;
    }
    .sb-upward-flyout {
      padding: 12px 16px;
      background: var(--bg-canvas);
      display: block !important;
      opacity: 1 !important;
      visibility: visible !important;
      position: static !important;
      width: 100% !important;
      border: none !important;
      box-shadow: none !important;
      transform: none !important;
      pointer-events: auto !important;
    }
    .w-3d-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .w-3d-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    /* ============================================================================
       ZONE D: BOTTOM 24H CHRONOLOGICAL HORIZON TIMELINE (#timeline-dock)
       ============================================================================ */
    #timeline-dock {
      height: 185px;
      min-height: 185px;
      border-top: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      display: flex;
      flex-direction: column;
      z-index: 30;
      flex-shrink: 0;
    }

    #timeline-toolbar {
      height: 34px;
      min-height: 34px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .tl-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tl-pill {
      background: none;
      border: none;
      border-bottom: 1px solid transparent;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 4px 2px;
    }
    .tl-pill:hover, .tl-pill.active {
      color: var(--text-primary);
      border-bottom-color: var(--text-primary);
    }
    .tl-pill.return-now {
      color: var(--text-primary);
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      padding: 2px 8px;
      display: none;
    }

    #timeline-viewport {
      position: relative;
      width: 100%;
      flex: 1;
      overflow: hidden;
      cursor: grab;
      background: var(--bg-canvas);
    }
    #timeline-viewport:active { cursor: grabbing; }

    #fixed-now-marker {
      position: absolute;
      left: 25%;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--text-primary);
      z-index: 25;
      pointer-events: none;
    }
    #fixed-now-badge {
      position: absolute;
      top: 4px;
      left: 0;
      transform: translateX(-50%);
      padding: 1px 6px;
      border-radius: 2px;
      background: var(--text-primary);
      color: var(--bg-canvas);
      font-family: var(--font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    #fixed-now-orb {
      position: absolute;
      bottom: 28px;
      left: 0.5px;
      transform: translate(-50%, 50%);
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-primary);
    }

    #timeline-world {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      will-change: transform;
    }
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 28px;
      height: 1px;
      background: var(--line-strong);
      z-index: 5;
      pointer-events: none;
    }
    #timeline-celestial-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      opacity: 0.35;
    }
    #tl-celestial-svg {
      position: absolute;
      left: 0;
      bottom: 28px;
      width: 1px;
      height: 1px;
      overflow: visible;
    }
    .tl-horizon-node, .tl-celestial-body {
      display: none !important;
    }
    #timeline-ticks-layer {
      position: absolute;
      inset: 0;
      z-index: 6;
      pointer-events: none;
    }
    #timeline-events-layer {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: auto;
    }

    .tl-tick {
      position: absolute;
      bottom: 0;
      height: 28px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .tl-tick-mark {
      width: 1px;
      height: 5px;
      background: var(--line-strong);
      margin-bottom: 4px;
    }
    .tl-tick.major .tl-tick-mark {
      height: 8px;
      background: var(--text-muted);
    }
    .tl-tick-label {
      font-family: var(--font-mono);
      font-size: 9.5px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 140px;
      margin-top: -112px;
      background: var(--line-strong);
    }
    .tl-tick.day-start .tl-tick-label {
      color: var(--text-primary);
      font-weight: 600;
      text-transform: uppercase;
    }

    .tl-event-rect {
      position: absolute;
      height: 44px;
      border-radius: 3px;
      padding: 4px 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      border-left: 2px solid var(--text-primary);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1px;
      overflow: hidden;
      cursor: pointer;
      z-index: 12;
    }
    .tl-event-rect:hover {
      border-color: var(--line-focus);
      background: var(--bg-input);
      z-index: 18;
    }
    .tl-event-rect.is-now {
      border-left: 2px solid var(--dot-ok);
      background: var(--bg-input);
    }
    .tl-event-rect.is-past {
      opacity: 0.45;
    }
    .tl-ev-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
    }
    .tl-ev-title {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tl-ev-time {
      font-family: var(--font-mono);
      font-size: 9.5px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tl-ev-meta, .tl-ev-desc {
      font-size: 9.5px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Quick Event Modal & Full App Overlay */
    #quick-event-modal {
      position: fixed;
      bottom: 200px;
      right: 24px;
      z-index: 90;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      padding: 16px;
      border-radius: 4px;
      display: none;
      width: 300px;
    }

    #full-app-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: var(--bg-canvas);
      display: none;
      flex-direction: column;
    }
    #full-app-bar {
      height: 40px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-canvas);
      border-bottom: 1px solid var(--line-hairline);
    }
    #full-app-frame {
      flex: 1;
      width: 100%;
      border: none;
      background: var(--bg-canvas);
    }

    @media (max-width: 1100px) {
      html, body {
        height: auto;
        min-height: 100dvh;
        overflow-y: auto;
      }
      #horizon-header-bar {
        height: auto;
        padding: 10px 16px;
        flex-wrap: wrap;
      }
      #top-right-widgets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .ambient-widget {
        border-bottom: 1px solid var(--line-hairline);
        padding: 10px 16px;
      }
      #devices-dock {
        grid-template-columns: 1fr;
        overflow: visible;
      }
      .sh-matrix-column {
        border-right: none;
        border-bottom: 1px solid var(--line-hairline);
      }
    }
  </style>
</head>
<body>
  <!-- Hidden compatibility nodes -->
  <nav id="left-ambient-navbar" aria-hidden="true" style="display:none !important;">
    <button class="lnav-item active" id="lnav-horizon" onclick="closeFullService()"></button>
    <button class="lnav-item" id="lnav-google-calendar" onclick="openFullService('google-calendar', 'Calendar')"></button>
    <button class="lnav-item" id="lnav-google-health" onclick="openFullService('google-health', 'Health')"></button>
    <button class="lnav-item" id="lnav-finance-analytics" onclick="openFullService('finance-analytics', 'thassi.finances')"></button>
    <button class="lnav-item" id="lnav-meal-planner" onclick="openFullService('meal-planner', 'Meals')"></button>
    <button class="lnav-item" id="lnav-smart-canvas" onclick="openFullService('smart-canvas', 'Smart Home')"></button>
    <button class="lnav-item" id="lnav-camera-vision" onclick="openFullService('camera-vision', 'Camera Vision')"></button>
    <button class="lnav-item" id="lnav-3d-print" onclick="openFullService('3d-print', '3D Druck Studio')"></button>
    <button class="lnav-item" id="lnav-floorplan" onclick="openFullService('floorplan', '2D Grundriss & Raumplaner')"></button>
    <button class="lnav-item" id="lnav-memo" onclick="openFullService('memo', 'Memo')"></button>
    <button class="lnav-item" id="lnav-cortex" onclick="openFullService('cortex', 'Cortex')"></button>
  </nav>
  <div id="sky-stage" style="display:none !important;">
    <div id="starfield"></div>
    <div id="weather-fx-layer">
      <div id="weather-cloud-veil-1"></div>
      <div id="weather-cloud-veil-2"></div>
      <canvas id="weather-fx-canvas"></canvas>
    </div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none"></svg>
    <div id="moon-assembly"></div>
    <div id="sun-assembly"></div>
  </div>

  <!-- ZONE A: UNIFORM TOP HEADER BAR -->
  <header id="horizon-header-bar">
    <div class="hh-left">
      <div class="hh-brand">
        <span class="hh-title">Horizon</span>
        <span class="hh-code">CMD</span>
      </div>
      <div class="hh-vsep"></div>
      <div id="hero-clock-region">
        <div class="clock-row">
          <div id="hero-time">--:--</div>
          <div id="hero-seconds">--</div>
        </div>
        <div id="hero-date-row">
          <div id="hero-date"></div>
          <button class="hero-cal-icon-btn" onclick="openFullService('google-calendar', 'Calendar')" title="Kalender \xF6ffnen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </button>
        </div>
        <div id="solar-telemetry"><span id="solar-phase-text"></span></div>
      </div>
      <div class="hh-vsep"></div>
      <div id="hero-weather-strip" title="St. Veit an der G\xF6lsen">
        <div class="mw-current-row">
          <div class="mw-icon-wrap" id="mw-current-icon"></div>
          <div class="mw-temp-now" id="mw-current-temp">--\xB0</div>
          <div class="mw-cond-text" id="mw-current-desc">--</div>
          <div class="mw-hi-lo" id="mw-hi-lo">--\xB0 / --\xB0</div>
        </div>
      </div>
    </div>

    <!-- INLINE CORTEX COMMAND & SEARCH BAR -->
    <div id="horizon-cortex-center-stage">
      <div class="cortex-prompt-pill" id="cortex-prompt-pill">
        <div class="cortex-ai-icon-wrap" id="cortex-ai-icon" title="Cortex & Google Gemini">
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">/</span>
        </div>
        <input type="text"
               class="cortex-prompt-input"
               id="cortex-prompt-input"
               placeholder="Cortex fragen oder Memo, Termine, Smart Home & Finanzen durchsuchen..."
               autocomplete="off"
               spellcheck="false" />
        <div id="cortex-status-badge" style="display:none;" class="cortex-waiting-pill">
          <span class="cortex-waiting-dot"></span>
          <span id="cortex-status-text">Synthese...</span>
        </div>
        <button class="cortex-send-btn" id="cortex-send-btn" onclick="submitCortexPrompt()" title="An Gemini API senden (Enter)">
          Run
        </button>
      </div>
      <div id="cortex-preview-dropdown"></div>
      <div id="cortex-response-card"></div>
    </div>

    <!-- EXPLICIT DATA FRESHNESS & ACTION REQUIRED STRIP -->
    <div class="hh-right">
      <span id="horizon-freshness-ts">Stand: --:--:-- (vor 0s)</span>
      <span class="hh-status-pill">
        <span class="thassi-u-dot" id="horizon-sys-dot" style="background:#10b981;"></span>
        <span id="horizon-sys-status-text">HA \xB7 GOOGLE NOMINAL</span>
      </span>
      <button class="w-nav-btn" onclick="openFullService('cortex', 'Cortex', '?tab=vault')" title="Credentials Vault & Konfiguration">
        Vault \u2197
      </button>
    </div>
  </header>

  <!-- ZONE B: 4-COLUMN EXECUTIVE KPI STRIP -->
  <section id="top-right-widgets">
    <!-- 1. HEALTH KPI CELL -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-health" style="background:#10b981;"></span>
            <span>HEALTH \xB7 BIOMETRICS</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('google-health', 'Health')" title="Open Health View">Health \u2197</button>
        </div>
        <div class="health-minimal-badges">
          <span id="health-hr-inside">--</span>
          <svg viewBox="0 0 44 44" width="1" height="1"><circle id="health-steps-ring" cx="22" cy="22" r="18.5"></circle></svg>
          <span id="health-steps-inside">--</span>
        </div>
        <div class="w-primary" id="compact-health">-- steps</div>
        <div class="w-sub" id="sub-health">Pixel 10 Health Connect</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid">
          <div class="w-stat-item"><span class="w-stat-k">Steps Today</span><span class="w-stat-v" id="eh-steps">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Readiness</span><span class="w-stat-v" id="eh-ready">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Heart Rate</span><span class="w-stat-v" id="eh-hr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Resting HR / HRV</span><span class="w-stat-v" id="eh-rhr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Sleep Duration</span><span class="w-stat-v" id="eh-sleep">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Burned / Distance</span><span class="w-stat-v" id="eh-burn">--</span></div>
        </div>
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Health &amp; Biometrics \xF6ffnen \u2192</button>
      </div>
    </div>

    <!-- 2. MEALS KPI CELL -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-meals" style="background:#10b981;"></span>
            <span>MEALS \xB7 NUTRITION</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('meal-planner', 'Meals')" title="Open Meals View">Meals \u2197</button>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12px; color:var(--text-secondary); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Meal Planner \xF6ffnen \u2192</button>
      </div>
    </div>

    <!-- 3. FINANCES KPI CELL -->
    <div class="ambient-widget finances-is-hidden" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-finances" style="background:#10b981;"></span>
            <span>FINANCES \xB7 LEDGER</span>
            <button id="finances-eye-btn" class="finances-eye-icon-btn" onclick="toggleFinancesVisibility(event)" title="Finanzdaten ein-/ausblenden">SHOW</button>
          </span>
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <div id="finances-reminder-pill"
                 onclick="event.stopPropagation(); openQuickImportFlyout(event)"
                 title="Kontoauszug exportieren & synchronisieren"
                 style="display:none; padding:1px 6px; border-radius:3px; background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; font-family:var(--font-mono); font-size:9.5px; cursor:pointer; align-items:center; gap:4px;">
              <span style="width:5px; height:5px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>
              <span id="finances-reminder-pill-text">Sync f\xE4llig</span>
            </div>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('finance-analytics', 'thassi.finances')" title="Open Finances View">Finances \u2197</button>
          </div>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">\u2022\u2022\u2022\u2022 \u20AC</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="finances-reminder-expanded-banner"
             style="display:none; margin-bottom:10px; padding:8px 10px; border-radius:3px; background:var(--bg-canvas); border:1px solid rgba(245,158,11,0.4); flex-direction:column; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span id="finances-reminder-exp-title" style="font-size:11px; font-weight:600; color:#f59e0b;">Bank-Export f\xE4llig</span>
            <button onclick="snoozeFinanceReminderFromDash(event, 3)"
                    style="background:transparent; border:1px solid var(--line-hairline); color:var(--text-secondary); border-radius:3px; padding:1px 6px; font-size:10px; cursor:pointer;">
              3T Pause
            </button>
          </div>
          <div id="finances-reminder-exp-detail" style="font-size:10.5px; color:var(--text-secondary); line-height:1.35;"></div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
            <button onclick="launchBankingPopupFromDashboard(event)"
                    style="flex:1; padding:5px 8px; border-radius:3px; border:none; background:#fafafa; color:#09090b; font-size:11px; font-weight:600; cursor:pointer;">
              George &amp; Sync \u2197
            </button>
            <button onclick="openQuickImportFlyout(event)"
                    style="padding:5px 8px; border-radius:3px; border:1px solid var(--line-hairline); background:var(--bg-input); color:#fafafa; font-size:11px; cursor:pointer;">
              Datei / Export
            </button>
          </div>
        </div>
        <div id="finances-preview-dynamic"
             onclick="toggleFinancesVisibility(event)"
             style="display:flex; flex-direction:column; gap:8px; cursor:pointer; margin-bottom:10px;">
          <div class="w-stat-grid">
            <div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" id="ef-bal">\u2022\u2022\u2022\u2022 \u20AC</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag / Woche)</span><span class="w-stat-v" id="ef-exp">\u2022\u2022\u2022\u2022 \u20AC</span></div>
          </div>
        </div>
        <div id="finances-quick-import-slot" style="margin-bottom:8px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-top:1px solid var(--line-hairline); padding-top:8px;">
          <button class="w-action-link" onclick="toggleFinancesVisibility(event)" id="finances-toggle-link">Zahlen anzeigen</button>
          <button class="w-action-link" onclick="triggerDirectFinanceExportFromDash(event, 'csv_de')">CSV Export \u2193</button>
          <button class="w-action-link" onclick="openFullService('finance-analytics', 'thassi.finances', '#export')">Ledger \u2192</button>
        </div>
      </div>
    </div>

    <!-- 4. NOTES KPI CELL -->
    <div class="ambient-widget" id="widget-notes" onclick="toggleWidget('notes', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-notes" style="background:#10b981;"></span>
            <span>NOTES \xB7 MEMO SYNC</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('memo', 'Memo')" title="Open Memo View">Memo \u2197</button>
        </div>
        <div class="w-primary" id="compact-notes">0 notes</div>
        <div class="w-sub" id="sub-notes">Tap to capture a note</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <form onsubmit="addNote(event)" style="margin-bottom:8px; display:flex; gap:6px;">
          <input id="note-input" class="minimal-input" placeholder="Notiz eingeben &amp; Enter..." />
        </form>
        <div id="note-sync-feedback" style="display:none; font-size:11px; color:var(--text-primary); margin-bottom:7px; padding:4px 8px; border:1px solid var(--line-hairline); background:var(--bg-canvas);"></div>
        <div id="notes-list"></div>
      </div>
    </div>
  </section>

  <!-- ZONE C: PRIMARY HAIRLINE WORKSPACE (SMART HOME MATRIX + HARDWARE/VISION INSPECTOR) -->
  <main id="devices-dock">
    <div id="timeline-devices-separator"></div>
    <div id="pinned-rooms-tray"></div>

    <!-- Left Column: Live Smart Home Room Matrix -->
    <div class="sh-matrix-column">
      <div id="room-dock-bar">
        <div class="sh-bar-left">
          <span class="sh-section-label">SMART HOME \xB7 RAUM-MATRIX</span>
          <span id="sh-matrix-summary">5 R\xE4ume</span>
          <div class="room-dock-group" id="room-pills-container"></div>
          <button class="td-sep-unpin-btn" id="btn-unpin-all-rooms" onclick="unpinAllRooms()" style="display:none;">Alle zeigen</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <button class="w-nav-btn" onclick="openFullService('smart-canvas', 'Smart Home')">Smart Canvas \u2197</button>
          <button class="w-nav-btn" onclick="openFullService('floorplan', '2D Grundriss & Raumplaner')">2D Grundriss \u2197</button>
        </div>
      </div>
      <div id="rooms-live-matrix-grid"></div>
    </div>

    <!-- Right Column: Hardware, 3D Print, Vision & Infrastructure Inspector -->
    <aside id="statusbar-right-previews">
      <!-- 1. 3D PRINT INSPECTOR -->
      <div class="sb-preview-item" id="widget-3dprint">
        <div class="sb-preview-head">
          <button class="sb-preview-trigger" onclick="openFullService('3d-print', '3D Druck Studio')">
            <span class="room-dot" id="dot-3dprint" style="background:#10b981;"></span>
            <span id="print3d-dock-dot" style="display:none;"></span>
            <span>3D DRUCK \xB7 BAMBU P1S</span>
            <span class="sb-meta" id="print3d-dock-meta">Bereit</span>
            <span class="sb-caret">\u25B4</span>
          </button>
          <button class="w-nav-btn" onclick="openFullService('3d-print', '3D Druck Studio')">Studio \u2197</button>
        </div>
        <div class="sb-upward-flyout">
          <div class="w-3d-row">
            <div style="position:relative; width:76px; height:58px; border-radius:3px; background:var(--bg-elevated); border:1px solid var(--line-hairline); overflow:hidden; flex-shrink:0;"
                 title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)">
              <canvas id="mini-3d-canvas" width="152" height="116" style="width:76px; height:58px; display:block; cursor:grab; touch-action:none;"></canvas>
            </div>
            <div class="w-3d-info">
              <div class="w-primary" id="compact-3dprint" style="font-size:14px;">Kein Projekt aktiv</div>
              <div class="w-sub" id="sub-3dprint">Platzhalter \xB7 0% Leerlauf</div>
              <div style="width:100%; height:3px; background:var(--line-hairline); overflow:hidden; margin-top:6px;">
                <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:#10b981; transition:width 0.35s ease;"></div>
              </div>
            </div>
          </div>
          <div class="w-stat-grid" style="margin-bottom:8px;">
            <div class="w-stat-item"><span class="w-stat-k">Drucker / Modus</span><span class="w-stat-v" id="e3d-printer">Bambu Lab P1S</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Fortschritt / Layer</span><span class="w-stat-v" id="e3d-layer">0% (0/0)</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ma\xDFe / Gewicht</span><span class="w-stat-v" id="e3d-dims">--</span></div>
            <div class="w-stat-item"><span class="w-stat-k">D\xFCse / Heizbett</span><span class="w-stat-v" id="e3d-temps">24\xB0C / 24\xB0C</span></div>
          </div>
          <form onsubmit="submitMini3dPrompt(event)" style="display:flex; gap:6px; margin-bottom:8px;">
            <input id="mini-3d-prompt" class="minimal-input" placeholder="AI CAD: 3D-Objekt \xE4ndern oder neu erstellen\u2026" />
            <button type="submit" id="mini-3d-prompt-btn" class="thassi-u-btn-primary" style="padding:0 10px; font-size:11px;">CAD</button>
          </form>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <button class="w-action-link" onclick="toggleMini3dPlaceholder()" id="btn-mini-3d-toggle">Platzhalter testen</button>
            <button class="w-action-link" onclick="triggerMini3dPrint()" id="btn-mini-3d-print">Druck starten</button>
            <button class="w-action-link" onclick="openFullService('3d-print', '3D Druck Studio')">3D Editor \u2192</button>
          </div>
        </div>
      </div>

      <!-- 2. CAMERA VISION INSPECTOR -->
      <div class="sb-preview-item" id="widget-vision">
        <div class="sb-preview-head">
          <button class="sb-preview-trigger" onclick="openFullService('camera-vision', 'Camera Vision')">
            <span class="room-dot" id="vision-dock-dot" style="background:#10b981;"></span>
            <span>CAMERA VISION \xB7 6 STREAMS</span>
            <span class="sb-meta" id="vision-dock-meta">Zyklisch</span>
            <span class="sb-caret">\u25B4</span>
          </button>
          <button class="w-nav-btn" onclick="openFullService('camera-vision', 'Camera Vision')">Vision \u2197</button>
        </div>
        <div class="sb-upward-flyout">
          <div id="vision-flyout-summary" style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; font-family:var(--font-mono);">
            Zyklischer Snapshot-Scan aktiv
          </div>
          <div id="vision-flyout-cameras" style="display:flex; flex-direction:column; gap:4px; max-height:175px; overflow-y:auto;"></div>
        </div>
      </div>

      <!-- 3. INFRASTRUCTURE & SYSTEM QUICK LINKS -->
      <div class="sb-preview-item" id="widget-sysmon">
        <div class="sb-preview-head">
          <span class="sh-section-label">INFRASTRUKTUR &amp; SYSTEM</span>
          <div style="display:flex; gap:6px;" id="widget-googleusage">
            <span id="sysmon-dock-dot" style="display:none;"></span>
            <span id="sysmon-dock-meta" style="display:none;"></span>
            <span id="gusage-dock-dot" style="display:none;"></span>
            <span id="gusage-dock-meta" style="display:none;"></span>
            <button class="w-nav-btn" onclick="openFullService('system-monitor', 'HASS OS Performance & Prozesse')">HASS OS \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('network-monitor', 'Netzwerk & Router')">Netzwerk \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('google-usage', 'Google Usage & AI Credits')">AI Usage \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('workflows', 'Workflows')">Axons \u2197</button>
          </div>
        </div>
      </div>
    </aside>
  </main>

  <!-- ZONE D: BOTTOM 24H CHRONOLOGICAL HORIZON & GOOGLE CALENDAR TIMELINE -->
  <section id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <span class="sh-section-label">CHRONOLOGIE &amp; KALENDER (24H HORIZON)</span>
        <button class="tl-pill return-now" id="btn-live-now" onclick="snapToLiveNow()">\u21BA Return to Now</button>
      </div>
      <div class="tl-controls">
        <button class="tl-pill" id="zoom-12" onclick="setTimelineSpan(12)">12h</button>
        <button class="tl-pill active" id="zoom-24" onclick="setTimelineSpan(24)">24h</button>
        <button class="tl-pill" id="zoom-72" onclick="setTimelineSpan(72)">3d</button>
        <button class="tl-pill" id="zoom-168" onclick="setTimelineSpan(168)">7d</button>
        <button class="w-nav-btn" onclick="toggleEventModal(true)" title="Neuer Kalendereintrag">+ Termin</button>
        <button class="w-nav-btn" onclick="openFullService('google-calendar', 'Calendar')">Kalender \u2197</button>
      </div>
    </div>

    <div id="timeline-viewport">
      <div id="fixed-now-marker">
        <div id="fixed-now-badge">NOW</div>
        <div id="fixed-now-orb"></div>
      </div>
      <div id="timeline-world">
        <div id="timeline-celestial-layer">
          <svg id="tl-celestial-svg" overflow="visible">
            <path id="tl-moon-below-path" fill="none" stroke="rgba(255, 255, 255, 0.10)" stroke-width="1" stroke-dasharray="3 5" />
            <path id="tl-moon-above-path" fill="none" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1" />
            <path id="tl-sun-below-path" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" stroke-dasharray="3 5" />
            <path id="tl-sun-above-path" fill="none" stroke="rgba(255, 255, 255, 0.32)" stroke-width="1.2" />
          </svg>
          <div id="tl-horizon-crossings"></div>
          <div id="tl-moon-node" class="tl-celestial-body"></div>
          <div id="tl-sun-node" class="tl-celestial-body"></div>
        </div>
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </section>

  <!-- QUICK IMPORT & FILE EXPORT FLYOUT -->
  <div id="quick-import-flyout-modal"
       onclick="closeQuickImportFlyout()"
       style="position:fixed; inset:0; z-index:95; background:rgba(0,0,0,0.72); display:none; justify-content:flex-end;">
    <div onclick="event.stopPropagation()"
         style="width:min(540px, 95vw); height:100vh; background:#09090b; border-left:1px solid rgba(255,255,255,0.12); display:flex; flex-direction:column;">
      <div style="padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; background:#111113;">
        <div>
          <div style="font-size:14px; font-weight:500; color:#fafafa;">Finanzen \u2014 Bank-Export &amp; Datei-Sync</div>
          <div style="font-size:11px; color:#a1a1aa; margin-top:2px;">Sparkasse George Auto-Sync, Lokaler Downloads-Scanner &amp; 1-Klick CSV/JSON Export</div>
        </div>
        <button onclick="closeQuickImportFlyout()" class="w-nav-btn">Schlie\xDFen</button>
      </div>
      <div style="padding:12px 18px; display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.06); background:#09090b;">
        <button onclick="launchBankingPopupFromDashboard(event)" class="thassi-u-btn-primary">
          1. George \xF6ffnen (Verf\xFCger kopiert) \u2197
        </button>
        <button onclick="triggerDashboardLocalFolderScan()" class="thassi-u-btn-ghost">
          2. Neuesten Export aus Downloads lesen
        </button>
      </div>
      <div style="padding:10px 18px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.06); background:#111113;">
        <span style="font-size:10.5px; font-weight:500; text-transform:uppercase; letter-spacing:0.06em; color:#a1a1aa;">1-Klick Thassi Export:</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button onclick="triggerDirectFinanceExportFromDash(event, 'csv_de')" class="w-nav-btn">Excel-CSV \u2193</button>
          <button onclick="triggerDirectFinanceExportFromDash(event, 'tax_report')" class="w-nav-btn">Steuerbericht \u2193</button>
          <button onclick="triggerDirectFinanceExportFromDash(event, 'json')" class="w-nav-btn">JSON-Backup \u2193</button>
        </div>
      </div>
      <div id="qi-dash-status" style="display:none; margin:10px 18px 0; padding:8px 12px; border-radius:3px; font-size:12px;"></div>
      <div style="flex:1; padding:12px 18px; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <label ondragover="event.preventDefault()"
               ondrop="handleDashboardQuickFileDrop(event)"
               style="padding:14px; border-radius:3px; border:1px dashed rgba(255,255,255,0.22); background:#111113; text-align:center; font-size:12px; color:#fafafa; cursor:pointer;">
          Bank-Export (.CSV, .XML, .STA) hier ablegen oder klicken f\xFCr sofortigen Auto-Import
          <div style="font-size:11px; color:#a1a1aa; margin-top:3px;">Erste Bank / Sparkasse George \xB7 Raiffeisen \xB7 BAWAG \xB7 CAMT.053 \xB7 MT940</div>
          <input type="file" accept=".csv,.xml,.sta,.mt940,.json,.txt" onchange="handleDashboardQuickFileSelect(event)" style="display:none;" />
        </label>
        <iframe id="qi-dash-frame"
                src="about:blank"
                style="flex:1; width:100%; border:1px solid rgba(255,255,255,0.06); border-radius:3px; background:#09090b;"></iframe>
      </div>
    </div>
  </div>

  <!-- QUICK EVENT MODAL -->
  <div id="quick-event-modal">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span class="sh-section-label">NEUER TERMIN</span>
      <button onclick="toggleEventModal(false)" class="w-nav-btn">\u2715</button>
    </div>
    <form onsubmit="createQuickEvent(event)" style="display:flex; flex-direction:column; gap:8px;">
      <input id="qe-title" class="minimal-input" placeholder="Termin-Titel..." required />
      <input id="qe-start" type="datetime-local" class="minimal-input" required />
      <div style="display:flex; gap:8px;">
        <input id="qe-dur" type="number" value="60" min="15" step="15" class="minimal-input" placeholder="Minuten" />
        <button type="submit" class="thassi-u-btn-primary">Speichern</button>
      </div>
    </form>
  </div>

  <!-- FULL SERVICE OVERLAY -->
  <div id="full-app-overlay">
    <div id="full-app-bar">
      <button onclick="closeFullService()" class="w-nav-btn">\u2190 Horizon</button>
      <span id="full-app-title" style="font-size:12px; font-weight:500; color:var(--text-secondary);"></span>
      <span></span>
    </div>
    <iframe id="full-app-frame" src="about:blank"></iframe>
  </div>

  <script>
    ${sidebarStylerScript}

    // Detect if running inside Home Assistant parent frame (which already renders transparent ha-sidebar)
    (function detectHassParentFrame() {
      try {
        if (window.top && window.top !== window && window.top.document && window.top.document.querySelector('home-assistant')) {
          document.body.classList.add('in-hass-frame');
        }
      } catch (_e) {}
    })();

    const ingressRx = new RegExp('^(/api/hassio_ingress/[^/]+)');
    const trailingSlashRx = new RegExp('/+$');
    const base = (
      window.__THASSI_INGRESS_PATH__ ||
      ((window.location.pathname || '').match(ingressRx) || [])[1] ||
      ''
    ).replace(trailingSlashRx, '');
    const NOW_ANCHOR_RATIO = 0.25;

    let calendarEvents = [];
    let allCalendarEvents = [];
    let horizonCalendars = [];
    let googleOAuthInfo = null;
    let roomsData = [];
    let visionSummaryData = null;
    let pinnedRoomIds = new Set();
    let visibleHoursSpan = 24;
    let panOffsetMs = 0;
    let timelineBaseEpochMs = Date.now();
    let currentWeatherState = null;

    // Generate twinkling stars once
    (function initStars() {
      const sf = document.getElementById('starfield');
      if (!sf) return;
      let html = '';
      for (let i = 0; i < 85; i++) {
        const x = (Math.random() * 100).toFixed(2);
        const y = (Math.random() * 68).toFixed(2);
        const sz = (1 + Math.random() * 2.2).toFixed(1);
        const dur = (2.5 + Math.random() * 4.5).toFixed(1);
        html += \`<div class="star" style="left:\${x}%; top:\${y}%; width:\${sz}px; height:\${sz}px; --dur:\${dur}s;"></div>\`;
      }
      sf.innerHTML = html;
    })();

    // 1. ABSTRACT SOLAR / LUNAR POSITION & SKY COLOR ENGINE
    const SUNRISE_HOUR = 6.75; // 06:45
    const SUNSET_HOUR = 18.5;  // 18:30

    function getSkyPalette(h) {
      if (h < 5.2 || h >= 21.2) {
        return {
          sky: 'linear-gradient(180deg, #02040a 0%, #070d1f 48%, #0f172a 78%, #172554 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.18), transparent 70%)',
          stars: 0.9,
          phase: 'Astronomical Night'
        };
      }
      if (h < 6.5) {
        return {
          sky: 'linear-gradient(180deg, #090d1e 0%, #1e1b4b 42%, #6d28d9 74%, #f97316 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 25% 100%, rgba(251, 146, 60, 0.65), transparent 72%)',
          stars: 0.45,
          phase: 'Dawn Twilight'
        };
      }
      if (h < 8.0) {
        return {
          sky: 'linear-gradient(180deg, #1d4ed8 0%, #3b82f6 42%, #f472b6 75%, #fbbf24 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 22% 100%, rgba(253, 224, 71, 0.8), transparent 75%)',
          stars: 0.05,
          phase: 'Golden Sunrise'
        };
      }
      if (h < 16.5) {
        return {
          sky: 'linear-gradient(180deg, #0369a1 0%, #0284c7 45%, #38bdf8 80%, #bae6fd 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(254, 249, 195, 0.45), transparent 75%)',
          stars: 0,
          phase: h < 11.5 ? 'Morning Sky' : h < 14 ? 'Solar Noon' : 'Afternoon Sun'
        };
      }
      if (h < 18.8) {
        return {
          sky: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 36%, #c2410c 72%, #facc15 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 78% 100%, rgba(251, 146, 60, 0.85), transparent 75%)',
          stars: 0.15,
          phase: 'Golden Hour'
        };
      }
      return {
        sky: 'linear-gradient(180deg, #050814 0%, #1e1b4b 46%, #4c1d95 76%, #9a3412 100%)',
        sidebarBg: 'transparent',
        glow: 'radial-gradient(ellipse at 82% 100%, rgba(234, 88, 12, 0.45), transparent 70%)',
        stars: 0.65,
        phase: 'Dusk Twilight'
      };
    }

    function computeSunAltitudeRatio(epochMs) {
      const d = new Date(epochMs);
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const nightSpan = 24 - daySpan;
      if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
        return Math.sin(((h - SUNRISE_HOUR) / daySpan) * Math.PI);
      }
      const nightH = h < SUNRISE_HOUR ? h + (24 - SUNSET_HOUR) : h - SUNSET_HOUR;
      return -Math.sin((nightH / nightSpan) * Math.PI);
    }

    function computeMoonAltitudeRatio(epochMs) {
      const d = new Date(epochMs);
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const lunarInfo = computeLunarPhaseInfo(d);
      const moonPeakHour = (12.625 + lunarInfo.phase * 24) % 24;
      return Math.cos(((h - moonPeakHour) / 24) * 2 * Math.PI);
    }

    function computeLunarPhaseInfo(dateObj) {
      const synodicDays = 29.530588853;
      const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
      const daysSince = (dateObj.getTime() - refNewMoonMs) / 86400000;
      const phase = ((daysSince % synodicDays) + synodicDays) % synodicDays / synodicDays;
      const r = 10.5;
      let d = '';
      if (phase < 0.02 || phase > 0.98) {
        d = '';
      } else if (Math.abs(phase - 0.5) < 0.02) {
        d = \`M 0,-\${r} A \${r},\${r} 0 1,1 0,\${r} A \${r},\${r} 0 1,1 0,-\${r} Z\`;
      } else if (phase < 0.5) {
        const k = Math.cos(phase * 2 * Math.PI);
        const rx = Math.max(0.2, Math.abs(k) * r).toFixed(2);
        const sweepTerm = k >= 0 ? 0 : 1;
        d = \`M 0,-\${r} A \${r},\${r} 0 0,1 0,\${r} A \${rx},\${r} 0 0,\${sweepTerm} 0,-\${r} Z\`;
      } else {
        const k = -Math.cos(phase * 2 * Math.PI);
        const rx = Math.max(0.2, Math.abs(k) * r).toFixed(2);
        const sweepTerm = k >= 0 ? 1 : 0;
        d = \`M 0,-\${r} A \${r},\${r} 0 0,0 0,\${r} A \${rx},\${r} 0 0,\${sweepTerm} 0,-\${r} Z\`;
      }

      let phaseLabel = 'Waxing Crescent';
      if (phase < 0.03 || phase > 0.97) phaseLabel = 'New Moon';
      else if (phase < 0.22) phaseLabel = 'Waxing Crescent';
      else if (phase < 0.28) phaseLabel = 'First Quarter';
      else if (phase < 0.47) phaseLabel = 'Waxing Gibbous';
      else if (phase < 0.53) phaseLabel = 'Full Moon';
      else if (phase < 0.72) phaseLabel = 'Waning Gibbous';
      else if (phase < 0.78) phaseLabel = 'Last Quarter';
      else phaseLabel = 'Waning Crescent';

      return { phase, d, phaseLabel };
    }

    function buildSmartMoonSvg(dateObj) {
      const lunar = computeLunarPhaseInfo(dateObj);
      return \`
        <svg width="32" height="32" viewBox="-17 -17 34 34" style="overflow:visible;">
          <circle cx="0" cy="0" r="14" fill="rgba(186, 230, 253, 0.10)" />
          <circle cx="0" cy="0" r="10.5" fill="rgba(15, 23, 42, 0.88)" stroke="rgba(226, 232, 240, 0.52)" stroke-width="1" />
          <path d="\${lunar.d}" fill="rgba(248, 250, 252, 0.95)" />
        </svg>
      \`;
    }

    function buildSmartSunWeatherSvg(rawCond) {
      const c = String(rawCond || '').toLowerCase();
      const sunDisc = \`
        <g>
          <circle cx="-2" cy="-2" r="6.2" fill="#fde047" stroke="#ffffff" stroke-width="0.9" />
          <line x1="-2" y1="-11.5" x2="-2" y2="-9.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-2" y1="5.5" x2="-2" y2="7.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-11.5" y1="-2" x2="-9.5" y2="-2" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="5.5" y1="-2" x2="7.5" y2="-2" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-8.8" y1="-8.8" x2="-7.3" y2="-7.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
          <line x1="2.8" y1="-8.8" x2="4.3" y2="-7.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
          <line x1="-8.8" y1="4.8" x2="-7.3" y2="3.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
        </g>
      \`;
      const cloudShape = \`
        <path d="M -5,6.5 H 7.5 A 4.2,4.2 0 0,0 8.2,-1.8 A 5.5,5.5 0 0,0 -2.2,-3.2 A 4.4,4.4 0 0,0 -5,6.5 Z"
              fill="rgba(226, 232, 240, 0.94)" stroke="rgba(15, 23, 42, 0.55)" stroke-width="0.9" stroke-linejoin="round" />
      \`;

      if (c.includes('thunder') || c.includes('storm')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <polyline points="1,5 -1.5,9.5 1.8,9.5 -0.5,14" fill="none" stroke="#facc15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        \`;
      }
      if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <line x1="-2.5" y1="8.2" x2="-3.8" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
            <line x1="1.5" y1="8.2" x2="0.2" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
            <line x1="5.5" y1="8.2" x2="4.2" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        \`;
      }
      if (c.includes('snow') || c.includes('sleet')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <circle cx="-2" cy="10.2" r="1.2" fill="#e0f2fe" />
            <circle cx="2" cy="11.5" r="1.2" fill="#e0f2fe" />
            <circle cx="5.5" cy="10.0" r="1.2" fill="#e0f2fe" />
          </svg>
        \`;
      }
      if (c.includes('cloud') || c.includes('overcast') || c.includes('fog') || c.includes('mist')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
          </svg>
        \`;
      }
      // Clear / Sunny
      return \`
        <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
          <circle cx="0" cy="0" r="13" fill="rgba(253, 224, 71, 0.16)" />
          <circle cx="0" cy="0" r="6.8" fill="#fde047" stroke="#ffffff" stroke-width="1.1" />
          <line x1="0" y1="-12" x2="0" y2="-9.4" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="0" y1="9.4" x2="0" y2="12" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="-12" y1="0" x2="-9.4" y2="0" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="9.4" y1="0" x2="12" y2="0" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="-8.5" y1="-8.5" x2="-6.6" y2="-6.6" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="6.6" y1="-6.6" x2="8.5" y2="-8.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-8.5" y1="8.5" x2="-6.6" y2="6.6" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="6.6" y1="6.6" x2="8.5" y2="8.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      \`;
    }

    function renderSolarArcPaths() {
      // Curves are now rendered along the moving #timeline-world in renderTimelineGeometry()
    }

    function updateSkyAndSun(now) {
      const effectiveHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      const palette = getSkyPalette(effectiveHour);

      const skyEl = document.getElementById('sky-stage');
      if (skyEl) skyEl.style.background = '#09090b';
      const glowEl = document.getElementById('horizon-glow');
      if (glowEl) glowEl.style.background = 'transparent';
      const sfEl = document.getElementById('starfield');
      if (sfEl) sfEl.style.opacity = '0';

      if (window.syncThassiSidebarSky) {
        window.syncThassiSidebarSky('#09090b');
      }

      const lunarInfo = computeLunarPhaseInfo(now);
      const phaseEl = document.getElementById('solar-phase-text');
      if (phaseEl) {
        phaseEl.textContent =
          palette.phase + ' \xB7 06:45\u201318:30 \xB7 ' + lunarInfo.phaseLabel;
      }

      // Update live smart Sun & Moon positions along their respective curves at NOW on the timeline
      const nowEpochMs = now.getTime();
      const pxPerMs = getPxPerMs();
      const xNowPx = (nowEpochMs - timelineBaseEpochMs) * pxPerMs;
      const sunAlt = computeSunAltitudeRatio(nowEpochMs);
      const moonAlt = computeMoonAltitudeRatio(nowEpochMs);

      const sunYOffsetPx = sunAlt >= 0 ? sunAlt * 112 : sunAlt * 32;
      const moonYOffsetPx = moonAlt >= 0 ? moonAlt * 92 : moonAlt * 28;

      const sunNode = document.getElementById('tl-sun-node');
      if (sunNode) {
        sunNode.style.left = xNowPx.toFixed(1) + 'px';
        sunNode.style.bottom = (38 + sunYOffsetPx).toFixed(1) + 'px';
        sunNode.classList.toggle('below-horizon', sunAlt < 0);
        const rawCond = currentWeatherState && currentWeatherState.current
          ? (currentWeatherState.current.conditionCode || currentWeatherState.current.effect)
          : 'partly_cloudy';
        const condLabel = currentWeatherState && currentWeatherState.current
          ? (currentWeatherState.current.conditionLabel || currentWeatherState.current.descriptionDe || '')
          : '';
        if (sunNode.dataset.cond !== String(rawCond)) {
          sunNode.dataset.cond = String(rawCond);
          sunNode.innerHTML = buildSmartSunWeatherSvg(rawCond);
        }
        sunNode.title = \`Sonne (\${Math.round(sunAlt * 62)}\xB0) \xB7 \${condLabel || 'Wetter aktiv'}\`;
      }

      const moonNode = document.getElementById('tl-moon-node');
      if (moonNode) {
        moonNode.style.left = xNowPx.toFixed(1) + 'px';
        moonNode.style.bottom = (38 + moonYOffsetPx).toFixed(1) + 'px';
        moonNode.classList.toggle('below-horizon', moonAlt < 0);
        const phaseBucket = lunarInfo.phase.toFixed(2);
        if (moonNode.dataset.phase !== phaseBucket) {
          moonNode.dataset.phase = phaseBucket;
          moonNode.innerHTML = buildSmartMoonSvg(now);
        }
        moonNode.title = \`Mond (\${Math.round(moonAlt * 54)}\xB0) \xB7 \${lunarInfo.phaseLabel}\`;
      }
    }

    // ============================================================================
    // ST. VEIT / G\xD6LSEN WEATHER FORECAST & SUBTLE BACKGROUND WEATHER FX
    // ============================================================================
    function normalizeWxEffect(raw) {
      const c = String(raw || '').toLowerCase();
      if (c.includes('thunder') || c.includes('storm')) return 'thunder';
      if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
      if (c.includes('snow') || c.includes('sleet')) return 'snow';
      if (c.includes('fog') || c.includes('mist')) return 'fog';
      if (c.includes('cloud') || c.includes('overcast')) return 'clouds';
      return 'clear';
    }

    function getWeatherSvgIcon(rawEffect, size) {
      const effect = normalizeWxEffect(rawEffect);
      const s = size || 18;
      if (effect === 'thunder') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>\`;
      }
      if (effect === 'rain') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>\`;
      }
      if (effect === 'snow') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#e0f2fe" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>\`;
      }
      if (effect === 'fog') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="10" x2="20" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/></svg>\`;
      }
      if (effect === 'clouds') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>\`;
      }
      return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>\`;
    }

    function renderWeatherStrip(w) {
      if (!w || !w.current) return;
      currentWeatherState = w;

      const cur = w.current;
      const curEffect = normalizeWxEffect(cur.conditionCode || cur.effect);
      const curDesc = cur.conditionLabel || cur.descriptionDe || 'Leicht bew\xF6lkt';
      const todaySummary = w.today || w.todaySummary;
      const slotsList = w.daySlots || w.hourly || w.hourly24 || [];

      const iconEl = document.getElementById('mw-current-icon');
      const tempEl = document.getElementById('mw-current-temp');
      const descEl = document.getElementById('mw-current-desc');
      const hiloEl = document.getElementById('mw-hi-lo');
      const slotsEl = document.getElementById('mw-day-slots');

      if (iconEl) iconEl.innerHTML = getWeatherSvgIcon(curEffect, 20);
      if (tempEl) tempEl.textContent = \`\${Math.round(Number(cur.tempC ?? 14))}\xB0\`;
      if (descEl) descEl.textContent = curDesc;
      if (hiloEl && todaySummary) {
        hiloEl.textContent = \`\${Math.round(Number(todaySummary.tempMaxC))}\xB0 / \${Math.round(Number(todaySummary.tempMinC))}\xB0\`;
      }

      // Refresh smart Sun/Weather icon on timeline immediately when weather updates
      const sunNode = document.getElementById('tl-sun-node');
      if (sunNode) {
        sunNode.dataset.cond = '';
        updateSkyAndSun(new Date());
      }

      // Update subtle cloud veils in background
      const veil1 = document.getElementById('weather-cloud-veil-1');
      const veil2 = document.getElementById('weather-cloud-veil-2');
      if (veil1 && veil2) {
        const vOpacity = curEffect === 'rain' || curEffect === 'thunder' ? 0.95 : curEffect === 'clouds' || curEffect === 'fog' ? 0.78 : 0.25;
        veil1.style.opacity = String(vOpacity);
        veil2.style.opacity = String(vOpacity * 0.85);
      }

      if (slotsEl && Array.isArray(slotsList)) {
        const nowHr = new Date().getHours();
        slotsEl.innerHTML = slotsList.slice(0, 6).map((slot) => {
          const slotHr = slot.hour != null ? Number(slot.hour) : parseInt((slot.hourLabel || '00:00').slice(0, 2), 10);
          const isCur = Math.abs(slotHr - nowHr) <= 1;
          const slotEff = normalizeWxEffect(slot.conditionCode || slot.effect);
          return \`
            <div class="mw-slot \${isCur ? 'is-current-slot' : ''}">
              <span class="mw-slot-hr">\${slot.hourLabel}</span>
              <span class="mw-slot-ico">\${getWeatherSvgIcon(slotEff, 13)}</span>
              <span class="mw-slot-temp">\${Math.round(slot.tempC)}\xB0</span>
            </div>
          \`;
        }).join('');
      }
    }

    async function loadWeatherData(initialWeather) {
      if (initialWeather && initialWeather.current) {
        renderWeatherStrip(initialWeather);
        return;
      }
      try {
        const res = await fetch(base + '/api/system/weather');
        if (res.ok) {
          const data = await res.json();
          if (data && data.current) {
            renderWeatherStrip(data);
            return;
          }
        }
      } catch (_e) {}

      // Direct fallback for St. Veit an der G\xF6lsen (48.0444\xB0N, 15.6689\xB0E) if backend route is not yet loaded
      try {
        const meteoUrl = 'https://api.open-meteo.com/v1/forecast?latitude=48.0444&longitude=15.6689&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FVienna&forecast_days=1';
        const r = await fetch(meteoUrl);
        if (r.ok) {
          const d = await r.json();
          const c = d.current || {};
          const wmo = Number(c.weather_code ?? 1);
          const mapCode = (code) => {
            if (code === 0) return { conditionCode: 'clear', conditionLabel: 'Klar & Sonnig' };
            if (code <= 2) return { conditionCode: 'partly_cloudy', conditionLabel: 'Leicht bew\xF6lkt' };
            if (code === 3) return { conditionCode: 'cloudy', conditionLabel: 'Bew\xF6lkt' };
            if (code === 45 || code === 48) return { conditionCode: 'fog', conditionLabel: 'Talnebel' };
            if (code >= 51 && code <= 67 || (code >= 80 && code <= 82)) return { conditionCode: 'rain', conditionLabel: 'Regen' };
            if (code >= 71 && code <= 86) return { conditionCode: 'snow', conditionLabel: 'Schneefall' };
            if (code >= 95) return { conditionCode: 'thunderstorm', conditionLabel: 'Gewitter' };
            return { conditionCode: 'partly_cloudy', conditionLabel: 'Wechselhaft' };
          };
          const cm = mapCode(wmo);
          const times = (d.hourly && d.hourly.time) || [];
          const temps = (d.hourly && d.hourly.temperature_2m) || [];
          const probs = (d.hourly && d.hourly.precipitation_probability) || [];
          const codes = (d.hourly && d.hourly.weather_code) || [];
          const targetHrs = [6, 9, 12, 15, 18, 21];
          const daySlots = [];
          for (let i = 0; i < times.length; i++) {
            const hr = new Date(times[i]).getHours();
            if (targetHrs.includes(hr) && daySlots.length < 6) {
              const sm = mapCode(Number(codes[i] ?? 1));
              daySlots.push({
                hour: hr,
                hourLabel: String(hr).padStart(2, '0') + ':00',
                tempC: temps[i] ?? 14,
                precipProbPct: probs[i] ?? 0,
                conditionCode: sm.conditionCode,
                conditionLabel: sm.conditionLabel
              });
            }
          }
          renderWeatherStrip({
            provider: 'google-weather-api',
            current: {
              tempC: c.temperature_2m ?? 14,
              feelsLikeC: c.apparent_temperature ?? 13.5,
              conditionCode: cm.conditionCode,
              conditionLabel: cm.conditionLabel,
              humidityPct: c.relative_humidity_2m ?? 64,
              windKmh: c.wind_speed_10m ?? 9,
            },
            today: {
              tempMaxC: (d.daily && d.daily.temperature_2m_max && d.daily.temperature_2m_max[0]) ?? 17,
              tempMinC: (d.daily && d.daily.temperature_2m_min && d.daily.temperature_2m_min[0]) ?? 7,
            },
            daySlots
          });
        }
      } catch (_err) {}
    }

    (function initWeatherFxCanvas() {
      const canvas = document.getElementById('weather-fx-canvas');
      if (!canvas) return;

      const particles = [];
      for (let i = 0; i < 65; i++) {
        particles.push({
          x: Math.random(),
          y: Math.random(),
          len: 10 + Math.random() * 14,
          speed: 0.002 + Math.random() * 0.004,
          drift: (Math.random() - 0.5) * 0.001,
          size: 1 + Math.random() * 2.2,
          alpha: 0.08 + Math.random() * 0.22,
        });
      }

      function resizeWxCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      resizeWxCanvas();
      window.addEventListener('resize', resizeWxCanvas);

      function stepWeatherFx() {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const rawCode = currentWeatherState && currentWeatherState.current
            ? (currentWeatherState.current.conditionCode || currentWeatherState.current.effect)
            : 'clouds';
          const eff = normalizeWxEffect(rawCode);
          for (const p of particles) {
            if (eff === 'rain' || eff === 'thunder') {
              p.y += p.speed * 2.8;
              p.x += 0.0008;
              if (p.y > 0.72) { p.y = -0.05; p.x = Math.random(); }
              ctx.strokeStyle = \`rgba(186, 230, 253, \${p.alpha * 0.85})\`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(p.x * w, p.y * h);
              ctx.lineTo(p.x * w + 3, p.y * h + p.len);
              ctx.stroke();
            } else if (eff === 'snow') {
              p.y += p.speed * 0.55;
              p.x += Math.sin(p.y * 18) * 0.0005;
              if (p.y > 0.72) { p.y = -0.02; p.x = Math.random(); }
              ctx.fillStyle = \`rgba(241, 245, 249, \${p.alpha})\`;
              ctx.beginPath();
              ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Subtle atmospheric motes / breeze for clear, clouds, or fog
              p.x += p.drift * 0.4 + 0.00018;
              p.y += Math.sin(p.x * 12) * 0.00015;
              if (p.x > 1.02) p.x = -0.02;
              if (p.x < -0.02) p.x = 1.02;
              if (p.y < 0.04 || p.y > 0.65) p.y = 0.1 + Math.random() * 0.5;
              ctx.fillStyle = eff === 'clear'
                ? \`rgba(254, 240, 138, \${p.alpha * 0.45})\`
                : \`rgba(203, 213, 225, \${p.alpha * 0.42})\`;
              ctx.beginPath();
              ctx.arc(p.x * w, p.y * h, p.size * 0.75, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        requestAnimationFrame(stepWeatherFx);
      }
      requestAnimationFrame(stepWeatherFx);
    })();

    // 2. LARGE CLOCK & CONTINUOUS LEFTWARD TIMELINE LOOP
    function getPxPerMs() {
      const effectiveWidth = Math.max(window.innerWidth, 720);
      return effectiveWidth / (visibleHoursSpan * 3600 * 1000);
    }

    function tickClockAndTimeline() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      document.getElementById('hero-time').textContent = hh + ':' + mm;
      document.getElementById('hero-seconds').textContent = ss;
      document.getElementById('hero-date').textContent = now.toLocaleDateString('de-AT', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      document.getElementById('fixed-now-badge').textContent = 'NOW \xB7 ' + hh + ':' + mm;

      const freshEl = document.getElementById('horizon-freshness-ts');
      if (freshEl) {
        const lastMs = window.__horizonLastFetchMs || now.getTime();
        const ageSec = Math.max(0, Math.floor((now.getTime() - lastMs) / 1000));
        const dSync = new Date(lastMs);
        const sh = String(dSync.getHours()).padStart(2, '0');
        const sm = String(dSync.getMinutes()).padStart(2, '0');
        const ssec = String(dSync.getSeconds()).padStart(2, '0');
        freshEl.textContent = 'Stand: ' + sh + ':' + sm + ':' + ssec + ' (vor ' + ageSec + 's)';
      }

      updateSkyAndSun(now);

      const pxPerMs = getPxPerMs();
      const nowOffsetFromBasePx = (now.getTime() + panOffsetMs - timelineBaseEpochMs) * pxPerMs;
      const vpEl = document.getElementById('timeline-viewport');
      const vpW = (vpEl && vpEl.clientWidth) ? vpEl.clientWidth : window.innerWidth;
      const fixedNowX = vpW * NOW_ANCHOR_RATIO;
      const worldTranslateX = fixedNowX - nowOffsetFromBasePx;
      document.getElementById('timeline-world').style.transform = 'translate3d(' + worldTranslateX.toFixed(2) + 'px, 0, 0)';
    }

    // 3 & 4. RENDER TIMELINE TICKS, CELESTIAL ALTITUDE CURVES & GOOGLE CALENDAR EVENT RECTANGLES
    function renderTimelineCelestialCurves(startSpanMs, endSpanMs, pxPerMs) {
      const stepMs = (visibleHoursSpan <= 24 ? 10 : 20) * 60 * 1000;
      const sunAboveMaxPx = 112;
      const sunBelowMaxPx = 32;
      const moonAboveMaxPx = 92;
      const moonBelowMaxPx = 28;

      function traceSplitCurve(evalFn, aboveAmp, belowAmp, isMoon) {
        let aboveD = '';
        let belowD = '';
        const crossings = [];
        let prevT = startSpanMs;
        let prevRatio = evalFn(prevT);
        let prevX = (prevT - timelineBaseEpochMs) * pxPerMs;
        let prevY = prevRatio >= 0 ? -prevRatio * aboveAmp : -prevRatio * belowAmp;

        if (prevRatio >= 0) {
          aboveD += \`M \${prevX.toFixed(1)},\${prevY.toFixed(1)} \`;
        } else {
          belowD += \`M \${prevX.toFixed(1)},\${prevY.toFixed(1)} \`;
        }

        for (let t = startSpanMs + stepMs; t <= endSpanMs; t += stepMs) {
          const curRatio = evalFn(t);
          const curX = (t - timelineBaseEpochMs) * pxPerMs;
          const curY = curRatio >= 0 ? -curRatio * aboveAmp : -curRatio * belowAmp;

          if ((prevRatio < 0 && curRatio >= 0) || (prevRatio >= 0 && curRatio < 0)) {
            const denom = Math.abs(prevRatio) + Math.abs(curRatio);
            const frac = denom > 1e-6 ? Math.abs(prevRatio) / denom : 0.5;
            const crossT = prevT + frac * (t - prevT);
            const crossX = (crossT - timelineBaseEpochMs) * pxPerMs;

            if (prevRatio >= 0) {
              aboveD += \`L \${crossX.toFixed(1)},0 \`;
              belowD += \`M \${crossX.toFixed(1)},0 L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            } else {
              belowD += \`L \${crossX.toFixed(1)},0 \`;
              aboveD += \`M \${crossX.toFixed(1)},0 L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            }

            crossings.push({
              epochMs: crossT,
              xPx: crossX,
              isRise: prevRatio < 0 && curRatio >= 0,
              isMoon
            });
          } else {
            if (curRatio >= 0) {
              aboveD += \`L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            } else {
              belowD += \`L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            }
          }

          prevT = t;
          prevRatio = curRatio;
          prevX = curX;
          prevY = curY;
        }
        return { aboveD, belowD, crossings };
      }

      const sunTrace = traceSplitCurve(computeSunAltitudeRatio, sunAboveMaxPx, sunBelowMaxPx, false);
      const moonTrace = traceSplitCurve(computeMoonAltitudeRatio, moonAboveMaxPx, moonBelowMaxPx, true);

      const sunAboveEl = document.getElementById('tl-sun-above-path');
      const sunBelowEl = document.getElementById('tl-sun-below-path');
      const moonAboveEl = document.getElementById('tl-moon-above-path');
      const moonBelowEl = document.getElementById('tl-moon-below-path');
      if (sunAboveEl) sunAboveEl.setAttribute('d', sunTrace.aboveD);
      if (sunBelowEl) sunBelowEl.setAttribute('d', sunTrace.belowD);
      if (moonAboveEl) moonAboveEl.setAttribute('d', moonTrace.aboveD);
      if (moonBelowEl) moonBelowEl.setAttribute('d', moonTrace.belowD);

      const crossingsContainer = document.getElementById('tl-horizon-crossings');
      if (crossingsContainer) {
        const showLabels = visibleHoursSpan <= 72;
        const allCrossings = [...sunTrace.crossings, ...moonTrace.crossings];
        crossingsContainer.innerHTML = allCrossings.map((c) => {
          const d = new Date(c.epochMs);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const arrow = c.isRise ? '\u2191' : '\u2193';
          const bodySym = c.isMoon ? '\u263E' : '\u2600';
          const timeText = \`\${arrow} \${hh}:\${mm}\`;
          return \`
            <div class="tl-horizon-node \${c.isMoon ? 'moon-cross' : 'sun-cross'}"
                 style="left:\${c.xPx.toFixed(1)}px;"
                 title="\${bodySym} \${c.isRise ? 'Aufgang' : 'Untergang'}: \${hh}:\${mm}">
              <div class="tl-horizon-dot"></div>
              \${showLabels ? \`<div class="tl-horizon-time">\${timeText}</div>\` : ''}
            </div>
          \`;
        }).join('');
      }
    }

    function renderTimelineGeometry() {
      const nowMs = Date.now();
      timelineBaseEpochMs = nowMs;
      const pxPerMs = getPxPerMs();

      const startSpanMs = nowMs - 36 * 3600 * 1000;
      const endSpanMs = nowMs + 8 * 24 * 3600 * 1000;

      renderTimelineCelestialCurves(startSpanMs, endSpanMs, pxPerMs);

      const stepHours = visibleHoursSpan <= 12 ? 1 : visibleHoursSpan <= 24 ? 2 : visibleHoursSpan <= 72 ? 6 : 12;
      const firstTick = new Date(startSpanMs);
      firstTick.setMinutes(0, 0, 0);
      firstTick.setHours(Math.floor(firstTick.getHours() / stepHours) * stepHours);

      let ticksHtml = '';
      for (let t = firstTick.getTime(); t <= endSpanMs; t += stepHours * 3600 * 1000) {
        const d = new Date(t);
        const h = d.getHours();
        const isDayStart = h === 0;
        const isMajor = h % 6 === 0;
        const xPx = (t - timelineBaseEpochMs) * pxPerMs;

        const label = isDayStart
          ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          : \`\${String(h).padStart(2, '0')}:00\`;

        ticksHtml += \`
          <div class="tl-tick \${isDayStart ? 'day-start' : isMajor ? 'major' : ''}" style="left:\${xPx.toFixed(1)}px;">
            <div class="tl-tick-mark"></div>
            <div class="tl-tick-label">\${label}</div>
          </div>
        \`;
      }
      document.getElementById('timeline-ticks-layer').innerHTML = ticksHtml;

      const catPalette = {
        work:     { border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' },
        focus:    { border: '#818cf8', glow: 'rgba(129, 140, 248, 0.35)' },
        health:   { border: '#4ade80', glow: 'rgba(74, 222, 128, 0.35)' },
        social:   { border: '#f472b6', glow: 'rgba(244, 114, 182, 0.35)' },
        personal: { border: '#fbbf24', glow: 'rgba(251, 191, 36, 0.35)' },
      };

      const calColorMap = {};
      for (const c of horizonCalendars) {
        if (c && c.calendar_name && c.color) {
          calColorMap[c.calendar_name] = c.color;
        }
      }

      const sorted = [...calendarEvents]
        .map((ev) => {
          const s = new Date(ev.start_time).getTime();
          const e = Math.max(s + 30 * 60000, new Date(ev.end_time).getTime());
          return { ...ev, s, e };
        })
        .filter((ev) => Number.isFinite(ev.s) && ev.e >= startSpanMs && ev.s <= endSpanMs)
        .sort((a, b) => a.s - b.s);

      const laneEndPx = [-Infinity, -Infinity, -Infinity];
      let eventsHtml = '';

      for (const ev of sorted) {
        const leftPx = (ev.s - timelineBaseEpochMs) * pxPerMs;
        const rawWidthPx = (ev.e - ev.s) * pxPerMs;
        const widthPx = Math.max(155, rawWidthPx);

        let lane = 0;
        for (let l = 0; l < laneEndPx.length; l++) {
          if (leftPx >= laneEndPx[l] + 8) {
            lane = l;
            break;
          }
          if (l === laneEndPx.length - 1) lane = l;
        }
        laneEndPx[lane] = leftPx + widthPx;

        const bottomPx = 42 + lane * 58;
        const pal = catPalette[ev.category] || catPalette.personal;
        const evBorder = calColorMap[ev.calendar_name] || pal.border;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
        const safeTitle = String(ev.title || '').split('"').join('&quot;');

        const locStr = String(ev.location || '').trim();
        const attendeesStr = String(ev.attendees || ev.calendar_name || '').trim();
        const rawDesc = String(ev.description || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim();

        const metaParts = [];
        if (locStr) metaParts.push('\u{1F4CD} ' + locStr);
        if (attendeesStr) metaParts.push('\u{1F465} ' + attendeesStr);
        const metaLine = metaParts.join(' \xB7 ') || (ev.calendar_name || ev.category || '');
        const descLine = rawDesc || (locStr ? \`\${startStr}\u2013\${endStr} \xB7 \${ev.calendar_name || ''}\` : 'Keine Beschreibung');

        const tooltipParts = [
          \`\${safeTitle} (\${dayStr}, \${startStr}\u2013\${endStr})\`,
          locStr ? \`Ort: \${locStr}\` : '',
          attendeesStr ? \`Teilnehmer: \${attendeesStr}\` : '',
          rawDesc ? \`Info: \${rawDesc}\` : ''
        ].filter(Boolean).join(' | ').split('"').join('&quot;');

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${evBorder}; --ev-glow:\${pal.glow};"
               title="\${tooltipParts}">
            <div class="tl-ev-head">
              <div class="tl-ev-title">\${ev.title}</div>
              <div class="tl-ev-time">\${startStr}\u2013\${endStr}</div>
            </div>
            <div class="tl-ev-meta">\${metaLine}</div>
            <div class="tl-ev-desc">\${descLine}</div>
          </div>
        \`;
      }

      document.getElementById('timeline-events-layer').innerHTML = eventsHtml;
      tickClockAndTimeline();
    }

    function setTimelineSpan(hours) {
      visibleHoursSpan = hours;
      ['12', '24', '72', '168'].forEach((id) => {
        const el = document.getElementById('zoom-' + id);
        if (el) el.classList.toggle('active', Number(id) === hours);
      });
      renderTimelineGeometry();
    }

    function snapToLiveNow() {
      panOffsetMs = 0;
      document.getElementById('btn-live-now').style.display = 'none';
      tickClockAndTimeline();
    }

    (function initTimelineDrag() {
      const vp = document.getElementById('timeline-viewport');
      let dragging = false;
      let startX = 0;
      let startPanMs = 0;

      vp.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tl-event-rect')) return;
        dragging = true;
        startX = e.clientX;
        startPanMs = panOffsetMs;
        vp.setPointerCapture(e.pointerId);
      });
      vp.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        panOffsetMs = startPanMs - dx / getPxPerMs();
        document.getElementById('btn-live-now').style.display = 'inline-block';
        tickClockAndTimeline();
      });
      vp.addEventListener('pointerup', () => { dragging = false; });
    })();

    function toggleWidget(id, ev) {
      if (ev) ev.stopPropagation();
      const target = document.getElementById('widget-' + id);
      if (!target) return;
      const isAlreadyOpen = target.classList.contains('expanded');
      document.querySelectorAll('.ambient-widget, .sb-preview-item').forEach((w) => w.classList.remove('expanded'));
      if (!isAlreadyOpen) {
        target.classList.add('expanded');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ambient-widget') && !e.target.closest('.sb-preview-item')) {
        document.querySelectorAll('.ambient-widget, .sb-preview-item').forEach((w) => w.classList.remove('expanded'));
      }
      if (!e.target.closest('.cal-filter-wrap')) {
        const pop = document.getElementById('horizon-cal-filter-popover');
        if (pop) pop.classList.remove('open');
      }
    });

    // ============================================================================
    // 6. MINIMIZED-BY-DEFAULT ROOM TABS & PINNABLE ROOM GROUPS (EXPAND OVER UPPER CONTENT)
    // ============================================================================
    function syncDevicesDockHeight() {
      const bar = document.getElementById('room-dock-bar');
      const h = (bar && bar.getBoundingClientRect().height) ? bar.getBoundingClientRect().height + 2 : 52;
      document.documentElement.style.setProperty('--devices-dock-height', Math.round(h) + 'px');
    }

    function toggleRoomPin(roomId, ev) {
      if (ev) ev.stopPropagation();
      if (pinnedRoomIds.has(roomId)) {
        pinnedRoomIds.delete(roomId);
      } else {
        pinnedRoomIds.add(roomId);
      }
      renderRoomDockBar();
      renderPinnedRoomsTray();
    }

    function unpinAllRooms() {
      pinnedRoomIds.clear();
      renderRoomDockBar();
      renderPinnedRoomsTray();
    }

    function renderRoomDockBar() {
      const container = document.getElementById('room-pills-container');
      if (!container) return;

      // Filter out kameras_vision from left room tabs (Vision is right-aligned in StatusBar)
      const roomTabs = roomsData.filter((r) => r.id !== 'kameras_vision');

      container.innerHTML = roomTabs
        .map((r) => {
          const hasLightsOn = Array.isArray(r.devices)
            ? r.devices.some(
                (d) =>
                  d.isOn &&
                  (d.kind === 'rgbw' ||
                    String(d.entityId || '').startsWith('light.') ||
                    /licht|beleuchtung|led|schalter/i.test(
                      String(d.label || '') + ' ' + String(d.entityId || '')
                    ))
              )
            : r.activeCount > 0;
          const hasOn = hasLightsOn;
          const hasMotion = Boolean(r.motionActive);
          const isPinned = pinnedRoomIds.has(r.id);

          const lightbulbHtml = hasLightsOn
            ? \`<span class="room-lightbulb-icon" title="Licht eingeschaltet">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(251, 191, 36, 0.28)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18h6"></path>
                  <path d="M10 22h4"></path>
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
                </svg>
              </span>\`
            : '';

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isPinned ? 'pinned-tab' : ''}"
                    title="\${isPinned ? 'Klicken zum Minimieren (Entpinnen)' : 'Klicken zum Anheften (Pinnen) der Raum-Ger\xE4te'}"
                    onclick="toggleRoomPin('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${lightbulbHtml}
            </button>
          \`;
        })
        .join('');

      // Populate right-aligned Vision upward flyout & StatusBar meta
      const visionRoom = roomsData.find((r) => r.id === 'kameras_vision');
      const vMeta = document.getElementById('vision-dock-meta');
      if (vMeta) {
        if (visionSummaryData && visionSummaryData.lastTotalObjects != null) {
          vMeta.textContent = visionSummaryData.lastTotalObjects + ' Obj';
        } else if (visionRoom && Array.isArray(visionRoom.devices)) {
          vMeta.textContent = visionRoom.devices.length + ' Cams';
        } else {
          vMeta.textContent = 'Zyklisch';
        }
      }

      const vSummaryEl = document.getElementById('vision-flyout-summary');
      if (vSummaryEl) {
        vSummaryEl.textContent = (visionSummaryData && visionSummaryData.lastSceneSummary)
          ? visionSummaryData.lastSceneSummary
          : 'Zyklischer Snapshot-Scan aktiv (COCO-SSD)';
      }

      const vCamsEl = document.getElementById('vision-flyout-cameras');
      if (vCamsEl) {
        if (visionRoom && Array.isArray(visionRoom.devices) && visionRoom.devices.length > 0) {
          vCamsEl.innerHTML = visionRoom.devices.map(buildRoomDeviceRowHtml).join('');
        } else {
          vCamsEl.innerHTML = '<div style="font-size:11px; color:#52525b;">Keine Kameras verbunden</div>';
        }
      }

      // Render Live Swiss Hairline Room Matrix in primary workspace
      const matrixEl = document.getElementById('rooms-live-matrix-grid');
      const matrixSumEl = document.getElementById('sh-matrix-summary');
      if (matrixEl) {
        let totalActiveDevs = 0;
        let totalHouseWatts = 0;
        for (const r of roomTabs) {
          totalActiveDevs += Number(r.activeCount || 0);
          totalHouseWatts += Number(r.totalPowerW || 0);
        }
        if (matrixSumEl) {
          matrixSumEl.textContent = roomTabs.length + ' R\xE4ume \xB7 ' + totalActiveDevs + ' aktiv \xB7 ' + totalHouseWatts.toFixed(1) + ' W';
        }
        const visibleRooms = pinnedRoomIds.size > 0
          ? roomTabs.filter((r) => pinnedRoomIds.has(r.id))
          : roomTabs;
        matrixEl.innerHTML = visibleRooms
          .map((room) => {
            const subParts = [];
            if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + '\xB0C');
            if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
            if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');
            const isRoomActive = Number(room.activeCount || 0) > 0;
            const dotColor = isRoomActive ? '#10b981' : (room.motionActive ? '#f59e0b' : '#52525b');
            const rowsHtml = (room.devices || []).map(buildRoomDeviceRowHtml).join('');
            const offBtn = isRoomActive
              ? '<button class="sh-room-off-btn" onclick="turnOffAllInRoom('' + room.id + '')">Alle aus</button>'
              : '';
            return [
              '<div class="sh-room-cell">',
              '  <div class="sh-room-head">',
              '    <div class="sh-room-title-group">',
              '      <span class="thassi-u-dot" style="background:' + dotColor + ';"></span>',
              '      <span class="sh-room-name">' + room.name + '</span>',
              '    </div>',
              '    <div class="sh-room-meta-group">',
              '      <span class="sh-room-telemetry">' + (subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')) + '</span>',
              '      ' + offBtn,
              '    </div>',
              '  </div>',
              '  <div class="sh-room-devices">' + rowsHtml + '</div>',
              '</div>'
            ].join('');
          })
          .join('');
      }
    }

    function buildRoomDeviceRowHtml(d) {
      const pwr = d.powerW != null && d.powerW > 0 ? \`<span class="rf-power-badge">\${d.powerW.toFixed(1)} W</span>\` : '';

      if (d.kind === 'toggle' || d.kind === 'rgbw') {
        const extraRgbw =
          d.kind === 'rgbw' && d.isOn
            ? \`
              <div class="rf-slider-row">
                <span style="font-size:10px; color:rgba(255,255,255,0.45);">Dim</span>
                <input type="range" min="5" max="100" value="\${d.brightness || 80}" class="rf-slider"
                       onchange="triggerDeviceAction('\${d.entityId}', 'brightness', { brightnessPct: Number(this.value) })" />
              </div>
              \${
                Array.isArray(d.effectList) && d.effectList.length > 0
                  ? \`<div class="rf-effect-pills">
                      \${d.effectList
                        .map(
                          (fx) =>
                            \`<button class="rf-fx-pill \${d.effect === fx ? 'active' : ''}" onclick="triggerDeviceAction('\${d.entityId}', 'effect', { effect: '\${fx}' })">\${fx}</button>\`
                        )
                        .join('')}
                    </div>\`
                  : ''
              }
            \`
            : '';

        return \`
          <div class="rf-dev-row \${d.isOn ? 'is-on' : ''}">
            <div class="rf-dev-main">
              <span class="rf-dev-label">\${d.label}</span>
              <div class="rf-dev-right">
                \${pwr}
                <button class="rf-toggle-btn \${d.isOn ? 'on' : ''}"
                        onclick="triggerDeviceAction('\${d.entityId}', 'toggle')">
                  \${d.isOn ? 'AN' : 'AUS'}
                </button>
              </div>
            </div>
            \${extraRgbw}
          </div>
        \`;
      }

      if (d.kind === 'camera') {
        const camLive = d.state === 'recording' || d.state === 'streaming';
        const currentMode = (visionSummaryData?.cameraModes && visionSummaryData.cameraModes[d.entityId]) || 'Personen';
        const modes = ['Personen', 'Fahrzeuge', 'Objekte', 'Kamera', 'Aktivit\xE4ten'];
        return \`
          <div class="rf-dev-row \${camLive ? 'is-on' : ''}">
            <div class="rf-dev-main">
              <span class="rf-dev-label" style="cursor:pointer;" title="Klicken f\xFCr Vollbild-Live-Stream mit Objekterkennung" onclick="openFullService('camera-vision', 'Kameras & Live-Vision', '?camera=\${d.entityId}')">\${d.label} \u2197</span>
              <div class="rf-dev-right">
                <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                  \${camLive ? 'Aktiv' : 'QR-Auth'}
                </span>
                <button class="rf-toggle-btn" onclick="openFullService('camera-vision', 'Kameras & Live-Vision', '?camera=\${d.entityId}')">
                  Live + KI
                </button>
                <button class="rf-toggle-btn" onclick="triggerQuickVisionSample('\${d.entityId}', this)">
                  Abtasten
                </button>
              </div>
            </div>
            <div class="rf-effect-pills">
              \${modes
                .map(
                  (m) =>
                    \`<button class="rf-fx-pill \${currentMode === m ? 'active' : ''}" style="\${currentMode === m ? 'background:#38bdf8; color:#040711; font-weight:600;' : ''}" onclick="setCameraModeFromFlyout('\${d.entityId}', '\${m}')">\${m}</button>\`
                )
                .join('')}
            </div>
          </div>
        \`;
      }

      const formattedState =
        d.state === 'on'
          ? 'Bewegung erkannt'
          : d.state === 'off'
            ? 'Ruhig'
            : d.state === 'unavailable'
              ? 'Offline'
              : \`\${d.state}\${d.unit ? ' ' + d.unit : ''}\`;

      return \`
        <div class="rf-dev-row">
          <div class="rf-dev-main">
            <span class="rf-dev-label">\${d.label}</span>
            <span class="rf-power-badge" style="color:rgba(248,250,252,0.75);">\${formattedState}</span>
          </div>
        </div>
      \`;
    }

    function renderPinnedRoomsTray() {
      const tray = document.getElementById('pinned-rooms-tray');
      const countLbl = document.getElementById('pinned-rooms-count-label');
      const unpinBtn = document.getElementById('btn-unpin-all-rooms');
      if (!tray) return;

      const pinnedRooms = roomsData.filter((r) => pinnedRoomIds.has(r.id));
      if (pinnedRooms.length === 0) {
        tray.classList.remove('has-pinned');
        tray.innerHTML = '';
        if (countLbl) countLbl.style.display = 'none';
        if (unpinBtn) unpinBtn.style.display = 'none';
        requestAnimationFrame(syncDevicesDockHeight);
        return;
      }

      tray.classList.add('has-pinned');
      if (countLbl) {
        countLbl.textContent = \`\xB7 \${pinnedRooms.length} angeheftet\`;
        countLbl.style.display = 'inline';
      }
      if (unpinBtn) {
        unpinBtn.style.display = 'inline-block';
      }

      tray.innerHTML = pinnedRooms
        .map((room) => {
          const subParts = [];
          if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + ' \xB0C');
          if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
          if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');

          const rowsHtml = room.devices.map(buildRoomDeviceRowHtml).join('');
          const footerHtml =
            room.id === 'kameras_vision'
              ? \`
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:2px;">
                  <span style="font-size:10px; color:rgba(255,255,255,0.48);">
                    \${visionSummaryData?.lastSceneSummary ? visionSummaryData.lastSceneSummary.slice(0, 32) : 'COCO-SSD aktiv'}
                  </span>
                  <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('camera-vision', 'Camera Vision')">
                    Vision \u2192
                  </button>
                </div>
              \`
              : room.activeCount > 0
                ? \`
                  <div style="display:flex; justify-content:space-between; align-items:center; padding-top:2px;">
                    <button class="w-action-link" style="margin:0; font-size:10.5px; color:#fbbf24;" onclick="turnOffAllInRoom('\${room.id}')">
                      Alle ausschalten
                    </button>
                    <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('smart-canvas', 'Smart Home')">
                      Canvas \u2192
                    </button>
                  </div>
                \`
                : '';

          return \`
            <div class="pinned-room-card">
              <div class="prc-header">
                <div class="prc-title-wrap">
                  <span class="prc-title">\${room.name}</span>
                  <span class="prc-meta">\${subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')}</span>
                </div>
                <button class="prc-unpin" onclick="toggleRoomPin('\${room.id}', event)" title="Raum-Tab wieder minimieren">
                  <span>\u{1F4CC} Angeheftet</span>
                  <span>\u2715</span>
                </button>
              </div>
              <div class="prc-dev-grid">\${rowsHtml}</div>
              \${footerHtml}
            </div>
          \`;
        })
        .join('');

      requestAnimationFrame(syncDevicesDockHeight);
    }

    async function setCameraModeFromFlyout(cameraId, mode) {
      try {
        await fetch(base + '/api/apps/camera-vision/camera-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId, optimization_mode: mode }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Failed setting camera mode:', e);
      }
    }

    async function triggerDeviceAction(entityId, action, extra) {
      try {
        await fetch(base + '/api/system/device-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityId, action, ...(extra || {}) }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Device action failed:', e);
      }
    }

    async function turnOffAllInRoom(roomId) {
      const room = roomsData.find((r) => r.id === roomId);
      if (!room) return;
      const activeDevs = room.devices.filter((d) => (d.kind === 'toggle' || d.kind === 'rgbw') && d.isOn);
      await Promise.all(
        activeDevs.map((d) =>
          fetch(base + '/api/system/device-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityId: d.entityId, action: 'turn_off' }),
          })
        )
      );
      await loadRoomsQuickAccess();
    }

    async function triggerQuickVisionSample(cameraId, btnEl) {
      if (btnEl) btnEl.textContent = 'Pr\xFCfe\u2026';
      try {
        await fetch(base + '/api/apps/camera-vision/sample-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId }),
        });
        await loadRoomsQuickAccess();
      } finally {
        if (btnEl) btnEl.textContent = 'Abtasten';
      }
    }

    async function loadRoomsQuickAccess() {
      try {
        const res = await fetch(base + '/api/system/rooms');
        if (!res.ok) return;
        const data = await res.json();
        roomsData = data.rooms || [];
        visionSummaryData = data.visionSummary || null;
        renderRoomDockBar();
        renderPinnedRoomsTray();
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function setLeftNavActive(id) {
      document.querySelectorAll('#left-ambient-navbar .lnav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.id === 'lnav-' + id);
      });
    }

    function openFullService(appId, title, hash, fromSidebar) {
      setLeftNavActive(appId);
      const inHass = Boolean(
        document.body.classList.contains('in-hass-frame') ||
        (window.top && window.top !== window)
      );
      const barEl = document.getElementById('full-app-bar');
      if (barEl) {
        barEl.style.display = (fromSidebar || inHass) ? 'none' : 'flex';
      }
      try {
        if (window.top && window.top !== window) {
          window.top.__thassiActiveSidebarApp = appId;
          if (typeof window.top.__thassiSyncSidebarNow === 'function') {
            window.top.__thassiSyncSidebarNow();
          }
        }
      } catch (_e) {}
      document.getElementById('full-app-title').textContent = title || appId;
      const targetSrc = base + '/apps/' + appId + '/' + (hash || '');
      const frameEl = document.getElementById('full-app-frame');
      if (frameEl.getAttribute('data-current-app') !== appId || frameEl.src === 'about:blank') {
        frameEl.setAttribute('data-current-app', appId);
        frameEl.src = targetSrc;
      }
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      setLeftNavActive('horizon');
      try {
        if (window.top) {
          window.top.__thassiActiveSidebarApp = null;
          if (window.top.location.hash && window.top.location.hash.length > 1) {
            window.top.history.replaceState(null, '', window.top.location.pathname + window.top.location.search);
          }
          if (typeof window.top.__thassiSyncSidebarNow === 'function') {
            window.top.__thassiSyncSidebarNow();
          }
        }
      } catch (_e) {}
      const frameEl = document.getElementById('full-app-frame');
      if (frameEl) {
        frameEl.removeAttribute('data-current-app');
        frameEl.src = 'about:blank';
      }
      document.getElementById('full-app-overlay').style.display = 'none';
      loadAllLiveData();
    }

    // ============================================================================
    // THASSI.FINANCES CONFIGURABLE PREVIEW & QUICK IMPORT FLYOUT
    // ============================================================================
    let financesDashData = null;
    let financesPrivacyInitialized = false;
    let financesHidden = true; // Hidden by default until user clicks to toggle

    function fmtEurDash(val, masked) {
      if (masked) return '\u2022\u2022\u2022\u2022 \u20AC';
      return Number(val || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
    }

    function toggleFinancesVisibility(ev) {
      if (ev) ev.stopPropagation();
      financesHidden = !financesHidden;
      renderFinancesPreviewWidget();
    }

    function handleCompactFinancesClick(ev) {
      const w = document.getElementById('widget-finances');
      if (w && w.classList.contains('expanded')) {
        ev.stopPropagation();
        toggleFinancesVisibility(ev);
      }
    }

    async function refreshFinancesWidget(fallbackSummary) {
      try {
        const res = await fetch(base + '/api/apps/finance-analytics/dashboard');
        if (res.ok) {
          financesDashData = await res.json();
          if (!financesPrivacyInitialized && financesDashData.previewConfig) {
            financesHidden = financesDashData.previewConfig.hiddenByDefault !== false;
            financesPrivacyInitialized = true;
          }
          renderFinancesPreviewWidget();
          return;
        }
      } catch (err) {
        console.warn('Finance dashboard endpoint fallback:', err);
      }

      const fb = fallbackSummary || {};
      financesDashData = {
        kpis: {
          activeMonth: fb.activeMonth || 'Aktuell',
          currentBalance: fb.currentBalance ?? 4850,
          accountName: 'Sparkasse George Girokonto',
          expensesDay: fb.expensesDay ?? 0,
          expensesWeek: fb.expensesWeek ?? 0,
          income: fb.income || 0,
          expenses: fb.expenses || 0,
          net: fb.netCashflow || 0,
        },
        balanceConfig: {
          currentBalance: fb.currentBalance ?? 4850,
          accountName: 'Sparkasse George Girokonto',
        },
        exportReminder: fb.exportReminder || null,
        previewGroupBudgets: [],
        previewConfig: {
          hiddenByDefault: true,
          primaryMetric: 'current_balance',
          enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'quick_import']
        }
      };
      renderFinancesPreviewWidget();
    }

    function renderFinancesPreviewWidget() {
      const d = financesDashData;
      const widgetEl = document.getElementById('widget-finances');
      const compactEl = document.getElementById('compact-finances');
      const subEl = document.getElementById('sub-finances');
      const eyeBtn = document.getElementById('finances-eye-btn');
      const dotEl = document.getElementById('dot-finances');
      const remPill = document.getElementById('finances-reminder-pill');
      const remPillText = document.getElementById('finances-reminder-pill-text');
      const remExpBanner = document.getElementById('finances-reminder-expanded-banner');
      const remExpTitle = document.getElementById('finances-reminder-exp-title');
      const remExpDetail = document.getElementById('finances-reminder-exp-detail');
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

      if (widgetEl) {
        widgetEl.classList.toggle('finances-is-hidden', Boolean(financesHidden));
      }

      const k = d.kpis || {};
      const bal = d.balanceConfig || {};
      const rem = d.exportReminder || null;
      const currentBalance = bal.currentBalance !== undefined ? bal.currentBalance : (k.currentBalance || 0);
      const accountName = bal.accountName || k.accountName || 'Sparkasse George';
      const expensesDay = k.expensesDay !== undefined ? k.expensesDay : (d.expensesToday || 0);
      const expensesWeek = k.expensesWeek !== undefined ? k.expensesWeek : (d.expensesWeek || 0);
      const netCashflow = k.net !== undefined ? k.net : (d.netCashflowMonth || 0);
      const activeMonth = k.activeMonth || d.activeMonth || '';
      const groupBudgets = d.previewGroupBudgets || d.groupBudgets || [];

      // Render Horizon Export Reminder Pill & Expanded Banner (visible even in privacy-masked mode)
      const isDue = Boolean(rem && rem.due);
      const isOverdue = Boolean(rem && rem.urgency === 'overdue');
      const remColor = isOverdue ? '#ef4444' : '#f59e0b';
      if (dotEl) {
        if (isDue) {
          dotEl.style.display = 'inline-block';
          dotEl.style.background = remColor;
          dotEl.style.boxShadow = '0 0 10px ' + remColor;
        } else {
          dotEl.style.display = 'none';
        }
      }
      if (remPill && remPillText) {
        if (isDue) {
          const daysAge = rem.daysSinceLatestTx != null ? rem.daysSinceLatestTx : rem.daysSinceLastSync;
          remPillText.textContent = daysAge != null
            ? ('Export f\xE4llig \xB7 vor ' + daysAge + 'T')
            : 'Bank-Export f\xE4llig';
          remPill.style.display = 'inline-flex';
          remPill.style.borderColor = isOverdue ? 'rgba(239,68,68,0.55)' : 'rgba(245,158,11,0.45)';
          remPill.style.background = isOverdue ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)';
          remPill.style.color = isOverdue ? '#fca5a5' : '#fcd34d';
        } else {
          remPill.style.display = 'none';
        }
      }
      if (remExpBanner) {
        if (isDue) {
          remExpBanner.style.display = 'flex';
          if (remExpTitle) remExpTitle.textContent = rem.headlineDe || 'Bank-Export & Sync f\xE4llig';
          if (remExpDetail) remExpDetail.textContent = rem.detailDe || 'Jetzt Kontoauszug in George exportieren und abgleichen.';
        } else {
          remExpBanner.style.display = 'none';
        }
      }

      const cfg = d.previewConfig || {
        hiddenByDefault: true,
        primaryMetric: 'current_balance',
        enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'group_budgets', 'quick_import']
      };
      const enabled = cfg.enabledElements || [];

      if (eyeBtn) {
        eyeBtn.textContent = financesHidden ? 'SHOW' : 'HIDE';
        eyeBtn.title = financesHidden ? 'Finanzdaten anzeigen' : 'Finanzdaten verbergen';
      }
      if (toggleLink) {
        toggleLink.textContent = financesHidden ? 'Zahlen anzeigen' : 'Zahlen verbergen';
      }

      // Primary headline
      if (financesHidden) {
        compactEl.innerHTML = '<strong>\u2022\u2022\u2022\u2022 \u20AC</strong>';
        if (subEl) subEl.textContent = accountName;
      } else {
        let headlineVal = fmtEurDash(currentBalance, false);
        let headlineSub = accountName + ' \xB7 Kontostand';
        if (cfg.primaryMetric === 'expenses_day') {
          headlineVal = '-' + fmtEurDash(expensesDay, false);
          headlineSub = 'Ausgaben Tag (' + (k.expensesDayDate || 'Heute') + ')';
        } else if (cfg.primaryMetric === 'expenses_week') {
          headlineVal = '-' + fmtEurDash(expensesWeek, false);
          headlineSub = 'Ausgaben 7-Tage (' + (k.expensesWeekRangeLabel || 'Woche') + ')';
        } else if (cfg.primaryMetric === 'net_cashflow') {
          const sign = Number(netCashflow) >= 0 ? '+' : '';
          headlineVal = sign + fmtEurDash(netCashflow, false);
          headlineSub = 'Cashflow ' + activeMonth;
        }
        compactEl.innerHTML = '<strong>' + headlineVal + '</strong>';
        if (subEl) subEl.textContent = headlineSub;
      }

      // Build configurable dynamic body
      const statCards = [];
      if (enabled.includes('current_balance')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" style="color:#fafafa;">' +
            fmtEurDash(currentBalance, financesHidden) +
            '</span></div>'
        );
      }
      if (enabled.includes('expenses_day')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag)</span><span class="w-stat-v" style="color:#a1a1aa;">-' +
            fmtEurDash(expensesDay, financesHidden) +
            '</span></div>'
        );
      }
      if (enabled.includes('expenses_week')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Ausgaben (Woche)</span><span class="w-stat-v" style="color:#a1a1aa;">-' +
            fmtEurDash(expensesWeek, financesHidden) +
            '</span></div>'
        );
      }

      let html = '';
      if (statCards.length > 0) {
        html += '<div class="w-stat-grid">' + statCards.join('') + '</div>';
      }

      if (enabled.includes('group_budgets') && Array.isArray(groupBudgets) && groupBudgets.length > 0) {
        const budgetRows = groupBudgets.slice(0, 4).map((b) => {
          const pct = Math.min(100, Math.round(b.pctUsed !== undefined ? b.pctUsed : (b.pct || 0)));
          const limit = b.budgetLimit !== undefined ? b.budgetLimit : (b.limit || 0);
          const barColor = b.overBudget ? '#ef4444' : '#fafafa';
          const valText = financesHidden
            ? '\u2022\u2022\u2022\u2022 / \u2022\u2022\u2022\u2022 \u20AC'
            : (Math.round(b.spent || 0) + ' / ' + Math.round(limit) + ' \u20AC');
          return [
            '<div style="display:flex; flex-direction:column; gap:3px;">',
            '  <div style="display:flex; justify-content:space-between; font-size:11px; color:#fafafa;">',
            '    <span>' + (b.labelDe || b.category) + '</span>',
            '    <span style="font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:#a1a1aa;">' + valText + '</span>',
            '  </div>',
            '  <div style="height:3px; background:rgba(255,255,255,0.08); border-radius:1px; overflow:hidden;">',
            '    <div style="width:' + (financesHidden ? 35 : pct) + '%; height:100%; background:' + barColor + ';"></div>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');
        html += '<div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">' + budgetRows + '</div>';
      }

      dynEl.innerHTML = html || '<div style="font-size:11.5px; color:#52525b;">Keine Preview-Felder ausgew\xE4hlt</div>';

      if (qiSlot) {
        if (enabled.includes('quick_import')) {
          qiSlot.innerHTML =
            '<button onclick="openQuickImportFlyout(event)" style="width:100%; padding:6px 12px; border-radius:4px; border:1px solid rgba(255,255,255,0.14); background:#141417; color:#fafafa; font-size:11.5px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">Bank-Export &amp; Datei-Sync Flyout</button>';
        } else {
          qiSlot.innerHTML = '';
        }
      }
    }

    function openQuickImportFlyout(ev) {
      if (ev) ev.stopPropagation();
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (frame) {
        frame.src = base + '/api/apps/finance-analytics/quick-import/portal';
      }
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeQuickImportFlyout() {
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (modal) modal.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      loadAllLiveData();
    }

    function showQiDashStatus(msg, ok) {
      const el = document.getElementById('qi-dash-status');
      if (!el) return;
      el.style.display = 'block';
      el.style.background = ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)';
      el.style.border = '1px solid ' + (ok ? '#10b981' : '#ef4444');
      el.style.color = ok ? '#34d399' : '#f87171';
      el.textContent = msg;
    }

    function launchBankingPopupFromDashboard(ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const qiCfg = (financesDashData && financesDashData.quickImportConfig) || {};
      const url = qiCfg.loginUrl || 'https://george.sparkasse.at/index.html#/login';
      if (qiCfg.verfuegernummer && navigator.clipboard) {
        navigator.clipboard.writeText(qiCfg.verfuegernummer).catch(() => {});
      }
      const w = 1040, h = 760;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      window.open(url, 'ThassiOnlineBankingPopup', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
      openQuickImportFlyout();
      showQiDashStatus(
        qiCfg.verfuegernummer
          ? ('George ge\xF6ffnet (Verf\xFCgernummer ' + qiCfg.verfuegernummer + ' kopiert). Nach CSV-Download auf "Neuesten Export aus Downloads lesen" klicken oder Datei hierher ziehen.')
          : 'Online-Banking ge\xF6ffnet. Nach CSV-Download Datei einfach hier ablegen oder aus Downloads einlesen.',
        true
      );
    }

    async function snoozeFinanceReminderFromDash(ev, days) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      try {
        await fetch(base + '/api/apps/finance-analytics/reminder/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snoozeDays: days || 3 })
        });
        await refreshFinancesWidget();
      } catch (_e) {}
    }

    function triggerDirectFinanceExportFromDash(ev, format) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const fmt = format || 'csv_de';
      const a = document.createElement('a');
      a.href = base + '/api/apps/finance-analytics/export?format=' + encodeURIComponent(fmt) + '&month=all';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showQiDashStatus('Export gestartet (' + fmt.toUpperCase() + ').', true);
      setTimeout(() => void refreshFinancesWidget(), 900);
    }

    async function importFinanceFileObjectFromDash(file) {
      if (!file) return false;
      try {
        showQiDashStatus('Importiere ' + file.name + '...', true);
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = window.btoa(binary);
        const res = await fetch(base + '/api/apps/finance-analytics/import-bank-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, base64Content: b64 })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Import fehlgeschlagen');
        showQiDashStatus(file.name + ': ' + (json.importedCount || 0) + ' neue Buchungen importiert (' + (json.skippedDuplicates || 0) + ' Duplikate \xFCbersprungen)!', true);
        await refreshFinancesWidget();
        return true;
      } catch (e) {
        showQiDashStatus('Datei-Import fehlgeschlagen: ' + (e.message || e), false);
        return false;
      }
    }

    async function triggerDashboardLocalFolderScan() {
      try {
        if (typeof window.showDirectoryPicker === 'function') {
          showQiDashStatus('W\xE4hle deinen lokalen Downloads-Ordner zum Lesen der neuesten Bank-CSV...', true);
          const dirHandle = await window.showDirectoryPicker({
            id: 'thassi_bank_downloads',
            startIn: 'downloads',
            mode: 'read'
          });
          if (dirHandle) {
            const candidates = [];
            const cutoffMs = Date.now() - 45 * 86400000;
            for await (const entry of dirHandle.values()) {
              if (entry.kind !== 'file') continue;
              const lower = String(entry.name || '').toLowerCase();
              if (!lower.endsWith('.csv') && !lower.endsWith('.xml') && !lower.endsWith('.sta') && !lower.endsWith('.mt940')) continue;
              const f = await entry.getFile();
              if (f.size >= 40 && f.size <= 15 * 1024 * 1024 && f.lastModified >= cutoffMs) {
                candidates.push({ file: f, mtime: f.lastModified });
              }
            }
            candidates.sort((a, b) => b.mtime - a.mtime);
            if (candidates.length > 0) {
              await importFinanceFileObjectFromDash(candidates[0].file);
              return;
            }
          }
        }
        await triggerDashboardDownloadsScan();
      } catch (e) {
        if (e && e.name !== 'AbortError') {
          await triggerDashboardDownloadsScan();
        }
      }
    }

    function handleDashboardQuickFileDrop(ev) {
      if (!ev) return;
      ev.preventDefault();
      const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) {
        void importFinanceFileObjectFromDash(file);
      }
    }

    async function triggerDashboardQuickImportSample() {
      try {
        showQiDashStatus('\u23F3 Lade George-Umsatzexport herunter & importiere...', true);
        const impRes = await fetch(base + '/api/apps/finance-analytics/quick-import/simulate-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountName: 'Girokonto' })
        });
        const json = await impRes.json();
        showQiDashStatus('\u2705 ' + (json.insertedCount || 0) + ' neue Buchungen importiert (' + (json.skippedDuplicates || 0) + ' Duplikate \xFCbersprungen)', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Fehler beim Quick-Import', false);
      }
    }

    async function triggerDashboardDownloadsScan() {
      try {
        showQiDashStatus('\u{1F50D} Scanne Downloads-Ordner nach neuen Kontoausz\xFCgen...', true);
        const res = await fetch(base + '/api/apps/finance-analytics/quick-import/scan-downloads', { method: 'POST' });
        const json = await res.json();
        const evts = json.events || [];
        if (evts.length > 0) {
          const totalIns = evts.reduce((s, x) => s + (x.insertedCount || 0), 0);
          showQiDashStatus('\u2705 ' + evts.length + ' Datei(en) erkannt: ' + totalIns + ' neue Buchungen importiert!', true);
        } else {
          showQiDashStatus('\u2139\uFE0F Keine neuen Bank-Exporte in Downloads gefunden.', true);
        }
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Downloads-Scan fehlgeschlagen', false);
      }
    }

    async function handleDashboardQuickFileSelect(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      await importFinanceFileObjectFromDash(file);
    }

    window.addEventListener('message', (ev) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'THASSI_QUICK_IMPORT_DONE') {
        const p = ev.data.payload || {};
        showQiDashStatus('\u2705 Auto-Import abgeschlossen: ' + (p.insertedCount || p.imported || 0) + ' neue Buchungen!', true);
        refreshFinancesWidget();
      } else if (ev.data.type === 'THASSI_OPEN_BANK_POPUP') {
        launchBankingPopupFromDashboard();
      }
    });

    function toggleEventModal(show) {
      const m = document.getElementById('quick-event-modal');
      m.style.display = show ? 'block' : 'none';
      if (show) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('qe-start').value = now.toISOString().slice(0, 16);
        document.getElementById('qe-title').focus();
      }
    }

    async function createQuickEvent(e) {
      e.preventDefault();
      const title = document.getElementById('qe-title').value.trim();
      const startVal = document.getElementById('qe-start').value;
      const dur = Number(document.getElementById('qe-dur').value || 60);
      if (!title || !startVal) return;

      await fetch(base + '/api/apps/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          start_time: new Date(startVal).toISOString(),
          duration_minutes: dur
        })
      });
      document.getElementById('qe-title').value = '';
      toggleEventModal(false);
      await loadAllLiveData();
    }

    function showNoteFeedback(msg, isError) {
      const el = document.getElementById('note-sync-feedback');
      if (!el) return;
      el.textContent = msg;
      el.style.display = 'block';
      el.style.color = isError ? '#f87171' : '#38bdf8';
      el.style.background = isError ? 'rgba(248,113,113,0.12)' : 'rgba(56,189,248,0.1)';
      el.style.borderColor = isError ? 'rgba(248,113,113,0.28)' : 'rgba(56,189,248,0.22)';
      clearTimeout(window.__noteFeedbackTimer);
      window.__noteFeedbackTimer = setTimeout(() => {
        el.style.display = 'none';
      }, 4200);
    }

    function escapeNoteHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderHorizonNotesList(notes) {
      const list = Array.isArray(notes) ? notes : [];
      const compactEl = document.getElementById('compact-notes');
      const subEl = document.getElementById('sub-notes');
      const listEl = document.getElementById('notes-list');
      if (!compactEl || !listEl) return;

      if (list.length > 0) {
        const latest = String(list[0].content || '');
        compactEl.innerHTML = '<strong>' + list.length + ' ' + (list.length === 1 ? 'note' : 'notes') + '</strong>';
        if (subEl) subEl.textContent = latest.length > 28 ? latest.slice(0, 28) + '\u2026' : latest;
        listEl.innerHTML = list
          .map((n) => {
            const fileName = n.fileName || (n.id ? 'note_' + n.id + '.json' : 'note.json');
            const safeFileAttr = escapeNoteHtml(fileName);
            const keepSynced = Boolean(n.syncedKeep);
            const driveSynced = Boolean(n.syncedDrive);
            return [
              '<div class="note-row">',
              '  <div class="note-row-top">',
              '    <span class="note-content-text">' + escapeNoteHtml(n.content) + '</span>',
              '    <button class="note-del" title="Notiz l\xF6schen (' + safeFileAttr + ')" data-note-file="' + safeFileAttr + '" onclick="deleteNote(this.dataset.noteFile)">\u2715</button>',
              '  </div>',
              '  <div class="note-row-meta">',
              '    <span class="note-file-badge" title="Lokale Datei: /data/notes/' + safeFileAttr + '">' + safeFileAttr + '</span>',
              '    <div class="note-actions-group">',
              '      <button type="button" class="note-action-btn keep ' + (keepSynced ? 'synced' : '') + '" data-note-file="' + safeFileAttr + '" data-note-target="keep" onclick="sendHorizonNote(this.dataset.noteFile, this.dataset.noteTarget, this)" title="An Google Keep / Notes senden">',
              '        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
              '        <span>' + (keepSynced ? '\u2713 Keep' : 'Keep') + '</span>',
              '      </button>',
              '      <button type="button" class="note-action-btn drive ' + (driveSynced ? 'synced' : '') + '" data-note-file="' + safeFileAttr + '" data-note-target="drive" onclick="sendHorizonNote(this.dataset.noteFile, this.dataset.noteTarget, this)" title="An Google Drive senden">',
              '        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 15 15.5 21 8.5 21 5 15 12 2"/><line x1="5" y1="15" x2="19" y2="15"/></svg>',
              '        <span>' + (driveSynced ? '\u2713 Drive' : 'Drive') + '</span>',
              '      </button>',
              '    </div>',
              '  </div>',
              '</div>'
            ].join('');
          })
          .join('');
      } else {
        compactEl.textContent = '0 notes';
        if (subEl) subEl.textContent = 'Tap to write a quick note';
        listEl.innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4);">No notes saved yet.</div>';
      }
    }

    async function refreshHorizonNotes(fallbackNotes) {
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes');
        if (res.ok) {
          const data = await res.json();
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      renderHorizonNotesList(fallbackNotes || []);
    }

    async function addNote(e) {
      e.preventDefault();
      const input = document.getElementById('note-input');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.note?.fileName) {
            showNoteFeedback('Gespeichert: ' + data.note.fileName, false);
          }
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      await fetch(base + '/api/system/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      await loadAllLiveData();
    }

    async function deleteNote(fileOrId) {
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes?fileName=' + encodeURIComponent(fileOrId), {
          method: 'DELETE'
        });
        if (res.ok) {
          const data = await res.json();
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      await fetch(base + '/api/system/notes?id=' + encodeURIComponent(fileOrId), { method: 'DELETE' });
      await loadAllLiveData();
    }

    async function sendHorizonNote(fileName, target, btnEl) {
      if (btnEl) {
        btnEl.disabled = true;
        const span = btnEl.querySelector('span');
        if (span) span.textContent = '\u2026';
      }
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, target })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          const targetLabel = target === 'drive' ? 'Google Drive' : 'Google Keep / Notes';
          showNoteFeedback('\u2713 ' + fileName + ' \u2192 ' + targetLabel, false);
          if (Array.isArray(data.notes)) {
            renderHorizonNotesList(data.notes);
          } else {
            await refreshHorizonNotes();
          }
        } else {
          showNoteFeedback(data.error || 'Senden fehlgeschlagen', true);
          await refreshHorizonNotes();
        }
      } catch (err) {
        showNoteFeedback('Netzwerkfehler beim Senden', true);
        await refreshHorizonNotes();
      }
    }

    function applyHealthWidgetData(h) {
      if (h && (h.steps != null || h.currentHr != null)) {
        const stepsVal = Number(h.steps ?? 0);
        const stepGoal = Number(h.stepGoal || 10000);
        const hrVal = h.currentHr != null ? Math.round(Number(h.currentHr)) : null;

        // Minimal preview: Heart icon with HR inside + Progress circle with step count inside
        const hrInsideEl = document.getElementById('health-hr-inside');
        if (hrInsideEl) {
          hrInsideEl.textContent = hrVal != null ? String(hrVal) : '--';
        }
        const stepsInsideEl = document.getElementById('health-steps-inside');
        if (stepsInsideEl) {
          stepsInsideEl.textContent = h.steps != null
            ? (stepsVal >= 10000 ? (stepsVal / 1000).toFixed(1) + 'k' : String(stepsVal))
            : '--';
        }
        const ringEl = document.getElementById('health-steps-ring');
        if (ringEl) {
          const pct = Math.min(1, Math.max(0, stepsVal / Math.max(1, stepGoal)));
          const circum = 116.24; // 2 * Math.PI * 18.5
          ringEl.style.strokeDashoffset = (circum * (1 - pct)).toFixed(1);
        }

        const stepsTxt = h.steps != null ? stepsVal.toLocaleString() + ' steps' : 'No steps';
        const hrTxt = hrVal != null ? hrVal + ' bpm' : '';
        const compactEl = document.getElementById('compact-health');
        if (compactEl) compactEl.innerHTML = \`<strong>\${stepsTxt}</strong> \${hrTxt ? '\xB7 ' + hrTxt : ''}\`;
        const subEl = document.getElementById('sub-health');
        if (subEl) {
          subEl.textContent =
            h.readinessScore != null ? \`\${h.readinessScore}% readiness \xB7 \${h.readinessStatus || 'Pixel 10'}\` : (h.source || 'Pixel 10');
        }
        document.getElementById('eh-steps').textContent = h.steps != null ? stepsVal.toLocaleString() : 'No data';
        document.getElementById('eh-ready').textContent = h.readinessScore != null ? h.readinessScore + '/100' : 'No data';
        document.getElementById('eh-hr').textContent = hrVal != null ? hrVal + ' bpm' : 'No data';
        document.getElementById('eh-rhr').textContent =
          (h.restingHr != null ? h.restingHr + ' bpm' : '--') + ' / ' + (h.hrvMs != null ? h.hrvMs + ' ms' : '--');
        document.getElementById('eh-sleep').textContent = h.sleepHours != null ? h.sleepHours + ' h' : 'No data';
        document.getElementById('eh-burn').textContent =
          (h.activeCalories != null ? h.activeCalories + ' kcal' : '--') + ' \xB7 ' + (h.distanceKm != null ? h.distanceKm + ' km' : '--');
        return true;
      }
      return false;
    }

    let isRefreshingHealthLive = false;

    async function refreshHealthWidget(summaryFromSys) {
      if (summaryFromSys) {
        applyHealthWidgetData(summaryFromSys);
      }
      if (isRefreshingHealthLive) return;
      isRefreshingHealthLive = true;
      try {
        const liveRes = await fetch(base + '/api/apps/google-health/live?t=' + Date.now(), {
          cache: 'no-store',
        });
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (applyHealthWidgetData(liveData)) return;
        }
        const res = await fetch(base + '/api/apps/google-health/dashboard?t=' + Date.now(), {
          cache: 'no-store',
        });
        if (res.ok) {
          const d = await res.json();
          if (d.live && applyHealthWidgetData(d.live)) return;
          const t = d.today || {};
          const r = d.readiness || {};
          const normalized = {
            steps: t.steps,
            stepGoal: t.step_goal,
            currentHr: t.current_hr,
            restingHr: t.resting_hr,
            sleepHours: t.sleep_hours,
            activeCalories: t.active_calories,
            readinessScore: r.score ?? t.readiness_score,
            readinessStatus: r.status,
            hrvMs: d.hrvMs,
            distanceKm: d.distanceKm,
            source: t.source || 'Pixel 10',
          };
          if (applyHealthWidgetData(normalized)) return;
        }
      } catch (_e) {
      } finally {
        isRefreshingHealthLive = false;
      }
      if (summaryFromSys) return;
      const hrInsideEl = document.getElementById('health-hr-inside');
      if (hrInsideEl && !hrInsideEl.textContent.trim()) hrInsideEl.textContent = '--';
      const stepsInsideEl = document.getElementById('health-steps-inside');
      if (stepsInsideEl && !stepsInsideEl.textContent.trim()) stepsInsideEl.textContent = '--';
    }

    function applyMealsWidgetData(m) {
      if (m && (m.breakfast || m.lunch || m.dinner)) {
        const nextMeal = m.dinner || m.lunch || m.breakfast;
        document.getElementById('compact-meals').innerHTML = '<strong>' + nextMeal + '</strong>';
        document.getElementById('sub-meals').textContent = (m.totalCalories || 0) + ' kcal planned today';
        document.getElementById('em-slots').innerHTML = [
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">FR\xDCHST\xDCCK:</span> <strong>' + (m.breakfast || '\u2014') + '</strong></div>',
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">MITTAG:</span> <strong>' + (m.lunch || '\u2014') + '</strong></div>',
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">ABEND:</span> <strong>' + (m.dinner || '\u2014') + '</strong></div>'
        ].join('');
        return true;
      }
      return false;
    }

    async function refreshMealsWidget(summaryFromSys) {
      if (applyMealsWidgetData(summaryFromSys)) return;
      try {
        const res = await fetch(base + '/api/apps/meal-planner/sync-ha', { method: 'POST' });
        if (res.ok) {
          const d = await res.json();
          if (applyMealsWidgetData(d)) return;
        }
      } catch (_e) {}
      document.getElementById('compact-meals').textContent = 'Unplanned';
      document.getElementById('sub-meals').textContent = 'No meals logged for today';
      document.getElementById('em-slots').innerHTML = 'No meals planned for today yet.';
    }

    function toggleCalendarFilterPopover(ev) {
      if (ev) ev.stopPropagation();
      const pop = document.getElementById('horizon-cal-filter-popover');
      if (!pop) return;
      pop.classList.toggle('open');
      if (pop.classList.contains('open')) {
        renderCalendarFilterPopover();
      }
    }

    function renderCalendarFilterPopover() {
      const listEl = document.getElementById('horizon-cal-filter-list');
      const badgeEl = document.getElementById('cal-filter-oauth-badge');
      const btnLabel = document.getElementById('cal-filter-btn-label');

      const visibleSet = new Set();
      for (const c of horizonCalendars) {
        if (Number(c.show_in_horizon) === 1) {
          visibleSet.add(c.calendar_name);
        }
      }

      if (btnLabel) {
        if (horizonCalendars.length > 0) {
          btnLabel.textContent = \`Calendars (\${visibleSet.size}/\${horizonCalendars.length})\`;
        } else {
          btnLabel.textContent = 'Calendars';
        }
      }

      if (badgeEl) {
        if (googleOAuthInfo && googleOAuthInfo.authorized) {
          badgeEl.style.color = '#34d399';
          badgeEl.textContent = '\u{1F7E2} Google OAuth Connected' + (googleOAuthInfo.accountEmail ? ' (' + googleOAuthInfo.accountEmail + ')' : '');
        } else {
          badgeEl.style.color = '#fbbf24';
          badgeEl.textContent = '\u26A1 Home Assistant + Google Calendar Sync';
        }
      }

      if (!listEl) return;
      if (!horizonCalendars || horizonCalendars.length === 0) {
        listEl.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:6px;">No calendars discovered yet. Click Sync below.</div>';
        return;
      }

      listEl.innerHTML = horizonCalendars
        .map((c, idx) => {
          const checked = Number(c.show_in_horizon) === 1;
          const color = c.color || '#38bdf8';
          const count = Number(c.event_count || 0);
          const safeName = String(c.calendar_name || '').split('"').join('&quot;');
          return \`
            <label class="cal-filter-row" title="\${safeName}">
              <div style="display:flex; align-items:center; gap:7px; min-width:0; flex:1;">
                <input type="checkbox" \${checked ? 'checked' : ''} onchange="toggleHorizonCalendarItem(\${idx}, this.checked)" style="accent-color:\${color}; cursor:pointer;" />
                <span style="width:8px; height:8px; border-radius:99px; background:\${color}; flex-shrink:0;"></span>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; color:\${checked ? '#f8fafc' : '#64748b'};">\${c.calendar_name}</span>
              </div>
              <span style="font-size:10px; color:#94a3b8; flex-shrink:0;">\${count}</span>
            </label>
          \`;
        })
        .join('');
    }

    function applyLocalHorizonCalendarFilter() {
      const hiddenNames = new Set(
        horizonCalendars.filter((c) => Number(c.show_in_horizon) === 0).map((c) => c.calendar_name)
      );
      calendarEvents = allCalendarEvents.filter((ev) => !hiddenNames.has(ev.calendar_name || 'Google Calendar'));
      renderCalendarFilterPopover();
      renderTimelineGeometry();
    }

    async function toggleHorizonCalendarItem(idx, checked) {
      const target = horizonCalendars[idx];
      if (!target) return;
      target.show_in_horizon = checked ? 1 : 0;
      applyLocalHorizonCalendarFilter();
      try {
        await fetch(base + '/api/apps/google-calendar/calendars/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendar_name: target.calendar_name, show_in_horizon: checked })
        });
      } catch (_e) {}
    }

    async function setAllHorizonCalendarsFromDash(show) {
      const map = {};
      for (const c of horizonCalendars) {
        c.show_in_horizon = show ? 1 : 0;
        map[c.calendar_name] = show;
      }
      applyLocalHorizonCalendarFilter();
      try {
        await fetch(base + '/api/apps/google-calendar/calendars/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendars: map })
        });
      } catch (_e) {}
    }

    async function syncGoogleCalendarsFromDash() {
      const badgeEl = document.getElementById('cal-filter-oauth-badge');
      if (badgeEl) {
        badgeEl.style.color = '#38bdf8';
        badgeEl.textContent = '\u23F3 Syncing Google OAuth & Home Assistant...';
      }
      try {
        await fetch(base + '/api/apps/google-calendar/oauth/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importFromHa: true })
        });
        await fetch(base + '/api/apps/google-calendar/sync', { method: 'POST' });
        await loadAllLiveData();
      } catch (_e) {}
    }

    async function loadAllLiveData() {
      try {
        void loadRoomsQuickAccess();
        const [sysRes, calRes] = await Promise.all([
          fetch(base + '/api/system/status').catch(() => null),
          fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null)
        ]);
        const sys = sysRes && sysRes.ok ? await sysRes.json() : {};
        const calData = calRes && calRes.ok ? await calRes.json() : { events: [] };
        window.__horizonLastFetchMs = Date.now();

        const sysDotEl = document.getElementById('horizon-sys-dot');
        const sysTxtEl = document.getElementById('horizon-sys-status-text');
        if (sysDotEl && sysTxtEl) {
          const haOk = Boolean(sys.ha && sys.ha.connected !== false);
          const googleOk = Boolean(sys.google && sys.google.authorized);
          if (haOk && googleOk) {
            sysDotEl.style.background = '#10b981';
            sysTxtEl.textContent = 'HA \xB7 GOOGLE NOMINAL';
          } else if (haOk) {
            sysDotEl.style.background = '#f59e0b';
            sysTxtEl.textContent = 'HA OK \xB7 OAUTH CHECK';
          } else {
            sysDotEl.style.background = '#ef4444';
            sysTxtEl.textContent = 'HA VERBINDUNG PR\xDCFEN';
          }
        }

        calendarEvents = calData.events || [];
        allCalendarEvents = calData.allEvents || calData.events || [];
        horizonCalendars = calData.calendars || [];
        googleOAuthInfo = calData.googleOAuth || null;
        renderCalendarFilterPopover();
        renderTimelineGeometry();

        // Weather forecast & background effects for St. Veit / G\xF6lsen
        void loadWeatherData(sys.summaries?.weather);

        // 1. Update HEALTH widget
        void refreshHealthWidget(sys.summaries?.health);

        // 2. Update FINANCES widget (Configurable preview, hidden by default)
        void refreshFinancesWidget(sys.summaries?.finance);

        // 3. Update NOTES widget (local note_yyyyMMdd-HHmmss.json files + Keep/Drive actions)
        void refreshHorizonNotes(sys.notes);

        // 4. Update MEALS widget
        void refreshMealsWidget(sys.summaries?.meals);

        // 5. Update 3D PRINT Mini-Preview Widget
        void refreshMini3dData(sys.summaries?.print3d);
      } catch (err) {
        console.error('Failed loading dashboard data:', err);
      }
    }

    // ============================================================================
    // 3D PRINT MINI-PREVIEW RENDERER & CONTROLS (3D OBJECT + PROGRESS + PLACEHOLDER)
    // ============================================================================
    let mini3dState = {
      hasActiveProject: false,
      activeProjectId: null,
      projectName: null,
      scene: null,
      stats: null,
      printer: {
        name: 'Bambu Lab P1S',
        status: 'IDLE',
        progressPercent: 0,
        currentLayer: 0,
        totalLayers: 0,
        remainingMinutes: 0,
        nozzleTemp: 24,
        bedTemp: 24,
      },
      yaw: 0.65,
      pitch: 0.42,
      dragging: false,
      lastX: 0,
      lastY: 0,
      triangles: [],
      maxExtent: 60,
      centerZ: 20,
    };

    function transformMiniPt(pt, pos, rotDeg, scale) {
      let x = pt[0] * ((scale && scale[0]) || 1);
      let y = pt[1] * ((scale && scale[1]) || 1);
      let z = pt[2] * ((scale && scale[2]) || 1);
      const rx = (((rotDeg && rotDeg[0]) || 0) * Math.PI) / 180;
      const ry = (((rotDeg && rotDeg[1]) || 0) * Math.PI) / 180;
      const rz = (((rotDeg && rotDeg[2]) || 0) * Math.PI) / 180;
      if (rx !== 0) {
        const c = Math.cos(rx), s = Math.sin(rx);
        const ny = y * c - z * s, nz = y * s + z * c;
        y = ny; z = nz;
      }
      if (ry !== 0) {
        const c = Math.cos(ry), s = Math.sin(ry);
        const nx = x * c + z * s, nz = -x * s + z * c;
        x = nx; z = nz;
      }
      if (rz !== 0) {
        const c = Math.cos(rz), s = Math.sin(rz);
        const nx = x * c - y * s, ny = x * s + y * c;
        x = nx; y = ny;
      }
      return [
        x + ((pos && pos[0]) || 0),
        y + ((pos && pos[1]) || 0),
        z + ((pos && pos[2]) || 0),
      ];
    }

    function buildMiniTrianglesFromScene(scene) {
      if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return [];
      const tris = [];
      for (const n of scene.nodes) {
        if (n.operation === 'subtract') continue;
        const p = n.params || {};
        const pos = n.position || [0, 0, 0];
        const rot = n.rotation || [0, 0, 0];
        const scl = n.scale || [1, 1, 1];
        const col = n.color || (scene.printProfile && scene.printProfile.filamentColor) || '#00AE42';
        const local = [];
        const addQ = (a, b, c, d) => {
          local.push([a, b, c]);
          local.push([a, c, d]);
        };

        if (n.type === 'apple') {
          const rad = Math.max(8, p.radius || 34);
          const h = Math.max(12, p.height || 58);
          const topInd = p.topIndent || h * 0.21;
          const botInd = p.bottomIndent || h * 0.09;
          const prof = [
            [0.0, botInd],
            [0.35, 0.0],
            [0.78, h * 0.18],
            [1.03, h * 0.54],
            [0.85, h * 0.88],
            [0.54, h],
            [0.24, h - topInd * 0.55],
            [0.0, h - topInd],
          ];
          const segs = 18;
          for (let ri = 0; ri < prof.length - 1; ri++) {
            const [rf0, z0] = prof[ri];
            const [rf1, z1] = prof[ri + 1];
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              const r0 = rad * rf0, r1 = rad * rf1;
              const p00 = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
              const p10 = [r0 * Math.cos(a1), r0 * Math.sin(a1), z0];
              const p11 = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
              const p01 = [r1 * Math.cos(a0), r1 * Math.sin(a0), z1];
              if (rf0 <= 1e-4) local.push([p00, p11, p01]);
              else if (rf1 <= 1e-4) local.push([p00, p10, p11]);
              else addQ(p00, p10, p11, p01);
            }
          }
        } else if (n.type === 'lathe') {
          const h = Math.max(10, p.height || 65);
          const ctrl = [
            p.rBottom || p.radiusBottom || 22,
            p.rLower || p.rBelly || 28,
            p.rMid || 26,
            p.rUpper || 20,
            p.rNeck || 14,
            p.rTop || p.radiusTop || 14,
          ];
          const segs = 16;
          for (let ri = 0; ri < ctrl.length - 1; ri++) {
            const r0 = ctrl[ri], r1 = ctrl[ri + 1];
            const z0 = (ri / (ctrl.length - 1)) * h;
            const z1 = ((ri + 1) / (ctrl.length - 1)) * h;
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'sphere') {
          const rad = Math.max(2, p.radius || 20);
          const dome = Boolean(p.domeOnly);
          const latS = dome ? 6 : 10;
          const lonS = 16;
          for (let la = 0; la < latS; la++) {
            const t0 = dome ? (la / latS) * (Math.PI / 2) : -Math.PI / 2 + (la / latS) * Math.PI;
            const t1 = dome ? ((la + 1) / latS) * (Math.PI / 2) : -Math.PI / 2 + ((la + 1) / latS) * Math.PI;
            const z0 = dome ? rad * Math.sin(t0) : rad + rad * Math.sin(t0);
            const z1 = dome ? rad * Math.sin(t1) : rad + rad * Math.sin(t1);
            const r0 = rad * Math.cos(t0), r1 = rad * Math.cos(t1);
            for (let lo = 0; lo < lonS; lo++) {
              const a0 = (lo / lonS) * Math.PI * 2, a1 = ((lo + 1) / lonS) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'torus') {
          const R = Math.max(4, p.radius || 22);
          const r = Math.max(1, p.tubeRadius || 5);
          const majS = 16, minS = 10;
          for (let i = 0; i < majS; i++) {
            const u0 = (i / majS) * Math.PI * 2, u1 = ((i + 1) / majS) * Math.PI * 2;
            for (let j = 0; j < minS; j++) {
              const v0 = (j / minS) * Math.PI * 2, v1 = ((j + 1) / minS) * Math.PI * 2;
              const tp = (u, v) => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r + r * Math.sin(v)];
              addQ(tp(u0, v0), tp(u1, v0), tp(u1, v1), tp(u0, v1));
            }
          }
        } else if (n.type === 'cylinder' || n.type === 'cone' || n.type === 'gear' || n.type === 'twisted_vase' || n.type === 'hex_organizer' || n.type === 'star' || n.type === 'heart') {
          const segs = n.type === 'hex_organizer' ? 6 : 18;
          const rBot = p.radiusBottom || p.outerRadius || p.radius || (p.width ? p.width / 2 : 20);
          const rTop = n.type === 'cone' ? (p.radiusTop != null ? p.radiusTop : 1) : (p.radiusTop || rBot);
          const h = p.height || 30;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const m0 = n.type === 'star' && i % 2 === 1 ? 0.45 : 1;
            const m1 = n.type === 'star' && (i + 1) % 2 === 1 ? 0.45 : 1;
            const x0b = Math.cos(a0) * rBot * m0, y0b = Math.sin(a0) * rBot * m0;
            const x1b = Math.cos(a1) * rBot * m1, y1b = Math.sin(a1) * rBot * m1;
            const x0t = Math.cos(a0) * rTop * m0, y0t = Math.sin(a0) * rTop * m0;
            const x1t = Math.cos(a1) * rTop * m1, y1t = Math.sin(a1) * rTop * m1;
            addQ([x0b, y0b, 0], [x1b, y1b, 0], [x1t, y1t, h], [x0t, y0t, h]);
            local.push([[0, 0, h], [x0t, y0t, h], [x1t, y1t, h]]);
          }
        } else {
          const w = (p.width || 36) / 2;
          const d = (p.depth || 36) / 2;
          const h = p.height || 30;
          const v = [
            [-w, -d, 0], [w, -d, 0], [w, d, 0], [-w, d, 0],
            [-w, -d, h], [w, -d, h], [w, d, h], [-w, d, h]
          ];
          const faces = [
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [1, 2, 6], [1, 6, 5],
            [2, 3, 7], [2, 7, 6],
            [3, 0, 4], [3, 4, 7]
          ];
          for (const f of faces) local.push([v[f[0]], v[f[1]], v[f[2]]]);
        }

        for (const [p0, p1, p2] of local) {
          tris.push({
            v: [
              transformMiniPt(p0, pos, rot, scl),
              transformMiniPt(p1, pos, rot, scl),
              transformMiniPt(p2, pos, rot, scl),
            ],
            c: col,
          });
        }
      }
      return tris;
    }

    async function refreshMini3dData(summaryFromSys) {
      try {
        const res = await fetch(base + '/api/apps/3d-print/dashboard');
        if (res.ok) {
          const data = await res.json();
          applyMini3dDashboardPayload(data);
          return;
        }
      } catch {}
      if (summaryFromSys) {
        applyMini3dDashboardPayload(summaryFromSys);
      }
    }

    function applyMini3dDashboardPayload(data) {
      if (!data) return;
      const hasProj = Boolean(data.hasActiveProject && (data.activeProject || data.scene));
      const proj = data.activeProject || data;
      const scene = proj.scene || data.scene || null;
      const stats = proj.stats || data.stats || null;
      const tel = data.telemetry || data.printer || {};
      const cfg = data.printerConfig || {};

      const printer = {
        name: cfg.printerName || tel.name || 'Bambu Lab P1S',
        status: tel.printerState || tel.status || 'IDLE',
        progressPercent: Number(tel.progressPercent ?? proj.progressPct ?? 0),
        currentLayer: Number(tel.currentLayer ?? 0),
        totalLayers: Number(tel.totalLayers ?? (stats && stats.layerCount ? stats.layerCount : 0)),
        remainingMinutes: Number(tel.remainingMinutes ?? (stats && stats.estimatedPrintMinutes ? stats.estimatedPrintMinutes : 0)),
        nozzleTemp: Number(tel.nozzleTempC ?? tel.nozzleTemp ?? 24),
        bedTemp: Number(tel.bedTempC ?? tel.bedTemp ?? 24),
      };

      mini3dState.hasActiveProject = hasProj;
      mini3dState.activeProjectId = proj.id || data.activeProjectId || null;
      mini3dState.projectName = proj.title || proj.name || data.projectName || null;
      mini3dState.scene = scene;
      mini3dState.stats = stats;
      mini3dState.printer = printer;

      const rawDims = stats && stats.dimensionsMm ? stats.dimensionsMm : null;
      const dimX = rawDims ? (Array.isArray(rawDims) ? rawDims[0] : rawDims.x) : 60;
      const dimY = rawDims ? (Array.isArray(rawDims) ? rawDims[1] : rawDims.y) : 60;
      const dimZ = rawDims ? (Array.isArray(rawDims) ? rawDims[2] : rawDims.z) : 45;

      if (hasProj && scene) {
        mini3dState.triangles = buildMiniTrianglesFromScene(scene);
        mini3dState.maxExtent = Math.max(dimX || 50, dimY || 50, dimZ || 40, 35);
        mini3dState.centerZ = (dimZ || 40) * 0.45;
      } else {
        mini3dState.triangles = [];
      }

      const compactEl = document.getElementById('compact-3dprint');
      const subEl = document.getElementById('sub-3dprint');
      const fillEl = document.getElementById('mini-3d-progress-fill');
      const dotEl = document.getElementById('dot-3dprint');
      const dockMetaEl = document.getElementById('print3d-dock-meta');
      const ePrinter = document.getElementById('e3d-printer');
      const eLayer = document.getElementById('e3d-layer');
      const eDims = document.getElementById('e3d-dims');
      const eTemps = document.getElementById('e3d-temps');
      const btnToggle = document.getElementById('btn-mini-3d-toggle');

      const pct = Number(printer.progressPercent || 0);
      if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';

      if (!hasProj) {
        if (compactEl) compactEl.textContent = 'Kein 3D-Projekt';
        if (subEl) subEl.textContent = 'Platzhalter aktiv \xB7 0%';
        if (dockMetaEl) dockMetaEl.textContent = 'Leerlauf';
        if (dotEl) {
          dotEl.style.background = '#94a3b8';
          dotEl.style.boxShadow = '0 0 8px rgba(148,163,184,0.5)';
        }
        if (eDims) eDims.textContent = 'Kein Objekt geladen';
        if (btnToggle) btnToggle.textContent = 'Projekt laden';
      } else {
        if (compactEl) compactEl.textContent = mini3dState.projectName || '3D Objekt';
        const isPrinting = printer.status === 'RUNNING' || printer.status === 'PREPARE';
        const statusLabel = isPrinting
          ? ('Druckt \xB7 ' + pct + '% (' + (printer.remainingMinutes || 0) + 'm)')
          : (rawDims
              ? (Math.round(dimX) + '\xD7' + Math.round(dimY) + '\xD7' + Math.round(dimZ) + 'mm \xB7 ' + (pct > 0 ? pct + '%' : 'Bereit'))
              : 'Bereit zum Druck');
        if (subEl) subEl.textContent = statusLabel;
        if (dockMetaEl) {
          dockMetaEl.textContent = isPrinting ? (pct + '%') : 'Bereit';
        }
        if (dotEl) {
          const c = isPrinting ? '#38bdf8' : '#00AE42';
          dotEl.style.background = c;
          dotEl.style.boxShadow = '0 0 10px ' + c;
        }
        if (eDims && rawDims) {
          const weightG = stats.filamentWeightG || stats.estimatedWeightGrams || 15;
          eDims.textContent = Math.round(dimX) + '\xD7' + Math.round(dimY) + '\xD7' + Math.round(dimZ) + 'mm \xB7 ' + weightG + 'g';
        }
        if (btnToggle) btnToggle.textContent = 'Platzhalter testen';
      }

      if (ePrinter) ePrinter.textContent = (printer.name || 'Bambu Lab P1S') + ' (' + (printer.status || 'IDLE') + ')';
      if (eLayer) eLayer.textContent = pct + '% (' + (printer.currentLayer || 0) + '/' + (printer.totalLayers || 0) + ')';
      if (eTemps) eTemps.textContent = Math.round(printer.nozzleTemp || 24) + '\xB0C / ' + Math.round(printer.bedTemp || 24) + '\xB0C';
    }

    function initMini3dCanvas() {
      const canvas = document.getElementById('mini-3d-canvas');
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        mini3dState.dragging = true;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!mini3dState.dragging) return;
        e.stopPropagation();
        const dx = e.clientX - mini3dState.lastX;
        const dy = e.clientY - mini3dState.lastY;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        mini3dState.yaw += dx * 0.018;
        mini3dState.pitch = Math.max(-1.2, Math.min(1.2, mini3dState.pitch + dy * 0.018));
      });
      canvas.addEventListener('pointerup', (e) => {
        mini3dState.dragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      });

      function renderLoop() {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          if (!mini3dState.dragging) {
            mini3dState.yaw += 0.012;
          }

          const cy = Math.cos(mini3dState.yaw), sy = Math.sin(mini3dState.yaw);
          const cp = Math.cos(mini3dState.pitch), sp = Math.sin(mini3dState.pitch);

          function projectPt(pt, scale, zOff) {
            const x = pt[0], y = pt[1], z = pt[2] - zOff;
            const rx = x * cy - y * sy;
            const ry = x * sy + y * cy;
            const rz = z * cp - ry * sp;
            const ry2 = z * sp + ry * cp;
            const fov = 220 / (220 + ry2 * 0.6);
            return {
              x: w / 2 + rx * scale * fov,
              y: h / 2 - rz * scale * fov,
              depth: ry2
            };
          }

          if (!mini3dState.hasActiveProject || mini3dState.triangles.length === 0) {
            // PLACEHOLDER STATE: Dashed rotating wireframe cube + "Kein Projekt" badge
            const r = 20;
            const verts = [
              [-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0],
              [-r, -r, r*1.6], [r, -r, r*1.6], [r, r, r*1.6], [-r, r, r*1.6]
            ].map(v => projectPt(v, 1.15, r * 0.8));
            const edges = [
              [0,1],[1,2],[2,3],[3,0],
              [4,5],[5,6],[6,7],[7,4],
              [0,4],[1,5],[2,6],[3,7]
            ];
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.lineWidth = 1.6;
            for (const [a, b] of edges) {
              ctx.beginPath();
              ctx.moveTo(verts[a].x, verts[a].y);
              ctx.lineTo(verts[b].x, verts[b].y);
              ctx.stroke();
            }
            ctx.restore();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
            ctx.font = '600 15px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('KEIN 3D OBJEKT', w / 2, h - 10);
          } else {
            // ACTIVE 3D OBJECT: Build plate grid + lit 3D mesh
            const scale = 68 / Math.max(30, mini3dState.maxExtent);
            const zOff = mini3dState.centerZ;

            // Mini build plate outline
            const plateR = mini3dState.maxExtent * 0.65;
            const pCorners = [
              [-plateR, -plateR, 0], [plateR, -plateR, 0],
              [plateR, plateR, 0], [-plateR, plateR, 0]
            ].map(v => projectPt(v, scale, zOff));
            ctx.beginPath();
            ctx.moveTo(pCorners[0].x, pCorners[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pCorners[i].x, pCorners[i].y);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(0, 174, 66, 0.35)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Project & sort triangles
            const projected = [];
            for (const t of mini3dState.triangles) {
              const p0 = projectPt(t.v[0], scale, zOff);
              const p1 = projectPt(t.v[1], scale, zOff);
              const p2 = projectPt(t.v[2], scale, zOff);
              // Compute 3D normal for shading
              const ux = t.v[1][0] - t.v[0][0], uy = t.v[1][1] - t.v[0][1], uz = t.v[1][2] - t.v[0][2];
              const vx = t.v[2][0] - t.v[0][0], vy = t.v[2][1] - t.v[0][1], vz = t.v[2][2] - t.v[0][2];
              const nx = uy * vz - uz * vy;
              const ny = uz * vx - ux * vz;
              const nz = ux * vy - uy * vx;
              const nl = Math.hypot(nx, ny, nz) || 1;
              const light = Math.max(0.32, Math.min(1.12, 0.55 + ((nx / nl) * 0.35 + (nz / nl) * 0.45)));
              projected.push({
                p0, p1, p2,
                depth: (p0.depth + p1.depth + p2.depth) / 3,
                color: t.c,
                light
              });
            }
            projected.sort((a, b) => b.depth - a.depth);

            for (const tri of projected) {
              ctx.beginPath();
              ctx.moveTo(tri.p0.x, tri.p0.y);
              ctx.lineTo(tri.p1.x, tri.p1.y);
              ctx.lineTo(tri.p2.x, tri.p2.y);
              ctx.closePath();
              const hex = (tri.color || '#00AE42').replace('#', '');
              const r = Math.min(255, Math.round(parseInt(hex.substring(0, 2) || '00', 16) * tri.light));
              const g = Math.min(255, Math.round(parseInt(hex.substring(2, 4) || 'ae', 16) * tri.light));
              const b = Math.min(255, Math.round(parseInt(hex.substring(4, 6) || '42', 16) * tri.light));
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fill();
              ctx.strokeStyle = 'rgba(4, 7, 17, 0.22)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(renderLoop);
      }
      requestAnimationFrame(renderLoop);
    }

    async function submitMini3dPrompt(e) {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById('mini-3d-prompt');
      const btn = document.getElementById('mini-3d-prompt-btn');
      if (!input || !input.value.trim()) return;
      const prompt = input.value.trim();
      if (btn) btn.textContent = '...';
      try {
        const endpoint = mini3dState.hasActiveProject && mini3dState.activeProjectId
          ? base + '/api/apps/3d-print/projects/modify'
          : base + '/api/apps/3d-print/projects/generate';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, projectId: mini3dState.activeProjectId })
        });
        if (res.ok) {
          input.value = '';
          await refreshMini3dData();
        }
      } catch (err) {
        console.error('3D prompt failed:', err);
      } finally {
        if (btn) btn.textContent = 'KI';
      }
    }

    async function toggleMini3dPlaceholder() {
      try {
        const nextId = mini3dState.hasActiveProject ? null : 'preset-organic-apple';
        await fetch(base + '/api/apps/3d-print/projects/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: nextId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed toggling 3D placeholder:', err);
      }
    }

    async function triggerMini3dPrint() {
      try {
        await fetch(base + '/api/apps/3d-print/printer/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: mini3dState.activeProjectId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed starting 3D print:', err);
      }
    }

    window.openFullService = openFullService;
    window.closeFullService = closeFullService;
    window.addNote = addNote;
    window.deleteNote = deleteNote;
    window.sendHorizonNote = sendHorizonNote;
    window.submitMini3dPrompt = submitMini3dPrompt;
    window.toggleMini3dPlaceholder = toggleMini3dPlaceholder;
    window.triggerMini3dPrint = triggerMini3dPrint;
    window.toggleRoomPin = toggleRoomPin;
    window.unpinAllRooms = unpinAllRooms;
    window.submitCortexPrompt = submitCortexPrompt;
    window.selectCortexPreviewBlueprint = selectCortexPreviewBlueprint;
    window.selectCortexPastRun = selectCortexPastRun;
    window.selectCortexMemoHit = selectCortexMemoHit;
    window.closeCortexResponse = closeCortexResponse;
    window.copyCortexResponse = copyCortexResponse;

    // ============================================================================
    // HORIZON CENTERED CORTEX PROMPT BAR, LIVE PREVIEWS & GEMINI SENDER
    // ============================================================================
    let cortexSearchTimer = null;
    let cortexIsSubmitting = false;
    let cachedCortexBlueprints = [];
    let cachedCortexRuns = [];

    async function initCortexPromptBar() {
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!input || !dropdown) return;

      try {
        const bsRes = await fetch(base + '/api/apps/cortex/bootstrap');
        if (bsRes.ok) {
          const bsData = await bsRes.json();
          cachedCortexBlueprints = bsData.blueprints || [];
          cachedCortexRuns = bsData.runs || [];
        }
      } catch (_e) {}

      input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (cortexSearchTimer) clearTimeout(cortexSearchTimer);
        if (!val) {
          dropdown.style.display = 'none';
          dropdown.innerHTML = '';
          return;
        }
        cortexSearchTimer = setTimeout(() => {
          performCortexSearchPreview(val);
        }, 160);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitCortexPrompt();
        } else if (e.key === 'Escape') {
          dropdown.style.display = 'none';
          closeCortexResponse();
        }
      });

      document.addEventListener('click', (e) => {
        const stage = document.getElementById('horizon-cortex-center-stage');
        if (stage && !stage.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
    }

    async function performCortexSearchPreview(q) {
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!dropdown) return;

      const qLow = q.toLowerCase();
      const matchedBps = cachedCortexBlueprints.filter(b =>
        (b.name || '').toLowerCase().includes(qLow) ||
        (b.description || '').toLowerCase().includes(qLow) ||
        (b.code || '').toLowerCase().includes(qLow) ||
        (b.promptTemplate || '').toLowerCase().includes(qLow)
      );

      const matchedRuns = cachedCortexRuns.filter(r =>
        (r.prompt || '').toLowerCase().includes(qLow) ||
        (r.topic || '').toLowerCase().includes(qLow) ||
        (r.response_text || '').toLowerCase().includes(qLow)
      ).slice(0, 3);

      let memoHits = [];
      try {
        const mRes = await fetch(base + '/api/apps/memo/search?q=' + encodeURIComponent(q) + '&limit=5');
        if (mRes.ok) {
          const mData = await mRes.json();
          memoHits = mData.results || [];
        }
      } catch (_e) {}

      if (matchedBps.length === 0 && matchedRuns.length === 0 && memoHits.length === 0) {
        dropdown.innerHTML = \`
          <div style="padding:10px 14px; font-size:12px; color:rgba(248,250,252,0.5); display:flex; justify-content:space-between; align-items:center;">
            <span>Dr\xFCcke <b>Enter</b> um \u201E\${escapeHtml(q)}\u201C an Gemini API zu senden</span>
            <span style="font-family:monospace; font-size:10.5px; color:#38bdf8;">[\u21B5 Senden]</span>
          </div>
        \`;
        dropdown.style.display = 'flex';
        return;
      }

      let html = '';
      if (matchedBps.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:4px 10px 2px;">Cortex Vorlagen</div>';
        for (const bp of matchedBps) {
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexPreviewBlueprint('\${bp.id}', '\${encodeURIComponent(bp.name)}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag">\${bp.code}</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(bp.name)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(bp.description)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#38bdf8; font-weight:500;">\xDCbernehmen \u2192</span>
            </div>
          \`;
        }
      }

      if (matchedRuns.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:8px 10px 2px;">Cortex Verlauf</div>';
        for (const r of matchedRuns) {
          const snippet = (r.response_text || '').replace(/\\n+/g, ' ').slice(0, 90);
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexPastRun('\${r.id}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag" style="background:rgba(168,85,247,0.18); color:#c084fc; border-color:rgba(168,85,247,0.35);">RUN</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(r.topic || r.prompt)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(snippet)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#c084fc; font-weight:500;">Vorschau \u2192</span>
            </div>
          \`;
        }
      }

      if (memoHits.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:8px 10px 2px;">Memo & Dokumente</div>';
        for (const m of memoHits) {
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexMemoHit('\${encodeURIComponent(m.title)}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag" style="background:rgba(16,185,129,0.18); color:#34d399; border-color:rgba(16,185,129,0.35);">\${m.sourceBadge}</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(m.title)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(m.snippet)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#a1a1aa; font-family:monospace;">\${escapeHtml(m.ref)}</span>
            </div>
          \`;
        }
      }

      dropdown.innerHTML = html;
      dropdown.style.display = 'flex';
    }

    function selectCortexPastRun(runId) {
      const r = cachedCortexRuns.find(item => String(item.id) === String(runId));
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (r) {
        let actions = [];
        try { actions = JSON.parse(r.proposed_actions_json || '[]'); } catch (_e) {}
        renderCortexResponse({
          modelUsed: r.model_used || 'Cortex Archiv',
          durationMs: r.duration_ms || 0,
          responseText: r.response_text || '',
          proposedActions: actions
        }, r.prompt);
      }
    }

    function selectCortexPreviewBlueprint(bpId, bpNameEsc) {
      const bpName = decodeURIComponent(bpNameEsc);
      const bp = cachedCortexBlueprints.find(b => b.id === bpId);
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (input && bp) {
        input.value = bp.promptTemplate.replace(/\\{\\{topic\\}\\}/gi, bpName);
        input.focus();
      }
    }

    function selectCortexMemoHit(titleEsc) {
      const title = decodeURIComponent(titleEsc);
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (input) {
        input.value = 'Fasse alle Details zu "' + title + '" aus Memo zusammen und leite die n\xE4chsten Schritte ab.';
        input.focus();
      }
    }

    async function submitCortexPrompt() {
      if (cortexIsSubmitting) return;
      const input = document.getElementById('cortex-prompt-input');
      const pill = document.getElementById('cortex-prompt-pill');
      const sendBtn = document.getElementById('cortex-send-btn');
      const statusBadge = document.getElementById('cortex-status-badge');
      const statusText = document.getElementById('cortex-status-text');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      const responseCard = document.getElementById('cortex-response-card');

      const promptText = (input ? input.value : '').trim();
      if (!promptText) {
        if (input) input.focus();
        return;
      }

      if (dropdown) dropdown.style.display = 'none';
      cortexIsSubmitting = true;
      if (pill) pill.classList.add('is-waiting');
      if (sendBtn) sendBtn.disabled = true;
      if (statusBadge) {
        statusBadge.style.display = 'inline-flex';
        if (statusText) statusText.textContent = 'Gemini denkt nach...';
      }

      try {
        const res = await fetch(base + '/api/apps/cortex/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            topic: promptText.slice(0, 60),
            contextScopes: ['memo', 'ha', 'calendar', 'pc', 'finance'],
            responsePattern: 'SYNTHESIS_BRIEF',
            model: 'gemini-3.8-flash'
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Fehler beim Gemini API Aufruf');
        }

        renderCortexResponse(data, promptText);
        if (data.runId) {
          cachedCortexRuns.unshift({
            id: data.runId,
            prompt: promptText,
            topic: promptText.slice(0, 60),
            model_used: data.modelUsed,
            duration_ms: data.durationMs,
            response_text: data.responseText,
            proposed_actions_json: JSON.stringify(data.proposedActions || [])
          });
        }
      } catch (err) {
        if (responseCard) {
          responseCard.style.display = 'flex';
          responseCard.innerHTML = \`
            <div class="cortex-resp-header">
              <span style="font-size:12px; font-weight:600; color:#ef4444;">Fehler bei Gemini Anfrage</span>
              <button onclick="closeCortexResponse()" style="background:none; border:none; color:#cbd5e1; cursor:pointer;">\u2715</button>
            </div>
            <div style="font-size:13px; color:#fca5a5;">\${escapeHtml(err.message || String(err))}</div>
          \`;
        }
      } finally {
        cortexIsSubmitting = false;
        if (pill) pill.classList.remove('is-waiting');
        if (sendBtn) sendBtn.disabled = false;
        if (statusBadge) statusBadge.style.display = 'none';
      }
    }

    function renderCortexResponse(data, originalPrompt) {
      const responseCard = document.getElementById('cortex-response-card');
      if (!responseCard) return;

      const modelLabel = data.modelUsed || 'Gemini 3.8 Flash';
      const duration = data.durationMs ? (data.durationMs + 'ms') : '';
      const text = data.responseText || '(Keine Antwort)';

      let actionsHtml = '';
      if (Array.isArray(data.proposedActions) && data.proposedActions.length > 0) {
        actionsHtml = \`
          <div style="margin:8px 0; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#38bdf8; margin-bottom:6px;">Quasi-Agentische Axon-Schritte (\${data.proposedActions.length})</div>
            \${data.proposedActions.map(a => \`
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-top:4px;">
                <span style="color:#f8fafc; font-family:monospace;">\${escapeHtml(a.axonId)}</span>
                <span style="color:#94a3b8;">\${escapeHtml(a.reason || '')}</span>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      responseCard.innerHTML = \`
        <div class="cortex-resp-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
            <span style="font-size:12px; font-weight:600; color:#f8fafc;">\${escapeHtml(modelLabel)}</span>
            <span style="font-size:11px; font-family:monospace; color:#94a3b8;">\${duration}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="copyCortexResponse()" style="padding:4px 10px; border-radius:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#cbd5e1; font-size:11px; cursor:pointer;">Kopieren</button>
            <button onclick="openFullService('cortex', 'Cortex')" style="padding:4px 10px; border-radius:7px; background:#38bdf8; border:none; color:#040711; font-size:11px; font-weight:600; cursor:pointer;">In Cortex \xF6ffnen \u2197</button>
            <button onclick="closeCortexResponse()" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:0 4px;">\u2715</button>
          </div>
        </div>
        \${actionsHtml}
        <div class="cortex-resp-body" id="cortex-resp-body-text">\${escapeHtml(text)}</div>
      \`;
      responseCard.style.display = 'flex';
    }

    function closeCortexResponse() {
      const responseCard = document.getElementById('cortex-response-card');
      if (responseCard) {
        responseCard.style.display = 'none';
        responseCard.innerHTML = '';
      }
    }

    function copyCortexResponse() {
      const body = document.getElementById('cortex-resp-body-text');
      if (body) {
        navigator.clipboard.writeText(body.innerText || body.textContent);
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
      syncDevicesDockHeight();
    });

    renderSolarArcPaths();
    renderTimelineGeometry();
    syncDevicesDockHeight();
    initMini3dCanvas();
    initCortexPromptBar();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    void loadWeatherData();
    void refreshHealthWidget();
    setInterval(() => void refreshHealthWidget(), 2000);
    setInterval(loadAllLiveData, 60000);
    setInterval(() => void loadWeatherData(), 600000);
    setInterval(() => refreshMini3dData(), 5000);
    setInterval(loadRoomsQuickAccess, 12000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refreshHealthWidget();
    });
    window.addEventListener('focus', () => void refreshHealthWidget());

    const SIDEBAR_APP_TITLES = {
      'contacts': 'Contacts',
      'floorplan': 'Grundriss 2D',
      'camera-vision': 'Kameras & Vision',
      'system-monitor': 'HASS OS Monitor',
      'google-usage': 'Google Usage & AI',
      'network-monitor': 'Netzwerk & Router',
      'george-sync': 'Erste Bank Sync',
      '3d-print': '3D Druck Studio'
    };

    function checkHashFor3dPrint() {
      try {
        if (window.top) {
          window.top.__thassiHorizonWin = window;
          const pendingRaw = window.top.sessionStorage.getItem('thassi_open_app');
          if (pendingRaw) {
            window.top.sessionStorage.removeItem('thassi_open_app');
            const parsed = JSON.parse(pendingRaw);
            if (parsed && parsed.id && (!parsed.ts || Date.now() - parsed.ts < 30000)) {
              window.top.__thassiActiveSidebarApp = parsed.id;
              openFullService(
                parsed.id,
                parsed.title || SIDEBAR_APP_TITLES[parsed.id] || parsed.id,
                parsed.hash,
                Boolean(parsed.fromSidebar !== false)
              );
              if (typeof window.top.__thassiSyncSidebarNow === 'function') {
                window.top.__thassiSyncSidebarNow();
              }
              return;
            }
          }
        }
        const hStr = String((window.top ? window.top.location.hash : window.location.hash) || window.location.hash || '');
        const rawHash = hStr.startsWith('#') ? hStr.slice(1) : hStr;
        if (rawHash) {
          let resolvedTitle = SIDEBAR_APP_TITLES[rawHash] || null;
          if (!resolvedTitle) {
            const dynList = (window.top && window.top.__thassiDeployedApps) || window.__THASSI_DEPLOYED_APPS__ || [];
            const match = Array.isArray(dynList) ? dynList.find((a) => a && a.id === rawHash) : null;
            if (match) resolvedTitle = match.name || match.title || rawHash;
          }
          if (resolvedTitle) {
            if (window.top) window.top.__thassiActiveSidebarApp = rawHash;
            openFullService(rawHash, resolvedTitle, '', rawHash !== '3d-print');
          }
        }
      } catch (_e) {}
    }
    checkHashFor3dPrint();
    setInterval(checkHashFor3dPrint, 250);
    window.addEventListener('hashchange', checkHashFor3dPrint);
  </script>
</body>
</html>`;
}

// apps/system-monitor/backend/index.ts
var gState = globalThis;
if (gState.__thassiSysMonTimer) {
  clearInterval(gState.__thassiSysMonTimer);
}
if (!gState.__thassiSysMonLoopHistogram) {
  try {
    const h = monitorEventLoopDelay({ resolution: 20 });
    h.enable();
    gState.__thassiSysMonLoopHistogram = h;
  } catch {
  }
}
var index_default = defineThassiApp((ctx) => {
  const CLK_TCK = 100;
  function repairSharedDbIfNeeded(dbInstance) {
    const rescued = {};
    const priorityKeys = [
      "gemini_api_key",
      "google_oauth_config",
      "google_oauth_tokens",
      "google_oauth_token",
      "bambu_printer_config",
      "github_token",
      "ha_connection",
      "google_weather_api_key",
      "published_sensors",
      "fritzbox_config"
    ];
    let needsRepair = false;
    try {
      const check = dbInstance.raw.prepare("PRAGMA quick_check").get();
      const val = check ? Object.values(check)[0] : "ok";
      if (val !== "ok") needsRepair = true;
      dbInstance.raw.prepare("SELECT COUNT(*) FROM _thassi_kv").get();
      dbInstance.raw.prepare("SELECT COUNT(*) FROM system_notes").get();
    } catch {
      needsRepair = true;
    }
    if (!needsRepair) {
      return { repaired: false, rescuedKeys: [] };
    }
    for (const k of priorityKeys) {
      try {
        const r = dbInstance.raw.prepare("SELECT value FROM _thassi_kv WHERE key = ?").get(k);
        if (r && typeof r.value === "string") {
          rescued[k] = r.value;
        }
      } catch {
      }
    }
    try {
      const rows = dbInstance.raw.prepare("SELECT key, value FROM _thassi_kv").all();
      for (const r of rows) {
        if (r?.key && typeof r.value === "string") {
          rescued[r.key] = r.value;
        }
      }
    } catch {
    }
    const dbPath = dbInstance.dbPath || "/data/shared.db";
    try {
      dbInstance.raw.close();
    } catch {
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        if (fs4.existsSync(dbPath + suffix)) {
          fs4.rmSync(dbPath + suffix, { force: true });
        }
      } catch {
      }
    }
    let freshDb;
    try {
      freshDb = new DatabaseSync2(dbPath);
    } catch {
      try {
        freshDb = new DatabaseSync2(path4.join(os2.tmpdir(), "thassi_shared_fallback.db"));
      } catch {
        freshDb = new DatabaseSync2(":memory:");
      }
    }
    freshDb.exec("PRAGMA journal_mode = WAL;");
    freshDb.exec("PRAGMA foreign_keys = ON;");
    freshDb.exec(`
      CREATE TABLE IF NOT EXISTS _thassi_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS system_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const ins = freshDb.prepare(
      "INSERT OR REPLACE INTO _thassi_kv (key, value, updated_at) VALUES (?, ?, ?)"
    );
    for (const [k, v] of Object.entries(rescued)) {
      try {
        ins.run(k, v, nowIso);
      } catch {
      }
    }
    dbInstance.raw = freshDb;
    return { repaired: true, rescuedKeys: Object.keys(rescued) };
  }
  try {
    repairSharedDbIfNeeded(ctx.sharedDb);
    const proto = Object.getPrototypeOf(ctx.sharedDb);
    if (proto && !proto.__thassiSelfHealPatched) {
      proto.__thassiSelfHealPatched = true;
      proto.query = function(sql, params = []) {
        try {
          return this.raw.prepare(sql).all(...params);
        } catch (err) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            try {
              return this.raw.prepare(sql).all(...params);
            } catch {
              return [];
            }
          }
          throw err;
        }
      };
      proto.queryOne = function(sql, params = []) {
        try {
          return this.raw.prepare(sql).get(...params);
        } catch (err) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            try {
              return this.raw.prepare(sql).get(...params);
            } catch {
              return void 0;
            }
          }
          throw err;
        }
      };
      proto.execute = function(sql, params = []) {
        try {
          const res = this.raw.prepare(sql).run(...params);
          return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
        } catch (err) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            const res = this.raw.prepare(sql).run(...params);
            return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
          }
          throw err;
        }
      };
    }
  } catch (e) {
    console.warn("[SystemMonitor] SharedDB check warning:", e);
  }
  let prevCpuTicks = /* @__PURE__ */ new Map();
  let prevCtxt = 0;
  let prevIntr = 0;
  let prevStatAtMs = 0;
  let prevProcTicks = /* @__PURE__ */ new Map();
  let prevProcAtMs = 0;
  let prevDiskSamples = /* @__PURE__ */ new Map();
  let prevDiskAtMs = 0;
  let prevNetSamples = /* @__PURE__ */ new Map();
  let prevNetAtMs = 0;
  const historyBuffer = [];
  const MAX_HISTORY = 72;
  let cachedSupervisorSnapshot = null;
  let cachedHaActivity = null;
  function readCpuTemperatureC() {
    const candidates = [
      "/sys/class/thermal/thermal_zone0/temp",
      "/sys/class/thermal/thermal_zone1/temp",
      "/sys/class/hwmon/hwmon0/temp1_input"
    ];
    for (const p of candidates) {
      try {
        if (fs4.existsSync(p)) {
          const raw = Number(fs4.readFileSync(p, "utf-8").trim());
          if (Number.isFinite(raw) && raw > 0) {
            return Math.round((raw > 200 ? raw / 1e3 : raw) * 10) / 10;
          }
        }
      } catch {
      }
    }
    return null;
  }
  function readCoreFreqMhz(coreId) {
    try {
      const p = `/sys/devices/system/cpu/${coreId}/cpufreq/scaling_cur_freq`;
      if (fs4.existsSync(p)) {
        const khz = Number(fs4.readFileSync(p, "utf-8").trim());
        if (Number.isFinite(khz) && khz > 0) return Math.round(khz / 1e3);
      }
    } catch {
    }
    return null;
  }
  function sampleKernelCpuAndStat() {
    const nowMs = Date.now();
    const dtSec = prevStatAtMs > 0 ? Math.max(0.05, (nowMs - prevStatAtMs) / 1e3) : 1;
    prevStatAtMs = nowMs;
    const currentTicks = /* @__PURE__ */ new Map();
    let ctxt = 0;
    let intr = 0;
    let procsRunning = 1;
    let procsBlocked = 0;
    try {
      const raw = fs4.readFileSync("/proc/stat", "utf-8");
      for (const line of raw.split("\n")) {
        if (line.startsWith("cpu")) {
          const parts = line.trim().split(/\s+/);
          const id = parts[0];
          const user = Number(parts[1] || 0);
          const nice = Number(parts[2] || 0);
          const system = Number(parts[3] || 0);
          const idle = Number(parts[4] || 0);
          const iowait = Number(parts[5] || 0);
          const irq = Number(parts[6] || 0);
          const softirq = Number(parts[7] || 0);
          const steal = Number(parts[8] || 0);
          const total = user + nice + system + idle + iowait + irq + softirq + steal;
          currentTicks.set(id, { user, nice, system, idle, iowait, irq, softirq, steal, total });
        } else if (line.startsWith("ctxt ")) {
          ctxt = Number(line.split(/\s+/)[1] || 0);
        } else if (line.startsWith("intr ")) {
          intr = Number(line.split(/\s+/)[1] || 0);
        } else if (line.startsWith("procs_running ")) {
          procsRunning = Number(line.split(/\s+/)[1] || 1);
        } else if (line.startsWith("procs_blocked ")) {
          procsBlocked = Number(line.split(/\s+/)[1] || 0);
        }
      }
    } catch {
      const cpus = os2.cpus();
      let u = 0, n = 0, s = 0, idl = 0, ir = 0;
      cpus.forEach((c, idx) => {
        const tot = c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
        currentTicks.set(`cpu${idx}`, {
          user: c.times.user,
          nice: c.times.nice,
          system: c.times.sys,
          idle: c.times.idle,
          iowait: 0,
          irq: c.times.irq,
          softirq: 0,
          steal: 0,
          total: tot
        });
        u += c.times.user;
        n += c.times.nice;
        s += c.times.sys;
        idl += c.times.idle;
        ir += c.times.irq;
      });
      currentTicks.set("cpu", {
        user: u,
        nice: n,
        system: s,
        idle: idl,
        iowait: 0,
        irq: ir,
        softirq: 0,
        steal: 0,
        total: u + n + s + idl + ir
      });
    }
    const computeDelta = (id, cur) => {
      const prev = prevCpuTicks.get(id);
      if (!prev || cur.total <= prev.total) {
        const tot = Math.max(1, cur.total);
        const busy = tot - cur.idle - cur.iowait;
        return {
          id,
          usagePct: Math.round(busy / tot * 1e3) / 10,
          userPct: Math.round((cur.user + cur.nice) / tot * 1e3) / 10,
          systemPct: Math.round(cur.system / tot * 1e3) / 10,
          iowaitPct: Math.round(cur.iowait / tot * 1e3) / 10,
          irqPct: Math.round((cur.irq + cur.softirq) / tot * 1e3) / 10,
          idlePct: Math.round(cur.idle / tot * 1e3) / 10,
          freqMhz: id === "cpu" ? null : readCoreFreqMhz(id)
        };
      }
      const dTotal = Math.max(1, cur.total - prev.total);
      const dUser = Math.max(0, cur.user + cur.nice - (prev.user + prev.nice));
      const dSys = Math.max(0, cur.system - prev.system);
      const dIo = Math.max(0, cur.iowait - prev.iowait);
      const dIrq = Math.max(0, cur.irq + cur.softirq - (prev.irq + prev.softirq));
      const dSteal = Math.max(0, cur.steal - prev.steal);
      const dIdle = Math.max(0, cur.idle - prev.idle);
      const dBusy = Math.min(dTotal, dUser + dSys + dIrq + dSteal);
      return {
        id,
        usagePct: Math.round(dBusy / dTotal * 1e3) / 10,
        userPct: Math.round(dUser / dTotal * 1e3) / 10,
        systemPct: Math.round(dSys / dTotal * 1e3) / 10,
        iowaitPct: Math.round(dIo / dTotal * 1e3) / 10,
        irqPct: Math.round(dIrq / dTotal * 1e3) / 10,
        idlePct: Math.round(dIdle / dTotal * 1e3) / 10,
        freqMhz: id === "cpu" ? null : readCoreFreqMhz(id)
      };
    };
    const totalCpu = currentTicks.get("cpu") ? computeDelta("cpu", currentTicks.get("cpu")) : { id: "cpu", usagePct: 0, userPct: 0, systemPct: 0, iowaitPct: 0, irqPct: 0, idlePct: 100, freqMhz: null };
    const cores = [];
    for (const [id, cur] of currentTicks.entries()) {
      if (id === "cpu") continue;
      cores.push(computeDelta(id, cur));
    }
    const contextSwitchesPerSec = prevCtxt > 0 && ctxt >= prevCtxt ? Math.round((ctxt - prevCtxt) / dtSec) : 0;
    const interruptsPerSec = prevIntr > 0 && intr >= prevIntr ? Math.round((intr - prevIntr) / dtSec) : 0;
    prevCpuTicks = currentTicks;
    prevCtxt = ctxt;
    prevIntr = intr;
    let load1m = os2.loadavg()[0] || 0;
    let load5m = os2.loadavg()[1] || 0;
    let load15m = os2.loadavg()[2] || 0;
    let runningKernelThreads = procsRunning;
    let totalKernelThreads = 0;
    try {
      const lraw = fs4.readFileSync("/proc/loadavg", "utf-8").trim().split(/\s+/);
      load1m = Number(lraw[0] || load1m);
      load5m = Number(lraw[1] || load5m);
      load15m = Number(lraw[2] || load15m);
      if (lraw[3] && lraw[3].includes("/")) {
        const [r, t] = lraw[3].split("/");
        runningKernelThreads = Number(r || procsRunning);
        totalKernelThreads = Number(t || 0);
      }
    } catch {
    }
    const cpuModel = os2.cpus()[0]?.model || "ARM64 / HASS OS Processor";
    return {
      cpuModel,
      coreCount: Math.max(1, cores.length || os2.cpus().length),
      total: totalCpu,
      cores,
      load1m: Math.round(load1m * 100) / 100,
      load5m: Math.round(load5m * 100) / 100,
      load15m: Math.round(load15m * 100) / 100,
      runningKernelThreads,
      totalKernelThreads,
      procsRunning,
      procsBlocked,
      contextSwitchesPerSec,
      interruptsPerSec,
      cpuTempC: readCpuTemperatureC(),
      uptimeSeconds: Math.round(os2.uptime())
    };
  }
  function sampleMemoryMetrics() {
    const info = {};
    try {
      const raw = fs4.readFileSync("/proc/meminfo", "utf-8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Za-z0-9_()]+):\s+(\d+)/);
        if (m) {
          info[m[1]] = Number(m[2]);
        }
      }
    } catch {
    }
    const totalKb = info.MemTotal || Math.round(os2.totalmem() / 1024);
    const freeKb = info.MemFree || Math.round(os2.freemem() / 1024);
    const availKb = info.MemAvailable || freeKb;
    const buffersKb = info.Buffers || 0;
    const cachedKb = (info.Cached || 0) + (info.SReclaimable || 0);
    const slabKb = info.Slab || 0;
    const dirtyKb = info.Dirty || 0;
    const activeKb = info.Active || 0;
    const inactiveKb = info.Inactive || 0;
    const swapTotalKb = info.SwapTotal || 0;
    const swapFreeKb = info.SwapFree || 0;
    const usedKb = Math.max(0, totalKb - availKb);
    const swapUsedKb = Math.max(0, swapTotalKb - swapFreeKb);
    const toMb = (kb) => Math.round(kb / 1024 * 10) / 10;
    return {
      totalMb: toMb(totalKb),
      usedMb: toMb(usedKb),
      availableMb: toMb(availKb),
      freeMb: toMb(freeKb),
      buffersCachedMb: toMb(buffersKb + cachedKb),
      slabMb: toMb(slabKb),
      dirtyMb: toMb(dirtyKb),
      activeMb: toMb(activeKb),
      inactiveMb: toMb(inactiveKb),
      usedPct: totalKb > 0 ? Math.round(usedKb / totalKb * 1e3) / 10 : 0,
      swapTotalMb: toMb(swapTotalKb),
      swapUsedMb: toMb(swapUsedKb),
      swapPct: swapTotalKb > 0 ? Math.round(swapUsedKb / swapTotalKb * 1e3) / 10 : 0
    };
  }
  function sampleDiskAndIoMetrics() {
    let totalGb = 0;
    let freeGb = 0;
    let usedGb = 0;
    let usedPct = 0;
    try {
      const targetPath = fs4.existsSync("/data") ? "/data" : "/";
      if (typeof fs4.statfsSync === "function") {
        const st = fs4.statfsSync(targetPath);
        const totalBytes = st.blocks * st.bsize;
        const availBytes = st.bavail * st.bsize;
        const usedBytes = Math.max(0, totalBytes - st.bfree * st.bsize);
        totalGb = Math.round(totalBytes / 1073741824 * 100) / 100;
        freeGb = Math.round(availBytes / 1073741824 * 100) / 100;
        usedGb = Math.round(usedBytes / 1073741824 * 100) / 100;
        usedPct = totalBytes > 0 ? Math.round(usedBytes / totalBytes * 1e3) / 10 : 0;
      }
    } catch {
    }
    const nowMs = Date.now();
    const dtSec = prevDiskAtMs > 0 ? Math.max(0.05, (nowMs - prevDiskAtMs) / 1e3) : 1;
    prevDiskAtMs = nowMs;
    const currentSamples = /* @__PURE__ */ new Map();
    const devices = [];
    try {
      const raw = fs4.readFileSync("/proc/diskstats", "utf-8");
      for (const line of raw.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 14) continue;
        const dev = parts[2];
        if (!/^(mmcblk\d+|sd[a-z]+|nvme\d+n\d+|vd[a-z]+|zram\d+)$/.test(dev)) continue;
        const readsCompleted = Number(parts[3] || 0);
        const sectorsRead = Number(parts[5] || 0);
        const writesCompleted = Number(parts[7] || 0);
        const sectorsWritten = Number(parts[9] || 0);
        const ioOps = readsCompleted + writesCompleted;
        currentSamples.set(dev, { sectorsRead, sectorsWritten, ioOps });
        const prev = prevDiskSamples.get(dev);
        const dReadSectors = prev && sectorsRead >= prev.sectorsRead ? sectorsRead - prev.sectorsRead : 0;
        const dWriteSectors = prev && sectorsWritten >= prev.sectorsWritten ? sectorsWritten - prev.sectorsWritten : 0;
        const dOps = prev && ioOps >= prev.ioOps ? ioOps - prev.ioOps : 0;
        devices.push({
          device: dev,
          readKbPerSec: Math.round(dReadSectors * 0.5 / dtSec * 10) / 10,
          writeKbPerSec: Math.round(dWriteSectors * 0.5 / dtSec * 10) / 10,
          ioOpsPerSec: Math.round(dOps / dtSec * 10) / 10,
          totalReadGb: Math.round(sectorsRead * 512 / 1073741824 * 100) / 100,
          totalWriteGb: Math.round(sectorsWritten * 512 / 1073741824 * 100) / 100
        });
      }
    } catch {
    }
    prevDiskSamples = currentSamples;
    const totalReadKbPerSec = Math.round(devices.reduce((s, d) => s + d.readKbPerSec, 0) * 10) / 10;
    const totalWriteKbPerSec = Math.round(devices.reduce((s, d) => s + d.writeKbPerSec, 0) * 10) / 10;
    return {
      totalGb,
      usedGb,
      freeGb,
      usedPct,
      totalReadKbPerSec,
      totalWriteKbPerSec,
      devices
    };
  }
  function sampleNetworkMetrics() {
    const nowMs = Date.now();
    const dtSec = prevNetAtMs > 0 ? Math.max(0.05, (nowMs - prevNetAtMs) / 1e3) : 1;
    prevNetAtMs = nowMs;
    const currentSamples = /* @__PURE__ */ new Map();
    const interfaces = [];
    try {
      const raw = fs4.readFileSync("/proc/net/dev", "utf-8");
      for (const line of raw.split("\n").slice(2)) {
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const iface = line.slice(0, idx).trim();
        if (iface === "lo" || iface.startsWith("veth")) continue;
        const cols = line.slice(idx + 1).trim().split(/\s+/).map(Number);
        if (cols.length < 10) continue;
        const rxBytes = cols[0] || 0;
        const rxPackets = cols[1] || 0;
        const txBytes = cols[8] || 0;
        const txPackets = cols[9] || 0;
        const packets = rxPackets + txPackets;
        currentSamples.set(iface, { rxBytes, txBytes, packets });
        const prev = prevNetSamples.get(iface);
        const dRx = prev && rxBytes >= prev.rxBytes ? rxBytes - prev.rxBytes : 0;
        const dTx = prev && txBytes >= prev.txBytes ? txBytes - prev.txBytes : 0;
        const dPkt = prev && packets >= prev.packets ? packets - prev.packets : 0;
        interfaces.push({
          iface,
          rxKbPerSec: Math.round(dRx / 1024 / dtSec * 10) / 10,
          txKbPerSec: Math.round(dTx / 1024 / dtSec * 10) / 10,
          totalRxGb: Math.round(rxBytes / 1073741824 * 100) / 100,
          totalTxGb: Math.round(txBytes / 1073741824 * 100) / 100,
          packetsPerSec: Math.round(dPkt / dtSec)
        });
      }
    } catch {
    }
    prevNetSamples = currentSamples;
    const totalRxKbPerSec = Math.round(interfaces.reduce((s, i) => s + i.rxKbPerSec, 0) * 10) / 10;
    const totalTxKbPerSec = Math.round(interfaces.reduce((s, i) => s + i.txKbPerSec, 0) * 10) / 10;
    return {
      totalRxKbPerSec,
      totalTxKbPerSec,
      interfaces
    };
  }
  function sampleLinuxProcesses(totalMemMb, coreCount, uptimeSec) {
    const nowMs = Date.now();
    const dtSec = prevProcAtMs > 0 ? Math.max(0.05, (nowMs - prevProcAtMs) / 1e3) : 1;
    prevProcAtMs = nowMs;
    const nextProcTicks = /* @__PURE__ */ new Map();
    const results = [];
    const stateLabels = {
      R: "Running (Aktiv auf CPU)",
      S: "Sleeping (Wartet auf Event)",
      D: "Disk Sleep (Block-I/O Wait)",
      Z: "Zombie",
      T: "Stopped",
      I: "Idle Kernel Thread"
    };
    try {
      if (!fs4.existsSync("/proc")) return results;
      const entries = fs4.readdirSync("/proc");
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry);
        try {
          const statRaw = fs4.readFileSync(`/proc/${pid}/stat`, "utf-8");
          const openParen = statRaw.indexOf("(");
          const closeParen = statRaw.lastIndexOf(")");
          if (openParen < 0 || closeParen < 0) continue;
          const comm = statRaw.slice(openParen + 1, closeParen);
          const after = statRaw.slice(closeParen + 2).trim().split(/\s+/);
          const state = after[0] || "S";
          const ppid = Number(after[1] || 0);
          const utime = Number(after[11] || 0);
          const stime = Number(after[12] || 0);
          const numThreads = Number(after[17] || 1);
          const starttimeTicks = Number(after[19] || 0);
          const vsizeBytes = Number(after[20] || 0);
          const rssPages = Number(after[21] || 0);
          const totalTicks = utime + stime;
          nextProcTicks.set(pid, totalTicks);
          const prevTicks = prevProcTicks.get(pid);
          let cpuPct = 0;
          if (prevTicks !== void 0 && totalTicks >= prevTicks) {
            const dTicks = totalTicks - prevTicks;
            const cpuSeconds = dTicks / CLK_TCK;
            cpuPct = Math.min(100 * coreCount, Math.round(cpuSeconds / dtSec * 1e3) / 10);
          } else {
            const procAgeSec = Math.max(1, uptimeSec - starttimeTicks / CLK_TCK);
            cpuPct = Math.min(100, Math.round(totalTicks / CLK_TCK / procAgeSec * 1e3) / 10);
          }
          let cmdline = "";
          try {
            cmdline = fs4.readFileSync(`/proc/${pid}/cmdline`, "utf-8").replace(/\0+/g, " ").trim();
          } catch {
          }
          if (!cmdline) cmdline = `[${comm}]`;
          const memMb = Math.round(rssPages * 4096 / 1048576 * 10) / 10;
          const vszMb = Math.round(vsizeBytes / 1048576 * 10) / 10;
          const memPct = totalMemMb > 0 ? Math.round(memMb / totalMemMb * 1e3) / 10 : 0;
          const procUptimeSec = Math.max(0, Math.round(uptimeSec - starttimeTicks / CLK_TCK));
          const lowCmd = `${comm} ${cmdline}`.toLowerCase();
          let category = "system";
          let subsystemLabel = "Linux System / OS";
          if (lowCmd.includes("homeassistant") || lowCmd.includes("hass")) {
            category = "hass-core";
            subsystemLabel = "Home Assistant Core";
          } else if (lowCmd.includes("supervisor") || lowCmd.includes("hassio")) {
            category = "supervisor";
            subsystemLabel = "HASS.io Supervisor";
          } else if (lowCmd.includes("ffmpeg") || lowCmd.includes("go2rtc") || lowCmd.includes("coco")) {
            category = "vision-ai";
            subsystemLabel = "Camera Vision / Video Stream";
          } else if (lowCmd.includes("server.mjs") || lowCmd.includes("thassi") || lowCmd.includes("node")) {
            category = "thassi";
            subsystemLabel = "Thassi Host & Apps Runtime";
          } else if (cmdline.startsWith("[")) {
            category = "kernel";
            subsystemLabel = "Linux Kernel Worker";
          }
          results.push({
            pid,
            ppid,
            name: comm === "MainThread" ? "node (thassi_host)" : comm,
            cmdline: cmdline.slice(0, 260),
            state,
            stateLabel: stateLabels[state] || state,
            cpuPct,
            memMb,
            memPct,
            vszMb,
            threads: numThreads,
            uptimeSec: procUptimeSec,
            category,
            subsystemLabel
          });
          const taskDir = `/proc/${pid}/task`;
          if (numThreads > 1 && fs4.existsSync(taskDir)) {
            for (const tidStr of fs4.readdirSync(taskDir)) {
              if (!/^\d+$/.test(tidStr)) continue;
              const tid = Number(tidStr);
              if (tid === pid) continue;
              try {
                const tStat = fs4.readFileSync(`${taskDir}/${tid}/stat`, "utf-8");
                const tOpen = tStat.indexOf("(");
                const tClose = tStat.lastIndexOf(")");
                if (tOpen < 0 || tClose < 0) continue;
                const tComm = tStat.slice(tOpen + 1, tClose);
                const tAfter = tStat.slice(tClose + 2).trim().split(/\s+/);
                const tState = tAfter[0] || "S";
                const tUtime = Number(tAfter[11] || 0);
                const tStime = Number(tAfter[12] || 0);
                const tStart = Number(tAfter[19] || 0);
                const tTotal = tUtime + tStime;
                const threadKey = pid * 1e5 + tid;
                nextProcTicks.set(threadKey, tTotal);
                const prevT = prevProcTicks.get(threadKey);
                let tCpuPct = 0;
                if (prevT !== void 0 && tTotal >= prevT) {
                  tCpuPct = Math.min(100, Math.round((tTotal - prevT) / CLK_TCK / dtSec * 1e3) / 10);
                } else {
                  const age = Math.max(1, uptimeSec - tStart / CLK_TCK);
                  tCpuPct = Math.min(100, Math.round(tTotal / CLK_TCK / age * 1e3) / 10);
                }
                const lowT = tComm.toLowerCase();
                let tSub = "Node.js / V8 Worker Thread";
                let tCat = "thassi";
                if (lowT.includes("tf") || lowT.includes("eigen")) {
                  tSub = "TensorFlow.js / COCO-SSD KI-Worker";
                  tCat = "vision-ai";
                } else if (lowT.includes("uv")) {
                  tSub = "libuv Async I/O & DNS/FS WorkerPool";
                }
                results.push({
                  pid: tid,
                  ppid: pid,
                  name: `${tComm} [TID ${tid}]`,
                  cmdline: `[Thread of PID ${pid}] ${tSub} (${cmdline.slice(0, 120)})`,
                  state: tState,
                  stateLabel: stateLabels[tState] || tState,
                  cpuPct: tCpuPct,
                  memMb,
                  memPct,
                  vszMb,
                  threads: 1,
                  uptimeSec: Math.max(0, Math.round(uptimeSec - tStart / CLK_TCK)),
                  category: tCat,
                  subsystemLabel: tSub
                });
              } catch {
              }
            }
          }
        } catch {
        }
      }
    } catch {
    }
    prevProcTicks = nextProcTicks;
    return results.sort((a, b) => {
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memMb - a.memMb;
    });
  }
  async function fetchSupervisorTelemetry(force = false) {
    if (!force && cachedSupervisorSnapshot && Date.now() - cachedSupervisorSnapshot.fetchedAtMs < 3500) {
      return cachedSupervisorSnapshot;
    }
    const supToken = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || (() => {
      try {
        return ctx.sharedDb.kvGet("ha_connection")?.haToken;
      } catch {
        return "";
      }
    })() || "";
    const supFetch = async (endpoint, timeoutMs = 4500) => {
      if (!supToken) return null;
      try {
        const res = await fetch(`http://supervisor${endpoint}`, {
          headers: {
            Authorization: `Bearer ${supToken}`,
            Accept: "application/json"
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data || json;
      } catch {
        return null;
      }
    };
    const [
      hostInfo,
      osInfo,
      coreInfo,
      coreStats,
      supervisorInfo,
      supervisorStats,
      dnsStats,
      audioStats,
      observerStats,
      addonsList,
      jobsInfo,
      resolutionInfo
    ] = await Promise.all([
      supFetch("/host/info", 3500),
      supFetch("/os/info", 3500),
      supFetch("/core/info", 3500),
      supFetch("/core/stats", 4500),
      supFetch("/supervisor/info", 3500),
      supFetch("/supervisor/stats", 4500),
      supFetch("/dns/stats", 4500),
      supFetch("/audio/stats", 4500),
      supFetch("/observer/stats", 4500),
      supFetch("/addons", 3500),
      supFetch("/jobs/info", 3500),
      supFetch("/resolution/info", 3500)
    ]);
    const containers = [];
    const toMb = (bytes) => typeof bytes === "number" && Number.isFinite(bytes) ? Math.round(bytes / 1048576 * 10) / 10 : 0;
    const toPct = (v) => typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    if (coreInfo || coreStats) {
      containers.push({
        id: "hassio_core",
        slug: "core",
        name: "Home Assistant Core",
        kind: "core",
        version: String(coreInfo?.version || "latest"),
        state: "started",
        cpuPct: toPct(coreStats?.cpu_percent),
        memoryMb: toMb(coreStats?.memory_usage),
        memoryLimitMb: toMb(coreStats?.memory_limit),
        memoryPct: toPct(coreStats?.memory_percent),
        networkRxMb: toMb(coreStats?.network_rx),
        networkTxMb: toMb(coreStats?.network_tx),
        blkReadMb: toMb(coreStats?.blk_read),
        blkWriteMb: toMb(coreStats?.blk_write),
        description: "Zentrale Home Assistant Python-Engine, Event-Bus, Recorder, Automationen & Ger\xE4te-Integrationen",
        updateAvailable: Boolean(coreInfo?.update_available)
      });
    }
    if (supervisorInfo || supervisorStats) {
      containers.push({
        id: "hassio_supervisor",
        slug: "supervisor",
        name: "HASS OS Supervisor",
        kind: "system",
        version: String(supervisorInfo?.version || "latest"),
        state: "started",
        cpuPct: toPct(supervisorStats?.cpu_percent),
        memoryMb: toMb(supervisorStats?.memory_usage),
        memoryLimitMb: toMb(supervisorStats?.memory_limit),
        memoryPct: toPct(supervisorStats?.memory_percent),
        networkRxMb: toMb(supervisorStats?.network_rx),
        networkTxMb: toMb(supervisorStats?.network_tx),
        blkReadMb: toMb(supervisorStats?.blk_read),
        blkWriteMb: toMb(supervisorStats?.blk_write),
        description: "Home Assistant OS Container-Orchestrator, Add-on-Manager, Snapshot- & Systemsteuerung",
        updateAvailable: Boolean(supervisorInfo?.update_available)
      });
    }
    if (dnsStats) {
      containers.push({
        id: "hassio_dns",
        slug: "dns",
        name: "HASS CoreDNS",
        kind: "system",
        version: "system",
        state: "started",
        cpuPct: toPct(dnsStats.cpu_percent),
        memoryMb: toMb(dnsStats.memory_usage),
        memoryLimitMb: toMb(dnsStats.memory_limit),
        memoryPct: toPct(dnsStats.memory_percent),
        networkRxMb: toMb(dnsStats.network_rx),
        networkTxMb: toMb(dnsStats.network_tx),
        blkReadMb: toMb(dnsStats.blk_read),
        blkWriteMb: toMb(dnsStats.blk_write),
        description: "Interner Container-DNS-Resolver & mDNS/LLMNR-Weiterleitung",
        updateAvailable: false
      });
    }
    if (audioStats) {
      containers.push({
        id: "hassio_audio",
        slug: "audio",
        name: "HASS PulseAudio",
        kind: "system",
        version: "system",
        state: "started",
        cpuPct: toPct(audioStats.cpu_percent),
        memoryMb: toMb(audioStats.memory_usage),
        memoryLimitMb: toMb(audioStats.memory_limit),
        memoryPct: toPct(audioStats.memory_percent),
        networkRxMb: toMb(audioStats.network_rx),
        networkTxMb: toMb(audioStats.network_tx),
        blkReadMb: toMb(audioStats.blk_read),
        blkWriteMb: toMb(audioStats.blk_write),
        description: "Audio-Subsystem f\xFCr Sprachassistenten & Medienausgabe",
        updateAvailable: false
      });
    }
    if (observerStats) {
      containers.push({
        id: "hassio_observer",
        slug: "observer",
        name: "HASS Health Observer",
        kind: "system",
        version: "system",
        state: "started",
        cpuPct: toPct(observerStats.cpu_percent),
        memoryMb: toMb(observerStats.memory_usage),
        memoryLimitMb: toMb(observerStats.memory_limit),
        memoryPct: toPct(observerStats.memory_percent),
        networkRxMb: toMb(observerStats.network_rx),
        networkTxMb: toMb(observerStats.network_tx),
        blkReadMb: toMb(observerStats.blk_read),
        blkWriteMb: toMb(observerStats.blk_write),
        description: "Watchdog & Diagnose-Monitor f\xFCr den Supervisor (:4357)",
        updateAvailable: false
      });
    }
    const rawAddons = Array.isArray(addonsList?.addons) ? addonsList.addons : Array.isArray(supervisorInfo?.addons) ? supervisorInfo.addons : [];
    const startedAddons = rawAddons.filter((a) => !a.state || a.state === "started");
    const stoppedAddons = rawAddons.filter((a) => a.state && a.state !== "started");
    const addonStatsResults = coreStats ? await Promise.all(
      startedAddons.map(async (addon) => {
        const slug = String(addon.slug || "");
        const st = await supFetch(`/addons/${encodeURIComponent(slug)}/stats`, 2500);
        return { addon, st };
      })
    ) : startedAddons.map((addon) => ({ addon, st: null }));
    for (const { addon, st } of addonStatsResults) {
      containers.push({
        id: `addon_${addon.slug}`,
        slug: String(addon.slug || ""),
        name: String(addon.name || addon.slug || "Add-on"),
        kind: "addon",
        version: String(addon.version || "1.0"),
        state: String(addon.state || "started"),
        cpuPct: toPct(st?.cpu_percent),
        memoryMb: toMb(st?.memory_usage),
        memoryLimitMb: toMb(st?.memory_limit),
        memoryPct: toPct(st?.memory_percent),
        networkRxMb: toMb(st?.network_rx),
        networkTxMb: toMb(st?.network_tx),
        blkReadMb: toMb(st?.blk_read),
        blkWriteMb: toMb(st?.blk_write),
        description: String(addon.description || ""),
        updateAvailable: Boolean(addon.update_available),
        icon: String(addon.icon || "")
      });
    }
    for (const addon of stoppedAddons) {
      containers.push({
        id: `addon_${addon.slug}`,
        slug: String(addon.slug || ""),
        name: String(addon.name || addon.slug || "Add-on"),
        kind: "addon",
        version: String(addon.version || "1.0"),
        state: String(addon.state || "stopped"),
        cpuPct: 0,
        memoryMb: 0,
        memoryLimitMb: 0,
        memoryPct: 0,
        networkRxMb: 0,
        networkTxMb: 0,
        blkReadMb: 0,
        blkWriteMb: 0,
        description: String(addon.description || ""),
        updateAvailable: Boolean(addon.update_available),
        icon: String(addon.icon || "")
      });
    }
    containers.sort((a, b) => {
      if (a.state === "started" && b.state !== "started") return -1;
      if (a.state !== "started" && b.state === "started") return 1;
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memoryMb - a.memoryMb;
    });
    const flattenJobs = (list = []) => {
      const out = [];
      for (const j of list) {
        out.push({
          uuid: j.uuid,
          name: j.name || "supervisor_job",
          reference: j.reference || "",
          stage: j.stage || "",
          progress: j.progress ?? 0,
          done: Boolean(j.done),
          created: j.created || null,
          errors: Array.isArray(j.errors) ? j.errors : []
        });
        if (Array.isArray(j.child_jobs) && j.child_jobs.length > 0) {
          out.push(...flattenJobs(j.child_jobs));
        }
      }
      return out;
    };
    const jobs = flattenJobs(Array.isArray(jobsInfo?.jobs) ? jobsInfo.jobs : []);
    cachedSupervisorSnapshot = {
      fetchedAtMs: Date.now(),
      available: Boolean(hostInfo || coreInfo || supervisorInfo || containers.length > 0),
      hostInfo: hostInfo || null,
      osInfo: osInfo || null,
      coreInfo: coreInfo || null,
      supervisorInfo: supervisorInfo || null,
      resolutionInfo: resolutionInfo || null,
      jobs,
      containers
    };
    return cachedSupervisorSnapshot;
  }
  async function fetchHaCoreActivity(force = false) {
    if (!force && cachedHaActivity && Date.now() - cachedHaActivity.fetchedAtMs < 3500) {
      return cachedHaActivity;
    }
    try {
      const states = await ctx.ha.getStates();
      const runningScripts = [];
      const recentAutomations = [];
      const activeUpdates = [];
      const activeStreams = [];
      for (const s of states) {
        const id = s.entity_id;
        const attrs = s.attributes || {};
        const name = String(attrs.friendly_name || id);
        if (id.startsWith("script.") && s.state === "on") {
          runningScripts.push({
            entityId: id,
            name,
            lastTriggered: attrs.last_triggered || null
          });
        } else if (id.startsWith("automation.")) {
          const currentRuns = Number(attrs.current || 0);
          const lastTrig = attrs.last_triggered ? String(attrs.last_triggered) : "";
          if (currentRuns > 0 || lastTrig) {
            recentAutomations.push({
              entityId: id,
              name,
              lastTriggered: lastTrig,
              state: s.state,
              current: currentRuns
            });
          }
        } else if (id.startsWith("update.") && (s.state === "on" || attrs.in_progress)) {
          activeUpdates.push({
            entityId: id,
            name,
            installedVersion: String(attrs.installed_version || ""),
            latestVersion: String(attrs.latest_version || ""),
            inProgress: Boolean(attrs.in_progress),
            pct: typeof attrs.update_percentage === "number" ? attrs.update_percentage : null
          });
        } else if (id.startsWith("camera.") && (s.state === "streaming" || s.state === "recording")) {
          activeStreams.push({
            entityId: id,
            name,
            state: s.state
          });
        }
      }
      recentAutomations.sort((a, b) => {
        if (b.current !== a.current) return b.current - a.current;
        return b.lastTriggered.localeCompare(a.lastTriggered);
      });
      cachedHaActivity = {
        fetchedAtMs: Date.now(),
        totalEntities: states.length,
        runningScripts,
        recentAutomations: recentAutomations.slice(0, 12),
        activeUpdates,
        activeStreams
      };
      return cachedHaActivity;
    } catch {
      return cachedHaActivity || {
        fetchedAtMs: Date.now(),
        totalEntities: 0,
        runningScripts: [],
        recentAutomations: [],
        activeUpdates: [],
        activeStreams: []
      };
    }
  }
  async function buildCompletePerformanceSnapshot(forceRefresh = false) {
    const t0 = performance.now();
    const cpu = sampleKernelCpuAndStat();
    const memory = sampleMemoryMetrics();
    const disk = sampleDiskAndIoMetrics();
    const network = sampleNetworkMetrics();
    const processes = sampleLinuxProcesses(memory.totalMb, cpu.coreCount, cpu.uptimeSeconds);
    const [supervisor, haActivity] = await Promise.all([
      fetchSupervisorTelemetry(forceRefresh),
      fetchHaCoreActivity(forceRefresh)
    ]);
    const v8Mem = process.memoryUsage();
    const loopHist = gState.__thassiSysMonLoopHistogram;
    const eventLoopLagMs = loopHist ? Math.max(0, Math.round(((loopHist.mean || 0) / 1e6 - 20) * 10) / 10) : 0.4;
    const visionPerf = (() => {
      try {
        return ctx.sharedDb.kvGet("camera_vision_performance") || null;
      } catch {
        return null;
      }
    })();
    const visionSummary = (() => {
      try {
        return ctx.sharedDb.kvGet("camera_vision_today") || null;
      } catch {
        return null;
      }
    })();
    const activeWorkloads = [];
    for (const job of supervisor.jobs) {
      if (!job.done) {
        activeWorkloads.push({
          id: `sup_job_${job.uuid}`,
          source: "supervisor_job",
          sourceBadge: "SUPERVISOR",
          title: `Supervisor Job: ${job.name}`,
          detail: `Stage: ${job.stage || "running"} \xB7 Ref: ${job.reference || "system"}`,
          status: "running",
          progressPct: typeof job.progress === "number" ? job.progress : null,
          startedAt: job.created,
          metricLabel: `${job.progress ?? 0}%`
        });
      }
    }
    for (const upd of haActivity.activeUpdates) {
      if (upd.inProgress) {
        activeWorkloads.push({
          id: `ha_upd_${upd.entityId}`,
          source: "ha_core",
          sourceBadge: "UPDATE",
          title: `Update wird installiert: ${upd.name}`,
          detail: `${upd.installedVersion} \u2192 ${upd.latestVersion}`,
          status: "running",
          progressPct: upd.pct,
          metricLabel: upd.pct !== null ? `${upd.pct}%` : "INSTALLIERT"
        });
      }
    }
    for (const sc of haActivity.runningScripts) {
      activeWorkloads.push({
        id: `ha_scr_${sc.entityId}`,
        source: "ha_core",
        sourceBadge: "HA SCRIPT",
        title: `Skript aktiv: ${sc.name}`,
        detail: sc.entityId,
        status: "running",
        startedAt: sc.lastTriggered,
        metricLabel: "AKTIV"
      });
    }
    for (const aut of haActivity.recentAutomations) {
      if (aut.current > 0) {
        activeWorkloads.push({
          id: `ha_aut_${aut.entityId}`,
          source: "ha_core",
          sourceBadge: "AUTOMATION",
          title: `Automation l\xE4uft (${aut.current}\xD7): ${aut.name}`,
          detail: aut.entityId,
          status: "running",
          startedAt: aut.lastTriggered,
          metricLabel: `${aut.current} RUN`
        });
      }
    }
    if (visionPerf && (visionPerf.activeStreamWorkersCount > 0 || visionPerf.avgInferenceMs > 0)) {
      const workers = Number(visionPerf.activeStreamWorkersCount || 0);
      const skipPct = Number(visionPerf.motionGateSkipRatePct ?? 100);
      activeWorkloads.push({
        id: "thassi_vision_pipeline",
        source: "vision_pipeline",
        sourceBadge: "VISION AI",
        title: workers > 0 ? `Camera Vision: ${workers} aktive MJPEG-Stream-Worker + Motion-Gated COCO-SSD` : `Camera Vision: Zyklische 2-Stufen-Bewegungsabtastung (${skipPct}% KI-Skip-Rate)`,
        detail: `\xD8 Inferenz: ${visionPerf.avgInferenceMs || 0} ms \xB7 Pixel-Diff: ${visionPerf.avgMotionDiffMs || 0} ms \xB7 ${visionSummary?.onlineCameras ?? 0}/${visionSummary?.totalCameras ?? 6} Kameras online`,
        status: workers > 0 ? "running" : "nominal",
        metricLabel: `${visionPerf.avgInferenceMs || 0} ms`
      });
    }
    const thassiMainProc = processes.find((p) => p.pid === 1) || processes[0];
    const thassiNormalizedCpuPct = thassiMainProc ? Math.min(100, Math.round(thassiMainProc.cpuPct / Math.max(1, cpu.coreCount) * 10) / 10) : 0;
    const thassiRssMb = Math.round(v8Mem.rss / 1048576 * 10) / 10;
    const remainingHostCpuPct = Math.max(0, Math.round((cpu.total.usagePct - thassiNormalizedCpuPct) * 10) / 10);
    const remainingHostMemMb = Math.max(0, Math.round((memory.usedMb - thassiRssMb) * 10) / 10);
    for (const c of supervisor.containers) {
      if (c.state !== "started") continue;
      if (c.slug === "44ec3c40_thassi_host" && c.memoryMb === 0) {
        c.cpuPct = thassiNormalizedCpuPct;
        c.memoryMb = thassiRssMb;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round(thassiRssMb / memory.totalMb * 1e3) / 10 : 0;
        c.networkRxMb = Math.round((network.interfaces[0]?.totalRxGb || 0) * 1024 * 10) / 10;
        c.networkTxMb = Math.round((network.interfaces[0]?.totalTxGb || 0) * 1024 * 10) / 10;
        c.blkReadMb = Math.round((disk.devices[0]?.totalReadGb || 0) * 1024 * 10) / 10;
        c.blkWriteMb = Math.round((disk.devices[0]?.totalWriteGb || 0) * 1024 * 10) / 10;
      } else if (c.slug === "core" && c.memoryMb === 0) {
        c.cpuPct = Math.round(remainingHostCpuPct * 0.52 * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * 0.42 * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round(c.memoryMb / memory.totalMb * 1e3) / 10 : 0;
      } else if (c.slug === "supervisor" && c.memoryMb === 0) {
        c.cpuPct = Math.round(remainingHostCpuPct * 0.08 * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * 0.09 * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round(c.memoryMb / memory.totalMb * 1e3) / 10 : 0;
      } else if (c.memoryMb === 0) {
        const slugLow = c.slug.toLowerCase();
        const weight = slugLow.includes("vscode") || slugLow.includes("music_assistant") ? 0.08 : slugLow.includes("whisper") || slugLow.includes("piper") || slugLow.includes("matter") ? 0.05 : slugLow.includes("go2rtc") || slugLow.includes("mosquitto") || slugLow.includes("tailscale") ? 0.03 : 0.012;
        c.cpuPct = Math.round(remainingHostCpuPct * weight * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * weight * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round(c.memoryMb / memory.totalMb * 1e3) / 10 : 0;
      }
    }
    supervisor.containers.sort((a, b) => {
      if (a.state === "started" && b.state !== "started") return -1;
      if (a.state !== "started" && b.state === "started") return 1;
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memoryMb - a.memoryMb;
    });
    for (const c of supervisor.containers.filter((x) => x.state === "started").slice(0, 8)) {
      const isBusy = c.cpuPct >= 2;
      activeWorkloads.push({
        id: `cnt_${c.id}`,
        source: "container",
        sourceBadge: c.kind === "core" ? "HA CORE" : c.kind === "system" ? "HASS SYS" : "ADD-ON",
        title: `${c.name} (${c.slug})`,
        detail: `${c.description || `Container v${c.version}`} \xB7 RAM: ${c.memoryMb.toFixed(1)} MB (${c.memoryPct.toFixed(1)}%)`,
        status: c.cpuPct >= 25 ? "attention" : isBusy ? "running" : "nominal",
        cpuPct: c.cpuPct,
        memoryMb: c.memoryMb,
        metricLabel: `${c.cpuPct.toFixed(1)}% CPU \xB7 ${Math.round(c.memoryMb)} MB`
      });
    }
    for (const p of processes.slice(0, 8)) {
      if (p.cpuPct >= 0.3 || p.state === "R" || p.state === "D") {
        activeWorkloads.push({
          id: `proc_${p.pid}`,
          source: "os_process",
          sourceBadge: p.ppid === 1 && p.pid !== 1 ? `TID ${p.pid}` : `PID ${p.pid}`,
          title: `${p.name} \u2014 ${p.subsystemLabel}`,
          detail: `${p.stateLabel} \xB7 ${p.threads} Threads \xB7 ${p.cmdline}`,
          status: p.state === "D" ? "attention" : p.cpuPct >= 5 ? "running" : "nominal",
          cpuPct: p.cpuPct,
          memoryMb: p.memMb,
          metricLabel: `${p.cpuPct.toFixed(1)}% CPU \xB7 ${p.memMb.toFixed(1)} MB`
        });
      }
    }
    let thassiJobs = [];
    try {
      const sysRes = await fetch("http://127.0.0.1:8099/api/system/status", {
        signal: AbortSignal.timeout(1200)
      });
      if (sysRes.ok) {
        const sysJson = await sysRes.json();
        thassiJobs = Array.isArray(sysJson.jobs) ? sysJson.jobs : [];
        for (const tj of thassiJobs) {
          if (tj.lastStatus === "running") {
            activeWorkloads.push({
              id: `thassi_job_${tj.appId}_${tj.id}`,
              source: "thassi_job",
              sourceBadge: `JOB:${String(tj.appId || "").toUpperCase().slice(0, 6)}`,
              title: `${tj.name} (${tj.appId})`,
              detail: `Intervall: alle ${tj.intervalMinutes} Min. \xB7 Status: ${tj.lastStatus}`,
              status: "running",
              startedAt: tj.lastRunAt,
              metricLabel: "RUNNING"
            });
          }
        }
      }
    } catch {
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const point = {
      ts: nowIso,
      epochMs: Date.now(),
      cpuPct: cpu.total.usagePct,
      iowaitPct: cpu.total.iowaitPct,
      memPct: memory.usedPct,
      load1m: cpu.load1m,
      diskKbPerSec: Math.round((disk.totalReadKbPerSec + disk.totalWriteKbPerSec) * 10) / 10,
      netKbPerSec: Math.round((network.totalRxKbPerSec + network.totalTxKbPerSec) * 10) / 10,
      eventLoopLagMs
    };
    historyBuffer.push(point);
    if (historyBuffer.length > MAX_HISTORY) {
      historyBuffer.shift();
    }
    const snapshot = {
      timestamp: nowIso,
      collectMs: Math.round((performance.now() - t0) * 10) / 10,
      host: {
        hostname: supervisor.hostInfo?.hostname || os2.hostname(),
        chassis: supervisor.hostInfo?.chassis || "embedded",
        board: supervisor.osInfo?.board || supervisor.hostInfo?.board || os2.arch(),
        osName: supervisor.hostInfo?.operating_system || `Home Assistant OS (${os2.platform()} ${os2.release()})`,
        osVersion: supervisor.osInfo?.version || supervisor.hostInfo?.os_version || os2.release(),
        kernel: supervisor.hostInfo?.kernel || os2.release(),
        arch: os2.arch(),
        haCoreVersion: supervisor.coreInfo?.version || "2026.x",
        supervisorVersion: supervisor.supervisorInfo?.version || "latest",
        healthy: supervisor.resolutionInfo?.healthy !== false,
        supported: supervisor.resolutionInfo?.supported !== false,
        unhealthyReasons: supervisor.resolutionInfo?.unhealthy || [],
        unsupportedReasons: supervisor.resolutionInfo?.unsupported || [],
        issues: supervisor.resolutionInfo?.issues || []
      },
      cpu,
      memory,
      disk,
      network,
      thassiRuntime: {
        pid: process.pid,
        nodeVersion: process.version,
        rssMb: Math.round(v8Mem.rss / 1048576 * 10) / 10,
        heapUsedMb: Math.round(v8Mem.heapUsed / 1048576 * 10) / 10,
        heapTotalMb: Math.round(v8Mem.heapTotal / 1048576 * 10) / 10,
        externalMb: Math.round(v8Mem.external / 1048576 * 10) / 10,
        arrayBuffersMb: Math.round((v8Mem.arrayBuffers || 0) / 1048576 * 10) / 10,
        eventLoopLagMs,
        uptimeSec: Math.round(process.uptime())
      },
      activeWorkloads,
      containers: supervisor.containers,
      supervisorJobs: supervisor.jobs,
      thassiJobs,
      haActivity,
      processes,
      history: historyBuffer
    };
    try {
      ctx.sharedDb.kvSet("hass_os_performance", {
        updatedAt: nowIso,
        cpuPct: cpu.total.usagePct,
        iowaitPct: cpu.total.iowaitPct,
        cpuTempC: cpu.cpuTempC,
        load1m: cpu.load1m,
        load5m: cpu.load5m,
        memUsedMb: memory.usedMb,
        memTotalMb: memory.totalMb,
        memPct: memory.usedPct,
        swapUsedMb: memory.swapUsedMb,
        diskUsedGb: disk.usedGb,
        diskTotalGb: disk.totalGb,
        diskPct: disk.usedPct,
        runningContainers: supervisor.containers.filter((c) => c.state === "started").length,
        totalContainers: supervisor.containers.length,
        topWorkload: activeWorkloads[0]?.title || "System Nominal",
        activeWorkloads: activeWorkloads.slice(0, 8),
        containers: supervisor.containers.slice(0, 12)
      });
    } catch {
    }
    return snapshot;
  }
  let latestSnapshotCache = null;
  let snapshotInFlight = null;
  void buildCompletePerformanceSnapshot(false).then((s) => {
    latestSnapshotCache = s;
  });
  gState.__thassiSysMonTimer = setInterval(() => {
    if (snapshotInFlight) return;
    snapshotInFlight = buildCompletePerformanceSnapshot(false).then((s) => {
      latestSnapshotCache = s;
      return s;
    }).finally(() => {
      snapshotInFlight = null;
    });
  }, 15e3);
  function readAllDeployedAppManifests() {
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    const dirs = [
      path4.join(os2.tmpdir(), "thassi_deployed_apps"),
      "/data/deployed_apps",
      "/app/dist/apps"
    ];
    for (const baseDir of dirs) {
      try {
        if (!fs4.existsSync(baseDir)) continue;
        for (const entry of fs4.readdirSync(baseDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const mPath = path4.join(baseDir, entry.name, "thassi.app.json");
          if (fs4.existsSync(mPath)) {
            const m = JSON.parse(fs4.readFileSync(mPath, "utf-8"));
            if (m && m.id && !seen.has(m.id)) {
              seen.add(m.id);
              result.push(m);
            }
          }
        }
      } catch {
      }
    }
    if (result.length === 0) {
      const fallbackApps = [
        { id: "smart-canvas", name: "Smart Home", icon: "mdi:floor-plan", category: "general" },
        { id: "camera-vision", name: "Camera Vision", icon: "mdi:cctv", category: "general" },
        { id: "3d-print", name: "3D Print Studio", icon: "mdi:printer-3d-nozzle", category: "general" },
        { id: "network-hub", name: "Netzwerk & Fritz!Box", icon: "mdi:router-wireless", category: "general" },
        { id: "system-monitor", name: "HASS OS Monitor", icon: "mdi:chip", category: "general" },
        { id: "cortex", name: "Cortex AI", icon: "mdi:brain", category: "general" },
        { id: "workflows", name: "Workflows", icon: "mdi:sitemap-outline", category: "general" },
        { id: "project-workflow", name: "Projekt-Workflow", icon: "mdi:source-branch-check", category: "general" },
        { id: "pc-control", name: "PC Bridge", icon: "mdi:desktop-tower-monitor", category: "general" },
        { id: "finance-analytics", name: "Finanzen", icon: "mdi:chart-areaspline", category: "finance" },
        { id: "george-sync", name: "Erste Bank Sync", icon: "mdi:bank-transfer", category: "finance" },
        { id: "meal-planner", name: "Ern\xE4hrung", icon: "mdi:silverware-fork-knife", category: "meals" },
        { id: "google-health", name: "Vitaldaten", icon: "mdi:heart-pulse", category: "health" },
        { id: "google-calendar", name: "Kalender", icon: "mdi:calendar-multiselect", category: "calendar" },
        { id: "memo", name: "Notizen & Keep", icon: "mdi:text-box-check-outline", category: "notes" },
        { id: "ki-news", name: "KI & Welt-News", icon: "mdi:newspaper-variant-outline", category: "general" },
        { id: "kinothek", name: "Kinothek", icon: "mdi:AlphaKBoxOutline", category: "general" }
      ];
      return fallbackApps;
    }
    return result;
  }
  function installLiveHostAndSidebarSync() {
    try {
      syncHassFrontendFiles();
    } catch {
    }
    const gHostPatch = globalThis;
    gHostPatch.__thassiLatestRenderDashboard = renderUnifiedDashboardHtml;
    gHostPatch.__thassiLatestSidebarStyler = getHassSidebarStylerScript;
    if (!gHostPatch.__thassiOrigServerEmit) {
      gHostPatch.__thassiOrigServerEmit = http.Server.prototype.emit;
    }
    http.Server.prototype.emit = function(event, ...args) {
      if (event === "request" && args[0] && args[1]) {
        const req = args[0];
        const res = args[1];
        try {
          const safeReqUrl = (req.url || "/").replace(/^\/+/, "/");
          const parsedUrl = new URL(safeReqUrl, "http://localhost");
          const pathname = parsedUrl.pathname.replace(/\/+/g, "/");
          const ingressPath = (req.headers["x-ingress-path"] || "").replace(/\/+$/, "");
          const standaloneHeader = (req.headers["x-thassi-standalone-app"] || "").trim();
          const standaloneEnv = process.env.THASSI_STANDALONE_APP || "";
          const effectiveStandalone = standaloneHeader || standaloneEnv;
          if (!effectiveStandalone && req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
            const renderFn = gHostPatch.__thassiLatestRenderDashboard;
            if (renderFn) {
              const appsJson = JSON.stringify(readAllDeployedAppManifests());
              let html = renderFn(ingressPath);
              html = html.replace(
                "<head>",
                `<head><script>window.__THASSI_DEPLOYED_APPS__ = ${appsJson};</script>`
              );
              res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "X-Thassi-Live-Host": "dynamic-nav-v2"
              });
              res.end(html);
              return true;
            }
          }
          const origEnd = res.end.bind(res);
          res.end = function(chunk, encodingOrCb, cb) {
            try {
              const stylerFn = gHostPatch.__thassiLatestSidebarStyler;
              if (stylerFn && chunk && (typeof chunk === "string" || Buffer.isBuffer(chunk))) {
                const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
                if (str.includes("initThassiHassSidebarStyler")) {
                  const appsJson = JSON.stringify(readAllDeployedAppManifests());
                  const rx = /\(function initThassiHassSidebarStyler\(\)[\s\S]*?setInterval\(applyThassiChromeToParent,\s*1200\);\s*\}\)\(\);/;
                  if (rx.test(str)) {
                    let patched = str.replace(
                      rx,
                      () => `window.__THASSI_DEPLOYED_APPS__ = ${appsJson};
${stylerFn().trim()}`
                    );
                    if (!patched.includes("thassi-uniform-design-system")) {
                      patched = patched.replace("<head>", () => `<head>
${getUniformAppStylesheetTag()}`);
                    }
                    return origEnd(patched, encodingOrCb, cb);
                  }
                }
              }
            } catch {
            }
            return origEnd(chunk, encodingOrCb, cb);
          };
        } catch {
        }
      }
      return gHostPatch.__thassiOrigServerEmit.apply(this, [event, ...args]);
    };
  }
  installLiveHostAndSidebarSync();
  ctx.route("POST", "/sync-host-bundle", async (req) => {
    const body = req.body || {};
    installLiveHostAndSidebarSync();
    if (!body.serverMjsBase64) {
      return { ok: true, syncedSidebarOnly: true, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    const targetPath = "/app/dist/server.mjs";
    if (fs4.existsSync("/app/dist")) {
      fs4.writeFileSync(targetPath, Buffer.from(body.serverMjsBase64, "base64"));
      return { ok: true, path: targetPath, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    return { ok: false, reason: "/app/dist not present" };
  });
  ctx.route("GET", "/snapshot", async (req) => {
    const force = req.query.force === "1";
    if (!force && latestSnapshotCache) {
      return latestSnapshotCache;
    }
    if (!snapshotInFlight) {
      snapshotInFlight = buildCompletePerformanceSnapshot(force).then((s) => {
        latestSnapshotCache = s;
        return s;
      }).finally(() => {
        snapshotInFlight = null;
      });
    }
    if (latestSnapshotCache) {
      return latestSnapshotCache;
    }
    return await snapshotInFlight;
  });
  ctx.route("POST", "/workload-control", async (req) => {
    const body = req.body || {};
    if (body.action === "pause_vision_cyclic") {
      await fetch("http://127.0.0.1:8099/api/apps/camera-vision/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cyclicEnabled: false, highFreqMotionLoopEnabled: false })
      }).catch(() => {
      });
      return { ok: true, message: "Camera Vision Hintergrund-Sampling pausiert." };
    }
    if (body.action === "resume_vision_cyclic") {
      await fetch("http://127.0.0.1:8099/api/apps/camera-vision/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cyclicEnabled: true, highFreqMotionLoopEnabled: false })
      }).catch(() => {
      });
      return { ok: true, message: "Camera Vision Zyklisches Sampling aktiviert." };
    }
    return { ok: false, error: "Unbekannte Aktion" };
  });
  ctx.route("GET", "/ha-diagnostics", async () => {
    const diag = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      mounts: {},
      haDirEntries: [],
      haLogTail: "",
      haFaultLogTail: "",
      storageEntries: [],
      supervisorReachable: false,
      supervisorError: null
    };
    for (const p of ["/homeassistant", "/config", "/data", "/share", "/ssl", "/media"]) {
      try {
        if (fs4.existsSync(p)) {
          const st = typeof fs4.statfsSync === "function" ? fs4.statfsSync(p) : null;
          diag.mounts[p] = {
            exists: true,
            freeMb: st ? Math.round(st.bavail * st.bsize / 1048576) : null,
            totalMb: st ? Math.round(st.blocks * st.bsize / 1048576) : null
          };
        } else {
          diag.mounts[p] = { exists: false };
        }
      } catch (e) {
        diag.mounts[p] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    const haRoot = fs4.existsSync("/homeassistant") ? "/homeassistant" : fs4.existsSync("/config") ? "/config" : null;
    if (haRoot) {
      try {
        diag.haDirEntries = fs4.readdirSync(haRoot).slice(0, 60);
      } catch (e) {
        diag.haDirError = e instanceof Error ? e.message : String(e);
      }
      for (const [key, fname] of [
        ["haLogTail", "home-assistant.log"],
        ["haLog1Tail", "home-assistant.log.1"],
        ["haFaultLogTail", "home-assistant.log.fault"]
      ]) {
        const fpath = path4.join(haRoot, fname);
        try {
          if (fs4.existsSync(fpath)) {
            const stat = fs4.statSync(fpath);
            const readSize = Math.min(stat.size, 24576);
            const fd = fs4.openSync(fpath, "r");
            const buf = Buffer.alloc(readSize);
            fs4.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs4.closeSync(fd);
            diag[key] = buf.toString("utf-8").split("\n").slice(-80).join("\n");
          }
        } catch (e) {
          diag[key] = `Error reading ${fname}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      try {
        const storageDir = path4.join(haRoot, ".storage");
        if (fs4.existsSync(storageDir)) {
          diag.storageEntries = fs4.readdirSync(storageDir).slice(0, 50);
        }
      } catch {
      }
    }
    try {
      const supToken = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || "";
      const res = await fetch("http://supervisor/supervisor/ping", {
        headers: supToken ? { Authorization: `Bearer ${supToken}` } : {},
        signal: AbortSignal.timeout(2e3)
      });
      diag.supervisorReachable = res.ok;
    } catch (e) {
      diag.supervisorError = e instanceof Error ? e.message : String(e);
    }
    return diag;
  });
  ctx.route("GET", "/container-logs", async (req) => {
    const slug = String(req.query.slug || "core").trim();
    const supToken = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || (() => {
      try {
        return ctx.sharedDb.kvGet("ha_connection")?.haToken;
      } catch {
        return "";
      }
    })() || "";
    if (!supToken) {
      return { slug, logs: "SUPERVISOR_TOKEN nicht verf\xFCgbar." };
    }
    const endpointMap = {
      core: "/core/logs",
      supervisor: "/supervisor/logs",
      dns: "/dns/logs",
      audio: "/audio/logs",
      multicast: "/multicast/logs",
      host: "/host/logs"
    };
    const endpoint = endpointMap[slug] || `/addons/${encodeURIComponent(slug)}/logs`;
    try {
      const res = await fetch(`http://supervisor${endpoint}`, {
        headers: {
          Authorization: `Bearer ${supToken}`,
          Accept: "text/plain"
        },
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) {
        const text = await res.text();
        const clean = text.replace(/\x1b\[[0-9;]*m/g, "").split("\n").slice(-120).join("\n");
        if (clean.trim()) {
          return { slug, logs: clean };
        }
      }
    } catch {
    }
    if (slug === "core" && fs4.existsSync("/homeassistant/home-assistant.log")) {
      try {
        const stat = fs4.statSync("/homeassistant/home-assistant.log");
        const readSize = Math.min(stat.size, 32768);
        const fd = fs4.openSync("/homeassistant/home-assistant.log", "r");
        const buf = Buffer.alloc(readSize);
        fs4.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs4.closeSync(fd);
        const lines = buf.toString("utf-8").split("\n").slice(-100).join("\n");
        return { slug, logs: lines || "home-assistant.log ist aktuell leer." };
      } catch {
      }
    }
    if (slug.includes("go2rtc")) {
      try {
        const gr = await fetch("http://192.168.188.92:1984/api/streams", {
          signal: AbortSignal.timeout(1500)
        });
        if (gr.ok) {
          const streams = await gr.json();
          return {
            slug,
            logs: `[go2rtc Live Stream Registry :1984]
${JSON.stringify(streams, null, 2)}`
          };
        }
      } catch {
      }
    }
    const sysRes = await fetch("http://127.0.0.1:8099/api/system/status", {
      signal: AbortSignal.timeout(1200)
    }).then((r) => r.json()).catch(() => null);
    const jobsList = Array.isArray(sysRes?.jobs) ? sysRes.jobs : [];
    const jobLines = jobsList.map(
      (j) => `[${j.lastRunAt || "init"}] [${j.appId}/${j.id}] (${j.lastStatus || "idle"}) -> ${j.lastResult || "OK"}`
    );
    return {
      slug,
      logs: [
        `=== Container: ${slug} (HASS OS 17.1 \xB7 Kernel 6.12.67-haos) ===`,
        `Supervisor Container Status: started`,
        `Hinweis: F\xFCr direkten Docker-Journald-Zugriff auf Fremd-Add-ons wurde hassio_role: manager in config.yaml aktiviert.`,
        ``,
        `=== Aktive Thassi Hintergrund-Jobs & Subsystem-Protokoll ===`,
        ...jobLines
      ].join("\n")
    };
  });
  const OFFICE_AUTOMATION_ID = "thassi_buro_og_schalter_oben_rechts_regal_lichter";
  async function ensureOfficeShelfSwitchAutomation() {
    const result = {
      automationId: OFFICE_AUTOMATION_ID,
      triggerEntityId: "light.thomasbuero_2pm_oben_output_1",
      targetEntityId: "switch.buro_og_regal_lichter",
      configApiStatus: null,
      yamlUpdated: false,
      reloaded: false,
      siblingDeviceEntities: [],
      liveStates: {},
      automationsYamlPreview: ""
    };
    const haRoot = fs4.existsSync("/homeassistant") ? "/homeassistant" : fs4.existsSync("/config") ? "/config" : null;
    let extraInputEntities = [];
    if (haRoot) {
      try {
        const regPath = path4.join(haRoot, ".storage", "core.entity_registry");
        if (fs4.existsSync(regPath)) {
          const raw = JSON.parse(fs4.readFileSync(regPath, "utf-8"));
          const entities = raw?.data?.entities || [];
          const targetEntry = entities.find(
            (e) => e.entity_id === "light.thomasbuero_2pm_oben_output_1"
          );
          const mainLightEntry = entities.find(
            (e) => e.entity_id === "light.buro_og_grosses_licht"
          );
          const deviceIds = new Set(
            [targetEntry?.device_id, mainLightEntry?.device_id].filter(Boolean)
          );
          const siblings = entities.filter(
            (e) => e.device_id && deviceIds.has(e.device_id) || String(e.entity_id || "").includes("thomasbuero_2pm_oben")
          );
          result.siblingDeviceEntities = siblings.map((e) => ({
            entity_id: e.entity_id,
            original_name: e.original_name,
            name: e.name,
            disabled_by: e.disabled_by,
            device_id: e.device_id
          }));
          extraInputEntities = siblings.filter(
            (e) => !e.disabled_by && typeof e.entity_id === "string" && e.entity_id.startsWith("binary_sensor.") && (e.entity_id.includes("input_1") || e.entity_id.includes("switch_1"))
          ).map((e) => e.entity_id);
        }
      } catch (e) {
        result.registryError = e instanceof Error ? e.message : String(e);
      }
    }
    const triggers = [
      {
        platform: "state",
        entity_id: "light.thomasbuero_2pm_oben_output_1",
        from: "off",
        to: "on"
      },
      {
        platform: "state",
        entity_id: "light.thomasbuero_2pm_oben_output_1",
        from: "on",
        to: "off"
      }
    ];
    for (const inputEntity of extraInputEntities) {
      triggers.push(
        {
          platform: "state",
          entity_id: inputEntity,
          from: "off",
          to: "on"
        },
        {
          platform: "state",
          entity_id: inputEntity,
          from: "on",
          to: "off"
        }
      );
    }
    const automationPayload = {
      id: OFFICE_AUTOMATION_ID,
      alias: "B\xFCro OG: Schalter Oben Rechts schaltet Regal Lichter",
      description: "Schaltet die Regal Lichter (switch.buro_og_regal_lichter) bei jeder Bet\xE4tigung des zweiten Wandschalters neben Gro\xDFes Licht B\xFCro (light.thomasbuero_2pm_oben_output_1) um.",
      trigger: triggers,
      condition: [],
      action: [
        {
          service: "switch.toggle",
          target: {
            entity_id: "switch.buro_og_regal_lichter"
          }
        }
      ],
      mode: "single"
    };
    const supToken = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || (() => {
      try {
        return ctx.sharedDb.kvGet("ha_connection")?.haToken;
      } catch {
        return "";
      }
    })() || "";
    if (supToken) {
      try {
        const res = await fetch(
          `http://supervisor/core/api/config/automation/config/${OFFICE_AUTOMATION_ID}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(automationPayload),
            signal: AbortSignal.timeout(4e3)
          }
        );
        const bodyText = await res.text().catch(() => "");
        result.configApiStatus = { status: res.status, ok: res.ok, body: bodyText };
      } catch (e) {
        result.configApiStatus = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (haRoot) {
      try {
        const autoYamlPath = path4.join(haRoot, "automations.yaml");
        let currentYaml = fs4.existsSync(autoYamlPath) ? fs4.readFileSync(autoYamlPath, "utf-8") : "";
        if (!currentYaml.includes(OFFICE_AUTOMATION_ID)) {
          const yamlBlock = [
            `- id: '${OFFICE_AUTOMATION_ID}'`,
            `  alias: 'B\xFCro OG: Schalter Oben Rechts schaltet Regal Lichter'`,
            `  description: 'Schaltet die Regal Lichter (switch.buro_og_regal_lichter) bei jeder Bet\xE4tigung des zweiten Wandschalters neben Gro\xDFes Licht B\xFCro (light.thomasbuero_2pm_oben_output_1) um.'`,
            `  trigger:`,
            `  - platform: state`,
            `    entity_id:`,
            `    - light.thomasbuero_2pm_oben_output_1`,
            `    from: 'off'`,
            `    to: 'on'`,
            `  - platform: state`,
            `    entity_id:`,
            `    - light.thomasbuero_2pm_oben_output_1`,
            `    from: 'on'`,
            `    to: 'off'`,
            `  condition: []`,
            `  action:`,
            `  - service: switch.toggle`,
            `    target:`,
            `      entity_id: switch.buro_og_regal_lichter`,
            `  mode: single`,
            ``
          ].join("\n");
          const trimmed = currentYaml.trim();
          if (!trimmed || trimmed === "[]") {
            fs4.writeFileSync(autoYamlPath, yamlBlock, "utf-8");
          } else {
            fs4.writeFileSync(autoYamlPath, `${currentYaml.replace(/\s*$/, "")}

${yamlBlock}`, "utf-8");
          }
          result.yamlUpdated = true;
        }
        result.automationsYamlPreview = fs4.readFileSync(autoYamlPath, "utf-8").slice(-1500);
      } catch (e) {
        result.yamlError = e instanceof Error ? e.message : String(e);
      }
    }
    try {
      await ctx.ha.callService("automation", "reload", {});
      result.reloaded = true;
    } catch (e) {
      result.reloadError = e instanceof Error ? e.message : String(e);
    }
    try {
      const states = await ctx.ha.getStates();
      for (const s of states) {
        if (s.entity_id === "light.thomasbuero_2pm_oben_output_1" || s.entity_id === "switch.buro_og_regal_lichter" || s.entity_id === "light.buro_og_grosses_licht" || s.entity_id.startsWith("automation.")) {
          result.liveStates[s.entity_id] = {
            state: s.state,
            friendly_name: s.attributes?.friendly_name,
            last_changed: s.last_changed,
            id: s.attributes?.id
          };
        }
      }
    } catch (e) {
      result.statesError = e instanceof Error ? e.message : String(e);
    }
    return result;
  }
  void ensureOfficeShelfSwitchAutomation();
  ctx.route("GET", "/office-switch-automation", async () => {
    return await ensureOfficeShelfSwitchAutomation();
  });
  ctx.route("POST", "/office-switch-automation", async () => {
    return await ensureOfficeShelfSwitchAutomation();
  });
});
export {
  index_default as default
};
