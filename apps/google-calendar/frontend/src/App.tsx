import React, { useEffect, useState } from 'react';
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
}

const CATEGORY_COLORS: Record<string, string> = {
  work: '#38bdf8',
  focus: '#a855f7',
  health: '#4ade80',
  meals: '#fb923c',
  social: '#f472b6',
  personal: '#94a3b8',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'horizon' | 'analytics' | 'connect'>('agenda');
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [calendars, setCalendars] = useState<CalendarSettingItem[]>([]);
  const [feeds, setFeeds] = useState<CalendarFeedRow[]>([]);
  const [byCategory, setByCategory] = useState<CategoryStat[]>([]);
  const [googleOAuth, setGoogleOAuth] = useState<ExtendedOAuthStatus | null>(null);
  const [mealPlannerToday, setMealPlannerToday] = useState<MealPlannerToday | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Add Event form
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

  // Add Google Calendar iCal Feed form
  const [feedName, setFeedName] = useState('My Google Calendar');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedCat, setFeedCat] = useState('personal');

  // Google OAuth2 configuration form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    () => `${window.location.origin}/api/system/google/callback`
  );
  const [authCode, setAuthCode] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
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
        `Synced (OAuth: ${res.oauthSynced}, HA: ${res.haCalendarSynced}, ICS: ${res.icsSynced})! Next: "${res.nextEvent}" • Today: ${res.todayEventCount} events (${res.busyHoursToday}h).`
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
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
        `${nextVisible ? '✅ Showing' : '🙈 Hidden'} "${calName}" in Horizon Dashboard timeline.`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSetAllHorizonCalendars = async (visible: boolean) => {
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
    notify(visible ? 'All calendars enabled in Horizon.' : 'All calendars hidden in Horizon.');
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
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
    notify('Event created & synced to Google Calendar + Home Assistant sensors!');
    await loadDashboard();
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
      notify(`Connected "${feedName}" and imported ${res.syncRes.icsSynced} calendar event(s)!`);
      await loadDashboard();
      setActiveTab('agenda');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
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
          ? `✅ Connected real Google OAuth2 API (${res.accountEmail || 'Google Calendar'}) — synced ${res.syncRes?.oauthSynced || 0} OAuth events!`
          : 'Could not find Google OAuth token in Home Assistant storage; please configure Client ID & Secret below.'
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
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
      notify('Saved Google OAuth2 Client credentials!');
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartOAuthFlow = async () => {
    try {
      const res = await api.get<{ url: string }>('/oauth/auth-url');
      if (res.url) {
        window.open(res.url, '_blank', 'width=580,height=700');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
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
        `✅ Google OAuth2 authorized! Synced ${res.syncRes?.oauthSynced || 0} events via Google Calendar v3 API.`
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const totalHoursAll = byCategory.reduce((s, c) => s + (c.total_hours || 0), 0);
  const visibleCalendarsCount = calendars.filter((c) => c.show_in_horizon).length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>
            📅 Google Calendar & Horizon Configuration
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            {events.length} Visible Events • {visibleCalendarsCount}/{calendars.length} Calendars Shown in Horizon •{' '}
            {googleOAuth?.authorized
              ? `✅ Google OAuth2 API Active (${googleOAuth.accountEmail || 'Connected'})`
              : '⚠️ OAuth Pending'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('agenda')}
            style={activeTab === 'agenda' ? btnPrimary : btnTab}
          >
            🗓️ Agenda ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('horizon')}
            style={activeTab === 'horizon' ? btnPrimary : btnTab}
          >
            🌅 Horizon Calendars ({visibleCalendarsCount}/{calendars.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            style={activeTab === 'analytics' ? btnPrimary : btnTab}
          >
            📊 Time Analytics
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            style={activeTab === 'connect' ? btnPrimary : btnTab}
          >
            🔐 Google OAuth2 API & Feeds
          </button>
          <button onClick={handleSyncNow} style={btnOutline}>
            🔄 Sync Google API Now
          </button>
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0284c7',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {/* Quick Horizon Calendar Filter Strip (Always accessible at top) */}
      {calendars.length > 0 && (
        <div
          style={{
            background: '#161f2e',
            border: '1px solid #263349',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#38bdf8' }}>
              🌅 Calendars Shown in Horizon Timeline (Click to toggle)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleSetAllHorizonCalendars(true)}
                style={{ ...btnSmall, color: '#4ade80', borderColor: 'rgba(74,222,128,0.35)' }}
              >
                Show All
              </button>
              <button
                type="button"
                onClick={() => handleSetAllHorizonCalendars(false)}
                style={{ ...btnSmall, color: '#94a3b8' }}
              >
                Hide All
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {calendars.map((cal) => (
              <button
                key={cal.calendar_name}
                type="button"
                onClick={() => handleToggleHorizonCalendar(cal.calendar_name, !cal.show_in_horizon)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 99,
                  border: cal.show_in_horizon
                    ? `1px solid ${cal.color || '#38bdf8'}`
                    : '1px solid #334155',
                  background: cal.show_in_horizon ? 'rgba(56, 189, 248, 0.14)' : '#0f172a',
                  color: cal.show_in_horizon ? '#f8fafc' : '#64748b',
                  fontSize: 12.5,
                  fontWeight: cal.show_in_horizon ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: cal.show_in_horizon ? cal.color || '#38bdf8' : '#475569',
                  }}
                />
                <span>{cal.calendar_name}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>({cal.event_count})</span>
                <span style={{ fontSize: 11 }}>{cal.show_in_horizon ? '✓' : '✕'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cross-App Synergy Banner from Meal Planner (/data/shared.db) */}
      {mealPlannerToday && (
        <div
          style={{
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid #334155',
            borderLeft: '4px solid #fb923c',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#fb923c', fontWeight: 700 }}>
              🍲 Shared from Thassi Meal Planner ({mealPlannerToday.date})
            </span>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              <strong>Breakfast:</strong> {mealPlannerToday.breakfast || '—'} &nbsp;•&nbsp;{' '}
              <strong>Lunch:</strong> {mealPlannerToday.lunch || '—'} &nbsp;•&nbsp;{' '}
              <strong>Dinner:</strong> {mealPlannerToday.dinner || '—'}
            </div>
          </div>
          <span
            style={{
              background: '#0f172a',
              padding: '6px 12px',
              borderRadius: 99,
              fontSize: 12,
              color: '#fb923c',
              border: '1px solid #334155',
            }}
          >
            🔥 {mealPlannerToday.totalCalories} kcal • 💪 {mealPlannerToday.totalProtein}g protein
          </span>
        </div>
      )}

      {activeTab === 'agenda' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {events.length === 0 && (
              <div
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: 24,
                  color: '#94a3b8',
                  textAlign: 'center',
                }}
              >
                No events visible. Enable more calendars above or click <strong>🔄 Sync Google API Now</strong>.
              </div>
            )}
            {events.map((ev) => {
              const color = CATEGORY_COLORS[ev.category] || '#38bdf8';
              const startDt = new Date(ev.start_time);
              const endDt = new Date(ev.end_time);
              return (
                <div
                  key={ev.id}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 11,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: '#0f172a',
                          color,
                          fontWeight: 700,
                        }}
                      >
                        {ev.category}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {startDt.toLocaleDateString()} •{' '}
                        {startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (
                        {ev.duration_minutes}m)
                      </span>
                      <span style={{ fontSize: 11, color: '#38bdf8', background: '#0f172a', padding: '2px 7px', borderRadius: 6 }}>
                        {ev.calendar_name}
                      </span>
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 16 }}>{ev.title}</h4>
                    {ev.location && (
                      <div style={{ fontSize: 12, color: '#38bdf8', marginBottom: 4 }}>
                        📍 {ev.location}
                      </div>
                    )}
                    {ev.description && (
                      <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{ev.description}</p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await api.delete(`/events?id=${ev.id}`);
                      await loadDashboard();
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleAddEvent}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              alignSelf: 'start',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>+ Add Google Calendar Event</h3>
            <label style={labelStyle}>Target Calendar</label>
            <select
              value={selectedCalForNew}
              onChange={(e) => setSelectedCalForNew(e.target.value)}
              style={inputStyle}
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
            <label style={labelStyle}>Event Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep Work or Evening Run"
              style={inputStyle}
            />
            <label style={labelStyle}>Start Date & Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Duration (min)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CalendarEventRow['category'])}
                  style={inputStyle}
                >
                  <option value="work">💼 Work / Meetings</option>
                  <option value="focus">🧠 Deep Focus</option>
                  <option value="health">🏃 Health & Workout</option>
                  <option value="meals">🍲 Meals</option>
                  <option value="social">🎉 Social & Family</option>
                  <option value="personal">📌 Personal</option>
                </select>
              </div>
            </div>
            <label style={labelStyle}>Location / Link</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional room or URL"
              style={inputStyle}
            />
            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Create Event in Google Calendar
            </button>
          </form>
        </div>
      )}

      {activeTab === 'horizon' && (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0, color: '#38bdf8' }}>
            🌅 Configure Which Calendars Appear in Horizon Dashboard
          </h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
            Toggle which Google OAuth calendars and feeds are rendered on the bottom moving timeline in the Horizon Dashboard and included in Home Assistant next-event sensors.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {calendars.map((cal) => (
              <div
                key={cal.calendar_name}
                onClick={() => handleToggleHorizonCalendar(cal.calendar_name, !cal.show_in_horizon)}
                style={{
                  background: cal.show_in_horizon ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.45)',
                  border: cal.show_in_horizon ? `1px solid ${cal.color || '#38bdf8'}` : '1px solid #334155',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: cal.color || '#38bdf8',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: cal.show_in_horizon ? '#f8fafc' : '#64748b' }}>
                      {cal.calendar_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {cal.event_count} upcoming events • {cal.source}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={cal.show_in_horizon}
                  onChange={() => {}}
                  style={{ width: 18, height: 18, accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>⏱️ Time Allocation by Category</h3>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              Automatically categorized from your Google Calendar events stored in SQLite.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {byCategory.map((c) => {
                const pct = totalHoursAll > 0 ? Math.round((c.total_hours / totalHoursAll) * 100) : 0;
                const color = CATEGORY_COLORS[c.category] || '#38bdf8';
                return (
                  <div key={c.category}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ textTransform: 'capitalize', color }}>{c.category}</strong>
                      <span>
                        {c.total_hours}h ({c.event_count} events • {pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 10,
                        background: '#0f172a',
                        borderRadius: 99,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>🏠 Published Home Assistant Entities</h3>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              These sensors are automatically updated in Home Assistant every 15 minutes and on every change:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <div style={{ padding: 12, background: '#0f172a', borderRadius: 8 }}>
                <code>sensor.thassi_google_calendar_next_event</code>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Next upcoming calendar event title, start time, category, and location.
                </div>
              </div>
              <div style={{ padding: 12, background: '#0f172a', borderRadius: 8 }}>
                <code>sensor.thassi_google_calendar_today_events</code>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Number of events today + <code>busy_hours_today</code> and <code>schedule_load</code> attributes.
                </div>
              </div>
              <div style={{ padding: 12, background: '#0f172a', borderRadius: 8 }}>
                <code>sensor.thassi_google_calendar_scheduled_hours</code>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Total scheduled hours across your stored calendar window.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'connect' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              alignSelf: 'start',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>
              🔐 Real Google Calendar OAuth2 API Access
            </h3>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: '#0f172a',
                border: `1px solid ${googleOAuth?.authorized ? '#22c55e' : '#eab308'}`,
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <div>
                <strong>Status:</strong>{' '}
                <span style={{ color: googleOAuth?.authorized ? '#4ade80' : '#facc15', fontWeight: 700 }}>
                  {googleOAuth?.authorized
                    ? `✅ Connected to Google Calendar v3 API (${googleOAuth.accountEmail || 'OAuth2 Active'})`
                    : googleOAuth?.configured
                      ? '⚠️ Client Credentials Saved — Ready to Authorize'
                      : 'Not Configured'}
                </span>
              </div>
              {googleOAuth?.clientId && (
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                  Client ID: <code>{googleOAuth.clientId}</code> • Token Expires:{' '}
                  {googleOAuth.expiresAt ? new Date(googleOAuth.expiresAt).toLocaleString() : 'Auto-Refresh'}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleImportHaOAuth}
              style={{
                ...btnPrimary,
                width: '100%',
                background: '#10b981',
                marginBottom: 16,
              }}
            >
              ⚡ Auto-Sync OAuth2 Credentials & Token from Home Assistant
            </button>

            <form onSubmit={handleSaveOAuthCredentials}>
              <label style={labelStyle}>Google Cloud OAuth2 Client ID</label>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={googleOAuth?.clientId || '892050246891-...apps.googleusercontent.com'}
                style={inputStyle}
              />
              <label style={labelStyle}>Google Cloud OAuth2 Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                style={inputStyle}
              />
              <label style={labelStyle}>Authorized Redirect URI</label>
              <input
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button type="submit" style={{ ...btnPrimary, flex: 1 }}>
                  Save OAuth Credentials
                </button>
                <button type="button" onClick={handleStartOAuthFlow} style={{ ...btnOutline, flex: 1 }}>
                  🔑 Open Google Consent Screen
                </button>
              </div>
            </form>

            <form onSubmit={handleExchangeCode} style={{ borderTop: '1px solid #334155', paddingTop: 12 }}>
              <label style={labelStyle}>Exchange Authorization Code (if redirected to localhost)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste ?code=4/0A... here"
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
                <button type="submit" style={btnPrimary}>
                  Exchange
                </button>
              </div>
            </form>
          </div>

          <form
            onSubmit={handleAddFeed}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              alignSelf: 'start',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>
              🔗 Additional iCal (.ics) Calendar Feeds
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              Optionally connect external iCal (<code>.ics</code>) URLs alongside your Google OAuth2 calendars:
            </p>
            <label style={labelStyle}>Calendar Label</label>
            <input
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              placeholder="e.g. Shared Team Calendar"
              style={inputStyle}
            />
            <label style={labelStyle}>Secret iCal (.ics) URL</label>
            <input
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              style={inputStyle}
            />
            <label style={labelStyle}>Default Category</label>
            <select
              value={feedCat}
              onChange={(e) => setFeedCat(e.target.value)}
              style={inputStyle}
            >
              <option value="personal">Personal</option>
              <option value="work">Work / Meetings</option>
              <option value="health">Health & Fitness</option>
              <option value="social">Social & Family</option>
            </select>
            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Connect & Sync iCal Feed
            </button>

            {feeds.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px' }}>Connected iCal Feeds</h4>
                {feeds.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: 10,
                      background: '#0f172a',
                      borderRadius: 8,
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong>{f.name}</strong> ({f.default_category})
                      {f.last_synced_at && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Last synced: {new Date(f.last_synced_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.delete(`/feeds?id=${f.id}`);
                        await loadDashboard();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 4,
};

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

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnTab: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnOutline: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #38bdf8',
  background: 'transparent',
  color: '#38bdf8',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSmall: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#cbd5e1',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
};
