# Thassi — Full-Stack TypeScript WebApps & Personal Data Hub for Home Assistant

`thassi` is a **Home Assistant Git Add-on Repository** and **Full-Stack TypeScript Workflow System** designed for building, hosting, and analyzing personal data applications (Google Calendar, Google Health/Fitness, Financial CSV Analysis, Meal Planning, Notes, and Smart Home Extensions) directly inside Home Assistant.

---

## Architecture (Hybrid Model)

1. **`Thassi Personal App Hub` (`thassi_host/`)** — A core Home Assistant Add-on with Ingress (`:8099`), shared persistent SQLite storage (`/data`), a shared Google OAuth2 credential vault, a background Cron scheduler, and a `<1s` LAN hot-deploy endpoint.
2. **Standalone Add-on Exporter (`npm.cmd run export -- <app-id>`)** — Any app in `apps/<app-id>` can also be exported as its own top-level Home Assistant Add-on folder (`thassi_<app_id>/`) in this Git repository so it gets its own dedicated Home Assistant sidebar tab and container.

---

## Installing in Home Assistant (`192.168.188.92`)

1. Push this repository to GitHub (or GitLab):
   ```powershell
   git add .
   git commit -m "Initial Thassi App Hub & workflow"
   git branch -M main
   git remote add origin https://github.com/<your-username>/thassi.git
   git push -u origin main
   ```
2. In Home Assistant (`http://192.168.188.92:8123`), go to:
   **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories**
3. Paste your GitHub repository URL and click **Add**.
4. Install **Thassi Personal App Hub**, enable **Show in sidebar**, and click **Start**.

---

## Developer Workflow Commands

> **Note for Windows PowerShell:** If PowerShell script execution policy blocks `npm.ps1`, run commands using `npm.cmd`.

### 1. Local Development Server
Builds all apps and starts the Thassi Hub locally at `http://localhost:8099` (connecting to `http://192.168.188.92:8123` via `.env` or the Hub Settings UI):
```powershell
npm.cmd run dev
```

### 2. Scaffold a New Full-Stack Project
Create a new app (with React + TypeScript frontend, backend routes, persistent SQLite database, and Home Assistant sensor publisher):
```powershell
npm.cmd run create -- meal-planner "Meal Planner" meals
npm.cmd run create -- finance-analytics "Finance Analytics" finance
npm.cmd run create -- health-sync "Google Health Sync" health
```

### 3. Instant `<1s` Hot-Deploy to Home Assistant (No Docker Rebuild)
While `Thassi Personal App Hub` is running on `192.168.188.92:8099`, push updated backend + frontend bundles over your local network immediately:
```powershell
npm.cmd run deploy -- meal-planner
```

### 4. Export an App as a Standalone Home Assistant Add-on
Want an app to appear as its own separate Add-on in the Home Assistant Add-on Store with a dedicated sidebar entry?
```powershell
npm.cmd run export -- meal-planner
git add . && git commit -m "Export meal-planner add-on" && git push
```

---

## Core `@thassi/sdk` Features

* **Persistent SQLite & CSV Importer (`ctx.db`)**:
  * Isolated per-app SQLite database (`/data/apps/<app-id>.db`) + cross-app database (`ctx.sharedDb` at `/data/shared.db`), automatically included in Home Assistant backups.
  * `ctx.db.importCsvToTable(tableName, csvText)` — Auto-detects `,` / `;` delimiters and European decimal commas (`1.234,56`) for bank & health exports.
  * `ctx.db.summarizeTable(tableName)` — Computes row counts, distinct values, `min`, `max`, `sum`, and `avg`.
* **Home Assistant Bridge (`ctx.ha`)**:
  * Zero-config authentication inside Home Assistant OS via `SUPERVISOR_TOKEN`.
  * Read states (`ctx.ha.getStates()`), call services (`ctx.ha.callService()`), and publish custom sensors (`ctx.ha.publishSensor('monthly_spend', 420.50, { unit_of_measurement: 'EUR' })`).
* **Shared Google OAuth2 Vault (`ctx.google`)**:
  * Authorize once in the Thassi Hub UI for Google Calendar & Google Fitness/Health scopes, and call `ctx.google.fetchUpcomingCalendarEvents()` or `ctx.google.googleFetch(url)` from any app.
* **Background Cron Scheduler (`ctx.scheduleJob`)**:
  * Schedule periodic background sync & data aggregation tasks with run history and manual triggering from the UI.
