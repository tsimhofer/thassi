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

const CATEGORY_COLORS: Record<string, string> = {
  work: '#38bdf8',
  focus: '#a855f7',
  health: '#4ade80',
  meals: '#fb923c',
  social: '#f472b6',
  personal: '#94a3b8',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'analytics' | 'connect'>('agenda');
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [feeds, setFeeds] = useState<CalendarFeedRow[]>([]);
  const [byCategory, setByCategory] = useState<CategoryStat[]>([]);
  const [googleOAuth, setGoogleOAuth] = useState<GoogleOAuthStatus | null>(null);
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

  // Add Google Calendar iCal Feed form
  const [feedName, setFeedName] = useState('My Google Calendar');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedCat, setFeedCat] = useState('personal');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const loadDashboard = async () => {
    const data = await api.get<{
      events: CalendarEventRow[];
      feeds: CalendarFeedRow[];
      byCategory: CategoryStat[];
      googleOAuth: GoogleOAuthStatus;
      mealPlannerToday: MealPlannerToday | null;
    }>('/dashboard');
    setEvents(data.events);
    setFeeds(data.feeds);
    setByCategory(data.byCategory);
    setGoogleOAuth(data.googleOAuth);
    setMealPlannerToday(data.mealPlannerToday);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleSyncNow = async () => {
    try {
      const res = await api.post<{
        oauthSynced: number;
        icsSynced: number;
        nextEvent: string;
        todayEventCount: number;
        busyHoursToday: number;
      }>('/sync');
      notify(
        `Synced! Next event: "${res.nextEvent}" • Today: ${res.todayEventCount} events (${res.busyHoursToday}h) published to Home Assistant.`
      );
      await loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
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
    });
    setTitle('');
    setLocation('');
    notify('Event added to SQLite & synced to Home Assistant sensors!');
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

  const totalHoursAll = byCategory.reduce((s, c) => s + (c.total_hours || 0), 0);

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
            📅 Google Calendar & Time Analytics
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            {events.length} Stored Events • {totalHoursAll.toFixed(1)}h Scheduled • Cross-App Meal Planner Bridge Active
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('agenda')}
            style={activeTab === 'agenda' ? btnPrimary : btnTab}
          >
            🗓️ Agenda & Meals
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            style={activeTab === 'analytics' ? btnPrimary : btnTab}
          >
            📊 Time Allocation Analytics
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            style={activeTab === 'connect' ? btnPrimary : btnTab}
          >
            🔗 Connect Google Calendar ({feeds.length + (googleOAuth?.authorized ? 1 : 0)})
          </button>
          <button onClick={handleSyncNow} style={btnOutline}>
            🔄 Sync & Update HA Sensors
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
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
                      <span style={{ fontSize: 11, color: '#64748b' }}>[{ev.calendar_name}]</span>
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
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>+ Add Event Block</h3>
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
              Save Event & Update HA Sensor
            </button>
          </form>
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
          <form
            onSubmit={handleAddFeed}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>
              Option 1: Instant Connect via Google Calendar Private iCal (.ics) URL
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              In <strong>Google Calendar Web → Settings → Settings for my calendars → Integrate calendar</strong>, copy the{' '}
              <em>"Secret address in iCal format"</em> (<code>https://calendar.google.com/calendar/ical/.../basic.ics</code>) and paste it below:
            </p>
            <label style={labelStyle}>Calendar Label</label>
            <input
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              placeholder="e.g. Personal Google Calendar"
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
              Option 2: Shared Google OAuth2 Vault
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              Status:{' '}
              <strong style={{ color: googleOAuth?.authorized ? '#4ade80' : '#facc15' }}>
                {googleOAuth?.authorized
                  ? '✅ Connected via Thassi Google OAuth2 Vault'
                  : googleOAuth?.configured
                    ? '⚠️ Credentials saved, click Authorize in Thassi Hub'
                    : 'Not configured yet'}
              </strong>
            </p>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              When you authorize your Google OAuth2 Client in <strong>Thassi Hub → 🔐 HA & Google OAuth Vault</strong>, this app automatically pulls your primary Google Calendar via the Google Calendar v3 REST API every 15 minutes.
            </p>
          </div>
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
