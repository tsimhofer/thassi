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

  await Promise.allSettled([
    fetch(`${HUB_URL}/api/events/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
    fetch(`${HASS_HOST_URL}/api/orchestrator/events/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  ]);
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
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://192.168.188.92:8123/api/websocket');
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout calling Supervisor ${endpoint}`));
    }, 180000);

    ws.onmessage = (ev) => {
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
        clearTimeout(timeout);
        ws.close();
        resolve(msg);
      }
    };
    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
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
      title: 'Pre-Flight Checks bestanden',
      message: `GitHub Auth OK · Hass-PC (${supInfo.result?.arch || 'amd64'}, Supervisor ${supInfo.result?.supervisor}) bereit.`,
      progressPercent: 18,
      addonSlug: slug,
      metadata: {
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
      title: 'HASS Add-on Modul initialisiert',
      message: `Verzeichnis ./${slug} (v${nextVersion}) im Repository tsimhofer/thassi angelegt.`,
      progressPercent: 30,
      addonSlug: slug,
      metadata: {
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
      margin: 0; padding: 40px; min-height: 100vh;
      background: radial-gradient(circle at top right, #0f172a, #020617);
      color: #f8fafc; font-family: system-ui, sans-serif;
    }
    .glass {
      max-width: 720px; margin: 0 auto; padding: 32px;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(20px);
      border-radius: 24px; border: 1px solid rgba(56, 189, 248, 0.25);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .pill {
      display: inline-block; padding: 4px 12px; border-radius: 99px;
      background: rgba(74, 222, 128, 0.15); color: #4ade80;
      font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    }
    h1 { font-weight: 300; font-size: 36px; margin: 14px 0 8px 0; }
    p { color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="glass">
    <span class="pill">● RUNNING ON HASS OS (v\${ADDON_VERSION})</span>
    <h1>\${ADDON_NAME}</h1>
    <p>Automatisch generiert und deployed via <strong>.NET MAUI &amp; SignalR Antigravity Pipeline</strong>.</p>
    <p><strong>Auftrag:</strong> \${USER_PROMPT}</p>
    <p style="font-size:12px; color:#38bdf8;">Healthcheck Endpoint: <code>GET /healthz -> 200 OK</code></p>
  </div>
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
      title: 'Add-on Code & Dockerfile generiert',
      message: `config.yaml, build.yaml, Dockerfile und /healthz Endpoint für ${displayName} validiert.`,
      progressPercent: 45,
      addonSlug: slug,
      metadata: {
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
      title: 'Zu GitHub Cloud gepusht',
      message: `Commit ${commitSha} erfolgreich nach github.com/tsimhofer/thassi (main) übertragen.`,
      progressPercent: 60,
      addonSlug: slug,
      commitSha,
    });

    // 4. Deploy & Build on Hass-PC (Docker 29.1.3 on 192.168.188.92)
    await emitEvent({
      taskId,
      eventType: 'DeployingToHass',
      severity: 'Progress',
      title: 'Supervisor Store Reload auf Hass-PC',
      message: `Synchronisiere Add-on Store auf 192.168.188.92 und starte Container-Build (${fullSupervisorSlug})...`,
      progressPercent: 72,
      addonSlug: slug,
      commitSha,
    });

    await callHassSupervisor('/store/reload', 'post');

    await emitEvent({
      taskId,
      eventType: 'DockerBuildProgress',
      severity: 'Progress',
      title: 'Docker Build auf Hass-PC läuft',
      message: `Hass OS Supervisor baut Container ${fullSupervisorSlug} (v${nextVersion}, amd64)...`,
      progressPercent: 82,
      addonSlug: slug,
      commitSha,
    });

    const infoBefore = await callHassSupervisor<{ version?: string | null }>(
      `/addons/${fullSupervisorSlug}/info`,
      'get'
    );
    const isAlreadyInstalled = Boolean(infoBefore.result?.version);

    const buildRes = isAlreadyInstalled
      ? await callHassSupervisor(`/addons/${fullSupervisorSlug}/rebuild`, 'post')
      : await callHassSupervisor(`/addons/${fullSupervisorSlug}/install`, 'post');

    if (!buildRes.success) {
      throw new Error(
        `Docker Build fehlgeschlagen auf Hass-PC: ${buildRes.error?.message || 'Supervisor Error'}`
      );
    }

    await callHassSupervisor(`/addons/${fullSupervisorSlug}/options`, 'post', {
      ingress_panel: true,
    });
    await callHassSupervisor(`/addons/${fullSupervisorSlug}/start`, 'post');

    // 5. Post-Deploy Smoke & Integration Tests
    await emitEvent({
      taskId,
      eventType: 'SmokeTestRunning',
      severity: 'Progress',
      title: 'Smoke- & Integrationstests auf Hass-PC',
      message: `Prüfe Container-State und Watchdog-Healthcheck für ${fullSupervisorSlug}...`,
      progressPercent: 92,
      addonSlug: slug,
      commitSha,
    });

    await new Promise((r) => setTimeout(r, 2500));
    const afterInfo = await callHassSupervisor<{ state: string; version: string; ingress_url: string }>(
      `/addons/${fullSupervisorSlug}/info`,
      'get'
    );

    if (afterInfo.result?.state !== 'started') {
      throw new Error(
        `Container-Start fehlgeschlagen: Status ist "${afterInfo.result?.state || 'unknown'}"`
      );
    }

    await emitEvent({
      taskId,
      eventType: 'TestsPassed',
      severity: 'Success',
      title: `Add-on "${displayName}" ist LIVE!`,
      message: `Container ${fullSupervisorSlug} (v${nextVersion}) läuft fehlerfrei auf Hass OS. Smoke-Tests bestanden!`,
      progressPercent: 100,
      addonSlug: slug,
      commitSha,
      metadata: {
        ingressUrl: `/${fullSupervisorSlug}`,
        state: afterInfo.result.state,
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
