import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dgram from 'node:dgram';
import { ThassiAppDatabase } from './db.js';
import { ThassiHaBridge, HaEntityState } from './ha-bridge.js';
import { ThassiGoogleOAuthManager } from './google-oauth.js';

export type ThassiActionCategory =
  | 'trigger'
  | 'homeassistant'
  | 'google'
  | 'gcal'
  | 'gmail'
  | 'fitness'
  | 'drive'
  | 'finance'
  | 'food'
  | 'market'
  | 'energy'
  | 'mobility'
  | 'network'
  | 'media'
  | 'youtube'
  | 'maps'
  | 'weather'
  | 'bambu'
  | 'vision'
  | 'github'
  | 'gemini'
  | 'system'
  | 'http'
  | 'custom';

export function discoverAllGeminiApiKeysFromHass(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY.trim());
  const candidatePaths = [
    '/homeassistant/.storage/core.config_entries',
    '/config/.storage/core.config_entries',
  ];
  for (const storagePath of candidatePaths) {
    try {
      if (fs.existsSync(storagePath)) {
        const raw = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
        const entries = raw?.data?.entries || [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          if (e.domain === 'google_generative_ai_conversation' && e.data?.api_key) {
            const k = String(e.data.api_key).trim();
            if (k && !keys.includes(k)) keys.push(k);
          }
        }
      }
    } catch {}
  }
  return keys;
}

export function discoverGeminiApiKeyFromHass(): string {
  return discoverAllGeminiApiKeysFromHass()[0] || '';
}

let _cachedLiveGeminiModels: string[] | null = null;
let _workingGeminiKey: string | null = null;

async function resolveAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (_cachedLiveGeminiModels && _cachedLiveGeminiModels.length > 0) {
    return _cachedLiveGeminiModels;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      const generateModels = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(
          (name) =>
            (/gemini|gemma/i.test(name)) &&
            !/embedding|vision-only|imagen|veo|computer-use|robotics|tts|audio|thinking-exp|image/i.test(name)
        );
      if (generateModels.length > 0) {
        const preferredOrder = [
          'gemini-3.8-flash',
          'gemini-3-flash-preview',
          'gemini-2.5-flash-lite',
          'gemini-2.0-flash',
          'gemini-2.0-flash-lite',
          'gemma-3-27b-it',
          'gemma-3-12b-it',
          'gemini-2.5-flash',
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
  } catch {}
  return [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemma-3-27b-it',
  ];
}

export async function callGeminiGenerateContent(options: {
  apiKey: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const allKeys = Array.from(
    new Set(
      [
        _workingGeminiKey || '',
        options.apiKey.trim(),
        ...discoverAllGeminiApiKeysFromHass(),
      ].filter(Boolean)
    )
  );
  if (allKeys.length === 0) {
    throw new Error('Gemini API Key ist nicht konfiguriert.');
  }

  let lastError = '';
  for (const keyCandidate of allKeys) {
    const discovered = await resolveAvailableGeminiModels(keyCandidate);
    const requested = (options.model || 'gemini-3.8-flash').trim();
    const candidates = Array.from(
      new Set([requested, 'gemini-3.8-flash', ...discovered])
    ).slice(0, 8);

    for (const model of candidates) {
      try {
        const isGemma = model.startsWith('gemma');
        const combinedPrompt =
          isGemma && options.systemInstruction
            ? `${options.systemInstruction}\n\n${options.prompt}`
            : options.prompt;

        const payload: Record<string, any> = {
          contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.25,
            ...(options.responseMimeType && !isGemma
              ? { responseMimeType: options.responseMimeType }
              : {}),
          },
        };
        if (options.systemInstruction && !isGemma) {
          payload.systemInstruction = {
            parts: [{ text: options.systemInstruction }],
          };
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(keyCandidate)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
          }
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          lastError = `Gemini ${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`;
          if ([400, 402, 403, 404, 429].includes(res.status)) continue;
          throw new Error(lastError);
        }

        const gemData = (await res.json()) as Record<string, any>;
        const text =
          gemData.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text || '')
            .join('')
            .trim() || '';
        if (text) {
          _workingGeminiKey = keyCandidate;
          return { text, modelUsed: model };
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  throw new Error(lastError || 'Gemini API request failed');
}

export type AxonCategory = ThassiActionCategory;

export interface ThassiActionFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean';
  placeholder?: string;
  options?: string[];
  required?: boolean;
  defaultValue?: string;
}

export type AxonFieldSchema = ThassiActionFieldSchema;

export interface ThassiActionContext {
  sharedDb: ThassiAppDatabase;
  ha: ThassiHaBridge;
  google: ThassiGoogleOAuthManager;
  dataDir: string;
  /** Optional upstream text/JSON piped from a previous workflow node */
  upstreamText?: string;
  /** Optional explicit credentials override (falls back to sharedDb KV / env) */
  credentials?: {
    geminiApiKey?: string;
    githubToken?: string;
    googleOAuthToken?: string;
  };
}

export type AxonContext = ThassiActionContext;

export interface ThassiActionResult<TOutput = unknown> {
  actionId: string;
  axonId: string;
  status: 'success' | 'error';
  durationMs: number;
  executedAt: string;
  summary: string;
  data: TOutput;
  errorCode?: string;
  remediationHint?: string;
}

export type AxonExecutionResult<TOutput = unknown> = ThassiActionResult<TOutput>;

export interface ThassiActionDefinition<TInput = Record<string, any>, TOutput = unknown> {
  id: string;
  name: string;
  domainCode: string;
  category: ThassiActionCategory;
  icon: string;
  description: string;
  fields: ThassiActionFieldSchema[];
  defaultInput: Record<string, string>;
  execute: (input: TInput, ctx: ThassiActionContext) => Promise<{ summary: string; data: TOutput }>;
}

export type AxonDefinition<TInput = Record<string, any>, TOutput = unknown> = ThassiActionDefinition<
  TInput,
  TOutput
>;

export interface ThassiActionMetadata {
  id: string;
  name: string;
  domainCode: string;
  category: ThassiActionCategory;
  icon: string;
  description: string;
  fields: ThassiActionFieldSchema[];
  defaultInput: Record<string, string>;
  lastStatus?: 'success' | 'error' | 'idle';
  lastDurationMs?: number | null;
  lastExecutedAt?: string | null;
  lastSummary?: string | null;
  totalRuns?: number;
}

export type AxonMetadata = ThassiActionMetadata;

function interpolateValue(template: string, upstreamText: string): string {
  if (!template) return '';
  return template.replace(/\{\{\$input\}\}/g, upstreamText || '');
}

function resolveDataDir(): string {
  return path.resolve(
    process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
  );
}

function openAppDatabaseReadWrite(dataDir: string, appId: string): ThassiAppDatabase {
  const dbPath = path.join(dataDir, 'apps', `${appId}.db`);
  return new ThassiAppDatabase(dbPath);
}

export class ThassiActionRegistry {
  private readonly actions = new Map<string, ThassiActionDefinition<any, any>>();
  private readonly telemetry = new Map<
    string,
    {
      lastStatus: 'success' | 'error';
      lastDurationMs: number;
      lastExecutedAt: string;
      lastSummary: string;
      totalRuns: number;
    }
  >();
  private readonly sharedDb: ThassiAppDatabase;
  private readonly ha: ThassiHaBridge;
  private readonly google: ThassiGoogleOAuthManager;
  private readonly dataDir: string;

  constructor(sharedDb: ThassiAppDatabase, ha: ThassiHaBridge, google: ThassiGoogleOAuthManager) {
    this.sharedDb = sharedDb;
    this.ha = ha;
    this.google = google;
    this.dataDir = resolveDataDir();
    this.loadPersistedTelemetry();
    this.registerCoreAxons();
  }

  private loadPersistedTelemetry(): void {
    try {
      const saved = this.sharedDb.kvGet<
        Record<
          string,
          {
            lastStatus: 'success' | 'error';
            lastDurationMs: number;
            lastExecutedAt: string;
            lastSummary: string;
            totalRuns: number;
          }
        >
      >('axons_telemetry');
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          this.telemetry.set(k, v);
        }
      }
    } catch {}
  }

  private persistTelemetry(): void {
    try {
      const obj = Object.fromEntries(this.telemetry.entries());
      this.sharedDb.kvSet('axons_telemetry', obj);
    } catch {}
  }

  register<TInput = Record<string, any>, TOutput = unknown>(
    definition: Omit<ThassiActionDefinition<TInput, TOutput>, 'domainCode'> & { domainCode?: string }
  ): void {
    const domainCode =
      definition.domainCode ||
      definition.id.split('.')[0].toUpperCase().slice(0, 6);
    this.actions.set(definition.id, {
      ...definition,
      domainCode,
    });
  }

  listActions(): ThassiActionMetadata[] {
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
        lastStatus: stat?.lastStatus || 'idle',
        lastDurationMs: stat?.lastDurationMs ?? null,
        lastExecutedAt: stat?.lastExecutedAt ?? null,
        lastSummary: stat?.lastSummary ?? null,
        totalRuns: stat?.totalRuns ?? 0,
      };
    });
  }

  listAxons(): AxonMetadata[] {
    return this.listActions();
  }

  getAction(actionId: string): ThassiActionDefinition<any, any> | undefined {
    return this.actions.get(actionId);
  }

  private resolveCredentials(override?: ThassiActionContext['credentials']): Required<
    NonNullable<ThassiActionContext['credentials']>
  > {
    let geminiApiKey =
      override?.geminiApiKey ||
      this.sharedDb.kvGet<string>('gemini_api_key', '') ||
      process.env.GEMINI_API_KEY ||
      '';
    if (!geminiApiKey) {
      const discovered = discoverGeminiApiKeyFromHass();
      if (discovered) {
        geminiApiKey = discovered;
        try {
          this.sharedDb.kvSet('gemini_api_key', discovered);
        } catch {}
      }
    }
    const githubToken =
      override?.githubToken ||
      this.sharedDb.kvGet<string>('github_token', '') ||
      process.env.GITHUB_TOKEN ||
      '';
    const googleOAuthToken =
      override?.googleOAuthToken ||
      this.sharedDb.kvGet<string>('google_oauth_token', '') ||
      '';
    return { geminiApiKey, githubToken, googleOAuthToken };
  }

  async resolveGoogleAccessToken(explicitToken?: string): Promise<string> {
    if (explicitToken && explicitToken.trim()) {
      return explicitToken.trim();
    }
    return await this.google.getValidAccessToken();
  }

  /**
   * Execute an atomic Axon by ID with full input interpolation (`{{$input}}`),
   * timing telemetry, and strict error reporting.
   */
  async execute<TOutput = unknown>(
    actionId: string,
    rawInput: Record<string, any> = {},
    options: {
      upstreamText?: string;
      credentials?: ThassiActionContext['credentials'];
    } = {}
  ): Promise<ThassiActionResult<TOutput>> {
    const startMs = Date.now();
    const executedAt = new Date().toISOString();
    const action = this.actions.get(actionId);
    const upstreamText = options.upstreamText || '';

    if (!action) {
      return {
        actionId,
        axonId: actionId,
        status: 'error',
        durationMs: Date.now() - startMs,
        executedAt,
        summary: `Unknown axon "${actionId}"`,
        data: { error: `Axon "${actionId}" is not registered.` } as unknown as TOutput,
        errorCode: 'UNKNOWN_AXON',
      };
    }

    const mergedInput: Record<string, any> = { ...action.defaultInput, ...rawInput };
    for (const [key, val] of Object.entries(mergedInput)) {
      if (typeof val === 'string' && upstreamText) {
        mergedInput[key] = interpolateValue(val, upstreamText);
      }
    }

    const ctx: ThassiActionContext = {
      sharedDb: this.sharedDb,
      ha: this.ha,
      google: this.google,
      dataDir: this.dataDir,
      upstreamText,
      credentials: this.resolveCredentials(options.credentials),
    };

    try {
      const res = await action.execute(mergedInput, ctx);
      const durationMs = Math.max(1, Date.now() - startMs);
      const prev = this.telemetry.get(actionId);
      this.telemetry.set(actionId, {
        lastStatus: 'success',
        lastDurationMs: durationMs,
        lastExecutedAt: executedAt,
        lastSummary: res.summary,
        totalRuns: (prev?.totalRuns || 0) + 1,
      });
      this.persistTelemetry();

      return {
        actionId,
        axonId: actionId,
        status: 'success',
        durationMs,
        executedAt,
        summary: res.summary,
        data: res.data,
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startMs);
      const message = err instanceof Error ? err.message : String(err);
      const prev = this.telemetry.get(actionId);
      this.telemetry.set(actionId, {
        lastStatus: 'error',
        lastDurationMs: durationMs,
        lastExecutedAt: executedAt,
        lastSummary: message,
        totalRuns: (prev?.totalRuns || 0) + 1,
      });
      this.persistTelemetry();

      return {
        actionId,
        axonId: actionId,
        status: 'error',
        durationMs,
        executedAt,
        summary: message,
        data: { error: message } as unknown as TOutput,
        errorCode: 'AXON_EXECUTION_FAILED',
      };
    }
  }

  private registerCoreAxons(): void {
    // =========================================================================
    // 1. HOME ASSISTANT AXONS (HA)
    // =========================================================================
    this.register({
      id: 'ha.get_state',
      name: 'Read Entity State',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Reads the live state, unit, and attributes of a single Home Assistant entity.',
      defaultInput: { entityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur' },
      fields: [
        {
          key: 'entityId',
          label: 'Entity ID',
          type: 'text',
          placeholder: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
          required: true,
        },
      ],
      execute: async (input, ctx) => {
        const entityId = String(input.entityId || '').trim();
        if (!entityId) throw new Error('entityId is required');
        const stateObj = await ctx.ha.getState(entityId);
        const unit = String(stateObj.attributes?.unit_of_measurement || '');
        const friendly = String(stateObj.attributes?.friendly_name || entityId);
        return {
          summary: `${friendly}: ${stateObj.state}${unit ? ' ' + unit : ''}`,
          data: {
            entity_id: stateObj.entity_id,
            state: stateObj.state,
            unit,
            friendly_name: friendly,
            attributes: stateObj.attributes,
            last_updated: stateObj.last_updated,
            formattedText: `${friendly} (${stateObj.entity_id}) = ${stateObj.state}${unit ? ' ' + unit : ''}`,
          },
        };
      },
    });

    this.register({
      id: 'ha.get_states',
      name: 'Query Entities by Domain / Search',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Filters all 597+ Home Assistant entities by domain (sensor, switch, light, camera, binary_sensor) and search keyword.',
      defaultInput: { domain: 'sensor', search: '', limit: '50' },
      fields: [
        { key: 'domain', label: 'Domain (optional)', type: 'text', placeholder: 'sensor / switch / light / camera' },
        { key: 'search', label: 'Search Filter (optional)', type: 'text', placeholder: 'shelly / pixel / power' },
        { key: 'limit', label: 'Max Rows', type: 'number', placeholder: '50' },
      ],
      execute: async (input, ctx) => {
        const domain = String(input.domain || '').trim() || undefined;
        const search = String(input.search || '').trim().toLowerCase();
        const limit = Math.max(1, Math.min(600, Number(input.limit || 50)));
        let states = await ctx.ha.getStates(domain);
        if (search) {
          states = states.filter(
            (s) =>
              s.entity_id.toLowerCase().includes(search) ||
              String(s.attributes?.friendly_name || '')
                .toLowerCase()
                .includes(search)
          );
        }
        const sliced = states.slice(0, limit).map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          unit: s.attributes?.unit_of_measurement || '',
          friendly_name: s.attributes?.friendly_name || s.entity_id,
          last_updated: s.last_updated,
        }));
        return {
          summary: `${states.length} matching entities (returning ${sliced.length})`,
          data: {
            domain: domain || 'all',
            search: search || null,
            totalMatches: states.length,
            returned: sliced.length,
            entities: sliced,
          },
        };
      },
    });

    this.register({
      id: 'ha.energy.live_power',
      name: 'Shelly & Smart Home Live Power',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Aggregates all active power sensors (W) and energy counters (kWh/Wh) across all Shelly relays and plugs.',
      defaultInput: { includeZero: 'true' },
      fields: [
        { key: 'includeZero', label: 'Include 0 W Channels', type: 'select', options: ['true', 'false'] },
      ],
      execute: async (input, ctx) => {
        const includeZero = String(input.includeZero || 'true') !== 'false';
        const sensors = await ctx.ha.getStates('sensor');
        const powerSensors = sensors
          .filter((s) => {
            const u = String(s.attributes?.unit_of_measurement || '');
            const dc = String(s.attributes?.device_class || '');
            return u === 'W' || dc === 'power';
          })
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            watts: Number(s.state),
            rawState: s.state,
          }))
          .filter((s) => Number.isFinite(s.watts) && (includeZero || s.watts > 0))
          .sort((a, b) => b.watts - a.watts);

        const totalWatts = Number(
          powerSensors.reduce((sum, s) => sum + s.watts, 0).toFixed(1)
        );
        return {
          summary: `${totalWatts} W total across ${powerSensors.length} power channels`,
          data: {
            totalWatts,
            activeChannels: powerSensors.filter((p) => p.watts > 0).length,
            totalChannels: powerSensors.length,
            channels: powerSensors,
          },
        };
      },
    });

    this.register({
      id: 'ha.rooms.snapshot',
      name: 'Spatial Rooms & Devices Snapshot',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Returns live temperatures, humidity, switch states, and power draw grouped by room.',
      defaultInput: { roomFilter: '' },
      fields: [
        { key: 'roomFilter', label: 'Room ID Filter (optional)', type: 'text', placeholder: 'buro_og / wohnkuche / vorzimmer_og' },
      ],
      execute: async (input, ctx) => {
        const allStates = await ctx.ha.getStates();
        const sm = new Map(allStates.map((s) => [s.entity_id, s]));
        const getNum = (id: string) => {
          const v = Number(sm.get(id)?.state);
          return Number.isFinite(v) ? v : null;
        };
        const buildDev = (entityId: string, label: string, powerId?: string) => {
          const st = sm.get(entityId);
          return {
            entityId,
            label,
            state: st?.state ?? 'unavailable',
            powerW: powerId ? getNum(powerId) : null,
          };
        };

        const rooms = [
          {
            id: 'buro_og',
            name: 'Büro OG',
            tempC: getNum('sensor.shellyhtg3_e4b32331dde0_temperatur'),
            humidityPct: getNum('sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit'),
            devices: [
              buildDev('light.buro_og_grosses_licht', 'Großes Licht', 'sensor.links_power'),
              buildDev('switch.buro_og_regal_lichter', 'Regal Lichter', 'sensor.shellyplugsg3_e4b063e4bfd8_power'),
              buildDev('switch.buro_og_plug_90', 'Schreibtisch Plug .90', 'sensor.kleines_licht_pumpe_power'),
              buildDev('switch.buro_og_bewasserung_pumpe', 'Bewässerung Pumpe', 'sensor.schalter_neu_power'),
              buildDev('light.thomasbuero_2pm_oben_output_1', 'Schalter Oben Rechts', 'sensor.thomasbuero_2pm_oben_switch_1_power'),
            ],
          },
          {
            id: 'wohnkuche',
            name: 'Wohnküche',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.wohnkueche_bodenbeleuchtung_boden', 'Bodenbeleuchtung', 'sensor.shelly_plus_2pm_a_switch_0_power'),
              buildDev('switch.wohnkueche_fensterbank_licht', 'Fensterbank Licht', 'sensor.bodenbeleuchtung_power'),
              buildDev('media_player.tv_samsung_6_series_49', 'Samsung TV (49")'),
            ],
          },
          {
            id: 'vorzimmer_og',
            name: 'Vorzimmer OG',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.vorzimmer_og_grosses_licht', 'Großes Licht'),
              buildDev('light.vorzimmer_og_bodenbeleuchtung_led', 'Bodenbeleuchtung LED'),
              buildDev('light.vorzimmer_og_alert_led', 'Alert LED'),
              buildDev('switch.shelly2pmg3_8cbfea9ac754_output_0', 'Shelly 2PM Kanal 1', 'sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung'),
              buildDev('switch.shelly2pmg3_8cbfea9ac754_output_1', 'Shelly 2PM Kanal 2', 'sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung'),
            ],
          },
          {
            id: 'bad_gaeste',
            name: 'Bad & Gäste',
            tempC: null,
            humidityPct: null,
            devices: [
              buildDev('switch.shelly1pmminig4_7c2c676dc6fc', 'Waschmaschine Bad OG', 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung'),
              buildDev('switch.gaestezimmer_schalter_rechts', 'Gästezimmer Schalter 1', 'sensor.shellyplus2pm_c049ef8a3a78_switch_0_power'),
              buildDev('switch.shellyplus2pm_c049ef8a3a78_switch_1', 'Gästezimmer Schalter 2', 'sensor.shellyplus2pm_c049ef8a3a78_switch_1_power'),
              buildDev('sensor.smart_series_8000_75b4_batterie', 'Oral-B Smart Series Akku'),
            ],
          },
        ];

        const filter = String(input.roomFilter || '').trim().toLowerCase();
        const filtered = filter
          ? rooms.filter((r) => r.id.includes(filter) || r.name.toLowerCase().includes(filter))
          : rooms;

        return {
          summary: `${filtered.length} rooms inspected (Büro OG: ${rooms[0].tempC ?? '—'} °C / ${rooms[0].humidityPct ?? '—'}%)`,
          data: { rooms: filtered },
        };
      },
    });

    this.register({
      id: 'ha.call_service',
      name: 'Call Service / Switch Device',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Invokes any Home Assistant service (light, switch, script, automation, media_player, persistent_notification).',
      defaultInput: {
        domain: 'persistent_notification',
        service: 'create',
        targetOrMessage: '{{$input}}',
      },
      fields: [
        {
          key: 'domain',
          label: 'Domain',
          type: 'select',
          options: ['persistent_notification', 'light', 'switch', 'script', 'automation', 'media_player', 'siren'],
        },
        {
          key: 'service',
          label: 'Service',
          type: 'select',
          options: ['create', 'turn_on', 'turn_off', 'toggle', 'trigger'],
        },
        {
          key: 'targetOrMessage',
          label: 'Entity ID, Message or JSON Payload',
          type: 'textarea',
          placeholder: 'light.buro_og_grosses_licht or {{$input}}',
        },
      ],
      execute: async (input, ctx) => {
        const domain = String(input.domain || 'persistent_notification').trim();
        const service = String(input.service || 'create').trim();
        const rawTarget = String(input.targetOrMessage || '').trim();

        let serviceData: Record<string, unknown> = {};
        if (input.serviceData && typeof input.serviceData === 'object') {
          serviceData = input.serviceData as Record<string, unknown>;
        } else if (rawTarget.startsWith('{') && rawTarget.endsWith('}')) {
          try {
            serviceData = JSON.parse(rawTarget);
          } catch {
            serviceData = { entity_id: rawTarget };
          }
        } else if (domain === 'persistent_notification') {
          serviceData = {
            title: String(input.title || 'Thassi Axon'),
            message: rawTarget.slice(0, 1000) || 'Executed via Thassi Axons',
          };
        } else if (rawTarget) {
          serviceData = { entity_id: rawTarget };
        }

        const response = await ctx.ha.callService(domain, service, serviceData);
        return {
          summary: `HA ${domain}.${service} -> ${String(serviceData.entity_id || serviceData.title || 'ok')}`,
          data: { domain, service, serviceData, response },
        };
      },
    });

    this.register({
      id: 'ha.publish_sensor',
      name: 'Publish Custom Sensor',
      domainCode: 'HA',
      category: 'homeassistant',
      icon: 'HA',
      description: 'Creates or updates a sensor.thassi_* entity in Home Assistant.',
      defaultInput: {
        sensorSlug: 'custom_metric',
        state: '100',
        unit: '',
        friendlyName: 'Thassi Metric',
      },
      fields: [
        { key: 'sensorSlug', label: 'Sensor Slug', type: 'text', placeholder: 'custom_metric' },
        { key: 'state', label: 'State Value', type: 'text', placeholder: '42.5 or {{$input}}' },
        { key: 'unit', label: 'Unit', type: 'text', placeholder: 'EUR / W / %' },
        { key: 'friendlyName', label: 'Friendly Name', type: 'text', placeholder: 'Thassi Metric' },
      ],
      execute: async (input, ctx) => {
        const slug = String(input.sensorSlug || 'custom_metric').trim();
        const stateVal = input.state ?? '';
        const published: HaEntityState = await ctx.ha.publishSensor(slug, String(stateVal), {
          friendly_name: input.friendlyName || `Thassi ${slug}`,
          unit_of_measurement: input.unit || undefined,
          ...(typeof input.attributes === 'object' ? input.attributes : {}),
        });
        return {
          summary: `${published.entity_id} = ${published.state}`,
          data: published,
        };
      },
    });

    this.register({
      id: 'ha.wearables.biometrics',
      name: 'Wearables & Mobile Telemetry (Pixel 10 / Watch)',
      domainCode: 'FIT',
      category: 'fitness',
      icon: 'FIT',
      description: 'Reads live steps, heart rate, battery, sleep, and activity states from Pixel 10, Pixel Watch, and iPad entities in Home Assistant.',
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const all = await ctx.ha.getStates();
        const wearableEntities = all
          .filter((s) => /pixel|watch|ipad|oralb|smart_series/i.test(s.entity_id))
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            state: s.state,
            unit: String(s.attributes?.unit_of_measurement || ''),
            last_updated: s.last_updated,
          }));

        return {
          summary: `${wearableEntities.length} wearable & mobile sensors read from Home Assistant`,
          data: {
            count: wearableEntities.length,
            sensors: wearableEntities,
          },
        };
      },
    });

    // =========================================================================
    // 2. GOOGLE CALENDAR, FITNESS, GMAIL & DRIVE AXONS
    // =========================================================================
    this.register({
      id: 'gcal.upcoming',
      name: 'Calendar: Upcoming Events',
      domainCode: 'GCAL',
      category: 'gcal',
      icon: 'GCAL',
      description: 'Fetches upcoming events from Google Calendar REST API v3 (or Home Assistant calendar.* entity).',
      defaultInput: { calendarId: 'primary', maxResults: '10' },
      fields: [
        { key: 'calendarId', label: 'Calendar ID', type: 'text', placeholder: 'primary' },
        { key: 'maxResults', label: 'Max Events', type: 'number', placeholder: '10' },
      ],
      execute: async (input, ctx): Promise<{ summary: string; data: Record<string, unknown> }> => {
        const calendarId = String(input.calendarId || 'primary').trim();
        const maxResults = Math.max(1, Math.min(50, Number(input.maxResults || 10)));

        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const timeMin = new Date().toISOString();
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`Google Calendar API ${res.status}: ${errBody || res.statusText}`);
          }
          const data = (await res.json()) as { items?: Array<Record<string, any>> };
          const items = (data.items || []).map((ev) => ({
            id: ev.id,
            summary: ev.summary || '(Ohne Titel)',
            start: ev.start?.dateTime || ev.start?.date || '',
            end: ev.end?.dateTime || ev.end?.date || '',
            location: ev.location || '',
            description: ev.description || '',
          }));
          const formattedText =
            items.length > 0
              ? items.map((e) => `• ${e.start} — ${e.summary}`).join('\n')
              : 'Keine anstehenden Termine.';
          return {
            summary: `${items.length} events from Google Calendar (${calendarId})`,
            data: { calendarId, source: 'google_calendar_api', count: items.length, events: items, formattedText },
          };
        } catch (googleErr) {
          const haEntityId = calendarId.startsWith('calendar.')
            ? calendarId
            : 'calendar.thomas_simhofer_gmail_com';
          const startIso = new Date().toISOString();
          const endIso = new Date(Date.now() + 14 * 86400_000).toISOString();
          const haEvents = await ctx.ha.getCalendarEvents(haEntityId, startIso, endIso);
          const items = haEvents.slice(0, maxResults).map((ev, idx) => ({
            id: ev.uid || `ha_${idx}`,
            summary: ev.summary || '(Ohne Titel)',
            start: ev.start?.dateTime || ev.start?.date || '',
            end: ev.end?.dateTime || ev.end?.date || '',
            location: ev.location || '',
            description: ev.description || '',
          }));
          const formattedText =
            items.length > 0
              ? items.map((e) => `• ${e.start} — ${e.summary}`).join('\n')
              : 'Keine anstehenden Termine.';
          return {
            summary: `${items.length} events via Home Assistant (${haEntityId})`,
            data: {
              calendarId: haEntityId,
              source: 'homeassistant_calendar',
              count: items.length,
              events: items,
              formattedText,
              googleAuthNotice: googleErr instanceof Error ? googleErr.message : String(googleErr),
            },
          };
        }
      },
    });

    this.register({
      id: 'gcal.create_event',
      name: 'Calendar: Create Event',
      domainCode: 'GCAL',
      category: 'gcal',
      icon: 'GCAL',
      description: 'Creates a calendar event via Google Calendar v3 or Home Assistant calendar.create_event.',
      defaultInput: {
        calendarId: 'primary',
        summary: '{{$input}}',
        startIso: '',
        durationMinutes: '30',
        description: '',
      },
      fields: [
        { key: 'calendarId', label: 'Calendar ID', type: 'text', placeholder: 'primary' },
        { key: 'summary', label: 'Summary', type: 'text', placeholder: 'Meeting / Task' },
        { key: 'startIso', label: 'Start ISO (empty = in 1h)', type: 'text', placeholder: '2026-10-20T14:00:00+02:00' },
        { key: 'durationMinutes', label: 'Duration (min)', type: 'number', placeholder: '30' },
        { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Notes' },
      ],
      execute: async (input, ctx): Promise<{ summary: string; data: Record<string, unknown> }> => {
        const calendarId = String(input.calendarId || 'primary').trim();
        const summary = String(input.summary || 'New Calendar Event').trim();
        const durationMin = Math.max(5, Number(input.durationMinutes || 30));
        const startDate = input.startIso ? new Date(String(input.startIso)) : new Date(Date.now() + 3600_000);
        const endDate = new Date(startDate.getTime() + durationMin * 60_000);

        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                summary,
                description: input.description || '',
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() },
              }),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Google Calendar POST ${res.status}: ${errText || res.statusText}`);
          }
          const created = (await res.json()) as Record<string, any>;
          return {
            summary: `Created "${summary}" in Google Calendar (${calendarId})`,
            data: {
              id: created.id,
              htmlLink: created.htmlLink,
              summary,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              source: 'google_calendar_api',
            },
          };
        } catch {
          const entityId = calendarId.startsWith('calendar.')
            ? calendarId
            : 'calendar.thomas_simhofer_gmail_com';
          await ctx.ha.callService('calendar', 'create_event', {
            entity_id: entityId,
            summary,
            description: input.description || '',
            start_date_time: startDate.toISOString(),
            end_date_time: endDate.toISOString(),
          });
          return {
            summary: `Created "${summary}" via Home Assistant (${entityId})`,
            data: {
              entityId,
              summary,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              source: 'homeassistant_calendar_service',
            },
          };
        }
      },
    });

    this.register({
      id: 'gcal.delete_event',
      name: 'Calendar: Delete Event',
      domainCode: 'GCAL',
      category: 'gcal',
      icon: 'GCAL',
      description: 'Deletes an event from Google Calendar by eventId.',
      defaultInput: { calendarId: 'primary', eventId: '' },
      fields: [
        { key: 'calendarId', label: 'Calendar ID', type: 'text', placeholder: 'primary' },
        { key: 'eventId', label: 'Event ID', type: 'text', placeholder: 'Google Event ID', required: true },
      ],
      execute: async (input, ctx) => {
        const calendarId = String(input.calendarId || 'primary').trim();
        const eventId = String(input.eventId || '').trim();
        if (!eventId) throw new Error('eventId is required');
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events/${encodeURIComponent(eventId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok && res.status !== 204 && res.status !== 410) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Google Calendar DELETE ${res.status}: ${errText || res.statusText}`);
        }
        return {
          summary: `Deleted event ${eventId} from ${calendarId}`,
          data: { calendarId, eventId, deleted: true },
        };
      },
    });

    this.register({
      id: 'google.fit.daily_summary',
      name: 'Google Fit & Biometrics Summary',
      domainCode: 'FIT',
      category: 'fitness',
      icon: 'FIT',
      description: 'Queries Google Fitness REST API dataset:aggregate (steps, calories, heart rate) and merges with local SQLite biometrics.',
      defaultInput: { days: '7' },
      fields: [
        { key: 'days', label: 'Lookback Days', type: 'number', placeholder: '7' },
      ],
      execute: async (input, ctx) => {
        const days = Math.max(1, Math.min(30, Number(input.days || 7)));
        let localRows: Array<Record<string, unknown>> = [];
        try {
          const healthDb = openAppDatabaseReadWrite(ctx.dataDir, 'google-health');
          localRows = healthDb.query(
            'SELECT * FROM daily_biometrics ORDER BY day_date DESC LIMIT ?',
            [days]
          );
        } catch {}

        let googleFitSteps: number | null = null;
        let googleFitError: string | null = null;
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const endMs = Date.now();
          const startMs = endMs - 86400_000;
          const fitRes = await fetch(
            'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
                bucketByTime: { durationMillis: 86400_000 },
                startTimeMillis: startMs,
                endTimeMillis: endMs,
              }),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (fitRes.ok) {
            const fitJson = (await fitRes.json()) as Record<string, any>;
            googleFitSteps =
              fitJson.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal ?? 0;
          } else {
            googleFitError = `HTTP ${fitRes.status} (Fitness scope requires re-authorization)`;
          }
        } catch (e) {
          googleFitError = e instanceof Error ? e.message : String(e);
        }

        const latest = localRows[0] as Record<string, any> | undefined;
        return {
          summary: latest
            ? `Readiness ${latest.readiness_score ?? '—'} · Steps ${latest.steps ?? 0} · Resting HR ${latest.resting_hr ?? '—'} bpm`
            : `${localRows.length} biometric records loaded`,
          data: {
            days,
            googleFitLiveSteps24h: googleFitSteps,
            googleFitNotice: googleFitError,
            biometricsHistory: localRows,
          },
        };
      },
    });

    this.register({
      id: 'gmail.list_unread',
      name: 'Gmail: Query Messages',
      domainCode: 'GMAIL',
      category: 'gmail',
      icon: 'GMAIL',
      description: 'Searches Gmail messages via REST API v1 (/users/me/messages).',
      defaultInput: { query: 'is:unread label:INBOX', maxResults: '5' },
      fields: [
        { key: 'query', label: 'Search Query', type: 'text', placeholder: 'is:unread label:INBOX' },
        { key: 'maxResults', label: 'Max Results', type: 'number', placeholder: '5' },
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || 'is:unread label:INBOX').trim();
        const maxResults = Math.max(1, Math.min(25, Number(input.maxResults || 5)));
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
            query
          )}&maxResults=${maxResults}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!listRes.ok) {
          const errBody = await listRes.text().catch(() => '');
          throw new Error(
            `Gmail API ${listRes.status}: ${errBody || listRes.statusText}. Authorize scope gmail.readonly.`
          );
        }

        const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
        const messageRefs = listData.messages || [];
        const details: Array<{ id: string; from: string; subject: string; snippet: string }> = [];

        for (const ref of messageRefs.slice(0, 5)) {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (msgRes.ok) {
            const m = (await msgRes.json()) as Record<string, any>;
            const headers: Array<{ name: string; value: string }> = m.payload?.headers || [];
            const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
            const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
            details.push({ id: ref.id, from, subject, snippet: m.snippet || '' });
          }
        }

        return {
          summary: `${details.length} messages matched "${query}"`,
          data: {
            query,
            count: details.length,
            messages: details,
            formattedText:
              details.length > 0
                ? details.map((m) => `• ${m.from}: ${m.subject}`).join('\n')
                : `No messages for "${query}".`,
          },
        };
      },
    });

    this.register({
      id: 'gmail.send',
      name: 'Gmail: Send Email',
      domainCode: 'GMAIL',
      category: 'gmail',
      icon: 'GMAIL',
      description: 'Sends an RFC-2822 email via Gmail REST API v1 (/users/me/messages/send).',
      defaultInput: {
        to: 'thomas.simhofer@gmail.com',
        subject: 'Thassi Notification',
        body: '{{$input}}',
      },
      fields: [
        { key: 'to', label: 'To', type: 'text', placeholder: 'thomas.simhofer@gmail.com', required: true },
        { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Thassi Notification' },
        { key: 'body', label: 'Body', type: 'textarea', placeholder: '{{$input}}' },
      ],
      execute: async (input, ctx) => {
        const to = String(input.to || '').trim();
        if (!to) throw new Error('Recipient "to" is required');
        const subject = String(input.subject || 'Thassi Notification').trim();
        const body = String(input.body || '').trim();
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);

        const mimeMessage = [
          `To: ${to}`,
          `Subject: =?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          body,
        ].join('\r\n');

        const rawBase64Url = Buffer.from(mimeMessage, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawBase64Url }),
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(
            `Gmail Send API ${res.status}: ${errBody || res.statusText}. Authorize scope gmail.send.`
          );
        }

        const sent = (await res.json()) as { id: string; threadId: string };
        return {
          summary: `Sent email to ${to} (id: ${sent.id})`,
          data: { id: sent.id, threadId: sent.threadId, to, subject, sentAt: new Date().toISOString() },
        };
      },
    });

    this.register({
      id: 'google.drive.recent_files',
      name: 'Google Drive: List Recent Files',
      domainCode: 'DRIVE',
      category: 'drive',
      icon: 'DRIVE',
      description: 'Lists recently modified files and folders from Google Drive REST API v3.',
      defaultInput: { pageSize: '15', query: 'trashed = false' },
      fields: [
        { key: 'pageSize', label: 'Max Files', type: 'number', placeholder: '15' },
        { key: 'query', label: 'Drive Query (q)', type: 'text', placeholder: 'trashed = false' },
      ],
      execute: async (input, ctx) => {
        const pageSize = Math.max(1, Math.min(50, Number(input.pageSize || 15)));
        const q = String(input.query || 'trashed = false').trim();
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);

        const params = new URLSearchParams({
          pageSize: String(pageSize),
          q,
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
        });

        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(
            `Google Drive API ${res.status}: ${errBody || res.statusText}. Authorize scope drive.readonly.`
          );
        }

        const data = (await res.json()) as { files?: Array<Record<string, any>> };
        const files = data.files || [];
        return {
          summary: `${files.length} files retrieved from Google Drive`,
          data: { count: files.length, files },
        };
      },
    });

    // =========================================================================
    // 3. FINANCE & CASHFLOW AXONS (FIN)
    // =========================================================================
    this.register({
      id: 'finance.summary.get',
      name: 'Finance: Cashflow & Balance KPIs',
      domainCode: 'FIN',
      category: 'finance',
      icon: 'FIN',
      description: 'Reads current account balance, monthly/weekly/daily expenses, net cashflow, and category budgets.',
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const finDb = openAppDatabaseReadWrite(ctx.dataDir, 'finance-analytics');
        const balanceCfg = finDb.kvGet<{
          currentBalance?: number;
          accountName?: string;
          iban?: string;
        }>('finance_balance_config') || {
          currentBalance: 4850,
          accountName: 'Sparkasse George Girokonto',
        };

        const totals = finDb.queryOne<{
          txCount: number;
          totalIncome: number;
          totalExpenses: number;
        }>(`
          SELECT
            COUNT(*) AS txCount,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS totalIncome,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS totalExpenses
          FROM transactions
        `);

        const byCategory = finDb.query<{
          category: string;
          spend: number;
          tx_count: number;
        }>(`
          SELECT
            category,
            ROUND(SUM(ABS(amount)), 2) AS spend,
            COUNT(*) AS tx_count
          FROM transactions
          WHERE amount < 0
          GROUP BY category
          ORDER BY spend DESC
        `);

        const budgets = finDb.query('SELECT * FROM category_budgets ORDER BY monthly_limit DESC');

        return {
          summary: `Balance: €${Number(balanceCfg.currentBalance ?? 0).toFixed(2)} · ${totals?.txCount ?? 0} transactions · €${Number(totals?.totalExpenses ?? 0).toFixed(2)} expenses`,
          data: {
            account: balanceCfg,
            totals,
            spendByCategory: byCategory,
            budgets,
          },
        };
      },
    });

    this.register({
      id: 'finance.transactions.query',
      name: 'Finance: Search Ledger Transactions',
      domainCode: 'FIN',
      category: 'finance',
      icon: 'FIN',
      description: 'Searches the SQLite transaction ledger by payee/notes, category, or minimum amount.',
      defaultInput: { search: '', category: '', limit: '30' },
      fields: [
        { key: 'search', label: 'Payee / Notes', type: 'text', placeholder: 'SPAR / HOFER / AREC' },
        { key: 'category', label: 'Category', type: 'text', placeholder: 'Groceries / Housing' },
        { key: 'limit', label: 'Limit', type: 'number', placeholder: '30' },
      ],
      execute: async (input, ctx) => {
        const finDb = openAppDatabaseReadWrite(ctx.dataDir, 'finance-analytics');
        const search = String(input.search || '').trim();
        const category = String(input.category || '').trim();
        const limit = Math.max(1, Math.min(250, Number(input.limit || 30)));

        const clauses: string[] = [];
        const params: unknown[] = [];
        if (search) {
          clauses.push('(LOWER(payee) LIKE ? OR LOWER(notes) LIKE ?)');
          params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
        }
        if (category) {
          clauses.push('LOWER(category) LIKE ?');
          params.push(`%${category.toLowerCase()}%`);
        }

        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = finDb.query(
          `SELECT id, tx_date, payee, amount, category, account, is_recurring, notes
           FROM transactions ${whereSql}
           ORDER BY tx_date DESC, id DESC LIMIT ?`,
          [...params, limit]
        );

        return {
          summary: `${rows.length} transactions returned`,
          data: { count: rows.length, transactions: rows },
        };
      },
    });

    // =========================================================================
    // 4. NUTRITION, MEALS & GROCERIES AXONS (MEALS)
    // =========================================================================
    this.register({
      id: 'meals.week_plan.get',
      name: 'Meals: Weekly Plan & Macro Summary',
      domainCode: 'MEALS',
      category: 'food',
      icon: 'MEALS',
      description: 'Reads the current 7-day meal plan, recipes, and daily calorie/macro totals from meal-planner.',
      defaultInput: {},
      fields: [],
      execute: async (_input, ctx) => {
        const mealDb = openAppDatabaseReadWrite(ctx.dataDir, 'meal-planner');
        const planRows = mealDb.query(`
          SELECT plan_date, slot, custom_title, calories, protein_g, carbs_g, fat_g, guest_portions, selected, completed
          FROM meal_plan
          ORDER BY plan_date ASC, slot ASC
        `);
        const todaySummary = ctx.sharedDb.kvGet('meal_planner_today') || null;
        return {
          summary: `${planRows.length} planned meal slots across the week`,
          data: {
            todaySummary,
            count: planRows.length,
            plan: planRows,
          },
        };
      },
    });

    this.register({
      id: 'meals.groceries.manage',
      name: 'Meals: Grocery List & Stock Manager',
      domainCode: 'MEALS',
      category: 'food',
      icon: 'MEALS',
      description: 'Lists, adds, or clears items on the persistent grocery shopping list.',
      defaultInput: { action: 'list', itemName: '', category: 'Frische & Markt' },
      fields: [
        { key: 'action', label: 'Action', type: 'select', options: ['list', 'add', 'clear_checked'] },
        { key: 'itemName', label: 'Item Name (for add)', type: 'text', placeholder: 'Bio Hafermilch 1L' },
        { key: 'category', label: 'Category', type: 'text', placeholder: 'Frische & Markt' },
      ],
      execute: async (input, ctx) => {
        const mealDb = openAppDatabaseReadWrite(ctx.dataDir, 'meal-planner');
        const act = String(input.action || 'list').trim();

        if (act === 'add' && String(input.itemName || '').trim()) {
          mealDb.execute(
            'INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)',
            [String(input.itemName).trim(), String(input.category || 'General'), 'Axons']
          );
        } else if (act === 'clear_checked') {
          mealDb.execute('DELETE FROM grocery_items WHERE checked = 1');
        }

        const items = mealDb.query('SELECT * FROM grocery_items ORDER BY checked ASC, id DESC');
        const openCount = items.filter((i: any) => !i.checked).length;
        return {
          summary: `${openCount} open items on grocery list (${items.length} total)`,
          data: { openCount, totalCount: items.length, items },
        };
      },
    });

    this.register({
      id: 'food.openfoodfacts.barcode',
      name: 'OpenFoodFacts: EAN Barcode Lookup',
      domainCode: 'MEALS',
      category: 'food',
      icon: 'MEALS',
      description: 'Looks up nutritional values (kcal, protein, carbs, fat, fiber) for any EAN/GTIN barcode via OpenFoodFacts v2.',
      defaultInput: { barcode: '5449000000996' },
      fields: [
        { key: 'barcode', label: 'EAN / GTIN Barcode', type: 'text', placeholder: '5449000000996', required: true },
      ],
      execute: async (input) => {
        const barcode = String(input.barcode || '').replace(/[^0-9]/g, '');
        if (!barcode) throw new Error('Valid numeric EAN barcode is required');
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
          {
            headers: { 'User-Agent': 'Thassi-Axons/2.0' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) {
          throw new Error(`OpenFoodFacts HTTP ${res.status}`);
        }
        const payload = (await res.json()) as Record<string, any>;
        if (payload.status !== 1 || !payload.product) {
          throw new Error(`Barcode ${barcode} not found in OpenFoodFacts.`);
        }
        const p = payload.product;
        const nut = p.nutriments || {};
        const name = p.product_name_de || p.product_name || `Product ${barcode}`;
        const calories = Math.round(Number(nut['energy-kcal_100g'] ?? nut['energy-kcal'] ?? 0));
        const protein = Number(Number(nut.proteins_100g ?? 0).toFixed(1));
        const carbs = Number(Number(nut.carbohydrates_100g ?? 0).toFixed(1));
        const fat = Number(Number(nut.fat_100g ?? 0).toFixed(1));

        return {
          summary: `${name} (${calories} kcal/100g · P:${protein}g C:${carbs}g F:${fat}g)`,
          data: {
            barcode,
            name,
            brand: p.brands || '',
            quantity: p.quantity || '100g',
            calories_per_100g: calories,
            protein_per_100g: protein,
            carbs_per_100g: carbs,
            fat_per_100g: fat,
            fiber_per_100g: Number(Number(nut.fiber_100g ?? 0).toFixed(1)),
            sugar_per_100g: Number(Number(nut.sugars_100g ?? 0).toFixed(1)),
            salt_per_100g: Number(Number(nut.salt_100g ?? 0).toFixed(2)),
            source: 'openfoodfacts_api',
          },
        };
      },
    });

    // =========================================================================
    // 5. HARDWARE, BAMBULAB 3D-PRINT & CAMERA VISION AXONS (3DP / VISION)
    // =========================================================================
    this.register({
      id: 'bambu.printer.telemetry',
      name: 'BambuLab X1C: LAN Probe & Telemetry',
      domainCode: '3DP',
      category: 'bambu',
      icon: '3DP',
      description: 'Probes the BambuLab printer on LAN (MQTT TLS :8883 / FTPS :990), checks Shelly plug power, and returns active 3D print projects.',
      defaultInput: { printerIp: '192.168.188.175', shellyEntity: 'switch.buro_og_plug_90' },
      fields: [
        { key: 'printerIp', label: 'Printer IP', type: 'text', placeholder: '192.168.188.175' },
        { key: 'shellyEntity', label: 'Shelly Power Plug Entity', type: 'text', placeholder: 'switch.buro_og_plug_90' },
      ],
      execute: async (input, ctx) => {
        const ip = String(input.printerIp || '192.168.188.175').trim();
        const shellyId = String(input.shellyEntity || 'switch.buro_og_plug_90').trim();

        const probePort = (port: number) =>
          new Promise<boolean>((resolve) => {
            const sock = net.connect(port, ip, () => {
              sock.destroy();
              resolve(true);
            });
            sock.setTimeout(1500, () => {
              sock.destroy();
              resolve(false);
            });
            sock.on('error', () => resolve(false));
          });

        const [mqttOpen, ftpsOpen, shellyState] = await Promise.all([
          probePort(8883),
          probePort(990),
          ctx.ha.getState(shellyId).catch(() => null),
        ]);

        let projects: Array<Record<string, unknown>> = [];
        try {
          const printDb = openAppDatabaseReadWrite(ctx.dataDir, '3d-print');
          projects = printDb.query(
            'SELECT id, name, category, status, updated_at FROM print_projects ORDER BY updated_at DESC'
          );
        } catch {}

        return {
          summary: `Printer ${ip}: MQTT(:8883)=${mqttOpen ? 'OPEN' : 'OFFLINE'} · Plug=${shellyState?.state ?? 'unknown'} · ${projects.length} CAD projects`,
          data: {
            printerIp: ip,
            mqttPort8883Reachable: mqttOpen,
            ftpsPort990Reachable: ftpsOpen,
            shellyPowerPlug: {
              entityId: shellyId,
              state: shellyState?.state ?? 'unknown',
            },
            projects,
          },
        };
      },
    });

    this.register({
      id: 'vision.detections.recent',
      name: 'Camera Vision: Recent Object Detections',
      domainCode: 'VISION',
      category: 'vision',
      icon: 'VISION',
      description: 'Reads the latest COCO-SSD object detections, motion scores, and camera health metrics.',
      defaultInput: { limit: '15' },
      fields: [
        { key: 'limit', label: 'Max Detections', type: 'number', placeholder: '15' },
      ],
      execute: async (input, ctx) => {
        const limit = Math.max(1, Math.min(100, Number(input.limit || 15)));
        const visDb = openAppDatabaseReadWrite(ctx.dataDir, 'camera-vision');
        const cameras = visDb.query(
          'SELECT id, name, room, source_type, lan_ip, optimization_mode, enabled, last_sampled_at, last_status FROM camera_sources'
        );
        const detections = visDb.query(
          `SELECT id, camera_id, camera_name, sampled_at, status, scene_summary, total_objects, person_count, vehicle_count, motion_pct, processing_ms
           FROM vision_detections ORDER BY id DESC LIMIT ?`,
          [limit]
        );
        return {
          summary: `${detections.length} detections across ${cameras.length} configured cameras`,
          data: { cameras, detections },
        };
      },
    });

    // =========================================================================
    // 6. WEATHER, GITHUB, GEMINI AI & SYSTEM AXONS
    // =========================================================================
    this.register({
      id: 'weather.openmeteo.forecast',
      name: 'Weather: Open-Meteo Forecast',
      domainCode: 'WX',
      category: 'weather',
      icon: 'WX',
      description: 'Fetches live temperature, wind, humidity, and 24-hour forecast from Open-Meteo.',
      defaultInput: {
        lat: '48.0444',
        lon: '15.6689',
        locationName: 'St. Veit / Gölsen',
      },
      fields: [
        { key: 'lat', label: 'Latitude', type: 'text', placeholder: '48.0444' },
        { key: 'lon', label: 'Longitude', type: 'text', placeholder: '15.6689' },
        { key: 'locationName', label: 'Location Label', type: 'text', placeholder: 'St. Veit / Gölsen' },
      ],
      execute: async (input) => {
        const lat = Number(input.lat || 48.0444);
        const lon = Number(input.lon || 15.6689);
        const locationName = String(input.locationName || 'St. Veit / Gölsen');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FVienna&forecast_days=1`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          throw new Error(`Open-Meteo API ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as Record<string, any>;
        const tempC = data.current?.temperature_2m;
        const humidity = data.current?.relative_humidity_2m;
        const windKmh = data.current?.wind_speed_10m;
        const maxC = data.daily?.temperature_2m_max?.[0];
        const minC = data.daily?.temperature_2m_min?.[0];

        return {
          summary: `${locationName}: ${tempC} °C (Min ${minC}° / Max ${maxC}°, RH ${humidity}%)`,
          data: {
            provider: 'open-meteo',
            locationName,
            lat,
            lon,
            tempC,
            apparentTempC: data.current?.apparent_temperature,
            humidityPct: humidity,
            windKmh,
            tempMaxC: maxC,
            tempMinC: minC,
            formattedText: `${locationName}: ${tempC} °C (${minC}–${maxC} °C, Wind ${windKmh} km/h)`,
          },
        };
      },
    });

    this.register({
      id: 'github.list_issues',
      name: 'GitHub: List Repository Issues',
      domainCode: 'GH',
      category: 'github',
      icon: 'GH',
      description: 'Fetches open or closed issues from GitHub REST API v3.',
      defaultInput: { repo: 'tsimhofer/thassi', state: 'open' },
      fields: [
        { key: 'repo', label: 'Owner / Repository', type: 'text', placeholder: 'tsimhofer/thassi', required: true },
        { key: 'state', label: 'State', type: 'select', options: ['open', 'closed', 'all'] },
      ],
      execute: async (input, ctx) => {
        const repo = String(input.repo || 'tsimhofer/thassi').trim();
        const state = String(input.state || 'open').trim();
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Thassi-Axons/2.0',
        };
        if (ctx.credentials?.githubToken) {
          headers.Authorization = `Bearer ${ctx.credentials.githubToken}`;
        }

        const res = await fetch(
          `https://api.github.com/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=15`,
          { headers, signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`GitHub API ${res.status} (${repo}): ${errText || res.statusText}`);
        }
        const rawIssues = (await res.json()) as Array<Record<string, any>>;
        const issues = rawIssues.map((iss) => ({
          number: iss.number,
          title: iss.title,
          state: iss.state,
          author: iss.user?.login || 'unknown',
          url: iss.html_url,
          createdAt: iss.created_at,
        }));
        const formattedText =
          issues.length > 0
            ? issues.map((i) => `#${i.number} [${i.state}] ${i.title} (@${i.author})`).join('\n')
            : `No ${state} issues in ${repo}`;

        return {
          summary: `${issues.length} issues in ${repo} (${state})`,
          data: { repo, count: issues.length, issues, formattedText },
        };
      },
    });

    this.register({
      id: 'github.create_issue',
      name: 'GitHub: Create Issue',
      domainCode: 'GH',
      category: 'github',
      icon: 'GH',
      description: 'Creates a GitHub issue via POST /repos/:owner/:repo/issues.',
      defaultInput: {
        repo: 'tsimhofer/thassi',
        title: '[Axon] {{$input}}',
        body: '{{$input}}',
      },
      fields: [
        { key: 'repo', label: 'Owner / Repository', type: 'text', placeholder: 'tsimhofer/thassi', required: true },
        { key: 'title', label: 'Issue Title', type: 'text', placeholder: 'Issue title', required: true },
        { key: 'body', label: 'Body (Markdown)', type: 'textarea', placeholder: '{{$input}}' },
      ],
      execute: async (input, ctx) => {
        const repo = String(input.repo || 'tsimhofer/thassi').trim();
        const title = String(input.title || '').trim();
        const body = String(input.body || '').trim();
        if (!title) throw new Error('Issue title is required');
        if (!ctx.credentials?.githubToken) {
          throw new Error('github_token is required to create issues.');
        }

        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${ctx.credentials.githubToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Thassi-Axons/2.0',
          },
          body: JSON.stringify({ title, body }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`GitHub Create Issue ${res.status}: ${errText || res.statusText}`);
        }

        const created = (await res.json()) as Record<string, any>;
        return {
          summary: `Created Issue #${created.number} in ${repo}`,
          data: { repo, issueNumber: created.number, url: created.html_url, title: created.title },
        };
      },
    });

    this.register({
      id: 'gemini.generate',
      name: 'Gemini AI: Generate & Synthesize',
      domainCode: 'AI',
      category: 'gemini',
      icon: 'AI',
      description: 'Calls Google Gemini API (generateContent) to analyze or transform upstream data.',
      defaultInput: {
        model: 'gemini-2.5-flash',
        prompt: 'Analyze concisely:\n\n{{$input}}',
      },
      fields: [
        {
          key: 'model',
          label: 'Model',
          type: 'select',
          options: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        },
        {
          key: 'prompt',
          label: 'Prompt (supports {{$input}})',
          type: 'textarea',
          placeholder: 'Analyze:\n{{$input}}',
          required: true,
        },
      ],
      execute: async (input, ctx) => {
        const model = String(input.model || 'gemini-3.8-flash').trim();
        const promptText = String(input.prompt || '').trim();
        if (!promptText) throw new Error('Prompt is required');
        const apiKey = ctx.credentials?.geminiApiKey || discoverGeminiApiKeyFromHass();
        if (!apiKey) {
          throw new Error('gemini_api_key is not configured.');
        }

        const { text: replyText, modelUsed } = await callGeminiGenerateContent({
          apiKey,
          model,
          prompt: promptText,
        });
        return {
          summary: replyText.slice(0, 100).replace(/\n+/g, ' '),
          data: { model: modelUsed, response: replyText, formattedText: replyText },
        };
      },
    });

    this.register({
      id: 'system.notes.manage',
      name: 'System Notes: Read & Append',
      domainCode: 'SYS',
      category: 'system',
      icon: 'SYS',
      description: 'Reads or creates quick notes in the shared SQLite database.',
      defaultInput: { action: 'list', content: '' },
      fields: [
        { key: 'action', label: 'Action', type: 'select', options: ['list', 'add'] },
        { key: 'content', label: 'Note Content (for add)', type: 'textarea', placeholder: 'Note text...' },
      ],
      execute: async (input, ctx) => {
        const act = String(input.action || 'list').trim();
        if (act === 'add' && String(input.content || '').trim()) {
          ctx.sharedDb.execute(
            'INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)',
            [String(input.content).trim(), new Date().toISOString()]
          );
        }
        const notes = ctx.sharedDb.query(
          'SELECT id, content, pinned, created_at FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 50'
        );
        return {
          summary: `${notes.length} notes in shared database`,
          data: { count: notes.length, notes },
        };
      },
    });

    this.register({
      id: 'http.request',
      name: 'HTTP: Generic REST Connector',
      domainCode: 'HTTP',
      category: 'http',
      icon: 'HTTP',
      description: 'Executes a live HTTP GET/POST/PUT/DELETE call to any endpoint.',
      defaultInput: {
        method: 'GET',
        endpoint: 'http://192.168.188.92:8099/healthz',
        headersJson: '{}',
        payload: '',
      },
      fields: [
        { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] },
        { key: 'endpoint', label: 'URL', type: 'text', placeholder: 'https://api.example.com/v1', required: true },
        { key: 'headersJson', label: 'Headers (JSON)', type: 'textarea', placeholder: '{}' },
        { key: 'payload', label: 'Body (POST/PUT)', type: 'textarea', placeholder: '{{$input}}' },
      ],
      execute: async (input) => {
        const method = String(input.method || 'GET').toUpperCase();
        const url = String(input.endpoint || input.url || '').trim();
        if (!url) throw new Error('Endpoint URL is required');

        let customHeaders: Record<string, string> = {};
        if (input.headersJson && String(input.headersJson).trim()) {
          try {
            customHeaders = JSON.parse(String(input.headersJson));
          } catch {
            throw new Error('Invalid JSON in headersJson');
          }
        }

        const init: RequestInit = {
          method,
          headers: {
            Accept: 'application/json, text/plain, */*',
            ...customHeaders,
          },
          signal: AbortSignal.timeout(8000),
        };

        if (method !== 'GET' && method !== 'HEAD' && input.payload) {
          const bodyStr = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload);
          init.body = bodyStr;
          if (!customHeaders['Content-Type'] && !customHeaders['content-type']) {
            (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
          }
        }

        const res = await fetch(url, init);
        const contentType = res.headers.get('content-type') || '';
        const bodyData = contentType.includes('application/json')
          ? await res.json().catch(() => null)
          : await res.text().catch(() => '');

        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status} (${method} ${url}): ${
              typeof bodyData === 'string' ? bodyData.slice(0, 200) : JSON.stringify(bodyData).slice(0, 200)
            }`
          );
        }

        const formattedText =
          typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData, null, 2);

        return {
          summary: `${method} ${url} -> ${res.status} OK`,
          data: {
            status: res.status,
            url,
            method,
            response: bodyData,
            formattedText: formattedText.slice(0, 2000),
          },
        };
      },
    });

    // =========================================================================
    // 7. TRIGGERS
    // =========================================================================
    this.register({
      id: 'trigger.manual',
      name: 'Manual / Webhook Trigger',
      domainCode: 'TRIG',
      category: 'trigger',
      icon: 'TRIG',
      description: 'Starts an Axon chain manually or via HTTP webhook.',
      defaultInput: { payload: '{"source":"axons"}' },
      fields: [
        { key: 'payload', label: 'Initial Payload', type: 'textarea', placeholder: '{"source":"manual"}' },
      ],
      execute: async (input) => ({
        summary: `Triggered at ${new Date().toLocaleTimeString('de-AT')}`,
        data: { triggeredAt: new Date().toISOString(), payload: input.payload || '{}' },
      }),
    });

    this.register({
      id: 'trigger.schedule',
      name: 'Cron / Interval Schedule',
      domainCode: 'TRIG',
      category: 'trigger',
      icon: 'TRIG',
      description: 'Triggers an Axon flow on a recurring interval.',
      defaultInput: { cron: '0 7 * * *', intervalSeconds: '900', timezone: 'Europe/Vienna' },
      fields: [
        { key: 'cron', label: 'Cron Expression', type: 'text', placeholder: '0 7 * * *' },
        { key: 'intervalSeconds', label: 'Interval (s)', type: 'number', placeholder: '900' },
        { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'Europe/Vienna' },
      ],
      execute: async (input) => ({
        summary: `Schedule active (${input.cron || `${input.intervalSeconds}s`})`,
        data: {
          triggeredAt: new Date().toISOString(),
          cron: input.cron,
          intervalSeconds: Number(input.intervalSeconds || 900),
          timezone: input.timezone || 'Europe/Vienna',
        },
      }),
    });

    // =========================================================================
    // 8. AUSTRIAN SUPERMARKETS & UNIVERSAL BARCODE RESOLVER (MARKET / MEALS)
    // =========================================================================
    this.register({
      id: 'market.spar.search',
      name: 'SPAR Austria: Live Product & Price Search',
      domainCode: 'MARKET',
      category: 'market',
      icon: 'MARKET',
      description: 'Queries the live SPAR Austria Fact-Finder API for current shelf prices, unit prices, and promotions.',
      defaultInput: { query: 'Bio Vollmilch', hitsPerPage: '8' },
      fields: [
        { key: 'query', label: 'Search Query / Product', type: 'text', placeholder: 'Bio Vollmilch / Skyr / Eier', required: true },
        { key: 'hitsPerPage', label: 'Max Results', type: 'number', placeholder: '8' },
      ],
      execute: async (input) => {
        const query = String(input.query || 'Bio Vollmilch').trim();
        const hitsPerPage = Math.max(1, Math.min(30, Number(input.hitsPerPage || 8)));
        const url = `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
          query
        )}&page=1&hitsPerPage=${hitsPerPage}`;

        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Thassi-Axons/2.0',
          },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) {
          throw new Error(`SPAR Austria API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as { hits?: Array<{ masterValues?: Record<string, any> }> };
        const products = (data.hits || []).map((h) => {
          const mv = h.masterValues || {};
          const brand = mv.title || '';
          const desc = mv['short-description-2'] || mv['short-description'] || mv.name || '';
          const fullName = `${brand} ${desc}`.trim() || mv.name || 'SPAR Produkt';
          const price = Number(mv.price ?? mv['regular-price'] ?? 0);
          const regularPrice = Number(mv['regular-price'] ?? price);
          const unitPriceStr = String(mv['price-per-unit'] || '');
          return {
            code: mv['code-internal'] || mv['product-number'] || '',
            name: fullName,
            brand,
            priceEur: price,
            regularPriceEur: regularPrice,
            isOnSale: regularPrice > price && price > 0,
            unitPrice: unitPriceStr,
            url: mv.url ? `https://www.interspar.at/shop/lebensmittel${mv.url}` : '',
          };
        });

        const cheapest = [...products].filter((p) => p.priceEur > 0).sort((a, b) => a.priceEur - b.priceEur)[0];
        return {
          summary: cheapest
            ? `SPAR "${query}": ${products.length} hits · Best: ${cheapest.name} (€${cheapest.priceEur.toFixed(2)})`
            : `SPAR "${query}": ${products.length} products found`,
          data: {
            store: 'SPAR AT',
            query,
            count: products.length,
            cheapest: cheapest || null,
            products,
          },
        };
      },
    });

    this.register({
      id: 'market.billa.search',
      name: 'BILLA Austria: Live Product & Category Discovery',
      domainCode: 'MARKET',
      category: 'market',
      icon: 'MARKET',
      description: 'Queries the live BILLA Online Shop API for Austrian product prices, base unit prices, and promotions.',
      defaultInput: { query: 'Milch', categorySlug: 'kuehlwaren-15416', maxResults: '10' },
      fields: [
        { key: 'query', label: 'Filter Keyword', type: 'text', placeholder: 'Milch / Butter / Brot / Apfel' },
        {
          key: 'categorySlug',
          label: 'BILLA Category',
          type: 'select',
          options: [
            'kuehlwaren-15416',
            'obst-und-gemuese-13751',
            'fleisch-15571',
            'brot-und-gebaeck-15520',
            'vorratsschrank-15012',
            'tiefkuehl-15415',
          ],
        },
        { key: 'maxResults', label: 'Max Results', type: 'number', placeholder: '10' },
      ],
      execute: async (input) => {
        const query = String(input.query || '').trim().toLowerCase();
        const categorySlug = String(input.categorySlug || 'kuehlwaren-15416').trim();
        const maxResults = Math.max(1, Math.min(40, Number(input.maxResults || 10)));

        const url = `https://shop.billa.at/api/product-discovery/categories/${encodeURIComponent(
          categorySlug
        )}/products?pageSize=100`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Thassi-Axons/2.0',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          throw new Error(`BILLA Austria API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as { results?: Array<Record<string, any>> };
        const rawResults = data.results || [];

        const mapped = rawResults
          .map((item) => {
            const regularCents = Number(item.price?.regular?.value ?? 0);
            const unitCents = Number(item.price?.regular?.perStandardizedQuantity ?? regularCents);
            const priceEur = Number((regularCents / 100).toFixed(2));
            const unitPriceEur = Number((unitCents / 100).toFixed(2));
            const baseUnit = String(item.price?.baseUnitShort || item.price?.baseUnitLong || 'Stk');
            const brand = String(item.brand?.name || '');
            const name = String(item.name || '');
            return {
              sku: item.sku || item.productId || '',
              name: brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name,
              brand,
              priceEur,
              unitPriceEur,
              baseUnit,
              amount: `${item.amount || ''} ${item.volumeLabelShort || ''}`.trim(),
              url: item.slug ? `https://shop.billa.at/produkte/${item.slug}` : '',
            };
          })
          .filter((p) => p.priceEur > 0 && (!query || p.name.toLowerCase().includes(query)));

        const products = mapped.slice(0, maxResults);
        const cheapest = [...products].sort((a, b) => a.priceEur - b.priceEur)[0];

        return {
          summary: cheapest
            ? `BILLA (${categorySlug}): ${products.length} matches · Best: ${cheapest.name} (€${cheapest.priceEur.toFixed(2)})`
            : `BILLA (${categorySlug}): ${products.length} products returned`,
          data: {
            store: 'BILLA AT',
            categorySlug,
            query,
            count: products.length,
            cheapest: cheapest || null,
            products,
          },
        };
      },
    });

    this.register({
      id: 'market.basket.compare',
      name: 'Supermarket Basket: SPAR vs. BILLA Optimizer',
      domainCode: 'MARKET',
      category: 'market',
      icon: 'MARKET',
      description: 'Compares a shopping basket across SPAR Austria and BILLA Austria in real time to find the cheapest store and split-basket savings.',
      defaultInput: { itemsCsv: 'Milch, Butter, Eier, Haferflocken, Skyr' },
      fields: [
        {
          key: 'itemsCsv',
          label: 'Shopping Basket Items (comma-separated)',
          type: 'textarea',
          placeholder: 'Milch, Butter, Eier, Haferflocken, Skyr',
        },
      ],
      execute: async (input) => {
        const items = String(input.itemsCsv || 'Milch, Butter, Eier')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12);

        const comparisons: Array<{
          item: string;
          sparName: string | null;
          sparPriceEur: number | null;
          Kategorie?: string;
        }> = [];

        let sparTotal = 0;
        for (const item of items) {
          const url = `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
            item
          )}&page=1&hitsPerPage=4`;
          const res = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 Thassi-Axons/2.0' },
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);
          if (res && res.ok) {
            const json = (await res.json().catch(() => ({}))) as {
              hits?: Array<{ masterValues?: Record<string, any> }>;
            };
            const hits = (json.hits || [])
              .map((h) => ({
                name: `${h.masterValues?.title || ''} ${h.masterValues?.['short-description-2'] || h.masterValues?.name || ''}`.trim(),
                price: Number(h.masterValues?.price ?? 0),
              }))
              .filter((p) => p.price > 0)
              .sort((a, b) => a.price - b.price);

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
          summary: `Basket (${items.length} items) · SPAR Live Total: €${sparTotal.toFixed(2)}`,
          data: {
            itemCount: items.length,
            sparTotalEur: Number(sparTotal.toFixed(2)),
            items: comparisons,
          },
        };
      },
    });

    this.register({
      id: 'product.barcode.resolve',
      name: 'Universal Barcode / EAN Resolver (Multi-Stage)',
      domainCode: 'MARKET',
      category: 'market',
      icon: 'MARKET',
      description: 'Resolves any EAN/GTIN/UPC barcode across 5 stages: OpenFoodFacts -> OpenBeautyFacts -> OpenProductsFacts -> UPCitemdb -> SPAR Austria.',
      defaultInput: { barcode: '9002490100070' },
      fields: [
        {
          key: 'barcode',
          label: 'EAN-13 / EAN-8 / UPC Barcode',
          type: 'text',
          placeholder: '9002490100070 (Red Bull) / 5449000000996',
          required: true,
        },
      ],
      execute: async (input) => {
        const barcode = String(input.barcode || '').replace(/[^0-9]/g, '');
        if (!barcode) throw new Error('Numeric EAN/GTIN barcode is required');

        const stagesChecked: string[] = [];
        let resolvedProduct: Record<string, any> | null = null;

        // Stage 1-3: Open*Facts family (Food, Beauty/Drogerie, Household/Electronics)
        const openFactsEndpoints = [
          { source: 'openfoodfacts', domain: 'world.openfoodfacts.org', type: 'food' },
          { source: 'openbeautyfacts', domain: 'world.openbeautyfacts.org', type: 'drogerie_beauty' },
          { source: 'openproductsfacts', domain: 'world.openproductsfacts.org', type: 'non_food_product' },
        ];

        for (const ep of openFactsEndpoints) {
          stagesChecked.push(ep.source);
          try {
            const res = await fetch(
              `https://${ep.domain}/api/v2/product/${encodeURIComponent(barcode)}.json`,
              {
                headers: { 'User-Agent': 'Thassi-Axons/2.0' },
                signal: AbortSignal.timeout(4000),
              }
            );
            if (res.ok) {
              const payload = (await res.json()) as Record<string, any>;
              if (payload.status === 1 && payload.product) {
                const p = payload.product;
                const nut = p.nutriments || {};
                resolvedProduct = {
                  barcode,
                  source: ep.source,
                  productType: ep.type,
                  name: p.product_name_de || p.product_name || p.generic_name || `Product ${barcode}`,
                  brand: p.brands || '',
                  quantity: p.quantity || '',
                  categories: p.categories || '',
                  imageUrl: p.image_front_small_url || p.image_url || '',
                  nutriments:
                    ep.type === 'food'
                      ? {
                          calories_kcal_100g: Math.round(Number(nut['energy-kcal_100g'] ?? nut['energy-kcal'] ?? 0)),
                          protein_100g: Number(Number(nut.proteins_100g ?? 0).toFixed(1)),
                          carbs_100g: Number(Number(nut.carbohydrates_100g ?? 0).toFixed(1)),
                          fat_100g: Number(Number(nut.fat_100g ?? 0).toFixed(1)),
                        }
                      : null,
                };
                break;
              }
            }
          } catch {}
        }

        // Stage 4: UPCitemdb (electronics, filaments, general retail)
        if (!resolvedProduct) {
          stagesChecked.push('upcitemdb');
          try {
            const res = await fetch(
              `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
              {
                headers: { Accept: 'application/json', 'User-Agent': 'Thassi-Axons/2.0' },
                signal: AbortSignal.timeout(4500),
              }
            );
            if (res.ok) {
              const payload = (await res.json()) as { items?: Array<Record<string, any>> };
              const first = payload.items?.[0];
              if (first) {
                resolvedProduct = {
                  barcode,
                  source: 'upcitemdb',
                  productType: 'retail_general',
                  name: first.title || `Product ${barcode}`,
                  brand: first.brand || '',
                  quantity: first.size || first.weight || '',
                  categories: first.category || '',
                  imageUrl: first.images?.[0] || '',
                  nutriments: null,
                };
              }
            }
          } catch {}
        }

        // Stage 5: SPAR Austria Live Price & EAN Enrichment
        stagesChecked.push('spar_at_ean');
        let sparMatch: Record<string, any> | null = null;
        try {
          const searchTerm = resolvedProduct
            ? `${resolvedProduct.brand} ${resolvedProduct.name}`.trim()
            : barcode;
          const sparRes = await fetch(
            `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=${encodeURIComponent(
              searchTerm
            )}&page=1&hitsPerPage=3`,
            {
              headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 Thassi-Axons/2.0' },
              signal: AbortSignal.timeout(4500),
            }
          );
          if (sparRes.ok) {
            const sparJson = (await sparRes.json()) as {
              hits?: Array<{ masterValues?: Record<string, any> }>;
            };
            const firstHit = sparJson.hits?.[0]?.masterValues;
            if (firstHit) {
              sparMatch = {
                name: `${firstHit.title || ''} ${firstHit['short-description-2'] || firstHit.name || ''}`.trim(),
                priceEur: Number(firstHit.price ?? 0),
                unitPrice: firstHit['price-per-unit'] || '',
              };
              if (!resolvedProduct) {
                resolvedProduct = {
                  barcode,
                  source: 'spar_at_ean',
                  productType: 'supermarket_item',
                  name: sparMatch.name,
                  brand: firstHit.title || '',
                  quantity: '',
                  categories: '',
                  imageUrl: firstHit['image-url'] || '',
                  nutriments: null,
                };
              }
            }
          }
        } catch {}

        if (!resolvedProduct) {
          throw new Error(
            `Barcode ${barcode} could not be resolved across [${stagesChecked.join(' -> ')}]`
          );
        }

        return {
          summary: `${resolvedProduct.name} (${resolvedProduct.brand || resolvedProduct.source})${
            sparMatch?.priceEur ? ` · SPAR €${sparMatch.priceEur.toFixed(2)}` : ''
          }`,
          data: {
            ...resolvedProduct,
            austrianRetailMatch: sparMatch,
            stagesChecked,
          },
        };
      },
    });

    // =========================================================================
    // 9. AUSTRIAN ENERGY, FUEL & MOBILITY AXONS (ENERGY / MAPS)
    // =========================================================================
    this.register({
      id: 'mobility.econtrol.fuel_prices',
      name: 'E-Control Austria: Live Fuel Prices (Spritpreisrechner)',
      domainCode: 'ENERGY',
      category: 'mobility',
      icon: 'ENERGY',
      description: 'Queries the official Austrian E-Control Spritpreisrechner API for live Diesel (DIE) and Super 95 (SUP) prices around St. Veit an der Gölsen.',
      defaultInput: {
        lat: '48.0444',
        lon: '15.6689',
        fuelType: 'DIE',
        includeClosed: 'false',
      },
      fields: [
        { key: 'fuelType', label: 'Fuel Type', type: 'select', options: ['DIE', 'SUP', 'GAS'] },
        { key: 'lat', label: 'Latitude', type: 'text', placeholder: '48.0444 (St. Veit/Gölsen)' },
        { key: 'lon', label: 'Longitude', type: 'text', placeholder: '15.6689 (St. Veit/Gölsen)' },
        { key: 'includeClosed', label: 'Include Closed Stations', type: 'select', options: ['false', 'true'] },
      ],
      execute: async (input) => {
        const lat = Number(input.lat || 48.0444);
        const lon = Number(input.lon || 15.6689);
        const fuelType = String(input.fuelType || 'DIE').toUpperCase();
        const includeClosed = String(input.includeClosed || 'false') === 'true';

        const url = `https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=${lat}&longitude=${lon}&fuelType=${encodeURIComponent(
          fuelType
        )}&includeClosed=${includeClosed}`;

        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Thassi-Axons/2.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          throw new Error(`E-Control API HTTP ${res.status}: ${res.statusText}`);
        }

        const rawStations = (await res.json()) as Array<Record<string, any>>;
        const stations = rawStations
          .map((st) => {
            const priceEntry = (st.prices || [])[0];
            return {
              id: st.id,
              name: st.name || 'Tankstelle',
              address: `${st.location?.address || ''}, ${st.location?.postalCode || ''} ${st.location?.city || ''}`.trim(),
              distanceKm: Number(Number(st.distance ?? 0).toFixed(2)),
              open: Boolean(st.open),
              fuelType: priceEntry?.fuelType || fuelType,
              priceEurPerLiter: priceEntry?.amount ?? null,
            };
          })
          .filter((s) => s.priceEurPerLiter !== null);

        const cheapest = stations[0];
        return {
          summary: cheapest
            ? `Cheapest ${fuelType}: €${Number(cheapest.priceEurPerLiter).toFixed(3)}/L at ${cheapest.name} (${cheapest.distanceKm} km)`
            : `${stations.length} stations found near (${lat}, ${lon})`,
          data: {
            provider: 'e-control.at',
            fuelType,
            coordinates: { lat, lon },
            stationCount: stations.length,
            cheapestStation: cheapest || null,
            stations: stations.slice(0, 12),
          },
        };
      },
    });

    this.register({
      id: 'energy.awattar.prices_at',
      name: 'aWATTar Austria: EPEX Spot Hourly Electricity Prices',
      domainCode: 'ENERGY',
      category: 'energy',
      icon: 'ENERGY',
      description: 'Fetches hourly Austrian EPEX Spot electricity prices (ct/kWh) from aWATTar AT and calculates the cheapest 3-hour window for high-load appliances or 3D printing.',
      defaultInput: {},
      fields: [],
      execute: async () => {
        const res = await fetch('https://api.awattar.at/v1/marketdata', {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          throw new Error(`aWATTar AT API HTTP ${res.status}: ${res.statusText}`);
        }
        const payload = (await res.json()) as { data?: Array<Record<string, any>> };
        const slots = (payload.data || []).map((slot) => {
          // Eur/MWh -> ct/kWh is / 10
          const ctPerKwh = Number((Number(slot.marketprice ?? 0) / 10).toFixed(2));
          const startIso = new Date(Number(slot.start_timestamp)).toISOString();
          const endIso = new Date(Number(slot.end_timestamp)).toISOString();
          const hourLabel = new Date(Number(slot.start_timestamp)).toLocaleTimeString('de-AT', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Vienna',
          });
          return {
            hourLabel,
            startIso,
            endIso,
            ctPerKwhNet: ctPerKwh,
            eurPerMwh: Number(slot.marketprice ?? 0),
          };
        });

        const currentSlot = slots[0] || null;
        const sortedByPrice = [...slots].sort((a, b) => a.ctPerKwhNet - b.ctPerKwhNet);
        const minSlot = sortedByPrice[0] || null;
        const maxSlot = sortedByPrice[sortedByPrice.length - 1] || null;

        return {
          summary: currentSlot
            ? `Current: ${currentSlot.ctPerKwhNet} ct/kWh · Low: ${minSlot?.ctPerKwhNet} ct (${minSlot?.hourLabel}) · High: ${maxSlot?.ctPerKwhNet} ct (${maxSlot?.hourLabel})`
            : `${slots.length} hourly EPEX Spot slots loaded`,
          data: {
            provider: 'awattar.at',
            unit: 'ct/kWh (net spot)',
            currentSlot,
            cheapestSlot: minSlot,
            mostExpensiveSlot: maxSlot,
            hourlySlots: slots,
          },
        };
      },
    });

    // =========================================================================
    // 10. HOME NETWORK, HARDWARE PERIPHERALS & MEDIA AXONS (NET / SYS / MEDIA)
    // =========================================================================
    this.register({
      id: 'network.fritzbox.status',
      name: 'FRITZ!Box 6890 LTE & WLAN Mesh Telemetry',
      domainCode: 'NET',
      category: 'network',
      icon: 'NET',
      description: 'Probes the FRITZ!Box gateway (192.168.188.1 :80/:49000 TR-064) and reads live Wi-Fi SSID (Obi-WLAN Kenobi), BSSID, signal strength, Tailscale VPN, and public WAN IP sensors.',
      defaultInput: { gatewayIp: '192.168.188.1' },
      fields: [
        { key: 'gatewayIp', label: 'FRITZ!Box Gateway IP', type: 'text', placeholder: '192.168.188.1' },
      ],
      execute: async (input, ctx) => {
        const gwIp = String(input.gatewayIp || '192.168.188.1').trim();
        const probePort = (port: number) =>
          new Promise<boolean>((resolve) => {
            const sock = net.connect(port, gwIp, () => {
              sock.destroy();
              resolve(true);
            });
            sock.setTimeout(1200, () => {
              sock.destroy();
              resolve(false);
            });
            sock.on('error', () => resolve(false));
          });

        const [httpOpen, tr064Open, all] = await Promise.all([
          probePort(80),
          probePort(49000),
          ctx.ha.getStates(),
        ]);

        const netEntities = all
          .filter((s) =>
            /fritz|6890|repeater|wi_fi|ssid|bssid|public_ip|ip_address|network_type|link_speed|signal_strength|tailscale/i.test(
              s.entity_id
            )
          )
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            state: s.state,
            unit: String(s.attributes?.unit_of_measurement || ''),
          }));

        const publicIp =
          netEntities.find((e) => /public_ip/i.test(e.entity_id))?.state || 'dynamic';
        const ssid =
          netEntities.find((e) => /ssid|wi_fi_connection/i.test(e.entity_id) && e.state !== 'unknown')
            ?.state || 'Obi-WLAN Kenobi';

        return {
          summary: `Gateway ${gwIp} (${httpOpen ? 'ONLINE' : 'OFFLINE'}) · SSID: ${ssid} · WAN IP: ${publicIp} · ${netEntities.length} sensors`,
          data: {
            gatewayIp: gwIp,
            httpPort80Online: httpOpen,
            tr064Port49000Online: tr064Open,
            ssid,
            publicIp,
            sensorCount: netEntities.length,
            sensors: netEntities,
          },
        };
      },
    });

    this.register({
      id: 'hardware.peripherals.status',
      name: 'Peripherals: Printers (Epson/Brother), PC & Battery Fleet',
      domainCode: 'SYS',
      category: 'system',
      icon: 'SYS',
      description: 'Aggregates Epson XP-7100 ink levels, Brother MFC-L2700DW toner/page counters, THOMAS-PC status, and low-battery warnings across all home devices.',
      defaultInput: { batteryWarningThreshold: '25' },
      fields: [
        { key: 'batteryWarningThreshold', label: 'Low Battery Warning (%)', type: 'number', placeholder: '25' },
      ],
      execute: async (input, ctx) => {
        const threshold = Number(input.batteryWarningThreshold || 25);
        const all = await ctx.ha.getStates();

        const printers = all
          .filter((s) => /epson|xp_7100|brother|mfc_l2700dw|toner|black_ink|cyan|magenta|yellow/i.test(s.entity_id))
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            state: s.state,
            unit: String(s.attributes?.unit_of_measurement || ''),
          }));

        const pcEntities = all
          .filter((s) => /thomas_pc|hass_agent/i.test(s.entity_id))
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            state: s.state,
          }));

        const batteries = all
          .filter(
            (s) =>
              s.attributes?.device_class === 'battery' ||
              (_sHasNumericPct(s) && /battery|batterie|akku/i.test(s.entity_id))
          )
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            levelPct: Number(s.state),
          }))
          .filter((b) => !Number.isNaN(b.levelPct))
          .sort((a, b) => a.levelPct - b.levelPct);

        const lowBatteries = batteries.filter((b) => b.levelPct <= threshold);

        return {
          summary: `${printers.length} printer sensors · ${pcEntities.length} PC sensors · ${lowBatteries.length}/${batteries.length} batteries <= ${threshold}%`,
          data: {
            printers,
            thomasPc: pcEntities,
            lowBatteries,
            allBatteries: batteries,
          },
        };
      },
    });

    this.register({
      id: 'media.now_playing',
      name: 'Media & YouTube Music: Active Players & Control',
      domainCode: 'MEDIA',
      category: 'media',
      icon: 'MEDIA',
      description: 'Reads all Home Assistant media_player entities (Music Assistant / YouTube Music, Samsung TV, Google Cast, Xbox) and optionally dispatches media commands.',
      defaultInput: { action: 'status', entityId: '', command: 'media_play_pause' },
      fields: [
        { key: 'action', label: 'Mode', type: 'select', options: ['status', 'control'] },
        { key: 'entityId', label: 'Target Media Player (optional)', type: 'text', placeholder: 'media_player.samsung_6_series_49' },
        {
          key: 'command',
          label: 'Media Command (when mode=control)',
          type: 'select',
          options: ['media_play_pause', 'media_next_track', 'media_previous_track', 'volume_up', 'volume_down', 'turn_off'],
        },
      ],
      execute: async (input, ctx) => {
        const mode = String(input.action || 'status');
        const targetId = String(input.entityId || '').trim();
        const command = String(input.command || 'media_play_pause').trim();

        if (mode === 'control' && targetId) {
          await ctx.ha.callService('media_player', command, { entity_id: targetId });
        }

        const all = await ctx.ha.getStates();
        const players = all
          .filter((s) => s.entity_id.startsWith('media_player.') || s.entity_id.startsWith('xbox.'))
          .map((s) => ({
            entity_id: s.entity_id,
            name: String(s.attributes?.friendly_name || s.entity_id),
            state: s.state,
            mediaTitle: s.attributes?.media_title || null,
            mediaArtist: s.attributes?.media_artist || null,
            appName: s.attributes?.app_name || null,
            volumeLevel: s.attributes?.volume_level ?? null,
          }));

        const active = players.filter((p) => p.state === 'playing' || p.state === 'paused' || p.state === 'on');
        return {
          summary: `${active.length} active media players (${players.length} total registered)`,
          data: {
            activeCount: active.length,
            totalCount: players.length,
            players,
          },
        };
      },
    });

    // =========================================================================
    // 11. YOUTUBE, GOOGLE MAPS / OSRM ROUTING & FX RATES (YT / MAPS / FIN)
    // =========================================================================
    this.register({
      id: 'youtube.videos.search',
      name: 'YouTube: Search Videos & Channels',
      domainCode: 'YT',
      category: 'youtube',
      icon: 'YT',
      description: 'Searches YouTube videos with live metadata, view counts, duration, and channel details (supports YouTube Data API v3 or zero-key live extraction).',
      defaultInput: { query: 'BambuLab X1C Gridfinity', maxResults: '8' },
      fields: [
        { key: 'query', label: 'Search Query', type: 'text', placeholder: 'BambuLab X1C / Home Assistant / Finanzen', required: true },
        { key: 'maxResults', label: 'Max Results', type: 'number', placeholder: '8' },
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || 'BambuLab X1C').trim();
        const maxResults = Math.max(1, Math.min(20, Number(input.maxResults || 8)));

        // Try Google OAuth / YouTube Data API v3 first if authorized
        try {
          const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);
          const apiRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
              query
            )}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            }
          );
          if (apiRes.ok) {
            const apiJson = (await apiRes.json()) as { items?: Array<Record<string, any>> };
            const videos = (apiJson.items || []).map((it) => ({
              videoId: it.id?.videoId,
              title: it.snippet?.title,
              channel: it.snippet?.channelTitle,
              publishedAt: it.snippet?.publishedAt,
              url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
            }));
            return {
              summary: `YouTube API: ${videos.length} videos for "${query}"`,
              data: { source: 'youtube_data_api_v3', query, count: videos.length, videos },
            };
          }
        } catch {}

        // Zero-Key Live Extraction from YouTube Search ytInitialData
        const res = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=de`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
            },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (!res.ok) {
          throw new Error(`YouTube HTTP ${res.status}: ${res.statusText}`);
        }
        const html = await res.text();
        const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
        if (!match) {
          throw new Error('Could not parse ytInitialData from YouTube response');
        }
        const ytData = JSON.parse(match[1]) as Record<string, any>;
        const contents =
          ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
            ?.contents?.[0]?.itemSectionRenderer?.contents || [];

        const videos: Array<Record<string, any>> = [];
        for (const item of contents) {
          const vr = item.videoRenderer;
          if (!vr || !vr.videoId) continue;
          videos.push({
            videoId: vr.videoId,
            title: vr.title?.runs?.[0]?.text || '',
            channel: vr.ownerText?.runs?.[0]?.text || '',
            duration: vr.lengthText?.simpleText || 'LIVE',
            views: vr.viewCountText?.simpleText || '',
            publishedTime: vr.publishedTimeText?.simpleText || '',
            url: `https://www.youtube.com/watch?v=${vr.videoId}`,
          });
          if (videos.length >= maxResults) break;
        }

        return {
          summary: `YouTube "${query}": ${videos.length} videos (${videos[0]?.title || 'ok'})`,
          data: {
            source: 'youtube_live_search',
            query,
            count: videos.length,
            videos,
          },
        };
      },
    });

    this.register({
      id: 'youtube.channel.feed',
      name: 'YouTube: Channel RSS Video Feed',
      domainCode: 'YT',
      category: 'youtube',
      icon: 'YT',
      description: 'Fetches the latest uploads from any YouTube channel via its official XML Atom feed without requiring API keys.',
      defaultInput: { channelId: 'UCsBjURrPoezykLs9EqgamOA', maxVideos: '8' },
      fields: [
        {
          key: 'channelId',
          label: 'YouTube Channel ID',
          type: 'text',
          placeholder: 'UCsBjURrPoezykLs9EqgamOA (Fireship)',
          required: true,
        },
        { key: 'maxVideos', label: 'Max Videos', type: 'number', placeholder: '8' },
      ],
      execute: async (input) => {
        const channelId = String(input.channelId || 'UCsBjURrPoezykLs9EqgamOA').trim();
        const maxVideos = Math.max(1, Math.min(15, Number(input.maxVideos || 8)));
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

        const res = await fetch(url, {
          headers: { 'User-Agent': 'Thassi-Axons/2.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          throw new Error(`YouTube Feed HTTP ${res.status} for channel ${channelId}`);
        }
        const xml = await res.text();
        const channelTitle = xml.match(/<author>\s*<name>(.*?)<\/name>/s)?.[1] || channelId;
        const entryMatches = [...xml.matchAll(/<entry>(.*?)<\/entry>/gs)];

        const videos = entryMatches.slice(0, maxVideos).map((m) => {
          const block = m[1];
          const videoId = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] || '';
          const title = block.match(/<title>(.*?)<\/title>/)?.[1] || '';
          const published = block.match(/<published>(.*?)<\/published>/)?.[1] || '';
          const views = block.match(/views="(\d+)"/)?.[1] || '0';
          return {
            videoId,
            title,
            publishedAt: published,
            views: Number(views),
            url: `https://www.youtube.com/watch?v=${videoId}`,
          };
        });

        return {
          summary: `${channelTitle}: ${videos.length} recent uploads · Latest: "${videos[0]?.title || '—'}"`,
          data: {
            channelId,
            channelTitle,
            count: videos.length,
            videos,
          },
        };
      },
    });

    this.register({
      id: 'maps.routes.commute',
      name: 'Maps & Routing: Live Travel Time & Distance',
      domainCode: 'MAPS',
      category: 'maps',
      icon: 'MAPS',
      description: 'Geocodes addresses and calculates live driving distance, duration, and route geometry from St. Veit an der Gölsen (or any origin) to any destination.',
      defaultInput: {
        origin: 'St. Veit an der Gölsen, Austria',
        destination: 'St. Pölten Hauptbahnhof, Austria',
      },
      fields: [
        { key: 'origin', label: 'Origin Address or "lat,lon"', type: 'text', placeholder: 'St. Veit an der Gölsen, Austria', required: true },
        { key: 'destination', label: 'Destination Address or "lat,lon"', type: 'text', placeholder: 'St. Pölten Hauptbahnhof, Austria', required: true },
      ],
      execute: async (input) => {
        const geocode = async (queryStr: string): Promise<{ lat: number; lon: number; label: string }> => {
          const coordMatch = queryStr.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
          if (coordMatch) {
            return { lat: Number(coordMatch[1]), lon: Number(coordMatch[2]), label: queryStr };
          }
          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            queryStr
          )}&format=json&limit=1`;
          const res = await fetch(nomUrl, {
            headers: { 'User-Agent': 'Thassi-Axons-HomeAssistant/2.0 (thomas.simhofer@gmail.com)' },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
          const hits = (await res.json()) as Array<Record<string, any>>;
          if (!hits.length) throw new Error(`Location not found: "${queryStr}"`);
          return {
            lat: Number(hits[0].lat),
            lon: Number(hits[0].lon),
            label: String(hits[0].display_name || queryStr),
          };
        };

        const originStr = String(input.origin || '48.0444, 15.6689').trim();
        const destStr = String(input.destination || 'St. Pölten, Austria').trim();

        const [orig, dest] = await Promise.all([geocode(originStr), geocode(destStr)]);
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${orig.lon},${orig.lat};${dest.lon},${dest.lat}?overview=false&steps=true`;

        const routeRes = await fetch(routeUrl, {
          headers: { 'User-Agent': 'Thassi-Axons/2.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (!routeRes.ok) {
          throw new Error(`Routing Engine HTTP ${routeRes.status}`);
        }
        const routeData = (await routeRes.json()) as Record<string, any>;
        const primaryRoute = routeData.routes?.[0];
        if (!primaryRoute) {
          throw new Error('No driving route found between origin and destination');
        }

        const distanceKm = Number((Number(primaryRoute.distance || 0) / 1000).toFixed(1));
        const durationMin = Math.round(Number(primaryRoute.duration || 0) / 60);

        return {
          summary: `${originStr} -> ${destStr}: ${distanceKm} km · ${durationMin} min driving`,
          data: {
            origin: orig,
            destination: dest,
            distanceKm,
            durationMinutes: durationMin,
            summaryRoute: primaryRoute.legs?.[0]?.summary || '',
          },
        };
      },
    });

    this.register({
      id: 'finance.market.rates',
      name: 'Finance: EZB Live FX & Currency Reference Rates',
      domainCode: 'FIN',
      category: 'finance',
      icon: 'FIN',
      description: 'Fetches daily European Central Bank (EZB) foreign exchange reference rates via Frankfurter API.',
      defaultInput: { base: 'EUR', symbols: 'USD,CHF,GBP,JPY,PLN,CZK,HUF' },
      fields: [
        { key: 'base', label: 'Base Currency', type: 'text', placeholder: 'EUR' },
        { key: 'symbols', label: 'Target Currencies (CSV)', type: 'text', placeholder: 'USD,CHF,GBP,JPY,PLN,CZK,HUF' },
      ],
      execute: async (input) => {
        const base = String(input.base || 'EUR').trim().toUpperCase();
        const symbols = String(input.symbols || 'USD,CHF,GBP,JPY,PLN,CZK,HUF').trim().toUpperCase();
        const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(
          symbols
        )}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          throw new Error(`Frankfurter EZB API HTTP ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as {
          amount: number;
          base: string;
          date: string;
          rates: Record<string, number>;
        };

        const ratePairs = Object.entries(data.rates || {}).map(([k, v]) => `${k}: ${v}`);
        return {
          summary: `1 ${data.base} (${data.date}) -> ${ratePairs.slice(0, 4).join(' · ')}`,
          data,
        };
      },
    });

    // =========================================================================
    // 12. DEVELOPER WORKSTATION AGENT (PC: DESKTOP-M8TJERB · 192.168.188.46:5185)
    // =========================================================================
    this.register({
      id: 'pc.status.telemetry',
      name: 'Workstation: Live Telemetry, Monitors & KVM Link',
      domainCode: 'PC',
      category: 'system',
      icon: 'PC',
      description: 'Reads live CPU/RAM usage, active window, attached displays (DISPLAY1-3), audio volume, and Web-VNC/KVM stream URL from Thassi.PcAgent on DESKTOP-M8TJERB.',
      defaultInput: { agentUrl: 'http://192.168.188.46:5185' },
      fields: [
        { key: 'agentUrl', label: 'PC Agent URL', type: 'text', placeholder: 'http://192.168.188.46:5185' },
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || 'http://192.168.188.46:5185').replace(/\/+$/, '');
        const snap = await PcAgentReverseBridge.getStatusOrCall(baseUrl);
        return {
          summary: `${snap.hostname} (${snap.sessionLocked ? 'LOCKED' : 'ACTIVE'}) · CPU ${snap.cpuUsagePercent}% · RAM ${snap.memoryUsedGb}/${snap.memoryTotalGb} GB · ${snap.displayCount} Displays`,
          data: snap,
        };
      },
    });

    this.register({
      id: 'pc.power.control',
      name: 'Workstation: Power, Wake-on-LAN & Monitor Control',
      domainCode: 'PC',
      category: 'system',
      icon: 'PC',
      description: 'Powers DESKTOP-M8TJERB ON via UDP Wake-on-LAN Magic Packet (30:9C:23:E1:03:96) or executes Shutdown, Reboot, Standby, Hibernate, Lock, and Monitor Off/On via Thassi.PcAgent.',
      defaultInput: {
        action: 'wake_on_lan',
        macAddress: '30:9C:23:E1:03:96',
        broadcastIp: '192.168.188.255',
        agentUrl: 'http://192.168.188.46:5185',
        delaySeconds: '5',
      },
      fields: [
        {
          key: 'action',
          label: 'Power Action',
          type: 'select',
          options: [
            'wake_on_lan',
            'monitors_on',
            'monitors_off',
            'lock',
            'sleep',
            'hibernate',
            'reboot',
            'shutdown',
            'abort_shutdown',
          ],
        },
        { key: 'macAddress', label: 'MAC Address (for WOL)', type: 'text', placeholder: '30:9C:23:E1:03:96' },
        { key: 'broadcastIp', label: 'LAN Broadcast IP', type: 'text', placeholder: '192.168.188.255' },
        { key: 'agentUrl', label: 'PC Agent URL', type: 'text', placeholder: 'http://192.168.188.46:5185' },
        { key: 'delaySeconds', label: 'Shutdown/Reboot Delay (s)', type: 'number', placeholder: '5' },
      ],
      execute: async (input, ctx) => {
        const action = String(input.action || 'wake_on_lan').trim().toLowerCase();
        const mac = String(input.macAddress || '30:9C:23:E1:03:96').trim();
        const broadcastIp = String(input.broadcastIp || '192.168.188.255').trim();
        const baseUrl = String(input.agentUrl || 'http://192.168.188.46:5185').replace(/\/+$/, '');
        const delaySeconds = Number(input.delaySeconds || 5);

        if (action === 'wake_on_lan' || action === 'wol' || action === 'on') {
          await _sendWakeOnLanMagicPacket(mac, broadcastIp);
          await ctx.ha.callService('script', 'turn_on', { entity_id: 'script.1770343452594' }).catch(() => null);
          return {
            summary: `Wake-on-LAN Magic Packet dispatched to ${mac} (${broadcastIp}:9)`,
            data: {
              action: 'wake_on_lan',
              macAddress: mac,
              broadcastIp,
              ports: [9, 7],
            },
          };
        }

        const data = await PcAgentReverseBridge.callEndpoint(baseUrl, '/api/power', { action, delaySeconds }, 6000);
        return {
          summary: `PC Power [${action}]: ${data.message || 'executed'}`,
          data,
        };
      },
    });

    this.register({
      id: 'pc.session.login',
      name: 'Workstation: User Login, Unlock & Winlogon Auto-Logon',
      domainCode: 'PC',
      category: 'system',
      icon: 'PC',
      description: 'Wakes displays, unlocks the Windows session (or injects PIN/Password), reattaches console sessions (tscon), or configures Winlogon AutoAdminLogon.',
      defaultInput: {
        mode: 'unlock',
        username: 'thoma',
        pinOrPassword: '',
        agentUrl: 'http://192.168.188.46:5185',
      },
      fields: [
        {
          key: 'mode',
          label: 'Login / Session Mode',
          type: 'select',
          options: ['unlock', 'tscon', 'enable_autologon', 'disable_autologon'],
        },
        { key: 'username', label: 'Windows Username', type: 'text', placeholder: 'thoma' },
        { key: 'pinOrPassword', label: 'PIN or Password (optional)', type: 'text', placeholder: 'Leave empty for curtain wake only' },
        { key: 'agentUrl', label: 'PC Agent URL', type: 'text', placeholder: 'http://192.168.188.46:5185' },
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || 'http://192.168.188.46:5185').replace(/\/+$/, '');
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          '/api/session/login',
          {
            mode: input.mode || 'unlock',
            username: input.username || 'thoma',
            pinOrPassword: input.pinOrPassword || '',
          },
          7000
        );
        if (data.ok === false) {
          throw new Error(data.error || 'PC Session Login failed');
        }
        return {
          summary: `${data.message || 'Session login command executed'}`,
          data,
        };
      },
    });

    this.register({
      id: 'pc.powershell.exec',
      name: 'Workstation: Execute PowerShell Command',
      domainCode: 'PC',
      category: 'system',
      icon: 'PC',
      description: 'Executes any PowerShell command or script directly on DESKTOP-M8TJERB via Thassi.PcAgent and returns stdout, stderr, and exit code.',
      defaultInput: {
        command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 Name, Id, CPU | Format-Table -AutoSize',
        workingDirectory: 'c:\\Users\\thoma\\source\\repos\\thassi',
        timeoutSeconds: '30',
        agentUrl: 'http://192.168.188.46:5185',
      },
      fields: [
        {
          key: 'command',
          label: 'PowerShell Command / Script',
          type: 'textarea',
          placeholder: 'Get-Service | Where-Object Status -eq Running',
          required: true,
        },
        { key: 'workingDirectory', label: 'Working Directory', type: 'text', placeholder: 'c:\\Users\\thoma\\source\\repos\\thassi' },
        { key: 'timeoutSeconds', label: 'Timeout (s)', type: 'number', placeholder: '30' },
        { key: 'agentUrl', label: 'PC Agent URL', type: 'text', placeholder: 'http://192.168.188.46:5185' },
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || 'http://192.168.188.46:5185').replace(/\/+$/, '');
        const command = String(input.command || '').trim();
        if (!command) throw new Error('PowerShell command is required');

        const timeoutSec = Number(input.timeoutSeconds || 30);
        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          '/api/powershell/exec',
          {
            command,
            workingDirectory: input.workingDirectory || 'c:\\Users\\thoma\\source\\repos\\thassi',
            timeoutSeconds: timeoutSec,
          },
          Math.min(60000, timeoutSec * 1000 + 4000)
        );
        const firstLine = String(data.stdout || data.stderr || 'OK')
          .split('\n')
          .map((l) => l.trim())
          .find(Boolean) || 'OK';
        return {
          summary: `PS Exit ${data.exitCode} (${data.durationMs}ms): ${firstLine.slice(0, 90)}`,
          data,
        };
      },
    });

    this.register({
      id: 'pc.media.control',
      name: 'Workstation: Media Playback & Master Audio Volume',
      domainCode: 'PC',
      category: 'media',
      icon: 'PC',
      description: 'Controls media playback (Play/Pause, Next, Previous, Stop) and Windows CoreAudio Master Volume (0-100% / Mute) on DESKTOP-M8TJERB.',
      defaultInput: {
        action: 'play_pause',
        volumePercent: '',
        agentUrl: 'http://192.168.188.46:5185',
      },
      fields: [
        {
          key: 'action',
          label: 'Media Action',
          type: 'select',
          options: ['play_pause', 'next', 'prev', 'stop', 'mute', 'vol_up', 'vol_down', 'set_volume'],
        },
        { key: 'volumePercent', label: 'Master Volume % (0-100, optional)', type: 'number', placeholder: '50' },
        { key: 'agentUrl', label: 'PC Agent URL', type: 'text', placeholder: 'http://192.168.188.46:5185' },
      ],
      execute: async (input) => {
        const baseUrl = String(input.agentUrl || 'http://192.168.188.46:5185').replace(/\/+$/, '');
        const volRaw = String(input.volumePercent ?? '').trim();
        const volumePercent = volRaw !== '' && !Number.isNaN(Number(volRaw)) ? Number(volRaw) : null;

        const data = await PcAgentReverseBridge.callEndpoint(
          baseUrl,
          '/api/media/control',
          {
            action: input.action || 'play_pause',
            volumePercent,
          },
          5000
        );
        const m = data.media || {};
        if (PcAgentReverseBridge.latestStatus && data.media) {
          PcAgentReverseBridge.latestStatus.media = data.media;
        }
        return {
          summary: `PC Media [${data.action}] · Vol ${m.volumePercent ?? '—'}% · ${m.title || 'OK'}`,
          data,
        };
      },
    });

    // =========================================================================
    // 13. MEMO — UNIFIED KNOWLEDGE ENGINE (GOOGLE DRIVE, KEEP/NOTES, .MD, SQLITE)
    // =========================================================================
    this.register({
      id: 'google.drive.read_file',
      name: 'Google Drive: Read / Export File Content',
      domainCode: 'DRIVE',
      category: 'drive',
      icon: 'DRIVE',
      description: 'Reads or exports the full text content of a Google Doc, Markdown file, CSV, or plain text file from Google Drive v3.',
      defaultInput: { fileId: '', maxChars: '12000' },
      fields: [
        { key: 'fileId', label: 'Google Drive File ID', type: 'text', placeholder: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ', required: true },
        { key: 'maxChars', label: 'Max Characters', type: 'number', placeholder: '12000' },
      ],
      execute: async (input, ctx) => {
        const fileId = String(input.fileId || '').trim();
        if (!fileId) throw new Error('fileId is required');
        const maxChars = Math.max(500, Math.min(80000, Number(input.maxChars || 12000)));
        const token = await this.resolveGoogleAccessToken(ctx.credentials?.googleOAuthToken);

        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            fileId
          )}?fields=id,name,mimeType,modifiedTime,webViewLink,size`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!metaRes.ok) {
          throw new Error(`Drive file metadata HTTP ${metaRes.status}`);
        }
        const meta = (await metaRes.json()) as Record<string, any>;
        const mime = String(meta.mimeType || '');

        let contentText = '';
        if (mime === 'application/vnd.google-apps.document') {
          const expRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              fileId
            )}/export?mimeType=text/plain`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (expRes.ok) contentText = await expRes.text();
        } else if (mime === 'application/vnd.google-apps.spreadsheet') {
          const expRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              fileId
            )}/export?mimeType=text/csv`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (expRes.ok) contentText = await expRes.text();
        } else if (
          mime.startsWith('text/') ||
          mime.includes('json') ||
          mime.includes('markdown') ||
          mime.includes('xml')
        ) {
          const dlRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (dlRes.ok) contentText = await dlRes.text();
        } else {
          contentText = `[Binary/Media File: ${meta.name} (${mime})]`;
        }

        const clipped = contentText.slice(0, maxChars);
        return {
          summary: `Drive "${meta.name}" (${mime}) · ${clipped.length} chars`,
          data: {
            ...meta,
            content: clipped,
            formattedText: `# ${meta.name}\n\n${clipped}`,
          },
        };
      },
    });

    this.register({
      id: 'memo.search',
      name: 'Memo: Federated Knowledge Search (Drive + Notes + .md + SQLite)',
      domainCode: 'MEMO',
      category: 'system',
      icon: 'MEMO',
      description: 'Searches across Google Drive, Google Notes/Keep, local .md files, and all Thassi SQLite databases (Notes, Finance, Meals, Calendar, Projects) with relevance ranking.',
      defaultInput: {
        query: 'BambuLab',
        sources: 'all',
        limit: '20',
      },
      fields: [
        { key: 'query', label: 'Search Topic / Query', type: 'text', placeholder: 'BambuLab / Budget / Rezept / Home Assistant' },
        {
          key: 'sources',
          label: 'Sources Filter',
          type: 'select',
          options: ['all', 'markdown', 'notes', 'drive', 'database'],
        },
        { key: 'limit', label: 'Max Results', type: 'number', placeholder: '20' },
      ],
      execute: async (input, ctx) => {
        const query = String(input.query || '').trim();
        const sources = String(input.sources || 'all').toLowerCase();
        const limit = Math.max(1, Math.min(60, Number(input.limit || 20)));
        const hits = await executeFederatedMemoSearch(ctx, query, sources, limit, (t) =>
          this.resolveGoogleAccessToken(t)
        );
        return {
          summary: `Memo Search "${query || '*'}": ${hits.length} Treffer (${sources})`,
          data: {
            query,
            sources,
            count: hits.length,
            results: hits,
            formattedText: hits
              .map(
                (h, i) =>
                  `${i + 1}. [${h.sourceType.toUpperCase()}] ${h.title} (${h.ref})\n   ${h.snippet}`
              )
              .join('\n\n'),
          },
        };
      },
    });

    this.register({
      id: 'memo.note.upsert',
      name: 'Memo: Save Note or Markdown Document',
      domainCode: 'MEMO',
      category: 'system',
      icon: 'MEMO',
      description: 'Creates or updates a structured note or .md file in the Memo knowledge base and SQLite index.',
      defaultInput: {
        title: 'Neue Erkenntnis',
        content: '{{$input}}',
        tags: 'memo,wissen',
        saveAsMarkdownFile: 'true',
      },
      fields: [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'Projekt-Notiz / Zusammenfassung', required: true },
        { key: 'content', label: 'Markdown Content', type: 'textarea', placeholder: '# Überschrift\n\nInhalt...', required: true },
        { key: 'tags', label: 'Tags (CSV)', type: 'text', placeholder: 'ha,projekt,notiz' },
        { key: 'saveAsMarkdownFile', label: 'Also write .md file to Vault', type: 'select', options: ['true', 'false'] },
      ],
      execute: async (input, ctx) => {
        const title = String(input.title || 'Unbenannte Notiz').trim();
        const content = String(input.content || '').trim();
        const tags = String(input.tags || 'memo').trim();
        const writeMd = String(input.saveAsMarkdownFile ?? 'true') !== 'false';
        const now = new Date().toISOString();

        const memoDb = openAppDatabaseReadWrite(ctx.dataDir, 'memo');
        ensureMemoSchema(memoDb);

        let filePathRel = '';
        if (writeMd) {
          const vaultDir = path.join(ctx.dataDir, 'memo_vault');
          fs.mkdirSync(vaultDir, { recursive: true });
          const safeSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9äöüß_-]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || `note-${Date.now()}`;
          const fullPath = path.join(vaultDir, `${safeSlug}.md`);
          const mdBody = content.startsWith('#') ? content : `# ${title}\n\n${content}\n`;
          fs.writeFileSync(fullPath, mdBody, 'utf-8');
          filePathRel = `memo_vault/${safeSlug}.md`;
        }

        const existing = memoDb.queryOne<{ id: number }>(
          'SELECT id FROM memo_entries WHERE LOWER(title) = LOWER(?) LIMIT 1',
          [title]
        );
        let entryId: number;
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
            [writeMd ? 'markdown' : 'note', title, content, tags, filePathRel, now, now]
          );
          entryId = Number(res.lastInsertRowid);
        }

        // Also mirror quick summary into shared system_notes
        ctx.sharedDb.execute(
          'INSERT INTO system_notes (content, pinned, created_at) VALUES (?, 0, ?)',
          [`[${title}] ${content.slice(0, 280)}`, now]
        );

        return {
          summary: `Saved "${title}" to Memo (#${entryId}${filePathRel ? ` · ${filePathRel}` : ''})`,
          data: {
            id: entryId,
            title,
            tags,
            filePath: filePathRel || null,
            updatedAt: now,
          },
        };
      },
    });

    this.register({
      id: 'memo.context.bundle',
      name: 'Memo: Build Topic Context Bundle for AI',
      domainCode: 'MEMO',
      category: 'system',
      icon: 'MEMO',
      description: 'Compiles a structured Markdown context dossier for any topic by querying Google Drive, local .md files, notes, and SQLite databases.',
      defaultInput: {
        topic: 'Smart Home & Energie',
        maxSnippets: '12',
      },
      fields: [
        { key: 'topic', label: 'Topic / Research Question', type: 'text', placeholder: 'Smart Home / Finanzen / 3D Druck' },
        { key: 'maxSnippets', label: 'Max Context Blocks', type: 'number', placeholder: '12' },
      ],
      execute: async (input, ctx) => {
        const topic = String(input.topic || '').trim();
        const maxSnippets = Math.max(3, Math.min(30, Number(input.maxSnippets || 12)));
        const hits = await executeFederatedMemoSearch(ctx, topic, 'all', maxSnippets, (t) =>
          this.resolveGoogleAccessToken(t)
        );
        const markdownBundle = [
          `# MEMO CONTEXT DOSSIER — "${topic || 'Gesamtübersicht'}"`,
          `Generiert: ${new Date().toISOString()} · Treffer: ${hits.length}`,
          '',
          ...hits.map(
            (h, idx) =>
              `## [${idx + 1}] ${h.title} (${h.sourceType.toUpperCase()} · ${h.ref})\n${h.contentPreview || h.snippet}`
          ),
        ].join('\n\n');

        return {
          summary: `Context Bundle "${topic || '*'}": ${hits.length} sources (${markdownBundle.length} chars)`,
          data: {
            topic,
            sourceCount: hits.length,
            sources: hits,
            markdownBundle,
            formattedText: markdownBundle,
          },
        };
      },
    });

    // =========================================================================
    // 14. CORTEX — GEMINI CONTEXT-ENRICHED & QUASI-AGENTIC WORKSPACE
    // =========================================================================
    this.register({
      id: 'cortex.prompt.enriched',
      name: 'Cortex: Context-Enriched Gemini Intelligence',
      domainCode: 'AI',
      category: 'gemini',
      icon: 'AI',
      description: 'Enriches a prompt with live local data (Memo knowledge, Home Assistant, Calendar, Finance, Health, PC) and executes Gemini with a structured response pattern.',
      defaultInput: {
        prompt: 'Erstelle mein aktuelles Tages-Briefing und schlage die 3 wichtigsten nächsten Schritte vor.',
        contextScopes: 'memo,ha,calendar,finance,pc',
        responsePattern: 'SYNTHESIS_BRIEF',
        model: 'gemini-2.5-flash',
      },
      fields: [
        { key: 'prompt', label: 'Prompt / Auftrag', type: 'textarea', placeholder: 'Was soll Cortex analysieren oder ausführen?', required: true },
        { key: 'contextScopes', label: 'Context Scopes (CSV)', type: 'text', placeholder: 'memo,ha,calendar,finance,health,meals,pc' },
        {
          key: 'responsePattern',
          label: 'Antwort-Muster (Pattern)',
          type: 'select',
          options: [
            'SYNTHESIS_BRIEF',
            'ACTION_PLAN',
            'KNOWLEDGE_EXTRACT',
            'DECISION_MATRIX',
            'DATA_TABLE',
          ],
        },
        { key: 'model', label: 'Gemini Model', type: 'select', options: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
      ],
      execute: async (input, ctx) => {
        const prompt = String(input.prompt || '').trim();
        if (!prompt) throw new Error('Prompt is required');
        const scopes = String(input.contextScopes || 'memo,ha,calendar,finance')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const pattern = String(input.responsePattern || 'SYNTHESIS_BRIEF').toUpperCase();
        const model = String(input.model || 'gemini-2.5-flash').trim();
        const apiKey = ctx.credentials?.geminiApiKey || discoverGeminiApiKeyFromHass();
        if (!apiKey) {
          throw new Error('Gemini API Key fehlt. Bitte in Cortex oder Axons hinterlegen.');
        }

        const contextBlocks: string[] = [];
        if (scopes.includes('memo')) {
          const memoHits = await executeFederatedMemoSearch(ctx, prompt.slice(0, 60), 'all', 8, (t) =>
            this.resolveGoogleAccessToken(t)
          );
          if (memoHits.length > 0) {
            contextBlocks.push(
              `[MEMO KNOWLEDGE HITS]\n` +
                memoHits.map((h) => `- [${h.sourceType}] ${h.title}: ${h.snippet}`).join('\n')
            );
          }
        }
        if (scopes.includes('ha')) {
          try {
            const states = await ctx.ha.getStates();
            const active = states
              .filter(
                (s) =>
                  (s.entity_id.startsWith('light.') ||
                    s.entity_id.startsWith('switch.') ||
                    s.entity_id.startsWith('sensor.shelly')) &&
                  s.state !== 'unavailable'
              )
              .slice(0, 25)
              .map((s) => `${s.entity_id}=${s.state}${s.attributes?.unit_of_measurement || ''}`);
            contextBlocks.push(`[HOME ASSISTANT LIVE (${states.length} entities)]\n${active.join(', ')}`);
          } catch {}
        }
        if (scopes.includes('calendar')) {
          try {
            const calRes = await this.execute<Record<string, any>>('gcal.upcoming', { maxResults: '8' });
            contextBlocks.push(`[CALENDAR UPCOMING]\n${calRes.data?.formattedText || calRes.summary}`);
          } catch {}
        }
        if (scopes.includes('finance')) {
          try {
            const finRes = await this.execute('finance.summary.get', {});
            contextBlocks.push(`[FINANCE SUMMARY]\n${finRes.summary}`);
          } catch {}
        }
        if (scopes.includes('pc')) {
          try {
            const pcRes = await this.execute('pc.status.telemetry', {});
            contextBlocks.push(`[WORKSTATION PC]\n${pcRes.summary}`);
          } catch {}
        }

        const patternInstructions: Record<string, string> = {
          SYNTHESIS_BRIEF:
            'Antworte als präzises Executive Dossier (Markdown) mit: 1. Kernaussage, 2. Fakten aus den Live-Daten, 3. Konkrete Handlungsempfehlungen.',
          ACTION_PLAN:
            'Erstelle einen nummerierten, ausführbaren Aktionsplan und nenne zu jedem Schritt die passende Thassi Axon-ID (z.B. ha.service.call, gcal.create_event, memo.note.upsert, pc.powershell.exec).',
          KNOWLEDGE_EXTRACT:
            'Extrahiere strukturierte Fakten, Entitäten, Kernaussagen und Tags in sauberem Markdown für die dauerhafte Ablage in Memo.',
          DECISION_MATRIX:
            'Vergleiche die Optionen quantitativ anhand der Live-Daten (Kosten, Zeit, Nutzen, Risiko) und gib eine eindeutige Empfehlung.',
          DATA_TABLE:
            'Gib die Antwort als präzise Markdown-Tabelle mit klaren Spalten und tabellarischen Kennzahlen aus.',
        };

        const fullPrompt = [
          `AUFTRAG:\n${prompt}`,
          contextBlocks.length > 0 ? `\nANGEREICHERTE LOKALE LIVE-DATEN:\n${contextBlocks.join('\n\n')}` : '',
        ].join('\n');

        const { text, modelUsed } = await callGeminiGenerateContent({
          apiKey,
          model,
          prompt: fullPrompt,
          systemInstruction:
            `Du bist CORTEX, die lokale KI- und Agenten-Instanz im Thassi Home & Life OS von Thomas Simhofer. ` +
            (patternInstructions[pattern] || patternInstructions.SYNTHESIS_BRIEF),
        });

        return {
          summary: `Cortex [${pattern} · ${modelUsed}]: ${text.slice(0, 95).replace(/\n+/g, ' ')}`,
          data: {
            model: modelUsed,
            responsePattern: pattern,
            contextScopes: scopes,
            contextBlockCount: contextBlocks.length,
            response: text,
            formattedText: text,
          },
        };
      },
    });
  }
}

export interface PcBridgeQueuedCommand {
  id: string;
  endpoint: string;
  payload: Record<string, any>;
  createdAt: number;
}

class PcAgentReverseBridgeImpl {
  public latestStatus: Record<string, any> | null = null;
  public lastSeenAt = 0;
  public latestFrameJpeg: Buffer | null = null;
  public requestedMonitor = 'primary';
  private queue: PcBridgeQueuedCommand[] = [];
  private resolvers = new Map<
    string,
    { resolve: (val: Record<string, any>) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  public ingestSync(body: {
    status?: Record<string, any>;
    frameBase64?: string;
    monitor?: string;
  }): { requestedMonitor: string; commands: PcBridgeQueuedCommand[] } {
    this.lastSeenAt = Date.now();
    if (body.status && typeof body.status === 'object') {
      this.latestStatus = body.status;
    }
    if (body.frameBase64 && typeof body.frameBase64 === 'string') {
      this.latestFrameJpeg = Buffer.from(body.frameBase64, 'base64');
    }
    const commands = this.queue.splice(0, this.queue.length);
    return {
      requestedMonitor: this.requestedMonitor,
      commands,
    };
  }

  public resolveCommand(id: string, result: Record<string, any>, error?: string) {
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

  public async getStatusOrCall(baseUrl: string): Promise<Record<string, any>> {
    if (this.latestStatus && Date.now() - this.lastSeenAt < 15000) {
      return this.latestStatus;
    }
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) {
        const snap = (await res.json()) as Record<string, any>;
        this.latestStatus = snap;
        this.lastSeenAt = Date.now();
        return snap;
      }
    } catch {}
    if (this.latestStatus) {
      return this.latestStatus;
    }
    throw new Error('Thassi.PcAgent on DESKTOP-M8TJERB is currently offline or unreachable.');
  }

  public async callEndpoint(
    baseUrl: string,
    endpoint: string,
    payload: Record<string, any>,
    timeoutMs = 8000
  ): Promise<Record<string, any>> {
    // 1. Try direct HTTP first with short timeout (works when on same host or firewall open)
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(700),
      });
      if (res.ok) {
        return (await res.json()) as Record<string, any>;
      }
    } catch {}

    // 2. Dispatch via Outbound Reverse Bridge (bypasses Windows Firewall completely)
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await new Promise<Record<string, any>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(id);
        reject(new Error(`Timeout waiting for Thassi.PcAgent (${endpoint}) after ${timeoutMs}ms`));
      }, timeoutMs);

      this.resolvers.set(id, { resolve, reject, timer });
      this.queue.push({ id, endpoint, payload, createdAt: Date.now() });
    });
  }
}

export const PcAgentReverseBridge = new PcAgentReverseBridgeImpl();

async function _sendWakeOnLanMagicPacket(macAddress: string, broadcastIp: string): Promise<void> {
  const hexParts = macAddress
    .replace(/[^0-9a-fA-F]/g, '')
    .match(/.{1,2}/g);
  if (!hexParts || hexParts.length !== 6) {
    throw new Error(`Invalid MAC address for Wake-on-LAN: "${macAddress}"`);
  }
  const macBytes = Buffer.from(hexParts.map((h) => parseInt(h, 16)));
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }

  await new Promise<void>((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', (err) => {
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

function _sHasNumericPct(s: HaEntityState): boolean {
  return s.attributes?.unit_of_measurement === '%' && !Number.isNaN(Number(s.state));
}

export interface MemoSearchResult {
  id: string;
  sourceType: 'markdown' | 'notes' | 'drive' | 'database';
  sourceBadge: string;
  title: string;
  snippet: string;
  contentPreview: string;
  ref: string;
  tags: string[];
  updatedAt: string;
  score: number;
  externalUrl?: string;
}

export function ensureMemoSchema(memoDb: ThassiAppDatabase): void {
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

export async function executeFederatedMemoSearch(
  ctx: ThassiActionContext,
  rawQuery: string,
  sourcesFilter: string,
  limit: number,
  resolveToken: (explicit?: string) => Promise<string>
): Promise<MemoSearchResult[]> {
  const q = rawQuery.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const wantAll = !sourcesFilter || sourcesFilter === 'all';
  const wantMd = wantAll || sourcesFilter.includes('markdown') || sourcesFilter.includes('md');
  const wantNotes = wantAll || sourcesFilter.includes('note') || sourcesFilter.includes('keep');
  const wantDrive = wantAll || sourcesFilter.includes('drive');
  const wantDb = wantAll || sourcesFilter.includes('database') || sourcesFilter.includes('db');

  const results: MemoSearchResult[] = [];

  const computeScore = (title: string, body: string, tags = '', pinned = 0): number => {
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

  const extractSnippet = (text: string, maxLen = 220): string => {
    const clean = text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q || terms.length === 0) return clean.slice(0, maxLen);
    const low = clean.toLowerCase();
    for (const term of terms) {
      const idx = low.indexOf(term);
      if (idx >= 0) {
        const start = Math.max(0, idx - 55);
        const slice = clean.slice(start, start + maxLen);
        return (start > 0 ? '…' : '') + slice + (start + maxLen < clean.length ? '…' : '');
      }
    }
    return clean.slice(0, maxLen);
  };

  // 1. Search Memo DB (`memo_entries`)
  try {
    const memoDb = openAppDatabaseReadWrite(ctx.dataDir, 'memo');
    ensureMemoSchema(memoDb);
    const rows = memoDb.query<{
      id: number;
      source_type: string;
      title: string;
      content: string;
      tags: string;
      file_path: string;
      external_id: string;
      external_url: string;
      pinned: number;
      updated_at: string;
    }>('SELECT * FROM memo_entries ORDER BY pinned DESC, updated_at DESC LIMIT 250');

    for (const r of rows) {
      const sType: MemoSearchResult['sourceType'] =
        r.source_type === 'markdown'
          ? 'markdown'
          : r.source_type === 'drive'
            ? 'drive'
            : 'notes';
      if (sType === 'markdown' && !wantMd) continue;
      if (sType === 'notes' && !wantNotes) continue;
      if (sType === 'drive' && !wantDrive) continue;

      const sc = computeScore(r.title, r.content, r.tags, r.pinned);
      if (terms.length > 0 && sc <= (r.pinned ? 15 : 0)) continue;

      results.push({
        id: `memo_${r.id}`,
        sourceType: sType,
        sourceBadge:
          r.source_type === 'keep'
            ? 'GKEEP'
            : sType === 'markdown'
              ? 'MD'
              : sType === 'drive'
                ? 'DRIVE'
                : 'NOTE',
        title: r.title,
        snippet: extractSnippet(r.content),
        contentPreview: r.content.slice(0, 1800),
        ref: r.file_path || (r.external_id ? `drive:${r.external_id.slice(0, 10)}` : `memo#${r.id}`),
        tags: r.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        updatedAt: r.updated_at,
        score: sc + 10,
        externalUrl: r.external_url || undefined,
      });
    }
  } catch {}

  // 2. Scan Local .md files on disk (`memo_vault` + workspace root `.md`)
  if (wantMd) {
    const candidateDirs = [
      path.join(ctx.dataDir, 'memo_vault'),
      process.cwd(),
    ];
    const seenPaths = new Set<string>();
    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
          const full = path.join(dir, entry.name);
          if (seenPaths.has(full)) continue;
          seenPaths.add(full);
          const stat = fs.statSync(full);
          if (stat.size > 512_000) continue;
          const content = fs.readFileSync(full, 'utf-8');
          const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.name;
          const sc = computeScore( `${entry.name} ${firstHeading}`, content, 'markdown,local');
          if (terms.length > 0 && sc <= 0) continue;
          results.push({
            id: `md_${entry.name}`,
            sourceType: 'markdown',
            sourceBadge: 'MD',
            title: firstHeading,
            snippet: extractSnippet(content),
            contentPreview: content.slice(0, 2000),
            ref: entry.name,
            tags: ['markdown', 'file'],
            updatedAt: stat.mtime.toISOString(),
            score: sc + 5,
          });
        }
      } catch {}
    }
  }

  // 3. Search Shared & App SQLite Databases (`system_notes`, `transactions`, `recipes`, `cached_events`, `projects`)
  if (wantDb || wantNotes) {
    try {
      const sysNotes = ctx.sharedDb.query<{
        id: number;
        content: string;
        pinned: number;
        created_at: string;
      }>('SELECT * FROM system_notes ORDER BY pinned DESC, id DESC LIMIT 100');
      for (const sn of sysNotes) {
        if (!wantNotes && !wantDb) continue;
        const firstLine = sn.content.split('\n')[0]?.slice(0, 72) || `Notiz #${sn.id}`;
        const sc = computeScore(firstLine, sn.content, 'note,shared', sn.pinned);
        if (terms.length > 0 && sc <= (sn.pinned ? 15 : 0)) continue;
        results.push({
          id: `sysnote_${sn.id}`,
          sourceType: 'notes',
          sourceBadge: 'NOTE',
          title: firstLine,
          snippet: extractSnippet(sn.content),
          contentPreview: sn.content,
          ref: `shared.system_notes#${sn.id}`,
          tags: ['system_notes'],
          updatedAt: sn.created_at,
          score: sc,
        });
      }
    } catch {}
  }

  if (wantDb) {
    // Finance transactions
    try {
      const finDb = openAppDatabaseReadWrite(ctx.dataDir, 'finance-analytics');
      const txs = finDb.query<{
        id: number;
        tx_date: string;
        payee: string;
        category: string;
        amount: number;
        notes: string;
      }>('SELECT * FROM transactions ORDER BY tx_date DESC LIMIT 150');
      for (const tx of txs) {
        const text = `${tx.payee} ${tx.category} ${tx.notes || ''} ${tx.amount} EUR (${tx.tx_date})`;
        const sc = computeScore(`${tx.payee} ${tx.category}`, text, 'finanzen,buchung,ledger');
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_fin_${tx.id}`,
          sourceType: 'database',
          sourceBadge: 'DB:FIN',
          title: `${tx.payee} (${tx.amount >= 0 ? '+' : ''}${Number(tx.amount).toFixed(2)} €)`,
          snippet: `${tx.tx_date} · Kategorie: ${tx.category}${tx.notes ? ` · ${tx.notes}` : ''}`,
          contentPreview: JSON.stringify(tx, null, 2),
          ref: `finance.transactions#${tx.id}`,
          tags: ['finance', tx.category.toLowerCase()],
          updatedAt: `${tx.tx_date}T00:00:00Z`,
          score: sc,
        });
      }
    } catch {}

    // Meal Planner recipes
    try {
      const mealDb = openAppDatabaseReadWrite(ctx.dataDir, 'meal-planner');
      const recipes = mealDb.query<{
        id: number;
        title: string;
        category: string;
        calories: number;
        protein_g: number;
        ingredients_json: string;
        instructions: string;
      }>('SELECT * FROM recipes LIMIT 100');
      for (const rec of recipes) {
        const text = `${rec.title} ${rec.category} ${rec.ingredients_json || ''} ${rec.instructions || ''}`;
        const sc = computeScore(rec.title, text, 'rezept,meals,ernährung');
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_meal_${rec.id}`,
          sourceType: 'database',
          sourceBadge: 'DB:MEALS',
          title: `Rezept: ${rec.title}`,
          snippet: `${rec.calories} kcal · ${rec.protein_g}g Protein · ${extractSnippet(rec.instructions || rec.ingredients_json)}`,
          contentPreview: text.slice(0, 1500),
          ref: `meals.recipes#${rec.id}`,
          tags: ['meals', 'recipe'],
          updatedAt: new Date().toISOString(),
          score: sc,
        });
      }
    } catch {}

    // Calendar events
    try {
      const calDb = openAppDatabaseReadWrite(ctx.dataDir, 'google-calendar');
      const evs = calDb.query<{
        id: string;
        summary: string;
        start_time: string;
        location: string;
        description: string;
      }>('SELECT * FROM cached_events ORDER BY start_time DESC LIMIT 100');
      for (const ev of evs) {
        const text = `${ev.summary} ${ev.location || ''} ${ev.description || ''} ${ev.start_time}`;
        const sc = computeScore(ev.summary, text, 'kalender,termin,event');
        if (terms.length > 0 && sc <= 0) continue;
        results.push({
          id: `db_cal_${ev.id}`,
          sourceType: 'database',
          sourceBadge: 'DB:CAL',
          title: ev.summary,
          snippet: `${ev.start_time}${ev.location ? ` · ${ev.location}` : ''}${ev.description ? ` · ${ev.description}` : ''}`,
          contentPreview: text,
          ref: `calendar.events#${String(ev.id).slice(0, 10)}`,
          tags: ['calendar', 'event'],
          updatedAt: ev.start_time,
          score: sc,
        });
      }
    } catch {}
  }

  // 4. Live Google Drive Search (`drive/v3/files`)
  if (wantDrive) {
    try {
      const token = await resolveToken(ctx.credentials?.googleOAuthToken);
      const escaped = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const driveQuery = q
        ? `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`
        : 'trashed = false';
      const params = new URLSearchParams({
        pageSize: '15',
        q: driveQuery,
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink,description)',
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const data = (await res.json()) as { files?: Array<Record<string, any>> };
        for (const f of data.files || []) {
          const mime = String(f.mimeType || '');
          const shortMime = mime.includes('document')
            ? 'Google Doc'
            : mime.includes('spreadsheet')
              ? 'Google Sheet'
              : mime.includes('presentation')
                ? 'Slides'
                : mime.includes('pdf')
                  ? 'PDF'
                  : mime.includes('folder')
                    ? 'Folder'
                    : mime.split('/').pop() || 'File';
          const sc = computeScore(String(f.name || ''), String(f.description || shortMime), 'drive,google') + 20;
          results.push({
            id: `drive_${f.id}`,
            sourceType: 'drive',
            sourceBadge: 'DRIVE',
            title: String(f.name || 'Drive File'),
            snippet: `${shortMime} · Zuletzt geändert: ${f.modifiedTime || ''}${f.description ? ` · ${f.description}` : ''}`,
            contentPreview: `Google Drive File: ${f.name}\nID: ${f.id}\nType: ${mime}\nURL: ${f.webViewLink || ''}`,
            ref: `drive:${String(f.id).slice(0, 12)}`,
            tags: ['drive', shortMime.toLowerCase()],
            updatedAt: String(f.modifiedTime || new Date().toISOString()),
            score: sc,
            externalUrl: f.webViewLink || undefined,
          });
        }
      }
    } catch {}
  }

  // Deduplicate by title+sourceType and sort by score DESC, updatedAt DESC
  const unique = new Map<string, MemoSearchResult>();
  for (const item of results) {
    const key = `${item.sourceType}:${item.title.toLowerCase()}`;
    const prev = unique.get(key);
    if (!prev || item.score > prev.score) {
      unique.set(key, item);
    }
  }

  return Array.from(unique.values())
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
