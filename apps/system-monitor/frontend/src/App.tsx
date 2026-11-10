import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';

function getApiBase(): string {
  return `${getHostBaseUrl()}/api/apps/system-monitor`;
}

interface CpuCoreSnapshot {
  id: string;
  usagePct: number;
  userPct: number;
  systemPct: number;
  iowaitPct: number;
  irqPct: number;
  idlePct: number;
  freqMhz: number | null;
}

interface OsProcessEntry {
  pid: number;
  ppid: number;
  name: string;
  cmdline: string;
  state: string;
  stateLabel: string;
  cpuPct: number;
  memMb: number;
  memPct: number;
  vszMb: number;
  threads: number;
  uptimeSec: number;
  category: 'hass-core' | 'supervisor' | 'addon' | 'thassi' | 'vision-ai' | 'kernel' | 'system';
  subsystemLabel: string;
}

interface HassContainerWorkload {
  id: string;
  slug: string;
  name: string;
  kind: 'core' | 'system' | 'addon';
  version: string;
  state: string;
  cpuPct: number;
  memoryMb: number;
  memoryLimitMb: number;
  memoryPct: number;
  networkRxMb: number;
  networkTxMb: number;
  blkReadMb: number;
  blkWriteMb: number;
  description: string;
  updateAvailable: boolean;
}

interface ActiveHassWorkloadItem {
  id: string;
  source: 'supervisor_job' | 'ha_core' | 'container' | 'os_process' | 'thassi_job' | 'vision_pipeline';
  sourceBadge: string;
  title: string;
  detail: string;
  status: 'running' | 'attention' | 'nominal';
  cpuPct?: number;
  memoryMb?: number;
  progressPct?: number | null;
  startedAt?: string | null;
  metricLabel: string;
}

interface DiskIoDeviceStat {
  device: string;
  readKbPerSec: number;
  writeKbPerSec: number;
  ioOpsPerSec: number;
  totalReadGb: number;
  totalWriteGb: number;
}

interface NetInterfaceStat {
  iface: string;
  rxKbPerSec: number;
  txKbPerSec: number;
  totalRxGb: number;
  totalTxGb: number;
  packetsPerSec: number;
}

interface HistoryPoint {
  ts: string;
  epochMs: number;
  cpuPct: number;
  iowaitPct: number;
  memPct: number;
  load1m: number;
  diskKbPerSec: number;
  netKbPerSec: number;
  eventLoopLagMs: number;
}

interface PerformanceSnapshot {
  timestamp: string;
  collectMs: number;
  host: {
    hostname: string;
    chassis: string;
    board: string;
    osName: string;
    osVersion: string;
    kernel: string;
    arch: string;
    haCoreVersion: string;
    supervisorVersion: string;
    healthy: boolean;
    supported: boolean;
    unhealthyReasons: string[];
    unsupportedReasons: string[];
    issues: Array<Record<string, any>>;
  };
  cpu: {
    cpuModel: string;
    coreCount: number;
    total: CpuCoreSnapshot;
    cores: CpuCoreSnapshot[];
    load1m: number;
    load5m: number;
    load15m: number;
    runningKernelThreads: number;
    totalKernelThreads: number;
    procsRunning: number;
    procsBlocked: number;
    contextSwitchesPerSec: number;
    interruptsPerSec: number;
    cpuTempC: number | null;
    uptimeSeconds: number;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    availableMb: number;
    freeMb: number;
    buffersCachedMb: number;
    slabMb: number;
    dirtyMb: number;
    activeMb: number;
    inactiveMb: number;
    usedPct: number;
    swapTotalMb: number;
    swapUsedMb: number;
    swapPct: number;
  };
  disk: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    usedPct: number;
    totalReadKbPerSec: number;
    totalWriteKbPerSec: number;
    devices: DiskIoDeviceStat[];
  };
  network: {
    totalRxKbPerSec: number;
    totalTxKbPerSec: number;
    interfaces: NetInterfaceStat[];
  };
  thassiRuntime: {
    pid: number;
    nodeVersion: string;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    eventLoopLagMs: number;
    uptimeSec: number;
  };
  activeWorkloads: ActiveHassWorkloadItem[];
  containers: HassContainerWorkload[];
  supervisorJobs: Array<{
    uuid: string;
    name: string;
    reference: string;
    stage: string;
    progress: number;
    done: boolean;
    created: string | null;
    errors: any[];
  }>;
  thassiJobs?: Array<{
    id: string;
    appId: string;
    name: string;
    intervalMinutes: number;
    lastRunAt?: string | null;
    lastStatus?: string | null;
    lastResult?: string | null;
  }>;
  haActivity: {
    totalEntities: number;
    runningScripts: Array<{ entityId: string; name: string; lastTriggered: string | null }>;
    recentAutomations: Array<{ entityId: string; name: string; lastTriggered: string; state: string; current: number }>;
    activeUpdates: Array<{ entityId: string; name: string; installedVersion: string; latestVersion: string; inProgress: boolean; pct: number | null }>;
    activeStreams: Array<{ entityId: string; name: string; state: string }>;
  };
  processes: OsProcessEntry[];
  history: HistoryPoint[];
}

type ViewTab = 'overview' | 'containers' | 'processes' | 'ha_activity';
type ProcessSortKey = 'cpu' | 'mem' | 'pid' | 'threads' | 'uptime';

function formatUptime(sec: number): string {
  if (!sec || sec < 0) return '0s';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function formatRateKb(kbPerSec: number): string {
  if (kbPerSec >= 1024) {
    return `${(kbPerSec / 1024).toFixed(2)} MB/s`;
  }
  return `${kbPerSec.toFixed(1)} KB/s`;
}

function getSemanticStatusColor(pct: number, warnAt = 65, critAt = 85): string {
  if (pct >= critAt) return '#ef4444';
  if (pct >= warnAt) return '#f59e0b';
  return '#10b981';
}

export default function App({ embedded = false }: { embedded?: boolean }) {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(2500);
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [procSort, setProcSort] = useState<ProcessSortKey>('cpu');
  const [procCategoryFilter, setProcCategoryFilter] = useState<string>('ALL');

  // Inspector selection state
  const [selectedContainerSlug, setSelectedContainerSlug] = useState<string>('core');
  const [selectedProcessPid, setSelectedProcessPid] = useState<number | null>(null);
  const [inspectorMode, setInspectorMode] = useState<'container' | 'process'>('container');
  const [containerLogs, setContainerLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchSnapshot = useCallback(async (force = false) => {
    try {
      const res = await fetch(`${getApiBase()}/snapshot${force ? '?force=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PerformanceSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogsForContainer = useCallback(async (slug: string) => {
    if (!slug) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/container-logs?slug=${encodeURIComponent(slug)}`);
      const data = (await res.json()) as { slug: string; logs: string };
      setContainerLogs(data.logs || '');
    } catch (err) {
      setContainerLogs(`Fehler beim Laden der Logs: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(true);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const t = setInterval(() => {
      void fetchSnapshot(false);
    }, pollIntervalMs);
    return () => clearInterval(t);
  }, [pollIntervalMs, fetchSnapshot]);

  useEffect(() => {
    if (inspectorMode === 'container' && selectedContainerSlug) {
      void fetchLogsForContainer(selectedContainerSlug);
    }
  }, [inspectorMode, selectedContainerSlug, fetchLogsForContainer]);

  // Ensure sidebar link is injected into Home Assistant parent frame if running inside HA
  useEffect(() => {
    try {
      if (!window.top || window.top === window) return;
      const topDoc = window.top.document;
      const ha = topDoc?.querySelector('home-assistant');
      const main = ha?.shadowRoot?.querySelector('home-assistant-main');
      const sidebar = main?.shadowRoot?.querySelector('ha-sidebar');
      const mdList = sidebar?.shadowRoot?.querySelector('ha-md-list, paper-listbox');
      if (mdList && !mdList.querySelector('#thassi-nav-system-monitor')) {
        const refItem =
          mdList.querySelector('#thassi-nav-camera-vision') ||
          mdList.querySelector('[href="/44ec3c40_thassi_workflows"]') ||
          mdList.querySelector('ha-md-list-item');
        const monItem = topDoc.createElement('a');
        monItem.id = 'thassi-nav-system-monitor';
        monItem.href = '/44ec3c40_thassi_host';
        monItem.setAttribute('role', 'option');
        monItem.style.cssText =
          'display:flex;align-items:center;gap:16px;padding:0 16px;height:40px;margin:2px 8px;border-radius:8px;color:#cbd5e1;text-decoration:none;cursor:pointer;font-size:14px;font-weight:500;user-select:none;box-sizing:border-box;';
        monItem.innerHTML =
          '<ha-icon icon="mdi:pulse" style="color:#94a3b8;display:inline-flex;align-items:center;"></ha-icon><span class="item-text">HASS OS Monitor</span>';
        if (refItem && refItem.nextSibling) {
          mdList.insertBefore(monItem, refItem.nextSibling);
        } else {
          mdList.appendChild(monItem);
        }
        (monItem as any).onclick = new (window.top as any).Function(
          'ev',
          'if (ev) { ev.preventDefault(); ev.stopPropagation(); } return window.top.__thassiOpenSidebarApp("system-monitor", "HASS OS Performance & Prozesse");'
        );
      }
    } catch {
      // Cross-origin fallback
    }
  }, []);

  const filteredWorkloads = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshot.activeWorkloads;
    return snapshot.activeWorkloads.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.detail.toLowerCase().includes(q) ||
        w.sourceBadge.toLowerCase().includes(q)
    );
  }, [snapshot, searchQuery]);

  const filteredContainers = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshot.containers;
    return snapshot.containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [snapshot, searchQuery]);

  const filteredProcesses = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = snapshot.processes.filter((p) => {
      if (procCategoryFilter !== 'ALL' && p.category !== procCategoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.cmdline.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        p.subsystemLabel.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (procSort === 'cpu') return b.cpuPct - a.cpuPct || b.memMb - a.memMb;
      if (procSort === 'mem') return b.memMb - a.memMb || b.cpuPct - a.cpuPct;
      if (procSort === 'pid') return a.pid - b.pid;
      if (procSort === 'threads') return b.threads - a.threads;
      if (procSort === 'uptime') return b.uptimeSec - a.uptimeSec;
      return 0;
    });
  }, [snapshot, searchQuery, procSort, procCategoryFilter]);

  const selectedContainer = useMemo(
    () =>
      snapshot?.containers.find((c) => c.slug === selectedContainerSlug) ||
      snapshot?.containers[0] ||
      null,
    [snapshot, selectedContainerSlug]
  );

  const selectedProcess = useMemo(
    () =>
      snapshot?.processes.find((p) => p.pid === selectedProcessPid) ||
      snapshot?.processes[0] ||
      null,
    [snapshot, selectedProcessPid]
  );

  const renderHistorySvg = () => {
    const hist = snapshot?.history || [];
    if (hist.length < 2) {
      return (
        <div style={{ fontSize: 11, color: '#52525b', fontFamily: 'var(--font-mono)' }}>
          Sammle Echtzeit-Telemetrie ({hist.length} Samples)...
        </div>
      );
    }
    const w = 440;
    const h = 64;
    const buildPath = (getter: (pt: HistoryPoint) => number, maxVal = 100) => {
      return hist
        .map((pt, i) => {
          const x = (i / Math.max(1, hist.length - 1)) * w;
          const v = Math.max(0, Math.min(maxVal, getter(pt)));
          const y = h - 4 - (v / maxVal) * (h - 8);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    };

    const cpuPath = buildPath((p) => p.cpuPct, 100);
    const memPath = buildPath((p) => p.memPct, 100);
    const ioPath = buildPath((p) => p.iowaitPct, 100);

    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <line x1={0} y1={h * 0.25} x2={w} y2={h * 0.25} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <line x1={0} y1={h * 0.5} x2={w} y2={h * 0.5} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <line x1={0} y1={h * 0.75} x2={w} y2={h * 0.75} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        {/* Memory % line (subtle zinc) */}
        <path d={memPath} fill="none" stroke="#71717a" strokeWidth="1.2" strokeDasharray="3 3" />
        {/* I/O Wait % line (amber if present) */}
        <path d={ioPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity={0.8} />
        {/* CPU % line (crisp white) */}
        <path d={cpuPath} fill="none" stroke="#fafafa" strokeWidth="1.6" />
      </svg>
    );
  };

  if (loading && !snapshot) {
    return (
      <div
        style={{
          padding: 48,
          background: '#09090b',
          color: '#a1a1aa',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
        }}
      >
        Initialisiere HASS OS Performance- & Prozess-Telemetrie...
      </div>
    );
  }

  const cpuPct = snapshot?.cpu.total.usagePct ?? 0;
  const memPct = snapshot?.memory.usedPct ?? 0;
  const diskPct = snapshot?.disk.usedPct ?? 0;
  const startedContainersCount = snapshot?.containers.filter((c) => c.state === 'started').length ?? 0;

  return (
    <div
      style={{
        minHeight: embedded ? 'auto' : '100vh',
        width: '100%',
        backgroundColor: '#09090b',
        color: '#fafafa',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* 1. HEADER ZONE */}
      <div
        style={{
          padding: embedded ? '14px 20px' : '20px 32px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: error
                  ? '#ef4444'
                  : snapshot?.host.healthy !== false
                    ? '#10b981'
                    : '#f59e0b',
                display: 'inline-block',
              }}
            />
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: '-0.025em',
                color: '#fafafa',
              }}
            >
              HASS OS Monitor
            </h1>
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            {snapshot?.host.hostname} · {snapshot?.host.osName} {snapshot?.host.osVersion} · Core{' '}
            {snapshot?.host.haCoreVersion} · Kernel {snapshot?.host.kernel} · Uptime{' '}
            {formatUptime(snapshot?.cpu.uptimeSeconds || 0)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="/ Filter Prozess, Add-on, PID..."
            style={{
              width: 240,
              background: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              padding: '6px 10px',
              color: '#fafafa',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              outline: 'none',
            }}
          />

          <select
            value={String(pollIntervalMs)}
            onChange={(e) => setPollIntervalMs(Number(e.target.value))}
            style={{
              background: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              padding: '6px 10px',
              color: '#fafafa',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="1500">Live 1.5s</option>
            <option value="2500">Live 2.5s</option>
            <option value="5000">Live 5.0s</option>
            <option value="0">Pausiert</option>
          </select>

          <button
            onClick={() => void fetchSnapshot(true)}
            style={{
              background: '#fafafa',
              color: '#09090b',
              border: 'none',
              borderRadius: 4,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {/* 2. HERO METRICS STRIP (6 COLUMNS, 1PX HAIRLINES) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* COL 1: CPU & LOAD */}
        <div
          style={{
            padding: '16px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>CPU GESAMT ({snapshot?.cpu.coreCount} CORES)</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: getSemanticStatusColor(cpuPct, 65, 85),
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em' }}>
              {cpuPct.toFixed(1)}%
            </span>
            {snapshot?.cpu.cpuTempC !== null && snapshot?.cpu.cpuTempC !== undefined && (
              <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
                {snapshot.cpu.cpuTempC.toFixed(1)} °C
              </span>
            )}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>USR {snapshot?.cpu.total.userPct.toFixed(1)}%</span>
            <span>SYS {snapshot?.cpu.total.systemPct.toFixed(1)}%</span>
            <span
              style={{
                color: (snapshot?.cpu.total.iowaitPct || 0) > 5 ? '#f59e0b' : '#a1a1aa',
              }}
            >
              IOW {snapshot?.cpu.total.iowaitPct.toFixed(1)}%
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Load: {snapshot?.cpu.load1m.toFixed(2)} / {snapshot?.cpu.load5m.toFixed(2)} /{' '}
            {snapshot?.cpu.load15m.toFixed(2)}
          </div>
        </div>

        {/* COL 2: KERNEL SCHEDULER & ACTIVE THREADS */}
        <div
          style={{
            padding: '16px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>KERNEL SCHEDULER</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: (snapshot?.cpu.procsBlocked || 0) > 0 ? '#f59e0b' : '#10b981',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em' }}>
              {snapshot?.cpu.runningKernelThreads ?? 1}
            </span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
              / {snapshot?.cpu.totalKernelThreads || snapshot?.processes.length || 0} Threads
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            {snapshot?.cpu.contextSwitchesPerSec.toLocaleString('de-AT')} ctxt/s ·{' '}
            {snapshot?.cpu.interruptsPerSec.toLocaleString('de-AT')} intr/s
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Running: {snapshot?.cpu.procsRunning} · Blocked I/O: {snapshot?.cpu.procsBlocked}
          </div>
        </div>

        {/* COL 3: MEMORY & SWAP */}
        <div
          style={{
            padding: '16px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>ARBEITSSPEICHER (RAM)</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: getSemanticStatusColor(memPct, 75, 90),
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em' }}>
              {memPct.toFixed(1)}%
            </span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
              {Math.round(snapshot?.memory.usedMb || 0)} / {Math.round(snapshot?.memory.totalMb || 0)} MB
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            Verfügbar: {Math.round(snapshot?.memory.availableMb || 0)} MB · Cache:{' '}
            {Math.round(snapshot?.memory.buffersCachedMb || 0)} MB
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Swap: {Math.round(snapshot?.memory.swapUsedMb || 0)} /{' '}
            {Math.round(snapshot?.memory.swapTotalMb || 0)} MB ({snapshot?.memory.swapPct.toFixed(0)}%)
          </div>
        </div>

        {/* COL 4: HASS OS CONTAINERS & ADD-ONS */}
        <div
          style={{
            padding: '16px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>HASS CONTAINER & ADD-ONS</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#10b981',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em' }}>
              {startedContainersCount}
            </span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
              / {snapshot?.containers.length || 0} aktiv
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            {snapshot?.haActivity.totalEntities || 0} HA Entitäten ·{' '}
            {snapshot?.supervisorJobs.filter((j) => !j.done).length || 0} Supervisor Jobs
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Thassi Event-Loop: {snapshot?.thassiRuntime.eventLoopLagMs.toFixed(1)} ms Lag
          </div>
        </div>

        {/* COL 5: DISK & BLOCK I/O */}
        <div
          style={{
            padding: '16px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>DATENTRÄGER & BLOCK-I/O</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: getSemanticStatusColor(diskPct, 78, 90),
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em' }}>
              {diskPct.toFixed(1)}%
            </span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
              {snapshot?.disk.usedGb.toFixed(1)} / {snapshot?.disk.totalGb.toFixed(1)} GB
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            R: {formatRateKb(snapshot?.disk.totalReadKbPerSec || 0)} · W:{' '}
            {formatRateKb(snapshot?.disk.totalWriteKbPerSec || 0)}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Frei: {snapshot?.disk.freeGb.toFixed(1)} GB · Dirty: {snapshot?.memory.dirtyMb.toFixed(1)} MB
          </div>
        </div>

        {/* COL 6: NETWORK THROUGHPUT */}
        <div style={{ padding: '16px 24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: 6,
            }}
          >
            <span>NETZWERK-DURCHSATZ</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#10b981',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em' }}>
              ↓ {formatRateKb(snapshot?.network.totalRxKbPerSec || 0)}
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: '#a1a1aa',
            }}
          >
            ↑ {formatRateKb(snapshot?.network.totalTxKbPerSec || 0)} Senden
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#52525b',
            }}
          >
            Interfaces: {snapshot?.network.interfaces.map((i) => i.iface).join(', ') || 'eth0'}
          </div>
        </div>
      </div>

      {/* 3. PER-CORE CPU BARS & ROLLING TELEMETRY CHART */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Per-Core CPU Utilization */}
        <div
          style={{
            padding: '14px 24px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
            }}
          >
            <span>PER-CORE CPU AUSLASTUNG ({snapshot?.cpu.cpuModel})</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>USER / SYS / IOWAIT</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px 20px',
            }}
          >
            {(snapshot?.cpu.cores || []).map((core) => (
              <div key={core.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11.5,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: '#fafafa', fontWeight: 500 }}>
                    {core.id.toUpperCase()}
                    {core.freqMhz ? ` · ${core.freqMhz} MHz` : ''}
                  </span>
                  <span style={{ color: '#a1a1aa' }}>
                    {core.usagePct.toFixed(1)}%
                    {core.iowaitPct > 1 ? ` (IO ${core.iowaitPct.toFixed(0)}%)` : ''}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, core.userPct)}%`,
                      background: '#fafafa',
                      transition: 'width 300ms ease',
                    }}
                  />
                  <div
                    style={{
                      width: `${Math.min(100, core.systemPct + core.irqPct)}%`,
                      background: '#71717a',
                      transition: 'width 300ms ease',
                    }}
                  />
                  <div
                    style={{
                      width: `${Math.min(100, core.iowaitPct)}%`,
                      background: '#f59e0b',
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rolling 60-Tick History Chart */}
        <div
          style={{
            padding: '14px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
            }}
          >
            <span>ZEITVERLAUF (CPU % WEISS · RAM % GESTRICHELT · IOWAIT % AMBER)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {snapshot?.collectMs.toFixed(1)} ms Sample
            </span>
          </div>
          {renderHistorySvg()}
        </div>
      </div>

      {/* 4. VIEW TABS ON HAIRLINE */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          height: 42,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, height: '100%' }}>
          {[
            {
              id: 'overview' as ViewTab,
              label: `WAS HASS OS GERADE VERARBEITET (${filteredWorkloads.length})`,
            },
            {
              id: 'containers' as ViewTab,
              label: `HASS CONTAINER & ADD-ONS (${filteredContainers.length})`,
            },
            {
              id: 'processes' as ViewTab,
              label: `LINUX /PROC PROZESSE (${filteredProcesses.length})`,
            },
            {
              id: 'ha_activity' as ViewTab,
              label: `AUTOMATIONEN, SKRIPTE & JOBS (${
                (snapshot?.haActivity.recentAutomations.length || 0) +
                (snapshot?.supervisorJobs.length || 0)
              })`,
            },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '1px solid #fafafa' : '1px solid transparent',
                  color: active ? '#fafafa' : '#52525b',
                  fontSize: 11.5,
                  fontWeight: active ? 500 : 400,
                  letterSpacing: '0.06em',
                  height: '100%',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'processes' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'var(--font-mono)' }}>
              SUBSYSTEM:
            </span>
            {['ALL', 'thassi', 'vision-ai', 'hass-core', 'supervisor', 'system', 'kernel'].map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => setProcCategoryFilter(cat)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: procCategoryFilter === cat ? '#fafafa' : '#52525b',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    padding: '2px 4px',
                  }}
                >
                  {cat}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* 5. MASTER-DETAIL SPLIT (LEFT = WORKLOADS / CONTAINERS / PROCESSES, RIGHT = LIVE INSPECTOR) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 430px',
          flex: 1,
          minHeight: 480,
        }}
      >
        {/* LEFT COLUMN */}
        <div
          style={{
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* TAB 1: OVERVIEW ("WAS HASS OS GERADE VERARBEITET") */}
          {activeTab === 'overview' && (
            <div>
              {/* Section A: Active Workloads Feed */}
              <div
                style={{
                  padding: '10px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 165px',
                }}
              >
                <span>QUELLE</span>
                <span>AKTIVE AUFGABE / PROZESS / CONTAINER</span>
                <span style={{ textAlign: 'right' }}>AUSLASTUNG / STATUS</span>
              </div>

              {filteredWorkloads.map((item) => {
                const dotColor =
                  item.status === 'attention'
                    ? '#f59e0b'
                    : item.status === 'running'
                      ? '#10b981'
                      : '#52525b';
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.id.startsWith('cnt_addon_')) {
                        setInspectorMode('container');
                        setSelectedContainerSlug(item.id.replace('cnt_addon_', ''));
                      } else if (item.id === 'cnt_hassio_core') {
                        setInspectorMode('container');
                        setSelectedContainerSlug('core');
                      } else if (item.id === 'cnt_hassio_supervisor') {
                        setInspectorMode('container');
                        setSelectedContainerSlug('supervisor');
                      } else if (item.id.startsWith('proc_')) {
                        setInspectorMode('process');
                        setSelectedProcessPid(Number(item.id.replace('proc_', '')));
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 165px',
                      alignItems: 'center',
                      padding: '10px 24px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: '#a1a1aa',
                        }}
                      >
                        {item.sourceBadge}
                      </span>
                    </div>

                    <div style={{ minWidth: 0, paddingRight: 16 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#fafafa',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#a1a1aa',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 2,
                        }}
                      >
                        {item.detail}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: item.status === 'running' ? '#fafafa' : '#a1a1aa',
                      }}
                    >
                      {item.metricLabel}
                    </div>
                  </div>
                );
              })}

              {/* Section B: Quick Linux Process Table Below Active Feed */}
              <div
                style={{
                  padding: '14px 24px 8px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#52525b',
                  }}
                >
                  TOP LINUX /PROC PROZESSE NACH CPU & SPEICHER
                </span>
                <button
                  onClick={() => setActiveTab('processes')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  Alle {snapshot?.processes.length || 0} Prozesse anzeigen →
                </button>
              </div>

              {filteredProcesses.slice(0, 12).map((proc) => (
                <div
                  key={proc.pid}
                  onClick={() => {
                    setInspectorMode('process');
                    setSelectedProcessPid(proc.pid);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 150px 1fr 90px 95px',
                    alignItems: 'center',
                    padding: '8px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    background:
                      inspectorMode === 'process' && selectedProcess?.pid === proc.pid
                        ? '#111113'
                        : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a1a1aa' }}>
                    {proc.pid}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: '#fafafa',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {proc.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: '#a1a1aa',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingRight: 12,
                    }}
                  >
                    {proc.cmdline}
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: proc.cpuPct >= 5 ? '#fafafa' : '#a1a1aa',
                    }}
                  >
                    {proc.cpuPct.toFixed(1)}%
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: '#a1a1aa',
                    }}
                  >
                    {proc.memMb.toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: HASS CONTAINERS & ADD-ONS */}
          {activeTab === 'containers' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 210px 1fr 90px 120px 110px',
                  padding: '10px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                }}
              >
                <span>TYP</span>
                <span>CONTAINER / ADD-ON</span>
                <span>BESCHREIBUNG & VERSION</span>
                <span style={{ textAlign: 'right' }}>CPU %</span>
                <span style={{ textAlign: 'right' }}>RAM MB</span>
                <span style={{ textAlign: 'right' }}>NET RX/TX</span>
              </div>

              {filteredContainers.map((cnt) => {
                const isSelected =
                  inspectorMode === 'container' && selectedContainer?.slug === cnt.slug;
                const started = cnt.state === 'started';
                return (
                  <div
                    key={cnt.id}
                    onClick={() => {
                      setInspectorMode('container');
                      setSelectedContainerSlug(cnt.slug);
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 210px 1fr 90px 120px 110px',
                      alignItems: 'center',
                      padding: '10px 24px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      background: isSelected ? '#111113' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: started
                            ? cnt.cpuPct > 30
                              ? '#f59e0b'
                              : '#10b981'
                            : '#52525b',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: '#a1a1aa',
                          textTransform: 'uppercase',
                        }}
                      >
                        {cnt.kind}
                      </span>
                    </div>

                    <div style={{ minWidth: 0, paddingRight: 10 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: started ? '#fafafa' : '#52525b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cnt.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: '#52525b',
                        }}
                      >
                        {cnt.slug}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: 12,
                      }}
                    >
                      v{cnt.version} · {cnt.description || cnt.state}
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12.5,
                        color: cnt.cpuPct >= 5 ? '#fafafa' : '#a1a1aa',
                      }}
                    >
                      {started ? `${cnt.cpuPct.toFixed(1)}%` : '—'}
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: '#a1a1aa',
                      }}
                    >
                      {started ? `${cnt.memoryMb.toFixed(0)} MB (${cnt.memoryPct.toFixed(1)}%)` : 'stopped'}
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: '#52525b',
                      }}
                    >
                      {started
                        ? `${cnt.networkRxMb.toFixed(0)}/${cnt.networkTxMb.toFixed(0)} MB`
                        : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: FULL LINUX /PROC PROCESS TABLE */}
          {activeTab === 'processes' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '72px 68px 160px 1fr 82px 92px 72px 86px',
                  padding: '10px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                }}
              >
                <span
                  style={{ cursor: 'pointer', color: procSort === 'pid' ? '#fafafa' : '#52525b' }}
                  onClick={() => setProcSort('pid')}
                >
                  PID {procSort === 'pid' ? '↓' : ''}
                </span>
                <span>STATE</span>
                <span>PROZESSNAME</span>
                <span>BEFEHLSZEILE (/PROC/PID/CMDLINE)</span>
                <span
                  style={{
                    textAlign: 'right',
                    cursor: 'pointer',
                    color: procSort === 'cpu' ? '#fafafa' : '#52525b',
                  }}
                  onClick={() => setProcSort('cpu')}
                >
                  CPU % {procSort === 'cpu' ? '↓' : ''}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    cursor: 'pointer',
                    color: procSort === 'mem' ? '#fafafa' : '#52525b',
                  }}
                  onClick={() => setProcSort('mem')}
                >
                  RSS MB {procSort === 'mem' ? '↓' : ''}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    cursor: 'pointer',
                    color: procSort === 'threads' ? '#fafafa' : '#52525b',
                  }}
                  onClick={() => setProcSort('threads')}
                >
                  THR {procSort === 'threads' ? '↓' : ''}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    cursor: 'pointer',
                    color: procSort === 'uptime' ? '#fafafa' : '#52525b',
                  }}
                  onClick={() => setProcSort('uptime')}
                >
                  LAUFZEIT
                </span>
              </div>

              {filteredProcesses.map((proc) => {
                const isSelected =
                  inspectorMode === 'process' && selectedProcess?.pid === proc.pid;
                return (
                  <div
                    key={proc.pid}
                    onClick={() => {
                      setInspectorMode('process');
                      setSelectedProcessPid(proc.pid);
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '72px 68px 160px 1fr 82px 92px 72px 86px',
                      alignItems: 'center',
                      padding: '8px 24px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      background: isSelected ? '#111113' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a1a1aa' }}>
                      {proc.pid}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor:
                            proc.state === 'R'
                              ? '#10b981'
                              : proc.state === 'D' || proc.state === 'Z'
                                ? '#ef4444'
                                : '#52525b',
                        }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#a1a1aa' }}>
                        {proc.state}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: '#fafafa',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: 8,
                      }}
                    >
                      {proc.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: 12,
                      }}
                    >
                      {proc.cmdline}
                    </span>
                    <span
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: proc.cpuPct >= 2 ? '#fafafa' : '#a1a1aa',
                      }}
                    >
                      {proc.cpuPct.toFixed(1)}%
                    </span>
                    <span
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: '#a1a1aa',
                      }}
                    >
                      {proc.memMb.toFixed(1)} MB
                    </span>
                    <span
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: '#52525b',
                      }}
                    >
                      {proc.threads}
                    </span>
                    <span
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: '#52525b',
                      }}
                    >
                      {formatUptime(proc.uptimeSec)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: HA AUTOMATIONS, SCRIPTS & SUPERVISOR JOBS */}
          {activeTab === 'ha_activity' && (
            <div>
              {/* Supervisor Jobs */}
              <div
                style={{
                  padding: '12px 24px 8px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                }}
              >
                SUPERVISOR HINTERGRUND-JOBS ({snapshot?.supervisorJobs.length || 0})
              </div>
              {(snapshot?.supervisorJobs || []).length === 0 ? (
                <div
                  style={{
                    padding: '14px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: 12,
                    color: '#a1a1aa',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Keine laufenden Supervisor-Jobs (Backups / Add-on-Builds / System-Migrationen im Leerlauf).
                </div>
              ) : (
                snapshot?.supervisorJobs.map((job) => (
                  <div
                    key={job.uuid}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 120px',
                      padding: '10px 24px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a1a1aa' }}>
                      {job.done ? 'DONE' : 'RUNNING'}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>
                        {job.name} {job.reference ? `(${job.reference})` : ''}
                      </div>
                      <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
                        Stage: {job.stage || 'completed'} · Created: {job.created || '—'}
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: '#fafafa',
                      }}
                    >
                      {job.progress}%
                    </div>
                  </div>
                ))
              )}

              {/* Thassi Scheduled Background Cron Jobs */}
              <div
                style={{
                  padding: '16px 24px 8px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                }}
              >
                THASSI HINTERGRUND-CRON-JOBS ({(snapshot?.thassiJobs || []).length})
              </div>
              {(snapshot?.thassiJobs || []).map((tj) => (
                <div
                  key={`${tj.appId}_${tj.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 185px',
                    padding: '10px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor:
                          tj.lastStatus === 'error'
                            ? '#ef4444'
                            : tj.lastStatus === 'running'
                              ? '#f59e0b'
                              : '#10b981',
                      }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a1a1aa' }}>
                      {tj.appId.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>{tj.name}</div>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
                      Alle {tj.intervalMinutes} Min. · {tj.lastResult || tj.id}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: '#52525b',
                    }}
                  >
                    {tj.lastRunAt ? new Date(tj.lastRunAt).toLocaleTimeString('de-AT') : 'Ausstehend'}
                  </div>
                </div>
              ))}

              {/* Recent & Active Home Assistant Automations */}
              <div
                style={{
                  padding: '16px 24px 8px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#52525b',
                }}
              >
                HOME ASSISTANT AUTOMATIONEN & ZULETZT AUSGELÖSTE WORKFLOWS
              </div>
              {(snapshot?.haActivity.recentAutomations || []).map((aut) => (
                <div
                  key={aut.entityId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '95px 1fr 190px',
                    padding: '10px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: aut.current > 0 ? '#10b981' : '#52525b',
                      }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a1a1aa' }}>
                      {aut.current > 0 ? `${aut.current} ACTIVE` : aut.state.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>{aut.name}</div>
                    <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#52525b' }}>
                      {aut.entityId}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: '#a1a1aa',
                    }}
                  >
                    {aut.lastTriggered
                      ? new Date(aut.lastTriggered).toLocaleString('de-AT')
                      : 'Noch nie ausgelöst'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: LIVE INSPECTOR & LOGS */}
        <div
          style={{
            background: '#09090b',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#52525b',
              }}
            >
              {inspectorMode === 'container'
                ? `CONTAINER-INSPEKTOR · ${selectedContainer?.slug.toUpperCase() || 'CORE'}`
                : `PROZESS-INSPEKTOR · PID ${selectedProcess?.pid || ''}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setInspectorMode('container')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: inspectorMode === 'container' ? '#fafafa' : '#52525b',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                Container
              </button>
              <button
                onClick={() => setInspectorMode('process')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: inspectorMode === 'process' ? '#fafafa' : '#52525b',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                Prozess
              </button>
            </div>
          </div>

          {inspectorMode === 'container' && selectedContainer && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#fafafa' }}>
                  {selectedContainer.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: '#a1a1aa',
                    marginTop: 2,
                  }}
                >
                  Slug: {selectedContainer.slug} · v{selectedContainer.version} · Status:{' '}
                  {selectedContainer.state}
                </div>
                {selectedContainer.description && (
                  <div style={{ fontSize: 12.5, color: '#a1a1aa', marginTop: 6, lineHeight: 1.45 }}>
                    {selectedContainer.description}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: '12px 0',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>CPU AUSLASTUNG</div>
                  <div style={{ fontSize: 15, color: '#fafafa', marginTop: 2 }}>
                    {selectedContainer.cpuPct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>SPEICHER (RSS)</div>
                  <div style={{ fontSize: 15, color: '#fafafa', marginTop: 2 }}>
                    {selectedContainer.memoryMb.toFixed(1)} MB ({selectedContainer.memoryPct.toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>NETZWERK RX / TX</div>
                  <div style={{ color: '#a1a1aa', marginTop: 2 }}>
                    ↓ {selectedContainer.networkRxMb.toFixed(1)} MB · ↑{' '}
                    {selectedContainer.networkTxMb.toFixed(1)} MB
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>BLOCK READ / WRITE</div>
                  <div style={{ color: '#a1a1aa', marginTop: 2 }}>
                    R {selectedContainer.blkReadMb.toFixed(1)} MB · W{' '}
                    {selectedContainer.blkWriteMb.toFixed(1)} MB
                  </div>
                </div>
              </div>

              {/* Container Log Selector & Live Output */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#52525b',
                  }}
                >
                  LIVE CONTAINER LOGS ({selectedContainer.slug})
                </span>
                <button
                  onClick={() => void fetchLogsForContainer(selectedContainer.slug)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 4,
                    color: '#a1a1aa',
                    padding: '3px 8px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {logsLoading ? 'Lädt...' : 'Logs neu laden'}
                </button>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: '#111113',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: '#a1a1aa',
                  maxHeight: 380,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {containerLogs || 'Keine Log-Ausgabe.'}
              </pre>
            </div>
          )}

          {inspectorMode === 'process' && selectedProcess && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#fafafa' }}>
                  {selectedProcess.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: '#a1a1aa',
                    marginTop: 2,
                  }}
                >
                  PID {selectedProcess.pid} · PPID {selectedProcess.ppid} ·{' '}
                  {selectedProcess.subsystemLabel}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: '12px 0',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>CPU DELTA</div>
                  <div style={{ fontSize: 15, color: '#fafafa', marginTop: 2 }}>
                    {selectedProcess.cpuPct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>PHYSISCHER RAM (RSS)</div>
                  <div style={{ fontSize: 15, color: '#fafafa', marginTop: 2 }}>
                    {selectedProcess.memMb.toFixed(1)} MB ({selectedProcess.memPct.toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>ZUSTAND & THREADS</div>
                  <div style={{ color: '#a1a1aa', marginTop: 2 }}>
                    {selectedProcess.stateLabel} · {selectedProcess.threads} Threads
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#52525b' }}>VIRTUELLER SPEICHER / LAUFZEIT</div>
                  <div style={{ color: '#a1a1aa', marginTop: 2 }}>
                    {selectedProcess.vszMb.toFixed(0)} MB · {formatUptime(selectedProcess.uptimeSec)}
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#52525b',
                    marginBottom: 6,
                  }}
                >
                  VOLLSTÄNDIGE BEFEHLSZEILE (/PROC/{selectedProcess.pid}/CMDLINE)
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: '#111113',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: '#fafafa',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {selectedProcess.cmdline}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
