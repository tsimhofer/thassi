import fs from 'node:fs';
import path from 'node:path';
import {
  defineThassiApp,
  ThassiActionRegistry,
  ensureMemoSchema,
  executeFederatedMemoSearch,
} from '@thassi/sdk';

export interface MemoEntryRow {
  id: number;
  source_type: 'markdown' | 'note' | 'keep' | 'drive';
  title: string;
  content: string;
  tags: string;
  file_path: string;
  external_id: string;
  external_url: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export default defineThassiApp((ctx) => {
  ensureMemoSchema(ctx.db);
  const actionRegistry = new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);

  const dataDir = path.resolve(
    process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
  );
  const vaultDir = path.join(dataDir, 'memo_vault');
  fs.mkdirSync(vaultDir, { recursive: true });

  // Index real local .md files from workspace & vault on startup if not yet indexed
  function syncLocalMarkdownFiles(): number {
    let synced = 0;
    const now = new Date().toISOString();
    const scanDirs: Array<{ dir: string; prefix: string }> = [
      { dir: vaultDir, prefix: 'memo_vault' },
      { dir: process.cwd(), prefix: 'repo' },
    ];

    for (const { dir, prefix } of scanDirs) {
      if (!fs.existsSync(dir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 512_000) continue;
          const content = fs.readFileSync(fullPath, 'utf-8');
          const heading =
            content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
            entry.name.replace(/\.md$/i, '');
          const relPath = `${prefix}/${entry.name}`;

          const existing = ctx.db.queryOne<{ id: number; updated_at: string }>(
            'SELECT id, updated_at FROM memo_entries WHERE file_path = ? LIMIT 1',
            [relPath]
          );
          if (existing) {
            ctx.db.execute(
              'UPDATE memo_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?',
              [heading, content, stat.mtime.toISOString(), existing.id]
            );
          } else {
            ctx.db.execute(
              `INSERT INTO memo_entries
               (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
               VALUES ('markdown', ?, ?, ?, ?, '', '', 0, ?, ?)`,
              [
                heading,
                content,
                prefix === 'repo' ? 'markdown,architektur,docs' : 'markdown,vault',
                relPath,
                now,
                stat.mtime.toISOString(),
              ]
            );
          }
          synced++;
        } catch {}
      }
    }
    return synced;
  }

  // Sync Google Keep / Home Assistant Todo & Keep notes + recent Google Drive docs into Memo index
  async function syncExternalSources(): Promise<{
    markdownSynced: number;
    driveSynced: number;
    keepAndNotesSynced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const markdownSynced = syncLocalMarkdownFiles();
    let driveSynced = 0;
    let keepAndNotesSynced = 0;
    const now = new Date().toISOString();

    // 1. Sync sharedDb system_notes into memo_entries
    try {
      const sysNotes = ctx.sharedDb.query<{
        id: number;
        content: string;
        pinned: number;
        created_at: string;
      }>('SELECT * FROM system_notes ORDER BY id DESC LIMIT 100');
      for (const sn of sysNotes) {
        const extId = `sysnote_${sn.id}`;
        const firstLine =
          sn.content
            .split('\n')[0]
            ?.replace(/^#+\s*/, '')
            .trim()
            .slice(0, 72) || `Notiz #${sn.id}`;
        const existing = ctx.db.queryOne<{ id: number }>(
          'SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1',
          [extId]
        );
        if (!existing) {
          ctx.db.execute(
            `INSERT INTO memo_entries
             (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
             VALUES ('note', ?, ?, 'notiz,system', '', ?, '', ?, ?, ?)`,
            [firstLine, sn.content, extId, sn.pinned ? 1 : 0, sn.created_at, sn.created_at]
          );
          keepAndNotesSynced++;
        }
      }
    } catch (e) {
      errors.push(`System Notes: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Sync Home Assistant todo.* / shopping_list / note entities
    try {
      const states = await ctx.ha.getStates();
      const noteLike = states.filter(
        (s) =>
          s.entity_id.startsWith('todo.') ||
          s.entity_id.startsWith('input_text.') ||
          /keep|note|notiz|einkauf|todo/i.test(s.entity_id)
      );
      for (const ent of noteLike) {
        if (!ent.state || ent.state === 'unavailable' || ent.state === 'unknown') continue;
        const extId = `ha_${ent.entity_id}`;
        const friendly = String(ent.attributes?.friendly_name || ent.entity_id);
        const bodyText = `Entity: ${ent.entity_id}\nStatus/Wert: ${ent.state}\nAktualisiert: ${ent.last_updated}`;
        const existing = ctx.db.queryOne<{ id: number }>(
          'SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1',
          [extId]
        );
        if (existing) {
          ctx.db.execute(
            'UPDATE memo_entries SET content = ?, updated_at = ? WHERE id = ?',
            [bodyText, ent.last_updated || now, existing.id]
          );
        } else {
          ctx.db.execute(
            `INSERT INTO memo_entries
             (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
             VALUES ('keep', ?, ?, 'keep,ha,todo', '', ?, '', 0, ?, ?)`,
            [friendly, bodyText, extId, now, ent.last_updated || now]
          );
        }
        keepAndNotesSynced++;
      }
    } catch {}

    // 3. Sync Google Drive files (including Google Docs, Markdown, Text, Keep exports)
    if (ctx.google.getStatus().authorized) {
      try {
        const token = await ctx.google.getValidAccessToken();

        // Try Google Keep REST API v1 first (if Workspace / Keep scope enabled)
        try {
          const keepRes = await fetch('https://keep.googleapis.com/v1/notes?pageSize=30', {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(4000),
          });
          if (keepRes.ok) {
            const keepData = (await keepRes.json()) as { notes?: Array<Record<string, any>> };
            for (const kn of keepData.notes || []) {
              const extId = `gkeep_${kn.name || kn.id}`;
              const title = String(kn.title || 'Google Keep Notiz').trim();
              const body = String(kn.body?.text?.text || '').trim();
              const existing = ctx.db.queryOne<{ id: number }>(
                'SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1',
                [extId]
              );
              if (existing) {
                ctx.db.execute(
                  'UPDATE memo_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?',
                  [title, body, kn.updateTime || now, existing.id]
                );
              } else {
                ctx.db.execute(
                  `INSERT INTO memo_entries
                   (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
                   VALUES ('keep', ?, ?, 'google-keep,notiz', '', ?, 'https://keep.google.com', 0, ?, ?)`,
                  [title, body, extId, kn.createTime || now, kn.updateTime || now]
                );
              }
              keepAndNotesSynced++;
            }
          }
        } catch {}

        // Fetch recent Google Drive files & export text snippets for Docs/Markdown/Text
        const params = new URLSearchParams({
          pageSize: '25',
          q: 'trashed = false',
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,mimeType,modifiedTime,webViewLink,description)',
        });
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5500),
          }
        );
        if (driveRes.ok) {
          const driveData = (await driveRes.json()) as { files?: Array<Record<string, any>> };
          for (const f of driveData.files || []) {
            const fileId = String(f.id || '');
            if (!fileId) continue;
            const extId = `gdrive_${fileId}`;
            const mime = String(f.mimeType || '');
            let extractedText = String(f.description || '').trim();

            // Export text snippet for Google Docs or plain text / markdown files (top 8 docs)
            if (driveSynced < 8) {
              try {
                if (mime === 'application/vnd.google-apps.document') {
                  const exp = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                      fileId
                    )}/export?mimeType=text/plain`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                      signal: AbortSignal.timeout(3500),
                    }
                  );
                  if (exp.ok) {
                    extractedText = (await exp.text()).slice(0, 8000);
                  }
                } else if (mime.startsWith('text/') || mime.includes('markdown')) {
                  const dl = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                      fileId
                    )}?alt=media`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                      signal: AbortSignal.timeout(3500),
                    }
                  );
                  if (dl.ok) {
                    extractedText = (await dl.text()).slice(0, 8000);
                  }
                }
              } catch {}
            }

            if (!extractedText) {
              extractedText = `Google Drive Datei: ${f.name}\nTyp: ${mime}\nGeändert: ${f.modifiedTime || now}`;
            }

            const isKeepDoc = /keep|notiz|note|memo/i.test(String(f.name || ''));
            const sType = isKeepDoc ? 'keep' : 'drive';
            const tags = isKeepDoc ? 'drive,google-keep,notiz' : `drive,${mime.split('/').pop() || 'file'}`;

            const existing = ctx.db.queryOne<{ id: number }>(
              'SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1',
              [extId]
            );
            if (existing) {
              ctx.db.execute(
                'UPDATE memo_entries SET title = ?, content = ?, external_url = ?, updated_at = ? WHERE id = ?',
                [
                  String(f.name || 'Drive File'),
                  extractedText,
                  String(f.webViewLink || ''),
                  String(f.modifiedTime || now),
                  existing.id,
                ]
              );
            } else {
              ctx.db.execute(
                `INSERT INTO memo_entries
                 (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
                 VALUES (?, ?, ?, ?, '', ?, ?, 0, ?, ?)`,
                [
                  sType,
                  String(f.name || 'Drive File'),
                  extractedText,
                  tags,
                  extId,
                  String(f.webViewLink || ''),
                  String(f.modifiedTime || now),
                  String(f.modifiedTime || now),
                ]
              );
            }
            driveSynced++;
          }
        }
      } catch (e) {
        errors.push(`Google Drive: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { markdownSynced, driveSynced, keepAndNotesSynced, errors };
  }

  syncLocalMarkdownFiles();

  // Helper to build action context for federated search
  function getActionCtx() {
    return {
      sharedDb: ctx.sharedDb,
      ha: ctx.ha,
      google: ctx.google,
      dataDir,
      credentials: {
        geminiApiKey: ctx.sharedDb.kvGet<string>('gemini_api_key', '') || '',
        githubToken: ctx.sharedDb.kvGet<string>('github_token', '') || '',
        googleOAuthToken: ctx.sharedDb.kvGet<string>('google_oauth_token', '') || '',
      },
    };
  }

  // GET /overview — returns all indexed Memo entries, source statistics & database inventory
  ctx.route('GET', '/overview', async () => {
    syncLocalMarkdownFiles();
    const entries = ctx.db.query<MemoEntryRow>(
      'SELECT * FROM memo_entries ORDER BY pinned DESC, updated_at DESC LIMIT 200'
    );

    const counts = {
      total: entries.length,
      markdown: entries.filter((e) => e.source_type === 'markdown').length,
      notes: entries.filter((e) => e.source_type === 'note' || e.source_type === 'keep').length,
      drive: entries.filter((e) => e.source_type === 'drive').length,
    };

    // Inspect available SQLite app databases in /data/apps
    const appsDbDir = path.join(dataDir, 'apps');
    const dbInventory: Array<{ dbName: string; sizeKb: number }> = [];
    try {
      if (fs.existsSync(appsDbDir)) {
        for (const f of fs.readdirSync(appsDbDir)) {
          if (f.endsWith('.db')) {
            const st = fs.statSync(path.join(appsDbDir, f));
            dbInventory.push({
              dbName: f.replace(/\.db$/, ''),
              sizeKb: Math.round(st.size / 1024),
            });
          }
        }
      }
    } catch {}

    const tagSet = new Set<string>();
    for (const e of entries) {
      for (const t of e.tags.split(',')) {
        const clean = t.trim();
        if (clean) tagSet.add(clean);
      }
    }

    return {
      counts: {
        ...counts,
        databases: dbInventory.length,
      },
      googleAuthorized: ctx.google.getStatus().authorized,
      dbInventory,
      tags: Array.from(tagSet).slice(0, 35),
      entries,
    };
  });

  // GET /search?q=...&sources=all|markdown|notes|drive|database&limit=35
  ctx.route('GET', '/search', async (req) => {
    const q = String(req.query.q || '').trim();
    const sources = String(req.query.sources || 'all').toLowerCase();
    const limit = Math.max(5, Math.min(100, Number(req.query.limit || 40)));
    const tagFilter = String(req.query.tag || '').trim().toLowerCase();

    let hits = await executeFederatedMemoSearch(
      getActionCtx(),
      q,
      sources,
      limit,
      (t) => actionRegistry.resolveGoogleAccessToken(t)
    );

    if (tagFilter) {
      hits = hits.filter((h) => h.tags.some((t) => t.toLowerCase() === tagFilter));
    }

    return {
      query: q,
      sources,
      count: hits.length,
      results: hits,
    };
  });

  // GET /document?id=... — Loads full document content (local .md, Memo DB entry, or live Google Drive export)
  ctx.route('GET', '/document', async (req) => {
    const id = String(req.query.id || '').trim();
    if (!id) return { status: 400, body: { error: 'id is required' } };

    if (id.startsWith('memo_')) {
      const numId = Number(id.replace('memo_', ''));
      const row = ctx.db.queryOne<MemoEntryRow>('SELECT * FROM memo_entries WHERE id = ?', [numId]);
      if (!row) return { status: 404, body: { error: 'Entry not found' } };

      // If it's a Google Drive entry with short preview, try fetching full text live
      if (row.source_type === 'drive' && row.external_id.startsWith('gdrive_')) {
        const fileId = row.external_id.replace('gdrive_', '');
        try {
          const res = await actionRegistry.execute<Record<string, any>>('google.drive.read_file', {
            fileId,
            maxChars: '25000',
          });
          if (res.status === 'success' && res.data?.content) {
            return {
              id,
              entryId: row.id,
              sourceType: row.source_type,
              title: row.title,
              content: String(res.data.content),
              tags: row.tags,
              ref: row.file_path || row.external_id,
              externalUrl: row.external_url,
              pinned: Boolean(row.pinned),
              updatedAt: row.updated_at,
            };
          }
        } catch {}
      }

      return {
        id,
        entryId: row.id,
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        tags: row.tags,
        ref: row.file_path || row.external_id || `memo#${row.id}`,
        externalUrl: row.external_url,
        pinned: Boolean(row.pinned),
        updatedAt: row.updated_at,
      };
    }

    if (id.startsWith('drive_')) {
      const fileId = id.replace('drive_', '');
      const res = await actionRegistry.execute<Record<string, any>>('google.drive.read_file', {
        fileId,
        maxChars: '25000',
      });
      return {
        id,
        sourceType: 'drive',
        title: String(res.data?.name || 'Google Drive Document'),
        content: String(res.data?.content || res.summary),
        tags: 'drive,google',
        ref: `drive:${fileId}`,
        externalUrl: String(res.data?.webViewLink || ''),
        pinned: false,
        updatedAt: String(res.data?.modifiedTime || new Date().toISOString()),
      };
    }

    if (id.startsWith('md_')) {
      const fileName = path.basename(id.replace('md_', ''));
      const candidates = [path.join(vaultDir, fileName), path.join(process.cwd(), fileName)];
      for (const full of candidates) {
        if (fs.existsSync(full)) {
          const content = fs.readFileSync(full, 'utf-8');
          const st = fs.statSync(full);
          return {
            id,
            sourceType: 'markdown',
            title: fileName,
            content,
            tags: 'markdown,file',
            ref: fileName,
            pinned: false,
            updatedAt: st.mtime.toISOString(),
          };
        }
      }
    }

    return { status: 404, body: { error: `Document ${id} not found` } };
  });

  // POST /entries — Create or update a Note / Keep note / Markdown file
  ctx.route('POST', '/entries', async (req) => {
    const body = (req.body || {}) as {
      id?: number;
      title?: string;
      content?: string;
      tags?: string;
      sourceType?: 'markdown' | 'note' | 'keep';
      pinned?: boolean;
    };
    const title = String(body.title || '').trim();
    if (!title) {
      return { status: 400, body: { error: 'Titel ist erforderlich' } };
    }
    const content = String(body.content || '').trim();
    const tags = String(body.tags || 'memo').trim();
    const sourceType = body.sourceType || 'markdown';
    const pinned = body.pinned ? 1 : 0;
    const now = new Date().toISOString();

    let filePathRel = '';
    if (sourceType === 'markdown') {
      const safeSlug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9äöüß_-]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || `memo-${Date.now()}`;
      const fullPath = path.join(vaultDir, `${safeSlug}.md`);
      const mdText = content.startsWith('#') ? content : `# ${title}\n\n${content}\n`;
      fs.writeFileSync(fullPath, mdText, 'utf-8');
      filePathRel = `memo_vault/${safeSlug}.md`;
    }

    if (body.id) {
      ctx.db.execute(
        `UPDATE memo_entries
         SET title = ?, content = ?, tags = ?, source_type = ?, file_path = COALESCE(NULLIF(?, ''), file_path), pinned = ?, updated_at = ?
         WHERE id = ?`,
        [title, content, tags, sourceType, filePathRel, pinned, now, Number(body.id)]
      );
      return { id: Number(body.id), updated: true, filePath: filePathRel };
    }

    const res = ctx.db.execute(
      `INSERT INTO memo_entries
       (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
      [sourceType, title, content, tags, filePathRel, pinned, now, now]
    );
    return { id: Number(res.lastInsertRowid), created: true, filePath: filePathRel };
  });

  // DELETE /entries?id=...
  ctx.route('DELETE', '/entries', (req) => {
    const rawId = String(req.query.id || '').replace(/^memo_/, '');
    const id = Number(rawId);
    if (!id) return { status: 400, body: { error: 'Valid id required' } };
    const existing = ctx.db.queryOne<MemoEntryRow>('SELECT * FROM memo_entries WHERE id = ?', [id]);
    if (existing?.file_path && existing.file_path.startsWith('memo_vault/')) {
      const full = path.join(dataDir, existing.file_path);
      try {
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch {}
    }
    ctx.db.execute('DELETE FROM memo_entries WHERE id = ?', [id]);
    return { deleted: id };
  });

  // POST /sync — Sync Google Drive, Google Keep/HA Todo, and local .md files
  ctx.route('POST', '/sync', async () => {
    const report = await syncExternalSources();
    return {
      ok: true,
      syncedAt: new Date().toISOString(),
      ...report,
    };
  });

  // POST /bundle — Compile a structured Topic Context Bundle for AI / Cortex
  ctx.route('POST', '/bundle', async (req) => {
    const body = (req.body || {}) as { topic?: string; sources?: string; maxSnippets?: number };
    const topic = String(body.topic || '').trim();
    const sources = String(body.sources || 'all');
    const maxSnippets = Math.max(3, Math.min(30, Number(body.maxSnippets || 12)));

    const hits = await executeFederatedMemoSearch(
      getActionCtx(),
      topic,
      sources,
      maxSnippets,
      (t) => actionRegistry.resolveGoogleAccessToken(t)
    );

    const bundleMarkdown = [
      `# MEMO WISSENS-BUNDLE — "${topic || 'Alle Quellen'}"`,
      `Stand: ${new Date().toLocaleString('de-AT')} · Treffer: ${hits.length}`,
      '',
      ...hits.map(
        (h, i) =>
          `## [${i + 1}] ${h.title} (${h.sourceBadge} · ${h.ref})\n${h.contentPreview || h.snippet}`
      ),
    ].join('\n\n');

    return {
      topic,
      count: hits.length,
      results: hits,
      bundleMarkdown,
    };
  });

  // ============================================================================
  // HORIZON NOTES (note_yyyyMMdd-HHmmss.json local storage + Google Keep & Drive)
  // ============================================================================
  const notesDir = path.join(dataDir, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  const WINDOWS_NOTES_DIR = 'c:\\Users\\thoma\\source\\repos\\thassi\\data\\notes';
  const PC_AGENT_BASE_URL = 'http://192.168.188.46:5185';

  interface HorizonNoteRecord {
    fileName: string;
    id: string;
    content: string;
    createdAt: string;
    timestampFormatted: string;
    localPath: string;
    windowsPath: string;
    syncedKeep?: boolean;
    syncedKeepAt?: string | null;
    keepNoteId?: string | null;
    syncedDrive?: boolean;
    syncedDriveAt?: string | null;
    driveFileId?: string | null;
    driveWebViewLink?: string | null;
  }

  function formatTimestampYyyyMmDdHhMmSs(dateInput: Date = new Date()): string {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Vienna',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(dateInput);
      const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
      return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
    } catch {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${dateInput.getFullYear()}${pad(dateInput.getMonth() + 1)}${pad(dateInput.getDate())}-${pad(dateInput.getHours())}${pad(dateInput.getMinutes())}${pad(dateInput.getSeconds())}`;
    }
  }

  function generateUniqueNoteFileName(baseDate: Date = new Date()): {
    fileName: string;
    timestampFormatted: string;
  } {
    let offsetSec = 0;
    while (offsetSec < 120) {
      const d = new Date(baseDate.getTime() + offsetSec * 1000);
      const ts = formatTimestampYyyyMmDdHhMmSs(d);
      const candidate = `note_${ts}.json`;
      if (!fs.existsSync(path.join(notesDir, candidate))) {
        return { fileName: candidate, timestampFormatted: ts };
      }
      offsetSec++;
    }
    const ts = formatTimestampYyyyMmDdHhMmSs(baseDate);
    return { fileName: `note_${ts}.json`, timestampFormatted: ts };
  }

  async function mirrorNoteToWindowsWorkspace(record: HorizonNoteRecord): Promise<void> {
    try {
      const jsonB64 = Buffer.from(JSON.stringify(record, null, 2), 'utf-8').toString('base64');
      const safeFile = record.fileName.replace(/[^a-zA-Z0-9._-]/g, '');
      const psScript = [
        `$dir = '${WINDOWS_NOTES_DIR}';`,
        `if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };`,
        `$bytes = [Convert]::FromBase64String('${jsonB64}');`,
        `[System.IO.File]::WriteAllBytes((Join-Path $dir '${safeFile}'), $bytes);`,
      ].join(' ');
      await fetch('http://127.0.0.1:8099/api/apps/workflows/execute-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          axonId: 'pc.powershell.exec',
          input: { script: psScript },
        }),
        signal: AbortSignal.timeout(4500),
      });
    } catch {
      // Non-fatal if Windows PC agent is asleep
    }
  }

  async function deleteMirroredNoteFromWindowsWorkspace(fileName: string): Promise<void> {
    try {
      const safeFile = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '');
      const psScript = `$p = Join-Path '${WINDOWS_NOTES_DIR}' '${safeFile}'; if (Test-Path $p) { Remove-Item $p -Force }`;
      await fetch('http://127.0.0.1:8099/api/apps/workflows/execute-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          axonId: 'pc.powershell.exec',
          input: { script: psScript },
        }),
        signal: AbortSignal.timeout(4500),
      });
    } catch {}
  }

  function saveHorizonNoteRecord(record: HorizonNoteRecord): void {
    const fullPath = path.join(notesDir, path.basename(record.fileName));
    fs.writeFileSync(fullPath, JSON.stringify(record, null, 2), 'utf-8');
    void mirrorNoteToWindowsWorkspace(record);
  }

  function migrateExistingSystemNotes(): void {
    try {
      const existingFiles = fs.readdirSync(notesDir).filter((f) => /^note_\d{8}-\d{6}\.json$/i.test(f));
      if (existingFiles.length > 0) return;

      const sysNotes = ctx.sharedDb.query<{
        id: number;
        content: string;
        pinned: number;
        created_at: string;
      }>('SELECT * FROM system_notes ORDER BY id ASC LIMIT 50');

      for (const sn of sysNotes) {
        if (!sn.content?.trim()) continue;
        const parsedDate = sn.created_at ? new Date(sn.created_at) : new Date();
        const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const { fileName, timestampFormatted } = generateUniqueNoteFileName(validDate);
        const rec: HorizonNoteRecord = {
          fileName,
          id: fileName.replace(/\.json$/i, ''),
          content: sn.content.trim(),
          createdAt: validDate.toISOString(),
          timestampFormatted,
          localPath: `/data/notes/${fileName}`,
          windowsPath: `${WINDOWS_NOTES_DIR}\\${fileName}`,
          syncedKeep: false,
          syncedKeepAt: null,
          keepNoteId: null,
          syncedDrive: false,
          syncedDriveAt: null,
          driveFileId: null,
          driveWebViewLink: null,
        };
        saveHorizonNoteRecord(rec);
      }
    } catch {}
  }

  migrateExistingSystemNotes();

  function listHorizonNotes(): HorizonNoteRecord[] {
    try {
      const files = fs
        .readdirSync(notesDir)
        .filter((f) => /^note_.*\.json$/i.test(f))
        .sort((a, b) => b.localeCompare(a));

      const results: HorizonNoteRecord[] = [];
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(notesDir, f), 'utf-8');
          const parsed = JSON.parse(raw) as HorizonNoteRecord;
          results.push({
            ...parsed,
            fileName: f,
            id: parsed.id || f.replace(/\.json$/i, ''),
            localPath: `/data/notes/${f}`,
            windowsPath: `${WINDOWS_NOTES_DIR}\\${f}`,
          });
        } catch {}
      }
      return results;
    } catch {
      return [];
    }
  }

  // GET /horizon-notes — List all local note_yyyyMMdd-HHmmss.json files
  ctx.route('GET', '/horizon-notes', () => {
    const notes = listHorizonNotes();
    return {
      notes,
      count: notes.length,
      notesDir: '/data/notes',
      windowsNotesDir: WINDOWS_NOTES_DIR,
      googleAuthorized: ctx.google.getStatus().authorized,
    };
  });

  // POST /horizon-notes — Create a new note_yyyyMMdd-HHmmss.json file locally
  ctx.route('POST', '/horizon-notes', (req) => {
    const body = (req.body || {}) as { content?: string };
    const content = String(body.content || '').trim();
    if (!content) {
      return { status: 400, body: { error: 'Note content is required' } };
    }

    const now = new Date();
    const { fileName, timestampFormatted } = generateUniqueNoteFileName(now);
    const record: HorizonNoteRecord = {
      fileName,
      id: fileName.replace(/\.json$/i, ''),
      content,
      createdAt: now.toISOString(),
      timestampFormatted,
      localPath: `/data/notes/${fileName}`,
      windowsPath: `${WINDOWS_NOTES_DIR}\\${fileName}`,
      syncedKeep: false,
      syncedKeepAt: null,
      keepNoteId: null,
      syncedDrive: false,
      syncedDriveAt: null,
      driveFileId: null,
      driveWebViewLink: null,
    };

    saveHorizonNoteRecord(record);

    // Also keep system_notes & memo_entries in sync for Cortex search
    try {
      ctx.sharedDb.execute(
        'INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)',
        [content, record.createdAt]
      );
    } catch {}

    try {
      ctx.db.execute(
        `INSERT INTO memo_entries
         (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
         VALUES ('note', ?, ?, 'notiz,horizon,json', ?, ?, '', 0, ?, ?)`,
        [
          fileName,
          content,
          `notes/${fileName}`,
          record.id,
          record.createdAt,
          record.createdAt,
        ]
      );
    } catch {}

    const notes = listHorizonNotes();
    return {
      ok: true,
      note: record,
      notes,
    };
  });

  // DELETE /horizon-notes?fileName=note_yyyyMMdd-HHmmss.json
  ctx.route('DELETE', '/horizon-notes', (req) => {
    const rawFile = String(req.query.fileName || req.query.id || '').trim();
    if (!rawFile) {
      return { status: 400, body: { error: 'fileName is required' } };
    }
    const normalizedFile = rawFile.endsWith('.json') ? path.basename(rawFile) : `${path.basename(rawFile)}.json`;
    const fullPath = path.join(notesDir, normalizedFile);

    let deletedContent = '';
    if (fs.existsSync(fullPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as HorizonNoteRecord;
        deletedContent = parsed.content || '';
      } catch {}
      try {
        fs.unlinkSync(fullPath);
      } catch {}
    }

    void deleteMirroredNoteFromWindowsWorkspace(normalizedFile);

    try {
      ctx.db.execute('DELETE FROM memo_entries WHERE external_id = ? OR file_path = ?', [
        normalizedFile.replace(/\.json$/i, ''),
        `notes/${normalizedFile}`,
      ]);
      if (deletedContent) {
        ctx.sharedDb.execute('DELETE FROM system_notes WHERE content = ?', [deletedContent]);
      }
    } catch {}

    return {
      ok: true,
      deleted: normalizedFile,
      notes: listHorizonNotes(),
    };
  });

  // POST /horizon-notes/send — Send a note_yyyyMMdd-HHmmss.json to Google Keep/Notes or Google Drive
  ctx.route('POST', '/horizon-notes/send', async (req) => {
    const body = (req.body || {}) as { fileName?: string; target?: 'keep' | 'drive' };
    const rawFile = String(body.fileName || '').trim();
    const target = body.target === 'drive' ? 'drive' : 'keep';
    if (!rawFile) {
      return { status: 400, body: { error: 'fileName is required' } };
    }

    const normalizedFile = rawFile.endsWith('.json') ? path.basename(rawFile) : `${path.basename(rawFile)}.json`;
    const fullPath = path.join(notesDir, normalizedFile);
    if (!fs.existsSync(fullPath)) {
      return { status: 404, body: { error: `Note file ${normalizedFile} not found` } };
    }

    const record = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as HorizonNoteRecord;
    const nowIso = new Date().toISOString();

    if (target === 'keep') {
      let keepNoteId = `keep_${record.timestampFormatted}`;
      let keepUrl = 'https://keep.google.com';
      let syncedVia = 'Memo Google Keep / HA Notes Bridge';

      // 1. Try Google Keep REST API v1 if OAuth token is available
      try {
        const token = await actionRegistry.resolveGoogleAccessToken();
        if (token) {
          const keepRes = await fetch('https://keep.googleapis.com/v1/notes', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: normalizedFile.replace(/\.json$/i, ''),
              body: {
                text: {
                  text: record.content,
                },
              },
            }),
            signal: AbortSignal.timeout(4500),
          });
          if (keepRes.ok) {
            const keepJson = (await keepRes.json()) as { name?: string };
            if (keepJson.name) {
              keepNoteId = keepJson.name;
              syncedVia = 'Google Keep API v1';
            }
          }
        }
      } catch {}

      // 2. Also push to Home Assistant todo list / persistent notification if connected
      try {
        const states = await ctx.ha.getStates();
        const todoEntity = states.find((s) => s.entity_id.startsWith('todo.'));
        if (todoEntity) {
          await ctx.ha.callService('todo', 'add_item', {
            entity_id: todoEntity.entity_id,
            item: `${record.content} (${normalizedFile})`,
          });
          syncedVia = `Google Keep & HA (${todoEntity.entity_id})`;
        }
        await ctx.ha.callService('persistent_notification', 'create', {
          title: `Google Keep / Notes · ${normalizedFile}`,
          message: record.content,
          notification_id: `horizon_keep_${record.timestampFormatted}`,
        });
      } catch {}

      // 3. Upsert into memo_entries as source_type = 'keep' (GKEEP badge in Memo & Cortex)
      try {
        const extId = `gkeep_${record.id}`;
        const existing = ctx.db.queryOne<{ id: number }>(
          'SELECT id FROM memo_entries WHERE external_id = ? OR file_path = ? LIMIT 1',
          [extId, `notes/${normalizedFile}`]
        );
        if (existing) {
          ctx.db.execute(
            `UPDATE memo_entries
             SET source_type = 'keep', title = ?, content = ?, tags = 'google-keep,notiz,horizon', external_id = ?, external_url = ?, updated_at = ?
             WHERE id = ?`,
            [normalizedFile, record.content, extId, keepUrl, nowIso, existing.id]
          );
        } else {
          ctx.db.execute(
            `INSERT INTO memo_entries
             (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
             VALUES ('keep', ?, ?, 'google-keep,notiz,horizon', ?, ?, ?, 0, ?, ?)`,
            [normalizedFile, record.content, `notes/${normalizedFile}`, extId, keepUrl, record.createdAt, nowIso]
          );
        }
      } catch {}

      record.syncedKeep = true;
      record.syncedKeepAt = nowIso;
      record.keepNoteId = keepNoteId;
      saveHorizonNoteRecord(record);

      return {
        ok: true,
        target: 'keep',
        syncedVia,
        keepUrl,
        note: record,
        notes: listHorizonNotes(),
      };
    }

    // target === 'drive' (Google Drive)
    let driveFileId = `local_${record.timestampFormatted}`;
    let driveWebViewLink = 'https://drive.google.com/drive/my-drive';
    let syncedVia = 'Memo Drive Vault';

    try {
      const token = await actionRegistry.resolveGoogleAccessToken();
      if (token) {
        const boundary = `thassi_note_${Date.now()}`;
        const metadata = {
          name: normalizedFile,
          mimeType: 'application/json',
          description: `Thassi Horizon Note (${record.timestampFormatted}): ${record.content.slice(0, 200)}`,
        };
        const filePayload = JSON.stringify(
          {
            ...record,
            syncedDrive: true,
            syncedDriveAt: nowIso,
          },
          null,
          2
        );
        const multipartBody = [
          `--${boundary}`,
          'Content-Type: application/json; charset=UTF-8',
          '',
          JSON.stringify(metadata),
          `--${boundary}`,
          'Content-Type: application/json; charset=UTF-8',
          '',
          filePayload,
          `--${boundary}--`,
          '',
        ].join('\r\n');

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
            signal: AbortSignal.timeout(7000),
          }
        );

        if (uploadRes.ok) {
          const upData = (await uploadRes.json()) as {
            id?: string;
            name?: string;
            webViewLink?: string;
          };
          if (upData.id) {
            driveFileId = upData.id;
            driveWebViewLink =
              upData.webViewLink || `https://drive.google.com/file/d/${upData.id}/view`;
            syncedVia = 'Google Drive API v3';
          }
        }
      }
    } catch {}

    // Upsert into memo_entries with source_type = 'drive'
    try {
      const extId = `gdrive_${driveFileId}`;
      const existing = ctx.db.queryOne<{ id: number }>(
        'SELECT id FROM memo_entries WHERE external_id = ? OR file_path = ? LIMIT 1',
        [extId, `notes/${normalizedFile}`]
      );
      if (existing) {
        ctx.db.execute(
          `UPDATE memo_entries
           SET source_type = 'drive', title = ?, content = ?, tags = 'drive,json,horizon', external_id = ?, external_url = ?, updated_at = ?
           WHERE id = ?`,
          [normalizedFile, record.content, extId, driveWebViewLink, nowIso, existing.id]
        );
      } else {
        ctx.db.execute(
          `INSERT INTO memo_entries
           (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
           VALUES ('drive', ?, ?, 'drive,json,horizon', ?, ?, ?, 0, ?, ?)`,
          [
            normalizedFile,
            record.content,
            `notes/${normalizedFile}`,
            extId,
            driveWebViewLink,
            record.createdAt,
            nowIso,
          ]
        );
      }
    } catch {}

    record.syncedDrive = true;
    record.syncedDriveAt = nowIso;
    record.driveFileId = driveFileId;
    record.driveWebViewLink = driveWebViewLink;
    saveHorizonNoteRecord(record);

    return {
      ok: true,
      target: 'drive',
      syncedVia,
      driveFileId,
      driveWebViewLink,
      note: record,
      notes: listHorizonNotes(),
    };
  });

  // Publish Memo sensor to Home Assistant
  ctx.scheduleJob({
    id: 'memo-sync-sensor',
    name: 'Sync Memo Knowledge Index & Publish HA Sensor',
    intervalMinutes: 30,
    runOnStart: true,
    handler: async () => {
      await syncExternalSources();
      const cnt =
        ctx.db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM memo_entries')?.c ?? 0;
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        await ctx.ha.publishSensor('total_documents', cnt, {
          friendly_name: 'Memo Wissens-Dokumente',
          unit_of_measurement: 'docs',
          icon: 'mdi:text-search-variant',
        });
      }
      return `Memo indexed ${cnt} documents`;
    },
  });
});
