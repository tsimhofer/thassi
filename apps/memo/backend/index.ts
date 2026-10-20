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
