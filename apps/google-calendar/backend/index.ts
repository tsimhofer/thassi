import { defineThassiApp } from '@thassi/sdk';

export interface CalendarEventRow {
  id: number;
  external_id: string;
  calendar_name: string;
  title: string;
  category: 'work' | 'focus' | 'health' | 'social' | 'meals' | 'personal';
  start_time: string; // ISO string
  end_time: string;   // ISO string
  duration_minutes: number;
  location: string;
  description: string;
  source: 'google_oauth' | 'ics_feed' | 'manual';
}

export interface CalendarFeedRow {
  id: number;
  name: string;
  ics_url: string;
  default_category: string;
  last_synced_at: string | null;
}

export function inferEventCategory(
  title: string,
  description = '',
  fallback: CalendarEventRow['category'] = 'personal',
  calendarName = ''
): CalendarEventRow['category'] {
  const text = `${title} ${description} ${calendarName}`.toLowerCase();
  if (/gym|workout|run|fitness|yoga|swim|cycling|doctor|dentist|health|sleep|gesundheit|therapie|arzt|hautarzt|gyn|zahnarzt|periode/.test(text)) {
    return 'health';
  }
  if (/focus|deep work|vibe coding|coding|study|architecture|research|tu-termine|innox/.test(text)) {
    return 'focus';
  }
  if (/arbeiten|standup|sprint|meeting|sync|1:1|client|review|retro|planning|call|work|office|buero|büro/.test(text)) {
    return 'work';
  }
  if (/dinner|lunch|breakfast|meal|cooking|brunch|restaurant|mittagessen|abendessen|frühstück|essen/.test(text)) {
    return 'meals';
  }
  if (/birthday|geburtstag|party|friends|family|familie|oma|opa|concert|movie|kino|drinks|hangout|budapest|fightzustand|urlaub/.test(text)) {
    return 'social';
  }
  return fallback;
}

function parseIcsDate(raw: string): Date | null {
  const val = raw.trim();
  // Match YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, year, month, day, hh, mm, ss, isUtc] = m;
  if (!hh) {
    return new Date(`${year}-${month}-${day}T09:00:00`);
  }
  if (isUtc === 'Z') {
    return new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}Z`);
  }
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}`);
}

/**
 * Lightweight RFC-5545 iCalendar (.ics) parser for Google Calendar Secret iCal URLs
 */
export function parseIcsFeed(
  icsText: string,
  calendarName: string,
  defaultCategory: CalendarEventRow['category'] = 'personal'
): Array<Omit<CalendarEventRow, 'id'>> {
  // Unfold multi-line RFC-5545 lines (lines starting with space or tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const results: Array<Omit<CalendarEventRow, 'id'>> = [];

  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0] || '';
    const lines = body.split(/\r?\n/);

    let uid = '';
    let summary = '';
    let description = '';
    let location = '';
    let dtStart: Date | null = null;
    let dtEnd: Date | null = null;

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) continue;
      const keyPart = line.slice(0, colonIdx).toUpperCase();
      const valPart = line
        .slice(colonIdx + 1)
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .trim();

      if (keyPart === 'UID') uid = valPart;
      else if (keyPart.startsWith('SUMMARY')) summary = valPart;
      else if (keyPart.startsWith('DESCRIPTION')) description = valPart;
      else if (keyPart.startsWith('LOCATION')) location = valPart;
      else if (keyPart.startsWith('DTSTART')) dtStart = parseIcsDate(valPart);
      else if (keyPart.startsWith('DTEND')) dtEnd = parseIcsDate(valPart);
    }

    if (!summary || !dtStart) continue;
    const end = dtEnd && dtEnd > dtStart ? dtEnd : new Date(dtStart.getTime() + 60 * 60 * 1000);
    const durationMinutes = Math.max(5, Math.round((end.getTime() - dtStart.getTime()) / 60000));

    results.push({
      external_id: uid || `ics_${calendarName}_${dtStart.toISOString()}_${summary}`,
      calendar_name: calendarName,
      title: summary,
      category: inferEventCategory(summary, description, defaultCategory),
      start_time: dtStart.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: durationMinutes,
      location,
      description,
      source: 'ics_feed',
    });
  }

  return results;
}

function createSeedEvents(): Array<Omit<CalendarEventRow, 'id'>> {
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const makeIso = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    {
      external_id: 'seed_1',
      calendar_name: 'Work Calendar',
      title: 'Engineering Architecture Sync',
      category: 'work',
      start_time: makeIso(0, 10, 0),
      end_time: makeIso(0, 11, 0),
      duration_minutes: 60,
      location: 'Google Meet',
      description: 'Weekly system design and sprint alignment.',
      source: 'manual',
    },
    {
      external_id: 'seed_2',
      calendar_name: 'Personal',
      title: 'Deep Work: Home Assistant & TypeScript Hub',
      category: 'focus',
      start_time: makeIso(0, 14, 0),
      end_time: makeIso(0, 16, 30),
      duration_minutes: 150,
      location: 'Home Office',
      description: 'Building custom data analytics & smart home workflow.',
      source: 'manual',
    },
    {
      external_id: 'seed_3',
      calendar_name: 'Health & Fitness',
      title: 'Evening Strength & Mobility Session',
      category: 'health',
      start_time: makeIso(0, 18, 0),
      end_time: makeIso(0, 19, 15),
      duration_minutes: 75,
      location: 'Fitness Studio',
      description: 'Upper body + 15 min zone 2 cardio.',
      source: 'manual',
    },
    {
      external_id: 'seed_4',
      calendar_name: 'Work Calendar',
      title: 'Product Roadmap & Q4 Planning',
      category: 'work',
      start_time: makeIso(1, 9, 30),
      end_time: makeIso(1, 11, 0),
      duration_minutes: 90,
      location: 'Conference Room A / Meet',
      description: 'Reviewing milestones and resource allocation.',
      source: 'manual',
    },
    {
      external_id: 'seed_5',
      calendar_name: 'Personal',
      title: 'Friends Dinner & Board Games',
      category: 'social',
      start_time: makeIso(2, 19, 30),
      end_time: makeIso(2, 22, 30),
      duration_minutes: 180,
      location: 'Downtown',
      description: 'Catching up over dinner.',
      source: 'manual',
    },
  ];
}

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Schema for Google Calendar & Time Analytics
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      calendar_name TEXT NOT NULL DEFAULT 'Primary',
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'personal',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      location TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS calendar_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ics_url TEXT NOT NULL UNIQUE,
      default_category TEXT NOT NULL DEFAULT 'personal',
      last_synced_at TEXT
    );
  `);

  // Purge any legacy dummy/seed events so only real Google Calendar & user events remain
  ctx.db.execute("DELETE FROM calendar_events WHERE external_id LIKE 'seed_%'");

  function upsertEvent(ev: Omit<CalendarEventRow, 'id'>) {
    ctx.db.execute(
      `INSERT INTO calendar_events
       (external_id, calendar_name, title, category, start_time, end_time, duration_minutes, location, description, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         calendar_name = excluded.calendar_name,
         title = excluded.title,
         category = excluded.category,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         duration_minutes = excluded.duration_minutes,
         location = excluded.location,
         description = excluded.description`,
      [
        ev.external_id,
        ev.calendar_name,
        ev.title,
        ev.category,
        ev.start_time,
        ev.end_time,
        ev.duration_minutes,
        ev.location,
        ev.description,
        ev.source,
      ]
    );
  }

  async function syncExternalCalendars(): Promise<{
    haCalendarSynced: number;
    oauthSynced: number;
    icsSynced: number;
    errors: string[];
  }> {
    let haCalendarSynced = 0;
    let oauthSynced = 0;
    let icsSynced = 0;
    const errors: string[] = [];

    // A) Sync directly from Home Assistant's connected Google Calendar entities (calendar.*)
    try {
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        const calStates = await ctx.ha.getStates('calendar');
        const startIso = new Date(Date.now() - 7 * 86400000).toISOString();
        const endIso = new Date(Date.now() + 30 * 86400000).toISOString();

        for (const cal of calStates) {
          if (
            cal.state === 'unavailable' ||
            cal.entity_id === 'calendar.kalenderwochen' ||
            cal.entity_id === 'calendar.feiertage_in_deutschland'
          ) {
            continue;
          }
          const calName = String(cal.attributes?.friendly_name || cal.entity_id.replace('calendar.', '')).trim();
          try {
            const endpoint = `/calendars/${encodeURIComponent(cal.entity_id)}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
            const items =
              typeof ctx.ha.getCalendarEvents === 'function'
                ? await ctx.ha.getCalendarEvents(cal.entity_id, startIso, endIso)
                : await (ctx.ha as unknown as { request: <T>(ep: string) => Promise<T> }).request<
                    Array<{
                      summary?: string;
                      description?: string;
                      location?: string;
                      uid?: string;
                      start?: { dateTime?: string; date?: string };
                      end?: { dateTime?: string; date?: string };
                    }>
                  >(endpoint);
            for (const item of items) {
              const rawStart = item.start?.dateTime || item.start?.date;
              const rawEnd = item.end?.dateTime || item.end?.date;
              if (!rawStart || !item.summary) continue;

              const isAllDay = !item.start?.dateTime;
              const startDate = new Date(isAllDay ? `${rawStart}T08:00:00` : rawStart);
              const endDate = rawEnd
                ? new Date(isAllDay ? `${rawEnd}T09:00:00` : rawEnd)
                : new Date(startDate.getTime() + 60 * 60 * 1000);

              const rawDuration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
              const durationMinutes = isAllDay
                ? 60
                : Math.max(15, Math.min(720, Number.isFinite(rawDuration) ? rawDuration : 60));

              const extId =
                item.uid ||
                `ha_${cal.entity_id}_${rawStart}_${item.summary.replace(/[^a-z0-9]/gi, '_')}`;

              upsertEvent({
                external_id: extId,
                calendar_name: calName,
                title: item.summary,
                category: inferEventCategory(item.summary, item.description || '', 'personal', calName),
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                duration_minutes: durationMinutes,
                location: item.location || '',
                description: item.description || '',
                source: 'google_oauth',
              });
              haCalendarSynced++;
            }
          } catch (calErr) {
            errors.push(`${cal.entity_id}: ${calErr instanceof Error ? calErr.message : String(calErr)}`);
          }
        }
      }
    } catch (err) {
      errors.push(`HA Calendar sync: ${err instanceof Error ? err.message : String(err)}`);
    }

    // B) Sync from Shared Google OAuth2 Client if authorized directly
    const oauthStatus = ctx.google.getStatus();
    if (oauthStatus.authorized) {
      try {
        const gEvents = await ctx.google.fetchUpcomingCalendarEvents(50);
        for (const item of gEvents) {
          const start = new Date(item.start);
          const end = item.end ? new Date(item.end) : new Date(start.getTime() + 60 * 60 * 1000);
          const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
          upsertEvent({
            external_id: `gcal_${item.id}`,
            calendar_name: 'Google Calendar (OAuth)',
            title: item.summary,
            category: inferEventCategory(item.summary, item.description || ''),
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            duration_minutes: Number.isFinite(duration) ? duration : 60,
            location: item.location || '',
            description: item.description || '',
            source: 'google_oauth',
          });
          oauthSynced++;
        }
      } catch (err) {
        errors.push(`Google OAuth sync: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // C) Sync from any configured Google Calendar iCal (.ics) Feeds
    const feeds = ctx.db.query<CalendarFeedRow>('SELECT * FROM calendar_feeds');
    for (const feed of feeds) {
      try {
        const res = await fetch(feed.ics_url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${feed.name}`);
        }
        const icsText = await res.text();
        const parsed = parseIcsFeed(
          icsText,
          feed.name,
          (feed.default_category as CalendarEventRow['category']) || 'personal'
        );
        for (const ev of parsed) {
          upsertEvent(ev);
          icsSynced++;
        }
        ctx.db.execute('UPDATE calendar_feeds SET last_synced_at = ? WHERE id = ?', [
          new Date().toISOString(),
          feed.id,
        ]);
      } catch (err) {
        errors.push(`Feed "${feed.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await publishCalendarSensorsAndSharedState();
    return { haCalendarSynced, oauthSynced, icsSynced, errors };
  }

  async function publishCalendarSensorsAndSharedState() {
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10);

    const todayEvents = ctx.db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events WHERE substr(start_time, 1, 10) = ? ORDER BY start_time ASC',
      [todayPrefix]
    );

    const nextEvent = ctx.db.queryOne<CalendarEventRow>(
      'SELECT * FROM calendar_events WHERE end_time >= ? ORDER BY start_time ASC LIMIT 1',
      [now.toISOString()]
    );

    const totalMinutesToday = todayEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const busyHoursToday = Number((totalMinutesToday / 60).toFixed(1));

    const allEvents = ctx.db.query<CalendarEventRow>('SELECT * FROM calendar_events');
    const totalWeeklyHours = Number(
      (allEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(1)
    );

    // Save summary to /data/shared.db for cross-app intelligence (e.g. Meal Planner & Health)
    ctx.sharedDb.kvSet('google_calendar_today', {
      date: todayPrefix,
      todayEventCount: todayEvents.length,
      busyHoursToday,
      nextEventTitle: nextEvent?.title || 'No upcoming events',
      nextEventStart: nextEvent?.start_time || null,
      updatedAt: now.toISOString(),
    });

    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor('next_event', nextEvent?.title || 'None Scheduled', {
        friendly_name: 'Next Calendar Event',
        icon: 'mdi:calendar-star',
        start_time: nextEvent?.start_time || null,
        end_time: nextEvent?.end_time || null,
        category: nextEvent?.category || null,
        location: nextEvent?.location || '',
        calendar_name: nextEvent?.calendar_name || '',
      });

      await ctx.ha.publishSensor('today_events', todayEvents.length, {
        friendly_name: "Today's Calendar Events",
        unit_of_measurement: 'events',
        icon: 'mdi:calendar-today',
        busy_hours_today: busyHoursToday,
        schedule_load: busyHoursToday >= 5 ? 'heavy' : busyHoursToday >= 2.5 ? 'moderate' : 'light',
      });

      await ctx.ha.publishSensor('scheduled_hours', totalWeeklyHours, {
        friendly_name: 'Total Scheduled Calendar Hours',
        unit_of_measurement: 'h',
        icon: 'mdi:clock-check-outline',
      });
    }

    return {
      todayEventCount: todayEvents.length,
      busyHoursToday,
      nextEvent: nextEvent?.title || 'None Scheduled',
      totalWeeklyHours,
      haConnected: haStatus.connected,
    };
  }

  // 2. REST API Endpoints (/api/apps/google-calendar/*)

  ctx.route('GET', '/dashboard', (_req, { db, sharedDb, google }) => {
    const events = db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT 100'
    );
    const feeds = db.query<CalendarFeedRow>('SELECT * FROM calendar_feeds ORDER BY id DESC');

    // Time analytics by category
    const byCategory = db.query<{
      category: string;
      event_count: number;
      total_minutes: number;
      total_hours: number;
    }>(`
      SELECT
        category,
        COUNT(*) as event_count,
        SUM(duration_minutes) as total_minutes,
        ROUND(SUM(duration_minutes) / 60.0, 1) as total_hours
      FROM calendar_events
      GROUP BY category
      ORDER BY total_minutes DESC
    `);

    // Read cross-app Meal Planner data from /data/shared.db!
    const mealPlannerToday = sharedDb.kvGet<{
      date: string;
      breakfast: string | null;
      lunch: string | null;
      dinner: string | null;
      totalCalories: number;
      totalProtein: number;
    }>('meal_planner_today');

    return {
      events,
      feeds,
      byCategory,
      googleOAuth: google.getStatus(),
      mealPlannerToday: mealPlannerToday || null,
    };
  });

  // Add manual or quick event
  ctx.route('POST', '/events', async (req) => {
    const body = (req.body || {}) as {
      title?: string;
      start_time?: string;
      duration_minutes?: number;
      category?: CalendarEventRow['category'];
      location?: string;
      description?: string;
      calendar_name?: string;
    };

    if (!body.title?.trim() || !body.start_time) {
      return { status: 400, body: { error: 'Event title and start_time are required' } };
    }

    const start = new Date(body.start_time);
    const duration = Math.max(5, Number(body.duration_minutes || 60));
    const end = new Date(start.getTime() + duration * 60000);
    const category =
      body.category || inferEventCategory(body.title, body.description || '', 'personal');

    upsertEvent({
      external_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      calendar_name: (body.calendar_name || 'Thomas.simhofer@gmail.com').trim(),
      title: body.title.trim(),
      category,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      location: (body.location || '').trim(),
      description: (body.description || '').trim(),
      source: 'manual',
    });

    // Also push event to Google Calendar via Home Assistant calendar.create_event service
    try {
      await ctx.ha.callService('calendar', 'create_event', {
        entity_id: 'calendar.thomas_simhofer_gmail_com',
        summary: body.title.trim(),
        description: (body.description || '').trim(),
        location: (body.location || '').trim(),
        start_date_time: start.toISOString(),
        end_date_time: end.toISOString(),
      });
    } catch {
      // Ignore if calendar is read-only
    }

    await publishCalendarSensorsAndSharedState();
    return { created: true };
  });

  ctx.route('DELETE', '/events', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM calendar_events WHERE id = ?', [id]);
    await publishCalendarSensorsAndSharedState();
    return { deleted: id };
  });

  // Add a Google Calendar Secret iCal (.ics) Feed URL and immediately sync it
  ctx.route('POST', '/feeds', async (req, { db }) => {
    const body = (req.body || {}) as {
      name?: string;
      ics_url?: string;
      default_category?: string;
    };
    if (!body.name?.trim() || !body.ics_url?.trim()) {
      return { status: 400, body: { error: 'Calendar name and iCal (.ics) URL are required' } };
    }

    db.execute(
      `INSERT INTO calendar_feeds (name, ics_url, default_category)
       VALUES (?, ?, ?)
       ON CONFLICT(ics_url) DO UPDATE SET name = excluded.name, default_category = excluded.default_category`,
      [body.name.trim(), body.ics_url.trim(), body.default_category || 'personal']
    );

    const syncRes = await syncExternalCalendars();
    return { added: true, syncRes };
  });

  ctx.route('DELETE', '/feeds', (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM calendar_feeds WHERE id = ?', [id]);
    return { deleted: id };
  });

  // Trigger live sync of Google OAuth2 + iCal feeds + Home Assistant sensors
  ctx.route('POST', '/sync', async () => {
    const syncRes = await syncExternalCalendars();
    const sensorRes = await publishCalendarSensorsAndSharedState();
    return { ...syncRes, ...sensorRes };
  });

  // 3. Scheduled Background Cron Job (every 15 minutes)
  ctx.scheduleJob({
    id: 'sync-google-calendar',
    name: 'Sync Google Calendar & Publish HA Sensors',
    description:
      'Pulls upcoming events from Home Assistant Google Calendars, Google OAuth2 & iCal feeds, updates time-allocation stats, and publishes sensor.thassi_google_calendar_next_event.',
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const sync = await syncExternalCalendars();
      const ha = await publishCalendarSensorsAndSharedState();
      return `Next: "${ha.nextEvent}" | Today: ${ha.todayEventCount} events (${ha.busyHoursToday}h) | Synced HA=${sync.haCalendarSynced}, OAuth=${sync.oauthSynced}, ICS=${sync.icsSynced}`;
    },
  });
});
