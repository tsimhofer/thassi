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

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// thassi_host/src/hass-sidebar-sync.ts
import fs2 from "node:fs";
import path2 from "node:path";
function getHassSidebarStylerScript() {
  return `
  (function initThassiHassSidebarStyler() {
    const LABEL_MAP = {
      'Main Dashboard': 'Horizon',
      'Thassi Main Dashboard': 'Horizon',
      'Thassi Unified Dashboard': 'Horizon',
      'Google Calendar & Time Analytics': 'Calendar',
      'Google Health & Readiness': 'Health',
      'Finance & Budget': 'Finances',
      'Meal Planner': 'Meals',
      'Smart Control Canvas': 'Smart Home',
      'Camera Vision & Object Detection': 'Vision'
    };

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #040711 !important;
        --secondary-background-color: #060a17 !important;
        --card-background-color: rgba(8, 13, 26, 0.72) !important;
        --ha-card-background: rgba(8, 13, 26, 0.72) !important;
        --sidebar-background-color: transparent !important;
        --sidebar-text-color: rgba(248, 250, 252, 0.58) !important;
        --sidebar-icon-color: rgba(148, 163, 184, 0.58) !important;
        --sidebar-selected-text-color: #ffffff !important;
        --sidebar-selected-icon-color: #38bdf8 !important;
        --primary-color: #38bdf8 !important;
        --accent-color: #38bdf8 !important;
        --divider-color: rgba(255, 255, 255, 0.0) !important;
        --app-header-background-color: #040711 !important;
        --app-header-text-color: #f8fafc !important;
        --mdc-theme-primary: #38bdf8 !important;
        --mdc-theme-surface: #040711 !important;
        --mdc-drawer-width: 208px !important;
        background-color: #040711 !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer, aside.mdc-drawer {
        background: var(--thassi-sidebar-bg, linear-gradient(180deg, rgba(4, 7, 17, 0.94) 0%, rgba(7, 13, 29, 0.92) 55%, rgba(3, 6, 15, 0.96) 100%)) !important;
        backdrop-filter: blur(30px) saturate(140%) !important;
        -webkit-backdrop-filter: blur(30px) saturate(140%) !important;
        border-right: none !important;
        box-shadow: 16px 0 48px rgba(0, 0, 0, 0.35) !important;
        transition: background 1.2s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .mdc-drawer.mdc-drawer--open:not(.mdc-drawer--closing) + .mdc-drawer-app-content {
        background: #040711 !important;
      }
      .mdc-drawer-app-content {
        background: #040711 !important;
      }
    \`;

    const SIDEBAR_SHADOW_CSS = \`
      :host {
        background: transparent !important;
        color: rgba(248, 250, 252, 0.62) !important;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        border-right: none !important;
      }
      .menu {
        background: transparent !important;
        border-bottom: none !important;
        height: 68px !important;
        padding: 0 14px !important;
        display: flex !important;
        align-items: center !important;
      }
      .menu .title {
        font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        letter-spacing: 0.28em !important;
        text-transform: uppercase !important;
        color: rgba(248, 250, 252, 0.72) !important;
        margin-left: 6px !important;
      }
      .menu ha-icon-button {
        color: rgba(248, 250, 252, 0.55) !important;
      }
      /* Hide sidebar edit button, dividers, notifications & non-Thassi items */
      .divider,
      div.divider,
      .notifications-container,
      .notifications,
      ha-md-list-item.notifications,
      a[data-panel="lovelace"],
      a[data-panel="developer-tools"],
      a[data-panel="config"],
      a[data-panel="44ec3c40_thassi_system_monitor"],
      a[data-panel="44ec3c40_thassi_fuege_neue"],
      ha-md-list-item[href="/lovelace"],
      ha-md-list-item[href="/developer-tools"],
      ha-md-list-item[href="/44ec3c40_thassi_system_monitor"],
      ha-md-list-item[href="/44ec3c40_thassi_fuege_neue"] {
        display: none !important;
      }
      ha-md-list,
      paper-listbox {
        padding: 4px 10px !important;
        background: transparent !important;
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        border-radius: 14px !important;
        margin: 4px 0 !important;
        min-height: 42px !important;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 12.5px !important;
        font-weight: 400 !important;
        letter-spacing: 0.04em !important;
        color: rgba(248, 250, 252, 0.56) !important;
        transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        --md-list-item-leading-icon-color: rgba(148, 163, 184, 0.56) !important;
        --md-list-item-label-text-color: rgba(248, 250, 252, 0.56) !important;
        --md-list-item-label-text-font: "Inter", system-ui, sans-serif !important;
        --md-list-item-label-text-size: 12.5px !important;
        --md-list-item-label-text-weight: 400 !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        background: rgba(255, 255, 255, 0.04) !important;
        color: rgba(248, 250, 252, 0.92) !important;
        transform: translateX(3px) !important;
        --md-list-item-leading-icon-color: rgba(248, 250, 252, 0.92) !important;
        --md-list-item-label-text-color: rgba(248, 250, 252, 0.92) !important;
      }
      ha-md-list-item[selected],
      ha-md-list-item.selected,
      a.iron-selected,
      a[aria-selected="true"] {
        background: rgba(56, 189, 248, 0.11) !important;
        color: #ffffff !important;
        box-shadow: inset 2px 0 0 #38bdf8, 0 8px 24px rgba(0, 0, 0, 0.22) !important;
        --md-list-item-leading-icon-color: #38bdf8 !important;
        --md-list-item-label-text-color: #ffffff !important;
        --md-list-item-label-text-weight: 500 !important;
      }
      .item-text {
        font-size: 12.5px !important;
        letter-spacing: 0.04em !important;
      }
      /* Subtle profile footer */
      .profile,
      ha-md-list-item.user {
        opacity: 0.55 !important;
        transition: opacity 0.2s ease !important;
      }
      .profile:hover,
      ha-md-list-item.user:hover {
        opacity: 0.95 !important;
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
        }

        const sidebar = main.shadowRoot.querySelector('ha-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          ensureStyleTag(sidebar.shadowRoot, 'thassi-sidebar-style', SIDEBAR_SHADOW_CSS);

          const titleEl = sidebar.shadowRoot.querySelector('.menu .title');
          if (titleEl && titleEl.textContent !== 'THASSI') {
            titleEl.textContent = 'THASSI';
          }

          const items = sidebar.shadowRoot.querySelectorAll('.item-text, span[slot="headline"]');
          let has3dPrintItem = false;
          items.forEach((el) => {
            const raw = (el.textContent || '').trim();
            if (raw === '3D Druck' || raw === '3D Print') has3dPrintItem = true;
            if (LABEL_MAP[raw]) {
              el.textContent = LABEL_MAP[raw];
            }
          });

          // Ensure "3D Druck" appears in the Home Assistant sidebar even before standalone add-on install
          const list = sidebar.shadowRoot.querySelector('ha-md-list, paper-listbox');
          if (list && !has3dPrintItem && !list.querySelector('#thassi-sidebar-3dprint')) {
            const item = document.createElement('a');
            item.id = 'thassi-sidebar-3dprint';
            item.setAttribute('role', 'option');
            item.href = '/44ec3c40_thassi_host#3d-print';
            item.style.cssText = 'display:flex;align-items:center;gap:16px;padding:0 16px;min-height:42px;border-radius:14px;margin:4px 0;text-decoration:none;color:rgba(248,250,252,0.56);font-family:Inter,system-ui,sans-serif;font-size:12.5px;cursor:pointer;transition:all 0.25s ease;';
            item.innerHTML = '<ha-icon icon="mdi:printer-3d-nozzle" style="color:rgba(148,163,184,0.56);"></ha-icon><span class="item-text">3D Druck</span>';
            item.addEventListener('click', (ev) => {
              ev.preventDefault();
              try {
                if (typeof window.openFullService === 'function') {
                  window.openFullService('3d-print', '3D Druck Studio');
                  return;
                }
                if (window.top) {
                  window.top.history.pushState(null, '', '/44ec3c40_thassi_host#3d-print');
                  window.top.dispatchEvent(new CustomEvent('location-changed'));
                }
              } catch (_e) {}
            });
            list.appendChild(item);
          }
        }

        // Also strip Lovelace top header if currently on /lovelace
        const panelLovelace = main.shadowRoot.querySelector('ha-panel-lovelace');
        const huiRoot = panelLovelace && panelLovelace.shadowRoot && panelLovelace.shadowRoot.querySelector('hui-root');
        if (huiRoot && huiRoot.shadowRoot) {
          ensureStyleTag(huiRoot.shadowRoot, 'thassi-lovelace-fullbleed', LOVELACE_FULLBLEED_CSS);
        }
      } catch (_err) {
        // Cross-origin fallback (when opened directly on :8099 outside Home Assistant)
      }
    }

    window.syncThassiSidebarSky = function(skyOverlayGradient) {
      try {
        if (!window.top || window.top === window) return;
        const ha = window.top.document.querySelector('home-assistant');
        const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
        const drawer = main && main.shadowRoot && main.shadowRoot.querySelector('ha-drawer');
        if (drawer) {
          drawer.style.setProperty('--thassi-sidebar-bg', skyOverlayGradient);
        }
      } catch (_e) {}
    };

    applyThassiChromeToParent();
    setInterval(applyThassiChromeToParent, 1200);
  })();
  `;
}
function syncHassFrontendFiles() {
  const candidateConfigDirs = ["/homeassistant", "/config"];
  for (const cfgDir of candidateConfigDirs) {
    if (!fs2.existsSync(path2.join(cfgDir, "configuration.yaml"))) continue;
    try {
      const wwwDir = path2.join(cfgDir, "www");
      fs2.mkdirSync(wwwDir, { recursive: true });
      const stylerJs = getHassSidebarStylerScript();
      fs2.writeFileSync(path2.join(wwwDir, "thassi-ui.js"), stylerJs, "utf-8");
      const loaderHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>html,body{margin:0;padding:0;background:#040711;overflow:hidden;}</style>
</head>
<body>
  <script>${stylerJs}
  try {
    if (window.top && window.top.location.pathname.startsWith('/lovelace')) {
      window.top.history.replaceState(null, '', '/44ec3c40_thassi_host');
      window.top.dispatchEvent(new CustomEvent('location-changed'));
    }
  } catch (e) {}
  </script>
</body>
</html>`;
      fs2.writeFileSync(path2.join(wwwDir, "thassi-loader.html"), loaderHtml, "utf-8");
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --text: #f8fafc;
      --text-soft: rgba(248, 250, 252, 0.72);
      --text-muted: rgba(248, 250, 252, 0.45);
      --accent: #38bdf8;
      --sun-glow: #fbbf24;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; user-select: none; }
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #040711;
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* 1. DYNAMIC DAYTIME SKY & CELESTIAL SUN STAGE */
    #sky-stage {
      position: fixed;
      inset: 0;
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

    /* Atmospheric horizon mist & glow */
    #horizon-glow {
      position: absolute;
      left: -10%;
      right: -10%;
      bottom: 18vh;
      height: 38vh;
      filter: blur(55px);
      opacity: 0.75;
      transition: background 1.2s ease, opacity 1.2s ease;
    }

    /* Delicate Solar Arc SVG Path */
    #solar-arc-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    /* The Rising & Setting Sun */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease;
      will-change: left, top;
    }
    .sun-core {
      position: absolute;
      width: 84px;
      height: 84px;
      left: -42px;
      top: -42px;
      border-radius: 50%;
      background: radial-gradient(circle, #ffffff 0%, #fef08a 38%, #fbbf24 72%, rgba(245, 158, 11, 0) 100%);
      box-shadow:
        0 0 60px 20px rgba(251, 191, 36, 0.65),
        0 0 140px 55px rgba(249, 115, 22, 0.42),
        0 0 260px 110px rgba(234, 88, 12, 0.24);
      animation: sunPulse 6s ease-in-out infinite alternate;
    }
    .sun-corona {
      position: absolute;
      width: 240px;
      height: 240px;
      left: -120px;
      top: -120px;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(254, 240, 138, 0.16) 20deg,
        transparent 45deg,
        rgba(251, 191, 36, 0.12) 90deg,
        transparent 130deg,
        rgba(254, 240, 138, 0.18) 180deg,
        transparent 220deg,
        rgba(251, 191, 36, 0.14) 275deg,
        transparent 320deg,
        rgba(254, 240, 138, 0.15) 350deg,
        transparent 360deg
      );
      filter: blur(8px);
      animation: rotateCorona 60s linear infinite;
    }
    @keyframes sunPulse {
      0% { transform: scale(0.96); }
      100% { transform: scale(1.05); }
    }
    @keyframes rotateCorona {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Nocturnal Moon (when sun is below horizon) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .moon-core {
      position: absolute;
      width: 46px;
      height: 46px;
      left: -23px;
      top: -23px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #f8fafc 0%, #cbd5e1 65%, #64748b 100%);
      box-shadow: 0 0 45px 12px rgba(186, 230, 253, 0.32), 0 0 110px 35px rgba(56, 189, 248, 0.14);
    }

    /* 2. MONUMENTAL DATE & TIME TYPOGRAPHY */
    #hero-clock-region {
      position: fixed;
      top: 5.5vh;
      left: 4.2vw;
      z-index: 15;
      pointer-events: none;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      line-height: 0.92;
    }
    #hero-time {
      font-size: clamp(5rem, 10.2vw, 9.4rem);
      font-weight: 200;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      text-shadow: 0 12px 45px rgba(0, 0, 0, 0.35);
    }
    #hero-seconds {
      font-size: clamp(1.4rem, 2.6vw, 2.4rem);
      font-weight: 300;
      color: rgba(255, 255, 255, 0.56);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #hero-date {
      margin-top: 10px;
      font-size: clamp(1.15rem, 1.9vw, 1.75rem);
      font-weight: 300;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    #solar-telemetry {
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }

    /* 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS */
    #top-right-widgets {
      position: fixed;
      top: 5.5vh;
      right: 4.2vw;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 22px;
      max-height: 60vh;
    }
    .ambient-widget {
      text-align: right;
      cursor: pointer;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s ease, padding 0.35s ease, backdrop-filter 0.35s ease;
      border: none;
      background: transparent;
      padding: 4px 0;
      border-radius: 20px;
      max-width: 390px;
    }
    .ambient-widget:hover:not(.expanded) {
      transform: translateX(-6px);
    }
    .ambient-widget.expanded {
      cursor: default;
      padding: 18px 22px;
      background: rgba(6, 10, 22, 0.56);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      transform: translateX(-4px);
      width: 340px;
    }
    .w-header {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
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
      color: rgba(255, 255, 255, 0.48);
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .w-primary {
      font-size: 18px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: #ffffff;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: baseline;
      gap: 10px;
      justify-content: flex-end;
    }
    .w-primary strong {
      font-weight: 500;
    }
    .w-sub {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.52);
      font-weight: 400;
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

    /* 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER */
    #timeline-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 46px;
      height: 31vh;
      min-height: 220px;
      z-index: 20;
      background: linear-gradient(
        to top,
        rgba(3, 6, 15, 0.88) 0%,
        rgba(5, 10, 24, 0.58) 55%,
        rgba(5, 10, 24, 0.0) 100%
      );
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    /* Whisper-quiet minimal controls right above the timeline */
    #timeline-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4.2vw 6px 4.2vw;
      font-size: 11px;
      letter-spacing: 0.08em;
    }
    .tl-controls {
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0.42;
      transition: opacity 0.25s ease;
    }
    .tl-controls:hover {
      opacity: 0.95;
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
      height: calc(31vh - 28px);
      min-height: 192px;
      overflow: hidden;
      cursor: grab;
    }
    #timeline-viewport:active { cursor: grabbing; }

    /* Fixed "NOW" Marker at 22% from left */
    #fixed-now-marker {
      position: absolute;
      left: 22vw;
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

    /* Horizontal Axis Line */
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 38px;
      height: 1px;
      background: rgba(255, 255, 255, 0.14);
      pointer-events: none;
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
      color: rgba(255, 255, 255, 0.38);
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 180px;
      margin-top: -142px;
      background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.38));
    }
    .tl-tick.day-start .tl-tick-label {
      color: #38bdf8;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10.5px;
    }

    /* 4. GOOGLE CALENDAR EVENT RECTANGLES ON THE TIMELINE */
    .tl-event-rect {
      position: absolute;
      height: 44px;
      border-radius: 10px;
      padding: 6px 12px;
      background: rgba(12, 19, 36, 0.62);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-left: 2.5px solid var(--ev-color, #38bdf8);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.22s ease, box-shadow 0.22s ease;
    }
    .tl-event-rect:hover {
      transform: translateY(-3px) scale(1.01);
      background: rgba(24, 35, 58, 0.85);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), 0 0 20px var(--ev-glow, rgba(56, 189, 248, 0.25));
      z-index: 18;
    }
    .tl-event-rect.is-now {
      background: rgba(14, 116, 144, 0.42);
      box-shadow: 0 0 28px rgba(56, 189, 248, 0.35);
    }
    .tl-event-rect.is-past {
      opacity: 0.45;
    }
    .tl-ev-title {
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }
    .tl-ev-meta {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.56);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    /* Quick Event Creator Popover */
    #quick-event-modal {
      position: fixed;
      bottom: 35vh;
      right: 4.2vw;
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

    /* 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR BELOW TIMELINE */
    #room-dock-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 46px;
      z-index: 28;
      background: rgba(3, 6, 15, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4.2vw;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    #room-dock-bar::-webkit-scrollbar { display: none; }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .room-pill {
      background: transparent;
      border: none;
      border-radius: 99px;
      padding: 6px 13px;
      color: rgba(248, 250, 252, 0.56);
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.22s ease, background 0.22s ease, transform 0.2s ease;
    }
    .room-pill:hover {
      color: rgba(248, 250, 252, 0.92);
      background: rgba(255, 255, 255, 0.045);
    }
    .room-pill.active-flyout {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.13);
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.88);
    }
    .room-dot {
      width: 5.5px;
      height: 5.5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.22);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .room-pill.has-on .room-dot {
      background: #fbbf24;
      box-shadow: 0 0 9px rgba(251, 191, 36, 0.85);
    }
    .room-pill.has-motion .room-dot {
      background: #4ade80;
      box-shadow: 0 0 9px rgba(74, 222, 128, 0.85);
    }
    .room-meta {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.36);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.78);
    }

    /* Upward Glassmorphic Room Flyout */
    #room-flyout {
      position: fixed;
      bottom: 54px;
      left: 4.2vw;
      z-index: 45;
      width: 340px;
      max-width: 92vw;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(32px) saturate(150%);
      -webkit-backdrop-filter: blur(32px) saturate(150%);
      border-radius: 22px;
      padding: 18px 20px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: flyoutRise 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes flyoutRise {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .rf-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 4px;
    }
    .rf-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .rf-subtitle {
      font-size: 11px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .rf-dev-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 44vh;
      overflow-y: auto;
    }
    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 9px 12px;
      border-radius: 13px;
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
      gap: 10px;
    }
    .rf-dev-label {
      font-size: 12.5px;
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
      gap: 8px;
    }
    .rf-power-badge {
      font-size: 10.5px;
      color: rgba(248, 250, 252, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: none;
      border-radius: 99px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 252, 0.65);
    }
    .rf-toggle-btn.on {
      background: #fbbf24;
      color: #040711;
      box-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
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
      gap: 5px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: none;
      border-radius: 99px;
      padding: 2px 8px;
      font-size: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: #a855f7;
      color: #fff;
    }
  </style>
</head>
<body>
  <!-- 1. LIVING DAYTIME SKY & CELESTIAL SUN -->
  <div id="sky-stage">
    <div id="starfield"></div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none">
      <path id="solar-arc-path" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4 6" />
      <path id="solar-day-path" fill="none" stroke="rgba(251,191,36,0.18)" stroke-width="1.4" />
    </svg>
    <div id="moon-assembly">
      <div class="moon-core"></div>
    </div>
    <div id="sun-assembly">
      <div class="sun-corona"></div>
      <div class="sun-core"></div>
    </div>
  </div>

  <!-- 2. LARGE DATE & TIME IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date"></div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>
  </div>

  <!-- 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS: (health), (finances), (notes), (meals) -->
  <div id="top-right-widgets">
    <!-- HEALTH WIDGET -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>health</span>
          <span class="w-dot" id="dot-health" style="background:#4ade80; box-shadow:0 0 10px #4ade80;"></span>
        </div>
        <div class="w-primary" id="compact-health">--</div>
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
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Open Health \u2192</button>
      </div>
    </div>

    <!-- FINANCES WIDGET (HIDDEN BY DEFAULT, CLICK TO TOGGLE VISIBILITY, CONFIGURABLE ELEMENTS + QUICK IMPORT) -->
    <div class="ambient-widget" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row" style="gap:8px;">
          <span>thassi.finances</span>
          <button id="finances-eye-btn"
                  onclick="toggleFinancesVisibility(event)"
                  title="Klicken, um Finanzdaten ein-/auszublenden"
                  style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#cbd5e1; border-radius:99px; padding:1px 7px; font-size:9.5px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
            \u{1F512} versteckt
          </button>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7;"></span>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">\u{1F512} \u2022\u2022\u2022\u2022 \u20AC</div>
        <div class="w-sub" id="sub-finances">Klick auf \u{1F512} zum Anzeigen \xB7 Sparkasse George</div>
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

    <!-- NOTES WIDGET -->
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

    <!-- MEALS WIDGET -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>meals</span>
          <span class="w-dot" id="dot-meals" style="background:#fb923c; box-shadow:0 0 10px #fb923c;"></span>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12.5px; color:rgba(255,255,255,0.85); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Open Meals \u2192</button>
      </div>
    </div>

    <!-- 3D DRUCK MINI-PREVIEW WIDGET (MINIATURE 3D OBJECT + PROGRESS BAR + PLACEHOLDER) -->
    <div class="ambient-widget" id="widget-3dprint" onclick="toggleWidget('3dprint', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>3d druck \xB7 bambulab</span>
          <span class="w-dot" id="dot-3dprint" style="background:#00AE42; box-shadow:0 0 10px #00AE42;"></span>
        </div>
        <div style="display:flex; align-items:center; justify-content:flex-end; gap:12px; margin-top:2px;">
          <div style="position:relative; width:82px; height:64px; border-radius:12px; background:rgba(4,7,17,0.72); border:1px solid rgba(56,189,248,0.22); overflow:hidden; flex-shrink:0;"
               title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)"
               onclick="event.stopPropagation()">
            <canvas id="mini-3d-canvas" width="164" height="128" style="width:82px; height:64px; display:block; cursor:grab; touch-action:none;"></canvas>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; min-width:145px;">
            <div class="w-primary" id="compact-3dprint" style="font-size:15.5px;">Kein Projekt aktiv</div>
            <div class="w-sub" id="sub-3dprint">Platzhalter \xB7 0% Leerlauf</div>
            <div style="width:100%; height:5px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:6px;">
              <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #00AE42, #38bdf8); transition:width 0.35s ease;"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
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
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Sparkasse George Auto-Login, Cookie-Tresor & automatischer Datei-Import</div>
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
          \u26A1 George Export herunterladen & Auto-Import
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

      <!-- Continuously moving timeline track -->
      <div id="timeline-world">
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </div>

  <!-- 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR & UPWARD FLYOUT -->
  <div id="room-flyout" onclick="event.stopPropagation()"></div>
  <div id="room-dock-bar">
    <div class="room-dock-group" id="room-pills-container"></div>
    <div style="display:flex; align-items:center; gap:6px;">
      <button class="room-pill" onclick="openFullService('3d-print', '3D Druck Studio')" title="3D Druck Editor & BambuLab Steuerung \xF6ffnen">
        <span class="room-dot" id="print3d-dock-dot" style="background:#00AE42; box-shadow:0 0 8px #00AE42;"></span>
        <span>3D Druck</span>
        <span class="room-meta" id="print3d-dock-meta">Bambu P1S</span>
      </button>
      <button class="room-pill" onclick="openFullService('camera-vision', 'Camera Vision')" title="Kamera-Objekterkennung & Streams \xF6ffnen">
        <span class="room-dot" id="vision-dock-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
        <span>Vision AI</span>
        <span class="room-meta" id="vision-dock-meta">Zyklisch</span>
      </button>
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

    const base = (
      window.__THASSI_INGRESS_PATH__ ||
      ((window.location.pathname || '').match(/^(/api/hassio_ingress/[^/]+)/) || [])[1] ||
      ''
    ).replace(//+$/, '');
    const NOW_ANCHOR_RATIO = 0.22;

    let calendarEvents = [];
    let roomsData = [];
    let visionSummaryData = null;
    let activeRoomFlyoutId = null;
    let visibleHoursSpan = 24;
    let panOffsetMs = 0;
    let timelineBaseEpochMs = Date.now();

    // Generate twinkling stars once
    (function initStars() {
      const sf = document.getElementById('starfield');
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

    // 1. SOLAR POSITION & SKY COLOR ENGINE
    const SUNRISE_HOUR = 6.75; // 06:45
    const SUNSET_HOUR = 18.5;  // 18:30

    function getSkyPalette(h) {
      if (h < 5.2 || h >= 21.2) {
        return {
          sky: 'linear-gradient(180deg, #02040a 0%, #070d1f 48%, #0f172a 78%, #172554 100%)',
          sidebarBg: 'linear-gradient(180deg, #02040a 0%, #060b1a 55%, #03060f 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.18), transparent 70%)',
          stars: 0.9,
          phase: 'Astronomical Night'
        };
      }
      if (h < 6.5) {
        return {
          sky: 'linear-gradient(180deg, #090d1e 0%, #1e1b4b 42%, #6d28d9 74%, #f97316 100%)',
          sidebarBg: 'linear-gradient(180deg, #070a18 0%, #131130 60%, #060813 100%)',
          glow: 'radial-gradient(ellipse at 25% 100%, rgba(251, 146, 60, 0.65), transparent 72%)',
          stars: 0.45,
          phase: 'Dawn Twilight'
        };
      }
      if (h < 8.0) {
        return {
          sky: 'linear-gradient(180deg, #1d4ed8 0%, #3b82f6 42%, #f472b6 75%, #fbbf24 100%)',
          sidebarBg: 'linear-gradient(180deg, #0c1f5e 0%, #172554 60%, #060b19 100%)',
          glow: 'radial-gradient(ellipse at 22% 100%, rgba(253, 224, 71, 0.8), transparent 75%)',
          stars: 0.05,
          phase: 'Golden Sunrise'
        };
      }
      if (h < 16.5) {
        return {
          sky: 'linear-gradient(180deg, #0369a1 0%, #0284c7 45%, #38bdf8 80%, #bae6fd 100%)',
          sidebarBg: 'linear-gradient(180deg, #042f4e 0%, #073b61 55%, #040917 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(254, 249, 195, 0.45), transparent 75%)',
          stars: 0,
          phase: h < 11.5 ? 'Morning Sky' : h < 14 ? 'Solar Noon' : 'Afternoon Sun'
        };
      }
      if (h < 18.8) {
        return {
          sky: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 36%, #c2410c 72%, #facc15 100%)',
          sidebarBg: 'linear-gradient(180deg, #0f0e29 0%, #1e1b4b 58%, #060814 100%)',
          glow: 'radial-gradient(ellipse at 78% 100%, rgba(251, 146, 60, 0.85), transparent 75%)',
          stars: 0.15,
          phase: 'Golden Hour'
        };
      }
      return {
        sky: 'linear-gradient(180deg, #050814 0%, #1e1b4b 46%, #4c1d95 76%, #9a3412 100%)',
        sidebarBg: 'linear-gradient(180deg, #040711 0%, #110f2b 58%, #04060f 100%)',
        glow: 'radial-gradient(ellipse at 82% 100%, rgba(234, 88, 12, 0.45), transparent 70%)',
        stars: 0.65,
        phase: 'Dusk Twilight'
      };
    }

    function computeSunPoint(hourFloat, vw, vh) {
      const horizonY = vh * 0.65;
      const zenithY = vh * 0.12;
      const nadirY = vh * 0.82;

      const x = vw * (0.06 + (hourFloat / 24) * 0.88);
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const angle = ((hourFloat - SUNRISE_HOUR) / daySpan) * Math.PI;
      const sinVal = Math.sin(angle);
      const y = sinVal >= 0
        ? horizonY - sinVal * (horizonY - zenithY)
        : horizonY - sinVal * (nadirY - horizonY);

      return { x, y, aboveHorizon: sinVal >= -0.08, elevationPct: Math.round(sinVal * 100) };
    }

    function renderSolarArcPaths() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let fullPath = '';
      let dayPath = '';
      for (let h = 0; h <= 24; h += 0.25) {
        const pt = computeSunPoint(h, vw, vh);
        fullPath += (h === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
          dayPath += (dayPath === '' ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        }
      }
      document.getElementById('solar-arc-path').setAttribute('d', fullPath);
      document.getElementById('solar-day-path').setAttribute('d', dayPath);
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

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sunPt = computeSunPoint(effectiveHour, vw, vh);

      const sunEl = document.getElementById('sun-assembly');
      sunEl.style.left = sunPt.x.toFixed(1) + 'px';
      sunEl.style.top = sunPt.y.toFixed(1) + 'px';
      sunEl.style.opacity = sunPt.aboveHorizon ? '1' : '0.28';

      const moonHour = (effectiveHour + 12) % 24;
      const moonPt = computeSunPoint(moonHour, vw, vh);
      const moonEl = document.getElementById('moon-assembly');
      moonEl.style.left = moonPt.x.toFixed(1) + 'px';
      moonEl.style.top = moonPt.y.toFixed(1) + 'px';
      moonEl.style.opacity = sunPt.aboveHorizon ? '0' : '0.92';

      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  \xB7  Sunrise 06:45  \xB7  Sunset 18:30\`;
    }

    // 2. LARGE CLOCK & CONTINUOUS LEFTWARD TIMELINE LOOP
    function getPxPerMs() {
      return window.innerWidth / (visibleHoursSpan * 3600 * 1000);
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

    // 3 & 4. RENDER TIMELINE TICKS & GOOGLE CALENDAR EVENT RECTANGLES
    function renderTimelineGeometry() {
      const nowMs = Date.now();
      timelineBaseEpochMs = nowMs;
      const pxPerMs = getPxPerMs();

      const startSpanMs = nowMs - 36 * 3600 * 1000;
      const endSpanMs = nowMs + 8 * 24 * 3600 * 1000;

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
        const widthPx = Math.max(135, rawWidthPx);

        let lane = 0;
        for (let l = 0; l < laneEndPx.length; l++) {
          if (leftPx >= laneEndPx[l] + 8) {
            lane = l;
            break;
          }
          if (l === laneEndPx.length - 1) lane = l;
        }
        laneEndPx[lane] = leftPx + widthPx;

        const bottomPx = 48 + lane * 52;
        const pal = catPalette[ev.category] || catPalette.personal;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${pal.border}; --ev-glow:\${pal.glow};"
               title="\${ev.title.replace(/"/g, '&quot;')} (\${dayStr}, \${startStr} \u2013 \${endStr}) \xB7 \${ev.calendar_name || 'Google Calendar'}">
            <div class="tl-ev-title">\${ev.title}</div>
            <div class="tl-ev-meta">\${startStr}\u2013\${endStr} \xB7 \${ev.calendar_name || ev.category}</div>
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
      const isAlreadyOpen = target.classList.contains('expanded');
      document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      if (!isAlreadyOpen) {
        target.classList.add('expanded');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ambient-widget')) {
        document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      }
      if (!e.target.closest('#room-flyout') && !e.target.closest('.room-pill')) {
        closeRoomFlyout();
      }
    });

    function closeRoomFlyout() {
      activeRoomFlyoutId = null;
      const flyout = document.getElementById('room-flyout');
      if (flyout) flyout.style.display = 'none';
      document.querySelectorAll('.room-pill').forEach((p) => p.classList.remove('active-flyout'));
    }

    function openRoomFlyout(roomId, ev) {
      if (ev) ev.stopPropagation();
      if (activeRoomFlyoutId === roomId) {
        closeRoomFlyout();
        return;
      }
      activeRoomFlyoutId = roomId;
      renderRoomDockBar();

      const flyout = document.getElementById('room-flyout');
      const pillEl = document.getElementById('room-pill-' + roomId);
      if (pillEl && flyout) {
        const rect = pillEl.getBoundingClientRect();
        const maxLeft = Math.max(16, window.innerWidth - 360);
        const targetLeft = Math.min(maxLeft, Math.max(16, rect.left));
        flyout.style.left = targetLeft + 'px';
      }
      renderActiveRoomFlyout();
    }

    function renderRoomDockBar() {
      const container = document.getElementById('room-pills-container');
      if (!container) return;

      container.innerHTML = roomsData
        .map((r) => {
          const hasOn = r.activeCount > 0;
          const hasMotion = Boolean(r.motionActive);
          const isActive = activeRoomFlyoutId === r.id;

          const metaParts = [];
          if (r.tempC != null) metaParts.push(r.tempC.toFixed(1) + '\xB0');
          if (r.activeCount > 0) metaParts.push(r.activeCount + ' an');
          if (r.totalPowerW > 0.5) metaParts.push(Math.round(r.totalPowerW) + 'W');
          if (hasMotion) metaParts.push('Bewegung');
          if (r.id === 'kameras_vision') {
            metaParts.push(
              visionSummaryData?.lastTotalObjects
                ? visionSummaryData.lastTotalObjects + ' Obj'
                : r.devices.length + ' Cams'
            );
          }

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isActive ? 'active-flyout' : ''}"
                    onclick="openRoomFlyout('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${metaParts.length > 0 ? \`<span class="room-meta">\${metaParts.join(' \xB7 ')}</span>\` : ''}
            </button>
          \`;
        })
        .join('');

      const vMeta = document.getElementById('vision-dock-meta');
      if (vMeta && visionSummaryData) {
        vMeta.textContent = visionSummaryData.lastSceneSummary
          ? (visionSummaryData.lastTotalObjects || 0) + ' Objekte'
          : 'Zyklisch';
      }
    }

    function renderActiveRoomFlyout() {
      const flyout = document.getElementById('room-flyout');
      if (!flyout || !activeRoomFlyoutId) return;
      const room = roomsData.find((r) => r.id === activeRoomFlyoutId);
      if (!room) {
        closeRoomFlyout();
        return;
      }

      const subParts = [];
      if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + ' \xB0C');
      if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
      if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');

      const rowsHtml = room.devices
        .map((d) => {
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

          // Sensor row
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
        })
        .join('');

      const footerHtml =
        room.id === 'kameras_vision'
          ? \`
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
              <span style="font-size:11px; color:rgba(255,255,255,0.48);">
                \${visionSummaryData?.lastSceneSummary ? visionSummaryData.lastSceneSummary.slice(0, 36) : 'Lokales COCO-SSD aktiv'}
              </span>
              <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('camera-vision', 'Camera Vision')">
                Vision \xF6ffnen \u2192
              </button>
            </div>
          \`
          : room.activeCount > 0
            ? \`
              <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="turnOffAllInRoom('\${room.id}')">
                  Alle im Raum ausschalten
                </button>
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Canvas \u2192
                </button>
              </div>
            \`
            : \`
              <div style="display:flex; justify-content:flex-end; padding-top:4px;">
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Smart Canvas \u2192
                </button>
              </div>
            \`;

      flyout.innerHTML = \`
        <div class="rf-header">
          <span class="rf-title">\${room.name}</span>
          <span class="rf-subtitle">\${subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')}</span>
        </div>
        <div class="rf-dev-list">\${rowsHtml}</div>
        \${footerHtml}
      \`;
      flyout.style.display = 'flex';
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
        if (activeRoomFlyoutId) {
          renderActiveRoomFlyout();
        }
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function openFullService(appId, title, hash) {
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/' + (hash || '');
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
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

      if (fallbackSummary) {
        financesDashData = {
          kpis: {
            activeMonth: fallbackSummary.activeMonth || 'Aktuell',
            currentBalance: 4850,
            accountName: 'Sparkasse George Girokonto',
            expensesDay: 0,
            expensesWeek: 0,
            income: fallbackSummary.income || 0,
            expenses: fallbackSummary.expenses || 0,
            net: fallbackSummary.netCashflow || 0,
          },
          balanceConfig: {
            currentBalance: 4850,
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
    }

    function renderFinancesPreviewWidget() {
      const d = financesDashData;
      const compactEl = document.getElementById('compact-finances');
      const subEl = document.getElementById('sub-finances');
      const eyeBtn = document.getElementById('finances-eye-btn');
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

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
        eyeBtn.innerHTML = financesHidden ? '\u{1F512} versteckt' : '\u{1F441}\uFE0F sichtbar';
        eyeBtn.style.color = financesHidden ? '#fbbf24' : '#34d399';
        eyeBtn.style.borderColor = financesHidden ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.35)';
      }
      if (toggleLink) {
        toggleLink.innerHTML = financesHidden ? '\u{1F441}\uFE0F Zahlen anzeigen' : '\u{1F512} Zahlen verbergen';
      }

      // Primary headline
      if (financesHidden) {
        compactEl.innerHTML = '<strong>\u{1F512} \u2022\u2022\u2022\u2022 \u20AC</strong>';
        subEl.textContent = 'Klick zum Anzeigen \xB7 ' + accountName;
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
        subEl.textContent = headlineSub;
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

    async function loadAllLiveData() {
      try {
        void loadRoomsQuickAccess();
        const [sysRes, calRes] = await Promise.all([
          fetch(base + '/api/system/status'),
          fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null)
        ]);
        const sys = await sysRes.json();
        const calData = calRes && calRes.ok ? await calRes.json() : { events: [] };

        calendarEvents = calData.events || [];
        renderTimelineGeometry();

        // 1. Update HEALTH widget
        const h = sys.summaries?.health;
        if (h && (h.steps != null || h.currentHr != null)) {
          const stepsTxt = h.steps != null ? Number(h.steps).toLocaleString() + ' steps' : 'No steps';
          const hrTxt = h.currentHr != null ? h.currentHr + ' bpm' : '';
          document.getElementById('compact-health').innerHTML = \`<strong>\${stepsTxt}</strong> \${hrTxt ? '\xB7 ' + hrTxt : ''}\`;
          document.getElementById('sub-health').textContent =
            h.readinessScore != null ? \`\${h.readinessScore}% readiness \xB7 \${h.readinessStatus || 'Pixel 10'}\` : (h.source || 'Pixel 10');
          document.getElementById('eh-steps').textContent = h.steps != null ? Number(h.steps).toLocaleString() : 'No data';
          document.getElementById('eh-ready').textContent = h.readinessScore != null ? h.readinessScore + '/100' : 'No data';
          document.getElementById('eh-hr').textContent = h.currentHr != null ? h.currentHr + ' bpm' : 'No data';
          document.getElementById('eh-rhr').textContent =
            (h.restingHr != null ? h.restingHr + ' bpm' : '--') + ' / ' + (h.hrvMs != null ? h.hrvMs + ' ms' : '--');
          document.getElementById('eh-sleep').textContent = h.sleepHours != null ? h.sleepHours + ' h' : 'No data';
          document.getElementById('eh-burn').textContent =
            (h.activeCalories != null ? h.activeCalories + ' kcal' : '--') + ' \xB7 ' + (h.distanceKm != null ? h.distanceKm + ' km' : '--');
        } else {
          document.getElementById('compact-health').textContent = 'No data';
          document.getElementById('sub-health').textContent = 'Waiting for Pixel 10 telemetry';
        }

        // 2. Update FINANCES widget (Configurable preview, hidden by default)
        await refreshFinancesWidget(sys.summaries?.finance);

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
        const m = sys.summaries?.meals;
        if (m && (m.breakfast || m.lunch || m.dinner)) {
          const nextMeal = m.dinner || m.lunch || m.breakfast;
          document.getElementById('compact-meals').innerHTML = \`<strong>\${nextMeal}</strong>\`;
          document.getElementById('sub-meals').textContent = \`\${m.totalCalories || 0} kcal planned today\`;
          document.getElementById('em-slots').innerHTML = \`
            <div>\u{1F305} <strong>Breakfast:</strong> \${m.breakfast || '\u2014'}</div>
            <div>\u2600\uFE0F <strong>Lunch:</strong> \${m.lunch || '\u2014'}</div>
            <div>\u{1F319} <strong>Dinner:</strong> \${m.dinner || '\u2014'}</div>
          \`;
        } else {
          document.getElementById('compact-meals').textContent = 'Unplanned';
          document.getElementById('sub-meals').textContent = 'No meals logged for today';
          document.getElementById('em-slots').innerHTML = 'No meals planned for today yet.';
        }

        // 5. Update 3D PRINT Mini-Preview Widget
        await refreshMini3dData(sys.summaries?.print3d);
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

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
    });

    renderSolarArcPaths();
    initMini3dCanvas();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    setInterval(loadAllLiveData, 60000);
    setInterval(() => refreshMini3dData(), 5000);
    setInterval(loadRoomsQuickAccess, 12000);

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
import fs3 from "node:fs";
import path3 from "node:path";
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
    if (!fs3.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs3.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path3.extname(entry.name).toLowerCase();
      if (![".csv", ".xml", ".sta", ".mt940"].includes(ext)) continue;
      const isBankExportName = /^AT\d{2}/i.test(entry.name) || /george|sparkasse|kontoauszug|umsatz|umsaetze|export|camt|mt940|elba|bawag|flatex/i.test(
        entry.name
      );
      if (!isBankExportName) continue;
      const fullPath = path3.join(dir, entry.name);
      let stat;
      try {
        stat = fs3.statSync(fullPath);
      } catch {
        continue;
      }
      const fileKey = `${entry.name}:${stat.size}`;
      const mtimeMs = Math.floor(stat.mtimeMs);
      if (processedMap[fileKey] && processedMap[fileKey] >= mtimeMs) {
        continue;
      }
      try {
        const rawBuf = fs3.readFileSync(fullPath);
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
