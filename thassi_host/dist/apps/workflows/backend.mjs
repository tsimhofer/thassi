import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

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

// apps/workflows/shared/types.ts
var STARTER_NODE_PALETTE = [
  // 1. Triggers
  {
    typeId: "trigger.manual",
    category: "trigger",
    categoryLabel: "Triggers",
    name: "Manual / Webhook Trigger",
    subtitle: "Starts workflow on click or webhook",
    icon: "\u26A1",
    accentColor: "#f59e0b",
    n8nType: "n8n-nodes-base.webhook",
    defaultConfig: {
      webhookPath: "/webhook/run",
      payloadHint: "Trigger event"
    },
    fields: [
      {
        key: "webhookPath",
        label: "Webhook Path",
        type: "text",
        placeholder: "/webhook/run"
      },
      {
        key: "payloadHint",
        label: "Initial Input Text / JSON",
        type: "textarea",
        placeholder: "Optional test input passed to next node..."
      }
    ]
  },
  {
    typeId: "trigger.schedule",
    category: "trigger",
    categoryLabel: "Triggers",
    name: "Schedule Timer",
    subtitle: "Runs on a recurring cron / interval",
    icon: "\u23F0",
    accentColor: "#f59e0b",
    n8nType: "n8n-nodes-base.scheduleTrigger",
    defaultConfig: {
      cron: "30 7 * * *",
      timezone: "Europe/Vienna"
    },
    fields: [
      {
        key: "cron",
        label: "Cron Schedule",
        type: "text",
        placeholder: "30 7 * * * (Every day at 07:30)"
      },
      {
        key: "timezone",
        label: "Timezone",
        type: "text",
        placeholder: "Europe/Vienna"
      }
    ]
  },
  // 2. Gemini API
  {
    typeId: "gemini.generate",
    category: "gemini",
    categoryLabel: "Gemini AI",
    name: "Gemini Generate",
    subtitle: "Prompt Gemini 2.5 Flash / Pro",
    icon: "\u2728",
    accentColor: "#8b5cf6",
    n8nType: "n8n-nodes-base.googleGemini",
    defaultConfig: {
      model: "gemini-2.5-flash",
      prompt: "Summarize the incoming data in 3 concise bullet points:\n\n{{$input}}"
    },
    fields: [
      {
        key: "model",
        label: "Gemini Model",
        type: "select",
        options: [
          { label: "gemini-2.5-flash (Fast)", value: "gemini-2.5-flash" },
          { label: "gemini-2.5-pro (Reasoning)", value: "gemini-2.5-pro" }
        ]
      },
      {
        key: "prompt",
        label: "Prompt (use {{$input}} for previous node data)",
        type: "textarea",
        placeholder: "Analyze {{$input}} and return recommendations..."
      }
    ]
  },
  {
    typeId: "gemini.decide",
    category: "gemini",
    categoryLabel: "Gemini AI",
    name: "Gemini AI Classifier",
    subtitle: "Extract structured JSON / decision",
    icon: "\u{1F9E0}",
    accentColor: "#8b5cf6",
    n8nType: "n8n-nodes-base.googleGemini",
    defaultConfig: {
      model: "gemini-2.5-flash",
      prompt: "Classify urgency (HIGH / NORMAL / LOW) and suggest next action for:\n{{$input}}"
    },
    fields: [
      {
        key: "model",
        label: "Gemini Model",
        type: "select",
        options: [
          { label: "gemini-2.5-flash", value: "gemini-2.5-flash" },
          { label: "gemini-2.5-pro", value: "gemini-2.5-pro" }
        ]
      },
      {
        key: "prompt",
        label: "Classification Prompt",
        type: "textarea"
      }
    ]
  },
  // 3. Gmail API
  {
    typeId: "gmail.list_unread",
    category: "gmail",
    categoryLabel: "Gmail",
    name: "Gmail Fetch Emails",
    subtitle: "Read unread messages matching query",
    icon: "\u{1F4E7}",
    accentColor: "#ef4444",
    n8nType: "n8n-nodes-base.gmail",
    defaultConfig: {
      query: "is:unread label:INBOX",
      maxResults: "5"
    },
    fields: [
      {
        key: "query",
        label: "Gmail Search Query",
        type: "text",
        placeholder: "is:unread from:alerts@..."
      },
      {
        key: "maxResults",
        label: "Max Emails",
        type: "text",
        placeholder: "5"
      }
    ]
  },
  {
    typeId: "gmail.send",
    category: "gmail",
    categoryLabel: "Gmail",
    name: "Gmail Send Email",
    subtitle: "Send email with workflow output",
    icon: "\u{1F4E8}",
    accentColor: "#ef4444",
    n8nType: "n8n-nodes-base.gmail",
    defaultConfig: {
      to: "thomas@example.com",
      subject: "[Thassi Workflow] Automated Report",
      body: "Here is your automated workflow summary:\n\n{{$input}}"
    },
    fields: [
      {
        key: "to",
        label: "To (Recipient Email)",
        type: "text",
        placeholder: "you@gmail.com"
      },
      {
        key: "subject",
        label: "Subject",
        type: "text",
        placeholder: "Workflow Notification"
      },
      {
        key: "body",
        label: "Email Body (supports {{$input}})",
        type: "textarea"
      }
    ]
  },
  // 4. Google Calendar API
  {
    typeId: "gcal.upcoming",
    category: "gcal",
    categoryLabel: "Google Calendar",
    name: "Calendar Upcoming Events",
    subtitle: "Fetch today / next 7d schedule",
    icon: "\u{1F4C5}",
    accentColor: "#3b82f6",
    n8nType: "n8n-nodes-base.googleCalendar",
    defaultConfig: {
      calendarId: "primary",
      windowHours: "24"
    },
    fields: [
      {
        key: "calendarId",
        label: "Calendar ID",
        type: "text",
        placeholder: "primary"
      },
      {
        key: "windowHours",
        label: "Lookahead Window (Hours)",
        type: "select",
        options: [
          { label: "Next 24 Hours (Today)", value: "24" },
          { label: "Next 48 Hours", value: "48" },
          { label: "Next 7 Days (168h)", value: "168" }
        ]
      }
    ]
  },
  {
    typeId: "gcal.create_event",
    category: "gcal",
    categoryLabel: "Google Calendar",
    name: "Calendar Create Event",
    subtitle: "Add a new event or reminder",
    icon: "\u{1F5D3}\uFE0F",
    accentColor: "#3b82f6",
    n8nType: "n8n-nodes-base.googleCalendar",
    defaultConfig: {
      calendarId: "primary",
      summary: "Follow-up: {{$input}}",
      durationMinutes: "30"
    },
    fields: [
      {
        key: "calendarId",
        label: "Calendar ID",
        type: "text",
        placeholder: "primary"
      },
      {
        key: "summary",
        label: "Event Title",
        type: "text",
        placeholder: "Smart Home Maintenance"
      },
      {
        key: "durationMinutes",
        label: "Duration (minutes)",
        type: "text",
        placeholder: "30"
      }
    ]
  },
  // 5. GitHub API
  {
    typeId: "github.list_issues",
    category: "github",
    categoryLabel: "GitHub",
    name: "GitHub Fetch Issues",
    subtitle: "List issues & PRs from repository",
    icon: "\u{1F419}",
    accentColor: "#10b981",
    n8nType: "n8n-nodes-base.github",
    defaultConfig: {
      repo: "tsimhofer/taskassistant",
      state: "open"
    },
    fields: [
      {
        key: "repo",
        label: "GitHub Repository (owner/repo)",
        type: "select",
        options: [
          { label: "tsimhofer/thassi", value: "tsimhofer/thassi" },
          { label: "tsimhofer/taskassistant", value: "tsimhofer/taskassistant" },
          { label: "tsimhofer/thassi.3dprint", value: "tsimhofer/thassi.3dprint" },
          { label: "tsimhofer/thassi.finances", value: "tsimhofer/thassi.finances" },
          { label: "tsimhofer/Aurelia", value: "tsimhofer/Aurelia" },
          { label: "tsimhofer/austrian-meal-scout", value: "tsimhofer/austrian-meal-scout" }
        ]
      },
      {
        key: "state",
        label: "Issue State",
        type: "select",
        options: [
          { label: "Open Issues", value: "open" },
          { label: "All Issues (Open + Closed)", value: "all" },
          { label: "Closed Issues", value: "closed" }
        ]
      }
    ]
  },
  {
    typeId: "github.create_issue",
    category: "github",
    categoryLabel: "GitHub",
    name: "GitHub Create Issue",
    subtitle: "Open a new issue in a repository",
    icon: "\u{1F3AF}",
    accentColor: "#10b981",
    n8nType: "n8n-nodes-base.github",
    defaultConfig: {
      repo: "tsimhofer/thassi",
      title: "[Automated] Follow-up Task",
      body: "Created automatically by Thassi Workflows:\n\n{{$input}}"
    },
    fields: [
      {
        key: "repo",
        label: "Repository (owner/repo)",
        type: "select",
        options: [
          { label: "tsimhofer/thassi", value: "tsimhofer/thassi" },
          { label: "tsimhofer/taskassistant", value: "tsimhofer/taskassistant" },
          { label: "tsimhofer/thassi.3dprint", value: "tsimhofer/thassi.3dprint" },
          { label: "tsimhofer/thassi.finances", value: "tsimhofer/thassi.finances" },
          { label: "tsimhofer/Aurelia", value: "tsimhofer/Aurelia" },
          { label: "tsimhofer/austrian-meal-scout", value: "tsimhofer/austrian-meal-scout" }
        ]
      },
      {
        key: "title",
        label: "Issue Title",
        type: "text"
      },
      {
        key: "body",
        label: "Issue Body (supports {{$input}})",
        type: "textarea"
      }
    ]
  },
  // 6. Home Assistant API
  {
    typeId: "ha.get_state",
    category: "homeassistant",
    categoryLabel: "Home Assistant",
    name: "HA Read Sensor / State",
    subtitle: "Fetch live state from Home Assistant",
    icon: "\u{1F3E0}",
    accentColor: "#06b6d4",
    n8nType: "n8n-nodes-base.homeAssistant",
    defaultConfig: {
      entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur"
    },
    fields: [
      {
        key: "entityId",
        label: "Entity ID",
        type: "text",
        placeholder: "sensor.shellyhtg3_e4b32331dde0_temperatur"
      }
    ]
  },
  {
    typeId: "ha.call_service",
    category: "homeassistant",
    categoryLabel: "Home Assistant",
    name: "HA Call Service / Notify",
    subtitle: "Trigger switch, light, or notification",
    icon: "\u{1F514}",
    accentColor: "#06b6d4",
    n8nType: "n8n-nodes-base.homeAssistant",
    defaultConfig: {
      domain: "persistent_notification",
      service: "create",
      targetOrMessage: "{{$input}}"
    },
    fields: [
      {
        key: "domain",
        label: "Service Domain",
        type: "select",
        options: [
          { label: "persistent_notification (HA UI Notification)", value: "persistent_notification" },
          { label: "switch (Turn On / Off)", value: "switch" },
          { label: "light (Turn On / Off)", value: "light" },
          { label: "script (Run Script)", value: "script" }
        ]
      },
      {
        key: "service",
        label: "Service Action",
        type: "text",
        placeholder: "create / turn_on / turn_off"
      },
      {
        key: "targetOrMessage",
        label: "Message or Entity ID (supports {{$input}})",
        type: "textarea",
        placeholder: "Message text or entity_id..."
      }
    ]
  }
];
var DEFAULT_STARTER_WORKFLOWS = [
  {
    id: "wf-morning-briefing",
    name: "Morning Smart Home & Calendar Briefing",
    description: "Reads upcoming Google Calendar events, unread Gmail messages, and Home Assistant room temperature, then summarizes them with Gemini AI and sends a Home Assistant notification.",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    nodes: [
      {
        id: "node-1",
        typeId: "trigger.schedule",
        category: "trigger",
        name: "07:30 Morning Trigger",
        subtitle: "Runs daily at 07:30",
        icon: "\u23F0",
        accentColor: "#f59e0b",
        n8nType: "n8n-nodes-base.scheduleTrigger",
        x: 60,
        y: 190,
        config: { cron: "30 7 * * *", timezone: "Europe/Vienna" }
      },
      {
        id: "node-2",
        typeId: "gcal.upcoming",
        category: "gcal",
        name: "Today's Calendar",
        subtitle: "Next 24h events",
        icon: "\u{1F4C5}",
        accentColor: "#3b82f6",
        n8nType: "n8n-nodes-base.googleCalendar",
        x: 340,
        y: 60,
        config: { calendarId: "primary", windowHours: "24" }
      },
      {
        id: "node-3",
        typeId: "gmail.list_unread",
        category: "gmail",
        name: "Unread Gmail Inbox",
        subtitle: "Top 5 unread emails",
        icon: "\u{1F4E7}",
        accentColor: "#ef4444",
        n8nType: "n8n-nodes-base.gmail",
        x: 340,
        y: 190,
        config: { query: "is:unread label:INBOX", maxResults: "5" }
      },
      {
        id: "node-4",
        typeId: "ha.get_state",
        category: "homeassistant",
        name: "HA Living Room Temp",
        subtitle: "Read Shelly H&T Gen3",
        icon: "\u{1F3E0}",
        accentColor: "#06b6d4",
        n8nType: "n8n-nodes-base.homeAssistant",
        x: 340,
        y: 320,
        config: { entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur" }
      },
      {
        id: "node-5",
        typeId: "gemini.generate",
        category: "gemini",
        name: "Gemini Daily Briefing",
        subtitle: "Synthesize schedule + home state",
        icon: "\u2728",
        accentColor: "#8b5cf6",
        n8nType: "n8n-nodes-base.googleGemini",
        x: 640,
        y: 190,
        config: {
          model: "gemini-2.5-flash",
          prompt: "Create a friendly German morning briefing from Calendar, Gmail, and Home Assistant sensor data:\n\n{{$input}}"
        }
      },
      {
        id: "node-6",
        typeId: "ha.call_service",
        category: "homeassistant",
        name: "HA Push Briefing",
        subtitle: "Show persistent notification",
        icon: "\u{1F514}",
        accentColor: "#06b6d4",
        n8nType: "n8n-nodes-base.homeAssistant",
        x: 930,
        y: 190,
        config: {
          domain: "persistent_notification",
          service: "create",
          targetOrMessage: "{{$input}}"
        }
      }
    ],
    edges: [
      { id: "e-1-2", sourceNodeId: "node-1", targetNodeId: "node-2" },
      { id: "e-1-3", sourceNodeId: "node-1", targetNodeId: "node-3" },
      { id: "e-1-4", sourceNodeId: "node-1", targetNodeId: "node-4" },
      { id: "e-2-5", sourceNodeId: "node-2", targetNodeId: "node-5" },
      { id: "e-3-5", sourceNodeId: "node-3", targetNodeId: "node-5" },
      { id: "e-4-5", sourceNodeId: "node-4", targetNodeId: "node-5" },
      { id: "e-5-6", sourceNodeId: "node-5", targetNodeId: "node-6" }
    ]
  },
  {
    id: "wf-github-gemini-digest",
    name: "GitHub Issue Triage -> Gemini -> Gmail",
    description: "Fetches open GitHub issues from tsimhofer/taskassistant, prioritizes them with Gemini AI, and sends an email digest via Gmail.",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    nodes: [
      {
        id: "gh-1",
        typeId: "trigger.manual",
        category: "trigger",
        name: "Manual Start",
        subtitle: "On-demand trigger",
        icon: "\u26A1",
        accentColor: "#f59e0b",
        n8nType: "n8n-nodes-base.webhook",
        x: 70,
        y: 180,
        config: { webhookPath: "/webhook/github-triage", payloadHint: "Start GitHub issue triage" }
      },
      {
        id: "gh-2",
        typeId: "github.list_issues",
        category: "github",
        name: "Fetch GitHub Issues",
        subtitle: "tsimhofer/taskassistant",
        icon: "\u{1F419}",
        accentColor: "#10b981",
        n8nType: "n8n-nodes-base.github",
        x: 340,
        y: 180,
        config: { repo: "tsimhofer/taskassistant", state: "open" }
      },
      {
        id: "gh-3",
        typeId: "gemini.generate",
        category: "gemini",
        name: "Gemini Prioritize Issues",
        subtitle: "Summarize & rank open PRs/issues",
        icon: "\u2728",
        accentColor: "#8b5cf6",
        n8nType: "n8n-nodes-base.googleGemini",
        x: 620,
        y: 180,
        config: {
          model: "gemini-2.5-flash",
          prompt: "Review these open GitHub issues/PRs and recommend which ones to merge or fix first:\n\n{{$input}}"
        }
      },
      {
        id: "gh-4",
        typeId: "gmail.send",
        category: "gmail",
        name: "Send Gmail Digest",
        subtitle: "Email summary to maintainer",
        icon: "\u{1F4E8}",
        accentColor: "#ef4444",
        n8nType: "n8n-nodes-base.gmail",
        x: 900,
        y: 180,
        config: {
          to: "tsimhofer@gmail.com",
          subject: "[GitHub Triage] Prioritized Open Issues",
          body: "{{$input}}"
        }
      }
    ],
    edges: [
      { id: "e-gh-1", sourceNodeId: "gh-1", targetNodeId: "gh-2" },
      { id: "e-gh-2", sourceNodeId: "gh-2", targetNodeId: "gh-3" },
      { id: "e-gh-3", sourceNodeId: "gh-3", targetNodeId: "gh-4" }
    ]
  }
];

// apps/workflows/backend/index.ts
var index_default = defineThassiApp((ctx) => {
  const actionRegistry = ctx.actions || new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
  function getSavedWorkflows() {
    const stored = ctx.db.kvGet("saved_workflows");
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    ctx.db.kvSet("saved_workflows", DEFAULT_STARTER_WORKFLOWS);
    return DEFAULT_STARTER_WORKFLOWS;
  }
  function getCustomNodeTemplates() {
    return ctx.db.kvGet("custom_node_templates", []) || [];
  }
  function getCredentials() {
    const geminiApiKey = (ctx.db.kvGet("gemini_api_key") || ctx.sharedDb.kvGet("gemini_api_key") || process.env.GEMINI_API_KEY || "").trim();
    const githubToken = (ctx.db.kvGet("github_token") || ctx.sharedDb.kvGet("github_token") || process.env.GITHUB_TOKEN || "").trim();
    const googleOAuthToken = (ctx.db.kvGet("google_oauth_token") || ctx.sharedDb.kvGet("google_oauth_token") || process.env.GOOGLE_OAUTH_TOKEN || "").trim();
    return {
      geminiApiKey,
      githubToken,
      googleOAuthToken
    };
  }
  async function executeSingleNode(node, upstreamText) {
    const creds = getCredentials();
    const isCustom = node.typeId.startsWith("custom.");
    const actionId = isCustom ? "http.request" : node.typeId === "gemini.decide" ? "gemini.generate" : node.typeId;
    const actionResult = await actionRegistry.execute(actionId, node.config || {}, {
      upstreamText,
      credentials: creds
    });
    return {
      nodeId: node.id,
      nodeName: node.name,
      category: node.category,
      status: actionResult.status,
      durationMs: Math.max(1, actionResult.durationMs),
      outputSummary: actionResult.summary,
      outputData: actionResult.data
    };
  }
  function topologicalSortNodes(workflow) {
    const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
    const inDegree = /* @__PURE__ */ new Map();
    const adjacency = /* @__PURE__ */ new Map();
    for (const n of workflow.nodes) {
      inDegree.set(n.id, 0);
      adjacency.set(n.id, []);
    }
    for (const edge of workflow.edges || []) {
      if (nodesById.has(edge.sourceNodeId) && nodesById.has(edge.targetNodeId)) {
        adjacency.get(edge.sourceNodeId).push(edge.targetNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
      }
    }
    const queue = workflow.nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).sort((a, b) => a.x - b.x || a.y - b.y);
    const ordered = [];
    const visited = /* @__PURE__ */ new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      ordered.push(current);
      for (const nextId of adjacency.get(current.id) || []) {
        const nextDeg = (inDegree.get(nextId) || 1) - 1;
        inDegree.set(nextId, nextDeg);
        if (nextDeg <= 0 && !visited.has(nextId)) {
          const nextNode = nodesById.get(nextId);
          if (nextNode) {
            queue.push(nextNode);
            queue.sort((a, b) => a.x - b.x || a.y - b.y);
          }
        }
      }
    }
    for (const n of [...workflow.nodes].sort((a, b) => a.x - b.x || a.y - b.y)) {
      if (!visited.has(n.id)) {
        ordered.push(n);
      }
    }
    return ordered;
  }
  async function executeFullWorkflow(wf) {
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const nodeResults = {};
    const nodeOutputsText = {};
    const sortedNodes = topologicalSortNodes(wf);
    for (const node of sortedNodes) {
      const incomingEdges = (wf.edges || []).filter((e) => e.targetNodeId === node.id);
      const upstreamParts = incomingEdges.map((e) => nodeOutputsText[e.sourceNodeId]).filter(Boolean);
      const upstreamInput = upstreamParts.join("\n\n");
      const res = await executeSingleNode(node, upstreamInput);
      nodeResults[node.id] = res;
      const dataObj = res.outputData;
      nodeOutputsText[node.id] = typeof dataObj?.response === "string" ? dataObj.response : typeof dataObj?.formattedText === "string" ? dataObj.formattedText : res.outputSummary;
    }
    const report = {
      runId: `run-${Date.now()}`,
      workflowId: wf.id,
      workflowName: wf.name,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: Object.values(nodeResults).some((r) => r.status === "error") ? "error" : "success",
      nodeResults
    };
    ctx.db.kvSet(`workflow_last_run_${wf.id}`, report);
    return report;
  }
  function syncScheduledWorkflowJobs() {
    const workflows = getSavedWorkflows();
    for (const wf of workflows) {
      const scheduleNode = wf.nodes.find((n) => n.typeId === "trigger.schedule");
      if (scheduleNode) {
        const intervalMin = Math.max(
          1,
          Math.round(Number(scheduleNode.config?.intervalSeconds || 900) / 60)
        );
        ctx.scheduleJob({
          id: `wf-schedule-${wf.id}`,
          name: `Scheduled Workflow: ${wf.name}`,
          description: `Scheduled Workflow: ${wf.name}`,
          intervalMinutes: intervalMin,
          runOnStart: false,
          handler: async () => {
            await executeFullWorkflow(wf);
          }
        });
      }
    }
  }
  syncScheduledWorkflowJobs();
  function getDynamicPalette() {
    const customNodes = getCustomNodeTemplates();
    const starterIds = new Set(STARTER_NODE_PALETTE.map((p) => p.typeId));
    const registryExtras = actionRegistry.listActions().filter((a) => !starterIds.has(a.id)).map((a) => ({
      typeId: a.id,
      category: ["trigger", "homeassistant", "github", "gcal", "gmail", "gemini", "custom"].includes(
        a.category
      ) ? a.category : "custom",
      categoryLabel: a.category.toUpperCase(),
      name: a.name,
      subtitle: a.description,
      icon: a.icon,
      accentColor: "#14b8a6",
      n8nType: `thassi.${a.id}`,
      defaultConfig: a.defaultInput,
      fields: a.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type === "number" || f.type === "boolean" ? "text" : f.type,
        placeholder: f.placeholder,
        options: f.options ? f.options.map((opt) => ({ label: opt, value: opt })) : void 0
      }))
    }));
    return [...STARTER_NODE_PALETTE, ...registryExtras, ...customNodes];
  }
  ctx.route("GET", "/bootstrap", async () => {
    const workflows = getSavedWorkflows();
    const creds = getCredentials();
    const googleStatus = ctx.google.getStatus();
    let haEntities = [];
    try {
      const states = await ctx.ha.getStates();
      haEntities = states.slice(0, 80).map((s) => ({
        entityId: s.entity_id,
        friendlyName: String(s.attributes?.friendly_name || s.entity_id),
        state: s.state
      }));
    } catch {
    }
    const credentialsStatus = {
      geminiConfigured: Boolean(creds.geminiApiKey),
      githubConfigured: Boolean(creds.githubToken),
      googleConfigured: Boolean(creds.googleOAuthToken || googleStatus.authorized),
      haConfigured: haEntities.length > 0,
      haUrl: process.env.HA_URL || "http://192.168.188.92:8123"
    };
    return {
      axons: actionRegistry.listActions(),
      palette: getDynamicPalette(),
      workflows,
      credentialsStatus,
      haEntities
    };
  });
  ctx.route("POST", "/execute-axon", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.axonId) {
      return { ok: false, error: "Missing axonId" };
    }
    const creds = getCredentials();
    const result = await actionRegistry.execute(body.axonId, body.input || {}, {
      upstreamText: body.upstreamText,
      credentials: creds
    });
    return {
      ok: result.status === "success",
      result,
      axons: actionRegistry.listActions()
    };
  });
  ctx.route("POST", "/workflows", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.workflow || !body.workflow.id) {
      return { ok: false, error: "Missing workflow object" };
    }
    const existing = getSavedWorkflows();
    const updated = {
      ...body.workflow,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const idx = existing.findIndex((w) => w.id === updated.id);
    if (idx >= 0) {
      existing[idx] = updated;
    } else {
      existing.unshift(updated);
    }
    ctx.db.kvSet("saved_workflows", existing);
    syncScheduledWorkflowJobs();
    return { ok: true, workflows: existing, saved: updated };
  });
  ctx.route("POST", "/workflows/delete", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const existing = getSavedWorkflows().filter((w) => w.id !== body.workflowId);
    const finalWorkflows = existing.length > 0 ? existing : DEFAULT_STARTER_WORKFLOWS;
    ctx.db.kvSet("saved_workflows", finalWorkflows);
    syncScheduledWorkflowJobs();
    return { ok: true, workflows: finalWorkflows };
  });
  ctx.route("POST", "/custom-nodes", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.name?.trim()) {
      return { ok: false, error: "Missing node name" };
    }
    const customNodes = getCustomNodeTemplates();
    const newTemplate = {
      typeId: `custom.${Date.now()}`,
      category: body.category || "custom",
      categoryLabel: "Custom HTTP Nodes",
      name: body.name.trim(),
      subtitle: (body.subtitle || "Live HTTP API Connector").trim(),
      icon: body.icon || "\u{1F9E9}",
      accentColor: "#ec4899",
      n8nType: "n8n-nodes-base.httpRequest",
      defaultConfig: {
        method: "GET",
        endpoint: body.endpointOrHint || "http://192.168.188.92:8099/healthz",
        headersJson: "{}",
        payload: "{{$input}}"
      },
      fields: [
        {
          key: "method",
          label: "HTTP Method",
          type: "select",
          options: [
            { label: "GET", value: "GET" },
            { label: "POST", value: "POST" },
            { label: "PUT", value: "PUT" },
            { label: "DELETE", value: "DELETE" }
          ]
        },
        { key: "endpoint", label: "API URL / Endpoint", type: "text" },
        { key: "headersJson", label: "Headers (JSON)", type: "textarea" },
        { key: "payload", label: "Payload ({{$input}})", type: "textarea" }
      ]
    };
    customNodes.push(newTemplate);
    ctx.db.kvSet("custom_node_templates", customNodes);
    return {
      ok: true,
      palette: getDynamicPalette(),
      created: newTemplate
    };
  });
  ctx.route("POST", "/credentials", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) {
      const k = body.geminiApiKey.trim();
      ctx.db.kvSet("gemini_api_key", k);
      ctx.sharedDb.kvSet("gemini_api_key", k);
    }
    if (typeof body.githubToken === "string" && body.githubToken.trim()) {
      const t = body.githubToken.trim();
      ctx.db.kvSet("github_token", t);
      ctx.sharedDb.kvSet("github_token", t);
    }
    if (typeof body.googleOAuthToken === "string" && body.googleOAuthToken.trim()) {
      const g = body.googleOAuthToken.trim();
      ctx.db.kvSet("google_oauth_token", g);
      ctx.sharedDb.kvSet("google_oauth_token", g);
    }
    const creds = getCredentials();
    const googleStatus = ctx.google.getStatus();
    return {
      ok: true,
      credentialsStatus: {
        geminiConfigured: Boolean(creds.geminiApiKey),
        githubConfigured: Boolean(creds.githubToken),
        googleConfigured: Boolean(creds.googleOAuthToken || googleStatus.authorized),
        haConfigured: true,
        haUrl: process.env.HA_URL || "http://192.168.188.92:8123"
      }
    };
  });
  ctx.route("POST", "/execute-node", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.node) {
      return { ok: false, error: "Missing node" };
    }
    const result = await executeSingleNode(
      body.node,
      body.sampleInput || "Sample upstream data from previous node"
    );
    return { ok: true, result };
  });
  ctx.route("POST", "/execute-workflow", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const wf = body.workflow;
    if (!wf || !Array.isArray(wf.nodes)) {
      return { ok: false, error: "Invalid workflow" };
    }
    const report = await executeFullWorkflow(wf);
    return { ok: true, report };
  });
});
export {
  index_default as default
};
