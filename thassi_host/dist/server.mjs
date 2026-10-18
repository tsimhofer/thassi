// thassi_host/src/server.ts
import http from "node:http";
import fs2 from "node:fs";
import path2 from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

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
    this.raw = new DatabaseSync(dbPath);
    this.raw.exec("PRAGMA journal_mode = WAL;");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS _thassi_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
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
    const result = await this.request(`/states/${entityId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const published = this.sharedDb.kvGet("published_sensors", {}) || {};
    published[entityId] = {
      entityId,
      appId: this.appId,
      state: String(state),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.sleep.read"
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

// thassi_host/src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
function loadDotEnv() {
  const envPath = path2.resolve(process.cwd(), ".env");
  if (!fs2.existsSync(envPath)) return;
  const content = fs2.readFileSync(envPath, "utf-8");
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
var DATA_DIR = path2.resolve(
  process.env.THASSI_DATA_DIR || (fs2.existsSync("/data") ? "/data" : "./data")
);
var STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || "";
fs2.mkdirSync(path2.join(DATA_DIR, "apps"), { recursive: true });
fs2.mkdirSync(path2.join(DATA_DIR, "deployed_apps"), { recursive: true });
var legacyStarterDir = path2.join(DATA_DIR, "deployed_apps", "data-workbench");
if (fs2.existsSync(legacyStarterDir)) {
  fs2.rmSync(legacyStarterDir, { recursive: true, force: true });
}
var sharedDb = new ThassiAppDatabase(path2.join(DATA_DIR, "shared.db"));
var scheduler = new ThassiCronScheduler();
var googleOAuth = new ThassiGoogleOAuthManager(sharedDb);
var systemHaBridge = new ThassiHaBridge("hub", sharedDb);
var loadedApps = /* @__PURE__ */ new Map();
async function loadAppFromDirectory(appDir, source) {
  const manifestPath = path2.join(appDir, "thassi.app.json");
  if (!fs2.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs2.readFileSync(manifestPath, "utf-8"));
  const appId = manifest.id;
  if (appId === "data-workbench") return;
  scheduler.clearAppJobs(appId);
  const existing = loadedApps.get(appId);
  const appDb = existing?.db || new ThassiAppDatabase(path2.join(DATA_DIR, "apps", `${appId}.db`));
  const appHa = new ThassiHaBridge(appId, sharedDb);
  const routes = /* @__PURE__ */ new Map();
  const ctx = {
    appId,
    db: appDb,
    sharedDb,
    ha: appHa,
    google: googleOAuth,
    scheduleJob: (job) => scheduler.registerJob(appId, job),
    route: (method, routePath, handler) => {
      const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
      routes.set(`${method.toUpperCase()} ${normalized}`, handler);
    }
  };
  const compiledBackend = path2.join(appDir, "backend.mjs");
  const devBackend = path2.join(appDir, "backend", "index.ts");
  const backendFile = fs2.existsSync(compiledBackend) ? compiledBackend : fs2.existsSync(devBackend) ? devBackend : null;
  if (backendFile) {
    const fileUrl = `${pathToFileURL(backendFile).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    if (mod.default && typeof mod.default.setup === "function") {
      await mod.default.setup(ctx);
    }
  }
  const distFrontend = path2.join(appDir, "frontend");
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
    path2.join(__dirname, "apps"),
    path2.resolve(process.cwd(), "thassi_host", "dist", "apps"),
    path2.resolve(process.cwd(), "apps")
  ];
  for (const baseDir of candidateBuiltInDirs) {
    if (!fs2.existsSync(baseDir)) continue;
    for (const entry of fs2.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        const appDir = path2.join(baseDir, entry.name);
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
  const deployedBase = path2.join(DATA_DIR, "deployed_apps");
  if (fs2.existsSync(deployedBase)) {
    for (const entry of fs2.readdirSync(deployedBase, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        try {
          await loadAppFromDirectory(path2.join(deployedBase, entry.name), "hot-deployed");
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
  let filePath = path2.join(app.frontendDir, cleanSub);
  if (!fs2.existsSync(filePath) || fs2.statSync(filePath).isDirectory()) {
    filePath = path2.join(app.frontendDir, "index.html");
  }
  if (!fs2.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Frontend bundle not found for app "${app.manifest.id}". Run "npm run build" first.`);
    return;
  }
  const ext = path2.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  if (ext === ".html") {
    let html = fs2.readFileSync(filePath, "utf-8");
    const assetBase = `${ingressPath}${mountPrefix}`.replace(/\/+$/, "");
    html = html.replace(/(src|href)="\.\/assets\//g, `$1="${assetBase}/assets/`).replace(/(src|href)="\/assets\//g, `$1="${assetBase}/assets/`);
    const injection = `<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)};</script>`;
    html = html.includes("</head>") ? html.replace("</head>", `${injection}</head>`) : `${injection}${html}`;
    res.writeHead(200, { "Content-Type": mime });
    res.end(html);
    return;
  }
  res.writeHead(200, { "Content-Type": mime });
  fs2.createReadStream(filePath).pipe(res);
}
function renderUnifiedDashboardHtml(ingressPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Main Dashboard</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --bg: #090d16;
      --panel: #111827;
      --card: #1e293b;
      --border: #2dd4bf22;
      --border-solid: #334155;
      --accent: #38bdf8;
      --accent-dark: #0284c7;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      height: 50px;
      background: #0f172a;
      border-bottom: 1px solid var(--border-solid);
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 15px;
      color: var(--accent);
      cursor: pointer;
    }
    .nav-tabs {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn {
      padding: 5px 11px;
      border-radius: 7px;
      border: 1px solid var(--border-solid);
      background: var(--card);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--accent); }
    .btn.active, .btn.primary {
      background: var(--accent-dark);
      border-color: var(--accent);
      color: #fff;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      background: #0f172a;
      color: var(--accent);
      border: 1px solid var(--border-solid);
    }
    /* Fullscreen 2-Column Split: 68% Calendar Left / 32% Compact Data Right */
    .fullscreen-grid {
      display: grid;
      grid-template-columns: 1fr 390px;
      gap: 14px;
      padding: 14px;
      height: calc(100vh - 50px);
      overflow: hidden;
    }
    @media (max-width: 1024px) {
      html, body { overflow: auto; height: auto; }
      .app-shell { height: auto; }
      .fullscreen-grid { grid-template-columns: 1fr; height: auto; overflow: visible; }
    }
    .calendar-pane {
      background: var(--panel);
      border: 1px solid var(--border-solid);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .cal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-solid);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      background: #131c2e;
    }
    .quick-add-bar {
      padding: 10px 18px;
      background: #0f172a;
      border-bottom: 1px solid var(--border-solid);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .quick-add-bar input {
      margin: 0;
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid var(--border-solid);
      background: #1e293b;
      color: #fff;
    }
    .cal-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
    }
    .day-group {
      margin-bottom: 18px;
    }
    .day-header {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
    }
    .event-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      margin-bottom: 7px;
      background: #1e293b;
      border-radius: 10px;
      border-left: 4px solid var(--accent);
    }
    .event-time {
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
      min-width: 110px;
    }
    .event-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }
    .event-meta {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    /* Right Column Compact Sidebar */
    .compact-sidebar {
      display: flex;
      flex-direction: column;
      gap: 11px;
      height: 100%;
      overflow-y: auto;
      padding-right: 2px;
    }
    .compact-card {
      background: var(--panel);
      border: 1px solid var(--border-solid);
      border-radius: 12px;
      padding: 12px 14px;
      flex-shrink: 0;
    }
    .compact-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .mini-stat {
      background: #1e293b;
      border-radius: 8px;
      padding: 6px 9px;
      border: 1px solid #283548;
    }
    .mini-stat-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .mini-stat-val {
      font-size: 14px;
      font-weight: 800;
      color: #f8fafc;
      margin-top: 1px;
    }
    .switch-mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .switch-mini {
      padding: 7px 9px;
      border-radius: 8px;
      background: #1e293b;
      border: 1px solid var(--border-solid);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }
    .switch-mini.on {
      border-color: #facc15;
      background: rgba(250, 204, 21, 0.14);
    }
    #app-iframe-container {
      display: none;
      height: calc(100vh - 50px);
      width: 100%;
    }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="app-shell">
    <div class="topbar">
      <div class="brand" onclick="switchView('overview')">
        <span>\u26A1 Thassi Main Dashboard</span>
        <span id="ha-pill" class="badge">Checking HA...</span>
        <span id="clock-pill" style="font-size:12px; color:var(--muted); font-weight:600;"></span>
      </div>
      <div class="nav-tabs">
        <button class="btn active" id="nav-overview" onclick="switchView('overview')">\u{1F4C5} Main Overview</button>
        <button class="btn" id="nav-google-calendar" onclick="openApp('google-calendar')">\u{1F4C5} Calendar</button>
        <button class="btn" id="nav-google-health" onclick="openApp('google-health')">\u2764\uFE0F Health</button>
        <button class="btn" id="nav-finance-analytics" onclick="openApp('finance-analytics')">\u{1F4B6} Finances</button>
        <button class="btn" id="nav-meal-planner" onclick="openApp('meal-planner')">\u{1F37D}\uFE0F Meals</button>
        <button class="btn" id="nav-smart-canvas" onclick="openApp('smart-canvas')">\u{1F39B}\uFE0F Controls</button>
        <button class="btn" id="nav-settings" onclick="switchView('settings')">\u2699\uFE0F</button>
      </div>
    </div>

    <div id="app-iframe-container">
      <iframe id="app-frame" src="about:blank"></iframe>
    </div>

    <div id="main-container" style="flex:1; overflow:hidden;">
      <div id="view-overview" class="fullscreen-grid">
        <!-- LEFT FULLSCREEN FOCUS: GOOGLE CALENDAR EVENTS -->
        <div class="calendar-pane">
          <div class="cal-header">
            <div>
              <div style="display:flex; align-items:center; gap:10px;">
                <h2 style="margin:0; font-size:18px; color:#38bdf8;">\u{1F4C5} Upcoming Calendar Schedule</h2>
                <span class="badge" id="cal-conn-badge">Checking...</span>
              </div>
              <div style="font-size:12px; color:var(--muted); margin-top:3px;" id="cal-subtitle">
                Synced with Home Assistant Google Calendar entities
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn" onclick="syncCalendarsNow()">\u{1F504} Sync Now</button>
              <button class="btn primary" onclick="openApp('google-calendar')">Full Calendar Analytics \u2192</button>
            </div>
          </div>

          <!-- Inline Quick Add Event to Google Calendar -->
          <form class="quick-add-bar" onsubmit="quickAddEvent(event)">
            <input id="qa-title" placeholder="Add event to Google Calendar (e.g. Zahnarzt, Meeting...)" style="flex:1; min-width:180px;" required />
            <input id="qa-start" type="datetime-local" required />
            <input id="qa-dur" type="number" value="60" min="15" step="15" style="width:70px;" title="Duration (min)" />
            <button type="submit" class="btn primary">+ Add Event</button>
          </form>

          <!-- Fullscreen Scrollable Day-by-Day Event List -->
          <div class="cal-scroll" id="cal-events-list">
            <div style="color:var(--muted); font-size:13px;">Loading calendar events...</div>
          </div>
        </div>

        <!-- RIGHT COMPACT COLUMN: HEALTH, SMART CONTROLS, FINANCE, MEALS -->
        <div class="compact-sidebar">
          <!-- 1. Compact Google Health & Pixel 10 -->
          <div class="compact-card" style="border-top: 3px solid #4ade80;">
            <div class="compact-title" style="color:#4ade80;" onclick="openApp('google-health')">
              <span>\u2764\uFE0F Health &amp; Pixel 10</span>
              <span class="badge" id="h-badge">--</span>
            </div>
            <div class="mini-grid">
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F45F} Steps Today</div>
                <div class="mini-stat-val" id="h-steps">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u26A1 Readiness</div>
                <div class="mini-stat-val" id="h-score" style="color:#4ade80;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u2764\uFE0F Heart Rate</div>
                <div class="mini-stat-val" id="h-hr">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F319} RHR / HRV</div>
                <div class="mini-stat-val" id="h-rhr">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F6CC} Sleep / Resp</div>
                <div class="mini-stat-val" id="h-sleep">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F525} Burn / Dist</div>
                <div class="mini-stat-val" id="h-burn">--</div>
              </div>
            </div>
          </div>

          <!-- 2. Compact Smart Home Controls -->
          <div class="compact-card" style="border-top: 3px solid #facc15;">
            <div class="compact-title" style="color:#facc15;" onclick="openApp('smart-canvas')">
              <span>\u{1F39B}\uFE0F Smart Controls</span>
              <span class="badge" id="sw-climate-badge">--</span>
            </div>
            <div class="switch-mini-grid" id="quick-switches"></div>
          </div>

          <!-- 3. Compact Finance & Budget (George CSV) -->
          <div class="compact-card" style="border-top: 3px solid #a855f7;">
            <div class="compact-title" style="color:#a855f7;" onclick="openApp('finance-analytics')">
              <span>\u{1F4B6} Finance (George)</span>
              <span class="badge" id="f-month-badge">--</span>
            </div>
            <div class="mini-grid">
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F4E5} Income</div>
                <div class="mini-stat-val" id="f-inc" style="color:#4ade80;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F4E4} Expenses</div>
                <div class="mini-stat-val" id="f-exp" style="color:#f43f5e;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F437} Notgroschen</div>
                <div class="mini-stat-val" id="f-inv" style="color:#a855f7;">--</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">\u{1F6D2} Groceries</div>
                <div class="mini-stat-val" id="f-groc">--</div>
              </div>
            </div>
          </div>

          <!-- 4. Compact Meal Planner -->
          <div class="compact-card" style="border-top: 3px solid #fb923c;">
            <div class="compact-title" style="color:#fb923c;" onclick="openApp('meal-planner')">
              <span>\u{1F37D}\uFE0F Meals Today</span>
              <span class="badge" id="m-kcal-badge">0 kcal</span>
            </div>
            <div id="m-content" style="font-size:12px; color:var(--muted);"></div>
          </div>
        </div>
      </div>

      <!-- SETTINGS VIEW -->
      <div id="view-settings" style="display:none; padding:24px; max-width:960px; margin:0 auto;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
          <div class="compact-card">
            <h3 style="margin-top:0;">\u{1F3E0} Home Assistant Connection</h3>
            <p id="ha-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label style="font-size:12px; color:var(--muted);">Home Assistant URL</label>
            <input id="ha-url-input" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Long-Lived Access Token</label>
            <input id="ha-token-input" type="password" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <button class="btn primary" onclick="saveHaConfig()">Save &amp; Test HA Connection</button>
          </div>
          <div class="compact-card">
            <h3 style="margin-top:0;">\u{1F4C5} Google OAuth2 Vault</h3>
            <p id="google-status-text" style="color:var(--muted); font-size:13px;"></p>
            <label style="font-size:12px; color:var(--muted);">Client ID</label>
            <input id="google-client-id" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Client Secret</label>
            <input id="google-client-secret" type="password" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <label style="font-size:12px; color:var(--muted);">Redirect URI</label>
            <input id="google-redirect-uri" style="width:100%; padding:8px; margin:4px 0 12px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px;" />
            <div style="display:flex; gap:8px;">
              <button class="btn primary" onclick="saveGoogleConfig()">Save</button>
              <button class="btn" onclick="startGoogleOAuth()">Authorize with Google \u2197</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const base = window.__THASSI_INGRESS_PATH__ ? window.__THASSI_INGRESS_PATH__.replace(/\\/+$/, '') : '';
    const NAV_IDS = ['overview', 'google-calendar', 'google-health', 'finance-analytics', 'meal-planner', 'smart-canvas', 'settings'];
    const CAT_COLORS = {
      work: '#38bdf8',
      focus: '#a855f7',
      health: '#4ade80',
      social: '#f43f5e',
      meals: '#fb923c',
      personal: '#eab308'
    };

    function updateClock() {
      const now = new Date();
      document.getElementById('clock-pill').textContent = now.toLocaleString('de-AT', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    }
    setInterval(updateClock, 10000);
    updateClock();

    // Default quick-add datetime to next hour
    const nextHour = new Date(Date.now() + 3600000);
    nextHour.setMinutes(0, 0, 0);
    const tzOffset = nextHour.getTimezoneOffset() * 60000;
    document.getElementById('qa-start').value = new Date(nextHour - tzOffset).toISOString().slice(0, 16);

    function setActiveNav(id) {
      NAV_IDS.forEach(k => {
        const el = document.getElementById('nav-' + k);
        if (el) el.className = (k === id) ? 'btn active' : 'btn';
      });
    }

    function switchView(view) {
      document.getElementById('app-iframe-container').style.display = 'none';
      document.getElementById('main-container').style.display = 'block';
      document.getElementById('view-overview').style.display = (view === 'overview') ? 'grid' : 'none';
      document.getElementById('view-settings').style.display = (view === 'settings') ? 'block' : 'none';
      setActiveNav(view);
      if (view === 'overview') loadCommandCenter();
    }

    function openApp(appId) {
      document.getElementById('main-container').style.display = 'none';
      const container = document.getElementById('app-iframe-container');
      const frame = document.getElementById('app-frame');
      frame.src = base + '/apps/' + encodeURIComponent(appId) + '/';
      container.style.display = 'block';
      setActiveNav(appId);
    }

    async function toggleSwitch(entityId) {
      await fetch(base + '/api/apps/smart-canvas/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId })
      });
      await loadCommandCenter();
    }

    async function syncCalendarsNow() {
      document.getElementById('cal-conn-badge').textContent = 'Syncing...';
      await fetch(base + '/api/apps/google-calendar/sync', { method: 'POST' });
      await loadCommandCenter();
    }

    async function quickAddEvent(e) {
      e.preventDefault();
      const title = document.getElementById('qa-title').value;
      const start_time = document.getElementById('qa-start').value;
      const duration_minutes = Number(document.getElementById('qa-dur').value || 60);
      if (!title || !start_time) return;
      await fetch(base + '/api/apps/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, start_time: new Date(start_time).toISOString(), duration_minutes })
      });
      document.getElementById('qa-title').value = '';
      await loadCommandCenter();
    }

    async function loadCommandCenter() {
      const [sysRes, calRes, healthRes, boardRes] = await Promise.all([
        fetch(base + '/api/system/status'),
        fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null),
        fetch(base + '/api/apps/google-health/dashboard').catch(() => null),
        fetch(base + '/api/apps/smart-canvas/board').catch(() => null)
      ]);
      const data = await sysRes.json();

      const pill = document.getElementById('ha-pill');
      pill.textContent = data.ha.connected ? '\u25CF HA Connected' : '\u25B2 HA Disconnected';
      pill.style.color = data.ha.connected ? '#4ade80' : '#f43f5e';

      document.getElementById('ha-status-text').textContent = data.ha.message || '';
      document.getElementById('ha-url-input').value = data.ha.haUrl || 'http://192.168.188.92:8123';
      document.getElementById('google-status-text').textContent = data.google.authorized
        ? '\u2705 Authorized with Google OAuth2'
        : (data.google.configured ? 'Client ID configured \u2014 using HA Calendar & Health Connect bridge' : 'Not configured');

      // 1. Render Fullscreen Calendar Events
      const calListEl = document.getElementById('cal-events-list');
      const calBadge = document.getElementById('cal-conn-badge');
      if (!data.ha.connected) {
        calBadge.textContent = 'HA Disconnected';
        calBadge.style.color = '#f43f5e';
        calListEl.innerHTML = '<div style="color:#f43f5e; padding:20px;">\u274C No connection to Home Assistant Calendar API.</div>';
      } else if (calRes && calRes.ok) {
        const calData = await calRes.json();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const upcoming = (calData.events || []).filter(ev => new Date(ev.end_time) >= startOfToday);
        calBadge.textContent = upcoming.length + ' upcoming events';
        calBadge.style.color = '#4ade80';

        if (upcoming.length === 0) {
          calListEl.innerHTML = '<div style="color:var(--muted); padding:20px;">No upcoming events found in connected Google Calendars.</div>';
        } else {
          const groups = new Map();
          upcoming.forEach(ev => {
            const dKey = ev.start_time.slice(0, 10);
            if (!groups.has(dKey)) groups.set(dKey, []);
            groups.get(dKey).push(ev);
          });

          const todayStr = new Date().toISOString().slice(0, 10);
          const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

          let html = '';
          for (const [dKey, evs] of groups.entries()) {
            const dateObj = new Date(dKey + 'T12:00:00');
            let dayLabel = dateObj.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            if (dKey === todayStr) dayLabel = '\u{1F525} TODAY \u2014 ' + dayLabel;
            else if (dKey === tomorrowStr) dayLabel = '\u23ED\uFE0F TOMORROW \u2014 ' + dayLabel;

            html += '<div class="day-group">';
            html += '<div class="day-header"><span>' + dayLabel + '</span><span>' + evs.length + ' event(s)</span></div>';
            evs.forEach(ev => {
              const s = new Date(ev.start_time);
              const e = new Date(ev.end_time);
              const sTime = s.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
              const eTime = e.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
              const color = CAT_COLORS[ev.category] || '#38bdf8';
              html += \`
                <div class="event-row" style="border-left-color:\${color};">
                  <div style="display:flex; align-items:center; gap:14px;">
                    <div class="event-time">\${sTime} \u2013 \${eTime}</div>
                    <div>
                      <div class="event-title">\${ev.title}</div>
                      <div class="event-meta">
                        \u{1F4C5} \${ev.calendar_name}
                        \${ev.location ? ' \u2022 \u{1F4CD} ' + ev.location : ''}
                        \${ev.description ? ' \u2022 ' + ev.description.slice(0, 60) : ''}
                      </div>
                    </div>
                  </div>
                  <span class="badge" style="color:\${color}; border-color:\${color}44;">\${ev.category}</span>
                </div>
              \`;
            });
            html += '</div>';
          }
          calListEl.innerHTML = html;
        }
      }

      // 2. Render Compact Health Card (Never show dummy numbers!)
      if (healthRes && healthRes.ok) {
        const hd = await healthRes.json();
        const t = hd.today;
        document.getElementById('h-badge').textContent = t?.source && t.source !== 'no_connection' ? 'Pixel 10 Live' : 'No Data';
        document.getElementById('h-steps').textContent = t?.steps > 0 ? t.steps.toLocaleString() : 'No data';
        document.getElementById('h-score').textContent = hd.readiness?.score > 0 ? (hd.readiness.score + '/100') : 'No data';
        document.getElementById('h-hr').textContent = t?.current_hr > 0 ? (t.current_hr + ' bpm') : 'No data';
        document.getElementById('h-rhr').textContent =
          (t?.resting_hr > 0 ? (t.resting_hr + ' bpm') : 'No data') +
          (hd.hrvMs ? (' / ' + hd.hrvMs + 'ms') : '');
        document.getElementById('h-sleep').textContent =
          (t?.sleep_hours > 0 ? (t.sleep_hours + 'h') : 'No data') +
          (hd.respiratoryRate ? (' / ' + hd.respiratoryRate) : '');
        document.getElementById('h-burn').textContent =
          (t?.active_calories > 0 ? (t.active_calories + ' kcal') : 'No data') +
          (hd.distanceKm ? (' / ' + hd.distanceKm + 'km') : '');
      }

      // 3. Render Compact Smart Controls
      if (boardRes && boardRes.ok) {
        const board = await boardRes.json();
        const tempSt = board.stateMap?.['sensor.temperatur_und_feuchtigkeitssensor_temperature'];
        const humSt = board.stateMap?.['sensor.temperatur_und_feuchtigkeitssensor_humidity'];
        document.getElementById('sw-climate-badge').textContent =
          tempSt ? (tempSt.state + '\xB0C' + (humSt ? ' \u2022 ' + humSt.state + '%' : '')) : (data.ha.connected ? 'Live' : 'Offline');

        const swGrid = document.getElementById('quick-switches');
        swGrid.innerHTML = '';
        (board.tiles || [])
          .filter(t => ['light', 'switch'].includes(t.entity_id.split('.')[0]))
          .slice(0, 6)
          .forEach(t => {
            const st = board.stateMap?.[t.entity_id];
            const subSt = t.sub_entity_id ? board.stateMap?.[t.sub_entity_id] : null;
            const isOn = st?.state === 'on';
            const div = document.createElement('div');
            div.className = 'switch-mini' + (isOn ? ' on' : '');
            div.onclick = () => toggleSwitch(t.entity_id);
            div.innerHTML = \`
              <div style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis; padding-right:4px;">
                <strong>\${t.icon} \${t.custom_label}</strong>
                \${subSt && Number(subSt.state) > 0 ? '<span style="color:#facc15; margin-left:4px;">' + subSt.state + 'W</span>' : ''}
              </div>
              <span style="font-weight:700; color:\${isOn ? '#facc15' : '#64748b'};">\${st ? (isOn ? 'ON' : 'OFF') : 'N/A'}</span>
            \`;
            swGrid.appendChild(div);
          });
      }

      // 4. Render Compact Finance Card
      const f = data.summaries?.finance;
      if (f && (f.income > 0 || f.expenses > 0)) {
        document.getElementById('f-month-badge').textContent = f.activeMonth || 'Loaded';
        document.getElementById('f-inc').textContent = '+\u20AC' + Number(f.income).toFixed(0);
        document.getElementById('f-exp').textContent = '-\u20AC' + Number(f.expenses).toFixed(0);
        document.getElementById('f-inv').textContent = '\u20AC' + Number(f.investments || 0).toFixed(0);
        document.getElementById('f-groc').textContent = '\u20AC' + Number(f.grocerySpend || 0).toFixed(0);
      } else {
        document.getElementById('f-month-badge').textContent = 'No CSV Data';
        document.getElementById('f-inc').textContent = 'No data';
        document.getElementById('f-exp').textContent = 'No data';
        document.getElementById('f-inv').textContent = 'No data';
        document.getElementById('f-groc').textContent = 'No data';
      }

      // 5. Render Compact Meal Planner Card
      const m = data.summaries?.meals;
      const mContent = document.getElementById('m-content');
      if (m && (m.breakfast || m.lunch || m.dinner)) {
        document.getElementById('m-kcal-badge').textContent = (m.totalCalories || 0) + ' kcal';
        mContent.innerHTML = \`
          <div style="padding:3px 0;">\u{1F305} <strong>Breakfast:</strong> \${m.breakfast || 'Not planned'}</div>
          <div style="padding:3px 0;">\u2600\uFE0F <strong>Lunch:</strong> \${m.lunch || 'Not planned'}</div>
          <div style="padding:3px 0;">\u{1F319} <strong>Dinner:</strong> \${m.dinner || 'Not planned'}</div>
        \`;
      } else {
        document.getElementById('m-kcal-badge').textContent = 'Unplanned';
        mContent.innerHTML = 'No meals planned for today. <a href="javascript:void(0)" onclick="openApp(\\'meal-planner\\')" style="color:#38bdf8;">Plan meals \u2192</a>';
      }
    }

    async function saveHaConfig() {
      const haUrl = document.getElementById('ha-url-input').value;
      const haToken = document.getElementById('ha-token-input').value;
      await fetch(base + '/api/system/ha-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken })
      });
      await loadCommandCenter();
    }

    async function saveGoogleConfig() {
      const clientId = document.getElementById('google-client-id').value;
      const clientSecret = document.getElementById('google-client-secret').value;
      const redirectUri = document.getElementById('google-redirect-uri').value;
      await fetch(base + '/api/system/google/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      await loadCommandCenter();
    }

    async function startGoogleOAuth() {
      const res = await fetch(base + '/api/system/google/auth-url');
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else alert(data.error || 'Configure Client ID & Secret first');
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('app')) {
      openApp(urlParams.get('app'));
    } else {
      loadCommandCenter();
    }
  </script>
</body>
</html>`;
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
    return sendJson(res, typed.status || 200, typed.body, typed.headers || {});
  }
  return sendJson(res, 200, result);
}
async function startServer() {
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
          finance: sharedDb.kvGet("finance_summary") || null
        };
        return sendJson(res, 200, {
          ha,
          google,
          apps,
          summaries,
          jobs: scheduler.listJobs(),
          standaloneAppId: (req.headers["x-thassi-standalone-app"] || "").trim() || STANDALONE_APP_ID || null
        });
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
        const targetDir = path2.join(DATA_DIR, "deployed_apps", appId);
        fs2.mkdirSync(targetDir, { recursive: true });
        fs2.writeFileSync(
          path2.join(targetDir, "thassi.app.json"),
          JSON.stringify(payload.manifest, null, 2)
        );
        if (payload.backendCode) {
          fs2.writeFileSync(path2.join(targetDir, "backend.mjs"), payload.backendCode, "utf-8");
        }
        const frontendDir = path2.join(targetDir, "frontend");
        fs2.rmSync(frontendDir, { recursive: true, force: true });
        fs2.mkdirSync(frontendDir, { recursive: true });
        for (const [relFile, b64] of Object.entries(payload.frontendFiles || {})) {
          const safeRel = relFile.replace(/^(\.\.[/\\])+/, "");
          const destFile = path2.join(frontendDir, safeRel);
          fs2.mkdirSync(path2.dirname(destFile), { recursive: true });
          fs2.writeFileSync(destFile, Buffer.from(b64, "base64"));
        }
        await loadAppFromDirectory(targetDir, "hot-deployed");
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
      const effectiveStandaloneAppId = (req.headers["x-thassi-standalone-app"] || "").trim() || STANDALONE_APP_ID;
      if (effectiveStandaloneAppId && loadedApps.has(effectiveStandaloneAppId)) {
        const standaloneApp = loadedApps.get(effectiveStandaloneAppId);
        serveAppStaticFile(req, res, standaloneApp, pathname, "");
        return;
      }
      if (pathname === "/" || pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderUnifiedDashboardHtml(ingressPath));
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
