#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Grundriss & Raumplaner (floorplan)..."
exec node --no-warnings /app/proxy.mjs
