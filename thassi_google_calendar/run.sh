#!/bin/sh
set -e
echo "[Thassi Standalone] Starting Google Calendar & Time Analytics (google-calendar)..."
exec node --no-warnings /app/dist/server.mjs
