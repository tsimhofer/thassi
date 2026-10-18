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

// thassi_host/src/hass-sidebar-sync.ts
import fs2 from "node:fs";
import path2 from "node:path";
function getHassSidebarStylerScript() {
  return `
  (function initThassiHassSidebarStyler() {
    const LABEL_MAP = {
      'Main Dashboard': 'Horizon',
      'Thassi Main Dashboard': 'Horizon',
      'Thassi Unified Dashboard': 'Horizon',
      'Google Calendar & Time Analytics': 'Calendar',
      'Google Health & Readiness': 'Health',
      'Finance & Budget': 'Finances',
      'Meal Planner': 'Meals',
      'Smart Control Canvas': 'Smart Home',
      'Camera Vision & Object Detection': 'Vision'
    };

    const ROOT_THEME_CSS = \`
      :root, html, body, home-assistant {
        --primary-background-color: #040711 !important;
        --secondary-background-color: #060a17 !important;
        --card-background-color: rgba(8, 13, 26, 0.72) !important;
        --ha-card-background: rgba(8, 13, 26, 0.72) !important;
        --sidebar-background-color: transparent !important;
        --sidebar-text-color: rgba(248, 250, 252, 0.58) !important;
        --sidebar-icon-color: rgba(148, 163, 184, 0.58) !important;
        --sidebar-selected-text-color: #ffffff !important;
        --sidebar-selected-icon-color: #38bdf8 !important;
        --primary-color: #38bdf8 !important;
        --accent-color: #38bdf8 !important;
        --divider-color: rgba(255, 255, 255, 0.0) !important;
        --app-header-background-color: #040711 !important;
        --app-header-text-color: #f8fafc !important;
        --mdc-theme-primary: #38bdf8 !important;
        --mdc-theme-surface: #040711 !important;
        --mdc-drawer-width: 208px !important;
        background-color: #040711 !important;
      }
    \`;

    const DRAWER_SHADOW_CSS = \`
      .mdc-drawer, aside.mdc-drawer {
        background: var(--thassi-sidebar-bg, linear-gradient(180deg, rgba(4, 7, 17, 0.94) 0%, rgba(7, 13, 29, 0.92) 55%, rgba(3, 6, 15, 0.96) 100%)) !important;
        backdrop-filter: blur(30px) saturate(140%) !important;
        -webkit-backdrop-filter: blur(30px) saturate(140%) !important;
        border-right: none !important;
        box-shadow: 16px 0 48px rgba(0, 0, 0, 0.35) !important;
        transition: background 1.2s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .mdc-drawer.mdc-drawer--open:not(.mdc-drawer--closing) + .mdc-drawer-app-content {
        background: #040711 !important;
      }
      .mdc-drawer-app-content {
        background: #040711 !important;
      }
    \`;

    const SIDEBAR_SHADOW_CSS = \`
      :host {
        background: transparent !important;
        color: rgba(248, 250, 252, 0.62) !important;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        border-right: none !important;
      }
      .menu {
        background: transparent !important;
        border-bottom: none !important;
        height: 68px !important;
        padding: 0 14px !important;
        display: flex !important;
        align-items: center !important;
      }
      .menu .title {
        font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        letter-spacing: 0.28em !important;
        text-transform: uppercase !important;
        color: rgba(248, 250, 252, 0.72) !important;
        margin-left: 6px !important;
      }
      .menu ha-icon-button {
        color: rgba(248, 250, 252, 0.55) !important;
      }
      /* Hide sidebar edit button, dividers, notifications & non-Thassi items */
      .divider,
      div.divider,
      .notifications-container,
      .notifications,
      ha-md-list-item.notifications,
      a[data-panel="lovelace"],
      a[data-panel="developer-tools"],
      a[data-panel="config"],
      a[data-panel="44ec3c40_thassi_system_monitor"],
      a[data-panel="44ec3c40_thassi_fuege_neue"],
      ha-md-list-item[href="/lovelace"],
      ha-md-list-item[href="/developer-tools"],
      ha-md-list-item[href="/44ec3c40_thassi_system_monitor"],
      ha-md-list-item[href="/44ec3c40_thassi_fuege_neue"] {
        display: none !important;
      }
      ha-md-list,
      paper-listbox {
        padding: 4px 10px !important;
        background: transparent !important;
      }
      ha-md-list-item,
      paper-icon-item,
      a[role="option"] {
        border-radius: 14px !important;
        margin: 4px 0 !important;
        min-height: 42px !important;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 12.5px !important;
        font-weight: 400 !important;
        letter-spacing: 0.04em !important;
        color: rgba(248, 250, 252, 0.56) !important;
        transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        --md-list-item-leading-icon-color: rgba(148, 163, 184, 0.56) !important;
        --md-list-item-label-text-color: rgba(248, 250, 252, 0.56) !important;
        --md-list-item-label-text-font: "Inter", system-ui, sans-serif !important;
        --md-list-item-label-text-size: 12.5px !important;
        --md-list-item-label-text-weight: 400 !important;
      }
      ha-md-list-item:hover,
      a[role="option"]:hover {
        background: rgba(255, 255, 255, 0.04) !important;
        color: rgba(248, 250, 252, 0.92) !important;
        transform: translateX(3px) !important;
        --md-list-item-leading-icon-color: rgba(248, 250, 252, 0.92) !important;
        --md-list-item-label-text-color: rgba(248, 250, 252, 0.92) !important;
      }
      ha-md-list-item[selected],
      ha-md-list-item.selected,
      a.iron-selected,
      a[aria-selected="true"] {
        background: rgba(56, 189, 248, 0.11) !important;
        color: #ffffff !important;
        box-shadow: inset 2px 0 0 #38bdf8, 0 8px 24px rgba(0, 0, 0, 0.22) !important;
        --md-list-item-leading-icon-color: #38bdf8 !important;
        --md-list-item-label-text-color: #ffffff !important;
        --md-list-item-label-text-weight: 500 !important;
      }
      .item-text {
        font-size: 12.5px !important;
        letter-spacing: 0.04em !important;
      }
      /* Subtle profile footer */
      .profile,
      ha-md-list-item.user {
        opacity: 0.55 !important;
        transition: opacity 0.2s ease !important;
      }
      .profile:hover,
      ha-md-list-item.user:hover {
        opacity: 0.95 !important;
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
        }

        const sidebar = main.shadowRoot.querySelector('ha-sidebar');
        if (sidebar && sidebar.shadowRoot) {
          ensureStyleTag(sidebar.shadowRoot, 'thassi-sidebar-style', SIDEBAR_SHADOW_CSS);

          const titleEl = sidebar.shadowRoot.querySelector('.menu .title');
          if (titleEl && titleEl.textContent !== 'THASSI') {
            titleEl.textContent = 'THASSI';
          }

          const items = sidebar.shadowRoot.querySelectorAll('.item-text, span[slot="headline"]');
          items.forEach((el) => {
            const raw = (el.textContent || '').trim();
            if (LABEL_MAP[raw]) {
              el.textContent = LABEL_MAP[raw];
            }
          });
        }

        // Also strip Lovelace top header if currently on /lovelace
        const panelLovelace = main.shadowRoot.querySelector('ha-panel-lovelace');
        const huiRoot = panelLovelace && panelLovelace.shadowRoot && panelLovelace.shadowRoot.querySelector('hui-root');
        if (huiRoot && huiRoot.shadowRoot) {
          ensureStyleTag(huiRoot.shadowRoot, 'thassi-lovelace-fullbleed', LOVELACE_FULLBLEED_CSS);
        }
      } catch (_err) {
        // Cross-origin fallback (when opened directly on :8099 outside Home Assistant)
      }
    }

    window.syncThassiSidebarSky = function(skyOverlayGradient) {
      try {
        if (!window.top || window.top === window) return;
        const ha = window.top.document.querySelector('home-assistant');
        const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
        const drawer = main && main.shadowRoot && main.shadowRoot.querySelector('ha-drawer');
        if (drawer) {
          drawer.style.setProperty('--thassi-sidebar-bg', skyOverlayGradient);
        }
      } catch (_e) {}
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
  <style>html,body{margin:0;padding:0;background:#040711;overflow:hidden;}</style>
</head>
<body>
  <script>${stylerJs}
  try {
    if (window.top && window.top.location.pathname.startsWith('/lovelace')) {
      window.top.history.replaceState(null, '', '/44ec3c40_thassi_host');
      window.top.dispatchEvent(new CustomEvent('location-changed'));
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --text: #f8fafc;
      --text-soft: rgba(248, 250, 252, 0.72);
      --text-muted: rgba(248, 250, 252, 0.45);
      --accent: #38bdf8;
      --sun-glow: #fbbf24;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; user-select: none; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #040711;
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* 1. DYNAMIC DAYTIME SKY & CELESTIAL SUN STAGE */
    #sky-stage {
      position: fixed;
      inset: 0;
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

    /* Atmospheric horizon mist & glow */
    #horizon-glow {
      position: absolute;
      left: -10%;
      right: -10%;
      bottom: 18vh;
      height: 38vh;
      filter: blur(55px);
      opacity: 0.75;
      transition: background 1.2s ease, opacity 1.2s ease;
    }

    /* Delicate Solar Arc SVG Path */
    #solar-arc-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    /* The Rising & Setting Sun */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease;
      will-change: left, top;
    }
    .sun-core {
      position: absolute;
      width: 84px;
      height: 84px;
      left: -42px;
      top: -42px;
      border-radius: 50%;
      background: radial-gradient(circle, #ffffff 0%, #fef08a 38%, #fbbf24 72%, rgba(245, 158, 11, 0) 100%);
      box-shadow:
        0 0 60px 20px rgba(251, 191, 36, 0.65),
        0 0 140px 55px rgba(249, 115, 22, 0.42),
        0 0 260px 110px rgba(234, 88, 12, 0.24);
      animation: sunPulse 6s ease-in-out infinite alternate;
    }
    .sun-corona {
      position: absolute;
      width: 240px;
      height: 240px;
      left: -120px;
      top: -120px;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(254, 240, 138, 0.16) 20deg,
        transparent 45deg,
        rgba(251, 191, 36, 0.12) 90deg,
        transparent 130deg,
        rgba(254, 240, 138, 0.18) 180deg,
        transparent 220deg,
        rgba(251, 191, 36, 0.14) 275deg,
        transparent 320deg,
        rgba(254, 240, 138, 0.15) 350deg,
        transparent 360deg
      );
      filter: blur(8px);
      animation: rotateCorona 60s linear infinite;
    }
    @keyframes sunPulse {
      0% { transform: scale(0.96); }
      100% { transform: scale(1.05); }
    }
    @keyframes rotateCorona {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Nocturnal Moon (when sun is below horizon) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .moon-core {
      position: absolute;
      width: 46px;
      height: 46px;
      left: -23px;
      top: -23px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #f8fafc 0%, #cbd5e1 65%, #64748b 100%);
      box-shadow: 0 0 45px 12px rgba(186, 230, 253, 0.32), 0 0 110px 35px rgba(56, 189, 248, 0.14);
    }

    /* 2. MONUMENTAL DATE & TIME TYPOGRAPHY */
    #hero-clock-region {
      position: fixed;
      top: 5.5vh;
      left: 4.2vw;
      z-index: 15;
      pointer-events: none;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      line-height: 0.92;
    }
    #hero-time {
      font-size: clamp(5rem, 10.2vw, 9.4rem);
      font-weight: 200;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      text-shadow: 0 12px 45px rgba(0, 0, 0, 0.35);
    }
    #hero-seconds {
      font-size: clamp(1.4rem, 2.6vw, 2.4rem);
      font-weight: 300;
      color: rgba(255, 255, 255, 0.56);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #hero-date {
      margin-top: 10px;
      font-size: clamp(1.15rem, 1.9vw, 1.75rem);
      font-weight: 300;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    #solar-telemetry {
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }

    /* 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS */
    #top-right-widgets {
      position: fixed;
      top: 5.5vh;
      right: 4.2vw;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 22px;
      max-height: 60vh;
    }
    .ambient-widget {
      text-align: right;
      cursor: pointer;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s ease, padding 0.35s ease, backdrop-filter 0.35s ease;
      border: none;
      background: transparent;
      padding: 4px 0;
      border-radius: 20px;
      max-width: 390px;
    }
    .ambient-widget:hover:not(.expanded) {
      transform: translateX(-6px);
    }
    .ambient-widget.expanded {
      cursor: default;
      padding: 18px 22px;
      background: rgba(6, 10, 22, 0.56);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      transform: translateX(-4px);
      width: 340px;
    }
    .w-header {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
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
      color: rgba(255, 255, 255, 0.48);
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .w-primary {
      font-size: 18px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: #ffffff;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: baseline;
      gap: 10px;
      justify-content: flex-end;
    }
    .w-primary strong {
      font-weight: 500;
    }
    .w-sub {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.52);
      font-weight: 400;
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

    /* 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER */
    #timeline-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 46px;
      height: 31vh;
      min-height: 220px;
      z-index: 20;
      background: linear-gradient(
        to top,
        rgba(3, 6, 15, 0.88) 0%,
        rgba(5, 10, 24, 0.58) 55%,
        rgba(5, 10, 24, 0.0) 100%
      );
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    /* Whisper-quiet minimal controls right above the timeline */
    #timeline-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4.2vw 6px 4.2vw;
      font-size: 11px;
      letter-spacing: 0.08em;
    }
    .tl-controls {
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0.42;
      transition: opacity 0.25s ease;
    }
    .tl-controls:hover {
      opacity: 0.95;
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
      height: calc(31vh - 28px);
      min-height: 192px;
      overflow: hidden;
      cursor: grab;
    }
    #timeline-viewport:active { cursor: grabbing; }

    /* Fixed "NOW" Marker at 22% from left */
    #fixed-now-marker {
      position: absolute;
      left: 22vw;
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
      color: rgba(255, 255, 255, 0.38);
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 180px;
      margin-top: -142px;
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
      height: 44px;
      border-radius: 10px;
      padding: 6px 12px;
      background: rgba(12, 19, 36, 0.62);
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
      right: 4.2vw;
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

    /* 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR BELOW TIMELINE */
    #room-dock-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 46px;
      z-index: 28;
      background: rgba(3, 6, 15, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4.2vw;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    #room-dock-bar::-webkit-scrollbar { display: none; }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .room-pill {
      background: transparent;
      border: none;
      border-radius: 99px;
      padding: 6px 13px;
      color: rgba(248, 250, 252, 0.56);
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.22s ease, background 0.22s ease, transform 0.2s ease;
    }
    .room-pill:hover {
      color: rgba(248, 250, 252, 0.92);
      background: rgba(255, 255, 255, 0.045);
    }
    .room-pill.active-flyout {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.13);
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.88);
    }
    .room-dot {
      width: 5.5px;
      height: 5.5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.22);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .room-pill.has-on .room-dot {
      background: #fbbf24;
      box-shadow: 0 0 9px rgba(251, 191, 36, 0.85);
    }
    .room-pill.has-motion .room-dot {
      background: #4ade80;
      box-shadow: 0 0 9px rgba(74, 222, 128, 0.85);
    }
    .room-meta {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.36);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.78);
    }

    /* Upward Glassmorphic Room Flyout */
    #room-flyout {
      position: fixed;
      bottom: 54px;
      left: 4.2vw;
      z-index: 45;
      width: 340px;
      max-width: 92vw;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(32px) saturate(150%);
      -webkit-backdrop-filter: blur(32px) saturate(150%);
      border-radius: 22px;
      padding: 18px 20px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: flyoutRise 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes flyoutRise {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .rf-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 4px;
    }
    .rf-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .rf-subtitle {
      font-size: 11px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .rf-dev-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 44vh;
      overflow-y: auto;
    }
    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 9px 12px;
      border-radius: 13px;
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
      gap: 10px;
    }
    .rf-dev-label {
      font-size: 12.5px;
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
      gap: 8px;
    }
    .rf-power-badge {
      font-size: 10.5px;
      color: rgba(248, 250, 252, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: none;
      border-radius: 99px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 252, 0.65);
    }
    .rf-toggle-btn.on {
      background: #fbbf24;
      color: #040711;
      box-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
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
      gap: 5px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: none;
      border-radius: 99px;
      padding: 2px 8px;
      font-size: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: #a855f7;
      color: #fff;
    }
  </style>
</head>
<body>
  <!-- 1. LIVING DAYTIME SKY & CELESTIAL SUN -->
  <div id="sky-stage">
    <div id="starfield"></div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none">
      <path id="solar-arc-path" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4 6" />
      <path id="solar-day-path" fill="none" stroke="rgba(251,191,36,0.18)" stroke-width="1.4" />
    </svg>
    <div id="moon-assembly">
      <div class="moon-core"></div>
    </div>
    <div id="sun-assembly">
      <div class="sun-corona"></div>
      <div class="sun-core"></div>
    </div>
  </div>

  <!-- 2. LARGE DATE & TIME IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date"></div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>
  </div>

  <!-- 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS: (health), (finances), (notes), (meals) -->
  <div id="top-right-widgets">
    <!-- HEALTH WIDGET -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>health</span>
          <span class="w-dot" id="dot-health" style="background:#4ade80; box-shadow:0 0 10px #4ade80;"></span>
        </div>
        <div class="w-primary" id="compact-health">--</div>
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
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Open Health \u2192</button>
      </div>
    </div>

    <!-- FINANCES WIDGET -->
    <div class="ambient-widget" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>finances</span>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7;"></span>
        </div>
        <div class="w-primary" id="compact-finances">--</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid">
          <div class="w-stat-item"><span class="w-stat-k">Income</span><span class="w-stat-v" id="ef-inc" style="color:#4ade80;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Expenses</span><span class="w-stat-v" id="ef-exp" style="color:#f87171;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Investments</span><span class="w-stat-v" id="ef-inv" style="color:#38bdf8;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Groceries</span><span class="w-stat-v" id="ef-groc" style="color:#fbbf24;">--</span></div>
        </div>
        <button class="w-action-link" onclick="openFullService('finance-analytics', 'Finances')">Open Finances \u2192</button>
      </div>
    </div>

    <!-- NOTES WIDGET -->
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

    <!-- MEALS WIDGET -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>meals</span>
          <span class="w-dot" id="dot-meals" style="background:#fb923c; box-shadow:0 0 10px #fb923c;"></span>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12.5px; color:rgba(255,255,255,0.85); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Open Meals \u2192</button>
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

  <!-- 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR & UPWARD FLYOUT -->
  <div id="room-flyout" onclick="event.stopPropagation()"></div>
  <div id="room-dock-bar">
    <div class="room-dock-group" id="room-pills-container"></div>
    <button class="room-pill" onclick="openFullService('camera-vision', 'Camera Vision')" title="Kamera-Objekterkennung & Streams \xF6ffnen">
      <span class="room-dot" id="vision-dock-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
      <span>Vision AI</span>
      <span class="room-meta" id="vision-dock-meta">Zyklisch</span>
    </button>
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

    const base = window.__THASSI_INGRESS_PATH__ || '';
    const NOW_ANCHOR_RATIO = 0.22;

    let calendarEvents = [];
    let roomsData = [];
    let visionSummaryData = null;
    let activeRoomFlyoutId = null;
    let visibleHoursSpan = 24;
    let panOffsetMs = 0;
    let timelineBaseEpochMs = Date.now();

    // Generate twinkling stars once
    (function initStars() {
      const sf = document.getElementById('starfield');
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

    // 1. SOLAR POSITION & SKY COLOR ENGINE
    const SUNRISE_HOUR = 6.75; // 06:45
    const SUNSET_HOUR = 18.5;  // 18:30

    function getSkyPalette(h) {
      if (h < 5.2 || h >= 21.2) {
        return {
          sky: 'linear-gradient(180deg, #02040a 0%, #070d1f 48%, #0f172a 78%, #172554 100%)',
          sidebarBg: 'linear-gradient(180deg, #02040a 0%, #060b1a 55%, #03060f 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.18), transparent 70%)',
          stars: 0.9,
          phase: 'Astronomical Night'
        };
      }
      if (h < 6.5) {
        return {
          sky: 'linear-gradient(180deg, #090d1e 0%, #1e1b4b 42%, #6d28d9 74%, #f97316 100%)',
          sidebarBg: 'linear-gradient(180deg, #070a18 0%, #131130 60%, #060813 100%)',
          glow: 'radial-gradient(ellipse at 25% 100%, rgba(251, 146, 60, 0.65), transparent 72%)',
          stars: 0.45,
          phase: 'Dawn Twilight'
        };
      }
      if (h < 8.0) {
        return {
          sky: 'linear-gradient(180deg, #1d4ed8 0%, #3b82f6 42%, #f472b6 75%, #fbbf24 100%)',
          sidebarBg: 'linear-gradient(180deg, #0c1f5e 0%, #172554 60%, #060b19 100%)',
          glow: 'radial-gradient(ellipse at 22% 100%, rgba(253, 224, 71, 0.8), transparent 75%)',
          stars: 0.05,
          phase: 'Golden Sunrise'
        };
      }
      if (h < 16.5) {
        return {
          sky: 'linear-gradient(180deg, #0369a1 0%, #0284c7 45%, #38bdf8 80%, #bae6fd 100%)',
          sidebarBg: 'linear-gradient(180deg, #042f4e 0%, #073b61 55%, #040917 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(254, 249, 195, 0.45), transparent 75%)',
          stars: 0,
          phase: h < 11.5 ? 'Morning Sky' : h < 14 ? 'Solar Noon' : 'Afternoon Sun'
        };
      }
      if (h < 18.8) {
        return {
          sky: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 36%, #c2410c 72%, #facc15 100%)',
          sidebarBg: 'linear-gradient(180deg, #0f0e29 0%, #1e1b4b 58%, #060814 100%)',
          glow: 'radial-gradient(ellipse at 78% 100%, rgba(251, 146, 60, 0.85), transparent 75%)',
          stars: 0.15,
          phase: 'Golden Hour'
        };
      }
      return {
        sky: 'linear-gradient(180deg, #050814 0%, #1e1b4b 46%, #4c1d95 76%, #9a3412 100%)',
        sidebarBg: 'linear-gradient(180deg, #040711 0%, #110f2b 58%, #04060f 100%)',
        glow: 'radial-gradient(ellipse at 82% 100%, rgba(234, 88, 12, 0.45), transparent 70%)',
        stars: 0.65,
        phase: 'Dusk Twilight'
      };
    }

    function computeSunPoint(hourFloat, vw, vh) {
      const horizonY = vh * 0.65;
      const zenithY = vh * 0.12;
      const nadirY = vh * 0.82;

      const x = vw * (0.06 + (hourFloat / 24) * 0.88);
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const angle = ((hourFloat - SUNRISE_HOUR) / daySpan) * Math.PI;
      const sinVal = Math.sin(angle);
      const y = sinVal >= 0
        ? horizonY - sinVal * (horizonY - zenithY)
        : horizonY - sinVal * (nadirY - horizonY);

      return { x, y, aboveHorizon: sinVal >= -0.08, elevationPct: Math.round(sinVal * 100) };
    }

    function renderSolarArcPaths() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let fullPath = '';
      let dayPath = '';
      for (let h = 0; h <= 24; h += 0.25) {
        const pt = computeSunPoint(h, vw, vh);
        fullPath += (h === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
          dayPath += (dayPath === '' ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        }
      }
      document.getElementById('solar-arc-path').setAttribute('d', fullPath);
      document.getElementById('solar-day-path').setAttribute('d', dayPath);
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
      const sunPt = computeSunPoint(effectiveHour, vw, vh);

      const sunEl = document.getElementById('sun-assembly');
      sunEl.style.left = sunPt.x.toFixed(1) + 'px';
      sunEl.style.top = sunPt.y.toFixed(1) + 'px';
      sunEl.style.opacity = sunPt.aboveHorizon ? '1' : '0.28';

      const moonHour = (effectiveHour + 12) % 24;
      const moonPt = computeSunPoint(moonHour, vw, vh);
      const moonEl = document.getElementById('moon-assembly');
      moonEl.style.left = moonPt.x.toFixed(1) + 'px';
      moonEl.style.top = moonPt.y.toFixed(1) + 'px';
      moonEl.style.opacity = sunPt.aboveHorizon ? '0' : '0.92';

      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  \xB7  Sunrise 06:45  \xB7  Sunset 18:30\`;
    }

    // 2. LARGE CLOCK & CONTINUOUS LEFTWARD TIMELINE LOOP
    function getPxPerMs() {
      return window.innerWidth / (visibleHoursSpan * 3600 * 1000);
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

        const bottomPx = 48 + lane * 52;
        const pal = catPalette[ev.category] || catPalette.personal;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${pal.border}; --ev-glow:\${pal.glow};"
               title="\${ev.title.replace(/"/g, '&quot;')} (\${dayStr}, \${startStr} \u2013 \${endStr}) \xB7 \${ev.calendar_name || 'Google Calendar'}">
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
      const isAlreadyOpen = target.classList.contains('expanded');
      document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      if (!isAlreadyOpen) {
        target.classList.add('expanded');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ambient-widget')) {
        document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      }
      if (!e.target.closest('#room-flyout') && !e.target.closest('.room-pill')) {
        closeRoomFlyout();
      }
    });

    function closeRoomFlyout() {
      activeRoomFlyoutId = null;
      const flyout = document.getElementById('room-flyout');
      if (flyout) flyout.style.display = 'none';
      document.querySelectorAll('.room-pill').forEach((p) => p.classList.remove('active-flyout'));
    }

    function openRoomFlyout(roomId, ev) {
      if (ev) ev.stopPropagation();
      if (activeRoomFlyoutId === roomId) {
        closeRoomFlyout();
        return;
      }
      activeRoomFlyoutId = roomId;
      renderRoomDockBar();

      const flyout = document.getElementById('room-flyout');
      const pillEl = document.getElementById('room-pill-' + roomId);
      if (pillEl && flyout) {
        const rect = pillEl.getBoundingClientRect();
        const maxLeft = Math.max(16, window.innerWidth - 360);
        const targetLeft = Math.min(maxLeft, Math.max(16, rect.left));
        flyout.style.left = targetLeft + 'px';
      }
      renderActiveRoomFlyout();
    }

    function renderRoomDockBar() {
      const container = document.getElementById('room-pills-container');
      if (!container) return;

      container.innerHTML = roomsData
        .map((r) => {
          const hasOn = r.activeCount > 0;
          const hasMotion = Boolean(r.motionActive);
          const isActive = activeRoomFlyoutId === r.id;

          const metaParts = [];
          if (r.tempC != null) metaParts.push(r.tempC.toFixed(1) + '\xB0');
          if (r.activeCount > 0) metaParts.push(r.activeCount + ' an');
          if (r.totalPowerW > 0.5) metaParts.push(Math.round(r.totalPowerW) + 'W');
          if (hasMotion) metaParts.push('Bewegung');
          if (r.id === 'kameras_vision') {
            metaParts.push(
              visionSummaryData?.lastTotalObjects
                ? visionSummaryData.lastTotalObjects + ' Obj'
                : r.devices.length + ' Cams'
            );
          }

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isActive ? 'active-flyout' : ''}"
                    onclick="openRoomFlyout('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${metaParts.length > 0 ? \`<span class="room-meta">\${metaParts.join(' \xB7 ')}</span>\` : ''}
            </button>
          \`;
        })
        .join('');

      const vMeta = document.getElementById('vision-dock-meta');
      if (vMeta && visionSummaryData) {
        vMeta.textContent = visionSummaryData.lastSceneSummary
          ? (visionSummaryData.lastTotalObjects || 0) + ' Objekte'
          : 'Zyklisch';
      }
    }

    function renderActiveRoomFlyout() {
      const flyout = document.getElementById('room-flyout');
      if (!flyout || !activeRoomFlyoutId) return;
      const room = roomsData.find((r) => r.id === activeRoomFlyoutId);
      if (!room) {
        closeRoomFlyout();
        return;
      }

      const subParts = [];
      if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + ' \xB0C');
      if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
      if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');

      const rowsHtml = room.devices
        .map((d) => {
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
            return \`
              <div class="rf-dev-row \${camLive ? 'is-on' : ''}">
                <div class="rf-dev-main">
                  <span class="rf-dev-label">\${d.label}</span>
                  <div class="rf-dev-right">
                    <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                      \${camLive ? 'Aktiv' : 'Standby / Re-Auth'}
                    </span>
                    <button class="rf-toggle-btn" onclick="triggerQuickVisionSample('\${d.entityId}', this)">
                      Abtasten
                    </button>
                  </div>
                </div>
              </div>
            \`;
          }

          // Sensor row
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
        })
        .join('');

      const footerHtml =
        room.id === 'kameras_vision'
          ? \`
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
              <span style="font-size:11px; color:rgba(255,255,255,0.48);">
                \${visionSummaryData?.lastSceneSummary ? visionSummaryData.lastSceneSummary.slice(0, 36) : 'Zyklische Objekterkennung aktiv'}
              </span>
              <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('camera-vision', 'Camera Vision')">
                Vision \xF6ffnen \u2192
              </button>
            </div>
          \`
          : room.activeCount > 0
            ? \`
              <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="turnOffAllInRoom('\${room.id}')">
                  Alle im Raum ausschalten
                </button>
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Canvas \u2192
                </button>
              </div>
            \`
            : \`
              <div style="display:flex; justify-content:flex-end; padding-top:4px;">
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Smart Canvas \u2192
                </button>
              </div>
            \`;

      flyout.innerHTML = \`
        <div class="rf-header">
          <span class="rf-title">\${room.name}</span>
          <span class="rf-subtitle">\${subParts.join(' \xB7 ') || (room.activeCount + ' aktiv')}</span>
        </div>
        <div class="rf-dev-list">\${rowsHtml}</div>
        \${footerHtml}
      \`;
      flyout.style.display = 'flex';
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
        if (activeRoomFlyoutId) {
          renderActiveRoomFlyout();
        }
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function openFullService(appId, title) {
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/';
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      document.getElementById('full-app-overlay').style.display = 'none';
      document.getElementById('full-app-frame').src = 'about:blank';
      loadAllLiveData();
    }

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

    async function loadAllLiveData() {
      try {
        void loadRoomsQuickAccess();
        const [sysRes, calRes] = await Promise.all([
          fetch(base + '/api/system/status'),
          fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null)
        ]);
        const sys = await sysRes.json();
        const calData = calRes && calRes.ok ? await calRes.json() : { events: [] };

        calendarEvents = calData.events || [];
        renderTimelineGeometry();

        // 1. Update HEALTH widget
        const h = sys.summaries?.health;
        if (h && (h.steps != null || h.currentHr != null)) {
          const stepsTxt = h.steps != null ? Number(h.steps).toLocaleString() + ' steps' : 'No steps';
          const hrTxt = h.currentHr != null ? h.currentHr + ' bpm' : '';
          document.getElementById('compact-health').innerHTML = \`<strong>\${stepsTxt}</strong> \${hrTxt ? '\xB7 ' + hrTxt : ''}\`;
          document.getElementById('sub-health').textContent =
            h.readinessScore != null ? \`\${h.readinessScore}% readiness \xB7 \${h.readinessStatus || 'Pixel 10'}\` : (h.source || 'Pixel 10');
          document.getElementById('eh-steps').textContent = h.steps != null ? Number(h.steps).toLocaleString() : 'No data';
          document.getElementById('eh-ready').textContent = h.readinessScore != null ? h.readinessScore + '/100' : 'No data';
          document.getElementById('eh-hr').textContent = h.currentHr != null ? h.currentHr + ' bpm' : 'No data';
          document.getElementById('eh-rhr').textContent =
            (h.restingHr != null ? h.restingHr + ' bpm' : '--') + ' / ' + (h.hrvMs != null ? h.hrvMs + ' ms' : '--');
          document.getElementById('eh-sleep').textContent = h.sleepHours != null ? h.sleepHours + ' h' : 'No data';
          document.getElementById('eh-burn').textContent =
            (h.activeCalories != null ? h.activeCalories + ' kcal' : '--') + ' \xB7 ' + (h.distanceKm != null ? h.distanceKm + ' km' : '--');
        } else {
          document.getElementById('compact-health').textContent = 'No data';
          document.getElementById('sub-health').textContent = 'Waiting for Pixel 10 telemetry';
        }

        // 2. Update FINANCES widget
        const f = sys.summaries?.finance;
        if (f && (f.income || f.expenses)) {
          const net = Number(f.netCashflow || 0);
          const sign = net >= 0 ? '+' : '';
          document.getElementById('compact-finances').innerHTML = \`<strong>\${sign}\u20AC\${net.toFixed(0)}</strong> \xB7 -\u20AC\${Number(f.expenses || 0).toFixed(0)}\`;
          document.getElementById('sub-finances').textContent = \`George \xB7 \${f.activeMonth || 'Current'}\`;
          document.getElementById('ef-inc').textContent = '+\u20AC' + Number(f.income || 0).toFixed(0);
          document.getElementById('ef-exp').textContent = '-\u20AC' + Number(f.expenses || 0).toFixed(0);
          document.getElementById('ef-inv').textContent = '\u20AC' + Number(f.investments || 0).toFixed(0);
          document.getElementById('ef-groc').textContent = '\u20AC' + Number(f.grocerySpend || 0).toFixed(0);
        } else {
          document.getElementById('compact-finances').textContent = 'No data';
          document.getElementById('sub-finances').textContent = 'No bank CSV imported';
        }

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
        const m = sys.summaries?.meals;
        if (m && (m.breakfast || m.lunch || m.dinner)) {
          const nextMeal = m.dinner || m.lunch || m.breakfast;
          document.getElementById('compact-meals').innerHTML = \`<strong>\${nextMeal}</strong>\`;
          document.getElementById('sub-meals').textContent = \`\${m.totalCalories || 0} kcal planned today\`;
          document.getElementById('em-slots').innerHTML = \`
            <div>\u{1F305} <strong>Breakfast:</strong> \${m.breakfast || '\u2014'}</div>
            <div>\u2600\uFE0F <strong>Lunch:</strong> \${m.lunch || '\u2014'}</div>
            <div>\u{1F319} <strong>Dinner:</strong> \${m.dinner || '\u2014'}</div>
          \`;
        } else {
          document.getElementById('compact-meals').textContent = 'Unplanned';
          document.getElementById('sub-meals').textContent = 'No meals logged for today';
          document.getElementById('em-slots').innerHTML = 'No meals planned for today yet.';
        }
      } catch (err) {
        console.error('Failed loading dashboard data:', err);
      }
    }

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
    });

    renderSolarArcPaths();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    setInterval(loadAllLiveData, 60000);
    setInterval(loadRoomsQuickAccess, 12000);
  </script>
</body>
</html>`;
}

// thassi_host/src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
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
          version: "1.0.8",
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
          vision: sharedDb.kvGet("camera_vision_today") || null
        };
        const notes = sharedDb.query("SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50");
        return sendJson(res, 200, {
          ha,
          google,
          apps,
          summaries,
          notes,
          jobs: scheduler.listJobs(),
          standaloneAppId: (req.headers["x-thassi-standalone-app"] || "").trim() || STANDALONE_APP_ID || null
        });
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
