#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Smart Control Canvas (smart-canvas)..."
exec node --no-warnings /app/proxy.mjs
