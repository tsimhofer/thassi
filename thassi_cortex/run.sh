#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Cortex (cortex)..."
exec node --no-warnings /app/proxy.mjs
