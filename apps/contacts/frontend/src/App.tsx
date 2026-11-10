import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('contacts');

type CommChannel =
  | 'SNAP'
  | 'WA'
  | 'GMAIL'
  | 'SMS'
  | 'TG'
  | 'SIGNAL'
  | 'IG'
  | 'DISCORD'
  | 'PIXEL'
  | 'HA'
  | 'CORTEX'
  | 'CAL';

interface ContactRow {
  id: string;
  name: string;
  role_or_relation: string;
  primary_channel: CommChannel;
  email: string;
  phone: string;
  whatsapp_handle: string;
  snapchat_handle: string;
  telegram_handle: string;
  birthday: string;
  notes: string;
  pinned: number;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string;
  last_message_channel: string;
  source: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  external_id: string;
  contact_id: string;
  direction: 'in' | 'out';
  channel: CommChannel;
  sender_name: string;
  subject: string;
  body: string;
  raw_meta_json: string;
  read: number;
  delivery_status: string;
  timestamp: string;
}

interface ChannelStatusInfo {
  id: string;
  code: CommChannel;
  name: string;
  status: 'ok' | 'warn' | 'error';
  statusText: string;
  detail: string;
  messagesCount: number;
}

interface AppStatePayload {
  fetchedAt: string;
  syncSummary: {
    syncedAt: string;
    pixelConnected: boolean;
    pixelActiveNotifs: number;
    pixelPhoneState: string;
    pixelDnd: string;
    pixelBattery: number | null;
    pixelSim1: string;
    pixelSim2: string;
    gmailApiStatus: 'ok' | 'scope_missing' | 'unconfigured' | 'error';
    gmailApiMessage: string;
    peopleApiStatus: 'ok' | 'scope_missing' | 'unconfigured';
    calendarContactsSynced: number;
    newMessagesIngested: number;
  };
  kpis: {
    totalContacts: number;
    totalMessages: number;
    unreadMessages: number;
    activeChannels: number;
  };
  credentials: {
    geminiConfigured: boolean;
    geminiSource: string;
    googleOAuthAuthorized: boolean;
    googleOAuthScopes: string[];
    gmailDirectSendReady: boolean;
  };
  channels: ChannelStatusInfo[];
  contacts: ContactRow[];
  messages: MessageRow[];
}

type ViewTab = 'chat' | 'directory' | 'channels';
type ChannelFilter = 'ALL' | 'UNREAD' | 'SNAP' | 'WA' | 'GMAIL' | 'CAL' | 'SYSTEM';

const OUTBOUND_CHANNELS: CommChannel[] = ['SNAP', 'WA', 'GMAIL', 'SMS', 'TG', 'SIGNAL', 'PIXEL', 'HA', 'CORTEX'];

function formatTimeShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

function formatDayHeader(iso: string): string {
  if (!iso) return 'VERLAUF';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'VERLAUF';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - msgDayStart) / 86400_000);
  if (diffDays === 0) return 'HEUTE';
  if (diffDays === 1) return 'GESTERN';
  return d.toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).toUpperCase();
}

function formatClockHMS(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeSeconds(iso: string | undefined, nowTick: number): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.max(0, Math.round((nowTick - d.getTime()) / 1000));
  if (sec < 5) return 'gerade eben';
  if (sec < 60) return `vor ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min}m`;
  return `vor ${Math.floor(min / 60)}h`;
}

export default function App() {
  const [data, setData] = useState<AppStatePayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const [activeTab, setActiveTab] = useState<ViewTab>('chat');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Composer state
  const [composeChannel, setComposeChannel] = useState<CommChannel>('WA');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeText, setComposeText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [draftingAi, setDraftingAi] = useState<boolean>(false);
  const [dispatchStatus, setDispatchStatus] = useState<{
    note: string;
    launchUri?: string | null;
  } | null>(null);

  // Contact Drawer / Modal state
  const [showContactEditor, setShowContactEditor] = useState<boolean>(false);
  const [editingNew, setEditingNew] = useState<boolean>(false);
  const [contactForm, setContactForm] = useState<{
    id: string;
    name: string;
    role_or_relation: string;
    primary_channel: CommChannel;
    email: string;
    phone: string;
    whatsapp_handle: string;
    snapchat_handle: string;
    telegram_handle: string;
    birthday: string;
    notes: string;
  }>({
    id: '',
    name: '',
    role_or_relation: '',
    primary_channel: 'WA',
    email: '',
    phone: '',
    whatsapp_handle: '',
    snapchat_handle: '',
    telegram_handle: '',
    birthday: '',
    notes: '',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadState = useCallback(async (forceSync = false) => {
    try {
      if (forceSync) setSyncing(true);
      const res = await api.get<AppStatePayload>(`/state${forceSync ? '?sync=1' : ''}`);
      setData(res);
      setError(null);
      setSelectedContactId((prev) => {
        if (prev && res.contacts.some((c) => c.id === prev)) return prev;
        // Prefer first contact with messages or first contact
        const withMsgs = res.contacts.find((c) => c.last_message_at !== '');
        return withMsgs?.id || res.contacts[0]?.id || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadState(false);
    const pollTimer = setInterval(() => void loadState(false), 12_000);
    const tickTimer = setInterval(() => setNowTick(Date.now()), 2000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }, [loadState]);

  const selectedContact = useMemo(() => {
    if (!data) return null;
    return data.contacts.find((c) => c.id === selectedContactId) || null;
  }, [data, selectedContactId]);

  // Synchronize default outbound channel when contact changes
  useEffect(() => {
    if (!selectedContact) return;
    const preferred =
      (selectedContact.last_message_channel as CommChannel) ||
      selectedContact.primary_channel ||
      'WA';
    setComposeChannel(preferred === 'CAL' ? selectedContact.primary_channel || 'WA' : preferred);
    setDispatchStatus(null);

    if (selectedContact.unread_count > 0) {
      void api.post('/mark-read', { contactId: selectedContact.id }).then(() => {
        void loadState(false);
      });
    }
  }, [selectedContact?.id]);

  const filteredContacts = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.contacts.filter((c) => {
      if (channelFilter === 'UNREAD' && c.unread_count <= 0) return false;
      if (channelFilter === 'SNAP' && c.primary_channel !== 'SNAP' && c.last_message_channel !== 'SNAP')
        return false;
      if (channelFilter === 'WA' && c.primary_channel !== 'WA' && c.last_message_channel !== 'WA')
        return false;
      if (channelFilter === 'GMAIL' && c.primary_channel !== 'GMAIL' && c.last_message_channel !== 'GMAIL' && !c.email)
        return false;
      if (channelFilter === 'CAL' && c.source !== 'google_calendar' && !c.birthday) return false;
      if (channelFilter === 'SYSTEM' && c.primary_channel !== 'HA' && c.primary_channel !== 'CORTEX')
        return false;

      if (q) {
        const hay = `${c.name} ${c.role_or_relation} ${c.email} ${c.phone} ${c.last_message_preview}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, channelFilter, searchQuery]);

  const activeThreadMessages = useMemo(() => {
    if (!data || !selectedContactId) return [];
    return data.messages.filter((m) => m.contact_id === selectedContactId);
  }, [data, selectedContactId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThreadMessages.length, selectedContactId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedContact || !composeText.trim() || sending) return;

    const textToSend = composeText.trim();
    setSending(true);
    setComposeText('');
    setDispatchStatus(null);

    try {
      const res = await api.post<{
        ok: boolean;
        deliveryStatus: string;
        dispatchNote: string;
        launchUri?: string | null;
      }>('/send', {
        contactId: selectedContact.id,
        channel: composeChannel,
        subject: composeSubject.trim(),
        text: textToSend,
        pushToPixel: true,
      });
      setComposeSubject('');
      if (res.dispatchNote) {
        setDispatchStatus({
          note: res.dispatchNote,
          launchUri: res.launchUri,
        });
      }
      await loadState(false);
      inputRef.current?.focus();
    } catch (err) {
      setComposeText(textToSend);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleAiDraft = async () => {
    if (!selectedContact || draftingAi) return;
    setDraftingAi(true);
    try {
      const res = await api.post<{ ok: boolean; draft: string }>('/ai-draft', {
        contactId: selectedContact.id,
      });
      if (res.draft) {
        setComposeText(res.draft);
        inputRef.current?.focus();
      }
    } catch {} finally {
      setDraftingAi(false);
    }
  };

  const openEditContact = (c?: ContactRow) => {
    if (c) {
      setEditingNew(false);
      setContactForm({
        id: c.id,
        name: c.name,
        role_or_relation: c.role_or_relation || '',
        primary_channel: c.primary_channel || 'WA',
        email: c.email || '',
        phone: c.phone || '',
        whatsapp_handle: c.whatsapp_handle || '',
        snapchat_handle: c.snapchat_handle || '',
        telegram_handle: c.telegram_handle || '',
        birthday: c.birthday || '',
        notes: c.notes || '',
      });
    } else {
      setEditingNew(true);
      setContactForm({
        id: '',
        name: '',
        role_or_relation: '',
        primary_channel: 'WA',
        email: '',
        phone: '',
        whatsapp_handle: '',
        snapchat_handle: '',
        telegram_handle: '',
        birthday: '',
        notes: '',
      });
    }
    setShowContactEditor(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim()) return;
    try {
      const res = await api.post<{ ok: boolean; contact: ContactRow }>('/contacts', contactForm);
      setShowContactEditor(false);
      await loadState(false);
      if (res.contact?.id) {
        setSelectedContactId(res.contact.id);
        setActiveTab('chat');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await api.delete(`/contacts?id=${encodeURIComponent(id)}`);
      setShowContactEditor(false);
      await loadState(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAuthorizeGoogleFullScopes = async () => {
    try {
      const res = await api.get<{ ok: boolean; url?: string; error?: string }>('/google-oauth-url');
      if (res.ok && res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch {}
  };

  const openVault = () => {
    const topWin = (window.top || window) as any;
    if (typeof topWin.__thassiOpenSidebarApp === 'function') {
      topWin.__thassiOpenSidebarApp('cortex', 'Cortex');
    } else {
      window.location.href = '/apps/cortex/?tab=vault';
    }
  };

  if (loading && !data) {
    return (
      <div
        style={{
          height: '100dvh',
          background: '#09090b',
          color: '#a1a1aa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '12.5px',
        }}
      >
        SYNCHRONISIERE KOMMUNIKATIONS-KANÄLE...
      </div>
    );
  }

  const sync = data?.syncSummary;
  const kpis = data?.kpis;
  const creds = data?.credentials;
  const pixelNominal = Boolean(sync?.pixelConnected);
  const gmailScopeReady = Boolean(creds?.gmailDirectSendReady);

  return (
    <div
      style={{
        height: '100dvh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <style>{`
        :root {
          --bg-canvas: #09090b;
          --bg-elevated: #111113;
          --bg-input: #141417;
          --line-hairline: rgba(255, 255, 255, 0.06);
          --line-focus: rgba(255, 255, 255, 0.22);
          --text-primary: #fafafa;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
          --dot-ok: #10b981;
          --dot-warn: #f59e0b;
          --dot-err: #ef4444;
        }
        * { box-sizing: border-box; }
        .mono {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
        }
        .tab-link {
          background: transparent;
          border: none;
          border-bottom: 1px solid transparent;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 16px 2px 15px;
          cursor: pointer;
          transition: color 120ms ease, border-color 120ms ease;
        }
        .tab-link:hover {
          color: var(--text-secondary);
        }
        .tab-link.active {
          color: var(--text-primary);
          border-bottom: 1px solid #fafafa;
        }
        .filter-link {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.06em;
          padding: 4px 0;
          cursor: pointer;
          border-bottom: 1px solid transparent;
        }
        .filter-link:hover {
          color: var(--text-secondary);
        }
        .filter-link.active {
          color: var(--text-primary);
          border-bottom: 1px solid #fafafa;
        }
        .btn-primary {
          background: #fafafa;
          color: #09090b;
          font-family: var(--font-sans);
          font-size: 12.5px;
          font-weight: 500;
          padding: 6px 14px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
        }
        .btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btn-ghost {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--line-hairline);
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-ghost:hover:not(:disabled) {
          color: var(--text-primary);
          border-color: var(--line-focus);
        }
        .input-minimal {
          background: var(--bg-input);
          border: 1px solid var(--line-hairline);
          border-radius: 4px;
          padding: 7px 10px;
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 13px;
          outline: none;
        }
        .input-minimal:focus {
          border-color: var(--line-focus);
        }
        .contact-row {
          padding: 12px 16px;
          border-bottom: 1px solid var(--line-hairline);
          border-left: 2px solid transparent;
          cursor: pointer;
          transition: background 100ms ease;
        }
        .contact-row:hover {
          background: #111113;
        }
        .contact-row.selected {
          background: #111113;
          border-left-color: #fafafa;
        }
        ::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
        }
      `}</style>

      {/* =====================================================================
          1. TOP HEADER + DATA FRESHNESS & SEMANTIC ACTION STRIP (DESIGN.md)
      ===================================================================== */}
      <header
        style={{
          height: '50px',
          minHeight: '50px',
          padding: '0 24px',
          borderBottom: '1px solid var(--line-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
              }}
            >
              Contacts
            </h1>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {kpis?.totalContacts ?? 0} KONTAKTE · {kpis?.totalMessages ?? 0} MSGS
              {(kpis?.unreadMessages ?? 0) > 0 ? ` · ${kpis?.unreadMessages} NEU` : ''}
            </span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <button
              className={`tab-link ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              CHAT
            </button>
            <button
              className={`tab-link ${activeTab === 'directory' ? 'active' : ''}`}
              onClick={() => setActiveTab('directory')}
            >
              KONTAKTE ({kpis?.totalContacts ?? 0})
            </button>
            <button
              className={`tab-link ${activeTab === 'channels' ? 'active' : ''}`}
              onClick={() => setActiveTab('channels')}
            >
              KANÄLE & SETUP
            </button>
          </nav>
        </div>

        {/* Right: Explicit Data Freshness & User Action Required Strip */}
        <div
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          {/* Pixel 10 Bridge Dot */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: pixelNominal ? 'var(--dot-ok)' : 'var(--dot-warn)',
              }}
            />
            <span>
              PIXEL 10 {pixelNominal ? `LIVE (${sync?.pixelBattery ?? '—'}%)` : 'STANDBY'}
            </span>
          </span>

          <span style={{ color: 'var(--text-muted)' }}>·</span>

          {/* Gmail / Google OAuth Dot */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: gmailScopeReady ? 'var(--dot-ok)' : 'var(--dot-warn)',
              }}
            />
            <span>{gmailScopeReady ? 'GMAIL API OK' : 'GMAIL PUSH (SCOPE OPTIONAL)'}</span>
          </span>

          {!gmailScopeReady && (
            <button
              className="btn-ghost"
              onClick={() => setActiveTab('channels')}
              style={{ padding: '2px 7px', fontSize: '10px', color: '#fafafa' }}
            >
              Scope / Setup
            </button>
          )}

          <span style={{ color: 'var(--text-muted)' }}>·</span>

          <span style={{ color: 'var(--text-muted)' }}>
            Stand: <span style={{ color: 'var(--text-secondary)' }}>{formatClockHMS(data?.fetchedAt)}</span> (
            {formatRelativeSeconds(data?.fetchedAt, nowTick)})
          </span>

          <button
            className="btn-ghost"
            onClick={() => void loadState(true)}
            disabled={syncing}
            style={{ padding: '3px 8px', fontSize: '10.5px' }}
          >
            {syncing ? 'SYNC...' : 'SYNC'}
          </button>
        </div>
      </header>

      {/* =====================================================================
          2A. MAIN VIEW: ULTRA HYPER SIMPLISTIC CHAT INTERFACE
      ===================================================================== */}
      {activeTab === 'chat' && (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: showContactEditor ? '300px 1fr 310px' : '300px 1fr',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* LEFT COLUMN: CONTACT THREAD LIST */}
          <aside
            style={{
              borderRight: '1px solid var(--line-hairline)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--bg-canvas)',
            }}
          >
            {/* Search + New Contact Row */}
            <div
              style={{
                height: '44px',
                padding: '0 12px',
                borderBottom: '1px solid var(--line-hairline)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="/ Kontakt oder Text..."
                className="mono"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mono"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  ×
                </button>
              )}
              <button
                className="btn-ghost"
                onClick={() => openEditContact(undefined)}
                style={{ padding: '3px 8px', fontSize: '10.5px' }}
                title="Neuen Kontakt anlegen"
              >
                + NEU
              </button>
            </div>

            {/* Channel Filter Strip */}
            <div
              style={{
                height: '32px',
                padding: '0 14px',
                borderBottom: '1px solid var(--line-hairline)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                overflowX: 'auto',
              }}
            >
              {(['ALL', 'UNREAD', 'SNAP', 'WA', 'GMAIL', 'CAL', 'SYSTEM'] as ChannelFilter[]).map(
                (f) => (
                  <button
                    key={f}
                    className={`filter-link ${channelFilter === f ? 'active' : ''}`}
                    onClick={() => setChannelFilter(f)}
                  >
                    {f === 'ALL' ? 'ALLE' : f === 'UNREAD' ? 'NEU' : f}
                  </button>
                )
              )}
            </div>

            {/* Scrollable Contact Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredContacts.length === 0 ? (
                <div
                  className="mono"
                  style={{
                    padding: '32px 16px',
                    fontSize: '11.5px',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  KEINE KONTAKTE GEFUNDEN
                </div>
              ) : (
                filteredContacts.map((c) => {
                  const isSelected = c.id === selectedContactId;
                  const hasUnread = c.unread_count > 0;
                  const channelBadge = c.last_message_channel || c.primary_channel || 'CHAT';
                  return (
                    <div
                      key={c.id}
                      className={`contact-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedContactId(c.id)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: hasUnread
                                ? 'var(--dot-ok)'
                                : isSelected
                                  ? '#fafafa'
                                  : 'rgba(255,255,255,0.16)',
                            }}
                          />
                          <span
                            style={{
                              fontSize: '13.5px',
                              fontWeight: hasUnread || isSelected ? 600 : 500,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {c.name}
                          </span>
                        </div>

                        <div
                          className="mono"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexShrink: 0,
                            fontSize: '10.5px',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>{channelBadge}</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {formatTimeShort(c.last_message_at)}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: '4px',
                          paddingLeft: '14px',
                          fontSize: '12px',
                          color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.last_message_preview || c.role_or_relation || 'Bereit für Nachrichten'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* CENTER COLUMN: ULTRA-CLEAN TYPOGRAPHIC CHAT STREAM */}
          <main
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--bg-canvas)',
            }}
          >
            {selectedContact ? (
              <>
                {/* Active Contact Header Strip */}
                <div
                  style={{
                    height: '44px',
                    minHeight: '44px',
                    padding: '0 24px',
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedContact.name}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {selectedContact.role_or_relation || selectedContact.email || selectedContact.phone}
                    </span>
                    {selectedContact.birthday && (
                      <span
                        className="mono"
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--line-hairline)',
                          padding: '1px 6px',
                          borderRadius: '3px',
                        }}
                      >
                        GEB. {selectedContact.birthday}
                      </span>
                    )}
                  </div>

                  {/* Outbound Channel Switcher + Profile Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <div
                      className="mono"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '10.5px',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>KANAL:</span>
                      {(['SNAP', 'WA', 'GMAIL', 'SMS', 'TG', 'PIXEL', 'HA', 'CORTEX'] as CommChannel[]).map(
                        (ch) => (
                          <button
                            key={ch}
                            onClick={() => setComposeChannel(ch)}
                            style={{
                              background: composeChannel === ch ? '#fafafa' : 'transparent',
                              color: composeChannel === ch ? '#09090b' : 'var(--text-secondary)',
                              border: '1px solid',
                              borderColor:
                                composeChannel === ch ? '#fafafa' : 'var(--line-hairline)',
                              borderRadius: '3px',
                              padding: '2px 6px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              fontWeight: composeChannel === ch ? 600 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            {ch}
                          </button>
                        )
                      )}
                    </div>

                    <button
                      className="btn-ghost"
                      onClick={() => {
                        if (showContactEditor && !editingNew) {
                          setShowContactEditor(false);
                        } else {
                          openEditContact(selectedContact);
                        }
                      }}
                      style={{ padding: '3px 8px', fontSize: '10.5px' }}
                    >
                      {showContactEditor && !editingNew ? 'SCHLIESSEN' : 'DETAILS'}
                    </button>
                  </div>
                </div>

                {/* Chronological Typographic Message Log */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {activeThreadMessages.length === 0 ? (
                    <div
                      style={{
                        margin: 'auto 0',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <div className="mono" style={{ fontSize: '11.5px', letterSpacing: '0.06em' }}>
                        KEINE NACHRICHTEN MIT {selectedContact.name.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12.5px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                        Schreibe unten eine Nachricht — sie wird über [{composeChannel}] bzw. die Pixel 10 Bridge zugestellt.
                      </div>
                    </div>
                  ) : (
                    activeThreadMessages.map((msg, idx) => {
                      const prev = idx > 0 ? activeThreadMessages[idx - 1] : null;
                      const dayLabel = formatDayHeader(msg.timestamp);
                      const prevDayLabel = prev ? formatDayHeader(prev.timestamp) : '';
                      const showDayHeader = dayLabel !== prevDayLabel;
                      const isOut = msg.direction === 'out';
                      const timeStr = new Date(msg.timestamp).toLocaleTimeString('de-AT', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <React.Fragment key={msg.id}>
                          {showDayHeader && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                margin: idx === 0 ? '0 0 12px 0' : '20px 0 12px 0',
                              }}
                            >
                              <span
                                className="mono"
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  letterSpacing: '0.08em',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {dayLabel}
                              </span>
                              <div
                                style={{
                                  flex: 1,
                                  height: '1px',
                                  background: 'var(--line-hairline)',
                                }}
                              />
                            </div>
                          )}

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '48px 58px 1fr auto',
                              alignItems: 'baseline',
                              gap: '12px',
                              padding: '10px 0',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.035)',
                            }}
                          >
                            {/* 1. Timestamp */}
                            <span
                              className="mono"
                              style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                            >
                              {timeStr}
                            </span>

                            {/* 2. Channel Code */}
                            <span
                              className="mono"
                              style={{
                                fontSize: '10.5px',
                                color: isOut ? 'var(--text-muted)' : 'var(--text-secondary)',
                              }}
                            >
                              [{msg.channel}]
                            </span>

                            {/* 3. Sender + Subject + Message Text */}
                            <div
                              style={{
                                minWidth: 0,
                                paddingLeft: isOut ? '10px' : '0',
                                borderLeft: isOut ? '1.5px solid #fafafa' : 'none',
                              }}
                            >
                              <div
                                className="mono"
                                style={{
                                  fontSize: '11px',
                                  color: isOut ? '#fafafa' : 'var(--text-secondary)',
                                  marginBottom: '2px',
                                }}
                              >
                                {isOut ? `THOMAS → ${selectedContact.name.toUpperCase()}` : msg.sender_name}
                              </div>

                              {msg.subject && (
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    marginBottom: '3px',
                                  }}
                                >
                                  {msg.subject}
                                </div>
                              )}

                              <div
                                style={{
                                  fontSize: '13.5px',
                                  lineHeight: 1.55,
                                  color: isOut ? '#e4e4e7' : 'var(--text-primary)',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {msg.body}
                              </div>
                            </div>

                            {/* 4. Delivery / Source Meta */}
                            <span
                              className="mono"
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isOut
                                ? msg.delivery_status === 'pushed_to_pixel_10'
                                  ? 'PIXEL 10'
                                  : msg.delivery_status === 'delivered_gmail_api'
                                    ? 'GMAIL SENT'
                                    : 'GESENDET'
                                : 'LIVE'}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Dispatch Feedback Strip (if any) */}
                {dispatchStatus && (
                  <div
                    className="mono"
                    style={{
                      padding: '6px 24px',
                      borderTop: '1px solid var(--line-hairline)',
                      background: '#111113',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--dot-ok)',
                        }}
                      />
                      <span>{dispatchStatus.note}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {dispatchStatus.launchUri && (
                        <a
                          href={dispatchStatus.launchUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#fafafa', textDecoration: 'underline' }}
                        >
                          DIREKT IM CLIENT ÖFFNEN →
                        </a>
                      )}
                      <button
                        onClick={() => setDispatchStatus(null)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Hyper-Minimalistic Composer Bar */}
                <form
                  onSubmit={handleSendMessage}
                  style={{
                    padding: '12px 24px',
                    borderTop: '1px solid var(--line-hairline)',
                    background: 'var(--bg-canvas)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {composeChannel === 'GMAIL' && (
                    <input
                      type="text"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder={`Betreff an ${selectedContact.email || selectedContact.name}...`}
                      className="input-minimal mono"
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                    />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        const idx = OUTBOUND_CHANNELS.indexOf(composeChannel);
                        const next = OUTBOUND_CHANNELS[(idx + 1) % OUTBOUND_CHANNELS.length];
                        setComposeChannel(next);
                      }}
                      title="Klicken zum Kanalwechsel"
                      style={{ height: '34px', padding: '0 10px', flexShrink: 0 }}
                    >
                      [{composeChannel} →]
                    </button>

                    <input
                      ref={inputRef}
                      type="text"
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      placeholder={`Nachricht an ${selectedContact.name} schreiben...`}
                      className="input-minimal"
                      style={{ flex: 1, height: '34px' }}
                    />

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handleAiDraft}
                      disabled={draftingAi}
                      style={{ height: '34px', flexShrink: 0 }}
                      title="Kurzen Antwortentwurf generieren"
                    >
                      {draftingAi ? '...' : 'KI-ENTWURF'}
                    </button>

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={sending || !composeText.trim()}
                      style={{ height: '34px', flexShrink: 0 }}
                    >
                      {sending ? 'SENDET...' : 'Senden'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div
                className="mono"
                style={{
                  margin: 'auto',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                KONTAKT LINKS AUSWÄHLEN
              </div>
            )}
          </main>

          {/* RIGHT INSPECTOR PANEL: CONTACT DETAILS / NEW CONTACT EDITOR */}
          {showContactEditor && (
            <aside
              style={{
                borderLeft: '1px solid var(--line-hairline)',
                background: 'var(--bg-canvas)',
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                  }}
                >
                  {editingNew ? 'NEUER KONTAKT' : 'KONTAKT-PROFIL'}
                </span>
                <button
                  className="btn-ghost"
                  onClick={() => setShowContactEditor(false)}
                  style={{ padding: '2px 7px' }}
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={handleSaveContact}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    NAME
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="input-minimal"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    ROLLE / BEZIEHUNG
                  </label>
                  <input
                    type="text"
                    value={contactForm.role_or_relation}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, role_or_relation: e.target.value })
                    }
                    placeholder="z. B. Familie, Arbeit, Snapchat"
                    className="input-minimal"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    STANDARD-KANAL
                  </label>
                  <select
                    value={contactForm.primary_channel}
                    onChange={(e) =>
                      setContactForm({
                        ...contactForm,
                        primary_channel: e.target.value as CommChannel,
                      })
                    }
                    className="input-minimal mono"
                    style={{ width: '100%' }}
                  >
                    {OUTBOUND_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    E-MAIL (GMAIL)
                  </label>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="name@gmail.com"
                    className="input-minimal mono"
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    TELEFON / WHATSAPP / SMS
                  </label>
                  <input
                    type="text"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="+43 664 ..."
                    className="input-minimal mono"
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    SNAPCHAT / TELEGRAM HANDLE
                  </label>
                  <input
                    type="text"
                    value={contactForm.snapchat_handle}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, snapchat_handle: e.target.value })
                    }
                    placeholder="@handle"
                    className="input-minimal mono"
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label
                    className="mono"
                    style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}
                  >
                    GEBURTSTAG
                  </label>
                  <input
                    type="text"
                    value={contactForm.birthday}
                    onChange={(e) => setContactForm({ ...contactForm, birthday: e.target.value })}
                    placeholder="TT.MM."
                    className="input-minimal mono"
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    Speichern
                  </button>
                  {!editingNew && contactForm.id && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleDeleteContact(contactForm.id)}
                      style={{ color: 'var(--dot-err)' }}
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </form>
            </aside>
          )}
        </div>
      )}

      {/* =====================================================================
          2B. DIRECTORY VIEW: HAIRLINE CONTACT MATRIX
      ===================================================================== */}
      {activeTab === 'directory' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px', maxWidth: '1440px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--line-hairline)',
              marginBottom: '16px',
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                KONTAKT-VERZEICHNIS
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Automatisch aggregiert aus Pixel 10 Notifications, Google Kalender, Geburtstagen und Gmail.
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                openEditContact(undefined);
                setActiveTab('chat');
              }}
            >
              + Kontakt anlegen
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                className="mono"
                style={{
                  borderBottom: '1px solid var(--line-hairline)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '10px 8px' }}>NAME</th>
                <th style={{ padding: '10px 8px' }}>KANAL</th>
                <th style={{ padding: '10px 8px' }}>BEZIEHUNG / QUELLE</th>
                <th style={{ padding: '10px 8px' }}>E-MAIL / TELEFON</th>
                <th style={{ padding: '10px 8px' }}>GEBURTSTAG</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>AKTION</th>
              </tr>
            </thead>
            <tbody>
              {(data?.contacts || []).map((c) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '1px solid var(--line-hairline)',
                    height: '44px',
                    fontSize: '13px',
                  }}
                >
                  <td style={{ padding: '10px 8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {c.name}
                  </td>
                  <td className="mono" style={{ padding: '10px 8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    [{c.primary_channel}]
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                    {c.role_or_relation || c.source}
                  </td>
                  <td className="mono" style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {c.email || c.phone || c.snapchat_handle || '—'}
                  </td>
                  <td className="mono" style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {c.birthday || '—'}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setSelectedContactId(c.id);
                        setActiveTab('chat');
                      }}
                    >
                      Chat öffnen →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
          2C. CHANNELS & SETUP VIEW: 4-COLUMN KPI STRIP + BRIDGE TELEMETRY
      ===================================================================== */}
      {activeTab === 'channels' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px', maxWidth: '1440px' }}>
          {/* 4-Column KPI Strip (DESIGN.md) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              borderBottom: '1px solid var(--line-hairline)',
              paddingBottom: '24px',
              marginBottom: '32px',
              gap: '24px',
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                KONTAKTE GESAMT
              </div>
              <div className="mono" style={{ fontSize: '28px', marginTop: '6px', color: 'var(--text-primary)' }}>
                {kpis?.totalContacts ?? 0}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                NACHRICHTEN IM STREAM
              </div>
              <div className="mono" style={{ fontSize: '28px', marginTop: '6px', color: 'var(--text-primary)' }}>
                {kpis?.totalMessages ?? 0}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                PIXEL 10 PUSH-BRIDGE
              </div>
              <div className="mono" style={{ fontSize: '28px', marginTop: '6px', color: 'var(--text-primary)' }}>
                {sync?.pixelActiveNotifs ?? 0} AKTIV
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                AKTIVE KANÄLE
              </div>
              <div className="mono" style={{ fontSize: '28px', marginTop: '6px', color: 'var(--text-primary)' }}>
                {kpis?.activeChannels ?? 0} / 4
              </div>
            </div>
          </div>

          {/* Channel Hairline List */}
          <div
            className="mono"
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              marginBottom: '12px',
            }}
          >
            ANGESCHLOSSENE KOMMUNIKATIONS-BRÜCKEN
          </div>

          <div style={{ borderTop: '1px solid var(--line-hairline)' }}>
            {(data?.channels || []).map((ch) => (
              <div
                key={ch.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 280px 1fr 120px',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 0',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        ch.status === 'ok'
                          ? 'var(--dot-ok)'
                          : ch.status === 'warn'
                            ? 'var(--dot-warn)'
                            : 'var(--dot-err)',
                    }}
                  />
                  <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {ch.code}
                  </span>
                </div>

                <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {ch.name}
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                    {ch.statusText}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {ch.detail}
                  </div>
                </div>

                <div
                  className="mono"
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}
                >
                  {ch.messagesCount} Msgs
                </div>
              </div>
            ))}
          </div>

          {/* Credentials & OAuth Actions */}
          <div
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid var(--line-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                ZENTRALE ZUGANGSDATEN (/DATA/SHARED.DB)
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Gemini API ({creds?.geminiSource}) · Google OAuth2 Scopes ({creds?.googleOAuthScopes?.length ?? 0} aktiv)
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-ghost" onClick={handleAuthorizeGoogleFullScopes}>
                Google OAuth2 (Gmail & Contacts Scope) autorisieren
              </button>
              <button className="btn-primary" onClick={openVault}>
                Cortex Credentials Vault öffnen
              </button>
            </div>
          </div>

          {error && (
            <div
              className="mono"
              style={{
                marginTop: '16px',
                fontSize: '12px',
                color: 'var(--dot-err)',
              }}
            >
              FEHLER: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
