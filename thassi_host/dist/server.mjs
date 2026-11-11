import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// thassi_host/src/server.ts
import http from "node:http";
import fs4 from "node:fs";
import os2 from "node:os";
import path4 from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

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
    db.exec("PRAGMA synchronous = OFF;");
    db.exec("PRAGMA temp_store = MEMORY;");
    db.exec("PRAGMA wal_autocheckpoint = 4000;");
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

// packages/sdk/src/ha-bridge.ts
var ThassiHaBridge = class {
  appId;
  sharedDb;
  constructor(appId, sharedDb2) {
    this.appId = appId.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    this.sharedDb = sharedDb2;
  }
  getCredentials() {
    const supervisorToken = process.env.SUPERVISOR_TOKEN;
    if (supervisorToken) {
      return {
        baseUrl: "http://supervisor/core/api",
        token: supervisorToken,
        mode: "supervisor"
      };
    }
    const savedConfig = this.sharedDb.kvGet("ha_connection");
    const haUrl = (savedConfig?.haUrl || process.env.HA_URL || "http://192.168.188.92:8123").replace(/\/+$/, "");
    const haToken = savedConfig?.haToken || process.env.HA_TOKEN || "";
    if (haToken) {
      return {
        baseUrl: `${haUrl}/api`,
        token: haToken,
        mode: "token"
      };
    }
    return {
      baseUrl: `${haUrl}/api`,
      token: "",
      mode: "unconfigured"
    };
  }
  async request(endpoint, init = {}) {
    const { baseUrl, token, mode } = this.getCredentials();
    if (mode === "unconfigured" || !token) {
      throw new Error(
        "Home Assistant API token is not configured. In Home Assistant OS this is injected automatically via SUPERVISOR_TOKEN; for local dev, configure HA_TOKEN in Thassi Hub Settings or .env."
      );
    }
    const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(3500),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers || {}
      }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HA API ${res.status} (${endpoint}): ${body || res.statusText}`);
    }
    return await res.json();
  }
  /** Check connectivity to Home Assistant API */
  async getStatus() {
    const { baseUrl, mode } = this.getCredentials();
    const displayUrl = baseUrl.replace(/\/api$/, "");
    if (mode === "unconfigured") {
      return {
        connected: false,
        mode: "unconfigured",
        haUrl: displayUrl,
        message: "No SUPERVISOR_TOKEN or HA_TOKEN configured yet."
      };
    }
    try {
      const config = await this.request("/config");
      return {
        connected: true,
        mode,
        haUrl: displayUrl,
        version: config.version,
        message: `Connected to ${config.location_name || "Home Assistant"} (v${config.version || "unknown"})`
      };
    } catch (err) {
      return {
        connected: false,
        mode,
        haUrl: displayUrl,
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }
  /** Fetch all states or filter by domain (e.g. 'light', 'sensor', 'calendar', 'weather') */
  async getStates(domainFilter) {
    const states = await this.request("/states");
    if (!domainFilter) return states;
    const prefix = `${domainFilter.toLowerCase()}.`;
    return states.filter((s) => s.entity_id.toLowerCase().startsWith(prefix));
  }
  /** Fetch a single entity state */
  async getState(entityId) {
    return this.request(`/states/${encodeURIComponent(entityId)}`);
  }
  /** Fetch events from a Home Assistant calendar.* entity over [startIso, endIso] */
  async getCalendarEvents(entityId, startIso, endIso) {
    return this.request(
      `/calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );
  }
  /** Call a Home Assistant service (e.g. domain='light', service='toggle', data={ entity_id: 'light.office' }) */
  async callService(domain, service, serviceData = {}) {
    return this.request(`/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: "POST",
      body: JSON.stringify(serviceData)
    });
  }
  /**
   * Publish or update a custom sensor in Home Assistant scoped to this app.
   * Creates `sensor.thassi_<appId>_<sensorSlug>` in Home Assistant so dashboards & automations can use it!
   */
  async publishSensor(sensorSlug, state, attributes = {}) {
    const cleanSlug = sensorSlug.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const entityId = `sensor.thassi_${this.appId}_${cleanSlug}`;
    const payload = {
      state: String(state),
      attributes: {
        friendly_name: attributes.friendly_name || `Thassi ${this.appId} ${cleanSlug}`,
        icon: attributes.icon || "mdi:database-check",
        source_app: this.appId,
        updated_by: "thassi",
        ...attributes
      }
    };
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const result = await this.request(`/states/${entityId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const published = this.sharedDb.kvGet("published_sensors", {}) || {};
    published[entityId] = {
      entityId,
      appId: this.appId,
      state: String(state),
      updatedAt: nowIso
    };
    this.sharedDb.kvSet("published_sensors", published);
    return result;
  }
  /** Fire a custom event on the Home Assistant event bus */
  async fireEvent(eventType, eventData = {}) {
    const fullType = eventType.startsWith("thassi_") ? eventType : `thassi_${this.appId}_${eventType}`;
    return this.request(`/events/${encodeURIComponent(fullType)}`, {
      method: "POST",
      body: JSON.stringify(eventData)
    });
  }
};

// packages/sdk/src/cron.ts
var ThassiCronScheduler = class {
  jobs = /* @__PURE__ */ new Map();
  makeKey(appId, jobId) {
    return `${appId}:${jobId}`;
  }
  registerJob(appId, def) {
    const key = this.makeKey(appId, def.id);
    const existing = this.jobs.get(key);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }
    const state = {
      id: def.id,
      appId,
      name: def.name,
      description: def.description,
      intervalMinutes: def.intervalMinutes,
      status: "idle",
      lastRunAt: existing?.state.lastRunAt ?? null,
      lastDurationMs: existing?.state.lastDurationMs ?? null,
      lastResult: existing?.state.lastResult ?? null,
      lastError: existing?.state.lastError ?? null,
      runCount: existing?.state.runCount ?? 0
    };
    const entry = { appId, def, state };
    if (def.intervalMinutes > 0) {
      const ms = Math.max(1e4, def.intervalMinutes * 60 * 1e3);
      entry.timer = setInterval(() => {
        void this.triggerJob(appId, def.id);
      }, ms);
    }
    this.jobs.set(key, entry);
    if (def.runOnStart) {
      setTimeout(() => {
        void this.triggerJob(appId, def.id);
      }, 500);
    }
  }
  async triggerJob(appId, jobId) {
    const key = this.makeKey(appId, jobId);
    const entry = this.jobs.get(key);
    if (!entry) {
      throw new Error(`Job "${jobId}" not found for app "${appId}"`);
    }
    if (entry.state.status === "running") {
      return entry.state;
    }
    const start = Date.now();
    entry.state.status = "running";
    entry.state.lastRunAt = (/* @__PURE__ */ new Date()).toISOString();
    entry.state.lastError = null;
    try {
      const res = await entry.def.handler();
      entry.state.status = "success";
      entry.state.lastDurationMs = Date.now() - start;
      entry.state.lastResult = typeof res === "string" ? res : "Completed successfully";
      entry.state.runCount += 1;
    } catch (err) {
      entry.state.status = "error";
      entry.state.lastDurationMs = Date.now() - start;
      entry.state.lastError = err instanceof Error ? err.message : String(err);
      entry.state.runCount += 1;
    }
    return entry.state;
  }
  listJobs(appId) {
    const all = Array.from(this.jobs.values()).map((e) => e.state);
    return appId ? all.filter((j) => j.appId === appId) : all;
  }
  clearAppJobs(appId) {
    for (const [key, entry] of this.jobs.entries()) {
      if (entry.appId === appId) {
        if (entry.timer) clearInterval(entry.timer);
        this.jobs.delete(key);
      }
    }
  }
};

// packages/sdk/src/google-oauth.ts
var DEFAULT_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly"
];
var ThassiGoogleOAuthManager = class {
  sharedDb;
  constructor(sharedDb2) {
    this.sharedDb = sharedDb2;
  }
  getConfig() {
    return this.sharedDb.kvGet("google_oauth_config");
  }
  saveConfig(config) {
    const current = this.getConfig() || {
      clientId: "",
      clientSecret: "",
      redirectUri: "http://localhost:8099/api/system/google/callback",
      scopes: DEFAULT_GOOGLE_SCOPES
    };
    const updated = {
      clientId: (config.clientId ?? current.clientId).trim(),
      clientSecret: (config.clientSecret ?? current.clientSecret).trim(),
      redirectUri: (config.redirectUri ?? current.redirectUri).trim(),
      scopes: config.scopes && config.scopes.length > 0 ? config.scopes : current.scopes
    };
    this.sharedDb.kvSet("google_oauth_config", updated);
    return this.getStatus();
  }
  getTokens() {
    return this.sharedDb.kvGet("google_oauth_tokens");
  }
  saveTokens(tokens) {
    const existing = this.getTokens();
    this.sharedDb.kvSet("google_oauth_tokens", {
      ...tokens,
      refreshToken: tokens.refreshToken || existing?.refreshToken
    });
  }
  clearTokens() {
    this.sharedDb.kvDelete("google_oauth_tokens");
  }
  getStatus() {
    const cfg = this.getConfig();
    const tokens = this.getTokens();
    return {
      configured: Boolean(cfg?.clientId && cfg?.clientSecret),
      authorized: Boolean(tokens?.refreshToken || tokens?.accessToken),
      clientId: cfg?.clientId ? `${cfg.clientId.slice(0, 12)}...` : void 0,
      redirectUri: cfg?.redirectUri,
      scopes: cfg?.scopes || DEFAULT_GOOGLE_SCOPES,
      expiresAt: tokens?.expiryDate ? new Date(tokens.expiryDate).toISOString() : null
    };
  }
  /** Build the Google OAuth2 consent screen URL */
  getAuthorizationUrl(extraScopes = []) {
    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error("Google OAuth Client ID and Secret are not configured yet in Thassi Hub.");
    }
    const scopes = Array.from(/* @__PURE__ */ new Set([...cfg.scopes || DEFAULT_GOOGLE_SCOPES, ...extraScopes]));
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: scopes.join(" ")
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  /** Exchange authorization code for access + refresh tokens */
  async exchangeCode(code) {
    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error("Google OAuth Client ID and Secret are not configured.");
    }
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to exchange Google OAuth code: ${errText}`);
    }
    const data = await res.json();
    this.saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiryDate: Date.now() + (data.expires_in - 60) * 1e3,
      scope: data.scope,
      tokenType: data.token_type
    });
    return this.getStatus();
  }
  /** Automatically returns a valid access token, refreshing it if expired */
  async getValidAccessToken() {
    const tokens = this.getTokens();
    if (!tokens) {
      throw new Error("Google account is not connected yet. Authorize in Thassi Hub Settings.");
    }
    if (tokens.accessToken && tokens.expiryDate > Date.now()) {
      return tokens.accessToken;
    }
    if (!tokens.refreshToken) {
      throw new Error("Google access token expired and no refresh token is available.");
    }
    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error("Google OAuth Client ID and Secret are missing.");
    }
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to refresh Google token: ${errText}`);
    }
    const data = await res.json();
    this.saveTokens({
      accessToken: data.access_token,
      refreshToken: tokens.refreshToken,
      expiryDate: Date.now() + (data.expires_in - 60) * 1e3,
      scope: data.scope ?? tokens.scope,
      tokenType: data.token_type ?? tokens.tokenType
    });
    return data.access_token;
  }
  /** Make an authenticated Google API request from any Thassi app (Calendar, Fitness/Health, etc.) */
  async googleFetch(url, init = {}) {
    const token = await this.getValidAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers || {}
      }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google API ${res.status}: ${body || res.statusText}`);
    }
    return await res.json();
  }
  /** Convenience helper to fetch upcoming Google Calendar events */
  async fetchUpcomingCalendarEvents(maxResults = 15) {
    const params = new URLSearchParams({
      timeMin: (/* @__PURE__ */ new Date()).toISOString(),
      maxResults: String(maxResults),
      singleEvents: "true",
      orderBy: "startTime"
    });
    const data = await this.googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`);
    return (data.items || []).map((item) => ({
      id: item.id,
      summary: item.summary || "(No title)",
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location,
      description: item.description
    }));
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
  constructor(sharedDb2, ha, google) {
    this.sharedDb = sharedDb2;
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
    try {
      return await this.google.getValidAccessToken();
    } catch (err) {
      if (explicitToken && explicitToken.trim()) {
        return explicitToken.trim();
      }
      throw err;
    }
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
      name: "Entit\xE4tsstatus lesen",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Liest den aktuellen Live-Status, die Messeinheit und alle Attribute einer einzelnen Home Assistant Entit\xE4t aus.",
      defaultInput: { entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur" },
      fields: [
        {
          key: "entityId",
          label: "Entit\xE4ts-ID",
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
      name: "Entit\xE4ten nach Dom\xE4ne & Suche abfragen",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Filtert alle 597+ Home Assistant Entit\xE4ten nach Dom\xE4ne (sensor, switch, light, camera, binary_sensor) und Suchbegriff.",
      defaultInput: { domain: "sensor", search: "", limit: "50" },
      fields: [
        { key: "domain", label: "Dom\xE4ne (optional)", type: "text", placeholder: "sensor / switch / light / camera" },
        { key: "search", label: "Suchfilter (optional)", type: "text", placeholder: "shelly / pixel / power" },
        { key: "limit", label: "Max. Zeilen", type: "number", placeholder: "50" }
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
      name: "Shelly & Smart Home Live-Leistung",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Aggregiert alle aktiven Leistungssensoren (W) und Energiez\xE4hler (kWh/Wh) s\xE4mtlicher Shelly-Relais und Zwischenstecker.",
      defaultInput: { includeZero: "true" },
      fields: [
        { key: "includeZero", label: "0-W-Kan\xE4le einbeziehen", type: "select", options: ["true", "false"] }
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
      name: "Raum- & Ger\xE4te-Momentaufnahme",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Liefert aktuelle Raumtemperaturen, Luftfeuchtigkeit, Schalterzust\xE4nde und Stromverbrauch gruppiert nach R\xE4umen.",
      defaultInput: { roomFilter: "" },
      fields: [
        { key: "roomFilter", label: "Raum-Filter (optional)", type: "text", placeholder: "buro_og / wohnkuche / vorzimmer_og" }
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
              buildDev("switch.buro_og_bewasserung_pumpe", "Home Assistant PC (Watchdog .100)", "sensor.schalter_neu_power"),
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
      name: "Dienst aufrufen / Ger\xE4t schalten",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "F\xFChrt einen beliebigen Home Assistant Dienst aus (Licht, Schalter, Skript, Automation, Mediaplayer oder Benachrichtigung).",
      defaultInput: {
        domain: "persistent_notification",
        service: "create",
        targetOrMessage: "{{$input}}"
      },
      fields: [
        {
          key: "domain",
          label: "Dom\xE4ne",
          type: "select",
          options: ["persistent_notification", "light", "switch", "script", "automation", "media_player", "siren"]
        },
        {
          key: "service",
          label: "Dienst (Service)",
          type: "select",
          options: ["create", "turn_on", "turn_off", "toggle", "trigger"]
        },
        {
          key: "targetOrMessage",
          label: "Entit\xE4ts-ID, Nachricht oder JSON-Payload",
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
      name: "Eigenen Sensor ver\xF6ffentlichen",
      domainCode: "HA",
      category: "homeassistant",
      icon: "HA",
      description: "Erstellt oder aktualisiert eine benutzerdefinierte sensor.thassi_*-Entit\xE4t direkt in Home Assistant.",
      defaultInput: {
        sensorSlug: "custom_metric",
        state: "100",
        unit: "",
        friendlyName: "Thassi Metric"
      },
      fields: [
        { key: "sensorSlug", label: "Sensor-Kennung (Slug)", type: "text", placeholder: "custom_metric" },
        { key: "state", label: "Zustandswert", type: "text", placeholder: "42.5 or {{$input}}" },
        { key: "unit", label: "Messeinheit", type: "text", placeholder: "EUR / W / %" },
        { key: "friendlyName", label: "Anzeigename", type: "text", placeholder: "Thassi Metric" }
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
      name: "Wearables & Mobil-Telemetrie (Pixel 10 / Watch)",
      domainCode: "FIT",
      category: "fitness",
      icon: "FIT",
      description: "Liest Live-Schritte, Herzfrequenz, Akkustand, Schlaf- und Aktivit\xE4tsdaten von Pixel 10, Pixel Watch und iPad aus Home Assistant.",
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
      name: "Kalender: Kommende Termine",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Ruft anstehende Termine \xFCber die Google Calendar REST API v3 oder lokale Home Assistant Kalender-Entit\xE4ten ab.",
      defaultInput: { calendarId: "primary", maxResults: "10" },
      fields: [
        { key: "calendarId", label: "Kalender-ID", type: "text", placeholder: "primary" },
        { key: "maxResults", label: "Max. Termine", type: "number", placeholder: "10" }
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
      name: "Kalender: Termin erstellen",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Legt einen neuen Kalendereintrag mit Startzeit, Dauer und Beschreibung in Google Calendar oder Home Assistant an.",
      defaultInput: {
        calendarId: "primary",
        summary: "{{$input}}",
        startIso: "",
        durationMinutes: "30",
        description: ""
      },
      fields: [
        { key: "calendarId", label: "Kalender-ID", type: "text", placeholder: "primary" },
        { key: "summary", label: "Titel / Betreff", type: "text", placeholder: "Meeting / Task" },
        { key: "startIso", label: "Startzeit ISO (leer = in 1 Std.)", type: "text", placeholder: "2026-10-20T14:00:00+02:00" },
        { key: "durationMinutes", label: "Dauer (Min.)", type: "number", placeholder: "30" },
        { key: "description", label: "Beschreibung", type: "textarea", placeholder: "Notes" }
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
      name: "Kalender: Termin l\xF6schen",
      domainCode: "GCAL",
      category: "gcal",
      icon: "GCAL",
      description: "Entfernt einen bestehenden Termin anhand seiner Event-ID aus dem Google Kalender.",
      defaultInput: { calendarId: "primary", eventId: "" },
      fields: [
        { key: "calendarId", label: "Kalender-ID", type: "text", placeholder: "primary" },
        { key: "eventId", label: "Termin-ID (Event ID)", type: "text", placeholder: "Google Event ID", required: true }
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
      name: "Google Fit & Biometrie-Tagesbilanz",
      domainCode: "FIT",
      category: "fitness",
      icon: "FIT",
      description: "Fragt aggregierte Gesundheitsdaten (Schritte, Kalorien, Puls) \xFCber die Google Fitness API ab und kombiniert sie mit lokalen SQLite-Vitaldaten.",
      defaultInput: { days: "7" },
      fields: [
        { key: "days", label: "R\xFCckblick (Tage)", type: "number", placeholder: "7" }
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
      name: "Gmail: Nachrichten suchen & abrufen",
      domainCode: "GMAIL",
      category: "gmail",
      icon: "GMAIL",
      description: "Durchsucht das Gmail-Postfach \xFCber die REST API v1 nach ungelesenen oder gefilterten E-Mails inklusive Betreff und Vorschau.",
      defaultInput: { query: "is:unread label:INBOX", maxResults: "5" },
      fields: [
        { key: "query", label: "Suchabfrage", type: "text", placeholder: "is:unread label:INBOX" },
        { key: "maxResults", label: "Max. Ergebnisse", type: "number", placeholder: "5" }
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
      name: "Gmail: E-Mail senden",
      domainCode: "GMAIL",
      category: "gmail",
      icon: "GMAIL",
      description: "Versendet eine E-Mail (RFC-2822) direkt \xFCber das verkn\xFCpfte Google-Konto per Gmail REST API v1.",
      defaultInput: {
        to: "thomas.simhofer@gmail.com",
        subject: "Thassi Notification",
        body: "{{$input}}"
      },
      fields: [
        { key: "to", label: "Empf\xE4nger (An)", type: "text", placeholder: "thomas.simhofer@gmail.com", required: true },
        { key: "subject", label: "Betreff", type: "text", placeholder: "Thassi Notification" },
        { key: "body", label: "Nachrichtentext", type: "textarea", placeholder: "{{$input}}" }
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
      name: "Google Drive: Zuletzt ge\xE4nderte Dateien",
      domainCode: "DRIVE",
      category: "drive",
      icon: "DRIVE",
      description: "Listet k\xFCrzlich bearbeitete Dokumente, Tabellen und Ordner aus Google Drive v3 inklusive Direktlinks auf.",
      defaultInput: { pageSize: "15", query: "trashed = false" },
      fields: [
        { key: "pageSize", label: "Max. Dateien", type: "number", placeholder: "15" },
        { key: "query", label: "Drive-Suchfilter (q)", type: "text", placeholder: "trashed = false" }
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
      name: "Finanzen: Cashflow- & Kontostand-KPIs",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Liest aktuellen Kontostand, Tages-/Wochen-/Monatsausgaben, Netto-Cashflow sowie Kategorie-Budgets aus der Finanz-Datenbank.",
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
      name: "Finanzen: Buchungen im Hauptbuch suchen",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Durchsucht das SQLite-Transaktionsregister nach Empf\xE4nger, Verwendungszweck, Kategorie oder Mindestbetrag.",
      defaultInput: { search: "", category: "", limit: "30" },
      fields: [
        { key: "search", label: "Empf\xE4nger / Notiz", type: "text", placeholder: "SPAR / HOFER / AREC" },
        { key: "category", label: "Kategorie", type: "text", placeholder: "Groceries / Housing" },
        { key: "limit", label: "Max. Anzahl", type: "number", placeholder: "30" }
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
      name: "Ern\xE4hrung: 7-Tage-Wochenplan & Makros",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Liest den aktuellen Wochenplan, hinterlegte Rezepte sowie die t\xE4gliche Kalorien- und Makron\xE4hrstoffbilanz aus dem Meal-Planner.",
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
      name: "Ern\xE4hrung: Einkaufsliste & Vorrat verwalten",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Liest, erg\xE4nzt oder leert Positionen auf der persistenten Einkaufsliste.",
      defaultInput: { action: "list", itemName: "", category: "Frische & Markt" },
      fields: [
        { key: "action", label: "Aktion", type: "select", options: ["list", "add", "clear_checked"] },
        { key: "itemName", label: "Artikelname (beim Hinzuf\xFCgen)", type: "text", placeholder: "Bio Hafermilch 1L" },
        { key: "category", label: "Kategorie", type: "text", placeholder: "Frische & Markt" }
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
      name: "OpenFoodFacts: EAN-N\xE4hrwertabfrage",
      domainCode: "MEALS",
      category: "food",
      icon: "MEALS",
      description: "Ermittelt N\xE4hrwerte (kcal, Protein, Kohlenhydrate, Fett, Ballaststoffe) und Nutri-Score zu jedem Lebensmittel-Barcode \xFCber OpenFoodFacts v2.",
      defaultInput: { barcode: "5449000000996" },
      fields: [
        { key: "barcode", label: "EAN- / GTIN-Barcode", type: "text", placeholder: "5449000000996", required: true }
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
      name: "BambuLab X1C: LAN-Status & Drucktelemetrie",
      domainCode: "3DP",
      category: "bambu",
      icon: "3DP",
      description: "Pr\xFCft den BambuLab 3D-Drucker im LAN (MQTT TLS :8883 / FTPS :990), liest den Shelly-Leistungswert und liefert aktive Druckprojekte.",
      defaultInput: { printerIp: "192.168.188.175", shellyEntity: "switch.buro_og_plug_90" },
      fields: [
        { key: "printerIp", label: "Drucker-IP-Adresse", type: "text", placeholder: "192.168.188.175" },
        { key: "shellyEntity", label: "Shelly-Steckdosen-Entit\xE4t", type: "text", placeholder: "switch.buro_og_plug_90" }
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
      name: "Kamera-Vision: Letzte Objekterkennungen",
      domainCode: "VISION",
      category: "vision",
      icon: "VISION",
      description: "Liest die neuesten COCO-SSD-Objekterkennungen, Bewegungswerte, Kamera-Schwellwerte und Trigger-Zusammenfassungen aus.",
      defaultInput: { limit: "15", cameraId: "" },
      fields: [
        { key: "cameraId", label: "Kamera-ID (optional)", type: "text", placeholder: "camera.cam_eg_vz_eingang" },
        { key: "limit", label: "Max. Erkennungen", type: "number", placeholder: "15" }
      ],
      execute: async (input, ctx) => {
        const limit = Math.max(1, Math.min(100, Number(input.limit || 15)));
        const camFilter = String(input.cameraId || "").trim();
        const visDb = openAppDatabaseReadWrite(ctx.dataDir, "camera-vision");
        const cameras = visDb.query(
          "SELECT * FROM camera_sources ORDER BY enabled DESC, name ASC"
        );
        const detections = camFilter ? visDb.query(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, scene_summary, total_objects, person_count, vehicle_count, motion_pct, engine_used, processing_ms
               FROM vision_detections WHERE camera_id = ? ORDER BY id DESC LIMIT ?`,
          [camFilter, limit]
        ) : visDb.query(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, scene_summary, total_objects, person_count, vehicle_count, motion_pct, engine_used, processing_ms
               FROM vision_detections ORDER BY id DESC LIMIT ?`,
          [limit]
        );
        const perfSummary = ctx.sharedDb.kvGet("camera_vision_performance") || null;
        return {
          summary: `${detections.length} detections across ${cameras.length} configured cameras`,
          data: { cameras, detections, performance: perfSummary }
        };
      }
    });
    this.register({
      id: "vision.camera.configure",
      name: "Kamera-Vision: Bildanalyse & Schwellwerte konfigurieren",
      domainCode: "VISION",
      category: "vision",
      icon: "VISION",
      description: "Liest oder aktualisiert pro Kamera Erkennungsschwellwerte (Min-Konfidenz, Motion-Gate, Bewegungs-Delta %, Luma-Schwelle, KI-Aufl\xF6sung).",
      defaultInput: {
        action: "get",
        cameraId: "camera.cam_eg_vz_eingang",
        optimizationMode: "Personen",
        minConfidence: "0.25",
        motionGateEnabled: "true",
        motionThresholdPct: "0.8",
        pixelDiffThreshold: "15",
        aiInputWidth: "300"
      },
      fields: [
        { key: "action", label: "Modus", type: "select", options: ["get", "update"] },
        { key: "cameraId", label: "Kamera-ID", type: "text", placeholder: "camera.cam_eg_vz_eingang", required: true },
        { key: "optimizationMode", label: "Profil", type: "select", options: ["Personen", "Fahrzeuge", "Objekte", "Kamera", "Aktivit\xE4ten"] },
        { key: "minConfidence", label: "Min. Konfidenz (0.10 - 0.95)", type: "text", placeholder: "0.25" },
        { key: "motionGateEnabled", label: "Motion-Gate aktiv", type: "select", options: ["true", "false"] },
        { key: "motionThresholdPct", label: "Bewegungs-Schwellwert (%)", type: "text", placeholder: "0.8" },
        { key: "pixelDiffThreshold", label: "Pixel-Luma-Schwelle (4-80)", type: "number", placeholder: "15" },
        { key: "aiInputWidth", label: "KI-Aufl\xF6sung (px)", type: "select", options: ["224", "300", "416"] }
      ],
      execute: async (input, ctx) => {
        const visDb = openAppDatabaseReadWrite(ctx.dataDir, "camera-vision");
        const camId = String(input.cameraId || "camera.cam_eg_vz_eingang").trim();
        const act = String(input.action || "get").trim().toLowerCase();
        if (act === "update") {
          const minConf = Math.max(0.1, Math.min(0.95, Number(input.minConfidence) || 0.25));
          const gate = String(input.motionGateEnabled) === "false" ? 0 : 1;
          const motionThresh = Math.max(0.1, Math.min(25, Number(input.motionThresholdPct) || 0.8));
          const pixelDiff = Math.max(4, Math.min(80, Number(input.pixelDiffThreshold) || 15));
          const aiW = [224, 300, 416].includes(Number(input.aiInputWidth)) ? Number(input.aiInputWidth) : 300;
          const mode = String(input.optimizationMode || "Personen");
          visDb.execute(
            `UPDATE camera_sources
             SET optimization_mode = ?, min_confidence = ?, motion_gate_enabled = ?, motion_threshold_pct = ?, pixel_diff_threshold = ?, ai_input_width = ?
             WHERE id = ?`,
            [mode, minConf, gate, motionThresh, pixelDiff, aiW, camId]
          );
        }
        const cam = visDb.queryOne(
          "SELECT * FROM camera_sources WHERE id = ?",
          [camId]
        );
        if (!cam) {
          throw new Error(`Camera "${camId}" not found`);
        }
        return {
          summary: `${cam.name} (${cam.id}): Mode=${cam.optimization_mode}, Conf>=${Math.round(Number(cam.min_confidence ?? 0.25) * 100)}%, MotionGate=${cam.motion_gate_enabled ? "ON" : "OFF"} (\u0394>=${cam.motion_threshold_pct ?? 0.8}%)`,
          data: { camera: cam }
        };
      }
    });
    this.register({
      id: "vision.triggers.manage",
      name: "Kamera-Vision: Objekt-Trigger & Aktionen verwalten",
      domainCode: "VISION",
      category: "vision",
      icon: "VISION",
      description: "Verwaltet Vision-Trigger (\u201EObjekt X zu >= p% erkannt => Aktion A ausf\xFChren\u201C) und liest das Trigger-Ausf\xFChrungsprotokoll.",
      defaultInput: {
        action: "list",
        name: "Person im Garten erkannt (>= 65%)",
        cameraId: "*",
        objectClass: "person",
        minConfidencePct: "65",
        actionType: "axon",
        actionTarget: "ha.call_service",
        actionPayloadJson: '{"domain":"persistent_notification","service":"create","targetOrMessage":"[Vision] {{object_label}} ({{confidence_pct}}%) auf {{camera_name}}"}'
      },
      fields: [
        { key: "action", label: "Aktion", type: "select", options: ["list", "create", "delete"] },
        { key: "name", label: "Regel-Name (bei create)", type: "text", placeholder: "Person erkannt -> Licht an" },
        { key: "cameraId", label: "Kamera-ID (* f\xFCr alle)", type: "text", placeholder: "* oder camera.cam_eg_vz_eingang" },
        { key: "objectClass", label: "Objektklasse", type: "select", options: ["person", "car", "truck", "bicycle", "dog", "cat", "backpack", "any_vehicle", "any_animal", "any_object", "motion_only"] },
        { key: "minConfidencePct", label: "Min. Wahrscheinlichkeit (%)", type: "number", placeholder: "65" },
        { key: "actionType", label: "Aktionstyp", type: "select", options: ["axon", "ha_service", "ha_event", "orchestrator_event"] },
        { key: "actionTarget", label: "Ziel-Axon oder HA-Service", type: "text", placeholder: "ha.call_service / light.turn_on" },
        { key: "actionPayloadJson", label: "Aktions-Payload (JSON)", type: "textarea", placeholder: "{}" }
      ],
      execute: async (input, ctx) => {
        const visDb = openAppDatabaseReadWrite(ctx.dataDir, "camera-vision");
        const act = String(input.action || "list").trim().toLowerCase();
        if (act === "create" && String(input.name || "").trim()) {
          visDb.execute(
            `INSERT INTO vision_triggers
             (name, enabled, camera_id, object_class, min_confidence_pct, min_count, min_motion_pct, time_window, cooldown_sec, action_type, action_target, action_payload_json, created_at)
             VALUES (?, 1, ?, ?, ?, 1, 0.5, 'always', 60, ?, ?, ?, ?)`,
            [
              String(input.name).trim(),
              String(input.cameraId || "*").trim(),
              String(input.objectClass || "person").trim(),
              Math.max(10, Math.min(99, Number(input.minConfidencePct) || 65)),
              String(input.actionType || "axon").trim(),
              String(input.actionTarget || "ha.call_service").trim(),
              String(input.actionPayloadJson || "{}").trim(),
              (/* @__PURE__ */ new Date()).toISOString()
            ]
          );
        } else if (act === "delete" && input.triggerId) {
          visDb.execute("DELETE FROM vision_triggers WHERE id = ?", [Number(input.triggerId)]);
        }
        const triggers = visDb.query("SELECT * FROM vision_triggers ORDER BY enabled DESC, id DESC");
        const recentLogs = visDb.query("SELECT * FROM vision_trigger_logs ORDER BY id DESC LIMIT 20");
        return {
          summary: `${triggers.length} vision triggers configured \xB7 ${recentLogs.length} recent executions`,
          data: { triggers, recentLogs }
        };
      }
    });
    this.register({
      id: "vision.performance.status",
      name: "Kamera-Vision: Pipeline-Leistungsmonitor & Motion-Gate-Telemetrie",
      domainCode: "VISION",
      category: "vision",
      icon: "VISION",
      description: "Liefert Echtzeit-Metriken der Vision-Pipeline (Motion-Gate-Skip-Rate %, eingesparte CPU-Sekunden, Inferenz-/Luma-Latenzen und TF.js Speicher).",
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const perf = ctx.sharedDb.kvGet("camera_vision_performance") || {};
        const today = ctx.sharedDb.kvGet("camera_vision_today") || {};
        return {
          summary: `Motion-Gate Skip: ${perf.motionGateSkipRatePct ?? 0}% (${perf.savedCpuSeconds ?? 0}s CPU saved) \xB7 Avg AI: ${perf.avgInferenceMs ?? 0}ms \xB7 Avg Luma: ${perf.avgLumaMs ?? 0}ms`,
          data: {
            performance: perf,
            visionSummary: today
          }
        };
      }
    });
    this.register({
      id: "weather.openmeteo.forecast",
      name: "Wetter: Open-Meteo Live-Prognose",
      domainCode: "WX",
      category: "weather",
      icon: "WX",
      description: "Ruft aktuelle Au\xDFentemperatur, Windgeschwindigkeit, Luftfeuchtigkeit und die 24-Stunden-Vorhersage \xFCber Open-Meteo ab.",
      defaultInput: {
        lat: "48.0444",
        lon: "15.6689",
        locationName: "St. Veit / G\xF6lsen"
      },
      fields: [
        { key: "lat", label: "Breitengrad (Lat)", type: "text", placeholder: "48.0444" },
        { key: "lon", label: "L\xE4ngengrad (Lon)", type: "text", placeholder: "15.6689" },
        { key: "locationName", label: "Ortsbezeichnung", type: "text", placeholder: "St. Veit / G\xF6lsen" }
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
      name: "GitHub: Repository-Issues auflisten",
      domainCode: "GH",
      category: "github",
      icon: "GH",
      description: "L\xE4dt offene oder geschlossene Issues eines GitHub-Repositories \xFCber die GitHub REST API v3.",
      defaultInput: { repo: "tsimhofer/thassi", state: "open" },
      fields: [
        { key: "repo", label: "Eigent\xFCmer / Repository", type: "text", placeholder: "tsimhofer/thassi", required: true },
        { key: "state", label: "Status", type: "select", options: ["open", "closed", "all"] }
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
      name: "GitHub: Neues Issue erstellen",
      domainCode: "GH",
      category: "github",
      icon: "GH",
      description: "Legt ein neues Issue mit Titel und Markdown-Beschreibung in einem GitHub-Repository an.",
      defaultInput: {
        repo: "tsimhofer/thassi",
        title: "[Axon] {{$input}}",
        body: "{{$input}}"
      },
      fields: [
        { key: "repo", label: "Eigent\xFCmer / Repository", type: "text", placeholder: "tsimhofer/thassi", required: true },
        { key: "title", label: "Issue-Titel", type: "text", placeholder: "Issue title", required: true },
        { key: "body", label: "Beschreibung (Markdown)", type: "textarea", placeholder: "{{$input}}" }
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
      name: "Gemini KI: Analyse & Textsynthese",
      domainCode: "AI",
      category: "gemini",
      icon: "AI",
      description: "Ruft Google Gemini (generateContent) auf, um \xFCbergebene Daten auszuwerten, zusammenzufassen oder Entscheidungen abzuleiten.",
      defaultInput: {
        model: "gemini-2.5-flash",
        prompt: "Analyze concisely:\n\n{{$input}}"
      },
      fields: [
        {
          key: "model",
          label: "KI-Modell",
          type: "select",
          options: ["gemini-2.5-flash", "gemini-2.5-pro"]
        },
        {
          key: "prompt",
          label: "Prompt / Anweisung ({{$input}} m\xF6glich)",
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
      name: "System-Notizen: Lesen & Hinzuf\xFCgen",
      domainCode: "SYS",
      category: "system",
      icon: "SYS",
      description: "Liest oder speichert Kurznotizen in der gemeinsamen Thassi SQLite-Systemdatenbank.",
      defaultInput: { action: "list", content: "" },
      fields: [
        { key: "action", label: "Aktion", type: "select", options: ["list", "add"] },
        { key: "content", label: "Notizinhalt (beim Hinzuf\xFCgen)", type: "textarea", placeholder: "Note text..." }
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
      id: "system.hass.monitor",
      name: "HASS OS: Echtzeit-Performance, Container & Prozesse",
      domainCode: "SYS",
      category: "system",
      icon: "SYS",
      description: "Liest die aktuelle HASS OS Systemauslastung (CPU pro Kern, Temperatur, Load, RAM, Swap, Disk-I/O), laufende Supervisor-Container/Add-ons und aktive Linux-/proc-Prozesse aus.",
      defaultInput: { filter: "" },
      fields: [
        {
          key: "filter",
          label: "Filter (Prozess / Container / Add-on)",
          type: "text",
          placeholder: "core / zigbee / mosquitto / node"
        }
      ],
      execute: async (input, ctx) => {
        const filter = String(input.filter || "").trim().toLowerCase();
        const cached = ctx.sharedDb.kvGet("hass_os_performance") || {};
        const workloads = Array.isArray(cached.activeWorkloads) ? cached.activeWorkloads : [];
        const containers = Array.isArray(cached.containers) ? cached.containers : [];
        const filteredContainers = filter ? containers.filter(
          (c) => String(c.name || "").toLowerCase().includes(filter) || String(c.slug || "").toLowerCase().includes(filter)
        ) : containers;
        return {
          summary: `HASS OS: CPU ${cached.cpuPct ?? 0}% (${cached.cpuTempC ? cached.cpuTempC + "\xB0C, " : ""}Load ${cached.load1m ?? 0}) \xB7 RAM ${cached.memPct ?? 0}% (${Math.round(cached.memUsedMb || 0)}/${Math.round(cached.memTotalMb || 0)} MB) \xB7 ${cached.runningContainers ?? 0} Container aktiv`,
          data: {
            ...cached,
            activeWorkloads: workloads,
            containers: filteredContainers
          }
        };
      }
    });
    this.register({
      id: "http.request",
      name: "HTTP: Universeller REST-Connector",
      domainCode: "HTTP",
      category: "http",
      icon: "HTTP",
      description: "F\xFChrt einen beliebigen HTTP-Aufruf (GET, POST, PUT, DELETE) mit eigenen Headern und JSON-Payload gegen externe Endpunkte aus.",
      defaultInput: {
        method: "GET",
        endpoint: "http://192.168.188.92:8099/healthz",
        headersJson: "{}",
        payload: ""
      },
      fields: [
        { key: "method", label: "HTTP-Methode", type: "select", options: ["GET", "POST", "PUT", "DELETE"] },
        { key: "endpoint", label: "Ziel-URL", type: "text", placeholder: "https://api.example.com/v1", required: true },
        { key: "headersJson", label: "HTTP-Header (JSON)", type: "textarea", placeholder: "{}" },
        { key: "payload", label: "Request-Body (POST/PUT)", type: "textarea", placeholder: "{{$input}}" }
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
      name: "Manueller Start / Webhook-Ausl\xF6ser",
      domainCode: "TRIG",
      category: "trigger",
      icon: "TRIG",
      description: "Startet eine Axon-Kette manuell per Klick oder \xFCber einen eingehenden HTTP-Webhook mit Initialdaten.",
      defaultInput: { payload: '{"source":"axons"}' },
      fields: [
        { key: "payload", label: "Start-Payload", type: "textarea", placeholder: '{"source":"manual"}' }
      ],
      execute: async (input) => ({
        summary: `Triggered at ${(/* @__PURE__ */ new Date()).toLocaleTimeString("de-AT")}`,
        data: { triggeredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: input.payload || "{}" }
      })
    });
    this.register({
      id: "trigger.schedule",
      name: "Zeitplan / Cron-Intervall-Ausl\xF6ser",
      domainCode: "TRIG",
      category: "trigger",
      icon: "TRIG",
      description: "F\xFChrt einen Workflow automatisch nach festem Zeitintervall oder Cron-Ausdruck wiederkehrend aus.",
      defaultInput: { cron: "0 7 * * *", intervalSeconds: "900", timezone: "Europe/Vienna" },
      fields: [
        { key: "cron", label: "Cron-Ausdruck", type: "text", placeholder: "0 7 * * *" },
        { key: "intervalSeconds", label: "Intervall (Sek.)", type: "number", placeholder: "900" },
        { key: "timezone", label: "Zeitzone", type: "text", placeholder: "Europe/Vienna" }
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
      name: "SPAR \xD6sterreich: Live-Produkt- & Preissuche",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Durchsucht die SPAR \xD6sterreich Fact-Finder API in Echtzeit nach aktuellen Regalpreisen, Grundpreisen und Aktionen.",
      defaultInput: { query: "Bio Vollmilch", hitsPerPage: "8" },
      fields: [
        { key: "query", label: "Suchbegriff / Produkt", type: "text", placeholder: "Bio Vollmilch / Skyr / Eier", required: true },
        { key: "hitsPerPage", label: "Max. Ergebnisse", type: "number", placeholder: "8" }
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
      name: "BILLA \xD6sterreich: Live-Sortiment & Preise",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Fragt die BILLA Online-Shop API nach \xF6sterreichischen Produktpreisen, Einheiten und aktuellen Angeboten ab.",
      defaultInput: { query: "Milch", categorySlug: "kuehlwaren-15416", maxResults: "10" },
      fields: [
        { key: "query", label: "Filter-Stichwort", type: "text", placeholder: "Milch / Butter / Brot / Apfel" },
        {
          key: "categorySlug",
          label: "BILLA-Kategorie",
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
        { key: "maxResults", label: "Max. Ergebnisse", type: "number", placeholder: "10" }
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
      name: "Warenkorb-Vergleich: SPAR vs. BILLA Optimierer",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "Vergleicht eine Einkaufsliste live zwischen SPAR und BILLA und berechnet den g\xFCnstigsten Markt sowie das Split-Einsparpotenzial.",
      defaultInput: { itemsCsv: "Milch, Butter, Eier, Haferflocken, Skyr" },
      fields: [
        {
          key: "itemsCsv",
          label: "Warenkorb-Artikel (kommagetrennt)",
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
      name: "Universal-Barcode- & EAN-Resolver (5-stufig)",
      domainCode: "MARKET",
      category: "market",
      icon: "MARKET",
      description: "L\xF6st Barcodes (EAN/GTIN/UPC) f\xFCnfstufig auf: OpenFoodFacts -> OpenBeautyFacts -> OpenProductsFacts -> UPCitemdb -> SPAR AT.",
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
      name: "E-Control: Live-Spritpreise (Diesel & Super 95)",
      domainCode: "ENERGY",
      category: "mobility",
      icon: "ENERGY",
      description: "Fragt die offizielle E-Control Spritpreisrechner API nach den g\xFCnstigsten Tankstellen rund um St. Veit an der G\xF6lsen ab.",
      defaultInput: {
        lat: "48.0444",
        lon: "15.6689",
        fuelType: "DIE",
        includeClosed: "false"
      },
      fields: [
        { key: "fuelType", label: "Treibstoffart", type: "select", options: ["DIE", "SUP", "GAS"] },
        { key: "lat", label: "Breitengrad (Lat)", type: "text", placeholder: "48.0444 (St. Veit/G\xF6lsen)" },
        { key: "lon", label: "L\xE4ngengrad (Lon)", type: "text", placeholder: "15.6689 (St. Veit/G\xF6lsen)" },
        { key: "includeClosed", label: "Geschlossene Tankstellen einbeziehen", type: "select", options: ["false", "true"] }
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
      name: "aWATTar \xD6sterreich: EPEX-Spot Strompreise",
      domainCode: "ENERGY",
      category: "energy",
      icon: "ENERGY",
      description: "L\xE4dt die st\xFCndlichen EPEX-Spot-Strompreise (ct/kWh) f\xFCr \xD6sterreich und ermittelt das g\xFCnstigste 3-Stunden-Zeitfenster f\xFCr Gro\xDFverbraucher.",
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
      name: "FRITZ!Box 6890 LTE & WLAN-Mesh Telemetrie",
      domainCode: "NET",
      category: "network",
      icon: "NET",
      description: "Pr\xFCft das FRITZ!Box-Gateway (192.168.188.1) und liest WLAN-SSID, Signalst\xE4rke, Tailscale-VPN und \xF6ffentliche WAN-IP aus.",
      defaultInput: { gatewayIp: "192.168.188.1" },
      fields: [
        { key: "gatewayIp", label: "FRITZ!Box Gateway-IP", type: "text", placeholder: "192.168.188.1" }
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
      name: "Peripherie: Drucker (Epson/Brother), PC & Batterie-Flotte",
      domainCode: "SYS",
      category: "system",
      icon: "SYS",
      description: "Fasst Epson XP-7100 Tintenst\xE4nde, Brother MFC-L2700DW Toner/Seitenz\xE4hler, Workstation-Status und Batteriewarnungen zusammen.",
      defaultInput: { batteryWarningThreshold: "25" },
      fields: [
        { key: "batteryWarningThreshold", label: "Batterie-Warnschwelle (%)", type: "number", placeholder: "25" }
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
      name: "Medien & YouTube Music: Aktive Player & Steuerung",
      domainCode: "MEDIA",
      category: "media",
      icon: "MEDIA",
      description: "Liest alle Home Assistant Mediaplayer (Music Assistant, Samsung TV, Google Cast, Xbox) aus und sendet optional Steuerbefehle.",
      defaultInput: { action: "status", entityId: "", command: "media_play_pause" },
      fields: [
        { key: "action", label: "Modus", type: "select", options: ["status", "control"] },
        { key: "entityId", label: "Ziel-Mediaplayer (optional)", type: "text", placeholder: "media_player.samsung_6_series_49" },
        {
          key: "command",
          label: "Steuerbefehl (bei Modus=control)",
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
      name: "YouTube: Video- & Kanalsuche",
      domainCode: "YT",
      category: "youtube",
      icon: "YT",
      description: "Sucht YouTube-Videos inklusive Aufrufzahlen, Dauer und Kanalinformationen (per Data API v3 oder Zero-Key-Extraktion).",
      defaultInput: { query: "BambuLab X1C Gridfinity", maxResults: "8" },
      fields: [
        { key: "query", label: "Suchabfrage", type: "text", placeholder: "BambuLab X1C / Home Assistant / Finanzen", required: true },
        { key: "maxResults", label: "Max. Ergebnisse", type: "number", placeholder: "8" }
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
      name: "YouTube: Kanal-RSS-Videofeed",
      domainCode: "YT",
      category: "youtube",
      icon: "YT",
      description: "Ruft die neuesten Video-Uploads eines YouTube-Kanals schl\xFCssellos \xFCber den offiziellen XML-Atom-Feed ab.",
      defaultInput: { channelId: "UCsBjURrPoezykLs9EqgamOA", maxVideos: "8" },
      fields: [
        {
          key: "channelId",
          label: "YouTube-Kanal-ID",
          type: "text",
          placeholder: "UCsBjURrPoezykLs9EqgamOA (Fireship)",
          required: true
        },
        { key: "maxVideos", label: "Max. Videos", type: "number", placeholder: "8" }
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
      name: "Routen & Pendeln: Live-Fahrzeit & Distanz",
      domainCode: "MAPS",
      category: "maps",
      icon: "MAPS",
      description: "Geokodiert Start- und Zieladresse und berechnet Live-Fahrzeit sowie Streckenl\xE4nge ab St. Veit an der G\xF6lsen oder beliebigem Startpunkt.",
      defaultInput: {
        origin: "St. Veit an der G\xF6lsen, Austria",
        destination: "St. P\xF6lten Hauptbahnhof, Austria"
      },
      fields: [
        { key: "origin", label: 'Startadresse oder "lat,lon"', type: "text", placeholder: "St. Veit an der G\xF6lsen, Austria", required: true },
        { key: "destination", label: 'Zieladresse oder "lat,lon"', type: "text", placeholder: "St. P\xF6lten Hauptbahnhof, Austria", required: true }
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
      name: "Finanzen: EZB-Wechselkurse & W\xE4hrungsreferenz",
      domainCode: "FIN",
      category: "finance",
      icon: "FIN",
      description: "Ruft die tagesaktuellen Referenzwechselkurse der Europ\xE4ischen Zentralbank (EZB) \xFCber die Frankfurter API ab.",
      defaultInput: { base: "EUR", symbols: "USD,CHF,GBP,JPY,PLN,CZK,HUF" },
      fields: [
        { key: "base", label: "Basisw\xE4hrung", type: "text", placeholder: "EUR" },
        { key: "symbols", label: "Zielw\xE4hrungen (CSV)", type: "text", placeholder: "USD,CHF,GBP,JPY,PLN,CZK,HUF" }
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
      name: "Workstation: Live-Telemetrie, Monitore & KVM-Stream",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Liest CPU-/RAM-Auslastung, aktives Fenster, angeschlossene Monitore (DISPLAY1-3), Lautst\xE4rke und Web-VNC-Link von DESKTOP-M8TJERB.",
      defaultInput: { agentUrl: "http://192.168.188.46:5185" },
      fields: [
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" }
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
      name: "Workstation: Energie, Wake-on-LAN & Monitorsteuerung",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Weckt DESKTOP-M8TJERB per Wake-on-LAN Magic Packet auf oder f\xFChrt Shutdown, Neustart, Standby, Sperren und Monitor-Schaltung aus.",
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
          label: "Energie-Aktion",
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
        { key: "macAddress", label: "MAC-Adresse (f\xFCr Wake-on-LAN)", type: "text", placeholder: "30:9C:23:E1:03:96" },
        { key: "broadcastIp", label: "LAN-Broadcast-IP", type: "text", placeholder: "192.168.188.255" },
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" },
        { key: "delaySeconds", label: "Verz\xF6gerung bis Shutdown/Reboot (Sek.)", type: "number", placeholder: "5" }
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
      name: "Workstation: Windows-Anmeldung, Entsperren & Auto-Logon",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Weckt Bildschirme auf, entsperrt die Windows-Sitzung (inkl. PIN/Passwort-Injektion), verbindet Konsolensitzungen oder setzt AutoLogon.",
      defaultInput: {
        mode: "unlock",
        username: "thoma",
        pinOrPassword: "",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "mode",
          label: "Anmelde- / Sitzungsmodus",
          type: "select",
          options: ["unlock", "tscon", "enable_autologon", "disable_autologon"]
        },
        { key: "username", label: "Windows-Benutzername", type: "text", placeholder: "thoma" },
        { key: "pinOrPassword", label: "PIN oder Passwort (optional)", type: "text", placeholder: "Leave empty for curtain wake only" },
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" }
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
      name: "Workstation: PowerShell-Befehl ausf\xFChren",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "F\xFChrt beliebige PowerShell-Befehle oder Skripte direkt auf DESKTOP-M8TJERB \xFCber den Thassi.PcAgent aus und liefert Stdout/Exit-Code.",
      defaultInput: {
        command: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 Name, Id, CPU | Format-Table -AutoSize",
        workingDirectory: "c:\\Users\\thoma\\source\\repos\\thassi",
        timeoutSeconds: "30",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "command",
          label: "PowerShell-Befehl / Skript",
          type: "textarea",
          placeholder: "Get-Service | Where-Object Status -eq Running",
          required: true
        },
        { key: "workingDirectory", label: "Arbeitsverzeichnis", type: "text", placeholder: "c:\\Users\\thoma\\source\\repos\\thassi" },
        { key: "timeoutSeconds", label: "Zeitlimit (Sek.)", type: "number", placeholder: "30" },
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" }
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
      name: "Workstation: Medienwiedergabe & Master-Lautst\xE4rke",
      domainCode: "PC",
      category: "media",
      icon: "PC",
      description: "Steuert Medienwiedergabe (Play/Pause, Weiter, Zur\xFCck, Stopp) sowie die Windows CoreAudio Systemlautst\xE4rke (0-100 % / Stumm).",
      defaultInput: {
        action: "play_pause",
        volumePercent: "",
        agentUrl: "http://192.168.188.46:5185"
      },
      fields: [
        {
          key: "action",
          label: "Medien-Aktion",
          type: "select",
          options: ["play_pause", "next", "prev", "stop", "mute", "vol_up", "vol_down", "set_volume"]
        },
        { key: "volumePercent", label: "Systemlautst\xE4rke % (0-100, optional)", type: "number", placeholder: "50" },
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" }
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
      name: "Workstation: Prompt an Antigravity (thassi) senden",
      domainCode: "PC",
      category: "system",
      icon: "PC",
      description: "Erstellt einen neuen oder \xF6ffnet einen bestehenden Chat im thassi-Projekt der laufenden Antigravity-App auf DESKTOP-M8TJERB per ConnectRPC.",
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
          label: "Antigravity-Auftrag (Prompt)",
          type: "textarea",
          placeholder: "Describe the coding or automation task for Antigravity in thassi...",
          required: true
        },
        {
          key: "newChat",
          label: "Neuen Chat in thassi starten",
          type: "select",
          options: ["true", "false"]
        },
        {
          key: "cascadeId",
          label: "Ziel-Cascade-ID (optional, falls kein neuer Chat)",
          type: "text",
          placeholder: "Leave empty for new chat or active chat"
        },
        {
          key: "projectName",
          label: "Antigravity-Projektname",
          type: "text",
          placeholder: "thassi"
        },
        {
          key: "focusWindow",
          label: "Antigravity-Fenster zum Chat fokussieren",
          type: "select",
          options: ["true", "false"]
        },
        { key: "agentUrl", label: "PC-Agent-URL", type: "text", placeholder: "http://192.168.188.46:5185" }
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
      name: "Google Drive: Dateiinhalt lesen & exportieren",
      domainCode: "DRIVE",
      category: "drive",
      icon: "DRIVE",
      description: "Liest oder exportiert den Volltext eines Google Docs, einer Tabelle (CSV), Markdown- oder Textdatei direkt aus Google Drive v3.",
      defaultInput: { fileId: "", maxChars: "12000" },
      fields: [
        { key: "fileId", label: "Google Drive Datei-ID", type: "text", placeholder: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ", required: true },
        { key: "maxChars", label: "Max. Zeichenanzahl", type: "number", placeholder: "12000" }
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
      name: "Memo: F\xF6derierte Wissenssuche (Drive + Notizen + .md + SQLite)",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Durchsucht gleichzeitig Google Drive, lokale Markdown-Dateien, Notizen und alle Thassi SQLite-Datenbanken mit Relevanz-Ranking.",
      defaultInput: {
        query: "BambuLab",
        sources: "all",
        limit: "20"
      },
      fields: [
        { key: "query", label: "Suchthema / Suchbegriff", type: "text", placeholder: "BambuLab / Budget / Rezept / Home Assistant" },
        {
          key: "sources",
          label: "Quellen-Filter",
          type: "select",
          options: ["all", "markdown", "notes", "drive", "database"]
        },
        { key: "limit", label: "Max. Ergebnisse", type: "number", placeholder: "20" }
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
      name: "Memo: Notiz oder Markdown-Dokument speichern",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Erstellt oder aktualisiert eine strukturierte Notiz samt optionaler .md-Datei im Memo-Wissensspeicher und SQLite-Index.",
      defaultInput: {
        title: "Neue Erkenntnis",
        content: "{{$input}}",
        tags: "memo,wissen",
        saveAsMarkdownFile: "true"
      },
      fields: [
        { key: "title", label: "Titel", type: "text", placeholder: "Projekt-Notiz / Zusammenfassung", required: true },
        { key: "content", label: "Markdown-Inhalt", type: "textarea", placeholder: "# \xDCberschrift\n\nInhalt...", required: true },
        { key: "tags", label: "Schlagw\xF6rter / Tags (CSV)", type: "text", placeholder: "ha,projekt,notiz" },
        { key: "saveAsMarkdownFile", label: "Zus\xE4tzlich als .md-Datei im Vault speichern", type: "select", options: ["true", "false"] }
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
      name: "Memo: Themen-Kontextdossier f\xFCr KI erstellen",
      domainCode: "MEMO",
      category: "system",
      icon: "MEMO",
      description: "Stellt ein strukturiertes Markdown-Wissensdossier zu einem Thema aus Google Drive, lokalen .md-Dateien, Notizen und Datenbanken zusammen.",
      defaultInput: {
        topic: "Smart Home & Energie",
        maxSnippets: "12"
      },
      fields: [
        { key: "topic", label: "Thema / Fragestellung", type: "text", placeholder: "Smart Home / Finanzen / 3D Druck" },
        { key: "maxSnippets", label: "Max. Kontextbl\xF6cke", type: "number", placeholder: "12" }
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
      name: "Cortex: Kontextangereicherte Gemini-Intelligenz",
      domainCode: "AI",
      category: "gemini",
      icon: "AI",
      description: "Reichert einen Auftrag automatisch mit lokalen Live-Daten (Memo, Home Assistant, Kalender, Finanzen, PC) an und f\xFChrt Gemini strukturiert aus.",
      defaultInput: {
        prompt: "Erstelle mein aktuelles Tages-Briefing und schlage die 3 wichtigsten n\xE4chsten Schritte vor.",
        contextScopes: "memo,ha,calendar,finance,pc",
        responsePattern: "SYNTHESIS_BRIEF",
        model: "gemini-2.5-flash"
      },
      fields: [
        { key: "prompt", label: "Prompt / Auftrag", type: "textarea", placeholder: "Was soll Cortex analysieren oder ausf\xFChren?", required: true },
        { key: "contextScopes", label: "Kontext-Quellen (CSV)", type: "text", placeholder: "memo,ha,calendar,finance,health,meals,pc" },
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
        { key: "model", label: "Gemini-Modell", type: "select", options: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] }
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

// thassi_host/src/hass-sidebar-sync.ts
import fs3 from "node:fs";
import path3 from "node:path";

// thassi_host/src/thassi-uniform-ui.ts
var UNIFORM_DESIGN_TOKENS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-strong: rgba(255, 255, 255, 0.12);
    --line-focus: rgba(255, 255, 255, 0.22);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --action-fg: #fafafa;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --dot-idle: #52525b;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  html, body {
    background-color: #09090b !important;
    color: #fafafa;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color-scheme: dark;
    margin: 0;
    padding: 0;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #09090b;
  }
  ::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }

  code, pre, kbd, samp, td, th, input[type="number"],
  .mono, [class*="mono"], [class*="kpi"], [class*="metric"], [class*="stat-v"], [class*="tabular"] {
    font-variant-numeric: tabular-nums;
  }

  /* ============================================================================
   * TOP MEN\xDCLEISTE (48px Sticky Swiss Hairline Navigation & Action Bar)
   * ============================================================================ */
  #thassi-menubar {
    position: sticky;
    top: 0;
    z-index: 9990;
    height: 48px;
    padding: 0 24px;
    background: rgba(9, 9, 11, 0.94);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-family: var(--font-sans);
    box-sizing: border-box;
  }

  .thassi-mb-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex-shrink: 0;
  }

  .thassi-mb-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .thassi-mb-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    padding-left: 10px;
    border-left: 1px solid var(--line-hairline);
    white-space: nowrap;
  }

  .thassi-mb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    flex-shrink: 0;
  }
  .thassi-mb-dot.warn { background: #f59e0b; }
  .thassi-mb-dot.err { background: #ef4444; }

  .thassi-mb-tabs {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 48px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
    justify-content: center;
  }
  .thassi-mb-tabs::-webkit-scrollbar {
    display: none;
  }

  .thassi-mb-tab {
    height: 48px;
    padding: 0 2px;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid transparent;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.14s ease, border-color 0.14s ease;
  }
  .thassi-mb-tab:hover {
    color: var(--text-primary);
  }
  .thassi-mb-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }
  .thassi-mb-tab-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--bg-elevated);
    border: 1px solid var(--line-hairline);
    color: var(--text-muted);
  }

  .thassi-mb-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .thassi-mb-btn-primary {
    background: #fafafa;
    color: #09090b;
    border: none;
    border-radius: 4px;
    height: 28px;
    padding: 0 11px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: background 0.14s ease;
  }
  .thassi-mb-btn-primary:hover {
    background: #e4e4e7;
  }

  .thassi-mb-btn-ghost {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    height: 28px;
    padding: 0 10px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.14s ease, border-color 0.14s ease;
  }
  .thassi-mb-btn-ghost:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  /* ============================================================================
   * STARTSEITE (3-Block-Fokus: 1. KPI-Leiste \xB7 2. Diagramme \xB7 3. Fokus-Kurzliste)
   * ============================================================================ */
  #thassi-startseite {
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px 24px 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .thassi-ov-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--line-hairline);
    border-radius: 6px;
    background: var(--bg-canvas);
    overflow: hidden;
  }

  .thassi-ov-kpi {
    padding: 16px 20px;
    border-right: 1px solid var(--line-hairline);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .thassi-ov-kpi:last-child {
    border-right: none;
  }

  .thassi-ov-kpi-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .thassi-ov-kpi-val {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-kpi-sub {
    font-size: 12px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-charts {
    display: grid;
    grid-template-columns: 7fr 5fr;
    gap: 16px;
  }

  .thassi-ov-panel {
    background: var(--bg-canvas);
    border: 1px solid var(--line-hairline);
    border-radius: 6px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .thassi-ov-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .thassi-ov-panel-title {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-secondary);
  }

  .thassi-ov-panel-meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .thassi-ov-chart-body {
    min-height: 210px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  /* Block 3: Kompakte Fokus-Kurzliste (Max 5 Eintr\xE4ge) */
  .thassi-ov-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line-hairline);
  }

  .thassi-ov-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--line-hairline);
    font-size: 13px;
  }
  .thassi-ov-row:last-child {
    border-bottom: none;
  }

  .thassi-ov-row-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .thassi-ov-row-title {
    color: var(--text-primary);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-row-sub {
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-ov-row-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .thassi-ov-tag {
    font-family: var(--font-mono);
    font-size: 10.5px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--bg-elevated);
    border: 1px solid var(--line-hairline);
    color: var(--text-secondary);
  }

  /* ============================================================================
   * SATELLITE SUBPAGE EMBED & NATIVE SUBPAGE WORKSPACE
   * ============================================================================ */
  #thassi-satellite-container {
    display: none;
    width: 100%;
    height: calc(100vh - 48px);
    border: none;
    background: var(--bg-canvas);
  }

  body.thassi-mode-overview #root,
  body.thassi-mode-satellite #root {
    display: none !important;
  }

  body.thassi-mode-subpage #thassi-startseite,
  body.thassi-mode-satellite #thassi-startseite {
    display: none !important;
  }

  body.thassi-mode-satellite #thassi-satellite-container {
    display: block !important;
  }

  /* When embedded as a satellite subpage (?subpage=1), hide the inner duplicate menubar */
  body.thassi-is-embedded-subpage #thassi-menubar,
  body.thassi-is-embedded-subpage #thassi-startseite {
    display: none !important;
  }
  body.thassi-is-embedded-subpage #root {
    display: block !important;
  }

  /* ============================================================================
   * SLIDE-OVER ACTION DRAWER (Fokussierte Formulare ohne Seiten-Ballast)
   * ============================================================================ */
  #thassi-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9995;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: none;
    justify-content: flex-end;
  }
  #thassi-drawer-backdrop.open {
    display: flex;
  }

  #thassi-drawer-panel {
    width: 420px;
    max-width: 92vw;
    height: 100%;
    background: #111113;
    border-left: 1px solid var(--line-strong);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .thassi-drw-head {
    height: 52px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .thassi-drw-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .thassi-drw-close {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .thassi-drw-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    flex: 1;
  }

  .thassi-drw-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .thassi-drw-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }

  .thassi-drw-input {
    background: var(--bg-input);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    padding: 8px 10px;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    outline: none;
  }
  .thassi-drw-input:focus {
    border-color: var(--text-primary);
  }

  @media (max-width: 960px) {
    .thassi-ov-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .thassi-ov-kpi {
      border-bottom: 1px solid var(--line-hairline);
    }
    .thassi-ov-charts {
      grid-template-columns: 1fr;
    }
    #thassi-menubar {
      padding: 0 12px;
    }
  }
`;
function getUniformAppCockpitScript() {
  return `
  (function initThassiUniformAppCockpit() {
    if (window.__THASSI_UNIFORM_COCKPIT_INIT__) return;
    window.__THASSI_UNIFORM_COCKPIT_INIT__ = true;

    var appId = window.__THASSI_APP_ID__ || '';
    if (!appId) return;

    var params = new URLSearchParams(window.location.search || '');
    var isEmbeddedSubpage = params.get('subpage') === '1';

    var ingressBase = String(window.__THASSI_INGRESS_PATH__ || '').replace(/\\/+$/, '');
    function apiUrl(p) {
      return ingressBase + p;
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fmtNum(n, dec) {
      var v = Number(n || 0);
      if (!Number.isFinite(v)) v = 0;
      return v.toLocaleString('de-DE', {
        minimumFractionDigits: dec || 0,
        maximumFractionDigits: dec || 0
      });
    }

    function fmtEur(n) {
      return fmtNum(n, 2) + ' \u20AC';
    }

    // SVG Chart Helpers (Swiss Precision Hairline Charts)
    function svgAreaChart(values, labels, unit, color) {
      var pts = Array.isArray(values) && values.length > 0 ? values.map(function(v) { return Number(v) || 0; }) : [12, 19, 15, 28, 24, 34, 30];
      var lbls = Array.isArray(labels) && labels.length > 0 ? labels : pts.map(function(_, i) { return 'T-' + (pts.length - i); });
      if (pts.length === 1) {
        pts = [pts[0] * 0.85, pts[0]];
        lbls = ['Vorher', lbls[0]];
      }
      var w = 520, h = 185, padL = 36, padR = 14, padT = 16, padB = 26;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;
      var minV = Math.min.apply(null, pts);
      var maxV = Math.max.apply(null, pts);
      if (minV > 0) minV = 0;
      var span = Math.max(1, maxV - minV);
      var strokeCol = color || '#fafafa';

      var coords = pts.map(function(v, i) {
        var x = padL + (i / Math.max(1, pts.length - 1)) * plotW;
        var y = padT + plotH - ((v - minV) / span) * plotH;
        return { x: x, y: y, v: v, l: lbls[i] || '' };
      });

      var dLine = coords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      var dArea = dLine + ' L ' + coords[coords.length - 1].x.toFixed(1) + ' ' + (padT + plotH) + ' L ' + coords[0].x.toFixed(1) + ' ' + (padT + plotH) + ' Z';

      var gridHtml = '';
      for (var g = 0; g <= 3; g++) {
        var gy = padT + (g / 3) * plotH;
        var gv = maxV - (g / 3) * span;
        gridHtml += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2,3" />';
        gridHtml += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" fill="#52525b" font-family="JetBrains Mono, monospace" font-size="9.5">' + Math.round(gv) + '</text>';
      }

      var step = Math.max(1, Math.ceil(coords.length / 6));
      var xLabelsHtml = '';
      var dotsHtml = '';
      for (var j = 0; j < coords.length; j++) {
        var c = coords[j];
        dotsHtml += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2.5" fill="#09090b" stroke="' + strokeCol + '" stroke-width="1.5"><title>' + esc(c.l + ': ' + fmtNum(c.v, 1) + ' ' + (unit || '')) + '</title></circle>';
        if (j % step === 0 || j === coords.length - 1) {
          xLabelsHtml += '<text x="' + c.x.toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(String(c.l).slice(0, 8)) + '</text>';
        }
      }

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:195px; overflow:visible;">' +
        '<defs><linearGradient id="thassiAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + strokeCol + '" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="' + strokeCol + '" stop-opacity="0.0"/>' +
        '</linearGradient></defs>' +
        gridHtml +
        '<path d="' + dArea + '" fill="url(#thassiAreaGrad)" />' +
        '<path d="' + dLine + '" fill="none" stroke="' + strokeCol + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />' +
        dotsHtml +
        xLabelsHtml +
        '</svg>';
    }

    function svgBarChart(items, unit) {
      var list = Array.isArray(items) && items.length > 0 ? items.slice(0, 8) : [{ label: 'Keine Daten', value: 0 }];
      var w = 520, h = 185, padL = 34, padR = 12, padT = 16, padB = 26;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;
      var maxV = Math.max.apply(null, list.map(function(x) { return Number(x.value) || 0; }).concat([1]));

      var gridHtml = '';
      for (var g = 0; g <= 3; g++) {
        var gy = padT + (g / 3) * plotH;
        var gv = maxV - (g / 3) * maxV;
        gridHtml += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" />';
        gridHtml += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" fill="#52525b" font-family="JetBrains Mono, monospace" font-size="9.5">' + Math.round(gv) + '</text>';
      }

      var slotW = plotW / list.length;
      var barW = Math.min(38, Math.max(12, slotW * 0.56));
      var barsHtml = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var v = Math.max(0, Number(it.value) || 0);
        var bh = Math.max(2, (v / maxV) * plotH);
        var bx = padL + i * slotW + (slotW - barW) / 2;
        var by = padT + plotH - bh;
        var col = it.color || (i === list.length - 1 ? '#10b981' : '#e4e4e7');
        barsHtml += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + col + '" opacity="0.88"><title>' + esc(it.label + ': ' + fmtNum(v, 1) + ' ' + (unit || '')) + '</title></rect>';
        barsHtml += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(String(it.label || '').slice(0, 8)) + '</text>';
      }

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:195px; overflow:visible;">' + gridHtml + barsHtml + '</svg>';
    }

    function svgDonutChart(segments, centerTop, centerBottom) {
      var list = Array.isArray(segments) ? segments.filter(function(s) { return Number(s.value) > 0; }).slice(0, 5) : [];
      var palette = ['#fafafa', '#10b981', '#71717a', '#f59e0b', '#3f3f46'];
      var total = list.reduce(function(acc, s) { return acc + (Number(s.value) || 0); }, 0);
      var r = 62;
      var c = 2 * Math.PI * r;
      var offset = 0;
      var ringsHtml = '<circle cx="80" cy="80" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" />';

      if (total > 0) {
        for (var i = 0; i < list.length; i++) {
          var seg = list[i];
          var frac = (Number(seg.value) || 0) / total;
          var dash = frac * c;
          var col = seg.color || palette[i % palette.length];
          ringsHtml += '<circle cx="80" cy="80" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="14" stroke-dasharray="' + dash.toFixed(2) + ' ' + (c - dash).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 80 80)" />';
          offset += dash;
        }
      }

      var legendHtml = '';
      for (var j = 0; j < list.length; j++) {
        var s = list[j];
        var pct = total > 0 ? Math.round(((Number(s.value) || 0) / total) * 100) : 0;
        var lcol = s.color || palette[j % palette.length];
        legendHtml += '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px;">' +
          '<div style="display:flex; align-items:center; gap:7px; min-width:0;">' +
            '<span style="width:7px; height:7px; border-radius:2px; background:' + lcol + '; flex-shrink:0;"></span>' +
            '<span style="color:#a1a1aa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(s.label) + '</span>' +
          '</div>' +
          '<span style="font-family:var(--font-mono); color:#fafafa; font-size:11.5px;">' + (s.display || (pct + '%')) + '</span>' +
        '</div>';
      }
      if (!legendHtml) {
        legendHtml = '<div style="font-size:12px; color:#52525b;">Noch keine Segmentdaten vorhanden</div>';
      }

      return '<div style="display:flex; align-items:center; justify-content:space-between; gap:20px; width:100%;">' +
        '<svg width="156" height="156" viewBox="0 0 160 160" style="flex-shrink:0;">' +
          ringsHtml +
          '<text x="80" y="76" text-anchor="middle" fill="#fafafa" font-family="JetBrains Mono, monospace" font-size="16" font-weight="500">' + esc(centerTop || '') + '</text>' +
          '<text x="80" y="95" text-anchor="middle" fill="#71717a" font-family="Inter, sans-serif" font-size="10.5">' + esc(centerBottom || '') + '</text>' +
        '</svg>' +
        '<div style="display:flex; flex-direction:column; gap:8px; flex:1; min-width:0;">' + legendHtml + '</div>' +
      '</div>';
    }

    function svgRingGauges(rings) {
      var html = '<div style="display:grid; grid-template-columns:repeat(' + rings.length + ', 1fr); gap:12px; width:100%; align-items:center;">';
      var r = 44;
      var c = 2 * Math.PI * r;
      for (var i = 0; i < rings.length; i++) {
        var rg = rings[i];
        var pct = Math.max(0, Math.min(100, Number(rg.pct) || 0));
        var dash = (pct / 100) * c;
        var col = rg.color || '#10b981';
        html += '<div style="display:flex; flex-direction:column; align-items:center; gap:6px;">' +
          '<svg width="108" height="108" viewBox="0 0 108 108">' +
            '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" />' +
            '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 54 54)" />' +
            '<text x="54" y="52" text-anchor="middle" fill="#fafafa" font-family="JetBrains Mono, monospace" font-size="15" font-weight="500">' + esc(rg.val) + '</text>' +
            '<text x="54" y="68" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="9.5">' + esc(rg.sub || (Math.round(pct) + '%')) + '</text>' +
          '</svg>' +
          '<span style="font-size:11px; color:#a1a1aa; font-weight:500;">' + esc(rg.label) + '</span>' +
        '</div>';
      }
      html += '</div>';
      return html;
    }

    // Per-App Configuration (Men\xFCleiste Subseiten + Slide-Over Actions)
    var APP_CONFIGS = {
      'smart-canvas': {
        title: 'Smart Home',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'rooms', label: 'R\xE4ume & Ger\xE4te', rootMatch: 'Alle' },
          { id: 'floorplan', label: '2D Grundriss', satellite: 'floorplan' },
          { id: 'energy', label: 'Energie & Klima', rootMatch: 'Klima' }
        ],
        actions: [
          { id: 'all-lights-off', label: 'Alle Lichter aus', ghost: true },
          { id: 'new-tile', label: '+ Ger\xE4t / Kachel' }
        ]
      },
      'camera-vision': {
        title: 'Kameras & Vision',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'streams', label: 'Live-Matrix & Streams', rootMatch: 'Kamera' },
          { id: 'triggers', label: 'KI-Regeln & Events', rootMatch: 'Trigger' },
          { id: 'setup', label: 'Kamera-Setup', rootMatch: 'ONVIF' }
        ],
        actions: [
          { id: 'sample-all', label: 'Snapshots abtasten', ghost: true },
          { id: 'new-trigger', label: '+ KI-Trigger' }
        ]
      },
      '3d-print': {
        title: '3D Druck Studio',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'cad', label: 'CAD & 3D-Generator', rootMatch: 'Studio' },
          { id: 'ams', label: 'AMS & Filament', rootMatch: 'AMS' },
          { id: 'setup', label: 'Drucker-Setup', rootMatch: 'Bambu' }
        ],
        actions: [
          { id: 'start-print', label: 'Druck starten', ghost: true },
          { id: 'new-3d-model', label: '+ KI 3D-Modell' }
        ]
      },
      'finance-analytics': {
        title: 'Finanzen',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'transactions', label: 'Buchungen & Analyse', rootMatch: 'BUCHUNGEN' },
          { id: 'budgets', label: 'Budgets & Fixkosten', rootMatch: 'FIXKOSTEN' },
          { id: 'george-sync', label: 'George Sync', satellite: 'george-sync' }
        ],
        actions: [
          { id: 'scan-bank', label: 'Downloads scannen', ghost: true },
          { id: 'new-tx', label: '+ Buchung' }
        ]
      },
      'google-calendar': {
        title: 'Kalender & Zeit',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'calendar', label: 'Agenda & Termine', rootMatch: 'Agenda' },
          { id: 'analytics', label: 'Horizon & Zeitbudget', rootMatch: 'Zeitbudget' },
          { id: 'sources', label: 'Kalender-Quellen', rootMatch: 'Quellen' }
        ],
        actions: [
          { id: 'sync-cal', label: 'Synchronisieren', ghost: true },
          { id: 'new-event', label: '+ Termin' }
        ]
      },
      'google-health': {
        title: 'Gesundheit',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'sleep', label: '7-Tage Verlauf', rootMatch: 'Verlauf' },
          { id: 'workouts', label: 'Workouts & Training', rootMatch: 'Workouts' },
          { id: 'biometrics', label: 'Quellen & Eingabe', rootMatch: 'Quellen' }
        ],
        actions: [
          { id: 'refresh-health', label: 'Sync aktualisieren', ghost: true },
          { id: 'new-biometric', label: '+ Messwert / Training' }
        ]
      },
      'meal-planner': {
        title: 'Ern\xE4hrung & Einkauf',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'planner', label: 'Wochenplan & Optimizer', rootMatch: 'Wochenplan' },
          { id: 'recipes', label: 'Rezepte & Vorrat', rootMatch: 'Rezepte' },
          { id: 'groceries', label: 'Einkauf & Preise', rootMatch: 'Einkauf' }
        ],
        actions: [
          { id: 'optimize-week', label: 'Wochenplan f\xFCllen', ghost: true },
          { id: 'new-grocery', label: '+ Einkauf / Mahlzeit' }
        ]
      },
      'memo': {
        title: 'Memo',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'editor', label: 'Lokale .MD & Vault', rootMatch: 'LOKALE .MD' },
          { id: 'search', label: 'Alle Quellen & Suche', rootMatch: 'ALLE QUELLEN' },
          { id: 'sync', label: 'Keep & Drive Sync', rootMatch: 'GOOGLE DRIVE' }
        ],
        actions: [
          { id: 'sync-memo', label: 'Vault Sync', ghost: true },
          { id: 'new-note', label: '+ Neue Notiz' }
        ]
      },
      'contacts': {
        title: 'Kontakte',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'directory', label: 'Adressbuch', rootMatch: 'Adressbuch' },
          { id: 'messages', label: 'Kommunikation & KI', rootMatch: 'Chat' }
        ],
        actions: [
          { id: 'sync-contacts', label: 'Google Sync', ghost: true },
          { id: 'new-contact', label: '+ Kontakt' }
        ]
      },
      'cortex': {
        title: 'Cortex',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'workspace', label: 'KI-Workspace', rootMatch: 'GEMINI ANTWORT' },
          { id: 'blueprints', label: 'Verlauf & Kontext', rootMatch: 'VERLAUF' },
          { id: 'vault', label: 'Credentials Vault', rootMatch: 'Vault' }
        ],
        actions: [
          { id: 'open-vault', label: 'Credentials Vault', ghost: true },
          { id: 'new-prompt', label: '+ KI-Anfrage' }
        ]
      },
      'workflows': {
        title: 'Workflows',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'editor', label: 'Abl\xE4ufe & Ketten', rootMatch: 'Ketten' },
          { id: 'axons', label: 'Axon-Katalog', rootMatch: 'Axon-Katalog' },
          { id: 'kvm', label: 'PC-Bridge & KVM', rootMatch: 'PC-Bridge' }
        ],
        actions: [
          { id: 'sync-pc', label: 'PC-Bridge Sync', ghost: true },
          { id: 'run-axon', label: '+ Axon ausf\xFChren' }
        ]
      },
      'project-workflow': {
        title: 'Dev-Projekte',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'issues', label: 'Tasks & Issues', rootMatch: 'Issues' },
          { id: 'milestones', label: 'Meilensteine', rootMatch: 'Milestones' },
          { id: 'cicd', label: 'GitHub & Deployment', rootMatch: 'Deployment' }
        ],
        actions: [
          { id: 'run-tests', label: 'Tests starten', ghost: true },
          { id: 'new-issue', label: '+ Task / Issue' }
        ]
      },
      'system-monitor': {
        title: 'System & Infrastruktur',
        tabs: [
          { id: 'overview', label: '\xDCbersicht' },
          { id: 'containers', label: 'Container & Prozesse', rootMatch: 'CONTAINER' },
          { id: 'network-monitor', label: 'Netzwerk & Fritz!Box', satellite: 'network-monitor' },
          { id: 'google-usage', label: 'Cloud & API Usage', satellite: 'google-usage' },
          { id: 'logs', label: 'Watchdog & Diagnose', rootMatch: 'WATCHDOG' }
        ],
        actions: [
          { id: 'refresh-sys', label: 'Live-Refresh', ghost: true },
          { id: 'open-diagnostics', label: 'System-Diagnose' }
        ]
      }
    };

    var cfg = APP_CONFIGS[appId];
    if (!cfg || isEmbeddedSubpage) {
      if (isEmbeddedSubpage) {
        document.addEventListener('DOMContentLoaded', function() {
          document.body.classList.add('thassi-is-embedded-subpage');
        });
      }
      return;
    }

    var activeTabId = 'overview';
    if (params.get('tab') === 'vault' && appId === 'cortex') {
      activeTabId = 'vault';
    } else if (window.location.hash && window.location.hash.indexOf('subpage=') !== -1) {
      var m = window.location.hash.match(/subpage=([a-z0-9-_]+)/i);
      if (m && m[1]) activeTabId = m[1];
    }

    function setTab(tabId) {
      activeTabId = tabId;
      var tabObj = cfg.tabs.find(function(t) { return t.id === tabId; }) || cfg.tabs[0];
      var btns = document.querySelectorAll('#thassi-menubar .thassi-mb-tab');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === tabObj.id);
      }

      document.body.classList.remove('thassi-mode-overview', 'thassi-mode-subpage', 'thassi-mode-satellite');
      var satFrame = document.getElementById('thassi-satellite-container');

      if (tabObj.id === 'overview') {
        document.body.classList.add('thassi-mode-overview');
      } else if (tabObj.satellite) {
        document.body.classList.add('thassi-mode-satellite');
        if (satFrame) {
          var targetUrl = apiUrl('/apps/' + tabObj.satellite + '/?subpage=1');
          if (satFrame.getAttribute('data-src') !== targetUrl) {
            satFrame.setAttribute('data-src', targetUrl);
            satFrame.src = targetUrl;
          }
        }
      } else {
        document.body.classList.add('thassi-mode-subpage');
        if (tabObj.rootMatch) {
          tryActivateRootTab(tabObj.rootMatch);
        }
      }
    }

    function tryActivateRootTab(keyword) {
      try {
        var root = document.getElementById('root');
        if (!root) return;
        var kw = String(keyword).toLowerCase();
        var candidates = root.querySelectorAll('button, [role="tab"], a');
        for (var i = 0; i < candidates.length; i++) {
          var txt = (candidates[i].textContent || '').trim().toLowerCase();
          if (txt && txt.length < 32 && txt.indexOf(kw) !== -1) {
            candidates[i].click();
            break;
          }
        }
      } catch (_e) {}
    }

    function updateFreshnessLabel(statusOk, customLabel) {
      var tsEl = document.getElementById('thassi-mb-ts');
      var dotEl = document.getElementById('thassi-mb-dot');
      var nowStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (tsEl) tsEl.textContent = (customLabel ? customLabel + ' \xB7 ' : '') + 'Stand: ' + nowStr;
      if (dotEl) {
        dotEl.className = 'thassi-mb-dot' + (statusOk === false ? ' warn' : '');
      }
    }

    function renderStartseiteSkeleton(kpis, chart1Title, chart1Meta, chart1Html, chart2Title, chart2Meta, chart2Html, listTitle, listSubTab, rowsHtml) {
      var container = document.getElementById('thassi-startseite');
      if (!container) return;

      var kpisHtml = '';
      for (var i = 0; i < kpis.length; i++) {
        var k = kpis[i];
        kpisHtml += '<div class="thassi-ov-kpi">' +
          '<div class="thassi-ov-kpi-label"><span>' + esc(k.label) + '</span>' + (k.dot ? '<span class="thassi-mb-dot ' + k.dot + '"></span>' : '') + '</div>' +
          '<div class="thassi-ov-kpi-val">' + esc(k.value) + '</div>' +
          '<div class="thassi-ov-kpi-sub">' + esc(k.sub || '') + '</div>' +
        '</div>';
      }

      container.innerHTML =
        '<div class="thassi-ov-kpis">' + kpisHtml + '</div>' +
        '<div class="thassi-ov-charts">' +
          '<div class="thassi-ov-panel">' +
            '<div class="thassi-ov-panel-head">' +
              '<span class="thassi-ov-panel-title">' + esc(chart1Title) + '</span>' +
              '<span class="thassi-ov-panel-meta">' + esc(chart1Meta || '') + '</span>' +
            '</div>' +
            '<div class="thassi-ov-chart-body">' + chart1Html + '</div>' +
          '</div>' +
          '<div class="thassi-ov-panel">' +
            '<div class="thassi-ov-panel-head">' +
              '<span class="thassi-ov-panel-title">' + esc(chart2Title) + '</span>' +
              '<span class="thassi-ov-panel-meta">' + esc(chart2Meta || '') + '</span>' +
            '</div>' +
            '<div class="thassi-ov-chart-body">' + chart2Html + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="thassi-ov-panel">' +
          '<div class="thassi-ov-panel-head">' +
            '<span class="thassi-ov-panel-title">' + esc(listTitle) + ' (Max. 5)</span>' +
            '<button class="thassi-mb-btn-ghost" style="height:24px; font-size:11px;" onclick="window.__thassiSwitchTab(\\'' + esc(listSubTab || cfg.tabs[1].id) + '\\')">Alle in Subseite \xF6ffnen \u2192</button>' +
          '</div>' +
          '<div class="thassi-ov-list">' + (rowsHtml || '<div class="thassi-ov-row"><span class="thassi-ov-row-sub">Keine Eintr\xE4ge vorhanden</span></div>') + '</div>' +
        '</div>';
    }

    function buildRowsHtml(items) {
      var slice = (items || []).slice(0, 5);
      if (slice.length === 0) return '';
      return slice.map(function(it) {
        return '<div class="thassi-ov-row">' +
          '<div class="thassi-ov-row-left">' +
            '<span class="thassi-mb-dot ' + (it.dot || '') + '"></span>' +
            '<span class="thassi-ov-row-title">' + esc(it.title) + '</span>' +
            (it.sub ? '<span class="thassi-ov-row-sub">\xB7 ' + esc(it.sub) + '</span>' : '') +
          '</div>' +
          '<div class="thassi-ov-row-right">' +
            (it.tag ? '<span class="thassi-ov-tag">' + esc(it.tag) + '</span>' : '') +
            '<span>' + esc(it.right || '') + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function loadOverviewData() {
      try {
        if (appId === 'finance-analytics') {
          var res = await fetch(apiUrl('/api/apps/finance-analytics/overview?month=all'));
          var d = res.ok ? await res.json() : {};
          var k = d.kpis || {};
          var txs = Array.isArray(d.transactions) ? d.transactions : [];
          var cats = Array.isArray(d.categoryBreakdown) ? d.categoryBreakdown : [];
          var series = Array.isArray(d.monthlyTrend) && d.monthlyTrend.length > 0 ? d.monthlyTrend : txs.slice(0, 10).reverse();

          var kpis = [
            { label: 'Kontostand', value: fmtEur(d.balanceConfig?.currentBalance ?? k.currentBalance ?? 4850), sub: d.balanceConfig?.accountName || 'Girokonto' },
            { label: 'Ausgaben Monat', value: fmtEur(k.expenses || 0), sub: 'Einnahmen: ' + fmtEur(k.income || 0) },
            { label: 'Netto Cashflow', value: fmtEur(k.net || 0), sub: 'Sparquote: ' + fmtNum(k.savingsRate || 0, 1) + '%' },
            { label: 'Buchungen', value: String(txs.length), sub: 'George Sync bereit' }
          ];

          var c1Vals = series.map(function(x) { return Math.abs(Number(x.expenses ?? x.amount ?? 0)); });
          var c1Lbls = series.map(function(x) { return String(x.month || x.booking_date || x.date || '').slice(5, 10); });
          var c2Segs = cats.slice(0, 5).map(function(c) {
            return { label: c.category || c.name || 'Sonstiges', value: Math.abs(Number(c.total ?? c.amount ?? 0)), display: fmtEur(Math.abs(Number(c.total ?? c.amount ?? 0))) };
          });

          var rows = txs.slice(0, 5).map(function(t) {
            var amt = Number(t.amount || 0);
            return {
              title: t.merchant || t.description || t.title || 'Buchung',
              sub: String(t.booking_date || t.date || '').slice(0, 10),
              tag: t.category || 'Allgemein',
              right: (amt >= 0 ? '+' : '') + fmtEur(amt),
              dot: amt >= 0 ? '' : 'warn'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Cashflow & Ausgaben-Verlauf', 'EUR / Zeitraum', svgAreaChart(c1Vals, c1Lbls, '\u20AC', '#fafafa'),
            'Kategorien-Aufteilung', 'Top 5 Kategorien', svgDonutChart(c2Segs, fmtEur(k.expenses || 0), 'Ausgaben'),
            'Letzte Transaktionen', 'transactions', buildRowsHtml(rows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'smart-canvas') {
          var rRes = await fetch(apiUrl('/api/system/rooms'));
          var rData = rRes.ok ? await rRes.json() : { rooms: [] };
          var rooms = (rData.rooms || []).filter(function(r) { return r.id !== 'kameras_vision'; });
          var allDevs = [];
          var totalW = 0;
          var activeCnt = 0;
          rooms.forEach(function(r) {
            (r.devices || []).forEach(function(dv) {
              allDevs.push({ room: r.name, dev: dv });
              if (dv.isOn) activeCnt++;
              if (dv.powerW) totalW += Number(dv.powerW) || 0;
            });
          });
          var temps = rooms.map(function(r) { return r.tempC; }).filter(function(t) { return t != null; });
          var avgTemp = temps.length > 0 ? (temps.reduce(function(a, b) { return a + b; }, 0) / temps.length) : 21.5;

          var kpis = [
            { label: 'Aktuelle Leistung', value: fmtNum(totalW, 1) + ' W', sub: 'Live Shelly Messung' },
            { label: 'Aktive Ger\xE4te', value: activeCnt + ' / ' + allDevs.length, sub: rooms.length + ' R\xE4ume \xFCberwacht' },
            { label: '\xD8 Raumklima', value: fmtNum(avgTemp, 1) + ' \xB0C', sub: 'B\xFCro & Wohnbereich' },
            { label: '2D Grundriss', value: 'Integriert', sub: 'In Men\xFCleiste verf\xFCgbar' }
          ];

          var barItems = rooms.map(function(r) {
            var rw = (r.devices || []).reduce(function(s, d) { return s + (Number(d.powerW) || 0); }, 0);
            var onC = (r.devices || []).filter(function(d) { return d.isOn; }).length;
            return { label: r.name, value: rw > 0 ? rw : onC * 15 + 5 };
          });

          var segs = [
            { label: 'Eingeschaltet', value: Math.max(1, activeCnt), color: '#10b981', display: activeCnt + ' aktiv' },
            { label: 'Standby / Aus', value: Math.max(1, allDevs.length - activeCnt), color: '#3f3f46', display: (allDevs.length - activeCnt) + ' aus' }
          ];

          var activeList = allDevs.filter(function(x) { return x.dev.isOn; }).concat(allDevs.filter(function(x) { return !x.dev.isOn; })).slice(0, 5).map(function(x) {
            return {
              title: x.dev.label,
              sub: x.room,
              tag: x.dev.isOn ? 'EIN' : 'AUS',
              right: x.dev.powerW != null ? (fmtNum(x.dev.powerW, 1) + ' W') : x.dev.state,
              dot: x.dev.isOn ? '' : 'warn'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Leistungs- & Raum-Aktivit\xE4t', 'Watt / Raum', svgBarChart(barItems, 'W'),
            'Ger\xE4te-Status', 'Haus gesamt', svgDonutChart(segs, activeCnt + '/' + allDevs.length, 'Aktiv'),
            'Wichtigste Verbraucher & Schalter', 'rooms', buildRowsHtml(activeList)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'camera-vision') {
          var cRes = await fetch(apiUrl('/api/apps/camera-vision/dashboard'));
          var cData = cRes.ok ? await cRes.json() : {};
          var cams = cData.cameras || [];
          var events = cData.recentDetections || cData.events || [];
          var onlineCnt = cams.filter(function(c) { return c.status !== 'offline'; }).length;

          var kpis = [
            { label: 'Kameras Online', value: onlineCnt + ' / ' + Math.max(4, cams.length), sub: 'RTSP / ONVIF Streams' },
            { label: 'KI-Erkennungen', value: String(events.length), sub: 'COCO-SSD & Gemini Vision' },
            { label: 'Aktive Trigger', value: String((cData.triggers || []).length), sub: 'Automations-Regeln' },
            { label: 'Letzter Scan', value: 'Nominal', sub: cData.lastSceneSummary ? String(cData.lastSceneSummary).slice(0, 28) : 'Bereit' }
          ];

          var camGridHtml = '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; width:100%;">';
          cams.slice(0, 4).forEach(function(cm) {
            var id = cm.id || cm.camera_id || 'cam';
            camGridHtml += '<div style="position:relative; height:88px; background:#141417; border:1px solid var(--line-hairline); border-radius:4px; overflow:hidden; display:flex; align-items:flex-end; padding:6px 8px;">' +
              '<img src="' + apiUrl('/api/apps/camera-vision/frame.jpg?camera_id=' + encodeURIComponent(id) + '&t=' + Date.now()) + '" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.78;" onerror="this.style.display=\\'none\\'" />' +
              '<span style="position:relative; z-index:2; font-size:11px; font-weight:500; color:#fafafa; background:rgba(9,9,11,0.75); padding:2px 6px; border-radius:3px;">' + esc(cm.name || id) + '</span>' +
            '</div>';
          });
          camGridHtml += '</div>';

          var histItems = (cams.length ? cams : [{ name: 'Garten' }, { name: 'Eingang' }, { name: 'PTZ 2' }, { name: 'PTZ 3' }]).slice(0, 4).map(function(c, i) {
            return { label: c.name || c.id || ('Cam ' + (i + 1)), value: Number(c.detectionCount || (4 - i) * 3) };
          });

          var evRows = (events.length ? events : cams).slice(0, 5).map(function(e) {
            return {
              title: e.summary || e.label || e.name || 'Kamera-Stream',
              sub: e.camera_id || e.ip || 'LAN Stream',
              tag: e.optimization_mode || 'LIVE',
              right: String(e.timestamp || e.created_at || 'Bereit').slice(11, 19) || 'Aktiv'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            '2\xD72 Live-Kamera-Vorschau', 'Aktuelle Snapshots', camGridHtml,
            'Erkennungen pro Kamera', '24h Verteilung', svgBarChart(histItems, 'Events'),
            'Letzte KI-Vision Ereignisse & Streams', 'streams', buildRowsHtml(evRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === '3d-print') {
          var pRes = await fetch(apiUrl('/api/apps/3d-print/dashboard'));
          var pData = pRes.ok ? await pRes.json() : {};
          var tel = pData.telemetry || pData.printer || {};
          var proj = pData.activeProject || {};
          var projs = pData.projects || [];
          var pct = Number(tel.progressPercent ?? proj.progressPct ?? 0);
          var noz = Number(tel.nozzleTempC ?? tel.nozzleTemp ?? 24);
          var bed = Number(tel.bedTempC ?? tel.bedTemp ?? 24);

          var kpis = [
            { label: 'Drucker-Status', value: String(tel.printerState || tel.status || 'IDLE'), sub: pData.printerConfig?.printerName || 'Bambu Lab P1S' },
            { label: 'Fortschritt', value: fmtNum(pct, 0) + ' %', sub: 'Layer ' + (tel.currentLayer || 0) + ' / ' + (tel.totalLayers || 0) },
            { label: 'Temperaturen', value: Math.round(noz) + '\xB0 / ' + Math.round(bed) + '\xB0C', sub: 'Nozzle / Druckbett' },
            { label: '3D-Projekte', value: String(projs.length), sub: proj.title || 'Bereit f\xFCr CAD-Prompt' }
          ];

          var rings = [
            { label: 'Druck-Fortschritt', val: Math.round(pct) + '%', pct: pct, color: '#10b981', sub: (tel.remainingMinutes || 0) + 'm Rest' },
            { label: 'D\xFCse (Nozzle)', val: Math.round(noz) + '\xB0C', pct: (noz / 260) * 100, color: '#f59e0b', sub: 'Ziel 220\xB0C' },
            { label: 'Heizbett (Bed)', val: Math.round(bed) + '\xB0C', pct: (bed / 100) * 100, color: '#fafafa', sub: 'Ziel 60\xB0C' }
          ];

          var amsSlots = [
            { label: 'Slot 1 PLA', value: 85, color: '#10b981' },
            { label: 'Slot 2 PETG', value: 65, color: '#fafafa' },
            { label: 'Slot 3 ABS', value: 40, color: '#f59e0b' },
            { label: 'Slot 4 TPU', value: 90, color: '#71717a' }
          ];

          var pRows = projs.slice(0, 5).map(function(pr) {
            return {
              title: pr.title || pr.name || '3D Modell',
              sub: pr.prompt || 'Parametrisches CSG-Modell',
              tag: (pr.stats?.filamentWeightG || 18) + 'g PLA',
              right: (pr.stats?.estimatedPrintMinutes || 35) + ' min'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Live Telemetrie & Druckfortschritt', 'Bambu Lab P1S', svgRingGauges(rings),
            'AMS Filament-F\xFCllst\xE4nde', '4 Spulen-Slots (%)', svgBarChart(amsSlots, '%'),
            'Aktuelle 3D-Modelle & Druck-Queue', 'cad', buildRowsHtml(pRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'google-calendar') {
          var calRes = await fetch(apiUrl('/api/apps/google-calendar/dashboard'));
          var calD = calRes.ok ? await calRes.json() : {};
          var evs = calD.events || [];
          var cals = calD.calendars || [];
          var nowMs = Date.now();
          var upcoming = evs.filter(function(e) { return new Date(e.end_time || e.start_time).getTime() >= nowMs; });

          var kpis = [
            { label: 'Anstehende Termine', value: String(upcoming.length), sub: 'Synchronisierte Events' },
            { label: 'Aktive Kalender', value: String(cals.length), sub: calD.googleOAuth?.authorized ? 'Google OAuth verbunden' : 'Lokale & ICS Feeds' },
            { label: 'N\xE4chster Termin', value: upcoming[0] ? String(upcoming[0].title).slice(0, 18) : 'Frei', sub: upcoming[0] ? new Date(upcoming[0].start_time).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Keine Termine' },
            { label: 'Fokus-Status', value: 'Nominal', sub: 'Zeitblock-Analyse aktiv' }
          ];

          var dayCounts = {};
          var dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
          for (var dIdx = 0; dIdx < 7; dIdx++) {
            var dt = new Date(nowMs + dIdx * 86400000);
            var key = dt.toISOString().slice(0, 10);
            dayCounts[key] = { label: dayNames[dt.getDay()] + ' ' + dt.getDate() + '.', value: 0 };
          }
          upcoming.forEach(function(e) {
            var k = String(e.start_time || '').slice(0, 10);
            if (dayCounts[k]) dayCounts[k].value += 1;
          });

          var calSegs = cals.slice(0, 5).map(function(c) {
            return { label: c.calendar_name || 'Kalender', value: Math.max(1, Number(c.event_count || 1)), color: c.color, display: (c.event_count || 0) + ' Ev.' };
          });

          var evList = upcoming.slice(0, 5).map(function(e) {
            var st = new Date(e.start_time);
            return {
              title: e.title || 'Termin',
              sub: e.calendar_name || e.location || 'Kalender',
              tag: st.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
              right: st.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            };
          });

          renderStartseiteSkeleton(
            kpis,
            '7-Tage Termin-Auslastung', 'Termine pro Tag', svgBarChart(Object.values(dayCounts), 'Termine'),
            'Kalender-Aufteilung', cals.length + ' Kalender', svgDonutChart(calSegs, String(evs.length), 'Gesamt'),
            'N\xE4chste 5 Termine', 'calendar', buildRowsHtml(evList)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'google-health') {
          var hRes = await fetch(apiUrl('/api/apps/google-health/dashboard'));
          var hD = hRes.ok ? await hRes.json() : {};
          var today = hD.today || hD.live || {};
          var hist = Array.isArray(hD.history) ? hD.history.slice(0, 14).reverse() : [];
          var steps = Number(today.steps ?? 0);
          var stepGoal = Number(today.step_goal ?? 10000);
          var sleepH = Number(today.sleep_hours ?? 7.4);
          var ready = Number(hD.readiness?.score ?? today.readiness_score ?? 84);
          var rhr = Number(today.resting_hr ?? 58);

          var kpis = [
            { label: 'Readiness Score', value: ready + ' / 100', sub: hD.readiness?.status || 'Erholung gut' },
            { label: 'Schritte Heute', value: fmtNum(steps, 0), sub: 'Ziel: ' + fmtNum(stepGoal, 0) },
            { label: 'Schlafdauer', value: fmtNum(sleepH, 1) + ' h', sub: 'Ziel: 8,0 h' },
            { label: 'Ruhepuls / HRV', value: rhr + ' bpm', sub: 'HRV: ' + (hD.hrvMs || 52) + ' ms' }
          ];

          var hVals = hist.length > 0 ? hist.map(function(x) { return Number(x.steps || x.readiness_score || 75); }) : [6400, 8200, 9100, 7800, 10400, 8900, steps || 7500];
          var hLbls = hist.length > 0 ? hist.map(function(x) { return String(x.date || '').slice(5, 10); }) : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'Heute'];

          var hRings = [
            { label: 'Readiness', val: String(ready), pct: ready, color: '#10b981', sub: 'Score' },
            { label: 'Schritte', val: Math.round((steps / Math.max(1, stepGoal)) * 100) + '%', pct: (steps / Math.max(1, stepGoal)) * 100, color: '#fafafa', sub: fmtNum(steps, 0) },
            { label: 'Schlaf', val: fmtNum(sleepH, 1) + 'h', pct: (sleepH / 8) * 100, color: '#f59e0b', sub: 'von 8h' }
          ];

          var workouts = (hD.workouts || hist).slice(0, 5).map(function(w) {
            return {
              title: w.activity_type || w.title || ('Tagesbilanz ' + (w.date || '')),
              sub: w.notes || ((w.steps ? fmtNum(w.steps, 0) + ' Schritte' : 'Vitaldaten')),
              tag: (w.calories_burned || w.active_calories || 420) + ' kcal',
              right: (w.duration_min ? w.duration_min + ' min' : (w.sleep_hours ? w.sleep_hours + ' h Schlaf' : 'Sync'))
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Aktivit\xE4ts- & Schritte-Trend (14 Tage)', 'Schritte / Tag', svgAreaChart(hVals, hLbls, 'Schritte', '#10b981'),
            'Heutige Vital-Ringe', 'Readiness \xB7 Schritte \xB7 Schlaf', svgRingGauges(hRings),
            'Aktuelle Trainings & Tageswerte', 'workouts', buildRowsHtml(workouts)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'meal-planner') {
          var [wRes, pRes2, gRes] = await Promise.all([
            fetch(apiUrl('/api/apps/meal-planner/week')),
            fetch(apiUrl('/api/apps/meal-planner/profile')),
            fetch(apiUrl('/api/apps/meal-planner/groceries'))
          ]);
          var wD = wRes.ok ? await wRes.json() : {};
          var pD = pRes2.ok ? await pRes2.json() : {};
          var gD = gRes.ok ? await gRes.json() : {};
          var prof = pD.profile || {};
          var calGoal = Number(prof.calorie_target || 2300);
          var protGoal = Number(prof.protein_target_g || 150);
          var plan = Array.isArray(wD.plan) ? wD.plan : [];
          var groceries = Array.isArray(gD.groceries || gD.items) ? (gD.groceries || gD.items) : [];
          var openGroceries = groceries.filter(function(g) { return !g.checked; });

          var totalKcal = plan.reduce(function(s, m) { return s + (Number(m.calories || m.kcal || 550)); }, 0);
          var dailyKcal = plan.length > 0 ? Math.round(totalKcal / Math.min(7, Math.max(1, Math.ceil(plan.length / 3)))) : 1950;
          var dailyProt = Math.round((dailyKcal * 0.28) / 4);

          var kpis = [
            { label: 'Kalorien-Ziel', value: fmtNum(dailyKcal, 0) + ' kcal', sub: 'Ziel: ' + fmtNum(calGoal, 0) + ' kcal/Tag' },
            { label: 'Protein-Bilanz', value: dailyProt + ' g', sub: 'Ziel: ' + protGoal + ' g/Tag' },
            { label: 'Geplante Mahlzeiten', value: String(plan.length), sub: 'Aktuelle Woche' },
            { label: 'Einkaufsliste', value: openGroceries.length + ' offen', sub: groceries.length + ' Artikel gesamt' }
          ];

          var mRings = [
            { label: 'Kalorien', val: fmtNum(dailyKcal, 0), pct: (dailyKcal / Math.max(1, calGoal)) * 100, color: '#fafafa', sub: 'kcal' },
            { label: 'Protein', val: dailyProt + 'g', pct: (dailyProt / Math.max(1, protGoal)) * 100, color: '#10b981', sub: 'Ziel ' + protGoal + 'g' },
            { label: 'Einkauf erledigt', val: (groceries.length - openGroceries.length) + '/' + groceries.length, pct: groceries.length ? ((groceries.length - openGroceries.length) / groceries.length) * 100 : 100, color: '#f59e0b', sub: 'Artikel' }
          ];

          var dayBars = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(function(d, idx) {
            var dayMeals = plan.filter(function(m) { return Number(m.day_index ?? idx) === idx; });
            var kc = dayMeals.reduce(function(s, m) { return s + Number(m.calories || m.kcal || 620); }, 0) || (1850 + (idx % 3) * 180);
            return { label: d, value: kc };
          });

          var mealRows = plan.slice(0, 5).map(function(m) {
            return {
              title: m.recipe_title || m.title || m.meal_name || 'Mahlzeit',
              sub: m.meal_type || m.slot || 'Tagesplan',
              tag: (m.calories || m.kcal || 580) + ' kcal',
              right: (m.protein_g || 38) + 'g Protein'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Wochen-Kalorienbilanz (Mo\u2013So)', 'kcal / Tag', svgBarChart(dayBars, 'kcal'),
            'Makro- & Einkaufs-Status', 'Tagesziele', svgRingGauges(mRings),
            'Aktuell geplante Mahlzeiten', 'planner', buildRowsHtml(mealRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'memo') {
          var [mRes, nRes] = await Promise.all([
            fetch(apiUrl('/api/apps/memo/overview')),
            fetch(apiUrl('/api/apps/memo/horizon-notes'))
          ]);
          var mD = mRes.ok ? await mRes.json() : {};
          var nD = nRes.ok ? await nRes.json() : {};
          var entries = mD.entries || mD.documents || [];
          var hNotes = nD.notes || [];

          var kpis = [
            { label: 'Dokumente & Notizen', value: String(entries.length + hNotes.length), sub: 'Lokaler Vault & Quick-Notes' },
            { label: 'Markdown Vault', value: String(entries.length), sub: 'Volltext-indexiert' },
            { label: 'Horizon Quick-Notes', value: String(hNotes.length), sub: 'JSON Notiz-Speicher' },
            { label: 'Cloud Sync', value: 'Bereit', sub: 'Google Keep & Drive' }
          ];

          var catMap = {};
          entries.concat(hNotes).forEach(function(e) {
            var cat = e.category || e.source || 'Notiz';
            catMap[cat] = (catMap[cat] || 0) + 1;
          });
          var segs2 = Object.keys(catMap).map(function(k) {
            return { label: k, value: catMap[k], display: catMap[k] + ' Dok.' };
          });

          var recentBars = (entries.concat(hNotes)).slice(0, 6).map(function(e, i) {
            var len = String(e.content || e.snippet || '').length || (120 + i * 45);
            return { label: String(e.title || e.fileName || ('Notiz ' + (i + 1))).slice(0, 8), value: len };
          });

          var mRows = entries.concat(hNotes).slice(0, 5).map(function(e) {
            return {
              title: e.title || (e.content ? String(e.content).slice(0, 48) : e.fileName) || 'Notiz',
              sub: e.category || e.fileName || 'Markdown Vault',
              tag: e.source || 'LOCAL',
              right: String(e.updated_at || e.createdAt || '').slice(0, 10) || 'Aktuell'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Dokumenten-Umfang (Zeichen / Notiz)', 'Letzte Eintr\xE4ge', svgBarChart(recentBars, 'Zeichen'),
            'Quellen- & Ordner-Verteilung', 'Vault Struktur', svgDonutChart(segs2, String(entries.length + hNotes.length), 'Notizen'),
            'Zuletzt bearbeitete Notizen', 'editor', buildRowsHtml(mRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'contacts') {
          var ctRes = await fetch(apiUrl('/api/apps/contacts/state'));
          var ctD = ctRes.ok ? await ctRes.json() : {};
          var contacts = ctD.contacts || [];
          var msgs = ctD.messages || ctD.threads || [];

          var kpis = [
            { label: 'Kontakte Gesamt', value: String(contacts.length), sub: 'Adressbuch & CRM' },
            { label: 'Nachrichten / Logs', value: String(msgs.length), sub: 'Kommunikations-Historie' },
            { label: 'Ungelesen / Offen', value: String(contacts.filter(function(c) { return c.unread_count > 0; }).length), sub: 'Follow-ups' },
            { label: 'Google Contacts', value: ctD.oauthConnected ? 'Verbunden' : 'Lokal', sub: 'Sync Status' }
          ];

          var grpMap = {};
          contacts.forEach(function(c) {
            var g = c.group_name || c.category || c.channel || 'Kontakte';
            grpMap[g] = (grpMap[g] || 0) + 1;
          });
          var cSegs = Object.keys(grpMap).map(function(k) {
            return { label: k, value: grpMap[k], display: grpMap[k] + ' Pers.' };
          });

          var cBars = contacts.slice(0, 6).map(function(c, i) {
            return { label: String(c.name || 'Kontakt').split(' ')[0], value: Number(c.message_count || c.interaction_count || (6 - i)) };
          });

          var cRows = contacts.slice(0, 5).map(function(c) {
            return {
              title: c.name || 'Kontakt',
              sub: c.email || c.phone || c.handle || 'Eintrag',
              tag: c.channel || c.group_name || 'CRM',
              right: c.last_message_at ? String(c.last_message_at).slice(0, 10) : 'Aktiv'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Interaktions-Frequenz pro Kontakt', 'Nachrichten / Logs', svgBarChart(cBars, 'Logs'),
            'Kreise & Kan\xE4le', contacts.length + ' Kontakte', svgDonutChart(cSegs, String(contacts.length), 'Kontakte'),
            'Wichtigste Kontakte & letzte Interaktionen', 'directory', buildRowsHtml(cRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'cortex') {
          var cxRes = await fetch(apiUrl('/api/apps/cortex/bootstrap'));
          var cxD = cxRes.ok ? await cxRes.json() : {};
          var runs = cxD.runs || [];
          var bps = cxD.blueprints || [];
          var intRes = await fetch(apiUrl('/api/apps/cortex/integrations'));
          var intD = intRes.ok ? await intRes.json() : {};
          var integrations = intD.integrations || [];
          var okInt = integrations.filter(function(i) { return i.configured || i.connected || i.status === 'connected'; }).length;

          var kpis = [
            { label: 'KI-Modell', value: cxD.config?.defaultModel || 'Gemini Flash', sub: 'Cortex Reasoning Engine' },
            { label: 'Ausgef\xFChrte Runs', value: String(runs.length), sub: 'Gespeicherte Synthesen' },
            { label: 'Blueprints', value: String(bps.length), sub: 'Agenten-Vorlagen' },
            { label: 'Credentials Vault', value: okInt + ' / ' + Math.max(okInt, integrations.length || 5), sub: 'Verbundene Dienste' }
          ];

          var runVals = runs.slice(0, 10).reverse().map(function(r) { return Number(r.duration_ms || 850); });
          var runLbls = runs.slice(0, 10).reverse().map(function(r, i) { return '#' + (i + 1); });

          var intSegs = [
            { label: 'Verbunden (Nominal)', value: Math.max(1, okInt), color: '#10b981', display: okInt + ' aktiv' },
            { label: 'Setup optional', value: Math.max(0, (integrations.length || 5) - okInt), color: '#52525b', display: Math.max(0, (integrations.length || 5) - okInt) + ' offen' }
          ];

          var rRows = runs.slice(0, 5).map(function(r) {
            return {
              title: r.topic || r.prompt || 'Cortex Synthese',
              sub: String(r.response_text || '').slice(0, 55),
              tag: r.model_used || 'Gemini',
              right: (r.duration_ms || 0) + ' ms'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Antwortzeiten der letzten KI-Runs (ms)', 'Latenz-Verlauf', svgAreaChart(runVals, runLbls, 'ms', '#10b981'),
            'Credentials Vault & Integrationen', 'Shared DB Status', svgDonutChart(intSegs, okInt + ' OK', 'Vault'),
            'Letzte Cortex KI-Erkenntnisse', 'workspace', buildRowsHtml(rRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'workflows') {
          var wfRes = await fetch(apiUrl('/api/apps/workflows/bootstrap'));
          var wfD = wfRes.ok ? await wfRes.json() : {};
          var wfs = wfD.workflows || [];
          var axons = wfD.axons || [];
          var logs = wfD.logs || wfD.executions || [];

          var kpis = [
            { label: 'Aktive Workflows', value: String(wfs.length), sub: 'DAG Pipelines' },
            { label: 'Registrierte Axons', value: String(axons.length), sub: 'Quasi-Agentische Aktionen' },
            { label: 'Ausf\xFChrungen', value: String(logs.length || wfs.length * 3), sub: 'Automations-L\xE4ufe' },
            { label: 'PC-Bridge KVM', value: wfD.pcBridge?.online ? 'Online' : 'Bereit', sub: 'Dev-PC .46 Steuerung' }
          ];

          var domMap = {};
          axons.forEach(function(a) {
            var d = a.category || a.domain || 'System';
            domMap[d] = (domMap[d] || 0) + 1;
          });
          var domBars = Object.keys(domMap).map(function(k) { return { label: k, value: domMap[k] }; });

          var wfSegs = [
            { label: 'Workflows', value: Math.max(1, wfs.length), color: '#fafafa', display: wfs.length + ' Flows' },
            { label: 'Axon-Module', value: Math.max(1, axons.length), color: '#10b981', display: axons.length + ' Axons' }
          ];

          var wfRows = (wfs.concat(axons)).slice(0, 5).map(function(w) {
            return {
              title: w.name || w.title || w.id || 'Workflow',
              sub: w.description || 'Automatisierte Sequenz',
              tag: w.category || 'AXON',
              right: 'Bereit'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Axons & Automationen nach Dom\xE4ne', 'Module pro Bereich', svgBarChart(domBars, 'Axons'),
            'Automations-Bestand', 'Workflows & Axons', svgDonutChart(wfSegs, String(wfs.length + axons.length), 'Gesamt'),
            'Wichtigste Workflows & Axons', 'editor', buildRowsHtml(wfRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'project-workflow') {
          var pwRes = await fetch(apiUrl('/api/apps/project-workflow/overview'));
          var pwD = pwRes.ok ? await pwRes.json() : {};
          var projs = pwD.projects || [];
          var issues = pwD.issues || [];
          var milestones = pwD.milestones || [];
          var openIssues = issues.filter(function(i) { return i.status !== 'done' && i.status !== 'closed'; });

          var kpis = [
            { label: 'Aktive Projekte', value: String(projs.length || 1), sub: 'Thassi Monorepo & Apps' },
            { label: 'Offene Issues / Tasks', value: String(openIssues.length), sub: issues.length + ' Tasks gesamt' },
            { label: 'Meilensteine', value: String(milestones.length), sub: 'Release-Planung' },
            { label: 'CI/CD Pipeline', value: 'Passing', sub: 'GitHub & Live-Deploy :8099' }
          ];

          var stMap = { Offen: 0, 'In Arbeit': 0, Erledigt: 0 };
          issues.forEach(function(i) {
            var st = String(i.status || 'open').toLowerCase();
            if (st === 'done' || st === 'closed') stMap.Erledigt++;
            else if (st.indexOf('prog') !== -1) stMap['In Arbeit']++;
            else stMap.Offen++;
          });
          var iSegs = [
            { label: 'Erledigt', value: Math.max(1, stMap.Erledigt), color: '#10b981', display: stMap.Erledigt + ' Tasks' },
            { label: 'In Arbeit', value: Math.max(1, stMap['In Arbeit']), color: '#f59e0b', display: stMap['In Arbeit'] + ' Tasks' },
            { label: 'Offen', value: Math.max(1, stMap.Offen), color: '#fafafa', display: stMap.Offen + ' Tasks' }
          ];

          var mBars = (milestones.length ? milestones : projs).slice(0, 6).map(function(m, idx) {
            return { label: String(m.title || m.name || ('M' + (idx + 1))).slice(0, 8), value: Number(m.progress || m.completionPercent || (70 + idx * 5)) };
          });

          var iRows = issues.slice(0, 5).map(function(iss) {
            return {
              title: iss.title || 'Task',
              sub: iss.project_name || iss.description || 'Development',
              tag: String(iss.priority || 'MEDIUM').toUpperCase(),
              right: String(iss.status || 'OPEN').toUpperCase()
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'Meilenstein- & Projekt-Fortschritt (%)', 'Velocity', svgBarChart(mBars, '%'),
            'Task-Status-Verteilung', issues.length + ' Tasks', svgDonutChart(iSegs, String(openIssues.length), 'Offen'),
            'Aktuelle Fokus-Tasks & Issues', 'issues', buildRowsHtml(iRows)
          );
          updateFreshnessLabel(true);
        } else if (appId === 'system-monitor') {
          var sRes = await fetch(apiUrl('/api/apps/system-monitor/snapshot'));
          var sD = sRes.ok ? await sRes.json() : {};
          var host = sD.host || {};
          var cpuPct = Number(host.cpuPercent ?? sD.cpuPercent ?? 18);
          var ramPct = Number(host.memoryPercent ?? sD.memoryPercent ?? 62);
          var diskPct = Number(host.diskPercent ?? sD.diskPercent ?? 44);
          var workloads = sD.workloads || sD.containers || [];

          var kpis = [
            { label: 'CPU-Auslastung', value: fmtNum(cpuPct, 1) + ' %', sub: host.cpuModel || 'HASS OS Host' },
            { label: 'RAM-Auslastung', value: fmtNum(ramPct, 1) + ' %', sub: fmtNum(host.memoryUsedGb || 4.8, 1) + ' / ' + fmtNum(host.memoryTotalGb || 8.0, 1) + ' GB' },
            { label: 'SSD-Speicher', value: fmtNum(diskPct, 1) + ' %', sub: 'Persistentes /data Volume' },
            { label: 'Aktive Container', value: String(workloads.length || 17), sub: 'Netzwerk & Cloud in Men\xFCleiste' }
          ];

          var sysRings = [
            { label: 'CPU Last', val: Math.round(cpuPct) + '%', pct: cpuPct, color: cpuPct > 80 ? '#ef4444' : '#10b981', sub: 'Kerne aktiv' },
            { label: 'Arbeitsspeicher', val: Math.round(ramPct) + '%', pct: ramPct, color: ramPct > 85 ? '#f59e0b' : '#fafafa', sub: 'RAM' },
            { label: 'SSD Speicher', val: Math.round(diskPct) + '%', pct: diskPct, color: '#10b981', sub: '/data' }
          ];

          var topContBars = workloads.slice(0, 6).map(function(w) {
            return { label: String(w.name || w.slug || 'addon').replace('44ec3c40_thassi_', '').slice(0, 8), value: Number(w.memoryMb || w.cpuPercent || 45) };
          });

          var wRows = workloads.slice(0, 5).map(function(w) {
            return {
              title: w.name || w.slug || 'Container',
              sub: w.state || w.status || 'running',
              tag: fmtNum(w.cpuPercent || 1.2, 1) + '% CPU',
              right: fmtNum(w.memoryMb || 85, 0) + ' MB RAM'
            };
          });

          renderStartseiteSkeleton(
            kpis,
            'System-Ressourcen (CPU \xB7 RAM \xB7 SSD)', 'Live Host Telemetrie', svgRingGauges(sysRings),
            'Top Container Speichernutzung (MB)', 'Docker / Supervisor', svgBarChart(topContBars, 'MB'),
            'Wichtigste Dienste & Add-on Container', 'containers', buildRowsHtml(wRows)
          );
          updateFreshnessLabel(true);
        }
      } catch (err) {
        console.warn('[Thassi Cockpit] Overview fetch fallback:', err);
        updateFreshnessLabel(false);
      }
    }

    function openActionDrawer(actionId) {
      var backdrop = document.getElementById('thassi-drawer-backdrop');
      var titleEl = document.getElementById('thassi-drw-title');
      var bodyEl = document.getElementById('thassi-drw-body');
      if (!backdrop || !titleEl || !bodyEl) return;

      if (actionId === 'all-lights-off') {
        fetch(apiUrl('/api/system/rooms')).then(function(r) { return r.json(); }).then(function(d) {
          var promises = [];
          (d.rooms || []).forEach(function(rm) {
            (rm.devices || []).forEach(function(dv) {
              if (dv.isOn && (dv.kind === 'toggle' || dv.kind === 'rgbw')) {
                promises.push(fetch(apiUrl('/api/system/device-action'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entityId: dv.entityId, action: 'turn_off' })
                }));
              }
            });
          });
          return Promise.all(promises);
        }).then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sample-all') {
        fetch(apiUrl('/api/apps/camera-vision/sample-now'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'start-print') {
        fetch(apiUrl('/api/apps/3d-print/printer/print'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'scan-bank') {
        fetch(apiUrl('/api/apps/finance-analytics/quick-import/scan-downloads'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-cal') {
        fetch(apiUrl('/api/apps/google-calendar/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'refresh-health' || actionId === 'refresh-sys') {
        loadOverviewData();
        return;
      }

      if (actionId === 'optimize-week') {
        fetch(apiUrl('/api/apps/meal-planner/plan/randomize'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-memo') {
        fetch(apiUrl('/api/apps/memo/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'sync-contacts') {
        fetch(apiUrl('/api/apps/contacts/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'open-vault') {
        setTab('vault');
        return;
      }

      if (actionId === 'sync-pc') {
        fetch(apiUrl('/api/apps/workflows/pc-bridge/sync'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'run-tests') {
        fetch(apiUrl('/api/apps/project-workflow/tests/run'), { method: 'POST' })
          .then(function() { loadOverviewData(); });
        return;
      }

      if (actionId === 'open-diagnostics') {
        setTab('logs');
        return;
      }

      // Slide-Over Forms for Creation Actions
      backdrop.classList.add('open');

      if (actionId === 'new-tx') {
        titleEl.textContent = 'Neue Buchung erfassen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Empf\xE4nger / Beschreibung</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. SPAR Supermarkt" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Betrag in EUR (Negativ f\xFCr Ausgabe)</label><input id="drw-f2" type="number" step="0.01" class="thassi-drw-input" placeholder="-42.50" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Kategorie</label><input id="drw-f3" class="thassi-drw-input" value="Lebensmittel" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-tx\\')">Buchung speichern</button>';
      } else if (actionId === 'new-event') {
        titleEl.textContent = 'Neuen Termin anlegen';
        var isoNow = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Besprechung / Fokus-Block" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Startzeit</label><input id="drw-f2" type="datetime-local" class="thassi-drw-input" value="' + isoNow + '" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Ort / Notiz</label><input id="drw-f3" class="thassi-drw-input" placeholder="B\xFCro / Online" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-event\\')">Termin speichern</button>';
      } else if (actionId === 'new-note') {
        titleEl.textContent = 'Schnell-Notiz im Vault speichern';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Titel der Notiz" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Inhalt (Markdown)</label><textarea id="drw-f2" rows="6" class="thassi-drw-input" placeholder="Gedanken, To-Dos, Fakten..."></textarea></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-note\\')">Im Vault sichern</button>';
      } else if (actionId === 'new-grocery') {
        titleEl.textContent = 'Artikel zur Einkaufsliste hinzuf\xFCgen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Artikel / Zutat</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. Hafermilch, Skyr, Lachs" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Menge / Einheit</label><input id="drw-f2" class="thassi-drw-input" value="1x" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-grocery\\')">Hinzuf\xFCgen</button>';
      } else if (actionId === 'new-biometric') {
        titleEl.textContent = 'Messwert / Training loggen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Aktivit\xE4t / Messwert</label><input id="drw-f1" class="thassi-drw-input" value="Krafttraining" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Dauer (Minuten)</label><input id="drw-f2" type="number" class="thassi-drw-input" value="45" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Kalorien (kcal)</label><input id="drw-f3" type="number" class="thassi-drw-input" value="380" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-biometric\\')">Eintrag speichern</button>';
      } else if (actionId === 'new-contact') {
        titleEl.textContent = 'Neuen Kontakt anlegen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Name</label><input id="drw-f1" class="thassi-drw-input" placeholder="Vor- und Nachname" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">E-Mail / Telefon</label><input id="drw-f2" class="thassi-drw-input" placeholder="name@example.com" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Gruppe</label><input id="drw-f3" class="thassi-drw-input" value="Freunde" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-contact\\')">Kontakt speichern</button>';
      } else if (actionId === 'new-issue') {
        titleEl.textContent = 'Neuen Dev-Task / Issue erstellen';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Task-Titel</label><input id="drw-f1" class="thassi-drw-input" placeholder="Feature oder Bugfix beschreiben" /></div>' +
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Priorit\xE4t</label><input id="drw-f2" class="thassi-drw-input" value="high" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-issue\\')">Task anlegen</button>';
      } else if (actionId === 'new-3d-model') {
        titleEl.textContent = 'KI 3D-Modell generieren';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">3D-Objekt beschreiben (Prompt)</label><input id="drw-f1" class="thassi-drw-input" placeholder="z.B. Kabelhalter f\xFCr Schreibtisch 35mm" /></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-3d-model\\')">3D-Modell generieren</button>';
      } else if (actionId === 'new-prompt') {
        titleEl.textContent = 'Cortex KI-Synthese starten';
        bodyEl.innerHTML =
          '<div class="thassi-drw-field"><label class="thassi-drw-label">Frage oder Auftrag an Cortex</label><textarea id="drw-f1" rows="5" class="thassi-drw-input" placeholder="Analysiere mein Haus, Finanzen und Termine..."></textarea></div>' +
          '<button class="thassi-mb-btn-primary" style="height:36px; justify-content:center; margin-top:8px;" onclick="window.__thassiSubmitDrawer(\\'new-prompt\\')">Absenden</button>';
      } else {
        backdrop.classList.remove('open');
        setTab(cfg.tabs[1] ? cfg.tabs[1].id : 'overview');
      }
    }

    async function submitDrawer(actionId) {
      var f1 = (document.getElementById('drw-f1') || {}).value || '';
      var f2 = (document.getElementById('drw-f2') || {}).value || '';
      var f3 = (document.getElementById('drw-f3') || {}).value || '';

      try {
        if (actionId === 'new-tx' && f1) {
          await fetch(apiUrl('/api/apps/finance-analytics/transactions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: f1, description: f1, amount: Number(f2 || 0), category: f3 || 'Allgemein', booking_date: new Date().toISOString().slice(0, 10) })
          });
        } else if (actionId === 'new-event' && f1) {
          var stIso = f2 ? new Date(f2).toISOString() : new Date().toISOString();
          var endIso = new Date(new Date(stIso).getTime() + 3600000).toISOString();
          await fetch(apiUrl('/api/apps/google-calendar/events'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1, start_time: stIso, end_time: endIso, location: f3 })
          });
        } else if (actionId === 'new-note' && (f1 || f2)) {
          await fetch(apiUrl('/api/apps/memo/entries'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1 || 'Schnellnotiz', content: f2 || f1, category: 'Notiz' })
          });
        } else if (actionId === 'new-grocery' && f1) {
          await fetch(apiUrl('/api/apps/meal-planner/groceries'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: f1, item: f1, quantity: f2 || '1x' })
          });
        } else if (actionId === 'new-biometric' && f1) {
          await fetch(apiUrl('/api/apps/google-health/workouts/log'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity_type: f1, duration_min: Number(f2 || 30), calories_burned: Number(f3 || 250) })
          });
        } else if (actionId === 'new-contact' && f1) {
          await fetch(apiUrl('/api/apps/contacts/contacts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: f1, email: f2, group_name: f3 || 'Kontakte' })
          });
        } else if (actionId === 'new-issue' && f1) {
          await fetch(apiUrl('/api/apps/project-workflow/projects/issues'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: f1, priority: f2 || 'medium', status: 'open' })
          });
        } else if (actionId === 'new-3d-model' && f1) {
          await fetch(apiUrl('/api/apps/3d-print/projects/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: f1 })
          });
        } else if (actionId === 'new-prompt' && f1) {
          await fetch(apiUrl('/api/apps/cortex/run'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: f1, topic: f1.slice(0, 50) })
          });
        }
      } catch (_e) {}

      var backdrop = document.getElementById('thassi-drawer-backdrop');
      if (backdrop) backdrop.classList.remove('open');
      loadOverviewData();
    }

    window.__thassiSwitchTab = setTab;
    window.__thassiOpenAction = openActionDrawer;
    window.__thassiSubmitDrawer = submitDrawer;
    window.__thassiCloseDrawer = function() {
      var b = document.getElementById('thassi-drawer-backdrop');
      if (b) b.classList.remove('open');
    };

    function mountCockpitDom() {
      if (document.getElementById('thassi-menubar')) return;

      var tabsHtml = cfg.tabs.map(function(t) {
        return '<button class="thassi-mb-tab' + (t.id === activeTabId ? ' active' : '') + '" data-tab="' + esc(t.id) + '" onclick="window.__thassiSwitchTab(\\'' + esc(t.id) + '\\')">' +
          '<span>' + esc(t.label) + '</span>' +
          (t.satellite ? '<span class="thassi-mb-tab-badge">MODUL</span>' : '') +
        '</button>';
      }).join('');

      var actionsHtml = (cfg.actions || []).map(function(a) {
        var cls = a.ghost ? 'thassi-mb-btn-ghost' : 'thassi-mb-btn-primary';
        return '<button class="' + cls + '" onclick="window.__thassiOpenAction(\\'' + esc(a.id) + '\\')">' + esc(a.label) + '</button>';
      }).join('');

      var menubar = document.createElement('header');
      menubar.id = 'thassi-menubar';
      menubar.innerHTML =
        '<div class="thassi-mb-left">' +
          '<span class="thassi-mb-title">' + esc(cfg.title) + '</span>' +
          '<div class="thassi-mb-status">' +
            '<span id="thassi-mb-dot" class="thassi-mb-dot"></span>' +
            '<span id="thassi-mb-ts">Stand: Live</span>' +
          '</div>' +
        '</div>' +
        '<nav class="thassi-mb-tabs">' + tabsHtml + '</nav>' +
        '<div class="thassi-mb-actions">' + actionsHtml + '</div>';

      var startseite = document.createElement('section');
      startseite.id = 'thassi-startseite';
      startseite.innerHTML = '<div style="padding:40px 0; text-align:center; color:#52525b; font-family:var(--font-mono); font-size:12px;">Lade Startseite & Diagramme...</div>';

      var satFrame = document.createElement('iframe');
      satFrame.id = 'thassi-satellite-container';
      satFrame.title = 'Thassi Submodule';

      var drawerBackdrop = document.createElement('div');
      drawerBackdrop.id = 'thassi-drawer-backdrop';
      drawerBackdrop.onclick = function(ev) {
        if (ev.target === drawerBackdrop) window.__thassiCloseDrawer();
      };
      drawerBackdrop.innerHTML =
        '<div id="thassi-drawer-panel">' +
          '<div class="thassi-drw-head">' +
            '<span id="thassi-drw-title" class="thassi-drw-title">Aktion</span>' +
            '<button class="thassi-drw-close" onclick="window.__thassiCloseDrawer()">\u2715</button>' +
          '</div>' +
          '<div id="thassi-drawer-body-wrap" class="thassi-drw-body"><div id="thassi-drw-body" style="display:flex; flex-direction:column; gap:14px;"></div></div>' +
        '</div>';

      document.body.insertBefore(satFrame, document.body.firstChild);
      document.body.insertBefore(startseite, document.body.firstChild);
      document.body.insertBefore(menubar, document.body.firstChild);
      document.body.appendChild(drawerBackdrop);

      setTab(activeTabId);
      loadOverviewData();
      setInterval(loadOverviewData, 30000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountCockpitDom);
    } else {
      mountCockpitDom();
    }
  })();
  `;
}
function getUniformAppStylesheetTag() {
  return `<style id="thassi-uniform-design-system">${UNIFORM_DESIGN_TOKENS_CSS}</style><script id="thassi-uniform-app-cockpit">${getUniformAppCockpitScript()}</script>`;
}

// thassi_host/src/hass-sidebar-sync.ts
function getHassSidebarStylerScript() {
  const escapedUniformCss = JSON.stringify(UNIFORM_DESIGN_TOKENS_CSS);
  return `
  (function initThassiHassSidebarStyler() {
    try {
      if (!window.__THASSI_INGRESS_FETCH_WRAPPED__ && typeof window.fetch === 'function') {
        window.__THASSI_INGRESS_FETCH_WRAPPED__ = true;
        const _origFetch = window.fetch.bind(window);
        window.fetch = function(input, init) {
          try {
            const p = window.location.pathname || '';
            const m = p.match(/^(\\/api\\/hassio_ingress\\/[^/]+)/);
            const prefix = (window.__THASSI_INGRESS_PATH__ || (m ? m[1] : '')).replace(/\\/+$/, '');
            if (prefix && typeof input === 'string' && (input.startsWith('/api/apps/') || input.startsWith('/api/system/'))) {
              input = prefix + input;
            }
          } catch (_e) {}
          return _origFetch(input, init);
        };
      }
    } catch (_err) {}

    const SUBTLE_BAR_BG = '#09090b';
    const UNIFORM_APP_CSS = ${escapedUniformCss};

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #09090b !important;
        --secondary-background-color: #111113 !important;
        --card-background-color: #111113 !important;
        --ha-card-background: #111113 !important;
        --ha-card-border-color: rgba(255, 255, 255, 0.06) !important;
        --ha-card-border-width: 1px !important;
        --ha-card-border-radius: 4px !important;
        --ha-card-box-shadow: none !important;
        --sidebar-background-color: \${SUBTLE_BAR_BG} !important;
        --sidebar-text-color: #a1a1aa !important;
        --sidebar-icon-color: #71717a !important;
        --sidebar-selected-text-color: #fafafa !important;
        --sidebar-selected-icon-color: #fafafa !important;
        --primary-color: #fafafa !important;
        --accent-color: #10b981 !important;
        --divider-color: rgba(255, 255, 255, 0.06) !important;
        --app-header-background-color: \${SUBTLE_BAR_BG} !important;
        --app-header-text-color: #fafafa !important;
        --mdc-theme-primary: #fafafa !important;
        --mdc-theme-surface: \${SUBTLE_BAR_BG} !important;
        background-color: #09090b !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer,
      aside.mdc-drawer {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .mdc-drawer__content {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
      }
    \`;

    const SIDEBAR_SHADOW_CSS = \`
      :host {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        color: #a1a1aa !important;
        border-right: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
      .menu {
        background: \${SUBTLE_BAR_BG} !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
        min-height: 52px !important;
        height: 52px !important;
      }
      .title {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        letter-spacing: 0.08em !important;
        text-transform: uppercase !important;
        color: #fafafa !important;
      }
      ha-md-list,
      paper-listbox,
      .ha-scrollbar {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding-top: 4px !important;
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        transition: background-color 0.12s ease, color 0.12s ease !important;
        transform: none !important;
        box-shadow: none !important;
        min-height: 34px !important;
        height: 34px !important;
        margin: 1px 6px !important;
        border-radius: 4px !important;
        border-left: 2px solid transparent !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        font-size: 12.5px !important;
        --md-list-item-one-line-container-height: 34px !important;
        --md-list-item-top-space: 4px !important;
        --md-list-item-bottom-space: 4px !important;
        --md-list-item-leading-space: 10px !important;
        --md-list-item-trailing-space: 10px !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        transform: none !important;
        box-shadow: none !important;
        background: #111113 !important;
        color: #fafafa !important;
      }
      a[href="/home"],
      a[href="/lovelace"],
      a[href="/light"],
      a[href="/security"],
      a[href="/climate"],
      a[href="/energy"],
      a[href="/media-browser"],
      a[href="/logbook"],
      a[href="/history"],
      a[href="/todo"],
      a[href="/calendar"],
      a[href="/map"],
      a[href="/thomas-buero"],
      a[href="/aishe-diagnose"],
      a[href="/aishe-details"],
      a[href="/aishe-security"],
      a[href="/aishe-energy"],
      ha-md-list-item[href="/home"],
      ha-md-list-item[href="/lovelace"],
      ha-md-list-item[href="/light"],
      ha-md-list-item[href="/security"],
      ha-md-list-item[href="/climate"],
      ha-md-list-item[href="/energy"],
      ha-md-list-item[href="/media-browser"],
      ha-md-list-item[href="/logbook"],
      ha-md-list-item[href="/history"],
      ha-md-list-item[href="/todo"],
      ha-md-list-item[href="/calendar"],
      ha-md-list-item[href="/map"],
      ha-md-list-item[href="/thomas-buero"],
      ha-md-list-item[href="/aishe-diagnose"],
      ha-md-list-item[href="/aishe-details"],
      ha-md-list-item[href="/aishe-security"],
      ha-md-list-item[href="/aishe-energy"],
      ha-md-list-item[data-panel="home"],
      ha-md-list-item[data-panel="lovelace"],
      ha-md-list-item[data-panel="light"],
      ha-md-list-item[data-panel="security"],
      ha-md-list-item[data-panel="climate"],
      ha-md-list-item[data-panel="energy"],
      ha-md-list-item[data-panel="media-browser"],
      ha-md-list-item[data-panel="logbook"],
      ha-md-list-item[data-panel="history"],
      ha-md-list-item[data-panel="todo"],
      ha-md-list-item[data-panel="calendar"],
      ha-md-list-item[data-panel="map"],
      ha-md-list-item[data-panel="thomas-buero"],
      ha-md-list-item[data-panel="aishe-diagnose"],
      ha-md-list-item[data-panel="aishe-details"],
      ha-md-list-item[data-panel="aishe-security"],
      ha-md-list-item[data-panel="aishe-energy"] {
        display: none !important;
      }
      ha-md-list[data-thassi-active-app] > ha-md-list-item[data-panel="44ec3c40_thassi_host"],
      ha-md-list[data-thassi-active-app] > a[href="/44ec3c40_thassi_host"] {
        --md-list-item-label-text-color: var(--sidebar-text-color) !important;
        --md-list-item-leading-icon-color: var(--sidebar-icon-color) !important;
        color: var(--sidebar-text-color) !important;
        background: transparent !important;
        border-left-color: transparent !important;
      }
      ha-md-list[data-thassi-active-app] > ha-md-list-item[data-panel="44ec3c40_thassi_host"]::before {
        opacity: 0 !important;
        display: none !important;
      }
      ha-md-list-item.selected,
      ha-md-list-item[selected],
      ha-md-list-item.thassi-custom-panel.selected {
        --md-list-item-label-text-color: #fafafa !important;
        --md-list-item-leading-icon-color: #fafafa !important;
        color: #fafafa !important;
        background: #141417 !important;
        border-left: 2px solid #fafafa !important;
      }
      ha-md-list-item.thassi-custom-panel.selected ha-icon,
      ha-md-list-item.selected ha-icon,
      ha-md-list-item[selected] ha-icon {
        color: #fafafa !important;
      }
      ha-md-list-item.thassi-custom-panel.selected .item-text,
      ha-md-list-item.selected .item-text,
      ha-md-list-item[selected] .item-text {
        color: #fafafa !important;
        font-weight: 500 !important;
      }
      .divider {
        border-color: rgba(255, 255, 255, 0.06) !important;
      }
    \`;

    function ensureStyleTag(root, id, cssText) {
      if (!root) return;
      let style = root.getElementById ? root.getElementById(id) : root.querySelector('#' + id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        style.textContent = cssText;
        (root.head || root).appendChild(style);
      } else if (style.textContent !== cssText) {
        style.textContent = cssText;
      }
    }

    try {
      if (typeof document !== 'undefined') {
        ensureStyleTag(document, 'thassi-uniform-design-system', UNIFORM_APP_CSS);
      }
    } catch (_e) {}

    function applyThassiChromeToParent() {
      try {
        if (!window.top || window.top === window) return;
        const topDoc = window.top.document;
        if (!topDoc) return;

        ensureStyleTag(topDoc, 'thassi-root-vars', ROOT_THEME_CSS);

        const ha = topDoc.querySelector('home-assistant');
        if (!ha || !ha.shadowRoot) return;
        ensureStyleTag(ha.shadowRoot, 'thassi-ha-vars', ROOT_THEME_CSS);

        const main = ha.shadowRoot.querySelector('home-assistant-main');
        if (!main || !main.shadowRoot) return;

        const drawer = main.shadowRoot.querySelector('ha-drawer');
        if (drawer && drawer.shadowRoot) {
          ensureStyleTag(drawer.shadowRoot, 'thassi-drawer-style', DRAWER_SHADOW_CSS);
          drawer.style.removeProperty('--mdc-drawer-width');
          const appContent = drawer.shadowRoot.querySelector('.mdc-drawer-app-content');
          if (appContent) {
            appContent.style.removeProperty('margin-inline-start');
            appContent.style.removeProperty('width');
          }
        }

        const sidebar = main.shadowRoot.querySelector('ha-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          ensureStyleTag(sidebar.shadowRoot, 'thassi-sidebar-style', SIDEBAR_SHADOW_CSS);

          // Ensure a persistent navigation helper exists in window.top's execution realm so listeners survive iframe switches
          window.top.__thassiOpenSidebarApp = new window.top.Function(
            'appId',
            'title',
            [
              'try {',
              '  var topWin = window.top || window;',
              '  var satMap = {',
              '    "floorplan": { parent: "smart-canvas", title: "Smart Home", hash: "#subpage=floorplan" },',
              '    "george-sync": { parent: "finance-analytics", title: "Finanzen", hash: "#subpage=george-sync" },',
              '    "network-monitor": { parent: "system-monitor", title: "System & Infra", hash: "#subpage=network-monitor" },',
              '    "google-usage": { parent: "system-monitor", title: "System & Infra", hash: "#subpage=google-usage" }',
              '  };',
              '  var subHash = "";',
              '  if (satMap[appId]) {',
              '    subHash = satMap[appId].hash;',
              '    title = satMap[appId].title;',
              '    appId = satMap[appId].parent;',
              '  }',
              '  topWin.__thassiActiveSidebarApp = appId;',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host" && hw && !hw.closed && typeof hw.openFullService === "function") {',
              '    topWin.history.replaceState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '    hw.openFullService(appId, title, subHash, true);',
              '    if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '    return false;',
              '  }',
              '  topWin.sessionStorage.setItem("thassi_open_app", JSON.stringify({ id: appId, title: title, hash: subHash, fromSidebar: true, ts: Date.now() }));',
              '  if (topWin.location.pathname !== "/44ec3c40_thassi_host") {',
              '    topWin.history.pushState(null, "", "/44ec3c40_thassi_host#" + appId);',
              '    topWin.dispatchEvent(new topWin.CustomEvent("location-changed", { bubbles: true, composed: true }));',
              '  }',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}',
              'return false;'
            ].join(' ')
          );

          window.top.__thassiCloseSidebarApp = new window.top.Function(
            'ev',
            [
              'try {',
              '  var topWin = window.top || window;',
              '  topWin.__thassiActiveSidebarApp = null;',
              '  topWin.sessionStorage.removeItem("thassi_open_app");',
              '  var hw = topWin.__thassiHorizonWin;',
              '  if (topWin.location.pathname === "/44ec3c40_thassi_host") {',
              '    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }',
              '    if (topWin.location.hash) {',
              '      topWin.history.replaceState(null, "", "/44ec3c40_thassi_host");',
              '    }',
              '    if (hw && !hw.closed && typeof hw.closeFullService === "function") {',
              '      hw.closeFullService();',
              '    }',
              '  } else {',
              '    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }',
              '    topWin.history.pushState(null, "", "/44ec3c40_thassi_host");',
              '    topWin.dispatchEvent(new topWin.CustomEvent("location-changed", { bubbles: true, composed: true }));',
              '  }',
              '  if (typeof topWin.__thassiSyncSidebarNow === "function") topWin.__thassiSyncSidebarNow();',
              '} catch (_err) {}',
              'return false;'
            ].join(' ')
          );

          const mdList = sidebar.shadowRoot.querySelector('ha-md-list, paper-listbox');
          if (mdList) {
            function stripLeadingSlashes(s) {
              let out = String(s || '');
              while (out.startsWith('/')) out = out.slice(1);
              return out;
            }

            function stripTrailingSlashes(s) {
              let out = String(s || '');
              while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
              return out;
            }

            function getItemPanelSlug(el) {
              if (!el) return '';
              const dp = (el.getAttribute && el.getAttribute('data-panel')) || '';
              if (dp) return stripLeadingSlashes(dp);
              let hr = (el.getAttribute && el.getAttribute('href')) || el.href || '';
              if (!hr && el.shadowRoot) {
                const innerA = el.shadowRoot.querySelector('a[href]');
                if (innerA) hr = innerA.getAttribute('href') || innerA.href || '';
              }
              if (hr) {
                try {
                  const u = new URL(hr, window.top.location.origin);
                  return stripLeadingSlashes(u.pathname);
                } catch (_e) {
                  return stripLeadingSlashes(hr).split('#')[0];
                }
              }
              return '';
            }

            function findSidebarPanelItem(slug) {
              const items = Array.from(mdList.children);
              for (let i = 0; i < items.length; i++) {
                const el = items[i];
                if (el.id && el.id.startsWith('thassi-nav-')) continue;
                if (getItemPanelSlug(el) === slug) return el;
              }
              return null;
            }

            const horizonItem = findSidebarPanelItem('44ec3c40_thassi_host');
            if (horizonItem) {
              horizonItem.onclick = window.top.__thassiCloseSidebarApp;
            }

            const anchorAfterItem =
              findSidebarPanelItem('44ec3c40_thassi_project_workflow') ||
              findSidebarPanelItem('44ec3c40_thassi_smart_canvas') ||
              findSidebarPanelItem('44ec3c40_thassi_google_calendar') ||
              findSidebarPanelItem('44ec3c40_thassi_meal_planner') ||
              findSidebarPanelItem('44ec3c40_thassi_google_health') ||
              findSidebarPanelItem('44ec3c40_thassi_finance_analytics') ||
              findSidebarPanelItem('44ec3c40_thassi_cortex') ||
              findSidebarPanelItem('44ec3c40_thassi_memo') ||
              findSidebarPanelItem('44ec3c40_thassi_workflows') ||
              horizonItem;

            const SATELLITE_HIDDEN_IDS = {
              'floorplan': true,
              'george-sync': true,
              'network-monitor': true,
              'google-usage': true
            };

            function bindSidebarItemClick(el, appId, title, isHiddenSatellite) {
              if (!el) return;
              if (isHiddenSatellite) {
                el.style.display = 'none';
              } else {
                el.style.removeProperty('display');
              }
              el.onclick = new window.top.Function(
                'ev',
                'if (ev) { ev.preventDefault(); ev.stopPropagation(); } return window.top.__thassiOpenSidebarApp(' +
                  JSON.stringify(appId) +
                  ', ' +
                  JSON.stringify(title) +
                  ');'
              );
            }

            function ensureNativeSidebarItem(navId, appId, panelSlug, title, iconName, refAfterEl, isHiddenSatellite) {
              const existingNative = findSidebarPanelItem(panelSlug);
              if (existingNative) {
                const dupCustom = mdList.querySelector('#' + navId);
                if (dupCustom) dupCustom.remove();
                bindSidebarItemClick(existingNative, appId, title, isHiddenSatellite);
                return existingNative;
              }
              let item = mdList.querySelector('#' + navId);
              if (item && item.tagName.toLowerCase() !== 'ha-md-list-item') {
                item.remove();
                item = null;
              }
              if (!item) {
                const sampleItem =
                  anchorAfterItem ||
                  horizonItem ||
                  Array.from(mdList.querySelectorAll('ha-md-list-item')).find(
                    (el) => !el.id || !el.id.startsWith('thassi-nav-')
                  );
                const sampleText = sampleItem ? sampleItem.querySelector('.item-text, [slot="headline"]') : null;
                const sampleIcon = sampleItem ? sampleItem.querySelector('ha-icon') : null;
                const textSlot = sampleText ? sampleText.getAttribute('slot') : 'headline';
                const iconSlot = (sampleIcon && sampleIcon.getAttribute('slot')) || 'start';

                item = topDoc.createElement('ha-md-list-item');
                item.id = navId;
                item.className = 'thassi-custom-panel';
                item.setAttribute('type', 'link');
                item.type = 'link';
                item.setAttribute('data-panel', panelSlug);
                item.href = '/44ec3c40_thassi_host#' + appId;

                const iconEl = topDoc.createElement('ha-icon');
                if (iconSlot) iconEl.setAttribute('slot', iconSlot);
                iconEl.setAttribute('icon', iconName);
                iconEl.icon = iconName;

                const spanEl = topDoc.createElement('span');
                spanEl.className = 'item-text';
                if (textSlot) spanEl.setAttribute('slot', textSlot);
                spanEl.textContent = title;

                item.appendChild(iconEl);
                item.appendChild(spanEl);
              }
              if (refAfterEl && item !== refAfterEl && item.previousElementSibling !== refAfterEl) {
                if (refAfterEl.nextSibling) {
                  mdList.insertBefore(item, refAfterEl.nextSibling);
                } else {
                  mdList.appendChild(item);
                }
              } else if (!item.parentElement) {
                mdList.appendChild(item);
              }
              bindSidebarItemClick(item, appId, title, isHiddenSatellite);
              return item;
            }

            const STATIC_CUSTOM_APPS = [
              { id: 'smart-canvas', navId: 'thassi-nav-smart-canvas', title: 'Smart Home', icon: 'mdi:home-lightning-bolt-outline' },
              { id: 'camera-vision', navId: 'thassi-nav-camera-vision', title: 'Kameras & Vision', icon: 'mdi:cctv' },
              { id: '3d-print', navId: 'thassi-nav-3d-print', title: '3D Druck Studio', icon: 'mdi:printer-3d-nozzle' },
              { id: 'finance-analytics', navId: 'thassi-nav-finance-analytics', title: 'Finanzen', icon: 'mdi:chart-areaspline' },
              { id: 'google-calendar', navId: 'thassi-nav-google-calendar', title: 'Kalender & Zeit', icon: 'mdi:calendar-clock' },
              { id: 'google-health', navId: 'thassi-nav-google-health', title: 'Gesundheit', icon: 'mdi:heart-pulse' },
              { id: 'meal-planner', navId: 'thassi-nav-meal-planner', title: 'Ern\xE4hrung & Einkauf', icon: 'mdi:silverware-fork-knife' },
              { id: 'memo', navId: 'thassi-nav-memo', title: 'Memo', icon: 'mdi:notebook-outline' },
              { id: 'contacts', navId: 'thassi-nav-contacts', title: 'Kontakte', icon: 'mdi:account-multiple-outline' },
              { id: 'cortex', navId: 'thassi-nav-cortex', title: 'Cortex', icon: 'mdi:brain' },
              { id: 'workflows', navId: 'thassi-nav-workflows', title: 'Workflows', icon: 'mdi:sitemap-outline' },
              { id: 'project-workflow', navId: 'thassi-nav-project-workflow', title: 'Dev-Projekte', icon: 'mdi:source-branch-check' },
              { id: 'system-monitor', navId: 'thassi-nav-system-monitor', title: 'System & Infra', icon: 'mdi:pulse' },
              // Consolidated satellite apps (integrated as Men\xFCleiste subpages; hidden in main sidebar)
              { id: 'floorplan', navId: 'thassi-nav-floorplan', title: 'Grundriss 2D', icon: 'mdi:floor-plan', satellite: true },
              { id: 'george-sync', navId: 'thassi-nav-george-sync', title: 'Erste Bank Sync', icon: 'mdi:bank-transfer', satellite: true },
              { id: 'network-monitor', navId: 'thassi-nav-network-monitor', title: 'Netzwerk & Router', icon: 'mdi:router-network', satellite: true },
              { id: 'google-usage', navId: 'thassi-nav-google-usage', title: 'Google Usage & AI', icon: 'mdi:chart-box-outline', satellite: true }
            ];

            const dynamicApps = Array.isArray(window.top.__thassiDeployedApps)
              ? window.top.__thassiDeployedApps
              : Array.isArray(window.__THASSI_DEPLOYED_APPS__)
                ? window.__THASSI_DEPLOYED_APPS__
                : [];

            const mergedCustomApps = STATIC_CUSTOM_APPS.slice();
            for (let dIdx = 0; dIdx < dynamicApps.length; dIdx++) {
              const dApp = dynamicApps[dIdx];
              if (!dApp || !dApp.id || dApp.hideFromSidebar) continue;
              if (!mergedCustomApps.some(function(x) { return x.id === dApp.id; })) {
                mergedCustomApps.push({
                  id: dApp.id,
                  title: dApp.name || dApp.title || dApp.id,
                  icon: dApp.icon || 'mdi:application-outline',
                  satellite: Boolean(SATELLITE_HIDDEN_IDS[dApp.id])
                });
              }
            }

            let prevInsertedItem = horizonItem || anchorAfterItem;
            const createdSidebarItems = {};
            const knownCustomIds = {};
            for (let cIdx = 0; cIdx < mergedCustomApps.length; cIdx++) {
              const cfg = mergedCustomApps[cIdx];
              knownCustomIds[cfg.id] = true;
              const slug = '44ec3c40_thassi_' + cfg.id.replace(/[^a-z0-9_]/gi, '_');
              const isSat = Boolean(cfg.satellite || SATELLITE_HIDDEN_IDS[cfg.id]);
              const navEl = ensureNativeSidebarItem(
                'thassi-nav-' + cfg.id,
                cfg.id,
                slug,
                cfg.title,
                cfg.icon,
                prevInsertedItem || anchorAfterItem,
                isSat
              );
              if (navEl) {
                createdSidebarItems[cfg.id] = navEl;
                if (!isSat) {
                  prevInsertedItem = navEl;
                }
              }
            }

            const topPath = stripTrailingSlashes(window.top.location.pathname || '');
            const rawTopHash = String(window.top.location.hash || '');
            const topHash = rawTopHash.startsWith('#') ? rawTopHash.slice(1) : rawTopHash;
            let activeCustomApp = null;
            if (topPath === '/44ec3c40_thassi_host') {
              if (topHash && knownCustomIds[topHash]) {
                activeCustomApp = topHash;
                window.top.__thassiActiveSidebarApp = topHash;
              } else if (window.top.__thassiActiveSidebarApp) {
                activeCustomApp = window.top.__thassiActiveSidebarApp;
              }
            } else {
              window.top.__thassiActiveSidebarApp = null;
            }

            if (activeCustomApp) {
              mdList.setAttribute('data-thassi-active-app', activeCustomApp);
              if (horizonItem) horizonItem.classList.remove('selected');
            } else {
              mdList.removeAttribute('data-thassi-active-app');
              if (horizonItem && topPath === '/44ec3c40_thassi_host') {
                horizonItem.classList.add('selected');
              }
            }

            for (let cIdx = 0; cIdx < mergedCustomApps.length; cIdx++) {
              const appId = mergedCustomApps[cIdx].id;
              const el = createdSidebarItems[appId];
              if (el) {
                el.classList.toggle('selected', activeCustomApp === appId);
              }
            }
          }
        }

        window.top.__thassiSyncSidebarNow = applyThassiChromeToParent;

        // Persist clean sidebar order (14 Main Apps) & hidden satellite/default panels in localStorage
        try {
          const hidden = [
            "home","lovelace","light","security","climate","energy",
            "media-browser","logbook","history","todo","calendar",
            "map","thomas-buero","aishe-diagnose","aishe-details","aishe-security","aishe-energy",
            "44ec3c40_thassi_floorplan","44ec3c40_thassi_george_sync",
            "44ec3c40_thassi_network_monitor","44ec3c40_thassi_google_usage"
          ];
          const order = [
            "44ec3c40_thassi_host",
            "44ec3c40_thassi_smart_canvas",
            "44ec3c40_thassi_camera_vision",
            "44ec3c40_thassi_3d_print",
            "44ec3c40_thassi_finance_analytics",
            "44ec3c40_thassi_google_calendar",
            "44ec3c40_thassi_google_health",
            "44ec3c40_thassi_meal_planner",
            "44ec3c40_thassi_memo",
            "44ec3c40_thassi_contacts",
            "44ec3c40_thassi_cortex",
            "44ec3c40_thassi_workflows",
            "44ec3c40_thassi_project_workflow",
            "44ec3c40_thassi_system_monitor",
            "hacs"
          ];
          window.top.localStorage.setItem('sidebarHiddenPanels', JSON.stringify(hidden));
          window.top.localStorage.setItem('sidebarPanelOrder', JSON.stringify(order));
        } catch (_e) {}

        const panelLovelace = main.shadowRoot.querySelector('ha-panel-lovelace');
        const huiRoot = panelLovelace && panelLovelace.shadowRoot && panelLovelace.shadowRoot.querySelector('hui-root');
        if (huiRoot && huiRoot.shadowRoot) {
          const oldFullbleed = huiRoot.shadowRoot.getElementById
            ? huiRoot.shadowRoot.getElementById('thassi-lovelace-fullbleed')
            : huiRoot.shadowRoot.querySelector('#thassi-lovelace-fullbleed');
          if (oldFullbleed) oldFullbleed.remove();
        }
      } catch (_err) {
        // Cross-origin fallback (when opened directly on :8099 outside Home Assistant)
      }
    }

    window.syncThassiSidebarSky = function(_skyOverlayGradient) {
      // No-op: keep sidebar solid #09090b achromatic background
    };

    window.toggleHassMobileSidebar = function() {
      try {
        if (!window.top || window.top === window) return false;
        const ha = window.top.document.querySelector('home-assistant');
        const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
        if (main) {
          main.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
          return true;
        }
      } catch (_e) {}
      return false;
    };

    function refreshDeployedAppsForSidebar() {
      try {
        fetch('/api/system/status')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
            if (data && Array.isArray(data.apps)) {
              window.__THASSI_DEPLOYED_APPS__ = data.apps;
              if (window.top) window.top.__thassiDeployedApps = data.apps;
              applyThassiChromeToParent();
            }
          })
          .catch(function() {});
      } catch (_e) {}
    }

    refreshDeployedAppsForSidebar();
    setInterval(refreshDeployedAppsForSidebar, 15000);
    applyThassiChromeToParent();
    setInterval(applyThassiChromeToParent, 1200);
  })();
  `;
}
function syncHassFrontendFiles() {
  const candidateConfigDirs = ["/homeassistant", "/config"];
  for (const cfgDir of candidateConfigDirs) {
    if (!fs3.existsSync(path3.join(cfgDir, "configuration.yaml"))) continue;
    try {
      const wwwDir = path3.join(cfgDir, "www");
      fs3.mkdirSync(wwwDir, { recursive: true });
      const stylerJs = getHassSidebarStylerScript();
      fs3.writeFileSync(path3.join(wwwDir, "thassi-ui.js"), stylerJs, "utf-8");
      const loaderHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>html,body{margin:0;padding:0;background:#09090b;overflow:hidden;width:100%;height:100%;}iframe{width:100%;height:100%;border:0;display:block;}</style>
</head>
<body>
  <iframe id="thassi-fallback-frame" title="Thassi Horizon"></iframe>
  <script>${stylerJs}
  try {
    var f = document.getElementById('thassi-fallback-frame');
    if (f) {
      f.src = window.location.protocol + '//' + (window.location.hostname || '192.168.188.92') + ':8099/';
    }
    if (window.top && window.top.location.pathname.startsWith('/lovelace')) {
      window.top.history.pushState(null, '', '/44ec3c40_thassi_host');
      window.top.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
    }
  } catch (e) {}
  </script>
</body>
</html>`;
      fs3.writeFileSync(path3.join(wwwDir, "thassi-loader.html"), loaderHtml, "utf-8");
      console.log(`[Thassi] Synced /local/thassi-ui.js and /local/thassi-loader.html to ${wwwDir}`);
    } catch (err) {
      console.warn("[Thassi] Could not write to www dir:", err);
    }
  }
}

// thassi_host/src/ambient-dashboard.ts
function renderUnifiedDashboardHtml(ingressPath) {
  const sidebarStylerScript = getHassSidebarStylerScript();
  const uniformStylesheetTag = getUniformAppStylesheetTag();
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  ${uniformStylesheetTag}
  <style>
    :root {
      --bg-canvas: #09090b;
      --bg-elevated: #111113;
      --bg-input: #141417;
      --line-hairline: rgba(255, 255, 255, 0.06);
      --line-strong: rgba(255, 255, 255, 0.12);
      --line-focus: rgba(255, 255, 255, 0.24);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;
      --dot-ok: #10b981;
      --dot-warn: #f59e0b;
      --dot-err: #ef4444;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    }

    * { box-sizing: border-box; user-select: none; }
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }

    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100dvh;
      overflow: hidden;
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
    }

    /* Legacy compatibility layers hidden */
    #left-ambient-navbar,
    #mobile-nav-toggle,
    #mobile-nav-backdrop,
    #sky-stage,
    #pinned-rooms-tray,
    #timeline-devices-separator {
      display: none !important;
    }

    /* ============================================================================
       ZONE A: UNIFORM TOP HEADER BAR (52PX)
       ============================================================================ */
    #horizon-header-bar {
      height: 52px;
      min-height: 52px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 60;
    }

    .hh-left {
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
      flex-shrink: 0;
    }

    .hh-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .hh-title {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: -0.025em;
      color: var(--text-primary);
    }

    .hh-code {
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      padding: 2px 6px;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      background: var(--bg-elevated);
    }

    .hh-vsep {
      width: 1px;
      height: 20px;
      background: var(--line-hairline);
    }

    /* Inline Clock & Date */
    #hero-clock-region {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      gap: 2px;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
    #hero-time {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    #hero-seconds {
      font-size: 12px;
      color: var(--text-muted);
    }
    #hero-seconds::before {
      content: ":";
    }
    #hero-date-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hero-date {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .hero-cal-icon-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      padding: 3px 5px;
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
    }
    .hero-cal-icon-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
      background: var(--bg-elevated);
    }
    #solar-telemetry {
      display: none;
    }

    /* Inline Weather Telemetry */
    #hero-weather-strip {
      display: flex;
      align-items: center;
    }
    .mw-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .mw-icon-wrap {
      display: inline-flex;
      align-items: center;
      color: var(--text-secondary);
    }
    .mw-temp-now {
      font-family: var(--font-mono);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .mw-cond-text {
      color: var(--text-secondary);
      font-size: 12px;
      white-space: nowrap;
    }
    .mw-hi-lo {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /* Inline Cortex Command Bar in Header */
    #horizon-cortex-center-stage {
      position: relative;
      flex: 1;
      max-width: 540px;
      min-width: 220px;
      z-index: 80;
    }
    .cortex-prompt-pill {
      width: 100%;
      height: 34px;
      border-radius: 4px;
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      display: flex;
      align-items: center;
      padding: 0 4px 0 10px;
      gap: 8px;
      transition: border-color 0.15s ease;
    }
    .cortex-prompt-pill:focus-within,
    .cortex-prompt-pill:hover {
      border-color: var(--line-focus);
    }
    .cortex-prompt-pill.is-waiting {
      border-color: var(--text-primary);
    }
    .cortex-ai-icon-wrap {
      display: flex;
      align-items: center;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .cortex-prompt-input {
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 12.5px;
    }
    .cortex-prompt-input::placeholder {
      color: var(--text-muted);
    }
    .cortex-waiting-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 10.5px;
      white-space: nowrap;
    }
    .cortex-waiting-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-warn);
    }
    .cortex-send-btn {
      height: 26px;
      padding: 0 10px;
      border-radius: 3px;
      background: var(--text-primary);
      color: var(--bg-canvas);
      border: none;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .cortex-send-btn:hover:not(:disabled) {
      background: #e4e4e7;
    }
    .cortex-send-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    /* Cortex Dropdown & Response Flyout */
    #cortex-preview-dropdown,
    #cortex-response-card {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      border-radius: 4px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      max-height: 420px;
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      z-index: 95;
    }
    .cortex-preview-item {
      padding: 8px 10px;
      border-radius: 3px;
      background: var(--bg-canvas);
      border: 1px solid var(--line-hairline);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .cortex-preview-item:hover {
      border-color: var(--line-focus);
      background: var(--bg-input);
    }
    .cortex-preview-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .cortex-badge-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 500;
      padding: 2px 5px;
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--line-hairline);
      flex-shrink: 0;
    }
    .cortex-resp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line-hairline);
      padding-bottom: 8px;
      gap: 8px;
    }
    .cortex-resp-body {
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Right Freshness & Status Strip */
    .hh-right {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .hh-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--text-primary);
      font-size: 10.5px;
    }

    /* ============================================================================
       ZONE B: 4-COLUMN EXECUTIVE KPI STRIP (#top-right-widgets)
       ============================================================================ */
    #top-right-widgets {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      z-index: 45;
      flex-shrink: 0;
    }

    .ambient-widget {
      position: relative;
      padding: 12px 24px;
      border-right: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: center;
      transition: background-color 0.12s ease;
    }
    .ambient-widget:last-child {
      border-right: none;
    }
    .ambient-widget:hover {
      background: var(--bg-elevated);
    }

    .w-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    }
    .w-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .w-label-left {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-ok);
      box-shadow: none !important;
      flex-shrink: 0;
    }
    .w-primary {
      font-family: var(--font-mono);
      font-size: 20px;
      font-weight: 400;
      letter-spacing: -0.025em;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      display: flex;
      align-items: baseline;
      gap: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .w-primary strong {
      font-weight: 500;
    }
    .w-sub {
      display: block;
      font-size: 11.5px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .health-minimal-badges {
      display: none;
    }
    #compact-health {
      display: flex !important;
    }
    #sub-health {
      display: block !important;
    }

    .finances-eye-icon-btn {
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      cursor: pointer;
    }
    .finances-eye-icon-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
    }

    .w-nav-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      color: var(--text-secondary);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      cursor: pointer;
    }
    .w-nav-btn:hover {
      background: var(--bg-input);
      border-color: var(--line-focus);
      color: var(--text-primary);
    }

    /* Expandable Inspector Popover below KPI Cell */
    .w-expand-body {
      display: none;
      position: absolute;
      top: calc(100% + 1px);
      left: 0;
      width: min(360px, 94vw);
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      padding: 14px 16px;
      z-index: 85;
      cursor: default;
    }
    #widget-notes .w-expand-body,
    #widget-finances .w-expand-body {
      left: auto;
      right: 0;
    }
    .ambient-widget.expanded {
      background: var(--bg-elevated);
    }
    .ambient-widget.expanded .w-expand-body {
      display: block;
    }

    .w-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      margin-bottom: 12px;
    }
    .w-stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .w-stat-k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .w-stat-v {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .w-action-link {
      background: none;
      border: none;
      padding: 0;
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .minimal-input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 6px 10px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      outline: none;
    }
    .minimal-input:focus {
      border-color: var(--line-focus);
    }

    #notes-list {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .note-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      font-size: 12px;
    }
    .note-row-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .note-content-text {
      flex: 1;
      line-height: 1.4;
      color: var(--text-primary);
      word-break: break-word;
      user-select: text;
    }
    .note-row-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .note-file-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
    }
    .note-actions-group {
      display: inline-flex;
      gap: 4px;
    }
    .note-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .note-action-btn:hover,
    .note-action-btn.synced {
      border-color: var(--line-focus);
      color: var(--text-primary);
    }
    .note-del {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
    }
    .note-del:hover { color: var(--dot-err); }

    /* ============================================================================
       ZONE C: PRIMARY HAIRLINE WORKSPACE (MASTER ROOM MATRIX + RIGHT INSPECTOR)
       ============================================================================ */
    #devices-dock {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      background: var(--bg-canvas);
      overflow: hidden;
    }

    /* Left Column: Smart Home Room & Device Matrix */
    .sh-matrix-column {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--line-hairline);
    }

    #room-dock-bar {
      height: 40px;
      min-height: 40px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sh-bar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }

    .sh-section-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      white-space: nowrap;
    }

    #sh-matrix-summary {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .room-dock-group::-webkit-scrollbar { display: none; }

    .room-pill {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 3px 8px;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      white-space: nowrap;
    }
    .room-pill:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
      background: var(--bg-input);
    }
    .room-pill.pinned-tab {
      color: var(--bg-canvas);
      background: var(--text-primary);
      border-color: var(--text-primary);
    }
    .room-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .room-pill.has-on .room-dot {
      background: var(--dot-ok);
    }
    .room-lightbulb-icon {
      display: none;
    }
    .td-sep-unpin-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
    }

    /* Live Hairline Room Grid */
    #rooms-live-matrix-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      align-content: start;
      background: var(--bg-canvas);
    }

    .sh-room-cell {
      border-right: 1px solid var(--line-hairline);
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      flex-direction: column;
      background: var(--bg-canvas);
    }

    .sh-room-head {
      height: 36px;
      padding: 0 16px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .sh-room-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sh-room-name {
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-primary);
    }
    .sh-room-meta-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sh-room-telemetry {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .sh-room-off-btn {
      background: transparent;
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 9.5px;
      padding: 1px 6px;
      cursor: pointer;
    }
    .sh-room-off-btn:hover {
      color: var(--text-primary);
      border-color: var(--line-focus);
    }

    .sh-room-devices {
      display: flex;
      flex-direction: column;
    }

    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      transition: background-color 0.12s ease;
    }
    .rf-dev-row:last-child {
      border-bottom: none;
    }
    .rf-dev-row:hover {
      background: var(--bg-elevated);
    }
    .rf-dev-row.is-on {
      background: rgba(255, 255, 255, 0.02);
    }
    .rf-dev-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .rf-dev-label {
      font-size: 12.5px;
      font-weight: 400;
      color: var(--text-secondary);
    }
    .rf-dev-row.is-on .rf-dev-label {
      color: var(--text-primary);
      font-weight: 500;
    }
    .rf-dev-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rf-power-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 3px 9px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      background: var(--bg-input);
      color: var(--text-secondary);
    }
    .rf-toggle-btn:hover {
      border-color: var(--line-focus);
      color: var(--text-primary);
    }
    .rf-toggle-btn.on {
      background: var(--text-primary);
      color: var(--bg-canvas);
      border-color: var(--text-primary);
      font-weight: 600;
    }
    .rf-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;
    }
    .rf-slider {
      flex: 1;
      accent-color: var(--text-primary);
      height: 3px;
      cursor: pointer;
    }
    .rf-effect-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: 1px solid var(--line-hairline);
      border-radius: 3px;
      padding: 1px 6px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      background: var(--bg-input);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: var(--text-primary);
      color: var(--bg-canvas);
      border-color: var(--text-primary);
    }

    /* Right Column: Hardware, 3D Print & Vision Inspector (#statusbar-right-previews) */
    #statusbar-right-previews {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      background: var(--bg-canvas);
    }

    .sb-preview-item {
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      flex-direction: column;
    }
    .sb-preview-head {
      height: 36px;
      padding: 0 16px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--line-hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sb-preview-trigger {
      background: transparent;
      border: none;
      padding: 0;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
    }
    .sb-meta {
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 400;
      color: var(--text-secondary);
      text-transform: none;
      letter-spacing: 0;
    }
    .sb-caret {
      display: none;
    }
    .sb-upward-flyout {
      padding: 12px 16px;
      background: var(--bg-canvas);
      display: block !important;
      opacity: 1 !important;
      visibility: visible !important;
      position: static !important;
      width: 100% !important;
      border: none !important;
      box-shadow: none !important;
      transform: none !important;
      pointer-events: auto !important;
    }
    .w-3d-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .w-3d-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    /* ============================================================================
       ZONE D: BOTTOM 24H CHRONOLOGICAL HORIZON TIMELINE (#timeline-dock)
       ============================================================================ */
    #timeline-dock {
      height: 185px;
      min-height: 185px;
      border-top: 1px solid var(--line-hairline);
      background: var(--bg-canvas);
      display: flex;
      flex-direction: column;
      z-index: 30;
      flex-shrink: 0;
    }

    #timeline-toolbar {
      height: 34px;
      min-height: 34px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line-hairline);
      background: var(--bg-elevated);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .tl-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tl-pill {
      background: none;
      border: none;
      border-bottom: 1px solid transparent;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 4px 2px;
    }
    .tl-pill:hover, .tl-pill.active {
      color: var(--text-primary);
      border-bottom-color: var(--text-primary);
    }
    .tl-pill.return-now {
      color: var(--text-primary);
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      padding: 2px 8px;
      display: none;
    }

    #timeline-viewport {
      position: relative;
      width: 100%;
      flex: 1;
      overflow: hidden;
      cursor: grab;
      background: var(--bg-canvas);
    }
    #timeline-viewport:active { cursor: grabbing; }

    #fixed-now-marker {
      position: absolute;
      left: 25%;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--text-primary);
      z-index: 25;
      pointer-events: none;
    }
    #fixed-now-badge {
      position: absolute;
      top: 4px;
      left: 0;
      transform: translateX(-50%);
      padding: 1px 6px;
      border-radius: 2px;
      background: var(--text-primary);
      color: var(--bg-canvas);
      font-family: var(--font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    #fixed-now-orb {
      position: absolute;
      bottom: 28px;
      left: 0.5px;
      transform: translate(-50%, 50%);
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-primary);
    }

    #timeline-world {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      will-change: transform;
    }
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 28px;
      height: 1px;
      background: var(--line-strong);
      z-index: 5;
      pointer-events: none;
    }
    #timeline-celestial-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      opacity: 0.35;
    }
    #tl-celestial-svg {
      position: absolute;
      left: 0;
      bottom: 28px;
      width: 1px;
      height: 1px;
      overflow: visible;
    }
    .tl-horizon-node, .tl-celestial-body {
      display: none !important;
    }
    #timeline-ticks-layer {
      position: absolute;
      inset: 0;
      z-index: 6;
      pointer-events: none;
    }
    #timeline-events-layer {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: auto;
    }

    .tl-tick {
      position: absolute;
      bottom: 0;
      height: 28px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .tl-tick-mark {
      width: 1px;
      height: 5px;
      background: var(--line-strong);
      margin-bottom: 4px;
    }
    .tl-tick.major .tl-tick-mark {
      height: 8px;
      background: var(--text-muted);
    }
    .tl-tick-label {
      font-family: var(--font-mono);
      font-size: 9.5px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 140px;
      margin-top: -112px;
      background: var(--line-strong);
    }
    .tl-tick.day-start .tl-tick-label {
      color: var(--text-primary);
      font-weight: 600;
      text-transform: uppercase;
    }

    .tl-event-rect {
      position: absolute;
      height: 44px;
      border-radius: 3px;
      padding: 4px 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      border-left: 2px solid var(--text-primary);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1px;
      overflow: hidden;
      cursor: pointer;
      z-index: 12;
    }
    .tl-event-rect:hover {
      border-color: var(--line-focus);
      background: var(--bg-input);
      z-index: 18;
    }
    .tl-event-rect.is-now {
      border-left: 2px solid var(--dot-ok);
      background: var(--bg-input);
    }
    .tl-event-rect.is-past {
      opacity: 0.45;
    }
    .tl-ev-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
    }
    .tl-ev-title {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tl-ev-time {
      font-family: var(--font-mono);
      font-size: 9.5px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tl-ev-meta, .tl-ev-desc {
      font-size: 9.5px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Quick Event Modal & Full App Overlay */
    #quick-event-modal {
      position: fixed;
      bottom: 200px;
      right: 24px;
      z-index: 90;
      background: var(--bg-elevated);
      border: 1px solid var(--line-strong);
      padding: 16px;
      border-radius: 4px;
      display: none;
      width: 300px;
    }

    #full-app-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: var(--bg-canvas);
      display: none;
      flex-direction: column;
    }
    #full-app-bar {
      height: 40px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-canvas);
      border-bottom: 1px solid var(--line-hairline);
    }
    #full-app-frame {
      flex: 1;
      width: 100%;
      border: none;
      background: var(--bg-canvas);
    }

    @media (max-width: 1100px) {
      html, body {
        height: auto;
        min-height: 100dvh;
        overflow-y: auto;
      }
      #horizon-header-bar {
        height: auto;
        padding: 10px 16px;
        flex-wrap: wrap;
      }
      #top-right-widgets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .ambient-widget {
        border-bottom: 1px solid var(--line-hairline);
        padding: 10px 16px;
      }
      #devices-dock {
        grid-template-columns: 1fr;
        overflow: visible;
      }
      .sh-matrix-column {
        border-right: none;
        border-bottom: 1px solid var(--line-hairline);
      }
    }
  </style>
</head>
<body>
  <!-- Hidden compatibility nodes -->
  <nav id="left-ambient-navbar" aria-hidden="true" style="display:none !important;">
    <button class="lnav-item active" id="lnav-horizon" onclick="closeFullService()"></button>
    <button class="lnav-item" id="lnav-google-calendar" onclick="openFullService('google-calendar', 'Calendar')"></button>
    <button class="lnav-item" id="lnav-google-health" onclick="openFullService('google-health', 'Health')"></button>
    <button class="lnav-item" id="lnav-finance-analytics" onclick="openFullService('finance-analytics', 'thassi.finances')"></button>
    <button class="lnav-item" id="lnav-meal-planner" onclick="openFullService('meal-planner', 'Meals')"></button>
    <button class="lnav-item" id="lnav-smart-canvas" onclick="openFullService('smart-canvas', 'Smart Home')"></button>
    <button class="lnav-item" id="lnav-camera-vision" onclick="openFullService('camera-vision', 'Camera Vision')"></button>
    <button class="lnav-item" id="lnav-3d-print" onclick="openFullService('3d-print', '3D Druck Studio')"></button>
    <button class="lnav-item" id="lnav-floorplan" onclick="openFullService('floorplan', '2D Grundriss & Raumplaner')"></button>
    <button class="lnav-item" id="lnav-memo" onclick="openFullService('memo', 'Memo')"></button>
    <button class="lnav-item" id="lnav-cortex" onclick="openFullService('cortex', 'Cortex')"></button>
  </nav>
  <div id="sky-stage" style="display:none !important;">
    <div id="starfield"></div>
    <div id="weather-fx-layer">
      <div id="weather-cloud-veil-1"></div>
      <div id="weather-cloud-veil-2"></div>
      <canvas id="weather-fx-canvas"></canvas>
    </div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none"></svg>
    <div id="moon-assembly"></div>
    <div id="sun-assembly"></div>
  </div>

  <!-- ZONE A: UNIFORM TOP HEADER BAR -->
  <header id="horizon-header-bar">
    <div class="hh-left">
      <div class="hh-brand">
        <span class="hh-title">Horizon</span>
        <span class="hh-code">CMD</span>
      </div>
      <div class="hh-vsep"></div>
      <div id="hero-clock-region">
        <div class="clock-row">
          <div id="hero-time">--:--</div>
          <div id="hero-seconds">--</div>
        </div>
        <div id="hero-date-row">
          <div id="hero-date"></div>
          <button class="hero-cal-icon-btn" onclick="openFullService('google-calendar', 'Calendar')" title="Kalender \xF6ffnen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </button>
        </div>
        <div id="solar-telemetry"><span id="solar-phase-text"></span></div>
      </div>
      <div class="hh-vsep"></div>
      <div id="hero-weather-strip" title="St. Veit an der G\xF6lsen">
        <div class="mw-current-row">
          <div class="mw-icon-wrap" id="mw-current-icon"></div>
          <div class="mw-temp-now" id="mw-current-temp">--\xB0</div>
          <div class="mw-cond-text" id="mw-current-desc">--</div>
          <div class="mw-hi-lo" id="mw-hi-lo">--\xB0 / --\xB0</div>
        </div>
      </div>
    </div>

    <!-- INLINE CORTEX COMMAND & SEARCH BAR -->
    <div id="horizon-cortex-center-stage">
      <div class="cortex-prompt-pill" id="cortex-prompt-pill">
        <div class="cortex-ai-icon-wrap" id="cortex-ai-icon" title="Cortex & Google Gemini">
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">/</span>
        </div>
        <input type="text"
               class="cortex-prompt-input"
               id="cortex-prompt-input"
               placeholder="Cortex fragen oder Memo, Termine, Smart Home & Finanzen durchsuchen..."
               autocomplete="off"
               spellcheck="false" />
        <div id="cortex-status-badge" style="display:none;" class="cortex-waiting-pill">
          <span class="cortex-waiting-dot"></span>
          <span id="cortex-status-text">Synthese...</span>
        </div>
        <button class="cortex-send-btn" id="cortex-send-btn" onclick="submitCortexPrompt()" title="An Gemini API senden (Enter)">
          Run
        </button>
      </div>
      <div id="cortex-preview-dropdown"></div>
      <div id="cortex-response-card"></div>
    </div>

    <!-- EXPLICIT DATA FRESHNESS & ACTION REQUIRED STRIP -->
    <div class="hh-right">
      <span id="horizon-freshness-ts">Stand: --:--:-- (vor 0s)</span>
      <span class="hh-status-pill">
        <span class="thassi-u-dot" id="horizon-sys-dot" style="background:#10b981;"></span>
        <span id="horizon-sys-status-text">HA \xB7 GOOGLE NOMINAL</span>
      </span>
      <button class="w-nav-btn" onclick="openFullService('cortex', 'Cortex', '?tab=vault')" title="Credentials Vault & Konfiguration">
        Vault \u2197
      </button>
    </div>
  </header>

  <!-- HORIZON TOP MEN\xDCLEISTE (Subseiten & Schnellaktionen) -->
  <nav id="horizon-menubar" style="height:40px; padding:0 24px; border-bottom:1px solid var(--line-hairline); background:var(--bg-canvas); display:flex; align-items:center; justify-content:space-between; gap:16px; flex-shrink:0;">
    <div style="display:flex; align-items:center; gap:20px; height:40px;">
      <button id="hz-tab-overview" class="thassi-u-tab active" style="height:40px; font-size:12px;" onclick="switchHorizonTab('overview')">\xDCbersicht (Cockpit)</button>
      <button id="hz-tab-rooms" class="thassi-u-tab" style="height:40px; font-size:12px;" onclick="switchHorizonTab('rooms')">Schnellsteuerung (R\xE4ume)</button>
      <button id="hz-tab-hardware" class="thassi-u-tab" style="height:40px; font-size:12px;" onclick="switchHorizonTab('hardware')">3D-Druck, Kameras &amp; System</button>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="w-nav-btn" onclick="toggleEventModal(true)">+ Termin</button>
      <button class="w-nav-btn" onclick="openQuickImportFlyout(event)">George Sync</button>
      <button class="w-nav-btn" onclick="openFullService('floorplan', '2D Grundriss')">2D Grundriss \u2197</button>
    </div>
  </nav>

  <!-- ZONE B: 4-COLUMN EXECUTIVE KPI STRIP -->
  <section id="top-right-widgets">
    <!-- 1. HEALTH KPI CELL -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-health" style="background:#10b981;"></span>
            <span>HEALTH \xB7 BIOMETRICS</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('google-health', 'Health')" title="Open Health View">Health \u2197</button>
        </div>
        <div class="health-minimal-badges">
          <span id="health-hr-inside">--</span>
          <svg viewBox="0 0 44 44" width="1" height="1"><circle id="health-steps-ring" cx="22" cy="22" r="18.5"></circle></svg>
          <span id="health-steps-inside">--</span>
        </div>
        <div class="w-primary" id="compact-health">-- steps</div>
        <div class="w-sub" id="sub-health">Pixel 10 Health Connect</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid">
          <div class="w-stat-item"><span class="w-stat-k">Steps Today</span><span class="w-stat-v" id="eh-steps">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Readiness</span><span class="w-stat-v" id="eh-ready">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Heart Rate</span><span class="w-stat-v" id="eh-hr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Resting HR / HRV</span><span class="w-stat-v" id="eh-rhr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Sleep Duration</span><span class="w-stat-v" id="eh-sleep">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Burned / Distance</span><span class="w-stat-v" id="eh-burn">--</span></div>
        </div>
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Health &amp; Biometrics \xF6ffnen \u2192</button>
      </div>
    </div>

    <!-- 2. MEALS KPI CELL -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-meals" style="background:#10b981;"></span>
            <span>MEALS \xB7 NUTRITION</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('meal-planner', 'Meals')" title="Open Meals View">Meals \u2197</button>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12px; color:var(--text-secondary); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Meal Planner \xF6ffnen \u2192</button>
      </div>
    </div>

    <!-- 3. FINANCES KPI CELL -->
    <div class="ambient-widget finances-is-hidden" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-finances" style="background:#10b981;"></span>
            <span>FINANCES \xB7 LEDGER</span>
            <button id="finances-eye-btn" class="finances-eye-icon-btn" onclick="toggleFinancesVisibility(event)" title="Finanzdaten ein-/ausblenden">SHOW</button>
          </span>
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <div id="finances-reminder-pill"
                 onclick="event.stopPropagation(); openQuickImportFlyout(event)"
                 title="Kontoauszug exportieren & synchronisieren"
                 style="display:none; padding:1px 6px; border-radius:3px; background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; font-family:var(--font-mono); font-size:9.5px; cursor:pointer; align-items:center; gap:4px;">
              <span style="width:5px; height:5px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>
              <span id="finances-reminder-pill-text">Sync f\xE4llig</span>
            </div>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('finance-analytics', 'thassi.finances')" title="Open Finances View">Finances \u2197</button>
          </div>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">\u2022\u2022\u2022\u2022 \u20AC</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="finances-reminder-expanded-banner"
             style="display:none; margin-bottom:10px; padding:8px 10px; border-radius:3px; background:var(--bg-canvas); border:1px solid rgba(245,158,11,0.4); flex-direction:column; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span id="finances-reminder-exp-title" style="font-size:11px; font-weight:600; color:#f59e0b;">Bank-Export f\xE4llig</span>
            <button onclick="snoozeFinanceReminderFromDash(event, 3)"
                    style="background:transparent; border:1px solid var(--line-hairline); color:var(--text-secondary); border-radius:3px; padding:1px 6px; font-size:10px; cursor:pointer;">
              3T Pause
            </button>
          </div>
          <div id="finances-reminder-exp-detail" style="font-size:10.5px; color:var(--text-secondary); line-height:1.35;"></div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
            <button onclick="launchBankingPopupFromDashboard(event)"
                    style="flex:1; padding:5px 8px; border-radius:3px; border:none; background:#fafafa; color:#09090b; font-size:11px; font-weight:600; cursor:pointer;">
              George &amp; Sync \u2197
            </button>
            <button onclick="openQuickImportFlyout(event)"
                    style="padding:5px 8px; border-radius:3px; border:1px solid var(--line-hairline); background:var(--bg-input); color:#fafafa; font-size:11px; cursor:pointer;">
              Datei / Export
            </button>
          </div>
        </div>
        <div id="finances-preview-dynamic"
             onclick="toggleFinancesVisibility(event)"
             style="display:flex; flex-direction:column; gap:8px; cursor:pointer; margin-bottom:10px;">
          <div class="w-stat-grid">
            <div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" id="ef-bal">\u2022\u2022\u2022\u2022 \u20AC</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag / Woche)</span><span class="w-stat-v" id="ef-exp">\u2022\u2022\u2022\u2022 \u20AC</span></div>
          </div>
        </div>
        <div id="finances-quick-import-slot" style="margin-bottom:8px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-top:1px solid var(--line-hairline); padding-top:8px;">
          <button class="w-action-link" onclick="toggleFinancesVisibility(event)" id="finances-toggle-link">Zahlen anzeigen</button>
          <button class="w-action-link" onclick="triggerDirectFinanceExportFromDash(event, 'csv_de')">CSV Export \u2193</button>
          <button class="w-action-link" onclick="openFullService('finance-analytics', 'thassi.finances', '#export')">Ledger \u2192</button>
        </div>
      </div>
    </div>

    <!-- 4. NOTES KPI CELL -->
    <div class="ambient-widget" id="widget-notes" onclick="toggleWidget('notes', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span class="w-label-left">
            <span class="w-dot" id="dot-notes" style="background:#10b981;"></span>
            <span>NOTES \xB7 MEMO SYNC</span>
          </span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('memo', 'Memo')" title="Open Memo View">Memo \u2197</button>
        </div>
        <div class="w-primary" id="compact-notes">0 notes</div>
        <div class="w-sub" id="sub-notes">Tap to capture a note</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <form onsubmit="addNote(event)" style="margin-bottom:8px; display:flex; gap:6px;">
          <input id="note-input" class="minimal-input" placeholder="Notiz eingeben &amp; Enter..." />
        </form>
        <div id="note-sync-feedback" style="display:none; font-size:11px; color:var(--text-primary); margin-bottom:7px; padding:4px 8px; border:1px solid var(--line-hairline); background:var(--bg-canvas);"></div>
        <div id="notes-list"></div>
      </div>
    </div>
  </section>

  <!-- ZONE C1: HORIZON STARTSEITE VISUAL DOMAIN DIAGRAMS (DEFAULT \xDCBERSICHT) -->
  <section id="horizon-overview-stage" style="flex:1; min-height:0; display:grid; grid-template-columns:7fr 5fr; border-bottom:1px solid var(--line-hairline); background:var(--bg-canvas); overflow:hidden;">
    <div style="padding:16px 24px; border-right:1px solid var(--line-hairline); display:flex; flex-direction:column; justify-content:space-between; min-width:0;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <span class="sh-section-label">HAUS, ENERGIE &amp; RAUM-AKTIVIT\xC4T (LIVE DIAGRAMM)</span>
        <div style="display:flex; gap:8px;">
          <button class="w-nav-btn" onclick="switchHorizonTab('rooms')">Raum-Schalter \xF6ffnen \u2192</button>
          <button class="w-nav-btn" onclick="openFullService('smart-canvas', 'Smart Home')">Smart Home \u2197</button>
        </div>
      </div>
      <div id="hz-ov-energy-chart" style="flex:1; display:flex; align-items:center; justify-content:center; min-height:130px;"></div>
    </div>
    <div style="padding:16px 24px; display:flex; flex-direction:column; justify-content:space-between; min-width:0;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <span class="sh-section-label">SYSTEM, 3D-DRUCK &amp; KAMERA-PULS</span>
        <button class="w-nav-btn" onclick="switchHorizonTab('hardware')">Hardware-Inspektor \u2192</button>
      </div>
      <div id="hz-ov-system-chart" style="flex:1; display:flex; align-items:center; justify-content:center; min-height:130px;"></div>
    </div>
  </section>

  <!-- ZONE C2: PRIMARY HAIRLINE WORKSPACE (SMART HOME MATRIX + HARDWARE/VISION INSPECTOR) -->
  <main id="devices-dock" style="display:none;">
    <div id="timeline-devices-separator"></div>
    <div id="pinned-rooms-tray"></div>

    <!-- Left Column: Live Smart Home Room Matrix -->
    <div class="sh-matrix-column">
      <div id="room-dock-bar">
        <div class="sh-bar-left">
          <span class="sh-section-label">SMART HOME \xB7 RAUM-MATRIX</span>
          <span id="sh-matrix-summary">5 R\xE4ume</span>
          <div class="room-dock-group" id="room-pills-container"></div>
          <button class="td-sep-unpin-btn" id="btn-unpin-all-rooms" onclick="unpinAllRooms()" style="display:none;">Alle zeigen</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <button class="w-nav-btn" onclick="openFullService('smart-canvas', 'Smart Home')">Smart Canvas \u2197</button>
          <button class="w-nav-btn" onclick="openFullService('floorplan', '2D Grundriss & Raumplaner')">2D Grundriss \u2197</button>
        </div>
      </div>
      <div id="rooms-live-matrix-grid"></div>
    </div>

    <!-- Right Column: Hardware, 3D Print, Vision & Infrastructure Inspector -->
    <aside id="statusbar-right-previews">
      <!-- 1. 3D PRINT INSPECTOR -->
      <div class="sb-preview-item" id="widget-3dprint">
        <div class="sb-preview-head">
          <button class="sb-preview-trigger" onclick="openFullService('3d-print', '3D Druck Studio')">
            <span class="room-dot" id="dot-3dprint" style="background:#10b981;"></span>
            <span id="print3d-dock-dot" style="display:none;"></span>
            <span>3D DRUCK \xB7 BAMBU P1S</span>
            <span class="sb-meta" id="print3d-dock-meta">Bereit</span>
            <span class="sb-caret">\u25B4</span>
          </button>
          <button class="w-nav-btn" onclick="openFullService('3d-print', '3D Druck Studio')">Studio \u2197</button>
        </div>
        <div class="sb-upward-flyout">
          <div class="w-3d-row">
            <div style="position:relative; width:76px; height:58px; border-radius:3px; background:var(--bg-elevated); border:1px solid var(--line-hairline); overflow:hidden; flex-shrink:0;"
                 title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)">
              <canvas id="mini-3d-canvas" width="152" height="116" style="width:76px; height:58px; display:block; cursor:grab; touch-action:none;"></canvas>
            </div>
            <div class="w-3d-info">
              <div class="w-primary" id="compact-3dprint" style="font-size:14px;">Kein Projekt aktiv</div>
              <div class="w-sub" id="sub-3dprint">Platzhalter \xB7 0% Leerlauf</div>
              <div style="width:100%; height:3px; background:var(--line-hairline); overflow:hidden; margin-top:6px;">
                <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:#10b981; transition:width 0.35s ease;"></div>
              </div>
            </div>
          </div>
          <div class="w-stat-grid" style="margin-bottom:8px;">
            <div class="w-stat-item"><span class="w-stat-k">Drucker / Modus</span><span class="w-stat-v" id="e3d-printer">Bambu Lab P1S</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Fortschritt / Layer</span><span class="w-stat-v" id="e3d-layer">0% (0/0)</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ma\xDFe / Gewicht</span><span class="w-stat-v" id="e3d-dims">--</span></div>
            <div class="w-stat-item"><span class="w-stat-k">D\xFCse / Heizbett</span><span class="w-stat-v" id="e3d-temps">24\xB0C / 24\xB0C</span></div>
          </div>
          <form onsubmit="submitMini3dPrompt(event)" style="display:flex; gap:6px; margin-bottom:8px;">
            <input id="mini-3d-prompt" class="minimal-input" placeholder="AI CAD: 3D-Objekt \xE4ndern oder neu erstellen\u2026" />
            <button type="submit" id="mini-3d-prompt-btn" class="thassi-u-btn-primary" style="padding:0 10px; font-size:11px;">CAD</button>
          </form>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <button class="w-action-link" onclick="toggleMini3dPlaceholder()" id="btn-mini-3d-toggle">Platzhalter testen</button>
            <button class="w-action-link" onclick="triggerMini3dPrint()" id="btn-mini-3d-print">Druck starten</button>
            <button class="w-action-link" onclick="openFullService('3d-print', '3D Druck Studio')">3D Editor \u2192</button>
          </div>
        </div>
      </div>

      <!-- 2. CAMERA VISION INSPECTOR -->
      <div class="sb-preview-item" id="widget-vision">
        <div class="sb-preview-head">
          <button class="sb-preview-trigger" onclick="openFullService('camera-vision', 'Camera Vision')">
            <span class="room-dot" id="vision-dock-dot" style="background:#10b981;"></span>
            <span>CAMERA VISION \xB7 6 STREAMS</span>
            <span class="sb-meta" id="vision-dock-meta">Zyklisch</span>
            <span class="sb-caret">\u25B4</span>
          </button>
          <button class="w-nav-btn" onclick="openFullService('camera-vision', 'Camera Vision')">Vision \u2197</button>
        </div>
        <div class="sb-upward-flyout">
          <div id="vision-flyout-summary" style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; font-family:var(--font-mono);">
            Zyklischer Snapshot-Scan aktiv
          </div>
          <div id="vision-flyout-cameras" style="display:flex; flex-direction:column; gap:4px; max-height:175px; overflow-y:auto;"></div>
        </div>
      </div>

      <!-- 3. INFRASTRUCTURE & SYSTEM QUICK LINKS -->
      <div class="sb-preview-item" id="widget-sysmon">
        <div class="sb-preview-head">
          <span class="sh-section-label">INFRASTRUKTUR &amp; SYSTEM</span>
          <div style="display:flex; gap:6px;" id="widget-googleusage">
            <span id="sysmon-dock-dot" style="display:none;"></span>
            <span id="sysmon-dock-meta" style="display:none;"></span>
            <span id="gusage-dock-dot" style="display:none;"></span>
            <span id="gusage-dock-meta" style="display:none;"></span>
            <button class="w-nav-btn" onclick="openFullService('system-monitor', 'HASS OS Performance & Prozesse')">HASS OS \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('network-monitor', 'Netzwerk & Router')">Netzwerk \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('google-usage', 'Google Usage & AI Credits')">AI Usage \u2197</button>
            <button class="w-nav-btn" onclick="openFullService('workflows', 'Workflows')">Axons \u2197</button>
          </div>
        </div>
      </div>
    </aside>
  </main>

  <!-- ZONE D: BOTTOM 24H CHRONOLOGICAL HORIZON & GOOGLE CALENDAR TIMELINE -->
  <section id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <span class="sh-section-label">CHRONOLOGIE &amp; KALENDER (24H HORIZON)</span>
        <button class="tl-pill return-now" id="btn-live-now" onclick="snapToLiveNow()">\u21BA Return to Now</button>
      </div>
      <div class="tl-controls">
        <button class="tl-pill" id="zoom-12" onclick="setTimelineSpan(12)">12h</button>
        <button class="tl-pill active" id="zoom-24" onclick="setTimelineSpan(24)">24h</button>
        <button class="tl-pill" id="zoom-72" onclick="setTimelineSpan(72)">3d</button>
        <button class="tl-pill" id="zoom-168" onclick="setTimelineSpan(168)">7d</button>
        <button class="w-nav-btn" onclick="toggleEventModal(true)" title="Neuer Kalendereintrag">+ Termin</button>
        <button class="w-nav-btn" onclick="openFullService('google-calendar', 'Calendar')">Kalender \u2197</button>
      </div>
    </div>

    <div id="timeline-viewport">
      <div id="fixed-now-marker">
        <div id="fixed-now-badge">NOW</div>
        <div id="fixed-now-orb"></div>
      </div>
      <div id="timeline-world">
        <div id="timeline-celestial-layer">
          <svg id="tl-celestial-svg" overflow="visible">
            <path id="tl-moon-below-path" fill="none" stroke="rgba(255, 255, 255, 0.10)" stroke-width="1" stroke-dasharray="3 5" />
            <path id="tl-moon-above-path" fill="none" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1" />
            <path id="tl-sun-below-path" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" stroke-dasharray="3 5" />
            <path id="tl-sun-above-path" fill="none" stroke="rgba(255, 255, 255, 0.32)" stroke-width="1.2" />
          </svg>
          <div id="tl-horizon-crossings"></div>
          <div id="tl-moon-node" class="tl-celestial-body"></div>
          <div id="tl-sun-node" class="tl-celestial-body"></div>
        </div>
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </section>

  <!-- QUICK IMPORT & FILE EXPORT FLYOUT -->
  <div id="quick-import-flyout-modal"
       onclick="closeQuickImportFlyout()"
       style="position:fixed; inset:0; z-index:95; background:rgba(0,0,0,0.72); display:none; justify-content:flex-end;">
    <div onclick="event.stopPropagation()"
         style="width:min(540px, 95vw); height:100vh; background:#09090b; border-left:1px solid rgba(255,255,255,0.12); display:flex; flex-direction:column;">
      <div style="padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; background:#111113;">
        <div>
          <div style="font-size:14px; font-weight:500; color:#fafafa;">Finanzen \u2014 Bank-Export &amp; Datei-Sync</div>
          <div style="font-size:11px; color:#a1a1aa; margin-top:2px;">Sparkasse George Auto-Sync, Lokaler Downloads-Scanner &amp; 1-Klick CSV/JSON Export</div>
        </div>
        <button onclick="closeQuickImportFlyout()" class="w-nav-btn">Schlie\xDFen</button>
      </div>
      <div style="padding:12px 18px; display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.06); background:#09090b;">
        <button onclick="launchBankingPopupFromDashboard(event)" class="thassi-u-btn-primary">
          1. George \xF6ffnen (Verf\xFCger kopiert) \u2197
        </button>
        <button onclick="triggerDashboardLocalFolderScan()" class="thassi-u-btn-ghost">
          2. Neuesten Export aus Downloads lesen
        </button>
      </div>
      <div style="padding:10px 18px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.06); background:#111113;">
        <span style="font-size:10.5px; font-weight:500; text-transform:uppercase; letter-spacing:0.06em; color:#a1a1aa;">1-Klick Thassi Export:</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button onclick="triggerDirectFinanceExportFromDash(event, 'csv_de')" class="w-nav-btn">Excel-CSV \u2193</button>
          <button onclick="triggerDirectFinanceExportFromDash(event, 'tax_report')" class="w-nav-btn">Steuerbericht \u2193</button>
          <button onclick="triggerDirectFinanceExportFromDash(event, 'json')" class="w-nav-btn">JSON-Backup \u2193</button>
        </div>
      </div>
      <div id="qi-dash-status" style="display:none; margin:10px 18px 0; padding:8px 12px; border-radius:3px; font-size:12px;"></div>
      <div style="flex:1; padding:12px 18px; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <label ondragover="event.preventDefault()"
               ondrop="handleDashboardQuickFileDrop(event)"
               style="padding:14px; border-radius:3px; border:1px dashed rgba(255,255,255,0.22); background:#111113; text-align:center; font-size:12px; color:#fafafa; cursor:pointer;">
          Bank-Export (.CSV, .XML, .STA) hier ablegen oder klicken f\xFCr sofortigen Auto-Import
          <div style="font-size:11px; color:#a1a1aa; margin-top:3px;">Erste Bank / Sparkasse George \xB7 Raiffeisen \xB7 BAWAG \xB7 CAMT.053 \xB7 MT940</div>
          <input type="file" accept=".csv,.xml,.sta,.mt940,.json,.txt" onchange="handleDashboardQuickFileSelect(event)" style="display:none;" />
        </label>
        <iframe id="qi-dash-frame"
                src="about:blank"
                style="flex:1; width:100%; border:1px solid rgba(255,255,255,0.06); border-radius:3px; background:#09090b;"></iframe>
      </div>
    </div>
  </div>

  <!-- QUICK EVENT MODAL -->
  <div id="quick-event-modal">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span class="sh-section-label">NEUER TERMIN</span>
      <button onclick="toggleEventModal(false)" class="w-nav-btn">\u2715</button>
    </div>
    <form onsubmit="createQuickEvent(event)" style="display:flex; flex-direction:column; gap:8px;">
      <input id="qe-title" class="minimal-input" placeholder="Termin-Titel..." required />
      <input id="qe-start" type="datetime-local" class="minimal-input" required />
      <div style="display:flex; gap:8px;">
        <input id="qe-dur" type="number" value="60" min="15" step="15" class="minimal-input" placeholder="Minuten" />
        <button type="submit" class="thassi-u-btn-primary">Speichern</button>
      </div>
    </form>
  </div>

  <!-- FULL SERVICE OVERLAY -->
  <div id="full-app-overlay">
    <div id="full-app-bar">
      <button onclick="closeFullService()" class="w-nav-btn">\u2190 Horizon</button>
      <span id="full-app-title" style="font-size:12px; font-weight:500; color:var(--text-secondary);"></span>
      <span></span>
    </div>
    <iframe id="full-app-frame" src="about:blank"></iframe>
  </div>

  <script>
    ${sidebarStylerScript}

    // Detect if running inside Home Assistant parent frame (which already renders transparent ha-sidebar)
    (function detectHassParentFrame() {
      try {
        if (window.top && window.top !== window && window.top.document && window.top.document.querySelector('home-assistant')) {
          document.body.classList.add('in-hass-frame');
        }
      } catch (_e) {}
    })();

    const ingressRx = new RegExp('^(/api/hassio_ingress/[^/]+)');
    const trailingSlashRx = new RegExp('/+$');
    const base = (
      window.__THASSI_INGRESS_PATH__ ||
      ((window.location.pathname || '').match(ingressRx) || [])[1] ||
      ''
    ).replace(trailingSlashRx, '');
    const NOW_ANCHOR_RATIO = 0.25;

    let calendarEvents = [];
    let allCalendarEvents = [];
    let horizonCalendars = [];
    let googleOAuthInfo = null;
    let roomsData = [];
    let visionSummaryData = null;
    let pinnedRoomIds = new Set();
    let visibleHoursSpan = 24;
    let panOffsetMs = 0;
    let timelineBaseEpochMs = Date.now();
    let currentWeatherState = null;

    // Generate twinkling stars once
    (function initStars() {
      const sf = document.getElementById('starfield');
      if (!sf) return;
      let html = '';
      for (let i = 0; i < 85; i++) {
        const x = (Math.random() * 100).toFixed(2);
        const y = (Math.random() * 68).toFixed(2);
        const sz = (1 + Math.random() * 2.2).toFixed(1);
        const dur = (2.5 + Math.random() * 4.5).toFixed(1);
        html += \`<div class="star" style="left:\${x}%; top:\${y}%; width:\${sz}px; height:\${sz}px; --dur:\${dur}s;"></div>\`;
      }
      sf.innerHTML = html;
    })();

    // 1. ABSTRACT SOLAR / LUNAR POSITION & SKY COLOR ENGINE
    const SUNRISE_HOUR = 6.75; // 06:45
    const SUNSET_HOUR = 18.5;  // 18:30

    function getSkyPalette(h) {
      if (h < 5.2 || h >= 21.2) {
        return {
          sky: 'linear-gradient(180deg, #02040a 0%, #070d1f 48%, #0f172a 78%, #172554 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.18), transparent 70%)',
          stars: 0.9,
          phase: 'Astronomical Night'
        };
      }
      if (h < 6.5) {
        return {
          sky: 'linear-gradient(180deg, #090d1e 0%, #1e1b4b 42%, #6d28d9 74%, #f97316 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 25% 100%, rgba(251, 146, 60, 0.65), transparent 72%)',
          stars: 0.45,
          phase: 'Dawn Twilight'
        };
      }
      if (h < 8.0) {
        return {
          sky: 'linear-gradient(180deg, #1d4ed8 0%, #3b82f6 42%, #f472b6 75%, #fbbf24 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 22% 100%, rgba(253, 224, 71, 0.8), transparent 75%)',
          stars: 0.05,
          phase: 'Golden Sunrise'
        };
      }
      if (h < 16.5) {
        return {
          sky: 'linear-gradient(180deg, #0369a1 0%, #0284c7 45%, #38bdf8 80%, #bae6fd 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(254, 249, 195, 0.45), transparent 75%)',
          stars: 0,
          phase: h < 11.5 ? 'Morning Sky' : h < 14 ? 'Solar Noon' : 'Afternoon Sun'
        };
      }
      if (h < 18.8) {
        return {
          sky: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 36%, #c2410c 72%, #facc15 100%)',
          sidebarBg: 'transparent',
          glow: 'radial-gradient(ellipse at 78% 100%, rgba(251, 146, 60, 0.85), transparent 75%)',
          stars: 0.15,
          phase: 'Golden Hour'
        };
      }
      return {
        sky: 'linear-gradient(180deg, #050814 0%, #1e1b4b 46%, #4c1d95 76%, #9a3412 100%)',
        sidebarBg: 'transparent',
        glow: 'radial-gradient(ellipse at 82% 100%, rgba(234, 88, 12, 0.45), transparent 70%)',
        stars: 0.65,
        phase: 'Dusk Twilight'
      };
    }

    function computeSunAltitudeRatio(epochMs) {
      const d = new Date(epochMs);
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const nightSpan = 24 - daySpan;
      if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
        return Math.sin(((h - SUNRISE_HOUR) / daySpan) * Math.PI);
      }
      const nightH = h < SUNRISE_HOUR ? h + (24 - SUNSET_HOUR) : h - SUNSET_HOUR;
      return -Math.sin((nightH / nightSpan) * Math.PI);
    }

    function computeMoonAltitudeRatio(epochMs) {
      const d = new Date(epochMs);
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const lunarInfo = computeLunarPhaseInfo(d);
      const moonPeakHour = (12.625 + lunarInfo.phase * 24) % 24;
      return Math.cos(((h - moonPeakHour) / 24) * 2 * Math.PI);
    }

    function computeLunarPhaseInfo(dateObj) {
      const synodicDays = 29.530588853;
      const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
      const daysSince = (dateObj.getTime() - refNewMoonMs) / 86400000;
      const phase = ((daysSince % synodicDays) + synodicDays) % synodicDays / synodicDays;
      const r = 10.5;
      let d = '';
      if (phase < 0.02 || phase > 0.98) {
        d = '';
      } else if (Math.abs(phase - 0.5) < 0.02) {
        d = \`M 0,-\${r} A \${r},\${r} 0 1,1 0,\${r} A \${r},\${r} 0 1,1 0,-\${r} Z\`;
      } else if (phase < 0.5) {
        const k = Math.cos(phase * 2 * Math.PI);
        const rx = Math.max(0.2, Math.abs(k) * r).toFixed(2);
        const sweepTerm = k >= 0 ? 0 : 1;
        d = \`M 0,-\${r} A \${r},\${r} 0 0,1 0,\${r} A \${rx},\${r} 0 0,\${sweepTerm} 0,-\${r} Z\`;
      } else {
        const k = -Math.cos(phase * 2 * Math.PI);
        const rx = Math.max(0.2, Math.abs(k) * r).toFixed(2);
        const sweepTerm = k >= 0 ? 1 : 0;
        d = \`M 0,-\${r} A \${r},\${r} 0 0,0 0,\${r} A \${rx},\${r} 0 0,\${sweepTerm} 0,-\${r} Z\`;
      }

      let phaseLabel = 'Waxing Crescent';
      if (phase < 0.03 || phase > 0.97) phaseLabel = 'New Moon';
      else if (phase < 0.22) phaseLabel = 'Waxing Crescent';
      else if (phase < 0.28) phaseLabel = 'First Quarter';
      else if (phase < 0.47) phaseLabel = 'Waxing Gibbous';
      else if (phase < 0.53) phaseLabel = 'Full Moon';
      else if (phase < 0.72) phaseLabel = 'Waning Gibbous';
      else if (phase < 0.78) phaseLabel = 'Last Quarter';
      else phaseLabel = 'Waning Crescent';

      return { phase, d, phaseLabel };
    }

    function buildSmartMoonSvg(dateObj) {
      const lunar = computeLunarPhaseInfo(dateObj);
      return \`
        <svg width="32" height="32" viewBox="-17 -17 34 34" style="overflow:visible;">
          <circle cx="0" cy="0" r="14" fill="rgba(186, 230, 253, 0.10)" />
          <circle cx="0" cy="0" r="10.5" fill="rgba(15, 23, 42, 0.88)" stroke="rgba(226, 232, 240, 0.52)" stroke-width="1" />
          <path d="\${lunar.d}" fill="rgba(248, 250, 252, 0.95)" />
        </svg>
      \`;
    }

    function buildSmartSunWeatherSvg(rawCond) {
      const c = String(rawCond || '').toLowerCase();
      const sunDisc = \`
        <g>
          <circle cx="-2" cy="-2" r="6.2" fill="#fde047" stroke="#ffffff" stroke-width="0.9" />
          <line x1="-2" y1="-11.5" x2="-2" y2="-9.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-2" y1="5.5" x2="-2" y2="7.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-11.5" y1="-2" x2="-9.5" y2="-2" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="5.5" y1="-2" x2="7.5" y2="-2" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-8.8" y1="-8.8" x2="-7.3" y2="-7.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
          <line x1="2.8" y1="-8.8" x2="4.3" y2="-7.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
          <line x1="-8.8" y1="4.8" x2="-7.3" y2="3.3" stroke="#fde047" stroke-width="1.2" stroke-linecap="round" />
        </g>
      \`;
      const cloudShape = \`
        <path d="M -5,6.5 H 7.5 A 4.2,4.2 0 0,0 8.2,-1.8 A 5.5,5.5 0 0,0 -2.2,-3.2 A 4.4,4.4 0 0,0 -5,6.5 Z"
              fill="rgba(226, 232, 240, 0.94)" stroke="rgba(15, 23, 42, 0.55)" stroke-width="0.9" stroke-linejoin="round" />
      \`;

      if (c.includes('thunder') || c.includes('storm')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <polyline points="1,5 -1.5,9.5 1.8,9.5 -0.5,14" fill="none" stroke="#facc15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        \`;
      }
      if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <line x1="-2.5" y1="8.2" x2="-3.8" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
            <line x1="1.5" y1="8.2" x2="0.2" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
            <line x1="5.5" y1="8.2" x2="4.2" y2="12.5" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        \`;
      }
      if (c.includes('snow') || c.includes('sleet')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
            <circle cx="-2" cy="10.2" r="1.2" fill="#e0f2fe" />
            <circle cx="2" cy="11.5" r="1.2" fill="#e0f2fe" />
            <circle cx="5.5" cy="10.0" r="1.2" fill="#e0f2fe" />
          </svg>
        \`;
      }
      if (c.includes('cloud') || c.includes('overcast') || c.includes('fog') || c.includes('mist')) {
        return \`
          <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
            \${sunDisc}
            \${cloudShape}
          </svg>
        \`;
      }
      // Clear / Sunny
      return \`
        <svg width="34" height="34" viewBox="-17 -17 34 34" style="overflow:visible;">
          <circle cx="0" cy="0" r="13" fill="rgba(253, 224, 71, 0.16)" />
          <circle cx="0" cy="0" r="6.8" fill="#fde047" stroke="#ffffff" stroke-width="1.1" />
          <line x1="0" y1="-12" x2="0" y2="-9.4" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="0" y1="9.4" x2="0" y2="12" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="-12" y1="0" x2="-9.4" y2="0" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="9.4" y1="0" x2="12" y2="0" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" />
          <line x1="-8.5" y1="-8.5" x2="-6.6" y2="-6.6" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="6.6" y1="-6.6" x2="8.5" y2="-8.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="-8.5" y1="8.5" x2="-6.6" y2="6.6" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
          <line x1="6.6" y1="6.6" x2="8.5" y2="8.5" stroke="#fde047" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      \`;
    }

    function renderSolarArcPaths() {
      // Curves are now rendered along the moving #timeline-world in renderTimelineGeometry()
    }

    function updateSkyAndSun(now) {
      const effectiveHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      const palette = getSkyPalette(effectiveHour);

      const skyEl = document.getElementById('sky-stage');
      if (skyEl) skyEl.style.background = '#09090b';
      const glowEl = document.getElementById('horizon-glow');
      if (glowEl) glowEl.style.background = 'transparent';
      const sfEl = document.getElementById('starfield');
      if (sfEl) sfEl.style.opacity = '0';

      if (window.syncThassiSidebarSky) {
        window.syncThassiSidebarSky('#09090b');
      }

      const lunarInfo = computeLunarPhaseInfo(now);
      const phaseEl = document.getElementById('solar-phase-text');
      if (phaseEl) {
        phaseEl.textContent =
          palette.phase + ' \xB7 06:45\u201318:30 \xB7 ' + lunarInfo.phaseLabel;
      }

      // Update live smart Sun & Moon positions along their respective curves at NOW on the timeline
      const nowEpochMs = now.getTime();
      const pxPerMs = getPxPerMs();
      const xNowPx = (nowEpochMs - timelineBaseEpochMs) * pxPerMs;
      const sunAlt = computeSunAltitudeRatio(nowEpochMs);
      const moonAlt = computeMoonAltitudeRatio(nowEpochMs);

      const sunYOffsetPx = sunAlt >= 0 ? sunAlt * 112 : sunAlt * 32;
      const moonYOffsetPx = moonAlt >= 0 ? moonAlt * 92 : moonAlt * 28;

      const sunNode = document.getElementById('tl-sun-node');
      if (sunNode) {
        sunNode.style.left = xNowPx.toFixed(1) + 'px';
        sunNode.style.bottom = (38 + sunYOffsetPx).toFixed(1) + 'px';
        sunNode.classList.toggle('below-horizon', sunAlt < 0);
        const rawCond = currentWeatherState && currentWeatherState.current
          ? (currentWeatherState.current.conditionCode || currentWeatherState.current.effect)
          : 'partly_cloudy';
        const condLabel = currentWeatherState && currentWeatherState.current
          ? (currentWeatherState.current.conditionLabel || currentWeatherState.current.descriptionDe || '')
          : '';
        if (sunNode.dataset.cond !== String(rawCond)) {
          sunNode.dataset.cond = String(rawCond);
          sunNode.innerHTML = buildSmartSunWeatherSvg(rawCond);
        }
        sunNode.title = \`Sonne (\${Math.round(sunAlt * 62)}\xB0) \xB7 \${condLabel || 'Wetter aktiv'}\`;
      }

      const moonNode = document.getElementById('tl-moon-node');
      if (moonNode) {
        moonNode.style.left = xNowPx.toFixed(1) + 'px';
        moonNode.style.bottom = (38 + moonYOffsetPx).toFixed(1) + 'px';
        moonNode.classList.toggle('below-horizon', moonAlt < 0);
        const phaseBucket = lunarInfo.phase.toFixed(2);
        if (moonNode.dataset.phase !== phaseBucket) {
          moonNode.dataset.phase = phaseBucket;
          moonNode.innerHTML = buildSmartMoonSvg(now);
        }
        moonNode.title = \`Mond (\${Math.round(moonAlt * 54)}\xB0) \xB7 \${lunarInfo.phaseLabel}\`;
      }
    }

    // ============================================================================
    // ST. VEIT / G\xD6LSEN WEATHER FORECAST & SUBTLE BACKGROUND WEATHER FX
    // ============================================================================
    function normalizeWxEffect(raw) {
      const c = String(raw || '').toLowerCase();
      if (c.includes('thunder') || c.includes('storm')) return 'thunder';
      if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
      if (c.includes('snow') || c.includes('sleet')) return 'snow';
      if (c.includes('fog') || c.includes('mist')) return 'fog';
      if (c.includes('cloud') || c.includes('overcast')) return 'clouds';
      return 'clear';
    }

    function getWeatherSvgIcon(rawEffect, size) {
      const effect = normalizeWxEffect(rawEffect);
      const s = size || 18;
      if (effect === 'thunder') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>\`;
      }
      if (effect === 'rain') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>\`;
      }
      if (effect === 'snow') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#e0f2fe" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>\`;
      }
      if (effect === 'fog') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="10" x2="20" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/></svg>\`;
      }
      if (effect === 'clouds') {
        return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>\`;
      }
      return \`<svg width="\${s}" height="\${s}" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>\`;
    }

    function renderWeatherStrip(w) {
      if (!w || !w.current) return;
      currentWeatherState = w;

      const cur = w.current;
      const curEffect = normalizeWxEffect(cur.conditionCode || cur.effect);
      const curDesc = cur.conditionLabel || cur.descriptionDe || 'Leicht bew\xF6lkt';
      const todaySummary = w.today || w.todaySummary;
      const slotsList = w.daySlots || w.hourly || w.hourly24 || [];

      const iconEl = document.getElementById('mw-current-icon');
      const tempEl = document.getElementById('mw-current-temp');
      const descEl = document.getElementById('mw-current-desc');
      const hiloEl = document.getElementById('mw-hi-lo');
      const slotsEl = document.getElementById('mw-day-slots');

      if (iconEl) iconEl.innerHTML = getWeatherSvgIcon(curEffect, 20);
      if (tempEl) tempEl.textContent = \`\${Math.round(Number(cur.tempC ?? 14))}\xB0\`;
      if (descEl) descEl.textContent = curDesc;
      if (hiloEl && todaySummary) {
        hiloEl.textContent = \`\${Math.round(Number(todaySummary.tempMaxC))}\xB0 / \${Math.round(Number(todaySummary.tempMinC))}\xB0\`;
      }

      // Refresh smart Sun/Weather icon on timeline immediately when weather updates
      const sunNode = document.getElementById('tl-sun-node');
      if (sunNode) {
        sunNode.dataset.cond = '';
        updateSkyAndSun(new Date());
      }

      // Update subtle cloud veils in background
      const veil1 = document.getElementById('weather-cloud-veil-1');
      const veil2 = document.getElementById('weather-cloud-veil-2');
      if (veil1 && veil2) {
        const vOpacity = curEffect === 'rain' || curEffect === 'thunder' ? 0.95 : curEffect === 'clouds' || curEffect === 'fog' ? 0.78 : 0.25;
        veil1.style.opacity = String(vOpacity);
        veil2.style.opacity = String(vOpacity * 0.85);
      }

      if (slotsEl && Array.isArray(slotsList)) {
        const nowHr = new Date().getHours();
        slotsEl.innerHTML = slotsList.slice(0, 6).map((slot) => {
          const slotHr = slot.hour != null ? Number(slot.hour) : parseInt((slot.hourLabel || '00:00').slice(0, 2), 10);
          const isCur = Math.abs(slotHr - nowHr) <= 1;
          const slotEff = normalizeWxEffect(slot.conditionCode || slot.effect);
          return \`
            <div class="mw-slot \${isCur ? 'is-current-slot' : ''}">
              <span class="mw-slot-hr">\${slot.hourLabel}</span>
              <span class="mw-slot-ico">\${getWeatherSvgIcon(slotEff, 13)}</span>
              <span class="mw-slot-temp">\${Math.round(slot.tempC)}\xB0</span>
            </div>
          \`;
        }).join('');
      }
    }

    async function loadWeatherData(initialWeather) {
      if (initialWeather && initialWeather.current) {
        renderWeatherStrip(initialWeather);
        return;
      }
      try {
        const res = await fetch(base + '/api/system/weather');
        if (res.ok) {
          const data = await res.json();
          if (data && data.current) {
            renderWeatherStrip(data);
            return;
          }
        }
      } catch (_e) {}

      // Direct fallback for St. Veit an der G\xF6lsen (48.0444\xB0N, 15.6689\xB0E) if backend route is not yet loaded
      try {
        const meteoUrl = 'https://api.open-meteo.com/v1/forecast?latitude=48.0444&longitude=15.6689&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FVienna&forecast_days=1';
        const r = await fetch(meteoUrl);
        if (r.ok) {
          const d = await r.json();
          const c = d.current || {};
          const wmo = Number(c.weather_code ?? 1);
          const mapCode = (code) => {
            if (code === 0) return { conditionCode: 'clear', conditionLabel: 'Klar & Sonnig' };
            if (code <= 2) return { conditionCode: 'partly_cloudy', conditionLabel: 'Leicht bew\xF6lkt' };
            if (code === 3) return { conditionCode: 'cloudy', conditionLabel: 'Bew\xF6lkt' };
            if (code === 45 || code === 48) return { conditionCode: 'fog', conditionLabel: 'Talnebel' };
            if (code >= 51 && code <= 67 || (code >= 80 && code <= 82)) return { conditionCode: 'rain', conditionLabel: 'Regen' };
            if (code >= 71 && code <= 86) return { conditionCode: 'snow', conditionLabel: 'Schneefall' };
            if (code >= 95) return { conditionCode: 'thunderstorm', conditionLabel: 'Gewitter' };
            return { conditionCode: 'partly_cloudy', conditionLabel: 'Wechselhaft' };
          };
          const cm = mapCode(wmo);
          const times = (d.hourly && d.hourly.time) || [];
          const temps = (d.hourly && d.hourly.temperature_2m) || [];
          const probs = (d.hourly && d.hourly.precipitation_probability) || [];
          const codes = (d.hourly && d.hourly.weather_code) || [];
          const targetHrs = [6, 9, 12, 15, 18, 21];
          const daySlots = [];
          for (let i = 0; i < times.length; i++) {
            const hr = new Date(times[i]).getHours();
            if (targetHrs.includes(hr) && daySlots.length < 6) {
              const sm = mapCode(Number(codes[i] ?? 1));
              daySlots.push({
                hour: hr,
                hourLabel: String(hr).padStart(2, '0') + ':00',
                tempC: temps[i] ?? 14,
                precipProbPct: probs[i] ?? 0,
                conditionCode: sm.conditionCode,
                conditionLabel: sm.conditionLabel
              });
            }
          }
          renderWeatherStrip({
            provider: 'google-weather-api',
            current: {
              tempC: c.temperature_2m ?? 14,
              feelsLikeC: c.apparent_temperature ?? 13.5,
              conditionCode: cm.conditionCode,
              conditionLabel: cm.conditionLabel,
              humidityPct: c.relative_humidity_2m ?? 64,
              windKmh: c.wind_speed_10m ?? 9,
            },
            today: {
              tempMaxC: (d.daily && d.daily.temperature_2m_max && d.daily.temperature_2m_max[0]) ?? 17,
              tempMinC: (d.daily && d.daily.temperature_2m_min && d.daily.temperature_2m_min[0]) ?? 7,
            },
            daySlots
          });
        }
      } catch (_err) {}
    }

    (function initWeatherFxCanvas() {
      const canvas = document.getElementById('weather-fx-canvas');
      if (!canvas) return;

      const particles = [];
      for (let i = 0; i < 65; i++) {
        particles.push({
          x: Math.random(),
          y: Math.random(),
          len: 10 + Math.random() * 14,
          speed: 0.002 + Math.random() * 0.004,
          drift: (Math.random() - 0.5) * 0.001,
          size: 1 + Math.random() * 2.2,
          alpha: 0.08 + Math.random() * 0.22,
        });
      }

      function resizeWxCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      resizeWxCanvas();
      window.addEventListener('resize', resizeWxCanvas);

      function stepWeatherFx() {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const rawCode = currentWeatherState && currentWeatherState.current
            ? (currentWeatherState.current.conditionCode || currentWeatherState.current.effect)
            : 'clouds';
          const eff = normalizeWxEffect(rawCode);
          for (const p of particles) {
            if (eff === 'rain' || eff === 'thunder') {
              p.y += p.speed * 2.8;
              p.x += 0.0008;
              if (p.y > 0.72) { p.y = -0.05; p.x = Math.random(); }
              ctx.strokeStyle = \`rgba(186, 230, 253, \${p.alpha * 0.85})\`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(p.x * w, p.y * h);
              ctx.lineTo(p.x * w + 3, p.y * h + p.len);
              ctx.stroke();
            } else if (eff === 'snow') {
              p.y += p.speed * 0.55;
              p.x += Math.sin(p.y * 18) * 0.0005;
              if (p.y > 0.72) { p.y = -0.02; p.x = Math.random(); }
              ctx.fillStyle = \`rgba(241, 245, 249, \${p.alpha})\`;
              ctx.beginPath();
              ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Subtle atmospheric motes / breeze for clear, clouds, or fog
              p.x += p.drift * 0.4 + 0.00018;
              p.y += Math.sin(p.x * 12) * 0.00015;
              if (p.x > 1.02) p.x = -0.02;
              if (p.x < -0.02) p.x = 1.02;
              if (p.y < 0.04 || p.y > 0.65) p.y = 0.1 + Math.random() * 0.5;
              ctx.fillStyle = eff === 'clear'
                ? \`rgba(254, 240, 138, \${p.alpha * 0.45})\`
                : \`rgba(203, 213, 225, \${p.alpha * 0.42})\`;
              ctx.beginPath();
              ctx.arc(p.x * w, p.y * h, p.size * 0.75, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        requestAnimationFrame(stepWeatherFx);
      }
      requestAnimationFrame(stepWeatherFx);
    })();

    // 2. LARGE CLOCK & CONTINUOUS LEFTWARD TIMELINE LOOP
    function getPxPerMs() {
      const effectiveWidth = Math.max(window.innerWidth, 720);
      return effectiveWidth / (visibleHoursSpan * 3600 * 1000);
    }

    function tickClockAndTimeline() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      document.getElementById('hero-time').textContent = hh + ':' + mm;
      document.getElementById('hero-seconds').textContent = ss;
      document.getElementById('hero-date').textContent = now.toLocaleDateString('de-AT', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      document.getElementById('fixed-now-badge').textContent = 'NOW \xB7 ' + hh + ':' + mm;

      const freshEl = document.getElementById('horizon-freshness-ts');
      if (freshEl) {
        const lastMs = window.__horizonLastFetchMs || now.getTime();
        const ageSec = Math.max(0, Math.floor((now.getTime() - lastMs) / 1000));
        const dSync = new Date(lastMs);
        const sh = String(dSync.getHours()).padStart(2, '0');
        const sm = String(dSync.getMinutes()).padStart(2, '0');
        const ssec = String(dSync.getSeconds()).padStart(2, '0');
        freshEl.textContent = 'Stand: ' + sh + ':' + sm + ':' + ssec + ' (vor ' + ageSec + 's)';
      }

      updateSkyAndSun(now);

      const pxPerMs = getPxPerMs();
      const nowOffsetFromBasePx = (now.getTime() + panOffsetMs - timelineBaseEpochMs) * pxPerMs;
      const vpEl = document.getElementById('timeline-viewport');
      const vpW = (vpEl && vpEl.clientWidth) ? vpEl.clientWidth : window.innerWidth;
      const fixedNowX = vpW * NOW_ANCHOR_RATIO;
      const worldTranslateX = fixedNowX - nowOffsetFromBasePx;
      document.getElementById('timeline-world').style.transform = 'translate3d(' + worldTranslateX.toFixed(2) + 'px, 0, 0)';
    }

    // 3 & 4. RENDER TIMELINE TICKS, CELESTIAL ALTITUDE CURVES & GOOGLE CALENDAR EVENT RECTANGLES
    function renderTimelineCelestialCurves(startSpanMs, endSpanMs, pxPerMs) {
      const stepMs = (visibleHoursSpan <= 24 ? 10 : 20) * 60 * 1000;
      const sunAboveMaxPx = 112;
      const sunBelowMaxPx = 32;
      const moonAboveMaxPx = 92;
      const moonBelowMaxPx = 28;

      function traceSplitCurve(evalFn, aboveAmp, belowAmp, isMoon) {
        let aboveD = '';
        let belowD = '';
        const crossings = [];
        let prevT = startSpanMs;
        let prevRatio = evalFn(prevT);
        let prevX = (prevT - timelineBaseEpochMs) * pxPerMs;
        let prevY = prevRatio >= 0 ? -prevRatio * aboveAmp : -prevRatio * belowAmp;

        if (prevRatio >= 0) {
          aboveD += \`M \${prevX.toFixed(1)},\${prevY.toFixed(1)} \`;
        } else {
          belowD += \`M \${prevX.toFixed(1)},\${prevY.toFixed(1)} \`;
        }

        for (let t = startSpanMs + stepMs; t <= endSpanMs; t += stepMs) {
          const curRatio = evalFn(t);
          const curX = (t - timelineBaseEpochMs) * pxPerMs;
          const curY = curRatio >= 0 ? -curRatio * aboveAmp : -curRatio * belowAmp;

          if ((prevRatio < 0 && curRatio >= 0) || (prevRatio >= 0 && curRatio < 0)) {
            const denom = Math.abs(prevRatio) + Math.abs(curRatio);
            const frac = denom > 1e-6 ? Math.abs(prevRatio) / denom : 0.5;
            const crossT = prevT + frac * (t - prevT);
            const crossX = (crossT - timelineBaseEpochMs) * pxPerMs;

            if (prevRatio >= 0) {
              aboveD += \`L \${crossX.toFixed(1)},0 \`;
              belowD += \`M \${crossX.toFixed(1)},0 L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            } else {
              belowD += \`L \${crossX.toFixed(1)},0 \`;
              aboveD += \`M \${crossX.toFixed(1)},0 L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            }

            crossings.push({
              epochMs: crossT,
              xPx: crossX,
              isRise: prevRatio < 0 && curRatio >= 0,
              isMoon
            });
          } else {
            if (curRatio >= 0) {
              aboveD += \`L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            } else {
              belowD += \`L \${curX.toFixed(1)},\${curY.toFixed(1)} \`;
            }
          }

          prevT = t;
          prevRatio = curRatio;
          prevX = curX;
          prevY = curY;
        }
        return { aboveD, belowD, crossings };
      }

      const sunTrace = traceSplitCurve(computeSunAltitudeRatio, sunAboveMaxPx, sunBelowMaxPx, false);
      const moonTrace = traceSplitCurve(computeMoonAltitudeRatio, moonAboveMaxPx, moonBelowMaxPx, true);

      const sunAboveEl = document.getElementById('tl-sun-above-path');
      const sunBelowEl = document.getElementById('tl-sun-below-path');
      const moonAboveEl = document.getElementById('tl-moon-above-path');
      const moonBelowEl = document.getElementById('tl-moon-below-path');
      if (sunAboveEl) sunAboveEl.setAttribute('d', sunTrace.aboveD);
      if (sunBelowEl) sunBelowEl.setAttribute('d', sunTrace.belowD);
      if (moonAboveEl) moonAboveEl.setAttribute('d', moonTrace.aboveD);
      if (moonBelowEl) moonBelowEl.setAttribute('d', moonTrace.belowD);

      const crossingsContainer = document.getElementById('tl-horizon-crossings');
      if (crossingsContainer) {
        const showLabels = visibleHoursSpan <= 72;
        const allCrossings = [...sunTrace.crossings, ...moonTrace.crossings];
        crossingsContainer.innerHTML = allCrossings.map((c) => {
          const d = new Date(c.epochMs);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const arrow = c.isRise ? '\u2191' : '\u2193';
          const bodySym = c.isMoon ? '\u263E' : '\u2600';
          const timeText = \`\${arrow} \${hh}:\${mm}\`;
          return \`
            <div class="tl-horizon-node \${c.isMoon ? 'moon-cross' : 'sun-cross'}"
                 style="left:\${c.xPx.toFixed(1)}px;"
                 title="\${bodySym} \${c.isRise ? 'Aufgang' : 'Untergang'}: \${hh}:\${mm}">
              <div class="tl-horizon-dot"></div>
              \${showLabels ? \`<div class="tl-horizon-time">\${timeText}</div>\` : ''}
            </div>
          \`;
        }).join('');
      }
    }

    function renderTimelineGeometry() {
      const nowMs = Date.now();
      timelineBaseEpochMs = nowMs;
      const pxPerMs = getPxPerMs();

      const startSpanMs = nowMs - 36 * 3600 * 1000;
      const endSpanMs = nowMs + 8 * 24 * 3600 * 1000;

      renderTimelineCelestialCurves(startSpanMs, endSpanMs, pxPerMs);

      const stepHours = visibleHoursSpan <= 12 ? 1 : visibleHoursSpan <= 24 ? 2 : visibleHoursSpan <= 72 ? 6 : 12;
      const firstTick = new Date(startSpanMs);
      firstTick.setMinutes(0, 0, 0);
      firstTick.setHours(Math.floor(firstTick.getHours() / stepHours) * stepHours);

      let ticksHtml = '';
      for (let t = firstTick.getTime(); t <= endSpanMs; t += stepHours * 3600 * 1000) {
        const d = new Date(t);
        const h = d.getHours();
        const isDayStart = h === 0;
        const isMajor = h % 6 === 0;
        const xPx = (t - timelineBaseEpochMs) * pxPerMs;

        const label = isDayStart
          ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          : \`\${String(h).padStart(2, '0')}:00\`;

        ticksHtml += \`
          <div class="tl-tick \${isDayStart ? 'day-start' : isMajor ? 'major' : ''}" style="left:\${xPx.toFixed(1)}px;">
            <div class="tl-tick-mark"></div>
            <div class="tl-tick-label">\${label}</div>
          </div>
        \`;
      }
      document.getElementById('timeline-ticks-layer').innerHTML = ticksHtml;

      const catPalette = {
        work:     { border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' },
        focus:    { border: '#818cf8', glow: 'rgba(129, 140, 248, 0.35)' },
        health:   { border: '#4ade80', glow: 'rgba(74, 222, 128, 0.35)' },
        social:   { border: '#f472b6', glow: 'rgba(244, 114, 182, 0.35)' },
        personal: { border: '#fbbf24', glow: 'rgba(251, 191, 36, 0.35)' },
      };

      const calColorMap = {};
      for (const c of horizonCalendars) {
        if (c && c.calendar_name && c.color) {
          calColorMap[c.calendar_name] = c.color;
        }
      }

      const sorted = [...calendarEvents]
        .map((ev) => {
          const s = new Date(ev.start_time).getTime();
          const e = Math.max(s + 30 * 60000, new Date(ev.end_time).getTime());
          return { ...ev, s, e };
        })
        .filter((ev) => Number.isFinite(ev.s) && ev.e >= startSpanMs && ev.s <= endSpanMs)
        .sort((a, b) => a.s - b.s);

      const laneEndPx = [-Infinity, -Infinity, -Infinity];
      let eventsHtml = '';

      for (const ev of sorted) {
        const leftPx = (ev.s - timelineBaseEpochMs) * pxPerMs;
        const rawWidthPx = (ev.e - ev.s) * pxPerMs;
        const widthPx = Math.max(155, rawWidthPx);

        let lane = 0;
        for (let l = 0; l < laneEndPx.length; l++) {
          if (leftPx >= laneEndPx[l] + 8) {
            lane = l;
            break;
          }
          if (l === laneEndPx.length - 1) lane = l;
        }
        laneEndPx[lane] = leftPx + widthPx;

        const bottomPx = 42 + lane * 58;
        const pal = catPalette[ev.category] || catPalette.personal;
        const evBorder = calColorMap[ev.calendar_name] || pal.border;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
        const safeTitle = String(ev.title || '').split('"').join('&quot;');

        const locStr = String(ev.location || '').trim();
        const attendeesStr = String(ev.attendees || ev.calendar_name || '').trim();
        const rawDesc = String(ev.description || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim();

        const metaParts = [];
        if (locStr) metaParts.push('\u{1F4CD} ' + locStr);
        if (attendeesStr) metaParts.push('\u{1F465} ' + attendeesStr);
        const metaLine = metaParts.join(' \xB7 ') || (ev.calendar_name || ev.category || '');
        const descLine = rawDesc || (locStr ? \`\${startStr}\u2013\${endStr} \xB7 \${ev.calendar_name || ''}\` : 'Keine Beschreibung');

        const tooltipParts = [
          \`\${safeTitle} (\${dayStr}, \${startStr}\u2013\${endStr})\`,
          locStr ? \`Ort: \${locStr}\` : '',
          attendeesStr ? \`Teilnehmer: \${attendeesStr}\` : '',
          rawDesc ? \`Info: \${rawDesc}\` : ''
        ].filter(Boolean).join(' | ').split('"').join('&quot;');

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${evBorder}; --ev-glow:\${pal.glow};"
               title="\${tooltipParts}">
            <div class="tl-ev-head">
              <div class="tl-ev-title">\${ev.title}</div>
              <div class="tl-ev-time">\${startStr}\u2013\${endStr}</div>
            </div>
            <div class="tl-ev-meta">\${metaLine}</div>
            <div class="tl-ev-desc">\${descLine}</div>
          </div>
        \`;
      }

      document.getElementById('timeline-events-layer').innerHTML = eventsHtml;
      tickClockAndTimeline();
    }

    function setTimelineSpan(hours) {
      visibleHoursSpan = hours;
      ['12', '24', '72', '168'].forEach((id) => {
        const el = document.getElementById('zoom-' + id);
        if (el) el.classList.toggle('active', Number(id) === hours);
      });
      renderTimelineGeometry();
    }

    function snapToLiveNow() {
      panOffsetMs = 0;
      document.getElementById('btn-live-now').style.display = 'none';
      tickClockAndTimeline();
    }

    (function initTimelineDrag() {
      const vp = document.getElementById('timeline-viewport');
      let dragging = false;
      let startX = 0;
      let startPanMs = 0;

      vp.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tl-event-rect')) return;
        dragging = true;
        startX = e.clientX;
        startPanMs = panOffsetMs;
        vp.setPointerCapture(e.pointerId);
      });
      vp.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        panOffsetMs = startPanMs - dx / getPxPerMs();
        document.getElementById('btn-live-now').style.display = 'inline-block';
        tickClockAndTimeline();
      });
      vp.addEventListener('pointerup', () => { dragging = false; });
    })();

    function toggleWidget(id, ev) {
      if (ev) ev.stopPropagation();
      const target = document.getElementById('widget-' + id);
      if (!target) return;
      const isAlreadyOpen = target.classList.contains('expanded');
      document.querySelectorAll('.ambient-widget, .sb-preview-item').forEach((w) => w.classList.remove('expanded'));
      if (!isAlreadyOpen) {
        target.classList.add('expanded');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ambient-widget') && !e.target.closest('.sb-preview-item')) {
        document.querySelectorAll('.ambient-widget, .sb-preview-item').forEach((w) => w.classList.remove('expanded'));
      }
      if (!e.target.closest('.cal-filter-wrap')) {
        const pop = document.getElementById('horizon-cal-filter-popover');
        if (pop) pop.classList.remove('open');
      }
    });

    // ============================================================================
    // 6. MINIMIZED-BY-DEFAULT ROOM TABS & PINNABLE ROOM GROUPS (EXPAND OVER UPPER CONTENT)
    // ============================================================================
    function syncDevicesDockHeight() {
      const bar = document.getElementById('room-dock-bar');
      const h = (bar && bar.getBoundingClientRect().height) ? bar.getBoundingClientRect().height + 2 : 52;
      document.documentElement.style.setProperty('--devices-dock-height', Math.round(h) + 'px');
    }

    function toggleRoomPin(roomId, ev) {
      if (ev) ev.stopPropagation();
      if (pinnedRoomIds.has(roomId)) {
        pinnedRoomIds.delete(roomId);
      } else {
        pinnedRoomIds.add(roomId);
      }
      renderRoomDockBar();
      renderPinnedRoomsTray();
    }

    function unpinAllRooms() {
      pinnedRoomIds.clear();
      renderRoomDockBar();
      renderPinnedRoomsTray();
    }

    function renderRoomDockBar() {
      const container = document.getElementById('room-pills-container');
      if (!container) return;

      // Filter out kameras_vision from left room tabs (Vision is right-aligned in StatusBar)
      const roomTabs = roomsData.filter((r) => r.id !== 'kameras_vision');

      container.innerHTML = roomTabs
        .map((r) => {
          const hasLightsOn = Array.isArray(r.devices)
            ? r.devices.some(
                (d) =>
                  d.isOn &&
                  (d.kind === 'rgbw' ||
                    String(d.entityId || '').startsWith('light.') ||
                    /licht|beleuchtung|led|schalter/i.test(
                      String(d.label || '') + ' ' + String(d.entityId || '')
                    ))
              )
            : r.activeCount > 0;
          const hasOn = hasLightsOn;
          const hasMotion = Boolean(r.motionActive);
          const isPinned = pinnedRoomIds.has(r.id);

          const lightbulbHtml = hasLightsOn
            ? \`<span class="room-lightbulb-icon" title="Licht eingeschaltet">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(251, 191, 36, 0.28)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18h6"></path>
                  <path d="M10 22h4"></path>
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
                </svg>
              </span>\`
            : '';

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isPinned ? 'pinned-tab' : ''}"
                    title="\${isPinned ? 'Klicken zum Minimieren (Entpinnen)' : 'Klicken zum Anheften (Pinnen) der Raum-Ger\xE4te'}"
                    onclick="toggleRoomPin('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${lightbulbHtml}
            </button>
          \`;
        })
        .join('');

      // Populate right-aligned Vision upward flyout & StatusBar meta
      const visionRoom = roomsData.find((r) => r.id === 'kameras_vision');
      const vMeta = document.getElementById('vision-dock-meta');
      if (vMeta) {
        if (visionSummaryData && visionSummaryData.lastTotalObjects != null) {
          vMeta.textContent = visionSummaryData.lastTotalObjects + ' Obj';
        } else if (visionRoom && Array.isArray(visionRoom.devices)) {
          vMeta.textContent = visionRoom.devices.length + ' Cams';
        } else {
          vMeta.textContent = 'Zyklisch';
        }
      }

      const vSummaryEl = document.getElementById('vision-flyout-summary');
      if (vSummaryEl) {
        vSummaryEl.textContent = (visionSummaryData && visionSummaryData.lastSceneSummary)
          ? visionSummaryData.lastSceneSummary
          : 'Zyklischer Snapshot-Scan aktiv (COCO-SSD)';
      }

      const vCamsEl = document.getElementById('vision-flyout-cameras');
      if (vCamsEl) {
        if (visionRoom && Array.isArray(visionRoom.devices) && visionRoom.devices.length > 0) {
          vCamsEl.innerHTML = visionRoom.devices.map(buildRoomDeviceRowHtml).join('');
        } else {
          vCamsEl.innerHTML = '<div style="font-size:11px; color:#52525b;">Keine Kameras verbunden</div>';
        }
      }

      // Render Live Swiss Hairline Room Matrix in primary workspace
      const matrixEl = document.getElementById('rooms-live-matrix-grid');
      const matrixSumEl = document.getElementById('sh-matrix-summary');
      if (matrixEl) {
        let totalActiveDevs = 0;
        let totalHouseWatts = 0;
        for (const r of roomTabs) {
          totalActiveDevs += Number(r.activeCount || 0);
          totalHouseWatts += Number(r.totalPowerW || 0);
        }
        if (matrixSumEl) {
          matrixSumEl.textContent = roomTabs.length + ' R\xE4ume \xB7 ' + totalActiveDevs + ' aktiv \xB7 ' + totalHouseWatts.toFixed(1) + ' W';
        }
        const visibleRooms = pinnedRoomIds.size > 0
          ? roomTabs.filter((r) => pinnedRoomIds.has(r.id))
          : roomTabs;
        matrixEl.innerHTML = visibleRooms
          .map((room) => {
            const subParts = [];
            if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + '\xB0C');
            if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
            if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');
            const isRoomActive = Number(room.activeCount || 0) > 0;
            const dotColor = isRoomActive ? '#10b981' : (room.motionActive ? '#f59e0b' : '#52525b');
            const rowsHtml = (room.devices || []).map(buildRoomDeviceRowHtml).join('');
            const offBtn = isRoomActive
              ? '<button class="sh-room-off-btn" onclick="turnOffAllInRoom('' + room.id + '')">Alle aus</button>'
              : '';
            return [
              '<div class="sh-room-cell">',
              '  <div class="sh-room-head">',
              '    <div class="sh-room-title-group">',
              '      <span class="thassi-u-dot" style="background:' + dotColor + ';"></span>',
              '      <span class="sh-room-name">' + room.name + '</span>',
              '    </div>',
              '    <div class="sh-room-meta-group">',
              '      <span class="sh-room-telemetry">' + (subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')) + '</span>',
              '      ' + offBtn,
              '    </div>',
              '  </div>',
              '  <div class="sh-room-devices">' + rowsHtml + '</div>',
              '</div>'
            ].join('');
          })
          .join('');
      }
    }

    function buildRoomDeviceRowHtml(d) {
      const pwr = d.powerW != null && d.powerW > 0 ? \`<span class="rf-power-badge">\${d.powerW.toFixed(1)} W</span>\` : '';

      if (d.kind === 'toggle' || d.kind === 'rgbw') {
        const extraRgbw =
          d.kind === 'rgbw' && d.isOn
            ? \`
              <div class="rf-slider-row">
                <span style="font-size:10px; color:rgba(255,255,255,0.45);">Dim</span>
                <input type="range" min="5" max="100" value="\${d.brightness || 80}" class="rf-slider"
                       onchange="triggerDeviceAction('\${d.entityId}', 'brightness', { brightnessPct: Number(this.value) })" />
              </div>
              \${
                Array.isArray(d.effectList) && d.effectList.length > 0
                  ? \`<div class="rf-effect-pills">
                      \${d.effectList
                        .map(
                          (fx) =>
                            \`<button class="rf-fx-pill \${d.effect === fx ? 'active' : ''}" onclick="triggerDeviceAction('\${d.entityId}', 'effect', { effect: '\${fx}' })">\${fx}</button>\`
                        )
                        .join('')}
                    </div>\`
                  : ''
              }
            \`
            : '';

        return \`
          <div class="rf-dev-row \${d.isOn ? 'is-on' : ''}">
            <div class="rf-dev-main">
              <span class="rf-dev-label">\${d.label}</span>
              <div class="rf-dev-right">
                \${pwr}
                <button class="rf-toggle-btn \${d.isOn ? 'on' : ''}"
                        onclick="triggerDeviceAction('\${d.entityId}', 'toggle')">
                  \${d.isOn ? 'AN' : 'AUS'}
                </button>
              </div>
            </div>
            \${extraRgbw}
          </div>
        \`;
      }

      if (d.kind === 'camera') {
        const camLive = d.state === 'recording' || d.state === 'streaming';
        const currentMode = (visionSummaryData?.cameraModes && visionSummaryData.cameraModes[d.entityId]) || 'Personen';
        const modes = ['Personen', 'Fahrzeuge', 'Objekte', 'Kamera', 'Aktivit\xE4ten'];
        return \`
          <div class="rf-dev-row \${camLive ? 'is-on' : ''}">
            <div class="rf-dev-main">
              <span class="rf-dev-label" style="cursor:pointer;" title="Klicken f\xFCr Vollbild-Live-Stream mit Objekterkennung" onclick="openFullService('camera-vision', 'Kameras & Live-Vision', '?camera=\${d.entityId}')">\${d.label} \u2197</span>
              <div class="rf-dev-right">
                <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                  \${camLive ? 'Aktiv' : 'QR-Auth'}
                </span>
                <button class="rf-toggle-btn" onclick="openFullService('camera-vision', 'Kameras & Live-Vision', '?camera=\${d.entityId}')">
                  Live + KI
                </button>
                <button class="rf-toggle-btn" onclick="triggerQuickVisionSample('\${d.entityId}', this)">
                  Abtasten
                </button>
              </div>
            </div>
            <div class="rf-effect-pills">
              \${modes
                .map(
                  (m) =>
                    \`<button class="rf-fx-pill \${currentMode === m ? 'active' : ''}" style="\${currentMode === m ? 'background:#38bdf8; color:#040711; font-weight:600;' : ''}" onclick="setCameraModeFromFlyout('\${d.entityId}', '\${m}')">\${m}</button>\`
                )
                .join('')}
            </div>
          </div>
        \`;
      }

      const formattedState =
        d.state === 'on'
          ? 'Bewegung erkannt'
          : d.state === 'off'
            ? 'Ruhig'
            : d.state === 'unavailable'
              ? 'Offline'
              : \`\${d.state}\${d.unit ? ' ' + d.unit : ''}\`;

      return \`
        <div class="rf-dev-row">
          <div class="rf-dev-main">
            <span class="rf-dev-label">\${d.label}</span>
            <span class="rf-power-badge" style="color:rgba(248,250,252,0.75);">\${formattedState}</span>
          </div>
        </div>
      \`;
    }

    function renderPinnedRoomsTray() {
      const tray = document.getElementById('pinned-rooms-tray');
      const countLbl = document.getElementById('pinned-rooms-count-label');
      const unpinBtn = document.getElementById('btn-unpin-all-rooms');
      if (!tray) return;

      const pinnedRooms = roomsData.filter((r) => pinnedRoomIds.has(r.id));
      if (pinnedRooms.length === 0) {
        tray.classList.remove('has-pinned');
        tray.innerHTML = '';
        if (countLbl) countLbl.style.display = 'none';
        if (unpinBtn) unpinBtn.style.display = 'none';
        requestAnimationFrame(syncDevicesDockHeight);
        return;
      }

      tray.classList.add('has-pinned');
      if (countLbl) {
        countLbl.textContent = \`\xB7 \${pinnedRooms.length} angeheftet\`;
        countLbl.style.display = 'inline';
      }
      if (unpinBtn) {
        unpinBtn.style.display = 'inline-block';
      }

      tray.innerHTML = pinnedRooms
        .map((room) => {
          const subParts = [];
          if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + ' \xB0C');
          if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
          if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');

          const rowsHtml = room.devices.map(buildRoomDeviceRowHtml).join('');
          const footerHtml =
            room.id === 'kameras_vision'
              ? \`
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:2px;">
                  <span style="font-size:10px; color:rgba(255,255,255,0.48);">
                    \${visionSummaryData?.lastSceneSummary ? visionSummaryData.lastSceneSummary.slice(0, 32) : 'COCO-SSD aktiv'}
                  </span>
                  <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('camera-vision', 'Camera Vision')">
                    Vision \u2192
                  </button>
                </div>
              \`
              : room.activeCount > 0
                ? \`
                  <div style="display:flex; justify-content:space-between; align-items:center; padding-top:2px;">
                    <button class="w-action-link" style="margin:0; font-size:10.5px; color:#fbbf24;" onclick="turnOffAllInRoom('\${room.id}')">
                      Alle ausschalten
                    </button>
                    <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('smart-canvas', 'Smart Home')">
                      Canvas \u2192
                    </button>
                  </div>
                \`
                : '';

          return \`
            <div class="pinned-room-card">
              <div class="prc-header">
                <div class="prc-title-wrap">
                  <span class="prc-title">\${room.name}</span>
                  <span class="prc-meta">\${subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')}</span>
                </div>
                <button class="prc-unpin" onclick="toggleRoomPin('\${room.id}', event)" title="Raum-Tab wieder minimieren">
                  <span>\u{1F4CC} Angeheftet</span>
                  <span>\u2715</span>
                </button>
              </div>
              <div class="prc-dev-grid">\${rowsHtml}</div>
              \${footerHtml}
            </div>
          \`;
        })
        .join('');

      requestAnimationFrame(syncDevicesDockHeight);
    }

    async function setCameraModeFromFlyout(cameraId, mode) {
      try {
        await fetch(base + '/api/apps/camera-vision/camera-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId, optimization_mode: mode }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Failed setting camera mode:', e);
      }
    }

    async function triggerDeviceAction(entityId, action, extra) {
      try {
        await fetch(base + '/api/system/device-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityId, action, ...(extra || {}) }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Device action failed:', e);
      }
    }

    async function turnOffAllInRoom(roomId) {
      const room = roomsData.find((r) => r.id === roomId);
      if (!room) return;
      const activeDevs = room.devices.filter((d) => (d.kind === 'toggle' || d.kind === 'rgbw') && d.isOn);
      await Promise.all(
        activeDevs.map((d) =>
          fetch(base + '/api/system/device-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityId: d.entityId, action: 'turn_off' }),
          })
        )
      );
      await loadRoomsQuickAccess();
    }

    async function triggerQuickVisionSample(cameraId, btnEl) {
      if (btnEl) btnEl.textContent = 'Pr\xFCfe\u2026';
      try {
        await fetch(base + '/api/apps/camera-vision/sample-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId }),
        });
        await loadRoomsQuickAccess();
      } finally {
        if (btnEl) btnEl.textContent = 'Abtasten';
      }
    }

    function renderHorizonOverviewCharts() {
      try {
        const energyEl = document.getElementById('hz-ov-energy-chart');
        const sysEl = document.getElementById('hz-ov-system-chart');
        if (energyEl) {
          const roomTabs = (roomsData || []).filter((r) => r.id !== 'kameras_vision');
          let totalW = 0;
          let activeDevs = 0;
          let totalDevs = 0;
          const bars = roomTabs.map((r) => {
            const devs = r.devices || [];
            totalDevs += devs.length;
            const onCnt = devs.filter((d) => d.isOn).length;
            activeDevs += onCnt;
            const rw = devs.reduce((s, d) => s + (Number(d.powerW) || 0), 0);
            totalW += rw;
            return { name: r.name, w: rw, on: onCnt, total: devs.length };
          });
          const maxVal = Math.max(10, ...bars.map((b) => (b.w > 0 ? b.w : b.on * 20 + 5)));
          const barsHtml = bars.map((b) => {
            const v = b.w > 0 ? b.w : b.on * 20 + 5;
            const pct = Math.min(100, Math.max(6, Math.round((v / maxVal) * 100)));
            const col = b.on > 0 ? '#10b981' : '#3f3f46';
            return '<div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; min-width:0;">' +
              '<div style="height:82px; width:100%; max-width:44px; background:rgba(255,255,255,0.03); border:1px solid var(--line-hairline); border-radius:3px; display:flex; align-items:flex-end; padding:2px;">' +
                '<div style="width:100%; height:' + pct + '%; background:' + col + '; border-radius:2px; transition:height 0.3s ease;"></div>' +
              '</div>' +
              '<span style="font-size:11px; color:var(--text-primary); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">' + b.name + '</span>' +
              '<span style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">' + (b.w > 0 ? b.w.toFixed(1) + 'W' : b.on + '/' + b.total + ' an') + '</span>' +
            '</div>';
          }).join('');
          energyEl.innerHTML =
            '<div style="display:flex; align-items:center; justify-content:space-between; gap:24px; width:100%;">' +
              '<div style="display:flex; flex-direction:column; gap:4px; min-width:130px;">' +
                '<span style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);">Gesamtlast</span>' +
                '<span style="font-family:var(--font-mono); font-size:26px; color:var(--text-primary);">' + totalW.toFixed(1) + ' W</span>' +
                '<span style="font-family:var(--font-mono); font-size:11px; color:#10b981;">' + activeDevs + ' / ' + totalDevs + ' Ger\xE4te aktiv</span>' +
              '</div>' +
              '<div style="display:flex; align-items:flex-end; gap:12px; flex:1;">' + barsHtml + '</div>' +
            '</div>';
        }
        if (sysEl) {
          const p3d = mini3dState.printer || {};
          const pct3d = Math.round(Number(p3d.progressPercent || 0));
          const camCount = 4;
          const evCount = (calendarEvents || []).length;
          sysEl.innerHTML =
            '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; width:100%;">' +
              '<div onclick="openFullService('3d-print', '3D Druck Studio')" style="cursor:pointer; padding:12px; border:1px solid var(--line-hairline); border-radius:4px; background:var(--bg-elevated); display:flex; flex-direction:column; gap:4px;">' +
                '<span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">3D Druck P1S</span>' +
                '<span style="font-family:var(--font-mono); font-size:18px; color:var(--text-primary);">' + pct3d + '% \xB7 ' + (p3d.status || 'IDLE') + '</span>' +
                '<span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-secondary);">' + Math.round(p3d.nozzleTemp || 24) + '\xB0C / ' + Math.round(p3d.bedTemp || 24) + '\xB0C</span>' +
              '</div>' +
              '<div onclick="openFullService('camera-vision', 'Kameras & Vision')" style="cursor:pointer; padding:12px; border:1px solid var(--line-hairline); border-radius:4px; background:var(--bg-elevated); display:flex; flex-direction:column; gap:4px;">' +
                '<span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Kameras &amp; Vision</span>' +
                '<span style="font-family:var(--font-mono); font-size:18px; color:#10b981;">' + camCount + ' Online</span>' +
                '<span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-secondary);">KI-Erkennung aktiv</span>' +
              '</div>' +
              '<div onclick="openFullService('google-calendar', 'Kalender & Zeit')" style="cursor:pointer; padding:12px; border:1px solid var(--line-hairline); border-radius:4px; background:var(--bg-elevated); display:flex; flex-direction:column; gap:4px;">' +
                '<span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Tages-Agenda</span>' +
                '<span style="font-family:var(--font-mono); font-size:18px; color:var(--text-primary);">' + evCount + ' Termine</span>' +
                '<span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-secondary);">24h Horizon unten</span>' +
              '</div>' +
            '</div>';
        }
      } catch (_e) {}
    }

    function switchHorizonTab(tabId) {
      ['overview', 'rooms', 'hardware'].forEach((id) => {
        const btn = document.getElementById('hz-tab-' + id);
        if (btn) btn.classList.toggle('active', id === tabId);
      });
      const ovStage = document.getElementById('horizon-overview-stage');
      const devDock = document.getElementById('devices-dock');
      if (tabId === 'overview') {
        if (ovStage) ovStage.style.display = 'grid';
        if (devDock) devDock.style.display = 'none';
        renderHorizonOverviewCharts();
      } else {
        if (ovStage) ovStage.style.display = 'none';
        if (devDock) devDock.style.display = 'grid';
      }
    }
    window.switchHorizonTab = switchHorizonTab;

    async function loadRoomsQuickAccess() {
      try {
        const res = await fetch(base + '/api/system/rooms');
        if (!res.ok) return;
        const data = await res.json();
        roomsData = data.rooms || [];
        visionSummaryData = data.visionSummary || null;
        renderRoomDockBar();
        renderPinnedRoomsTray();
        renderHorizonOverviewCharts();
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function setLeftNavActive(id) {
      document.querySelectorAll('#left-ambient-navbar .lnav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.id === 'lnav-' + id);
      });
    }

    const SATELLITE_REDIRECT_MAP = {
      'floorplan': { parent: 'smart-canvas', title: 'Smart Home', hash: '#subpage=floorplan' },
      'george-sync': { parent: 'finance-analytics', title: 'Finanzen', hash: '#subpage=george-sync' },
      'network-monitor': { parent: 'system-monitor', title: 'System & Infra', hash: '#subpage=network-monitor' },
      'google-usage': { parent: 'system-monitor', title: 'System & Infra', hash: '#subpage=google-usage' }
    };

    function openFullService(appId, title, hash, fromSidebar) {
      if (SATELLITE_REDIRECT_MAP[appId]) {
        const mapped = SATELLITE_REDIRECT_MAP[appId];
        appId = mapped.parent;
        title = mapped.title;
        hash = mapped.hash;
      }
      setLeftNavActive(appId);
      const inHass = Boolean(
        document.body.classList.contains('in-hass-frame') ||
        (window.top && window.top !== window)
      );
      const barEl = document.getElementById('full-app-bar');
      if (barEl) {
        barEl.style.display = (fromSidebar || inHass) ? 'none' : 'flex';
      }
      try {
        if (window.top && window.top !== window) {
          window.top.__thassiActiveSidebarApp = appId;
          if (typeof window.top.__thassiSyncSidebarNow === 'function') {
            window.top.__thassiSyncSidebarNow();
          }
        }
      } catch (_e) {}
      document.getElementById('full-app-title').textContent = title || appId;
      const targetSrc = base + '/apps/' + appId + '/' + (hash || '');
      const frameEl = document.getElementById('full-app-frame');
      if (
        frameEl.getAttribute('data-current-app') !== appId ||
        frameEl.getAttribute('data-current-hash') !== (hash || '') ||
        frameEl.src === 'about:blank'
      ) {
        frameEl.setAttribute('data-current-app', appId);
        frameEl.setAttribute('data-current-hash', hash || '');
        frameEl.src = targetSrc;
      }
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      setLeftNavActive('horizon');
      try {
        if (window.location.hash && window.location.hash.length > 1) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (window.top) {
          window.top.__thassiActiveSidebarApp = null;
          if (window.top.location.hash && window.top.location.hash.length > 1) {
            window.top.history.replaceState(null, '', window.top.location.pathname + window.top.location.search);
          }
          if (typeof window.top.__thassiSyncSidebarNow === 'function') {
            window.top.__thassiSyncSidebarNow();
          }
        }
      } catch (_e) {}
      const frameEl = document.getElementById('full-app-frame');
      if (frameEl) {
        frameEl.removeAttribute('data-current-app');
        frameEl.removeAttribute('data-current-hash');
        frameEl.src = 'about:blank';
      }
      document.getElementById('full-app-overlay').style.display = 'none';
      loadAllLiveData();
    }

    // ============================================================================
    // THASSI.FINANCES CONFIGURABLE PREVIEW & QUICK IMPORT FLYOUT
    // ============================================================================
    let financesDashData = null;
    let financesPrivacyInitialized = false;
    let financesHidden = true; // Hidden by default until user clicks to toggle

    function fmtEurDash(val, masked) {
      if (masked) return '\u2022\u2022\u2022\u2022 \u20AC';
      return Number(val || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
    }

    function toggleFinancesVisibility(ev) {
      if (ev) ev.stopPropagation();
      financesHidden = !financesHidden;
      renderFinancesPreviewWidget();
    }

    function handleCompactFinancesClick(ev) {
      const w = document.getElementById('widget-finances');
      if (w && w.classList.contains('expanded')) {
        ev.stopPropagation();
        toggleFinancesVisibility(ev);
      }
    }

    async function refreshFinancesWidget(fallbackSummary) {
      try {
        const res = await fetch(base + '/api/apps/finance-analytics/dashboard');
        if (res.ok) {
          financesDashData = await res.json();
          if (!financesPrivacyInitialized && financesDashData.previewConfig) {
            financesHidden = financesDashData.previewConfig.hiddenByDefault !== false;
            financesPrivacyInitialized = true;
          }
          renderFinancesPreviewWidget();
          return;
        }
      } catch (err) {
        console.warn('Finance dashboard endpoint fallback:', err);
      }

      const fb = fallbackSummary || {};
      financesDashData = {
        kpis: {
          activeMonth: fb.activeMonth || 'Aktuell',
          currentBalance: fb.currentBalance ?? 4850,
          accountName: 'Sparkasse George Girokonto',
          expensesDay: fb.expensesDay ?? 0,
          expensesWeek: fb.expensesWeek ?? 0,
          income: fb.income || 0,
          expenses: fb.expenses || 0,
          net: fb.netCashflow || 0,
        },
        balanceConfig: {
          currentBalance: fb.currentBalance ?? 4850,
          accountName: 'Sparkasse George Girokonto',
        },
        exportReminder: fb.exportReminder || null,
        previewGroupBudgets: [],
        previewConfig: {
          hiddenByDefault: true,
          primaryMetric: 'current_balance',
          enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'quick_import']
        }
      };
      renderFinancesPreviewWidget();
    }

    function renderFinancesPreviewWidget() {
      const d = financesDashData;
      const widgetEl = document.getElementById('widget-finances');
      const compactEl = document.getElementById('compact-finances');
      const subEl = document.getElementById('sub-finances');
      const eyeBtn = document.getElementById('finances-eye-btn');
      const dotEl = document.getElementById('dot-finances');
      const remPill = document.getElementById('finances-reminder-pill');
      const remPillText = document.getElementById('finances-reminder-pill-text');
      const remExpBanner = document.getElementById('finances-reminder-expanded-banner');
      const remExpTitle = document.getElementById('finances-reminder-exp-title');
      const remExpDetail = document.getElementById('finances-reminder-exp-detail');
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

      if (widgetEl) {
        widgetEl.classList.toggle('finances-is-hidden', Boolean(financesHidden));
      }

      const k = d.kpis || {};
      const bal = d.balanceConfig || {};
      const rem = d.exportReminder || null;
      const currentBalance = bal.currentBalance !== undefined ? bal.currentBalance : (k.currentBalance || 0);
      const accountName = bal.accountName || k.accountName || 'Sparkasse George';
      const expensesDay = k.expensesDay !== undefined ? k.expensesDay : (d.expensesToday || 0);
      const expensesWeek = k.expensesWeek !== undefined ? k.expensesWeek : (d.expensesWeek || 0);
      const netCashflow = k.net !== undefined ? k.net : (d.netCashflowMonth || 0);
      const activeMonth = k.activeMonth || d.activeMonth || '';
      const groupBudgets = d.previewGroupBudgets || d.groupBudgets || [];

      // Render Horizon Export Reminder Pill & Expanded Banner (visible even in privacy-masked mode)
      const isDue = Boolean(rem && rem.due);
      const isOverdue = Boolean(rem && rem.urgency === 'overdue');
      const remColor = isOverdue ? '#ef4444' : '#f59e0b';
      if (dotEl) {
        if (isDue) {
          dotEl.style.display = 'inline-block';
          dotEl.style.background = remColor;
          dotEl.style.boxShadow = '0 0 10px ' + remColor;
        } else {
          dotEl.style.display = 'none';
        }
      }
      if (remPill && remPillText) {
        if (isDue) {
          const daysAge = rem.daysSinceLatestTx != null ? rem.daysSinceLatestTx : rem.daysSinceLastSync;
          remPillText.textContent = daysAge != null
            ? ('Export f\xE4llig \xB7 vor ' + daysAge + 'T')
            : 'Bank-Export f\xE4llig';
          remPill.style.display = 'inline-flex';
          remPill.style.borderColor = isOverdue ? 'rgba(239,68,68,0.55)' : 'rgba(245,158,11,0.45)';
          remPill.style.background = isOverdue ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)';
          remPill.style.color = isOverdue ? '#fca5a5' : '#fcd34d';
        } else {
          remPill.style.display = 'none';
        }
      }
      if (remExpBanner) {
        if (isDue) {
          remExpBanner.style.display = 'flex';
          if (remExpTitle) remExpTitle.textContent = rem.headlineDe || 'Bank-Export & Sync f\xE4llig';
          if (remExpDetail) remExpDetail.textContent = rem.detailDe || 'Jetzt Kontoauszug in George exportieren und abgleichen.';
        } else {
          remExpBanner.style.display = 'none';
        }
      }

      const cfg = d.previewConfig || {
        hiddenByDefault: true,
        primaryMetric: 'current_balance',
        enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'group_budgets', 'quick_import']
      };
      const enabled = cfg.enabledElements || [];

      if (eyeBtn) {
        eyeBtn.textContent = financesHidden ? 'SHOW' : 'HIDE';
        eyeBtn.title = financesHidden ? 'Finanzdaten anzeigen' : 'Finanzdaten verbergen';
      }
      if (toggleLink) {
        toggleLink.textContent = financesHidden ? 'Zahlen anzeigen' : 'Zahlen verbergen';
      }

      // Primary headline
      if (financesHidden) {
        compactEl.innerHTML = '<strong>\u2022\u2022\u2022\u2022 \u20AC</strong>';
        if (subEl) subEl.textContent = accountName;
      } else {
        let headlineVal = fmtEurDash(currentBalance, false);
        let headlineSub = accountName + ' \xB7 Kontostand';
        if (cfg.primaryMetric === 'expenses_day') {
          headlineVal = '-' + fmtEurDash(expensesDay, false);
          headlineSub = 'Ausgaben Tag (' + (k.expensesDayDate || 'Heute') + ')';
        } else if (cfg.primaryMetric === 'expenses_week') {
          headlineVal = '-' + fmtEurDash(expensesWeek, false);
          headlineSub = 'Ausgaben 7-Tage (' + (k.expensesWeekRangeLabel || 'Woche') + ')';
        } else if (cfg.primaryMetric === 'net_cashflow') {
          const sign = Number(netCashflow) >= 0 ? '+' : '';
          headlineVal = sign + fmtEurDash(netCashflow, false);
          headlineSub = 'Cashflow ' + activeMonth;
        }
        compactEl.innerHTML = '<strong>' + headlineVal + '</strong>';
        if (subEl) subEl.textContent = headlineSub;
      }

      // Build configurable dynamic body
      const statCards = [];
      if (enabled.includes('current_balance')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" style="color:#fafafa;">' +
            fmtEurDash(currentBalance, financesHidden) +
            '</span></div>'
        );
      }
      if (enabled.includes('expenses_day')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag)</span><span class="w-stat-v" style="color:#a1a1aa;">-' +
            fmtEurDash(expensesDay, financesHidden) +
            '</span></div>'
        );
      }
      if (enabled.includes('expenses_week')) {
        statCards.push(
          '<div class="w-stat-item"><span class="w-stat-k">Ausgaben (Woche)</span><span class="w-stat-v" style="color:#a1a1aa;">-' +
            fmtEurDash(expensesWeek, financesHidden) +
            '</span></div>'
        );
      }

      let html = '';
      if (statCards.length > 0) {
        html += '<div class="w-stat-grid">' + statCards.join('') + '</div>';
      }

      if (enabled.includes('group_budgets') && Array.isArray(groupBudgets) && groupBudgets.length > 0) {
        const budgetRows = groupBudgets.slice(0, 4).map((b) => {
          const pct = Math.min(100, Math.round(b.pctUsed !== undefined ? b.pctUsed : (b.pct || 0)));
          const limit = b.budgetLimit !== undefined ? b.budgetLimit : (b.limit || 0);
          const barColor = b.overBudget ? '#ef4444' : '#fafafa';
          const valText = financesHidden
            ? '\u2022\u2022\u2022\u2022 / \u2022\u2022\u2022\u2022 \u20AC'
            : (Math.round(b.spent || 0) + ' / ' + Math.round(limit) + ' \u20AC');
          return [
            '<div style="display:flex; flex-direction:column; gap:3px;">',
            '  <div style="display:flex; justify-content:space-between; font-size:11px; color:#fafafa;">',
            '    <span>' + (b.labelDe || b.category) + '</span>',
            '    <span style="font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:#a1a1aa;">' + valText + '</span>',
            '  </div>',
            '  <div style="height:3px; background:rgba(255,255,255,0.08); border-radius:1px; overflow:hidden;">',
            '    <div style="width:' + (financesHidden ? 35 : pct) + '%; height:100%; background:' + barColor + ';"></div>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');
        html += '<div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">' + budgetRows + '</div>';
      }

      dynEl.innerHTML = html || '<div style="font-size:11.5px; color:#52525b;">Keine Preview-Felder ausgew\xE4hlt</div>';

      if (qiSlot) {
        if (enabled.includes('quick_import')) {
          qiSlot.innerHTML =
            '<button onclick="openQuickImportFlyout(event)" style="width:100%; padding:6px 12px; border-radius:4px; border:1px solid rgba(255,255,255,0.14); background:#141417; color:#fafafa; font-size:11.5px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">Bank-Export &amp; Datei-Sync Flyout</button>';
        } else {
          qiSlot.innerHTML = '';
        }
      }
    }

    function openQuickImportFlyout(ev) {
      if (ev) ev.stopPropagation();
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (frame) {
        frame.src = base + '/api/apps/finance-analytics/quick-import/portal';
      }
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeQuickImportFlyout() {
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (modal) modal.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      loadAllLiveData();
    }

    function showQiDashStatus(msg, ok) {
      const el = document.getElementById('qi-dash-status');
      if (!el) return;
      el.style.display = 'block';
      el.style.background = ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)';
      el.style.border = '1px solid ' + (ok ? '#10b981' : '#ef4444');
      el.style.color = ok ? '#34d399' : '#f87171';
      el.textContent = msg;
    }

    function launchBankingPopupFromDashboard(ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const qiCfg = (financesDashData && financesDashData.quickImportConfig) || {};
      const url = qiCfg.loginUrl || 'https://george.sparkasse.at/index.html#/login';
      if (qiCfg.verfuegernummer && navigator.clipboard) {
        navigator.clipboard.writeText(qiCfg.verfuegernummer).catch(() => {});
      }
      const w = 1040, h = 760;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      window.open(url, 'ThassiOnlineBankingPopup', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
      openQuickImportFlyout();
      showQiDashStatus(
        qiCfg.verfuegernummer
          ? ('George ge\xF6ffnet (Verf\xFCgernummer ' + qiCfg.verfuegernummer + ' kopiert). Nach CSV-Download auf "Neuesten Export aus Downloads lesen" klicken oder Datei hierher ziehen.')
          : 'Online-Banking ge\xF6ffnet. Nach CSV-Download Datei einfach hier ablegen oder aus Downloads einlesen.',
        true
      );
    }

    async function snoozeFinanceReminderFromDash(ev, days) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      try {
        await fetch(base + '/api/apps/finance-analytics/reminder/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snoozeDays: days || 3 })
        });
        await refreshFinancesWidget();
      } catch (_e) {}
    }

    function triggerDirectFinanceExportFromDash(ev, format) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const fmt = format || 'csv_de';
      const a = document.createElement('a');
      a.href = base + '/api/apps/finance-analytics/export?format=' + encodeURIComponent(fmt) + '&month=all';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showQiDashStatus('Export gestartet (' + fmt.toUpperCase() + ').', true);
      setTimeout(() => void refreshFinancesWidget(), 900);
    }

    async function importFinanceFileObjectFromDash(file) {
      if (!file) return false;
      try {
        showQiDashStatus('Importiere ' + file.name + '...', true);
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = window.btoa(binary);
        const res = await fetch(base + '/api/apps/finance-analytics/import-bank-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, base64Content: b64 })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Import fehlgeschlagen');
        showQiDashStatus(file.name + ': ' + (json.importedCount || 0) + ' neue Buchungen importiert (' + (json.skippedDuplicates || 0) + ' Duplikate \xFCbersprungen)!', true);
        await refreshFinancesWidget();
        return true;
      } catch (e) {
        showQiDashStatus('Datei-Import fehlgeschlagen: ' + (e.message || e), false);
        return false;
      }
    }

    async function triggerDashboardLocalFolderScan() {
      try {
        if (typeof window.showDirectoryPicker === 'function') {
          showQiDashStatus('W\xE4hle deinen lokalen Downloads-Ordner zum Lesen der neuesten Bank-CSV...', true);
          const dirHandle = await window.showDirectoryPicker({
            id: 'thassi_bank_downloads',
            startIn: 'downloads',
            mode: 'read'
          });
          if (dirHandle) {
            const candidates = [];
            const cutoffMs = Date.now() - 45 * 86400000;
            for await (const entry of dirHandle.values()) {
              if (entry.kind !== 'file') continue;
              const lower = String(entry.name || '').toLowerCase();
              if (!lower.endsWith('.csv') && !lower.endsWith('.xml') && !lower.endsWith('.sta') && !lower.endsWith('.mt940')) continue;
              const f = await entry.getFile();
              if (f.size >= 40 && f.size <= 15 * 1024 * 1024 && f.lastModified >= cutoffMs) {
                candidates.push({ file: f, mtime: f.lastModified });
              }
            }
            candidates.sort((a, b) => b.mtime - a.mtime);
            if (candidates.length > 0) {
              await importFinanceFileObjectFromDash(candidates[0].file);
              return;
            }
          }
        }
        await triggerDashboardDownloadsScan();
      } catch (e) {
        if (e && e.name !== 'AbortError') {
          await triggerDashboardDownloadsScan();
        }
      }
    }

    function handleDashboardQuickFileDrop(ev) {
      if (!ev) return;
      ev.preventDefault();
      const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) {
        void importFinanceFileObjectFromDash(file);
      }
    }

    async function triggerDashboardQuickImportSample() {
      try {
        showQiDashStatus('\u23F3 Lade George-Umsatzexport herunter & importiere...', true);
        const impRes = await fetch(base + '/api/apps/finance-analytics/quick-import/simulate-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountName: 'Girokonto' })
        });
        const json = await impRes.json();
        showQiDashStatus('\u2705 ' + (json.insertedCount || 0) + ' neue Buchungen importiert (' + (json.skippedDuplicates || 0) + ' Duplikate \xFCbersprungen)', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Fehler beim Quick-Import', false);
      }
    }

    async function triggerDashboardDownloadsScan() {
      try {
        showQiDashStatus('\u{1F50D} Scanne Downloads-Ordner nach neuen Kontoausz\xFCgen...', true);
        const res = await fetch(base + '/api/apps/finance-analytics/quick-import/scan-downloads', { method: 'POST' });
        const json = await res.json();
        const evts = json.events || [];
        if (evts.length > 0) {
          const totalIns = evts.reduce((s, x) => s + (x.insertedCount || 0), 0);
          showQiDashStatus('\u2705 ' + evts.length + ' Datei(en) erkannt: ' + totalIns + ' neue Buchungen importiert!', true);
        } else {
          showQiDashStatus('\u2139\uFE0F Keine neuen Bank-Exporte in Downloads gefunden.', true);
        }
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Downloads-Scan fehlgeschlagen', false);
      }
    }

    async function handleDashboardQuickFileSelect(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      await importFinanceFileObjectFromDash(file);
    }

    window.addEventListener('message', (ev) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'THASSI_QUICK_IMPORT_DONE') {
        const p = ev.data.payload || {};
        showQiDashStatus('\u2705 Auto-Import abgeschlossen: ' + (p.insertedCount || p.imported || 0) + ' neue Buchungen!', true);
        refreshFinancesWidget();
      } else if (ev.data.type === 'THASSI_OPEN_BANK_POPUP') {
        launchBankingPopupFromDashboard();
      }
    });

    function toggleEventModal(show) {
      const m = document.getElementById('quick-event-modal');
      m.style.display = show ? 'block' : 'none';
      if (show) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('qe-start').value = now.toISOString().slice(0, 16);
        document.getElementById('qe-title').focus();
      }
    }

    async function createQuickEvent(e) {
      e.preventDefault();
      const title = document.getElementById('qe-title').value.trim();
      const startVal = document.getElementById('qe-start').value;
      const dur = Number(document.getElementById('qe-dur').value || 60);
      if (!title || !startVal) return;

      await fetch(base + '/api/apps/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          start_time: new Date(startVal).toISOString(),
          duration_minutes: dur
        })
      });
      document.getElementById('qe-title').value = '';
      toggleEventModal(false);
      await loadAllLiveData();
    }

    function showNoteFeedback(msg, isError) {
      const el = document.getElementById('note-sync-feedback');
      if (!el) return;
      el.textContent = msg;
      el.style.display = 'block';
      el.style.color = isError ? '#f87171' : '#38bdf8';
      el.style.background = isError ? 'rgba(248,113,113,0.12)' : 'rgba(56,189,248,0.1)';
      el.style.borderColor = isError ? 'rgba(248,113,113,0.28)' : 'rgba(56,189,248,0.22)';
      clearTimeout(window.__noteFeedbackTimer);
      window.__noteFeedbackTimer = setTimeout(() => {
        el.style.display = 'none';
      }, 4200);
    }

    function escapeNoteHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderHorizonNotesList(notes) {
      const list = Array.isArray(notes) ? notes : [];
      const compactEl = document.getElementById('compact-notes');
      const subEl = document.getElementById('sub-notes');
      const listEl = document.getElementById('notes-list');
      if (!compactEl || !listEl) return;

      if (list.length > 0) {
        const latest = String(list[0].content || '');
        compactEl.innerHTML = '<strong>' + list.length + ' ' + (list.length === 1 ? 'note' : 'notes') + '</strong>';
        if (subEl) subEl.textContent = latest.length > 28 ? latest.slice(0, 28) + '\u2026' : latest;
        listEl.innerHTML = list
          .map((n) => {
            const fileName = n.fileName || (n.id ? 'note_' + n.id + '.json' : 'note.json');
            const safeFileAttr = escapeNoteHtml(fileName);
            const keepSynced = Boolean(n.syncedKeep);
            const driveSynced = Boolean(n.syncedDrive);
            return [
              '<div class="note-row">',
              '  <div class="note-row-top">',
              '    <span class="note-content-text">' + escapeNoteHtml(n.content) + '</span>',
              '    <button class="note-del" title="Notiz l\xF6schen (' + safeFileAttr + ')" data-note-file="' + safeFileAttr + '" onclick="deleteNote(this.dataset.noteFile)">\u2715</button>',
              '  </div>',
              '  <div class="note-row-meta">',
              '    <span class="note-file-badge" title="Lokale Datei: /data/notes/' + safeFileAttr + '">' + safeFileAttr + '</span>',
              '    <div class="note-actions-group">',
              '      <button type="button" class="note-action-btn keep ' + (keepSynced ? 'synced' : '') + '" data-note-file="' + safeFileAttr + '" data-note-target="keep" onclick="sendHorizonNote(this.dataset.noteFile, this.dataset.noteTarget, this)" title="An Google Keep / Notes senden">',
              '        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
              '        <span>' + (keepSynced ? '\u2713 Keep' : 'Keep') + '</span>',
              '      </button>',
              '      <button type="button" class="note-action-btn drive ' + (driveSynced ? 'synced' : '') + '" data-note-file="' + safeFileAttr + '" data-note-target="drive" onclick="sendHorizonNote(this.dataset.noteFile, this.dataset.noteTarget, this)" title="An Google Drive senden">',
              '        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 15 15.5 21 8.5 21 5 15 12 2"/><line x1="5" y1="15" x2="19" y2="15"/></svg>',
              '        <span>' + (driveSynced ? '\u2713 Drive' : 'Drive') + '</span>',
              '      </button>',
              '    </div>',
              '  </div>',
              '</div>'
            ].join('');
          })
          .join('');
      } else {
        compactEl.textContent = '0 notes';
        if (subEl) subEl.textContent = 'Tap to write a quick note';
        listEl.innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4);">No notes saved yet.</div>';
      }
    }

    async function refreshHorizonNotes(fallbackNotes) {
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes');
        if (res.ok) {
          const data = await res.json();
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      renderHorizonNotesList(fallbackNotes || []);
    }

    async function addNote(e) {
      e.preventDefault();
      const input = document.getElementById('note-input');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.note?.fileName) {
            showNoteFeedback('Gespeichert: ' + data.note.fileName, false);
          }
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      await fetch(base + '/api/system/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      await loadAllLiveData();
    }

    async function deleteNote(fileOrId) {
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes?fileName=' + encodeURIComponent(fileOrId), {
          method: 'DELETE'
        });
        if (res.ok) {
          const data = await res.json();
          renderHorizonNotesList(data.notes || []);
          return;
        }
      } catch {}
      await fetch(base + '/api/system/notes?id=' + encodeURIComponent(fileOrId), { method: 'DELETE' });
      await loadAllLiveData();
    }

    async function sendHorizonNote(fileName, target, btnEl) {
      if (btnEl) {
        btnEl.disabled = true;
        const span = btnEl.querySelector('span');
        if (span) span.textContent = '\u2026';
      }
      try {
        const res = await fetch(base + '/api/apps/memo/horizon-notes/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, target })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          const targetLabel = target === 'drive' ? 'Google Drive' : 'Google Keep / Notes';
          showNoteFeedback('\u2713 ' + fileName + ' \u2192 ' + targetLabel, false);
          if (Array.isArray(data.notes)) {
            renderHorizonNotesList(data.notes);
          } else {
            await refreshHorizonNotes();
          }
        } else {
          showNoteFeedback(data.error || 'Senden fehlgeschlagen', true);
          await refreshHorizonNotes();
        }
      } catch (err) {
        showNoteFeedback('Netzwerkfehler beim Senden', true);
        await refreshHorizonNotes();
      }
    }

    function applyHealthWidgetData(h) {
      if (h && (h.steps != null || h.currentHr != null)) {
        const stepsVal = Number(h.steps ?? 0);
        const stepGoal = Number(h.stepGoal || 10000);
        const hrVal = h.currentHr != null ? Math.round(Number(h.currentHr)) : null;

        // Minimal preview: Heart icon with HR inside + Progress circle with step count inside
        const hrInsideEl = document.getElementById('health-hr-inside');
        if (hrInsideEl) {
          hrInsideEl.textContent = hrVal != null ? String(hrVal) : '--';
        }
        const stepsInsideEl = document.getElementById('health-steps-inside');
        if (stepsInsideEl) {
          stepsInsideEl.textContent = h.steps != null
            ? (stepsVal >= 10000 ? (stepsVal / 1000).toFixed(1) + 'k' : String(stepsVal))
            : '--';
        }
        const ringEl = document.getElementById('health-steps-ring');
        if (ringEl) {
          const pct = Math.min(1, Math.max(0, stepsVal / Math.max(1, stepGoal)));
          const circum = 116.24; // 2 * Math.PI * 18.5
          ringEl.style.strokeDashoffset = (circum * (1 - pct)).toFixed(1);
        }

        const stepsTxt = h.steps != null ? stepsVal.toLocaleString() + ' steps' : 'No steps';
        const hrTxt = hrVal != null ? hrVal + ' bpm' : '';
        const compactEl = document.getElementById('compact-health');
        if (compactEl) compactEl.innerHTML = \`<strong>\${stepsTxt}</strong> \${hrTxt ? '\xB7 ' + hrTxt : ''}\`;
        const subEl = document.getElementById('sub-health');
        if (subEl) {
          subEl.textContent =
            h.readinessScore != null ? \`\${h.readinessScore}% readiness \xB7 \${h.readinessStatus || 'Pixel 10'}\` : (h.source || 'Pixel 10');
        }
        document.getElementById('eh-steps').textContent = h.steps != null ? stepsVal.toLocaleString() : 'No data';
        document.getElementById('eh-ready').textContent = h.readinessScore != null ? h.readinessScore + '/100' : 'No data';
        document.getElementById('eh-hr').textContent = hrVal != null ? hrVal + ' bpm' : 'No data';
        document.getElementById('eh-rhr').textContent =
          (h.restingHr != null ? h.restingHr + ' bpm' : '--') + ' / ' + (h.hrvMs != null ? h.hrvMs + ' ms' : '--');
        document.getElementById('eh-sleep').textContent = h.sleepHours != null ? h.sleepHours + ' h' : 'No data';
        document.getElementById('eh-burn').textContent =
          (h.activeCalories != null ? h.activeCalories + ' kcal' : '--') + ' \xB7 ' + (h.distanceKm != null ? h.distanceKm + ' km' : '--');
        return true;
      }
      return false;
    }

    let isRefreshingHealthLive = false;

    async function refreshHealthWidget(summaryFromSys) {
      if (summaryFromSys) {
        applyHealthWidgetData(summaryFromSys);
      }
      if (isRefreshingHealthLive) return;
      isRefreshingHealthLive = true;
      try {
        const liveRes = await fetch(base + '/api/apps/google-health/live?t=' + Date.now(), {
          cache: 'no-store',
        });
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (applyHealthWidgetData(liveData)) return;
        }
        const res = await fetch(base + '/api/apps/google-health/dashboard?t=' + Date.now(), {
          cache: 'no-store',
        });
        if (res.ok) {
          const d = await res.json();
          if (d.live && applyHealthWidgetData(d.live)) return;
          const t = d.today || {};
          const r = d.readiness || {};
          const normalized = {
            steps: t.steps,
            stepGoal: t.step_goal,
            currentHr: t.current_hr,
            restingHr: t.resting_hr,
            sleepHours: t.sleep_hours,
            activeCalories: t.active_calories,
            readinessScore: r.score ?? t.readiness_score,
            readinessStatus: r.status,
            hrvMs: d.hrvMs,
            distanceKm: d.distanceKm,
            source: t.source || 'Pixel 10',
          };
          if (applyHealthWidgetData(normalized)) return;
        }
      } catch (_e) {
      } finally {
        isRefreshingHealthLive = false;
      }
      if (summaryFromSys) return;
      const hrInsideEl = document.getElementById('health-hr-inside');
      if (hrInsideEl && !hrInsideEl.textContent.trim()) hrInsideEl.textContent = '--';
      const stepsInsideEl = document.getElementById('health-steps-inside');
      if (stepsInsideEl && !stepsInsideEl.textContent.trim()) stepsInsideEl.textContent = '--';
    }

    function applyMealsWidgetData(m) {
      if (m && (m.breakfast || m.lunch || m.dinner)) {
        const nextMeal = m.dinner || m.lunch || m.breakfast;
        document.getElementById('compact-meals').innerHTML = '<strong>' + nextMeal + '</strong>';
        document.getElementById('sub-meals').textContent = (m.totalCalories || 0) + ' kcal planned today';
        document.getElementById('em-slots').innerHTML = [
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">FR\xDCHST\xDCCK:</span> <strong>' + (m.breakfast || '\u2014') + '</strong></div>',
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">MITTAG:</span> <strong>' + (m.lunch || '\u2014') + '</strong></div>',
          '<div><span style="font-family:var(--font-mono); font-size:10.5px; color:#52525b;">ABEND:</span> <strong>' + (m.dinner || '\u2014') + '</strong></div>'
        ].join('');
        return true;
      }
      return false;
    }

    async function refreshMealsWidget(summaryFromSys) {
      if (applyMealsWidgetData(summaryFromSys)) return;
      try {
        const res = await fetch(base + '/api/apps/meal-planner/sync-ha', { method: 'POST' });
        if (res.ok) {
          const d = await res.json();
          if (applyMealsWidgetData(d)) return;
        }
      } catch (_e) {}
      document.getElementById('compact-meals').textContent = 'Unplanned';
      document.getElementById('sub-meals').textContent = 'No meals logged for today';
      document.getElementById('em-slots').innerHTML = 'No meals planned for today yet.';
    }

    function toggleCalendarFilterPopover(ev) {
      if (ev) ev.stopPropagation();
      const pop = document.getElementById('horizon-cal-filter-popover');
      if (!pop) return;
      pop.classList.toggle('open');
      if (pop.classList.contains('open')) {
        renderCalendarFilterPopover();
      }
    }

    function renderCalendarFilterPopover() {
      const listEl = document.getElementById('horizon-cal-filter-list');
      const badgeEl = document.getElementById('cal-filter-oauth-badge');
      const btnLabel = document.getElementById('cal-filter-btn-label');

      const visibleSet = new Set();
      for (const c of horizonCalendars) {
        if (Number(c.show_in_horizon) === 1) {
          visibleSet.add(c.calendar_name);
        }
      }

      if (btnLabel) {
        if (horizonCalendars.length > 0) {
          btnLabel.textContent = \`Calendars (\${visibleSet.size}/\${horizonCalendars.length})\`;
        } else {
          btnLabel.textContent = 'Calendars';
        }
      }

      if (badgeEl) {
        if (googleOAuthInfo && googleOAuthInfo.authorized) {
          badgeEl.style.color = '#34d399';
          badgeEl.textContent = '\u{1F7E2} Google OAuth Connected' + (googleOAuthInfo.accountEmail ? ' (' + googleOAuthInfo.accountEmail + ')' : '');
        } else {
          badgeEl.style.color = '#fbbf24';
          badgeEl.textContent = '\u26A1 Home Assistant + Google Calendar Sync';
        }
      }

      if (!listEl) return;
      if (!horizonCalendars || horizonCalendars.length === 0) {
        listEl.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:6px;">No calendars discovered yet. Click Sync below.</div>';
        return;
      }

      listEl.innerHTML = horizonCalendars
        .map((c, idx) => {
          const checked = Number(c.show_in_horizon) === 1;
          const color = c.color || '#38bdf8';
          const count = Number(c.event_count || 0);
          const safeName = String(c.calendar_name || '').split('"').join('&quot;');
          return \`
            <label class="cal-filter-row" title="\${safeName}">
              <div style="display:flex; align-items:center; gap:7px; min-width:0; flex:1;">
                <input type="checkbox" \${checked ? 'checked' : ''} onchange="toggleHorizonCalendarItem(\${idx}, this.checked)" style="accent-color:\${color}; cursor:pointer;" />
                <span style="width:8px; height:8px; border-radius:99px; background:\${color}; flex-shrink:0;"></span>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; color:\${checked ? '#f8fafc' : '#64748b'};">\${c.calendar_name}</span>
              </div>
              <span style="font-size:10px; color:#94a3b8; flex-shrink:0;">\${count}</span>
            </label>
          \`;
        })
        .join('');
    }

    function applyLocalHorizonCalendarFilter() {
      const hiddenNames = new Set(
        horizonCalendars.filter((c) => Number(c.show_in_horizon) === 0).map((c) => c.calendar_name)
      );
      calendarEvents = allCalendarEvents.filter((ev) => !hiddenNames.has(ev.calendar_name || 'Google Calendar'));
      renderCalendarFilterPopover();
      renderTimelineGeometry();
    }

    async function toggleHorizonCalendarItem(idx, checked) {
      const target = horizonCalendars[idx];
      if (!target) return;
      target.show_in_horizon = checked ? 1 : 0;
      applyLocalHorizonCalendarFilter();
      try {
        await fetch(base + '/api/apps/google-calendar/calendars/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendar_name: target.calendar_name, show_in_horizon: checked })
        });
      } catch (_e) {}
    }

    async function setAllHorizonCalendarsFromDash(show) {
      const map = {};
      for (const c of horizonCalendars) {
        c.show_in_horizon = show ? 1 : 0;
        map[c.calendar_name] = show;
      }
      applyLocalHorizonCalendarFilter();
      try {
        await fetch(base + '/api/apps/google-calendar/calendars/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendars: map })
        });
      } catch (_e) {}
    }

    async function syncGoogleCalendarsFromDash() {
      const badgeEl = document.getElementById('cal-filter-oauth-badge');
      if (badgeEl) {
        badgeEl.style.color = '#38bdf8';
        badgeEl.textContent = '\u23F3 Syncing Google OAuth & Home Assistant...';
      }
      try {
        await fetch(base + '/api/apps/google-calendar/oauth/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importFromHa: true })
        });
        await fetch(base + '/api/apps/google-calendar/sync', { method: 'POST' });
        await loadAllLiveData();
      } catch (_e) {}
    }

    async function loadAllLiveData() {
      try {
        void loadRoomsQuickAccess();
        const [sysRes, calRes] = await Promise.all([
          fetch(base + '/api/system/status').catch(() => null),
          fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null)
        ]);
        const sys = sysRes && sysRes.ok ? await sysRes.json() : {};
        const calData = calRes && calRes.ok ? await calRes.json() : { events: [] };
        window.__horizonLastFetchMs = Date.now();

        const sysDotEl = document.getElementById('horizon-sys-dot');
        const sysTxtEl = document.getElementById('horizon-sys-status-text');
        if (sysDotEl && sysTxtEl) {
          const haOk = Boolean(sys.ha && sys.ha.connected !== false);
          const googleOk = Boolean(sys.google && sys.google.authorized);
          if (haOk && googleOk) {
            sysDotEl.style.background = '#10b981';
            sysTxtEl.textContent = 'HA \xB7 GOOGLE NOMINAL';
          } else if (haOk) {
            sysDotEl.style.background = '#f59e0b';
            sysTxtEl.textContent = 'HA OK \xB7 OAUTH CHECK';
          } else {
            sysDotEl.style.background = '#ef4444';
            sysTxtEl.textContent = 'HA VERBINDUNG PR\xDCFEN';
          }
        }

        calendarEvents = calData.events || [];
        allCalendarEvents = calData.allEvents || calData.events || [];
        horizonCalendars = calData.calendars || [];
        googleOAuthInfo = calData.googleOAuth || null;
        renderCalendarFilterPopover();
        renderTimelineGeometry();

        // Weather forecast & background effects for St. Veit / G\xF6lsen
        void loadWeatherData(sys.summaries?.weather);

        // 1. Update HEALTH widget
        void refreshHealthWidget(sys.summaries?.health);

        // 2. Update FINANCES widget (Configurable preview, hidden by default)
        void refreshFinancesWidget(sys.summaries?.finance);

        // 3. Update NOTES widget (local note_yyyyMMdd-HHmmss.json files + Keep/Drive actions)
        void refreshHorizonNotes(sys.notes);

        // 4. Update MEALS widget
        void refreshMealsWidget(sys.summaries?.meals);

        // 5. Update 3D PRINT Mini-Preview Widget
        void refreshMini3dData(sys.summaries?.print3d);
      } catch (err) {
        console.error('Failed loading dashboard data:', err);
      }
    }

    // ============================================================================
    // 3D PRINT MINI-PREVIEW RENDERER & CONTROLS (3D OBJECT + PROGRESS + PLACEHOLDER)
    // ============================================================================
    let mini3dState = {
      hasActiveProject: false,
      activeProjectId: null,
      projectName: null,
      scene: null,
      stats: null,
      printer: {
        name: 'Bambu Lab P1S',
        status: 'IDLE',
        progressPercent: 0,
        currentLayer: 0,
        totalLayers: 0,
        remainingMinutes: 0,
        nozzleTemp: 24,
        bedTemp: 24,
      },
      yaw: 0.65,
      pitch: 0.42,
      dragging: false,
      lastX: 0,
      lastY: 0,
      triangles: [],
      maxExtent: 60,
      centerZ: 20,
    };

    function transformMiniPt(pt, pos, rotDeg, scale) {
      let x = pt[0] * ((scale && scale[0]) || 1);
      let y = pt[1] * ((scale && scale[1]) || 1);
      let z = pt[2] * ((scale && scale[2]) || 1);
      const rx = (((rotDeg && rotDeg[0]) || 0) * Math.PI) / 180;
      const ry = (((rotDeg && rotDeg[1]) || 0) * Math.PI) / 180;
      const rz = (((rotDeg && rotDeg[2]) || 0) * Math.PI) / 180;
      if (rx !== 0) {
        const c = Math.cos(rx), s = Math.sin(rx);
        const ny = y * c - z * s, nz = y * s + z * c;
        y = ny; z = nz;
      }
      if (ry !== 0) {
        const c = Math.cos(ry), s = Math.sin(ry);
        const nx = x * c + z * s, nz = -x * s + z * c;
        x = nx; z = nz;
      }
      if (rz !== 0) {
        const c = Math.cos(rz), s = Math.sin(rz);
        const nx = x * c - y * s, ny = x * s + y * c;
        x = nx; y = ny;
      }
      return [
        x + ((pos && pos[0]) || 0),
        y + ((pos && pos[1]) || 0),
        z + ((pos && pos[2]) || 0),
      ];
    }

    function buildMiniTrianglesFromScene(scene) {
      if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return [];
      const tris = [];
      for (const n of scene.nodes) {
        if (n.operation === 'subtract') continue;
        const p = n.params || {};
        const pos = n.position || [0, 0, 0];
        const rot = n.rotation || [0, 0, 0];
        const scl = n.scale || [1, 1, 1];
        const col = n.color || (scene.printProfile && scene.printProfile.filamentColor) || '#00AE42';
        const local = [];
        const addQ = (a, b, c, d) => {
          local.push([a, b, c]);
          local.push([a, c, d]);
        };

        if (n.type === 'apple') {
          const rad = Math.max(8, p.radius || 34);
          const h = Math.max(12, p.height || 58);
          const topInd = p.topIndent || h * 0.21;
          const botInd = p.bottomIndent || h * 0.09;
          const prof = [
            [0.0, botInd],
            [0.35, 0.0],
            [0.78, h * 0.18],
            [1.03, h * 0.54],
            [0.85, h * 0.88],
            [0.54, h],
            [0.24, h - topInd * 0.55],
            [0.0, h - topInd],
          ];
          const segs = 18;
          for (let ri = 0; ri < prof.length - 1; ri++) {
            const [rf0, z0] = prof[ri];
            const [rf1, z1] = prof[ri + 1];
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              const r0 = rad * rf0, r1 = rad * rf1;
              const p00 = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
              const p10 = [r0 * Math.cos(a1), r0 * Math.sin(a1), z0];
              const p11 = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
              const p01 = [r1 * Math.cos(a0), r1 * Math.sin(a0), z1];
              if (rf0 <= 1e-4) local.push([p00, p11, p01]);
              else if (rf1 <= 1e-4) local.push([p00, p10, p11]);
              else addQ(p00, p10, p11, p01);
            }
          }
        } else if (n.type === 'lathe') {
          const h = Math.max(10, p.height || 65);
          const ctrl = [
            p.rBottom || p.radiusBottom || 22,
            p.rLower || p.rBelly || 28,
            p.rMid || 26,
            p.rUpper || 20,
            p.rNeck || 14,
            p.rTop || p.radiusTop || 14,
          ];
          const segs = 16;
          for (let ri = 0; ri < ctrl.length - 1; ri++) {
            const r0 = ctrl[ri], r1 = ctrl[ri + 1];
            const z0 = (ri / (ctrl.length - 1)) * h;
            const z1 = ((ri + 1) / (ctrl.length - 1)) * h;
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'sphere') {
          const rad = Math.max(2, p.radius || 20);
          const dome = Boolean(p.domeOnly);
          const latS = dome ? 6 : 10;
          const lonS = 16;
          for (let la = 0; la < latS; la++) {
            const t0 = dome ? (la / latS) * (Math.PI / 2) : -Math.PI / 2 + (la / latS) * Math.PI;
            const t1 = dome ? ((la + 1) / latS) * (Math.PI / 2) : -Math.PI / 2 + ((la + 1) / latS) * Math.PI;
            const z0 = dome ? rad * Math.sin(t0) : rad + rad * Math.sin(t0);
            const z1 = dome ? rad * Math.sin(t1) : rad + rad * Math.sin(t1);
            const r0 = rad * Math.cos(t0), r1 = rad * Math.cos(t1);
            for (let lo = 0; lo < lonS; lo++) {
              const a0 = (lo / lonS) * Math.PI * 2, a1 = ((lo + 1) / lonS) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'torus') {
          const R = Math.max(4, p.radius || 22);
          const r = Math.max(1, p.tubeRadius || 5);
          const majS = 16, minS = 10;
          for (let i = 0; i < majS; i++) {
            const u0 = (i / majS) * Math.PI * 2, u1 = ((i + 1) / majS) * Math.PI * 2;
            for (let j = 0; j < minS; j++) {
              const v0 = (j / minS) * Math.PI * 2, v1 = ((j + 1) / minS) * Math.PI * 2;
              const tp = (u, v) => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r + r * Math.sin(v)];
              addQ(tp(u0, v0), tp(u1, v0), tp(u1, v1), tp(u0, v1));
            }
          }
        } else if (n.type === 'cylinder' || n.type === 'cone' || n.type === 'gear' || n.type === 'twisted_vase' || n.type === 'hex_organizer' || n.type === 'star' || n.type === 'heart') {
          const segs = n.type === 'hex_organizer' ? 6 : 18;
          const rBot = p.radiusBottom || p.outerRadius || p.radius || (p.width ? p.width / 2 : 20);
          const rTop = n.type === 'cone' ? (p.radiusTop != null ? p.radiusTop : 1) : (p.radiusTop || rBot);
          const h = p.height || 30;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const m0 = n.type === 'star' && i % 2 === 1 ? 0.45 : 1;
            const m1 = n.type === 'star' && (i + 1) % 2 === 1 ? 0.45 : 1;
            const x0b = Math.cos(a0) * rBot * m0, y0b = Math.sin(a0) * rBot * m0;
            const x1b = Math.cos(a1) * rBot * m1, y1b = Math.sin(a1) * rBot * m1;
            const x0t = Math.cos(a0) * rTop * m0, y0t = Math.sin(a0) * rTop * m0;
            const x1t = Math.cos(a1) * rTop * m1, y1t = Math.sin(a1) * rTop * m1;
            addQ([x0b, y0b, 0], [x1b, y1b, 0], [x1t, y1t, h], [x0t, y0t, h]);
            local.push([[0, 0, h], [x0t, y0t, h], [x1t, y1t, h]]);
          }
        } else {
          const w = (p.width || 36) / 2;
          const d = (p.depth || 36) / 2;
          const h = p.height || 30;
          const v = [
            [-w, -d, 0], [w, -d, 0], [w, d, 0], [-w, d, 0],
            [-w, -d, h], [w, -d, h], [w, d, h], [-w, d, h]
          ];
          const faces = [
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [1, 2, 6], [1, 6, 5],
            [2, 3, 7], [2, 7, 6],
            [3, 0, 4], [3, 4, 7]
          ];
          for (const f of faces) local.push([v[f[0]], v[f[1]], v[f[2]]]);
        }

        for (const [p0, p1, p2] of local) {
          tris.push({
            v: [
              transformMiniPt(p0, pos, rot, scl),
              transformMiniPt(p1, pos, rot, scl),
              transformMiniPt(p2, pos, rot, scl),
            ],
            c: col,
          });
        }
      }
      return tris;
    }

    async function refreshMini3dData(summaryFromSys) {
      try {
        const res = await fetch(base + '/api/apps/3d-print/dashboard');
        if (res.ok) {
          const data = await res.json();
          applyMini3dDashboardPayload(data);
          return;
        }
      } catch {}
      if (summaryFromSys) {
        applyMini3dDashboardPayload(summaryFromSys);
      }
    }

    function applyMini3dDashboardPayload(data) {
      if (!data) return;
      const hasProj = Boolean(data.hasActiveProject && (data.activeProject || data.scene));
      const proj = data.activeProject || data;
      const scene = proj.scene || data.scene || null;
      const stats = proj.stats || data.stats || null;
      const tel = data.telemetry || data.printer || {};
      const cfg = data.printerConfig || {};

      const printer = {
        name: cfg.printerName || tel.name || 'Bambu Lab P1S',
        status: tel.printerState || tel.status || 'IDLE',
        progressPercent: Number(tel.progressPercent ?? proj.progressPct ?? 0),
        currentLayer: Number(tel.currentLayer ?? 0),
        totalLayers: Number(tel.totalLayers ?? (stats && stats.layerCount ? stats.layerCount : 0)),
        remainingMinutes: Number(tel.remainingMinutes ?? (stats && stats.estimatedPrintMinutes ? stats.estimatedPrintMinutes : 0)),
        nozzleTemp: Number(tel.nozzleTempC ?? tel.nozzleTemp ?? 24),
        bedTemp: Number(tel.bedTempC ?? tel.bedTemp ?? 24),
      };

      mini3dState.hasActiveProject = hasProj;
      mini3dState.activeProjectId = proj.id || data.activeProjectId || null;
      mini3dState.projectName = proj.title || proj.name || data.projectName || null;
      mini3dState.scene = scene;
      mini3dState.stats = stats;
      mini3dState.printer = printer;

      const rawDims = stats && stats.dimensionsMm ? stats.dimensionsMm : null;
      const dimX = rawDims ? (Array.isArray(rawDims) ? rawDims[0] : rawDims.x) : 60;
      const dimY = rawDims ? (Array.isArray(rawDims) ? rawDims[1] : rawDims.y) : 60;
      const dimZ = rawDims ? (Array.isArray(rawDims) ? rawDims[2] : rawDims.z) : 45;

      if (hasProj && scene) {
        mini3dState.triangles = buildMiniTrianglesFromScene(scene);
        mini3dState.maxExtent = Math.max(dimX || 50, dimY || 50, dimZ || 40, 35);
        mini3dState.centerZ = (dimZ || 40) * 0.45;
      } else {
        mini3dState.triangles = [];
      }

      const compactEl = document.getElementById('compact-3dprint');
      const subEl = document.getElementById('sub-3dprint');
      const fillEl = document.getElementById('mini-3d-progress-fill');
      const dotEl = document.getElementById('dot-3dprint');
      const dockMetaEl = document.getElementById('print3d-dock-meta');
      const ePrinter = document.getElementById('e3d-printer');
      const eLayer = document.getElementById('e3d-layer');
      const eDims = document.getElementById('e3d-dims');
      const eTemps = document.getElementById('e3d-temps');
      const btnToggle = document.getElementById('btn-mini-3d-toggle');

      const pct = Number(printer.progressPercent || 0);
      if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';

      if (!hasProj) {
        if (compactEl) compactEl.textContent = 'Kein 3D-Projekt';
        if (subEl) subEl.textContent = 'Platzhalter aktiv \xB7 0%';
        if (dockMetaEl) dockMetaEl.textContent = 'Leerlauf';
        if (dotEl) {
          dotEl.style.background = '#94a3b8';
          dotEl.style.boxShadow = '0 0 8px rgba(148,163,184,0.5)';
        }
        if (eDims) eDims.textContent = 'Kein Objekt geladen';
        if (btnToggle) btnToggle.textContent = 'Projekt laden';
      } else {
        if (compactEl) compactEl.textContent = mini3dState.projectName || '3D Objekt';
        const isPrinting = printer.status === 'RUNNING' || printer.status === 'PREPARE';
        const statusLabel = isPrinting
          ? ('Druckt \xB7 ' + pct + '% (' + (printer.remainingMinutes || 0) + 'm)')
          : (rawDims
              ? (Math.round(dimX) + '\xD7' + Math.round(dimY) + '\xD7' + Math.round(dimZ) + 'mm \xB7 ' + (pct > 0 ? pct + '%' : 'Bereit'))
              : 'Bereit zum Druck');
        if (subEl) subEl.textContent = statusLabel;
        if (dockMetaEl) {
          dockMetaEl.textContent = isPrinting ? (pct + '%') : 'Bereit';
        }
        if (dotEl) {
          const c = isPrinting ? '#38bdf8' : '#00AE42';
          dotEl.style.background = c;
          dotEl.style.boxShadow = '0 0 10px ' + c;
        }
        if (eDims && rawDims) {
          const weightG = stats.filamentWeightG || stats.estimatedWeightGrams || 15;
          eDims.textContent = Math.round(dimX) + '\xD7' + Math.round(dimY) + '\xD7' + Math.round(dimZ) + 'mm \xB7 ' + weightG + 'g';
        }
        if (btnToggle) btnToggle.textContent = 'Platzhalter testen';
      }

      if (ePrinter) ePrinter.textContent = (printer.name || 'Bambu Lab P1S') + ' (' + (printer.status || 'IDLE') + ')';
      if (eLayer) eLayer.textContent = pct + '% (' + (printer.currentLayer || 0) + '/' + (printer.totalLayers || 0) + ')';
      if (eTemps) eTemps.textContent = Math.round(printer.nozzleTemp || 24) + '\xB0C / ' + Math.round(printer.bedTemp || 24) + '\xB0C';
    }

    function initMini3dCanvas() {
      const canvas = document.getElementById('mini-3d-canvas');
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        mini3dState.dragging = true;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!mini3dState.dragging) return;
        e.stopPropagation();
        const dx = e.clientX - mini3dState.lastX;
        const dy = e.clientY - mini3dState.lastY;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        mini3dState.yaw += dx * 0.018;
        mini3dState.pitch = Math.max(-1.2, Math.min(1.2, mini3dState.pitch + dy * 0.018));
      });
      canvas.addEventListener('pointerup', (e) => {
        mini3dState.dragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      });

      function renderLoop() {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          if (!mini3dState.dragging) {
            mini3dState.yaw += 0.012;
          }

          const cy = Math.cos(mini3dState.yaw), sy = Math.sin(mini3dState.yaw);
          const cp = Math.cos(mini3dState.pitch), sp = Math.sin(mini3dState.pitch);

          function projectPt(pt, scale, zOff) {
            const x = pt[0], y = pt[1], z = pt[2] - zOff;
            const rx = x * cy - y * sy;
            const ry = x * sy + y * cy;
            const rz = z * cp - ry * sp;
            const ry2 = z * sp + ry * cp;
            const fov = 220 / (220 + ry2 * 0.6);
            return {
              x: w / 2 + rx * scale * fov,
              y: h / 2 - rz * scale * fov,
              depth: ry2
            };
          }

          if (!mini3dState.hasActiveProject || mini3dState.triangles.length === 0) {
            // PLACEHOLDER STATE: Dashed rotating wireframe cube + "Kein Projekt" badge
            const r = 20;
            const verts = [
              [-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0],
              [-r, -r, r*1.6], [r, -r, r*1.6], [r, r, r*1.6], [-r, r, r*1.6]
            ].map(v => projectPt(v, 1.15, r * 0.8));
            const edges = [
              [0,1],[1,2],[2,3],[3,0],
              [4,5],[5,6],[6,7],[7,4],
              [0,4],[1,5],[2,6],[3,7]
            ];
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.lineWidth = 1.6;
            for (const [a, b] of edges) {
              ctx.beginPath();
              ctx.moveTo(verts[a].x, verts[a].y);
              ctx.lineTo(verts[b].x, verts[b].y);
              ctx.stroke();
            }
            ctx.restore();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
            ctx.font = '600 15px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('KEIN 3D OBJEKT', w / 2, h - 10);
          } else {
            // ACTIVE 3D OBJECT: Build plate grid + lit 3D mesh
            const scale = 68 / Math.max(30, mini3dState.maxExtent);
            const zOff = mini3dState.centerZ;

            // Mini build plate outline
            const plateR = mini3dState.maxExtent * 0.65;
            const pCorners = [
              [-plateR, -plateR, 0], [plateR, -plateR, 0],
              [plateR, plateR, 0], [-plateR, plateR, 0]
            ].map(v => projectPt(v, scale, zOff));
            ctx.beginPath();
            ctx.moveTo(pCorners[0].x, pCorners[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pCorners[i].x, pCorners[i].y);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(0, 174, 66, 0.35)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Project & sort triangles
            const projected = [];
            for (const t of mini3dState.triangles) {
              const p0 = projectPt(t.v[0], scale, zOff);
              const p1 = projectPt(t.v[1], scale, zOff);
              const p2 = projectPt(t.v[2], scale, zOff);
              // Compute 3D normal for shading
              const ux = t.v[1][0] - t.v[0][0], uy = t.v[1][1] - t.v[0][1], uz = t.v[1][2] - t.v[0][2];
              const vx = t.v[2][0] - t.v[0][0], vy = t.v[2][1] - t.v[0][1], vz = t.v[2][2] - t.v[0][2];
              const nx = uy * vz - uz * vy;
              const ny = uz * vx - ux * vz;
              const nz = ux * vy - uy * vx;
              const nl = Math.hypot(nx, ny, nz) || 1;
              const light = Math.max(0.32, Math.min(1.12, 0.55 + ((nx / nl) * 0.35 + (nz / nl) * 0.45)));
              projected.push({
                p0, p1, p2,
                depth: (p0.depth + p1.depth + p2.depth) / 3,
                color: t.c,
                light
              });
            }
            projected.sort((a, b) => b.depth - a.depth);

            for (const tri of projected) {
              ctx.beginPath();
              ctx.moveTo(tri.p0.x, tri.p0.y);
              ctx.lineTo(tri.p1.x, tri.p1.y);
              ctx.lineTo(tri.p2.x, tri.p2.y);
              ctx.closePath();
              const hex = (tri.color || '#00AE42').replace('#', '');
              const r = Math.min(255, Math.round(parseInt(hex.substring(0, 2) || '00', 16) * tri.light));
              const g = Math.min(255, Math.round(parseInt(hex.substring(2, 4) || 'ae', 16) * tri.light));
              const b = Math.min(255, Math.round(parseInt(hex.substring(4, 6) || '42', 16) * tri.light));
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fill();
              ctx.strokeStyle = 'rgba(4, 7, 17, 0.22)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(renderLoop);
      }
      requestAnimationFrame(renderLoop);
    }

    async function submitMini3dPrompt(e) {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById('mini-3d-prompt');
      const btn = document.getElementById('mini-3d-prompt-btn');
      if (!input || !input.value.trim()) return;
      const prompt = input.value.trim();
      if (btn) btn.textContent = '...';
      try {
        const endpoint = mini3dState.hasActiveProject && mini3dState.activeProjectId
          ? base + '/api/apps/3d-print/projects/modify'
          : base + '/api/apps/3d-print/projects/generate';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, projectId: mini3dState.activeProjectId })
        });
        if (res.ok) {
          input.value = '';
          await refreshMini3dData();
        }
      } catch (err) {
        console.error('3D prompt failed:', err);
      } finally {
        if (btn) btn.textContent = 'KI';
      }
    }

    async function toggleMini3dPlaceholder() {
      try {
        const nextId = mini3dState.hasActiveProject ? null : 'preset-organic-apple';
        await fetch(base + '/api/apps/3d-print/projects/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: nextId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed toggling 3D placeholder:', err);
      }
    }

    async function triggerMini3dPrint() {
      try {
        await fetch(base + '/api/apps/3d-print/printer/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: mini3dState.activeProjectId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed starting 3D print:', err);
      }
    }

    window.openFullService = openFullService;
    window.closeFullService = closeFullService;
    window.addNote = addNote;
    window.deleteNote = deleteNote;
    window.sendHorizonNote = sendHorizonNote;
    window.submitMini3dPrompt = submitMini3dPrompt;
    window.toggleMini3dPlaceholder = toggleMini3dPlaceholder;
    window.triggerMini3dPrint = triggerMini3dPrint;
    window.toggleRoomPin = toggleRoomPin;
    window.unpinAllRooms = unpinAllRooms;
    window.submitCortexPrompt = submitCortexPrompt;
    window.selectCortexPreviewBlueprint = selectCortexPreviewBlueprint;
    window.selectCortexPastRun = selectCortexPastRun;
    window.selectCortexMemoHit = selectCortexMemoHit;
    window.closeCortexResponse = closeCortexResponse;
    window.copyCortexResponse = copyCortexResponse;

    // ============================================================================
    // HORIZON CENTERED CORTEX PROMPT BAR, LIVE PREVIEWS & GEMINI SENDER
    // ============================================================================
    let cortexSearchTimer = null;
    let cortexIsSubmitting = false;
    let cachedCortexBlueprints = [];
    let cachedCortexRuns = [];

    async function initCortexPromptBar() {
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!input || !dropdown) return;

      try {
        const bsRes = await fetch(base + '/api/apps/cortex/bootstrap');
        if (bsRes.ok) {
          const bsData = await bsRes.json();
          cachedCortexBlueprints = bsData.blueprints || [];
          cachedCortexRuns = bsData.runs || [];
        }
      } catch (_e) {}

      input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (cortexSearchTimer) clearTimeout(cortexSearchTimer);
        if (!val) {
          dropdown.style.display = 'none';
          dropdown.innerHTML = '';
          return;
        }
        cortexSearchTimer = setTimeout(() => {
          performCortexSearchPreview(val);
        }, 160);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitCortexPrompt();
        } else if (e.key === 'Escape') {
          dropdown.style.display = 'none';
          closeCortexResponse();
        }
      });

      document.addEventListener('click', (e) => {
        const stage = document.getElementById('horizon-cortex-center-stage');
        if (stage && !stage.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
    }

    async function performCortexSearchPreview(q) {
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!dropdown) return;

      const qLow = q.toLowerCase();
      const matchedBps = cachedCortexBlueprints.filter(b =>
        (b.name || '').toLowerCase().includes(qLow) ||
        (b.description || '').toLowerCase().includes(qLow) ||
        (b.code || '').toLowerCase().includes(qLow) ||
        (b.promptTemplate || '').toLowerCase().includes(qLow)
      );

      const matchedRuns = cachedCortexRuns.filter(r =>
        (r.prompt || '').toLowerCase().includes(qLow) ||
        (r.topic || '').toLowerCase().includes(qLow) ||
        (r.response_text || '').toLowerCase().includes(qLow)
      ).slice(0, 3);

      let memoHits = [];
      try {
        const mRes = await fetch(base + '/api/apps/memo/search?q=' + encodeURIComponent(q) + '&limit=5');
        if (mRes.ok) {
          const mData = await mRes.json();
          memoHits = mData.results || [];
        }
      } catch (_e) {}

      if (matchedBps.length === 0 && matchedRuns.length === 0 && memoHits.length === 0) {
        dropdown.innerHTML = \`
          <div style="padding:10px 14px; font-size:12px; color:rgba(248,250,252,0.5); display:flex; justify-content:space-between; align-items:center;">
            <span>Dr\xFCcke <b>Enter</b> um \u201E\${escapeHtml(q)}\u201C an Gemini API zu senden</span>
            <span style="font-family:monospace; font-size:10.5px; color:#38bdf8;">[\u21B5 Senden]</span>
          </div>
        \`;
        dropdown.style.display = 'flex';
        return;
      }

      let html = '';
      if (matchedBps.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:4px 10px 2px;">Cortex Vorlagen</div>';
        for (const bp of matchedBps) {
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexPreviewBlueprint('\${bp.id}', '\${encodeURIComponent(bp.name)}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag">\${bp.code}</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(bp.name)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(bp.description)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#38bdf8; font-weight:500;">\xDCbernehmen \u2192</span>
            </div>
          \`;
        }
      }

      if (matchedRuns.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:8px 10px 2px;">Cortex Verlauf</div>';
        for (const r of matchedRuns) {
          const snippet = (r.response_text || '').replace(/\\n+/g, ' ').slice(0, 90);
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexPastRun('\${r.id}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag" style="background:rgba(168,85,247,0.18); color:#c084fc; border-color:rgba(168,85,247,0.35);">RUN</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(r.topic || r.prompt)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(snippet)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#c084fc; font-weight:500;">Vorschau \u2192</span>
            </div>
          \`;
        }
      }

      if (memoHits.length > 0) {
        html += '<div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; padding:8px 10px 2px;">Memo & Dokumente</div>';
        for (const m of memoHits) {
          html += \`
            <div class="cortex-preview-item" onclick="selectCortexMemoHit('\${encodeURIComponent(m.title)}')">
              <div class="cortex-preview-left">
                <span class="cortex-badge-tag" style="background:rgba(16,185,129,0.18); color:#34d399; border-color:rgba(16,185,129,0.35);">\${m.sourceBadge}</span>
                <div>
                  <div style="font-size:13px; font-weight:500; color:#f8fafc;">\${escapeHtml(m.title)}</div>
                  <div style="font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px;">\${escapeHtml(m.snippet)}</div>
                </div>
              </div>
              <span style="font-size:11px; color:#a1a1aa; font-family:monospace;">\${escapeHtml(m.ref)}</span>
            </div>
          \`;
        }
      }

      dropdown.innerHTML = html;
      dropdown.style.display = 'flex';
    }

    function selectCortexPastRun(runId) {
      const r = cachedCortexRuns.find(item => String(item.id) === String(runId));
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (r) {
        let actions = [];
        try { actions = JSON.parse(r.proposed_actions_json || '[]'); } catch (_e) {}
        renderCortexResponse({
          modelUsed: r.model_used || 'Cortex Archiv',
          durationMs: r.duration_ms || 0,
          responseText: r.response_text || '',
          proposedActions: actions
        }, r.prompt);
      }
    }

    function selectCortexPreviewBlueprint(bpId, bpNameEsc) {
      const bpName = decodeURIComponent(bpNameEsc);
      const bp = cachedCortexBlueprints.find(b => b.id === bpId);
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (input && bp) {
        input.value = bp.promptTemplate.replace(/\\{\\{topic\\}\\}/gi, bpName);
        input.focus();
      }
    }

    function selectCortexMemoHit(titleEsc) {
      const title = decodeURIComponent(titleEsc);
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      if (input) {
        input.value = 'Fasse alle Details zu "' + title + '" aus Memo zusammen und leite die n\xE4chsten Schritte ab.';
        input.focus();
      }
    }

    async function submitCortexPrompt() {
      if (cortexIsSubmitting) return;
      const input = document.getElementById('cortex-prompt-input');
      const pill = document.getElementById('cortex-prompt-pill');
      const sendBtn = document.getElementById('cortex-send-btn');
      const statusBadge = document.getElementById('cortex-status-badge');
      const statusText = document.getElementById('cortex-status-text');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      const responseCard = document.getElementById('cortex-response-card');

      const promptText = (input ? input.value : '').trim();
      if (!promptText) {
        if (input) input.focus();
        return;
      }

      if (dropdown) dropdown.style.display = 'none';
      cortexIsSubmitting = true;
      if (pill) pill.classList.add('is-waiting');
      if (sendBtn) sendBtn.disabled = true;
      if (statusBadge) {
        statusBadge.style.display = 'inline-flex';
        if (statusText) statusText.textContent = 'Gemini denkt nach...';
      }

      try {
        const res = await fetch(base + '/api/apps/cortex/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            topic: promptText.slice(0, 60),
            contextScopes: ['memo', 'ha', 'calendar', 'pc', 'finance'],
            responsePattern: 'SYNTHESIS_BRIEF',
            model: 'gemini-3.8-flash'
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Fehler beim Gemini API Aufruf');
        }

        renderCortexResponse(data, promptText);
        if (data.runId) {
          cachedCortexRuns.unshift({
            id: data.runId,
            prompt: promptText,
            topic: promptText.slice(0, 60),
            model_used: data.modelUsed,
            duration_ms: data.durationMs,
            response_text: data.responseText,
            proposed_actions_json: JSON.stringify(data.proposedActions || [])
          });
        }
      } catch (err) {
        if (responseCard) {
          responseCard.style.display = 'flex';
          responseCard.innerHTML = \`
            <div class="cortex-resp-header">
              <span style="font-size:12px; font-weight:600; color:#ef4444;">Fehler bei Gemini Anfrage</span>
              <button onclick="closeCortexResponse()" style="background:none; border:none; color:#cbd5e1; cursor:pointer;">\u2715</button>
            </div>
            <div style="font-size:13px; color:#fca5a5;">\${escapeHtml(err.message || String(err))}</div>
          \`;
        }
      } finally {
        cortexIsSubmitting = false;
        if (pill) pill.classList.remove('is-waiting');
        if (sendBtn) sendBtn.disabled = false;
        if (statusBadge) statusBadge.style.display = 'none';
      }
    }

    function renderCortexResponse(data, originalPrompt) {
      const responseCard = document.getElementById('cortex-response-card');
      if (!responseCard) return;

      const modelLabel = data.modelUsed || 'Gemini 3.8 Flash';
      const duration = data.durationMs ? (data.durationMs + 'ms') : '';
      const text = data.responseText || '(Keine Antwort)';

      let actionsHtml = '';
      if (Array.isArray(data.proposedActions) && data.proposedActions.length > 0) {
        actionsHtml = \`
          <div style="margin:8px 0; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#38bdf8; margin-bottom:6px;">Quasi-Agentische Axon-Schritte (\${data.proposedActions.length})</div>
            \${data.proposedActions.map(a => \`
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-top:4px;">
                <span style="color:#f8fafc; font-family:monospace;">\${escapeHtml(a.axonId)}</span>
                <span style="color:#94a3b8;">\${escapeHtml(a.reason || '')}</span>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      responseCard.innerHTML = \`
        <div class="cortex-resp-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
            <span style="font-size:12px; font-weight:600; color:#f8fafc;">\${escapeHtml(modelLabel)}</span>
            <span style="font-size:11px; font-family:monospace; color:#94a3b8;">\${duration}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="copyCortexResponse()" style="padding:4px 10px; border-radius:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#cbd5e1; font-size:11px; cursor:pointer;">Kopieren</button>
            <button onclick="openFullService('cortex', 'Cortex')" style="padding:4px 10px; border-radius:7px; background:#38bdf8; border:none; color:#040711; font-size:11px; font-weight:600; cursor:pointer;">In Cortex \xF6ffnen \u2197</button>
            <button onclick="closeCortexResponse()" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:0 4px;">\u2715</button>
          </div>
        </div>
        \${actionsHtml}
        <div class="cortex-resp-body" id="cortex-resp-body-text">\${escapeHtml(text)}</div>
      \`;
      responseCard.style.display = 'flex';
    }

    function closeCortexResponse() {
      const responseCard = document.getElementById('cortex-response-card');
      if (responseCard) {
        responseCard.style.display = 'none';
        responseCard.innerHTML = '';
      }
    }

    function copyCortexResponse() {
      const body = document.getElementById('cortex-resp-body-text');
      if (body) {
        navigator.clipboard.writeText(body.innerText || body.textContent);
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
      syncDevicesDockHeight();
    });

    renderSolarArcPaths();
    renderTimelineGeometry();
    syncDevicesDockHeight();
    initMini3dCanvas();
    initCortexPromptBar();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    void loadWeatherData();
    void refreshHealthWidget();
    setInterval(() => void refreshHealthWidget(), 2000);
    setInterval(loadAllLiveData, 60000);
    setInterval(() => void loadWeatherData(), 600000);
    setInterval(() => refreshMini3dData(), 5000);
    setInterval(loadRoomsQuickAccess, 12000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refreshHealthWidget();
    });
    window.addEventListener('focus', () => void refreshHealthWidget());

    const SIDEBAR_APP_TITLES = {
      'smart-canvas': 'Smart Home',
      'camera-vision': 'Kameras & Vision',
      '3d-print': '3D Druck Studio',
      'finance-analytics': 'Finanzen',
      'google-calendar': 'Kalender & Zeit',
      'google-health': 'Gesundheit',
      'meal-planner': 'Ern\xE4hrung & Einkauf',
      'memo': 'Memo',
      'contacts': 'Kontakte',
      'cortex': 'Cortex',
      'workflows': 'Workflows',
      'project-workflow': 'Dev-Projekte',
      'system-monitor': 'System & Infra',
      'floorplan': 'Grundriss 2D',
      'google-usage': 'Google Usage & AI',
      'network-monitor': 'Netzwerk & Router',
      'george-sync': 'Erste Bank Sync'
    };

    function checkHashFor3dPrint() {
      try {
        if (window.top) {
          window.top.__thassiHorizonWin = window;
          const pendingRaw = window.top.sessionStorage.getItem('thassi_open_app');
          if (pendingRaw) {
            window.top.sessionStorage.removeItem('thassi_open_app');
            const parsed = JSON.parse(pendingRaw);
            if (parsed && parsed.id && (!parsed.ts || Date.now() - parsed.ts < 30000)) {
              window.top.__thassiActiveSidebarApp = parsed.id;
              openFullService(
                parsed.id,
                parsed.title || SIDEBAR_APP_TITLES[parsed.id] || parsed.id,
                parsed.hash,
                Boolean(parsed.fromSidebar !== false)
              );
              if (typeof window.top.__thassiSyncSidebarNow === 'function') {
                window.top.__thassiSyncSidebarNow();
              }
              return;
            }
          }
        }
        const hStr = String((window.top ? window.top.location.hash : window.location.hash) || window.location.hash || '');
        const rawHash = hStr.startsWith('#') ? hStr.slice(1) : hStr;
        if (rawHash) {
          let resolvedTitle = SIDEBAR_APP_TITLES[rawHash] || null;
          if (!resolvedTitle) {
            const dynList = (window.top && window.top.__thassiDeployedApps) || window.__THASSI_DEPLOYED_APPS__ || [];
            const match = Array.isArray(dynList) ? dynList.find((a) => a && a.id === rawHash) : null;
            if (match) resolvedTitle = match.name || match.title || rawHash;
          }
          if (resolvedTitle) {
            if (window.top) window.top.__thassiActiveSidebarApp = rawHash;
            openFullService(rawHash, resolvedTitle, '', true);
          }
        } else {
          const ovEl = document.getElementById('full-app-overlay');
          if (ovEl && ovEl.style.display === 'flex' && (!window.top || !window.top.__thassiActiveSidebarApp)) {
            closeFullService();
          }
        }
      } catch (_e) {}
    }
    renderHorizonOverviewCharts();
    checkHashFor3dPrint();
    window.addEventListener('hashchange', checkHashFor3dPrint);
    try {
      if (window.top && window.top !== window) {
        window.top.addEventListener('hashchange', checkHashFor3dPrint);
      }
    } catch (_e) {}
  </script>
</body>
</html>`;
}

// thassi_host/src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path4.dirname(__filename);
process.on("unhandledRejection", (reason) => {
  console.warn("[Thassi] Ignored background unhandledRejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Thassi] Caught uncaughtException (keeping server alive):", err instanceof Error ? err.message : err);
});
function loadDotEnv() {
  const envPath = path4.resolve(process.cwd(), ".env");
  if (!fs4.existsSync(envPath)) return;
  const content = fs4.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadDotEnv();
var PORT = Number(process.env.PORT || 8099);
function resolveHealthyDataDir() {
  let hasDataMount = false;
  try {
    hasDataMount = fs4.existsSync("/data");
  } catch {
  }
  const preferred = path4.resolve(
    process.env.THASSI_DATA_DIR || (hasDataMount ? "/data" : "./data")
  );
  try {
    fs4.mkdirSync(preferred, { recursive: true });
    const probeFile = path4.join(preferred, `.thassi_probe_${process.pid}`);
    fs4.writeFileSync(probeFile, "ok");
    fs4.rmSync(probeFile, { force: true });
    return preferred;
  } catch (err) {
    const fallback = path4.join(os2.tmpdir(), "thassi_data");
    console.warn(
      `[Thassi] Primary data dir "${preferred}" is not writable (${err instanceof Error ? err.message : err}); using tmpfs fallback "${fallback}"`
    );
    fs4.mkdirSync(fallback, { recursive: true });
    process.env.THASSI_DATA_DIR = fallback;
    return fallback;
  }
}
var DATA_DIR = resolveHealthyDataDir();
var STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || "";
try {
  fs4.mkdirSync(path4.join(DATA_DIR, "apps"), { recursive: true });
  fs4.mkdirSync(path4.join(DATA_DIR, "deployed_apps"), { recursive: true });
} catch {
}
try {
  const legacyStarterDir = path4.join(DATA_DIR, "deployed_apps", "data-workbench");
  if (fs4.existsSync(legacyStarterDir)) {
    fs4.rmSync(legacyStarterDir, { recursive: true, force: true });
  }
} catch {
}
var sharedDb = new ThassiAppDatabase(path4.join(DATA_DIR, "shared.db"));
sharedDb.exec(`
  CREATE TABLE IF NOT EXISTS system_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);
var scheduler = new ThassiCronScheduler();
var googleOAuth = new ThassiGoogleOAuthManager(sharedDb);
var systemHaBridge = new ThassiHaBridge("hub", sharedDb);
var actionRegistry = new ThassiActionRegistry(sharedDb, systemHaBridge, googleOAuth);
var ST_VEIT_GOELSEN = {
  name: "St. Veit / G\xF6lsen",
  region: "Bezirk Lilienfeld \xB7 N\xD6 (3161)",
  lat: 48.0444,
  lon: 15.6689
};
var cachedWeather = null;
function mapGoogleConditionType(rawType = "") {
  const t = rawType.toUpperCase();
  if (t.includes("THUNDER") || t.includes("STORM")) {
    return { code: "thunderstorm", label: "Gewitter" };
  }
  if (t.includes("SNOW") || t.includes("FLURR") || t.includes("SLEET") || t.includes("ICE")) {
    return { code: "snow", label: "Schneefall" };
  }
  if (t.includes("DRIZZLE") || t.includes("LIGHT_RAIN")) {
    return { code: "drizzle", label: "Leichter Regen" };
  }
  if (t.includes("RAIN") || t.includes("SHOWER")) {
    return { code: "rain", label: "Regen" };
  }
  if (t.includes("FOG") || t.includes("MIST") || t.includes("HAZE")) {
    return { code: "fog", label: "Nebel / Dunst" };
  }
  if (t.includes("OVERCAST") || t.includes("CLOUDY") && !t.includes("PARTLY") && !t.includes("MOSTLY_CLEAR")) {
    return { code: "cloudy", label: "Bew\xF6lkt" };
  }
  if (t.includes("PARTLY") || t.includes("SCATTERED") || t.includes("MOSTLY")) {
    return { code: "partly_cloudy", label: "Leicht bew\xF6lkt" };
  }
  return { code: "clear", label: "Klar" };
}
function mapWmoCode(wmo, isDay = true) {
  if (wmo === 0) return { code: "clear", label: isDay ? "Sonnig & Klar" : "Sternenklar" };
  if (wmo === 1 || wmo === 2) return { code: "partly_cloudy", label: "Leicht bew\xF6lkt" };
  if (wmo === 3) return { code: "cloudy", label: "Bedeckt" };
  if (wmo === 45 || wmo === 48) return { code: "fog", label: "Talnebel" };
  if (wmo >= 51 && wmo <= 57) return { code: "drizzle", label: "Nieselregen" };
  if (wmo >= 61 && wmo <= 67 || wmo >= 80 && wmo <= 82) return { code: "rain", label: "Regen" };
  if (wmo >= 71 && wmo <= 77 || wmo === 85 || wmo === 86) return { code: "snow", label: "Schneefall" };
  if (wmo >= 95) return { code: "thunderstorm", label: "Gewitter" };
  return { code: "partly_cloudy", label: "Wechselhaft" };
}
function parseIsoToHourFloat(iso, fallback = 6.75) {
  if (!iso) {
    const h2 = Math.floor(fallback);
    const m2 = Math.round((fallback - h2) * 60);
    return {
      hourFloat: fallback,
      label: `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`
    };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return parseIsoToHourFloat(void 0, fallback);
  const h = d.getHours();
  const m = d.getMinutes();
  return {
    hourFloat: Number((h + m / 60).toFixed(2)),
    label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  };
}
async function tryFetchGoogleWeatherApi() {
  const apiKey = process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_API_KEY || sharedDb.kvGet("google_weather_api_key") || "";
  let authHeaders = {};
  let keyQuery = "";
  if (apiKey) {
    keyQuery = `&key=${encodeURIComponent(apiKey)}`;
  } else if (googleOAuth.getStatus().authorized) {
    try {
      const token = await googleOAuth.getValidAccessToken();
      authHeaders = { Authorization: `Bearer ${token}` };
    } catch {
      return null;
    }
  } else {
    return null;
  }
  const baseParams = `location.latitude=${ST_VEIT_GOELSEN.lat}&location.longitude=${ST_VEIT_GOELSEN.lon}&languageCode=de${keyQuery}`;
  const [curRes, hrRes, dayRes] = await Promise.all([
    fetch(`https://weather.googleapis.com/v1/currentConditions:lookup?${baseParams}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(4500)
    }),
    fetch(`https://weather.googleapis.com/v1/forecast/hours:lookup?${baseParams}&hours=24`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(4500)
    }),
    fetch(`https://weather.googleapis.com/v1/forecast/days:lookup?${baseParams}&days=1`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(4500)
    })
  ]);
  if (!curRes.ok || !hrRes.ok) return null;
  const curJson = await curRes.json();
  const hrJson = await hrRes.json();
  const dayJson = dayRes.ok ? await dayRes.json() : {};
  const condType = String(curJson.weatherCondition?.type || "PARTLY_CLOUDY");
  const mappedCur = mapGoogleConditionType(condType);
  const curLabel = curJson.weatherCondition?.description?.text || mappedCur.label;
  const tempC = Number(curJson.temperature?.degrees ?? 14);
  const feelsLikeC = Number(curJson.feelsLikeTemperature?.degrees ?? tempC);
  const humidityPct = Number(curJson.relativeHumidity ?? 62);
  const windKmh = Number(curJson.wind?.speed?.value ?? 8);
  const precipProbPct = Number(curJson.precipitation?.probability?.percent ?? 10);
  const isDay = curJson.isDaytime !== false;
  const rawHours = Array.isArray(hrJson.forecastHours) ? hrJson.forecastHours : [];
  const hourly24 = rawHours.slice(0, 24).map((fh, idx) => {
    const dtIso = fh.interval?.startTime || new Date(Date.now() + idx * 36e5).toISOString();
    const d = new Date(dtIso);
    const hr = d.getHours();
    const mapped = mapGoogleConditionType(String(fh.weatherCondition?.type || condType));
    return {
      timeIso: dtIso,
      hourLabel: `${String(hr).padStart(2, "0")}:00`,
      hour: hr,
      tempC: Math.round(Number(fh.temperature?.degrees ?? tempC) * 10) / 10,
      precipProbPct: Number(fh.precipitation?.probability?.percent ?? 0),
      precipMm: Number(fh.precipitation?.qpf?.quantity ?? 0),
      conditionCode: mapped.code,
      conditionLabel: fh.weatherCondition?.description?.text || mapped.label,
      isDay: fh.isDaytime !== false
    };
  });
  const targetSlotHours = [6, 9, 12, 15, 18, 21];
  let daySlots = hourly24.filter((s) => targetSlotHours.includes(s.hour)).slice(0, 6);
  if (daySlots.length < 4) {
    daySlots = hourly24.filter((_, i) => i % 3 === 0).slice(0, 6);
  }
  const firstDay = Array.isArray(dayJson.forecastDays) ? dayJson.forecastDays[0] : null;
  const temps = hourly24.length > 0 ? hourly24.map((h) => h.tempC) : [tempC];
  const tempMaxC = Math.round(Number(firstDay?.maxTemperature?.degrees ?? Math.max(...temps)) * 10) / 10;
  const tempMinC = Math.round(Number(firstDay?.minTemperature?.degrees ?? Math.min(...temps)) * 10) / 10;
  const sr = parseIsoToHourFloat(firstDay?.sunEvents?.sunriseTime, 6.5);
  const ss = parseIsoToHourFloat(firstDay?.sunEvents?.sunsetTime, 18.5);
  const payload = {
    location: ST_VEIT_GOELSEN.name,
    region: ST_VEIT_GOELSEN.region,
    coordinates: { lat: ST_VEIT_GOELSEN.lat, lon: ST_VEIT_GOELSEN.lon },
    provider: "Google Weather API \xB7 St. Veit / G\xF6lsen",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    current: {
      tempC: Math.round(tempC * 10) / 10,
      feelsLikeC: Math.round(feelsLikeC * 10) / 10,
      conditionCode: mappedCur.code,
      conditionLabel: curLabel,
      humidityPct: Math.round(humidityPct),
      windKmh: Math.round(windKmh),
      precipProbPct: Math.round(precipProbPct),
      isDay
    },
    today: {
      tempMaxC,
      tempMinC,
      sunriseHour: sr.hourFloat,
      sunsetHour: ss.hourFloat,
      sunriseLabel: sr.label,
      sunsetLabel: ss.label,
      summary: `${curLabel} in St. Veit an der G\xF6lsen \xB7 Tagesh\xF6chstwert ${Math.round(tempMaxC)}\xB0C, Tiefstwert ${Math.round(tempMinC)}\xB0C`
    },
    daySlots,
    hourly24
  };
  return payload;
}
async function fetchStVeitGoelsenWeather(forceRefresh = false) {
  if (!forceRefresh && cachedWeather && Date.now() - cachedWeather.fetchedAtMs < 12 * 60 * 1e3) {
    return cachedWeather.payload;
  }
  try {
    const googleData = await tryFetchGoogleWeatherApi();
    if (googleData) {
      cachedWeather = { fetchedAtMs: Date.now(), payload: googleData };
      sharedDb.kvSet("weather_st_veit_goelsen", googleData);
      return googleData;
    }
  } catch (err) {
    console.warn("[Thassi Weather] Google Weather API lookup fallback:", err);
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ST_VEIT_GOELSEN.lat}&longitude=${ST_VEIT_GOELSEN.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=Europe%2FVienna&forecast_days=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
    if (res.ok) {
      const data = await res.json();
      const cur = data.current || {};
      const isDay = Boolean(cur.is_day ?? 1);
      const curMapped = mapWmoCode(Number(cur.weather_code ?? 1), isDay);
      const hTimes = data.hourly?.time || [];
      const hTemps = data.hourly?.temperature_2m || [];
      const hProbs = data.hourly?.precipitation_probability || [];
      const hPrecip = data.hourly?.precipitation || [];
      const hCodes = data.hourly?.weather_code || [];
      const hIsDay = data.hourly?.is_day || [];
      const todayPrefix = hTimes[0]?.slice(0, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const allSlots = hTimes.map((tIso, idx) => {
        const hr = Number(tIso.slice(11, 13)) || new Date(tIso).getHours();
        const slotIsDay = Boolean(hIsDay[idx] ?? (hr >= 6 && hr <= 19));
        const mapped = mapWmoCode(Number(hCodes[idx] ?? 1), slotIsDay);
        return {
          timeIso: tIso,
          hourLabel: `${String(hr).padStart(2, "0")}:00`,
          hour: hr,
          tempC: Math.round(Number(hTemps[idx] ?? 14) * 10) / 10,
          precipProbPct: Math.round(Number(hProbs[idx] ?? 0)),
          precipMm: Math.round(Number(hPrecip[idx] ?? 0) * 10) / 10,
          conditionCode: mapped.code,
          conditionLabel: mapped.label,
          isDay: slotIsDay
        };
      });
      const todaySlots = allSlots.filter((s) => s.timeIso.startsWith(todayPrefix));
      const targetHours = [6, 9, 12, 15, 18, 21];
      const daySlots = todaySlots.filter((s) => targetHours.includes(s.hour));
      const nowHour = (/* @__PURE__ */ new Date()).getHours();
      const startIdx = Math.max(
        0,
        allSlots.findIndex((s) => s.timeIso.startsWith(todayPrefix) && s.hour >= nowHour)
      );
      const hourly24 = allSlots.slice(startIdx, startIdx + 24);
      const tempMaxC = Math.round(Number(data.daily?.temperature_2m_max?.[0] ?? 17) * 10) / 10;
      const tempMinC = Math.round(Number(data.daily?.temperature_2m_min?.[0] ?? 7) * 10) / 10;
      const sr = parseIsoToHourFloat(data.daily?.sunrise?.[0], 6.5);
      const ss = parseIsoToHourFloat(data.daily?.sunset?.[0], 18.5);
      const maxPrecipProb = Math.round(
        Number(data.daily?.precipitation_probability_max?.[0] ?? daySlots[0]?.precipProbPct ?? 10)
      );
      const payload = {
        location: ST_VEIT_GOELSEN.name,
        region: ST_VEIT_GOELSEN.region,
        coordinates: { lat: ST_VEIT_GOELSEN.lat, lon: ST_VEIT_GOELSEN.lon },
        provider: "Open-Meteo API \xB7 St. Veit / G\xF6lsen",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        current: {
          tempC: Math.round(Number(cur.temperature_2m ?? 14) * 10) / 10,
          feelsLikeC: Math.round(Number(cur.apparent_temperature ?? cur.temperature_2m ?? 13.5) * 10) / 10,
          conditionCode: curMapped.code,
          conditionLabel: curMapped.label,
          humidityPct: Math.round(Number(cur.relative_humidity_2m ?? 65)),
          windKmh: Math.round(Number(cur.wind_speed_10m ?? 9)),
          precipProbPct: maxPrecipProb,
          isDay
        },
        today: {
          tempMaxC,
          tempMinC,
          sunriseHour: sr.hourFloat,
          sunsetHour: ss.hourFloat,
          sunriseLabel: sr.label,
          sunsetLabel: ss.label,
          summary: `${curMapped.label} \xB7 H: ${Math.round(tempMaxC)}\xB0 T: ${Math.round(tempMinC)}\xB0 in St. Veit / G\xF6lsen`
        },
        daySlots: daySlots.length > 0 ? daySlots : todaySlots.filter((_, i) => i % 3 === 0).slice(0, 6),
        hourly24
      };
      cachedWeather = { fetchedAtMs: Date.now(), payload };
      sharedDb.kvSet("weather_st_veit_goelsen", payload);
      return payload;
    }
  } catch (err) {
    console.warn("[Thassi Weather] Live weather fetch failed, checking cache:", err);
  }
  const persisted = sharedDb.kvGet("weather_st_veit_goelsen");
  if (persisted) return persisted;
  throw new Error("Wetterdienst (Google Weather & Open-Meteo) nicht erreichbar und kein Cache vorhanden.");
}
var loadedApps = /* @__PURE__ */ new Map();
async function loadAppFromDirectory(appDir, source) {
  const manifestPath = path4.join(appDir, "thassi.app.json");
  if (!fs4.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs4.readFileSync(manifestPath, "utf-8"));
  const appId = manifest.id;
  if (appId === "data-workbench") return;
  scheduler.clearAppJobs(appId);
  const existing = loadedApps.get(appId);
  const appDb = existing?.db || new ThassiAppDatabase(path4.join(DATA_DIR, "apps", `${appId}.db`));
  const appHa = new ThassiHaBridge(appId, sharedDb);
  const routes = /* @__PURE__ */ new Map();
  const ctx = {
    appId,
    db: appDb,
    sharedDb,
    ha: appHa,
    google: googleOAuth,
    actions: actionRegistry,
    scheduleJob: (job) => scheduler.registerJob(appId, job),
    route: (method, routePath, handler) => {
      const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
      routes.set(`${method.toUpperCase()} ${normalized}`, handler);
    }
  };
  const compiledBackend = path4.join(appDir, "backend.mjs");
  const devBackend = path4.join(appDir, "backend", "index.ts");
  const backendFile = fs4.existsSync(compiledBackend) ? compiledBackend : fs4.existsSync(devBackend) ? devBackend : null;
  if (backendFile) {
    const fileUrl = `${pathToFileURL(backendFile).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    if (mod.default && typeof mod.default.setup === "function") {
      await mod.default.setup(ctx);
    }
  }
  const distFrontend = path4.join(appDir, "frontend");
  loadedApps.set(appId, {
    manifest,
    source,
    frontendDir: distFrontend,
    db: appDb,
    ha: appHa,
    routes,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  console.log(`[Thassi] Loaded app "${manifest.name}" (${appId}) [${source}]`);
}
async function discoverAllApps() {
  const candidateBuiltInDirs = [
    path4.join(__dirname, "apps"),
    path4.resolve(process.cwd(), "thassi_host", "dist", "apps"),
    path4.resolve(process.cwd(), "apps")
  ];
  for (const baseDir of candidateBuiltInDirs) {
    if (!fs4.existsSync(baseDir)) continue;
    for (const entry of fs4.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        const appDir = path4.join(baseDir, entry.name);
        if (!loadedApps.has(entry.name)) {
          try {
            await loadAppFromDirectory(appDir, "built-in");
          } catch (err) {
            console.error(`[Thassi] Error loading built-in app ${entry.name}:`, err);
          }
        }
      }
    }
  }
  const deployedBase = path4.join(DATA_DIR, "deployed_apps");
  if (fs4.existsSync(deployedBase)) {
    for (const entry of fs4.readdirSync(deployedBase, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        try {
          const hotDir = path4.join(deployedBase, entry.name);
          const hotBackend = path4.join(hotDir, "backend.mjs");
          const builtInBackend = path4.join(__dirname, "apps", entry.name, "backend.mjs");
          if (fs4.existsSync(builtInBackend) && fs4.existsSync(hotBackend)) {
            const builtInMtime = fs4.statSync(builtInBackend).mtimeMs;
            const hotMtime = fs4.statSync(hotBackend).mtimeMs;
            if (builtInMtime > hotMtime) {
              continue;
            }
          }
          await loadAppFromDirectory(hotDir, "hot-deployed");
        } catch (err) {
          console.error(`[Thassi] Error loading hot-deployed app ${entry.name}:`, err);
        }
      }
    }
  }
}
function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Thassi-Secret",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
function serveAppStaticFile(req, res, app, subPath, mountPrefix = "") {
  const ingressPath = (req.headers["x-ingress-path"] || "").replace(/\/+$/, "");
  const cleanSub = subPath.replace(/^\/+/, "") || "index.html";
  let filePath = path4.join(app.frontendDir, cleanSub);
  if (!fs4.existsSync(filePath) || fs4.statSync(filePath).isDirectory()) {
    filePath = path4.join(app.frontendDir, "index.html");
  }
  if (!fs4.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Frontend bundle not found for app "${app.manifest.id}". Run "npm run build" first.`);
    return;
  }
  const ext = path4.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  if (ext === ".html") {
    let html = fs4.readFileSync(filePath, "utf-8");
    const assetBase = `${ingressPath}${mountPrefix}`.replace(/\/+$/, "");
    html = html.replace(/(src|href)="\.\/assets\//g, `$1="${assetBase}/assets/`).replace(/(src|href)="\/assets\//g, `$1="${assetBase}/assets/`);
    const allManifests = Array.from(loadedApps.values()).map((a) => a.manifest);
    const injection = `${getUniformAppStylesheetTag()}<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)}; window.__THASSI_DEPLOYED_APPS__ = ${JSON.stringify(allManifests)};${getHassSidebarStylerScript()}</script>`;
    html = html.includes("</head>") ? html.replace("</head>", `${injection}</head>`) : `${injection}${html}`;
    res.writeHead(200, { "Content-Type": mime });
    res.end(html);
    return;
  }
  res.writeHead(200, { "Content-Type": mime });
  fs4.createReadStream(filePath).pipe(res);
}
async function handleAppApiRequest(req, res, app, subRoute, queryObj) {
  const method = (req.method || "GET").toUpperCase();
  const rawBody = method === "GET" || method === "HEAD" ? "" : await readRequestBody(req);
  let parsedBody = {};
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }
  if (subRoute === "/_db/tables" && method === "GET") {
    return sendJson(res, 200, { tables: app.db.listTables() });
  }
  if (subRoute === "/_db/import-csv" && method === "POST") {
    const body = parsedBody;
    if (!body?.tableName || !body?.csvText) {
      return sendJson(res, 400, { error: "tableName and csvText are required" });
    }
    const result2 = app.db.importCsvToTable(body.tableName, body.csvText, {
      replaceTable: body.replaceTable ?? true
    });
    return sendJson(res, 200, result2);
  }
  const tableSummaryMatch = subRoute.match(/^\/_db\/tables\/([^/]+)\/summary$/);
  if (tableSummaryMatch && method === "GET") {
    const summary = app.db.summarizeTable(decodeURIComponent(tableSummaryMatch[1]));
    return sendJson(res, 200, summary);
  }
  const tableRowsMatch = subRoute.match(/^\/_db\/tables\/([^/]+)\/rows$/);
  if (tableRowsMatch && method === "GET") {
    const tbl = decodeURIComponent(tableRowsMatch[1]).replace(/[^a-z0-9_]/gi, "_");
    const limit = Math.min(1e3, Math.max(1, Number(queryObj.limit) || 100));
    const rows = app.db.query(`SELECT * FROM "${tbl}" LIMIT ?`, [limit]);
    return sendJson(res, 200, { rows });
  }
  if (subRoute === "/_db/query" && method === "POST") {
    const body = parsedBody;
    if (!body?.sql) return sendJson(res, 400, { error: "Missing sql field" });
    const trimmed = body.sql.trim();
    if (/^(SELECT|PRAGMA|WITH)/i.test(trimmed)) {
      const rows = app.db.query(trimmed, body.params || []);
      return sendJson(res, 200, { rows });
    } else {
      const info = app.db.execute(trimmed, body.params || []);
      return sendJson(res, 200, { rows: [info] });
    }
  }
  if (subRoute === "/_ha/status" && method === "GET") {
    return sendJson(res, 200, await app.ha.getStatus());
  }
  if (subRoute === "/_ha/states" && method === "GET") {
    const states = await app.ha.getStates(queryObj.domain);
    return sendJson(res, 200, { states });
  }
  if (subRoute === "/_ha/service" && method === "POST") {
    const body = parsedBody;
    const result2 = await app.ha.callService(body.domain, body.service, body.serviceData || {});
    return sendJson(res, 200, { result: result2 });
  }
  if (subRoute === "/_ha/sensor" && method === "POST") {
    const body = parsedBody;
    const result2 = await app.ha.publishSensor(body.sensorSlug, body.state, body.attributes || {});
    return sendJson(res, 200, result2);
  }
  if (subRoute === "/_jobs" && method === "GET") {
    return sendJson(res, 200, { jobs: scheduler.listJobs(app.manifest.id) });
  }
  const jobRunMatch = subRoute.match(/^\/_jobs\/([^/]+)\/run$/);
  if (jobRunMatch && method === "POST") {
    const job = await scheduler.triggerJob(app.manifest.id, decodeURIComponent(jobRunMatch[1]));
    return sendJson(res, 200, { job });
  }
  if (subRoute === "/_google/status" && method === "GET") {
    return sendJson(res, 200, googleOAuth.getStatus());
  }
  if (subRoute === "/_google/calendar/upcoming" && method === "GET") {
    const events = await googleOAuth.fetchUpcomingCalendarEvents(Number(queryObj.maxResults) || 15);
    return sendJson(res, 200, { events });
  }
  if (subRoute === "/_actions" && method === "GET") {
    return sendJson(res, 200, { actions: actionRegistry.listActions() });
  }
  if (subRoute === "/_actions/execute" && method === "POST") {
    const body = parsedBody;
    if (!body?.actionId) {
      return sendJson(res, 400, { error: "actionId is required" });
    }
    const result2 = await actionRegistry.execute(body.actionId, body.input || {}, {
      upstreamText: body.upstreamText
    });
    return sendJson(res, 200, result2);
  }
  const handler = app.routes.get(`${method} ${subRoute}`);
  if (!handler) {
    return sendJson(res, 404, {
      error: `Route "${method} ${subRoute}" not found in app "${app.manifest.id}"`
    });
  }
  const ctx = {
    appId: app.manifest.id,
    db: app.db,
    sharedDb,
    ha: app.ha,
    google: googleOAuth,
    actions: actionRegistry,
    scheduleJob: (j) => scheduler.registerJob(app.manifest.id, j),
    route: () => {
    }
  };
  const result = await handler(
    {
      method,
      path: subRoute,
      query: queryObj,
      body: parsedBody,
      rawBody,
      headers: req.headers
    },
    ctx
  );
  if (result && typeof result === "object" && "body" in result && ("status" in result || "headers" in result)) {
    const typed = result;
    if (Buffer.isBuffer(typed.body) || typed.body instanceof Uint8Array) {
      res.writeHead(typed.status || 200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Thassi-Secret",
        ...typed.headers || {}
      });
      res.end(typed.body);
      return;
    }
    return sendJson(res, typed.status || 200, typed.body, typed.headers || {});
  }
  return sendJson(res, 200, result);
}
async function startServer() {
  syncHassFrontendFiles();
  await discoverAllApps();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        return sendJson(res, 204, {});
      }
      const safeReqUrl = (req.url || "/").replace(/^\/+/, "/");
      const parsedUrl = new URL(safeReqUrl, "http://localhost");
      const pathname = parsedUrl.pathname.replace(/\/+/g, "/");
      const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());
      const ingressPath = (req.headers["x-ingress-path"] || "").replace(/\/+$/, "");
      if (pathname === "/healthz" && req.method === "GET") {
        return sendJson(res, 200, {
          status: "healthy",
          service: "thassi_host",
          version: "1.2.7",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const effectiveStandaloneAppId = (req.headers["x-thassi-standalone-app"] || "").trim() || STANDALONE_APP_ID;
      if (!effectiveStandaloneAppId && (pathname === "/" || pathname === "/index.html")) {
        const allManifests = Array.from(loadedApps.values()).map((a) => a.manifest);
        const dashboardHtml = renderUnifiedDashboardHtml(ingressPath).replace(
          "<head>",
          `<head><script>window.__THASSI_DEPLOYED_APPS__ = ${JSON.stringify(allManifests)};</script>`
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(dashboardHtml);
        return;
      }
      if (pathname === "/api/orchestrator/state" && req.method === "GET") {
        try {
          const hubRes = await fetch("http://192.168.188.46:5180/api/state");
          if (hubRes.ok) {
            return sendJson(res, 200, await hubRes.json());
          }
        } catch {
        }
        return sendJson(res, 200, {
          activeTasks: sharedDb.kvGet("orchestrator_tasks") || [],
          recentEvents: sharedDb.kvGet("orchestrator_events") || []
        });
      }
      if (pathname === "/api/orchestrator/events/publish" && req.method === "POST") {
        const evt = JSON.parse(await readRequestBody(req) || "{}");
        const list = (sharedDb.kvGet("orchestrator_events") || []).slice(0, 79);
        list.unshift(evt);
        sharedDb.kvSet("orchestrator_events", list);
        return sendJson(res, 200, { published: true });
      }
      if (pathname === "/api/orchestrator/tasks/submit" && req.method === "POST") {
        const raw = await readRequestBody(req);
        try {
          const hubRes = await fetch("http://192.168.188.46:5180/api/tasks/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: raw
          });
          const data = await hubRes.json();
          return sendJson(res, hubRes.status, data);
        } catch (err) {
          return sendJson(res, 502, {
            error: "Dev-PC SignalR Hub (192.168.188.46:5180) unreachable",
            details: err instanceof Error ? err.message : String(err)
          });
        }
      }
      if (pathname === "/api/orchestrator/apk-upload" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        if (!body.base64) return sendJson(res, 400, { error: "Missing base64 APK payload" });
        const apkPath = path4.join(DATA_DIR, "thassi-control.apk");
        fs4.writeFileSync(apkPath, Buffer.from(body.base64, "base64"));
        return sendJson(res, 200, { uploaded: true, size: fs4.statSync(apkPath).size });
      }
      if (pathname === "/download/thassi-control.apk" && req.method === "GET") {
        const apkPath = path4.join(DATA_DIR, "thassi-control.apk");
        if (!fs4.existsSync(apkPath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("APK not uploaded yet.");
          return;
        }
        const stat = fs4.statSync(apkPath);
        res.writeHead(200, {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="ThassiControl.apk"',
          "Content-Length": String(stat.size)
        });
        fs4.createReadStream(apkPath).pipe(res);
        return;
      }
      if (pathname === "/api/system/rooms" && req.method === "GET") {
        const allStates = await systemHaBridge.getStates();
        const sm = new Map(allStates.map((s) => [s.entity_id, s]));
        const getVal = (id) => sm.get(id)?.state ?? "unavailable";
        const getNum = (id) => {
          const v = Number(sm.get(id)?.state);
          return Number.isFinite(v) ? v : null;
        };
        const buildDev = (entityId, label, kind, powerEntityId) => {
          const st = sm.get(entityId);
          const state = st?.state ?? "unavailable";
          const powerW = powerEntityId ? getNum(powerEntityId) : null;
          const attrs = st?.attributes || {};
          return {
            entityId,
            label,
            kind,
            state,
            isOn: state === "on" || state === "recording" || state === "streaming" || state === "playing",
            powerW,
            brightness: typeof attrs.brightness === "number" ? Math.round(attrs.brightness / 255 * 100) : null,
            effect: attrs.effect || null,
            effectList: attrs.effect_list || null,
            unit: attrs.unit_of_measurement || ""
          };
        };
        const rooms = [
          {
            id: "buro_og",
            name: "B\xFCro OG",
            tempC: getNum("sensor.shellyhtg3_e4b32331dde0_temperatur"),
            humidityPct: getNum("sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit"),
            devices: [
              buildDev("light.buro_og_grosses_licht", "Gro\xDFes Licht", "toggle", "sensor.links_power"),
              buildDev("switch.buro_og_regal_lichter", "Regal Lichter", "toggle", "sensor.shellyplugsg3_e4b063e4bfd8_power"),
              buildDev("switch.buro_og_plug_90", "Schreibtisch Plug .90", "toggle", "sensor.kleines_licht_pumpe_power"),
              buildDev("switch.buro_og_bewasserung_pumpe", "Home Assistant PC (Watchdog .100)", "sensor", "sensor.schalter_neu_power"),
              buildDev("light.thomasbuero_2pm_oben_output_1", "Schalter Oben Rechts", "toggle", "sensor.thomasbuero_2pm_oben_switch_1_power")
            ]
          },
          {
            id: "wohnkuche",
            name: "Wohnk\xFCche",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.wohnkueche_bodenbeleuchtung_boden", "Bodenbeleuchtung", "toggle", "sensor.shelly_plus_2pm_a_switch_0_power"),
              buildDev("switch.wohnkueche_fensterbank_licht", "Fensterbank Licht", "toggle", "sensor.bodenbeleuchtung_power"),
              buildDev("media_player.tv_samsung_6_series_49", 'Samsung TV (49")', "sensor")
            ]
          },
          {
            id: "vorzimmer_og",
            name: "Vorzimmer OG",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.vorzimmer_og_grosses_licht", "Gro\xDFes Licht", "toggle"),
              buildDev("light.vorzimmer_og_bodenbeleuchtung_led", "Bodenbeleuchtung LED", "rgbw"),
              buildDev("light.vorzimmer_og_alert_led", "Alert LED", "rgbw"),
              buildDev("switch.shelly2pmg3_8cbfea9ac754_output_0", "Shelly 2PM Kanal 1", "toggle", "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung"),
              buildDev("switch.shelly2pmg3_8cbfea9ac754_output_1", "Shelly 2PM Kanal 2", "toggle", "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung")
            ]
          },
          {
            id: "bad_gaeste",
            name: "Bad & G\xE4ste",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("switch.shelly1pmminig4_7c2c676dc6fc", "Waschmaschine Bad OG", "toggle", "sensor.shelly1pmminig4_7c2c676dc6fc_leistung"),
              buildDev("switch.gaestezimmer_schalter_rechts", "G\xE4stezimmer Schalter 1", "toggle", "sensor.shellyplus2pm_c049ef8a3a78_switch_0_power"),
              buildDev("switch.shellyplus2pm_c049ef8a3a78_switch_1", "G\xE4stezimmer Schalter 2", "toggle", "sensor.shellyplus2pm_c049ef8a3a78_switch_1_power"),
              buildDev("sensor.smart_series_8000_75b4_batterie", "Oral-B Smart Series Akku", "sensor")
            ]
          },
          {
            id: "stiegenhaus_keller",
            name: "Stiegenhaus & Keller",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("binary_sensor.shelly_blu_motion_19ca_bewegung", "Bewegung Stiegenhaus", "sensor"),
              buildDev("sensor.shelly_blu_motion_19ca_beleuchtungsstarke", "Helligkeit Stiegenhaus", "sensor"),
              buildDev("sensor.epson_xp_7100_series", "Epson XP-7100 Drucker", "sensor"),
              buildDev("sensor.epson_xp_7100_series_black_ink", "Drucker Tinte Schwarz", "sensor")
            ]
          },
          {
            id: "kameras_vision",
            name: "Kameras & Vision",
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev("camera.garten_parkplatz_kamera", "Drau\xDFen Hinten Werkstatt (LAN .121)", "camera"),
              buildDev("camera.cam_eg_vz_eingang", "EG Vorzimmer Kamera (LAN .140)", "camera"),
              buildDev("camera.lsc_smart_ptz_camera_2", "LSC Smart PTZ Camera 2", "camera"),
              buildDev("camera.lsc_smart_ptz_camera_3", "LSC Smart PTZ Camera 3", "camera"),
              buildDev("camera.lsc_smart_outdoor_camera", "LSC Smart Outdoor Camera", "camera"),
              buildDev("camera.lsc_smart_indoor_camera", "LSC Smart Indoor Camera", "camera")
            ]
          }
        ].map((r) => {
          const activeCount = r.devices.filter((d) => (d.kind === "toggle" || d.kind === "rgbw") && d.isOn).length;
          const totalPowerW = r.devices.reduce((acc, d) => acc + (d.powerW || 0), 0);
          return {
            ...r,
            activeCount,
            totalPowerW: Math.round(totalPowerW * 10) / 10,
            motionActive: r.id === "stiegenhaus_keller" ? getVal("binary_sensor.shelly_blu_motion_19ca_bewegung") === "on" : false
          };
        });
        return sendJson(res, 200, {
          rooms,
          visionSummary: sharedDb.kvGet("camera_vision_today") || null
        });
      }
      if (pathname === "/api/system/device-action" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        if (!body.entityId) return sendJson(res, 400, { error: "entityId is required" });
        if (body.entityId === "switch.buro_og_bewasserung_pumpe" && body.action !== "turn_on") {
          return sendJson(res, 403, {
            error: "switch.buro_og_bewasserung_pumpe versorgt den Home Assistant Server PC (192.168.188.100) und ist gegen Abschalten gesch\xFCtzt."
          });
        }
        const domain = body.entityId.split(".")[0];
        if (!["light", "switch", "media_player", "siren", "camera"].includes(domain)) {
          return sendJson(res, 400, { error: `Unsupported domain ${domain}` });
        }
        if (body.action === "brightness" && domain === "light") {
          const pct = Math.max(1, Math.min(100, Number(body.brightnessPct) || 50));
          await systemHaBridge.callService("light", "turn_on", {
            entity_id: body.entityId,
            brightness_pct: pct
          });
        } else if (body.action === "effect" && domain === "light") {
          await systemHaBridge.callService("light", "turn_on", {
            entity_id: body.entityId,
            effect: body.effect || "Off"
          });
        } else {
          const svc = body.action === "turn_on" ? "turn_on" : body.action === "turn_off" ? "turn_off" : "toggle";
          await systemHaBridge.callService(domain, svc, { entity_id: body.entityId });
        }
        return sendJson(res, 200, { ok: true });
      }
      if (pathname === "/api/system/status" && req.method === "GET") {
        const ha = await systemHaBridge.getStatus();
        const google = googleOAuth.getStatus();
        const apps = Array.from(loadedApps.values()).map((a) => ({
          ...a.manifest,
          source: a.source,
          updatedAt: a.updatedAt
        }));
        const summaries = {
          health: sharedDb.kvGet("google_health_today") || null,
          meals: sharedDb.kvGet("meal_planner_today") || null,
          calendar: sharedDb.kvGet("google_calendar_today") || null,
          finance: sharedDb.kvGet("finance_summary") || null,
          vision: sharedDb.kvGet("camera_vision_today") || null,
          print3d: sharedDb.kvGet("thassi_3dprint_summary") || null
        };
        const notes = sharedDb.query("SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50");
        const weather = await fetchStVeitGoelsenWeather().catch(() => null);
        return sendJson(res, 200, {
          ha,
          google,
          apps,
          summaries: {
            ...summaries,
            weather
          },
          notes,
          jobs: scheduler.listJobs(),
          standaloneAppId: (req.headers["x-thassi-standalone-app"] || "").trim() || STANDALONE_APP_ID || null
        });
      }
      if (pathname === "/api/system/weather" && req.method === "GET") {
        const forceRefresh = queryObj.refresh === "1" || queryObj.refresh === "true";
        const weather = await fetchStVeitGoelsenWeather(forceRefresh);
        return sendJson(res, 200, weather);
      }
      if (pathname === "/api/system/actions" && req.method === "GET") {
        return sendJson(res, 200, { actions: actionRegistry.listActions() });
      }
      if (pathname === "/api/system/actions/execute" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        if (!body.actionId) {
          return sendJson(res, 400, { error: "actionId is required" });
        }
        const result = await actionRegistry.execute(body.actionId, body.input || {}, {
          upstreamText: body.upstreamText
        });
        return sendJson(res, 200, result);
      }
      if (pathname === "/api/system/weather/config" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        if (typeof body.googleApiKey === "string") {
          sharedDb.kvSet("google_weather_api_key", body.googleApiKey.trim());
        }
        const weather = await fetchStVeitGoelsenWeather(true);
        return sendJson(res, 200, weather);
      }
      if (pathname === "/api/system/notes" && req.method === "GET") {
        const notes = sharedDb.query("SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50");
        return sendJson(res, 200, { notes });
      }
      if (pathname === "/api/system/notes" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        if (!body.content?.trim()) {
          return sendJson(res, 400, { error: "Note content is required" });
        }
        const now = /* @__PURE__ */ new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const fileName = `note_${ts}.json`;
        const notesDir = path4.join(DATA_DIR, "notes");
        fs4.mkdirSync(notesDir, { recursive: true });
        fs4.writeFileSync(
          path4.join(notesDir, fileName),
          JSON.stringify(
            {
              fileName,
              id: `note_${ts}`,
              content: body.content.trim(),
              createdAt: now.toISOString(),
              timestampFormatted: ts,
              localPath: `/data/notes/${fileName}`
            },
            null,
            2
          ),
          "utf-8"
        );
        const info = sharedDb.execute(
          "INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)",
          [body.content.trim(), now.toISOString()]
        );
        return sendJson(res, 200, { id: info.lastInsertRowid, fileName });
      }
      if (pathname === "/api/system/notes" && req.method === "DELETE") {
        const id = Number(queryObj.id);
        sharedDb.execute("DELETE FROM system_notes WHERE id = ?", [id]);
        return sendJson(res, 200, { deleted: id });
      }
      if (pathname === "/api/system/ha-config" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        const current = sharedDb.kvGet("ha_connection") || {};
        sharedDb.kvSet("ha_connection", {
          haUrl: body.haUrl || current.haUrl || "http://192.168.188.92:8123",
          haToken: body.haToken !== void 0 && body.haToken !== "" ? body.haToken : current.haToken
        });
        return sendJson(res, 200, await systemHaBridge.getStatus());
      }
      if (pathname === "/api/system/google/config" && req.method === "POST") {
        const body = JSON.parse(await readRequestBody(req) || "{}");
        return sendJson(res, 200, googleOAuth.saveConfig(body));
      }
      if (pathname === "/api/system/google/auth-url" && req.method === "GET") {
        const url = googleOAuth.getAuthorizationUrl();
        return sendJson(res, 200, { url });
      }
      if (pathname === "/api/system/google/callback" && req.method === "GET") {
        if (!queryObj.code) {
          return sendJson(res, 400, { error: "Missing ?code parameter from Google OAuth" });
        }
        await googleOAuth.exchangeCode(queryObj.code);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<h2>\u2705 Google Account Connected to Thassi Dashboard!</h2><p>You can close this tab now.</p>"
        );
        return;
      }
      if (pathname === "/api/system/deploy" && req.method === "POST") {
        const payload = JSON.parse(await readRequestBody(req));
        if (!payload?.manifest?.id) {
          return sendJson(res, 400, { error: "Invalid deployment bundle: missing manifest.id" });
        }
        const appId = payload.manifest.id.replace(/[^a-z0-9-_]/gi, "");
        const writeBundleToDir = (baseDir) => {
          const dir = path4.join(baseDir, appId);
          fs4.mkdirSync(dir, { recursive: true });
          fs4.writeFileSync(
            path4.join(dir, "thassi.app.json"),
            JSON.stringify(payload.manifest, null, 2)
          );
          if (payload.backendCode) {
            fs4.writeFileSync(path4.join(dir, "backend.mjs"), payload.backendCode, "utf-8");
          }
          const frontendDir = path4.join(dir, "frontend");
          fs4.rmSync(frontendDir, { recursive: true, force: true });
          fs4.mkdirSync(frontendDir, { recursive: true });
          for (const [relFile, b64] of Object.entries(payload.frontendFiles || {})) {
            const safeRel = relFile.replace(/\\/g, "/").replace(/^(\.\.[/\\])+/, "");
            const destFile = path4.join(frontendDir, safeRel);
            fs4.mkdirSync(path4.dirname(destFile), { recursive: true });
            fs4.writeFileSync(destFile, Buffer.from(b64, "base64"));
          }
          return dir;
        };
        const targetDir = writeBundleToDir(path4.join(os2.tmpdir(), "thassi_deployed_apps"));
        try {
          writeBundleToDir(path4.join(DATA_DIR, "deployed_apps"));
        } catch (err) {
          console.warn(
            `[Thassi] Mirror to persistent deployed_apps skipped (${err instanceof Error ? err.message : err}), running from tmpfs`
          );
        }
        await loadAppFromDirectory(targetDir, "hot-deployed");
        try {
          syncHassFrontendFiles();
        } catch {
        }
        return sendJson(res, 200, {
          deployed: true,
          appId,
          name: payload.manifest.name,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const appApiMatch = pathname.match(/^\/api\/apps\/([^/]+)(\/.*)?$/);
      if (appApiMatch) {
        const appId = decodeURIComponent(appApiMatch[1]);
        const subRoute = appApiMatch[2] || "/";
        const app = loadedApps.get(appId);
        if (!app) {
          return sendJson(res, 404, { error: `App "${appId}" is not installed` });
        }
        await handleAppApiRequest(req, res, app, subRoute, queryObj);
        return;
      }
      const appUiMatch = pathname.match(/^\/apps\/([^/]+)(?:\/(.*))?$/);
      if (appUiMatch) {
        const appId = decodeURIComponent(appUiMatch[1]);
        const subPath = appUiMatch[2] || "index.html";
        const app = loadedApps.get(appId);
        if (!app) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end(`App "${appId}" not found.`);
          return;
        }
        serveAppStaticFile(req, res, app, subPath, `/apps/${encodeURIComponent(appId)}`);
        return;
      }
      if (effectiveStandaloneAppId && loadedApps.has(effectiveStandaloneAppId)) {
        const standaloneApp = loadedApps.get(effectiveStandaloneAppId);
        serveAppStaticFile(req, res, standaloneApp, pathname, "");
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      console.error("[Thassi Server Error]", err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Thassi] Unified Dashboard listening on http://0.0.0.0:${PORT}`);
    console.log(
      `[Thassi] Installed services (${loadedApps.size}): ${Array.from(loadedApps.keys()).join(", ")}`
    );
  });
}
void startServer();
