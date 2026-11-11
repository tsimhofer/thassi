import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/contacts/backend/index.ts
import fs3 from "node:fs";
import path3 from "node:path";

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
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
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    } catch {
    }
    this.raw = this.openWithAutoRecovery(dbPath);
  }
  isCorruptionError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /malformed|corrupt|not a database|disk I\/O|EIO|not open/i.test(msg);
  }
  recoverCorruptedDatabase() {
    try {
      this.raw.close();
    } catch {
    }
    const isSharedDb = path.basename(this.dbPath) === "shared.db";
    try {
      const suffixes = isSharedDb ? ["-wal", "-shm"] : ["", "-wal", "-shm"];
      for (const suffix of suffixes) {
        if (fs.existsSync(this.dbPath + suffix)) {
          fs.rmSync(this.dbPath + suffix, { force: true });
        }
      }
    } catch {
    }
    this.raw = this.openWithAutoRecovery(this.dbPath);
  }
  initSchema(db) {
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
  }
  openWithAutoRecovery(dbPath) {
    try {
      return this.initSchema(new DatabaseSync(dbPath));
    } catch {
      const isSharedDb = path.basename(dbPath) === "shared.db";
      try {
        const suffixes = isSharedDb ? ["-wal", "-shm"] : ["", "-wal", "-shm"];
        for (const suffix of suffixes) {
          if (fs.existsSync(dbPath + suffix)) {
            fs.rmSync(dbPath + suffix, { force: true });
          }
        }
        return this.initSchema(new DatabaseSync(dbPath));
      } catch {
        try {
          const fallbackDir = path.join(os.tmpdir(), "thassi_db_fallback");
          fs.mkdirSync(fallbackDir, { recursive: true });
          const fallbackPath = path.join(fallbackDir, path.basename(dbPath));
          return this.initSchema(new DatabaseSync(fallbackPath));
        } catch {
          return this.initSchema(new DatabaseSync(":memory:"));
        }
      }
    }
  }
  /** Execute raw DDL or multi-statement SQL */
  exec(sql) {
    try {
      this.raw.exec(sql);
    } catch (err) {
      if (this.isCorruptionError(err)) {
        this.recoverCorruptedDatabase();
        this.raw.exec(sql);
        return;
      }
      throw err;
    }
  }
  /** Run a SELECT query and return typed rows */
  query(sql, params = []) {
    try {
      const stmt = this.raw.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      if (this.isCorruptionError(err)) {
        this.recoverCorruptedDatabase();
        return [];
      }
      throw err;
    }
  }
  /** Run a SELECT query and return the first row or undefined */
  queryOne(sql, params = []) {
    try {
      const stmt = this.raw.prepare(sql);
      return stmt.get(...params);
    } catch (err) {
      if (this.isCorruptionError(err)) {
        this.recoverCorruptedDatabase();
        return void 0;
      }
      throw err;
    }
  }
  /** Run an INSERT / UPDATE / DELETE statement */
  execute(sql, params = []) {
    try {
      const stmt = this.raw.prepare(sql);
      const res = stmt.run(...params);
      return {
        changes: Number(res.changes),
        lastInsertRowid: res.lastInsertRowid
      };
    } catch (err) {
      if (this.isCorruptionError(err)) {
        this.recoverCorruptedDatabase();
        const stmt = this.raw.prepare(sql);
        const res = stmt.run(...params);
        return {
          changes: Number(res.changes),
          lastInsertRowid: res.lastInsertRowid
        };
      }
      throw err;
    }
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

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/contacts/backend/index.ts
var FULL_COMM_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.sleep.read"
];
function slugifyContactId(raw) {
  const s = String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || `contact-${Date.now()}`;
}
function cleanNotificationText(raw) {
  if (raw === null || raw === void 0) return "";
  const str = String(raw).replace(/\u00a0/g, " ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (str === "null" || str === "undefined") return "";
  return str;
}
function mapAndroidPackageToChannel(pkg, category = "") {
  const lower = pkg.toLowerCase();
  const cat = category.toLowerCase();
  if (cat === "transport" || cat === "sys" || cat === "service" || lower.includes("youtube.music") || lower.includes("spotify") || lower.includes("systemui") || lower.includes("vending") || lower.includes("gms") || lower === "android") {
    return null;
  }
  if (lower.includes("snapchat")) return "SNAP";
  if (lower.includes("whatsapp")) return "WA";
  if (lower.includes("google.android.gm") || lower.includes("outlook") || lower.includes("k9") || cat === "email") {
    return "GMAIL";
  }
  if (lower.includes("telegram") || lower.includes("plusmessenger")) return "TG";
  if (lower.includes("thoughtcrime.securesms") || lower.includes("signal")) return "SIGNAL";
  if (lower.includes("apps.messaging") || lower.includes("android.mms") || lower.includes("samsung.android.messaging") || lower.includes("dialer")) {
    return "SMS";
  }
  if (lower.includes("instagram")) return "IG";
  if (lower.includes("discord")) return "DISCORD";
  if (lower.includes("homeassistant")) return "HA";
  if (cat === "msg" || cat === "call" || cat === "social") {
    return "PIXEL";
  }
  return null;
}
var index_default = defineThassiApp(async (ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role_or_relation TEXT NOT NULL DEFAULT '',
      primary_channel TEXT NOT NULL DEFAULT 'GMAIL',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp_handle TEXT NOT NULL DEFAULT '',
      snapchat_handle TEXT NOT NULL DEFAULT '',
      telegram_handle TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL DEFAULT '',
      last_message_preview TEXT NOT NULL DEFAULT '',
      last_message_channel TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      contact_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'in',
      channel TEXT NOT NULL DEFAULT 'GMAIL',
      sender_name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      raw_meta_json TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      delivery_status TEXT NOT NULL DEFAULT 'delivered',
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_contact_ts ON messages(contact_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp DESC);
  `);
  const dataDir = path3.resolve(
    process.env.THASSI_DATA_DIR || (fs3.existsSync("/data") ? "/data" : "./data")
  );
  function resolveGeminiKey() {
    const sharedKey = String(ctx.sharedDb.kvGet("gemini_api_key", "") || "").trim();
    if (sharedKey) return { key: sharedKey, source: "Shared Vault (shared.db)" };
    const localKey = String(ctx.db.kvGet("gemini_api_key", "") || "").trim();
    if (localKey) return { key: localKey, source: "App DB" };
    const envKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (envKey) return { key: envKey, source: "Environment" };
    const hassKey = discoverGeminiApiKeyFromHass();
    if (hassKey) {
      try {
        ctx.sharedDb.kvSet("gemini_api_key", hassKey);
      } catch {
      }
      return { key: hassKey, source: "Home Assistant Core" };
    }
    return { key: "", source: "Nicht konfiguriert" };
  }
  function tryBridgeGoogleOAuthFromHassStorage() {
    try {
      const existingTokens = ctx.google.getTokens();
      if (existingTokens?.refreshToken && existingTokens?.accessToken) return;
      const storageDirs = ["/homeassistant/.storage", "/config/.storage"];
      for (const dir of storageDirs) {
        const entriesFile = path3.join(dir, "core.config_entries");
        const credsFile = path3.join(dir, "application_credentials");
        if (!fs3.existsSync(entriesFile)) continue;
        const entriesRaw = JSON.parse(fs3.readFileSync(entriesFile, "utf-8"));
        const entries = entriesRaw?.data?.entries || [];
        const googleEntry = entries.find(
          (e) => e.domain === "google" && e.data?.token?.refresh_token
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
            scopes: tokenObj.scope ? String(tokenObj.scope).split(" ") : ["https://www.googleapis.com/auth/calendar"]
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
          break;
        }
      }
    } catch {
    }
  }
  tryBridgeGoogleOAuthFromHassStorage();
  function upsertContact(input) {
    const cleanName = input.name.trim();
    const id = input.id || slugifyContactId(cleanName);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = ctx.db.queryOne("SELECT * FROM contacts WHERE id = ?", [id]) || (input.email ? ctx.db.queryOne("SELECT * FROM contacts WHERE LOWER(email) = LOWER(?) AND email != ''", [
      input.email.trim()
    ]) : void 0) || ctx.db.queryOne("SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)", [cleanName]);
    if (!existing) {
      ctx.db.execute(
        `INSERT INTO contacts (
          id, name, role_or_relation, primary_channel, email, phone,
          whatsapp_handle, snapchat_handle, telegram_handle, birthday, notes,
          pinned, unread_count, last_message_at, last_message_preview, last_message_channel,
          source, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', '', ?, ?)`,
        [
          id,
          cleanName,
          input.role_or_relation || "",
          input.primary_channel || "GMAIL",
          input.email || "",
          input.phone || "",
          input.whatsapp_handle || "",
          input.snapchat_handle || "",
          input.telegram_handle || "",
          input.birthday || "",
          input.notes || "",
          input.pinned ?? 0,
          input.source || "manual",
          now
        ]
      );
      return ctx.db.queryOne("SELECT * FROM contacts WHERE id = ?", [id]);
    } else {
      ctx.db.execute(
        `UPDATE contacts SET
          name = CASE WHEN ? != '' THEN ? ELSE name END,
          role_or_relation = CASE WHEN ? != '' THEN ? ELSE role_or_relation END,
          primary_channel = CASE WHEN ? != '' THEN ? ELSE primary_channel END,
          email = CASE WHEN ? != '' THEN ? ELSE email END,
          phone = CASE WHEN ? != '' THEN ? ELSE phone END,
          whatsapp_handle = CASE WHEN ? != '' THEN ? ELSE whatsapp_handle END,
          snapchat_handle = CASE WHEN ? != '' THEN ? ELSE snapchat_handle END,
          telegram_handle = CASE WHEN ? != '' THEN ? ELSE telegram_handle END,
          birthday = CASE WHEN ? != '' THEN ? ELSE birthday END,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          pinned = CASE WHEN ? IS NOT NULL THEN ? ELSE pinned END,
          updated_at = ?
         WHERE id = ?`,
        [
          cleanName,
          cleanName,
          input.role_or_relation || "",
          input.role_or_relation || "",
          input.primary_channel || "",
          input.primary_channel || "",
          input.email || "",
          input.email || "",
          input.phone || "",
          input.phone || "",
          input.whatsapp_handle || "",
          input.whatsapp_handle || "",
          input.snapchat_handle || "",
          input.snapchat_handle || "",
          input.telegram_handle || "",
          input.telegram_handle || "",
          input.birthday || "",
          input.birthday || "",
          input.notes || "",
          input.notes || "",
          input.pinned !== void 0 ? input.pinned : null,
          input.pinned !== void 0 ? input.pinned : existing.pinned,
          now,
          existing.id
        ]
      );
      return ctx.db.queryOne("SELECT * FROM contacts WHERE id = ?", [existing.id]);
    }
  }
  function insertMessageIfNew(msg) {
    const existing = ctx.db.queryOne(
      "SELECT id FROM messages WHERE external_id = ?",
      [msg.external_id]
    );
    if (existing) return false;
    const cleanBody = msg.body.trim();
    if (!cleanBody) return false;
    ctx.db.execute(
      `INSERT INTO messages (
        external_id, contact_id, direction, channel, sender_name,
        subject, body, raw_meta_json, read, delivery_status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.external_id,
        msg.contact_id,
        msg.direction,
        msg.channel,
        msg.sender_name,
        (msg.subject || "").trim(),
        cleanBody,
        msg.raw_meta_json || "{}",
        msg.read ?? (msg.direction === "out" ? 1 : 0),
        msg.delivery_status || "delivered",
        msg.timestamp
      ]
    );
    recalculateContactMessageSummary(msg.contact_id);
    return true;
  }
  function recalculateContactMessageSummary(contactId) {
    const latest = ctx.db.queryOne(
      "SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1",
      [contactId]
    );
    const unreadRow = ctx.db.queryOne(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = ? AND direction = 'in' AND read = 0",
      [contactId]
    );
    if (latest) {
      const previewSource = latest.subject ? `${latest.subject} \u2014 ${latest.body}` : latest.body;
      const preview = previewSource.replace(/\s+/g, " ").trim().slice(0, 120);
      ctx.db.execute(
        `UPDATE contacts SET
          unread_count = ?,
          last_message_at = ?,
          last_message_preview = ?,
          last_message_channel = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          unreadRow?.cnt ?? 0,
          latest.timestamp,
          preview,
          latest.channel,
          (/* @__PURE__ */ new Date()).toISOString(),
          contactId
        ]
      );
    } else {
      ctx.db.execute(
        `UPDATE contacts SET unread_count = 0 WHERE id = ?`,
        [contactId]
      );
    }
  }
  function ensureBaseEcosystemContacts() {
    upsertContact({
      id: "patricia-leuthner",
      name: "Patricia Leuthner",
      role_or_relation: "Partnerin \xB7 Shared Calendar (teebee)",
      primary_channel: "WA",
      email: "leuthner.patricia@gmail.com",
      pinned: 1,
      source: "google_calendar"
    });
    upsertContact({
      id: "florian-karpf",
      name: "Florian Karpf",
      role_or_relation: "Snapchat \xB7 Pixel 10 Live",
      primary_channel: "SNAP",
      snapchat_handle: "Florian Karpf",
      pinned: 1,
      source: "pixel_live"
    });
    upsertContact({
      id: "aishe-ha",
      name: "Aishe (Home & Pixel 10)",
      role_or_relation: "Home Assistant OS \xB7 Pixel 10 Push Bridge",
      primary_channel: "HA",
      pinned: 1,
      source: "ha_person"
    });
    upsertContact({
      id: "cortex-ai",
      name: "Cortex AI",
      role_or_relation: "Thassi Intelligence \xB7 Direkt-Chat",
      primary_channel: "CORTEX",
      pinned: 1,
      source: "system"
    });
  }
  ensureBaseEcosystemContacts();
  let _lastSyncSummary = {
    syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    pixelConnected: false,
    pixelActiveNotifs: 0,
    pixelPhoneState: "idle",
    pixelDnd: "off",
    pixelBattery: null,
    pixelSim1: "",
    pixelSim2: "",
    gmailApiStatus: "unconfigured",
    gmailApiMessage: "",
    peopleApiStatus: "unconfigured",
    calendarContactsSynced: 0,
    newMessagesIngested: 0
  };
  async function syncPixel10LiveNotifications() {
    let ingestedCount = 0;
    try {
      const states = await ctx.ha.getStates();
      const sm = new Map(states.map((s) => [s.entity_id, s]));
      const activeNotifSensor = sm.get("sensor.pixel_10_active_notification_count");
      const lastNotifSensor = sm.get("sensor.pixel_10_last_notification");
      const phoneState = sm.get("sensor.pixel_10_phone_state")?.state || "idle";
      const dnd = sm.get("sensor.pixel_10_do_not_disturb_sensor")?.state || "off";
      const battRaw = Number(sm.get("sensor.pixel_10_battery_level")?.state);
      const battery = Number.isFinite(battRaw) ? battRaw : null;
      const sim1 = sm.get("sensor.pixel_10_sim_1")?.state || "";
      const sim2 = sm.get("sensor.pixel_10_sim_2")?.state || "";
      if (!activeNotifSensor && !lastNotifSensor) {
        return {
          connected: false,
          activeCount: 0,
          ingestedCount: 0,
          phoneState,
          dnd,
          battery,
          sim1,
          sim2
        };
      }
      const activeCount = Number(activeNotifSensor?.state || 0) || 0;
      const attrs = activeNotifSensor?.attributes || {};
      const suffixes = [];
      for (const key of Object.keys(attrs)) {
        if (key.startsWith("android.title_")) {
          suffixes.push(key.slice("android.title_".length));
        }
      }
      const seenContentSignatures = /* @__PURE__ */ new Set();
      suffixes.sort((a, b) => {
        const aZero = a.endsWith("_0") ? 1 : 0;
        const bZero = b.endsWith("_0") ? 1 : 0;
        return aZero - bZero;
      });
      for (const suffix of suffixes) {
        const pkg = suffix.replace(/_-?\d+$/, "");
        const category = String(attrs[`${suffix}_category`] || "");
        const channel = mapAndroidPackageToChannel(pkg, category);
        if (!channel) continue;
        const rawTitle = cleanNotificationText(attrs[`android.title_${suffix}`]);
        const rawText = cleanNotificationText(attrs[`android.text_${suffix}`]);
        const rawBigText = cleanNotificationText(attrs[`android.bigText_${suffix}`]);
        const rawSubText = cleanNotificationText(attrs[`android.subText_${suffix}`]);
        const postTimeMs = Number(attrs[`${suffix}_post_time`] || 0);
        if (!rawTitle && !rawText && !rawBigText) continue;
        const senderName = rawTitle || pkg;
        const contentSig = `${channel}::${senderName.toLowerCase()}::${(rawText || rawBigText).slice(0, 80).toLowerCase()}`;
        if (seenContentSignatures.has(contentSig)) continue;
        seenContentSignatures.add(contentSig);
        const timestamp = postTimeMs > 1e12 ? new Date(postTimeMs).toISOString() : activeNotifSensor?.last_updated || (/* @__PURE__ */ new Date()).toISOString();
        let subject = "";
        let body = rawBigText || rawText;
        if (channel === "GMAIL" && rawText && rawBigText && rawBigText.startsWith(rawText)) {
          subject = rawText;
          body = rawBigText.slice(rawText.length).trim() || rawBigText;
        } else if (channel === "GMAIL" && rawText && rawBigText && rawText !== rawBigText) {
          subject = rawText;
          body = rawBigText;
        }
        const contact = upsertContact({
          name: senderName,
          primary_channel: channel,
          role_or_relation: channel === "SNAP" ? "Snapchat \xB7 Pixel 10 Live" : channel === "WA" ? "WhatsApp \xB7 Pixel 10 Live" : channel === "GMAIL" ? `E-Mail${rawSubText && rawSubText.includes("@") ? ` \xB7 an ${rawSubText}` : " \xB7 Pixel 10 Push"}` : `${channel} \xB7 Pixel 10 Live`,
          snapchat_handle: channel === "SNAP" ? senderName : "",
          whatsapp_handle: channel === "WA" ? senderName : "",
          source: "pixel_live"
        });
        const sigHash = Buffer.from(`${channel}:${senderName}:${(rawText || body).slice(0, 60)}`).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);
        const externalId = `pixel_${channel.toLowerCase()}_${sigHash}`;
        const inserted = insertMessageIfNew({
          external_id: externalId,
          contact_id: contact.id,
          direction: "in",
          channel,
          sender_name: senderName,
          subject,
          body,
          raw_meta_json: JSON.stringify({
            package: pkg,
            suffix,
            subText: rawSubText,
            postTimeMs,
            device: "Pixel 10"
          }),
          timestamp
        });
        if (inserted) ingestedCount++;
      }
      if (lastNotifSensor && lastNotifSensor.state && lastNotifSensor.state !== "unknown" && lastNotifSensor.state !== "unavailable") {
        const lAttrs = lastNotifSensor.attributes || {};
        const pkg = String(lAttrs.package || "");
        const category = String(lAttrs.category || "");
        const channel = mapAndroidPackageToChannel(pkg, category);
        if (channel) {
          const senderName = cleanNotificationText(lAttrs["android.title"]) || pkg;
          const text = cleanNotificationText(lAttrs["android.bigText"]) || cleanNotificationText(lAttrs["android.text"]) || cleanNotificationText(lastNotifSensor.state);
          if (senderName && text) {
            const postTimeMs = Number(lAttrs.post_time || 0);
            const timestamp = postTimeMs > 1e12 ? new Date(postTimeMs).toISOString() : lastNotifSensor.last_updated || (/* @__PURE__ */ new Date()).toISOString();
            const contact = upsertContact({
              name: senderName,
              primary_channel: channel,
              role_or_relation: `${channel} \xB7 Pixel 10 Live`,
              source: "pixel_live"
            });
            const sigHash = Buffer.from(`${channel}:${senderName}:${text.slice(0, 60)}`).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);
            const inserted = insertMessageIfNew({
              external_id: `pixel_last_${channel.toLowerCase()}_${sigHash}`,
              contact_id: contact.id,
              direction: "in",
              channel,
              sender_name: senderName,
              body: text,
              timestamp
            });
            if (inserted) ingestedCount++;
          }
        }
      }
      return {
        connected: true,
        activeCount,
        ingestedCount,
        phoneState,
        dnd,
        battery,
        sim1,
        sim2
      };
    } catch {
      return {
        connected: false,
        activeCount: 0,
        ingestedCount: 0,
        phoneState: "unknown",
        dnd: "off",
        battery: null,
        sim1: "",
        sim2: ""
      };
    }
  }
  async function syncCalendarAndBirthdayContacts() {
    let count = 0;
    try {
      const calDbPath = path3.join(dataDir, "apps", "google-calendar.db");
      if (!fs3.existsSync(calDbPath)) return 0;
      const calDb = new ThassiAppDatabase(calDbPath);
      const bdayRows = calDb.query(
        `SELECT DISTINCT title, calendar_name, start_time
         FROM calendar_events
         WHERE calendar_name = 'Geburtstage' OR title LIKE '% hat Geburtstag%'
         ORDER BY start_time ASC`
      );
      for (const row of bdayRows) {
        const m = row.title.match(/^(.+?)\s+hat Geburtstag/i);
        if (!m) continue;
        const personName = m[1].trim();
        const dt = new Date(row.start_time);
        const bdayFormatted = !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" }) : "";
        const contact = upsertContact({
          name: personName,
          role_or_relation: bdayFormatted ? `Kontakt \xB7 Geburtstag ${bdayFormatted}` : "Kontakt \xB7 Google Kalender",
          primary_channel: "WA",
          birthday: bdayFormatted,
          source: "google_calendar"
        });
        count++;
        const msgCount = ctx.db.queryOne(
          "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = ?",
          [contact.id]
        );
        if ((msgCount?.cnt ?? 0) === 0 && bdayFormatted) {
          insertMessageIfNew({
            external_id: `cal_bday_${contact.id}`,
            contact_id: contact.id,
            direction: "in",
            channel: "CAL",
            sender_name: personName,
            subject: `Geburtstag am ${bdayFormatted}`,
            body: `Kalender-Eintrag verkn\xFCpft: ${row.title} (${bdayFormatted}). Bereit f\xFCr direkte Nachrichten \xFCber WhatsApp, SMS, E-Mail oder Pixel 10 Push.`,
            read: 1,
            timestamp: row.start_time
          });
        }
      }
      const patriciaEvents = calDb.query(
        `SELECT external_id, title, calendar_name, start_time, location
         FROM calendar_events
         WHERE calendar_name IN ('leuthner.patricia@gmail.com', 'teebee')
           AND start_time >= ?
         ORDER BY start_time ASC
         LIMIT 6`,
        [new Date(Date.now() - 3 * 864e5).toISOString()]
      );
      if (patriciaEvents.length > 0) {
        const lines = patriciaEvents.map((ev) => {
          const d = new Date(ev.start_time).toLocaleString("de-AT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });
          return `\u2022 ${d}: ${ev.title}${ev.location ? ` (${ev.location})` : ""} [${ev.calendar_name}]`;
        });
        insertMessageIfNew({
          external_id: `cal_patricia_shared_digest`,
          contact_id: "patricia-leuthner",
          direction: "in",
          channel: "CAL",
          sender_name: "Patricia Leuthner",
          subject: "Geteilte Termine (leuthner.patricia@gmail.com \xB7 teebee)",
          body: lines.join("\n"),
          read: 1,
          timestamp: new Date(Date.now() - 36e5).toISOString()
        });
      }
    } catch {
    }
    return count;
  }
  async function syncGoogleGmailAndPeople() {
    let ingestedMessages = 0;
    const oauthStatus = ctx.google.getStatus();
    if (!oauthStatus.configured || !oauthStatus.authorized) {
      return {
        gmailStatus: "unconfigured",
        gmailMessage: "Google OAuth2 noch nicht autorisiert",
        peopleStatus: "unconfigured",
        ingestedMessages: 0
      };
    }
    let token = "";
    try {
      token = await ctx.google.getValidAccessToken();
    } catch (err) {
      return {
        gmailStatus: "error",
        gmailMessage: err instanceof Error ? err.message : String(err),
        peopleStatus: "unconfigured",
        ingestedMessages: 0
      };
    }
    let gmailStatus = "ok";
    let gmailMessage = "Gmail API v1 verbunden";
    try {
      const listRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=label:INBOX",
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4500)
        }
      );
      if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          gmailStatus = "scope_missing";
          gmailMessage = "Pixel 10 Gmail-Push aktiv (OAuth Scope gmail.readonly optional erweiterbar)";
        } else {
          gmailStatus = "error";
          gmailMessage = `Gmail HTTP ${listRes.status}`;
        }
      } else {
        const listData = await listRes.json();
        for (const ref of (listData.messages || []).slice(0, 8)) {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(3500)
            }
          );
          if (!msgRes.ok) continue;
          const m = await msgRes.json();
          const headers = m.payload?.headers || [];
          const rawFrom = headers.find((h) => h.name.toLowerCase() === "from")?.value || "Unbekannt";
          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "(Kein Betreff)";
          const internalDateMs = Number(m.internalDate || 0);
          const timestamp = internalDateMs > 0 ? new Date(internalDateMs).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
          const emailMatch = rawFrom.match(/<([^>]+@[^>]+)>/);
          const emailAddr = emailMatch ? emailMatch[1].trim() : rawFrom.includes("@") ? rawFrom.trim() : "";
          const senderName = rawFrom.replace(/<[^>]+>/g, "").replace(/"/g, "").trim() || emailAddr || "E-Mail Kontakt";
          const contact = upsertContact({
            name: senderName,
            primary_channel: "GMAIL",
            email: emailAddr,
            role_or_relation: emailAddr ? `E-Mail \xB7 ${emailAddr}` : "Gmail API",
            source: "gmail_api"
          });
          const isUnread = Array.isArray(m.labelIds) && m.labelIds.includes("UNREAD");
          const inserted = insertMessageIfNew({
            external_id: `gmail_api_${ref.id}`,
            contact_id: contact.id,
            direction: "in",
            channel: "GMAIL",
            sender_name: senderName,
            subject,
            body: cleanNotificationText(m.snippet) || subject,
            read: isUnread ? 0 : 1,
            timestamp
          });
          if (inserted) ingestedMessages++;
        }
      }
    } catch (err) {
      gmailStatus = "scope_missing";
      gmailMessage = err instanceof Error ? err.message : String(err);
    }
    let peopleStatus = "scope_missing";
    try {
      const peopleRes = await fetch(
        "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,birthdays&pageSize=50",
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4e3)
        }
      );
      if (peopleRes.ok) {
        peopleStatus = "ok";
        const pData = await peopleRes.json();
        for (const person of pData.connections || []) {
          const displayName = person.names?.[0]?.displayName;
          if (!displayName) continue;
          const email = person.emailAddresses?.[0]?.value || "";
          const phone = person.phoneNumbers?.[0]?.value || "";
          upsertContact({
            name: displayName,
            email,
            phone,
            primary_channel: phone ? "WA" : "GMAIL",
            role_or_relation: email || phone || "Google Contacts",
            source: "google_people"
          });
        }
      }
    } catch {
    }
    return {
      gmailStatus,
      gmailMessage,
      peopleStatus,
      ingestedMessages
    };
  }
  async function ensureSystemWelcomeMessages() {
    const aisheCount = ctx.db.queryOne(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = 'aishe-ha'"
    );
    if ((aisheCount?.cnt ?? 0) === 0) {
      insertMessageIfNew({
        external_id: "sys_aishe_init",
        contact_id: "aishe-ha",
        direction: "in",
        channel: "HA",
        sender_name: "Aishe (Home & Pixel 10)",
        subject: "Pixel 10 & Home Assistant Bridge aktiv",
        body: "Direktkanal zu deinem Google Pixel 10 (notify.mobile_app_pixel_10) und Home Assistant OS. Nachrichten hier werden sofort als Push-Benachrichtigung oder App-Intent an dein Pixel 10 gesendet.",
        read: 1,
        timestamp: new Date(Date.now() - 72e5).toISOString()
      });
    }
    const cortexCount = ctx.db.queryOne(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = 'cortex-ai'"
    );
    if ((cortexCount?.cnt ?? 0) === 0) {
      insertMessageIfNew({
        external_id: "sys_cortex_init",
        contact_id: "cortex-ai",
        direction: "in",
        channel: "CORTEX",
        sender_name: "Cortex AI",
        subject: "Direkter KI-Kommunikationskanal",
        body: "Schreibe mir eine kurze Nachricht oder Frage \u2014 ich antworte direkt hier im Chat mit Zugriff auf deine Kontakte, Termine und Smart-Home-Sensoren.",
        read: 1,
        timestamp: new Date(Date.now() - 108e5).toISOString()
      });
    }
  }
  async function syncAllCommunications() {
    await ensureSystemWelcomeMessages();
    const [pixelRes, calCount, googleRes] = await Promise.all([
      syncPixel10LiveNotifications(),
      syncCalendarAndBirthdayContacts(),
      syncGoogleGmailAndPeople()
    ]);
    const allContacts = ctx.db.query("SELECT id FROM contacts");
    for (const c of allContacts) {
      recalculateContactMessageSummary(c.id);
    }
    const totalUnreadRow = ctx.db.queryOne(
      "SELECT COALESCE(SUM(unread_count), 0) as total FROM contacts"
    );
    const latestMsg = ctx.db.queryOne(
      "SELECT * FROM messages ORDER BY timestamp DESC, id DESC LIMIT 1"
    );
    try {
      const summaryPayload = {
        unreadCount: totalUnreadRow?.total ?? 0,
        totalContacts: allContacts.length,
        lastMessageSender: latestMsg?.sender_name || "",
        lastMessageChannel: latestMsg?.channel || "",
        lastMessagePreview: latestMsg?.body?.slice(0, 90) || "",
        lastMessageAt: latestMsg?.timestamp || "",
        pixelConnected: pixelRes.connected,
        syncedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      ctx.sharedDb.kvSet("thassi_contacts_summary", summaryPayload);
      await ctx.ha.publishSensor("unread_count", summaryPayload.unreadCount, {
        friendly_name: "Thassi Contacts Unread Messages",
        icon: "mdi:message-badge-outline",
        total_contacts: allContacts.length,
        last_sender: summaryPayload.lastMessageSender,
        last_channel: summaryPayload.lastMessageChannel,
        pixel_10_bridge: pixelRes.connected ? "connected" : "offline"
      });
    } catch {
    }
    _lastSyncSummary = {
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pixelConnected: pixelRes.connected,
      pixelActiveNotifs: pixelRes.activeCount,
      pixelPhoneState: pixelRes.phoneState,
      pixelDnd: pixelRes.dnd,
      pixelBattery: pixelRes.battery,
      pixelSim1: pixelRes.sim1,
      pixelSim2: pixelRes.sim2,
      gmailApiStatus: googleRes.gmailStatus,
      gmailApiMessage: googleRes.gmailMessage,
      peopleApiStatus: googleRes.peopleStatus,
      calendarContactsSynced: calCount,
      newMessagesIngested: pixelRes.ingestedCount + googleRes.ingestedMessages
    };
    return _lastSyncSummary;
  }
  void syncAllCommunications();
  ctx.scheduleJob({
    id: "sync-digital-communications",
    name: "Sync Pixel 10 Notifications, Gmail, Contacts & Publish HA Sensor",
    description: "Ingests live Android messaging & email notifications from Pixel 10 Companion, Gmail API, and Google Calendar contacts into the unified SQLite chat stream.",
    intervalMinutes: 2,
    handler: async () => {
      const s = await syncAllCommunications();
      return `Pixel10=${s.pixelConnected ? "OK" : "OFF"} (active=${s.pixelActiveNotifs}) | NewMsgs=${s.newMessagesIngested} | Gmail=${s.gmailApiStatus}`;
    }
  });
  ctx.route("GET", "/state", async (req) => {
    const forceSync = req.query.sync === "1" || req.query.sync === "true";
    if (forceSync || Date.now() - new Date(_lastSyncSummary.syncedAt).getTime() > 15e3) {
      await syncAllCommunications();
    }
    const contacts = ctx.db.query(`
      SELECT * FROM contacts
      ORDER BY
        CASE WHEN unread_count > 0 THEN 0 ELSE 1 END ASC,
        CASE WHEN last_message_at != '' THEN last_message_at ELSE '1970-01-01' END DESC,
        pinned DESC,
        name ASC
    `);
    const messages = ctx.db.query(`
      SELECT * FROM messages
      ORDER BY timestamp ASC, id ASC
      LIMIT 500
    `);
    const byChannelCounts = ctx.db.query(`
      SELECT channel, COUNT(*) as cnt FROM messages GROUP BY channel
    `);
    const channelCountMap = new Map(byChannelCounts.map((r) => [r.channel, r.cnt]));
    const geminiInfo = resolveGeminiKey();
    const oauthStatus = ctx.google.getStatus();
    const channels = [
      {
        id: "pixel_bridge",
        code: "PIXEL",
        name: "Google Pixel 10 Live Bridge (HA Companion)",
        status: _lastSyncSummary.pixelConnected ? "ok" : "warn",
        statusText: _lastSyncSummary.pixelConnected ? `Verbunden \xB7 ${_lastSyncSummary.pixelActiveNotifs} aktive Push-Notifs \xB7 Akku ${_lastSyncSummary.pixelBattery ?? "\u2014"}%` : "Keine Verbindung zu sensor.pixel_10_active_notification_count",
        detail: `Spiegelt eingehende Nachrichten von Snapchat, WhatsApp, Signal, Telegram, SMS & Gmail in Echtzeit vom Pixel 10 (${_lastSyncSummary.pixelSim1 || "SIM 1"} / ${_lastSyncSummary.pixelSim2 || "SIM 2"}).`,
        messagesCount: (channelCountMap.get("SNAP") || 0) + (channelCountMap.get("WA") || 0) + (channelCountMap.get("SMS") || 0) + (channelCountMap.get("TG") || 0) + (channelCountMap.get("SIGNAL") || 0) + (channelCountMap.get("PIXEL") || 0)
      },
      {
        id: "gmail_channel",
        code: "GMAIL",
        name: "Google Gmail (Push & REST API v1)",
        status: _lastSyncSummary.gmailApiStatus === "ok" ? "ok" : _lastSyncSummary.pixelConnected ? "ok" : "warn",
        statusText: _lastSyncSummary.gmailApiStatus === "ok" ? "Vollzugriff (gmail.readonly & gmail.send)" : "Aktiv via Pixel 10 Gmail-Bridge (Direkt-API Scope optional)",
        detail: _lastSyncSummary.gmailApiMessage || "Empf\xE4ngt E-Mails f\xFCr thomas.simhofer@gmail.com.",
        messagesCount: channelCountMap.get("GMAIL") || 0
      },
      {
        id: "calendar_people",
        code: "CAL",
        name: "Google Kalender & Kontakte-Synthese",
        status: "ok",
        statusText: "Synchronisiert (Shared Calendars & Geburtstage)",
        detail: "Verkn\xFCpft Kontakte aus leuthner.patricia@gmail.com, teebee, Familie und Geburtstage automatisch.",
        messagesCount: channelCountMap.get("CAL") || 0
      },
      {
        id: "cortex_ha",
        code: "CORTEX",
        name: "Cortex AI & Home Assistant Intercom",
        status: geminiInfo.key ? "ok" : "warn",
        statusText: geminiInfo.key ? `Bereit (${geminiInfo.source})` : "Lokaler Synthesizer aktiv",
        detail: "Erm\xF6glicht Direkt-Chats mit Cortex AI, Aishe und 1-Klick KI-Antwortentw\xFCrfe.",
        messagesCount: (channelCountMap.get("CORTEX") || 0) + (channelCountMap.get("HA") || 0)
      }
    ];
    const totalUnread = contacts.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    return {
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      syncSummary: _lastSyncSummary,
      kpis: {
        totalContacts: contacts.length,
        totalMessages: messages.length,
        unreadMessages: totalUnread,
        activeChannels: channels.filter((c) => c.status === "ok").length
      },
      credentials: {
        geminiConfigured: Boolean(geminiInfo.key),
        geminiSource: geminiInfo.source,
        googleOAuthAuthorized: oauthStatus.authorized,
        googleOAuthScopes: oauthStatus.scopes,
        gmailDirectSendReady: oauthStatus.scopes.includes("https://www.googleapis.com/auth/gmail.send") || _lastSyncSummary.gmailApiStatus === "ok"
      },
      channels,
      contacts,
      messages
    };
  });
  ctx.route("POST", "/sync", async () => {
    const summary = await syncAllCommunications();
    return { ok: true, summary };
  });
  ctx.route("POST", "/mark-read", async (req) => {
    const body = req.body || {};
    if (!body.contactId) return { status: 400, body: { error: "contactId required" } };
    ctx.db.execute(
      "UPDATE messages SET read = 1 WHERE contact_id = ? AND read = 0",
      [body.contactId]
    );
    recalculateContactMessageSummary(body.contactId);
    return { ok: true };
  });
  ctx.route("POST", "/contacts", async (req) => {
    const body = req.body || {};
    if (!body.name || !body.name.trim()) {
      return { status: 400, body: { error: "Name ist erforderlich" } };
    }
    const contact = upsertContact({
      id: body.id,
      name: body.name.trim(),
      role_or_relation: body.role_or_relation,
      primary_channel: body.primary_channel || "WA",
      email: body.email,
      phone: body.phone,
      whatsapp_handle: body.whatsapp_handle,
      snapchat_handle: body.snapchat_handle,
      telegram_handle: body.telegram_handle,
      birthday: body.birthday,
      notes: body.notes,
      pinned: body.pinned,
      source: "manual"
    });
    return { ok: true, contact };
  });
  ctx.route("DELETE", "/contacts", async (req) => {
    const id = String(req.query.id || "").trim();
    if (!id) return { status: 400, body: { error: "id required" } };
    ctx.db.execute("DELETE FROM messages WHERE contact_id = ?", [id]);
    ctx.db.execute("DELETE FROM contacts WHERE id = ?", [id]);
    return { ok: true, deletedId: id };
  });
  ctx.route("POST", "/send", async (req) => {
    const body = req.body || {};
    const contactId = String(body.contactId || "").trim();
    const text = String(body.text || "").trim();
    if (!contactId || !text) {
      return { status: 400, body: { error: "contactId and text are required" } };
    }
    const contact = ctx.db.queryOne(
      "SELECT * FROM contacts WHERE id = ?",
      [contactId]
    );
    if (!contact) {
      return { status: 404, body: { error: "Kontakt nicht gefunden" } };
    }
    const channel = body.channel || contact.primary_channel || "PIXEL";
    const subject = String(body.subject || "").trim();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let deliveryStatus = "sent";
    let dispatchNote = "";
    let launchUri = null;
    const outExtId = `out_${contactId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (channel === "GMAIL" && contact.email) {
      try {
        const token = await ctx.google.getValidAccessToken();
        const mailSubject = subject || `Nachricht von Thomas Simhofer`;
        const mimeMessage = [
          `To: ${contact.email}`,
          `Subject: =?utf-8?B?${Buffer.from(mailSubject, "utf8").toString("base64")}?=`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          text
        ].join("\r\n");
        const rawBase64Url = Buffer.from(mimeMessage, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ raw: rawBase64Url }),
          signal: AbortSignal.timeout(5e3)
        });
        if (res.ok) {
          deliveryStatus = "delivered_gmail_api";
          dispatchNote = `E-Mail via Gmail API an ${contact.email} gesendet`;
        } else {
          throw new Error(`Gmail HTTP ${res.status}`);
        }
      } catch {
        launchUri = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
          subject || "Nachricht"
        )}&body=${encodeURIComponent(text)}`;
        deliveryStatus = "bridged_pixel";
        dispatchNote = `An Pixel 10 \xFCbergeben (${contact.email})`;
        try {
          await ctx.ha.callService("notify", "mobile_app_pixel_10", {
            title: `E-Mail an ${contact.name}`,
            message: text,
            data: {
              clickAction: launchUri,
              tag: `thassi-mail-${contact.id}`
            }
          });
        } catch {
        }
      }
    } else if (contact.id === "cortex-ai" || channel === "CORTEX") {
      deliveryStatus = "delivered";
      dispatchNote = "An Cortex AI \xFCbermittelt";
    } else if (contact.id === "aishe-ha" || channel === "HA") {
      try {
        await ctx.ha.callService("notify", "mobile_app_pixel_10", {
          title: "Thassi Intercom \xB7 Aishe",
          message: text,
          data: { tag: "thassi-aishe-intercom" }
        });
        deliveryStatus = "delivered_pixel_push";
        dispatchNote = "Push-Nachricht an Pixel 10 zugestellt";
      } catch {
        try {
          await ctx.ha.callService("persistent_notification", "create", {
            title: `Thassi Chat: ${contact.name}`,
            message: text
          });
          deliveryStatus = "delivered_ha";
          dispatchNote = "Home Assistant Benachrichtigung erstellt";
        } catch {
          deliveryStatus = "logged";
        }
      }
    } else {
      const cleanPhone = (contact.phone || contact.whatsapp_handle || "").replace(/[^0-9+]/g, "");
      if (channel === "WA") {
        launchUri = cleanPhone ? `https://wa.me/${cleanPhone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}` : `https://web.whatsapp.com/`;
      } else if (channel === "SNAP") {
        launchUri = "https://web.snapchat.com/";
      } else if (channel === "TG") {
        launchUri = contact.telegram_handle ? `https://t.me/${contact.telegram_handle.replace(/^@/, "")}` : "https://web.telegram.org/";
      } else if (channel === "SMS" && cleanPhone) {
        launchUri = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
      }
      if (body.pushToPixel !== false) {
        try {
          const appClickAction = channel === "SNAP" ? "app://com.snapchat.android" : channel === "WA" ? "app://com.whatsapp" : channel === "TG" ? "app://org.telegram.messenger" : channel === "SIGNAL" ? "app://org.thoughtcrime.securesms" : launchUri || "app://com.google.android.apps.messaging";
          await ctx.ha.callService("notify", "mobile_app_pixel_10", {
            title: `${channel} \u2192 ${contact.name}`,
            message: text,
            data: {
              clickAction: appClickAction,
              tag: `thassi-chat-${contact.id}`,
              channel: "Thassi Contacts"
            }
          });
          deliveryStatus = "pushed_to_pixel_10";
          dispatchNote = `An Pixel 10 \xFCbergeben (${channel} \xF6ffnen)`;
        } catch {
          deliveryStatus = "logged";
          dispatchNote = "Lokal im Verlauf gespeichert";
        }
      }
    }
    insertMessageIfNew({
      external_id: outExtId,
      contact_id: contact.id,
      direction: "out",
      channel,
      sender_name: "Thomas",
      subject,
      body: text,
      read: 1,
      delivery_status: deliveryStatus,
      timestamp: nowIso
    });
    ctx.db.execute("UPDATE messages SET read = 1 WHERE contact_id = ? AND read = 0", [contact.id]);
    recalculateContactMessageSummary(contact.id);
    let autoReply = null;
    if (contact.id === "cortex-ai" || channel === "CORTEX") {
      const gemini = resolveGeminiKey();
      let replyText = "";
      try {
        if (gemini.key) {
          const history = ctx.db.query(
            "SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC LIMIT 6",
            [contact.id]
          ).reverse().map((m) => `${m.direction === "out" ? "Thomas" : "Cortex"}: ${m.body}`).join("\n");
          const res = await callGeminiGenerateContent({
            apiKey: gemini.key,
            model: "gemini-2.5-flash",
            systemInstruction: "Du bist Cortex im ultraminimalistischen Thassi Contacts Chat-Interface von Thomas Simhofer. Antworte extrem pr\xE4zise, direkt, ohne Emojis und in maximal 2\u20134 kurzen S\xE4tzen auf Deutsch.",
            prompt: `${history}

Antworte direkt auf die letzte Nachricht von Thomas:`,
            temperature: 0.25,
            timeoutMs: 12e3
          });
          replyText = res.text;
        }
      } catch {
      }
      if (!replyText) {
        replyText = `Verstanden: "${text}". Pixel 10 Bridge (${_lastSyncSummary.pixelConnected ? "verbunden" : "bereitschaft"}, ${_lastSyncSummary.pixelActiveNotifs} aktive Push-Notifications) und lokale Kontaktdatenbank sind synchronisiert.`;
      }
      const replyId = `in_cortex_${Date.now()}`;
      const replyTs = new Date(Date.now() + 200).toISOString();
      insertMessageIfNew({
        external_id: replyId,
        contact_id: contact.id,
        direction: "in",
        channel: "CORTEX",
        sender_name: "Cortex AI",
        body: replyText,
        read: 1,
        timestamp: replyTs
      });
      autoReply = ctx.db.queryOne("SELECT * FROM messages WHERE external_id = ?", [replyId]) || null;
    } else if (contact.id === "aishe-ha") {
      const replyId = `in_aishe_${Date.now()}`;
      const replyTs = new Date(Date.now() + 200).toISOString();
      const replyText = `Push-Nachricht "${text}" wurde an Google Pixel 10 (Akku: ${_lastSyncSummary.pixelBattery ?? "\u2014"}%, Status: ${_lastSyncSummary.pixelPhoneState}, DND: ${_lastSyncSummary.pixelDnd}) gesendet.`;
      insertMessageIfNew({
        external_id: replyId,
        contact_id: contact.id,
        direction: "in",
        channel: "HA",
        sender_name: "Aishe (Home & Pixel 10)",
        body: replyText,
        read: 1,
        timestamp: replyTs
      });
      autoReply = ctx.db.queryOne("SELECT * FROM messages WHERE external_id = ?", [replyId]) || null;
    }
    return {
      ok: true,
      deliveryStatus,
      dispatchNote,
      launchUri,
      autoReply
    };
  });
  ctx.route("POST", "/ai-draft", async (req) => {
    const body = req.body || {};
    const contactId = String(body.contactId || "").trim();
    const contact = ctx.db.queryOne("SELECT * FROM contacts WHERE id = ?", [contactId]);
    if (!contact) return { status: 404, body: { error: "Kontakt nicht gefunden" } };
    const recent = ctx.db.query(
      "SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC, id DESC LIMIT 5",
      [contactId]
    ).reverse();
    const gemini = resolveGeminiKey();
    if (gemini.key && recent.length > 0) {
      try {
        const transcript = recent.map((m) => `[${m.channel}] ${m.direction === "out" ? "Thomas" : m.sender_name}: ${m.body}`).join("\n");
        const res = await callGeminiGenerateContent({
          apiKey: gemini.key,
          model: "gemini-2.5-flash",
          systemInstruction: "Formuliere eine kurze, nat\xFCrliche Antwort von Thomas auf Deutsch (1\u20132 S\xE4tze, keine Emojis, keine Anf\xFChrungszeichen, direkt sendefertig).",
          prompt: `Kontakt: ${contact.name} (${contact.role_or_relation})
Letzte Nachrichten:
${transcript}

Antwort-Entwurf von Thomas:`,
          temperature: 0.3,
          timeoutMs: 8e3
        });
        if (res.text) {
          return { ok: true, draft: res.text.replace(/^["']|["']$/g, "").trim(), source: res.modelUsed };
        }
      } catch {
      }
    }
    const lastMsg = recent[recent.length - 1];
    const fallbackDraft = lastMsg ? `Hallo ${contact.name.split(" ")[0]}, danke f\xFCr deine Nachricht \u2014 ich melde mich gleich bei dir.` : `Hallo ${contact.name.split(" ")[0]}, wie sieht es bei dir aus?`;
    return { ok: true, draft: fallbackDraft, source: "local-template" };
  });
  ctx.route("GET", "/google-oauth-url", async (req) => {
    try {
      const redirectUri = String(
        req.query.redirectUri || "http://192.168.188.92:8099/api/system/google/callback"
      );
      ctx.google.saveConfig({
        redirectUri,
        scopes: FULL_COMM_GOOGLE_SCOPES
      });
      const url = ctx.google.getAuthorizationUrl(FULL_COMM_GOOGLE_SCOPES);
      return { ok: true, url, redirectUri, scopes: FULL_COMM_GOOGLE_SCOPES };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  });
});
export {
  index_default as default
};
