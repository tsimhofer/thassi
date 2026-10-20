import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
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
  | 'weather'
  | 'bambu'
  | 'vision'
  | 'github'
  | 'gemini'
  | 'system'
  | 'http'
  | 'custom';

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
    const geminiApiKey =
      override?.geminiApiKey ||
      this.sharedDb.kvGet<string>('gemini_api_key', '') ||
      process.env.GEMINI_API_KEY ||
      '';
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
        const model = String(input.model || 'gemini-2.5-flash').trim();
        const promptText = String(input.prompt || '').trim();
        if (!promptText) throw new Error('Prompt is required');
        if (!ctx.credentials?.geminiApiKey) {
          throw new Error('gemini_api_key is not configured.');
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(ctx.credentials.geminiApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
            }),
            signal: AbortSignal.timeout(12000),
          }
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gemini API ${res.status}: ${errText || res.statusText}`);
        }

        const gemData = (await res.json()) as Record<string, any>;
        const replyText =
          gemData.candidates?.[0]?.content?.parts?.[0]?.text || 'Empty response from Gemini.';
        return {
          summary: replyText.slice(0, 100).replace(/\n+/g, ' '),
          data: { model, response: replyText, formattedText: replyText },
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
  }
}
