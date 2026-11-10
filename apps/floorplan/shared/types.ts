export type OpeningKind = 'door' | 'window' | 'sliding_door' | 'passage';
export type WallSide = 'top' | 'right' | 'bottom' | 'left' | 'free';
export type DoorSwingDir = 'in_left' | 'in_right' | 'out_left' | 'out_right';

export type FloorDeviceCategory =
  | 'light'
  | 'switch'
  | 'climate'
  | 'power'
  | 'motion'
  | 'camera'
  | 'printer_3d'
  | 'printer_2d'
  | 'workstation'
  | 'media'
  | 'appliance'
  | 'thassi_app';

export type FloorSourceType = 'ha_entity' | 'thassi_app';

export type FloorConnectorKind = 'stairs' | 'spiral_stairs' | 'shaft' | 'portal';

export interface RoomVertex {
  x: number;
  y: number;
}

export interface FloorLevel {
  id: string;
  name: string;
  subtitle: string;
  elevationMeters?: number; // e.g. 0.0 for EG, 3.0 for OG, -2.6 for KG
  gridSizePx: number; // default 20px = 0.20m (100px = 1.00m)
  scalePxPerMeter: number; // default 100
  sortOrder: number;
}

export interface FloorRoom {
  id: string;
  floorId: string;
  name: string;
  zoneCode: string;
  x: number; // bounding box X (px on 2D canvas)
  y: number; // bounding box Y
  width: number; // bounding box width
  height: number; // bounding box height
  /**
   * Ordered polygon vertices defining the room's straight wall lines.
   * Supports rectangles (4 pts), L-shapes (6 pts), U/T-shapes (8 pts), or arbitrary straight-wall polygons.
   */
  points: RoomVertex[];
  wallThickness: number;
  tempEntityId: string;
  humidityEntityId: string;
  notes: string;
  sortOrder: number;
  /**
   * Arbitrary dynamic JSON structure for interactive properties, IDs (GUID, HASS, Thassi, MAC),
   * Beacon parameters, and Axon spatial runtime metadata.
   */
  metadata?: Record<string, any>;
}

export interface FloorOpening {
  id: string;
  floorId: string;
  roomId: string;
  kind: OpeningKind;
  wall: WallSide;
  x: number; // center X on wall/canvas
  y: number; // center Y on wall/canvas
  length: number; // width of opening in px (e.g. 90 = 0.90m)
  orientation: 'horizontal' | 'vertical';
  /** Exact wall angle in degrees for arbitrary polygon edges */
  angleDeg?: number;
  swingDir: DoorSwingDir;
  label: string;
  contactEntityId: string;
  /** Arbitrary dynamic JSON structure (e.g. contact sensor IDs, BLE beacon, access control) */
  metadata?: Record<string, any>;
}

/**
 * Connects two floors vertically at synchronized 2D coordinates (Staircase, Elevator/Cable Shaft, Floor Portal).
 * Visible on both `fromFloorId` and `toFloorId` so clicking it jumps directly between connected floors.
 */
export interface FloorConnector {
  id: string;
  label: string;
  kind: FloorConnectorKind;
  fromFloorId: string;
  toFloorId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number; // 0, 90, 180, 270
  notes: string;
  /** Arbitrary dynamic JSON structure (e.g. vertical path costs, BLE relay, cable routing) */
  metadata?: Record<string, any>;
}

export interface FloorDevice {
  id: string;
  floorId: string;
  roomId: string;
  label: string;
  category: FloorDeviceCategory;
  x: number;
  y: number;
  width?: number; // default 148 px
  height?: number; // default 44 px
  rotationDeg?: number; // default 0 deg
  sourceType: FloorSourceType;
  primaryEntityId: string; // e.g. 'light.buro_og_grosses_licht' or 'thassi:3d-print'
  secondaryEntityId: string; // e.g. 'sensor.links_power' or 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit'
  targetAppId: string; // e.g. '3d-print', 'workflows', 'camera-vision'
  notes: string;
  /**
   * Arbitrary dynamic JSON structure for interactive properties, BLE/UWB beacon config,
   * GUID, HASS ID, Thassi ID, MAC address, and Axon callable attributes.
   */
  metadata?: Record<string, any>;
}

export interface SpatialDistanceResult {
  objectA: {
    id: string;
    kind: 'room' | 'opening' | 'connector' | 'device';
    label: string;
    floorId: string;
    x: number;
    y: number;
    zMeters: number;
    metadata: Record<string, any>;
  };
  objectB: {
    id: string;
    kind: 'room' | 'opening' | 'connector' | 'device';
    label: string;
    floorId: string;
    x: number;
    y: number;
    zMeters: number;
    metadata: Record<string, any>;
  };
  sameFloor: boolean;
  distance2dMeters: number;
  distance3dMeters: number;
  elevationDiffMeters: number;
  deltaXMeters: number;
  deltaYMeters: number;
  bearingDeg: number;
  estimatedBleRssiDbm: number;
  withinBeaconRange: boolean;
}

export interface SpatialRoomObjectsResult {
  room: {
    id: string;
    name: string;
    zoneCode: string;
    floorId: string;
    areaM2: number;
    metadata: Record<string, any>;
  };
  devices: Array<FloorDevice & { insidePolygon: boolean; assignedToRoom: boolean }>;
  openings: FloorOpening[];
  connectors: FloorConnector[];
  beacons: Array<{
    id: string;
    label: string;
    kind: string;
    x: number;
    y: number;
    beaconConfig: Record<string, any>;
    metadata: Record<string, any>;
  }>;
}

export interface CatalogSourceItem {
  id: string; // entity_id or 'thassi:...'
  sourceType: FloorSourceType;
  domain: string; // 'light' | 'switch' | 'sensor' | 'binary_sensor' | 'camera' | 'media_player' | 'thassi'
  suggestedCategory: FloorDeviceCategory;
  label: string;
  roomHint: string;
  state: string;
  unit: string;
  pairedEntityId: string; // auto-detected power or humidity entity
  pairedValue: string;
  pairedUnit: string;
  targetAppId: string;
  controllable: boolean;
  isOn: boolean;
}

export interface LiveSourceTelemetry {
  id: string;
  state: string;
  unit: string;
  isOn: boolean;
  controllable: boolean;
  secondaryValue: string;
  secondaryUnit: string;
  summaryText: string;
  updatedAt: string;
  attributes?: Record<string, unknown>;
}

export interface CustomWallSegment {
  id: string;
  floorId: 'eg' | 'og';
  x1: number; // in cm (0..1190)
  y1: number; // in cm (0..1690)
  x2: number;
  y2: number;
  thicknessCm: number; // e.g. 7, 12, 25, 38, 55
  heightM: number; // e.g. 2.6 or 3.0
  material: 'existing' | 'new' | 'partition';
  label?: string;
}

export interface FloorLabelItem {
  id: string;
  floorId: 'eg' | 'og';
  x: number; // cm
  y: number; // cm
  text: string;
  subtext?: string;
  color?: string;
}

export type WireKind = 'power_230v' | 'network_cat7' | 'switch_line' | 'water_heating';

export interface FloorWireSegment {
  id: string;
  floorId: 'eg' | 'og';
  kind: WireKind;
  x1: number; // cm
  y1: number; // cm
  x2: number; // cm
  y2: number; // cm
  elevationM?: number; // relative to floor (e.g. 0.15 floor, 1.10 wall, 2.55 ceiling)
  label: string;
  fromDeviceId?: string;
  toDeviceId?: string;
}

export interface FloorplanBootstrapPayload {
  floors: FloorLevel[];
  rooms: FloorRoom[];
  openings: FloorOpening[];
  connectors: FloorConnector[];
  devices: FloorDevice[];
  customWalls?: CustomWallSegment[];
  customLabels?: FloorLabelItem[];
  wires?: FloorWireSegment[];
  catalog: CatalogSourceItem[];
  liveMap: Record<string, LiveSourceTelemetry>;
  savedAt: string;
}
