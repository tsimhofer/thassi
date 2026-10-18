#!/bin/sh
set -e
echo "[Thassi Standalone] Starting Meal Planner (meal-planner)..."
exec node --no-warnings /app/dist/server.mjs
