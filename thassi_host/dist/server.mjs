import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// thassi_host/src/server.ts
import http from "node:http";
import fs4 from "node:fs";
import path4 from "node:path";
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

// thassi_host/src/hass-sidebar-sync.ts
import fs3 from "node:fs";
import path3 from "node:path";
function getHassSidebarStylerScript() {
  return `
  (function initThassiHassSidebarStyler() {
    const SUBTLE_BAR_BG = '#161f2e';

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #040711 !important;
        --secondary-background-color: #161f2e !important;
        --card-background-color: rgba(8, 13, 26, 0.72) !important;
        --ha-card-background: rgba(8, 13, 26, 0.72) !important;
        --sidebar-background-color: \${SUBTLE_BAR_BG} !important;
        --sidebar-text-color: #cbd5e1 !important;
        --sidebar-icon-color: #94a3b8 !important;
        --sidebar-selected-text-color: #f8fafc !important;
        --sidebar-selected-icon-color: #38bdf8 !important;
        --primary-color: #38bdf8 !important;
        --accent-color: #38bdf8 !important;
        --divider-color: rgba(255, 255, 255, 0.08) !important;
        --app-header-background-color: \${SUBTLE_BAR_BG} !important;
        --app-header-text-color: #f8fafc !important;
        --mdc-theme-primary: #38bdf8 !important;
        --mdc-theme-surface: \${SUBTLE_BAR_BG} !important;
        background-color: #040711 !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer,
      aside.mdc-drawer {
        background: \${SUBTLE_BAR_BG} !important;
        background-color: \${SUBTLE_BAR_BG} !important;
        border-right: 1px solid rgba(255, 255, 255, 0.07) !important;
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
        color: #cbd5e1 !important;
        border-right: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .menu {
        background: \${SUBTLE_BAR_BG} !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        box-shadow: none !important;
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
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        transition: none !important;
        transform: none !important;
        box-shadow: none !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        transform: none !important;
        box-shadow: none !important;
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
      ha-md-list-item[href="/aishe-energy"] {
        display: none !important;
      }
    \`;

    const LOVELACE_FULLBLEED_CSS = \`
      .header, app-header, .toolbar {
        display: none !important;
        height: 0 !important;
      }
      #view {
        padding: 0 !important;
        margin: 0 !important;
        height: 100vh !important;
        min-height: 100vh !important;
        background: #040711 !important;
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
        }

        // Persist clean sidebar order & hidden panels in localStorage for all browser sessions
        try {
          const hidden = [
            "home","lovelace","light","security","climate","energy",
            "media-browser","logbook","history","todo","calendar",
            "map","thomas-buero","aishe-diagnose","aishe-details","aishe-security","aishe-energy"
          ];
          const order = [
            "44ec3c40_thassi_host",
            "44ec3c40_thassi_workflows",
            "44ec3c40_thassi_memo",
            "44ec3c40_thassi_cortex",
            "44ec3c40_thassi_finance_analytics",
            "44ec3c40_thassi_google_health",
            "44ec3c40_thassi_meal_planner",
            "44ec3c40_thassi_google_calendar",
            "44ec3c40_thassi_smart_canvas",
            "44ec3c40_thassi_project_workflow",
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
      // No-op: keep sidebar solid subtle non-black background with no effects
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
  <style>html,body{margin:0;padding:0;background:#040711;overflow:hidden;width:100%;height:100%;}iframe{width:100%;height:100%;border:0;display:block;}</style>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Thassi Horizon</title>
  <!-- VERIFY_PROMPT_BAR_123 -->
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --text: #f8fafc;
      --text-soft: rgba(248, 250, 252, 0.72);
      --text-muted: rgba(248, 250, 252, 0.45);
      --accent: #38bdf8;
      --sun-glow: #fbbf24;
      --nav-safe-left: 0px;
      --devices-dock-height: 44px;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; user-select: none; }
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100dvh;
      overflow: hidden;
      background: #040711;
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* TOOLBAR / LEFT NAVBAR HIDDEN ALTOGETHER PER USER REQUEST */
    #left-ambient-navbar,
    #mobile-nav-toggle,
    #mobile-nav-backdrop {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    /* DIRECT SPECIAL-VIEW NAVIGATION BUTTONS IN HORIZON DASHBOARD */
    .w-nav-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(248, 250, 252, 0.78);
      border-radius: 7px;
      padding: 1px 6px;
      font-family: var(--font-sans);
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.18s ease;
      line-height: 1.3;
    }
    .w-nav-btn:hover {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.45);
      color: #ffffff;
    }
    .horizon-view-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(248, 250, 252, 0.78);
      border-radius: 8px;
      padding: 3px 9px;
      font-family: var(--font-sans);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.05em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    }
    .horizon-view-btn:hover {
      background: rgba(56, 189, 248, 0.16);
      border-color: rgba(56, 189, 248, 0.4);
      color: #ffffff;
    }
    .cal-filter-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    #horizon-cal-filter-popover {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 310px;
      max-height: 340px;
      background: rgba(11, 17, 32, 0.96);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 14px 38px rgba(0, 0, 0, 0.78);
      z-index: 95;
      pointer-events: auto;
      flex-direction: column;
      gap: 8px;
    }
    #horizon-cal-filter-popover.open {
      display: flex;
    }
    .cal-filter-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      max-height: 210px;
      padding-right: 2px;
    }
    .cal-filter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      font-size: 11.5px;
      color: #e2e8f0;
      user-select: none;
    }
    .cal-filter-row:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.3);
    }

    /* 1. DYNAMIC DAYTIME SKY, WEATHER FX & ABSTRACT CELESTIAL HORIZON STAGE */
    #sky-stage {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100dvh;
      z-index: 1;
      pointer-events: none;
      transition: background 1.2s cubic-bezier(0.22, 1, 0.36, 1);
      overflow: hidden;
    }
    #starfield {
      position: absolute;
      inset: 0;
      transition: opacity 1.5s ease;
    }
    .star {
      position: absolute;
      background: #fff;
      border-radius: 50%;
      animation: twinkle var(--dur, 4s) ease-in-out infinite alternate;
    }
    @keyframes twinkle {
      0% { opacity: 0.15; transform: scale(0.8); }
      100% { opacity: 0.95; transform: scale(1.2); }
    }

    /* Subtle Background Weather Effects */
    #weather-fx-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      overflow: hidden;
    }
    #weather-cloud-veil-1,
    #weather-cloud-veil-2 {
      position: absolute;
      left: -20%;
      right: -20%;
      border-radius: 50%;
      filter: blur(60px);
      opacity: 0;
      transition: opacity 1.8s ease;
    }
    #weather-cloud-veil-1 {
      top: 4vh;
      height: 32vh;
      background: radial-gradient(ellipse at 38% 50%, rgba(148, 163, 184, 0.22), rgba(100, 116, 139, 0.08) 55%, transparent 78%);
      animation: cloudDriftSlow 46s ease-in-out infinite alternate;
    }
    #weather-cloud-veil-2 {
      top: 18vh;
      height: 36vh;
      background: radial-gradient(ellipse at 66% 50%, rgba(203, 213, 225, 0.16), rgba(71, 85, 105, 0.08) 60%, transparent 80%);
      animation: cloudDriftSlow 62s ease-in-out infinite alternate-reverse;
    }
    @keyframes cloudDriftSlow {
      0% { transform: translate3d(-4%, 0, 0) scale(1); }
      100% { transform: translate3d(4%, 1.5%, 0) scale(1.06); }
    }
    #weather-fx-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Atmospheric horizon mist & glow */
    #horizon-glow {
      position: absolute;
      left: -10%;
      right: -10%;
      bottom: 22vh;
      height: 36vh;
      filter: blur(58px);
      opacity: 0.72;
      transition: background 1.2s ease, opacity 1.2s ease;
    }

    /* Abstract Horizon & Celestial Trajectory SVG */
    #solar-arc-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      z-index: 3;
    }

    /* Abstract Sun Sculpture (Super Subtle & Bottom-Aligned) */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 3;
      pointer-events: none;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease, transform 0.8s ease;
      will-change: left, top;
    }
    .abstract-sun-bloom {
      position: absolute;
      width: 56px;
      height: 56px;
      left: -28px;
      top: -28px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.025) 45%, transparent 72%);
      filter: blur(10px);
    }
    .abstract-sun-outer-ring {
      position: absolute;
      width: 34px;
      height: 34px;
      left: -17px;
      top: -17px;
      animation: rotateOrbital 90s linear infinite;
    }
    .abstract-sun-mid-ring {
      position: absolute;
      width: 18px;
      height: 18px;
      left: -9px;
      top: -9px;
      border-radius: 50%;
      border: 0.75px solid rgba(255, 255, 255, 0.16);
      background: transparent;
      box-shadow: none;
    }
    .abstract-sun-annulus {
      position: absolute;
      width: 7px;
      height: 7px;
      left: -3.5px;
      top: -3.5px;
      border-radius: 50%;
      border: 0.9px solid rgba(255, 255, 255, 0.34);
      background: rgba(255, 255, 255, 0.06);
      box-shadow: none;
    }
    .abstract-sun-singularity {
      position: absolute;
      width: 2px;
      height: 2px;
      left: -1px;
      top: -1px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.55);
      box-shadow: none;
    }
    @keyframes abstractPulse {
      0% { transform: scale(0.96); opacity: 0.65; }
      100% { transform: scale(1.04); opacity: 0.9; }
    }
    @keyframes rotateOrbital {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Abstract Lunar Sculpture (Slightly More Visible + Dynamic Moon Phase) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 4;
      pointer-events: none;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .abstract-moon-bloom {
      position: absolute;
      width: 68px;
      height: 68px;
      left: -34px;
      top: -34px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, rgba(226, 232, 240, 0.06) 48%, transparent 74%);
      filter: blur(12px);
    }
    .abstract-moon-svg {
      position: absolute;
      width: 40px;
      height: 40px;
      left: -20px;
      top: -20px;
      overflow: visible;
    }

    /* 2. LEFT-ALIGNED MONUMENTAL DATE, TIME & SIMPLIFIED WEATHER FORECAST */
    #hero-clock-region {
      position: fixed;
      top: 3.2vh;
      left: 24px;
      margin-left: 0;
      text-align: left;
      z-index: 15;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      justify-content: flex-start;
      gap: 10px;
      line-height: 0.92;
    }
    #hero-time {
      font-size: clamp(4.0rem, 7.6vw, 7.4rem);
      font-weight: 200;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      text-shadow: 0 12px 45px rgba(0, 0, 0, 0.35);
    }
    #hero-seconds {
      font-size: clamp(1.2rem, 2.0vw, 1.9rem);
      font-weight: 300;
      color: rgba(255, 255, 255, 0.56);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #hero-date-row {
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }
    #hero-date {
      font-size: clamp(1.0rem, 1.45vw, 1.38rem);
      font-weight: 300;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    .hero-cal-icon-btn {
      background: transparent;
      border: none;
      color: rgba(248, 250, 252, 0.42);
      padding: 3px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
    }
    .hero-cal-icon-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      transform: translateY(-1px);
    }
    #solar-telemetry {
      display: none;
    }

    /* Simplified Minimal Weather Component (Directly Below Date) */
    #hero-weather-strip {
      margin-top: 6px;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
      padding: 0;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .mw-current-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mw-main-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mw-icon-wrap {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
    }
    .mw-temp-now {
      font-size: 18px;
      font-weight: 400;
      letter-spacing: -0.02em;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
    .mw-cond-text {
      font-size: 12px;
      color: rgba(248, 250, 252, 0.72);
      font-weight: 400;
    }
    .mw-hi-lo {
      font-size: 11.5px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .mw-day-slots {
      display: none !important;
    }

    /* 5. TOP-RIGHT MINIMAL EXPANDABLE SERVICE WIDGETS (health, meals, finances, notes) */
    #top-right-widgets {
      position: fixed;
      top: 3.5vh;
      right: 28px;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 16px;
      max-height: 62vh;
    }
    .ambient-widget {
      text-align: right;
      cursor: pointer;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, padding 0.3s ease;
      border: none;
      background: transparent;
      padding: 2px 0;
      border-radius: 18px;
      max-width: 360px;
    }
    .ambient-widget:hover:not(.expanded) {
      transform: translateX(-4px);
    }
    .ambient-widget.expanded {
      cursor: default;
      padding: 16px 20px;
      background: rgba(6, 10, 22, 0.62);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
      transform: translateX(-4px);
      width: 330px;
    }
    .w-header {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      cursor: pointer;
    }
    .w-label-row {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.52);
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .w-primary {
      font-size: 15px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: #ffffff;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: baseline;
      gap: 8px;
      justify-content: flex-end;
    }
    .w-primary strong {
      font-weight: 500;
    }
    /* Hide verbose sub-lines in minimal preview cards */
    .w-sub {
      display: none;
    }

    /* a) Health Minimal Preview: Heart Icon with HR inside + Progress Circle with Step Count inside */
    .health-minimal-badges {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 2px;
    }
    .hm-badge {
      position: relative;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .hm-badge svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
    }
    .hm-badge-val {
      position: relative;
      z-index: 2;
      font-size: 10.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      letter-spacing: -0.03em;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.75);
      line-height: 1;
    }
    .hm-heart-val {
      padding-bottom: 2px;
    }

    /* b) Finances Minimal Preview: In hidden mode ONLY show eye toggle next to title */
    #widget-finances.finances-is-hidden:not(.expanded) #compact-finances {
      display: none !important;
    }
    .finances-eye-icon-btn {
      background: transparent;
      border: none;
      color: rgba(248, 250, 252, 0.75);
      padding: 0 2px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease, transform 0.2s ease;
    }
    .finances-eye-icon-btn:hover {
      color: #38bdf8;
      transform: scale(1.1);
    }

    .w-expand-body {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transition: max-height 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, margin-top 0.3s ease;
      text-align: left;
    }
    .ambient-widget.expanded .w-expand-body {
      max-height: 360px;
      opacity: 1;
      margin-top: 14px;
    }
    .w-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 18px;
      margin-bottom: 14px;
    }
    .w-stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .w-stat-k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    .w-stat-v {
      font-size: 14px;
      font-weight: 500;
      color: #fff;
    }
    .w-action-link {
      display: inline-block;
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #38bdf8;
      text-decoration: none;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
    }
    .w-action-link:hover { text-decoration: underline; }
    .minimal-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.07);
      border: none;
      border-radius: 10px;
      padding: 8px 11px;
      color: #fff;
      font-size: 12.5px;
      outline: none;
      user-select: text;
    }
    .minimal-input::placeholder { color: rgba(255, 255, 255, 0.38); }
    .note-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 12.5px;
      color: rgba(255, 255, 255, 0.88);
    }
    .note-del {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.35);
      cursor: pointer;
      font-size: 13px;
      padding: 0 4px;
    }
    .note-del:hover { color: #f87171; }

    /* 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER (TRANSPARENT FOR FULL-BLEED HORIZON) */
    #timeline-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: var(--devices-dock-height, 44px);
      height: 28vh;
      min-height: 195px;
      z-index: 20;
      background: transparent;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      transition: bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    /* Whisper-quiet minimal controls right above the timeline */
    #timeline-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 28px 6px 24px;
      font-size: 11px;
      letter-spacing: 0.08em;
      pointer-events: auto;
    }
    .tl-controls {
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0.55;
      transition: opacity 0.25s ease;
    }
    .tl-controls:hover {
      opacity: 0.98;
    }
    .tl-pill {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.55);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 2px 0;
      transition: color 0.2s ease;
    }
    .tl-pill:hover, .tl-pill.active {
      color: #ffffff;
    }
    .tl-pill.return-now {
      color: #38bdf8;
      display: none;
    }

    /* Timeline viewport & moving canvas */
    #timeline-viewport {
      position: relative;
      width: 100vw;
      height: calc(28vh - 28px);
      min-height: 168px;
      overflow-x: clip;
      overflow-y: visible;
      cursor: grab;
      pointer-events: auto;
    }
    #timeline-viewport:active { cursor: grabbing; }

    /* Fixed "NOW" Marker at 25% from left */
    #fixed-now-marker {
      position: absolute;
      left: 25vw;
      top: 6px;
      bottom: 0;
      width: 1.5px;
      background: linear-gradient(
        to bottom,
        rgba(56, 189, 248, 0) 0%,
        #38bdf8 22%,
        #fbbf24 85%,
        rgba(251, 191, 36, 0.2) 100%
      );
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.85);
      z-index: 25;
      pointer-events: none;
    }
    #fixed-now-badge {
      position: absolute;
      top: 4px;
      left: 0;
      transform: translateX(-50%);
      padding: 2px 8px;
      border-radius: 99px;
      background: rgba(56, 189, 248, 0.16);
      backdrop-filter: blur(12px);
      color: #e0f2fe;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      white-space: nowrap;
    }
    #fixed-now-orb {
      position: absolute;
      bottom: 37px;
      left: 0.75px;
      transform: translate(-50%, 50%);
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #fbbf24;
      box-shadow: 0 0 16px 4px rgba(251, 191, 36, 0.9);
    }

    /* Moving World Track */
    #timeline-world {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      will-change: transform;
    }

    /* Horizontal Axis Line (0\xB0 Horizon Line) */
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 38px;
      height: 1px;
      background: rgba(255, 255, 255, 0.22);
      z-index: 5;
      pointer-events: none;
    }

    /* Celestial Altitude Layer (Behind Timeline Ticks & Calendar Events) */
    #timeline-celestial-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      overflow: visible;
    }
    #tl-celestial-svg {
      position: absolute;
      left: 0;
      bottom: 38px;
      width: 1px;
      height: 1px;
      overflow: visible;
      pointer-events: none;
    }
    .tl-horizon-node {
      position: absolute;
      bottom: 38px;
      transform: translate(-50%, 50%);
      pointer-events: none;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .tl-horizon-dot {
      width: 4.5px;
      height: 4.5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.75);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.45);
    }
    .tl-horizon-node.moon-cross .tl-horizon-dot {
      background: rgba(186, 230, 253, 0.72);
    }
    .tl-horizon-time {
      position: absolute;
      top: -15px;
      font-size: 8.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      color: rgba(248, 250, 252, 0.62);
      white-space: nowrap;
      background: rgba(4, 7, 17, 0.58);
      padding: 0.5px 4px;
      border-radius: 3px;
    }
    .tl-horizon-node.moon-cross .tl-horizon-time {
      top: 6px;
      color: rgba(186, 230, 253, 0.55);
    }
    .tl-celestial-body {
      position: absolute;
      width: 34px;
      height: 34px;
      transform: translate(-50%, 50%);
      pointer-events: none;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.35s ease, filter 0.35s ease;
    }
    .tl-celestial-body.below-horizon {
      opacity: 0.36;
      filter: saturate(0.45) brightness(0.72);
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

    /* Hour Ticks & Day Dividers */
    .tl-tick {
      position: absolute;
      bottom: 0;
      height: 38px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      z-index: 6;
    }
    .tl-tick-mark {
      width: 1px;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      margin-bottom: 6px;
    }
    .tl-tick.major .tl-tick-mark {
      height: 11px;
      background: rgba(255, 255, 255, 0.42);
    }
    .tl-tick-label {
      font-size: 10px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.42);
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 165px;
      margin-top: -127px;
      background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.38));
    }
    .tl-tick.day-start .tl-tick-label {
      color: #38bdf8;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10.5px;
    }

    /* 4. GOOGLE CALENDAR EVENT RECTANGLES ON THE TIMELINE (FLAT + LOCATION, ATTENDEES, DESCRIPTION) */
    .tl-event-rect {
      position: absolute;
      height: 54px;
      border-radius: 4px;
      padding: 4px 10px;
      background: rgba(11, 18, 32, 0.94);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-left: 3px solid var(--ev-color, #38bdf8);
      box-shadow: none;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5px;
      overflow: hidden;
      cursor: pointer;
      z-index: 12;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .tl-event-rect:hover {
      background: rgba(19, 30, 52, 0.98);
      border-color: rgba(255, 255, 255, 0.28);
      border-left-color: var(--ev-color, #38bdf8);
      box-shadow: none;
      z-index: 18;
    }
    .tl-event-rect.is-now {
      background: rgba(12, 42, 64, 0.95);
      border-color: rgba(56, 189, 248, 0.42);
      border-left: 3px solid var(--ev-color, #38bdf8);
      box-shadow: none;
    }
    .tl-event-rect.is-past {
      opacity: 0.52;
    }
    .tl-ev-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
    }
    .tl-ev-title {
      font-size: 11.5px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }
    .tl-ev-time {
      font-size: 9.5px;
      font-variant-numeric: tabular-nums;
      color: rgba(248, 250, 252, 0.72);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .tl-ev-meta {
      font-size: 9.5px;
      color: rgba(226, 232, 240, 0.75);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }
    .tl-ev-desc {
      font-size: 9px;
      color: rgba(148, 163, 184, 0.85);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.15;
    }

    /* Quick Event Creator Popover */
    #quick-event-modal {
      position: fixed;
      bottom: 35vh;
      right: 28px;
      z-index: 40;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(28px);
      padding: 18px 22px;
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      display: none;
      width: 320px;
    }

    /* Fullscreen Service Overlay Iframe */
    #full-app-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: #040711;
      display: none;
      flex-direction: column;
    }
    #full-app-bar {
      height: 44px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #060914;
    }
    #full-app-frame {
      flex: 1;
      width: 100%;
      border: none;
    }

    /* 6. BORDERED HIGHER ROOM STATUSBAR + UPWARD FLYOUTS OVER UPPER CONTENT */
    #devices-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 38;
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      display: flex;
      flex-direction: column;
    }

    /* Subtle hairline separator between Timeline and StatusBar */
    #timeline-devices-separator {
      position: relative;
      height: 2px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 28px 0 24px;
      pointer-events: none;
    }
    #timeline-devices-separator::before {
      content: "";
      position: absolute;
      left: 24px;
      right: 28px;
      top: 50%;
      height: 1px;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(56, 189, 248, 0.28) 35%,
        rgba(255, 255, 255, 0.12) 75%,
        rgba(255, 255, 255, 0.06) 100%
      );
      pointer-events: none;
    }
    .td-sep-badge {
      display: none;
    }
    .td-sep-unpin-btn {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 6px;
      color: #38bdf8;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 5px 9px;
      white-space: nowrap;
    }
    .td-sep-unpin-btn:hover {
      background: rgba(56, 189, 248, 0.22);
    }

    /* Pinned Room Groups Tray (Expands upwards OVER upper timeline content) */
    #pinned-rooms-tray {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 24px;
      right: 28px;
      padding: 6px 4px 8px 4px;
      gap: 12px;
      overflow-x: auto;
      scrollbar-width: thin;
      align-items: flex-end;
      z-index: 65;
      pointer-events: auto;
    }
    #pinned-rooms-tray.has-pinned {
      display: flex;
    }
    .pinned-room-card {
      min-width: 265px;
      max-width: 330px;
      flex: 0 0 auto;
      background: rgba(8, 13, 26, 0.94);
      backdrop-filter: blur(24px) saturate(140%);
      -webkit-backdrop-filter: blur(24px) saturate(140%);
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 12px;
      padding: 10px 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.65);
      animation: pinCardIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes pinCardIn {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .prc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .prc-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .prc-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .prc-meta {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .prc-unpin {
      background: rgba(56, 189, 248, 0.14);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      border-radius: 99px;
      padding: 2px 8px;
      font-size: 9px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }
    .prc-unpin:hover {
      background: rgba(248, 113, 113, 0.18);
      border-color: rgba(248, 113, 113, 0.4);
      color: #fca5a5;
    }
    .prc-dev-grid {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 175px;
      overflow-y: auto;
      padding-right: 2px;
    }

    /* Higher & Bordered Room Bar + Right-Aligned 3D Print & Vision Previews */
    #room-dock-bar {
      position: relative;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 28px 6px 24px;
      gap: 12px;
      background: rgba(7, 11, 22, 0.72);
      border-top: 1px solid rgba(255, 255, 255, 0.16);
    }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      flex: 1;
      min-width: 0;
    }
    .room-dock-group::-webkit-scrollbar { display: none; }

    /* Higher, bordered room button */
    .room-pill {
      position: relative;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      padding: 7px 12px;
      color: rgba(248, 250, 252, 0.78);
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s ease;
    }
    .room-pill:hover {
      color: #ffffff;
      background: rgba(30, 41, 59, 0.85);
      border-color: rgba(255, 255, 255, 0.34);
    }
    .room-pill.pinned-tab {
      color: #ffffff;
      font-weight: 600;
      background: rgba(14, 116, 144, 0.32);
      border-color: #38bdf8;
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.94);
      border-color: rgba(251, 191, 36, 0.38);
    }
    .room-pin-ico {
      display: none;
    }
    .room-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.28);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .room-pill.has-on .room-dot {
      background: #fbbf24;
      box-shadow: 0 0 8px rgba(251, 191, 36, 0.85);
    }
    .room-pill.has-motion .room-dot {
      background: #4ade80;
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.85);
    }
    .room-meta {
      font-size: 9.5px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.88);
    }

    /* Right-Aligned StatusBar Previews (3D Print & Vision \u2014 NOT inside tabs, expand upwards) */
    #statusbar-right-previews {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 20px;
      flex-shrink: 0;
      position: relative;
    }
    .sb-preview-item {
      position: relative;
      display: flex;
      align-items: center;
    }
    .sb-preview-trigger {
      background: transparent;
      border: none;
      padding: 4px 0;
      color: rgba(248, 250, 252, 0.78);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.2s ease, opacity 0.2s ease;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
    }
    .sb-preview-trigger:hover,
    .sb-preview-item.expanded .sb-preview-trigger {
      color: #ffffff;
    }
    .sb-preview-meta {
      font-size: 10.5px;
      font-weight: 400;
      letter-spacing: 0.01em;
      text-transform: none;
      color: rgba(248, 250, 252, 0.54);
      font-variant-numeric: tabular-nums;
    }
    .sb-mini-bar {
      width: 34px;
      height: 3.5px;
      border-radius: 99px;
      background: rgba(255, 255, 255, 0.14);
      overflow: hidden;
    }

    /* Upward Flyout Panel for StatusBar Previews (3D Print & Vision) */
    .sb-upward-flyout {
      position: absolute;
      bottom: calc(100% + 14px);
      right: 0;
      width: 340px;
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(6, 10, 22, 0.76);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      border: 1px solid rgba(56, 189, 248, 0.22);
      box-shadow: 0 20px 55px rgba(0, 0, 0, 0.6);
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.98);
      pointer-events: none;
      transition: opacity 0.24s ease, transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.24s;
      z-index: 50;
      text-align: left;
    }
    .sb-preview-item.expanded .sb-upward-flyout {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Device Row Controls inside Pinned Room Cards & Vision Flyout */
    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.035);
      transition: background 0.2s ease;
    }
    .rf-dev-row.is-on {
      background: rgba(251, 191, 36, 0.09);
    }
    .rf-dev-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .rf-dev-label {
      font-size: 11.5px;
      font-weight: 400;
      color: rgba(248, 250, 252, 0.88);
    }
    .rf-dev-row.is-on .rf-dev-label {
      color: #ffffff;
      font-weight: 500;
    }
    .rf-dev-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rf-power-badge {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: none;
      border-radius: 99px;
      padding: 3px 10px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 252, 0.65);
    }
    .rf-toggle-btn.on {
      background: #fbbf24;
      color: #040711;
      box-shadow: 0 0 12px rgba(251, 191, 36, 0.45);
    }
    .rf-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;
    }
    .rf-slider {
      flex: 1;
      accent-color: #38bdf8;
      height: 4px;
      cursor: pointer;
    }
    .rf-effect-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: none;
      border-radius: 99px;
      padding: 2px 7px;
      font-size: 9.5px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: #a855f7;
      color: #fff;
    }
    .w-3d-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .w-3d-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      flex: 1;
      min-width: 0;
    }

    /* ============================================================================
       7. RESPONSIVE & MOBILE-COMPATIBLE LAYOUT (TABLET, LANDSCAPE & SMARTPHONE)
       ============================================================================ */
    @media (max-width: 1180px) and (min-width: 901px) {
      :root {
        --nav-safe-left: 0px;
      }
      #hero-time {
        font-size: clamp(3.5rem, 6.2vw, 5.8rem);
      }
      #hero-weather-strip {
        max-width: min(390px, 44vw);
      }
      #top-right-widgets {
        right: 2.5vw;
        gap: 12px;
      }
      .ambient-widget.expanded {
        width: 310px;
      }
    }

    @media (max-height: 540px) and (orientation: landscape) {
      :root {
        --nav-safe-left: 0px;
      }
      html, body {
        width: 100vw;
        height: 100dvh;
        overflow: hidden;
      }
      #sky-stage {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
      }
      #hero-clock-region {
        top: 12px;
        left: 18px;
        margin-left: 0;
      }
      #hero-time {
        font-size: clamp(2.4rem, 6vw, 3.6rem);
      }
      #timeline-dock {
        height: 155px;
        background: transparent !important;
      }
      #timeline-viewport {
        height: 120px;
      }
    }

    @media (max-width: 900px) {
      :root {
        --nav-safe-left: 0px;
        --devices-dock-height: 52px;
      }
      html, body {
        width: 100%;
        height: auto;
        min-height: 100dvh;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: calc(var(--devices-dock-height, 52px) + env(safe-area-inset-bottom, 10px) + 18px);
      }
      #sky-stage {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
      }

      /* Scale celestial sculptures slightly on mobile screens */
      #sun-assembly,
      #moon-assembly {
        transform: scale(0.82);
      }

      /* Left-aligned Clock & Simplified Weather at top of mobile view */
      #hero-clock-region {
        position: relative;
        top: auto;
        left: auto;
        margin-left: 0;
        width: 100%;
        padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 6px 16px;
        text-align: left;
        z-index: 15;
        pointer-events: auto;
      }
      #hero-time {
        font-size: clamp(3.1rem, 13vw, 4.6rem);
      }
      #hero-seconds {
        font-size: clamp(1.1rem, 4vw, 1.5rem);
      }
      #hero-date {
        margin-top: 4px;
        font-size: clamp(0.95rem, 3.6vw, 1.2rem);
      }
      #solar-telemetry {
        font-size: 10px;
        line-height: 1.4;
      }
      #hero-weather-strip {
        display: flex;
        width: 100%;
        max-width: 100%;
        margin-top: 8px;
        padding: 0;
        background: transparent;
        border: none;
      }
      .mw-current-row {
        flex-wrap: wrap;
        gap: 8px 10px;
      }
      .mw-day-slots {
        gap: 10px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .mw-day-slots::-webkit-scrollbar {
        display: none;
      }

      /* Responsive Grid for Top-Right Service Preview Widgets on Mobile */
      #top-right-widgets {
        position: relative;
        top: auto;
        right: auto;
        width: 100%;
        max-height: none;
        padding: 8px 16px 10px 16px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
        z-index: 25;
      }
      .ambient-widget {
        text-align: left;
        width: 100%;
        max-width: 100%;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(6, 11, 24, 0.28);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .ambient-widget:hover:not(.expanded) {
        transform: none;
      }
      .ambient-widget.expanded {
        grid-column: 1 / -1;
        width: 100%;
        max-width: 100%;
        padding: 15px 16px;
        background: rgba(6, 10, 22, 0.86);
        border: 1px solid rgba(56, 189, 248, 0.28);
        transform: none;
      }
      .ambient-widget.expanded .w-expand-body {
        max-height: 460px;
      }
      #widget-finances .w-expand-body {
        min-width: 0 !important;
        width: 100%;
      }
      .w-header {
        align-items: flex-start;
        width: 100%;
      }
      .w-label-row {
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px 6px;
      }
      .health-minimal-badges {
        justify-content: flex-start;
      }
      .w-primary {
        justify-content: flex-start;
        font-size: 14px;
        flex-wrap: wrap;
        gap: 4px 8px;
        text-align: left;
      }

      /* Mobile Timeline Section (Transparent to show Horizon background) */
      #timeline-dock {
        position: relative;
        left: auto;
        right: auto;
        bottom: auto;
        width: 100%;
        height: 205px;
        min-height: 195px;
        margin-top: 4px;
        background: transparent !important;
      }
      #timeline-toolbar {
        padding: 4px 16px 8px 16px;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tl-controls {
        opacity: 0.92;
        gap: 6px;
      }
      .tl-pill {
        padding: 4px 8px;
        font-size: 10.5px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.06);
      }
      .tl-pill.active {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
      }
      #timeline-viewport {
        width: 100%;
        height: 165px;
        min-height: 160px;
        touch-action: pan-y;
      }

      /* Mobile Transparent Bottom StatusBar + Pinnable Room Tabs */
      #devices-dock {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 40;
        padding-bottom: env(safe-area-inset-bottom, 4px);
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }
      #timeline-devices-separator {
        padding: 0 12px;
        height: 16px;
      }
      #timeline-devices-separator::before {
        left: 12px;
        right: 12px;
      }
      #pinned-rooms-tray {
        padding: 6px 12px 8px 12px;
        gap: 10px;
        max-height: 44vh;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x mandatory;
      }
      .pinned-room-card {
        min-width: min(285px, 84vw);
        max-width: 86vw;
        scroll-snap-align: center;
      }
      .prc-dev-grid {
        max-height: 26vh;
        -webkit-overflow-scrolling: touch;
      }
      #room-dock-bar {
        height: 36px;
        padding: 0 12px;
        gap: 6px;
      }
      .room-pill {
        padding: 4px 8px;
        font-size: 10.5px;
        flex-shrink: 0;
      }
      .sb-upward-flyout {
        right: 0;
        width: min(330px, 92vw);
      }

      /* Mobile Modals & Overlays */
      #quick-event-modal {
        left: 12px;
        right: 12px;
        bottom: calc(var(--devices-dock-height, 52px) + 12px);
        width: auto;
        max-width: 420px;
        margin: 0 auto;
      }
      #full-app-overlay {
        height: 100dvh;
      }
      #full-app-bar {
        padding: calc(env(safe-area-inset-top, 0px)) 14px 0 14px;
        min-height: 46px;
      }
    }

    @media (max-width: 480px) {
      #hero-clock-region {
        padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px 4px 12px;
      }
      #top-right-widgets {
        padding: 6px 12px 8px 12px;
        gap: 8px;
      }
      .ambient-widget {
        padding: 9px 11px;
      }
      .w-stat-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px 10px;
      }
      .mw-temp-now {
        font-size: 18px;
      }
      #quick-import-flyout-modal > div {
        width: 100vw !important;
        height: 100dvh !important;
      }
    }

    /* HORIZON CENTERED ROUNDED CORTEX PROMPT BAR */
    #horizon-cortex-center-stage {
      position: fixed;
      left: 50%;
      top: 45%;
      transform: translate(-50%, -50%);
      width: min(670px, 90vw);
      z-index: 55;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-prompt-pill {
      position: relative;
      width: 100%;
      height: 54px;
      border-radius: 9999px;
      background: rgba(11, 17, 32, 0.78);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      padding: 0 7px 0 18px;
      gap: 12px;
      transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-prompt-pill:hover {
      background: rgba(14, 22, 42, 0.88);
      border-color: rgba(56, 189, 248, 0.38);
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.65), 0 0 20px rgba(56, 189, 248, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .cortex-prompt-pill:focus-within {
      background: rgba(10, 16, 32, 0.95);
      border-color: rgba(56, 189, 248, 0.68);
      box-shadow: 0 20px 54px rgba(0, 0, 0, 0.78), 0 0 32px rgba(56, 189, 248, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    /* Animated shimmering border while waiting for Gemini response */
    .cortex-prompt-pill.is-waiting {
      border-color: transparent !important;
      background: linear-gradient(rgba(10, 16, 32, 0.96), rgba(10, 16, 32, 0.96)) padding-box,
                  linear-gradient(90deg, #38bdf8, #a855f7, #38bdf8, #10b981, #38bdf8) border-box !important;
      background-size: 200% 100% !important;
      animation: geminiBorderFlow 2s linear infinite, geminiPulseGlow 1.6s ease-in-out infinite alternate !important;
      transform: translateY(-2px);
    }

    @keyframes geminiBorderFlow {
      0% { background-position: 0% 0%; }
      100% { background-position: 200% 0%; }
    }

    @keyframes geminiPulseGlow {
      0% { box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.2); }
      100% { box-shadow: 0 20px 52px rgba(0, 0, 0, 0.8), 0 0 36px rgba(168, 85, 247, 0.38); }
    }

    .cortex-ai-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
      flex-shrink: 0;
      transition: all 0.3s ease;
    }

    .cortex-prompt-pill:focus-within .cortex-ai-icon-wrap {
      transform: scale(1.12);
      color: #7dd3fc;
    }

    .cortex-prompt-pill.is-waiting .cortex-ai-icon-wrap {
      animation: spinSlow 3s linear infinite;
      color: #c084fc;
    }

    @keyframes spinSlow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .cortex-prompt-input {
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      color: #f8fafc;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 450;
      letter-spacing: -0.01em;
    }

    .cortex-prompt-input::placeholder {
      color: rgba(248, 250, 252, 0.40);
      font-size: 13.5px;
      font-weight: 400;
    }

    .cortex-waiting-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #bae6fd;
      font-size: 11px;
      font-family: var(--font-sans);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cortex-waiting-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38bdf8;
      animation: pulseDot 1s ease-in-out infinite alternate;
    }

    @keyframes pulseDot {
      from { opacity: 0.4; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1.2); }
    }

    .cortex-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #38bdf8, #0284c7);
      border: none;
      color: #040711;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(56, 189, 248, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cortex-send-btn:hover:not(:disabled) {
      transform: scale(1.08);
      background: linear-gradient(135deg, #7dd3fc, #38bdf8);
      box-shadow: 0 4px 16px rgba(56, 189, 248, 0.55);
    }

    .cortex-send-btn:active:not(:disabled) {
      transform: scale(0.94);
    }

    .cortex-send-btn:disabled {
      opacity: 0.45;
      cursor: default;
      transform: none;
    }

    /* DROPDOWN PREVIEW PANEL */
    #cortex-preview-dropdown {
      width: 100%;
      margin-top: 10px;
      border-radius: 20px;
      background: rgba(10, 16, 32, 0.94);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(56, 189, 248, 0.24);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.08);
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      animation: fadeInDown 0.18s ease-out;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cortex-preview-item {
      padding: 9px 13px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.15s ease;
    }

    .cortex-preview-item:hover {
      background: rgba(56, 189, 248, 0.14);
      border-color: rgba(56, 189, 248, 0.38);
      transform: translateX(3px);
    }

    .cortex-preview-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .cortex-badge-tag {
      font-size: 10px;
      font-family: var(--font-mono, monospace);
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 5px;
      background: rgba(56, 189, 248, 0.18);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      flex-shrink: 0;
    }

    /* RESPONSE FLYOUT CARD */
    #cortex-response-card {
      width: 100%;
      margin-top: 12px;
      border-radius: 20px;
      background: rgba(10, 16, 32, 0.96);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(56, 189, 248, 0.32);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.85), 0 0 35px rgba(56, 189, 248, 0.15);
      max-height: 480px;
      overflow-y: auto;
      padding: 18px 22px;
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: fadeInDown 0.2s ease-out;
    }

    .cortex-resp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 10px;
      gap: 10px;
    }

    .cortex-resp-body {
      font-size: 13px;
      line-height: 1.65;
      color: rgba(248, 250, 252, 0.88);
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--font-sans);
    }
    .cortex-resp-body h1, .cortex-resp-body h2, .cortex-resp-body h3 {
      color: #f8fafc;
      margin: 12px 0 6px 0;
      font-size: 14.5px;
    }
    .cortex-resp-body pre, .cortex-resp-body code {
      font-family: var(--font-mono, monospace);
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      color: #bae6fd;
    }
    .cortex-resp-body pre {
      padding: 10px;
      display: block;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <!-- TOOLBAR HIDDEN ALTOGETHER PER USER REQUEST (KEPT FOR DOM ID COMPATIBILITY ONLY) -->
  <nav id="left-ambient-navbar" aria-hidden="true" style="display:none !important;">
    <button class="lnav-item active" id="lnav-horizon" onclick="closeFullService()"></button>
    <button class="lnav-item" id="lnav-google-calendar" onclick="openFullService('google-calendar', 'Calendar')"></button>
    <button class="lnav-item" id="lnav-google-health" onclick="openFullService('google-health', 'Health')"></button>
    <button class="lnav-item" id="lnav-finance-analytics" onclick="openFullService('finance-analytics', 'thassi.finances')"></button>
    <button class="lnav-item" id="lnav-meal-planner" onclick="openFullService('meal-planner', 'Meals')"></button>
    <button class="lnav-item" id="lnav-smart-canvas" onclick="openFullService('smart-canvas', 'Smart Home')"></button>
    <button class="lnav-item" id="lnav-camera-vision" onclick="openFullService('camera-vision', 'Camera Vision')"></button>
    <button class="lnav-item" id="lnav-3d-print" onclick="openFullService('3d-print', '3D Druck Studio')"></button>
    <button class="lnav-item" id="lnav-memo" onclick="openFullService('memo', 'Memo')"></button>
    <button class="lnav-item" id="lnav-cortex" onclick="openFullService('cortex', 'Cortex')"></button>
  </nav>

  <!-- 1. LIVING SKY, SUBTLE WEATHER EFFECTS & ABSTRACT CELESTIAL HORIZON -->
  <div id="sky-stage">
    <div id="starfield"></div>
    <div id="weather-fx-layer">
      <div id="weather-cloud-veil-1"></div>
      <div id="weather-cloud-veil-2"></div>
      <canvas id="weather-fx-canvas"></canvas>
    </div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none" style="display:none;"></svg>
    <div id="moon-assembly" style="display:none;"></div>
    <div id="sun-assembly" style="display:none;"></div>
  </div>

  <!-- 2. LEFT-ALIGNED DATE, TIME & SIMPLIFIED WEATHER IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date-row">
      <div id="hero-date"></div>
      <button class="hero-cal-icon-btn" onclick="openFullService('google-calendar', 'Calendar')" title="Open Calendar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
    </div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>

    <!-- SIMPLIFIED WEATHER FORECAST FOR ST. VEIT / G\xD6LSEN (CURRENT WEATHER ONLY) -->
    <div id="hero-weather-strip" title="St. Veit an der G\xF6lsen">
      <div class="mw-current-row">
        <div class="mw-icon-wrap" id="mw-current-icon"></div>
        <div class="mw-temp-now" id="mw-current-temp">--\xB0</div>
        <div class="mw-cond-text" id="mw-current-desc">--</div>
        <div class="mw-hi-lo" id="mw-hi-lo">--\xB0 / --\xB0</div>
      </div>
    </div>
  </div>

  <!-- 5. TOP-RIGHT MINIMAL EXPANDABLE SERVICE WIDGETS: (1) health, (2) meals, (3) finances, (4) notes -->
  <div id="top-right-widgets">
    <!-- 1. HEALTH WIDGET (MINIMAL: HEART ICON WITH HR INSIDE + PROGRESS RING WITH STEP COUNT INSIDE) -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>health</span>
          <span class="w-dot" id="dot-health" style="background:#4ade80; box-shadow:0 0 10px #4ade80;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('google-health', 'Health')" title="Open Health View">\u2197</button>
        </div>
        <div class="health-minimal-badges">
          <!-- Heart icon with Heart Rate number inside -->
          <div class="hm-badge" title="Heart Rate (bpm)">
            <svg class="hm-heart-svg" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    fill="rgba(244, 63, 94, 0.24)"
                    stroke="#fb7185"
                    stroke-width="1.35" />
            </svg>
            <span class="hm-badge-val" id="health-hr-inside">--</span>
          </div>
          <!-- Progress circle with Step Count number inside -->
          <div class="hm-badge" title="Steps Today">
            <svg class="hm-ring-svg" viewBox="0 0 44 44">
              <circle class="hm-ring-bg" cx="22" cy="22" r="18.5"></circle>
              <circle class="hm-ring-fg" id="health-steps-ring" cx="22" cy="22" r="18.5"></circle>
            </svg>
            <span class="hm-badge-val" id="health-steps-inside">--</span>
          </div>
        </div>
        <div class="w-primary" id="compact-health" style="display:none;">--</div>
        <div class="w-sub" id="sub-health" style="display:none;">Pixel 10 Health Connect</div>
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
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Open Health \u2192</button>
      </div>
    </div>

    <!-- 2. MEALS WIDGET (MOVED DIRECTLY BELOW HEALTH) -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>meals</span>
          <span class="w-dot" id="dot-meals" style="background:#fb923c; box-shadow:0 0 10px #fb923c;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('meal-planner', 'Meals')" title="Open Meals View">\u2197</button>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12.5px; color:rgba(255,255,255,0.85); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Open Meals \u2192</button>
      </div>
    </div>

    <!-- 3. FINANCES WIDGET (IN HIDDEN MODE: ONLY SHOW EYE TOGGLE NEXT TO PREVIEW TITLE) -->
    <div class="ambient-widget finances-is-hidden" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row" style="gap:6px;">
          <span>finances</span>
          <button id="finances-eye-btn"
                  class="finances-eye-icon-btn"
                  onclick="toggleFinancesVisibility(event)"
                  title="Finanzdaten ein-/ausblenden">
            \u{1F441}\uFE0F
          </button>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7; display:none;"></span>
          <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('finance-analytics', 'thassi.finances')" title="Open Finances View">\u2197</button>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">\u2022\u2022\u2022\u2022 \u20AC</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()" style="min-width:270px;">
        <div id="finances-preview-dynamic"
              onclick="toggleFinancesVisibility(event)"
              title="Klicken, um Zahlen ein-/auszublenden"
              style="display:flex; flex-direction:column; gap:8px; cursor:pointer; margin-bottom:10px;">
          <div class="w-stat-grid">
            <div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" id="ef-bal" style="color:#38bdf8;">\u2022\u2022\u2022\u2022 \u20AC</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag / Woche)</span><span class="w-stat-v" id="ef-exp" style="color:#f87171;">\u2022\u2022\u2022\u2022 \u20AC</span></div>
          </div>
        </div>
        <div id="finances-quick-import-slot" style="margin-bottom:8px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.07); padding-top:8px;">
          <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="toggleFinancesVisibility(event)" id="finances-toggle-link">\u{1F441}\uFE0F Anzeigen</button>
          <button class="w-action-link" style="margin:0; color:#94a3b8;" onclick="openFullService('finance-analytics', 'thassi.finances', '#preview-config')">\u{1F39B}\uFE0F Preview</button>
          <button class="w-action-link" style="margin:0;" onclick="openFullService('finance-analytics', 'thassi.finances')">Finances \u2192</button>
        </div>
      </div>
    </div>

    <!-- 4. NOTES WIDGET (LAST POSITION AMONG TOP-RIGHT PREVIEWS) -->
    <div class="ambient-widget" id="widget-notes" onclick="toggleWidget('notes', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>notes</span>
          <span class="w-dot" id="dot-notes" style="background:#fbbf24; box-shadow:0 0 10px #fbbf24;"></span>
        </div>
        <div class="w-primary" id="compact-notes">0 notes</div>
        <div class="w-sub" id="sub-notes">Tap to capture a note</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <form onsubmit="addNote(event)" style="margin-bottom:10px;">
          <input id="note-input" class="minimal-input" placeholder="Write a note & press Enter..." />
        </form>
        <div id="notes-list" style="max-height:160px; overflow-y:auto;"></div>
      </div>
    </div>
  </div>

  <!-- QUICK IMPORT ONLINE-BANKING POPUP FLYOUT -->
  <div id="quick-import-flyout-modal"
       onclick="closeQuickImportFlyout()"
       style="position:fixed; inset:0; z-index:95; background:rgba(4,7,17,0.68); backdrop-filter:blur(8px); display:none; justify-content:flex-end;">
    <div onclick="event.stopPropagation()"
         style="width:min(540px, 95vw); height:100vh; background:#0b1120; border-left:1px solid #1e293b; display:flex; flex-direction:column; box-shadow:-20px 0 60px rgba(0,0,0,0.75);">
      <div style="padding:16px 20px; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; background:#0f172a;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#f8fafc;">\u26A1 Quick Import \u2014 Online-Banking Flyout</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Sparkasse George Auto-Login, Cookie-Tresor &amp; automatischer Datei-Import</div>
        </div>
        <button onclick="closeQuickImportFlyout()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px;">\u2715</button>
      </div>
      <div style="padding:14px 18px; display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid #1e293b; background:#0b1120;">
        <button onclick="launchBankingPopupFromDashboard()"
                style="padding:8px 13px; border-radius:9px; border:1px solid #38bdf8; background:linear-gradient(135deg,#0284c7,#2563eb); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
          \u{1FA9F} Banking-Popup \xF6ffnen
        </button>
        <button onclick="triggerDashboardQuickImportSample()"
                style="padding:8px 13px; border-radius:9px; border:1px solid rgba(16,185,129,0.45); background:rgba(16,185,129,0.15); color:#34d399; font-size:12px; font-weight:700; cursor:pointer;">
          \u26A1 George Export herunterladen &amp; Auto-Import
        </button>
        <button onclick="triggerDashboardDownloadsScan()"
                style="padding:8px 12px; border-radius:9px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; font-size:11.5px; font-weight:600; cursor:pointer;">
          \u{1F4C2} Downloads scannen
        </button>
      </div>
      <div id="qi-dash-status" style="display:none; margin:10px 18px 0; padding:9px 12px; border-radius:9px; font-size:12px; font-weight:600;"></div>
      <div style="flex:1; padding:12px 18px; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <iframe id="qi-dash-frame"
                src="about:blank"
                style="flex:1; width:100%; border:1px solid #1e293b; border-radius:12px; background:#090d16;"></iframe>
        <label style="padding:10px 14px; border-radius:10px; border:1px dashed #38bdf8; background:rgba(56,189,248,0.06); text-align:center; font-size:12px; color:#cbd5e1; cursor:pointer;">
          \u{1F4E5} Bank-Export (.csv, .xml, .sta) hier ablegen oder klicken f\xFCr sofortigen Auto-Import
          <input type="file" accept=".csv,.xml,.sta,.mt940,.json,.txt" onchange="handleDashboardQuickFileSelect(event)" style="display:none;" />
        </label>
      </div>
    </div>
  </div>

  <!-- QUICK EVENT MODAL -->
  <div id="quick-event-modal">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#38bdf8;">New Event</span>
      <button onclick="toggleEventModal(false)" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer;">\u2715</button>
    </div>
    <form onsubmit="createQuickEvent(event)" style="display:flex; flex-direction:column; gap:10px;">
      <input id="qe-title" class="minimal-input" placeholder="Event title..." required />
      <input id="qe-start" type="datetime-local" class="minimal-input" required />
      <div style="display:flex; gap:8px;">
        <input id="qe-dur" type="number" value="60" min="15" step="15" class="minimal-input" placeholder="Minutes" />
        <button type="submit" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 16px; font-weight:600; font-size:12px; cursor:pointer; white-space:nowrap;">Add</button>
      </div>
    </form>
  </div>

  <!-- CENTERED ROUNDED CORTEX PROMPT BAR WITH LIVE PREVIEWS & GEMINI INTEGRATION -->
  <div id="horizon-cortex-center-stage">
    <div class="cortex-prompt-pill" id="cortex-prompt-pill">
      <div class="cortex-ai-icon-wrap" id="cortex-ai-icon" title="Cortex & Google Gemini">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
      </div>
      <input type="text"
             class="cortex-prompt-input"
             id="cortex-prompt-input"
             placeholder="Frag Cortex oder durchsuche Memo, Termine, Smart Home & Finanzen..."
             autocomplete="off"
             spellcheck="false" />
      <div id="cortex-status-badge" style="display:none;" class="cortex-waiting-pill">
        <span class="cortex-waiting-dot"></span>
        <span id="cortex-status-text">Denke nach...</span>
      </div>
      <button class="cortex-send-btn" id="cortex-send-btn" onclick="submitCortexPrompt()" title="An Gemini API senden (Enter)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>

    <!-- LIVE SEARCH PREVIEWS DROPDOWN -->
    <div id="cortex-preview-dropdown"></div>

    <!-- GEMINI EXPANDABLE RESPONSE CARD -->
    <div id="cortex-response-card"></div>
  </div>

  <!-- 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER & GCAL EVENT RECTANGLES -->
  <div id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <button class="tl-pill return-now" id="btn-live-now" onclick="snapToLiveNow()">\u21BA Return to Now</button>
      </div>
      <div class="tl-controls">
        <button class="tl-pill" id="zoom-12" onclick="setTimelineSpan(12)">12h</button>
        <button class="tl-pill active" id="zoom-24" onclick="setTimelineSpan(24)">24h</button>
        <button class="tl-pill" id="zoom-72" onclick="setTimelineSpan(72)">3d</button>
        <button class="tl-pill" id="zoom-168" onclick="setTimelineSpan(168)">7d</button>
        <button class="tl-pill" onclick="toggleEventModal(true)" title="New Calendar Event">+</button>
      </div>
    </div>

    <div id="timeline-viewport">
      <!-- Fixed NOW vertical marker -->
      <div id="fixed-now-marker">
        <div id="fixed-now-badge">NOW</div>
        <div id="fixed-now-orb"></div>
      </div>

      <!-- Continuously moving timeline track (0\xB0 Horizon Line + Altitude Curves + Events) -->
      <div id="timeline-world">
        <div id="timeline-celestial-layer">
          <svg id="tl-celestial-svg" overflow="visible">
            <path id="tl-moon-below-path" fill="none" stroke="rgba(186, 230, 253, 0.20)" stroke-width="1.0" stroke-dasharray="3 5" />
            <path id="tl-moon-above-path" fill="none" stroke="rgba(224, 242, 254, 0.48)" stroke-width="1.25" />
            <path id="tl-sun-below-path" fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.05" stroke-dasharray="3 5" />
            <path id="tl-sun-above-path" fill="none" stroke="rgba(255, 255, 255, 0.62)" stroke-width="1.4" />
          </svg>
          <div id="tl-horizon-crossings"></div>
          <div id="tl-moon-node" class="tl-celestial-body" title="Mond"></div>
          <div id="tl-sun-node" class="tl-celestial-body" title="Sonne &amp; Wetter"></div>
        </div>
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </div>

  <!-- 6. BORDERED HIGHER ROOM STATUSBAR + UPWARD FLYOUTS OVER UPPER CONTENT -->
  <div id="devices-dock">
    <div id="timeline-devices-separator"></div>

    <!-- Pinned Room Groups Tray (floats over upper timeline content when rooms are pinned) -->
    <div id="pinned-rooms-tray"></div>

    <!-- Higher, bordered Room StatusBar: Left = Smart Home Button + Room Buttons, Right = 3D Print & Vision Previews -->
    <div id="room-dock-bar">
      <button class="room-pill" onclick="openFullService('smart-canvas', 'Smart Home')" title="Open Smart Home View" style="border-color:rgba(56,189,248,0.42); color:#e0f2fe; flex-shrink:0;">
        \u2302 Smart Home \u2197
      </button>
      <button class="room-pill" onclick="openFullService('memo', 'Memo')" title="Open Memo Knowledge Base" style="border-color:rgba(255,255,255,0.18); color:#f8fafc; flex-shrink:0;">
        Memo \u2197
      </button>
      <button class="room-pill" onclick="openFullService('cortex', 'Cortex')" title="Open Cortex Gemini Workspace" style="border-color:rgba(255,255,255,0.18); color:#f8fafc; flex-shrink:0;">
        Cortex \u2197
      </button>
      <div class="room-dock-group" id="room-pills-container"></div>
      <button class="td-sep-unpin-btn" id="btn-unpin-all-rooms" onclick="unpinAllRooms()" style="display:none; flex-shrink:0;">Alle minimieren</button>

      <!-- Right-aligned StatusBar Previews (3D Print & Vision only; Projekte & n8n removed per screenshot) -->
      <div id="statusbar-right-previews">
        <!-- 3D PRINT STATUSBAR PREVIEW (UPWARD FLYOUT) -->
        <div class="sb-preview-item" id="widget-3dprint">
          <div style="display:inline-flex; align-items:center; gap:2px;">
            <button class="sb-preview-trigger" onclick="toggleWidget('3dprint', event)" title="3D Druck Vorschau ein-/ausklappen">
              <span class="room-dot" id="dot-3dprint" style="background:#00AE42; box-shadow:0 0 8px #00AE42;"></span>
              <span id="print3d-dock-dot" style="display:none;"></span>
              <span>3D Druck</span>
              <span class="sb-meta" id="print3d-dock-meta">Bambu P1S</span>
              <span class="sb-caret">\u25B4</span>
            </button>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('3d-print', '3D Druck Studio')" title="Open 3D Druck Studio">\u2197</button>
          </div>
          <div class="sb-upward-flyout" onclick="event.stopPropagation()">
            <div class="w-label-row" style="justify-content:space-between; margin-bottom:8px;">
              <span>3d druck \xB7 bambulab</span>
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('3d-print', '3D Druck Studio')">Studio \u2197</button>
            </div>
            <div class="w-3d-row">
              <div style="position:relative; width:82px; height:64px; border-radius:12px; background:rgba(4,7,17,0.72); border:1px solid rgba(56,189,248,0.22); overflow:hidden; flex-shrink:0;"
                   title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)">
                <canvas id="mini-3d-canvas" width="164" height="128" style="width:82px; height:64px; display:block; cursor:grab; touch-action:none;"></canvas>
              </div>
              <div class="w-3d-info">
                <div class="w-primary" id="compact-3dprint" style="font-size:14.5px; justify-content:flex-start;">Kein Projekt aktiv</div>
                <div class="w-sub" id="sub-3dprint" style="display:block; text-align:left;">Platzhalter \xB7 0% Leerlauf</div>
                <div style="width:100%; height:5px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:6px;">
                  <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #00AE42, #38bdf8); transition:width 0.35s ease;"></div>
                </div>
              </div>
            </div>
            <div class="w-stat-grid" style="margin-bottom:10px;">
              <div class="w-stat-item"><span class="w-stat-k">Drucker / Modus</span><span class="w-stat-v" id="e3d-printer">Bambu Lab P1S</span></div>
              <div class="w-stat-item"><span class="w-stat-k">Fortschritt / Layer</span><span class="w-stat-v" id="e3d-layer" style="color:#00AE42;">0% (0/0)</span></div>
              <div class="w-stat-item"><span class="w-stat-k">Ma\xDFe / Gewicht</span><span class="w-stat-v" id="e3d-dims">--</span></div>
              <div class="w-stat-item"><span class="w-stat-k">D\xFCse / Heizbett</span><span class="w-stat-v" id="e3d-temps">24\xB0C / 24\xB0C</span></div>
            </div>
            <form onsubmit="submitMini3dPrompt(event)" style="display:flex; gap:6px; margin-bottom:10px;">
              <input id="mini-3d-prompt" class="minimal-input" placeholder="Prompt: 3D-Objekt \xE4ndern oder neu erstellen\u2026" />
              <button type="submit" id="mini-3d-prompt-btn" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 12px; font-weight:700; font-size:11.5px; cursor:pointer; white-space:nowrap;">KI</button>
            </form>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <button class="w-action-link" style="color:#fbbf24; margin:0;" onclick="toggleMini3dPlaceholder()" id="btn-mini-3d-toggle">Platzhalter testen</button>
              <button class="w-action-link" style="color:#4ade80; margin:0;" onclick="triggerMini3dPrint()" id="btn-mini-3d-print">\u{1F5A8}\uFE0F Druck starten</button>
              <button class="w-action-link" style="margin:0;" onclick="openFullService('3d-print', '3D Druck Studio')">3D Editor \u2192</button>
            </div>
          </div>
        </div>

        <!-- VISION STATUSBAR PREVIEW (UPWARD FLYOUT) -->
        <div class="sb-preview-item" id="widget-vision">
          <div style="display:inline-flex; align-items:center; gap:2px;">
            <button class="sb-preview-trigger" onclick="toggleWidget('vision', event)" title="Camera Vision Vorschau ein-/ausklappen">
              <span class="room-dot" id="vision-dock-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
              <span>Vision</span>
              <span class="sb-meta" id="vision-dock-meta">Zyklisch</span>
              <span class="sb-caret">\u25B4</span>
            </button>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('camera-vision', 'Camera Vision')" title="Open Camera Vision">\u2197</button>
          </div>
          <div class="sb-upward-flyout" onclick="event.stopPropagation()">
            <div class="w-label-row" style="justify-content:space-between; margin-bottom:8px;">
              <span>camera vision \xB7 objekterkennung</span>
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('camera-vision', 'Camera Vision')">Streams \u2197</button>
            </div>
            <div id="vision-flyout-summary" style="font-size:11.5px; color:rgba(248,250,252,0.82); margin-bottom:8px; line-height:1.45;">
              Zyklischer Snapshot-Scan aktiv
            </div>
            <div id="vision-flyout-cameras" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; max-height:180px; overflow-y:auto;"></div>
            <button class="w-action-link" style="margin:0;" onclick="openFullService('camera-vision', 'Camera Vision')">Open Camera Vision \u2192</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- FULL SERVICE OVERLAY (WHEN LAUNCHING FULL VIEW) -->
  <div id="full-app-overlay">
    <div id="full-app-bar">
      <button onclick="closeFullService()" style="background:none; border:none; color:#38bdf8; font-size:12.5px; font-weight:500; cursor:pointer;">\u2190 Back to Horizon</button>
      <span id="full-app-title" style="font-size:12.5px; font-weight:500; color:rgba(255,255,255,0.65);"></span>
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

      document.getElementById('sky-stage').style.background = palette.sky;
      document.getElementById('horizon-glow').style.background = palette.glow;
      document.getElementById('starfield').style.opacity = String(palette.stars);

      if (window.syncThassiSidebarSky) {
        window.syncThassiSidebarSky(palette.sidebarBg);
      }

      const lunarInfo = computeLunarPhaseInfo(now);
      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  \xB7  Sunrise 06:45  \xB7  Sunset 18:30  \xB7  \${lunarInfo.phaseLabel}\`;

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

      document.getElementById('hero-time').textContent = \`\${hh}:\${mm}\`;
      document.getElementById('hero-seconds').textContent = ss;
      document.getElementById('hero-date').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      document.getElementById('fixed-now-badge').textContent = \`NOW \xB7 \${hh}:\${mm}\`;

      updateSkyAndSun(now);

      const pxPerMs = getPxPerMs();
      const nowOffsetFromBasePx = (now.getTime() + panOffsetMs - timelineBaseEpochMs) * pxPerMs;
      const fixedNowX = window.innerWidth * NOW_ANCHOR_RATIO;
      const worldTranslateX = fixedNowX - nowOffsetFromBasePx;
      document.getElementById('timeline-world').style.transform = \`translate3d(\${worldTranslateX.toFixed(2)}px, 0, 0)\`;
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
          const hasOn = r.activeCount > 0;
          const hasMotion = Boolean(r.motionActive);
          const isPinned = pinnedRoomIds.has(r.id);

          const metaParts = [];
          if (r.tempC != null) metaParts.push(r.tempC.toFixed(1) + '\xB0');
          if (r.activeCount > 0) metaParts.push(r.activeCount + ' an');
          if (r.totalPowerW > 0.5) metaParts.push(Math.round(r.totalPowerW) + 'W');

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isPinned ? 'pinned-tab' : ''}"
                    title="\${isPinned ? 'Klicken zum Minimieren (Entpinnen)' : 'Klicken zum Anheften (Pinnen) der Raum-Ger\xE4te'}"
                    onclick="toggleRoomPin('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${metaParts.length > 0 ? \`<span class="room-meta">\${metaParts.join(' \xB7 ')}</span>\` : ''}
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
          vCamsEl.innerHTML = '<div style="font-size:11px; color:rgba(255,255,255,0.45);">Keine Kameras verbunden</div>';
        }
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
              <span class="rf-dev-label">\${d.label}</span>
              <div class="rf-dev-right">
                <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                  \${camLive ? 'Aktiv' : 'QR-Auth'}
                </span>
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

    async function loadRoomsQuickAccess() {
      try {
        const res = await fetch(base + '/api/system/rooms');
        if (!res.ok) return;
        const data = await res.json();
        roomsData = data.rooms || [];
        visionSummaryData = data.visionSummary || null;
        renderRoomDockBar();
        renderPinnedRoomsTray();
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function setLeftNavActive(id) {
      document.querySelectorAll('#left-ambient-navbar .lnav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.id === 'lnav-' + id);
      });
    }

    function openFullService(appId, title, hash) {
      setLeftNavActive(appId);
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/' + (hash || '');
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      setLeftNavActive('horizon');
      document.getElementById('full-app-overlay').style.display = 'none';
      document.getElementById('full-app-frame').src = 'about:blank';
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
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

      if (widgetEl) {
        widgetEl.classList.toggle('finances-is-hidden', Boolean(financesHidden));
      }

      const k = d.kpis || {};
      const bal = d.balanceConfig || {};
      const currentBalance = bal.currentBalance !== undefined ? bal.currentBalance : (k.currentBalance || 0);
      const accountName = bal.accountName || k.accountName || 'Sparkasse George';
      const expensesDay = k.expensesDay !== undefined ? k.expensesDay : (d.expensesToday || 0);
      const expensesWeek = k.expensesWeek !== undefined ? k.expensesWeek : (d.expensesWeek || 0);
      const netCashflow = k.net !== undefined ? k.net : (d.netCashflowMonth || 0);
      const activeMonth = k.activeMonth || d.activeMonth || '';
      const groupBudgets = d.previewGroupBudgets || d.groupBudgets || [];

      const cfg = d.previewConfig || {
        hiddenByDefault: true,
        primaryMetric: 'current_balance',
        enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'group_budgets', 'quick_import']
      };
      const enabled = cfg.enabledElements || [];

      if (eyeBtn) {
        eyeBtn.innerHTML = financesHidden ? '\u{1F441}\uFE0F' : '\u{1F512}';
        eyeBtn.title = financesHidden ? 'Finanzdaten anzeigen' : 'Finanzdaten verbergen';
      }
      if (toggleLink) {
        toggleLink.innerHTML = financesHidden ? '\u{1F441}\uFE0F Zahlen anzeigen' : '\u{1F512} Zahlen verbergen';
      }

      // Primary headline (hidden via CSS when financesHidden is true and widget is collapsed)
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
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F3E6} Aktueller Kontostand</span>
            <span class="w-stat-v" style="color:#38bdf8;">\${fmtEurDash(currentBalance, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_day')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F4C5} Ausgaben (Tag)</span>
            <span class="w-stat-v" style="color:#f8fafc;">-\${fmtEurDash(expensesDay, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_week')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">\u{1F4C6} Ausgaben (Woche)</span>
            <span class="w-stat-v" style="color:#fbbf24;">-\${fmtEurDash(expensesWeek, financesHidden)}</span>
          </div>
        \`);
      }

      let html = '';
      if (statCards.length > 0) {
        html += \`<div class="w-stat-grid">\${statCards.join('')}</div>\`;
      }

      if (enabled.includes('group_budgets') && Array.isArray(groupBudgets) && groupBudgets.length > 0) {
        const budgetRows = groupBudgets.slice(0, 4).map((b) => {
          const pct = Math.min(100, Math.round(b.pctUsed !== undefined ? b.pctUsed : (b.pct || 0)));
          const limit = b.budgetLimit !== undefined ? b.budgetLimit : (b.limit || 0);
          const barColor = b.overBudget ? '#ef4444' : (b.color || '#38bdf8');
          const valText = financesHidden
            ? '\u2022\u2022\u2022\u2022 / \u2022\u2022\u2022\u2022 \u20AC'
            : \`\${Math.round(b.spent || 0)} / \${Math.round(limit)} \u20AC\`;
          return \`
            <div style="display:flex; flex-direction:column; gap:3px;">
              <div style="display:flex; justify-content:space-between; font-size:11px; color:rgba(248,250,252,0.88);">
                <span>\${b.icon || '\u{1F4E6}'} \${b.labelDe || b.category}</span>
                <span style="font-variant-numeric:tabular-nums; color:rgba(248,250,252,0.68);">\${valText}</span>
              </div>
              <div style="height:4px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden;">
                <div style="width:\${financesHidden ? 35 : pct}%; height:100%; background:\${barColor};"></div>
              </div>
            </div>
          \`;
        }).join('');
        html += \`<div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">\${budgetRows}</div>\`;
      }

      dynEl.innerHTML = html || '<div style="font-size:11.5px; color:rgba(255,255,255,0.5);">Keine Preview-Felder ausgew\xE4hlt</div>';

      if (qiSlot) {
        if (enabled.includes('quick_import')) {
          qiSlot.innerHTML = \`
            <button onclick="openQuickImportFlyout(event)"
                    style="width:100%; padding:7px 12px; border-radius:9px; border:1px solid rgba(56,189,248,0.4); background:linear-gradient(135deg, rgba(2,132,199,0.28), rgba(37,99,235,0.28)); color:#38bdf8; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              \u26A1 Quick Import (Online-Banking Flyout)
            </button>
          \`;
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

    function launchBankingPopupFromDashboard() {
      const url = (financesDashData && financesDashData.quickImportConfig && financesDashData.quickImportConfig.loginUrl)
        || 'https://george.sparkasse.at/index.html#/login';
      const w = 1040, h = 760;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      window.open(url, 'ThassiOnlineBankingPopup', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
      showQiDashStatus('\u{1FA9F} Online-Banking Popup ge\xF6ffnet. Nach Download wird der Export automatisch importiert.', true);
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
      try {
        showQiDashStatus('\u23F3 Importiere ' + file.name + '...', true);
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
        showQiDashStatus('\u2705 ' + file.name + ': ' + (json.importedCount || 0) + ' Buchungen importiert!', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('\u274C Datei-Import fehlgeschlagen', false);
      }
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

    async function addNote(e) {
      e.preventDefault();
      const input = document.getElementById('note-input');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      await fetch(base + '/api/system/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      await loadAllLiveData();
    }

    async function deleteNote(id) {
      await fetch(base + '/api/system/notes?id=' + id, { method: 'DELETE' });
      await loadAllLiveData();
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
        document.getElementById('compact-meals').innerHTML = \`<strong>\${nextMeal}</strong>\`;
        document.getElementById('sub-meals').textContent = \`\${m.totalCalories || 0} kcal planned today\`;
        document.getElementById('em-slots').innerHTML = \`
          <div>\u{1F305} <strong>Breakfast:</strong> \${m.breakfast || '\u2014'}</div>
          <div>\u2600\uFE0F <strong>Lunch:</strong> \${m.lunch || '\u2014'}</div>
          <div>\u{1F319} <strong>Dinner:</strong> \${m.dinner || '\u2014'}</div>
        \`;
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

        // 3. Update NOTES widget
        const notes = sys.notes || [];
        if (notes.length > 0) {
          const latest = notes[0].content;
          document.getElementById('compact-notes').innerHTML = \`<strong>\${notes.length} \${notes.length === 1 ? 'note' : 'notes'}</strong>\`;
          document.getElementById('sub-notes').textContent = latest.length > 28 ? latest.slice(0, 28) + '\u2026' : latest;
          document.getElementById('notes-list').innerHTML = notes
            .map((n) => \`
              <div class="note-row">
                <span>\${n.content}</span>
                <button class="note-del" onclick="deleteNote(\${n.id})">\u2715</button>
              </div>
            \`)
            .join('');
        } else {
          document.getElementById('compact-notes').textContent = '0 notes';
          document.getElementById('sub-notes').textContent = 'Tap to write a quick note';
          document.getElementById('notes-list').innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4);">No notes saved yet.</div>';
        }

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
    window.submitMini3dPrompt = submitMini3dPrompt;
    window.toggleMini3dPlaceholder = toggleMini3dPlaceholder;
    window.triggerMini3dPrint = triggerMini3dPrint;
    window.toggleRoomPin = toggleRoomPin;
    window.unpinAllRooms = unpinAllRooms;
    window.submitCortexPrompt = submitCortexPrompt;
    window.selectCortexPreviewBlueprint = selectCortexPreviewBlueprint;
    window.selectCortexMemoHit = selectCortexMemoHit;
    window.closeCortexResponse = closeCortexResponse;
    window.copyCortexResponse = copyCortexResponse;

    // ============================================================================
    // HORIZON CENTERED CORTEX PROMPT BAR, LIVE PREVIEWS & GEMINI SENDER
    // ============================================================================
    let cortexSearchTimer = null;
    let cortexIsSubmitting = false;
    let cachedCortexBlueprints = [];

    async function initCortexPromptBar() {
      const input = document.getElementById('cortex-prompt-input');
      const dropdown = document.getElementById('cortex-preview-dropdown');
      if (!input || !dropdown) return;

      try {
        const bsRes = await fetch(base + '/api/apps/cortex/bootstrap');
        if (bsRes.ok) {
          const bsData = await bsRes.json();
          cachedCortexBlueprints = bsData.blueprints || [];
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
        }, 180);
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
        (b.code || '').toLowerCase().includes(qLow)
      );

      let memoHits = [];
      try {
        const mRes = await fetch(base + '/api/apps/memo/search?q=' + encodeURIComponent(q) + '&limit=5');
        if (mRes.ok) {
          const mData = await mRes.json();
          memoHits = mData.results || [];
        }
      } catch (_e) {}

      if (matchedBps.length === 0 && memoHits.length === 0) {
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

    function checkHashFor3dPrint() {
      try {
        const h = (window.top ? window.top.location.hash : window.location.hash) || window.location.hash;
        if (h === '#3d-print') {
          openFullService('3d-print', '3D Druck Studio');
        }
      } catch (_e) {}
    }
    checkHashFor3dPrint();
    window.addEventListener('hashchange', checkHashFor3dPrint);
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
var DATA_DIR = path4.resolve(
  process.env.THASSI_DATA_DIR || (fs4.existsSync("/data") ? "/data" : "./data")
);
var STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || "";
fs4.mkdirSync(path4.join(DATA_DIR, "apps"), { recursive: true });
fs4.mkdirSync(path4.join(DATA_DIR, "deployed_apps"), { recursive: true });
var legacyStarterDir = path4.join(DATA_DIR, "deployed_apps", "data-workbench");
if (fs4.existsSync(legacyStarterDir)) {
  fs4.rmSync(legacyStarterDir, { recursive: true, force: true });
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
          await loadAppFromDirectory(path4.join(deployedBase, entry.name), "hot-deployed");
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
    const injection = `<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)};${getHassSidebarStylerScript()}</script>`;
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
          version: "1.2.5",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      if (pathname === "/api/cortex-diagnostic-check" && req.method === "GET") {
        const html = renderUnifiedDashboardHtml(ingressPath);
        return sendJson(res, 200, {
          ok: true,
          htmlLength: html.length,
          hasCortexPill: html.includes("cortex-prompt-pill"),
          hasVerifyMarker: html.includes("VERIFY_PROMPT_BAR_123"),
          htmlSnippet: html.slice(0, 300),
          cortexIndex: html.indexOf("cortex-prompt-pill")
        });
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
              buildDev("switch.buro_og_bewasserung_pumpe", "Bew\xE4sserung Pumpe", "toggle", "sensor.schalter_neu_power"),
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
        const info = sharedDb.execute(
          "INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)",
          [body.content.trim(), (/* @__PURE__ */ new Date()).toISOString()]
        );
        return sendJson(res, 200, { id: info.lastInsertRowid });
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
        const targetDir = path4.join(DATA_DIR, "deployed_apps", appId);
        fs4.mkdirSync(targetDir, { recursive: true });
        fs4.writeFileSync(
          path4.join(targetDir, "thassi.app.json"),
          JSON.stringify(payload.manifest, null, 2)
        );
        if (payload.backendCode) {
          fs4.writeFileSync(path4.join(targetDir, "backend.mjs"), payload.backendCode, "utf-8");
        }
        const frontendDir = path4.join(targetDir, "frontend");
        fs4.rmSync(frontendDir, { recursive: true, force: true });
        fs4.mkdirSync(frontendDir, { recursive: true });
        for (const [relFile, b64] of Object.entries(payload.frontendFiles || {})) {
          const safeRel = relFile.replace(/^(\.\.[/\\])+/, "");
          const destFile = path4.join(frontendDir, safeRel);
          fs4.mkdirSync(path4.dirname(destFile), { recursive: true });
          fs4.writeFileSync(destFile, Buffer.from(b64, "base64"));
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
        const dashboardHtml = renderUnifiedDashboardHtml(ingressPath);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "x-thassi-dashboard-version": "1.2.4-cortex",
          "x-thassi-html-len": String(dashboardHtml.length)
        });
        res.end(dashboardHtml);
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
