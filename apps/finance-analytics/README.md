# thassi.finances — Thassi Personal Finance, Budget & Online-Banking Hub

Full-Stack Home Assistant & Thassi Modul für **persönliche Finanzanalyse**, **automatische Österreich/Sparkasse-George-Kategorisierung**, **interaktive Sunburst-Ausgabenvisualisierung**, **konfigurierbare Monatsbudgets**, **Quick Import Online-Banking Flyout (mit Auto-Login & Cookie-Tresor)** sowie ein **standardmäßig maskiertes, frei konfigurierbares Horizon-Dashboard-Preview**.

- **Repository:** [`https://github.com/tsimhofer/thassi.finances`](https://github.com/tsimhofer/thassi.finances)
- **Integriert in Thassi Monorepo:** `apps/finance-analytics` & `addons_standalone/thassi_finance_analytics` (Standalone Home Assistant Add-on)
- **Live Hauptseite:** `http://192.168.188.92:8099/apps/finance-analytics/`
- **Live Dashboard Preview:** `http://192.168.188.92:8099/` (`#widget-finances` im Thassi Horizon Dashboard)

---

## 1. Kernfunktionen & Architektur-Überblick

### 1.1 Privacy-First Dashboard Preview (`#widget-finances`)
- **Standardmäßig versteckt (`hiddenByDefault: true`):** Alle Finanzkennzahlen in der Horizon-Dashboard-Kachel werden standardmäßig mit `🔒 •••• €` maskiert, damit auf Wand-Tablets oder gemeinsam genutzten Bildschirmen keine sensiblen Kontostände unbeabsichtigt sichtbar sind.
- **Click-to-Toggle Visibility:** Ein Klick auf das `🔒 versteckt` / `👁️ sichtbar` Badge oder direkt auf den Datenbereich blendet die Echtzeit-Zahlen sofort ein bzw. wieder aus.
- **Frei konfigurierbare Preview-Elemente (`PreviewConfigPanel.tsx`):** Auf der Hauptseite unter **🎛️ Preview & Budgets** lässt sich exakt festlegen, welche Informationen im Dashboard-Preview erscheinen:
  1. **`current_balance` (`Aktueller Kontostand`):** Aktueller Bank-Kontostand inkl. Konto-/IBAN-Zuordnung (`Sparkasse George Giro`, `AT222025601001201324`).
  2. **`expenses_day` (`Total Expenses — Tag`):** Gesamtausgaben des aktuellen Buchungstages.
  3. **`expenses_week` (`Total Expenses — Woche`):** Kumulierte Ausgaben des 7-Tage-Fensters.
  4. **`group_budgets` (`Budgets für Gruppen`):** Frei auswählbare/anpinnbare Kategorien-Budgets (`📌 Preview`) mit Mini-Fortschrittsbalken (`Ausgegeben / Limit €`).
  5. **`quick_import` (`Quick Import Button`):** Direkt-Button in der Preview-Kachel, der das **Online-Banking Quick-Import Flyout** unmittelbar auf dem Dashboard öffnet.
- **Wählbare Haupt-Kennzahl (`primaryMetric`):** Bestimmt, welcher Wert in der kompakten Kopfzeile von `#widget-finances` hervorgehoben wird (`Aktueller Kontostand`, `Ausgaben Tag`, `Ausgaben Woche` oder `Monats-Cashflow`).

---

### 1.2 Quick Import — Online-Banking Popup Browser Flyout (`QuickImportFlyout.tsx` & `quick-import.ts`)
- **Popup-Browser als Flyout:** Öffnet sich sowohl aus der Horizon-Dashboard-Preview (`#widget-finances`) als auch über den Header-Button **⚡ Quick Import** auf der Hauptseite.
- **Unterstützte Bank-Presets:**
  - **Erste Bank & Sparkasse George (AT)** (`https://george.sparkasse.at/index.html#/login`)
  - **Raiffeisen Mein ELBA (AT)**
  - **BAWAG P.S.K. eBanking**
  - **Bank Austria OnlineBanking**
  - **N26 / Revolut / DKB**
- **Auto-Login & SQLite Cookie-Vault:**
  - Speichert auf Wunsch die **Verfügernummer / Benutzerkennung**, kopiert sie beim Öffnen des Popups automatisch für `Strg+V` in die Zwischenablage und verwaltet Session-Cookies im lokalen SQLite-Tresor (`finance_quick_import_cookies`).
- **Automatischer Datei-Import & Parser bei Download:**
  - **Live-Ordner-Überwachung (Browser File System Access API + Backend Watcher):** Überwacht den lokalen `Downloads`-Ordner (`C:\Users\thoma\Downloads` bzw. `/data/imports`) im 2,5-Sekunden-Takt auf neu heruntergeladene Kontoauszüge (`.csv`, `.xml`, `.sta`, `.mt940`, `.json`).
  - Sobald im Banking-Popup ein Export heruntergeladen wird, wird die Datei automatisch eingelesen, geparst, per `tx_ref`-Hash dedupliziert, kategorisiert und der Kontostand (falls im Auszug enthalten) aktualisiert.

---

### 1.3 Interaktives Multi-Ring Sunburst-Diagramm (`SunburstChart.tsx`)
- **2-Ring SVG-Hierarchie mit Hover-Fokus:**
  - **Modus 1 (`Gruppen → Kategorien`):**
    - *Innerer Ring (Ring 1):* Übergeordnete Ausgaben-Makrogruppen (`Fixkosten & Wohnen`, `Alltag & Einkauf`, `Freizeit & Lifestyle`, `Sparen & Vorsorge`).
    - *Äußerer Ring (Ring 2):* Einzelne Ausgabenkategorien (`Wohnen & Energie`, `Versicherung`, `Kredit & Finanzierung`, `Supermarkt`, `Tanken & KFZ`, `Freizeit & Gastronomie`, etc.).
  - **Modus 2 (`Kategorien → Top-Händler`):**
    - *Innerer Ring (Ring 1):* Kategorien.
    - *Äußerer Ring (Ring 2):* Die größten Empfänger/Händler innerhalb jeder Kategorie (inkl. Transaktionsanzahl und Prozentanteil).
- **Click-to-Filter:** Ein Klick auf ein Segment filtert die Buchungsliste direkt nach der gewählten Gruppe.

---

### 1.4 Monatsbudgets & Gruppen-Konfigurator (`BudgetManager.tsx`)
- **Monatliche Zielbudgets pro Gruppe:** Schnellanpassung über `-50 €` / `+50 €` Buttons oder direkte numerische Eingabe inkl. Sammel-Speicherung (`Alle Änderungen speichern`).
- **Eigene Gruppen anlegen:** Neue Budgetgruppen mit eigenem Namen, Icon und Farbcode jederzeit ergänzbar.
- **Dashboard-Pinning (`📌 Preview`):** Jede Budgetgruppe kann per Klick für die Anzeige im Horizon-Dashboard-Preview aktiviert oder deaktiviert werden.

---

### 1.5 Österreich- & Sparkasse-George-Parser (`parser.ts` & `categorizer.ts`)
- **Multi-Format-Parser (`src/backend/parser.ts`):**
  - **Sparkasse George CSV (UTF-16LE BOM `0xFF 0xFE` & UTF-8):** Automatische Erkennung von Semikolon/Tab-Spalten (`Buchungsdatum`, `Partnername`, `Partner IBAN`, `Betrag`, `Buchungs-Details`, `Buchungsreferenz`).
  - **SEPA CAMT.053 XML (`BkToCstmrStmt`):** Extrahiert `<Ntry>`, `<Amt>`, `<CdtDbtInd>`, `<BookgDt>`, `<RmtInf><Ustrd>` sowie den Schlusssaldo (`CLBD`).
  - **SWIFT MT940 (`.sta`):** Parst `:61:` Umsatzzeilen, `:86:` Verwendungszwecke und `:62F:` Endsalden.
- **Intelligente Kategorisierungs-Engine (`src/backend/categorizer.ts`):**
  - Speziell abgestimmt auf österreichische Händler & Verträge (Generali Polizzennummern, EVN Energie/Netz NÖ, Sparkasse Kreditrate, kabelplus, Billa/Spar/Hofer/Lidl/Eurospin, BP/OMV/Jet/Handyparken, Trafik, Ärzte/Apotheken sowie Sparkasse George *„Runde auf und spare“* Notgroschen-Überträge).

---

## 2. Verzeichnisstruktur

```text
thassi.finances/
├── thassi.app.json                 # Thassi App-Manifest (id: finance-analytics, v1.1.0)
├── package.json                    # NPM-Paketdefinition & Modul-Exporte
├── README.md                       # Vollständige Moduldokumentation
├── src/
│   ├── shared/
│   │   └── finance-types.ts        # Geteilte TypeScript-Interfaces, Kategorien & Bank-Presets
│   ├── backend/
│   │   ├── index.ts                # REST-API, SQLite-Migrationen, HA-Sensoren & Dashboard-Hotpatch
│   │   ├── categorizer.ts          # AT-Händler-Regelwerk & Sunburst-Hierarchie-Generator
│   │   ├── parser.ts               # UTF-16LE George CSV, CAMT.053 XML, MT940 & JSON Parser
│   │   └── quick-import.ts         # Quick Import Manager, Cookie-Vault & Downloads-Watcher
│   └── frontend/
│       ├── index.html              # Vite Entry HTML
│       └── src/
│           ├── main.tsx            # React Entrypoint
│           ├── App.tsx             # Aufgeräumte Hauptseite (Übersicht, Preview & Budgets, Buchungen)
│           └── components/
│               ├── SunburstChart.tsx       # Interaktives 2-Ring SVG Sunburst-Diagramm
│               ├── BudgetManager.tsx       # Monatsbudget- & Gruppen-Konfigurator
│               ├── PreviewConfigPanel.tsx  # Konfigurator für das Horizon Dashboard Preview
│               └── QuickImportFlyout.tsx   # Online-Banking Popup-Browser Flyout
├── dist/                           # Gebaute Produktions-Artefakte (backend.mjs + public/)
└── addon/                          # Standalone Home Assistant Add-on (Dockerfile, config.yaml)
```

---

## 3. REST-API Endpunkte (`/api/apps/finance-analytics/*`)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/dashboard` | Liefert die kompakten Preview-Daten für `#widget-finances` inkl. `previewConfig`, `currentBalance`, `expensesToday`, `expensesWeek` und `groupBudgets`. |
| `GET` | `/overview?month=YYYY-MM&excludeRoundUps=true` | Vollständige Monatsübersicht inkl. KPIs, Sunburst-Bäumen (`sunburstGroups`, `sunburstMerchants`), Kategorien-Breakdown, 6-Monats-Trend und Buchungen. |
| `GET` / `POST` | `/preview-config` | Liest oder speichert die Konfiguration des Horizon-Dashboard-Previews (`hiddenByDefault`, `primaryMetric`, `enabledElements`, `previewBudgetCategories`). |
| `GET` / `POST` | `/balance` | Liest oder aktualisiert den aktuellen Kontostand (`currentBalance`, `accountName`, `iban`, `autoAdjustOnImport`). |
| `POST` | `/budgets` & `/budgets/bulk` | Speichert einzelne oder mehrere monatliche Gruppenbudgets (`monthly_limit`, `color`, `icon`). |
| `POST` | `/quick-import/ingest` | Importiert und dedupliziert Bank-Exporte (`.csv`, `.xml`, `.sta`, `.json`) per UTF-8 oder Base64. |
| `POST` | `/quick-import/scan-downloads` | Scannt den lokalen `Downloads`-Ordner auf neue Bank-Exporte und importiert sie automatisch. |
| `GET` | `/quick-import/portal` | Rendert das eingebettete Quick-Import Banking-Portal mit Cookie-Tresor und Auto-Import-Dropzone. |
| `GET` / `POST` | `/quick-import/config` & `/quick-import/cookies` | Verwaltet Auto-Login-Konfiguration (`verfuegernummer`, `bankLoginUrl`) und gespeicherte Session-Cookies. |

---

## 4. Home Assistant Sensoren

Bei jeder Änderung oder jedem Quick-Import publiziert `thassi.finances` automatisch folgende Entitäten an Home Assistant:
- `sensor.thassi_finance_analytics_status` (Aktiver Monat, Kontostand, Einnahmen, Ausgaben, Sparquote)
- `sensor.thassi_finance_analytics_account_balance` (Aktueller Kontostand in `EUR`)
- `sensor.thassi_finance_analytics_expenses_today` (Tagesausgaben in `EUR`)
- `sensor.thassi_finance_analytics_expenses_week` (7-Tage-Wochenausgaben in `EUR`)
- `sensor.thassi_finance_analytics_monthly_expenses` (Monatsausgaben in `EUR`)
- `sensor.thassi_finance_analytics_monthly_income` (Monatseinnahmen in `EUR`)
- `sensor.thassi_finance_analytics_net_cashflow` (Netto-Cashflow in `EUR`)
- `sensor.thassi_finance_analytics_savings_rate` (Sparquote in `%`)
