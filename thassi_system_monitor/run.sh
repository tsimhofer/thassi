#!/bin/sh
set -e
echo "[HASS Add-on] Starting System Monitor v1.0.0..."
exec node --no-warnings /app/server.mjs
