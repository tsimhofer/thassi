import type { TableSummary, CsvImportResult } from './db.js';
import type { HaEntityState, HaConnectionStatus } from './ha-bridge.js';
import type { ThassiJobStatus } from './cron.js';
import type { GoogleOAuthStatus, GoogleCalendarEventSummary } from './google-oauth.js';

export type {
  TableSummary,
  CsvImportResult,
  HaEntityState,
  HaConnectionStatus,
  ThassiJobStatus,
  GoogleOAuthStatus,
  GoogleCalendarEventSummary,
};

declare global {
  interface Window {
    __THASSI_INGRESS_PATH__?: string;
    __THASSI_APP_ID__?: string;
  }
}

/**
 * Resolves the root base path whether running inside Home Assistant Ingress
 * (`/api/hassio_ingress/<token>`), inside `/apps/<appId>/`, or on localhost.
 */
export function getHostBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  if (window.__THASSI_INGRESS_PATH__) {
    return window.__THASSI_INGRESS_PATH__.replace(/\/+$/, '');
  }
  const pathname = window.location.pathname || '';
  const ingressMatch = pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  if (ingressMatch) {
    return ingressMatch[1];
  }
  try {
    if (window.parent && window.parent !== window) {
      if (window.parent.__THASSI_INGRESS_PATH__) {
        return window.parent.__THASSI_INGRESS_PATH__.replace(/\/+$/, '');
      }
      const parentPath = window.parent.location?.pathname || '';
      const parentMatch = parentPath.match(/^(\/api\/hassio_ingress\/[^/]+)/);
      if (parentMatch) {
        return parentMatch[1];
      }
    }
  } catch {
    // Ignore cross-origin parent access
  }
  return '';
}

/**
 * Create an API client scoped to a specific Thassi app (`appId`),
 * with built-in methods for calling your custom backend routes,
 * importing/analyzing CSVs in SQLite, querying Home Assistant, and triggering cron jobs.
 */
export function createAppClient(appId: string) {
  async function request<T = unknown>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const base = getHostBaseUrl();
    const appApiPrefix = `${base}/api/apps/${encodeURIComponent(appId)}`;
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const res = await fetch(`${appApiPrefix}${cleanPath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  return {
    appId,
    /** Call a custom route registered via `ctx.route(method, path, ...)` */
    get: <T = unknown>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    put: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
    delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),

    /** Built-in SQLite & CSV Data Analysis endpoints automatically mounted for every app */
    db: {
      listTables: () => request<{ tables: string[] }>('/_db/tables'),
      importCsv: (tableName: string, csvText: string, replaceTable = true) =>
        request<CsvImportResult>('/_db/import-csv', {
          method: 'POST',
          body: JSON.stringify({ tableName, csvText, replaceTable }),
        }),
      summarizeTable: (tableName: string) =>
        request<TableSummary>(`/_db/tables/${encodeURIComponent(tableName)}/summary`),
      queryTable: <T = Record<string, unknown>>(tableName: string, limit = 100) =>
        request<{ rows: T[] }>(`/_db/tables/${encodeURIComponent(tableName)}/rows?limit=${limit}`),
      runSql: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        request<{ rows: T[] }>('/_db/query', {
          method: 'POST',
          body: JSON.stringify({ sql, params }),
        }),
    },

    /** Built-in Home Assistant Bridge endpoints scoped to this app */
    ha: {
      getStatus: () => request<HaConnectionStatus>('/_ha/status'),
      getStates: (domain?: string) =>
        request<{ states: HaEntityState[] }>(
          `/_ha/states${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`
        ),
      callService: (domain: string, service: string, serviceData: Record<string, unknown> = {}) =>
        request('/_ha/service', {
          method: 'POST',
          body: JSON.stringify({ domain, service, serviceData }),
        }),
      publishSensor: (
        sensorSlug: string,
        state: string | number | boolean,
        attributes: Record<string, unknown> = {}
      ) =>
        request<HaEntityState>('/_ha/sensor', {
          method: 'POST',
          body: JSON.stringify({ sensorSlug, state, attributes }),
        }),
    },

    /** Built-in Background Cron Job endpoints for this app */
    jobs: {
      list: () => request<{ jobs: ThassiJobStatus[] }>('/_jobs'),
      trigger: (jobId: string) =>
        request<{ job: ThassiJobStatus }>(`/_jobs/${encodeURIComponent(jobId)}/run`, {
          method: 'POST',
        }),
    },

    /** Built-in Shared Google OAuth endpoints (Calendar, Health/Fitness) */
    google: {
      getStatus: () => request<GoogleOAuthStatus>('/_google/status'),
      getCalendarEvents: (maxResults = 15) =>
        request<{ events: GoogleCalendarEventSummary[] }>(
          `/_google/calendar/upcoming?maxResults=${maxResults}`
        ),
    },
  };
}
