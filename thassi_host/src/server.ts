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
  <title>Thassi Unified Dashboard</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --bg: #0b1120;
      --card: #1e293b;
      --border: #334155;
      --accent: #38bdf8;
      --accent-dark: #0284c7;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 20px;
      background: #0f172a;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 17px;
      color: var(--accent);
      cursor: pointer;
    }
    .nav-tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 7px 13px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    .btn:hover {
      border-color: var(--accent);
    }
    .btn.active, .btn.primary {
      background: var(--accent-dark);
      border-color: var(--accent);
      color: #fff;
    }
    .container {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 18px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .badge {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      background: #0f172a;
      color: var(--accent);
      border: 1px solid var(--border);
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #0f172a;
      font-size: 13px;
    }
    .switch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .switch-pill {
      padding: 12px 14px;
      border-radius: 12px;
      background: #0f172a;
      border: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.15s;
    }
    .switch-pill.on {
      border-color: #facc15;
      background: linear-gradient(135deg, rgba(250,204,21,0.16) 0%, #0f172a 100%);
    }
    input {
      width: 100%;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #0f172a;
      color: var(--text);
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    #app-iframe-container {
      display: none;
      height: calc(100vh - 57px);
      width: 100%;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand" onclick="switchView('overview')">
      <span>⚡ Thassi Command Center</span>
      <span id="ha-pill" class="badge">Connecting...</span>
    </div>
    <div class="nav-tabs">
      <button class="btn active" id="nav-overview" onclick="switchView('overview')">🏠 Unified Overview</button>
      <button class="btn" id="nav-smart-canvas" onclick="openApp('smart-canvas')">🎛️ Smart Canvas</button>
      <button class="btn" id="nav-google-health" onclick="openApp('google-health')">❤️ Health &amp; Readiness</button>
      <button class="btn" id="nav-meal-planner" onclick="openApp('meal-planner')">🍲 Meal Planner</button>
      <button class="btn" id="nav-google-calendar" onclick="openApp('google-calendar')">📅 Google Calendar</button>
      <button class="btn" id="nav-finance-analytics" onclick="openApp('finance-analytics')">💶 Finance &amp; Budget</button>
      <button class="btn" id="nav-settings" onclick="switchView('settings')">🔐 OAuth &amp; Settings</button>
    </div>
  </div>

  <div id="app-iframe-container">
    <iframe id="app-frame" src="about:blank"></iframe>
  </div>

  <div class="container" id="main-container">
    <div id="view-overview">
      <!-- Section 1: Smart Home Quick Switches & Room Climate -->
      <div class="card" style="margin-bottom: 22px; border-top: 3px solid #facc15;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0; font-size:18px; color:#facc15;">🎛️ Smart Home Quick Controls &amp; Room Climate</h3>
            <p style="margin:4px 0 0; font-size:13px; color:var(--muted);">
              Click any light or Shelly switch below to toggle immediately, or open the full drag-and-drop canvas.
            </p>
          </div>
          <button class="btn primary" onclick="openApp('smart-canvas')">Open Full Smart Canvas →</button>
        </div>
        <div class="switch-grid" id="quick-switches"></div>
      </div>

      <!-- Section 2: 4 Personal Life & Data Pillars -->
      <div class="hero-grid">
        <!-- Pillar 1: Google Health & Readiness -->
        <div class="card" style="border-top: 3px solid #4ade80;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:12px; text-transform:uppercase; color:#4ade80; font-weight:700;">❤️ Google Health &amp; Readiness</span>
              <span class="badge" id="health-status-badge">Peak Recovery</span>
            </div>
            <div style="font-size:32px; font-weight:800; color:#4ade80; margin-bottom:12px;" id="health-score-val">--/100</div>
            <div class="metric-row"><span>👟 Daily Steps</span><strong id="health-steps-val">--</strong></div>
            <div class="metric-row"><span>❤️ Current Heart Rate</span><strong id="health-hr-val">-- bpm</strong></div>
            <div class="metric-row"><span>🌙 Resting Heart Rate</span><strong id="health-rhr-val">-- bpm</strong></div>
            <div class="metric-row"><span>⌚ Pixel Watch / Weight</span><strong id="health-watch-val">--</strong></div>
          </div>
          <button class="btn primary" style="width:100%; margin-top:16px;" onclick="openApp('google-health')">
            Open Health &amp; Workouts →
          </button>
        </div>

        <!-- Pillar 2: Meal Planner & Nutrition -->
        <div class="card" style="border-top: 3px solid #fb923c;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:12px; text-transform:uppercase; color:#fb923c; font-weight:700;">🍲 Meal Planner &amp; Macros</span>
              <span class="badge" id="meal-kcal-badge">-- kcal</span>
            </div>
            <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-bottom:12px;" id="meal-dinner-val">Loading...</div>
            <div class="metric-row"><span>🌅 Breakfast</span><strong id="meal-breakfast-val">--</strong></div>
            <div class="metric-row"><span>☀️ Lunch</span><strong id="meal-lunch-val">--</strong></div>
            <div class="metric-row"><span>💪 Daily Protein</span><strong id="meal-protein-val">-- g</strong></div>
            <div class="metric-row"><span>🛒 Open Groceries</span><strong id="meal-groceries-val">0 items</strong></div>
          </div>
          <button class="btn primary" style="width:100%; margin-top:16px;" onclick="openApp('meal-planner')">
            Open Weekly Meal Planner →
          </button>
        </div>

        <!-- Pillar 3: Google Calendar & Schedule -->
        <div class="card" style="border-top: 3px solid #38bdf8;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:12px; text-transform:uppercase; color:#38bdf8; font-weight:700;">📅 Google Calendar &amp; Time</span>
              <span class="badge" id="cal-count-badge">-- events today</span>
            </div>
            <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-bottom:12px;" id="cal-next-val">Loading...</div>
            <div class="metric-row"><span>⏱️ Busy Hours Today</span><strong id="cal-hours-val">-- h</strong></div>
            <div class="metric-row"><span>🗓️ Next Event Start</span><strong id="cal-start-val">--</strong></div>
            <div class="metric-row"><span>🔗 Sync Status</span><strong style="color:#4ade80;">Active (15m Cron)</strong></div>
          </div>
          <button class="btn primary" style="width:100%; margin-top:16px;" onclick="openApp('google-calendar')">
            Open Calendar &amp; Analytics →
          </button>
        </div>

        <!-- Pillar 4: Finance & Budget -->
        <div class="card" style="border-top: 3px solid #a855f7;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:12px; text-transform:uppercase; color:#a855f7; font-weight:700;">💶 Finance &amp; Cashflow</span>
              <span class="badge" id="fin-rate-badge">--% Savings Rate</span>
            </div>
            <div style="font-size:28px; font-weight:800; color:#4ade80; margin-bottom:12px;" id="fin-net-val">+€--</div>
            <div class="metric-row"><span>📥 Monthly Income</span><strong id="fin-inc-val" style="color:#4ade80;">+€--</strong></div>
            <div class="metric-row"><span>📤 Living Expenses</span><strong id="fin-exp-val" style="color:#f43f5e;">-€--</strong></div>
            <div class="metric-row"><span>📈 ETF Investments</span><strong id="fin-inv-val" style="color:#a855f7;">€--</strong></div>
            <div class="metric-row"><span>🛒 Grocery Spend</span><strong id="fin-groc-val">€--</strong></div>
          </div>
          <button class="btn primary" style="width:100%; margin-top:16px;" onclick="openApp('finance-analytics')">
            Open Finance &amp; CSV Analyzer →
          </button>
        </div>
      </div>
    </div>

    <div id="view-settings" style="display:none;">
      <div class="hero-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="card">
          <div>
            <h3 style="margin-top:0;">🏠 Home Assistant Connection</h3>
            <p id="ha-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label>Home Assistant URL</label>
            <input id="ha-url-input" placeholder="http://192.168.188.92:8123" />
            <label>Long-Lived Access Token (Optional override)</label>
            <input id="ha-token-input" type="password" placeholder="Uses SUPERVISOR_TOKEN automatically in HA OS" />
          </div>
          <button class="btn primary" onclick="saveHaConfig()">Save &amp; Test HA Connection</button>
        </div>

        <div class="card">
          <div>
            <h3 style="margin-top:0;">📅 Shared Google OAuth2 Vault (Calendar &amp; Health)</h3>
            <p id="google-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label>Google OAuth Client ID</label>
            <input id="google-client-id" placeholder="xxx.apps.googleusercontent.com" />
            <label>Google OAuth Client Secret</label>
            <input id="google-client-secret" type="password" placeholder="GOCSPX-..." />
            <label>Redirect URI</label>
            <input id="google-redirect-uri" placeholder="http://192.168.188.92:8099/api/system/google/callback" />
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn primary" onclick="saveGoogleConfig()">Save Credentials</button>
            <button class="btn" onclick="startGoogleOAuth()">Authorize with Google ↗</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const base = window.__THASSI_INGRESS_PATH__ ? window.__THASSI_INGRESS_PATH__.replace(/\\/+$/, '') : '';
    const NAV_IDS = ['overview', 'smart-canvas', 'google-health', 'meal-planner', 'google-calendar', 'finance-analytics', 'settings'];

    function setActiveNav(id) {
      NAV_IDS.forEach(k => {
        const el = document.getElementById('nav-' + k);
        if (el) el.className = (k === id) ? 'btn active' : 'btn';
      });
    }

    function switchView(view) {
      document.getElementById('app-iframe-container').style.display = 'none';
      document.getElementById('main-container').style.display = 'block';
      document.getElementById('view-overview').style.display = (view === 'overview') ? 'block' : 'none';
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

    async function loadCommandCenter() {
      const [sysRes, boardRes] = await Promise.all([
        fetch(base + '/api/system/status'),
        fetch(base + '/api/apps/smart-canvas/board').catch(() => null)
      ]);
      const data = await sysRes.json();

      const pill = document.getElementById('ha-pill');
      pill.textContent = data.ha.connected ? 'HA Connected' : 'HA Token Needed';
      pill.style.color = data.ha.connected ? '#4ade80' : '#facc15';

      document.getElementById('ha-status-text').textContent = data.ha.message || '';
      document.getElementById('ha-url-input').value = data.ha.haUrl || 'http://192.168.188.92:8123';
      document.getElementById('google-status-text').textContent = data.google.authorized
        ? '✅ Authorized with Google OAuth2'
        : (data.google.configured ? 'Credentials saved — click Authorize with Google' : 'Not configured yet');

      // Populate Health
      const h = data.summaries?.health;
      if (h) {
        document.getElementById('health-score-val').textContent = h.readinessScore + '/100';
        document.getElementById('health-status-badge').textContent = h.readinessStatus || 'Ready';
        document.getElementById('health-steps-val').textContent = (h.steps || 0).toLocaleString() + ' / ' + (h.stepGoal || 10000).toLocaleString();
        document.getElementById('health-hr-val').textContent = (h.currentHr || 68) + ' bpm';
        document.getElementById('health-rhr-val').textContent = (h.restingHr || 56) + ' bpm';
        document.getElementById('health-watch-val').textContent = (h.pixelWatchBattery !== null ? h.pixelWatchBattery + '% • ' : '') + (h.weightKg || 85.5) + ' kg';
      }

      // Populate Meals
      const m = data.summaries?.meals;
      if (m) {
        document.getElementById('meal-kcal-badge').textContent = (m.totalCalories || 0) + ' kcal';
        document.getElementById('meal-dinner-val').textContent = '🌙 ' + (m.dinner || 'Unplanned');
        document.getElementById('meal-breakfast-val').textContent = (m.breakfast || '—').slice(0, 26);
        document.getElementById('meal-lunch-val').textContent = (m.lunch || '—').slice(0, 26);
        document.getElementById('meal-protein-val').textContent = (m.totalProtein || 0) + 'g';
        document.getElementById('meal-groceries-val').textContent = (m.openGroceries || 0) + ' items';
      }

      // Populate Calendar
      const c = data.summaries?.calendar;
      if (c) {
        document.getElementById('cal-count-badge').textContent = (c.todayEventCount || 0) + ' events today';
        document.getElementById('cal-next-val').textContent = c.nextEventTitle || 'None Scheduled';
        document.getElementById('cal-hours-val').textContent = (c.busyHoursToday || 0) + ' h';
        document.getElementById('cal-start-val').textContent = c.nextEventStart ? new Date(c.nextEventStart).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—';
      }

      // Populate Finance
      const f = data.summaries?.finance;
      if (f) {
        document.getElementById('fin-rate-badge').textContent = (f.savingsRatePct || 0) + '% Savings Rate';
        document.getElementById('fin-net-val').textContent = '+€' + Number(f.netCashflow || 0).toFixed(2);
        document.getElementById('fin-inc-val').textContent = '+€' + Number(f.income || 0).toFixed(2);
        document.getElementById('fin-exp-val').textContent = '-€' + Number(f.expenses || 0).toFixed(2);
        document.getElementById('fin-inv-val').textContent = '€' + Number(f.investments || 0).toFixed(2);
        document.getElementById('fin-groc-val').textContent = '€' + Number(f.grocerySpend || 0).toFixed(2);
      }

      // Populate Smart Home Quick Switches
      if (boardRes && boardRes.ok) {
        const board = await boardRes.json();
        const swGrid = document.getElementById('quick-switches');
        swGrid.innerHTML = '';
        (board.tiles || []).slice(0, 10).forEach(t => {
          const st = board.stateMap?.[t.entity_id];
          const subSt = t.sub_entity_id ? board.stateMap?.[t.sub_entity_id] : null;
          const isOn = st?.state === 'on';
          const isToggle = ['light', 'switch'].includes(t.entity_id.split('.')[0]);
          const div = document.createElement('div');
          div.className = 'switch-pill' + (isOn ? ' on' : '');
          div.onclick = () => isToggle ? toggleSwitch(t.entity_id) : openApp('smart-canvas');
          div.innerHTML = \`
            <div style="overflow:hidden; padding-right:6px;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\${t.icon} \${t.custom_label}</div>
              <div style="font-size:11px; color:var(--muted); margin-top:2px;">
                \${st ? st.state : 'offline'} \${st?.attributes?.unit_of_measurement || ''}
                \${subSt ? (' • ' + subSt.state + ' ' + (subSt.attributes?.unit_of_measurement || '')) : ''}
              </div>
            </div>
            <span class="badge" style="color:\${isOn ? '#facc15' : '#94a3b8'};">\${isToggle ? (isOn ? 'ON' : 'OFF') : 'VIEW'}</span>
          \`;
          swGrid.appendChild(div);
        });
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

    loadCommandCenter();
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
          standaloneAppId: STANDALONE_APP_ID || null,
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

      if (STANDALONE_APP_ID && loadedApps.has(STANDALONE_APP_ID)) {
        const standaloneApp = loadedApps.get(STANDALONE_APP_ID)!;
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
