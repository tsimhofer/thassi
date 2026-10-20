#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Axons (workflows)..."
exec node --no-warnings /app/proxy.mjs
