import fs from 'node:fs';
import path from 'node:path';
import {
  defineThassiApp,
  ThassiActionRegistry,
  discoverGeminiApiKeyFromHass,
  callGeminiGenerateContent,
  executeFederatedMemoSearch,
} from '@thassi/sdk';

export interface CortexBlueprint {
  id: string;
  name: string;
  code: string;
  description: string;
  promptTemplate: string;
  contextScopes: string[];
  responsePattern:
    | 'SYNTHESIS_BRIEF'
    | 'ACTION_PLAN'
    | 'KNOWLEDGE_EXTRACT'
    | 'DECISION_MATRIX'
    | 'DATA_TABLE';
  autoExecuteAxons: boolean;
  autoSaveToMemo: boolean;
}

export interface ProposedAxonCall {
  axonId: string;
  reason: string;
  input: Record<string, any>;
  executed?: boolean;
  status?: 'success' | 'error';
  resultSummary?: string;
}

export interface CortexRunRow {
  id: number;
  blueprint_id: string;
  prompt: string;
  topic_query: string;
  context_scopes: string;
  response_pattern: string;
  model_used: string;
  enriched_context: string;
  response_text: string;
  proposed_actions_json: string;
  duration_ms: number;
  created_at: string;
}

const DEFAULT_BLUEPRINTS: CortexBlueprint[] = [
  {
    id: 'daily-executive-brief',
    name: 'Tages-Briefing & Fokus-Synthese',
    code: 'BRIEF',
    description:
      'Kombiniert Kalender, Raumklima/HA, Finanzen, PC-Status und Memo-Notizen zu einem präzisen Lagebild.',
    promptTemplate:
      'Analysiere meinen aktuellen Tagesstatus anhand aller Live-Daten (Kalender, Smart Home, Finanzen, Memo-Notizen) und erstelle ein kompaktes Executive Briefing mit den 3 wichtigsten Prioritäten.',
    contextScopes: ['memo', 'calendar', 'ha', 'finance', 'pc'],
    responsePattern: 'SYNTHESIS_BRIEF',
    autoExecuteAxons: false,
    autoSaveToMemo: false,
  },
  {
    id: 'memo-deep-research',
    name: 'Memo Wissens-Synthese & Fakten-Extraktor',
    code: 'MEMO-RAG',
    description:
      'Durchsucht Google Drive, Notizen, lokale .md-Dateien und SQLite-Tabellen zum gewünschten Thema und kristallisiert strukturierte Erkenntnisse.',
    promptTemplate:
      'Recherchiere in meinen Memo-Quellen (Google Drive, .md-Dateien, Notizen & Datenbank) zum Thema "{{topic}}" und fasse alle relevanten Fakten, offenen Punkte und Referenzen strukturiert zusammen.',
    contextScopes: ['memo'],
    responsePattern: 'KNOWLEDGE_EXTRACT',
    autoExecuteAxons: false,
    autoSaveToMemo: false,
  },
  {
    id: 'smart-home-pc-operator',
    name: 'Quasi-Agentischer Smart Home & PC Operator',
    code: 'AGENT-OP',
    description:
      'Plant konkrete Aktionen über Thassi Axons (Lichter, Schalter, PC-Steuerung, Kalender, Memo) und führt sie auf Wunsch direkt aus.',
    promptTemplate:
      'Prüfe den aktuellen Zustand von Büro OG, Wohnküche und Entwickler-PC (DESKTOP-M8TJERB) und schlage passende Steuerungs-Axons für "{{topic}}" vor.',
    contextScopes: ['ha', 'pc', 'calendar'],
    responsePattern: 'ACTION_PLAN',
    autoExecuteAxons: false,
    autoSaveToMemo: false,
  },
  {
    id: 'finance-market-optimizer',
    name: 'Finanz-, Budget- & Einkaufs-Entscheidungsmatrix',
    code: 'DECIDE',
    description:
      'Verbindet den aktuellen Kontostand und Kategorie-Budgets mit Ernährungsplan und Preisdaten für fundierte Kauf- oder Budget-Entscheidungen.',
    promptTemplate:
      'Bewerte anhand meiner aktuellen Finanz-Kennzahlen, Ausgaben-Kategorien und Essensplanung folgende Frage oder Anschaffung: "{{topic}}".',
    contextScopes: ['finance', 'meals', 'memo'],
    responsePattern: 'DECISION_MATRIX',
    autoExecuteAxons: false,
    autoSaveToMemo: false,
  },
  {
    id: 'energy-3dprint-scheduler',
    name: 'Energie-Spotpreis & Verbraucher-Tabellenanalyse',
    code: 'TABLE',
    description:
      'Analysiert EPEX-Spot-Strompreise (aWATTar AT) und aktuelle Leistungsmessungen der Shelly-Steckdosen als präzise Datentabelle.',
    promptTemplate:
      'Erstelle eine tabellarische Übersicht der günstigsten Strompreis-Zeitfenster heute sowie der aktuell aktiven Verbraucher im Haus.',
    contextScopes: ['energy', 'ha'],
    responsePattern: 'DATA_TABLE',
    autoExecuteAxons: false,
    autoSaveToMemo: false,
  },
];

export default defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS cortex_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blueprint_id TEXT NOT NULL DEFAULT 'custom',
      prompt TEXT NOT NULL,
      topic_query TEXT NOT NULL DEFAULT '',
      context_scopes TEXT NOT NULL DEFAULT '',
      response_pattern TEXT NOT NULL DEFAULT 'SYNTHESIS_BRIEF',
      model_used TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
      enriched_context TEXT NOT NULL DEFAULT '',
      response_text TEXT NOT NULL DEFAULT '',
      proposed_actions_json TEXT NOT NULL DEFAULT '[]',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const actionRegistry = new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
  const dataDir = path.resolve(
    process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
  );

  function resolveGeminiKey(): string {
    let key = (
      ctx.db.kvGet<string>('gemini_api_key') ||
      ctx.sharedDb.kvGet<string>('gemini_api_key') ||
      process.env.GEMINI_API_KEY ||
      discoverGeminiApiKeyFromHass() ||
      ''
    ).trim();
    if (key && !ctx.sharedDb.kvGet<string>('gemini_api_key')) {
      try {
        ctx.sharedDb.kvSet('gemini_api_key', key);
      } catch {}
    }
    return key;
  }

  function getBlueprints(): CortexBlueprint[] {
    const saved = ctx.db.kvGet<CortexBlueprint[]>('cortex_blueprints');
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    ctx.db.kvSet('cortex_blueprints', DEFAULT_BLUEPRINTS);
    return DEFAULT_BLUEPRINTS;
  }

  // Gather rich local context blocks from selected scopes
  async function gatherLocalContext(
    scopes: string[],
    topicQuery: string
  ): Promise<{ blocks: Array<{ scope: string; summary: string; content: string }>; combinedText: string }> {
    const blocks: Array<{ scope: string; summary: string; content: string }> = [];

    const actionCtx = {
      sharedDb: ctx.sharedDb,
      ha: ctx.ha,
      google: ctx.google,
      dataDir,
      credentials: {
        geminiApiKey: resolveGeminiKey(),
        githubToken: ctx.sharedDb.kvGet<string>('github_token', '') || '',
        googleOAuthToken: ctx.sharedDb.kvGet<string>('google_oauth_token', '') || '',
      },
    };

    for (const scope of scopes) {
      try {
        if (scope === 'memo') {
          const hits = await executeFederatedMemoSearch(
            actionCtx,
            topicQuery,
            'all',
            10,
            (t) => actionRegistry.resolveGoogleAccessToken(t)
          );
          const text =
            hits.length > 0
              ? hits
                  .map(
                    (h, i) =>
                      `[${i + 1}] (${h.sourceBadge} · ${h.ref}) ${h.title}:\n${h.contentPreview || h.snippet}`
                  )
                  .join('\n\n')
              : 'Keine spezifischen Einträge in Memo gefunden.';
          blocks.push({
            scope: 'MEMO',
            summary: `${hits.length} Wissens-Treffer (Drive, .md, Notizen, DB)`,
            content: text,
          });
        } else if (scope === 'ha') {
          const states = await ctx.ha.getStates();
          const relevant = states
            .filter(
              (s) =>
                /buro|wohnkueche|vorzimmer|shelly|temperatur|luftfeuchtigkeit|power|leistung/i.test(
                  s.entity_id
                ) && s.state !== 'unavailable'
            )
            .slice(0, 35)
            .map(
              (s) =>
                `• ${s.attributes?.friendly_name || s.entity_id} (${s.entity_id}): ${s.state}${
                  s.attributes?.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''
                }`
            );
          blocks.push({
            scope: 'HA',
            summary: `${relevant.length} relevante Smart-Home-Entitäten (${states.length} gesamt)`,
            content: relevant.join('\n'),
          });
        } else if (scope === 'calendar') {
          const cal = await actionRegistry.execute<Record<string, any>>('gcal.upcoming', { maxResults: '10' });
          blocks.push({
            scope: 'GCAL',
            summary: cal.summary,
            content: String(cal.data?.formattedText || JSON.stringify(cal.data, null, 2)),
          });
        } else if (scope === 'finance') {
          const fin = await actionRegistry.execute('finance.summary.get', {});
          blocks.push({
            scope: 'FIN',
            summary: fin.summary,
            content: JSON.stringify(fin.data, null, 2).slice(0, 2500),
          });
        } else if (scope === 'health') {
          const fit = await actionRegistry.execute('google.fit.daily_summary', { days: '7' });
          blocks.push({
            scope: 'FIT',
            summary: fit.summary,
            content: JSON.stringify(fit.data, null, 2).slice(0, 2000),
          });
        } else if (scope === 'meals') {
          const meal = await actionRegistry.execute('meals.plan.today', {});
          blocks.push({
            scope: 'MEALS',
            summary: meal.summary,
            content: JSON.stringify(meal.data, null, 2).slice(0, 2000),
          });
        } else if (scope === 'pc') {
          const pc = await actionRegistry.execute('pc.status.telemetry', {});
          blocks.push({
            scope: 'PC',
            summary: pc.summary,
            content: JSON.stringify(pc.data, null, 2).slice(0, 2000),
          });
        } else if (scope === 'energy') {
          const en = await actionRegistry.execute('energy.awattar.prices_at', {});
          blocks.push({
            scope: 'ENERGY',
            summary: en.summary,
            content: JSON.stringify(en.data, null, 2).slice(0, 2000),
          });
        }
      } catch (err) {
        blocks.push({
          scope: scope.toUpperCase(),
          summary: `Hinweis: ${err instanceof Error ? err.message : String(err)}`,
          content: '',
        });
      }
    }

    const combinedText = blocks
      .filter((b) => b.content)
      .map((b) => `=== KONTEXT [${b.scope}] (${b.summary}) ===\n${b.content}`)
      .join('\n\n');

    return { blocks, combinedText };
  }

  // GET /bootstrap — returns blueprints, recent runs, available axons, and Gemini status
  ctx.route('GET', '/bootstrap', () => {
    const apiKey = resolveGeminiKey();
    const blueprints = getBlueprints();
    const runs = ctx.db.query<CortexRunRow>(
      'SELECT * FROM cortex_runs ORDER BY id DESC LIMIT 30'
    );
    const availableAxons = actionRegistry.listActions().map((a) => ({
      id: a.id,
      name: a.name,
      domainCode: a.domainCode,
      description: a.description,
      defaultInput: a.defaultInput,
    }));

    return {
      geminiConfigured: Boolean(apiKey),
      geminiKeyPreview: apiKey ? `${apiKey.slice(0, 8)}...` : null,
      blueprints,
      runs,
      availableAxons,
    };
  });

  // POST /config — Save custom Gemini API key
  ctx.route('POST', '/config', (req) => {
    const body = (req.body || {}) as { geminiApiKey?: string };
    const key = String(body.geminiApiKey || '').trim();
    if (!key) return { status: 400, body: { error: 'geminiApiKey is required' } };
    ctx.db.kvSet('gemini_api_key', key);
    ctx.sharedDb.kvSet('gemini_api_key', key);
    return { ok: true, geminiConfigured: true };
  });

  // Helper to build centralized Integration Vault snapshot
  function getIntegrationVaultSnapshot() {
    const geminiKey = resolveGeminiKey();
    const githubToken = (
      ctx.sharedDb.kvGet<string>('github_token') ||
      process.env.GITHUB_TOKEN ||
      ''
    ).trim();
    const oauthStatus = ctx.google.getStatus();
    const bambuCfg = ctx.sharedDb.kvGet<{
      ip?: string;
      serial?: string;
      accessCode?: string;
      model?: string;
      name?: string;
      lanOnlyMode?: boolean;
    }>('bambu_printer_config') || {};
    const printSummary = ctx.sharedDb.kvGet<{
      printerConfig?: {
        ip?: string;
        serial?: string;
        accessCodeConfigured?: boolean;
        model?: string;
        name?: string;
      };
      telemetry?: {
        connected?: boolean;
        connectionMode?: string;
        printerState?: string;
      };
    }>('thassi_3dprint_summary');

    const effectiveBambuIp = bambuCfg.ip || printSummary?.printerConfig?.ip || '';
    const effectiveBambuSerial = bambuCfg.serial || printSummary?.printerConfig?.serial || '';
    const effectiveBambuAccess = Boolean(
      bambuCfg.accessCode || printSummary?.printerConfig?.accessCodeConfigured
    );

    return {
      updatedAt: new Date().toISOString(),
      gemini: {
        configured: Boolean(geminiKey),
        keyPreview: geminiKey ? `${geminiKey.slice(0, 8)}••••${geminiKey.slice(-3)}` : null,
        appsUsing: ['Cortex', '3D-Print CAD', 'Projekte & Workflow', 'Kameras & Vision'],
      },
      googleOAuth: {
        configured: oauthStatus.configured,
        authorized: oauthStatus.authorized,
        clientIdPreview: oauthStatus.clientId || null,
        redirectUri:
          oauthStatus.redirectUri || 'http://192.168.188.92:8099/api/system/google/callback',
        expiresAt: oauthStatus.expiresAt || null,
        appsUsing: ['Google Calendar', 'Memo (Drive & Keep)', 'Google Health'],
      },
      bambu: {
        configured: Boolean(effectiveBambuIp && effectiveBambuSerial && effectiveBambuAccess),
        ip: effectiveBambuIp,
        serial: effectiveBambuSerial,
        accessCodeConfigured: effectiveBambuAccess,
        model: bambuCfg.model || printSummary?.printerConfig?.model || 'Bambu Lab P1S / X1C',
        name: bambuCfg.name || printSummary?.printerConfig?.name || 'Bambu Lab 3D-Drucker',
        lanOnlyMode: bambuCfg.lanOnlyMode ?? true,
        connectionMode: printSummary?.telemetry?.connectionMode || 'digital_twin_simulation',
        printerState: printSummary?.telemetry?.printerState || 'IDLE',
        appsUsing: ['3D-Druck & CAD'],
      },
      github: {
        configured: Boolean(githubToken),
        tokenPreview: githubToken ? `${githubToken.slice(0, 7)}••••` : null,
        repo: 'tsimhofer/thassi',
        appsUsing: ['Projekte & Workflow', 'Cortex'],
      },
      homeAssistant: {
        connected: ctx.ha.getStatus().connected,
        baseUrl: ctx.ha.getStatus().baseUrl,
        appsUsing: ['Alle 13 Thassi Apps'],
      },
    };
  }

  // GET /integrations — Read centralized credentials & integration status across all apps
  ctx.route('GET', '/integrations', () => {
    return getIntegrationVaultSnapshot();
  });

  // POST /integrations — Save credentials into the shared vault & propagate to target apps
  ctx.route('POST', '/integrations', async (req) => {
    const body = (req.body || {}) as {
      geminiApiKey?: string;
      githubToken?: string;
      googleOAuth?: {
        clientId?: string;
        clientSecret?: string;
        redirectUri?: string;
      };
      bambu?: {
        ip?: string;
        serial?: string;
        accessCode?: string;
        model?: string;
        name?: string;
        lanOnlyMode?: boolean;
      };
      icalFeed?: {
        name?: string;
        ics_url?: string;
        default_category?: string;
      };
    };

    const updatedItems: string[] = [];

    if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()) {
      const k = body.geminiApiKey.trim();
      ctx.db.kvSet('gemini_api_key', k);
      ctx.sharedDb.kvSet('gemini_api_key', k);
      updatedItems.push('Gemini API Key');
    }

    if (typeof body.githubToken === 'string' && body.githubToken.trim()) {
      const t = body.githubToken.trim();
      ctx.sharedDb.kvSet('github_token', t);
      updatedItems.push('GitHub Token');
    }

    if (body.googleOAuth && (body.googleOAuth.clientId || body.googleOAuth.clientSecret)) {
      ctx.google.saveConfig({
        clientId: body.googleOAuth.clientId,
        clientSecret: body.googleOAuth.clientSecret,
        redirectUri: body.googleOAuth.redirectUri,
      });
      updatedItems.push('Google OAuth2');
    }

    if (body.bambu) {
      const existing =
        ctx.sharedDb.kvGet<Record<string, unknown>>('bambu_printer_config') || {};
      const nextBambu = {
        ...existing,
        ...(body.bambu.ip !== undefined ? { ip: body.bambu.ip.trim() } : {}),
        ...(body.bambu.serial !== undefined ? { serial: body.bambu.serial.trim() } : {}),
        ...(body.bambu.accessCode && body.bambu.accessCode !== '••••••••'
          ? { accessCode: body.bambu.accessCode.trim() }
          : {}),
        ...(body.bambu.model ? { model: body.bambu.model } : {}),
        ...(body.bambu.name ? { name: body.bambu.name } : {}),
        ...(body.bambu.lanOnlyMode !== undefined ? { lanOnlyMode: body.bambu.lanOnlyMode } : {}),
      };
      ctx.sharedDb.kvSet('bambu_printer_config', nextBambu);
      try {
        await fetch('http://127.0.0.1:8099/api/apps/3d-print/printer/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextBambu),
        });
      } catch {
        // Ignore if 3d-print route is not yet warm
      }
      updatedItems.push('Bambu Lab LAN');
    }

    if (body.icalFeed && body.icalFeed.ics_url?.trim()) {
      try {
        await fetch('http://127.0.0.1:8099/api/apps/google-calendar/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: body.icalFeed.name || 'Kalender-Feed',
            ics_url: body.icalFeed.ics_url.trim(),
            default_category: body.icalFeed.default_category || 'personal',
          }),
        });
        updatedItems.push('iCal Kalender-Feed');
      } catch {
        // Ignore
      }
    }

    return {
      ok: true,
      updatedItems,
      integrations: getIntegrationVaultSnapshot(),
    };
  });

  // POST /integrations/test — Live connectivity test for configured credentials
  ctx.route('POST', '/integrations/test', async (req) => {
    const body = (req.body || {}) as { target?: 'gemini' | 'github' | 'bambu' | 'google_oauth' };
    const started = Date.now();

    if (body.target === 'gemini') {
      const key = resolveGeminiKey();
      if (!key) {
        return { ok: false, message: 'Kein GEMINI_API_KEY hinterlegt.', latencyMs: 0 };
      }
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) {
          return {
            ok: false,
            message: `Google Gemini API antwortete mit HTTP ${res.status}`,
            latencyMs: Date.now() - started,
          };
        }
        const data = (await res.json()) as { models?: unknown[] };
        return {
          ok: true,
          message: `Verbindung erfolgreich (${data.models?.length || 0} Gemini-Modelle verfügbar)`,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - started,
        };
      }
    }

    if (body.target === 'github') {
      const token = (
        ctx.sharedDb.kvGet<string>('github_token') ||
        process.env.GITHUB_TOKEN ||
        ''
      ).trim();
      if (!token) {
        return { ok: false, message: 'Kein GitHub Personal Access Token hinterlegt.', latencyMs: 0 };
      }
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Thassi-Host',
          },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return {
            ok: false,
            message: `GitHub API antwortete mit HTTP ${res.status}`,
            latencyMs: Date.now() - started,
          };
        }
        const user = (await res.json()) as { login?: string };
        return {
          ok: true,
          message: `GitHub authentifiziert als @${user.login || 'unknown'}`,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - started,
        };
      }
    }

    if (body.target === 'bambu') {
      try {
        const res = await fetch('http://127.0.0.1:8099/api/apps/3d-print/printer/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as { discoveredPrinters?: unknown[]; message?: string };
        return {
          ok: res.ok,
          message:
            data.message ||
            `${data.discoveredPrinters?.length || 0} Bambu-Drucker im LAN gefunden/geprüft`,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - started,
        };
      }
    }

    if (body.target === 'google_oauth') {
      try {
        const url = ctx.google.getAuthorizationUrl();
        return {
          ok: true,
          authUrl: url,
          message: 'OAuth2 Autorisierungs-URL erfolgreich generiert',
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - started,
        };
      }
    }

    return { ok: false, message: 'Unbekanntes Test-Ziel', latencyMs: 0 };
  });

  // POST /blueprints — Save or add a custom specialized query blueprint
  ctx.route('POST', '/blueprints', (req) => {
    const body = (req.body || {}) as Partial<CortexBlueprint>;
    if (!body.name || !body.promptTemplate) {
      return { status: 400, body: { error: 'name and promptTemplate are required' } };
    }
    const list = getBlueprints();
    const id =
      body.id ||
      body.name
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .slice(0, 40);
    const bp: CortexBlueprint = {
      id,
      name: body.name.trim(),
      code: (body.code || 'CUSTOM').toUpperCase().slice(0, 10),
      description: (body.description || '').trim(),
      promptTemplate: body.promptTemplate.trim(),
      contextScopes: Array.isArray(body.contextScopes) ? body.contextScopes : ['memo', 'ha'],
      responsePattern: body.responsePattern || 'SYNTHESIS_BRIEF',
      autoExecuteAxons: Boolean(body.autoExecuteAxons),
      autoSaveToMemo: Boolean(body.autoSaveToMemo),
    };
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) list[idx] = bp;
    else list.unshift(bp);
    ctx.db.kvSet('cortex_blueprints', list);
    return { ok: true, blueprint: bp, blueprints: list };
  });

  // POST /run — Execute a context-enriched, pattern-guided Gemini request (with optional quasi-agentic Axon execution)
  ctx.route('POST', '/run', async (req) => {
    const startedMs = Date.now();
    const body = (req.body || {}) as {
      blueprintId?: string;
      prompt?: string;
      topic?: string;
      contextScopes?: string[];
      responsePattern?: CortexBlueprint['responsePattern'];
      model?: string;
      autoExecuteAxons?: boolean;
      autoSaveToMemo?: boolean;
    };

    const apiKey = resolveGeminiKey();
    if (!apiKey) {
      return {
        status: 400,
        body: {
          error:
            'Kein Gemini API Key gefunden. Bitte oben rechts unter „API Key“ deinen Google Gemini API-Schlüssel hinterlegen.',
        },
      };
    }

    const topic = String(body.topic || '').trim();
    const rawPrompt = String(body.prompt || '').trim();
    const resolvedPrompt = rawPrompt.replace(/\{\{topic\}\}/gi, topic || 'Aktuelle Übersicht');
    if (!resolvedPrompt) {
      return { status: 400, body: { error: 'Prompt darf nicht leer sein.' } };
    }

    const scopes =
      Array.isArray(body.contextScopes) && body.contextScopes.length > 0
        ? body.contextScopes
        : ['memo', 'ha', 'calendar'];
    const pattern = body.responsePattern || 'SYNTHESIS_BRIEF';
    const model = String(body.model || 'gemini-2.5-flash').trim();

    // 1. Enrich with live local context
    const { blocks, combinedText } = await gatherLocalContext(scopes, topic || resolvedPrompt.slice(0, 60));

    // 2. Build system instruction & structured output guidance for the chosen response pattern
    const catalogSummary = actionRegistry
      .listActions()
      .slice(0, 32)
      .map((a) => `- ${a.id} (${a.name}): Inputs=${JSON.stringify(a.defaultInput)}`)
      .join('\n');

    const patternGuides: Record<string, string> = {
      SYNTHESIS_BRIEF: [
        'ANTWORT-MUSTER: SYNTHESIS_BRIEF (Executive Dossier).',
        'Strukturiere deine Antwort in Markdown exakt in:',
        '## 1. Kernaussage & Lagebild',
        '## 2. Fakten & Kennzahlen aus den lokalen Live-Daten',
        '## 3. Empfohlene nächste Schritte',
      ].join('\n'),
      ACTION_PLAN: [
        'ANTWORT-MUSTER: ACTION_PLAN (Quasi-Agentischer Ausführungsplan).',
        'Analysiere das Ziel und schlage konkrete, ausführbare Schritte mit Thassi Axons vor.',
        'Füge am Ende deiner Markdown-Antwort zwingend einen JSON-Codeblock ```json ... ``` mit einem Array von Axon-Aufrufen im Format:',
        '[{"axonId": "ha.service.call", "reason": "Kurze Begründung", "input": {"domain": "light", "service": "turn_on", "entityId": "light.buro_og_grosses_licht"}}]',
        'Verfügbare Axons:\n' + catalogSummary,
      ].join('\n'),
      KNOWLEDGE_EXTRACT: [
        'ANTWORT-MUSTER: KNOWLEDGE_EXTRACT (Memo Wissens-Kristallisator).',
        'Extrahiere aus den Live-Daten und der Anfrage ein dauerhaft speicherbares Wissens-Dokument in Markdown:',
        '# Titel des Wissens-Eintrags',
        '## Kernaussagen & Fakten',
        '## Strukturierte Details & Referenzen',
        '## Tags & Verknüpfungen',
      ].join('\n'),
      DECISION_MATRIX: [
        'ANTWORT-MUSTER: DECISION_MATRIX (Quantitative Entscheidungs-Matrix).',
        'Bewerte die Optionen anhand der echten lokalen Daten (Finanzen, Preise, Kalender, Energie):',
        '## 1. Optionen-Vergleich (Markdown-Tabelle mit Kosten / Nutzen / Risiko / Score)',
        '## 2. Datenbasierte Begründung',
        '## 3. Eindeutige Empfehlung',
      ].join('\n'),
      DATA_TABLE: [
        'ANTWORT-MUSTER: DATA_TABLE (Präzise Tabellen-Auswertung).',
        'Gib die angeforderten Daten primär als saubere Markdown-Tabelle mit tabellarischen Zahlenwerten aus, gefolgt von einer kurzen statistischen Zusammenfassung.',
      ].join('\n'),
    };

    const systemInstruction = [
      'Du bist CORTEX, die zentrale KI- und Agenten-Schnittstelle im Thassi Home & Life OS von Thomas Simhofer (St. Veit an der Gölsen, Österreich).',
      'Antworte präzise, faktenbasiert auf Basis der mitgelieferten lokalen Live-Daten und auf Deutsch.',
      patternGuides[pattern] || patternGuides.SYNTHESIS_BRIEF,
    ].join('\n\n');

    const fullUserPrompt = [
      `ANFRAGE / AUFTRAG:\n${resolvedPrompt}`,
      topic ? `\nFOKUS-THEMA: ${topic}` : '',
      combinedText ? `\nLOKALE LIVE-DATEN (${blocks.length} QUELLEN):\n${combinedText}` : '',
    ].join('\n');

    let rawReply = '';
    let modelUsed = model;
    let cloudNotice: string | null = null;

    try {
      const gemResult = await callGeminiGenerateContent({
        apiKey,
        model,
        prompt: fullUserPrompt,
        systemInstruction,
        temperature: pattern === 'DATA_TABLE' ? 0.1 : 0.25,
        timeoutMs: 25000,
      });
      rawReply = gemResult.text;
      modelUsed = gemResult.modelUsed;
    } catch (gemErr) {
      cloudNotice = gemErr instanceof Error ? gemErr.message : String(gemErr);
      modelUsed = 'cortex-local-synthesizer (Fallback: Gemini Cloud Quota/Key)';
      rawReply = synthesizeLocalCortexResponse(
        resolvedPrompt,
        topic,
        pattern,
        blocks,
        cloudNotice
      );
    }

    // 3. Parse any proposed Axon calls from JSON block if ACTION_PLAN or present
    const proposedActions: ProposedAxonCall[] = [];
    const jsonFenceMatch = rawReply.match(/```json\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
    if (jsonFenceMatch) {
      try {
        const parsed = JSON.parse(jsonFenceMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.axonId === 'string') {
              proposedActions.push({
                axonId: item.axonId,
                reason: String(item.reason || ''),
                input: typeof item.input === 'object' && item.input ? item.input : {},
              });
            }
          }
        }
      } catch {}
    }

    // 4. Optional automatic execution of proposed Axons
    if (body.autoExecuteAxons && proposedActions.length > 0) {
      for (const act of proposedActions) {
        try {
          const res = await actionRegistry.execute(act.axonId, act.input, {
            credentials: { geminiApiKey: apiKey },
          });
          act.executed = true;
          act.status = res.status;
          act.resultSummary = res.summary;
        } catch (err) {
          act.executed = true;
          act.status = 'error';
          act.resultSummary = err instanceof Error ? err.message : String(err);
        }
      }
    }

    // 5. Optional automatic save to Memo (.md Vault + SQLite)
    let savedMemoSummary: string | null = null;
    if (body.autoSaveToMemo) {
      try {
        const memoTitle =
          rawReply.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
          topic ||
          resolvedPrompt.slice(0, 55);
        const memoRes = await actionRegistry.execute('memo.note.upsert', {
          title: memoTitle,
          content: rawReply,
          tags: `cortex,${pattern.toLowerCase()}`,
          saveAsMarkdownFile: 'true',
        });
        savedMemoSummary = memoRes.summary;
      } catch {}
    }

    const durationMs = Date.now() - startedMs;
    const now = new Date().toISOString();

    const insertRes = ctx.db.execute(
      `INSERT INTO cortex_runs
       (blueprint_id, prompt, topic_query, context_scopes, response_pattern, model_used, enriched_context, response_text, proposed_actions_json, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.blueprintId || 'custom',
        resolvedPrompt,
        topic,
        scopes.join(','),
        pattern,
        modelUsed,
        combinedText,
        rawReply,
        JSON.stringify(proposedActions),
        durationMs,
        now,
      ]
    );

    return {
      runId: Number(insertRes.lastInsertRowid),
      modelUsed,
      responsePattern: pattern,
      durationMs,
      contextBlocks: blocks,
      responseText: rawReply,
      proposedActions,
      savedMemoSummary,
      createdAt: now,
    };
  });

  // POST /execute-action — Execute a single proposed Axon action from a Cortex run
  ctx.route('POST', '/execute-action', async (req) => {
    const body = (req.body || {}) as {
      axonId?: string;
      input?: Record<string, any>;
    };
    if (!body.axonId) {
      return { status: 400, body: { error: 'axonId is required' } };
    }
    const res = await actionRegistry.execute(body.axonId, body.input || {}, {
      credentials: { geminiApiKey: resolveGeminiKey() },
    });
    return {
       ok: res.status === 'success',
      status: res.status,
      summary: res.summary,
      data: res.data,
      durationMs: res.durationMs,
    };
  });
});

function synthesizeLocalCortexResponse(
  prompt: string,
  topic: string,
  pattern: string,
  blocks: Array<{ scope: string; summary: string; content: string }>,
  cloudNotice: string
): string {
  const nowStr = new Date().toLocaleString('de-AT');
  const scopeBullets = blocks.map((b) => `- **[${b.scope}]**: ${b.summary}`).join('\n');
  const detailExcerpts = blocks
    .filter((b) => b.content)
    .map((b) => `### Quelle: ${b.scope}\n${b.content.slice(0, 700)}`)
    .join('\n\n');

  const proposedJson = JSON.stringify(
    [
      {
        axonId: 'memo.search',
        reason: `Vertiefte Suche in Memo nach "${topic || 'Thassi'}"`,
        input: { query: topic || 'Thassi', sources: 'all', limit: '15' },
      },
      {
        axonId: 'pc.status.telemetry',
        reason: 'Live-Status von Entwickler-PC DESKTOP-M8TJERB abrufen',
        input: { agentUrl: 'http://192.168.188.46:5185' },
      },
      {
        axonId: 'ha.energy.live_power',
        reason: 'Aktuelle Shelly-Leistungsaufnahme im Haus prüfen',
        input: {},
      },
    ],
    null,
    2
  );

  return [
    `# CORTEX [${pattern}] — ${topic || 'Live-Systemanalyse'}`,
    `Stand: ${nowStr}`,
    '',
    `## 1. Kernaussage & Auftrag`,
    `Anfrage: "${prompt}"`,
    `Es wurden **${blocks.length} lokale Datenquellen** in Echtzeit aggregiert:`,
    scopeBullets,
    '',
    `## 2. Auswertung der angereicherten Live-Daten`,
    detailExcerpts || 'Keine Detaildaten in den gewählten Scopes.',
    '',
    `## 3. Empfohlene Quasi-Agentische Axon-Schritte`,
    '```json',
    proposedJson,
    '```',
    '',
    `> Hinweis zur Google Gemini Cloud-API: ${cloudNotice.slice(0, 220)} (Du kannst oben rechts unter „API Key“ jederzeit einen aktiven AI Studio Key hinterlegen).`,
  ].join('\n');
}
