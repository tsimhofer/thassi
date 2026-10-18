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
import { renderUnifiedDashboardHtml } from './ambient-dashboard.js';
import { getHassSidebarStylerScript, syncHassFrontendFiles } from './hass-sidebar-sync.js';

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
sharedDb.exec(`
  CREATE TABLE IF NOT EXISTS system_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

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
    const injection = `<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)};${getHassSidebarStylerScript()}</script>`;
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
  syncHassFrontendFiles();
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

      if (pathname === '/healthz' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'healthy',
          service: 'thassi_host',
          version: '1.0.8',
          timestamp: new Date().toISOString(),
        });
      }

      if (pathname === '/api/orchestrator/state' && req.method === 'GET') {
        try {
          const hubRes = await fetch('http://192.168.188.46:5180/api/state');
          if (hubRes.ok) {
            return sendJson(res, 200, await hubRes.json());
          }
        } catch {
          // Fallback to cached state in sharedDb
        }
        return sendJson(res, 200, {
          activeTasks: sharedDb.kvGet('orchestrator_tasks') || [],
          recentEvents: sharedDb.kvGet('orchestrator_events') || [],
        });
      }

      if (pathname === '/api/orchestrator/events/publish' && req.method === 'POST') {
        const evt = JSON.parse((await readRequestBody(req)) || '{}');
        const list = (sharedDb.kvGet<unknown[]>('orchestrator_events') || []).slice(0, 79);
        list.unshift(evt);
        sharedDb.kvSet('orchestrator_events', list);
        return sendJson(res, 200, { published: true });
      }

      if (pathname === '/api/orchestrator/tasks/submit' && req.method === 'POST') {
        const raw = await readRequestBody(req);
        try {
          const hubRes = await fetch('http://192.168.188.46:5180/api/tasks/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: raw,
          });
          const data = await hubRes.json();
          return sendJson(res, hubRes.status, data);
        } catch (err) {
          return sendJson(res, 502, {
            error: 'Dev-PC SignalR Hub (192.168.188.46:5180) unreachable',
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (pathname === '/api/orchestrator/apk-upload' && req.method === 'POST') {
        const body = JSON.parse((await readRequestBody(req)) || '{}') as { base64?: string };
        if (!body.base64) return sendJson(res, 400, { error: 'Missing base64 APK payload' });
        const apkPath = path.join(DATA_DIR, 'thassi-control.apk');
        fs.writeFileSync(apkPath, Buffer.from(body.base64, 'base64'));
        return sendJson(res, 200, { uploaded: true, size: fs.statSync(apkPath).size });
      }

      if (pathname === '/download/thassi-control.apk' && req.method === 'GET') {
        const apkPath = path.join(DATA_DIR, 'thassi-control.apk');
        if (!fs.existsSync(apkPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('APK not uploaded yet.');
          return;
        }
        const stat = fs.statSync(apkPath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="ThassiControl.apk"',
          'Content-Length': String(stat.size),
        });
        fs.createReadStream(apkPath).pipe(res);
        return;
      }

      if (pathname === '/api/system/rooms' && req.method === 'GET') {
        const allStates = await systemHaBridge.getStates();
        const sm = new Map(allStates.map((s) => [s.entity_id, s]));
        const getVal = (id: string) => sm.get(id)?.state ?? 'unavailable';
        const getNum = (id: string) => {
          const v = Number(sm.get(id)?.state);
          return Number.isFinite(v) ? v : null;
        };

        const buildDev = (
          entityId: string,
          label: string,
          kind: 'toggle' | 'rgbw' | 'sensor' | 'camera',
          powerEntityId?: string
        ) => {
          const st = sm.get(entityId);
          const state = st?.state ?? 'unavailable';
          const powerW = powerEntityId ? getNum(powerEntityId) : null;
          const attrs = (st?.attributes || {}) as Record<string, unknown>;
          return {
            entityId,
            label,
            kind,
            state,
            isOn: state === 'on' || state === 'recording' || state === 'streaming' || state === 'playing',
            powerW,
            brightness: typeof attrs.brightness === 'number' ? Math.round((attrs.brightness / 255) * 100) : null,
            effect: (attrs.effect as string) || null,
            effectList: (attrs.effect_list as string[]) || null,
            unit: (attrs.unit_of_measurement as string) || '',
          };
        };

        const rooms = [
          {
            id: 'buro_og',
            name: 'Büro OG',
            tempC: getNum('sensor.shellyhtg3_e4b32331dde0_temperatur'),
            humidityPct: getNum('sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit'),
            devices: [
              buildDev('light.buro_og_grosses_licht', 'Großes Licht', 'toggle', 'sensor.links_power'),
              buildDev('switch.buro_og_regal_lichter', 'Regal Lichter', 'toggle', 'sensor.shellyplugsg3_e4b063e4bfd8_power'),
              buildDev('switch.buro_og_plug_90', 'Schreibtisch Plug .90', 'toggle', 'sensor.kleines_licht_pumpe_power'),
              buildDev('switch.buro_og_bewasserung_pumpe', 'Bewässerung Pumpe', 'toggle', 'sensor.schalter_neu_power'),
              buildDev('light.thomasbuero_2pm_oben_output_1', 'Schalter Oben Rechts', 'toggle', 'sensor.thomasbuero_2pm_oben_switch_1_power'),
            ],
          },
          {
            id: 'wohnkuche',
            name: 'Wohnküche',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.wohnkueche_bodenbeleuchtung_boden', 'Bodenbeleuchtung', 'toggle', 'sensor.shelly_plus_2pm_a_switch_0_power'),
              buildDev('switch.wohnkueche_fensterbank_licht', 'Fensterbank Licht', 'toggle', 'sensor.bodenbeleuchtung_power'),
              buildDev('media_player.tv_samsung_6_series_49', 'Samsung TV (49")', 'sensor'),
            ],
          },
          {
            id: 'vorzimmer_og',
            name: 'Vorzimmer OG',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.vorzimmer_og_grosses_licht', 'Großes Licht', 'toggle'),
              buildDev('light.vorzimmer_og_bodenbeleuchtung_led', 'Bodenbeleuchtung LED', 'rgbw'),
              buildDev('light.vorzimmer_og_alert_led', 'Alert LED', 'rgbw'),
              buildDev('switch.shelly2pmg3_8cbfea9ac754_output_0', 'Shelly 2PM Kanal 1', 'toggle', 'sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung'),
              buildDev('switch.shelly2pmg3_8cbfea9ac754_output_1', 'Shelly 2PM Kanal 2', 'toggle', 'sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung'),
            ],
          },
          {
            id: 'bad_gaeste',
            name: 'Bad & Gäste',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.shelly1pmminig4_7c2c676dc6fc', 'Waschmaschine Bad OG', 'toggle', 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung'),
              buildDev('switch.gaestezimmer_schalter_rechts', 'Gästezimmer Schalter 1', 'toggle', 'sensor.shellyplus2pm_c049ef8a3a78_switch_0_power'),
              buildDev('switch.shellyplus2pm_c049ef8a3a78_switch_1', 'Gästezimmer Schalter 2', 'toggle', 'sensor.shellyplus2pm_c049ef8a3a78_switch_1_power'),
              buildDev('sensor.smart_series_8000_75b4_batterie', 'Oral-B Smart Series Akku', 'sensor'),
            ],
          },
          {
            id: 'stiegenhaus_keller',
            name: 'Stiegenhaus & Keller',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('binary_sensor.shelly_blu_motion_19ca_bewegung', 'Bewegung Stiegenhaus', 'sensor'),
              buildDev('sensor.shelly_blu_motion_19ca_beleuchtungsstarke', 'Helligkeit Stiegenhaus', 'sensor'),
              buildDev('sensor.epson_xp_7100_series', 'Epson XP-7100 Drucker', 'sensor'),
              buildDev('sensor.epson_xp_7100_series_black_ink', 'Drucker Tinte Schwarz', 'sensor'),
            ],
          },
          {
            id: 'kameras_vision',
            name: 'Kameras & Vision',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('camera.garten_parkplatz_kamera', 'Draußen Hinten Werkstatt (LAN .121)', 'camera'),
              buildDev('camera.cam_eg_vz_eingang', 'EG Vorzimmer Kamera (LAN .140)', 'camera'),
              buildDev('camera.lsc_smart_ptz_camera_2', 'LSC Smart PTZ Camera 2', 'camera'),
              buildDev('camera.lsc_smart_ptz_camera_3', 'LSC Smart PTZ Camera 3', 'camera'),
              buildDev('camera.lsc_smart_outdoor_camera', 'LSC Smart Outdoor Camera', 'camera'),
              buildDev('camera.lsc_smart_indoor_camera', 'LSC Smart Indoor Camera', 'camera'),
            ],
          },
        ].map((r) => {
          const activeCount = r.devices.filter((d) => (d.kind === 'toggle' || d.kind === 'rgbw') && d.isOn).length;
          const totalPowerW = r.devices.reduce((acc, d) => acc + (d.powerW || 0), 0);
          return {
            ...r,
            activeCount,
            totalPowerW: Math.round(totalPowerW * 10) / 10,
            motionActive:
              r.id === 'stiegenhaus_keller' ? getVal('binary_sensor.shelly_blu_motion_19ca_bewegung') === 'on' : false,
          };
        });

        return sendJson(res, 200, {
          rooms,
          visionSummary: sharedDb.kvGet('camera_vision_today') || null,
        });
      }

      if (pathname === '/api/system/device-action' && req.method === 'POST') {
        const body = JSON.parse((await readRequestBody(req)) || '{}') as {
          entityId?: string;
          action?: 'toggle' | 'turn_on' | 'turn_off' | 'brightness' | 'effect';
          brightnessPct?: number;
          effect?: string;
        };
        if (!body.entityId) return sendJson(res, 400, { error: 'entityId is required' });
        const domain = body.entityId.split('.')[0];
        if (!['light', 'switch', 'media_player', 'siren', 'camera'].includes(domain)) {
          return sendJson(res, 400, { error: `Unsupported domain ${domain}` });
        }

        if (body.action === 'brightness' && domain === 'light') {
          const pct = Math.max(1, Math.min(100, Number(body.brightnessPct) || 50));
          await systemHaBridge.callService('light', 'turn_on', {
            entity_id: body.entityId,
            brightness_pct: pct,
          });
        } else if (body.action === 'effect' && domain === 'light') {
          await systemHaBridge.callService('light', 'turn_on', {
            entity_id: body.entityId,
            effect: body.effect || 'Off',
          });
        } else {
          const svc = body.action === 'turn_on' ? 'turn_on' : body.action === 'turn_off' ? 'turn_off' : 'toggle';
          await systemHaBridge.callService(domain, svc, { entity_id: body.entityId });
        }
        return sendJson(res, 200, { ok: true });
      }

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
          vision: sharedDb.kvGet('camera_vision_today') || null,
        };
        const notes = sharedDb.query<{
          id: number;
          content: string;
          pinned: number;
          created_at: string;
        }>('SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50');

        return sendJson(res, 200, {
          ha,
          google,
          apps,
          summaries,
          notes,
          jobs: scheduler.listJobs(),
          standaloneAppId:
            ((req.headers['x-thassi-standalone-app'] as string) || '').trim() ||
            STANDALONE_APP_ID ||
            null,
        });
      }

      if (pathname === '/api/system/notes' && req.method === 'GET') {
        const notes = sharedDb.query('SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50');
        return sendJson(res, 200, { notes });
      }

      if (pathname === '/api/system/notes' && req.method === 'POST') {
        const body = JSON.parse((await readRequestBody(req)) || '{}') as { content?: string };
        if (!body.content?.trim()) {
          return sendJson(res, 400, { error: 'Note content is required' });
        }
        const info = sharedDb.execute(
          'INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)',
          [body.content.trim(), new Date().toISOString()]
        );
        return sendJson(res, 200, { id: info.lastInsertRowid });
      }

      if (pathname === '/api/system/notes' && req.method === 'DELETE') {
        const id = Number(queryObj.id);
        sharedDb.execute('DELETE FROM system_notes WHERE id = ?', [id]);
        return sendJson(res, 200, { deleted: id });
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
