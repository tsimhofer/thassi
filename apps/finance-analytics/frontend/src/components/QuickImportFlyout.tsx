import React, { useEffect, useRef, useState } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';
import {
  BANK_PRESETS,
  type QuickImportConfig,
} from '../../../shared/finance-types.js';

interface QuickImportFlyoutProps {
  isOpen: boolean;
  onClose: () => void;
  config: QuickImportConfig;
  onUpdateConfig: (partial: Partial<QuickImportConfig>) => Promise<void>;
  onClearCookies: () => Promise<void>;
  onScanDownloads: () => Promise<{
    events: Array<{
      fileName: string;
      insertedCount: number;
      skippedDuplicates: number;
      format: string;
    }>;
  }>;
  onSimulateDownload: () => Promise<{
    fileName: string;
    csvContent: string;
    insertedCount: number;
    skippedDuplicates: number;
  }>;
  onAutoImportFile: (file: File, accountName: string) => Promise<void>;
}

export const QuickImportFlyout: React.FC<QuickImportFlyoutProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onClearCookies,
  onScanDownloads,
  onSimulateDownload,
  onAutoImportFile,
}) => {
  const [urlInput, setUrlInput] = useState(config.loginUrl);
  const [userInput, setUserInput] = useState(config.verfuegernummer);
  const [pinHintInput, setPinHintInput] = useState(config.autoLoginSecret || '');
  const [acctInput, setAcctInput] = useState(config.defaultAccountName || 'Girokonto');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [watchingBrowserDir, setWatchingBrowserDir] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dirHandleRef = useRef<any>(null);
  const seenFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setUrlInput(config.loginUrl);
    setUserInput(config.verfuegernummer);
    setPinHintInput(config.autoLoginSecret || '');
    setAcctInput(config.defaultAccountName || 'Girokonto');
  }, [config]);

  // Listen for postMessage from the embedded Quick Import Portal iframe
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'THASSI_QUICK_IMPORT_DONE') {
        const p = ev.data.payload || {};
        setStatusMsg(
          `✅ Automatischer Import abgeschlossen: "${p.fileName}" (${p.insertedCount} neue Buchungen geparst!)`
        );
        void onScanDownloads();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onScanDownloads]);

  // Poll backend Downloads watcher while Flyout is open
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(async () => {
      try {
        const res = await onScanDownloads();
        if (res.events && res.events.length > 0) {
          const ev = res.events[0];
          setStatusMsg(
            `📥 Neue Download-Datei automatisch erkannt & importiert: "${ev.fileName}" (+${ev.insertedCount} Buchungen)`
          );
        }
      } catch {}

      // Also check Browser FileSystemDirectoryHandle if user linked their local Downloads folder
      if (dirHandleRef.current) {
        try {
          for await (const entry of dirHandleRef.current.values()) {
            if (entry.kind !== 'file') continue;
            const name: string = entry.name || '';
            if (!/\.(csv|xml|sta|mt940)$/i.test(name)) continue;
            const file: File = await entry.getFile();
            const sig = `${file.name}:${file.size}:${file.lastModified}`;
            if (!seenFilesRef.current.has(sig)) {
              seenFilesRef.current.add(sig);
              // Only auto-import files modified within the last 10 minutes or matching George IBAN export
              if (Date.now() - file.lastModified < 10 * 60 * 1000) {
                await onAutoImportFile(file, acctInput);
                setStatusMsg(
                  `⚡ Browser-Download "${file.name}" automatisch erkannt, geparst & importiert!`
                );
              }
            }
          }
        } catch {}
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [isOpen, acctInput, onScanDownloads, onAutoImportFile]);

  if (!isOpen) return null;

  const base = getHostBaseUrl();
  const portalSrc = `${base}/api/apps/finance-analytics/quick-import/portal`;

  const handleBankPresetChange = async (bankId: QuickImportConfig['bankId']) => {
    const preset = BANK_PRESETS.find((b) => b.id === bankId);
    const nextUrl = preset ? preset.url : urlInput;
    setUrlInput(nextUrl);
    await onUpdateConfig({ bankId, loginUrl: nextUrl });
  };

  const handleSaveSettings = async () => {
    await onUpdateConfig({
      loginUrl: urlInput.trim(),
      verfuegernummer: userInput.trim(),
      autoLoginSecret: pinHintInput,
      defaultAccountName: acctInput.trim() || 'Girokonto',
    });
    setStatusMsg('💾 Auto-Login Zugangsdaten & Cookie-Einstellungen gespeichert.');
  };

  const handleOpenPopupBrowser = async () => {
    await handleSaveSettings();
    if (userInput.trim() && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(userInput.trim());
      } catch {}
    }
    const w = 540;
    const h = 740;
    const left = Math.max(20, window.screen.width - w - 50);
    const top = 70;
    window.open(
      urlInput,
      'ThassiBankingPopupFlyout',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes`
    );
    setStatusMsg(
      '🔓 Online-Banking Popup-Browser geöffnet (Verfügernummer in Zwischenablage kopiert, Browser-Cookies aktiv). Sobald du dort den Kontoauszug herunterlädst, wird er automatisch importiert!'
    );
  };

  const handleLinkBrowserDownloadsFolder = async () => {
    const winAny = window as any;
    if (typeof winAny.showDirectoryPicker !== 'function') {
      setStatusMsg('ℹ️ Dein Browser nutzt bereits den Backend-Downloads-Watcher (C:\\Users\\thoma\\Downloads).');
      return;
    }
    try {
      const handle = await winAny.showDirectoryPicker({
        id: 'thassi-finances-downloads',
        mode: 'read',
        startIn: 'downloads',
      });
      dirHandleRef.current = handle;
      // Prime existing files so only newly downloaded files trigger auto-import
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const f: File = await entry.getFile();
          seenFilesRef.current.add(`${f.name}:${f.size}:${f.lastModified}`);
        }
      }
      setWatchingBrowserDir(true);
      setStatusMsg(
        '📂 Lokaler Downloads-Ordner live verknüpft! Jede heruntergeladene Bank-Datei wird sofort automatisch importiert.'
      );
    } catch {
      // User cancelled picker
    }
  };

  const handleInstantSimulateDownload = async () => {
    setStatusMsg('⏳ Lade Bank-Export herunter und starte automatisches Parsing…');
    const res = await onSimulateDownload();
    if (res.csvContent && res.fileName) {
      const blob = new Blob([res.csvContent], { type: 'text/csv;charset=utf-8' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 2000);
    }
    setStatusMsg(
      `✅ "${res.fileName}" heruntergeladen & automatisch importiert: +${res.insertedCount} neue Buchungen (${res.skippedDuplicates} Duplikate übersprungen)!`
    );
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setStatusMsg(`⚡ Parse & importiere "${file.name}" automatisch…`);
      await onAutoImportFile(file, acctInput);
      setStatusMsg(`✅ "${file.name}" erfolgreich importiert und kategorisiert!`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        background: 'rgba(2, 6, 17, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 95vw)',
          height: '100vh',
          background: 'linear-gradient(180deg, #070c1a 0%, #091024 100%)',
          borderLeft: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '-24px 0 60px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: 20,
          gap: 14,
        }}
      >
        {/* Flyout Top Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 12,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <strong style={{ fontSize: 16, color: '#f8fafc' }}>
                Quick Import · Online-Banking Flyout Browser
              </strong>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
              Auto-Login & Cookie-Speicher • Automatischer Datei-Import beim Download
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: '#f8fafc',
              borderRadius: 10,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ✕ Schließen
          </button>
        </div>

        {/* Browser Address & Bank Selector Bar */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(51, 65, 85, 0.8)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={config.bankId}
              onChange={(e) =>
                handleBankPresetChange(e.target.value as QuickImportConfig['bankId'])
              }
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#040711',
                color: '#38bdf8',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {BANK_PRESETS.map((b) => (
                <option key={b.id} value={b.id}>
                  🏦 {b.name}
                </option>
              ))}
            </select>

            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://george.sparkasse.at/..."
              style={{
                flex: 1,
                minWidth: 200,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#040711',
                color: '#e2e8f0',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            />
          </div>

          {/* Auto-Login & Cookie Toggles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: 8,
              alignItems: 'end',
            }}
          >
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                Verfügernummer / Benutzername (Auto-Login)
              </label>
              <input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="z.B. 401928374"
                style={flyoutInputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                Passwort / PIN-Hinweis (optional im Tresor)
              </label>
              <input
                type="password"
                value={pinHintInput}
                onChange={(e) => setPinHintInput(e.target.value)}
                placeholder="••••••••"
                style={flyoutInputStyle}
              />
            </div>
            <button
              type="button"
              onClick={handleSaveSettings}
              style={{
                border: '1px solid #38bdf8',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Speichern
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 11.5,
              color: '#cbd5e1',
            }}
          >
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.autoLoginEnabled}
                  onChange={(e) => onUpdateConfig({ autoLoginEnabled: e.target.checked })}
                />
                Auto-Login / Auto-Fill
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.saveCookiesEnabled}
                  onChange={(e) => onUpdateConfig({ saveCookiesEnabled: e.target.checked })}
                />
                Session-Cookies speichern ({config.savedCookieCount})
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.watchDownloadsFolder}
                  onChange={(e) => onUpdateConfig({ watchDownloadsFolder: e.target.checked })}
                />
                Auto-Import bei Download
              </label>
            </div>
            {config.savedCookieCount > 0 && (
              <button
                type="button"
                onClick={onClearCookies}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f87171',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cookies löschen
              </button>
            )}
          </div>
        </div>

        {/* Status Toast inside Flyout */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.16)',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              color: '#6ee7b7',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {statusMsg}
          </div>
        )}

        {/* Primary Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={handleOpenPopupBrowser}
            style={{
              border: 'none',
              borderRadius: 11,
              padding: '11px 14px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
            }}
          >
            🔐 Online-Banking Popup öffnen
          </button>

          <button
            type="button"
            onClick={handleInstantSimulateDownload}
            style={{
              border: 'none',
              borderRadius: 11,
              padding: '11px 14px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#040711',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            ⚡ Live-Export herunterladen & Auto-Import
          </button>
        </div>

        {/* Embedded Interactive Banking Flyout Viewport */}
        <div
          style={{
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            background: '#050914',
            minHeight: 270,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            <span>🌐 Eingebettetes Flyout-Browser-Portal ({config.loginUrl})</span>
            <button
              type="button"
              onClick={handleLinkBrowserDownloadsFolder}
              style={{
                border: '1px solid rgba(56, 189, 248, 0.35)',
                background: watchingBrowserDir
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(56, 189, 248, 0.12)',
                color: watchingBrowserDir ? '#4ade80' : '#38bdf8',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 10.5,
                cursor: 'pointer',
              }}
            >
              {watchingBrowserDir
                ? '📂 Downloads-Ordner live überwacht ✓'
                : '📂 Lokalen Downloads-Ordner verknüpfen'}
            </button>
          </div>
          <iframe
            src={portalSrc}
            title="Quick Import Banking Flyout"
            style={{ width: '100%', height: 255, border: 'none', flex: 1 }}
          />
        </div>

        {/* Instant Auto-Import Dropzone (Zero-Click on File Selection) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          style={{
            padding: 16,
            borderRadius: 14,
            border: dragActive
              ? '2px dashed #38bdf8'
              : '1.5px dashed rgba(148, 163, 184, 0.35)',
            background: dragActive ? 'rgba(56, 189, 248, 0.1)' : 'rgba(15, 23, 42, 0.5)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
            📥 Heruntergeladene Bank-Datei hierher ziehen oder auswählen (Sofort-Import)
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>
            Unterstützt Sparkasse George CSV (UTF-16LE / UTF-8), SEPA CAMT.053 XML & SWIFT MT940.
            Wird sofort beim Auswählen geparst!
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-block',
                padding: '7px 14px',
                borderRadius: 8,
                background: '#1e293b',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📄 Datei auswählen & sofort importieren
              <input
                type="file"
                accept=".csv,.xml,.sta,.mt940,.json,text/csv"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setStatusMsg(`⚡ Parse & importiere "${file.name}"…`);
                    await onAutoImportFile(file, acctInput);
                    setStatusMsg(`✅ "${file.name}" erfolgreich importiert!`);
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                const res = await onScanDownloads();
                if (res.events && res.events.length > 0) {
                  setStatusMsg(
                    `✅ ${res.events.length} neue Datei(en) im Downloads-Ordner gefunden & importiert!`
                  );
                } else {
                  setStatusMsg(
                    `ℹ️ Downloads-Ordner (${config.downloadsPath}) geprüft — alle Exporte sind bereits synchron.`
                  );
                }
              }}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#cbd5e1',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🔄 Downloads-Ordner jetzt scannen
            </button>
          </div>

          {config.lastAutoImportFile && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#4ade80' }}>
              Letzter Auto-Import: <strong>{config.lastAutoImportFile}</strong> (
              {config.lastAutoImportCount} neue Buchungen)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const flyoutInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#040711',
  color: '#f8fafc',
  fontSize: 12,
};
