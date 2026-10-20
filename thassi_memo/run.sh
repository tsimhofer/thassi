#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Memo (memo)..."
exec node --no-warnings /app/proxy.mjs
