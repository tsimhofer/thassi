#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting HASS OS Monitor (system-monitor)..."
exec node --no-warnings /app/proxy.mjs
