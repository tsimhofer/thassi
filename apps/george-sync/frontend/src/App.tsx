import React, { useState, useEffect, useRef } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('george-sync');

interface SyncInfo {
  appName: string;
  georgeUrl: string;
  lastSync: {
    synced_at: string;
    file_name: string;
    imported_count: number;
    skipped_duplicates: number;
    detected_balance: number | null;
    source: string;
  } | null;
  windowsAppAvailable: boolean;
  downloadsFolder: string;
  instructions: string[];
}

interface ImportResult {
  success: boolean;
  importedCount?: number;
  skippedDuplicates?: number;
  totalParsed?: number;
  format?: string;
  kpis?: { currentBalance?: number };
  syncedAt?: string;
  error?: string;
}

export default function App() {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fetchedAtMs, setFetchedAtMs] = useState<number>(Date.now());
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await api.get<SyncInfo>('/info');
      setInfo(res);
      const ts = Date.now();
      setFetchedAtMs(ts);
      setNowMs(ts);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verbindung zu Thassi fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    setLastResult(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.includes(',') ? res.split(',')[1] : res;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Content = await base64Promise;

      const ingressBase = (window as any).__THASSI_INGRESS_PATH__ || '';
      const targetUrl = `${ingressBase}/api/apps/finance-analytics/import-bank-csv`;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64Content
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Import fehlgeschlagen (${response.status}): ${errText}`);
      }

      const res = (await response.json()) as ImportResult;
      setLastResult({ ...res, success: true });
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Import fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const openGeorgePortal = () => {
    window.open('https://george.sparkasse.at/index.html#/login', '_blank', 'noopener,noreferrer');
  };

  const balanceVal = lastResult?.kpis?.currentBalance ?? info?.lastSync?.detected_balance ?? null;
  const balanceStr = balanceVal !== null ? `€ ${balanceVal.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const importedCount = lastResult?.importedCount ?? info?.lastSync?.imported_count ?? 0;
  const lastSyncDate = info?.lastSync?.synced_at ? new Date(info.lastSync.synced_at) : null;
  const lastSyncStr = lastSyncDate ? `${lastSyncDate.toLocaleDateString('de-AT')} ${lastSyncDate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : 'Noch kein Import';

  const ageSec = Math.max(0, Math.round((nowMs - fetchedAtMs) / 1000));
  const freshnessClock = new Date(fetchedAtMs).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Zone 1: 52px Swiss Hairline Top Header & Freshness Strip */}
      <header style={{ minHeight: '52px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '10px 24px', borderBottom: '1px solid var(--line-hairline)', background: 'var(--bg-canvas)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
            Erste Bank George Sync
          </h1>
          <span className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-muted)', border: '1px solid var(--line-hairline)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '4px' }}>
            BRIDGE v1.0
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Kontoauszug-Export & Synchronisierung mit Finanzen
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: errorMsg ? 'var(--accent-error)' : loading ? 'var(--accent-warning)' : 'var(--accent-nominal)', display: 'inline-block' }} />
            <span className="tabular-num">Stand: {freshnessClock} (vor {ageSec}s)</span>
          </span>
          <a
            href="/apps/finance-analytics/"
            style={{ background: 'transparent', border: '1px solid var(--line-hairline)', color: 'var(--text-secondary)', padding: '5px 10px', borderRadius: '4px', textDecoration: 'none', fontSize: '11.5px' }}
          >
            Finanzen öffnen
          </a>
          <button
            onClick={fetchStatus}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line-hairline)', color: 'var(--text-primary)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}
          >
            Aktualisieren
          </button>
        </div>
      </header>

      {/* Zone 2: 4-Column Continuous Hairline KPI Strip */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderBottom: '1px solid var(--line-hairline)', background: 'var(--bg-canvas)' }}>
        <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kontostand (Giro)</div>
          <div className="tabular-num" style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {balanceStr}
          </div>
          <div className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Quelle: {info?.lastSync?.source || 'George CSV / CAMT'}
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Letzter Sync</div>
          <div className="tabular-num" style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {lastSyncStr}
          </div>
          <div className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Datei: {info?.lastSync?.file_name || '—'}
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderRight: '1px solid var(--line-hairline)' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Importierte Buchungen</div>
          <div className="tabular-num" style={{ fontSize: '20px', fontWeight: 500, color: 'var(--accent-nominal)', marginTop: '6px', letterSpacing: '-0.02em' }}>
            +{importedCount}
          </div>
          <div className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Duplikate übersprungen: {lastResult?.skippedDuplicates ?? info?.lastSync?.skipped_duplicates ?? 0}
          </div>
        </div>

        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bridge Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: errorMsg ? 'var(--accent-error)' : 'var(--accent-nominal)' }} />
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {errorMsg ? 'Fehler' : uploading ? 'Import läuft' : 'Bereit für Export'}
            </span>
          </div>
          <div className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Ziel: /api/apps/finance-analytics/import-bank-csv
          </div>
        </div>
      </section>

      {/* Zone 3: 2-Column Continuous Hairline Workspace */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', borderBottom: '1px solid var(--line-hairline)', flex: 1 }}>
        {/* Left Column: 1-Click George Portal Launcher */}
        <div style={{ padding: '24px', borderRight: '1px solid var(--line-hairline)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              SCHRITT 01 · GEORGE PORTAL
            </div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
              George Online-Banking öffnen
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
              Öffnet das Erste Bank George Login direkt im Browser-Tab oder der George Mobile-App.
            </p>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line-hairline)', borderRadius: '4px', padding: '16px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Export-Protokoll
              </div>
              <div>1. Girokonto in George auswählen</div>
              <div>2. Oben rechts auf <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Mehr / Daten exportieren</strong> klicken</div>
              <div>3. Zeitraum wählen & <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>CSV oder CAMT.053 XML</strong> herunterladen</div>
            </div>
          </div>

          <button
            onClick={openGeorgePortal}
            style={{ width: '100%', background: 'var(--text-primary)', color: 'var(--bg-canvas)', border: 'none', padding: '10px 16px', borderRadius: '4px', fontWeight: 500, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
          >
            George Portal aufrufen
          </button>
        </div>

        {/* Right Column: Universal Drop & Mobile Select Zone */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              SCHRITT 02 · DIREKT-IMPORT
            </div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Kontoauszug synchronisieren
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
              Exportierte Datei hierher ziehen oder aus dem lokalen Downloads-Ordner auswählen.
            </p>

            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={triggerFileInput}
              style={{
                border: dragOver ? '1px solid var(--text-primary)' : '1px dashed rgba(255, 255, 255, 0.16)',
                background: dragOver ? 'var(--bg-elevated)' : 'var(--bg-input)',
                borderRadius: '4px',
                padding: '32px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.csv,.xml,.sta,.mt940,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                DROPZONE · CSV / ZIP / CAMT.053 / MT940
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {uploading ? 'Verarbeite Buchungen...' : 'Datei hierher ziehen oder klicken zum Auswählen'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Automatische Dublettenprüfung & Kategorisierung in Finanzen
              </div>
            </div>
          </div>

          {lastResult && (
            <div className="tabular-num" style={{ padding: '10px 12px', borderRadius: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--line-hairline)', fontSize: '12px', color: 'var(--accent-nominal)' }}>
              Import abgeschlossen: {lastResult.importedCount ?? 0} neue Buchungen, {lastResult.skippedDuplicates ?? 0} Duplikate übersprungen.
            </div>
          )}

          {errorMsg && (
            <div className="tabular-num" style={{ padding: '10px 12px', borderRadius: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--line-hairline)', fontSize: '12px', color: 'var(--accent-error)' }}>
              Fehler: {errorMsg}
            </div>
          )}
        </div>
      </main>

      {/* Zone 4: Windows Desktop Taskbar Exporter Strip */}
      <footer style={{ padding: '20px 24px', background: 'var(--bg-canvas)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Windows Taskbar Mini-App (GeorgeExporter.exe)</span>
              <span className="tabular-num" style={{ fontSize: '11px', color: 'var(--text-secondary)', border: '1px solid var(--line-hairline)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px' }}>
                195 KB · Native Win32
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Überwacht deinen lokalen Downloads-Ordner im Hintergrund und synchronisiert neue George-Exporte automatisch mit Thassi.
            </p>
          </div>

          <a
            href="./GeorgeExporter.exe"
            download="GeorgeExporter.exe"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--line-hairline)',
              color: 'var(--text-primary)',
              padding: '8px 14px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            GeorgeExporter.exe herunterladen
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid var(--line-hairline)', background: 'var(--bg-elevated)', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ padding: '12px 16px', borderRight: '1px solid var(--line-hairline)' }}>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>01 Taskleiste:</strong> Starte GeorgeExporter.exe und hefte das Tool an die Taskleiste an.
          </div>
          <div style={{ padding: '12px 16px', borderRight: '1px solid var(--line-hairline)' }}>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>02 Drag & Drop:</strong> Ziehe heruntergeladene CSV/CAMT-Dateien direkt auf das Fenster.
          </div>
          <div style={{ padding: '12px 16px' }}>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>03 Auto-Watch:</strong> Erkennt neue George-Downloads im Ordner Downloads automatisch.
          </div>
        </div>
      </footer>
    </div>
  );
}
