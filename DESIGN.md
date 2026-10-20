# DESIGN.md — Thassi & Axons Design Manifesto

## 1. Leitbild & Philosophie

Dieses Dokument ist das verbindliche Design-Gesetz für **Axons** und alle zukünftigen Thassi-Übersichtsseiten und Dashboards.

Unsere gestalterische Referenz ist der **Schweizer Internationale Typografische Stil** kombiniert mit der Klarheit von **Linear, Dieter Rams (Braun) und Vercel**:
> **„Weniger, aber besser.“** — Struktur entsteht durch präzisen Schriftsatz, mathematische Abstände (Whitespace) und Ausrichtung, **niemals** durch dekorative Boxen, bunte Ränder, Verläufe oder Schatten.

---

## 2. Die 5 Eisernen Regeln (Was strikt verboten ist)

1. **Keine Box-in-Box-Verschachtelung (`No Card Soup`)**:
   * Datenpunkte, Metriken und Listen-Einträge werden **nicht** in abgerundete Kästchen mit eigenem Hintergrund und Rahmen eingesperrt.
   * Statt 12 kleiner Boxen auf einer Seite nutzen wir **horizontale Haarlinien (`1px solid rgba(255, 255, 255, 0.06)`)**, großzügigen vertikalen Abstand und eine saubere Spalten-Ausrichtung.
2. **Kein Farb-Zirkus (`Monochrome First`)**:
   * **95 % der Oberfläche sind streng achromatisch** (Tiefschwarz, Anthrazit, abgestuftes Weiß/Grau).
   * Keine regenbogenfarbigen Kategorie-Badges, keine bunten Verläufe (`linear-gradient`), keine leuchtenden Neon-Rahmen (`box-shadow: 0 0 20px ...`) und kein `backdrop-filter: blur()`-Einsatz als Dekoration.
3. **Farbe ist ausschließlich semantisches Signal (`Semantic Micro-Dots`)**:
   * Farbe darf nur als winziger Status-Indikator (`6px × 6px` Punkt oder einzelnes Wort) auftreten, wenn sie eine echte Zustandsinformation trägt:
     * **Bereit / Verbunden (`2xx`)**: `#10b981` (Emerald)
     * **Konfiguration / Auth fehlt**: `#f59e0b` (Amber)
     * **Fehler (`4xx/5xx`)**: `#ef4444` (Rose)
4. **Keine Emojis als UI-Krücke**:
   * Keine bunten Emojis (`🚀`, `🔥`, `🛒`, `✨`) in Überschriften, Buttons oder Tabellen.
   * Stattdessen arbeiten wir mit **präziser Typografie** (`AXON ID` in Monospace, klare Domänen-Kürzel wie `HA`, `GCAL`, `GMAIL`, `FIT`, `FIN`, `3DP`, `SYS`) oder hauchdünnen einfarbigen `1.5px`-SVG-Symbolen.
5. **Keine Dummy- oder Deko-Elemente**:
   * Jedes Element auf dem Bildschirm hat eine unmittelbare Funktion oder zeigt echte Live-Daten. Was keine Information trägt, wird weggelassen.

---

## 3. Farb- & Oberflächen-System (Achromatic Dark)

Wir verwenden eine extrem ruhige, kontrastreiche Dunkel-Palette ohne Blau- oder Violett-Stich:

| Token | Hex / Wert | Verwendung |
| :--- | :--- | :--- |
| `--bg-canvas` | `#09090b` | Primärer Seitenhintergrund (Zinc 950) |
| `--bg-elevated` | `#111113` | Subtile Hervorhebung für aktive Zeilen (`:hover`), Code-Blöcke oder geöffnete Inspector-Panels |
| `--bg-input` | `#141417` | Dezenter Hintergrund für fokussierbare Eingabefelder |
| `--line-hairline` | `rgba(255, 255, 255, 0.06)` | Primäre horizontale & vertikale Trennlinie (`1px`) |
| `--line-focus` | `rgba(255, 255, 255, 0.22)` | Aktiver Zustand für Inputs und ausgewählte Zeilen |
| `--text-primary` | `#fafafa` | Hauptüberschriften, primäre Messwerte, aktive Titel |
| `--text-secondary` | `#a1a1aa` | Beschreibungen, Tabellen-Zellen, Sekundärtext |
| `--text-muted` | `#52525b` | Spaltenköpfe, Einheiten, Metadaten, Zeitstempel |
| `--action-fg` | `#fafafa` | Primäre Interaktion (reinweißer Text/Button mit hohem Kontrast) |

---

## 4. Typografie als primäres Strukturwerkzeug

Schriftsatz ersetzt Rahmen und Boxen. Wir nutzen genau zwei Schriftfamilien:

* **UI & Fließtext (`--font-sans`)**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
* **IDs, Parameter, Latenzen, Payloads (`--font-mono`)**: `'JetBrains Mono', 'Fira Code', Consolas, monospace`
* **Zahlen (`font-variant-numeric: tabular-nums`)**: Alle Zahlen, Preise, Temperaturen, Latenzen und Zeitstempel **müssen** `tabular-nums` setzen, damit sie in Listen und Tabellen vertikal exakt untereinander stehen.

### Typografische Hierarchie (Scale)

| Ebene | Größe / Gewicht | Tracking / Stil | Zweck |
| :--- | :--- | :--- | :--- |
| **Page Title** | `20px` (`1.25rem`) · `500` (Medium) | `-0.025em` · `--text-primary` | Einziger Seitentitel oben links (z. B. `Axons`) |
| **Hero Metric** | `28px` (`1.75rem`) · `400` (Regular) | `-0.03em` · `tabular-nums` | Primäre Kennzahlen im Header-Streifen |
| **Section Label** | `11px` (`0.6875rem`) · `500` | `+0.08em` · `UPPERCASE` · `--text-muted` | Spaltenköpfe & Gruppen-Überschriften |
| **Row Title / Name** | `13.5px` (`0.84375rem`) · `500` | `-0.01em` · `--text-primary` | Name eines Axons oder Datensatzes |
| **Mono Identifier** | `12.5px` (`0.78125rem`) · `400` | `0` · `--font-mono` · `--text-secondary` | Technische Kennung (z. B. `ha.entities.query`) |
| **Body / Meta** | `13px` (`0.8125rem`) · `400` | `0` · `--text-secondary` | Kurzbeschreibung (einzeilig, `text-overflow: ellipsis`) |

---

## 5. Raum- & Layout-Architektur (Spacings & Raster)

Alle Abstände basieren auf einer strikten **8px-Grundskala** (`8px`, `16px`, `24px`, `32px`, `48px`, `64px`):

1. **Seiten-Container**:
   * Großzügiger Außenabstand (`padding: 32px 48px` auf Desktop, `20px` auf Mobile).
   * Maximale Lesebreite (`max-width: 1440px`), linksbündig verankert.
2. **Header-Zone**:
   * Eine einzige ruhige Kopfzeile: Links der Titel (`Axons`) + einzeilige System-Zusammenfassung (`32 Axons · 8 Domänen · 597 HA Entities`). Rechts ein minimalistisches Suchfeld (`/ Filter...`).
   * Darunter eine durchgehende `1px`-Haarlinie (`--line-hairline`).
3. **Domänen-Filter (Text-Tabs statt Pill-Buttons)**:
   * Statt klobiger Kästchen-Buttons stehen Filter als reine Text-Links nebeneinander (`gap: 24px`), getrennt durch Typografie:
     * Inaktiv: `color: var(--text-muted)`
     * Aktiv: `color: var(--text-primary)` mit einer `1px` weißen Unterstreichung direkt auf der Haarlinie.
4. **Master-Detail Split (Tabelle + ruhiges Inspector-Panel)**:
   * **Links (Hauptbereich)**: Eine luftige, rahmenlose Liste/Tabelle. Jede Zeile (`height: 44px`) ist nur durch eine `1px`-Haarlinie getrennt. Spalten:
     1. Status-Punkt (`6px`) + Domänen-Kürzel (`HA`, `GOOGLE`, `FIN`, `MEALS`, `3DP`, `VISION`, `GITHUB`, `AI`, `HTTP`)
     2. Axon-ID in Monospace (`ha.state.get`)
     3. Menschlicher Name & knappe Funktion
     4. Letzte Laufzeit / Status rechtsbündig (`tabular-nums`)
   * **Rechts (Inspector-Spalte bei Auswahl, durch `1px` vertikale Haarlinie abgetrennt)**:
     * Zeigt für das ausgewählte Axon die Input-Parameter als minimalistische Formular-Zeilen, einen schlichten `Ausführen`-Button (`#fafafa` Hintergrund, `#09090b` Text, `height: 32px`, `border-radius: 4px`) und darunter das echte Live-JSON-Ergebnis in sauberem Monospace-Satz.

---

## 6. Komponenten-Richtlinien

* **Buttons**:
  * **Primär**: `background: #fafafa`, `color: #09090b`, `font-size: 12.5px`, `font-weight: 500`, `padding: 6px 14px`, `border-radius: 4px`, `border: none`.
  * **Sekundär / Ghost**: `background: transparent`, `color: var(--text-secondary)`, `border: 1px solid var(--line-hairline)`. Bei Hover: `color: var(--text-primary)`, `border-color: var(--line-focus)`.
* **Inputs / Selects**:
  * Keine dicken Rahmen. `background: var(--bg-input)`, `border: 1px solid var(--line-hairline)`, `border-radius: 4px`, `padding: 7px 10px`, `color: var(--text-primary)`, `font-family: var(--font-mono)`, `font-size: 12.5px`.
* **JSON / Daten-Vorschau**:
  * Kein künstliches Terminal-Fenster mit bunten Ampel-Punkten. Einfach ein abgetrennter Bereich mit `font-family: var(--font-mono)`, `font-size: 12px`, `line-height: 1.6`, `color: var(--text-secondary)` und einer dezenten `Kopieren`-Aktion in `11px` rechts oben.
