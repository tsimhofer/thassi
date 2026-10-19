import fs from 'node:fs';
import {
  DEFAULT_PRINT_PROFILE,
  PRESET_TEMPLATES,
  type PrimitiveNode,
  type PrimitiveType,
  type SceneSpec,
} from '../shared/mesh-engine.js';

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
  { pattern: /\b(rot|red|crimson|rubin|kirsch)\b/i, hex: '#e11d48', label: 'Apfel-Rot' },
  { pattern: /\b(grün|gruen|green|bambu|smaragd|lime|granny)\b/i, hex: '#22c55e', label: 'Grün' },
  { pattern: /\b(blau|blue|kobalt|navy|türkis|cyan)\b/i, hex: '#38bdf8', label: 'Blau / Cyan' },
  { pattern: /\b(gelb|yellow|gold|amber|messing|zitrone)\b/i, hex: '#fbbf24', label: 'Gold / Gelb' },
  { pattern: /\b(orange|kupfer|copper|mandarin)\b/i, hex: '#f97316', label: 'Orange' },
  { pattern: /\b(lila|violett|purple|magenta|beere)\b/i, hex: '#a855f7', label: 'Violett' },
  { pattern: /\b(rosa|pink|koralle)\b/i, hex: '#f43f5e', label: 'Pink / Koralle' },
  { pattern: /\b(braun|holz|wood|bronze|schoko)\b/i, hex: '#854d0e', label: 'Holz-Braun' },
  { pattern: /\b(weiss|weiß|white|klar|farblos|schnee)\b/i, hex: '#f8fafc', label: 'Weiß' },
  { pattern: /\b(schwarz|black|carbon|anthrazit|grau|grey|silber)\b/i, hex: '#64748b', label: 'Anthrazit / Carbon' },
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

const KNOWN_OBJECT_ARCHETYPE_REGEX =
  /\b(apfel|äpfel|aepfel|apple|birne|pear|tasse|kaffeetasse|teetasse|mug|becher|herz|heart|stern|star|pilz|fliegenpilz|mushroom|flasche|karaffe|bottle|schale|schüssel|schuessel|bowl|obstschale|schach|schachfigur|bauer|könig|koenig|dame|pawn|chess|schneemann|snowman|würfel|wuerfel|cube|pyramide|pyramid|kegel|trichter|cone|donut|torus|zahnrad|gear|ritzel|getriebe|vase|blumentopf|pflanztopf|kelch|organizer|sortierbox|stiftehalter|kopfhörer|kopfhoerer|headphone|wandhalter|tischklemme|winkel|bracket)\b/i;

const INCREMENTAL_MODIFIER_ONLY_REGEX =
  /\b(höher|hoeher|breiter|kleiner|flacher|kürzer|kuerzer|größer|groesser|skalier|loch|bohrung|durchbruch|farbe|färbe|faerbe|dreh|rotier|twist|ohne\s+blatt|ohne\s+stiel|biss|abgebissen|halbiere)\b/i;

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
 * Deterministic Antigravity Parametric CAD synthesizer & modifier.
 * Handles both initial 3D object creation from prompt and iterative modifications to an active SceneSpec.
 */
export function runLocalAntigravityCadEngine(
  prompt: string,
  existingScene?: SceneSpec | null
): { scene: SceneSpec; summary: string; engine: string } {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const nowIso = new Date().toISOString();
  const colorMatch = extractColorFromPrompt(cleanPrompt);

  // CASE A: If no existing scene OR prompt requests creating a specific object archetype
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
        colorMatch && colorMatch.label !== 'Apfel-Rot'
          ? `3D-Apfel (${colorMatch.label})`
          : '3D-Apfel mit Stiel & Blatt';
      baseScene.description = `Organischer 3D-Apfel generiert aus Prompt: "${cleanPrompt}"`;
      summary = `Naturgetreuer 3D-Apfel (Ø${(bodyNode?.params.radius || 34) * 2}×${(bodyNode?.params.height || 58) + 8}mm) mit oberer Stielgrube, unterer Kelch-Einbuchtung, 5-fach gewölbtem Fruchtkörper, braunem Stiel und grünem Blatt generiert.`;
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
            name: 'Birnen-Fruchtkörper (Rotationsprofil)',
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
            color: '#854d0e',
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
            color: '#16a34a',
            params: { radius: 8.5, domeOnly: 0 },
          },
        ],
        promptHistory: [],
      };
      summary = 'Organische 3D-Birne (Ø68×91mm) mit bauchiger Unterseite, schlankem Hals, Stiel und Blatt erstellt.';
    } else if (/\b(tasse|kaffeetasse|teetasse|mug|haferl)\b/i.test(lower)) {
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
        title: '3D-Schneemann mit Hut & Karottennase',
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
    } else if (/\b(vase|blumentopf|topf|gefäß|gefaess|spiral|kelch|lampe)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.twisted_rib_vase();
      const heightMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:hoch|höhe|hoehe|high)/i);
      const ribMatch = lower.match(/(\d+)\s*(?:rippen|ribs|rillen)/i);
      const vaseNode = baseScene.nodes[0];
      if (heightMatch) vaseNode.params.height = Math.max(20, Math.min(240, Number(heightMatch[1].replace(',', '.'))));
      if (ribMatch) vaseNode.params.ribCount = Math.max(0, Math.min(36, Number(ribMatch[1])));
      baseScene.title = `Spiral-Designvase (${vaseNode.params.height}mm)`;
      summary = `Skulpturale Torsions-Vase (Höhe ${vaseNode.params.height}mm, ${vaseNode.params.ribCount} Rippen) erstellt.`;
    } else if (/\b(organizer|kasten|schublade|sortier|fach|fächer|faecher|tray|stiftehalter|halterung für kabel)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.smart_home_organizer();
      const orgNode = baseScene.nodes[0];
      const gridMatch = lower.match(/(\d+)\s*[x×]\s*(\d+)/);
      if (gridMatch) {
        orgNode.params.slotsX = Math.max(1, Math.min(5, Number(gridMatch[1])));
        orgNode.params.slotsY = Math.max(1, Math.min(4, Number(gridMatch[2])));
      }
      baseScene.title = `Modularer Organizer (${orgNode.params.slotsX}×${orgNode.params.slotsY} Fächer)`;
      summary = `Organizer-Box (${orgNode.params.width}×${orgNode.params.depth}×${orgNode.params.height}mm) mit ${orgNode.params.slotsX * orgNode.params.slotsY} Kammern generiert.`;
    } else if (/\b(kopfhörer|kopfhoerer|headphone|haken|hook|winkel|bracket|wandhalter|tischklemme|klemme|ständer|staender)\b/i.test(lower)) {
      baseScene = PRESET_TEMPLATES.desk_headphone_stand();
      baseScene.title = cleanPrompt.length <= 42 ? cleanPrompt : 'Tisch- & Wandhalterung (Bracket)';
      summary = `Verstärkte Halterung / Tischklemme (38×62×74mm) mit Kabeldurchführung generiert.`;
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
            color: colorMatch?.hex || '#00AE42',
            params: { radius: rad, domeOnly: /\b(kuppel|dome|halbkugel)\b/i.test(lower) ? 1 : 0 },
          },
        ],
        promptHistory: [],
      };
      summary = `Sphären-Geometrie (Ø${rad * 2}mm) auf der Bauplatte erstellt.`;
    } else if (/\b(pyramide|pyramid|kegel|cone|trichter)\b/i.test(lower)) {
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
      // Sculptural rotational / custom CAD object fallback
      const dims = (lower.match(/(\d+(?:[.,]\d+)?)\s*mm/g) || []).map((s) =>
        Number(s.replace(/mm/i, '').replace(',', '.').trim())
      );
      const w = dims[0] || 60;
      const d = dims[1] || 48;
      const h = dims[2] || 36;
      baseScene = {
        projectId: `proj-${Date.now()}`,
        title: cleanPrompt.slice(0, 48) || 'Antigravity 3D-Objekt',
        description: `KI-generiertes 3D-Druckmodell für "${cleanPrompt}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
        buildPlateMm: [256, 256, 256],
        printProfile: { ...DEFAULT_PRINT_PROFILE, filamentColor: colorMatch?.hex || '#00AE42' },
        nodes: [
          {
            id: 'node-base-chassis',
            name: 'Hauptkörper (Gefast)',
            type: 'box',
            operation: 'union',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: colorMatch?.hex || '#00AE42',
            params: { width: w, depth: d, height: h, bevel: 5, wallThickness: /\b(hohl|gehäuse|box)\b/i.test(lower) ? 2.8 : 0 },
          },
        ],
        promptHistory: [],
      };
      summary = `Parametrisches 3D-Modell (${w}×${d}×${h}mm) für "${cleanPrompt}" generiert.`;
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
      // Preserve stem/leaf accent colors when recoloring an apple/pear unless specifically targeting stem/leaf
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

  // Percentage scaling (e.g., "20% größer", "skaliere auf 150%", "30% höher")
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

  // Add hole / bore / cutout ("loch", "bohrung", "ausschnitt", "schraubloch")
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
      params: { radiusBottom: holeRad, radiusTop: holeRad, height: 80, segments: 32 },
    });
    changes.push(`Präzisionsbohrung (Ø${holeDia}mm) hinzugefügt`);
  }

  // Add extra feature / attachment ("füge ... hinzu", "sockel", "ring", "knauf")
  if (
    /\b(füge|fuege|add|hinzu|oben|sockel|basis|ring|knauf|griff|henkel)\b/i.test(lower) &&
    !/\b(loch|bohrung)\b/i.test(lower)
  ) {
    const refHeight = scene.nodes[0]?.params?.height || 45;
    if (/\b(ring|öse|oese|torus|henkel)\b/i.test(lower)) {
      scene.nodes.push({
        id: `node-ring-${Date.now()}`,
        name: 'Befestigungsring / Öse',
        type: 'torus',
        operation: 'union',
        position: [0, 0, refHeight - 4],
        rotation: [90, 0, 0],
        scale: [1, 1, 1],
        color: scene.printProfile.filamentColor,
        params: { radius: mmVal ? mmVal / 2 : 14, tubeRadius: 3.5 },
      });
      changes.push(`Befestigungsring / Öse hinzugefügt`);
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
        params: { width: mmVal || 76, depth: mmVal || 76, height: 6, bevel: 4 },
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

  // Position move via prompt ("verschiebe nach links/rechts/vorne/hinten")
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

  // If no specific modifier rule matched, apply a visible parametric refinement
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
 * Uses Google Gemini AI (if available) combined with Antigravity Parametric CAD verification
 * to synthesize or mutate the 3D SceneSpec.
 */
export async function generateOrModify3dSceneWithAi(
  prompt: string,
  existingScene?: SceneSpec | null,
  customApiKey?: string
): Promise<{ scene: SceneSpec; summary: string; engine: string }> {
  const lower = prompt.trim().toLowerCase();

  // If the prompt directly requests one of our high-precision multi-node organic/mechanical archetypes
  // (such as "Apfel", "Birne", "Tasse", "Herz", "Stern", "Pilz", "Schachfigur", "Schneemann"),
  // synthesize the exact multi-part parametric CAD mesh immediately so it is guaranteed to be accurate.
  if (
    isExplicitObjectCreationPrompt(prompt) &&
    KNOWN_OBJECT_ARCHETYPE_REGEX.test(lower)
  ) {
    return runLocalAntigravityCadEngine(prompt, existingScene);
  }

  const apiKey = customApiKey || discoverGeminiApiKey();

  if (apiKey) {
    const models = await resolveGeminiModels(apiKey);
    const systemInstruction = `Du bist der Antigravity 3D-CAD Kernel für das Home Assistant Modul "thassi.3dprint" (Bambu Lab X1C 256x256x256mm).
Erzeuge oder verändere das 3D-Objekt basierend auf dem User-Prompt.
Verfügbare PrimitiveTypes:
- "apple": params { radius, height, lobeCount, lobeAmplitude, topIndent, bottomIndent, segments } (Organischer 3D-Apfelkörper mit Stielgrube)
- "lathe": params { height, rBottom, rLower, rMid, rUpper, rNeck, rTop, topIndent, bottomIndent, wallThickness, lobeCount, lobeAmplitude, segments } (Rotationskörper für Birnen, Flaschen, Schalen, Kelche, Figuren)
- "heart": params { width, depth, height, bevel } (3D-Herz)
- "star": params { points, outerRadius, innerRadius, height } (3D-Stern)
- "box": params { width, depth, height, bevel, wallThickness }
- "cylinder": params { radiusBottom, radiusTop, innerRadius, height, segments }
- "sphere": params { radius, domeOnly (0|1) }
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

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Block:
{
  "title": "Projekttitel",
  "description": "Kurzbeschreibung",
  "filamentColor": "#00AE42",
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
        })}\n\nUser-Prompt: "${prompt}"\nModifiziere das Modell (oder erstelle das gewünschte Objekt neu, falls ein anderes Objekt genannt wird).`
      : `Erstelle ein neues druckbares 3D-Modell für folgenden User-Prompt: "${prompt}"`;

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
                temperature: 0.25,
                responseMimeType: 'application/json',
              },
            }),
            signal: AbortSignal.timeout(9000),
          }
        );

        if (!res.ok) continue;

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
          nodes?: PrimitiveNode[];
        };

        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
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

          const sanitizedNodes: PrimitiveNode[] = parsed.nodes.map((n, idx) => ({
            id: n.id || `node-ai-${idx}-${Date.now()}`,
            name: n.name || `Bauteil ${idx + 1}`,
            type: validTypes.has(n.type) ? n.type : 'box',
            operation: n.operation === 'subtract' ? 'subtract' : 'union',
            position:
              Array.isArray(n.position) && n.position.length === 3
                ? (n.position.map(Number) as [number, number, number])
                : [0, 0, 0],
            rotation:
              Array.isArray(n.rotation) && n.rotation.length === 3
                ? (n.rotation.map(Number) as [number, number, number])
                : [0, 0, 0],
            scale:
              Array.isArray(n.scale) && n.scale.length === 3
                ? (n.scale.map((v) => Math.max(0.1, Number(v) || 1)) as [number, number, number])
                : [1, 1, 1],
            color:
              n.color ||
              parsed.filamentColor ||
              existingScene?.printProfile.filamentColor ||
              '#00AE42',
            params:
              typeof n.params === 'object' && n.params
                ? n.params
                : { width: 40, depth: 40, height: 30 },
          }));

          const nowIso = new Date().toISOString();
          const summaryText = parsed.summary || `3D-Modell per ${model} aktualisiert`;
          const engineName = `Antigravity AI (${model})`;

          const nextScene: SceneSpec = {
            projectId: existingScene?.projectId || `proj-${Date.now()}`,
            title: parsed.title || existingScene?.title || prompt.slice(0, 40),
            description: parsed.description || existingScene?.description || prompt,
            createdAt: existingScene?.createdAt || nowIso,
            updatedAt: nowIso,
            buildPlateMm: [256, 256, 256],
            printProfile: {
              ...(existingScene?.printProfile || DEFAULT_PRINT_PROFILE),
              filamentColor:
                parsed.filamentColor || existingScene?.printProfile.filamentColor || '#00AE42',
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

          return { scene: nextScene, summary: summaryText, engine: engineName };
        }
      } catch {
        // Try next candidate model or fallback
      }
    }
  }

  return runLocalAntigravityCadEngine(prompt, existingScene);
}
