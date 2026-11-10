import {
  defineThassiApp,
  discoverAllGeminiApiKeysFromHass,
  discoverGeminiApiKeyFromHass,
} from '@thassi/sdk';

export interface GoogleUsageBudgetConfig {
  monthlyBudgetEur: number;
  totalPrepaidCreditsEur: number;
  billingTier: 'free_tier' | 'pay_as_you_go' | 'vertex_credits';
  alertThresholdPct: number;
  updatedAt: string;
}

export interface GoogleApiCallRecord {
  id: string;
  timestamp: string;
  appId: string;
  appLabel: string;
  service: string;
  endpoint: string;
  model: string;
  promptPreview: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'ok' | 'fallback' | 'error';
  estimatedCostUsd: number;
  estimatedCostEur: number;
  tokenAccountingSource: 'exact_metadata' | 'char_estimate' | 'oauth_sync';
}

export interface ModelPricingSpec {
  modelPrefix: string;
  displayName: string;
  provider: string;
  inputPricePer1MUsd: number;
  outputPricePer1MUsd: number;
  freeTierRpm: number;
  freeTierRpd: number;
  paidTierRpm: number;
  contextWindowTokens: number;
  outputLimitTokens: number;
}

const MODEL_PRICING_TABLE: ModelPricingSpec[] = [
  {
    modelPrefix: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    provider: 'Google AI Studio / Vertex',
    inputPricePer1MUsd: 0.15,
    outputPricePer1MUsd: 0.60,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2000,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536,
  },
  {
    modelPrefix: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    provider: 'Google AI Studio',
    inputPricePer1MUsd: 0.075,
    outputPricePer1MUsd: 0.30,
    freeTierRpm: 30,
    freeTierRpd: 1500,
    paidTierRpm: 4000,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536,
  },
  {
    modelPrefix: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'Google AI Studio / Vertex',
    inputPricePer1MUsd: 0.15,
    outputPricePer1MUsd: 0.60,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2000,
    contextWindowTokens: 1048576,
    outputLimitTokens: 65536,
  },
  {
    modelPrefix: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'Google AI Studio / Vertex',
    inputPricePer1MUsd: 1.25,
    outputPricePer1MUsd: 5.00,
    freeTierRpm: 5,
    freeTierRpd: 100,
    paidTierRpm: 1000,
    contextWindowTokens: 2097152,
    outputLimitTokens: 65536,
  },
  {
    modelPrefix: 'gemini-2.0-flash-lite',
    displayName: 'Gemini 2.0 Flash-Lite',
    provider: 'Google AI Studio',
    inputPricePer1MUsd: 0.075,
    outputPricePer1MUsd: 0.30,
    freeTierRpm: 30,
    freeTierRpd: 1500,
    paidTierRpm: 4000,
    contextWindowTokens: 1048576,
    outputLimitTokens: 8192,
  },
  {
    modelPrefix: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    provider: 'Google AI Studio',
    inputPricePer1MUsd: 0.10,
    outputPricePer1MUsd: 0.40,
    freeTierRpm: 15,
    freeTierRpd: 1500,
    paidTierRpm: 2000,
    contextWindowTokens: 1048576,
    outputLimitTokens: 8192,
  },
  {
    modelPrefix: 'gemma-3',
    displayName: 'Gemma 3 (27B / 12B IT)',
    provider: 'Google Open Weights API',
    inputPricePer1MUsd: 0.0,
    outputPricePer1MUsd: 0.0,
    freeTierRpm: 30,
    freeTierRpd: 14400,
    paidTierRpm: 2000,
    contextWindowTokens: 131072,
    outputLimitTokens: 8192,
  },
];

const USD_TO_EUR = 0.925;

function findModelPricing(modelName: string): ModelPricingSpec {
  const lower = (modelName || '').toLowerCase();
  if (lower.includes('local') || lower.includes('fallback') || lower.includes('parametric')) {
    return {
      modelPrefix: 'local-fallback',
      displayName: 'Lokaler Thassi Synthesizer (0 Credits)',
      provider: 'Lokal (HASS OS)',
      inputPricePer1MUsd: 0,
      outputPricePer1MUsd: 0,
      freeTierRpm: 9999,
      freeTierRpd: 999999,
      paidTierRpm: 9999,
      contextWindowTokens: 128000,
      outputLimitTokens: 16384,
    };
  }
  for (const spec of MODEL_PRICING_TABLE) {
    if (lower.startsWith(spec.modelPrefix) || lower.includes(spec.modelPrefix)) {
      return spec;
    }
  }
  return MODEL_PRICING_TABLE[2]; // default gemini-2.5-flash
}

function computeCallCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): { usd: number; eur: number } {
  const spec = findModelPricing(modelName);
  const usd =
    (inputTokens / 1_000_000) * spec.inputPricePer1MUsd +
    (outputTokens / 1_000_000) * spec.outputPricePer1MUsd;
  return {
    usd: Number(usd.toFixed(6)),
    eur: Number((usd * USD_TO_EUR).toFixed(6)),
  };
}

interface LiveGeminiModelInfo {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedMethods: string[];
  pricing: ModelPricingSpec;
}

let _cachedModelsList: LiveGeminiModelInfo[] | null = null;
let _cachedModelsFetchedAt: string | null = null;
let _cachedModelsTs = 0;

export default defineThassiApp(async (ctx) => {
  function resolveGeminiKeyInfo(): {
    key: string;
    source: string;
    totalDiscoveredKeys: number;
    keyPreview: string | null;
  } {
    const sharedKey = String(ctx.sharedDb.kvGet<string>('gemini_api_key', '') || '').trim();
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    const hassKeys = discoverAllGeminiApiKeysFromHass();
    const allKeys = Array.from(new Set([sharedKey, envKey, ...hassKeys].filter(Boolean)));
    const active = sharedKey || envKey || hassKeys[0] || '';
    let source = 'Nicht konfiguriert';
    if (sharedKey) source = 'Shared SQLite Vault (shared.db)';
    else if (envKey) source = 'Environment (GEMINI_API_KEY)';
    else if (hassKeys.length > 0) source = 'Home Assistant Core Storage';

    return {
      key: active,
      source,
      totalDiscoveredKeys: allKeys.length,
      keyPreview:
        active.length > 8 ? `${active.slice(0, 8)}••••${active.slice(-4)}` : active ? 'Konfiguriert' : null,
    };
  }

  function getBudgetConfig(): GoogleUsageBudgetConfig {
    const saved = ctx.sharedDb.kvGet<Partial<GoogleUsageBudgetConfig> | null>('google_usage_budget', null);
    return {
      monthlyBudgetEur: typeof saved?.monthlyBudgetEur === 'number' ? saved.monthlyBudgetEur : 10.0,
      totalPrepaidCreditsEur:
        typeof saved?.totalPrepaidCreditsEur === 'number' ? saved.totalPrepaidCreditsEur : 25.0,
      billingTier:
        saved?.billingTier === 'pay_as_you_go' ||
        saved?.billingTier === 'vertex_credits' ||
        saved?.billingTier === 'free_tier'
          ? saved.billingTier
          : 'free_tier',
      alertThresholdPct: typeof saved?.alertThresholdPct === 'number' ? saved.alertThresholdPct : 80,
      updatedAt: saved?.updatedAt || new Date().toISOString(),
    };
  }

  async function queryAppDb<T = Record<string, any>>(
    appId: string,
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    try {
      const res = await fetch(`http://127.0.0.1:8099/api/apps/${appId}/_db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { rows?: T[] };
      return Array.isArray(data.rows) ? data.rows : [];
    } catch {
      return [];
    }
  }

  async function fetchLiveGeminiModels(
    apiKey: string,
    forceRefresh = false
  ): Promise<{ models: LiveGeminiModelInfo[]; fetchedAt: string; liveOk: boolean; error?: string }> {
    if (!forceRefresh && _cachedModelsList && Date.now() - _cachedModelsTs < 300_000) {
      return {
        models: _cachedModelsList,
        fetchedAt: _cachedModelsFetchedAt || new Date().toISOString(),
        liveOk: true,
      };
    }

    if (!apiKey) {
      const fallback = MODEL_PRICING_TABLE.map((spec) => ({
        id: spec.modelPrefix,
        displayName: spec.displayName,
        description: 'Standard-Modellreferenz (Kein API Key hinterlegt)',
        inputTokenLimit: spec.contextWindowTokens,
        outputTokenLimit: spec.outputLimitTokens,
        supportedMethods: ['generateContent'],
        pricing: spec,
      }));
      return {
        models: fallback,
        fetchedAt: new Date().toISOString(),
        liveOk: false,
        error: 'Kein Gemini API Key hinterlegt',
      };
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
      }
      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          displayName?: string;
          description?: string;
          inputTokenLimit?: number;
          outputTokenLimit?: number;
          supportedGenerationMethods?: string[];
        }>;
      };
      const rawModels = data.models || [];
      const filtered: LiveGeminiModelInfo[] = rawModels
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => {
          const cleanId = m.name.replace(/^models\//, '');
          const pricing = findModelPricing(cleanId);
          return {
            id: cleanId,
            displayName: m.displayName || cleanId,
            description: m.description || '',
            inputTokenLimit: m.inputTokenLimit || pricing.contextWindowTokens,
            outputTokenLimit: m.outputTokenLimit || pricing.outputLimitTokens,
            supportedMethods: m.supportedGenerationMethods || ['generateContent'],
            pricing,
          };
        })
        .sort((a, b) => {
          const aGem = a.id.startsWith('gemini-2.5') || a.id.startsWith('gemini-3') ? 0 : 1;
          const bGem = b.id.startsWith('gemini-2.5') || b.id.startsWith('gemini-3') ? 0 : 1;
          if (aGem !== bGem) return aGem - bGem;
          return a.id.localeCompare(b.id);
        });

      _cachedModelsList = filtered;
      _cachedModelsFetchedAt = new Date().toISOString();
      _cachedModelsTs = Date.now();
      return {
        models: filtered,
        fetchedAt: _cachedModelsFetchedAt,
        liveOk: true,
      };
    } catch (err) {
      const fallback = MODEL_PRICING_TABLE.map((spec) => ({
        id: spec.modelPrefix,
        displayName: spec.displayName,
        description: 'Fallback-Modellreferenz',
        inputTokenLimit: spec.contextWindowTokens,
        outputTokenLimit: spec.outputLimitTokens,
        supportedMethods: ['generateContent'],
        pricing: spec,
      }));
      return {
        models: fallback,
        fetchedAt: new Date().toISOString(),
        liveOk: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // GET /overview — Full Google Usage, AI Credits, OAuth2 & Quota telemetry across all Thassi apps
  ctx.route('GET', '/overview', async (req) => {
    const forceRefreshModels = req.query?.refreshModels === '1';
    const keyInfo = resolveGeminiKeyInfo();
    const budget = getBudgetConfig();
    const oauthStatus = ctx.google.getStatus();

    const oauthConfigRaw = ctx.sharedDb.kvGet<{
      clientId?: string;
      redirectUri?: string;
      updatedAt?: string;
    } | null>('google_oauth_config', null);

    const oauthTokensRaw = ctx.sharedDb.kvGet<{
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      token_type?: string;
      expiry_date?: number;
    } | null>('google_oauth_tokens', null);

    // 1. Collect calls from Cortex (`cortex_runs`)
    const cortexRows = await queryAppDb<{
      id: number;
      blueprint_id: string;
      prompt: string;
      topic_query: string;
      response_pattern: string;
      model_used: string;
      prompt_chars: number;
      ctx_chars: number;
      resp_chars: number;
      duration_ms: number;
      created_at: string;
    }>(
      'cortex',
      `SELECT id, blueprint_id, substr(prompt, 1, 140) as prompt, topic_query, response_pattern, model_used,
              length(prompt) as prompt_chars, length(enriched_context) as ctx_chars, length(response_text) as resp_chars,
              duration_ms, created_at
       FROM cortex_runs
       ORDER BY id DESC
       LIMIT 200`
    );

    const callLog: GoogleApiCallRecord[] = [];

    for (const r of cortexRows) {
      const model = r.model_used || 'gemini-2.5-flash';
      const isFallback =
        model.toLowerCase().includes('local') || model.toLowerCase().includes('fallback');
      const inputTokens = Math.max(
        32,
        Math.ceil(((Number(r.prompt_chars) || 0) + (Number(r.ctx_chars) || 0) + 420) / 4)
      );
      const outputTokens = Math.max(16, Math.ceil((Number(r.resp_chars) || 0) / 4));
      const cost = computeCallCost(model, inputTokens, outputTokens);
      callLog.push({
        id: `cortex-${r.id}`,
        timestamp: r.created_at || new Date().toISOString(),
        appId: 'cortex',
        appLabel: 'Cortex AI',
        service: 'Google Gemini API (generateContent)',
        endpoint: `v1beta/models/${model.split(' ')[0]}:generateContent`,
        model,
        promptPreview: r.topic_query ? `[${r.response_pattern}] ${r.topic_query}: ${r.prompt}` : r.prompt,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs: Number(r.duration_ms) || 0,
        status: isFallback ? 'fallback' : 'ok',
        estimatedCostUsd: cost.usd,
        estimatedCostEur: cost.eur,
        tokenAccountingSource: 'char_estimate',
      });
    }

    // 2. Collect AI CAD generations from 3D-Print (`print_projects`)
    const printRows = await queryAppDb<{
      id: number;
      name: string;
      category: string;
      scene_json: string;
      updated_at: string;
      created_at: string;
    }>(
      '3d-print',
      `SELECT id, name, category, scene_json, updated_at, created_at FROM print_projects ORDER BY updated_at DESC LIMIT 60`
    );

    let cadCallsCount = 0;
    for (const pr of printRows) {
      try {
        const scene = JSON.parse(pr.scene_json || '{}');
        const history = Array.isArray(scene.promptHistory) ? scene.promptHistory : [];
        for (let i = 0; i < history.length; i++) {
          const h = history[i];
          const engine = String(h.engine || scene.generatorEngine || 'gemini-2.5-flash');
          const isParametric = engine.toLowerCase().includes('parametric');
          const modelName = isParametric ? 'parametric-v2 (Lokal)' : engine;
          const promptStr = String(h.prompt || pr.name || '3D CAD Modell');
          const inputTokens = Math.ceil((promptStr.length + 1200) / 4);
          const outputTokens = Math.ceil((pr.scene_json?.length || 1600) / 5);
          const cost = computeCallCost(modelName, inputTokens, outputTokens);
          cadCallsCount++;
          callLog.push({
            id: `3dprint-${pr.id}-${i}`,
            timestamp: h.timestamp || pr.updated_at || pr.created_at || new Date().toISOString(),
            appId: '3d-print',
            appLabel: '3D-Print CAD Studio',
            service: isParametric ? 'Lokaler CAD-Synthesizer' : 'Google Gemini 3D-CAD',
            endpoint: isParametric
              ? 'local/parametric-csg'
              : `v1beta/models/${modelName}:generateContent`,
            model: modelName,
            promptPreview: `[3D-CAD: ${pr.name}] ${promptStr}`,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            latencyMs: isParametric ? 45 : 2450,
            status: isParametric ? 'fallback' : 'ok',
            estimatedCostUsd: cost.usd,
            estimatedCostEur: cost.eur,
            tokenAccountingSource: 'char_estimate',
          });
        }
      } catch {}
    }

    // 3. Collect explicit logged calls from shared.db (`google_api_usage_log`)
    const sharedLogs =
      ctx.sharedDb.kvGet<GoogleApiCallRecord[]>('google_api_usage_log', []) || [];
    for (const item of sharedLogs) {
      if (item && item.id) {
        callLog.push(item);
      }
    }

    // 4. Collect Google Calendar OAuth & iCal stats
    const calSourceRows = await queryAppDb<{
      source: string;
      cnt: number;
      last_sync: string;
    }>(
      'google-calendar',
      `SELECT source, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM events GROUP BY source`
    );
    const calFeedRows = await queryAppDb<{
      cnt: number;
      last_sync: string;
    }>(
      'google-calendar',
      `SELECT COUNT(*) as cnt, MAX(last_synced_at) as last_sync FROM feeds`
    );

    const gcalOAuthEvents =
      Number(calSourceRows.find((r) => r.source === 'google_oauth')?.cnt || 0);
    const gcalIcsEvents =
      Number(calSourceRows.find((r) => r.source === 'ics_feed')?.cnt || 0);
    const gcalLocalEvents =
      Number(calSourceRows.find((r) => r.source === 'local' || !r.source)?.cnt || 0);
    const gcalFeedsCount = Number(calFeedRows[0]?.cnt || 0);
    const gcalLastSync =
      calFeedRows[0]?.last_sync ||
      calSourceRows.find((r) => r.source === 'google_oauth')?.last_sync ||
      null;

    // 5. Collect Google Drive & Keep stats from `memo`
    const memoSourceRows = await queryAppDb<{
      source_type: string;
      cnt: number;
      last_sync: string;
    }>(
      'memo',
      `SELECT source_type, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM memo_entries GROUP BY source_type`
    );
    const driveDocsCount = Number(
      memoSourceRows.find((r) => r.source_type === 'drive')?.cnt || 0
    );
    const keepNotesCount = Number(
      memoSourceRows.find((r) => r.source_type === 'keep')?.cnt || 0
    );
    const markdownVaultCount = Number(
      memoSourceRows.find((r) => r.source_type === 'markdown' || r.source_type === 'manual')?.cnt || 0
    );
    const memoLastSync =
      memoSourceRows.find((r) => r.source_type === 'drive' || r.source_type === 'keep')?.last_sync ||
      memoSourceRows[0]?.last_sync ||
      null;

    // 6. Collect Google Health / Fitness stats from `google-health`
    const healthRows = await queryAppDb<{
      source: string;
      cnt: number;
      last_sync: string;
    }>(
      'google-health',
      `SELECT source, COUNT(*) as cnt, MAX(updated_at) as last_sync FROM biometrics_daily GROUP BY source`
    );
    const healthDaysCount = healthRows.reduce((s, r) => s + (Number(r.cnt) || 0), 0);
    const healthLastSync = healthRows[0]?.last_sync || null;

    // Sort call log newest first
    callLog.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // Compute time-window aggregates
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

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

    const modelStatsMap = new Map<
      string,
      {
        model: string;
        displayName: string;
        calls: number;
        cloudCalls: number;
        fallbackCalls: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        avgLatencyMs: number;
        latencySum: number;
        estimatedCostEur: number;
        estimatedCostUsd: number;
      }
    >();

    const dailyMap = new Map<
      string,
      {
        date: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costEur: number;
      }
    >();

    // Seed last 14 days
    for (let d = 13; d >= 0; d--) {
      const dt = new Date(now.getTime() - d * 86400_000).toISOString().slice(0, 10);
      dailyMap.set(dt, {
        date: dt,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costEur: 0,
      });
    }

    for (const c of callLog) {
      totalInputTokens += c.inputTokens;
      totalOutputTokens += c.outputTokens;
      theoreticalCostTotalEur += c.estimatedCostEur;
      theoreticalCostTotalUsd += c.estimatedCostUsd;

      if (c.status === 'fallback') {
        localFallbackCalls++;
      } else {
        geminiCloudCalls++;
      }

      if (c.latencyMs > 0) {
        totalLatencyMs += c.latencyMs;
        latencyCount++;
      }

      const dayKey = (c.timestamp || '').slice(0, 10);
      const monthKey = (c.timestamp || '').slice(0, 7);

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
        const entry = dailyMap.get(dayKey)!;
        entry.calls += 1;
        entry.inputTokens += c.inputTokens;
        entry.outputTokens += c.outputTokens;
        entry.totalTokens += c.totalTokens;
        entry.costEur = Number((entry.costEur + c.estimatedCostEur).toFixed(6));
      }

      const mKey = c.model || 'gemini-2.5-flash';
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
        estimatedCostUsd: 0,
      };
      existing.calls += 1;
      if (c.status === 'fallback') existing.fallbackCalls += 1;
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

    const workspaceSyncedRecords =
      gcalOAuthEvents + gcalIcsEvents + driveDocsCount + keepNotesCount + healthDaysCount;

    // Live Gemini models & quotas
    const liveModelsInfo = await fetchLiveGeminiModels(keyInfo.key, forceRefreshModels);

    // Services breakdown table
    const services = [
      {
        id: 'gemini-cortex',
        name: 'Google Gemini AI — Cortex Workspace',
        apiHost: 'generativelanguage.googleapis.com',
        appId: 'cortex',
        appPath: '/apps/cortex/',
        status: keyInfo.key ? 'ok' : 'warn',
        statusLabel: keyInfo.key ? 'API Key Aktiv' : 'Kein Key',
        callsCount: cortexRows.length,
        tokensCount: callLog
          .filter((c) => c.appId === 'cortex')
          .reduce((s, c) => s + c.totalTokens, 0),
        recordsSynced: cortexRows.length,
        lastActivityAt: cortexRows[0]?.created_at || null,
        estimatedCostEur: Number(
          callLog
            .filter((c) => c.appId === 'cortex')
            .reduce((s, c) => s + c.estimatedCostEur, 0)
            .toFixed(5)
        ),
        quotaNote: '15 RPM / 1.500 RPD (Free) · 2.000 RPM (Tier 1)',
      },
      {
        id: 'gemini-3dprint',
        name: 'Google Gemini 3D-CAD — Print Studio',
        apiHost: 'generativelanguage.googleapis.com',
        appId: '3d-print',
        appPath: '/apps/3d-print/',
        status: keyInfo.key ? 'ok' : 'warn',
        statusLabel: keyInfo.key ? 'Bereit' : 'Parametric Fallback',
        callsCount: cadCallsCount,
        tokensCount: callLog
          .filter((c) => c.appId === '3d-print')
          .reduce((s, c) => s + c.totalTokens, 0),
        recordsSynced: printRows.length,
        lastActivityAt: printRows[0]?.updated_at || null,
        estimatedCostEur: Number(
          callLog
            .filter((c) => c.appId === '3d-print')
            .reduce((s, c) => s + c.estimatedCostEur, 0)
            .toFixed(5)
        ),
        quotaNote: 'CSG / OpenSCAD JSON-Synthese via Gemini Flash',
      },
      {
        id: 'google-calendar-api',
        name: 'Google Calendar API v3 & iCal Feeds',
        apiHost: 'www.googleapis.com/calendar/v3',
        appId: 'google-calendar',
        appPath: '/apps/google-calendar/',
        status: oauthStatus.authorized || gcalFeedsCount > 0 ? 'ok' : 'warn',
        statusLabel: oauthStatus.authorized
          ? 'OAuth2 Autorisiert'
          : gcalFeedsCount > 0
            ? `${gcalFeedsCount} iCal Feeds`
            : 'Nicht verbunden',
        callsCount: gcalFeedsCount + (oauthStatus.authorized ? 12 : 0),
        tokensCount: 0,
        recordsSynced: gcalOAuthEvents + gcalIcsEvents + gcalLocalEvents,
        lastActivityAt: gcalLastSync,
        estimatedCostEur: 0,
        quotaNote: 'Kostenlos (1.000.000 Queries / Tag Quota)',
      },
      {
        id: 'google-drive-keep',
        name: 'Google Drive API v3 & Google Keep Sync',
        apiHost: 'www.googleapis.com/drive/v3',
        appId: 'memo',
        appPath: '/apps/memo/',
        status: oauthStatus.authorized ? 'ok' : 'warn',
        statusLabel: oauthStatus.authorized ? 'OAuth2 Aktiv' : 'Lokal (.md Vault)',
        callsCount: driveDocsCount + keepNotesCount > 0 ? 8 : 1,
        tokensCount: 0,
        recordsSynced: driveDocsCount + keepNotesCount + markdownVaultCount,
        lastActivityAt: memoLastSync,
        estimatedCostEur: 0,
        quotaNote: `Drive: ${driveDocsCount} Docs · Keep: ${keepNotesCount} Notizen · Lokal: ${markdownVaultCount}`,
      },
      {
        id: 'google-fitness-api',
        name: 'Google Fitness REST API & Health Connect',
        apiHost: 'www.googleapis.com/fitness/v1',
        appId: 'google-health',
        appPath: '/apps/google-health/',
        status: healthDaysCount > 0 || oauthStatus.authorized ? 'ok' : 'warn',
        statusLabel:
          healthDaysCount > 0 ? `${healthDaysCount} Tage synchronisiert` : 'Wartet auf Sync',
        callsCount: healthDaysCount,
        tokensCount: 0,
        recordsSynced: healthDaysCount,
        lastActivityAt: healthLastSync,
        estimatedCostEur: 0,
        quotaNote: 'Kostenlos via OAuth2 & Home Assistant Bridge',
      },
    ];

    const billedMonthEur =
      budget.billingTier === 'free_tier' ? 0 : Number(theoreticalCostMonthEur.toFixed(4));
    const effectiveCreditUsedEur = Number(theoreticalCostMonthEur.toFixed(4));
    const budgetUsedPct =
      budget.monthlyBudgetEur > 0
        ? Math.min(100, Number(((effectiveCreditUsedEur / budget.monthlyBudgetEur) * 100).toFixed(2)))
        : 0;
    const remainingCreditsEur = Math.max(
      0,
      Number((budget.totalPrepaidCreditsEur - theoreticalCostTotalEur).toFixed(4))
    );

    const scopesList = oauthTokensRaw?.scope
      ? String(oauthTokensRaw.scope)
          .split(/\s+/)
          .filter(Boolean)
      : oauthStatus.scopes || [];

    return {
      fetchedAt: new Date().toISOString(),
      geminiKey: {
        configured: Boolean(keyInfo.key),
        keyPreview: keyInfo.keyPreview,
        source: keyInfo.source,
        totalDiscoveredKeys: keyInfo.totalDiscoveredKeys,
      },
      googleOAuth: {
        hasCredentials: oauthStatus.hasCredentials,
        authorized: oauthStatus.authorized,
        hasRefreshToken: Boolean(oauthTokensRaw?.refresh_token),
        expiryDate: oauthTokensRaw?.expiry_date || oauthStatus.expiryDate || null,
        clientIdPreview: oauthConfigRaw?.clientId
          ? `${oauthConfigRaw.clientId.slice(0, 18)}...`
          : null,
        redirectUri: oauthConfigRaw?.redirectUri || null,
        scopes: scopesList,
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
        budgetUsedPct,
      },
      services,
      modelsBreakdown: Array.from(modelStatsMap.values()).sort(
        (a, b) => b.totalTokens - a.totalTokens
      ),
      dailyUsage: Array.from(dailyMap.values()),
      callLog: callLog.slice(0, 150),
      liveModels: liveModelsInfo,
      pricingReference: MODEL_PRICING_TABLE,
    };
  });

  // POST /budget — Update AI Credits & Monthly Budget configuration in shared.db
  ctx.route('POST', '/budget', (req) => {
    const body = (req.body || {}) as Partial<GoogleUsageBudgetConfig>;
    const current = getBudgetConfig();
    const updated: GoogleUsageBudgetConfig = {
      monthlyBudgetEur:
        typeof body.monthlyBudgetEur === 'number' && !Number.isNaN(body.monthlyBudgetEur)
          ? Math.max(0, body.monthlyBudgetEur)
          : current.monthlyBudgetEur,
      totalPrepaidCreditsEur:
        typeof body.totalPrepaidCreditsEur === 'number' && !Number.isNaN(body.totalPrepaidCreditsEur)
          ? Math.max(0, body.totalPrepaidCreditsEur)
          : current.totalPrepaidCreditsEur,
      billingTier:
        body.billingTier === 'free_tier' ||
        body.billingTier === 'pay_as_you_go' ||
        body.billingTier === 'vertex_credits'
          ? body.billingTier
          : current.billingTier,
      alertThresholdPct:
        typeof body.alertThresholdPct === 'number' && !Number.isNaN(body.alertThresholdPct)
          ? Math.min(100, Math.max(10, body.alertThresholdPct))
          : current.alertThresholdPct,
      updatedAt: new Date().toISOString(),
    };
    ctx.sharedDb.kvSet('google_usage_budget', updated);
    return { ok: true, budget: updated };
  });

  // POST /ping — Live Gemini API call & exact usageMetadata token accounting test
  ctx.route('POST', '/ping', async (req) => {
    const body = (req.body || {}) as { model?: string; prompt?: string };
    const keyInfo = resolveGeminiKeyInfo();
    if (!keyInfo.key) {
      return {
        status: 400,
        body: {
          ok: false,
          error:
            'Kein Gemini API Key konfiguriert. Bitte im Cortex Credentials Vault hinterlegen.',
        },
      };
    }

    const requestedModel = String(body.model || 'gemini-2.5-flash').trim();
    const testPrompt = String(
      body.prompt ||
        'Antworte in exakt einem kurzen Satz auf Deutsch: Bestätige, dass die Thassi Google Usage & Token-Telemetrie aktiv ist.'
    ).trim();

    const started = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          requestedModel
        )}:generateContent?key=${encodeURIComponent(keyInfo.key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 120 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const errRecord: GoogleApiCallRecord = {
          id: `ping-${Date.now()}`,
          timestamp: new Date().toISOString(),
          appId: 'google-usage',
          appLabel: 'Google Usage & AI',
          service: 'Gemini Live-Quota-Test',
          endpoint: `v1beta/models/${requestedModel}:generateContent`,
          model: requestedModel,
          promptPreview: `[HTTP ${res.status}] ${testPrompt}`,
          inputTokens: Math.ceil(testPrompt.length / 4),
          outputTokens: 0,
          totalTokens: Math.ceil(testPrompt.length / 4),
          latencyMs,
          status: 'error',
          estimatedCostUsd: 0,
          estimatedCostEur: 0,
          tokenAccountingSource: 'char_estimate',
        };
        const prev = ctx.sharedDb.kvGet<GoogleApiCallRecord[]>('google_api_usage_log', []) || [];
        ctx.sharedDb.kvSet('google_api_usage_log', [errRecord, ...prev].slice(0, 200));

        return {
          ok: false,
          status: res.status,
          latencyMs,
          model: requestedModel,
          error: `HTTP ${res.status}: ${errText.slice(0, 240)}`,
        };
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
        modelVersion?: string;
      };

      const replyText =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('')
          .trim() || '(Keine Text-Antwort)';

      const inputTokens =
        Number(data.usageMetadata?.promptTokenCount) || Math.ceil(testPrompt.length / 4);
      const outputTokens =
        Number(data.usageMetadata?.candidatesTokenCount) || Math.ceil(replyText.length / 4);
      const totalTokens =
        Number(data.usageMetadata?.totalTokenCount) || inputTokens + outputTokens;

      const modelUsed = data.modelVersion || requestedModel;
      const cost = computeCallCost(modelUsed, inputTokens, outputTokens);

      const record: GoogleApiCallRecord = {
        id: `ping-${Date.now()}`,
        timestamp: new Date().toISOString(),
        appId: 'google-usage',
        appLabel: 'Google Usage & AI',
        service: 'Gemini Live-Quota-Test',
        endpoint: `v1beta/models/${requestedModel}:generateContent`,
        model: modelUsed,
        promptPreview: `[Live-Ping] ${testPrompt} -> "${replyText.slice(0, 90)}"`,
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs,
        status: 'ok',
        estimatedCostUsd: cost.usd,
        estimatedCostEur: cost.eur,
        tokenAccountingSource: data.usageMetadata?.totalTokenCount
          ? 'exact_metadata'
          : 'char_estimate',
      };

      const prev = ctx.sharedDb.kvGet<GoogleApiCallRecord[]>('google_api_usage_log', []) || [];
      ctx.sharedDb.kvSet('google_api_usage_log', [record, ...prev].slice(0, 200));

      return {
        ok: true,
        latencyMs,
        model: modelUsed,
        replyText,
        usageMetadata: {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: totalTokens,
        },
        cost,
        record,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        model: requestedModel,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
});
