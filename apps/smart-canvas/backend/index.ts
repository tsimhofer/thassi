import { defineThassiApp, type HaEntityState } from '@thassi/sdk';

export interface CanvasTile {
  id: number;
  entity_id: string;
  /** Optional paired sub-entity (e.g. Shelly Wattage sensor `sensor.*_power` or humidity sensor) */
  sub_entity_id: string;
  custom_label: string;
  zone: string;
  col_span: number; // 1 or 2
  row_span: number; // 1 or 2
  sort_order: number;
  pos_x: number; // Freeform 2D canvas X (px)
  pos_y: number; // Freeform 2D canvas Y (px)
  accent_color: string;
  icon: string;
}

const DEFAULT_TILES: Array<Omit<CanvasTile, 'id'>> = [
  // Zone: Büro OG
  {
    entity_id: 'light.buro_og_grosses_licht',
    sub_entity_id: 'sensor.links_power',
    custom_label: 'Büro Großes Licht',
    zone: 'Büro OG',
    col_span: 1,
    row_span: 1,
    sort_order: 1,
    pos_x: 40,
    pos_y: 40,
    accent_color: '#facc15',
    icon: '💡',
  },
  {
    entity_id: 'switch.buro_og_regal_lichter',
    sub_entity_id: 'sensor.shellyplugsg3_e4b063e4bfd8_power',
    custom_label: 'Büro Regal Lichter',
    zone: 'Büro OG',
    col_span: 1,
    row_span: 1,
    sort_order: 2,
    pos_x: 280,
    pos_y: 40,
    accent_color: '#fb923c',
    icon: '✨',
  },
  {
    entity_id: 'switch.buro_og_plug_90',
    sub_entity_id: 'sensor.kleines_licht_pumpe_power',
    custom_label: 'Büro Plug .90',
    zone: 'Büro OG',
    col_span: 1,
    row_span: 1,
    sort_order: 3,
    pos_x: 520,
    pos_y: 40,
    accent_color: '#38bdf8',
    icon: '🔌',
  },
  {
    entity_id: 'switch.buro_og_bewasserung_pumpe',
    sub_entity_id: 'sensor.schalter_neu_power',
    custom_label: 'Bewässerung Pumpe',
    zone: 'Büro OG',
    col_span: 1,
    row_span: 1,
    sort_order: 4,
    pos_x: 760,
    pos_y: 40,
    accent_color: '#4ade80',
    icon: '🌱',
  },
  {
    entity_id: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
    sub_entity_id: 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
    custom_label: 'Raumklima (Temp & Feuchte)',
    zone: 'Büro OG',
    col_span: 2,
    row_span: 1,
    sort_order: 5,
    pos_x: 40,
    pos_y: 190,
    accent_color: '#2dd4bf',
    icon: '🌡️',
  },

  // Zone: Wohnküche
  {
    entity_id: 'switch.wohnkueche_bodenbeleuchtung_boden',
    sub_entity_id: 'sensor.shelly_plus_2pm_a_switch_0_power',
    custom_label: 'Wohnküche Bodenbeleuchtung',
    zone: 'Wohnküche',
    col_span: 1,
    row_span: 1,
    sort_order: 6,
    pos_x: 520,
    pos_y: 190,
    accent_color: '#facc15',
    icon: '🔆',
  },
  {
    entity_id: 'switch.wohnkueche_fensterbank_licht',
    sub_entity_id: 'sensor.bodenbeleuchtung_power',
    custom_label: 'Wohnküche Fensterbank Licht',
    zone: 'Wohnküche',
    col_span: 1,
    row_span: 1,
    sort_order: 7,
    pos_x: 760,
    pos_y: 190,
    accent_color: '#fb923c',
    icon: '🪟',
  },

  // Zone: Vorzimmer, Bad & Gäste
  {
    entity_id: 'switch.vorzimmer_og_grosses_licht',
    sub_entity_id: '',
    custom_label: 'Vorzimmer Großes Licht',
    zone: 'Vorzimmer & Bad',
    col_span: 1,
    row_span: 1,
    sort_order: 8,
    pos_x: 40,
    pos_y: 340,
    accent_color: '#facc15',
    icon: '💡',
  },
  {
    entity_id: 'light.vorzimmer_og_bodenbeleuchtung_led',
    sub_entity_id: '',
    custom_label: 'Vorzimmer Boden LED',
    zone: 'Vorzimmer & Bad',
    col_span: 1,
    row_span: 1,
    sort_order: 9,
    pos_x: 280,
    pos_y: 340,
    accent_color: '#a855f7',
    icon: '🌈',
  },
  {
    entity_id: 'light.vorzimmer_og_alert_led',
    sub_entity_id: '',
    custom_label: 'Vorzimmer Alert LED',
    zone: 'Vorzimmer & Bad',
    col_span: 1,
    row_span: 1,
    sort_order: 10,
    pos_x: 520,
    pos_y: 340,
    accent_color: '#f43f5e',
    icon: '🚨',
  },
  {
    entity_id: 'switch.shelly1pmminig4_7c2c676dc6fc',
    sub_entity_id: 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung',
    custom_label: 'Waschmaschine Bad OG',
    zone: 'Vorzimmer & Bad',
    col_span: 1,
    row_span: 1,
    sort_order: 11,
    pos_x: 760,
    pos_y: 340,
    accent_color: '#38bdf8',
    icon: '🧺',
  },

  // Zone: Thassi Life Hub
  {
    entity_id: 'sensor.thassi_meal_planner_todays_dinner',
    sub_entity_id: 'sensor.thassi_meal_planner_todays_calories',
    custom_label: "Today's Planned Dinner",
    zone: 'Thassi Life Hub',
    col_span: 2,
    row_span: 1,
    sort_order: 12,
    pos_x: 40,
    pos_y: 490,
    accent_color: '#fb923c',
    icon: '🍲',
  },
  {
    entity_id: 'sensor.thassi_google_calendar_next_event',
    sub_entity_id: 'sensor.thassi_google_calendar_today_events',
    custom_label: 'Next Calendar Event',
    zone: 'Thassi Life Hub',
    col_span: 2,
    row_span: 1,
    sort_order: 13,
    pos_x: 520,
    pos_y: 490,
    accent_color: '#38bdf8',
    icon: '📅',
  },
];

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Layout Table
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
      icon TEXT NOT NULL DEFAULT '💡'
    );
  `);

  function seedDefaultLayoutIfEmpty() {
    const cnt = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM canvas_tiles')?.cnt ?? 0;
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
            t.icon,
          ]
        );
      }
    }
  }
  seedDefaultLayoutIfEmpty();

  // 2. API Routes (/api/apps/smart-canvas/*)

  // Return all configured tiles + live Home Assistant entity states
  ctx.route('GET', '/board', async (_req, { db, ha }) => {
    const tiles = db.query<CanvasTile>(
      'SELECT * FROM canvas_tiles ORDER BY sort_order ASC, id ASC'
    );

    let states: HaEntityState[] = [];
    let haConnected = false;
    try {
      states = await ha.getStates();
      haConnected = true;
    } catch {
      haConnected = false;
    }

    const stateMap: Record<string, HaEntityState> = {};
    for (const st of states) {
      stateMap[st.entity_id] = st;
    }

    return {
      tiles,
      stateMap,
      haConnected,
    };
  });

  // Add a new entity tile to the canvas
  ctx.route('POST', '/tiles', (req, { db }) => {
    const body = (req.body || {}) as Partial<CanvasTile>;
    if (!body.entity_id?.trim()) {
      return { status: 400, body: { error: 'entity_id is required' } };
    }
    const maxOrder =
      db.queryOne<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) as m FROM canvas_tiles')?.m ?? 0;

    const res = db.execute(
      `INSERT INTO canvas_tiles
       (entity_id, sub_entity_id, custom_label, zone, col_span, row_span, sort_order, pos_x, pos_y, accent_color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.entity_id.trim(),
        (body.sub_entity_id || '').trim(),
        (body.custom_label || body.entity_id).trim(),
        (body.zone || 'Büro OG').trim(),
        Number(body.col_span || 1),
        Number(body.row_span || 1),
        maxOrder + 1,
        Number(body.pos_x ?? 60),
        Number(body.pos_y ?? 60),
        body.accent_color || '#38bdf8',
        body.icon || '💡',
      ]
    );
    return { id: res.lastInsertRowid };
  });

  // Update a single tile (label, zone, size, color, sub_entity_id, XY position)
  ctx.route('PUT', '/tiles', (req, { db }) => {
    const body = (req.body || {}) as Partial<CanvasTile>;
    if (!body.id) {
      return { status: 400, body: { error: 'Tile id is required' } };
    }
    const existing = db.queryOne<CanvasTile>('SELECT * FROM canvas_tiles WHERE id = ?', [
      Number(body.id),
    ]);
    if (!existing) {
      return { status: 404, body: { error: 'Tile not found' } };
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
        Number(body.id),
      ]
    );
    return { updated: body.id };
  });

  // Bulk reorder / move tiles across zones or update XY coordinates
  ctx.route('POST', '/tiles/reorder', (req, { db }) => {
    const body = (req.body || {}) as {
      updates?: Array<{ id: number; sort_order?: number; zone?: string; pos_x?: number; pos_y?: number }>;
    };
    if (!Array.isArray(body.updates)) {
      return { status: 400, body: { error: 'updates array is required' } };
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const u of body.updates) {
        if (u.pos_x !== undefined && u.pos_y !== undefined) {
          db.execute('UPDATE canvas_tiles SET pos_x = ?, pos_y = ? WHERE id = ?', [
            Math.round(u.pos_x),
            Math.round(u.pos_y),
            Number(u.id),
          ]);
        }
        if (u.sort_order !== undefined && u.zone !== undefined) {
          db.execute('UPDATE canvas_tiles SET sort_order = ?, zone = ? WHERE id = ?', [
            Number(u.sort_order),
            u.zone,
            Number(u.id),
          ]);
        } else if (u.sort_order !== undefined) {
          db.execute('UPDATE canvas_tiles SET sort_order = ? WHERE id = ?', [
            Number(u.sort_order),
            Number(u.id),
          ]);
        }
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return { reordered: body.updates.length };
  });

  ctx.route('DELETE', '/tiles', (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM canvas_tiles WHERE id = ?', [id]);
    return { deleted: id };
  });

  ctx.route('POST', '/tiles/reset-defaults', (_req, { db }) => {
    db.execute('DELETE FROM canvas_tiles');
    seedDefaultLayoutIfEmpty();
    return { reset: true };
  });

  // Toggle or control a Home Assistant entity directly
  ctx.route('POST', '/toggle', async (req, { ha }) => {
    const body = (req.body || {}) as {
      entity_id?: string;
      action?: 'toggle' | 'turn_on' | 'turn_off';
      brightness_pct?: number;
    };
    if (!body.entity_id) {
      return { status: 400, body: { error: 'entity_id is required' } };
    }

    const domain = body.entity_id.split('.')[0];
    const toggleDomains = ['light', 'switch', 'input_boolean', 'fan', 'automation'];
    const targetDomain = toggleDomains.includes(domain) ? domain : 'homeassistant';
    const service = body.action || 'toggle';

    const serviceData: Record<string, unknown> = { entity_id: body.entity_id };
    if (domain === 'light' && body.brightness_pct !== undefined) {
      serviceData.brightness_pct = Number(body.brightness_pct);
    }

    await ha.callService(targetDomain, service, serviceData);
    return { toggled: body.entity_id, ok: true };
  });
});
