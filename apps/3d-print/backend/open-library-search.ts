import {
  compileSceneToMesh,
  DEFAULT_PRINT_PROFILE,
  parseStlBufferToMeshData,
  type MeshStats,
  type SceneSpec,
} from '../shared/mesh-engine.js';

export interface OpenLibraryModelHit {
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

const DE_EN_TRANSLATIONS: Array<[RegExp, string]> = [
  [/(?:^|\s)(apfel|äpfel|aepfel)(?=$|\s|[.,!?-])/gi, ' apple '],
  [/(?:^|\s)(birne|birnen)(?=$|\s|[.,!?-])/gi, ' pear '],
  [/(?:^|\s)(käse|kaese)(?=$|\s|[.,!?-])/gi, ' cheese '],
  [/(?:^|\s)(baum|bäume|baeume)(?=$|\s|[.,!?-])/gi, ' tree '],
  [/(?:^|\s)(hund|hunde)(?=$|\s|[.,!?-])/gi, ' dog '],
  [/(?:^|\s)(katze|katzen)(?=$|\s|[.,!?-])/gi, ' cat '],
  [/(?:^|\s)(drache|drachen)(?=$|\s|[.,!?-])/gi, ' dragon '],
  [/(?:^|\s)(tasse|kaffeetasse|becher)(?=$|\s|[.,!?-])/gi, ' mug '],
  [/(?:^|\s)(herz|herzen)(?=$|\s|[.,!?-])/gi, ' heart '],
  [/(?:^|\s)(stern|sterne)(?=$|\s|[.,!?-])/gi, ' star '],
  [/(?:^|\s)(pilz|fliegenpilz)(?=$|\s|[.,!?-])/gi, ' mushroom '],
  [/(?:^|\s)(flasche|karaffe)(?=$|\s|[.,!?-])/gi, ' bottle '],
  [/(?:^|\s)(schale|schüssel|schuessel|obstschale)(?=$|\s|[.,!?-])/gi, ' bowl '],
  [/(?:^|\s)(schach|schachfigur|bauer|könig|koenig)(?=$|\s|[.,!?-])/gi, ' chess '],
  [/(?:^|\s)(schneemann)(?=$|\s|[.,!?-])/gi, ' snowman '],
  [/(?:^|\s)(zahnrad|zahnräder|getriebe|ritzel)(?=$|\s|[.,!?-])/gi, ' gear '],
  [/(?:^|\s)(vase|blumentopf|pflanztopf)(?=$|\s|[.,!?-])/gi, ' vase '],
  [/(?:^|\s)(organizer|sortierbox|stiftehalter|aufbewahrung)(?=$|\s|[.,!?-])/gi, ' desk organizer '],
  [/(?:^|\s)(kopfhörer|kopfhoerer|halterung|wandhalter|tischklemme|haken|winkel)(?=$|\s|[.,!?-])/gi, ' headphone stand '],
  [/(?:^|\s)(kabel|kabelhalter|kabelmanagement)(?=$|\s|[.,!?-])/gi, ' cable clip '],
  [/(?:^|\s)(gehäuse|gehaeuse|box|dose)(?=$|\s|[.,!?-])/gi, ' enclosure box '],
  [/(?:^|\s)(ständer|staender|handyhalter|smartphone)(?=$|\s|[.,!?-])/gi, ' phone stand '],
  [/(?:^|\s)(würfel|wuerfel)(?=$|\s|[.,!?-])/gi, ' cube '],
  [/(?:^|\s)(kugel|sphäre|sphaere)(?=$|\s|[.,!?-])/gi, ' sphere '],
  [/(?:^|\s)(trichter|kegel)(?=$|\s|[.,!?-])/gi, ' funnel '],
  [/(?:^|\s)(boot|schiff|benchy)(?=$|\s|[.,!?-])/gi, ' benchy '],
  [/(?:^|\s)(rakete|raumschiff)(?=$|\s|[.,!?-])/gi, ' rocket '],
  [/(?:^|\s)(roboter|figur)(?=$|\s|[.,!?-])/gi, ' robot '],
  [/(?:^|\s)(auto|rennauto)(?=$|\s|[.,!?-])/gi, ' car '],
  [/(?:^|\s)(schlüsselanhänger|schluesselanhaenger)(?=$|\s|[.,!?-])/gi, ' keychain '],
];

export function translatePromptToEnglish(prompt: string): string {
  let q = ` ${prompt.trim()} `;
  for (const [pattern, replacement] of DE_EN_TRANSLATIONS) {
    q = q.replace(pattern, replacement);
  }
  return q.replace(/\s+/g, ' ').slice(0, 90).trim();
}

interface PrintablesStlFile {
  id?: string;
  name?: string;
  fileSize?: number;
  filePreviewPath?: string;
}

interface PrintablesGqlItem {
  id?: string;
  name?: string;
  slug?: string;
  likesCount?: number;
  downloadCount?: number;
  stls?: PrintablesStlFile[];
  user?: {
    publicUsername?: string;
  };
  image?: {
    filePath?: string;
  };
}

async function fetchPrintablesHits(query: string, limit = 6): Promise<{
  items: PrintablesGqlItem[];
  error?: string;
}> {
  const graphqlQuery = {
    operationName: 'SearchModels',
    variables: {
      query,
      limit,
      ordering: 'best_match',
    },
    query: `
      query SearchModels($query: String!, $limit: Int, $ordering: SearchChoicesEnum) {
        result: searchPrints2(query: $query, limit: $limit, ordering: $ordering) {
          items {
            id
            name
            slug
            likesCount
            downloadCount
            stls {
              id
              name
              fileSize
              filePreviewPath
            }
            user {
              publicUsername
            }
            image {
              filePath
            }
          }
        }
      }
    `,
  };

  try {
    const res = await fetch('https://api.printables.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Thassi-3DPrint-Studio/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return { items: [], error: `Printables API HTTP ${res.status}` };
    }
    const parsed = (await res.json()) as {
      data?: {
        result?: {
          items?: PrintablesGqlItem[];
        };
      };
    };
    return { items: parsed?.data?.result?.items || [] };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'Verbindung zu Printables fehlgeschlagen.',
    };
  }
}

async function resolvePrintablesStlDownloadUrl(
  modelId: string,
  stlId: string
): Promise<string | null> {
  const mutation = {
    operationName: 'GetDownloadLink',
    variables: {
      id: stlId,
      modelId,
      fileType: 'stl',
      source: 'model_detail',
    },
    query: `
      mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, $source: DownloadSourceEnum!) {
        getDownloadLink(id: $id, printId: $modelId, fileType: $fileType, source: $source) {
          ok
          output {
            link
          }
        }
      }
    `,
  };

  try {
    const res = await fetch('https://api.printables.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Thassi-3DPrint-Studio/1.0',
      },
      body: JSON.stringify(mutation),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        getDownloadLink?: {
          ok?: boolean;
          output?: { link?: string };
        };
      };
    };
    return data?.data?.getDownloadLink?.output?.link || null;
  } catch {
    return null;
  }
}

async function downloadAndParseRealStl(
  stlUrl: string,
  modelId: string,
  title: string,
  author: string,
  slotIndex: number
): Promise<{ scene: SceneSpec; stats: MeshStats }> {
  const res = await fetch(stlUrl, {
    headers: { 'User-Agent': 'Thassi-3DPrint-Studio/1.0' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    throw new Error(`STL-Download fehlgeschlagen (HTTP ${res.status})`);
  }
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const parsed = parseStlBufferToMeshData(bytes, 5500);

  const slotColors = ['#38bdf8', '#a855f7', '#f59e0b', '#e2e8f0'];
  const color = slotColors[(slotIndex - 1) % slotColors.length];
  const nowIso = new Date().toISOString();

  const scene: SceneSpec = {
    projectId: `printables-${modelId}-${Date.now()}`,
    title,
    description: `Original STL-Mesh von Printables (@${author} · ${parsed.originalTriangles} Dreiecke)`,
    createdAt: nowIso,
    updatedAt: nowIso,
    buildPlateMm: [256, 256, 256],
    printProfile: {
      ...DEFAULT_PRINT_PROFILE,
      filamentColor: color,
    },
    nodes: [
      {
        id: `node-stl-${modelId}`,
        name: `${title} (Original STL)`,
        type: 'stl_mesh',
        operation: 'union',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color,
        params: {
          originalTriangles: parsed.originalTriangles,
          width: parsed.dimensionsMm.x,
          depth: parsed.dimensionsMm.y,
          height: parsed.dimensionsMm.z,
        },
        meshData: parsed.meshData,
      },
    ],
    promptHistory: [
      {
        id: `ph-stl-${Date.now()}`,
        prompt: `Import STL: ${title}`,
        summary: `Echtes 3D-STL-Mesh (${parsed.dimensionsMm.x}×${parsed.dimensionsMm.y}×${parsed.dimensionsMm.z}mm, ${parsed.originalTriangles} Dreiecke) von Printables geladen.`,
        engine: 'Printables Real STL Loader',
        timestamp: nowIso,
      },
    ],
  };

  const compiled = compileSceneToMesh(scene);
  return { scene, stats: compiled.stats };
}

export async function searchOpen3dLibraries(prompt: string): Promise<{
  query: string;
  expandedQuery: string;
  durationMs: number;
  liveSourceConnected: boolean;
  error?: string;
  items: OpenLibraryModelHit[];
}> {
  const t0 = Date.now();
  const cleanPrompt = prompt.trim();
  const englishQuery = translatePromptToEnglish(cleanPrompt);

  // Query Printables with the original prompt and (if different) the English translation in parallel
  const [resPrimary, resEnglish] = await Promise.all([
    fetchPrintablesHits(cleanPrompt, 10),
    englishQuery.toLowerCase() !== cleanPrompt.toLowerCase()
      ? fetchPrintablesHits(englishQuery, 10)
      : Promise.resolve({ items: [] as PrintablesGqlItem[], error: undefined }),
  ]);

  const error = resPrimary.error && resEnglish.error ? resPrimary.error : undefined;
  const seenIds = new Set<string>();
  const rawItems: PrintablesGqlItem[] = [];
  for (const it of [...resPrimary.items, ...resEnglish.items]) {
    if (it?.id && !seenIds.has(String(it.id))) {
      seenIds.add(String(it.id));
      rawItems.push(it);
    }
  }

  const expandedQuery =
    englishQuery.toLowerCase() !== cleanPrompt.toLowerCase()
      ? `${cleanPrompt} / ${englishQuery}`
      : cleanPrompt;

  if (error && rawItems.length === 0) {
    return {
      query: cleanPrompt,
      expandedQuery,
      durationMs: Date.now() - t0,
      liveSourceConnected: false,
      error,
      items: [],
    };
  }

  // Filter to models that have at least one genuine .stl file (not only .3mf)
  const candidates = rawItems
    .filter(
      (it) =>
        it &&
        it.id &&
        it.name &&
        Array.isArray(it.stls) &&
        it.stls.some((s) => /\.stl$/i.test(String(s.name || '').trim()))
    )
    .slice(0, 4);

  if (candidates.length === 0) {
    return {
      query: cleanPrompt,
      expandedQuery,
      durationMs: Date.now() - t0,
      liveSourceConnected: true,
      error: `Keine druckbaren STL-Modelle für "${cleanPrompt}" in den Open Libraries gefunden.`,
      items: [],
    };
  }

  const hits = await Promise.all(
    candidates.map(async (item, idx): Promise<OpenLibraryModelHit> => {
      const slotIndex = idx + 1;
      const modelId = String(item.id);
      const title = item.name || `Modell #${modelId}`;
      const author = item.user?.publicUsername || 'printables_user';
      const slug = item.slug || '';
      const externalUrl = `https://www.printables.com/model/${modelId}${slug ? `-${slug}` : ''}`;

      // Pick the primary/main .stl file (largest .stl under 16MB, avoiding tiny auxiliary pins/spacers/washers)
      const onlyStlFiles = (item.stls || []).filter((s) =>
        /\.stl$/i.test(String(s.name || '').trim())
      );
      const sortedByMainPart = [...onlyStlFiles].sort((a, b) => {
        const aAux = /\b(pin|peg|spacer|washer|clip|lid|cap|plug|test|accent|logo|insert|nut|bolt|rolle|rad)\b/i.test(
          String(a.name || '')
        )
          ? 1
          : 0;
        const bAux = /\b(pin|peg|spacer|washer|clip|lid|cap|plug|test|accent|logo|insert|nut|bolt|rolle|rad)\b/i.test(
          String(b.name || '')
        )
          ? 1
          : 0;
        if (aAux !== bAux) return aAux - bAux;
        return (b.fileSize || 0) - (a.fileSize || 0);
      });
      const bestStl =
        sortedByMainPart.find(
          (s) => (s.fileSize || 0) >= 1500 && (s.fileSize || 0) <= 16_000_000
        ) || sortedByMainPart[0];

      const previewPath = bestStl?.filePreviewPath || item.image?.filePath || null;
      const thumbnailUrl = previewPath
        ? `https://media.printables.com/${previewPath.replace(/^\/+/, '')}`
        : null;

      let stlDownloadUrl: string | null = null;
      let parametricScene: SceneSpec | null = null;
      let parametricStats: MeshStats | null = null;
      let meshError: string | undefined;

      if (bestStl?.id) {
        stlDownloadUrl = await resolvePrintablesStlDownloadUrl(modelId, String(bestStl.id));
        if (stlDownloadUrl) {
          try {
            const loaded = await downloadAndParseRealStl(
              stlDownloadUrl,
              modelId,
              title,
              author,
              slotIndex
            );
            parametricScene = loaded.scene;
            parametricStats = loaded.stats;
          } catch (err) {
            meshError =
              err instanceof Error ? err.message : 'STL-Mesh konnte nicht geparst werden.';
          }
        } else {
          meshError = 'Kein direkter STL-Downloadlink verfügbar.';
        }
      } else {
        meshError = 'Keine STL-Datei im Modell enthalten.';
      }

      return {
        id: `printables-${modelId}`,
        slotIndex,
        repository: 'PRINTABLES',
        title,
        author,
        summary: parametricStats
          ? `@${author} · ${parametricStats.dimensionsMm.x}×${parametricStats.dimensionsMm.y}×${parametricStats.dimensionsMm.z}mm`
          : `@${author}`,
        externalUrl,
        thumbnailUrl,
        stlFileName: bestStl?.name || null,
        stlDownloadUrl,
        likes: Number(item.likesCount ?? 0),
        downloads: Number(item.downloadCount ?? 0),
        dimensionsLabel: parametricStats
          ? `${parametricStats.dimensionsMm.x}×${parametricStats.dimensionsMm.y}×${parametricStats.dimensionsMm.z} mm`
          : bestStl?.fileSize
            ? `${Math.round(bestStl.fileSize / 1024)} KB STL`
            : 'STL',
        parametricScene,
        parametricStats,
        meshError,
      };
    })
  );

  return {
    query: cleanPrompt,
    expandedQuery,
    durationMs: Date.now() - t0,
    liveSourceConnected: true,
    items: hits,
  };
}
