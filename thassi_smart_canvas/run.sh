#!/bin/sh
set -e
echo "[Thassi Standalone] Starting Smart Control Canvas (smart-canvas)..."
exec node --no-warnings /app/dist/server.mjs
