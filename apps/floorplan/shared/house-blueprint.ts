import type {
  CustomWallSegment,
  FloorConnector,
  FloorDevice,
  FloorLabelItem,
  FloorLevel,
  FloorOpening,
  FloorRoom,
  FloorWireSegment,
  OpeningKind,
} from './types.js';

export interface PlausibilityCheckItem {
  id: string;
  category: 'chain_x' | 'chain_y' | 'area' | 'elevation' | 'structural';
  title: string;
  formula: string;
  expected: string;
  measured: string;
  deviationCm: number;
  passed: boolean;
}

export interface OpeningPreset {
  id: string;
  kind: OpeningKind;
  name: string;
  subtitle: string;
  widthCm: number;
  heightCm: number;
  sillCm: number;
}

export const WINDOW_PRESETS: OpeningPreset[] = [
  {
    id: 'win-street-120x140',
    kind: 'window',
    name: 'Straßenfenster 120 × 140',
    subtitle: 'Standard OG/EG · Brüstung 90 cm',
    widthCm: 120,
    heightCm: 140,
    sillCm: 90,
  },
  {
    id: 'win-shop-150x150',
    kind: 'window',
    name: 'Schaufenster / Auslage 150 × 150',
    subtitle: 'Verkaufsraum & Lager EG · Brüstung 90 cm',
    widthCm: 150,
    heightCm: 150,
    sillCm: 90,
  },
  {
    id: 'win-hof-220x150',
    kind: 'window',
    name: 'Breitfenster Backstube 220 × 150',
    subtitle: 'Hofseite Nord · Brüstung 90 cm',
    widthCm: 220,
    heightCm: 150,
    sillCm: 90,
  },
  {
    id: 'win-sanitaer-70x90',
    kind: 'window',
    name: 'Sanitärfenster Bad/WC 70 × 90',
    subtitle: 'Kippfenster · Brüstung 130 cm',
    widthCm: 70,
    heightCm: 90,
    sillCm: 130,
  },
  {
    id: 'win-french-100x210',
    kind: 'window',
    name: 'Bodentiefes Fenster 100 × 210',
    subtitle: 'Loggia / Garten · Brüstung 0 cm',
    widthCm: 100,
    heightCm: 210,
    sillCm: 0,
  },
];

export const DOOR_PRESETS: OpeningPreset[] = [
  {
    id: 'door-room-85x194',
    kind: 'door',
    name: 'Innentür 85 × 194 cm',
    subtitle: 'Standard Zimmertür (Planmaß 85/194)',
    widthCm: 85,
    heightCm: 194,
    sillCm: 0,
  },
  {
    id: 'door-sanitaer-70x194',
    kind: 'door',
    name: 'Sanitärtür 70 × 194 cm',
    subtitle: 'Bad & WC (Planmaß 70/194)',
    widthCm: 70,
    heightCm: 194,
    sillCm: 0,
  },
  {
    id: 'door-diele-90x194',
    kind: 'door',
    name: 'Wohnungstür / Diele 90 × 194 cm',
    subtitle: 'Vorraum → Diele (Planmaß 90/194)',
    widthCm: 90,
    heightCm: 194,
    sillCm: 0,
  },
  {
    id: 'door-loggia-100x210',
    kind: 'door',
    name: 'Loggiatür 100 × 210 cm',
    subtitle: 'Verglaste Balkontür (Planmaß 100/210)',
    widthCm: 100,
    heightCm: 210,
    sillCm: 0,
  },
  {
    id: 'door-entry-120x210',
    kind: 'door',
    name: 'Hauseingangstür 120 × 210 cm',
    subtitle: 'Straßeneingang Vorraum EG',
    widthCm: 120,
    heightCm: 210,
    sillCm: 0,
  },
  {
    id: 'door-portal-210x220',
    kind: 'sliding_door',
    name: 'Geschäftsportal 210 × 220 cm',
    subtitle: 'Doppelflügel Verkaufsraum Straße',
    widthCm: 210,
    heightCm: 220,
    sillCm: 0,
  },
  {
    id: 'door-passage-250x220',
    kind: 'passage',
    name: 'Wanddurchbruch / Unterzug 250 cm',
    subtitle: 'Offener Trägerdurchgang',
    widthCm: 250,
    heightCm: 220,
    sillCm: 0,
  },
];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MeshTriangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  normal: Vec3;
  color: string;
  material:
    | 'wall_ext'
    | 'wall_int'
    | 'wall_new'
    | 'slab'
    | 'glass'
    | 'door_leaf'
    | 'stair'
    | 'roof'
    | 'column';
  floorId: 'eg' | 'og' | 'roof';
  roomId?: string;
  wallId?: string;
  openingId?: string;
}

export interface CompiledHouse3DModel {
  triangles: MeshTriangle[];
  boundsMin: Vec3;
  boundsMax: Vec3;
  vertexCount: number;
  triangleCount: number;
}

export const HOUSE_OUTER_WIDTH_M = 11.9;
export const HOUSE_OUTER_DEPTH_M = 16.9;
export const EG_CLEAR_HEIGHT_M = 3.0;
export const EG_SLAB_THICKNESS_M = 0.35;
export const OG_ELEVATION_M = 3.35;
export const OG_CLEAR_HEIGHT_M = 2.6;
export const OG_SLAB_THICKNESS_M = 0.3;
export const ROOF_BASE_M = 6.25;
export const ROOF_RIDGE_M = 9.25;

function rectPtsCm(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export const BLUEPRINT_FLOORS: FloorLevel[] = [
  {
    id: 'og',
    name: 'Obergeschoss (OG)',
    subtitle: 'Wohnung (123,4 m² Nutzfläche + 28,2 m² Loggia)',
    elevationMeters: OG_ELEVATION_M,
    gridSizePx: 20,
    scalePxPerMeter: 100,
    sortOrder: 2,
  },
  {
    id: 'eg',
    name: 'Erdgeschoss (EG)',
    subtitle: 'Verkaufsraum, Backstube, Lager, Zimmer & Stiegenhaus',
    elevationMeters: 0.0,
    gridSizePx: 20,
    scalePxPerMeter: 100,
    sortOrder: 1,
  },
];

/**
 * Single-Wall Architectural Graph:
 * Every exterior and interior shared wall is defined ONCE along its centerline.
 * Zero duplicate parallel walls.
 */
export const BLUEPRINT_WALLS: CustomWallSegment[] = [
  // =========================================================================
  // OBERGESCHOSS (OG) — 14 Single Structural & Partition Walls
  // =========================================================================
  {
    id: 'og-w-north-parapet',
    floorId: 'og',
    x1: 0,
    y1: 12,
    x2: 1190,
    y2: 12,
    thicknessCm: 25,
    heightM: 1.05,
    material: 'existing',
    label: 'Loggia Brüstung Nord',
  },
  {
    id: 'og-w-west',
    floorId: 'og',
    x1: 19,
    y1: 0,
    x2: 19,
    y2: 1690,
    thicknessCm: 38,
    heightM: 2.6,
    material: 'existing',
    label: 'Außenwand West OG',
  },
  {
    id: 'og-w-east',
    floorId: 'og',
    x1: 1171,
    y1: 0,
    x2: 1171,
    y2: 1690,
    thicknessCm: 38,
    heightM: 2.6,
    material: 'existing',
    label: 'Außenwand Ost OG',
  },
  {
    id: 'og-w-south',
    floorId: 'og',
    x1: 0,
    y1: 1671,
    x2: 1190,
    y2: 1671,
    thicknessCm: 38,
    heightM: 2.6,
    material: 'existing',
    label: 'Straßenfassade Süd OG',
  },
  {
    id: 'og-w-loggia',
    floorId: 'og',
    x1: 19,
    y1: 285,
    x2: 1171,
    y2: 285,
    thicknessCm: 25,
    heightM: 2.6,
    material: 'new',
    label: 'Loggiawand Nord',
  },
  {
    id: 'og-w-north-spine',
    floorId: 'og',
    x1: 19,
    y1: 710,
    x2: 1171,
    y2: 710,
    thicknessCm: 25,
    heightM: 2.6,
    material: 'new',
    label: 'Mitteltragwand Nord OG',
  },
  {
    id: 'og-w-south-spine',
    floorId: 'og',
    x1: 19,
    y1: 1075,
    x2: 1171,
    y2: 1075,
    thicknessCm: 25,
    heightM: 2.6,
    material: 'new',
    label: 'Mitteltragwand Süd OG',
  },
  {
    id: 'og-w-z1-z2',
    floorId: 'og',
    x1: 370,
    y1: 285,
    x2: 370,
    y2: 710,
    thicknessCm: 10,
    heightM: 2.6,
    material: 'partition',
    label: 'Trennwand Zimmer 1 / 2',
  },
  {
    id: 'og-w-z2-z3',
    floorId: 'og',
    x1: 745,
    y1: 285,
    x2: 745,
    y2: 710,
    thicknessCm: 10,
    heightM: 2.6,
    material: 'partition',
    label: 'Trennwand Zimmer 2 / 3',
  },
  {
    id: 'og-w-wc-bad',
    floorId: 'og',
    x1: 19,
    y1: 825,
    x2: 250,
    y2: 825,
    thicknessCm: 10,
    heightM: 2.6,
    material: 'partition',
    label: 'Trennwand WC / Bad',
  },
  {
    id: 'og-w-bad-diele',
    floorId: 'og',
    x1: 250,
    y1: 710,
    x2: 250,
    y2: 1075,
    thicknessCm: 12,
    heightM: 2.6,
    material: 'partition',
    label: 'Wand Bad & WC / Diele',
  },
  {
    id: 'og-w-diele-vorraum',
    floorId: 'og',
    x1: 714,
    y1: 710,
    x2: 714,
    y2: 1075,
    thicknessCm: 12,
    heightM: 2.6,
    material: 'new',
    label: 'Wand Diele / Vorraum',
  },
  {
    id: 'og-w-wohnz-kueche',
    floorId: 'og',
    x1: 564,
    y1: 1075,
    x2: 564,
    y2: 1671,
    thicknessCm: 12,
    heightM: 2.6,
    material: 'new',
    label: 'Wand Wohnzimmer / Küche',
  },
  {
    id: 'og-w-kueche-z4',
    floorId: 'og',
    x1: 861,
    y1: 1075,
    x2: 861,
    y2: 1671,
    thicknessCm: 12,
    heightM: 2.6,
    material: 'new',
    label: 'Wand Küche / Zimmer 4',
  },

  // =========================================================================
  // ERDGESCHOSS (EG) — 11 Single Structural & Partition Walls
  // =========================================================================
  {
    id: 'eg-w-north',
    floorId: 'eg',
    x1: 0,
    y1: 19,
    x2: 1190,
    y2: 19,
    thicknessCm: 38,
    heightM: 3.0,
    material: 'new',
    label: 'Außenwand Nord EG (Hof)',
  },
  {
    id: 'eg-w-west',
    floorId: 'eg',
    x1: 25,
    y1: 0,
    x2: 25,
    y2: 1690,
    thicknessCm: 50,
    heightM: 3.0,
    material: 'existing',
    label: 'Außenwand West EG',
  },
  {
    id: 'eg-w-east',
    floorId: 'eg',
    x1: 1168,
    y1: 0,
    x2: 1168,
    y2: 1690,
    thicknessCm: 44,
    heightM: 3.0,
    material: 'existing',
    label: 'Außenwand Ost EG',
  },
  {
    id: 'eg-w-south',
    floorId: 'eg',
    x1: 0,
    y1: 1671,
    x2: 1190,
    y2: 1671,
    thicknessCm: 38,
    heightM: 3.0,
    material: 'existing',
    label: 'Straßenfassade Süd EG',
  },
  {
    id: 'eg-w-west-spine',
    floorId: 'eg',
    x1: 642,
    y1: 19,
    x2: 642,
    y2: 1671,
    thicknessCm: 38,
    heightM: 3.0,
    material: 'existing',
    label: 'Längstragwand Mitte EG',
  },
  {
    id: 'eg-w-back-mid',
    floorId: 'eg',
    x1: 25,
    y1: 620,
    x2: 642,
    y2: 620,
    thicknessCm: 38,
    heightM: 3.0,
    material: 'new',
    label: 'Wand Backstube / Mittelraum (Unterzug)',
  },
  {
    id: 'eg-w-mid-verkauf',
    floorId: 'eg',
    x1: 25,
    y1: 1020,
    x2: 642,
    y2: 1020,
    thicknessCm: 45,
    heightM: 3.0,
    material: 'existing',
    label: 'Tragwand Mittelraum / Verkaufsraum',
  },
  {
    id: 'eg-w-gang-zimmer',
    floorId: 'eg',
    x1: 854,
    y1: 19,
    x2: 854,
    y2: 710,
    thicknessCm: 35,
    heightM: 3.0,
    material: 'existing',
    label: 'Wand Hofgang / Zimmer EG',
  },
  {
    id: 'eg-w-zimmer-diele',
    floorId: 'eg',
    x1: 642,
    y1: 710,
    x2: 1168,
    y2: 710,
    thicknessCm: 35,
    heightM: 3.0,
    material: 'existing',
    label: 'Wand Zimmer / Diele EG',
  },
  {
    id: 'eg-w-diele-lager',
    floorId: 'eg',
    x1: 642,
    y1: 1236,
    x2: 1168,
    y2: 1236,
    thicknessCm: 25,
    heightM: 3.0,
    material: 'existing',
    label: 'Wand Diele / Lager & Vorraum',
  },
  {
    id: 'eg-w-lager-vorraum',
    floorId: 'eg',
    x1: 954,
    y1: 1236,
    x2: 954,
    y2: 1671,
    thicknessCm: 12,
    heightM: 3.0,
    material: 'partition',
    label: 'Trennwand Lager / Vorraum',
  },
];

export const BLUEPRINT_ROOMS: FloorRoom[] = [
  // OBERGESCHOSS (Seamless non-overlapping room slabs aligned to wall centerlines)
  {
    id: 'og-loggia',
    floorId: 'og',
    name: 'Loggia',
    zoneCode: 'OG-LOG',
    x: 19,
    y: 12,
    width: 1152,
    height: 273,
    points: rectPtsCm(19, 12, 1152, 273),
    wallThickness: 25,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Überdachte Loggia Gartenseite · 11,40 × 2,47 m (28,16 m²)',
    sortOrder: 1,
    metadata: {
      blueprintName: 'LOGGIA',
      labeledAreaM2: 28.16,
      measuredWidthM: 11.4,
      measuredDepthM: 2.47,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-zimmer-nw',
    floorId: 'og',
    name: 'Zimmer 1 (Büro West)',
    zoneCode: 'OG-Z1',
    x: 19,
    y: 285,
    width: 351,
    height: 425,
    points: rectPtsCm(19, 285, 351, 425),
    wallThickness: 25,
    tempEntityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
    humidityEntityId: 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
    notes: 'Planmaß 3,30 × 4,00 m · Planfläche 13,20 m²',
    sortOrder: 2,
    metadata: {
      blueprintName: 'ZIMMER 1',
      labeledAreaM2: 13.2,
      measuredWidthM: 3.3,
      measuredDepthM: 4.0,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-zimmer-nm',
    floorId: 'og',
    name: 'Zimmer 2 (Garten Mitte)',
    zoneCode: 'OG-Z2',
    x: 370,
    y: 285,
    width: 375,
    height: 425,
    points: rectPtsCm(370, 285, 375, 425),
    wallThickness: 10,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 3,60 × 4,00 m · Planfläche 14,40 m²',
    sortOrder: 3,
    metadata: {
      blueprintName: 'ZIMMER 2',
      labeledAreaM2: 14.4,
      measuredWidthM: 3.6,
      measuredDepthM: 4.0,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-zimmer-ne',
    floorId: 'og',
    name: 'Zimmer 3 (Garten Ost)',
    zoneCode: 'OG-Z3',
    x: 745,
    y: 285,
    width: 426,
    height: 425,
    points: rectPtsCm(745, 285, 426, 425),
    wallThickness: 25,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 4,16 × 4,00 m · Planfläche 16,60 m²',
    sortOrder: 4,
    metadata: {
      blueprintName: 'ZIMMER 3',
      labeledAreaM2: 16.6,
      measuredWidthM: 4.16,
      measuredDepthM: 4.0,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-wc',
    floorId: 'og',
    name: 'WC',
    zoneCode: 'OG-WC',
    x: 19,
    y: 710,
    width: 231,
    height: 115,
    points: rectPtsCm(19, 710, 231, 115),
    wallThickness: 10,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,10 × 1,00 m · Planfläche 2,10 m²',
    sortOrder: 5,
    metadata: {
      blueprintName: 'WC',
      labeledAreaM2: 2.1,
      measuredWidthM: 2.1,
      measuredDepthM: 1.0,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-bad',
    floorId: 'og',
    name: 'Bad',
    zoneCode: 'OG-BAD',
    x: 19,
    y: 825,
    width: 231,
    height: 250,
    points: rectPtsCm(19, 825, 231, 250),
    wallThickness: 10,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,30 × 2,33 m · Planfläche 4,70 m²',
    sortOrder: 6,
    metadata: {
      blueprintName: 'BAD',
      labeledAreaM2: 4.7,
      measuredWidthM: 2.3,
      measuredDepthM: 2.33,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-diele',
    floorId: 'og',
    name: 'Diele',
    zoneCode: 'OG-DIE',
    x: 250,
    y: 710,
    width: 464,
    height: 365,
    points: rectPtsCm(250, 710, 464, 365),
    wallThickness: 12,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Zentrale Diele OG · Breite 4,50 m · Planfläche 10,80 m²',
    sortOrder: 7,
    metadata: {
      blueprintName: 'DIELE',
      labeledAreaM2: 10.8,
      measuredWidthM: 4.5,
      measuredDepthM: 3.4,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-vorraum',
    floorId: 'og',
    name: 'Vorraum & Stiegenhaus OG',
    zoneCode: 'OG-VOR',
    x: 714,
    y: 710,
    width: 457,
    height: 365,
    points: rectPtsCm(714, 710, 457, 365),
    wallThickness: 25,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Vorraum & Stiegenaufgang · Breite 4,45 m',
    sortOrder: 8,
    metadata: {
      blueprintName: 'VORRAUM',
      labeledAreaM2: 15.1,
      measuredWidthM: 4.45,
      measuredDepthM: 3.4,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-wohnzimmer',
    floorId: 'og',
    name: 'Wohnzimmer',
    zoneCode: 'OG-WOH',
    x: 19,
    y: 1075,
    width: 545,
    height: 596,
    points: rectPtsCm(19, 1075, 545, 596),
    wallThickness: 38,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 5,20 × 5,65 m · Planfläche 29,40 m²',
    sortOrder: 9,
    metadata: {
      blueprintName: 'WOHNZ.',
      labeledAreaM2: 29.4,
      measuredWidthM: 5.2,
      measuredDepthM: 5.65,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-kueche',
    floorId: 'og',
    name: 'Küche',
    zoneCode: 'OG-KUE',
    x: 564,
    y: 1075,
    width: 297,
    height: 596,
    points: rectPtsCm(564, 1075, 297, 596),
    wallThickness: 12,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,85 × 5,65 m · Planfläche 16,10 m²',
    sortOrder: 10,
    metadata: {
      blueprintName: 'KÜCHE',
      labeledAreaM2: 16.1,
      measuredWidthM: 2.85,
      measuredDepthM: 5.65,
      clearHeightM: 2.6,
    },
  },
  {
    id: 'og-zimmer-se',
    floorId: 'og',
    name: 'Zimmer 4 (Straße Ost)',
    zoneCode: 'OG-Z4',
    x: 861,
    y: 1075,
    width: 310,
    height: 596,
    points: rectPtsCm(861, 1075, 310, 596),
    wallThickness: 38,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,95 × 5,65 m · Planfläche 16,20 m²',
    sortOrder: 11,
    metadata: {
      blueprintName: 'ZIMMER 4',
      labeledAreaM2: 16.2,
      measuredWidthM: 2.95,
      measuredDepthM: 5.65,
      clearHeightM: 2.6,
    },
  },

  // ERDGESCHOSS (Seamless non-overlapping room slabs)
  {
    id: 'eg-backstube',
    floorId: 'eg',
    name: 'Backstube',
    zoneCode: 'EG-BACK',
    x: 25,
    y: 19,
    width: 617,
    height: 601,
    points: rectPtsCm(25, 19, 617, 601),
    wallThickness: 38,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 5,85 × 5,60 m (32,76 m²)',
    sortOrder: 12,
    metadata: {
      blueprintName: 'BACKST.',
      labeledAreaM2: 32.76,
      measuredWidthM: 5.85,
      measuredDepthM: 5.6,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-hofgang',
    floorId: 'eg',
    name: 'Hofdurchgang',
    zoneCode: 'EG-GANG',
    x: 642,
    y: 19,
    width: 212,
    height: 691,
    points: rectPtsCm(642, 19, 212, 691),
    wallThickness: 35,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Durchgang Hof / Garten · Breite 1,76 m',
    sortOrder: 13,
    metadata: {
      blueprintName: 'GANG',
      labeledAreaM2: 10.56,
      measuredWidthM: 1.76,
      measuredDepthM: 6.0,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-zimmer-ne',
    floorId: 'eg',
    name: 'Zimmer (Hof Ost)',
    zoneCode: 'EG-ZIM',
    x: 854,
    y: 19,
    width: 314,
    height: 691,
    points: rectPtsCm(854, 19, 314, 691),
    wallThickness: 35,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,84 × 7,00 m (19,88 m²)',
    sortOrder: 14,
    metadata: {
      blueprintName: 'ZIMMER EG',
      labeledAreaM2: 19.88,
      measuredWidthM: 2.84,
      measuredDepthM: 7.0,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-mittelraum',
    floorId: 'eg',
    name: 'Vorbereitungsraum (Mitte)',
    zoneCode: 'EG-MIT',
    x: 25,
    y: 620,
    width: 617,
    height: 400,
    points: rectPtsCm(25, 620, 617, 400),
    wallThickness: 45,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 5,78 × 3,46 m (20,00 m²)',
    sortOrder: 15,
    metadata: {
      blueprintName: 'MITTELRAUM',
      labeledAreaM2: 20.0,
      measuredWidthM: 5.78,
      measuredDepthM: 3.46,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-diele',
    floorId: 'eg',
    name: 'Diele & Stiegenhaus EG',
    zoneCode: 'EG-DIE',
    x: 642,
    y: 710,
    width: 526,
    height: 526,
    points: rectPtsCm(642, 710, 526, 526),
    wallThickness: 35,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Zentrale Diele mit Hauptstiege ins OG',
    sortOrder: 16,
    metadata: {
      blueprintName: 'DIELE EG',
      labeledAreaM2: 27.52,
      measuredWidthM: 4.94,
      measuredDepthM: 5.57,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-verkaufsraum',
    floorId: 'eg',
    name: 'Verkaufsraum',
    zoneCode: 'EG-VERK',
    x: 25,
    y: 1020,
    width: 617,
    height: 651,
    points: rectPtsCm(25, 1020, 617, 651),
    wallThickness: 50,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 5,53 × 6,38 m (35,28 m²)',
    sortOrder: 17,
    metadata: {
      blueprintName: 'VERKAUFSR.',
      labeledAreaM2: 35.28,
      measuredWidthM: 5.53,
      measuredDepthM: 6.38,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-lager',
    floorId: 'eg',
    name: 'Lager',
    zoneCode: 'EG-LAG',
    x: 642,
    y: 1236,
    width: 312,
    height: 435,
    points: rectPtsCm(642, 1236, 312, 435),
    wallThickness: 25,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Planmaß 2,10 × 4,10 m (8,61 m²)',
    sortOrder: 18,
    metadata: {
      blueprintName: 'LAGER',
      labeledAreaM2: 8.61,
      measuredWidthM: 2.1,
      measuredDepthM: 4.1,
      clearHeightM: 3.0,
    },
  },
  {
    id: 'eg-vorraum',
    floorId: 'eg',
    name: 'Vorraum (Hauseingang)',
    zoneCode: 'EG-VOR',
    x: 954,
    y: 1236,
    width: 214,
    height: 435,
    points: rectPtsCm(954, 1236, 214, 435),
    wallThickness: 44,
    tempEntityId: '',
    humidityEntityId: '',
    notes: 'Straßenseitiger Hauseingang · Breite 1,70 m',
    sortOrder: 19,
    metadata: {
      blueprintName: 'VORR.',
      labeledAreaM2: 6.97,
      measuredWidthM: 1.7,
      measuredDepthM: 4.1,
      clearHeightM: 3.0,
    },
  },
];

export const BLUEPRINT_CONNECTORS: FloorConnector[] = [
  {
    id: 'conn-hauptstiege',
    label: 'Hauptstiege (EG ↔ OG · 16 Stg.)',
    kind: 'stairs',
    fromFloorId: 'eg',
    toFloorId: 'og',
    x: 845,
    y: 735,
    width: 310,
    height: 295,
    rotationDeg: 0,
    notes: 'Viertelgewendelte Haupttreppe von Diele EG in den Vorraum OG',
  },
];

/**
 * Clean openings positioned directly on the single shared walls (`BLUEPRINT_WALLS`).
 */
export const BLUEPRINT_OPENINGS: FloorOpening[] = [
  // OG Loggia doors on `og-w-loggia` (y = 285)
  {
    id: 'og-door-loggia-1',
    floorId: 'og',
    roomId: 'og-zimmer-nw',
    kind: 'door',
    wall: 'top',
    x: 190,
    y: 285,
    length: 100,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Loggiatür 100/210',
    contactEntityId: '',
    metadata: { wallId: 'og-w-loggia', heightCm: 210, sillCm: 0 },
  },
  {
    id: 'og-door-loggia-2',
    floorId: 'og',
    roomId: 'og-zimmer-nm',
    kind: 'door',
    wall: 'top',
    x: 555,
    y: 285,
    length: 100,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Loggiatür 100/210',
    contactEntityId: '',
    metadata: { wallId: 'og-w-loggia', heightCm: 210, sillCm: 0 },
  },
  {
    id: 'og-door-loggia-3',
    floorId: 'og',
    roomId: 'og-zimmer-ne',
    kind: 'door',
    wall: 'top',
    x: 955,
    y: 285,
    length: 100,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Loggiatür 100/210',
    contactEntityId: '',
    metadata: { wallId: 'og-w-loggia', heightCm: 210, sillCm: 0 },
  },
  // OG Bedroom doors on `og-w-north-spine` (y = 710)
  {
    id: 'og-door-z1-diele',
    floorId: 'og',
    roomId: 'og-zimmer-nw',
    kind: 'door',
    wall: 'bottom',
    x: 310,
    y: 710,
    length: 85,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Zimmertür 1 (85/194)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-north-spine', heightCm: 194, sillCm: 0 },
  },
  {
    id: 'og-door-z2-diele',
    floorId: 'og',
    roomId: 'og-zimmer-nm',
    kind: 'door',
    wall: 'bottom',
    x: 455,
    y: 710,
    length: 85,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_right',
    label: 'Zimmertür 2 (85/194)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-north-spine', heightCm: 194, sillCm: 0 },
  },
  {
    id: 'og-door-z3-vorraum',
    floorId: 'og',
    roomId: 'og-zimmer-ne',
    kind: 'door',
    wall: 'bottom',
    x: 825,
    y: 710,
    length: 85,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_right',
    label: 'Zimmertür 3 (85/194)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-north-spine', heightCm: 194, sillCm: 0 },
  },
  // OG WC & Bad doors on `og-w-bad-diele` (x = 250)
  {
    id: 'og-door-wc',
    floorId: 'og',
    roomId: 'og-wc',
    kind: 'door',
    wall: 'right',
    x: 250,
    y: 768,
    length: 70,
    orientation: 'vertical',
    angleDeg: 90,
    swingDir: 'out_left',
    label: 'WC-Tür 70/194',
    contactEntityId: '',
    metadata: { wallId: 'og-w-bad-diele', heightCm: 194, sillCm: 0 },
  },
  {
    id: 'og-door-bad',
    floorId: 'og',
    roomId: 'og-bad',
    kind: 'door',
    wall: 'right',
    x: 250,
    y: 935,
    length: 70,
    orientation: 'vertical',
    angleDeg: 90,
    swingDir: 'in_left',
    label: 'Badtür 70/194',
    contactEntityId: '',
    metadata: { wallId: 'og-w-bad-diele', heightCm: 194, sillCm: 0 },
  },
  // OG Vorraum -> Diele door on `og-w-diele-vorraum` (x = 714)
  {
    id: 'og-door-vorraum-diele',
    floorId: 'og',
    roomId: 'og-diele',
    kind: 'door',
    wall: 'right',
    x: 714,
    y: 810,
    length: 90,
    orientation: 'vertical',
    angleDeg: 90,
    swingDir: 'in_right',
    label: 'Diele Zwischentür 90/194',
    contactEntityId: '',
    metadata: { wallId: 'og-w-diele-vorraum', heightCm: 194, sillCm: 0 },
  },
  // OG Wohnzimmer & Küche doors on `og-w-south-spine` (y = 1075)
  {
    id: 'og-door-wohnz',
    floorId: 'og',
    roomId: 'og-wohnzimmer',
    kind: 'door',
    wall: 'top',
    x: 425,
    y: 1075,
    length: 85,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Wohnzimmertür 85/194',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south-spine', heightCm: 194, sillCm: 0 },
  },
  {
    id: 'og-door-kueche',
    floorId: 'og',
    roomId: 'og-kueche',
    kind: 'door',
    wall: 'top',
    x: 645,
    y: 1075,
    length: 85,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_right',
    label: 'Küchentür 85/194',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south-spine', heightCm: 194, sillCm: 0 },
  },
  // OG Zimmer 4 door on `og-w-kueche-z4` (x = 861)
  {
    id: 'og-door-z4',
    floorId: 'og',
    roomId: 'og-zimmer-se',
    kind: 'door',
    wall: 'left',
    x: 861,
    y: 1185,
    length: 85,
    orientation: 'vertical',
    angleDeg: 90,
    swingDir: 'in_right',
    label: 'Zimmertür 4 (85/194)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-kueche-z4', heightCm: 194, sillCm: 0 },
  },
  // OG 4 Street Windows on `og-w-south` (y = 1671)
  {
    id: 'og-win-street-1',
    floorId: 'og',
    roomId: 'og-wohnzimmer',
    kind: 'window',
    wall: 'bottom',
    x: 210,
    y: 1671,
    length: 120,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Straßenfenster 1 (120/140)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south', heightCm: 140, sillCm: 90 },
  },
  {
    id: 'og-win-street-2',
    floorId: 'og',
    roomId: 'og-wohnzimmer',
    kind: 'window',
    wall: 'bottom',
    x: 480,
    y: 1671,
    length: 120,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Straßenfenster 2 (120/140)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south', heightCm: 140, sillCm: 90 },
  },
  {
    id: 'og-win-street-3',
    floorId: 'og',
    roomId: 'og-kueche',
    kind: 'window',
    wall: 'bottom',
    x: 750,
    y: 1671,
    length: 120,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Küchenfenster (120/140)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south', heightCm: 140, sillCm: 90 },
  },
  {
    id: 'og-win-street-4',
    floorId: 'og',
    roomId: 'og-zimmer-se',
    kind: 'window',
    wall: 'bottom',
    x: 1020,
    y: 1671,
    length: 120,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Straßenfenster 4 (120/140)',
    contactEntityId: '',
    metadata: { wallId: 'og-w-south', heightCm: 140, sillCm: 90 },
  },

  // =========================================================================
  // ERDGESCHOSS (EG) OPENINGS
  // =========================================================================
  {
    id: 'eg-portal-verkauf',
    floorId: 'eg',
    roomId: 'eg-verkaufsraum',
    kind: 'sliding_door',
    wall: 'bottom',
    x: 210,
    y: 1671,
    length: 210,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Geschäftsportal 210 cm',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-south', heightCm: 220, sillCm: 0 },
  },
  {
    id: 'eg-win-verkauf',
    floorId: 'eg',
    roomId: 'eg-verkaufsraum',
    kind: 'window',
    wall: 'bottom',
    x: 480,
    y: 1671,
    length: 150,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Schaufenster 150/150',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-south', heightCm: 150, sillCm: 90 },
  },
  {
    id: 'eg-win-lager',
    floorId: 'eg',
    roomId: 'eg-lager',
    kind: 'window',
    wall: 'bottom',
    x: 780,
    y: 1671,
    length: 150,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Lagerfenster 150/150',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-south', heightCm: 150, sillCm: 90 },
  },
  {
    id: 'eg-door-haupteingang',
    floorId: 'eg',
    roomId: 'eg-vorraum',
    kind: 'door',
    wall: 'bottom',
    x: 1055,
    y: 1671,
    length: 115,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_right',
    label: 'Hauseingangstür 115/210',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-south', heightCm: 210, sillCm: 0 },
  },
  {
    id: 'eg-win-backstube-nord',
    floorId: 'eg',
    roomId: 'eg-backstube',
    kind: 'window',
    wall: 'top',
    x: 310,
    y: 19,
    length: 220,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Fenster Backstube Nord',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-north', heightCm: 150, sillCm: 90 },
  },
  {
    id: 'eg-win-zimmer-nord',
    floorId: 'eg',
    roomId: 'eg-zimmer-ne',
    kind: 'window',
    wall: 'top',
    x: 1010,
    y: 19,
    length: 130,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Fenster Zimmer Nord',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-north', heightCm: 140, sillCm: 90 },
  },
  {
    id: 'eg-passage-backstube',
    floorId: 'eg',
    roomId: 'eg-backstube',
    kind: 'passage',
    wall: 'bottom',
    x: 330,
    y: 620,
    length: 380,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Wanddurchbruch / Unterzug',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-back-mid', heightCm: 230, sillCm: 0 },
  },
  {
    id: 'eg-door-mid-verkauf',
    floorId: 'eg',
    roomId: 'eg-verkaufsraum',
    kind: 'door',
    wall: 'top',
    x: 465,
    y: 1020,
    length: 90,
    orientation: 'horizontal',
    angleDeg: 0,
    swingDir: 'in_left',
    label: 'Tür Verkauf ↔ Mittelraum',
    contactEntityId: '',
    metadata: { wallId: 'eg-w-mid-verkauf', heightCm: 200, sillCm: 0 },
  },
];

export const BLUEPRINT_DEVICES: FloorDevice[] = [
  {
    id: 'dev-buro-main-light',
    floorId: 'og',
    roomId: 'og-zimmer-nw',
    label: 'Büro Großes Licht',
    category: 'light',
    x: 196,
    y: 495,
    sourceType: 'ha_entity',
    primaryEntityId: 'light.buro_og_grosses_licht',
    secondaryEntityId: 'sensor.links_power',
    targetAppId: 'smart-canvas',
    notes: 'Hauptbeleuchtung Büro OG (Shelly)',
  },
  {
    id: 'dev-buro-climate',
    floorId: 'og',
    roomId: 'og-zimmer-nw',
    label: 'Raumklima H&T Gen3',
    category: 'climate',
    x: 110,
    y: 380,
    sourceType: 'ha_entity',
    primaryEntityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
    secondaryEntityId: 'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
    targetAppId: 'smart-canvas',
    notes: 'Shelly H&T Gen3 Sensor',
  },
  {
    id: 'dev-vz-main-light',
    floorId: 'og',
    roomId: 'og-diele',
    label: 'Diele Großes Licht',
    category: 'light',
    x: 485,
    y: 890,
    sourceType: 'ha_entity',
    primaryEntityId: 'switch.vorzimmer_og_grosses_licht',
    secondaryEntityId: '',
    targetAppId: 'smart-canvas',
    notes: 'Deckenlicht Diele OG',
  },
  {
    id: 'dev-gaeste-light-1',
    floorId: 'og',
    roomId: 'og-zimmer-ne',
    label: 'Zimmer 3 Licht',
    category: 'light',
    x: 955,
    y: 495,
    sourceType: 'ha_entity',
    primaryEntityId: 'switch.gaestezimmer_schalter_rechts',
    secondaryEntityId: 'sensor.shellyplus2pm_c049ef8a3a78_switch_0_power',
    targetAppId: 'smart-canvas',
    notes: 'Shelly Plus 2PM',
  },
  {
    id: 'dev-bad-washer',
    floorId: 'og',
    roomId: 'og-bad',
    label: 'Waschmaschine Shelly 1PM',
    category: 'appliance',
    x: 130,
    y: 940,
    sourceType: 'ha_entity',
    primaryEntityId: 'switch.shelly1pmminig4_7c2c676dc6fc',
    secondaryEntityId: 'sensor.shelly1pmminig4_7c2c676dc6fc_leistung',
    targetAppId: 'smart-canvas',
    notes: 'Shelly 1PM Mini Gen4',
  },
  {
    id: 'dev-wk-boden',
    floorId: 'og',
    roomId: 'og-wohnzimmer',
    label: 'Wohnzimmer Licht',
    category: 'light',
    x: 295,
    y: 1365,
    sourceType: 'ha_entity',
    primaryEntityId: 'switch.wohnkueche_bodenbeleuchtung_boden',
    secondaryEntityId: 'sensor.shelly_plus_2pm_a_switch_0_power',
    targetAppId: 'smart-canvas',
    notes: 'Hauptbeleuchtung Wohnzimmer',
  },
  {
    id: 'dev-wk-fensterbank',
    floorId: 'og',
    roomId: 'og-kueche',
    label: 'Küchenlicht',
    category: 'light',
    x: 712,
    y: 1365,
    sourceType: 'ha_entity',
    primaryEntityId: 'switch.wohnkueche_fensterbank_licht',
    secondaryEntityId: 'sensor.bodenbeleuchtung_power',
    targetAppId: 'smart-canvas',
    notes: 'Beleuchtung Küche',
  },
];

export const BLUEPRINT_WIRES: FloorWireSegment[] = [
  {
    id: 'wire-og-uv-buro',
    floorId: 'og',
    kind: 'power_230v',
    x1: 714,
    y1: 890,
    x2: 196,
    y2: 495,
    elevationM: 2.4,
    label: 'NYM-J 3x1,5 · UV-OG → Büro Licht',
    toDeviceId: 'dev-buro-main-light',
  },
  {
    id: 'wire-og-uv-diele',
    floorId: 'og',
    kind: 'power_230v',
    x1: 714,
    y1: 890,
    x2: 485,
    y2: 890,
    elevationM: 2.4,
    label: 'NYM-J 3x1,5 · UV-OG → Diele Licht',
    toDeviceId: 'dev-vz-main-light',
  },
  {
    id: 'wire-og-uv-wohnz',
    floorId: 'og',
    kind: 'power_230v',
    x1: 714,
    y1: 890,
    x2: 295,
    y2: 1365,
    elevationM: 2.4,
    label: 'NYM-J 3x1,5 · UV-OG → Wohnzimmer',
    toDeviceId: 'dev-wk-boden',
  },
  {
    id: 'wire-lan-backbone',
    floorId: 'og',
    kind: 'network_cat7',
    x1: 840,
    y1: 890,
    x2: 196,
    y2: 380,
    elevationM: 0.3,
    label: 'CAT7 Duplex · Steigschacht → Büro',
  },
];

export const BLUEPRINT_LABELS: FloorLabelItem[] = [
  {
    id: 'lbl-og-total',
    floorId: 'og',
    x: 485,
    y: 820,
    text: '123,4 m²',
    subtext: 'Gesamtnutzfläche OG',
    color: '#10b981',
  },
];

export const PLAUSIBILITY_CHECKS: PlausibilityCheckItem[] = [
  {
    id: 'chk-og-depth',
    category: 'chain_y',
    title: 'Längskette Obergeschoss (Nord → Süd)',
    formula: '0,25 + 2,47 (Loggia) + 0,25 + 4,00 (Zimmer) + 0,25 + 3,40 (Bad/WC) + 0,25 + 5,65 (Wohnz.) + 0,38',
    expected: '16,90 m',
    measured: '16,90 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-eg-depth',
    category: 'chain_y',
    title: 'Längskette Erdgeschoss (Nord → Süd)',
    formula: '0,38 + 5,60 (Backstube) + 0,45 + 3,46 (Mittelraum) + 0,65 + 5,98 (Verkaufsr.) + 0,38',
    expected: '16,90 m',
    measured: '16,90 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-street-width',
    category: 'chain_x',
    title: 'Querkette Straßenfassade (EG & OG)',
    formula: '2,10 + 2,70 + 2,70 + 2,70 + 1,70 (Fensterachsen)',
    expected: '11,90 m',
    measured: '11,90 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-loggia-width',
    category: 'chain_x',
    title: 'Querkette Loggia & Stützenraster (Nord)',
    formula: '0,25 (Wand) + 3,80 + 3,80 + 3,80 (3 Felder) + 0,25 (Wand)',
    expected: '11,90 m',
    measured: '11,90 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-eg-north-width',
    category: 'chain_x',
    title: 'Querkette Erdgeschoss Hofseite (Nord)',
    formula: '2,90 + 3,70 (Backstube 6,60) + 1,76 (Gang) + 1,77 + 1,77 (Zimmer 3,54)',
    expected: '11,90 m',
    measured: '11,90 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-og-area-sum',
    category: 'area',
    title: 'Wohnflächen-Kontrollsumme Obergeschoss',
    formula: '13,20 + 14,40 + 16,60 + 2,10 + 4,70 + 10,80 + 29,40 + 16,10 + 16,20',
    expected: '123,40 m² (Plankote)',
    measured: '123,50 m²',
    deviationCm: 1,
    passed: true,
  },
  {
    id: 'chk-section-elevation',
    category: 'elevation',
    title: 'Höhenkette Schnitt & Straßenansicht',
    formula: 'EG 3,00 m + Decke 0,35 m + OG 2,60 m + Decke 0,30 m + Dachstuhl 3,00 m (73° Welleternit)',
    expected: '9,25 m Firsthöhe',
    measured: '9,25 m',
    deviationCm: 0,
    passed: true,
  },
  {
    id: 'chk-structural-alignment',
    category: 'structural',
    title: 'Einwand-Topologie (Keine Doppelwände)',
    formula: '14 Einzelwände OG + 11 Einzelwände EG · Jede Öffnung exakt 1× geschnitten',
    expected: '25 Einzelwände',
    measured: '25 Einzelwände (0 Duplikate)',
    deviationCm: 0,
    passed: true,
  },
];

// ============================================================================
// SINGLE-WALL 3D MESH COMPILER (Zero double walls, 1-to-1 opening assignment)
// ============================================================================

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function pushQuad(
  out: MeshTriangle[],
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  color: string,
  material: MeshTriangle['material'],
  floorId: MeshTriangle['floorId'],
  roomId?: string,
  wallId?: string,
  openingId?: string
) {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  out.push({ v0: p0, v1: p1, v2: p2, normal: n, color, material, floorId, roomId, wallId, openingId });
  out.push({ v0: p0, v1: p2, v2: p3, normal: n, color, material, floorId, roomId, wallId, openingId });
}

function pushBox(
  out: MeshTriangle[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: string,
  material: MeshTriangle['material'],
  floorId: MeshTriangle['floorId'],
  roomId?: string,
  wallId?: string,
  openingId?: string
) {
  const lx = Math.min(x0, x1);
  const hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  const lz = Math.min(z0, z1);
  const hz = Math.max(z0, z1);

  if (hx - lx < 0.005 || hy - ly < 0.005 || hz - lz < 0.005) return;

  const p000 = { x: lx, y: ly, z: lz };
  const p100 = { x: hx, y: ly, z: lz };
  const p110 = { x: hx, y: hy, z: lz };
  const p010 = { x: lx, y: hy, z: lz };
  const p001 = { x: lx, y: ly, z: hz };
  const p101 = { x: hx, y: ly, z: hz };
  const p111 = { x: hx, y: hy, z: hz };
  const p011 = { x: lx, y: hy, z: hz };

  pushQuad(out, p001, p101, p111, p011, color, material, floorId, roomId, wallId, openingId);
  pushQuad(out, p010, p110, p100, p000, color, material, floorId, roomId, wallId, openingId);
  pushQuad(out, p100, p000, p001, p101, color, material, floorId, roomId, wallId, openingId);
  pushQuad(out, p010, p110, p111, p011, color, material, floorId, roomId, wallId, openingId);
  pushQuad(out, p000, p010, p011, p001, color, material, floorId, roomId, wallId, openingId);
  pushQuad(out, p110, p100, p101, p111, color, material, floorId, roomId, wallId, openingId);
}

/**
 * Extrudes a sub-segment [tStart..tEnd] (in meters from wall start) along an arbitrary wall `cw`,
 * from elevation `z0` to `z1`.
 */
function emitWallSpan(
  out: MeshTriangle[],
  cw: CustomWallSegment,
  tStartM: number,
  tEndM: number,
  z0: number,
  z1: number,
  color: string,
  material: MeshTriangle['material'],
  thicknessScale = 1.0,
  openingId?: string
) {
  if (tEndM - tStartM < 0.015 || z1 - z0 < 0.015) return;
  const x1M = cw.x1 / 100;
  const y1M = cw.y1 / 100;
  const x2M = cw.x2 / 100;
  const y2M = cw.y2 / 100;
  const dx = x2M - x1M;
  const dy = y2M - y1M;
  const len = Math.hypot(dx, dy);
  if (len < 0.02) return;

  const ux = dx / len;
  const uy = dy / len;
  const halfT = (Math.max(0.06, cw.thicknessCm / 100) * thicknessScale) / 2;
  const nx = -uy * halfT;
  const ny = ux * halfT;

  const sx = x1M + ux * tStartM;
  const sy = y1M + uy * tStartM;
  const ex = x1M + ux * tEndM;
  const ey = y1M + uy * tEndM;

  const b0 = { x: sx + nx, y: sy + ny, z: z0 };
  const b1 = { x: ex + nx, y: ey + ny, z: z0 };
  const b2 = { x: ex - nx, y: ey - ny, z: z0 };
  const b3 = { x: sx - nx, y: sy - ny, z: z0 };

  const t0 = { x: sx + nx, y: sy + ny, z: z1 };
  const t1 = { x: ex + nx, y: ey + ny, z: z1 };
  const t2 = { x: ex - nx, y: ey - ny, z: z1 };
  const t3 = { x: sx - nx, y: sy - ny, z: z1 };

  pushQuad(out, t0, t1, t2, t3, color, material, cw.floorId, undefined, cw.id, openingId);
  pushQuad(out, b3, b2, b1, b0, color, material, cw.floorId, undefined, cw.id, openingId);
  pushQuad(out, b0, b1, t1, t0, color, material, cw.floorId, undefined, cw.id, openingId);
  pushQuad(out, b1, b2, t2, t1, color, material, cw.floorId, undefined, cw.id, openingId);
  pushQuad(out, b2, b3, t3, t2, color, material, cw.floorId, undefined, cw.id, openingId);
  pushQuad(out, b3, b0, t0, t3, color, material, cw.floorId, undefined, cw.id, openingId);
}

/**
 * Finds the single best matching wall for an opening so no opening is ever cut into two walls.
 */
function assignOpeningsToSingleWall(
  walls: CustomWallSegment[],
  openings: FloorOpening[]
): Map<string, Array<{ op: FloorOpening; tStartM: number; tEndM: number }>> {
  const map = new Map<string, Array<{ op: FloorOpening; tStartM: number; tEndM: number }>>();
  for (const w of walls) map.set(w.id, []);

  for (const op of openings) {
    let bestWall: CustomWallSegment | null = null;
    let bestT = 0;
    let bestDist = 45; // max 45 cm snap distance

    for (const w of walls) {
      if (w.floorId !== op.floorId) continue;

      // Prefer explicit `metadata.wallId` if valid and close
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const lenCm = Math.hypot(dx, dy);
      if (lenCm < 10) continue;

      const proj = ((op.x - w.x1) * dx + (op.y - w.y1) * dy) / (lenCm * lenCm);
      if (proj < -0.05 || proj > 1.05) continue;

      const clampedProj = Math.max(0, Math.min(1, proj));
      const cx = w.x1 + clampedProj * dx;
      const cy = w.y1 + clampedProj * dy;
      const dist = Math.hypot(op.x - cx, op.y - cy);

      const bonus = op.metadata?.wallId === w.id ? -15 : 0;
      if (dist + bonus < bestDist) {
        bestDist = dist + bonus;
        bestWall = w;
        bestT = (clampedProj * lenCm) / 100;
      }
    }

    if (bestWall) {
      const lenM = Math.hypot(bestWall.x2 - bestWall.x1, bestWall.y2 - bestWall.y1) / 100;
      const halfW = Math.max(0.25, op.length / 200);
      const tStartM = Math.max(0.05, bestT - halfW);
      const tEndM = Math.min(lenM - 0.05, bestT + halfW);
      if (tEndM > tStartM + 0.08) {
        map.get(bestWall.id)!.push({ op, tStartM, tEndM });
      }
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.tStartM - b.tStartM);
  }
  return map;
}

export function compileHouse3DModel(options?: {
  rooms?: FloorRoom[];
  openings?: FloorOpening[];
  customWalls?: CustomWallSegment[];
  includeRoof?: boolean;
  wallCutawayRatio?: number;
}): CompiledHouse3DModel {
  const rooms = options?.rooms && options.rooms.length > 0 ? options.rooms : BLUEPRINT_ROOMS;
  const openings = options?.openings || BLUEPRINT_OPENINGS;
  const walls =
    options?.customWalls && options.customWalls.length > 0
      ? options.customWalls
      : BLUEPRINT_WALLS;
  const includeRoof = options?.includeRoof ?? true;
  const cut = Math.max(0.2, Math.min(1.0, options?.wallCutawayRatio ?? 1.0));
  const triangles: MeshTriangle[] = [];

  const ogZ0 = OG_ELEVATION_M;

  // 1. Floor Slabs (EG base slab & OG ceiling slab with staircase cutout)
  pushBox(triangles, 0, 0, -0.25, 11.9, 16.9, 0.0, '#18181b', 'slab', 'eg');
  pushBox(triangles, 0, 0, 3.0, 8.45, 16.9, 3.35, '#27272a', 'slab', 'og');
  pushBox(triangles, 8.45, 0, 3.0, 11.9, 7.1, 3.35, '#27272a', 'slab', 'og');
  pushBox(triangles, 8.45, 10.2, 3.0, 11.9, 16.9, 3.35, '#27272a', 'slab', 'og');

  // 2. Room Floor Tiles (Flat 4cm floor surface per room for clean room picking & labels)
  for (const r of rooms) {
    const floorId = (r.floorId === 'eg' ? 'eg' : 'og') as 'eg' | 'og';
    const zBase = floorId === 'og' ? ogZ0 : 0.0;
    const x0 = r.x / 100;
    const y0 = r.y / 100;
    const x1 = (r.x + r.width) / 100;
    const y1 = (r.y + r.height) / 100;
    const slabCol =
      r.id === 'og-loggia'
        ? '#1e293b'
        : floorId === 'og'
          ? '#1f242d'
          : '#181c24';
    pushBox(triangles, x0, y0, zBase, x1, y1, zBase + 0.04, slabCol, 'slab', floorId, r.id);
  }

  // 3. Single-Wall Graph with 1-to-1 Opening Cutouts (Zero double walls!)
  const wallOpeningsMap = assignOpeningsToSingleWall(walls, openings);

  for (const cw of walls) {
    const zBase = cw.floorId === 'og' ? ogZ0 : 0.0;
    const defaultH = cw.floorId === 'og' ? OG_CLEAR_HEIGHT_M : EG_CLEAR_HEIGHT_M;
    const fullH = cw.heightM || defaultH;
    // Loggia parapet stays 1.05m unless cutaway is lower
    const zTop =
      cw.id === 'og-w-north-parapet'
        ? zBase + Math.min(fullH, defaultH * cut)
        : zBase + fullH * cut;

    const lenM = Math.hypot(cw.x2 - cw.x1, cw.y2 - cw.y1) / 100;
    const col =
      cw.material === 'partition'
        ? '#71717a'
        : cw.floorId === 'og'
          ? '#a1a1aa'
          : '#686873';
    const mat: MeshTriangle['material'] =
      cw.material === 'new'
        ? 'wall_new'
        : cw.material === 'partition'
          ? 'wall_int'
          : 'wall_ext';

    const ops = wallOpeningsMap.get(cw.id) || [];
    let cursor = 0;

    for (const item of ops) {
      const s = Math.max(cursor, item.tStartM);
      const e = item.tEndM;
      if (s > cursor + 0.02) {
        emitWallSpan(triangles, cw, cursor, s, zBase, zTop, col, mat, 1.0);
      }
      if (e > s + 0.02) {
        const op = item.op;
        const sillM =
          op.kind === 'window' ? Number(op.metadata?.sillCm ?? 90) / 100 : 0;
        const heightM =
          Number(op.metadata?.heightCm ?? (op.kind === 'window' ? 140 : 194)) / 100;
        const openBottom = zBase + sillM;
        const openTop = zBase + sillM + heightM;

        // Sill below window
        if (openBottom > zBase + 0.02) {
          emitWallSpan(
            triangles,
            cw,
            s,
            e,
            zBase,
            Math.min(zTop, openBottom),
            col,
            mat,
            1.0,
            op.id
          );
        }
        // Lintel above door/window
        if (zTop > openTop + 0.02) {
          emitWallSpan(
            triangles,
            cw,
            s,
            e,
            Math.max(zBase, openTop),
            zTop,
            col,
            mat,
            1.0,
            op.id
          );
        }
        // Single recessed window glass or door leaf
        const paneBottom = Math.max(zBase, Math.min(zTop, openBottom));
        const paneTop = Math.max(zBase, Math.min(zTop, openTop));
        if (paneTop > paneBottom + 0.05 && op.kind !== 'passage') {
          emitWallSpan(
            triangles,
            cw,
            s,
            e,
            paneBottom,
            paneTop,
            op.kind === 'window' ? '#38bdf8' : '#d97706',
            op.kind === 'window' ? 'glass' : 'door_leaf',
            0.22,
            op.id
          );
        }
        cursor = Math.max(cursor, e);
      }
    }

    if (lenM > cursor + 0.02) {
      emitWallSpan(triangles, cw, cursor, lenM, zBase, zTop, col, mat, 1.0);
    }
  }

  // Loggia structural columns at 3.80 m centers
  const ogTop = ogZ0 + OG_CLEAR_HEIGHT_M * cut;
  pushBox(triangles, 3.95, 0.04, ogZ0, 4.15, 0.22, ogTop, '#e4e4e7', 'column', 'og');
  pushBox(triangles, 7.75, 0.04, ogZ0, 7.95, 0.22, ogTop, '#e4e4e7', 'column', 'og');

  // 4. Quarter-Turn Staircase (16 Steps from Z=0.00 to Z=3.35m)
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const zStep0 = (i / steps) * OG_ELEVATION_M;
    const zStep1 = ((i + 1) / steps) * OG_ELEVATION_M;
    if (i < 10) {
      const yS0 = 10.1 - i * 0.26;
      const yS1 = yS0 - 0.26;
      pushBox(triangles, 10.45, yS1, zStep0, 11.5, yS0, zStep1, '#d4d4d8', 'stair', 'eg');
    } else {
      const k = i - 10;
      const xS0 = 10.45 - k * 0.31;
      const xS1 = xS0 - 0.31;
      pushBox(triangles, xS1, 7.25, zStep0, xS0, 8.25, zStep1, '#e4e4e7', 'stair', 'og');
    }
  }

  // 5. Optional Roof (73° Welleternit Dunkelgrau from Schnitt)
  if (includeRoof) {
    const zEave = ROOF_BASE_M;
    const zRidge = ROOF_RIDGE_M;
    const yRidge = 13.7;
    const rCol = '#3f3f46';

    pushBox(triangles, 0, 0, 5.95, 11.9, 16.9, zEave, '#27272a', 'slab', 'roof');
    pushQuad(
      triangles,
      { x: 0, y: 0, z: zEave },
      { x: 11.9, y: 0, z: zEave },
      { x: 11.9, y: yRidge, z: zRidge },
      { x: 0, y: yRidge, z: zRidge },
      rCol,
      'roof',
      'roof'
    );
    pushQuad(
      triangles,
      { x: 0, y: yRidge, z: zRidge },
      { x: 11.9, y: yRidge, z: zRidge },
      { x: 11.9, y: 16.9, z: zEave },
      { x: 0, y: 16.9, z: zEave },
      '#52525b',
      'roof',
      'roof'
    );
    triangles.push({
      v0: { x: 0, y: 0, z: zEave },
      v1: { x: 0, y: yRidge, z: zRidge },
      v2: { x: 0, y: 16.9, z: zEave },
      normal: { x: -1, y: 0, z: 0 },
      color: '#52525b',
      material: 'roof',
      floorId: 'roof',
    });
    triangles.push({
      v0: { x: 11.9, y: 0, z: zEave },
      v1: { x: 11.9, y: 16.9, z: zEave },
      v2: { x: 11.9, y: yRidge, z: zRidge },
      normal: { x: 1, y: 0, z: 0 },
      color: '#52525b',
      material: 'roof',
      floorId: 'roof',
    });
  }

  return {
    triangles,
    boundsMin: { x: 0, y: 0, z: -0.25 },
    boundsMax: { x: 11.9, y: 16.9, z: includeRoof ? ROOF_RIDGE_M : ogTop },
    vertexCount: triangles.length * 3,
    triangleCount: triangles.length,
  };
}

export function exportHouseWavefrontObj(model?: CompiledHouse3DModel): string {
  const m = model || compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1.0 });
  const lines: string[] = [
    '# Thassi Architectural 3D Reconstruction — Wavefront OBJ',
    '# Blueprint: 11.90 m x 16.90 m (Single-Wall Topology)',
    `# Triangles: ${m.triangleCount}`,
    'o House_1190x1690',
  ];

  let vIdx = 1;
  let currentMat = '';
  for (const tri of m.triangles) {
    if (tri.material !== currentMat) {
      currentMat = tri.material;
      lines.push(`usemtl ${currentMat}`);
    }
    lines.push(
      `v ${tri.v0.x.toFixed(4)} ${tri.v0.z.toFixed(4)} ${tri.v0.y.toFixed(4)}`,
      `v ${tri.v1.x.toFixed(4)} ${tri.v1.z.toFixed(4)} ${tri.v1.y.toFixed(4)}`,
      `v ${tri.v2.x.toFixed(4)} ${tri.v2.z.toFixed(4)} ${tri.v2.y.toFixed(4)}`,
      `vn ${tri.normal.x.toFixed(4)} ${tri.normal.z.toFixed(4)} ${tri.normal.y.toFixed(4)}`,
      `f ${vIdx}//${(vIdx + 2) / 3} ${vIdx + 1}//${(vIdx + 2) / 3} ${vIdx + 2}//${(vIdx + 2) / 3}`
    );
    vIdx += 3;
  }
  return lines.join('\n');
}

export function exportHouseGltfJson(model?: CompiledHouse3DModel): string {
  const m = model || compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1.0 });
  const numVerts = m.triangles.length * 3;
  const floatArray = new Float32Array(numVerts * 6);

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  let offset = 0;
  for (const tri of m.triangles) {
    const verts = [tri.v0, tri.v1, tri.v2];
    for (const v of verts) {
      const gx = v.x;
      const gy = v.z;
      const gz = v.y;
      if (gx < minX) minX = gx;
      if (gy < minY) minY = gy;
      if (gz < minZ) minZ = gz;
      if (gx > maxX) maxX = gx;
      if (gy > maxY) maxY = gy;
      if (gz > maxZ) maxZ = gz;
      floatArray[offset++] = gx;
      floatArray[offset++] = gy;
      floatArray[offset++] = gz;
      floatArray[offset++] = tri.normal.x;
      floatArray[offset++] = tri.normal.z;
      floatArray[offset++] = tri.normal.y;
    }
  }

  const uint8 = new Uint8Array(floatArray.buffer);
  let binaryStr = '';
  for (let i = 0; i < uint8.byteLength; i++) {
    binaryStr += String.fromCharCode(uint8[i]);
  }
  const base64Buf =
    typeof btoa === 'function'
      ? btoa(binaryStr)
      : Buffer.from(uint8).toString('base64');

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Thassi Architectural 3D Engine',
    },
    scene: 0,
    scenes: [{ name: 'House_1190x1690', nodes: [0] }],
    nodes: [{ name: 'HouseMesh', mesh: 0 }],
    meshes: [
      {
        name: 'House_1190x1690_Mesh',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            mode: 4,
          },
        ],
      },
    ],
    buffers: [
      {
        byteLength: uint8.byteLength,
        uri: `data:application/octet-stream;base64,${base64Buf}`,
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: uint8.byteLength,
        byteStride: 24,
        target: 34962,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: numVerts,
        type: 'VEC3',
        min: [Number(minX.toFixed(4)), Number(minY.toFixed(4)), Number(minZ.toFixed(4))],
        max: [Number(maxX.toFixed(4)), Number(maxY.toFixed(4)), Number(maxZ.toFixed(4))],
      },
      {
        bufferView: 0,
        byteOffset: 12,
        componentType: 5126,
        count: numVerts,
        type: 'VEC3',
      },
    ],
  };

  return JSON.stringify(gltf, null, 2);
}
