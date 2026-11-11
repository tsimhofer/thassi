import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// apps/network-monitor/backend/index.ts
import crypto from "node:crypto";
import net2 from "node:net";

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

// apps/network-monitor/backend/index.ts
var gNetState = globalThis;
if (gNetState.__thassiNetMonTimer) {
  clearInterval(gNetState.__thassiNetMonTimer);
}
if (!gNetState.__thassiNetMonSids) {
  gNetState.__thassiNetMonSids = {};
}
if (!gNetState.__thassiNetMonHistory) {
  gNetState.__thassiNetMonHistory = [];
}
var DEFAULT_CONFIG = {
  primaryHost: "192.168.188.1",
  primaryUser: "fritz0972",
  primaryPassword: "",
  repeaterHost: "192.168.188.32",
  upstreamHost: "192.168.178.1",
  upstreamUser: "fritz2355",
  upstreamPassword: "",
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
};
var index_default = defineThassiApp((ctx) => {
  function loadRouterConfig() {
    try {
      const sharedVal = ctx.sharedDb.kvGet("fritzbox_config", null);
      if (sharedVal && typeof sharedVal === "object" && sharedVal.primaryHost) {
        return {
          primaryHost: sharedVal.primaryHost || DEFAULT_CONFIG.primaryHost,
          primaryUser: sharedVal.primaryUser || DEFAULT_CONFIG.primaryUser,
          primaryPassword: sharedVal.primaryPassword !== void 0 ? sharedVal.primaryPassword : DEFAULT_CONFIG.primaryPassword,
          repeaterHost: sharedVal.repeaterHost || DEFAULT_CONFIG.repeaterHost,
          upstreamHost: sharedVal.upstreamHost || DEFAULT_CONFIG.upstreamHost,
          upstreamUser: sharedVal.upstreamUser || DEFAULT_CONFIG.upstreamUser,
          upstreamPassword: sharedVal.upstreamPassword || "",
          updatedAt: sharedVal.updatedAt || DEFAULT_CONFIG.updatedAt
        };
      }
    } catch {
    }
    try {
      const localVal = ctx.db.kvGet("fritzbox_config", null);
      if (localVal && typeof localVal === "object" && localVal.primaryHost) {
        return {
          primaryHost: localVal.primaryHost || DEFAULT_CONFIG.primaryHost,
          primaryUser: localVal.primaryUser || DEFAULT_CONFIG.primaryUser,
          primaryPassword: localVal.primaryPassword !== void 0 ? localVal.primaryPassword : DEFAULT_CONFIG.primaryPassword,
          repeaterHost: localVal.repeaterHost || DEFAULT_CONFIG.repeaterHost,
          upstreamHost: localVal.upstreamHost || DEFAULT_CONFIG.upstreamHost,
          upstreamUser: localVal.upstreamUser || DEFAULT_CONFIG.upstreamUser,
          upstreamPassword: localVal.upstreamPassword || "",
          updatedAt: localVal.updatedAt || DEFAULT_CONFIG.updatedAt
        };
      }
    } catch {
    }
    saveRouterConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  function saveRouterConfig(cfg) {
    try {
      ctx.sharedDb.kvSet("fritzbox_config", cfg);
    } catch {
    }
    try {
      ctx.db.kvSet("fritzbox_config", cfg);
    } catch {
    }
  }
  loadRouterConfig();
  if (gNetState.__thassiNetMonHistory && gNetState.__thassiNetMonHistory.length === 0) {
    try {
      const savedHist = ctx.db.kvGet("network_samples_history", []);
      if (Array.isArray(savedHist) && savedHist.length > 0) {
        gNetState.__thassiNetMonHistory = savedHist.slice(-90);
      }
    } catch {
    }
  }
  function extractXmlTag(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
  }
  async function measureTcpLatencyMs(host, port, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const start = performance.now();
      const socket = new net2.Socket();
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
        }
        resolve(val);
      };
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => {
        const elapsed = Math.round((performance.now() - start) * 10) / 10;
        finish(elapsed);
      });
      socket.once("timeout", () => finish(null));
      socket.once("error", () => finish(null));
      try {
        socket.connect(port, host);
      } catch {
        finish(null);
      }
    });
  }
  async function invokeUpnpSoap(host, controlUrl, serviceType, action, timeoutMs = 2200) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}" />
  </s:Body>
</s:Envelope>`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`http://${host}:49000${controlUrl}`, {
        method: "POST",
        headers: {
          "Content-Type": 'text/xml; charset="utf-8"',
          SOAPAction: `"${serviceType}#${action}"`
        },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  async function fetchUpnpWanTelemetry(host) {
    const [latencyMs, addonXml, linkXml, statusXml, extIpXml] = await Promise.all([
      measureTcpLatencyMs(host, 80, 1500),
      invokeUpnpSoap(
        host,
        "/igdupnp/control/WANCommonIFC1",
        "urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1",
        "GetAddonInfos"
      ),
      invokeUpnpSoap(
        host,
        "/igdupnp/control/WANCommonIFC1",
        "urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1",
        "GetCommonLinkProperties"
      ),
      invokeUpnpSoap(
        host,
        "/igdupnp/control/WANIPConn1",
        "urn:schemas-upnp-org:service:WANIPConnection:1",
        "GetStatusInfo"
      ),
      invokeUpnpSoap(
        host,
        "/igdupnp/control/WANIPConn1",
        "urn:schemas-upnp-org:service:WANIPConnection:1",
        "GetExternalIPAddress"
      )
    ]);
    if (!addonXml && !linkXml) {
      return {
        host,
        reachable: latencyMs !== null,
        accessType: "Unknown",
        physicalLinkStatus: "Down",
        connectionStatus: "Disconnected",
        uptimeSec: 0,
        externalIp: "",
        dnsServers: [],
        maxDownstreamBitRate: 0,
        maxUpstreamBitRate: 0,
        byteReceiveRate: 0,
        byteSendRate: 0,
        totalBytesReceived: 0,
        totalBytesSent: 0,
        latencyMs
      };
    }
    const dns1 = addonXml ? extractXmlTag(addonXml, "NewDNSServer1") : "";
    const dns2 = addonXml ? extractXmlTag(addonXml, "NewDNSServer2") : "";
    const dnsServers = Array.from(new Set([dns1, dns2].filter((d) => d && d !== "0.0.0.0")));
    const rx64 = addonXml ? Number(extractXmlTag(addonXml, "NewX_AVM_DE_TotalBytesReceived64")) : 0;
    const tx64 = addonXml ? Number(extractXmlTag(addonXml, "NewX_AVM_DE_TotalBytesSent64")) : 0;
    const rx32 = addonXml ? Number(extractXmlTag(addonXml, "NewTotalBytesReceived")) : 0;
    const tx32 = addonXml ? Number(extractXmlTag(addonXml, "NewTotalBytesSent")) : 0;
    return {
      host,
      reachable: true,
      accessType: addonXml && extractXmlTag(addonXml, "NewX_AVM_DE_WANAccessType") || linkXml && extractXmlTag(linkXml, "NewWANAccessType") || "WAN",
      physicalLinkStatus: linkXml && extractXmlTag(linkXml, "NewPhysicalLinkStatus") || "Up",
      connectionStatus: statusXml && extractXmlTag(statusXml, "NewConnectionStatus") || "Connected",
      uptimeSec: statusXml ? Number(extractXmlTag(statusXml, "NewUptime") || 0) : 0,
      externalIp: extIpXml && extractXmlTag(extIpXml, "NewExternalIPAddress") || "",
      dnsServers,
      maxDownstreamBitRate: linkXml ? Number(extractXmlTag(linkXml, "NewLayer1DownstreamMaxBitRate") || 0) : 0,
      maxUpstreamBitRate: linkXml ? Number(extractXmlTag(linkXml, "NewLayer1UpstreamMaxBitRate") || 0) : 0,
      byteReceiveRate: addonXml ? Number(extractXmlTag(addonXml, "NewByteReceiveRate") || 0) : 0,
      byteSendRate: addonXml ? Number(extractXmlTag(addonXml, "NewByteSendRate") || 0) : 0,
      totalBytesReceived: rx64 > 0 ? rx64 : rx32,
      totalBytesSent: tx64 > 0 ? tx64 : tx32,
      latencyMs
    };
  }
  async function authenticateFritzSid(host, preferredUser, password, forceNew = false) {
    if (!password) {
      return { ok: false, sid: "0000000000000000", user: preferredUser, error: "Kein Passwort konfiguriert" };
    }
    const cache = gNetState.__thassiNetMonSids || {};
    const existing = cache[host];
    if (!forceNew && existing && existing.sid && Date.now() - existing.obtainedAt < 8 * 60 * 1e3) {
      return { ok: true, sid: existing.sid, user: existing.user, error: null };
    }
    try {
      const controller = new AbortController();
      const t1 = setTimeout(() => controller.abort(), 3500);
      const res1 = await fetch(`http://${host}/login_sid.lua?version=2`, {
        signal: controller.signal
      });
      clearTimeout(t1);
      const xml1 = await res1.text();
      const existingSid = extractXmlTag(xml1, "SID");
      if (existingSid && existingSid !== "0000000000000000") {
        cache[host] = { sid: existingSid, user: preferredUser, obtainedAt: Date.now() };
        return { ok: true, sid: existingSid, user: preferredUser, error: null };
      }
      const challenge = extractXmlTag(xml1, "Challenge");
      const blockTime = Number(extractXmlTag(xml1, "BlockTime") || 0);
      if (blockTime > 0) {
        return {
          ok: false,
          sid: "0000000000000000",
          user: preferredUser,
          error: `FRITZ!Box Login-Sperre aktiv (${blockTime}s warten)`
        };
      }
      let user = preferredUser.trim();
      if (!user) {
        const userTags = Array.from(xml1.matchAll(/<User[^>]*>([^<]+)<\/User>/gi)).map((m) => m[1].trim());
        user = userTags[userTags.length - 1] || "";
      }
      let responseStr = "";
      if (challenge.startsWith("2$")) {
        const parts = challenge.split("$");
        const iter1 = parseInt(parts[1], 10);
        const salt1 = Buffer.from(parts[2], "hex");
        const iter2 = parseInt(parts[3], 10);
        const salt2 = Buffer.from(parts[4], "hex");
        const hash1 = crypto.pbkdf2Sync(Buffer.from(password, "utf8"), salt1, iter1, 32, "sha256");
        const hash2 = crypto.pbkdf2Sync(hash1, salt2, iter2, 32, "sha256");
        responseStr = `${parts[4]}$${hash2.toString("hex")}`;
      } else if (challenge) {
        const md5 = crypto.createHash("md5").update(Buffer.from(`${challenge}-${password}`, "utf16le")).digest("hex");
        responseStr = `${challenge}-${md5}`;
      } else {
        return { ok: false, sid: "0000000000000000", user, error: "Keine Challenge von login_sid.lua erhalten" };
      }
      const form = new URLSearchParams({ username: user, response: responseStr });
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), 4500);
      const res2 = await fetch(`http://${host}/login_sid.lua?version=2`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller2.signal
      });
      clearTimeout(t2);
      const xml2 = await res2.text();
      const sid = extractXmlTag(xml2, "SID");
      const ok = Boolean(sid && sid !== "0000000000000000");
      if (ok) {
        cache[host] = { sid, user, obtainedAt: Date.now() };
        return { ok: true, sid, user, error: null };
      }
      const newBlock = extractXmlTag(xml2, "BlockTime");
      return {
        ok: false,
        sid: "0000000000000000",
        user,
        error: `Anmeldung fehlgeschlagen (BlockTime: ${newBlock || 0}s)`
      };
    } catch (err) {
      return {
        ok: false,
        sid: "0000000000000000",
        user: preferredUser,
        error: err?.message || "Netzwerkfehler bei FRITZ!Box Login"
      };
    }
  }
  async function queryFritzDataLua(host, sid, page) {
    try {
      const form = new URLSearchParams({
        xhr: "1",
        sid,
        lang: "de",
        page,
        xhrId: "all"
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5e3);
      const res = await fetch(`http://${host}/data.lua`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text.trim().startsWith("{")) return null;
      const json = JSON.parse(text);
      return json?.data || null;
    } catch {
      return null;
    }
  }
  function classifyDeviceCategory(name, ip) {
    const n = name.toLowerCase();
    if (n.includes("shelly") || n.includes("esp") || n.includes("tasmota") || n.includes("bambu") || n.includes("roborock") || n.includes("ecowitt") || n.includes("tapo") || n.includes("hue") || n.includes("thermostat") || n.includes("plug")) {
      return "iot";
    }
    if (ip === "192.168.188.92" || n.includes("homeassistant") || n.includes("hass") || n.includes("nas") || n.includes("synology") || n.includes("proxmox") || n.includes("raspberry")) {
      return "server";
    }
    if (n.includes("fritz") || n.includes("repeater") || n.includes("switch") || n.includes("unifi") || ip === "192.168.188.32" || ip === "192.168.188.1") {
      return "network";
    }
    if (n.includes("desktop") || n.includes("pc") || n.includes("laptop") || n.includes("macbook") || n.includes("thinkpad") || ip === "192.168.188.46") {
      return "compute";
    }
    if (n.includes("iphone") || n.includes("ipad") || n.includes("pixel") || n.includes("galaxy") || n.includes("android") || n.includes("watch")) {
      return "mobile";
    }
    if (n.includes("tv") || n.includes("sonos") || n.includes("apple-tv") || n.includes("chromecast") || n.includes("fire") || n.includes("echo") || n.includes("playstation") || n.includes("xbox")) {
      return "media";
    }
    return "other";
  }
  function parseDeviceProperties(dev, primaryHost) {
    const props = Array.isArray(dev?.properties) ? dev.properties : [];
    const propTexts = props.map((p) => String(p?.txt || "").trim()).filter(Boolean);
    const combinedProps = propTexts.join(" \xB7 ");
    let band = "";
    if (combinedProps.includes("5 GHz")) band = "5 GHz";
    else if (combinedProps.includes("2,4 GHz") || combinedProps.includes("2.4 GHz")) band = "2.4 GHz";
    let rxMbps = null;
    let txMbps = null;
    const mbitMatch = combinedProps.match(/(\d+)\s*\/\s*(\d+)\s*Mbit\/s/i);
    if (mbitMatch) {
      rxMbps = Number(mbitMatch[1]);
      txMbps = Number(mbitMatch[2]);
    } else {
      const singleMbit = combinedProps.match(/(\d+)\s*Mbit\/s/i);
      if (singleMbit) {
        rxMbps = Number(singleMbit[1]);
        txMbps = Number(singleMbit[1]);
      } else if (combinedProps.includes("1 Gbit/s")) {
        rxMbps = 1e3;
        txMbps = 1e3;
      }
    }
    const parentName = String(dev?.parent?.name || "").trim() || "FRITZ!Box 6890 LTE";
    let parentIp = primaryHost;
    const parentUrl = String(dev?.parent?.url || "");
    const parentIpMatch = parentUrl.match(/(\d+\.\d+\.\d+\.\d+)/);
    if (parentIpMatch) {
      parentIp = parentIpMatch[1];
    } else if (parentName.toLowerCase().includes("repeater")) {
      parentIp = "192.168.188.32";
    }
    const rawType = String(dev?.type || dev?.classes || "").toLowerCase();
    const portLabel = String(dev?.port || (rawType.includes("wlan") ? "WLAN" : "LAN")).trim();
    const guest = Boolean(dev?.options?.guest);
    let connectionType = "unknown";
    if (guest) connectionType = "guest";
    else if (rawType.includes("wlan") || portLabel.toUpperCase().includes("WLAN")) connectionType = "wlan";
    else if (rawType.includes("lan") || portLabel.toUpperCase().includes("LAN")) connectionType = "lan";
    else if (rawType.includes("vpn")) connectionType = "vpn";
    const ip = String(dev?.ipv4?.ip || dev?.ip || "").trim();
    const name = String(dev?.name || ip || "Unbekanntes Ger\xE4t").trim();
    const stateClass = String(dev?.state?.class || "");
    const isActiveModel = dev?.model === "active";
    const isOnline = stateClass.includes("globe_online") || stateClass.includes("led_green");
    let DirectUrl = null;
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      DirectUrl = `http://${ip}`;
    }
    return {
      uid: String(dev?.UID || `${ip}-${dev?.mac || name}`),
      name,
      ip,
      mac: String(dev?.mac || "").trim(),
      active: isActiveModel,
      online: isOnline,
      connectionType,
      portLabel: band ? `${portLabel} (${band})` : portLabel,
      band: band || (connectionType === "lan" ? "GbE / Copper" : "\u2014"),
      speedLabel: combinedProps || (connectionType === "lan" ? "LAN" : "\u2014"),
      rxMbps,
      txMbps,
      meshParentName: parentName,
      meshParentIp: parentIp,
      dhcp: String(dev?.ipv4?.dhcp || "") === "1",
      guest,
      category: classifyDeviceCategory(name, ip),
      url: DirectUrl
    };
  }
  async function refreshAuthenticatedFritzData(force = false) {
    const now = Date.now();
    if (!force && gNetState.__thassiNetMonCachedLua && now - gNetState.__thassiNetMonCachedLua.fetchedAt < 1e4) {
      return gNetState.__thassiNetMonCachedLua;
    }
    const cfg = loadRouterConfig();
    let auth = await authenticateFritzSid(cfg.primaryHost, cfg.primaryUser, cfg.primaryPassword, false);
    let overview = null;
    if (auth.ok) {
      overview = await queryFritzDataLua(cfg.primaryHost, auth.sid, "overview");
      if (!overview) {
        auth = await authenticateFritzSid(cfg.primaryHost, cfg.primaryUser, cfg.primaryPassword, true);
        if (auth.ok) {
          overview = await queryFritzDataLua(cfg.primaryHost, auth.sid, "overview");
        }
      }
    }
    let netDev = null;
    let ecoStat = null;
    let netMoni = null;
    let chan = null;
    let log = null;
    if (auth.ok) {
      [netDev, ecoStat, netMoni, chan, log] = await Promise.all([
        queryFritzDataLua(cfg.primaryHost, auth.sid, "netDev"),
        queryFritzDataLua(cfg.primaryHost, auth.sid, "ecoStat"),
        queryFritzDataLua(cfg.primaryHost, auth.sid, "netMoni"),
        queryFritzDataLua(cfg.primaryHost, auth.sid, "chan"),
        queryFritzDataLua(cfg.primaryHost, auth.sid, "log")
      ]);
    }
    const [repeaterAuth, upstreamAuth] = await Promise.all([
      cfg.repeaterHost ? authenticateFritzSid(cfg.repeaterHost, cfg.primaryUser, cfg.primaryPassword, false) : Promise.resolve({ ok: false, sid: "", user: "", error: null }),
      cfg.upstreamHost && cfg.upstreamPassword ? authenticateFritzSid(cfg.upstreamHost, cfg.upstreamUser, cfg.upstreamPassword, false) : Promise.resolve({ ok: false, sid: "", user: cfg.upstreamUser, error: null })
    ]);
    gNetState.__thassiNetMonCachedLua = {
      fetchedAt: Date.now(),
      overview,
      netDev,
      ecoStat,
      netMoni,
      chan,
      log,
      repeaterAuthOk: repeaterAuth.ok,
      primaryAuthOk: auth.ok,
      primaryAuthUser: auth.user,
      primaryAuthError: auth.error,
      upstreamAuthOk: upstreamAuth.ok
    };
    return gNetState.__thassiNetMonCachedLua;
  }
  async function sampleLiveTelemetry() {
    const cfg = loadRouterConfig();
    const [primaryUpnp, upstreamUpnp, latRepeaterMs, latExternalMs, latGoogleDnsMs] = await Promise.all([
      fetchUpnpWanTelemetry(cfg.primaryHost),
      fetchUpnpWanTelemetry(cfg.upstreamHost),
      cfg.repeaterHost ? measureTcpLatencyMs(cfg.repeaterHost, 80, 1500) : Promise.resolve(null),
      measureTcpLatencyMs("1.1.1.1", 443, 1800),
      measureTcpLatencyMs("8.8.8.8", 443, 1800)
    ]);
    const point = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      epochMs: Date.now(),
      lanRxKbps: Math.round(primaryUpnp.byteReceiveRate * 8 / 100) / 10,
      lanTxKbps: Math.round(primaryUpnp.byteSendRate * 8 / 100) / 10,
      wanRxKbps: Math.round(upstreamUpnp.byteReceiveRate * 8 / 100) / 10,
      wanTxKbps: Math.round(upstreamUpnp.byteSendRate * 8 / 100) / 10,
      latGatewayMs: primaryUpnp.latencyMs,
      latRepeaterMs,
      latUpstreamMs: upstreamUpnp.latencyMs,
      latExternalMs: latExternalMs ?? latGoogleDnsMs
    };
    const hist = gNetState.__thassiNetMonHistory || [];
    hist.push(point);
    if (hist.length > 90) {
      hist.splice(0, hist.length - 90);
    }
    gNetState.__thassiNetMonHistory = hist;
    try {
      ctx.db.kvSet("network_samples_history", hist);
    } catch {
    }
    return {
      primaryUpnp,
      upstreamUpnp,
      latRepeaterMs,
      latExternalMs,
      latGoogleDnsMs
    };
  }
  gNetState.__thassiNetMonTimer = setInterval(() => {
    void sampleLiveTelemetry();
  }, 15e3);
  void sampleLiveTelemetry();
  void refreshAuthenticatedFritzData(false);
  async function buildOverviewPayload(forceLua = false) {
    const cfg = loadRouterConfig();
    const [live, lua] = await Promise.all([
      sampleLiveTelemetry(),
      refreshAuthenticatedFritzData(forceLua)
    ]);
    const activeRaw = Array.isArray(lua?.netDev?.active) ? lua.netDev.active : [];
    const passiveRaw = Array.isArray(lua?.netDev?.passive) ? lua.netDev.passive : [];
    const activeDevices = activeRaw.map(
      (d) => parseDeviceProperties(d, cfg.primaryHost)
    );
    const passiveDevices = passiveRaw.map(
      (d) => parseDeviceProperties(d, cfg.primaryHost)
    );
    const ipToNum = (ip) => {
      const p = ip.split(".").map((n) => parseInt(n, 10));
      if (p.length !== 4 || p.some(isNaN)) return 999999999;
      return (p[0] << 24 >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
    };
    activeDevices.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return ipToNum(a.ip) - ipToNum(b.ip);
    });
    passiveDevices.sort((a, b) => ipToNum(a.ip) - ipToNum(b.ip));
    const cpuUtilSeries = Array.isArray(lua?.ecoStat?.cpuutil?.series?.[0]) ? lua.ecoStat.cpuutil.series[0].map((v) => Number(v) || 0) : [];
    const cpuTempSeries = Array.isArray(lua?.ecoStat?.cputemp?.series?.[0]) ? lua.ecoStat.cputemp.series[0].map((v) => Number(v) || 0) : [];
    const ramSeriesRaw = Array.isArray(lua?.ecoStat?.ramusage?.series) ? lua.ecoStat.ramusage.series : [];
    const ramFixedPct = Number(ramSeriesRaw?.[0]?.slice(-1)?.[0] ?? 10);
    const ramDynamicPct = Number(ramSeriesRaw?.[1]?.slice(-1)?.[0] ?? 34.2);
    const ramFreePct = Number(ramSeriesRaw?.[2]?.slice(-1)?.[0] ?? 55.8);
    const ramUsedPct = Math.round((100 - ramFreePct) * 10) / 10;
    const currentCpuPct = cpuUtilSeries.length > 0 ? cpuUtilSeries[cpuUtilSeries.length - 1] : 0;
    const currentCpuTempC = cpuTempSeries.length > 0 ? cpuTempSeries[cpuTempSeries.length - 1] : 0;
    const fritzos = lua?.overview?.fritzos || {};
    const internetConn = lua?.overview?.internet?.connections?.[0] || {};
    const wlanInfo = Array.isArray(lua?.overview?.wlan) ? lua.overview.wlan[0] : null;
    const lanInfo = lua?.overview?.lan || null;
    const syncGroup = lua?.netMoni?.sync_groups?.[0] || null;
    const fritzDsSeriesKbps = Array.isArray(syncGroup?.ds_bps_curr) ? syncGroup.ds_bps_curr.map((b) => Math.round((Number(b) || 0) * 8 / 100) / 10) : [];
    const fritzUsSeriesKbps = Array.isArray(syncGroup?.us_default_bps_curr) ? syncGroup.us_default_bps_curr.map((b) => Math.round((Number(b) || 0) * 8 / 100) / 10) : [];
    const logs = Array.isArray(lua?.log?.log) ? lua.log.log.map((entry, idx) => ({
      id: Number(entry?.id ?? idx),
      date: String(entry?.date || ""),
      time: String(entry?.time || ""),
      group: String(entry?.group || "sys"),
      msg: String(entry?.msg || "")
    })) : [];
    const wlanActiveCount = activeDevices.filter((d) => d.connectionType === "wlan" || d.connectionType === "guest").length;
    const lanActiveCount = activeDevices.filter((d) => d.connectionType === "lan").length;
    const repeaterClientCount = activeDevices.filter((d) => d.meshParentIp === cfg.repeaterHost).length;
    const masterClientCount = activeDevices.length - repeaterClientCount;
    return {
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      luaFetchedAt: lua?.fetchedAt ? new Date(lua.fetchedAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
      config: {
        primaryHost: cfg.primaryHost,
        primaryUser: cfg.primaryUser,
        hasPrimaryPassword: Boolean(cfg.primaryPassword),
        repeaterHost: cfg.repeaterHost,
        upstreamHost: cfg.upstreamHost,
        upstreamUser: cfg.upstreamUser,
        hasUpstreamPassword: Boolean(cfg.upstreamPassword),
        updatedAt: cfg.updatedAt
      },
      auth: {
        primaryOk: Boolean(lua?.primaryAuthOk),
        primaryUser: lua?.primaryAuthUser || cfg.primaryUser,
        primaryError: lua?.primaryAuthError || null,
        repeaterOk: Boolean(lua?.repeaterAuthOk),
        upstreamOk: Boolean(lua?.upstreamAuthOk)
      },
      routers: {
        primary: {
          host: cfg.primaryHost,
          name: String(fritzos.Productname || "FRITZ!Box 6890 LTE"),
          osVersion: String(fritzos.nspver || "7.57"),
          boxDate: String(fritzos.boxDate || ""),
          isUpdateAvail: Boolean(fritzos.isUpdateAvail),
          energyPct: Number(fritzos.energy || 22),
          cpuPct: currentCpuPct,
          cpuTempC: currentCpuTempC,
          ramUsedPct,
          ramFixedPct,
          ramDynamicPct,
          ramFreePct,
          cpuUtilSeries: cpuUtilSeries.slice(-24),
          cpuTempSeries: cpuTempSeries.slice(-24),
          wanIpOnUpstream: String(internetConn?.ipv4?.ip || "192.168.178.69"),
          connectedSinceEpoch: Number(internetConn?.ipv4?.since || 0),
          provider: String(internetConn?.provider || "kabelplus"),
          wlanSummary: String(wlanInfo?.txt || "Funknetz (2,4/5 GHz): Obi-WLAN Kenobi"),
          lanSummary: String(lanInfo?.txt || "verbunden (LAN 1, LAN 4)"),
          upnp: live.primaryUpnp
        },
        repeater: {
          host: cfg.repeaterHost,
          name: "FRITZ!Repeater (Mesh Node)",
          reachable: live.latRepeaterMs !== null,
          authenticated: Boolean(lua?.repeaterAuthOk),
          latencyMs: live.latRepeaterMs,
          connectedClients: repeaterClientCount
        },
        upstream: {
          host: cfg.upstreamHost,
          name: "FRITZ!Box 6660 Cable",
          provider: String(internetConn?.provider || "kabelplus"),
          authenticated: Boolean(lua?.upstreamAuthOk),
          upnp: live.upstreamUpnp
        }
      },
      latencies: {
        gatewayMs: live.primaryUpnp.latencyMs,
        repeaterMs: live.latRepeaterMs,
        upstreamMs: live.upstreamUpnp.latencyMs,
        cloudflareDnsMs: live.latExternalMs,
        googleDnsMs: live.latGoogleDnsMs
      },
      wifi: {
        ssidSummary: String(wlanInfo?.txt || "Obi-WLAN Kenobi"),
        bandSteering: Boolean(lua?.chan?.bandSteering),
        ht160: Boolean(lua?.chan?.ht160),
        powerLevel: String(lua?.chan?.powerLevel || "100%"),
        channelMode: String(lua?.chan?.channelSelectMode || "auto"),
        lastScanTime: String(lua?.chan?.lastScantime || ""),
        has24Ghz: Boolean(lua?.chan?.["24ghz"] ?? true),
        has5Ghz: Boolean(lua?.chan?.["5ghz"] ?? true)
      },
      deviceSummary: {
        activeCount: activeDevices.length,
        onlineCount: activeDevices.filter((d) => d.online).length,
        passiveCount: passiveDevices.length,
        wlanActiveCount,
        lanActiveCount,
        masterClientCount,
        repeaterClientCount
      },
      activeDevices,
      passiveDevices,
      history: gNetState.__thassiNetMonHistory || [],
      fritzSyncSeries: {
        dsKbps: fritzDsSeriesKbps,
        usKbps: fritzUsSeriesKbps
      },
      logs
    };
  }
  ctx.route("GET", "/overview", async () => {
    return await buildOverviewPayload(false);
  });
  ctx.route("POST", "/refresh", async () => {
    return await buildOverviewPayload(true);
  });
  ctx.route("POST", "/config", async (req) => {
    const current = loadRouterConfig();
    const body = req.body || {};
    const updated = {
      primaryHost: String(body.primaryHost || current.primaryHost).trim(),
      primaryUser: String(body.primaryUser || current.primaryUser).trim(),
      primaryPassword: typeof body.primaryPassword === "string" && body.primaryPassword.trim() !== "" ? body.primaryPassword.trim() : current.primaryPassword,
      repeaterHost: String(body.repeaterHost ?? current.repeaterHost).trim(),
      upstreamHost: String(body.upstreamHost || current.upstreamHost).trim(),
      upstreamUser: String(body.upstreamUser || current.upstreamUser).trim(),
      upstreamPassword: typeof body.upstreamPassword === "string" ? body.upstreamPassword.trim() : current.upstreamPassword,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveRouterConfig(updated);
    gNetState.__thassiNetMonSids = {};
    const overview = await buildOverviewPayload(true);
    return { ok: true, overview };
  });
  ctx.route("POST", "/probe", async (req) => {
    const body = req.body || {};
    const rawHost = String(body.host || "").trim();
    const port = Number(body.port || 80);
    if (!rawHost || !/^[a-zA-Z0-9._-]+$/.test(rawHost)) {
      return { status: 400, body: { error: "Ung\xFCltiger Hostname oder IP-Adresse" } };
    }
    const targetPort = port > 0 && port <= 65535 ? port : 80;
    const [tcpPrimary, tcpAlt] = await Promise.all([
      measureTcpLatencyMs(rawHost, targetPort, 2e3),
      targetPort !== 443 ? measureTcpLatencyMs(rawHost, 443, 2e3) : Promise.resolve(null)
    ]);
    return {
      host: rawHost,
      port: targetPort,
      reachable: tcpPrimary !== null || tcpAlt !== null,
      latencyMs: tcpPrimary ?? tcpAlt,
      port80OrCustomMs: tcpPrimary,
      port443Ms: tcpAlt,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
});
export {
  index_default as default
};
