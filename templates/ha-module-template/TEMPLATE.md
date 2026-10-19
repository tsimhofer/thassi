# Generisches Home Assistant Modul-Template (`thassi`)

Dieses Verzeichnis bildet die standardisierte **Phase-2-Formularvorgabe** für die automatisierte Generierung, Prüfung und Bereitstellung von Python-basierten Home Assistant Modulen über den **n8n-Workflow** und das **Thassi Projekte-Modul (`project-workflow`)**.

## Struktur der Formularvorgabe

| Sektion | Schlüssel | Zweck |
|---|---|---|
| **1. Zielsetzung** | `objectives` | Definiert `slug`, `name`, Home-Assistant-`domain` (`sensor`, `binary_sensor`, `switch`, `climate`, `automation`), fachliche Spezifikation für die Gemini API, Quell-/Ziel-Entitäten (`targetEntities`), Einheit (`unitOfMeasurement`), Icon und Abfrageintervall (`pollingIntervalSeconds`). |
| **2. Dependencies** | `dependencies` | Legt die benötigte Python-Version (`>=3.12`), optionale `pipPackages`, vorausgesetzte Home Assistant Integrationen (`haIntegrations`) sowie benötigte Umgebungsvariablen (`HA_URL`, `HA_TOKEN`, `GEMINI_API_KEY`, `GITHUB_TOKEN`) fest. |
| **3. Test-Workflow** | `testWorkflow` | Konfiguriert den verpflichtenden Qualitäts-Gatekeeper: Python AST-Syntaxcheck (`astSyntaxCheck`), `unittest`/`pytest`-Runner, API-Fehlerbehandlungstests (`verifyErrorHandling`) und Mindestbestehensquote (`minPassRatePercent: 100`). |
| **4. Deployment-Strategie** | `deploymentStrategy` | Steuert die Git-Versionierung (`gitBranch`, `autoCommitPush`, `rollbackOnTestFailure`) sowie die Übertragung nach Home Assistant (`192.168.188.92`) via Samba (`\\192.168.188.92\config`), SSH (`:22`) oder Thassi Host Bridge (`/homeassistant/custom_components/<slug>`). |

## Dateien in diesem Template

- [`module-template.schema.json`](./module-template.schema.json) — Formales JSON-Schema (Draft 2020-12) zur Validierung im n8n-Webhook und im UI-Formular.
- [`module-template.yaml`](./module-template.yaml) — Referenz-Ausprägung des Formulars.
- [`skeleton/`](./skeleton/) — Referenz-Implementierung eines Home Assistant Python Custom Components inkl. `unittest`-Testsuite.
