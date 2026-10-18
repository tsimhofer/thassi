// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/google-calendar/backend/index.ts
function inferEventCategory(title, description = "", fallback = "personal") {
  const text = `${title} ${description}`.toLowerCase();
  if (/gym|workout|run|fitness|yoga|swim|cycling|doctor|dentist|health|sleep/.test(text)) {
    return "health";
  }
  if (/focus|deep work|coding|study|architecture|research/.test(text)) {
    return "focus";
  }
  if (/standup|sprint|meeting|sync|1:1|client|review|retro|planning|call|work|office/.test(text)) {
    return "work";
  }
  if (/dinner|lunch|breakfast|meal|cooking|brunch|restaurant/.test(text)) {
    return "meals";
  }
  if (/birthday|party|friends|family|concert|movie|drinks|hangout/.test(text)) {
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
function createSeedEvents() {
  const now = /* @__PURE__ */ new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const makeIso = (dayOffset, hour, minute = 0) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  return [
    {
      external_id: "seed_1",
      calendar_name: "Work Calendar",
      title: "Engineering Architecture Sync",
      category: "work",
      start_time: makeIso(0, 10, 0),
      end_time: makeIso(0, 11, 0),
      duration_minutes: 60,
      location: "Google Meet",
      description: "Weekly system design and sprint alignment.",
      source: "manual"
    },
    {
      external_id: "seed_2",
      calendar_name: "Personal",
      title: "Deep Work: Home Assistant & TypeScript Hub",
      category: "focus",
      start_time: makeIso(0, 14, 0),
      end_time: makeIso(0, 16, 30),
      duration_minutes: 150,
      location: "Home Office",
      description: "Building custom data analytics & smart home workflow.",
      source: "manual"
    },
    {
      external_id: "seed_3",
      calendar_name: "Health & Fitness",
      title: "Evening Strength & Mobility Session",
      category: "health",
      start_time: makeIso(0, 18, 0),
      end_time: makeIso(0, 19, 15),
      duration_minutes: 75,
      location: "Fitness Studio",
      description: "Upper body + 15 min zone 2 cardio.",
      source: "manual"
    },
    {
      external_id: "seed_4",
      calendar_name: "Work Calendar",
      title: "Product Roadmap & Q4 Planning",
      category: "work",
      start_time: makeIso(1, 9, 30),
      end_time: makeIso(1, 11, 0),
      duration_minutes: 90,
      location: "Conference Room A / Meet",
      description: "Reviewing milestones and resource allocation.",
      source: "manual"
    },
    {
      external_id: "seed_5",
      calendar_name: "Personal",
      title: "Friends Dinner & Board Games",
      category: "social",
      start_time: makeIso(2, 19, 30),
      end_time: makeIso(2, 22, 30),
      duration_minutes: 180,
      location: "Downtown",
      description: "Catching up over dinner.",
      source: "manual"
    }
  ];
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
  const existingCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM calendar_events")?.cnt ?? 0;
  if (existingCount === 0) {
    for (const ev of createSeedEvents()) {
      ctx.db.execute(
        `INSERT OR IGNORE INTO calendar_events
         (external_id, calendar_name, title, category, start_time, end_time, duration_minutes, location, description, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }
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
    let oauthSynced = 0;
    let icsSynced = 0;
    const errors = [];
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
    return { oauthSynced, icsSynced, errors };
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
      calendar_name: (body.calendar_name || "Personal").trim(),
      title: body.title.trim(),
      category,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      location: (body.location || "").trim(),
      description: (body.description || "").trim(),
      source: "manual"
    });
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
    description: "Pulls upcoming events from Google OAuth2 & iCal feeds, updates time-allocation stats, and publishes sensor.thassi_google_calendar_next_event.",
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const sync = await syncExternalCalendars();
      const ha = await publishCalendarSensorsAndSharedState();
      return `Next: "${ha.nextEvent}" | Today: ${ha.todayEventCount} events (${ha.busyHoursToday}h) | Synced OAuth=${sync.oauthSynced}, ICS=${sync.icsSynced}`;
    }
  });
});
export {
  index_default as default,
  inferEventCategory,
  parseIcsFeed
};
