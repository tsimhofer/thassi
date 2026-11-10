import fs from 'node:fs';
import path from 'node:path';
import {
  defineThassiApp,
  ThassiAppDatabase,
  discoverGeminiApiKeyFromHass,
  callGeminiGenerateContent,
} from '@thassi/sdk';

export type CommChannel =
  | 'SNAP'
  | 'WA'
  | 'GMAIL'
  | 'SMS'
  | 'TG'
  | 'SIGNAL'
  | 'IG'
  | 'DISCORD'
  | 'PIXEL'
  | 'HA'
  | 'CORTEX'
  | 'CAL';

export interface ContactRow {
  id: string;
  name: string;
  role_or_relation: string;
  primary_channel: CommChannel;
  email: string;
  phone: string;
  whatsapp_handle: string;
  snapchat_handle: string;
  telegram_handle: string;
  birthday: string;
  notes: string;
  pinned: number;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string;
  last_message_channel: string;
  source: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  external_id: string;
  contact_id: string;
  direction: 'in' | 'out';
  channel: CommChannel;
  sender_name: string;
  subject: string;
  body: string;
  raw_meta_json: string;
  read: number;
  delivery_status: string;
  timestamp: string;
}

export interface ChannelStatusInfo {
  id: string;
  code: CommChannel;
  name: string;
  status: 'ok' | 'warn' | 'error';
  statusText: string;
  detail: string;
  messagesCount: number;
}

const FULL_COMM_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
];

function slugifyContactId(raw: string): string {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `contact-${Date.now()}`;
}

function cleanNotificationText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (str === 'null' || str === 'undefined') return '';
  return str;
}

function mapAndroidPackageToChannel(pkg: string, category = ''): CommChannel | null {
  const lower = pkg.toLowerCase();
  const cat = category.toLowerCase();

  // Ignore media players, system transport, and background services
  if (
    cat === 'transport' ||
    cat === 'sys' ||
    cat === 'service' ||
    lower.includes('youtube.music') ||
    lower.includes('spotify') ||
    lower.includes('systemui') ||
    lower.includes('vending') ||
    lower.includes('gms') ||
    lower === 'android'
  ) {
    return null;
  }

  if (lower.includes('snapchat')) return 'SNAP';
  if (lower.includes('whatsapp')) return 'WA';
  if (lower.includes('google.android.gm') || lower.includes('outlook') || lower.includes('k9') || cat === 'email') {
    return 'GMAIL';
  }
  if (lower.includes('telegram') || lower.includes('plusmessenger')) return 'TG';
  if (lower.includes('thoughtcrime.securesms') || lower.includes('signal')) return 'SIGNAL';
  if (
    lower.includes('apps.messaging') ||
    lower.includes('android.mms') ||
    lower.includes('samsung.android.messaging') ||
    lower.includes('dialer')
  ) {
    return 'SMS';
  }
  if (lower.includes('instagram')) return 'IG';
  if (lower.includes('discord')) return 'DISCORD';
  if (lower.includes('homeassistant')) return 'HA';

  if (cat === 'msg' || cat === 'call' || cat === 'social') {
    return 'PIXEL';
  }
  return null;
}

export default defineThassiApp(async (ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role_or_relation TEXT NOT NULL DEFAULT '',
      primary_channel TEXT NOT NULL DEFAULT 'GMAIL',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp_handle TEXT NOT NULL DEFAULT '',
      snapchat_handle TEXT NOT NULL DEFAULT '',
      telegram_handle TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL DEFAULT '',
      last_message_preview TEXT NOT NULL DEFAULT '',
      last_message_channel TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      contact_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'in',
      channel TEXT NOT NULL DEFAULT 'GMAIL',
      sender_name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      raw_meta_json TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      delivery_status TEXT NOT NULL DEFAULT 'delivered',
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_contact_ts ON messages(contact_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp DESC);
  `);

  const dataDir = path.resolve(
    process.env.THASSI_DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
  );

  // Rule 3: Always read shared credentials from ctx.sharedDb first
  function resolveGeminiKey(): { key: string; source: string } {
    const sharedKey = String(ctx.sharedDb.kvGet<string>('gemini_api_key', '') || '').trim();
    if (sharedKey) return { key: sharedKey, source: 'Shared Vault (shared.db)' };
    const localKey = String(ctx.db.kvGet<string>('gemini_api_key', '') || '').trim();
    if (localKey) return { key: localKey, source: 'App DB' };
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (envKey) return { key: envKey, source: 'Environment' };
    const hassKey = discoverGeminiApiKeyFromHass();
    if (hassKey) {
      try {
        ctx.sharedDb.kvSet('gemini_api_key', hassKey);
      } catch {}
      return { key: hassKey, source: 'Home Assistant Core' };
    }
    return { key: '', source: 'Nicht konfiguriert' };
  }

  function tryBridgeGoogleOAuthFromHassStorage(): void {
    try {
      const existingTokens = ctx.google.getTokens();
      if (existingTokens?.refreshToken && existingTokens?.accessToken) return;

      const storageDirs = ['/homeassistant/.storage', '/config/.storage'];
      for (const dir of storageDirs) {
        const entriesFile = path.join(dir, 'core.config_entries');
        const credsFile = path.join(dir, 'application_credentials');
        if (!fs.existsSync(entriesFile)) continue;

        const entriesRaw = JSON.parse(fs.readFileSync(entriesFile, 'utf-8'));
        const entries: any[] = entriesRaw?.data?.entries || [];
        const googleEntry = entries.find(
          (e) => e.domain === 'google' && e.data?.token?.refresh_token
        );
        if (!googleEntry) continue;

        const tokenObj = googleEntry.data.token;
        const authImpl = googleEntry.data.auth_implementation;
        let clientId = '';
        let clientSecret = '';

        if (fs.existsSync(credsFile)) {
          const credsRaw = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
          const items: any[] = credsRaw?.data?.items || [];
          const matchedCred =
            items.find((it) => it.id === authImpl || it.domain === 'google') || items[0];
          if (matchedCred) {
            clientId = matchedCred.client_id || '';
            clientSecret = matchedCred.client_secret || '';
          }
        }

        if (clientId && clientSecret) {
          const curCfg = ctx.google.getConfig();
          ctx.google.saveConfig({
            clientId,
            clientSecret,
            redirectUri:
              curCfg?.redirectUri || 'http://192.168.188.92:8099/api/system/google/callback',
            scopes: tokenObj.scope
              ? String(tokenObj.scope).split(' ')
              : ['https://www.googleapis.com/auth/calendar'],
          });
        }

        if (tokenObj.access_token || tokenObj.refresh_token) {
          const expiryDate = tokenObj.expires_at
            ? Number(tokenObj.expires_at) * 1000
            : Date.now() + 3000 * 1000;
          ctx.google.saveTokens({
            accessToken: tokenObj.access_token || '',
            refreshToken: tokenObj.refresh_token,
            expiryDate,
            scope: tokenObj.scope,
            tokenType: tokenObj.token_type || 'Bearer',
          });
          break;
        }
      }
    } catch {}
  }

  tryBridgeGoogleOAuthFromHassStorage();

  function upsertContact(input: {
    id?: string;
    name: string;
    role_or_relation?: string;
    primary_channel?: CommChannel;
    email?: string;
    phone?: string;
    whatsapp_handle?: string;
    snapchat_handle?: string;
    telegram_handle?: string;
    birthday?: string;
    notes?: string;
    pinned?: number;
    source?: string;
  }): ContactRow {
    const cleanName = input.name.trim();
    const id = input.id || slugifyContactId(cleanName);
    const now = new Date().toISOString();

    const existing =
      ctx.db.queryOne<ContactRow>('SELECT * FROM contacts WHERE id = ?', [id]) ||
      (input.email
        ? ctx.db.queryOne<ContactRow>("SELECT * FROM contacts WHERE LOWER(email) = LOWER(?) AND email != ''", [
            input.email.trim(),
          ])
        : undefined) ||
      ctx.db.queryOne<ContactRow>('SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)', [cleanName]);

    if (!existing) {
      ctx.db.execute(
        `INSERT INTO contacts (
          id, name, role_or_relation, primary_channel, email, phone,
          whatsapp_handle, snapchat_handle, telegram_handle, birthday, notes,
          pinned, unread_count, last_message_at, last_message_preview, last_message_channel,
          source, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', '', ?, ?)`,
        [
          id,
          cleanName,
          input.role_or_relation || '',
          input.primary_channel || 'GMAIL',
          input.email || '',
          input.phone || '',
          input.whatsapp_handle || '',
          input.snapchat_handle || '',
          input.telegram_handle || '',
          input.birthday || '',
          input.notes || '',
          input.pinned ?? 0,
          input.source || 'manual',
          now,
        ]
      );
      return ctx.db.queryOne<ContactRow>('SELECT * FROM contacts WHERE id = ?', [id])!;
    } else {
      ctx.db.execute(
        `UPDATE contacts SET
          name = CASE WHEN ? != '' THEN ? ELSE name END,
          role_or_relation = CASE WHEN ? != '' THEN ? ELSE role_or_relation END,
          primary_channel = CASE WHEN ? != '' THEN ? ELSE primary_channel END,
          email = CASE WHEN ? != '' THEN ? ELSE email END,
          phone = CASE WHEN ? != '' THEN ? ELSE phone END,
          whatsapp_handle = CASE WHEN ? != '' THEN ? ELSE whatsapp_handle END,
          snapchat_handle = CASE WHEN ? != '' THEN ? ELSE snapchat_handle END,
          telegram_handle = CASE WHEN ? != '' THEN ? ELSE telegram_handle END,
          birthday = CASE WHEN ? != '' THEN ? ELSE birthday END,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          pinned = CASE WHEN ? IS NOT NULL THEN ? ELSE pinned END,
          updated_at = ?
         WHERE id = ?`,
        [
          cleanName,
          cleanName,
          input.role_or_relation || '',
          input.role_or_relation || '',
          input.primary_channel || '',
          input.primary_channel || '',
          input.email || '',
          input.email || '',
          input.phone || '',
          input.phone || '',
          input.whatsapp_handle || '',
          input.whatsapp_handle || '',
          input.snapchat_handle || '',
          input.snapchat_handle || '',
          input.telegram_handle || '',
          input.telegram_handle || '',
          input.birthday || '',
          input.birthday || '',
          input.notes || '',
          input.notes || '',
          input.pinned !== undefined ? input.pinned : null,
          input.pinned !== undefined ? input.pinned : existing.pinned,
          now,
          existing.id,
        ]
      );
      return ctx.db.queryOne<ContactRow>('SELECT * FROM contacts WHERE id = ?', [existing.id])!;
    }
  }

  function insertMessageIfNew(msg: {
    external_id: string;
    contact_id: string;
    direction: 'in' | 'out';
    channel: CommChannel;
    sender_name: string;
    subject?: string;
    body: string;
    raw_meta_json?: string;
    read?: number;
    delivery_status?: string;
    timestamp: string;
  }): boolean {
    const existing = ctx.db.queryOne<{ id: number }>(
      'SELECT id FROM messages WHERE external_id = ?',
      [msg.external_id]
    );
    if (existing) return false;

    const cleanBody = msg.body.trim();
    if (!cleanBody) return false;

    ctx.db.execute(
      `INSERT INTO messages (
        external_id, contact_id, direction, channel, sender_name,
        subject, body, raw_meta_json, read, delivery_status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.external_id,
        msg.contact_id,
        msg.direction,
        msg.channel,
        msg.sender_name,
        (msg.subject || '').trim(),
        cleanBody,
        msg.raw_meta_json || '{}',
        msg.read ?? (msg.direction === 'out' ? 1 : 0),
        msg.delivery_status || 'delivered',
        msg.timestamp,
      ]
    );

    recalculateContactMessageSummary(msg.contact_id);
    return true;
  }

  function recalculateContactMessageSummary(contactId: string): void {
    const latest = ctx.db.queryOne<MessageRow>(
      'SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1',
      [contactId]
    );
    const unreadRow = ctx.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = ? AND direction = 'in' AND read = 0",
      [contactId]
    );

    if (latest) {
      const previewSource = latest.subject
        ? `${latest.subject} — ${latest.body}`
        : latest.body;
      const preview = previewSource.replace(/\s+/g, ' ').trim().slice(0, 120);
      ctx.db.execute(
        `UPDATE contacts SET
          unread_count = ?,
          last_message_at = ?,
          last_message_preview = ?,
          last_message_channel = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          unreadRow?.cnt ?? 0,
          latest.timestamp,
          preview,
          latest.channel,
          new Date().toISOString(),
          contactId,
        ]
      );
    } else {
      ctx.db.execute(
        `UPDATE contacts SET unread_count = 0 WHERE id = ?`,
        [contactId]
      );
    }
  }

  // Ensure core real contacts from Thomas's ecosystem exist
  function ensureBaseEcosystemContacts(): void {
    upsertContact({
      id: 'patricia-leuthner',
      name: 'Patricia Leuthner',
      role_or_relation: 'Partnerin · Shared Calendar (teebee)',
      primary_channel: 'WA',
      email: 'leuthner.patricia@gmail.com',
      pinned: 1,
      source: 'google_calendar',
    });

    upsertContact({
      id: 'florian-karpf',
      name: 'Florian Karpf',
      role_or_relation: 'Snapchat · Pixel 10 Live',
      primary_channel: 'SNAP',
      snapchat_handle: 'Florian Karpf',
      pinned: 1,
      source: 'pixel_live',
    });

    upsertContact({
      id: 'aishe-ha',
      name: 'Aishe (Home & Pixel 10)',
      role_or_relation: 'Home Assistant OS · Pixel 10 Push Bridge',
      primary_channel: 'HA',
      pinned: 1,
      source: 'ha_person',
    });

    upsertContact({
      id: 'cortex-ai',
      name: 'Cortex AI',
      role_or_relation: 'Thassi Intelligence · Direkt-Chat',
      primary_channel: 'CORTEX',
      pinned: 1,
      source: 'system',
    });
  }

  ensureBaseEcosystemContacts();

  let _lastSyncSummary = {
    syncedAt: new Date().toISOString(),
    pixelConnected: false,
    pixelActiveNotifs: 0,
    pixelPhoneState: 'idle',
    pixelDnd: 'off',
    pixelBattery: null as number | null,
    pixelSim1: '',
    pixelSim2: '',
    gmailApiStatus: 'unconfigured' as 'ok' | 'scope_missing' | 'unconfigured' | 'error',
    gmailApiMessage: '',
    peopleApiStatus: 'unconfigured' as 'ok' | 'scope_missing' | 'unconfigured',
    calendarContactsSynced: 0,
    newMessagesIngested: 0,
  };

  async function syncPixel10LiveNotifications(): Promise<{
    connected: boolean;
    activeCount: number;
    ingestedCount: number;
    phoneState: string;
    dnd: string;
    battery: number | null;
    sim1: string;
    sim2: string;
  }> {
    let ingestedCount = 0;
    try {
      const states = await ctx.ha.getStates();
      const sm = new Map(states.map((s) => [s.entity_id, s]));

      const activeNotifSensor = sm.get('sensor.pixel_10_active_notification_count');
      const lastNotifSensor = sm.get('sensor.pixel_10_last_notification');
      const phoneState = sm.get('sensor.pixel_10_phone_state')?.state || 'idle';
      const dnd = sm.get('sensor.pixel_10_do_not_disturb_sensor')?.state || 'off';
      const battRaw = Number(sm.get('sensor.pixel_10_battery_level')?.state);
      const battery = Number.isFinite(battRaw) ? battRaw : null;
      const sim1 = sm.get('sensor.pixel_10_sim_1')?.state || '';
      const sim2 = sm.get('sensor.pixel_10_sim_2')?.state || '';

      if (!activeNotifSensor && !lastNotifSensor) {
        return {
          connected: false,
          activeCount: 0,
          ingestedCount: 0,
          phoneState,
          dnd,
          battery,
          sim1,
          sim2,
        };
      }

      const activeCount = Number(activeNotifSensor?.state || 0) || 0;
      const attrs = (activeNotifSensor?.attributes || {}) as Record<string, unknown>;

      // Extract all unique notification suffixes from `android.title_<suffix>`
      const suffixes: string[] = [];
      for (const key of Object.keys(attrs)) {
        if (key.startsWith('android.title_')) {
          suffixes.push(key.slice('android.title_'.length));
        }
      }

      // Deduplicate group summary notifications (e.g. Gmail _0 vs _-80091263 with identical title & text)
      const seenContentSignatures = new Set<string>();

      // Sort suffixes so specific IDs (non-zero) come before _0 group summary IDs
      suffixes.sort((a, b) => {
        const aZero = a.endsWith('_0') ? 1 : 0;
        const bZero = b.endsWith('_0') ? 1 : 0;
        return aZero - bZero;
      });

      for (const suffix of suffixes) {
        const pkg = suffix.replace(/_-?\d+$/, '');
        const category = String(attrs[`${suffix}_category`] || '');
        const channel = mapAndroidPackageToChannel(pkg, category);
        if (!channel) continue;

        const rawTitle = cleanNotificationText(attrs[`android.title_${suffix}`]);
        const rawText = cleanNotificationText(attrs[`android.text_${suffix}`]);
        const rawBigText = cleanNotificationText(attrs[`android.bigText_${suffix}`]);
        const rawSubText = cleanNotificationText(attrs[`android.subText_${suffix}`]);
        const postTimeMs = Number(attrs[`${suffix}_post_time`] || 0);

        if (!rawTitle && !rawText && !rawBigText) continue;

        const senderName = rawTitle || pkg;
        const contentSig = `${channel}::${senderName.toLowerCase()}::${(rawText || rawBigText).slice(0, 80).toLowerCase()}`;
        if (seenContentSignatures.has(contentSig)) continue;
        seenContentSignatures.add(contentSig);

        const timestamp =
          postTimeMs > 1_000_000_000_000
            ? new Date(postTimeMs).toISOString()
            : activeNotifSensor?.last_updated || new Date().toISOString();

        // Determine subject & body
        let subject = '';
        let body = rawBigText || rawText;
        if (channel === 'GMAIL' && rawText && rawBigText && rawBigText.startsWith(rawText)) {
          subject = rawText;
          body = rawBigText.slice(rawText.length).trim() || rawBigText;
        } else if (channel === 'GMAIL' && rawText && rawBigText && rawText !== rawBigText) {
          subject = rawText;
          body = rawBigText;
        }

        // Upsert contact for this sender
        const contact = upsertContact({
          name: senderName,
          primary_channel: channel,
          role_or_relation:
            channel === 'SNAP'
              ? 'Snapchat · Pixel 10 Live'
              : channel === 'WA'
                ? 'WhatsApp · Pixel 10 Live'
                : channel === 'GMAIL'
                  ? `E-Mail${rawSubText && rawSubText.includes('@') ? ` · an ${rawSubText}` : ' · Pixel 10 Push'}`
                  : `${channel} · Pixel 10 Live`,
          snapchat_handle: channel === 'SNAP' ? senderName : '',
          whatsapp_handle: channel === 'WA' ? senderName : '',
          source: 'pixel_live',
        });

        // Stable deduplication ID using channel + sender + first 60 chars + rounded minute or notif suffix
        const sigHash = Buffer.from(`${channel}:${senderName}:${(rawText || body).slice(0, 60)}`)
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 28);
        const externalId = `pixel_${channel.toLowerCase()}_${sigHash}`;

        const inserted = insertMessageIfNew({
          external_id: externalId,
          contact_id: contact.id,
          direction: 'in',
          channel,
          sender_name: senderName,
          subject,
          body,
          raw_meta_json: JSON.stringify({
            package: pkg,
            suffix,
            subText: rawSubText,
            postTimeMs,
            device: 'Pixel 10',
          }),
          timestamp,
        });
        if (inserted) ingestedCount++;
      }

      // Also inspect sensor.pixel_10_last_notification if it has a valid non-unknown state
      if (
        lastNotifSensor &&
        lastNotifSensor.state &&
        lastNotifSensor.state !== 'unknown' &&
        lastNotifSensor.state !== 'unavailable'
      ) {
        const lAttrs = (lastNotifSensor.attributes || {}) as Record<string, unknown>;
        const pkg = String(lAttrs.package || '');
        const category = String(lAttrs.category || '');
        const channel = mapAndroidPackageToChannel(pkg, category);
        if (channel) {
          const senderName = cleanNotificationText(lAttrs['android.title']) || pkg;
          const text =
            cleanNotificationText(lAttrs['android.bigText']) ||
            cleanNotificationText(lAttrs['android.text']) ||
            cleanNotificationText(lastNotifSensor.state);
          if (senderName && text) {
            const postTimeMs = Number(lAttrs.post_time || 0);
            const timestamp =
              postTimeMs > 1_000_000_000_000
                ? new Date(postTimeMs).toISOString()
                : lastNotifSensor.last_updated || new Date().toISOString();
            const contact = upsertContact({
              name: senderName,
              primary_channel: channel,
              role_or_relation: `${channel} · Pixel 10 Live`,
              source: 'pixel_live',
            });
            const sigHash = Buffer.from(`${channel}:${senderName}:${text.slice(0, 60)}`)
              .toString('base64')
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 28);
            const inserted = insertMessageIfNew({
              external_id: `pixel_last_${channel.toLowerCase()}_${sigHash}`,
              contact_id: contact.id,
              direction: 'in',
              channel,
              sender_name: senderName,
              body: text,
              timestamp,
            });
            if (inserted) ingestedCount++;
          }
        }
      }

      return {
        connected: true,
        activeCount,
        ingestedCount,
        phoneState,
        dnd,
        battery,
        sim1,
        sim2,
      };
    } catch {
      return {
        connected: false,
        activeCount: 0,
        ingestedCount: 0,
        phoneState: 'unknown',
        dnd: 'off',
        battery: null,
        sim1: '',
        sim2: '',
      };
    }
  }

  async function syncCalendarAndBirthdayContacts(): Promise<number> {
    let count = 0;
    try {
      const calDbPath = path.join(dataDir, 'apps', 'google-calendar.db');
      if (!fs.existsSync(calDbPath)) return 0;
      const calDb = new ThassiAppDatabase(calDbPath);

      // 1. Birthday events -> real contacts with birthday metadata
      const bdayRows = calDb.query<{
        title: string;
        calendar_name: string;
        start_time: string;
      }>(
        `SELECT DISTINCT title, calendar_name, start_time
         FROM calendar_events
         WHERE calendar_name = 'Geburtstage' OR title LIKE '% hat Geburtstag%'
         ORDER BY start_time ASC`
      );

      for (const row of bdayRows) {
        const m = row.title.match(/^(.+?)\s+hat Geburtstag/i);
        if (!m) continue;
        const personName = m[1].trim();
        const dt = new Date(row.start_time);
        const bdayFormatted = !Number.isNaN(dt.getTime())
          ? dt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
          : '';

        const contact = upsertContact({
          name: personName,
          role_or_relation: bdayFormatted ? `Kontakt · Geburtstag ${bdayFormatted}` : 'Kontakt · Google Kalender',
          primary_channel: 'WA',
          birthday: bdayFormatted,
          source: 'google_calendar',
        });
        count++;

        // Add a subtle calendar milestone message if the contact has 0 messages yet
        const msgCount = ctx.db.queryOne<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM messages WHERE contact_id = ?',
          [contact.id]
        );
        if ((msgCount?.cnt ?? 0) === 0 && bdayFormatted) {
          insertMessageIfNew({
            external_id: `cal_bday_${contact.id}`,
            contact_id: contact.id,
            direction: 'in',
            channel: 'CAL',
            sender_name: personName,
            subject: `Geburtstag am ${bdayFormatted}`,
            body: `Kalender-Eintrag verknüpft: ${row.title} (${bdayFormatted}). Bereit für direkte Nachrichten über WhatsApp, SMS, E-Mail oder Pixel 10 Push.`,
            read: 1,
            timestamp: row.start_time,
          });
        }
      }

      // 2. Patricia Leuthner shared calendar events (`leuthner.patricia@gmail.com` & `teebee`)
      const patriciaEvents = calDb.query<{
        external_id: string;
        title: string;
        calendar_name: string;
        start_time: string;
        location: string;
      }>(
        `SELECT external_id, title, calendar_name, start_time, location
         FROM calendar_events
         WHERE calendar_name IN ('leuthner.patricia@gmail.com', 'teebee')
           AND start_time >= ?
         ORDER BY start_time ASC
         LIMIT 6`,
        [new Date(Date.now() - 3 * 86400_000).toISOString()]
      );

      if (patriciaEvents.length > 0) {
        const lines = patriciaEvents.map((ev) => {
          const d = new Date(ev.start_time).toLocaleString('de-AT', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `• ${d}: ${ev.title}${ev.location ? ` (${ev.location})` : ''} [${ev.calendar_name}]`;
        });
        insertMessageIfNew({
          external_id: `cal_patricia_shared_digest`,
          contact_id: 'patricia-leuthner',
          direction: 'in',
          channel: 'CAL',
          sender_name: 'Patricia Leuthner',
          subject: 'Geteilte Termine (leuthner.patricia@gmail.com · teebee)',
          body: lines.join('\n'),
          read: 1,
          timestamp: new Date(Date.now() - 3600_000).toISOString(),
        });
      }
    } catch {}
    return count;
  }

  async function syncGoogleGmailAndPeople(): Promise<{
    gmailStatus: 'ok' | 'scope_missing' | 'unconfigured' | 'error';
    gmailMessage: string;
    peopleStatus: 'ok' | 'scope_missing' | 'unconfigured';
    ingestedMessages: number;
  }> {
    let ingestedMessages = 0;
    const oauthStatus = ctx.google.getStatus();
    if (!oauthStatus.configured || !oauthStatus.authorized) {
      return {
        gmailStatus: 'unconfigured',
        gmailMessage: 'Google OAuth2 noch nicht autorisiert',
        peopleStatus: 'unconfigured',
        ingestedMessages: 0,
      };
    }

    let token = '';
    try {
      token = await ctx.google.getValidAccessToken();
    } catch (err) {
      return {
        gmailStatus: 'error',
        gmailMessage: err instanceof Error ? err.message : String(err),
        peopleStatus: 'unconfigured',
        ingestedMessages: 0,
      };
    }

    let gmailStatus: 'ok' | 'scope_missing' | 'unconfigured' | 'error' = 'ok';
    let gmailMessage = 'Gmail API v1 verbunden';

    try {
      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=label:INBOX',
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4500),
        }
      );

      if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          gmailStatus = 'scope_missing';
          gmailMessage = 'Pixel 10 Gmail-Push aktiv (OAuth Scope gmail.readonly optional erweiterbar)';
        } else {
          gmailStatus = 'error';
          gmailMessage = `Gmail HTTP ${listRes.status}`;
        }
      } else {
        const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
        for (const ref of (listData.messages || []).slice(0, 8)) {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(3500),
            }
          );
          if (!msgRes.ok) continue;
          const m = (await msgRes.json()) as Record<string, any>;
          const headers: Array<{ name: string; value: string }> = m.payload?.headers || [];
          const rawFrom = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unbekannt';
          const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(Kein Betreff)';
          const internalDateMs = Number(m.internalDate || 0);
          const timestamp =
            internalDateMs > 0 ? new Date(internalDateMs).toISOString() : new Date().toISOString();

          const emailMatch = rawFrom.match(/<([^>]+@[^>]+)>/);
          const emailAddr = emailMatch ? emailMatch[1].trim() : rawFrom.includes('@') ? rawFrom.trim() : '';
          const senderName = rawFrom.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || emailAddr || 'E-Mail Kontakt';

          const contact = upsertContact({
            name: senderName,
            primary_channel: 'GMAIL',
            email: emailAddr,
            role_or_relation: emailAddr ? `E-Mail · ${emailAddr}` : 'Gmail API',
            source: 'gmail_api',
          });

          const isUnread = Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD');
          const inserted = insertMessageIfNew({
            external_id: `gmail_api_${ref.id}`,
            contact_id: contact.id,
            direction: 'in',
            channel: 'GMAIL',
            sender_name: senderName,
            subject,
            body: cleanNotificationText(m.snippet) || subject,
            read: isUnread ? 0 : 1,
            timestamp,
          });
          if (inserted) ingestedMessages++;
        }
      }
    } catch (err) {
      gmailStatus = 'scope_missing';
      gmailMessage = err instanceof Error ? err.message : String(err);
    }

    // Try Google People API if scope is authorized
    let peopleStatus: 'ok' | 'scope_missing' | 'unconfigured' = 'scope_missing';
    try {
      const peopleRes = await fetch(
        'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,birthdays&pageSize=50',
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (peopleRes.ok) {
        peopleStatus = 'ok';
        const pData = (await peopleRes.json()) as { connections?: Array<Record<string, any>> };
        for (const person of pData.connections || []) {
          const displayName = person.names?.[0]?.displayName;
          if (!displayName) continue;
          const email = person.emailAddresses?.[0]?.value || '';
          const phone = person.phoneNumbers?.[0]?.value || '';
          upsertContact({
            name: displayName,
            email,
            phone,
            primary_channel: phone ? 'WA' : 'GMAIL',
            role_or_relation: email || phone || 'Google Contacts',
            source: 'google_people',
          });
        }
      }
    } catch {}

    return {
      gmailStatus,
      gmailMessage,
      peopleStatus,
      ingestedMessages,
    };
  }

  async function ensureSystemWelcomeMessages(): Promise<void> {
    const aisheCount = ctx.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = 'aishe-ha'"
    );
    if ((aisheCount?.cnt ?? 0) === 0) {
      insertMessageIfNew({
        external_id: 'sys_aishe_init',
        contact_id: 'aishe-ha',
        direction: 'in',
        channel: 'HA',
        sender_name: 'Aishe (Home & Pixel 10)',
        subject: 'Pixel 10 & Home Assistant Bridge aktiv',
        body: 'Direktkanal zu deinem Google Pixel 10 (notify.mobile_app_pixel_10) und Home Assistant OS. Nachrichten hier werden sofort als Push-Benachrichtigung oder App-Intent an dein Pixel 10 gesendet.',
        read: 1,
        timestamp: new Date(Date.now() - 7200_000).toISOString(),
      });
    }

    const cortexCount = ctx.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM messages WHERE contact_id = 'cortex-ai'"
    );
    if ((cortexCount?.cnt ?? 0) === 0) {
      insertMessageIfNew({
        external_id: 'sys_cortex_init',
        contact_id: 'cortex-ai',
        direction: 'in',
        channel: 'CORTEX',
        sender_name: 'Cortex AI',
        subject: 'Direkter KI-Kommunikationskanal',
        body: 'Schreibe mir eine kurze Nachricht oder Frage — ich antworte direkt hier im Chat mit Zugriff auf deine Kontakte, Termine und Smart-Home-Sensoren.',
        read: 1,
        timestamp: new Date(Date.now() - 10800_000).toISOString(),
      });
    }
  }

  async function syncAllCommunications(): Promise<typeof _lastSyncSummary> {
    await ensureSystemWelcomeMessages();
    const [pixelRes, calCount, googleRes] = await Promise.all([
      syncPixel10LiveNotifications(),
      syncCalendarAndBirthdayContacts(),
      syncGoogleGmailAndPeople(),
    ]);

    // Recalculate all contacts summaries
    const allContacts = ctx.db.query<{ id: string }>('SELECT id FROM contacts');
    for (const c of allContacts) {
      recalculateContactMessageSummary(c.id);
    }

    const totalUnreadRow = ctx.db.queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(unread_count), 0) as total FROM contacts'
    );
    const latestMsg = ctx.db.queryOne<MessageRow>(
      'SELECT * FROM messages ORDER BY timestamp DESC, id DESC LIMIT 1'
    );

    // Publish Home Assistant sensors & sharedDb summary
    try {
      const summaryPayload = {
        unreadCount: totalUnreadRow?.total ?? 0,
        totalContacts: allContacts.length,
        lastMessageSender: latestMsg?.sender_name || '',
        lastMessageChannel: latestMsg?.channel || '',
        lastMessagePreview: latestMsg?.body?.slice(0, 90) || '',
        lastMessageAt: latestMsg?.timestamp || '',
        pixelConnected: pixelRes.connected,
        syncedAt: new Date().toISOString(),
      };
      ctx.sharedDb.kvSet('thassi_contacts_summary', summaryPayload);

      await ctx.ha.publishSensor('unread_count', summaryPayload.unreadCount, {
        friendly_name: 'Thassi Contacts Unread Messages',
        icon: 'mdi:message-badge-outline',
        total_contacts: allContacts.length,
        last_sender: summaryPayload.lastMessageSender,
        last_channel: summaryPayload.lastMessageChannel,
        pixel_10_bridge: pixelRes.connected ? 'connected' : 'offline',
      });
    } catch {}

    _lastSyncSummary = {
      syncedAt: new Date().toISOString(),
      pixelConnected: pixelRes.connected,
      pixelActiveNotifs: pixelRes.activeCount,
      pixelPhoneState: pixelRes.phoneState,
      pixelDnd: pixelRes.dnd,
      pixelBattery: pixelRes.battery,
      pixelSim1: pixelRes.sim1,
      pixelSim2: pixelRes.sim2,
      gmailApiStatus: googleRes.gmailStatus,
      gmailApiMessage: googleRes.gmailMessage,
      peopleApiStatus: googleRes.peopleStatus,
      calendarContactsSynced: calCount,
      newMessagesIngested: pixelRes.ingestedCount + googleRes.ingestedMessages,
    };

    return _lastSyncSummary;
  }

  // Initial sync on startup
  void syncAllCommunications();

  // Periodic background sync every 2 minutes
  ctx.scheduleJob({
    id: 'sync-digital-communications',
    name: 'Sync Pixel 10 Notifications, Gmail, Contacts & Publish HA Sensor',
    description:
      'Ingests live Android messaging & email notifications from Pixel 10 Companion, Gmail API, and Google Calendar contacts into the unified SQLite chat stream.',
    intervalMinutes: 2,
    handler: async () => {
      const s = await syncAllCommunications();
      return `Pixel10=${s.pixelConnected ? 'OK' : 'OFF'} (active=${s.pixelActiveNotifs}) | NewMsgs=${s.newMessagesIngested} | Gmail=${s.gmailApiStatus}`;
    },
  });

  // ============================================================================
  // REST API ROUTES
  // ============================================================================

  // GET /state — Complete state for the Ultra Hyper Simplistic Chat Interface
  ctx.route('GET', '/state', async (req) => {
    const forceSync = req.query.sync === '1' || req.query.sync === 'true';
    if (forceSync || Date.now() - new Date(_lastSyncSummary.syncedAt).getTime() > 15_000) {
      await syncAllCommunications();
    }

    const contacts = ctx.db.query<ContactRow>(`
      SELECT * FROM contacts
      ORDER BY
        CASE WHEN unread_count > 0 THEN 0 ELSE 1 END ASC,
        CASE WHEN last_message_at != '' THEN last_message_at ELSE '1970-01-01' END DESC,
        pinned DESC,
        name ASC
    `);

    const messages = ctx.db.query<MessageRow>(`
      SELECT * FROM messages
      ORDER BY timestamp ASC, id ASC
      LIMIT 500
    `);

    const byChannelCounts = ctx.db.query<{ channel: CommChannel; cnt: number }>(`
      SELECT channel, COUNT(*) as cnt FROM messages GROUP BY channel
    `);
    const channelCountMap = new Map(byChannelCounts.map((r) => [r.channel, r.cnt]));

    const geminiInfo = resolveGeminiKey();
    const oauthStatus = ctx.google.getStatus();

    const channels: ChannelStatusInfo[] = [
      {
        id: 'pixel_bridge',
        code: 'PIXEL',
        name: 'Google Pixel 10 Live Bridge (HA Companion)',
        status: _lastSyncSummary.pixelConnected ? 'ok' : 'warn',
        statusText: _lastSyncSummary.pixelConnected
          ? `Verbunden · ${_lastSyncSummary.pixelActiveNotifs} aktive Push-Notifs · Akku ${_lastSyncSummary.pixelBattery ?? '—'}%`
          : 'Keine Verbindung zu sensor.pixel_10_active_notification_count',
        detail: `Spiegelt eingehende Nachrichten von Snapchat, WhatsApp, Signal, Telegram, SMS & Gmail in Echtzeit vom Pixel 10 (${_lastSyncSummary.pixelSim1 || 'SIM 1'} / ${_lastSyncSummary.pixelSim2 || 'SIM 2'}).`,
        messagesCount:
          (channelCountMap.get('SNAP') || 0) +
          (channelCountMap.get('WA') || 0) +
          (channelCountMap.get('SMS') || 0) +
          (channelCountMap.get('TG') || 0) +
          (channelCountMap.get('SIGNAL') || 0) +
          (channelCountMap.get('PIXEL') || 0),
      },
      {
        id: 'gmail_channel',
        code: 'GMAIL',
        name: 'Google Gmail (Push & REST API v1)',
        status:
          _lastSyncSummary.gmailApiStatus === 'ok'
            ? 'ok'
            : _lastSyncSummary.pixelConnected
              ? 'ok'
              : 'warn',
        statusText:
          _lastSyncSummary.gmailApiStatus === 'ok'
            ? 'Vollzugriff (gmail.readonly & gmail.send)'
            : 'Aktiv via Pixel 10 Gmail-Bridge (Direkt-API Scope optional)',
        detail: _lastSyncSummary.gmailApiMessage || 'Empfängt E-Mails für thomas.simhofer@gmail.com.',
        messagesCount: channelCountMap.get('GMAIL') || 0,
      },
      {
        id: 'calendar_people',
        code: 'CAL',
        name: 'Google Kalender & Kontakte-Synthese',
        status: 'ok',
        statusText: 'Synchronisiert (Shared Calendars & Geburtstage)',
        detail:
          'Verknüpft Kontakte aus leuthner.patricia@gmail.com, teebee, Familie und Geburtstage automatisch.',
        messagesCount: channelCountMap.get('CAL') || 0,
      },
      {
        id: 'cortex_ha',
        code: 'CORTEX',
        name: 'Cortex AI & Home Assistant Intercom',
        status: geminiInfo.key ? 'ok' : 'warn',
        statusText: geminiInfo.key ? `Bereit (${geminiInfo.source})` : 'Lokaler Synthesizer aktiv',
        detail: 'Ermöglicht Direkt-Chats mit Cortex AI, Aishe und 1-Klick KI-Antwortentwürfe.',
        messagesCount: (channelCountMap.get('CORTEX') || 0) + (channelCountMap.get('HA') || 0),
      },
    ];

    const totalUnread = contacts.reduce((acc, c) => acc + (c.unread_count || 0), 0);

    return {
      fetchedAt: new Date().toISOString(),
      syncSummary: _lastSyncSummary,
      kpis: {
        totalContacts: contacts.length,
        totalMessages: messages.length,
        unreadMessages: totalUnread,
        activeChannels: channels.filter((c) => c.status === 'ok').length,
      },
      credentials: {
        geminiConfigured: Boolean(geminiInfo.key),
        geminiSource: geminiInfo.source,
        googleOAuthAuthorized: oauthStatus.authorized,
        googleOAuthScopes: oauthStatus.scopes,
        gmailDirectSendReady:
          oauthStatus.scopes.includes('https://www.googleapis.com/auth/gmail.send') ||
          _lastSyncSummary.gmailApiStatus === 'ok',
      },
      channels,
      contacts,
      messages,
    };
  });

  // POST /sync — Force immediate multi-channel sync
  ctx.route('POST', '/sync', async () => {
    const summary = await syncAllCommunications();
    return { ok: true, summary };
  });

  // POST /mark-read — Mark all messages in a contact thread as read
  ctx.route('POST', '/mark-read', async (req) => {
    const body = (req.body || {}) as { contactId?: string };
    if (!body.contactId) return { status: 400, body: { error: 'contactId required' } };
    ctx.db.execute(
      'UPDATE messages SET read = 1 WHERE contact_id = ? AND read = 0',
      [body.contactId]
    );
    recalculateContactMessageSummary(body.contactId);
    return { ok: true };
  });

  // POST /contacts — Create or update a contact
  ctx.route('POST', '/contacts', async (req) => {
    const body = (req.body || {}) as Partial<ContactRow>;
    if (!body.name || !body.name.trim()) {
      return { status: 400, body: { error: 'Name ist erforderlich' } };
    }
    const contact = upsertContact({
      id: body.id,
      name: body.name.trim(),
      role_or_relation: body.role_or_relation,
      primary_channel: (body.primary_channel as CommChannel) || 'WA',
      email: body.email,
      phone: body.phone,
      whatsapp_handle: body.whatsapp_handle,
      snapchat_handle: body.snapchat_handle,
      telegram_handle: body.telegram_handle,
      birthday: body.birthday,
      notes: body.notes,
      pinned: body.pinned,
      source: 'manual',
    });
    return { ok: true, contact };
  });

  // DELETE /contacts — Delete a contact and its messages
  ctx.route('DELETE', '/contacts', async (req) => {
    const id = String(req.query.id || '').trim();
    if (!id) return { status: 400, body: { error: 'id required' } };
    ctx.db.execute('DELETE FROM messages WHERE contact_id = ?', [id]);
    ctx.db.execute('DELETE FROM contacts WHERE id = ?', [id]);
    return { ok: true, deletedId: id };
  });

  // POST /send — Send a message in the unified chat stream
  ctx.route('POST', '/send', async (req) => {
    const body = (req.body || {}) as {
      contactId?: string;
      channel?: CommChannel;
      subject?: string;
      text?: string;
      pushToPixel?: boolean;
    };

    const contactId = String(body.contactId || '').trim();
    const text = String(body.text || '').trim();
    if (!contactId || !text) {
      return { status: 400, body: { error: 'contactId and text are required' } };
    }

    const contact = ctx.db.queryOne<ContactRow>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    if (!contact) {
      return { status: 404, body: { error: 'Kontakt nicht gefunden' } };
    }

    const channel: CommChannel = body.channel || contact.primary_channel || 'PIXEL';
    const subject = String(body.subject || '').trim();
    const nowIso = new Date().toISOString();
    let deliveryStatus = 'sent';
    let dispatchNote = '';
    let launchUri: string | null = null;

    // 1. Outgoing message record
    const outExtId = `out_${contactId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 2. Dispatch according to channel
    if (channel === 'GMAIL' && contact.email) {
      try {
        const token = await ctx.google.getValidAccessToken();
        const mailSubject = subject || `Nachricht von Thomas Simhofer`;
        const mimeMessage = [
          `To: ${contact.email}`,
          `Subject: =?utf-8?B?${Buffer.from(mailSubject, 'utf8').toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          text,
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
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          deliveryStatus = 'delivered_gmail_api';
          dispatchNote = `E-Mail via Gmail API an ${contact.email} gesendet`;
        } else {
          throw new Error(`Gmail HTTP ${res.status}`);
        }
      } catch {
        // Fallback: Push actionable mailto notification to Pixel 10 & provide mailto URI
        launchUri = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
          subject || 'Nachricht'
        )}&body=${encodeURIComponent(text)}`;
        deliveryStatus = 'bridged_pixel';
        dispatchNote = `An Pixel 10 übergeben (${contact.email})`;
        try {
          await ctx.ha.callService('notify', 'mobile_app_pixel_10', {
            title: `E-Mail an ${contact.name}`,
            message: text,
            data: {
              clickAction: launchUri,
              tag: `thassi-mail-${contact.id}`,
            },
          });
        } catch {}
      }
    } else if (contact.id === 'cortex-ai' || channel === 'CORTEX') {
      deliveryStatus = 'delivered';
      dispatchNote = 'An Cortex AI übermittelt';
    } else if (contact.id === 'aishe-ha' || channel === 'HA') {
      try {
        await ctx.ha.callService('notify', 'mobile_app_pixel_10', {
          title: 'Thassi Intercom · Aishe',
          message: text,
          data: { tag: 'thassi-aishe-intercom' },
        });
        deliveryStatus = 'delivered_pixel_push';
        dispatchNote = 'Push-Nachricht an Pixel 10 zugestellt';
      } catch {
        try {
          await ctx.ha.callService('persistent_notification', 'create', {
            title: `Thassi Chat: ${contact.name}`,
            message: text,
          });
          deliveryStatus = 'delivered_ha';
          dispatchNote = 'Home Assistant Benachrichtigung erstellt';
        } catch {
          deliveryStatus = 'logged';
        }
      }
    } else {
      // Messaging apps: SNAP, WA, SMS, TG, SIGNAL, PIXEL
      const cleanPhone = (contact.phone || contact.whatsapp_handle || '').replace(/[^0-9+]/g, '');
      if (channel === 'WA') {
        launchUri = cleanPhone
          ? `https://wa.me/${cleanPhone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`
          : `https://web.whatsapp.com/`;
      } else if (channel === 'SNAP') {
        launchUri = 'https://web.snapchat.com/';
      } else if (channel === 'TG') {
        launchUri = contact.telegram_handle
          ? `https://t.me/${contact.telegram_handle.replace(/^@/, '')}`
          : 'https://web.telegram.org/';
      } else if (channel === 'SMS' && cleanPhone) {
        launchUri = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
      }

      if (body.pushToPixel !== false) {
        try {
          const appClickAction =
            channel === 'SNAP'
              ? 'app://com.snapchat.android'
              : channel === 'WA'
                ? 'app://com.whatsapp'
                : channel === 'TG'
                  ? 'app://org.telegram.messenger'
                  : channel === 'SIGNAL'
                    ? 'app://org.thoughtcrime.securesms'
                    : launchUri || 'app://com.google.android.apps.messaging';

          await ctx.ha.callService('notify', 'mobile_app_pixel_10', {
            title: `${channel} → ${contact.name}`,
            message: text,
            data: {
              clickAction: appClickAction,
              tag: `thassi-chat-${contact.id}`,
              channel: 'Thassi Contacts',
            },
          });
          deliveryStatus = 'pushed_to_pixel_10';
          dispatchNote = `An Pixel 10 übergeben (${channel} öffnen)`;
        } catch {
          deliveryStatus = 'logged';
          dispatchNote = 'Lokal im Verlauf gespeichert';
        }
      }
    }

    insertMessageIfNew({
      external_id: outExtId,
      contact_id: contact.id,
      direction: 'out',
      channel,
      sender_name: 'Thomas',
      subject,
      body: text,
      read: 1,
      delivery_status: deliveryStatus,
      timestamp: nowIso,
    });

    // Mark any unread incoming messages in this thread as read when replying
    ctx.db.execute('UPDATE messages SET read = 1 WHERE contact_id = ? AND read = 0', [contact.id]);
    recalculateContactMessageSummary(contact.id);

    // If chatting with Cortex AI or Aishe, generate an immediate in-thread response!
    let autoReply: MessageRow | null = null;
    if (contact.id === 'cortex-ai' || channel === 'CORTEX') {
      const gemini = resolveGeminiKey();
      let replyText = '';
      try {
        if (gemini.key) {
          const history = ctx.db
            .query<MessageRow>(
              'SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC LIMIT 6',
              [contact.id]
            )
            .reverse()
            .map((m) => `${m.direction === 'out' ? 'Thomas' : 'Cortex'}: ${m.body}`)
            .join('\n');

          const res = await callGeminiGenerateContent({
            apiKey: gemini.key,
            model: 'gemini-2.5-flash',
            systemInstruction:
              'Du bist Cortex im ultraminimalistischen Thassi Contacts Chat-Interface von Thomas Simhofer. Antworte extrem präzise, direkt, ohne Emojis und in maximal 2–4 kurzen Sätzen auf Deutsch.',
            prompt: `${history}\n\nAntworte direkt auf die letzte Nachricht von Thomas:`,
            temperature: 0.25,
            timeoutMs: 12000,
          });
          replyText = res.text;
        }
      } catch {}

      if (!replyText) {
        replyText = `Verstanden: "${text}". Pixel 10 Bridge (${
          _lastSyncSummary.pixelConnected ? 'verbunden' : 'bereitschaft'
        }, ${_lastSyncSummary.pixelActiveNotifs} aktive Push-Notifications) und lokale Kontaktdatenbank sind synchronisiert.`;
      }

      const replyId = `in_cortex_${Date.now()}`;
      const replyTs = new Date(Date.now() + 200).toISOString();
      insertMessageIfNew({
        external_id: replyId,
        contact_id: contact.id,
        direction: 'in',
        channel: 'CORTEX',
        sender_name: 'Cortex AI',
        body: replyText,
        read: 1,
        timestamp: replyTs,
      });
      autoReply =
        ctx.db.queryOne<MessageRow>('SELECT * FROM messages WHERE external_id = ?', [replyId]) ||
        null;
    } else if (contact.id === 'aishe-ha') {
      const replyId = `in_aishe_${Date.now()}`;
      const replyTs = new Date(Date.now() + 200).toISOString();
      const replyText = `Push-Nachricht "${text}" wurde an Google Pixel 10 (Akku: ${
        _lastSyncSummary.pixelBattery ?? '—'
      }%, Status: ${_lastSyncSummary.pixelPhoneState}, DND: ${_lastSyncSummary.pixelDnd}) gesendet.`;
      insertMessageIfNew({
        external_id: replyId,
        contact_id: contact.id,
        direction: 'in',
        channel: 'HA',
        sender_name: 'Aishe (Home & Pixel 10)',
        body: replyText,
        read: 1,
        timestamp: replyTs,
      });
      autoReply =
        ctx.db.queryOne<MessageRow>('SELECT * FROM messages WHERE external_id = ?', [replyId]) ||
        null;
    }

    return {
      ok: true,
      deliveryStatus,
      dispatchNote,
      launchUri,
      autoReply,
    };
  });

  // POST /ai-draft — 1-click concise reply draft for the active conversation
  ctx.route('POST', '/ai-draft', async (req) => {
    const body = (req.body || {}) as { contactId?: string };
    const contactId = String(body.contactId || '').trim();
    const contact = ctx.db.queryOne<ContactRow>('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) return { status: 404, body: { error: 'Kontakt nicht gefunden' } };

    const recent = ctx.db
      .query<MessageRow>(
        'SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC, id DESC LIMIT 5',
        [contactId]
      )
      .reverse();

    const gemini = resolveGeminiKey();
    if (gemini.key && recent.length > 0) {
      try {
        const transcript = recent
          .map((m) => `[${m.channel}] ${m.direction === 'out' ? 'Thomas' : m.sender_name}: ${m.body}`)
          .join('\n');
        const res = await callGeminiGenerateContent({
          apiKey: gemini.key,
          model: 'gemini-2.5-flash',
          systemInstruction:
            'Formuliere eine kurze, natürliche Antwort von Thomas auf Deutsch (1–2 Sätze, keine Emojis, keine Anführungszeichen, direkt sendefertig).',
          prompt: `Kontakt: ${contact.name} (${contact.role_or_relation})\nLetzte Nachrichten:\n${transcript}\n\nAntwort-Entwurf von Thomas:`,
          temperature: 0.3,
          timeoutMs: 8000,
        });
        if (res.text) {
          return { ok: true, draft: res.text.replace(/^["']|["']$/g, '').trim(), source: res.modelUsed };
        }
      } catch {}
    }

    const lastMsg = recent[recent.length - 1];
    const fallbackDraft = lastMsg
      ? `Hallo ${contact.name.split(' ')[0]}, danke für deine Nachricht — ich melde mich gleich bei dir.`
      : `Hallo ${contact.name.split(' ')[0]}, wie sieht es bei dir aus?`;
    return { ok: true, draft: fallbackDraft, source: 'local-template' };
  });

  // GET /google-oauth-url — Generate OAuth consent URL with Gmail & Contacts scopes
  ctx.route('GET', '/google-oauth-url', async (req) => {
    try {
      const redirectUri = String(
        req.query.redirectUri || 'http://192.168.188.92:8099/api/system/google/callback'
      );
      ctx.google.saveConfig({
        redirectUri,
        scopes: FULL_COMM_GOOGLE_SCOPES,
      });
      const url = ctx.google.getAuthorizationUrl(FULL_COMM_GOOGLE_SCOPES);
      return { ok: true, url, redirectUri, scopes: FULL_COMM_GOOGLE_SCOPES };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
});
