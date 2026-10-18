import fs from 'node:fs';
import path from 'node:path';

/**
 * Returns the client-side JS snippet that styles Home Assistant's parent
 * `ha-sidebar`, `ha-drawer`, and `hui-root` (same-origin via Ingress or /local/)
 * to seamlessly match the borderless Thassi Ambient Horizon design.
 */
export function getHassSidebarStylerScript(): string {
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
          items.forEach((el) => {
            const raw = (el.textContent || '').trim();
            if (LABEL_MAP[raw]) {
              el.textContent = LABEL_MAP[raw];
            }
          });
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

/**
 * Writes `/local/thassi-loader.html` and `/local/thassi-ui.js` into `/homeassistant/www/`
 * if `homeassistant_config:rw` is mounted, so even `/lovelace/default_view` is 100% same-origin
 * and styles the Home Assistant sidebar immediately.
 */
export function syncHassFrontendFiles(): void {
  const candidateConfigDirs = ['/homeassistant', '/config'];
  for (const cfgDir of candidateConfigDirs) {
    if (!fs.existsSync(path.join(cfgDir, 'configuration.yaml'))) continue;

    try {
      const wwwDir = path.join(cfgDir, 'www');
      fs.mkdirSync(wwwDir, { recursive: true });

      const stylerJs = getHassSidebarStylerScript();
      fs.writeFileSync(path.join(wwwDir, 'thassi-ui.js'), stylerJs, 'utf-8');

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
      fs.writeFileSync(path.join(wwwDir, 'thassi-loader.html'), loaderHtml, 'utf-8');
      console.log(`[Thassi] Synced /local/thassi-ui.js and /local/thassi-loader.html to ${wwwDir}`);
    } catch (err) {
      console.warn('[Thassi] Could not write to www dir:', err);
    }
  }
}
