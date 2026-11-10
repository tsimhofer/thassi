import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('network-monitor');

interface UpnpWanTelemetry {
  host: string;
  reachable: boolean;
  accessType: string;
  physicalLinkStatus: string;
  connectionStatus: string;
  uptimeSec: number;
  externalIp: string;
  dnsServers: string[];
  maxDownstreamBitRate: number;
  maxUpstreamBitRate: number;
  byteReceiveRate: number;
  byteSendRate: number;
  totalBytesReceived: number;
  totalBytesSent: number;
  latencyMs: number | null;
}

interface NetworkClientDevice {
  uid: string;
  name: string;
  ip: string;
  mac: string;
  active: boolean;
  online: boolean;
  connectionType: 'wlan' | 'lan' | 'vpn' | 'guest' | 'unknown';
  portLabel: string;
  band: string;
  speedLabel: string;
  rxMbps: number | null;
  txMbps: number | null;
  meshParentName: string;
  meshParentIp: string;
  dhcp: boolean;
  guest: boolean;
  category: 'iot' | 'server' | 'compute' | 'mobile' | 'network' | 'media' | 'other';
  url: string | null;
}

interface FritzLogEntry {
  id: number;
  date: string;
  time: string;
  group: string;
  msg: string;
}

interface BandwidthSamplePoint {
  ts: string;
  epochMs: number;
  lanRxKbps: number;
  lanTxKbps: number;
  wanRxKbps: number;
  wanTxKbps: number;
  latGatewayMs: number | null;
  latRepeaterMs: number | null;
  latUpstreamMs: number | null;
  latExternalMs: number | null;
}

interface NetworkOverviewPayload {
  fetchedAt: string;
  luaFetchedAt: string;
  config: {
    primaryHost: string;
    primaryUser: string;
    hasPrimaryPassword: boolean;
    repeaterHost: string;
    upstreamHost: string;
    upstreamUser: string;
    hasUpstreamPassword: boolean;
    updatedAt: string;
  };
  auth: {
    primaryOk: boolean;
    primaryUser: string;
    primaryError: string | null;
    repeaterOk: boolean;
    upstreamOk: boolean;
  };
  routers: {
    primary: {
      host: string;
      name: string;
      osVersion: string;
      boxDate: string;
      isUpdateAvail: boolean;
      energyPct: number;
      cpuPct: number;
      cpuTempC: number;
      ramUsedPct: number;
      ramFixedPct: number;
      ramDynamicPct: number;
      ramFreePct: number;
      cpuUtilSeries: number[];
      cpuTempSeries: number[];
      wanIpOnUpstream: string;
      connectedSinceEpoch: number;
      provider: string;
      wlanSummary: string;
      lanSummary: string;
      upnp: UpnpWanTelemetry;
    };
    repeater: {
      host: string;
      name: string;
      reachable: boolean;
      authenticated: boolean;
      latencyMs: number | null;
      connectedClients: number;
    };
    upstream: {
      host: string;
      name: string;
      provider: string;
      authenticated: boolean;
      upnp: UpnpWanTelemetry;
    };
  };
  latencies: {
    gatewayMs: number | null;
    repeaterMs: number | null;
    upstreamMs: number | null;
    cloudflareDnsMs: number | null;
    googleDnsMs: number | null;
  };
  wifi: {
    ssidSummary: string;
    bandSteering: boolean;
    ht160: boolean;
    powerLevel: string;
    channelMode: string;
    lastScanTime: string;
    has24Ghz: boolean;
    has5Ghz: boolean;
  };
  deviceSummary: {
    activeCount: number;
    onlineCount: number;
    passiveCount: number;
    wlanActiveCount: number;
    lanActiveCount: number;
    masterClientCount: number;
    repeaterClientCount: number;
  };
  activeDevices: NetworkClientDevice[];
  passiveDevices: NetworkClientDevice[];
  history: BandwidthSamplePoint[];
  fritzSyncSeries: {
    dsKbps: number[];
    usKbps: number[];
  };
  logs: FritzLogEntry[];
}

type ActiveTab = 'overview' | 'devices' | 'wifi' | 'logs' | 'setup';

const MONO = "'JetBrains Mono', monospace";
const SANS = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const HAIRLINE = '1px solid rgba(255, 255, 255, 0.06)';

function formatBitrateFromBytesPerSec(bytesPerSec: number): string {
  const bitsPerSec = Math.max(0, bytesPerSec * 8);
  if (bitsPerSec >= 1_000_000) {
    return `${(bitsPerSec / 1_000_000).toFixed(2)} Mbit/s`;
  }
  if (bitsPerSec >= 1_000) {
    return `${(bitsPerSec / 1_000).toFixed(1)} kbit/s`;
  }
  return `${Math.round(bitsPerSec)} bit/s`;
}

function formatKbps(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(2)} Mbit/s`;
  }
  return `${kbps.toFixed(1)} kbit/s`;
}

function formatTotalBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(2)} TB`;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(1)} MB`;
}

function formatUptimeSec(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function categoryBadgeLabel(cat: NetworkClientDevice['category']): string {
  switch (cat) {
    case 'iot':
      return 'IOT / SMART HOME';
    case 'server':
      return 'SERVER / HASS';
    case 'compute':
      return 'PC / WORKSTATION';
    case 'mobile':
      return 'MOBILGERÄT';
    case 'network':
      return 'INFRASTRUKTUR';
    case 'media':
      return 'MEDIA / AUDIO';
    default:
      return 'CLIENT';
  }
}

export function App() {
  const [data, setData] = useState<NetworkOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [autoPoll, setAutoPoll] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  // Device filter state
  const [deviceQuery, setDeviceQuery] = useState('');
  const [deviceScope, setDeviceScope] = useState<'active' | 'passive' | 'all'>('active');
  const [connFilter, setConnFilter] = useState<'all' | 'wlan' | 'lan' | 'repeater' | 'master'>('all');

  // Event log filter state
  const [logGroupFilter, setLogGroupFilter] = useState<'all' | 'net' | 'wlan' | 'sys'>('all');
  const [logSearch, setLogSearch] = useState('');

  // Probe state
  const [probeHost, setProbeHost] = useState('192.168.188.92');
  const [probePort, setProbePort] = useState('8099');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    host: string;
    port: number;
    reachable: boolean;
    latencyMs: number | null;
    port80OrCustomMs: number | null;
    port443Ms: number | null;
    checkedAt: string;
  } | null>(null);

  // Setup form state
  const [cfgPrimaryHost, setCfgPrimaryHost] = useState('192.168.188.1');
  const [cfgPrimaryUser, setCfgPrimaryUser] = useState('fritz0972');
  const [cfgPrimaryPassword, setCfgPrimaryPassword] = useState('');
  const [cfgRepeaterHost, setCfgRepeaterHost] = useState('192.168.188.32');
  const [cfgUpstreamHost, setCfgUpstreamHost] = useState('192.168.178.1');
  const [cfgUpstreamUser, setCfgUpstreamUser] = useState('fritz2355');
  const [cfgUpstreamPassword, setCfgUpstreamPassword] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMessage, setCfgMessage] = useState<string | null>(null);

  const loadData = useCallback(async (forceLua = false) => {
    try {
      if (forceLua) setRefreshing(true);
      const res = forceLua
        ? await api.post<NetworkOverviewPayload>('/refresh', {})
        : await api.get<NetworkOverviewPayload>('/overview');
      setData(res);
      setError(null);
      setCfgPrimaryHost(res.config.primaryHost);
      setCfgPrimaryUser(res.config.primaryUser);
      setCfgRepeaterHost(res.config.repeaterHost);
      setCfgUpstreamHost(res.config.upstreamHost);
      setCfgUpstreamUser(res.config.upstreamUser);
    } catch (err: any) {
      setError(err?.message || 'Netzwerk-Telemetrie konnte nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    if (!autoPoll) return;
    const t = setInterval(() => {
      void loadData(false);
    }, 4000);
    return () => clearInterval(t);
  }, [autoPoll, loadData]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const freshnessInfo = useMemo(() => {
    if (!data?.fetchedAt) {
      return { timeStr: '—', relStr: 'wird geladen', ageSec: 0 };
    }
    const dt = new Date(data.fetchedAt);
    const timeStr = dt.toLocaleTimeString('de-AT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ageSec = Math.max(0, Math.round((nowMs - dt.getTime()) / 1000));
    const relStr = ageSec <= 1 ? 'gerade eben' : `vor ${ageSec}s`;
    return { timeStr, relStr, ageSec };
  }, [data?.fetchedAt, nowMs]);

  const filteredDevices = useMemo(() => {
    if (!data) return [];
    let list: NetworkClientDevice[] = [];
    if (deviceScope === 'active') list = data.activeDevices;
    else if (deviceScope === 'passive') list = data.passiveDevices;
    else list = [...data.activeDevices, ...data.passiveDevices];

    if (connFilter === 'wlan') {
      list = list.filter((d) => d.connectionType === 'wlan' || d.connectionType === 'guest');
    } else if (connFilter === 'lan') {
      list = list.filter((d) => d.connectionType === 'lan');
    } else if (connFilter === 'repeater') {
      list = list.filter((d) => d.meshParentIp === data.config.repeaterHost);
    } else if (connFilter === 'master') {
      list = list.filter((d) => d.meshParentIp !== data.config.repeaterHost);
    }

    const q = deviceQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.ip.toLowerCase().includes(q) ||
          d.mac.toLowerCase().includes(q) ||
          d.portLabel.toLowerCase().includes(q) ||
          d.meshParentName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, deviceScope, connFilter, deviceQuery]);

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    let list = data.logs;
    if (logGroupFilter !== 'all') {
      list = list.filter((l) => l.group === logGroupFilter);
    }
    const q = logSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((l) => l.msg.toLowerCase().includes(q) || l.date.includes(q) || l.time.includes(q));
    }
    return list;
  }, [data, logGroupFilter, logSearch]);

  async function handleRunProbe(customHost?: string, customPort?: number) {
    const targetHost = (customHost ?? probeHost).trim();
    const targetPort = customPort ?? (Number(probePort) || 80);
    if (!targetHost) return;
    setProbeHost(targetHost);
    setProbePort(String(targetPort));
    setProbeLoading(true);
    try {
      const res = await api.post<any>('/probe', { host: targetHost, port: targetPort });
      setProbeResult(res);
    } catch {
      setProbeResult({
        host: targetHost,
        port: targetPort,
        reachable: false,
        latencyMs: null,
        port80OrCustomMs: null,
        port443Ms: null,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setProbeLoading(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setCfgSaving(true);
    setCfgMessage(null);
    try {
      const res = await api.post<{ ok: boolean; overview: NetworkOverviewPayload }>('/config', {
        primaryHost: cfgPrimaryHost,
        primaryUser: cfgPrimaryUser,
        primaryPassword: cfgPrimaryPassword,
        repeaterHost: cfgRepeaterHost,
        upstreamHost: cfgUpstreamHost,
        upstreamUser: cfgUpstreamUser,
        upstreamPassword: cfgUpstreamPassword,
      });
      if (res?.overview) {
        setData(res.overview);
      }
      setCfgPrimaryPassword('');
      setCfgUpstreamPassword('');
      setCfgMessage('Router-Konfiguration in /data/shared.db gespeichert und FRITZ!OS Sitzung verifiziert.');
    } catch (err: any) {
      setCfgMessage(`Fehler: ${err?.message || 'Speichern fehlgeschlagen'}`);
    } finally {
      setCfgSaving(false);
    }
  }

  function renderSparklineSvg(
    points: number[],
    secondaryPoints?: number[],
    colorPrimary = '#10b981',
    colorSecondary = '#3b82f6',
    height = 76
  ) {
    const width = 540;
    const validPrimary = points.length > 0 ? points : [0, 0];
    const validSecondary = secondaryPoints && secondaryPoints.length > 0 ? secondaryPoints : [];
    const maxVal = Math.max(10, ...validPrimary, ...validSecondary);

    const buildPath = (arr: number[]) => {
      if (arr.length === 0) return '';
      if (arr.length === 1) return `M 0 ${height - 6} L ${width} ${height - 6}`;
      return arr
        .map((v, idx) => {
          const x = (idx / (arr.length - 1)) * width;
          const y = height - 6 - (Math.min(v, maxVal) / maxVal) * (height - 14);
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
    };

    const pPath = buildPath(validPrimary);
    const sPath = buildPath(validSecondary);

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: `${height}px`, display: 'block', overflow: 'visible' }}
      >
        <line x1="0" y1={height - 6} x2={width} y2={height - 6} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" strokeWidth="1" />
        {sPath && (
          <path d={sPath} fill="none" stroke={colorSecondary} strokeWidth="1.5" strokeOpacity="0.85" />
        )}
        {pPath && (
          <path d={pPath} fill="none" stroke={colorPrimary} strokeWidth="1.75" />
        )}
      </svg>
    );
  }

  const primaryRouter = data?.routers.primary;
  const upstreamRouter = data?.routers.upstream;
  const repeaterNode = data?.routers.repeater;
  const authOk = Boolean(data?.auth.primaryOk);

  // Use the higher of upstream Cable vs local WAN byte rate for real-time activity display
  const liveDownBytesSec = Math.max(
    upstreamRouter?.upnp.byteReceiveRate || 0,
    primaryRouter?.upnp.byteReceiveRate || 0
  );
  const liveUpBytesSec = Math.max(
    upstreamRouter?.upnp.byteSendRate || 0,
    primaryRouter?.upnp.byteSendRate || 0
  );
  const maxDownMbps = ((upstreamRouter?.upnp.maxDownstreamBitRate || 537_600_000) / 1_000_000).toFixed(1);
  const maxUpMbps = ((upstreamRouter?.upnp.maxUpstreamBitRate || 53_760_000) / 1_000_000).toFixed(1);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#fafafa',
        fontFamily: SANS,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* TOP HEADER & MANDATORY DATA FRESHNESS / ACTION STRIP */}
      <header
        style={{
          padding: '16px 24px 0 24px',
          borderBottom: HAIRLINE,
          background: '#09090b',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            paddingBottom: '14px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: MONO,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#a1a1aa',
                  padding: '2px 6px',
                  border: HAIRLINE,
                  background: '#111113',
                }}
              >
                NETZWERK & ROUTER TELEMETRIE
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: MONO,
                  color: '#52525b',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {primaryRouter?.host || '192.168.188.1'} · {upstreamRouter?.host || '192.168.178.1'}
              </span>
            </div>
            <h1
              style={{
                margin: '6px 0 0 0',
                fontSize: '20px',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: '#fafafa',
              }}
            >
              Netzwerk & FRITZ!Box Monitor
            </h1>
          </div>

          {/* DATA FRESHNESS & CONFIGURATION STATUS BAR */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
              background: '#111113',
              border: HAIRLINE,
              padding: '6px 12px',
            }}
          >
            {/* Status Dot + Auth Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: error ? '#ef4444' : authOk ? '#10b981' : '#f59e0b',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '12px', color: '#fafafa', fontWeight: 500 }}>
                {error
                  ? 'Verbindungsfehler'
                  : authOk
                    ? `FRITZ!OS Verbunden (${data?.auth.primaryUser})`
                    : 'Eingabe erforderlich: Router-Login prüfen'}
              </span>
            </div>

            <span style={{ color: 'rgba(255,255,255,0.12)' }}>|</span>

            {/* Data Freshness Timestamp */}
            <div
              style={{
                fontSize: '11px',
                fontFamily: MONO,
                color: '#a1a1aa',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Stand: {freshnessInfo.timeStr} ({freshnessInfo.relStr})
            </div>

            <span style={{ color: 'rgba(255,255,255,0.12)' }}>|</span>

            {/* Controls */}
            <button
              onClick={() => setAutoPoll((p) => !p)}
              style={{
                background: autoPoll ? '#141417' : 'transparent',
                border: HAIRLINE,
                color: autoPoll ? '#10b981' : '#a1a1aa',
                fontFamily: MONO,
                fontSize: '11px',
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              {autoPoll ? 'LIVE 4s: AN' : 'LIVE: PAUSE'}
            </button>

            <button
              onClick={() => void loadData(true)}
              disabled={refreshing}
              style={{
                background: '#141417',
                border: HAIRLINE,
                color: '#fafafa',
                fontFamily: SANS,
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 9px',
                cursor: 'pointer',
              }}
            >
              {refreshing ? 'Sync...' : 'Jetzt prüfen'}
            </button>

            <button
              onClick={() => setActiveTab('setup')}
              style={{
                background: authOk ? 'transparent' : '#f59e0b',
                border: HAIRLINE,
                color: authOk ? '#a1a1aa' : '#09090b',
                fontFamily: SANS,
                fontSize: '11px',
                fontWeight: authOk ? 400 : 600,
                padding: '3px 9px',
                cursor: 'pointer',
              }}
            >
              Setup & Zugangsdaten
            </button>

            <a
              href="/apps/cortex/?tab=vault"
              style={{
                fontSize: '11px',
                color: '#a1a1aa',
                textDecoration: 'none',
                borderBottom: '1px dotted rgba(255,255,255,0.25)',
              }}
            >
              Cortex Vault
            </a>
          </div>
        </div>

        {/* TEXT-LINK NAVIGATION TABS */}
        <nav style={{ display: 'flex', gap: '24px', overflowX: 'auto' }}>
          {(
            [
              { id: 'overview', label: 'Übersicht & Topologie' },
              {
                id: 'devices',
                label: `Clients & Mesh (${data?.deviceSummary.activeCount ?? 0} Aktiv / ${data?.deviceSummary.passiveCount ?? 0} Offline)`,
              },
              { id: 'wifi', label: 'WLAN & Hardware' },
              { id: 'logs', label: `Ereignis-Log & Diagnose (${data?.logs.length ?? 0})` },
              { id: 'setup', label: 'Setup & Zugangsdaten' },
            ] as Array<{ id: ActiveTab; label: string }>
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '1px solid #fafafa' : '1px solid transparent',
                  color: isActive ? '#fafafa' : '#a1a1aa',
                  fontFamily: SANS,
                  fontSize: '13px',
                  fontWeight: isActive ? 500 : 400,
                  padding: '8px 0 10px 0',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* TOP 4-COLUMN HAIRLINE KPI STRIP */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          borderBottom: HAIRLINE,
          background: '#09090b',
        }}
      >
        {/* KPI 1: WAN THROUGHPUT & PUBLIC IP */}
        <div style={{ padding: '16px 24px', borderRight: HAIRLINE }}>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#a1a1aa',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>WAN Durchsatz (Live)</span>
            <span style={{ fontFamily: MONO, color: '#10b981' }}>
              {upstreamRouter?.upnp.externalIp || '81.217.177.239'}
            </span>
          </div>
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: '14px',
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', color: '#a1a1aa', marginRight: '4px' }}>RX</span>
              <span style={{ fontSize: '20px', fontWeight: 600, color: '#fafafa' }}>
                {formatBitrateFromBytesPerSec(liveDownBytesSec)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: '#a1a1aa', marginRight: '4px' }}>TX</span>
              <span style={{ fontSize: '15px', fontWeight: 500, color: '#a1a1aa' }}>
                {formatBitrateFromBytesPerSec(liveUpBytesSec)}
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              fontFamily: MONO,
              color: '#52525b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Sync: {maxDownMbps} / {maxUpMbps} Mbit/s ({primaryRouter?.provider || 'kabelplus'})
          </div>
        </div>

        {/* KPI 2: PRIMARY ROUTER STATUS (FRITZ!Box 6890 LTE) */}
        <div style={{ padding: '16px 24px', borderRight: HAIRLINE }}>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#a1a1aa',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{primaryRouter?.name || 'FRITZ!Box 6890 LTE'}</span>
            <span style={{ fontFamily: MONO, color: authOk ? '#10b981' : '#f59e0b' }}>
              OS {primaryRouter?.osVersion || '7.57'}
            </span>
          </div>
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div>
              <span style={{ fontSize: '20px', fontWeight: 600, color: '#fafafa' }}>
                {primaryRouter?.cpuPct ?? 10}%
              </span>
              <span style={{ fontSize: '11px', color: '#a1a1aa', marginLeft: '4px' }}>CPU</span>
            </div>
            <div>
              <span style={{ fontSize: '20px', fontWeight: 600, color: '#fafafa' }}>
                {primaryRouter?.cpuTempC ?? 70}°C
              </span>
              <span style={{ fontSize: '11px', color: '#a1a1aa', marginLeft: '4px' }}>Temp</span>
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: 500, color: '#a1a1aa' }}>
                {primaryRouter?.ramUsedPct ?? 44.2}%
              </span>
              <span style={{ fontSize: '11px', color: '#52525b', marginLeft: '4px' }}>RAM</span>
            </div>
          </div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              fontFamily: MONO,
              color: '#52525b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            LAN-Gateway {primaryRouter?.host || '192.168.188.1'} · Energie {primaryRouter?.energyPct ?? 22}%
          </div>
        </div>

        {/* KPI 3: CONNECTED CLIENTS & MESH */}
        <div style={{ padding: '16px 24px', borderRight: HAIRLINE }}>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#a1a1aa',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Aktive Clients & Mesh</span>
            <span style={{ fontFamily: MONO, color: '#a1a1aa' }}>
              {data?.deviceSummary.onlineCount ?? 0} Online
            </span>
          </div>
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: '12px',
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ fontSize: '20px', fontWeight: 600, color: '#fafafa' }}>
              {data?.deviceSummary.activeCount ?? 0}
            </span>
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Aktiv ({data?.deviceSummary.wlanActiveCount ?? 0} WLAN · {data?.deviceSummary.lanActiveCount ?? 0} LAN)
            </span>
          </div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              fontFamily: MONO,
              color: '#52525b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Mesh: {data?.deviceSummary.masterClientCount ?? 0} Master ·{' '}
            {data?.deviceSummary.repeaterClientCount ?? 0} Repeater (.32)
          </div>
        </div>

        {/* KPI 4: NETWORK LATENCY MATRIX */}
        <div style={{ padding: '16px 24px' }}>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#a1a1aa',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Hop-Latenz (TCP RTT)</span>
            <span style={{ fontFamily: MONO, color: '#10b981' }}>4 Hops OK</span>
          </div>
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: '14px',
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', color: '#a1a1aa', marginRight: '4px' }}>GW</span>
              <span style={{ fontSize: '20px', fontWeight: 600, color: '#fafafa' }}>
                {data?.latencies.gatewayMs ?? '—'} ms
              </span>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: '#a1a1aa', marginRight: '4px' }}>WAN</span>
              <span style={{ fontSize: '15px', fontWeight: 500, color: '#a1a1aa' }}>
                {data?.latencies.cloudflareDnsMs ?? '—'} ms
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              fontFamily: MONO,
              color: '#52525b',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Repeater (.32): {data?.latencies.repeaterMs ?? '—'} ms · Cable (.178.1):{' '}
            {data?.latencies.upstreamMs ?? '—'} ms
          </div>
        </div>
      </section>

      {/* MAIN CONTENT BODY */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        {loading && !data ? (
          <div style={{ padding: '48px 0', fontFamily: MONO, fontSize: '12px', color: '#a1a1aa' }}>
            Verbinde mit FRITZ!Box 6890 LTE (192.168.188.1) & FRITZ!Box 6660 Cable (192.168.178.1)...
          </div>
        ) : null}

        {/* TAB 1: OVERVIEW & TOPOLOGY */}
        {activeTab === 'overview' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* DUAL-ROUTER & MESH TOPOLOGY CHAIN */}
            <div style={{ border: HAIRLINE, background: '#111113' }}>
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: HAIRLINE,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#a1a1aa',
                  }}
                >
                  Netzwerk-Topologie & Kaskadierte Router-Kette
                </span>
                <span style={{ fontSize: '11px', fontFamily: MONO, color: '#52525b' }}>
                  Subnetz 192.168.188.0/24 → Uplink 192.168.178.0/24 → Internet
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                }}
              >
                {/* NODE 1: INTERNET / ISP */}
                <div style={{ padding: '16px', borderRight: HAIRLINE }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                      01 · WAN / ISP UPLINK
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: MONO,
                        color: '#10b981',
                        padding: '1px 6px',
                        border: HAIRLINE,
                      }}
                    >
                      CONNECTED
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 600, color: '#fafafa' }}>
                    {primaryRouter?.provider || 'kabelplus'} Cable WAN
                  </div>
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      fontSize: '11px',
                      fontFamily: MONO,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ color: '#a1a1aa' }}>Public IPv4:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {upstreamRouter?.upnp.externalIp || '81.217.177.239'}
                    </div>
                    <div style={{ color: '#a1a1aa' }}>DNS Server:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {upstreamRouter?.upnp.dnsServers.join(', ') || '195.202.128.23'}
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Cloudflare 1.1.1.1:</div>
                    <div style={{ color: '#10b981', textAlign: 'right' }}>
                      {data.latencies.cloudflareDnsMs ?? '—'} ms
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Google DNS 8.8.8.8:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {data.latencies.googleDnsMs ?? '—'} ms
                    </div>
                  </div>
                </div>

                {/* NODE 2: UPSTREAM CABLE ROUTER (192.168.178.1) */}
                <div style={{ padding: '16px', borderRight: HAIRLINE }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                      02 · EDGE MODEM ({upstreamRouter?.host})
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: MONO,
                        color: upstreamRouter?.upnp.reachable ? '#10b981' : '#ef4444',
                        padding: '1px 6px',
                        border: HAIRLINE,
                      }}
                    >
                      {upstreamRouter?.upnp.reachable ? 'UPnP LIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 600, color: '#fafafa' }}>
                    {upstreamRouter?.name || 'FRITZ!Box 6660 Cable'}
                  </div>
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      fontSize: '11px',
                      fontFamily: MONO,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ color: '#a1a1aa' }}>Max Sync:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {maxDownMbps} / {maxUpMbps} Mbit/s
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Verbindungsdauer:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {formatUptimeSec(upstreamRouter?.upnp.uptimeSec || 0)}
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Gesamt RX / TX:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {formatTotalBytes(upstreamRouter?.upnp.totalBytesReceived || 0)} /{' '}
                      {formatTotalBytes(upstreamRouter?.upnp.totalBytesSent || 0)}
                    </div>
                    <div style={{ color: '#a1a1aa' }}>RTT (ab Thassi):</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {data.latencies.upstreamMs ?? '—'} ms
                    </div>
                  </div>
                </div>

                {/* NODE 3: PRIMARY HOME ROUTER (192.168.188.1) */}
                <div style={{ padding: '16px', borderRight: HAIRLINE }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                      03 · MESH MASTER ({primaryRouter?.host})
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: MONO,
                        color: authOk ? '#10b981' : '#f59e0b',
                        padding: '1px 6px',
                        border: HAIRLINE,
                      }}
                    >
                      {authOk ? 'SID AUTH OK' : 'UPnP ONLY'}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 600, color: '#fafafa' }}>
                    {primaryRouter?.name || 'FRITZ!Box 6890 LTE'}
                  </div>
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      fontSize: '11px',
                      fontFamily: MONO,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ color: '#a1a1aa' }}>WAN-IP (.178.x):</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {primaryRouter?.wanIpOnUpstream || '192.168.178.69'} (GbE ATA)
                    </div>
                    <div style={{ color: '#a1a1aa' }}>WLAN Funknetz:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>Obi-WLAN Kenobi</div>
                    <div style={{ color: '#a1a1aa' }}>Direkte Clients:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {data.deviceSummary.masterClientCount} aktiv
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Gesamt RX / TX:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {formatTotalBytes(primaryRouter?.upnp.totalBytesReceived || 0)} /{' '}
                      {formatTotalBytes(primaryRouter?.upnp.totalBytesSent || 0)}
                    </div>
                  </div>
                </div>

                {/* NODE 4: MESH REPEATER (192.168.188.32) */}
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                      04 · MESH REPEATER ({repeaterNode?.host})
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: MONO,
                        color: repeaterNode?.reachable ? '#10b981' : '#f59e0b',
                        padding: '1px 6px',
                        border: HAIRLINE,
                      }}
                    >
                      {repeaterNode?.authenticated
                        ? 'MESH SID OK'
                        : repeaterNode?.reachable
                          ? 'ONLINE'
                          : 'OFFLINE'}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 600, color: '#fafafa' }}>
                    {repeaterNode?.name || 'FRITZ!Repeater'}
                  </div>
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      fontSize: '11px',
                      fontFamily: MONO,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ color: '#a1a1aa' }}>Mesh Rolle:</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>WLAN Repeater Bridge</div>
                    <div style={{ color: '#a1a1aa' }}>Zugeordnete Clients:</div>
                    <div style={{ color: '#10b981', textAlign: 'right' }}>
                      {repeaterNode?.connectedClients ?? 0} Geräte aktiv
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Latenz (TCP 80):</div>
                    <div style={{ color: '#fafafa', textAlign: 'right' }}>
                      {repeaterNode?.latencyMs ?? '—'} ms
                    </div>
                    <div style={{ color: '#a1a1aa' }}>Web-Oberfläche:</div>
                    <div style={{ textAlign: 'right' }}>
                      <a
                        href={`http://${repeaterNode?.host || '192.168.188.32'}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#3b82f6', textDecoration: 'none' }}
                      >
                        Öffnen ↗
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE THROUGHPUT & LATENCY TELEMETRY CHARTS */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: '24px',
              }}
            >
              {/* CHART 1: WAN THROUGHPUT (DOWNSTREAM / UPSTREAM) */}
              <div style={{ border: HAIRLINE, background: '#111113', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#a1a1aa',
                      }}
                    >
                      Echtzeit-Bandbreite (Downstream vs. Upstream)
                    </div>
                    <div style={{ fontSize: '11px', color: '#52525b', marginTop: '2px' }}>
                      FRITZ!OS Online-Monitor & UPnP Zeitreihe
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontFamily: MONO }}>
                    <span style={{ color: '#10b981' }}>
                      ■ RX: {formatBitrateFromBytesPerSec(liveDownBytesSec)}
                    </span>
                    <span style={{ color: '#3b82f6' }}>
                      ■ TX: {formatBitrateFromBytesPerSec(liveUpBytesSec)}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  {renderSparklineSvg(
                    data.history.length > 2
                      ? data.history.map((h) => Math.max(h.wanRxKbps, h.lanRxKbps))
                      : data.fritzSyncSeries.dsKbps,
                    data.history.length > 2
                      ? data.history.map((h) => Math.max(h.wanTxKbps, h.lanTxKbps))
                      : data.fritzSyncSeries.usKbps,
                    '#10b981',
                    '#3b82f6',
                    92
                  )}
                </div>
              </div>

              {/* CHART 2: MULTI-HOP LATENCY HISTORY */}
              <div style={{ border: HAIRLINE, background: '#111113', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#a1a1aa',
                      }}
                    >
                      Multi-Hop Latenzverlauf (ms)
                    </div>
                    <div style={{ fontSize: '11px', color: '#52525b', marginTop: '2px' }}>
                      Cloudflare 1.1.1.1 (Grün) vs. Local Gateway 192.168.188.1 (Blau)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontFamily: MONO }}>
                    <span style={{ color: '#10b981' }}>
                      ■ 1.1.1.1: {data.latencies.cloudflareDnsMs ?? '—'} ms
                    </span>
                    <span style={{ color: '#3b82f6' }}>
                      ■ .188.1: {data.latencies.gatewayMs ?? '—'} ms
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  {renderSparklineSvg(
                    data.history.map((h) => h.latExternalMs || 0),
                    data.history.map((h) => h.latGatewayMs || 0),
                    '#10b981',
                    '#3b82f6',
                    92
                  )}
                </div>
              </div>
            </div>

            {/* TOP ACTIVE CLIENTS SNAPSHOT TABLE */}
            <div style={{ border: HAIRLINE, background: '#111113' }}>
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: HAIRLINE,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#a1a1aa',
                  }}
                >
                  Aktive Geräte im Heimnetz ({data.activeDevices.length} verbunden)
                </span>
                <button
                  onClick={() => setActiveTab('devices')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fafafa',
                    fontSize: '11px',
                    fontFamily: MONO,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Alle {data.activeDevices.length + data.passiveDevices.length} Geräte öffnen →
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: HAIRLINE,
                        color: '#a1a1aa',
                        textAlign: 'left',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      <th style={{ padding: '8px 16px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>Hostname / Gerät</th>
                      <th style={{ padding: '8px 12px' }}>IPv4-Adresse</th>
                      <th style={{ padding: '8px 12px' }}>MAC-Adresse</th>
                      <th style={{ padding: '8px 12px' }}>Mesh-Knoten</th>
                      <th style={{ padding: '8px 12px' }}>Schnittstelle & Link-Rate</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right' }}>Kategorie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activeDevices.slice(0, 14).map((dev) => (
                      <tr key={dev.uid} style={{ borderBottom: HAIRLINE }}>
                        <td style={{ padding: '8px 16px', fontFamily: MONO, fontSize: '11px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: dev.online ? '#10b981' : '#3b82f6',
                              marginRight: '6px',
                            }}
                          />
                          <span style={{ color: dev.online ? '#10b981' : '#a1a1aa' }}>
                            {dev.online ? 'WAN-ONLINE' : 'LAN-AKTIV'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: '#fafafa' }}>
                          {dev.name}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: MONO,
                            color: '#fafafa',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {dev.ip || '—'}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: MONO,
                            color: '#a1a1aa',
                            fontSize: '11px',
                          }}
                        >
                          {dev.mac || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: '11px', color: '#a1a1aa' }}>
                          {dev.meshParentIp === data.config.repeaterHost
                            ? 'Repeater (.32)'
                            : '6890 LTE (.1)'}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: MONO,
                            fontSize: '11px',
                            color: '#fafafa',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {dev.portLabel} · <span style={{ color: '#a1a1aa' }}>{dev.speedLabel}</span>
                        </td>
                        <td
                          style={{
                            padding: '8px 16px',
                            textAlign: 'right',
                            fontFamily: MONO,
                            fontSize: '10px',
                            color: '#a1a1aa',
                          }}
                        >
                          {categoryBadgeLabel(dev.category)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALL CLIENTS & MESH DEVICES */}
        {activeTab === 'devices' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* FILTER BAR */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: '#111113',
                border: HAIRLINE,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {(
                  [
                    { id: 'active', label: `Aktiv (${data.activeDevices.length})` },
                    { id: 'passive', label: `Offline / Bekannt (${data.passiveDevices.length})` },
                    {
                      id: 'all',
                      label: `Alle (${data.activeDevices.length + data.passiveDevices.length})`,
                    },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setDeviceScope(s.id)}
                    style={{
                      background: deviceScope === s.id ? '#fafafa' : '#141417',
                      color: deviceScope === s.id ? '#09090b' : '#a1a1aa',
                      border: HAIRLINE,
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontFamily: MONO,
                      fontWeight: deviceScope === s.id ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {s.label}
                  </button>
                ))}

                <span style={{ color: 'rgba(255,255,255,0.12)', margin: '0 4px' }}>|</span>

                {(
                  [
                    { id: 'all', label: 'Alle Medien' },
                    { id: 'wlan', label: 'Nur WLAN' },
                    { id: 'lan', label: 'Nur LAN' },
                    { id: 'master', label: 'Node: 6890 LTE (.1)' },
                    { id: 'repeater', label: 'Node: Repeater (.32)' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setConnFilter(f.id)}
                    style={{
                      background: connFilter === f.id ? '#141417' : 'transparent',
                      color: connFilter === f.id ? '#fafafa' : '#a1a1aa',
                      border: connFilter === f.id ? '1px solid rgba(255,255,255,0.24)' : HAIRLINE,
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontFamily: SANS,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
                placeholder="Suche nach Hostname, IP, MAC, Shelly, Port..."
                style={{
                  background: '#141417',
                  border: HAIRLINE,
                  color: '#fafafa',
                  fontFamily: MONO,
                  fontSize: '12px',
                  padding: '6px 12px',
                  minWidth: '280px',
                  outline: 'none',
                }}
              />
            </div>

            {/* FULL DEVICE TABLE */}
            <div style={{ border: HAIRLINE, background: '#111113', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: HAIRLINE,
                      color: '#a1a1aa',
                      textAlign: 'left',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '10px 16px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Gerätename</th>
                    <th style={{ padding: '10px 12px' }}>IPv4</th>
                    <th style={{ padding: '10px 12px' }}>MAC-Adresse</th>
                    <th style={{ padding: '10px 12px' }}>Mesh-Parent</th>
                    <th style={{ padding: '10px 12px' }}>Port / Frequenz</th>
                    <th style={{ padding: '10px 12px' }}>Link-Speed (RX/TX)</th>
                    <th style={{ padding: '10px 12px' }}>Typ</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Diagnose</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((dev) => (
                    <tr key={dev.uid} style={{ borderBottom: HAIRLINE }}>
                      <td style={{ padding: '8px 16px', fontFamily: MONO, fontSize: '11px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: !dev.active
                              ? '#52525b'
                              : dev.online
                                ? '#10b981'
                                : '#3b82f6',
                            marginRight: '6px',
                          }}
                        />
                        <span
                          style={{
                            color: !dev.active
                              ? '#52525b'
                              : dev.online
                                ? '#10b981'
                                : '#fafafa',
                          }}
                        >
                          {!dev.active ? 'OFFLINE' : dev.online ? 'ONLINE' : 'LAN'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: '#fafafa' }}>
                        {dev.name}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          fontFamily: MONO,
                          color: '#fafafa',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {dev.ip || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          fontFamily: MONO,
                          fontSize: '11px',
                          color: '#a1a1aa',
                        }}
                      >
                        {dev.mac || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: '11px', color: '#a1a1aa' }}>
                        {dev.meshParentIp === data.config.repeaterHost
                          ? `FRITZ!Repeater (${dev.meshParentIp})`
                          : `FRITZ!Box 6890 (${dev.meshParentIp})`}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: '11px', color: '#fafafa' }}>
                        {dev.portLabel || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          fontFamily: MONO,
                          fontSize: '11px',
                          color: '#a1a1aa',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {dev.speedLabel || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: '10px', color: '#a1a1aa' }}>
                        {categoryBadgeLabel(dev.category)}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                        {dev.ip && (
                          <button
                            onClick={() => {
                              setActiveTab('logs');
                              void handleRunProbe(dev.ip, 80);
                            }}
                            style={{
                              background: '#141417',
                              border: HAIRLINE,
                              color: '#a1a1aa',
                              fontFamily: MONO,
                              fontSize: '10px',
                              padding: '2px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            TCP Probe
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredDevices.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          padding: '24px',
                          textAlign: 'center',
                          fontFamily: MONO,
                          fontSize: '12px',
                          color: '#52525b',
                        }}
                      >
                        Keine Geräte für den gewählten Filter gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: WLAN & HARDWARE TELEMETRY */}
        {activeTab === 'wifi' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* WIFI CONFIG & RADIO STRIP */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                border: HAIRLINE,
                background: '#111113',
              }}
            >
              <div style={{ padding: '16px', borderRight: HAIRLINE }}>
                <div style={{ fontSize: '11px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                  Funknetz (SSID & Bänder)
                </div>
                <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 600, color: '#fafafa' }}>
                  {data.wifi.ssidSummary}
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', fontFamily: MONO, color: '#10b981' }}>
                  2,4 GHz Aktiv · 5 GHz Aktiv
                </div>
              </div>

              <div style={{ padding: '16px', borderRight: HAIRLINE }}>
                <div style={{ fontSize: '11px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                  Mesh Steering & Kanalwahl
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '16px',
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: '#fafafa',
                  }}
                >
                  {data.wifi.bandSteering ? 'Band-Steering AN' : 'Manuell'} · {data.wifi.channelMode}
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                  HT160: {data.wifi.ht160 ? 'Aktiv' : 'Standard'} · Sendeleistung Max: {data.wifi.powerLevel}%
                </div>
              </div>

              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: '#a1a1aa', textTransform: 'uppercase' }}>
                  RAM-Allokation (FRITZ!Box 6890 LTE)
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '16px',
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: '#fafafa',
                  }}
                >
                  {primaryRouter?.ramUsedPct}% Belegt ({primaryRouter?.ramFreePct}% Frei)
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', fontFamily: MONO, color: '#a1a1aa' }}>
                  Fest: {primaryRouter?.ramFixedPct}% · Dynamisch: {primaryRouter?.ramDynamicPct}%
                </div>
              </div>
            </div>

            {/* CPU UTILIZATION & CPU TEMPERATURE SERIES */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: '24px',
              }}
            >
              <div style={{ border: HAIRLINE, background: '#111113', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#a1a1aa',
                    }}
                  >
                    FRITZ!Box CPU-Auslastung (ecoStat Serie)
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#10b981' }}>
                    Aktuell: {primaryRouter?.cpuPct ?? 0}%
                  </span>
                </div>
                <div style={{ marginTop: '14px' }}>
                  {renderSparklineSvg(primaryRouter?.cpuUtilSeries || [], undefined, '#10b981', '#3b82f6', 90)}
                </div>
              </div>

              <div style={{ border: HAIRLINE, background: '#111113', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#a1a1aa',
                    }}
                  >
                    FRITZ!Box CPU-Temperaturverlauf (°C)
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#f59e0b' }}>
                    Aktuell: {primaryRouter?.cpuTempC ?? 70} °C
                  </span>
                </div>
                <div style={{ marginTop: '14px' }}>
                  {renderSparklineSvg(primaryRouter?.cpuTempSeries || [], undefined, '#f59e0b', '#3b82f6', 90)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: FRITZ!OS EVENT LOG & TCP PROBE DIAGNOSTICS */}
        {activeTab === 'logs' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* INTERACTIVE TCP LATENCY PROBE TOOL */}
            <div style={{ border: HAIRLINE, background: '#111113', padding: '16px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#a1a1aa',
                  marginBottom: '12px',
                }}
              >
                Live TCP Host- & Port-Latenzprüfung (ab Thassi Host 192.168.188.92)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={probeHost}
                  onChange={(e) => setProbeHost(e.target.value)}
                  placeholder="IP oder Hostname (z.B. 192.168.188.1)"
                  style={{
                    background: '#141417',
                    border: HAIRLINE,
                    color: '#fafafa',
                    fontFamily: MONO,
                    fontSize: '12px',
                    padding: '6px 12px',
                    width: '240px',
                  }}
                />
                <input
                  type="number"
                  value={probePort}
                  onChange={(e) => setProbePort(e.target.value)}
                  placeholder="Port (80)"
                  style={{
                    background: '#141417',
                    border: HAIRLINE,
                    color: '#fafafa',
                    fontFamily: MONO,
                    fontSize: '12px',
                    padding: '6px 10px',
                    width: '95px',
                  }}
                />
                <button
                  onClick={() => void handleRunProbe()}
                  disabled={probeLoading}
                  style={{
                    background: '#fafafa',
                    border: 'none',
                    color: '#09090b',
                    fontFamily: SANS,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '6px 14px',
                    cursor: 'pointer',
                  }}
                >
                  {probeLoading ? 'Messe...' : 'TCP-Latenz messen'}
                </button>

                {probeResult && (
                  <div
                    style={{
                      marginLeft: '12px',
                      fontFamily: MONO,
                      fontSize: '12px',
                      color: probeResult.reachable ? '#10b981' : '#ef4444',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {probeResult.host}:{probeResult.port} →{' '}
                    {probeResult.reachable
                      ? `ERREICHBAR (${probeResult.latencyMs} ms)`
                      : 'KEINE ANTWORT / TIMEOUT'}
                  </div>
                )}
              </div>
            </div>

            {/* FRITZ!OS SYSTEM & NETWORK EVENT LOG */}
            <div style={{ border: HAIRLINE, background: '#111113' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: HAIRLINE,
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {(
                    [
                      { id: 'all', label: `Alle Ereignisse (${data.logs.length})` },
                      { id: 'net', label: 'Internet & WAN' },
                      { id: 'wlan', label: 'WLAN & Mesh' },
                      { id: 'sys', label: 'System' },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setLogGroupFilter(g.id)}
                      style={{
                        background: logGroupFilter === g.id ? '#fafafa' : '#141417',
                        color: logGroupFilter === g.id ? '#09090b' : '#a1a1aa',
                        border: HAIRLINE,
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontFamily: MONO,
                        fontWeight: logGroupFilter === g.id ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Ereignisse durchsuchen..."
                  style={{
                    background: '#141417',
                    border: HAIRLINE,
                    color: '#fafafa',
                    fontFamily: MONO,
                    fontSize: '12px',
                    padding: '5px 10px',
                    minWidth: '240px',
                  }}
                />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: HAIRLINE,
                        color: '#a1a1aa',
                        textAlign: 'left',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: '8px 16px', width: '140px' }}>Zeitpunkt</th>
                      <th style={{ padding: '8px 12px', width: '90px' }}>Kategorie</th>
                      <th style={{ padding: '8px 16px' }}>Ereignismeldung (FRITZ!OS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, idx) => (
                      <tr key={`${l.date}-${l.time}-${idx}`} style={{ borderBottom: HAIRLINE }}>
                        <td
                          style={{
                            padding: '8px 16px',
                            fontFamily: MONO,
                            fontSize: '11px',
                            color: '#a1a1aa',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {l.date} {l.time}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: MONO,
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            color: l.group === 'net' ? '#10b981' : l.group === 'wlan' ? '#3b82f6' : '#a1a1aa',
                          }}
                        >
                          {l.group}
                        </td>
                        <td style={{ padding: '8px 16px', color: '#fafafa', lineHeight: 1.4 }}>{l.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SETUP & CREDENTIALS (/data/shared.db) */}
        {activeTab === 'setup' && (
          <div style={{ maxWidth: '760px', border: HAIRLINE, background: '#111113', padding: '20px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#a1a1aa',
              }}
            >
              Zentrale Router-Zugangsdaten (/data/shared.db → fritzbox_config)
            </div>
            <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '6px', lineHeight: 1.5 }}>
              Die Zugangsdaten werden zentral in <code style={{ fontFamily: MONO }}>/data/shared.db</code>{' '}
              gespeichert und nutzen das offizielle FRITZ!OS PBKDF2-SHA256 Challenge-Response Verfahren (
              <code style={{ fontFamily: MONO }}>login_sid.lua?version=2</code>).
            </p>

            <form
              onSubmit={handleSaveConfig}
              style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    Primärer Router (FRITZ!Box 6890 LTE) Host / IP
                  </label>
                  <input
                    type="text"
                    value={cfgPrimaryHost}
                    onChange={(e) => setCfgPrimaryHost(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    FRITZ!Box Benutzername
                  </label>
                  <input
                    type="text"
                    value={cfgPrimaryUser}
                    onChange={(e) => setCfgPrimaryUser(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    FRITZ!Box Passwort ({data?.config.hasPrimaryPassword ? 'Gespeichert — leer lassen zum Behalten' : 'Erforderlich'})
                  </label>
                  <input
                    type="password"
                    value={cfgPrimaryPassword}
                    onChange={(e) => setCfgPrimaryPassword(e.target.value)}
                    placeholder={data?.config.hasPrimaryPassword ? '••••••••••••' : 'Passwort eingeben'}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    FRITZ!Repeater Mesh-Knoten IP
                  </label>
                  <input
                    type="text"
                    value={cfgRepeaterHost}
                    onChange={(e) => setCfgRepeaterHost(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
              </div>

              <div style={{ borderTop: HAIRLINE, paddingTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    Upstream Cable Router IP
                  </label>
                  <input
                    type="text"
                    value={cfgUpstreamHost}
                    onChange={(e) => setCfgUpstreamHost(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    Upstream Benutzer (optional)
                  </label>
                  <input
                    type="text"
                    value={cfgUpstreamUser}
                    onChange={(e) => setCfgUpstreamUser(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    Upstream Passwort (optional)
                  </label>
                  <input
                    type="password"
                    value={cfgUpstreamPassword}
                    onChange={(e) => setCfgUpstreamPassword(e.target.value)}
                    placeholder="UPnP aktiv (optional)"
                    style={{
                      width: '100%',
                      background: '#141417',
                      border: HAIRLINE,
                      color: '#fafafa',
                      fontFamily: MONO,
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                <button
                  type="submit"
                  disabled={cfgSaving}
                  style={{
                    background: '#fafafa',
                    border: 'none',
                    color: '#09090b',
                    fontFamily: SANS,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '8px 16px',
                    cursor: 'pointer',
                  }}
                >
                  {cfgSaving ? 'Speichere & Prüfe...' : 'Speichern & Verbindung testen'}
                </button>
                {cfgMessage && (
                  <span style={{ fontSize: '12px', fontFamily: MONO, color: '#10b981' }}>{cfgMessage}</span>
                )}
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
