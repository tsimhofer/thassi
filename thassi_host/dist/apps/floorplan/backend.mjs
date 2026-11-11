import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// packages/sdk/src/actions.ts
import fs2 from "node:fs";
import path2 from "node:path";
import net from "node:net";
import dgram from "node:dgram";
var PcAgentReverseBridgeImpl = class {
  latestStatus = null;
  lastSeenAt = 0;
  latestFrameJpeg = null;
  requestedMonitor = "primary";
  queue = [];
  resolvers = /* @__PURE__ */ new Map();
  ingestSync(body) {
    this.lastSeenAt = Date.now();
    if (body.status && typeof body.status === "object") {
      this.latestStatus = body.status;
    }
    if (body.frameBase64 && typeof body.frameBase64 === "string") {
      this.latestFrameJpeg = Buffer.from(body.frameBase64, "base64");
    }
    const commands = this.queue.splice(0, this.queue.length);
    return {
      requestedMonitor: this.requestedMonitor,
      commands
    };
  }
  resolveCommand(id, result, error) {
    const pending = this.resolvers.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.resolvers.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
  async getStatusOrCall(baseUrl) {
    if (this.latestStatus && Date.now() - this.lastSeenAt < 15e3) {
      return this.latestStatus;
    }
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1200)
      });
      if (res.ok) {
        const snap = await res.json();
        this.latestStatus = snap;
        this.lastSeenAt = Date.now();
        return snap;
      }
    } catch {
    }
    if (this.latestStatus) {
      return this.latestStatus;
    }
    throw new Error("Thassi.PcAgent on DESKTOP-M8TJERB is currently offline or unreachable.");
  }
  async callEndpoint(baseUrl, endpoint, payload, timeoutMs = 8e3) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(700)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
    }
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(id);
        reject(new Error(`Timeout waiting for Thassi.PcAgent (${endpoint}) after ${timeoutMs}ms`));
      }, timeoutMs);
      this.resolvers.set(id, { resolve, reject, timer });
      this.queue.push({ id, endpoint, payload, createdAt: Date.now() });
    });
  }
};
var PcAgentReverseBridge = new PcAgentReverseBridgeImpl();

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/floorplan/shared/house-blueprint.ts
var EG_CLEAR_HEIGHT_M = 3;
var OG_ELEVATION_M = 3.35;
var OG_CLEAR_HEIGHT_M = 2.6;
var ROOF_BASE_M = 6.25;
var ROOF_RIDGE_M = 9.25;
function rectPtsCm(x, y, w, h) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}
var BLUEPRINT_FLOORS = [
  {
    id: "og",
    name: "Obergeschoss (OG)",
    subtitle: "Wohnung (123,4 m\xB2 Nutzfl\xE4che + 28,2 m\xB2 Loggia)",
    elevationMeters: OG_ELEVATION_M,
    gridSizePx: 20,
    scalePxPerMeter: 100,
    sortOrder: 2
  },
  {
    id: "eg",
    name: "Erdgeschoss (EG)",
    subtitle: "Verkaufsraum, Backstube, Lager, Zimmer & Stiegenhaus",
    elevationMeters: 0,
    gridSizePx: 20,
    scalePxPerMeter: 100,
    sortOrder: 1
  }
];
var BLUEPRINT_WALLS = [
  // =========================================================================
  // OBERGESCHOSS (OG) — 14 Single Structural & Partition Walls
  // =========================================================================
  {
    id: "og-w-north-parapet",
    floorId: "og",
    x1: 0,
    y1: 12,
    x2: 1190,
    y2: 12,
    thicknessCm: 25,
    heightM: 1.05,
    material: "existing",
    label: "Loggia Br\xFCstung Nord"
  },
  {
    id: "og-w-west",
    floorId: "og",
    x1: 19,
    y1: 0,
    x2: 19,
    y2: 1690,
    thicknessCm: 38,
    heightM: 2.6,
    material: "existing",
    label: "Au\xDFenwand West OG"
  },
  {
    id: "og-w-east",
    floorId: "og",
    x1: 1171,
    y1: 0,
    x2: 1171,
    y2: 1690,
    thicknessCm: 38,
    heightM: 2.6,
    material: "existing",
    label: "Au\xDFenwand Ost OG"
  },
  {
    id: "og-w-south",
    floorId: "og",
    x1: 0,
    y1: 1671,
    x2: 1190,
    y2: 1671,
    thicknessCm: 38,
    heightM: 2.6,
    material: "existing",
    label: "Stra\xDFenfassade S\xFCd OG"
  },
  {
    id: "og-w-loggia",
    floorId: "og",
    x1: 19,
    y1: 285,
    x2: 1171,
    y2: 285,
    thicknessCm: 25,
    heightM: 2.6,
    material: "new",
    label: "Loggiawand Nord"
  },
  {
    id: "og-w-north-spine",
    floorId: "og",
    x1: 19,
    y1: 710,
    x2: 1171,
    y2: 710,
    thicknessCm: 25,
    heightM: 2.6,
    material: "new",
    label: "Mitteltragwand Nord OG"
  },
  {
    id: "og-w-south-spine",
    floorId: "og",
    x1: 19,
    y1: 1075,
    x2: 1171,
    y2: 1075,
    thicknessCm: 25,
    heightM: 2.6,
    material: "new",
    label: "Mitteltragwand S\xFCd OG"
  },
  {
    id: "og-w-z1-z2",
    floorId: "og",
    x1: 370,
    y1: 285,
    x2: 370,
    y2: 710,
    thicknessCm: 10,
    heightM: 2.6,
    material: "partition",
    label: "Trennwand Zimmer 1 / 2"
  },
  {
    id: "og-w-z2-z3",
    floorId: "og",
    x1: 745,
    y1: 285,
    x2: 745,
    y2: 710,
    thicknessCm: 10,
    heightM: 2.6,
    material: "partition",
    label: "Trennwand Zimmer 2 / 3"
  },
  {
    id: "og-w-wc-bad",
    floorId: "og",
    x1: 19,
    y1: 825,
    x2: 250,
    y2: 825,
    thicknessCm: 10,
    heightM: 2.6,
    material: "partition",
    label: "Trennwand WC / Bad"
  },
  {
    id: "og-w-bad-diele",
    floorId: "og",
    x1: 250,
    y1: 710,
    x2: 250,
    y2: 1075,
    thicknessCm: 12,
    heightM: 2.6,
    material: "partition",
    label: "Wand Bad & WC / Diele"
  },
  {
    id: "og-w-diele-vorraum",
    floorId: "og",
    x1: 714,
    y1: 710,
    x2: 714,
    y2: 1075,
    thicknessCm: 12,
    heightM: 2.6,
    material: "new",
    label: "Wand Diele / Vorraum"
  },
  {
    id: "og-w-wohnz-kueche",
    floorId: "og",
    x1: 564,
    y1: 1075,
    x2: 564,
    y2: 1671,
    thicknessCm: 12,
    heightM: 2.6,
    material: "new",
    label: "Wand Wohnzimmer / K\xFCche"
  },
  {
    id: "og-w-kueche-z4",
    floorId: "og",
    x1: 861,
    y1: 1075,
    x2: 861,
    y2: 1671,
    thicknessCm: 12,
    heightM: 2.6,
    material: "new",
    label: "Wand K\xFCche / Zimmer 4"
  },
  // =========================================================================
  // ERDGESCHOSS (EG) — 11 Single Structural & Partition Walls
  // =========================================================================
  {
    id: "eg-w-north",
    floorId: "eg",
    x1: 0,
    y1: 19,
    x2: 1190,
    y2: 19,
    thicknessCm: 38,
    heightM: 3,
    material: "new",
    label: "Au\xDFenwand Nord EG (Hof)"
  },
  {
    id: "eg-w-west",
    floorId: "eg",
    x1: 25,
    y1: 0,
    x2: 25,
    y2: 1690,
    thicknessCm: 50,
    heightM: 3,
    material: "existing",
    label: "Au\xDFenwand West EG"
  },
  {
    id: "eg-w-east",
    floorId: "eg",
    x1: 1168,
    y1: 0,
    x2: 1168,
    y2: 1690,
    thicknessCm: 44,
    heightM: 3,
    material: "existing",
    label: "Au\xDFenwand Ost EG"
  },
  {
    id: "eg-w-south",
    floorId: "eg",
    x1: 0,
    y1: 1671,
    x2: 1190,
    y2: 1671,
    thicknessCm: 38,
    heightM: 3,
    material: "existing",
    label: "Stra\xDFenfassade S\xFCd EG"
  },
  {
    id: "eg-w-west-spine",
    floorId: "eg",
    x1: 642,
    y1: 19,
    x2: 642,
    y2: 1671,
    thicknessCm: 38,
    heightM: 3,
    material: "existing",
    label: "L\xE4ngstragwand Mitte EG"
  },
  {
    id: "eg-w-back-mid",
    floorId: "eg",
    x1: 25,
    y1: 620,
    x2: 642,
    y2: 620,
    thicknessCm: 38,
    heightM: 3,
    material: "new",
    label: "Wand Backstube / Mittelraum (Unterzug)"
  },
  {
    id: "eg-w-mid-verkauf",
    floorId: "eg",
    x1: 25,
    y1: 1020,
    x2: 642,
    y2: 1020,
    thicknessCm: 45,
    heightM: 3,
    material: "existing",
    label: "Tragwand Mittelraum / Verkaufsraum"
  },
  {
    id: "eg-w-gang-zimmer",
    floorId: "eg",
    x1: 854,
    y1: 19,
    x2: 854,
    y2: 710,
    thicknessCm: 35,
    heightM: 3,
    material: "existing",
    label: "Wand Hofgang / Zimmer EG"
  },
  {
    id: "eg-w-zimmer-diele",
    floorId: "eg",
    x1: 642,
    y1: 710,
    x2: 1168,
    y2: 710,
    thicknessCm: 35,
    heightM: 3,
    material: "existing",
    label: "Wand Zimmer / Diele EG"
  },
  {
    id: "eg-w-diele-lager",
    floorId: "eg",
    x1: 642,
    y1: 1236,
    x2: 1168,
    y2: 1236,
    thicknessCm: 25,
    heightM: 3,
    material: "existing",
    label: "Wand Diele / Lager & Vorraum"
  },
  {
    id: "eg-w-lager-vorraum",
    floorId: "eg",
    x1: 954,
    y1: 1236,
    x2: 954,
    y2: 1671,
    thicknessCm: 12,
    heightM: 3,
    material: "partition",
    label: "Trennwand Lager / Vorraum"
  }
];
var BLUEPRINT_ROOMS = [
  // OBERGESCHOSS (Seamless non-overlapping room slabs aligned to wall centerlines)
  {
    id: "og-loggia",
    floorId: "og",
    name: "Loggia",
    zoneCode: "OG-LOG",
    x: 19,
    y: 12,
    width: 1152,
    height: 273,
    points: rectPtsCm(19, 12, 1152, 273),
    wallThickness: 25,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "\xDCberdachte Loggia Gartenseite \xB7 11,40 \xD7 2,47 m (28,16 m\xB2)",
    sortOrder: 1,
    metadata: {
      blueprintName: "LOGGIA",
      labeledAreaM2: 28.16,
      measuredWidthM: 11.4,
      measuredDepthM: 2.47,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-zimmer-nw",
    floorId: "og",
    name: "Zimmer 1 (B\xFCro West)",
    zoneCode: "OG-Z1",
    x: 19,
    y: 285,
    width: 351,
    height: 425,
    points: rectPtsCm(19, 285, 351, 425),
    wallThickness: 25,
    tempEntityId: "sensor.shellyhtg3_e4b32331dde0_temperatur",
    humidityEntityId: "sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit",
    notes: "Planma\xDF 3,30 \xD7 4,00 m \xB7 Planfl\xE4che 13,20 m\xB2",
    sortOrder: 2,
    metadata: {
      blueprintName: "ZIMMER 1",
      labeledAreaM2: 13.2,
      measuredWidthM: 3.3,
      measuredDepthM: 4,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-zimmer-nm",
    floorId: "og",
    name: "Zimmer 2 (Garten Mitte)",
    zoneCode: "OG-Z2",
    x: 370,
    y: 285,
    width: 375,
    height: 425,
    points: rectPtsCm(370, 285, 375, 425),
    wallThickness: 10,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 3,60 \xD7 4,00 m \xB7 Planfl\xE4che 14,40 m\xB2",
    sortOrder: 3,
    metadata: {
      blueprintName: "ZIMMER 2",
      labeledAreaM2: 14.4,
      measuredWidthM: 3.6,
      measuredDepthM: 4,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-zimmer-ne",
    floorId: "og",
    name: "Zimmer 3 (Garten Ost)",
    zoneCode: "OG-Z3",
    x: 745,
    y: 285,
    width: 426,
    height: 425,
    points: rectPtsCm(745, 285, 426, 425),
    wallThickness: 25,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 4,16 \xD7 4,00 m \xB7 Planfl\xE4che 16,60 m\xB2",
    sortOrder: 4,
    metadata: {
      blueprintName: "ZIMMER 3",
      labeledAreaM2: 16.6,
      measuredWidthM: 4.16,
      measuredDepthM: 4,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-wc",
    floorId: "og",
    name: "WC",
    zoneCode: "OG-WC",
    x: 19,
    y: 710,
    width: 231,
    height: 115,
    points: rectPtsCm(19, 710, 231, 115),
    wallThickness: 10,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,10 \xD7 1,00 m \xB7 Planfl\xE4che 2,10 m\xB2",
    sortOrder: 5,
    metadata: {
      blueprintName: "WC",
      labeledAreaM2: 2.1,
      measuredWidthM: 2.1,
      measuredDepthM: 1,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-bad",
    floorId: "og",
    name: "Bad",
    zoneCode: "OG-BAD",
    x: 19,
    y: 825,
    width: 231,
    height: 250,
    points: rectPtsCm(19, 825, 231, 250),
    wallThickness: 10,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,30 \xD7 2,33 m \xB7 Planfl\xE4che 4,70 m\xB2",
    sortOrder: 6,
    metadata: {
      blueprintName: "BAD",
      labeledAreaM2: 4.7,
      measuredWidthM: 2.3,
      measuredDepthM: 2.33,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-diele",
    floorId: "og",
    name: "Diele",
    zoneCode: "OG-DIE",
    x: 250,
    y: 710,
    width: 464,
    height: 365,
    points: rectPtsCm(250, 710, 464, 365),
    wallThickness: 12,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Zentrale Diele OG \xB7 Breite 4,50 m \xB7 Planfl\xE4che 10,80 m\xB2",
    sortOrder: 7,
    metadata: {
      blueprintName: "DIELE",
      labeledAreaM2: 10.8,
      measuredWidthM: 4.5,
      measuredDepthM: 3.4,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-vorraum",
    floorId: "og",
    name: "Vorraum & Stiegenhaus OG",
    zoneCode: "OG-VOR",
    x: 714,
    y: 710,
    width: 457,
    height: 365,
    points: rectPtsCm(714, 710, 457, 365),
    wallThickness: 25,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Vorraum & Stiegenaufgang \xB7 Breite 4,45 m",
    sortOrder: 8,
    metadata: {
      blueprintName: "VORRAUM",
      labeledAreaM2: 15.1,
      measuredWidthM: 4.45,
      measuredDepthM: 3.4,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-wohnzimmer",
    floorId: "og",
    name: "Wohnzimmer",
    zoneCode: "OG-WOH",
    x: 19,
    y: 1075,
    width: 545,
    height: 596,
    points: rectPtsCm(19, 1075, 545, 596),
    wallThickness: 38,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 5,20 \xD7 5,65 m \xB7 Planfl\xE4che 29,40 m\xB2",
    sortOrder: 9,
    metadata: {
      blueprintName: "WOHNZ.",
      labeledAreaM2: 29.4,
      measuredWidthM: 5.2,
      measuredDepthM: 5.65,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-kueche",
    floorId: "og",
    name: "K\xFCche",
    zoneCode: "OG-KUE",
    x: 564,
    y: 1075,
    width: 297,
    height: 596,
    points: rectPtsCm(564, 1075, 297, 596),
    wallThickness: 12,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,85 \xD7 5,65 m \xB7 Planfl\xE4che 16,10 m\xB2",
    sortOrder: 10,
    metadata: {
      blueprintName: "K\xDCCHE",
      labeledAreaM2: 16.1,
      measuredWidthM: 2.85,
      measuredDepthM: 5.65,
      clearHeightM: 2.6
    }
  },
  {
    id: "og-zimmer-se",
    floorId: "og",
    name: "Zimmer 4 (Stra\xDFe Ost)",
    zoneCode: "OG-Z4",
    x: 861,
    y: 1075,
    width: 310,
    height: 596,
    points: rectPtsCm(861, 1075, 310, 596),
    wallThickness: 38,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,95 \xD7 5,65 m \xB7 Planfl\xE4che 16,20 m\xB2",
    sortOrder: 11,
    metadata: {
      blueprintName: "ZIMMER 4",
      labeledAreaM2: 16.2,
      measuredWidthM: 2.95,
      measuredDepthM: 5.65,
      clearHeightM: 2.6
    }
  },
  // ERDGESCHOSS (Seamless non-overlapping room slabs)
  {
    id: "eg-backstube",
    floorId: "eg",
    name: "Backstube",
    zoneCode: "EG-BACK",
    x: 25,
    y: 19,
    width: 617,
    height: 601,
    points: rectPtsCm(25, 19, 617, 601),
    wallThickness: 38,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 5,85 \xD7 5,60 m (32,76 m\xB2)",
    sortOrder: 12,
    metadata: {
      blueprintName: "BACKST.",
      labeledAreaM2: 32.76,
      measuredWidthM: 5.85,
      measuredDepthM: 5.6,
      clearHeightM: 3
    }
  },
  {
    id: "eg-hofgang",
    floorId: "eg",
    name: "Hofdurchgang",
    zoneCode: "EG-GANG",
    x: 642,
    y: 19,
    width: 212,
    height: 691,
    points: rectPtsCm(642, 19, 212, 691),
    wallThickness: 35,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Durchgang Hof / Garten \xB7 Breite 1,76 m",
    sortOrder: 13,
    metadata: {
      blueprintName: "GANG",
      labeledAreaM2: 10.56,
      measuredWidthM: 1.76,
      measuredDepthM: 6,
      clearHeightM: 3
    }
  },
  {
    id: "eg-zimmer-ne",
    floorId: "eg",
    name: "Zimmer (Hof Ost)",
    zoneCode: "EG-ZIM",
    x: 854,
    y: 19,
    width: 314,
    height: 691,
    points: rectPtsCm(854, 19, 314, 691),
    wallThickness: 35,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,84 \xD7 7,00 m (19,88 m\xB2)",
    sortOrder: 14,
    metadata: {
      blueprintName: "ZIMMER EG",
      labeledAreaM2: 19.88,
      measuredWidthM: 2.84,
      measuredDepthM: 7,
      clearHeightM: 3
    }
  },
  {
    id: "eg-mittelraum",
    floorId: "eg",
    name: "Vorbereitungsraum (Mitte)",
    zoneCode: "EG-MIT",
    x: 25,
    y: 620,
    width: 617,
    height: 400,
    points: rectPtsCm(25, 620, 617, 400),
    wallThickness: 45,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 5,78 \xD7 3,46 m (20,00 m\xB2)",
    sortOrder: 15,
    metadata: {
      blueprintName: "MITTELRAUM",
      labeledAreaM2: 20,
      measuredWidthM: 5.78,
      measuredDepthM: 3.46,
      clearHeightM: 3
    }
  },
  {
    id: "eg-diele",
    floorId: "eg",
    name: "Diele & Stiegenhaus EG",
    zoneCode: "EG-DIE",
    x: 642,
    y: 710,
    width: 526,
    height: 526,
    points: rectPtsCm(642, 710, 526, 526),
    wallThickness: 35,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Zentrale Diele mit Hauptstiege ins OG",
    sortOrder: 16,
    metadata: {
      blueprintName: "DIELE EG",
      labeledAreaM2: 27.52,
      measuredWidthM: 4.94,
      measuredDepthM: 5.57,
      clearHeightM: 3
    }
  },
  {
    id: "eg-verkaufsraum",
    floorId: "eg",
    name: "Verkaufsraum",
    zoneCode: "EG-VERK",
    x: 25,
    y: 1020,
    width: 617,
    height: 651,
    points: rectPtsCm(25, 1020, 617, 651),
    wallThickness: 50,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 5,53 \xD7 6,38 m (35,28 m\xB2)",
    sortOrder: 17,
    metadata: {
      blueprintName: "VERKAUFSR.",
      labeledAreaM2: 35.28,
      measuredWidthM: 5.53,
      measuredDepthM: 6.38,
      clearHeightM: 3
    }
  },
  {
    id: "eg-lager",
    floorId: "eg",
    name: "Lager",
    zoneCode: "EG-LAG",
    x: 642,
    y: 1236,
    width: 312,
    height: 435,
    points: rectPtsCm(642, 1236, 312, 435),
    wallThickness: 25,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Planma\xDF 2,10 \xD7 4,10 m (8,61 m\xB2)",
    sortOrder: 18,
    metadata: {
      blueprintName: "LAGER",
      labeledAreaM2: 8.61,
      measuredWidthM: 2.1,
      measuredDepthM: 4.1,
      clearHeightM: 3
    }
  },
  {
    id: "eg-vorraum",
    floorId: "eg",
    name: "Vorraum (Hauseingang)",
    zoneCode: "EG-VOR",
    x: 954,
    y: 1236,
    width: 214,
    height: 435,
    points: rectPtsCm(954, 1236, 214, 435),
    wallThickness: 44,
    tempEntityId: "",
    humidityEntityId: "",
    notes: "Stra\xDFenseitiger Hauseingang \xB7 Breite 1,70 m",
    sortOrder: 19,
    metadata: {
      blueprintName: "VORR.",
      labeledAreaM2: 6.97,
      measuredWidthM: 1.7,
      measuredDepthM: 4.1,
      clearHeightM: 3
    }
  }
];
var BLUEPRINT_CONNECTORS = [
  {
    id: "conn-hauptstiege",
    label: "Hauptstiege (EG \u2194 OG \xB7 16 Stg.)",
    kind: "stairs",
    fromFloorId: "eg",
    toFloorId: "og",
    x: 845,
    y: 735,
    width: 310,
    height: 295,
    rotationDeg: 0,
    notes: "Viertelgewendelte Haupttreppe von Diele EG in den Vorraum OG"
  }
];
var BLUEPRINT_OPENINGS = [
  // OG Loggia doors on `og-w-loggia` (y = 285)
  {
    id: "og-door-loggia-1",
    floorId: "og",
    roomId: "og-zimmer-nw",
    kind: "door",
    wall: "top",
    x: 190,
    y: 285,
    length: 100,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Loggiat\xFCr 100/210",
    contactEntityId: "",
    metadata: { wallId: "og-w-loggia", heightCm: 210, sillCm: 0 }
  },
  {
    id: "og-door-loggia-2",
    floorId: "og",
    roomId: "og-zimmer-nm",
    kind: "door",
    wall: "top",
    x: 555,
    y: 285,
    length: 100,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Loggiat\xFCr 100/210",
    contactEntityId: "",
    metadata: { wallId: "og-w-loggia", heightCm: 210, sillCm: 0 }
  },
  {
    id: "og-door-loggia-3",
    floorId: "og",
    roomId: "og-zimmer-ne",
    kind: "door",
    wall: "top",
    x: 955,
    y: 285,
    length: 100,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Loggiat\xFCr 100/210",
    contactEntityId: "",
    metadata: { wallId: "og-w-loggia", heightCm: 210, sillCm: 0 }
  },
  // OG Bedroom doors on `og-w-north-spine` (y = 710)
  {
    id: "og-door-z1-diele",
    floorId: "og",
    roomId: "og-zimmer-nw",
    kind: "door",
    wall: "bottom",
    x: 310,
    y: 710,
    length: 85,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Zimmert\xFCr 1 (85/194)",
    contactEntityId: "",
    metadata: { wallId: "og-w-north-spine", heightCm: 194, sillCm: 0 }
  },
  {
    id: "og-door-z2-diele",
    floorId: "og",
    roomId: "og-zimmer-nm",
    kind: "door",
    wall: "bottom",
    x: 455,
    y: 710,
    length: 85,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_right",
    label: "Zimmert\xFCr 2 (85/194)",
    contactEntityId: "",
    metadata: { wallId: "og-w-north-spine", heightCm: 194, sillCm: 0 }
  },
  {
    id: "og-door-z3-vorraum",
    floorId: "og",
    roomId: "og-zimmer-ne",
    kind: "door",
    wall: "bottom",
    x: 825,
    y: 710,
    length: 85,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_right",
    label: "Zimmert\xFCr 3 (85/194)",
    contactEntityId: "",
    metadata: { wallId: "og-w-north-spine", heightCm: 194, sillCm: 0 }
  },
  // OG WC & Bad doors on `og-w-bad-diele` (x = 250)
  {
    id: "og-door-wc",
    floorId: "og",
    roomId: "og-wc",
    kind: "door",
    wall: "right",
    x: 250,
    y: 768,
    length: 70,
    orientation: "vertical",
    angleDeg: 90,
    swingDir: "out_left",
    label: "WC-T\xFCr 70/194",
    contactEntityId: "",
    metadata: { wallId: "og-w-bad-diele", heightCm: 194, sillCm: 0 }
  },
  {
    id: "og-door-bad",
    floorId: "og",
    roomId: "og-bad",
    kind: "door",
    wall: "right",
    x: 250,
    y: 935,
    length: 70,
    orientation: "vertical",
    angleDeg: 90,
    swingDir: "in_left",
    label: "Badt\xFCr 70/194",
    contactEntityId: "",
    metadata: { wallId: "og-w-bad-diele", heightCm: 194, sillCm: 0 }
  },
  // OG Vorraum -> Diele door on `og-w-diele-vorraum` (x = 714)
  {
    id: "og-door-vorraum-diele",
    floorId: "og",
    roomId: "og-diele",
    kind: "door",
    wall: "right",
    x: 714,
    y: 810,
    length: 90,
    orientation: "vertical",
    angleDeg: 90,
    swingDir: "in_right",
    label: "Diele Zwischent\xFCr 90/194",
    contactEntityId: "",
    metadata: { wallId: "og-w-diele-vorraum", heightCm: 194, sillCm: 0 }
  },
  // OG Wohnzimmer & Küche doors on `og-w-south-spine` (y = 1075)
  {
    id: "og-door-wohnz",
    floorId: "og",
    roomId: "og-wohnzimmer",
    kind: "door",
    wall: "top",
    x: 425,
    y: 1075,
    length: 85,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Wohnzimmert\xFCr 85/194",
    contactEntityId: "",
    metadata: { wallId: "og-w-south-spine", heightCm: 194, sillCm: 0 }
  },
  {
    id: "og-door-kueche",
    floorId: "og",
    roomId: "og-kueche",
    kind: "door",
    wall: "top",
    x: 645,
    y: 1075,
    length: 85,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_right",
    label: "K\xFCchent\xFCr 85/194",
    contactEntityId: "",
    metadata: { wallId: "og-w-south-spine", heightCm: 194, sillCm: 0 }
  },
  // OG Zimmer 4 door on `og-w-kueche-z4` (x = 861)
  {
    id: "og-door-z4",
    floorId: "og",
    roomId: "og-zimmer-se",
    kind: "door",
    wall: "left",
    x: 861,
    y: 1185,
    length: 85,
    orientation: "vertical",
    angleDeg: 90,
    swingDir: "in_right",
    label: "Zimmert\xFCr 4 (85/194)",
    contactEntityId: "",
    metadata: { wallId: "og-w-kueche-z4", heightCm: 194, sillCm: 0 }
  },
  // OG 4 Street Windows on `og-w-south` (y = 1671)
  {
    id: "og-win-street-1",
    floorId: "og",
    roomId: "og-wohnzimmer",
    kind: "window",
    wall: "bottom",
    x: 210,
    y: 1671,
    length: 120,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Stra\xDFenfenster 1 (120/140)",
    contactEntityId: "",
    metadata: { wallId: "og-w-south", heightCm: 140, sillCm: 90 }
  },
  {
    id: "og-win-street-2",
    floorId: "og",
    roomId: "og-wohnzimmer",
    kind: "window",
    wall: "bottom",
    x: 480,
    y: 1671,
    length: 120,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Stra\xDFenfenster 2 (120/140)",
    contactEntityId: "",
    metadata: { wallId: "og-w-south", heightCm: 140, sillCm: 90 }
  },
  {
    id: "og-win-street-3",
    floorId: "og",
    roomId: "og-kueche",
    kind: "window",
    wall: "bottom",
    x: 750,
    y: 1671,
    length: 120,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "K\xFCchenfenster (120/140)",
    contactEntityId: "",
    metadata: { wallId: "og-w-south", heightCm: 140, sillCm: 90 }
  },
  {
    id: "og-win-street-4",
    floorId: "og",
    roomId: "og-zimmer-se",
    kind: "window",
    wall: "bottom",
    x: 1020,
    y: 1671,
    length: 120,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Stra\xDFenfenster 4 (120/140)",
    contactEntityId: "",
    metadata: { wallId: "og-w-south", heightCm: 140, sillCm: 90 }
  },
  // =========================================================================
  // ERDGESCHOSS (EG) OPENINGS
  // =========================================================================
  {
    id: "eg-portal-verkauf",
    floorId: "eg",
    roomId: "eg-verkaufsraum",
    kind: "sliding_door",
    wall: "bottom",
    x: 210,
    y: 1671,
    length: 210,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Gesch\xE4ftsportal 210 cm",
    contactEntityId: "",
    metadata: { wallId: "eg-w-south", heightCm: 220, sillCm: 0 }
  },
  {
    id: "eg-win-verkauf",
    floorId: "eg",
    roomId: "eg-verkaufsraum",
    kind: "window",
    wall: "bottom",
    x: 480,
    y: 1671,
    length: 150,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Schaufenster 150/150",
    contactEntityId: "",
    metadata: { wallId: "eg-w-south", heightCm: 150, sillCm: 90 }
  },
  {
    id: "eg-win-lager",
    floorId: "eg",
    roomId: "eg-lager",
    kind: "window",
    wall: "bottom",
    x: 780,
    y: 1671,
    length: 150,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Lagerfenster 150/150",
    contactEntityId: "",
    metadata: { wallId: "eg-w-south", heightCm: 150, sillCm: 90 }
  },
  {
    id: "eg-door-haupteingang",
    floorId: "eg",
    roomId: "eg-vorraum",
    kind: "door",
    wall: "bottom",
    x: 1055,
    y: 1671,
    length: 115,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_right",
    label: "Hauseingangst\xFCr 115/210",
    contactEntityId: "",
    metadata: { wallId: "eg-w-south", heightCm: 210, sillCm: 0 }
  },
  {
    id: "eg-win-backstube-nord",
    floorId: "eg",
    roomId: "eg-backstube",
    kind: "window",
    wall: "top",
    x: 310,
    y: 19,
    length: 220,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Fenster Backstube Nord",
    contactEntityId: "",
    metadata: { wallId: "eg-w-north", heightCm: 150, sillCm: 90 }
  },
  {
    id: "eg-win-zimmer-nord",
    floorId: "eg",
    roomId: "eg-zimmer-ne",
    kind: "window",
    wall: "top",
    x: 1010,
    y: 19,
    length: 130,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Fenster Zimmer Nord",
    contactEntityId: "",
    metadata: { wallId: "eg-w-north", heightCm: 140, sillCm: 90 }
  },
  {
    id: "eg-passage-backstube",
    floorId: "eg",
    roomId: "eg-backstube",
    kind: "passage",
    wall: "bottom",
    x: 330,
    y: 620,
    length: 380,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "Wanddurchbruch / Unterzug",
    contactEntityId: "",
    metadata: { wallId: "eg-w-back-mid", heightCm: 230, sillCm: 0 }
  },
  {
    id: "eg-door-mid-verkauf",
    floorId: "eg",
    roomId: "eg-verkaufsraum",
    kind: "door",
    wall: "top",
    x: 465,
    y: 1020,
    length: 90,
    orientation: "horizontal",
    angleDeg: 0,
    swingDir: "in_left",
    label: "T\xFCr Verkauf \u2194 Mittelraum",
    contactEntityId: "",
    metadata: { wallId: "eg-w-mid-verkauf", heightCm: 200, sillCm: 0 }
  }
];
var BLUEPRINT_DEVICES = [
  {
    id: "dev-buro-main-light",
    floorId: "og",
    roomId: "og-zimmer-nw",
    label: "B\xFCro Gro\xDFes Licht",
    category: "light",
    x: 196,
    y: 495,
    sourceType: "ha_entity",
    primaryEntityId: "light.buro_og_grosses_licht",
    secondaryEntityId: "sensor.links_power",
    targetAppId: "smart-canvas",
    notes: "Hauptbeleuchtung B\xFCro OG (Shelly)"
  },
  {
    id: "dev-buro-climate",
    floorId: "og",
    roomId: "og-zimmer-nw",
    label: "Raumklima H&T Gen3",
    category: "climate",
    x: 110,
    y: 380,
    sourceType: "ha_entity",
    primaryEntityId: "sensor.shellyhtg3_e4b32331dde0_temperatur",
    secondaryEntityId: "sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit",
    targetAppId: "smart-canvas",
    notes: "Shelly H&T Gen3 Sensor"
  },
  {
    id: "dev-vz-main-light",
    floorId: "og",
    roomId: "og-diele",
    label: "Diele Gro\xDFes Licht",
    category: "light",
    x: 485,
    y: 890,
    sourceType: "ha_entity",
    primaryEntityId: "switch.vorzimmer_og_grosses_licht",
    secondaryEntityId: "",
    targetAppId: "smart-canvas",
    notes: "Deckenlicht Diele OG"
  },
  {
    id: "dev-gaeste-light-1",
    floorId: "og",
    roomId: "og-zimmer-ne",
    label: "Zimmer 3 Licht",
    category: "light",
    x: 955,
    y: 495,
    sourceType: "ha_entity",
    primaryEntityId: "switch.gaestezimmer_schalter_rechts",
    secondaryEntityId: "sensor.shellyplus2pm_c049ef8a3a78_switch_0_power",
    targetAppId: "smart-canvas",
    notes: "Shelly Plus 2PM"
  },
  {
    id: "dev-bad-washer",
    floorId: "og",
    roomId: "og-bad",
    label: "Waschmaschine Shelly 1PM",
    category: "appliance",
    x: 130,
    y: 940,
    sourceType: "ha_entity",
    primaryEntityId: "switch.shelly1pmminig4_7c2c676dc6fc",
    secondaryEntityId: "sensor.shelly1pmminig4_7c2c676dc6fc_leistung",
    targetAppId: "smart-canvas",
    notes: "Shelly 1PM Mini Gen4"
  },
  {
    id: "dev-wk-boden",
    floorId: "og",
    roomId: "og-wohnzimmer",
    label: "Wohnzimmer Licht",
    category: "light",
    x: 295,
    y: 1365,
    sourceType: "ha_entity",
    primaryEntityId: "switch.wohnkueche_bodenbeleuchtung_boden",
    secondaryEntityId: "sensor.shelly_plus_2pm_a_switch_0_power",
    targetAppId: "smart-canvas",
    notes: "Hauptbeleuchtung Wohnzimmer"
  },
  {
    id: "dev-wk-fensterbank",
    floorId: "og",
    roomId: "og-kueche",
    label: "K\xFCchenlicht",
    category: "light",
    x: 712,
    y: 1365,
    sourceType: "ha_entity",
    primaryEntityId: "switch.wohnkueche_fensterbank_licht",
    secondaryEntityId: "sensor.bodenbeleuchtung_power",
    targetAppId: "smart-canvas",
    notes: "Beleuchtung K\xFCche"
  }
];
var BLUEPRINT_WIRES = [
  {
    id: "wire-og-uv-buro",
    floorId: "og",
    kind: "power_230v",
    x1: 714,
    y1: 890,
    x2: 196,
    y2: 495,
    elevationM: 2.4,
    label: "NYM-J 3x1,5 \xB7 UV-OG \u2192 B\xFCro Licht",
    toDeviceId: "dev-buro-main-light"
  },
  {
    id: "wire-og-uv-diele",
    floorId: "og",
    kind: "power_230v",
    x1: 714,
    y1: 890,
    x2: 485,
    y2: 890,
    elevationM: 2.4,
    label: "NYM-J 3x1,5 \xB7 UV-OG \u2192 Diele Licht",
    toDeviceId: "dev-vz-main-light"
  },
  {
    id: "wire-og-uv-wohnz",
    floorId: "og",
    kind: "power_230v",
    x1: 714,
    y1: 890,
    x2: 295,
    y2: 1365,
    elevationM: 2.4,
    label: "NYM-J 3x1,5 \xB7 UV-OG \u2192 Wohnzimmer",
    toDeviceId: "dev-wk-boden"
  },
  {
    id: "wire-lan-backbone",
    floorId: "og",
    kind: "network_cat7",
    x1: 840,
    y1: 890,
    x2: 196,
    y2: 380,
    elevationM: 0.3,
    label: "CAT7 Duplex \xB7 Steigschacht \u2192 B\xFCro"
  }
];
var BLUEPRINT_LABELS = [
  {
    id: "lbl-og-total",
    floorId: "og",
    x: 485,
    y: 820,
    text: "123,4 m\xB2",
    subtext: "Gesamtnutzfl\xE4che OG",
    color: "#10b981"
  }
];
var PLAUSIBILITY_CHECKS = [
  {
    id: "chk-og-depth",
    category: "chain_y",
    title: "L\xE4ngskette Obergeschoss (Nord \u2192 S\xFCd)",
    formula: "0,25 + 2,47 (Loggia) + 0,25 + 4,00 (Zimmer) + 0,25 + 3,40 (Bad/WC) + 0,25 + 5,65 (Wohnz.) + 0,38",
    expected: "16,90 m",
    measured: "16,90 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-eg-depth",
    category: "chain_y",
    title: "L\xE4ngskette Erdgeschoss (Nord \u2192 S\xFCd)",
    formula: "0,38 + 5,60 (Backstube) + 0,45 + 3,46 (Mittelraum) + 0,65 + 5,98 (Verkaufsr.) + 0,38",
    expected: "16,90 m",
    measured: "16,90 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-street-width",
    category: "chain_x",
    title: "Querkette Stra\xDFenfassade (EG & OG)",
    formula: "2,10 + 2,70 + 2,70 + 2,70 + 1,70 (Fensterachsen)",
    expected: "11,90 m",
    measured: "11,90 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-loggia-width",
    category: "chain_x",
    title: "Querkette Loggia & St\xFCtzenraster (Nord)",
    formula: "0,25 (Wand) + 3,80 + 3,80 + 3,80 (3 Felder) + 0,25 (Wand)",
    expected: "11,90 m",
    measured: "11,90 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-eg-north-width",
    category: "chain_x",
    title: "Querkette Erdgeschoss Hofseite (Nord)",
    formula: "2,90 + 3,70 (Backstube 6,60) + 1,76 (Gang) + 1,77 + 1,77 (Zimmer 3,54)",
    expected: "11,90 m",
    measured: "11,90 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-og-area-sum",
    category: "area",
    title: "Wohnfl\xE4chen-Kontrollsumme Obergeschoss",
    formula: "13,20 + 14,40 + 16,60 + 2,10 + 4,70 + 10,80 + 29,40 + 16,10 + 16,20",
    expected: "123,40 m\xB2 (Plankote)",
    measured: "123,50 m\xB2",
    deviationCm: 1,
    passed: true
  },
  {
    id: "chk-section-elevation",
    category: "elevation",
    title: "H\xF6henkette Schnitt & Stra\xDFenansicht",
    formula: "EG 3,00 m + Decke 0,35 m + OG 2,60 m + Decke 0,30 m + Dachstuhl 3,00 m (73\xB0 Welleternit)",
    expected: "9,25 m Firsth\xF6he",
    measured: "9,25 m",
    deviationCm: 0,
    passed: true
  },
  {
    id: "chk-structural-alignment",
    category: "structural",
    title: "Einwand-Topologie (Keine Doppelw\xE4nde)",
    formula: "14 Einzelw\xE4nde OG + 11 Einzelw\xE4nde EG \xB7 Jede \xD6ffnung exakt 1\xD7 geschnitten",
    expected: "25 Einzelw\xE4nde",
    measured: "25 Einzelw\xE4nde (0 Duplikate)",
    deviationCm: 0,
    passed: true
  }
];
function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function norm3(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function pushQuad(out, p0, p1, p2, p3, color, material, floorId, roomId, wallId, openingId) {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  out.push({ v0: p0, v1: p1, v2: p2, normal: n, color, material, floorId, roomId, wallId, openingId });
  out.push({ v0: p0, v1: p2, v2: p3, normal: n, color, material, floorId, roomId, wallId, openingId });
}
function pushBox(out, x0, y0, z0, x1, y1, z1, color, material, floorId, roomId, wallId, openingId) {
  const lx = Math.min(x0, x1);
  const hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  const lz = Math.min(z0, z1);
  const hz = Math.max(z0, z1);
  if (hx - lx < 5e-3 || hy - ly < 5e-3 || hz - lz < 5e-3) return;
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
function emitWallSpan(out, cw, tStartM, tEndM, z0, z1, color, material, thicknessScale = 1, openingId) {
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
  const halfT = Math.max(0.06, cw.thicknessCm / 100) * thicknessScale / 2;
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
  pushQuad(out, t0, t1, t2, t3, color, material, cw.floorId, void 0, cw.id, openingId);
  pushQuad(out, b3, b2, b1, b0, color, material, cw.floorId, void 0, cw.id, openingId);
  pushQuad(out, b0, b1, t1, t0, color, material, cw.floorId, void 0, cw.id, openingId);
  pushQuad(out, b1, b2, t2, t1, color, material, cw.floorId, void 0, cw.id, openingId);
  pushQuad(out, b2, b3, t3, t2, color, material, cw.floorId, void 0, cw.id, openingId);
  pushQuad(out, b3, b0, t0, t3, color, material, cw.floorId, void 0, cw.id, openingId);
}
function assignOpeningsToSingleWall(walls, openings) {
  const map = /* @__PURE__ */ new Map();
  for (const w of walls) map.set(w.id, []);
  for (const op of openings) {
    let bestWall = null;
    let bestT = 0;
    let bestDist = 45;
    for (const w of walls) {
      if (w.floorId !== op.floorId) continue;
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
        bestT = clampedProj * lenCm / 100;
      }
    }
    if (bestWall) {
      const lenM = Math.hypot(bestWall.x2 - bestWall.x1, bestWall.y2 - bestWall.y1) / 100;
      const halfW = Math.max(0.25, op.length / 200);
      const tStartM = Math.max(0.05, bestT - halfW);
      const tEndM = Math.min(lenM - 0.05, bestT + halfW);
      if (tEndM > tStartM + 0.08) {
        map.get(bestWall.id).push({ op, tStartM, tEndM });
      }
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.tStartM - b.tStartM);
  }
  return map;
}
function compileHouse3DModel(options) {
  const rooms = options?.rooms && options.rooms.length > 0 ? options.rooms : BLUEPRINT_ROOMS;
  const openings = options?.openings || BLUEPRINT_OPENINGS;
  const walls = options?.customWalls && options.customWalls.length > 0 ? options.customWalls : BLUEPRINT_WALLS;
  const includeRoof = options?.includeRoof ?? true;
  const cut = Math.max(0.2, Math.min(1, options?.wallCutawayRatio ?? 1));
  const triangles = [];
  const ogZ0 = OG_ELEVATION_M;
  pushBox(triangles, 0, 0, -0.25, 11.9, 16.9, 0, "#18181b", "slab", "eg");
  pushBox(triangles, 0, 0, 3, 8.45, 16.9, 3.35, "#27272a", "slab", "og");
  pushBox(triangles, 8.45, 0, 3, 11.9, 7.1, 3.35, "#27272a", "slab", "og");
  pushBox(triangles, 8.45, 10.2, 3, 11.9, 16.9, 3.35, "#27272a", "slab", "og");
  for (const r of rooms) {
    const floorId = r.floorId === "eg" ? "eg" : "og";
    const zBase = floorId === "og" ? ogZ0 : 0;
    const x0 = r.x / 100;
    const y0 = r.y / 100;
    const x1 = (r.x + r.width) / 100;
    const y1 = (r.y + r.height) / 100;
    const slabCol = r.id === "og-loggia" ? "#1e293b" : floorId === "og" ? "#1f242d" : "#181c24";
    pushBox(triangles, x0, y0, zBase, x1, y1, zBase + 0.04, slabCol, "slab", floorId, r.id);
  }
  const wallOpeningsMap = assignOpeningsToSingleWall(walls, openings);
  for (const cw of walls) {
    const zBase = cw.floorId === "og" ? ogZ0 : 0;
    const defaultH = cw.floorId === "og" ? OG_CLEAR_HEIGHT_M : EG_CLEAR_HEIGHT_M;
    const fullH = cw.heightM || defaultH;
    const zTop = cw.id === "og-w-north-parapet" ? zBase + Math.min(fullH, defaultH * cut) : zBase + fullH * cut;
    const lenM = Math.hypot(cw.x2 - cw.x1, cw.y2 - cw.y1) / 100;
    const col = cw.material === "partition" ? "#71717a" : cw.floorId === "og" ? "#a1a1aa" : "#686873";
    const mat = cw.material === "new" ? "wall_new" : cw.material === "partition" ? "wall_int" : "wall_ext";
    const ops = wallOpeningsMap.get(cw.id) || [];
    let cursor = 0;
    for (const item of ops) {
      const s = Math.max(cursor, item.tStartM);
      const e = item.tEndM;
      if (s > cursor + 0.02) {
        emitWallSpan(triangles, cw, cursor, s, zBase, zTop, col, mat, 1);
      }
      if (e > s + 0.02) {
        const op = item.op;
        const sillM = op.kind === "window" ? Number(op.metadata?.sillCm ?? 90) / 100 : 0;
        const heightM = Number(op.metadata?.heightCm ?? (op.kind === "window" ? 140 : 194)) / 100;
        const openBottom = zBase + sillM;
        const openTop = zBase + sillM + heightM;
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
            1,
            op.id
          );
        }
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
            1,
            op.id
          );
        }
        const paneBottom = Math.max(zBase, Math.min(zTop, openBottom));
        const paneTop = Math.max(zBase, Math.min(zTop, openTop));
        if (paneTop > paneBottom + 0.05 && op.kind !== "passage") {
          emitWallSpan(
            triangles,
            cw,
            s,
            e,
            paneBottom,
            paneTop,
            op.kind === "window" ? "#38bdf8" : "#d97706",
            op.kind === "window" ? "glass" : "door_leaf",
            0.22,
            op.id
          );
        }
        cursor = Math.max(cursor, e);
      }
    }
    if (lenM > cursor + 0.02) {
      emitWallSpan(triangles, cw, cursor, lenM, zBase, zTop, col, mat, 1);
    }
  }
  const ogTop = ogZ0 + OG_CLEAR_HEIGHT_M * cut;
  pushBox(triangles, 3.95, 0.04, ogZ0, 4.15, 0.22, ogTop, "#e4e4e7", "column", "og");
  pushBox(triangles, 7.75, 0.04, ogZ0, 7.95, 0.22, ogTop, "#e4e4e7", "column", "og");
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const zStep0 = i / steps * OG_ELEVATION_M;
    const zStep1 = (i + 1) / steps * OG_ELEVATION_M;
    if (i < 10) {
      const yS0 = 10.1 - i * 0.26;
      const yS1 = yS0 - 0.26;
      pushBox(triangles, 10.45, yS1, zStep0, 11.5, yS0, zStep1, "#d4d4d8", "stair", "eg");
    } else {
      const k = i - 10;
      const xS0 = 10.45 - k * 0.31;
      const xS1 = xS0 - 0.31;
      pushBox(triangles, xS1, 7.25, zStep0, xS0, 8.25, zStep1, "#e4e4e7", "stair", "og");
    }
  }
  if (includeRoof) {
    const zEave = ROOF_BASE_M;
    const zRidge = ROOF_RIDGE_M;
    const yRidge = 13.7;
    const rCol = "#3f3f46";
    pushBox(triangles, 0, 0, 5.95, 11.9, 16.9, zEave, "#27272a", "slab", "roof");
    pushQuad(
      triangles,
      { x: 0, y: 0, z: zEave },
      { x: 11.9, y: 0, z: zEave },
      { x: 11.9, y: yRidge, z: zRidge },
      { x: 0, y: yRidge, z: zRidge },
      rCol,
      "roof",
      "roof"
    );
    pushQuad(
      triangles,
      { x: 0, y: yRidge, z: zRidge },
      { x: 11.9, y: yRidge, z: zRidge },
      { x: 11.9, y: 16.9, z: zEave },
      { x: 0, y: 16.9, z: zEave },
      "#52525b",
      "roof",
      "roof"
    );
    triangles.push({
      v0: { x: 0, y: 0, z: zEave },
      v1: { x: 0, y: yRidge, z: zRidge },
      v2: { x: 0, y: 16.9, z: zEave },
      normal: { x: -1, y: 0, z: 0 },
      color: "#52525b",
      material: "roof",
      floorId: "roof"
    });
    triangles.push({
      v0: { x: 11.9, y: 0, z: zEave },
      v1: { x: 11.9, y: 16.9, z: zEave },
      v2: { x: 11.9, y: yRidge, z: zRidge },
      normal: { x: 1, y: 0, z: 0 },
      color: "#52525b",
      material: "roof",
      floorId: "roof"
    });
  }
  return {
    triangles,
    boundsMin: { x: 0, y: 0, z: -0.25 },
    boundsMax: { x: 11.9, y: 16.9, z: includeRoof ? ROOF_RIDGE_M : ogTop },
    vertexCount: triangles.length * 3,
    triangleCount: triangles.length
  };
}
function exportHouseWavefrontObj(model) {
  const m = model || compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1 });
  const lines = [
    "# Thassi Architectural 3D Reconstruction \u2014 Wavefront OBJ",
    "# Blueprint: 11.90 m x 16.90 m (Single-Wall Topology)",
    `# Triangles: ${m.triangleCount}`,
    "o House_1190x1690"
  ];
  let vIdx = 1;
  let currentMat = "";
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
  return lines.join("\n");
}
function exportHouseGltfJson(model) {
  const m = model || compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1 });
  const numVerts = m.triangles.length * 3;
  const floatArray = new Float32Array(numVerts * 6);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
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
  let binaryStr = "";
  for (let i = 0; i < uint8.byteLength; i++) {
    binaryStr += String.fromCharCode(uint8[i]);
  }
  const base64Buf = typeof btoa === "function" ? btoa(binaryStr) : Buffer.from(uint8).toString("base64");
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Thassi Architectural 3D Engine"
    },
    scene: 0,
    scenes: [{ name: "House_1190x1690", nodes: [0] }],
    nodes: [{ name: "HouseMesh", mesh: 0 }],
    meshes: [
      {
        name: "House_1190x1690_Mesh",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            mode: 4
          }
        ]
      }
    ],
    buffers: [
      {
        byteLength: uint8.byteLength,
        uri: `data:application/octet-stream;base64,${base64Buf}`
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: uint8.byteLength,
        byteStride: 24,
        target: 34962
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: numVerts,
        type: "VEC3",
        min: [Number(minX.toFixed(4)), Number(minY.toFixed(4)), Number(minZ.toFixed(4))],
        max: [Number(maxX.toFixed(4)), Number(maxY.toFixed(4)), Number(maxZ.toFixed(4))]
      },
      {
        bufferView: 0,
        byteOffset: 12,
        componentType: 5126,
        count: numVerts,
        type: "VEC3"
      }
    ]
  };
  return JSON.stringify(gltf, null, 2);
}

// apps/floorplan/backend/index.ts
function deterministicMacFromId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const b = [
    124,
    44,
    103,
    h >>> 16 & 255,
    h >>> 8 & 255,
    h & 255
  ];
  return b.map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
}
function deterministicGuidFromId(id) {
  let h1 = 3735928559 ^ id.length;
  let h2 = 1103547991 ^ id.length;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex = (n, len) => (n >>> 0).toString(16).padStart(len, "0").slice(0, len);
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 ^ h2, 3)}-a${hex(h2 >>> 4, 3)}-${hex(h1, 6)}${hex(h2, 6)}`;
}
function buildDefaultMetadata(kind, item) {
  const id = String(item.id || "obj");
  const guid = deterministicGuidFromId(id);
  if (kind === "room") {
    return {
      guid,
      thassiId: `thassi:room:${id}`,
      hassAreaId: String(item.zoneCode || id).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      zoneCode: item.zoneCode || "",
      climateSensors: {
        temperatureEntityId: item.tempEntityId || null,
        humidityEntityId: item.humidityEntityId || null
      },
      beaconZone: {
        enabled: true,
        geofenceType: "polygon_2d",
        bleScannerAnchor: id === "room-buro-og" || id === "room-wohnkueche-eg"
      },
      axonCallable: ["objectsInRoom", "DistanceBetween", "beaconsInRoom"]
    };
  }
  if (kind === "opening") {
    return {
      guid,
      thassiId: `thassi:opening:${id}`,
      hassId: item.contactEntityId || null,
      openingKind: item.kind || "door",
      acousticAttenuationDb: item.kind === "window" ? 24 : 14,
      bleWallLossDb: item.kind === "window" ? 2.5 : 4,
      axonCallable: ["DistanceBetween"]
    };
  }
  if (kind === "connector") {
    return {
      guid,
      thassiId: `thassi:connector:${id}`,
      verticalTransition: {
        fromFloorId: item.fromFloorId || "eg",
        toFloorId: item.toFloorId || "og",
        traversalCostMeters: 4.2
      },
      beaconRelay: {
        enabled: true,
        rangeMeters: 5.5
      },
      axonCallable: ["DistanceBetween"]
    };
  }
  const primaryId = String(item.primaryEntityId || "");
  const isBleOrSensor = primaryId.includes("blu") || primaryId.includes("shelly") || primaryId.includes("oral") || primaryId.includes("series") || item.category === "motion" || item.category === "climate" || item.category === "workstation" || item.category === "thassi_app";
  const macMatch = primaryId.match(/([0-9a-f]{12})/i);
  const mac = macMatch ? macMatch[1].toUpperCase().match(/.{1,2}/g).join(":") : deterministicMacFromId(id);
  return {
    guid,
    hassId: item.sourceType === "ha_entity" ? primaryId : null,
    thassiId: item.sourceType === "thassi_app" ? primaryId : `thassi:device:${id}`,
    targetAppId: item.targetAppId || null,
    mac,
    network: {
      protocol: primaryId.includes("blu") || primaryId.includes("series") ? "BLE_5.2" : "WiFi_BLE_Combo",
      reachable: true
    },
    beacon: {
      enabled: isBleOrSensor,
      protocol: primaryId.includes("shelly") ? "BTHome_v2" : "iBeacon_BLE",
      uuid: guid,
      txPowerDbm: -12,
      rssiAt1m: -59,
      rangeMeters: item.category === "workstation" || item.category === "camera" ? 7.5 : 5
    },
    axonCallable: ["DistanceBetween", "nearestBeacons", "triggerAxonAction"],
    customAttributes: {}
  };
}
function parseMetadataJson(raw, kind, fallbackItem) {
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {
    }
  }
  return buildDefaultMetadata(kind, fallbackItem);
}
function rectToPoints(x, y, width, height) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
}
function computeBoundingBox(points) {
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
    height: Math.max(40, Math.round(maxY - minY))
  };
}
var DEFAULT_FLOORS = BLUEPRINT_FLOORS;
var DEFAULT_ROOMS = BLUEPRINT_ROOMS;
var DEFAULT_CONNECTORS = BLUEPRINT_CONNECTORS;
var DEFAULT_OPENINGS = BLUEPRINT_OPENINGS;
var DEFAULT_DEVICES = BLUEPRINT_DEVICES;
function ensureSchemaAndSeed(ctx) {
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
  try {
    ctx.db.exec(`ALTER TABLE floor_levels ADD COLUMN elevation_meters REAL NOT NULL DEFAULT 0;`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_rooms ADD COLUMN points_json TEXT NOT NULL DEFAULT '';`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_openings ADD COLUMN angle_deg REAL NOT NULL DEFAULT 0;`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN width REAL NOT NULL DEFAULT 148;`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN height REAL NOT NULL DEFAULT 44;`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN rotation_deg REAL NOT NULL DEFAULT 0;`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_rooms ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_openings ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_connectors ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {
  }
  try {
    ctx.db.exec(`ALTER TABLE floor_devices ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '';`);
  } catch {
  }
  const levelCountRow = ctx.db.queryOne(
    "SELECT COUNT(*) as cnt FROM floor_levels"
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
          fl.sortOrder
        ]
      );
    }
  }
  const blueprintSeeded = ctx.sharedDb.kvGet("floorplan_blueprint_singlewall_v3");
  const roomCountRow = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM floor_rooms");
  if (!blueprintSeeded || !roomCountRow || roomCountRow.cnt === 0) {
    seedDefaults(ctx);
    ctx.sharedDb.kvSet("floorplan_cad_extensions_v1", {
      customWalls: BLUEPRINT_WALLS,
      customLabels: BLUEPRINT_LABELS,
      wires: BLUEPRINT_WIRES
    });
    ctx.sharedDb.kvSet("floorplan_blueprint_singlewall_v3", true);
  }
}
function seedDefaults(ctx) {
  ctx.db.execute("DELETE FROM floor_levels");
  ctx.db.execute("DELETE FROM floor_rooms");
  ctx.db.execute("DELETE FROM floor_openings");
  ctx.db.execute("DELETE FROM floor_connectors");
  ctx.db.execute("DELETE FROM floor_devices");
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
        fl.sortOrder
      ]
    );
  }
  for (const r of DEFAULT_ROOMS) {
    const pts = Array.isArray(r.points) && r.points.length >= 3 ? r.points : rectToPoints(r.x, r.y, r.width, r.height);
    const bbox = computeBoundingBox(pts);
    const meta = r.metadata || buildDefaultMetadata("room", r);
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
        JSON.stringify(meta)
      ]
    );
  }
  for (const op of DEFAULT_OPENINGS) {
    const meta = op.metadata || buildDefaultMetadata("opening", op);
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
        Number(op.angleDeg ?? (op.orientation === "vertical" ? 90 : 0)),
        op.swingDir,
        op.label,
        op.contactEntityId,
        JSON.stringify(meta)
      ]
    );
  }
  for (const fc of DEFAULT_CONNECTORS) {
    const meta = fc.metadata || buildDefaultMetadata("connector", fc);
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
        JSON.stringify(meta)
      ]
    );
  }
  for (const dv of DEFAULT_DEVICES) {
    const meta = dv.metadata || buildDefaultMetadata("device", dv);
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
        JSON.stringify(meta)
      ]
    );
  }
}
function loadPersistedState(ctx) {
  ensureSchemaAndSeed(ctx);
  const floors = ctx.db.query("SELECT * FROM floor_levels ORDER BY sort_order DESC, id ASC").map((r) => ({
    id: String(r.id),
    name: String(r.name),
    subtitle: String(r.subtitle || ""),
    elevationMeters: Number(r.elevation_meters ?? 0),
    gridSizePx: Number(r.grid_size_px || 20),
    scalePxPerMeter: Number(r.scale_px_per_meter || 100),
    sortOrder: Number(r.sort_order || 1)
  }));
  const rooms = ctx.db.query("SELECT * FROM floor_rooms ORDER BY sort_order ASC, id ASC").map((r) => {
    const rx = Number(r.x);
    const ry = Number(r.y);
    const rw = Number(r.width);
    const rh = Number(r.height);
    let points = [];
    if (r.points_json) {
      try {
        const parsed = JSON.parse(String(r.points_json));
        if (Array.isArray(parsed) && parsed.length >= 3) {
          points = parsed.map((pt) => ({
            x: Number(pt.x || 0),
            y: Number(pt.y || 0)
          }));
        }
      } catch {
      }
    }
    if (points.length < 3) {
      points = rectToPoints(rx, ry, rw, rh);
    }
    const bbox = computeBoundingBox(points);
    const baseRoom = {
      id: String(r.id),
      floorId: String(r.floor_id),
      name: String(r.name),
      zoneCode: String(r.zone_code || ""),
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      points,
      wallThickness: Number(r.wall_thickness || 10),
      tempEntityId: String(r.temp_entity_id || ""),
      humidityEntityId: String(r.humidity_entity_id || ""),
      notes: String(r.notes || ""),
      sortOrder: Number(r.sort_order || 1)
    };
    return {
      ...baseRoom,
      metadata: parseMetadataJson(r.metadata_json, "room", baseRoom)
    };
  });
  const openings = ctx.db.query("SELECT * FROM floor_openings ORDER BY id ASC").map((r) => {
    const orient = r.orientation === "vertical" ? "vertical" : "horizontal";
    const baseOp = {
      id: String(r.id),
      floorId: String(r.floor_id),
      roomId: String(r.room_id || ""),
      kind: r.kind || "door",
      wall: r.wall || "top",
      x: Number(r.x),
      y: Number(r.y),
      length: Number(r.length || 85),
      orientation: orient,
      angleDeg: r.angle_deg !== void 0 && r.angle_deg !== null ? Number(r.angle_deg) : orient === "vertical" ? 90 : 0,
      swingDir: r.swing_dir || "in_left",
      label: String(r.label || ""),
      contactEntityId: String(r.contact_entity_id || "")
    };
    return {
      ...baseOp,
      metadata: parseMetadataJson(r.metadata_json, "opening", baseOp)
    };
  });
  const connectors = ctx.db.query("SELECT * FROM floor_connectors ORDER BY id ASC").map((r) => {
    const baseConn = {
      id: String(r.id),
      label: String(r.label || "Treppe"),
      kind: r.kind || "stairs",
      fromFloorId: String(r.from_floor_id || "eg"),
      toFloorId: String(r.to_floor_id || "og"),
      x: Number(r.x || 600),
      y: Number(r.y || 120),
      width: Number(r.width || 95),
      height: Number(r.height || 170),
      rotationDeg: Number(r.rotation_deg || 0),
      notes: String(r.notes || "")
    };
    return {
      ...baseConn,
      metadata: parseMetadataJson(r.metadata_json, "connector", baseConn)
    };
  });
  const devices = ctx.db.query("SELECT * FROM floor_devices ORDER BY id ASC").map((r) => {
    const baseDev = {
      id: String(r.id),
      floorId: String(r.floor_id),
      roomId: String(r.room_id || ""),
      label: String(r.label),
      category: r.category || "switch",
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width || 148),
      height: Number(r.height || 44),
      rotationDeg: Number(r.rotation_deg || 0),
      sourceType: r.source_type === "thassi_app" ? "thassi_app" : "ha_entity",
      primaryEntityId: String(r.primary_entity_id || ""),
      secondaryEntityId: String(r.secondary_entity_id || ""),
      targetAppId: String(r.target_app_id || ""),
      notes: String(r.notes || "")
    };
    return {
      ...baseDev,
      metadata: parseMetadataJson(r.metadata_json, "device", baseDev)
    };
  });
  return { floors, rooms, openings, connectors, devices };
}
function inferCategoryFromEntity(e) {
  const id = e.entity_id.toLowerCase();
  const domain = id.split(".")[0];
  const unit = String(e.attributes?.unit_of_measurement || "");
  if (domain === "light") return "light";
  if (domain === "camera") return "camera";
  if (domain === "media_player") return "media";
  if (domain === "binary_sensor") {
    if (id.includes("motion") || id.includes("bewegung") || id.includes("presence")) {
      return "motion";
    }
    return "switch";
  }
  if (domain === "switch") {
    if (id.includes("licht") || id.includes("beleuchtung") || id.includes("light")) {
      return "light";
    }
    if (id.includes("pumpe") || id.includes("wasch") || id.includes("maschine")) {
      return "appliance";
    }
    return "switch";
  }
  if (unit === "\xB0C" || unit === "%" && (id.includes("feucht") || id.includes("humidity"))) {
    return "climate";
  }
  if (unit === "W" || unit === "kW" || unit === "kWh" || unit === "Wh") {
    return "power";
  }
  if (id.includes("epson") || id.includes("brother") || id.includes("printer")) {
    return "printer_2d";
  }
  return "power";
}
function inferRoomHint(entityId, friendlyName) {
  const combined = `${entityId} ${friendlyName}`.toLowerCase();
  if (combined.includes("buro") || combined.includes("b\xFCro") || combined.includes("e4b32331dde0")) {
    return "B\xFCro OG";
  }
  if (combined.includes("wohnk") || combined.includes("samsung")) {
    return "Wohnk\xFCche";
  }
  if (combined.includes("vorzimmer")) {
    return "Vorzimmer OG";
  }
  if (combined.includes("gaeste") || combined.includes("g\xE4ste") || combined.includes("c049ef8a3a78")) {
    return "G\xE4stezimmer OG";
  }
  if (combined.includes("bad") || combined.includes("7c2c676dc6fc") || combined.includes("smart_series")) {
    return "Bad OG";
  }
  if (combined.includes("stiegenhaus") || combined.includes("19ca")) {
    return "Stiegenhaus";
  }
  if (combined.includes("garten") || combined.includes("outdoor") || combined.includes("eingang")) {
    return "Au\xDFen / Eingang";
  }
  return "Allgemein";
}
async function buildCatalogAndLiveTelemetry(ctx) {
  let states = [];
  try {
    states = await ctx.ha.getStates();
  } catch {
    states = [];
  }
  const stateMap = new Map(states.map((s) => [s.entity_id, s]));
  const liveMap = {};
  const catalog = [];
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const knownPairs = {
    "light.buro_og_grosses_licht": "sensor.links_power",
    "switch.buro_og_regal_lichter": "sensor.shellyplugsg3_e4b063e4bfd8_power",
    "switch.buro_og_plug_90": "sensor.kleines_licht_pumpe_power",
    "switch.buro_og_bewasserung_pumpe": "sensor.schalter_neu_power",
    "light.thomasbuero_2pm_oben_output_1": "sensor.thomasbuero_2pm_oben_switch_1_power",
    "sensor.shellyhtg3_e4b32331dde0_temperatur": "sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit",
    "switch.wohnkueche_bodenbeleuchtung_boden": "sensor.shelly_plus_2pm_a_switch_0_power",
    "switch.wohnkueche_fensterbank_licht": "sensor.bodenbeleuchtung_power",
    "switch.shelly2pmg3_8cbfea9ac754_output_0": "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung",
    "switch.shelly2pmg3_8cbfea9ac754_output_1": "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung",
    "switch.shelly1pmminig4_7c2c676dc6fc": "sensor.shelly1pmminig4_7c2c676dc6fc_leistung",
    "switch.gaestezimmer_schalter_rechts": "sensor.shellyplus2pm_c049ef8a3a78_switch_0_power",
    "switch.shellyplus2pm_c049ef8a3a78_switch_1": "sensor.shellyplus2pm_c049ef8a3a78_switch_1_power",
    "binary_sensor.shelly_blu_motion_19ca_bewegung": "sensor.shelly_blu_motion_19ca_beleuchtungsstarke",
    "sensor.epson_xp_7100_series": "sensor.epson_xp_7100_series_black_ink"
  };
  const print3dSummary = ctx.sharedDb.kvGet("thassi_3dprint_summary") || {};
  const visionSummary = ctx.sharedDb.kvGet("camera_vision_today") || {};
  const healthSummary = ctx.sharedDb.kvGet("google_health_today") || {};
  const mealsSummary = ctx.sharedDb.kvGet("meal_planner_today") || {};
  const financeSummary = ctx.sharedDb.kvGet("finance_summary") || {};
  const pcStatus = PcAgentReverseBridge.latestStatus;
  const thassiSources = [
    {
      id: "thassi:pc-bridge",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "workstation",
      label: "Workstation DESKTOP-M8TJERB (PC-Bridge & KVM)",
      roomHint: "B\xFCro OG",
      state: pcStatus ? `CPU ${pcStatus.cpuPercent ?? 0}%` : "Bereit (WOL/Bridge)",
      unit: "",
      pairedEntityId: "",
      pairedValue: pcStatus?.memory ? `RAM ${pcStatus.memory.usedGb}/${pcStatus.memory.totalGb} GB` : "3 Monitore",
      pairedUnit: "",
      targetAppId: "workflows",
      controllable: false,
      isOn: Boolean(pcStatus)
    },
    {
      id: "thassi:3d-print",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "printer_3d",
      label: "BambuLab 3D-Druck Studio (P1S / X1C)",
      roomHint: "B\xFCro OG",
      state: String(print3dSummary.printerState || print3dSummary.status || "Bereit"),
      unit: "",
      pairedEntityId: "sensor.shellyplugsg3_e4b063e4bfd8_power",
      pairedValue: print3dSummary.activeProjectTitle ? `${print3dSummary.activeProjectTitle} (${print3dSummary.progressPct || 0}%)` : "Kein aktiver Druck",
      pairedUnit: "",
      targetAppId: "3d-print",
      controllable: false,
      isOn: Boolean(print3dSummary.isPrinting)
    },
    {
      id: "thassi:camera-vision",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "camera",
      label: "Camera Vision KI-Objekterkennung (6 Kameras)",
      roomHint: "Au\xDFen / Eingang",
      state: `${visionSummary.totalDetectionsToday ?? 0} Erkennungen`,
      unit: "",
      pairedEntityId: "",
      pairedValue: `${visionSummary.onlineCameras ?? 6} Kameras aktiv`,
      pairedUnit: "",
      targetAppId: "camera-vision",
      controllable: false,
      isOn: true
    },
    {
      id: "thassi:fritzbox",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "thassi_app",
      label: "FRITZ!Box 6890 LTE & WLAN-Mesh (Obi-WLAN Kenobi)",
      roomHint: "Stiegenhaus",
      state: stateMap.get("sensor.pixel_10_wifi_connection")?.state || "Obi-WLAN Kenobi",
      unit: "",
      pairedEntityId: "sensor.pixel_10_wifi_signal_strength",
      pairedValue: stateMap.get("sensor.pixel_10_wifi_signal_strength")?.state ? `${stateMap.get("sensor.pixel_10_wifi_signal_strength")?.state} dBm` : "192.168.188.1",
      pairedUnit: "",
      targetAppId: "workflows",
      controllable: false,
      isOn: true
    },
    {
      id: "thassi:health",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "thassi_app",
      label: "Pixel 10 & Pixel Watch Biometrie (Thassi Health)",
      roomHint: "G\xE4stezimmer OG",
      state: `${healthSummary.steps ?? stateMap.get("sensor.pixel_10_steps")?.state ?? 0} Schritte`,
      unit: "",
      pairedEntityId: "sensor.pixel_10_battery_level",
      pairedValue: `Puls ${healthSummary.heartRateBpm ?? "\u2014"} bpm \xB7 Akku ${stateMap.get("sensor.pixel_10_battery_level")?.state ?? "\u2014"}%`,
      pairedUnit: "",
      targetAppId: "google-health",
      controllable: false,
      isOn: true
    },
    {
      id: "thassi:meals",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "thassi_app",
      label: "Ern\xE4hrungs- & Wochenplan (Thassi Meals)",
      roomHint: "Wohnk\xFCche",
      state: `${mealsSummary.totalKcal ?? 0} kcal`,
      unit: "",
      pairedEntityId: "",
      pairedValue: `${mealsSummary.plannedCount ?? 0} Mahlzeiten heute`,
      pairedUnit: "",
      targetAppId: "meal-planner",
      controllable: false,
      isOn: true
    },
    {
      id: "thassi:finance",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "thassi_app",
      label: "Finanz-Tresor & Cashflow (thassi.finances)",
      roomHint: "B\xFCro OG",
      state: financeSummary.currentBalance !== void 0 ? `${Number(financeSummary.currentBalance).toFixed(2)} \u20AC` : "Aktiv",
      unit: "",
      pairedEntityId: "",
      pairedValue: financeSummary.monthExpenses !== void 0 ? `Monat: ${Number(financeSummary.monthExpenses).toFixed(0)} \u20AC` : "Sparkasse George",
      pairedUnit: "",
      targetAppId: "finance-analytics",
      controllable: false,
      isOn: true
    },
    {
      id: "thassi:energy.awattar",
      sourceType: "thassi_app",
      domain: "thassi",
      suggestedCategory: "power",
      label: "aWATTar \xD6sterreich EPEX-Spot Stromtarif",
      roomHint: "Stiegenhaus",
      state: "EPEX Spot AT",
      unit: "",
      pairedEntityId: "",
      pairedValue: "St\xFCndlicher B\xF6rsenstrompreis",
      pairedUnit: "",
      targetAppId: "workflows",
      controllable: false,
      isOn: true
    }
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
      summaryText: `${ts.state}${ts.pairedValue ? ` \xB7 ${ts.pairedValue}` : ""}`,
      updatedAt: nowIso
    };
  }
  const allowedDomains = /* @__PURE__ */ new Set([
    "light",
    "switch",
    "sensor",
    "binary_sensor",
    "camera",
    "media_player",
    "climate"
  ]);
  for (const st of states) {
    const domain = st.entity_id.split(".")[0];
    if (!allowedDomains.has(domain)) continue;
    const unit = String(st.attributes?.unit_of_measurement || "");
    const friendly = String(st.attributes?.friendly_name || st.entity_id);
    const controllable = domain === "light" || domain === "switch" || domain === "media_player";
    const isOn = st.state === "on" || st.state === "playing" || st.state === "recording" || st.state === "streaming";
    const pairedId = knownPairs[st.entity_id] || "";
    const pairedSt = pairedId ? stateMap.get(pairedId) : void 0;
    const pairedVal = pairedSt && pairedSt.state !== "unavailable" && pairedSt.state !== "unknown" ? String(pairedSt.state) : "";
    const pairedUnit = pairedSt ? String(pairedSt.attributes?.unit_of_measurement || "") : "";
    const item = {
      id: st.entity_id,
      sourceType: "ha_entity",
      domain,
      suggestedCategory: inferCategoryFromEntity(st),
      label: friendly,
      roomHint: inferRoomHint(st.entity_id, friendly),
      state: String(st.state),
      unit,
      pairedEntityId: pairedId,
      pairedValue: pairedVal,
      pairedUnit,
      targetAppId: domain === "camera" ? "camera-vision" : "smart-canvas",
      controllable,
      isOn
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
      summaryText: `${st.state}${unit ? ` ${unit}` : ""}${pairedVal ? ` \xB7 ${pairedVal}${pairedUnit ? ` ${pairedUnit}` : ""}` : ""}`,
      updatedAt: st.last_updated || nowIso,
      attributes: st.attributes
    };
  }
  return { catalog, liveMap };
}
function pointInPolygon(pt, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function computePolygonAreaM2(points) {
  if (!points || points.length < 3) return 0;
  let areaPx2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    areaPx2 += p1.x * p2.y - p2.x * p1.y;
  }
  return Number((Math.abs(areaPx2) / 2 / 1e4).toFixed(2));
}
function resolveSpatialObject(state, identifier) {
  const q = String(identifier || "").trim().toLowerCase();
  if (!q) return null;
  const floorElevMap = /* @__PURE__ */ new Map();
  for (const fl of state.floors) {
    floorElevMap.set(fl.id, Number(fl.elevationMeters ?? 0));
  }
  const matchesMeta = (meta) => {
    if (!meta) return false;
    const candidates = [meta.guid, meta.hassId, meta.thassiId, meta.mac, meta.zoneCode];
    return candidates.some((c) => typeof c === "string" && c.toLowerCase() === q);
  };
  for (const dev of state.devices) {
    if (dev.id.toLowerCase() === q || dev.label.toLowerCase() === q || dev.primaryEntityId.toLowerCase() === q || matchesMeta(dev.metadata)) {
      return {
        id: dev.id,
        kind: "device",
        label: dev.label,
        floorId: dev.floorId,
        x: dev.x,
        y: dev.y,
        zMeters: floorElevMap.get(dev.floorId) ?? 0,
        metadata: dev.metadata || {}
      };
    }
  }
  for (const r of state.rooms) {
    if (r.id.toLowerCase() === q || r.name.toLowerCase() === q || r.zoneCode.toLowerCase() === q || matchesMeta(r.metadata)) {
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);
      return {
        id: r.id,
        kind: "room",
        label: r.name,
        floorId: r.floorId,
        x: cx,
        y: cy,
        zMeters: floorElevMap.get(r.floorId) ?? 0,
        metadata: r.metadata || {}
      };
    }
  }
  for (const op of state.openings) {
    if (op.id.toLowerCase() === q || op.label.toLowerCase() === q || matchesMeta(op.metadata)) {
      return {
        id: op.id,
        kind: "opening",
        label: op.label || op.id,
        floorId: op.floorId,
        x: op.x,
        y: op.y,
        zMeters: floorElevMap.get(op.floorId) ?? 0,
        metadata: op.metadata || {}
      };
    }
  }
  for (const fc of state.connectors) {
    if (fc.id.toLowerCase() === q || fc.label.toLowerCase() === q || matchesMeta(fc.metadata)) {
      return {
        id: fc.id,
        kind: "connector",
        label: fc.label,
        floorId: fc.fromFloorId,
        x: Math.round(fc.x + fc.width / 2),
        y: Math.round(fc.y + fc.height / 2),
        zMeters: floorElevMap.get(fc.fromFloorId) ?? 0,
        metadata: fc.metadata || {}
      };
    }
  }
  return null;
}
function computeDistanceBetween(state, idA, idB) {
  const objA = resolveSpatialObject(state, idA);
  const objB = resolveSpatialObject(state, idB);
  if (!objA || !objB) return null;
  const dxMeters = Number(((objB.x - objA.x) / 100).toFixed(2));
  const dyMeters = Number(((objB.y - objA.y) / 100).toFixed(2));
  const dzMeters = Number((objB.zMeters - objA.zMeters).toFixed(2));
  const dist2d = Number(Math.hypot(dxMeters, dyMeters).toFixed(2));
  const dist3d = Number(Math.hypot(dxMeters, dyMeters, dzMeters).toFixed(2));
  const bearingDeg = Math.round((Math.atan2(dyMeters, dxMeters) * 180 / Math.PI + 360) % 360);
  const sameFloor = objA.floorId === objB.floorId;
  const rssi1m = Number(objA.metadata?.beacon?.rssiAt1m ?? objB.metadata?.beacon?.rssiAt1m ?? -59);
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
    withinBeaconRange: dist3d <= maxBeaconRange
  };
}
function computeObjectsInRoom(state, roomIdentifier) {
  const q = String(roomIdentifier || "").trim().toLowerCase();
  if (!q) return null;
  const room = state.rooms.find(
    (r) => r.id.toLowerCase() === q || r.name.toLowerCase() === q || r.zoneCode.toLowerCase() === q || String(r.metadata?.guid || "").toLowerCase() === q || String(r.metadata?.thassiId || "").toLowerCase() === q
  );
  if (!room) return null;
  const poly = Array.isArray(room.points) && room.points.length >= 3 ? room.points : rectToPoints(room.x, room.y, room.width, room.height);
  const matchedDevices = state.devices.filter((d) => d.floorId === room.floorId).map((d) => {
    const insidePolygon = pointInPolygon({ x: d.x, y: d.y }, poly);
    const assignedToRoom = d.roomId === room.id;
    return {
      ...d,
      insidePolygon,
      assignedToRoom
    };
  }).filter((d) => d.insidePolygon || d.assignedToRoom);
  const matchedOpenings = state.openings.filter((op) => {
    if (op.floorId !== room.floorId) return false;
    if (op.roomId === room.id) return true;
    return op.x >= room.x - 25 && op.x <= room.x + room.width + 25 && op.y >= room.y - 25 && op.y <= room.y + room.height + 25;
  });
  const matchedConnectors = state.connectors.filter((fc) => {
    if (fc.fromFloorId !== room.floorId && fc.toFloorId !== room.floorId) return false;
    const cx = fc.x + fc.width / 2;
    const cy = fc.y + fc.height / 2;
    return pointInPolygon({ x: cx, y: cy }, poly);
  });
  const beacons = matchedDevices.filter((d) => Boolean(d.metadata?.beacon?.enabled || d.metadata?.mac)).map((d) => ({
    id: d.id,
    label: d.label,
    kind: d.category,
    x: d.x,
    y: d.y,
    beaconConfig: d.metadata?.beacon || {},
    metadata: d.metadata || {}
  }));
  return {
    room: {
      id: room.id,
      name: room.name,
      zoneCode: room.zoneCode,
      floorId: room.floorId,
      areaM2: computePolygonAreaM2(poly),
      metadata: room.metadata || {}
    },
    devices: matchedDevices,
    openings: matchedOpenings,
    connectors: matchedConnectors,
    beacons
  };
}
function saveFloorplanSummaryToSharedDb(ctx) {
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
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  ctx.sharedDb.kvSet("floorplan_summary", summary);
  ctx.sharedDb.kvSet("floorplan_spatial_graph", {
    ...state,
    updatedAt: summary.updatedAt
  });
  return summary;
}
var index_default = defineThassiApp(async (ctx) => {
  ensureSchemaAndSeed(ctx);
  saveFloorplanSummaryToSharedDb(ctx);
  ctx.route("GET", "/bootstrap", async (_req, c) => {
    const { floors, rooms, openings, connectors, devices } = loadPersistedState(c);
    const { catalog, liveMap } = await buildCatalogAndLiveTelemetry(c);
    for (const dv of devices) {
      if (dv.primaryEntityId && dv.secondaryEntityId && liveMap[dv.primaryEntityId] && liveMap[dv.secondaryEntityId]) {
        const sec = liveMap[dv.secondaryEntityId];
        liveMap[dv.primaryEntityId] = {
          ...liveMap[dv.primaryEntityId],
          secondaryValue: sec.state,
          secondaryUnit: sec.unit
        };
      }
    }
    const ext = c.sharedDb.kvGet("floorplan_cad_extensions_v1");
    const payload = {
      floors,
      rooms,
      openings,
      connectors,
      devices,
      customWalls: ext?.customWalls && ext.customWalls.length > 0 ? ext.customWalls : BLUEPRINT_WALLS,
      customLabels: ext?.customLabels || BLUEPRINT_LABELS,
      wires: ext?.wires || BLUEPRINT_WIRES,
      catalog,
      liveMap,
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return payload;
  });
  ctx.route("GET", "/live", async (_req, c) => {
    const { devices } = loadPersistedState(c);
    const { liveMap } = await buildCatalogAndLiveTelemetry(c);
    for (const dv of devices) {
      if (dv.primaryEntityId && dv.secondaryEntityId && liveMap[dv.primaryEntityId] && liveMap[dv.secondaryEntityId]) {
        const sec = liveMap[dv.secondaryEntityId];
        liveMap[dv.primaryEntityId] = {
          ...liveMap[dv.primaryEntityId],
          secondaryValue: sec.state,
          secondaryUnit: sec.unit
        };
      }
    }
    return { liveMap, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  });
  ctx.route("POST", "/save", async (req, c) => {
    const body = req.body || {};
    const prevExt = c.sharedDb.kvGet("floorplan_cad_extensions_v1") || {};
    c.sharedDb.kvSet("floorplan_cad_extensions_v1", {
      customWalls: Array.isArray(body.customWalls) ? body.customWalls : prevExt.customWalls || [],
      customLabels: Array.isArray(body.customLabels) ? body.customLabels : prevExt.customLabels || BLUEPRINT_LABELS,
      wires: Array.isArray(body.wires) ? body.wires : prevExt.wires || BLUEPRINT_WIRES
    });
    ensureSchemaAndSeed(c);
    if (Array.isArray(body.floors)) {
      c.db.execute("DELETE FROM floor_levels");
      for (const fl of body.floors) {
        c.db.execute(
          `INSERT INTO floor_levels (id, name, subtitle, elevation_meters, grid_size_px, scale_px_per_meter, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            fl.id,
            fl.name || fl.id,
            fl.subtitle || "",
            Number(fl.elevationMeters ?? 0),
            Number(fl.gridSizePx || 20),
            Number(fl.scalePxPerMeter || 100),
            Number(fl.sortOrder || 1)
          ]
        );
      }
    }
    if (Array.isArray(body.rooms)) {
      c.db.execute("DELETE FROM floor_rooms");
      for (const r of body.rooms) {
        const pts = Array.isArray(r.points) && r.points.length >= 3 ? r.points.map((pt) => ({
          x: Math.round(Number(pt.x || 0)),
          y: Math.round(Number(pt.y || 0))
        })) : rectToPoints(
          Math.round(Number(r.x || 0)),
          Math.round(Number(r.y || 0)),
          Math.max(40, Math.round(Number(r.width || 200))),
          Math.max(40, Math.round(Number(r.height || 200)))
        );
        const bbox = computeBoundingBox(pts);
        const metaObj = r.metadata && typeof r.metadata === "object" ? r.metadata : buildDefaultMetadata("room", r);
        c.db.execute(
          `INSERT INTO floor_rooms (id, floor_id, name, zone_code, x, y, width, height, points_json, wall_thickness, temp_entity_id, humidity_entity_id, notes, sort_order, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.floorId || "og",
            r.name || "Raum",
            r.zoneCode || "",
            bbox.x,
            bbox.y,
            bbox.width,
            bbox.height,
            JSON.stringify(pts),
            Number(r.wallThickness || 10),
            r.tempEntityId || "",
            r.humidityEntityId || "",
            r.notes || "",
            Number(r.sortOrder || 1),
            JSON.stringify(metaObj)
          ]
        );
      }
    }
    if (Array.isArray(body.openings)) {
      c.db.execute("DELETE FROM floor_openings");
      for (const op of body.openings) {
        const orient = op.orientation === "vertical" ? "vertical" : "horizontal";
        const metaObj = op.metadata && typeof op.metadata === "object" ? op.metadata : buildDefaultMetadata("opening", op);
        c.db.execute(
          `INSERT INTO floor_openings (id, floor_id, room_id, kind, wall, x, y, length, orientation, angle_deg, swing_dir, label, contact_entity_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            op.id,
            op.floorId || "og",
            op.roomId || "",
            op.kind || "door",
            op.wall || "top",
            Math.round(Number(op.x || 0)),
            Math.round(Number(op.y || 0)),
            Math.max(30, Math.round(Number(op.length || 85))),
            orient,
            Number(op.angleDeg ?? (orient === "vertical" ? 90 : 0)),
            op.swingDir || "in_left",
            op.label || "",
            op.contactEntityId || "",
            JSON.stringify(metaObj)
          ]
        );
      }
    }
    if (Array.isArray(body.connectors)) {
      c.db.execute("DELETE FROM floor_connectors");
      for (const fc of body.connectors) {
        const metaObj = fc.metadata && typeof fc.metadata === "object" ? fc.metadata : buildDefaultMetadata("connector", fc);
        c.db.execute(
          `INSERT INTO floor_connectors (id, label, kind, from_floor_id, to_floor_id, x, y, width, height, rotation_deg, notes, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fc.id,
            fc.label || "Treppe",
            fc.kind || "stairs",
            fc.fromFloorId || "eg",
            fc.toFloorId || "og",
            Math.round(Number(fc.x || 600)),
            Math.round(Number(fc.y || 120)),
            Math.max(40, Math.round(Number(fc.width || 95))),
            Math.max(40, Math.round(Number(fc.height || 170))),
            Number(fc.rotationDeg || 0),
            fc.notes || "",
            JSON.stringify(metaObj)
          ]
        );
      }
    }
    if (Array.isArray(body.devices)) {
      c.db.execute("DELETE FROM floor_devices");
      for (const dv of body.devices) {
        const metaObj = dv.metadata && typeof dv.metadata === "object" ? dv.metadata : buildDefaultMetadata("device", dv);
        c.db.execute(
          `INSERT INTO floor_devices (id, floor_id, room_id, label, category, x, y, width, height, rotation_deg, source_type, primary_entity_id, secondary_entity_id, target_app_id, notes, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dv.id,
            dv.floorId || "og",
            dv.roomId || "",
            dv.label || "Ger\xE4t",
            dv.category || "switch",
            Math.round(Number(dv.x || 0)),
            Math.round(Number(dv.y || 0)),
            Math.max(70, Math.round(Number(dv.width || 148))),
            Math.max(28, Math.round(Number(dv.height || 44))),
            Number(dv.rotationDeg || 0),
            dv.sourceType === "thassi_app" ? "thassi_app" : "ha_entity",
            dv.primaryEntityId || "",
            dv.secondaryEntityId || "",
            dv.targetAppId || "",
            dv.notes || "",
            JSON.stringify(metaObj)
          ]
        );
      }
    }
    const summary = saveFloorplanSummaryToSharedDb(c);
    await c.ha.publishSensor(
      "thassi_floorplan_status",
      `${summary.floorCount} Geschosse \xB7 ${summary.roomCount} R\xE4ume \xB7 ${summary.deviceCount} Ger\xE4te (${summary.beaconCount} Beacons)`,
      {
        friendly_name: "Thassi 2D Grundriss & Raumplaner",
        icon: "mdi:floor-plan",
        ...summary
      }
    );
    return {
      ok: true,
      savedAt: summary.updatedAt,
      ...loadPersistedState(c)
    };
  });
  ctx.route("POST", "/spatial/axon-exec", async (req, c) => {
    const body = req.body || {};
    const state = loadPersistedState(c);
    const fnName = String(body.fn || "").trim();
    const args = Array.isArray(body.args) ? body.args : [];
    if (fnName === "DistanceBetween" || fnName === "distanceBetween") {
      const a = String(args[0] ?? body.objectAId ?? "");
      const b = String(args[1] ?? body.objectBId ?? "");
      const result = computeDistanceBetween(state, a, b);
      if (!result) {
        return {
          status: 404,
          body: { error: `Objekt "${a}" oder "${b}" im Grundriss nicht gefunden.` }
        };
      }
      return {
        ok: true,
        fn: "DistanceBetween",
        expression: `DistanceBetween("${a}", "${b}")`,
        result
      };
    }
    if (fnName === "objectsInRoom" || fnName === "ObjectsInRoom") {
      const roomId = String(args[0] ?? body.roomId ?? "");
      const result = computeObjectsInRoom(state, roomId);
      if (!result) {
        return {
          status: 404,
          body: { error: `Raum "${roomId}" im Grundriss nicht gefunden.` }
        };
      }
      return {
        ok: true,
        fn: "objectsInRoom",
        expression: `objectsInRoom("${roomId}")`,
        result
      };
    }
    if (fnName === "beaconsInRange" || fnName === "nearestBeacons") {
      const targetId = String(args[0] ?? body.objectAId ?? "");
      const maxMeters = Number(args[1] ?? 10);
      const origin = resolveSpatialObject(state, targetId);
      if (!origin) {
        return {
          status: 404,
          body: { error: `Ursprungsobjekt "${targetId}" nicht gefunden.` }
        };
      }
      const matches = state.devices.filter((d) => d.id !== origin.id && Boolean(d.metadata?.beacon?.enabled || d.metadata?.mac)).map((d) => computeDistanceBetween(state, origin.id, d.id)).filter((r) => Boolean(r) && r.distance3dMeters <= maxMeters).sort((a, b) => a.distance3dMeters - b.distance3dMeters);
      return {
        ok: true,
        fn: "beaconsInRange",
        expression: `beaconsInRange("${targetId}", ${maxMeters})`,
        result: {
          origin,
          maxMeters,
          count: matches.length,
          beacons: matches
        }
      };
    }
    return {
      status: 400,
      body: {
        error: `Unbekannte r\xE4umliche Axon-Funktion "${fnName}". Unterst\xFCtzt: DistanceBetween(a, b), objectsInRoom(roomId), beaconsInRange(id, maxMeters).`
      }
    };
  });
  ctx.route("POST", "/device/control", async (req, c) => {
    const body = req.body || {};
    const entityId = String(body.entityId || "").trim();
    if (!entityId) {
      return { status: 400, body: { error: "entityId fehlt" } };
    }
    const domain = entityId.split(".")[0];
    if (!["light", "switch", "media_player", "script", "automation"].includes(domain)) {
      return { status: 400, body: { error: `Dom\xE4ne "${domain}" ist nicht direkt schaltbar.` } };
    }
    const service = body.action === "turn_on" ? "turn_on" : body.action === "turn_off" ? "turn_off" : domain === "media_player" ? "media_play_pause" : "toggle";
    await c.ha.callService(domain, service, { entity_id: entityId });
    const { liveMap } = await buildCatalogAndLiveTelemetry(c);
    return {
      ok: true,
      entityId,
      service,
      live: liveMap[entityId] || null,
      liveMap
    };
  });
  ctx.route("POST", "/clear", async (_req, c) => {
    ensureSchemaAndSeed(c);
    c.db.execute("DELETE FROM floor_rooms");
    c.db.execute("DELETE FROM floor_openings");
    c.db.execute("DELETE FROM floor_connectors");
    c.db.execute("DELETE FROM floor_devices");
    const summary = saveFloorplanSummaryToSharedDb(c);
    const { catalog, liveMap } = await buildCatalogAndLiveTelemetry(c);
    return {
      ok: true,
      savedAt: summary.updatedAt,
      ...loadPersistedState(c),
      catalog,
      liveMap
    };
  });
  ctx.route("POST", "/reset-defaults", async (_req, c) => {
    seedDefaults(c);
    c.sharedDb.kvSet("floorplan_cad_extensions_v1", {
      customWalls: BLUEPRINT_WALLS,
      customLabels: BLUEPRINT_LABELS,
      wires: BLUEPRINT_WIRES
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
      liveMap
    };
  });
  ctx.route("GET", "/model/obj", async () => {
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1 });
    return {
      obj: exportHouseWavefrontObj(model),
      triangleCount: model.triangleCount,
      vertexCount: model.vertexCount
    };
  });
  ctx.route("GET", "/model/gltf", async () => {
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1 });
    return JSON.parse(exportHouseGltfJson(model));
  });
  ctx.route("GET", "/model/json", async (_req, c) => {
    const state = loadPersistedState(c);
    const model = compileHouse3DModel({ includeRoof: true, wallCutawayRatio: 1 });
    return {
      outerDimensionsMeters: {
        width: 11.9,
        depth: 16.9,
        egClearHeight: 3,
        ogClearHeight: 2.6,
        ridgeHeight: 9.25
      },
      plausibilityChecks: PLAUSIBILITY_CHECKS,
      ...state,
      meshStats: {
        triangleCount: model.triangleCount,
        vertexCount: model.vertexCount
      }
    };
  });
});
export {
  index_default as default
};
