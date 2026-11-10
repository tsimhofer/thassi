import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { createAppClient } from '@thassi/sdk/client';
import {
  CameraAnalysisConfigSection,
  TriggerConfiguratorView,
  PerformanceMonitorView,
  PerformanceSnapshot,
  VisionTriggerItem,
  VisionTriggerLogItem,
  AxonOptionItem,
} from './VisionExtensions';

const client = createAppClient('camera-vision');

type OptimizationMode = 'Personen' | 'Fahrzeuge' | 'Objekte' | 'Kamera' | 'Aktivitäten';

const MODES: OptimizationMode[] = ['Personen', 'Fahrzeuge', 'Objekte', 'Kamera', 'Aktivitäten'];

const MODE_META: Record<OptimizationMode, { code: string; desc: string }> = {
  Personen: { code: 'PER', desc: 'Personenerkennung & Positions-Tracking' },
  Fahrzeuge: { code: 'VEH', desc: 'Autos, LKW, Transporter, Motorräder & Fahrräder' },
  Objekte: { code: 'OBJ', desc: 'Alle 80 COCO-Objektklassen, Pakete, Möbel & Tiere' },
  Kamera: { code: 'OPT', desc: 'Bildschärfe, Kontrast, Tag/Nacht & Sabotage-Check' },
  Aktivitäten: { code: 'MOT', desc: 'Pixel-Bewegungs-Delta + Zonen- & Objekt-Tracking' },
};

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat']);
const ANIMAL_CLASSES = new Set(['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'bear', 'zebra', 'giraffe']);

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
  dining_table: 'Tisch',
  'dining table': 'Tisch',
  bed: 'Bett',
  refrigerator: 'Kühlschrank',
  oven: 'Ofen',
  sink: 'Waschbecken',
  vase: 'Vase',
  scissors: 'Schere',
  teddy_bear: 'Teddybär',
  bowl: 'Schale',
};

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  rawClass: string;
  confidence: number;
  category: 'person' | 'vehicle' | 'animal' | 'object' | 'motion';
  source?: 'webgl' | 'server' | 'motion';
}

interface DetectedObject {
  label: string;
  rawClass?: string;
  confidence: number;
  count: number;
  details?: string;
  bboxes?: NormalizedBoundingBox[];
}

interface FrameMetrics {
  luminancePct?: number;
  contrastScore?: number;
  sharpnessScore?: number;
  lightingMode?: string;
  occlusionAlert?: boolean;
  motionPct?: number;
  activeMotionZone?: string;
  motionBoxes?: NormalizedBoundingBox[];
}

interface CameraItem {
  id: string;
  name: string;
  room: string;
  source_type: string;
  stream_url: string;
  lan_ip: string;
  enabled: number;
  sample_interval_sec: number;
  optimization_mode: OptimizationMode;
  min_confidence?: number;
  motion_gate_enabled?: number;
  motion_threshold_pct?: number;
  pixel_diff_threshold?: number;
  ai_input_width?: number;
  log_cooldown_sec?: number;
  high_freq_poll_sec?: number;
  last_sampled_at: string;
  last_status: string;
  last_error: string;
  ha_state: string;
  lan_reachable_6668: boolean;
  lan_reachable_554: boolean;
  latest_snapshot_b64?: string;
  latest_scene_summary?: string;
  latest_sampled_at?: string;
  latest_objects?: DetectedObject[];
  latest_metrics?: FrameMetrics;
  latest_bboxes?: NormalizedBoundingBox[];
}

interface DetectionRecord {
  id: number;
  camera_id: string;
  camera_name: string;
  optimization_mode: OptimizationMode;
  sampled_at: string;
  status: string;
  objects: DetectedObject[];
  metrics?: FrameMetrics;
  total_objects: number;
  person_count: number;
  vehicle_count: number;
  motion_pct: number;
  scene_summary: string;
  engine_used: string;
  processing_ms: number;
  snapshot_b64: string;
}

interface DashboardPayload {
  config: {
    cyclicEnabled: boolean;
    highFreqEnabled?: boolean;
    intervalSeconds: number;
    visionEngine: string;
    go2rtcUrl: string;
  };
  optimizationModes: OptimizationMode[];
  go2rtc: {
    online: boolean;
    url: string;
    streams: Record<string, unknown>;
  };
  cameras: CameraItem[];
  detections: DetectionRecord[];
  performance?: PerformanceSnapshot;
  triggers?: VisionTriggerItem[];
  triggerLogs?: VisionTriggerLogItem[];
}

interface LiveFrameResponse {
  ok: boolean;
  cameraId: string;
  cameraName?: string;
  room?: string;
  optimizationMode?: OptimizationMode;
  capturedAt?: string;
  captureMs?: number;
  frameSeq?: number;
  method?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  frameB64?: string;
  fallbackFrameB64?: string;
  error?: string;
  metrics?: FrameMetrics;
  serverDetections?: {
    bboxes: NormalizedBoundingBox[];
    objects: DetectedObject[];
    sceneSummary: string;
    processingMs: number;
    updatedAt: string;
  } | null;
}

interface CameraLiveState {
  frameB64: string;
  width: number;
  height: number;
  capturedAt: string;
  captureMs: number;
  fps: number;
  metrics: FrameMetrics;
  bboxes: NormalizedBoundingBox[];
  motionBoxes: NormalizedBoundingBox[];
  aiInferenceMs: number;
  aiEngineLabel: string;
  error?: string;
}

// Singleton browser WebGL COCO-SSD model loader (upgraded to full mobilenet_v2)
let browserCocoPromise: Promise<cocoSsd.ObjectDetection> | null = null;
function loadBrowserCocoSsd(): Promise<cocoSsd.ObjectDetection> {
  if (!browserCocoPromise) {
    browserCocoPromise = (async () => {
      await tf.ready();
      try {
        return await cocoSsd.load({ base: 'mobilenet_v2' });
      } catch {
        return await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      }
    })();
  }
  return browserCocoPromise;
}

const CLUTTER_BACKGROUND_CLASSES = new Set([
  'potted plant',
  'potted_plant',
  'chair',
  'couch',
  'bed',
  'dining table',
  'dining_table',
  'toilet',
  'sink',
  'refrigerator',
  'oven',
  'vase',
  'clock',
  'book',
  'toothbrush',
  'hair drier',
  'bowl',
  'tv',
]);

function computeBoxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const xA = Math.max(a.x, b.x);
  const yA = Math.max(a.y, b.y);
  const xB = Math.min(a.x + a.w, b.x + b.w);
  const yB = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const unionArea = a.w * a.h + b.w * b.h - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

function getBoxStrokeColor(category: NormalizedBoundingBox['category']): string {
  switch (category) {
    case 'person':
      return '#10b981'; // Emerald
    case 'vehicle':
      return '#f59e0b'; // Amber
    case 'animal':
      return '#38bdf8'; // Sky
    case 'motion':
      return '#a1a1aa'; // Zinc
    default:
      return '#fafafa'; // Crisp White
  }
}

function formatTimeShort(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Renders precision SVG bounding boxes + corner brackets over any camera feed (Grid or Fullscreen)
 */
function BoundingBoxSvgOverlay({
  bboxes,
  motionBoxes,
  showObjectBoxes = true,
  showMotionBoxes = true,
  showCrosshair = false,
  compact = false,
}: {
  bboxes: NormalizedBoundingBox[];
  motionBoxes: NormalizedBoundingBox[];
  showObjectBoxes?: boolean;
  showMotionBoxes?: boolean;
  showCrosshair?: boolean;
  compact?: boolean;
}) {
  const activeBoxes: NormalizedBoundingBox[] = [
    ...(showMotionBoxes ? motionBoxes : []),
    ...(showObjectBoxes ? bboxes : []),
  ];

  return (
    <svg
      viewBox="0 0 1000 562.5"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {/* Optional technical zone grid & center reticle in Fullscreen */}
      {showCrosshair && (
        <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
          <line x1="333.3" y1="0" x2="333.3" y2="562.5" strokeDasharray="4 6" />
          <line x1="666.6" y1="0" x2="666.6" y2="562.5" strokeDasharray="4 6" />
          <line x1="0" y1="187.5" x2="1000" y2="187.5" strokeDasharray="4 6" />
          <line x1="0" y1="375" x2="1000" y2="375" strokeDasharray="4 6" />
          <line x1="490" y1="281.25" x2="510" y2="281.25" stroke="rgba(255,255,255,0.22)" />
          <line x1="500" y1="271.25" x2="500" y2="291.25" stroke="rgba(255,255,255,0.22)" />
        </g>
      )}

      {activeBoxes.map((b, idx) => {
        const x = Math.max(4, Math.min(990, b.x * 1000));
        const y = Math.max(4, Math.min(555, b.y * 562.5));
        const w = Math.max(24, Math.min(1000 - x, b.w * 1000));
        const h = Math.max(24, Math.min(562.5 - y, b.h * 562.5));
        const color = getBoxStrokeColor(b.category);
        const isMotion = b.category === 'motion';
        const cornerLen = Math.min(18, w * 0.22, h * 0.22);
        const confPct = Math.round((b.confidence || 0) * 100);
        const areaPct = Math.round(b.w * b.h * 100);
        const labelText = isMotion
          ? `BEWEGUNG · Δ`
          : `${b.label.toUpperCase()} · ${confPct}%${!compact && areaPct > 0 ? ` (${areaPct}%)` : ''}`;
        const labelWidth = Math.min(340, Math.max(88, labelText.length * (compact ? 6.8 : 7.4) + 16));
        const labelY = y >= 24 ? y - 22 : y + 2;

        return (
          <g key={`${b.rawClass}-${idx}`}>
            {/* Main translucent bounding box */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isMotion ? 'rgba(255,255,255,0.02)' : `${color}12`}
              stroke={color}
              strokeWidth={isMotion ? '1.2' : compact ? '1.8' : '1.6'}
              strokeDasharray={isMotion ? '5 4' : undefined}
              strokeOpacity={isMotion ? 0.55 : 0.85}
            />

            {/* Precision corner brackets for solid AI object detections */}
            {!isMotion && (
              <g stroke={color} strokeWidth={compact ? '2.8' : '3'} fill="none">
                <path d={`M ${x} ${y + cornerLen} L ${x} ${y} L ${x + cornerLen} ${y}`} />
                <path d={`M ${x + w - cornerLen} ${y} L ${x + w} ${y} L ${x + w} ${y + cornerLen}`} />
                <path d={`M ${x} ${y + h - cornerLen} L ${x} ${y + h} L ${x + cornerLen} ${y + h}`} />
                <path
                  d={`M ${x + w - cornerLen} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + h - cornerLen}`}
                />
              </g>
            )}

            {/* Center target point */}
            {!isMotion && !compact && (
              <circle cx={x + w / 2} cy={y + h / 2} r="2.5" fill={color} opacity="0.8" />
            )}

            {/* Label Tag */}
            <rect
              x={x}
              y={labelY}
              width={labelWidth}
              height={compact ? 18 : 20}
              rx="2"
              fill={isMotion ? 'rgba(9, 9, 11, 0.85)' : color}
              stroke={isMotion ? 'rgba(255,255,255,0.25)' : 'none'}
              strokeWidth="1"
            />
            <text
              x={x + 6}
              y={labelY + (compact ? 12.5 : 14)}
              fill={isMotion ? '#e4e4e7' : '#09090b'}
              fontSize={compact ? '10.5' : '11'}
              fontWeight="700"
              fontFamily="'JetBrains Mono', 'Fira Code', Consolas, monospace"
              letterSpacing="0.03em"
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CameraVisionApp() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'grid' | 'triggers' | 'perf' | 'log' | 'setup'>('grid');
  const [roomFilter, setRoomFilter] = useState<'ALL' | 'ONLINE' | 'OUTDOOR' | 'INDOOR'>('ALL');
  const [gridCols, setGridCols] = useState<2 | 3 | 1>(2);
  const [gridLiveEnabled, setGridLiveEnabled] = useState(true);

  // Triggers & Performance telemetry state
  const [triggers, setTriggers] = useState<VisionTriggerItem[]>([]);
  const [triggerLogs, setTriggerLogs] = useState<VisionTriggerLogItem[]>([]);
  const [availableAxons, setAvailableAxons] = useState<AxonOptionItem[]>([]);
  const [perfSnapshot, setPerfSnapshot] = useState<PerformanceSnapshot | null>(null);

  // Fullscreen state (clicking any feed opens Fullscreen with live Object Detection)
  const [fullscreenCamId, setFullscreenCamId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('camera') || null;
  });
  const [fsPlaying, setFsPlaying] = useState(true);
  const [fsShowObjectBoxes, setFsShowObjectBoxes] = useState(true);
  const [fsShowMotionBoxes, setFsShowMotionBoxes] = useState(true);
  const [fsShowCrosshair, setFsShowCrosshair] = useState(true);
  const [fsShowSidebar, setFsShowSidebar] = useState(true);
  const [fsMinConfidence, setFsMinConfidence] = useState(0.45);
  const [fsFilterMode, setFsFilterMode] = useState<'ALL' | 'CAMERA_PROFILE'>('ALL');

  // Live frames & detections per camera
  const [liveStates, setLiveStates] = useState<Record<string, CameraLiveState>>({});
  const [webglStatus, setWebglStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  // Administration / Settings state
  const [samplingId, setSamplingId] = useState<string | null>(null);
  const [editingCam, setEditingCam] = useState<CameraItem | null>(null);
  const [intervalInput, setIntervalInput] = useState(180);
  const [testMode, setTestMode] = useState<OptimizationMode>('Objekte');
  const [statusMsg, setStatusMsg] = useState('');
  const [tuyaAuth, setTuyaAuth] = useState<{
    storedUserCode: string;
    storedEntryTitle: string;
    activeFlowId: string | null;
    qrData: string;
  } | null>(null);
  const [onvifIp, setOnvifIp] = useState('192.168.188.140');
  const [onvifPass, setOnvifPass] = useState('');

  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const cocoModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const lastFrameTimestampsRef = useRef<Record<string, number[]>>({});
  const lastAnalyzedKeyRef = useRef<Record<string, string>>({});
  const lastClientSyncMsRef = useRef<Record<string, number>>({});

  // Defer Browser WebGL MobileNetV2 loading by 700ms after first paint so the page opens instantaneously
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      loadBrowserCocoSsd()
        .then((model) => {
          if (!cancelled) {
            cocoModelRef.current = model;
            setWebglStatus('ready');
          }
        })
        .catch((err) => {
          console.warn('[CameraVision] Browser WebGL COCO-SSD fallback to server:', err);
          if (!cancelled) {
            setWebglStatus('fallback');
          }
        });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const refreshDashboard = useCallback(async (includeLogSnapshots = false) => {
    try {
      const res = await client.get<DashboardPayload>(
        includeLogSnapshots ? '/dashboard?include_snapshots=1' : '/dashboard'
      );
      setData((prev) => {
        if (!includeLogSnapshots && prev?.detections?.some((d) => d.snapshot_b64)) {
          // Preserve already-loaded log snapshots if refreshing without snapshots
          const snapMap = new Map(prev.detections.map((d) => [d.id, d.snapshot_b64]));
          return {
            ...res,
            detections: (res.detections || []).map((d) => ({
              ...d,
              snapshot_b64: d.snapshot_b64 || snapMap.get(d.id) || '',
            })),
          };
        }
        return res;
      });
      if (res.performance) setPerfSnapshot(res.performance);
      if (res.triggers) setTriggers(res.triggers);
      if (res.triggerLogs) setTriggerLogs(res.triggerLogs);
      if (res.config?.intervalSeconds) setIntervalInput(res.config.intervalSeconds);

      // Seed liveStates from dashboard latest snapshots so tiles have immediate visuals
      setLiveStates((prev) => {
        const next = { ...prev };
        for (const cam of res.cameras || []) {
          if (!next[cam.id] && cam.latest_snapshot_b64) {
            next[cam.id] = {
              frameB64: cam.latest_snapshot_b64,
              width: 1920,
              height: 1080,
              capturedAt: cam.latest_sampled_at || cam.last_sampled_at || '',
              captureMs: 0,
              fps: 0,
              metrics: cam.latest_metrics || {},
              bboxes: cam.latest_bboxes || [],
              motionBoxes: cam.latest_metrics?.motionBoxes || [],
              aiInferenceMs: 0,
              aiEngineLabel: 'Bereit',
            };
          }
        }
        return next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard(false);
    const timer = setInterval(() => {
      if (!document.hidden) {
        void refreshDashboard(false);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [refreshDashboard]);

  // Lazy-load tab-specific heavy payloads only when user opens that tab
  useEffect(() => {
    if (activeTab === 'log') {
      void refreshDashboard(true);
    } else if (activeTab === 'setup' && !tuyaAuth) {
      void client
        .get<{
          storedUserCode: string;
          storedEntryTitle: string;
          activeFlowId: string | null;
          qrData: string;
        }>('/tuya-reauth')
        .then((res) => {
          if (res) setTuyaAuth(res);
        })
        .catch(() => {});
    } else if (activeTab === 'triggers' && availableAxons.length === 0) {
      void client
        .get<{
          triggers: VisionTriggerItem[];
          logs: VisionTriggerLogItem[];
          availableAxons: AxonOptionItem[];
        }>('/triggers')
        .then((res) => {
          if (res?.availableAxons) setAvailableAxons(res.availableAxons);
        })
        .catch(() => {});
    }
  }, [activeTab, tuyaAuth, availableAxons.length, refreshDashboard]);

  // Live performance telemetry polling when on Performance tab
  const handleRefreshPerf = useCallback(async () => {
    try {
      const p = await client.get<PerformanceSnapshot>('/performance');
      if (p) setPerfSnapshot(p);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'perf') return;
    void handleRefreshPerf();
    const timer = setInterval(() => {
      if (!document.hidden) void handleRefreshPerf();
    }, 2500);
    return () => clearInterval(timer);
  }, [activeTab, handleRefreshPerf]);

  /**
   * Decodes base64 JPEG into an offscreen HTMLImageElement and runs 2-stage WebGL MobileNetV2
   * (Stage 1: Full frame + Stage 2: High-res Motion-ROI Crop Zoom on moving regions)
   */
  const runBrowserObjectDetectionOnB64 = useCallback(
    async (
      b64: string,
      minConf: number,
      motionBoxes: NormalizedBoundingBox[] = []
    ): Promise<{
      bboxes: NormalizedBoundingBox[];
      inferenceMs: number;
      width: number;
      height: number;
      roiZoomed?: boolean;
    } | null> => {
      const model = cocoModelRef.current;
      if (!model || !b64) return null;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          const w = img.naturalWidth || 640;
          const h = img.naturalHeight || 360;
          const effectiveMinConf = Math.max(0.25, minConf || 0.45);
          const candidateFloor = Math.max(0.32, effectiveMinConf - 0.04);
          const t0 = performance.now();
          try {
            const fullPreds = await model.detect(img, 25, candidateFloor);
            const rawCandidates: Array<{
              class: string;
              score: number;
              x: number;
              y: number;
              w: number;
              h: number;
            }> = fullPreds.map((p) => ({
              class: p.class,
              score: p.score,
              x: Math.max(0, Math.min(1, p.bbox[0] / w)),
              y: Math.max(0, Math.min(1, p.bbox[1] / h)),
              w: Math.max(0.015, Math.min(1, p.bbox[2] / w)),
              h: Math.max(0.02, Math.min(1, p.bbox[3] / h)),
            }));

            let roiZoomed = false;
            // Stage 2: 2-Stage Motion-ROI Crop Zoom in Browser WebGL
            if (motionBoxes.length > 0 && w >= 640) {
              const topM = motionBoxes.slice(0, 2);
              const uX0 = Math.min(...topM.map((m) => m.x));
              const uY0 = Math.min(...topM.map((m) => m.y));
              const uX1 = Math.max(...topM.map((m) => m.x + m.w));
              const uY1 = Math.max(...topM.map((m) => m.y + m.h));
              const unionArea = (uX1 - uX0) * (uY1 - uY0);

              if (unionArea < 0.62) {
                const cx = (uX0 + uX1) / 2;
                const cy = (uY0 + uY1) / 2;
                const span = Math.max(0.36, Math.min(0.68, Math.max(uX1 - uX0, uY1 - uY0) + 0.16));
                const roiX0 = Math.max(0, Math.min(1 - span, cx - span / 2));
                const roiY0 = Math.max(0, Math.min(1 - span, cy - span / 2));
                const roiW = Math.min(1 - roiX0, span);
                const roiH = Math.min(1 - roiY0, span);

                const canvas = document.createElement('canvas');
                const cropPxW = Math.max(160, Math.floor(roiW * w));
                const cropPxH = Math.max(120, Math.floor(roiH * h));
                canvas.width = Math.min(512, cropPxW);
                canvas.height = Math.max(120, Math.round((cropPxH / cropPxW) * canvas.width));
                const ctx2d = canvas.getContext('2d');
                if (ctx2d) {
                  ctx2d.drawImage(
                    img,
                    Math.floor(roiX0 * w),
                    Math.floor(roiY0 * h),
                    cropPxW,
                    cropPxH,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                  );
                  const roiPreds = await model.detect(canvas, 15, candidateFloor);
                  roiZoomed = true;
                  for (const rp of roiPreds) {
                    const [rx, ry, rw, rh] = rp.bbox;
                    const touchesEdge =
                      rx <= 2 ||
                      ry <= 2 ||
                      rx + rw >= canvas.width - 2 ||
                      ry + rh >= canvas.height - 2;
                    if (touchesEdge && rp.score < effectiveMinConf + 0.08) continue;
                    rawCandidates.push({
                      class: rp.class,
                      score: rp.score,
                      x: Math.max(0, Math.min(1, roiX0 + (rx / canvas.width) * roiW)),
                      y: Math.max(0, Math.min(1, roiY0 + (ry / canvas.height) * roiH)),
                      w: Math.max(0.015, Math.min(1, (rw / canvas.width) * roiW)),
                      h: Math.max(0.02, Math.min(1, (rh / canvas.height) * roiH)),
                    });
                  }
                }
              }
            }

            const inferenceMs = Math.round(performance.now() - t0);
            const filtered = rawCandidates
              .filter((c) => {
                if (c.w * c.h > 0.82) return false;
                const isClutter = CLUTTER_BACKGROUND_CLASSES.has(c.class);
                const reqScore = isClutter ? Math.max(effectiveMinConf, 0.62) : effectiveMinConf;
                return c.score >= reqScore;
              })
              .sort((a, b) => b.score - a.score);

            const deduped: typeof filtered = [];
            for (const cand of filtered) {
              if (
                !deduped.some((ex) => ex.class === cand.class && computeBoxIoU(cand, ex) > 0.45)
              ) {
                deduped.push(cand);
              }
            }

            const bboxes: NormalizedBoundingBox[] = deduped.map((p) => {
              const category: NormalizedBoundingBox['category'] =
                p.class === 'person'
                  ? 'person'
                  : VEHICLE_CLASSES.has(p.class)
                    ? 'vehicle'
                    : ANIMAL_CLASSES.has(p.class)
                      ? 'animal'
                      : 'object';
              return {
                x: Math.round(p.x * 1000) / 1000,
                y: Math.round(p.y * 1000) / 1000,
                w: Math.round(p.w * 1000) / 1000,
                h: Math.round(p.h * 1000) / 1000,
                label: GERMAN_LABELS[p.class] || p.class,
                rawClass: p.class,
                confidence: Math.round(p.score * 100) / 100,
                category,
                source: 'webgl',
              };
            });
            resolve({ bboxes, inferenceMs, width: w, height: h, roiZoomed });
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = `data:image/jpeg;base64,${b64}`;
      });
    },
    []
  );

  /**
   * Fetches a single live frame for a camera, decodes it without flicker, and runs AI detection
   * when motion is present or in active Fullscreen stream.
   */
  const fetchAndDetectCameraFrame = useCallback(
    async (camId: string, forceFresh = false, minConf = 0.45, allowBrowserAi = true) => {
      try {
        const res = await client.get<LiveFrameResponse>(
          `/live-frame?camera_id=${encodeURIComponent(camId)}${forceFresh ? '&force=1' : ''}`
        );

        const b64 = res.frameB64 || res.fallbackFrameB64 || '';
        if (!res.ok && !b64) {
          setLiveStates((prev) => ({
            ...prev,
            [camId]: {
              ...(prev[camId] || {
                frameB64: '',
                width: 1920,
                height: 1080,
                capturedAt: new Date().toISOString(),
                captureMs: res.captureMs || 0,
                fps: 0,
                metrics: {},
                bboxes: [],
                motionBoxes: [],
                aiInferenceMs: 0,
                aiEngineLabel: 'Offline',
              }),
              error: res.error || 'Stream nicht erreichbar',
            },
          }));
          return;
        }

        const frameKey = `${res.frameSeq || res.capturedAt || ''}:${b64.length}:${minConf}`;
        const isNewFrame = lastAnalyzedKeyRef.current[camId] !== frameKey;

        // Compute rolling FPS when a genuinely new camera frame arrives
        const nowPerf = performance.now();
        let fps = 1.0;
        if (isNewFrame) {
          const hist = (lastFrameTimestampsRef.current[camId] || []).filter(
            (t) => nowPerf - t < 8000
          );
          hist.push(nowPerf);
          lastFrameTimestampsRef.current[camId] = hist;
          fps =
            hist.length >= 2
              ? Math.round(
                  ((hist.length - 1) / Math.max(0.2, (hist[hist.length - 1] - hist[0]) / 1000)) * 10
                ) / 10
              : 1.0;
        }

        // Motion-Gated Browser WebGL AI:
        // Never run browser WebGL COCO-SSD in the Overview Grid (`allowBrowserAi === false`).
        // In Fullscreen (`allowBrowserAi === true`), only run WebGL COCO-SSD when frame changed AND motion >= 1.2% (or server boxes are empty).
        const motionPct = res.metrics?.motionPct ?? 0;
        const motionBoxes = res.metrics?.motionBoxes || [];
        const shouldRunWebgl =
          allowBrowserAi &&
          isNewFrame &&
          (motionPct >= 1.2 || motionBoxes.length > 0 || !res.serverDetections?.bboxes?.length);

        const webglDet = shouldRunWebgl
          ? await runBrowserObjectDetectionOnB64(b64, minConf, motionBoxes)
          : null;
        if (isNewFrame) {
          lastAnalyzedKeyRef.current[camId] = frameKey;
        }

        if (
          webglDet &&
          webglDet.bboxes.length > 0 &&
          nowPerf - (lastClientSyncMsRef.current[camId] || 0) > 4500
        ) {
          lastClientSyncMsRef.current[camId] = nowPerf;
          void client
            .post('/detect-live', {
              camera_id: camId,
              client_bboxes: webglDet.bboxes,
              save_to_log: false,
            })
            .catch(() => {});
        }

        setLiveStates((prev) => {
          const prevCam = prev[camId];
          const finalBboxes = isNewFrame
            ? webglDet?.bboxes ?? res.serverDetections?.bboxes ?? prevCam?.bboxes ?? []
            : prevCam?.bboxes ?? res.serverDetections?.bboxes ?? [];

          return {
            ...prev,
            [camId]: {
              frameB64: b64,
              width: webglDet?.width || res.width || prevCam?.width || 1920,
              height: webglDet?.height || res.height || prevCam?.height || 1080,
              capturedAt: res.capturedAt || prevCam?.capturedAt || new Date().toISOString(),
              captureMs: res.captureMs || prevCam?.captureMs || 0,
              fps: isNewFrame ? fps : prevCam?.fps || 1.0,
              metrics: res.metrics || prevCam?.metrics || {},
              bboxes: finalBboxes,
              motionBoxes: res.metrics?.motionBoxes || prevCam?.motionBoxes || [],
              aiInferenceMs: webglDet
                ? webglDet.inferenceMs
                : res.serverDetections?.processingMs || prevCam?.aiInferenceMs || 0,
              aiEngineLabel: webglDet
                ? 'WebGL COCO-SSD (Live)'
                : !allowBrowserAi
                  ? 'Motion-Gate Server'
                  : motionPct < 0.35
                    ? 'Motion-Gate (Statisch)'
                    : 'Server COCO-SSD',
              error: res.ok ? undefined : res.error,
            },
          };
        });
      } catch (err) {
        console.warn(`[CameraVision] Frame error for ${camId}:`, err);
      }
    },
    [runBrowserObjectDetectionOnB64]
  );

  // Continuous smooth high-rate loop when a camera is open in Fullscreen
  useEffect(() => {
    if (!fullscreenCamId || !fsPlaying) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (!active) return;
      if (!document.hidden) {
        await fetchAndDetectCameraFrame(fullscreenCamId, true, fsMinConfidence, true);
      }
      if (active) {
        timerId = setTimeout(loop, 240);
      }
    };

    void loop();
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [fullscreenCamId, fsPlaying, fsMinConfidence, fetchAndDetectCameraFrame]);

  // Round-robin lightweight preview loop for the Overview Grid (no browser WebGL AI!)
  useEffect(() => {
    if (fullscreenCamId || !gridLiveEnabled || activeTab !== 'grid') return;
    const cams = (data?.cameras || []).filter(
      (c) =>
        c.last_status === 'online' ||
        c.ha_state === 'recording' ||
        c.ha_state === 'streaming' ||
        Boolean(c.stream_url)
    );
    if (cams.length === 0) return;

    let active = true;
    let idx = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cycleGrid = async () => {
      if (!active) return;
      if (!document.hidden) {
        const targetCam = cams[idx % cams.length];
        idx++;
        if (targetCam) {
          await fetchAndDetectCameraFrame(
            targetCam.id,
            false,
            targetCam.min_confidence ?? 0.25,
            false
          );
        }
      }
      if (active) {
        timerId = setTimeout(cycleGrid, 1800);
      }
    };

    void cycleGrid();
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [fullscreenCamId, gridLiveEnabled, activeTab, data?.cameras, fetchAndDetectCameraFrame]);

  // Keyboard shortcuts in Fullscreen (ESC to exit, Left/Right arrows to switch cameras, Space to pause/resume)
  useEffect(() => {
    if (!fullscreenCamId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
        setFullscreenCamId(null);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const cams = data?.cameras || [];
        if (cams.length <= 1) return;
        const curIdx = cams.findIndex((c) => c.id === fullscreenCamId);
        if (curIdx === -1) return;
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = (curIdx + delta + cams.length) % cams.length;
        setFullscreenCamId(cams[nextIdx].id);
      } else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        setFsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenCamId, data?.cameras]);

  async function toggleNativeBrowserFullscreen() {
    try {
      if (!document.fullscreenElement && fullscreenContainerRef.current) {
        await fullscreenContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore if blocked by iframe policy
    }
  }

  async function saveCurrentLiveDetectionToLog(cam: CameraItem) {
    const live = liveStates[cam.id];
    setStatusMsg(`Speichere Live-Frame & Objekterkennung von „${cam.name}“ im Protokoll…`);
    try {
      await client.post('/detect-live', {
        camera_id: cam.id,
        optimization_mode: cam.optimization_mode,
        client_bboxes: live?.bboxes,
        save_to_log: true,
      });
      setStatusMsg(`Live-Erkennung von „${cam.name}“ im Ereignis-Protokoll gespeichert.`);
      await refreshDashboard();
    } catch (e) {
      setStatusMsg(`Fehler beim Speichern: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function downloadCurrentSnapshot(cam: CameraItem) {
    const b64 = liveStates[cam.id]?.frameB64 || cam.latest_snapshot_b64;
    if (!b64) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${b64}`;
    a.download = `${cam.id.replace(/[^a-z0-9_-]/gi, '_')}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    a.click();
  }

  async function setCameraOptimizationMode(cameraId: string, mode: OptimizationMode) {
    setStatusMsg(`Optimierungs-Profil für ${cameraId} auf „${mode}“ umgestellt.`);
    await client.post('/camera-mode', {
      camera_id: cameraId,
      optimization_mode: mode,
    });
    await refreshDashboard();
  }

  async function triggerSample(cameraId?: string) {
    setSamplingId(cameraId || 'ALL');
    setStatusMsg('Kamerabild wird via COCO-SSD & Pixel-Analyse ausgewertet…');
    try {
      const res = await client.post<{ results: Array<{ error?: string; scene_summary?: string }> }>(
        '/sample-now',
        cameraId ? { camera_id: cameraId } : {}
      );
      const first = res.results?.[0];
      if (first?.error) {
        setStatusMsg(`Status: ${first.error}`);
      } else if (first?.scene_summary) {
        setStatusMsg(`Abtastung abgeschlossen: ${first.scene_summary}`);
      } else {
        setStatusMsg('Zyklische Abtastung ausgeführt.');
      }
      await refreshDashboard();
      if (cameraId) {
        await fetchAndDetectCameraFrame(cameraId, true, fsMinConfidence);
      }
    } catch (e) {
      setStatusMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSamplingId(null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSamplingId('UPLOAD');
    setStatusMsg(`Analysiere „${file.name}“ lokal mit Profil „${testMode}“ (COCO-SSD)…`);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = String(reader.result || '');
        const res = await client.post<{
          sceneSummary: string;
          totalObjects: number;
          personCount: number;
          processingMs: number;
        }>('/analyze-image', {
          camera_id: 'manual.snapshot',
          camera_name: `Test (${testMode}: ${file.name})`,
          optimization_mode: testMode,
          image_base64: b64,
          mime_type: file.type || 'image/jpeg',
        });
        setStatusMsg(`[${testMode}] in ${res.processingMs} ms: ${res.sceneSummary}`);
        await refreshDashboard();
        setActiveTab('log');
      } catch (err) {
        setStatusMsg(`Analyse-Fehler: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSamplingId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveCameraEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCam) return;
    await client.post('/cameras', editingCam);
    setEditingCam(null);
    setStatusMsg('Kamera-Konfiguration & Bildanalyse-Schwellwerte gespeichert.');
    await refreshDashboard();
  }

  async function saveVisionConfig(cyclicEnabled: boolean) {
    await client.post('/config', {
      cyclicEnabled,
      intervalSeconds: Number(intervalInput) || 180,
    });
    setStatusMsg('Zyklische Abtast-Konfiguration gespeichert.');
    await refreshDashboard();
  }

  async function handleToggleHighFreq(enabled: boolean) {
    await client.post('/config', {
      highFreqEnabled: enabled,
    });
    setStatusMsg(
      enabled
        ? 'Hochfrequenz-Motion-Gate Loop (1–3 s) aktiviert.'
        : 'Hochfrequenz-Motion-Gate Loop pausiert.'
    );
    await refreshDashboard();
  }

  async function handleSaveTrigger(payload: Partial<VisionTriggerItem>) {
    await client.post('/triggers', payload);
    setStatusMsg(`Trigger-Regel „${payload.name}“ gespeichert.`);
    await refreshDashboard();
  }

  async function handleToggleTrigger(id: string, enabled: number) {
    await client.post('/triggers/toggle', { id, enabled });
    setStatusMsg(`Trigger-Regel ${enabled === 1 ? 'aktiviert' : 'pausiert'}.`);
    await refreshDashboard();
  }

  async function handleDeleteTrigger(id: string) {
    await client.delete(`/triggers?id=${encodeURIComponent(id)}`);
    setStatusMsg('Trigger-Regel gelöscht.');
    await refreshDashboard();
  }

  async function handleTestTrigger(id: string) {
    setStatusMsg('Führe Trigger-Testlauf aus…');
    try {
      const res = await client.post<{
        ok: boolean;
        status: string;
        resultSummary: string;
      }>('/triggers/test', { id });
      setStatusMsg(`Trigger-Test [${res.status.toUpperCase()}]: ${res.resultSummary}`);
      await refreshDashboard();
    } catch (e) {
      setStatusMsg(`Trigger-Test Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function refreshTuyaQrCode() {
    setStatusMsg('Generiere frischen 5-Minuten QR-Code für LSC / Tuya…');
    const res = await client.post<{
      storedUserCode: string;
      storedEntryTitle: string;
      activeFlowId: string | null;
      qrData: string;
    }>('/tuya-reauth-refresh', {});
    setTuyaAuth(res);
    setStatusMsg('Neuer QR-Code bereit. Bitte mit der LSC / Smart Life App scannen.');
  }

  async function confirmTuyaQrScanned() {
    setStatusMsg('Prüfe QR-Code-Bestätigung bei Home Assistant…');
    const res = await client.post<{
      status: number;
      body?: { type?: string; errors?: Record<string, string> };
    }>('/tuya-reauth', { flow_id: tuyaAuth?.activeFlowId });
    if (res.body?.errors) {
      setStatusMsg(
        'QR-Code wurde in der App noch nicht bestätigt. Bitte in der App bestätigen und erneut klicken.'
      );
    } else {
      setStatusMsg('Tuya / LSC erfolgreich verbunden. Kameras werden aktualisiert…');
      await refreshDashboard();
    }
  }

  async function configureLocalOnvif(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(`Verbinde Kamera lokal über RTSP/ONVIF (${onvifIp})…`);
    const res = await client.post<{
      rtspUrl: string;
      port554Open: boolean;
      sampleRes?: { error?: string; scene_summary?: string };
    }>('/configure-onvif', {
      camera_id: 'camera.lsc_smart_ptz_camera_2',
      lan_ip: onvifIp,
      password: onvifPass,
    });
    if (res.sampleRes?.scene_summary) {
      setStatusMsg(`Lokaler Stream verbunden & ausgewertet: ${res.sampleRes.scene_summary}`);
    } else {
      setStatusMsg(
        `Stream gesetzt (${res.rtspUrl}). Hinweis: ${res.sampleRes?.error || 'Prüfe ONVIF-Schalter in der LSC App.'}`
      );
    }
    await refreshDashboard();
  }

  if (loading && !data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#09090b',
          color: '#a1a1aa',
          padding: '32px 48px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: '13px',
        }}
      >
        Initialisiere Kamera-Übersicht & Live-Objekterkennung (COCO-SSD)…
      </div>
    );
  }

  const cams = data?.cameras || [];
  const dets = data?.detections || [];
  const cfg = data?.config;

  const onlineCamsCount = cams.filter(
    (c) => c.last_status === 'online' || c.ha_state === 'recording' || c.ha_state === 'streaming'
  ).length;

  const filteredCams = cams.filter((c) => {
    const isOnline =
      c.last_status === 'online' || c.ha_state === 'recording' || c.ha_state === 'streaming';
    if (roomFilter === 'ONLINE') return isOnline;
    if (roomFilter === 'OUTDOOR') {
      return /außen|garten|werkstatt|outdoor|parkplatz/i.test(`${c.room} ${c.name}`);
    }
    if (roomFilter === 'INDOOR') {
      return !/außen|garten|werkstatt|outdoor|parkplatz/i.test(`${c.room} ${c.name}`);
    }
    return true;
  });

  const fullscreenCam = fullscreenCamId ? cams.find((c) => c.id === fullscreenCamId) || null : null;
  const fsLive = fullscreenCam ? liveStates[fullscreenCam.id] : undefined;

  // Filter bounding boxes in Fullscreen according to user filter mode & confidence threshold
  const fsFilteredBboxes = (fsLive?.bboxes || []).filter((b) => {
    if (b.confidence < fsMinConfidence) return false;
    if (fsFilterMode === 'CAMERA_PROFILE' && fullscreenCam) {
      if (fullscreenCam.optimization_mode === 'Personen') return b.rawClass === 'person';
      if (fullscreenCam.optimization_mode === 'Fahrzeuge') {
        return VEHICLE_CLASSES.has(b.rawClass) || b.rawClass === 'person';
      }
    }
    return true;
  });

  const fsCameraHistory = fullscreenCam
    ? dets.filter((d) => d.camera_id === fullscreenCam.id).slice(0, 8)
    : [];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#fafafa',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontVariantNumeric: 'tabular-nums',
        padding: '28px 40px 64px',
        boxSizing: 'border-box',
      }}
    >
      {/* =====================================================================
          FULLSCREEN LIVE STREAM + REAL-TIME OBJECT DETECTION OVERLAY
         ===================================================================== */}
      {fullscreenCam && (
        <div
          ref={fullscreenContainerRef}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: '#050507',
            color: '#fafafa',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* FULLSCREEN TOP HUD BAR */}
          <div
            style={{
              height: '52px',
              padding: '0 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#09090b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexShrink: 0,
            }}
          >
            {/* Left: Back button + Active Camera Identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
              <button
                onClick={() => {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen().catch(() => {});
                  }
                  setFullscreenCamId(null);
                }}
                style={{
                  background: '#fafafa',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                ← Übersicht (ESC)
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: fsLive?.error ? '#ef4444' : '#10b981',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#fafafa',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {fullscreenCam.name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#a1a1aa',
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: '2px 6px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                  }}
                >
                  {fullscreenCam.room}
                </span>
              </div>
            </div>

            {/* Center: Quick Camera Switcher Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                overflowX: 'auto',
                maxWidth: '46vw',
              }}
            >
              {cams.map((c) => {
                const isSelected = c.id === fullscreenCam.id;
                const cOnline =
                  c.last_status === 'online' ||
                  c.ha_state === 'recording' ||
                  c.ha_state === 'streaming';
                return (
                  <button
                    key={c.id}
                    onClick={() => setFullscreenCamId(c.id)}
                    style={{
                      background: isSelected ? '#18181b' : 'transparent',
                      color: isSelected ? '#fafafa' : '#71717a',
                      border: `1px solid ${isSelected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: isSelected ? 500 : 400,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: cOnline ? '#10b981' : '#52525b',
                      }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>

            {/* Right: Live Stream & Fullscreen Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                  color: '#a1a1aa',
                  padding: '4px 8px',
                  background: '#111113',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '4px',
                }}
              >
                {fsPlaying ? 'LIVE' : 'PAUSIERT'} · {fsLive?.captureMs || 0} ms · AI{' '}
                {fsLive?.aiInferenceMs || 0} ms
              </span>

              <button
                onClick={() => setFsPlaying((p) => !p)}
                style={{
                  background: 'transparent',
                  color: '#fafafa',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                {fsPlaying ? 'Pause' : 'Weiter'}
              </button>

              <button
                onClick={() => saveCurrentLiveDetectionToLog(fullscreenCam)}
                style={{
                  background: 'transparent',
                  color: '#fafafa',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
                title="Aktuellen Frame inkl. KI-Boxen im Protokoll speichern"
              >
                + Protokoll
              </button>

              <button
                onClick={() => downloadCurrentSnapshot(fullscreenCam)}
                style={{
                  background: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                JPG
              </button>

              <button
                onClick={() => setFsShowSidebar((s) => !s)}
                style={{
                  background: fsShowSidebar ? '#18181b' : 'transparent',
                  color: '#fafafa',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                Inspector
              </button>

              <button
                onClick={toggleNativeBrowserFullscreen}
                style={{
                  background: 'transparent',
                  color: '#fafafa',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
                title="Browser-Vollbild (F11)"
              >
                Vollbild
              </button>
            </div>
          </div>

          {/* FULLSCREEN MAIN STAGE (VIDEO CANVAS + OPTIONAL RIGHT INSPECTOR) */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* CENTER VIDEO + LIVE OBJECT DETECTION OVERLAY */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                background: '#030304',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '16px',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: fsShowSidebar ? 'calc((100vh - 130px) * 1.7778)' : '96vw',
                  aspectRatio: '16 / 9',
                  background: '#09090b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}
              >
                {fsLive?.frameB64 ? (
                  <>
                    <img
                      src={`data:image/jpeg;base64,${fsLive.frameB64}`}
                      alt={fullscreenCam.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'fill',
                        display: 'block',
                        userSelect: 'none',
                      }}
                    />

                    {/* LIVE OBJECT DETECTION SVG BOUNDING BOX OVERLAY */}
                    <BoundingBoxSvgOverlay
                      bboxes={fsFilteredBboxes}
                      motionBoxes={fsLive.motionBoxes || []}
                      showObjectBoxes={fsShowObjectBoxes}
                      showMotionBoxes={fsShowMotionBoxes}
                      showCrosshair={fsShowCrosshair}
                      compact={false}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      color: '#a1a1aa',
                      padding: '24px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '14px', color: '#fafafa', fontWeight: 500 }}>
                      {fsLive?.error
                        ? 'Kamera-Stream aktuell nicht erreichbar'
                        : 'Verbinde Live-Stream & starte Echtzeit-Objekterkennung…'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#71717a', maxWidth: '520px' }}>
                      {fsLive?.error || fullscreenCam.last_error || fullscreenCam.id}
                    </div>
                    <button
                      onClick={() => fetchAndDetectCameraFrame(fullscreenCam.id, true, fsMinConfidence)}
                      style={{
                        marginTop: '6px',
                        background: '#fafafa',
                        color: '#09090b',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Erneut verbinden
                    </button>
                  </div>
                )}

                {/* TOP-LEFT FLOATING TELEMETRY OVERLAY INSIDE VIDEO */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 6,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(9, 9, 11, 0.84)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: '#fafafa',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: fsPlaying && !fsLive?.error ? '#10b981' : '#f59e0b',
                      }}
                    />
                    {fsLive?.aiEngineLabel || 'COCO-SSD LIVE'} · {formatTimeShort(fsLive?.capturedAt)}
                  </span>

                  <span
                    style={{
                      background: 'rgba(9, 9, 11, 0.84)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: fsFilteredBboxes.length > 0 ? '#10b981' : '#a1a1aa',
                    }}
                  >
                    OBJEKTE: {fsFilteredBboxes.length} · BEWEGUNG: Δ {fsLive?.metrics?.motionPct ?? 0}%
                  </span>

                  {fsLive?.metrics?.lightingMode && (
                    <span
                      style={{
                        background: 'rgba(9, 9, 11, 0.84)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        color: '#a1a1aa',
                      }}
                    >
                      {fsLive.metrics.lightingMode.toUpperCase()} · SCHÄRFE{' '}
                      {fsLive.metrics.sharpnessScore ?? 0}% · LICHT {fsLive.metrics.luminancePct ?? 0}%
                    </span>
                  )}
                </div>
              </div>

              {/* BOTTOM HUD CONTROL STRIP IN FULLSCREEN */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                  background: 'rgba(9, 9, 11, 0.92)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    color: '#fafafa',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={fsShowObjectBoxes}
                    onChange={(e) => setFsShowObjectBoxes(e.target.checked)}
                  />
                  KI-Objekt-Boxen ({fsFilteredBboxes.length})
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={fsShowMotionBoxes}
                    onChange={(e) => setFsShowMotionBoxes(e.target.checked)}
                  />
                  Bewegungs-Cluster ({fsLive?.motionBoxes?.length || 0})
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={fsShowCrosshair}
                    onChange={(e) => setFsShowCrosshair(e.target.checked)}
                  />
                  Zonen-Raster
                </label>

                <div
                  style={{
                    height: '14px',
                    width: '1px',
                    background: 'rgba(255,255,255,0.1)',
                  }}
                />

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11.5px' }}>
                  <span style={{ color: '#a1a1aa' }}>Min. Konfidenz:</span>
                  <input
                    type="range"
                    min={15}
                    max={75}
                    step={5}
                    value={Math.round(fsMinConfidence * 100)}
                    onChange={(e) => setFsMinConfidence(Number(e.target.value) / 100)}
                    style={{ width: '80px', accentColor: '#fafafa' }}
                  />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", width: '32px' }}>
                    {Math.round(fsMinConfidence * 100)}%
                  </span>
                </div>

                <div
                  style={{
                    height: '14px',
                    width: '1px',
                    background: 'rgba(255,255,255,0.1)',
                  }}
                />

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                  <span style={{ color: '#a1a1aa' }}>Filter:</span>
                  <button
                    onClick={() => setFsFilterMode('ALL')}
                    style={{
                      background: fsFilterMode === 'ALL' ? '#fafafa' : 'transparent',
                      color: fsFilterMode === 'ALL' ? '#09090b' : '#a1a1aa',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '3px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Alle 80 Klassen
                  </button>
                  <button
                    onClick={() => setFsFilterMode('CAMERA_PROFILE')}
                    style={{
                      background: fsFilterMode === 'CAMERA_PROFILE' ? '#fafafa' : 'transparent',
                      color: fsFilterMode === 'CAMERA_PROFILE' ? '#09090b' : '#a1a1aa',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '3px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Profil ({fullscreenCam.optimization_mode})
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT INSPECTOR SIDEBAR IN FULLSCREEN */}
            {fsShowSidebar && (
              <div
                style={{
                  width: '340px',
                  borderLeft: '1px solid rgba(255,255,255,0.08)',
                  background: '#09090b',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  padding: '20px',
                  gap: '24px',
                  flexShrink: 0,
                }}
              >
                {/* Section 1: Live Detected Objects in Stream */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#52525b',
                      marginBottom: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>LIVE ERKANNTE OBJEKTE IM STREAM</span>
                    <span style={{ color: '#fafafa', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fsFilteredBboxes.length}
                    </span>
                  </div>

                  {fsFilteredBboxes.length === 0 ? (
                    <div
                      style={{
                        padding: '14px 12px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: '#111113',
                        fontSize: '12px',
                        color: '#71717a',
                        lineHeight: 1.5,
                      }}
                    >
                      Keine Objekte über {Math.round(fsMinConfidence * 100)}% Konfidenz im aktuellen
                      Frame.
                      {(fsLive?.motionBoxes?.length || 0) > 0 && (
                        <div style={{ marginTop: '6px', color: '#e4e4e7' }}>
                          Bewegungs-Cluster aktiv ({fsLive?.motionBoxes.length} Zone
                          {fsLive?.motionBoxes.length === 1 ? '' : 'n'} · Δ{' '}
                          {fsLive?.metrics?.motionPct ?? 0}%)
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {fsFilteredBboxes.map((box, i) => {
                        const color = getBoxStrokeColor(box.category);
                        const confPct = Math.round(box.confidence * 100);
                        const areaPct = Math.round(box.w * box.h * 100);
                        return (
                          <div
                            key={`${box.rawClass}-${i}`}
                            style={{
                              padding: '10px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: color,
                                  }}
                                />
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#fafafa' }}>
                                  {box.label}
                                </span>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: '#52525b',
                                  }}
                                >
                                  {box.rawClass}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color,
                                }}
                              >
                                {confPct}%
                              </span>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                fontFamily: "'JetBrains Mono', monospace",
                                color: '#71717a',
                              }}
                            >
                              <span>
                                POS {Math.round(box.x * 100)}%, {Math.round(box.y * 100)}%
                              </span>
                              <span>FLÄCHE {areaPct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section 2: Live Stream Telemetry */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#52525b',
                      marginBottom: '10px',
                    }}
                  >
                    STREAM- & OPTIK-TELEMETRIE
                  </div>
                  <div
                    style={{
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {[
                      ['Auflösung', `${fsLive?.width || 1920} × ${fsLive?.height || 1080} px`],
                      ['Frame-Abruf', `${fsLive?.captureMs || 0} ms (${fsLive?.fps || 1} FPS)`],
                      ['KI-Inferenz', `${fsLive?.aiInferenceMs || 0} ms (${fsLive?.aiEngineLabel || 'Bereit'})`],
                      ['Lichtmodus', fsLive?.metrics?.lightingMode || '—'],
                      ['Helligkeit / Kontrast', `${fsLive?.metrics?.luminancePct ?? 0}% / ${fsLive?.metrics?.contrastScore ?? 0}%`],
                      ['Bildschärfe', `${fsLive?.metrics?.sharpnessScore ?? 0}%`],
                      ['Bewegungs-Delta', `${fsLive?.metrics?.motionPct ?? 0}% (${fsLive?.metrics?.activeMotionZone || '—'})`],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '7px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ color: '#a1a1aa' }}>{k}</span>
                        <span
                          style={{
                            color: '#fafafa',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Optimization Mode Switcher */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#52525b',
                      marginBottom: '10px',
                    }}
                  >
                    KAMERA-PROFIL ({fullscreenCam.optimization_mode})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {MODES.map((m) => {
                      const active = fullscreenCam.optimization_mode === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setCameraOptimizationMode(fullscreenCam.id, m)}
                          style={{
                            background: active ? '#fafafa' : '#111113',
                            color: active ? '#09090b' : '#a1a1aa',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '4px',
                            padding: '5px 10px',
                            fontSize: '11.5px',
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                          }}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setEditingCam(fullscreenCam)}
                      style={{
                        background: 'transparent',
                        color: '#fafafa',
                        border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      Analyse-Schwellwerte & Motion-Gate konfigurieren…
                    </button>
                  </div>
                </div>

                {/* Section 4: Recent History for this Camera */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#52525b',
                      marginBottom: '10px',
                    }}
                  >
                    LETZTE EREIGNISSE DIESER KAMERA
                  </div>
                  {fsCameraHistory.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#52525b' }}>
                      Noch keine gespeicherten Ereignisse für diese Kamera.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {fsCameraHistory.map((h) => (
                        <div
                          key={h.id}
                          style={{
                            padding: '8px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '11.5px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              color: '#71717a',
                              fontFamily: "'JetBrains Mono', monospace",
                              marginBottom: '3px',
                            }}
                          >
                            <span>{formatTimeShort(h.sampled_at)}</span>
                            <span>{h.total_objects} Obj. · Δ {h.motion_pct}%</span>
                          </div>
                          <div style={{ color: '#e4e4e7', lineHeight: 1.4 }}>{h.scene_summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN OVERVIEW PAGE HEADER (DESIGN.md COMPLIANT)
         ===================================================================== */}
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: '16px',
            paddingBottom: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 500,
                letterSpacing: '-0.025em',
                color: '#fafafa',
              }}
            >
              Kameras & Live-Vision
            </h1>
            <span
              style={{
                fontSize: '12.5px',
                color: '#a1a1aa',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {cams.length} Kameras · {onlineCamsCount} Streams aktiv ·{' '}
              {webglStatus === 'ready' ? 'WebGL + Server COCO-SSD bereit' : 'Server COCO-SSD bereit'} ·{' '}
              {dets.length} Ereignisse
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setGridLiveEnabled((v) => !v)}
              style={{
                background: gridLiveEnabled ? '#111113' : 'transparent',
                color: gridLiveEnabled ? '#fafafa' : '#a1a1aa',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: gridLiveEnabled ? '#10b981' : '#52525b',
                }}
              />
              Live-Raster: {gridLiveEnabled ? 'AN' : 'AUS'}
            </button>

            <div
              style={{
                display: 'inline-flex',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              {([2, 3, 1] as const).map((cols) => (
                <button
                  key={cols}
                  onClick={() => setGridCols(cols)}
                  style={{
                    background: gridCols === cols ? '#fafafa' : 'transparent',
                    color: gridCols === cols ? '#09090b' : '#a1a1aa',
                    border: 'none',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    fontWeight: gridCols === cols ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {cols === 2 ? '2×2' : cols === 3 ? '3×2' : '1×1'}
                </button>
              ))}
            </div>

            <button
              onClick={() => triggerSample()}
              disabled={samplingId !== null}
              style={{
                background: '#fafafa',
                color: '#09090b',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {samplingId === 'ALL' ? 'Abtastung läuft…' : 'Alle Kameras abtasten'}
            </button>

            <label
              style={{
                background: 'transparent',
                color: '#a1a1aa',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Bild testen
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {/* SENSOR & STREAM FRESHNESS + USER ACTION STRIP */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '8px 0',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11.5px',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#a1a1aa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background:
                  onlineCamsCount === cams.length && cams.length > 0
                    ? '#10b981'
                    : onlineCamsCount > 0
                    ? '#f59e0b'
                    : '#ef4444',
                display: 'inline-block',
              }}
            />
            <span>
              STREAM-STATUS: {onlineCamsCount}/{cams.length} ONLINE
            </span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>
              LETZTE ERKENNUNG:{' '}
              {dets[0]?.detected_at ? formatTimeShort(dets[0].detected_at) : 'KEINE'}
            </span>
            <span style={{ color: '#52525b' }}>·</span>
            <span>
              KI-ENGINE: {webglStatus === 'ready' ? 'WEBGL + SERVER COCO-SSD' : 'SERVER COCO-SSD'}
            </span>
          </div>

          {(onlineCamsCount < cams.length || tuyaAuth?.activeFlowId) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontFamily: "'Inter', sans-serif" }}>
              <span style={{ color: '#f59e0b', fontSize: '12px' }}>
                {tuyaAuth?.activeFlowId
                  ? 'Benutzereingabe erforderlich: Tuya Smart Life QR-Code Scan ausstehend'
                  : `Hinweis: ${cams.length - onlineCamsCount} Kamera(s) im Standby / RTSP-Konfiguration prüfen`}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '3px',
                  color: '#fafafa',
                  fontSize: '11px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Stream-Setup öffnen
              </button>
            </div>
          )}
        </div>

        {/* NAVIGATION & FILTER TEXT-TABS (DESIGN.md) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {[
              { id: 'grid', label: `Kamera-Feeds (${cams.length})` },
              {
                id: 'triggers',
                label: `Trigger-Konfigurator (${triggers.filter((t) => t.enabled === 1).length}/${triggers.length})`,
              },
              {
                id: 'perf',
                label: `Leistungsmonitor (${perfSnapshot?.motionGateSkipRatePct ?? 0}% Skip)`,
              },
              { id: 'log', label: `Ereignis-Protokoll (${dets.length})` },
              {
                id: 'setup',
                label: `Stream- & Tuya-Konfiguration${tuyaAuth?.activeFlowId ? ' (QR bereit)' : ''}`,
              },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    setActiveTab(t.id as 'grid' | 'triggers' | 'perf' | 'log' | 'setup')
                  }
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '1px solid #fafafa' : '1px solid transparent',
                    padding: '12px 0',
                    marginBottom: '-1px',
                    color: active ? '#fafafa' : '#52525b',
                    fontSize: '13px',
                    fontWeight: active ? 500 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'grid' && (
            <div style={{ display: 'flex', gap: '18px' }}>
              {[
                { id: 'ALL', label: `Alle (${cams.length})` },
                { id: 'ONLINE', label: `Live / Online (${onlineCamsCount})` },
                { id: 'OUTDOOR', label: 'Außenbereich' },
                { id: 'INDOOR', label: 'Innenbereich' },
              ].map((f) => {
                const active = roomFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() =>
                      setRoomFilter(f.id as 'ALL' | 'ONLINE' | 'OUTDOOR' | 'INDOOR')
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 0',
                      color: active ? '#fafafa' : '#52525b',
                      fontSize: '12px',
                      fontWeight: active ? 500 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {statusMsg && (
          <div
            style={{
              marginBottom: '20px',
              padding: '10px 14px',
              background: '#111113',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '4px',
              color: '#fafafa',
              fontSize: '12.5px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{statusMsg}</span>
            <button
              onClick={() => setStatusMsg('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#71717a',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* =====================================================================
            TAB 1: CAMERA FEED OVERVIEW GRID (CLICK FEED -> FULLSCREEN + LIVE AI)
           ===================================================================== */}
        {activeTab === 'grid' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  gridCols === 1
                    ? '1fr'
                    : gridCols === 3
                      ? 'repeat(auto-fill, minmax(380px, 1fr))'
                      : 'repeat(auto-fill, minmax(540px, 1fr))',
                gap: '20px',
                marginBottom: '40px',
              }}
            >
              {filteredCams.map((cam) => {
                const isOnline =
                  cam.last_status === 'online' ||
                  cam.ha_state === 'recording' ||
                  cam.ha_state === 'streaming';
                const live = liveStates[cam.id];
                const previewB64 = live?.frameB64 || cam.latest_snapshot_b64 || '';
                const previewBboxes = live?.bboxes?.length
                  ? live.bboxes
                  : cam.latest_bboxes || [];
                const previewMotionBoxes = live?.motionBoxes || [];
                const currentMode: OptimizationMode = MODES.includes(cam.optimization_mode)
                  ? cam.optimization_mode
                  : 'Personen';

                return (
                  <div
                    key={cam.id}
                    style={{
                      background: '#09090b',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* TOP CAMERA BAR */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: isOnline
                              ? '#10b981'
                              : cam.lan_reachable_6668
                                ? '#f59e0b'
                                : '#ef4444',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13.5px',
                            fontWeight: 500,
                            color: '#fafafa',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cam.name}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#52525b',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {cam.room}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: "'JetBrains Mono', monospace",
                            color: isOnline ? '#10b981' : cam.lan_reachable_6668 ? '#f59e0b' : '#52525b',
                          }}
                        >
                          {isOnline
                            ? `LIVE · ${formatTimeShort(live?.capturedAt || cam.latest_sampled_at)}`
                            : cam.lan_reachable_6668
                              ? `LAN ${cam.lan_ip}`
                              : cam.ha_state.toUpperCase()}
                        </span>
                        <button
                          onClick={() => setFullscreenCamId(cam.id)}
                          style={{
                            background: '#fafafa',
                            color: '#09090b',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Vollbild + KI ↗
                        </button>
                      </div>
                    </div>

                    {/* CLICKABLE 16:9 VIDEO FEED VIEWPORT */}
                    <div
                      onClick={() => setFullscreenCamId(cam.id)}
                      title="Klicken für Vollbild-Stream mit Live-Objekterkennung"
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '16 / 9',
                        background: '#050507',
                        cursor: 'pointer',
                        overflow: 'hidden',
                      }}
                    >
                      {previewB64 ? (
                        <>
                          <img
                            src={`data:image/jpeg;base64,${previewB64}`}
                            alt={cam.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'fill',
                              display: 'block',
                            }}
                          />
                          <BoundingBoxSvgOverlay
                            bboxes={previewBboxes}
                            motionBoxes={previewMotionBoxes}
                            showObjectBoxes={true}
                            showMotionBoxes={true}
                            compact={true}
                          />
                        </>
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '20px',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: '12px',
                              color: isOnline ? '#a1a1aa' : '#52525b',
                            }}
                          >
                            {isOnline
                              ? 'Lade Live-Stream… (Klicken für Vollbild)'
                              : 'Stream offline / Standby'}
                          </span>
                          {cam.last_error && (
                            <span
                              style={{
                                fontSize: '11.5px',
                                color: '#71717a',
                                maxWidth: '400px',
                                lineHeight: 1.4,
                              }}
                            >
                              {cam.last_error}
                            </span>
                          )}
                        </div>
                      )}

                      {/* OVERLAY BADGES ON FEED */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          left: '8px',
                          right: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          pointerEvents: 'none',
                          zIndex: 5,
                        }}
                      >
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {previewBboxes.length > 0 && (
                            <span
                              style={{
                                background: 'rgba(9, 9, 11, 0.88)',
                                border: '1px solid rgba(16, 185, 129, 0.45)',
                                color: '#10b981',
                                padding: '2px 7px',
                                borderRadius: '3px',
                                fontSize: '10.5px',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 600,
                              }}
                            >
                              {previewBboxes.length} OBJEKT{previewBboxes.length === 1 ? '' : 'E'} IM
                              BILD
                            </span>
                          )}
                          {(live?.metrics?.lightingMode || cam.latest_metrics?.lightingMode) && (
                            <span
                              style={{
                                background: 'rgba(9, 9, 11, 0.82)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#a1a1aa',
                                padding: '2px 7px',
                                borderRadius: '3px',
                                fontSize: '10.5px',
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {live?.metrics?.lightingMode || cam.latest_metrics?.lightingMode} · Δ{' '}
                              {live?.metrics?.motionPct ?? cam.latest_metrics?.motionPct ?? 0}%
                            </span>
                          )}
                        </div>

                        <span
                          style={{
                            background: 'rgba(9, 9, 11, 0.85)',
                            border: '1px solid rgba(255,255,255,0.14)',
                            color: '#fafafa',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '10.5px',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          KLICK → LIVE STREAM
                        </span>
                      </div>
                    </div>

                    {/* BOTTOM CAMERA METADATA & PROFILE BAR */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                        background: '#0d0d10',
                      }}
                    >
                      {/* Mode selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            color: '#52525b',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginRight: '4px',
                          }}
                        >
                          Profil:
                        </span>
                        {MODES.map((m) => {
                          const active = currentMode === m;
                          return (
                            <button
                              key={m}
                              onClick={() => setCameraOptimizationMode(cam.id, m)}
                              style={{
                                background: active ? '#fafafa' : 'transparent',
                                color: active ? '#09090b' : '#71717a',
                                border: `1px solid ${active ? '#fafafa' : 'rgba(255,255,255,0.06)'}`,
                                borderRadius: '3px',
                                padding: '2px 7px',
                                fontSize: '11px',
                                fontWeight: active ? 600 : 400,
                                cursor: 'pointer',
                              }}
                              title={MODE_META[m].desc}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => fetchAndDetectCameraFrame(cam.id, true, cam.min_confidence ?? 0.45)}
                          style={{
                            background: 'transparent',
                            color: '#a1a1aa',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Frame + KI
                        </button>
                        <button
                          onClick={() => triggerSample(cam.id)}
                          disabled={samplingId !== null}
                          style={{
                            background: 'transparent',
                            color: '#a1a1aa',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {samplingId === cam.id ? 'Prüfe…' : 'Log-Scan'}
                        </button>
                        <button
                          onClick={() => setEditingCam(cam)}
                          style={{
                            background: 'transparent',
                            color: '#71717a',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Setup
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* =====================================================================
            TAB 2: DETECTION & EVENT LOG
           ===================================================================== */}
        {activeTab === 'log' && (
          <div>
            {dets.length === 0 ? (
              <div
                style={{
                  padding: '32px 0',
                  color: '#71717a',
                  fontSize: '13px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                Noch keine Kamerabilder im Ereignis-Protokoll gespeichert.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dets.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      padding: '16px 0',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      gap: '20px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    {d.snapshot_b64 && (
                      <div
                        onClick={() => setFullscreenCamId(d.camera_id)}
                        style={{
                          position: 'relative',
                          width: '160px',
                          aspectRatio: '16 / 9',
                          background: '#050507',
                          border: '1px solid rgba(255,255,255,0.08)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                        title="Im Vollbild-Live-Stream öffnen"
                      >
                        <img
                          src={`data:image/jpeg;base64,${d.snapshot_b64}`}
                          alt={d.camera_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginBottom: '6px',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 500, color: '#fafafa', fontSize: '14px' }}>
                            {d.camera_name}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: "'JetBrains Mono', monospace",
                              color: '#a1a1aa',
                              padding: '1px 6px',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '3px',
                            }}
                          >
                            {d.optimization_mode || 'Objekte'}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: '#52525b',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {new Date(d.sampled_at).toLocaleString('de-DE')} · {d.processing_ms} ms ·{' '}
                          {d.engine_used}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#e4e4e7', marginBottom: '8px' }}>
                        {d.scene_summary}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {(d.objects || []).map((obj, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '11px',
                              fontFamily: "'JetBrains Mono', monospace",
                              padding: '2px 8px',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: '3px',
                              color: '#fafafa',
                            }}
                          >
                            {obj.count}× {obj.label} ({Math.round((obj.confidence || 0.9) * 100)}%)
                            {obj.details ? ` · ${obj.details}` : ''}
                          </span>
                        ))}
                        {d.metrics?.sharpnessScore != null && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: "'JetBrains Mono', monospace",
                              color: '#71717a',
                            }}
                          >
                            Schärfe {d.metrics.sharpnessScore}% · Licht {d.metrics.luminancePct}% · Δ{' '}
                            {d.motion_pct || 0}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 3: STREAM, GO2RTC & TUYA SETUP
           ===================================================================== */}
        {activeTab === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* System Status Rows */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                  marginBottom: '12px',
                }}
              >
                VISION-PIPELINE & STREAM-RELAY STATUS
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  [
                    'Browser Live-Objekterkennung',
                    webglStatus === 'ready'
                      ? 'WebGL MobileNetV2 + 2-Stufen ROI-Zoom aktiv'
                      : 'Fallback auf Server MobileNetV2',
                  ],
                  [
                    'Server Computer-Vision',
                    'MobileNetV2 (640px Bilinear + ROI-Zoom) + 4×4 Block-Luma Motion-Filter',
                  ],
                  [
                    'go2rtc Stream-Relay',
                    data?.go2rtc?.online
                      ? `Verbunden (${data.go2rtc.url})`
                      : `Nicht erreichbar (${data?.go2rtc?.url || ''})`,
                  ],
                  [
                    'Zyklische Hintergrund-Abtastung',
                    cfg?.cyclicEnabled ? `Aktiv (alle ${cfg.intervalSeconds} s)` : 'Pausiert',
                  ],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ color: '#a1a1aa' }}>{label}</span>
                    <span style={{ color: '#fafafa', fontFamily: "'JetBrains Mono', monospace" }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '12.5px', color: '#a1a1aa' }}>
                  Zyklisches Abtast-Intervall (Sekunden):
                </span>
                <input
                  type="number"
                  min={30}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(Number(e.target.value))}
                  style={{
                    width: '90px',
                    background: '#141417',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#fafafa',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '12.5px',
                  }}
                />
                <button
                  onClick={() => saveVisionConfig(true)}
                  style={{
                    background: '#fafafa',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Zyklisch aktivieren & speichern
                </button>
                <button
                  onClick={() => saveVisionConfig(false)}
                  style={{
                    background: 'transparent',
                    color: '#a1a1aa',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Zyklisch pausieren
                </button>
              </div>
            </div>

            {/* Tuya QR Re-Auth & ONVIF */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '32px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#52525b',
                    marginBottom: '10px',
                  }}
                >
                  TUYA / LSC SMART CONNECT QR-AUTHENTIFIZIERUNG
                </div>
                <p style={{ fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 12px' }}>
                  Falls eine Tuya/LSC-Kamera in Home Assistant als „unavailable“ markiert ist, kann
                  hier ein frischer QR-Code für die LSC Smart Connect / Smart Life App (User-Code:{' '}
                  <code>{tuyaAuth?.storedUserCode || '—'}</code>) erzeugt werden.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <button
                    onClick={confirmTuyaQrScanned}
                    style={{
                      background: '#fafafa',
                      color: '#09090b',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    QR gescannt – Jetzt aktivieren
                  </button>
                  <button
                    onClick={refreshTuyaQrCode}
                    style={{
                      background: 'transparent',
                      color: '#a1a1aa',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Neuen QR-Code generieren
                  </button>
                </div>

                {tuyaAuth?.qrData && (
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#ffffff',
                      padding: '10px',
                      borderRadius: '4px',
                    }}
                  >
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(tuyaAuth.qrData)}`}
                      alt="Tuya QR Code"
                      style={{ width: '150px', height: '150px', display: 'block' }}
                    />
                  </div>
                )}
              </div>

              <form onSubmit={configureLocalOnvif} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#52525b',
                  }}
                >
                  LOKALER RTSP / ONVIF STREAM
                </div>
                <p style={{ fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
                  Direkte lokale RTSP/ONVIF-Einbindung über go2rtc (Port 554 / 8554):
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={onvifIp}
                    onChange={(e) => setOnvifIp(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: '#141417',
                      color: '#fafafa',
                      fontSize: '12.5px',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    <option value="192.168.188.140">192.168.188.140</option>
                    <option value="192.168.188.121">192.168.188.121</option>
                  </select>
                  <input
                    type="password"
                    placeholder="ONVIF-Passwort"
                    value={onvifPass}
                    onChange={(e) => setOnvifPass(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: '#141417',
                      color: '#fafafa',
                      fontSize: '12.5px',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    background: '#fafafa',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  Lokalen RTSP-Stream verbinden
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 4: TRIGGER CONFIGURATOR ("Objekt X >= p% => Aktion A")
           ===================================================================== */}
        {activeTab === 'triggers' && (
          <TriggerConfiguratorView
            cameras={cams}
            triggers={triggers}
            triggerLogs={triggerLogs}
            availableAxons={availableAxons}
            onSaveTrigger={handleSaveTrigger}
            onToggleTrigger={handleToggleTrigger}
            onDeleteTrigger={handleDeleteTrigger}
            onTestTrigger={handleTestTrigger}
          />
        )}

        {/* =====================================================================
            TAB 5: PERFORMANCE MONITOR (LEISTUNGSMONITOR)
           ===================================================================== */}
        {activeTab === 'perf' && (
          <PerformanceMonitorView
            perf={perfSnapshot}
            cameras={cams}
            webglStatus={webglStatus}
            onRefreshPerf={handleRefreshPerf}
            onToggleHighFreq={handleToggleHighFreq}
            highFreqEnabled={cfg?.highFreqEnabled !== false}
          />
        )}
      </div>

      {/* EDIT CAMERA MODAL (WITH PER-CAMERA THRESHOLDS & MOTION-GATE CONFIG) */}
      {editingCam && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.84)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 250,
            padding: '20px',
          }}
        >
          <form
            onSubmit={saveCameraEdit}
            style={{
              background: '#111113',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '24px',
              borderRadius: '4px',
              width: '560px',
              maxWidth: '94vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>
                Kamera & Bildanalyse konfigurieren
              </h3>
              <span
                style={{
                  fontSize: '11.5px',
                  color: '#71717a',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {editingCam.id}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
                Anzeigename
                <input
                  value={editingCam.name}
                  onChange={(e) => setEditingCam({ ...editingCam, name: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '7px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#141417',
                    color: '#fafafa',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
                Raum / Zone
                <input
                  value={editingCam.room}
                  onChange={(e) => setEditingCam({ ...editingCam, room: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '7px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#141417',
                    color: '#fafafa',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>

            <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Optimierungs-Profil
              <select
                value={editingCam.optimization_mode}
                onChange={(e) =>
                  setEditingCam({
                    ...editingCam,
                    optimization_mode: e.target.value as OptimizationMode,
                  })
                }
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '7px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  boxSizing: 'border-box',
                }}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m} – {MODE_META[m].desc}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Optionale direkte Stream-/Snapshot-URL (sonst automatisch via Home Assistant / go2rtc)
              <input
                value={editingCam.stream_url}
                placeholder="Leer lassen für Home Assistant Tuya/HLS Stream"
                onChange={(e) => setEditingCam({ ...editingCam, stream_url: e.target.value })}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '7px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end' }}>
              <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
                Heartbeat-Vollanalyse (Sekunden)
                <input
                  type="number"
                  min={15}
                  value={editingCam.sample_interval_sec}
                  onChange={(e) =>
                    setEditingCam({ ...editingCam, sample_interval_sec: Number(e.target.value) })
                  }
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '7px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#141417',
                    color: '#fafafa',
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  color: '#e4e4e7',
                  paddingBottom: '8px',
                }}
              >
                <input
                  type="checkbox"
                  checked={editingCam.enabled === 1}
                  onChange={(e) =>
                    setEditingCam({ ...editingCam, enabled: e.target.checked ? 1 : 0 })
                  }
                />
                In Hintergrund-Abtastung einbeziehen
              </label>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#71717a',
                  marginBottom: '12px',
                }}
              >
                BILDANALYSE-SCHWELLWERTE & MOTION-GATE PRO KAMERA
              </div>
              <CameraAnalysisConfigSection
                cam={editingCam}
                onChange={(patch) => setEditingCam({ ...editingCam, ...patch })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setEditingCam(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  padding: '6px 14px',
                  fontSize: '12px',
                }}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                style={{
                  background: '#fafafa',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<CameraVisionApp />);
