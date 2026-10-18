#!/bin/sh
set -e
echo "[Thassi Standalone] Starting Finance & Budget (finance-analytics)..."
exec node --no-warnings /app/dist/server.mjs
