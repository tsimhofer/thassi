import { ThassiAppDatabase } from './db.js';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate: number;
  scope?: string;
  tokenType?: string;
}

export interface GoogleOAuthStatus {
  configured: boolean;
  authorized: boolean;
  clientId?: string;
  redirectUri?: string;
  scopes: string[];
  expiresAt?: string | null;
}

export interface GoogleCalendarEventSummary {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export const DEFAULT_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
];

export class ThassiGoogleOAuthManager {
  private readonly sharedDb: ThassiAppDatabase;

  constructor(sharedDb: ThassiAppDatabase) {
    this.sharedDb = sharedDb;
  }

  getConfig(): GoogleOAuthConfig | undefined {
    return this.sharedDb.kvGet<GoogleOAuthConfig>('google_oauth_config');
  }

  saveConfig(config: Partial<GoogleOAuthConfig>): GoogleOAuthStatus {
    const current = this.getConfig() || {
      clientId: '',
      clientSecret: '',
      redirectUri: 'http://localhost:8099/api/system/google/callback',
      scopes: DEFAULT_GOOGLE_SCOPES,
    };

    const updated: GoogleOAuthConfig = {
      clientId: (config.clientId ?? current.clientId).trim(),
      clientSecret: (config.clientSecret ?? current.clientSecret).trim(),
      redirectUri: (config.redirectUri ?? current.redirectUri).trim(),
      scopes: config.scopes && config.scopes.length > 0 ? config.scopes : current.scopes,
    };

    this.sharedDb.kvSet('google_oauth_config', updated);
    return this.getStatus();
  }

  getTokens(): GoogleOAuthTokens | undefined {
    return this.sharedDb.kvGet<GoogleOAuthTokens>('google_oauth_tokens');
  }

  saveTokens(tokens: GoogleOAuthTokens): void {
    const existing = this.getTokens();
    this.sharedDb.kvSet('google_oauth_tokens', {
      ...tokens,
      refreshToken: tokens.refreshToken || existing?.refreshToken,
    });
  }

  clearTokens(): void {
    this.sharedDb.kvDelete('google_oauth_tokens');
  }

  getStatus(): GoogleOAuthStatus {
    const cfg = this.getConfig();
    const tokens = this.getTokens();
    return {
      configured: Boolean(cfg?.clientId && cfg?.clientSecret),
      authorized: Boolean(tokens?.refreshToken || tokens?.accessToken),
      clientId: cfg?.clientId ? `${cfg.clientId.slice(0, 12)}...` : undefined,
      redirectUri: cfg?.redirectUri,
      scopes: cfg?.scopes || DEFAULT_GOOGLE_SCOPES,
      expiresAt: tokens?.expiryDate ? new Date(tokens.expiryDate).toISOString() : null,
    };
  }

  /** Build the Google OAuth2 consent screen URL */
  getAuthorizationUrl(extraScopes: string[] = []): string {
    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error('Google OAuth Client ID and Secret are not configured yet in Thassi Hub.');
    }

    const scopes = Array.from(new Set([...(cfg.scopes || DEFAULT_GOOGLE_SCOPES), ...extraScopes]));
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes.join(' '),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Exchange authorization code for access + refresh tokens */
  async exchangeCode(code: string): Promise<GoogleOAuthStatus> {
    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error('Google OAuth Client ID and Secret are not configured.');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to exchange Google OAuth code: ${errText}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    this.saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiryDate: Date.now() + (data.expires_in - 60) * 1000,
      scope: data.scope,
      tokenType: data.token_type,
    });

    return this.getStatus();
  }

  /** Automatically returns a valid access token, refreshing it if expired */
  async getValidAccessToken(): Promise<string> {
    const tokens = this.getTokens();
    if (!tokens) {
      throw new Error('Google account is not connected yet. Authorize in Thassi Hub Settings.');
    }

    if (tokens.accessToken && tokens.expiryDate > Date.now()) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      throw new Error('Google access token expired and no refresh token is available.');
    }

    const cfg = this.getConfig();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      throw new Error('Google OAuth Client ID and Secret are missing.');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to refresh Google token: ${errText}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    this.saveTokens({
      accessToken: data.access_token,
      refreshToken: tokens.refreshToken,
      expiryDate: Date.now() + (data.expires_in - 60) * 1000,
      scope: data.scope ?? tokens.scope,
      tokenType: data.token_type ?? tokens.tokenType,
    });

    return data.access_token;
  }

  /** Make an authenticated Google API request from any Thassi app (Calendar, Fitness/Health, etc.) */
  async googleFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getValidAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google API ${res.status}: ${body || res.statusText}`);
    }

    return (await res.json()) as T;
  }

  /** Convenience helper to fetch upcoming Google Calendar events */
  async fetchUpcomingCalendarEvents(maxResults = 15): Promise<GoogleCalendarEventSummary[]> {
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const data = await this.googleFetch<{
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        location?: string;
        description?: string;
      }>;
    }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`);

    return (data.items || []).map((item) => ({
      id: item.id,
      summary: item.summary || '(No title)',
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      location: item.location,
      description: item.description,
    }));
  }
}
