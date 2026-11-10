# Thassi Workspace Rules for Antigravity Agents

These rules are mandatory for every task in the `thassi` repository (`c:\Users\thoma\source\repos\thassi`).

---

## 1. Mandatory Navigation Registration for Every New Page / App

Whenever the user asks to **add a new page, app, or module** in Thassi, you **MUST** ensure it is registered and verified in the Home Assistant Sidebar Navigation and Horizon Dashboard **before finishing your turn**:

1. **App Manifest (`apps/<app-id>/thassi.app.json`)**:
   - Define `id`, `name` (the exact sidebar title), `version`, `description`, `icon` (valid `mdi:*` icon, e.g., `mdi:chart-box-outline`), and `category`.
2. **Home Assistant Sidebar & Horizon Sync**:
   - Ensure the app is included in [`thassi_host/src/hass-sidebar-sync.ts`](thassi_host/src/hass-sidebar-sync.ts) (`STATIC_CUSTOM_APPS` & `order` array, in addition to the automatic `window.__THASSI_DEPLOYED_APPS__` loop) and [`thassi_host/src/ambient-dashboard.ts`](thassi_host/src/ambient-dashboard.ts) (`SIDEBAR_APP_TITLES` & statusbar dock if appropriate).
3. **Deploy via CLI (Auto-Syncs Host & Sidebar)**:
   - Run `npx.cmd tsx packages/cli/src/index.ts deploy <app-id>`.
   - The CLI `deploy` command automatically bundles the app, hot-deploys it to `http://192.168.188.92:8099/api/system/deploy`, rebuilds `thassi_host/dist/server.mjs`, and posts it to `/api/apps/system-monitor/sync-host-bundle` so the live Home Assistant sidebar and Horizon host update immediately.
   - If you modified `thassi_host/src/hass-sidebar-sync.ts` or `thassi_host/src/ambient-dashboard.ts`, also run `npx.cmd tsx packages/cli/src/index.ts deploy system-monitor` so the in-memory `http.Server.prototype.emit` interceptor (`installLiveHostAndSidebarSync`) refreshes immediately.
4. **Live Verification (Mandatory Check)**:
   - Verify with `Invoke-WebRequest -Uri "http://192.168.188.92:8099/" -UseBasicParsing` that the live HTML response contains the new `<app-id>` in `window.__THASSI_DEPLOYED_APPS__` and `thassi-nav-<app-id>`. Never claim a page is registered in nav without verifying the live response from `:8099`.

---

## 2. Mandatory UI & Visual Design (`DESIGN.md`)

All Thassi apps (`apps/*/frontend/src/*`) **MUST** strictly follow [`DESIGN.md`](DESIGN.md):

- **Surface Palette**:
  - Canvas background: `#09090b` (`--bg-canvas`)
  - Elevated / hover surface: `#111113` (`--bg-elevated`)
  - Input / control background: `#141417` (`--bg-input`)
  - Hairline dividers: `1px solid rgba(255, 255, 255, 0.06)` (`--line-hairline`)
- **Typography**:
  - UI & prose: `Inter` (`#fafafa` primary, `#a1a1aa` secondary, `#52525b` muted)
  - All numbers, amounts, timestamps, latencies, and IDs: `JetBrains Mono` with `font-variant-numeric: tabular-nums`
- **No Visual Bloat**:
  - **Zero emojis** in UI chrome, headers, tabs, or buttons.
  - **Zero decorative gradients**, neon glows, or heavy drop-shadows.
  - **No "card soup"**: Use continuous `1px` hairline grids, top 4-column KPI strips, and clean text-link tabs (`border-bottom: 1px solid #fafafa` when active) so pages are never overloaded.
- **Explicit Data Freshness & User Action Required Strip**:
  - Every page that relies on sensors, APIs, or external syncs **MUST** display in its header/status strip:
    1. How recent the data is (exact timestamp + relative age, e.g., `Stand: 23:45:12 (vor 10s)`).
    2. Whether user input or configuration is required (with `6px` semantic status dots: `#10b981` nominal, `#f59e0b` warning/action needed, `#ef4444` error, and a direct button to the relevant setup tab or `/apps/cortex/?tab=vault`).

---

## 3. Centralized Credentials & Shared Database (`/data/shared.db`)

- Shared credentials (`gemini_api_key`, `google_oauth_config`, `google_oauth_tokens`, `bambu_printer_config`, `github_token`) live in `ctx.sharedDb` (`/data/shared.db`) and are managed via the Cortex Credentials Vault (`/apps/cortex/?tab=vault`).
- New apps requiring Gemini, Google OAuth2, GitHub, or Bambu credentials must read from `ctx.sharedDb` first before falling back to app-local `ctx.db` or environment variables.
