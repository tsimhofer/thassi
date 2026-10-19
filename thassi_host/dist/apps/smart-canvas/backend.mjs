import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/smart-canvas/backend/index.ts
var DEFAULT_TILES = [
  // Zone: Büro OG
  {
    entity_id: "light.buro_og_grosses_licht",
    sub_entity_id: "sensor.links_power",
    custom_label: "B\xFCro Gro\xDFes Licht",
    zone: "B\xFCro OG",
    col_span: 1,
    row_span: 1,
    sort_order: 1,
    pos_x: 40,
    pos_y: 40,
    accent_color: "#facc15",
    icon: "\u{1F4A1}"
  },
  {
    entity_id: "switch.buro_og_regal_lichter",
    sub_entity_id: "sensor.shellyplugsg3_e4b063e4bfd8_power",
    custom_label: "B\xFCro Regal Lichter",
    zone: "B\xFCro OG",
    col_span: 1,
    row_span: 1,
    sort_order: 2,
    pos_x: 280,
    pos_y: 40,
    accent_color: "#fb923c",
    icon: "\u2728"
  },
  {
    entity_id: "switch.buro_og_plug_90",
    sub_entity_id: "sensor.kleines_licht_pumpe_power",
    custom_label: "B\xFCro Plug .90",
    zone: "B\xFCro OG",
    col_span: 1,
    row_span: 1,
    sort_order: 3,
    pos_x: 520,
    pos_y: 40,
    accent_color: "#38bdf8",
    icon: "\u{1F50C}"
  },
  {
    entity_id: "switch.buro_og_bewasserung_pumpe",
    sub_entity_id: "sensor.schalter_neu_power",
    custom_label: "Bew\xE4sserung Pumpe",
    zone: "B\xFCro OG",
    col_span: 1,
    row_span: 1,
    sort_order: 4,
    pos_x: 760,
    pos_y: 40,
    accent_color: "#4ade80",
    icon: "\u{1F331}"
  },
  {
    entity_id: "sensor.shellyhtg3_e4b32331dde0_temperatur",
    sub_entity_id: "sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit",
    custom_label: "Raumklima (Temp & Feuchte)",
    zone: "B\xFCro OG",
    col_span: 2,
    row_span: 1,
    sort_order: 5,
    pos_x: 40,
    pos_y: 190,
    accent_color: "#2dd4bf",
    icon: "\u{1F321}\uFE0F"
  },
  // Zone: Wohnküche
  {
    entity_id: "switch.wohnkueche_bodenbeleuchtung_boden",
    sub_entity_id: "sensor.shelly_plus_2pm_a_switch_0_power",
    custom_label: "Wohnk\xFCche Bodenbeleuchtung",
    zone: "Wohnk\xFCche",
    col_span: 1,
    row_span: 1,
    sort_order: 6,
    pos_x: 520,
    pos_y: 190,
    accent_color: "#facc15",
    icon: "\u{1F506}"
  },
  {
    entity_id: "switch.wohnkueche_fensterbank_licht",
    sub_entity_id: "sensor.bodenbeleuchtung_power",
    custom_label: "Wohnk\xFCche Fensterbank Licht",
    zone: "Wohnk\xFCche",
    col_span: 1,
    row_span: 1,
    sort_order: 7,
    pos_x: 760,
    pos_y: 190,
    accent_color: "#fb923c",
    icon: "\u{1FA9F}"
  },
  // Zone: Vorzimmer, Bad & Gäste
  {
    entity_id: "switch.vorzimmer_og_grosses_licht",
    sub_entity_id: "",
    custom_label: "Vorzimmer Gro\xDFes Licht",
    zone: "Vorzimmer & Bad",
    col_span: 1,
    row_span: 1,
    sort_order: 8,
    pos_x: 40,
    pos_y: 340,
    accent_color: "#facc15",
    icon: "\u{1F4A1}"
  },
  {
    entity_id: "light.vorzimmer_og_bodenbeleuchtung_led",
    sub_entity_id: "",
    custom_label: "Vorzimmer Boden LED",
    zone: "Vorzimmer & Bad",
    col_span: 1,
    row_span: 1,
    sort_order: 9,
    pos_x: 280,
    pos_y: 340,
    accent_color: "#a855f7",
    icon: "\u{1F308}"
  },
  {
    entity_id: "light.vorzimmer_og_alert_led",
    sub_entity_id: "",
    custom_label: "Vorzimmer Alert LED",
    zone: "Vorzimmer & Bad",
    col_span: 1,
    row_span: 1,
    sort_order: 10,
    pos_x: 520,
    pos_y: 340,
    accent_color: "#f43f5e",
    icon: "\u{1F6A8}"
  },
  {
    entity_id: "switch.shelly1pmminig4_7c2c676dc6fc",
    sub_entity_id: "sensor.shelly1pmminig4_7c2c676dc6fc_leistung",
    custom_label: "Waschmaschine Bad OG",
    zone: "Vorzimmer & Bad",
    col_span: 1,
    row_span: 1,
    sort_order: 11,
    pos_x: 760,
    pos_y: 340,
    accent_color: "#38bdf8",
    icon: "\u{1F9FA}"
  },
  // Zone: Thassi Life Hub
  {
    entity_id: "sensor.thassi_meal_planner_todays_dinner",
    sub_entity_id: "sensor.thassi_meal_planner_todays_calories",
    custom_label: "Today's Planned Dinner",
    zone: "Thassi Life Hub",
    col_span: 2,
    row_span: 1,
    sort_order: 12,
    pos_x: 40,
    pos_y: 490,
    accent_color: "#fb923c",
    icon: "\u{1F372}"
  },
  {
    entity_id: "sensor.thassi_google_calendar_next_event",
    sub_entity_id: "sensor.thassi_google_calendar_today_events",
    custom_label: "Next Calendar Event",
    zone: "Thassi Life Hub",
    col_span: 2,
    row_span: 1,
    sort_order: 13,
    pos_x: 520,
    pos_y: 490,
    accent_color: "#38bdf8",
    icon: "\u{1F4C5}"
  }
];
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_tiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id TEXT NOT NULL,
      sub_entity_id TEXT NOT NULL DEFAULT '',
      custom_label TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT 'General',
      col_span INTEGER NOT NULL DEFAULT 1,
      row_span INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pos_x INTEGER NOT NULL DEFAULT 40,
      pos_y INTEGER NOT NULL DEFAULT 40,
      accent_color TEXT NOT NULL DEFAULT '#38bdf8',
      icon TEXT NOT NULL DEFAULT '\u{1F4A1}'
    );
  `);
  function seedDefaultLayoutIfEmpty() {
    const cnt = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM canvas_tiles")?.cnt ?? 0;
    if (cnt === 0) {
      for (const t of DEFAULT_TILES) {
        ctx.db.execute(
          `INSERT INTO canvas_tiles
           (entity_id, sub_entity_id, custom_label, zone, col_span, row_span, sort_order, pos_x, pos_y, accent_color, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.entity_id,
            t.sub_entity_id,
            t.custom_label,
            t.zone,
            t.col_span,
            t.row_span,
            t.sort_order,
            t.pos_x,
            t.pos_y,
            t.accent_color,
            t.icon
          ]
        );
      }
    }
  }
  seedDefaultLayoutIfEmpty();
  ctx.route("GET", "/board", async (_req, { db, ha }) => {
    const tiles = db.query(
      "SELECT * FROM canvas_tiles ORDER BY sort_order ASC, id ASC"
    );
    let states = [];
    let haConnected = false;
    try {
      states = await ha.getStates();
      haConnected = true;
    } catch {
      haConnected = false;
    }
    const stateMap = {};
    for (const st of states) {
      stateMap[st.entity_id] = st;
    }
    return {
      tiles,
      stateMap,
      haConnected
    };
  });
  ctx.route("POST", "/tiles", (req, { db }) => {
    const body = req.body || {};
    if (!body.entity_id?.trim()) {
      return { status: 400, body: { error: "entity_id is required" } };
    }
    const maxOrder = db.queryOne("SELECT COALESCE(MAX(sort_order), 0) as m FROM canvas_tiles")?.m ?? 0;
    const res = db.execute(
      `INSERT INTO canvas_tiles
       (entity_id, sub_entity_id, custom_label, zone, col_span, row_span, sort_order, pos_x, pos_y, accent_color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.entity_id.trim(),
        (body.sub_entity_id || "").trim(),
        (body.custom_label || body.entity_id).trim(),
        (body.zone || "B\xFCro OG").trim(),
        Number(body.col_span || 1),
        Number(body.row_span || 1),
        maxOrder + 1,
        Number(body.pos_x ?? 60),
        Number(body.pos_y ?? 60),
        body.accent_color || "#38bdf8",
        body.icon || "\u{1F4A1}"
      ]
    );
    return { id: res.lastInsertRowid };
  });
  ctx.route("PUT", "/tiles", (req, { db }) => {
    const body = req.body || {};
    if (!body.id) {
      return { status: 400, body: { error: "Tile id is required" } };
    }
    const existing = db.queryOne("SELECT * FROM canvas_tiles WHERE id = ?", [
      Number(body.id)
    ]);
    if (!existing) {
      return { status: 404, body: { error: "Tile not found" } };
    }
    db.execute(
      `UPDATE canvas_tiles
       SET entity_id = ?,
           sub_entity_id = ?,
           custom_label = ?,
           zone = ?,
           col_span = ?,
           row_span = ?,
           sort_order = ?,
           pos_x = ?,
           pos_y = ?,
           accent_color = ?,
           icon = ?
       WHERE id = ?`,
      [
        body.entity_id ?? existing.entity_id,
        body.sub_entity_id ?? existing.sub_entity_id,
        body.custom_label ?? existing.custom_label,
        body.zone ?? existing.zone,
        Number(body.col_span ?? existing.col_span),
        Number(body.row_span ?? existing.row_span),
        Number(body.sort_order ?? existing.sort_order),
        Math.round(Number(body.pos_x ?? existing.pos_x)),
        Math.round(Number(body.pos_y ?? existing.pos_y)),
        body.accent_color ?? existing.accent_color,
        body.icon ?? existing.icon,
        Number(body.id)
      ]
    );
    return { updated: body.id };
  });
  ctx.route("POST", "/tiles/reorder", (req, { db }) => {
    const body = req.body || {};
    if (!Array.isArray(body.updates)) {
      return { status: 400, body: { error: "updates array is required" } };
    }
    db.exec("BEGIN TRANSACTION;");
    try {
      for (const u of body.updates) {
        if (u.pos_x !== void 0 && u.pos_y !== void 0) {
          db.execute("UPDATE canvas_tiles SET pos_x = ?, pos_y = ? WHERE id = ?", [
            Math.round(u.pos_x),
            Math.round(u.pos_y),
            Number(u.id)
          ]);
        }
        if (u.sort_order !== void 0 && u.zone !== void 0) {
          db.execute("UPDATE canvas_tiles SET sort_order = ?, zone = ? WHERE id = ?", [
            Number(u.sort_order),
            u.zone,
            Number(u.id)
          ]);
        } else if (u.sort_order !== void 0) {
          db.execute("UPDATE canvas_tiles SET sort_order = ? WHERE id = ?", [
            Number(u.sort_order),
            Number(u.id)
          ]);
        }
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
    return { reordered: body.updates.length };
  });
  ctx.route("DELETE", "/tiles", (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM canvas_tiles WHERE id = ?", [id]);
    return { deleted: id };
  });
  ctx.route("POST", "/tiles/reset-defaults", (_req, { db }) => {
    db.execute("DELETE FROM canvas_tiles");
    seedDefaultLayoutIfEmpty();
    return { reset: true };
  });
  ctx.route("POST", "/toggle", async (req, { ha }) => {
    const body = req.body || {};
    if (!body.entity_id) {
      return { status: 400, body: { error: "entity_id is required" } };
    }
    const domain = body.entity_id.split(".")[0];
    const toggleDomains = ["light", "switch", "input_boolean", "fan", "automation"];
    const targetDomain = toggleDomains.includes(domain) ? domain : "homeassistant";
    const service = body.action || "toggle";
    const serviceData = { entity_id: body.entity_id };
    if (domain === "light" && body.brightness_pct !== void 0) {
      serviceData.brightness_pct = Number(body.brightness_pct);
    }
    await ha.callService(targetDomain, service, serviceData);
    const updatedState = await ha.getState(body.entity_id).catch(() => null);
    return { toggled: body.entity_id, state: updatedState };
  });
});
export {
  index_default as default
};
