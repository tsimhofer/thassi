import fs from 'node:fs';
import net from 'node:net';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { defineThassiApp, type ThassiAppContext } from '@thassi/sdk';

export type OptimizationMode = 'Personen' | 'Fahrzeuge' | 'Objekte' | 'Kamera' | 'Aktivitäten';

export const OPTIMIZATION_MODES: OptimizationMode[] = [
  'Personen',
  'Fahrzeuge',
  'Objekte',
  'Kamera',
  'Aktivitäten',
];

export interface CameraSourceRow {
  id: string;
  name: string;
  room: string;
  source_type: string;
  stream_url: string;
  lan_ip: string;
  enabled: number;
  sample_interval_sec: number;
  optimization_mode: OptimizationMode;
  target_classes: string;
  last_sampled_at: string;
  last_status: string;
  last_error: string;
}

export interface VisionDetectionRow {
  id: number;
  camera_id: string;
  camera_name: string;
  optimization_mode: string;
  sampled_at: string;
  status: string;
  objects_json: string;
  metrics_json: string;
  total_objects: number;
  person_count: number;
  vehicle_count: number;
  motion_pct: number;
  scene_summary: string;
  engine_used: string;
  processing_ms: number;
  snapshot_b64: string;
}

export interface VisionConfig {
  cyclicEnabled: boolean;
  intervalSeconds: number;
  visionEngine: 'local_coco_ssd' | 'gemini_direct';
  go2rtcUrl: string;
}

const DEFAULT_CAMERAS: Array<
  Omit<CameraSourceRow, 'last_sampled_at' | 'last_status' | 'last_error'>
> = [
  {
    id: 'camera.garten_parkplatz_kamera',
    name: 'Kamera Draußen Hinten Werkstatt',
    room: 'Werkstatt / Außen',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '192.168.188.121',
    enabled: 1,
    sample_interval_sec: 180,
    optimization_mode: 'Fahrzeuge',
    target_classes: JSON.stringify(['car', 'truck', 'bicycle', 'motorcycle', 'person']),
  },
  {
    id: 'camera.cam_eg_vz_eingang',
    name: 'EG Vorzimmer Kamera',
    room: 'Vorzimmer EG / Eingang',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '192.168.188.140',
    enabled: 1,
    sample_interval_sec: 180,
    optimization_mode: 'Personen',
    target_classes: JSON.stringify(['person', 'backpack', 'handbag', 'suitcase']),
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
    optimization_mode: 'Aktivitäten',
    target_classes: JSON.stringify(['person', 'dog', 'cat']),
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
    optimization_mode: 'Objekte',
    target_classes: JSON.stringify(['person', 'laptop', 'chair', 'cell phone', 'cup']),
  },
  {
    id: 'camera.lsc_smart_outdoor_camera',
    name: 'LSC Smart Outdoor Camera',
    room: 'Garten / Außen',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: 'Aktivitäten',
    target_classes: JSON.stringify(['person', 'car', 'dog', 'cat', 'bird']),
  },
  {
    id: 'camera.lsc_smart_indoor_camera',
    name: 'LSC Smart Indoor Camera',
    room: 'Innen / Diagnose',
    source_type: 'ha_entity',
    stream_url: '',
    lan_ip: '',
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: 'Kamera',
    target_classes: JSON.stringify(['person']),
  },
];

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat']);

const GERMAN_LABELS: Record<string, string> = {
  person: 'Person',
  car: 'Auto',
  truck: 'LKW / Transporter',
  bus: 'Bus',
  motorcycle: 'Motorrad',
  bicycle: 'Fahrrad',
  dog: 'Hund',
  cat: 'Katze',
  bird: 'Vogel',
  backpack: 'Rucksack / Paket',
  handbag: 'Tasche',
  suitcase: 'Koffer / Paket',
  umbrella: 'Regenschirm',
  bottle: 'Flasche',
  cup: 'Tasse',
  chair: 'Stuhl',
  couch: 'Sofa',
  potted_plant: 'Pflanze',
  'potted plant': 'Pflanze',
  tv: 'Monitor / TV',
  laptop: 'Laptop',
  mouse: 'Maus',
  keyboard: 'Tastatur',
  'cell phone': 'Smartphone',
  book: 'Buch',
  clock: 'Uhr',
};

let cocoModelPromise: Promise<cocoSsd.ObjectDetection> | null = null;
const previousLumaGrids = new Map<string, Float32Array>();

async function getLocalCocoModel(): Promise<cocoSsd.ObjectDetection> {
  if (!cocoModelPromise) {
    cocoModelPromise = (async () => {
      await tf.ready();
      return await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })();
  }
  return cocoModelPromise;
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

function decodeImageBuffer(
  buf: Buffer,
  mimeType: string
): { width: number; height: number; rgba: Uint8Array } {
  const isPng =
    mimeType.includes('png') ||
    (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);

  if (isPng) {
    const parsed = PNG.sync.read(buf);
    return { width: parsed.width, height: parsed.height, rgba: new Uint8Array(parsed.data) };
  }
  const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
  return { width: decoded.width, height: decoded.height, rgba: decoded.data };
}

interface FrameDiagnostics {
  luminancePct: number;
  contrastScore: number;
  sharpnessScore: number;
  lightingMode: 'Taglicht' | 'Dämmerung / Innen' | 'Nachtsicht / Dunkel';
  occlusionAlert: boolean;
  motionPct: number;
  activeMotionZone: string;
}

function analyzePixelMetricsAndMotion(
  cameraId: string,
  width: number,
  height: number,
  rgba: Uint8Array
): FrameDiagnostics {
  const gridW = 48;
  const gridH = 27;
  const currentGrid = new Float32Array(gridW * gridH);

  let sumLuma = 0;
  let sumLumaSq = 0;

  for (let gy = 0; gy < gridH; gy++) {
    const sy = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / gridH));
    for (let gx = 0; gx < gridW; gx++) {
      const sx = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / gridW));
      const idx = (sy * width + sx) * 4;
      const luma = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
      currentGrid[gy * gridW + gx] = luma;
      sumLuma += luma;
      sumLumaSq += luma * luma;
    }
  }

  const n = gridW * gridH;
  const meanLuma = sumLuma / n;
  const variance = Math.max(0, sumLumaSq / n - meanLuma * meanLuma);
  const stdDev = Math.sqrt(variance);

  // Estimate sharpness via gradient magnitude on the luma grid
  let edgeSum = 0;
  let edgeCount = 0;
  for (let gy = 1; gy < gridH - 1; gy++) {
    for (let gx = 1; gx < gridW - 1; gx++) {
      const c = currentGrid[gy * gridW + gx];
      const dx = Math.abs(c - currentGrid[gy * gridW + (gx + 1)]);
      const dy = Math.abs(c - currentGrid[(gy + 1) * gridW + gx]);
      edgeSum += dx + dy;
      edgeCount++;
    }
  }
  const sharpnessScore = Math.min(100, Math.round((edgeSum / Math.max(1, edgeCount)) * 2.6));
  const luminancePct = Math.round((meanLuma / 255) * 100);
  const contrastScore = Math.min(100, Math.round((stdDev / 75) * 100));
  const occlusionAlert = contrastScore < 8 || sharpnessScore < 6;

  const lightingMode =
    luminancePct < 18
      ? 'Nachtsicht / Dunkel'
      : luminancePct < 45
        ? 'Dämmerung / Innen'
        : 'Taglicht';

  // Compute frame-to-frame motion against previous grid for this camera
  const prevGrid = previousLumaGrids.get(cameraId);
  let motionPct = 0;
  let activeMotionZone = 'Keine Bewegung';

  if (prevGrid && prevGrid.length === currentGrid.length) {
    let changedCells = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const diff = Math.abs(currentGrid[gy * gridW + gx] - prevGrid[gy * gridW + gx]);
        if (diff > 18) {
          changedCells++;
          weightedX += gx / gridW;
          weightedY += gy / gridH;
        }
      }
    }
    motionPct = Math.round((changedCells / n) * 1000) / 10;
    if (changedCells > 0) {
      const avgX = weightedX / changedCells;
      const avgY = weightedY / changedCells;
      const hZone = avgX < 0.35 ? 'Links' : avgX > 0.65 ? 'Rechts' : 'Mitte';
      const vZone = avgY < 0.35 ? 'Oben' : avgY > 0.65 ? 'Unten' : 'Zentrum';
      activeMotionZone = `${vZone}-${hZone}`;
    }
  }
  previousLumaGrids.set(cameraId, currentGrid);

  return {
    luminancePct,
    contrastScore,
    sharpnessScore,
    lightingMode,
    occlusionAlert,
    motionPct,
    activeMotionZone,
  };
}

async function runLocalCocoSsdPipeline(
  cameraId: string,
  imageBuffer: Buffer,
  mimeType: string,
  mode: OptimizationMode
) {
  const { width, height, rgba } = decodeImageBuffer(imageBuffer, mimeType);
  const metrics = analyzePixelMetricsAndMotion(cameraId, width, height, rgba);

  // Downsample to max 480px width for fast CPU tensor inference
  const targetW = Math.min(480, width);
  const targetH = Math.max(1, Math.round((height / width) * targetW));
  const rgb = new Int32Array(targetW * targetH * 3);

  for (let y = 0; y < targetH; y++) {
    const srcY = Math.min(height - 1, Math.floor((y * height) / targetH));
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / targetW));
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * targetW + x) * 3;
      rgb[dstIdx] = rgba[srcIdx];
      rgb[dstIdx + 1] = rgba[srcIdx + 1];
      rgb[dstIdx + 2] = rgba[srcIdx + 2];
    }
  }

  const model = await getLocalCocoModel();
  const minScore = mode === 'Personen' || mode === 'Fahrzeuge' ? 0.24 : 0.28;
  const tensor = tf.tensor3d(rgb, [targetH, targetW, 3], 'int32');
  let rawPreds: cocoSsd.DetectedObject[] = [];
  try {
    rawPreds = await model.detect(tensor, 25, minScore);
  } finally {
    tensor.dispose();
  }

  // Filter / prioritize based on camera's selected OptimizationMode
  const filteredPreds = rawPreds.filter((p) => {
    if (mode === 'Personen') return p.class === 'person';
    if (mode === 'Fahrzeuge') return VEHICLE_CLASSES.has(p.class) || p.class === 'person';
    return true;
  });

  // Group objects by class + position
  const grouped = new Map<
    string,
    { label: string; rawClass: string; confidence: number; count: number; positions: string[] }
  >();

  for (const p of filteredPreds) {
    const [bx, by, bw, bh] = p.bbox;
    const centerX = (bx + bw / 2) / targetW;
    const posH = centerX < 0.35 ? 'links' : centerX > 0.65 ? 'rechts' : 'mitte';
    const areaPct = Math.round(((bw * bh) / (targetW * targetH)) * 100);
    const deLabel = GERMAN_LABELS[p.class] || p.class;

    const existing = grouped.get(p.class);
    if (existing) {
      existing.count += 1;
      existing.confidence = Math.max(existing.confidence, p.score);
      existing.positions.push(`${posH} (${areaPct}%)`);
    } else {
      grouped.set(p.class, {
        label: deLabel,
        rawClass: p.class,
        confidence: Math.round(p.score * 100) / 100,
        count: 1,
        positions: [`${posH} (${areaPct}%)`],
      });
    }
  }

  const objects = Array.from(grouped.values()).map((g) => ({
    label: g.label,
    rawClass: g.rawClass,
    confidence: g.confidence,
    count: g.count,
    details: g.positions.join(', '),
  }));

  const personCount = rawPreds.filter((p) => p.class === 'person').length;
  const vehicleCount = rawPreds.filter((p) => VEHICLE_CLASSES.has(p.class)).length;
  const totalObjects = objects.reduce((acc, o) => acc + o.count, 0);

  // Build tailored German summary according to OptimizationMode
  let sceneSummary = '';
  if (mode === 'Personen') {
    sceneSummary =
      personCount > 0
        ? `👤 ${personCount} ${personCount === 1 ? 'Person' : 'Personen'} im Sichtfeld erkannt (${objects[0]?.details || 'Mitte'})`
        : `Keine Personen im Sichtfeld (${metrics.lightingMode}, Helligkeit ${metrics.luminancePct}%)`;
  } else if (mode === 'Fahrzeuge') {
    sceneSummary =
      vehicleCount > 0
        ? `🚗 ${vehicleCount} ${vehicleCount === 1 ? 'Fahrzeug' : 'Fahrzeuge'} erkannt (${objects.map((o) => `${o.count}× ${o.label}`).join(', ')})`
        : personCount > 0
          ? `Keine Fahrzeuge, aber ${personCount} Person(en) erkannt`
          : `Freie Fläche – keine Fahrzeuge erkannt (${metrics.lightingMode})`;
  } else if (mode === 'Kamera') {
    sceneSummary = metrics.occlusionAlert
      ? `⚠️ Kamera-Warnung: Niedriger Kontrast/Schärfe (${metrics.sharpnessScore}% Schärfe, ${metrics.luminancePct}% Helligkeit)`
      : `🎥 Optik OK · Schärfe ${metrics.sharpnessScore}% · Kontrast ${metrics.contrastScore}% · ${metrics.lightingMode} (${metrics.luminancePct}%)`;
  } else if (mode === 'Aktivitäten') {
    if (metrics.motionPct >= 1.5 || personCount > 0) {
      sceneSummary = `🏃 Aktivität (${metrics.motionPct}% Änderung, Zone: ${metrics.activeMotionZone})${totalObjects > 0 ? ` · ${objects.map((o) => `${o.count}× ${o.label}`).join(', ')}` : ''}`;
    } else {
      sceneSummary = `Ruhige Szene (${metrics.motionPct}% Bewegung)${totalObjects > 0 ? ` · ${objects.map((o) => `${o.count}× ${o.label}`).join(', ')}` : ''}`;
    }
  } else {
    // 'Objekte'
    sceneSummary =
      totalObjects > 0
        ? `📦 ${totalObjects} ${totalObjects === 1 ? 'Objekt' : 'Objekte'}: ${objects.map((o) => `${o.count}× ${o.label} (${Math.round(o.confidence * 100)}%)`).join(', ')}`
        : `Keine Zielobjekte erkannt (${metrics.lightingMode}, Schärfe ${metrics.sharpnessScore}%)`;
  }

  return {
    objects,
    metrics,
    totalObjects,
    personCount,
    vehicleCount,
    motionPct: metrics.motionPct,
    sceneSummary,
    engineUsed: `Local COCO-SSD (${mode})`,
  };
}

async function requestHaHlsStreamUrl(
  haUrl: string,
  haToken: string,
  entityId: string
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const wsUrl = haUrl.replace(/^http/, 'ws') + '/api/websocket';
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        resolve(null);
      }, 6000);

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'auth_required') {
            ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
          } else if (msg.type === 'auth_ok') {
            ws.send(JSON.stringify({ id: 1, type: 'camera/stream', entity_id: entityId }));
          } else if (msg.id === 1) {
            clearTimeout(timer);
            ws.close();
            if (msg.success && msg.result?.url) {
              resolve(`${haUrl}${msg.result.url}`);
            } else {
              resolve(null);
            }
          }
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
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
      optimization_mode TEXT NOT NULL DEFAULT 'Personen',
      target_classes TEXT NOT NULL DEFAULT '["person","car","package","animal"]',
      last_sampled_at TEXT NOT NULL DEFAULT '',
      last_status TEXT NOT NULL DEFAULT 'unprobed',
      last_error TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vision_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      camera_name TEXT NOT NULL,
      optimization_mode TEXT NOT NULL DEFAULT 'Objekte',
      sampled_at TEXT NOT NULL,
      status TEXT NOT NULL,
      objects_json TEXT NOT NULL DEFAULT '[]',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      total_objects INTEGER NOT NULL DEFAULT 0,
      person_count INTEGER NOT NULL DEFAULT 0,
      vehicle_count INTEGER NOT NULL DEFAULT 0,
      motion_pct REAL NOT NULL DEFAULT 0,
      scene_summary TEXT NOT NULL DEFAULT '',
      engine_used TEXT NOT NULL DEFAULT '',
      processing_ms INTEGER NOT NULL DEFAULT 0,
      snapshot_b64 TEXT NOT NULL DEFAULT ''
    );
  `);

  // Safe schema migrations for existing tables
  const camCols = ctx.db
    .query<{ name: string }>('PRAGMA table_info(camera_sources)')
    .map((c) => c.name);
  if (!camCols.includes('optimization_mode')) {
    ctx.db.exec(
      `ALTER TABLE camera_sources ADD COLUMN optimization_mode TEXT NOT NULL DEFAULT 'Personen';`
    );
  }

  const detCols = ctx.db
    .query<{ name: string }>('PRAGMA table_info(vision_detections)')
    .map((c) => c.name);
  if (!detCols.includes('optimization_mode')) {
    ctx.db.exec(
      `ALTER TABLE vision_detections ADD COLUMN optimization_mode TEXT NOT NULL DEFAULT 'Objekte';`
    );
  }
  if (!detCols.includes('metrics_json')) {
    ctx.db.exec(`ALTER TABLE vision_detections ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}';`);
  }
  if (!detCols.includes('vehicle_count')) {
    ctx.db.exec(
      `ALTER TABLE vision_detections ADD COLUMN vehicle_count INTEGER NOT NULL DEFAULT 0;`
    );
  }
  if (!detCols.includes('motion_pct')) {
    ctx.db.exec(`ALTER TABLE vision_detections ADD COLUMN motion_pct REAL NOT NULL DEFAULT 0;`);
  }

  function seedCameras() {
    const count =
      ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM camera_sources')?.cnt ?? 0;
    if (count === 0) {
      for (const c of DEFAULT_CAMERAS) {
        ctx.db.execute(
          `INSERT INTO camera_sources
           (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '')`,
          [
            c.id,
            c.name,
            c.room,
            c.source_type,
            c.stream_url,
            c.lan_ip,
            c.enabled,
            c.sample_interval_sec,
            c.optimization_mode,
            c.target_classes,
          ]
        );
      }
    }
  }
  seedCameras();

  // Warm up local COCO-SSD model asynchronously on boot
  void getLocalCocoModel().catch((err) =>
    console.error('[CameraVision] Failed warming COCO-SSD model:', err)
  );

  function getConfig(): VisionConfig {
    const saved = ctx.db.kvGet<Partial<VisionConfig>>('vision_config') || {};
    return {
      cyclicEnabled: saved.cyclicEnabled ?? true,
      intervalSeconds: saved.intervalSeconds ?? 180,
      visionEngine: 'local_coco_ssd',
      go2rtcUrl: saved.go2rtcUrl || 'http://192.168.188.92:1984',
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

    // 1. Custom stream_url (direct HTTP image or via go2rtc ffmpeg frame extractor)
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
        const go2Url = `${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/frame.jpeg?src=${encodeURIComponent(url)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(7500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: 'go2rtc_frame' };
          }
        }
      } catch {
        // Fallback to HA methods
      }
    }

    // 2. Home Assistant /api/camera_proxy/<entity_id>
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
        // Continue to HLS stream frame grabber
      }

      // 3. Tuya / Stream-only HA cameras: request HLS URL via HA WebSocket camera/stream and grab frame via go2rtc
      const hlsUrl = await requestHaHlsStreamUrl(haUrl, haToken, cam.id);
      if (hlsUrl) {
        try {
          const go2Url = `${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/frame.jpeg?src=${encodeURIComponent(hlsUrl)}`;
          const gr = await fetch(go2Url, { signal: AbortSignal.timeout(8500) });
          if (gr.ok) {
            const buf = Buffer.from(await gr.arrayBuffer());
            if (buf.byteLength > 200) {
              return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: 'ha_hls_go2rtc' };
            }
          }
        } catch {
          // Continue
        }
      }
    }

    const lan6668 = cam.lan_ip ? await checkTcpPort(cam.lan_ip, 6668, 400) : false;
    const states = await ctx.ha.getStates('camera');
    const st = states.find((s) => s.entity_id === cam.id);

    if (!st || st.state === 'unavailable' || st.state === 'unknown') {
      return {
        ok: false,
        error: lan6668
          ? `Kamera im WLAN aktiv (${cam.lan_ip}:6668) – wartet auf Tuya QR-Code Re-Authentifizierung in Home Assistant`
          : `Kamera in Home Assistant '${st?.state || 'nicht geladen'}' (Tuya QR-Code Re-Auth ausstehend oder Kamera ausgeschaltet)`,
      };
    }

    return {
      ok: false,
      error: `Kein Einzelbild von ${cam.id} abrufbar (Tuya Stream aktuell nicht erreichbar)`,
    };
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
    const mode: OptimizationMode = OPTIMIZATION_MODES.includes(
      cam.optimization_mode as OptimizationMode
    )
      ? (cam.optimization_mode as OptimizationMode)
      : 'Objekte';

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
      const det = await runLocalCocoSsdPipeline(
        cam.id,
        snap.buffer,
        snap.mimeType || 'image/jpeg',
        mode
      );
      const elapsed = Date.now() - startMs;
      const thumbB64 =
        snap.buffer.byteLength <= 350_000 ? snap.buffer.toString('base64') : '';

      const info = appCtx.db.execute(
        `INSERT INTO vision_detections
         (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
         VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cam.id,
          cam.name,
          mode,
          nowIso,
          JSON.stringify(det.objects),
          JSON.stringify(det.metrics),
          det.totalObjects,
          det.personCount,
          det.vehicleCount,
          det.motionPct,
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
      `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms
       FROM vision_detections ORDER BY id DESC LIMIT 15`
    );
    const onlineCount = cameras.filter((c) => c.last_status === 'online').length;
    const lastDet = latestDetections[0] || null;

    const cameraModes: Record<string, OptimizationMode> = {};
    for (const c of cameras) {
      cameraModes[c.id] = (c.optimization_mode as OptimizationMode) || 'Personen';
    }

    const summary = {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((c) => c.enabled === 1).length,
      onlineCameras: onlineCount,
      cameraModes,
      lastDetectionAt: lastDet?.sampled_at || null,
      lastCameraName: lastDet?.camera_name || null,
      lastOptimizationMode: lastDet?.optimization_mode || null,
      lastSceneSummary: lastDet?.scene_summary || null,
      lastTotalObjects: lastDet?.total_objects ?? 0,
      lastPersonCount: lastDet?.person_count ?? 0,
      lastVehicleCount: lastDet?.vehicle_count ?? 0,
      updatedAt: new Date().toISOString(),
    };

    appCtx.sharedDb.kvSet('camera_vision_today', summary);

    await appCtx.ha.publishSensor(
      'last_detection',
      lastDet ? `${lastDet.camera_name}: ${lastDet.scene_summary}` : 'Bereit (Lokales COCO-SSD)',
      {
        friendly_name: 'Thassi Camera Vision Letzte Erkennung',
        icon: 'mdi:cctv',
        engine: 'Local COCO-SSD (lite_mobilenet_v2)',
        online_cameras: onlineCount,
        total_cameras: cameras.length,
        person_count: lastDet?.person_count ?? 0,
        vehicle_count: lastDet?.vehicle_count ?? 0,
        total_objects: lastDet?.total_objects ?? 0,
        camera_modes: cameraModes,
      }
    );
  }

  // Ensure initial summary is written to sharedDb on startup
  void updateSharedSummaryAndHaSensors(ctx);

  // Register cyclic background job
  ctx.scheduleJob({
    id: 'cyclic_camera_sampler',
    name: 'Zyklische Kamera-Abtastung (Lokales COCO-SSD)',
    intervalSeconds: 180,
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

    const enrichedCameras = await Promise.all(
      cameras.map(async (c) => {
        const haState = stateMap.get(c.id);
        const lan6668 = c.lan_ip ? await checkTcpPort(c.lan_ip, 6668, 300) : false;
        const lan554 = c.lan_ip ? await checkTcpPort(c.lan_ip, 554, 300) : false;
        return {
          ...c,
          optimization_mode: (c.optimization_mode || 'Personen') as OptimizationMode,
          ha_state: haState?.state || 'missing_in_ha',
          ha_attributes: haState?.attributes || {},
          lan_reachable_6668: lan6668,
          lan_reachable_554: lan554,
        };
      })
    );

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
      `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64
       FROM vision_detections ORDER BY id DESC LIMIT 25`
    );

    return {
      config: cfg,
      optimizationModes: OPTIMIZATION_MODES,
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
        metrics: (() => {
          try {
            return JSON.parse(d.metrics_json || '{}');
          } catch {
            return {};
          }
        })(),
      })),
    };
  });

  // API: POST /camera-mode (quickly set optimization_mode per camera from HA UI or Flyout)
  ctx.route('POST', '/camera-mode', async (req, appCtx) => {
    const body = (req.body || {}) as { camera_id?: string; optimization_mode?: OptimizationMode };
    if (!body.camera_id || !body.optimization_mode) {
      return { status: 400, body: { error: 'camera_id und optimization_mode sind erforderlich' } };
    }
    if (!OPTIMIZATION_MODES.includes(body.optimization_mode)) {
      return { status: 400, body: { error: `Ungültiger Modus: ${body.optimization_mode}` } };
    }
    appCtx.db.execute(`UPDATE camera_sources SET optimization_mode = ? WHERE id = ?`, [
      body.optimization_mode,
      body.camera_id,
    ]);
    await updateSharedSummaryAndHaSensors(appCtx);
    return { ok: true, camera_id: body.camera_id, optimization_mode: body.optimization_mode };
  });

  // API: POST /sample-now
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

  // API: POST /analyze-image (processes an uploaded base64 frame directly through the local COCO-SSD pipeline)
  ctx.route('POST', '/analyze-image', async (req, appCtx) => {
    const body = (req.body || {}) as {
      camera_id?: string;
      camera_name?: string;
      optimization_mode?: OptimizationMode;
      image_base64?: string;
      mime_type?: string;
    };
    if (!body.image_base64) {
      return { status: 400, body: { error: 'image_base64 ist erforderlich' } };
    }
    const cleanB64 = body.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buf = Buffer.from(cleanB64, 'base64');
    const mode: OptimizationMode =
      body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode)
        ? body.optimization_mode
        : 'Objekte';

    const startMs = Date.now();
    const camId = body.camera_id || 'manual.upload';
    const camName = body.camera_name || 'Manueller Snapshot-Test';

    const det = await runLocalCocoSsdPipeline(
      camId,
      buf,
      body.mime_type || 'image/jpeg',
      mode
    );
    const elapsed = Date.now() - startMs;
    const nowIso = new Date().toISOString();

    const info = appCtx.db.execute(
      `INSERT INTO vision_detections
       (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
       VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        camId,
        camName,
        mode,
        nowIso,
        JSON.stringify(det.objects),
        JSON.stringify(det.metrics),
        det.totalObjects,
        det.personCount,
        det.vehicleCount,
        det.motionPct,
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
      optimizationMode: mode,
      processingMs: elapsed,
      sampledAt: nowIso,
    };
  });

  // API: POST /cameras
  ctx.route('POST', '/cameras', async (req, appCtx) => {
    const body = (req.body || {}) as Partial<CameraSourceRow>;
    if (!body.id || !body.name) {
      return { status: 400, body: { error: 'id und name sind erforderlich' } };
    }
    const mode: OptimizationMode =
      body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode)
        ? body.optimization_mode
        : 'Personen';

    appCtx.db.execute(
      `INSERT INTO camera_sources
       (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '')
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         room = excluded.room,
         source_type = excluded.source_type,
         stream_url = excluded.stream_url,
         lan_ip = excluded.lan_ip,
         enabled = excluded.enabled,
         sample_interval_sec = excluded.sample_interval_sec,
         optimization_mode = excluded.optimization_mode`,
      [
        body.id.trim(),
        body.name.trim(),
        (body.room || 'Allgemein').trim(),
        body.source_type || 'ha_entity',
        (body.stream_url || '').trim(),
        (body.lan_ip || '').trim(),
        body.enabled ?? 1,
        Number(body.sample_interval_sec) || 180,
        mode,
        body.target_classes || '["person","car"]',
      ]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return { saved: true };
  });

  // API: POST /config
  ctx.route('POST', '/config', async (req, appCtx) => {
    const current = getConfig();
    const body = (req.body || {}) as Partial<VisionConfig>;
    const updated: VisionConfig = {
      ...current,
      ...body,
    };
    appCtx.db.kvSet('vision_config', updated);
    return { saved: true, config: updated };
  });
});
