import http from 'node:http';

const PORT = Number(process.env.PORT || 8099);
const STARTED_AT = Date.now();
const ADDON_SLUG = "thassi_integration_google";
const ADDON_NAME = "Integration Google";
const ADDON_VERSION = "1.0.0";
const USER_PROMPT = "Füge eine neue Modul Integration für Google Drive hinzu. Stelle eine Ordner übersicht bereit, die über einen quick access mit flyout für zuletzt geöffnete Ordner Dateien zum Download bereitstellt";

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
      margin: 0; padding: 48px 5vw; min-height: 100vh;
      background: #040711;
      color: #f8fafc; font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    .pill {
      display: inline-block; padding: 3px 10px; border-radius: 99px;
      background: rgba(56, 189, 248, 0.12); color: #38bdf8;
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
    }
    h1 { font-weight: 200; font-size: 42px; letter-spacing: -0.02em; margin: 16px 0 8px 0; }
    p { color: rgba(248, 250, 252, 0.62); line-height: 1.6; max-width: 640px; font-weight: 300; }
  </style>
</head>
<body>
  <span class="pill">● LIVE ON HASS OS · v${ADDON_VERSION}</span>
  <h1>${ADDON_NAME}</h1>
  <p>${USER_PROMPT}</p>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${ADDON_SLUG}] Listening on 0.0.0.0:${PORT} (v${ADDON_VERSION})`);
});
