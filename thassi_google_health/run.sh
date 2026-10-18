#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Google Health & Readiness (google-health)..."
exec node --no-warnings /app/proxy.mjs
