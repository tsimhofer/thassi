import { ThassiAppDatabase } from './db.js';
import { ThassiHaBridge } from './ha-bridge.js';
import { ThassiCronScheduler, ThassiJobDefinition } from './cron.js';
import { ThassiGoogleOAuthManager } from './google-oauth.js';

export * from './db.js';
export * from './ha-bridge.js';
export * from './cron.js';
export * from './google-oauth.js';

export interface ThassiAppManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category?: 'finance' | 'health' | 'meals' | 'calendar' | 'notes' | 'automation' | 'general';
}

export interface ThassiRequest {
  method: string;
  /** Path relative to `/api/apps/<appId>`, e.g. `/transactions` or `/notes` */
  path: string;
  query: Record<string, string>;
  body: unknown;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface ThassiResponse {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

export type ThassiRouteHandler = (
  req: ThassiRequest,
  ctx: ThassiAppContext
) => Promise< unknown | ThassiResponse > | unknown | ThassiResponse;

export interface ThassiAppContext {
  /** Unique app slug (e.g. 'finance', 'meals', 'health') */
  appId: string;
  /** Isolated persistent SQLite database for this app (`/data/apps/<appId>.db`) */
  db: ThassiAppDatabase;
  /** Shared persistent SQLite database across all Thassi apps (`/data/shared.db`) */
  sharedDb: ThassiAppDatabase;
  /** Home Assistant REST & custom sensor bridge */
  ha: ThassiHaBridge;
  /** Shared Google OAuth2 client manager (Calendar, Health/Fitness, etc.) */
  google: ThassiGoogleOAuthManager;
  /** Register a recurring background job for this app */
  scheduleJob: (job: ThassiJobDefinition) => void;
  /** Register an HTTP API route under `/api/apps/<appId><path>` */
  route: (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, handler: ThassiRouteHandler) => void;
}

export interface ThassiBackendModule {
  setup: (ctx: ThassiAppContext) => Promise<void> | void;
}

/**
 * Helper used in `apps/<app-id>/backend/index.ts` to define a full-stack Thassi app's backend:
 * SQLite schema migrations, API routes, background cron sync jobs, and Home Assistant sensors.
 */
export function defineThassiApp(setup: (ctx: ThassiAppContext) => Promise<void> | void): ThassiBackendModule {
  return { setup };
}
