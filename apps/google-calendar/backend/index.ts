import fs from 'node:fs';
import path from 'node:path';
import { defineThassiApp, ThassiActionRegistry } from '@thassi/sdk';

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
  attendees?: string;
  source: 'google_oauth' | 'ics_feed' | 'manual';
}

export interface CalendarFeedRow {
  id: number;
  name: string;
  ics_url: string;
  default_category: string;
  last_synced_at: string | null;
}

export interface CalendarSettingRow {
  calendar_name: string;
  external_cal_id: string;
  color: string;
  source: string;
  show_in_horizon: number;
  updated_at: string | null;
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
    const attendeeList: string[] = [];
    let dtStart: Date | null = null;
    let dtEnd: Date | null = null;

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) continue;
      const rawKeyPart = line.slice(0, colonIdx);
      const keyPart = rawKeyPart.toUpperCase();
      const valPart = line
        .slice(colonIdx + 1)
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .trim();

      if (keyPart === 'UID') uid = valPart;
      else if (keyPart.startsWith('SUMMARY')) summary = valPart;
      else if (keyPart.startsWith('DESCRIPTION')) description = valPart;
      else if (keyPart.startsWith('LOCATION')) location = valPart;
      else if (keyPart.startsWith('ATTENDEE')) {
        const cnMatch = rawKeyPart.match(/CN="?([^";:]+)"?/i);
        const mailClean = valPart.replace(/^mailto:/i, '').trim();
        const label = (cnMatch ? cnMatch[1].trim() : mailClean) || mailClean;
        if (label && !attendeeList.includes(label)) attendeeList.push(label);
      } else if (keyPart.startsWith('DTSTART')) dtStart = parseIcsDate(valPart);
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
      attendees: attendeeList.join(', '),
      source: 'ics_feed',
    });
  }

  return results;
}

const DEFAULT_CAL_COLORS = [
  '#38bdf8',
  '#4ade80',
  '#a855f7',
  '#f472b6',
  '#fbbf24',
  '#fb923c',
  '#2dd4bf',
  '#818cf8',
];

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Schema for Google Calendar, OAuth Sources & Horizon Visibility Config
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
      attendees TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS calendar_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ics_url TEXT NOT NULL UNIQUE,
      default_category TEXT NOT NULL DEFAULT 'personal',
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_settings (
      calendar_name TEXT PRIMARY KEY,
      external_cal_id TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#38bdf8',
      source TEXT NOT NULL DEFAULT 'google_oauth',
      show_in_horizon INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT
    );
  `);

  try {
    ctx.db.exec(`ALTER TABLE calendar_events ADD COLUMN attendees TEXT NOT NULL DEFAULT '';`);
  } catch {
    // Column already exists
  }

  // Purge any legacy dummy/seed events so only real Google Calendar & user events remain
  ctx.db.execute("DELETE FROM calendar_events WHERE external_id LIKE 'seed_%'");

  function cleanupCaseDuplicateCalendars() {
    const rows = ctx.db.query<CalendarSettingRow>('SELECT * FROM calendar_settings');
    const byLower = new Map<string, CalendarSettingRow[]>();
    for (const r of rows) {
      const k = r.calendar_name.toLowerCase();
      const arr = byLower.get(k) || [];
      arr.push(r);
      byLower.set(k, arr);
    }
    for (const [, group] of byLower.entries()) {
      if (group.length <= 1) continue;
      // Prefer the entry whose external_cal_id is a real Google Calendar ID (not starting with 'calendar.')
      const canonical =
        group.find(
          (g) => g.external_cal_id && !g.external_cal_id.startsWith('calendar.') && g.external_cal_id !== g.calendar_name
        ) || group[0];
      for (const dup of group) {
        if (dup.calendar_name === canonical.calendar_name) continue;
        ctx.db.execute('UPDATE calendar_events SET calendar_name = ? WHERE calendar_name = ?', [
          canonical.calendar_name,
          dup.calendar_name,
        ]);
        ctx.db.execute('DELETE FROM calendar_settings WHERE calendar_name = ?', [dup.calendar_name]);
      }
    }
    ctx.db.execute(
      `DELETE FROM calendar_events
       WHERE external_id NOT LIKE 'gcal_%'
         AND external_id NOT LIKE 'manual_%'
         AND LOWER(calendar_name) IN (
           SELECT DISTINCT LOWER(calendar_name) FROM calendar_events WHERE external_id LIKE 'gcal_%'
         )`
    );
  }

  function ensureCalendarSetting(
    calendarName: string,
    externalCalId = '',
    color = '',
    source = 'google_oauth',
    defaultShowInHorizon = 1
  ) {
    const cleanName = (calendarName || '').trim();
    if (!cleanName) return;
    const existing = ctx.db.queryOne<CalendarSettingRow>(
      'SELECT * FROM calendar_settings WHERE LOWER(calendar_name) = LOWER(?)',
      [cleanName]
    );
    if (!existing) {
      const countRow = ctx.db.queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM calendar_settings'
      );
      const assignedColor =
        color || DEFAULT_CAL_COLORS[(countRow?.cnt || 0) % DEFAULT_CAL_COLORS.length];
      ctx.db.execute(
        `INSERT INTO calendar_settings (calendar_name, external_cal_id, color, source, show_in_horizon, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cleanName,
          externalCalId || cleanName,
          assignedColor,
          source,
          defaultShowInHorizon ? 1 : 0,
          new Date().toISOString(),
        ]
      );
    } else {
      const isRealGoogleCal = Boolean(externalCalId && !externalCalId.startsWith('calendar.') && externalCalId !== cleanName);
      const targetName = isRealGoogleCal ? cleanName : existing.calendar_name;
      if (targetName !== existing.calendar_name) {
        ctx.db.execute('UPDATE calendar_events SET calendar_name = ? WHERE LOWER(calendar_name) = LOWER(?)', [
          targetName,
          cleanName,
        ]);
      }
      if (externalCalId || color || targetName !== existing.calendar_name) {
        ctx.db.execute(
          `UPDATE calendar_settings
           SET calendar_name = ?,
               external_cal_id = CASE WHEN ? != '' THEN ? ELSE external_cal_id END,
               color = CASE WHEN ? != '' THEN ? ELSE color END,
               updated_at = ?
           WHERE calendar_name = ?`,
          [targetName, externalCalId, externalCalId, color, color, new Date().toISOString(), existing.calendar_name]
        );
      }
    }
  }

  cleanupCaseDuplicateCalendars();

  /**
   * Automatically bridges/imports real Google OAuth2 credentials & refresh tokens
   * from Home Assistant's `/homeassistant/.storage/core.config_entries` and
   * `/homeassistant/.storage/application_credentials` if present.
   */
  function trySyncGoogleOAuthFromHomeAssistantStorage(): {
    imported: boolean;
    accountEmail?: string;
    details?: string;
  } {
    const storageDirs = ['/homeassistant/.storage', '/config/.storage'];
    for (const dir of storageDirs) {
      const entriesFile = path.join(dir, 'core.config_entries');
      const credsFile = path.join(dir, 'application_credentials');
      if (!fs.existsSync(entriesFile)) continue;

      try {
        const entriesRaw = JSON.parse(fs.readFileSync(entriesFile, 'utf-8'));
        const entries: any[] = entriesRaw?.data?.entries || [];
        const googleEntry = entries.find(
          (e) => e.domain === 'google' && e.data && e.data.token && e.data.token.refresh_token
        );
        if (!googleEntry) continue;

        const tokenObj = googleEntry.data.token;
        const authImpl = googleEntry.data.auth_implementation;

        let clientId = '';
        let clientSecret = '';

        if (fs.existsSync(credsFile)) {
          const credsRaw = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
          const items: any[] = credsRaw?.data?.items || [];
          const matchedCred =
            items.find((it) => it.id === authImpl || it.domain === 'google') || items[0];
          if (matchedCred) {
            clientId = matchedCred.client_id || '';
            clientSecret = matchedCred.client_secret || '';
          }
        }

        if (clientId && clientSecret) {
          const curCfg = ctx.google.getConfig();
          ctx.google.saveConfig({
            clientId,
            clientSecret,
            redirectUri:
              curCfg?.redirectUri || 'http://192.168.188.92:8099/api/system/google/callback',
            scopes: tokenObj.scope
              ? String(tokenObj.scope).split(' ')
              : [
                  'https://www.googleapis.com/auth/calendar',
                  'https://www.googleapis.com/auth/calendar.readonly',
                ],
          });
        }

        if (tokenObj.access_token || tokenObj.refresh_token) {
          const expiryDate = tokenObj.expires_at
            ? Number(tokenObj.expires_at) * 1000
            : Date.now() + 3000 * 1000;
          ctx.google.saveTokens({
            accessToken: tokenObj.access_token || '',
            refreshToken: tokenObj.refresh_token,
            expiryDate,
            scope: tokenObj.scope,
            tokenType: tokenObj.token_type || 'Bearer',
          });
          ctx.sharedDb.kvSet('google_oauth_account_email', googleEntry.title || 'Google Calendar');
          return {
            imported: true,
            accountEmail: googleEntry.title || 'Google Account',
            details: `Imported Google OAuth2 credentials & refresh token for ${googleEntry.title || 'Google Calendar'}`,
          };
        }
      } catch (err) {
        console.warn('[google-calendar] Failed reading HA .storage OAuth:', err);
      }
    }
    return { imported: false };
  }

  // Run automatic OAuth bridge on startup so real Google OAuth is immediately active
  trySyncGoogleOAuthFromHomeAssistantStorage();

  function upsertEvent(ev: Omit<CalendarEventRow, 'id'>) {
    ensureCalendarSetting(ev.calendar_name, ev.calendar_name, '', ev.source, 1);
    ctx.db.execute(
      `INSERT INTO calendar_events
       (external_id, calendar_name, title, category, start_time, end_time, duration_minutes, location, description, attendees, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         calendar_name = excluded.calendar_name,
         title = excluded.title,
         category = excluded.category,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         duration_minutes = excluded.duration_minutes,
         location = excluded.location,
         description = excluded.description,
         attendees = CASE WHEN excluded.attendees != '' THEN excluded.attendees ELSE calendar_events.attendees END`,
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
        ev.attendees || '',
        ev.source,
      ]
    );
  }

  function normalizeGoogleEventDates(
    rawStart: string,
    rawEnd: string | undefined,
    isAllDay: boolean
  ): { startDate: Date; endDate: Date; durationMinutes: number } {
    const startDate = new Date(isAllDay ? `${rawStart}T08:00:00` : rawStart);
    let endDate: Date;
    if (isAllDay && rawEnd) {
      const exclusiveEnd = new Date(`${rawEnd}T00:00:00`);
      const daysSpan = Math.max(
        1,
        Math.round(
          (exclusiveEnd.getTime() - new Date(`${rawStart}T00:00:00`).getTime()) / 86400000
        )
      );
      endDate = new Date(
        startDate.getTime() + (daysSpan === 1 ? 10 * 3600000 : (daysSpan * 24 - 12) * 3600000)
      );
    } else if (rawEnd) {
      endDate = new Date(rawEnd);
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }

    const rawDuration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    const durationMinutes = isAllDay
      ? 60
      : Math.max(15, Math.min(720, Number.isFinite(rawDuration) ? rawDuration : 60));

    return { startDate, endDate, durationMinutes };
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

    if (!ctx.google.getStatus().authorized) {
      trySyncGoogleOAuthFromHomeAssistantStorage();
    }

    const startIso = new Date(Date.now() - 7 * 86400000).toISOString();
    const endIso = new Date(Date.now() + 30 * 86400000).toISOString();

    const oauthCalLowerNames = new Set<string>();

    // A) Sync directly via real Google Calendar v3 OAuth2 REST API if authorized
    const oauthStatus = ctx.google.getStatus();
    if (oauthStatus.authorized) {
      try {
        const calListRes = await ctx.google.googleFetch<{
          items?: Array<{
            id: string;
            summary?: string;
            summaryOverride?: string;
            backgroundColor?: string;
            primary?: boolean;
            selected?: boolean;
          }>;
        }>('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader');

        const calItems = calListRes.items || [];
        for (const gCal of calItems) {
          const calTitle = String(gCal.summaryOverride || gCal.summary || gCal.id).trim();
          const lowerTitle = calTitle.toLowerCase();
          oauthCalLowerNames.add(lowerTitle);
          const defaultShow =
            lowerTitle.includes('kalenderwochen') || lowerTitle.includes('feiertage in deutschland')
              ? 0
              : 1;

          ensureCalendarSetting(
            calTitle,
            gCal.id,
            gCal.backgroundColor || '',
            'google_oauth',
            defaultShow
          );

          if (gCal.primary && gCal.id.includes('@')) {
            ctx.sharedDb.kvSet('google_oauth_account_email', gCal.id);
          }

          try {
            const params = new URLSearchParams({
              timeMin: startIso,
              timeMax: endIso,
              singleEvents: 'true',
              orderBy: 'startTime',
              maxResults: '250',
            });
            const evRes = await ctx.google.googleFetch<{
              items?: Array<{
                id: string;
                summary?: string;
                description?: string;
                location?: string;
                status?: string;
                attendees?: Array<{
                  email?: string;
                  displayName?: string;
                  self?: boolean;
                }>;
                organizer?: {
                  email?: string;
                  displayName?: string;
                  self?: boolean;
                };
                start?: { dateTime?: string; date?: string };
                end?: { dateTime?: string; date?: string };
              }>;
            }>(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                gCal.id
              )}/events?${params.toString()}`
            );

            for (const item of evRes.items || []) {
              if (item.status === 'cancelled') continue;
              const rawStart = item.start?.dateTime || item.start?.date;
              const rawEnd = item.end?.dateTime || item.end?.date;
              if (!rawStart || !item.summary) continue;

              const isAllDay = !item.start?.dateTime;
              const { startDate, endDate, durationMinutes } = normalizeGoogleEventDates(
                rawStart,
                rawEnd,
                isAllDay
              );

              const attendeeNames = (item.attendees || [])
                .map((a) => (a.displayName || a.email || '').trim())
                .filter(Boolean);

              const extId = `gcal_${gCal.id}_${item.id}`;
              upsertEvent({
                external_id: extId,
                calendar_name: calTitle,
                title: item.summary,
                category: inferEventCategory(
                  item.summary,
                  item.description || '',
                  'personal',
                  calTitle
                ),
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                duration_minutes: durationMinutes,
                location: item.location || '',
                description: item.description || '',
                attendees: attendeeNames.join(', '),
                source: 'google_oauth',
              });
              oauthSynced++;
            }
          } catch (calFetchErr) {
            errors.push(
              `Google API (${calTitle}): ${
                calFetchErr instanceof Error ? calFetchErr.message : String(calFetchErr)
              }`
            );
          }
        }
      } catch (err) {
        errors.push(`Google OAuth API: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // B) Sync from Home Assistant's connected Google Calendar entities (calendar.*)
    // If OAuth2 already synced a calendar, skip HA duplicate fetch and remove older ha_ rows
    try {
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        const calStates = await ctx.ha.getStates('calendar');

        for (const cal of calStates) {
          if (cal.state === 'unavailable') continue;
          const calName = String(
            cal.attributes?.friendly_name || cal.entity_id.replace('calendar.', '')
          ).trim();
          const lowerName = calName.toLowerCase();

          if (oauthCalLowerNames.has(lowerName)) {
            ctx.db.execute(
              'DELETE FROM calendar_events WHERE LOWER(calendar_name) = LOWER(?) AND external_id LIKE ?',
              [calName, 'ha_%']
            );
            continue;
          }

          const defaultShow =
            lowerName.includes('kalenderwochen') || lowerName.includes('feiertage in deutschland')
              ? 0
              : 1;

          ensureCalendarSetting(calName, cal.entity_id, '', 'google_oauth', defaultShow);

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
              const { startDate, endDate, durationMinutes } = normalizeGoogleEventDates(
                rawStart,
                rawEnd,
                isAllDay
              );

              const extId =
                item.uid ||
                `ha_${cal.entity_id}_${rawStart}_${item.summary.replace(/[^a-z0-9]/gi, '_')}`;

              upsertEvent({
                external_id: extId,
                calendar_name: calName,
                title: item.summary,
                category: inferEventCategory(
                  item.summary,
                  item.description || '',
                  'personal',
                  calName
                ),
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
            errors.push(
              `${cal.entity_id}: ${calErr instanceof Error ? calErr.message : String(calErr)}`
            );
          }
        }
      }
    } catch (err) {
      errors.push(`HA Calendar sync: ${err instanceof Error ? err.message : String(err)}`);
    }

    // C) Sync from any configured Google Calendar iCal (.ics) Feeds
    const feeds = ctx.db.query<CalendarFeedRow>('SELECT * FROM calendar_feeds');
    for (const feed of feeds) {
      try {
        ensureCalendarSetting(feed.name, feed.ics_url, '', 'ics_feed', 1);
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

  function getCalendarsWithCounts() {
    // Ensure any calendar_name in calendar_events has a row in calendar_settings
    const distinctNames = ctx.db.query<{ calendar_name: string; source: string }>(
      'SELECT DISTINCT calendar_name, source FROM calendar_events'
    );
    for (const row of distinctNames) {
      ensureCalendarSetting(row.calendar_name, row.calendar_name, '', row.source || 'google_oauth', 1);
    }

    // Deduplicate case-insensitive calendar_settings entries (e.g. "Thomas.simhofer@gmail.com" vs "thomas.simhofer@gmail.com")
    const rawSettings = ctx.db.query<CalendarSettingRow>(
      'SELECT * FROM calendar_settings ORDER BY calendar_name ASC'
    );
    const counts = ctx.db.query<{ calendar_name: string; cnt: number }>(
      'SELECT calendar_name, COUNT(*) as cnt FROM calendar_events GROUP BY calendar_name'
    );
    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(c.calendar_name, (countMap.get(c.calendar_name) || 0) + Number(c.cnt || 0));
    }

    return rawSettings.map((s) => ({
      calendar_name: s.calendar_name,
      external_cal_id: s.external_cal_id,
      color: s.color || '#38bdf8',
      source: s.source || 'google_oauth',
      show_in_horizon: Boolean(s.show_in_horizon),
      event_count: countMap.get(s.calendar_name) || 0,
    }));
  }

  function getVisibleCalendarEvents(limit = 150): CalendarEventRow[] {
    const calendars = getCalendarsWithCounts();
    const hiddenNames = new Set(
      calendars.filter((c) => !c.show_in_horizon).map((c) => c.calendar_name)
    );
    const all = ctx.db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT ?',
      [limit * 2]
    );
    return all.filter((ev) => !hiddenNames.has(ev.calendar_name)).slice(0, limit);
  }

  async function publishCalendarSensorsAndSharedState() {
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10);

    const visibleEvents = getVisibleCalendarEvents(250);
    const todayEvents = visibleEvents.filter((e) => e.start_time.slice(0, 10) === todayPrefix);
    const nextEvent = visibleEvents.find((e) => e.end_time >= now.toISOString()) || null;

    const totalMinutesToday = todayEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const busyHoursToday = Number((totalMinutesToday / 60).toFixed(1));

    const totalWeeklyHours = Number(
      (visibleEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(1)
    );

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
    const calendars = getCalendarsWithCounts();
    const events = getVisibleCalendarEvents(150);
    const allEvents = db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT 250'
    );
    const feeds = db.query<CalendarFeedRow>('SELECT * FROM calendar_feeds ORDER BY id DESC');

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

    const mealPlannerToday = sharedDb.kvGet<{
      date: string;
      breakfast: string | null;
      lunch: string | null;
      dinner: string | null;
      totalCalories: number;
      totalProtein: number;
    }>('meal_planner_today');

    const oauthStatus = google.getStatus();
    const accountEmail = sharedDb.kvGet<string>('google_oauth_account_email') || null;

    return {
      events,
      allEvents,
      calendars,
      feeds,
      byCategory,
      googleOAuth: {
        ...oauthStatus,
        accountEmail,
      },
      mealPlannerToday: mealPlannerToday || null,
    };
  });

  // List & configure which calendars are shown in the Horizon dashboard
  ctx.route('GET', '/calendars', () => {
    return {
      calendars: getCalendarsWithCounts(),
    };
  });

  ctx.route('POST', '/calendars/visibility', async (req, { db }) => {
    const body = (req.body || {}) as {
      calendar_name?: string;
      show_in_horizon?: boolean;
      calendars?: Record<string, boolean>;
    };

    if (body.calendar_name !== undefined && body.show_in_horizon !== undefined) {
      ensureCalendarSetting(body.calendar_name, '', '', 'google_oauth', body.show_in_horizon ? 1 : 0);
      db.execute(
        'UPDATE calendar_settings SET show_in_horizon = ?, updated_at = ? WHERE calendar_name = ?',
        [body.show_in_horizon ? 1 : 0, new Date().toISOString(), body.calendar_name]
      );
    }

    if (body.calendars && typeof body.calendars === 'object') {
      for (const [calName, visible] of Object.entries(body.calendars)) {
        ensureCalendarSetting(calName, '', '', 'google_oauth', visible ? 1 : 0);
        db.execute(
          'UPDATE calendar_settings SET show_in_horizon = ?, updated_at = ? WHERE calendar_name = ?',
          [visible ? 1 : 0, new Date().toISOString(), calName]
        );
      }
    }

    await publishCalendarSensorsAndSharedState();
    return {
      updated: true,
      calendars: getCalendarsWithCounts(),
      events: getVisibleCalendarEvents(150),
    };
  });

  // Direct Google OAuth2 configuration & token management endpoints
  ctx.route('GET', '/oauth/status', (_req, { google, sharedDb }) => {
    return {
      ...google.getStatus(),
      accountEmail: sharedDb.kvGet<string>('google_oauth_account_email') || null,
    };
  });

  ctx.route('POST', '/oauth/config', async (req, { google }) => {
    const body = (req.body || {}) as {
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
      refreshToken?: string;
      importFromHa?: boolean;
    };

    if (body.importFromHa) {
      const imp = trySyncGoogleOAuthFromHomeAssistantStorage();
      const syncRes = await syncExternalCalendars();
      return {
        ...google.getStatus(),
        importedFromHa: imp.imported,
        accountEmail: imp.accountEmail || null,
        details: imp.details,
        syncRes,
      };
    }

    const status = google.saveConfig({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      redirectUri: body.redirectUri,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.body.read',
        'https://www.googleapis.com/auth/fitness.sleep.read',
      ],
    });

    if (body.refreshToken?.trim()) {
      google.saveTokens({
        accessToken: '',
        refreshToken: body.refreshToken.trim(),
        expiryDate: 0,
      });
      const syncRes = await syncExternalCalendars();
      return { ...google.getStatus(), syncRes };
    }

    return status;
  });

  ctx.route('GET', '/oauth/auth-url', (_req, { google }) => {
    const url = google.getAuthorizationUrl([
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]);
    return { url };
  });

  ctx.route('POST', '/oauth/exchange', async (req, { google }) => {
    const body = (req.body || {}) as { code?: string };
    if (!body.code?.trim()) {
      return { status: 400, body: { error: 'Authorization code is required' } };
    }
    const status = await google.exchangeCode(body.code.trim());
    const syncRes = await syncExternalCalendars();
    return { status, syncRes };
  });

  ctx.route('GET', '/events', () => {
    return { events: getVisibleCalendarEvents(250) };
  });

  // Add manual or quick event (and push to Google Calendar via OAuth2 API or HA)
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
    const targetCalendarName = (body.calendar_name || 'Thomas.simhofer@gmail.com').trim();

    let createdExternalId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Try creating directly via Google Calendar v3 OAuth2 API if authorized
    if (ctx.google.getStatus().authorized) {
      try {
        const setting = ctx.db.queryOne<CalendarSettingRow>(
          'SELECT * FROM calendar_settings WHERE LOWER(calendar_name) = LOWER(?)',
          [targetCalendarName]
        );
        const calId =
          setting?.external_cal_id && !setting.external_cal_id.startsWith('calendar.')
            ? setting.external_cal_id
            : 'primary';
        const created = await ctx.google.googleFetch<{ id?: string }>(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
          {
            method: 'POST',
            body: JSON.stringify({
              summary: body.title.trim(),
              description: (body.description || '').trim(),
              location: (body.location || '').trim(),
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
            }),
          }
        );
        if (created?.id) {
          createdExternalId = `gcal_${calId}_${created.id}`;
        }
      } catch {
        // Fallback to HA service call below
      }
    }

    // 2. Fallback: push to Home Assistant calendar.create_event service if not created via OAuth
    if (createdExternalId.startsWith('manual_')) {
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
    }

    upsertEvent({
      external_id: createdExternalId,
      calendar_name: targetCalendarName,
      title: body.title.trim(),
      category,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      location: (body.location || '').trim(),
      description: (body.description || '').trim(),
      source: createdExternalId.startsWith('gcal_') ? 'google_oauth' : 'manual',
    });

    await publishCalendarSensorsAndSharedState();
    return { created: true, external_id: createdExternalId };
  });

  ctx.route('DELETE', '/events', async (req, { db, actions }) => {
    const id = Number(req.query.id);
    const existing = db.queryOne<{ external_id?: string; calendar_name?: string }>(
      'SELECT external_id, calendar_name FROM calendar_events WHERE id = ?',
      [id]
    );
    let remoteDeleted = false;
    if (existing?.external_id && existing.external_id.startsWith('gcal_')) {
      const googleEventId = existing.external_id.replace(/^gcal_/, '');
      const reg = actions || new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
      const delRes = await reg.execute('gcal.delete_event', {
        calendarId: 'primary',
        eventId: googleEventId,
      });
      remoteDeleted = delRes.status === 'success';
    }
    db.execute('DELETE FROM calendar_events WHERE id = ?', [id]);
    await publishCalendarSensorsAndSharedState();
    return { deleted: id, remoteDeleted };
  });

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
      'Pulls upcoming events from Google Calendar OAuth2 v3 API, Home Assistant Calendars & iCal feeds, filters by Horizon visibility, and publishes HA sensors.',
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const sync = await syncExternalCalendars();
      const ha = await publishCalendarSensorsAndSharedState();
      return `Next: "${ha.nextEvent}" | Today: ${ha.todayEventCount} events (${ha.busyHoursToday}h) | Synced OAuth=${sync.oauthSynced}, HA=${sync.haCalendarSynced}, ICS=${sync.icsSynced}`;
    },
  });
});
