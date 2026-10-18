#!/bin/sh
set -e
echo "[Thassi Standalone] Starting Google Health & Readiness (google-health)..."
exec node --no-warnings /app/dist/server.mjs
