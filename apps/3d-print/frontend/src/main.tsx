import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppClient } from '@thassi/sdk/client';
import {
  compileSceneToMesh,
  type CompiledMesh,
  type MeshStats,
  type PrimitiveNode,
  type SceneSpec,
  type Vec3,
} from '../../shared/mesh-engine.js';

const api = createAppClient('3d-print');

interface BambuLiveTelemetry {
  connected: boolean;
  connectionMode: 'lan_mqtt_tls' | 'digital_twin_simulation' | 'standby_offline';
  printerState: 'IDLE' | 'PREPARE' | 'RUNNING' | 'PAUSE' | 'FINISH' | 'FAILED' | 'OFFLINE';
  subtaskName: string;
  progressPercent: number;
  currentLayer: number;
  totalLayers: number;
  remainingMinutes: number;
  nozzleTempC: number;
  nozzleTargetTempC: number;
  bedTempC: number;
  bedTargetTempC: number;
  chamberTempC: number;
  speedLevel: 1 | 2 | 3 | 4;
  chamberLightOn: boolean;
  fanSpeedPercent: number;
  activeProjectId: string | null;
  lastUpdated: string;
  lastMessage: string;
}

interface PrinterConfig {
  ip: string;
  serial: string;
  accessCode: string;
  accessCodeConfigured?: boolean;
  model: string;
  name: string;
  nozzleDiameterMm: number;
  bedDimensionsMm: [number, number, number];
  shellyPowerEntityId: string;
  lanOnlyMode: boolean;
}

interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  status: string;
  progressPct: number;
  stats: MeshStats;
  scene: SceneSpec;
  updatedAt: string;
}

interface DiscoveredPrinter {
  ip: string;
  serial: string;
  name: string;
  model: string;
  firmware: string;
  discoveryMethod: string;
}

interface OpenLibraryModelHit {
  id: string;
  slotIndex: number; // 1..4
  repository: 'PRINTABLES';
  title: string;
  author: string;
  summary: string;
  externalUrl: string;
  thumbnailUrl: string | null;
  stlFileName: string | null;
  stlDownloadUrl: string | null;
  likes: number;
  downloads: number;
  dimensionsLabel: string;
  parametricScene: SceneSpec | null;
  parametricStats: MeshStats | null;
  meshError?: string;
}

interface GeneratedAiSlotResult {
  projectId: string;
  scene: SceneSpec;
  stats: MeshStats;
  summary: string;
  engine: string;
}

interface SceneVersionSnapshot {
  id: string;
  stepNumber: number;
  prompt: string;
  summary: string;
  engine: string;
  timestamp: string;
  scene: SceneSpec;
  stats: MeshStats;
}

interface DashboardPayload {
  hasActiveProject: boolean;
  activeProject: ProjectSummary | null;
  projects: ProjectSummary[];
  telemetry: BambuLiveTelemetry;
  printerConfig: PrinterConfig;
  discoveredPrinters: DiscoveredPrinter[];
  bambuApiSpec: Record<string, unknown>;
  aiStatus: {
    engine: string;
    geminiConfigured: boolean;
  };
}

type ViewRenderMode = 'solid' | 'wireframe' | 'xray' | 'slicer';
type ActiveDrawer = null | 'printer' | 'projects' | 'inspector';

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#10b981').replace('#', '');
  const num = parseInt(clean.length === 6 ? clean : '10b981', 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function formatTelemetryFreshness(isoString: string | undefined, nowMs: number): {
  formattedTime: string;
  relativeAge: string;
} {
  if (!isoString) {
    return { formattedTime: '—', relativeAge: 'unbekannt' };
  }
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) {
    return { formattedTime: isoString, relativeAge: '—' };
  }
  const dt = new Date(parsed);
  const formattedTime = dt.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) {
    return { formattedTime, relativeAge: `vor ${diffSec}s` };
  }
  const diffMin = Math.floor(diffSec / 60);
  return { formattedTime, relativeAge: `vor ${diffMin}m` };
}

function exportWavefrontObj(mesh: CompiledMesh, title: string): string {
  const lines: string[] = [
    `# Thassi 3D-Print Studio Wavefront OBJ`,
    `# Model: ${title}`,
    `# Triangles: ${mesh.triangles.length}`,
    `o ${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'thassi_model'}`,
  ];
  let vIndex = 1;
  for (const tri of mesh.triangles) {
    lines.push(`v ${tri.v0.x.toFixed(4)} ${tri.v0.y.toFixed(4)} ${tri.v0.z.toFixed(4)}`);
    lines.push(`v ${tri.v1.x.toFixed(4)} ${tri.v1.y.toFixed(4)} ${tri.v1.z.toFixed(4)}`);
    lines.push(`v ${tri.v2.x.toFixed(4)} ${tri.v2.y.toFixed(4)} ${tri.v2.z.toFixed(4)}`);
    lines.push(`vn ${tri.normal.x.toFixed(4)} ${tri.normal.y.toFixed(4)} ${tri.normal.z.toFixed(4)}`);
    lines.push(`f ${vIndex} ${vIndex + 1} ${vIndex + 2}`);
    vIndex += 3;
  }
  return lines.join('\n');
}

/**
 * Full-Featured Interactive 3D Viewport for the Refine View
 */
function Interactive3dViewport({
  scene,
  renderMode,
  sliceRatio,
  autoRotate,
  cameraResetKey,
  cameraPreset,
}: {
  scene: SceneSpec | null;
  renderMode: ViewRenderMode;
  sliceRatio: number;
  autoRotate: boolean;
  cameraResetKey: number;
  cameraPreset: 'iso' | 'front' | 'top' | 'side';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef({
    yaw: 0.68,
    pitch: 0.52,
    zoom: 1.95,
    panX: 0,
    panY: 18,
    dragging: false,
    panDragging: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    if (cameraPreset === 'iso') {
      camRef.current.yaw = 0.68;
      camRef.current.pitch = 0.52;
      camRef.current.panX = 0;
      camRef.current.panY = 18;
    } else if (cameraPreset === 'front') {
      camRef.current.yaw = 0;
      camRef.current.pitch = 0.12;
      camRef.current.panX = 0;
      camRef.current.panY = 22;
    } else if (cameraPreset === 'top') {
      camRef.current.yaw = 0;
      camRef.current.pitch = 1.48;
      camRef.current.panX = 0;
      camRef.current.panY = 0;
    } else if (cameraPreset === 'side') {
      camRef.current.yaw = Math.PI / 2;
      camRef.current.pitch = 0.15;
      camRef.current.panX = 0;
      camRef.current.panY = 22;
    }
  }, [cameraPreset, cameraResetKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mesh = scene ? compileSceneToMesh(scene) : null;
    let animId = 0;

    const projectPoint = (
      p: Vec3,
      w: number,
      h: number,
      cz: number
    ): { sx: number; sy: number; depth: number; visible: boolean } => {
      const { yaw, pitch, zoom, panX, panY } = camRef.current;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);

      const px = p.x;
      const py = p.y;
      const pz = p.z - cz;

      const rx = px * cy - py * sy;
      const ry = px * sy + py * cy;

      const camX = rx;
      const camY = pz * cp - ry * sp;
      const camZ = pz * sp + ry * cp + 290 / Math.max(0.3, zoom);

      if (camZ <= 15) {
        return { sx: 0, sy: 0, depth: camZ, visible: false };
      }
      const fov = Math.min(w, h) * 1.15;
      const sx = w / 2 + panX + (camX * fov) / camZ;
      const screenY = h / 2 + panY - (camY * fov) / camZ;
      return { sx, sy: screenY, depth: camZ, visible: true };
    };

    const drawFrame = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(300, Math.floor(rect.width || canvas.clientWidth || 640));
      const h = Math.max(240, Math.floor(rect.height || canvas.clientHeight || 480));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      if (autoRotate && !camRef.current.dragging && !camRef.current.panDragging) {
        camRef.current.yaw += 0.0045;
      }

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      const centerZ = mesh ? (mesh.stats.bounds.min.z + mesh.stats.bounds.max.z) / 2 : 25;

      // Bambu 256x256mm build plate grid
      const halfBed = 128;
      const gridStep = 32;
      ctx.lineWidth = 1;
      for (let g = -halfBed; g <= halfBed; g += gridStep) {
        const isCenter = g === 0;
        const isBorder = Math.abs(g) === halfBed;
        ctx.strokeStyle = isBorder
          ? 'rgba(255, 255, 255, 0.16)'
          : isCenter
            ? 'rgba(255, 255, 255, 0.10)'
            : 'rgba(255, 255, 255, 0.04)';

        const a1 = projectPoint({ x: g, y: -halfBed, z: 0 }, w, h, centerZ);
        const a2 = projectPoint({ x: g, y: halfBed, z: 0 }, w, h, centerZ);
        if (a1.visible && a2.visible) {
          ctx.beginPath();
          ctx.moveTo(a1.sx, a1.sy);
          ctx.lineTo(a2.sx, a2.sy);
          ctx.stroke();
        }

        const b1 = projectPoint({ x: -halfBed, y: g, z: 0 }, w, h, centerZ);
        const b2 = projectPoint({ x: halfBed, y: g, z: 0 }, w, h, centerZ);
        if (b1.visible && b2.visible) {
          ctx.beginPath();
          ctx.moveTo(b1.sx, b1.sy);
          ctx.lineTo(b2.sx, b2.sy);
          ctx.stroke();
        }
      }

      if (mesh && mesh.triangles.length > 0) {
        const maxZ = Math.max(1, mesh.stats.bounds.max.z);
        const clipZ = sliceRatio * maxZ + 0.05;
        const lightDir = { x: 0.45, y: -0.6, z: 0.66 };

        interface DrawTri {
          p0: { sx: number; sy: number };
          p1: { sx: number; sy: number };
          p2: { sx: number; sy: number };
          depth: number;
          fillStyle: string;
          strokeStyle: string;
          isTopSliceLayer: boolean;
        }

        const drawList: DrawTri[] = [];
        for (const tri of mesh.triangles) {
          const avgZ = (tri.v0.z + tri.v1.z + tri.v2.z) / 3;
          if (avgZ > clipZ) continue;

          const p0 = projectPoint(tri.v0, w, h, centerZ);
          const p1 = projectPoint(tri.v1, w, h, centerZ);
          const p2 = projectPoint(tri.v2, w, h, centerZ);
          if (!p0.visible || !p1.visible || !p2.visible) continue;

          const depth = (p0.depth + p1.depth + p2.depth) / 3;
          const dotKey = Math.max(
            0,
            tri.normal.x * lightDir.x + tri.normal.y * lightDir.y + tri.normal.z * lightDir.z
          );
          const dotRim = Math.max(
            0,
            tri.normal.x * -0.55 + tri.normal.y * 0.48 + tri.normal.z * 0.65
          );
          const intensity = Math.max(0.28, Math.min(1.24, 0.34 + dotKey * 0.68 + dotRim * 0.22));
          const spec = Math.pow(dotKey, 12) * 34;

          const [r, g, b] = hexToRgb(tri.color);
          const sr = Math.min(255, Math.round(r * intensity + spec));
          const sg = Math.min(255, Math.round(g * intensity + spec));
          const sb = Math.min(255, Math.round(b * intensity + spec));

          const isTopSliceLayer =
            (renderMode === 'slicer' || sliceRatio < 0.995) && Math.abs(avgZ - clipZ) < 1.8;

          let fillStyle = `rgb(${sr}, ${sg}, ${sb})`;
          let strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.92)`;

          if (tri.isSubtract) {
            fillStyle = `rgba(244, 63, 94, 0.42)`;
            strokeStyle = `rgba(251, 113, 133, 0.65)`;
          } else if (renderMode === 'xray') {
            fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.25)`;
            strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.62)`;
          } else if (renderMode === 'wireframe') {
            fillStyle = 'rgba(0,0,0,0)';
            strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.88)`;
          } else if (isTopSliceLayer) {
            fillStyle = '#f97316';
            strokeStyle = '#fdba74';
          }

          drawList.push({
            p0,
            p1,
            p2,
            depth,
            fillStyle,
            strokeStyle,
            isTopSliceLayer,
          });
        }

        drawList.sort((a, b) => b.depth - a.depth);

        for (const dt of drawList) {
          ctx.beginPath();
          ctx.moveTo(dt.p0.sx, dt.p0.sy);
          ctx.lineTo(dt.p1.sx, dt.p1.sy);
          ctx.lineTo(dt.p2.sx, dt.p2.sy);
          ctx.closePath();

          if (renderMode !== 'wireframe') {
            ctx.fillStyle = dt.fillStyle;
            ctx.fill();
          }
          ctx.strokeStyle = dt.strokeStyle;
          ctx.lineWidth = renderMode === 'wireframe' ? 0.9 : dt.isTopSliceLayer ? 1.2 : 0.4;
          ctx.stroke();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(drawFrame);
    };

    animId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animId);
  }, [scene, renderMode, sliceRatio, autoRotate]);

  return (
    <canvas
      ref={canvasRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'grab',
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        if (e.button === 2 || e.shiftKey) {
          camRef.current.panDragging = true;
        } else {
          camRef.current.dragging = true;
        }
        camRef.current.lastX = e.clientX;
        camRef.current.lastY = e.clientY;
      }}
      onPointerMove={(e) => {
        if (!camRef.current.dragging && !camRef.current.panDragging) return;
        const dx = e.clientX - camRef.current.lastX;
        const dy = e.clientY - camRef.current.lastY;
        camRef.current.lastX = e.clientX;
        camRef.current.lastY = e.clientY;

        if (camRef.current.panDragging) {
          camRef.current.panX += dx;
          camRef.current.panY += dy;
        } else {
          camRef.current.yaw += dx * 0.0085;
          camRef.current.pitch = Math.max(
            -0.35,
            Math.min(1.52, camRef.current.pitch + dy * 0.0075)
          );
        }
      }}
      onPointerUp={() => {
        camRef.current.dragging = false;
        camRef.current.panDragging = false;
      }}
      onWheel={(e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        camRef.current.zoom = Math.max(0.55, Math.min(4.8, camRef.current.zoom * factor));
      }}
    />
  );
}

/**
 * Interactive 3D Card Viewport for the 5 Search Result Cards.
 * Compiles the SceneSpec synchronously inside the render loop effect and supports drag-to-rotate.
 */
function MiniCard3dViewport({
  scene,
  autoRotate = true,
  accentBorder = false,
}: {
  scene: SceneSpec;
  autoRotate?: boolean;
  accentBorder?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef({
    yaw: 0.65,
    pitch: 0.44,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mesh = compileSceneToMesh(scene);
    let animId = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(180, Math.floor(rect.width || canvas.clientWidth || 220));
      const h = Math.max(180, Math.floor(rect.height || canvas.clientHeight || 200));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      if (autoRotate && !camRef.current.dragging) {
        camRef.current.yaw += 0.008;
      }

      ctx.fillStyle = accentBorder ? '#0d0d10' : '#09090b';
      ctx.fillRect(0, 0, w, h);

      if (mesh && mesh.triangles.length > 0) {
        const bounds = mesh.stats.bounds;
        const cx = (bounds.min.x + bounds.max.x) / 2;
        const cy = (bounds.min.y + bounds.max.y) / 2;
        const cz = (bounds.min.z + bounds.max.z) / 2;
        const maxSpan = Math.max(
          20,
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y,
          bounds.max.z - bounds.min.z
        );

        const yaw = camRef.current.yaw;
        const pitch = camRef.current.pitch;
        const cyaw = Math.cos(yaw);
        const syaw = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const camDist = maxSpan * 2.0;
        const fov = Math.min(w, h) * 1.28;

        const project = (p: Vec3) => {
          const px = p.x - cx;
          const py = p.y - cy;
          const pz = p.z - cz;
          const rx = px * cyaw - py * syaw;
          const ry = px * syaw + py * cyaw;
          const camX = rx;
          const camY = pz * cp - ry * sp;
          const camZ = pz * sp + ry * cp + camDist;
          return {
            sx: w / 2 + (camX * fov) / Math.max(8, camZ),
            sy: h / 2 + 6 - (camY * fov) / Math.max(8, camZ),
            depth: camZ,
          };
        };

        // Build plate reference square under the model
        const gHalf = maxSpan * 0.62;
        const gCorners = [
          project({ x: cx - gHalf, y: cy - gHalf, z: bounds.min.z }),
          project({ x: cx + gHalf, y: cy - gHalf, z: bounds.min.z }),
          project({ x: cx + gHalf, y: cy + gHalf, z: bounds.min.z }),
          project({ x: cx - gHalf, y: cy + gHalf, z: bounds.min.z }),
        ];
        ctx.beginPath();
        ctx.moveTo(gCorners[0].sx, gCorners[0].sy);
        for (let i = 1; i < 4; i++) ctx.lineTo(gCorners[i].sx, gCorners[i].sy);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        const keyLight = { x: 0.52, y: -0.56, z: 0.64 };
        const rimLight = { x: -0.58, y: 0.48, z: 0.65 };

        const drawable = mesh.triangles.map((tri) => {
          const p0 = project(tri.v0);
          const p1 = project(tri.v1);
          const p2 = project(tri.v2);
          const depth = (p0.depth + p1.depth + p2.depth) / 3;
          const dotKey = Math.max(
            0,
            tri.normal.x * keyLight.x + tri.normal.y * keyLight.y + tri.normal.z * keyLight.z
          );
          const dotRim = Math.max(
            0,
            tri.normal.x * rimLight.x + tri.normal.y * rimLight.y + tri.normal.z * rimLight.z
          );
          const shade = Math.max(0.28, Math.min(1.25, 0.34 + dotKey * 0.68 + dotRim * 0.24));
          const spec = Math.pow(dotKey, 12) * 38;
          const [r, g, b] = hexToRgb(tri.color);
          const rr = Math.min(255, Math.round(r * shade + spec));
          const gg = Math.min(255, Math.round(g * shade + spec));
          const bb = Math.min(255, Math.round(b * shade + spec));
          return {
            p0,
            p1,
            p2,
            depth,
            fill: `rgba(${rr}, ${gg}, ${bb}, ${tri.isSubtract ? 0.55 : 1.0})`,
            stroke: `rgba(${rr}, ${gg}, ${bb}, 0.95)`,
          };
        });

        drawable.sort((a, b) => b.depth - a.depth);
        for (const d of drawable) {
          ctx.beginPath();
          ctx.moveTo(d.p0.sx, d.p0.sy);
          ctx.lineTo(d.p1.sx, d.p1.sy);
          ctx.lineTo(d.p2.sx, d.p2.sy);
          ctx.closePath();
          ctx.fillStyle = d.fill;
          ctx.fill();
          ctx.strokeStyle = d.stroke;
          ctx.lineWidth = 0.45;
          ctx.stroke();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [scene, autoRotate, accentBorder]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        camRef.current.dragging = true;
        camRef.current.lastX = e.clientX;
        camRef.current.lastY = e.clientY;
      }}
      onPointerMove={(e) => {
        if (!camRef.current.dragging) return;
        e.stopPropagation();
        const dx = e.clientX - camRef.current.lastX;
        const dy = e.clientY - camRef.current.lastY;
        camRef.current.lastX = e.clientX;
        camRef.current.lastY = e.clientY;
        camRef.current.yaw += dx * 0.01;
        camRef.current.pitch = Math.max(-0.2, Math.min(1.4, camRef.current.pitch + dy * 0.008));
      }}
      onPointerUp={() => {
        camRef.current.dragging = false;
      }}
      onPointerLeave={() => {
        camRef.current.dragging = false;
      }}
    />
  );
}

export function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Hyper-simplistic view state: either 'search' (Searchbar + 5 cards) or 'refine' (AI Refine View)
  const [viewMode, setViewMode] = useState<'search' | 'refine'>('search');
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);

  // Prompt state
  const [newPrompt, setNewPrompt] = useState('');
  const [modifyPrompt, setModifyPrompt] = useState('');

  // 5-Card Discovery & AI Synthesis state
  const [hasSearchedOnce, setHasSearchedOnce] = useState<boolean>(false);
  const [librarySearching, setLibrarySearching] = useState<boolean>(false);
  const [aiGeneratingSlot5, setAiGeneratingSlot5] = useState<boolean>(false);
  const [libraryHits, setLibraryHits] = useState<OpenLibraryModelHit[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [aiSlot5Result, setAiSlot5Result] = useState<GeneratedAiSlotResult | null>(null);
  const [aiSlot5Error, setAiSlot5Error] = useState<string | null>(null);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<SceneVersionSnapshot[]>([]);

  // Viewport controls (tucked in Refine toolbar / drawer)
  const [renderMode, setRenderMode] = useState<ViewRenderMode>('solid');
  const [sliceRatio, setSliceRatio] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'front' | 'top' | 'side'>('iso');
  const [cameraResetKey, setCameraResetKey] = useState<number>(0);

  // Printer config form inside Drawer
  const [configHydrated, setConfigHydrated] = useState(false);
  const [printerIp, setPrinterIp] = useState('');
  const [printerSerial, setPrinterSerial] = useState('');
  const [printerAccessCode, setPrinterAccessCode] = useState('');
  const [printerModel, setPrinterModel] = useState('Bambu Lab P1S');
  const [printerName, setPrinterName] = useState('Bambu X1C WHG');
  const [nozzleDiameterMm, setNozzleDiameterMm] = useState<number>(0.4);
  const [shellyPowerEntityId, setShellyPowerEntityId] = useState('switch.buro_og_plug_90');
  const [lanOnlyMode, setLanOnlyMode] = useState<boolean>(true);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const res = await api.get<DashboardPayload>('/dashboard');
      setData(res);
      if (!configHydrated && res.printerConfig) {
        setPrinterIp(res.printerConfig.ip || '');
        setPrinterSerial(res.printerConfig.serial || '');
        setPrinterModel(res.printerConfig.model || 'Bambu Lab P1S');
        setPrinterName(res.printerConfig.name || 'Bambu X1C WHG');
        setNozzleDiameterMm(res.printerConfig.nozzleDiameterMm || 0.4);
        setShellyPowerEntityId(res.printerConfig.shellyPowerEntityId || '');
        setLanOnlyMode(res.printerConfig.lanOnlyMode ?? true);
        setConfigHydrated(true);
      }
    } catch (err) {
      console.error('Failed loading 3d-print dashboard:', err);
    }
  };

  useEffect(() => {
    void loadDashboard();
    const pollTimer = setInterval(loadDashboard, 3000);
    const clockTimer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [configHydrated]);

  const handleSearchAndGenerate = async (e?: React.FormEvent, customPromptText?: string) => {
    if (e) e.preventDefault();
    const promptText = (customPromptText ?? newPrompt).trim();
    if (!promptText) return;

    setNewPrompt(promptText);
    setViewMode('search');
    setHasSearchedOnce(true);
    setLibrarySearching(true);
    setAiGeneratingSlot5(true);
    setLibraryHits([]);
    setLibraryError(null);
    setAiSlot5Result(null);
    setAiSlot5Error(null);

    // Slots 1-4: Open Library Search (Real Printables STL Downloads)
    const searchTask = api
      .post<{
        ok: boolean;
        error?: string;
        items: OpenLibraryModelHit[];
      }>('/library/search', { prompt: promptText })
      .then((res) => {
        if (res.error && (!res.items || res.items.length === 0)) {
          setLibraryError(res.error);
          setLibraryHits([]);
        } else {
          setLibraryHits(res.items || []);
        }
      })
      .catch((err) => {
        setLibraryError(
          err instanceof Error ? err.message : 'Open-Library-Suche fehlgeschlagen.'
        );
      })
      .finally(() => {
        setLibrarySearching(false);
      });

    // Slot 5 (Rightmost): AI 3D Model Generation via Gemini
    const aiGenTask = api
      .post<GeneratedAiSlotResult & { error?: string }>('/projects/generate', {
        prompt: promptText,
      })
      .then((res) => {
        if (res.error || !res.scene) {
          setAiSlot5Error(res.error || 'KI-3D-Generierung lieferte kein Ergebnis.');
          return;
        }
        setAiSlot5Result(res);
        setVersionHistory([
          {
            id: `ver-1-${Date.now()}`,
            stepNumber: 1,
            prompt: promptText,
            summary: res.summary,
            engine: res.engine,
            timestamp: new Date().toISOString(),
            scene: res.scene,
            stats: res.stats,
          },
        ]);
      })
      .catch((err) => {
        setAiSlot5Error(
          err instanceof Error ? err.message : 'KI-3D-Generierung fehlgeschlagen.'
        );
      })
      .finally(() => {
        setAiGeneratingSlot5(false);
      });

    await Promise.all([searchTask, aiGenTask]);
    await loadDashboard();
  };

  const handleSelectAiSlot5ForRefine = async () => {
    if (!aiSlot5Result) return;
    setModifyError(null);
    await api.post('/projects/select', { projectId: aiSlot5Result.projectId });
    await loadDashboard();
    setViewMode('refine');
  };

  const handleImportLibraryHitToRefine = async (hit: OpenLibraryModelHit) => {
    if (!hit.parametricScene) return;
    setModifyError(null);
    setBusyMessage(`Lade STL "${hit.title}"…`);
    try {
      const res = await api.post<GeneratedAiSlotResult>('/projects/generate', {
        importedScene: hit.parametricScene,
        importedSummary: `Original STL-Mesh "${hit.title}" (@${hit.author}) geladen.`,
      });
      setVersionHistory([
        {
          id: `ver-lib-${Date.now()}`,
          stepNumber: 1,
          prompt: `Import STL: ${hit.title}`,
          summary: res.summary,
          engine: res.engine,
          timestamp: new Date().toISOString(),
          scene: res.scene,
          stats: res.stats,
        },
      ]);
      await loadDashboard();
      setViewMode('refine');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleModifyScene = async (customPrompt?: string) => {
    const p = (customPrompt ?? modifyPrompt).trim();
    if (!p) return;
    setModifyError(null);
    setBusyMessage(`Verfeinere 3D-Modell: "${p}"…`);
    try {
      const res = await api.post<GeneratedAiSlotResult & { error?: string }>('/projects/modify', {
        prompt: p,
      });
      if (res.error) {
        setModifyError(res.error);
        return;
      }
      if (!customPrompt) setModifyPrompt('');
      if (res && res.scene) {
        setVersionHistory((prev) => [
          {
            id: `ver-${prev.length + 1}-${Date.now()}`,
            stepNumber: prev.length + 1,
            prompt: p,
            summary: res.summary,
            engine: res.engine,
            timestamp: new Date().toISOString(),
            scene: res.scene,
            stats: res.stats,
          },
          ...prev,
        ]);
        if (aiSlot5Result && aiSlot5Result.projectId === res.projectId) {
          setAiSlot5Result(res);
        }
      }
      await loadDashboard();
    } catch (err) {
      setModifyError(err instanceof Error ? err.message : 'KI-Änderung fehlgeschlagen.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRestoreVersionSnapshot = async (snap: SceneVersionSnapshot) => {
    if (!data?.activeProject) return;
    setBusyMessage(`Stelle Version #${snap.stepNumber} wieder her…`);
    try {
      const res = await api.post<GeneratedAiSlotResult>('/projects/modify', {
        projectId: data.activeProject.id,
        updatedScene: snap.scene,
      });
      if (aiSlot5Result && aiSlot5Result.projectId === res.projectId) {
        setAiSlot5Result(res);
      }
      await loadDashboard();
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDirectNodeUpdate = async (updatedNodes: PrimitiveNode[]) => {
    if (!data?.activeProject) return;
    const nextScene: SceneSpec = {
      ...data.activeProject.scene,
      nodes: updatedNodes,
    };
    await api.post('/projects/modify', {
      projectId: data.activeProject.id,
      updatedScene: nextScene,
    });
    await loadDashboard();
  };

  const handleExportFile = async (format: '3mf' | 'stl' | 'gcode' | 'obj') => {
    if (format === 'obj') {
      if (!data?.activeProject) return;
      const mesh = compileSceneToMesh(data.activeProject.scene);
      const objText = exportWavefrontObj(mesh, data.activeProject.title);
      const safeSlug =
        data.activeProject.title
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'thassi_3d_model';
      const blob = new Blob([objText], { type: 'model/obj;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeSlug}.obj`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    setBusyMessage(`Exportiere .${format.toUpperCase()}…`);
    try {
      const res = await api.get<{
        filename: string;
        mimeType: string;
        base64: string;
      }>(`/projects/export?format=${format}`);
      const binStr = atob(res.base64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusyMessage(null);
    }
  };

  const handlePrintAction = async (
    action: 'start' | 'pause' | 'resume' | 'stop' | 'light_toggle'
  ) => {
    setBusyMessage(action === 'start' ? 'Sende Druckauftrag…' : `Sende (${action})…`);
    try {
      await api.post('/printer/print', { action });
      await loadDashboard();
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDiscoverPrinter = async () => {
    setBusyMessage('Scanne LAN 192.168.188.0/24…');
    try {
      const res = await api.post<{
        discoveredPrinters: Array<{ ip: string; serial: string; model: string; name?: string }>;
        configuredPrinterProbe: {
          shellyPlugEntity: string;
          shellyPlugState: string;
        };
      }>('/printer/discover', {});
      if (res.discoveredPrinters.length > 0) {
        const p = res.discoveredPrinters[0];
        setPrinterIp(p.ip);
        setPrinterSerial(p.serial);
        if (p.model) setPrinterModel(p.model);
        if (p.name) setPrinterName(p.name);
        setDiscoverResult(`Gefunden: ${p.model} (${p.ip})`);
      } else {
        setDiscoverResult(
          `Kein aktiver Drucker im LAN gefunden (Shelly ${res.configuredPrinterProbe.shellyPlugEntity}: ${res.configuredPrinterProbe.shellyPlugState}).`
        );
      }
      await loadDashboard();
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSavePrinterConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyMessage('Speichere LAN-Setup…');
    try {
      await api.post('/printer/config', {
        ip: printerIp,
        serial: printerSerial,
        accessCode: printerAccessCode,
        model: printerModel,
        name: printerName,
        nozzleDiameterMm,
        shellyPowerEntityId,
        lanOnlyMode,
      });
      setPrinterAccessCode('');
      setDiscoverResult('Gespeichert.');
      await loadDashboard();
    } finally {
      setBusyMessage(null);
    }
  };

  const activeProj = data?.activeProject || null;
  const tel = data?.telemetry;
  const cfg = data?.printerConfig;
  const stats = activeProj?.stats;
  const projects = data?.projects || [];
  const freshness = formatTelemetryFreshness(tel?.lastUpdated, nowMs);

  const statusDotColor =
    tel?.printerState === 'FAILED' || tel?.printerState === 'OFFLINE'
      ? '#ef4444'
      : tel?.connectionMode === 'lan_mqtt_tls' && cfg?.accessCodeConfigured
        ? '#10b981'
        : '#f59e0b';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* MINIMALIST TOP BAR (Everything tucked into Drawers) */}
      <header
        style={{
          height: 48,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--line-hairline)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {viewMode === 'refine' ? (
            <button
              type="button"
              onClick={() => setViewMode('search')}
              className="ghost-btn"
              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--text-primary)' }}
            >
              Zurück zur Suche
            </button>
          ) : (
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--text-secondary)',
              }}
            >
              3D-Print
            </span>
          )}

          {viewMode === 'refine' && activeProj && (
            <span
              className="tabular-nums"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              {activeProj.title}
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {stats?.dimensionsMm.x}×{stats?.dimensionsMm.y}×{stats?.dimensionsMm.z} mm ·{' '}
                {stats?.filamentWeightG} g
              </span>
            </span>
          )}
        </div>

        {/* Right Menu / Drawer Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {busyMessage && (
            <span
              style={{
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                color: '#f59e0b',
                marginRight: 8,
              }}
            >
              {busyMessage}
            </span>
          )}

          {viewMode === 'refine' && (
            <>
              <button
                type="button"
                onClick={() => void handleExportFile('3mf')}
                className="ghost-btn"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
              >
                .3MF
              </button>
              <button
                type="button"
                onClick={() => void handleExportFile('stl')}
                className="ghost-btn"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
              >
                .STL
              </button>
              <button
                type="button"
                onClick={() => void handlePrintAction('start')}
                className="primary-btn"
                style={{ padding: '4px 12px', fontSize: 11.5 }}
              >
                Drucken
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveDrawer(activeDrawer === 'inspector' ? null : 'inspector')
                }
                className="ghost-btn"
                style={{
                  padding: '4px 10px',
                  fontSize: 11.5,
                  borderColor:
                    activeDrawer === 'inspector'
                      ? 'rgba(255,255,255,0.28)'
                      : 'var(--line-hairline)',
                }}
              >
                Inspektor &amp; Verlauf ({activeProj?.scene.nodes.length || 0})
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'projects' ? null : 'projects')}
            className="ghost-btn"
            style={{
              padding: '4px 10px',
              fontSize: 11.5,
              borderColor:
                activeDrawer === 'projects' ? 'rgba(255,255,255,0.28)' : 'var(--line-hairline)',
            }}
          >
            Projekte ({projects.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'printer' ? null : 'printer')}
            className="ghost-btn tabular-nums"
            style={{
              padding: '4px 10px',
              fontSize: 11.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderColor:
                activeDrawer === 'printer' ? 'rgba(255,255,255,0.28)' : 'var(--line-hairline)',
            }}
            title={`Stand: ${freshness.formattedTime} (${freshness.relativeAge})`}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: statusDotColor,
              }}
            />
            <span>{tel?.printerState || 'IDLE'}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {freshness.relativeAge}
            </span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          VIEW 1: HYPER-SIMPLISTIC SEARCH & 5-CARD RESULT GRID
          ===================================================================== */}
      {viewMode === 'search' && (
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: hasSearchedOnce ? 'flex-start' : 'center',
            alignItems: 'center',
            padding: hasSearchedOnce ? '36px 32px' : '0 24px 12vh',
            maxWidth: 1440,
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* THE SEARCHBAR */}
          <form
            onSubmit={(e) => void handleSearchAndGenerate(e)}
            style={{
              width: '100%',
              maxWidth: hasSearchedOnce ? '100%' : 680,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 6,
              padding: '6px 8px 6px 18px',
              transition: 'max-width 0.2s ease',
            }}
          >
            <input
              type="text"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Was möchtest du drucken? (Eingabe + Enter)"
              autoFocus
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 16,
                fontFamily: 'var(--font-sans)',
                padding: '10px 0',
              }}
            />
            <button
              type="submit"
              disabled={!newPrompt.trim() || librarySearching || aiGeneratingSlot5}
              className="primary-btn"
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 500,
                opacity: !newPrompt.trim() ? 0.4 : 1,
              }}
            >
              {librarySearching || aiGeneratingSlot5 ? 'Generiere…' : 'Enter'}
            </button>
          </form>

          {/* 5-CARD RESULT STRIP (4 OPEN LIBRARY HITS + 5TH AI GENERATED MODEL) */}
          {hasSearchedOnce && (
            <div
              style={{
                width: '100%',
                marginTop: 28,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                border: '1px solid var(--line-hairline)',
                background: 'var(--bg-canvas)',
              }}
            >
              {/* SLOTS 1..4: OPEN 3D LIBRARIES (REAL PRINTABLES STL MESHES) */}
              {[0, 1, 2, 3].map((slotIdx) => {
                const hit = libraryHits[slotIdx];
                const isLoading = librarySearching;

                return (
                  <div
                    key={`slot-${slotIdx + 1}`}
                    style={{
                      borderRight: '1px solid var(--line-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 370,
                      background: 'var(--bg-canvas)',
                    }}
                  >
                    {isLoading ? (
                      <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div className="shimmer-block" style={{ width: '42%', height: 10 }} />
                          <div className="shimmer-block" style={{ width: '18%', height: 10 }} />
                        </div>
                        <div
                          className="shimmer-block"
                          style={{ width: '100%', height: 220, marginTop: 12, borderRadius: 4 }}
                        />
                        <div
                          className="shimmer-block"
                          style={{ width: '80%', height: 14, marginTop: 14 }}
                        />
                        <div
                          className="shimmer-block"
                          style={{ width: '55%', height: 10, marginTop: 8 }}
                        />
                      </div>
                    ) : !hit ? (
                      <div
                        style={{
                          padding: 20,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: '#ef4444',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {slotIdx + 1}/5 · KEIN ERGEBNIS
                        </span>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          {libraryError ||
                            `Kein weiteres druckbares 3D-Modell in der Open Library für "${newPrompt}" gefunden.`}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Card Top Header */}
                        <div
                          style={{
                            padding: '12px 14px 8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid var(--line-hairline)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.06em',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {slotIdx + 1}/5 · {hit.repository}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {hit.dimensionsLabel}
                          </span>
                        </div>

                        {/* Interactive 3D Model Preview (Real parsed STL mesh from Printables) */}
                        <div
                          onClick={() => {
                            if (hit.parametricScene) {
                              void handleImportLibraryHitToRefine(hit);
                            }
                          }}
                          style={{
                            height: 230,
                            width: '100%',
                            position: 'relative',
                            cursor: hit.parametricScene ? 'pointer' : 'default',
                            borderBottom: '1px solid var(--line-hairline)',
                          }}
                        >
                          {hit.parametricScene ? (
                            <MiniCard3dViewport scene={hit.parametricScene} autoRotate={true} />
                          ) : (
                            <div
                              style={{
                                height: '100%',
                                padding: 16,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                gap: 6,
                                fontSize: 11.5,
                                color: '#ef4444',
                              }}
                            >
                              <span>STL-Vorschau fehlgeschlagen:</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {hit.meshError || 'STL-Datei konnte nicht geladen werden.'}
                              </span>
                            </div>
                          )}
                          {hit.thumbnailUrl && (
                            <img
                              src={hit.thumbnailUrl}
                              alt={hit.title}
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                              style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                width: 42,
                                height: 42,
                                objectFit: 'cover',
                                borderRadius: 4,
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: '#111113',
                              }}
                            />
                          )}
                        </div>

                        {/* Card Footer */}
                        <div
                          style={{
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}
                        >
                          <div
                            onClick={() => {
                              if (hit.parametricScene) {
                                void handleImportLibraryHitToRefine(hit);
                              }
                            }}
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              cursor: hit.parametricScene ? 'pointer' : 'default',
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              minHeight: 35,
                            }}
                          >
                            {hit.title}
                          </div>

                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            {hit.parametricScene && (
                              <button
                                type="button"
                                onClick={() => void handleImportLibraryHitToRefine(hit)}
                                className="ghost-btn"
                                style={{ flex: 1, padding: '6px 8px', fontSize: 11.5 }}
                              >
                                3D Öffnen
                              </button>
                            )}
                            <a
                              href={hit.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ghost-btn"
                              style={{
                                padding: '6px 8px',
                                fontSize: 11,
                                textDecoration: 'none',
                                color: 'var(--text-muted)',
                              }}
                            >
                              Printables
                            </a>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* SLOT 5 (RIGHTMOST): AI-GENERATED 3D MODEL -> CLICK TO REFINE */}
              <div
                onClick={() => {
                  if (!aiGeneratingSlot5 && aiSlot5Result) {
                    void handleSelectAiSlot5ForRefine();
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 370,
                  background: '#0d0d10',
                  cursor: !aiGeneratingSlot5 && aiSlot5Result ? 'pointer' : 'default',
                  borderLeft: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                {aiGeneratingSlot5 ? (
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div className="shimmer-block" style={{ width: '50%', height: 10 }} />
                      <div className="shimmer-block" style={{ width: '20%', height: 10 }} />
                    </div>
                    <div
                      className="shimmer-block"
                      style={{ width: '100%', height: 220, marginTop: 12, borderRadius: 4 }}
                    />
                    <div
                      className="shimmer-block"
                      style={{ width: '85%', height: 14, marginTop: 14 }}
                    />
                    <div
                      className="shimmer-block"
                      style={{ width: '60%', height: 10, marginTop: 8 }}
                    />
                  </div>
                ) : aiSlot5Error || !aiSlot5Result ? (
                  <div
                    style={{
                      padding: 20,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: '#ef4444',
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                      }}
                    >
                      5/5 · KI-GENERIERUNG FEHLGESCHLAGEN
                    </span>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {aiSlot5Error || 'KI-Modell konnte nicht generiert werden.'}
                    </div>
                    <a
                      href="/apps/cortex/?tab=vault"
                      onClick={(e) => e.stopPropagation()}
                      className="ghost-btn"
                      style={{
                        marginTop: 4,
                        padding: '6px 10px',
                        fontSize: 11.5,
                        textDecoration: 'none',
                        textAlign: 'center',
                      }}
                    >
                      API-Key im Cortex Vault prüfen
                    </a>
                  </div>
                ) : (
                  <>
                    {/* Slot 5 Header */}
                    <div
                      style={{
                        padding: '12px 14px 8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid var(--line-hairline)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.06em',
                          color: '#10b981',
                          fontWeight: 600,
                        }}
                      >
                        5/5 · KI-GENERIERT
                      </span>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {aiSlot5Result.stats.dimensionsMm.x}×{aiSlot5Result.stats.dimensionsMm.y}×
                        {aiSlot5Result.stats.dimensionsMm.z} mm
                      </span>
                    </div>

                    {/* Interactive 3D Viewport */}
                    <div
                      style={{
                        height: 230,
                        width: '100%',
                        position: 'relative',
                        borderBottom: '1px solid var(--line-hairline)',
                      }}
                    >
                      <MiniCard3dViewport
                        scene={aiSlot5Result.scene}
                        autoRotate={true}
                        accentBorder={true}
                      />
                    </div>

                    {/* Slot 5 Footer */}
                    <div
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: 35,
                        }}
                      >
                        {aiSlot5Result.scene.title}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSelectAiSlot5ForRefine();
                        }}
                        className="primary-btn"
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          fontSize: 11.5,
                          marginTop: 2,
                        }}
                      >
                        Verfeinern (KI-Refine)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* =====================================================================
          VIEW 2: HYPER-SIMPLISTIC AI REFINE PAGE (3D Canvas + Prompt Bar)
          ===================================================================== */}
      {viewMode === 'refine' && (
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            height: 'calc(100vh - 48px)',
            overflow: 'hidden',
          }}
        >
          {/* Floating Minimal Camera / Render Mode Pill (Top-Left of Canvas) */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 24,
              zIndex: 10,
              display: 'flex',
              gap: 6,
              background: 'rgba(17, 17, 19, 0.85)',
              border: '1px solid var(--line-hairline)',
              padding: 4,
              borderRadius: 6,
            }}
          >
            {(
              [
                { id: 'solid', label: 'Solid' },
                { id: 'wireframe', label: 'Wire' },
                { id: 'xray', label: 'X-Ray' },
                { id: 'slicer', label: 'Schichten' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setRenderMode(m.id)}
                className="ghost-btn"
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  border: 'none',
                  background: renderMode === m.id ? 'var(--bg-input)' : 'transparent',
                  color: renderMode === m.id ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              className="ghost-btn"
              style={{
                padding: '3px 8px',
                fontSize: 11,
                border: 'none',
                color: autoRotate ? '#10b981' : 'var(--text-muted)',
              }}
            >
              Auto-Rotation
            </button>
          </div>

          {/* Full-Screen 3D Canvas */}
          <div style={{ flex: 1, width: '100%', height: '100%' }}>
            <Interactive3dViewport
              scene={activeProj?.scene || null}
              renderMode={renderMode}
              sliceRatio={sliceRatio}
              autoRotate={autoRotate}
              cameraResetKey={cameraResetKey}
              cameraPreset={cameraPreset}
            />
          </div>

          {/* Bottom Floating Prompt Bar for Iterative Text Refinement */}
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 720,
              padding: '0 20px',
              zIndex: 10,
            }}
          >
            {modifyError && (
              <div
                style={{
                  marginBottom: 8,
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#fca5a5',
                }}
              >
                {modifyError}
              </div>
            )}

            {activeProj?.scene.promptHistory?.[0] && (
              <div
                style={{
                  marginBottom: 8,
                  padding: '6px 12px',
                  background: 'rgba(17, 17, 19, 0.9)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{activeProj.scene.promptHistory[0].summary}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeProj.scene.nodes.length} Bauteile
                </span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleModifyScene();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#111113',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: 6,
                padding: '6px 8px 6px 16px',
              }}
            >
              <input
                type="text"
                value={modifyPrompt}
                onChange={(e) => setModifyPrompt(e.target.value)}
                placeholder="Änderung beschreiben… (z.B. '25% höher', 'Farbe Blau', '10mm Bohrung in die Mitte', 'Henkel hinzufügen')"
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  padding: '8px 0',
                }}
              />
              <button
                type="submit"
                disabled={!modifyPrompt.trim()}
                className="primary-btn"
                style={{
                  padding: '8px 16px',
                  fontSize: 12.5,
                  opacity: !modifyPrompt.trim() ? 0.4 : 1,
                }}
              >
                Anwenden
              </button>
            </form>
          </div>
        </main>
      )}

      {/* =====================================================================
          SLIDE-OVER DRAWERS (Inspector, Saved Projects, Printer & Setup)
          ===================================================================== */}
      {activeDrawer && (
        <div
          onClick={() => setActiveDrawer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 440,
              maxWidth: '92vw',
              height: '100vh',
              background: '#111113',
              borderLeft: '1px solid var(--line-hairline)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: 24,
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 14,
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                }}
              >
                {activeDrawer === 'inspector'
                  ? 'CAD-Inspektor, Slicer & Verlauf'
                  : activeDrawer === 'projects'
                    ? 'Gespeicherte 3D-Projekte'
                    : 'Bambu Lab Drucker & LAN-Setup'}
              </span>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="ghost-btn"
                style={{ padding: '3px 8px', fontSize: 11.5 }}
              >
                Schließen
              </button>
            </div>

            {/* DRAWER 1: INSPECTOR & VERSION HISTORY */}
            {activeDrawer === 'inspector' && activeProj && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Layer Slicer Slider */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    <span>SCHICHT-VORSCHAU (SLICER)</span>
                    <span>
                      {Math.max(1, Math.round(sliceRatio * (stats?.layerCount || 1)))} /{' '}
                      {stats?.layerCount || 1} ({Math.round(sliceRatio * 100)}%)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={1.0}
                    step={0.01}
                    value={sliceRatio}
                    onChange={(e) => setSliceRatio(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Export Formats */}
                <div>
                  <div style={sectionLabelStyle}>DATEI-EXPORT</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {(['3mf', 'stl', 'obj', 'gcode'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => void handleExportFile(fmt)}
                        className="ghost-btn"
                        style={{ padding: '6px 8px', fontSize: 11.5 }}
                      >
                        .{fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Version History */}
                <div>
                  <div style={sectionLabelStyle}>PROMPT-VERLAUF</div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    {versionHistory.map((snap) => (
                      <div
                        key={snap.id}
                        style={{
                          padding: 10,
                          border: '1px solid var(--line-hairline)',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                            &ldquo;{snap.prompt}&rdquo;
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {snap.summary}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRestoreVersionSnapshot(snap)}
                          className="ghost-btn"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                        >
                          Laden
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Parametric Nodes */}
                <div>
                  <div style={sectionLabelStyle}>
                    CAD-BAUTEILE ({activeProj.scene.nodes.length})
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginTop: 8,
                    }}
                  >
                    {activeProj.scene.nodes.map((node, idx) => (
                      <div
                        key={node.id}
                        style={{
                          padding: 10,
                          border: '1px solid var(--line-hairline)',
                          borderRadius: 4,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{node.name}</span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {node.type} ({node.operation})
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 6,
                          }}
                        >
                          {Object.entries(node.params).map(([pKey, pVal]) => (
                            <label
                              key={pKey}
                              style={{
                                fontSize: 10.5,
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {pKey}
                              <input
                                type="number"
                                step="any"
                                value={pVal}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const nextNodes = activeProj.scene.nodes.map((n, i) =>
                                    i === idx
                                      ? { ...n, params: { ...n.params, [pKey]: val } }
                                      : n
                                  );
                                  void handleDirectNodeUpdate(nextNodes);
                                }}
                                style={{ ...inputStyle, marginTop: 2, padding: '4px 6px' }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* DRAWER 2: SAVED PROJECTS */}
            {activeDrawer === 'projects' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects.map((p) => {
                  const isSelected = p.id === activeProj?.id;
                  return (
                    <div
                      key={p.id}
                      onClick={async () => {
                        await api.post('/projects/select', { projectId: p.id });
                        await loadDashboard();
                        setActiveDrawer(null);
                        setViewMode('refine');
                      }}
                      style={{
                        padding: 12,
                        border: '1px solid var(--line-hairline)',
                        borderColor: isSelected
                          ? 'rgba(16, 185, 129, 0.45)'
                          : 'var(--line-hairline)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.title}</div>
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            marginTop: 4,
                          }}
                        >
                          {p.stats.dimensionsMm.x}×{p.stats.dimensionsMm.y}×
                          {p.stats.dimensionsMm.z} mm · {p.stats.filamentWeightG} g
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.post('/projects/delete', { projectId: p.id });
                          await loadDashboard();
                        }}
                        className="ghost-btn"
                        style={{ padding: '4px 8px', fontSize: 11, color: '#ef4444' }}
                      >
                        Löschen
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* DRAWER 3: PRINTER TELEMETRY & LAN SETUP */}
            {activeDrawer === 'printer' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* Live Telemetry Summary */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    paddingBottom: 16,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div>
                    <div style={sectionLabelStyle}>STATUS</div>
                    <div
                      className="tabular-nums"
                      style={{ fontSize: 18, fontFamily: 'var(--font-mono)', marginTop: 4 }}
                    >
                      {tel?.printerState || 'IDLE'} ({tel?.progressPercent || 0}%)
                    </div>
                  </div>
                  <div>
                    <div style={sectionLabelStyle}>TEMPERATUREN</div>
                    <div
                      className="tabular-nums"
                      style={{ fontSize: 14, fontFamily: 'var(--font-mono)', marginTop: 4 }}
                    >
                      Düse {tel?.nozzleTempC ?? 24}°C · Bett {tel?.bedTempC ?? 24}°C
                    </div>
                  </div>
                </div>

                {/* Printer Controls */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void handlePrintAction('start')}
                    className="primary-btn"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
                  >
                    Druck starten
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrintAction('pause')}
                    className="ghost-btn"
                    style={{ padding: '7px 10px', fontSize: 12 }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrintAction('stop')}
                    className="ghost-btn"
                    style={{ padding: '7px 10px', fontSize: 12, color: '#ef4444' }}
                  >
                    Stopp
                  </button>
                </div>

                {/* LAN Configuration Form */}
                <form
                  onSubmit={handleSavePrinterConfig}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: '1px solid var(--line-hairline)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={sectionLabelStyle}>BAMBU LAB LAN-KONFIGURATION</span>
                    <button
                      type="button"
                      onClick={() => void handleDiscoverPrinter()}
                      className="ghost-btn"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                    >
                      LAN-Scan
                    </button>
                  </div>

                  {discoverResult && (
                    <div
                      style={{
                        fontSize: 11.5,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {discoverResult}
                    </div>
                  )}

                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    Drucker-IP
                    <input
                      type="text"
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      style={{ ...inputStyle, marginTop: 4 }}
                    />
                  </label>

                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    Seriennummer
                    <input
                      type="text"
                      value={printerSerial}
                      onChange={(e) => setPrinterSerial(e.target.value)}
                      style={{ ...inputStyle, marginTop: 4 }}
                    />
                  </label>

                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    LAN Access Code (8-stellig)
                    <input
                      type="password"
                      value={printerAccessCode}
                      onChange={(e) => setPrinterAccessCode(e.target.value)}
                      placeholder={cfg?.accessCodeConfigured ? '•••••••• (hinterlegt)' : 'z.B. 12345678'}
                      style={{ ...inputStyle, marginTop: 4 }}
                    />
                  </label>

                  <button
                    type="submit"
                    className="primary-btn"
                    style={{ padding: '8px 14px', fontSize: 12, marginTop: 4 }}
                  >
                    Speichern
                  </button>
                </form>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 4,
  padding: '7px 10px',
  fontSize: 12.5,
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
