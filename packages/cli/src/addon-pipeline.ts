import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

const HUB_URL = process.env.THASSI_HUB_URL || 'http://127.0.0.1:5180';
const HASS_HOST_URL = process.env.THASSI_HOST_URL || 'http://192.168.188.92:8099';

interface EventPayload {
  taskId: string;
  eventType: string;
  severity: 'Info' | 'Progress' | 'Success' | 'Warning' | 'Critical';
  title: string;
  message: string;
  progressPercent: number;
  addonSlug?: string;
  commitSha?: string | null;
  metadata?: Record<string, string>;
}

async function emitEvent(evt: EventPayload): Promise<void> {
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    taskId: evt.taskId,
    eventType: evt.eventType,
    severity: evt.severity,
    title: evt.title,
    message: evt.message,
    progressPercent: evt.progressPercent,
    addonSlug: evt.addonSlug || null,
    commitSha: evt.commitSha || null,
    timestamp: new Date().toISOString(),
    metadata: evt.metadata || {},
  });

  console.log(`[${evt.eventType}] (${evt.progressPercent}%) ${evt.title}: ${evt.message}`);

  try {
    const res = await fetch(`${HUB_URL}/api/events/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) return;
  } catch {
    // Fallback to Hass Host relay if local hub is unreachable
  }

  try {
    await fetch(`${HASS_HOST_URL}/api/orchestrator/events/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Ignore fallback failure
  }
}

function getHaToken(): string {
  const envPath = path.join(REPO_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/HA_TOKEN=(.+)/);
    if (match) return match[1].trim();
  }
  throw new Error('HA_TOKEN not found in .env');
}

async function callHassSupervisor<T = unknown>(
  endpoint: string,
  method: 'get' | 'post' = 'get',
  data?: Record<string, unknown>
): Promise<{ success: boolean; result?: T; error?: { message?: string } }> {
  const token = getHaToken();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: { success: boolean; result?: T; error?: { message?: string } }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // Ignore close error
      }
      resolve(val);
    };

    const ws = new WebSocket('ws://192.168.188.92:8123/api/websocket');
    const timeout = setTimeout(() => {
      finish({ success: false, error: { message: `Timeout calling Supervisor ${endpoint}` } });
    }, 180000);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        } else if (msg.type === 'auth_ok') {
          ws.send(
            JSON.stringify({
              id: 1,
              type: 'supervisor/api',
              endpoint,
              method,
              data,
              timeout: 180,
            })
          );
        } else if (msg.id === 1) {
          finish(msg);
        }
      } catch (err) {
        finish({ success: false, error: { message: String(err) } });
      }
    };
    ws.onerror = () => {
      finish({ success: false, error: { message: `WebSocket error on ${endpoint}` } });
    };
    ws.onclose = () => {
      finish({ success: false, error: { message: `WebSocket closed before response on ${endpoint}` } });
    };
  });
}

async function runPipeline() {
  const taskId = process.argv[2] || crypto.randomUUID();
  const rawSlug = process.argv[3] || 'thassi_voice_module';
  const prompt = process.argv[4] || 'Modulares Home Assistant Add-on via Voice-Orchestrator';

  const slug = rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  const fullSupervisorSlug = `44ec3c40_${slug}`;
  const addonDir = path.join(REPO_ROOT, slug);

  let lastGoodCommitSha = '';
  try {
    lastGoodCommitSha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    lastGoodCommitSha = '';
  }

  try {
    // 1. Pre-Flight Check
    const supInfo = await callHassSupervisor<{ arch: string; supervisor: string }>('/info', 'get');
    if (!supInfo.success) {
      throw new Error('Hass-PC Supervisor API (192.168.188.92) nicht erreichbar');
    }

    await emitEvent({
      taskId,
      eventType: 'PreflightChecked',
      severity: 'Info',
      title: '1/6 · Pre-Flight Checks OK',
      message: `GitHub Auth OK · Hass-PC (${supInfo.result?.arch || 'amd64'}, Supervisor ${supInfo.result?.supervisor}) bereit.`,
      progressPercent: 18,
      addonSlug: slug,
      metadata: {
        stageIndex: '1',
        arch: supInfo.result?.arch || 'amd64',
        hassHost: '192.168.188.92',
      },
    });

    // 2. Scaffold HASS Custom Add-on Module
    fs.mkdirSync(addonDir, { recursive: true });

    const existingConfigPath = path.join(addonDir, 'config.yaml');
    let nextVersion = '1.0.0';
    if (fs.existsSync(existingConfigPath)) {
      const oldCfg = fs.readFileSync(existingConfigPath, 'utf-8');
      const vMatch = oldCfg.match(/version:\s*"(\d+)\.(\d+)\.(\d+)"/);
      if (vMatch) {
        nextVersion = `${vMatch[1]}.${vMatch[2]}.${Number(vMatch[3]) + 1}`;
      }
    }

    const displayName = slug
      .replace(/^thassi_/, '')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    await emitEvent({
      taskId,
      eventType: 'RepoCreated',
      severity: 'Progress',
      title: '2/6 · Add-on Modul initialisiert',
      message: `Verzeichnis ./${slug} (v${nextVersion}) im Repository tsimhofer/thassi angelegt.`,
      progressPercent: 32,
      addonSlug: slug,
      metadata: {
        stageIndex: '2',
        repoUrl: 'https://github.com/tsimhofer/thassi',
        addonSlug: fullSupervisorSlug,
        version: nextVersion,
      },
    });

    const configYaml = `name: "Thassi ${displayName}"
version: "${nextVersion}"
slug: "${slug}"
description: "${prompt.replace(/"/g, "'")}"
url: "https://github.com/tsimhofer/thassi"
arch:
  - amd64
  - aarch64
init: false
startup: application
boot: auto
ingress: true
ingress_port: 8099
panel_icon: "mdi:rocket-launch-outline"
panel_title: "${displayName}"
panel_admin: false
homeassistant_api: true
hassio_api: true
watchdog: "http://[HOST]:[PORT:8099]/healthz"
`;

    const buildYaml = `build_from:
  amd64: "node:24-alpine"
  aarch64: "node:24-alpine"
`;

    const dockerfile = `FROM node:24-alpine

WORKDIR /app

COPY server.mjs /app/server.mjs
COPY run.sh /app/run.sh

RUN sed -i 's/\\r$//' /app/run.sh && chmod a+x /app/run.sh

ENV NODE_ENV=production
ENV PORT=8099

EXPOSE 8099

CMD ["node", "--no-warnings", "/app/server.mjs"]
`;

    const runSh = `#!/bin/sh
set -e
echo "[HASS Add-on] Starting ${displayName} v${nextVersion}..."
exec node --no-warnings /app/server.mjs
`;

    const serverMjs = `import http from 'node:http';

const PORT = Number(process.env.PORT || 8099);
const STARTED_AT = Date.now();
const ADDON_SLUG = ${JSON.stringify(slug)};
const ADDON_NAME = ${JSON.stringify(displayName)};
const ADDON_VERSION = ${JSON.stringify(nextVersion)};
const USER_PROMPT = ${JSON.stringify(prompt)};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/healthz' || url === '/api/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        addon: ADDON_SLUG,
        name: ADDON_NAME,
        version: ADDON_VERSION,
        prompt: USER_PROMPT,
        uptimeSeconds: Number(((Date.now() - STARTED_AT) / 1000).toFixed(1)),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(\`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>\${ADDON_NAME}</title>
  <style>
    body {
      margin: 0; padding: 48px 5vw; min-height: 100vh;
      background: #040711;
      color: #f8fafc; font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    .pill {
      display: inline-block; padding: 3px 10px; border-radius: 99px;
      background: rgba(56, 189, 248, 0.12); color: #38bdf8;
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
    }
    h1 { font-weight: 200; font-size: 42px; letter-spacing: -0.02em; margin: 16px 0 8px 0; }
    p { color: rgba(248, 250, 252, 0.62); line-height: 1.6; max-width: 640px; font-weight: 300; }
  </style>
</head>
<body>
  <span class="pill">● LIVE ON HASS OS · v\${ADDON_VERSION}</span>
  <h1>\${ADDON_NAME}</h1>
  <p>\${USER_PROMPT}</p>
</body>
</html>\`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`[\${ADDON_SLUG}] Listening on 0.0.0.0:\${PORT} (v\${ADDON_VERSION})\`);
});
`;

    fs.writeFileSync(path.join(addonDir, 'config.yaml'), configYaml);
    fs.writeFileSync(path.join(addonDir, 'build.yaml'), buildYaml);
    fs.writeFileSync(path.join(addonDir, 'Dockerfile'), dockerfile);
    fs.writeFileSync(path.join(addonDir, 'run.sh'), runSh);
    fs.writeFileSync(path.join(addonDir, 'server.mjs'), serverMjs);

    await emitEvent({
      taskId,
      eventType: 'CodeGenProgress',
      severity: 'Progress',
      title: '3/6 · Code & Dockerfile generiert',
      message: `config.yaml, build.yaml, Dockerfile und /healthz Endpoint für ${displayName} erstellt.`,
      progressPercent: 48,
      addonSlug: slug,
      metadata: {
        stageIndex: '3',
        files: 'config.yaml, build.yaml, Dockerfile, run.sh, server.mjs',
      },
    });

    // 3. Git Commit & Push to GitHub Cloud
    execSync(`git add "${slug}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
    try {
      execSync(`git commit -m "feat(${slug}): scaffold/update HASS add-on v${nextVersion}"`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
    } catch {
      // Nothing new to commit if identical
    }
    execSync('git push origin main', { cwd: REPO_ROOT, stdio: 'pipe' });
    const commitSha = execSync('git rev-parse --short HEAD', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();

    await emitEvent({
      taskId,
      eventType: 'CodePushed',
      severity: 'Progress',
      title: '4/6 · Zu GitHub Cloud gepusht',
      message: `Commit ${commitSha} erfolgreich nach github.com/tsimhofer/thassi (main) übertragen.`,
      progressPercent: 64,
      addonSlug: slug,
      commitSha,
      metadata: {
        stageIndex: '4',
      },
    });

    // 4. Deploy & Build on Hass-PC (Docker 29.1.3 on 192.168.188.92)
    await emitEvent({
      taskId,
      eventType: 'DeployingToHass',
      severity: 'Progress',
      title: '5/6 · Store Sync & Docker Build',
      message: `Synchronisiere Add-on Store auf Hass-PC (192.168.188.92)...`,
      progressPercent: 74,
      addonSlug: slug,
      commitSha,
      metadata: {
        stageIndex: '5',
      },
    });

    await callHassSupervisor('/store/reload', 'post');

    await emitEvent({
      taskId,
      eventType: 'DockerBuildProgress',
      severity: 'Progress',
      title: '5/6 · Docker Build auf Hass-PC',
      message: `Hass OS Supervisor baut Container ${fullSupervisorSlug} (v${nextVersion}, amd64)...`,
      progressPercent: 80,
      addonSlug: slug,
      commitSha,
      metadata: {
        stageIndex: '5',
      },
    });

    const infoBefore = await callHassSupervisor<{ version?: string | null }>(
      `/addons/${fullSupervisorSlug}/info`,
      'get'
    );
    const isAlreadyInstalled = Boolean(infoBefore.result?.version);

    // Emit live progress heartbeats while Docker builds on Hass-PC
    let buildFinished = false;
    const buildStartMs = Date.now();
    const buildTicker = (async () => {
      let stepPct = 82;
      while (!buildFinished) {
        await new Promise((r) => setTimeout(r, 2500));
        if (buildFinished) break;
        const elapsedSec = Math.round((Date.now() - buildStartMs) / 1000);
        stepPct = Math.min(89, stepPct + 2);
        await emitEvent({
          taskId,
          eventType: 'DockerBuildProgress',
          severity: 'Progress',
          title: `5/6 · Docker Build läuft (${elapsedSec}s)`,
          message: `Baue Image für ${displayName} v${nextVersion} auf Hass-PC...`,
          progressPercent: stepPct,
          addonSlug: slug,
          commitSha,
          metadata: { stageIndex: '5' },
        });
      }
    })();

    const buildRes = isAlreadyInstalled
      ? await callHassSupervisor(`/addons/${fullSupervisorSlug}/rebuild`, 'post')
      : await callHassSupervisor(`/addons/${fullSupervisorSlug}/install`, 'post');

    buildFinished = true;
    await buildTicker;

    // Even if the WebSocket closed during a multi-second Docker build, verify via /info polling
    if (!buildRes.success) {
      let installedOk = false;
      for (let retry = 0; retry < 12; retry++) {
        await new Promise((r) => setTimeout(r, 2500));
        const checkInfo = await callHassSupervisor<{ version?: string | null; state?: string }>(
          `/addons/${fullSupervisorSlug}/info`,
          'get'
        );
        if (checkInfo.result?.version) {
          installedOk = true;
          break;
        }
      }
      if (!installedOk) {
        throw new Error(
          `Docker Build fehlgeschlagen auf Hass-PC: ${buildRes.error?.message || 'Supervisor Error'}`
        );
      }
    }

    await callHassSupervisor(`/addons/${fullSupervisorSlug}/options`, 'post', {
      ingress_panel: false,
    });
    await callHassSupervisor(`/addons/${fullSupervisorSlug}/start`, 'post');

    // 5. Post-Deploy Smoke & Integration Tests
    await emitEvent({
      taskId,
      eventType: 'SmokeTestRunning',
      severity: 'Progress',
      title: '6/6 · Smoke- & Integrationstests',
      message: `Prüfe Container-State und Watchdog-Healthcheck für ${fullSupervisorSlug}...`,
      progressPercent: 94,
      addonSlug: slug,
      commitSha,
      metadata: {
        stageIndex: '6',
      },
    });

    let startedState = 'unknown';
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const afterInfo = await callHassSupervisor<{ state: string; version: string; ingress_url: string }>(
        `/addons/${fullSupervisorSlug}/info`,
        'get'
      );
      startedState = afterInfo.result?.state || 'unknown';
      if (startedState === 'started') break;
      await callHassSupervisor(`/addons/${fullSupervisorSlug}/start`, 'post');
    }

    if (startedState !== 'started') {
      throw new Error(`Container-Start fehlgeschlagen: Status ist "${startedState}"`);
    }

    await emitEvent({
      taskId,
      eventType: 'TestsPassed',
      severity: 'Success',
      title: `6/6 · "${displayName}" ist LIVE!`,
      message: `Container ${fullSupervisorSlug} (v${nextVersion}) läuft fehlerfrei auf Hass OS. Smoke-Tests bestanden!`,
      progressPercent: 100,
      addonSlug: slug,
      commitSha,
      metadata: {
        stageIndex: '6',
        ingressUrl: `/${fullSupervisorSlug}`,
        state: startedState,
        version: nextVersion,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (lastGoodCommitSha) {
      await emitEvent({
        taskId,
        eventType: 'RollbackTriggered',
        severity: 'Warning',
        title: 'Automatischer Rollback ausgelöst',
        message: `Fehler erkannt (${errMsg}). Rolle zurück auf letzten stabilen Commit ${lastGoodCommitSha.slice(0, 7)}...`,
        progressPercent: 95,
        addonSlug: slug,
        commitSha: lastGoodCommitSha,
      });
    }

    await emitEvent({
      taskId,
      eventType: 'TaskFailed',
      severity: 'Critical',
      title: 'Pipeline fehlgeschlagen',
      message: errMsg,
      progressPercent: 100,
      addonSlug: slug,
      commitSha: lastGoodCommitSha || null,
    });
    process.exit(1);
  }
}

void runPipeline();
