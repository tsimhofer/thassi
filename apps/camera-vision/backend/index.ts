import fs from 'node:fs';
import net from 'node:net';
import { defineThassiApp, type ThassiAppContext } from '@thassi/sdk';

export interface CameraSourceRow {
  id: string;
  name: string;
  room: string;
  source_type: string; // 'ha_entity' | 'go2rtc' | 'rtsp_http'
  stream_url: string;
  lan_ip: string;
  enabled: number;
  sample_interval_sec: number;
  target_classes: string;
  last_sampled_at: string;
  last_status: string;
  last_error: string;
}

export interface VisionDetectionRow {
  id: number;
  camera_id: string;
  camera_name: string;
  sampled_at: string;
  status: string;
  objects_json: string;
  total_objects: number;
  person_count: number;
  scene_summary: string;
  engine_used: string;
  processing_ms: number;
  snapshot_b64: string;
}

export interface VisionConfig {
  cyclicEnabled: boolean;
  intervalSeconds: number;
  visionEngine: 'auto' | 'gemini_direct' | 'ha_ai_task';
  geminiModel: string;
  geminiApiKey: string;
  go2rtcUrl: string;
  targetClasses: string[];
}

const DEFAULT_CAMERAS: Array<Omit<CameraSourceRow, 'last_sampled_at' | 'last_status' | 'last_error'>> = [
  {
    id: 'camera.garten_parkplatz_kamera',
    name: 'Kamera Draußen Hinten Werkstatt',
    room: 'Werkstatt / Außen',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '192.168.188.121',
    enabled: 1,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'car', 'bicycle', 'package', 'animal']),
  },
  {
    id: 'camera.cam_eg_vz_eingang',
    name: 'EG Vorzimmer Kamera',
    room: 'Vorzimmer EG / Büro OG',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '192.168.188.140',
    enabled: 1,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'package', 'animal']),
  },
  {
    id: 'camera.lsc_smart_ptz_camera_2',
    name: 'LSC Smart PTZ Camera 2',
    room: 'Innen / Allgemein',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 1,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'animal']),
  },
  {
    id: 'camera.lsc_smart_ptz_camera_3',
    name: 'LSC Smart PTZ Camera 3',
    room: 'Büro OG',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 1,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'animal']),
  },
  {
    id: 'camera.lsc_smart_outdoor_camera',
    name: 'LSC Smart Outdoor Camera',
    room: 'Garten / Außen',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 0,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'car', 'animal']),
  },
  {
    id: 'camera.lsc_smart_indoor_camera',
    name: 'LSC Smart Indoor Camera',
    room: 'Innen / Allgemein',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 0,
    sample_interval_sec: 300,
    target_classes: JSON.stringify(['person', 'animal']),
  },
];

function discoverGeminiApiKeyFromHassStorage(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const storagePath = '/homeassistant/.storage/core.config_entries';
  try {
    if (fs.existsSync(storagePath)) {
      const raw = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
      const entries = raw?.data?.entries || [];
      for (const e of entries) {
        if (e.domain === 'google_generative_ai_conversation' && e.data?.api_key) {
          return String(e.data.api_key).trim();
        }
      }
    }
  } catch {
    // Ignore read errors if not mounted
  }
  return '';
}

function checkTcpPort(ip: string, port: number, timeoutMs = 450): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ip) return resolve(false);
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, ip);
  });
}

let cachedWorkingGeminiModel = '';

async function resolveWorkingGeminiVisionModel(apiKey: string, preferred: string): Promise<string> {
  if (cachedWorkingGeminiModel) return cachedWorkingGeminiModel;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      const generateModels = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));

      const candidates = [
        preferred,
        'gemini-2.0-flash',
        'gemini-2.5-pro',
        'gemini-1.5-flash',
        'gemini-3.8-flash',
        ...generateModels.filter((n) => n.includes('flash') && !n.includes('tts') && !n.includes('image')),
        ...generateModels,
      ].filter(Boolean);

      for (const c of candidates) {
        if (generateModels.includes(c)) {
          cachedWorkingGeminiModel = c;
          return c;
        }
      }
    }
  } catch {
    // Fallback
  }
  return preferred || 'gemini-2.0-flash';
}

export default defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS camera_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT 'Allgemein',
      source_type TEXT NOT NULL DEFAULT 'ha_entity',
      stream_url TEXT NOT NULL DEFAULT '',
      lan_ip TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sample_interval_sec INTEGER NOT NULL DEFAULT 300,
      target_classes TEXT NOT NULL DEFAULT '["person","car","package","animal"]',
      last_sampled_at TEXT NOT NULL DEFAULT '',
      last_status TEXT NOT NULL DEFAULT 'unprobed',
      last_error TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vision_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      camera_name TEXT NOT NULL,
      sampled_at TEXT NOT NULL,
      status TEXT NOT NULL,
      objects_json TEXT NOT NULL DEFAULT '[]',
      total_objects INTEGER NOT NULL DEFAULT 0,
      person_count INTEGER NOT NULL DEFAULT 0,
      scene_summary TEXT NOT NULL DEFAULT '',
      engine_used TEXT NOT NULL DEFAULT '',
      processing_ms INTEGER NOT NULL DEFAULT 0,
      snapshot_b64 TEXT NOT NULL DEFAULT ''
    );
  `);

  function seedCameras() {
    const count =
      ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM camera_sources')?.cnt ?? 0;
    if (count === 0) {
      for (const c of DEFAULT_CAMERAS) {
        ctx.db.execute(
          `INSERT INTO camera_sources
           (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, target_classes, last_sampled_at, last_status, last_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '')`,
          [
            c.id,
            c.name,
            c.room,
            c.source_type,
            c.stream_url,
            c.lan_ip,
            c.enabled,
            c.sample_interval_sec,
            c.target_classes,
          ]
        );
      }
    }
  }
  seedCameras();

  function getConfig(): VisionConfig {
    const saved = ctx.db.kvGet<Partial<VisionConfig>>('vision_config') || {};
    const autoKey = discoverGeminiApiKeyFromHassStorage();
    return {
      cyclicEnabled: saved.cyclicEnabled ?? true,
      intervalSeconds: saved.intervalSeconds ?? 300,
      visionEngine: saved.visionEngine || 'auto',
      geminiModel: saved.geminiModel || 'gemini-2.0-flash',
      geminiApiKey: saved.geminiApiKey || autoKey,
      go2rtcUrl: saved.go2rtcUrl || 'http://192.168.188.92:1984',
      targetClasses: saved.targetClasses || ['person', 'car', 'package', 'animal', 'bicycle'],
    };
  }

  function getHaConnection(): { haUrl: string; haToken: string } {
    const saved =
      ctx.sharedDb.kvGet<{ haUrl?: string; haToken?: string }>('ha_connection') || {};
    return {
      haUrl: (
        saved.haUrl ||
        process.env.HA_URL ||
        (process.env.SUPERVISOR_TOKEN ? 'http://supervisor/core' : 'http://192.168.188.92:8123')
      ).replace(/\/+$/, ''),
      haToken: saved.haToken || process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN || '',
    };
  }

  async function acquireCameraSnapshot(
    cam: CameraSourceRow,
    cfg: VisionConfig
  ): Promise<{ ok: boolean; buffer?: Buffer; mimeType?: string; method?: string; error?: string }> {
    const { haUrl, haToken } = getHaConnection();

    // 1. If a custom stream_url or HTTP/MJPEG snapshot URL is configured, try direct or via go2rtc
    if (cam.stream_url && cam.stream_url.trim()) {
      const url = cam.stream_url.trim();
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
          const ct = r.headers.get('content-type') || '';
          if (r.ok && ct.startsWith('image/')) {
            return {
              ok: true,
              buffer: Buffer.from(await r.arrayBuffer()),
              mimeType: ct.split(';')[0],
              method: 'direct_http',
            };
          }
        }
        // Try grabbing frame via go2rtc
        const go2Url = `${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/frame.jpeg?src=${encodeURIComponent(url)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(7500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: 'go2rtc_frame' };
          }
        }
      } catch {
        // Continue to HA methods
      }
    }

    // 2. Try Home Assistant /api/camera_proxy/<entity_id>
    if (cam.id.startsWith('camera.') && haToken) {
      try {
        const proxyUrl = `${haUrl}/api/camera_proxy/${encodeURIComponent(cam.id)}`;
        const r = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${haToken}` },
          signal: AbortSignal.timeout(6500),
        });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.byteLength > 200) {
            return {
              ok: true,
              buffer: buf,
              mimeType: ct.split(';')[0],
              method: 'ha_camera_proxy',
            };
          }
        }
      } catch {
        // Continue
      }
    }

    // 3. Check if camera has an active LAN Tuya port or if HA Tuya integration needs re-auth
    const lan6668 = cam.lan_ip ? await checkTcpPort(cam.lan_ip, 6668, 400) : false;
    const lan554 = cam.lan_ip ? await checkTcpPort(cam.lan_ip, 554, 400) : false;

    if (lan554 && cam.lan_ip) {
      try {
        const rtspUrl = `rtsp://${cam.lan_ip}:554/`;
        const go2Url = `${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/frame.jpeg?src=${encodeURIComponent(rtspUrl)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(7000) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: 'lan_rtsp_go2rtc' };
          }
        }
      } catch {
        // Ignore
      }
    }

    const states = await ctx.ha.getStates('camera');
    const st = states.find((s) => s.entity_id === cam.id);
    if (!st) {
      return {
        ok: false,
        error: lan6668
          ? `Tuya-Integration in Home Assistant benötigt Re-Authentifizierung (Kamera im LAN unter ${cam.lan_ip}:6668 aktiv, kein lokaler RTSP-Port 554 offen)`
          : 'Kamera-Entität in Home Assistant nicht verfügbar (Tuya Re-Auth erforderlich oder Gerät offline)',
      };
    }

    if (st.state === 'unavailable' || st.state === 'unknown') {
      return {
        ok: false,
        error: lan6668
          ? `Kamera im WLAN erreichbar (${cam.lan_ip}:6668), aber Home Assistant meldet 'unavailable' (Tuya Cloud Re-Auth erforderlich)`
          : `Kamera Status in Home Assistant: '${st.state}' (offline oder Tuya Cloud-Token abgelaufen)`,
      };
    }

    return {
      ok: false,
      error: `Kein Einzelbild von ${cam.id} abrufbar (Tuya Cloud RTSPS-Stream meldet Signatur-/Verbindungsfehler)`,
    };
  }

  async function runObjectDetectionOnBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    targetClasses: string[],
    cfg: VisionConfig
  ): Promise<{
    objects: Array<{ label: string; confidence: number; count: number; details?: string }>;
    totalObjects: number;
    personCount: number;
    sceneSummary: string;
    engineUsed: string;
  }> {
    const b64 = imageBuffer.toString('base64');
    const apiKey = cfg.geminiApiKey || discoverGeminiApiKeyFromHassStorage();

    if (apiKey) {
      const model = await resolveWorkingGeminiVisionModel(apiKey, cfg.geminiModel);
      const prompt = `Du bist ein präzises Computer-Vision-Objekterkennungssystem für ein Smart-Home-Kamerabild.
Analysiere das Bild auf folgende Zielobjekte (sowie weitere relevante Objekte): ${targetClasses.join(', ')}.
Antworte AUSSCHLIESSLICH mit validem JSON im folgenden Schema:
{
  "objects": [
    { "label": "person", "confidence": 0.96, "count": 1, "details": "Kurze Beschreibung/Position" }
  ],
  "person_count": 0,
  "scene_summary": "Kurze deutsche Zusammenfassung der Szene (max. 1 Satz)"
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType || 'image/jpeg',
                    data: b64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const payload = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned) as {
          objects?: Array<{ label: string; confidence: number; count: number; details?: string }>;
          person_count?: number;
          scene_summary?: string;
        };
        const objs = Array.isArray(parsed.objects) ? parsed.objects : [];
        const total = objs.reduce((acc, o) => acc + (Number(o.count) || 1), 0);
        const persons =
          parsed.person_count ??
          objs
            .filter((o) => o.label.toLowerCase().includes('person'))
            .reduce((acc, o) => acc + (Number(o.count) || 1), 0);

        return {
          objects: objs,
          totalObjects: total,
          personCount: persons,
          sceneSummary: parsed.scene_summary || 'Szene erfolgreich analysiert.',
          engineUsed: `gemini (${model})`,
        };
      } else {
        const errBody = await res.text();
        throw new Error(`Gemini Vision API (${model}) HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }
    }

    throw new Error(
      'Kein aktiver Vision-API-Key konfiguriert. Bitte Gemini API-Key in den Einstellungen hinterlegen.'
    );
  }

  async function sampleSingleCamera(
    camId: string,
    appCtx: ThassiAppContext
  ): Promise<VisionDetectionRow | { error: string; camera_id: string }> {
    const cam = appCtx.db.queryOne<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE id = ?',
      [camId]
    );
    if (!cam) return { error: `Kamera ${camId} nicht gefunden`, camera_id: camId };

    const cfg = getConfig();
    const startMs = Date.now();
    const nowIso = new Date().toISOString();

    const snap = await acquireCameraSnapshot(cam, cfg);
    if (!snap.ok || !snap.buffer) {
      const errMsg = snap.error || 'Kein Kamerabild verfügbar';
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'offline', last_error = ? WHERE id = ?`,
        [nowIso, errMsg, cam.id]
      );
      return { error: errMsg, camera_id: cam.id };
    }

    try {
      let targetClasses = cfg.targetClasses;
      try {
        targetClasses = JSON.parse(cam.target_classes);
      } catch {
        // use default
      }

      const det = await runObjectDetectionOnBuffer(
        snap.buffer,
        snap.mimeType || 'image/jpeg',
        targetClasses,
        cfg
      );
      const elapsed = Date.now() - startMs;
      const thumbB64 =
        snap.buffer.byteLength <= 350_000 ? snap.buffer.toString('base64') : '';

      const info = appCtx.db.execute(
        `INSERT INTO vision_detections
         (camera_id, camera_name, sampled_at, status, objects_json, total_objects, person_count, scene_summary, engine_used, processing_ms, snapshot_b64)
         VALUES (?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?)`,
        [
          cam.id,
          cam.name,
          nowIso,
          JSON.stringify(det.objects),
          det.totalObjects,
          det.personCount,
          det.sceneSummary,
          det.engineUsed,
          elapsed,
          thumbB64,
        ]
      );

      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'online', last_error = '' WHERE id = ?`,
        [nowIso, cam.id]
      );

      await updateSharedSummaryAndHaSensors(appCtx);

      return (
        appCtx.db.queryOne<VisionDetectionRow>(
          'SELECT * FROM vision_detections WHERE id = ?',
          [info.lastInsertRowid]
        ) || { error: 'Gespeichert', camera_id: cam.id }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'vision_error', last_error = ? WHERE id = ?`,
        [nowIso, msg, cam.id]
      );
      return { error: msg, camera_id: cam.id };
    }
  }

  async function updateSharedSummaryAndHaSensors(appCtx: ThassiAppContext) {
    const cameras = appCtx.db.query<CameraSourceRow>('SELECT * FROM camera_sources');
    const latestDetections = appCtx.db.query<VisionDetectionRow>(
      `SELECT id, camera_id, camera_name, sampled_at, status, objects_json, total_objects, person_count, scene_summary, engine_used, processing_ms
       FROM vision_detections ORDER BY id DESC LIMIT 15`
    );
    const onlineCount = cameras.filter((c) => c.last_status === 'online').length;
    const lastDet = latestDetections[0] || null;

    const summary = {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((c) => c.enabled === 1).length,
      onlineCameras: onlineCount,
      lastDetectionAt: lastDet?.sampled_at || null,
      lastCameraName: lastDet?.camera_name || null,
      lastSceneSummary: lastDet?.scene_summary || null,
      lastTotalObjects: lastDet?.total_objects ?? 0,
      lastPersonCount: lastDet?.person_count ?? 0,
      updatedAt: new Date().toISOString(),
    };

    appCtx.sharedDb.kvSet('camera_vision_today', summary);

    await appCtx.ha.publishSensor(
      'last_detection',
      lastDet ? `${lastDet.camera_name}: ${lastDet.scene_summary}` : 'Keine aktive Kamera-Aufnahme',
      {
        friendly_name: 'Thassi Camera Vision Letzte Erkennung',
        icon: 'mdi:cctv',
        online_cameras: onlineCount,
        total_cameras: cameras.length,
        person_count: lastDet?.person_count ?? 0,
        total_objects: lastDet?.total_objects ?? 0,
      }
    );
  }

  // Register cyclic background job
  ctx.scheduleJob({
    id: 'cyclic_camera_sampler',
    name: 'Zyklische Kamera-Abtastung & Objekterkennung',
    intervalSeconds: 300,
    handler: async (jobCtx) => {
      const cfg = getConfig();
      if (!cfg.cyclicEnabled) return;
      const enabledCams = jobCtx.db.query<CameraSourceRow>(
        'SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC'
      );
      for (const cam of enabledCams) {
        await sampleSingleCamera(cam.id, jobCtx);
      }
      await updateSharedSummaryAndHaSensors(jobCtx);
    },
  });

  // API: GET /dashboard
  ctx.route('GET', '/dashboard', async (_req, appCtx) => {
    const cfg = getConfig();
    const cameras = appCtx.db.query<CameraSourceRow>(
      'SELECT * FROM camera_sources ORDER BY enabled DESC, name ASC'
    );
    const haStates = await appCtx.ha.getStates('camera');
    const stateMap = new Map(haStates.map((s) => [s.entity_id, s]));

    // Check LAN ports for cameras with lan_ip
    const enrichedCameras = await Promise.all(
      cameras.map(async (c) => {
        const haState = stateMap.get(c.id);
        const lan6668 = c.lan_ip ? await checkTcpPort(c.lan_ip, 6668, 300) : false;
        const lan554 = c.lan_ip ? await checkTcpPort(c.lan_ip, 554, 300) : false;
        return {
          ...c,
          target_classes_parsed: (() => {
            try {
              return JSON.parse(c.target_classes);
            } catch {
              return cfg.targetClasses;
            }
          })(),
          ha_state: haState?.state || 'missing_in_ha',
          ha_attributes: haState?.attributes || {},
          lan_reachable_6668: lan6668,
          lan_reachable_554: lan554,
        };
      })
    );

    // Check go2rtc status
    let go2rtcStreams: Record<string, unknown> = {};
    let go2rtcOnline = false;
    try {
      const gr = await fetch(`${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/streams`, {
        signal: AbortSignal.timeout(2000),
      });
      if (gr.ok) {
        go2rtcOnline = true;
        go2rtcStreams = (await gr.json()) as Record<string, unknown>;
      }
    } catch {
      // offline
    }

    const detections = appCtx.db.query<VisionDetectionRow>(
      `SELECT id, camera_id, camera_name, sampled_at, status, objects_json, total_objects, person_count, scene_summary, engine_used, processing_ms, snapshot_b64
       FROM vision_detections ORDER BY id DESC LIMIT 25`
    );

    return {
      config: {
        ...cfg,
        geminiApiKeyConfigured: Boolean(cfg.geminiApiKey),
        geminiApiKeyMasked: cfg.geminiApiKey
          ? `${cfg.geminiApiKey.slice(0, 6)}...${cfg.geminiApiKey.slice(-4)}`
          : '',
      },
      go2rtc: {
        online: go2rtcOnline,
        url: cfg.go2rtcUrl,
        streams: go2rtcStreams,
      },
      cameras: enrichedCameras,
      detections: detections.map((d) => ({
        ...d,
        objects: (() => {
          try {
            return JSON.parse(d.objects_json);
          } catch {
            return [];
          }
        })(),
      })),
    };
  });

  // API: POST /sample-now (triggers sampling on one or all enabled cameras)
  ctx.route('POST', '/sample-now', async (req, appCtx) => {
    const body = (req.body || {}) as { camera_id?: string };
    if (body.camera_id) {
      const res = await sampleSingleCamera(body.camera_id, appCtx);
      return { results: [res] };
    }
    const enabled = appCtx.db.query<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC'
    );
    const results = [];
    for (const c of enabled) {
      results.push(await sampleSingleCamera(c.id, appCtx));
    }
    return { results };
  });

  // API: POST /analyze-image (processes an uploaded base64 frame directly through the object detection pipeline)
  ctx.route('POST', '/analyze-image', async (req, appCtx) => {
    const body = (req.body || {}) as {
      camera_id?: string;
      camera_name?: string;
      image_base64?: string;
      mime_type?: string;
    };
    if (!body.image_base64) {
      return { status: 400, body: { error: 'image_base64 ist erforderlich' } };
    }
    const cleanB64 = body.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buf = Buffer.from(cleanB64, 'base64');
    const cfg = getConfig();
    const startMs = Date.now();
    const det = await runObjectDetectionOnBuffer(
      buf,
      body.mime_type || 'image/jpeg',
      cfg.targetClasses,
      cfg
    );
    const elapsed = Date.now() - startMs;
    const nowIso = new Date().toISOString();
    const camId = body.camera_id || 'manual.upload';
    const camName = body.camera_name || 'Manueller Snapshot-Test';

    const info = appCtx.db.execute(
      `INSERT INTO vision_detections
       (camera_id, camera_name, sampled_at, status, objects_json, total_objects, person_count, scene_summary, engine_used, processing_ms, snapshot_b64)
       VALUES (?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?)`,
      [
        camId,
        camName,
        nowIso,
        JSON.stringify(det.objects),
        det.totalObjects,
        det.personCount,
        det.sceneSummary,
        det.engineUsed,
        elapsed,
        buf.byteLength <= 350_000 ? cleanB64 : '',
      ]
    );

    await updateSharedSummaryAndHaSensors(appCtx);

    return {
      detectionId: info.lastInsertRowid,
      ...det,
      processingMs: elapsed,
      sampledAt: nowIso,
    };
  });

  // API: POST /cameras (add or update a camera source)
  ctx.route('POST', '/cameras', async (req, appCtx) => {
    const body = (req.body || {}) as Partial<CameraSourceRow> & { target_classes_array?: string[] };
    if (!body.id || !body.name) {
      return { status: 400, body: { error: 'id und name sind erforderlich' } };
    }
    const classesJson = Array.isArray(body.target_classes_array)
      ? JSON.stringify(body.target_classes_array)
      : body.target_classes || '["person","car","package","animal"]';

    appCtx.db.execute(
      `INSERT INTO camera_sources
       (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, target_classes, last_sampled_at, last_status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '')
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         room = excluded.room,
         source_type = excluded.source_type,
         stream_url = excluded.stream_url,
         lan_ip = excluded.lan_ip,
         enabled = excluded.enabled,
         sample_interval_sec = excluded.sample_interval_sec,
         target_classes = excluded.target_classes`,
      [
        body.id.trim(),
        body.name.trim(),
        (body.room || 'Allgemein').trim(),
        body.source_type || 'ha_entity',
        (body.stream_url || '').trim(),
        (body.lan_ip || '').trim(),
        body.enabled ?? 1,
        Number(body.sample_interval_sec) || 300,
        classesJson,
      ]
    );
    return { saved: true };
  });

  // API: POST /config (update cyclic sampling & vision settings)
  ctx.route('POST', '/config', async (req, appCtx) => {
    const current = getConfig();
    const body = (req.body || {}) as Partial<VisionConfig>;
    const updated: VisionConfig = {
      ...current,
      ...body,
      geminiApiKey:
        body.geminiApiKey !== undefined && body.geminiApiKey !== ''
          ? body.geminiApiKey
          : current.geminiApiKey,
    };
    appCtx.db.kvSet('vision_config', updated);
    cachedWorkingGeminiModel = '';
    return { saved: true, config: updated };
  });
});
