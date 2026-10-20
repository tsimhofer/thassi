import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/finance-analytics/backend/index.ts
import http from "node:http";

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
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
function getHassSidebarStylerScript() {
  return `
  (function initThassiHassSidebarStyler() {
    const SUBTLE_BAR_BG = '#161f2e';

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #040711 !important;
        --secondary-background-color: #161f2e !important;
        --card-background-color: rgba(8, 13, 26, 0.72) !important;
        --ha-card-background: rgba(8, 13, 26, 0.72) !important;
        --sidebar-background-color: \${SUBTLE_BAR_BG} !important;
        --sidebar-text-color: #cbd5e1 !important;
        --sidebar-icon-color: #94a3b8 !important;
        --sidebar-selected-text-color: #f8fafc !important;
        --sidebar-selected-icon-color: #38bdf8 !important;
        --primary-color: #38bdf8 !important;
        --accent-color: #38bdf8 !important;
        --divider-color: rgba(255, 255, 255, 0.08) !important;
        --app-header-background-color: \${SUBTLE_BAR_BG} !important;
        --app-header-text-color: #f8fafc !important;
        --mdc-theme-primary: #38bdf8 !important;
        --mdc-theme-surface: \${SUBTLE_BAR_BG} !important;
        background-color: #040711 !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer,
      aside.mdc-drawer {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        border-right: 1px solid rgba(255, 255, 255, 0.07) !important;
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
        color: #cbd5e1 !important;
        border-right: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .menu {
        background: \${SUBTLE_BAR_BG} !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
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
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        transition: none !important;
        transform: none !important;
        box-shadow: none !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        transform: none !important;
        box-shadow: none !important;
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
      ha-md-list-item[href="/aishe-energy"] {
        display: none !important;
      }
    \`;

    const LOVELACE_FULLBLEED_CSS = \`
      .header, app-header, .toolbar {
        display: none !important;
        height: 0 !important;
      }
      #view {
        padding: 0 !important;
        margin: 0 !important;
        height: 100vh !important;
        min-height: 100vh !important;
        background: #040711 !important;
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
        }

        // Persist clean sidebar order & hidden panels in localStorage for all browser sessions
        try {
          const hidden = [
            "home","lovelace","light","security","climate","energy",
            "media-browser","logbook","history","todo","calendar",
            "map","thomas-buero","aishe-diagnose","aishe-details","aishe-security","aishe-energy"
          ];
          const order = [
            "44ec3c40_thassi_host",
            "44ec3c40_thassi_workflows",
            "44ec3c40_thassi_memo",
            "44ec3c40_thassi_cortex",
            "44ec3c40_thassi_finance_analytics",
            "44ec3c40_thassi_google_health",
            "44ec3c40_thassi_meal_planner",
            "44ec3c40_thassi_google_calendar",
            "44ec3c40_thassi_smart_canvas",
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
      // No-op: keep sidebar solid subtle non-black background with no effects
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
  <style>html,body{margin:0;padding:0;background:#040711;overflow:hidden;width:100%;height:100%;}iframe{width:100%;height:100%;border:0;display:block;}</style>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --text: #f8fafc;
      --text-soft: rgba(248, 250, 252, 0.72);
      --text-muted: rgba(248, 250, 252, 0.45);
      --accent: #38bdf8;
      --sun-glow: #fbbf24;
      --nav-safe-left: 0px;
      --devices-dock-height: 44px;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; user-select: none; }
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100dvh;
      overflow: hidden;
      background: #040711;
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* TOOLBAR / LEFT NAVBAR HIDDEN ALTOGETHER PER USER REQUEST */
    #left-ambient-navbar,
    #mobile-nav-toggle,
    #mobile-nav-backdrop {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    /* DIRECT SPECIAL-VIEW NAVIGATION BUTTONS IN HORIZON DASHBOARD */
    .w-nav-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(248, 250, 252, 0.78);
      border-radius: 7px;
      padding: 1px 6px;
      font-family: var(--font-sans);
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.18s ease;
      line-height: 1.3;
    }
    .w-nav-btn:hover {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.45);
      color: #ffffff;
    }
    .horizon-view-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(248, 250, 252, 0.78);
      border-radius: 8px;
      padding: 3px 9px;
      font-family: var(--font-sans);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.05em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    }
    .horizon-view-btn:hover {
      background: rgba(56, 189, 248, 0.16);
      border-color: rgba(56, 189, 248, 0.4);
      color: #ffffff;
    }
    .cal-filter-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    #horizon-cal-filter-popover {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 310px;
      max-height: 340px;
      background: rgba(11, 17, 32, 0.96);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 14px 38px rgba(0, 0, 0, 0.78);
      z-index: 95;
      pointer-events: auto;
      flex-direction: column;
      gap: 8px;
    }
    #horizon-cal-filter-popover.open {
      display: flex;
    }
    .cal-filter-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      max-height: 210px;
      padding-right: 2px;
    }
    .cal-filter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      font-size: 11.5px;
      color: #e2e8f0;
      user-select: none;
    }
    .cal-filter-row:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.3);
    }

    /* 1. DYNAMIC DAYTIME SKY, WEATHER FX & ABSTRACT CELESTIAL HORIZON STAGE */
    #sky-stage {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100dvh;
      z-index: 1;
      pointer-events: none;
      transition: background 1.2s cubic-bezier(0.22, 1, 0.36, 1);
      overflow: hidden;
    }
    #starfield {
      position: absolute;
      inset: 0;
      transition: opacity 1.5s ease;
    }
    .star {
      position: absolute;
      background: #fff;
      border-radius: 50%;
      animation: twinkle var(--dur, 4s) ease-in-out infinite alternate;
    }
    @keyframes twinkle {
      0% { opacity: 0.15; transform: scale(0.8); }
      100% { opacity: 0.95; transform: scale(1.2); }
    }

    /* Subtle Background Weather Effects */
    #weather-fx-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      overflow: hidden;
    }
    #weather-cloud-veil-1,
    #weather-cloud-veil-2 {
      position: absolute;
      left: -20%;
      right: -20%;
      border-radius: 50%;
      filter: blur(60px);
      opacity: 0;
      transition: opacity 1.8s ease;
    }
    #weather-cloud-veil-1 {
      top: 4vh;
      height: 32vh;
      background: radial-gradient(ellipse at 38% 50%, rgba(148, 163, 184, 0.22), rgba(100, 116, 139, 0.08) 55%, transparent 78%);
      animation: cloudDriftSlow 46s ease-in-out infinite alternate;
    }
    #weather-cloud-veil-2 {
      top: 18vh;
      height: 36vh;
      background: radial-gradient(ellipse at 66% 50%, rgba(203, 213, 225, 0.16), rgba(71, 85, 105, 0.08) 60%, transparent 80%);
      animation: cloudDriftSlow 62s ease-in-out infinite alternate-reverse;
    }
    @keyframes cloudDriftSlow {
      0% { transform: translate3d(-4%, 0, 0) scale(1); }
      100% { transform: translate3d(4%, 1.5%, 0) scale(1.06); }
    }
    #weather-fx-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Atmospheric horizon mist & glow */
    #horizon-glow {
      position: absolute;
      left: -10%;
      right: -10%;
      bottom: 22vh;
      height: 36vh;
      filter: blur(58px);
      opacity: 0.72;
      transition: background 1.2s ease, opacity 1.2s ease;
    }

    /* Abstract Horizon & Celestial Trajectory SVG */
    #solar-arc-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      z-index: 3;
    }

    /* Abstract Sun Sculpture (Super Subtle & Bottom-Aligned) */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 3;
      pointer-events: none;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease, transform 0.8s ease;
      will-change: left, top;
    }
    .abstract-sun-bloom {
      position: absolute;
      width: 56px;
      height: 56px;
      left: -28px;
      top: -28px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.025) 45%, transparent 72%);
      filter: blur(10px);
    }
    .abstract-sun-outer-ring {
      position: absolute;
      width: 34px;
      height: 34px;
      left: -17px;
      top: -17px;
      animation: rotateOrbital 90s linear infinite;
    }
    .abstract-sun-mid-ring {
      position: absolute;
      width: 18px;
      height: 18px;
      left: -9px;
      top: -9px;
      border-radius: 50%;
      border: 0.75px solid rgba(255, 255, 255, 0.16);
      background: transparent;
      box-shadow: none;
    }
    .abstract-sun-annulus {
      position: absolute;
      width: 7px;
      height: 7px;
      left: -3.5px;
      top: -3.5px;
      border-radius: 50%;
      border: 0.9px solid rgba(255, 255, 255, 0.34);
      background: rgba(255, 255, 255, 0.06);
      box-shadow: none;
    }
    .abstract-sun-singularity {
      position: absolute;
      width: 2px;
      height: 2px;
      left: -1px;
      top: -1px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.55);
      box-shadow: none;
    }
    @keyframes abstractPulse {
      0% { transform: scale(0.96); opacity: 0.65; }
      100% { transform: scale(1.04); opacity: 0.9; }
    }
    @keyframes rotateOrbital {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Abstract Lunar Sculpture (Slightly More Visible + Dynamic Moon Phase) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 4;
      pointer-events: none;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .abstract-moon-bloom {
      position: absolute;
      width: 68px;
      height: 68px;
      left: -34px;
      top: -34px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, rgba(226, 232, 240, 0.06) 48%, transparent 74%);
      filter: blur(12px);
    }
    .abstract-moon-svg {
      position: absolute;
      width: 40px;
      height: 40px;
      left: -20px;
      top: -20px;
      overflow: visible;
    }

    /* 2. LEFT-ALIGNED MONUMENTAL DATE, TIME & SIMPLIFIED WEATHER FORECAST */
    #hero-clock-region {
      position: fixed;
      top: 3.2vh;
      left: 24px;
      margin-left: 0;
      text-align: left;
      z-index: 15;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      justify-content: flex-start;
      gap: 10px;
      line-height: 0.92;
    }
    #hero-time {
      font-size: clamp(4.0rem, 7.6vw, 7.4rem);
      font-weight: 200;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      text-shadow: 0 12px 45px rgba(0, 0, 0, 0.35);
    }
    #hero-seconds {
      font-size: clamp(1.2rem, 2.0vw, 1.9rem);
      font-weight: 300;
      color: rgba(255, 255, 255, 0.56);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #hero-date-row {
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }
    #hero-date {
      font-size: clamp(1.0rem, 1.45vw, 1.38rem);
      font-weight: 300;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    .hero-cal-icon-btn {
      background: transparent;
      border: none;
      color: rgba(248, 250, 252, 0.42);
      padding: 3px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
    }
    .hero-cal-icon-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      transform: translateY(-1px);
    }
    #solar-telemetry {
      display: none;
    }

    /* Simplified Minimal Weather Component (Directly Below Date) */
    #hero-weather-strip {
      margin-top: 6px;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
      padding: 0;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .mw-current-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mw-main-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mw-icon-wrap {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
    }
    .mw-temp-now {
      font-size: 18px;
      font-weight: 400;
      letter-spacing: -0.02em;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
    .mw-cond-text {
      font-size: 12px;
      color: rgba(248, 250, 252, 0.72);
      font-weight: 400;
    }
    .mw-hi-lo {
      font-size: 11.5px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .mw-day-slots {
      display: none !important;
    }

    /* 5. TOP-RIGHT MINIMAL EXPANDABLE SERVICE WIDGETS (health, meals, finances, notes) */
    #top-right-widgets {
      position: fixed;
      top: 3.5vh;
      right: 28px;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 16px;
      max-height: 62vh;
    }
    .ambient-widget {
      text-align: right;
      cursor: pointer;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, padding 0.3s ease;
      border: none;
      background: transparent;
      padding: 2px 0;
      border-radius: 18px;
      max-width: 360px;
    }
    .ambient-widget:hover:not(.expanded) {
      transform: translateX(-4px);
    }
    .ambient-widget.expanded {
      cursor: default;
      padding: 16px 20px;
      background: rgba(6, 10, 22, 0.62);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
      transform: translateX(-4px);
      width: 330px;
    }
    .w-header {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      cursor: pointer;
    }
    .w-label-row {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.52);
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .w-primary {
      font-size: 15px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: #ffffff;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: baseline;
      gap: 8px;
      justify-content: flex-end;
    }
    .w-primary strong {
      font-weight: 500;
    }
    /* Hide verbose sub-lines in minimal preview cards */
    .w-sub {
      display: none;
    }

    /* a) Health Minimal Preview: Heart Icon with HR inside + Progress Circle with Step Count inside */
    .health-minimal-badges {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 2px;
    }
    .hm-badge {
      position: relative;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .hm-badge svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
    }
    .hm-badge-val {
      position: relative;
      z-index: 2;
      font-size: 10.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      letter-spacing: -0.03em;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.75);
      line-height: 1;
    }
    .hm-heart-val {
      padding-bottom: 2px;
    }

    /* b) Finances Minimal Preview: In hidden mode ONLY show eye toggle next to title */
    #widget-finances.finances-is-hidden:not(.expanded) #compact-finances {
      display: none !important;
    }
    .finances-eye-icon-btn {
      background: transparent;
      border: none;
      color: rgba(248, 250, 252, 0.75);
      padding: 0 2px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease, transform 0.2s ease;
    }
    .finances-eye-icon-btn:hover {
      color: #38bdf8;
      transform: scale(1.1);
    }

    .w-expand-body {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transition: max-height 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, margin-top 0.3s ease;
      text-align: left;
    }
    .ambient-widget.expanded .w-expand-body {
      max-height: 360px;
      opacity: 1;
      margin-top: 14px;
    }
    .w-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 18px;
      margin-bottom: 14px;
    }
    .w-stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .w-stat-k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    .w-stat-v {
      font-size: 14px;
      font-weight: 500;
      color: #fff;
    }
    .w-action-link {
      display: inline-block;
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #38bdf8;
      text-decoration: none;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
    }
    .w-action-link:hover { text-decoration: underline; }
    .minimal-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.07);
      border: none;
      border-radius: 10px;
      padding: 8px 11px;
      color: #fff;
      font-size: 12.5px;
      outline: none;
      user-select: text;
    }
    .minimal-input::placeholder { color: rgba(255, 255, 255, 0.38); }
    .note-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 12.5px;
      color: rgba(255, 255, 255, 0.88);
    }
    .note-del {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.35);
      cursor: pointer;
      font-size: 13px;
      padding: 0 4px;
    }
    .note-del:hover { color: #f87171; }

    /* 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER (TRANSPARENT FOR FULL-BLEED HORIZON) */
    #timeline-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: var(--devices-dock-height, 44px);
      height: 28vh;
      min-height: 195px;
      z-index: 20;
      background: transparent;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      transition: bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    /* Whisper-quiet minimal controls right above the timeline */
    #timeline-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 28px 6px 24px;
      font-size: 11px;
      letter-spacing: 0.08em;
      pointer-events: auto;
    }
    .tl-controls {
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0.55;
      transition: opacity 0.25s ease;
    }
    .tl-controls:hover {
      opacity: 0.98;
    }
    .tl-pill {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.55);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 2px 0;
      transition: color 0.2s ease;
    }
    .tl-pill:hover, .tl-pill.active {
      color: #ffffff;
    }
    .tl-pill.return-now {
      color: #38bdf8;
      display: none;
    }

    /* Timeline viewport & moving canvas */
    #timeline-viewport {
      position: relative;
      width: 100vw;
      height: calc(28vh - 28px);
      min-height: 168px;
      overflow-x: clip;
      overflow-y: visible;
      cursor: grab;
      pointer-events: auto;
    }
    #timeline-viewport:active { cursor: grabbing; }

    /* Fixed "NOW" Marker at 25% from left */
    #fixed-now-marker {
      position: absolute;
      left: 25vw;
      top: 6px;
      bottom: 0;
      width: 1.5px;
      background: linear-gradient(
        to bottom,
        rgba(56, 189, 248, 0) 0%,
        #38bdf8 22%,
        #fbbf24 85%,
        rgba(251, 191, 36, 0.2) 100%
      );
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.85);
      z-index: 25;
      pointer-events: none;
    }
    #fixed-now-badge {
      position: absolute;
      top: 4px;
      left: 0;
      transform: translateX(-50%);
      padding: 2px 8px;
      border-radius: 99px;
      background: rgba(56, 189, 248, 0.16);
      backdrop-filter: blur(12px);
      color: #e0f2fe;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      white-space: nowrap;
    }
    #fixed-now-orb {
      position: absolute;
      bottom: 37px;
      left: 0.75px;
      transform: translate(-50%, 50%);
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #fbbf24;
      box-shadow: 0 0 16px 4px rgba(251, 191, 36, 0.9);
    }

    /* Moving World Track */
    #timeline-world {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      will-change: transform;
    }

    /* Horizontal Axis Line (0\xB0 Horizon Line) */
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 38px;
      height: 1px;
      background: rgba(255, 255, 255, 0.22);
      z-index: 5;
      pointer-events: none;
    }

    /* Celestial Altitude Layer (Behind Timeline Ticks & Calendar Events) */
    #timeline-celestial-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      overflow: visible;
    }
    #tl-celestial-svg {
      position: absolute;
      left: 0;
      bottom: 38px;
      width: 1px;
      height: 1px;
      overflow: visible;
      pointer-events: none;
    }
    .tl-horizon-node {
      position: absolute;
      bottom: 38px;
      transform: translate(-50%, 50%);
      pointer-events: none;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .tl-horizon-dot {
      width: 4.5px;
      height: 4.5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.75);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.45);
    }
    .tl-horizon-node.moon-cross .tl-horizon-dot {
      background: rgba(186, 230, 253, 0.72);
    }
    .tl-horizon-time {
      position: absolute;
      top: -15px;
      font-size: 8.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      color: rgba(248, 250, 252, 0.62);
      white-space: nowrap;
      background: rgba(4, 7, 17, 0.58);
      padding: 0.5px 4px;
      border-radius: 3px;
    }
    .tl-horizon-node.moon-cross .tl-horizon-time {
      top: 6px;
      color: rgba(186, 230, 253, 0.55);
    }
    .tl-celestial-body {
      position: absolute;
      width: 34px;
      height: 34px;
      transform: translate(-50%, 50%);
      pointer-events: none;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.35s ease, filter 0.35s ease;
    }
    .tl-celestial-body.below-horizon {
      opacity: 0.36;
      filter: saturate(0.45) brightness(0.72);
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

    /* Hour Ticks & Day Dividers */
    .tl-tick {
      position: absolute;
      bottom: 0;
      height: 38px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      z-index: 6;
    }
    .tl-tick-mark {
      width: 1px;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      margin-bottom: 6px;
    }
    .tl-tick.major .tl-tick-mark {
      height: 11px;
      background: rgba(255, 255, 255, 0.42);
    }
    .tl-tick-label {
      font-size: 10px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.42);
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 165px;
      margin-top: -127px;
      background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.38));
    }
    .tl-tick.day-start .tl-tick-label {
      color: #38bdf8;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10.5px;
    }

    /* 4. GOOGLE CALENDAR EVENT RECTANGLES ON THE TIMELINE (FLAT + LOCATION, ATTENDEES, DESCRIPTION) */
    .tl-event-rect {
      position: absolute;
      height: 54px;
      border-radius: 4px;
      padding: 4px 10px;
      background: rgba(11, 18, 32, 0.94);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-left: 3px solid var(--ev-color, #38bdf8);
      box-shadow: none;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5px;
      overflow: hidden;
      cursor: pointer;
      z-index: 12;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .tl-event-rect:hover {
      background: rgba(19, 30, 52, 0.98);
      border-color: rgba(255, 255, 255, 0.28);
      border-left-color: var(--ev-color, #38bdf8);
      box-shadow: none;
      z-index: 18;
    }
    .tl-event-rect.is-now {
      background: rgba(12, 42, 64, 0.95);
      border-color: rgba(56, 189, 248, 0.42);
      border-left: 3px solid var(--ev-color, #38bdf8);
      box-shadow: none;
    }
    .tl-event-rect.is-past {
      opacity: 0.52;
    }
    .tl-ev-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
    }
    .tl-ev-title {
      font-size: 11.5px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }
    .tl-ev-time {
      font-size: 9.5px;
      font-variant-numeric: tabular-nums;
      color: rgba(248, 250, 252, 0.72);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .tl-ev-meta {
      font-size: 9.5px;
      color: rgba(226, 232, 240, 0.75);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }
    .tl-ev-desc {
      font-size: 9px;
      color: rgba(148, 163, 184, 0.85);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }

    /* Quick Event Creator Popover */
    #quick-event-modal {
      position: fixed;
      bottom: 35vh;
      right: 28px;
      z-index: 40;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(28px);
      padding: 18px 22px;
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      display: none;
      width: 320px;
    }

    /* Fullscreen Service Overlay Iframe */
    #full-app-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: #040711;
      display: none;
      flex-direction: column;
    }
    #full-app-bar {
      height: 44px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #060914;
    }
    #full-app-frame {
      flex: 1;
      width: 100%;
      border: none;
    }

    /* 6. BORDERED HIGHER ROOM STATUSBAR + UPWARD FLYOUTS OVER UPPER CONTENT */
    #devices-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 38;
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      display: flex;
      flex-direction: column;
    }

    /* Subtle hairline separator between Timeline and StatusBar */
    #timeline-devices-separator {
      position: relative;
      height: 2px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 28px 0 24px;
      pointer-events: none;
    }
    #timeline-devices-separator::before {
      content: "";
      position: absolute;
      left: 24px;
      right: 28px;
      top: 50%;
      height: 1px;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(56, 189, 248, 0.28) 35%,
        rgba(255, 255, 255, 0.12) 75%,
        rgba(255, 255, 255, 0.06) 100%
      );
      pointer-events: none;
    }
    .td-sep-badge {
      display: none;
    }
    .td-sep-unpin-btn {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 6px;
      color: #38bdf8;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 5px 9px;
      white-space: nowrap;
    }
    .td-sep-unpin-btn:hover {
      background: rgba(56, 189, 248, 0.22);
    }

    /* Pinned Room Groups Tray (Expands upwards OVER upper timeline content) */
    #pinned-rooms-tray {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 24px;
      right: 28px;
      padding: 6px 4px 8px 4px;
      gap: 12px;
      overflow-x: auto;
      scrollbar-width: thin;
      align-items: flex-end;
      z-index: 65;
      pointer-events: auto;
    }
    #pinned-rooms-tray.has-pinned {
      display: flex;
    }
    .pinned-room-card {
      min-width: 265px;
      max-width: 330px;
      flex: 0 0 auto;
      background: rgba(8, 13, 26, 0.94);
      backdrop-filter: blur(24px) saturate(140%);
      -webkit-backdrop-filter: blur(24px) saturate(140%);
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 12px;
      padding: 10px 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.65);
      animation: pinCardIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes pinCardIn {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .prc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .prc-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .prc-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .prc-meta {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .prc-unpin {
      background: rgba(56, 189, 248, 0.14);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      border-radius: 99px;
      padding: 2px 8px;
      font-size: 9px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }
    .prc-unpin:hover {
      background: rgba(248, 113, 113, 0.18);
      border-color: rgba(248, 113, 113, 0.4);
      color: #fca5a5;
    }
    .prc-dev-grid {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 175px;
      overflow-y: auto;
      padding-right: 2px;
    }

    /* Higher & Bordered Room Bar + Right-Aligned 3D Print & Vision Previews */
    #room-dock-bar {
      position: relative;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 28px 6px 24px;
      gap: 12px;
      background: rgba(7, 11, 22, 0.72);
      border-top: 1px solid rgba(255, 255, 255, 0.16);
    }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      flex: 1;
      min-width: 0;
    }
    .room-dock-group::-webkit-scrollbar { display: none; }

    /* Higher, bordered room button */
    .room-pill {
      position: relative;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      padding: 7px 12px;
      color: rgba(248, 250, 252, 0.78);
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s ease;
    }
    .room-pill:hover {
      color: #ffffff;
      background: rgba(30, 41, 59, 0.85);
      border-color: rgba(255, 255, 255, 0.34);
    }
    .room-pill.pinned-tab {
      color: #ffffff;
      font-weight: 600;
      background: rgba(14, 116, 144, 0.32);
      border-color: #38bdf8;
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.94);
      border-color: rgba(251, 191, 36, 0.38);
    }
    .room-pin-ico {
      display: none;
    }
    .room-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.28);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .room-pill.has-on .room-dot {
      background: #fbbf24;
      box-shadow: 0 0 8px rgba(251, 191, 36, 0.85);
    }
    .room-pill.has-motion .room-dot {
      background: #4ade80;
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.85);
    }
    .room-meta {
      font-size: 9.5px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.88);
    }
    .room-lightbulb-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fbbf24;
      filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.7));
      margin-left: 1px;
    }

    /* Right-Aligned StatusBar Previews (3D Print & Vision \u2014 NOT inside tabs, expand upwards) */
    #statusbar-right-previews {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 20px;
      flex-shrink: 0;
      position: relative;
    }
    .sb-preview-item {
      position: relative;
      display: flex;
      align-items: center;
    }
    .sb-preview-trigger {
      background: transparent;
      border: none;
      padding: 4px 0;
      color: rgba(248, 250, 252, 0.78);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.2s ease, opacity 0.2s ease;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
    }
    .sb-preview-trigger:hover,
    .sb-preview-item.expanded .sb-preview-trigger {
      color: #ffffff;
    }
    .sb-preview-meta {
      font-size: 10.5px;
      font-weight: 400;
      letter-spacing: 0.01em;
      text-transform: none;
      color: rgba(248, 250, 252, 0.54);
      font-variant-numeric: tabular-nums;
    }
    .sb-mini-bar {
      width: 34px;
      height: 3.5px;
      border-radius: 99px;
      background: rgba(255, 255, 255, 0.14);
      overflow: hidden;
    }

    /* Upward Flyout Panel for StatusBar Previews (3D Print & Vision) */
    .sb-upward-flyout {
      position: absolute;
      bottom: calc(100% + 14px);
      right: 0;
      width: 340px;
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(6, 10, 22, 0.76);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      border: 1px solid rgba(56, 189, 248, 0.22);
      box-shadow: 0 20px 55px rgba(0, 0, 0, 0.6);
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.98);
      pointer-events: none;
      transition: opacity 0.24s ease, transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.24s;
      z-index: 50;
      text-align: left;
    }
    .sb-preview-item.expanded .sb-upward-flyout {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Device Row Controls inside Pinned Room Cards & Vision Flyout */
    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.035);
      transition: background 0.2s ease;
    }
    .rf-dev-row.is-on {
      background: rgba(251, 191, 36, 0.09);
    }
    .rf-dev-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .rf-dev-label {
      font-size: 11.5px;
      font-weight: 400;
      color: rgba(248, 250, 252, 0.88);
    }
    .rf-dev-row.is-on .rf-dev-label {
      color: #ffffff;
      font-weight: 500;
    }
    .rf-dev-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rf-power-badge {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: none;
      border-radius: 99px;
      padding: 3px 10px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 252, 0.65);
    }
    .rf-toggle-btn.on {
      background: #fbbf24;
      color: #040711;
      box-shadow: 0 0 12px rgba(251, 191, 36, 0.45);
    }
    .rf-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;
    }
    .rf-slider {
      flex: 1;
      accent-color: #38bdf8;
      height: 4px;
      cursor: pointer;
    }
    .rf-effect-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: none;
      border-radius: 99px;
      padding: 2px 7px;
      font-size: 9.5px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: #a855f7;
      color: #fff;
    }
    .w-3d-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .w-3d-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      flex: 1;
      min-width: 0;
    }

    /* ============================================================================
       7. RESPONSIVE & MOBILE-COMPATIBLE LAYOUT (TABLET, LANDSCAPE & SMARTPHONE)
       ============================================================================ */
    @media (max-width: 1180px) and (min-width: 901px) {
      :root {
        --nav-safe-left: 0px;
      }
      #hero-time {
        font-size: clamp(3.5rem, 6.2vw, 5.8rem);
      }
      #hero-weather-strip {
        max-width: min(390px, 44vw);
      }
      #top-right-widgets {
        right: 2.5vw;
        gap: 12px;
      }
      .ambient-widget.expanded {
        width: 310px;
      }
    }

    @media (max-height: 540px) and (orientation: landscape) {
      :root {
        --nav-safe-left: 0px;
      }
      html, body {
        width: 100vw;
        height: 100dvh;
        overflow: hidden;
      }
      #sky-stage {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
      }
      #hero-clock-region {
        top: 12px;
        left: 18px;
        margin-left: 0;
      }
      #hero-time {
        font-size: clamp(2.4rem, 6vw, 3.6rem);
      }
      #timeline-dock {
        height: 155px;
        background: transparent !important;
      }
      #timeline-viewport {
        height: 120px;
      }
    }

    @media (max-width: 900px) {
      :root {
        --nav-safe-left: 0px;
        --devices-dock-height: 52px;
      }
      html, body {
        width: 100%;
        height: auto;
        min-height: 100dvh;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: calc(var(--devices-dock-height, 52px) + env(safe-area-inset-bottom, 10px) + 18px);
      }
      #sky-stage {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
      }

      /* Scale celestial sculptures slightly on mobile screens */
      #sun-assembly,
      #moon-assembly {
        transform: scale(0.82);
      }

      /* Left-aligned Clock & Simplified Weather at top of mobile view */
      #hero-clock-region {
        position: relative;
        top: auto;
        left: auto;
        margin-left: 0;
        width: 100%;
        padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 6px 16px;
        text-align: left;
        z-index: 15;
        pointer-events: auto;
      }
      #hero-time {
        font-size: clamp(3.1rem, 13vw, 4.6rem);
      }
      #hero-seconds {
        font-size: clamp(1.1rem, 4vw, 1.5rem);
      }
      #hero-date {
        margin-top: 4px;
        font-size: clamp(0.95rem, 3.6vw, 1.2rem);
      }
      #solar-telemetry {
        font-size: 10px;
        line-height: 1.4;
      }
      #hero-weather-strip {
        display: flex;
        width: 100%;
        max-width: 100%;
        margin-top: 8px;
        padding: 0;
        background: transparent;
        border: none;
      }
      .mw-current-row {
        flex-wrap: wrap;
        gap: 8px 10px;
      }
      .mw-day-slots {
        gap: 10px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .mw-day-slots::-webkit-scrollbar {
        display: none;
      }

      /* Responsive Grid for Top-Right Service Preview Widgets on Mobile */
      #top-right-widgets {
        position: relative;
        top: auto;
        right: auto;
        width: 100%;
        max-height: none;
        padding: 8px 16px 10px 16px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
        z-index: 25;
      }
      .ambient-widget {
        text-align: left;
        width: 100%;
        max-width: 100%;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(6, 11, 24, 0.28);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .ambient-widget:hover:not(.expanded) {
        transform: none;
      }
      .ambient-widget.expanded {
        grid-column: 1 / -1;
        width: 100%;
        max-width: 100%;
        padding: 15px 16px;
        background: rgba(6, 10, 22, 0.86);
        border: 1px solid rgba(56, 189, 248, 0.28);
        transform: none;
      }
      .ambient-widget.expanded .w-expand-body {
        max-height: 460px;
      }
      #widget-finances .w-expand-body {
        min-width: 0 !important;
        width: 100%;
      }
      .w-header {
        align-items: flex-start;
        width: 100%;
      }
      .w-label-row {
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px 6px;
      }
      .health-minimal-badges {
        justify-content: flex-start;
      }
      .w-primary {
        justify-content: flex-start;
        font-size: 14px;
        flex-wrap: wrap;
        gap: 4px 8px;
        text-align: left;
      }

      /* Mobile Timeline Section (Transparent to show Horizon background) */
      #timeline-dock {
        position: relative;
        left: auto;
        right: auto;
        bottom: auto;
        width: 100%;
        height: 205px;
        min-height: 195px;
        margin-top: 4px;
        background: transparent !important;
      }
      #timeline-toolbar {
        padding: 4px 16px 8px 16px;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tl-controls {
        opacity: 0.92;
        gap: 6px;
      }
      .tl-pill {
        padding: 4px 8px;
        font-size: 10.5px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.06);
      }
      .tl-pill.active {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
      }
      #timeline-viewport {
        width: 100%;
        height: 165px;
        min-height: 160px;
        touch-action: pan-y;
      }

      /* Mobile Transparent Bottom StatusBar + Pinnable Room Tabs */
      #devices-dock {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 40;
        padding-bottom: env(safe-area-inset-bottom, 4px);
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }
      #timeline-devices-separator {
        padding: 0 12px;
        height: 16px;
      }
      #timeline-devices-separator::before {
        left: 12px;
        right: 12px;
      }
      #pinned-rooms-tray {
        padding: 6px 12px 8px 12px;
        gap: 10px;
        max-height: 44vh;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x mandatory;
      }
      .pinned-room-card {
        min-width: min(285px, 84vw);
        max-width: 86vw;
        scroll-snap-align: center;
      }
      .prc-dev-grid {
        max-height: 26vh;
        -webkit-overflow-scrolling: touch;
      }
      #room-dock-bar {
        height: 36px;
        padding: 0 12px;
        gap: 6px;
      }
      .room-pill {
        padding: 4px 8px;
        font-size: 10.5px;
        flex-shrink: 0;
      }
      .sb-upward-flyout {
        right: 0;
        width: min(330px, 92vw);
      }

      /* Mobile Modals & Overlays */
      #quick-event-modal {
        left: 12px;
        right: 12px;
        bottom: calc(var(--devices-dock-height, 52px) + 12px);
        width: auto;
        max-width: 420px;
        margin: 0 auto;
      }
      #full-app-overlay {
        height: 100dvh;
      }
      #full-app-bar {
        padding: calc(env(safe-area-inset-top, 0px)) 14px 0 14px;
        min-height: 46px;
      }
    }

    @media (max-width: 480px) {
      #hero-clock-region {
        padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px 4px 12px;
      }
      #top-right-widgets {
        padding: 6px 12px 8px 12px;
        gap: 8px;
      }
      .ambient-widget {
        padding: 9px 11px;
      }
      .w-stat-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px 10px;
      }
      .mw-temp-now {
        font-size: 18px;
      }
      #quick-import-flyout-modal > div {
        width: 100vw !important;
        height: 100dvh !important;
      }
    }

    /* HORIZON CENTERED ROUNDED CORTEX PROMPT BAR */
    #horizon-cortex-center-stage {
      position: fixed;
      left: 50%;
      top: 45%;
      transform: translate(-50%, -50%);
      width: min(670px, 90vw);
      z-index: 55;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-prompt-pill {
      position: relative;
      width: 100%;
      height: 54px;
      border-radius: 9999px;
      background: rgba(11, 17, 32, 0.78);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      padding: 0 7px 0 18px;
      gap: 12px;
      transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-prompt-pill:hover {
      background: rgba(14, 22, 42, 0.88);
      border-color: rgba(56, 189, 248, 0.38);
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.65), 0 0 20px rgba(56, 189, 248, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .cortex-prompt-pill:focus-within {
      background: rgba(10, 16, 32, 0.95);
      border-color: rgba(56, 189, 248, 0.68);
      box-shadow: 0 20px 54px rgba(0, 0, 0, 0.78), 0 0 32px rgba(56, 189, 248, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    /* Animated shimmering border while waiting for Gemini response */
    .cortex-prompt-pill.is-waiting {
      border-color: transparent !important;
      background: linear-gradient(rgba(10, 16, 32, 0.96), rgba(10, 16, 32, 0.96)) padding-box,
                  linear-gradient(90deg, #38bdf8, #a855f7, #38bdf8, #10b981, #38bdf8) border-box !important;
      background-size: 200% 100% !important;
      animation: geminiBorderFlow 2s linear infinite, geminiPulseGlow 1.6s ease-in-out infinite alternate !important;
      transform: translateY(-2px);
    }

    @keyframes geminiBorderFlow {
      0% { background-position: 0% 0%; }
      100% { background-position: 200% 0%; }
    }

    @keyframes geminiPulseGlow {
      0% { box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.2); }
      100% { box-shadow: 0 20px 52px rgba(0, 0, 0, 0.8), 0 0 36px rgba(168, 85, 247, 0.38); }
    }

    .cortex-ai-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
      flex-shrink: 0;
      transition: all 0.3s ease;
    }

    .cortex-prompt-pill:focus-within .cortex-ai-icon-wrap {
      transform: scale(1.12);
      color: #7dd3fc;
    }

    .cortex-prompt-pill.is-waiting .cortex-ai-icon-wrap {
      animation: spinSlow 3s linear infinite;
      color: #c084fc;
    }

    @keyframes spinSlow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .cortex-prompt-input {
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      color: #f8fafc;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 450;
      letter-spacing: -0.01em;
    }

    .cortex-prompt-input::placeholder {
      color: rgba(248, 250, 252, 0.40);
      font-size: 13.5px;
      font-weight: 400;
    }

    .cortex-waiting-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #bae6fd;
      font-size: 11px;
      font-family: var(--font-sans);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cortex-waiting-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38bdf8;
      animation: pulseDot 1s ease-in-out infinite alternate;
    }

    @keyframes pulseDot {
      from { opacity: 0.4; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1.2); }
    }

    .cortex-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #38bdf8, #0284c7);
      border: none;
      color: #040711;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(56, 189, 248, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-send-btn:hover:not(:disabled) {
      transform: scale(1.08);
      background: linear-gradient(135deg, #7dd3fc, #38bdf8);
      box-shadow: 0 4px 16px rgba(56, 189, 248, 0.55);
    }

    .cortex-send-btn:active:not(:disabled) {
      transform: scale(0.94);
    }

    .cortex-send-btn:disabled {
      opacity: 0.45;
      cursor: default;
      transform: none;
    }

    /* DROPDOWN PREVIEW PANEL */
    #cortex-preview-dropdown {
      width: 100%;
      margin-top: 10px;
      border-radius: 20px;
      background: rgba(10, 16, 32, 0.94);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(56, 189, 248, 0.24);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.08);
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      animation: fadeInDown 0.18s ease-out;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cortex-preview-item {
      padding: 9px 13px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.15s ease;
    }

    .cortex-preview-item:hover {
      background: rgba(56, 189, 248, 0.14);
      border-color: rgba(56, 189, 248, 0.38);
      transform: translateX(3px);
    }

    .cortex-preview-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .cortex-badge-tag {
      font-size: 10px;
      font-family: var(--font-mono, monospace);
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 5px;
      background: rgba(56, 189, 248, 0.18);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      flex-shrink: 0;
    }

    /* RESPONSE FLYOUT CARD */
    #cortex-response-card {
      width: 100%;
      margin-top: 12px;
      border-radius: 20px;
      background: rgba(10, 16, 32, 0.96);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(56, 189, 248, 0.32);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.85), 0 0 35px rgba(56, 189, 248, 0.15);
      max-height: 480px;
      overflow-y: auto;
      padding: 18px 22px;
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: fadeInDown 0.2s ease-out;
    }

    .cortex-resp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 10px;
      gap: 10px;
    }

    .cortex-resp-body {
      font-size: 13px;
      line-height: 1.65;
      color: rgba(248, 250, 252, 0.88);
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--font-sans);
    }
    .cortex-resp-body h1, .cortex-resp-body h2, .cortex-resp-body h3 {
      color: #f8fafc;
      margin: 12px 0 6px 0;
      font-size: 14.5px;
    }
    .cortex-resp-body pre, .cortex-resp-body code {
      font-family: var(--font-mono, monospace);
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      color: #bae6fd;
    }
    .cortex-resp-body pre {
      padding: 10px;
      display: block;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <!-- TOOLBAR HIDDEN ALTOGETHER PER USER REQUEST (KEPT FOR DOM ID COMPATIBILITY ONLY) -->
  <nav id="left-ambient-navbar" aria-hidden="true" style="display:none !important;">
    <button class="lnav-item active" id="lnav-horizon" onclick="closeFullService()"></button>
    <button class="lnav-item" id="lnav-google-calendar" onclick="openFullService('google-calendar', 'Calendar')"></button>
    <button class="lnav-item" id="lnav-google-health" onclick="openFullService('google-health', 'Health')"></button>
    <button class="lnav-item" id="lnav-finance-analytics" onclick="openFullService('finance-analytics', 'thassi.finances')"></button>
    <button class="lnav-item" id="lnav-meal-planner" onclick="openFullService('meal-planner', 'Meals')"></button>
    <button class="lnav-item" id="lnav-smart-canvas" onclick="openFullService('smart-canvas', 'Smart Home')"></button>
    <button class="lnav-item" id="lnav-camera-vision" onclick="openFullService('camera-vision', 'Camera Vision')"></button>
    <button class="lnav-item" id="lnav-3d-print" onclick="openFullService('3d-print', '3D Druck Studio')"></button>
    <button class="lnav-item" id="lnav-memo" onclick="openFullService('memo', 'Memo')"></button>
    <button class="lnav-item" id="lnav-cortex" onclick="openFullService('cortex', 'Cortex')"></button>
  </nav>

  <!-- 1. LIVING SKY, SUBTLE WEATHER EFFECTS & ABSTRACT CELESTIAL HORIZON -->
  <div id="sky-stage">
    <div id="starfield"></div>
    <div id="weather-fx-layer">
      <div id="weather-cloud-veil-1"></div>
      <div id="weather-cloud-veil-2"></div>
      <canvas id="weather-fx-canvas"></canvas>
    </div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none" style="display:none;"></svg>
    <div id="moon-assembly" style="display:none;"></div>
    <div id="sun-assembly" style="display:none;"></div>
  </div>

  <!-- 2. LEFT-ALIGNED DATE, TIME & SIMPLIFIED WEATHER IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date-row">
      <div id="hero-date"></div>
      <button class="hero-cal-icon-btn" onclick="openFullService('google-calendar', 'Calendar')" title="Open Calendar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
    </div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>

    <!-- SIMPLIFIED WEATHER FORECAST FOR ST. VEIT / G\xD6LSEN (CURRENT WEATHER ONLY) -->
    <div id="hero-weather-strip" title="St. Veit an der G\xF6lsen">
      <div class="mw-current-row">
        <div class="mw-icon-wrap" id="mw-current-icon"></div>
        <div class="mw-temp-now" id="mw-current-temp">--\xB0</div>
        <div class="mw-cond-text" id="mw-current-desc">--</div>
        <div class="mw-hi-lo" id="mw-hi-lo">--\xB0 / --\xB0</div>
      </div>
    </div>
  </div>

  <!-- 5. TOP-RIGHT MINIMAL EXPANDABLE SERVICE WIDGETS: (1) health, (2) meals, (3) finances, (4) notes -->
  <div id="top-right-widgets">
    <!-- 1. HEALTH WIDGET (MINIMAL: HEART ICON WITH HR INSIDE + PROGRESS RING WITH STEP COUNT INSIDE) -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>health</span>
          <span class="w-dot" id="dot-health" style="background:#4ade80; box-shadow:0 0 10px #4ade80;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('google-health', 'Health')" title="Open Health View">\u2197</button>
        </div>
        <div class="health-minimal-badges">
          <!-- Heart icon with Heart Rate number inside -->
          <div class="hm-badge" title="Heart Rate (bpm)">
            <svg class="hm-heart-svg" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    fill="rgba(244, 63, 94, 0.24)"
                    stroke="#fb7185"
                    stroke-width="1.35" />
            </svg>
            <span class="hm-badge-val" id="health-hr-inside">--</span>
          </div>
          <!-- Progress circle with Step Count number inside -->
          <div class="hm-badge" title="Steps Today">
            <svg class="hm-ring-svg" viewBox="0 0 44 44">
              <circle class="hm-ring-bg" cx="22" cy="22" r="18.5"></circle>
              <circle class="hm-ring-fg" id="health-steps-ring" cx="22" cy="22" r="18.5"></circle>
            </svg>
            <span class="hm-badge-val" id="health-steps-inside">--</span>
          </div>
        </div>
        <div class="w-primary" id="compact-health" style="display:none;">--</div>
        <div class="w-sub" id="sub-health" style="display:none;">Pixel 10 Health Connect</div>
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
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Open Health \u2192</button>
      </div>
    </div>

    <!-- 2. MEALS WIDGET (MOVED DIRECTLY BELOW HEALTH) -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>meals</span>
          <span class="w-dot" id="dot-meals" style="background:#fb923c; box-shadow:0 0 10px #fb923c;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('meal-planner', 'Meals')" title="Open Meals View">\u2197</button>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12.5px; color:rgba(255,255,255,0.85); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Open Meals \u2192</button>
      </div>
    </div>

    <!-- 3. FINANCES WIDGET (IN HIDDEN MODE: ONLY SHOW EYE TOGGLE NEXT TO PREVIEW TITLE) -->
    <div class="ambient-widget finances-is-hidden" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row" style="gap:6px;">
          <span>finances</span>
          <button id="finances-eye-btn"
                  class="finances-eye-icon-btn"
                  onclick="toggleFinancesVisibility(event)"
                  title="Finanzdaten ein-/ausblenden">
            \u{1F441}\uFE0F
          </button>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7; display:none;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('finance-analytics', 'thassi.finances')" title="Open Finances View">\u2197</button>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">\u2022\u2022\u2022\u2022 \u20AC</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()" style="min-width:270px;">
        <div id="finances-preview-dynamic"
              onclick="toggleFinancesVisibility(event)"
              title="Klicken, um Zahlen ein-/auszublenden"
              style="display:flex; flex-direction:column; gap:8px; cursor:pointer; margin-bottom:10px;">
          <div class="w-stat-grid">
            <div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" id="ef-bal" style="color:#38bdf8;">\u2022\u2022\u2022\u2022 \u20AC</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag / Woche)</span><span class="w-stat-v" id="ef-exp" style="color:#f87171;">\u2022\u2022\u2022\u2022 \u20AC</span></div>
          </div>
        </div>
        <div id="finances-quick-import-slot" style="margin-bottom:8px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.07); padding-top:8px;">
          <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="toggleFinancesVisibility(event)" id="finances-toggle-link">\u{1F441}\uFE0F Anzeigen</button>
          <button class="w-action-link" style="margin:0; color:#94a3b8;" onclick="openFullService('finance-analytics', 'thassi.finances', '#preview-config')">\u{1F39B}\uFE0F Preview</button>
          <button class="w-action-link" style="margin:0;" onclick="openFullService('finance-analytics', 'thassi.finances')">Finances \u2192</button>
        </div>
      </div>
    </div>

    <!-- 4. NOTES WIDGET (LAST POSITION AMONG TOP-RIGHT PREVIEWS) -->
    <div class="ambient-widget" id="widget-notes" onclick="toggleWidget('notes', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>notes</span>
          <span class="w-dot" id="dot-notes" style="background:#fbbf24; box-shadow:0 0 10px #fbbf24;"></span>
        </div>
        <div class="w-primary" id="compact-notes">0 notes</div>
        <div class="w-sub" id="sub-notes">Tap to capture a note</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <form onsubmit="addNote(event)" style="margin-bottom:10px;">
          <input id="note-input" class="minimal-input" placeholder="Write a note & press Enter..." />
        </form>
        <div id="notes-list" style="max-height:160px; overflow-y:auto;"></div>
      </div>
    </div>
  </div>

  <!-- QUICK IMPORT ONLINE-BANKING POPUP FLYOUT -->
  <div id="quick-import-flyout-modal"
       onclick="closeQuickImportFlyout()"
       style="position:fixed; inset:0; z-index:95; background:rgba(4,7,17,0.68); backdrop-filter:blur(8px); display:none; justify-content:flex-end;">
    <div onclick="event.stopPropagation()"
         style="width:min(540px, 95vw); height:100vh; background:#0b1120; border-left:1px solid #1e293b; display:flex; flex-direction:column; box-shadow:-20px 0 60px rgba(0,0,0,0.75);">
      <div style="padding:16px 20px; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; background:#0f172a;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#f8fafc;">\u26A1 Quick Import \u2014 Online-Banking Flyout</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Sparkasse George Auto-Login, Cookie-Tresor &amp; automatischer Datei-Import</div>
        </div>
        <button onclick="closeQuickImportFlyout()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px;">\u2715</button>
      </div>
      <div style="padding:14px 18px; display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid #1e293b; background:#0b1120;">
        <button onclick="launchBankingPopupFromDashboard()"
                style="padding:8px 13px; border-radius:9px; border:1px solid #38bdf8; background:linear-gradient(135deg,#0284c7,#2563eb); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
          \u{1FA9F} Banking-Popup \xF6ffnen
        </button>
        <button onclick="triggerDashboardQuickImportSample()"
                style="padding:8px 13px; border-radius:9px; border:1px solid rgba(16,185,129,0.45); background:rgba(16,185,129,0.15); color:#34d399; font-size:12px; font-weight:700; cursor:pointer;">
          \u26A1 George Export herunterladen &amp; Auto-Import
        </button>
        <button onclick="triggerDashboardDownloadsScan()"
                style="padding:8px 12px; border-radius:9px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; font-size:11.5px; font-weight:600; cursor:pointer;">
          \u{1F4C2} Downloads scannen
        </button>
      </div>
      <div id="qi-dash-status" style="display:none; margin:10px 18px 0; padding:9px 12px; border-radius:9px; font-size:12px; font-weight:600;"></div>
      <div style="flex:1; padding:12px 18px; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <iframe id="qi-dash-frame"
                src="about:blank"
                style="flex:1; width:100%; border:1px solid #1e293b; border-radius:12px; background:#090d16;"></iframe>
        <label style="padding:10px 14px; border-radius:10px; border:1px dashed #38bdf8; background:rgba(56,189,248,0.06); text-align:center; font-size:12px; color:#cbd5e1; cursor:pointer;">
          \u{1F4E5} Bank-Export (.csv, .xml, .sta) hier ablegen oder klicken f\xFCr sofortigen Auto-Import
          <input type="file" accept=".csv,.xml,.sta,.mt940,.json,.txt" onchange="handleDashboardQuickFileSelect(event)" style="display:none;" />
        </label>
      </div>
    </div>
  </div>

  <!-- QUICK EVENT MODAL -->
  <div id="quick-event-modal">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#38bdf8;">New Event</span>
      <button onclick="toggleEventModal(false)" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer;">\u2715</button>
    </div>
    <form onsubmit="createQuickEvent(event)" style="display:flex; flex-direction:column; gap:10px;">
      <input id="qe-title" class="minimal-input" placeholder="Event title..." required />
      <input id="qe-start" type="datetime-local" class="minimal-input" required />
      <div style="display:flex; gap:8px;">
        <input id="qe-dur" type="number" value="60" min="15" step="15" class="minimal-input" placeholder="Minutes" />
        <button type="submit" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 16px; font-weight:600; font-size:12px; cursor:pointer; white-space:nowrap;">Add</button>
      </div>
    </form>
  </div>

  <!-- CENTERED ROUNDED CORTEX PROMPT BAR WITH LIVE PREVIEWS & GEMINI INTEGRATION -->
  <div id="horizon-cortex-center-stage">
    <div class="cortex-prompt-pill" id="cortex-prompt-pill">
      <div class="cortex-ai-icon-wrap" id="cortex-ai-icon" title="Cortex & Google Gemini">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
      </div>
      <input type="text"
             class="cortex-prompt-input"
             id="cortex-prompt-input"
             placeholder="Frag Cortex oder durchsuche Memo, Termine, Smart Home & Finanzen..."
             autocomplete="off"
             spellcheck="false" />
      <div id="cortex-status-badge" style="display:none;" class="cortex-waiting-pill">
        <span class="cortex-waiting-dot"></span>
        <span id="cortex-status-text">Denke nach...</span>
      </div>
      <button class="cortex-send-btn" id="cortex-send-btn" onclick="submitCortexPrompt()" title="An Gemini API senden (Enter)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>

    <!-- LIVE SEARCH PREVIEWS DROPDOWN -->
    <div id="cortex-preview-dropdown"></div>

    <!-- GEMINI EXPANDABLE RESPONSE CARD -->
    <div id="cortex-response-card"></div>
  </div>

  <!-- 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER & GCAL EVENT RECTANGLES -->
  <div id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <button class="tl-pill return-now" id="btn-live-now" onclick="snapToLiveNow()">\u21BA Return to Now</button>
      </div>
      <div class="tl-controls">
        <button class="tl-pill" id="zoom-12" onclick="setTimelineSpan(12)">12h</button>
        <button class="tl-pill active" id="zoom-24" onclick="setTimelineSpan(24)">24h</button>
        <button class="tl-pill" id="zoom-72" onclick="setTimelineSpan(72)">3d</button>
        <button class="tl-pill" id="zoom-168" onclick="setTimelineSpan(168)">7d</button>
        <button class="tl-pill" onclick="toggleEventModal(true)" title="New Calendar Event">+</button>
      </div>
    </div>

    <div id="timeline-viewport">
      <!-- Fixed NOW vertical marker -->
      <div id="fixed-now-marker">
        <div id="fixed-now-badge">NOW</div>
        <div id="fixed-now-orb"></div>
      </div>

      <!-- Continuously moving timeline track (0\xB0 Horizon Line + Altitude Curves + Events) -->
      <div id="timeline-world">
        <div id="timeline-celestial-layer">
          <svg id="tl-celestial-svg" overflow="visible">
            <path id="tl-moon-below-path" fill="none" stroke="rgba(186, 230, 253, 0.20)" stroke-width="1.0" stroke-dasharray="3 5" />
            <path id="tl-moon-above-path" fill="none" stroke="rgba(224, 242, 254, 0.48)" stroke-width="1.25" />
            <path id="tl-sun-below-path" fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.05" stroke-dasharray="3 5" />
            <path id="tl-sun-above-path" fill="none" stroke="rgba(255, 255, 255, 0.62)" stroke-width="1.4" />
          </svg>
          <div id="tl-horizon-crossings"></div>
          <div id="tl-moon-node" class="tl-celestial-body" title="Mond"></div>
          <div id="tl-sun-node" class="tl-celestial-body" title="Sonne &amp; Wetter"></div>
        </div>
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </div>

  <!-- 6. BORDERED HIGHER ROOM STATUSBAR + UPWARD FLYOUTS OVER UPPER CONTENT -->
  <div id="devices-dock">
    <div id="timeline-devices-separator"></div>

    <!-- Pinned Room Groups Tray (floats over upper timeline content when rooms are pinned) -->
    <div id="pinned-rooms-tray"></div>

    <!-- Higher, bordered Room StatusBar: Left = Smart Home Icon Button + Room Buttons, Right = 3D Print & Vision Previews -->
    <div id="room-dock-bar">
      <button class="room-pill" onclick="openFullService('smart-canvas', 'Smart Home')" title="Smart Home \xF6ffnen" aria-label="Smart Home" style="border-color:rgba(56,189,248,0.42); color:#e0f2fe; flex-shrink:0; padding:7px 9px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10.5L12 3l9 7.5"></path>
          <path d="M5 9.5V19a1 1 0 0 0 1 1h4.5v-5.5h3V20H18a1 1 0 0 0 1-1V9.5"></path>
        </svg>
      </button>
      <div class="room-dock-group" id="room-pills-container"></div>
      <button class="td-sep-unpin-btn" id="btn-unpin-all-rooms" onclick="unpinAllRooms()" style="display:none; flex-shrink:0;">Alle minimieren</button>

      <!-- Right-aligned StatusBar Previews (3D Print & Vision only; Projekte & n8n removed per screenshot) -->
      <div id="statusbar-right-previews">
        <!-- 3D PRINT STATUSBAR PREVIEW (UPWARD FLYOUT) -->
        <div class="sb-preview-item" id="widget-3dprint">
          <div style="display:inline-flex; align-items:center; gap:2px;">
            <button class="sb-preview-trigger" onclick="toggleWidget('3dprint', event)" title="3D Druck Vorschau ein-/ausklappen">
              <span class="room-dot" id="dot-3dprint" style="background:#00AE42; box-shadow:0 0 8px #00AE42;"></span>
              <span id="print3d-dock-dot" style="display:none;"></span>
              <span>3D Druck</span>
              <span class="sb-meta" id="print3d-dock-meta">Bambu P1S</span>
              <span class="sb-caret">\u25B4</span>
            </button>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('3d-print', '3D Druck Studio')" title="Open 3D Druck Studio">\u2197</button>
          </div>
          <div class="sb-upward-flyout" onclick="event.stopPropagation()">
            <div class="w-label-row" style="justify-content:space-between; margin-bottom:8px;">
              <span>3d druck \xB7 bambulab</span>
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('3d-print', '3D Druck Studio')">Studio \u2197</button>
            </div>
            <div class="w-3d-row">
              <div style="position:relative; width:82px; height:64px; border-radius:12px; background:rgba(4,7,17,0.72); border:1px solid rgba(56,189,248,0.22); overflow:hidden; flex-shrink:0;"
                   title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)">
                <canvas id="mini-3d-canvas" width="164" height="128" style="width:82px; height:64px; display:block; cursor:grab; touch-action:none;"></canvas>
              </div>
              <div class="w-3d-info">
                <div class="w-primary" id="compact-3dprint" style="font-size:14.5px; justify-content:flex-start;">Kein Projekt aktiv</div>
                <div class="w-sub" id="sub-3dprint" style="display:block; text-align:left;">Platzhalter \xB7 0% Leerlauf</div>
                <div style="width:100%; height:5px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:6px;">
                  <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #00AE42, #38bdf8); transition:width 0.35s ease;"></div>
                </div>
              </div>
            </div>
            <div class="w-stat-grid" style="margin-bottom:10px;">
              <div class="w-stat-item"><span class="w-stat-k">Drucker / Modus</span><span class="w-stat-v" id="e3d-printer">Bambu Lab P1S</span></div>
              <div class="w-stat-item"><span class="w-stat-k">Fortschritt / Layer</span><span class="w-stat-v" id="e3d-layer" style="color:#00AE42;">0% (0/0)</span></div>
              <div class="w-stat-item"><span class="w-stat-k">Ma\xDFe / Gewicht</span><span class="w-stat-v" id="e3d-dims">--</span></div>
              <div class="w-stat-item"><span class="w-stat-k">D\xFCse / Heizbett</span><span class="w-stat-v" id="e3d-temps">24\xB0C / 24\xB0C</span></div>
            </div>
            <form onsubmit="submitMini3dPrompt(event)" style="display:flex; gap:6px; margin-bottom:10px;">
              <input id="mini-3d-prompt" class="minimal-input" placeholder="Prompt: 3D-Objekt \xE4ndern oder neu erstellen\u2026" />
              <button type="submit" id="mini-3d-prompt-btn" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 12px; font-weight:700; font-size:11.5px; cursor:pointer; white-space:nowrap;">KI</button>
            </form>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <button class="w-action-link" style="color:#fbbf24; margin:0;" onclick="toggleMini3dPlaceholder()" id="btn-mini-3d-toggle">Platzhalter testen</button>
              <button class="w-action-link" style="color:#4ade80; margin:0;" onclick="triggerMini3dPrint()" id="btn-mini-3d-print">\u{1F5A8}\uFE0F Druck starten</button>
              <button class="w-action-link" style="margin:0;" onclick="openFullService('3d-print', '3D Druck Studio')">3D Editor \u2192</button>
            </div>
          </div>
        </div>

        <!-- VISION STATUSBAR PREVIEW (UPWARD FLYOUT) -->
        <div class="sb-preview-item" id="widget-vision">
          <div style="display:inline-flex; align-items:center; gap:2px;">
            <button class="sb-preview-trigger" onclick="toggleWidget('vision', event)" title="Camera Vision Vorschau ein-/ausklappen">
              <span class="room-dot" id="vision-dock-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
              <span>Vision</span>
              <span class="sb-meta" id="vision-dock-meta">Zyklisch</span>
              <span class="sb-caret">\u25B4</span>
            </button>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('camera-vision', 'Camera Vision')" title="Open Camera Vision">\u2197</button>
          </div>
          <div class="sb-upward-flyout" onclick="event.stopPropagation()">
            <div class="w-label-row" style="justify-content:space-between; margin-bottom:8px;">
              <span>camera vision \xB7 objekterkennung</span>
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('camera-vision', 'Camera Vision')">Streams \u2197</button>
            </div>
            <div id="vision-flyout-summary" style="font-size:11.5px; color:rgba(248,250,252,0.82); margin-bottom:8px; line-height:1.45;">
              Zyklischer Snapshot-Scan aktiv
            </div>
            <div id="vision-flyout-cameras" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; max-height:180px; overflow-y:auto;"></div>
            <button class="w-action-link" style="margin:0;" onclick="openFullService('camera-vision', 'Camera Vision')">Open Camera Vision \u2192</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- FULL SERVICE OVERLAY (WHEN LAUNCHING FULL VIEW) -->
  <div id="full-app-overlay">
    <div id="full-app-bar">
      <button onclick="closeFullService()" style="background:none; border:none; color:#38bdf8; font-size:12.5px; font-weight:500; cursor:pointer;">\u2190 Back to Horizon</button>
      <span id="full-app-title" style="font-size:12.5px; font-weight:500; color:rgba(255,255,255,0.65);"></span>
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

      document.getElementById('sky-stage').style.background = palette.sky;
      document.getElementById('horizon-glow').style.background = palette.glow;
      document.getElementById('starfield').style.opacity = String(palette.stars);

      if (window.syncThassiSidebarSky) {
        window.syncThassiSidebarSky(palette.sidebarBg);
      }

      const lunarInfo = computeLunarPhaseInfo(now);
      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  \xB7  Sunrise 06:45  \xB7  Sunset 18:30  \xB7  \${lunarInfo.phaseLabel}\`;

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

      document.getElementById('hero-time').textContent = \`\${hh}:\${mm}\`;
      document.getElementById('hero-seconds').textContent = ss;
      document.getElementById('hero-date').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      document.getElementById('fixed-now-badge').textContent = \`NOW \xB7 \${hh}:\${mm}\`;

      updateSkyAndSun(now);

      const pxPerMs = getPxPerMs();
      const nowOffsetFromBasePx = (now.getTime() + panOffsetMs - timelineBaseEpochMs) * pxPerMs;
      const fixedNowX = window.innerWidth * NOW_ANCHOR_RATIO;
      const worldTranslateX = fixedNowX - nowOffsetFromBasePx;
      document.getElementById('timeline-world').style.transform = \`translate3d(\${worldTranslateX.toFixed(2)}px, 0, 0)\`;
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
          vCamsEl.innerHTML = '<div style="font-size:11px; color:rgba(255,255,255,0.45);">Keine Kameras verbunden</div>';
        }
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
              <span class="rf-dev-label">\${d.label}</span>
              <div class="rf-dev-right">
                <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                  \${camLive ? 'Aktiv' : 'QR-Auth'}
                </span>
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

    function openFullService(appId, title, hash) {
      setLeftNavActive(appId);
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/' + (hash || '');
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      setLeftNavActive('horizon');
      document.getElementById('full-app-overlay').style.display = 'none';
      document.getElementById('full-app-frame').src = 'about:blank';
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
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

      if (widgetEl) {
        widgetEl.classList.toggle('finances-is-hidden', Boolean(financesHidden));
      }

      const k = d.kpis || {};
      const bal = d.balanceConfig || {};
      const currentBalance = bal.currentBalance !== undefined ? bal.currentBalance : (k.currentBalance || 0);
      const accountName = bal.accountName || k.accountName || 'Sparkasse George';
      const expensesDay = k.expensesDay !== undefined ? k.expensesDay : (d.expensesToday || 0);
      const expensesWeek = k.expensesWeek !== undefined ? k.expensesWeek : (d.expensesWeek || 0);
      const netCashflow = k.net !== undefined ? k.net : (d.netCashflowMonth || 0);
      const activeMonth = k.activeMonth || d.activeMonth || '';
      const groupBudgets = d.previewGroupBudgets || d.groupBudgets || [];

      const cfg = d.previewConfig || {
        hiddenByDefault: true,
        primaryMetric: 'current_balance',
        enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'group_budgets', 'quick_import']
      };
      const enabled = cfg.enabledElements || [];

      if (eyeBtn) {
        eyeBtn.innerHTML = financesHidden ? '\u{1F441}\uFE0F' : '\u{1F512}';
        eyeBtn.title = financesHidden ? 'Finanzdaten anzeigen' : 'Finanzdaten verbergen';
      }
      if (toggleLink) {
        toggleLink.innerHTML = financesHidden ? '\u{1F441}\uFE0F Zahlen anzeigen' : '\u{1F512} Zahlen verbergen';
      }

      // Primary headline (hidden via CSS when financesHidden is true and widget is collapsed)
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
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F3E6} Aktueller Kontostand</span>
            <span class="w-stat-v" style="color:#38bdf8;">\${fmtEurDash(currentBalance, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_day')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F4C5} Ausgaben (Tag)</span>
            <span class="w-stat-v" style="color:#f8fafc;">-\${fmtEurDash(expensesDay, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_week')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F4C6} Ausgaben (Woche)</span>
            <span class="w-stat-v" style="color:#fbbf24;">-\${fmtEurDash(expensesWeek, financesHidden)}</span>
          </div>
        \`);
      }

      let html = '';
      if (statCards.length > 0) {
        html += \`<div class="w-stat-grid">\${statCards.join('')}</div>\`;
      }

      if (enabled.includes('group_budgets') && Array.isArray(groupBudgets) && groupBudgets.length > 0) {
        const budgetRows = groupBudgets.slice(0, 4).map((b) => {
          const pct = Math.min(100, Math.round(b.pctUsed !== undefined ? b.pctUsed : (b.pct || 0)));
          const limit = b.budgetLimit !== undefined ? b.budgetLimit : (b.limit || 0);
          const barColor = b.overBudget ? '#ef4444' : (b.color || '#38bdf8');
          const valText = financesHidden
            ? '\u2022\u2022\u2022\u2022 / \u2022\u2022\u2022\u2022 \u20AC'
            : \`\${Math.round(b.spent || 0)} / \${Math.round(limit)} \u20AC\`;
          return \`
            <div style="display:flex; flex-direction:column; gap:3px;">
              <div style="display:flex; justify-content:space-between; font-size:11px; color:rgba(248,250,252,0.88);">
                <span>\${b.icon || '\u{1F4E6}'} \${b.labelDe || b.category}</span>
                <span style="font-variant-numeric:tabular-nums; color:rgba(248,250,252,0.68);">\${valText}</span>
              </div>
              <div style="height:4px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden;">
                <div style="width:\${financesHidden ? 35 : pct}%; height:100%; background:\${barColor};"></div>
              </div>
            </div>
          \`;
        }).join('');
        html += \`<div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">\${budgetRows}</div>\`;
      }

      dynEl.innerHTML = html || '<div style="font-size:11.5px; color:rgba(255,255,255,0.5);">Keine Preview-Felder ausgew\xE4hlt</div>';

      if (qiSlot) {
        if (enabled.includes('quick_import')) {
          qiSlot.innerHTML = \`
            <button onclick="openQuickImportFlyout(event)"
                    style="width:100%; padding:7px 12px; border-radius:9px; border:1px solid rgba(56,189,248,0.4); background:linear-gradient(135deg, rgba(2,132,199,0.28), rgba(37,99,235,0.28)); color:#38bdf8; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              \u26A1 Quick Import (Online-Banking Flyout)
            </button>
          \`;
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

    function launchBankingPopupFromDashboard() {
      const url = (financesDashData && financesDashData.quickImportConfig && financesDashData.quickImportConfig.loginUrl)
        || 'https://george.sparkasse.at/index.html#/login';
      const w = 1040, h = 760;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      window.open(url, 'ThassiOnlineBankingPopup', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
      showQiDashStatus('\u{1FA9F} Online-Banking Popup ge\xF6ffnet. Nach Download wird der Export automatisch importiert.', true);
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
      try {
        showQiDashStatus('\u23F3 Importiere ' + file.name + '...', true);
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
        showQiDashStatus('\u2705 ' + file.name + ': ' + (json.importedCount || 0) + ' Buchungen importiert!', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Datei-Import fehlgeschlagen', false);
      }
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

    async function addNote(e) {
      e.preventDefault();
      const input = document.getElementById('note-input');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      await fetch(base + '/api/system/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      await loadAllLiveData();
    }

    async function deleteNote(id) {
      await fetch(base + '/api/system/notes?id=' + id, { method: 'DELETE' });
      await loadAllLiveData();
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
        document.getElementById('compact-meals').innerHTML = \`<strong>\${nextMeal}</strong>\`;
        document.getElementById('sub-meals').textContent = \`\${m.totalCalories || 0} kcal planned today\`;
        document.getElementById('em-slots').innerHTML = \`
          <div>\u{1F305} <strong>Breakfast:</strong> \${m.breakfast || '\u2014'}</div>
          <div>\u2600\uFE0F <strong>Lunch:</strong> \${m.lunch || '\u2014'}</div>
          <div>\u{1F319} <strong>Dinner:</strong> \${m.dinner || '\u2014'}</div>
        \`;
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

        // 3. Update NOTES widget
        const notes = sys.notes || [];
        if (notes.length > 0) {
          const latest = notes[0].content;
          document.getElementById('compact-notes').innerHTML = \`<strong>\${notes.length} \${notes.length === 1 ? 'note' : 'notes'}</strong>\`;
          document.getElementById('sub-notes').textContent = latest.length > 28 ? latest.slice(0, 28) + '\u2026' : latest;
          document.getElementById('notes-list').innerHTML = notes
            .map((n) => \`
              <div class="note-row">
                <span>\${n.content}</span>
                <button class="note-del" onclick="deleteNote(\${n.id})">\u2715</button>
              </div>
            \`)
            .join('');
        } else {
          document.getElementById('compact-notes').textContent = '0 notes';
          document.getElementById('sub-notes').textContent = 'Tap to write a quick note';
          document.getElementById('notes-list').innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4);">No notes saved yet.</div>';
        }

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

    function checkHashFor3dPrint() {
      try {
        const h = (window.top ? window.top.location.hash : window.location.hash) || window.location.hash;
        if (h === '#3d-print') {
          openFullService('3d-print', '3D Druck Studio');
        }
      } catch (_e) {}
    }
    checkHashFor3dPrint();
    window.addEventListener('hashchange', checkHashFor3dPrint);
  </script>
</body>
</html>`;
}

// apps/finance-analytics/shared/finance-types.ts
var CATEGORY_DEFINITIONS = [
  {
    id: "Housing & Utilities",
    labelDe: "Wohnen & Energie",
    color: "#6366f1",
    icon: "\u{1F3E0}",
    defaultBudget: 1900,
    group: "fixed",
    groupLabelDe: "Fixkosten & Wohnen",
    groupColor: "#6366f1"
  },
  {
    id: "Insurance & Finance",
    labelDe: "Versicherung & Bank",
    color: "#8b5cf6",
    icon: "\u{1F6E1}\uFE0F",
    defaultBudget: 320,
    group: "fixed",
    groupLabelDe: "Fixkosten & Wohnen",
    groupColor: "#6366f1"
  },
  {
    id: "Subscriptions",
    labelDe: "Abos & Internet",
    color: "#a855f7",
    icon: "\u{1F4E1}",
    defaultBudget: 80,
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
  if (combined.includes("notgroschen zu ")) {
    return "Sparkasse Notgroschen (Round-Up)";
  }
  if (!p && (combined.includes("kontof\xFChrung") || combined.includes("bereitstellung") || combined.includes("sollzinsen") || combined.includes("ablebensprovision"))) {
    return "Sparkasse Kontof\xFChrung & Geb\xFChren";
  }
  if (!p && (combined.includes("sb-auszahlung") || combined.includes("atm "))) {
    return "Bankomat / SB-Auszahlung";
  }
  return p || n.slice(0, 60) || "Bankbuchung";
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
  if (/generali|grazer wechselseitige|grawe|uniqa|allianz|wiener staedtische|lebensversicherung|unfallversich|0119636|5886-2773|kreditkartenrechnung|zuzahlung s kreditkarte|bereitstellung s kreditkarte|kontoführung|kontofuehrung|sollzinsen|bereitstellungsprovision|ablebensprovision|bartransaktionen|ksv-auskunft|klarna/.test(
    text
  ) && !/5574-4113|besitz-versi|6010-4061|kraftfahrzeug/.test(text)) {
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
  if (/sb-auszahlung|atm |automat |barauszahlung|überweisung |ueberweisung |george-überweisung|veronika simhofer|patricia leuthner|lisa simhofer|charlotte simhofer|daniela hader|marco eder|andre gundinger|fridtjof bauer|florian karpf|karpf florian|david endrich|nico zadak|charlotte tezky|peter bittermann|david maierhofer/.test(
    text
  )) {
    return "Cash & Private";
  }
  return "Shopping & Tech";
}
function detectRecurringFlag(payee, notes, category, hasMandate = false) {
  const text = `${payee} ${notes}`.toLowerCase();
  if (text.includes("notgroschen zu ")) return 0;
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
    if (excludeRoundUps && (t.payee.includes("Notgroschen") || t.notes.toLowerCase().includes("notgroschen zu "))) {
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
  const balBlocks = xmlText.match(/<Bal[\s\S]*?<\/Bal>/gi) || [];
  for (const blk of balBlocks) {
    if (/CLBD|ITBD|PRCD/i.test(blk)) {
      const amtMatch = blk.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
      const indMatch = blk.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
      if (amtMatch) {
        const val = parseEuroAmount(amtMatch[1]);
        const isDbt = indMatch && /DBIT/i.test(indMatch[1]);
        detectedClosingBalance = isDbt ? -Math.abs(val) : Math.abs(val);
      }
    }
  }
  const ntryBlocks = xmlText.match(/<Ntry[\s\S]*?<\/Ntry>/gi) || [];
  ntryBlocks.forEach((ntry, idx) => {
    const amtMatch = ntry.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
    const indMatch = ntry.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
    const dtMatch = ntry.match(/<BookgDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i) || ntry.match(/<ValDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i);
    const ustrdMatch = ntry.match(/<Ustrd>([^<]+)<\/Ustrd>/i);
    const nmMatches = Array.from(ntry.matchAll(/<Nm>([^<]+)<\/Nm>/gi)).map((m) => m[1].trim());
    const refMatch = ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i);
    if (!amtMatch) return;
    const rawAmt = parseEuroAmount(amtMatch[1]);
    const isDebit = indMatch && /DBIT/i.test(indMatch[1]);
    const signedAmt = isDebit ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    if (Math.abs(signedAmt) < 5e-3) return;
    const txDate = dtMatch ? normalizeDateString(dtMatch[1]) : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const rawNotes = (ustrdMatch ? ustrdMatch[1] : "").trim();
    const rawPayee = nmMatches[0] || "";
    const payee = normalizePayeeName(rawPayee, rawNotes);
    const category = autoCategorizeTransaction(payee, rawNotes, signedAmt);
    const isRecurring = detectRecurringFlag(payee, rawNotes, category);
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
    detectedIban,
    detectedClosingBalance
  };
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
function ingestStatementIntoDatabase(db, rawText, options = {}) {
  const cfg = getQuickImportConfig(db);
  const acctName = options.accountName || cfg.defaultAccountName || "Girokonto";
  const parseResult = parseBankStatementContent(rawText, acctName);
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
      if (![".csv", ".xml", ".sta", ".mt940"].includes(ext)) continue;
      const isBankExportName = /^AT\d{2}/i.test(entry.name) || /george|sparkasse|kontoauszug|umsatz|umsaetze|export|camt|mt940|elba|bawag|flatex/i.test(
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
        const decoded = decodeBankFileBuffer(rawBuf);
        const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
          db,
          decoded,
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
var globalAny = globalThis;
if (!globalAny.__thassiOrigEmit) {
  globalAny.__thassiOrigEmit = http.Server.prototype.emit;
}
http.Server.prototype.emit = function(event, ...args) {
  if (event === "request") {
    const req = args[0];
    const res = args[1];
    if (req && res && (req.method === "GET" || !req.method)) {
      const safeUrl = (req.url || "/").split("?")[0].replace(/\/+/g, "/");
      const standalone = (req.headers["x-thassi-standalone-app"] || "").trim();
      if (!standalone && (safeUrl === "/" || safeUrl === "/index.html")) {
        const ingressPath = (req.headers["x-ingress-path"] || "").replace(/\/+$/, "");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderUnifiedDashboardHtml(ingressPath));
        return true;
      }
    }
  }
  return globalAny.__thassiOrigEmit.apply(this, [event, ...args]);
};
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
  for (const b of getDefaultCategoryBudgets()) {
    ctx.db.execute(
      "INSERT OR IGNORE INTO category_budgets (category, monthly_limit) VALUES (?, ?)",
      [b.category, b.monthly_limit]
    );
  }
  const migrationDone = ctx.db.kvGet("finance_categorizer_v2_migrated");
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
      ctx.db.exec("COMMIT;");
      ctx.db.kvSet("finance_categorizer_v2_migrated", true);
    } catch {
      ctx.db.exec("ROLLBACK;");
    }
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
  function resolveDefaultTargetMonth() {
    const months = ctx.db.query(`
      SELECT
        substr(tx_date, 1, 7) as ym,
        COUNT(*) as cnt,
        SUM(CASE WHEN amount > 500 THEN amount ELSE 0 END) as inc
      FROM transactions
      GROUP BY ym
      ORDER BY ym DESC
    `);
    if (months.length === 0) return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const fullMonth = months.find((m) => m.cnt >= 8 || m.inc > 1e3);
    return fullMonth ? fullMonth.ym : months[0].ym;
  }
  function computeDailyAndWeeklyExpenses(excludeRoundUps) {
    const roundUpClause = excludeRoundUps ? `AND category != 'Investments' AND payee NOT LIKE '%Notgroschen%'` : `AND category != 'Investments'`;
    const todayIso = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const todayRow = ctx.db.queryOne(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date = ?`,
      [todayIso]
    );
    let expensesDay = todayRow?.spent ?? 0;
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
        expensesDayLabel = `Letzter Tag (${dd}.${mm}.)`;
      }
    }
    const sevenDaysAgoIso = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const weekRow = ctx.db.queryOne(
      `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
       FROM transactions
       WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
      [sevenDaysAgoIso, todayIso]
    );
    let expensesWeek = weekRow?.spent ?? 0;
    let expensesWeekRangeLabel = "Aktuelle Woche (7T)";
    if (expensesWeek === 0 && expensesDayDate) {
      const refEndMs = (/* @__PURE__ */ new Date(`${expensesDayDate}T12:00:00Z`)).getTime();
      const refStartIso = new Date(refEndMs - 6 * 864e5).toISOString().slice(0, 10);
      const fallbackWeek = ctx.db.queryOne(
        `SELECT COALESCE(ROUND(SUM(ABS(amount)), 2), 0) as spent
         FROM transactions
         WHERE amount < 0 ${roundUpClause} AND tx_date >= ? AND tx_date <= ?`,
        [refStartIso, expensesDayDate]
      );
      if (fallbackWeek && fallbackWeek.spent > 0) {
        expensesWeek = fallbackWeek.spent;
        const [, m1, d1] = refStartIso.split("-");
        const [, m2, d2] = expensesDayDate.split("-");
        expensesWeekRangeLabel = `7 Tage (${d1}.${m1}.\u2013${d2}.${m2}.)`;
      }
    }
    return {
      expensesDay,
      expensesDayDate,
      expensesDayLabel,
      expensesWeek,
      expensesWeekRangeLabel
    };
  }
  function computeCategoryBreakdown(whereClause, params) {
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
      const remaining = Number(Math.max(0, budgetLimit - spent).toFixed(2));
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
        overBudget: budgetLimit > 0 && spent > budgetLimit
      };
    });
    allBudgets.sort((a, b) => b.spent - a.spent || b.budgetLimit - a.budgetLimit);
    const categoryBreakdown = allBudgets.filter((c) => c.spent > 0 || c.budgetLimit > 0);
    const totalMonthlyBudget = Number(
      allBudgets.filter((c) => c.group !== "savings" && c.group !== "income").reduce((sum, c) => sum + c.budgetLimit, 0).toFixed(2)
    );
    return { categoryBreakdown, allBudgets, totalMonthlyBudget };
  }
  async function computeSummaryAndPublishSensors(monthFilter) {
    const previewConfig = getPreviewConfig();
    const balanceConfig = getBalanceConfig();
    const quickImportConfig = getQuickImportConfig(ctx.db);
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
    const { categoryBreakdown, allBudgets, totalMonthlyBudget } = computeCategoryBreakdown(
      whereClause,
      params
    );
    const previewGroupBudgets = previewConfig.previewBudgetCategories.map((cat) => allBudgets.find((b) => b.category === cat)).filter((b) => Boolean(b));
    const haStatus = await ctx.ha.getStatus();
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
      expensesDay: dayWeek.expensesDay,
      expensesDayDate: dayWeek.expensesDayDate,
      expensesDayLabel: dayWeek.expensesDayLabel,
      expensesWeek: dayWeek.expensesWeek,
      expensesWeekRangeLabel: dayWeek.expensesWeekRangeLabel,
      totalMonthlyBudget,
      haConnected: haStatus.connected
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
      quickImportConfig: {
        bankId: quickImportConfig.bankId,
        loginUrl: quickImportConfig.loginUrl,
        autoLoginEnabled: quickImportConfig.autoLoginEnabled,
        saveCookiesEnabled: quickImportConfig.saveCookiesEnabled,
        savedCookieCount: quickImportConfig.savedCookieCount,
        lastAutoImportAt: quickImportConfig.lastAutoImportAt,
        lastAutoImportFile: quickImportConfig.lastAutoImportFile
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (haStatus.connected) {
      await ctx.ha.publishSensor("current_balance", balanceConfig.currentBalance, {
        friendly_name: `Kontostand (${balanceConfig.accountName})`,
        unit_of_measurement: "EUR",
        icon: "mdi:bank",
        iban: balanceConfig.iban
      });
      await ctx.ha.publishSensor("daily_expenses", dayWeek.expensesDay, {
        friendly_name: `Tagesausgaben (${dayWeek.expensesDayLabel})`,
        unit_of_measurement: "EUR",
        icon: "mdi:cash-minus",
        date: dayWeek.expensesDayDate
      });
      await ctx.ha.publishSensor("weekly_expenses", dayWeek.expensesWeek, {
        friendly_name: `Wochenausgaben (${dayWeek.expensesWeekRangeLabel})`,
        unit_of_measurement: "EUR",
        icon: "mdi:calendar-week"
      });
      await ctx.ha.publishSensor("net_cashflow", totals.net, {
        friendly_name: `Net Cashflow (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:cash-multiple",
        period_month: activeMonth,
        income_eur: totals.income,
        expenses_eur: totals.expenses,
        investments_eur: totals.investments,
        savings_rate_pct: savingsRatePct
      });
      await ctx.ha.publishSensor("monthly_expenses", totals.expenses, {
        friendly_name: `Living Expenses (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:credit-card-outline",
        period_month: activeMonth
      });
      await ctx.ha.publishSensor("grocery_spend", grocerySpend, {
        friendly_name: `Grocery Spend (${activeMonth})`,
        unit_of_measurement: "EUR",
        icon: "mdi:cart-check",
        period_month: activeMonth
      });
      await ctx.ha.publishSensor("savings_rate", savingsRatePct, {
        friendly_name: `Savings & Investment Rate (${activeMonth})`,
        unit_of_measurement: "%",
        icon: "mdi:piggy-bank-outline",
        period_month: activeMonth
      });
    }
    return {
      kpis,
      categoryBreakdown,
      allBudgets,
      previewGroupBudgets,
      previewConfig,
      balanceConfig
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
      quickImportConfig: getQuickImportConfig(db),
      recurringFixed,
      sunburstGroups,
      sunburstMerchants,
      mealPlannerToday: mealPlannerToday || null
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
    let rawText = body.csvText || "";
    if (!rawText && body.base64Content) {
      const buf = Buffer.from(body.base64Content, "base64");
      rawText = decodeBankFileBuffer(buf);
    }
    if (!rawText.trim()) {
      return { status: 400, body: { error: "csvText or base64Content is required" } };
    }
    const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
      db,
      rawText,
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
    const summary = await computeSummaryAndPublishSensors();
    return {
      importedCount: insertedCount,
      skippedDuplicates,
      totalParsed: parseResult.transactions.length,
      format: parseResult.format,
      kpis: summary.kpis
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
    const summary = await computeSummaryAndPublishSensors();
    return {
      scanned: true,
      events,
      config: getQuickImportConfig(db),
      kpis: summary.kpis
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
    const summary = await computeSummaryAndPublishSensors();
    return {
      imported: true,
      fileName,
      csvContent,
      format: parseResult.format,
      insertedCount,
      skippedDuplicates,
      kpis: summary.kpis,
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
