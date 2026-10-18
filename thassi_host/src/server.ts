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

// Load local .env if present during development
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
const DATA_DIR = path.resolve(process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data'));
const STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || '';

fs.mkdirSync(path.join(DATA_DIR, 'apps'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'deployed_apps'), { recursive: true });

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

  // Clear previous jobs if reloading
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

  // Find backend entry (either compiled backend.mjs or source backend/index.ts in dev)
  const compiledBackend = path.join(appDir, 'backend.mjs');
  const devBackend = path.join(appDir, 'backend', 'index.ts');
  const backendFile = fs.existsSync(compiledBackend)
    ? compiledBackend
    : fs.existsSync(devBackend)
      ? devBackend
      : null;

  if (backendFile) {
    // Cache-bust import URL for hot-reload support
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
  // 1. Check built-in apps in dist/apps (production) or repo apps/ (dev)
  const candidateBuiltInDirs = [
    path.join(__dirname, 'apps'),
    path.resolve(process.cwd(), 'thassi_host', 'dist', 'apps'),
    path.resolve(process.cwd(), 'apps'),
  ];

  for (const baseDir of candidateBuiltInDirs) {
    if (!fs.existsSync(baseDir)) continue;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
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

  // 2. Check hot-deployed apps in /data/deployed_apps (overrides built-in)
  const deployedBase = path.join(DATA_DIR, 'deployed_apps');
  if (fs.existsSync(deployedBase)) {
    for (const entry of fs.readdirSync(deployedBase, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try {
          await loadAppFromDirectory(path.join(deployedBase, entry.name), 'hot-deployed');
        } catch (err) {
          console.error(`[Thassi] Error loading hot-deployed app ${entry.name}:`, err);
        }
      }
    }
  }
}

function sendJson(res: http.ServerResponse, status: number, data: unknown, extraHeaders: Record<string, string> = {}) {
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

function renderHubHtml(ingressPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Personal App Hub</title>
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
      padding: 14px 24px;
      background: #0f172a;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 18px;
      color: var(--accent);
    }
    .nav-tabs {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    .btn.active, .btn.primary {
      background: var(--accent-dark);
      border-color: var(--accent);
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 18px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      background: #0f172a;
      color: var(--accent);
      border: 1px solid var(--border);
    }
    input, textarea {
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
      height: calc(100vh - 59px);
      width: 100%;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #7dd3fc;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <span>⚡ Thassi Personal App Hub</span>
      <span id="ha-pill" class="badge">Checking HA...</span>
    </div>
    <div class="nav-tabs">
      <button class="btn active" id="tab-apps" onclick="switchView('apps')">🚀 Installed WebApps</button>
      <button class="btn" id="tab-integrations" onclick="switchView('integrations')">🔐 HA & Google OAuth Vault</button>
      <button class="btn" id="tab-workflow" onclick="switchView('workflow')">🛠️ CLI & Git Add-on Workflow</button>
    </div>
  </div>

  <div id="app-iframe-container">
    <iframe id="app-frame" src="about:blank"></iframe>
  </div>

  <div class="container" id="main-container">
    <div id="view-apps">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2 style="margin:0;">Your Installed WebApps</h2>
          <p style="margin:4px 0 0; color:var(--muted); font-size:14px;">
            Launch any app below inside Home Assistant, or deploy new apps in &lt;1s with <code>npm run deploy &lt;app&gt;</code>.
          </p>
        </div>
      </div>
      <div class="grid" id="apps-grid"></div>
    </div>

    <div id="view-integrations" style="display:none;">
      <div class="grid" style="grid-template-columns: 1fr 1fr;">
        <div class="card">
          <h3 style="margin-top:0;">🏠 Home Assistant Connection</h3>
          <p id="ha-status-text" style="color:var(--muted); font-size:13px;"></p>
          <p style="font-size:12px; color:var(--muted);">
            When running as a Home Assistant Add-on, <code>SUPERVISOR_TOKEN</code> is injected automatically. For local dev or custom override, configure below:
          </p>
          <label>Home Assistant URL</label>
          <input id="ha-url-input" placeholder="http://192.168.188.92:8123" />
          <label>Long-Lived Access Token</label>
          <input id="ha-token-input" type="password" placeholder="Paste HA Long-Lived Access Token" />
          <button class="btn primary" onclick="saveHaConfig()">Save & Test HA Connection</button>
        </div>

        <div class="card">
          <h3 style="margin-top:0;">📅 Shared Google OAuth2 Vault (Calendar & Health)</h3>
          <p id="google-status-text" style="color:var(--muted); font-size:13px;"></p>
          <label>Google OAuth Client ID</label>
          <input id="google-client-id" placeholder="xxx.apps.googleusercontent.com" />
          <label>Google OAuth Client Secret</label>
          <input id="google-client-secret" type="password" placeholder="GOCSPX-..." />
          <label>Redirect URI</label>
          <input id="google-redirect-uri" placeholder="http://192.168.188.92:8099/api/system/google/callback" />
          <div style="display:flex; gap:8px;">
            <button class="btn primary" onclick="saveGoogleConfig()">Save Credentials</button>
            <button class="btn" onclick="startGoogleOAuth()">Authorize with Google ↗</button>
          </div>
        </div>
      </div>
    </div>

    <div id="view-workflow" style="display:none;">
      <div class="card">
        <h3 style="margin-top:0;">🛠️ Thassi Developer & Deployment Commands</h3>
        <p style="color:var(--muted); font-size:14px;">
          Run these commands in your <code>c:\\Users\\thoma\\source\\repos\\thassi</code> repository:
        </p>
        <div style="display:grid; gap:12px; margin-top:16px;">
          <div style="padding:12px; background:#0f172a; border-radius:8px; border:1px solid var(--border);">
            <strong>1. Scaffold a New Full-Stack App (e.g. Meal Planner, Finance, Health, Notes)</strong>
            <div style="margin-top:6px;"><code>npm.cmd run create -- meal-planner "Meal Planner"</code></div>
          </div>
          <div style="padding:12px; background:#0f172a; border-radius:8px; border:1px solid var(--border);">
            <strong>2. Hot-Deploy an App to Running Thassi Hub in &lt;1 second (No Docker Rebuild!)</strong>
            <div style="margin-top:6px;"><code>npm.cmd run deploy -- meal-planner</code></div>
          </div>
          <div style="padding:12px; background:#0f172a; border-radius:8px; border:1px solid var(--border);">
            <strong>3. Export an App as a Standalone Home Assistant Add-on (Dedicated Sidebar Tab in Git Repo)</strong>
            <div style="margin-top:6px;"><code>npm.cmd run export -- meal-planner</code></div>
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">
              Generates a top-level <code>thassi_app_meal_planner/</code> folder with its own <code>config.yaml</code> &amp; <code>Dockerfile</code> so you can install it as an independent add-on from the HA Add-on Store.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const base = window.__THASSI_INGRESS_PATH__ ? window.__THASSI_INGRESS_PATH__.replace(/\\/+$/, '') : '';

    function switchView(view) {
      document.getElementById('app-iframe-container').style.display = 'none';
      document.getElementById('main-container').style.display = 'block';
      ['apps', 'integrations', 'workflow'].forEach(v => {
        document.getElementById('view-' + v).style.display = (v === view) ? 'block' : 'none';
        const btn = document.getElementById('tab-' + v);
        if (btn) btn.className = (v === view) ? 'btn active' : 'btn';
      });
    }

    function openApp(appId) {
      document.getElementById('main-container').style.display = 'none';
      const container = document.getElementById('app-iframe-container');
      const frame = document.getElementById('app-frame');
      frame.src = base + '/apps/' + encodeURIComponent(appId) + '/';
      container.style.display = 'block';
      ['apps', 'integrations', 'workflow'].forEach(v => {
        const btn = document.getElementById('tab-' + v);
        if (btn) btn.className = 'btn';
      });
    }

    async function loadDashboard() {
      const res = await fetch(base + '/api/system/status');
      const data = await res.json();

      const pill = document.getElementById('ha-pill');
      pill.textContent = data.ha.connected ? ('HA Connected (' + data.ha.mode + ')') : 'HA Token Needed';
      pill.style.color = data.ha.connected ? '#4ade80' : '#facc15';

      document.getElementById('ha-status-text').textContent = data.ha.message || '';
      document.getElementById('ha-url-input').value = data.ha.haUrl || 'http://192.168.188.92:8123';

      document.getElementById('google-status-text').textContent = data.google.authorized
        ? '✅ Authorized with Google OAuth2'
        : (data.google.configured ? 'Credentials saved — click Authorize with Google' : 'Not configured yet');
      if (data.google.redirectUri) {
        document.getElementById('google-redirect-uri').value = data.google.redirectUri;
      }

      const grid = document.getElementById('apps-grid');
      grid.innerHTML = '';
      data.apps.forEach(app => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = \`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="badge">\${app.source}</span>
            <span style="font-size:12px; color:var(--muted);">v\${app.version}</span>
          </div>
          <h3 style="margin:0 0 8px 0; color:var(--accent);">\${app.name}</h3>
          <p style="margin:0 0 16px 0; color:var(--muted); font-size:13px; line-height:1.4;">\${app.description}</p>
          <div style="display:flex; gap:8px;">
            <button class="btn primary" style="flex:1;" onclick="openApp('\${app.id}')">Launch App</button>
            <a class="btn" href="\${base}/apps/\${encodeURIComponent(app.id)}/" target="_blank" style="text-decoration:none;">↗</a>
          </div>
        \`;
        grid.appendChild(div);
      });
    }

    async function saveHaConfig() {
      const haUrl = document.getElementById('ha-url-input').value;
      const haToken = document.getElementById('ha-token-input').value;
      await fetch(base + '/api/system/ha-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken })
      });
      await loadDashboard();
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
      await loadDashboard();
    }

    async function startGoogleOAuth() {
      const res = await fetch(base + '/api/system/google/auth-url');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        alert(data.error || 'Configure Client ID & Secret first');
      }
    }

    loadDashboard();
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

  // 1. Built-in SQLite & CSV Analysis Endpoints (`/_db/*`)
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

  // 2. Built-in Home Assistant Bridge Endpoints (`/_ha/*`)
  if (subRoute === '/_ha/status' && method === 'GET') {
    return sendJson(res, 200, await app.ha.getStatus());
  }
  if (subRoute === '/_ha/states' && method === 'GET') {
    const states = await app.ha.getStates(queryObj.domain);
    return sendJson(res, 200, { states });
  }
  if (subRoute === '/_ha/service' && method === 'POST') {
    const body = parsedBody as { domain: string; service: string; serviceData?: Record<string, unknown> };
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

  // 3. Built-in Background Cron Job Endpoints (`/_jobs/*`)
  if (subRoute === '/_jobs' && method === 'GET') {
    return sendJson(res, 200, { jobs: scheduler.listJobs(app.manifest.id) });
  }
  const jobRunMatch = subRoute.match(/^\/_jobs\/([^/]+)\/run$/);
  if (jobRunMatch && method === 'POST') {
    const job = await scheduler.triggerJob(app.manifest.id, decodeURIComponent(jobRunMatch[1]));
    return sendJson(res, 200, { job });
  }

  // 4. Built-in Shared Google OAuth Endpoints (`/_google/*`)
  if (subRoute === '/_google/status' && method === 'GET') {
    return sendJson(res, 200, googleOAuth.getStatus());
  }
  if (subRoute === '/_google/calendar/upcoming' && method === 'GET') {
    const events = await googleOAuth.fetchUpcomingCalendarEvents(Number(queryObj.maxResults) || 15);
    return sendJson(res, 200, { events });
  }

  // 5. Custom App Route Handler (`ctx.route(...)`)
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

      // System API routes (`/api/system/*`)
      if (pathname === '/api/system/status' && req.method === 'GET') {
        const ha = await systemHaBridge.getStatus();
        const google = googleOAuth.getStatus();
        const apps = Array.from(loadedApps.values()).map((a) => ({
          ...a.manifest,
          source: a.source,
          updatedAt: a.updatedAt,
        }));
        return sendJson(res, 200, {
          ha,
          google,
          apps,
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
          haToken: body.haToken !== undefined && body.haToken !== '' ? body.haToken : current.haToken,
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
        res.end('<h2>✅ Google Account Connected to Thassi Hub!</h2><p>You can close this tab now.</p>');
        return;
      }

      // Hot-Deploy endpoint (`POST /api/system/deploy`) called by `npm run deploy <app>`
      if (pathname === '/api/system/deploy' && req.method === 'POST') {
        const payload = JSON.parse(await readRequestBody(req)) as {
          manifest: ThassiAppManifest;
          backendCode: string;
          frontendFiles: Record<string, string>; // relativePath -> base64 content
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

      // App API routes (`/api/apps/<appId>/*`)
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

      // App Frontend routes (`/apps/<appId>/*`)
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

      // If running as a standalone exported Home Assistant Add-on, serve that app directly at `/`
      if (STANDALONE_APP_ID && loadedApps.has(STANDALONE_APP_ID)) {
        const standaloneApp = loadedApps.get(STANDALONE_APP_ID)!;
        serveAppStaticFile(req, res, standaloneApp, pathname, '');
        return;
      }

      // Root `/` renders the Thassi App Launcher & Control Center UI
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHubHtml(ingressPath));
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
    console.log(`[Thassi] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[Thassi] Installed apps (${loadedApps.size}): ${Array.from(loadedApps.keys()).join(', ')}`);
  });
}

void startServer();
