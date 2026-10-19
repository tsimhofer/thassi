#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting thassi.finances (finance-analytics)..."
exec node --no-warnings /app/proxy.mjs
