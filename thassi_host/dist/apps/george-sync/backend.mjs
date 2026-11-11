import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/george-sync/backend/index.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

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

// apps/george-sync/backend/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS george_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at TEXT NOT NULL,
      file_name TEXT NOT NULL,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_duplicates INTEGER NOT NULL DEFAULT 0,
      detected_balance REAL,
      source TEXT NOT NULL DEFAULT 'windows_app'
    );
  `);
  ctx.route("GET", "/info", (_req, { db }) => {
    const lastLog = db.queryOne("SELECT * FROM george_sync_logs ORDER BY id DESC LIMIT 1");
    return {
      appName: "Erste Bank Sync",
      georgeUrl: "https://george.sparkasse.at/index.html#/login",
      lastSync: lastLog || null,
      windowsAppAvailable: true,
      downloadsFolder: "C:\\Users\\thoma\\Downloads",
      instructions: [
        "1. \xD6ffne das George Portal (Mini-Browser oder Web).",
        "2. Logge dich ein und w\xE4hle dein Girokonto.",
        '3. Gehe auf "Kontoauszug / Export" und lade CSV oder CAMT.053 herunter.',
        "4. Ziehe die Datei direkt auf das Taskleisten-Symbol oder nutze die automatische Erkennung."
      ]
    };
  });
  ctx.route("POST", "/import", async (req, { db }) => {
    const body = req.body || {};
    if (!body.csvText && !body.base64Content) {
      return { status: 400, body: { error: "csvText or base64Content is required" } };
    }
    try {
      const response = await fetch("http://127.0.0.1:8099/api/apps/finance-analytics/import-bank-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText: body.csvText,
          base64Content: body.base64Content,
          fileName: body.fileName || "George-Export.csv"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        return { status: response.status, body: data };
      }
      db.execute(
        `INSERT INTO george_sync_logs (synced_at, file_name, imported_count, skipped_duplicates, detected_balance, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          (/* @__PURE__ */ new Date()).toISOString(),
          body.fileName || "George-Export.csv",
          data.importedCount ?? 0,
          data.skippedDuplicates ?? 0,
          data.kpis?.currentBalance ?? null,
          body.source || "web"
        ]
      );
      return {
        success: true,
        ...data,
        syncedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (err) {
      return { status: 500, body: { error: err.message || "Import forward failed" } };
    }
  });
  ctx.route("GET", "/download/GeorgeExporter.exe", () => {
    const candidatePaths = [
      path3.resolve(__dirname, "../../apps/george-sync/desktop/dist/GeorgeExporter.exe"),
      path3.resolve(__dirname, "../desktop/dist/GeorgeExporter.exe"),
      path3.resolve(process.cwd(), "apps/george-sync/desktop/dist/GeorgeExporter.exe")
    ];
    let exePath = "";
    for (const p of candidatePaths) {
      if (fs3.existsSync(p)) {
        exePath = p;
        break;
      }
    }
    if (!exePath) {
      return { status: 404, body: { error: "GeorgeExporter.exe binary not found" } };
    }
    const fileBuf = fs3.readFileSync(exePath);
    return {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": 'attachment; filename="GeorgeExporter.exe"',
        "Content-Length": String(fileBuf.length)
      },
      body: fileBuf
    };
  });
});
export {
  index_default as default
};
