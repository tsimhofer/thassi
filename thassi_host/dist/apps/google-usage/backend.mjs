import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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

// apps/google-usage/backend/index.ts
var MODEL_PRICING_TABLE = [
  {
    modelPrefix: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    provider: "Google AI Studio / Vertex",
    inputPricePer1MUsd: 0.15,
    outputPricePer1MUsd: 0.6,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2e3,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536
  },
  {
    modelPrefix: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    provider: "Google AI Studio",
    inputPricePer1MUsd: 0.075,
    outputPricePer1MUsd: 0.3,
    freeTierRpm: 30,
    freeTierRpd: 1500,
    paidTierRpm: 4e3,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536
  },
  {
    modelPrefix: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "Google AI Studio / Vertex",
    inputPricePer1MUsd: 0.15,
    outputPricePer1MUsd: 0.6,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2e3,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536
  },
  {
    modelPrefix: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "Google AI Studio / Vertex",
    inputPricePer1MUsd: 1.25,
    outputPricePer1MUsd: 5,
    freeTierRpm: 5,
    freeTierRpd: 100,
    paidTierRpm: 1e3,
    contextWindowTokens: 2097152,
    outputLimitTokens: 65536
  },
  {
    modelPrefix: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash-Lite",
    provider: "Google AI Studio",
    inputPricePer1MUsd: 0.075,
    outputPricePer1MUsd: 0.3,
    freeTierRpm: 30,
    freeTierRpd: 1500,
    paidTierRpm: 4e3,
    contextWindowTokens: 1048576,
    outputLimitTokens: 8192
  },
  {
    modelPrefix: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    provider: "Google AI Studio",
    inputPricePer1MUsd: 0.1,
    outputPricePer1MUsd: 0.4,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2e3,
    contextWindowTokens: 1048576,
    outputLimitTokens: 8192
  },
  {
    modelPrefix: "gemma-3",
    displayName: "Gemma 3 (27B / 12B IT)",
    provider: "Google Open Weights API",
    inputPricePer1MUsd: 0,
    outputPricePer1MUsd: 0,
    freeTierRpm: 30,
    freeTierRpd: 14400,
    paidTierRpm: 2e3,
    contextWindowTokens: 131072,
    outputLimitTokens: 8192
  }
];
var USD_TO_EUR = 0.925;
function findModelPricing(modelName) {
  const lower = (modelName || "").toLowerCase();
  if (lower.includes("local") || lower.includes("fallback") || lower.includes("parametric")) {
    return {
      modelPrefix: "local-fallback",
      displayName: "Lokaler Thassi Synthesizer (0 Credits)",
      provider: "Lokal (HASS OS)",
      inputPricePer1MUsd: 0,
      outputPricePer1MUsd: 0,
      freeTierRpm: 9999,
      freeTierRpd: 999999,
      paidTierRpm: 9999,
      contextWindowTokens: 128e3,
      outputLimitTokens: 16384
    };
  }
  for (const spec of MODEL_PRICING_TABLE) {
    if (lower.startsWith(spec.modelPrefix) || lower.includes(spec.modelPrefix)) {
      return spec;
    }
  }
  return MODEL_PRICING_TABLE[2];
}
function computeCallCost(modelName, inputTokens, outputTokens) {
  const spec = findModelPricing(modelName);
  const usd = inputTokens / 1e6 * spec.inputPricePer1MUsd + outputTokens / 1e6 * spec.outputPricePer1MUsd;
  return {
    usd: Number(usd.toFixed(6)),
    eur: Number((usd * USD_TO_EUR).toFixed(6))
  };
}
var _cachedModelsList = null;
var _cachedModelsFetchedAt = null;
var _cachedModelsTs = 0;
var index_default = defineThassiApp(async (ctx) => {
  function resolveGeminiKeyInfo() {
    const sharedKey = String(ctx.sharedDb.kvGet("gemini_api_key", "") || "").trim();
    const envKey = String(process.env.GEMINI_API_KEY || "").trim();
    const hassKeys = discoverAllGeminiApiKeysFromHass();
    const allKeys = Array.from(new Set([sharedKey, envKey, ...hassKeys].filter(Boolean)));
    const active = sharedKey || envKey || hassKeys[0] || "";
    let source = "Nicht konfiguriert";
    if (sharedKey) source = "Shared SQLite Vault (shared.db)";
    else if (envKey) source = "Environment (GEMINI_API_KEY)";
    else if (hassKeys.length > 0) source = "Home Assistant Core Storage";
    return {
      key: active,
      source,
      totalDiscoveredKeys: allKeys.length,
      keyPreview: active.length > 8 ? `${active.slice(0, 8)}\u2022\u2022\u2022\u2022${active.slice(-4)}` : active ? "Konfiguriert" : null
    };
  }
  function getBudgetConfig() {
    const saved = ctx.sharedDb.kvGet("google_usage_budget", null);
    return {
      monthlyBudgetEur: typeof saved?.monthlyBudgetEur === "number" ? saved.monthlyBudgetEur : 10,
      totalPrepaidCreditsEur: typeof saved?.totalPrepaidCreditsEur === "number" ? saved.totalPrepaidCreditsEur : 25,
      billingTier: saved?.billingTier === "pay_as_you_go" || saved?.billingTier === "vertex_credits" || saved?.billingTier === "free_tier" ? saved.billingTier : "free_tier",
      alertThresholdPct: typeof saved?.alertThresholdPct === "number" ? saved.alertThresholdPct : 80,
      updatedAt: saved?.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async function queryAppDb(appId, sql, params = []) {
    try {
      const res = await fetch(`http://127.0.0.1:8099/api/apps/${appId}/_db/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(2500)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.rows) ? data.rows : [];
    } catch {
      return [];
    }
  }
  async function fetchLiveGeminiModels(apiKey, forceRefresh = false) {
    if (!forceRefresh && _cachedModelsList && Date.now() - _cachedModelsTs < 3e5) {
      return {
        models: _cachedModelsList,
        fetchedAt: _cachedModelsFetchedAt || (/* @__PURE__ */ new Date()).toISOString(),
        liveOk: true
      };
    }
    if (!apiKey) {
      const fallback = MODEL_PRICING_TABLE.map((spec) => ({
        id: spec.modelPrefix,
        displayName: spec.displayName,
        description: "Standard-Modellreferenz (Kein API Key hinterlegt)",
        inputTokenLimit: spec.contextWindowTokens,
        outputTokenLimit: spec.outputLimitTokens,
        supportedMethods: ["generateContent"],
        pricing: spec
      }));
      return {
        models: fallback,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        liveOk: false,
        error: "Kein Gemini API Key hinterlegt"
      };
    }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(5e3) }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
      }
      const data = await res.json();
      const rawModels = data.models || [];
      const filtered = rawModels.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => {
        const cleanId = m.name.replace(/^models\//, "");
        const pricing = findModelPricing(cleanId);
        return {
          id: cleanId,
          displayName: m.displayName || cleanId,
          description: m.description || "",
          inputTokenLimit: m.inputTokenLimit || pricing.contextWindowTokens,
          outputTokenLimit: m.outputTokenLimit || pricing.outputLimitTokens,
          supportedMethods: m.supportedGenerationMethods || ["generateContent"],
          pricing
        };
      }).sort((a, b) => {
        const aGem = a.id.startsWith("gemini-2.5") || a.id.startsWith("gemini-3") ? 0 : 1;
        const bGem = b.id.startsWith("gemini-2.5") || b.id.startsWith("gemini-3") ? 0 : 1;
        if (aGem !== bGem) return aGem - bGem;
        return a.id.localeCompare(b.id);
      });
      _cachedModelsList = filtered;
      _cachedModelsFetchedAt = (/* @__PURE__ */ new Date()).toISOString();
      _cachedModelsTs = Date.now();
      return {
        models: filtered,
        fetchedAt: _cachedModelsFetchedAt,
        liveOk: true
      };
    } catch (err) {
      const fallback = MODEL_PRICING_TABLE.map((spec) => ({
        id: spec.modelPrefix,
        displayName: spec.displayName,
        description: "Fallback-Modellreferenz",
        inputTokenLimit: spec.contextWindowTokens,
        outputTokenLimit: spec.outputLimitTokens,
        supportedMethods: ["generateContent"],
        pricing: spec
      }));
      return {
        models: fallback,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        liveOk: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  ctx.route("GET", "/overview", async (req) => {
    const forceRefreshModels = req.query?.refreshModels === "1";
    const keyInfo = resolveGeminiKeyInfo();
    const budget = getBudgetConfig();
    const oauthStatus = ctx.google.getStatus();
    const oauthConfigRaw = ctx.sharedDb.kvGet("google_oauth_config", null);
    const oauthTokensRaw = ctx.sharedDb.kvGet("google_oauth_tokens", null);
    const cortexRows = await queryAppDb(
      "cortex",
      `SELECT id, blueprint_id, substr(prompt, 1, 140) as prompt, topic_query, response_pattern, model_used,
              length(prompt) as prompt_chars, length(enriched_context) as ctx_chars, length(response_text) as resp_chars,
              duration_ms, created_at
       FROM cortex_runs
       ORDER BY id DESC
       LIMIT 200`
    );
    const callLog = [];
    for (const r of cortexRows) {
      const model = r.model_used || "gemini-2.5-flash";
      const isFallback = model.toLowerCase().includes("local") || model.toLowerCase().includes("fallback");
      const inputTokens = Math.max(
        32,
        Math.ceil(((Number(r.prompt_chars) || 0) + (Number(r.ctx_chars) || 0) + 420) / 4)
      );
      const outputTokens = Math.max(16, Math.ceil((Number(r.resp_chars) || 0) / 4));
      const cost = computeCallCost(model, inputTokens, outputTokens);
      callLog.push({
        id: `cortex-${r.id}`,
        timestamp: r.created_at || (/* @__PURE__ */ new Date()).toISOString(),
        appId: "cortex",
        appLabel: "Cortex AI",
        service: "Google Gemini API (generateContent)",
        endpoint: `v1beta/models/${model.split(" ")[0]}:generateContent`,
        model,
        promptPreview: r.topic_query ? `[${r.response_pattern}] ${r.topic_query}: ${r.prompt}` : r.prompt,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs: Number(r.duration_ms) || 0,
        status: isFallback ? "fallback" : "ok",
        estimatedCostUsd: cost.usd,
        estimatedCostEur: cost.eur,
        tokenAccountingSource: "char_estimate"
      });
    }
    const printRows = await queryAppDb(
      "3d-print",
      `SELECT id, name, category, scene_json, updated_at, created_at FROM print_projects ORDER BY updated_at DESC LIMIT 60`
    );
    let cadCallsCount = 0;
    for (const pr of printRows) {
      try {
        const scene = JSON.parse(pr.scene_json || "{}");
        const history = Array.isArray(scene.promptHistory) ? scene.promptHistory : [];
        for (let i = 0; i < history.length; i++) {
          const h = history[i];
          const engine = String(h.engine || scene.generatorEngine || "gemini-2.5-flash");
          const isParametric = engine.toLowerCase().includes("parametric");
          const modelName = isParametric ? "parametric-v2 (Lokal)" : engine;
          const promptStr = String(h.prompt || pr.name || "3D CAD Modell");
          const inputTokens = Math.ceil((promptStr.length + 1200) / 4);
          const outputTokens = Math.ceil((pr.scene_json?.length || 1600) / 5);
          const cost = computeCallCost(modelName, inputTokens, outputTokens);
          cadCallsCount++;
          callLog.push({
            id: `3dprint-${pr.id}-${i}`,
            timestamp: h.timestamp || pr.updated_at || pr.created_at || (/* @__PURE__ */ new Date()).toISOString(),
            appId: "3d-print",
            appLabel: "3D-Print CAD Studio",
            service: isParametric ? "Lokaler CAD-Synthesizer" : "Google Gemini 3D-CAD",
            endpoint: isParametric ? "local/parametric-csg" : `v1beta/models/${modelName}:generateContent`,
            model: modelName,
            promptPreview: `[3D-CAD: ${pr.name}] ${promptStr}`,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            latencyMs: isParametric ? 45 : 2450,
            status: isParametric ? "fallback" : "ok",
            estimatedCostUsd: cost.usd,
            estimatedCostEur: cost.eur,
            tokenAccountingSource: "char_estimate"
          });
        }
      } catch {
      }
    }
    const sharedLogs = ctx.sharedDb.kvGet("google_api_usage_log", []) || [];
    for (const item of sharedLogs) {
      if (item && item.id) {
        callLog.push(item);
      }
    }
    const calSourceRows = await queryAppDb(
      "google-calendar",
      `SELECT source, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM events GROUP BY source`
    );
    const calFeedRows = await queryAppDb(
      "google-calendar",
      `SELECT COUNT(*) as cnt, MAX(last_synced_at) as last_sync FROM feeds`
    );
    const gcalOAuthEvents = Number(calSourceRows.find((r) => r.source === "google_oauth")?.cnt || 0);
    const gcalIcsEvents = Number(calSourceRows.find((r) => r.source === "ics_feed")?.cnt || 0);
    const gcalLocalEvents = Number(calSourceRows.find((r) => r.source === "local" || !r.source)?.cnt || 0);
    const gcalFeedsCount = Number(calFeedRows[0]?.cnt || 0);
    const gcalLastSync = calFeedRows[0]?.last_sync || calSourceRows.find((r) => r.source === "google_oauth")?.last_sync || null;
    const memoSourceRows = await queryAppDb(
      "memo",
      `SELECT source_type, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM memo_entries GROUP BY source_type`
    );
    const driveDocsCount = Number(
      memoSourceRows.find((r) => r.source_type === "drive")?.cnt || 0
    );
    const keepNotesCount = Number(
      memoSourceRows.find((r) => r.source_type === "keep")?.cnt || 0
    );
    const markdownVaultCount = Number(
      memoSourceRows.find((r) => r.source_type === "markdown" || r.source_type === "manual")?.cnt || 0
    );
    const memoLastSync = memoSourceRows.find((r) => r.source_type === "drive" || r.source_type === "keep")?.last_sync || memoSourceRows[0]?.last_sync || null;
    const healthRows = await queryAppDb(
      "google-health",
      `SELECT source, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM biometrics_daily GROUP BY source`
    );
    const healthDaysCount = healthRows.reduce((s, r) => s + (Number(r.cnt) || 0), 0);
    const healthLastSync = healthRows[0]?.last_sync || null;
    callLog.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const now = /* @__PURE__ */ new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const monthPrefix = now.toISOString().slice(0, 7);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let todayTokens = 0;
    let monthTokens = 0;
    let todayApiCalls = 0;
    let monthApiCalls = 0;
    let geminiCloudCalls = 0;
    let localFallbackCalls = 0;
    let totalLatencyMs = 0;
    let latencyCount = 0;
    let theoreticalCostTotalEur = 0;
    let theoreticalCostMonthEur = 0;
    let theoreticalCostTotalUsd = 0;
    let theoreticalCostMonthUsd = 0;
    const modelStatsMap = /* @__PURE__ */ new Map();
    const dailyMap = /* @__PURE__ */ new Map();
    for (let d = 13; d >= 0; d--) {
      const dt = new Date(now.getTime() - d * 864e5).toISOString().slice(0, 10);
      dailyMap.set(dt, {
        date: dt,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costEur: 0
      });
    }
    for (const c of callLog) {
      totalInputTokens += c.inputTokens;
      totalOutputTokens += c.outputTokens;
      theoreticalCostTotalEur += c.estimatedCostEur;
      theoreticalCostTotalUsd += c.estimatedCostUsd;
      if (c.status === "fallback") {
        localFallbackCalls++;
      } else {
        geminiCloudCalls++;
      }
      if (c.latencyMs > 0) {
        totalLatencyMs += c.latencyMs;
        latencyCount++;
      }
      const dayKey = (c.timestamp || "").slice(0, 10);
      const monthKey = (c.timestamp || "").slice(0, 7);
      if (dayKey === todayPrefix) {
        todayApiCalls++;
        todayTokens += c.totalTokens;
      }
      if (monthKey === monthPrefix) {
        monthApiCalls++;
        monthTokens += c.totalTokens;
        theoreticalCostMonthEur += c.estimatedCostEur;
        theoreticalCostMonthUsd += c.estimatedCostUsd;
      }
      if (dailyMap.has(dayKey)) {
        const entry = dailyMap.get(dayKey);
        entry.calls += 1;
        entry.inputTokens += c.inputTokens;
        entry.outputTokens += c.outputTokens;
        entry.totalTokens += c.totalTokens;
        entry.costEur = Number((entry.costEur + c.estimatedCostEur).toFixed(6));
      }
      const mKey = c.model || "gemini-2.5-flash";
      const spec = findModelPricing(mKey);
      const existing = modelStatsMap.get(mKey) || {
        model: mKey,
        displayName: spec.displayName,
        calls: 0,
        cloudCalls: 0,
        fallbackCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        latencySum: 0,
        estimatedCostEur: 0,
        estimatedCostUsd: 0
      };
      existing.calls += 1;
      if (c.status === "fallback") existing.fallbackCalls += 1;
      else existing.cloudCalls += 1;
      existing.inputTokens += c.inputTokens;
      existing.outputTokens += c.outputTokens;
      existing.totalTokens += c.totalTokens;
      existing.latencySum += c.latencyMs || 0;
      existing.avgLatencyMs = Math.round(existing.latencySum / existing.calls);
      existing.estimatedCostEur = Number((existing.estimatedCostEur + c.estimatedCostEur).toFixed(6));
      existing.estimatedCostUsd = Number((existing.estimatedCostUsd + c.estimatedCostUsd).toFixed(6));
      modelStatsMap.set(mKey, existing);
    }
    const workspaceSyncedRecords = gcalOAuthEvents + gcalIcsEvents + driveDocsCount + keepNotesCount + healthDaysCount;
    const liveModelsInfo = await fetchLiveGeminiModels(keyInfo.key, forceRefreshModels);
    const services = [
      {
        id: "gemini-cortex",
        name: "Google Gemini AI \u2014 Cortex Workspace",
        apiHost: "generativelanguage.googleapis.com",
        appId: "cortex",
        appPath: "/apps/cortex/",
        status: keyInfo.key ? "ok" : "warn",
        statusLabel: keyInfo.key ? "API Key Aktiv" : "Kein Key",
        callsCount: cortexRows.length,
        tokensCount: callLog.filter((c) => c.appId === "cortex").reduce((s, c) => s + c.totalTokens, 0),
        recordsSynced: cortexRows.length,
        lastActivityAt: cortexRows[0]?.created_at || null,
        estimatedCostEur: Number(
          callLog.filter((c) => c.appId === "cortex").reduce((s, c) => s + c.estimatedCostEur, 0).toFixed(5)
        ),
        quotaNote: "15 RPM / 1.500 RPD (Free) \xB7 2.000 RPM (Tier 1)"
      },
      {
        id: "gemini-3dprint",
        name: "Google Gemini 3D-CAD \u2014 Print Studio",
        apiHost: "generativelanguage.googleapis.com",
        appId: "3d-print",
        appPath: "/apps/3d-print/",
        status: keyInfo.key ? "ok" : "warn",
        statusLabel: keyInfo.key ? "Bereit" : "Parametric Fallback",
        callsCount: cadCallsCount,
        tokensCount: callLog.filter((c) => c.appId === "3d-print").reduce((s, c) => s + c.totalTokens, 0),
        recordsSynced: printRows.length,
        lastActivityAt: printRows[0]?.updated_at || null,
        estimatedCostEur: Number(
          callLog.filter((c) => c.appId === "3d-print").reduce((s, c) => s + c.estimatedCostEur, 0).toFixed(5)
        ),
        quotaNote: "CSG / OpenSCAD JSON-Synthese via Gemini Flash"
      },
      {
        id: "google-calendar-api",
        name: "Google Calendar API v3 & iCal Feeds",
        apiHost: "www.googleapis.com/calendar/v3",
        appId: "google-calendar",
        appPath: "/apps/google-calendar/",
        status: oauthStatus.authorized || gcalFeedsCount > 0 ? "ok" : "warn",
        statusLabel: oauthStatus.authorized ? "OAuth2 Autorisiert" : gcalFeedsCount > 0 ? `${gcalFeedsCount} iCal Feeds` : "Nicht verbunden",
        callsCount: gcalFeedsCount + (oauthStatus.authorized ? 12 : 0),
        tokensCount: 0,
        recordsSynced: gcalOAuthEvents + gcalIcsEvents + gcalLocalEvents,
        lastActivityAt: gcalLastSync,
        estimatedCostEur: 0,
        quotaNote: "Kostenlos (1.000.000 Queries / Tag Quota)"
      },
      {
        id: "google-drive-keep",
        name: "Google Drive API v3 & Google Keep Sync",
        apiHost: "www.googleapis.com/drive/v3",
        appId: "memo",
        appPath: "/apps/memo/",
        status: oauthStatus.authorized ? "ok" : "warn",
        statusLabel: oauthStatus.authorized ? "OAuth2 Aktiv" : "Lokal (.md Vault)",
        callsCount: driveDocsCount + keepNotesCount > 0 ? 8 : 1,
        tokensCount: 0,
        recordsSynced: driveDocsCount + keepNotesCount + markdownVaultCount,
        lastActivityAt: memoLastSync,
        estimatedCostEur: 0,
        quotaNote: `Drive: ${driveDocsCount} Docs \xB7 Keep: ${keepNotesCount} Notizen \xB7 Lokal: ${markdownVaultCount}`
      },
      {
        id: "google-fitness-api",
        name: "Google Fitness REST API & Health Connect",
        apiHost: "www.googleapis.com/fitness/v1",
        appId: "google-health",
        appPath: "/apps/google-health/",
        status: healthDaysCount > 0 || oauthStatus.authorized ? "ok" : "warn",
        statusLabel: healthDaysCount > 0 ? `${healthDaysCount} Tage synchronisiert` : "Wartet auf Sync",
        callsCount: healthDaysCount,
        tokensCount: 0,
        recordsSynced: healthDaysCount,
        lastActivityAt: healthLastSync,
        estimatedCostEur: 0,
        quotaNote: "Kostenlos via OAuth2 & Home Assistant Bridge"
      }
    ];
    const billedMonthEur = budget.billingTier === "free_tier" ? 0 : Number(theoreticalCostMonthEur.toFixed(4));
    const effectiveCreditUsedEur = Number(theoreticalCostMonthEur.toFixed(4));
    const budgetUsedPct = budget.monthlyBudgetEur > 0 ? Math.min(100, Number((effectiveCreditUsedEur / budget.monthlyBudgetEur * 100).toFixed(2))) : 0;
    const remainingCreditsEur = Math.max(
      0,
      Number((budget.totalPrepaidCreditsEur - theoreticalCostTotalEur).toFixed(4))
    );
    const scopesList = oauthTokensRaw?.scope ? String(oauthTokensRaw.scope).split(/\s+/).filter(Boolean) : oauthStatus.scopes || [];
    return {
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      geminiKey: {
        configured: Boolean(keyInfo.key),
        keyPreview: keyInfo.keyPreview,
        source: keyInfo.source,
        totalDiscoveredKeys: keyInfo.totalDiscoveredKeys
      },
      googleOAuth: {
        hasCredentials: oauthStatus.hasCredentials,
        authorized: oauthStatus.authorized,
        hasRefreshToken: Boolean(oauthTokensRaw?.refresh_token),
        expiryDate: oauthTokensRaw?.expiry_date || oauthStatus.expiryDate || null,
        clientIdPreview: oauthConfigRaw?.clientId ? `${oauthConfigRaw.clientId.slice(0, 18)}...` : null,
        redirectUri: oauthConfigRaw?.redirectUri || null,
        scopes: scopesList
      },
      budget,
      kpis: {
        totalApiCalls: callLog.length,
        todayApiCalls,
        monthApiCalls,
        geminiCloudCalls,
        localFallbackCalls,
        workspaceSyncedRecords,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        todayTokens,
        monthTokens,
        avgLatencyMs: latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0,
        billedMonthEur,
        theoreticalCostMonthEur: Number(theoreticalCostMonthEur.toFixed(4)),
        theoreticalCostTotalEur: Number(theoreticalCostTotalEur.toFixed(4)),
        theoreticalCostMonthUsd: Number(theoreticalCostMonthUsd.toFixed(4)),
        theoreticalCostTotalUsd: Number(theoreticalCostTotalUsd.toFixed(4)),
        remainingCreditsEur,
        budgetUsedPct
      },
      services,
      modelsBreakdown: Array.from(modelStatsMap.values()).sort(
        (a, b) => b.totalTokens - a.totalTokens
      ),
      dailyUsage: Array.from(dailyMap.values()),
      callLog: callLog.slice(0, 150),
      liveModels: liveModelsInfo,
      pricingReference: MODEL_PRICING_TABLE
    };
  });
  ctx.route("POST", "/budget", (req) => {
    const body = req.body || {};
    const current = getBudgetConfig();
    const updated = {
      monthlyBudgetEur: typeof body.monthlyBudgetEur === "number" && !Number.isNaN(body.monthlyBudgetEur) ? Math.max(0, body.monthlyBudgetEur) : current.monthlyBudgetEur,
      totalPrepaidCreditsEur: typeof body.totalPrepaidCreditsEur === "number" && !Number.isNaN(body.totalPrepaidCreditsEur) ? Math.max(0, body.totalPrepaidCreditsEur) : current.totalPrepaidCreditsEur,
      billingTier: body.billingTier === "free_tier" || body.billingTier === "pay_as_you_go" || body.billingTier === "vertex_credits" ? body.billingTier : current.billingTier,
      alertThresholdPct: typeof body.alertThresholdPct === "number" && !Number.isNaN(body.alertThresholdPct) ? Math.min(100, Math.max(10, body.alertThresholdPct)) : current.alertThresholdPct,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    ctx.sharedDb.kvSet("google_usage_budget", updated);
    return { ok: true, budget: updated };
  });
  ctx.route("POST", "/ping", async (req) => {
    const body = req.body || {};
    const keyInfo = resolveGeminiKeyInfo();
    if (!keyInfo.key) {
      return {
        status: 400,
        body: {
          ok: false,
          error: "Kein Gemini API Key konfiguriert. Bitte im Cortex Credentials Vault hinterlegen."
        }
      };
    }
    const requestedModel = String(body.model || "gemini-2.5-flash").trim();
    const testPrompt = String(
      body.prompt || "Antworte in exakt einem kurzen Satz auf Deutsch: Best\xE4tige, dass die Thassi Google Usage & Token-Telemetrie aktiv ist."
    ).trim();
    const started = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          requestedModel
        )}:generateContent?key=${encodeURIComponent(keyInfo.key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 120 }
          }),
          signal: AbortSignal.timeout(15e3)
        }
      );
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const errRecord = {
          id: `ping-${Date.now()}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          appId: "google-usage",
          appLabel: "Google Usage & AI",
          service: "Gemini Live-Quota-Test",
          endpoint: `v1beta/models/${requestedModel}:generateContent`,
          model: requestedModel,
          promptPreview: `[HTTP ${res.status}] ${testPrompt}`,
          inputTokens: Math.ceil(testPrompt.length / 4),
          outputTokens: 0,
          totalTokens: Math.ceil(testPrompt.length / 4),
          latencyMs,
          status: "error",
          estimatedCostUsd: 0,
          estimatedCostEur: 0,
          tokenAccountingSource: "char_estimate"
        };
        const prev2 = ctx.sharedDb.kvGet("google_api_usage_log", []) || [];
        ctx.sharedDb.kvSet("google_api_usage_log", [errRecord, ...prev2].slice(0, 200));
        return {
          ok: false,
          status: res.status,
          latencyMs,
          model: requestedModel,
          error: `HTTP ${res.status}: ${errText.slice(0, 240)}`
        };
      }
      const data = await res.json();
      const replyText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "(Keine Text-Antwort)";
      const inputTokens = Number(data.usageMetadata?.promptTokenCount) || Math.ceil(testPrompt.length / 4);
      const outputTokens = Number(data.usageMetadata?.candidatesTokenCount) || Math.ceil(replyText.length / 4);
      const totalTokens = Number(data.usageMetadata?.totalTokenCount) || inputTokens + outputTokens;
      const modelUsed = data.modelVersion || requestedModel;
      const cost = computeCallCost(modelUsed, inputTokens, outputTokens);
      const record = {
        id: `ping-${Date.now()}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        appId: "google-usage",
        appLabel: "Google Usage & AI",
        service: "Gemini Live-Quota-Test",
        endpoint: `v1beta/models/${requestedModel}:generateContent`,
        model: modelUsed,
        promptPreview: `[Live-Ping] ${testPrompt} -> "${replyText.slice(0, 90)}"`,
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs,
        status: "ok",
        estimatedCostUsd: cost.usd,
        estimatedCostEur: cost.eur,
        tokenAccountingSource: data.usageMetadata?.totalTokenCount ? "exact_metadata" : "char_estimate"
      };
      const prev = ctx.sharedDb.kvGet("google_api_usage_log", []) || [];
      ctx.sharedDb.kvSet("google_api_usage_log", [record, ...prev].slice(0, 200));
      return {
        ok: true,
        latencyMs,
        model: modelUsed,
        replyText,
        usageMetadata: {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: totalTokens
        },
        cost,
        record
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        model: requestedModel,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  });
});
export {
  index_default as default
};
