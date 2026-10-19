import { ThassiAppDatabase } from './db.js';

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HaConnectionStatus {
  connected: boolean;
  mode: 'supervisor' | 'token' | 'unconfigured';
  haUrl: string;
  message?: string;
  version?: string;
}

export class ThassiHaBridge {
  private readonly appId: string;
  private readonly sharedDb: ThassiAppDatabase;

  constructor(appId: string, sharedDb: ThassiAppDatabase) {
    this.appId = appId.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    this.sharedDb = sharedDb;
  }

  private getCredentials(): { baseUrl: string; token: string; mode: 'supervisor' | 'token' | 'unconfigured' } {
    const supervisorToken = process.env.SUPERVISOR_TOKEN;
    if (supervisorToken) {
      return {
        baseUrl: 'http://supervisor/core/api',
        token: supervisorToken,
        mode: 'supervisor',
      };
    }

    const savedConfig = this.sharedDb.kvGet<{ haUrl?: string; haToken?: string }>('ha_connection');
    const haUrl = (
      savedConfig?.haUrl ||
      process.env.HA_URL ||
      'http://192.168.188.92:8123'
    ).replace(/\/+$/, '');
    const haToken = savedConfig?.haToken || process.env.HA_TOKEN || '';

    if (haToken) {
      return {
        baseUrl: `${haUrl}/api`,
        token: haToken,
        mode: 'token',
      };
    }

    return {
      baseUrl: `${haUrl}/api`,
      token: '',
      mode: 'unconfigured',
    };
  }

  private async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const { baseUrl, token, mode } = this.getCredentials();
    if (mode === 'unconfigured' || !token) {
      throw new Error(
        'Home Assistant API token is not configured. In Home Assistant OS this is injected automatically via SUPERVISOR_TOKEN; for local dev, configure HA_TOKEN in Thassi Hub Settings or .env.'
      );
    }

    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(3500),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HA API ${res.status} (${endpoint}): ${body || res.statusText}`);
    }

    return (await res.json()) as T;
  }

  /** Check connectivity to Home Assistant API */
  async getStatus(): Promise<HaConnectionStatus> {
    const { baseUrl, mode } = this.getCredentials();
    const displayUrl = baseUrl.replace(/\/api$/, '');

    if (mode === 'unconfigured') {
      return {
        connected: false,
        mode: 'unconfigured',
        haUrl: displayUrl,
        message: 'No SUPERVISOR_TOKEN or HA_TOKEN configured yet.',
      };
    }

    try {
      const config = await this.request<{ version?: string; location_name?: string }>('/config');
      return {
        connected: true,
        mode,
        haUrl: displayUrl,
        version: config.version,
        message: `Connected to ${config.location_name || 'Home Assistant'} (v${config.version || 'unknown'})`,
      };
    } catch (err) {
      return {
        connected: false,
        mode,
        haUrl: displayUrl,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Fetch all states or filter by domain (e.g. 'light', 'sensor', 'calendar', 'weather') */
  async getStates(domainFilter?: string): Promise<HaEntityState[]> {
    const states = await this.request<HaEntityState[]>('/states');
    if (!domainFilter) return states;
    const prefix = `${domainFilter.toLowerCase()}.`;
    return states.filter((s) => s.entity_id.toLowerCase().startsWith(prefix));
  }

  /** Fetch a single entity state */
  async getState(entityId: string): Promise<HaEntityState> {
    return this.request<HaEntityState>(`/states/${encodeURIComponent(entityId)}`);
  }

  /** Fetch events from a Home Assistant calendar.* entity over [startIso, endIso] */
  async getCalendarEvents(
    entityId: string,
    startIso: string,
    endIso: string
  ): Promise<
    Array<{
      summary?: string;
      description?: string;
      location?: string;
      uid?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>
  > {
    return this.request(
      `/calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );
  }

  /** Call a Home Assistant service (e.g. domain='light', service='toggle', data={ entity_id: 'light.office' }) */
  async callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.request(`/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: 'POST',
      body: JSON.stringify(serviceData),
    });
  }

  /**
   * Publish or update a custom sensor in Home Assistant scoped to this app.
   * Creates `sensor.thassi_<appId>_<sensorSlug>` in Home Assistant so dashboards & automations can use it!
   */
  async publishSensor(
    sensorSlug: string,
    state: string | number | boolean,
    attributes: {
      friendly_name?: string;
      unit_of_measurement?: string;
      icon?: string;
      device_class?: string;
      state_class?: string;
      [key: string]: unknown;
    } = {}
  ): Promise<HaEntityState> {
    const cleanSlug = sensorSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const entityId = `sensor.thassi_${this.appId}_${cleanSlug}`;
    const payload = {
      state: String(state),
      attributes: {
        friendly_name: attributes.friendly_name || `Thassi ${this.appId} ${cleanSlug}`,
        icon: attributes.icon || 'mdi:database-check',
        source_app: this.appId,
        updated_by: 'thassi',
        ...attributes,
      },
    };

    const nowIso = new Date().toISOString();
    // Record published sensor in shared DB so the Thassi Hub can display all published entities
    const published = this.sharedDb.kvGet<Record<string, { entityId: string; appId: string; state: string; updatedAt: string }>>('published_sensors', {}) || {};
    published[entityId] = {
      entityId,
      appId: this.appId,
      state: String(state),
      updatedAt: nowIso,
    };
    this.sharedDb.kvSet('published_sensors', published);

    try {
      return await this.request<HaEntityState>(`/states/${entityId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return {
        entity_id: entityId,
        state: payload.state,
        attributes: payload.attributes,
        last_changed: nowIso,
        last_updated: nowIso,
      };
    }
  }

  /** Fire a custom event on the Home Assistant event bus */
  async fireEvent(
    eventType: string,
    eventData: Record<string, unknown> = {}
  ): Promise<unknown> {
    const fullType = eventType.startsWith('thassi_') ? eventType : `thassi_${this.appId}_${eventType}`;
    return this.request(`/events/${encodeURIComponent(fullType)}`, {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }
}
