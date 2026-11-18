import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.GUARDIAN_PORT || 3333);
const HA_IP = '192.168.188.92';
const SHELLY_IP = '192.168.188.100';
const HA_TOKEN =
  process.env.HA_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwNDVjNGVmMzQ3MTg0MzM1YjIxNmMwNmU0ZmVmNGVhNiIsImlhdCI6MTc5MjM0NDk3OSwiZXhwIjoyMTA3NzA0OTc5fQ.pkgxUTTlpPqUC8NZJRO0aHGurLIBUiw1JNneTNxgsZQ';

const STATE_FILE = path.join(__dirname, 'state-history.json');
const POLL_INTERVAL_MS = 3000;
const MAX_HISTORY_POINTS = 600; // 30 minutes @ 3s
const MAX_EVENTS = 120;

function detectLanAddresses() {
  const nets = os.networkInterfaces();
  let lanIp = '127.0.0.1';
  let tailscaleIp = null;
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        if (entry.address.startsWith('192.168.188.')) {
          lanIp = entry.address;
        } else if (entry.address.startsWith('100.')) {
          tailscaleIp = entry.address;
        }
      }
    }
  }
  return { lanIp, tailscaleIp };
}

const { lanIp: LOCAL_LAN_IP, tailscaleIp: TAILSCALE_IP } = detectLanAddresses();

// Bind outgoing LAN requests to the 192.168.188.x interface so VPN/Hyper-V never misroutes
function httpGetQuick(urlStr, timeoutMs = 1200, headers = {}) {
  const parsed = new URL(urlStr);
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port || 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        localAddress: LOCAL_LAN_IP !== '127.0.0.1' ? LOCAL_LAN_IP : undefined,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const latencyMs = Date.now() - start;
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({
            ok: (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 400,
            status: res.statusCode || 500,
            latencyMs,
            body,
            error: null,
          });
        });
      }
    );
    req.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        latencyMs: Date.now() - start,
        body: '',
        error: err.code || err.message || 'ERR',
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        ok: false,
        status: 0,
        latencyMs: timeoutMs,
        body: '',
        error: 'TIMEOUT',
      });
    });
    req.end();
  });
}

function httpPostJson(urlStr, payloadObj, timeoutMs = 8000, headers = {}) {
  const parsed = new URL(urlStr);
  const bodyBuf = payloadObj ? Buffer.from(JSON.stringify(payloadObj), 'utf-8') : Buffer.alloc(0);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port || 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        localAddress: LOCAL_LAN_IP !== '127.0.0.1' ? LOCAL_LAN_IP : undefined,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.byteLength,
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          resolve({
            ok: (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 400,
            status: res.statusCode || 500,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, status: 0, body: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: 'TIMEOUT' });
    });
    if (bodyBuf.byteLength > 0) req.write(bodyBuf);
    req.end();
  });
}

// Persistent state
let state = {
  startedAt: new Date().toISOString(),
  lastUpdatedAt: null,
  pollCount: 0,
  everSeen4357Up: false,
  upSince: {
    p4357: null,
    p8123: null,
    p8099: null,
  },
  current: {
    shelly: {
      reachable: false,
      ison: null,
      powerW: null,
      avg3mW: null,
      tempC: null,
      rssi: null,
      totalWh: null,
    },
    ports: {
      p4357: { ok: false, status: 0, latencyMs: null, error: null },
      p8123: { ok: false, status: 0, latencyMs: null, error: null },
      p8099: { ok: false, status: 0, latencyMs: null, error: null },
    },
    verdict: {
      code: 'INIT',
      severity: 'warn', // nominal | warn | error
      label: 'INITIALISIERUNG...',
      detail: 'Erste Messung läuft...',
      recommendation: '',
    },
  },
  history: [],
  events: [],
  lastManualDiagnosis: null,
};

function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (Array.isArray(raw.history)) state.history = raw.history.slice(-MAX_HISTORY_POINTS);
      if (Array.isArray(raw.events)) state.events = raw.events.slice(0, MAX_EVENTS);
      if (raw.lastManualDiagnosis) state.lastManualDiagnosis = raw.lastManualDiagnosis;
      if (raw.upSince) state.upSince = raw.upSince;
    }
  } catch (e) {
    console.error('[Guardian] Could not load persisted state:', e.message);
  }
}

function savePersistedState() {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      upSince: state.upSince,
      history: state.history.slice(-MAX_HISTORY_POINTS),
      events: state.events.slice(0, MAX_EVENTS),
      lastManualDiagnosis: state.lastManualDiagnosis,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Guardian] Could not save state:', e.message);
  }
}

function pushEvent(type, title, detail, severity = 'info') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    type,
    severity, // nominal | warn | error | info
    title,
    detail,
    powerW: state.current.shelly.powerW,
  };
  state.events.unshift(entry);
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
  savePersistedState();
}

function computeVerdict(shelly, ports) {
  const p4357 = ports.p4357.ok;
  const p8123 = ports.p8123.ok;
  const p8099 = ports.p8099.ok;
  const ison = shelly.ison;
  const w = shelly.powerW;

  if (shelly.reachable && (ison === false || (w !== null && w < 0.8))) {
    return {
      code: 'POWER_OFF',
      severity: 'error',
      label: 'STROM AUS (SHELLY ABGESCHALTET)',
      detail: `Die Shelly-Steckdose (${SHELLY_IP}) liefert aktuell ${w ?? 0} W.`,
      recommendation: 'Steckdose einschalten und danach den physischen Power-Button am Mini-PC drücken.',
    };
  }

  if (!p4357 && !p8123 && !p8099) {
    const wattText = w !== null ? `${w.toFixed(2)} W` : 'Unbekannt';
    if (state.everSeen4357Up) {
      return {
        code: 'HARD_FREEZE',
        severity: 'error',
        label: 'SYSTEM EINGEFROREN / OFFLINE (HARD FREEZE)',
        detail: `Mini-PC zieht ${wattText}, aber weder OS Observer (:4357) noch Home Assistant (:8123) antworten.`,
        recommendation: 'Physischen Power-Button am Mini-PC 5 Sekunden gedrückt halten, dann erneut kurz drücken.',
      };
    }
    return {
      code: 'OFFLINE_WITH_POWER',
      severity: 'error',
      label: 'OFFLINE TROTZ STROM (' + wattText + ')',
      detail: `Steckdose ist EIN (${wattText}), aber kein Port (:4357 / :8123 / :8099) ist erreichbar.`,
      recommendation: 'Entweder wartet der PC nach einem Stromausfall auf den physischen Power-Button, oder er ist eingefroren.',
    };
  }

  if (p4357 && !p8123) {
    return {
      code: 'BOOTING_HA_CORE',
      severity: 'warn',
      label: 'OS ONLINE (:4357) — HOME ASSISTANT (:8123) STARTET NOCH',
      detail: `HA OS Observer antwortet in ${ports.p4357.latencyMs} ms. Home Assistant Core (:8123) lädt gerade (${w !== null ? w.toFixed(2) + ' W' : ''}).`,
      recommendation: 'Bitte 30–60 Sekunden warten, bis Port :8123 auf ONLINE wechselt.',
    };
  }

  if (p8123 && !p8099) {
    return {
      code: 'HA_ONLINE_THASSI_PAUSED',
      severity: 'nominal',
      label: 'HOME ASSISTANT STABIL (:8123 ONLINE) — THASSI (:8099) PAUSIERT',
      detail: `Home Assistant Core (:8123) antwortet in ${ports.p8123.latencyMs} ms (${w !== null ? w.toFixed(2) + ' W' : ''}). Thassi Horizon (:8099) ist gestoppt.`,
      recommendation: 'Sicherer Isolations-Modus: HA Core läuft ohne Thassi-Hintergrundlast stabil durch.',
    };
  }

  if (p8123 && p8099) {
    return {
      code: 'ALL_ONLINE',
      severity: 'nominal',
      label: 'ALLE SYSTEME ONLINE (:4357 + :8123 + :8099)',
      detail: `Home Assistant (:8123 in ${ports.p8123.latencyMs} ms) und Thassi Horizon (:8099 in ${ports.p8099.latencyMs} ms) sind erreichbar.`,
      recommendation: 'Alle Dienste antworten normal.',
    };
  }

  return {
    code: 'PARTIAL',
    severity: 'warn',
    label: 'TEILWEISE ERREICHBAR',
    detail: `4357=${p4357 ? 'OK' : 'DOWN'} | 8123=${p8123 ? 'OK' : 'DOWN'} | 8099=${p8099 ? 'OK' : 'DOWN'}`,
    recommendation: 'Status der einzelnen Ports prüfen.',
  };
}

let isPolling = false;
async function runPassivePoll() {
  if (isPolling) return;
  isPolling = true;
  try {
    const prevPorts = {
      p4357: state.current.ports.p4357.ok,
      p8123: state.current.ports.p8123.ok,
      p8099: state.current.ports.p8099.ok,
    };
    const prevVerdictCode = state.current.verdict.code;
    const isFirstPoll = state.pollCount === 0;

    // Parallel zero-load checks:
    // 1. Shelly Plug directly via HTTP (0 load on HA)
    // 2. HA OS Observer :4357 (static C/Go probe)
    // 3. HA Core :8123/manifest.json (static file, 0 DB load)
    // 4. Thassi Horizon :8099/healthz (static JSON, 0 DB load)
    const [shellyRes, res4357, res8123, res8099] = await Promise.all([
      httpGetQuick(`http://${SHELLY_IP}/status`, 1200),
      httpGetQuick(`http://${HA_IP}:4357/`, 1200),
      httpGetQuick(`http://${HA_IP}:8123/manifest.json`, 1200),
      httpGetQuick(`http://${HA_IP}:8099/healthz`, 1200),
    ]);

    const shellyData = {
      reachable: false,
      ison: null,
      powerW: null,
      avg3mW: null,
      tempC: null,
      rssi: null,
      totalWh: null,
    };

    if (shellyRes.ok) {
      try {
        const j = JSON.parse(shellyRes.body);
        shellyData.reachable = true;
        shellyData.ison = Boolean(j.relays?.[0]?.ison);
        shellyData.powerW = typeof j.meters?.[0]?.power === 'number' ? j.meters[0].power : null;
        const counters = j.meters?.[0]?.counters;
        if (Array.isArray(counters) && counters.length > 0) {
          shellyData.avg3mW = Number((counters.reduce((a, b) => a + b, 0) / counters.length).toFixed(2));
        }
        shellyData.tempC = typeof j.temperature === 'number' ? j.temperature : j.tmp?.tC ?? null;
        shellyData.rssi = j.wifi_sta?.rssi ?? null;
        shellyData.totalWh = j.meters?.[0]?.total ?? null;
      } catch {}
    }

    const nowIso = new Date().toISOString();
    const ports = {
      p4357: { ok: res4357.ok, status: res4357.status, latencyMs: res4357.ok ? res4357.latencyMs : null, error: res4357.error },
      p8123: { ok: res8123.ok, status: res8123.status, latencyMs: res8123.ok ? res8123.latencyMs : null, error: res8123.error },
      p8099: { ok: res8099.ok, status: res8099.status, latencyMs: res8099.ok ? res8099.latencyMs : null, error: res8099.error },
    };

    if (ports.p4357.ok) state.everSeen4357Up = true;

    // Update continuous uptime trackers
    for (const key of ['p4357', 'p8123', 'p8099']) {
      if (ports[key].ok) {
        if (!state.upSince[key]) state.upSince[key] = nowIso;
      } else {
        state.upSince[key] = null;
      }
    }

    const verdict = computeVerdict(shellyData, ports);

    state.current = {
      shelly: shellyData,
      ports,
      verdict,
    };
    state.lastUpdatedAt = nowIso;
    state.pollCount += 1;

    // Record history point
    state.history.push({
      ts: nowIso,
      w: shellyData.powerW,
      tempC: shellyData.tempC,
      p4357: ports.p4357.ok ? ports.p4357.latencyMs : -1,
      p8123: ports.p8123.ok ? ports.p8123.latencyMs : -1,
      p8099: ports.p8099.ok ? ports.p8099.latencyMs : -1,
    });
    if (state.history.length > MAX_HISTORY_POINTS) {
      state.history.shift();
    }

    // Detect transitions
    if (isFirstPoll) {
      pushEvent(
        'STARTUP',
        `Guardian gestartet: ${verdict.label}`,
        `Shelly: ${shellyData.powerW ?? '?'} W | :4357=${ports.p4357.ok ? 'ONLINE' : 'OFFLINE'} | :8123=${ports.p8123.ok ? 'ONLINE' : 'OFFLINE'} | :8099=${ports.p8099.ok ? 'ONLINE' : 'PAUSIERT'}`,
        verdict.severity
      );
    } else {
      if (prevPorts.p4357 !== ports.p4357.ok) {
        pushEvent(
          'PORT_4357',
          ports.p4357.ok ? 'OS Observer (:4357) ist jetzt ONLINE' : 'OS Observer (:4357) ist AUSGEFALLEN!',
          ports.p4357.ok ? `Antwortzeit: ${ports.p4357.latencyMs} ms` : `Fehler: ${ports.p4357.error || 'Keine Antwort'}`,
          ports.p4357.ok ? 'nominal' : 'error'
        );
      }
      if (prevPorts.p8123 !== ports.p8123.ok) {
        pushEvent(
          'PORT_8123',
          ports.p8123.ok ? 'Home Assistant Core (:8123) ist jetzt ONLINE' : 'Home Assistant Core (:8123) nicht erreichbar!',
          ports.p8123.ok ? `Antwortzeit: ${ports.p8123.latencyMs} ms` : `Fehler: ${ports.p8123.error || 'Keine Antwort'}`,
          ports.p8123.ok ? 'nominal' : 'error'
        );
      }
      if (prevPorts.p8099 !== ports.p8099.ok) {
        pushEvent(
          'PORT_8099',
          ports.p8099.ok ? 'Thassi Horizon (:8099) ist jetzt ONLINE' : 'Thassi Horizon (:8099) gestoppt / pausiert',
          ports.p8099.ok ? `Antwortzeit: ${ports.p8099.latencyMs} ms` : 'Port :8099 antwortet nicht (Add-on gestoppt)',
          ports.p8099.ok ? 'nominal' : 'warn'
        );
      }
      if (prevVerdictCode !== verdict.code && prevVerdictCode !== 'INIT') {
        pushEvent('VERDICT', `Zustandswechsel: ${verdict.label}`, verdict.detail, verdict.severity);
      }
    }

    if (state.pollCount % 10 === 0) {
      savePersistedState();
    }
  } finally {
    isPolling = false;
  }
}

async function runOnDemandDiagnosis() {
  const authHeaders = { Authorization: `Bearer ${HA_TOKEN}` };
  const diag = {
    ts: new Date().toISOString(),
    haConfig: null,
    entitySummary: null,
    errorLogTail: null,
    thassiMetrics: null,
    errors: [],
  };

  // 1. Check HA Core /api/config & /api/error_log
  if (state.current.ports.p8123.ok) {
    const [cfgRes, errRes, statesRes] = await Promise.all([
      httpGetQuick(`http://${HA_IP}:8123/api/config`, 4000, authHeaders),
      httpGetQuick(`http://${HA_IP}:8123/api/error_log`, 4000, authHeaders),
      httpGetQuick(`http://${HA_IP}:8123/api/states`, 5000, authHeaders),
    ]);

    if (cfgRes.ok) {
      try {
        const c = JSON.parse(cfgRes.body);
        diag.haConfig = {
          version: c.version,
          state: c.state,
          locationName: c.location_name,
          timeZone: c.time_zone,
          componentsCount: Array.isArray(c.components) ? c.components.length : 0,
        };
      } catch (e) {
        diag.errors.push(`Config parse: ${e.message}`);
      }
    } else {
      diag.errors.push(`HA /api/config: HTTP ${cfgRes.status} (${cfgRes.error || ''})`);
    }

    if (errRes.ok) {
      const lines = errRes.body
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .slice(-30);
      diag.errorLogTail = lines.length > 0 ? lines.join('\n') : '(Keine Einträge im aktuellen Home Assistant error_log)';
    }

    if (statesRes.ok) {
      try {
        const arr = JSON.parse(statesRes.body);
        if (Array.isArray(arr)) {
          const unavail = arr.filter((x) => x.state === 'unavailable').length;
          const cams = arr
            .filter((x) => String(x.entity_id).startsWith('camera.'))
            .map((x) => `${x.entity_id}: ${x.state}`);
          const sysSensors = arr
            .filter((x) => /cpu|memory|ram|disk|uptime|processor|load/i.test(String(x.entity_id)))
            .slice(0, 12)
            .map((x) => `${x.entity_id} = ${x.state} ${x.attributes?.unit_of_measurement || ''}`.trim());
          diag.entitySummary = {
            totalEntities: arr.length,
            unavailableCount: unavail,
            cameras: cams,
            systemSensors: sysSensors,
          };
        }
      } catch {}
    }
  } else {
    diag.errors.push('Home Assistant Core (:8123) ist aktuell offline — kein API-Abruf möglich.');
  }

  // 2. If Thassi :8099 is online, query lightweight system-monitor metrics once
  if (state.current.ports.p8099.ok) {
    const metRes = await httpGetQuick(`http://${HA_IP}:8099/api/apps/system-monitor/metrics`, 4000);
    if (metRes.ok) {
      try {
        diag.thassiMetrics = JSON.parse(metRes.body);
      } catch {}
    }
  }

  state.lastManualDiagnosis = diag;
  pushEvent(
    'MANUAL_DIAG',
    'Manuelle On-Demand-Diagnose ausgeführt',
    diag.haConfig
      ? `HA ${diag.haConfig.version} (${diag.haConfig.state}) | ${diag.entitySummary?.totalEntities ?? '?'} Entitäten`
      : diag.errors.join('; ') || 'Abgeschlossen',
    diag.errors.length > 0 ? 'warn' : 'nominal'
  );
  savePersistedState();
  return diag;
}

async function handleAction(action) {
  const authHeaders = { Authorization: `Bearer ${HA_TOKEN}` };

  if (action === 'diagnose_now') {
    const diag = await runOnDemandDiagnosis();
    return { ok: true, message: 'On-Demand-Diagnose abgeschlossen.', diagnosis: diag };
  }

  if (action === 'thassi_stop') {
    const res = await httpPostJson(
      `http://${HA_IP}:8123/api/services/hassio/addon_stop`,
      { addon: '44ec3c40_thassi_host' },
      8000,
      authHeaders
    );
    pushEvent(
      'ACTION',
      'Aktion: Thassi Horizon (:8099) pausieren gesendet',
      `HTTP ${res.status}`,
      res.ok ? 'nominal' : 'error'
    );
    setTimeout(runPassivePoll, 1000);
    return { ok: res.ok, message: res.ok ? 'Thassi Horizon (:8099) wurde pausiert.' : `Fehler: HTTP ${res.status} ${res.body}` };
  }

  if (action === 'thassi_start') {
    const res = await httpPostJson(
      `http://${HA_IP}:8123/api/services/hassio/addon_start`,
      { addon: '44ec3c40_thassi_host' },
      8000,
      authHeaders
    );
    pushEvent(
      'ACTION',
      'Aktion: Thassi Horizon (:8099) starten gesendet',
      `HTTP ${res.status}`,
      res.ok ? 'nominal' : 'error'
    );
    setTimeout(runPassivePoll, 1500);
    return { ok: res.ok, message: res.ok ? 'Thassi Horizon (:8099) Start-Befehl gesendet.' : `Fehler: HTTP ${res.status} ${res.body}` };
  }

  if (action === 'ha_core_restart') {
    const res = await httpPostJson(`http://${HA_IP}:8123/api/services/homeassistant/restart`, {}, 8000, authHeaders);
    pushEvent('ACTION', 'Aktion: Home Assistant Core Neustart ausgelöst', `HTTP ${res.status}`, res.ok ? 'warn' : 'error');
    setTimeout(runPassivePoll, 1500);
    return { ok: res.ok, message: res.ok ? 'Home Assistant Core startet neu...' : `Fehler: HTTP ${res.status}` };
  }

  if (action === 'host_reboot') {
    const res = await httpPostJson(`http://${HA_IP}:8123/api/services/hassio/host_reboot`, {}, 8000, authHeaders);
    pushEvent('ACTION', 'Aktion: Sauberer Host-Reboot ausgelöst', `HTTP ${res.status}`, res.ok ? 'warn' : 'error');
    setTimeout(runPassivePoll, 1500);
    return { ok: res.ok, message: res.ok ? 'Host-Reboot über Supervisor ausgelöst...' : `Fehler: HTTP ${res.status}` };
  }

  if (action === 'shelly_cycle') {
    // Shelly Plug S built-in off-with-timer: turns off and automatically back on after 5 seconds!
    const res = await httpGetQuick(`http://${SHELLY_IP}/relay/0?turn=off&timer=5`, 3000);
    pushEvent(
      'ACTION',
      'Notfall-Aktion: Shelly-Steckdose für 5s ausgeschaltet (Power-Cycle)',
      res.ok ? 'Schaltet in 5s automatisch wieder ein. Danach physischen Power-Button am PC drücken!' : `Fehler: ${res.error}`,
      'warn'
    );
    setTimeout(runPassivePoll, 1000);
    return {
      ok: res.ok,
      message: res.ok
        ? 'Steckdose für 5 Sekunden abgeschaltet. WICHTIG: Danach physischen Power-Button am Mini-PC drücken!'
        : `Shelly-Fehler: ${res.error}`,
    };
  }

  if (action === 'shelly_on') {
    const res = await httpGetQuick(`http://${SHELLY_IP}/relay/0?turn=on`, 3000);
    pushEvent('ACTION', 'Aktion: Shelly-Steckdose EINGESCHALTET', `HTTP ${res.status}`, res.ok ? 'nominal' : 'error');
    setTimeout(runPassivePoll, 800);
    return { ok: res.ok, message: res.ok ? 'Steckdose eingeschaltet.' : `Fehler: ${res.error}` };
  }

  if (action === 'shelly_off') {
    const res = await httpGetQuick(`http://${SHELLY_IP}/relay/0?turn=off`, 3000);
    pushEvent('ACTION', 'Aktion: Shelly-Steckdose AUSGESCHALTET', `HTTP ${res.status}`, 'warn');
    setTimeout(runPassivePoll, 800);
    return { ok: res.ok, message: res.ok ? 'Steckdose ausgeschaltet.' : `Fehler: ${res.error}` };
  }

  return { ok: false, message: `Unbekannte Aktion: ${action}` };
}

function renderDashboardHtml() {
  const lanUrl = `http://${LOCAL_LAN_IP}:${PORT}`;
  const tailscaleUrl = TAILSCALE_IP ? `http://${TAILSCALE_IP}:${PORT}` : null;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>HA Guardian — Lokales Diagnose-Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-canvas: #09090b;
      --bg-elevated: #111113;
      --bg-input: #141417;
      --line-hairline: rgba(255, 255, 255, 0.07);
      --line-strong: rgba(255, 255, 255, 0.14);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;
      --status-nominal: #10b981;
      --status-warn: #f59e0b;
      --status-error: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
    .shell {
      max-width: 1280px;
      margin: 0 auto;
      border-left: 1px solid var(--line-hairline);
      border-right: 1px solid var(--line-hairline);
      min-height: 100vh;
    }
    /* Header Strip */
    .topbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .brand-sub {
      font-size: 11px;
      color: var(--text-secondary);
      padding-left: 10px;
      border-left: 1px solid var(--line-hairline);
    }
    .freshness-strip {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot.nominal { background: var(--status-nominal); }
    .dot.warn { background: var(--status-warn); }
    .dot.error { background: var(--status-error); }

    /* Verdict Banner */
    .verdict-banner {
      padding: 18px 20px;
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .verdict-banner.nominal { border-left: 3px solid var(--status-nominal); }
    .verdict-banner.warn { border-left: 3px solid var(--status-warn); }
    .verdict-banner.error { border-left: 3px solid var(--status-error); background: rgba(239, 68, 68, 0.04); }
    .verdict-label {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .verdict-detail {
      color: var(--text-secondary);
      font-size: 13px;
    }
    .verdict-rec {
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-primary);
    }

    /* 4-Column KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      border-bottom: 1px solid var(--line-hairline);
    }
    .kpi-cell {
      padding: 16px 20px;
      border-right: 1px solid var(--line-hairline);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
    }
    .kpi-cell:last-child { border-right: none; }
    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
    }
    .kpi-value {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .kpi-meta {
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .ext-link {
      color: var(--text-primary);
      text-decoration: none;
      border-bottom: 1px solid var(--line-strong);
      font-size: 11px;
    }
    .ext-link:hover { border-bottom-color: var(--text-primary); }

    /* Control Strip */
    .controls-bar {
      padding: 14px 20px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .controls-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button.btn {
      background: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--line-strong);
      padding: 8px 13px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
    }
    button.btn:hover {
      background: #1c1c21;
      border-color: rgba(255, 255, 255, 0.28);
    }
    button.btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    button.btn.primary {
      border-color: var(--status-nominal);
    }
    button.btn.warn {
      border-color: var(--status-warn);
    }
    button.btn.danger {
      border-color: var(--status-error);
      color: #fca5a5;
    }
    .action-feedback {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Charts Grid */
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid var(--line-hairline);
    }
    .chart-cell {
      padding: 16px 20px;
      border-right: 1px solid var(--line-hairline);
    }
    .chart-cell:last-child { border-right: none; }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .svg-chart-wrap {
      width: 100%;
      height: 110px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-hairline);
      position: relative;
    }

    /* Bottom 2-Column Section */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
    }
    .panel-cell {
      padding: 16px 20px;
      border-right: 1px solid var(--line-hairline);
    }
    .panel-cell:last-child { border-right: none; }
    .event-list {
      max-height: 360px;
      overflow-y: auto;
      border: 1px solid var(--line-hairline);
    }
    .event-row {
      padding: 9px 12px;
      border-bottom: 1px solid var(--line-hairline);
      display: grid;
      grid-template-columns: 78px 1fr auto;
      gap: 10px;
      align-items: baseline;
      font-size: 12px;
    }
    .event-row:last-child { border-bottom: none; }
    .event-title { font-weight: 500; color: var(--text-primary); }
    .event-detail { color: var(--text-secondary); font-size: 11px; margin-top: 2px; }
    .diag-box {
      background: var(--bg-elevated);
      border: 1px solid var(--line-hairline);
      padding: 12px;
      font-size: 12px;
      margin-bottom: 16px;
    }
    .diag-pre {
      margin-top: 8px;
      padding: 8px;
      background: var(--bg-canvas);
      border: 1px solid var(--line-hairline);
      font-size: 11px;
      max-height: 180px;
      overflow: auto;
      white-space: pre-wrap;
      color: var(--text-secondary);
    }
    .mobile-card {
      background: var(--bg-elevated);
      border: 1px solid var(--line-hairline);
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    @media (max-width: 920px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .kpi-cell:nth-child(2) { border-right: none; }
      .kpi-cell:nth-child(1), .kpi-cell:nth-child(2) { border-bottom: 1px solid var(--line-hairline); }
      .charts-grid, .bottom-grid { grid-template-columns: 1fr; }
      .chart-cell, .panel-cell { border-right: none; border-bottom: 1px solid var(--line-hairline); }
    }
    @media (max-width: 520px) {
      .kpi-grid { grid-template-columns: 1fr; }
      .kpi-cell { border-right: none; border-bottom: 1px solid var(--line-hairline); }
    }
  </style>
</head>
<body>
  <div class="shell">
    <!-- Top Header -->
    <header class="topbar">
      <div class="brand">
        <span class="dot nominal" id="top-dot"></span>
        <span class="brand-title">HA GUARDIAN</span>
        <span class="brand-sub">Lokaler Zero-Load Monitor (läuft auf PC <span class="mono">${LOCAL_LAN_IP}:${PORT}</span>)</span>
      </div>
      <div class="freshness-strip">
        <span>Ziel-Host: <strong class="mono">${HA_IP}</strong></span>
        <span>Shelly: <strong class="mono">${SHELLY_IP}</strong></span>
        <span class="mono" id="freshness-text">Stand: --:--:--</span>
      </div>
    </header>

    <!-- Verdict Banner -->
    <section class="verdict-banner nominal" id="verdict-banner">
      <div>
        <div class="verdict-label">
          <span class="dot nominal" id="verdict-dot"></span>
          <span id="verdict-label-text">LADE ZUSTAND...</span>
        </div>
        <div class="verdict-detail" id="verdict-detail-text">--</div>
        <div class="verdict-rec" id="verdict-rec-text"></div>
      </div>
      <div class="mono" style="text-align:right; font-size:12px; color:var(--text-secondary);">
        <div>Abfrage-Intervall: <strong>3.0s</strong></div>
        <div>HA-Systemlast durch Monitor: <strong>0.0%</strong></div>
      </div>
    </section>

    <!-- 4-Column KPI Strip -->
    <section class="kpi-grid">
      <!-- KPI 1: Shelly Power -->
      <div class="kpi-cell">
        <div class="kpi-header">
          <span>1. Hardware / Strom (Shelly)</span>
          <span class="dot nominal" id="kpi-shelly-dot"></span>
        </div>
        <div class="kpi-value mono" id="kpi-shelly-watt">-- W</div>
        <div class="kpi-meta mono">
          <span id="kpi-shelly-meta">Relais: -- | Temp: --</span>
          <span id="kpi-shelly-avg">3m-Ø: --</span>
        </div>
      </div>

      <!-- KPI 2: OS Observer :4357 -->
      <div class="kpi-cell">
        <div class="kpi-header">
          <span>2. HA OS Observer (:4357)</span>
          <span class="dot nominal" id="kpi-4357-dot"></span>
        </div>
        <div class="kpi-value mono" id="kpi-4357-state">--</div>
        <div class="kpi-meta mono">
          <span id="kpi-4357-lat">Latenz: --</span>
          <span id="kpi-4357-up">Uptime: --</span>
        </div>
      </div>

      <!-- KPI 3: Home Assistant Core :8123 -->
      <div class="kpi-cell">
        <div class="kpi-header">
          <span>3. Home Assistant (:8123)</span>
          <span class="dot nominal" id="kpi-8123-dot"></span>
        </div>
        <div class="kpi-value mono" id="kpi-8123-state">--</div>
        <div class="kpi-meta mono">
          <span id="kpi-8123-lat">Latenz: --</span>
          <span id="kpi-8123-up">Uptime: --</span>
          <a class="ext-link" href="http://${HA_IP}:8123" target="_blank" rel="noopener">Öffnen</a>
        </div>
      </div>

      <!-- KPI 4: Thassi Horizon :8099 -->
      <div class="kpi-cell">
        <div class="kpi-header">
          <span>4. Thassi Horizon (:8099)</span>
          <span class="dot nominal" id="kpi-8099-dot"></span>
        </div>
        <div class="kpi-value mono" id="kpi-8099-state">--</div>
        <div class="kpi-meta mono">
          <span id="kpi-8099-lat">Latenz: --</span>
          <span id="kpi-8099-up">Uptime: --</span>
          <a class="ext-link" href="http://${HA_IP}:8099" target="_blank" rel="noopener">Öffnen</a>
        </div>
      </div>
    </section>

    <!-- Action Controls Bar -->
    <section class="controls-bar">
      <div class="controls-group">
        <button class="btn primary" onclick="triggerAction('diagnose_now', false)">On-Demand Diagnose (Logs &amp; Entitäten)</button>
        <button class="btn" id="btn-thassi-toggle" onclick="toggleThassi()">Thassi (:8099) Starten / Pausieren</button>
        <button class="btn warn" onclick="triggerAction('ha_core_restart', true, 'Home Assistant Core (:8123) wirklich neu starten?')">HA Core Neustart</button>
        <button class="btn warn" onclick="triggerAction('host_reboot', true, 'Mini-PC (Host-OS) wirklich sauber über Supervisor neu starten?')">Host Sauberer Reboot</button>
        <button class="btn danger" onclick="triggerAction('shelly_cycle', true, 'WARNUNG: Shelly-Steckdose wird für 5s stromlos geschaltet. Danach musst du den physischen Power-Button am Mini-PC drücken! Fortfahren?')">Steckdose 5s Power-Cycle</button>
      </div>
      <div class="action-feedback mono" id="action-feedback">Bereit.</div>
    </section>

    <!-- Sparkline Charts -->
    <section class="charts-grid">
      <div class="chart-cell">
        <div class="section-title">
          <span>Leistungsaufnahme Mini-PC (Watt, letzte 30 Min)</span>
          <span class="mono" id="chart-watt-range">--</span>
        </div>
        <div class="svg-chart-wrap" id="chart-watt"></div>
      </div>
      <div class="chart-cell">
        <div class="section-title">
          <span>Antwortzeit (ms) &amp; Erreichbarkeit (:8123 Grün / :4357 Grau / :8099 Gelb)</span>
          <span class="mono" id="chart-lat-range">--</span>
        </div>
        <div class="svg-chart-wrap" id="chart-lat"></div>
      </div>
    </section>

    <!-- Bottom 2-Column Section -->
    <section class="bottom-grid">
      <!-- Left: Event History -->
      <div class="panel-cell">
        <div class="section-title">
          <span>Ereignis-Logbuch (Statuswechsel &amp; Aktionen)</span>
          <span class="mono" id="events-count">0 Einträge</span>
        </div>
        <div class="event-list" id="event-list"></div>
      </div>

      <!-- Right: Manual Diagnosis & Phone Access -->
      <div class="panel-cell">
        <div class="section-title">
          <span>On-Demand Diagnose-Snapshot (Nur bei Knopfdruck)</span>
          <span class="mono" id="diag-ts">Noch nicht abgerufen</span>
        </div>
        <div class="diag-box" id="diag-box">
          <div style="color:var(--text-secondary);">
            Klicke oben auf <strong>"On-Demand Diagnose"</strong>, um einmalig HA-Version, Entitätsstatus und die letzten Zeilen aus <code>/api/error_log</code> abzurufen (erzeugt im Normalbetrieb 0% Last).
          </div>
        </div>

        <div class="section-title" style="margin-top:16px;">
          <span>Zugriff vom Handy / PC</span>
          <span class="mono">WLAN &amp; Tailscale HTTPS</span>
        </div>
        <div class="mobile-card" style="margin-bottom:10px;">
          <div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">1. Im Heim-WLAN (Obi-WLAN Kenobi, ohne VPN/LTE):</div>
            <div class="mono" style="font-size:14px; font-weight:600; margin-bottom:6px;">
              <a href="${lanUrl}" style="color:var(--status-nominal); text-decoration:none;">${lanUrl}</a>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">2. Überall via Tailscale (auch über LTE/Mobilfunk):</div>
            <div class="mono" style="font-size:13px; font-weight:600;">
              <a href="https://desktop-m8tjerb.tail5e1682.ts.net" target="_blank" style="color:var(--text-primary); text-decoration:none;">https://desktop-m8tjerb.tail5e1682.ts.net</a>
            </div>
          </div>
          <div style="display:flex; gap:10px; text-align:center;">
            <div>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=88x88&amp;bgcolor=111113&amp;color=10b981&amp;data=${encodeURIComponent(lanUrl)}" alt="WLAN QR" width="80" height="80" style="border:1px solid var(--line-hairline); display:block;" onerror="this.style.display='none'" />
              <span class="mono" style="font-size:10px;color:var(--text-secondary);">WLAN</span>
            </div>
            <div>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=88x88&amp;bgcolor=111113&amp;color=fafafa&amp;data=${encodeURIComponent('https://desktop-m8tjerb.tail5e1682.ts.net')}" alt="Tailscale QR" width="80" height="80" style="border:1px solid var(--line-hairline); display:block;" onerror="this.style.display='none'" />
              <span class="mono" style="font-size:10px;color:var(--text-secondary);">Tailscale</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <script>
    let latestState = null;

    function fmtDuration(isoSince) {
      if (!isoSince) return '—';
      const sec = Math.max(0, Math.floor((Date.now() - new Date(isoSince).getTime()) / 1000));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }

    function fmtTime(iso) {
      if (!iso) return '--:--:--';
      const d = new Date(iso);
      return d.toLocaleTimeString('de-DE', { hour12: false });
    }

    function setDot(id, sev) {
      const el = document.getElementById(id);
      if (el) el.className = 'dot ' + sev;
    }

    function renderWattChart(history) {
      const wrap = document.getElementById('chart-watt');
      const pts = history.filter(p => typeof p.w === 'number');
      if (pts.length < 2) {
        wrap.innerHTML = '<div class="mono" style="padding:40px;text-align:center;color:var(--text-muted);font-size:11px;">Sammle Messpunkte...</div>';
        return;
      }
      const minW = Math.min(4, ...pts.map(p => p.w));
      const maxW = Math.max(12, ...pts.map(p => p.w));
      document.getElementById('chart-watt-range').textContent =
        'Min: ' + Math.min(...pts.map(p => p.w)).toFixed(2) + ' W | Max: ' + Math.max(...pts.map(p => p.w)).toFixed(2) + ' W';

      const W = 560, H = 108, PAD = 10;
      const coords = pts.map((p, i) => {
        const x = PAD + (i / (pts.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((p.w - minW) / Math.max(0.5, maxW - minW)) * (H - PAD * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');

      wrap.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="none">' +
        '<polyline fill="none" stroke="#10b981" stroke-width="1.8" points="' + coords + '" />' +
        '</svg>';
    }

    function renderLatencyChart(history) {
      const wrap = document.getElementById('chart-lat');
      if (history.length < 2) {
        wrap.innerHTML = '<div class="mono" style="padding:40px;text-align:center;color:var(--text-muted);font-size:11px;">Sammle Messpunkte...</div>';
        return;
      }
      const W = 560, H = 108, PAD = 10;
      const validLats = history.flatMap(p => [p.p4357, p.p8123, p.p8099]).filter(v => v >= 0);
      const maxLat = Math.max(30, ...validLats);
      document.getElementById('chart-lat-range').textContent = 'Skala: 0 – ' + maxLat + ' ms (' + history.length + ' Samples)';

      function buildLine(key, color) {
        const segs = [];
        for (let i = 0; i < history.length; i++) {
          const val = history[i][key];
          if (val < 0) continue;
          const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
          const y = H - PAD - (Math.min(val, maxLat) / maxLat) * (H - PAD * 2);
          segs.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        if (segs.length < 2) return '';
        return '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + segs.join(' ') + '" />';
      }

      wrap.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="none">' +
        buildLine('p4357', '#71717a') +
        buildLine('p8099', '#f59e0b') +
        buildLine('p8123', '#10b981') +
        '</svg>';
    }

    function renderDiagnosis(diag) {
      const box = document.getElementById('diag-box');
      const tsEl = document.getElementById('diag-ts');
      if (!diag) return;
      tsEl.textContent = 'Stand: ' + fmtTime(diag.ts);

      let html = '';
      if (diag.haConfig) {
        html += '<div class="mono" style="margin-bottom:6px;">' +
          '<strong>HA Core:</strong> v' + diag.haConfig.version + ' (' + diag.haConfig.state + ') | ' +
          'Komponenten: ' + diag.haConfig.componentsCount +
          '</div>';
      }
      if (diag.entitySummary) {
        html += '<div class="mono" style="margin-bottom:6px;color:var(--text-secondary);">' +
          'Entitäten gesamt: <strong>' + diag.entitySummary.totalEntities + '</strong> | ' +
          'Unavailable: <strong>' + diag.entitySummary.unavailableCount + '</strong>' +
          '</div>';
        if (diag.entitySummary.cameras && diag.entitySummary.cameras.length > 0) {
          html += '<div class="mono" style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">Kameras: ' +
            diag.entitySummary.cameras.join(' | ') + '</div>';
        }
      }
      if (diag.thassiMetrics && diag.thassiMetrics.cpu) {
        html += '<div class="mono" style="margin-bottom:6px;color:var(--status-nominal);">' +
          'CPU: ' + (diag.thassiMetrics.cpu.usagePercent ?? '?') + '% | ' +
          'RAM: ' + (diag.thassiMetrics.memory?.usagePercent ?? '?') + '% | ' +
          'Swap: ' + (diag.thassiMetrics.memory?.swapPercent ?? '?') + '%' +
          '</div>';
      }
      if (diag.errors && diag.errors.length > 0) {
        html += '<div class="mono" style="color:var(--status-warn);margin-bottom:6px;">' + diag.errors.join(' | ') + '</div>';
      }
      if (diag.errorLogTail) {
        html += '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Letzte Zeilen aus <code>/api/error_log</code>:</div>';
        const safeText = diag.errorLogTail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '<pre class="diag-pre mono">' + safeText + '</pre>';
      }
      box.innerHTML = html || 'Keine Daten.';
    }

    function updateUI(data) {
      latestState = data;
      const cur = data.current;
      const v = cur.verdict;

      // Top & Verdict
      setDot('top-dot', v.severity);
      setDot('verdict-dot', v.severity);
      document.getElementById('verdict-banner').className = 'verdict-banner ' + v.severity;
      document.getElementById('verdict-label-text').textContent = v.label;
      document.getElementById('verdict-detail-text').textContent = v.detail;
      document.getElementById('verdict-rec-text').textContent = v.recommendation ? 'Empfehlung: ' + v.recommendation : '';

      const ageSec = data.lastUpdatedAt ? Math.max(0, Math.round((Date.now() - new Date(data.lastUpdatedAt).getTime()) / 1000)) : 0;
      document.getElementById('freshness-text').textContent = 'Stand: ' + fmtTime(data.lastUpdatedAt) + ' (vor ' + ageSec + 's)';

      // KPI 1: Shelly
      const sh = cur.shelly;
      setDot('kpi-shelly-dot', sh.reachable && sh.ison ? 'nominal' : 'error');
      document.getElementById('kpi-shelly-watt').textContent = sh.powerW !== null ? sh.powerW.toFixed(2) + ' W' : 'OFFLINE';
      document.getElementById('kpi-shelly-meta').textContent =
        'Relais: ' + (sh.ison ? 'EIN' : 'AUS') + ' | ' + (sh.tempC !== null ? sh.tempC.toFixed(1) + ' °C' : '--');
      document.getElementById('kpi-shelly-avg').textContent = '3m-Ø: ' + (sh.avg3mW !== null ? sh.avg3mW.toFixed(2) + ' W' : '--');

      // KPI 2: 4357
      const p4357 = cur.ports.p4357;
      setDot('kpi-4357-dot', p4357.ok ? 'nominal' : 'error');
      document.getElementById('kpi-4357-state').textContent = p4357.ok ? 'ONLINE (200)' : 'OFFLINE';
      document.getElementById('kpi-4357-lat').textContent = 'Latenz: ' + (p4357.ok ? p4357.latencyMs + ' ms' : (p4357.error || '--'));
      document.getElementById('kpi-4357-up').textContent = 'Stabil: ' + fmtDuration(data.upSince?.p4357);

      // KPI 3: 8123
      const p8123 = cur.ports.p8123;
      setDot('kpi-8123-dot', p8123.ok ? 'nominal' : 'error');
      document.getElementById('kpi-8123-state').textContent = p8123.ok ? 'ONLINE (200)' : 'OFFLINE';
      document.getElementById('kpi-8123-lat').textContent = 'Latenz: ' + (p8123.ok ? p8123.latencyMs + ' ms' : (p8123.error || '--'));
      document.getElementById('kpi-8123-up').textContent = 'Stabil: ' + fmtDuration(data.upSince?.p8123);

      // KPI 4: 8099
      const p8099 = cur.ports.p8099;
      setDot('kpi-8099-dot', p8099.ok ? 'nominal' : 'warn');
      document.getElementById('kpi-8099-state').textContent = p8099.ok ? 'ONLINE (200)' : 'PAUSIERT';
      document.getElementById('kpi-8099-lat').textContent = 'Latenz: ' + (p8099.ok ? p8099.latencyMs + ' ms' : 'Gestoppt');
      document.getElementById('kpi-8099-up').textContent = 'Stabil: ' + fmtDuration(data.upSince?.p8099);

      const toggleBtn = document.getElementById('btn-thassi-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = p8099.ok ? 'Thassi (:8099) Pausieren' : 'Thassi (:8099) Starten';
      }

      // Charts
      renderWattChart(data.history || []);
      renderLatencyChart(data.history || []);

      // Events
      const evList = document.getElementById('event-list');
      const events = data.events || [];
      document.getElementById('events-count').textContent = events.length + ' Einträge';
      evList.innerHTML = events.map(ev => {
        const dotSev = ev.severity === 'error' ? 'error' : (ev.severity === 'warn' ? 'warn' : 'nominal');
        return '<div class="event-row">' +
          '<div class="mono" style="color:var(--text-secondary);">' + fmtTime(ev.ts) + '</div>' +
          '<div>' +
            '<div class="event-title"><span class="dot ' + dotSev + '" style="margin-right:6px;"></span>' + ev.title + '</div>' +
            '<div class="event-detail mono">' + (ev.detail || '') + '</div>' +
          '</div>' +
          '<div class="mono" style="color:var(--text-secondary);font-size:11px;">' + (typeof ev.powerW === 'number' ? ev.powerW.toFixed(2) + ' W' : '') + '</div>' +
        '</div>';
      }).join('');

      if (data.lastManualDiagnosis) {
        renderDiagnosis(data.lastManualDiagnosis);
      }
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          updateUI(data);
        }
      } catch (e) {}
    }

    async function triggerAction(action, confirmFirst, confirmText) {
      if (confirmFirst && !window.confirm(confirmText || 'Aktion wirklich ausführen?')) {
        return;
      }
      const fb = document.getElementById('action-feedback');
      fb.textContent = 'Führe aus: ' + action + '...';
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const j = await res.json();
        fb.textContent = j.message || (j.ok ? 'Erfolgreich.' : 'Fehler.');
        await fetchStatus();
      } catch (e) {
        fb.textContent = 'Fehler: ' + e.message;
      }
    }

    function toggleThassi() {
      const isUp = latestState?.current?.ports?.p8099?.ok;
      if (isUp) {
        triggerAction('thassi_stop', false);
      } else {
        triggerAction('thassi_start', true, 'Thassi Horizon (:8099) jetzt auf dem Mini-PC starten?');
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 2500);
  </script>
</body>
</html>`;
}

// Start HTTP Server
loadPersistedState();
await runPassivePoll();
setInterval(runPassivePoll, POLL_INTERVAL_MS);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(state));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
        const result = await handleAction(body.action);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderDashboardHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HA Guardian] Running on:`);
  console.log(`  -> PC (Local):     http://localhost:${PORT}`);
  console.log(`  -> WLAN / Handy:   http://${LOCAL_LAN_IP}:${PORT}`);
  if (TAILSCALE_IP) {
    console.log(`  -> Tailscale:      http://${TAILSCALE_IP}:${PORT}`);
  }
});
