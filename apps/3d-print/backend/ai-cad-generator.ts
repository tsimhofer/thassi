import fs from 'node:fs';
import {
  compileSceneToMesh,
  DEFAULT_PRINT_PROFILE,
  parseGlbBufferToMeshData,
  PRESET_TEMPLATES,
  type PrimitiveNode,
  type PrimitiveType,
  type SceneSpec,
} from '../shared/mesh-engine.js';
import { translatePromptToEnglish } from './open-library-search.js';

export function discoverGeminiApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const storagePath = '/homeassistant/.storage/core.config_entries';
  try {
    if (fs.existsSync(storagePath)) {
      const raw = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
      const entries = raw?.data?.entries || [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.domain === 'google_generative_ai_conversation' && e.data?.api_key) {
          return String(e.data.api_key).trim();
        }
      }
    }
  } catch {
    // Ignore if not running inside HASS container
  }
  return '';
}

let cachedModels: string[] | null = null;

async function resolveGeminiModels(apiKey: string): Promise<string[]> {
  if (cachedModels && cachedModels.length > 0) return cachedModels;
  const preferred = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
  ];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      const available = new Set(
        (data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, ''))
      );
      const matched = preferred.filter((c) => available.has(c));
      if (matched.length > 0) {
        cachedModels = matched;
        return matched;
      }
    }
  } catch {
    // Ignore network timeout
  }
  return ['gemini-2.5-flash', 'gemini-2.0-flash'];
}

const COLOR_MAP: Array<{ pattern: RegExp; hex: string; label: string }> = [
  { pattern: /\b(rot|red|crimson|rubin|kirsch)\b/i, hex: '#e11d48', label: 'Rot' },
  { pattern: /\b(grün|gruen|green|bambu|smaragd|lime|granny)\b/i, hex: '#10b981', label: 'Grün' },
  { pattern: /\b(blau|blue|kobalt|navy|türkis|cyan|eis)\b/i, hex: '#38bdf8', label: 'Blau / Cyan' },
  { pattern: /\b(gelb|yellow|gold|amber|messing|zitrone)\b/i, hex: '#fbbf24', label: 'Gold / Gelb' },
  { pattern: /\b(orange|kupfer|copper|mandarin)\b/i, hex: '#f97316', label: 'Orange' },
  { pattern: /\b(lila|violett|purple|magenta|beere)\b/i, hex: '#a855f7', label: 'Violett' },
  { pattern: /\b(rosa|pink|koralle)\b/i, hex: '#f43f5e', label: 'Pink / Koralle' },
  { pattern: /\b(braun|holz|wood|bronze|schoko)\b/i, hex: '#b45309', label: 'Holz-Braun' },
  { pattern: /\b(weiss|weiß|white|klar|farblos|schnee)\b/i, hex: '#f8fafc', label: 'Weiß' },
  { pattern: /\b(schwarz|black|carbon|anthrazit|grau|grey|silber|titan|metall)\b/i, hex: '#94a3b8', label: 'Titan / Silber' },
];

function extractColorFromPrompt(prompt: string): { hex: string; label: string } | null {
  const hexMatch = prompt.match(/#([0-9a-fA-F]{6})\b/);
  if (hexMatch) {
    return { hex: `#${hexMatch[1]}`, label: `#${hexMatch[1]}` };
  }
  for (const c of COLOR_MAP) {
    if (c.pattern.test(prompt)) return c;
  }
  return null;
}

export const KNOWN_OBJECT_ARCHETYPE_REGEX =
  /\b(apfel|äpfel|aepfel|apple|birne|pear|tasse|kaffeetasse|teetasse|mug|becher|herz|heart|stern|star|pilz|fliegenpilz|mushroom|flasche|karaffe|bottle|schale|schüssel|schuessel|bowl|obstschale|schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|schneemann|snowman|würfel|wuerfel|cube|pyramide|pyramid|kegel|trichter|funnel|cone|donut|torus|zahnrad|gear|ritzel|getriebe|vase|blumentopf|pflanztopf|planter|pot|kelch|organizer|sortierbox|stiftehalter|kopfhörer|kopfhoerer|headphone|wandhalter|tischklemme|winkel|bracket|haken|wandhaken|hook|benchy|boot|boat|schiff|tugboat|handyhalter|phone|smartphone|tablet|dock|aufsteller|laptop|rakete|rocket|raumschiff|missile|roboter|robot|figur|männchen|miniature|statue|auto|car|fahrzeug|truck|rennauto|schlüsselanhänger|keychain|schild|tag|plakette|anhänger|coin|medaille|knauf|griff|knob|handle|drehknopf|gehäuse|gehaeuse|case|enclosure|box|dose|raspberry|esp32|kabel|cable|clip|klemme|kabelhalter)\b/i;

const INCREMENTAL_MODIFIER_ONLY_REGEX =
  /\b(höher|hoeher|breiter|kleiner|flacher|kürzer|kuerzer|größer|groesser|skalier|loch|bohrung|durchbruch|farbe|färbe|faerbe|dreh|rotier|twist|ohne\s+blatt|ohne\s+stiel|biss|abgebissen|halbiere|füge|fuege|hinzu|entferne|mehr\s+zähne|weniger\s+zähne|wandstärke|dicker|dünner)\b/i;

export function isExplicitObjectCreationPrompt(prompt: string): boolean {
  const lower = prompt.trim().toLowerCase();
  if (/\b(neues objekt|erstelle neu|komplett neu|stattdessen|generiere|erstelle|mach mir)\b/i.test(lower)) {
    return true;
  }
  if (KNOWN_OBJECT_ARCHETYPE_REGEX.test(lower) && !INCREMENTAL_MODIFIER_ONLY_REGEX.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Ensures any color is bright enough to be clearly visible on the #09090b dark canvas.
 */
function ensureHighContrastColor(hex: string | undefined, fallback = '#10b981'): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return fallback;
  const clean = hex.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 65) {
    // Boost dark colors so they never blend into #09090b canvas
    const boost = Math.min(140, 95 - lum);
    const nr = Math.min(255, Math.round(r + boost));
    const ng = Math.min(255, Math.round(g + boost));
    const nb = Math.min(255, Math.round(b + boost));
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }
  return `#${clean}`;
}

/**
 * Normalizes arbitrary or AI-generated node parameters so `mesh-engine.ts` always receives exact keys.
 */
export function normalizePrimitiveNode(raw: Partial<PrimitiveNode>, idx: number, defaultColor: string): PrimitiveNode {
  const validTypes = new Set<PrimitiveType>([
    'box',
    'cylinder',
    'sphere',
    'cone',
    'torus',
    'gear',
    'twisted_vase',
    'bracket',
    'hex_organizer',
    'apple',
    'lathe',
    'heart',
    'star',
  ]);

  const rawType = String(raw.type || 'box').toLowerCase() as PrimitiveType;
  const type: PrimitiveType = validTypes.has(rawType) ? rawType : 'box';
  const op = raw.operation === 'subtract' ? 'subtract' : 'union';
  const p: Record<string, any> = typeof raw.params === 'object' && raw.params ? { ...raw.params } : {};
  const normParams: Record<string, number> = {};

  const num = (val: unknown, fb: number, min = 0.5, max = 240): number => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fb;
    return Math.max(min, Math.min(max, n));
  };

  if (raw.type === 'stl_mesh' && Array.isArray(raw.meshData) && raw.meshData.length >= 9) {
    return {
      id: raw.id || `node-stl-${idx + 1}-${Date.now()}`,
      name: raw.name || `STL-Mesh ${idx + 1}`,
      type: 'stl_mesh',
      operation: op,
      position:
        Array.isArray(raw.position) && raw.position.length === 3
          ? [Number(raw.position[0]) || 0, Number(raw.position[1]) || 0, Number(raw.position[2]) || 0]
          : [0, 0, 0],
      rotation:
        Array.isArray(raw.rotation) && raw.rotation.length === 3
          ? [Number(raw.rotation[0]) || 0, Number(raw.rotation[1]) || 0, Number(raw.rotation[2]) || 0]
          : [0, 0, 0],
      scale:
        Array.isArray(raw.scale) && raw.scale.length === 3
          ? [
              num(raw.scale[0], 1, 0.1, 10),
              num(raw.scale[1], 1, 0.1, 10),
              num(raw.scale[2], 1, 0.1, 10),
            ]
          : [1, 1, 1],
      color: ensureHighContrastColor(raw.color, defaultColor),
      params: p,
      meshData: raw.meshData,
    };
  }

  switch (type) {
    case 'box': {
      normParams.width = num(p.width ?? p.w ?? p.x ?? p.size, 44, 2, 220);
      normParams.depth = num(p.depth ?? p.d ?? p.y ?? p.length ?? p.size, 44, 2, 220);
      normParams.height = num(p.height ?? p.h ?? p.z ?? p.thickness, 28, 1.5, 220);
      normParams.bevel = num(p.bevel ?? p.chamfer ?? p.fillet ?? p.radius, 3, 0, 25);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 0, 0, 0, 20);
      break;
    }
    case 'cylinder': {
      const baseR = num(
        p.radiusBottom ?? p.radius ?? (p.diameter ? Number(p.diameter) / 2 : undefined) ?? p.outerRadius,
        18,
        1,
        120
      );
      normParams.radiusBottom = baseR;
      normParams.radiusTop = num(p.radiusTop ?? p.radius ?? baseR, baseR, 0.8, 120);
      normParams.innerRadius = num(
        p.innerRadius ?? p.boreRadius ?? (p.innerDiameter ? Number(p.innerDiameter) / 2 : 0),
        0,
        0,
        Math.min(normParams.radiusBottom, normParams.radiusTop) - 0.8
      );
      normParams.height = num(p.height ?? p.h ?? p.length ?? p.z, 32, 1.5, 220);
      normParams.segments = num(p.segments, 40, 8, 72);
      break;
    }
    case 'cone': {
      normParams.radiusBottom = num(p.radiusBottom ?? p.radius ?? p.outerRadius, 22, 1.5, 110);
      normParams.radiusTop = num(p.radiusTop ?? p.topRadius ?? 1.5, 1.5, 0.5, 110);
      normParams.innerRadius = num(p.innerRadius ?? 0, 0, 0, normParams.radiusBottom - 1);
      normParams.height = num(p.height ?? p.h, 38, 2, 220);
      normParams.segments = num(p.segments, 36, 4, 64);
      break;
    }
    case 'sphere': {
      normParams.radius = num(p.radius ?? (p.diameter ? Number(p.diameter) / 2 : undefined) ?? 20, 20, 2, 110);
      normParams.domeOnly = p.domeOnly ? 1 : 0;
      break;
    }
    case 'torus': {
      normParams.radius = num(p.radius ?? p.majorRadius ?? p.outerRadius, 22, 4, 100);
      normParams.tubeRadius = num(p.tubeRadius ?? p.minorRadius ?? p.thickness ?? 5, 5, 1, normParams.radius - 1);
      break;
    }
    case 'gear': {
      normParams.teeth = Math.round(num(p.teeth ?? p.toothCount ?? 24, 24, 6, 72));
      normParams.outerRadius = num(
        p.outerRadius ?? p.radius ?? (p.diameter ? Number(p.diameter) / 2 : undefined),
        32,
        8,
        110
      );
      normParams.toothDepth = num(p.toothDepth ?? normParams.outerRadius * 0.15, 4.5, 1.5, 15);
      normParams.boreRadius = num(
        p.boreRadius ?? p.innerRadius ?? (p.boreDiameter ? Number(p.boreDiameter) / 2 : undefined),
        5,
        1,
        normParams.outerRadius * 0.65
      );
      normParams.height = num(p.height ?? p.thickness ?? 12, 12, 2, 80);
      break;
    }
    case 'twisted_vase': {
      normParams.radiusBottom = num(p.radiusBottom ?? p.rBottom ?? p.radius, 26, 8, 95);
      normParams.radiusTop = num(p.radiusTop ?? p.rTop ?? normParams.radiusBottom * 1.2, 32, 8, 105);
      normParams.height = num(p.height ?? p.h, 85, 20, 220);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 2.6, 2.6, 1.2, 8);
      normParams.twistDeg = num(p.twistDeg ?? p.twist ?? 90, 90, -360, 360);
      normParams.ribCount = Math.round(num(p.ribCount ?? p.ribs ?? 14, 14, 0, 36));
      normParams.ribAmplitude = num(p.ribAmplitude ?? 3.0, 3.0, 0, 10);
      break;
    }
    case 'bracket': {
      normParams.width = num(p.width ?? p.w, 38, 10, 160);
      normParams.depth = num(p.depth ?? p.d, 58, 16, 160);
      normParams.height = num(p.height ?? p.h, 68, 16, 180);
      normParams.thickness = num(p.thickness ?? p.wallThickness ?? 6.5, 6.5, 3, 20);
      normParams.lipHeight = num(p.lipHeight ?? 18, 18, 0, 60);
      break;
    }
    case 'hex_organizer': {
      normParams.width = num(p.width ?? 84, 84, 24, 220);
      normParams.depth = num(p.depth ?? 56, 56, 24, 220);
      normParams.height = num(p.height ?? 38, 38, 12, 140);
      normParams.wallThickness = num(p.wallThickness ?? 2.4, 2.4, 1.4, 6);
      normParams.slotsX = Math.round(num(p.slotsX ?? p.cols ?? 3, 3, 1, 5));
      normParams.slotsY = Math.round(num(p.slotsY ?? p.rows ?? 2, 2, 1, 4));
      break;
    }
    case 'apple': {
      normParams.radius = num(p.radius ?? 34, 34, 10, 95);
      normParams.height = num(p.height ?? 58, 58, 15, 160);
      normParams.lobeCount = Math.round(num(p.lobeCount ?? 5, 5, 0, 12));
      normParams.lobeAmplitude = num(p.lobeAmplitude ?? 1.4, 1.4, 0, 8);
      normParams.topIndent = num(p.topIndent ?? 11, 11, 2, 30);
      normParams.bottomIndent = num(p.bottomIndent ?? 5, 5, 1, 20);
      normParams.segments = Math.round(num(p.segments ?? 36, 36, 16, 64));
      break;
    }
    case 'lathe': {
      const h = num(p.height ?? p.h, 70, 12, 220);
      const rB = num(p.rBottom ?? p.radiusBottom ?? p.radius ?? 24, 24, 2, 100);
      const rL = num(p.rLower ?? rB * 1.25, rB * 1.25, 2, 110);
      const rM = num(p.rMid ?? rL * 0.95, rL * 0.95, 2, 110);
      const rU = num(p.rUpper ?? rM * 0.85, rM * 0.85, 2, 110);
      const rN = num(p.rNeck ?? rU * 0.7, rU * 0.7, 1.5, 110);
      const rT = num(p.rTop ?? p.radiusTop ?? rN, rN, 1.5, 110);
      normParams.height = h;
      normParams.rBottom = rB;
      normParams.rLower = rL;
      normParams.rMid = rM;
      normParams.rUpper = rU;
      normParams.rNeck = rN;
      normParams.rTop = rT;
      normParams.topIndent = num(p.topIndent ?? 0, 0, 0, h * 0.7);
      normParams.bottomIndent = num(p.bottomIndent ?? 0, 0, 0, h * 0.25);
      normParams.wallThickness = num(p.wallThickness ?? p.wall ?? 0, 0, 0, 12);
      normParams.lobeCount = Math.round(num(p.lobeCount ?? 0, 0, 0, 24));
      normParams.lobeAmplitude = num(p.lobeAmplitude ?? 0, 0, 0, 10);
      normParams.segments = Math.round(num(p.segments ?? 36, 36, 16, 64));
      break;
    }
    case 'heart': {
      normParams.width = num(p.width ?? 66, 66, 16, 180);
      normParams.depth = num(p.depth ?? 60, 60, 16, 180);
      normParams.height = num(p.height ?? 22, 22, 4, 90);
      normParams.bevel = num(p.bevel ?? 4, 4, 0, 18);
      break;
    }
    case 'star': {
      normParams.points = Math.round(num(p.points ?? 5, 5, 3, 14));
      normParams.outerRadius = num(p.outerRadius ?? p.radius ?? 40, 40, 10, 110);
      normParams.innerRadius = num(
        p.innerRadius ?? normParams.outerRadius * 0.44,
        normParams.outerRadius * 0.44,
        4,
        normParams.outerRadius * 0.85
      );
      normParams.height = num(p.height ?? 18, 18, 4, 80);
      break;
    }
  }

  const pos: [number, number, number] =
    Array.isArray(raw.position) && raw.position.length === 3
      ? [
          num(raw.position[0], 0, -110, 110),
          num(raw.position[1], 0, -110, 110),
          num(raw.position[2], 0, -40, 180),
        ]
      : [0, 0, 0];

  const rot: [number, number, number] =
    Array.isArray(raw.rotation) && raw.rotation.length === 3
      ? [
          Number(raw.rotation[0]) || 0,
          Number(raw.rotation[1]) || 0,
          Number(raw.rotation[2]) || 0,
        ]
      : [0, 0, 0];

  const scale: [number, number, number] =
    Array.isArray(raw.scale) && raw.scale.length === 3
      ? [
          num(raw.scale[0], 1, 0.15, 4),
          num(raw.scale[1], 1, 0.15, 4),
          num(raw.scale[2], 1, 0.15, 4),
        ]
      : [1, 1, 1];

  return {
    id: raw.id || `node-${idx + 1}-${Date.now()}`,
    name: raw.name || `Bauteil ${idx + 1}`,
    type,
    operation: op,
    position: pos,
    rotation: rot,
    scale,
    color: op === 'subtract' ? '#f43f5e' : ensureHighContrastColor(raw.color, defaultColor),
    params: normParams,
  };
}

/**
 * Deterministic Antigravity Parametric CAD synthesizer & modifier.
 * Produces rich, multi-part, immediately recognizable 3D assemblies for any prompt.
 */
export function runLocalAntigravityCadEngine(
  prompt: string,
  existingScene?: SceneSpec | null
): { scene: SceneSpec; summary: string; engine: string } {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const nowIso = new Date().toISOString();
  const colorMatch = extractColorFromPrompt(cleanPrompt);

  const isNewRequest = !existingScene || isExplicitObjectCreationPrompt(cleanPrompt);

  if (isNewRequest) {
    let baseScene: SceneSpec;
    let summary = '';
    let preserveNodeColors = false;

    if (/\b(apfel|äpfel|aepfel|apple|obst)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.organic_apple_sculpture();
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || '#e11d48';
      baseScene.printProfile.filamentColor = bodyColor;
      const bodyNode = baseScene.nodes.find((n) => n.type === 'apple') || baseScene.nodes[0];
      if (bodyNode) bodyNode.color = bodyColor;

      const sizeMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      if (sizeMatch && bodyNode) {
        const dia = Math.max(24, Math.min(200, Number(sizeMatch[1].replace(',', '.'))));
        bodyNode.params.radius = Math.round(dia / 2);
        bodyNode.params.height = Math.round(dia * 0.86);
      }

      if (/\b(ohne\s+blatt|kein\s+blatt)\b/i.test(lower)) {
        baseScene.nodes = baseScene.nodes.filter((n) => !n.id.includes('leaf'));
      }
      if (/\b(biss|abgebissen|bite)\b/i.test(lower)) {
        baseScene.nodes.push({
          id: 'node-apple-bite',
          name: 'Biss-Abzug (Seitlich)',
          type: 'sphere',
          operation: 'subtract',
          position: [31, 0, 22],
          rotation: [0, 0, 0],
          scale: [1, 1.15, 1.1],
          color: '#f43f5e',
          params: { radius: 18, domeOnly: 0 },
        });
      }

      baseScene.title =
        colorMatch && colorMatch.label !== 'Rot'
          ? `3D-Apfel (${colorMatch.label})`
          : '3D-Apfel mit Stiel & Blatt';
      baseScene.description = `Organischer 3D-Apfel generiert aus Prompt: "${cleanPrompt}"`;
      summary = `Naturgetreuer 3D-Apfel (Ø${(bodyNode?.params.radius || 34) * 2}×${(bodyNode?.params.height || 58) + 8}mm) mit Stielgrube, Stiel und Blatt generiert.`;
    } else if (/\b(birne|pear)\b/i.test(lower)) {
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || '#84cc16';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Birne mit Stiel & Blatt',
        description: `Organische 3D-Birne generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bodyColor },
        nodes: [
          {
            id: 'node-pear-body',
            name: 'Birnen-Fruchtkörper',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bodyColor,
            params: {
              height: 78,
              rBottom: 15,
              rLower: 34,
              rMid: 31,
              rUpper: 19,
              rNeck: 12,
              rTop: 6,
              topIndent: 4,
              bottomIndent: 4,
              lobeCount: 5,
              lobeAmplitude: 1.0,
              segments: 36,
            },
          },
          {
            id: 'node-pear-stem',
            name: 'Birnenstiel',
            type: 'cylinder',
            operation: 'union',
            position: [1, 0, 73],
            rotation: [0, 12, 0],
            scale: [1, 1, 1],
            color: '#b45309',
            params: { radiusBottom: 2.2, radiusTop: 3.0, height: 18, segments: 18 },
          },
          {
            id: 'node-pear-leaf',
            name: 'Birnenblatt',
            type: 'sphere',
            operation: 'union',
            position: [11, 0, 81],
            rotation: [15, -25, 10],
            scale: [1.7, 0.75, 0.22],
            color: '#10b981',
            params: { radius: 8.5, domeOnly: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Organische 3D-Birne (Ø68×91mm) mit Stiel und Blatt erstellt.';
    } else if (/\b(benchy|boot|boat|schiff|tugboat|dampfer|kutter)\b/i.test(lower)) {
      preserveNodeColors = true;
      const hullColor = colorMatch?.hex || '#38bdf8';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3DBenchy — Schiffsmodell mit Kabine & Schornstein',
        description: `Mehrteiliges Boot-Benchmarkmodell generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: hullColor },
        nodes: [
          {
            id: 'node-boat-hull-lower',
            name: 'Schiffsrumpf (Unterwasserschiff)',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 60, depth: 31, height: 13, bevel: 8, wallThickness: 0 },
          },
          {
            id: 'node-boat-hull-deck',
            name: 'Oberdeck & Bordwand',
            type: 'box',
            operation: 'union',
            position: [2, 0, 11],
            rotation: [0, -3, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 66, depth: 34, height: 8, bevel: 9, wallThickness: 3.2 },
          },
          {
            id: 'node-boat-bow',
            name: 'Bugspitze (Vorsteven)',
            type: 'cone',
            operation: 'union',
            position: [28, 0, 11],
            rotation: [0, 72, 0],
            scale: [0.65, 1.0, 1.0],
            color: hullColor,
            params: { radiusBottom: 15, radiusTop: 2, height: 18, segments: 24 },
          },
          {
            id: 'node-boat-cabin',
            name: 'Steuerhaus / Brücke',
            type: 'box',
            operation: 'union',
            position: [3, 0, 16],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f8fafc',
            params: { width: 26, depth: 24, height: 22, bevel: 3.5, wallThickness: 3.0 },
          },
          {
            id: 'node-boat-roof',
            name: 'Kabinen-Dachschild',
            type: 'box',
            operation: 'union',
            position: [3, 0, 37],
            rotation: [0, -4, 0],
            scale: [1, 1, 1],
            color: hullColor,
            params: { width: 31, depth: 28, height: 4, bevel: 3, wallThickness: 0 },
          },
          {
            id: 'node-boat-chimney',
            name: 'Schräger Dampfer-Schornstein',
            type: 'cylinder',
            operation: 'union',
            position: [9, 0, 39],
            rotation: [0, 22, 0],
            scale: [1, 1, 1],
            color: '#f97316',
            params: { radiusBottom: 4.5, radiusTop: 5.2, innerRadius: 2.6, height: 14, segments: 28 },
          },
          {
            id: 'node-boat-window',
            name: 'Brückenfenster-Durchbruch',
            type: 'cylinder',
            operation: 'subtract',
            position: [3, 0, 27],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#f43f5e',
            params: { radiusBottom: 6.5, radiusTop: 6.5, height: 32, segments: 24 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Mehrteiliges 3DBenchy-Schiffsmodell (74×34×52mm) mit Rumpf, Steuerhaus, Brückenfenster und geneigtem Schornstein generiert.';
    } else if (/\b(handyhalter|phone|smartphone|tablet|dock|aufsteller|handyständer|handystaender)\b/i.test(lower)) {
      const standColor = colorMatch?.hex || '#10b981';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Ergonomischer Smartphone- & Tablet-Dock',
        description: `Winkel-Aufsteller mit Ladekabel-Kanal generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: standColor },
        nodes: [
          {
            id: 'node-phone-base',
            name: 'Standfuß-Platte',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 78, depth: 86, height: 7, bevel: 5, wallThickness: 0 },
          },
          {
            id: 'node-phone-backrest',
            name: 'Geneigte Rückenstütze (68°)',
            type: 'box',
            operation: 'union',
            position: [0, 8, 5],
            rotation: [-22, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 72, depth: 7, height: 92, bevel: 3.5, wallThickness: 0 },
          },
          {
            id: 'node-phone-lip',
            name: 'Vordere Haltelippe (Rutschschutz)',
            type: 'box',
            operation: 'union',
            position: [0, -28, 5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 74, depth: 14, height: 18, bevel: 3.5, wallThickness: 0 },
          },
          {
            id: 'node-phone-strut',
            name: 'Hintere Stützstrebe',
            type: 'box',
            operation: 'union',
            position: [0, 26, 5],
            rotation: [24, 0, 0],
            scale: [1, 1, 1],
            color: standColor,
            params: { width: 46, depth: 7, height: 58, bevel: 2.5, wallThickness: 0 },
          },
          {
            id: 'node-usb-cutout',
            name: 'USB-C Ladekabel-Aussparung',
            type: 'box',
            operation: 'subtract',
            position: [0, -24, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f43f5e',
            params: { width: 20, depth: 32, height: 24, bevel: 2, wallThickness: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Smartphone- & Tablet-Dock (78×86×94mm) mit 68° Neigungswinkel, Haltelippe und USB-C Kabeldurchführung generiert.';
    } else if (/\b(rakete|rocket|raumschiff|spaceship|apollo|falcon|missile)\b/i.test(lower)) {
      preserveNodeColors = true;
      const bodyColor = colorMatch?.hex || '#f8fafc';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Mehrstufige Weltraum-Rakete mit Leitwerken',
        description: `Aerodynamische 3D-Rakete generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bodyColor },
        nodes: [
          {
            id: 'node-rocket-nozzle',
            name: 'Triebwerksdüse (Schubglocke)',
            type: 'cone',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 15, radiusTop: 10, innerRadius: 7, height: 14, segments: 32 },
          },
          {
            id: 'node-rocket-fuselage',
            name: 'Raketenrumpf (Hauptstufe)',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 12],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bodyColor,
            params: {
              height: 86,
              rBottom: 14,
              rLower: 18,
              rMid: 18.5,
              rUpper: 17,
              rNeck: 13,
              rTop: 9,
              segments: 40,
            },
          },
          {
            id: 'node-rocket-nose',
            name: 'Aerodynamische Raketenspitze',
            type: 'cone',
            operation: 'union',
            position: [0, 0, 96],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#e11d48',
            params: { radiusBottom: 9.5, radiusTop: 0.8, height: 28, segments: 36 },
          },
          {
            id: 'node-rocket-fin-1',
            name: 'Leitwerk-Finne X',
            type: 'box',
            operation: 'union',
            position: [0, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#e11d48',
            params: { width: 58, depth: 4.5, height: 34, bevel: 2, wallThickness: 0 },
          },
          {
            id: 'node-rocket-fin-2',
            name: 'Leitwerk-Finne Y',
            type: 'box',
            operation: 'union',
            position: [0, 0, 2],
            rotation: [0, 0, 90],
            scale: [1, 1, 1],
            color: '#e11d48',
            params: { width: 58, depth: 4.5, height: 34, bevel: 2, wallThickness: 0 },
          },
          {
            id: 'node-rocket-porthole',
            name: 'Kabinen-Bullauge',
            type: 'sphere',
            operation: 'union',
            position: [0, -16, 66],
            rotation: [0, 0, 0],
            scale: [1, 0.5, 1],
            color: '#38bdf8',
            params: { radius: 6.5, domeOnly: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Mehrstufige 3D-Rakete (Ø58×124mm) mit Schubdüse, Kreuz-Leitwerken, Bullauge und roter Spitze erstellt.';
    } else if (/\b(roboter|robot|bot|androide|figur|männchen|maennchen|miniature|statue|charakter)\b/i.test(lower)) {
      preserveNodeColors = true;
      const mainCol = colorMatch?.hex || '#38bdf8';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Artikulierter Mecha-Roboter (Print-in-Place Stil)',
        description: `Mehrteilige Roboter-Figur generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mainCol },
        nodes: [
          {
            id: 'node-robot-leg-l',
            name: 'Linkes Standbein & Fuß',
            type: 'box',
            operation: 'union',
            position: [-12, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { width: 14, depth: 20, height: 28, bevel: 2.5, wallThickness: 0 },
          },
          {
            id: 'node-robot-leg-r',
            name: 'Rechtes Standbein & Fuß',
            type: 'box',
            operation: 'union',
            position: [12, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { width: 14, depth: 20, height: 28, bevel: 2.5, wallThickness: 0 },
          },
          {
            id: 'node-robot-torso',
            name: 'Gepanzerter Torso-Kern',
            type: 'box',
            operation: 'union',
            position: [0, 0, 26],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainCol,
            params: { width: 42, depth: 26, height: 38, bevel: 4, wallThickness: 0 },
          },
          {
            id: 'node-robot-core',
            name: 'Brust-Reaktorring',
            type: 'cylinder',
            operation: 'union',
            position: [0, -14, 45],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#fbbf24',
            params: { radiusBottom: 8, radiusTop: 8, innerRadius: 3.5, height: 5, segments: 28 },
          },
          {
            id: 'node-robot-arm-l',
            name: 'Linker Greifarm',
            type: 'cylinder',
            operation: 'union',
            position: [-26, 0, 32],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 6, radiusTop: 6.5, height: 28, segments: 24 },
          },
          {
            id: 'node-robot-arm-r',
            name: 'Rechter Greifarm',
            type: 'cylinder',
            operation: 'union',
            position: [26, 0, 32],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 6, radiusTop: 6.5, height: 28, segments: 24 },
          },
          {
            id: 'node-robot-head',
            name: 'Sensorkopf mit Visier',
            type: 'box',
            operation: 'union',
            position: [0, 0, 64],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainCol,
            params: { width: 28, depth: 22, height: 20, bevel: 4, wallThickness: 0 },
          },
          {
            id: 'node-robot-antenna',
            name: 'Kopf-Antenne',
            type: 'cylinder',
            operation: 'union',
            position: [0, 0, 84],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f97316',
            params: { radiusBottom: 2, radiusTop: 3.5, height: 12, segments: 18 },
          },
        ],
        promptHistory: [],
      };
      summary = '8-teilige Mecha-Roboterfigur (64×26×96mm) mit Beinen, Torso-Reaktor, Greifarmen, Visierkopf und Antenne erstellt.';
    } else if (/\b(auto|car|fahrzeug|truck|lkw|rennauto|sportwagen|mobil)\b/i.test(lower)) {
      preserveNodeColors = true;
      const carColor = colorMatch?.hex || '#e11d48';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Aerodynamisches Concept-Car mit 4 Rädern',
        description: `3D-Fahrzeugmodell generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: carColor },
        nodes: [
          {
            id: 'node-car-chassis',
            name: 'Fahrzeug-Karosserie',
            type: 'box',
            operation: 'union',
            position: [0, 0, 6],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: carColor,
            params: { width: 88, depth: 42, height: 15, bevel: 5, wallThickness: 0 },
          },
          {
            id: 'node-car-cabin',
            name: 'Sport-Cockpit / Dachkuppel',
            type: 'box',
            operation: 'union',
            position: [-4, 0, 19],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#38bdf8',
            params: { width: 46, depth: 34, height: 14, bevel: 6, wallThickness: 0 },
          },
          {
            id: 'node-car-spoiler',
            name: 'Heckspoiler-Flügel',
            type: 'box',
            operation: 'union',
            position: [-38, 0, 21],
            rotation: [0, 10, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { width: 12, depth: 44, height: 6, bevel: 1.5, wallThickness: 0 },
          },
          {
            id: 'node-wheel-fl',
            name: 'Vorderrad Links',
            type: 'cylinder',
            operation: 'union',
            position: [25, -24, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 },
          },
          {
            id: 'node-wheel-fr',
            name: 'Vorderrad Rechts',
            type: 'cylinder',
            operation: 'union',
            position: [25, 16, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 },
          },
          {
            id: 'node-wheel-rl',
            name: 'Hinterrad Links',
            type: 'cylinder',
            operation: 'union',
            position: [-25, -24, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 },
          },
          {
            id: 'node-wheel-rr',
            name: 'Hinterrad Rechts',
            type: 'cylinder',
            operation: 'union',
            position: [-25, 16, 11],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#94a3b8',
            params: { radiusBottom: 11, radiusTop: 11, innerRadius: 4, height: 8, segments: 28 },
          },
        ],
        promptHistory: [],
      };
      summary = '3D-Fahrzeugmodell (88×48×33mm) mit Karosserie, Cockpit-Kuppel, Heckspoiler und 4 Rädern generiert.';
    } else if (/\b(schlüsselanhänger|schluesselanhaenger|keychain|schild|tag|plakette|anhänger|anhaenger|coin|medaille|badge)\b/i.test(lower)) {
      preserveNodeColors = true;
      const badgeColor = colorMatch?.hex || '#fbbf24';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Schlüsselanhänger / Emblem-Tag mit Ringöse',
        description: `Präzisions-Keychain generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: badgeColor },
        nodes: [
          {
            id: 'node-keychain-plate',
            name: 'Gefaste Trägerplatte',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: badgeColor,
            params: { width: 64, depth: 34, height: 5, bevel: 10, wallThickness: 0 },
          },
          {
            id: 'node-keychain-star',
            name: 'Erhabenes 3D-Stern-Relief',
            type: 'star',
            operation: 'union',
            position: [6, 0, 4.5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f8fafc',
            params: { points: 5, outerRadius: 12, innerRadius: 5.5, height: 3.5 },
          },
          {
            id: 'node-keychain-hole',
            name: 'Schlüsselring-Bohrung (Ø7mm)',
            type: 'cylinder',
            operation: 'subtract',
            position: [-22, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f43f5e',
            params: { radiusBottom: 3.5, radiusTop: 3.5, height: 14, segments: 24 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Schlüsselanhänger-Plakette (64×34×8mm) mit erhabenem Relief-Emblem und Ø7mm Schlüsselring-Bohrung erstellt.';
    } else if (/\b(gehäuse|gehaeuse|case|enclosure|raspberry|esp32|arduino|elektronikbox|verteilerdose)\b/i.test(lower)) {
      const boxCol = colorMatch?.hex || '#38bdf8';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Elektronik-Gehäuse mit Standoffs & Port-Durchbruch',
        description: `Funktionales Gehäuse generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: boxCol },
        nodes: [
          {
            id: 'node-enc-shell',
            name: 'Hohle Gehäuse-Wanne (2.8mm Wand)',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { width: 92, depth: 64, height: 34, bevel: 5, wallThickness: 2.8 },
          },
          {
            id: 'node-standoff-1',
            name: 'Platinen-Standoff VL (M3)',
            type: 'cylinder',
            operation: 'union',
            position: [-36, -22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 },
          },
          {
            id: 'node-standoff-2',
            name: 'Platinen-Standoff VR (M3)',
            type: 'cylinder',
            operation: 'union',
            position: [36, -22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 },
          },
          {
            id: 'node-standoff-3',
            name: 'Platinen-Standoff HL (M3)',
            type: 'cylinder',
            operation: 'union',
            position: [-36, 22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 },
          },
          {
            id: 'node-standoff-4',
            name: 'Platinen-Standoff HR (M3)',
            type: 'cylinder',
            operation: 'union',
            position: [36, 22, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: boxCol,
            params: { radiusBottom: 4, radiusTop: 4, innerRadius: 1.5, height: 8, segments: 20 },
          },
          {
            id: 'node-usb-port',
            name: 'Seitlicher USB / Kabel-Ausschnitt',
            type: 'box',
            operation: 'subtract',
            position: [45, 0, 12],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f43f5e',
            params: { width: 14, depth: 18, height: 12, bevel: 1, wallThickness: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Elektronik-Gehäuse (92×64×34mm, 2.8mm Wandstärke) mit 4 M3-Platinen-Standoffs und USB-Port-Ausschnitt erstellt.';
    } else if (/\b(knauf|griff|knob|handle|drehknopf|schubladengriff)\b/i.test(lower)) {
      const knobCol = colorMatch?.hex || '#f59e0b';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Geriffelter Drehknopf / Möbelknauf mit M4-Aufnahme',
        description: `Ergonomischer Griffknauf generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: knobCol },
        nodes: [
          {
            id: 'node-knob-neck',
            name: 'Distanzschaft mit M4-Bohrung',
            type: 'cylinder',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: knobCol,
            params: { radiusBottom: 11, radiusTop: 10, innerRadius: 2.1, height: 16, segments: 32 },
          },
          {
            id: 'node-knob-head',
            name: 'Verzahnter Griffkranz (18 Mulden)',
            type: 'gear',
            operation: 'union',
            position: [0, 0, 14],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: knobCol,
            params: { teeth: 18, outerRadius: 22, toothDepth: 2.2, boreRadius: 2.1, height: 18 },
          },
          {
            id: 'node-knob-cap',
            name: 'Gewölbte Griffkuppel',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 30],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.45],
            color: knobCol,
            params: { radius: 20, domeOnly: 1 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Ergonomischer Drehknopf / Knauf (Ø44×39mm) mit 18 Griffmulden, Schaft und M4-Innenbohrung erstellt.';
    } else if (/\b(tasse|kaffeetasse|teetasse|mug|haferl|becher)\b/i.test(lower)) {
      const mugColor = colorMatch?.hex || '#38bdf8';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Design-Kaffeetasse mit Henkel',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mugColor },
        nodes: [
          {
            id: 'node-mug-body',
            name: 'Hohler Tassenkörper',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mugColor,
            params: {
              height: 76,
              rBottom: 32,
              rLower: 35,
              rMid: 36,
              rUpper: 36,
              rNeck: 36,
              rTop: 37,
              wallThickness: 3.4,
              segments: 40,
            },
          },
          {
            id: 'node-mug-handle',
            name: 'Ergonomischer Tassenhenkel',
            type: 'torus',
            operation: 'union',
            position: [36, 0, 20],
            rotation: [90, 0, 0],
            scale: [0.85, 1.15, 1],
            color: mugColor,
            params: { radius: 21, tubeRadius: 5.2 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Hohle 3D-Tasse (Ø74×76mm, 3.4mm Wandstärke) mit seitlichem Henkel erstellt.';
    } else if (/\b(herz|heart|liebe)\b/i.test(lower)) {
      const heartColor = colorMatch?.hex || '#e11d48';
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Herz-Skulptur (Gefast)',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: heartColor },
        nodes: [
          {
            id: 'node-heart-main',
            name: '3D-Herzkörper',
            type: 'heart',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: heartColor,
            params: { width: 68, depth: 62, height: 24, bevel: 5 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Dreidimensionales, gewölbtes 3D-Herz (68×62×24mm) erstellt.';
    } else if (/\b(stern|star|weihnachtsstern)\b/i.test(lower)) {
      const starColor = colorMatch?.hex || '#fbbf24';
      preserveNodeColors = true;
      const ptsMatch = lower.match(/(\d+)\s*(?:zacken|spitzen|points)/i);
      const pts = ptsMatch ? Math.max(3, Math.min(12, Number(ptsMatch[1]))) : 5;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-Stern (${pts}-zackig)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: starColor },
        nodes: [
          {
            id: 'node-star-main',
            name: `${pts}-zackiger 3D-Stern`,
            type: 'star',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: starColor,
            params: { points: pts, outerRadius: 42, innerRadius: 18, height: 20 },
          },
        ],
        promptHistory: [],
      };
      summary = `Facettierter ${pts}-zackiger 3D-Stern (Ø84×20mm) erstellt.`;
    } else if (/\b(pilz|fliegenpilz|mushroom)\b/i.test(lower)) {
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Pilz (Stiel & Hut)',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: '#e11d48' },
        nodes: [
          {
            id: 'node-mushroom-stem',
            name: 'Pilzstiel',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f8fafc',
            params: { height: 46, rBottom: 16, rLower: 18, rMid: 13, rUpper: 11, rNeck: 10, rTop: 12, segments: 32 },
          },
          {
            id: 'node-mushroom-cap',
            name: 'Gewölbter Pilzhut',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 40],
            rotation: [0, 0, 0],
            scale: [1.2, 1.2, 0.78],
            color: colorMatch?.hex || '#e11d48',
            params: { radius: 30, domeOnly: 1 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Organischer 3D-Pilz (Ø72×64mm) mit bauchigem Stiel und gewölbter Hutkuppel generiert.';
    } else if (/\b(flasche|karaffe|bottle|kolben)\b/i.test(lower)) {
      const bottleColor = colorMatch?.hex || '#38bdf8';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Design-Flasche / Karaffe',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bottleColor },
        nodes: [
          {
            id: 'node-bottle-body',
            name: 'Flaschenkörper mit Hals',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bottleColor,
            params: {
              height: 110,
              rBottom: 28,
              rLower: 32,
              rMid: 32,
              rUpper: 26,
              rNeck: 12,
              rTop: 14,
              wallThickness: 2.6,
              segments: 36,
            },
          },
        ],
        promptHistory: [],
      };
      summary = 'Hohle 3D-Karaffe / Flasche (Ø64×110mm) mit verjüngtem Flaschenhals erstellt.';
    } else if (/\b(schale|schüssel|schuessel|bowl|obstschale)\b/i.test(lower)) {
      const bowlColor = colorMatch?.hex || '#f59e0b';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Organische Design-Schale',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: bowlColor },
        nodes: [
          {
            id: 'node-bowl-body',
            name: 'Gewölbte Schale',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: bowlColor,
            params: {
              height: 46,
              rBottom: 24,
              rLower: 34,
              rMid: 42,
              rUpper: 48,
              rNeck: 52,
              rTop: 54,
              wallThickness: 3.2,
              lobeCount: 12,
              lobeAmplitude: 1.5,
              segments: 44,
            },
          },
        ],
        promptHistory: [],
      };
      summary = 'Hohle Design-Schale (Ø108×46mm, 3.2mm Wandstärke) generiert.';
    } else if (/\b(schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|spielfigur)\b/i.test(lower)) {
      const chessColor = colorMatch?.hex || '#e2e8f0';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Klassische Schachfigur (Gedreht)',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: chessColor },
        nodes: [
          {
            id: 'node-chess-base',
            name: 'Gedrehter Figurensockel & Säule',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: chessColor,
            params: {
              height: 54,
              rBottom: 22,
              rLower: 19,
              rMid: 11,
              rUpper: 9,
              rNeck: 14,
              rTop: 9,
              segments: 36,
            },
          },
          {
            id: 'node-chess-head',
            name: 'Kugelkopf',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 50],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: chessColor,
            params: { radius: 12, domeOnly: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Klassische Schachfigur (Ø44×74mm) mit gedrehtem Sockel, Kragenring und Kugelkopf erstellt.';
    } else if (/\b(schneemann|snowman)\b/i.test(lower)) {
      preserveNodeColors = true;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Schneemann mit Karottennase',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: '#f8fafc' },
        nodes: [
          {
            id: 'node-snow-bottom',
            name: 'Untere Schneekugel',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.92],
            color: '#f8fafc',
            params: { radius: 26, domeOnly: 0 },
          },
          {
            id: 'node-snow-mid',
            name: 'Mittlere Schneekugel',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 38],
            rotation: [0, 0, 0],
            scale: [1, 1, 0.92],
            color: '#f8fafc',
            params: { radius: 19, domeOnly: 0 },
          },
          {
            id: 'node-snow-head',
            name: 'Schneemann-Kopf',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 66],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f8fafc',
            params: { radius: 13, domeOnly: 0 },
          },
          {
            id: 'node-snow-nose',
            name: 'Karottennase',
            type: 'cone',
            operation: 'union',
            position: [0, -12, 79],
            rotation: [90, 0, 0],
            scale: [1, 1, 1],
            color: '#f97316',
            params: { radiusBottom: 3.2, radiusTop: 0.6, height: 14, segments: 18 },
          },
        ],
        promptHistory: [],
      };
      summary = '3D-Schneemann (Ø52×92mm) aus drei gestapelten Sphären mit Karottennase generiert.';
    } else if (/\b(zahnrad|gear|ritzel|zähne|zaehne|cog|getriebe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.precision_planetary_gear();
      const teethMatch = lower.match(/(\d+)\s*(?:zähne|zaehne|teeth|t\b)/i);
      const boreMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:loch|bohrung|welle|bore)/i);
      const diaMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:durchmesser|diameter|groß|breit)/i);

      const gearNode = baseScene.nodes[0];
      if (teethMatch) {
        gearNode.params.teeth = Math.max(6, Math.min(72, Number(teethMatch[1])));
      }
      if (boreMatch) {
        const br = Math.max(1, Number(boreMatch[1].replace(',', '.')) / 2);
        gearNode.params.boreRadius = br;
        if (baseScene.nodes[1]) baseScene.nodes[1].params.innerRadius = br;
      }
      if (diaMatch) {
        gearNode.params.outerRadius = Math.max(10, Number(diaMatch[1].replace(',', '.')) / 2);
      }
      baseScene.title = `Stirnzahnrad Z${gearNode.params.teeth}`;
      summary = `Präzisions-Zahnrad mit ${gearNode.params.teeth} Zähnen (Ø${gearNode.params.outerRadius * 2}mm, Bohrung Ø${(gearNode.params.boreRadius || 5) * 2}mm) generiert.`;
    } else if (/\b(vase|blumentopf|pflanztopf|topf|planter|pot|gefäß|gefaess|spiral|kelch|lampe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.twisted_rib_vase();
      const heightMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:hoch|höhe|hoehe|high)/i);
      const ribMatch = lower.match(/(\d+)\s*(?:rippen|ribs|rillen)/i);
      const vaseNode = baseScene.nodes[0];
      if (heightMatch) vaseNode.params.height = Math.max(20, Math.min(240, Number(heightMatch[1].replace(',', '.'))));
      if (ribMatch) vaseNode.params.ribCount = Math.max(0, Math.min(36, Number(ribMatch[1])));
      baseScene.title = `Spiral-Designvase (${vaseNode.params.height}mm)`;
      summary = `Skulpturale Torsions-Vase (Höhe ${vaseNode.params.height}mm, ${vaseNode.params.ribCount} Rippen) erstellt.`;
    } else if (/\b(organizer|kasten|schublade|sortier|fach|fächer|faecher|tray|stiftehalter|kabelhalter|kabel|cable|clip)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.smart_home_organizer();
      const orgNode = baseScene.nodes[0];
      const gridMatch = lower.match(/(\d+)\s*[x×]\s*(\d+)/);
      if (gridMatch) {
        orgNode.params.slotsX = Math.max(1, Math.min(5, Number(gridMatch[1])));
        orgNode.params.slotsY = Math.max(1, Math.min(4, Number(gridMatch[2])));
      }
      baseScene.title = `Modularer Organizer (${orgNode.params.slotsX}×${orgNode.params.slotsY} Fächer)`;
      summary = `Organizer-Box (${orgNode.params.width}×${orgNode.params.depth}×${orgNode.params.height}mm) mit ${orgNode.params.slotsX * orgNode.params.slotsY} Kammern generiert.`;
    } else if (/\b(kopfhörer|kopfhoerer|headphone|haken|wandhaken|hook|winkel|bracket|wandhalter|tischklemme|klemme|ständer|staender)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.desk_headphone_stand();
      baseScene.title = cleanPrompt.length <= 42 ? cleanPrompt : 'Tisch- & Wandhalterung (Bracket)';
      summary = `Verstärkte Halterung / Tischklemme (38×62×74mm) mit Kabeldurchführung generiert.`;
    } else if (/\b(trichter|funnel)\b/i.test(lower)) {
      const funnelCol = colorMatch?.hex || '#f97316';
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: 'Präzisions-Einfülltrichter mit Auslaufrohr',
        description: `Hohler Trichter generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: funnelCol },
        nodes: [
          {
            id: 'node-funnel-spout',
            name: 'Unteres Auslaufrohr',
            type: 'cylinder',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: funnelCol,
            params: { radiusBottom: 7, radiusTop: 8, innerRadius: 5, height: 28, segments: 36 },
          },
          {
            id: 'node-funnel-cone',
            name: 'Oberer Trichterkonus',
            type: 'cone',
            operation: 'union',
            position: [0, 0, 26],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: funnelCol,
            params: { radiusBottom: 8, radiusTop: 38, innerRadius: 5.5, height: 48, segments: 44 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Hohler Einfülltrichter (Ø76×74mm) mit Auslaufrohr erstellt.';
    } else if (/\b(kugel|sphere|ball|kuppel|dome|murmel)\b/i.test(lower)) {
      const rMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      const rad = rMatch ? Math.max(8, Number(rMatch[1].replace(',', '.')) / 2) : 28;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-Kugel / Sphäre (Ø${rad * 2}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: 'node-sphere-1',
            name: 'Kugelkörper',
            type: 'sphere',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#10b981',
            params: { radius: rad, domeOnly: /\b(kuppel|dome|halbkugel)\b/i.test(lower) ? 1 : 0 },
          },
        ],
        promptHistory: [],
      };
      summary = `Sphären-Geometrie (Ø${rad * 2}mm) auf der Bauplatte erstellt.`;
    } else if (/\b(pyramide|pyramid|kegel|cone)\b/i.test(lower)) {
      const isPyramid = /\b(pyramide|pyramid)\b/i.test(lower);
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: isPyramid ? '3D-Pyramide' : '3D-Kegel / Konus',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: 'node-cone-main',
            name: isPyramid ? 'Pyramidenkörper' : 'Kegelkörper',
            type: 'cone',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, isPyramid ? 45 : 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#f59e0b',
            params: { radiusBottom: 34, radiusTop: 1, height: 56, segments: isPyramid ? 4 : 40 },
          },
        ],
        promptHistory: [],
      };
      summary = `${isPyramid ? '4-seitige Pyramide' : 'Präzisionskegel'} (Ø68×56mm) erstellt.`;
    } else if (/\b(donut|torus|o-ring|reif)\b/i.test(lower)) {
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: '3D-Torus / Donut-Ring',
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: 'node-torus-main',
            name: 'Torus-Ringkörper',
            type: 'torus',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#f43f5e',
            params: { radius: 28, tubeRadius: 11 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Torus / Donut-Geometrie (Außen-Ø78mm, Ringstärke 22mm) generiert.';
    } else if (/\b(würfel|wuerfel|cube|quader|block|klotz)\b/i.test(lower)) {
      const m = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
      const sz = m ? Math.max(10, Number(m[1].replace(',', '.'))) : 45;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `3D-Würfel (${sz}×${sz}×${sz}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: 'node-cube-main',
            name: 'Gefaster 3D-Würfel',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#38bdf8',
            params: { width: sz, depth: sz, height: sz, bevel: 3.5, wallThickness: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = `Gefaster 3D-Würfel (${sz}×${sz}×${sz}mm) erstellt.`;
    } else if (/\b(zylinder|rohr|tube|hülse|huelse|spacer|adapter|ring|spule)\b/i.test(lower)) {
      const nums = (lower.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
      const outerR = nums[0] ? Math.max(6, nums[0] / 2) : 25;
      const height = nums[1] ? Math.max(5, nums[1]) : 40;
      const innerR = nums[2] ? Math.min(outerR - 2, nums[2] / 2) : Math.max(0, outerR * 0.55);
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: `Zylinder-Hülse / Adapter (Ø${outerR * 2}×${height}mm)`,
        description: `Generiert aus Prompt: "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE },
        nodes: [
          {
            id: 'node-cyl-main',
            name: 'Zylinderhülse',
            type: 'cylinder',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#38bdf8',
            params: { radiusBottom: outerR, radiusTop: outerR, innerRadius: innerR, height, segments: 48 },
          },
        ],
        promptHistory: [],
      };
      summary = `Zylinder-Adapter (Außen-Ø${outerR * 2}mm, Innen-Ø${(innerR * 2).toFixed(1)}mm, Höhe ${height}mm) erstellt.`;
    } else {
      // Multi-part sculpted CAD assembly fallback (NEVER a single boring cube!)
      const dims = (lower.match(/(\d+(?:[.,]\d+)?)\s*mm/g) || []).map((s) =>
        Number(s.replace(/mm/i, '').replace(',', '.').trim())
      );
      const w = dims[0] || 68;
      const d = dims[1] || 56;
      const h = dims[2] || 54;
      const mainColor = colorMatch?.hex || '#10b981';

      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: cleanPrompt.slice(0, 48) || 'Parametrische 3D-Baugruppe',
        description: `Mehrteiliges 3D-Druckmodell für "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: mainColor },
        nodes: [
          {
            id: 'node-base-plate',
            name: 'Gefaster Grundsockel mit Montageflansch',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainColor,
            params: { width: w, depth: d, height: 10, bevel: 5, wallThickness: 0 },
          },
          {
            id: 'node-sculpted-core',
            name: 'Konturierter Hauptkörper (Rotationsprofil)',
            type: 'lathe',
            operation: 'union',
            position: [0, 0, 8],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: mainColor,
            params: {
              height: Math.max(24, h - 8),
              rBottom: Math.round(Math.min(w, d) * 0.36),
              rLower: Math.round(Math.min(w, d) * 0.42),
              rMid: Math.round(Math.min(w, d) * 0.34),
              rUpper: Math.round(Math.min(w, d) * 0.38),
              rNeck: Math.round(Math.min(w, d) * 0.26),
              rTop: Math.round(Math.min(w, d) * 0.3),
              lobeCount: 6,
              lobeAmplitude: 1.8,
              wallThickness: /\b(hohl|gehäuse|box|topf)\b/i.test(lower) ? 2.8 : 0,
              segments: 40,
            },
          },
          {
            id: 'node-top-crown',
            name: 'Oberer Abschlusskranz',
            type: 'gear',
            operation: 'union',
            position: [0, 0, Math.max(22, h - 10)],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#38bdf8',
            params: {
              teeth: 16,
              outerRadius: Math.round(Math.min(w, d) * 0.32),
              toothDepth: 2.2,
              boreRadius: 6,
              height: 10,
            },
          },
          {
            id: 'node-center-bore',
            name: 'Zentrale Funktionsbohrung',
            type: 'cylinder',
            operation: 'subtract',
            position: [0, 0, 4],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#f43f5e',
            params: { radiusBottom: 6, radiusTop: 6, height: h + 10, segments: 28 },
          },
        ],
        promptHistory: [],
      };
      summary = `Mehrteilige 3D-Baugruppe (${w}×${d}×${h}mm) mit Grundsockel, konturiertem Hauptkörper, Abschlusskranz und Bohrung für "${cleanPrompt}" generiert.`;
    }

    if (colorMatch && !preserveNodeColors) {
      baseScene.printProfile.filamentColor = colorMatch.hex;
      for (const n of baseScene.nodes) {
        if (n.operation !== 'subtract') n.color = colorMatch.hex;
      }
    }

    baseScene.projectId = existingScene?.projectId || `proj-${Date.now()}`;
    baseScene.updatedAt = nowIso;
    baseScene.promptHistory = [
      {
        id: `ph-${Date.now()}`,
        prompt: cleanPrompt,
        summary,
        engine: 'Antigravity Parametric CAD',
        timestamp: nowIso,
      },
      ...(existingScene?.promptHistory || []),
    ].slice(0, 30);
    return { scene: baseScene, summary, engine: 'Antigravity Parametric CAD' };
  }

  // CASE B: Modify existing SceneSpec based on user prompt!
  const scene: SceneSpec = JSON.parse(JSON.stringify(existingScene));
  scene.updatedAt = nowIso;
  const changes: string[] = [];

  if (colorMatch) {
    scene.printProfile.filamentColor = colorMatch.hex;
    for (const n of scene.nodes) {
      if (n.operation === 'subtract') continue;
      if (
        (n.id.includes('stem') || n.id.includes('leaf')) &&
        !/\b(stiel|blatt|komplett|alles)\b/i.test(lower)
      ) {
        continue;
      }
      n.color = colorMatch.hex;
    }
    changes.push(`Farbe auf ${colorMatch.label} (${colorMatch.hex}) geändert`);
  }

  if (/\b(ohne\s+blatt|blatt\s+entfernen|kein\s+blatt)\b/i.test(lower)) {
    scene.nodes = scene.nodes.filter((n) => !n.id.includes('leaf') && !/blatt/i.test(n.name));
    changes.push('Blatt entfernt');
  }

  if (/\b(ohne\s+stiel|stiel\s+entfernen|kein\s+stiel)\b/i.test(lower)) {
    scene.nodes = scene.nodes.filter((n) => !n.id.includes('stem') && !/stiel/i.test(n.name));
    changes.push('Stiel entfernt');
  }

  if (/\b(biss|abgebissen|bite)\b/i.test(lower)) {
    scene.nodes.push({
      id: `node-bite-${Date.now()}`,
      name: 'Seitlicher Biss-Abzug',
      type: 'sphere',
      operation: 'subtract',
      position: [31, 0, 22],
      rotation: [0, 0, 0],
      scale: [1, 1.15, 1.1],
      color: '#f43f5e',
      params: { radius: 18, domeOnly: 0 },
    });
    changes.push('Seitliche Biss-Aussparung hinzugefügt');
  }

  const pctMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const pctVal = pctMatch ? Number(pctMatch[1].replace(',', '.')) : null;
  const mmMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
  const mmVal = mmMatch ? Number(mmMatch[1].replace(',', '.')) : null;

  // Height adjustments
  if (/\b(höher|hoeher|höhe|hoehe|taller|height|länger|laenger)\b/i.test(lower)) {
    for (const n of scene.nodes) {
      if (n.operation === 'subtract') continue;
      if (pctVal) {
        const factor = pctVal > 100 ? pctVal / 100 : 1 + pctVal / 100;
        if (n.params.height) n.params.height = Number((n.params.height * factor).toFixed(1));
        else n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      } else if (mmVal) {
        if (/\b(um|plus|\+)\b/i.test(lower) && n.params.height) {
          n.params.height = Number((n.params.height + mmVal).toFixed(1));
        } else if (n.params.height) {
          n.params.height = mmVal;
        }
      } else if (n.params.height) {
        n.params.height = Number((n.params.height * 1.25).toFixed(1));
      }
    }
    changes.push(`Objekthöhe angepasst`);
  }

  // Width / diameter adjustments
  if (/\b(breiter|breite|wider|width|durchmesser|größer|groesser|skalier)\b/i.test(lower)) {
    const factor = pctVal ? (pctVal > 100 ? pctVal / 100 : 1 + pctVal / 100) : 1.2;
    for (const n of scene.nodes) {
      if (mmVal && !pctVal) {
        if (n.params.width !== undefined) n.params.width = mmVal;
        if (n.params.radius !== undefined) n.params.radius = mmVal / 2;
        if (n.params.outerRadius !== undefined) n.params.outerRadius = mmVal / 2;
        if (n.params.radiusBottom !== undefined) n.params.radiusBottom = mmVal / 2;
        if (n.params.radiusTop !== undefined) n.params.radiusTop = mmVal / 2;
      } else {
        n.scale[0] = Number((n.scale[0] * factor).toFixed(2));
        n.scale[1] = Number((n.scale[1] * factor).toFixed(2));
        if (/\b(skalier|größer|groesser)\b/i.test(lower)) {
          n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
        }
      }
    }
    changes.push(`Breite / Skalierung angepasst`);
  }

  // Smaller / flatter
  if (/\b(kleiner|flacher|kürzer|kuerzer|schmaler|smaller|shorter)\b/i.test(lower)) {
    const factor = pctVal ? Math.max(0.25, 1 - pctVal / 100) : 0.8;
    for (const n of scene.nodes) {
      if (/\b(flacher|kürzer|kuerzer|shorter)\b/i.test(lower)) {
        if (n.params.height) n.params.height = Number((n.params.height * factor).toFixed(1));
        else n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      } else {
        n.scale[0] = Number((n.scale[0] * factor).toFixed(2));
        n.scale[1] = Number((n.scale[1] * factor).toFixed(2));
        n.scale[2] = Number((n.scale[2] * factor).toFixed(2));
      }
    }
    changes.push(`Abmessungen reduziert (${Math.round(factor * 100)}%)`);
  }

  // Tooth / rib count modification
  if (/\b(zähne|zaehne|teeth|rippen|ribs|fächer|faecher|slots|zacken)\b/i.test(lower)) {
    const countMatch = lower.match(/(\d+)/);
    const num = countMatch ? Number(countMatch[1]) : null;
    for (const n of scene.nodes) {
      if (n.type === 'gear') {
        n.params.teeth = num ? Math.max(6, Math.min(80, num)) : (n.params.teeth || 20) + 6;
        changes.push(`Zähnezahl auf ${n.params.teeth} gesetzt`);
      } else if (n.type === 'twisted_vase') {
        n.params.ribCount = num ? Math.max(0, Math.min(36, num)) : (n.params.ribCount || 12) + 4;
        changes.push(`Rippenanzahl auf ${n.params.ribCount} gesetzt`);
      } else if (n.type === 'hex_organizer') {
        n.params.slotsX = num ? Math.max(1, Math.min(5, num)) : (n.params.slotsX || 3) + 1;
        changes.push(`Kammer-Unterteilung auf ${n.params.slotsX}×${n.params.slotsY || 2} geändert`);
      } else if (n.type === 'star') {
        n.params.points = num ? Math.max(3, Math.min(16, num)) : (n.params.points || 5) + 1;
        changes.push(`Sternspitzen auf ${n.params.points} gesetzt`);
      }
    }
  }

  // Add hole / bore / cutout
  if (/\b(loch|löcher|loecher|bohrung|bore|hole|aushöhlen|durchbruch)\b/i.test(lower)) {
    const holeDia = mmVal || 10;
    const holeRad = Math.max(1, holeDia / 2);
    const mainNode = scene.nodes[0];
    if (mainNode && (mainNode.type === 'cylinder' || mainNode.type === 'gear')) {
      if (mainNode.type === 'cylinder') mainNode.params.innerRadius = holeRad;
      if (mainNode.type === 'gear') mainNode.params.boreRadius = holeRad;
    }
    scene.nodes.push({
      id: `node-hole-${Date.now()}`,
      name: `Bohrung Ø${holeDia}mm`,
      type: 'cylinder',
      operation: 'subtract',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#f43f5e',
      params: { radiusBottom: holeRad, radiusTop: holeRad, height: 95, segments: 32 },
    });
    changes.push(`Präzisionsbohrung (Ø${holeDia}mm) hinzugefügt`);
  }

  // Add extra feature / attachment
  if (
    /\b(füge|fuege|add|hinzu|oben|sockel|basis|ring|knauf|griff|henkel|räder|raeder|wheels)\b/i.test(lower) &&
    !/\b(loch|bohrung)\b/i.test(lower)
  ) {
    const refHeight = scene.nodes[0]?.params?.height || 45;
    if (/\b(ring|öse|oese|torus|henkel|griff|handle)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-ring-${Date.now()}`,
        name: 'Befestigungsring / Henkel',
        type: 'torus',
        operation: 'union',
        position: [26, 0, Math.max(12, refHeight * 0.45)],
        rotation: [90, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 16, tubeRadius: 4.2 },
      });
      changes.push(`Henkel / Ringöse hinzugefügt`);
    } else if (/\b(sockel|basis|base|platte|boden)\b/i.test(lower)) {
      scene.nodes.unshift({
        id: `node-base-${Date.now()}`,
        name: 'Verstärkte Sockelplatte',
        type: 'box',
        operation: 'union',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { width: mmVal || 76, depth: mmVal || 76, height: 6, bevel: 4, wallThickness: 0 },
      });
      changes.push(`Verstärkte Sockelplatte hinzugefügt`);
    } else if (/\b(kugel|knauf|kuppel|sphere)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-knob-${Date.now()}`,
        name: 'Kugelknauf',
        type: 'sphere',
        operation: 'union',
        position: [0, 0, refHeight - 4],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 14, domeOnly: 0 },
      });
      changes.push(`Kugelknauf an Oberseite angefügt`);
    }
  }

  // Twist / rotation
  if (/\b(dreh|twist|torsion|spiral|rotier)\b/i.test(lower)) {
    for (const n of scene.nodes) {
      if (n.type === 'twisted_vase') {
        n.params.twistDeg = (n.params.twistDeg || 90) + 60;
      } else {
        n.rotation[2] = ((n.rotation[2] || 0) + 30) % 360;
      }
    }
    changes.push(`Torsions-/Rotationswinkel erhöht`);
  }

  // Position move via prompt
  if (/\b(verschieb|move|links|rechts|vorne|hinten)\b/i.test(lower)) {
    const step = mmVal || 15;
    const dx = /\brechts\b/i.test(lower) ? step : /\blinks\b/i.test(lower) ? -step : 0;
    const dy = /\bhinten\b/i.test(lower) ? step : /\bvorne\b/i.test(lower) ? -step : 0;
    for (const n of scene.nodes) {
      n.position[0] = Number(((n.position[0] || 0) + dx).toFixed(1));
      n.position[1] = Number(((n.position[1] || 0) + dy).toFixed(1));
    }
    changes.push(`Objekt auf Bauplatte verschoben (ΔX=${dx}mm, ΔY=${dy}mm)`);
  }

  if (changes.length === 0) {
    const primary = scene.nodes[0];
    if (primary) {
      if (primary.params.height) {
        primary.params.height = Number((primary.params.height * 1.15).toFixed(1));
      } else {
        primary.scale[2] = Number((primary.scale[2] * 1.15).toFixed(2));
      }
      if (primary.params.bevel !== undefined) {
        primary.params.bevel = Math.min(12, (primary.params.bevel || 2) + 2);
      }
      changes.push(`Geometrie gemäß "${cleanPrompt}" angepasst`);
    }
  }

  const summary = changes.join(' · ');
  scene.promptHistory.unshift({
    id: `ph-${Date.now()}`,
    prompt: cleanPrompt,
    summary,
    engine: 'Antigravity Parametric CAD',
    timestamp: nowIso,
  });

  return { scene, summary, engine: 'Antigravity Parametric CAD' };
}

/**
 * Generates a genuine 3D mesh (.glb) via Hugging Face Text-to-3D (`hysts/Shap-E`)
 * and parses its vertices/indices into a grounded, printable 3D SceneSpec.
 */
export async function generate3dSceneFromHuggingFace(
  prompt: string
): Promise<{ scene: SceneSpec; summary: string; engine: string }> {
  const cleanPrompt = prompt.trim();
  const englishPrompt = translatePromptToEnglish(cleanPrompt);
  const hfPrompt =
    englishPrompt.toLowerCase() !== cleanPrompt.toLowerCase()
      ? `a 3D model of ${englishPrompt}`
      : cleanPrompt;

  const baseUrl = 'https://hysts-shap-e.hf.space';
  const seed = Math.floor(Math.random() * 100000);

  // 1. Enqueue Gradio Text-to-3D generation job
  const callRes = await fetch(`${baseUrl}/gradio_api/call/text-to-3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [hfPrompt, seed, 15.0, 32],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!callRes.ok) {
    throw new Error(`Hugging Face Shap-E API HTTP ${callRes.status}`);
  }

  const callJson = (await callRes.json()) as { event_id?: string };
  if (!callJson.event_id) {
    throw new Error('Hugging Face Shap-E lieferte keine event_id.');
  }

  // 2. Await SSE completion and extract .glb file URL
  const sseRes = await fetch(`${baseUrl}/gradio_api/call/text-to-3d/${callJson.event_id}`, {
    headers: { Accept: 'text/event-stream' },
    signal: AbortSignal.timeout(35000),
  });

  if (!sseRes.ok) {
    throw new Error(`Hugging Face Stream HTTP ${sseRes.status}`);
  }

  const sseText = await sseRes.text();
  let glbUrl: string | null = null;

  for (const line of sseText.split('\n')) {
    if (line.startsWith('data:')) {
      const jsonStr = line.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed[0]) {
          if (typeof parsed[0].url === 'string') {
            glbUrl = parsed[0].url;
          } else if (typeof parsed[0].path === 'string') {
            glbUrl = `${baseUrl}/gradio_api/file=${parsed[0].path}`;
          }
        }
      } catch {
        // Ignore intermediate heartbeat lines
      }
    }
  }

  if (!glbUrl) {
    throw new Error('Hugging Face Shap-E lieferte keine 3D-GLB-Datei.');
  }

  // 3. Download binary .glb and parse triangles into printable SceneSpec
  const glbRes = await fetch(glbUrl, {
    signal: AbortSignal.timeout(15000),
  });
  if (!glbRes.ok) {
    throw new Error(`GLB-Download von Hugging Face fehlgeschlagen (HTTP ${glbRes.status}).`);
  }

  const ab = await glbRes.arrayBuffer();
  const parsedGlb = parseGlbBufferToMeshData(new Uint8Array(ab), 68, 5500);
  const colorMatch = extractColorFromPrompt(cleanPrompt);
  const finalColor = ensureHighContrastColor(
    colorMatch?.hex || parsedGlb.dominantColorHex,
    '#10b981'
  );
  const nowIso = new Date().toISOString();

  const scene: SceneSpec = {
    projectId: `hf-shape-${Date.now()}`,
    title: `${cleanPrompt} (Hugging Face 3D)`,
    description: `KI-generiertes 3D-Mesh via Hugging Face Shap-E (${parsedGlb.originalTriangles} Dreiecke · Prompt: "${hfPrompt}")`,
    createdAt: nowIso,
    updatedAt: nowIso,
    buildPlateMm: [256, 256, 256],
    printProfile: {
      ...DEFAULT_PRINT_PROFILE,
      filamentColor: finalColor,
    },
    nodes: [
      {
        id: `node-hf-glb-${Date.now()}`,
        name: `${cleanPrompt} (Shap-E 3D Mesh)`,
        type: 'stl_mesh',
        operation: 'union',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: finalColor,
        params: {
          originalTriangles: parsedGlb.originalTriangles,
          width: parsedGlb.dimensionsMm.x,
          depth: parsedGlb.dimensionsMm.y,
          height: parsedGlb.dimensionsMm.z,
        },
        meshData: parsedGlb.meshData,
      },
    ],
    promptHistory: [
      {
        id: `ph-hf-${Date.now()}`,
        prompt: cleanPrompt,
        summary: `Echtes 3D-Mesh (${parsedGlb.dimensionsMm.x}×${parsedGlb.dimensionsMm.y}×${parsedGlb.dimensionsMm.z}mm, ${parsedGlb.originalTriangles} Roh-Dreiecke) via Hugging Face Shap-E generiert.`,
        engine: 'Hugging Face Shap-E (Text-to-3D)',
        timestamp: nowIso,
      },
    ],
  };

  return {
    scene,
    summary: `3D-Mesh (${parsedGlb.dimensionsMm.x}×${parsedGlb.dimensionsMm.y}×${parsedGlb.dimensionsMm.z}mm) via Hugging Face Shap-E generiert.`,
    engine: 'Hugging Face Shap-E (Text-to-3D)',
  };
}

/**
 * Uses Hugging Face Text-to-3D (Shap-E) as primary 3D generator, with Google Gemini CAD as secondary.
 * NEVER silently returns dummy/hardcoded template data if AI generation fails.
 */
export async function generateOrModify3dSceneWithAi(
  prompt: string,
  existingScene?: SceneSpec | null,
  customApiKey?: string
): Promise<{ scene: SceneSpec; summary: string; engine: string }> {
  // If modifying an existing STL/GLB mesh scene in the Refine view:
  // If the user explicitly asks to generate a completely new object, call Hugging Face Text-to-3D;
  // otherwise apply parametric geometric/color/boolean modifications (scale, height, bore hole, color, base plate) to the existing mesh!
  const hasStlMeshNode = Boolean(existingScene?.nodes.some((n) => n.type === 'stl_mesh'));
  if (existingScene && hasStlMeshNode && !isExplicitObjectCreationPrompt(prompt)) {
    return runLocalAntigravityCadEngine(prompt, existingScene);
  }

  // Primary 3D AI Generator: Hugging Face Text-to-3D (Shap-E)
  let hfError = '';
  if (!existingScene || isExplicitObjectCreationPrompt(prompt)) {
    try {
      return await generate3dSceneFromHuggingFace(prompt);
    } catch (err) {
      hfError = err instanceof Error ? err.message : String(err);
    }
  }

  const apiKey = customApiKey || discoverGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      `Hugging Face 3D-Generierung fehlgeschlagen (${hfError || 'Nicht erreichbar'}) und kein Gemini API-Key konfiguriert.`
    );
  }

  const models = await resolveGeminiModels(apiKey);
  const systemInstruction = `Du bist der Antigravity 3D-CAD Kernel für das Modul "thassi.3dprint" (Bambu Lab 256x256x256mm).
Erzeuge oder verändere das 3D-Objekt basierend auf dem User-Prompt.
WICHTIG:
1. Erstelle NIEMALS nur einen einzelnen simplen Quader ("box")! Jedes neue Objekt MUSS aus mindestens 4 bis 10 zusammenhängenden Bauteilen (Nodes) konstruiert werden, damit die echte 3D-Form detailliert und realistisch erkennbar ist (z.B. Rumpf + Kabine + Dach + Räder/Flügel/Griff + Abzugs-Bohrungen).
2. Alle Koordinaten in Millimetern (Z=0 ist die Bauplatte). Positioniere zusammenhängende Bauteile so, dass sie sich physisch berühren/überlappen.
3. Nutze helle, kontrastreiche Farben (#10b981, #38bdf8, #f59e0b, #e11d48, #f8fafc, #a855f7, #94a3b8).

Verfügbare PrimitiveTypes und ihre EXAKTEN Parameter:
- "lathe": params { height, rBottom, rLower, rMid, rUpper, rNeck, rTop, topIndent, bottomIndent, wallThickness, lobeCount, lobeAmplitude, segments } (Ideal für organische Körper, Flaschen, Kelche, Tassen, Figuren, Rümpfe)
- "apple": params { radius, height, lobeCount, lobeAmplitude, topIndent, bottomIndent, segments }
- "heart": params { width, depth, height, bevel }
- "star": params { points, outerRadius, innerRadius, height }
- "box": params { width, depth, height, bevel, wallThickness }
- "cylinder": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "sphere": params { radius, domeOnly }
- "cone": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "torus": params { radius, tubeRadius }
- "gear": params { teeth, outerRadius, toothDepth, boreRadius, height }
- "twisted_vase": params { radiusBottom, radiusTop, height, wallThickness, twistDeg, ribCount, ribAmplitude }
- "bracket": params { width, depth, height, thickness, lipHeight }
- "hex_organizer": params { width, depth, height, wallThickness, slotsX, slotsY }

Jeder Node hat:
{
  "id": "string",
  "name": "Kurzer deutscher Bauteilname",
  "type": PrimitiveType,
  "operation": "union" | "subtract",
  "position": [x, y, z],
  "rotation": [rx, ry, rz],
  "scale": [sx, sy, sz],
  "color": "#HEX",
  "params": { ... }
}

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "title": "Projekttitel",
  "description": "Kurzbeschreibung",
  "filamentColor": "#10b981",
  "filamentType": "PLA",
  "infillPercent": 20,
  "layerHeightMm": 0.2,
  "summary": "Was wurde erstellt oder geändert",
  "nodes": [ ... ]
}`;

  const userMessage = existingScene
    ? `Aktuelles 3D-Modell (JSON):\n${JSON.stringify({
        title: existingScene.title,
        description: existingScene.description,
        printProfile: existingScene.printProfile,
        nodes: existingScene.nodes,
      })}\n\nUser-Prompt: "${prompt}"\nModifiziere das bestehende 3D-Modell gezielt nach dem Wunsch des Users (oder baue es komplett neu aus 4-10 Nodes auf, falls ein anderes Objekt gewünscht ist).`
    : `Erstelle ein detailliertes, mehrteiliges 3D-Druckmodell (mindestens 4-8 Nodes) für folgenden User-Prompt: "${prompt}"`;

  let lastError = 'Unbekannter Gemini API-Fehler';

  for (const model of models.slice(0, 2)) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${userMessage}` }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        let cleanMsg = errBody.slice(0, 160);
        try {
          const errJson = JSON.parse(errBody);
          if (errJson?.error?.message) cleanMsg = String(errJson.error.message);
        } catch {}
        lastError = `Gemini API (${model}, HTTP ${res.status}): ${cleanMsg}`;
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      const parsed = JSON.parse(cleaned) as {
        title?: string;
        description?: string;
        filamentColor?: string;
        filamentType?: 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'TPU';
        infillPercent?: number;
        layerHeightMm?: number;
        summary?: string;
        nodes?: Partial<PrimitiveNode>[];
      };

      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const defaultCol = ensureHighContrastColor(
          parsed.filamentColor || existingScene?.printProfile.filamentColor,
          '#10b981'
        );
        const sanitizedNodes: PrimitiveNode[] = parsed.nodes.map((n, idx) =>
          normalizePrimitiveNode(n, idx, defaultCol)
        );

        const nowIso = new Date().toISOString();
        const summaryText = parsed.summary || `3D-Modell per ${model} generiert`;
        const engineName = `Google Gemini (${model})`;

        const nextScene: SceneSpec = {
          projectId: existingScene?.projectId || `proj-${Date.now()}`,
          title: parsed.title || existingScene?.title || prompt.slice(0, 40),
          description: parsed.description || existingScene?.description || prompt,
          createdAt: existingScene?.createdAt || nowIso,
          updatedAt: nowIso,
          buildPlateMm: [256, 256, 256],
          printProfile: {
            ...(existingScene?.printProfile || DEFAULT_PRINT_PROFILE),
            filamentColor: defaultCol,
            filamentType:
              parsed.filamentType || existingScene?.printProfile.filamentType || 'PLA',
            infillPercent: Number(
              parsed.infillPercent || existingScene?.printProfile.infillPercent || 20
            ),
            layerHeightMm: Number(
              parsed.layerHeightMm || existingScene?.printProfile.layerHeightMm || 0.2
            ),
          },
          nodes: sanitizedNodes,
          promptHistory: [
            {
              id: `ph-${Date.now()}`,
              prompt,
              summary: summaryText,
              engine: engineName,
              timestamp: nowIso,
            },
            ...(existingScene?.promptHistory || []),
          ].slice(0, 30),
        };

        const compiled = compileSceneToMesh(nextScene);
        if (compiled.triangles.length >= 12) {
          return { scene: nextScene, summary: summaryText, engine: engineName };
        }
        lastError = `Gemini (${model}) lieferte ein leeres 3D-Mesh (${compiled.triangles.length} Dreiecke).`;
      } else {
        lastError = `Gemini (${model}) lieferte keine gültigen 3D-Nodes.`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    `KI-3D-Generierung fehlgeschlagen: ${hfError ? `Hugging Face (${hfError}) · ` : ''}${lastError}`
  );
}
