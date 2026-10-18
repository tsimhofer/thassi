#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Google Calendar & Time Analytics (google-calendar)..."
exec node --no-warnings /app/proxy.mjs
