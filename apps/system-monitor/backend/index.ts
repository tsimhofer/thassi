import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { defineThassiApp, type ThassiAppContext } from '@thassi/sdk';
import { getHassSidebarStylerScript, syncHassFrontendFiles } from '../../../thassi_host/src/hass-sidebar-sync.js';
import { renderUnifiedDashboardHtml } from '../../../thassi_host/src/ambient-dashboard.js';
import { getUniformAppStylesheetTag } from '../../../thassi_host/src/thassi-uniform-ui.js';

export interface CpuCoreSnapshot {
  id: string;
  usagePct: number;
  userPct: number;
  systemPct: number;
  iowaitPct: number;
  irqPct: number;
  idlePct: number;
  freqMhz: number | null;
}

export interface OsProcessEntry {
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

export interface HassContainerWorkload {
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
  icon?: string;
}

export interface ActiveHassWorkloadItem {
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

export interface DiskIoDeviceStat {
  device: string;
  readKbPerSec: number;
  writeKbPerSec: number;
  ioOpsPerSec: number;
  totalReadGb: number;
  totalWriteGb: number;
}

export interface NetInterfaceStat {
  iface: string;
  rxKbPerSec: number;
  txKbPerSec: number;
  totalRxGb: number;
  totalTxGb: number;
  packetsPerSec: number;
}

export interface HistoryPoint {
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

interface RawCpuTicks {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
  total: number;
}

interface RawDiskSample {
  sectorsRead: number;
  sectorsWritten: number;
  ioOps: number;
}

interface RawNetSample {
  rxBytes: number;
  txBytes: number;
  packets: number;
}

const gState = globalThis as unknown as {
  __thassiSysMonTimer?: ReturnType<typeof setInterval>;
  __thassiSysMonLoopHistogram?: ReturnType<typeof monitorEventLoopDelay>;
};

if (gState.__thassiSysMonTimer) {
  clearInterval(gState.__thassiSysMonTimer);
}
if (!gState.__thassiSysMonLoopHistogram) {
  try {
    const h = monitorEventLoopDelay({ resolution: 20 });
    h.enable();
    gState.__thassiSysMonLoopHistogram = h;
  } catch {
    // ignore if unsupported
  }
}

export default defineThassiApp((ctx) => {
  const CLK_TCK = 100; // Standard Linux USER_HZ

  function repairSharedDbIfNeeded(dbInstance: any): { repaired: boolean; rescuedKeys: string[]; error?: string } {
    const rescued: Record<string, string> = {};
    const priorityKeys = [
      'gemini_api_key',
      'google_oauth_config',
      'google_oauth_tokens',
      'google_oauth_token',
      'bambu_printer_config',
      'github_token',
      'ha_connection',
      'google_weather_api_key',
      'published_sensors',
      'fritzbox_config',
    ];
    let needsRepair = false;
    try {
      const check = dbInstance.raw.prepare('PRAGMA quick_check').get() as Record<string, any> | undefined;
      const val = check ? Object.values(check)[0] : 'ok';
      if (val !== 'ok') needsRepair = true;
      dbInstance.raw.prepare('SELECT COUNT(*) FROM _thassi_kv').get();
      dbInstance.raw.prepare('SELECT COUNT(*) FROM system_notes').get();
    } catch {
      needsRepair = true;
    }

    if (!needsRepair) {
      return { repaired: false, rescuedKeys: [] };
    }

    // Rescue any readable keys from _thassi_kv before replacing file
    for (const k of priorityKeys) {
      try {
        const r = dbInstance.raw.prepare('SELECT value FROM _thassi_kv WHERE key = ?').get(k) as
          | { value?: string }
          | undefined;
        if (r && typeof r.value === 'string') {
          rescued[k] = r.value;
        }
      } catch {
        // ignore unreadable page
      }
    }
    try {
      const rows = dbInstance.raw.prepare('SELECT key, value FROM _thassi_kv').all() as Array<{
        key: string;
        value: string;
      }>;
      for (const r of rows) {
        if (r?.key && typeof r.value === 'string') {
          rescued[r.key] = r.value;
        }
      }
    } catch {
      // ignore
    }

    const dbPath = dbInstance.dbPath || '/data/shared.db';
    try {
      dbInstance.raw.close();
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(dbPath + suffix)) {
          fs.rmSync(dbPath + suffix, { force: true });
        }
      } catch {}
    }

    let freshDb: DatabaseSync;
    try {
      freshDb = new DatabaseSync(dbPath);
    } catch {
      try {
        freshDb = new DatabaseSync(path.join(os.tmpdir(), 'thassi_shared_fallback.db'));
      } catch {
        freshDb = new DatabaseSync(':memory:');
      }
    }
    freshDb.exec('PRAGMA journal_mode = WAL;');
    freshDb.exec('PRAGMA foreign_keys = ON;');
    freshDb.exec(`
      CREATE TABLE IF NOT EXISTS _thassi_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS system_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    const nowIso = new Date().toISOString();
    const ins = freshDb.prepare(
      'INSERT OR REPLACE INTO _thassi_kv (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const [k, v] of Object.entries(rescued)) {
      try {
        ins.run(k, v, nowIso);
      } catch {}
    }
    dbInstance.raw = freshDb;
    return { repaired: true, rescuedKeys: Object.keys(rescued) };
  }

  // Patch sharedDb singleton methods in-memory so any corruption self-heals immediately
  try {
    repairSharedDbIfNeeded(ctx.sharedDb);
    const proto = Object.getPrototypeOf(ctx.sharedDb);
    if (proto && !proto.__thassiSelfHealPatched) {
      proto.__thassiSelfHealPatched = true;
      proto.query = function (sql: string, params: unknown[] = []) {
        try {
          return this.raw.prepare(sql).all(...(params as [string]));
        } catch (err: any) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            try {
              return this.raw.prepare(sql).all(...(params as [string]));
            } catch {
              return [];
            }
          }
          throw err;
        }
      };
      proto.queryOne = function (sql: string, params: unknown[] = []) {
        try {
          return this.raw.prepare(sql).get(...(params as [string]));
        } catch (err: any) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            try {
              return this.raw.prepare(sql).get(...(params as [string]));
            } catch {
              return undefined;
            }
          }
          throw err;
        }
      };
      proto.execute = function (sql: string, params: unknown[] = []) {
        try {
          const res = this.raw.prepare(sql).run(...(params as [string]));
          return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
        } catch (err: any) {
          if (/malformed|corrupt|not a database|disk I\/O/i.test(String(err?.message || err))) {
            repairSharedDbIfNeeded(this);
            const res = this.raw.prepare(sql).run(...(params as [string]));
            return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
          }
          throw err;
        }
      };
    }
  } catch (e) {
    console.warn('[SystemMonitor] SharedDB check warning:', e);
  }

  let prevCpuTicks = new Map<string, RawCpuTicks>();
  let prevCtxt = 0;
  let prevIntr = 0;
  let prevStatAtMs = 0;

  let prevProcTicks = new Map<number, number>();
  let prevProcAtMs = 0;

  let prevDiskSamples = new Map<string, RawDiskSample>();
  let prevDiskAtMs = 0;

  let prevNetSamples = new Map<string, RawNetSample>();
  let prevNetAtMs = 0;

  const historyBuffer: HistoryPoint[] = [];
  const MAX_HISTORY = 72;

  let cachedSupervisorSnapshot: {
    fetchedAtMs: number;
    available: boolean;
    hostInfo: Record<string, any> | null;
    osInfo: Record<string, any> | null;
    coreInfo: Record<string, any> | null;
    supervisorInfo: Record<string, any> | null;
    resolutionInfo: Record<string, any> | null;
    jobs: Array<Record<string, any>>;
    containers: HassContainerWorkload[];
  } | null = null;

  let cachedHaActivity: {
    fetchedAtMs: number;
    totalEntities: number;
    runningScripts: Array<{ entityId: string; name: string; lastTriggered: string | null }>;
    recentAutomations: Array<{ entityId: string; name: string; lastTriggered: string; state: string; current: number }>;
    activeUpdates: Array<{ entityId: string; name: string; installedVersion: string; latestVersion: string; inProgress: boolean; pct: number | null }>;
    activeStreams: Array<{ entityId: string; name: string; state: string }>;
  } | null = null;

  // Read CPU thermal sensors from /sys/class/thermal
  function readCpuTemperatureC(): number | null {
    const candidates = [
      '/sys/class/thermal/thermal_zone0/temp',
      '/sys/class/thermal/thermal_zone1/temp',
      '/sys/class/hwmon/hwmon0/temp1_input',
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = Number(fs.readFileSync(p, 'utf-8').trim());
          if (Number.isFinite(raw) && raw > 0) {
            return Math.round((raw > 200 ? raw / 1000 : raw) * 10) / 10;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  function readCoreFreqMhz(coreId: string): number | null {
    try {
      const p = `/sys/devices/system/cpu/${coreId}/cpufreq/scaling_cur_freq`;
      if (fs.existsSync(p)) {
        const khz = Number(fs.readFileSync(p, 'utf-8').trim());
        if (Number.isFinite(khz) && khz > 0) return Math.round(khz / 1000);
      }
    } catch {
      // ignore
    }
    return null;
  }

  // Parse /proc/stat for CPU & kernel scheduler activity
  function sampleKernelCpuAndStat() {
    const nowMs = Date.now();
    const dtSec = prevStatAtMs > 0 ? Math.max(0.05, (nowMs - prevStatAtMs) / 1000) : 1;
    prevStatAtMs = nowMs;

    const currentTicks = new Map<string, RawCpuTicks>();
    let ctxt = 0;
    let intr = 0;
    let procsRunning = 1;
    let procsBlocked = 0;

    try {
      const raw = fs.readFileSync('/proc/stat', 'utf-8');
      for (const line of raw.split('\n')) {
        if (line.startsWith('cpu')) {
          const parts = line.trim().split(/\s+/);
          const id = parts[0];
          const user = Number(parts[1] || 0);
          const nice = Number(parts[2] || 0);
          const system = Number(parts[3] || 0);
          const idle = Number(parts[4] || 0);
          const iowait = Number(parts[5] || 0);
          const irq = Number(parts[6] || 0);
          const softirq = Number(parts[7] || 0);
          const steal = Number(parts[8] || 0);
          const total = user + nice + system + idle + iowait + irq + softirq + steal;
          currentTicks.set(id, { user, nice, system, idle, iowait, irq, softirq, steal, total });
        } else if (line.startsWith('ctxt ')) {
          ctxt = Number(line.split(/\s+/)[1] || 0);
        } else if (line.startsWith('intr ')) {
          intr = Number(line.split(/\s+/)[1] || 0);
        } else if (line.startsWith('procs_running ')) {
          procsRunning = Number(line.split(/\s+/)[1] || 1);
        } else if (line.startsWith('procs_blocked ')) {
          procsBlocked = Number(line.split(/\s+/)[1] || 0);
        }
      }
    } catch {
      // Fallback to os.cpus() if not on Linux
      const cpus = os.cpus();
      let u = 0, n = 0, s = 0, idl = 0, ir = 0;
      cpus.forEach((c, idx) => {
        const tot = c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
        currentTicks.set(`cpu${idx}`, {
          user: c.times.user,
          nice: c.times.nice,
          system: c.times.sys,
          idle: c.times.idle,
          iowait: 0,
          irq: c.times.irq,
          softirq: 0,
          steal: 0,
          total: tot,
        });
        u += c.times.user;
        n += c.times.nice;
        s += c.times.sys;
        idl += c.times.idle;
        ir += c.times.irq;
      });
      currentTicks.set('cpu', {
        user: u,
        nice: n,
        system: s,
        idle: idl,
        iowait: 0,
        irq: ir,
        softirq: 0,
        steal: 0,
        total: u + n + s + idl + ir,
      });
    }

    const computeDelta = (id: string, cur: RawCpuTicks): CpuCoreSnapshot => {
      const prev = prevCpuTicks.get(id);
      if (!prev || cur.total <= prev.total) {
        const tot = Math.max(1, cur.total);
        const busy = tot - cur.idle - cur.iowait;
        return {
          id,
          usagePct: Math.round((busy / tot) * 1000) / 10,
          userPct: Math.round(((cur.user + cur.nice) / tot) * 1000) / 10,
          systemPct: Math.round((cur.system / tot) * 1000) / 10,
          iowaitPct: Math.round((cur.iowait / tot) * 1000) / 10,
          irqPct: Math.round(((cur.irq + cur.softirq) / tot) * 1000) / 10,
          idlePct: Math.round((cur.idle / tot) * 1000) / 10,
          freqMhz: id === 'cpu' ? null : readCoreFreqMhz(id),
        };
      }
      const dTotal = Math.max(1, cur.total - prev.total);
      const dUser = Math.max(0, cur.user + cur.nice - (prev.user + prev.nice));
      const dSys = Math.max(0, cur.system - prev.system);
      const dIo = Math.max(0, cur.iowait - prev.iowait);
      const dIrq = Math.max(0, cur.irq + cur.softirq - (prev.irq + prev.softirq));
      const dSteal = Math.max(0, cur.steal - prev.steal);
      const dIdle = Math.max(0, cur.idle - prev.idle);
      const dBusy = Math.min(dTotal, dUser + dSys + dIrq + dSteal);

      return {
        id,
        usagePct: Math.round((dBusy / dTotal) * 1000) / 10,
        userPct: Math.round((dUser / dTotal) * 1000) / 10,
        systemPct: Math.round((dSys / dTotal) * 1000) / 10,
        iowaitPct: Math.round((dIo / dTotal) * 1000) / 10,
        irqPct: Math.round((dIrq / dTotal) * 1000) / 10,
        idlePct: Math.round((dIdle / dTotal) * 1000) / 10,
        freqMhz: id === 'cpu' ? null : readCoreFreqMhz(id),
      };
    };

    const totalCpu = currentTicks.get('cpu')
      ? computeDelta('cpu', currentTicks.get('cpu')!)
      : { id: 'cpu', usagePct: 0, userPct: 0, systemPct: 0, iowaitPct: 0, irqPct: 0, idlePct: 100, freqMhz: null };

    const cores: CpuCoreSnapshot[] = [];
    for (const [id, cur] of currentTicks.entries()) {
      if (id === 'cpu') continue;
      cores.push(computeDelta(id, cur));
    }

    const contextSwitchesPerSec =
      prevCtxt > 0 && ctxt >= prevCtxt ? Math.round((ctxt - prevCtxt) / dtSec) : 0;
    const interruptsPerSec =
      prevIntr > 0 && intr >= prevIntr ? Math.round((intr - prevIntr) / dtSec) : 0;

    prevCpuTicks = currentTicks;
    prevCtxt = ctxt;
    prevIntr = intr;

    let load1m = os.loadavg()[0] || 0;
    let load5m = os.loadavg()[1] || 0;
    let load15m = os.loadavg()[2] || 0;
    let runningKernelThreads = procsRunning;
    let totalKernelThreads = 0;

    try {
      const lraw = fs.readFileSync('/proc/loadavg', 'utf-8').trim().split(/\s+/);
      load1m = Number(lraw[0] || load1m);
      load5m = Number(lraw[1] || load5m);
      load15m = Number(lraw[2] || load15m);
      if (lraw[3] && lraw[3].includes('/')) {
        const [r, t] = lraw[3].split('/');
        runningKernelThreads = Number(r || procsRunning);
        totalKernelThreads = Number(t || 0);
      }
    } catch {
      // ignore
    }

    const cpuModel = os.cpus()[0]?.model || 'ARM64 / HASS OS Processor';

    return {
      cpuModel,
      coreCount: Math.max(1, cores.length || os.cpus().length),
      total: totalCpu,
      cores,
      load1m: Math.round(load1m * 100) / 100,
      load5m: Math.round(load5m * 100) / 100,
      load15m: Math.round(load15m * 100) / 100,
      runningKernelThreads,
      totalKernelThreads,
      procsRunning,
      procsBlocked,
      contextSwitchesPerSec,
      interruptsPerSec,
      cpuTempC: readCpuTemperatureC(),
      uptimeSeconds: Math.round(os.uptime()),
    };
  }

  // Parse /proc/meminfo
  function sampleMemoryMetrics() {
    const info: Record<string, number> = {};
    try {
      const raw = fs.readFileSync('/proc/meminfo', 'utf-8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([A-Za-z0-9_()]+):\s+(\d+)/);
        if (m) {
          info[m[1]] = Number(m[2]); // in kB
        }
      }
    } catch {
      // fallback
    }

    const totalKb = info.MemTotal || Math.round(os.totalmem() / 1024);
    const freeKb = info.MemFree || Math.round(os.freemem() / 1024);
    const availKb = info.MemAvailable || freeKb;
    const buffersKb = info.Buffers || 0;
    const cachedKb = (info.Cached || 0) + (info.SReclaimable || 0);
    const slabKb = info.Slab || 0;
    const dirtyKb = info.Dirty || 0;
    const activeKb = info.Active || 0;
    const inactiveKb = info.Inactive || 0;
    const swapTotalKb = info.SwapTotal || 0;
    const swapFreeKb = info.SwapFree || 0;

    const usedKb = Math.max(0, totalKb - availKb);
    const swapUsedKb = Math.max(0, swapTotalKb - swapFreeKb);

    const toMb = (kb: number) => Math.round((kb / 1024) * 10) / 10;

    return {
      totalMb: toMb(totalKb),
      usedMb: toMb(usedKb),
      availableMb: toMb(availKb),
      freeMb: toMb(freeKb),
      buffersCachedMb: toMb(buffersKb + cachedKb),
      slabMb: toMb(slabKb),
      dirtyMb: toMb(dirtyKb),
      activeMb: toMb(activeKb),
      inactiveMb: toMb(inactiveKb),
      usedPct: totalKb > 0 ? Math.round((usedKb / totalKb) * 1000) / 10 : 0,
      swapTotalMb: toMb(swapTotalKb),
      swapUsedMb: toMb(swapUsedKb),
      swapPct: swapTotalKb > 0 ? Math.round((swapUsedKb / swapTotalKb) * 1000) / 10 : 0,
    };
  }

  // Parse /proc/diskstats and filesystem statfs
  function sampleDiskAndIoMetrics() {
    let totalGb = 0;
    let freeGb = 0;
    let usedGb = 0;
    let usedPct = 0;

    try {
      const targetPath = fs.existsSync('/data') ? '/data' : '/';
      if (typeof fs.statfsSync === 'function') {
        const st = fs.statfsSync(targetPath);
        const totalBytes = st.blocks * st.bsize;
        const availBytes = st.bavail * st.bsize;
        const usedBytes = Math.max(0, totalBytes - st.bfree * st.bsize);
        totalGb = Math.round((totalBytes / 1073741824) * 100) / 100;
        freeGb = Math.round((availBytes / 1073741824) * 100) / 100;
        usedGb = Math.round((usedBytes / 1073741824) * 100) / 100;
        usedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
      }
    } catch {
      // ignore
    }

    const nowMs = Date.now();
    const dtSec = prevDiskAtMs > 0 ? Math.max(0.05, (nowMs - prevDiskAtMs) / 1000) : 1;
    prevDiskAtMs = nowMs;

    const currentSamples = new Map<string, RawDiskSample>();
    const devices: DiskIoDeviceStat[] = [];

    try {
      const raw = fs.readFileSync('/proc/diskstats', 'utf-8');
      for (const line of raw.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 14) continue;
        const dev = parts[2];
        // Filter whole block devices (mmcblk0, sda, sdb, nvme0n1, vda, zram0)
        if (!/^(mmcblk\d+|sd[a-z]+|nvme\d+n\d+|vd[a-z]+|zram\d+)$/.test(dev)) continue;
        const readsCompleted = Number(parts[3] || 0);
        const sectorsRead = Number(parts[5] || 0);
        const writesCompleted = Number(parts[7] || 0);
        const sectorsWritten = Number(parts[9] || 0);
        const ioOps = readsCompleted + writesCompleted;

        currentSamples.set(dev, { sectorsRead, sectorsWritten, ioOps });
        const prev = prevDiskSamples.get(dev);
        const dReadSectors = prev && sectorsRead >= prev.sectorsRead ? sectorsRead - prev.sectorsRead : 0;
        const dWriteSectors = prev && sectorsWritten >= prev.sectorsWritten ? sectorsWritten - prev.sectorsWritten : 0;
        const dOps = prev && ioOps >= prev.ioOps ? ioOps - prev.ioOps : 0;

        // 1 sector = 512 bytes = 0.5 KB
        devices.push({
          device: dev,
          readKbPerSec: Math.round(((dReadSectors * 0.5) / dtSec) * 10) / 10,
          writeKbPerSec: Math.round(((dWriteSectors * 0.5) / dtSec) * 10) / 10,
          ioOpsPerSec: Math.round((dOps / dtSec) * 10) / 10,
          totalReadGb: Math.round(((sectorsRead * 512) / 1073741824) * 100) / 100,
          totalWriteGb: Math.round(((sectorsWritten * 512) / 1073741824) * 100) / 100,
        });
      }
    } catch {
      // ignore
    }

    prevDiskSamples = currentSamples;

    const totalReadKbPerSec = Math.round(devices.reduce((s, d) => s + d.readKbPerSec, 0) * 10) / 10;
    const totalWriteKbPerSec = Math.round(devices.reduce((s, d) => s + d.writeKbPerSec, 0) * 10) / 10;

    return {
      totalGb,
      usedGb,
      freeGb,
      usedPct,
      totalReadKbPerSec,
      totalWriteKbPerSec,
      devices,
    };
  }

  // Parse /proc/net/dev
  function sampleNetworkMetrics() {
    const nowMs = Date.now();
    const dtSec = prevNetAtMs > 0 ? Math.max(0.05, (nowMs - prevNetAtMs) / 1000) : 1;
    prevNetAtMs = nowMs;

    const currentSamples = new Map<string, RawNetSample>();
    const interfaces: NetInterfaceStat[] = [];

    try {
      const raw = fs.readFileSync('/proc/net/dev', 'utf-8');
      for (const line of raw.split('\n').slice(2)) {
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        const iface = line.slice(0, idx).trim();
        if (iface === 'lo' || iface.startsWith('veth')) continue;
        const cols = line
          .slice(idx + 1)
          .trim()
          .split(/\s+/)
          .map(Number);
        if (cols.length < 10) continue;
        const rxBytes = cols[0] || 0;
        const rxPackets = cols[1] || 0;
        const txBytes = cols[8] || 0;
        const txPackets = cols[9] || 0;
        const packets = rxPackets + txPackets;

        currentSamples.set(iface, { rxBytes, txBytes, packets });
        const prev = prevNetSamples.get(iface);
        const dRx = prev && rxBytes >= prev.rxBytes ? rxBytes - prev.rxBytes : 0;
        const dTx = prev && txBytes >= prev.txBytes ? txBytes - prev.txBytes : 0;
        const dPkt = prev && packets >= prev.packets ? packets - prev.packets : 0;

        interfaces.push({
          iface,
          rxKbPerSec: Math.round((dRx / 1024 / dtSec) * 10) / 10,
          txKbPerSec: Math.round((dTx / 1024 / dtSec) * 10) / 10,
          totalRxGb: Math.round((rxBytes / 1073741824) * 100) / 100,
          totalTxGb: Math.round((txBytes / 1073741824) * 100) / 100,
          packetsPerSec: Math.round(dPkt / dtSec),
        });
      }
    } catch {
      // ignore
    }

    prevNetSamples = currentSamples;

    const totalRxKbPerSec = Math.round(interfaces.reduce((s, i) => s + i.rxKbPerSec, 0) * 10) / 10;
    const totalTxKbPerSec = Math.round(interfaces.reduce((s, i) => s + i.txKbPerSec, 0) * 10) / 10;

    return {
      totalRxKbPerSec,
      totalTxKbPerSec,
      interfaces,
    };
  }

  // Scan /proc/[pid] for all visible Linux processes with delta CPU %
  function sampleLinuxProcesses(totalMemMb: number, coreCount: number, uptimeSec: number): OsProcessEntry[] {
    const nowMs = Date.now();
    const dtSec = prevProcAtMs > 0 ? Math.max(0.05, (nowMs - prevProcAtMs) / 1000) : 1;
    prevProcAtMs = nowMs;

    const nextProcTicks = new Map<number, number>();
    const results: OsProcessEntry[] = [];

    const stateLabels: Record<string, string> = {
      R: 'Running (Aktiv auf CPU)',
      S: 'Sleeping (Wartet auf Event)',
      D: 'Disk Sleep (Block-I/O Wait)',
      Z: 'Zombie',
      T: 'Stopped',
      I: 'Idle Kernel Thread',
    };

    try {
      if (!fs.existsSync('/proc')) return results;
      const entries = fs.readdirSync('/proc');
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry);
        try {
          const statRaw = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
          const openParen = statRaw.indexOf('(');
          const closeParen = statRaw.lastIndexOf(')');
          if (openParen < 0 || closeParen < 0) continue;

          const comm = statRaw.slice(openParen + 1, closeParen);
          const after = statRaw
            .slice(closeParen + 2)
            .trim()
            .split(/\s+/);

          const state = after[0] || 'S';
          const ppid = Number(after[1] || 0);
          const utime = Number(after[11] || 0);
          const stime = Number(after[12] || 0);
          const numThreads = Number(after[17] || 1);
          const starttimeTicks = Number(after[19] || 0);
          const vsizeBytes = Number(after[20] || 0);
          const rssPages = Number(after[21] || 0);

          const totalTicks = utime + stime;
          nextProcTicks.set(pid, totalTicks);

          const prevTicks = prevProcTicks.get(pid);
          let cpuPct = 0;
          if (prevTicks !== undefined && totalTicks >= prevTicks) {
            const dTicks = totalTicks - prevTicks;
            const cpuSeconds = dTicks / CLK_TCK;
            cpuPct = Math.min(100 * coreCount, Math.round((cpuSeconds / dtSec) * 1000) / 10);
          } else {
            const procAgeSec = Math.max(1, uptimeSec - starttimeTicks / CLK_TCK);
            cpuPct = Math.min(100, Math.round(((totalTicks / CLK_TCK) / procAgeSec) * 1000) / 10);
          }

          let cmdline = '';
          try {
            cmdline = fs
              .readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
              .replace(/\0+/g, ' ')
              .trim();
          } catch {
            // ignore
          }
          if (!cmdline) cmdline = `[${comm}]`;

          const memMb = Math.round(((rssPages * 4096) / 1048576) * 10) / 10;
          const vszMb = Math.round((vsizeBytes / 1048576) * 10) / 10;
          const memPct = totalMemMb > 0 ? Math.round((memMb / totalMemMb) * 1000) / 10 : 0;
          const procUptimeSec = Math.max(0, Math.round(uptimeSec - starttimeTicks / CLK_TCK));

          const lowCmd = `${comm} ${cmdline}`.toLowerCase();
          let category: OsProcessEntry['category'] = 'system';
          let subsystemLabel = 'Linux System / OS';

          if (lowCmd.includes('homeassistant') || lowCmd.includes('hass')) {
            category = 'hass-core';
            subsystemLabel = 'Home Assistant Core';
          } else if (lowCmd.includes('supervisor') || lowCmd.includes('hassio')) {
            category = 'supervisor';
            subsystemLabel = 'HASS.io Supervisor';
          } else if (lowCmd.includes('ffmpeg') || lowCmd.includes('go2rtc') || lowCmd.includes('coco')) {
            category = 'vision-ai';
            subsystemLabel = 'Camera Vision / Video Stream';
          } else if (lowCmd.includes('server.mjs') || lowCmd.includes('thassi') || lowCmd.includes('node')) {
            category = 'thassi';
            subsystemLabel = 'Thassi Host & Apps Runtime';
          } else if (cmdline.startsWith('[')) {
            category = 'kernel';
            subsystemLabel = 'Linux Kernel Worker';
          }

          results.push({
            pid,
            ppid,
            name: comm === 'MainThread' ? 'node (thassi_host)' : comm,
            cmdline: cmdline.slice(0, 260),
            state,
            stateLabel: stateLabels[state] || state,
            cpuPct,
            memMb,
            memPct,
            vszMb,
            threads: numThreads,
            uptimeSec: procUptimeSec,
            category,
            subsystemLabel,
          });

          // Also enumerate individual OS threads (/proc/<pid>/task/<tid>) if process has multiple threads
          const taskDir = `/proc/${pid}/task`;
          if (numThreads > 1 && fs.existsSync(taskDir)) {
            for (const tidStr of fs.readdirSync(taskDir)) {
              if (!/^\d+$/.test(tidStr)) continue;
              const tid = Number(tidStr);
              if (tid === pid) continue;
              try {
                const tStat = fs.readFileSync(`${taskDir}/${tid}/stat`, 'utf-8');
                const tOpen = tStat.indexOf('(');
                const tClose = tStat.lastIndexOf(')');
                if (tOpen < 0 || tClose < 0) continue;
                const tComm = tStat.slice(tOpen + 1, tClose);
                const tAfter = tStat.slice(tClose + 2).trim().split(/\s+/);
                const tState = tAfter[0] || 'S';
                const tUtime = Number(tAfter[11] || 0);
                const tStime = Number(tAfter[12] || 0);
                const tStart = Number(tAfter[19] || 0);
                const tTotal = tUtime + tStime;
                const threadKey = pid * 100000 + tid;
                nextProcTicks.set(threadKey, tTotal);
                const prevT = prevProcTicks.get(threadKey);
                let tCpuPct = 0;
                if (prevT !== undefined && tTotal >= prevT) {
                  tCpuPct = Math.min(100, Math.round((((tTotal - prevT) / CLK_TCK) / dtSec) * 1000) / 10);
                } else {
                  const age = Math.max(1, uptimeSec - tStart / CLK_TCK);
                  tCpuPct = Math.min(100, Math.round(((tTotal / CLK_TCK) / age) * 1000) / 10);
                }
                const lowT = tComm.toLowerCase();
                let tSub = 'Node.js / V8 Worker Thread';
                let tCat: OsProcessEntry['category'] = 'thassi';
                if (lowT.includes('tf') || lowT.includes('eigen')) {
                  tSub = 'TensorFlow.js / COCO-SSD KI-Worker';
                  tCat = 'vision-ai';
                } else if (lowT.includes('uv')) {
                  tSub = 'libuv Async I/O & DNS/FS WorkerPool';
                }
                results.push({
                  pid: tid,
                  ppid: pid,
                  name: `${tComm} [TID ${tid}]`,
                  cmdline: `[Thread of PID ${pid}] ${tSub} (${cmdline.slice(0, 120)})`,
                  state: tState,
                  stateLabel: stateLabels[tState] || tState,
                  cpuPct: tCpuPct,
                  memMb,
                  memPct,
                  vszMb,
                  threads: 1,
                  uptimeSec: Math.max(0, Math.round(uptimeSec - tStart / CLK_TCK)),
                  category: tCat,
                  subsystemLabel: tSub,
                });
              } catch {
                // ignore thread exit
              }
            }
          }
        } catch {
          // Process exited mid-read
        }
      }
    } catch {
      // ignore
    }

    prevProcTicks = nextProcTicks;

    return results.sort((a, b) => {
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memMb - a.memMb;
    });
  }

  // Query HASS.io Supervisor API (`http://supervisor/...`) for host/os/core/supervisor/addon stats & jobs
  async function fetchSupervisorTelemetry(force = false) {
    if (!force && cachedSupervisorSnapshot && Date.now() - cachedSupervisorSnapshot.fetchedAtMs < 3500) {
      return cachedSupervisorSnapshot;
    }

    const supToken =
      process.env.SUPERVISOR_TOKEN ||
      process.env.HASSIO_TOKEN ||
      (() => {
        try {
          return ctx.sharedDb.kvGet<{ haToken?: string }>('ha_connection')?.haToken;
        } catch {
          return '';
        }
      })() ||
      '';

    const supFetch = async (endpoint: string, timeoutMs = 4500): Promise<Record<string, any> | null> => {
      if (!supToken) return null;
      try {
        const res = await fetch(`http://supervisor${endpoint}`, {
          headers: {
            Authorization: `Bearer ${supToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: Record<string, any>; result?: string };
        return json?.data || (json as Record<string, any>);
      } catch {
        return null;
      }
    };

    const [
      hostInfo,
      osInfo,
      coreInfo,
      coreStats,
      supervisorInfo,
      supervisorStats,
      dnsStats,
      audioStats,
      observerStats,
      addonsList,
      jobsInfo,
      resolutionInfo,
    ] = await Promise.all([
      supFetch('/host/info', 3500),
      supFetch('/os/info', 3500),
      supFetch('/core/info', 3500),
      supFetch('/core/stats', 4500),
      supFetch('/supervisor/info', 3500),
      supFetch('/supervisor/stats', 4500),
      supFetch('/dns/stats', 4500),
      supFetch('/audio/stats', 4500),
      supFetch('/observer/stats', 4500),
      supFetch('/addons', 3500),
      supFetch('/jobs/info', 3500),
      supFetch('/resolution/info', 3500),
    ]);

    const containers: HassContainerWorkload[] = [];

    const toMb = (bytes?: number) =>
      typeof bytes === 'number' && Number.isFinite(bytes) ? Math.round((bytes / 1048576) * 10) / 10 : 0;
    const toPct = (v?: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;

    if (coreInfo || coreStats) {
      containers.push({
        id: 'hassio_core',
        slug: 'core',
        name: 'Home Assistant Core',
        kind: 'core',
        version: String(coreInfo?.version || 'latest'),
        state: 'started',
        cpuPct: toPct(coreStats?.cpu_percent),
        memoryMb: toMb(coreStats?.memory_usage),
        memoryLimitMb: toMb(coreStats?.memory_limit),
        memoryPct: toPct(coreStats?.memory_percent),
        networkRxMb: toMb(coreStats?.network_rx),
        networkTxMb: toMb(coreStats?.network_tx),
        blkReadMb: toMb(coreStats?.blk_read),
        blkWriteMb: toMb(coreStats?.blk_write),
        description: 'Zentrale Home Assistant Python-Engine, Event-Bus, Recorder, Automationen & Geräte-Integrationen',
        updateAvailable: Boolean(coreInfo?.update_available),
      });
    }

    if (supervisorInfo || supervisorStats) {
      containers.push({
        id: 'hassio_supervisor',
        slug: 'supervisor',
        name: 'HASS OS Supervisor',
        kind: 'system',
        version: String(supervisorInfo?.version || 'latest'),
        state: 'started',
        cpuPct: toPct(supervisorStats?.cpu_percent),
        memoryMb: toMb(supervisorStats?.memory_usage),
        memoryLimitMb: toMb(supervisorStats?.memory_limit),
        memoryPct: toPct(supervisorStats?.memory_percent),
        networkRxMb: toMb(supervisorStats?.network_rx),
        networkTxMb: toMb(supervisorStats?.network_tx),
        blkReadMb: toMb(supervisorStats?.blk_read),
        blkWriteMb: toMb(supervisorStats?.blk_write),
        description: 'Home Assistant OS Container-Orchestrator, Add-on-Manager, Snapshot- & Systemsteuerung',
        updateAvailable: Boolean(supervisorInfo?.update_available),
      });
    }

    if (dnsStats) {
      containers.push({
        id: 'hassio_dns',
        slug: 'dns',
        name: 'HASS CoreDNS',
        kind: 'system',
        version: 'system',
        state: 'started',
        cpuPct: toPct(dnsStats.cpu_percent),
        memoryMb: toMb(dnsStats.memory_usage),
        memoryLimitMb: toMb(dnsStats.memory_limit),
        memoryPct: toPct(dnsStats.memory_percent),
        networkRxMb: toMb(dnsStats.network_rx),
        networkTxMb: toMb(dnsStats.network_tx),
        blkReadMb: toMb(dnsStats.blk_read),
        blkWriteMb: toMb(dnsStats.blk_write),
        description: 'Interner Container-DNS-Resolver & mDNS/LLMNR-Weiterleitung',
        updateAvailable: false,
      });
    }

    if (audioStats) {
      containers.push({
        id: 'hassio_audio',
        slug: 'audio',
        name: 'HASS PulseAudio',
        kind: 'system',
        version: 'system',
        state: 'started',
        cpuPct: toPct(audioStats.cpu_percent),
        memoryMb: toMb(audioStats.memory_usage),
        memoryLimitMb: toMb(audioStats.memory_limit),
        memoryPct: toPct(audioStats.memory_percent),
        networkRxMb: toMb(audioStats.network_rx),
        networkTxMb: toMb(audioStats.network_tx),
        blkReadMb: toMb(audioStats.blk_read),
        blkWriteMb: toMb(audioStats.blk_write),
        description: 'Audio-Subsystem für Sprachassistenten & Medienausgabe',
        updateAvailable: false,
      });
    }

    if (observerStats) {
      containers.push({
        id: 'hassio_observer',
        slug: 'observer',
        name: 'HASS Health Observer',
        kind: 'system',
        version: 'system',
        state: 'started',
        cpuPct: toPct(observerStats.cpu_percent),
        memoryMb: toMb(observerStats.memory_usage),
        memoryLimitMb: toMb(observerStats.memory_limit),
        memoryPct: toPct(observerStats.memory_percent),
        networkRxMb: toMb(observerStats.network_rx),
        networkTxMb: toMb(observerStats.network_tx),
        blkReadMb: toMb(observerStats.blk_read),
        blkWriteMb: toMb(observerStats.blk_write),
        description: 'Watchdog & Diagnose-Monitor für den Supervisor (:4357)',
        updateAvailable: false,
      });
    }

    const rawAddons: Array<Record<string, any>> = Array.isArray(addonsList?.addons)
      ? addonsList!.addons
      : Array.isArray(supervisorInfo?.addons)
        ? supervisorInfo!.addons
        : [];

    const startedAddons = rawAddons.filter((a) => !a.state || a.state === 'started');
    const stoppedAddons = rawAddons.filter((a) => a.state && a.state !== 'started');

    const addonStatsResults = coreStats
      ? await Promise.all(
          startedAddons.map(async (addon) => {
            const slug = String(addon.slug || '');
            const st = await supFetch(`/addons/${encodeURIComponent(slug)}/stats`, 2500);
            return { addon, st };
          })
        )
      : startedAddons.map((addon) => ({ addon, st: null }));

    for (const { addon, st } of addonStatsResults) {
      containers.push({
        id: `addon_${addon.slug}`,
        slug: String(addon.slug || ''),
        name: String(addon.name || addon.slug || 'Add-on'),
        kind: 'addon',
        version: String(addon.version || '1.0'),
        state: String(addon.state || 'started'),
        cpuPct: toPct(st?.cpu_percent),
        memoryMb: toMb(st?.memory_usage),
        memoryLimitMb: toMb(st?.memory_limit),
        memoryPct: toPct(st?.memory_percent),
        networkRxMb: toMb(st?.network_rx),
        networkTxMb: toMb(st?.network_tx),
        blkReadMb: toMb(st?.blk_read),
        blkWriteMb: toMb(st?.blk_write),
        description: String(addon.description || ''),
        updateAvailable: Boolean(addon.update_available),
        icon: String(addon.icon || ''),
      });
    }

    for (const addon of stoppedAddons) {
      containers.push({
        id: `addon_${addon.slug}`,
        slug: String(addon.slug || ''),
        name: String(addon.name || addon.slug || 'Add-on'),
        kind: 'addon',
        version: String(addon.version || '1.0'),
        state: String(addon.state || 'stopped'),
        cpuPct: 0,
        memoryMb: 0,
        memoryLimitMb: 0,
        memoryPct: 0,
        networkRxMb: 0,
        networkTxMb: 0,
        blkReadMb: 0,
        blkWriteMb: 0,
        description: String(addon.description || ''),
        updateAvailable: Boolean(addon.update_available),
        icon: String(addon.icon || ''),
      });
    }

    containers.sort((a, b) => {
      if (a.state === 'started' && b.state !== 'started') return -1;
      if (a.state !== 'started' && b.state === 'started') return 1;
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memoryMb - a.memoryMb;
    });

    const flattenJobs = (list: Array<Record<string, any>> = []): Array<Record<string, any>> => {
      const out: Array<Record<string, any>> = [];
      for (const j of list) {
        out.push({
          uuid: j.uuid,
          name: j.name || 'supervisor_job',
          reference: j.reference || '',
          stage: j.stage || '',
          progress: j.progress ?? 0,
          done: Boolean(j.done),
          created: j.created || null,
          errors: Array.isArray(j.errors) ? j.errors : [],
        });
        if (Array.isArray(j.child_jobs) && j.child_jobs.length > 0) {
          out.push(...flattenJobs(j.child_jobs));
        }
      }
      return out;
    };

    const jobs = flattenJobs(Array.isArray(jobsInfo?.jobs) ? jobsInfo!.jobs : []);

    cachedSupervisorSnapshot = {
      fetchedAtMs: Date.now(),
      available: Boolean(hostInfo || coreInfo || supervisorInfo || containers.length > 0),
      hostInfo: hostInfo || null,
      osInfo: osInfo || null,
      coreInfo: coreInfo || null,
      supervisorInfo: supervisorInfo || null,
      resolutionInfo: resolutionInfo || null,
      jobs,
      containers,
    };

    return cachedSupervisorSnapshot;
  }

  // Query Home Assistant Core states for running automations, scripts, updates, and streams
  async function fetchHaCoreActivity(force = false) {
    if (!force && cachedHaActivity && Date.now() - cachedHaActivity.fetchedAtMs < 3500) {
      return cachedHaActivity;
    }

    try {
      const states = await ctx.ha.getStates();
      const runningScripts: Array<{ entityId: string; name: string; lastTriggered: string | null }> = [];
      const recentAutomations: Array<{ entityId: string; name: string; lastTriggered: string; state: string; current: number }> = [];
      const activeUpdates: Array<{ entityId: string; name: string; installedVersion: string; latestVersion: string; inProgress: boolean; pct: number | null }> = [];
      const activeStreams: Array<{ entityId: string; name: string; state: string }> = [];

      for (const s of states) {
        const id = s.entity_id;
        const attrs = (s.attributes || {}) as Record<string, any>;
        const name = String(attrs.friendly_name || id);

        if (id.startsWith('script.') && s.state === 'on') {
          runningScripts.push({
            entityId: id,
            name,
            lastTriggered: attrs.last_triggered || null,
          });
        } else if (id.startsWith('automation.')) {
          const currentRuns = Number(attrs.current || 0);
          const lastTrig = attrs.last_triggered ? String(attrs.last_triggered) : '';
          if (currentRuns > 0 || lastTrig) {
            recentAutomations.push({
              entityId: id,
              name,
              lastTriggered: lastTrig,
              state: s.state,
              current: currentRuns,
            });
          }
        } else if (id.startsWith('update.') && (s.state === 'on' || attrs.in_progress)) {
          activeUpdates.push({
            entityId: id,
            name,
            installedVersion: String(attrs.installed_version || ''),
            latestVersion: String(attrs.latest_version || ''),
            inProgress: Boolean(attrs.in_progress),
            pct: typeof attrs.update_percentage === 'number' ? attrs.update_percentage : null,
          });
        } else if (id.startsWith('camera.') && (s.state === 'streaming' || s.state === 'recording')) {
          activeStreams.push({
            entityId: id,
            name,
            state: s.state,
          });
        }
      }

      recentAutomations.sort((a, b) => {
        if (b.current !== a.current) return b.current - a.current;
        return b.lastTriggered.localeCompare(a.lastTriggered);
      });

      cachedHaActivity = {
        fetchedAtMs: Date.now(),
        totalEntities: states.length,
        runningScripts,
        recentAutomations: recentAutomations.slice(0, 12),
        activeUpdates,
        activeStreams,
      };
      return cachedHaActivity;
    } catch {
      return (
        cachedHaActivity || {
          fetchedAtMs: Date.now(),
          totalEntities: 0,
          runningScripts: [],
          recentAutomations: [],
          activeUpdates: [],
          activeStreams: [],
        }
      );
    }
  }

  async function buildCompletePerformanceSnapshot(forceRefresh = false) {
    const t0 = performance.now();
    const cpu = sampleKernelCpuAndStat();
    const memory = sampleMemoryMetrics();
    const disk = sampleDiskAndIoMetrics();
    const network = sampleNetworkMetrics();
    const processes = sampleLinuxProcesses(memory.totalMb, cpu.coreCount, cpu.uptimeSeconds);

    const [supervisor, haActivity] = await Promise.all([
      fetchSupervisorTelemetry(forceRefresh),
      fetchHaCoreActivity(forceRefresh),
    ]);

    const v8Mem = process.memoryUsage();
    const loopHist = gState.__thassiSysMonLoopHistogram;
    const eventLoopLagMs = loopHist
      ? Math.max(0, Math.round(((loopHist.mean || 0) / 1e6 - 20) * 10) / 10)
      : 0.4;

    const visionPerf = (() => {
      try {
        return ctx.sharedDb.kvGet<Record<string, any>>('camera_vision_performance') || null;
      } catch {
        return null;
      }
    })();
    const visionSummary = (() => {
      try {
        return ctx.sharedDb.kvGet<Record<string, any>>('camera_vision_today') || null;
      } catch {
        return null;
      }
    })();

    // Synthesize "What HASS OS Is Currently Working On" (`activeWorkloads`)
    const activeWorkloads: ActiveHassWorkloadItem[] = [];

    // 1. Active Supervisor Jobs (not done)
    for (const job of supervisor.jobs) {
      if (!job.done) {
        activeWorkloads.push({
          id: `sup_job_${job.uuid}`,
          source: 'supervisor_job',
          sourceBadge: 'SUPERVISOR',
          title: `Supervisor Job: ${job.name}`,
          detail: `Stage: ${job.stage || 'running'} · Ref: ${job.reference || 'system'}`,
          status: 'running',
          progressPct: typeof job.progress === 'number' ? job.progress : null,
          startedAt: job.created,
          metricLabel: `${job.progress ?? 0}%`,
        });
      }
    }

    // 2. Active HA Updates in progress
    for (const upd of haActivity.activeUpdates) {
      if (upd.inProgress) {
        activeWorkloads.push({
          id: `ha_upd_${upd.entityId}`,
          source: 'ha_core',
          sourceBadge: 'UPDATE',
          title: `Update wird installiert: ${upd.name}`,
          detail: `${upd.installedVersion} → ${upd.latestVersion}`,
          status: 'running',
          progressPct: upd.pct,
          metricLabel: upd.pct !== null ? `${upd.pct}%` : 'INSTALLIERT',
        });
      }
    }

    // 3. Running HA Scripts & Currently Executing Automations
    for (const sc of haActivity.runningScripts) {
      activeWorkloads.push({
        id: `ha_scr_${sc.entityId}`,
        source: 'ha_core',
        sourceBadge: 'HA SCRIPT',
        title: `Skript aktiv: ${sc.name}`,
        detail: sc.entityId,
        status: 'running',
        startedAt: sc.lastTriggered,
        metricLabel: 'AKTIV',
      });
    }
    for (const aut of haActivity.recentAutomations) {
      if (aut.current > 0) {
        activeWorkloads.push({
          id: `ha_aut_${aut.entityId}`,
          source: 'ha_core',
          sourceBadge: 'AUTOMATION',
          title: `Automation läuft (${aut.current}×): ${aut.name}`,
          detail: aut.entityId,
          status: 'running',
          startedAt: aut.lastTriggered,
          metricLabel: `${aut.current} RUN`,
        });
      }
    }

    // 4. Active Camera Vision Pipeline / Streams
    if (visionPerf && (visionPerf.activeStreamWorkersCount > 0 || visionPerf.avgInferenceMs > 0)) {
      const workers = Number(visionPerf.activeStreamWorkersCount || 0);
      const skipPct = Number(visionPerf.motionGateSkipRatePct ?? 100);
      activeWorkloads.push({
        id: 'thassi_vision_pipeline',
        source: 'vision_pipeline',
        sourceBadge: 'VISION AI',
        title:
          workers > 0
            ? `Camera Vision: ${workers} aktive MJPEG-Stream-Worker + Motion-Gated COCO-SSD`
            : `Camera Vision: Zyklische 2-Stufen-Bewegungsabtastung (${skipPct}% KI-Skip-Rate)`,
        detail: `Ø Inferenz: ${visionPerf.avgInferenceMs || 0} ms · Pixel-Diff: ${visionPerf.avgMotionDiffMs || 0} ms · ${visionSummary?.onlineCameras ?? 0}/${visionSummary?.totalCameras ?? 6} Kameras online`,
        status: workers > 0 ? 'running' : 'nominal',
        metricLabel: `${visionPerf.avgInferenceMs || 0} ms`,
      });
    }

    // If Supervisor container /stats requires hassio_role: manager (returns null under default role),
    // enrich Thassi Horizon, Home Assistant Core, Supervisor & active Add-ons with live /proc & host telemetry!
    const thassiMainProc = processes.find((p) => p.pid === 1) || processes[0];
    const thassiNormalizedCpuPct = thassiMainProc
      ? Math.min(100, Math.round((thassiMainProc.cpuPct / Math.max(1, cpu.coreCount)) * 10) / 10)
      : 0;
    const thassiRssMb = Math.round((v8Mem.rss / 1048576) * 10) / 10;
    const remainingHostCpuPct = Math.max(0, Math.round((cpu.total.usagePct - thassiNormalizedCpuPct) * 10) / 10);
    const remainingHostMemMb = Math.max(0, Math.round((memory.usedMb - thassiRssMb) * 10) / 10);

    for (const c of supervisor.containers) {
      if (c.state !== 'started') continue;
      if (c.slug === '44ec3c40_thassi_host' && c.memoryMb === 0) {
        c.cpuPct = thassiNormalizedCpuPct;
        c.memoryMb = thassiRssMb;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round((thassiRssMb / memory.totalMb) * 1000) / 10 : 0;
        c.networkRxMb = Math.round((network.interfaces[0]?.totalRxGb || 0) * 1024 * 10) / 10;
        c.networkTxMb = Math.round((network.interfaces[0]?.totalTxGb || 0) * 1024 * 10) / 10;
        c.blkReadMb = Math.round((disk.devices[0]?.totalReadGb || 0) * 1024 * 10) / 10;
        c.blkWriteMb = Math.round((disk.devices[0]?.totalWriteGb || 0) * 1024 * 10) / 10;
      } else if (c.slug === 'core' && c.memoryMb === 0) {
        c.cpuPct = Math.round(remainingHostCpuPct * 0.52 * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * 0.42 * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round((c.memoryMb / memory.totalMb) * 1000) / 10 : 0;
      } else if (c.slug === 'supervisor' && c.memoryMb === 0) {
        c.cpuPct = Math.round(remainingHostCpuPct * 0.08 * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * 0.09 * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round((c.memoryMb / memory.totalMb) * 1000) / 10 : 0;
      } else if (c.memoryMb === 0) {
        // Estimate footprint by add-on class when Docker cgroup stats API is restricted
        const slugLow = c.slug.toLowerCase();
        const weight = slugLow.includes('vscode') || slugLow.includes('music_assistant')
          ? 0.08
          : slugLow.includes('whisper') || slugLow.includes('piper') || slugLow.includes('matter')
            ? 0.05
            : slugLow.includes('go2rtc') || slugLow.includes('mosquitto') || slugLow.includes('tailscale')
              ? 0.03
              : 0.012;
        c.cpuPct = Math.round(remainingHostCpuPct * weight * 10) / 10;
        c.memoryMb = Math.round(remainingHostMemMb * weight * 10) / 10;
        c.memoryLimitMb = memory.totalMb;
        c.memoryPct = memory.totalMb > 0 ? Math.round((c.memoryMb / memory.totalMb) * 1000) / 10 : 0;
      }
    }

    supervisor.containers.sort((a, b) => {
      if (a.state === 'started' && b.state !== 'started') return -1;
      if (a.state !== 'started' && b.state === 'started') return 1;
      if (b.cpuPct !== a.cpuPct) return b.cpuPct - a.cpuPct;
      return b.memoryMb - a.memoryMb;
    });

    // 5. Top Active HASS OS Containers (Core, Supervisor, Add-ons) sorted by CPU
    for (const c of supervisor.containers.filter((x) => x.state === 'started').slice(0, 8)) {
      const isBusy = c.cpuPct >= 2.0;
      activeWorkloads.push({
        id: `cnt_${c.id}`,
        source: 'container',
        sourceBadge: c.kind === 'core' ? 'HA CORE' : c.kind === 'system' ? 'HASS SYS' : 'ADD-ON',
        title: `${c.name} (${c.slug})`,
        detail: `${c.description || `Container v${c.version}`} · RAM: ${c.memoryMb.toFixed(1)} MB (${c.memoryPct.toFixed(1)}%)`,
        status: c.cpuPct >= 25 ? 'attention' : isBusy ? 'running' : 'nominal',
        cpuPct: c.cpuPct,
        memoryMb: c.memoryMb,
        metricLabel: `${c.cpuPct.toFixed(1)}% CPU · ${Math.round(c.memoryMb)} MB`,
      });
    }

    // 6. Active Linux /proc Processes (Running 'R' or Disk Wait 'D' or top CPU)
    for (const p of processes.slice(0, 8)) {
      if (p.cpuPct >= 0.3 || p.state === 'R' || p.state === 'D') {
        activeWorkloads.push({
          id: `proc_${p.pid}`,
          source: 'os_process',
          sourceBadge: p.ppid === 1 && p.pid !== 1 ? `TID ${p.pid}` : `PID ${p.pid}`,
          title: `${p.name} — ${p.subsystemLabel}`,
          detail: `${p.stateLabel} · ${p.threads} Threads · ${p.cmdline}`,
          status: p.state === 'D' ? 'attention' : p.cpuPct >= 5 ? 'running' : 'nominal',
          cpuPct: p.cpuPct,
          memoryMb: p.memMb,
          metricLabel: `${p.cpuPct.toFixed(1)}% CPU · ${p.memMb.toFixed(1)} MB`,
        });
      }
    }

    // 7. Thassi Scheduled Cron Jobs & Installed Services
    let thassiJobs: Array<Record<string, any>> = [];
    try {
      const sysRes = await fetch('http://127.0.0.1:8099/api/system/status', {
        signal: AbortSignal.timeout(1200),
      });
      if (sysRes.ok) {
        const sysJson = (await sysRes.json()) as { jobs?: Array<Record<string, any>> };
        thassiJobs = Array.isArray(sysJson.jobs) ? sysJson.jobs : [];
        for (const tj of thassiJobs) {
          if (tj.lastStatus === 'running') {
            activeWorkloads.push({
              id: `thassi_job_${tj.appId}_${tj.id}`,
              source: 'thassi_job',
              sourceBadge: `JOB:${String(tj.appId || '').toUpperCase().slice(0, 6)}`,
              title: `${tj.name} (${tj.appId})`,
              detail: `Intervall: alle ${tj.intervalMinutes} Min. · Status: ${tj.lastStatus}`,
              status: 'running',
              startedAt: tj.lastRunAt,
              metricLabel: 'RUNNING',
            });
          }
        }
      }
    } catch {
      // ignore
    }

    const nowIso = new Date().toISOString();
    const point: HistoryPoint = {
      ts: nowIso,
      epochMs: Date.now(),
      cpuPct: cpu.total.usagePct,
      iowaitPct: cpu.total.iowaitPct,
      memPct: memory.usedPct,
      load1m: cpu.load1m,
      diskKbPerSec: Math.round((disk.totalReadKbPerSec + disk.totalWriteKbPerSec) * 10) / 10,
      netKbPerSec: Math.round((network.totalRxKbPerSec + network.totalTxKbPerSec) * 10) / 10,
      eventLoopLagMs,
    };
    historyBuffer.push(point);
    if (historyBuffer.length > MAX_HISTORY) {
      historyBuffer.shift();
    }

    const snapshot = {
      timestamp: nowIso,
      collectMs: Math.round((performance.now() - t0) * 10) / 10,
      host: {
        hostname: supervisor.hostInfo?.hostname || os.hostname(),
        chassis: supervisor.hostInfo?.chassis || 'embedded',
        board: supervisor.osInfo?.board || supervisor.hostInfo?.board || os.arch(),
        osName: supervisor.hostInfo?.operating_system || `Home Assistant OS (${os.platform()} ${os.release()})`,
        osVersion: supervisor.osInfo?.version || supervisor.hostInfo?.os_version || os.release(),
        kernel: supervisor.hostInfo?.kernel || os.release(),
        arch: os.arch(),
        haCoreVersion: supervisor.coreInfo?.version || '2026.x',
        supervisorVersion: supervisor.supervisorInfo?.version || 'latest',
        healthy: supervisor.resolutionInfo?.healthy !== false,
        supported: supervisor.resolutionInfo?.supported !== false,
        unhealthyReasons: supervisor.resolutionInfo?.unhealthy || [],
        unsupportedReasons: supervisor.resolutionInfo?.unsupported || [],
        issues: supervisor.resolutionInfo?.issues || [],
      },
      cpu,
      memory,
      disk,
      network,
      thassiRuntime: {
        pid: process.pid,
        nodeVersion: process.version,
        rssMb: Math.round((v8Mem.rss / 1048576) * 10) / 10,
        heapUsedMb: Math.round((v8Mem.heapUsed / 1048576) * 10) / 10,
        heapTotalMb: Math.round((v8Mem.heapTotal / 1048576) * 10) / 10,
        externalMb: Math.round((v8Mem.external / 1048576) * 10) / 10,
        arrayBuffersMb: Math.round(((v8Mem.arrayBuffers || 0) / 1048576) * 10) / 10,
        eventLoopLagMs,
        uptimeSec: Math.round(process.uptime()),
      },
      activeWorkloads,
      containers: supervisor.containers,
      supervisorJobs: supervisor.jobs,
      thassiJobs,
      haActivity,
      processes,
      history: historyBuffer,
    };

    // Share compact summary into sharedDb for Horizon & Cortex
    try {
      ctx.sharedDb.kvSet('hass_os_performance', {
        updatedAt: nowIso,
        cpuPct: cpu.total.usagePct,
        iowaitPct: cpu.total.iowaitPct,
        cpuTempC: cpu.cpuTempC,
        load1m: cpu.load1m,
        load5m: cpu.load5m,
        memUsedMb: memory.usedMb,
        memTotalMb: memory.totalMb,
        memPct: memory.usedPct,
        swapUsedMb: memory.swapUsedMb,
        diskUsedGb: disk.usedGb,
        diskTotalGb: disk.totalGb,
        diskPct: disk.usedPct,
        runningContainers: supervisor.containers.filter((c) => c.state === 'started').length,
        totalContainers: supervisor.containers.length,
        topWorkload: activeWorkloads[0]?.title || 'System Nominal',
        activeWorkloads: activeWorkloads.slice(0, 8),
        containers: supervisor.containers.slice(0, 12),
      });
    } catch {
      // ignore if sharedDb is recovering
    }

    return snapshot;
  }

  let latestSnapshotCache: Record<string, any> | null = null;
  let snapshotInFlight: Promise<Record<string, any>> | null = null;

  // Warm up initial tick delta and background sampler every 15 seconds
  void buildCompletePerformanceSnapshot(false).then((s) => {
    latestSnapshotCache = s;
  });
  gState.__thassiSysMonTimer = setInterval(() => {
    if (snapshotInFlight) return;
    snapshotInFlight = buildCompletePerformanceSnapshot(false)
      .then((s) => {
        latestSnapshotCache = s;
        return s;
      })
      .finally(() => {
        snapshotInFlight = null;
      });
  }, 15000);

  // Sync Home Assistant sidebar & live-patch Thassi Host HTML serving in-memory
  function readAllDeployedAppManifests(): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];
    const seen = new Set<string>();
    const dirs = [
      path.join(os.tmpdir(), 'thassi_deployed_apps'),
      '/data/deployed_apps',
      '/app/dist/apps',
    ];
    for (const baseDir of dirs) {
      try {
        if (!fs.existsSync(baseDir)) continue;
        for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const mPath = path.join(baseDir, entry.name, 'thassi.app.json');
          if (fs.existsSync(mPath)) {
            const m = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
            if (m && m.id && !seen.has(m.id)) {
              seen.add(m.id);
              result.push(m);
            }
          }
        }
      } catch {
        // ignore
      }
    }
    if (result.length === 0) {
      const fallbackApps = [
        { id: 'smart-canvas', name: 'Smart Home', icon: 'mdi:floor-plan', category: 'general' },
        { id: 'camera-vision', name: 'Camera Vision', icon: 'mdi:cctv', category: 'general' },
        { id: '3d-print', name: '3D Print Studio', icon: 'mdi:printer-3d-nozzle', category: 'general' },
        { id: 'network-hub', name: 'Netzwerk & Fritz!Box', icon: 'mdi:router-wireless', category: 'general' },
        { id: 'system-monitor', name: 'HASS OS Monitor', icon: 'mdi:chip', category: 'general' },
        { id: 'cortex', name: 'Cortex AI', icon: 'mdi:brain', category: 'general' },
        { id: 'workflows', name: 'Workflows', icon: 'mdi:sitemap-outline', category: 'general' },
        { id: 'project-workflow', name: 'Projekt-Workflow', icon: 'mdi:source-branch-check', category: 'general' },
        { id: 'pc-control', name: 'PC Bridge', icon: 'mdi:desktop-tower-monitor', category: 'general' },
        { id: 'finance-analytics', name: 'Finanzen', icon: 'mdi:chart-areaspline', category: 'finance' },
        { id: 'george-sync', name: 'Erste Bank Sync', icon: 'mdi:bank-transfer', category: 'finance' },
        { id: 'meal-planner', name: 'Ernährung', icon: 'mdi:silverware-fork-knife', category: 'meals' },
        { id: 'google-health', name: 'Vitaldaten', icon: 'mdi:heart-pulse', category: 'health' },
        { id: 'google-calendar', name: 'Kalender', icon: 'mdi:calendar-multiselect', category: 'calendar' },
        { id: 'memo', name: 'Notizen & Keep', icon: 'mdi:text-box-check-outline', category: 'notes' },
        { id: 'ki-news', name: 'KI & Welt-News', icon: 'mdi:newspaper-variant-outline', category: 'general' },
        { id: 'kinothek', name: 'Kinothek', icon: 'mdi:AlphaKBoxOutline', category: 'general' },
      ];
      return fallbackApps;
    }
    return result;
  }

  function installLiveHostAndSidebarSync() {
    try {
      syncHassFrontendFiles();
    } catch {
      // ignore
    }

    const gHostPatch = globalThis as unknown as {
      __thassiOrigServerEmit?: typeof http.Server.prototype.emit;
      __thassiLatestRenderDashboard?: (ingressPath: string) => string;
      __thassiLatestSidebarStyler?: () => string;
    };

    gHostPatch.__thassiLatestRenderDashboard = renderUnifiedDashboardHtml;
    gHostPatch.__thassiLatestSidebarStyler = getHassSidebarStylerScript;

    if (!gHostPatch.__thassiOrigServerEmit) {
      gHostPatch.__thassiOrigServerEmit = http.Server.prototype.emit;
    }

    http.Server.prototype.emit = function (this: http.Server, event: string, ...args: any[]): boolean {
      if (event === 'request' && args[0] && args[1]) {
        const req = args[0] as http.IncomingMessage;
        const res = args[1] as http.ServerResponse;
        try {
          const safeReqUrl = (req.url || '/').replace(/^\/+/, '/');
          const parsedUrl = new URL(safeReqUrl, 'http://localhost');
          const pathname = parsedUrl.pathname.replace(/\/+/g, '/');
          const ingressPath = ((req.headers['x-ingress-path'] as string) || '').replace(/\/+$/, '');
          const standaloneHeader = ((req.headers['x-thassi-standalone-app'] as string) || '').trim();
          const standaloneEnv = process.env.THASSI_STANDALONE_APP || '';
          const effectiveStandalone = standaloneHeader || standaloneEnv;

          if (!effectiveStandalone && req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
            const renderFn = gHostPatch.__thassiLatestRenderDashboard;
            if (renderFn) {
              const appsJson = JSON.stringify(readAllDeployedAppManifests());
              let html = renderFn(ingressPath);
              html = html.replace(
                '<head>',
                `<head><script>window.__THASSI_DEPLOYED_APPS__ = ${appsJson};</script>`
              );
              res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'X-Thassi-Live-Host': 'dynamic-nav-v2',
              });
              res.end(html);
              return true;
            }
          }

          const origEnd = res.end.bind(res);
          (res as any).end = function (chunk?: any, encodingOrCb?: any, cb?: any) {
            try {
              const stylerFn = gHostPatch.__thassiLatestSidebarStyler;
              if (stylerFn && chunk && (typeof chunk === 'string' || Buffer.isBuffer(chunk))) {
                const str = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
                if (str.includes('initThassiHassSidebarStyler')) {
                  const appsJson = JSON.stringify(readAllDeployedAppManifests());
                  const rx = /\(function initThassiHassSidebarStyler\(\)[\s\S]*?setInterval\(applyThassiChromeToParent,\s*1200\);\s*\}\)\(\);/;
                  if (rx.test(str)) {
                    let patched = str.replace(
                      rx,
                      () => `window.__THASSI_DEPLOYED_APPS__ = ${appsJson};\n${stylerFn().trim()}`
                    );
                    if (!patched.includes('thassi-uniform-design-system')) {
                      patched = patched.replace('<head>', () => `<head>\n${getUniformAppStylesheetTag()}`);
                    }
                    return origEnd(patched, encodingOrCb, cb);
                  }
                }
              }
            } catch {
              // fallback
            }
            return origEnd(chunk, encodingOrCb, cb);
          };
        } catch {
          // fallback
        }
      }
      return gHostPatch.__thassiOrigServerEmit!.apply(this, [event, ...args] as any);
    };
  }
  installLiveHostAndSidebarSync();

  ctx.route('POST', '/sync-host-bundle', async (req) => {
    const body = (req.body || {}) as { serverMjsBase64?: string };
    installLiveHostAndSidebarSync();
    if (!body.serverMjsBase64) {
      return { ok: true, syncedSidebarOnly: true, updatedAt: new Date().toISOString() };
    }
    const targetPath = '/app/dist/server.mjs';
    if (fs.existsSync('/app/dist')) {
      fs.writeFileSync(targetPath, Buffer.from(body.serverMjsBase64, 'base64'));
      return { ok: true, path: targetPath, updatedAt: new Date().toISOString() };
    }
    return { ok: false, reason: '/app/dist not present' };
  });

  // API: GET /snapshot (Instant non-blocking response from live background sampler)
  ctx.route('GET', '/snapshot', async (req) => {
    const force = req.query.force === '1';
    if (!force && latestSnapshotCache) {
      return latestSnapshotCache;
    }
    if (!snapshotInFlight) {
      snapshotInFlight = buildCompletePerformanceSnapshot(force)
        .then((s) => {
          latestSnapshotCache = s;
          return s;
        })
        .finally(() => {
          snapshotInFlight = null;
        });
    }
    if (latestSnapshotCache) {
      return latestSnapshotCache;
    }
    return await snapshotInFlight;
  });

  // API: POST /workload-control (Pause/Resume heavy Thassi background workloads or trigger GC)
  ctx.route('POST', '/workload-control', async (req) => {
    const body = (req.body || {}) as { action?: string };
    if (body.action === 'pause_vision_cyclic') {
      await fetch('http://127.0.0.1:8099/api/apps/camera-vision/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cyclicEnabled: false, highFreqMotionLoopEnabled: false }),
      }).catch(() => {});
      return { ok: true, message: 'Camera Vision Hintergrund-Sampling pausiert.' };
    }
    if (body.action === 'resume_vision_cyclic') {
      await fetch('http://127.0.0.1:8099/api/apps/camera-vision/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cyclicEnabled: true, highFreqMotionLoopEnabled: false }),
      }).catch(() => {});
      return { ok: true, message: 'Camera Vision Zyklisches Sampling aktiviert.' };
    }
    return { ok: false, error: 'Unbekannte Aktion' };
  });

  // API: GET /ha-diagnostics (Inspect /homeassistant filesystem, logs, and storage state)
  ctx.route('GET', '/ha-diagnostics', async () => {
    const diag: Record<string, any> = {
      timestamp: new Date().toISOString(),
      mounts: {},
      haDirEntries: [],
      haLogTail: '',
      haFaultLogTail: '',
      storageEntries: [],
      supervisorReachable: false,
      supervisorError: null,
    };

    for (const p of ['/homeassistant', '/config', '/data', '/share', '/ssl', '/media']) {
      try {
        if (fs.existsSync(p)) {
          const st = typeof fs.statfsSync === 'function' ? fs.statfsSync(p) : null;
          diag.mounts[p] = {
            exists: true,
            freeMb: st ? Math.round((st.bavail * st.bsize) / 1048576) : null,
            totalMb: st ? Math.round((st.blocks * st.bsize) / 1048576) : null,
          };
        } else {
          diag.mounts[p] = { exists: false };
        }
      } catch (e) {
        diag.mounts[p] = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    const haRoot = fs.existsSync('/homeassistant') ? '/homeassistant' : fs.existsSync('/config') ? '/config' : null;
    if (haRoot) {
      try {
        diag.haDirEntries = fs.readdirSync(haRoot).slice(0, 60);
      } catch (e) {
        diag.haDirError = e instanceof Error ? e.message : String(e);
      }

      for (const [key, fname] of [
        ['haLogTail', 'home-assistant.log'],
        ['haLog1Tail', 'home-assistant.log.1'],
        ['haFaultLogTail', 'home-assistant.log.fault'],
      ] as const) {
        const fpath = path.join(haRoot, fname);
        try {
          if (fs.existsSync(fpath)) {
            const stat = fs.statSync(fpath);
            const readSize = Math.min(stat.size, 24576);
            const fd = fs.openSync(fpath, 'r');
            const buf = Buffer.alloc(readSize);
            fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs.closeSync(fd);
            diag[key] = buf.toString('utf-8').split('\n').slice(-80).join('\n');
          }
        } catch (e) {
          diag[key] = `Error reading ${fname}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      try {
        const storageDir = path.join(haRoot, '.storage');
        if (fs.existsSync(storageDir)) {
          diag.storageEntries = fs.readdirSync(storageDir).slice(0, 50);
        }
      } catch {}
    }

    try {
      const supToken = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || '';
      const res = await fetch('http://supervisor/supervisor/ping', {
        headers: supToken ? { Authorization: `Bearer ${supToken}` } : {},
        signal: AbortSignal.timeout(2000),
      });
      diag.supervisorReachable = res.ok;
    } catch (e) {
      diag.supervisorError = e instanceof Error ? e.message : String(e);
    }

    return diag;
  });

  // API: GET /container-logs (Fetch live logs from Supervisor for any HASS container/add-on)
  ctx.route('GET', '/container-logs', async (req) => {
    const slug = String(req.query.slug || 'core').trim();
    const supToken =
      process.env.SUPERVISOR_TOKEN ||
      process.env.HASSIO_TOKEN ||
      (() => {
        try {
          return ctx.sharedDb.kvGet<{ haToken?: string }>('ha_connection')?.haToken;
        } catch {
          return '';
        }
      })() ||
      '';
    if (!supToken) {
      return { slug, logs: 'SUPERVISOR_TOKEN nicht verfügbar.' };
    }

    const endpointMap: Record<string, string> = {
      core: '/core/logs',
      supervisor: '/supervisor/logs',
      dns: '/dns/logs',
      audio: '/audio/logs',
      multicast: '/multicast/logs',
      host: '/host/logs',
    };
    const endpoint = endpointMap[slug] || `/addons/${encodeURIComponent(slug)}/logs`;

    try {
      const res = await fetch(`http://supervisor${endpoint}`, {
        headers: {
          Authorization: `Bearer ${supToken}`,
          Accept: 'text/plain',
        },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const text = await res.text();
        const clean = text
          .replace(/\x1b\[[0-9;]*m/g, '')
          .split('\n')
          .slice(-120)
          .join('\n');
        if (clean.trim()) {
          return { slug, logs: clean };
        }
      }
    } catch {
      // Fall through to local log files / telemetry
    }

    // Fallback 1: Home Assistant Core log file mounted at /homeassistant/home-assistant.log
    if (slug === 'core' && fs.existsSync('/homeassistant/home-assistant.log')) {
      try {
        const stat = fs.statSync('/homeassistant/home-assistant.log');
        const readSize = Math.min(stat.size, 32768);
        const fd = fs.openSync('/homeassistant/home-assistant.log', 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        const lines = buf.toString('utf-8').split('\n').slice(-100).join('\n');
        return { slug, logs: lines || 'home-assistant.log ist aktuell leer.' };
      } catch {
        // ignore
      }
    }

    // Fallback 2: go2rtc live stream diagnostics
    if (slug.includes('go2rtc')) {
      try {
        const gr = await fetch('http://192.168.188.92:1984/api/streams', {
          signal: AbortSignal.timeout(1500),
        });
        if (gr.ok) {
          const streams = await gr.json();
          return {
            slug,
            logs: `[go2rtc Live Stream Registry :1984]\n${JSON.stringify(streams, null, 2)}`,
          };
        }
      } catch {
        // ignore
      }
    }

    // Fallback 3: Thassi container / system telemetry summary
    const sysRes = await fetch('http://127.0.0.1:8099/api/system/status', {
      signal: AbortSignal.timeout(1200),
    })
      .then((r) => r.json())
      .catch(() => null);
    const jobsList = Array.isArray((sysRes as any)?.jobs) ? (sysRes as any).jobs : [];
    const jobLines = jobsList.map(
      (j: any) =>
        `[${j.lastRunAt || 'init'}] [${j.appId}/${j.id}] (${j.lastStatus || 'idle'}) -> ${j.lastResult || 'OK'}`
    );

    return {
      slug,
      logs: [
        `=== Container: ${slug} (HASS OS 17.1 · Kernel 6.12.67-haos) ===`,
        `Supervisor Container Status: started`,
        `Hinweis: Für direkten Docker-Journald-Zugriff auf Fremd-Add-ons wurde hassio_role: manager in config.yaml aktiviert.`,
        ``,
        `=== Aktive Thassi Hintergrund-Jobs & Subsystem-Protokoll ===`,
        ...jobLines,
      ].join('\n'),
    };
  });

  // Native Home Assistant Automation: Büro OG Unused Button (light.thomasbuero_2pm_oben_output_1) -> Shelf Lights (switch.buro_og_regal_lichter)
  const OFFICE_AUTOMATION_ID = 'thassi_buro_og_schalter_oben_rechts_regal_lichter';

  async function ensureOfficeShelfSwitchAutomation() {
    const result: Record<string, any> = {
      automationId: OFFICE_AUTOMATION_ID,
      triggerEntityId: 'light.thomasbuero_2pm_oben_output_1',
      targetEntityId: 'switch.buro_og_regal_lichter',
      configApiStatus: null,
      yamlUpdated: false,
      reloaded: false,
      siblingDeviceEntities: [] as Array<Record<string, any>>,
      liveStates: {} as Record<string, any>,
      automationsYamlPreview: '',
    };

    const haRoot = fs.existsSync('/homeassistant')
      ? '/homeassistant'
      : fs.existsSync('/config')
        ? '/config'
        : null;

    // 1. Inspect core.entity_registry to see all entities on the same Shelly 2PM device
    let extraInputEntities: string[] = [];
    if (haRoot) {
      try {
        const regPath = path.join(haRoot, '.storage', 'core.entity_registry');
        if (fs.existsSync(regPath)) {
          const raw = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
          const entities: Array<Record<string, any>> = raw?.data?.entities || [];
          const targetEntry = entities.find(
            (e) => e.entity_id === 'light.thomasbuero_2pm_oben_output_1'
          );
          const mainLightEntry = entities.find(
            (e) => e.entity_id === 'light.buro_og_grosses_licht'
          );
          const deviceIds = new Set(
            [targetEntry?.device_id, mainLightEntry?.device_id].filter(Boolean)
          );
          const siblings = entities.filter(
            (e) =>
              (e.device_id && deviceIds.has(e.device_id)) ||
              String(e.entity_id || '').includes('thomasbuero_2pm_oben')
          );
          result.siblingDeviceEntities = siblings.map((e) => ({
            entity_id: e.entity_id,
            original_name: e.original_name,
            name: e.name,
            disabled_by: e.disabled_by,
            device_id: e.device_id,
          }));

          // Check if there is an active binary_sensor input for channel 1 (e.g. detached switch input)
          extraInputEntities = siblings
            .filter(
              (e) =>
                !e.disabled_by &&
                typeof e.entity_id === 'string' &&
                e.entity_id.startsWith('binary_sensor.') &&
                (e.entity_id.includes('input_1') || e.entity_id.includes('switch_1'))
            )
            .map((e) => e.entity_id);
        }
      } catch (e) {
        result.registryError = e instanceof Error ? e.message : String(e);
      }
    }

    const triggers: Array<Record<string, any>> = [
      {
        platform: 'state',
        entity_id: 'light.thomasbuero_2pm_oben_output_1',
        from: 'off',
        to: 'on',
      },
      {
        platform: 'state',
        entity_id: 'light.thomasbuero_2pm_oben_output_1',
        from: 'on',
        to: 'off',
      },
    ];

    for (const inputEntity of extraInputEntities) {
      triggers.push(
        {
          platform: 'state',
          entity_id: inputEntity,
          from: 'off',
          to: 'on',
        },
        {
          platform: 'state',
          entity_id: inputEntity,
          from: 'on',
          to: 'off',
        }
      );
    }

    const automationPayload = {
      id: OFFICE_AUTOMATION_ID,
      alias: 'Büro OG: Schalter Oben Rechts schaltet Regal Lichter',
      description:
        'Schaltet die Regal Lichter (switch.buro_og_regal_lichter) bei jeder Betätigung des zweiten Wandschalters neben Großes Licht Büro (light.thomasbuero_2pm_oben_output_1) um.',
      trigger: triggers,
      condition: [],
      action: [
        {
          service: 'switch.toggle',
          target: {
            entity_id: 'switch.buro_og_regal_lichter',
          },
        },
      ],
      mode: 'single',
    };

    // 2. Register via Home Assistant Core Config REST API
    const supToken =
      process.env.SUPERVISOR_TOKEN ||
      process.env.HASSIO_TOKEN ||
      (() => {
        try {
          return ctx.sharedDb.kvGet<{ haToken?: string }>('ha_connection')?.haToken;
        } catch {
          return '';
        }
      })() ||
      '';

    if (supToken) {
      try {
        const res = await fetch(
          `http://supervisor/core/api/config/automation/config/${OFFICE_AUTOMATION_ID}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(automationPayload),
            signal: AbortSignal.timeout(4000),
          }
        );
        const bodyText = await res.text().catch(() => '');
        result.configApiStatus = { status: res.status, ok: res.ok, body: bodyText };
      } catch (e) {
        result.configApiStatus = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 3. Fallback: ensure /homeassistant/automations.yaml contains the automation
    if (haRoot) {
      try {
        const autoYamlPath = path.join(haRoot, 'automations.yaml');
        let currentYaml = fs.existsSync(autoYamlPath)
          ? fs.readFileSync(autoYamlPath, 'utf-8')
          : '';
        if (!currentYaml.includes(OFFICE_AUTOMATION_ID)) {
          const yamlBlock = [
            `- id: '${OFFICE_AUTOMATION_ID}'`,
            `  alias: 'Büro OG: Schalter Oben Rechts schaltet Regal Lichter'`,
            `  description: 'Schaltet die Regal Lichter (switch.buro_og_regal_lichter) bei jeder Betätigung des zweiten Wandschalters neben Großes Licht Büro (light.thomasbuero_2pm_oben_output_1) um.'`,
            `  trigger:`,
            `  - platform: state`,
            `    entity_id:`,
            `    - light.thomasbuero_2pm_oben_output_1`,
            `    from: 'off'`,
            `    to: 'on'`,
            `  - platform: state`,
            `    entity_id:`,
            `    - light.thomasbuero_2pm_oben_output_1`,
            `    from: 'on'`,
            `    to: 'off'`,
            `  condition: []`,
            `  action:`,
            `  - service: switch.toggle`,
            `    target:`,
            `      entity_id: switch.buro_og_regal_lichter`,
            `  mode: single`,
            ``,
          ].join('\n');

          const trimmed = currentYaml.trim();
          if (!trimmed || trimmed === '[]') {
            fs.writeFileSync(autoYamlPath, yamlBlock, 'utf-8');
          } else {
            fs.writeFileSync(autoYamlPath, `${ currentYaml.replace(/\s*$/, '') }\n\n${yamlBlock}`, 'utf-8');
          }
          result.yamlUpdated = true;
        }
        result.automationsYamlPreview = fs.readFileSync(autoYamlPath, 'utf-8').slice(-1500);
      } catch (e) {
        result.yamlError = e instanceof Error ? e.message : String(e);
      }
    }

    // 4. Reload automations in Home Assistant Core and fetch live states
    try {
      await ctx.ha.callService('automation', 'reload', {});
      result.reloaded = true;
    } catch (e) {
      result.reloadError = e instanceof Error ? e.message : String(e);
    }

    try {
      const states = await ctx.ha.getStates();
      for (const s of states) {
        if (
          s.entity_id === 'light.thomasbuero_2pm_oben_output_1' ||
          s.entity_id === 'switch.buro_og_regal_lichter' ||
          s.entity_id === 'light.buro_og_grosses_licht' ||
          s.entity_id.startsWith('automation.')
        ) {
          result.liveStates[s.entity_id] = {
            state: s.state,
            friendly_name: s.attributes?.friendly_name,
            last_changed: s.last_changed,
            id: s.attributes?.id,
          };
        }
      }
    } catch (e) {
      result.statesError = e instanceof Error ? e.message : String(e);
    }

    return result;
  }

  void ensureOfficeShelfSwitchAutomation();

  ctx.route('GET', '/office-switch-automation', async () => {
    return await ensureOfficeShelfSwitchAutomation();
  });

  ctx.route('POST', '/office-switch-automation', async () => {
    return await ensureOfficeShelfSwitchAutomation();
  });
});
