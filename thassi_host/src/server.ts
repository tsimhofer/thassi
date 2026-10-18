import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  ThassiAppDatabase,
  ThassiHaBridge,
  ThassiCronScheduler,
  ThassiGoogleOAuthManager,
  type ThassiAppManifest,
  type ThassiAppContext,
  type ThassiRouteHandler,
  type ThassiBackendModule,
} from '../../packages/sdk/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT || 8099);
const DATA_DIR = path.resolve(
  process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
);
const STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || '';

fs.mkdirSync(path.join(DATA_DIR, 'apps'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'deployed_apps'), { recursive: true });

// Remove legacy starter 'data-workbench' if it was previously deployed to /data/deployed_apps
const legacyStarterDir = path.join(DATA_DIR, 'deployed_apps', 'data-workbench');
if (fs.existsSync(legacyStarterDir)) {
  fs.rmSync(legacyStarterDir, { recursive: true, force: true });
}

const sharedDb = new ThassiAppDatabase(path.join(DATA_DIR, 'shared.db'));
const scheduler = new ThassiCronScheduler();
const googleOAuth = new ThassiGoogleOAuthManager(sharedDb);
const systemHaBridge = new ThassiHaBridge('hub', sharedDb);

interface LoadedAppInstance {
  manifest: ThassiAppManifest;
  source: 'built-in' | 'hot-deployed';
  frontendDir: string;
  db: ThassiAppDatabase;
  ha: ThassiHaBridge;
  routes: Map<string, ThassiRouteHandler>;
  updatedAt: string;
}

const loadedApps = new Map<string, LoadedAppInstance>();

async function loadAppFromDirectory(
  appDir: string,
  source: 'built-in' | 'hot-deployed'
): Promise<void> {
  const manifestPath = path.join(appDir, 'thassi.app.json');
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ThassiAppManifest;
  const appId = manifest.id;
  if (appId === 'data-workbench') return;

  scheduler.clearAppJobs(appId);
  const existing = loadedApps.get(appId);
  const appDb = existing?.db || new ThassiAppDatabase(path.join(DATA_DIR, 'apps', `${appId}.db`));
  const appHa = new ThassiHaBridge(appId, sharedDb);
  const routes = new Map<string, ThassiRouteHandler>();

  const ctx: ThassiAppContext = {
    appId,
    db: appDb,
    sharedDb,
    ha: appHa,
    google: googleOAuth,
    scheduleJob: (job) => scheduler.registerJob(appId, job),
    route: (method, routePath, handler) => {
      const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
      routes.set(`${method.toUpperCase()} ${normalized}`, handler);
    },
  };

  const compiledBackend = path.join(appDir, 'backend.mjs');
  const devBackend = path.join(appDir, 'backend', 'index.ts');
  const backendFile = fs.existsSync(compiledBackend)
    ? compiledBackend
    : fs.existsSync(devBackend)
      ? devBackend
      : null;

  if (backendFile) {
    const fileUrl = `${pathToFileURL(backendFile).href}?t=${Date.now()}`;
    const mod = (await import(fileUrl)) as { default?: ThassiBackendModule };
    if (mod.default && typeof mod.default.setup === 'function') {
      await mod.default.setup(ctx);
    }
  }

  const distFrontend = path.join(appDir, 'frontend');
  loadedApps.set(appId, {
    manifest,
    source,
    frontendDir: distFrontend,
    db: appDb,
    ha: appHa,
    routes,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[Thassi] Loaded app "${manifest.name}" (${appId}) [${source}]`);
}

async function discoverAllApps(): Promise<void> {
  const candidateBuiltInDirs = [
    path.join(__dirname, 'apps'),
    path.resolve(process.cwd(), 'thassi_host', 'dist', 'apps'),
    path.resolve(process.cwd(), 'apps'),
  ];

  for (const baseDir of candidateBuiltInDirs) {
    if (!fs.existsSync(baseDir)) continue;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'data-workbench') {
        const appDir = path.join(baseDir, entry.name);
        if (!loadedApps.has(entry.name)) {
          try {
            await loadAppFromDirectory(appDir, 'built-in');
          } catch (err) {
            console.error(`[Thassi] Error loading built-in app ${entry.name}:`, err);
          }
        }
      }
    }
  }

  const deployedBase = path.join(DATA_DIR, 'deployed_apps');
  if (fs.existsSync(deployedBase)) {
    for (const entry of fs.readdirSync(deployedBase, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'data-workbench') {
        try {
          await loadAppFromDirectory(path.join(deployedBase, entry.name), 'hot-deployed');
        } catch (err) {
          console.error(`[Thassi] Error loading hot-deployed app ${entry.name}:`, err);
        }
      }
    }
  }
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {}
) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Thassi-Secret',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveAppStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  app: LoadedAppInstance,
  subPath: string,
  mountPrefix = ''
) {
  const ingressPath = ((req.headers['x-ingress-path'] as string) || '').replace(/\/+$/, '');
  const cleanSub = subPath.replace(/^\/+/, '') || 'index.html';
  let filePath = path.join(app.frontendDir, cleanSub);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(app.frontendDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Frontend bundle not found for app "${app.manifest.id}". Run "npm run build" first.`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let html = fs.readFileSync(filePath, 'utf-8');
    const assetBase = `${ingressPath}${mountPrefix}`.replace(/\/+$/, '');
    html = html
      .replace(/(src|href)="\.\/assets\//g, `$1="${assetBase}/assets/`)
      .replace(/(src|href)="\/assets\//g, `$1="${assetBase}/assets/`);
    const injection = `<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)};</script>`;
    html = html.includes('</head>')
      ? html.replace('</head>', `${injection}</head>`)
      : `${injection}${html}`;
    res.writeHead(200, { 'Content-Type': mime });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
}

function renderUnifiedDashboardHtml(ingressPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Main Dashboard</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --bg: #090d16;
      --panel: #111827;
      --card: #1e293b;
      --border: #2dd4bf22;
      --border-solid: #334155;
      --accent: #38bdf8;
      --accent-dark: #0284c7;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      height: 50px;
      background: #0f172a;
      border-bottom: 1px solid var(--border-solid);
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 15px;
      color: var(--accent);
      cursor: pointer;
    }
    .nav-tabs {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn {
      padding: 5px 11px;
      border-radius: 7px;
      border: 1px solid var(--border-solid);
      background: var(--card);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--accent); }
    .btn.active, .btn.primary {
      background: var(--accent-dark);
      border-color: var(--accent);
      color: #fff;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      background: #0f172a;
      color: var(--accent);
      border: 1px solid var(--border-solid);
    }
    /* Fullscreen 2-Column Split: 68% Calendar Left / 32% Compact Data Right */
    .fullscreen-grid {
      display: grid;
      grid-template-columns: 1fr 390px;
      gap: 14px;
      padding: 14px;
      height: calc(100vh - 50px);
      overflow: hidden;
    }
    @media (max-width: 1024px) {
      html, body { overflow: auto; height: auto; }
      .app-shell { height: auto; }
      .fullscreen-grid { grid-template-columns: 1fr; height: auto; overflow: visible; }
    }
    .calendar-pane {
      background: var(--panel);
      border: 1px solid var(--border-solid);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .cal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-solid);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      background: #131c2e;
    }
    .quick-add-bar {
      padding: 10px 18px;
      background: #0f172a;
      border-bottom: 1px solid var(--border-solid);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .quick-add-bar input {
      margin: 0;
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid var(--border-solid);
      background: #1e293b;
      color: #fff;
    }
    .cal-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
    }
    .day-group {
      margin-bottom: 18px;
    }
    .day-header {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
    }
    .event-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      margin-bottom: 7px;
      background: #1e293b;
      border-radius: 10px;
      border-left: 4px solid var(--accent);
    }
    .event-time {
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
      min-width: 110px;
    }
    .event-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }
    .event-meta {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    /* Right Column Compact Sidebar */
    .compact-sidebar {
      display: flex;
      flex-direction: column;
      gap: 11px;
      height: 100%;
      overflow-y: auto;
      padding-right: 2px;
    }
    .compact-card {
      background: var(--panel);
      border: 1px solid var(--border-solid);
      border-radius: 12px;
      padding: 12px 14px;
      flex-shrink: 0;
    }
    .compact-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .mini-stat {
      background: #1e293b;
      border-radius: 8px;
      padding: 6px 9px;
      border: 1px solid #283548;
    }
    .mini-stat-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .mini-stat-val {
      font-size: 14px;
      font-weight: 800;
      color: #f8fafc;
      margin-top: 1px;
    }
    .switch-mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .switch-mini {
      padding: 7px 9px;
      border-radius: 8px;
      background: #1e293b;
      border: 1px solid var(--border-solid);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }
    .switch-mini.on {
      border-color: #facc15;
      background: rgba(250, 204, 21, 0.14);
    }
    #app-iframe-container {
      display: none;
      height: calc(100vh - 50px);
      width: 100%;
    }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="app-shell">
    <div class="topbar">
      <div class="brand" onclick="switchView('overview')">
        <span>⚡ Thassi Main Dashboard</span>
        <span id="ha-pill" class="badge">Checking HA...</span>
        <span id="clock-pill" style="font-size:12px; color:var(--muted); font-weight:600;"></span>
      </div>
      <div class="nav-tabs">
        <button class="btn active" id="nav-overview" onclick="switchView('overview')">📅 Main Overview</button>
        <button class="btn" id="nav-google-calendar" onclick="openApp('google-calendar')">📅 Calendar</button>
        <button class="btn" id="nav-google-health" onclick="openApp('google-health')">❤️ Health</button>
        <button class="btn" id="nav-finance-analytics" onclick="openApp('finance-analytics')">💶 Finances</button>
        <button class="btn" id="nav-meal-planner" onclick="openApp('meal-planner')">🍽️ Meals</button>
        <button class="btn" id="nav-smart-canvas" onclick="openApp('smart-canvas')">🎛️ Controls</button>
        <button class="btn" id="nav-settings" onclick="switchView('settings')">⚙️</button>
      </div>
    </div>

    <div id="app-iframe-container">
      <iframe id="app-frame" src="about:blank"></iframe>
    </div>

    <div id="main-container" style="flex:1; overflow:hidden;">
      <div id="view-overview" class="fullscreen-grid">
        <!-- LEFT FULLSCREEN FOCUS: GOOGLE CALENDAR EVENTS -->
        <div class="calendar-pane">
          <div class="cal-header">
            <div>
              <div style="display:flex; align-items:center; gap:10px;">
                <h2 style="margin:0; font-size:18px; color:#38bdf8;">📅 Upcoming Calendar Schedule</h2>
                <span class="badge" id="cal-conn-badge">Checking...</span>
              </div>
              <div style="font-size:12px; color:var(--muted); margin-top:3px;" id="cal-subtitle">
                Synced with Home Assistant Google Calendar entities
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn" onclick="syncCalendarsNow()">🔄 Sync Now</button>
              <button class="btn primary" onclick="openApp('google-calendar')">Full Calendar Analytics →</button>
            </div>
          </div>

          <!-- Inline Quick Add Event to Google Calendar -->
          <form class="quick-add-bar" onsubmit="quickAddEvent(event)">
            <input id="qa-title" placeholder="Add event to Google Calendar (e.g. Zahnarzt, Meeting...)" style="flex:1; min-width:180px;" required />
            <input id="qa-start" type="datetime-local" required />
            <input id="qa-dur" type="number" value="60" min="15" step="15" style="width:70px;" title="Duration (min)" />
            <button type="submit" class="btn primary">+ Add Event</button>
          </form>

          <!-- Fullscreen Scrollable Day-by-Day Event List -->
          <div class="cal-scroll" id="cal-events-list">
            <div style="color:var(--muted); font-size:13px;">Loading calendar events...</div>
          </div>
        </div>

        <!-- RIGHT COMPACT COLUMN: HEALTH, SMART CONTROLS, FINANCE, MEALS -->
        <div class="compact-sidebar">
          <!-- 1. Compact Google Health & Pixel 10 -->
          <div class="compact-card" style="border-top: 3px solid #4ade80;">
            <div class="compact-title" style="color:#4ade80;" onclick="openApp('google-health')">
              <span>❤️ Health &amp; Pixel 10</span>
              <span class="badge" id="h-badge">--</span>
            </div>
            <div class="mini-grid">
              <div class="mini-stat">
                <div class="mini-stat-label">👟 Steps Today</div>
                <div class="mini-stat-val" id="h-steps">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">⚡ Readiness</div>
                <div class="mini-stat-val" id="h-score" style="color:#4ade80;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">❤️ Heart Rate</div>
                <div class="mini-stat-val" id="h-hr">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">🌙 RHR / HRV</div>
                <div class="mini-stat-val" id="h-rhr">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">🛌 Sleep / Resp</div>
                <div class="mini-stat-val" id="h-sleep">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">🔥 Burn / Dist</div>
                <div class="mini-stat-val" id="h-burn">--</div>
              </div>
            </div>
          </div>

          <!-- 2. Compact Smart Home Controls -->
          <div class="compact-card" style="border-top: 3px solid #facc15;">
            <div class="compact-title" style="color:#facc15;" onclick="openApp('smart-canvas')">
              <span>🎛️ Smart Controls</span>
              <span class="badge" id="sw-climate-badge">--</span>
            </div>
            <div class="switch-mini-grid" id="quick-switches"></div>
          </div>

          <!-- 3. Compact Finance & Budget (George CSV) -->
          <div class="compact-card" style="border-top: 3px solid #a855f7;">
            <div class="compact-title" style="color:#a855f7;" onclick="openApp('finance-analytics')">
              <span>💶 Finance (George)</span>
              <span class="badge" id="f-month-badge">--</span>
            </div>
            <div class="mini-grid">
              <div class="mini-stat">
                <div class="mini-stat-label">📥 Income</div>
                <div class="mini-stat-val" id="f-inc" style="color:#4ade80;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">📤 Expenses</div>
                <div class="mini-stat-val" id="f-exp" style="color:#f43f5e;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">🐷 Notgroschen</div>
                <div class="mini-stat-val" id="f-inv" style="color:#a855f7;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">🛒 Groceries</div>
                <div class="mini-stat-val" id="f-groc">--</div>
              </div>
            </div>
          </div>

          <!-- 4. Compact Meal Planner -->
          <div class="compact-card" style="border-top: 3px solid #fb923c;">
            <div class="compact-title" style="color:#fb923c;" onclick="openApp('meal-planner')">
              <span>🍽️ Meals Today</span>
              <span class="badge" id="m-kcal-badge">0 kcal</span>
            </div>
            <div id="m-content" style="font-size:12px; color:var(--muted);"></div>
          </div>
        </div>
      </div>

      <!-- SETTINGS VIEW -->
      <div id="view-settings" style="display:none; padding:24px; max-width:960px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
          <div class="compact-card">
            <h3 style="margin-top:0;">🏠 Home Assistant Connection</h3>
            <p id="ha-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label style="font-size:12px; color:var(--muted);">Home Assistant URL</label>
            <input id="ha-url-input" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Long-Lived Access Token</label>
            <input id="ha-token-input" type="password" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <button class="btn primary" onclick="saveHaConfig()">Save &amp; Test HA Connection</button>
          </div>
          <div class="compact-card">
            <h3 style="margin-top:0;">📅 Google OAuth2 Vault</h3>
            <p id="google-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label style="font-size:12px; color:var(--muted);">Client ID</label>
            <input id="google-client-id" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Client Secret</label>
            <input id="google-client-secret" type="password" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Redirect URI</label>
            <input id="google-redirect-uri" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <div style="display:flex; gap:8px;">
              <button class="btn primary" onclick="saveGoogleConfig()">Save</button>
              <button class="btn" onclick="startGoogleOAuth()">Authorize with Google ↗</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const base = window.__THASSI_INGRESS_PATH__ ? window.__THASSI_INGRESS_PATH__.replace(/\\/+$/, '') : '';
    const NAV_IDS = ['overview', 'google-calendar', 'google-health', 'finance-analytics', 'meal-planner', 'smart-canvas', 'settings'];
    const CAT_COLORS = {
      work: '#38bdf8',
      focus: '#a855f7',
      health: '#4ade80',
      social: '#f43f5e',
      meals: '#fb923c',
      personal: '#eab308'
    };

    function updateClock() {
      const now = new Date();
      document.getElementById('clock-pill').textContent = now.toLocaleString('de-AT', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    }
    setInterval(updateClock, 10000);
    updateClock();

    // Default quick-add datetime to next hour
    const nextHour = new Date(Date.now() + 3600000);
    nextHour.setMinutes(0, 0, 0);
    const tzOffset = nextHour.getTimezoneOffset() * 60000;
    document.getElementById('qa-start').value = new Date(nextHour - tzOffset).toISOString().slice(0, 16);

    function setActiveNav(id) {
      NAV_IDS.forEach(k => {
        const el = document.getElementById('nav-' + k);
        if (el) el.className = (k === id) ? 'btn active' : 'btn';
      });
    }

    function switchView(view) {
      document.getElementById('app-iframe-container').style.display = 'none';
      document.getElementById('main-container').style.display = 'block';
      document.getElementById('view-overview').style.display = (view === 'overview') ? 'grid' : 'none';
      document.getElementById('view-settings').style.display = (view === 'settings') ? 'block' : 'none';
      setActiveNav(view);
      if (view === 'overview') loadCommandCenter();
    }

    function openApp(appId) {
      document.getElementById('main-container').style.display = 'none';
      const container = document.getElementById('app-iframe-container');
      const frame = document.getElementById('app-frame');
      frame.src = base + '/apps/' + encodeURIComponent(appId) + '/';
      container.style.display = 'block';
      setActiveNav(appId);
    }

    async function toggleSwitch(entityId) {
      await fetch(base + '/api/apps/smart-canvas/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId })
      });
      await loadCommandCenter();
    }

    async function syncCalendarsNow() {
      document.getElementById('cal-conn-badge').textContent = 'Syncing...';
      await fetch(base + '/api/apps/google-calendar/sync', { method: 'POST' });
      await loadCommandCenter();
    }

    async function quickAddEvent(e) {
      e.preventDefault();
      const title = document.getElementById('qa-title').value;
      const start_time = document.getElementById('qa-start').value;
      const duration_minutes = Number(document.getElementById('qa-dur').value || 60);
      if (!title || !start_time) return;
      await fetch(base + '/api/apps/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, start_time: new Date(start_time).toISOString(), duration_minutes })
      });
      document.getElementById('qa-title').value = '';
      await loadCommandCenter();
    }

    async function loadCommandCenter() {
      const [sysRes, calRes, healthRes, boardRes] = await Promise.all([
        fetch(base + '/api/system/status'),
        fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null),
        fetch(base + '/api/apps/google-health/dashboard').catch(() => null),
        fetch(base + '/api/apps/smart-canvas/board').catch(() => null)
      ]);
      const data = await sysRes.json();

      const pill = document.getElementById('ha-pill');
      pill.textContent = data.ha.connected ? '● HA Connected' : '▲ HA Disconnected';
      pill.style.color = data.ha.connected ? '#4ade80' : '#f43f5e';

      document.getElementById('ha-status-text').textContent = data.ha.message || '';
      document.getElementById('ha-url-input').value = data.ha.haUrl || 'http://192.168.188.92:8123';
      document.getElementById('google-status-text').textContent = data.google.authorized
        ? '✅ Authorized with Google OAuth2'
        : (data.google.configured ? 'Client ID configured — using HA Calendar & Health Connect bridge' : 'Not configured');

      // 1. Render Fullscreen Calendar Events
      const calListEl = document.getElementById('cal-events-list');
      const calBadge = document.getElementById('cal-conn-badge');
      if (!data.ha.connected) {
        calBadge.textContent = 'HA Disconnected';
        calBadge.style.color = '#f43f5e';
        calListEl.innerHTML = '<div style="color:#f43f5e; padding:20px;">❌ No connection to Home Assistant Calendar API.</div>';
      } else if (calRes && calRes.ok) {
        const calData = await calRes.json();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const upcoming = (calData.events || []).filter(ev => new Date(ev.end_time) >= startOfToday);
        calBadge.textContent = upcoming.length + ' upcoming events';
        calBadge.style.color = '#4ade80';

        if (upcoming.length === 0) {
          calListEl.innerHTML = '<div style="color:var(--muted); padding:20px;">No upcoming events found in connected Google Calendars.</div>';
        } else {
          const groups = new Map();
          upcoming.forEach(ev => {
            const dKey = ev.start_time.slice(0, 10);
            if (!groups.has(dKey)) groups.set(dKey, []);
            groups.get(dKey).push(ev);
          });

          const todayStr = new Date().toISOString().slice(0, 10);
          const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

          let html = '';
          for (const [dKey, evs] of groups.entries()) {
            const dateObj = new Date(dKey + 'T12:00:00');
            let dayLabel = dateObj.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            if (dKey === todayStr) dayLabel = '🔥 TODAY — ' + dayLabel;
            else if (dKey === tomorrowStr) dayLabel = '⏭️ TOMORROW — ' + dayLabel;

            html += '<div class="day-group">';
            html += '<div class="day-header"><span>' + dayLabel + '</span><span>' + evs.length + ' event(s)</span></div>';
            evs.forEach(ev => {
              const s = new Date(ev.start_time);
              const e = new Date(ev.end_time);
              const sTime = s.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
              const eTime = e.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
              const color = CAT_COLORS[ev.category] || '#38bdf8';
              html += \`
                <div class="event-row" style="border-left-color:\${color};">
                  <div style="display:flex; align-items:center; gap:14px;">
                    <div class="event-time">\${sTime} – \${eTime}</div>
                    <div>
                      <div class="event-title">\${ev.title}</div>
                      <div class="event-meta">
                        📅 \${ev.calendar_name}
                        \${ev.location ? ' • 📍 ' + ev.location : ''}
                        \${ev.description ? ' • ' + ev.description.slice(0, 60) : ''}
                      </div>
                    </div>
                  </div>
                  <span class="badge" style="color:\${color}; border-color:\${color}44;">\${ev.category}</span>
                </div>
              \`;
            });
            html += '</div>';
          }
          calListEl.innerHTML = html;
        }
      }

      // 2. Render Compact Health Card (Never show dummy numbers!)
      if (healthRes && healthRes.ok) {
        const hd = await healthRes.json();
        const t = hd.today;
        document.getElementById('h-badge').textContent = t?.source && t.source !== 'no_connection' ? 'Pixel 10 Live' : 'No Data';
        document.getElementById('h-steps').textContent = t?.steps > 0 ? t.steps.toLocaleString() : 'No data';
        document.getElementById('h-score').textContent = hd.readiness?.score > 0 ? (hd.readiness.score + '/100') : 'No data';
        document.getElementById('h-hr').textContent = t?.current_hr > 0 ? (t.current_hr + ' bpm') : 'No data';
        document.getElementById('h-rhr').textContent =
          (t?.resting_hr > 0 ? (t.resting_hr + ' bpm') : 'No data') +
          (hd.hrvMs ? (' / ' + hd.hrvMs + 'ms') : '');
        document.getElementById('h-sleep').textContent =
          (t?.sleep_hours > 0 ? (t.sleep_hours + 'h') : 'No data') +
          (hd.respiratoryRate ? (' / ' + hd.respiratoryRate) : '');
        document.getElementById('h-burn').textContent =
          (t?.active_calories > 0 ? (t.active_calories + ' kcal') : 'No data') +
          (hd.distanceKm ? (' / ' + hd.distanceKm + 'km') : '');
      }

      // 3. Render Compact Smart Controls
      if (boardRes && boardRes.ok) {
        const board = await boardRes.json();
        const tempSt = board.stateMap?.['sensor.temperatur_und_feuchtigkeitssensor_temperature'];
        const humSt = board.stateMap?.['sensor.temperatur_und_feuchtigkeitssensor_humidity'];
        document.getElementById('sw-climate-badge').textContent =
          tempSt ? (tempSt.state + '°C' + (humSt ? ' • ' + humSt.state + '%' : '')) : (data.ha.connected ? 'Live' : 'Offline');

        const swGrid = document.getElementById('quick-switches');
        swGrid.innerHTML = '';
        (board.tiles || [])
          .filter(t => ['light', 'switch'].includes(t.entity_id.split('.')[0]))
          .slice(0, 6)
          .forEach(t => {
            const st = board.stateMap?.[t.entity_id];
            const subSt = t.sub_entity_id ? board.stateMap?.[t.sub_entity_id] : null;
            const isOn = st?.state === 'on';
            const div = document.createElement('div');
            div.className = 'switch-mini' + (isOn ? ' on' : '');
            div.onclick = () => toggleSwitch(t.entity_id);
            div.innerHTML = \`
              <div style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis; padding-right:4px;">
                <strong>\${t.icon} \${t.custom_label}</strong>
                \${subSt && Number(subSt.state) > 0 ? '<span style="color:#facc15; margin-left:4px;">' + subSt.state + 'W</span>' : ''}
              </div>
              <span style="font-weight:700; color:\${isOn ? '#facc15' : '#64748b'};">\${st ? (isOn ? 'ON' : 'OFF') : 'N/A'}</span>
            \`;
            swGrid.appendChild(div);
          });
      }

      // 4. Render Compact Finance Card
      const f = data.summaries?.finance;
      if (f && (f.income > 0 || f.expenses > 0)) {
        document.getElementById('f-month-badge').textContent = f.activeMonth || 'Loaded';
        document.getElementById('f-inc').textContent = '+€' + Number(f.income).toFixed(0);
        document.getElementById('f-exp').textContent = '-€' + Number(f.expenses).toFixed(0);
        document.getElementById('f-inv').textContent = '€' + Number(f.investments || 0).toFixed(0);
        document.getElementById('f-groc').textContent = '€' + Number(f.grocerySpend || 0).toFixed(0);
      } else {
        document.getElementById('f-month-badge').textContent = 'No CSV Data';
        document.getElementById('f-inc').textContent = 'No data';
        document.getElementById('f-exp').textContent = 'No data';
        document.getElementById('f-inv').textContent = 'No data';
        document.getElementById('f-groc').textContent = 'No data';
      }

      // 5. Render Compact Meal Planner Card
      const m = data.summaries?.meals;
      const mContent = document.getElementById('m-content');
      if (m && (m.breakfast || m.lunch || m.dinner)) {
        document.getElementById('m-kcal-badge').textContent = (m.totalCalories || 0) + ' kcal';
        mContent.innerHTML = \`
          <div style="padding:3px 0;">🌅 <strong>Breakfast:</strong> \${m.breakfast || 'Not planned'}</div>
          <div style="padding:3px 0;">☀️ <strong>Lunch:</strong> \${m.lunch || 'Not planned'}</div>
          <div style="padding:3px 0;">🌙 <strong>Dinner:</strong> \${m.dinner || 'Not planned'}</div>
        \`;
      } else {
        document.getElementById('m-kcal-badge').textContent = 'Unplanned';
        mContent.innerHTML = 'No meals planned for today. <a href="javascript:void(0)" onclick="openApp(\\'meal-planner\\')" style="color:#38bdf8;">Plan meals →</a>';
      }
    }

    async function saveHaConfig() {
      const haUrl = document.getElementById('ha-url-input').value;
      const haToken = document.getElementById('ha-token-input').value;
      await fetch(base + '/api/system/ha-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken })
      });
      await loadCommandCenter();
    }

    async function saveGoogleConfig() {
      const clientId = document.getElementById('google-client-id').value;
      const clientSecret = document.getElementById('google-client-secret').value;
      const redirectUri = document.getElementById('google-redirect-uri').value;
      await fetch(base + '/api/system/google/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      await loadCommandCenter();
    }

    async function startGoogleOAuth() {
      const res = await fetch(base + '/api/system/google/auth-url');
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else alert(data.error || 'Configure Client ID & Secret first');
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('app')) {
      openApp(urlParams.get('app'));
    } else {
      loadCommandCenter();
    }
  </script>
</body>
</html>`;
}

async function handleAppApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  app: LoadedAppInstance,
  subRoute: string,
  queryObj: Record<string, string>
) {
  const method = (req.method || 'GET').toUpperCase();
  const rawBody = method === 'GET' || method === 'HEAD' ? '' : await readRequestBody(req);
  let parsedBody: unknown = {};
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  if (subRoute === '/_db/tables' && method === 'GET') {
    return sendJson(res, 200, { tables: app.db.listTables() });
  }
  if (subRoute === '/_db/import-csv' && method === 'POST') {
    const body = parsedBody as { tableName?: string; csvText?: string; replaceTable?: boolean };
    if (!body?.tableName || !body?.csvText) {
      return sendJson(res, 400, { error: 'tableName and csvText are required' });
    }
    const result = app.db.importCsvToTable(body.tableName, body.csvText, {
      replaceTable: body.replaceTable ?? true,
    });
    return sendJson(res, 200, result);
  }
  const tableSummaryMatch = subRoute.match(/^\/_db\/tables\/([^/]+)\/summary$/);
  if (tableSummaryMatch && method === 'GET') {
    const summary = app.db.summarizeTable(decodeURIComponent(tableSummaryMatch[1]));
    return sendJson(res, 200, summary);
  }
  const tableRowsMatch = subRoute.match(/^\/_db\/tables\/([^/]+)\/rows$/);
  if (tableRowsMatch && method === 'GET') {
    const tbl = decodeURIComponent(tableRowsMatch[1]).replace(/[^a-z0-9_]/gi, '_');
    const limit = Math.min(1000, Math.max(1, Number(queryObj.limit) || 100));
    const rows = app.db.query(`SELECT * FROM "${tbl}" LIMIT ?`, [limit]);
    return sendJson(res, 200, { rows });
  }
  if (subRoute === '/_db/query' && method === 'POST') {
    const body = parsedBody as { sql?: string; params?: unknown[] };
    if (!body?.sql) return sendJson(res, 400, { error: 'Missing sql field' });
    const trimmed = body.sql.trim();
    if (/^(SELECT|PRAGMA|WITH)/i.test(trimmed)) {
      const rows = app.db.query(trimmed, body.params || []);
      return sendJson(res, 200, { rows });
    } else {
      const info = app.db.execute(trimmed, body.params || []);
      return sendJson(res, 200, { rows: [info] });
    }
  }

  if (subRoute === '/_ha/status' && method === 'GET') {
    return sendJson(res, 200, await app.ha.getStatus());
  }
  if (subRoute === '/_ha/states' && method === 'GET') {
    const states = await app.ha.getStates(queryObj.domain);
    return sendJson(res, 200, { states });
  }
  if (subRoute === '/_ha/service' && method === 'POST') {
    const body = parsedBody as {
      domain: string;
      service: string;
      serviceData?: Record<string, unknown>;
    };
    const result = await app.ha.callService(body.domain, body.service, body.serviceData || {});
    return sendJson(res, 200, { result });
  }
  if (subRoute === '/_ha/sensor' && method === 'POST') {
    const body = parsedBody as {
      sensorSlug: string;
      state: string | number | boolean;
      attributes?: Record<string, unknown>;
    };
    const result = await app.ha.publishSensor(body.sensorSlug, body.state, body.attributes || {});
    return sendJson(res, 200, result);
  }

  if (subRoute === '/_jobs' && method === 'GET') {
    return sendJson(res, 200, { jobs: scheduler.listJobs(app.manifest.id) });
  }
  const jobRunMatch = subRoute.match(/^\/_jobs\/([^/]+)\/run$/);
  if (jobRunMatch && method === 'POST') {
    const job = await scheduler.triggerJob(app.manifest.id, decodeURIComponent(jobRunMatch[1]));
    return sendJson(res, 200, { job });
  }

  if (subRoute === '/_google/status' && method === 'GET') {
    return sendJson(res, 200, googleOAuth.getStatus());
  }
  if (subRoute === '/_google/calendar/upcoming' && method === 'GET') {
    const events = await googleOAuth.fetchUpcomingCalendarEvents(Number(queryObj.maxResults) || 15);
    return sendJson(res, 200, { events });
  }

  const handler = app.routes.get(`${method} ${subRoute}`);
  if (!handler) {
    return sendJson(res, 404, {
      error: `Route "${method} ${subRoute}" not found in app "${app.manifest.id}"`,
    });
  }

  const ctx: ThassiAppContext = {
    appId: app.manifest.id,
    db: app.db,
    sharedDb,
    ha: app.ha,
    google: googleOAuth,
    scheduleJob: (j) => scheduler.registerJob(app.manifest.id, j),
    route: () => {},
  };

  const result = await handler(
    {
      method,
      path: subRoute,
      query: queryObj,
      body: parsedBody,
      rawBody,
      headers: req.headers,
    },
    ctx
  );

  if (
    result &&
    typeof result === 'object' &&
    'body' in result &&
    ('status' in result || 'headers' in result)
  ) {
    const typed = result as { status?: number; headers?: Record<string, string>; body: unknown };
    return sendJson(res, typed.status || 200, typed.body, typed.headers || {});
  }

  return sendJson(res, 200, result);
}

async function startServer() {
  await discoverAllApps();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        return sendJson(res, 204, {});
      }

      const safeReqUrl = (req.url || '/').replace(/^\/+/, '/');
      const parsedUrl = new URL(safeReqUrl, 'http://localhost');
      const pathname = parsedUrl.pathname.replace(/\/+/g, '/');
      const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());
      const ingressPath = ((req.headers['x-ingress-path'] as string) || '').replace(/\/+$/, '');

      if (pathname === '/api/system/status' && req.method === 'GET') {
        const ha = await systemHaBridge.getStatus();
        const google = googleOAuth.getStatus();
        const apps = Array.from(loadedApps.values()).map((a) => ({
          ...a.manifest,
          source: a.source,
          updatedAt: a.updatedAt,
        }));
        const summaries = {
          health: sharedDb.kvGet('google_health_today') || null,
          meals: sharedDb.kvGet('meal_planner_today') || null,
          calendar: sharedDb.kvGet('google_calendar_today') || null,
          finance: sharedDb.kvGet('finance_summary') || null,
        };
        return sendJson(res, 200, {
          ha,
          google,
          apps,
          summaries,
          jobs: scheduler.listJobs(),
          standaloneAppId:
            ((req.headers['x-thassi-standalone-app'] as string) || '').trim() ||
            STANDALONE_APP_ID ||
            null,
        });
      }

      if (pathname === '/api/system/ha-config' && req.method === 'POST') {
        const body = JSON.parse((await readRequestBody(req)) || '{}') as {
          haUrl?: string;
          haToken?: string;
        };
        const current = sharedDb.kvGet<{ haUrl?: string; haToken?: string }>('ha_connection') || {};
        sharedDb.kvSet('ha_connection', {
          haUrl: body.haUrl || current.haUrl || 'http://192.168.188.92:8123',
          haToken:
            body.haToken !== undefined && body.haToken !== '' ? body.haToken : current.haToken,
        });
        return sendJson(res, 200, await systemHaBridge.getStatus());
      }

      if (pathname === '/api/system/google/config' && req.method === 'POST') {
        const body = JSON.parse((await readRequestBody(req)) || '{}');
        return sendJson(res, 200, googleOAuth.saveConfig(body));
      }

      if (pathname === '/api/system/google/auth-url' && req.method === 'GET') {
        const url = googleOAuth.getAuthorizationUrl();
        return sendJson(res, 200, { url });
      }

      if (pathname === '/api/system/google/callback' && req.method === 'GET') {
        if (!queryObj.code) {
          return sendJson(res, 400, { error: 'Missing ?code parameter from Google OAuth' });
        }
        await googleOAuth.exchangeCode(queryObj.code);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<h2>✅ Google Account Connected to Thassi Dashboard!</h2><p>You can close this tab now.</p>'
        );
        return;
      }

      if (pathname === '/api/system/deploy' && req.method === 'POST') {
        const payload = JSON.parse(await readRequestBody(req)) as {
          manifest: ThassiAppManifest;
          backendCode: string;
          frontendFiles: Record<string, string>;
        };

        if (!payload?.manifest?.id) {
          return sendJson(res, 400, { error: 'Invalid deployment bundle: missing manifest.id' });
        }

        const appId = payload.manifest.id.replace(/[^a-z0-9-_]/gi, '');
        const targetDir = path.join(DATA_DIR, 'deployed_apps', appId);
        fs.mkdirSync(targetDir, { recursive: true });

        fs.writeFileSync(
          path.join(targetDir, 'thassi.app.json'),
          JSON.stringify(payload.manifest, null, 2)
        );

        if (payload.backendCode) {
          fs.writeFileSync(path.join(targetDir, 'backend.mjs'), payload.backendCode, 'utf-8');
        }

        const frontendDir = path.join(targetDir, 'frontend');
        fs.rmSync(frontendDir, { recursive: true, force: true });
        fs.mkdirSync(frontendDir, { recursive: true });

        for (const [relFile, b64] of Object.entries(payload.frontendFiles || {})) {
          const safeRel = relFile.replace(/^(\.\.[/\\])+/, '');
          const destFile = path.join(frontendDir, safeRel);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.writeFileSync(destFile, Buffer.from(b64, 'base64'));
        }

        await loadAppFromDirectory(targetDir, 'hot-deployed');
        return sendJson(res, 200, {
          deployed: true,
          appId,
          name: payload.manifest.name,
          updatedAt: new Date().toISOString(),
        });
      }

      const appApiMatch = pathname.match(/^\/api\/apps\/([^/]+)(\/.*)?$/);
      if (appApiMatch) {
        const appId = decodeURIComponent(appApiMatch[1]);
        const subRoute = appApiMatch[2] || '/';
        const app = loadedApps.get(appId);
        if (!app) {
          return sendJson(res, 404, { error: `App "${appId}" is not installed` });
        }
        await handleAppApiRequest(req, res, app, subRoute, queryObj);
        return;
      }

      const appUiMatch = pathname.match(/^\/apps\/([^/]+)(?:\/(.*))?$/);
      if (appUiMatch) {
        const appId = decodeURIComponent(appUiMatch[1]);
        const subPath = appUiMatch[2] || 'index.html';
        const app = loadedApps.get(appId);
        if (!app) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`App "${appId}" not found.`);
          return;
        }
        serveAppStaticFile(req, res, app, subPath, `/apps/${encodeURIComponent(appId)}`);
        return;
      }

      const effectiveStandaloneAppId =
        ((req.headers['x-thassi-standalone-app'] as string) || '').trim() || STANDALONE_APP_ID;
      if (effectiveStandaloneAppId && loadedApps.has(effectiveStandaloneAppId)) {
        const standaloneApp = loadedApps.get(effectiveStandaloneAppId)!;
        serveAppStaticFile(req, res, standaloneApp, pathname, '');
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderUnifiedDashboardHtml(ingressPath));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      console.error('[Thassi Server Error]', err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Thassi] Unified Dashboard listening on http://0.0.0.0:${PORT}`);
    console.log(
      `[Thassi] Installed services (${loadedApps.size}): ${Array.from(loadedApps.keys()).join(', ')}`
    );
  });
}

void startServer();
