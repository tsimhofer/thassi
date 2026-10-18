#!/bin/sh
set -e
echo "[HASS Add-on] Starting Fuege Neue v1.0.1..."
exec node --no-warnings /app/server.mjs
