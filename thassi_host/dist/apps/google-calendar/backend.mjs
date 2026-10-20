import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/google-calendar/backend/index.ts
import fs3 from "node:fs";
import path3 from "node:path";

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
function parseCsv(csvText, explicitDelimiter) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return { headers: [], rows: [], delimiter: explicitDelimiter || "," };
  }
  const firstLine = normalized.split("\n")[0] || "";
  const delimiter = explicitDelimiter || (firstLine.split(";").length > firstLine.split(",").length ? ";" : firstLine.split("	").length > firstLine.split(",").length ? "	" : ",");
  const parsedRows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== "")) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== "")) {
      parsedRows.push(currentRow);
    }
  }
  if (parsedRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }
  const headers = parsedRows[0].map((h, idx) => sanitizeIdentifier(h || `col_${idx + 1}`, idx));
  const rows = parsedRows.slice(1);
  return { headers, rows, delimiter };
}
function sanitizeIdentifier(raw, fallbackIndex = 0) {
  const cleaned = raw.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `col_${cleaned || fallbackIndex}`;
  }
  return cleaned;
}
function parsePotentialNumber(val, parseEuropeanDecimals) {
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (parseEuropeanDecimals) {
    if ((/^-?\d+,\d+$/.test(trimmed) || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) && trimmed.includes(",")) {
      const normalized = trimmed.replace(/\./g, "").replace(",", ".");
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
var ThassiAppDatabase = class {
  raw;
  dbPath;
  constructor(dbPath) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.raw = this.openWithAutoRecovery(dbPath);
  }
  openWithAutoRecovery(dbPath) {
    try {
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec(`
        CREATE TABLE IF NOT EXISTS _thassi_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.prepare("SELECT COUNT(*) FROM _thassi_kv").get();
      return db;
    } catch {
      try {
        for (const suffix of ["", "-wal", "-shm"]) {
          if (fs.existsSync(dbPath + suffix)) {
            fs.rmSync(dbPath + suffix, { force: true });
          }
        }
      } catch {
      }
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec(`
        CREATE TABLE IF NOT EXISTS _thassi_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    }
  }
  /** Execute raw DDL or multi-statement SQL */
  exec(sql) {
    this.raw.exec(sql);
  }
  /** Run a SELECT query and return typed rows */
  query(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    return stmt.all(...params);
  }
  /** Run a SELECT query and return the first row or undefined */
  queryOne(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    return stmt.get(...params);
  }
  /** Run an INSERT / UPDATE / DELETE statement */
  execute(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    const res = stmt.run(...params);
    return {
      changes: Number(res.changes),
      lastInsertRowid: res.lastInsertRowid
    };
  }
  /** Key-Value convenience store for app settings, cursors, or state */
  kvGet(key, defaultValue) {
    const row = this.queryOne(
      "SELECT value FROM _thassi_kv WHERE key = ?",
      [key]
    );
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value);
    } catch {
      return defaultValue;
    }
  }
  kvSet(key, value) {
    this.execute(
      `INSERT INTO _thassi_kv (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), (/* @__PURE__ */ new Date()).toISOString()]
    );
  }
  kvDelete(key) {
    this.execute("DELETE FROM _thassi_kv WHERE key = ?", [key]);
  }
  /**
   * Import CSV text directly into a SQLite table with automatic column type inference.
   * Ideal for bank statement exports, Google Health exports, or custom datasets.
   */
  importCsvToTable(rawTableName, csvText, options = {}) {
    const tableName = sanitizeIdentifier(rawTableName);
    const parseEuro = options.parseEuropeanDecimals ?? true;
    const { headers, rows, delimiter } = parseCsv(csvText, options.delimiter);
    if (headers.length === 0) {
      throw new Error("CSV contains no headers or rows");
    }
    const seen = /* @__PURE__ */ new Map();
    const uniqueHeaders = headers.map((h) => {
      const count = seen.get(h) || 0;
      seen.set(h, count + 1);
      return count === 0 ? h : `${h}_${count + 1}`;
    });
    const columns = uniqueHeaders.map((name, colIdx) => {
      let allIntegers = true;
      let allNumbers = true;
      let hasNonEmpty = false;
      for (const row of rows) {
        const rawVal = (row[colIdx] ?? "").trim();
        if (!rawVal) continue;
        hasNonEmpty = true;
        const num = parsePotentialNumber(rawVal, parseEuro);
        if (num === null) {
          allNumbers = false;
          allIntegers = false;
          break;
        }
        if (!Number.isInteger(num)) {
          allIntegers = false;
        }
      }
      const type = !hasNonEmpty ? "TEXT" : allIntegers ? "INTEGER" : allNumbers ? "REAL" : "TEXT";
      return { name, type };
    });
    if (options.replaceTable !== false) {
      this.exec(`DROP TABLE IF EXISTS "${tableName}";`);
    }
    const colDefs = columns.map((c) => `"${c.name}" ${c.type}`).join(", ");
    this.exec(
      `CREATE TABLE IF NOT EXISTS "${tableName}" (_id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs});`
    );
    const placeholders = columns.map(() => "?").join(", ");
    const colNames = columns.map((c) => `"${c.name}"`).join(", ");
    const insertStmt = this.raw.prepare(
      `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`
    );
    let insertedRows = 0;
    this.exec("BEGIN TRANSACTION;");
    try {
      for (const row of rows) {
        const values = columns.map((col, idx) => {
          const rawVal = (row[idx] ?? "").trim();
          if (!rawVal) return null;
          if (col.type === "INTEGER" || col.type === "REAL") {
            return parsePotentialNumber(rawVal, parseEuro);
          }
          return rawVal;
        });
        insertStmt.run(...values);
        insertedRows++;
      }
      this.exec("COMMIT;");
    } catch (err) {
      this.exec("ROLLBACK;");
      throw err;
    }
    return {
      tableName,
      columns,
      insertedRows,
      delimiterUsed: delimiter
    };
  }
  /** List all user tables in this database */
  listTables() {
    const rows = this.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_thassi_%' ORDER BY name`
    );
    return rows.map((r) => r.name);
  }
  /** Compute analytical summary (counts, min, max, sum, avg) for any table */
  summarizeTable(rawTableName) {
    const tableName = sanitizeIdentifier(rawTableName);
    const countRow = this.queryOne(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
    const rowCount = countRow?.cnt ?? 0;
    const pragmaCols = this.query(
      `PRAGMA table_info("${tableName}")`
    );
    const columns = pragmaCols.filter((c) => c.name !== "_id").map((col) => {
      const isNumeric = col.type === "INTEGER" || col.type === "REAL";
      if (isNumeric) {
        const stats = this.queryOne(
          `SELECT 
              COUNT("${col.name}") as nonNull,
              COUNT(DISTINCT "${col.name}") as distinctCnt,
              MIN("${col.name}") as minVal,
              MAX("${col.name}") as maxVal,
              SUM("${col.name}") as sumVal,
              AVG("${col.name}") as avgVal
             FROM "${tableName}"`
        );
        return {
          name: col.name,
          type: col.type,
          nonNullCount: stats?.nonNull ?? 0,
          distinctCount: stats?.distinctCnt ?? 0,
          min: stats?.minVal ?? null,
          max: stats?.maxVal ?? null,
          sum: stats?.sumVal !== null && stats?.sumVal !== void 0 ? Number(stats.sumVal.toFixed(2)) : null,
          avg: stats?.avgVal !== null && stats?.avgVal !== void 0 ? Number(stats.avgVal.toFixed(2)) : null
        };
      } else {
        const stats = this.queryOne(
          `SELECT 
              COUNT("${col.name}") as nonNull,
              COUNT(DISTINCT "${col.name}") as distinctCnt,
              MIN("${col.name}") as minVal,
              MAX("${col.name}") as maxVal
             FROM "${tableName}"`
        );
        return {
          name: col.name,
          type: col.type || "TEXT",
          nonNullCount: stats?.nonNull ?? 0,
          distinctCount: stats?.distinctCnt ?? 0,
          min: stats?.minVal ?? null,
          max: stats?.maxVal ?? null
        };
      }
    });
    return {
      tableName,
      rowCount,
      columns
    };
  }
};

// packages/sdk/src/actions.ts
import fs2 from "node:fs";
import path2 from "node:path";
import net from "node:net";
function interpolateValue(template, upstreamText) {
  if (!template) return "";
  return template.replace(/\{\{\$input\}\}/g, upstreamText || "");
}
function resolveDataDir() {
  return path2.resolve(
    process.env.THASSI_DATA_DIR || (fs2.existsSync("/data") ? "/data" : "./data")
  );
}
function openAppDatabaseReadWrite(dataDir, appId) {
  const dbPath = path2.join(dataDir, "apps", `${appId}.db`);
  return new ThassiAppDatabase(dbPath);
}
var ThassiActionRegistry = class {
  actions = /* @__PURE__ */ new Map();
  telemetry = /* @__PURE__ */ new Map();
  sharedDb;
  ha;
  google;
  dataDir;
  constructor(sharedDb, ha, google) {
    this.sharedDb = sharedDb;
    this.ha = ha;
    this.google = google;
    this.dataDir = resolveDataDir();
    this.loadPersistedTelemetry();
    this.registerCoreAxons();
  }
  loadPersistedTelemetry() {
    try {
      const saved = this.sharedDb.kvGet("axons_telemetry");
      if (saved && typeof saved === "object") {
        for (const [k, v] of Object.entries(saved)) {
          this.telemetry.set(k, v);
        }
      }
    } catch {
    }
  }
  persistTelemetry() {
    try {
      const obj = Object.fromEntries(this.telemetry.entries());
      this.sharedDb.kvSet("axons_telemetry", obj);
    } catch {
    }
  }
  register(definition) {
    const domainCode = definition.domainCode || definition.id.split(".")[0].toUpperCase().slice(0, 6);
    this.actions.set(definition.id, {
      ...definition,
      domainCode
    });
  }
  listActions() {
    return Array.from(this.actions.values()).map((a) => {
      const stat = this.telemetry.get(a.id);
      return {
        id: a.id,
        name: a.name,
        domainCode: a.domainCode,
        category: a.category,
        icon: a.icon,
        description: a.description,
        fields: a.fields,
        defaultInput: a.defaultInput,
        lastStatus: stat?.lastStatus || "idle",
        lastDurationMs: stat?.lastDurationMs ?? null,
        lastExecutedAt: stat?.lastExecutedAt ?? null,
        lastSummary: stat?.lastSummary ?? null,
        totalRuns: stat?.totalRuns ?? 0
      };
    });
  }
  listAxons() {
    return this.listActions();
  }
  getAction(actionId) {
    return this.actions.get(actionId);
  }
  resolveCredentials(override) {
    const geminiApiKey = override?.geminiApiKey || this.sharedDb.kvGet("gemini_api_key", "") || process.env.GEMINI_API_KEY || "";
    const githubToken = override?.githubToken || this.sharedDb.kvGet("github_token", "") || process.env.GITHUB_TOKEN || "";
    const googleOAuthToken = override?.googleOAuthToken || this.sharedDb.kvGet("google_oauth_token", "") || "";
    return { geminiApiKey, githubToken, googleOAuthToken };
  }
  async resolveGoogleAccessToken(explicitToken) {
    if (explicitToken && explicitToken.trim()) {
      return explicitToken.trim();
    }
    return await this.google.getValidAccessToken();
  }
  /**
   * Execute an atomic Axon by ID with full input interpolation (`{{$input}}`),
   * timing telemetry, and strict error reporting.
   */
  async execute(actionId, rawInput = {}, options = {}) {
    const startMs = Date.now();
    const executedAt = (/* @__PURE__ */ new Date()).toISOString();
    const action = this.actions.get(actionId);
    const upstreamText = options.upstreamText || "";
    if (!action) {
      return {
        actionId,
        axonId: actionId,
        status: "error",
        durationMs: Date.now() - startMs,
        executedAt,
        summary: `Unknown axon "${actionId}"`,
        data: { error: `Axon "${actionId}" is not registered.` },
        errorCode: "UNKNOWN_AXON"
      };
    }
    const mergedInput = { ...action.defaultInput, ...rawInput };
    for (const [key, val] of Object.entries(mergedInput)) {
      if (typeof val === "string" && upstreamText) {
        mergedInput[key] = interpolateValue(val, upstreamText);
      }
    }
    const ctx = {
      sharedDb: this.sharedDb,
      ha: this.ha,
      google: this.google,
      dataDir: this.dataDir,
      upstreamText,
      credentials: this.resolveCredentials(options.credentials)
    };
    try {
      const res = await action.execute(mergedInput, ctx);
      const durationMs = Math.max(1, Date.now() - startMs);
      const prev = this.telemetry.get(actionId);
      this.telemetry.set(actionId, {
        lastStatus: "success",
        lastDurationMs: durationMs,
        lastExecutedAt: executedAt,
        lastSummary: res.summary,
        totalRuns: (prev?.totalRuns || 0) + 1
      });
      this.persistTelemetry();
      return {
        actionId,
        axonId: actionId,
        status: "success",
        durationMs,
        executedAt,
        summary: res.summary,
        data: res.data
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startMs);
      const message = err instanceof Error ? err.message : String(err);
      const prev = this.telemetry.get(actionId);
      this.telemetry.set(actionId, {
        lastStatus: "error",
        lastDurationMs: durationMs,
        lastExecutedAt: executedAt,
        lastSummary: message,
        totalRuns: (prev?.totalRuns || 0) + 1
      });
      this.persistTelemetry();
      return {
        actionId,
        axonId: actionId,
        status: "error",
        durationMs,
        executedAt,
        summary: message,
        data: { error: message },
        errorCode: "AXON_EXECUTION_FAILED"
      };
    }
  }
  registerCoreAxons() {
    this.register({
      id: "ha.get_state",
      name: "Read Entity State",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Reads the live state, unit, and attributes of a single Home Assistant entity.",
      defaultInput: { entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur" },
      fields: [
        {
          key: "entityId",
          label: "Entity ID",
          type: "text",
          placeholder: "sensor.shellyhtg3_e4b32331dde0_temperatur",
          required: true
        }
      ],
      execute: async (input, ctx) => {
        const entityId = String(input.entityId || "").trim();
        if (!entityId) throw new Error("entityId is required");
        const stateObj = await ctx.ha.getState(entityId);
        const unit = String(stateObj.attributes?.unit_of_measurement || "");
        const friendly = String(stateObj.attributes?.friendly_name || entityId);
        return {
          summary: `${friendly}: ${stateObj.state}${unit ? " " + unit : ""}`,
          data: {
            entity_id: stateObj.entity_id,
            state: stateObj.state,
            unit,
            friendly_name: friendly,
            attributes: stateObj.attributes,
            last_updated: stateObj.last_updated,
            formattedText: `${friendly} (${stateObj.entity_id}) = ${stateObj.state}${unit ? " " + unit : ""}`
          }
        };
      }
    });
    this.register({
      id: "ha.get_states",
      name: "Query Entities by Domain / Search",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Filters all 597+ Home Assistant entities by domain (sensor, switch, light, camera, binary_sensor) and search keyword.",
      defaultInput: { domain: "sensor", search: "", limit: "50" },
      fields: [
        { key: "domain", label: "Domain (optional)", type: "text", placeholder: "sensor / switch / light / camera" },
        { key: "search", label: "Search Filter (optional)", type: "text", placeholder: "shelly / pixel / power" },
        { key: "limit", label: "Max Rows", type: "number", placeholder: "50" }
      ],
      execute: async (input, ctx) => {
        const domain = String(input.domain || "").trim() || void 0;
        const search = String(input.search || "").trim().toLowerCase();
        const limit = Math.max(1, Math.min(600, Number(input.limit || 50)));
        let states = await ctx.ha.getStates(domain);
        if (search) {
          states = states.filter(
            (s) => s.entity_id.toLowerCase().includes(search) || String(s.attributes?.friendly_name || "").toLowerCase().includes(search)
          );
        }
        const sliced = states.slice(0, limit).map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          unit: s.attributes?.unit_of_measurement || "",
          friendly_name: s.attributes?.friendly_name || s.entity_id,
          last_updated: s.last_updated
        }));
        return {
          summary: `${states.length} matching entities (returning ${sliced.length})`,
          data: {
            domain: domain || "all",
            search: search || null,
            totalMatches: states.length,
            returned: sliced.length,
            entities: sliced
          }
        };
      }
    });
    this.register({
      id: "ha.energy.live_power",
      name: "Shelly & Smart Home Live Power",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Aggregates all active power sensors (W) and energy counters (kWh/Wh) across all Shelly relays and plugs.",
      defaultInput: { includeZero: "true" },
      fields: [
        { key: "includeZero", label: "Include 0 W Channels", type: "select", options: ["true", "false"] }
      ],
      execute: async (input, ctx) => {
        const includeZero = String(input.includeZero || "true") !== "false";
        const sensors = await ctx.ha.getStates("sensor");
        const powerSensors = sensors.filter((s) => {
          const u = String(s.attributes?.unit_of_measurement || "");
          const dc = String(s.attributes?.device_class || "");
          return u === "W" || dc === "power";
        }).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          watts: Number(s.state),
          rawState: s.state
        })).filter((s) => Number.isFinite(s.watts) && (includeZero || s.watts > 0)).sort((a, b) => b.watts - a.watts);
        const totalWatts = Number(
          powerSensors.reduce((sum, s) => sum + s.watts, 0).toFixed(1)
        );
        return {
          summary: `${totalWatts} W total across ${powerSensors.length} power channels`,
          data: {
            totalWatts,
            activeChannels: powerSensors.filter((p) => p.watts > 0).length,
            totalChannels: powerSensors.length,
            channels: powerSensors
          }
        };
      }
    });
    this.register({
      id: "ha.rooms.snapshot",
      name: "Spatial Rooms & Devices Snapshot",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Returns live temperatures, humidity, switch states, and power draw grouped by room.",
      defaultInput: { roomFilter: "" },
      fields: [
        { key: "roomFilter", label: "Room ID Filter (optional)", type: "text", placeholder: "buro_og / wohnkuche / vorzimmer_og" }
      ],
      execute: async (input, ctx) => {
        const allStates = await ctx.ha.getStates();
        const sm = new Map(allStates.map((s) => [s.entity_id, s]));
        const getNum = (id) => {
          const v = Number(sm.get(id)?.state);
          return Number.isFinite(v) ? v : null;
        };
        const buildDev = (entityId, label, powerId) => {
          const st = sm.get(entityId);
          return {
            entityId,
            label,
            state: st?.state ?? "unavailable",
            powerW: powerId ? getNum(powerId) : null
          };
        };
        const rooms = [
          {
            id: "buro_og",
            name: "B\xFCro OG",
            tempC: getNum("sensor.shellyhtg3_e4b32331dde0_temperatur"),
            humidityPct: getNum("sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit"),
            devices: [
              buildDev("light.buro_og_grosses_licht", "Gro\xDFes Licht", "sensor.links_power"),
              buildDev("switch.buro_og_regal_lichter", "Regal Lichter", "sensor.shellyplugsg3_e4b063e4bfd8_power"),
              buildDev("switch.buro_og_plug_90", "Schreibtisch Plug .90", "sensor.kleines_licht_pumpe_power"),
              buildDev("switch.buro_og_bewasserung_pumpe", "Bew\xE4sserung Pumpe", "sensor.schalter_neu_power"),
              buildDev("light.thomasbuero_2pm_oben_output_1", "Schalter Oben Rechts", "sensor.thomasbuero_2pm_oben_switch_1_power")
            ]
          },
          {
            id: "wohnkuche",
            name: "Wohnk\xFCche",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.wohnkueche_bodenbeleuchtung_boden", "Bodenbeleuchtung", "sensor.shelly_plus_2pm_a_switch_0_power"),
              buildDev("switch.wohnkueche_fensterbank_licht", "Fensterbank Licht", "sensor.bodenbeleuchtung_power"),
              buildDev("media_player.tv_samsung_6_series_49", 'Samsung TV (49")')
            ]
          },
          {
            id: "vorzimmer_og",
            name: "Vorzimmer OG",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.vorzimmer_og_grosses_licht", "Gro\xDFes Licht"),
              buildDev("light.vorzimmer_og_bodenbeleuchtung_led", "Bodenbeleuchtung LED"),
              buildDev("light.vorzimmer_og_alert_led", "Alert LED"),
              buildDev("switch.shelly2pmg3_8cbfea9ac754_output_0", "Shelly 2PM Kanal 1", "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung"),
              buildDev("switch.shelly2pmg3_8cbfea9ac754_output_1", "Shelly 2PM Kanal 2", "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung")
            ]
          },
          {
            id: "bad_gaeste",
            name: "Bad & G\xE4ste",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.shelly1pmminig4_7c2c676dc6fc", "Waschmaschine Bad OG", "sensor.shelly1pmminig4_7c2c676dc6fc_leistung"),
              buildDev("switch.gaestezimmer_schalter_rechts", "G\xE4stezimmer Schalter 1", "sensor.shellyplus2pm_c049ef8a3a78_switch_0_power"),
              buildDev("switch.shellyplus2pm_c049ef8a3a78_switch_1", "G\xE4stezimmer Schalter 2", "sensor.shellyplus2pm_c049ef8a3a78_switch_1_power"),
              buildDev("sensor.smart_series_8000_75b4_batterie", "Oral-B Smart Series Akku")
            ]
          }
        ];
        const filter = String(input.roomFilter || "").trim().toLowerCase();
        const filtered = filter ? rooms.filter((r) => r.id.includes(filter) || r.name.toLowerCase().includes(filter)) : rooms;
        return {
          summary: `${filtered.length} rooms inspected (B\xFCro OG: ${rooms[0].tempC ?? "\u2014"} \xB0C / ${rooms[0].humidityPct ?? "\u2014"}%)`,
          data: { rooms: filtered }
        };
      }
    });
    this.register({
      id: "ha.call_service",
      name: "Call Service / Switch Device",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Invokes any Home Assistant service (light, switch, script, automation, media_player, persistent_notification).",
      defaultInput: {
        domain: "persistent_notification",
        service: "create",
        targetOrMessage: "{{$input}}"
      },
      fields: [
        {
          key: "domain",
          label: "Domain",
          type: "select",
          options: ["persistent_notification", "light", "switch", "script", "automation", "media_player", "siren"]
        },
        {
          key: "service",
          label: "Service",
          type: "select",
          options: ["create", "turn_on", "turn_off", "toggle", "trigger"]
        },
        {
          key: "targetOrMessage",
          label: "Entity ID, Message or JSON Payload",
          type: "textarea",
          placeholder: "light.buro_og_grosses_licht or {{$input}}"
        }
      ],
      execute: async (input, ctx) => {
        const domain = String(input.domain || "persistent_notification").trim();
        const service = String(input.service || "create").trim();
        const rawTarget = String(input.targetOrMessage || "").trim();
        let serviceData = {};
        if (input.serviceData && typeof input.serviceData === "object") {
          serviceData = input.serviceData;
        } else if (rawTarget.startsWith("{") && rawTarget.endsWith("}")) {
          try {
            serviceData = JSON.parse(rawTarget);
          } catch {
            serviceData = { entity_id: rawTarget };
          }
        } else if (domain === "persistent_notification") {
          serviceData = {
            title: String(input.title || "Thassi Axon"),
            message: rawTarget.slice(0, 1e3) || "Executed via Thassi Axons"
          };
        } else if (rawTarget) {
          serviceData = { entity_id: rawTarget };
        }
        const response = await ctx.ha.callService(domain, service, serviceData);
        return {
          summary: `HA ${domain}.${service} -> ${String(serviceData.entity_id || serviceData.title || "ok")}`,
          data: { domain, service, serviceData, response }
        };
      }
    });
    this.register({
      id: "ha.publish_sensor",
      name: "Publish Custom Sensor",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Creates or updates a sensor.thassi_* entity in Home Assistant.",
      defaultInput: {
        sensorSlug: "custom_metric",
        state: "100",
        unit: "",
        friendlyName: "Thassi Metric"
      },
      fields: [
        { key: "sensorSlug", label: "Sensor Slug", type: "text", placeholder: "custom_metric" },
        { key: "state", label: "State Value", type: "text", placeholder: "42.5 or {{$input}}" },
        { key: "unit", label: "Unit", type: "text", placeholder: "EUR / W / %" },
        { key: "friendlyName", label: "Friendly Name", type: "text", placeholder: "Thassi Metric" }
      ],
      execute: async (input, ctx) => {
        const slug = String(input.sensorSlug || "custom_metric").trim();
        const stateVal = input.state ?? "";
        const published = await ctx.ha.publishSensor(slug, String(stateVal), {
          friendly_name: input.friendlyName || `Thassi ${slug}`,
          unit_of_measurement: input.unit || void 0,
          ...typeof input.attributes === "object" ? input.attributes : {}
        });
        return {
          summary: `${published.entity_id} = ${published.state}`,
          data: published
        };
      }
    });
    this.register({
      id: "ha.wearables.biometrics",
      name: "Wearables & Mobile Telemetry (Pixel 10 / Watch)",
      domainCode: "FIT",
      category: "fitness",
      icon: "FIT",
      description: "Reads live steps, heart rate, battery, sleep, and activity states from Pixel 10, Pixel Watch, and iPad entities in Home Assistant.",
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const all = await ctx.ha.getStates();
        const wearableEntities = all.filter((s) => /pixel|watch|ipad|oralb|smart_series/i.test(s.entity_id)).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          state: s.state,
          unit: String(s.attributes?.unit_of_measurement || ""),
          last_updated: s.last_updated
        }));
        return {
          summary: `${wearableEntities.length} wearable & mobile sensors read from Home Assistant`,
          data: {
            count: wearableEntities.length,
            sensors: wearableEntities
          }
        };
      }
    });
    this.register({
      id: "gcal.upcoming",
      name: "Calendar: Upcoming Events",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Fetches upcoming events from Google Calendar REST API v3 (or Home Assistant calendar.* entity).",
      defaultInput: { calendarId: "primary", maxResults: "10" },
      fields: [
        { key: "calendarId", label: "Calendar ID", type: "text", placeholder: "primary" },
        { key: "maxResults", label: "Max Events", type: "number", placeholder: "10" }
      ],
      execute: async (input, ctx) => {
        const calendarId = String(input.calendarId || "primary").trim();
        const maxResults = Math.max(1, Math.min(50, Number(input.maxResults || 10)));
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const timeMin = (/* @__PURE__ */ new Date()).toISOString();
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5e3)
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`Google Calendar API ${res.status}: ${errBody || res.statusText}`);
          }
          const data = await res.json();
          const items = (data.items || []).map((ev) => ({
            id: ev.id,
            summary: ev.summary || "(Ohne Titel)",
            start: ev.start?.dateTime || ev.start?.date || "",
            end: ev.end?.dateTime || ev.end?.date || "",
            location: ev.location || "",
            description: ev.description || ""
          }));
          const formattedText = items.length > 0 ? items.map((e) => `\u2022 ${e.start} \u2014 ${e.summary}`).join("\n") : "Keine anstehenden Termine.";
          return {
            summary: `${items.length} events from Google Calendar (${calendarId})`,
            data: { calendarId, source: "google_calendar_api", count: items.length, events: items, formattedText }
          };
        } catch (googleErr) {
          const haEntityId = calendarId.startsWith("calendar.") ? calendarId : "calendar.thomas_simhofer_gmail_com";
          const startIso = (/* @__PURE__ */ new Date()).toISOString();
          const endIso = new Date(Date.now() + 14 * 864e5).toISOString();
          const haEvents = await ctx.ha.getCalendarEvents(haEntityId, startIso, endIso);
          const items = haEvents.slice(0, maxResults).map((ev, idx) => ({
            id: ev.uid || `ha_${idx}`,
            summary: ev.summary || "(Ohne Titel)",
            start: ev.start?.dateTime || ev.start?.date || "",
            end: ev.end?.dateTime || ev.end?.date || "",
            location: ev.location || "",
            description: ev.description || ""
          }));
          const formattedText = items.length > 0 ? items.map((e) => `\u2022 ${e.start} \u2014 ${e.summary}`).join("\n") : "Keine anstehenden Termine.";
          return {
            summary: `${items.length} events via Home Assistant (${haEntityId})`,
            data: {
              calendarId: haEntityId,
              source: "homeassistant_calendar",
              count: items.length,
              events: items,
              formattedText,
              googleAuthNotice: googleErr instanceof Error ? googleErr.message : String(googleErr)
            }
          };
        }
      }
    });
    this.register({
      id: "gcal.create_event",
      name: "Calendar: Create Event",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Creates a calendar event via Google Calendar v3 or Home Assistant calendar.create_event.",
      defaultInput: {
        calendarId: "primary",
        summary: "{{$input}}",
        startIso: "",
        durationMinutes: "30",
        description: ""
      },
      fields: [
        { key: "calendarId", label: "Calendar ID", type: "text", placeholder: "primary" },
        { key: "summary", label: "Summary", type: "text", placeholder: "Meeting / Task" },
        { key: "startIso", label: "Start ISO (empty = in 1h)", type: "text", placeholder: "2026-10-20T14:00:00+02:00" },
        { key: "durationMinutes", label: "Duration (min)", type: "number", placeholder: "30" },
        { key: "description", label: "Description", type: "textarea", placeholder: "Notes" }
      ],
      execute: async (input, ctx) => {
        const calendarId = String(input.calendarId || "primary").trim();
        const summary = String(input.summary || "New Calendar Event").trim();
        const durationMin = Math.max(5, Number(input.durationMinutes || 30));
        const startDate = input.startIso ? new Date(String(input.startIso)) : new Date(Date.now() + 36e5);
        const endDate = new Date(startDate.getTime() + durationMin * 6e4);
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                summary,
                description: input.description || "",
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() }
              }),
              signal: AbortSignal.timeout(5e3)
            }
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`Google Calendar POST ${res.status}: ${errText || res.statusText}`);
          }
          const created = await res.json();
          return {
            summary: `Created "${summary}" in Google Calendar (${calendarId})`,
            data: {
              id: created.id,
              htmlLink: created.htmlLink,
              summary,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              source: "google_calendar_api"
            }
          };
        } catch {
          const entityId = calendarId.startsWith("calendar.") ? calendarId : "calendar.thomas_simhofer_gmail_com";
          await ctx.ha.callService("calendar", "create_event", {
            entity_id: entityId,
            summary,
            description: input.description || "",
            start_date_time: startDate.toISOString(),
            end_date_time: endDate.toISOString()
          });
          return {
            summary: `Created "${summary}" via Home Assistant (${entityId})`,
            data: {
              entityId,
              summary,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              source: "homeassistant_calendar_service"
            }
          };
        }
      }
    });
    this.register({
      id: "gcal.delete_event",
      name: "Calendar: Delete Event",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Deletes an event from Google Calendar by eventId.",
      defaultInput: { calendarId: "primary", eventId: "" },
      fields: [
        { key: "calendarId", label: "Calendar ID", type: "text", placeholder: "primary" },
        { key: "eventId", label: "Event ID", type: "text", placeholder: "Google Event ID", required: true }
      ],
      execute: async (input, ctx) => {
        const calendarId = String(input.calendarId || "primary").trim();
        const eventId = String(input.eventId || "").trim();
        if (!eventId) throw new Error("eventId is required");
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events/${encodeURIComponent(eventId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5e3)
          }
        );
        if (!res.ok && res.status !== 204 && res.status !== 410) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Google Calendar DELETE ${res.status}: ${errText || res.statusText}`);
        }
        return {
          summary: `Deleted event ${eventId} from ${calendarId}`,
          data: { calendarId, eventId, deleted: true }
        };
      }
    });
    this.register({
      id: "google.fit.daily_summary",
      name: "Google Fit & Biometrics Summary",
      domainCode: "FIT",
      category: "fitness",
      icon: "FIT",
      description: "Queries Google Fitness REST API dataset:aggregate (steps, calories, heart rate) and merges with local SQLite biometrics.",
      defaultInput: { days: "7" },
      fields: [
        { key: "days", label: "Lookback Days", type: "number", placeholder: "7" }
      ],
      execute: async (input, ctx) => {
        const days = Math.max(1, Math.min(30, Number(input.days || 7)));
        let localRows = [];
        try {
          const healthDb = openAppDatabaseReadWrite(ctx.dataDir, "google-health");
          localRows = healthDb.query(
            "SELECT * FROM daily_biometrics ORDER BY day_date DESC LIMIT ?",
            [days]
          );
        } catch {
        }
        let googleFitSteps = null;
        let googleFitError = null;
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const endMs = Date.now();
          const startMs = endMs - 864e5;
          const fitRes = await fetch(
            "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
                bucketByTime: { durationMillis: 864e5 },
                startTimeMillis: startMs,
                endTimeMillis: endMs
              }),
              signal: AbortSignal.timeout(5e3)
            }
          );
          if (fitRes.ok) {
            const fitJson = await fitRes.json();
            googleFitSteps = fitJson.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal ?? 0;
          } else {
            googleFitError = `HTTP ${fitRes.status} (Fitness scope requires re-authorization)`;
          }
        } catch (e) {
          googleFitError = e instanceof Error ? e.message : String(e);
        }
        const latest = localRows[0];
        return {
          summary: latest ? `Readiness ${latest.readiness_score ?? "\u2014"} \xB7 Steps ${latest.steps ?? 0} \xB7 Resting HR ${latest.resting_hr ?? "\u2014"} bpm` : `${localRows.length} biometric records loaded`,
          data: {
            days,
            googleFitLiveSteps24h: googleFitSteps,
            googleFitNotice: googleFitError,
            biometricsHistory: localRows
          }
        };
      }
    });
    this.register({
      id: "gmail.list_unread",
      name: "Gmail: Query Messages",
      domainCode: "GMAIL",
      category: "gmail",
      icon: "GMAIL",
      description: "Searches Gmail messages via REST API v1 (/users/me/messages).",
      defaultInput: { query: "is:unread label:INBOX", maxResults: "5" },
      fields: [
        { key: "query", label: "Search Query", type: "text", placeholder: "is:unread label:INBOX" },
        { key: "maxResults", label: "Max Results", type: "number", placeholder: "5" }
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || "is:unread label:INBOX").trim();
        const maxResults = Math.max(1, Math.min(25, Number(input.maxResults || 5)));
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
            query
          )}&maxResults=${maxResults}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5e3)
          }
        );
        if (!listRes.ok) {
          const errBody = await listRes.text().catch(() => "");
          throw new Error(
            `Gmail API ${listRes.status}: ${errBody || listRes.statusText}. Authorize scope gmail.readonly.`
          );
        }
        const listData = await listRes.json();
        const messageRefs = listData.messages || [];
        const details = [];
        for (const ref of messageRefs.slice(0, 5)) {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(4e3)
            }
          );
          if (msgRes.ok) {
            const m = await msgRes.json();
            const headers = m.payload?.headers || [];
            const from = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
            const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "(No Subject)";
            details.push({ id: ref.id, from, subject, snippet: m.snippet || "" });
          }
        }
        return {
          summary: `${details.length} messages matched "${query}"`,
          data: {
            query,
            count: details.length,
            messages: details,
            formattedText: details.length > 0 ? details.map((m) => `\u2022 ${m.from}: ${m.subject}`).join("\n") : `No messages for "${query}".`
          }
        };
      }
    });
    this.register({
      id: "gmail.send",
      name: "Gmail: Send Email",
      domainCode: "GMAIL",
      category: "gmail",
      icon: "GMAIL",
      description: "Sends an RFC-2822 email via Gmail REST API v1 (/users/me/messages/send).",
      defaultInput: {
        to: "thomas.simhofer@gmail.com",
        subject: "Thassi Notification",
        body: "{{$input}}"
      },
      fields: [
        { key: "to", label: "To", type: "text", placeholder: "thomas.simhofer@gmail.com", required: true },
        { key: "subject", label: "Subject", type: "text", placeholder: "Thassi Notification" },
        { key: "body", label: "Body", type: "textarea", placeholder: "{{$input}}" }
      ],
      execute: async (input, ctx) => {
        const to = String(input.to || "").trim();
        if (!to) throw new Error('Recipient "to" is required');
        const subject = String(input.subject || "Thassi Notification").trim();
        const body = String(input.body || "").trim();
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const mimeMessage = [
          `To: ${to}`,
          `Subject: =?utf-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          body
        ].join("\r\n");
        const rawBase64Url = Buffer.from(mimeMessage, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ raw: rawBase64Url }),
          signal: AbortSignal.timeout(6e3)
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(
            `Gmail Send API ${res.status}: ${errBody || res.statusText}. Authorize scope gmail.send.`
          );
        }
        const sent = await res.json();
        return {
          summary: `Sent email to ${to} (id: ${sent.id})`,
          data: { id: sent.id, threadId: sent.threadId, to, subject, sentAt: (/* @__PURE__ */ new Date()).toISOString() }
        };
      }
    });
    this.register({
      id: "google.drive.recent_files",
      name: "Google Drive: List Recent Files",
      domainCode: "DRIVE",
      category: "drive",
      icon: "DRIVE",
      description: "Lists recently modified files and folders from Google Drive REST API v3.",
      defaultInput: { pageSize: "15", query: "trashed = false" },
      fields: [
        { key: "pageSize", label: "Max Files", type: "number", placeholder: "15" },
        { key: "query", label: "Drive Query (q)", type: "text", placeholder: "trashed = false" }
      ],
      execute: async (input, ctx) => {
        const pageSize = Math.max(1, Math.min(50, Number(input.pageSize || 15)));
        const q = String(input.query || "trashed = false").trim();
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const params = new URLSearchParams({
          pageSize: String(pageSize),
          q,
          orderBy: "modifiedTime desc",
          fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)"
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5e3)
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(
            `Google Drive API ${res.status}: ${errBody || res.statusText}. Authorize scope drive.readonly.`
          );
        }
        const data = await res.json();
        const files = data.files || [];
        return {
          summary: `${files.length} files retrieved from Google Drive`,
          data: { count: files.length, files }
        };
      }
    });
    this.register({
      id: "finance.summary.get",
      name: "Finance: Cashflow & Balance KPIs",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Reads current account balance, monthly/weekly/daily expenses, net cashflow, and category budgets.",
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const finDb = openAppDatabaseReadWrite(ctx.dataDir, "finance-analytics");
        const balanceCfg = finDb.kvGet("finance_balance_config") || {
          currentBalance: 4850,
          accountName: "Sparkasse George Girokonto"
        };
        const totals = finDb.queryOne(`
          SELECT
            COUNT(*) AS txCount,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS totalIncome,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS totalExpenses
          FROM transactions
        `);
        const byCategory = finDb.query(`
          SELECT
            category,
            ROUND(SUM(ABS(amount)), 2) AS spend,
            COUNT(*) AS tx_count
          FROM transactions
          WHERE amount < 0
          GROUP BY category
          ORDER BY spend DESC
        `);
        const budgets = finDb.query("SELECT * FROM category_budgets ORDER BY monthly_limit DESC");
        return {
          summary: `Balance: \u20AC${Number(balanceCfg.currentBalance ?? 0).toFixed(2)} \xB7 ${totals?.txCount ?? 0} transactions \xB7 \u20AC${Number(totals?.totalExpenses ?? 0).toFixed(2)} expenses`,
          data: {
            account: balanceCfg,
            totals,
            spendByCategory: byCategory,
            budgets
          }
        };
      }
    });
    this.register({
      id: "finance.transactions.query",
      name: "Finance: Search Ledger Transactions",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Searches the SQLite transaction ledger by payee/notes, category, or minimum amount.",
      defaultInput: { search: "", category: "", limit: "30" },
      fields: [
        { key: "search", label: "Payee / Notes", type: "text", placeholder: "SPAR / HOFER / AREC" },
        { key: "category", label: "Category", type: "text", placeholder: "Groceries / Housing" },
        { key: "limit", label: "Limit", type: "number", placeholder: "30" }
      ],
      execute: async (input, ctx) => {
        const finDb = openAppDatabaseReadWrite(ctx.dataDir, "finance-analytics");
        const search = String(input.search || "").trim();
        const category = String(input.category || "").trim();
        const limit = Math.max(1, Math.min(250, Number(input.limit || 30)));
        const clauses = [];
        const params = [];
        if (search) {
          clauses.push("(LOWER(payee) LIKE ? OR LOWER(notes) LIKE ?)");
          params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
        }
        if (category) {
          clauses.push("LOWER(category) LIKE ?");
          params.push(`%${category.toLowerCase()}%`);
        }
        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
        const rows = finDb.query(
          `SELECT id, tx_date, payee, amount, category, account, is_recurring, notes
           FROM transactions ${whereSql}
           ORDER BY tx_date DESC, id DESC LIMIT ?`,
          [...params, limit]
        );
        return {
          summary: `${rows.length} transactions returned`,
          data: { count: rows.length, transactions: rows }
        };
      }
    });
    this.register({
      id: "meals.week_plan.get",
      name: "Meals: Weekly Plan & Macro Summary",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Reads the current 7-day meal plan, recipes, and daily calorie/macro totals from meal-planner.",
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const mealDb = openAppDatabaseReadWrite(ctx.dataDir, "meal-planner");
        const planRows = mealDb.query(`
          SELECT plan_date, slot, custom_title, calories, protein_g, carbs_g, fat_g, guest_portions, selected, completed
          FROM meal_plan
          ORDER BY plan_date ASC, slot ASC
        `);
        const todaySummary = ctx.sharedDb.kvGet("meal_planner_today") || null;
        return {
          summary: `${planRows.length} planned meal slots across the week`,
          data: {
            todaySummary,
            count: planRows.length,
            plan: planRows
          }
        };
      }
    });
    this.register({
      id: "meals.groceries.manage",
      name: "Meals: Grocery List & Stock Manager",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Lists, adds, or clears items on the persistent grocery shopping list.",
      defaultInput: { action: "list", itemName: "", category: "Frische & Markt" },
      fields: [
        { key: "action", label: "Action", type: "select", options: ["list", "add", "clear_checked"] },
        { key: "itemName", label: "Item Name (for add)", type: "text", placeholder: "Bio Hafermilch 1L" },
        { key: "category", label: "Category", type: "text", placeholder: "Frische & Markt" }
      ],
      execute: async (input, ctx) => {
        const mealDb = openAppDatabaseReadWrite(ctx.dataDir, "meal-planner");
        const act = String(input.action || "list").trim();
        if (act === "add" && String(input.itemName || "").trim()) {
          mealDb.execute(
            "INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)",
            [String(input.itemName).trim(), String(input.category || "General"), "Axons"]
          );
        } else if (act === "clear_checked") {
          mealDb.execute("DELETE FROM grocery_items WHERE checked = 1");
        }
        const items = mealDb.query("SELECT * FROM grocery_items ORDER BY checked ASC, id DESC");
        const openCount = items.filter((i) => !i.checked).length;
        return {
          summary: `${openCount} open items on grocery list (${items.length} total)`,
          data: { openCount, totalCount: items.length, items }
        };
      }
    });
    this.register({
      id: "food.openfoodfacts.barcode",
      name: "OpenFoodFacts: EAN Barcode Lookup",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Looks up nutritional values (kcal, protein, carbs, fat, fiber) for any EAN/GTIN barcode via OpenFoodFacts v2.",
      defaultInput: { barcode: "5449000000996" },
      fields: [
        { key: "barcode", label: "EAN / GTIN Barcode", type: "text", placeholder: "5449000000996", required: true }
      ],
      execute: async (input) => {
        const barcode = String(input.barcode || "").replace(/[^0-9]/g, "");
        if (!barcode) throw new Error("Valid numeric EAN barcode is required");
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
          {
            headers: { "User-Agent": "Thassi-Axons/2.0" },
            signal: AbortSignal.timeout(5e3)
          }
        );
        if (!res.ok) {
          throw new Error(`OpenFoodFacts HTTP ${res.status}`);
        }
        const payload = await res.json();
        if (payload.status !== 1 || !payload.product) {
          throw new Error(`Barcode ${barcode} not found in OpenFoodFacts.`);
        }
        const p = payload.product;
        const nut = p.nutriments || {};
        const name = p.product_name_de || p.product_name || `Product ${barcode}`;
        const calories = Math.round(Number(nut["energy-kcal_100g"] ?? nut["energy-kcal"] ?? 0));
        const protein = Number(Number(nut.proteins_100g ?? 0).toFixed(1));
        const carbs = Number(Number(nut.carbohydrates_100g ?? 0).toFixed(1));
        const fat = Number(Number(nut.fat_100g ?? 0).toFixed(1));
        return {
          summary: `${name} (${calories} kcal/100g \xB7 P:${protein}g C:${carbs}g F:${fat}g)`,
          data: {
            barcode,
            name,
            brand: p.brands || "",
            quantity: p.quantity || "100g",
            calories_per_100g: calories,
            protein_per_100g: protein,
            carbs_per_100g: carbs,
            fat_per_100g: fat,
            fiber_per_100g: Number(Number(nut.fiber_100g ?? 0).toFixed(1)),
            sugar_per_100g: Number(Number(nut.sugars_100g ?? 0).toFixed(1)),
            salt_per_100g: Number(Number(nut.salt_100g ?? 0).toFixed(2)),
            source: "openfoodfacts_api"
          }
        };
      }
    });
    this.register({
      id: "bambu.printer.telemetry",
      name: "BambuLab X1C: LAN Probe & Telemetry",
      domainCode: "3DP",
      category: "bambu",
      icon: "3DP",
      description: "Probes the BambuLab printer on LAN (MQTT TLS :8883 / FTPS :990), checks Shelly plug power, and returns active 3D print projects.",
      defaultInput: { printerIp: "192.168.188.175", shellyEntity: "switch.buro_og_plug_90" },
      fields: [
        { key: "printerIp", label: "Printer IP", type: "text", placeholder: "192.168.188.175" },
        { key: "shellyEntity", label: "Shelly Power Plug Entity", type: "text", placeholder: "switch.buro_og_plug_90" }
      ],
      execute: async (input, ctx) => {
        const ip = String(input.printerIp || "192.168.188.175").trim();
        const shellyId = String(input.shellyEntity || "switch.buro_og_plug_90").trim();
        const probePort = (port) => new Promise((resolve) => {
          const sock = net.connect(port, ip, () => {
            sock.destroy();
            resolve(true);
          });
          sock.setTimeout(1500, () => {
            sock.destroy();
            resolve(false);
          });
          sock.on("error", () => resolve(false));
        });
        const [mqttOpen, ftpsOpen, shellyState] = await Promise.all([
          probePort(8883),
          probePort(990),
          ctx.ha.getState(shellyId).catch(() => null)
        ]);
        let projects = [];
        try {
          const printDb = openAppDatabaseReadWrite(ctx.dataDir, "3d-print");
          projects = printDb.query(
            "SELECT id, name, category, status, updated_at FROM print_projects ORDER BY updated_at DESC"
          );
        } catch {
        }
        return {
          summary: `Printer ${ip}: MQTT(:8883)=${mqttOpen ? "OPEN" : "OFFLINE"} \xB7 Plug=${shellyState?.state ?? "unknown"} \xB7 ${projects.length} CAD projects`,
          data: {
            printerIp: ip,
            mqttPort8883Reachable: mqttOpen,
            ftpsPort990Reachable: ftpsOpen,
            shellyPowerPlug: {
              entityId: shellyId,
              state: shellyState?.state ?? "unknown"
            },
            projects
          }
        };
      }
    });
    this.register({
      id: "vision.detections.recent",
      name: "Camera Vision: Recent Object Detections",
      domainCode: "VISION",
      category: "vision",
      icon: "VISION",
      description: "Reads the latest COCO-SSD object detections, motion scores, and camera health metrics.",
      defaultInput: { limit: "15" },
      fields: [
        { key: "limit", label: "Max Detections", type: "number", placeholder: "15" }
      ],
      execute: async (input, ctx) => {
        const limit = Math.max(1, Math.min(100, Number(input.limit || 15)));
        const visDb = openAppDatabaseReadWrite(ctx.dataDir, "camera-vision");
        const cameras = visDb.query(
          "SELECT id, name, room, source_type, lan_ip, optimization_mode, enabled, last_sampled_at, last_status FROM camera_sources"
        );
        const detections = visDb.query(
          `SELECT id, camera_id, camera_name, sampled_at, status, scene_summary, total_objects, person_count, vehicle_count, motion_pct, processing_ms
           FROM vision_detections ORDER BY id DESC LIMIT ?`,
          [limit]
        );
        return {
          summary: `${detections.length} detections across ${cameras.length} configured cameras`,
          data: { cameras, detections }
        };
      }
    });
    this.register({
      id: "weather.openmeteo.forecast",
      name: "Weather: Open-Meteo Forecast",
      domainCode: "WX",
      category: "weather",
      icon: "WX",
      description: "Fetches live temperature, wind, humidity, and 24-hour forecast from Open-Meteo.",
      defaultInput: {
        lat: "48.0444",
        lon: "15.6689",
        locationName: "St. Veit / G\xF6lsen"
      },
      fields: [
        { key: "lat", label: "Latitude", type: "text", placeholder: "48.0444" },
        { key: "lon", label: "Longitude", type: "text", placeholder: "15.6689" },
        { key: "locationName", label: "Location Label", type: "text", placeholder: "St. Veit / G\xF6lsen" }
      ],
      execute: async (input) => {
        const lat = Number(input.lat || 48.0444);
        const lon = Number(input.lon || 15.6689);
        const locationName = String(input.locationName || "St. Veit / G\xF6lsen");
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FVienna&forecast_days=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
        if (!res.ok) {
          throw new Error(`Open-Meteo API ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const tempC = data.current?.temperature_2m;
        const humidity = data.current?.relative_humidity_2m;
        const windKmh = data.current?.wind_speed_10m;
        const maxC = data.daily?.temperature_2m_max?.[0];
        const minC = data.daily?.temperature_2m_min?.[0];
        return {
          summary: `${locationName}: ${tempC} \xB0C (Min ${minC}\xB0 / Max ${maxC}\xB0, RH ${humidity}%)`,
          data: {
            provider: "open-meteo",
            locationName,
            lat,
            lon,
            tempC,
            apparentTempC: data.current?.apparent_temperature,
            humidityPct: humidity,
            windKmh,
            tempMaxC: maxC,
            tempMinC: minC,
            formattedText: `${locationName}: ${tempC} \xB0C (${minC}\u2013${maxC} \xB0C, Wind ${windKmh} km/h)`
          }
        };
      }
    });
    this.register({
      id: "github.list_issues",
      name: "GitHub: List Repository Issues",
      domainCode: "GH",
      category: "github",
      icon: "GH",
      description: "Fetches open or closed issues from GitHub REST API v3.",
      defaultInput: { repo: "tsimhofer/thassi", state: "open" },
      fields: [
        { key: "repo", label: "Owner / Repository", type: "text", placeholder: "tsimhofer/thassi", required: true },
        { key: "state", label: "State", type: "select", options: ["open", "closed", "all"] }
      ],
      execute: async (input, ctx) => {
        const repo = String(input.repo || "tsimhofer/thassi").trim();
        const state = String(input.state || "open").trim();
        const headers = {
          Accept: "application/vnd.github+json",
          "User-Agent": "Thassi-Axons/2.0"
        };
        if (ctx.credentials?.githubToken) {
          headers.Authorization = `Bearer ${ctx.credentials.githubToken}`;
        }
        const res = await fetch(
          `https://api.github.com/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=15`,
          { headers, signal: AbortSignal.timeout(5e3) }
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`GitHub API ${res.status} (${repo}): ${errText || res.statusText}`);
        }
        const rawIssues = await res.json();
        const issues = rawIssues.map((iss) => ({
          number: iss.number,
          title: iss.title,
          state: iss.state,
          author: iss.user?.login || "unknown",
          url: iss.html_url,
          createdAt: iss.created_at
        }));
        const formattedText = issues.length > 0 ? issues.map((i) => `#${i.number} [${i.state}] ${i.title} (@${i.author})`).join("\n") : `No ${state} issues in ${repo}`;
        return {
          summary: `${issues.length} issues in ${repo} (${state})`,
          data: { repo, count: issues.length, issues, formattedText }
        };
      }
    });
    this.register({
      id: "github.create_issue",
      name: "GitHub: Create Issue",
      domainCode: "GH",
      category: "github",
      icon: "GH",
      description: "Creates a GitHub issue via POST /repos/:owner/:repo/issues.",
      defaultInput: {
        repo: "tsimhofer/thassi",
        title: "[Axon] {{$input}}",
        body: "{{$input}}"
      },
      fields: [
        { key: "repo", label: "Owner / Repository", type: "text", placeholder: "tsimhofer/thassi", required: true },
        { key: "title", label: "Issue Title", type: "text", placeholder: "Issue title", required: true },
        { key: "body", label: "Body (Markdown)", type: "textarea", placeholder: "{{$input}}" }
      ],
      execute: async (input, ctx) => {
        const repo = String(input.repo || "tsimhofer/thassi").trim();
        const title = String(input.title || "").trim();
        const body = String(input.body || "").trim();
        if (!title) throw new Error("Issue title is required");
        if (!ctx.credentials?.githubToken) {
          throw new Error("github_token is required to create issues.");
        }
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ctx.credentials.githubToken}`,
            "Content-Type": "application/json",
            "User-Agent": "Thassi-Axons/2.0"
          },
          body: JSON.stringify({ title, body }),
          signal: AbortSignal.timeout(5e3)
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`GitHub Create Issue ${res.status}: ${errText || res.statusText}`);
        }
        const created = await res.json();
        return {
          summary: `Created Issue #${created.number} in ${repo}`,
          data: { repo, issueNumber: created.number, url: created.html_url, title: created.title }
        };
      }
    });
    this.register({
      id: "gemini.generate",
      name: "Gemini AI: Generate & Synthesize",
      domainCode: "AI",
      category: "gemini",
      icon: "AI",
      description: "Calls Google Gemini API (generateContent) to analyze or transform upstream data.",
      defaultInput: {
        model: "gemini-2.5-flash",
        prompt: "Analyze concisely:\n\n{{$input}}"
      },
      fields: [
        {
          key: "model",
          label: "Model",
          type: "select",
          options: ["gemini-2.5-flash", "gemini-2.5-pro"]
        },
        {
          key: "prompt",
          label: "Prompt (supports {{$input}})",
          type: "textarea",
          placeholder: "Analyze:\n{{$input}}",
          required: true
        }
      ],
      execute: async (input, ctx) => {
        const model = String(input.model || "gemini-2.5-flash").trim();
        const promptText = String(input.prompt || "").trim();
        if (!promptText) throw new Error("Prompt is required");
        if (!ctx.credentials?.geminiApiKey) {
          throw new Error("gemini_api_key is not configured.");
        }
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(ctx.credentials.geminiApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }]
            }),
            signal: AbortSignal.timeout(12e3)
          }
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Gemini API ${res.status}: ${errText || res.statusText}`);
        }
        const gemData = await res.json();
        const replyText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || "Empty response from Gemini.";
        return {
          summary: replyText.slice(0, 100).replace(/\n+/g, " "),
          data: { model, response: replyText, formattedText: replyText }
        };
      }
    });
    this.register({
      id: "system.notes.manage",
      name: "System Notes: Read & Append",
      domainCode: "SYS",
      category: "system",
      icon: "SYS",
      description: "Reads or creates quick notes in the shared SQLite database.",
      defaultInput: { action: "list", content: "" },
      fields: [
        { key: "action", label: "Action", type: "select", options: ["list", "add"] },
        { key: "content", label: "Note Content (for add)", type: "textarea", placeholder: "Note text..." }
      ],
      execute: async (input, ctx) => {
        const act = String(input.action || "list").trim();
        if (act === "add" && String(input.content || "").trim()) {
          ctx.sharedDb.execute(
            "INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)",
            [String(input.content).trim(), (/* @__PURE__ */ new Date()).toISOString()]
          );
        }
        const notes = ctx.sharedDb.query(
          "SELECT id, content, pinned, created_at FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50"
        );
        return {
          summary: `${notes.length} notes in shared database`,
          data: { count: notes.length, notes }
        };
      }
    });
    this.register({
      id: "http.request",
      name: "HTTP: Generic REST Connector",
      domainCode: "HTTP",
      category: "http",
      icon: "HTTP",
      description: "Executes a live HTTP GET/POST/PUT/DELETE call to any endpoint.",
      defaultInput: {
        method: "GET",
        endpoint: "http://192.168.188.92:8099/healthz",
        headersJson: "{}",
        payload: ""
      },
      fields: [
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"] },
        { key: "endpoint", label: "URL", type: "text", placeholder: "https://api.example.com/v1", required: true },
        { key: "headersJson", label: "Headers (JSON)", type: "textarea", placeholder: "{}" },
        { key: "payload", label: "Body (POST/PUT)", type: "textarea", placeholder: "{{$input}}" }
      ],
      execute: async (input) => {
        const method = String(input.method || "GET").toUpperCase();
        const url = String(input.endpoint || input.url || "").trim();
        if (!url) throw new Error("Endpoint URL is required");
        let customHeaders = {};
        if (input.headersJson && String(input.headersJson).trim()) {
          try {
            customHeaders = JSON.parse(String(input.headersJson));
          } catch {
            throw new Error("Invalid JSON in headersJson");
          }
        }
        const init = {
          method,
          headers: {
            Accept: "application/json, text/plain, */*",
            ...customHeaders
          },
          signal: AbortSignal.timeout(8e3)
        };
        if (method !== "GET" && method !== "HEAD" && input.payload) {
          const bodyStr = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload);
          init.body = bodyStr;
          if (!customHeaders["Content-Type"] && !customHeaders["content-type"]) {
            init.headers["Content-Type"] = "application/json";
          }
        }
        const res = await fetch(url, init);
        const contentType = res.headers.get("content-type") || "";
        const bodyData = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status} (${method} ${url}): ${typeof bodyData === "string" ? bodyData.slice(0, 200) : JSON.stringify(bodyData).slice(0, 200)}`
          );
        }
        const formattedText = typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData, null, 2);
        return {
          summary: `${method} ${url} -> ${res.status} OK`,
          data: {
            status: res.status,
            url,
            method,
            response: bodyData,
            formattedText: formattedText.slice(0, 2e3)
          }
        };
      }
    });
    this.register({
      id: "trigger.manual",
      name: "Manual / Webhook Trigger",
      domainCode: "TRIG",
      category: "trigger",
      icon: "TRIG",
      description: "Starts an Axon chain manually or via HTTP webhook.",
      defaultInput: { payload: '{"source":"axons"}' },
      fields: [
        { key: "payload", label: "Initial Payload", type: "textarea", placeholder: '{"source":"manual"}' }
      ],
      execute: async (input) => ({
        summary: `Triggered at ${(/* @__PURE__ */ new Date()).toLocaleTimeString("de-AT")}`,
        data: { triggeredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: input.payload || "{}" }
      })
    });
    this.register({
      id: "trigger.schedule",
      name: "Cron / Interval Schedule",
      domainCode: "TRIG",
      category: "trigger",
      icon: "TRIG",
      description: "Triggers an Axon flow on a recurring interval.",
      defaultInput: { cron: "0 7 * * *", intervalSeconds: "900", timezone: "Europe/Vienna" },
      fields: [
        { key: "cron", label: "Cron Expression", type: "text", placeholder: "0 7 * * *" },
        { key: "intervalSeconds", label: "Interval (s)", type: "number", placeholder: "900" },
        { key: "timezone", label: "Timezone", type: "text", placeholder: "Europe/Vienna" }
      ],
      execute: async (input) => ({
        summary: `Schedule active (${input.cron || `${input.intervalSeconds}s`})`,
        data: {
          triggeredAt: (/* @__PURE__ */ new Date()).toISOString(),
          cron: input.cron,
          intervalSeconds: Number(input.intervalSeconds || 900),
          timezone: input.timezone || "Europe/Vienna"
        }
      })
    });
  }
};

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
    const attendeeList = [];
    let dtStart = null;
    let dtEnd = null;
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx <= 0) continue;
      const rawKeyPart = line.slice(0, colonIdx);
      const keyPart = rawKeyPart.toUpperCase();
      const valPart = line.slice(colonIdx + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",").trim();
      if (keyPart === "UID") uid = valPart;
      else if (keyPart.startsWith("SUMMARY")) summary = valPart;
      else if (keyPart.startsWith("DESCRIPTION")) description = valPart;
      else if (keyPart.startsWith("LOCATION")) location = valPart;
      else if (keyPart.startsWith("ATTENDEE")) {
        const cnMatch = rawKeyPart.match(/CN="?([^";:]+)"?/i);
        const mailClean = valPart.replace(/^mailto:/i, "").trim();
        const label = (cnMatch ? cnMatch[1].trim() : mailClean) || mailClean;
        if (label && !attendeeList.includes(label)) attendeeList.push(label);
      } else if (keyPart.startsWith("DTSTART")) dtStart = parseIcsDate(valPart);
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
      attendees: attendeeList.join(", "),
      source: "ics_feed"
    });
  }
  return results;
}
var DEFAULT_CAL_COLORS = [
  "#38bdf8",
  "#4ade80",
  "#a855f7",
  "#f472b6",
  "#fbbf24",
  "#fb923c",
  "#2dd4bf",
  "#818cf8"
];
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
  }
  ctx.db.execute("DELETE FROM calendar_events WHERE external_id LIKE 'seed_%'");
  function cleanupCaseDuplicateCalendars() {
    const rows = ctx.db.query("SELECT * FROM calendar_settings");
    const byLower = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const k = r.calendar_name.toLowerCase();
      const arr = byLower.get(k) || [];
      arr.push(r);
      byLower.set(k, arr);
    }
    for (const [, group] of byLower.entries()) {
      if (group.length <= 1) continue;
      const canonical = group.find(
        (g) => g.external_cal_id && !g.external_cal_id.startsWith("calendar.") && g.external_cal_id !== g.calendar_name
      ) || group[0];
      for (const dup of group) {
        if (dup.calendar_name === canonical.calendar_name) continue;
        ctx.db.execute("UPDATE calendar_events SET calendar_name = ? WHERE calendar_name = ?", [
          canonical.calendar_name,
          dup.calendar_name
        ]);
        ctx.db.execute("DELETE FROM calendar_settings WHERE calendar_name = ?", [dup.calendar_name]);
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
  function ensureCalendarSetting(calendarName, externalCalId = "", color = "", source = "google_oauth", defaultShowInHorizon = 1) {
    const cleanName = (calendarName || "").trim();
    if (!cleanName) return;
    const existing = ctx.db.queryOne(
      "SELECT * FROM calendar_settings WHERE LOWER(calendar_name) = LOWER(?)",
      [cleanName]
    );
    if (!existing) {
      const countRow = ctx.db.queryOne(
        "SELECT COUNT(*) as cnt FROM calendar_settings"
      );
      const assignedColor = color || DEFAULT_CAL_COLORS[(countRow?.cnt || 0) % DEFAULT_CAL_COLORS.length];
      ctx.db.execute(
        `INSERT INTO calendar_settings (calendar_name, external_cal_id, color, source, show_in_horizon, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cleanName,
          externalCalId || cleanName,
          assignedColor,
          source,
          defaultShowInHorizon ? 1 : 0,
          (/* @__PURE__ */ new Date()).toISOString()
        ]
      );
    } else {
      const isRealGoogleCal = Boolean(externalCalId && !externalCalId.startsWith("calendar.") && externalCalId !== cleanName);
      const targetName = isRealGoogleCal ? cleanName : existing.calendar_name;
      if (targetName !== existing.calendar_name) {
        ctx.db.execute("UPDATE calendar_events SET calendar_name = ? WHERE LOWER(calendar_name) = LOWER(?)", [
          targetName,
          cleanName
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
          [targetName, externalCalId, externalCalId, color, color, (/* @__PURE__ */ new Date()).toISOString(), existing.calendar_name]
        );
      }
    }
  }
  cleanupCaseDuplicateCalendars();
  function trySyncGoogleOAuthFromHomeAssistantStorage() {
    const storageDirs = ["/homeassistant/.storage", "/config/.storage"];
    for (const dir of storageDirs) {
      const entriesFile = path3.join(dir, "core.config_entries");
      const credsFile = path3.join(dir, "application_credentials");
      if (!fs3.existsSync(entriesFile)) continue;
      try {
        const entriesRaw = JSON.parse(fs3.readFileSync(entriesFile, "utf-8"));
        const entries = entriesRaw?.data?.entries || [];
        const googleEntry = entries.find(
          (e) => e.domain === "google" && e.data && e.data.token && e.data.token.refresh_token
        );
        if (!googleEntry) continue;
        const tokenObj = googleEntry.data.token;
        const authImpl = googleEntry.data.auth_implementation;
        let clientId = "";
        let clientSecret = "";
        if (fs3.existsSync(credsFile)) {
          const credsRaw = JSON.parse(fs3.readFileSync(credsFile, "utf-8"));
          const items = credsRaw?.data?.items || [];
          const matchedCred = items.find((it) => it.id === authImpl || it.domain === "google") || items[0];
          if (matchedCred) {
            clientId = matchedCred.client_id || "";
            clientSecret = matchedCred.client_secret || "";
          }
        }
        if (clientId && clientSecret) {
          const curCfg = ctx.google.getConfig();
          ctx.google.saveConfig({
            clientId,
            clientSecret,
            redirectUri: curCfg?.redirectUri || "http://192.168.188.92:8099/api/system/google/callback",
            scopes: tokenObj.scope ? String(tokenObj.scope).split(" ") : [
              "https://www.googleapis.com/auth/calendar",
              "https://www.googleapis.com/auth/calendar.readonly"
            ]
          });
        }
        if (tokenObj.access_token || tokenObj.refresh_token) {
          const expiryDate = tokenObj.expires_at ? Number(tokenObj.expires_at) * 1e3 : Date.now() + 3e3 * 1e3;
          ctx.google.saveTokens({
            accessToken: tokenObj.access_token || "",
            refreshToken: tokenObj.refresh_token,
            expiryDate,
            scope: tokenObj.scope,
            tokenType: tokenObj.token_type || "Bearer"
          });
          ctx.sharedDb.kvSet("google_oauth_account_email", googleEntry.title || "Google Calendar");
          return {
            imported: true,
            accountEmail: googleEntry.title || "Google Account",
            details: `Imported Google OAuth2 credentials & refresh token for ${googleEntry.title || "Google Calendar"}`
          };
        }
      } catch (err) {
        console.warn("[google-calendar] Failed reading HA .storage OAuth:", err);
      }
    }
    return { imported: false };
  }
  trySyncGoogleOAuthFromHomeAssistantStorage();
  function upsertEvent(ev) {
    ensureCalendarSetting(ev.calendar_name, ev.calendar_name, "", ev.source, 1);
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
        ev.attendees || "",
        ev.source
      ]
    );
  }
  function normalizeGoogleEventDates(rawStart, rawEnd, isAllDay) {
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
    return { startDate, endDate, durationMinutes };
  }
  async function syncExternalCalendars() {
    let haCalendarSynced = 0;
    let oauthSynced = 0;
    let icsSynced = 0;
    const errors = [];
    if (!ctx.google.getStatus().authorized) {
      trySyncGoogleOAuthFromHomeAssistantStorage();
    }
    const startIso = new Date(Date.now() - 7 * 864e5).toISOString();
    const endIso = new Date(Date.now() + 30 * 864e5).toISOString();
    const oauthCalLowerNames = /* @__PURE__ */ new Set();
    const oauthStatus = ctx.google.getStatus();
    if (oauthStatus.authorized) {
      try {
        const calListRes = await ctx.google.googleFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
        const calItems = calListRes.items || [];
        for (const gCal of calItems) {
          const calTitle = String(gCal.summaryOverride || gCal.summary || gCal.id).trim();
          const lowerTitle = calTitle.toLowerCase();
          oauthCalLowerNames.add(lowerTitle);
          const defaultShow = lowerTitle.includes("kalenderwochen") || lowerTitle.includes("feiertage in deutschland") ? 0 : 1;
          ensureCalendarSetting(
            calTitle,
            gCal.id,
            gCal.backgroundColor || "",
            "google_oauth",
            defaultShow
          );
          if (gCal.primary && gCal.id.includes("@")) {
            ctx.sharedDb.kvSet("google_oauth_account_email", gCal.id);
          }
          try {
            const params = new URLSearchParams({
              timeMin: startIso,
              timeMax: endIso,
              singleEvents: "true",
              orderBy: "startTime",
              maxResults: "250"
            });
            const evRes = await ctx.google.googleFetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                gCal.id
              )}/events?${params.toString()}`
            );
            for (const item of evRes.items || []) {
              if (item.status === "cancelled") continue;
              const rawStart = item.start?.dateTime || item.start?.date;
              const rawEnd = item.end?.dateTime || item.end?.date;
              if (!rawStart || !item.summary) continue;
              const isAllDay = !item.start?.dateTime;
              const { startDate, endDate, durationMinutes } = normalizeGoogleEventDates(
                rawStart,
                rawEnd,
                isAllDay
              );
              const attendeeNames = (item.attendees || []).map((a) => (a.displayName || a.email || "").trim()).filter(Boolean);
              const extId = `gcal_${gCal.id}_${item.id}`;
              upsertEvent({
                external_id: extId,
                calendar_name: calTitle,
                title: item.summary,
                category: inferEventCategory(
                  item.summary,
                  item.description || "",
                  "personal",
                  calTitle
                ),
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                duration_minutes: durationMinutes,
                location: item.location || "",
                description: item.description || "",
                attendees: attendeeNames.join(", "),
                source: "google_oauth"
              });
              oauthSynced++;
            }
          } catch (calFetchErr) {
            errors.push(
              `Google API (${calTitle}): ${calFetchErr instanceof Error ? calFetchErr.message : String(calFetchErr)}`
            );
          }
        }
      } catch (err) {
        errors.push(`Google OAuth API: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        const calStates = await ctx.ha.getStates("calendar");
        for (const cal of calStates) {
          if (cal.state === "unavailable") continue;
          const calName = String(
            cal.attributes?.friendly_name || cal.entity_id.replace("calendar.", "")
          ).trim();
          const lowerName = calName.toLowerCase();
          if (oauthCalLowerNames.has(lowerName)) {
            ctx.db.execute(
              "DELETE FROM calendar_events WHERE LOWER(calendar_name) = LOWER(?) AND external_id LIKE ?",
              [calName, "ha_%"]
            );
            continue;
          }
          const defaultShow = lowerName.includes("kalenderwochen") || lowerName.includes("feiertage in deutschland") ? 0 : 1;
          ensureCalendarSetting(calName, cal.entity_id, "", "google_oauth", defaultShow);
          try {
            const endpoint = `/calendars/${encodeURIComponent(cal.entity_id)}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
            const items = typeof ctx.ha.getCalendarEvents === "function" ? await ctx.ha.getCalendarEvents(cal.entity_id, startIso, endIso) : await ctx.ha.request(endpoint);
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
              const extId = item.uid || `ha_${cal.entity_id}_${rawStart}_${item.summary.replace(/[^a-z0-9]/gi, "_")}`;
              upsertEvent({
                external_id: extId,
                calendar_name: calName,
                title: item.summary,
                category: inferEventCategory(
                  item.summary,
                  item.description || "",
                  "personal",
                  calName
                ),
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
            errors.push(
              `${cal.entity_id}: ${calErr instanceof Error ? calErr.message : String(calErr)}`
            );
          }
        }
      }
    } catch (err) {
      errors.push(`HA Calendar sync: ${err instanceof Error ? err.message : String(err)}`);
    }
    const feeds = ctx.db.query("SELECT * FROM calendar_feeds");
    for (const feed of feeds) {
      try {
        ensureCalendarSetting(feed.name, feed.ics_url, "", "ics_feed", 1);
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
  function getCalendarsWithCounts() {
    const distinctNames = ctx.db.query(
      "SELECT DISTINCT calendar_name, source FROM calendar_events"
    );
    for (const row of distinctNames) {
      ensureCalendarSetting(row.calendar_name, row.calendar_name, "", row.source || "google_oauth", 1);
    }
    const rawSettings = ctx.db.query(
      "SELECT * FROM calendar_settings ORDER BY calendar_name ASC"
    );
    const counts = ctx.db.query(
      "SELECT calendar_name, COUNT(*) as cnt FROM calendar_events GROUP BY calendar_name"
    );
    const countMap = /* @__PURE__ */ new Map();
    for (const c of counts) {
      countMap.set(c.calendar_name, (countMap.get(c.calendar_name) || 0) + Number(c.cnt || 0));
    }
    return rawSettings.map((s) => ({
      calendar_name: s.calendar_name,
      external_cal_id: s.external_cal_id,
      color: s.color || "#38bdf8",
      source: s.source || "google_oauth",
      show_in_horizon: Boolean(s.show_in_horizon),
      event_count: countMap.get(s.calendar_name) || 0
    }));
  }
  function getVisibleCalendarEvents(limit = 150) {
    const calendars = getCalendarsWithCounts();
    const hiddenNames = new Set(
      calendars.filter((c) => !c.show_in_horizon).map((c) => c.calendar_name)
    );
    const all = ctx.db.query(
      "SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT ?",
      [limit * 2]
    );
    return all.filter((ev) => !hiddenNames.has(ev.calendar_name)).slice(0, limit);
  }
  async function publishCalendarSensorsAndSharedState() {
    const now = /* @__PURE__ */ new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const visibleEvents = getVisibleCalendarEvents(250);
    const todayEvents = visibleEvents.filter((e) => e.start_time.slice(0, 10) === todayPrefix);
    const nextEvent = visibleEvents.find((e) => e.end_time >= now.toISOString()) || null;
    const totalMinutesToday = todayEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const busyHoursToday = Number((totalMinutesToday / 60).toFixed(1));
    const totalWeeklyHours = Number(
      (visibleEvents.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(1)
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
    const calendars = getCalendarsWithCounts();
    const events = getVisibleCalendarEvents(150);
    const allEvents = db.query(
      "SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT 250"
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
    const oauthStatus = google.getStatus();
    const accountEmail = sharedDb.kvGet("google_oauth_account_email") || null;
    return {
      events,
      allEvents,
      calendars,
      feeds,
      byCategory,
      googleOAuth: {
        ...oauthStatus,
        accountEmail
      },
      mealPlannerToday: mealPlannerToday || null
    };
  });
  ctx.route("GET", "/calendars", () => {
    return {
      calendars: getCalendarsWithCounts()
    };
  });
  ctx.route("POST", "/calendars/visibility", async (req, { db }) => {
    const body = req.body || {};
    if (body.calendar_name !== void 0 && body.show_in_horizon !== void 0) {
      ensureCalendarSetting(body.calendar_name, "", "", "google_oauth", body.show_in_horizon ? 1 : 0);
      db.execute(
        "UPDATE calendar_settings SET show_in_horizon = ?, updated_at = ? WHERE calendar_name = ?",
        [body.show_in_horizon ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString(), body.calendar_name]
      );
    }
    if (body.calendars && typeof body.calendars === "object") {
      for (const [calName, visible] of Object.entries(body.calendars)) {
        ensureCalendarSetting(calName, "", "", "google_oauth", visible ? 1 : 0);
        db.execute(
          "UPDATE calendar_settings SET show_in_horizon = ?, updated_at = ? WHERE calendar_name = ?",
          [visible ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString(), calName]
        );
      }
    }
    await publishCalendarSensorsAndSharedState();
    return {
      updated: true,
      calendars: getCalendarsWithCounts(),
      events: getVisibleCalendarEvents(150)
    };
  });
  ctx.route("GET", "/oauth/status", (_req, { google, sharedDb }) => {
    return {
      ...google.getStatus(),
      accountEmail: sharedDb.kvGet("google_oauth_account_email") || null
    };
  });
  ctx.route("POST", "/oauth/config", async (req, { google }) => {
    const body = req.body || {};
    if (body.importFromHa) {
      const imp = trySyncGoogleOAuthFromHomeAssistantStorage();
      const syncRes = await syncExternalCalendars();
      return {
        ...google.getStatus(),
        importedFromHa: imp.imported,
        accountEmail: imp.accountEmail || null,
        details: imp.details,
        syncRes
      };
    }
    const status = google.saveConfig({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      redirectUri: body.redirectUri,
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.body.read",
        "https://www.googleapis.com/auth/fitness.sleep.read"
      ]
    });
    if (body.refreshToken?.trim()) {
      google.saveTokens({
        accessToken: "",
        refreshToken: body.refreshToken.trim(),
        expiryDate: 0
      });
      const syncRes = await syncExternalCalendars();
      return { ...google.getStatus(), syncRes };
    }
    return status;
  });
  ctx.route("GET", "/oauth/auth-url", (_req, { google }) => {
    const url = google.getAuthorizationUrl([
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.readonly"
    ]);
    return { url };
  });
  ctx.route("POST", "/oauth/exchange", async (req, { google }) => {
    const body = req.body || {};
    if (!body.code?.trim()) {
      return { status: 400, body: { error: "Authorization code is required" } };
    }
    const status = await google.exchangeCode(body.code.trim());
    const syncRes = await syncExternalCalendars();
    return { status, syncRes };
  });
  ctx.route("GET", "/events", () => {
    return { events: getVisibleCalendarEvents(250) };
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
    const targetCalendarName = (body.calendar_name || "Thomas.simhofer@gmail.com").trim();
    let createdExternalId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (ctx.google.getStatus().authorized) {
      try {
        const setting = ctx.db.queryOne(
          "SELECT * FROM calendar_settings WHERE LOWER(calendar_name) = LOWER(?)",
          [targetCalendarName]
        );
        const calId = setting?.external_cal_id && !setting.external_cal_id.startsWith("calendar.") ? setting.external_cal_id : "primary";
        const created = await ctx.google.googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
          {
            method: "POST",
            body: JSON.stringify({
              summary: body.title.trim(),
              description: (body.description || "").trim(),
              location: (body.location || "").trim(),
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() }
            })
          }
        );
        if (created?.id) {
          createdExternalId = `gcal_${calId}_${created.id}`;
        }
      } catch {
      }
    }
    if (createdExternalId.startsWith("manual_")) {
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
    }
    upsertEvent({
      external_id: createdExternalId,
      calendar_name: targetCalendarName,
      title: body.title.trim(),
      category,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      location: (body.location || "").trim(),
      description: (body.description || "").trim(),
      source: createdExternalId.startsWith("gcal_") ? "google_oauth" : "manual"
    });
    await publishCalendarSensorsAndSharedState();
    return { created: true, external_id: createdExternalId };
  });
  ctx.route("DELETE", "/events", async (req, { db, actions }) => {
    const id = Number(req.query.id);
    const existing = db.queryOne(
      "SELECT external_id, calendar_name FROM calendar_events WHERE id = ?",
      [id]
    );
    let remoteDeleted = false;
    if (existing?.external_id && existing.external_id.startsWith("gcal_")) {
      const googleEventId = existing.external_id.replace(/^gcal_/, "");
      const reg = actions || new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
      const delRes = await reg.execute("gcal.delete_event", {
        calendarId: "primary",
        eventId: googleEventId
      });
      remoteDeleted = delRes.status === "success";
    }
    db.execute("DELETE FROM calendar_events WHERE id = ?", [id]);
    await publishCalendarSensorsAndSharedState();
    return { deleted: id, remoteDeleted };
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
    description: "Pulls upcoming events from Google Calendar OAuth2 v3 API, Home Assistant Calendars & iCal feeds, filters by Horizon visibility, and publishes HA sensors.",
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const sync = await syncExternalCalendars();
      const ha = await publishCalendarSensorsAndSharedState();
      return `Next: "${ha.nextEvent}" | Today: ${ha.todayEventCount} events (${ha.busyHoursToday}h) | Synced OAuth=${sync.oauthSynced}, HA=${sync.haCalendarSynced}, ICS=${sync.icsSynced}`;
    }
  });
});
export {
  index_default as default,
  inferEventCategory,
  parseIcsFeed
};
