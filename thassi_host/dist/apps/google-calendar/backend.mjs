// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/google-calendar/backend/index.ts
function inferEventCategory(title, description = "", fallback = "personal", calendarName = "") {
  const text = `${title} ${description} ${calendarName}`.toLowerCase();
  if (/gym|workout|run|fitness|yoga|swim|cycling|doctor|dentist|health|sleep|gesundheit|therapie|arzt|hautarzt|gyn|zahnarzt|periode/.test(text)) {
    return "health";
  }
  if (/focus|deep work|vibe coding|coding|study|architecture|research|tu-termine|innox/.test(text)) {
    return "focus";
  }
  if (/arbeiten|standup|sprint|meeting|sync|1:1|client|review|retro|planning|call|work|office|buero|büro/.test(text)) {
    return "work";
  }
  if (/dinner|lunch|breakfast|meal|cooking|brunch|restaurant|mittagessen|abendessen|frühstück|essen/.test(text)) {
    return "meals";
  }
  if (/birthday|geburtstag|party|friends|family|familie|oma|opa|concert|movie|kino|drinks|hangout|budapest|fightzustand|urlaub/.test(text)) {
    return "social";
  }
  return fallback;
}
function parseIcsDate(raw) {
  const val = raw.trim();
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, year, month, day, hh, mm, ss, isUtc] = m;
  if (!hh) {
    return /* @__PURE__ */ new Date(`${year}-${month}-${day}T09:00:00`);
  }
  if (isUtc === "Z") {
    return /* @__PURE__ */ new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}Z`);
  }
  return /* @__PURE__ */ new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}`);
}
function parseIcsFeed(icsText, calendarName, defaultCategory = "personal") {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const results = [];
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0] || "";
    const lines = body.split(/\r?\n/);
    let uid = "";
    let summary = "";
    let description = "";
    let location = "";
    let dtStart = null;
    let dtEnd = null;
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx <= 0) continue;
      const keyPart = line.slice(0, colonIdx).toUpperCase();
      const valPart = line.slice(colonIdx + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",").trim();
      if (keyPart === "UID") uid = valPart;
      else if (keyPart.startsWith("SUMMARY")) summary = valPart;
      else if (keyPart.startsWith("DESCRIPTION")) description = valPart;
      else if (keyPart.startsWith("LOCATION")) location = valPart;
      else if (keyPart.startsWith("DTSTART")) dtStart = parseIcsDate(valPart);
      else if (keyPart.startsWith("DTEND")) dtEnd = parseIcsDate(valPart);
    }
    if (!summary || !dtStart) continue;
    const end = dtEnd && dtEnd > dtStart ? dtEnd : new Date(dtStart.getTime() + 60 * 60 * 1e3);
    const durationMinutes = Math.max(5, Math.round((end.getTime() - dtStart.getTime()) / 6e4));
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
      source: "ics_feed"
    });
  }
  return results;
}
var index_default = defineThassiApp((ctx) => {
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
  ctx.db.execute("DELETE FROM calendar_events WHERE external_id LIKE 'seed_%'");
  function upsertEvent(ev) {
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
        ev.source
      ]
    );
  }
  async function syncExternalCalendars() {
    let haCalendarSynced = 0;
    let oauthSynced = 0;
    let icsSynced = 0;
    const errors = [];
    try {
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        const calStates = await ctx.ha.getStates("calendar");
        const startIso = new Date(Date.now() - 7 * 864e5).toISOString();
        const endIso = new Date(Date.now() + 30 * 864e5).toISOString();
        for (const cal of calStates) {
          if (cal.state === "unavailable" || cal.entity_id === "calendar.kalenderwochen" || cal.entity_id === "calendar.feiertage_in_deutschland") {
            continue;
          }
          const calName = String(cal.attributes?.friendly_name || cal.entity_id.replace("calendar.", "")).trim();
          try {
            const endpoint = `/calendars/${encodeURIComponent(cal.entity_id)}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
            const items = typeof ctx.ha.getCalendarEvents === "function" ? await ctx.ha.getCalendarEvents(cal.entity_id, startIso, endIso) : await ctx.ha.request(endpoint);
            for (const item of items) {
              const rawStart = item.start?.dateTime || item.start?.date;
              const rawEnd = item.end?.dateTime || item.end?.date;
              if (!rawStart || !item.summary) continue;
              const isAllDay = !item.start?.dateTime;
              const startDate = new Date(isAllDay ? `${rawStart}T08:00:00` : rawStart);
              let endDate;
              if (isAllDay && rawEnd) {
                const exclusiveEnd = /* @__PURE__ */ new Date(`${rawEnd}T00:00:00`);
                const daysSpan = Math.max(
                  1,
                  Math.round(
                    (exclusiveEnd.getTime() - (/* @__PURE__ */ new Date(`${rawStart}T00:00:00`)).getTime()) / 864e5
                  )
                );
                endDate = new Date(
                  startDate.getTime() + (daysSpan === 1 ? 10 * 36e5 : (daysSpan * 24 - 12) * 36e5)
                );
              } else if (rawEnd) {
                endDate = new Date(rawEnd);
              } else {
                endDate = new Date(startDate.getTime() + 60 * 60 * 1e3);
              }
              const rawDuration = Math.round((endDate.getTime() - startDate.getTime()) / 6e4);
              const durationMinutes = isAllDay ? 60 : Math.max(15, Math.min(720, Number.isFinite(rawDuration) ? rawDuration : 60));
              const extId = item.uid || `ha_${cal.entity_id}_${rawStart}_${item.summary.replace(/[^a-z0-9]/gi, "_")}`;
              upsertEvent({
                external_id: extId,
                calendar_name: calName,
                title: item.summary,
                category: inferEventCategory(item.summary, item.description || "", "personal", calName),
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                duration_minutes: durationMinutes,
                location: item.location || "",
                description: item.description || "",
                source: "google_oauth"
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
    const oauthStatus = ctx.google.getStatus();
    if (oauthStatus.authorized) {
      try {
        const gEvents = await ctx.google.fetchUpcomingCalendarEvents(50);
        for (const item of gEvents) {
          const start = new Date(item.start);
          const end = item.end ? new Date(item.end) : new Date(start.getTime() + 60 * 60 * 1e3);
          const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 6e4));
          upsertEvent({
            external_id: `gcal_${item.id}`,
            calendar_name: "Google Calendar (OAuth)",
            title: item.summary,
            category: inferEventCategory(item.summary, item.description || ""),
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            duration_minutes: Number.isFinite(duration) ? duration : 60,
            location: item.location || "",
            description: item.description || "",
            source: "google_oauth"
          });
          oauthSynced++;
        }
      } catch (err) {
        errors.push(`Google OAuth sync: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const feeds = ctx.db.query("SELECT * FROM calendar_feeds");
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
          feed.default_category || "personal"
        );
        for (const ev of parsed) {
          upsertEvent(ev);
          icsSynced++;
        }
        ctx.db.execute("UPDATE calendar_feeds SET last_synced_at = ? WHERE id = ?", [
          (/* @__PURE__ */ new Date()).toISOString(),
          feed.id
        ]);
      } catch (err) {
        errors.push(`Feed "${feed.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await publishCalendarSensorsAndSharedState();
    return { haCalendarSynced, oauthSynced, icsSynced, errors };
  }
  async function publishCalendarSensorsAndSharedState() {
    const now = /* @__PURE__ */ new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const todayEvents = ctx.db.query(
      "SELECT * FROM calendar_events WHERE substr(start_time, 1, 10) = ? ORDER BY start_time ASC",
      [todayPrefix]
    );
    const nextEvent = ctx.db.queryOne(
      "SELECT * FROM calendar_events WHERE end_time >= ? ORDER BY start_time ASC LIMIT 1",
      [now.toISOString()]
    );
    const totalMinutesToday = todayEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const busyHoursToday = Number((totalMinutesToday / 60).toFixed(1));
    const allEvents = ctx.db.query("SELECT * FROM calendar_events");
    const totalWeeklyHours = Number(
      (allEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(1)
    );
    ctx.sharedDb.kvSet("google_calendar_today", {
      date: todayPrefix,
      todayEventCount: todayEvents.length,
      busyHoursToday,
      nextEventTitle: nextEvent?.title || "No upcoming events",
      nextEventStart: nextEvent?.start_time || null,
      updatedAt: now.toISOString()
    });
    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor("next_event", nextEvent?.title || "None Scheduled", {
        friendly_name: "Next Calendar Event",
        icon: "mdi:calendar-star",
        start_time: nextEvent?.start_time || null,
        end_time: nextEvent?.end_time || null,
        category: nextEvent?.category || null,
        location: nextEvent?.location || "",
        calendar_name: nextEvent?.calendar_name || ""
      });
      await ctx.ha.publishSensor("today_events", todayEvents.length, {
        friendly_name: "Today's Calendar Events",
        unit_of_measurement: "events",
        icon: "mdi:calendar-today",
        busy_hours_today: busyHoursToday,
        schedule_load: busyHoursToday >= 5 ? "heavy" : busyHoursToday >= 2.5 ? "moderate" : "light"
      });
      await ctx.ha.publishSensor("scheduled_hours", totalWeeklyHours, {
        friendly_name: "Total Scheduled Calendar Hours",
        unit_of_measurement: "h",
        icon: "mdi:clock-check-outline"
      });
    }
    return {
      todayEventCount: todayEvents.length,
      busyHoursToday,
      nextEvent: nextEvent?.title || "None Scheduled",
      totalWeeklyHours,
      haConnected: haStatus.connected
    };
  }
  ctx.route("GET", "/dashboard", (_req, { db, sharedDb, google }) => {
    const events = db.query(
      "SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT 100"
    );
    const feeds = db.query("SELECT * FROM calendar_feeds ORDER BY id DESC");
    const byCategory = db.query(`
      SELECT
        category,
        COUNT(*) as event_count,
        SUM(duration_minutes) as total_minutes,
        ROUND(SUM(duration_minutes) / 60.0, 1) as total_hours
      FROM calendar_events
      GROUP BY category
      ORDER BY total_minutes DESC
    `);
    const mealPlannerToday = sharedDb.kvGet("meal_planner_today");
    return {
      events,
      feeds,
      byCategory,
      googleOAuth: google.getStatus(),
      mealPlannerToday: mealPlannerToday || null
    };
  });
  ctx.route("GET", "/events", (_req, { db }) => {
    const events = db.query(
      "SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT 250"
    );
    return { events };
  });
  ctx.route("POST", "/events", async (req) => {
    const body = req.body || {};
    if (!body.title?.trim() || !body.start_time) {
      return { status: 400, body: { error: "Event title and start_time are required" } };
    }
    const start = new Date(body.start_time);
    const duration = Math.max(5, Number(body.duration_minutes || 60));
    const end = new Date(start.getTime() + duration * 6e4);
    const category = body.category || inferEventCategory(body.title, body.description || "", "personal");
    upsertEvent({
      external_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      calendar_name: (body.calendar_name || "Thomas.simhofer@gmail.com").trim(),
      title: body.title.trim(),
      category,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      location: (body.location || "").trim(),
      description: (body.description || "").trim(),
      source: "manual"
    });
    try {
      await ctx.ha.callService("calendar", "create_event", {
        entity_id: "calendar.thomas_simhofer_gmail_com",
        summary: body.title.trim(),
        description: (body.description || "").trim(),
        location: (body.location || "").trim(),
        start_date_time: start.toISOString(),
        end_date_time: end.toISOString()
      });
    } catch {
    }
    await publishCalendarSensorsAndSharedState();
    return { created: true };
  });
  ctx.route("DELETE", "/events", async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM calendar_events WHERE id = ?", [id]);
    await publishCalendarSensorsAndSharedState();
    return { deleted: id };
  });
  ctx.route("POST", "/feeds", async (req, { db }) => {
    const body = req.body || {};
    if (!body.name?.trim() || !body.ics_url?.trim()) {
      return { status: 400, body: { error: "Calendar name and iCal (.ics) URL are required" } };
    }
    db.execute(
      `INSERT INTO calendar_feeds (name, ics_url, default_category)
       VALUES (?, ?, ?)
       ON CONFLICT(ics_url) DO UPDATE SET name = excluded.name, default_category = excluded.default_category`,
      [body.name.trim(), body.ics_url.trim(), body.default_category || "personal"]
    );
    const syncRes = await syncExternalCalendars();
    return { added: true, syncRes };
  });
  ctx.route("DELETE", "/feeds", (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM calendar_feeds WHERE id = ?", [id]);
    return { deleted: id };
  });
  ctx.route("POST", "/sync", async () => {
    const syncRes = await syncExternalCalendars();
    const sensorRes = await publishCalendarSensorsAndSharedState();
    return { ...syncRes, ...sensorRes };
  });
  ctx.scheduleJob({
    id: "sync-google-calendar",
    name: "Sync Google Calendar & Publish HA Sensors",
    description: "Pulls upcoming events from Home Assistant Google Calendars, Google OAuth2 & iCal feeds, updates time-allocation stats, and publishes sensor.thassi_google_calendar_next_event.",
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const sync = await syncExternalCalendars();
      const ha = await publishCalendarSensorsAndSharedState();
      return `Next: "${ha.nextEvent}" | Today: ${ha.todayEventCount} events (${ha.busyHoursToday}h) | Synced HA=${sync.haCalendarSynced}, OAuth=${sync.oauthSynced}, ICS=${sync.icsSynced}`;
    }
  });
});
export {
  index_default as default,
  inferEventCategory,
  parseIcsFeed
};
