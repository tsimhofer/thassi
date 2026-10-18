import http from 'node:http';

const PORT = Number(process.env.PORT || 8099);
const STARTED_AT = Date.now();
const ADDON_SLUG = "thassi_system_monitor";
const ADDON_NAME = "System Monitor";
const ADDON_VERSION = "1.0.0";
const USER_PROMPT = "Erstelle und deploye das HASS Add-on thassi_system_monitor mit Live Healthcheck und System-Telemetrie";

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/healthz' || url === '/api/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        addon: ADDON_SLUG,
        name: ADDON_NAME,
        version: ADDON_VERSION,
        prompt: USER_PROMPT,
        uptimeSeconds: Number(((Date.now() - STARTED_AT) / 1000).toFixed(1)),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${ADDON_NAME}</title>
  <style>
    body {
      margin: 0; padding: 40px; min-height: 100vh;
      background: radial-gradient(circle at top right, #0f172a, #020617);
      color: #f8fafc; font-family: system-ui, sans-serif;
    }
    .glass {
      max-width: 720px; margin: 0 auto; padding: 32px;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(20px);
      border-radius: 24px; border: 1px solid rgba(56, 189, 248, 0.25);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .pill {
      display: inline-block; padding: 4px 12px; border-radius: 99px;
      background: rgba(74, 222, 128, 0.15); color: #4ade80;
      font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    }
    h1 { font-weight: 300; font-size: 36px; margin: 14px 0 8px 0; }
    p { color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="glass">
    <span class="pill">● RUNNING ON HASS OS (v${ADDON_VERSION})</span>
    <h1>${ADDON_NAME}</h1>
    <p>Automatisch generiert und deployed via <strong>.NET MAUI &amp; SignalR Antigravity Pipeline</strong>.</p>
    <p><strong>Auftrag:</strong> ${USER_PROMPT}</p>
    <p style="font-size:12px; color:#38bdf8;">Healthcheck Endpoint: <code>GET /healthz -> 200 OK</code></p>
  </div>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${ADDON_SLUG}] Listening on 0.0.0.0:${PORT} (v${ADDON_VERSION})`);
});
