#!/bin/sh
set -e

echo "[Thassi] Starting Thassi Personal App Hub on port ${PORT:-8099}..."
echo "[Thassi] Persistent data directory: ${THASSI_DATA_DIR:-/data}"

exec node --no-warnings /app/dist/server.mjs
