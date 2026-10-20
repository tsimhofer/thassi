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
      fs.writeFileSync(path.join(wwwDir, 'thassi-loader.html'), loaderHtml, 'utf-8');
      console.log(`[Thassi] Synced /local/thassi-ui.js and /local/thassi-loader.html to ${wwwDir}`);
    } catch (err) {
      console.warn('[Thassi] Could not write to www dir:', err);
    }
  }
}
