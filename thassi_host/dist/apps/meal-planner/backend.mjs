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
import dgram from "node:dgram";
function discoverAllGeminiApiKeysFromHass() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY.trim());
  const candidatePaths = [
    "/homeassistant/.storage/core.config_entries",
    "/config/.storage/core.config_entries"
  ];
  for (const storagePath of candidatePaths) {
    try {
      if (fs2.existsSync(storagePath)) {
        const raw = JSON.parse(fs2.readFileSync(storagePath, "utf-8"));
        const entries = raw?.data?.entries || [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          if (e.domain === "google_generative_ai_conversation" && e.data?.api_key) {
            const k = String(e.data.api_key).trim();
            if (k && !keys.includes(k)) keys.push(k);
          }
        }
      }
    } catch {
    }
  }
  return keys;
}
function discoverGeminiApiKeyFromHass() {
  return discoverAllGeminiApiKeysFromHass()[0] || "";
}
var _cachedLiveGeminiModels = null;
var _workingGeminiKey = null;
async function resolveAvailableGeminiModels(apiKey) {
  if (_cachedLiveGeminiModels && _cachedLiveGeminiModels.length > 0) {
    return _cachedLiveGeminiModels;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(4e3) }
    );
    if (res.ok) {
      const data = await res.json();
      const generateModels = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).filter(
        (name) => /gemini|gemma/i.test(name) && !/embedding|vision-only|imagen|veo|computer-use|robotics|tts|audio|thinking-exp|image/i.test(name)
      );
      if (generateModels.length > 0) {
        const preferredOrder = [
          "gemini-3.8-flash",
          "gemini-3-flash-preview",
          "gemini-2.5-flash-lite",
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
          "gemma-3-27b-it",
          "gemma-3-12b-it",
          "gemini-2.5-flash"
        ];
        generateModels.sort((a, b) => {
          const ia = preferredOrder.indexOf(a);
          const ib = preferredOrder.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
        });
        _cachedLiveGeminiModels = generateModels;
        return generateModels;
      }
    }
  } catch {
  }
  return [
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemma-3-27b-it"
  ];
}
async function callGeminiGenerateContent(options) {
  const allKeys = Array.from(
    new Set(
      [
        _workingGeminiKey || "",
        options.apiKey.trim(),
        ...discoverAllGeminiApiKeysFromHass()
      ].filter(Boolean)
    )
  );
  if (allKeys.length === 0) {
    throw new Error("Gemini API Key ist nicht konfiguriert.");
  }
  let lastError = "";
  for (const keyCandidate of allKeys) {
    const discovered = await resolveAvailableGeminiModels(keyCandidate);
    const requested = (options.model || "gemini-3.8-flash").trim();
    const candidates = Array.from(
      /* @__PURE__ */ new Set([requested, "gemini-3.8-flash", ...discovered])
    ).slice(0, 8);
    for (const model of candidates) {
      try {
        const isGemma = model.startsWith("gemma");
        const combinedPrompt = isGemma && options.systemInstruction ? `${options.systemInstruction}

${options.prompt}` : options.prompt;
        const payload = {
          contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.25,
            ...options.responseMimeType && !isGemma ? { responseMimeType: options.responseMimeType } : {}
          }
        };
        if (options.systemInstruction && !isGemma) {
          payload.systemInstruction = {
            parts: [{ text: options.systemInstruction }]
          };
        }
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(keyCandidate)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(options.timeoutMs ?? 2e4)
          }
        );
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          lastError = `Gemini ${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`;
          if ([400, 402, 403, 404, 429].includes(res.status)) continue;
          throw new Error(lastError);
        }
        const gemData = await res.json();
        const text = gemData.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
        if (text) {
          _workingGeminiKey = keyCandidate;
          return { text, modelUsed: model };
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  throw new Error(lastError || "Gemini API request failed");
}
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
    let geminiApiKey = override?.geminiApiKey || this.sharedDb.kvGet("gemini_api_key", "") || process.env.GEMINI_API_KEY || "";
    if (!geminiApiKey) {
      const discovered = discoverGeminiApiKeyFromHass();
      if (discovered) {
        geminiApiKey = discovered;
        try {
          this.sharedDb.kvSet("gemini_api_key", discovered);
        } catch {
        }
      }
    }
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
        const model = String(input.model || "gemini-3.8-flash").trim();
        const promptText = String(input.prompt || "").trim();
        if (!promptText) throw new Error("Prompt is required");
        const apiKey = ctx.credentials?.geminiApiKey || discoverGeminiApiKeyFromHass();
        if (!apiKey) {
          throw new Error("gemini_api_key is not configured.");
        }
        const { text: replyText, modelUsed } = await callGeminiGenerateContent({
          apiKey,
          model,
          prompt: promptText
        });
        return {
          summary: replyText.slice(0, 100).replace(/\n+/g, " "),
          data: { model: modelUsed, response: replyText, formattedText: replyText }
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
    this.register({
      id: "market.spar.search",
      name: "SPAR Austria: Live Product & Price Search",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Queries the live SPAR Austria Fact-Finder API for current shelf prices, unit prices, and promotions.",
      defaultInput: { query: "Bio Vollmilch", hitsPerPage: "8" },
      fields: [
        { key: "query", label: "Search Query / Product", type: "text", placeholder: "Bio Vollmilch / Skyr / Eier", required: true },
        { key: "hitsPerPage", label: "Max Results", type: "number", placeholder: "8" }
      ],
      execute: async (input) => {
        const query = String(input.query || "Bio Vollmilch").trim();
        const hitsPerPage = Math.max(1, Math.min(30, Number(input.hitsPerPage || 8)));
        const url = `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
          query
        )}&page=1&hitsPerPage=${hitsPerPage}`;
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Thassi-Axons/2.0"
          },
          signal: AbortSignal.timeout(7e3)
        });
        if (!res.ok) {
          throw new Error(`SPAR Austria API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const products = (data.hits || []).map((h) => {
          const mv = h.masterValues || {};
          const brand = mv.title || "";
          const desc = mv["short-description-2"] || mv["short-description"] || mv.name || "";
          const fullName = `${brand} ${desc}`.trim() || mv.name || "SPAR Produkt";
          const price = Number(mv.price ?? mv["regular-price"] ?? 0);
          const regularPrice = Number(mv["regular-price"] ?? price);
          const unitPriceStr = String(mv["price-per-unit"] || "");
          return {
            code: mv["code-internal"] || mv["product-number"] || "",
            name: fullName,
            brand,
            priceEur: price,
            regularPriceEur: regularPrice,
            isOnSale: regularPrice > price && price > 0,
            unitPrice: unitPriceStr,
            url: mv.url ? `https://www.interspar.at/shop/lebensmittel${mv.url}` : ""
          };
        });
        const cheapest = [...products].filter((p) => p.priceEur > 0).sort((a, b) => a.priceEur - b.priceEur)[0];
        return {
          summary: cheapest ? `SPAR "${query}": ${products.length} hits \xB7 Best: ${cheapest.name} (\u20AC${cheapest.priceEur.toFixed(2)})` : `SPAR "${query}": ${products.length} products found`,
          data: {
            store: "SPAR AT",
            query,
            count: products.length,
            cheapest: cheapest || null,
            products
          }
        };
      }
    });
    this.register({
      id: "market.billa.search",
      name: "BILLA Austria: Live Product & Category Discovery",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Queries the live BILLA Online Shop API for Austrian product prices, base unit prices, and promotions.",
      defaultInput: { query: "Milch", categorySlug: "kuehlwaren-15416", maxResults: "10" },
      fields: [
        { key: "query", label: "Filter Keyword", type: "text", placeholder: "Milch / Butter / Brot / Apfel" },
        {
          key: "categorySlug",
          label: "BILLA Category",
          type: "select",
          options: [
            "kuehlwaren-15416",
            "obst-und-gemuese-13751",
            "fleisch-15571",
            "brot-und-gebaeck-15520",
            "vorratsschrank-15012",
            "tiefkuehl-15415"
          ]
        },
        { key: "maxResults", label: "Max Results", type: "number", placeholder: "10" }
      ],
      execute: async (input) => {
        const query = String(input.query || "").trim().toLowerCase();
        const categorySlug = String(input.categorySlug || "kuehlwaren-15416").trim();
        const maxResults = Math.max(1, Math.min(40, Number(input.maxResults || 10)));
        const url = `https://shop.billa.at/api/product-discovery/categories/${encodeURIComponent(
          categorySlug
        )}/products?pageSize=100`;
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Thassi-Axons/2.0"
          },
          signal: AbortSignal.timeout(8e3)
        });
        if (!res.ok) {
          throw new Error(`BILLA Austria API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const rawResults = data.results || [];
        const mapped = rawResults.map((item) => {
          const regularCents = Number(item.price?.regular?.value ?? 0);
          const unitCents = Number(item.price?.regular?.perStandardizedQuantity ?? regularCents);
          const priceEur = Number((regularCents / 100).toFixed(2));
          const unitPriceEur = Number((unitCents / 100).toFixed(2));
          const baseUnit = String(item.price?.baseUnitShort || item.price?.baseUnitLong || "Stk");
          const brand = String(item.brand?.name || "");
          const name = String(item.name || "");
          return {
            sku: item.sku || item.productId || "",
            name: brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name,
            brand,
            priceEur,
            unitPriceEur,
            baseUnit,
            amount: `${item.amount || ""} ${item.volumeLabelShort || ""}`.trim(),
            url: item.slug ? `https://shop.billa.at/produkte/${item.slug}` : ""
          };
        }).filter((p) => p.priceEur > 0 && (!query || p.name.toLowerCase().includes(query)));
        const products = mapped.slice(0, maxResults);
        const cheapest = [...products].sort((a, b) => a.priceEur - b.priceEur)[0];
        return {
          summary: cheapest ? `BILLA (${categorySlug}): ${products.length} matches \xB7 Best: ${cheapest.name} (\u20AC${cheapest.priceEur.toFixed(2)})` : `BILLA (${categorySlug}): ${products.length} products returned`,
          data: {
            store: "BILLA AT",
            categorySlug,
            query,
            count: products.length,
            cheapest: cheapest || null,
            products
          }
        };
      }
    });
    this.register({
      id: "market.basket.compare",
      name: "Supermarket Basket: SPAR vs. BILLA Optimizer",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Compares a shopping basket across SPAR Austria and BILLA Austria in real time to find the cheapest store and split-basket savings.",
      defaultInput: { itemsCsv: "Milch, Butter, Eier, Haferflocken, Skyr" },
      fields: [
        {
          key: "itemsCsv",
          label: "Shopping Basket Items (comma-separated)",
          type: "textarea",
          placeholder: "Milch, Butter, Eier, Haferflocken, Skyr"
        }
      ],
      execute: async (input) => {
        const items = String(input.itemsCsv || "Milch, Butter, Eier").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
        const comparisons = [];
        let sparTotal = 0;
        for (const item of items) {
          const url = `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
            item
          )}&page=1&hitsPerPage=4`;
          const res = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 Thassi-Axons/2.0" },
            signal: AbortSignal.timeout(5e3)
          }).catch(() => null);
          if (res && res.ok) {
            const json = await res.json().catch(() => ({}));
            const hits = (json.hits || []).map((h) => ({
              name: `${h.masterValues?.title || ""} ${h.masterValues?.["short-description-2"] || h.masterValues?.name || ""}`.trim(),
              price: Number(h.masterValues?.price ?? 0)
            })).filter((p) => p.price > 0).sort((a, b) => a.price - b.price);
            const best = hits[0];
            if (best) {
              sparTotal += best.price;
              comparisons.push({ item, sparName: best.name, sparPriceEur: best.price });
              continue;
            }
          }
          comparisons.push({ item, sparName: null, sparPriceEur: null });
        }
        return {
          summary: `Basket (${items.length} items) \xB7 SPAR Live Total: \u20AC${sparTotal.toFixed(2)}`,
          data: {
            itemCount: items.length,
            sparTotalEur: Number(sparTotal.toFixed(2)),
            items: comparisons
          }
        };
      }
    });
    this.register({
      id: "product.barcode.resolve",
      name: "Universal Barcode / EAN Resolver (Multi-Stage)",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Resolves any EAN/GTIN/UPC barcode across 5 stages: OpenFoodFacts -> OpenBeautyFacts -> OpenProductsFacts -> UPCitemdb -> SPAR Austria.",
      defaultInput: { barcode: "9002490100070" },
      fields: [
        {
          key: "barcode",
          label: "EAN-13 / EAN-8 / UPC Barcode",
          type: "text",
          placeholder: "9002490100070 (Red Bull) / 5449000000996",
          required: true
        }
      ],
      execute: async (input) => {
        const barcode = String(input.barcode || "").replace(/[^0-9]/g, "");
        if (!barcode) throw new Error("Numeric EAN/GTIN barcode is required");
        const stagesChecked = [];
        let resolvedProduct = null;
        const openFactsEndpoints = [
          { source: "openfoodfacts", domain: "world.openfoodfacts.org", type: "food" },
          { source: "openbeautyfacts", domain: "world.openbeautyfacts.org", type: "drogerie_beauty" },
          { source: "openproductsfacts", domain: "world.openproductsfacts.org", type: "non_food_product" }
        ];
        for (const ep of openFactsEndpoints) {
          stagesChecked.push(ep.source);
          try {
            const res = await fetch(
              `https://${ep.domain}/api/v2/product/${encodeURIComponent(barcode)}.json`,
              {
                headers: { "User-Agent": "Thassi-Axons/2.0" },
                signal: AbortSignal.timeout(4e3)
              }
            );
            if (res.ok) {
              const payload = await res.json();
              if (payload.status === 1 && payload.product) {
                const p = payload.product;
                const nut = p.nutriments || {};
                resolvedProduct = {
                  barcode,
                  source: ep.source,
                  productType: ep.type,
                  name: p.product_name_de || p.product_name || p.generic_name || `Product ${barcode}`,
                  brand: p.brands || "",
                  quantity: p.quantity || "",
                  categories: p.categories || "",
                  imageUrl: p.image_front_small_url || p.image_url || "",
                  nutriments: ep.type === "food" ? {
                    calories_kcal_100g: Math.round(Number(nut["energy-kcal_100g"] ?? nut["energy-kcal"] ?? 0)),
                    protein_100g: Number(Number(nut.proteins_100g ?? 0).toFixed(1)),
                    carbs_100g: Number(Number(nut.carbohydrates_100g ?? 0).toFixed(1)),
                    fat_100g: Number(Number(nut.fat_100g ?? 0).toFixed(1))
                  } : null
                };
                break;
              }
            }
          } catch {
          }
        }
        if (!resolvedProduct) {
          stagesChecked.push("upcitemdb");
          try {
            const res = await fetch(
              `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
              {
                headers: { Accept: "application/json", "User-Agent": "Thassi-Axons/2.0" },
                signal: AbortSignal.timeout(4500)
              }
            );
            if (res.ok) {
              const payload = await res.json();
              const first = payload.items?.[0];
              if (first) {
                resolvedProduct = {
                  barcode,
                  source: "upcitemdb",
                  productType: "retail_general",
                  name: first.title || `Product ${barcode}`,
                  brand: first.brand || "",
                  quantity: first.size || first.weight || "",
                  categories: first.category || "",
                  imageUrl: first.images?.[0] || "",
                  nutriments: null
                };
              }
            }
          } catch {
          }
        }
        stagesChecked.push("spar_at_ean");
        let sparMatch = null;
        try {
          const searchTerm = resolvedProduct ? `${resolvedProduct.brand} ${resolvedProduct.name}`.trim() : barcode;
          const sparRes = await fetch(
            `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
              searchTerm
            )}&page=1&hitsPerPage=3`,
            {
              headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 Thassi-Axons/2.0" },
              signal: AbortSignal.timeout(4500)
            }
          );
          if (sparRes.ok) {
            const sparJson = await sparRes.json();
            const firstHit = sparJson.hits?.[0]?.masterValues;
            if (firstHit) {
              sparMatch = {
                name: `${firstHit.title || ""} ${firstHit["short-description-2"] || firstHit.name || ""}`.trim(),
                priceEur: Number(firstHit.price ?? 0),
                unitPrice: firstHit["price-per-unit"] || ""
              };
              if (!resolvedProduct) {
                resolvedProduct = {
                  barcode,
                  source: "spar_at_ean",
                  productType: "supermarket_item",
                  name: sparMatch.name,
                  brand: firstHit.title || "",
                  quantity: "",
                  categories: "",
                  imageUrl: firstHit["image-url"] || "",
                  nutriments: null
                };
              }
            }
          }
        } catch {
        }
        if (!resolvedProduct) {
          throw new Error(
            `Barcode ${barcode} could not be resolved across [${stagesChecked.join(" -> ")}]`
          );
        }
        return {
          summary: `${resolvedProduct.name} (${resolvedProduct.brand || resolvedProduct.source})${sparMatch?.priceEur ? ` \xB7 SPAR \u20AC${sparMatch.priceEur.toFixed(2)}` : ""}`,
          data: {
            ...resolvedProduct,
            austrianRetailMatch: sparMatch,
            stagesChecked
          }
        };
      }
    });
    this.register({
      id: "mobility.econtrol.fuel_prices",
      name: "E-Control Austria: Live Fuel Prices (Spritpreisrechner)",
      domainCode: "ENERGY",
      category: "mobility",
      icon: "ENERGY",
      description: "Queries the official Austrian E-Control Spritpreisrechner API for live Diesel (DIE) and Super 95 (SUP) prices around St. Veit an der G\xF6lsen.",
      defaultInput: {
        lat: "48.0444",
        lon: "15.6689",
        fuelType: "DIE",
        includeClosed: "false"
      },
      fields: [
        { key: "fuelType", label: "Fuel Type", type: "select", options: ["DIE", "SUP", "GAS"] },
        { key: "lat", label: "Latitude", type: "text", placeholder: "48.0444 (St. Veit/G\xF6lsen)" },
        { key: "lon", label: "Longitude", type: "text", placeholder: "15.6689 (St. Veit/G\xF6lsen)" },
        { key: "includeClosed", label: "Include Closed Stations", type: "select", options: ["false", "true"] }
      ],
      execute: async (input) => {
        const lat = Number(input.lat || 48.0444);
        const lon = Number(input.lon || 15.6689);
        const fuelType = String(input.fuelType || "DIE").toUpperCase();
        const includeClosed = String(input.includeClosed || "false") === "true";
        const url = `https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=${lat}&longitude=${lon}&fuelType=${encodeURIComponent(
          fuelType
        )}&includeClosed=${includeClosed}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Thassi-Axons/2.0" },
          signal: AbortSignal.timeout(6e3)
        });
        if (!res.ok) {
          throw new Error(`E-Control API HTTP ${res.status}: ${res.statusText}`);
        }
        const rawStations = await res.json();
        const stations = rawStations.map((st) => {
          const priceEntry = (st.prices || [])[0];
          return {
            id: st.id,
            name: st.name || "Tankstelle",
            address: `${st.location?.address || ""}, ${st.location?.postalCode || ""} ${st.location?.city || ""}`.trim(),
            distanceKm: Number(Number(st.distance ?? 0).toFixed(2)),
            open: Boolean(st.open),
            fuelType: priceEntry?.fuelType || fuelType,
            priceEurPerLiter: priceEntry?.amount ?? null
          };
        }).filter((s) => s.priceEurPerLiter !== null);
        const cheapest = stations[0];
        return {
          summary: cheapest ? `Cheapest ${fuelType}: \u20AC${Number(cheapest.priceEurPerLiter).toFixed(3)}/L at ${cheapest.name} (${cheapest.distanceKm} km)` : `${stations.length} stations found near (${lat}, ${lon})`,
          data: {
            provider: "e-control.at",
            fuelType,
            coordinates: { lat, lon },
            stationCount: stations.length,
            cheapestStation: cheapest || null,
            stations: stations.slice(0, 12)
          }
        };
      }
    });
    this.register({
      id: "energy.awattar.prices_at",
      name: "aWATTar Austria: EPEX Spot Hourly Electricity Prices",
      domainCode: "ENERGY",
      category: "energy",
      icon: "ENERGY",
      description: "Fetches hourly Austrian EPEX Spot electricity prices (ct/kWh) from aWATTar AT and calculates the cheapest 3-hour window for high-load appliances or 3D printing.",
      defaultInput: {},
      fields: [],
      execute: async () => {
        const res = await fetch("https://api.awattar.at/v1/marketdata", {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(6e3)
        });
        if (!res.ok) {
          throw new Error(`aWATTar AT API HTTP ${res.status}: ${res.statusText}`);
        }
        const payload = await res.json();
        const slots = (payload.data || []).map((slot) => {
          const ctPerKwh = Number((Number(slot.marketprice ?? 0) / 10).toFixed(2));
          const startIso = new Date(Number(slot.start_timestamp)).toISOString();
          const endIso = new Date(Number(slot.end_timestamp)).toISOString();
          const hourLabel = new Date(Number(slot.start_timestamp)).toLocaleTimeString("de-AT", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Vienna"
          });
          return {
            hourLabel,
            startIso,
            endIso,
            ctPerKwhNet: ctPerKwh,
            eurPerMwh: Number(slot.marketprice ?? 0)
          };
        });
        const currentSlot = slots[0] || null;
        const sortedByPrice = [...slots].sort((a, b) => a.ctPerKwhNet - b.ctPerKwhNet);
        const minSlot = sortedByPrice[0] || null;
        const maxSlot = sortedByPrice[sortedByPrice.length - 1] || null;
        return {
          summary: currentSlot ? `Current: ${currentSlot.ctPerKwhNet} ct/kWh \xB7 Low: ${minSlot?.ctPerKwhNet} ct (${minSlot?.hourLabel}) \xB7 High: ${maxSlot?.ctPerKwhNet} ct (${maxSlot?.hourLabel})` : `${slots.length} hourly EPEX Spot slots loaded`,
          data: {
            provider: "awattar.at",
            unit: "ct/kWh (net spot)",
            currentSlot,
            cheapestSlot: minSlot,
            mostExpensiveSlot: maxSlot,
            hourlySlots: slots
          }
        };
      }
    });
    this.register({
      id: "network.fritzbox.status",
      name: "FRITZ!Box 6890 LTE & WLAN Mesh Telemetry",
      domainCode: "NET",
      category: "network",
      icon: "NET",
      description: "Probes the FRITZ!Box gateway (192.168.188.1 :80/:49000 TR-064) and reads live Wi-Fi SSID (Obi-WLAN Kenobi), BSSID, signal strength, Tailscale VPN, and public WAN IP sensors.",
      defaultInput: { gatewayIp: "192.168.188.1" },
      fields: [
        { key: "gatewayIp", label: "FRITZ!Box Gateway IP", type: "text", placeholder: "192.168.188.1" }
      ],
      execute: async (input, ctx) => {
        const gwIp = String(input.gatewayIp || "192.168.188.1").trim();
        const probePort = (port) => new Promise((resolve) => {
          const sock = net.connect(port, gwIp, () => {
            sock.destroy();
            resolve(true);
          });
          sock.setTimeout(1200, () => {
            sock.destroy();
            resolve(false);
          });
          sock.on("error", () => resolve(false));
        });
        const [httpOpen, tr064Open, all] = await Promise.all([
          probePort(80),
          probePort(49e3),
          ctx.ha.getStates()
        ]);
        const netEntities = all.filter(
          (s) => /fritz|6890|repeater|wi_fi|ssid|bssid|public_ip|ip_address|network_type|link_speed|signal_strength|tailscale/i.test(
            s.entity_id
          )
        ).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          state: s.state,
          unit: String(s.attributes?.unit_of_measurement || "")
        }));
        const publicIp = netEntities.find((e) => /public_ip/i.test(e.entity_id))?.state || "dynamic";
        const ssid = netEntities.find((e) => /ssid|wi_fi_connection/i.test(e.entity_id) && e.state !== "unknown")?.state || "Obi-WLAN Kenobi";
        return {
          summary: `Gateway ${gwIp} (${httpOpen ? "ONLINE" : "OFFLINE"}) \xB7 SSID: ${ssid} \xB7 WAN IP: ${publicIp} \xB7 ${netEntities.length} sensors`,
          data: {
            gatewayIp: gwIp,
            httpPort80Online: httpOpen,
            tr064Port49000Online: tr064Open,
            ssid,
            publicIp,
            sensorCount: netEntities.length,
            sensors: netEntities
          }
        };
      }
    });
    this.register({
      id: "hardware.peripherals.status",
      name: "Peripherals: Printers (Epson/Brother), PC & Battery Fleet",
      domainCode: "SYS",
      category: "system",
      icon: "SYS",
      description: "Aggregates Epson XP-7100 ink levels, Brother MFC-L2700DW toner/page counters, THOMAS-PC status, and low-battery warnings across all home devices.",
      defaultInput: { batteryWarningThreshold: "25" },
      fields: [
        { key: "batteryWarningThreshold", label: "Low Battery Warning (%)", type: "number", placeholder: "25" }
      ],
      execute: async (input, ctx) => {
        const threshold = Number(input.batteryWarningThreshold || 25);
        const all = await ctx.ha.getStates();
        const printers = all.filter((s) => /epson|xp_7100|brother|mfc_l2700dw|toner|black_ink|cyan|magenta|yellow/i.test(s.entity_id)).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          state: s.state,
          unit: String(s.attributes?.unit_of_measurement || "")
        }));
        const pcEntities = all.filter((s) => /thomas_pc|hass_agent/i.test(s.entity_id)).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          state: s.state
        }));
        const batteries = all.filter(
          (s) => s.attributes?.device_class === "battery" || _sHasNumericPct(s) && /battery|batterie|akku/i.test(s.entity_id)
        ).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          levelPct: Number(s.state)
        })).filter((b) => !Number.isNaN(b.levelPct)).sort((a, b) => a.levelPct - b.levelPct);
        const lowBatteries = batteries.filter((b) => b.levelPct <= threshold);
        return {
          summary: `${printers.length} printer sensors \xB7 ${pcEntities.length} PC sensors \xB7 ${lowBatteries.length}/${batteries.length} batteries <= ${threshold}%`,
          data: {
            printers,
            thomasPc: pcEntities,
            lowBatteries,
            allBatteries: batteries
          }
        };
      }
    });
    this.register({
      id: "media.now_playing",
      name: "Media & YouTube Music: Active Players & Control",
      domainCode: "MEDIA",
      category: "media",
      icon: "MEDIA",
      description: "Reads all Home Assistant media_player entities (Music Assistant / YouTube Music, Samsung TV, Google Cast, Xbox) and optionally dispatches media commands.",
      defaultInput: { action: "status", entityId: "", command: "media_play_pause" },
      fields: [
        { key: "action", label: "Mode", type: "select", options: ["status", "control"] },
        { key: "entityId", label: "Target Media Player (optional)", type: "text", placeholder: "media_player.samsung_6_series_49" },
        {
          key: "command",
          label: "Media Command (when mode=control)",
          type: "select",
          options: ["media_play_pause", "media_next_track", "media_previous_track", "volume_up", "volume_down", "turn_off"]
        }
      ],
      execute: async (input, ctx) => {
        const mode = String(input.action || "status");
        const targetId = String(input.entityId || "").trim();
        const command = String(input.command || "media_play_pause").trim();
        if (mode === "control" && targetId) {
          await ctx.ha.callService("media_player", command, { entity_id: targetId });
        }
        const all = await ctx.ha.getStates();
        const players = all.filter((s) => s.entity_id.startsWith("media_player.") || s.entity_id.startsWith("xbox.")).map((s) => ({
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name || s.entity_id),
          state: s.state,
          mediaTitle: s.attributes?.media_title || null,
          mediaArtist: s.attributes?.media_artist || null,
          appName: s.attributes?.app_name || null,
          volumeLevel: s.attributes?.volume_level ?? null
        }));
        const active = players.filter((p) => p.state === "playing" || p.state === "paused" || p.state === "on");
        return {
          summary: `${active.length} active media players (${players.length} total registered)`,
          data: {
            activeCount: active.length,
            totalCount: players.length,
            players
          }
        };
      }
    });
    this.register({
      id: "youtube.videos.search",
      name: "YouTube: Search Videos & Channels",
      domainCode: "YT",
      category: "youtube",
      icon: "YT",
      description: "Searches YouTube videos with live metadata, view counts, duration, and channel details (supports YouTube Data API v3 or zero-key live extraction).",
      defaultInput: { query: "BambuLab X1C Gridfinity", maxResults: "8" },
      fields: [
        { key: "query", label: "Search Query", type: "text", placeholder: "BambuLab X1C / Home Assistant / Finanzen", required: true },
        { key: "maxResults", label: "Max Results", type: "number", placeholder: "8" }
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || "BambuLab X1C").trim();
        const maxResults = Math.max(1, Math.min(20, Number(input.maxResults || 8)));
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const apiRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
              query
            )}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5e3)
            }
          );
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            const videos2 = (apiJson.items || []).map((it) => ({
              videoId: it.id?.videoId,
              title: it.snippet?.title,
              channel: it.snippet?.channelTitle,
              publishedAt: it.snippet?.publishedAt,
              url: `https://www.youtube.com/watch?v=${it.id?.videoId}`
            }));
            return {
              summary: `YouTube API: ${videos2.length} videos for "${query}"`,
              data: { source: "youtube_data_api_v3", query, count: videos2.length, videos: videos2 }
            };
          }
        } catch {
        }
        const res = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=de`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept-Language": "de-AT,de;q=0.9,en;q=0.8"
            },
            signal: AbortSignal.timeout(7e3)
          }
        );
        if (!res.ok) {
          throw new Error(`YouTube HTTP ${res.status}: ${res.statusText}`);
        }
        const html = await res.text();
        const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
        if (!match) {
          throw new Error("Could not parse ytInitialData from YouTube response");
        }
        const ytData = JSON.parse(match[1]);
        const contents = ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        const videos = [];
        for (const item of contents) {
          const vr = item.videoRenderer;
          if (!vr || !vr.videoId) continue;
          videos.push({
            videoId: vr.videoId,
            title: vr.title?.runs?.[0]?.text || "",
            channel: vr.ownerText?.runs?.[0]?.text || "",
            duration: vr.lengthText?.simpleText || "LIVE",
            views: vr.viewCountText?.simpleText || "",
            publishedTime: vr.publishedTimeText?.simpleText || "",
            url: `https://www.youtube.com/watch?v=${vr.videoId}`
          });
          if (videos.length >= maxResults) break;
        }
        return {
          summary: `YouTube "${query}": ${videos.length} videos (${videos[0]?.title || "ok"})`,
          data: {
            source: "youtube_live_search",
            query,
            count: videos.length,
            videos
          }
        };
      }
    });
    this.register({
      id: "youtube.channel.feed",
      name: "YouTube: Channel RSS Video Feed",
      domainCode: "YT",
      category: "youtube",
      icon: "YT",
      description: "Fetches the latest uploads from any YouTube channel via its official XML Atom feed without requiring API keys.",
      defaultInput: { channelId: "UCsBjURrPoezykLs9EqgamOA", maxVideos: "8" },
      fields: [
        {
          key: "channelId",
          label: "YouTube Channel ID",
          type: "text",
          placeholder: "UCsBjURrPoezykLs9EqgamOA (Fireship)",
          required: true
        },
        { key: "maxVideos", label: "Max Videos", type: "number", placeholder: "8" }
      ],
      execute: async (input) => {
        const channelId = String(input.channelId || "UCsBjURrPoezykLs9EqgamOA").trim();
        const maxVideos = Math.max(1, Math.min(15, Number(input.maxVideos || 8)));
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Thassi-Axons/2.0" },
          signal: AbortSignal.timeout(6e3)
        });
        if (!res.ok) {
          throw new Error(`YouTube Feed HTTP ${res.status} for channel ${channelId}`);
        }
        const xml = await res.text();
        const channelTitle = xml.match(/<author>\s*<name>(.*?)<\/name>/s)?.[1] || channelId;
        const entryMatches = [...xml.matchAll(/<entry>(.*?)<\/entry>/gs)];
        const videos = entryMatches.slice(0, maxVideos).map((m) => {
          const block = m[1];
          const videoId = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] || "";
          const title = block.match(/<title>(.*?)<\/title>/)?.[1] || "";
          const published = block.match(/<published>(.*?)<\/published>/)?.[1] || "";
          const views = block.match(/views="(\d+)"/)?.[1] || "0";
          return {
            videoId,
            title,
            publishedAt: published,
            views: Number(views),
            url: `https://www.youtube.com/watch?v=${videoId}`
          };
        });
        return {
          summary: `${channelTitle}: ${videos.length} recent uploads \xB7 Latest: "${videos[0]?.title || "\u2014"}"`,
          data: {
            channelId,
            channelTitle,
            count: videos.length,
            videos
          }
        };
      }
    });
    this.register({
      id: "maps.routes.commute",
      name: "Maps & Routing: Live Travel Time & Distance",
      domainCode: "MAPS",
      category: "maps",
      icon: "MAPS",
      description: "Geocodes addresses and calculates live driving distance, duration, and route geometry from St. Veit an der G\xF6lsen (or any origin) to any destination.",
      defaultInput: {
        origin: "St. Veit an der G\xF6lsen, Austria",
        destination: "St. P\xF6lten Hauptbahnhof, Austria"
      },
      fields: [
        { key: "origin", label: 'Origin Address or "lat,lon"', type: "text", placeholder: "St. Veit an der G\xF6lsen, Austria", required: true },
        { key: "destination", label: 'Destination Address or "lat,lon"', type: "text", placeholder: "St. P\xF6lten Hauptbahnhof, Austria", required: true }
      ],
      execute: async (input) => {
        const geocode = async (queryStr) => {
          const coordMatch = queryStr.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
          if (coordMatch) {
            return { lat: Number(coordMatch[1]), lon: Number(coordMatch[2]), label: queryStr };
          }
          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            queryStr
          )}&format=json&limit=1`;
          const res = await fetch(nomUrl, {
            headers: { "User-Agent": "Thassi-Axons-HomeAssistant/2.0 (thomas.simhofer@gmail.com)" },
            signal: AbortSignal.timeout(5e3)
          });
          if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
          const hits = await res.json();
          if (!hits.length) throw new Error(`Location not found: "${queryStr}"`);
          return {
            lat: Number(hits[0].lat),
            lon: Number(hits[0].lon),
            label: String(hits[0].display_name || queryStr)
          };
        };
        const originStr = String(input.origin || "48.0444, 15.6689").trim();
        const destStr = String(input.destination || "St. P\xF6lten, Austria").trim();
        const [orig, dest] = await Promise.all([geocode(originStr), geocode(destStr)]);
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${orig.lon},${orig.lat};${dest.lon},${dest.lat}?overview=false&steps=true`;
        const routeRes = await fetch(routeUrl, {
          headers: { "User-Agent": "Thassi-Axons/2.0" },
          signal: AbortSignal.timeout(6e3)
        });
        if (!routeRes.ok) {
          throw new Error(`Routing Engine HTTP ${routeRes.status}`);
        }
        const routeData = await routeRes.json();
        const primaryRoute = routeData.routes?.[0];
        if (!primaryRoute) {
          throw new Error("No driving route found between origin and destination");
        }
        const distanceKm = Number((Number(primaryRoute.distance || 0) / 1e3).toFixed(1));
        const durationMin = Math.round(Number(primaryRoute.duration || 0) / 60);
        return {
          summary: `${originStr} -> ${destStr}: ${distanceKm} km \xB7 ${durationMin} min driving`,
          data: {
            origin: orig,
            destination: dest,
            distanceKm,
            durationMinutes: durationMin,
            summaryRoute: primaryRoute.legs?.[0]?.summary || ""
          }
        };
      }
    });
    this.register({
      id: "finance.market.rates",
      name: "Finance: EZB Live FX & Currency Reference Rates",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Fetches daily European Central Bank (EZB) foreign exchange reference rates via Frankfurter API.",
      defaultInput: { base: "EUR", symbols: "USD,CHF,GBP,JPY,PLN,CZK,HUF" },
      fields: [
        { key: "base", label: "Base Currency", type: "text", placeholder: "EUR" },
        { key: "symbols", label: "Target Currencies (CSV)", type: "text", placeholder: "USD,CHF,GBP,JPY,PLN,CZK,HUF" }
      ],
      execute: async (input) => {
        const base = String(input.base || "EUR").trim().toUpperCase();
        const symbols = String(input.symbols || "USD,CHF,GBP,JPY,PLN,CZK,HUF").trim().toUpperCase();
        const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(
          symbols
        )}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
        if (!res.ok) {
          throw new Error(`Frankfurter EZB API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const ratePairs = Object.entries(data.rates || {}).map(([k, v]) => `${k}: ${v}`);
        return {
          summary: `1 ${data.base} (${data.date}) -> ${ratePairs.slice(0, 4).join(" \xB7 ")}`,
          data
        };
      }
    });
    this.register({
      id: "pc.status.telemetry",
      name: "Workstation: Live Telemetry, Monitors & KVM Link",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Reads live CPU/RAM usage, active window, attached displays (DISPLAY1-3), audio volume, and Web-VNC/KVM stream URL from Thassi.PcAgent on DESKTOP-M8TJERB.",
      defaultInput: { agentUrl: "http://192.168.188.46:5185" },
      fields: [
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" }
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const snap = await PcAgentReverseBridge.getStatusOrCall(baseUrl);
        return {
          summary: `${snap.hostname} (${snap.sessionLocked ? "LOCKED" : "ACTIVE"}) \xB7 CPU ${snap.cpuUsagePercent}% \xB7 RAM ${snap.memoryUsedGb}/${snap.memoryTotalGb} GB \xB7 ${snap.displayCount} Displays`,
          data: snap
        };
      }
    });
    this.register({
      id: "pc.power.control",
      name: "Workstation: Power, Wake-on-LAN & Monitor Control",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Powers DESKTOP-M8TJERB ON via UDP Wake-on-LAN Magic Packet (30:9C:23:E1:03:96) or executes Shutdown, Reboot, Standby, Hibernate, Lock, and Monitor Off/On via Thassi.PcAgent.",
      defaultInput: {
        action: "wake_on_lan",
        macAddress: "30:9C:23:E1:03:96",
        broadcastIp: "192.168.188.255",
        agentUrl: "http://192.168.188.46:5185",
        delaySeconds: "5"
      },
      fields: [
        {
          key: "action",
          label: "Power Action",
          type: "select",
          options: [
            "wake_on_lan",
            "monitors_on",
            "monitors_off",
            "lock",
            "sleep",
            "hibernate",
            "reboot",
            "shutdown",
            "abort_shutdown"
          ]
        },
        { key: "macAddress", label: "MAC Address (for WOL)", type: "text", placeholder: "30:9C:23:E1:03:96" },
        { key: "broadcastIp", label: "LAN Broadcast IP", type: "text", placeholder: "192.168.188.255" },
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" },
        { key: "delaySeconds", label: "Shutdown/Reboot Delay (s)", type: "number", placeholder: "5" }
      ],
      execute: async (input, ctx) => {
        const action = String(input.action || "wake_on_lan").trim().toLowerCase();
        const mac = String(input.macAddress || "30:9C:23:E1:03:96").trim();
        const broadcastIp = String(input.broadcastIp || "192.168.188.255").trim();
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const delaySeconds = Number(input.delaySeconds || 5);
        if (action === "wake_on_lan" || action === "wol" || action === "on") {
          await _sendWakeOnLanMagicPacket(mac, broadcastIp);
          await ctx.ha.callService("script", "turn_on", { entity_id: "script.1770343452594" }).catch(() => null);
          return {
            summary: `Wake-on-LAN Magic Packet dispatched to ${mac} (${broadcastIp}:9)`,
            data: {
              action: "wake_on_lan",
              macAddress: mac,
              broadcastIp,
              ports: [9, 7]
            }
          };
        }
        const data = await PcAgentReverseBridge.callEndpoint(baseUrl, "/api/power", { action, delaySeconds }, 6e3);
        return {
          summary: `PC Power [${action}]: ${data.message || "executed"}`,
          data
        };
      }
    });
    this.register({
      id: "pc.session.login",
      name: "Workstation: User Login, Unlock & Winlogon Auto-Logon",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Wakes displays, unlocks the Windows session (or injects PIN/Password), reattaches console sessions (tscon), or configures Winlogon AutoAdminLogon.",
      defaultInput: {
        mode: "unlock",
        username: "thoma",
        pinOrPassword: "",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "mode",
          label: "Login / Session Mode",
          type: "select",
          options: ["unlock", "tscon", "enable_autologon", "disable_autologon"]
        },
        { key: "username", label: "Windows Username", type: "text", placeholder: "thoma" },
        { key: "pinOrPassword", label: "PIN or Password (optional)", type: "text", placeholder: "Leave empty for curtain wake only" },
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" }
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          "/api/session/login",
          {
            mode: input.mode || "unlock",
            username: input.username || "thoma",
            pinOrPassword: input.pinOrPassword || ""
          },
          7e3
        );
        if (data.ok === false) {
          throw new Error(data.error || "PC Session Login failed");
        }
        return {
          summary: `${data.message || "Session login command executed"}`,
          data
        };
      }
    });
    this.register({
      id: "pc.powershell.exec",
      name: "Workstation: Execute PowerShell Command",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Executes any PowerShell command or script directly on DESKTOP-M8TJERB via Thassi.PcAgent and returns stdout, stderr, and exit code.",
      defaultInput: {
        command: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 Name, Id, CPU | Format-Table -AutoSize",
        workingDirectory: "c:\\Users\\thoma\\source\\repos\\thassi",
        timeoutSeconds: "30",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "command",
          label: "PowerShell Command / Script",
          type: "textarea",
          placeholder: "Get-Service | Where-Object Status -eq Running",
          required: true
        },
        { key: "workingDirectory", label: "Working Directory", type: "text", placeholder: "c:\\Users\\thoma\\source\\repos\\thassi" },
        { key: "timeoutSeconds", label: "Timeout (s)", type: "number", placeholder: "30" },
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" }
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const command = String(input.command || "").trim();
        if (!command) throw new Error("PowerShell command is required");
        const timeoutSec = Number(input.timeoutSeconds || 30);
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          "/api/powershell/exec",
          {
            command,
            workingDirectory: input.workingDirectory || "c:\\Users\\thoma\\source\\repos\\thassi",
            timeoutSeconds: timeoutSec
          },
          Math.min(6e4, timeoutSec * 1e3 + 4e3)
        );
        const firstLine = String(data.stdout || data.stderr || "OK").split("\n").map((l) => l.trim()).find(Boolean) || "OK";
        return {
          summary: `PS Exit ${data.exitCode} (${data.durationMs}ms): ${firstLine.slice(0, 90)}`,
          data
        };
      }
    });
    this.register({
      id: "pc.media.control",
      name: "Workstation: Media Playback & Master Audio Volume",
      domainCode: "PC",
      category: "media",
      icon: "PC",
      description: "Controls media playback (Play/Pause, Next, Previous, Stop) and Windows CoreAudio Master Volume (0-100% / Mute) on DESKTOP-M8TJERB.",
      defaultInput: {
        action: "play_pause",
        volumePercent: "",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "action",
          label: "Media Action",
          type: "select",
          options: ["play_pause", "next", "prev", "stop", "mute", "vol_up", "vol_down", "set_volume"]
        },
        { key: "volumePercent", label: "Master Volume % (0-100, optional)", type: "number", placeholder: "50" },
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" }
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const volRaw = String(input.volumePercent ?? "").trim();
        const volumePercent = volRaw !== "" && !Number.isNaN(Number(volRaw)) ? Number(volRaw) : null;
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          "/api/media/control",
          {
            action: input.action || "play_pause",
            volumePercent
          },
          5e3
        );
        const m = data.media || {};
        if (PcAgentReverseBridge.latestStatus && data.media) {
          PcAgentReverseBridge.latestStatus.media = data.media;
        }
        return {
          summary: `PC Media [${data.action}] \xB7 Vol ${m.volumePercent ?? "\u2014"}% \xB7 ${m.title || "OK"}`,
          data
        };
      }
    });
    this.register({
      id: "pc.antigravity.prompt",
      name: "Workstation: Send Prompt to Antigravity (thassi)",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Creates a new Chat in the thassi project (or targets an existing Chat) in the running Antigravity desktop app on DESKTOP-M8TJERB and dispatches a prompt directly via ConnectRPC.",
      defaultInput: {
        prompt: "",
        newChat: "true",
        cascadeId: "",
        projectName: "thassi",
        focusWindow: "true",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "prompt",
          label: "Antigravity Prompt",
          type: "textarea",
          placeholder: "Describe the coding or automation task for Antigravity in thassi...",
          required: true
        },
        {
          key: "newChat",
          label: "Create New Chat in thassi",
          type: "select",
          options: ["true", "false"]
        },
        {
          key: "cascadeId",
          label: "Target Cascade ID (optional, when newChat=false)",
          type: "text",
          placeholder: "Leave empty for new chat or active chat"
        },
        {
          key: "projectName",
          label: "Antigravity Project Name",
          type: "text",
          placeholder: "thassi"
        },
        {
          key: "focusWindow",
          label: "Navigate Antigravity Window to Chat",
          type: "select",
          options: ["true", "false"]
        },
        { key: "agentUrl", label: "PC Agent URL", type: "text", placeholder: "http://192.168.188.46:5185" }
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || "http://192.168.188.46:5185").replace(/\/+$/, "");
        const prompt = String(input.prompt || "").trim();
        if (!prompt) {
          throw new Error("Antigravity prompt text is required");
        }
        const newChat = String(input.newChat ?? "true").toLowerCase() !== "false";
        const cascadeId = String(input.cascadeId || "").trim() || void 0;
        const projectName = String(input.projectName || "thassi").trim();
        const focusWindow = String(input.focusWindow ?? "true").toLowerCase() !== "false";
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          "/api/antigravity/prompt",
          {
            prompt,
            newChat,
            cascadeId,
            projectName,
            focusWindow
          },
          15e3
        );
        if (data.ok === false) {
          throw new Error(data.error || "Antigravity prompt dispatch failed");
        }
        return {
          summary: data.message || `Antigravity (${projectName}): ${String(data.cascadeId || "").slice(0, 8)}`,
          data
        };
      }
    });
    this.register({
      id: "google.drive.read_file",
      name: "Google Drive: Read / Export File Content",
      domainCode: "DRIVE",
      category: "drive",
      icon: "DRIVE",
      description: "Reads or exports the full text content of a Google Doc, Markdown file, CSV, or plain text file from Google Drive v3.",
      defaultInput: { fileId: "", maxChars: "12000" },
      fields: [
        { key: "fileId", label: "Google Drive File ID", type: "text", placeholder: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ", required: true },
        { key: "maxChars", label: "Max Characters", type: "number", placeholder: "12000" }
      ],
      execute: async (input, ctx) => {
        const fileId = String(input.fileId || "").trim();
        if (!fileId) throw new Error("fileId is required");
        const maxChars = Math.max(500, Math.min(8e4, Number(input.maxChars || 12e3)));
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            fileId
          )}?fields=id,name,mimeType,modifiedTime,webViewLink,size`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5e3)
          }
        );
        if (!metaRes.ok) {
          throw new Error(`Drive file metadata HTTP ${metaRes.status}`);
        }
        const meta = await metaRes.json();
        const mime = String(meta.mimeType || "");
        let contentText = "";
        if (mime === "application/vnd.google-apps.document") {
          const expRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              fileId
            )}/export?mimeType=text/plain`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6e3)
            }
          );
          if (expRes.ok) contentText = await expRes.text();
        } else if (mime === "application/vnd.google-apps.spreadsheet") {
          const expRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              fileId
            )}/export?mimeType=text/csv`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6e3)
            }
          );
          if (expRes.ok) contentText = await expRes.text();
        } else if (mime.startsWith("text/") || mime.includes("json") || mime.includes("markdown") || mime.includes("xml")) {
          const dlRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6e3)
            }
          );
          if (dlRes.ok) contentText = await dlRes.text();
        } else {
          contentText = `[Binary/Media File: ${meta.name} (${mime})]`;
        }
        const clipped = contentText.slice(0, maxChars);
        return {
          summary: `Drive "${meta.name}" (${mime}) \xB7 ${clipped.length} chars`,
          data: {
            ...meta,
            content: clipped,
            formattedText: `# ${meta.name}

${clipped}`
          }
        };
      }
    });
    this.register({
      id: "memo.search",
      name: "Memo: Federated Knowledge Search (Drive + Notes + .md + SQLite)",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Searches across Google Drive, Google Notes/Keep, local .md files, and all Thassi SQLite databases (Notes, Finance, Meals, Calendar, Projects) with relevance ranking.",
      defaultInput: {
        query: "BambuLab",
        sources: "all",
        limit: "20"
      },
      fields: [
        { key: "query", label: "Search Topic / Query", type: "text", placeholder: "BambuLab / Budget / Rezept / Home Assistant" },
        {
          key: "sources",
          label: "Sources Filter",
          type: "select",
          options: ["all", "markdown", "notes", "drive", "database"]
        },
        { key: "limit", label: "Max Results", type: "number", placeholder: "20" }
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || "").trim();
        const sources = String(input.sources || "all").toLowerCase();
        const limit = Math.max(1, Math.min(60, Number(input.limit || 20)));
        const hits = await executeFederatedMemoSearch(
          ctx,
          query,
          sources,
          limit,
          (t) => this.resolveGoogleAccessToken(t)
        );
        return {
          summary: `Memo Search "${query || "*"}": ${hits.length} Treffer (${sources})`,
          data: {
            query,
            sources,
            count: hits.length,
            results: hits,
            formattedText: hits.map(
              (h, i) => `${i + 1}. [${h.sourceType.toUpperCase()}] ${h.title} (${h.ref})
   ${h.snippet}`
            ).join("\n\n")
          }
        };
      }
    });
    this.register({
      id: "memo.note.upsert",
      name: "Memo: Save Note or Markdown Document",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Creates or updates a structured note or .md file in the Memo knowledge base and SQLite index.",
      defaultInput: {
        title: "Neue Erkenntnis",
        content: "{{$input}}",
        tags: "memo,wissen",
        saveAsMarkdownFile: "true"
      },
      fields: [
        { key: "title", label: "Title", type: "text", placeholder: "Projekt-Notiz / Zusammenfassung", required: true },
        { key: "content", label: "Markdown Content", type: "textarea", placeholder: "# \xDCberschrift\n\nInhalt...", required: true },
        { key: "tags", label: "Tags (CSV)", type: "text", placeholder: "ha,projekt,notiz" },
        { key: "saveAsMarkdownFile", label: "Also write .md file to Vault", type: "select", options: ["true", "false"] }
      ],
      execute: async (input, ctx) => {
        const title = String(input.title || "Unbenannte Notiz").trim();
        const content = String(input.content || "").trim();
        const tags = String(input.tags || "memo").trim();
        const writeMd = String(input.saveAsMarkdownFile ?? "true") !== "false";
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const memoDb = openAppDatabaseReadWrite(ctx.dataDir, "memo");
        ensureMemoSchema(memoDb);
        let filePathRel = "";
        if (writeMd) {
          const vaultDir = path2.join(ctx.dataDir, "memo_vault");
          fs2.mkdirSync(vaultDir, { recursive: true });
          const safeSlug = title.toLowerCase().replace(/[^a-z0-9äöüß_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `note-${Date.now()}`;
          const fullPath = path2.join(vaultDir, `${safeSlug}.md`);
          const mdBody = content.startsWith("#") ? content : `# ${title}

${content}
`;
          fs2.writeFileSync(fullPath, mdBody, "utf-8");
          filePathRel = `memo_vault/${safeSlug}.md`;
        }
        const existing = memoDb.queryOne(
          "SELECT id FROM memo_entries WHERE LOWER(title) = LOWER(?) LIMIT 1",
          [title]
        );
        let entryId;
        if (existing) {
          memoDb.execute(
            `UPDATE memo_entries
             SET content = ?, tags = ?, file_path = COALESCE(NULLIF(?, ''), file_path), updated_at = ?
             WHERE id = ?`,
            [content, tags, filePathRel, now, existing.id]
          );
          entryId = existing.id;
        } else {
          const res = memoDb.execute(
            `INSERT INTO memo_entries (source_type, title, content, tags, file_path, external_id, pinned, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, '', 0, ?, ?)`,
            [writeMd ? "markdown" : "note", title, content, tags, filePathRel, now, now]
          );
          entryId = Number(res.lastInsertRowid);
        }
        ctx.sharedDb.execute(
          "INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)",
          [`[${title}] ${content.slice(0, 280)}`, now]
        );
        return {
          summary: `Saved "${title}" to Memo (#${entryId}${filePathRel ? ` \xB7 ${filePathRel}` : ""})`,
          data: {
            id: entryId,
            title,
            tags,
            filePath: filePathRel || null,
            updatedAt: now
          }
        };
      }
    });
    this.register({
      id: "memo.context.bundle",
      name: "Memo: Build Topic Context Bundle for AI",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Compiles a structured Markdown context dossier for any topic by querying Google Drive, local .md files, notes, and SQLite databases.",
      defaultInput: {
        topic: "Smart Home & Energie",
        maxSnippets: "12"
      },
      fields: [
        { key: "topic", label: "Topic / Research Question", type: "text", placeholder: "Smart Home / Finanzen / 3D Druck" },
        { key: "maxSnippets", label: "Max Context Blocks", type: "number", placeholder: "12" }
      ],
      execute: async (input, ctx) => {
        const topic = String(input.topic || "").trim();
        const maxSnippets = Math.max(3, Math.min(30, Number(input.maxSnippets || 12)));
        const hits = await executeFederatedMemoSearch(
          ctx,
          topic,
          "all",
          maxSnippets,
          (t) => this.resolveGoogleAccessToken(t)
        );
        const markdownBundle = [
          `# MEMO CONTEXT DOSSIER \u2014 "${topic || "Gesamt\xFCbersicht"}"`,
          `Generiert: ${(/* @__PURE__ */ new Date()).toISOString()} \xB7 Treffer: ${hits.length}`,
          "",
          ...hits.map(
            (h, idx) => `## [${idx + 1}] ${h.title} (${h.sourceType.toUpperCase()} \xB7 ${h.ref})
${h.contentPreview || h.snippet}`
          )
        ].join("\n\n");
        return {
          summary: `Context Bundle "${topic || "*"}": ${hits.length} sources (${markdownBundle.length} chars)`,
          data: {
            topic,
            sourceCount: hits.length,
            sources: hits,
            markdownBundle,
            formattedText: markdownBundle
          }
        };
      }
    });
    this.register({
      id: "cortex.prompt.enriched",
      name: "Cortex: Context-Enriched Gemini Intelligence",
      domainCode: "AI",
      category: "gemini",
      icon: "AI",
      description: "Enriches a prompt with live local data (Memo knowledge, Home Assistant, Calendar, Finance, Health, PC) and executes Gemini with a structured response pattern.",
      defaultInput: {
        prompt: "Erstelle mein aktuelles Tages-Briefing und schlage die 3 wichtigsten n\xE4chsten Schritte vor.",
        contextScopes: "memo,ha,calendar,finance,pc",
        responsePattern: "SYNTHESIS_BRIEF",
        model: "gemini-2.5-flash"
      },
      fields: [
        { key: "prompt", label: "Prompt / Auftrag", type: "textarea", placeholder: "Was soll Cortex analysieren oder ausf\xFChren?", required: true },
        { key: "contextScopes", label: "Context Scopes (CSV)", type: "text", placeholder: "memo,ha,calendar,finance,health,meals,pc" },
        {
          key: "responsePattern",
          label: "Antwort-Muster (Pattern)",
          type: "select",
          options: [
            "SYNTHESIS_BRIEF",
            "ACTION_PLAN",
            "KNOWLEDGE_EXTRACT",
            "DECISION_MATRIX",
            "DATA_TABLE"
          ]
        },
        { key: "model", label: "Gemini Model", type: "select", options: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] }
      ],
      execute: async (input, ctx) => {
        const prompt = String(input.prompt || "").trim();
        if (!prompt) throw new Error("Prompt is required");
        const scopes = String(input.contextScopes || "memo,ha,calendar,finance").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const pattern = String(input.responsePattern || "SYNTHESIS_BRIEF").toUpperCase();
        const model = String(input.model || "gemini-2.5-flash").trim();
        const apiKey = ctx.credentials?.geminiApiKey || discoverGeminiApiKeyFromHass();
        if (!apiKey) {
          throw new Error("Gemini API Key fehlt. Bitte in Cortex oder Axons hinterlegen.");
        }
        const contextBlocks = [];
        if (scopes.includes("memo")) {
          const memoHits = await executeFederatedMemoSearch(
            ctx,
            prompt.slice(0, 60),
            "all",
            8,
            (t) => this.resolveGoogleAccessToken(t)
          );
          if (memoHits.length > 0) {
            contextBlocks.push(
              `[MEMO KNOWLEDGE HITS]
` + memoHits.map((h) => `- [${h.sourceType}] ${h.title}: ${h.snippet}`).join("\n")
            );
          }
        }
        if (scopes.includes("ha")) {
          try {
            const states = await ctx.ha.getStates();
            const active = states.filter(
              (s) => (s.entity_id.startsWith("light.") || s.entity_id.startsWith("switch.") || s.entity_id.startsWith("sensor.shelly")) && s.state !== "unavailable"
            ).slice(0, 25).map((s) => `${s.entity_id}=${s.state}${s.attributes?.unit_of_measurement || ""}`);
            contextBlocks.push(`[HOME ASSISTANT LIVE (${states.length} entities)]
${active.join(", ")}`);
          } catch {
          }
        }
        if (scopes.includes("calendar")) {
          try {
            const calRes = await this.execute("gcal.upcoming", { maxResults: "8" });
            contextBlocks.push(`[CALENDAR UPCOMING]
${calRes.data?.formattedText || calRes.summary}`);
          } catch {
          }
        }
        if (scopes.includes("finance")) {
          try {
            const finRes = await this.execute("finance.summary.get", {});
            contextBlocks.push(`[FINANCE SUMMARY]
${finRes.summary}`);
          } catch {
          }
        }
        if (scopes.includes("pc")) {
          try {
            const pcRes = await this.execute("pc.status.telemetry", {});
            contextBlocks.push(`[WORKSTATION PC]
${pcRes.summary}`);
          } catch {
          }
        }
        const patternInstructions = {
          SYNTHESIS_BRIEF: "Antworte als pr\xE4zises Executive Dossier (Markdown) mit: 1. Kernaussage, 2. Fakten aus den Live-Daten, 3. Konkrete Handlungsempfehlungen.",
          ACTION_PLAN: "Erstelle einen nummerierten, ausf\xFChrbaren Aktionsplan und nenne zu jedem Schritt die passende Thassi Axon-ID (z.B. ha.service.call, gcal.create_event, memo.note.upsert, pc.powershell.exec).",
          KNOWLEDGE_EXTRACT: "Extrahiere strukturierte Fakten, Entit\xE4ten, Kernaussagen und Tags in sauberem Markdown f\xFCr die dauerhafte Ablage in Memo.",
          DECISION_MATRIX: "Vergleiche die Optionen quantitativ anhand der Live-Daten (Kosten, Zeit, Nutzen, Risiko) und gib eine eindeutige Empfehlung.",
          DATA_TABLE: "Gib die Antwort als pr\xE4zise Markdown-Tabelle mit klaren Spalten und tabellarischen Kennzahlen aus."
        };
        const fullPrompt = [
          `AUFTRAG:
${prompt}`,
          contextBlocks.length > 0 ? `
ANGEREICHERTE LOKALE LIVE-DATEN:
${contextBlocks.join("\n\n")}` : ""
        ].join("\n");
        const { text, modelUsed } = await callGeminiGenerateContent({
          apiKey,
          model,
          prompt: fullPrompt,
          systemInstruction: `Du bist CORTEX, die lokale KI- und Agenten-Instanz im Thassi Home & Life OS von Thomas Simhofer. ` + (patternInstructions[pattern] || patternInstructions.SYNTHESIS_BRIEF)
        });
        return {
          summary: `Cortex [${pattern} \xB7 ${modelUsed}]: ${text.slice(0, 95).replace(/\n+/g, " ")}`,
          data: {
            model: modelUsed,
            responsePattern: pattern,
            contextScopes: scopes,
            contextBlockCount: contextBlocks.length,
            response: text,
            formattedText: text
          }
        };
      }
    });
  }
};
var PcAgentReverseBridgeImpl = class {
  latestStatus = null;
  lastSeenAt = 0;
  latestFrameJpeg = null;
  requestedMonitor = "primary";
  queue = [];
  resolvers = /* @__PURE__ */ new Map();
  ingestSync(body) {
    this.lastSeenAt = Date.now();
    if (body.status && typeof body.status === "object") {
      this.latestStatus = body.status;
    }
    if (body.frameBase64 && typeof body.frameBase64 === "string") {
      this.latestFrameJpeg = Buffer.from(body.frameBase64, "base64");
    }
    const commands = this.queue.splice(0, this.queue.length);
    return {
      requestedMonitor: this.requestedMonitor,
      commands
    };
  }
  resolveCommand(id, result, error) {
    const pending = this.resolvers.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.resolvers.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
  async getStatusOrCall(baseUrl) {
    if (this.latestStatus && Date.now() - this.lastSeenAt < 15e3) {
      return this.latestStatus;
    }
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1200)
      });
      if (res.ok) {
        const snap = await res.json();
        this.latestStatus = snap;
        this.lastSeenAt = Date.now();
        return snap;
      }
    } catch {
    }
    if (this.latestStatus) {
      return this.latestStatus;
    }
    throw new Error("Thassi.PcAgent on DESKTOP-M8TJERB is currently offline or unreachable.");
  }
  async callEndpoint(baseUrl, endpoint, payload, timeoutMs = 8e3) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(700)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
    }
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(id);
        reject(new Error(`Timeout waiting for Thassi.PcAgent (${endpoint}) after ${timeoutMs}ms`));
      }, timeoutMs);
      this.resolvers.set(id, { resolve, reject, timer });
      this.queue.push({ id, endpoint, payload, createdAt: Date.now() });
    });
  }
};
var PcAgentReverseBridge = new PcAgentReverseBridgeImpl();
async function _sendWakeOnLanMagicPacket(macAddress, broadcastIp) {
  const hexParts = macAddress.replace(/[^0-9a-fA-F]/g, "").match(/.{1,2}/g);
  if (!hexParts || hexParts.length !== 6) {
    throw new Error(`Invalid MAC address for Wake-on-LAN: "${macAddress}"`);
  }
  const macBytes = Buffer.from(hexParts.map((h) => parseInt(h, 16)));
  const packet = Buffer.alloc(6 + 16 * 6, 255);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }
  await new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    sock.once("error", (err) => {
      sock.close();
      reject(err);
    });
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(packet, 0, packet.length, 9, broadcastIp, (err) => {
        sock.send(packet, 0, packet.length, 7, broadcastIp, () => {
          sock.close();
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });
}
function _sHasNumericPct(s) {
  return s.attributes?.unit_of_measurement === "%" && !Number.isNaN(Number(s.state));
}
function ensureMemoSchema(memoDb) {
  memoDb.exec(`
    CREATE TABLE IF NOT EXISTS memo_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      external_id TEXT NOT NULL DEFAULT '',
      external_url TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
async function executeFederatedMemoSearch(ctx, rawQuery, sourcesFilter, limit, resolveToken) {
  const q = rawQuery.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const wantAll = !sourcesFilter || sourcesFilter === "all";
  const wantMd = wantAll || sourcesFilter.includes("markdown") || sourcesFilter.includes("md");
  const wantNotes = wantAll || sourcesFilter.includes("note") || sourcesFilter.includes("keep");
  const wantDrive = wantAll || sourcesFilter.includes("drive");
  const wantDb = wantAll || sourcesFilter.includes("database") || sourcesFilter.includes("db");
  const results = [];
  const computeScore = (title, body, tags = "", pinned = 0) => {
    if (terms.length === 0) return 50 + (pinned ? 25 : 0);
    const tLow = title.toLowerCase();
    const bLow = body.toLowerCase();
    const gLow = tags.toLowerCase();
    let score = pinned ? 15 : 0;
    for (const term of terms) {
      if (tLow === term) score += 60;
      else if (tLow.includes(term)) score += 35;
      if (gLow.includes(term)) score += 25;
      if (bLow.includes(term)) {
        score += 15;
        const occurrences = bLow.split(term).length - 1;
        score += Math.min(20, occurrences * 3);
      }
    }
    return score;
  };
  const extractSnippet = (text, maxLen = 220) => {
    const clean = text.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    if (!q || terms.length === 0) return clean.slice(0, maxLen);
    const low = clean.toLowerCase();
    for (const term of terms) {
      const idx = low.indexOf(term);
      if (idx >= 0) {
        const start = Math.max(0, idx - 55);
        const slice = clean.slice(start, start + maxLen);
        return (start > 0 ? "\u2026" : "") + slice + (start + maxLen < clean.length ? "\u2026" : "");
      }
    }
    return clean.slice(0, maxLen);
  };
  try {
    const memoDb = openAppDatabaseReadWrite(ctx.dataDir, "memo");
    ensureMemoSchema(memoDb);
    const rows = memoDb.query("SELECT * FROM memo_entries ORDER BY pinned DESC, updated_at DESC LIMIT 250");
    for (const r of rows) {
      const sType = r.source_type === "markdown" ? "markdown" : r.source_type === "drive" ? "drive" : "notes";
      if (sType === "markdown" && !wantMd) continue;
      if (sType === "notes" && !wantNotes) continue;
      if (sType === "drive" && !wantDrive) continue;
      const sc = computeScore(r.title, r.content, r.tags, r.pinned);
      if (terms.length > 0 && sc <= (r.pinned ? 15 : 0)) continue;
      results.push({
        id: `memo_${r.id}`,
        sourceType: sType,
        sourceBadge: r.source_type === "keep" ? "GKEEP" : sType === "markdown" ? "MD" : sType === "drive" ? "DRIVE" : "NOTE",
        title: r.title,
        snippet: extractSnippet(r.content),
        contentPreview: r.content.slice(0, 1800),
        ref: r.file_path || (r.external_id ? `drive:${r.external_id.slice(0, 10)}` : `memo#${r.id}`),
        tags: r.tags.split(",").map((t) => t.trim()).filter(Boolean),
        updatedAt: r.updated_at,
        score: sc + 10,
        externalUrl: r.external_url || void 0
      });
    }
  } catch {
  }
  if (wantMd) {
    const candidateDirs = [
      path2.join(ctx.dataDir, "memo_vault"),
      process.cwd()
    ];
    const seenPaths = /* @__PURE__ */ new Set();
    for (const dir of candidateDirs) {
      try {
        if (!fs2.existsSync(dir)) continue;
        const entries = fs2.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
          const full = path2.join(dir, entry.name);
          if (seenPaths.has(full)) continue;
          seenPaths.add(full);
          const stat = fs2.statSync(full);
          if (stat.size > 512e3) continue;
          const content = fs2.readFileSync(full, "utf-8");
          const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.name;
          const sc = computeScore(`${entry.name} ${firstHeading}`, content, "markdown,local");
          if (terms.length > 0 && sc <= 0) continue;
          results.push({
            id: `md_${entry.name}`,
            sourceType: "markdown",
            sourceBadge: "MD",
            title: firstHeading,
            snippet: extractSnippet(content),
            contentPreview: content.slice(0, 2e3),
            ref: entry.name,
            tags: ["markdown", "file"],
            updatedAt: stat.mtime.toISOString(),
            score: sc + 5
          });
        }
      } catch {
      }
    }
  }
  if (wantDb || wantNotes) {
    try {
      const sysNotes = ctx.sharedDb.query("SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 100");
      for (const sn of sysNotes) {
        if (!wantNotes && !wantDb) continue;
        const firstLine = sn.content.split("\n")[0]?.slice(0, 72) || `Notiz #${sn.id}`;
        const sc = computeScore(firstLine, sn.content, "note,shared", sn.pinned);
        if (terms.length > 0 && sc <= (sn.pinned ? 15 : 0)) continue;
        results.push({
          id: `sysnote_${sn.id}`,
          sourceType: "notes",
          sourceBadge: "NOTE",
          title: firstLine,
          snippet: extractSnippet(sn.content),
          contentPreview: sn.content,
          ref: `shared.system_notes#${sn.id}`,
          tags: ["system_notes"],
          updatedAt: sn.created_at,
          score: sc
        });
      }
    } catch {
    }
  }
  if (wantDb) {
    try {
      const finDb = openAppDatabaseReadWrite(ctx.dataDir, "finance-analytics");
      const txs = finDb.query("SELECT * FROM transactions ORDER BY tx_date DESC LIMIT 150");
      for (const tx of txs) {
        const text = `${tx.payee} ${tx.category} ${tx.notes || ""} ${tx.amount} EUR (${tx.tx_date})`;
        const sc = computeScore(`${tx.payee} ${tx.category}`, text, "finanzen,buchung,ledger");
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_fin_${tx.id}`,
          sourceType: "database",
          sourceBadge: "DB:FIN",
          title: `${tx.payee} (${tx.amount >= 0 ? "+" : ""}${Number(tx.amount).toFixed(2)} \u20AC)`,
          snippet: `${tx.tx_date} \xB7 Kategorie: ${tx.category}${tx.notes ? ` \xB7 ${tx.notes}` : ""}`,
          contentPreview: JSON.stringify(tx, null, 2),
          ref: `finance.transactions#${tx.id}`,
          tags: ["finance", tx.category.toLowerCase()],
          updatedAt: `${tx.tx_date}T00:00:00Z`,
          score: sc
        });
      }
    } catch {
    }
    try {
      const mealDb = openAppDatabaseReadWrite(ctx.dataDir, "meal-planner");
      const recipes = mealDb.query("SELECT * FROM recipes LIMIT 100");
      for (const rec of recipes) {
        const text = `${rec.title} ${rec.category} ${rec.ingredients_json || ""} ${rec.instructions || ""}`;
        const sc = computeScore(rec.title, text, "rezept,meals,ern\xE4hrung");
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_meal_${rec.id}`,
          sourceType: "database",
          sourceBadge: "DB:MEALS",
          title: `Rezept: ${rec.title}`,
          snippet: `${rec.calories} kcal \xB7 ${rec.protein_g}g Protein \xB7 ${extractSnippet(rec.instructions || rec.ingredients_json)}`,
          contentPreview: text.slice(0, 1500),
          ref: `meals.recipes#${rec.id}`,
          tags: ["meals", "recipe"],
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          score: sc
        });
      }
    } catch {
    }
    try {
      const calDb = openAppDatabaseReadWrite(ctx.dataDir, "google-calendar");
      const evs = calDb.query("SELECT * FROM cached_events ORDER BY start_time DESC LIMIT 100");
      for (const ev of evs) {
        const text = `${ev.summary} ${ev.location || ""} ${ev.description || ""} ${ev.start_time}`;
        const sc = computeScore(ev.summary, text, "kalender,termin,event");
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_cal_${ev.id}`,
          sourceType: "database",
          sourceBadge: "DB:CAL",
          title: ev.summary,
          snippet: `${ev.start_time}${ev.location ? ` \xB7 ${ev.location}` : ""}${ev.description ? ` \xB7 ${ev.description}` : ""}`,
          contentPreview: text,
          ref: `calendar.events#${String(ev.id).slice(0, 10)}`,
          tags: ["calendar", "event"],
          updatedAt: ev.start_time,
          score: sc
        });
      }
    } catch {
    }
  }
  if (wantDrive) {
    try {
      const token = await resolveToken(ctx.credentials?.googleOAuthToken);
      const escaped = q.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const driveQuery = q ? `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')` : "trashed = false";
      const params = new URLSearchParams({
        pageSize: "15",
        q: driveQuery,
        orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,modifiedTime,webViewLink,description)"
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4500)
      });
      if (res.ok) {
        const data = await res.json();
        for (const f of data.files || []) {
          const mime = String(f.mimeType || "");
          const shortMime = mime.includes("document") ? "Google Doc" : mime.includes("spreadsheet") ? "Google Sheet" : mime.includes("presentation") ? "Slides" : mime.includes("pdf") ? "PDF" : mime.includes("folder") ? "Folder" : mime.split("/").pop() || "File";
          const sc = computeScore(String(f.name || ""), String(f.description || shortMime), "drive,google") + 20;
          results.push({
            id: `drive_${f.id}`,
            sourceType: "drive",
            sourceBadge: "DRIVE",
            title: String(f.name || "Drive File"),
            snippet: `${shortMime} \xB7 Zuletzt ge\xE4ndert: ${f.modifiedTime || ""}${f.description ? ` \xB7 ${f.description}` : ""}`,
            contentPreview: `Google Drive File: ${f.name}
ID: ${f.id}
Type: ${mime}
URL: ${f.webViewLink || ""}`,
            ref: `drive:${String(f.id).slice(0, 12)}`,
            tags: ["drive", shortMime.toLowerCase()],
            updatedAt: String(f.modifiedTime || (/* @__PURE__ */ new Date()).toISOString()),
            score: sc,
            externalUrl: f.webViewLink || void 0
          });
        }
      }
    } catch {
    }
  }
  const unique = /* @__PURE__ */ new Map();
  for (const item of results) {
    const key = `${item.sourceType}:${item.title.toLowerCase()}`;
    const prev = unique.get(key);
    if (!prev || item.score > prev.score) {
      unique.set(key, item);
    }
  }
  return Array.from(unique.values()).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/meal-planner/backend/index.ts
var DEFAULT_USER_PROFILE = {
  name: "Thomas",
  age: 32,
  gender: "male",
  height_cm: 180,
  current_weight_kg: 82,
  target_weight_kg: 76,
  activity_level: "moderate",
  who_profile: "who_high_protein",
  weekly_goal_kg: -0.4,
  target_calories: 2150,
  target_protein_g: 145,
  target_carbs_g: 215,
  target_fat_g: 68,
  target_fiber_g: 30,
  max_sugar_g: 48,
  target_water_ml: 2800
};
var DEFAULT_OPTIMIZATION_OPTIONS = {
  mode: "waste_min",
  preferred_stores: ["billa", "hofer", "spar"],
  use_pantry_stock: true,
  auto_accumulate_packages: true,
  max_unique_ingredients_per_week: 18,
  prefer_bio: true
};
function computeProfileTargets(raw) {
  const merged = { ...DEFAULT_USER_PROFILE, ...raw };
  const weight = Number(merged.current_weight_kg) || 80;
  const targetWeight = Number(merged.target_weight_kg) || weight;
  const height = Number(merged.height_cm) || 178;
  const age = Number(merged.age) || 32;
  const genderOffset = merged.gender === "female" ? -161 : merged.gender === "diverse" ? -78 : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
  const palMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };
  const tdee = bmr * (palMap[merged.activity_level] || 1.55);
  let weeklyDeltaKg = Number(merged.weekly_goal_kg);
  if (!Number.isFinite(weeklyDeltaKg)) {
    weeklyDeltaKg = targetWeight < weight ? -0.4 : targetWeight > weight ? 0.25 : 0;
  }
  const dailyCalorieDelta = Math.max(-750, Math.min(600, Math.round(weeklyDeltaKg * 1e3)));
  const targetCalories = Math.max(1350, Math.round(tdee + dailyCalorieDelta));
  let protRatio = 0.2;
  let carbRatio = 0.52;
  let fatRatio = 0.28;
  let fiberTarget = 28;
  let sugarMaxRatio = 0.09;
  if (merged.who_profile === "who_high_protein") {
    protRatio = 0.27;
    carbRatio = 0.45;
    fatRatio = 0.28;
    fiberTarget = 30;
    sugarMaxRatio = 0.07;
  } else if (merged.who_profile === "who_mediterranean") {
    protRatio = 0.2;
    carbRatio = 0.45;
    fatRatio = 0.35;
    fiberTarget = 32;
    sugarMaxRatio = 0.07;
  } else if (merged.who_profile === "who_plant_based") {
    protRatio = 0.19;
    carbRatio = 0.55;
    fatRatio = 0.26;
    fiberTarget = 38;
    sugarMaxRatio = 0.08;
  } else if (merged.who_profile === "who_metabolic") {
    protRatio = 0.28;
    carbRatio = 0.38;
    fatRatio = 0.34;
    fiberTarget = 35;
    sugarMaxRatio = 0.05;
  }
  const targetProtein = Math.round(targetCalories * protRatio / 4);
  const targetCarbs = Math.round(targetCalories * carbRatio / 4);
  const targetFat = Math.round(targetCalories * fatRatio / 9);
  const maxSugar = Math.round(targetCalories * sugarMaxRatio / 4);
  const targetWater = Math.round(weight * 35);
  return {
    ...merged,
    weekly_goal_kg: weeklyDeltaKg,
    target_calories: targetCalories,
    target_protein_g: targetProtein,
    target_carbs_g: targetCarbs,
    target_fat_g: targetFat,
    target_fiber_g: fiberTarget,
    max_sugar_g: maxSugar,
    target_water_ml: targetWater
  };
}
var STARTER_INGREDIENTS = [
  {
    name: "Haferflocken Zartblatt",
    barcode: "9002233001122",
    brand: "SPAR Natur*pur / Ja! Nat\xFCrlich",
    unit: "g",
    package_size: 500,
    available_amount: 160,
    calories_per_100: 372,
    protein_per_100: 13.5,
    carbs_per_100: 58.7,
    fat_per_100: 7,
    fiber_per_100: 10,
    sugar_per_100: 0.8,
    nutriscore: "A",
    price_billa: 1.49,
    pack_billa: 500,
    product_billa: "Ja! Nat\xFCrlich Bio-Haferflocken 500g",
    price_hofer: 0.89,
    pack_hofer: 500,
    product_hofer: "Zur\xFCck zum Ursprung Bio-Haferflocken 500g",
    price_spar: 1.29,
    pack_spar: 500,
    product_spar: "SPAR Natur*pur Bio-Haferflocken 500g"
  },
  {
    name: "Skyr Natur",
    barcode: "9002100045123",
    brand: "N\xD6M / Milfina",
    unit: "g",
    package_size: 400,
    available_amount: 100,
    calories_per_100: 63,
    protein_per_100: 11,
    carbs_per_100: 4,
    fat_per_100: 0.2,
    fiber_per_100: 0,
    sugar_per_100: 4,
    nutriscore: "A",
    price_billa: 1.79,
    pack_billa: 400,
    product_billa: "N\xD6M PRO Skyr Natur 400g",
    price_hofer: 1.39,
    pack_hofer: 500,
    product_hofer: "Milfina Skyr Natur 500g",
    price_spar: 1.59,
    pack_spar: 400,
    product_spar: "S-BUDGET Skyr Natur 400g"
  },
  {
    name: "Heidelbeeren / Beerenmix",
    barcode: "9005500112233",
    brand: "Da komm ich her!",
    unit: "g",
    package_size: 300,
    available_amount: 0,
    calories_per_100: 46,
    protein_per_100: 0.8,
    carbs_per_100: 9.2,
    fat_per_100: 0.4,
    fiber_per_100: 3.1,
    sugar_per_100: 7.4,
    nutriscore: "A",
    price_billa: 2.99,
    pack_billa: 300,
    product_billa: "BILLA Beerenmix TK/Frisch 300g",
    price_hofer: 2.49,
    pack_hofer: 300,
    product_hofer: "Hofer Marktplatz Heidelbeeren 300g",
    price_spar: 2.79,
    pack_spar: 250,
    product_spar: "SPAR Natur*pur Heidelbeeren 250g"
  },
  {
    name: "Bio-Eier",
    barcode: "9001112223334",
    brand: "Toni's Freilandeier / Zur\xFCck zum Ursprung",
    unit: "Stk",
    package_size: 10,
    available_amount: 2,
    calories_per_100: 155,
    protein_per_100: 13,
    carbs_per_100: 1.1,
    fat_per_100: 11,
    fiber_per_100: 0,
    sugar_per_100: 0.7,
    nutriscore: "A",
    price_billa: 3.99,
    pack_billa: 10,
    product_billa: "Ja! Nat\xFCrlich Bio-Freilandeier 10 Stk",
    price_hofer: 3.49,
    pack_hofer: 10,
    product_hofer: "Zur\xFCck zum Ursprung Bio-Eier 10 Stk",
    price_spar: 3.79,
    pack_spar: 6,
    product_spar: "SPAR Natur*pur Bio-Eier 6 Stk"
  },
  {
    name: "Vollkorn-Sauerteigbrot",
    barcode: "9003334445556",
    brand: "\xD6lz / Backbox",
    unit: "g",
    package_size: 500,
    available_amount: 120,
    calories_per_100: 218,
    protein_per_100: 7.8,
    carbs_per_100: 41,
    fat_per_100: 1.8,
    fiber_per_100: 7.2,
    sugar_per_100: 2.1,
    nutriscore: "A",
    price_billa: 2.69,
    pack_billa: 500,
    product_billa: "Ja! Nat\xFCrlich Bio-Roggenvollkornbrot 500g",
    price_hofer: 1.99,
    pack_hofer: 500,
    product_hofer: "Backbox Bio-Urkornbrot 500g",
    price_spar: 2.49,
    pack_spar: 500,
    product_spar: "SPAR Natur*pur Bio-Vollkornbrot 500g"
  },
  {
    name: "H\xFChnerbrustfilet",
    barcode: "9004445556667",
    brand: "Wech / TANN / FairHOF",
    unit: "g",
    package_size: 400,
    available_amount: 0,
    calories_per_100: 110,
    protein_per_100: 23.5,
    carbs_per_100: 0.2,
    fat_per_100: 1.5,
    fiber_per_100: 0,
    sugar_per_100: 0,
    nutriscore: "A",
    price_billa: 6.49,
    pack_billa: 400,
    product_billa: "BILLA Hofst\xE4dter H\xFChnerbrustfilet 400g",
    price_hofer: 5.49,
    pack_hofer: 500,
    product_hofer: "FairHOF H\xFChnerbrustfilet 500g",
    price_spar: 5.99,
    pack_spar: 400,
    product_spar: "TANN \xD6sterreichisches H\xFChnerfilet 400g"
  },
  {
    name: "Quinoa / Naturreis",
    barcode: "9006667778889",
    brand: "SPAR Natur*pur / Ja! Nat\xFCrlich",
    unit: "g",
    package_size: 500,
    available_amount: 150,
    calories_per_100: 355,
    protein_per_100: 13.8,
    carbs_per_100: 62,
    fat_per_100: 5.8,
    fiber_per_100: 6.8,
    sugar_per_100: 1.6,
    nutriscore: "A",
    price_billa: 2.99,
    pack_billa: 400,
    product_billa: "Ja! Nat\xFCrlich Bio-Quinoa 400g",
    price_hofer: 2.29,
    pack_hofer: 500,
    product_hofer: "Natur Aktiv Bio-Quinoa & Reis 500g",
    price_spar: 2.69,
    pack_spar: 500,
    product_spar: "SPAR Natur*pur Bio-Quinoa 500g"
  },
  {
    name: "Lachsfilet",
    barcode: "9007778889990",
    brand: "Gourmet / ASC",
    unit: "g",
    package_size: 250,
    available_amount: 0,
    calories_per_100: 206,
    protein_per_100: 20.4,
    carbs_per_100: 0,
    fat_per_100: 13.6,
    fiber_per_100: 0,
    sugar_per_100: 0,
    nutriscore: "A",
    price_billa: 6.99,
    pack_billa: 250,
    product_billa: "BILLA Genusswelt Bio-Lachsfilet 250g",
    price_hofer: 5.29,
    pack_hofer: 300,
    product_hofer: "Golden Seafood Lachsfilet 300g",
    price_spar: 5.99,
    pack_spar: 250,
    product_spar: "SPAR Premium Norwegischer Lachs 250g"
  },
  {
    name: "Brokkoli",
    barcode: "9008889990001",
    brand: "Frischgem\xFCse \xD6sterreich",
    unit: "g",
    package_size: 400,
    available_amount: 0,
    calories_per_100: 34,
    protein_per_100: 3.3,
    carbs_per_100: 2.7,
    fat_per_100: 0.4,
    fiber_per_100: 3,
    sugar_per_100: 1.4,
    nutriscore: "A",
    price_billa: 1.99,
    pack_billa: 400,
    product_billa: "Da komm ich her! Brokkoli 400g",
    price_hofer: 1.59,
    pack_hofer: 500,
    product_hofer: "Hofer Marktplatz Brokkoli 500g",
    price_spar: 1.89,
    pack_spar: 400,
    product_spar: "SPAR Natur*pur Bio-Brokkoli 400g"
  },
  {
    name: "Rote Linsen",
    barcode: "9009990001112",
    brand: "Ja! Nat\xFCrlich / Natur Aktiv",
    unit: "g",
    package_size: 500,
    available_amount: 200,
    calories_per_100: 348,
    protein_per_100: 25.4,
    carbs_per_100: 52,
    fat_per_100: 1.6,
    fiber_per_100: 11.5,
    sugar_per_100: 1.8,
    nutriscore: "A",
    price_billa: 2.19,
    pack_billa: 500,
    product_billa: "Ja! Nat\xFCrlich Bio-Rote Linsen 500g",
    price_hofer: 1.69,
    pack_hofer: 500,
    product_hofer: "Natur Aktiv Bio Rote Linsen 500g",
    price_spar: 1.99,
    pack_spar: 500,
    product_spar: "SPAR Natur*pur Bio Rote Linsen 500g"
  },
  {
    name: "Bio-Tofu Natur",
    barcode: "9001234567890",
    brand: "SPAR Veggie / Vegavita",
    unit: "g",
    package_size: 300,
    available_amount: 0,
    calories_per_100: 138,
    protein_per_100: 15.5,
    carbs_per_100: 1.2,
    fat_per_100: 8.1,
    fiber_per_100: 1.5,
    sugar_per_100: 0.5,
    nutriscore: "A",
    price_billa: 1.99,
    pack_billa: 300,
    product_billa: "Vegavita Bio-Tofu Natur 300g",
    price_hofer: 1.59,
    pack_hofer: 400,
    product_hofer: "MyVay Bio-Tofu Natur 400g",
    price_spar: 1.79,
    pack_spar: 300,
    product_spar: "SPAR Veggie Bio-Tofu 300g"
  },
  {
    name: "Babyspinat & Blattgem\xFCse",
    barcode: "9002345678901",
    brand: "LGV / Marktplatz",
    unit: "g",
    package_size: 200,
    available_amount: 50,
    calories_per_100: 23,
    protein_per_100: 2.9,
    carbs_per_100: 1.6,
    fat_per_100: 0.4,
    fiber_per_100: 2.6,
    sugar_per_100: 0.4,
    nutriscore: "A",
    price_billa: 1.99,
    pack_billa: 200,
    product_billa: "Ja! Nat\xFCrlich Bio-Babyspinat 200g",
    price_hofer: 1.49,
    pack_hofer: 200,
    product_hofer: "Natur Aktiv Bio-Babyspinat 200g",
    price_spar: 1.79,
    pack_spar: 200,
    product_spar: "SPAR Natur*pur Bio-Babyspinat 200g"
  },
  {
    name: "Schafk\xE4se / Feta",
    barcode: "9003456789012",
    brand: "Salakis / Milfina",
    unit: "g",
    package_size: 200,
    available_amount: 0,
    calories_per_100: 264,
    protein_per_100: 16.5,
    carbs_per_100: 1,
    fat_per_100: 21.5,
    fiber_per_100: 0,
    sugar_per_100: 1,
    nutriscore: "C",
    price_billa: 2.49,
    pack_billa: 200,
    product_billa: "Ja! Nat\xFCrlich Bio-Feta g.U. 200g",
    price_hofer: 1.89,
    pack_hofer: 200,
    product_hofer: "Milfina Griechischer Feta 200g",
    price_spar: 2.19,
    pack_spar: 200,
    product_spar: "S-BUDGET Feta 200g"
  },
  {
    name: "Strauchtomaten / Cherrytomaten",
    barcode: "9004567890123",
    brand: "LGV G\xE4rtnergem\xFCse",
    unit: "g",
    package_size: 500,
    available_amount: 100,
    calories_per_100: 19,
    protein_per_100: 0.9,
    carbs_per_100: 3.2,
    fat_per_100: 0.2,
    fiber_per_100: 1.2,
    sugar_per_100: 2.6,
    nutriscore: "A",
    price_billa: 2.49,
    pack_billa: 500,
    product_billa: "LGV Sonnenreife Strauchtomaten 500g",
    price_hofer: 1.99,
    pack_hofer: 500,
    product_hofer: "Hofer Marktplatz Rispentomaten 500g",
    price_spar: 2.29,
    pack_spar: 500,
    product_spar: "SPAR Natur*pur Bio-Tomaten 500g"
  },
  {
    name: "Hummus Natur",
    barcode: "9005678901234",
    brand: "Neni / SPAR Veggie",
    unit: "g",
    package_size: 200,
    available_amount: 50,
    calories_per_100: 245,
    protein_per_100: 7.8,
    carbs_per_100: 14,
    fat_per_100: 16.5,
    fiber_per_100: 5.8,
    sugar_per_100: 1.1,
    nutriscore: "A",
    price_billa: 2.29,
    pack_billa: 200,
    product_billa: "Vegavita Bio-Hummus Natur 200g",
    price_hofer: 1.49,
    pack_hofer: 200,
    product_hofer: "Good Choice Hummus Trio/Natur 200g",
    price_spar: 1.99,
    pack_spar: 200,
    product_spar: "NENI am Tisch Hummus 200g"
  },
  {
    name: "Waln\xFCsse & Mandeln Mix",
    barcode: "9006789012345",
    brand: "Seeberger / Good Choice",
    unit: "g",
    package_size: 200,
    available_amount: 80,
    calories_per_100: 615,
    protein_per_100: 18.5,
    carbs_per_100: 9,
    fat_per_100: 54,
    fiber_per_100: 9.5,
    sugar_per_100: 3.8,
    nutriscore: "A",
    price_billa: 3.49,
    pack_billa: 200,
    product_billa: "Ja! Nat\xFCrlich Bio-Nusskernmischung 200g",
    price_hofer: 2.49,
    pack_hofer: 200,
    product_hofer: "Happy Harvest Nuss-Mix ungesalzen 200g",
    price_spar: 2.99,
    pack_spar: 200,
    product_spar: "SPAR Natur*pur Bio-Edelnussmix 200g"
  }
];
var STARTER_RECIPES = [
  {
    name: "Skyr-Haferflocken Bowl mit Beeren & N\xFCssen",
    meal_type: "breakfast",
    calories: 470,
    protein_g: 34,
    carbs_g: 52,
    fat_g: 12,
    fiber_g: 9,
    sugar_g: 11,
    prep_minutes: 5,
    ingredients: [
      "75g Haferflocken Zartblatt",
      "200g Skyr Natur",
      "80g Heidelbeeren / Beerenmix",
      "15g Waln\xFCsse & Mandeln Mix"
    ],
    structured_ingredients: [
      { name: "Haferflocken Zartblatt", amount: 75, unit: "g" },
      { name: "Skyr Natur", amount: 200, unit: "g" },
      { name: "Heidelbeeren / Beerenmix", amount: 80, unit: "g" },
      { name: "Waln\xFCsse & Mandeln Mix", amount: 15, unit: "g" }
    ],
    instructions: "Skyr mit Haferflocken verr\xFChren, mit frischen Beeren und gehackten N\xFCssen toppen.",
    tags: "who-konform,high-protein,schnell"
  },
  {
    name: "Mediterranes Eier-Shakshuka mit Sauerteigbrot",
    meal_type: "breakfast",
    calories: 510,
    protein_g: 28,
    carbs_g: 42,
    fat_g: 23,
    fiber_g: 7,
    sugar_g: 6,
    prep_minutes: 15,
    ingredients: [
      "2 Stk Bio-Eier",
      "150g Strauchtomaten / Cherrytomaten",
      "40g Schafk\xE4se / Feta",
      "85g Vollkorn-Sauerteigbrot",
      "50g Babyspinat & Blattgem\xFCse"
    ],
    structured_ingredients: [
      { name: "Bio-Eier", amount: 2, unit: "Stk" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 150, unit: "g" },
      { name: "Schafk\xE4se / Feta", amount: 40, unit: "g" },
      { name: "Vollkorn-Sauerteigbrot", amount: 85, unit: "g" },
      { name: "Babyspinat & Blattgem\xFCse", amount: 50, unit: "g" }
    ],
    instructions: "Tomaten und Spinat schmoren, Eier darin pochieren, Feta dar\xFCberbr\xF6seln und mit Vollkornbrot servieren.",
    tags: "mediterran,vegetarisch,ballaststoffreich"
  },
  {
    name: "Vollkorn-Avocado-Hummus Stulle mit Bio-Ei",
    meal_type: "breakfast",
    calories: 440,
    protein_g: 22,
    carbs_g: 46,
    fat_g: 17,
    fiber_g: 8,
    sugar_g: 4,
    prep_minutes: 8,
    ingredients: [
      "100g Vollkorn-Sauerteigbrot",
      "50g Hummus Natur",
      "2 Stk Bio-Eier",
      "80g Strauchtomaten / Cherrytomaten"
    ],
    structured_ingredients: [
      { name: "Vollkorn-Sauerteigbrot", amount: 100, unit: "g" },
      { name: "Hummus Natur", amount: 50, unit: "g" },
      { name: "Bio-Eier", amount: 2, unit: "Stk" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 80, unit: "g" }
    ],
    instructions: "Vollkornbrot r\xF6sten, mit Hummus bestreichen, wachsweiche Bio-Eier und Tomatenscheiben darauf anrichten.",
    tags: "herzhaft,who-standard"
  },
  {
    name: "Mediterrane H\xFChner-Quinoa-Bowl mit Hummus",
    meal_type: "lunch",
    calories: 630,
    protein_g: 52,
    carbs_g: 58,
    fat_g: 19,
    fiber_g: 9,
    sugar_g: 5,
    prep_minutes: 20,
    ingredients: [
      "180g H\xFChnerbrustfilet",
      "85g Quinoa / Naturreis",
      "120g Strauchtomaten / Cherrytomaten",
      "60g Babyspinat & Blattgem\xFCse",
      "45g Hummus Natur"
    ],
    structured_ingredients: [
      { name: "H\xFChnerbrustfilet", amount: 180, unit: "g" },
      { name: "Quinoa / Naturreis", amount: 85, unit: "g" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 120, unit: "g" },
      { name: "Babyspinat & Blattgem\xFCse", amount: 60, unit: "g" },
      { name: "Hummus Natur", amount: 45, unit: "g" }
    ],
    instructions: "Quinoa kochen, H\xFChnerbrustfilet kurz braten, mit Babyspinat, Tomaten und Hummus als Bowl anrichten.",
    tags: "meal-prep,high-protein,who-konform"
  },
  {
    name: "Rotes Linsen-Dal mit Babyspinat & Naturreis",
    meal_type: "lunch",
    calories: 560,
    protein_g: 29,
    carbs_g: 82,
    fat_g: 9,
    fiber_g: 14,
    sugar_g: 5,
    prep_minutes: 25,
    ingredients: [
      "100g Rote Linsen",
      "60g Quinoa / Naturreis",
      "80g Babyspinat & Blattgem\xFCse",
      "120g Strauchtomaten / Cherrytomaten"
    ],
    structured_ingredients: [
      { name: "Rote Linsen", amount: 100, unit: "g" },
      { name: "Quinoa / Naturreis", amount: 60, unit: "g" },
      { name: "Babyspinat & Blattgem\xFCse", amount: 80, unit: "g" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 120, unit: "g" }
    ],
    instructions: "Rote Linsen mit gew\xFCrfelten Tomaten und Gew\xFCrzen 18 Min k\xF6cheln, Spinat unterheben, mit Naturreis/Quinoa servieren.",
    tags: "vegan,ballaststoff-champion,preiswert"
  },
  {
    name: "Knuspriger Bio-Tofu & Brokkoli Power-Bowl",
    meal_type: "lunch",
    calories: 540,
    protein_g: 32,
    carbs_g: 56,
    fat_g: 18,
    fiber_g: 10,
    sugar_g: 4,
    prep_minutes: 20,
    ingredients: [
      "150g Bio-Tofu Natur",
      "180g Brokkoli",
      "80g Quinoa / Naturreis",
      "40g Hummus Natur"
    ],
    structured_ingredients: [
      { name: "Bio-Tofu Natur", amount: 150, unit: "g" },
      { name: "Brokkoli", amount: 180, unit: "g" },
      { name: "Quinoa / Naturreis", amount: 80, unit: "g" },
      { name: "Hummus Natur", amount: 40, unit: "g" }
    ],
    instructions: "Tofu w\xFCrfeln und goldbraun anbraten, Brokkoli d\xFCnsten, auf Quinoa/Reis mit Hummus-Dressing anrichten.",
    tags: "pflanzlich,who-konform,zero-waste"
  },
  {
    name: "Ofen-Lachsfilet mit Brokkoli & Quinoa",
    meal_type: "dinner",
    calories: 640,
    protein_g: 48,
    carbs_g: 49,
    fat_g: 25,
    fiber_g: 8,
    sugar_g: 3,
    prep_minutes: 20,
    ingredients: [
      "180g Lachsfilet",
      "200g Brokkoli",
      "75g Quinoa / Naturreis",
      "80g Strauchtomaten / Cherrytomaten"
    ],
    structured_ingredients: [
      { name: "Lachsfilet", amount: 180, unit: "g" },
      { name: "Brokkoli", amount: 200, unit: "g" },
      { name: "Quinoa / Naturreis", amount: 75, unit: "g" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 80, unit: "g" }
    ],
    instructions: "Lachsfilet, Brokkchir\xF6schen und Tomaten bei 200\xB0C im Rohr 15 Min garen; mit Quinoa servieren.",
    tags: "omega-3,high-protein,mediterran"
  },
  {
    name: "Gegrilltes H\xFChnerfilet mit Feta-Spinat & Ofengem\xFCse",
    meal_type: "dinner",
    calories: 550,
    protein_g: 54,
    carbs_g: 28,
    fat_g: 22,
    fiber_g: 7,
    sugar_g: 5,
    prep_minutes: 22,
    ingredients: [
      "180g H\xFChnerbrustfilet",
      "160g Brokkoli",
      "60g Schafk\xE4se / Feta",
      "80g Babyspinat & Blattgem\xFCse",
      "60g Vollkorn-Sauerteigbrot"
    ],
    structured_ingredients: [
      { name: "H\xFChnerbrustfilet", amount: 180, unit: "g" },
      { name: "Brokkoli", amount: 160, unit: "g" },
      { name: "Schafk\xE4se / Feta", amount: 60, unit: "g" },
      { name: "Babyspinat & Blattgem\xFCse", amount: 80, unit: "g" },
      { name: "Vollkorn-Sauerteigbrot", amount: 60, unit: "g" }
    ],
    instructions: "H\xFChnerbrust braten, Brokkoli und Spinat schwenken, mit Feta \xFCberbacken und einer Scheibe Vollkornbrot servieren.",
    tags: "low-carb,high-protein,abends"
  },
  {
    name: "W\xE4rmender Linsen-Tofu-Eintopf mit Wurzelgem\xFCse",
    meal_type: "dinner",
    calories: 520,
    protein_g: 36,
    carbs_g: 54,
    fat_g: 14,
    fiber_g: 13,
    sugar_g: 5,
    prep_minutes: 25,
    ingredients: [
      "80g Rote Linsen",
      "120g Bio-Tofu Natur",
      "150g Brokkoli",
      "120g Strauchtomaten / Cherrytomaten",
      "60g Babyspinat & Blattgem\xFCse"
    ],
    structured_ingredients: [
      { name: "Rote Linsen", amount: 80, unit: "g" },
      { name: "Bio-Tofu Natur", amount: 120, unit: "g" },
      { name: "Brokkoli", amount: 150, unit: "g" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 120, unit: "g" },
      { name: "Babyspinat & Blattgem\xFCse", amount: 60, unit: "g" }
    ],
    instructions: "Linsen und Gem\xFCse schmoren, angebratene Tofuw\xFCrfel und frischen Spinat vor dem Servieren zugeben.",
    tags: "vegan,ballaststoffreich,zero-waste"
  },
  {
    name: "Skyr-Beeren-Proteinbecher & Edeln\xFCsse",
    meal_type: "snack",
    calories: 255,
    protein_g: 22,
    carbs_g: 15,
    fat_g: 11,
    fiber_g: 4,
    sugar_g: 9,
    prep_minutes: 2,
    ingredients: [
      "150g Skyr Natur",
      "60g Heidelbeeren / Beerenmix",
      "20g Waln\xFCsse & Mandeln Mix"
    ],
    structured_ingredients: [
      { name: "Skyr Natur", amount: 150, unit: "g" },
      { name: "Heidelbeeren / Beerenmix", amount: 60, unit: "g" },
      { name: "Waln\xFCsse & Mandeln Mix", amount: 20, unit: "g" }
    ],
    instructions: "Skyr glattr\xFChren und mit Beeren sowie N\xFCssen als Snack genie\xDFen.",
    tags: "snack,high-protein,zuckerarm"
  },
  {
    name: "Hummus-Gem\xFCse-Snack mit Vollkorn-Crostini",
    meal_type: "snack",
    calories: 240,
    protein_g: 9,
    carbs_g: 26,
    fat_g: 10,
    fiber_g: 6,
    sugar_g: 3,
    prep_minutes: 3,
    ingredients: [
      "50g Hummus Natur",
      "50g Vollkorn-Sauerteigbrot",
      "100g Strauchtomaten / Cherrytomaten"
    ],
    structured_ingredients: [
      { name: "Hummus Natur", amount: 50, unit: "g" },
      { name: "Vollkorn-Sauerteigbrot", amount: 50, unit: "g" },
      { name: "Strauchtomaten / Cherrytomaten", amount: 100, unit: "g" }
    ],
    instructions: "Vollkornbrot in Streifen schneiden und mit Hummus und Cherrytomaten dippen.",
    tags: "snack,vegan,ballaststoffe"
  }
];
var AUSTRIAN_BARCODE_PRESETS = {
  "9002100045123": STARTER_INGREDIENTS[1],
  // NÖM PRO Skyr
  "9002233001122": STARTER_INGREDIENTS[0],
  // Bio-Haferflocken
  "9004445556667": STARTER_INGREDIENTS[5],
  // Hühnerbrustfilet
  "9007778889990": STARTER_INGREDIENTS[7],
  // Lachsfilet
  "9009990001112": STARTER_INGREDIENTS[9],
  // Rote Linsen
  "9001234567890": STARTER_INGREDIENTS[10],
  // Bio-Tofu
  "9002515000019": {
    name: "Sch\xE4rdinger Bergbaron Leicht",
    barcode: "9002515000019",
    brand: "Sch\xE4rdinger",
    unit: "g",
    package_size: 200,
    available_amount: 0,
    calories_per_100: 265,
    protein_per_100: 31,
    carbs_per_100: 0.1,
    fat_per_100: 15,
    fiber_per_100: 0,
    sugar_per_100: 0.1,
    nutriscore: "B",
    price_billa: 2.79,
    pack_billa: 200,
    product_billa: "Sch\xE4rdinger Bergbaron Leicht 200g",
    price_hofer: 2.39,
    pack_hofer: 250,
    product_hofer: "Milfina Bergk\xE4se Leicht 250g",
    price_spar: 2.69,
    pack_spar: 200,
    product_spar: "Sch\xE4rdinger Bergbaron 200g"
  },
  "9001414002117": {
    name: "Darbo Naturrein Konfit\xFCre Marille Weniger Zucker",
    barcode: "9001414002117",
    brand: "Darbo",
    unit: "g",
    package_size: 250,
    available_amount: 0,
    calories_per_100: 162,
    protein_per_100: 0.6,
    carbs_per_100: 38,
    fat_per_100: 0.2,
    fiber_per_100: 1.8,
    sugar_per_100: 36,
    nutriscore: "C",
    price_billa: 3.19,
    pack_billa: 250,
    product_billa: "Darbo Fruchtreich Marille 250g",
    price_hofer: 2.49,
    pack_hofer: 300,
    product_hofer: "Grandessa Fruchtaufstrich Marille 300g",
    price_spar: 2.99,
    pack_spar: 250,
    product_spar: "Darbo Naturrein Marille 250g"
  },
  "9002859087127": {
    name: "Ja! Nat\xFCrlich Bio-Kichererbsen gekocht",
    barcode: "9002859087127",
    brand: "Ja! Nat\xFCrlich / Natur Aktiv",
    unit: "g",
    package_size: 240,
    available_amount: 0,
    calories_per_100: 128,
    protein_per_100: 7.2,
    carbs_per_100: 16.5,
    fat_per_100: 2.2,
    fiber_per_100: 5.9,
    sugar_per_100: 0.8,
    nutriscore: "A",
    price_billa: 1.39,
    pack_billa: 240,
    product_billa: "Ja! Nat\xFCrlich Bio-Kichererbsen 240g",
    price_hofer: 0.99,
    pack_hofer: 250,
    product_hofer: "Natur Aktiv Bio-Kichererbsen 250g",
    price_spar: 1.29,
    pack_spar: 240,
    product_spar: "SPAR Natur*pur Bio-Kichererbsen 240g"
  }
};
function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getMondayOfCurrentWeek(refDateStr) {
  const d = refDateStr ? /* @__PURE__ */ new Date(`${refDateStr}T12:00:00`) : /* @__PURE__ */ new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
function parseIngredientLine(line) {
  const cleaned = line.trim();
  const m = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|stk|stück|el|tl|scoop|scheiben|can)?\s+(.+)$/i);
  if (m) {
    let amount = parseFloat(m[1].replace(",", "."));
    const rawUnit = (m[2] || "g").toLowerCase();
    let unit = "g";
    if (rawUnit === "kg") {
      amount *= 1e3;
      unit = "g";
    } else if (rawUnit === "l") {
      amount *= 1e3;
      unit = "ml";
    } else if (rawUnit === "ml") {
      unit = "ml";
    } else if (rawUnit === "stk" || rawUnit === "st\xFCck") {
      unit = "Stk";
    } else if (rawUnit === "el" || rawUnit === "scoop") {
      amount *= 25;
      unit = "g";
    } else if (rawUnit === "tl") {
      amount *= 8;
      unit = "g";
    } else if (rawUnit === "scheiben") {
      amount *= 45;
      unit = "g";
    } else if (rawUnit === "can") {
      amount *= 250;
      unit = "g";
    }
    return {
      name: m[3].trim(),
      amount: Math.round(amount * 10) / 10,
      unit
    };
  }
  return {
    name: cleaned,
    amount: 100,
    unit: "g"
  };
}
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      carbs_g INTEGER NOT NULL DEFAULT 0,
      fat_g INTEGER NOT NULL DEFAULT 0,
      fiber_g INTEGER NOT NULL DEFAULT 0,
      sugar_g INTEGER NOT NULL DEFAULT 0,
      prep_minutes INTEGER NOT NULL DEFAULT 20,
      ingredients TEXT NOT NULL DEFAULT '[]',
      structured_ingredients TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'g',
      package_size REAL NOT NULL DEFAULT 100,
      available_amount REAL NOT NULL DEFAULT 0,
      calories_per_100 REAL NOT NULL DEFAULT 0,
      protein_per_100 REAL NOT NULL DEFAULT 0,
      carbs_per_100 REAL NOT NULL DEFAULT 0,
      fat_per_100 REAL NOT NULL DEFAULT 0,
      fiber_per_100 REAL NOT NULL DEFAULT 0,
      sugar_per_100 REAL NOT NULL DEFAULT 0,
      nutriscore TEXT NOT NULL DEFAULT 'A',
      price_billa REAL NOT NULL DEFAULT 1.99,
      pack_billa REAL NOT NULL DEFAULT 250,
      product_billa TEXT NOT NULL DEFAULT '',
      price_hofer REAL NOT NULL DEFAULT 1.59,
      pack_hofer REAL NOT NULL DEFAULT 250,
      product_hofer TEXT NOT NULL DEFAULT '',
      price_spar REAL NOT NULL DEFAULT 1.89,
      pack_spar REAL NOT NULL DEFAULT 250,
      product_spar TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meal_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      slot TEXT NOT NULL,
      recipe_id INTEGER,
      custom_title TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      carbs_g INTEGER NOT NULL DEFAULT 0,
      fat_g INTEGER NOT NULL DEFAULT 0,
      fiber_g INTEGER NOT NULL DEFAULT 0,
      sugar_g INTEGER NOT NULL DEFAULT 0,
      guest_portions INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      custom_ingredients TEXT NOT NULL DEFAULT '[]',
      UNIQUE(plan_date, slot)
    );

    CREATE TABLE IF NOT EXISTS water_log (
      plan_date TEXT PRIMARY KEY,
      amount_ml INTEGER NOT NULL DEFAULT 0,
      target_ml INTEGER NOT NULL DEFAULT 2800,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grocery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      checked INTEGER NOT NULL DEFAULT 0,
      source_recipe TEXT NOT NULL DEFAULT ''
    );
  `);
  const safeAlterStatements = [
    `ALTER TABLE recipes ADD COLUMN carbs_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN fat_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN fiber_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN sugar_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN structured_ingredients TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE meal_plan ADD COLUMN carbs_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN fat_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN fiber_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN sugar_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN guest_portions INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN selected INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE meal_plan ADD COLUMN custom_ingredients TEXT NOT NULL DEFAULT '[]'`
  ];
  for (const stmt of safeAlterStatements) {
    try {
      ctx.db.exec(stmt);
    } catch {
    }
  }
  const isV2Seeded = ctx.db.kvGet("meal_planner_v2_seeded", false);
  const existingIngredientCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM ingredients")?.cnt ?? 0;
  if (!isV2Seeded || existingIngredientCount === 0) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existingIngredientCount === 0) {
      for (const item of STARTER_INGREDIENTS) {
        ctx.db.execute(
          `INSERT INTO ingredients (
            name, barcode, brand, unit, package_size, available_amount,
            calories_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100, sugar_per_100, nutriscore,
            price_billa, pack_billa, product_billa,
            price_hofer, pack_hofer, product_hofer,
            price_spar, pack_spar, product_spar, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.name,
            item.barcode,
            item.brand,
            item.unit,
            item.package_size,
            item.available_amount,
            item.calories_per_100,
            item.protein_per_100,
            item.carbs_per_100,
            item.fat_per_100,
            item.fiber_per_100,
            item.sugar_per_100,
            item.nutriscore,
            item.price_billa,
            item.pack_billa,
            item.product_billa,
            item.price_hofer,
            item.pack_hofer,
            item.product_hofer,
            item.price_spar,
            item.pack_spar,
            item.product_spar,
            now
          ]
        );
      }
    }
    const existingRecipeCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM recipes")?.cnt ?? 0;
    if (existingRecipeCount === 0) {
      for (const r of STARTER_RECIPES) {
        ctx.db.execute(
          `INSERT INTO recipes (
            name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
            prep_minutes, ingredients, structured_ingredients, instructions, tags, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.name,
            r.meal_type,
            r.calories,
            r.protein_g,
            r.carbs_g,
            r.fat_g,
            r.fiber_g,
            r.sugar_g,
            r.prep_minutes,
            JSON.stringify(r.ingredients),
            JSON.stringify(r.structured_ingredients),
            r.instructions,
            r.tags,
            now
          ]
        );
      }
    }
    const existingPlanCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM meal_plan")?.cnt ?? 0;
    if (existingPlanCount === 0) {
      const monday = getMondayOfCurrentWeek();
      const allRecipes = ctx.db.query("SELECT * FROM recipes");
      const bySlot = (slot) => allRecipes.filter((r) => r.meal_type === slot);
      const bList = bySlot("breakfast");
      const lList = bySlot("lunch");
      const dList = bySlot("dinner");
      const sList = bySlot("snack");
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = formatDateYMD(d);
        const picks = [
          { slot: "breakfast", recipe: bList[i % Math.max(1, bList.length)], guests: 0, selected: i < 5 ? 1 : 0 },
          { slot: "lunch", recipe: lList[i % Math.max(1, lList.length)], guests: i === 2 ? 1 : 0, selected: i < 5 ? 1 : 0 },
          { slot: "dinner", recipe: dList[i % Math.max(1, dList.length)], guests: i === 5 ? 2 : 0, selected: i < 5 ? 1 : 0 },
          { slot: "snack", recipe: sList[i % Math.max(1, sList.length)], guests: 0, selected: i < 3 ? 1 : 0 }
        ];
        for (const p of picks) {
          if (!p.recipe) continue;
          ctx.db.execute(
            `INSERT OR IGNORE INTO meal_plan (
              plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
              guest_portions, selected, completed, custom_ingredients
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
              dateStr,
              p.slot,
              p.recipe.id,
              p.recipe.name,
              p.recipe.calories,
              p.recipe.protein_g,
              p.recipe.carbs_g,
              p.recipe.fat_g,
              p.recipe.fiber_g,
              p.recipe.sugar_g,
              p.guests,
              p.selected,
              p.recipe.structured_ingredients || "[]"
            ]
          );
        }
        ctx.db.execute(
          `INSERT OR IGNORE INTO water_log (plan_date, amount_ml, target_ml, updated_at) VALUES (?, ?, ?, ?)`,
          [dateStr, i <= 2 ? 2250 : 1750, 2800, now]
        );
      }
    }
    ctx.db.kvSet("meal_planner_v2_seeded", true);
  }
  function getUserProfile() {
    const saved = ctx.db.kvGet("user_profile");
    return computeProfileTargets(saved || DEFAULT_USER_PROFILE);
  }
  function getOptimizationOptions() {
    return {
      ...DEFAULT_OPTIMIZATION_OPTIONS,
      ...ctx.db.kvGet("optimization_options") || {}
    };
  }
  function parseRecipeRow(row) {
    let ingredients = [];
    try {
      ingredients = JSON.parse(row.ingredients || "[]");
    } catch {
      ingredients = [];
    }
    let structured = [];
    try {
      structured = JSON.parse(row.structured_ingredients || "[]");
    } catch {
      structured = [];
    }
    if (structured.length === 0 && ingredients.length > 0) {
      structured = ingredients.map(parseIngredientLine);
    }
    return {
      ...row,
      carbs_g: row.carbs_g || Math.round((row.calories - row.protein_g * 4) * 0.55 / 4),
      fat_g: row.fat_g || Math.round((row.calories - row.protein_g * 4) * 0.45 / 9),
      fiber_g: row.fiber_g || 6,
      sugar_g: row.sugar_g || 5,
      ingredients,
      structured_ingredients: structured
    };
  }
  function findCatalogMatch(ingName, catalog) {
    const norm = ingName.toLowerCase().trim();
    return catalog.find((c) => c.name.toLowerCase() === norm) || catalog.find((c) => norm.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(norm)) || catalog.find((c) => {
      const words = norm.split(/\s+/).filter((w) => w.length >= 4);
      return words.some((w) => c.name.toLowerCase().includes(w));
    });
  }
  function computeSupermarketOptimization(mealIds, customOpts) {
    const opts = { ...getOptimizationOptions(), ...customOpts || {} };
    const catalog = ctx.db.query("SELECT * FROM ingredients ORDER BY name ASC");
    const allRecipes = ctx.db.query("SELECT * FROM recipes").map(parseRecipeRow);
    const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
    let selectedMeals = [];
    if (Array.isArray(mealIds) && mealIds.length > 0) {
      const placeholders = mealIds.map(() => "?").join(",");
      selectedMeals = ctx.db.query(
        `SELECT * FROM meal_plan WHERE id IN (${placeholders}) ORDER BY plan_date ASC`,
        mealIds
      );
    } else {
      selectedMeals = ctx.db.query(
        "SELECT * FROM meal_plan WHERE selected = 1 ORDER BY plan_date ASC"
      );
    }
    const accumulatedMap = /* @__PURE__ */ new Map();
    let totalPortions = 0;
    for (const meal of selectedMeals) {
      const portions = 1 + Math.max(0, Number(meal.guest_portions || 0));
      totalPortions += portions;
      let ingList = [];
      const recipe = meal.recipe_id ? recipeMap.get(meal.recipe_id) : void 0;
      if (recipe && recipe.structured_ingredients.length > 0) {
        ingList = recipe.structured_ingredients;
      } else if (meal.custom_ingredients) {
        try {
          const parsed = JSON.parse(meal.custom_ingredients);
          if (Array.isArray(parsed) && parsed.length > 0) {
            ingList = parsed.map((x) => typeof x === "string" ? parseIngredientLine(x) : x);
          }
        } catch {
        }
      }
      for (const ing of ingList) {
        const matchedCatalog = findCatalogMatch(ing.name, catalog);
        const canonicalName = matchedCatalog ? matchedCatalog.name : ing.name.trim();
        const key = canonicalName.toLowerCase();
        const scaledAmount = Math.round(Number(ing.amount || 100) * portions * 10) / 10;
        const existing = accumulatedMap.get(key);
        const mealLabel = `${meal.plan_date.slice(5)} ${meal.custom_title}${portions > 1 ? ` (${portions}x)` : ""}`;
        if (existing) {
          existing.grossRequired = Math.round((existing.grossRequired + scaledAmount) * 10) / 10;
          existing.mealOccurrences += 1;
          if (!existing.usedInMeals.includes(mealLabel)) {
            existing.usedInMeals.push(mealLabel);
          }
        } else {
          accumulatedMap.set(key, {
            canonicalName,
            unit: matchedCatalog?.unit || ing.unit || "g",
            grossRequired: scaledAmount,
            mealOccurrences: 1,
            usedInMeals: [mealLabel],
            catalogItem: matchedCatalog
          });
        }
      }
    }
    const cumulativeIngredients = Array.from(accumulatedMap.values()).map((acc) => {
      const cat = acc.catalogItem;
      const availableInPantry = opts.use_pantry_stock && cat ? Math.max(0, Number(cat.available_amount || 0)) : 0;
      const pantryUsed = Math.min(acc.grossRequired, availableInPantry);
      const netToBuy = Math.max(0, Math.round((acc.grossRequired - pantryUsed) * 10) / 10);
      const defaultPack = acc.unit === "Stk" ? 6 : 250;
      const storeConfigs = [
        {
          store: "billa",
          storeLabel: "BILLA",
          productName: cat?.product_billa || `BILLA ${acc.canonicalName} ${defaultPack}${acc.unit}`,
          packSize: Number(cat?.pack_billa || defaultPack),
          unitPrice: Number(cat?.price_billa || 2.29)
        },
        {
          store: "hofer",
          storeLabel: "HOFER",
          productName: cat?.product_hofer || `HOFER ${acc.canonicalName} ${defaultPack}${acc.unit}`,
          packSize: Number(cat?.pack_hofer || defaultPack),
          unitPrice: Number(cat?.price_hofer || 1.79)
        },
        {
          store: "spar",
          storeLabel: "SPAR",
          productName: cat?.product_spar || `SPAR Natur*pur ${acc.canonicalName} ${defaultPack}${acc.unit}`,
          packSize: Number(cat?.pack_spar || defaultPack),
          unitPrice: Number(cat?.price_spar || 1.99)
        }
      ];
      const storeOffers = {};
      for (const sc of storeConfigs) {
        const packsNeeded = netToBuy <= 0 ? 0 : Math.ceil(netToBuy / sc.packSize);
        const unoptimizedPacks = netToBuy <= 0 ? 0 : Math.max(packsNeeded, acc.mealOccurrences);
        const purchasedAmount = packsNeeded * sc.packSize;
        const surplusAmount = Math.max(0, Math.round((purchasedAmount - netToBuy) * 10) / 10);
        const totalPrice = Math.round(packsNeeded * sc.unitPrice * 100) / 100;
        const wasteRatio = purchasedAmount > 0 ? surplusAmount / purchasedAmount : 0;
        storeOffers[sc.store] = {
          store: sc.store,
          storeLabel: sc.storeLabel,
          productName: sc.productName,
          packSize: sc.packSize,
          unitPrice: sc.unitPrice,
          packsNeeded,
          purchasedAmount,
          totalPrice,
          surplusAmount,
          wasteRatio,
          singleMealPacksWithoutAccumulation: unoptimizedPacks
        };
      }
      const allowedStores = opts.preferred_stores && opts.preferred_stores.length > 0 ? opts.preferred_stores : ["billa", "hofer", "spar"];
      const candidates = allowedStores.map((s) => storeOffers[s]);
      candidates.sort((a, b) => {
        if (opts.mode === "waste_min") {
          if (a.surplusAmount !== b.surplusAmount) return a.surplusAmount - b.surplusAmount;
          return a.totalPrice - b.totalPrice;
        }
        if (opts.mode === "price_min") {
          if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
          return a.surplusAmount - b.surplusAmount;
        }
        const scoreA = a.totalPrice * 1.2 + a.surplusAmount * 6e-3;
        const scoreB = b.totalPrice * 1.2 + b.surplusAmount * 6e-3;
        return scoreA - scoreB;
      });
      const bestOffer = candidates[0] || storeOffers.hofer;
      const unoptimizedSurplus = Math.max(
        0,
        bestOffer.singleMealPacksWithoutAccumulation * bestOffer.packSize - netToBuy
      );
      const wasteSavedByAccumulation = Math.max(0, Math.round(unoptimizedSurplus - bestOffer.surplusAmount));
      return {
        ingredientId: cat?.id ?? null,
        name: acc.canonicalName,
        unit: acc.unit,
        mealOccurrences: acc.mealOccurrences,
        usedInMeals: acc.usedInMeals,
        grossRequired: acc.grossRequired,
        availableInPantry,
        pantryUsed,
        netToBuy,
        offers: storeOffers,
        recommendedStore: bestOffer.store,
        recommendedOffer: bestOffer,
        wasteSavedByAccumulation
      };
    });
    const summarizeStore = (store) => {
      let totalPrice = 0;
      let totalPurchased = 0;
      let totalSurplus = 0;
      let totalPacks = 0;
      for (const item of cumulativeIngredients) {
        const off = item.offers[store];
        totalPrice += off.totalPrice;
        totalPurchased += off.purchasedAmount;
        totalSurplus += off.surplusAmount;
        totalPacks += off.packsNeeded;
      }
      const efficiencyPct = totalPurchased > 0 ? Math.round((totalPurchased - totalSurplus) / totalPurchased * 100) : 100;
      return {
        store,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalPurchased: Math.round(totalPurchased),
        totalSurplus: Math.round(totalSurplus),
        totalPacks,
        efficiencyPct
      };
    };
    const billaSummary = summarizeStore("billa");
    const hoferSummary = summarizeStore("hofer");
    const sparSummary = summarizeStore("spar");
    let mixPrice = 0;
    let mixPurchased = 0;
    let mixSurplus = 0;
    let mixPacks = 0;
    let totalWasteSaved = 0;
    let totalPantryUsed = 0;
    for (const item of cumulativeIngredients) {
      const off = item.recommendedOffer;
      mixPrice += off.totalPrice;
      mixPurchased += off.purchasedAmount;
      mixSurplus += off.surplusAmount;
      mixPacks += off.packsNeeded;
      totalWasteSaved += item.wasteSavedByAccumulation;
      totalPantryUsed += item.pantryUsed;
    }
    const singleStores = [billaSummary, hoferSummary, sparSummary].filter(
      (s) => opts.preferred_stores.includes(s.store)
    );
    const bestSingleStore = (singleStores.length > 0 ? singleStores : [billaSummary, hoferSummary, sparSummary]).sort(
      (a, b) => opts.mode === "waste_min" ? a.totalSurplus - b.totalSurplus : a.totalPrice - b.totalPrice
    )[0] || hoferSummary;
    const multiUseIngredientsCount = cumulativeIngredients.filter((i) => i.mealOccurrences > 1).length;
    return {
      queriedAt: (/* @__PURE__ */ new Date()).toISOString(),
      optimizationMode: opts.mode,
      selectedMealsCount: selectedMeals.length,
      totalPortions,
      uniqueIngredientsCount: cumulativeIngredients.length,
      multiUseIngredientsCount,
      totalPantryUsed: Math.round(totalPantryUsed),
      totalWasteSavedByAccumulation: Math.round(totalWasteSaved),
      stores: {
        billa: billaSummary,
        hofer: hoferSummary,
        spar: sparSummary
      },
      optimalMix: {
        totalPrice: Math.round(mixPrice * 100) / 100,
        totalPurchased: Math.round(mixPurchased),
        totalSurplus: Math.round(mixSurplus),
        totalPacks: mixPacks,
        efficiencyPct: mixPurchased > 0 ? Math.round((mixPurchased - mixSurplus) / mixPurchased * 100) : 100,
        bestSingleStore: bestSingleStore.store
      },
      cumulativeIngredients
    };
  }
  async function syncTodayToHomeAssistantAndSharedDb() {
    const today = formatDateYMD(/* @__PURE__ */ new Date());
    const todaysMeals = ctx.db.query(
      "SELECT * FROM meal_plan WHERE plan_date = ? ORDER BY slot ASC",
      [today]
    );
    const dinner = todaysMeals.find((m) => m.slot === "dinner");
    const lunch = todaysMeals.find((m) => m.slot === "lunch");
    const breakfast = todaysMeals.find((m) => m.slot === "breakfast");
    const totalCalories = todaysMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalProtein = todaysMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const openGroceries = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM grocery_items WHERE checked = 0")?.cnt ?? 0;
    ctx.sharedDb.kvSet("meal_planner_today", {
      date: today,
      breakfast: breakfast?.custom_title || null,
      lunch: lunch?.custom_title || null,
      dinner: dinner?.custom_title || null,
      totalCalories,
      totalProtein,
      openGroceries,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor("todays_dinner", dinner?.custom_title || "Unplanned", {
        friendly_name: "Today's Planned Dinner",
        icon: "mdi:silverware-fork-knife",
        date: today,
        breakfast: breakfast?.custom_title || "Unplanned",
        lunch: lunch?.custom_title || "Unplanned",
        dinner_calories: dinner?.calories ?? 0,
        dinner_protein_g: dinner?.protein_g ?? 0,
        daily_calories_total: totalCalories,
        daily_protein_total_g: totalProtein
      });
      await ctx.ha.publishSensor("todays_calories", totalCalories, {
        friendly_name: "Today's Planned Calories",
        unit_of_measurement: "kcal",
        icon: "mdi:fire",
        protein_g: totalProtein
      });
      await ctx.ha.publishSensor("open_groceries", openGroceries, {
        friendly_name: "Open Grocery Items",
        unit_of_measurement: "items",
        icon: "mdi:cart-outline"
      });
    }
    return {
      today,
      dinner: dinner?.custom_title || "Unplanned",
      totalCalories,
      totalProtein,
      openGroceries,
      haConnected: haStatus.connected
    };
  }
  ctx.route("GET", "/profile", () => {
    return {
      profile: getUserProfile(),
      optimization: getOptimizationOptions()
    };
  });
  ctx.route("POST", "/profile", (req) => {
    const body = req.body || {};
    const updated = computeProfileTargets({ ...getUserProfile(), ...body });
    ctx.db.kvSet("user_profile", updated);
    return { profile: updated };
  });
  ctx.route("POST", "/optimization-options", (req) => {
    const body = req.body || {};
    const updated = { ...getOptimizationOptions(), ...body };
    ctx.db.kvSet("optimization_options", updated);
    const supermarket = computeSupermarketOptimization(void 0, updated);
    return { optimization: updated, supermarket };
  });
  ctx.route("GET", "/ingredients", (_req, { db }) => {
    const ingredients = db.query("SELECT * FROM ingredients ORDER BY name ASC");
    return { ingredients };
  });
  ctx.route("POST", "/ingredients", (req, { db }) => {
    const body = req.body || {};
    if (!body.name?.trim()) {
      return { status: 400, body: { error: "Zutatenname ist erforderlich" } };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const packSize = Number(body.package_size || 250);
    const basePrice = Number(body.price_billa || 1.99);
    if (body.id) {
      db.execute(
        `UPDATE ingredients SET
          name = ?, barcode = ?, brand = ?, unit = ?, package_size = ?, available_amount = ?,
          calories_per_100 = ?, protein_per_100 = ?, carbs_per_100 = ?, fat_per_100 = ?, fiber_per_100 = ?, sugar_per_100 = ?,
          nutriscore = ?, price_billa = ?, pack_billa = ?, product_billa = ?,
          price_hofer = ?, pack_hofer = ?, product_hofer = ?,
          price_spar = ?, pack_spar = ?, product_spar = ?
         WHERE id = ?`,
        [
          body.name.trim(),
          (body.barcode || "").trim(),
          (body.brand || "").trim(),
          body.unit || "g",
          packSize,
          Number(body.available_amount ?? 0),
          Number(body.calories_per_100 ?? 0),
          Number(body.protein_per_100 ?? 0),
          Number(body.carbs_per_100 ?? 0),
          Number(body.fat_per_100 ?? 0),
          Number(body.fiber_per_100 ?? 0),
          Number(body.sugar_per_100 ?? 0),
          (body.nutriscore || "A").toUpperCase(),
          Number(body.price_billa ?? basePrice),
          Number(body.pack_billa ?? packSize),
          body.product_billa || `BILLA ${body.name.trim()} ${packSize}${body.unit || "g"}`,
          Number(body.price_hofer ?? Math.round(basePrice * 0.85 * 100) / 100),
          Number(body.pack_hofer ?? packSize),
          body.product_hofer || `HOFER ${body.name.trim()} ${packSize}${body.unit || "g"}`,
          Number(body.price_spar ?? Math.round(basePrice * 0.94 * 100) / 100),
          Number(body.pack_spar ?? packSize),
          body.product_spar || `SPAR ${body.name.trim()} ${packSize}${body.unit || "g"}`,
          Number(body.id)
        ]
      );
      return { updated: body.id };
    }
    const res = db.execute(
      `INSERT INTO ingredients (
        name, barcode, brand, unit, package_size, available_amount,
        calories_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100, sugar_per_100, nutriscore,
        price_billa, pack_billa, product_billa,
        price_hofer, pack_hofer, product_hofer,
        price_spar, pack_spar, product_spar, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        (body.barcode || "").trim(),
        (body.brand || "").trim(),
        body.unit || "g",
        packSize,
        Number(body.available_amount ?? 0),
        Number(body.calories_per_100 ?? 0),
        Number(body.protein_per_100 ?? 0),
        Number(body.carbs_per_100 ?? 0),
        Number(body.fat_per_100 ?? 0),
        Number(body.fiber_per_100 ?? 0),
        Number(body.sugar_per_100 ?? 0),
        (body.nutriscore || "A").toUpperCase(),
        Number(body.price_billa ?? basePrice),
        Number(body.pack_billa ?? packSize),
        body.product_billa || `BILLA ${body.name.trim()} ${packSize}${body.unit || "g"}`,
        Number(body.price_hofer ?? Math.round(basePrice * 0.85 * 100) / 100),
        Number(body.pack_hofer ?? packSize),
        body.product_hofer || `HOFER ${body.name.trim()} ${packSize}${body.unit || "g"}`,
        Number(body.price_spar ?? Math.round(basePrice * 0.94 * 100) / 100),
        Number(body.pack_spar ?? packSize),
        body.product_spar || `SPAR ${body.name.trim()} ${packSize}${body.unit || "g"}`,
        now
      ]
    );
    return { id: res.lastInsertRowid };
  });
  ctx.route("POST", "/ingredients/stock", (req, { db }) => {
    const body = req.body || {};
    if (!body.id) return { status: 400, body: { error: "id required" } };
    db.execute("UPDATE ingredients SET available_amount = ? WHERE id = ?", [
      Math.max(0, Number(body.available_amount || 0)),
      Number(body.id)
    ]);
    return { updated: true, supermarket: computeSupermarketOptimization() };
  });
  ctx.route("GET", "/barcode", async (req, { db }) => {
    const code = (req.query.code || "").trim();
    if (!code) {
      return { status: 400, body: { error: "Barcode (EAN) ist erforderlich" } };
    }
    const localMatch = db.queryOne("SELECT * FROM ingredients WHERE barcode = ?", [code]);
    if (localMatch) {
      return {
        source: "local_catalog",
        found: true,
        product: localMatch
      };
    }
    if (AUSTRIAN_BARCODE_PRESETS[code]) {
      return {
        source: "austrian_supermarket_api",
        found: true,
        product: AUSTRIAN_BARCODE_PRESETS[code]
      };
    }
    const actionReg = ctx.actions || new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
    const offRes = await actionReg.execute("food.openfoodfacts.barcode", { barcode: code });
    if (offRes.status === "success" && offRes.data) {
      const p = offRes.data;
      const qtyMatch = (p.quantity || "250g").match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)/i);
      let packSize = 250;
      let unit = "g";
      if (qtyMatch) {
        packSize = parseFloat(qtyMatch[1].replace(",", "."));
        const u = qtyMatch[2].toLowerCase();
        if (u === "kg") packSize *= 1e3;
        if (u === "l") {
          packSize *= 1e3;
          unit = "ml";
        } else if (u === "ml") {
          unit = "ml";
        }
      }
      return {
        source: "openfoodfacts_live_api",
        found: true,
        product: {
          name: p.name,
          barcode: code,
          brand: p.brand || "Markenprodukt",
          unit,
          package_size: packSize,
          available_amount: packSize,
          calories_per_100: p.calories_per_100g,
          protein_per_100: p.protein_per_100g,
          carbs_per_100: p.carbs_per_100g,
          fat_per_100: p.fat_per_100g,
          fiber_per_100: p.fiber_per_100g,
          sugar_per_100: p.sugar_per_100g,
          nutriscore: "B",
          price_billa: 0,
          pack_billa: packSize,
          product_billa: `BILLA ${p.brand} ${p.name} ${packSize}${unit}`,
          price_hofer: 0,
          pack_hofer: packSize,
          product_hofer: `HOFER ${p.name} ${packSize}${unit}`,
          price_spar: 0,
          pack_spar: packSize,
          product_spar: `SPAR ${p.brand} ${p.name} ${packSize}${unit}`
        }
      };
    }
    return {
      status: 404,
      body: {
        found: false,
        error: offRes.summary || `Barcode ${code} wurde in der Datenbank und OpenFoodFacts nicht gefunden.`
      }
    };
  });
  ctx.route("GET", "/recipes", (_req, { db }) => {
    const rows = db.query("SELECT * FROM recipes ORDER BY name ASC");
    return { recipes: rows.map(parseRecipeRow) };
  });
  ctx.route("POST", "/recipes", (req, { db }) => {
    const body = req.body || {};
    if (!body.name?.trim()) {
      return { status: 400, body: { error: "Rezeptname ist erforderlich" } };
    }
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : (body.ingredientsText || "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
    const structured = Array.isArray(body.structured_ingredients) && body.structured_ingredients.length > 0 ? body.structured_ingredients : ingredients.map(parseIngredientLine);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const res = db.execute(
      `INSERT INTO recipes (
        name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        prep_minutes, ingredients, structured_ingredients, instructions, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        body.meal_type || "dinner",
        Number(body.calories || 500),
        Number(body.protein_g || 30),
        Number(body.carbs_g || 50),
        Number(body.fat_g || 18),
        Number(body.fiber_g || 8),
        Number(body.sugar_g || 5),
        Number(body.prep_minutes || 20),
        JSON.stringify(ingredients),
        JSON.stringify(structured),
        (body.instructions || "").trim(),
        (body.tags || "").trim(),
        now
      ]
    );
    return { id: res.lastInsertRowid };
  });
  ctx.route("DELETE", "/recipes", (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM recipes WHERE id = ?", [id]);
    return { deleted: id };
  });
  ctx.route("GET", "/week", (req, { db }) => {
    const monday = getMondayOfCurrentWeek(req.query.start);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(formatDateYMD(d));
    }
    const startDay = days[0];
    const endDay = days[6];
    const entries = db.query(
      "SELECT * FROM meal_plan WHERE plan_date >= ? AND plan_date <= ? ORDER BY plan_date ASC",
      [startDay, endDay]
    );
    const waterLogs = db.query(
      "SELECT * FROM water_log WHERE plan_date >= ? AND plan_date <= ? ORDER BY plan_date ASC",
      [startDay, endDay]
    );
    const profile = getUserProfile();
    const optimization = getOptimizationOptions();
    const selectedIdsInWeek = entries.filter((e) => e.selected === 1).map((e) => e.id);
    const supermarket = computeSupermarketOptimization(selectedIdsInWeek, optimization);
    return {
      weekStart: startDay,
      weekEnd: endDay,
      days,
      entries,
      waterLogs,
      profile,
      optimization,
      supermarket
    };
  });
  ctx.route("POST", "/plan", async (req, { db }) => {
    const body = req.body || {};
    if (!body.plan_date || !body.slot) {
      return { status: 400, body: { error: "plan_date und slot sind erforderlich" } };
    }
    let title = (body.custom_title || "").trim();
    let calories = Number(body.calories || 0);
    let protein = Number(body.protein_g || 0);
    let carbs = Number(body.carbs_g || 0);
    let fat = Number(body.fat_g || 0);
    let fiber = Number(body.fiber_g || 6);
    let sugar = Number(body.sugar_g || 5);
    let customIngredients = "[]";
    const recipeId = body.recipe_id ? Number(body.recipe_id) : null;
    if (recipeId) {
      const r = db.queryOne("SELECT * FROM recipes WHERE id = ?", [recipeId]);
      if (r) {
        const parsed = parseRecipeRow(r);
        title = title || parsed.name;
        calories = body.calories !== void 0 ? Number(body.calories) : parsed.calories;
        protein = body.protein_g !== void 0 ? Number(body.protein_g) : parsed.protein_g;
        carbs = body.carbs_g !== void 0 ? Number(body.carbs_g) : parsed.carbs_g;
        fat = body.fat_g !== void 0 ? Number(body.fat_g) : parsed.fat_g;
        fiber = body.fiber_g !== void 0 ? Number(body.fiber_g) : parsed.fiber_g;
        sugar = body.sugar_g !== void 0 ? Number(body.sugar_g) : parsed.sugar_g;
        customIngredients = JSON.stringify(parsed.structured_ingredients);
      }
    }
    if (!title) {
      return { status: 400, body: { error: "Titel oder Rezept-ID erforderlich" } };
    }
    const guestPortions = Math.max(0, Number(body.guest_portions ?? 0));
    const selected = body.selected !== void 0 ? Number(body.selected) : 1;
    db.execute(
      `INSERT INTO meal_plan (
        plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        guest_portions, selected, completed, custom_ingredients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(plan_date, slot) DO UPDATE SET
        recipe_id = excluded.recipe_id,
        custom_title = excluded.custom_title,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        fiber_g = excluded.fiber_g,
        sugar_g = excluded.sugar_g,
        guest_portions = excluded.guest_portions,
        selected = excluded.selected,
        custom_ingredients = excluded.custom_ingredients`,
      [
        body.plan_date,
        body.slot,
        recipeId,
        title,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        guestPortions,
        selected,
        customIngredients
      ]
    );
    const syncSummary = await syncTodayToHomeAssistantAndSharedDb();
    return { saved: true, syncSummary };
  });
  ctx.route("POST", "/plan/randomize", async (req, { db }) => {
    const body = req.body || {};
    if (!body.plan_date || !body.slot) {
      return { status: 400, body: { error: "plan_date und slot erforderlich" } };
    }
    const allRecipes = db.query("SELECT * FROM recipes").map(parseRecipeRow);
    let pool = allRecipes.filter((r) => r.meal_type === body.slot);
    if (pool.length === 0) pool = allRecipes;
    if (pool.length > 1 && body.current_recipe_id) {
      pool = pool.filter((r) => r.id !== Number(body.current_recipe_id));
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen) {
      return { status: 404, body: { error: "Keine Rezepte im Rezeptbuch gefunden" } };
    }
    db.execute(
      `INSERT INTO meal_plan (
        plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        guest_portions, selected, completed, custom_ingredients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)
      ON CONFLICT(plan_date, slot) DO UPDATE SET
        recipe_id = excluded.recipe_id,
        custom_title = excluded.custom_title,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        fiber_g = excluded.fiber_g,
        sugar_g = excluded.sugar_g,
        custom_ingredients = excluded.custom_ingredients`,
      [
        body.plan_date,
        body.slot,
        chosen.id,
        chosen.name,
        chosen.calories,
        chosen.protein_g,
        chosen.carbs_g,
        chosen.fat_g,
        chosen.fiber_g,
        chosen.sugar_g,
        JSON.stringify(chosen.structured_ingredients)
      ]
    );
    await syncTodayToHomeAssistantAndSharedDb();
    return { chosen };
  });
  ctx.route("POST", "/plan/guests", (req, { db }) => {
    const body = req.body || {};
    if (!body.id) return { status: 400, body: { error: "id required" } };
    const guests = Math.max(0, Math.min(12, Number(body.guest_portions || 0)));
    db.execute("UPDATE meal_plan SET guest_portions = ? WHERE id = ?", [guests, Number(body.id)]);
    return { id: body.id, guest_portions: guests };
  });
  ctx.route("POST", "/plan/select", (req, { db }) => {
    const body = req.body || {};
    if (typeof body.id === "number") {
      if (typeof body.selected === "boolean") {
        db.execute("UPDATE meal_plan SET selected = ? WHERE id = ?", [body.selected ? 1 : 0, body.id]);
      } else {
        db.execute("UPDATE meal_plan SET selected = CASE WHEN selected = 1 THEN 0 ELSE 1 END WHERE id = ?", [
          body.id
        ]);
      }
    } else if (Array.isArray(body.ids)) {
      const val = body.selected ? 1 : 0;
      for (const id of body.ids) {
        db.execute("UPDATE meal_plan SET selected = ? WHERE id = ?", [val, Number(id)]);
      }
    } else if (body.weekStart && body.weekEnd && typeof body.selected === "boolean") {
      db.execute("UPDATE meal_plan SET selected = ? WHERE plan_date >= ? AND plan_date <= ?", [
        body.selected ? 1 : 0,
        body.weekStart,
        body.weekEnd
      ]);
    }
    return { updated: true };
  });
  ctx.route("POST", "/supermarket-query", (req) => {
    const body = req.body || {};
    return computeSupermarketOptimization(body.mealIds, body.options);
  });
  ctx.route("POST", "/optimize-week", async (req, { db }) => {
    const body = req.body || {};
    const monday = getMondayOfCurrentWeek(body.weekStart);
    const allRecipes = db.query("SELECT * FROM recipes").map(parseRecipeRow);
    const opts = getOptimizationOptions();
    const bySlot = (slot) => allRecipes.filter((r) => r.meal_type === slot);
    const bPool = bySlot("breakfast");
    const lPool = bySlot("lunch");
    const dPool = bySlot("dinner");
    const sPool = bySlot("snack");
    const stride = opts.mode === "ingredient_min" || opts.mode === "waste_min" ? 2 : 3;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDateYMD(d);
      const slots = [
        { slot: "breakfast", pool: bPool },
        { slot: "lunch", pool: lPool },
        { slot: "dinner", pool: dPool },
        { slot: "snack", pool: sPool }
      ];
      for (const { slot, pool } of slots) {
        if (pool.length === 0) continue;
        const chosen = pool[i % Math.min(stride, pool.length) % pool.length];
        db.execute(
          `INSERT INTO meal_plan (
            plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
            guest_portions, selected, completed, custom_ingredients
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)
          ON CONFLICT(plan_date, slot) DO UPDATE SET
            recipe_id = excluded.recipe_id,
            custom_title = excluded.custom_title,
            calories = excluded.calories,
            protein_g = excluded.protein_g,
            carbs_g = excluded.carbs_g,
            fat_g = excluded.fat_g,
            fiber_g = excluded.fiber_g,
            sugar_g = excluded.sugar_g,
            selected = 1,
            custom_ingredients = excluded.custom_ingredients`,
          [
            dateStr,
            slot,
            chosen.id,
            chosen.name,
            chosen.calories,
            chosen.protein_g,
            chosen.carbs_g,
            chosen.fat_g,
            chosen.fiber_g,
            chosen.sugar_g,
            JSON.stringify(chosen.structured_ingredients)
          ]
        );
      }
    }
    await syncTodayToHomeAssistantAndSharedDb();
    return { optimized: true, mode: opts.mode };
  });
  ctx.route("POST", "/water", (req, { db }) => {
    const body = req.body || {};
    if (!body.plan_date) {
      return { status: 400, body: { error: "plan_date required" } };
    }
    const profile = getUserProfile();
    const existing = db.queryOne("SELECT * FROM water_log WHERE plan_date = ?", [body.plan_date]);
    const current = existing ? existing.amount_ml : 0;
    const nextAmount = body.amount_ml !== void 0 ? Math.max(0, Number(body.amount_ml)) : Math.max(0, current + Number(body.delta_ml || 250));
    db.execute(
      `INSERT INTO water_log (plan_date, amount_ml, target_ml, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(plan_date) DO UPDATE SET amount_ml = excluded.amount_ml, target_ml = excluded.target_ml, updated_at = excluded.updated_at`,
      [body.plan_date, nextAmount, profile.target_water_ml, (/* @__PURE__ */ new Date()).toISOString()]
    );
    return { plan_date: body.plan_date, amount_ml: nextAmount, target_ml: profile.target_water_ml };
  });
  ctx.route("DELETE", "/plan", async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute("DELETE FROM meal_plan WHERE id = ?", [id]);
    await syncTodayToHomeAssistantAndSharedDb();
    return { deleted: id };
  });
  ctx.route("POST", "/groceries/from-optimization", async (req, { db }) => {
    const body = req.body || {};
    const optResult = computeSupermarketOptimization(body.mealIds);
    let addedCount = 0;
    for (const item of optResult.cumulativeIngredients) {
      if (item.netToBuy <= 0) continue;
      const chosenOffer = body.storePreference && body.storePreference !== "optimal" ? item.offers[body.storePreference] : item.recommendedOffer;
      const label = `[${chosenOffer.storeLabel}] ${chosenOffer.packsNeeded}x ${chosenOffer.productName} (\u20AC${chosenOffer.totalPrice.toFixed(2)} \u2022 Bedarf: ${item.netToBuy}${item.unit}, Rest: +${chosenOffer.surplusAmount}${item.unit})`;
      db.execute(
        "INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)",
        [label, chosenOffer.storeLabel, item.usedInMeals.join(", ")]
      );
      addedCount++;
    }
    await syncTodayToHomeAssistantAndSharedDb();
    return { addedCount, summary: optResult.optimalMix };
  });
  ctx.route("GET", "/groceries", (_req, { db }) => {
    const items = db.query("SELECT * FROM grocery_items ORDER BY checked ASC, id DESC");
    return { items };
  });
  ctx.route("POST", "/groceries", async (req, { db }) => {
    const body = req.body || {};
    if (!body.name?.trim()) {
      return { status: 400, body: { error: "Item name is required" } };
    }
    db.execute(
      "INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)",
      [body.name.trim(), (body.category || "General").trim(), (body.source_recipe || "").trim()]
    );
    await syncTodayToHomeAssistantAndSharedDb();
    return { added: true };
  });
  ctx.route("POST", "/groceries/toggle", async (req, { db }) => {
    const body = req.body || {};
    db.execute("UPDATE grocery_items SET checked = CASE WHEN checked = 1 THEN 0 ELSE 1 END WHERE id = ?", [
      Number(body.id)
    ]);
    await syncTodayToHomeAssistantAndSharedDb();
    return { toggled: body.id };
  });
  ctx.route("DELETE", "/groceries/checked", async (_req, { db }) => {
    db.execute("DELETE FROM grocery_items WHERE checked = 1");
    await syncTodayToHomeAssistantAndSharedDb();
    return { cleared: true };
  });
  ctx.route("POST", "/sync-ha", async () => {
    return await syncTodayToHomeAssistantAndSharedDb();
  });
  ctx.scheduleJob({
    id: "sync-meal-sensors",
    name: "Sync Today's Meals & Nutrition to Home Assistant",
    description: "Publishes sensor.thassi_meal_planner_todays_dinner, todays_calories, and open_groceries to Home Assistant and /data/shared.db.",
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const res = await syncTodayToHomeAssistantAndSharedDb();
      return `Dinner: ${res.dinner} (${res.totalCalories} kcal, ${res.totalProtein}g protein, ${res.openGroceries} groceries) [HA: ${res.haConnected ? "synced" : "local-only"}]`;
    }
  });
});
export {
  computeProfileTargets,
  index_default as default,
  parseIngredientLine
};
