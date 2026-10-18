#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Finance & Budget (finance-analytics)..."
exec node --no-warnings /app/proxy.mjs
