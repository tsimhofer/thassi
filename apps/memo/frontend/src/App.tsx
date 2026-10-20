import React, { useEffect, useRef, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('memo');

interface MemoSearchResult {
  id: string;
  sourceType: 'markdown' | 'notes' | 'drive' | 'database';
  sourceBadge: string;
  title: string;
  snippet: string;
  contentPreview: string;
  ref: string;
  tags: string[];
  updatedAt: string;
  score: number;
  externalUrl?: string;
}

interface MemoOverview {
  counts: {
    total: number;
    markdown: number;
    notes: number;
    drive: number;
    databases: number;
  };
  googleAuthorized: boolean;
  dbInventory: Array<{ dbName: string; sizeKb: number }>;
  tags: string[];
}

interface MemoDocumentDetail {
  id: string;
  entryId?: number;
  sourceType: string;
  title: string;
  content: string;
  tags: string;
  ref: string;
  externalUrl?: string;
  pinned?: boolean;
  updatedAt: string;
}

const MEMO_STYLES = `
  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --bg-btn: #17171a;
    --bg-btn-hover: #202025;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-btn: rgba(255, 255, 255, 0.14);
    --line-focus: rgba(255, 255, 255, 0.24);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .tactile-btn {
    background: var(--bg-btn);
    color: var(--text-secondary);
    border: 1px solid var(--line-btn);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.35);
    border-radius: 5px;
    padding: 6px 13px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: transform 70ms ease, background 110ms ease, border-color 110ms ease, color 110ms ease;
  }

  .tactile-btn:hover:not(:disabled) {
    background: var(--bg-btn-hover);
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  .tactile-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
  }

  .tactile-btn.primary {
    background: var(--text-primary);
    color: var(--bg-canvas);
    border-color: var(--text-primary);
  }

  .tactile-btn.primary:hover:not(:disabled) {
    background: #e4e4e7;
    color: var(--bg-canvas);
  }

  .memo-input {
    background: var(--bg-input);
    border: 1px solid var(--line-btn);
    border-radius: 4px;
    padding: 7px 11px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
    width: 100%;
  }

  .memo-input:focus {
    border-color: var(--line-focus);
  }

  .tab-link {
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    padding: 10px 0;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: color 120ms ease;
  }

  .tab-link:hover {
    color: var(--text-secondary);
  }

  .tab-link.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .memo-row {
    display: grid;
    grid-template-columns: 92px minmax(200px, 1.3fr) minmax(240px, 2fr) 150px 72px;
    align-items: center;
    gap: 16px;
    min-height: 46px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line-hairline);
    cursor: pointer;
    transition: background 90ms ease;
  }

  .memo-row:hover {
    background: var(--bg-elevated);
  }

  .memo-row.selected {
    background: #151519;
    border-left: 2px solid var(--text-primary);
    padding-left: 10px;
  }

  @media (max-width: 1024px) {
    .memo-split {
      grid-template-columns: 1fr !important;
    }
    .memo-row {
      grid-template-columns: 80px 1fr 110px;
    }
    .memo-row .hide-mobile {
      display: none;
    }
  }
`;

export default function App() {
  const [overview, setOverview] = useState<MemoOverview | null>(null);
  const [query, setQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [results, setResults] = useState<MemoSearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<MemoSearchResult | null>(null);
  const [docDetail, setDocDetail] = useState<MemoDocumentDetail | null>(null);

  // Editor / Create Mode
  const [editorMode, setEditorMode] = useState<'view' | 'edit' | 'bundle'>('view');
  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editTags, setEditTags] = useState<string>('markdown,wissen');
  const [editSourceType, setEditSourceType] = useState<'markdown' | 'note' | 'keep'>('markdown');
  const [editPinned, setEditPinned] = useState<boolean>(false);
  const [bundleMarkdown, setBundleMarkdown] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  const searchDebounceRef = useRef<number | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const loadOverview = async () => {
    try {
      const ov = await api.get<MemoOverview>('/overview');
      setOverview(ov);
    } catch (e) {
      console.error(e);
    }
  };

  const runSearch = async (qStr = query, src = sourceFilter, tag = tagFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: qStr,
        sources: src,
        limit: '50',
      });
      if (tag) params.set('tag', tag);
      const data = await api.get<{ count: number; results: MemoSearchResult[] }>(
        `/search?${params.toString()}`
      );
      setResults(data.results || []);
      if (!selectedItem && data.results?.length > 0) {
        void selectResult(data.results[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    void runSearch('', 'all', '');
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      void runSearch(val, sourceFilter, tagFilter);
    }, 240);
  };

  const selectResult = async (item: MemoSearchResult) => {
    setSelectedItem(item);
    setEditorMode('view');
    setDocDetail({
      id: item.id,
      sourceType: item.sourceType,
      title: item.title,
      content: item.contentPreview || item.snippet,
      tags: item.tags.join(', '),
      ref: item.ref,
      externalUrl: item.externalUrl,
      updatedAt: item.updatedAt,
    });

    if (item.id.startsWith('memo_') || item.id.startsWith('md_') || item.id.startsWith('drive_')) {
      try {
        const full = await api.get<MemoDocumentDetail>(
          `/document?id=${encodeURIComponent(item.id)}`
        );
        setDocDetail(full);
      } catch {}
    }
  };

  const handleSyncAll = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await api.post<{
        markdownSynced: number;
        driveSynced: number;
        keepAndNotesSynced: number;
      }>('/sync', {});
      notify(
        `Sync abgeschlossen: ${res.markdownSynced} .md · ${res.driveSynced} Drive · ${res.keepAndNotesSynced} Notizen`
      );
      await loadOverview();
      await runSearch(query, sourceFilter, tagFilter);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const openNewNoteEditor = (type: 'markdown' | 'note' | 'keep' = 'markdown') => {
    setEditId(undefined);
    setEditTitle('');
    setEditContent('');
    setEditTags(type === 'markdown' ? 'markdown,wissen' : 'keep,notiz');
    setEditSourceType(type);
    setEditPinned(false);
    setEditorMode('edit');
  };

  const openEditCurrent = () => {
    if (!docDetail) return;
    const numericId = docDetail.id.startsWith('memo_')
      ? Number(docDetail.id.replace('memo_', ''))
      : docDetail.entryId;
    setEditId(numericId);
    setEditTitle(docDetail.title);
    setEditContent(docDetail.content);
    setEditTags(docDetail.tags || 'memo');
    setEditSourceType(
      docDetail.sourceType === 'note' || docDetail.sourceType === 'keep'
        ? (docDetail.sourceType as 'note' | 'keep')
        : 'markdown'
    );
    setEditPinned(Boolean(docDetail.pinned));
    setEditorMode('edit');
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    try {
      await api.post('/entries', {
        id: editId,
        title: editTitle,
        content: editContent,
        tags: editTags,
        sourceType: editSourceType,
        pinned: editPinned,
      });
      notify(`Gespeichert: ${editTitle}`);
      setEditorMode('view');
      await loadOverview();
      await runSearch(query, sourceFilter, tagFilter);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteCurrent = async () => {
    if (!docDetail || !docDetail.id.startsWith('memo_')) return;
    try {
      await api.delete(`/entries?id=${encodeURIComponent(docDetail.id)}`);
      notify(`Eintrag gelöscht`);
      setSelectedItem(null);
      setDocDetail(null);
      await loadOverview();
      await runSearch(query, sourceFilter, tagFilter);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBuildTopicBundle = async () => {
    try {
      const res = await api.post<{ bundleMarkdown: string; count: number }>('/bundle', {
        topic: query,
        sources: sourceFilter,
        maxSnippets: 15,
      });
      setBundleMarkdown(res.bundleMarkdown);
      setEditorMode('bundle');
      notify(`Wissens-Dossier mit ${res.count} Quellen kompiliert`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const openInCortex = (topicOrText: string) => {
    const encoded = encodeURIComponent(topicOrText);
    window.location.href = `/apps/cortex/?topic=${encoded}`;
  };

  const counts = overview?.counts || {
    total: 0,
    markdown: 0,
    notes: 0,
    drive: 0,
    databases: 0,
  };

  return (
    <div style={{ minHeight: '100vh', padding: '32px 48px', maxWidth: 1440 }}>
      <style>{MEMO_STYLES}</style>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#141417',
            border: '1px solid var(--line-focus)',
            color: 'var(--text-primary)',
            padding: '8px 14px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      {/* HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Memo
          </h1>
          <span
            style={{
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: overview?.googleAuthorized ? 'var(--dot-ok)' : 'var(--dot-warn)',
                display: 'inline-block',
              }}
            />
            {counts.markdown} .md Files · {counts.notes} Notizen/Keep · {counts.drive} Google Drive ·{' '}
            {counts.databases} SQLite DBs
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 280 }}>
            <input
              className="memo-input"
              placeholder="/ Thema, Datei, Buchung oder Notiz suchen..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
          <button className="tactile-btn" onClick={() => void handleSyncAll()} disabled={syncing}>
            {syncing ? 'Synchronisiere...' : 'Drive & .md Sync'}
          </button>
          <button className="tactile-btn" onClick={() => void handleBuildTopicBundle()}>
            Themen-Dossier
          </button>
          <button className="tactile-btn primary" onClick={() => openNewNoteEditor('markdown')}>
            + .md / Notiz
          </button>
        </div>
      </header>

      {/* DOMAIN / SOURCE TABS */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          borderBottom: '1px solid var(--line-hairline)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `ALLE QUELLEN (${results.length})` },
            { id: 'markdown', label: `LOKALE .MD FILES (${counts.markdown})` },
            { id: 'notes', label: `GOOGLE NOTIZEN & KEEP (${counts.notes})` },
            { id: 'drive', label: `GOOGLE DRIVE (${counts.drive})` },
            { id: 'database', label: `SQLITE DATENBANKEN (${counts.databases})` },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`tab-link ${sourceFilter === tab.id ? 'active' : ''}`}
              onClick={() => {
                setSourceFilter(tab.id);
                void runSearch(query, tab.id, tagFilter);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tag Filter Strip */}
        {overview && overview.tags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              TAG:
            </span>
            {tagFilter && (
              <button
                className="tactile-btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => {
                  setTagFilter('');
                  void runSearch(query, sourceFilter, '');
                }}
              >
                #{tagFilter} ×
              </button>
            )}
            {overview.tags.slice(0, 6).map((t) => (
              <button
                key={t}
                onClick={() => {
                  const next = tagFilter === t ? '' : t;
                  setTagFilter(next);
                  void runSearch(query, sourceFilter, next);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: tagFilter === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* MASTER-DETAIL SPLIT */}
      <div
        className="memo-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(380px, 1fr)',
          gap: 32,
          alignItems: 'start',
        }}
      >
        {/* LEFT: FEDERATED KNOWLEDGE TABLE */}
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '92px minmax(200px, 1.3fr) minmax(240px, 2fr) 150px 72px',
              gap: 16,
              padding: '0 12px 8px 12px',
              borderBottom: '1px solid var(--line-hairline)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            <span>QUELLE</span>
            <span>TITEL / THEMA</span>
            <span className="hide-mobile">AUSZUG / INHALT</span>
            <span className="hide-mobile">REFERENZ</span>
            <span style={{ textAlign: 'right' }}>SCORE</span>
          </div>

          {loading ? (
            <div style={{ padding: '24px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
              Durchsuche Google Drive, Notizen, .md-Dateien & SQLite...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '24px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
              Keine Treffer für „{query}“. Klicke oben rechts auf „Drive & .md Sync“ oder lege eine
              neue Notiz an.
            </div>
          ) : (
            results.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`memo-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => void selectResult(item)}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--dot-ok)',
                        flexShrink: 0,
                      }}
                    />
                    {item.sourceBadge}
                  </div>

                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    className="hide-mobile"
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.snippet}
                  </div>

                  <div
                    className="hide-mobile"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.ref}
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.score}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT: INSPECTOR / MARKDOWN EDITOR / BUNDLE PANEL */}
        <aside
          style={{
            borderLeft: '1px solid var(--line-hairline)',
            paddingLeft: 28,
            minHeight: 540,
          }}
        >
          {editorMode === 'edit' ? (
            <form onSubmit={handleSaveEntry} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  {editId ? `EINTRAG #${editId} BEARBEITEN` : 'NEUES DOKUMENT / NOTIZ'}
                </span>
                <button
                  type="button"
                  className="tactile-btn"
                  onClick={() => setEditorMode('view')}
                >
                  Abbrechen
                </button>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  SPEICHER-TYP
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { id: 'markdown', label: 'Lokale .md Datei (Vault)' },
                    { id: 'keep', label: 'Google Notiz / Keep' },
                    { id: 'note', label: 'Datenbank-Notiz' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tactile-btn ${editSourceType === opt.id ? 'primary' : ''}`}
                      onClick={() => setEditSourceType(opt.id as 'markdown' | 'note' | 'keep')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  TITEL
                </label>
                <input
                  className="memo-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="z.B. Smart Home Architektur / Einkaufsliste / Projekt-Memos"
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  TAGS (KOMMA-GETRENNT)
                </label>
                <input
                  className="memo-input"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="markdown,projekt,ha"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  INHALT (MARKDOWN)
                </label>
                <textarea
                  className="memo-input"
                  rows={14}
                  style={{ lineHeight: 1.55, resize: 'vertical' }}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="# Überschrift&#10;&#10;- Punkt 1&#10;- Punkt 2"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editPinned}
                    onChange={(e) => setEditPinned(e.target.checked)}
                  />
                  Oben anheften (Pinned)
                </label>

                <button type="submit" className="tactile-btn primary">
                  Speichern
                </button>
              </div>
            </form>
          ) : editorMode === 'bundle' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  KOMPILIERTES THEMEN-DOSSIER ({results.length} QUELLEN)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="tactile-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(bundleMarkdown);
                      notify('Dossier in Zwischenablage kopiert');
                    }}
                  >
                    Kopieren
                  </button>
                  <button
                    className="tactile-btn primary"
                    onClick={() => openInCortex(query || 'Themen-Analyse')}
                  >
                    An Cortex übergeben
                  </button>
                </div>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '70vh',
                  overflowY: 'auto',
                }}
              >
                {bundleMarkdown}
              </pre>
            </div>
          ) : docDetail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 4,
                    }}
                  >
                    {docDetail.sourceType.toUpperCase()} · {docDetail.ref}
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {docDetail.title}
                  </h2>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="tactile-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(docDetail.content);
                      notify('Inhalt kopiert');
                    }}
                  >
                    Kopieren
                  </button>
                  <button className="tactile-btn" onClick={openEditCurrent}>
                    Bearbeiten
                  </button>
                  <button
                    className="tactile-btn primary"
                    onClick={() => openInCortex(docDetail.title)}
                  >
                    Mit Cortex analysieren
                  </button>
                  {docDetail.id.startsWith('memo_') && (
                    <button className="tactile-btn" onClick={() => void handleDeleteCurrent()}>
                      ×
                    </button>
                  )}
                </div>
              </div>

              {docDetail.externalUrl && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--line-hairline)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Externe Quelle (Google Drive / Keep)
                  </span>
                  <a
                    href={docDetail.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}
                  >
                    Original öffnen ↗
                  </a>
                </div>
              )}

              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '68vh',
                  overflowY: 'auto',
                }}
              >
                {docDetail.content}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Wähle links ein Dokument, eine Google-Notiz, eine `.md`-Datei oder einen
              Datenbank-Eintrag zur Inspektion aus.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
