# Projekte & Modul-Workflow (`project-workflow` / `thassi_project_workflow`)

Vollständige Umsetzung des **Home Assistant Modul-Workflows** (Phasen 1–5) im `thassi`-Repository, bestehend aus dem generischen Modul-Template (`templates/ha-module-template/`) und dem spezifischen Projekte-Modul (`apps/project-workflow/` & `thassi_project_workflow/`).

---

## Architektur & Phasen-Umsetzung

### Phase 1: Ökosystem-Analyse und Vorbereitung
- **Python 3.14 & Unit-Test-Integration:** Konfiguration über [`pyproject.toml`](../../pyproject.toml) und Paketstruktur [`python_modules/`](../../python_modules/) für `python -m unittest discover -s python_modules -p "test_*.py" -v`.
- **Git & GitHub Kompatibilität:** Erweiterung von [`.gitignore`](../../.gitignore) für Python-Artefakte (`__pycache__/`, `*.pyc`, `.pytest_cache/`, `.venv/`).
- **Container-Runtime (`thassi_host/Dockerfile`):** Bereitstellung von `python3`, `git` und `openssh-client` im Alpine-Container sowie SQLite Auto-Recovery in `packages/sdk/src/db.ts`.

### Phase 2: Template-Definition (`templates/ha-module-template/`)
- **JSON-Schema:** [`module-template.schema.json`](../../templates/ha-module-template/module-template.schema.json)
- **YAML-Formularvorgabe:** [`module-template.yaml`](../../templates/ha-module-template/module-template.yaml)
- **4 Formular-Sektionen:**
  1. `objectives` (Slug, Name, Domain, Zielsetzung, Quell-/Ziel-Entitäten, Einheit, Abfrageintervall, Anomalie-Schwellwert)
  2. `dependencies` (Python-Version, Pip-Pakete, Home Assistant Integrationen, Umgebungsvariablen)
  3. `testWorkflow` (`unittest`, AST-Syntaxcheck, API-Fehlerbehandlungs-Verifikation, 100% Pass-Gate)
  4. `deploymentStrategy` (Samba `\\192.168.188.92\config`, SSH `:22`, HA Bridge `/config/custom_components/<slug>`, Git-Branch & Auto-Sensor-Publish)

### Phase 3: Implementierung und Bereitstellung (n8n-Workflow)
- **Importierbare n8n-Workflow-Datei:** [`workflows/n8n-ha-module-workflow.json`](../../workflows/n8n-ha-module-workflow.json)
- **6 Pipeline-Knoten:**
  1. **Webhook Trigger (`n8n-nodes-base.webhook`):** `POST /webhook/ha-module-generator` bzw. `/api/apps/project-workflow/webhook/trigger`
  2. **Template & Spec Validator (`n8n-nodes-base.code`):** Schema-Prüfung & Prompt-Synthese
  3. **Gemini API Code Generator (`n8n-nodes-base.httpRequest`):** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` inkl. Fallback-Synthesizer
  4. **Python AST & Unit-Test Runner (`n8n-nodes-base.executeCommand`):** Führt echte Python-Unit-Tests aus
  5. **Git Version Control (`n8n-nodes-base.git`):** Stage, Commit & Branch-Tracking (`main`)
  6. **SSH / Samba Home Assistant Deploy (`n8n-nodes-base.ssh`):** Überträgt das verifizierte Python-Modul nach `/config/custom_components/<slug>` und publiziert `sensor.thassi_project_workflow_<slug>`

### Phase 4: Dashboard und Projektverwaltung
- **Custom Panel in Home Assistant:** Verfügbar unter `/apps/project-workflow/`, im Thassi Horizon Dashboard (`#widget-workflow`) sowie als eigenständiges Sidebar-Add-on `thassi_project_workflow`.
- **Visueller n8n-Workflow-Canvas:** Animierte SVG-Datenfluss-Verbindungen (`n8nFlowDash`), Knoten-Pulsanimationen (`n8nPulseGlow`), Signalfarben (`Grün`, `Blau/Cyan`, `Gelb/Amber`, `Rot`) und Status-Flags.
- **GitHub-API-Integration (`github-client.ts`):** Live-Abfrage von `https://api.github.com/repos/tsimhofer/thassi` (Repositories, Commits, Branches, Dateibaum) inkl. Rate-Limit-Fallback.

### Phase 5: Qualitätssicherung und Stabilität
- **Python Unit-Tests ausführen:**
  ```powershell
  npm.cmd run test:python
  ```
- **End-to-End Workflow- & Fehlerbehandlungs-Verifikation ausführen:**
  ```powershell
  npm.cmd run test:workflow
  ```
