import React, { useEffect, useMemo, useState } from 'react';
import { createAppClient, type GoogleOAuthStatus } from '@thassi/sdk/client';

const api = createAppClient('google-calendar');

interface CalendarEventRow {
  id: number;
  external_id: string;
  calendar_name: string;
  title: string;
  category: 'work' | 'focus' | 'health' | 'social' | 'meals' | 'personal';
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location: string;
  description: string;
  source: string;
}

interface CalendarFeedRow {
  id: number;
  name: string;
  ics_url: string;
  default_category: string;
  last_synced_at: string | null;
}

interface CalendarSettingItem {
  calendar_name: string;
  external_cal_id: string;
  color: string;
  source: string;
  show_in_horizon: boolean;
  event_count: number;
}

interface CategoryStat {
  category: string;
  event_count: number;
  total_minutes: number;
  total_hours: number;
}

interface MealPlannerToday {
  date: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  totalCalories: number;
  totalProtein: number;
}

interface ExtendedOAuthStatus extends GoogleOAuthStatus {
  accountEmail?: string | null;
  hasCredentials?: boolean;
}

type TabKey = 'agenda' | 'create' | 'horizon' | 'connect';

const CATEGORY_LABELS: Record<string, string> = {
  work: 'WORK',
  focus: 'FOCUS',
  health: 'HEALTH',
  meals: 'MEALS',
  social: 'SOCIAL',
  personal: 'PERSONAL',
};

function formatSyncTimestamp(isoOrNull: string | null): string {
  if (!isoOrNull) return 'Noch nicht synchronisiert';
  const d = new Date(isoOrNull);
  if (Number.isNaN(d.getTime())) return isoOrNull;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEventDate(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatEventTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('agenda');
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [calendars, setCalendars] = useState<CalendarSettingItem[]>([]);
  const [feeds, setFeeds] = useState<CalendarFeedRow[]>([]);
  const [byCategory, setByCategory] = useState<CategoryStat[]>([]);
  const [googleOAuth, setGoogleOAuth] = useState<ExtendedOAuthStatus | null>(null);
  const [mealPlannerToday, setMealPlannerToday] = useState<MealPlannerToday | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' | 'danger' } | null>(
    null
  );

  // Add Event form state
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState('60');
  const [category, setCategory] = useState<CalendarEventRow['category']>('work');
  const [location, setLocation] = useState('');
  const [selectedCalForNew, setSelectedCalForNew] = useState('');

  // Add Google Calendar iCal Feed form state
  const [feedName, setFeedName] = useState('Mein Google Kalender');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedCat, setFeedCat] = useState('personal');

  // Google OAuth2 configuration form state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    () => `${window.location.origin}/api/system/google/callback`
  );
  const [authCode, setAuthCode] = useState('');

  const notify = (text: string, tone: 'ok' | 'warn' | 'danger' = 'ok') => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 5000);
  };

  const loadDashboard = async () => {
    const data = await api.get<{
      events: CalendarEventRow[];
      calendars: CalendarSettingItem[];
      feeds: CalendarFeedRow[];
      byCategory: CategoryStat[];
      googleOAuth: ExtendedOAuthStatus;
      mealPlannerToday: MealPlannerToday | null;
    }>('/dashboard');
    setEvents(data.events || []);
    setCalendars(data.calendars || []);
    setFeeds(data.feeds || []);
    setByCategory(data.byCategory || []);
    setGoogleOAuth(data.googleOAuth);
    setMealPlannerToday(data.mealPlannerToday);
    setLastFetchedAt(new Date().toISOString());
    if (data.googleOAuth?.redirectUri) {
      setRedirectUri(data.googleOAuth.redirectUri);
    }
    if (!selectedCalForNew && data.calendars && data.calendars.length > 0) {
      setSelectedCalForNew(data.calendars[0].calendar_name);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await api.post<{
        oauthSynced: number;
        haCalendarSynced: number;
        icsSynced: number;
        nextEvent: string;
        todayEventCount: number;
        busyHoursToday: number;
      }>('/sync');
      notify(
        `Sync abgeschlossen (OAuth: ${res.oauthSynced}, HA: ${res.haCalendarSynced}, ICS: ${res.icsSynced}) · Nächster Termin: "${res.nextEvent}" · Heute: ${res.todayEventCount} Termine (${res.busyHoursToday}h).`,
        'ok'
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleHorizonCalendar = async (calName: string, nextVisible: boolean) => {
    try {
      const res = await api.post<{
        calendars: CalendarSettingItem[];
        events: CalendarEventRow[];
      }>('/calendars/visibility', {
        calendar_name: calName,
        show_in_horizon: nextVisible,
      });
      setCalendars(res.calendars || []);
      setEvents(res.events || []);
      notify(
        `Kalender "${calName}" in Horizon ${nextVisible ? 'aktiviert' : 'ausgeblendet'}.`,
        'ok'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleSetAllHorizonCalendars = async (visible: boolean) => {
    try {
      const map: Record<string, boolean> = {};
      for (const c of calendars) {
        map[c.calendar_name] = visible;
      }
      const res = await api.post<{
        calendars: CalendarSettingItem[];
        events: CalendarEventRow[];
      }>('/calendars/visibility', { calendars: map });
      setCalendars(res.calendars || []);
      setEvents(res.events || []);
      notify(
        visible
          ? 'Alle Kalender im Horizon-Dashboard aktiviert.'
          : 'Alle Kalender im Horizon-Dashboard ausgeblendet.',
        'ok'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.post('/events', {
        title,
        start_time: new Date(startTime).toISOString(),
        duration_minutes: Number(duration || 60),
        category,
        location,
        calendar_name: selectedCalForNew || undefined,
      });
      setTitle('');
      setLocation('');
      notify('Termin erstellt und mit Google Calendar + Home Assistant synchronisiert.', 'ok');
      await loadDashboard();
      setActiveTab('agenda');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleDeleteEvent = async (id: number) => {
    try {
      await api.delete(`/events?id=${id}`);
      notify('Termin gelöscht.', 'ok');
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedName.trim() || !feedUrl.trim()) return;
    try {
      const res = await api.post<{ syncRes: { icsSynced: number } }>('/feeds', {
        name: feedName,
        ics_url: feedUrl,
        default_category: feedCat,
      });
      setFeedUrl('');
      notify(
        `iCal-Feed "${feedName}" verbunden (${res.syncRes.icsSynced} Termine importiert).`,
        'ok'
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleDeleteFeed = async (id: number) => {
    try {
      await api.delete(`/feeds?id=${id}`);
      notify('iCal-Feed entfernt.', 'ok');
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleImportHaOAuth = async () => {
    try {
      const res = await api.post<{
        authorized: boolean;
        accountEmail?: string;
        details?: string;
        syncRes?: { oauthSynced: number; haCalendarSynced: number };
      }>('/oauth/config', { importFromHa: true });
      notify(
        res.authorized
          ? `Google OAuth2 aus Home Assistant verbunden (${res.accountEmail || 'Google Calendar'}) · ${res.syncRes?.oauthSynced || 0} Termine synchronisiert.`
          : 'Kein Google OAuth Token in Home Assistant gefunden. Bitte Client ID & Secret unten hinterlegen.',
        res.authorized ? 'ok' : 'warn'
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleSaveOAuthCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/oauth/config', {
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        redirectUri: redirectUri.trim() || undefined,
      });
      notify('Google OAuth2 Client-Zugangsdaten gespeichert.', 'ok');
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleStartOAuthFlow = async () => {
    try {
      const res = await api.get<{ url: string }>('/oauth/auth-url');
      if (res.url) {
        window.open(res.url, '_blank', 'width=580,height=700');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handleExchangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authCode.trim()) return;
    try {
      const res = await api.post<{ syncRes?: { oauthSynced: number } }>('/oauth/exchange', {
        code: authCode.trim(),
      });
      setAuthCode('');
      notify(
        `Google OAuth2 autorisiert · ${res.syncRes?.oauthSynced || 0} Termine über Google Calendar v3 API geladen.`,
        'ok'
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  // Compute data recency & KPIs
  const latestSyncIso = useMemo(() => {
    const feedTimestamps = feeds
      .map((f) => f.last_synced_at)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime())
      .filter((ms) => !Number.isNaN(ms));

    if (feedTimestamps.length > 0) {
      const maxFeedMs = Math.max(...feedTimestamps);
      if (lastFetchedAt) {
        const fetchedMs = new Date(lastFetchedAt).getTime();
        return new Date(Math.max(maxFeedMs, fetchedMs)).toISOString();
      }
      return new Date(maxFeedMs).toISOString();
    }
    return lastFetchedAt;
  }, [feeds, lastFetchedAt]);

  const hasOAuthCredentials = Boolean(
    googleOAuth?.hasCredentials ?? googleOAuth?.configured ?? googleOAuth?.clientId
  );
  const isOAuthConnected = Boolean(googleOAuth?.authorized);
  const requiresUserAction = (!isOAuthConnected && feeds.length === 0) || !hasOAuthCredentials;

  const { todayEvents, upcoming7dEvents, busyHoursToday } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    const endOf7Days = startOfToday + 7 * 24 * 60 * 60 * 1000;

    const todayList: CalendarEventRow[] = [];
    const upcomingList: CalendarEventRow[] = [];
    let minutesToday = 0;

    for (const ev of events) {
      const st = new Date(ev.start_time).getTime();
      if (Number.isNaN(st)) continue;
      if (st >= startOfToday && st < endOfToday) {
        todayList.push(ev);
        minutesToday += ev.duration_minutes || 0;
      }
      if (st >= now.getTime() && st <= endOf7Days) {
        upcomingList.push(ev);
      }
    }

    return {
      todayEvents: todayList,
      upcoming7dEvents: upcomingList,
      busyHoursToday: Math.round((minutesToday / 60) * 10) / 10,
    };
  }, [events]);

  const totalHoursAll = useMemo(
    () => byCategory.reduce((s, c) => s + (c.total_hours || 0), 0),
    [byCategory]
  );
  const visibleCalendarsCount = useMemo(
    () => calendars.filter((c) => c.show_in_horizon).length,
    [calendars]
  );

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.calendar_name.toLowerCase().includes(q) ||
        ev.category.toLowerCase().includes(q) ||
        (ev.location && ev.location.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  const nextUpcomingEvent = upcoming7dEvents[0] || events[0] || null;

  return (
    <div
      style={{
        maxWidth: 1440,
        margin: 0,
        padding: '32px 48px',
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 16,
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              GCAL
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
              }}
            >
              Google Calendar & Horizon
            </h1>
          </div>

          {/* Explicit Data Recency & Active Sources Strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 6,
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isOAuthConnected ? 'var(--status-ok)' : 'var(--status-warn)',
                  display: 'inline-block',
                }}
              />
              <span>
                Google OAuth:{' '}
                <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {isOAuthConnected
                    ? `Verbunden (${googleOAuth?.accountEmail || 'Aktiv'})`
                    : 'Nicht verbunden'}
                </strong>
              </span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>
              <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {feeds.length}
              </strong>{' '}
              iCal-Feeds
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>
              <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {events.length}
              </strong>{' '}
              Termine
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              Letzter Sync: {formatSyncTimestamp(latestSyncIso)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="/ Termine filtern..."
            style={{
              ...inputMonoStyle,
              width: 210,
              marginBottom: 0,
            }}
          />
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            style={btnSecondaryStyle}
          >
            {isSyncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            style={btnPrimaryStyle}
          >
            Termin erstellen
          </button>
        </div>
      </header>

      {/* 2. USER ACTION REQUIRED BANNER */}
      {requiresUserAction && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--line-hairline)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--status-warn)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
              Benutzereingabe erforderlich: Google OAuth oder iCal-Feed einrichten, um externe Kalender zu synchronisieren
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setActiveTab('connect')}
              style={btnPrimaryStyle}
            >
              Synchronisation & Quellen einrichten
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              style={btnSecondaryStyle}
            >
              Jetzt synchronisieren
            </button>
          </div>
        </div>
      )}

      {/* TOAST FEEDBACK BAR */}
      {toast && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--line-hairline)',
            fontSize: 12.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  toast.tone === 'ok'
                    ? 'var(--status-ok)'
                    : toast.tone === 'warn'
                      ? 'var(--status-warn)'
                      : 'var(--status-danger)',
              }}
            />
            <span style={{ color: 'var(--text-primary)' }}>{toast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Schließen
          </button>
        </div>
      )}

      {/* 3. TOP 4-COLUMN HAIRLINE KPI STRIP */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div
          style={{
            padding: '20px 24px 20px 0',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div style={sectionLabelStyle}>TERMINE HEUTE</div>
          <div style={heroMetricStyle}>{todayEvents.length}</div>
          <div style={kpiSubStyle}>
            {busyHoursToday.toFixed(1)} Std. verplant heute
          </div>
        </div>

        <div
          style={{
            padding: '20px 24px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div style={sectionLabelStyle}>KOMMENDE TERMINE (7 TAGE)</div>
          <div style={heroMetricStyle}>{upcoming7dEvents.length}</div>
          <div
            style={{
              ...kpiSubStyle,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {nextUpcomingEvent
              ? `Nächster: ${nextUpcomingEvent.title} (${formatEventTime(nextUpcomingEvent.start_time)})`
              : 'Keine anstehenden Termine'}
          </div>
        </div>

        <div
          style={{
            padding: '20px 24px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div style={sectionLabelStyle}>ZEITBUDGET (STUNDEN)</div>
          <div style={heroMetricStyle}>{totalHoursAll.toFixed(1)} h</div>
          <div style={kpiSubStyle}>
            Über {events.length} Termine in {byCategory.length} Kategorien
          </div>
        </div>

        <div style={{ padding: '20px 0 20px 24px' }}>
          <div style={sectionLabelStyle}>SYNC-STATUS & QUELLEN</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 6,
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  isOAuthConnected || feeds.length > 0
                    ? 'var(--status-ok)'
                    : 'var(--status-warn)',
              }}
            />
            <span>
              {isOAuthConnected
                ? 'OAuth2 Aktiv'
                : feeds.length > 0
                  ? 'iCal-Sync Aktiv'
                  : 'Konfiguration offen'}
            </span>
          </div>
          <div style={{ ...kpiSubStyle, marginTop: 8 }}>
            {visibleCalendarsCount}/{calendars.length} Horizon-Kalender · {feeds.length} iCal-Feeds
          </div>
        </div>
      </section>

      {/* 4. CLEAN TEXT-LINK TABS */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          borderBottom: '1px solid var(--line-hairline)',
          marginBottom: 24,
        }}
      >
        {(
          [
            { key: 'agenda', label: `Agenda & Termine (${events.length})` },
            { key: 'create', label: 'Termin erstellen' },
            { key: 'horizon', label: 'Horizon & Zeitbudget' },
            { key: 'connect', label: 'Synchronisation & Quellen' },
          ] as Array<{ key: TabKey; label: string }>
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '1px solid var(--text-primary)' : '1px solid transparent',
                marginBottom: -1,
                padding: '14px 0',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* TAB 1: AGENDA & TERMINE */}
      {activeTab === 'agenda' && (
        <div>
          {/* Optional Meal Planner Today Strip (Cross-App Synergy from /data/shared.db) */}
          {mealPlannerToday && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                padding: '10px 14px',
                marginBottom: 24,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--line-hairline)',
                fontSize: 12.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  MEALS · {mealPlannerToday.date}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Frühstück:{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {mealPlannerToday.breakfast || '—'}
                  </strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Mittag:{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {mealPlannerToday.lunch || '—'}
                  </strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Abend:{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {mealPlannerToday.dinner || '—'}
                  </strong>
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {mealPlannerToday.totalCalories} kcal · {mealPlannerToday.totalProtein}g Protein
              </div>
            </div>
          )}

          {/* Column Headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 110px 1fr 200px 160px 40px',
              gap: 16,
              padding: '8px 0',
              borderBottom: '1px solid var(--line-hairline)',
              ...sectionLabelStyle,
            }}
          >
            <div>DATUM / ZEIT</div>
            <div>KATEGORIE</div>
            <div>TERMIN / BESCHREIBUNG</div>
            <div>KALENDER / QUELLE</div>
            <div>ORT</div>
            <div style={{ textAlign: 'right' }}>AKTION</div>
          </div>

          {filteredEvents.length === 0 ? (
            <div
              style={{
                padding: '32px 0',
                borderBottom: '1px solid var(--line-hairline)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                Keine Termine in der aktuellen Ansicht gefunden. Synchronisiere externe Kalender oder erstelle einen neuen Termin.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={handleSyncNow} style={btnSecondaryStyle}>
                  Jetzt synchronisieren
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  style={btnPrimaryStyle}
                >
                  Termin erstellen
                </button>
              </div>
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const isPast = new Date(ev.end_time).getTime() < Date.now();
              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 110px 1fr 200px 160px 40px',
                    gap: 16,
                    alignItems: 'center',
                    minHeight: 44,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  {/* Date & Time in Mono */}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ color: 'var(--text-primary)' }}>
                      {formatEventDate(ev.start_time)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {formatEventTime(ev.start_time)}–{formatEventTime(ev.end_time)} ({ev.duration_minutes}m)
                    </div>
                  </div>

                  {/* Category Badge (Monochrome) */}
                  <div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--line-hairline)',
                        padding: '2px 6px',
                        borderRadius: 3,
                      }}
                    >
                      {CATEGORY_LABELS[ev.category] || ev.category.toUpperCase()}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ev.title}
                    </div>
                    {ev.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {ev.description}
                      </div>
                    )}
                  </div>

                  {/* Calendar Source */}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ev.calendar_name}
                  </div>

                  {/* Location */}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ev.location || '—'}
                  </div>

                  {/* Delete Button */}
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(ev.id)}
                      title="Termin löschen"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--line-hairline)',
                        color: 'var(--text-secondary)',
                        borderRadius: 4,
                        width: 26,
                        height: 26,
                        cursor: 'pointer',
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: TERMIN ERSTELLEN */}
      {activeTab === 'create' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 520px) minmax(0, 1fr)',
            gap: 48,
            alignItems: 'start',
          }}
        >
          <form onSubmit={handleAddEvent}>
            <div style={{ ...sectionLabelStyle, marginBottom: 16 }}>
              NEUEN KALENDERTERMIN ANLEGEN (POST /EVENTS)
            </div>

            <label style={labelStyle}>Ziel-Kalender</label>
            <select
              value={selectedCalForNew}
              onChange={(e) => setSelectedCalForNew(e.target.value)}
              style={inputMonoStyle}
            >
              {calendars.map((c) => (
                <option key={c.calendar_name} value={c.calendar_name}>
                  {c.calendar_name}
                </option>
              ))}
              {calendars.length === 0 && (
                <option value="Thomas.simhofer@gmail.com">Thomas.simhofer@gmail.com</option>
              )}
            </select>

            <label style={labelStyle}>Titel</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Deep Work, Architektur-Review, Lauftraining"
              style={inputMonoStyle}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Startzeitpunkt</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={inputMonoStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Dauer (Minuten)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={inputMonoStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CalendarEventRow['category'])}
                  style={inputMonoStyle}
                >
                  <option value="work">WORK — Arbeit & Meetings</option>
                  <option value="focus">FOCUS — Deep Work</option>
                  <option value="health">HEALTH — Sport & Gesundheit</option>
                  <option value="meals">MEALS — Ernährung</option>
                  <option value="social">SOCIAL — Familie & Soziales</option>
                  <option value="personal">PERSONAL — Persönlich</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Ort / Link (optional)</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Raum, Adresse oder Meet-URL"
                  style={inputMonoStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" style={btnPrimaryStyle}>
                Termin speichern & synchronisieren
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('agenda')}
                style={btnSecondaryStyle}
              >
                Abbrechen
              </button>
            </div>
          </form>

          <div
            style={{
              borderLeft: '1px solid var(--line-hairline)',
              paddingLeft: 32,
            }}
          >
            <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>
              SYNCHRONISATIONS-VERHALTEN
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Neu angelegte Termine werden lokal in SQLite gespeichert, bei aktiver Google OAuth2-Verbindung direkt in den gewählten Google-Kalender geschrieben und an die Home Assistant Sensoren publiziert.
            </p>
            <div
              style={{
                borderTop: '1px solid var(--line-hairline)',
                paddingTop: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <div>Ziel-Kalender: {selectedCalForNew || 'Standard'}</div>
              <div style={{ marginTop: 4 }}>
                OAuth2-Schreibzugriff: {isOAuthConnected ? 'Aktiv' : 'Nur lokal (OAuth nicht verbunden)'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HORIZON & ZEITBUDGET */}
      {activeTab === 'horizon' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 48,
            alignItems: 'start',
          }}
        >
          {/* Left Column: Horizon Calendar Visibility */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div>
                <div style={sectionLabelStyle}>HORIZON TIMELINE-FILTER</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Steuert, welche Kalender im Horizon-Dashboard und in den Home Assistant Sensoren berücksichtigt werden.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleSetAllHorizonCalendars(true)}
                  style={btnSecondaryStyle}
                >
                  Alle aktivieren
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllHorizonCalendars(false)}
                  style={btnSecondaryStyle}
                >
                  Alle ausblenden
                </button>
              </div>
            </div>

            {calendars.length === 0 ? (
              <div
                style={{
                  padding: '24px 0',
                  borderBottom: '1px solid var(--line-hairline)',
                  color: 'var(--text-muted)',
                  fontSize: 12.5,
                }}
              >
                Noch keine Kalender geladen.
              </div>
            ) : (
              calendars.map((cal) => (
                <div
                  key={cal.calendar_name}
                  onClick={() =>
                    handleToggleHorizonCalendar(cal.calendar_name, !cal.show_in_horizon)
                  }
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: 44,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: cal.show_in_horizon
                          ? 'var(--status-ok)'
                          : 'var(--text-muted)',
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: cal.show_in_horizon
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {cal.calendar_name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        Quelle: {cal.source} · {cal.event_count} Termine
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: cal.show_in_horizon
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                      border: '1px solid var(--line-hairline)',
                      padding: '3px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {cal.show_in_horizon ? 'SICHTBAR' : 'AUSGEBLENDET'}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Right Column: Category Time Breakdown & HA Entities */}
          <div
            style={{
              borderLeft: '1px solid var(--line-hairline)',
              paddingLeft: 48,
            }}
          >
            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div style={sectionLabelStyle}>ZEITBUDGET NACH KATEGORIE</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                Summierte Dauer aller synchronisierten Termine nach Kategorie ({totalHoursAll.toFixed(1)} Std. gesamt).
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {byCategory.length === 0 ? (
                <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 12.5 }}>
                  Keine Kategoriedaten vorhanden.
                </div>
              ) : (
                byCategory.map((c) => {
                  const pct =
                    totalHoursAll > 0 ? Math.round((c.total_hours / totalHoursAll) * 100) : 0;
                  return (
                    <div
                      key={c.category}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--line-hairline)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginBottom: 8,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--text-primary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {CATEGORY_LABELS[c.category] || c.category}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {c.total_hours}h · {c.event_count} Termine · {pct}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: 2,
                          background: 'var(--line-hairline)',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: 'var(--text-primary)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Published Home Assistant Entities */}
            <div style={{ marginTop: 32 }}>
              <div
                style={{
                  ...sectionLabelStyle,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                PUBLIZIERTE HOME ASSISTANT ENTITIES
              </div>
              {[
                {
                  id: 'sensor.thassi_google_calendar_next_event',
                  desc: 'Titel, Startzeit, Kategorie und Ort des nächsten anstehenden Termins',
                },
                {
                  id: 'sensor.thassi_google_calendar_today_events',
                  desc: 'Anzahl heutiger Termine inkl. busy_hours_today und schedule_load',
                },
                {
                  id: 'sensor.thassi_google_calendar_scheduled_hours',
                  desc: 'Gesamte geplante Stunden im aktiven Kalender-Fenster',
                },
              ].map((ent) => (
                <div
                  key={ent.id}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {ent.id}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {ent.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SYNCHRONISATION & QUELLEN */}
      {activeTab === 'connect' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 48,
            alignItems: 'start',
          }}
        >
          {/* Left Column: iCal (.ics) Feeds Management */}
          <div>
            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: 16,
              }}
            >
              <div style={sectionLabelStyle}>ICAL (.ICS) KALENDER-FEEDS</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                Externe iCal-URLs periodisch importieren und einer Standard-Kategorie zuweisen.
              </div>
            </div>

            <form onSubmit={handleAddFeed} style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Bezeichnung des Kalenders</label>
              <input
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                placeholder="z. B. Team-Kalender oder Familien-iCal"
                style={inputMonoStyle}
                required
              />

              <label style={labelStyle}>Geheime iCal (.ics) URL</label>
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                style={inputMonoStyle}
                required
              />

              <label style={labelStyle}>Standard-Kategorie</label>
              <select
                value={feedCat}
                onChange={(e) => setFeedCat(e.target.value)}
                style={inputMonoStyle}
              >
                <option value="personal">PERSONAL — Persönlich</option>
                <option value="work">WORK — Arbeit & Meetings</option>
                <option value="health">HEALTH — Sport & Gesundheit</option>
                <option value="social">SOCIAL — Familie & Soziales</option>
              </select>

              <button type="submit" style={btnPrimaryStyle}>
                iCal-Feed verbinden & synchronisieren
              </button>
            </form>

            <div
              style={{
                ...sectionLabelStyle,
                paddingBottom: 8,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              VERBUNDENE ICAL-FEEDS ({feeds.length})
            </div>

            {feeds.length === 0 ? (
              <div
                style={{
                  padding: '16px 0',
                  borderBottom: '1px solid var(--line-hairline)',
                  color: 'var(--text-muted)',
                  fontSize: 12.5,
                }}
              >
                Keine iCal-Feeds hinterlegt.
              </div>
            ) : (
              feeds.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: f.last_synced_at
                            ? 'var(--status-ok)'
                            : 'var(--status-warn)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                        }}
                      >
                        [{f.default_category}]
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      Letzter Sync: {formatSyncTimestamp(f.last_synced_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFeed(f.id)}
                    style={btnSecondaryStyle}
                  >
                    Entfernen
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Right Column: Google OAuth2 Configuration */}
          <div
            style={{
              borderLeft: '1px solid var(--line-hairline)',
              paddingLeft: 48,
            }}
          >
            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: 16,
              }}
            >
              <div style={sectionLabelStyle}>GOOGLE CALENDAR OAUTH2 API (V3)</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                Bidirektionale Synchronisation über Google Cloud OAuth2 oder automatischer Token-Import aus Home Assistant.
              </div>
            </div>

            {/* Connection Status Row */}
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--line-hairline)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isOAuthConnected ? 'var(--status-ok)' : 'var(--status-warn)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {isOAuthConnected
                    ? `Verbunden mit Google Calendar v3 API (${googleOAuth?.accountEmail || 'OAuth2 Aktiv'})`
                    : hasOAuthCredentials
                      ? 'Client-Zugangsdaten gespeichert — Autorisierung ausstehend'
                      : 'Nicht konfiguriert — Client ID & Secret erforderlich'}
                </span>
              </div>
              {googleOAuth?.clientId && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    marginTop: 6,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Client ID: {googleOAuth.clientId} · Token-Ablauf:{' '}
                  {googleOAuth.expiresAt
                    ? formatSyncTimestamp(String(googleOAuth.expiresAt))
                    : 'Auto-Refresh'}
                </div>
              )}
            </div>

            {/* Auto-Import from Home Assistant */}
            <div style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={handleImportHaOAuth}
                style={{ ...btnSecondaryStyle, width: '100%', textAlign: 'center' }}
              >
                OAuth2-Token automatisch aus Home Assistant importieren
              </button>
            </div>

            {/* Save Client ID / Secret Form */}
            <form onSubmit={handleSaveOAuthCredentials} style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Google Cloud OAuth2 Client ID</label>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={
                  googleOAuth?.clientId || '892050246891-...apps.googleusercontent.com'
                }
                style={inputMonoStyle}
              />

              <label style={labelStyle}>Google Cloud OAuth2 Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                style={inputMonoStyle}
              />

              <label style={labelStyle}>Autorisierte Redirect URI</label>
              <input
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                style={inputMonoStyle}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={btnPrimaryStyle}>
                  Zugangsdaten speichern
                </button>
                <button
                  type="button"
                  onClick={handleStartOAuthFlow}
                  style={btnSecondaryStyle}
                >
                  Google Consent-Screen öffnen
                </button>
              </div>
            </form>

            {/* Exchange Auth Code Form */}
            <form
              onSubmit={handleExchangeCode}
              style={{
                borderTop: '1px solid var(--line-hairline)',
                paddingTop: 16,
              }}
            >
              <label style={labelStyle}>
                Autorisierungscode einlösen (falls Redirect auf localhost)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="?code=4/0A... hier einfügen"
                  style={{ ...inputMonoStyle, marginBottom: 0, flex: 1 }}
                />
                <button type="submit" style={btnPrimaryStyle}>
                  Code einlösen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const heroMetricStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 400,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
  marginTop: 4,
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontVariantNumeric: 'tabular-nums',
  marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
};

const inputMonoStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--line-hairline)',
  borderRadius: 4,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  marginBottom: 14,
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#fafafa',
  color: '#09090b',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--line-hairline)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
