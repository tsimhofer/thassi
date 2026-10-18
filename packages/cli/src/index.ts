import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import type { ThassiAppManifest } from '../../sdk/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const HOST_DIR = path.join(REPO_ROOT, 'thassi_host');
const HOST_DIST_DIR = path.join(HOST_DIR, 'dist');

function collectFilesBase64(dir: string, baseDir = dir): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, collectFilesBase64(fullPath, baseDir));
    } else {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      result[rel] = fs.readFileSync(fullPath).toString('base64');
    }
  }
  return result;
}

async function buildHostServer(): Promise<void> {
  console.log('📦 Building Thassi Host runtime (thassi_host/dist/server.mjs)...');
  fs.mkdirSync(HOST_DIST_DIR, { recursive: true });
  await esbuild({
    entryPoints: [path.join(HOST_DIR, 'src', 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    outfile: path.join(HOST_DIST_DIR, 'server.mjs'),
    external: ['node:*'],
    logLevel: 'warning',
  });
}

async function buildSingleApp(appId: string): Promise<string> {
  const appSrcDir = path.join(APPS_DIR, appId);
  const manifestPath = path.join(appSrcDir, 'thassi.app.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`App "${appId}" not found at ${appSrcDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ThassiAppManifest;
  const outAppDir = path.join(HOST_DIST_DIR, 'apps', appId);
  fs.rmSync(outAppDir, { recursive: true, force: true });
  fs.mkdirSync(outAppDir, { recursive: true });

  // Copy manifest
  fs.copyFileSync(manifestPath, path.join(outAppDir, 'thassi.app.json'));

  // 1. Bundle Backend (`backend/index.ts` -> `backend.mjs`)
  const backendEntry = path.join(appSrcDir, 'backend', 'index.ts');
  if (fs.existsSync(backendEntry)) {
    console.log(`🔧 [${appId}] Bundling backend API & cron jobs...`);
    await esbuild({
      entryPoints: [backendEntry],
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      outfile: path.join(outAppDir, 'backend.mjs'),
      external: ['node:*'],
      alias: {
        '@thassi/sdk': path.join(REPO_ROOT, 'packages/sdk/src/index.ts'),
      },
      logLevel: 'warning',
    });
  }

  // 2. Bundle Frontend (`frontend/index.html` -> `dist/apps/<appId>/frontend`)
  const frontendRoot = path.join(appSrcDir, 'frontend');
  if (fs.existsSync(path.join(frontendRoot, 'index.html'))) {
    console.log(`🎨 [${appId}] Building React frontend bundle (Ingress-ready)...`);
    await viteBuild({
      root: frontendRoot,
      base: './',
      plugins: [reactPlugin()],
      resolve: {
        alias: {
          '@thassi/sdk/client': path.join(REPO_ROOT, 'packages/sdk/src/client.ts'),
          '@thassi/sdk': path.join(REPO_ROOT, 'packages/sdk/src/index.ts'),
        },
      },
      build: {
        outDir: path.join(outAppDir, 'frontend'),
        emptyOutDir: true,
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
            warn(warning);
          },
        },
      },
      logLevel: 'warn',
    });
  }

  console.log(`✅ Built "${manifest.name}" (${appId}) -> thassi_host/dist/apps/${appId}`);
  return outAppDir;
}

async function commandBuild(targetAppId?: string): Promise<void> {
  await buildHostServer();

  if (targetAppId) {
    await buildSingleApp(targetAppId);
    return;
  }

  if (!fs.existsSync(APPS_DIR)) return;
  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    await buildSingleApp(entry.name);
  }
  console.log('\n🎉 All Thassi apps and Host Add-on built successfully!');
}

async function commandCreate(rawId?: string, rawName?: string, rawCategory?: string): Promise<void> {
  if (!rawId) {
    console.error('Usage: npm.cmd run create -- <app-id> "<App Name>" [category]');
    console.error('Example: npm.cmd run create -- meal-planner "Meal Planner" meals');
    process.exit(1);
  }

  const appId = rawId.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const appName =
    rawName ||
    appId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const category = (rawCategory || 'general') as ThassiAppManifest['category'];

  const iconMap: Record<string, string> = {
    finance: 'mdi:TrendingUp',
    meals: 'mdi:food-apple',
    health: 'mdi:heart-pulse',
    calendar: 'mdi:calendar-clock',
    notes: 'mdi:notebook-edit',
    general: 'mdi:application-brackets',
  };

  const appDir = path.join(APPS_DIR, appId);
  if (fs.existsSync(appDir)) {
    throw new Error(`App directory already exists: ${appDir}`);
  }

  fs.mkdirSync(path.join(appDir, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(appDir, 'frontend', 'src'), { recursive: true });

  const manifest: ThassiAppManifest = {
    id: appId,
    name: appName,
    version: '1.0.0',
    description: `${appName} — Custom full-stack TypeScript app powered by Thassi & SQLite.`,
    icon: iconMap[category || 'general'] || 'mdi:apps',
    category: category || 'general',
  };

  fs.writeFileSync(path.join(appDir, 'thassi.app.json'), JSON.stringify(manifest, null, 2));

  fs.writeFileSync(
    path.join(appDir, 'backend', 'index.ts'),
    `import { defineThassiApp } from '@thassi/sdk';

interface RecordItem {
  id: number;
  title: string;
  value: number;
  notes: string;
  created_at: string;
}

export default defineThassiApp((ctx) => {
  // 1. Persistent SQLite table in /data/apps/${appId}.db
  ctx.db.exec(\`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  \`);

  // 2. REST API Endpoints (/api/apps/${appId}/*)
  ctx.route('GET', '/records', (_req, { db }) => {
    const records = db.query<RecordItem>('SELECT * FROM records ORDER BY id DESC');
    const summary = db.queryOne<{ count: number; total: number }>(
      'SELECT COUNT(*) as count, COALESCE(ROUND(SUM(value), 2), 0) as total FROM records'
    );
    return { records, summary };
  });

  ctx.route('POST', '/records', (req, { db }) => {
    const body = (req.body || {}) as Partial<RecordItem>;
    if (!body.title) {
      return { status: 400, body: { error: 'Title is required' } };
    }
    const now = new Date().toISOString();
    const res = db.execute(
      'INSERT INTO records (title, value, notes, created_at) VALUES (?, ?, ?, ?)',
      [body.title.trim(), Number(body.value || 0), (body.notes || '').trim(), now]
    );
    return { id: res.lastInsertRowid };
  });

  ctx.route('DELETE', '/records', (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM records WHERE id = ?', [id]);
    return { deleted: id };
  });

  // 3. Scheduled Background Sync Job
  ctx.scheduleJob({
    id: 'sync-ha-sensor',
    name: 'Publish ${appName} Summary Sensor to Home Assistant',
    intervalMinutes: 30,
    handler: async () => {
      const stats = ctx.db.queryOne<{ cnt: number; total: number }>(
        'SELECT COUNT(*) as cnt, COALESCE(ROUND(SUM(value), 2), 0) as total FROM records'
      );
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        await ctx.ha.publishSensor('total', stats?.total ?? 0, {
          friendly_name: '${appName} Total',
          record_count: stats?.cnt ?? 0,
          icon: '${manifest.icon}',
        });
      }
      return \`Synced \${stats?.cnt ?? 0} records (total = \${stats?.total ?? 0})\`;
    },
  });
});
`
  );

  fs.writeFileSync(
    path.join(appDir, 'frontend', 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
  </head>
  <body style="margin: 0; background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif;">
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`
  );

  fs.writeFileSync(
    path.join(appDir, 'frontend', 'src', 'main.tsx'),
    `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
  );

  fs.writeFileSync(
    path.join(appDir, 'frontend', 'src', 'App.tsx'),
    `import React, { useEffect, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('${appId}');

interface RecordItem {
  id: number;
  title: string;
  value: number;
  notes: string;
  created_at: string;
}

export default function App() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const load = async () => {
    const data = await api.get<{ records: RecordItem[]; summary: { count: number; total: number } }>('/records');
    setRecords(data.records);
    setSummary(data.summary);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post('/records', { title, value: Number(value || 0), notes });
    setTitle('');
    setValue('');
    setNotes('');
    await load();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ color: '#38bdf8', marginBottom: 4 }}>${appName}</h1>
      <p style={{ color: '#94a3b8', marginTop: 0 }}>
        Records: <strong>{summary.count}</strong> • Total Value: <strong>{summary.total}</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <form onSubmit={handleAdd} style={{ background: '#1e293b', padding: 20, borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Add Entry</h3>
          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Numeric Value (optional)"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Notes..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inputStyle}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: 'none',
              background: '#0284c7',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save to SQLite
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {records.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#1e293b',
                padding: 16,
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong>{r.title}</strong> ({r.value})
                {r.notes && <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>{r.notes}</p>}
              </div>
              <button
                onClick={async () => {
                  await api.delete(\`/records?id=\${r.id}\`);
                  await load();
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  marginBottom: 12,
};
`
  );

  console.log(`✨ Scaffolded new Thassi app "${appName}" at apps/${appId}/`);
  await buildSingleApp(appId);
}

async function commandDeploy(appId?: string, hostOverride?: string): Promise<void> {
  if (!appId) {
    console.error('Usage: npm.cmd run deploy -- <app-id> [http://192.168.188.92:8099]');
    process.exit(1);
  }

  const outAppDir = await buildSingleApp(appId);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outAppDir, 'thassi.app.json'), 'utf-8')
  ) as ThassiAppManifest;
  const backendPath = path.join(outAppDir, 'backend.mjs');
  const backendCode = fs.existsSync(backendPath) ? fs.readFileSync(backendPath, 'utf-8') : '';
  const frontendFiles = collectFilesBase64(path.join(outAppDir, 'frontend'));

  const hostUrl = (
    hostOverride ||
    process.env.THASSI_HOST_URL ||
    'http://192.168.188.92:8099'
  ).replace(/\/+$/, '');

  console.log(`🚀 Hot-deploying "${manifest.name}" (${appId}) to ${hostUrl}/api/system/deploy...`);
  const res = await fetch(`${hostUrl}/api/system/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manifest,
      backendCode,
      frontendFiles,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Hot-deploy failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { appId: string; updatedAt: string };
  console.log(`✅ Instant deploy complete! "${manifest.name}" is live at ${hostUrl}/apps/${data.appId}/`);
}

async function commandExportStandaloneAddon(appId?: string): Promise<void> {
  if (!appId) {
    console.error('Usage: npm.cmd run export -- <app-id>');
    process.exit(1);
  }

  await buildHostServer();
  const outAppDir = await buildSingleApp(appId);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outAppDir, 'thassi.app.json'), 'utf-8')
  ) as ThassiAppManifest;

  const slug = `thassi_${appId.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
  const addonDir = path.join(REPO_ROOT, slug);
  const addonDistDir = path.join(addonDir, 'dist');

  fs.rmSync(addonDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(addonDistDir, 'apps', appId), { recursive: true });

  // Copy server.mjs and built app bundle into the standalone add-on directory
  // (HA Supervisor requires all Docker build files inside the add-on's own directory!)
  fs.copyFileSync(
    path.join(HOST_DIST_DIR, 'server.mjs'),
    path.join(addonDistDir, 'server.mjs')
  );
  fs.cpSync(outAppDir, path.join(addonDistDir, 'apps', appId), { recursive: true });

  const configYaml = `name: "${manifest.name}"
version: "${manifest.version}"
slug: "${slug}"
description: "${manifest.description.replace(/"/g, '\\"')}"
url: "https://github.com/tsimhofer/thassi"
arch:
  - aarch64
  - amd64
init: false
startup: application
boot: auto
ingress: true
ingress_port: 8099
panel_icon: "${manifest.icon || 'mdi:application'}"
panel_title: "${manifest.name}"
panel_admin: false
homeassistant_api: true
hassio_api: true
`;

  const dockerfile = `FROM node:24-alpine

WORKDIR /app

COPY dist/ /app/dist/
COPY run.sh /app/run.sh

RUN sed -i 's/\\r$//' /app/run.sh && chmod a+x /app/run.sh

ENV NODE_ENV=production
ENV PORT=8099
ENV THASSI_DATA_DIR=/data
ENV THASSI_STANDALONE_APP=${appId}

EXPOSE 8099

CMD ["node", "--no-warnings", "/app/dist/server.mjs"]
`;

  const runSh = `#!/bin/sh
set -e
echo "[Thassi Standalone] Starting ${manifest.name} (${appId})..."
exec node --no-warnings /app/dist/server.mjs
`;

  fs.writeFileSync(path.join(addonDir, 'config.yaml'), configYaml);
  fs.writeFileSync(path.join(addonDir, 'Dockerfile'), dockerfile);
  fs.writeFileSync(path.join(addonDir, 'run.sh'), runSh);

  console.log(`\n🎉 Exported standalone Home Assistant Add-on to ./${slug}/`);
  console.log(`   Next steps: git add ${slug} && git commit -m "Add ${manifest.name} add-on" && git push`);
  console.log(`   Then click "Check for updates" in the Home Assistant Add-on Store!`);
}

function commandList(): void {
  console.log('=== Thassi Workspace Apps (./apps/) ===');
  if (fs.existsSync(APPS_DIR)) {
    for (const entry of fs.readdirSync(APPS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const mPath = path.join(APPS_DIR, entry.name, 'thassi.app.json');
        if (fs.existsSync(mPath)) {
          const m = JSON.parse(fs.readFileSync(mPath, 'utf-8')) as ThassiAppManifest;
          console.log(`  • ${m.id} (${m.name} v${m.version}) — ${m.description}`);
        }
      }
    }
  }

  console.log('\n=== Home Assistant Add-ons at Repo Root ===');
  for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, entry.name, 'config.yaml'))) {
      console.log(`  • ${entry.name}/config.yaml`);
    }
  }
}

async function main() {
  const [cmd, arg1, arg2, arg3] = process.argv.slice(2);

  switch (cmd) {
    case 'build':
      await commandBuild(arg1);
      break;
    case 'create':
      await commandCreate(arg1, arg2, arg3);
      break;
    case 'deploy':
      await commandDeploy(arg1, arg2);
      break;
    case 'export':
      await commandExportStandaloneAddon(arg1);
      break;
    case 'list':
      commandList();
      break;
    case 'dev':
      await commandBuild();
      console.log('\n🌐 Starting local Thassi Host server on http://localhost:8099 ...');
      await import(pathToFileURL(path.join(HOST_DIST_DIR, 'server.mjs')).href);
      break;
    default:
      console.log(`Thassi CLI — Home Assistant WebApp & Data Hub Workflow
Commands:
  npm.cmd run create -- <id> "<Name>" [category]   Scaffold a new full-stack TypeScript app
  npm.cmd run build [id]                           Build Host runtime and all (or one) apps
  npm.cmd run dev                                  Build and start local Thassi Hub on :8099
  npm.cmd run deploy -- <id> [hostUrl]             Hot-deploy an app to running Thassi Host (<1s)
  npm.cmd run export -- <id>                       Export an app as a standalone HA Add-on at repo root
  npm.cmd run list                                 List all apps and HA add-ons in the repository`);
  }
}

function pathToFileURL(p: string) {
  return new URL(`file:///${p.replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
