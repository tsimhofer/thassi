# Thassi Personal App Hub — Documentation

**Thassi Personal App Hub** is your self-hosted full-stack TypeScript runtime and personal data platform inside Home Assistant.

## Features

1. **App Launcher & Ingress Router**: Open any installed Thassi webapp directly inside Home Assistant.
2. **SQLite Personal Data Lake (`/data`)**: Every app gets its own persistent SQLite database (`/data/apps/<app-id>.db`) plus access to `/data/shared.db`, all automatically included in Home Assistant backups.
3. **Home Assistant Sensor & Service Bridge**: Uses `SUPERVISOR_TOKEN` automatically to read entity states, call services, and publish custom `sensor.thassi_<app>_<slug>` entities back to Home Assistant.
4. **Shared Google OAuth2 Vault**: Connect your Google account once to enable Calendar and Health/Fitness data syncing across all your apps.
5. **Instant LAN Hot-Deploy (`:8099`)**: Push app updates from your PC in `<1 second` via `npm.cmd run deploy -- <app-id>`.
