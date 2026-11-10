import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CatalogSourceItem,
  CustomWallSegment,
  DoorSwingDir,
  FloorConnector,
  FloorDevice,
  FloorDeviceCategory,
  FloorLabelItem,
  FloorLevel,
  FloorOpening,
  FloorplanBootstrapPayload,
  FloorRoom,
  FloorWireSegment,
  LiveSourceTelemetry,
  WireKind,
} from '../../shared/types.js';
import {
  BLUEPRINT_CONNECTORS,
  BLUEPRINT_DEVICES,
  BLUEPRINT_FLOORS,
  BLUEPRINT_LABELS,
  BLUEPRINT_OPENINGS,
  BLUEPRINT_ROOMS,
  BLUEPRINT_WALLS,
  BLUEPRINT_WIRES,
  DOOR_PRESETS,
  EG_CLEAR_HEIGHT_M,
  HOUSE_OUTER_DEPTH_M,
  HOUSE_OUTER_WIDTH_M,
  OG_CLEAR_HEIGHT_M,
  OG_ELEVATION_M,
  PLAUSIBILITY_CHECKS,
  WINDOW_PRESETS,
  compileHouse3DModel,
  exportHouseGltfJson,
  exportHouseWavefrontObj,
  type OpeningPreset,
  type Vec3,
} from '../../shared/house-blueprint.js';

const API_BASE = '/api/apps/floorplan';

type ViewMode = '3d' | '2d' | 'checks';
type FloorFilter = 'exploded' | 'all' | 'og' | 'eg';
type WallCutMode = 'cutaway' | 'full' | 'roof';

type ToolGroup = 'wall' | 'openings' | 'label' | 'devices' | 'wiring';
type ActiveSubTool =
  | 'none'
  | 'wall_add'
  | 'wall_move'
  | 'wall_edit'
  | 'wall_delete'
  | 'opening_add_window'
  | 'opening_add_door'
  | 'opening_edit'
  | 'label_add'
  | 'label_edit'
  | 'device_add_item'
  | 'device_add_light'
  | 'wire_add'
  | 'wire_edit'
  | 'wire_delete';

const WIRE_COLORS: Record<WireKind, string> = {
  power_230v: '#f59e0b',
  network_cat7: '#38bdf8',
  switch_line: '#a855f7',
  water_heating: '#10b981',
};

const WIRE_LABELS: Record<WireKind, string> = {
  power_230v: '230V Strom (NYM-J)',
  network_cat7: 'LAN / CAT7 / Glasfaser',
  switch_line: 'Schaltdraht / Shelly',
  water_heating: 'Heizung / Wasser',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-AT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

function shadeColor(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function distToSegment2D(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [floorFilter, setFloorFilter] = useState<FloorFilter>('exploded');
  const [wallCutMode, setWallCutMode] = useState<WallCutMode>('cutaway');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showWires, setShowWires] = useState<boolean>(true);
  const [wireframe, setWireframe] = useState<boolean>(false);

  // Edit Mode & Right-Aligned Icon Toolbar State
  const [editMode, setEditMode] = useState<boolean>(false);
  const [openToolGroup, setOpenToolGroup] = useState<ToolGroup | null>('wall');
  const [activeSubTool, setActiveSubTool] = useState<ActiveSubTool>('none');
  const [editTargetFloor, setEditTargetFloor] = useState<'og' | 'eg'>('og');
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Tool Drafts & Selected Objects
  const [wallDraftStart, setWallDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [newWallThicknessCm, setNewWallThicknessCm] = useState<number>(25);
  const [newWallMaterial, setNewWallMaterial] = useState<'existing' | 'new' | 'partition'>('new');
  const [selectedWallId, setSelectedWallId] = useState<string | null>('og-w-south');

  const [selectedWindowPreset, setSelectedWindowPreset] = useState<OpeningPreset>(WINDOW_PRESETS[0]);
  const [selectedDoorPreset, setSelectedDoorPreset] = useState<OpeningPreset>(DOOR_PRESETS[0]);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);

  const [newLabelText, setNewLabelText] = useState<string>('Neues Label');
  const [newLabelSubtext, setNewLabelSubtext] = useState<string>('');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  const [deviceSearch, setDeviceSearch] = useState<string>('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogSourceItem | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [wireDraftStart, setWireDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [newWireKind, setNewWireKind] = useState<WireKind>('power_230v');
  const [newWireLabel, setNewWireLabel] = useState<string>('NYM-J 3x1,5');
  const [newWireElevationM, setNewWireElevationM] = useState<number>(2.4);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  // Core Floorplan Data State (Single-Wall Topology: BLUEPRINT_WALLS)
  const [floors, setFloors] = useState<FloorLevel[]>(BLUEPRINT_FLOORS);
  const [rooms, setRooms] = useState<FloorRoom[]>(BLUEPRINT_ROOMS);
  const [openings, setOpenings] = useState<FloorOpening[]>(BLUEPRINT_OPENINGS);
  const [connectors, setConnectors] = useState<FloorConnector[]>(BLUEPRINT_CONNECTORS);
  const [devices, setDevices] = useState<FloorDevice[]>(BLUEPRINT_DEVICES);
  const [customWalls, setCustomWalls] = useState<CustomWallSegment[]>(BLUEPRINT_WALLS);
  const [customLabels, setCustomLabels] = useState<FloorLabelItem[]>(BLUEPRINT_LABELS);
  const [wires, setWires] = useState<FloorWireSegment[]>(BLUEPRINT_WIRES);
  const [catalog, setCatalog] = useState<CatalogSourceItem[]>([]);
  const [liveMap, setLiveMap] = useState<Record<string, LiveSourceTelemetry>>({});

  const [lastSyncIso, setLastSyncIso] = useState<string>(new Date().toISOString());
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>('og-wohnzimmer');
  const [active2dFloor, setActive2dFloor] = useState<'og' | 'eg'>('og');

  // Isometric Camera State
  const [yawDeg, setYawDeg] = useState<number>(42);
  const [pitchDeg, setPitchDeg] = useState<number>(32);
  const [zoom, setZoom] = useState<number>(32);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 20 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    mode: 'orbit' | 'pan' | 'move_wall';
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    startPanX: number;
    startPanY: number;
    wallId?: string;
    initialWalls?: CustomWallSegment[];
    startFloorPt?: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const roomHitScreenPolysRef = useRef<
    Array<{ roomId: string; floorId: string; pts: Array<{ x: number; y: number }> }>
  >([]);
  const lightSpheresScreenRef = useRef<
    Array<{ deviceId: string; entityId: string; x: number; y: number; r: number }>
  >([]);
  const deviceNodesScreenRef = useRef<
    Array<{ deviceId: string; entityId: string; x: number; y: number; r: number }>
  >([]);
  const openingNodesScreenRef = useRef<
    Array<{ openingId: string; x: number; y: number; r: number }>
  >([]);
  const labelNodesScreenRef = useRef<
    Array<{ labelId: string; isRoom: boolean; x: number; y: number; r: number }>
  >([]);
  const wireSegmentsScreenRef = useRef<
    Array<{ wireId: string; x1: number; y1: number; x2: number; y2: number }>
  >([]);

  const persistState = useCallback(
    async (next: {
      rooms?: FloorRoom[];
      openings?: FloorOpening[];
      devices?: FloorDevice[];
      customWalls?: CustomWallSegment[];
      customLabels?: FloorLabelItem[];
      wires?: FloorWireSegment[];
    }) => {
      setSaveStatus('Speichert...');
      try {
        const res = await fetch(`${API_BASE}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            floors,
            rooms: next.rooms ?? rooms,
            openings: next.openings ?? openings,
            connectors,
            devices: next.devices ?? devices,
            customWalls: next.customWalls ?? customWalls,
            customLabels: next.customLabels ?? customLabels,
            wires: next.wires ?? wires,
          }),
        });
        if (res.ok) {
          setLastSyncIso(new Date().toISOString());
          setSaveStatus('Gespeichert');
          setTimeout(() => setSaveStatus(''), 1800);
        }
      } catch {
        setSaveStatus('Lokal aktiv');
      }
    },
    [floors, rooms, openings, connectors, devices, customWalls, customLabels, wires]
  );

  // Bootstrap from backend
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/bootstrap`);
        if (!res.ok) return;
        const data = (await res.json()) as FloorplanBootstrapPayload;
        if (!mounted) return;
        if (Array.isArray(data.floors) && data.floors.length > 0) setFloors(data.floors);
        if (Array.isArray(data.rooms) && data.rooms.length >= 10) setRooms(data.rooms);
        if (Array.isArray(data.openings) && data.openings.length > 0) setOpenings(data.openings);
        if (Array.isArray(data.connectors) && data.connectors.length > 0)
          setConnectors(data.connectors);
        if (Array.isArray(data.devices) && data.devices.length > 0) setDevices(data.devices);
        if (Array.isArray(data.customWalls) && data.customWalls.length > 0) {
          setCustomWalls(data.customWalls);
        }
        if (Array.isArray(data.customLabels)) setCustomLabels(data.customLabels);
        if (Array.isArray(data.wires)) setWires(data.wires);
        if (Array.isArray(data.catalog)) setCatalog(data.catalog);
        if (data.liveMap) setLiveMap(data.liveMap);
        setLastSyncIso(data.savedAt || new Date().toISOString());
      } catch {}
    }
    load();
    const timer = setInterval(async () => {
      setNowTick(Date.now());
      try {
        const res = await fetch(`${API_BASE}/live`);
        if (res.ok) {
          const d = await res.json();
          if (mounted && d.liveMap) {
            setLiveMap(d.liveMap);
            setLastSyncIso(d.updatedAt || new Date().toISOString());
          }
        }
      } catch {}
    }, 8000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const compiledModel = useMemo(() => {
    return compileHouse3DModel({
      rooms,
      openings,
      customWalls,
      includeRoof: wallCutMode === 'roof',
      wallCutawayRatio: wallCutMode === 'cutaway' ? 0.45 : 1.0,
    });
  }, [rooms, openings, customWalls, wallCutMode]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const selectedWall = useMemo(
    () => customWalls.find((w) => w.id === selectedWallId) || null,
    [customWalls, selectedWallId]
  );

  const selectedOpening = useMemo(
    () => openings.find((o) => o.id === selectedOpeningId) || null,
    [openings, selectedOpeningId]
  );

  const selectedWire = useMemo(
    () => wires.find((w) => w.id === selectedWireId) || null,
    [wires, selectedWireId]
  );

  const selectedCustomLabel = useMemo(
    () => customLabels.find((l) => l.id === selectedLabelId) || null,
    [customLabels, selectedLabelId]
  );

  const lightCatalog = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase();
    const list = catalog.filter(
      (c) =>
        c.domain === 'light' ||
        c.suggestedCategory === 'light' ||
        c.id.includes('licht') ||
        c.id.includes('light') ||
        c.id.includes('led')
    );
    const fallbackLights: CatalogSourceItem[] = [
      {
        id: 'light.buro_og_grosses_licht',
        sourceType: 'ha_entity',
        domain: 'light',
        suggestedCategory: 'light',
        label: 'Büro OG Großes Licht',
        roomHint: 'Büro OG',
        state: 'on',
        unit: '',
        pairedEntityId: 'sensor.links_power',
        pairedValue: '',
        pairedUnit: 'W',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: true,
      },
      {
        id: 'switch.vorzimmer_og_grosses_licht',
        sourceType: 'ha_entity',
        domain: 'switch',
        suggestedCategory: 'light',
        label: 'Diele OG Großes Licht',
        roomHint: 'Diele OG',
        state: 'off',
        unit: '',
        pairedEntityId: '',
        pairedValue: '',
        pairedUnit: '',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: false,
      },
      {
        id: 'light.vorzimmer_og_bodenbeleuchtung_led',
        sourceType: 'ha_entity',
        domain: 'light',
        suggestedCategory: 'light',
        label: 'Vorraum Bodenbeleuchtung LED',
        roomHint: 'Vorraum OG',
        state: 'on',
        unit: '',
        pairedEntityId: '',
        pairedValue: '',
        pairedUnit: '',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: true,
      },
      {
        id: 'switch.wohnkueche_bodenbeleuchtung_boden',
        sourceType: 'ha_entity',
        domain: 'switch',
        suggestedCategory: 'light',
        label: 'Wohnzimmer Beleuchtung',
        roomHint: 'Wohnzimmer',
        state: 'off',
        unit: '',
        pairedEntityId: '',
        pairedValue: '',
        pairedUnit: '',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: false,
      },
      {
        id: 'switch.gaestezimmer_schalter_rechts',
        sourceType: 'ha_entity',
        domain: 'switch',
        suggestedCategory: 'light',
        label: 'Zimmer 3 Deckenlicht (Shelly 2PM)',
        roomHint: 'Zimmer 3',
        state: 'off',
        unit: '',
        pairedEntityId: '',
        pairedValue: '',
        pairedUnit: '',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: false,
      },
    ];
    const merged = list.length > 0 ? list : fallbackLights;
    if (!q) return merged;
    return merged.filter(
      (item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    );
  }, [catalog, deviceSearch]);

  const haDeviceCatalog = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase();
    const fallbackDevices: CatalogSourceItem[] = [
      {
        id: 'switch.shelly1pmminig4_7c2c676dc6fc',
        sourceType: 'ha_entity',
        domain: 'switch',
        suggestedCategory: 'appliance',
        label: 'Shelly 1PM Mini G4 (Waschmaschine)',
        roomHint: 'Bad OG',
        state: 'off',
        unit: 'W',
        pairedEntityId: 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung',
        pairedValue: '0',
        pairedUnit: 'W',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: false,
      },
      {
        id: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
        sourceType: 'ha_entity',
        domain: 'sensor',
        suggestedCategory: 'climate',
        label: 'Shelly H&T Gen3 Raumklima',
        roomHint: 'Büro OG',
        state: '22.4',
        unit: '°C',
        pairedEntityId: 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
        pairedValue: '46',
        pairedUnit: '%',
        targetAppId: 'smart-canvas',
        controllable: false,
        isOn: true,
      },
      {
        id: 'switch.buro_og_plug_90',
        sourceType: 'ha_entity',
        domain: 'switch',
        suggestedCategory: 'switch',
        label: 'Shelly Plug S .90 Schreibtisch',
        roomHint: 'Büro OG',
        state: 'on',
        unit: '',
        pairedEntityId: 'sensor.kleines_licht_pumpe_power',
        pairedValue: '',
        pairedUnit: 'W',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: true,
      },
      {
        id: 'binary_sensor.shelly_blu_motion_19ca_bewegung',
        sourceType: 'ha_entity',
        domain: 'binary_sensor',
        suggestedCategory: 'motion',
        label: 'Shelly BLU Motion Stiegenhaus',
        roomHint: 'Stiegenhaus',
        state: 'off',
        unit: '',
        pairedEntityId: 'sensor.shelly_blu_motion_19ca_beleuchtungsstarke',
        pairedValue: '',
        pairedUnit: 'lx',
        targetAppId: 'smart-canvas',
        controllable: false,
        isOn: false,
      },
      {
        id: 'media_player.tv_samsung_6_series_49',
        sourceType: 'ha_entity',
        domain: 'media_player',
        suggestedCategory: 'media',
        label: 'Samsung 49" Smart TV',
        roomHint: 'Wohnzimmer',
        state: 'off',
        unit: '',
        pairedEntityId: '',
        pairedValue: '',
        pairedUnit: '',
        targetAppId: 'smart-canvas',
        controllable: true,
        isOn: false,
      },
    ];
    const merged = catalog.length > 0 ? catalog : fallbackDevices;
    if (!q) return merged.slice(0, 40);
    return merged
      .filter((item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [catalog, deviceSearch]);

  const projectPoint = useCallback(
    (
      p: Vec3,
      cx: number,
      cy: number,
      yawRad: number,
      pitchRad: number,
      scale: number
    ): { x: number; y: number; depth: number } => {
      const rx = p.x - HOUSE_OUTER_WIDTH_M / 2;
      const ry = p.y - HOUSE_OUTER_DEPTH_M / 2;
      const rz = p.z - 2.6;

      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);

      const x1 = rx * cosY - ry * sinY;
      const y1 = rx * sinY + ry * cosY;

      const sx = cx + panOffset.x + x1 * scale;
      const sy = cy + panOffset.y + (y1 * sinP - rz * cosP) * scale;
      const depth = y1 * cosP + rz * sinP;

      return { x: sx, y: sy, depth };
    },
    [panOffset]
  );

  const screenToFloorCm = useCallback(
    (sx: number, sy: number, targetFloor: 'og' | 'eg'): { x: number; y: number } => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const cx = (rect?.width || 900) / 2;
      const cy = (rect?.height || 650) / 2;
      const yawRad = (yawDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const cosP = Math.cos(pitchRad);
      const sinP = Math.max(0.18, Math.sin(pitchRad));

      const ogZShift = floorFilter === 'exploded' ? 3.8 : 0.0;
      const zFloor = targetFloor === 'og' ? OG_ELEVATION_M + ogZShift : 0.0;
      const rz = zFloor - 2.6;

      const x1 = (sx - cx - panOffset.x) / zoom;
      const y1 = ((sy - cy - panOffset.y) / zoom + rz * cosP) / sinP;

      const rx = x1 * cosY + y1 * sinY;
      const ry = -x1 * sinY + y1 * cosY;

      const xM = Math.max(0, Math.min(HOUSE_OUTER_WIDTH_M, rx + HOUSE_OUTER_WIDTH_M / 2));
      const yM = Math.max(0, Math.min(HOUSE_OUTER_DEPTH_M, ry + HOUSE_OUTER_DEPTH_M / 2));

      return {
        x: Math.round((xM * 100) / 5) * 5,
        y: Math.round((yM * 100) / 5) * 5,
      };
    },
    [yawDeg, pitchDeg, zoom, panOffset, floorFilter]
  );

  const handleToggleDevice = useCallback(async (entityId: string) => {
    if (!entityId) return;
    setLiveMap((prev) => {
      const cur = prev[entityId];
      const nextOn = cur ? !cur.isOn : true;
      return {
        ...prev,
        [entityId]: {
          id: entityId,
          state: nextOn ? 'on' : 'off',
          unit: cur?.unit || '',
          isOn: nextOn,
          controllable: true,
          secondaryValue: cur?.secondaryValue || '',
          secondaryUnit: cur?.secondaryUnit || '',
          summaryText: nextOn ? 'EIN' : 'AUS',
          updatedAt: new Date().toISOString(),
        },
      };
    });
    try {
      const res = await fetch(`${API_BASE}/device/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, action: 'toggle' }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.liveMap) setLiveMap(d.liveMap);
      }
    } catch {}
  }, []);

  // Render Isometric 3D Scene
  useEffect(() => {
    if (viewMode !== '3d') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(300, rect.width);
      const h = Math.max(300, rect.height);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const yawRad = (yawDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;
      const ogZShift = floorFilter === 'exploded' ? 3.8 : 0.0;

      // 1. Reference grid (1m intervals)
      ctx.strokeStyle = editMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let gx = -1; gx <= 13; gx += 1) {
        const a = projectPoint({ x: gx, y: -1, z: -0.25 }, cx, cy, yawRad, pitchRad, zoom);
        const b = projectPoint({ x: gx, y: 18, z: -0.25 }, cx, cy, yawRad, pitchRad, zoom);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let gy = -1; gy <= 18; gy += 1) {
        const a = projectPoint({ x: -1, y: gy, z: -0.25 }, cx, cy, yawRad, pitchRad, zoom);
        const b = projectPoint({ x: 13, y: gy, z: -0.25 }, cx, cy, yawRad, pitchRad, zoom);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // 2. Exploded alignment guides
      if (floorFilter === 'exploded') {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        for (const [kx, ky] of [
          [0, 0],
          [11.9, 0],
          [11.9, 16.9],
          [0, 16.9],
          [8.45, 7.1],
        ]) {
          const pBot = projectPoint({ x: kx, y: ky, z: 3.0 }, cx, cy, yawRad, pitchRad, zoom);
          const pTop = projectPoint(
            { x: kx, y: ky, z: OG_ELEVATION_M + ogZShift },
            cx,
            cy,
            yawRad,
            pitchRad,
            zoom
          );
          ctx.beginPath();
          ctx.moveTo(pBot.x, pBot.y);
          ctx.lineTo(pTop.x, pTop.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Project & depth-sort 3D triangles
      const lightDir = { x: -0.45, y: 0.35, z: 0.82 };
      const drawList: Array<{
        p0: { x: number; y: number };
        p1: { x: number; y: number };
        p2: { x: number; y: number };
        depth: number;
        fill: string;
        stroke: string;
        isHighlight: boolean;
      }> = [];

      for (const tri of compiledModel.triangles) {
        if (floorFilter === 'eg' && tri.floorId !== 'eg') continue;
        if (floorFilter === 'og' && tri.floorId !== 'og') continue;

        const zOff = tri.floorId === 'og' || tri.floorId === 'roof' ? ogZShift : 0;
        const v0 = { x: tri.v0.x, y: tri.v0.y, z: tri.v0.z + zOff };
        const v1 = { x: tri.v1.x, y: tri.v1.y, z: tri.v1.z + zOff };
        const v2 = { x: tri.v2.x, y: tri.v2.y, z: tri.v2.z + zOff };

        const p0 = projectPoint(v0, cx, cy, yawRad, pitchRad, zoom);
        const p1 = projectPoint(v1, cx, cy, yawRad, pitchRad, zoom);
        const p2 = projectPoint(v2, cx, cy, yawRad, pitchRad, zoom);

        const depth = (p0.depth + p1.depth + p2.depth) / 3;
        const dot =
          tri.normal.x * lightDir.x + tri.normal.y * lightDir.y + tri.normal.z * lightDir.z;
        const shade = 0.68 + Math.max(0, dot) * 0.42;

        const isSelWall = Boolean(editMode && tri.wallId && tri.wallId === selectedWallId);
        const isSelOpening = Boolean(tri.openingId && tri.openingId === selectedOpeningId);
        const isSelRoom = Boolean(
          tri.material === 'slab' && tri.roomId && tri.roomId === selectedRoomId
        );

        let fill = shadeColor(tri.color, shade);
        if (tri.material === 'glass') {
          fill = isSelOpening ? 'rgba(56, 189, 248, 0.78)' : 'rgba(56, 189, 248, 0.30)';
        } else if (tri.material === 'door_leaf') {
          fill = isSelOpening ? 'rgba(245, 158, 11, 0.88)' : 'rgba(217, 119, 6, 0.42)';
        } else if (isSelWall) {
          fill = shadeColor('#38bdf8', shade);
        } else if (isSelRoom) {
          fill = shadeColor('#10b981', 0.55);
        }

        const isHighlight = isSelWall || isSelOpening || isSelRoom;
        const stroke = isSelWall
          ? '#38bdf8'
          : isSelOpening
            ? '#f59e0b'
            : isSelRoom
              ? 'rgba(16, 185, 129, 0.65)'
              : wireframe
                ? 'rgba(255, 255, 255, 0.24)'
                : 'rgba(255, 255, 255, 0.04)';

        drawList.push({ p0, p1, p2, depth, fill, stroke, isHighlight });
      }

      drawList.sort((a, b) => a.depth - b.depth);

      for (const item of drawList) {
        ctx.beginPath();
        ctx.moveTo(item.p0.x, item.p0.y);
        ctx.lineTo(item.p1.x, item.p1.y);
        ctx.lineTo(item.p2.x, item.p2.y);
        ctx.closePath();
        if (!wireframe) {
          ctx.fillStyle = item.fill;
          ctx.fill();
        }
        ctx.strokeStyle = item.stroke;
        ctx.lineWidth = item.isHighlight ? 1.1 : 0.5;
        ctx.stroke();
      }

      // 4. 3D Wiring Layer
      const wireHitList: Array<{
        wireId: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }> = [];

      if (showWires || (editMode && openToolGroup === 'wiring')) {
        for (const wr of wires) {
          if (floorFilter === 'eg' && wr.floorId !== 'eg') continue;
          if (floorFilter === 'og' && wr.floorId !== 'og') continue;

          const zFloor = wr.floorId === 'og' ? OG_ELEVATION_M + ogZShift : 0;
          const elev = (wr.elevationM ?? 2.4) * (wallCutMode === 'cutaway' ? 0.45 : 1.0);
          const pA = projectPoint(
            { x: wr.x1 / 100, y: wr.y1 / 100, z: zFloor + elev },
            cx,
            cy,
            yawRad,
            pitchRad,
            zoom
          );
          const pB = projectPoint(
            { x: wr.x2 / 100, y: wr.y2 / 100, z: zFloor + elev },
            cx,
            cy,
            yawRad,
            pitchRad,
            zoom
          );

          wireHitList.push({ wireId: wr.id, x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });

          const isSel = wr.id === selectedWireId;
          ctx.save();
          ctx.strokeStyle = isSel ? '#fafafa' : WIRE_COLORS[wr.kind] || '#f59e0b';
          ctx.lineWidth = isSel ? 2.8 : 1.6;
          if (wr.kind === 'switch_line') ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();

          ctx.fillStyle = WIRE_COLORS[wr.kind] || '#f59e0b';
          ctx.beginPath();
          ctx.arc(pA.x, pA.y, 2.5, 0, Math.PI * 2);
          ctx.arc(pB.x, pB.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      wireSegmentsScreenRef.current = wireHitList;

      // 5. Opening Interactive Handles in Edit Mode
      const openingHitList: Array<{ openingId: string; x: number; y: number; r: number }> = [];
      for (const op of openings) {
        if (floorFilter === 'eg' && op.floorId !== 'eg') continue;
        if (floorFilter === 'og' && op.floorId !== 'og') continue;

        const zFloor = op.floorId === 'og' ? OG_ELEVATION_M + ogZShift : 0;
        const pt = projectPoint(
          { x: op.x / 100, y: op.y / 100, z: zFloor + 1.0 },
          cx,
          cy,
          yawRad,
          pitchRad,
          zoom
        );
        openingHitList.push({ openingId: op.id, x: pt.x, y: pt.y, r: 10 });

        if (editMode && (openToolGroup === 'openings' || op.id === selectedOpeningId)) {
          ctx.save();
          ctx.fillStyle =
            op.id === selectedOpeningId
              ? '#fafafa'
              : op.kind === 'window'
                ? '#38bdf8'
                : '#f59e0b';
          ctx.strokeStyle = '#09090b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, op.id === selectedOpeningId ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
      openingNodesScreenRef.current = openingHitList;

      // 6. Room Floor Polygons & Labels
      const hitPolys: Array<{
        roomId: string;
        floorId: string;
        pts: Array<{ x: number; y: number }>;
      }> = [];
      const labelHitList: Array<{
        labelId: string;
        isRoom: boolean;
        x: number;
        y: number;
        r: number;
      }> = [];

      for (const r of rooms) {
        if (floorFilter === 'eg' && r.floorId !== 'eg') continue;
        if (floorFilter === 'og' && r.floorId !== 'og') continue;

        const zBase = r.floorId === 'og' ? OG_ELEVATION_M + ogZShift + 0.05 : 0.05;
        const x0 = r.x / 100;
        const y0 = r.y / 100;
        const x1 = (r.x + r.width) / 100;
        const y1 = (r.y + r.height) / 100;

        const corners = [
          projectPoint({ x: x0, y: y0, z: zBase }, cx, cy, yawRad, pitchRad, zoom),
          projectPoint({ x: x1, y: y0, z: zBase }, cx, cy, yawRad, pitchRad, zoom),
          projectPoint({ x: x1, y: y1, z: zBase }, cx, cy, yawRad, pitchRad, zoom),
          projectPoint({ x: x0, y: y1, z: zBase }, cx, cy, yawRad, pitchRad, zoom),
        ];

        hitPolys.push({
          roomId: r.id,
          floorId: r.floorId,
          pts: corners.map((c) => ({ x: c.x, y: c.y })),
        });

        if (r.id === selectedRoomId) {
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
          ctx.closePath();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        if (showLabels) {
          const center = projectPoint(
            { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: zBase + 0.1 },
            cx,
            cy,
            yawRad,
            pitchRad,
            zoom
          );
          labelHitList.push({
            labelId: r.id,
            isRoom: true,
            x: center.x,
            y: center.y,
            r: 22,
          });

          const areaM2 =
            r.metadata?.labeledAreaM2 ??
            Number((((r.width / 100) * r.height) / 100).toFixed(1));
          const isSel = r.id === selectedRoomId;

          ctx.font = '600 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = isSel ? '#10b981' : 'rgba(250, 250, 250, 0.88)';
          ctx.fillText(r.metadata?.blueprintName || r.name, center.x, center.y - 3);

          ctx.font = '500 9px "JetBrains Mono", monospace';
          ctx.fillStyle = isSel ? '#fafafa' : 'rgba(161, 161, 170, 0.78)';
          ctx.fillText(`${areaM2.toFixed(1).replace('.', ',')} m²`, center.x, center.y + 9);
        }
      }

      if (showLabels) {
        for (const lbl of customLabels) {
          if (floorFilter === 'eg' && lbl.floorId !== 'eg') continue;
          if (floorFilter === 'og' && lbl.floorId !== 'og') continue;

          const zBase = lbl.floorId === 'og' ? OG_ELEVATION_M + ogZShift + 0.35 : 0.35;
          const pt = projectPoint(
            { x: lbl.x / 100, y: lbl.y / 100, z: zBase },
            cx,
            cy,
            yawRad,
            pitchRad,
            zoom
          );
          labelHitList.push({
            labelId: lbl.id,
            isRoom: false,
            x: pt.x,
            y: pt.y,
            r: 20,
          });

          const isSel = lbl.id === selectedLabelId;
          ctx.save();
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = isSel ? '#fafafa' : lbl.color || '#38bdf8';
          ctx.fillText(lbl.text, pt.x, pt.y);
          if (lbl.subtext) {
            ctx.font = '400 9px Inter, sans-serif';
            ctx.fillStyle = '#a1a1aa';
            ctx.fillText(lbl.subtext, pt.x, pt.y + 11);
          }
          ctx.restore();
        }
      }

      roomHitScreenPolysRef.current = hitPolys;
      labelNodesScreenRef.current = labelHitList;

      // 7. 3D SPHERICAL LIGHT BUTTONS & HOME ASSISTANT DEVICES
      const lightHitList: Array<{
        deviceId: string;
        entityId: string;
        x: number;
        y: number;
        r: number;
      }> = [];
      const deviceHitList: Array<{
        deviceId: string;
        entityId: string;
        x: number;
        y: number;
        r: number;
      }> = [];

      for (const dv of devices) {
        if (floorFilter === 'eg' && dv.floorId !== 'eg') continue;
        if (floorFilter === 'og' && dv.floorId !== 'og') continue;

        const zFloor = dv.floorId === 'og' ? OG_ELEVATION_M + ogZShift : 0;
        const live = liveMap[dv.primaryEntityId];
        const isLight = dv.category === 'light';
        const isOn = live ? live.isOn : isLight;

        const zItem = isLight ? zFloor + 1.35 : zFloor + 0.55;
        const pFloor = projectPoint(
          { x: dv.x / 100, y: dv.y / 100, z: zFloor + 0.05 },
          cx,
          cy,
          yawRad,
          pitchRad,
          zoom
        );
        const pNode = projectPoint(
          { x: dv.x / 100, y: dv.y / 100, z: zItem },
          cx,
          cy,
          yawRad,
          pitchRad,
          zoom
        );

        ctx.save();
        ctx.strokeStyle = isOn ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pFloor.x, pFloor.y);
        ctx.lineTo(pNode.x, pNode.y);
        ctx.stroke();

        if (isLight) {
          const radius = 9.5;
          lightHitList.push({
            deviceId: dv.id,
            entityId: dv.primaryEntityId,
            x: pNode.x,
            y: pNode.y,
            r: radius + 4,
          });

          if (isOn) {
            ctx.beginPath();
            ctx.arc(pFloor.x, pFloor.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
            ctx.fill();
          }

          const grad = ctx.createRadialGradient(
            pNode.x - 3,
            pNode.y - 3,
            1.5,
            pNode.x,
            pNode.y,
            radius
          );
          if (isOn) {
            grad.addColorStop(0, '#fef08a');
            grad.addColorStop(0.55, '#f59e0b');
            grad.addColorStop(1, '#b45309');
          } else {
            grad.addColorStop(0, '#71717a');
            grad.addColorStop(0.6, '#27272a');
            grad.addColorStop(1, '#09090b');
          }

          ctx.beginPath();
          ctx.arc(pNode.x, pNode.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle =
            dv.id === selectedDeviceId
              ? '#fafafa'
              : isOn
                ? '#fde047'
                : 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = dv.id === selectedDeviceId ? 2 : 1.2;
          ctx.stroke();
        } else {
          const r = 6.5;
          deviceHitList.push({
            deviceId: dv.id,
            entityId: dv.primaryEntityId,
            x: pNode.x,
            y: pNode.y,
            r: r + 4,
          });

          ctx.beginPath();
          ctx.arc(pNode.x, pNode.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isOn ? '#10b981' : '#18181b';
          ctx.fill();
          ctx.strokeStyle = dv.id === selectedDeviceId ? '#fafafa' : '#38bdf8';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.restore();
      }

      lightSpheresScreenRef.current = lightHitList;
      deviceNodesScreenRef.current = deviceHitList;

      // 8. Draft Start Markers
      if (editMode && wallDraftStart && activeSubTool === 'wall_add') {
        const zFloor = editTargetFloor === 'og' ? OG_ELEVATION_M + ogZShift : 0;
        const pStart = projectPoint(
          { x: wallDraftStart.x / 100, y: wallDraftStart.y / 100, z: zFloor + 0.1 },
          cx,
          cy,
          yawRad,
          pitchRad,
          zoom
        );
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pStart.x, pStart.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (editMode && wireDraftStart && activeSubTool === 'wire_add') {
        const zFloor = editTargetFloor === 'og' ? OG_ELEVATION_M + ogZShift : 0;
        const pStart = projectPoint(
          { x: wireDraftStart.x / 100, y: wireDraftStart.y / 100, z: zFloor + newWireElevationM },
          cx,
          cy,
          yawRad,
          pitchRad,
          zoom
        );
        ctx.fillStyle = WIRE_COLORS[newWireKind];
        ctx.beginPath();
        ctx.arc(pStart.x, pStart.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 9. Exterior Architectural Dimensions
      if (showDimensions) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)';
        ctx.fillStyle = '#a1a1aa';
        ctx.lineWidth = 1;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        const wA = projectPoint({ x: 0, y: 17.7, z: 0 }, cx, cy, yawRad, pitchRad, zoom);
        const wB = projectPoint({ x: 11.9, y: 17.7, z: 0 }, cx, cy, yawRad, pitchRad, zoom);
        ctx.beginPath();
        ctx.moveTo(wA.x, wA.y);
        ctx.lineTo(wB.x, wB.y);
        ctx.stroke();
        ctx.fillText('11,90 m (Straßenansicht)', (wA.x + wB.x) / 2, (wA.y + wB.y) / 2 + 14);

        const dA = projectPoint({ x: -0.9, y: 0, z: 0 }, cx, cy, yawRad, pitchRad, zoom);
        const dB = projectPoint({ x: -0.9, y: 16.9, z: 0 }, cx, cy, yawRad, pitchRad, zoom);
        ctx.beginPath();
        ctx.moveTo(dA.x, dA.y);
        ctx.lineTo(dB.x, dB.y);
        ctx.stroke();
        ctx.fillText('16,90 m', (dA.x + dB.x) / 2 - 26, (dA.y + dB.y) / 2);

        ctx.restore();
      }

      ctx.restore();
    };

    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [
    viewMode,
    compiledModel,
    rooms,
    openings,
    devices,
    customLabels,
    wires,
    liveMap,
    floorFilter,
    wallCutMode,
    showLabels,
    showDimensions,
    showWires,
    wireframe,
    yawDeg,
    pitchDeg,
    zoom,
    panOffset,
    selectedRoomId,
    selectedWallId,
    selectedOpeningId,
    selectedDeviceId,
    selectedLabelId,
    selectedWireId,
    editMode,
    openToolGroup,
    activeSubTool,
    wallDraftStart,
    wireDraftStart,
    editTargetFloor,
    newWireElevationM,
    newWireKind,
    projectPoint,
  ]);

  const pointInPoly = (x: number, y: number, pts: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x,
        yi = pts[i].y;
      const xj = pts[j].x,
        yj = pts[j].y;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Find nearest single wall from `customWalls`
  const findNearestWall = useCallback(
    (
      xCm: number,
      yCm: number,
      floorId: 'og' | 'eg'
    ): {
      wall: CustomWallSegment;
      orientation: 'horizontal' | 'vertical';
      snapX: number;
      snapY: number;
    } | null => {
      let bestDist = 75;
      let best: {
        wall: CustomWallSegment;
        orientation: 'horizontal' | 'vertical';
        snapX: number;
        snapY: number;
      } | null = null;

      for (const cw of customWalls) {
        if (cw.floorId !== floorId) continue;
        const d = distToSegment2D(xCm, yCm, cw.x1, cw.y1, cw.x2, cw.y2);
        if (d < bestDist) {
          bestDist = d;
          const dx = cw.x2 - cw.x1;
          const dy = cw.y2 - cw.y1;
          const lenSq = dx * dx + dy * dy || 1;
          const t = Math.max(0.08, Math.min(0.92, ((xCm - cw.x1) * dx + (yCm - cw.y1) * dy) / lenSq));
          const isH = Math.abs(dx) >= Math.abs(dy);
          best = {
            wall: cw,
            orientation: isH ? 'horizontal' : 'vertical',
            snapX: Math.round(cw.x1 + t * dx),
            snapY: Math.round(cw.y1 + t * dy),
          };
        }
      }
      return best;
    },
    [customWalls]
  );

  // Unified Floor Action Handler
  const executeToolAtFloorPoint = useCallback(
    (pt: { x: number; y: number }, floorId: 'og' | 'eg') => {
      // 1. WALL ADD
      if (activeSubTool === 'wall_add') {
        if (!wallDraftStart) {
          setWallDraftStart(pt);
        } else {
          const id = `cw-${Date.now()}`;
          const nextWalls: CustomWallSegment[] = [
            ...customWalls,
            {
              id,
              floorId,
              x1: wallDraftStart.x,
              y1: wallDraftStart.y,
              x2: pt.x,
              y2: pt.y,
              thicknessCm: newWallThicknessCm,
              heightM: floorId === 'og' ? OG_CLEAR_HEIGHT_M : EG_CLEAR_HEIGHT_M,
              material: newWallMaterial,
              label: `Wand (${newWallThicknessCm} cm)`,
            },
          ];
          setCustomWalls(nextWalls);
          setWallDraftStart(null);
          setSelectedWallId(id);
          persistState({ customWalls: nextWalls });
        }
        return true;
      }

      // 2. WALL EDIT / DELETE
      if (activeSubTool === 'wall_edit' || activeSubTool === 'wall_delete') {
        const hit = findNearestWall(pt.x, pt.y, floorId);
        if (hit) {
          if (activeSubTool === 'wall_delete') {
            const nextWalls = customWalls.filter((w) => w.id !== hit.wall.id);
            setCustomWalls(nextWalls);
            if (selectedWallId === hit.wall.id) setSelectedWallId(null);
            persistState({ customWalls: nextWalls });
          } else {
            setSelectedWallId(hit.wall.id);
          }
          return true;
        }
      }

      // 3. ADD WINDOW OR DOOR FROM PRESET
      if (activeSubTool === 'opening_add_window' || activeSubTool === 'opening_add_door') {
        const preset =
          activeSubTool === 'opening_add_window' ? selectedWindowPreset : selectedDoorPreset;
        const hit = findNearestWall(pt.x, pt.y, floorId);
        const newOp: FloorOpening = {
          id: `op-${Date.now()}`,
          floorId,
          roomId: selectedRoomId || '',
          kind: preset.kind,
          wall: hit?.orientation === 'vertical' ? 'right' : 'top',
          x: hit ? hit.snapX : pt.x,
          y: hit ? hit.snapY : pt.y,
          length: preset.widthCm,
          orientation: hit ? hit.orientation : 'horizontal',
          angleDeg: hit?.orientation === 'vertical' ? 90 : 0,
          swingDir: 'in_left',
          label: preset.name,
          contactEntityId: '',
          metadata: {
            wallId: hit?.wall.id,
            heightCm: preset.heightCm,
            sillCm: preset.sillCm,
          },
        };
        const nextOpenings = [...openings, newOp];
        setOpenings(nextOpenings);
        setSelectedOpeningId(newOp.id);
        persistState({ openings: nextOpenings });
        return true;
      }

      // 4. ADD LABEL
      if (activeSubTool === 'label_add') {
        const newLbl: FloorLabelItem = {
          id: `lbl-${Date.now()}`,
          floorId,
          x: pt.x,
          y: pt.y,
          text: newLabelText || 'Beschriftung',
          subtext: newLabelSubtext,
          color: '#38bdf8',
        };
        const nextLabels = [...customLabels, newLbl];
        setCustomLabels(nextLabels);
        setSelectedLabelId(newLbl.id);
        persistState({ customLabels: nextLabels });
        return true;
      }

      // 5. ADD HOME ASSISTANT DEVICE OR SPHERICAL LIGHT
      if (activeSubTool === 'device_add_item' || activeSubTool === 'device_add_light') {
        const source =
          selectedCatalogItem ||
          (activeSubTool === 'device_add_light' ? lightCatalog[0] : haDeviceCatalog[0]);
        if (!source) return false;

        const targetRoom = rooms.find(
          (r) =>
            r.floorId === floorId &&
            pt.x >= r.x &&
            pt.x <= r.x + r.width &&
            pt.y >= r.y &&
            pt.y <= r.y + r.height
        );

        const newDev: FloorDevice = {
          id: `dev-${Date.now()}`,
          floorId,
          roomId: targetRoom?.id || selectedRoomId || '',
          label: source.label,
          category:
            activeSubTool === 'device_add_light'
              ? 'light'
              : (source.suggestedCategory as FloorDeviceCategory) || 'switch',
          x: pt.x,
          y: pt.y,
          sourceType: source.sourceType || 'ha_entity',
          primaryEntityId: source.id,
          secondaryEntityId: source.pairedEntityId || '',
          targetAppId: source.targetAppId || 'smart-canvas',
          notes: `${source.id}`,
        };

        const nextDevices = [...devices, newDev];
        setDevices(nextDevices);
        setSelectedDeviceId(newDev.id);
        persistState({ devices: nextDevices });
        return true;
      }

      // 6. WIRING TOOL (Add Wire Segment)
      if (activeSubTool === 'wire_add') {
        if (!wireDraftStart) {
          setWireDraftStart(pt);
        } else {
          const newWire: FloorWireSegment = {
            id: `wire-${Date.now()}`,
            floorId,
            kind: newWireKind,
            x1: wireDraftStart.x,
            y1: wireDraftStart.y,
            x2: pt.x,
            y2: pt.y,
            elevationM: newWireElevationM,
            label: newWireLabel || WIRE_LABELS[newWireKind],
          };
          const nextWires = [...wires, newWire];
          setWires(nextWires);
          setWireDraftStart(null);
          setSelectedWireId(newWire.id);
          persistState({ wires: nextWires });
        }
        return true;
      }

      return false;
    },
    [
      activeSubTool,
      wallDraftStart,
      customWalls,
      newWallThicknessCm,
      newWallMaterial,
      findNearestWall,
      selectedWindowPreset,
      selectedDoorPreset,
      selectedRoomId,
      selectedWallId,
      openings,
      newLabelText,
      newLabelSubtext,
      customLabels,
      selectedCatalogItem,
      lightCatalog,
      haDeviceCatalog,
      rooms,
      devices,
      wireDraftStart,
      newWireKind,
      newWireElevationM,
      newWireLabel,
      wires,
      persistState,
    ]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Live wall dragging in `wall_move` mode
    if (editMode && activeSubTool === 'wall_move' && e.button === 0 && !e.shiftKey) {
      const floorPt = screenToFloorCm(mx, my, editTargetFloor);
      const hit = findNearestWall(floorPt.x, floorPt.y, editTargetFloor);
      if (hit) {
        setSelectedWallId(hit.wall.id);
        dragRef.current = {
          active: true,
          mode: 'move_wall',
          startX: e.clientX,
          startY: e.clientY,
          startYaw: yawDeg,
          startPitch: pitchDeg,
          startPanX: panOffset.x,
          startPanY: panOffset.y,
          wallId: hit.wall.id,
          initialWalls: JSON.parse(JSON.stringify(customWalls)),
          startFloorPt: floorPt,
          moved: false,
        };
        return;
      }
    }

    const mode = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
    dragRef.current = {
      active: true,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startYaw: yawDeg,
      startPitch: pitchDeg,
      startPanX: panOffset.x,
      startPanY: panOffset.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.hypot(dx, dy) > 3) d.moved = true;

    if (d.mode === 'move_wall' && d.wallId && d.startFloorPt && d.initialWalls) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const curFloorPt = screenToFloorCm(
        e.clientX - rect.left,
        e.clientY - rect.top,
        editTargetFloor
      );
      const deltaX = curFloorPt.x - d.startFloorPt.x;
      const deltaY = curFloorPt.y - d.startFloorPt.y;

      setCustomWalls(
        d.initialWalls.map((cw) =>
          cw.id === d.wallId
            ? {
                ...cw,
                x1: cw.x1 + deltaX,
                y1: cw.y1 + deltaY,
                x2: cw.x2 + deltaX,
                y2: cw.y2 + deltaY,
              }
            : cw
        )
      );
      return;
    }

    if (d.mode === 'orbit') {
      setYawDeg((d.startYaw + dx * 0.45) % 360);
      setPitchDeg(Math.max(12, Math.min(85, d.startPitch + dy * 0.35)));
    } else if (d.mode === 'pan') {
      setPanOffset({ x: d.startPanX + dx, y: d.startPanY + dy });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    if (d.mode === 'move_wall' && d.moved) {
      persistState({ customWalls });
      return;
    }

    if (d.moved) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // 1. Click on 3D Spherical Light Button -> Toggle Light immediately
    for (const sph of lightSpheresScreenRef.current) {
      if (Math.hypot(mx - sph.x, my - sph.y) <= sph.r) {
        setSelectedDeviceId(sph.deviceId);
        handleToggleDevice(sph.entityId);
        return;
      }
    }

    // 2. Click on Home Assistant device node
    for (const devNode of deviceNodesScreenRef.current) {
      if (Math.hypot(mx - devNode.x, my - devNode.y) <= devNode.r) {
        setSelectedDeviceId(devNode.deviceId);
        handleToggleDevice(devNode.entityId);
        return;
      }
    }

    // 3. Edit Mode tool picking
    if (editMode) {
      if (activeSubTool === 'opening_edit') {
        for (const opNode of openingNodesScreenRef.current) {
          if (Math.hypot(mx - opNode.x, my - opNode.y) <= opNode.r + 4) {
            setSelectedOpeningId(opNode.openingId);
            return;
          }
        }
      }

      if (activeSubTool === 'label_edit') {
        for (const lblNode of labelNodesScreenRef.current) {
          if (Math.hypot(mx - lblNode.x, my - lblNode.y) <= lblNode.r) {
            if (lblNode.isRoom) {
              setSelectedRoomId(lblNode.labelId);
              setSelectedLabelId(null);
            } else {
              setSelectedLabelId(lblNode.labelId);
            }
            return;
          }
        }
      }

      if (activeSubTool === 'wire_edit' || activeSubTool === 'wire_delete') {
        for (const ws of wireSegmentsScreenRef.current) {
          if (distToSegment2D(mx, my, ws.x1, ws.y1, ws.x2, ws.y2) <= 8) {
            if (activeSubTool === 'wire_delete') {
              const nextWires = wires.filter((w) => w.id !== ws.wireId);
              setWires(nextWires);
              persistState({ wires: nextWires });
            } else {
              setSelectedWireId(ws.wireId);
            }
            return;
          }
        }
      }

      const floorPt = screenToFloorCm(mx, my, editTargetFloor);
      if (executeToolAtFloorPoint(floorPt, editTargetFloor)) {
        return;
      }
    }

    // 4. Default Room Slab Picking
    const polys = [...roomHitScreenPolysRef.current].reverse();
    for (const poly of polys) {
      if (pointInPoly(mx, my, poly.pts)) {
        setSelectedRoomId(poly.roomId);
        setEditTargetFloor(poly.floorId === 'eg' ? 'eg' : 'og');
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    setZoom((z) => Math.max(14, Math.min(95, Number((z * factor).toFixed(2)))));
  };

  const ageSec = Math.max(0, Math.floor((nowTick - new Date(lastSyncIso).getTime()) / 1000));

  const btnStyle = (active: boolean): React.CSSProperties => ({
    height: 28,
    padding: '0 10px',
    background: active ? '#fafafa' : '#141417',
    color: active ? '#09090b' : '#a1a1aa',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: active ? 600 : 500,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 28,
    padding: '0 8px',
    background: '#141417',
    color: '#fafafa',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
  };

  const iconDockBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? '#fafafa' : 'transparent',
    color: active ? '#09090b' : '#a1a1aa',
    border: active ? '1px solid #fafafa' : '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    padding: 0,
    transition: 'all 120ms ease',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#09090b',
        color: '#fafafa',
        userSelect: 'none',
      }}
    >
      {/* 1. HEADER & STATUS STRIP */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: '#09090b',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: editMode ? '#f59e0b' : '#10b981',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em' }}>
              HAUSMODELL 11,90 × 16,90 M
            </span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 16, height: 44 }}>
            {(
              [
                ['3d', 'Isometrie 3D'],
                ['2d', 'Grundriss 2D'],
                ['checks', 'Plausibilität & Maße'],
              ] as const
            ).map(([id, label]) => {
              const active = viewMode === id;
              return (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  style={{
                    height: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: active ? '1px solid #fafafa' : '1px solid transparent',
                    color: active ? '#fafafa' : '#a1a1aa',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Edit Mode Toggle, Freshness & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveStatus && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#10b981',
              }}
            >
              {saveStatus}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#a1a1aa',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Stand: {formatTime(lastSyncIso)} (vor {ageSec}s)
          </span>

          <button
            onClick={() => {
              setEditMode((v) => {
                const next = !v;
                if (!next) {
                  setActiveSubTool('none');
                  setWallDraftStart(null);
                  setWireDraftStart(null);
                } else if (activeSubTool === 'none') {
                  setOpenToolGroup('wall');
                  setActiveSubTool('wall_move');
                }
                return next;
              });
            }}
            style={{
              height: 28,
              padding: '0 12px',
              background: editMode ? '#f59e0b' : '#141417',
              color: editMode ? '#09090b' : '#fafafa',
              border: editMode
                ? '1px solid #f59e0b'
                : '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {editMode ? 'Edit-Modus Aktiv' : 'Bearbeiten'}
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              style={btnStyle(false)}
              onClick={() =>
                downloadBlob(
                  'house_1190x1690.obj',
                  exportHouseWavefrontObj(compiledModel),
                  'text/plain'
                )
              }
            >
              .OBJ
            </button>
            <button
              style={btnStyle(false)}
              onClick={() =>
                downloadBlob(
                  'house_1190x1690.gltf',
                  exportHouseGltfJson(compiledModel),
                  'model/gltf+json'
                )
              }
            >
              .GLTF
            </button>
            <button
              style={btnStyle(false)}
              onClick={() =>
                downloadBlob(
                  'house_floorplan_spec.json',
                  JSON.stringify(
                    {
                      outerDimensionsMeters: { width: 11.9, depth: 16.9, ridgeHeight: 9.25 },
                      plausibilityChecks: PLAUSIBILITY_CHECKS,
                      floors,
                      rooms,
                      openings,
                      connectors,
                      devices,
                      customWalls,
                      customLabels,
                      wires,
                    },
                    null,
                    2
                  ),
                  'application/json'
                )
              }
            >
              .JSON
            </button>
          </div>
        </div>
      </header>

      {/* 2. TOP 4-COLUMN ARCHITECTURAL KPI STRIP */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: '#09090b',
          flexShrink: 0,
        }}
      >
        {[
          {
            label: 'AUSSENMASSE (BAUPLAN)',
            value: '11,90 × 16,90 m',
            sub: `${customWalls.length} Einzelwände (0 Doppelwände)`,
          },
          {
            label: 'OBERGESCHOSS (WOHNUNG)',
            value: '123,4 m²',
            sub: `+ 28,2 m² Loggia · ${rooms.filter((r) => r.floorId === 'og').length} Räume`,
          },
          {
            label: 'ERDGESCHOSS (BESTAND & UMBAU)',
            value: '161,6 m²',
            sub: `Verkauf & Backstube · ${rooms.filter((r) => r.floorId === 'eg').length} Räume`,
          },
          {
            label: 'GERÄTE, LICHT-SPHÄREN & LEITUNGEN',
            value: `${devices.filter((d) => d.category === 'light').length} Lichter · ${devices.length} Geräte`,
            sub: `${openings.length} Öffnungen · ${wires.length} Leitungen`,
          },
        ].map((kpi, idx) => (
          <div
            key={kpi.label}
            style={{
              padding: '10px 20px',
              borderRight: idx < 3 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#52525b',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 17,
                fontWeight: 600,
                color: '#fafafa',
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpi.value}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#a1a1aa',
                marginTop: 1,
              }}
            >
              {kpi.sub}
            </div>
          </div>
        ))}
      </section>

      {/* 3. MAIN WORKSPACE */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {viewMode === '3d' && (
          <>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                cursor: editMode && activeSubTool !== 'none' ? 'crosshair' : 'grab',
              }}
            />

            {/* Floating View Controls (Bottom-Left) */}
            <div
              style={{
                position: 'absolute',
                left: 20,
                bottom: 20,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                background: 'rgba(17, 17, 19, 0.92)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 6,
                padding: 6,
              }}
            >
              {(
                [
                  ['exploded', 'Explodiert (EG + OG)'],
                  ['all', 'Kompakt'],
                  ['og', 'Nur OG'],
                  ['eg', 'Nur EG'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  style={btnStyle(floorFilter === id)}
                  onClick={() => {
                    setFloorFilter(id);
                    if (id === 'og' || id === 'eg') setEditTargetFloor(id);
                  }}
                >
                  {label}
                </button>
              ))}

              <span style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

              {(
                [
                  ['cutaway', 'Schnitt (1,3 m)'],
                  ['full', 'Vollwand (3,0 m)'],
                  ['roof', 'Mit Dach (9,25 m)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  style={btnStyle(wallCutMode === id)}
                  onClick={() => setWallCutMode(id)}
                >
                  {label}
                </button>
              ))}

              <span style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

              <button style={btnStyle(showLabels)} onClick={() => setShowLabels((v) => !v)}>
                Labels
              </button>
              <button style={btnStyle(showWires)} onClick={() => setShowWires((v) => !v)}>
                Leitungen
              </button>
              <button style={btnStyle(showDimensions)} onClick={() => setShowDimensions((v) => !v)}>
                Maßketten
              </button>
              <button style={btnStyle(wireframe)} onClick={() => setWireframe((v) => !v)}>
                Drahtgitter
              </button>

              <span style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

              {[
                { label: 'SW', yaw: 42, pitch: 32 },
                { label: 'SE', yaw: -42, pitch: 32 },
                { label: 'NE', yaw: -138, pitch: 32 },
                { label: 'NW', yaw: 138, pitch: 32 },
                { label: 'Top', yaw: 0, pitch: 85 },
              ].map((p) => (
                <button
                  key={p.label}
                  style={btnStyle(Math.abs(yawDeg - p.yaw) < 3 && Math.abs(pitchDeg - p.pitch) < 3)}
                  onClick={() => {
                    setYawDeg(p.yaw);
                    setPitchDeg(p.pitch);
                    setPanOffset({ x: 0, y: 20 });
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 2D ARCHITECTURAL BLUEPRINT VIEW */}
        {viewMode === '2d' && (
          <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#09090b',
                position: 'relative',
                padding: 20,
              }}
            >
              <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', gap: 6 }}>
                <button
                  style={btnStyle(active2dFloor === 'og')}
                  onClick={() => {
                    setActive2dFloor('og');
                    setEditTargetFloor('og');
                  }}
                >
                  Obergeschoss (OG · 123,4 m²)
                </button>
                <button
                  style={btnStyle(active2dFloor === 'eg')}
                  onClick={() => {
                    setActive2dFloor('eg');
                    setEditTargetFloor('eg');
                  }}
                >
                  Erdgeschoss (EG · Backstube & Verkauf)
                </button>
              </div>

              <svg
                viewBox="-140 -100 1470 1900"
                onClick={(e) => {
                  if (!editMode) return;
                  const svg = e.currentTarget;
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const ctm = svg.getScreenCTM();
                  if (!ctm) return;
                  const loc = pt.matrixTransform(ctm.inverse());
                  const xCm = Math.round(Math.max(0, Math.min(1190, loc.x)) / 5) * 5;
                  const yCm = Math.round(Math.max(0, Math.min(1690, loc.y)) / 5) * 5;
                  executeToolAtFloorPoint({ x: xCm, y: yCm }, active2dFloor);
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: '#0c0c0e',
                  cursor: editMode && activeSubTool !== 'none' ? 'crosshair' : 'default',
                }}
              >
                {/* Room Floor Tiles */}
                {rooms
                  .filter((r) => r.floorId === active2dFloor)
                  .map((r) => {
                    const isSel = r.id === selectedRoomId;
                    const area =
                      r.metadata?.labeledAreaM2 ??
                      Number((((r.width / 100) * r.height) / 100).toFixed(2));
                    return (
                      <g
                        key={r.id}
                        onClick={() => setSelectedRoomId(r.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={r.x}
                          y={r.y}
                          width={r.width}
                          height={r.height}
                          fill={isSel ? 'rgba(16, 185, 129, 0.14)' : '#111113'}
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth={2}
                        />
                        <text
                          x={r.x + r.width / 2}
                          y={r.y + r.height / 2 - 12}
                          fill="#fafafa"
                          fontSize={23}
                          fontWeight={600}
                          fontFamily="Inter, sans-serif"
                          textAnchor="middle"
                        >
                          {r.metadata?.blueprintName || r.name}
                        </text>
                        <text
                          x={r.x + r.width / 2}
                          y={r.y + r.height / 2 + 18}
                          fill="#10b981"
                          fontSize={20}
                          fontFamily="JetBrains Mono, monospace"
                          textAnchor="middle"
                        >
                          {area.toFixed(2).replace('.', ',')} m²
                        </text>
                      </g>
                    );
                  })}

                {/* Single-Wall Graph in 2D */}
                {customWalls
                  .filter((cw) => cw.floorId === active2dFloor)
                  .map((cw) => {
                    const isSel = cw.id === selectedWallId;
                    return (
                      <line
                        key={cw.id}
                        x1={cw.x1}
                        y1={cw.y1}
                        x2={cw.x2}
                        y2={cw.y2}
                        stroke={isSel ? '#38bdf8' : '#a1a1aa'}
                        strokeWidth={cw.thicknessCm}
                        strokeLinecap="square"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWallId(cw.id);
                        }}
                      />
                    );
                  })}

                {/* Wires in 2D */}
                {showWires &&
                  wires
                    .filter((wr) => wr.floorId === active2dFloor)
                    .map((wr) => (
                      <line
                        key={wr.id}
                        x1={wr.x1}
                        y1={wr.y1}
                        x2={wr.x2}
                        y2={wr.y2}
                        stroke={WIRE_COLORS[wr.kind]}
                        strokeWidth={5}
                        strokeDasharray={wr.kind === 'switch_line' ? '12 8' : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWireId(wr.id);
                        }}
                      />
                    ))}

                {/* Openings in 2D */}
                {openings
                  .filter((o) => o.floorId === active2dFloor)
                  .map((o) => {
                    const isHoriz = o.orientation === 'horizontal';
                    const w = isHoriz ? o.length : 18;
                    const h = isHoriz ? 18 : o.length;
                    return (
                      <rect
                        key={o.id}
                        x={o.x - w / 2}
                        y={o.y - h / 2}
                        width={w}
                        height={h}
                        fill={o.kind === 'window' ? '#38bdf8' : '#f59e0b'}
                        stroke={o.id === selectedOpeningId ? '#fafafa' : '#09090b'}
                        strokeWidth={3}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOpeningId(o.id);
                        }}
                      />
                    );
                  })}

                {/* Spherical Lights & Devices in 2D */}
                {devices
                  .filter((d) => d.floorId === active2dFloor)
                  .map((d) => {
                    const isLight = d.category === 'light';
                    const isOn = liveMap[d.primaryEntityId]?.isOn ?? isLight;
                    return (
                      <circle
                        key={d.id}
                        cx={d.x}
                        cy={d.y}
                        r={isLight ? 22 : 16}
                        fill={isLight ? (isOn ? '#f59e0b' : '#27272a') : '#10b981'}
                        stroke="#fafafa"
                        strokeWidth={3}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeviceId(d.id);
                          handleToggleDevice(d.primaryEntityId);
                        }}
                      />
                    );
                  })}
              </svg>
            </div>
          </div>
        )}

        {/* PLAUSIBILITY CHECKS VIEW */}
        {viewMode === 'checks' && (
          <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Architektonische Plausibilitätsprüfung (Kreuzvalidierung aller 4 Baupläne)
            </div>
            <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 16 }}>
              Abgleich von Erdgeschoss, Obergeschoss, Schnitt (73° Welleternit) und Straßenansicht.
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: '#52525b',
                    textAlign: 'left',
                    fontSize: 10,
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '8px 10px' }}>Prüfung</th>
                  <th style={{ padding: '8px 10px' }}>Maßkette / Formel aus Plan</th>
                  <th style={{ padding: '8px 10px' }}>Soll (Plan)</th>
                  <th style={{ padding: '8px 10px' }}>Ist (3D-Modell)</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {PLAUSIBILITY_CHECKS.map((chk) => (
                  <tr key={chk.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '10px', fontWeight: 500, color: '#fafafa' }}>
                      {chk.title}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: '#a1a1aa',
                      }}
                    >
                      {chk.formula}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: '#fafafa',
                      }}
                    >
                      {chk.expected}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: '#10b981',
                      }}
                    >
                      {chk.measured}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: '#10b981',
                      }}
                    >
                      OK
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===================================================================
            ICON-ONLY RIGHT-ALIGNED VERTICAL TOOLBAR + SLEEK FLYOUT POPOVER
        =================================================================== */}
        {editMode && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              zIndex: 30,
            }}
          >
            {/* SLEEK FLYOUT POPOVER (Anchored to left of icon dock) */}
            {openToolGroup && (
              <div
                style={{
                  width: 288,
                  maxHeight: 'calc(100vh - 150px)',
                  overflowY: 'auto',
                  background: 'rgba(17, 17, 19, 0.96)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Flyout Header + Floor Switcher */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 8,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fafafa',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {openToolGroup === 'wall' && 'Wände'}
                    {openToolGroup === 'openings' && 'Türen & Fenster'}
                    {openToolGroup === 'label' && 'Beschriftung'}
                    {openToolGroup === 'devices' && 'Geräte & Licht-Sphären'}
                    {openToolGroup === 'wiring' && 'Verkabelung'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{ ...btnStyle(editTargetFloor === 'og'), height: 22, padding: '0 7px' }}
                      onClick={() => setEditTargetFloor('og')}
                    >
                      OG
                    </button>
                    <button
                      style={{ ...btnStyle(editTargetFloor === 'eg'), height: 22, padding: '0 7px' }}
                      onClick={() => setEditTargetFloor('eg')}
                    >
                      EG
                    </button>
                  </div>
                </div>

                {/* 1. WALL FLYOUT */}
                {openToolGroup === 'wall' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                      {(
                        [
                          ['wall_add', 'Add'],
                          ['wall_move', 'Move'],
                          ['wall_edit', 'Edit'],
                          ['wall_delete', 'Del'],
                        ] as const
                      ).map(([subId, label]) => (
                        <button
                          key={subId}
                          style={btnStyle(activeSubTool === subId)}
                          onClick={() => {
                            setActiveSubTool(subId);
                            setWallDraftStart(null);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {activeSubTool === 'wall_add' && (
                      <div
                        style={{
                          paddingTop: 8,
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#a1a1aa' }}>
                          {wallDraftStart
                            ? `Start (${(wallDraftStart.x / 100).toFixed(2)}m, ${(wallDraftStart.y / 100).toFixed(2)}m) → Endpunkt klicken`
                            : 'Startpunkt im Plan klicken'}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[10, 12, 25, 38, 50].map((cm) => (
                            <button
                              key={cm}
                              style={btnStyle(newWallThicknessCm === cm)}
                              onClick={() => setNewWallThicknessCm(cm)}
                            >
                              {cm}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Single-Wall Inspector */}
                    <div
                      style={{
                        paddingTop: 8,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <select
                        style={inputStyle}
                        value={selectedWallId || ''}
                        onChange={(e) => setSelectedWallId(e.target.value || null)}
                      >
                        <option value="">— Wand wählen ({editTargetFloor.toUpperCase()}) —</option>
                        {customWalls
                          .filter((w) => w.floorId === editTargetFloor)
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label || w.id} ({w.thicknessCm} cm)
                            </option>
                          ))}
                      </select>

                      {selectedWall && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Stärke (cm)</div>
                              <input
                                type="number"
                                style={inputStyle}
                                value={selectedWall.thicknessCm}
                                onChange={(e) => {
                                  const val = Math.max(6, Math.min(80, Number(e.target.value) || 25));
                                  const next = customWalls.map((w) =>
                                    w.id === selectedWall.id ? { ...w, thicknessCm: val } : w
                                  );
                                  setCustomWalls(next);
                                  persistState({ customWalls: next });
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Höhe (m)</div>
                              <input
                                type="number"
                                step="0.1"
                                style={inputStyle}
                                value={selectedWall.heightM}
                                onChange={(e) => {
                                  const val = Math.max(0.8, Math.min(4.5, Number(e.target.value) || 2.6));
                                  const next = customWalls.map((w) =>
                                    w.id === selectedWall.id ? { ...w, heightM: val } : w
                                  );
                                  setCustomWalls(next);
                                  persistState({ customWalls: next });
                                }}
                              />
                            </div>
                          </div>
                          <button
                            style={{ ...btnStyle(false), color: '#ef4444' }}
                            onClick={() => {
                              const next = customWalls.filter((w) => w.id !== selectedWall.id);
                              setCustomWalls(next);
                              setSelectedWallId(null);
                              persistState({ customWalls: next });
                            }}
                          >
                            Wand löschen
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* 2. DOORS & WINDOWS FLYOUT */}
                {openToolGroup === 'openings' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      {(
                        [
                          ['opening_add_window', '+ Fenster'],
                          ['opening_add_door', '+ Tür'],
                          ['opening_edit', 'Edit'],
                        ] as const
                      ).map(([subId, label]) => (
                        <button
                          key={subId}
                          style={btnStyle(activeSubTool === subId)}
                          onClick={() => setActiveSubTool(subId)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {activeSubTool === 'opening_add_window' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {WINDOW_PRESETS.map((p) => {
                          const act = selectedWindowPreset.id === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => setSelectedWindowPreset(p)}
                              style={{
                                padding: '6px 8px',
                                background: act ? 'rgba(56, 189, 248, 0.16)' : '#141417',
                                border: act
                                  ? '1px solid #38bdf8'
                                  : '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{p.name}</div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  color: '#a1a1aa',
                                }}
                              >
                                {p.subtitle}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeSubTool === 'opening_add_door' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {DOOR_PRESETS.map((p) => {
                          const act = selectedDoorPreset.id === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => setSelectedDoorPreset(p)}
                              style={{
                                padding: '6px 8px',
                                background: act ? 'rgba(245, 158, 11, 0.16)' : '#141417',
                                border: act
                                  ? '1px solid #f59e0b'
                                  : '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{p.name}</div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  color: '#a1a1aa',
                                }}
                              >
                                {p.subtitle}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Property Editor */}
                    <div
                      style={{
                        paddingTop: 8,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <select
                        style={inputStyle}
                        value={selectedOpeningId || ''}
                        onChange={(e) => setSelectedOpeningId(e.target.value || null)}
                      >
                        <option value="">— Öffnung wählen ({editTargetFloor.toUpperCase()}) —</option>
                        {openings
                          .filter((o) => o.floorId === editTargetFloor)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label} ({o.length} cm)
                            </option>
                          ))}
                      </select>

                      {selectedOpening && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Breite (cm)</div>
                              <input
                                type="number"
                                style={inputStyle}
                                value={selectedOpening.length}
                                onChange={(e) => {
                                  const val = Math.max(40, Math.min(450, Number(e.target.value) || 90));
                                  const next = openings.map((o) =>
                                    o.id === selectedOpening.id ? { ...o, length: val } : o
                                  );
                                  setOpenings(next);
                                  persistState({ openings: next });
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Höhe (cm)</div>
                              <input
                                type="number"
                                style={inputStyle}
                                value={
                                  selectedOpening.metadata?.heightCm ??
                                  (selectedOpening.kind === 'window' ? 140 : 194)
                                }
                                onChange={(e) => {
                                  const val = Math.max(40, Math.min(280, Number(e.target.value) || 140));
                                  const next = openings.map((o) =>
                                    o.id === selectedOpening.id
                                      ? { ...o, metadata: { ...o.metadata, heightCm: val } }
                                      : o
                                  );
                                  setOpenings(next);
                                  persistState({ openings: next });
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Brüstung (cm)</div>
                              <input
                                type="number"
                                style={inputStyle}
                                value={
                                  selectedOpening.metadata?.sillCm ??
                                  (selectedOpening.kind === 'window' ? 90 : 0)
                                }
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(200, Number(e.target.value) || 0));
                                  const next = openings.map((o) =>
                                    o.id === selectedOpening.id
                                      ? { ...o, metadata: { ...o.metadata, sillCm: val } }
                                      : o
                                  );
                                  setOpenings(next);
                                  persistState({ openings: next });
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#a1a1aa' }}>Anschlag</div>
                              <select
                                style={inputStyle}
                                value={selectedOpening.swingDir}
                                onChange={(e) => {
                                  const next = openings.map((o) =>
                                    o.id === selectedOpening.id
                                      ? { ...o, swingDir: e.target.value as DoorSwingDir }
                                      : o
                                  );
                                  setOpenings(next);
                                  persistState({ openings: next });
                                }}
                              >
                                <option value="in_left">DIN L (innen)</option>
                                <option value="in_right">DIN R (innen)</option>
                                <option value="out_left">DIN L (außen)</option>
                                <option value="out_right">DIN R (außen)</option>
                              </select>
                            </div>
                          </div>
                          <button
                            style={{ ...btnStyle(false), color: '#ef4444' }}
                            onClick={() => {
                              const next = openings.filter((o) => o.id !== selectedOpening.id);
                              setOpenings(next);
                              setSelectedOpeningId(null);
                              persistState({ openings: next });
                            }}
                          >
                            Öffnung löschen
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* 3. LABEL FLYOUT */}
                {openToolGroup === 'label' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <button
                        style={btnStyle(activeSubTool === 'label_add')}
                        onClick={() => setActiveSubTool('label_add')}
                      >
                        + Add Label
                      </button>
                      <button
                        style={btnStyle(activeSubTool === 'label_edit')}
                        onClick={() => setActiveSubTool('label_edit')}
                      >
                        Edit Label
                      </button>
                    </div>

                    {activeSubTool === 'label_add' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          placeholder="Label-Text..."
                          style={inputStyle}
                          value={newLabelText}
                          onChange={(e) => setNewLabelText(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Zusatz / Maß..."
                          style={inputStyle}
                          value={newLabelSubtext}
                          onChange={(e) => setNewLabelSubtext(e.target.value)}
                        />
                      </div>
                    )}

                    {selectedCustomLabel ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          style={inputStyle}
                          value={selectedCustomLabel.text}
                          onChange={(e) => {
                            const next = customLabels.map((l) =>
                              l.id === selectedCustomLabel.id ? { ...l, text: e.target.value } : l
                            );
                            setCustomLabels(next);
                            persistState({ customLabels: next });
                          }}
                        />
                        <button
                          style={{ ...btnStyle(false), color: '#ef4444' }}
                          onClick={() => {
                            const next = customLabels.filter((l) => l.id !== selectedCustomLabel.id);
                            setCustomLabels(next);
                            setSelectedLabelId(null);
                            persistState({ customLabels: next });
                          }}
                        >
                          Label löschen
                        </button>
                      </div>
                    ) : (
                      selectedRoom && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 10, color: '#a1a1aa' }}>
                            Raumname ({selectedRoom.zoneCode})
                          </div>
                          <input
                            type="text"
                            style={inputStyle}
                            value={selectedRoom.metadata?.blueprintName || selectedRoom.name}
                            onChange={(e) => {
                              const next = rooms.map((r) =>
                                r.id === selectedRoom.id
                                  ? {
                                      ...r,
                                      name: e.target.value,
                                      metadata: { ...r.metadata, blueprintName: e.target.value },
                                    }
                                  : r
                              );
                              setRooms(next);
                              persistState({ rooms: next });
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#a1a1aa' }}>Fläche (m²)</div>
                          <input
                            type="number"
                            step="0.1"
                            style={inputStyle}
                            value={selectedRoom.metadata?.labeledAreaM2 ?? 15.0}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const next = rooms.map((r) =>
                                r.id === selectedRoom.id
                                  ? { ...r, metadata: { ...r.metadata, labeledAreaM2: val } }
                                  : r
                              );
                              setRooms(next);
                              persistState({ rooms: next });
                            }}
                          />
                        </div>
                      )
                    )}
                  </>
                )}

                {/* 4. DEVICES & SPHERICAL LIGHTS FLYOUT */}
                {openToolGroup === 'devices' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <button
                        style={btnStyle(activeSubTool === 'device_add_light')}
                        onClick={() => {
                          setActiveSubTool('device_add_light');
                          setSelectedCatalogItem(lightCatalog[0] || null);
                        }}
                      >
                        + Licht-Sphäre
                      </button>
                      <button
                        style={btnStyle(activeSubTool === 'device_add_item')}
                        onClick={() => {
                          setActiveSubTool('device_add_item');
                          setSelectedCatalogItem(haDeviceCatalog[0] || null);
                        }}
                      >
                        + HASS / Shelly
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Entität suchen..."
                      style={inputStyle}
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                    />

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        maxHeight: 210,
                        overflowY: 'auto',
                      }}
                    >
                      {(activeSubTool === 'device_add_light' ? lightCatalog : haDeviceCatalog).map(
                        (item) => {
                          const act = selectedCatalogItem?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              onClick={() => setSelectedCatalogItem(item)}
                              style={{
                                padding: '6px 8px',
                                background: act ? 'rgba(245, 158, 11, 0.16)' : '#141417',
                                border: act
                                  ? '1px solid #f59e0b'
                                  : '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  color: '#a1a1aa',
                                }}
                              >
                                {item.id}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </>
                )}

                {/* 5. WIRING FLYOUT */}
                {openToolGroup === 'wiring' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      <button
                        style={btnStyle(activeSubTool === 'wire_add')}
                        onClick={() => {
                          setActiveSubTool('wire_add');
                          setWireDraftStart(null);
                        }}
                      >
                        + Draw
                      </button>
                      <button
                        style={btnStyle(activeSubTool === 'wire_edit')}
                        onClick={() => setActiveSubTool('wire_edit')}
                      >
                        Edit
                      </button>
                      <button
                        style={btnStyle(activeSubTool === 'wire_delete')}
                        onClick={() => setActiveSubTool('wire_delete')}
                      >
                        Del
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(Object.keys(WIRE_LABELS) as WireKind[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => {
                            setNewWireKind(k);
                            setNewWireLabel(WIRE_LABELS[k]);
                          }}
                          style={{
                            ...btnStyle(newWireKind === k),
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            justifyContent: 'flex-start',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: WIRE_COLORS[k],
                            }}
                          />
                          {WIRE_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ICON-ONLY VERTICAL TOOLBAR DOCK (44px wide) */}
            <aside
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(17, 17, 19, 0.96)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
                borderRadius: 8,
                padding: 4,
                width: 44,
              }}
            >
              {/* 1. Wall Tool Icon */}
              <button
                title="Wände (Add / Move / Edit / Delete)"
                style={iconDockBtnStyle(openToolGroup === 'wall')}
                onClick={() => {
                  if (openToolGroup === 'wall') setOpenToolGroup(null);
                  else {
                    setOpenToolGroup('wall');
                    setActiveSubTool('wall_move');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="1" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="10" y1="4" x2="10" y2="10" />
                  <line x1="14" y1="10" x2="14" y2="15" />
                  <line x1="9" y1="15" x2="9" y2="20" />
                </svg>
              </button>

              {/* 2. Doors & Windows Tool Icon */}
              <button
                title="Türen & Fenster (Presets & Eigenschaften)"
                style={iconDockBtnStyle(openToolGroup === 'openings')}
                onClick={() => {
                  if (openToolGroup === 'openings') setOpenToolGroup(null);
                  else {
                    setOpenToolGroup('openings');
                    setActiveSubTool('opening_add_window');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 20V4h10v16" />
                  <path d="M3 20h18" />
                  <circle cx="12.5" cy="12" r="1" fill="currentColor" />
                </svg>
              </button>

              {/* 3. Label Tool Icon */}
              <button
                title="Beschriftung & Raumflächen"
                style={iconDockBtnStyle(openToolGroup === 'label')}
                onClick={() => {
                  if (openToolGroup === 'label') setOpenToolGroup(null);
                  else {
                    setOpenToolGroup('label');
                    setActiveSubTool('label_edit');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="9" y1="20" x2="15" y2="20" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              </button>

              {/* 4. Devices & Spherical Lights Icon */}
              <button
                title="Geräte & 3D Licht-Sphären"
                style={iconDockBtnStyle(openToolGroup === 'devices')}
                onClick={() => {
                  if (openToolGroup === 'devices') setOpenToolGroup(null);
                  else {
                    setOpenToolGroup('devices');
                    setActiveSubTool('device_add_light');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                </svg>
              </button>

              {/* 5. Wiring Tool Icon */}
              <button
                title="Verkabelung & Leitungen"
                style={iconDockBtnStyle(openToolGroup === 'wiring')}
                onClick={() => {
                  if (openToolGroup === 'wiring') setOpenToolGroup(null);
                  else {
                    setOpenToolGroup('wiring');
                    setActiveSubTool('wire_add');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="6" r="2.5" />
                  <circle cx="19" cy="18" r="2.5" />
                  <path d="M7.5 6H12v12h4.5" />
                </svg>
              </button>

              <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }} />

              {/* 6. Reset to Original Blueprint Icon */}
              <button
                title="Auf Original-Bauplan zurücksetzen"
                style={iconDockBtnStyle(false)}
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/reset-defaults`, { method: 'POST' });
                    if (res.ok) {
                      const d = await res.json();
                      if (Array.isArray(d.rooms)) setRooms(d.rooms);
                      if (Array.isArray(d.openings)) setOpenings(d.openings);
                      if (Array.isArray(d.devices)) setDevices(d.devices);
                      setCustomWalls(BLUEPRINT_WALLS);
                      setCustomLabels(BLUEPRINT_LABELS);
                      setWires(BLUEPRINT_WIRES);
                      setSaveStatus('Originalplan geladen');
                    }
                  } catch {}
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
            </aside>
          </div>
        )}

        {/* Selected Room Minimalist HUD Strip (Bottom-Right when not in Edit Mode) */}
        {selectedRoom && !editMode && viewMode === '3d' && (
          <div
            style={{
              position: 'absolute',
              right: 20,
              bottom: 20,
              width: 340,
              background: 'rgba(17, 17, 19, 0.94)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fafafa' }}>
                  {selectedRoom.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: '#a1a1aa',
                    marginTop: 2,
                  }}
                >
                  {selectedRoom.zoneCode} ·{' '}
                  {selectedRoom.floorId === 'og'
                    ? 'Obergeschoss (+3,35 m)'
                    : 'Erdgeschoss (0,00 m)'}
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#10b981',
                }}
              >
                {(
                  selectedRoom.metadata?.labeledAreaM2 ??
                  ((selectedRoom.width / 100) * selectedRoom.height) / 100
                )
                  .toFixed(2)
                  .replace('.', ',')}{' '}
                m²
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              <div>
                <div style={{ color: '#52525b', fontSize: 10 }}>BREITE × TIEFE</div>
                <div style={{ color: '#fafafa', marginTop: 2 }}>
                  {(selectedRoom.metadata?.measuredWidthM ?? selectedRoom.width / 100)
                    .toFixed(2)
                    .replace('.', ',')}{' '}
                  ×{' '}
                  {(selectedRoom.metadata?.measuredDepthM ?? selectedRoom.height / 100)
                    .toFixed(2)
                    .replace('.', ',')}{' '}
                  m
                </div>
              </div>
              <div>
                <div style={{ color: '#52525b', fontSize: 10 }}>RAUMHÖHE</div>
                <div style={{ color: '#fafafa', marginTop: 2 }}>
                  {(
                    selectedRoom.metadata?.clearHeightM ??
                    (selectedRoom.floorId === 'og' ? OG_CLEAR_HEIGHT_M : EG_CLEAR_HEIGHT_M)
                  )
                    .toFixed(2)
                    .replace('.', ',')}{' '}
                  m
                </div>
              </div>
              <div>
                <div style={{ color: '#52525b', fontSize: 10 }}>MAUERSTÄRKE</div>
                <div style={{ color: '#fafafa', marginTop: 2 }}>
                  {selectedRoom.wallThickness} cm
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
