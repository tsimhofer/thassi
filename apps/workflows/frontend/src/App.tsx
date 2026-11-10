import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';
import HassOsMonitorApp from '../../../system-monitor/frontend/src/App';
import {
  ApiCredentialsStatus,
  AxonDescriptor,
  AxonExecutionResult,
  AxonFieldSchema,
  DEFAULT_STARTER_WORKFLOWS,
  IntegrationCategory,
  NodePaletteTemplate,
  SavedWorkflow,
  STARTER_NODE_PALETTE,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunReport,
} from '../../shared/types';

function getApiBase(): string {
  return `${getHostBaseUrl()}/api/apps/workflows`;
}

const GLOBAL_VARS_CSS = `
  :root {
    --bg-canvas: #09090b;
    --bg-surface: #111113;
    --bg-elevated: #18181b;
    --bg-input: #141417;
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-default: rgba(255, 255, 255, 0.10);
    --border-focus: rgba(255, 255, 255, 0.24);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --status-nominal: #10b981;
    --status-attention: #f59e0b;
    --status-critical: #ef4444;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }
`;

type ViewMode = 'catalog' | 'hass_os' | 'pc' | 'chains' | 'credentials';
type GroupingMode = 'quickGroup' | 'domain' | 'status' | 'flat';

interface QuickGroupMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  domains: string[];
}

interface DomainMeta {
  code: string;
  label: string;
  description: string;
  quickGroupId: string;
}

const QUICK_GROUPS: QuickGroupMeta[] = [
  {
    id: 'ALL',
    label: 'Alle Bereiche',
    shortLabel: 'Alle',
    description: 'Gesamter Katalog aller 53 registrierten System-Axons',
    domains: [],
  },
  {
    id: 'SMARTHOME',
    label: 'Smart Home & Technik',
    shortLabel: 'Smart Home & Technik',
    description: 'Home Assistant, Shelly-Leistung, EPEX-Strom & Sprit, FRITZ!Box, Kameras, 3D-Druck & Peripherie',
    domains: ['HA', 'ENERGY', 'NET', 'VISION', '3DP', 'SYS'],
  },
  {
    id: 'WORKSTATION_AI',
    label: 'Workstation, KI & Wissen',
    shortLabel: 'Workstation & KI',
    description: 'DESKTOP-M8TJERB Fernsteuerung, Gemini & Cortex KI, Memo Wissensspeicher und GitHub',
    domains: ['PC', 'AI', 'MEMO', 'GH'],
  },
  {
    id: 'GOOGLE_MEDIA',
    label: 'Google, Vitaldaten & Medien',
    shortLabel: 'Google & Medien',
    description: 'Google Kalender, Gmail, Drive, Google Fit & Wearables, Mediaplayer und YouTube',
    domains: ['GCAL', 'GMAIL', 'DRIVE', 'FIT', 'MEDIA', 'YT'],
  },
  {
    id: 'LIFE_FINANCE',
    label: 'Alltag, Einkauf & Finanzen',
    shortLabel: 'Alltag & Finanzen',
    description: 'Finanzen & EZB-Kurse, Wochenplan & Rezepte, SPAR/BILLA Preisvergleich, Routen & Wetter',
    domains: ['FIN', 'MEALS', 'MARKET', 'MAPS', 'WX'],
  },
  {
    id: 'AUTOMATION',
    label: 'Auslöser & HTTP',
    shortLabel: 'Auslöser & HTTP',
    description: 'Zeitpläne, Cron-Trigger, manuelle Webhooks und universelle REST-Aufrufe',
    domains: ['TRIG', 'HTTP'],
  },
];

const DOMAIN_META_LIST: DomainMeta[] = [
  // Smart Home & Technik
  {
    code: 'HA',
    label: 'Home Assistant',
    description: 'Entitäten, Sensoren, Raum-Snapshots, Dienste und Shelly-Leistungsmessung',
    quickGroupId: 'SMARTHOME',
  },
  {
    code: 'ENERGY',
    label: 'Energie & Mobilität',
    description: 'aWATTar EPEX-Spot Strompreise (AT) und E-Control Live-Spritpreise',
    quickGroupId: 'SMARTHOME',
  },
  {
    code: 'NET',
    label: 'Netzwerk & Mesh',
    description: 'FRITZ!Box 6890 LTE Gateway, WLAN-Mesh, Tailscale VPN und WAN-Telemetrie',
    quickGroupId: 'SMARTHOME',
  },
  {
    code: 'VISION',
    label: 'Kamera-Vision',
    description: 'COCO-SSD Objekterkennung, Bewegungswerte und Kamera-Diagnose',
    quickGroupId: 'SMARTHOME',
  },
  {
    code: '3DP',
    label: '3D-Druck (BambuLab)',
    description: 'BambuLab X1C LAN-Telemetrie, Shelly-Steckdose und aktive Druckprojekte',
    quickGroupId: 'SMARTHOME',
  },
  {
    code: 'SYS',
    label: 'System & Peripherie',
    description: 'Epson/Brother Druckerstände, Batterie-Flotte und gemeinsame System-Notizen',
    quickGroupId: 'SMARTHOME',
  },

  // Workstation, KI & Wissen
  {
    code: 'PC',
    label: 'Workstation (PC-Bridge)',
    description: 'DESKTOP-M8TJERB Telemetrie, Wake-on-LAN, Windows-Login, PowerShell, Audio & Antigravity',
    quickGroupId: 'WORKSTATION_AI',
  },
  {
    code: 'AI',
    label: 'KI & Cortex (Gemini)',
    description: 'Google Gemini Textsynthese und kontextangereicherte Cortex-Intelligenz',
    quickGroupId: 'WORKSTATION_AI',
  },
  {
    code: 'MEMO',
    label: 'Memo Wissensspeicher',
    description: 'Föderierte Suche über Drive, Markdown-Vault, Notizen und SQLite-Datenbanken',
    quickGroupId: 'WORKSTATION_AI',
  },
  {
    code: 'GH',
    label: 'GitHub Repositories',
    description: 'Issues und Pull Requests abfragen oder automatisiert neue Issues anlegen',
    quickGroupId: 'WORKSTATION_AI',
  },

  // Google, Vitaldaten & Medien
  {
    code: 'GCAL',
    label: 'Google Kalender',
    description: 'Kommende Termine abrufen, neue Kalendereinträge erstellen oder löschen',
    quickGroupId: 'GOOGLE_MEDIA',
  },
  {
    code: 'GMAIL',
    label: 'Gmail Postfach',
    description: 'Ungelesene E-Mails filtern, durchsuchen und automatisierte Berichte senden',
    quickGroupId: 'GOOGLE_MEDIA',
  },
  {
    code: 'DRIVE',
    label: 'Google Drive',
    description: 'Zuletzt geänderte Dateien auflisten und Dokumentinhalte direkt exportieren',
    quickGroupId: 'GOOGLE_MEDIA',
  },
  {
    code: 'FIT',
    label: 'Gesundheit & Wearables',
    description: 'Pixel 10 / Pixel Watch Live-Biometrie und Google Fit Tagesbilanzen',
    quickGroupId: 'GOOGLE_MEDIA',
  },
  {
    code: 'MEDIA',
    label: 'Mediaplayer & Audio',
    description: 'Aktive Home Assistant Mediaplayer (Music Assistant, TV, Cast, Xbox) steuern',
    quickGroupId: 'GOOGLE_MEDIA',
  },
  {
    code: 'YT',
    label: 'YouTube Feeds & Suche',
    description: 'YouTube Video-/Kanalsuche und schlüssellose XML-Atom Kanal-Feeds',
    quickGroupId: 'GOOGLE_MEDIA',
  },

  // Alltag, Einkauf & Finanzen
  {
    code: 'FIN',
    label: 'Finanzen & Währungen',
    description: 'Kontostand, Cashflow-KPIs, Hauptbuch-Suche und EZB-Wechselkurse',
    quickGroupId: 'LIFE_FINANCE',
  },
  {
    code: 'MEALS',
    label: 'Ernährung & Einkaufsliste',
    description: '7-Tage-Wochenplan, Makronährstoffe, Einkaufsliste und OpenFoodFacts Barcode-Scan',
    quickGroupId: 'LIFE_FINANCE',
  },
  {
    code: 'MARKET',
    label: 'Supermarkt-Preisvergleich',
    description: 'SPAR & BILLA Österreich Live-Preissuche, Warenkorb-Optimierer und EAN-Resolver',
    quickGroupId: 'LIFE_FINANCE',
  },
  {
    code: 'MAPS',
    label: 'Routen & Pendeln',
    description: 'OSRM Live-Fahrzeit, Distanz und Geokodierung ab St. Veit an der Gölsen',
    quickGroupId: 'LIFE_FINANCE',
  },
  {
    code: 'WX',
    label: 'Wetter & Umwelt',
    description: 'Open-Meteo Live-Wetterdaten, Wind, Luftfeuchte und 24-Stunden-Prognose',
    quickGroupId: 'LIFE_FINANCE',
  },

  // Auslöser & HTTP
  {
    code: 'TRIG',
    label: 'Auslöser (Trigger)',
    description: 'Manuelle Starts, HTTP-Webhooks und wiederkehrende Cron-Zeitpläne',
    quickGroupId: 'AUTOMATION',
  },
  {
    code: 'HTTP',
    label: 'HTTP / REST-Client',
    description: 'Generische GET/POST/PUT/DELETE-Anfragen an externe Schnittstellen',
    quickGroupId: 'AUTOMATION',
  },
];

const DOMAIN_META_MAP: Record<string, DomainMeta> = Object.fromEntries(
  DOMAIN_META_LIST.map((d) => [d.code, d])
);

function getDomainMeta(code: string): DomainMeta {
  return (
    DOMAIN_META_MAP[code] || {
      code,
      label: code,
      description: `System-Domäne ${code}`,
      quickGroupId: 'SMARTHOME',
    }
  );
}

interface AxonSectionGroup {
  key: string;
  codeBadge: string;
  title: string;
  subtitle: string;
  axons: AxonDescriptor[];
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [axons, setAxons] = useState<AxonDescriptor[]>([]);
  const [palette, setPalette] = useState<NodePaletteTemplate[]>(STARTER_NODE_PALETTE);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>(DEFAULT_STARTER_WORKFLOWS);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(
    DEFAULT_STARTER_WORKFLOWS[0]?.id || ''
  );

  // Filter & Grouping state
  const [selectedQuickGroupId, setSelectedQuickGroupId] = useState<string>('ALL');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('domain');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAxonId, setSelectedAxonId] = useState<string>('ha.energy.live_power');

  // Per-axon live input state & execution results
  const [axonInputs, setAxonInputs] = useState<Record<string, Record<string, any>>>({});
  const [axonResults, setAxonResults] = useState<Record<string, AxonExecutionResult>>({});
  const [runningAxonIds, setRunningAxonIds] = useState<Record<string, boolean>>({});
  const [outputViewMode, setOutputViewMode] = useState<'table' | 'formatted' | 'json'>('table');

  // Chain / Flow builder state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [isExecutingChain, setIsExecutingChain] = useState(false);
  const [isSavingChain, setIsSavingChain] = useState(false);
  const [lastRunReport, setLastRunReport] = useState<WorkflowRunReport | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);

  // Credentials state
  const [credStatus, setCredStatus] = useState<ApiCredentialsStatus>({
    geminiConfigured: false,
    githubConfigured: false,
    googleConfigured: false,
    haConfigured: true,
    haUrl: 'http://supervisor/core',
  });
  const [credForm, setCredForm] = useState({
    geminiApiKey: '',
    githubToken: '',
    googleOAuthToken: '',
    haToken: '',
  });

  // Dragging state for Chain Builder
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Bootstrap fetch
  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const res = await fetch(`${getApiBase()}/bootstrap`);
        if (res.ok) {
          const data = await res.json();
          if (!mounted) return;

          if (Array.isArray(data.axons) && data.axons.length > 0) {
            setAxons(data.axons);
            const defaults: Record<string, Record<string, any>> = {};
            const initialResults: Record<string, AxonExecutionResult> = {};
            for (const ax of data.axons as AxonDescriptor[]) {
              defaults[ax.id] = { ...(ax.defaultInput || {}) };
              if (ax.lastStatus && ax.lastStatus !== 'idle' && ax.lastSummary) {
                initialResults[ax.id] = {
                  axonId: ax.id,
                  ok: ax.lastStatus === 'success',
                  status: ax.lastStatus,
                  durationMs: ax.lastDurationMs ?? 0,
                  executedAt: ax.lastExecutedAt || '',
                  summary: ax.lastSummary,
                  data: { summary: ax.lastSummary, totalRuns: ax.totalRuns ?? 1 },
                  error: ax.lastStatus === 'error' ? ax.lastSummary : undefined,
                };
              }
            }
            setAxonInputs((prev) => ({ ...defaults, ...prev }));
            setAxonResults((prev) => ({ ...initialResults, ...prev }));
          }
          if (Array.isArray(data.palette) && data.palette.length > 0) {
            setPalette(data.palette);
          }
          if (Array.isArray(data.workflows) && data.workflows.length > 0) {
            setWorkflows(data.workflows);
            setActiveWorkflowId(data.workflows[0].id);
          }
          if (data.credentialsStatus) {
            setCredStatus(data.credentialsStatus);
          }
          return;
        }
      } catch {
        // Fallback below
      }

      try {
        const sysRes = await fetch(`${getHostBaseUrl()}/api/system/actions`);
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          if (mounted && Array.isArray(sysData.actions) && sysData.actions.length > 0) {
            setAxons(sysData.actions);
          }
        }
      } catch {
        // Ignore
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedAxon = useMemo(
    () => axons.find((a) => a.id === selectedAxonId) || axons[0] || null,
    [axons, selectedAxonId]
  );

  // Quick-Group counts
  const quickGroupCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: axons.length };
    for (const qg of QUICK_GROUPS) {
      if (qg.id === 'ALL') continue;
      counts[qg.id] = axons.filter((a) => qg.domains.includes(a.domainCode)).length;
    }
    return counts;
  }, [axons]);

  // Domain counts
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: axons.length };
    for (const ax of axons) {
      counts[ax.domainCode] = (counts[ax.domainCode] || 0) + 1;
    }
    return counts;
  }, [axons]);

  // Visible domain pills based on selected Quick-Group
  const visibleDomains = useMemo(() => {
    const activeQg = QUICK_GROUPS.find((q) => q.id === selectedQuickGroupId);
    if (!activeQg || activeQg.id === 'ALL') {
      return DOMAIN_META_LIST.filter((d) => (domainCounts[d.code] || 0) > 0);
    }
    return DOMAIN_META_LIST.filter(
      (d) => activeQg.domains.includes(d.code) && (domainCounts[d.code] || 0) > 0
    );
  }, [selectedQuickGroupId, domainCounts]);

  // Filtered Axons
  const filteredAxons = useMemo(() => {
    const activeQg = QUICK_GROUPS.find((q) => q.id === selectedQuickGroupId);
    const q = searchQuery.trim().toLowerCase();

    return axons.filter((ax) => {
      if (activeQg && activeQg.id !== 'ALL' && !activeQg.domains.includes(ax.domainCode)) {
        return false;
      }
      if (selectedDomain !== 'ALL' && ax.domainCode !== selectedDomain) {
        return false;
      }
      if (!q) return true;
      const domMeta = getDomainMeta(ax.domainCode);
      return (
        ax.id.toLowerCase().includes(q) ||
        ax.name.toLowerCase().includes(q) ||
        ax.description.toLowerCase().includes(q) ||
        ax.domainCode.toLowerCase().includes(q) ||
        domMeta.label.toLowerCase().includes(q) ||
        domMeta.description.toLowerCase().includes(q)
      );
    });
  }, [axons, selectedQuickGroupId, selectedDomain, searchQuery]);

  // Grouped Sections
  const groupedSections = useMemo<AxonSectionGroup[]>(() => {
    if (groupingMode === 'flat') {
      return [
        {
          key: 'flat-all',
          codeBadge: 'KATALOG',
          title: 'Alle gefilterten Axons',
          subtitle: `${filteredAxons.length} ausführbare System-Aktionen`,
          axons: filteredAxons,
        },
      ];
    }

    if (groupingMode === 'quickGroup') {
      const sections: AxonSectionGroup[] = [];
      for (const qg of QUICK_GROUPS) {
        if (qg.id === 'ALL') continue;
        const matching = filteredAxons.filter((ax) => qg.domains.includes(ax.domainCode));
        if (matching.length === 0) continue;
        sections.push({
          key: `qg-${qg.id}`,
          codeBadge: qg.domains.join(' · '),
          title: qg.label,
          subtitle: qg.description,
          axons: matching,
        });
      }
      return sections;
    }

    if (groupingMode === 'status') {
      const executedOk = filteredAxons.filter((ax) => axonResults[ax.id]?.ok === true);
      const executedErr = filteredAxons.filter((ax) => axonResults[ax.id]?.ok === false);
      const idle = filteredAxons.filter((ax) => !axonResults[ax.id]);
      const sections: AxonSectionGroup[] = [];
      if (executedErr.length > 0) {
        sections.push({
          key: 'status-err',
          codeBadge: 'FEHLER',
          title: 'Mit Fehler beendet',
          subtitle: 'Axons, deren letzte Ausführung in dieser Sitzung einen Fehler gemeldet hat',
          axons: executedErr,
        });
      }
      if (executedOk.length > 0) {
        sections.push({
          key: 'status-ok',
          codeBadge: 'AKTIV',
          title: 'Erfolgreich ausgeführt',
          subtitle: 'Axons mit vorliegenden Live-Ergebnisdaten in dieser Sitzung',
          axons: executedOk,
        });
      }
      if (idle.length > 0) {
        sections.push({
          key: 'status-idle',
          codeBadge: 'BEREIT',
          title: 'Bereit zur Ausführung',
          subtitle: 'Noch nicht ausgeführte Axons im aktuellen Sitzungsverlauf',
          axons: idle,
        });
      }
      return sections;
    }

    // Default: 'domain' grouping
    const sections: AxonSectionGroup[] = [];
    const seenDomains = new Set<string>();
    for (const dm of DOMAIN_META_LIST) {
      const matching = filteredAxons.filter((ax) => ax.domainCode === dm.code);
      if (matching.length === 0) continue;
      seenDomains.add(dm.code);
      sections.push({
        key: `dom-${dm.code}`,
        codeBadge: dm.code,
        title: dm.label,
        subtitle: dm.description,
        axons: matching,
      });
    }
    // Any fallback domains not in DOMAIN_META_LIST
    for (const ax of filteredAxons) {
      if (seenDomains.has(ax.domainCode)) continue;
      seenDomains.add(ax.domainCode);
      const matching = filteredAxons.filter((a) => a.domainCode === ax.domainCode);
      sections.push({
        key: `dom-${ax.domainCode}`,
        codeBadge: ax.domainCode,
        title: ax.domainCode,
        subtitle: `Domäne ${ax.domainCode}`,
        axons: matching,
      });
    }
    return sections;
  }, [filteredAxons, groupingMode, axonResults]);

  const handleSelectQuickGroup = (qgId: string) => {
    setSelectedQuickGroupId(qgId);
    setSelectedDomain('ALL');
  };

  const handleSelectDomain = (domCode: string) => {
    if (selectedDomain === domCode) {
      setSelectedDomain('ALL');
    } else {
      setSelectedDomain(domCode);
    }
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const allGroupsCollapsed = useMemo(() => {
    if (groupedSections.length === 0) return false;
    return groupedSections.every((sec) => Boolean(collapsedGroups[sec.key]));
  }, [groupedSections, collapsedGroups]);

  const toggleAllGroups = () => {
    if (allGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      for (const sec of groupedSections) {
        next[sec.key] = true;
      }
      setCollapsedGroups(next);
    }
  };

  const updateAxonInput = (axonId: string, key: string, value: any) => {
    setAxonInputs((prev) => ({
      ...prev,
      [axonId]: {
        ...(prev[axonId] || {}),
        [key]: value,
      },
    }));
  };

  const executeAxon = useCallback(
    async (axon: AxonDescriptor, customInput?: Record<string, any>) => {
      const inputPayload = customInput ?? axonInputs[axon.id] ?? axon.defaultInput ?? {};
      setRunningAxonIds((prev) => ({ ...prev, [axon.id]: true }));
      try {
        const res = await fetch(`${getApiBase()}/execute-axon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            axonId: axon.id,
            input: inputPayload,
          }),
        });
        const raw = await res.json();
        const inner = raw.result || raw;
        const isOk =
          typeof raw.ok === 'boolean'
            ? raw.ok
            : typeof inner.ok === 'boolean'
              ? inner.ok
              : inner.status === 'success';
        const normalized: AxonExecutionResult = {
          axonId: inner.axonId || inner.actionId || axon.id,
          ok: isOk,
          status: isOk ? 'success' : 'error',
          durationMs: inner.durationMs ?? raw.durationMs ?? 0,
          executedAt: inner.executedAt || new Date().toISOString(),
          summary: inner.summary || raw.summary || (isOk ? 'Erfolgreich ausgeführt' : 'Fehler'),
          data: inner.data ?? raw.data ?? null,
          error: isOk ? undefined : inner.error || raw.error || inner.summary || 'Ausführungsfehler',
        };
        setAxonResults((prev) => ({ ...prev, [axon.id]: normalized }));
        setSelectedAxonId(axon.id);
      } catch (err: any) {
        setAxonResults((prev) => ({
          ...prev,
          [axon.id]: {
            axonId: axon.id,
            ok: false,
            durationMs: 0,
            executedAt: new Date().toISOString(),
            summary: 'Netzwerk- oder Ausführungsfehler',
            data: null,
            error: err?.message || String(err),
          },
        }));
      } finally {
        setRunningAxonIds((prev) => ({ ...prev, [axon.id]: false }));
      }
    },
    [axonInputs]
  );

  // Active Workflow for Chain Builder
  const activeWorkflow = useMemo(
    () => workflows.find((w) => w.id === activeWorkflowId) || workflows[0],
    [workflows, activeWorkflowId]
  );

  const selectedNode = useMemo(
    () => activeWorkflow?.nodes.find((n) => n.id === selectedNodeId) || null,
    [activeWorkflow, selectedNodeId]
  );

  const updateActiveWorkflow = useCallback(
    (updater: (wf: SavedWorkflow) => SavedWorkflow) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === activeWorkflow?.id
            ? updater({ ...w, updatedAt: new Date().toISOString() })
            : w
        )
      );
    },
    [activeWorkflow?.id]
  );

  const handleAddNodeFromAxon = (axon: AxonDescriptor) => {
    if (!activeWorkflow) return;
    const count = activeWorkflow.nodes.length;
    const newNode: WorkflowNode = {
      id: `node-${Date.now().toString(36)}`,
      typeId: axon.id,
      category: axon.category,
      name: axon.name,
      subtitle: axon.id,
      icon: axon.domainCode,
      accentColor: '#fafafa',
      n8nType: `thassi.axon.${axon.id}`,
      x: 80 + (count % 4) * 260,
      y: 90 + Math.floor(count / 4) * 140,
      config: { ...(axon.defaultInput || {}) },
    };

    updateActiveWorkflow((wf) => {
      const nextNodes = [...wf.nodes, newNode];
      const nextEdges = [...wf.edges];
      if (selectedNodeId && wf.nodes.some((n) => n.id === selectedNodeId)) {
        nextEdges.push({
          id: `e-${selectedNodeId}-${newNode.id}`,
          sourceNodeId: selectedNodeId,
          targetNodeId: newNode.id,
        });
      } else if (wf.nodes.length > 0) {
        const prevLast = wf.nodes[wf.nodes.length - 1];
        nextEdges.push({
          id: `e-${prevLast.id}-${newNode.id}`,
          sourceNodeId: prevLast.id,
          targetNodeId: newNode.id,
        });
      }
      return { ...wf, nodes: nextNodes, edges: nextEdges };
    });
    setSelectedNodeId(newNode.id);
    setViewMode('chains');
  };

  // Canvas drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, node: WorkflowNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDraggingNode({
      id: node.id,
      offsetX: e.clientX - rect.left - node.x,
      offsetY: e.clientY - rect.top - node.y,
    });
  };

  useEffect(() => {
    if (!draggingNode) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const nextX = Math.max(16, Math.round((e.clientX - rect.left - draggingNode.offsetX) / 10) * 10);
      const nextY = Math.max(16, Math.round((e.clientY - rect.top - draggingNode.offsetY) / 10) * 10);
      updateActiveWorkflow((wf) => ({
        ...wf,
        nodes: wf.nodes.map((n) => (n.id === draggingNode.id ? { ...n, x: nextX, y: nextY } : n)),
      }));
    };
    const handleMouseUp = () => setDraggingNode(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNode, updateActiveWorkflow]);

  const handleSaveWorkflow = async () => {
    if (!activeWorkflow) return;
    setIsSavingChain(true);
    try {
      const res = await fetch(`${getApiBase()}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: activeWorkflow }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusBanner({ type: 'success', text: `Ablauf „${activeWorkflow.name}“ gespeichert.` });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Speichern fehlgeschlagen: ${err.message}` });
    } finally {
      setIsSavingChain(false);
    }
  };

  const handleExecuteWorkflow = async () => {
    if (!activeWorkflow) return;
    setIsExecutingChain(true);
    setStatusBanner({ type: 'info', text: `Führe „${activeWorkflow.name}“ aus...` });
    try {
      const res = await fetch(`${getApiBase()}/execute-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: activeWorkflow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLastRunReport(data.report);
      setStatusBanner({
        type: data.report.status === 'success' ? 'success' : 'error',
        text: `Ausführung abgeschlossen (${data.report.status === 'success' ? 'Erfolgreich' : 'Fehler'}).`,
      });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Ausführung fehlgeschlagen: ${err.message}` });
    } finally {
      setIsExecutingChain(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${getApiBase()}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCredStatus(data.credentialsStatus);
      setCredForm({ geminiApiKey: '', githubToken: '', googleOAuthToken: '', haToken: '' });
      setStatusBanner({ type: 'success', text: 'Zugangsdaten in SQLite aktualisiert.' });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Zugangsdaten-Fehler: ${err.message}` });
    }
  };

  const activeResult = selectedAxon ? axonResults[selectedAxon.id] : undefined;
  const isSelectedRunning = selectedAxon ? Boolean(runningAxonIds[selectedAxon.id]) : false;
  const executedCount = Object.keys(axonResults).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      <style>{GLOBAL_VARS_CSS}</style>
      {/* TOP INSTRUMENT BAR */}
      <header
        style={{
          height: 48,
          minHeight: 48,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--status-nominal)',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-primary)',
              }}
            >
              THASSI AXONS
            </span>
          </div>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {axons.length} System-Axons · {DOMAIN_META_LIST.length} Domänen · {executedCount} ausgeführt
          </span>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: 'var(--bg-canvas)',
              padding: 2,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            {(
              [
                { id: 'catalog', label: 'Axon-Katalog & Inspektor' },
                { id: 'hass_os', label: 'HASS OS & Prozesse' },
                { id: 'pc', label: 'PC-Bridge (Web-VNC)' },
                { id: 'chains', label: `Abläufe & Ketten (${workflows.length})` },
                { id: 'credentials', label: 'Zugangsdaten' },
              ] as const
            ).map((tab) => {
              const active = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  style={{
                    background: active ? 'var(--bg-elevated)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: active ? '1px solid var(--border-default)' : '1px solid transparent',
                    borderRadius: 4,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: active ? 500 : 400,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Connection status indicators */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            <StatusPill label="HA" ok={credStatus.haConfigured} />
            <StatusPill label="GOOGLE" ok={credStatus.googleConfigured} />
            <StatusPill label="GEMINI" ok={credStatus.geminiConfigured} />
            <StatusPill label="GH" ok={credStatus.githubConfigured} />
          </div>
        </div>
      </header>

      {/* STATUS BANNER */}
      {statusBanner && (
        <div
          style={{
            height: 32,
            minHeight: 32,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-default)',
            fontSize: 12,
            color:
              statusBanner.type === 'error'
                ? 'var(--status-critical)'
                : statusBanner.type === 'success'
                ? 'var(--status-nominal)'
                : 'var(--text-secondary)',
          }}
        >
          <span>{statusBanner.text}</span>
          <button
            onClick={() => setStatusBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Schließen
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      {viewMode === 'catalog' && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* LEFT: STRUCTURED AXON REGISTRY WITH QUICK-GROUPING */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--border-subtle)',
              minWidth: 0,
            }}
          >
            {/* TIER 1: SEARCH + QUICK-GROUPS (SCHNELLGRUPPEN) + GROUPING MODE */}
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Top Control Line: Search + Grouping Mode Switcher */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                {/* Search Box */}
                <div style={{ position: 'relative', width: 320, flexShrink: 0 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Axons durchsuchen (Name, Beschreibung, ID, Domäne)..."
                    style={{
                      width: '100%',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                      padding: '6px 28px 6px 10px',
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      title="Suche zurücksetzen"
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 13,
                        padding: '0 4px',
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Right: Grouping Mode Switcher & Expand/Collapse */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Ansicht:
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      background: 'var(--bg-canvas)',
                      padding: 2,
                      borderRadius: 5,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {(
                      [
                        { id: 'domain', label: 'Nach Domäne' },
                        { id: 'quickGroup', label: 'Nach Themenbereich' },
                        { id: 'status', label: 'Nach Status' },
                        { id: 'flat', label: 'Kompaktliste' },
                      ] as const
                    ).map((gm) => {
                      const active = groupingMode === gm.id;
                      return (
                        <button
                          key={gm.id}
                          onClick={() => setGroupingMode(gm.id)}
                          style={{
                            background: active ? 'var(--bg-elevated)' : 'transparent',
                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            border: active
                              ? '1px solid var(--border-default)'
                              : '1px solid transparent',
                            borderRadius: 4,
                            padding: '3px 9px',
                            fontSize: 11.5,
                            fontWeight: active ? 500 : 400,
                            cursor: 'pointer',
                          }}
                        >
                          {gm.label}
                        </button>
                      );
                    })}
                  </div>

                  {groupingMode !== 'flat' && (
                    <button
                      onClick={toggleAllGroups}
                      style={{
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 5,
                        padding: '4px 9px',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {allGroupsCollapsed ? 'Alle aufklappen' : 'Alle zuklappen'}
                    </button>
                  )}
                </div>
              </div>

              {/* Quick-Group Bar (Schnellgruppen) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginRight: 4,
                  }}
                >
                  Schnellgruppen:
                </span>
                {QUICK_GROUPS.map((qg) => {
                  const active = selectedQuickGroupId === qg.id;
                  const count = quickGroupCounts[qg.id] || 0;
                  return (
                    <button
                      key={qg.id}
                      onClick={() => handleSelectQuickGroup(qg.id)}
                      title={qg.description}
                      style={{
                        background: active ? 'var(--text-primary)' : 'var(--bg-canvas)',
                        color: active ? 'var(--bg-canvas)' : 'var(--text-secondary)',
                        border: active
                          ? '1px solid var(--text-primary)'
                          : '1px solid var(--border-default)',
                        borderRadius: 5,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 120ms ease',
                      }}
                    >
                      <span>{qg.shortLabel}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10.5,
                          opacity: active ? 0.85 : 0.65,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Contextual Domain Filter Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexWrap: 'wrap',
                  paddingTop: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginRight: 4,
                  }}
                >
                  Domäne:
                </span>
                <button
                  onClick={() => setSelectedDomain('ALL')}
                  style={{
                    background: selectedDomain === 'ALL' ? 'var(--bg-elevated)' : 'transparent',
                    color:
                      selectedDomain === 'ALL' ? 'var(--text-primary)' : 'var(--text-muted)',
                    border:
                      selectedDomain === 'ALL'
                        ? '1px solid var(--border-focus)'
                        : '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  ALLE ({filteredAxons.length})
                </button>
                {visibleDomains.map((dm) => {
                  const count = domainCounts[dm.code] || 0;
                  const active = selectedDomain === dm.code;
                  return (
                    <button
                      key={dm.code}
                      onClick={() => handleSelectDomain(dm.code)}
                      title={`${dm.label}: ${dm.description}`}
                      style={{
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: active
                          ? '1px solid var(--border-focus)'
                          : '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {dm.code}
                      </span>
                      <span>{dm.label}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TABLE COLUMN HEADER */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '76px minmax(260px, 1fr) 230px 92px',
                height: 30,
                minHeight: 30,
                alignItems: 'center',
                padding: '0 16px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-canvas)',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              <span>DOMÄNE</span>
              <span>AXON & BESCHREIBUNG</span>
              <span>STATUS / LETZTES ERGEBNIS</span>
              <span style={{ textAlign: 'right' }}>AKTION</span>
            </div>

            {/* GROUPED AXON LIST */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {groupedSections.length === 0 && (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}
                >
                  Keine Axons für den aktuellen Suchbegriff oder Filter gefunden.
                </div>
              )}

              {groupedSections.map((section) => {
                const isCollapsed = Boolean(collapsedGroups[section.key]);
                const sectionExecutedCount = section.axons.filter((a) =>
                  Boolean(axonResults[a.id])
                ).length;

                return (
                  <div key={section.key}>
                    {/* GROUP HEADER BAR */}
                    {groupingMode !== 'flat' && (
                      <div
                        onClick={() => toggleGroupCollapse(section.key)}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 16px',
                          background: 'var(--bg-surface)',
                          borderBottom: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              width: 12,
                            }}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 4,
                              padding: '1px 6px',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {section.codeBadge}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {section.title}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            — {section.subtitle}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            flexShrink: 0,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {sectionExecutedCount > 0 && (
                            <span style={{ color: 'var(--status-nominal)' }}>
                              {sectionExecutedCount} aktiv
                            </span>
                          )}
                          <span>
                            {section.axons.length}{' '}
                            {section.axons.length === 1 ? 'Axon' : 'Axons'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* GROUP ROWS */}
                    {!isCollapsed &&
                      section.axons.map((axon) => {
                        const isSelected = selectedAxon?.id === axon.id;
                        const res = axonResults[axon.id];
                        const isRunning = Boolean(runningAxonIds[axon.id]);
                        const paramCount = axon.fields?.length || 0;

                        return (
                          <div
                            key={axon.id}
                            onClick={() => setSelectedAxonId(axon.id)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '76px minmax(260px, 1fr) 230px 92px',
                              minHeight: 58,
                              alignItems: 'center',
                              padding: '9px 16px',
                              borderBottom: '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background 80ms ease',
                              gap: 8,
                            }}
                          >
                            {/* Column 1: Domain Code + Status Dot */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: isRunning
                                    ? 'var(--status-attention)'
                                    : res
                                    ? res.ok
                                      ? 'var(--status-nominal)'
                                      : 'var(--status-critical)'
                                    : 'var(--text-muted)',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: isSelected
                                    ? 'var(--text-primary)'
                                    : 'var(--text-secondary)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {axon.domainCode}
                              </span>
                            </div>

                            {/* Column 2: German Title + Technical ID + Full German Description */}
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                                minWidth: 0,
                                paddingRight: 12,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'baseline',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13.5,
                                    fontWeight: isSelected ? 600 : 500,
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {axon.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {axon.id}
                                </span>
                                {paramCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontFamily: 'var(--font-mono)',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    · {paramCount} Param.
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-secondary)',
                                  lineHeight: 1.4,
                                }}
                              >
                                {axon.description}
                              </div>
                            </div>

                            {/* Column 3: Last Execution Result / Status */}
                            <div
                              style={{
                                fontSize: 11.5,
                                fontFamily: 'var(--font-mono)',
                                color: res
                                  ? res.ok
                                    ? 'var(--text-secondary)'
                                    : 'var(--status-critical)'
                                  : 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                paddingRight: 8,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                              title={res ? res.error || res.summary : 'Bereit zur Ausführung'}
                            >
                              {isRunning ? (
                                <span style={{ color: 'var(--status-attention)' }}>
                                  Wird ausgeführt...
                                </span>
                              ) : res ? (
                                <span>
                                  {res.ok ? res.summary : `ERR: ${res.error}`} ({res.durationMs}ms)
                                </span>
                              ) : (
                                <span>Bereit</span>
                              )}
                            </div>

                            {/* Column 4: Run Action Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  executeAxon(axon);
                                }}
                                disabled={isRunning}
                                style={{
                                  background: isSelected
                                    ? 'var(--text-primary)'
                                    : 'var(--bg-surface)',
                                  color: isSelected
                                    ? 'var(--bg-canvas)'
                                    : 'var(--text-primary)',
                                  border: '1px solid var(--border-default)',
                                  borderRadius: 4,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  fontWeight: 500,
                                  fontFamily: 'var(--font-mono)',
                                  cursor: isRunning ? 'wait' : 'pointer',
                                }}
                              >
                                {isRunning ? '...' : 'Ausführen'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: AXON INSPECTOR & LIVE EXECUTION PANEL */}
          <div
            style={{
              width: 480,
              minWidth: 480,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            {selectedAxon ? (
              <>
                {/* Inspector Header */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 4,
                          padding: '1px 6px',
                        }}
                      >
                        {selectedAxon.domainCode}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {selectedAxon.id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleAddNodeFromAxon(selectedAxon)}
                        style={{
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        + In Ablaufkette
                      </button>
                      <button
                        onClick={() => executeAxon(selectedAxon)}
                        disabled={isSelectedRunning}
                        style={{
                          background: 'var(--text-primary)',
                          color: 'var(--bg-canvas)',
                          border: '1px solid var(--text-primary)',
                          borderRadius: 4,
                          padding: '4px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: isSelectedRunning ? 'wait' : 'pointer',
                        }}
                      >
                        {isSelectedRunning ? 'Läuft...' : 'Jetzt ausführen'}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                      marginBottom: 4,
                    }}
                  >
                    {selectedAxon.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                    }}
                  >
                    {selectedAxon.description}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Bereich: {getDomainMeta(selectedAxon.domainCode).label}
                  </div>
                </div>

                {/* Parameter Inputs */}
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      EINGABEPARAMETER ({selectedAxon.fields.length})
                    </span>
                    <button
                      onClick={() =>
                        setAxonInputs((prev) => ({
                          ...prev,
                          [selectedAxon.id]: { ...(selectedAxon.defaultInput || {}) },
                        }))
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Standardwerte laden
                    </button>
                  </div>

                  {selectedAxon.fields.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Keine Parameter erforderlich — dieses Axon kann direkt ausgeführt werden.
                    </div>
                  ) : (
                    selectedAxon.fields.map((field: AxonFieldSchema) => {
                      const val =
                        axonInputs[selectedAxon.id]?.[field.key] ??
                        selectedAxon.defaultInput?.[field.key] ??
                        '';
                      return (
                        <div
                          key={field.key}
                          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <label
                              style={{
                                fontSize: 11.5,
                                color: 'var(--text-secondary)',
                                fontWeight: 500,
                              }}
                            >
                              {field.label}
                            </label>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {field.key}
                            </span>
                          </div>
                          {field.type === 'select' && field.options ? (
                            <select
                              value={String(val)}
                              onChange={(e) =>
                                updateAxonInput(selectedAxon.id, field.key, e.target.value)
                              }
                              style={{
                                background: 'var(--bg-canvas)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' || field.type === 'json' ? (
                            <textarea
                              rows={3}
                              value={String(val)}
                              placeholder={field.placeholder}
                              onChange={(e) =>
                                updateAxonInput(selectedAxon.id, field.key, e.target.value)
                              }
                              style={{
                                background: 'var(--bg-canvas)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-mono)',
                                resize: 'vertical',
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={String(val)}
                              placeholder={field.placeholder}
                              onChange={(e) =>
                                updateAxonInput(selectedAxon.id, field.key, e.target.value)
                              }
                              style={{
                                background: 'var(--bg-canvas)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Live Telemetry Output */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    padding: '12px 20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                        }}
                      >
                        LIVE-AUSGABE
                      </span>
                      {activeResult && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          {(['table', 'formatted', 'json'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setOutputViewMode(m)}
                              style={{
                                background:
                                  outputViewMode === m ? 'var(--bg-elevated)' : 'transparent',
                                color:
                                  outputViewMode === m
                                    ? 'var(--text-primary)'
                                    : 'var(--text-muted)',
                                border:
                                  outputViewMode === m
                                    ? '1px solid var(--border-default)'
                                    : '1px solid transparent',
                                borderRadius: 3,
                                padding: '1px 6px',
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                              }}
                            >
                              {m === 'table'
                                ? 'TABELLE'
                                : m === 'formatted'
                                ? 'TEXT'
                                : 'JSON'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {activeResult && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: activeResult.ok
                            ? 'var(--status-nominal)'
                            : 'var(--status-critical)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {activeResult.ok ? 'OK' : 'FEHLER'} · {activeResult.durationMs}ms
                      </span>
                    )}
                  </div>

                  {activeResult ? (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        minHeight: 0,
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 10px',
                          background: 'var(--bg-canvas)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          fontSize: 12,
                          color: activeResult.ok
                            ? 'var(--text-primary)'
                            : 'var(--status-critical)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {activeResult.ok ? activeResult.summary : activeResult.error}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          margin: 0,
                          padding: 10,
                          background: 'var(--bg-canvas)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          fontSize: 11.5,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          overflow: 'auto',
                          lineHeight: 1.45,
                        }}
                      >
                        <AxonResultViewer data={activeResult.data} mode={outputViewMode} />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px dashed var(--border-subtle)',
                        borderRadius: 4,
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        textAlign: 'center',
                        padding: 20,
                      }}
                    >
                      Noch keine Ausführung in dieser Sitzung. Klicke auf „Jetzt ausführen“, um Live-Daten abzurufen.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* VIEW MODE: HASS OS PERFORMANCE & PROCESS MONITOR */}
      {viewMode === 'hass_os' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <HassOsMonitorApp embedded />
        </div>
      )}

      {/* VIEW MODE: PC BRIDGE (LIVE WEB-VNC / KVM + WORKSTATION CONTROLS) */}
      {viewMode === 'pc' && (
        <PcBridgeWorkstationView
          axons={axons}
          executeAxon={executeAxon}
          axonResults={axonResults}
          runningAxonIds={runningAxonIds}
        />
      )}

      {/* VIEW MODE: CHAINS (MULTI-STEP WORKFLOWS) */}
      {viewMode === 'chains' && activeWorkflow && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left Sidebar: Saved Chains & Node Library */}
          <div
            style={{
              width: 280,
              minWidth: 280,
              borderRight: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  GESPEICHERTE ABLÄUFE
                </span>
                <button
                  onClick={() => {
                    const id = `wf-${Date.now().toString(36)}`;
                    const nextWf: SavedWorkflow = {
                      id,
                      name: `Ablaufkette ${workflows.length + 1}`,
                      description: 'Sequenzielle Ausführung mehrerer System-Axons',
                      updatedAt: new Date().toISOString(),
                      nodes: [],
                      edges: [],
                    };
                    setWorkflows((prev) => [...prev, nextWf]);
                    setActiveWorkflowId(id);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  + Neu
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {workflows.map((wf) => {
                  const active = wf.id === activeWorkflow.id;
                  return (
                    <div
                      key={wf.id}
                      onClick={() => {
                        setActiveWorkflowId(wf.id);
                        setSelectedNodeId(null);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 4,
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        border: active
                          ? '1px solid var(--border-default)'
                          : '1px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {wf.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                          marginTop: 2,
                        }}
                      >
                        {wf.nodes.length} Knoten · {wf.edges.length} Verbindungen
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Add Axon to Chain */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                AXON ZUR KETTE HINZUFÜGEN ({axons.length})
              </span>
              {axons.map((ax) => (
                <button
                  key={ax.id}
                  onClick={() => handleAddNodeFromAxon(ax)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    padding: '6px 8px',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <strong
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        marginRight: 6,
                      }}
                    >
                      {ax.domainCode}
                    </strong>
                    {ax.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    +
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Center: Chain Canvas */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div
              style={{
                height: 44,
                padding: '0 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-surface)',
              }}
            >
              <input
                type="text"
                value={activeWorkflow.name}
                onChange={(e) =>
                  updateActiveWorkflow((wf) => ({ ...wf, name: e.target.value }))
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 600,
                  outline: 'none',
                  width: 340,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSaveWorkflow}
                  disabled={isSavingChain}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    padding: '5px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isSavingChain ? 'Speichert...' : 'Kette speichern'}
                </button>
                <button
                  onClick={handleExecuteWorkflow}
                  disabled={isExecutingChain}
                  style={{
                    background: 'var(--text-primary)',
                    color: 'var(--bg-canvas)',
                    border: '1px solid var(--text-primary)',
                    borderRadius: 4,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isExecutingChain ? 'Läuft...' : 'Kette ausführen'}
                </button>
              </div>
            </div>

            <div
              ref={canvasRef}
              onClick={() => {
                setSelectedNodeId(null);
                setConnectSourceId(null);
              }}
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'auto',
                background: 'var(--bg-canvas)',
              }}
            >
              <svg
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                {activeWorkflow.edges.map((edge: WorkflowEdge) => {
                  const src = activeWorkflow.nodes.find((n) => n.id === edge.sourceNodeId);
                  const tgt = activeWorkflow.nodes.find((n) => n.id === edge.targetNodeId);
                  if (!src || !tgt) return null;
                  const x1 = src.x + 210;
                  const y1 = src.y + 34;
                  const x2 = tgt.x;
                  const y2 = tgt.y + 34;
                  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={1.5}
                      fill="none"
                    />
                  );
                })}
              </svg>

              {activeWorkflow.nodes.map((node) => {
                const isSel = selectedNodeId === node.id;
                const nodeRes = lastRunReport?.nodeResults?.[node.id];
                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    style={{
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: 210,
                      background: 'var(--bg-surface)',
                      border: isSel
                        ? '1px solid var(--text-primary)'
                        : '1px solid var(--border-default)',
                      borderRadius: 6,
                      padding: '10px 12px',
                      cursor: 'grab',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {node.typeId}
                      </span>
                      {nodeRes && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background:
                              nodeRes.status === 'success'
                                ? 'var(--status-nominal)'
                                : 'var(--status-critical)',
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {node.name}
                    </div>
                    {nodeRes && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 10.5,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {nodeRes.outputSummary}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!connectSourceId) {
                            setConnectSourceId(node.id);
                          } else if (connectSourceId !== node.id) {
                            updateActiveWorkflow((wf) => ({
                              ...wf,
                              edges: [
                                ...wf.edges,
                                {
                                  id: `e-${connectSourceId}-${node.id}`,
                                  sourceNodeId: connectSourceId,
                                  targetNodeId: node.id,
                                },
                              ],
                            }));
                            setConnectSourceId(null);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color:
                            connectSourceId === node.id
                              ? 'var(--status-attention)'
                              : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {connectSourceId === node.id
                          ? 'Ziel wählen...'
                          : connectSourceId
                          ? 'Hier verbinden'
                          : 'Verbinden →'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateActiveWorkflow((wf) => ({
                            ...wf,
                            nodes: wf.nodes.filter((n) => n.id !== node.id),
                            edges: wf.edges.filter(
                              (ed) =>
                                ed.sourceNodeId !== node.id && ed.targetNodeId !== node.id
                            ),
                          }));
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Node Inspector */}
          {selectedNode && (
            <div
              style={{
                width: 340,
                minWidth: 340,
                borderLeft: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                padding: 16,
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                KNOTEN-KONFIGURATION
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                {selectedNode.name}
              </div>
              {Object.entries(selectedNode.config || {}).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    marginBottom: 10,
                  }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {k}
                  </label>
                  <input
                    type="text"
                    value={String(v ?? '')}
                    onChange={(e) =>
                      updateActiveWorkflow((wf) => ({
                        ...wf,
                        nodes: wf.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, config: { ...n.config, [k]: e.target.value } }
                            : n
                        ),
                      }))
                    }
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 4,
                      padding: '6px 8px',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE: CREDENTIALS */}
      {viewMode === 'credentials' && (
        <div style={{ padding: 32, maxWidth: 640 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px 0' }}>
            Zugangsdaten & API-Schlüssel
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px 0' }}>
            Alle Schlüssel werden lokal in der SQLite-Datenbank gespeichert und beim Start automatisch mit den Home Assistant Add-on-Konfigurationen abgeglichen.
          </p>
          <form
            onSubmit={handleSaveCredentials}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <CredentialField
              label="Google OAuth Access-Token (Kalender / Gmail / Drive / Fit)"
              configured={credStatus.googleConfigured}
              value={credForm.googleOAuthToken}
              onChange={(v) => setCredForm((p) => ({ ...p, googleOAuthToken: v }))}
              placeholder="Wird automatisch aus google_calendar_sync.db erneuert, falls leer"
            />
            <CredentialField
              label="Gemini API-Schlüssel"
              configured={credStatus.geminiConfigured}
              value={credForm.geminiApiKey}
              onChange={(v) => setCredForm((p) => ({ ...p, geminiApiKey: v }))}
              placeholder="AIzaSy..."
            />
            <CredentialField
              label="GitHub Personal Access Token"
              configured={credStatus.githubConfigured}
              value={credForm.githubToken}
              onChange={(v) => setCredForm((p) => ({ ...p, githubToken: v }))}
              placeholder="ghp_..."
            />
            <CredentialField
              label="Home Assistant Long-Lived Access Token"
              configured={credStatus.haConfigured}
              value={credForm.haToken}
              onChange={(v) => setCredForm((p) => ({ ...p, haToken: v }))}
              placeholder="Wird automatisch über SUPERVISOR_TOKEN bereitgestellt"
            />
            <div>
              <button
                type="submit"
                style={{
                  background: 'var(--text-primary)',
                  color: 'var(--bg-canvas)',
                  border: '1px solid var(--text-primary)',
                  borderRadius: 4,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Zugangsdaten speichern
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ok ? 'var(--status-nominal)' : 'var(--status-attention)',
        }}
      />
      <span>{label}</span>
    </span>
  );
}

function CredentialField({
  label,
  configured,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: configured ? 'var(--status-nominal)' : 'var(--status-attention)',
          }}
        >
          {configured ? 'VERBUNDEN' : 'NICHT GESETZT'}
        </span>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 4,
          padding: '8px 10px',
          fontSize: 12,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      />
    </div>
  );
}

function PcBridgeWorkstationView({
  axons,
  executeAxon,
  axonResults,
  runningAxonIds,
}: {
  axons: AxonDescriptor[];
  executeAxon: (axon: AxonDescriptor, customInput?: Record<string, any>) => Promise<void>;
  axonResults: Record<string, AxonExecutionResult>;
  runningAxonIds: Record<string, boolean>;
}) {
  const [agentUrl] = useState('http://192.168.188.46:5185');
  const [selectedMonitor, setSelectedMonitor] = useState<string>('primary');
  const [liveFps, setLiveFps] = useState<number>(3);
  const [streamPaused, setStreamPaused] = useState<boolean>(false);
  const [frameTick, setFrameTick] = useState<number>(0);
  const [psCommand, setPsCommand] = useState<string>(
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 Name, Id, CPU, WorkingSet64 | Format-Table -AutoSize'
  );
  const [pinInput, setPinInput] = useState<string>('');
  const [volumeLevel, setVolumeLevel] = useState<number>(40);
  const [agPrompt, setAgPrompt] = useState<string>('');
  const [agNewChat, setAgNewChat] = useState<boolean>(true);
  const [agStatus, setAgStatus] = useState<string>('');
  const [agRunning, setAgRunning] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const pcStatusAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.status.telemetry'),
    [axons]
  );
  const pcPowerAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.power.control'),
    [axons]
  );
  const pcLoginAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.session.login'),
    [axons]
  );
  const pcPsAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.powershell.exec'),
    [axons]
  );
  const pcMediaAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.media.control'),
    [axons]
  );
  const pcAgAxon = useMemo(
    () => axons.find((a) => a.id === 'pc.antigravity.prompt'),
    [axons]
  );

  // Poll live status on mount and every 6 seconds
  useEffect(() => {
    if (!pcStatusAxon) return;
    executeAxon(pcStatusAxon, { agentUrl });
    const timer = setInterval(() => {
      executeAxon(pcStatusAxon, { agentUrl });
    }, 6000);
    return () => clearInterval(timer);
  }, [pcStatusAxon, agentUrl, executeAxon]);

  // Refresh Web-VNC frame
  useEffect(() => {
    if (streamPaused) return;
    const intervalMs = Math.max(250, Math.round(1000 / liveFps));
    const timer = setInterval(() => {
      setFrameTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [liveFps, streamPaused]);

  const statusData = axonResults['pc.status.telemetry']?.data as Record<string, any> | undefined;
  const isOnline = Boolean(statusData?.online);
  const monitors: Array<Record<string, any>> = Array.isArray(statusData?.monitors)
    ? statusData.monitors
    : [];
  const psResult = axonResults['pc.powershell.exec'];

  const handleCanvasClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    try {
      await fetch(`${getApiBase()}/pc-bridge/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: e.type === 'contextmenu' ? 'rightclick' : 'click',
          normX,
          normY,
          monitor: selectedMonitor,
        }),
      });
      setTimeout(() => setFrameTick((t) => t + 1), 180);
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* LEFT: LIVE WEB-VNC / KVM MONITOR STREAM */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-canvas)',
          minWidth: 0,
        }}
      >
        {/* KVM Toolbar */}
        <div
          style={{
            height: 44,
            padding: '0 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isOnline ? 'var(--status-nominal)' : 'var(--status-critical)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {statusData?.hostname || 'DESKTOP-M8TJERB'} · LIVE WEB-VNC / KVM
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              {statusData?.activeWindow
                ? `Aktiv: ${String(statusData.activeWindow).slice(0, 48)}`
                : '192.168.188.46:5185'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { id: 'primary', label: 'HAUPTMONITOR' },
              { id: '0', label: 'MON 1' },
              { id: '1', label: 'MON 2' },
              { id: '2', label: 'MON 3' },
              { id: 'all', label: 'ALLE MONITORE' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMonitor(m.id)}
                style={{
                  background: selectedMonitor === m.id ? 'var(--bg-elevated)' : 'transparent',
                  color:
                    selectedMonitor === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border:
                    selectedMonitor === m.id
                      ? '1px solid var(--border-default)'
                      : '1px solid transparent',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
            <span style={{ color: 'var(--border-default)' }}>|</span>
            <button
              onClick={() => setStreamPaused((p) => !p)}
              style={{
                background: 'transparent',
                color: streamPaused ? 'var(--status-attention)' : 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              {streamPaused ? 'PAUSIERT' : `${liveFps} FPS`}
            </button>
            <button
              onClick={() => setLiveFps((f) => (f === 1 ? 3 : f === 3 ? 5 : 1))}
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                padding: '3px 6px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              FPS ±
            </button>
          </div>
        </div>

        {/* Live Screen Viewport */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <img
            ref={imgRef}
            src={`${getApiBase()}/pc/kvm/frame.jpg?monitor=${encodeURIComponent(
              selectedMonitor
            )}&quality=68&maxWidth=1600&t=${frameTick}`}
            alt="Workstation Live KVM Stream"
            onClick={handleCanvasClick}
            onContextMenu={(e) => {
              e.preventDefault();
              handleCanvasClick(e);
            }}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              cursor: 'crosshair',
              background: '#050507',
            }}
          />
        </div>

        {/* Bottom Telemetry Bar */}
        <div
          style={{
            height: 36,
            padding: '0 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <div style={{ display: 'flex', gap: 18 }}>
            <span>CPU: {statusData?.cpuPercent ?? '—'}%</span>
            <span>
              RAM: {statusData?.memory?.usedGb ?? '—'} / {statusData?.memory?.totalGb ?? '—'} GB (
              {statusData?.memory?.usedPercent ?? '—'}%)
            </span>
            <span>LAUTSTÄRKE: {statusData?.media?.volumePercent ?? '—'}%</span>
            <span>LAUFZEIT: {statusData?.uptimeHours ?? '—'}h</span>
          </div>
          <div>
            <span>
              Klick im Bild sendet echten Mausklick an DESKTOP-M8TJERB · {monitors.length} Monitore erkannt
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT: WORKSTATION ACTION DECK */}
      <div
        style={{
          width: 460,
          minWidth: 460,
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* 1. Power, Wake-on-LAN & Monitors */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            1. ENERGIE, WAKE-ON-LAN & MONITORE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { action: 'wol', label: 'Aufwecken (WOL)', primary: true },
              { action: 'monitor_on', label: 'Monitore EIN' },
              { action: 'monitor_off', label: 'Monitore AUS' },
              { action: 'lock', label: 'PC sperren' },
              { action: 'sleep', label: 'Standby' },
              { action: 'reboot', label: 'Neustart (5s)' },
              { action: 'shutdown', label: 'Ausschalten (5s)' },
              { action: 'abort', label: 'Timer abbrechen' },
            ].map((btn) => (
              <button
                key={btn.action}
                onClick={() =>
                  pcPowerAxon &&
                  executeAxon(pcPowerAxon, {
                    action: btn.action,
                    macAddress: '30:9C:23:E1:03:96',
                    broadcastIp: '192.168.188.255',
                    delaySeconds: '5',
                    agentUrl,
                  })
                }
                style={{
                  background: btn.primary ? 'var(--text-primary)' : 'var(--bg-canvas)',
                  color: btn.primary ? 'var(--bg-canvas)' : 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: btn.primary ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Windows User Session & Unlock */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            2. WINDOWS-ANMELDUNG & SITZUNG ENTSPERREN
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Windows-PIN oder Passwort (für Sperrbildschirm)"
              style={{
                flex: 1,
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 12,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <button
              onClick={() =>
                pcLoginAxon &&
                executeAxon(pcLoginAxon, {
                  mode: 'unlock',
                  username: 'thoma',
                  secret: pinInput,
                  agentUrl,
                })
              }
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-canvas)',
                border: '1px solid var(--text-primary)',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              Entsperren / Login
            </button>
          </div>
        </div>

        {/* 3. Media Playback & CoreAudio Master Volume */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            3. MEDIENWIEDERGABE & SYSTEMLAUTSTÄRKE
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[
              { action: 'prev', label: '⏮ Zurück' },
              { action: 'play_pause', label: '⏯ Play/Pause' },
              { action: 'next', label: '⏭ Weiter' },
              { action: 'mute', label: '🔇 Stumm' },
            ].map((m) => (
              <button
                key={m.action}
                onClick={() =>
                  pcMediaAxon && executeAxon(pcMediaAxon, { action: m.action, agentUrl })
                }
                style={{
                  flex: 1,
                  background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  padding: '6px 6px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={100}
              value={volumeLevel}
              onChange={(e) => setVolumeLevel(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, width: 38 }}>
              {volumeLevel}%
            </span>
            <button
              onClick={() =>
                pcMediaAxon &&
                executeAxon(pcMediaAxon, {
                  action: 'set_volume',
                  volumePercent: String(volumeLevel),
                  agentUrl,
                })
              }
              style={{
                background: 'var(--bg-canvas)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              Lautstärke setzen
            </button>
          </div>
        </div>

        {/* 4. Antigravity Bridge (thassi) */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              4. ANTIGRAVITY BRIDGE (PROJEKT: THASSI)
            </span>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={agNewChat}
                onChange={(e) => setAgNewChat(e.target.checked)}
              />
              Neuer Chat in thassi
            </label>
          </div>
          <textarea
            rows={3}
            value={agPrompt}
            onChange={(e) => setAgPrompt(e.target.value)}
            placeholder="Prompt direkt an Antigravity auf DESKTOP-M8TJERB senden..."
            style={{
              width: '100%',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              padding: 8,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              marginBottom: 8,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button
              disabled={agRunning || !agPrompt.trim()}
              onClick={async () => {
                if (!agPrompt.trim()) return;
                setAgRunning(true);
                setAgStatus('Sende an Antigravity Language Server...');
                try {
                  if (pcAgAxon) {
                    await executeAxon(pcAgAxon, {
                      prompt: agPrompt,
                      newChat: agNewChat ? 'true' : 'false',
                      projectName: 'thassi',
                      focusWindow: 'true',
                      agentUrl,
                    });
                    setAgStatus('Auftrag an Antigravity übermittelt.');
                  }
                } catch (err: any) {
                  setAgStatus(`Fehler: ${err.message}`);
                } finally {
                  setAgRunning(false);
                }
              }}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-canvas)',
                border: '1px solid var(--text-primary)',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: agRunning ? 'wait' : 'pointer',
              }}
            >
              {agRunning ? 'Sende...' : 'An Antigravity senden'}
            </button>
            {agStatus && (
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--status-nominal)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {agStatus}
              </span>
            )}
          </div>
        </div>

        {/* 5. Live PowerShell Console */}
        <div
          style={{
            padding: '14px 18px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 240,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              5. POWERSHELL-DIREKTKONSOLE
            </span>
            <button
              onClick={() =>
                pcPsAxon &&
                executeAxon(pcPsAxon, {
                  command: psCommand,
                  workingDirectory: 'c:\\Users\\thoma\\source\\repos\\thassi',
                  timeoutSeconds: '30',
                  agentUrl,
                })
              }
              disabled={Boolean(runningAxonIds['pc.powershell.exec'])}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-canvas)',
                border: '1px solid var(--text-primary)',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              {runningAxonIds['pc.powershell.exec'] ? 'Läuft...' : 'PowerShell ausführen'}
            </button>
          </div>
          <textarea
            rows={3}
            value={psCommand}
            onChange={(e) => setPsCommand(e.target.value)}
            style={{
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              padding: 8,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              marginBottom: 8,
              resize: 'vertical',
            }}
          />
          <pre
            style={{
              flex: 1,
              margin: 0,
              padding: 10,
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {psResult
              ? (psResult.data as any)?.stdout ||
                (psResult.data as any)?.stderr ||
                psResult.summary
              : 'Bereit. PowerShell-Befehl eingeben und auf „PowerShell ausführen“ klicken.'}
          </pre>
        </div>
      </div>
    </div>
  );
}

function AxonResultViewer({
  data,
  mode,
}: {
  data: unknown;
  mode: 'table' | 'formatted' | 'json';
}) {
  if (data === null || data === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>Keine Daten zurückgegeben.</span>;
  }

  const obj = typeof data === 'object' ? (data as Record<string, any>) : null;

  if (mode === 'json' || !obj) {
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  if (mode === 'formatted') {
    const formatted =
      obj.formattedText ||
      obj.text ||
      obj.stdout ||
      obj.markdownBundle ||
      obj.response ||
      JSON.stringify(data, null, 2);
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {String(formatted)}
      </pre>
    );
  }

  // Table mode: find primary array or render key-value scalar pairs
  const arrayEntry = Object.entries(obj).find(
    ([, val]) => Array.isArray(val) && val.length > 0 && typeof val[0] === 'object'
  );

  const scalarEntries = Object.entries(obj).filter(
    ([key, val]) =>
      key !== 'formattedText' &&
      (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {scalarEntries.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 8,
          }}
        >
          {scalarEntries.slice(0, 8).map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: '6px 8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                }}
              >
                {k}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={String(v)}
              >
                {String(v)}
              </div>
            </div>
          ))}
        </div>
      )}

      {arrayEntry ? (
        (() => {
          const [arrName, rows] = arrayEntry as [string, Array<Record<string, any>>];
          const cols = Object.keys(rows[0] || {})
            .filter((c) => typeof rows[0][c] !== 'object' || rows[0][c] === null)
            .slice(0, 6);
          return (
            <div>
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                {arrName} ({rows.length})
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th
                        key={c}
                        style={{
                          textAlign: 'left',
                          padding: '4px 6px',
                          borderBottom: '1px solid var(--border-default)',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          fontSize: 9.5,
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r, i) => (
                    <tr key={i}>
                      {cols.map((c) => (
                        <td
                          key={c}
                          style={{
                            padding: '4px 6px',
                            borderBottom: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={String(r[c] ?? '')}
                        >
                          {String(r[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      ) : obj.formattedText ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{String(obj.formattedText)}</pre>
      ) : (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
