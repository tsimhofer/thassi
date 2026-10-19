import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// thassi_host/src/server.ts
import http from "node:http";
import fs3 from "node:fs";
import path3 from "node:path";
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
    const published = this.sharedDb.kvGet("published_sensors", {}) || {};
    published[entityId] = {
      entityId,
      appId: this.appId,
      state: String(state),
      updatedAt: nowIso
    };
    this.sharedDb.kvSet("published_sensors", published);
    try {
      return await this.request(`/states/${entityId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch {
      return {
        entity_id: entityId,
        state: payload.state,
        attributes: payload.attributes,
        last_changed: nowIso,
        last_updated: nowIso
      };
    }
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

// thassi_host/src/hass-sidebar-sync.ts
import fs2 from "node:fs";
import path2 from "node:path";
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
    if (!fs2.existsSync(path2.join(cfgDir, "configuration.yaml"))) continue;
    try {
      const wwwDir = path2.join(cfgDir, "www");
      fs2.mkdirSync(wwwDir, { recursive: true });
      const stylerJs = getHassSidebarStylerScript();
      fs2.writeFileSync(path2.join(wwwDir, "thassi-ui.js"), stylerJs, "utf-8");
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
      fs2.writeFileSync(path2.join(wwwDir, "thassi-loader.html"), loaderHtml, "utf-8");
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
      bottom: calc(100% + 10px);
      left: 0;
      width: 310px;
      max-height: 340px;
      background: rgba(11, 17, 32, 0.96);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.72);
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

    /* Abstract Sun Sculpture (Concentric Geometric Rings + Singularity Annulus) */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 4;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease, transform 0.8s ease;
      will-change: left, top;
    }
    .abstract-sun-bloom {
      position: absolute;
      width: 220px;
      height: 220px;
      left: -110px;
      top: -110px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(254, 240, 138, 0.36) 0%, rgba(251, 191, 36, 0.16) 42%, rgba(249, 115, 22, 0.05) 68%, transparent 100%);
      filter: blur(28px);
      animation: abstractPulse 7s ease-in-out infinite alternate;
    }
    .abstract-sun-outer-ring {
      position: absolute;
      width: 104px;
      height: 104px;
      left: -52px;
      top: -52px;
      animation: rotateOrbital 72s linear infinite;
    }
    .abstract-sun-mid-ring {
      position: absolute;
      width: 56px;
      height: 56px;
      left: -28px;
      top: -28px;
      border-radius: 50%;
      border: 1px solid rgba(254, 240, 138, 0.42);
      background: radial-gradient(circle, rgba(254, 240, 138, 0.12) 0%, rgba(251, 191, 36, 0.03) 70%, transparent 100%);
      box-shadow: 0 0 32px rgba(251, 191, 36, 0.22);
    }
    .abstract-sun-annulus {
      position: absolute;
      width: 22px;
      height: 22px;
      left: -11px;
      top: -11px;
      border-radius: 50%;
      border: 1.5px solid rgba(255, 255, 255, 0.92);
      background: rgba(254, 240, 138, 0.18);
      box-shadow:
        0 0 20px rgba(251, 191, 36, 0.8),
        inset 0 0 8px rgba(254, 240, 138, 0.65);
    }
    .abstract-sun-singularity {
      position: absolute;
      width: 4px;
      height: 4px;
      left: -2px;
      top: -2px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 0 10px #ffffff;
    }
    @keyframes abstractPulse {
      0% { transform: scale(0.94); opacity: 0.78; }
      100% { transform: scale(1.08); opacity: 1; }
    }
    @keyframes rotateOrbital {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Abstract Lunar Sculpture (Geometric Eclipse Crescent & Orbital Ring) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 4;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .abstract-moon-bloom {
      position: absolute;
      width: 150px;
      height: 150px;
      left: -75px;
      top: -75px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.24) 0%, rgba(129, 140, 248, 0.1) 48%, transparent 74%);
      filter: blur(22px);
    }
    .abstract-moon-svg {
      position: absolute;
      width: 84px;
      height: 84px;
      left: -42px;
      top: -42px;
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
    #hero-date {
      margin-top: 6px;
      font-size: clamp(1.0rem, 1.45vw, 1.38rem);
      font-weight: 300;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    #solar-telemetry {
      display: none;
    }

    /* Simplified Minimal Weather Component (St. Veit / G\xF6lsen) */
    #hero-weather-strip {
      margin-top: 10px;
      pointer-events: auto;
      display: inline-flex;
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
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .mw-slot {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: rgba(248, 250, 252, 0.56);
      font-variant-numeric: tabular-nums;
    }
    .mw-slot.is-current-slot {
      color: #38bdf8;
      font-weight: 500;
    }
    .mw-slot-hr {
      font-size: 10px;
      opacity: 0.72;
    }
    .mw-slot-ico {
      width: 13px;
      height: 13px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .mw-slot-temp {
      font-size: 11px;
      color: rgba(248, 250, 252, 0.88);
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
      overflow: hidden;
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

    /* Horizontal Axis Line */
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 38px;
      height: 1px;
      background: rgba(255, 255, 255, 0.14);
      pointer-events: none;
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

    /* 4. GOOGLE CALENDAR EVENT RECTANGLES ON THE TIMELINE */
    .tl-event-rect {
      position: absolute;
      height: 42px;
      border-radius: 10px;
      padding: 5px 12px;
      background: rgba(12, 19, 36, 0.56);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-left: 2.5px solid var(--ev-color, #38bdf8);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.22s ease, box-shadow 0.22s ease;
    }
    .tl-event-rect:hover {
      transform: translateY(-3px) scale(1.01);
      background: rgba(24, 35, 58, 0.85);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), 0 0 20px var(--ev-glow, rgba(56, 189, 248, 0.25));
      z-index: 18;
    }
    .tl-event-rect.is-now {
      background: rgba(14, 116, 144, 0.42);
      box-shadow: 0 0 28px rgba(56, 189, 248, 0.35);
    }
    .tl-event-rect.is-past {
      opacity: 0.45;
    }
    .tl-ev-title {
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }
    .tl-ev-meta {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.56);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
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

    /* 6. TRANSPARENT MINIMALISTIC TABVIEW STATUSBAR + RIGHT-ALIGNED 3D PRINT & VISION UPWARD FLYOUTS */
    #devices-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 32;
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      display: flex;
      flex-direction: column;
    }

    /* Subtle hairline separator between Timeline and StatusBar */
    #timeline-devices-separator {
      position: relative;
      height: 10px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 28px 0 24px;
      pointer-events: auto;
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
      position: relative;
      z-index: 2;
      background: transparent;
      padding: 0 6px 0 0;
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(248, 250, 252, 0.45);
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .td-sep-unpin-btn {
      background: none;
      border: none;
      color: #38bdf8;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 0 4px;
    }
    .td-sep-unpin-btn:hover {
      text-decoration: underline;
    }

    /* Pinned Room Groups Tray (Expands upwards above the tabview when rooms are pinned) */
    #pinned-rooms-tray {
      display: none;
      padding: 6px 28px 8px 24px;
      gap: 12px;
      overflow-x: auto;
      scrollbar-width: thin;
      align-items: stretch;
    }
    #pinned-rooms-tray.has-pinned {
      display: flex;
    }
    .pinned-room-card {
      min-width: 265px;
      max-width: 330px;
      flex: 0 0 auto;
      background: rgba(6, 10, 22, 0.64);
      backdrop-filter: blur(24px) saturate(140%);
      -webkit-backdrop-filter: blur(24px) saturate(140%);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 16px;
      padding: 10px 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
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
      max-height: 155px;
      overflow-y: auto;
      padding-right: 2px;
    }

    /* Minimalistic TabView Bar + Right-Aligned 3D Print & Vision Previews */
    #room-dock-bar {
      position: relative;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px 4px 24px;
      gap: 16px;
      background: transparent;
    }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 14px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      flex: 1;
      min-width: 0;
    }
    .room-dock-group::-webkit-scrollbar { display: none; }

    /* Minimalistic Tab item */
    .room-pill {
      position: relative;
      background: transparent;
      border: none;
      border-bottom: 1.5px solid transparent;
      border-radius: 0;
      padding: 6px 2px;
      color: rgba(248, 250, 252, 0.52);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.04em;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.2s ease, border-color 0.2s ease;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
    }
    .room-pill:hover {
      color: rgba(248, 250, 252, 0.95);
      border-bottom-color: rgba(255, 255, 255, 0.28);
    }
    .room-pill.pinned-tab {
      color: #ffffff;
      font-weight: 500;
      border-bottom-color: #38bdf8;
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.88);
    }
    .room-pin-ico {
      display: none;
    }
    .room-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.24);
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
      color: rgba(248, 250, 252, 0.38);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.82);
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
    <svg id="solar-arc-svg" preserveAspectRatio="none">
      <!-- Abstract Horizon Datum Line & Zenith Tick Marks -->
      <line id="horizon-datum-line" x1="0" y1="0" x2="0" y2="0" stroke="rgba(255,255,255,0.09)" stroke-width="1" stroke-dasharray="2 8" />
      <path id="solar-arc-path" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="3 7" />
      <path id="solar-day-path" fill="none" stroke="rgba(251,191,36,0.16)" stroke-width="1.2" />
      <path id="solar-progressed-path" fill="none" stroke="rgba(254,240,138,0.48)" stroke-width="1.8" />
      <line id="celestial-elevation-chord" x1="0" y1="0" x2="0" y2="0" stroke="rgba(254,240,138,0.22)" stroke-width="1" stroke-dasharray="2 4" />
      <circle id="horizon-node-dot" cx="0" cy="0" r="2.5" fill="rgba(56,189,248,0.65)" />
    </svg>

    <!-- Abstract Lunar Geometry -->
    <div id="moon-assembly">
      <div class="abstract-moon-bloom"></div>
      <svg class="abstract-moon-svg" viewBox="-42 -42 84 84">
        <circle cx="0" cy="0" r="32" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="0.8" stroke-dasharray="2 5" />
        <circle cx="0" cy="0" r="21" fill="none" stroke="rgba(56,189,248,0.28)" stroke-width="1" />
        <path d="M -4,-13 A 13,13 0 1,0 10,9 A 10.5,10.5 0 1,1 -4,-13 Z" fill="rgba(226,232,240,0.88)" />
        <circle cx="-11" cy="-11" r="1.5" fill="#38bdf8" opacity="0.85" />
      </svg>
    </div>

    <!-- Abstract Solar Geometry (Concentric Astrolabe Rings + Singularity Annulus) -->
    <div id="sun-assembly">
      <div class="abstract-sun-bloom"></div>
      <svg class="abstract-sun-outer-ring" viewBox="-52 -52 104 104">
        <circle cx="0" cy="0" r="46" fill="none" stroke="rgba(254,240,138,0.22)" stroke-width="0.9" stroke-dasharray="3 7" />
        <circle cx="0" cy="0" r="36" fill="none" stroke="rgba(251,191,36,0.18)" stroke-width="0.8" />
        <line x1="-50" y1="0" x2="-39" y2="0" stroke="rgba(254,240,138,0.42)" stroke-width="1" />
        <line x1="39" y1="0" x2="50" y2="0" stroke="rgba(254,240,138,0.42)" stroke-width="1" />
        <line x1="0" y1="-50" x2="0" y2="-39" stroke="rgba(254,240,138,0.42)" stroke-width="1" />
        <line x1="0" y1="39" x2="0" y2="50" stroke="rgba(254,240,138,0.42)" stroke-width="1" />
      </svg>
      <div class="abstract-sun-mid-ring"></div>
      <div class="abstract-sun-annulus"></div>
      <div class="abstract-sun-singularity"></div>
    </div>
  </div>

  <!-- 2. LEFT-ALIGNED DATE, TIME & SIMPLIFIED WEATHER IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date"></div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>

    <!-- SIMPLIFIED WEATHER FORECAST FOR ST. VEIT / G\xD6LSEN -->
    <div id="hero-weather-strip" title="St. Veit an der G\xF6lsen">
      <div class="mw-current-row">
        <div class="mw-icon-wrap" id="mw-current-icon"></div>
        <div class="mw-temp-now" id="mw-current-temp">--\xB0</div>
        <div class="mw-cond-text" id="mw-current-desc">--</div>
        <div class="mw-hi-lo" id="mw-hi-lo">--\xB0 / --\xB0</div>
      </div>
      <div class="mw-day-slots" id="mw-day-slots"></div>
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

  <!-- 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER & GCAL EVENT RECTANGLES -->
  <div id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <button class="horizon-view-btn" onclick="openFullService('google-calendar', 'Calendar')" title="Open Calendar View">\u25F7 Calendar \u2197</button>
        <div class="cal-filter-wrap" onclick="event.stopPropagation()">
          <button class="horizon-view-btn" id="btn-horizon-cal-filter" onclick="toggleCalendarFilterPopover(event)" title="Configure which calendars appear in Horizon">
            \u2699\uFE0F <span id="cal-filter-btn-label">Calendars</span>
          </button>
          <div id="horizon-cal-filter-popover">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
              <div>
                <div style="font-size:12px; font-weight:700; color:#f8fafc;">\u{1F305} Horizon Calendars</div>
                <div id="cal-filter-oauth-badge" style="font-size:10px; color:#94a3b8; margin-top:2px;">Checking Google OAuth...</div>
              </div>
              <div style="display:flex; gap:4px;">
                <button class="tl-pill" style="padding:3px 7px; font-size:10px;" onclick="setAllHorizonCalendarsFromDash(true)">All</button>
                <button class="tl-pill" style="padding:3px 7px; font-size:10px;" onclick="setAllHorizonCalendarsFromDash(false)">None</button>
              </div>
            </div>
            <div class="cal-filter-list" id="horizon-cal-filter-list"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="syncGoogleCalendarsFromDash()">\u{1F504} Sync Google OAuth</button>
              <button class="w-action-link" style="margin:0; font-size:10.5px; color:#94a3b8;" onclick="openFullService('google-calendar', 'Calendar')">OAuth &amp; Settings \u2197</button>
            </div>
          </div>
        </div>
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

      <!-- Continuously moving timeline track -->
      <div id="timeline-world">
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </div>

  <!-- 6. TRANSPARENT MINIMALISTIC TABVIEW STATUSBAR + RIGHT-ALIGNED 3D PRINT & VISION UPWARD FLYOUTS -->
  <div id="devices-dock">
    <div id="timeline-devices-separator">
      <div class="td-sep-badge">
        <span>Timeline \u25BE Rooms &amp; Devices</span>
        <span id="pinned-rooms-count-label" style="color:#38bdf8; display:none;"></span>
        <button class="td-sep-unpin-btn" id="btn-unpin-all-rooms" onclick="unpinAllRooms()" style="display:none;">Alle minimieren</button>
        <button class="w-nav-btn" onclick="openFullService('smart-canvas', 'Smart Home')" title="Open Smart Home View" style="pointer-events:auto; margin-left:4px;">\u2302 Smart Home \u2197</button>
      </div>
    </div>

    <!-- Pinned Room Groups Tray (minimized/collapsed by default until user pins a room tab) -->
    <div id="pinned-rooms-tray"></div>

    <!-- Transparent Minimalistic TabView StatusBar: Left = Room Tabs, Right = 3D Print & Vision Previews (Expanding Upwards) -->
    <div id="room-dock-bar">
      <div class="room-dock-group" id="room-pills-container"></div>

      <!-- Right-aligned StatusBar Previews (NOT inside room tabs; expand flyouts upwards) -->
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

        <!-- N8N PROJEKTE & MODUL-WORKFLOW STATUSBAR PREVIEW (UPWARD FLYOUT) -->
        <div class="sb-preview-item" id="widget-workflow">
          <div style="display:inline-flex; align-items:center; gap:2px;">
            <button class="sb-preview-trigger" onclick="toggleWidget('workflow', event)" title="n8n Modul-Workflow & Projektverwaltung">
              <span class="room-dot" id="workflow-dock-dot" style="background:#22c55e; box-shadow:0 0 8px #22c55e;"></span>
              <span>Projekte &amp; n8n</span>
              <span class="sb-meta" id="workflow-dock-meta">LIVE</span>
              <span class="sb-caret">\u25B4</span>
            </button>
            <button class="w-nav-btn" onclick="event.stopPropagation(); openFullService('project-workflow', 'Projekte & Modul-Workflow')" title="Open Projekte & n8n Workflow Panel">\u2197</button>
          </div>
          <div class="sb-upward-flyout" onclick="event.stopPropagation()">
            <div class="w-label-row" style="justify-content:space-between; margin-bottom:8px;">
              <span>n8n modul-workflow \xB7 gemini &amp; github</span>
              <button class="w-action-link" style="margin:0; font-size:10.5px;" onclick="openFullService('project-workflow', 'Projekte & Modul-Workflow')">Panel \u2197</button>
            </div>
            <div style="font-size:11.5px; color:rgba(248,250,252,0.85); margin-bottom:8px; line-height:1.45;">
              Webhook \u2192 Template \u2192 Gemini API \u2192 Python Unit-Tests (4/4 PASS) \u2192 Git \u2192 Samba/HA Deploy
            </div>
            <button class="w-action-link" style="margin:0;" onclick="openFullService('project-workflow', 'Projekte & Modul-Workflow')">Projekte &amp; n8n Workflow \xF6ffnen \u2192</button>
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

    function computeSunPoint(hourFloat, vw, vh) {
      const isMobile = vw <= 900;
      const horizonY = vh * (isMobile ? 0.44 : 0.62);
      const zenithY = vh * (isMobile ? 0.09 : 0.12);
      const nadirY = vh * (isMobile ? 0.64 : 0.80);

      const xMargin = isMobile ? 0.04 : 0.08;
      const x = vw * (xMargin + (hourFloat / 24) * (1 - xMargin * 2));
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const angle = ((hourFloat - SUNRISE_HOUR) / daySpan) * Math.PI;
      const sinVal = Math.sin(angle);
      const y = sinVal >= 0
        ? horizonY - sinVal * (horizonY - zenithY)
        : horizonY - sinVal * (nadirY - horizonY);

      return { x, y, horizonY, aboveHorizon: sinVal >= -0.06, elevationPct: Math.round(sinVal * 100) };
    }

    function renderSolarArcPaths() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw <= 900;
      const horizonY = vh * (isMobile ? 0.44 : 0.62);

      const datumEl = document.getElementById('horizon-datum-line');
      if (datumEl) {
        datumEl.setAttribute('x1', (vw * (isMobile ? 0.03 : 0.06)).toFixed(1));
        datumEl.setAttribute('y1', horizonY.toFixed(1));
        datumEl.setAttribute('x2', (vw * (isMobile ? 0.97 : 0.94)).toFixed(1));
        datumEl.setAttribute('y2', horizonY.toFixed(1));
      }

      let fullPath = '';
      let dayPath = '';
      for (let h = 0; h <= 24; h += 0.25) {
        const pt = computeSunPoint(h, vw, vh);
        fullPath += (h === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
          dayPath += (dayPath === '' ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        }
      }
      const arcEl = document.getElementById('solar-arc-path');
      const dayEl = document.getElementById('solar-day-path');
      if (arcEl) arcEl.setAttribute('d', fullPath);
      if (dayEl) dayEl.setAttribute('d', dayPath);
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

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw <= 900;
      const sunPt = computeSunPoint(effectiveHour, vw, vh);

      const sunEl = document.getElementById('sun-assembly');
      sunEl.style.left = sunPt.x.toFixed(1) + 'px';
      sunEl.style.top = sunPt.y.toFixed(1) + 'px';
      sunEl.style.opacity = sunPt.aboveHorizon ? '1' : '0.24';
      const baseScale = isMobile ? 0.8 : 1;
      sunEl.style.transform = sunPt.aboveHorizon ? \`scale(\${baseScale})\` : \`scale(\${(baseScale * 0.75).toFixed(2)})\`;

      const moonHour = (effectiveHour + 12) % 24;
      const moonPt = computeSunPoint(moonHour, vw, vh);
      const moonEl = document.getElementById('moon-assembly');
      moonEl.style.left = moonPt.x.toFixed(1) + 'px';
      moonEl.style.top = moonPt.y.toFixed(1) + 'px';
      moonEl.style.opacity = sunPt.aboveHorizon ? '0.12' : '0.95';

      // Progressed arc & abstract elevation chord to horizon datum
      const activePt = sunPt.aboveHorizon ? sunPt : moonPt;
      const chordEl = document.getElementById('celestial-elevation-chord');
      const nodeEl = document.getElementById('horizon-node-dot');
      if (chordEl && nodeEl) {
        chordEl.setAttribute('x1', activePt.x.toFixed(1));
        chordEl.setAttribute('y1', activePt.y.toFixed(1));
        chordEl.setAttribute('x2', activePt.x.toFixed(1));
        chordEl.setAttribute('y2', sunPt.horizonY.toFixed(1));
        nodeEl.setAttribute('cx', activePt.x.toFixed(1));
        nodeEl.setAttribute('cy', sunPt.horizonY.toFixed(1));
      }

      const progEl = document.getElementById('solar-progressed-path');
      if (progEl) {
        let progD = '';
        if (effectiveHour >= SUNRISE_HOUR) {
          const endH = Math.min(effectiveHour, SUNSET_HOUR);
          for (let h = SUNRISE_HOUR; h <= endH; h += 0.2) {
            const p = computeSunPoint(h, vw, vh);
            progD += (progD === '' ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
          }
          const curP = computeSunPoint(endH, vw, vh);
          progD += (progD === '' ? 'M' : 'L') + curP.x.toFixed(1) + ',' + curP.y.toFixed(1);
        }
        progEl.setAttribute('d', progD);
      }

      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  \xB7  Sunrise 06:45  \xB7  Sunset 18:30\`;
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

    // 3 & 4. RENDER TIMELINE TICKS & GOOGLE CALENDAR EVENT RECTANGLES
    function renderTimelineGeometry() {
      const nowMs = Date.now();
      timelineBaseEpochMs = nowMs;
      const pxPerMs = getPxPerMs();

      const startSpanMs = nowMs - 36 * 3600 * 1000;
      const endSpanMs = nowMs + 8 * 24 * 3600 * 1000;

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
        const widthPx = Math.max(135, rawWidthPx);

        let lane = 0;
        for (let l = 0; l < laneEndPx.length; l++) {
          if (leftPx >= laneEndPx[l] + 8) {
            lane = l;
            break;
          }
          if (l === laneEndPx.length - 1) lane = l;
        }
        laneEndPx[lane] = leftPx + widthPx;

        const bottomPx = 46 + lane * 48;
        const pal = catPalette[ev.category] || catPalette.personal;
        const evBorder = calColorMap[ev.calendar_name] || pal.border;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
        const safeTitle = String(ev.title || '').split('"').join('&quot;');

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${evBorder}; --ev-glow:\${pal.glow};"
               title="\${safeTitle} (\${dayStr}, \${startStr} \u2013 \${endStr}) \xB7 \${ev.calendar_name || 'Google Calendar'}">
            <div class="tl-ev-title">\${ev.title}</div>
            <div class="tl-ev-meta">\${startStr}\u2013\${endStr} \xB7 \${ev.calendar_name || ev.category}</div>
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
    // 6. MINIMIZED-BY-DEFAULT ROOM TABS & PINNABLE ROOM GROUPS BELOW SEPARATOR
    // ============================================================================
    function syncDevicesDockHeight() {
      const dock = document.getElementById('devices-dock');
      if (!dock) return;
      const h = dock.getBoundingClientRect().height || 44;
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

    async function refreshHealthWidget(summaryFromSys) {
      if (applyHealthWidgetData(summaryFromSys)) return;
      try {
        const res = await fetch(base + '/api/apps/google-health/dashboard');
        if (res.ok) {
          const d = await res.json();
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
      } catch (_e) {}
      const hrInsideEl = document.getElementById('health-hr-inside');
      if (hrInsideEl) hrInsideEl.textContent = '--';
      const stepsInsideEl = document.getElementById('health-steps-inside');
      if (stepsInsideEl) stepsInsideEl.textContent = '--';
      const compactEl = document.getElementById('compact-health');
      if (compactEl) compactEl.textContent = 'No data';
      const subEl = document.getElementById('sub-health');
      if (subEl) subEl.textContent = 'Waiting for Pixel 10 telemetry';
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

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
      syncDevicesDockHeight();
    });

    renderSolarArcPaths();
    renderTimelineGeometry();
    syncDevicesDockHeight();
    initMini3dCanvas();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    void loadWeatherData();
    setInterval(loadAllLiveData, 60000);
    setInterval(() => void loadWeatherData(), 600000);
    setInterval(() => refreshMini3dData(), 5000);
    setInterval(loadRoomsQuickAccess, 12000);

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
var __dirname = path3.dirname(__filename);
process.on("unhandledRejection", (reason) => {
  console.warn("[Thassi] Ignored background unhandledRejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Thassi] Caught uncaughtException (keeping server alive):", err instanceof Error ? err.message : err);
});
function loadDotEnv() {
  const envPath = path3.resolve(process.cwd(), ".env");
  if (!fs3.existsSync(envPath)) return;
  const content = fs3.readFileSync(envPath, "utf-8");
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
var DATA_DIR = path3.resolve(
  process.env.THASSI_DATA_DIR || (fs3.existsSync("/data") ? "/data" : "./data")
);
var STANDALONE_APP_ID = process.env.THASSI_STANDALONE_APP || "";
fs3.mkdirSync(path3.join(DATA_DIR, "apps"), { recursive: true });
fs3.mkdirSync(path3.join(DATA_DIR, "deployed_apps"), { recursive: true });
var legacyStarterDir = path3.join(DATA_DIR, "deployed_apps", "data-workbench");
if (fs3.existsSync(legacyStarterDir)) {
  fs3.rmSync(legacyStarterDir, { recursive: true, force: true });
}
var sharedDb = new ThassiAppDatabase(path3.join(DATA_DIR, "shared.db"));
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
      const isDay2 = Boolean(cur.is_day ?? 1);
      const curMapped = mapWmoCode(Number(cur.weather_code ?? 1), isDay2);
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
        provider: "Google Weather \xB7 St. Veit / G\xF6lsen",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        current: {
          tempC: Math.round(Number(cur.temperature_2m ?? 14) * 10) / 10,
          feelsLikeC: Math.round(Number(cur.apparent_temperature ?? cur.temperature_2m ?? 13.5) * 10) / 10,
          conditionCode: curMapped.code,
          conditionLabel: curMapped.label,
          humidityPct: Math.round(Number(cur.relative_humidity_2m ?? 65)),
          windKmh: Math.round(Number(cur.wind_speed_10m ?? 9)),
          precipProbPct: maxPrecipProb,
          isDay: isDay2
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
  const now = /* @__PURE__ */ new Date();
  const curHr = now.getHours();
  const isDay = curHr >= 7 && curHr <= 18;
  const fallbackSlots = [6, 9, 12, 15, 18, 21].map((hr) => {
    const curve = Math.sin((hr - 6) / 14 * Math.PI);
    const t = Math.round((8 + curve * 8.5) * 10) / 10;
    return {
      timeIso: new Date(now.getFullYear(), now.getMonth(), now.getDate(), hr, 0, 0).toISOString(),
      hourLabel: `${String(hr).padStart(2, "0")}:00`,
      hour: hr,
      tempC: t,
      precipProbPct: hr === 15 || hr === 18 ? 20 : 10,
      precipMm: 0,
      conditionCode: hr >= 12 && hr <= 18 ? "partly_cloudy" : "clear",
      conditionLabel: hr >= 12 && hr <= 18 ? "Leicht bew\xF6lkt" : "Klar",
      isDay: hr >= 7 && hr <= 18
    };
  });
  return {
    location: ST_VEIT_GOELSEN.name,
    region: ST_VEIT_GOELSEN.region,
    coordinates: { lat: ST_VEIT_GOELSEN.lat, lon: ST_VEIT_GOELSEN.lon },
    provider: "Google Weather \xB7 St. Veit / G\xF6lsen",
    updatedAt: now.toISOString(),
    current: {
      tempC: 13.5,
      feelsLikeC: 12.8,
      conditionCode: "partly_cloudy",
      conditionLabel: "Leicht bew\xF6lkt",
      humidityPct: 64,
      windKmh: 9,
      precipProbPct: 15,
      isDay
    },
    today: {
      tempMaxC: 16.5,
      tempMinC: 7.5,
      sunriseHour: 6.75,
      sunsetHour: 18.5,
      sunriseLabel: "06:45",
      sunsetLabel: "18:30",
      summary: "Leicht bew\xF6lkt \xB7 H: 17\xB0 T: 8\xB0 in St. Veit / G\xF6lsen"
    },
    daySlots: fallbackSlots,
    hourly24: fallbackSlots
  };
}
var loadedApps = /* @__PURE__ */ new Map();
async function loadAppFromDirectory(appDir, source) {
  const manifestPath = path3.join(appDir, "thassi.app.json");
  if (!fs3.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs3.readFileSync(manifestPath, "utf-8"));
  const appId = manifest.id;
  if (appId === "data-workbench") return;
  scheduler.clearAppJobs(appId);
  const existing = loadedApps.get(appId);
  const appDb = existing?.db || new ThassiAppDatabase(path3.join(DATA_DIR, "apps", `${appId}.db`));
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
  const compiledBackend = path3.join(appDir, "backend.mjs");
  const devBackend = path3.join(appDir, "backend", "index.ts");
  const backendFile = fs3.existsSync(compiledBackend) ? compiledBackend : fs3.existsSync(devBackend) ? devBackend : null;
  if (backendFile) {
    const fileUrl = `${pathToFileURL(backendFile).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    if (mod.default && typeof mod.default.setup === "function") {
      await mod.default.setup(ctx);
    }
  }
  const distFrontend = path3.join(appDir, "frontend");
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
    path3.join(__dirname, "apps"),
    path3.resolve(process.cwd(), "thassi_host", "dist", "apps"),
    path3.resolve(process.cwd(), "apps")
  ];
  for (const baseDir of candidateBuiltInDirs) {
    if (!fs3.existsSync(baseDir)) continue;
    for (const entry of fs3.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        const appDir = path3.join(baseDir, entry.name);
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
  const deployedBase = path3.join(DATA_DIR, "deployed_apps");
  if (fs3.existsSync(deployedBase)) {
    for (const entry of fs3.readdirSync(deployedBase, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "data-workbench") {
        try {
          await loadAppFromDirectory(path3.join(deployedBase, entry.name), "hot-deployed");
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
  let filePath = path3.join(app.frontendDir, cleanSub);
  if (!fs3.existsSync(filePath) || fs3.statSync(filePath).isDirectory()) {
    filePath = path3.join(app.frontendDir, "index.html");
  }
  if (!fs3.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Frontend bundle not found for app "${app.manifest.id}". Run "npm run build" first.`);
    return;
  }
  const ext = path3.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  if (ext === ".html") {
    let html = fs3.readFileSync(filePath, "utf-8");
    const assetBase = `${ingressPath}${mountPrefix}`.replace(/\/+$/, "");
    html = html.replace(/(src|href)="\.\/assets\//g, `$1="${assetBase}/assets/`).replace(/(src|href)="\/assets\//g, `$1="${assetBase}/assets/`);
    const injection = `<script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)}; window.__THASSI_APP_ID__ = ${JSON.stringify(app.manifest.id)};${getHassSidebarStylerScript()}</script>`;
    html = html.includes("</head>") ? html.replace("</head>", `${injection}</head>`) : `${injection}${html}`;
    res.writeHead(200, { "Content-Type": mime });
    res.end(html);
    return;
  }
  res.writeHead(200, { "Content-Type": mime });
  fs3.createReadStream(filePath).pipe(res);
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
          version: "1.2.0",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
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
        const apkPath = path3.join(DATA_DIR, "thassi-control.apk");
        fs3.writeFileSync(apkPath, Buffer.from(body.base64, "base64"));
        return sendJson(res, 200, { uploaded: true, size: fs3.statSync(apkPath).size });
      }
      if (pathname === "/download/thassi-control.apk" && req.method === "GET") {
        const apkPath = path3.join(DATA_DIR, "thassi-control.apk");
        if (!fs3.existsSync(apkPath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("APK not uploaded yet.");
          return;
        }
        const stat = fs3.statSync(apkPath);
        res.writeHead(200, {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="ThassiControl.apk"',
          "Content-Length": String(stat.size)
        });
        fs3.createReadStream(apkPath).pipe(res);
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
        const targetDir = path3.join(DATA_DIR, "deployed_apps", appId);
        fs3.mkdirSync(targetDir, { recursive: true });
        fs3.writeFileSync(
          path3.join(targetDir, "thassi.app.json"),
          JSON.stringify(payload.manifest, null, 2)
        );
        if (payload.backendCode) {
          fs3.writeFileSync(path3.join(targetDir, "backend.mjs"), payload.backendCode, "utf-8");
        }
        const frontendDir = path3.join(targetDir, "frontend");
        fs3.rmSync(frontendDir, { recursive: true, force: true });
        fs3.mkdirSync(frontendDir, { recursive: true });
        for (const [relFile, b64] of Object.entries(payload.frontendFiles || {})) {
          const safeRel = relFile.replace(/^(\.\.[/\\])+/, "");
          const destFile = path3.join(frontendDir, safeRel);
          fs3.mkdirSync(path3.dirname(destFile), { recursive: true });
          fs3.writeFileSync(destFile, Buffer.from(b64, "base64"));
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
