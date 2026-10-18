export interface ThassiJobDefinition {
  id: string;
  name: string;
  description?: string;
  /** Interval in minutes between automatic runs */
  intervalMinutes: number;
  /** Whether to run immediately when the app starts */
  runOnStart?: boolean;
  handler: () => Promise<string | void> | string | void;
}

export interface ThassiJobStatus {
  id: string;
  appId: string;
  name: string;
  description?: string;
  intervalMinutes: number;
  status: 'idle' | 'running' | 'success' | 'error';
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  lastError: string | null;
  runCount: number;
}

interface InternalJobEntry {
  appId: string;
  def: ThassiJobDefinition;
  state: ThassiJobStatus;
  timer?: ReturnType<typeof setInterval>;
}

export class ThassiCronScheduler {
  private jobs = new Map<string, InternalJobEntry>();

  private makeKey(appId: string, jobId: string): string {
    return `${appId}:${jobId}`;
  }

  registerJob(appId: string, def: ThassiJobDefinition): void {
    const key = this.makeKey(appId, def.id);
    const existing = this.jobs.get(key);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    const state: ThassiJobStatus = {
      id: def.id,
      appId,
      name: def.name,
      description: def.description,
      intervalMinutes: def.intervalMinutes,
      status: 'idle',
      lastRunAt: existing?.state.lastRunAt ?? null,
      lastDurationMs: existing?.state.lastDurationMs ?? null,
      lastResult: existing?.state.lastResult ?? null,
      lastError: existing?.state.lastError ?? null,
      runCount: existing?.state.runCount ?? 0,
    };

    const entry: InternalJobEntry = { appId, def, state };

    if (def.intervalMinutes > 0) {
      const ms = Math.max(10_000, def.intervalMinutes * 60 * 1000);
      entry.timer = setInterval(() => {
        void this.triggerJob(appId, def.id);
      }, ms);
    }

    this.jobs.set(key, entry);

    if (def.runOnStart) {
      setTimeout(() => {
        void this.triggerJob(appId, def.id);
      }, 500);
    }
  }

  async triggerJob(appId: string, jobId: string): Promise<ThassiJobStatus> {
    const key = this.makeKey(appId, jobId);
    const entry = this.jobs.get(key);
    if (!entry) {
      throw new Error(`Job "${jobId}" not found for app "${appId}"`);
    }

    if (entry.state.status === 'running') {
      return entry.state;
    }

    const start = Date.now();
    entry.state.status = 'running';
    entry.state.lastRunAt = new Date().toISOString();
    entry.state.lastError = null;

    try {
      const res = await entry.def.handler();
      entry.state.status = 'success';
      entry.state.lastDurationMs = Date.now() - start;
      entry.state.lastResult = typeof res === 'string' ? res : 'Completed successfully';
      entry.state.runCount += 1;
    } catch (err) {
      entry.state.status = 'error';
      entry.state.lastDurationMs = Date.now() - start;
      entry.state.lastError = err instanceof Error ? err.message : String(err);
      entry.state.runCount += 1;
    }

    return entry.state;
  }

  listJobs(appId?: string): ThassiJobStatus[] {
    const all = Array.from(this.jobs.values()).map((e) => e.state);
    return appId ? all.filter((j) => j.appId === appId) : all;
  }

  clearAppJobs(appId: string): void {
    for (const [key, entry] of this.jobs.entries()) {
      if (entry.appId === appId) {
        if (entry.timer) clearInterval(entry.timer);
        this.jobs.delete(key);
      }
    }
  }
}
