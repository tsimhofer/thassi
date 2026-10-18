#!/bin/sh
set -e
echo "[Thassi Sidebar Proxy] Starting Meal Planner (meal-planner)..."
exec node --no-warnings /app/proxy.mjs
