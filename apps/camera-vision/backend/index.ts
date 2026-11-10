import fs from 'node:fs';
import net from 'node:net';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import jpeg from 'jpeg-js';
// @ts-expect-error pngjs ships without bundled .d.ts
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
  // Per-camera analysis & threshold configuration
  min_confidence: number;
  motion_gate_enabled: number;
  motion_threshold_pct: number;
  pixel_diff_threshold: number;
  ai_input_width: number;
  log_cooldown_sec: number;
  high_freq_poll_sec: number;
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

export type VisionTriggerActionType = 'axon' | 'ha_service' | 'ha_event' | 'orchestrator_event';

export interface VisionTriggerRow {
  id: number;
  name: string;
  enabled: number;
  camera_id: string;
  object_class: string;
  min_confidence_pct: number;
  min_count: number;
  min_motion_pct: number;
  time_window: string;
  cooldown_sec: number;
  action_type: VisionTriggerActionType;
  action_target: string;
  action_payload_json: string;
  last_triggered_at: string;
  last_status: string;
  last_result: string;
  trigger_count: number;
  created_at: string;
}

export interface VisionTriggerLogRow {
  id: number;
  trigger_id: number;
  trigger_name: string;
  camera_id: string;
  camera_name: string;
  matched_object: string;
  matched_confidence_pct: number;
  matched_count: number;
  motion_pct: number;
  action_type: string;
  action_target: string;
  status: string;
  duration_ms: number;
  result_summary: string;
  fired_at: string;
}

export interface VisionConfig {
  cyclicEnabled: boolean;
  highFreqMotionLoopEnabled: boolean;
  intervalSeconds: number;
  highFreqTickMs: number;
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.8,
    pixel_diff_threshold: 26,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 3,
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 25,
    high_freq_poll_sec: 2,
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.4,
    pixel_diff_threshold: 25,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 4,
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 45,
    high_freq_poll_sec: 4,
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.8,
    pixel_diff_threshold: 26,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 4,
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
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 60,
    high_freq_poll_sec: 5,
  },
];

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat']);
const ANIMAL_CLASSES = new Set(['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'bear', 'zebra', 'giraffe']);

export const GERMAN_LABELS: Record<string, string> = {
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
  any_vehicle: 'Beliebiges Fahrzeug (Auto/LKW/Rad)',
  any_animal: 'Beliebiges Tier (Hund/Katze/Vogel)',
  any_object: 'Beliebiges Objekt',
  motion_only: 'Reine Pixel-Bewegung (ohne KI-Klasse)',
};

const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

let cocoModelPromise: Promise<cocoSsd.ObjectDetection> | null = null;
const previousLumaGrids = new Map<string, Float32Array>();

// ============================================================================
// REAL-TIME PERFORMANCE MONITOR & PIPELINE TELEMETRY TRACKER
// ============================================================================
interface CameraPerfStat {
  cameraId: string;
  framesIngested: number;
  framesDecoded: number;
  lumaChecks: number;
  cocoRuns: number;
  motionSkips: number;
  lastCaptureMs: number;
  lastDecodeMs: number;
  lastLumaMs: number;
  lastInferenceMs: number;
  lastMotionPct: number;
  lastUpdatedIso: string;
  triggersFired: number;
  recentFrameTs: number[];
}

class VisionPerformanceTracker {
  public readonly startedAtMs = Date.now();
  public readonly startedAtIso = new Date().toISOString();
  public totalFramesIngested = 0;
  public totalFramesDecoded = 0;
  public totalLumaChecks = 0;
  public totalCocoRuns = 0;
  public totalMotionGateSkips = 0;
  public totalTriggersFired = 0;

  private captureSamples: number[] = [];
  private decodeSamples: number[] = [];
  private lumaSamples: number[] = [];
  private inferenceSamples: number[] = [];
  private camStats = new Map<string, CameraPerfStat>();

  private getOrCreateCam(cameraId: string): CameraPerfStat {
    let st = this.camStats.get(cameraId);
    if (!st) {
      st = {
        cameraId,
        framesIngested: 0,
        framesDecoded: 0,
        lumaChecks: 0,
        cocoRuns: 0,
        motionSkips: 0,
        lastCaptureMs: 0,
        lastDecodeMs: 0,
        lastLumaMs: 0,
        lastInferenceMs: 0,
        lastMotionPct: 0,
        lastUpdatedIso: new Date().toISOString(),
        triggersFired: 0,
        recentFrameTs: [],
      };
      this.camStats.set(cameraId, st);
    }
    return st;
  }

  private pushSample(arr: number[], val: number, maxLen = 80) {
    arr.push(val);
    if (arr.length > maxLen) arr.shift();
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  }

  public recordRawIngest(cameraId: string, captureMs: number) {
    this.totalFramesIngested++;
    const st = this.getOrCreateCam(cameraId);
    st.framesIngested++;
    st.lastCaptureMs = captureMs;
    const now = Date.now();
    st.recentFrameTs = st.recentFrameTs.filter((t) => now - t < 10_000);
    st.recentFrameTs.push(now);
    st.lastUpdatedIso = new Date(now).toISOString();
    this.pushSample(this.captureSamples, captureMs);
  }

  public recordLumaCheck(
    cameraId: string,
    decodeMs: number,
    lumaMs: number,
    motionPct: number
  ) {
    this.totalFramesDecoded++;
    this.totalLumaChecks++;
    this.pushSample(this.decodeSamples, decodeMs);
    this.pushSample(this.lumaSamples, lumaMs);
    const st = this.getOrCreateCam(cameraId);
    st.framesDecoded++;
    st.lumaChecks++;
    st.lastDecodeMs = decodeMs;
    st.lastLumaMs = lumaMs;
    st.lastMotionPct = motionPct;
    st.lastUpdatedIso = new Date().toISOString();
  }

  public recordMotionGateSkip(cameraId: string) {
    this.totalMotionGateSkips++;
    const st = this.getOrCreateCam(cameraId);
    st.motionSkips++;
  }

  public recordCocoRun(cameraId: string, inferenceMs: number) {
    this.totalCocoRuns++;
    this.pushSample(this.inferenceSamples, inferenceMs);
    const st = this.getOrCreateCam(cameraId);
    st.cocoRuns++;
    st.lastInferenceMs = inferenceMs;
    st.lastUpdatedIso = new Date().toISOString();
  }

  public recordTriggerFired(cameraId: string) {
    this.totalTriggersFired++;
    const st = this.getOrCreateCam(cameraId);
    st.triggersFired++;
  }

  public getSnapshot(activeWorkers: Map<string, { lastAccessMs: number; frameCount: number }>) {
    const mem = process.memoryUsage();
    let tfTensors = 0;
    let tfBytesMb = 0;
    let tfBackend = 'cpu';
    try {
      const tfMem = tf.memory();
      tfTensors = tfMem.numTensors || 0;
      tfBytesMb = Math.round(((tfMem.numBytes || 0) / (1024 * 1024)) * 100) / 100;
      tfBackend = tf.getBackend() || 'cpu';
    } catch {}

    const avgInf = this.avg(this.inferenceSamples) || 180;
    const skipRatePct =
      this.totalLumaChecks > 0
        ? Math.round((this.totalMotionGateSkips / this.totalLumaChecks) * 1000) / 10
        : 0;
    const savedCpuSeconds =
      Math.round(((this.totalMotionGateSkips * avgInf) / 1000) * 10) / 10;

    const now = Date.now();
    const cameraBreakdown = Array.from(this.camStats.values()).map((c) => {
      const recent = c.recentFrameTs.filter((t) => now - t < 10_000);
      const fps =
        recent.length >= 2
          ? Math.round(
              ((recent.length - 1) / Math.max(0.5, (recent[recent.length - 1] - recent[0]) / 1000)) *
                10
            ) / 10
          : 0;
      const camSkipPct =
        c.lumaChecks > 0 ? Math.round((c.motionSkips / c.lumaChecks) * 1000) / 10 : 0;
      return {
        cameraId: c.cameraId,
        framesIngested: c.framesIngested,
        framesDecoded: c.framesDecoded,
        lumaChecks: c.lumaChecks,
        cocoRuns: c.cocoRuns,
        motionSkips: c.motionSkips,
        skipRatePct: camSkipPct,
        lastCaptureMs: c.lastCaptureMs,
        lastDecodeMs: c.lastDecodeMs,
        lastLumaMs: c.lastLumaMs,
        lastInferenceMs: c.lastInferenceMs,
        lastMotionPct: c.lastMotionPct,
        streamFps: fps,
        streamWorkerActive: activeWorkers.has(c.cameraId),
        triggersFired: c.triggersFired,
        lastUpdatedIso: c.lastUpdatedIso,
      };
    });

    return {
      startedAtIso: this.startedAtIso,
      uptimeSec: Math.round((now - this.startedAtMs) / 1000),
      activeStreamWorkers: activeWorkers.size,
      totalFramesIngested: this.totalFramesIngested,
      totalFramesDecoded: this.totalFramesDecoded,
      totalLumaChecks: this.totalLumaChecks,
      totalCocoRuns: this.totalCocoRuns,
      totalMotionGateSkips: this.totalMotionGateSkips,
      motionGateSkipRatePct: skipRatePct,
      savedCpuSeconds,
      totalTriggersFired: this.totalTriggersFired,
      avgCaptureMs: this.avg(this.captureSamples),
      avgDecodeMs: this.avg(this.decodeSamples),
      avgLumaMs: this.avg(this.lumaSamples),
      avgInferenceMs: this.avg(this.inferenceSamples),
      memory: {
        rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
        tfTensors,
        tfBytesMb,
        tfBackend,
      },
      cameraBreakdown,
    };
  }
}

const perfTracker = new VisionPerformanceTracker();

async function getLocalCocoModel(): Promise<cocoSsd.ObjectDetection> {
  const gCoco = globalThis as unknown as {
    __thassiCocoSsdModelPromise?: Promise<cocoSsd.ObjectDetection>;
    __thassiCocoLiteLoaded?: boolean;
  };
  if (gCoco.__thassiCocoSsdModelPromise && gCoco.__thassiCocoLiteLoaded) {
    cocoModelPromise = gCoco.__thassiCocoSsdModelPromise;
    return cocoModelPromise;
  }
  if (!cocoModelPromise) {
    cocoModelPromise = (async () => {
      await tf.ready();
      return await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })();
    gCoco.__thassiCocoSsdModelPromise = cocoModelPromise;
    gCoco.__thassiCocoLiteLoaded = true;
  }
  return cocoModelPromise;
}

// ============================================================================
// DEDICATED WORKER THREAD FOR NON-BLOCKING TENSORFLOW.JS CPU INFERENCE
// ============================================================================
if (!isMainThread && (workerData as { isVisionWorker?: boolean })?.isVisionWorker && parentPort) {
  let workerModelPromise: Promise<cocoSsd.ObjectDetection> | null = null;
  const getWorkerModel = () => {
    if (!workerModelPromise) {
      workerModelPromise = (async () => {
        await tf.ready();
        return await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      })();
    }
    return workerModelPromise;
  };

  parentPort.on(
    'message',
    async (msg: {
      id: number;
      type?: string;
      rgbBuffer?: ArrayBuffer;
      width?: number;
      height?: number;
      maxNumBoxes?: number;
      minScore?: number;
    }) => {
      if (msg.type === 'warmup') {
        try {
          await getWorkerModel();
          parentPort?.postMessage({ id: msg.id, ok: true, preds: [] });
        } catch (err) {
          parentPort?.postMessage({
            id: msg.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      try {
        const model = await getWorkerModel();
        const rgb = new Int32Array(msg.rgbBuffer!);
        const tensor = tf.tensor3d(rgb, [msg.height!, msg.width!, 3], 'int32');
        try {
          const preds = await model.detect(tensor, msg.maxNumBoxes ?? 20, msg.minScore ?? 0.32);
          parentPort?.postMessage({ id: msg.id, ok: true, preds });
        } finally {
          tensor.dispose();
        }
      } catch (err) {
        parentPort?.postMessage({
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );
}

interface WorkerDetectResult {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

const gWorkerState = globalThis as unknown as {
  __thassiVisionWorker?: Worker | null;
  __thassiVisionWorkerSeq?: number;
  __thassiVisionWorkerPending?: Map<
    number,
    { resolve: (preds: WorkerDetectResult[]) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >;
};

function ensureVisionWorker(): Worker | null {
  if (!isMainThread) return null;
  if (gWorkerState.__thassiVisionWorker) {
    return gWorkerState.__thassiVisionWorker;
  }
  try {
    const cleanUrl = new URL(import.meta.url.split('?')[0]);
    const worker = new Worker(cleanUrl, {
      workerData: { isVisionWorker: true },
    });
    const pending = new Map<
      number,
      { resolve: (preds: WorkerDetectResult[]) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();
    gWorkerState.__thassiVisionWorkerPending = pending;
    gWorkerState.__thassiVisionWorkerSeq = 1;

    worker.on('message', (msg: { id: number; ok: boolean; preds?: WorkerDetectResult[]; error?: string }) => {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) {
        entry.resolve(msg.preds || []);
      } else {
        entry.reject(new Error(msg.error || 'Vision worker error'));
      }
    });

    worker.on('error', (err) => {
      console.warn('[CameraVision] Worker thread error:', err.message);
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(err);
      }
      pending.clear();
      gWorkerState.__thassiVisionWorker = null;
    });

    worker.on('exit', () => {
      gWorkerState.__thassiVisionWorker = null;
    });

    worker.unref();
    gWorkerState.__thassiVisionWorker = worker;
    return worker;
  } catch (err) {
    console.warn('[CameraVision] Could not spawn worker thread, falling back:', err);
    return null;
  }
}

async function detectViaWorkerOrFallback(
  rgb: Int32Array,
  width: number,
  height: number,
  maxNumBoxes: number,
  minScore: number
): Promise<WorkerDetectResult[]> {
  const worker = ensureVisionWorker();
  if (worker && gWorkerState.__thassiVisionWorkerPending) {
    const id = (gWorkerState.__thassiVisionWorkerSeq = (gWorkerState.__thassiVisionWorkerSeq || 1) + 1);
    const pending = gWorkerState.__thassiVisionWorkerPending;
    // Copy underlying buffer so it can be transferred with zero copy overhead
    const transferredBuf = rgb.buffer.slice(rgb.byteOffset, rgb.byteOffset + rgb.byteLength);
    return new Promise<WorkerDetectResult[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Vision worker inference timeout (15s)'));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage(
        { id, rgbBuffer: transferredBuf, width, height, maxNumBoxes, minScore },
        [transferredBuf]
      );
    });
  }

  const model = await getLocalCocoModel();
  const tensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
  try {
    return await model.detect(tensor, maxNumBoxes, minScore);
  } finally {
    tensor.dispose();
  }
}

// High-false-positive indoor/background classes that require higher confidence or explicit target opt-in
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

// Tracks stationary non-person boxes per camera to suppress static background hallucinations
const staticPhantomTracker = new Map<
  string,
  Array<{ rawClass: string; x: number; y: number; w: number; h: number; staticCount: number }>
>();

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

/**
 * 2x2 area/bilinear RGB resampler from an arbitrary rectangular crop of the source RGBA buffer.
 * Preserves fine edges of distant people, vehicles, and packages compared to single-pixel point sampling.
 */
function resampleRgbaRegionToRgbBuffer(
  rgba: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  cropX0: number,
  cropY0: number,
  cropW: number,
  cropH: number,
  dstW: number,
  dstH: number
): Int32Array {
  const rgb = new Int32Array(dstW * dstH * 3);
  const scaleX = cropW / dstW;
  const scaleY = cropH / dstH;

  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.min(srcHeight - 1, Math.max(0, Math.floor(cropY0 + (y + 0.25) * scaleY)));
    const sy1 = Math.min(srcHeight - 1, Math.max(0, Math.floor(cropY0 + (y + 0.75) * scaleY)));
    const row0 = sy0 * srcWidth;
    const row1 = sy1 * srcWidth;

    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.min(srcWidth - 1, Math.max(0, Math.floor(cropX0 + (x + 0.25) * scaleX)));
      const sx1 = Math.min(srcWidth - 1, Math.max(0, Math.floor(cropX0 + (x + 0.75) * scaleX)));

      const i00 = (row0 + sx0) * 4;
      const i01 = (row0 + sx1) * 4;
      const i10 = (row1 + sx0) * 4;
      const i11 = (row1 + sx1) * 4;

      const dstIdx = (y * dstW + x) * 3;
      rgb[dstIdx] = (rgba[i00] + rgba[i01] + rgba[i10] + rgba[i11]) >> 2;
      rgb[dstIdx + 1] = (rgba[i00 + 1] + rgba[i01 + 1] + rgba[i10 + 1] + rgba[i11 + 1]) >> 2;
      rgb[dstIdx + 2] = (rgba[i00 + 2] + rgba[i01 + 2] + rgba[i10 + 2] + rgba[i11 + 2]) >> 2;
    }
  }
  return rgb;
}

function checkTcpPort(ip: string, port: number, timeoutMs = 350): Promise<boolean> {
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
): { width: number; height: number; rgba: Uint8Array; decodeMs: number } {
  const t0 = performance.now();
  const isPng =
    mimeType.includes('png') ||
    (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);

  if (isPng) {
    const parsed = PNG.sync.read(buf);
    return {
      width: parsed.width,
      height: parsed.height,
      rgba: new Uint8Array(parsed.data),
      decodeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }
  const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
  return {
    width: decoded.width,
    height: decoded.height,
    rgba: decoded.data,
    decodeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  rawClass: string;
  confidence: number;
  category: 'person' | 'vehicle' | 'animal' | 'object' | 'motion';
}

export interface FrameDiagnostics {
  luminancePct: number;
  contrastScore: number;
  sharpnessScore: number;
  lightingMode: 'Taglicht' | 'Dämmerung / Innen' | 'Nachtsicht / Dunkel';
  occlusionAlert: boolean;
  motionPct: number;
  activeMotionZone: string;
  motionBoxes: NormalizedBoundingBox[];
  lumaMs?: number;
  decodeMs?: number;
  motionGateSkipped?: boolean;
}

function analyzePixelMetricsAndMotion(
  cameraId: string,
  width: number,
  height: number,
  rgba: Uint8Array,
  gridMap: Map<string, Float32Array> = previousLumaGrids,
  pixelDiffThreshold = 25,
  decodeMs = 0
): FrameDiagnostics {
  const t0 = performance.now();
  const gridW = 48;
  const gridH = 27;
  const currentGrid = new Float32Array(gridW * gridH);

  let sumLuma = 0;
  let sumLumaSq = 0;

  // 4x4 block-averaged luminance per cell (16 samples per block) to eliminate H.264/MJPEG compression noise & single-pixel aliasing
  const cellSpanW = width / gridW;
  const cellSpanH = height / gridH;
  const subOffsets = [0.15, 0.38, 0.62, 0.85];

  for (let gy = 0; gy < gridH; gy++) {
    const baseY = gy * cellSpanH;
    for (let gx = 0; gx < gridW; gx++) {
      const baseX = gx * cellSpanW;
      let blockSum = 0;
      for (let syi = 0; syi < 4; syi++) {
        const py = Math.min(height - 1, Math.floor(baseY + subOffsets[syi] * cellSpanH));
        const rowOffset = py * width;
        for (let sxi = 0; sxi < 4; sxi++) {
          const px = Math.min(width - 1, Math.floor(baseX + subOffsets[sxi] * cellSpanW));
          const idx = (rowOffset + px) * 4;
          blockSum += 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
        }
      }
      const luma = blockSum / 16;
      currentGrid[gy * gridW + gx] = luma;
      sumLuma += luma;
      sumLumaSq += luma * luma;
    }
  }

  const n = gridW * gridH;
  const meanLuma = sumLuma / n;
  const variance = Math.max(0, sumLumaSq / n - meanLuma * meanLuma);
  const stdDev = Math.sqrt(variance);

  // Estimate sharpness via gradient magnitude on the block-averaged luma grid
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
  const sharpnessScore = Math.min(100, Math.round((edgeSum / Math.max(1, edgeCount)) * 2.8));
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
  const prevGrid = gridMap.get(cameraId);
  let motionPct = 0;
  let activeMotionZone = 'Keine Bewegung';
  const motionBoxes: NormalizedBoundingBox[] = [];
  // Enforce a sensible minimum luma delta so compression noise doesn't trigger false motion
  const effectiveDiffThreshold = Math.max(18, Math.min(80, Number(pixelDiffThreshold) || 25));

  if (prevGrid && prevGrid.length === currentGrid.length) {
    // 1. Compute global illumination shift (auto-exposure / cloud / AWB compensation)
    let prevSum = 0;
    for (let i = 0; i < n; i++) prevSum += prevGrid[i];
    const prevMeanLuma = prevSum / n;
    const globalShift = Math.max(-35, Math.min(35, meanLuma - prevMeanLuma));

    // 2. Build illumination-compensated difference grid
    const diffGrid = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      diffGrid[i] = Math.abs(currentGrid[i] - prevGrid[i] - globalShift);
    }

    let changedCells = 0;
    let weightedX = 0;
    let weightedY = 0;

    // 6x3 macro-clusters for bounding box extraction of moving objects
    const macroCols = 6;
    const macroRows = 3;
    const cellW = gridW / macroCols;
    const cellH = gridH / macroRows;
    const clusters: Array<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      count: number;
      maxDiff: number;
    }> = Array.from({ length: macroCols * macroRows }, () => ({
      minX: gridW,
      minY: gridH,
      maxX: 0,
      maxY: 0,
      count: 0,
      maxDiff: 0,
    }));

    const neighborFloor = effectiveDiffThreshold * 0.72;

    // 3. Spatial 3x3 neighbor coherence check (morphological de-speckling against isolated leaf/compression flicker)
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const diff = diffGrid[gy * gridW + gx];
        if (diff <= effectiveDiffThreshold) continue;

        let activeNeighbors = 0;
        const nyMin = Math.max(0, gy - 1);
        const nyMax = Math.min(gridH - 1, gy + 1);
        const nxMin = Math.max(0, gx - 1);
        const nxMax = Math.min(gridW - 1, gx + 1);
        for (let ny = nyMin; ny <= nyMax; ny++) {
          for (let nx = nxMin; nx <= nxMax; nx++) {
            if (nx === gx && ny === gy) continue;
            if (diffGrid[ny * gridW + nx] > neighborFloor) {
              activeNeighbors++;
            }
          }
        }

        // Require at least 2 coherent neighboring cells (or extreme local delta) to count as true physical motion
        if (activeNeighbors >= 2 || diff > effectiveDiffThreshold * 1.85) {
          changedCells++;
          weightedX += gx / gridW;
          weightedY += gy / gridH;

          const mc = Math.min(macroCols - 1, Math.floor(gx / cellW));
          const mr = Math.min(macroRows - 1, Math.floor(gy / cellH));
          const cl = clusters[mr * macroCols + mc];
          cl.count++;
          if (gx < cl.minX) cl.minX = gx;
          if (gy < cl.minY) cl.minY = gy;
          if (gx + 1 > cl.maxX) cl.maxX = gx + 1;
          if (gy + 1 > cl.maxY) cl.maxY = gy + 1;
          if (diff > cl.maxDiff) cl.maxDiff = diff;
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

      // Require at least 6 coherent moving cells in a macro-cluster before emitting a motionBox
      clusters
        .filter((c) => c.count >= 6)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .forEach((c) => {
          const padX = 1.5;
          const padY = 1.5;
          const x0 = Math.max(0, (c.minX - padX) / gridW);
          const y0 = Math.max(0, (c.minY - padY) / gridH);
          const x1 = Math.min(1, (c.maxX + padX) / gridW);
          const y1 = Math.min(1, (c.maxY + padY) / gridH);
          motionBoxes.push({
            x: Math.round(x0 * 1000) / 1000,
            y: Math.round(y0 * 1000) / 1000,
            w: Math.round(Math.max(0.08, x1 - x0) * 1000) / 1000,
            h: Math.round(Math.max(0.12, y1 - y0) * 1000) / 1000,
            label: 'Bewegung',
            rawClass: 'motion',
            confidence: Math.min(0.99, Math.round((c.maxDiff / 95) * 100) / 100),
            category: 'motion',
          });
        });
    }
  }
  gridMap.set(cameraId, currentGrid);

  const lumaMs = Math.round((performance.now() - t0) * 100) / 100;
  perfTracker.recordLumaCheck(cameraId, decodeMs, lumaMs, motionPct);

  return {
    luminancePct,
    contrastScore,
    sharpnessScore,
    lightingMode,
    occlusionAlert,
    motionPct,
    activeMotionZone,
    motionBoxes,
    lumaMs,
    decodeMs,
  };
}

export interface PipelineRunOptions {
  minConfidence?: number;
  motionGateEnabled?: boolean;
  motionThresholdPct?: number;
  pixelDiffThreshold?: number;
  aiInputWidth?: number;
  targetClassesJson?: string;
  forceAi?: boolean;
  preDecoded?: { width: number; height: number; rgba: Uint8Array; decodeMs: number };
  cachedDetection?: {
    bboxes: NormalizedBoundingBox[];
    objects: Array<{
      label: string;
      rawClass: string;
      confidence: number;
      count: number;
      details?: string;
      bboxes: NormalizedBoundingBox[];
    }>;
    sceneSummary: string;
    personCount: number;
    vehicleCount: number;
    totalObjects: number;
  } | null;
  lastAiRunAtMs?: number;
  lastPositiveObjectAtMs?: number;
  heartbeatIntervalSec?: number;
}

async function runLocalCocoSsdPipeline(
  cameraId: string,
  imageBuffer: Buffer,
  mimeType: string,
  mode: OptimizationMode,
  opts: PipelineRunOptions = {}
) {
  const decoded = opts.preDecoded || decodeImageBuffer(imageBuffer, mimeType);
  const { width, height, rgba, decodeMs } = decoded;
  const pixelDiffThreshold = opts.pixelDiffThreshold ?? 25;
  const metrics = analyzePixelMetricsAndMotion(
    cameraId,
    width,
    height,
    rgba,
    previousLumaGrids,
    pixelDiffThreshold,
    decodeMs
  );

  const motionGateEnabled = opts.motionGateEnabled ?? true;
  const motionThresholdPct = Math.max(0.8, opts.motionThresholdPct ?? 2.2);
  const nowMs = Date.now();
  const hasMotion = metrics.motionPct >= motionThresholdPct;
  const withinTrackingTail =
    opts.lastPositiveObjectAtMs !== undefined &&
    nowMs - opts.lastPositiveObjectAtMs < 10_000;
  const heartbeatDue =
    !opts.lastAiRunAtMs ||
    nowMs - opts.lastAiRunAtMs >= Math.max(45, opts.heartbeatIntervalSec ?? 180) * 1000;

  // MOTION GATE: Skip expensive COCO-SSD tensor inference when scene is static!
  if (
    motionGateEnabled &&
    !opts.forceAi &&
    !hasMotion &&
    !withinTrackingTail &&
    !heartbeatDue &&
    opts.cachedDetection
  ) {
    perfTracker.recordMotionGateSkip(cameraId);
    metrics.motionGateSkipped = true;
    return {
      objects: opts.cachedDetection.objects,
      bboxes: opts.cachedDetection.bboxes,
      metrics,
      width,
      height,
      totalObjects: opts.cachedDetection.totalObjects,
      personCount: opts.cachedDetection.personCount,
      vehicleCount: opts.cachedDetection.vehicleCount,
      motionPct: metrics.motionPct,
      sceneSummary: opts.cachedDetection.sceneSummary,
      engineUsed: `Motion-Gate Skip (Δ ${metrics.motionPct}% < ${motionThresholdPct}%)`,
      motionGateSkipped: true,
      inferenceMs: 0,
    };
  }

  // Stage 1: Full-Frame 2x2 Bilinear Resampling
  // Note: On pure-JS CPU backend in Node.js, cap full-frame tensor to 300px (native lite_mobilenet_v2 SSD size)
  // and execute inside a dedicated background worker_threads Worker so the main event loop is never blocked.
  const isPureJsCpu = tf.getBackend() === 'cpu';
  const configuredW = Math.max(224, Math.min(800, Number(opts.aiInputWidth) || 640));
  const effectiveStage1W = isPureJsCpu ? Math.min(300, configuredW) : configuredW;
  const targetW = Math.min(effectiveStage1W, width);
  const targetH = Math.max(1, Math.round((height / width) * targetW));
  const fullRgb = resampleRgbaRegionToRgbBuffer(
    rgba,
    width,
    height,
    0,
    0,
    width,
    height,
    targetW,
    targetH
  );

  const defaultMinScore = mode === 'Personen' || mode === 'Fahrzeuge' ? 0.42 : 0.45;
  const minScore = Math.max(0.25, Math.min(0.95, Number(opts.minConfidence) || defaultMinScore));
  const candidateMinScore = Math.max(0.32, minScore - 0.04);

  interface NormalizedCandidatePred {
    class: string;
    score: number;
    normX: number;
    normY: number;
    normW: number;
    normH: number;
    fromRoiZoom?: boolean;
  }

  const candidates: NormalizedCandidatePred[] = [];
  let roiZoomApplied = false;

  const tInf0 = performance.now();
  const fullPreds = await detectViaWorkerOrFallback(fullRgb, targetW, targetH, 25, candidateMinScore);
  for (const p of fullPreds) {
    const [bx, by, bw, bh] = p.bbox;
    candidates.push({
      class: p.class,
      score: p.score,
      normX: Math.max(0, Math.min(1, bx / targetW)),
      normY: Math.max(0, Math.min(1, by / targetH)),
      normW: Math.max(0.015, Math.min(1, bw / targetW)),
      normH: Math.max(0.02, Math.min(1, bh / targetH)),
      fromRoiZoom: false,
    });
  }

  // Stage 2: 2-Stage High-Resolution Motion-ROI Crop Zoom (only on non-pure-JS backends)
  if (!isPureJsCpu && metrics.motionBoxes.length > 0 && width >= 640) {
    const topMotion = metrics.motionBoxes.slice(0, 2);
    let uX0 = Math.min(...topMotion.map((m) => m.x));
    let uY0 = Math.min(...topMotion.map((m) => m.y));
    let uX1 = Math.max(...topMotion.map((m) => m.x + m.w));
    let uY1 = Math.max(...topMotion.map((m) => m.y + m.h));

    const unionArea = (uX1 - uX0) * (uY1 - uY0);
    if (unionArea < 0.62) {
      const centerX = (uX0 + uX1) / 2;
      const centerY = (uY0 + uY1) / 2;
      const roiSpan = Math.max(0.36, Math.min(0.68, Math.max(uX1 - uX0, uY1 - uY0) + 0.16));
      const roiX0 = Math.max(0, Math.min(1 - roiSpan, centerX - roiSpan / 2));
      const roiY0 = Math.max(0, Math.min(1 - roiSpan, centerY - roiSpan / 2));
      const roiW = Math.min(1 - roiX0, roiSpan);
      const roiH = Math.min(1 - roiY0, roiSpan);

      const cropPxX = Math.floor(roiX0 * width);
      const cropPxY = Math.floor(roiY0 * height);
      const cropPxW = Math.max(160, Math.floor(roiW * width));
      const cropPxH = Math.max(120, Math.floor(roiH * height));
      const roiDstW = Math.min(320, cropPxW);
      const roiDstH = Math.max(120, Math.round((cropPxH / cropPxW) * roiDstW));

      const roiRgb = resampleRgbaRegionToRgbBuffer(
        rgba,
        width,
        height,
        cropPxX,
        cropPxY,
        cropPxW,
        cropPxH,
        roiDstW,
        roiDstH
      );
      const roiPreds = await detectViaWorkerOrFallback(roiRgb, roiDstW, roiDstH, 15, candidateMinScore);
      roiZoomApplied = true;
      for (const rp of roiPreds) {
        const [rx, ry, rw, rh] = rp.bbox;
        const touchesCropEdge =
          rx <= 2 || ry <= 2 || rx + rw >= roiDstW - 2 || ry + rh >= roiDstH - 2;
        if (touchesCropEdge && rp.score < minScore + 0.08) continue;

        candidates.push({
          class: rp.class,
          score: rp.score,
          normX: Math.max(0, Math.min(1, roiX0 + (rx / roiDstW) * roiW)),
          normY: Math.max(0, Math.min(1, roiY0 + (ry / roiDstH) * roiH)),
          normW: Math.max(0.015, Math.min(1, (rw / roiDstW) * roiW)),
          normH: Math.max(0.02, Math.min(1, (rh / roiDstH) * roiH)),
          fromRoiZoom: true,
        });
      }
    }
  }

  const inferenceMs = Math.round(performance.now() - tInf0);
  perfTracker.recordCocoRun(cameraId, inferenceMs);

  let allowedClasses: Set<string> | null = null;
  if (opts.targetClassesJson) {
    try {
      const parsed = JSON.parse(opts.targetClassesJson);
      if (Array.isArray(parsed) && parsed.length > 0 && mode !== 'Objekte') {
        allowedClasses = new Set(parsed.map((c: unknown) => String(c).toLowerCase()));
      }
    } catch {}
  }

  // Filter by class, smart confidence floor, and geometry sanity checks
  const validCandidates = candidates
    .filter((c) => {
      const area = c.normW * c.normH;
      // Reject full-screen lens flares (>82% of frame) or tiny noise slivers
      if (area > 0.82 || c.normW < 0.015 || c.normH < 0.02) return false;

      const isClutter = CLUTTER_BACKGROUND_CLASSES.has(c.class);
      const classMinScore = isClutter
        ? Math.max(minScore, 0.62)
        : c.class === 'person' || VEHICLE_CLASSES.has(c.class) || ANIMAL_CLASSES.has(c.class)
          ? minScore
          : Math.max(minScore, 0.48);

      if (c.score < classMinScore) return false;

      if (mode === 'Personen') return c.class === 'person';
      if (mode === 'Fahrzeuge') return VEHICLE_CLASSES.has(c.class) || c.class === 'person';
      if (mode === 'Aktivitäten') {
        if (allowedClasses) return allowedClasses.has(c.class);
        return !isClutter;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score);

  // Non-Maximum Suppression (IoU deduplication across Full-Frame + ROI-Zoom stages)
  const dedupedPreds: NormalizedCandidatePred[] = [];
  for (const cand of validCandidates) {
    const candBox = { x: cand.normX, y: cand.normY, w: cand.normW, h: cand.normH };
    const duplicate = dedupedPreds.some(
      (existing) =>
        existing.class === cand.class &&
        computeBoxIoU(candBox, {
          x: existing.normX,
          y: existing.normY,
          w: existing.normW,
          h: existing.normH,
        }) > 0.45
    );
    if (!duplicate) {
      dedupedPreds.push(cand);
    }
  }

  // Static background phantom suppression (suppresses non-person objects that never move in static scenes)
  const prevPhantoms = staticPhantomTracker.get(cameraId) || [];
  const nextPhantoms: Array<{
    rawClass: string;
    x: number;
    y: number;
    w: number;
    h: number;
    staticCount: number;
  }> = [];

  const filteredPreds = dedupedPreds.filter((p) => {
    const pBox = { x: p.normX, y: p.normY, w: p.normW, h: p.normH };
    const matchedPrev = prevPhantoms.find(
      (prev) => prev.rawClass === p.class && computeBoxIoU(pBox, prev) > 0.86
    );
    const staticCount = matchedPrev ? matchedPrev.staticCount + 1 : 1;
    nextPhantoms.push({
      rawClass: p.class,
      ...pBox,
      staticCount,
    });

    // If a non-person object sits completely motionless for >= 4 checks while the camera is in Aktivitäten mode and confidence < 0.70, suppress it
    if (
      p.class !== 'person' &&
      mode === 'Aktivitäten' &&
      staticCount >= 4 &&
      metrics.motionPct < motionThresholdPct &&
      p.score < 0.7
    ) {
      return false;
    }
    return true;
  });
  staticPhantomTracker.set(cameraId, nextPhantoms.slice(0, 20));

  // Extract normalized bounding boxes for live stream overlay
  const bboxes: NormalizedBoundingBox[] = filteredPreds.map((p) => {
    const category: NormalizedBoundingBox['category'] =
      p.class === 'person'
        ? 'person'
        : VEHICLE_CLASSES.has(p.class)
          ? 'vehicle'
          : ANIMAL_CLASSES.has(p.class)
            ? 'animal'
            : 'object';
    return {
      x: Math.round(p.normX * 1000) / 1000,
      y: Math.round(p.normY * 1000) / 1000,
      w: Math.round(p.normW * 1000) / 1000,
      h: Math.round(p.normH * 1000) / 1000,
      label: GERMAN_LABELS[p.class] || p.class,
      rawClass: p.class,
      confidence: Math.round(p.score * 100) / 100,
      category,
    };
  });

  // Group objects by class + position
  const grouped = new Map<
    string,
    {
      label: string;
      rawClass: string;
      confidence: number;
      count: number;
      positions: string[];
      bboxes: NormalizedBoundingBox[];
    }
  >();

  for (let i = 0; i < filteredPreds.length; i++) {
    const p = filteredPreds[i];
    const box = bboxes[i];
    const centerX = p.normX + p.normW / 2;
    const posH = centerX < 0.35 ? 'links' : centerX > 0.65 ? 'rechts' : 'mitte';
    const areaPct = Math.max(1, Math.round(p.normW * p.normH * 100));
    const zoomTag = p.fromRoiZoom ? ' [ROI-Zoom]' : '';
    const deLabel = GERMAN_LABELS[p.class] || p.class;

    const existing = grouped.get(p.class);
    if (existing) {
      existing.count += 1;
      existing.confidence = Math.max(existing.confidence, Math.round(p.score * 100) / 100);
      existing.positions.push(`${posH} (${areaPct}%)${zoomTag}`);
      existing.bboxes.push(box);
    } else {
      grouped.set(p.class, {
        label: deLabel,
        rawClass: p.class,
        confidence: Math.round(p.score * 100) / 100,
        count: 1,
        positions: [`${posH} (${areaPct}%)${zoomTag}`],
        bboxes: [box],
      });
    }
  }

  const objects = Array.from(grouped.values()).map((g) => ({
    label: g.label,
    rawClass: g.rawClass,
    confidence: g.confidence,
    count: g.count,
    details: g.positions.join(', '),
    bboxes: g.bboxes,
  }));

  const personCount = filteredPreds.filter((p) => p.class === 'person').length;
  const vehicleCount = filteredPreds.filter((p) => VEHICLE_CLASSES.has(p.class)).length;
  const totalObjects = objects.reduce((acc, o) => acc + o.count, 0);

  // Build tailored German summary according to OptimizationMode
  let sceneSummary = '';
  if (mode === 'Personen') {
    sceneSummary =
      personCount > 0
        ? `${personCount} ${personCount === 1 ? 'Person' : 'Personen'} im Sichtfeld erkannt (${objects[0]?.details || 'Mitte'})`
        : `Keine Personen im Sichtfeld (${metrics.lightingMode}, Helligkeit ${metrics.luminancePct}%)`;
  } else if (mode === 'Fahrzeuge') {
    sceneSummary =
      vehicleCount > 0
        ? `${vehicleCount} ${vehicleCount === 1 ? 'Fahrzeug' : 'Fahrzeuge'} erkannt (${objects.map((o) => `${o.count}× ${o.label}`).join(', ')})`
        : personCount > 0
          ? `Keine Fahrzeuge, aber ${personCount} Person(en) erkannt`
          : `Freie Fläche – keine Fahrzeuge erkannt (${metrics.lightingMode})`;
  } else if (mode === 'Kamera') {
    sceneSummary = metrics.occlusionAlert
      ? `Kamera-Warnung: Niedriger Kontrast/Schärfe (${metrics.sharpnessScore}% Schärfe, ${metrics.luminancePct}% Helligkeit)`
      : `Optik OK · Schärfe ${metrics.sharpnessScore}% · Kontrast ${metrics.contrastScore}% · ${metrics.lightingMode} (${metrics.luminancePct}%)`;
  } else if (mode === 'Aktivitäten') {
    if (metrics.motionPct >= motionThresholdPct || personCount > 0) {
      sceneSummary = `Aktivität (Δ ${metrics.motionPct}%, Zone: ${metrics.activeMotionZone})${totalObjects > 0 ? ` · ${objects.map((o) => `${o.count}× ${o.label}`).join(', ')}` : ''}`;
    } else {
      sceneSummary = `Ruhige Szene (Δ ${metrics.motionPct}%)${totalObjects > 0 ? ` · ${objects.map((o) => `${o.count}× ${o.label}`).join(', ')}` : ''}`;
    }
  } else {
    // 'Objekte'
    sceneSummary =
      totalObjects > 0
        ? `${totalObjects} ${totalObjects === 1 ? 'Objekt' : 'Objekte'}: ${objects.map((o) => `${o.count}× ${o.label} (${Math.round(o.confidence * 100)}%)`).join(', ')}`
        : `Keine Zielobjekte erkannt (${metrics.lightingMode}, Schärfe ${metrics.sharpnessScore}%)`;
  }

  return {
    objects,
    bboxes,
    metrics,
    width,
    height,
    totalObjects,
    personCount,
    vehicleCount,
    motionPct: metrics.motionPct,
    sceneSummary,
    engineUsed: `MobileNetV2 (${mode}, ${targetW}px${roiZoomApplied ? ' + ROI-Zoom' : ''})`,
    motionGateSkipped: false,
    inferenceMs,
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

function isWithinTimeWindow(timeWindow: string, now = new Date()): boolean {
  const tw = (timeWindow || 'always').trim().toLowerCase();
  if (!tw || tw === 'always') return true;
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  if (tw === 'night') {
    // 22:00 - 06:00
    return curMinutes >= 22 * 60 || curMinutes < 6 * 60;
  }
  if (tw === 'day') {
    // 06:00 - 22:00
    return curMinutes >= 6 * 60 && curMinutes < 22 * 60;
  }
  const customMatch = tw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (customMatch) {
    const startM = Number(customMatch[1]) * 60 + Number(customMatch[2]);
    const endM = Number(customMatch[3]) * 60 + Number(customMatch[4]);
    if (startM <= endM) {
      return curMinutes >= startM && curMinutes <= endM;
    }
    return curMinutes >= startM || curMinutes <= endM;
  }
  return true;
}

function interpolateTriggerTemplate(
  raw: string,
  vars: Record<string, string | number>
): string {
  if (!raw) return '';
  let out = raw;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v));
  }
  return out;
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
      last_error TEXT NOT NULL DEFAULT '',
      min_confidence REAL NOT NULL DEFAULT 0.25,
      motion_gate_enabled INTEGER NOT NULL DEFAULT 1,
      motion_threshold_pct REAL NOT NULL DEFAULT 0.8,
      pixel_diff_threshold INTEGER NOT NULL DEFAULT 15,
      ai_input_width INTEGER NOT NULL DEFAULT 300,
      log_cooldown_sec INTEGER NOT NULL DEFAULT 30,
      high_freq_poll_sec INTEGER NOT NULL DEFAULT 3
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

    CREATE TABLE IF NOT EXISTS vision_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      camera_id TEXT NOT NULL DEFAULT '*',
      object_class TEXT NOT NULL DEFAULT 'person',
      min_confidence_pct INTEGER NOT NULL DEFAULT 60,
      min_count INTEGER NOT NULL DEFAULT 1,
      min_motion_pct REAL NOT NULL DEFAULT 0,
      time_window TEXT NOT NULL DEFAULT 'always',
      cooldown_sec INTEGER NOT NULL DEFAULT 60,
      action_type TEXT NOT NULL DEFAULT 'axon',
      action_target TEXT NOT NULL DEFAULT 'ha.call_service',
      action_payload_json TEXT NOT NULL DEFAULT '{}',
      last_triggered_at TEXT NOT NULL DEFAULT '',
      last_status TEXT NOT NULL DEFAULT 'idle',
      last_result TEXT NOT NULL DEFAULT '',
      trigger_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vision_trigger_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_id INTEGER NOT NULL,
      trigger_name TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      camera_name TEXT NOT NULL,
      matched_object TEXT NOT NULL,
      matched_confidence_pct INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      motion_pct REAL NOT NULL DEFAULT 0,
      action_type TEXT NOT NULL,
      action_target TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      result_summary TEXT NOT NULL DEFAULT '',
      fired_at TEXT NOT NULL
    );
  `);

  // Safe schema migrations for existing tables
  const camCols = ctx.db
    .query<{ name: string }>('PRAGMA table_info(camera_sources)')
    .map((c) => c.name);
  const addCamCol = (col: string, defSql: string) => {
    if (!camCols.includes(col)) {
      ctx.db.exec(`ALTER TABLE camera_sources ADD COLUMN ${col} ${defSql};`);
    }
  };
  addCamCol('optimization_mode', `TEXT NOT NULL DEFAULT 'Personen'`);
  addCamCol('min_confidence', `REAL NOT NULL DEFAULT 0.25`);
  addCamCol('motion_gate_enabled', `INTEGER NOT NULL DEFAULT 1`);
  addCamCol('motion_threshold_pct', `REAL NOT NULL DEFAULT 0.8`);
  addCamCol('pixel_diff_threshold', `INTEGER NOT NULL DEFAULT 15`);
  addCamCol('ai_input_width', `INTEGER NOT NULL DEFAULT 300`);
  addCamCol('log_cooldown_sec', `INTEGER NOT NULL DEFAULT 30`);
  addCamCol('high_freq_poll_sec', `INTEGER NOT NULL DEFAULT 3`);

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
  ctx.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_vision_detections_cam_id ON vision_detections(camera_id, id DESC);`
  );

  function seedCamerasAndTriggers() {
    const count =
      ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM camera_sources')?.cnt ?? 0;
    if (count === 0) {
      for (const c of DEFAULT_CAMERAS) {
        ctx.db.execute(
          `INSERT INTO camera_sources
           (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error, min_confidence, motion_gate_enabled, motion_threshold_pct, pixel_diff_threshold, ai_input_width, log_cooldown_sec, high_freq_poll_sec)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '', ?, ?, ?, ?, ?, ?, ?)`,
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
            c.min_confidence,
            c.motion_gate_enabled,
            c.motion_threshold_pct,
            c.pixel_diff_threshold,
            c.ai_input_width,
            c.log_cooldown_sec,
            c.high_freq_poll_sec,
          ]
        );
      }
    }

    const trigCount =
      ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM vision_triggers')?.cnt ?? 0;
    if (trigCount === 0) {
      const nowIso = new Date().toISOString();
      const starterTriggers = [
        {
          name: 'Person im Eingangsbereich erkannt (>= 65%)',
          enabled: 1,
          camera_id: 'camera.cam_eg_vz_eingang',
          object_class: 'person',
          min_confidence_pct: 65,
          min_count: 1,
          min_motion_pct: 0.5,
          time_window: 'always',
          cooldown_sec: 60,
          action_type: 'axon',
          action_target: 'ha.call_service',
          action_payload_json: JSON.stringify({
            domain: 'persistent_notification',
            service: 'create',
            targetOrMessage:
              '[Vision Trigger] {{count}}× {{object_label}} ({{confidence_pct}}%) auf {{camera_name}} ({{room}}) erkannt · Δ {{motion_pct}}%',
          }),
        },
        {
          name: 'Fahrzeug auf Parkplatz / Werkstatt (>= 60%)',
          enabled: 1,
          camera_id: 'camera.garten_parkplatz_kamera',
          object_class: 'any_vehicle',
          min_confidence_pct: 60,
          min_count: 1,
          min_motion_pct: 0.6,
          time_window: 'always',
          cooldown_sec: 120,
          action_type: 'axon',
          action_target: 'system.notes.manage',
          action_payload_json: JSON.stringify({
            action: 'add',
            content:
              '[Vision-Trigger Parkplatz] {{count}}× {{object_label}} ({{confidence_pct}}%) um {{timestamp}} erkannt ({{scene_summary}})',
          }),
        },
        {
          name: 'Nacht-Alarm: Person erkannt -> Vorzimmer Alert-LED',
          enabled: 0,
          camera_id: '*',
          object_class: 'person',
          min_confidence_pct: 55,
          min_count: 1,
          min_motion_pct: 0.5,
          time_window: 'night',
          cooldown_sec: 90,
          action_type: 'ha_service',
          action_target: 'light.turn_on',
          action_payload_json: JSON.stringify({
            entity_id: 'light.vorzimmer_og_alert_led',
            brightness_pct: 100,
          }),
        },
      ];

      for (const t of starterTriggers) {
        ctx.db.execute(
          `INSERT INTO vision_triggers
           (name, enabled, camera_id, object_class, min_confidence_pct, min_count, min_motion_pct, time_window, cooldown_sec, action_type, action_target, action_payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.name,
            t.enabled,
            t.camera_id,
            t.object_class,
            t.min_confidence_pct,
            t.min_count,
            t.min_motion_pct,
            t.time_window,
            t.cooldown_sec,
            t.action_type,
            t.action_target,
            t.action_payload_json,
            nowIso,
          ]
        );
      }
    }
  }
  seedCamerasAndTriggers();

  // One-time migration: Upgrade legacy low thresholds (0.22-0.25 conf, 0.6-1.0% motion, 14-18 pixel diff, 300px width)
  // to calibrated v2 values (0.45 conf, 2.2-2.8% motion, 24-26 pixel diff, 640px bilinear + ROI zoom)
  if (!ctx.db.kvGet<boolean>('vision_v2_motion_coco_upgrade')) {
    ctx.db.execute(
      `UPDATE camera_sources
       SET min_confidence = CASE WHEN min_confidence <= 0.30 THEN 0.45 ELSE min_confidence END,
           motion_threshold_pct = CASE
             WHEN motion_threshold_pct <= 1.2 AND (room LIKE '%Außen%' OR room LIKE '%Garten%' OR room LIKE '%Werkstatt%') THEN 2.8
             WHEN motion_threshold_pct <= 1.2 THEN 2.2
             ELSE motion_threshold_pct
           END,
           pixel_diff_threshold = CASE
             WHEN pixel_diff_threshold <= 18 AND (room LIKE '%Außen%' OR room LIKE '%Garten%' OR room LIKE '%Werkstatt%') THEN 26
             WHEN pixel_diff_threshold <= 18 THEN 24
             ELSE pixel_diff_threshold
           END,
           ai_input_width = CASE WHEN ai_input_width <= 320 THEN 640 ELSE ai_input_width END`
    );
    ctx.db.kvSet('vision_v2_motion_coco_upgrade', true);
  }

  // Prune historical vision_detections table bloat using O(1) primary-key range so SQLite queries stay under 2ms
  try {
    ctx.db.execute(
      `DELETE FROM vision_detections WHERE id <= (SELECT IFNULL(MAX(id), 0) - 120 FROM vision_detections)`
    );
    ctx.db.execute(
      `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= (SELECT IFNULL(MAX(id), 0) - 30 FROM vision_detections) AND snapshot_b64 != ''`
    );
  } catch {}

  // Free any stale main-thread TF.js model tensors from older hot-reloads and warm up background worker thread
  try {
    const gOld = globalThis as unknown as { __thassiCocoSsdModelPromise?: unknown; __thassiCocoLiteLoaded?: boolean };
    if (gOld.__thassiCocoSsdModelPromise && !gOld.__thassiCocoLiteLoaded) {
      delete gOld.__thassiCocoSsdModelPromise;
      tf.disposeVariables();
    }
  } catch {}
  ensureVisionWorker();

  function getConfig(): VisionConfig {
    const saved = ctx.db.kvGet<Partial<VisionConfig>>('vision_config') || {};
    return {
      cyclicEnabled: saved.cyclicEnabled ?? true,
      highFreqMotionLoopEnabled: saved.highFreqMotionLoopEnabled ?? true,
      intervalSeconds: saved.intervalSeconds ?? 180,
      highFreqTickMs: saved.highFreqTickMs ?? 2500,
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

  const hlsStreamCache = new Map<string, { hlsUrl: string; registeredAt: number }>();
  const liveLumaGrids = new Map<string, Float32Array>();

  // Ultra-fast raw JPEG buffer cache (updated at 15-25 FPS with 0ms CPU decode cost!)
  const rawStreamBufferCache = new Map<
    string,
    {
      buffer: Buffer;
      mimeType: string;
      method: string;
      capturedAt: string;
      capturedAtMs: number;
      captureMs: number;
      frameSeq: number;
    }
  >();

  // Decoded & Luma-analyzed frame cache (throttled to max ~2 FPS per active stream)
  const liveFrameCache = new Map<
    string,
    {
      buffer: Buffer;
      b64: string;
      mimeType: string;
      width: number;
      height: number;
      metrics: FrameDiagnostics;
      method: string;
      capturedAt: string;
      capturedAtMs: number;
      captureMs: number;
      frameSeq: number;
    }
  >();

  const latestDetectionBoxesCache = new Map<
    string,
    {
      bboxes: NormalizedBoundingBox[];
      objects: Array<{
        label: string;
        rawClass: string;
        confidence: number;
        count: number;
        details?: string;
        bboxes: NormalizedBoundingBox[];
      }>;
      sceneSummary: string;
      personCount: number;
      vehicleCount: number;
      totalObjects: number;
      processingMs: number;
      updatedAt: string;
      motionGateSkipped?: boolean;
    }
  >();

  const lastAiRunAtMsMap = new Map<string, number>();
  const lastPositiveObjectAtMsMap = new Map<string, number>();
  const lastDbLogAtMsMap = new Map<string, number>();
  const lastHighFreqPollAtMsMap = new Map<string, number>();
  const lanStatusCache = new Map<
    string,
    { checkedAtMs: number; port6668: boolean; port554: boolean }
  >();

  const inFlightFrameRequests = new Map<string, Promise<unknown>>();
  const inFlightDetectRequests = new Map<string, Promise<unknown>>();
  const activeStreamWorkers = new Map<
    string,
    { lastAccessMs: number; abort: AbortController; frameCount: number }
  >();

  /**
   * Decoupled MJPEG frame ingest:
   * 1. Always stores the raw JPEG buffer immediately (0ms CPU) so `/frame.jpg` streams smoothly at full framerate.
   * 2. Only runs JPEG decode + 48x27 Luma motion check if >= 480ms have elapsed since the last decode for this camera.
   */
  function ingestStreamJpegBuffer(cam: CameraSourceRow, jpegBuf: Buffer, methodLabel: string) {
    try {
      if (jpegBuf.byteLength < 250) return;
      const nowMs = Date.now();
      const prevRaw = rawStreamBufferCache.get(cam.id);
      const captureMs = prevRaw
        ? Math.max(25, Math.min(2500, nowMs - prevRaw.capturedAtMs))
        : 120;
      const frameSeq = (prevRaw?.frameSeq || 0) + 1;
      const nowIso = new Date(nowMs).toISOString();

      rawStreamBufferCache.set(cam.id, {
        buffer: jpegBuf,
        mimeType: 'image/jpeg',
        method: methodLabel,
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq,
      });
      perfTracker.recordRawIngest(cam.id, captureMs);

      // Throttle synchronous CPU JPEG decoding on incoming MJPEG streams to at most ~2 Hz (every 480ms)
      const prevDecoded = liveFrameCache.get(cam.id);
      if (prevDecoded && nowMs - prevDecoded.capturedAtMs < 480) {
        return;
      }

      const { width, height, rgba, decodeMs } = decodeImageBuffer(jpegBuf, 'image/jpeg');
      const metrics = analyzePixelMetricsAndMotion(
        cam.id,
        width,
        height,
        rgba,
        liveLumaGrids,
        cam.pixel_diff_threshold ?? 15,
        decodeMs
      );
      const b64 = jpegBuf.toString('base64');

      liveFrameCache.set(cam.id, {
        buffer: jpegBuf,
        b64,
        mimeType: 'image/jpeg',
        width,
        height,
        metrics,
        method: methodLabel,
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq,
      });
    } catch {
      // Ignore malformed partial frame
    }
  }

  function ensureLiveStreamWorker(cam: CameraSourceRow) {
    if (!cam.id.startsWith('camera.')) return;
    const existing = activeStreamWorkers.get(cam.id);
    if (existing) {
      existing.lastAccessMs = Date.now();
      return;
    }

    const { haUrl, haToken } = getHaConnection();
    if (!haToken) return;

    const abort = new AbortController();
    const state = { lastAccessMs: Date.now(), abort, frameCount: 0 };
    activeStreamWorkers.set(cam.id, state);

    const idleTimer = setInterval(() => {
      if (Date.now() - state.lastAccessMs > 45_000) {
        clearInterval(idleTimer);
        activeStreamWorkers.delete(cam.id);
        try {
          abort.abort();
        } catch {}
      }
    }, 5000);

    void (async () => {
      try {
        const streamUrl = `${haUrl}/api/camera_proxy_stream/${encodeURIComponent(cam.id)}`;
        const res = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${haToken}` },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        let acc = Buffer.alloc(0);

        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          acc = acc.length === 0 ? Buffer.from(value) : Buffer.concat([acc, Buffer.from(value)]);

          // Fast native C++ Buffer.indexOf marker extraction instead of O(N^2) JS loops
          while (acc.length > 512) {
            const soi = acc.indexOf(JPEG_SOI);
            if (soi === -1) {
              if (acc.length > 4096) acc = acc.subarray(acc.length - 16);
              break;
            }
            if (soi > 0) {
              acc = acc.subarray(soi);
            }
            if (acc.length < 260) break;

            const eoiIdx = acc.indexOf(JPEG_EOI, 256);
            if (eoiIdx === -1) {
              if (acc.length > 2_000_000) acc = Buffer.alloc(0);
              break;
            }

            const frameEnd = eoiIdx + 2;
            const jpegFrame = Buffer.from(acc.subarray(0, frameEnd));
            acc = acc.subarray(frameEnd);
            state.frameCount++;
            ingestStreamJpegBuffer(cam, jpegFrame, 'ha_mjpeg_stream');
          }
        }
      } catch {
        // Stream closed or aborted
      } finally {
        clearInterval(idleTimer);
        activeStreamWorkers.delete(cam.id);
      }
    })();
  }

  async function grabFrameViaGo2RtcHls(
    camId: string,
    haUrl: string,
    haToken: string,
    go2rtcBaseUrl: string
  ): Promise<{ ok: boolean; buffer?: Buffer; mimeType?: string; method?: string; hlsUrl?: string }> {
    const now = Date.now();
    const cached = hlsStreamCache.get(camId);

    const tryFetchFromGo2Rtc = async (src: string, methodLabel: string) => {
      try {
        const go2Url = `${go2rtcBaseUrl}/api/frame.jpeg?src=${encodeURIComponent(src)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(6500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: methodLabel };
          }
        }
      } catch {
        // ignore
      }
      return { ok: false };
    };

    if (cached && now - cached.registeredAt < 240_000) {
      const fastRes = await tryFetchFromGo2Rtc(cached.hlsUrl, 'go2rtc_hls_cached');
      if (fastRes.ok && fastRes.buffer) {
        return { ...fastRes, hlsUrl: cached.hlsUrl };
      }
      hlsStreamCache.delete(camId);
    }

    const freshHlsUrl = await requestHaHlsStreamUrl(haUrl, haToken, camId);
    if (!freshHlsUrl) return { ok: false };

    hlsStreamCache.set(camId, { hlsUrl: freshHlsUrl, registeredAt: Date.now() });

    try {
      await fetch(
        `${go2rtcBaseUrl}/api/streams?name=${encodeURIComponent(camId)}&src=${encodeURIComponent(freshHlsUrl)}`,
        { method: 'PUT', signal: AbortSignal.timeout(2000) }
      );
    } catch {
      // ignore
    }

    const freshRes = await tryFetchFromGo2Rtc(freshHlsUrl, 'ha_hls_go2rtc');
    if (freshRes.ok && freshRes.buffer) {
      return { ...freshRes, hlsUrl: freshHlsUrl };
    }
    return { ok: false };
  }

  let cachedHaCameraStates: { fetchedAtMs: number; map: Map<string, string> } = {
    fetchedAtMs: 0,
    map: new Map(),
  };
  const cameraProxyBackoffMap = new Map<string, { untilMs: number; reason: string }>();

  async function getCachedHaCameraStateMap(): Promise<Map<string, string>> {
    const now = Date.now();
    if (now - cachedHaCameraStates.fetchedAtMs < 20_000 && cachedHaCameraStates.map.size > 0) {
      return cachedHaCameraStates.map;
    }
    const states = await ctx.ha.getStates('camera').catch(() => []);
    const map = new Map<string, string>();
    for (const s of states) {
      map.set(s.entity_id, s.state);
    }
    cachedHaCameraStates = { fetchedAtMs: now, map };
    return map;
  }

  async function acquireCameraSnapshot(
    cam: CameraSourceRow,
    cfg: VisionConfig
  ): Promise<{ ok: boolean; buffer?: Buffer; mimeType?: string; method?: string; error?: string }> {
    const { haUrl, haToken } = getHaConnection();
    const go2Base = cfg.go2rtcUrl.replace(/\/+$/, '');

    // 0. If an active live stream worker already pushed a fresh raw frame within the last 1.8s, return it immediately!
    const rawCached = rawStreamBufferCache.get(cam.id);
    if (rawCached && Date.now() - rawCached.capturedAtMs < 1800) {
      return {
        ok: true,
        buffer: rawCached.buffer,
        mimeType: rawCached.mimeType,
        method: rawCached.method,
      };
    }

    // 1. Custom stream_url (direct HTTP image or via go2rtc ffmpeg frame extractor)
    if (cam.stream_url && cam.stream_url.trim()) {
      const url = cam.stream_url.trim();
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
          const ct = r.headers.get('content-type') || '';
          if (r.ok && ct.startsWith('image/')) {
            const buf = Buffer.from(await r.arrayBuffer());
            perfTracker.recordRawIngest(cam.id, 120);
            return {
              ok: true,
              buffer: buf,
              mimeType: ct.split(';')[0],
              method: 'direct_http',
            };
          }
        }
        const go2Url = `${go2Base}/api/frame.jpeg?src=${encodeURIComponent(url)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(4500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            perfTracker.recordRawIngest(cam.id, 140);
            return { ok: true, buffer: buf, mimeType: 'image/jpeg', method: 'go2rtc_frame' };
          }
        }
      } catch {
        // Fallback to HA methods
      }
    }

    // 2. Pre-check Home Assistant camera entity availability & failure backoff BEFORE hitting /api/camera_proxy or haffmpeg
    if (cam.id.startsWith('camera.')) {
      const stateMap = await getCachedHaCameraStateMap();
      const haState = stateMap.get(cam.id);
      if (!haState || haState === 'unavailable' || haState === 'unknown') {
        const lan6668 = cam.lan_ip ? await checkTcpPort(cam.lan_ip, 6668, 300) : false;
        return {
          ok: false,
          error: lan6668
            ? `Kamera im WLAN aktiv (${cam.lan_ip}:6668) – wartet auf Tuya QR-Code Re-Authentifizierung in Home Assistant`
            : `Kamera in Home Assistant '${haState || 'nicht geladen'}' (Tuya QR-Code Re-Auth ausstehend oder Kamera ausgeschaltet)`,
        };
      }

      const backoff = cameraProxyBackoffMap.get(cam.id);
      if (backoff && Date.now() < backoff.untilMs) {
        return {
          ok: false,
          error: backoff.reason,
        };
      }
    }

    // 3. Home Assistant /api/camera_proxy/<entity_id> (with 4.5s timeout and 90s circuit-breaker backoff on failure)
    if (cam.id.startsWith('camera.') && haToken) {
      try {
        const t0 = Date.now();
        const proxyUrl = `${haUrl}/api/camera_proxy/${encodeURIComponent(cam.id)}`;
        const r = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${haToken}` },
          signal: AbortSignal.timeout(4500),
        });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.byteLength > 200) {
            cameraProxyBackoffMap.delete(cam.id);
            perfTracker.recordRawIngest(cam.id, Date.now() - t0);
            return {
              ok: true,
              buffer: buf,
              mimeType: ct.split(';')[0],
              method: 'ha_camera_proxy',
            };
          }
        }
      } catch {
        // Do not fall back to requestHaHlsStreamUrl ('camera/stream') when camera_proxy fails,
        // because dead Tuya RTSPS streams cause HA Core haffmpeg coroutine RuntimeErrors!
      }

      const errReason = `Kein Einzelbild von ${cam.id} abrufbar (Tuya Cloud-Stream 404/Timeout – 90s Backoff aktiv)`;
      cameraProxyBackoffMap.set(cam.id, {
        untilMs: Date.now() + 90_000,
        reason: errReason,
      });
      return {
        ok: false,
        error: errReason,
      };
    }

    return {
      ok: false,
      error: `Kein Einzelbild von ${cam.id} abrufbar (Stream nicht erreichbar)`,
    };
  }

  // ============================================================================
  // TRIGGER EVALUATION & EXECUTION ENGINE (THASSI AXONS / HA / ORCHESTRATOR)
  // ============================================================================
  async function executeSingleTriggerAction(
    trig: VisionTriggerRow,
    cam: CameraSourceRow,
    matchInfo: {
      matchedClass: string;
      matchedLabel: string;
      confidencePct: number;
      count: number;
      motionPct: number;
      sceneSummary: string;
    },
    appCtx: ThassiAppContext,
    isDryRunTest = false
  ): Promise<{ ok: boolean; status: 'success' | 'error'; summary: string; durationMs: number }> {
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    const vars: Record<string, string | number> = {
      camera_id: cam.id,
      camera_name: cam.name,
      room: cam.room,
      object_class: matchInfo.matchedClass,
      object_label: matchInfo.matchedLabel,
      confidence_pct: matchInfo.confidencePct,
      count: matchInfo.count,
      motion_pct: matchInfo.motionPct,
      scene_summary: matchInfo.sceneSummary,
      trigger_name: trig.name,
      timestamp: new Date().toLocaleTimeString('de-AT'),
      iso_timestamp: nowIso,
    };

    const interpolatedRaw = interpolateTriggerTemplate(trig.action_payload_json || '{}', vars);
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(interpolatedRaw);
    } catch {
      parsedPayload = { message: interpolatedRaw };
    }

    const upstreamText = `[Vision Trigger: ${trig.name}] ${cam.name} (${cam.room}): ${matchInfo.count}× ${matchInfo.matchedLabel} (${matchInfo.confidencePct}% Konfidenz, Δ ${matchInfo.motionPct}% Bewegung) — ${matchInfo.sceneSummary}`;

    let status: 'success' | 'error' = 'success';
    let resultSummary = '';

    try {
      if (trig.action_type === 'axon') {
        const axonId = trig.action_target.trim() || 'ha.call_service';
        const axonRes = await appCtx.actions.execute(axonId, parsedPayload, {
          upstreamText,
        });
        status = axonRes.status;
        resultSummary = `Axon ${axonId}: ${axonRes.summary}`;
      } else if (trig.action_type === 'ha_service') {
        const [domain, service] = trig.action_target.includes('.')
          ? trig.action_target.split('.', 2)
          : ['persistent_notification', 'create'];
        const serviceData =
          domain === 'persistent_notification' && !parsedPayload.message
            ? { title: `Thassi Vision: ${cam.name}`, message: upstreamText, ...parsedPayload }
            : parsedPayload;
        await appCtx.ha.callService(domain, service, serviceData);
        resultSummary = `HA Service ${domain}.${service} ausgeführt (${ JSON.stringify(serviceData).slice(0, 90) })`;
      } else if (trig.action_type === 'ha_event') {
        const evName = trig.action_target.trim() || 'thassi_camera_vision_trigger';
        await appCtx.ha.fireEvent(evName, {
          ...vars,
          ...parsedPayload,
          dryRun: isDryRunTest,
        });
        resultSummary = `HA Event "${evName}" auf Bus publiziert`;
      } else {
        // 'orchestrator_event' -> publish into sharedDb orchestrator_events + vision_last_trigger
        const evt = {
          id: `vis_trig_${Date.now()}`,
          type: 'vision.object_detected',
          source: 'camera-vision',
          triggerId: trig.id,
          triggerName: trig.name,
          ...vars,
          payload: parsedPayload,
          createdAt: nowIso,
        };
        const list = (appCtx.sharedDb.kvGet<unknown[]>('orchestrator_events') || []).slice(0, 79);
        list.unshift(evt);
        appCtx.sharedDb.kvSet('orchestrator_events', list);
        appCtx.sharedDb.kvSet('vision_last_trigger', evt);
        resultSummary = `Thassi Orchestrator Event "${trig.name}" publiziert`;
      }
    } catch (err) {
      status = 'error';
      resultSummary = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Math.max(1, Date.now() - t0);

    appCtx.db.execute(
      `UPDATE vision_triggers
       SET last_triggered_at = ?, last_status = ?, last_result = ?, trigger_count = trigger_count + 1
       WHERE id = ?`,
      [nowIso, status, resultSummary, trig.id]
    );

    appCtx.db.execute(
      `INSERT INTO vision_trigger_logs
       (trigger_id, trigger_name, camera_id, camera_name, matched_object, matched_confidence_pct, matched_count, motion_pct, action_type, action_target, status, duration_ms, result_summary, fired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trig.id,
        trig.name,
        cam.id,
        cam.name,
        matchInfo.matchedLabel,
        matchInfo.confidencePct,
        matchInfo.count,
        matchInfo.motionPct,
        trig.action_type,
        trig.action_target,
        status,
        durationMs,
        resultSummary,
        nowIso,
      ]
    );

    perfTracker.recordTriggerFired(cam.id);

    return {
      ok: status === 'success',
      status,
      summary: resultSummary,
      durationMs,
    };
  }

  async function evaluateAndFireVisionTriggers(
    cam: CameraSourceRow,
    bboxes: NormalizedBoundingBox[],
    motionPct: number,
    sceneSummary: string,
    appCtx: ThassiAppContext
  ) {
    const activeTriggers = appCtx.db.query<VisionTriggerRow>(
      `SELECT * FROM vision_triggers WHERE enabled = 1 AND (camera_id = '*' OR camera_id = ?)` ,
      [cam.id]
    );
    if (activeTriggers.length === 0) return [];

    const now = new Date();
    const nowMs = now.getTime();
    const firedResults = [];

    for (const trig of activeTriggers) {
      // 1. Check cooldown
      if (trig.last_triggered_at) {
        const lastMs = new Date(trig.last_triggered_at).getTime();
        if (Number.isFinite(lastMs) && nowMs - lastMs < Math.max(5, trig.cooldown_sec) * 1000) {
          continue;
        }
      }

      // 2. Check time window
      if (!isWithinTimeWindow(trig.time_window, now)) {
        continue;
      }

      // 3. Check minimum motion threshold
      if (trig.min_motion_pct > 0 && motionPct < trig.min_motion_pct) {
        continue;
      }

      // 4. Match object class & confidence >= p%
      const minConfRatio = Math.max(0.05, Math.min(0.99, (trig.min_confidence_pct || 60) / 100));
      const targetCls = (trig.object_class || 'person').toLowerCase().trim();

      if (targetCls === 'motion_only') {
        if (motionPct >= Math.max(0.5, trig.min_motion_pct || 1.0)) {
          const res = await executeSingleTriggerAction(
            trig,
            cam,
            {
              matchedClass: 'motion',
              matchedLabel: 'Bewegung',
              confidencePct: Math.min(99, Math.round(motionPct * 10)),
              count: 1,
              motionPct,
              sceneSummary,
            },
            appCtx
          );
          firedResults.push({ triggerId: trig.id, name: trig.name, ...res });
        }
        continue;
      }

      const matchingBoxes = bboxes.filter((b) => {
        if (b.category === 'motion') return false;
        if (b.confidence < minConfRatio) return false;
        const rc = (b.rawClass || '').toLowerCase();
        if (targetCls === 'any_object') return true;
        if (targetCls === 'any_vehicle') return VEHICLE_CLASSES.has(rc);
        if (targetCls === 'any_animal') return ANIMAL_CLASSES.has(rc);
        return rc === targetCls;
      });

      const minRequiredCount = Math.max(1, trig.min_count || 1);
      if (matchingBoxes.length >= minRequiredCount) {
        const bestConf = Math.round(
          Math.max(...matchingBoxes.map((b) => b.confidence)) * 100
        );
        const firstBox = matchingBoxes[0];
        const res = await executeSingleTriggerAction(
          trig,
          cam,
          {
            matchedClass: firstBox.rawClass,
            matchedLabel: GERMAN_LABELS[firstBox.rawClass] || firstBox.label || firstBox.rawClass,
            confidencePct: bestConf,
            count: matchingBoxes.length,
            motionPct,
            sceneSummary,
          },
          appCtx
        );
        firedResults.push({ triggerId: trig.id, name: trig.name, ...res });
      }
    }

    return firedResults;
  }

  async function sampleSingleCamera(
    camId: string,
    appCtx: ThassiAppContext,
    options: { forceAi?: boolean; backgroundHighFreq?: boolean } = {}
  ): Promise<VisionDetectionRow | { error?: string; skipped?: boolean; camera_id: string; scene_summary?: string }> {
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
      const prevDetCache = latestDetectionBoxesCache.get(cam.id) || null;
      const det = await runLocalCocoSsdPipeline(
        cam.id,
        snap.buffer,
        snap.mimeType || 'image/jpeg',
        mode,
        {
          minConfidence: cam.min_confidence ?? 0.25,
          motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
          motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
          pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
          aiInputWidth: cam.ai_input_width ?? 300,
          targetClassesJson: cam.target_classes,
          forceAi: options.forceAi ?? false,
          cachedDetection: prevDetCache,
          lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
          lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
          heartbeatIntervalSec: cam.sample_interval_sec || 180,
        }
      );

      const elapsed = Date.now() - startMs;
      const nowMs = Date.now();

      if (!det.motionGateSkipped) {
        lastAiRunAtMsMap.set(cam.id, nowMs);
        if (det.totalObjects > 0) {
          lastPositiveObjectAtMsMap.set(cam.id, nowMs);
        }
      }

      const prevObjectCount = prevDetCache?.totalObjects ?? -1;
      latestDetectionBoxesCache.set(cam.id, {
        bboxes: det.bboxes || [],
        objects: det.objects || [],
        sceneSummary: det.sceneSummary,
        personCount: det.personCount,
        vehicleCount: det.vehicleCount,
        totalObjects: det.totalObjects,
        processingMs: elapsed,
        updatedAt: nowIso,
        motionGateSkipped: det.motionGateSkipped,
      });

      const thumbB64 =
        snap.buffer.byteLength <= 350_000 ? snap.buffer.toString('base64') : '';

      if (thumbB64) {
        const frameSeq = (liveFrameCache.get(cam.id)?.frameSeq || 0) + 1;
        liveFrameCache.set(cam.id, {
          buffer: snap.buffer,
          b64: thumbB64,
          mimeType: snap.mimeType || 'image/jpeg',
          width: det.width,
          height: det.height,
          metrics: det.metrics,
          method: snap.method || 'sample',
          capturedAt: nowIso,
          capturedAtMs: nowMs,
          captureMs: elapsed,
          frameSeq,
        });
      }

      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'online', last_error = '' WHERE id = ?`,
        [nowIso, cam.id]
      );

      // Evaluate & fire configured Vision Triggers whenever objects or motion are present
      if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(
          cam,
          det.bboxes || [],
          det.motionPct,
          det.sceneSummary,
          appCtx
        );
      }

      // Decide whether to write a new row into SQLite `vision_detections`:
      // Always write on manual sample (`!options.backgroundHighFreq`), or when cooldown elapsed & activity/change occurred.
      const lastLogMs = lastDbLogAtMsMap.get(cam.id) || 0;
      const cooldownMs = Math.max(5, cam.log_cooldown_sec ?? 30) * 1000;
      const objectCountChanged = det.totalObjects !== prevObjectCount && det.totalObjects > 0;
      const shouldPersistToDb =
        !options.backgroundHighFreq ||
        lastLogMs === 0 ||
        (nowMs - lastLogMs >= cooldownMs &&
          (!det.motionGateSkipped || objectCountChanged || nowMs - lastLogMs >= (cam.sample_interval_sec || 180) * 1000));

      if (!shouldPersistToDb) {
        return {
          skipped: true,
          camera_id: cam.id,
          scene_summary: det.sceneSummary,
        };
      }

      lastDbLogAtMsMap.set(cam.id, nowMs);

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

      const rowId = Number(info.lastInsertRowid) || 0;
      if (rowId > 35 && rowId % 5 === 0) {
        try {
          appCtx.db.execute(`DELETE FROM vision_detections WHERE id <= ?`, [rowId - 120]);
          appCtx.db.execute(
            `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= ? AND snapshot_b64 != ''`,
            [rowId - 30]
          );
        } catch {}
      }

      await updateSharedSummaryAndHaSensors(appCtx);

      return (
        appCtx.db.queryOne<VisionDetectionRow>(
          'SELECT * FROM vision_detections WHERE id = ?',
          [info.lastInsertRowid]
        ) || { error: 'Gespeichert', camera_id: cam.id, scene_summary: det.sceneSummary }
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
    const triggers = appCtx.db.query<VisionTriggerRow>('SELECT * FROM vision_triggers');
    const onlineCount = cameras.filter((c) => c.last_status === 'online').length;
    const lastDet = latestDetections[0] || null;
    const perf = perfTracker.getSnapshot(activeStreamWorkers);

    const cameraModes: Record<string, OptimizationMode> = {};
    for (const c of cameras) {
      cameraModes[c.id] = (c.optimization_mode as OptimizationMode) || 'Personen';
    }

    const summary = {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((c) => c.enabled === 1).length,
      onlineCameras: onlineCount,
      cameraModes,
      activeTriggers: triggers.filter((t) => t.enabled === 1).length,
      totalTriggersFired: perf.totalTriggersFired,
      motionGateSkipRatePct: perf.motionGateSkipRatePct,
      avgInferenceMs: perf.avgInferenceMs,
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
    appCtx.sharedDb.kvSet('camera_vision_performance', perf);

    await appCtx.ha
      .publishSensor(
        'last_detection',
        lastDet ? `${lastDet.camera_name}: ${lastDet.scene_summary}` : 'Bereit (Lokales COCO-SSD)',
        {
          friendly_name: 'Thassi Camera Vision Letzte Erkennung',
          icon: 'mdi:cctv',
          engine: 'Local COCO-SSD (Motion-Gated)',
          online_cameras: onlineCount,
          total_cameras: cameras.length,
          person_count: lastDet?.person_count ?? 0,
          vehicle_count: lastDet?.vehicle_count ?? 0,
          total_objects: lastDet?.total_objects ?? 0,
          motion_gate_skip_pct: perf.motionGateSkipRatePct,
          active_triggers: summary.activeTriggers,
          triggers_fired: perf.totalTriggersFired,
          camera_modes: cameraModes,
        }
      )
      .catch(() => {});
  }

  // Ensure initial summary is written to sharedDb on startup
  void updateSharedSummaryAndHaSensors(ctx);

  // High-frequency non-overlapping motion-gated background loop (singleton across hot-reloads)
  const gVision = globalThis as unknown as { __thassiVisionHighFreqTimer?: ReturnType<typeof setInterval> };
  if (gVision.__thassiVisionHighFreqTimer) {
    clearInterval(gVision.__thassiVisionHighFreqTimer);
  }
  let highFreqLoopRunning = false;
  let highFreqRobinIdx = 0;
  gVision.__thassiVisionHighFreqTimer = setInterval(() => {
    if (highFreqLoopRunning) return;
    const cfg = getConfig();
    if (!cfg.cyclicEnabled || !cfg.highFreqMotionLoopEnabled) return;

    // Prefer cameras that already have an active stream worker or are marked online
    const enabledCams = ctx.db.query<CameraSourceRow>(
      `SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY CASE WHEN last_status = 'online' THEN 0 ELSE 1 END, id ASC`
    );
    if (enabledCams.length === 0) return;

    const nowMs = Date.now();
    const candidates = enabledCams.filter((c) => {
      const pollIntervalMs = Math.max(8, c.high_freq_poll_sec || 8) * 1000;
      const lastPoll = lastHighFreqPollAtMsMap.get(c.id) || 0;
      // If camera is offline, poll less frequently (every 120s) so we don't block the fast loop
      if (c.last_status !== 'online' && !activeStreamWorkers.has(c.id)) {
        return nowMs - lastPoll >= 120_000;
      }
      return nowMs - lastPoll >= pollIntervalMs;
    });

    if (candidates.length === 0) return;
    const targetCam = candidates[highFreqRobinIdx % candidates.length];
    highFreqRobinIdx++;
    lastHighFreqPollAtMsMap.set(targetCam.id, nowMs);

    highFreqLoopRunning = true;
    void sampleSingleCamera(targetCam.id, ctx, { backgroundHighFreq: true }).finally(() => {
      highFreqLoopRunning = false;
    });
  }, 8000);

  // Register cyclic background job as fallback / heartbeat
  ctx.scheduleJob({
    id: 'cyclic_camera_sampler',
    name: 'Zyklische Kamera-Abtastung (Motion-Gated COCO-SSD)',
    intervalMinutes: 3,
    handler: async () => {
      const cfg = getConfig();
      if (!cfg.cyclicEnabled) return;
      const enabledCams = ctx.db.query<CameraSourceRow>(
        'SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC'
      );
      for (const cam of enabledCams) {
        await sampleSingleCamera(cam.id, ctx, { backgroundHighFreq: true });
      }
      await updateSharedSummaryAndHaSensors(ctx);
    },
  });

  function triggerBackgroundFrameRefresh(
    cam: CameraSourceRow,
    appCtx: ThassiAppContext,
    runAiIfMotion = false
  ): Promise<unknown> {
    const existingPromise = inFlightFrameRequests.get(cam.id);
    if (existingPromise) return existingPromise;

    const task = (async () => {
      const cfg = getConfig();
      const startMs = Date.now();
      const snap = await acquireCameraSnapshot(cam, cfg);
      const captureMs = Date.now() - startMs;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const cached = liveFrameCache.get(cam.id);

      if (!snap.ok || !snap.buffer) {
        const errMsg = snap.error || 'Kein Live-Frame verfügbar';
        appCtx.db.execute(
          `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'offline', last_error = ? WHERE id = ?`,
          [nowIso, errMsg, cam.id]
        );
        return {
          ok: false,
          cameraId: cam.id,
          cameraName: cam.name,
          error: errMsg,
          captureMs,
          fallbackFrameB64: cached?.b64 || '',
          metrics: cached?.metrics || null,
          serverDetections: latestDetectionBoxesCache.get(cam.id) || null,
        };
      }

      const mimeType = snap.mimeType || 'image/jpeg';
      const frameSeq = (rawStreamBufferCache.get(cam.id)?.frameSeq || cached?.frameSeq || 0) + 1;

      rawStreamBufferCache.set(cam.id, {
        buffer: snap.buffer,
        mimeType,
        method: snap.method || 'live',
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq,
      });

      const decoded = decodeImageBuffer(snap.buffer, mimeType);
      const { width, height, rgba, decodeMs } = decoded;
      const metrics = analyzePixelMetricsAndMotion(
        cam.id,
        width,
        height,
        rgba,
        liveLumaGrids,
        cam.pixel_diff_threshold ?? 15,
        decodeMs
      );
      const b64 = snap.buffer.toString('base64');

      liveFrameCache.set(cam.id, {
        buffer: snap.buffer,
        b64,
        mimeType,
        width,
        height,
        metrics,
        method: snap.method || 'live',
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq,
      });

      // If motion is detected (or requested), automatically run motion-gated server AI detection in background!
      if (
        runAiIfMotion ||
        metrics.motionPct >= (cam.motion_threshold_pct ?? 0.8) ||
        !latestDetectionBoxesCache.has(cam.id)
      ) {
        void (async () => {
          if (inFlightDetectRequests.has(cam.id)) return;
          const p = (async () => {
            const mode: OptimizationMode = OPTIMIZATION_MODES.includes(
              cam.optimization_mode as OptimizationMode
            )
              ? (cam.optimization_mode as OptimizationMode)
              : 'Objekte';
            const det = await runLocalCocoSsdPipeline(cam.id, snap.buffer!, mimeType, mode, {
              minConfidence: cam.min_confidence ?? 0.25,
              motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
              motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
              pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
              aiInputWidth: cam.ai_input_width ?? 300,
              targetClassesJson: cam.target_classes,
              preDecoded: decoded,
              cachedDetection: latestDetectionBoxesCache.get(cam.id) || null,
              lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
              lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
              heartbeatIntervalSec: cam.sample_interval_sec || 180,
            });
            if (!det.motionGateSkipped) {
              lastAiRunAtMsMap.set(cam.id, Date.now());
              if (det.totalObjects > 0) {
                lastPositiveObjectAtMsMap.set(cam.id, Date.now());
              }
            }
            latestDetectionBoxesCache.set(cam.id, {
              bboxes: det.bboxes || [],
              objects: det.objects || [],
              sceneSummary: det.sceneSummary,
              personCount: det.personCount,
              vehicleCount: det.vehicleCount,
              totalObjects: det.totalObjects,
              processingMs: det.inferenceMs || 0,
              updatedAt: new Date().toISOString(),
              motionGateSkipped: det.motionGateSkipped,
            });
            if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
              await evaluateAndFireVisionTriggers(
                cam,
                det.bboxes || [],
                det.motionPct,
                det.sceneSummary,
                appCtx
              );
            }
          })();
          inFlightDetectRequests.set(cam.id, p);
          try {
            await p;
          } finally {
            inFlightDetectRequests.delete(cam.id);
          }
        })();
      }

      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'online', last_error = '' WHERE id = ?`,
        [nowIso, cam.id]
      );

      return {
        ok: true,
        cameraId: cam.id,
        cameraName: cam.name,
        room: cam.room,
        optimizationMode: cam.optimization_mode || 'Personen',
        capturedAt: nowIso,
        captureMs,
        frameSeq,
        method: snap.method || 'live',
        width,
        height,
        mimeType,
        frameB64: b64,
        metrics,
        serverDetections: latestDetectionBoxesCache.get(cam.id) || null,
      };
    })();

    inFlightFrameRequests.set(cam.id, task);
    task.finally(() => {
      inFlightFrameRequests.delete(cam.id);
    });
    return task;
  }

  // API: GET /frame.jpg (Zero-Base64 native binary JPEG endpoint for smooth high-FPS camera viewing)
  ctx.route('GET', '/frame.jpg', async (req, appCtx) => {
    const camId = String(req.query.camera_id || '').trim();
    if (!camId) {
      return { status: 400, body: { error: 'camera_id ist erforderlich' } };
    }
    const cam = appCtx.db.queryOne<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE id = ?',
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { error: `Kamera ${camId} nicht gefunden` } };
    }

    ensureLiveStreamWorker(cam);
    const rawCached = rawStreamBufferCache.get(camId);
    const decodedCached = liveFrameCache.get(camId);

    // If raw cache is older than 260ms, trigger non-blocking refresh in background
    if (!rawCached || Date.now() - rawCached.capturedAtMs > 260) {
      const refreshTask = triggerBackgroundFrameRefresh(cam, appCtx, true);
      if (!rawCached && !decodedCached) {
        await refreshTask;
      }
    }

    const latestBuf =
      rawStreamBufferCache.get(camId)?.buffer || decodedCached?.buffer;
    const latestMime =
      rawStreamBufferCache.get(camId)?.mimeType || decodedCached?.mimeType || 'image/jpeg';

    if (!latestBuf) {
      return { status: 503, body: { error: 'Kein Live-Frame verfügbar' } };
    }

    return {
      status: 200,
      headers: {
        'Content-Type': latestMime,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Frame-Seq': String(rawStreamBufferCache.get(camId)?.frameSeq || 1),
      },
      body: latestBuf,
    };
  });

  // API: GET /live-frame (supports ?telemetry_only=1 to skip Base64 transfer when using binary /frame.jpg)
  ctx.route('GET', '/live-frame', async (req, appCtx) => {
    const camId = String(req.query.camera_id || '').trim();
    if (!camId) {
      return { status: 400, body: { ok: false, error: 'camera_id ist erforderlich' } };
    }
    const cam = appCtx.db.queryOne<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE id = ?',
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { ok: false, error: `Kamera ${camId} nicht gefunden` } };
    }

    ensureLiveStreamWorker(cam);
    const cached = liveFrameCache.get(camId);
    const telemetryOnly = req.query.telemetry_only === '1';
    const force = req.query.force === '1';

    // Kick off a non-blocking background frame refresh if cache is older than 320ms
    if (!cached || Date.now() - cached.capturedAtMs > 320 || (force && (!cached || Date.now() - cached.capturedAtMs > 180))) {
      const refreshPromise = triggerBackgroundFrameRefresh(cam, appCtx, true);
      if (!cached) {
        const res = (await refreshPromise) as Record<string, unknown>;
        if (telemetryOnly && res && typeof res === 'object') {
          return { ...res, frameB64: undefined };
        }
        return res;
      }
    }

    const rawLatest = rawStreamBufferCache.get(camId);

    return {
      ok: true,
      cameraId: cam.id,
      cameraName: cam.name,
      room: cam.room,
      optimizationMode: cam.optimization_mode || 'Personen',
      capturedAt: rawLatest?.capturedAt || cached.capturedAt,
      captureMs: rawLatest?.captureMs || cached.captureMs,
      frameSeq: rawLatest?.frameSeq || cached.frameSeq || 1,
      method: rawLatest?.method || cached.method,
      width: cached.width,
      height: cached.height,
      mimeType: cached.mimeType,
      frameB64: telemetryOnly ? undefined : cached.b64,
      metrics: cached.metrics,
      serverDetections: latestDetectionBoxesCache.get(cam.id) || null,
    };
  });

  // API: GET /performance (Real-time pipeline & resource telemetry)
  ctx.route('GET', '/performance', async () => {
    return perfTracker.getSnapshot(activeStreamWorkers);
  });

  // API: GET /triggers (List all vision triggers, recent execution logs & available Thassi Axons)
  ctx.route('GET', '/triggers', async (_req, appCtx) => {
    const triggers = appCtx.db.query<VisionTriggerRow>(
      'SELECT * FROM vision_triggers ORDER BY enabled DESC, id DESC'
    );
    const triggerLogs = appCtx.db.query<VisionTriggerLogRow>(
      'SELECT * FROM vision_trigger_logs ORDER BY id DESC LIMIT 40'
    );
    const availableAxons = appCtx.actions.listActions().map((a) => ({
      id: a.id,
      name: a.name,
      domainCode: a.domainCode,
      category: a.category,
      description: a.description,
      defaultInput: a.defaultInput,
    }));
    return {
      triggers,
      triggerLogs,
      availableAxons,
      objectClasses: Object.entries(GERMAN_LABELS).map(([rawClass, label]) => ({
        rawClass,
        label,
      })),
    };
  });

  // API: POST /triggers (Create or update a trigger rule)
  ctx.route('POST', '/triggers', async (req, appCtx) => {
    const body = (req.body || {}) as Partial<VisionTriggerRow>;
    const name = String(body.name || '').trim();
    if (!name) {
      return { status: 400, body: { error: 'Trigger-Name ist erforderlich' } };
    }
    const cameraId = String(body.camera_id || '*').trim() || '*';
    const objectClass = String(body.object_class || 'person').trim();
    const minConfPct = Math.max(10, Math.min(99, Number(body.min_confidence_pct) || 60));
    const minCount = Math.max(1, Math.min(20, Number(body.min_count) || 1));
    const minMotionPct = Math.max(0, Math.min(50, Number(body.min_motion_pct) || 0));
    const timeWindow = String(body.time_window || 'always').trim() || 'always';
    const cooldownSec = Math.max(5, Math.min(86400, Number(body.cooldown_sec) || 60));
    const actionType: VisionTriggerActionType = ['axon', 'ha_service', 'ha_event', 'orchestrator_event'].includes(
      String(body.action_type)
    )
      ? (body.action_type as VisionTriggerActionType)
      : 'axon';
    const actionTarget = String(body.action_target || 'ha.call_service').trim();
    const actionPayloadJson =
      typeof body.action_payload_json === 'string'
        ? body.action_payload_json.trim() || '{}'
        : JSON.stringify(body.action_payload_json || {});
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1;
    const nowIso = new Date().toISOString();

    if (body.id) {
      appCtx.db.execute(
        `UPDATE vision_triggers
         SET name = ?, enabled = ?, camera_id = ?, object_class = ?, min_confidence_pct = ?, min_count = ?, min_motion_pct = ?, time_window = ?, cooldown_sec = ?, action_type = ?, action_target = ?, action_payload_json = ?
         WHERE id = ?`,
        [
          name,
          enabled,
          cameraId,
          objectClass,
          minConfPct,
          minCount,
          minMotionPct,
          timeWindow,
          cooldownSec,
          actionType,
          actionTarget,
          actionPayloadJson,
          body.id,
        ]
      );
      const rowId = Number(info.lastInsertRowid) || 0;
      if (rowId > 35 && rowId % 5 === 0) {
        try {
          appCtx.db.execute(`DELETE FROM vision_detections WHERE id <= ?`, [rowId - 120]);
          appCtx.db.execute(
            `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= ? AND snapshot_b64 != ''`,
            [rowId - 30]
          );
        } catch {}
      }

      await updateSharedSummaryAndHaSensors(appCtx);
      return { saved: true, id: body.id };
    }

    const info = appCtx.db.execute(
      `INSERT INTO vision_triggers
       (name, enabled, camera_id, object_class, min_confidence_pct, min_count, min_motion_pct, time_window, cooldown_sec, action_type, action_target, action_payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        enabled,
        cameraId,
        objectClass,
        minConfPct,
        minCount,
        minMotionPct,
        timeWindow,
        cooldownSec,
        actionType,
        actionTarget,
        actionPayloadJson,
        nowIso,
      ]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return { saved: true, id: info.lastInsertRowid };
  });

  // API: POST /triggers/toggle
  ctx.route('POST', '/triggers/toggle', async (req, appCtx) => {
    const body = (req.body || {}) as { id?: number; enabled?: number | boolean };
    if (!body.id) {
      return { status: 400, body: { error: 'id ist erforderlich' } };
    }
    const enabled = body.enabled ? 1 : 0;
    appCtx.db.execute('UPDATE vision_triggers SET enabled = ? WHERE id = ?', [enabled, body.id]);
    await updateSharedSummaryAndHaSensors(appCtx);
    return { ok: true, id: body.id, enabled };
  });

  // API: DELETE /triggers
  ctx.route('DELETE', '/triggers', async (req, appCtx) => {
    const id = Number(req.query.id);
    if (!id) {
      return { status: 400, body: { error: 'id ist erforderlich' } };
    }
    appCtx.db.execute('DELETE FROM vision_triggers WHERE id = ?', [id]);
    await updateSharedSummaryAndHaSensors(appCtx);
    return { deleted: id };
  });

  // API: POST /triggers/test (Dry-run / manual execution test of a trigger rule)
  ctx.route('POST', '/triggers/test', async (req, appCtx) => {
    const body = (req.body || {}) as { id?: number };
    if (!body.id) {
      return { status: 400, body: { error: 'id ist erforderlich' } };
    }
    const trig = appCtx.db.queryOne<VisionTriggerRow>(
      'SELECT * FROM vision_triggers WHERE id = ?',
      [body.id]
    );
    if (!trig) {
      return { status: 404, body: { error: `Trigger #${body.id} nicht gefunden` } };
    }

    const cam =
      appCtx.db.queryOne<CameraSourceRow>(
        'SELECT * FROM camera_sources WHERE id = ?',
        [trig.camera_id === '*' ? 'camera.cam_eg_vz_eingang' : trig.camera_id]
      ) ||
      appCtx.db.queryOne<CameraSourceRow>('SELECT * FROM camera_sources LIMIT 1');

    if (!cam) {
      return { status: 404, body: { error: 'Keine Kamera für Testlauf gefunden' } };
    }

    const res = await executeSingleTriggerAction(
      trig,
      cam,
      {
        matchedClass: trig.object_class,
        matchedLabel: GERMAN_LABELS[trig.object_class] || trig.object_class,
        confidencePct: Math.max(trig.min_confidence_pct, 82),
        count: Math.max(1, trig.min_count),
        motionPct: Math.max(1.8, trig.min_motion_pct || 1.8),
        sceneSummary: `Manueller Testlauf für Regel „${trig.name}“`,
      },
      appCtx,
      true
    );

    await updateSharedSummaryAndHaSensors(appCtx);
    return res;
  });

  // API: POST /detect-live (runs server COCO-SSD on current cached frame or logs client WebGL detections)
  ctx.route('POST', '/detect-live', async (req, appCtx) => {
    const body = (req.body || {}) as {
      camera_id?: string;
      optimization_mode?: OptimizationMode;
      save_to_log?: boolean;
      force_ai?: boolean;
      client_bboxes?: NormalizedBoundingBox[];
    };
    const camId = String(body.camera_id || '').trim();
    if (!camId) {
      return { status: 400, body: { ok: false, error: 'camera_id ist erforderlich' } };
    }
    const cam = appCtx.db.queryOne<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE id = ?',
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { ok: false, error: `Kamera ${camId} nicht gefunden` } };
    }

    const mode: OptimizationMode =
      body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode)
        ? body.optimization_mode
        : ((cam.optimization_mode as OptimizationMode) || 'Objekte');

    // If client WebGL COCO-SSD sent live bounding boxes, sync them to cache and optionally persist to log
    if (Array.isArray(body.client_bboxes)) {
      const bboxes = body.client_bboxes.map((b) => ({
        ...b,
        label: GERMAN_LABELS[b.rawClass] || b.label || b.rawClass,
      }));
      const grouped = new Map<
        string,
        { label: string; rawClass: string; confidence: number; count: number; bboxes: NormalizedBoundingBox[] }
      >();
      for (const b of bboxes) {
        const ex = grouped.get(b.rawClass);
        if (ex) {
          ex.count += 1;
          ex.confidence = Math.max(ex.confidence, b.confidence);
          ex.bboxes.push(b);
        } else {
          grouped.set(b.rawClass, {
            label: b.label,
            rawClass: b.rawClass,
            confidence: b.confidence,
            count: 1,
            bboxes: [b],
          });
        }
      }
      const objects = Array.from(grouped.values());
      const personCount = bboxes.filter((b) => b.rawClass === 'person').length;
      const vehicleCount = bboxes.filter((b) => VEHICLE_CLASSES.has(b.rawClass)).length;
      const totalObjects = bboxes.length;
      const nowIso = new Date().toISOString();
      const cachedFrame = liveFrameCache.get(camId);
      const motionPct = cachedFrame?.metrics.motionPct ?? 0;
      const sceneSummary =
        totalObjects > 0
          ? `${totalObjects} ${totalObjects === 1 ? 'Objekt' : 'Objekte'} im Live-Stream: ${objects.map((o) => `${o.count}× ${o.label} (${Math.round(o.confidence * 100)}%)`).join(', ')}`
          : `Keine Zielobjekte im Live-Stream (${cachedFrame?.metrics.lightingMode || 'Bereit'})`;

      const entry = {
        bboxes,
        objects,
        sceneSummary,
        personCount,
        vehicleCount,
        totalObjects,
        processingMs: 28,
        updatedAt: nowIso,
      };
      latestDetectionBoxesCache.set(camId, entry);

      if (totalObjects > 0 || motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(cam, bboxes, motionPct, sceneSummary, appCtx);
      }

      if (body.save_to_log && cachedFrame) {
        appCtx.db.execute(
          `INSERT INTO vision_detections
           (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
           VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cam.id,
            cam.name,
            mode,
            nowIso,
            JSON.stringify(objects),
            JSON.stringify(cachedFrame.metrics),
            totalObjects,
            personCount,
            vehicleCount,
            motionPct,
            sceneSummary,
            `WebGL Live COCO-SSD (${mode})`,
            28,
            cachedFrame.b64.length <= 480_000 ? cachedFrame.b64 : '',
          ]
        );
        await updateSharedSummaryAndHaSensors(appCtx);
      }

      return { ok: true, ...entry };
    }

    // Server-side COCO-SSD detection on cached frame (or fresh snapshot)
    const existingDetect = inFlightDetectRequests.get(camId);
    if (existingDetect) {
      return await existingDetect;
    }

    const detectTask = (async () => {
      let frameBuf = rawStreamBufferCache.get(camId)?.buffer || liveFrameCache.get(camId)?.buffer;
      let frameMime =
        rawStreamBufferCache.get(camId)?.mimeType ||
        liveFrameCache.get(camId)?.mimeType ||
        'image/jpeg';
      if (!frameBuf) {
        const snap = await acquireCameraSnapshot(cam, getConfig());
        if (!snap.ok || !snap.buffer) {
          return { ok: false, error: snap.error || 'Kein Kamerabild verfügbar' };
        }
        frameBuf = snap.buffer;
        frameMime = snap.mimeType || 'image/jpeg';
      }

      const startMs = Date.now();
      const det = await runLocalCocoSsdPipeline(cam.id, frameBuf, frameMime, mode, {
        minConfidence: cam.min_confidence ?? 0.25,
        motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
        motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
        pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
        aiInputWidth: cam.ai_input_width ?? 300,
        targetClassesJson: cam.target_classes,
        forceAi: body.force_ai ?? Boolean(body.save_to_log),
        cachedDetection: latestDetectionBoxesCache.get(cam.id) || null,
        lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
        lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
        heartbeatIntervalSec: cam.sample_interval_sec || 180,
      });
      const processingMs = Date.now() - startMs;
      const nowIso = new Date().toISOString();

      if (!det.motionGateSkipped) {
        lastAiRunAtMsMap.set(cam.id, Date.now());
        if (det.totalObjects > 0) {
          lastPositiveObjectAtMsMap.set(cam.id, Date.now());
        }
      }

      const entry = {
        bboxes: det.bboxes || [],
        objects: det.objects || [],
        sceneSummary: det.sceneSummary,
        personCount: det.personCount,
        vehicleCount: det.vehicleCount,
        totalObjects: det.totalObjects,
        processingMs,
        updatedAt: nowIso,
        motionGateSkipped: det.motionGateSkipped,
      };
      latestDetectionBoxesCache.set(camId, entry);

      if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(
          cam,
          det.bboxes || [],
          det.motionPct,
          det.sceneSummary,
          appCtx
        );
      }

      if (body.save_to_log) {
        const b64 = frameBuf.byteLength <= 350_000 ? frameBuf.toString('base64') : '';
        appCtx.db.execute(
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
            processingMs,
            b64,
          ]
        );
        await updateSharedSummaryAndHaSensors(appCtx);
      }

      return {
        ok: true,
        ...entry,
        metrics: det.metrics,
      };
    })();

    inFlightDetectRequests.set(camId, detectTask);
    try {
      return await detectTask;
    } finally {
      inFlightDetectRequests.delete(camId);
    }
  });

  // Fast non-blocking caches for /dashboard so page loads in <50ms
  let haStatesCache: { fetchedAtMs: number; states: Array<{ entity_id: string; state: string; attributes?: Record<string, unknown> }> } = {
    fetchedAtMs: 0,
    states: [],
  };
  let go2rtcStatusCache: { checkedAtMs: number; online: boolean; streams: Record<string, unknown> } = {
    checkedAtMs: 0,
    online: false,
    streams: {},
  };
  let go2rtcRefreshInFlight = false;

  // API: GET /dashboard
  ctx.route('GET', '/dashboard', async (req, appCtx) => {
    const cfg = getConfig();
    // Default to false so /dashboard doesn't serialize 5-10 MB of historical Base64 snapshots on initial load!
    const includeLogSnapshots = req.query.include_snapshots === '1';
    const cameras = appCtx.db.query<CameraSourceRow>(
      'SELECT * FROM camera_sources ORDER BY enabled DESC, name ASC'
    );

    const nowMs = Date.now();
    if (nowMs - haStatesCache.fetchedAtMs > 15_000) {
      if (haStatesCache.states.length === 0) {
        const fresh = await Promise.race([
          appCtx.ha.getStates('camera').catch(() => []),
          new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 450)),
        ]);
        haStatesCache = { fetchedAtMs: Date.now(), states: fresh };
      } else {
        // Refresh asynchronously in background
        haStatesCache.fetchedAtMs = nowMs;
        void appCtx.ha
          .getStates('camera')
          .then((fresh) => {
            haStatesCache = { fetchedAtMs: Date.now(), states: fresh };
          })
          .catch(() => {});
      }
    }
    const stateMap = new Map(haStatesCache.states.map((s) => [s.entity_id, s]));

    // Only load snapshot_b64 for log rows when explicitly requested (e.g. when viewing the Log tab)
    const detections = includeLogSnapshots
      ? appCtx.db.query<VisionDetectionRow>(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64
           FROM vision_detections ORDER BY id DESC LIMIT 25`
        )
      : appCtx.db.query<VisionDetectionRow>(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, '' as snapshot_b64
           FROM vision_detections ORDER BY id DESC LIMIT 25`
        );

    // Fast O(1) B-tree index lookup per camera (`idx_vision_detections_cam_id`) ONLY for cameras not already in liveFrameCache
    const latestByCam = new Map<string, VisionDetectionRow>();
    for (const c of cameras) {
      if (!liveFrameCache.has(c.id)) {
        const row = appCtx.db.queryOne<VisionDetectionRow>(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64
           FROM vision_detections
           WHERE camera_id = ?
           ORDER BY id DESC LIMIT 1`,
          [c.id]
        );
        if (row) latestByCam.set(c.id, row);
      }
    }

    const enrichedCameras = cameras.map((c) => {
      const haState = stateMap.get(c.id);
      let lan6668 = false;
      let lan554 = false;
      if (c.lan_ip) {
        const cachedLan = lanStatusCache.get(c.lan_ip);
        if (cachedLan) {
          lan6668 = cachedLan.port6668;
          lan554 = cachedLan.port554;
        }
        if (!cachedLan || nowMs - cachedLan.checkedAtMs >= 60_000) {
          // Non-blocking background TCP port probe
          lanStatusCache.set(c.lan_ip, {
            checkedAtMs: nowMs,
            port6668: lan6668,
            port554: lan554,
          });
          void Promise.all([
            checkTcpPort(c.lan_ip, 6668, 250),
            checkTcpPort(c.lan_ip, 554, 250),
          ]).then(([p6668, p554]) => {
            lanStatusCache.set(c.lan_ip, {
              checkedAtMs: Date.now(),
              port6668: p6668,
              port554: p554,
            });
          });
        }
      }

      const liveMem = liveFrameCache.get(c.id);
      const latestRow = latestByCam.get(c.id);
      const latestDetMem = latestDetectionBoxesCache.get(c.id);

      let parsedObjects: Array<{ bboxes?: NormalizedBoundingBox[]; [k: string]: unknown }> = [];
      let parsedMetrics: Record<string, unknown> = {};
      if (latestRow) {
        try {
          parsedObjects = JSON.parse(latestRow.objects_json || '[]');
        } catch {}
        try {
          parsedMetrics = JSON.parse(latestRow.metrics_json || '{}');
        } catch {}
      }

      const flattenedBboxes: NormalizedBoundingBox[] =
        latestDetMem?.bboxes ||
        parsedObjects.flatMap((o) => (Array.isArray(o.bboxes) ? o.bboxes : []));

      return {
        ...c,
        min_confidence: c.min_confidence ?? 0.45,
        motion_gate_enabled: c.motion_gate_enabled ?? 1,
        motion_threshold_pct: c.motion_threshold_pct ?? 2.2,
        pixel_diff_threshold: c.pixel_diff_threshold ?? 25,
        ai_input_width: c.ai_input_width ?? 640,
        log_cooldown_sec: c.log_cooldown_sec ?? 30,
        high_freq_poll_sec: c.high_freq_poll_sec ?? 3,
        optimization_mode: (c.optimization_mode || 'Personen') as OptimizationMode,
        ha_state: haState?.state || 'missing_in_ha',
        ha_attributes: haState?.attributes || {},
        lan_reachable_6668: lan6668,
        lan_reachable_554: lan554,
        latest_snapshot_b64: liveMem?.b64 || latestRow?.snapshot_b64 || '',
        latest_scene_summary:
          latestDetMem?.sceneSummary || latestRow?.scene_summary || '',
        latest_sampled_at:
          liveMem?.capturedAt || latestRow?.sampled_at || c.last_sampled_at || '',
        latest_objects: latestDetMem?.objects || parsedObjects,
        latest_metrics: liveMem?.metrics || parsedMetrics,
        latest_bboxes: flattenedBboxes,
      };
    });

    // Non-blocking background check for go2rtc status
    if (!go2rtcRefreshInFlight && nowMs - go2rtcStatusCache.checkedAtMs > 20_000) {
      go2rtcRefreshInFlight = true;
      go2rtcStatusCache.checkedAtMs = nowMs;
      void fetch(`${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/streams`, {
        signal: AbortSignal.timeout(800),
      })
        .then(async (gr) => {
          if (gr.ok) {
            const streams = (await gr.json()) as Record<string, unknown>;
            go2rtcStatusCache = { checkedAtMs: Date.now(), online: true, streams };
          } else {
            go2rtcStatusCache = { checkedAtMs: Date.now(), online: false, streams: {} };
          }
        })
        .catch(() => {
          go2rtcStatusCache = { checkedAtMs: Date.now(), online: false, streams: {} };
        })
        .finally(() => {
          go2rtcRefreshInFlight = false;
        });
    }

    const triggers = appCtx.db.query<VisionTriggerRow>(
      'SELECT * FROM vision_triggers ORDER BY enabled DESC, id DESC'
    );
    const triggerLogs = appCtx.db.query<VisionTriggerLogRow>(
      'SELECT * FROM vision_trigger_logs ORDER BY id DESC LIMIT 25'
    );

    return {
      config: cfg,
      optimizationModes: OPTIMIZATION_MODES,
      go2rtc: {
        online: go2rtcStatusCache.online,
        url: cfg.go2rtcUrl,
        streams: go2rtcStatusCache.streams,
      },
      performance: perfTracker.getSnapshot(activeStreamWorkers),
      triggers,
      triggerLogs,
      cameras: enrichedCameras,
      detections: detections.map((d) => ({
        ...d,
        snapshot_b64: includeLogSnapshots ? d.snapshot_b64 : '',
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

  // API: POST /camera-mode (quickly set optimization_mode or thresholds per camera)
  ctx.route('POST', '/camera-mode', async (req, appCtx) => {
    const body = (req.body || {}) as {
      camera_id?: string;
      optimization_mode?: OptimizationMode;
      min_confidence?: number;
      motion_gate_enabled?: number | boolean;
      motion_threshold_pct?: number;
    };
    if (!body.camera_id) {
      return { status: 400, body: { error: 'camera_id ist erforderlich' } };
    }
    const cam = appCtx.db.queryOne<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE id = ?',
      [body.camera_id]
    );
    if (!cam) {
      return { status: 404, body: { error: `Kamera ${body.camera_id} nicht gefunden` } };
    }

    const nextMode =
      body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode)
        ? body.optimization_mode
        : cam.optimization_mode;
    const nextConf =
      body.min_confidence !== undefined
        ? Math.max(0.1, Math.min(0.95, Number(body.min_confidence)))
        : (cam.min_confidence ?? 0.25);
    const nextGate =
      body.motion_gate_enabled !== undefined
        ? body.motion_gate_enabled
          ? 1
          : 0
        : (cam.motion_gate_enabled ?? 1);
    const nextMotionThresh =
      body.motion_threshold_pct !== undefined
        ? Math.max(0.1, Math.min(25, Number(body.motion_threshold_pct)))
        : (cam.motion_threshold_pct ?? 0.8);

    appCtx.db.execute(
      `UPDATE camera_sources
       SET optimization_mode = ?, min_confidence = ?, motion_gate_enabled = ?, motion_threshold_pct = ?
       WHERE id = ?`,
      [nextMode, nextConf, nextGate, nextMotionThresh, body.camera_id]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return {
      ok: true,
      camera_id: body.camera_id,
      optimization_mode: nextMode,
      min_confidence: nextConf,
      motion_gate_enabled: nextGate,
      motion_threshold_pct: nextMotionThresh,
    };
  });

  // API: POST /sample-now
  ctx.route('POST', '/sample-now', async (req, appCtx) => {
    const body = (req.body || {}) as { camera_id?: string; force_ai?: boolean };
    if (body.camera_id) {
      const res = await sampleSingleCamera(body.camera_id, appCtx, {
        forceAi: body.force_ai ?? true,
        backgroundHighFreq: false,
      });
      return { results: [res] };
    }
    const enabled = appCtx.db.query<CameraSourceRow>(
      'SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC'
    );
    const results = [];
    for (const c of enabled) {
      results.push(
        await sampleSingleCamera(c.id, appCtx, {
          forceAi: body.force_ai ?? false,
          backgroundHighFreq: false,
        })
      );
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
      min_confidence?: number;
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
      mode,
      {
        minConfidence: body.min_confidence ?? 0.22,
        forceAi: true,
      }
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

  // API: POST /cameras (Save camera settings including analysis thresholds)
  ctx.route('POST', '/cameras', async (req, appCtx) => {
    const body = (req.body || {}) as Partial<CameraSourceRow>;
    if (!body.id || !body.name) {
      return { status: 400, body: { error: 'id und name sind erforderlich' } };
    }
    const mode: OptimizationMode =
      body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode)
        ? body.optimization_mode
        : 'Personen';

    const minConf = Math.max(0.1, Math.min(0.95, Number(body.min_confidence) || 0.45));
    const motionGate = body.motion_gate_enabled !== undefined ? (body.motion_gate_enabled ? 1 : 0) : 1;
    const motionThresh = Math.max(0.1, Math.min(25, Number(body.motion_threshold_pct) || 2.2));
    const pixelDiff = Math.max(4, Math.min(80, Number(body.pixel_diff_threshold) || 25));
    const aiWidth = [224, 300, 416, 640, 800].includes(Number(body.ai_input_width))
      ? Number(body.ai_input_width)
      : 640;
    const logCooldown = Math.max(5, Math.min(3600, Number(body.log_cooldown_sec) || 30));
    const highFreqSec = Math.max(1, Math.min(120, Number(body.high_freq_poll_sec) || 3));

    appCtx.db.execute(
      `INSERT INTO camera_sources
       (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error, min_confidence, motion_gate_enabled, motion_threshold_pct, pixel_diff_threshold, ai_input_width, log_cooldown_sec, high_freq_poll_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         room = excluded.room,
         source_type = excluded.source_type,
         stream_url = excluded.stream_url,
         lan_ip = excluded.lan_ip,
         enabled = excluded.enabled,
         sample_interval_sec = excluded.sample_interval_sec,
         optimization_mode = excluded.optimization_mode,
         target_classes = excluded.target_classes,
         min_confidence = excluded.min_confidence,
         motion_gate_enabled = excluded.motion_gate_enabled,
         motion_threshold_pct = excluded.motion_threshold_pct,
         pixel_diff_threshold = excluded.pixel_diff_threshold,
         ai_input_width = excluded.ai_input_width,
         log_cooldown_sec = excluded.log_cooldown_sec,
         high_freq_poll_sec = excluded.high_freq_poll_sec`,
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
        minConf,
        motionGate,
        motionThresh,
        pixelDiff,
        aiWidth,
        logCooldown,
        highFreqSec,
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

  async function fetchActiveTuyaFlow(haUrl: string, haToken: string) {
    let storedUserCode = '';
    let storedEntryTitle = '';
    let storedEntryId = '01KCMYXWZ67QCM7YXY37ZTKBDZ';
    const storagePath = '/homeassistant/.storage/core.config_entries';
    try {
      if (fs.existsSync(storagePath)) {
        const raw = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
        const entries = raw?.data?.entries || [];
        const tuyaEntry = entries.find((e: { domain?: string }) => e.domain === 'tuya');
        if (tuyaEntry) {
          storedUserCode = tuyaEntry.data?.user_code || '';
          storedEntryTitle = tuyaEntry.title || '';
          storedEntryId = tuyaEntry.entry_id || storedEntryId;
        }
      }
    } catch {
      // ignore
    }

    const flows = await new Promise<Array<{ flow_id: string; handler: string; step_id: string }>>(
      (resolve) => {
        try {
          const ws = new WebSocket(haUrl.replace(/^http/, 'ws') + '/api/websocket');
          const t = setTimeout(() => {
            try {
              ws.close();
            } catch {}
            resolve([]);
          }, 5000);
          ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === 'auth_required')
              ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
            if (msg.type === 'auth_ok')
              ws.send(JSON.stringify({ id: 1, type: 'config_entries/flow/progress' }));
            if (msg.id === 1) {
              clearTimeout(t);
              ws.close();
              resolve(msg.result || []);
            }
          });
        } catch {
          resolve([]);
        }
      }
    );

    const tuyaFlow = flows.find((f) => f.handler === 'tuya');
    let flowDetails: Record<string, unknown> | null = null;
    let qrData = '';
    if (tuyaFlow) {
      try {
        const r = await fetch(`${haUrl}/api/config/config_entries/flow/${tuyaFlow.flow_id}`, {
          headers: { Authorization: `Bearer ${haToken}` },
        });
        flowDetails = (await r.json()) as Record<string, unknown>;
        const schema =
          (flowDetails?.data_schema as Array<{ selector?: { qr_code?: { data?: string } } }>) || [];
        qrData = schema[0]?.selector?.qr_code?.data || '';
      } catch {
        // ignore
      }
    }

    return {
      storedUserCode,
      storedEntryTitle,
      storedEntryId,
      activeFlowId: tuyaFlow?.flow_id || null,
      qrData,
      flowDetails,
    };
  }

  // API: GET /tuya-reauth
  ctx.route('GET', '/tuya-reauth', async () => {
    const { haUrl, haToken } = getHaConnection();
    return await fetchActiveTuyaFlow(haUrl, haToken);
  });

  // API: POST /tuya-reauth-refresh
  ctx.route('POST', '/tuya-reauth-refresh', async () => {
    const { haUrl, haToken } = getHaConnection();
    const current = await fetchActiveTuyaFlow(haUrl, haToken);
    if (current.activeFlowId) {
      await fetch(`${haUrl}/api/config/config_entries/flow/${current.activeFlowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${haToken}` },
      }).catch(() => {});
    }
    await fetch(`${haUrl}/api/config/config_entries/entry/${current.storedEntryId}/reload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${haToken}` },
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1400));
    return await fetchActiveTuyaFlow(haUrl, haToken);
  });

  // API: POST /tuya-reauth
  ctx.route('POST', '/tuya-reauth', async (req, appCtx) => {
    const { haUrl, haToken } = getHaConnection();
    const body = (req.body || {}) as { flow_id?: string; user_code?: string };
    const flowId = body.flow_id || (await fetchActiveTuyaFlow(haUrl, haToken)).activeFlowId;
    if (!flowId) {
      return {
        status: 400,
        body: { error: 'Kein aktiver Tuya-QR-Flow gefunden. Bitte neuen QR-Code generieren.' },
      };
    }
    const r = await fetch(`${haUrl}/api/config/config_entries/flow/${flowId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${haToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body.user_code ? { user_code: body.user_code } : {}),
    });
    const resData = (await r.json()) as { type?: string; errors?: Record<string, string> };
    if (resData.type === 'abort' || resData.type === 'create_entry') {
      await new Promise((res) => setTimeout(res, 2500));
      await sampleSingleCamera('camera.lsc_smart_ptz_camera_2', appCtx);
    }
    return { status: r.status, body: resData };
  });

  // API: POST /configure-onvif
  ctx.route('POST', '/configure-onvif', async (req, appCtx) => {
    const body = (req.body || {}) as {
      camera_id?: string;
      lan_ip?: string;
      username?: string;
      password?: string;
      rtsp_path?: string;
    };
    const camId = body.camera_id || 'camera.lsc_smart_ptz_camera_2';
    const ip = (body.lan_ip || '192.168.188.140').trim();
    const user = (body.username || 'admin').trim();
    const pass = (body.password || '').trim();
    const rtspPath = (body.rtsp_path || '/onvif1').trim();

    const p554 = await checkTcpPort(ip, 554, 600);
    const p8554 = await checkTcpPort(ip, 8554, 600);
    const port = p554 ? 554 : p8554 ? 8554 : 554;

    const authPart = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
    const rtspUrl = `rtsp://${authPart}${ip}:${port}${rtspPath.startsWith('/') ? rtspPath : '/' + rtspPath}`;

    appCtx.db.execute(
      `UPDATE camera_sources SET lan_ip = ?, stream_url = ?, enabled = 1 WHERE id = ?`,
      [ip, rtspUrl, camId]
    );

    const cfg = getConfig();
    try {
      await fetch(
        `${cfg.go2rtcUrl.replace(/\/+$/, '')}/api/streams?name=${encodeURIComponent(camId)}&src=${encodeURIComponent(rtspUrl)}`,
        { method: 'PUT', signal: AbortSignal.timeout(3000) }
      );
    } catch {
      // ignore
    }

    const sampleRes = await sampleSingleCamera(camId, appCtx);
    return {
      configured: true,
      camera_id: camId,
      rtspUrl,
      port554Open: p554,
      port8554Open: p8554,
      sampleRes,
    };
  });
});
