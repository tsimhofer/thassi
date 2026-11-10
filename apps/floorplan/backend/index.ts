import {
  defineThassiApp,
  PcAgentReverseBridge,
  type HaEntityState,
  type ThassiAppContext,
} from '@thassi/sdk';
import type {
  CatalogSourceItem,
  FloorConnector,
  FloorConnectorKind,
  FloorDevice,
  FloorDeviceCategory,
  FloorLevel,
  FloorOpening,
  FloorplanBootstrapPayload,
  FloorRoom,
  LiveSourceTelemetry,
  RoomVertex,
  SpatialDistanceResult,
  SpatialRoomObjectsResult,
  CustomWallSegment,
  FloorLabelItem,
  FloorWireSegment,
} from '../shared/types.js';
import {
  BLUEPRINT_CONNECTORS,
  BLUEPRINT_DEVICES,
  BLUEPRINT_FLOORS,
  BLUEPRINT_LABELS,
  BLUEPRINT_OPENINGS,
  BLUEPRINT_ROOMS,
  BLUEPRINT_WALLS,
  BLUEPRINT_WIRES,
  PLAUSIBILITY_CHECKS,
  compileHouse3DModel,
  exportHouseGltfJson,
  exportHouseWavefrontObj,
} from '../shared/house-blueprint.js';

function deterministicMacFromId(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const b = [
    0x7c,
    0x2c,
    0x67,
    (h >>> 16) & 0xff,
    (h >>> 8) & 0xff,
    h & 0xff,
  ];
  return b.map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

function deterministicGuidFromId(id: string): string {
  let h1 = 0xdeadbeef ^ id.length;
  let h2 = 0x41c6ce57 ^ id.length;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex = (n: number, len: number) => (n >>> 0).toString(16).padStart(len, '0').slice(0, len);
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 ^ h2, 3)}-a${hex(h2 >>> 4, 3)}-${hex(h1, 6)}${hex(h2, 6)}`;
}

function buildDefaultMetadata(
  kind: 'room' | 'opening' | 'connector' | 'device',
  item: Record<string, any>
): Record<string, any> {
  const id = String(item.id || 'obj');
  const guid = deterministicGuidFromId(id);

  if (kind === 'room') {
    return {
      guid,
      thassiId: `thassi:room:${id}`,
      hassAreaId: String(item.zoneCode || id).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      zoneCode: item.zoneCode || '',
      climateSensors: {
        temperatureEntityId: item.tempEntityId || null,
        humidityEntityId: item.humidityEntityId || null,
      },
      beaconZone: {
        enabled: true,
        geofenceType: 'polygon_2d',
        bleScannerAnchor: id === 'room-buro-og' || id === 'room-wohnkueche-eg',
      },
      axonCallable: ['objectsInRoom', 'DistanceBetween', 'beaconsInRoom'],
    };
  }

  if (kind === 'opening') {
    return {
      guid,
      thassiId: `thassi:opening:${id}`,
      hassId: item.contactEntityId || null,
      openingKind: item.kind || 'door',
      acousticAttenuationDb: item.kind === 'window' ? 24 : 14,
      bleWallLossDb: item.kind === 'window' ? 2.5 : 4.0,
      axonCallable: ['DistanceBetween'],
    };
  }

  if (kind === 'connector') {
    return {
      guid,
      thassiId: `thassi:connector:${id}`,
      verticalTransition: {
        fromFloorId: item.fromFloorId || 'eg',
        toFloorId: item.toFloorId || 'og',
        traversalCostMeters: 4.2,
      },
      beaconRelay: {
        enabled: true,
        rangeMeters: 5.5,
      },
      axonCallable: ['DistanceBetween'],
    };
  }

  // Device
  const primaryId = String(item.primaryEntityId || '');
  const isBleOrSensor =
    primaryId.includes('blu') ||
    primaryId.includes('shelly') ||
    primaryId.includes('oral') ||
    primaryId.includes('series') ||
    item.category === 'motion' ||
    item.category === 'climate' ||
    item.category === 'workstation' ||
    item.category === 'thassi_app';

  // Extract MAC Suffix if present in entity_id (e.g. e4b32331dde0 or 7c2c676dc6fc)
  const macMatch = primaryId.match(/([0-9a-f]{12})/i);
  const mac = macMatch
    ? macMatch[1]
        .toUpperCase()
        .match(/.{1,2}/g)!
        .join(':')
    : deterministicMacFromId(id);

  return {
    guid,
    hassId: item.sourceType === 'ha_entity' ? primaryId : null,
    thassiId: item.sourceType === 'thassi_app' ? primaryId : `thassi:device:${id}`,
    targetAppId: item.targetAppId || null,
    mac,
    network: {
      protocol: primaryId.includes('blu') || primaryId.includes('series') ? 'BLE_5.2' : 'WiFi_BLE_Combo',
      reachable: true,
    },
    beacon: {
      enabled: isBleOrSensor,
      protocol: primaryId.includes('shelly') ? 'BTHome_v2' : 'iBeacon_BLE',
      uuid: guid,
      txPowerDbm: -12,
      rssiAt1m: -59,
      rangeMeters: item.category === 'workstation' || item.category === 'camera' ? 7.5 : 5.0,
    },
    axonCallable: ['DistanceBetween', 'nearestBeacons', 'triggerAxonAction'],
    customAttributes: {},
  };
}

function parseMetadataJson(
  raw: unknown,
  kind: 'room' | 'opening' | 'connector' | 'device',
  fallbackItem: Record<string, any>
): Record<string, any> {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return buildDefaultMetadata(kind, fallbackItem);
}

function rectToPoints(x: number, y: number, width: number, height: number): RoomVertex[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function computeBoundingBox(points: RoomVertex[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!points || points.length === 0) {
    return { x: 80, y: 80, width: 240, height: 180 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(40, Math.round(maxX - minX)),
    height: Math.max(40, Math.round(maxY - minY)),
  };
}

const DEFAULT_FLOORS: FloorLevel[] = BLUEPRINT_FLOORS;
const DEFAULT_ROOMS: FloorRoom[] = BLUEPRINT_ROOMS;
const DEFAULT_CONNECTORS: FloorConnector[] = BLUEPRINT_CONNECTORS;
const DEFAULT_OPENINGS: FloorOpening[] = BLUEPRINT_OPENINGS;
const DEFAULT_DEVICES: FloorDevice[] = BLUEPRINT_DEVICES;

function ensureSchemaAndSeed(ctx: ThassiAppContext) {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS floor_levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      elevation_meters REAL NOT NULL DEFAULT 0,
      grid_size_px INTEGER NOT NULL DEFAULT 20,
      scale_px_per_meter INTEGER NOT NULL DEFAULT 100,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS floor_rooms (
      id TEXT PRIMARY KEY,
      floor_id TEXT NOT NULL,
      name TEXT NOT NULL,
      zone_code TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      points_json TEXT NOT NULL DEFAULT '',
      wall_thickness REAL NOT NULL DEFAULT 10,
      temp_entity_id TEXT NOT NULL DEFAULT '',
      humidity_entity_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS floor_openings (
      id TEXT PRIMARY KEY,
      floor_id TEXT NOT NULL,
      room_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'door',
      wall TEXT NOT NULL DEFAULT 'top',
      x REAL NOT NULL,
      y REAL NOT NULL,
      length REAL NOT NULL DEFAULT 85,
      orientation TEXT NOT NULL DEFAULT 'horizontal',
      angle_deg REAL NOT NULL DEFAULT 0,
      swing_dir TEXT NOT NULL DEFAULT 'in_left',
      label TEXT NOT NULL DEFAULT '',
      contact_entity_id TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS floor_connectors (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'stairs',
      from_floor_id TEXT NOT NULL,
      to_floor_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL DEFAULT 95,
      height REAL NOT NULL DEFAULT 170,
      rotation_deg REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS floor_devices (
      id TEXT PRIMARY KEY,
      floor_id TEXT NOT NULL,
      room_id TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'switch',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL DEFAULT 148,
      height REAL NOT NULL DEFAULT 44,
      rotation_deg REAL NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'ha_entity',
      primary_entity_id TEXT NOT NULL DEFAULT '',
      secondary_entity_id TEXT NOT NULL DEFAULT '',
      target_app_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT ''
    );
  `);

  // Safe schema migrations for existing databases
  try {
    ctx.db.exec(`ALTER TABLE floor_levels ADD COLUMN elevation_meters REAL NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_rooms ADD COLUMN points_json TEXT NOT NULL DEFAULT '';`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_openings ADD COLUMN angle_deg REAL NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN width REAL NOT NULL DEFAULT 148;`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN height REAL NOT NULL DEFAULT 44;`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN rotation_deg REAL NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_rooms ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_openings ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_connectors ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {}
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {}

  const levelCountRow = ctx.db.queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM floor_levels'
  );
  if (!levelCountRow || levelCountRow.cnt === 0) {
    for (const fl of DEFAULT_FLOORS) {
      ctx.db.execute(
        `INSERT INTO floor_levels (id, name, subtitle, elevation_meters, grid_size_px, scale_px_per_meter, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fl.id,
          fl.name,
          fl.subtitle,
          Number(fl.elevationMeters ?? 0),
          fl.gridSizePx,
          fl.scalePxPerMeter,
          fl.sortOrder,
        ]
      );
    }
  }

  // Seed the reconstructed 11.90m x 16.90m single-wall architectural blueprint
  const blueprintSeeded = ctx.sharedDb.kvGet<boolean>('floorplan_blueprint_singlewall_v3');
  const roomCountRow = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM floor_rooms');
  if (!blueprintSeeded || !roomCountRow || roomCountRow.cnt === 0) {
    seedDefaults(ctx);
    ctx.sharedDb.kvSet('floorplan_cad_extensions_v1', {
      customWalls: BLUEPRINT_WALLS,
      customLabels: BLUEPRINT_LABELS,
      wires: BLUEPRINT_WIRES,
    });
    ctx.sharedDb.kvSet('floorplan_blueprint_singlewall_v3', true);
  }
}

function seedDefaults(ctx: ThassiAppContext) {
  ctx.db.execute('DELETE FROM floor_levels');
  ctx.db.execute('DELETE FROM floor_rooms');
  ctx.db.execute('DELETE FROM floor_openings');
  ctx.db.execute('DELETE FROM floor_connectors');
  ctx.db.execute('DELETE FROM floor_devices');

  for (const fl of DEFAULT_FLOORS) {
    ctx.db.execute(
      `INSERT INTO floor_levels (id, name, subtitle, elevation_meters, grid_size_px, scale_px_per_meter, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fl.id,
        fl.name,
        fl.subtitle,
        Number(fl.elevationMeters ?? 0),
        fl.gridSizePx,
        fl.scalePxPerMeter,
        fl.sortOrder,
      ]
    );
  }

  for (const r of DEFAULT_ROOMS) {
    const pts =
      Array.isArray(r.points) && r.points.length >= 3
        ? r.points
        : rectToPoints(r.x, r.y, r.width, r.height);
    const bbox = computeBoundingBox(pts);
    const meta = r.metadata || buildDefaultMetadata('room', r);
    ctx.db.execute(
      `INSERT INTO floor_rooms (id, floor_id, name, zone_code, x, y, width, height, points_json, wall_thickness, temp_entity_id, humidity_entity_id, notes, sort_order, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.id,
        r.floorId,
        r.name,
        r.zoneCode,
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        JSON.stringify(pts),
        r.wallThickness,
        r.tempEntityId,
        r.humidityEntityId,
        r.notes,
        r.sortOrder,
        JSON.stringify(meta),
      ]
    );
  }

  for (const op of DEFAULT_OPENINGS) {
    const meta = op.metadata || buildDefaultMetadata('opening', op);
    ctx.db.execute(
      `INSERT INTO floor_openings (id, floor_id, room_id, kind, wall, x, y, length, orientation, angle_deg, swing_dir, label, contact_entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        op.id,
        op.floorId,
        op.roomId,
        op.kind,
        op.wall,
        op.x,
        op.y,
        op.length,
        op.orientation,
        Number(op.angleDeg ?? (op.orientation === 'vertical' ? 90 : 0)),
        op.swingDir,
        op.label,
        op.contactEntityId,
        JSON.stringify(meta),
      ]
    );
  }

  for (const fc of DEFAULT_CONNECTORS) {
    const meta = fc.metadata || buildDefaultMetadata('connector', fc);
    ctx.db.execute(
      `INSERT INTO floor_connectors (id, label, kind, from_floor_id, to_floor_id, x, y, width, height, rotation_deg, notes, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fc.id,
        fc.label,
        fc.kind,
        fc.fromFloorId,
        fc.toFloorId,
        fc.x,
        fc.y,
        fc.width,
        fc.height,
        fc.rotationDeg,
        fc.notes,
        JSON.stringify(meta),
      ]
    );
  }

  for (const dv of DEFAULT_DEVICES) {
    const meta = dv.metadata || buildDefaultMetadata('device', dv);
    ctx.db.execute(
      `INSERT INTO floor_devices (id, floor_id, room_id, label, category, x, y, source_type, primary_entity_id, secondary_entity_id, target_app_id, notes, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dv.id,
        dv.floorId,
        dv.roomId,
        dv.label,
        dv.category,
        dv.x,
        dv.y,
        dv.sourceType,
        dv.primaryEntityId,
        dv.secondaryEntityId,
        dv.targetAppId,
        dv.notes,
        JSON.stringify(meta),
      ]
    );
  }
}

function loadPersistedState(ctx: ThassiAppContext): {
  floors: FloorLevel[];
  rooms: FloorRoom[];
  openings: FloorOpening[];
  connectors: FloorConnector[];
  devices: FloorDevice[];
} {
  ensureSchemaAndSeed(ctx);

  const floors = ctx.db
    .query<any>('SELECT * FROM floor_levels ORDER BY sort_order DESC, id ASC')
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      subtitle: String(r.subtitle || ''),
      elevationMeters: Number(r.elevation_meters ?? 0),
      gridSizePx: Number(r.grid_size_px || 20),
      scalePxPerMeter: Number(r.scale_px_per_meter || 100),
      sortOrder: Number(r.sort_order || 1),
    }));

  const rooms = ctx.db
    .query<any>('SELECT * FROM floor_rooms ORDER BY sort_order ASC, id ASC')
    .map((r) => {
      const rx = Number(r.x);
      const ry = Number(r.y);
      const rw = Number(r.width);
      const rh = Number(r.height);
      let points: RoomVertex[] = [];
      if (r.points_json) {
        try {
          const parsed = JSON.parse(String(r.points_json));
          if (Array.isArray(parsed) && parsed.length >= 3) {
            points = parsed.map((pt: any) => ({
              x: Number(pt.x || 0),
              y: Number(pt.y || 0),
            }));
          }
        } catch {}
      }
      if (points.length < 3) {
        points = rectToPoints(rx, ry, rw, rh);
      }
      const bbox = computeBoundingBox(points);
      const baseRoom = {
        id: String(r.id),
        floorId: String(r.floor_id),
        name: String(r.name),
        zoneCode: String(r.zone_code || ''),
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        points,
        wallThickness: Number(r.wall_thickness || 10),
        tempEntityId: String(r.temp_entity_id || ''),
        humidityEntityId: String(r.humidity_entity_id || ''),
        notes: String(r.notes || ''),
        sortOrder: Number(r.sort_order || 1),
      };
      return {
        ...baseRoom,
        metadata: parseMetadataJson(r.metadata_json, 'room', baseRoom),
      };
    });

  const openings = ctx.db.query<any>('SELECT * FROM floor_openings ORDER BY id ASC').map((r) => {
    const orient = (r.orientation === 'vertical' ? 'vertical' : 'horizontal') as
      | 'horizontal'
      | 'vertical';
    const baseOp = {
      id: String(r.id),
      floorId: String(r.floor_id),
      roomId: String(r.room_id || ''),
      kind: (r.kind || 'door') as FloorOpening['kind'],
      wall: (r.wall || 'top') as FloorOpening['wall'],
      x: Number(r.x),
      y: Number(r.y),
      length: Number(r.length || 85),
      orientation: orient,
      angleDeg:
        r.angle_deg !== undefined && r.angle_deg !== null
          ? Number(r.angle_deg)
          : orient === 'vertical'
          ? 90
          : 0,
      swingDir: (r.swing_dir || 'in_left') as FloorOpening['swingDir'],
      label: String(r.label || ''),
      contactEntityId: String(r.contact_entity_id || ''),
    };
    return {
      ...baseOp,
      metadata: parseMetadataJson(r.metadata_json, 'opening', baseOp),
    };
  });

  const connectors = ctx.db
    .query<any>('SELECT * FROM floor_connectors ORDER BY id ASC')
    .map((r) => {
      const baseConn = {
        id: String(r.id),
        label: String(r.label || 'Treppe'),
        kind: (r.kind || 'stairs') as FloorConnectorKind,
        fromFloorId: String(r.from_floor_id || 'eg'),
        toFloorId: String(r.to_floor_id || 'og'),
        x: Number(r.x || 600),
        y: Number(r.y || 120),
        width: Number(r.width || 95),
        height: Number(r.height || 170),
        rotationDeg: Number(r.rotation_deg || 0),
        notes: String(r.notes || ''),
      };
      return {
        ...baseConn,
        metadata: parseMetadataJson(r.metadata_json, 'connector', baseConn),
      };
    });

  const devices = ctx.db.query<any>('SELECT * FROM floor_devices ORDER BY id ASC').map((r) => {
    const baseDev = {
      id: String(r.id),
      floorId: String(r.floor_id),
      roomId: String(r.room_id || ''),
      label: String(r.label),
      category: (r.category || 'switch') as FloorDeviceCategory,
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width || 148),
      height: Number(r.height || 44),
      rotationDeg: Number(r.rotation_deg || 0),
      sourceType: (r.source_type === 'thassi_app' ? 'thassi_app' : 'ha_entity') as
        | 'ha_entity'
        | 'thassi_app',
      primaryEntityId: String(r.primary_entity_id || ''),
      secondaryEntityId: String(r.secondary_entity_id || ''),
      targetAppId: String(r.target_app_id || ''),
      notes: String(r.notes || ''),
    };
    return {
      ...baseDev,
      metadata: parseMetadataJson(r.metadata_json, 'device', baseDev),
    };
  });

  return { floors, rooms, openings, connectors, devices };
}

function inferCategoryFromEntity(e: HaEntityState): FloorDeviceCategory {
  const id = e.entity_id.toLowerCase();
  const domain = id.split('.')[0];
  const unit = String(e.attributes?.unit_of_measurement || '');
  if (domain === 'light') return 'light';
  if (domain === 'camera') return 'camera';
  if (domain === 'media_player') return 'media';
  if (domain === 'binary_sensor') {
    if (id.includes('motion') || id.includes('bewegung') || id.includes('presence')) {
      return 'motion';
    }
    return 'switch';
  }
  if (domain === 'switch') {
    if (id.includes('licht') || id.includes('beleuchtung') || id.includes('light')) {
      return 'light';
    }
    if (id.includes('pumpe') || id.includes('wasch') || id.includes('maschine')) {
      return 'appliance';
    }
    return 'switch';
  }
  if (unit === '°C' || (unit === '%' && (id.includes('feucht') || id.includes('humidity')))) {
    return 'climate';
  }
  if (unit === 'W' || unit === 'kW' || unit === 'kWh' || unit === 'Wh') {
    return 'power';
  }
  if (id.includes('epson') || id.includes('brother') || id.includes('printer')) {
    return 'printer_2d';
  }
  return 'power';
}

function inferRoomHint(entityId: string, friendlyName: string): string {
  const combined = `${entityId} ${friendlyName}`.toLowerCase();
  if (combined.includes('buro') || combined.includes('büro') || combined.includes('e4b32331dde0')) {
    return 'Büro OG';
  }
  if (combined.includes('wohnk') || combined.includes('samsung')) {
    return 'Wohnküche';
  }
  if (combined.includes('vorzimmer')) {
    return 'Vorzimmer OG';
  }
  if (combined.includes('gaeste') || combined.includes('gäste') || combined.includes('c049ef8a3a78')) {
    return 'Gästezimmer OG';
  }
  if (combined.includes('bad') || combined.includes('7c2c676dc6fc') || combined.includes('smart_series')) {
    return 'Bad OG';
  }
  if (combined.includes('stiegenhaus') || combined.includes('19ca')) {
    return 'Stiegenhaus';
  }
  if (combined.includes('garten') || combined.includes('outdoor') || combined.includes('eingang')) {
    return 'Außen / Eingang';
  }
  return 'Allgemein';
}

async function buildCatalogAndLiveTelemetry(ctx: ThassiAppContext): Promise<{
  catalog: CatalogSourceItem[];
  liveMap: Record<string, LiveSourceTelemetry>;
}> {
  let states: HaEntityState[] = [];
  try {
    states = await ctx.ha.getStates();
  } catch {
    states = [];
  }

  const stateMap = new Map<string, HaEntityState>(states.map((s) => [s.entity_id, s]));
  const liveMap: Record<string, LiveSourceTelemetry> = {};
  const catalog: CatalogSourceItem[] = [];
  const nowIso = new Date().toISOString();

  const knownPairs: Record<string, string> = {
    'light.buro_og_grosses_licht': 'sensor.links_power',
    'switch.buro_og_regal_lichter': 'sensor.shellyplugsg3_e4b063e4bfd8_power',
    'switch.buro_og_plug_90': 'sensor.kleines_licht_pumpe_power',
    'switch.buro_og_bewasserung_pumpe': 'sensor.schalter_neu_power',
    'light.thomasbuero_2pm_oben_output_1': 'sensor.thomasbuero_2pm_oben_switch_1_power',
    'sensor.shellyhtg3_e4b32331dde0_temperatur': 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
    'switch.wohnkueche_bodenbeleuchtung_boden': 'sensor.shelly_plus_2pm_a_switch_0_power',
    'switch.wohnkueche_fensterbank_licht': 'sensor.bodenbeleuchtung_power',
    'switch.shelly2pmg3_8cbfea9ac754_output_0': 'sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung',
    'switch.shelly2pmg3_8cbfea9ac754_output_1': 'sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung',
    'switch.shelly1pmminig4_7c2c676dc6fc': 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung',
    'switch.gaestezimmer_schalter_rechts': 'sensor.shellyplus2pm_c049ef8a3a78_switch_0_power',
    'switch.shellyplus2pm_c049ef8a3a78_switch_1': 'sensor.shellyplus2pm_c049ef8a3a78_switch_1_power',
    'binary_sensor.shelly_blu_motion_19ca_bewegung': 'sensor.shelly_blu_motion_19ca_beleuchtungsstarke',
    'sensor.epson_xp_7100_series': 'sensor.epson_xp_7100_series_black_ink',
  };

  const print3dSummary = ctx.sharedDb.kvGet<Record<string, any>>('thassi_3dprint_summary') || {};
  const visionSummary = ctx.sharedDb.kvGet<Record<string, any>>('camera_vision_today') || {};
  const healthSummary = ctx.sharedDb.kvGet<Record<string, any>>('google_health_today') || {};
  const mealsSummary = ctx.sharedDb.kvGet<Record<string, any>>('meal_planner_today') || {};
  const financeSummary = ctx.sharedDb.kvGet<Record<string, any>>('finance_summary') || {};
  const pcStatus = PcAgentReverseBridge.latestStatus;

  const thassiSources: CatalogSourceItem[] = [
    {
      id: 'thassi:pc-bridge',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'workstation',
      label: 'Workstation DESKTOP-M8TJERB (PC-Bridge & KVM)',
      roomHint: 'Büro OG',
      state: pcStatus ? `CPU ${pcStatus.cpuPercent ?? 0}%` : 'Bereit (WOL/Bridge)',
      unit: '',
      pairedEntityId: '',
      pairedValue: pcStatus?.memory
        ? `RAM ${pcStatus.memory.usedGb}/${pcStatus.memory.totalGb} GB`
        : '3 Monitore',
      pairedUnit: '',
      targetAppId: 'workflows',
      controllable: false,
      isOn: Boolean(pcStatus),
    },
    {
      id: 'thassi:3d-print',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'printer_3d',
      label: 'BambuLab 3D-Druck Studio (P1S / X1C)',
      roomHint: 'Büro OG',
      state: String(print3dSummary.printerState || print3dSummary.status || 'Bereit'),
      unit: '',
      pairedEntityId: 'sensor.shellyplugsg3_e4b063e4bfd8_power',
      pairedValue: print3dSummary.activeProjectTitle
        ? `${print3dSummary.activeProjectTitle} (${print3dSummary.progressPct || 0}%)`
        : 'Kein aktiver Druck',
      pairedUnit: '',
      targetAppId: '3d-print',
      controllable: false,
      isOn: Boolean(print3dSummary.isPrinting),
    },
    {
      id: 'thassi:camera-vision',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'camera',
      label: 'Camera Vision KI-Objekterkennung (6 Kameras)',
      roomHint: 'Außen / Eingang',
      state: `${visionSummary.totalDetectionsToday ?? 0} Erkennungen`,
      unit: '',
      pairedEntityId: '',
      pairedValue: `${visionSummary.onlineCameras ?? 6} Kameras aktiv`,
      pairedUnit: '',
      targetAppId: 'camera-vision',
      controllable: false,
      isOn: true,
    },
    {
      id: 'thassi:fritzbox',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'thassi_app',
      label: 'FRITZ!Box 6890 LTE & WLAN-Mesh (Obi-WLAN Kenobi)',
      roomHint: 'Stiegenhaus',
      state: stateMap.get('sensor.pixel_10_wifi_connection')?.state || 'Obi-WLAN Kenobi',
      unit: '',
      pairedEntityId: 'sensor.pixel_10_wifi_signal_strength',
      pairedValue: stateMap.get('sensor.pixel_10_wifi_signal_strength')?.state
        ? `${stateMap.get('sensor.pixel_10_wifi_signal_strength')?.state} dBm`
        : '192.168.188.1',
      pairedUnit: '',
      targetAppId: 'workflows',
      controllable: false,
      isOn: true,
    },
    {
      id: 'thassi:health',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'thassi_app',
      label: 'Pixel 10 & Pixel Watch Biometrie (Thassi Health)',
      roomHint: 'Gästezimmer OG',
      state: `${healthSummary.steps ?? stateMap.get('sensor.pixel_10_steps')?.state ?? 0} Schritte`,
      unit: '',
      pairedEntityId: 'sensor.pixel_10_battery_level',
      pairedValue: `Puls ${healthSummary.heartRateBpm ?? '—'} bpm · Akku ${
        stateMap.get('sensor.pixel_10_battery_level')?.state ?? '—'
      }%`,
      pairedUnit: '',
      targetAppId: 'google-health',
      controllable: false,
      isOn: true,
    },
    {
      id: 'thassi:meals',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'thassi_app',
      label: 'Ernährungs- & Wochenplan (Thassi Meals)',
      roomHint: 'Wohnküche',
      state: `${mealsSummary.totalKcal ?? 0} kcal`,
      unit: '',
      pairedEntityId: '',
      pairedValue: `${mealsSummary.plannedCount ?? 0} Mahlzeiten heute`,
      pairedUnit: '',
      targetAppId: 'meal-planner',
      controllable: false,
      isOn: true,
    },
    {
      id: 'thassi:finance',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'thassi_app',
      label: 'Finanz-Tresor & Cashflow (thassi.finances)',
      roomHint: 'Büro OG',
      state:
        financeSummary.currentBalance !== undefined
          ? `${Number(financeSummary.currentBalance).toFixed(2)} €`
          : 'Aktiv',
      unit: '',
      pairedEntityId: '',
      pairedValue:
        financeSummary.monthExpenses !== undefined
          ? `Monat: ${Number(financeSummary.monthExpenses).toFixed(0)} €`
          : 'Sparkasse George',
      pairedUnit: '',
      targetAppId: 'finance-analytics',
      controllable: false,
      isOn: true,
    },
    {
      id: 'thassi:energy.awattar',
      sourceType: 'thassi_app',
      domain: 'thassi',
      suggestedCategory: 'power',
      label: 'aWATTar Österreich EPEX-Spot Stromtarif',
      roomHint: 'Stiegenhaus',
      state: 'EPEX Spot AT',
      unit: '',
      pairedEntityId: '',
      pairedValue: 'Stündlicher Börsenstrompreis',
      pairedUnit: '',
      targetAppId: 'workflows',
      controllable: false,
      isOn: true,
    },
  ];

  for (const ts of thassiSources) {
    catalog.push(ts);
    liveMap[ts.id] = {
      id: ts.id,
      state: ts.state,
      unit: ts.unit,
      isOn: ts.isOn,
      controllable: ts.controllable,
      secondaryValue: ts.pairedValue,
      secondaryUnit: ts.pairedUnit,
      summaryText: `${ts.state}${ts.pairedValue ? ` · ${ts.pairedValue}` : ''}`,
      updatedAt: nowIso,
    };
  }

  const allowedDomains = new Set([
    'light',
    'switch',
    'sensor',
    'binary_sensor',
    'camera',
    'media_player',
    'climate',
  ]);

  for (const st of states) {
    const domain = st.entity_id.split('.')[0];
    if (!allowedDomains.has(domain)) continue;
    const unit = String(st.attributes?.unit_of_measurement || '');
    const friendly = String(st.attributes?.friendly_name || st.entity_id);
    const controllable = domain === 'light' || domain === 'switch' || domain === 'media_player';
    const isOn =
      st.state === 'on' ||
      st.state === 'playing' ||
      st.state === 'recording' ||
      st.state === 'streaming';

    const pairedId = knownPairs[st.entity_id] || '';
    const pairedSt = pairedId ? stateMap.get(pairedId) : undefined;
    const pairedVal =
      pairedSt && pairedSt.state !== 'unavailable' && pairedSt.state !== 'unknown'
        ? String(pairedSt.state)
        : '';
    const pairedUnit = pairedSt ? String(pairedSt.attributes?.unit_of_measurement || '') : '';

    const item: CatalogSourceItem = {
      id: st.entity_id,
      sourceType: 'ha_entity',
      domain,
      suggestedCategory: inferCategoryFromEntity(st),
      label: friendly,
      roomHint: inferRoomHint(st.entity_id, friendly),
      state: String(st.state),
      unit,
      pairedEntityId: pairedId,
      pairedValue: pairedVal,
      pairedUnit,
      targetAppId: domain === 'camera' ? 'camera-vision' : 'smart-canvas',
      controllable,
      isOn,
    };
    catalog.push(item);

    liveMap[st.entity_id] = {
      id: st.entity_id,
      state: String(st.state),
      unit,
      isOn,
      controllable,
      secondaryValue: pairedVal,
      secondaryUnit: pairedUnit,
      summaryText: `${st.state}${unit ? ` ${unit}` : ''}${
        pairedVal ? ` · ${pairedVal}${pairedUnit ? ` ${pairedUnit}` : ''}` : ''
      }`,
      updatedAt: st.last_updated || nowIso,
      attributes: st.attributes,
    };
  }

  return { catalog, liveMap };
}

function pointInPolygon(pt: { x: number; y: number }, polygon: RoomVertex[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function computePolygonAreaM2(points: RoomVertex[]): number {
  if (!points || points.length < 3) return 0;
  let areaPx2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    areaPx2 += p1.x * p2.y - p2.x * p1.y;
  }
  return Number((Math.abs(areaPx2) / 2 / 10000).toFixed(2));
}

function resolveSpatialObject(
  state: ReturnType<typeof loadPersistedState>,
  identifier: string
): {
  id: string;
  kind: 'room' | 'opening' | 'connector' | 'device';
  label: string;
  floorId: string;
  x: number;
  y: number;
  zMeters: number;
  metadata: Record<string, any>;
} | null {
  const q = String(identifier || '').trim().toLowerCase();
  if (!q) return null;

  const floorElevMap = new Map<string, number>();
  for (const fl of state.floors) {
    floorElevMap.set(fl.id, Number(fl.elevationMeters ?? 0));
  }

  const matchesMeta = (meta: Record<string, any> | undefined) => {
    if (!meta) return false;
    const candidates = [meta.guid, meta.hassId, meta.thassiId, meta.mac, meta.zoneCode];
    return candidates.some((c) => typeof c === 'string' && c.toLowerCase() === q);
  };

  for (const dev of state.devices) {
    if (
      dev.id.toLowerCase() === q ||
      dev.label.toLowerCase() === q ||
      dev.primaryEntityId.toLowerCase() === q ||
      matchesMeta(dev.metadata)
    ) {
      return {
        id: dev.id,
        kind: 'device',
        label: dev.label,
        floorId: dev.floorId,
        x: dev.x,
        y: dev.y,
        zMeters: floorElevMap.get(dev.floorId) ?? 0,
        metadata: dev.metadata || {},
      };
    }
  }

  for (const r of state.rooms) {
    if (
      r.id.toLowerCase() === q ||
      r.name.toLowerCase() === q ||
      r.zoneCode.toLowerCase() === q ||
      matchesMeta(r.metadata)
    ) {
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);
      return {
        id: r.id,
        kind: 'room',
        label: r.name,
        floorId: r.floorId,
        x: cx,
        y: cy,
        zMeters: floorElevMap.get(r.floorId) ?? 0,
        metadata: r.metadata || {},
      };
    }
  }

  for (const op of state.openings) {
    if (
      op.id.toLowerCase() === q ||
      op.label.toLowerCase() === q ||
      matchesMeta(op.metadata)
    ) {
      return {
        id: op.id,
        kind: 'opening',
        label: op.label || op.id,
        floorId: op.floorId,
        x: op.x,
        y: op.y,
        zMeters: floorElevMap.get(op.floorId) ?? 0,
        metadata: op.metadata || {},
      };
    }
  }

  for (const fc of state.connectors) {
    if (
      fc.id.toLowerCase() === q ||
      fc.label.toLowerCase() === q ||
      matchesMeta(fc.metadata)
    ) {
      return {
        id: fc.id,
        kind: 'connector',
        label: fc.label,
        floorId: fc.fromFloorId,
        x: Math.round(fc.x + fc.width / 2),
        y: Math.round(fc.y + fc.height / 2),
        zMeters: floorElevMap.get(fc.fromFloorId) ?? 0,
        metadata: fc.metadata || {},
      };
    }
  }

  return null;
}

function computeDistanceBetween(
  state: ReturnType<typeof loadPersistedState>,
  idA: string,
  idB: string
): SpatialDistanceResult | null {
  const objA = resolveSpatialObject(state, idA);
  const objB = resolveSpatialObject(state, idB);
  if (!objA || !objB) return null;

  const dxMeters = Number(((objB.x - objA.x) / 100).toFixed(2));
  const dyMeters = Number(((objB.y - objA.y) / 100).toFixed(2));
  const dzMeters = Number((objB.zMeters - objA.zMeters).toFixed(2));
  const dist2d = Number(Math.hypot(dxMeters, dyMeters).toFixed(2));
  const dist3d = Number(Math.hypot(dxMeters, dyMeters, dzMeters).toFixed(2));
  const bearingDeg = Math.round(((Math.atan2(dyMeters, dxMeters) * 180) / Math.PI + 360) % 360);

  const sameFloor = objA.floorId === objB.floorId;
  const rssi1m =
    Number(objA.metadata?.beacon?.rssiAt1m ?? objB.metadata?.beacon?.rssiAt1m ?? -59);
  const floorAttenuationDb = sameFloor ? 0 : 14;
  const effDist = Math.max(0.25, dist3d);
  const estimatedBleRssiDbm = Math.round(
    rssi1m - 10 * 2.2 * Math.log10(effDist) - floorAttenuationDb
  );
  const maxBeaconRange = Number(
    objA.metadata?.beacon?.rangeMeters ?? objB.metadata?.beacon?.rangeMeters ?? 6.5
  );

  return {
    objectA: objA,
    objectB: objB,
    sameFloor,
    distance2dMeters: dist2d,
    distance3dMeters: dist3d,
    elevationDiffMeters: Math.abs(dzMeters),
    deltaXMeters: dxMeters,
    deltaYMeters: dyMeters,
    bearingDeg,
    estimatedBleRssiDbm,
    withinBeaconRange: dist3d <= maxBeaconRange,
  };
}

function computeObjectsInRoom(
  state: ReturnType<typeof loadPersistedState>,
  roomIdentifier: string
): SpatialRoomObjectsResult | null {
  const q = String(roomIdentifier || '').trim().toLowerCase();
  if (!q) return null;

  const room = state.rooms.find(
    (r) =>
      r.id.toLowerCase() === q ||
      r.name.toLowerCase() === q ||
      r.zoneCode.toLowerCase() === q ||
      String(r.metadata?.guid || '').toLowerCase() === q ||
      String(r.metadata?.thassiId || '').toLowerCase() === q
  );
  if (!room) return null;

  const poly =
    Array.isArray(room.points) && room.points.length >= 3
      ? room.points
      : rectToPoints(room.x, room.y, room.width, room.height);

  const matchedDevices = state.devices
    .filter((d) => d.floorId === room.floorId)
    .map((d) => {
      const insidePolygon = pointInPolygon({ x: d.x, y: d.y }, poly);
      const assignedToRoom = d.roomId === room.id;
      return {
        ...d,
        insidePolygon,
        assignedToRoom,
      };
    })
    .filter((d) => d.insidePolygon || d.assignedToRoom);

  const matchedOpenings = state.openings.filter((op) => {
    if (op.floorId !== room.floorId) return false;
    if (op.roomId === room.id) return true;
    // Also check if opening center is within 25px of room bounding box / polygon
    return (
      op.x >= room.x - 25 &&
      op.x <= room.x + room.width + 25 &&
      op.y >= room.y - 25 &&
      op.y <= room.y + room.height + 25
    );
  });

  const matchedConnectors = state.connectors.filter((fc) => {
    if (fc.fromFloorId !== room.floorId && fc.toFloorId !== room.floorId) return false;
    const cx = fc.x + fc.width / 2;
    const cy = fc.y + fc.height / 2;
    return pointInPolygon({ x: cx, y: cy }, poly);
  });

  const beacons = matchedDevices
    .filter((d) => Boolean(d.metadata?.beacon?.enabled || d.metadata?.mac))
    .map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.category,
      x: d.x,
      y: d.y,
      beaconConfig: d.metadata?.beacon || {},
      metadata: d.metadata || {},
    }));

  return {
    room: {
      id: room.id,
      name: room.name,
      zoneCode: room.zoneCode,
      floorId: room.floorId,
      areaM2: computePolygonAreaM2(poly),
      metadata: room.metadata || {},
    },
    devices: matchedDevices,
    openings: matchedOpenings,
    connectors: matchedConnectors,
    beacons,
  };
}

function saveFloorplanSummaryToSharedDb(ctx: ThassiAppContext) {
  const state = loadPersistedState(ctx);
  const { floors, rooms, openings, connectors, devices } = state;
  const beaconCount = devices.filter((d) => Boolean(d.metadata?.beacon?.enabled)).length;
  const summary = {
    floorCount: floors.length,
    roomCount: rooms.length,
    openingCount: openings.length,
    connectorCount: connectors.length,
    deviceCount: devices.length,
    beaconCount,
    updatedAt: new Date().toISOString(),
  };
  ctx.sharedDb.kvSet('floorplan_summary', summary);
  // Also publish full spatial & metadata graph for Axons and cross-app spatial reasoning
  ctx.sharedDb.kvSet('floorplan_spatial_graph', {
    ...state,
    updatedAt: summary.updatedAt,
  });
  return summary;
}

export default defineThassiApp(async (ctx) => {
  ensureSchemaAndSeed(ctx);
  saveFloorplanSummaryToSharedDb(ctx);

  // 1. GET /bootstrap — Load persisted floorplan + catalog + live telemetry
  ctx.route('GET', '/bootstrap', async (_req, c) => {
    const { floors, rooms, openings, connectors, devices } = loadPersistedState(c);
    const { catalog, liveMap } = await buildCatalogAndLiveTelemetry(c);

    for (const dv of devices) {
      if (
        dv.primaryEntityId &&
        dv.secondaryEntityId &&
        liveMap[dv.primaryEntityId] &&
        liveMap[dv.secondaryEntityId]
      ) {
        const sec = liveMap[dv.secondaryEntityId];
        liveMap[dv.primaryEntityId] = {
          ...liveMap[dv.primaryEntityId],
          secondaryValue: sec.state,
          secondaryUnit: sec.unit,
        };
      }
    }

    const ext = c.sharedDb.kvGet<{
      customWalls?: CustomWallSegment[];
      customLabels?: FloorLabelItem[];
      wires?: FloorWireSegment[];
    }>('floorplan_cad_extensions_v1');

    const payload: FloorplanBootstrapPayload = {
      floors,
      rooms,
      openings,
      connectors,
      devices,
      customWalls:
        ext?.customWalls && ext.customWalls.length > 0 ? ext.customWalls : BLUEPRINT_WALLS,
      customLabels: ext?.customLabels || BLUEPRINT_LABELS,
      wires: ext?.wires || BLUEPRINT_WIRES,
      catalog,
      liveMap,
      savedAt: new Date().toISOString(),
    };
    return payload;
  });

  // 2. GET /live — Fast live state refresh for all placed devices & room climate sensors
  ctx.route('GET', '/live', async (_req, c) => {
    const { devices } = loadPersistedState(c);
    const { liveMap } = await buildCatalogAndLiveTelemetry(c);
    for (const dv of devices) {
      if (
        dv.primaryEntityId &&
        dv.secondaryEntityId &&
        liveMap[dv.primaryEntityId] &&
        liveMap[dv.secondaryEntityId]
      ) {
        const sec = liveMap[dv.secondaryEntityId];
        liveMap[dv.primaryEntityId] = {
          ...liveMap[dv.primaryEntityId],
          secondaryValue: sec.state,
          secondaryUnit: sec.unit,
        };
      }
    }
    return { liveMap, updatedAt: new Date().toISOString() };
  });

  // 3. POST /save — Persist entire floorplan state (floors, rooms with polygon points, openings, connectors, devices)
  ctx.route('POST', '/save', async (req, c) => {
    const body = (req.body || {}) as {
      floors?: FloorLevel[];
      rooms?: FloorRoom[];
      openings?: FloorOpening[];
      connectors?: FloorConnector[];
      devices?: FloorDevice[];
      customWalls?: CustomWallSegment[];
      customLabels?: FloorLabelItem[];
      wires?: FloorWireSegment[];
    };

    const prevExt = c.sharedDb.kvGet<{
      customWalls?: CustomWallSegment[];
      customLabels?: FloorLabelItem[];
      wires?: FloorWireSegment[];
    }>('floorplan_cad_extensions_v1') || {};

    c.sharedDb.kvSet('floorplan_cad_extensions_v1', {
      customWalls: Array.isArray(body.customWalls) ? body.customWalls : (prevExt.customWalls || []),
      customLabels: Array.isArray(body.customLabels) ? body.customLabels : (prevExt.customLabels || BLUEPRINT_LABELS),
      wires: Array.isArray(body.wires) ? body.wires : (prevExt.wires || BLUEPRINT_WIRES),
    });

    ensureSchemaAndSeed(c);

    if (Array.isArray(body.floors)) {
      c.db.execute('DELETE FROM floor_levels');
      for (const fl of body.floors) {
        c.db.execute(
          `INSERT INTO floor_levels (id, name, subtitle, elevation_meters, grid_size_px, scale_px_per_meter, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            fl.id,
            fl.name || fl.id,
            fl.subtitle || '',
            Number(fl.elevationMeters ?? 0),
            Number(fl.gridSizePx || 20),
            Number(fl.scalePxPerMeter || 100),
            Number(fl.sortOrder || 1),
          ]
        );
      }
    }

    if (Array.isArray(body.rooms)) {
      c.db.execute('DELETE FROM floor_rooms');
      for (const r of body.rooms) {
        const pts =
          Array.isArray(r.points) && r.points.length >= 3
            ? r.points.map((pt) => ({
                x: Math.round(Number(pt.x || 0)),
                y: Math.round(Number(pt.y || 0)),
              }))
            : rectToPoints(
                Math.round(Number(r.x || 0)),
                Math.round(Number(r.y || 0)),
                Math.max(40, Math.round(Number(r.width || 200))),
                Math.max(40, Math.round(Number(r.height || 200)))
              );
        const bbox = computeBoundingBox(pts);

        const metaObj =
          r.metadata && typeof r.metadata === 'object'
            ? r.metadata
            : buildDefaultMetadata('room', r);

        c.db.execute(
          `INSERT INTO floor_rooms (id, floor_id, name, zone_code, x, y, width, height, points_json, wall_thickness, temp_entity_id, humidity_entity_id, notes, sort_order, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.floorId || 'og',
            r.name || 'Raum',
            r.zoneCode || '',
            bbox.x,
            bbox.y,
            bbox.width,
            bbox.height,
            JSON.stringify(pts),
            Number(r.wallThickness || 10),
            r.tempEntityId || '',
            r.humidityEntityId || '',
            r.notes || '',
            Number(r.sortOrder || 1),
            JSON.stringify(metaObj),
          ]
        );
      }
    }

    if (Array.isArray(body.openings)) {
      c.db.execute('DELETE FROM floor_openings');
      for (const op of body.openings) {
        const orient = op.orientation === 'vertical' ? 'vertical' : 'horizontal';
        const metaObj =
          op.metadata && typeof op.metadata === 'object'
            ? op.metadata
            : buildDefaultMetadata('opening', op);
        c.db.execute(
          `INSERT INTO floor_openings (id, floor_id, room_id, kind, wall, x, y, length, orientation, angle_deg, swing_dir, label, contact_entity_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            op.id,
            op.floorId || 'og',
            op.roomId || '',
            op.kind || 'door',
            op.wall || 'top',
            Math.round(Number(op.x || 0)),
            Math.round(Number(op.y || 0)),
            Math.max(30, Math.round(Number(op.length || 85))),
            orient,
            Number(op.angleDeg ?? (orient === 'vertical' ? 90 : 0)),
            op.swingDir || 'in_left',
            op.label || '',
            op.contactEntityId || '',
            JSON.stringify(metaObj),
          ]
        );
      }
    }

    if (Array.isArray(body.connectors)) {
      c.db.execute('DELETE FROM floor_connectors');
      for (const fc of body.connectors) {
        const metaObj =
          fc.metadata && typeof fc.metadata === 'object'
            ? fc.metadata
            : buildDefaultMetadata('connector', fc);
        c.db.execute(
          `INSERT INTO floor_connectors (id, label, kind, from_floor_id, to_floor_id, x, y, width, height, rotation_deg, notes, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fc.id,
            fc.label || 'Treppe',
            fc.kind || 'stairs',
            fc.fromFloorId || 'eg',
            fc.toFloorId || 'og',
            Math.round(Number(fc.x || 600)),
            Math.round(Number(fc.y || 120)),
            Math.max(40, Math.round(Number(fc.width || 95))),
            Math.max(40, Math.round(Number(fc.height || 170))),
            Number(fc.rotationDeg || 0),
            fc.notes || '',
            JSON.stringify(metaObj),
          ]
        );
      }
    }

    if (Array.isArray(body.devices)) {
      c.db.execute('DELETE FROM floor_devices');
      for (const dv of body.devices) {
        const metaObj =
          dv.metadata && typeof dv.metadata === 'object'
            ? dv.metadata
            : buildDefaultMetadata('device', dv);
        c.db.execute(
          `INSERT INTO floor_devices (id, floor_id, room_id, label, category, x, y, width, height, rotation_deg, source_type, primary_entity_id, secondary_entity_id, target_app_id, notes, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dv.id,
            dv.floorId || 'og',
            dv.roomId || '',
            dv.label || 'Gerät',
            dv.category || 'switch',
            Math.round(Number(dv.x || 0)),
            Math.round(Number(dv.y || 0)),
            Math.max(70, Math.round(Number(dv.width || 148))),
            Math.max(28, Math.round(Number(dv.height || 44))),
            Number(dv.rotationDeg || 0),
            dv.sourceType === 'thassi_app' ? 'thassi_app' : 'ha_entity',
            dv.primaryEntityId || '',
            dv.secondaryEntityId || '',
            dv.targetAppId || '',
            dv.notes || '',
            JSON.stringify(metaObj),
          ]
        );
      }
    }

    const summary = saveFloorplanSummaryToSharedDb(c);
    await c.ha.publishSensor(
      'thassi_floorplan_status',
      `${summary.floorCount} Geschosse · ${summary.roomCount} Räume · ${summary.deviceCount} Geräte (${summary.beaconCount} Beacons)`,
      {
        friendly_name: 'Thassi 2D Grundriss & Raumplaner',
        icon: 'mdi:floor-plan',
        ...summary,
      }
    );

    return {
      ok: true,
      savedAt: summary.updatedAt,
      ...loadPersistedState(c),
    };
  });

  // 4. POST /spatial/axon-exec — Execute spatial & Beacon functions for Axons (DistanceBetween, objectsInRoom, beaconsInRange, findByMetadata)
  ctx.route('POST', '/spatial/axon-exec', async (req, c) => {
    const body = (req.body || {}) as {
      fn?: string;
      args?: any[];
      objectAId?: string;
      objectBId?: string;
      roomId?: string;
    };
    const state = loadPersistedState(c);
    const fnName = String(body.fn || '').trim();
    const args = Array.isArray(body.args) ? body.args : [];

    if (fnName === 'DistanceBetween' || fnName === 'distanceBetween') {
      const a = String(args[0] ?? body.objectAId ?? '');
      const b = String(args[1] ?? body.objectBId ?? '');
      const result = computeDistanceBetween(state, a, b);
      if (!result) {
        return {
          status: 404,
          body: { error: `Objekt "${a}" oder "${b}" im Grundriss nicht gefunden.` },
        };
      }
      return {
        ok: true,
        fn: 'DistanceBetween',
        expression: `DistanceBetween("${a}", "${b}")`,
        result,
      };
    }

    if (fnName === 'objectsInRoom' || fnName === 'ObjectsInRoom') {
      const roomId = String(args[0] ?? body.roomId ?? '');
      const result = computeObjectsInRoom(state, roomId);
      if (!result) {
        return {
          status: 404,
          body: { error: `Raum "${roomId}" im Grundriss nicht gefunden.` },
        };
      }
      return {
        ok: true,
        fn: 'objectsInRoom',
        expression: `objectsInRoom("${roomId}")`,
        result,
      };
    }

    if (fnName === 'beaconsInRange' || fnName === 'nearestBeacons') {
      const targetId = String(args[0] ?? body.objectAId ?? '');
      const maxMeters = Number(args[1] ?? 10);
      const origin = resolveSpatialObject(state, targetId);
      if (!origin) {
        return {
          status: 404,
          body: { error: `Ursprungsobjekt "${targetId}" nicht gefunden.` },
        };
      }
      const matches = state.devices
        .filter((d) => d.id !== origin.id && Boolean(d.metadata?.beacon?.enabled || d.metadata?.mac))
        .map((d) => computeDistanceBetween(state, origin.id, d.id))
        .filter((r): r is SpatialDistanceResult => Boolean(r) && r.distance3dMeters <= maxMeters)
        .sort((a, b) => a.distance3dMeters - b.distance3dMeters);

      return {
        ok: true,
        fn: 'beaconsInRange',
        expression: `beaconsInRange("${targetId}", ${maxMeters})`,
        result: {
          origin,
          maxMeters,
          count: matches.length,
          beacons: matches,
        },
      };
    }

    return {
      status: 400,
      body: {
        error: `Unbekannte räumliche Axon-Funktion "${fnName}". Unterstützt: DistanceBetween(a, b), objectsInRoom(roomId), beaconsInRange(id, maxMeters).`,
      },
    };
  });

  // 4. POST /device/control — Toggle or control a linked Home Assistant entity directly from the 2D floorplan
  ctx.route('POST', '/device/control', async (req, c) => {
    const body = (req.body || {}) as {
      entityId?: string;
      action?: 'toggle' | 'turn_on' | 'turn_off';
    };
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      return { status: 400, body: { error: 'entityId fehlt' } };
    }
    const domain = entityId.split('.')[0];
    if (!['light', 'switch', 'media_player', 'script', 'automation'].includes(domain)) {
      return { status: 400, body: { error: `Domäne "${domain}" ist nicht direkt schaltbar.` } };
    }
    const service =
      body.action === 'turn_on'
        ? 'turn_on'
        : body.action === 'turn_off'
        ? 'turn_off'
        : domain === 'media_player'
        ? 'media_play_pause'
        : 'toggle';

    await c.ha.callService(domain, service, { entity_id: entityId });
    const { liveMap } = await buildCatalogAndLiveTelemetry(c);
    return {
      ok: true,
      entityId,
      service,
      live: liveMap[entityId] || null,
      liveMap,
    };
  });

  // 5. POST /clear — Clear all drawn floorplan objects (rooms, openings, connectors, devices) while keeping floor levels & sensor catalog
  ctx.route('POST', '/clear', async (_req, c) => {
    ensureSchemaAndSeed(c);
    c.db.execute('DELETE FROM floor_rooms');
    c.db.execute('DELETE FROM floor_openings');
    c.db.execute('DELETE FROM floor_connectors');
    c.db.execute('DELETE FROM floor_devices');
    const summary = saveFloorplanSummaryToSharedDb(c);
    const { catalog, liveMap } = await buildCatalogAndLiveTelemetry(c);
    return {
      ok: true,
      savedAt: summary.updatedAt,
      ...loadPersistedState(c),
      catalog,
      liveMap,
    };
  });

  // 6. POST /reset-defaults — Reset floorplan to default rooms, doors/windows, floor connectors & linked devices
  ctx.route('POST', '/reset-defaults', async (_req, c) => {
    seedDefaults(c);
    c.sharedDb.kvSet('floorplan_cad_extensions_v1', {
      customWalls: BLUEPRINT_WALLS,
      customLabels: BLUEPRINT_LABELS,
      wires: BLUEPRINT_WIRES,
    });
    const summary = saveFloorplanSummaryToSharedDb(c);
    const { catalog, liveMap } = await buildCatalogAndLiveTelemetry(c);
    return {
      ok: true,
      savedAt: summary.updatedAt,
      ...loadPersistedState(c),
      customWalls: BLUEPRINT_WALLS,
      customLabels: BLUEPRINT_LABELS,
      wires: BLUEPRINT_WIRES,
      catalog,
      liveMap,
    };
  });

  // 7. GET /model/obj — Download standard Wavefront OBJ 3D model
  ctx.route('GET', '/model/obj', async () => {
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1.0 });
    return {
      obj: exportHouseWavefrontObj(model),
      triangleCount: model.triangleCount,
      vertexCount: model.vertexCount,
    };
  });

  // 8. GET /model/gltf — Download standard Khronos glTF 2.0 3D model
  ctx.route('GET', '/model/gltf', async () => {
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1.0 });
    return JSON.parse(exportHouseGltfJson(model));
  });

  // 9. GET /model/json — Download complete reconstructed architectural JSON & plausibility report
  ctx.route('GET', '/model/json', async (_req, c) => {
    const state = loadPersistedState(c);
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1.0 });
    return {
      outerDimensionsMeters: {
        width: 11.9,
        depth: 16.9,
        egClearHeight: 3.0,
        ogClearHeight: 2.6,
        ridgeHeight: 9.25,
      },
      plausibilityChecks: PLAUSIBILITY_CHECKS,
      ...state,
      meshStats: {
        triangleCount: model.triangleCount,
        vertexCount: model.vertexCount,
      },
    };
  });
});
