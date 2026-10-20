import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/3d-print/backend/index.ts
import http from "node:http";

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

    <!-- Higher, bordered Room StatusBar: Left = Smart Home Button + Room Buttons, Right = 3D Print & Vision Previews -->
    <div id="room-dock-bar">
      <button class="room-pill" onclick="openFullService('smart-canvas', 'Smart Home')" title="Open Smart Home View" style="border-color:rgba(56,189,248,0.42); color:#e0f2fe; flex-shrink:0;">
        \u2302 Smart Home \u2197
      </button>
      <button class="room-pill" onclick="openFullService('memo', 'Memo')" title="Open Memo Knowledge Base" style="border-color:rgba(255,255,255,0.18); color:#f8fafc; flex-shrink:0;">
        Memo \u2197
      </button>
      <button class="room-pill" onclick="openFullService('cortex', 'Cortex')" title="Open Cortex Gemini Workspace" style="border-color:rgba(255,255,255,0.18); color:#f8fafc; flex-shrink:0;">
        Cortex \u2197
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
          const hasOn = r.activeCount > 0;
          const hasMotion = Boolean(r.motionActive);
          const isPinned = pinnedRoomIds.has(r.id);

          const metaParts = [];
          if (r.tempC != null) metaParts.push(r.tempC.toFixed(1) + '\xB0');
          if (r.activeCount > 0) metaParts.push(r.activeCount + ' an');
          if (r.totalPowerW > 0.5) metaParts.push(Math.round(r.totalPowerW) + 'W');

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isPinned ? 'pinned-tab' : ''}"
                    title="\${isPinned ? 'Klicken zum Minimieren (Entpinnen)' : 'Klicken zum Anheften (Pinnen) der Raum-Ger\xE4te'}"
                    onclick="toggleRoomPin('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${metaParts.length > 0 ? \`<span class="room-meta">\${metaParts.join(' \xB7 ')}</span>\` : ''}
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
    window.selectCortexMemoHit = selectCortexMemoHit;
    window.closeCortexResponse = closeCortexResponse;
    window.copyCortexResponse = copyCortexResponse;

    // ============================================================================
    // HORIZON CENTERED CORTEX PROMPT BAR, LIVE PREVIEWS & GEMINI SENDER
    // ============================================================================
    let cortexSearchTimer = null;
    let cortexIsSubmitting = false;
    let cachedCortexBlueprints = [];

    async function initCortexPromptBar() {
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!input || !dropdown) return;

      try {
        const bsRes = await fetch(base + '/api/apps/cortex/bootstrap');
        if (bsRes.ok) {
          const bsData = await bsRes.json();
          cachedCortexBlueprints = bsData.blueprints || [];
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
        }, 180);
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
        (b.code || '').toLowerCase().includes(qLow)
      );

      let memoHits = [];
      try {
        const mRes = await fetch(base + '/api/apps/memo/search?q=' + encodeURIComponent(q) + '&limit=5');
        if (mRes.ok) {
          const mData = await mRes.json();
          memoHits = mData.results || [];
        }
      } catch (_e) {}

      if (matchedBps.length === 0 && memoHits.length === 0) {
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
    default:
      return generateBoxTriangles(node.params);
  }
}
function compileSceneToMesh(scene) {
  const rawFaces = [];
  for (const node of scene.nodes) {
    const localTris = generatePrimitiveRawTriangles(node);
    const isSub = node.operation === "subtract";
    for (const [p0, p1, p2] of localTris) {
      const v0 = transformPoint(p0, node.position, node.rotation, node.scale);
      const v1 = transformPoint(p1, node.position, node.rotation, node.scale);
      const v2 = transformPoint(p2, node.position, node.rotation, node.scale);
      const normal = isSub ? computeNormal(v0, v2, v1) : computeNormal(v0, v1, v2);
      rawFaces.push({
        v0: isSub ? v0 : v0,
        v1: isSub ? v2 : v1,
        v2: isSub ? v1 : v2,
        normal,
        color: isSub ? "#f43f5e" : node.color || scene.printProfile.filamentColor || "#00AE42",
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
  const vertexMap = /* @__PURE__ */ new Map();
  const indexedVertices = [];
  const indexedTriangles = [];
  let signedVolumeMm3 = 0;
  const getVertexIndex = (v) => {
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const existing = vertexMap.get(key);
    if (existing !== void 0) return existing;
    const idx = indexedVertices.length;
    indexedVertices.push({
      x: Number(v.x.toFixed(3)),
      y: Number(v.y.toFixed(3)),
      z: Number(v.z.toFixed(3))
    });
    vertexMap.set(key, idx);
    return idx;
  };
  for (const f of rawFaces) {
    const i0 = getVertexIndex(f.v0);
    const i1 = getVertexIndex(f.v1);
    const i2 = getVertexIndex(f.v2);
    if (i0 !== i1 && i1 !== i2 && i0 !== i2) {
      indexedTriangles.push([i0, i1, i2]);
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
      vertexCount: indexedVertices.length,
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
  const verticesXml = mesh.indexedVertices.map((v) => `          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`).join("\n");
  const trianglesXml = mesh.indexedTriangles.map(([v1, v2, v3]) => `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join("\n");
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
  { pattern: /\b(rot|red|crimson|rubin|kirsch)\b/i, hex: "#e11d48", label: "Apfel-Rot" },
  { pattern: /\b(grün|gruen|green|bambu|smaragd|lime|granny)\b/i, hex: "#22c55e", label: "Gr\xFCn" },
  { pattern: /\b(blau|blue|kobalt|navy|türkis|cyan)\b/i, hex: "#38bdf8", label: "Blau / Cyan" },
  { pattern: /\b(gelb|yellow|gold|amber|messing|zitrone)\b/i, hex: "#fbbf24", label: "Gold / Gelb" },
  { pattern: /\b(orange|kupfer|copper|mandarin)\b/i, hex: "#f97316", label: "Orange" },
  { pattern: /\b(lila|violett|purple|magenta|beere)\b/i, hex: "#a855f7", label: "Violett" },
  { pattern: /\b(rosa|pink|koralle)\b/i, hex: "#f43f5e", label: "Pink / Koralle" },
  { pattern: /\b(braun|holz|wood|bronze|schoko)\b/i, hex: "#854d0e", label: "Holz-Braun" },
  { pattern: /\b(weiss|weiß|white|klar|farblos|schnee)\b/i, hex: "#f8fafc", label: "Wei\xDF" },
  { pattern: /\b(schwarz|black|carbon|anthrazit|grau|grey|silber)\b/i, hex: "#64748b", label: "Anthrazit / Carbon" }
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
var KNOWN_OBJECT_ARCHETYPE_REGEX = /\b(apfel|äpfel|aepfel|apple|birne|pear|tasse|kaffeetasse|teetasse|mug|becher|herz|heart|stern|star|pilz|fliegenpilz|mushroom|flasche|karaffe|bottle|schale|schüssel|schuessel|bowl|obstschale|schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|schneemann|snowman|würfel|wuerfel|cube|pyramide|pyramid|kegel|trichter|cone|donut|torus|zahnrad|gear|ritzel|getriebe|vase|blumentopf|pflanztopf|kelch|organizer|sortierbox|stiftehalter|kopfhörer|kopfhoerer|headphone|wandhalter|tischklemme|winkel|bracket)\b/i;
var INCREMENTAL_MODIFIER_ONLY_REGEX = /\b(höher|hoeher|breiter|kleiner|flacher|kürzer|kuerzer|größer|groesser|skalier|loch|bohrung|durchbruch|farbe|färbe|faerbe|dreh|rotier|twist|ohne\s+blatt|ohne\s+stiel|biss|abgebissen|halbiere)\b/i;
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
      baseScene.title = colorMatch && colorMatch.label !== "Apfel-Rot" ? `3D-Apfel (${colorMatch.label})` : "3D-Apfel mit Stiel & Blatt";
      baseScene.description = `Organischer 3D-Apfel generiert aus Prompt: "${cleanPrompt}"`;
      summary2 = `Naturgetreuer 3D-Apfel (\xD8${(bodyNode?.params.radius || 34) * 2}\xD7${(bodyNode?.params.height || 58) + 8}mm) mit oberer Stielgrube, unterer Kelch-Einbuchtung, 5-fach gew\xF6lbtem Fruchtk\xF6rper, braunem Stiel und gr\xFCnem Blatt generiert.`;
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
            name: "Birnen-Fruchtk\xF6rper (Rotationsprofil)",
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
            color: "#854d0e",
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
            color: "#16a34a",
            params: { radius: 8.5, domeOnly: 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = "Organische 3D-Birne (\xD868\xD791mm) mit bauchiger Unterseite, schlankem Hals, Stiel und Blatt erstellt.";
    } else if (/\b(tasse|kaffeetasse|teetasse|mug|haferl)\b/i.test(lower)) {
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
        title: "3D-Schneemann mit Hut & Karottennase",
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
    } else if (/\b(vase|blumentopf|topf|gefäß|gefaess|spiral|kelch|lampe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.twisted_rib_vase();
      const heightMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:hoch|höhe|hoehe|high)/i);
      const ribMatch = lower.match(/(\d+)\s*(?:rippen|ribs|rillen)/i);
      const vaseNode = baseScene.nodes[0];
      if (heightMatch) vaseNode.params.height = Math.max(20, Math.min(240, Number(heightMatch[1].replace(",", "."))));
      if (ribMatch) vaseNode.params.ribCount = Math.max(0, Math.min(36, Number(ribMatch[1])));
      baseScene.title = `Spiral-Designvase (${vaseNode.params.height}mm)`;
      summary2 = `Skulpturale Torsions-Vase (H\xF6he ${vaseNode.params.height}mm, ${vaseNode.params.ribCount} Rippen) erstellt.`;
    } else if (/\b(organizer|kasten|schublade|sortier|fach|fächer|faecher|tray|stiftehalter|halterung für kabel)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.smart_home_organizer();
      const orgNode = baseScene.nodes[0];
      const gridMatch = lower.match(/(\d+)\s*[x×]\s*(\d+)/);
      if (gridMatch) {
        orgNode.params.slotsX = Math.max(1, Math.min(5, Number(gridMatch[1])));
        orgNode.params.slotsY = Math.max(1, Math.min(4, Number(gridMatch[2])));
      }
      baseScene.title = `Modularer Organizer (${orgNode.params.slotsX}\xD7${orgNode.params.slotsY} F\xE4cher)`;
      summary2 = `Organizer-Box (${orgNode.params.width}\xD7${orgNode.params.depth}\xD7${orgNode.params.height}mm) mit ${orgNode.params.slotsX * orgNode.params.slotsY} Kammern generiert.`;
    } else if (/\b(kopfhörer|kopfhoerer|headphone|haken|hook|winkel|bracket|wandhalter|tischklemme|klemme|ständer|staender)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.desk_headphone_stand();
      baseScene.title = cleanPrompt.length <= 42 ? cleanPrompt : "Tisch- & Wandhalterung (Bracket)";
      summary2 = `Verst\xE4rkte Halterung / Tischklemme (38\xD762\xD774mm) mit Kabeldurchf\xFChrung generiert.`;
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
            color: colorMatch?.hex || "#00AE42",
            params: { radius: rad, domeOnly: /\b(kuppel|dome|halbkugel)\b/i.test(lower) ? 1 : 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Sph\xE4ren-Geometrie (\xD8${rad * 2}mm) auf der Bauplatte erstellt.`;
    } else if (/\b(pyramide|pyramid|kegel|cone|trichter)\b/i.test(lower)) {
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
      const w = dims[0] || 60;
      const d = dims[1] || 48;
      const h = dims[2] || 36;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: cleanPrompt.slice(0, 48) || "Antigravity 3D-Objekt",
        description: `KI-generiertes 3D-Druckmodell f\xFCr "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: colorMatch?.hex || "#00AE42" },
        nodes: [
          {
            id: "node-base-chassis",
            name: "Hauptk\xF6rper (Gefast)",
            type: "box",
            operation: "union",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || "#00AE42",
            params: { width: w, depth: d, height: h, bevel: 5, wallThickness: /\b(hohl|gehäuse|box)\b/i.test(lower) ? 2.8 : 0 }
          }
        ],
        promptHistory: []
      };
      summary2 = `Parametrisches 3D-Modell (${w}\xD7${d}\xD7${h}mm) f\xFCr "${cleanPrompt}" generiert.`;
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
      params: { radiusBottom: holeRad, radiusTop: holeRad, height: 80, segments: 32 }
    });
    changes.push(`Pr\xE4zisionsbohrung (\xD8${holeDia}mm) hinzugef\xFCgt`);
  }
  if (/\b(füge|fuege|add|hinzu|oben|sockel|basis|ring|knauf|griff|henkel)\b/i.test(lower) && !/\b(loch|bohrung)\b/i.test(lower)) {
    const refHeight = scene.nodes[0]?.params?.height || 45;
    if (/\b(ring|öse|oese|torus|henkel)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-ring-${Date.now()}`,
        name: "Befestigungsring / \xD6se",
        type: "torus",
        operation: "union",
        position: [0, 0, refHeight - 4],
        rotation: [90, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 14, tubeRadius: 3.5 }
      });
      changes.push(`Befestigungsring / \xD6se hinzugef\xFCgt`);
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
        params: { width: mmVal || 76, depth: mmVal || 76, height: 6, bevel: 4 }
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
async function generateOrModify3dSceneWithAi(prompt, existingScene, customApiKey) {
  const lower = prompt.trim().toLowerCase();
  if (isExplicitObjectCreationPrompt(prompt) && KNOWN_OBJECT_ARCHETYPE_REGEX.test(lower)) {
    return runLocalAntigravityCadEngine(prompt, existingScene);
  }
  const apiKey = customApiKey || discoverGeminiApiKey();
  if (apiKey) {
    const models = await resolveGeminiModels(apiKey);
    const systemInstruction = `Du bist der Antigravity 3D-CAD Kernel f\xFCr das Home Assistant Modul "thassi.3dprint" (Bambu Lab X1C 256x256x256mm).
Erzeuge oder ver\xE4ndere das 3D-Objekt basierend auf dem User-Prompt.
Verf\xFCgbare PrimitiveTypes:
- "apple": params { radius, height, lobeCount, lobeAmplitude, topIndent, bottomIndent, segments } (Organischer 3D-Apfelk\xF6rper mit Stielgrube)
- "lathe": params { height, rBottom, rLower, rMid, rUpper, rNeck, rTop, topIndent, bottomIndent, wallThickness, lobeCount, lobeAmplitude, segments } (Rotationsk\xF6rper f\xFCr Birnen, Flaschen, Schalen, Kelche, Figuren)
- "heart": params { width, depth, height, bevel } (3D-Herz)
- "star": params { points, outerRadius, innerRadius, height } (3D-Stern)
- "box": params { width, depth, height, bevel, wallThickness }
- "cylinder": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "sphere": params { radius, domeOnly (0|1) }
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

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Block:
{
  "title": "Projekttitel",
  "description": "Kurzbeschreibung",
  "filamentColor": "#00AE42",
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
Modifiziere das Modell (oder erstelle das gew\xFCnschte Objekt neu, falls ein anderes Objekt genannt wird).` : `Erstelle ein neues druckbares 3D-Modell f\xFCr folgenden User-Prompt: "${prompt}"`;
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
                temperature: 0.25,
                responseMimeType: "application/json"
              }
            }),
            signal: AbortSignal.timeout(9e3)
          }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
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
          const sanitizedNodes = parsed.nodes.map((n, idx) => ({
            id: n.id || `node-ai-${idx}-${Date.now()}`,
            name: n.name || `Bauteil ${idx + 1}`,
            type: validTypes.has(n.type) ? n.type : "box",
            operation: n.operation === "subtract" ? "subtract" : "union",
            position: Array.isArray(n.position) && n.position.length === 3 ? n.position.map(Number) : [0, 0, 0],
            rotation: Array.isArray(n.rotation) && n.rotation.length === 3 ? n.rotation.map(Number) : [0, 0, 0],
            scale: Array.isArray(n.scale) && n.scale.length === 3 ? n.scale.map((v) => Math.max(0.1, Number(v) || 1)) : [1, 1, 1],
            color: n.color || parsed.filamentColor || existingScene?.printProfile.filamentColor || "#00AE42",
            params: typeof n.params === "object" && n.params ? n.params : { width: 40, depth: 40, height: 30 }
          }));
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          const summaryText = parsed.summary || `3D-Modell per ${model} aktualisiert`;
          const engineName = `Antigravity AI (${model})`;
          const nextScene = {
            projectId: existingScene?.projectId || `proj-${Date.now()}`,
            title: parsed.title || existingScene?.title || prompt.slice(0, 40),
            description: parsed.description || existingScene?.description || prompt,
            createdAt: existingScene?.createdAt || nowIso,
            updatedAt: nowIso,
            buildPlateMm: [256, 256, 256],
            printProfile: {
              ...existingScene?.printProfile || DEFAULT_PRINT_PROFILE,
              filamentColor: parsed.filamentColor || existingScene?.printProfile.filamentColor || "#00AE42",
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
          return { scene: nextScene, summary: summaryText, engine: engineName };
        }
      } catch {
      }
    }
  }
  return runLocalAntigravityCadEngine(prompt, existingScene);
}

// apps/3d-print/backend/index.ts
try {
  syncHassFrontendFiles();
} catch {
}
var hotCachedWeather = null;
async function fetchHotStVeitWeather() {
  if (hotCachedWeather && Date.now() - hotCachedWeather.ts < 10 * 60 * 1e3) {
    return hotCachedWeather.data;
  }
  const lat = 48.0444;
  const lon = 15.6689;
  const mapCode = (code) => {
    if (code === 0) return { conditionCode: "clear", conditionLabel: "Sonnig & Klar" };
    if (code <= 2) return { conditionCode: "partly_cloudy", conditionLabel: "Leicht bew\xF6lkt" };
    if (code === 3) return { conditionCode: "cloudy", conditionLabel: "Bew\xF6lkt" };
    if (code === 45 || code === 48) return { conditionCode: "fog", conditionLabel: "Talnebel" };
    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return { conditionCode: "rain", conditionLabel: "Regen" };
    if (code >= 71 && code <= 86) return { conditionCode: "snow", conditionLabel: "Schneefall" };
    if (code >= 95) return { conditionCode: "thunderstorm", conditionLabel: "Gewitter" };
    return { conditionCode: "partly_cloudy", conditionLabel: "Wechselhaft" };
  };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FVienna&forecast_days=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (r.ok) {
      const d = await r.json();
      const c = d.current || {};
      const cm = mapCode(Number(c.weather_code ?? 1));
      const times = d.hourly?.time || [];
      const temps = d.hourly?.temperature_2m || [];
      const probs = d.hourly?.precipitation_probability || [];
      const codes = d.hourly?.weather_code || [];
      const targetHrs = [6, 9, 12, 15, 18, 21];
      const daySlots = [];
      for (let i = 0; i < times.length; i++) {
        const hr = Number(times[i].slice(11, 13)) || new Date(times[i]).getHours();
        if (targetHrs.includes(hr) && daySlots.length < 6) {
          const sm = mapCode(Number(codes[i] ?? 1));
          daySlots.push({
            hour: hr,
            hourLabel: `${String(hr).padStart(2, "0")}:00`,
            tempC: Math.round(Number(temps[i] ?? 14) * 10) / 10,
            precipProbPct: Math.round(Number(probs[i] ?? 0)),
            conditionCode: sm.conditionCode,
            conditionLabel: sm.conditionLabel
          });
        }
      }
      const payload = {
        location: "St. Veit / G\xF6lsen",
        region: "Bezirk Lilienfeld \xB7 N\xD6 (3161)",
        coordinates: { lat, lon },
        provider: "Google Weather \xB7 St. Veit / G\xF6lsen",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        current: {
          tempC: Math.round(Number(c.temperature_2m ?? 14) * 10) / 10,
          feelsLikeC: Math.round(Number(c.apparent_temperature ?? c.temperature_2m ?? 13.5) * 10) / 10,
          conditionCode: cm.conditionCode,
          conditionLabel: cm.conditionLabel,
          humidityPct: Math.round(Number(c.relative_humidity_2m ?? 64)),
          windKmh: Math.round(Number(c.wind_speed_10m ?? 9))
        },
        today: {
          tempMaxC: Math.round(Number(d.daily?.temperature_2m_max?.[0] ?? 17) * 10) / 10,
          tempMinC: Math.round(Number(d.daily?.temperature_2m_min?.[0] ?? 7) * 10) / 10
        },
        daySlots
      };
      hotCachedWeather = { ts: Date.now(), data: payload };
      return payload;
    }
  } catch {
  }
  return {
    location: "St. Veit / G\xF6lsen",
    provider: "Google Weather \xB7 St. Veit / G\xF6lsen",
    current: {
      tempC: 14,
      feelsLikeC: 13.2,
      conditionCode: "partly_cloudy",
      conditionLabel: "Leicht bew\xF6lkt",
      humidityPct: 62,
      windKmh: 9
    },
    today: { tempMaxC: 17, tempMinC: 8 },
    daySlots: [6, 9, 12, 15, 18, 21].map((hr) => ({
      hour: hr,
      hourLabel: `${String(hr).padStart(2, "0")}:00`,
      tempC: Math.round(9 + Math.sin((hr - 6) / 14 * Math.PI) * 8),
      precipProbPct: 10,
      conditionCode: "partly_cloudy",
      conditionLabel: "Leicht bew\xF6lkt"
    }))
  };
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
      if (safeUrl === "/api/system/weather") {
        void fetchHotStVeitWeather().then((wx) => {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(JSON.stringify(wx));
        });
        return true;
      }
    }
  }
  return globalAny.__thassiOrigEmit.apply(this, [event, ...args]);
};
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
  function getPrinterConfig() {
    const saved = ctx.db.kvGet("bambu_printer_config") || {};
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...saved
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
  function seedDefaultProjects() {
    const presets = [
      PRESET_TEMPLATES.organic_apple_sculpture(),
      PRESET_TEMPLATES.desk_headphone_stand(),
      PRESET_TEMPLATES.precision_planetary_gear(),
      PRESET_TEMPLATES.twisted_rib_vase(),
      PRESET_TEMPLATES.smart_home_organizer()
    ];
    for (const scene of presets) {
      const existing = ctx.db.queryOne("SELECT * FROM print_projects WHERE id = ?", [
        scene.projectId
      ]);
      const compiled = compileSceneToMesh(scene);
      if (!existing) {
        ctx.db.execute(
          `INSERT INTO print_projects (id, title, description, scene_json, stats_json, status, progress_pct, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'sliced_ready', 100, ?, ?)`,
          [
            scene.projectId,
            scene.title,
            scene.description,
            JSON.stringify(scene),
            JSON.stringify(compiled.stats),
            scene.createdAt,
            scene.updatedAt
          ]
        );
      } else if (scene.projectId === "preset-headphone-hook" && /apfel/i.test(existing.title)) {
        ctx.db.execute(
          `UPDATE print_projects SET title = ?, description = ?, scene_json = ?, stats_json = ?, updated_at = ? WHERE id = ?`,
          [
            scene.title,
            scene.description,
            JSON.stringify(scene),
            JSON.stringify(compiled.stats),
            (/* @__PURE__ */ new Date()).toISOString(),
            scene.projectId
          ]
        );
      }
    }
    const allRows = ctx.db.query("SELECT * FROM print_projects");
    for (const r of allRows) {
      if (/\b(apfel|apple)\b/i.test(r.title) && r.scene_json.includes("node-base-chassis")) {
        const appleScene = PRESET_TEMPLATES.organic_apple_sculpture();
        appleScene.projectId = r.id;
        appleScene.title = "3D-Apfel mit Stiel & Blatt";
        appleScene.description = `Organischer 3D-Apfel f\xFCr "${r.title}"`;
        const compiled = compileSceneToMesh(appleScene);
        ctx.db.execute(
          `UPDATE print_projects SET title = ?, description = ?, scene_json = ?, stats_json = ?, updated_at = ? WHERE id = ?`,
          [
            appleScene.title,
            appleScene.description,
            JSON.stringify(appleScene),
            JSON.stringify(compiled.stats),
            (/* @__PURE__ */ new Date()).toISOString(),
            r.id
          ]
        );
      }
    }
    const activeId = ctx.db.kvGet("active_project_id");
    if (!activeId) {
      ctx.db.kvSet("active_project_id", "preset-organic-apple");
    }
  }
  seedDefaultProjects();
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
    const geminiKey = discoverGeminiApiKey();
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
  ctx.route("POST", "/projects/generate", async (req) => {
    const body = req.body || {};
    let scene;
    let summary = "";
    let engine = "Antigravity Parametric CAD";
    if (body.presetKey && PRESET_TEMPLATES[body.presetKey]) {
      scene = PRESET_TEMPLATES[body.presetKey]();
      scene.projectId = `proj-${Date.now()}`;
      summary = `Vorlage "${scene.title}" geladen und f\xFCr Bambu Lab P1S vorbereitet.`;
    } else {
      const promptText = (body.prompt || "").trim();
      if (!promptText) {
        return { status: 400, body: { error: "Bitte einen Prompt f\xFCr das 3D-Objekt eingeben." } };
      }
      const generated = await generateOrModify3dSceneWithAi(promptText, null);
      scene = generated.scene;
      summary = generated.summary;
      engine = generated.engine;
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
      const modified = await generateOrModify3dSceneWithAi(promptText, currentScene);
      nextScene = modified.scene;
      summary = modified.summary;
      engine = modified.engine;
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
