import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineThassiApp } from '@thassi/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineThassiApp((ctx) => {
  // Initialize George Sync metadata
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS george_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at TEXT NOT NULL,
      file_name TEXT NOT NULL,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_duplicates INTEGER NOT NULL DEFAULT 0,
      detected_balance REAL,
      source TEXT NOT NULL DEFAULT 'windows_app'
    );
  `);

  // Info endpoint
  ctx.route('GET', '/info', (_req, { db }) => {
    const lastLog = db.queryOne<{
      synced_at: string;
      file_name: string;
      imported_count: number;
      skipped_duplicates: number;
      detected_balance: number | null;
      source: string;
    }>('SELECT * FROM george_sync_logs ORDER BY id DESC LIMIT 1');

    return {
      appName: 'Erste Bank Sync',
      georgeUrl: 'https://george.sparkasse.at/index.html#/login',
      lastSync: lastLog || null,
      windowsAppAvailable: true,
      downloadsFolder: 'C:\\Users\\thoma\\Downloads',
      instructions: [
        '1. Öffne das George Portal (Mini-Browser oder Web).',
        '2. Logge dich ein und wähle dein Girokonto.',
        '3. Gehe auf "Kontoauszug / Export" und lade CSV oder CAMT.053 herunter.',
        '4. Ziehe die Datei direkt auf das Taskleisten-Symbol oder nutze die automatische Erkennung.'
      ]
    };
  });

  // Direct upload proxy to finance analytics
  ctx.route('POST', '/import', async (req, { db }) => {
    const body = (req.body || {}) as {
      csvText?: string;
      base64Content?: string;
      fileName?: string;
      source?: string;
    };

    if (!body.csvText && !body.base64Content) {
      return { status: 400, body: { error: 'csvText or base64Content is required' } };
    }

    try {
      // Forward directly to internal finance-analytics API
      const response = await fetch('http://127.0.0.1:8099/api/apps/finance-analytics/import-bank-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: body.csvText,
          base64Content: body.base64Content,
          fileName: body.fileName || 'George-Export.csv'
        })
      });

      const data = (await response.json()) as {
        importedCount?: number;
        skippedDuplicates?: number;
        totalParsed?: number;
        format?: string;
        kpis?: { currentBalance?: number };
        error?: string;
      };

      if (!response.ok) {
        return { status: response.status, body: data };
      }

      // Record in local log
      db.execute(
        `INSERT INTO george_sync_logs (synced_at, file_name, imported_count, skipped_duplicates, detected_balance, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          new Date().toISOString(),
          body.fileName || 'George-Export.csv',
          data.importedCount ?? 0,
          data.skippedDuplicates ?? 0,
          data.kpis?.currentBalance ?? null,
          body.source || 'web'
        ]
      );

      return {
        success: true,
        ...data,
        syncedAt: new Date().toISOString()
      };
    } catch (err: any) {
      return { status: 500, body: { error: err.message || 'Import forward failed' } };
    }
  });

  // Download endpoint for the Windows Taskbar Mini-App executable
  ctx.route('GET', '/download/GeorgeExporter.exe', () => {
    const candidatePaths = [
      path.resolve(__dirname, '../../apps/george-sync/desktop/dist/GeorgeExporter.exe'),
      path.resolve(__dirname, '../desktop/dist/GeorgeExporter.exe'),
      path.resolve(process.cwd(), 'apps/george-sync/desktop/dist/GeorgeExporter.exe')
    ];

    let exePath = '';
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        exePath = p;
        break;
      }
    }

    if (!exePath) {
      return { status: 404, body: { error: 'GeorgeExporter.exe binary not found' } };
    }

    const fileBuf = fs.readFileSync(exePath);
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Content-Disposition': 'attachment; filename="GeorgeExporter.exe"',
        'Content-Length': String(fileBuf.length)
      },
      body: fileBuf
    };
  });
});
