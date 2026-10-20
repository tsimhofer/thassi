import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/memo/backend/index.ts
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

// apps/memo/backend/index.ts
var index_default = defineThassiApp((ctx) => {
  ensureMemoSchema(ctx.db);
  const actionRegistry = new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
  const dataDir = path3.resolve(
    process.env.THASSI_DATA_DIR || (fs3.existsSync("/data") ? "/data" : "./data")
  );
  const vaultDir = path3.join(dataDir, "memo_vault");
  fs3.mkdirSync(vaultDir, { recursive: true });
  function syncLocalMarkdownFiles() {
    let synced = 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const scanDirs = [
      { dir: vaultDir, prefix: "memo_vault" },
      { dir: process.cwd(), prefix: "repo" }
    ];
    for (const { dir, prefix } of scanDirs) {
      if (!fs3.existsSync(dir)) continue;
      let entries = [];
      try {
        entries = fs3.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
        const fullPath = path3.join(dir, entry.name);
        try {
          const stat = fs3.statSync(fullPath);
          if (stat.size > 512e3) continue;
          const content = fs3.readFileSync(fullPath, "utf-8");
          const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.name.replace(/\.md$/i, "");
          const relPath = `${prefix}/${entry.name}`;
          const existing = ctx.db.queryOne(
            "SELECT id, updated_at FROM memo_entries WHERE file_path = ? LIMIT 1",
            [relPath]
          );
          if (existing) {
            ctx.db.execute(
              "UPDATE memo_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?",
              [heading, content, stat.mtime.toISOString(), existing.id]
            );
          } else {
            ctx.db.execute(
              `INSERT INTO memo_entries
               (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
               VALUES ('markdown', ?, ?, ?, ?, '', '', 0, ?, ?)`,
              [
                heading,
                content,
                prefix === "repo" ? "markdown,architektur,docs" : "markdown,vault",
                relPath,
                now,
                stat.mtime.toISOString()
              ]
            );
          }
          synced++;
        } catch {
        }
      }
    }
    return synced;
  }
  async function syncExternalSources() {
    const errors = [];
    const markdownSynced = syncLocalMarkdownFiles();
    let driveSynced = 0;
    let keepAndNotesSynced = 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const sysNotes = ctx.sharedDb.query("SELECT * FROM system_notes ORDER BY id DESC LIMIT 100");
      for (const sn of sysNotes) {
        const extId = `sysnote_${sn.id}`;
        const firstLine = sn.content.split("\n")[0]?.replace(/^#+\s*/, "").trim().slice(0, 72) || `Notiz #${sn.id}`;
        const existing = ctx.db.queryOne(
          "SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1",
          [extId]
        );
        if (!existing) {
          ctx.db.execute(
            `INSERT INTO memo_entries
             (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
             VALUES ('note', ?, ?, 'notiz,system', '', ?, '', ?, ?, ?)`,
            [firstLine, sn.content, extId, sn.pinned ? 1 : 0, sn.created_at, sn.created_at]
          );
          keepAndNotesSynced++;
        }
      }
    } catch (e) {
      errors.push(`System Notes: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const states = await ctx.ha.getStates();
      const noteLike = states.filter(
        (s) => s.entity_id.startsWith("todo.") || s.entity_id.startsWith("input_text.") || /keep|note|notiz|einkauf|todo/i.test(s.entity_id)
      );
      for (const ent of noteLike) {
        if (!ent.state || ent.state === "unavailable" || ent.state === "unknown") continue;
        const extId = `ha_${ent.entity_id}`;
        const friendly = String(ent.attributes?.friendly_name || ent.entity_id);
        const bodyText = `Entity: ${ent.entity_id}
Status/Wert: ${ent.state}
Aktualisiert: ${ent.last_updated}`;
        const existing = ctx.db.queryOne(
          "SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1",
          [extId]
        );
        if (existing) {
          ctx.db.execute(
            "UPDATE memo_entries SET content = ?, updated_at = ? WHERE id = ?",
            [bodyText, ent.last_updated || now, existing.id]
          );
        } else {
          ctx.db.execute(
            `INSERT INTO memo_entries
             (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
             VALUES ('keep', ?, ?, 'keep,ha,todo', '', ?, '', 0, ?, ?)`,
            [friendly, bodyText, extId, now, ent.last_updated || now]
          );
        }
        keepAndNotesSynced++;
      }
    } catch {
    }
    if (ctx.google.getStatus().authorized) {
      try {
        const token = await ctx.google.getValidAccessToken();
        try {
          const keepRes = await fetch("https://keep.googleapis.com/v1/notes?pageSize=30", {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(4e3)
          });
          if (keepRes.ok) {
            const keepData = await keepRes.json();
            for (const kn of keepData.notes || []) {
              const extId = `gkeep_${kn.name || kn.id}`;
              const title = String(kn.title || "Google Keep Notiz").trim();
              const body = String(kn.body?.text?.text || "").trim();
              const existing = ctx.db.queryOne(
                "SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1",
                [extId]
              );
              if (existing) {
                ctx.db.execute(
                  "UPDATE memo_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?",
                  [title, body, kn.updateTime || now, existing.id]
                );
              } else {
                ctx.db.execute(
                  `INSERT INTO memo_entries
                   (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
                   VALUES ('keep', ?, ?, 'google-keep,notiz', '', ?, 'https://keep.google.com', 0, ?, ?)`,
                  [title, body, extId, kn.createTime || now, kn.updateTime || now]
                );
              }
              keepAndNotesSynced++;
            }
          }
        } catch {
        }
        const params = new URLSearchParams({
          pageSize: "25",
          q: "trashed = false",
          orderBy: "modifiedTime desc",
          fields: "files(id,name,mimeType,modifiedTime,webViewLink,description)"
        });
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5500)
          }
        );
        if (driveRes.ok) {
          const driveData = await driveRes.json();
          for (const f of driveData.files || []) {
            const fileId = String(f.id || "");
            if (!fileId) continue;
            const extId = `gdrive_${fileId}`;
            const mime = String(f.mimeType || "");
            let extractedText = String(f.description || "").trim();
            if (driveSynced < 8) {
              try {
                if (mime === "application/vnd.google-apps.document") {
                  const exp = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                      fileId
                    )}/export?mimeType=text/plain`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                      signal: AbortSignal.timeout(3500)
                    }
                  );
                  if (exp.ok) {
                    extractedText = (await exp.text()).slice(0, 8e3);
                  }
                } else if (mime.startsWith("text/") || mime.includes("markdown")) {
                  const dl = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                      fileId
                    )}?alt=media`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                      signal: AbortSignal.timeout(3500)
                    }
                  );
                  if (dl.ok) {
                    extractedText = (await dl.text()).slice(0, 8e3);
                  }
                }
              } catch {
              }
            }
            if (!extractedText) {
              extractedText = `Google Drive Datei: ${f.name}
Typ: ${mime}
Ge\xE4ndert: ${f.modifiedTime || now}`;
            }
            const isKeepDoc = /keep|notiz|note|memo/i.test(String(f.name || ""));
            const sType = isKeepDoc ? "keep" : "drive";
            const tags = isKeepDoc ? "drive,google-keep,notiz" : `drive,${mime.split("/").pop() || "file"}`;
            const existing = ctx.db.queryOne(
              "SELECT id FROM memo_entries WHERE external_id = ? LIMIT 1",
              [extId]
            );
            if (existing) {
              ctx.db.execute(
                "UPDATE memo_entries SET title = ?, content = ?, external_url = ?, updated_at = ? WHERE id = ?",
                [
                  String(f.name || "Drive File"),
                  extractedText,
                  String(f.webViewLink || ""),
                  String(f.modifiedTime || now),
                  existing.id
                ]
              );
            } else {
              ctx.db.execute(
                `INSERT INTO memo_entries
                 (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
                 VALUES (?, ?, ?, ?, '', ?, ?, 0, ?, ?)`,
                [
                  sType,
                  String(f.name || "Drive File"),
                  extractedText,
                  tags,
                  extId,
                  String(f.webViewLink || ""),
                  String(f.modifiedTime || now),
                  String(f.modifiedTime || now)
                ]
              );
            }
            driveSynced++;
          }
        }
      } catch (e) {
        errors.push(`Google Drive: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { markdownSynced, driveSynced, keepAndNotesSynced, errors };
  }
  syncLocalMarkdownFiles();
  function getActionCtx() {
    return {
      sharedDb: ctx.sharedDb,
      ha: ctx.ha,
      google: ctx.google,
      dataDir,
      credentials: {
        geminiApiKey: ctx.sharedDb.kvGet("gemini_api_key", "") || "",
        githubToken: ctx.sharedDb.kvGet("github_token", "") || "",
        googleOAuthToken: ctx.sharedDb.kvGet("google_oauth_token", "") || ""
      }
    };
  }
  ctx.route("GET", "/overview", async () => {
    syncLocalMarkdownFiles();
    const entries = ctx.db.query(
      "SELECT * FROM memo_entries ORDER BY pinned DESC, updated_at DESC LIMIT 200"
    );
    const counts = {
      total: entries.length,
      markdown: entries.filter((e) => e.source_type === "markdown").length,
      notes: entries.filter((e) => e.source_type === "note" || e.source_type === "keep").length,
      drive: entries.filter((e) => e.source_type === "drive").length
    };
    const appsDbDir = path3.join(dataDir, "apps");
    const dbInventory = [];
    try {
      if (fs3.existsSync(appsDbDir)) {
        for (const f of fs3.readdirSync(appsDbDir)) {
          if (f.endsWith(".db")) {
            const st = fs3.statSync(path3.join(appsDbDir, f));
            dbInventory.push({
              dbName: f.replace(/\.db$/, ""),
              sizeKb: Math.round(st.size / 1024)
            });
          }
        }
      }
    } catch {
    }
    const tagSet = /* @__PURE__ */ new Set();
    for (const e of entries) {
      for (const t of e.tags.split(",")) {
        const clean = t.trim();
        if (clean) tagSet.add(clean);
      }
    }
    return {
      counts: {
        ...counts,
        databases: dbInventory.length
      },
      googleAuthorized: ctx.google.getStatus().authorized,
      dbInventory,
      tags: Array.from(tagSet).slice(0, 35),
      entries
    };
  });
  ctx.route("GET", "/search", async (req) => {
    const q = String(req.query.q || "").trim();
    const sources = String(req.query.sources || "all").toLowerCase();
    const limit = Math.max(5, Math.min(100, Number(req.query.limit || 40)));
    const tagFilter = String(req.query.tag || "").trim().toLowerCase();
    let hits = await executeFederatedMemoSearch(
      getActionCtx(),
      q,
      sources,
      limit,
      (t) => actionRegistry.resolveGoogleAccessToken(t)
    );
    if (tagFilter) {
      hits = hits.filter((h) => h.tags.some((t) => t.toLowerCase() === tagFilter));
    }
    return {
      query: q,
      sources,
      count: hits.length,
      results: hits
    };
  });
  ctx.route("GET", "/document", async (req) => {
    const id = String(req.query.id || "").trim();
    if (!id) return { status: 400, body: { error: "id is required" } };
    if (id.startsWith("memo_")) {
      const numId = Number(id.replace("memo_", ""));
      const row = ctx.db.queryOne("SELECT * FROM memo_entries WHERE id = ?", [numId]);
      if (!row) return { status: 404, body: { error: "Entry not found" } };
      if (row.source_type === "drive" && row.external_id.startsWith("gdrive_")) {
        const fileId = row.external_id.replace("gdrive_", "");
        try {
          const res = await actionRegistry.execute("google.drive.read_file", {
            fileId,
            maxChars: "25000"
          });
          if (res.status === "success" && res.data?.content) {
            return {
              id,
              entryId: row.id,
              sourceType: row.source_type,
              title: row.title,
              content: String(res.data.content),
              tags: row.tags,
              ref: row.file_path || row.external_id,
              externalUrl: row.external_url,
              pinned: Boolean(row.pinned),
              updatedAt: row.updated_at
            };
          }
        } catch {
        }
      }
      return {
        id,
        entryId: row.id,
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        tags: row.tags,
        ref: row.file_path || row.external_id || `memo#${row.id}`,
        externalUrl: row.external_url,
        pinned: Boolean(row.pinned),
        updatedAt: row.updated_at
      };
    }
    if (id.startsWith("drive_")) {
      const fileId = id.replace("drive_", "");
      const res = await actionRegistry.execute("google.drive.read_file", {
        fileId,
        maxChars: "25000"
      });
      return {
        id,
        sourceType: "drive",
        title: String(res.data?.name || "Google Drive Document"),
        content: String(res.data?.content || res.summary),
        tags: "drive,google",
        ref: `drive:${fileId}`,
        externalUrl: String(res.data?.webViewLink || ""),
        pinned: false,
        updatedAt: String(res.data?.modifiedTime || (/* @__PURE__ */ new Date()).toISOString())
      };
    }
    if (id.startsWith("md_")) {
      const fileName = path3.basename(id.replace("md_", ""));
      const candidates = [path3.join(vaultDir, fileName), path3.join(process.cwd(), fileName)];
      for (const full of candidates) {
        if (fs3.existsSync(full)) {
          const content = fs3.readFileSync(full, "utf-8");
          const st = fs3.statSync(full);
          return {
            id,
            sourceType: "markdown",
            title: fileName,
            content,
            tags: "markdown,file",
            ref: fileName,
            pinned: false,
            updatedAt: st.mtime.toISOString()
          };
        }
      }
    }
    return { status: 404, body: { error: `Document ${id} not found` } };
  });
  ctx.route("POST", "/entries", async (req) => {
    const body = req.body || {};
    const title = String(body.title || "").trim();
    if (!title) {
      return { status: 400, body: { error: "Titel ist erforderlich" } };
    }
    const content = String(body.content || "").trim();
    const tags = String(body.tags || "memo").trim();
    const sourceType = body.sourceType || "markdown";
    const pinned = body.pinned ? 1 : 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let filePathRel = "";
    if (sourceType === "markdown") {
      const safeSlug = title.toLowerCase().replace(/[^a-z0-9äöüß_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || `memo-${Date.now()}`;
      const fullPath = path3.join(vaultDir, `${safeSlug}.md`);
      const mdText = content.startsWith("#") ? content : `# ${title}

${content}
`;
      fs3.writeFileSync(fullPath, mdText, "utf-8");
      filePathRel = `memo_vault/${safeSlug}.md`;
    }
    if (body.id) {
      ctx.db.execute(
        `UPDATE memo_entries
         SET title = ?, content = ?, tags = ?, source_type = ?, file_path = COALESCE(NULLIF(?, ''), file_path), pinned = ?, updated_at = ?
         WHERE id = ?`,
        [title, content, tags, sourceType, filePathRel, pinned, now, Number(body.id)]
      );
      return { id: Number(body.id), updated: true, filePath: filePathRel };
    }
    const res = ctx.db.execute(
      `INSERT INTO memo_entries
       (source_type, title, content, tags, file_path, external_id, external_url, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
      [sourceType, title, content, tags, filePathRel, pinned, now, now]
    );
    return { id: Number(res.lastInsertRowid), created: true, filePath: filePathRel };
  });
  ctx.route("DELETE", "/entries", (req) => {
    const rawId = String(req.query.id || "").replace(/^memo_/, "");
    const id = Number(rawId);
    if (!id) return { status: 400, body: { error: "Valid id required" } };
    const existing = ctx.db.queryOne("SELECT * FROM memo_entries WHERE id = ?", [id]);
    if (existing?.file_path && existing.file_path.startsWith("memo_vault/")) {
      const full = path3.join(dataDir, existing.file_path);
      try {
        if (fs3.existsSync(full)) fs3.unlinkSync(full);
      } catch {
      }
    }
    ctx.db.execute("DELETE FROM memo_entries WHERE id = ?", [id]);
    return { deleted: id };
  });
  ctx.route("POST", "/sync", async () => {
    const report = await syncExternalSources();
    return {
      ok: true,
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...report
    };
  });
  ctx.route("POST", "/bundle", async (req) => {
    const body = req.body || {};
    const topic = String(body.topic || "").trim();
    const sources = String(body.sources || "all");
    const maxSnippets = Math.max(3, Math.min(30, Number(body.maxSnippets || 12)));
    const hits = await executeFederatedMemoSearch(
      getActionCtx(),
      topic,
      sources,
      maxSnippets,
      (t) => actionRegistry.resolveGoogleAccessToken(t)
    );
    const bundleMarkdown = [
      `# MEMO WISSENS-BUNDLE \u2014 "${topic || "Alle Quellen"}"`,
      `Stand: ${(/* @__PURE__ */ new Date()).toLocaleString("de-AT")} \xB7 Treffer: ${hits.length}`,
      "",
      ...hits.map(
        (h, i) => `## [${i + 1}] ${h.title} (${h.sourceBadge} \xB7 ${h.ref})
${h.contentPreview || h.snippet}`
      )
    ].join("\n\n");
    return {
      topic,
      count: hits.length,
      results: hits,
      bundleMarkdown
    };
  });
  ctx.scheduleJob({
    id: "memo-sync-sensor",
    name: "Sync Memo Knowledge Index & Publish HA Sensor",
    intervalMinutes: 30,
    runOnStart: true,
    handler: async () => {
      await syncExternalSources();
      const cnt = ctx.db.queryOne("SELECT COUNT(*) as c FROM memo_entries")?.c ?? 0;
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        await ctx.ha.publishSensor("total_documents", cnt, {
          friendly_name: "Memo Wissens-Dokumente",
          unit_of_measurement: "docs",
          icon: "mdi:text-search-variant"
        });
      }
      return `Memo indexed ${cnt} documents`;
    }
  });
});
export {
  index_default as default
};
