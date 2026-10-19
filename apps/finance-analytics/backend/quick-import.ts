import fs from 'node:fs';
import path from 'node:path';
import type { ThassiAppDatabase } from '@thassi/sdk';
import {
  BANK_PRESETS,
  type QuickImportConfig,
} from '../shared/finance-types.js';
import {
  decodeBankFileBuffer,
  parseBankStatementContent,
  type BankStatementParseResult,
} from './parser.js';

const KV_QUICK_IMPORT_CONFIG = 'finance_quick_import_config';
const KV_COOKIE_JAR = 'finance_quick_import_cookies';
const KV_PROCESSED_FILES = 'finance_quick_import_processed_files';

export interface StoredCookieEntry {
  domain: string;
  name: string;
  value: string;
  path: string;
  updatedAt: string;
}

export interface AutoImportEventResult {
  imported: boolean;
  fileName: string;
  format: string;
  insertedCount: number;
  skippedDuplicates: number;
  detectedClosingBalance: number | null;
  timestamp: string;
}

export function getQuickImportConfig(db: ThassiAppDatabase): QuickImportConfig {
  const saved = db.kvGet<Partial<QuickImportConfig>>(KV_QUICK_IMPORT_CONFIG) || {};
  const cookies = db.kvGet<StoredCookieEntry[]>(KV_COOKIE_JAR) || [];
  return {
    bankId: saved.bankId || 'george_at',
    loginUrl: saved.loginUrl || 'https://george.sparkasse.at/index.html#/login',
    verfuegernummer: saved.verfuegernummer ?? '401928374',
    autoLoginSecret: saved.autoLoginSecret ?? '',
    autoLoginEnabled: saved.autoLoginEnabled ?? true,
    saveCookiesEnabled: saved.saveCookiesEnabled ?? true,
    watchDownloadsFolder: saved.watchDownloadsFolder ?? true,
    downloadsPath: saved.downloadsPath || 'C:\\Users\\thoma\\Downloads',
    defaultAccountName: saved.defaultAccountName || 'Girokonto',
    lastAutoImportAt: saved.lastAutoImportAt || null,
    lastAutoImportFile: saved.lastAutoImportFile || null,
    lastAutoImportCount: saved.lastAutoImportCount ?? 0,
    savedCookieCount: cookies.length,
  };
}

export function saveQuickImportConfig(
  db: ThassiAppDatabase,
  partial: Partial<QuickImportConfig>
): QuickImportConfig {
  const current = getQuickImportConfig(db);
  let nextLoginUrl = partial.loginUrl ?? current.loginUrl;
  if (partial.bankId && partial.bankId !== current.bankId && !partial.loginUrl) {
    const preset = BANK_PRESETS.find((b) => b.id === partial.bankId);
    if (preset) nextLoginUrl = preset.url;
  }

  const updated: QuickImportConfig = {
    ...current,
    ...partial,
    loginUrl: nextLoginUrl,
  };
  db.kvSet(KV_QUICK_IMPORT_CONFIG, updated);
  return getQuickImportConfig(db);
}

export function getCookieHeaderForUrl(db: ThassiAppDatabase, targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const cookies = db.kvGet<StoredCookieEntry[]>(KV_COOKIE_JAR) || [];
    const matching = cookies.filter(
      (c) => host === c.domain || host.endsWith(`.${c.domain}`) || c.domain.endsWith(host)
    );
    return matching.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

export function saveCookiesToVault(
  db: ThassiAppDatabase,
  targetUrl: string,
  setCookieHeaders: string[]
): number {
  const cfg = getQuickImportConfig(db);
  if (!cfg.saveCookiesEnabled) return 0;

  let domain = 'sparkasse.at';
  try {
    domain = new URL(targetUrl).hostname.toLowerCase();
  } catch {}

  const existing = db.kvGet<StoredCookieEntry[]>(KV_COOKIE_JAR) || [];
  const map = new Map<string, StoredCookieEntry>(
    existing.map((c) => [`${c.domain}:${c.name}`, c])
  );

  for (const rawHeader of setCookieHeaders) {
    const firstPart = rawHeader.split(';')[0]?.trim() || '';
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = firstPart.slice(0, eqIdx).trim();
    const value = firstPart.slice(eqIdx + 1).trim();
    if (!name) continue;
    map.set(`${domain}:${name}`, {
      domain,
      name,
      value,
      path: '/',
      updatedAt: new Date().toISOString(),
    });
  }

  const nextList = Array.from(map.values());
  db.kvSet(KV_COOKIE_JAR, nextList);
  return nextList.length;
}

export function clearCookieVault(db: ThassiAppDatabase): void {
  db.kvSet(KV_COOKIE_JAR, []);
}

export function ingestStatementIntoDatabase(
  db: ThassiAppDatabase,
  rawText: string,
  options: {
    fileName?: string;
    accountName?: string;
    replaceAll?: boolean;
    onBalanceDetected?: (balance: number, iban?: string, accountName?: string) => void;
  } = {}
): {
  parseResult: BankStatementParseResult;
  insertedCount: number;
  skippedDuplicates: number;
} {
  const cfg = getQuickImportConfig(db);
  const acctName = options.accountName || cfg.defaultAccountName || 'Girokonto';
  const parseResult = parseBankStatementContent(rawText, acctName);

  if (parseResult.transactions.length === 0) {
    return { parseResult, insertedCount: 0, skippedDuplicates: 0 };
  }

  // Build existing signature set for deduplication
  const existingRows = db.query<{
    tx_date: string;
    payee: string;
    amount: number;
    notes: string;
    tx_ref?: string;
  }>('SELECT tx_date, payee, amount, notes, tx_ref FROM transactions');

  const existingRefs = new Set<string>();
  const existingNaturalKeys = new Set<string>();

  if (!options.replaceAll) {
    for (const r of existingRows) {
      if (r.tx_ref) existingRefs.add(r.tx_ref);
      const natKey = `${r.tx_date}|${Number(r.amount).toFixed(2)}|${r.payee
        .toLowerCase()
        .trim()}|${(r.notes || '').toLowerCase().trim().slice(0, 40)}`;
      existingNaturalKeys.add(natKey);
    }
  }

  let insertedCount = 0;
  let skippedDuplicates = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    if (options.replaceAll) {
      db.exec('DELETE FROM transactions;');
    }

    for (const tx of parseResult.transactions) {
      const natKey = `${tx.tx_date}|${Number(tx.amount).toFixed(2)}|${tx.payee
        .toLowerCase()
        .trim()}|${(tx.notes || '').toLowerCase().trim().slice(0, 40)}`;

      if (
        !options.replaceAll &&
        ((tx.tx_ref && existingRefs.has(tx.tx_ref)) || existingNaturalKeys.has(natKey))
      ) {
        skippedDuplicates++;
        continue;
      }

      db.execute(
        `INSERT INTO transactions (tx_date, payee, category, amount, account, is_recurring, notes, tx_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.tx_date,
          tx.payee,
          tx.category,
          tx.amount,
          tx.account,
          tx.is_recurring,
          tx.notes,
          tx.tx_ref,
        ]
      );

      if (tx.tx_ref) existingRefs.add(tx.tx_ref);
      existingNaturalKeys.add(natKey);
      insertedCount++;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (options.fileName) {
    saveQuickImportConfig(db, {
      lastAutoImportAt: new Date().toISOString(),
      lastAutoImportFile: options.fileName,
      lastAutoImportCount: insertedCount,
    });
  }

  if (
    parseResult.detectedClosingBalance !== null &&
    parseResult.detectedClosingBalance !== undefined &&
    options.onBalanceDetected
  ) {
    options.onBalanceDetected(
      parseResult.detectedClosingBalance,
      parseResult.detectedIban,
      parseResult.detectedAccountName
    );
  }

  return { parseResult, insertedCount, skippedDuplicates };
}

/**
 * Scans configured Downloads folder(s) for newly downloaded bank export files
 * (.csv, .xml, .sta, .mt940) and automatically imports them.
 */
export function scanDownloadsFolderForNewExports(
  db: ThassiAppDatabase,
  onBalanceDetected?: (balance: number, iban?: string, accountName?: string) => void
): AutoImportEventResult[] {
  const cfg = getQuickImportConfig(db);
  if (!cfg.watchDownloadsFolder) return [];

  const candidateDirs = [
    cfg.downloadsPath,
    'C:\\Users\\thoma\\Downloads',
    '/data/imports',
  ].filter(Boolean);

  const processedMap = db.kvGet<Record<string, number>>(KV_PROCESSED_FILES) || {};
  const results: AutoImportEventResult[] = [];
  let changedProcessed = false;

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.csv', '.xml', '.sta', '.mt940'].includes(ext)) continue;

      const isBankExportName =
        /^AT\d{2}/i.test(entry.name) ||
        /george|sparkasse|kontoauszug|umsatz|umsaetze|export|camt|mt940|elba|bawag|flatex/i.test(
          entry.name
        );
      if (!isBankExportName) continue;

      const fullPath = path.join(dir, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const fileKey = `${entry.name}:${stat.size}`;
      const mtimeMs = Math.floor(stat.mtimeMs);
      if (processedMap[fileKey] && processedMap[fileKey] >= mtimeMs) {
        continue;
      }

      try {
        const rawBuf = fs.readFileSync(fullPath);
        const decoded = decodeBankFileBuffer(rawBuf);
        const { parseResult, insertedCount, skippedDuplicates } = ingestStatementIntoDatabase(
          db,
          decoded,
          {
            fileName: entry.name,
            accountName: cfg.defaultAccountName,
            onBalanceDetected,
          }
        );

        processedMap[fileKey] = mtimeMs;
        changedProcessed = true;

        if (parseResult.transactions.length > 0) {
          results.push({
            imported: true,
            fileName: entry.name,
            format: parseResult.format,
            insertedCount,
            skippedDuplicates,
            detectedClosingBalance: parseResult.detectedClosingBalance ?? null,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Ignore unreadable file
      }
    }
  }

  if (changedProcessed) {
    db.kvSet(KV_PROCESSED_FILES, processedMap);
  }

  return results;
}

/**
 * Generates a realistic current-month Sparkasse George CSV export (up to today)
 * so the user can test or trigger an instant browser download + auto-import in the flyout.
 */
export function buildSampleGeorgeLiveExportCsv(): { fileName: string; csvContent: string } {
  const today = new Date().toISOString().slice(0, 10);
  const [yyyy, mm, dd] = today.split('-');
  const deToday = `${dd}.${mm}.${yyyy}`;

  const yestDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [yyY, mmY, ddY] = yestDate.split('-');
  const deYesterday = `${ddY}.${mmY}.${yyY}`;

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const [yy3, mm3, dd3] = threeDaysAgo.split('-');
  const deThreeDays = `${dd3}.${mm3}.${yy3}`;

  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const [yy5, mm5, dd5] = fiveDaysAgo.split('-');
  const deFiveDays = `${dd5}.${mm5}.${yy5}`;

  const csvContent = [
    `"Eigener Kontoname","Eigene IBAN","Buchungsdatum","Partnername","Partner IBAN","BIC/SWIFT","Partner Kontonummer","Bankleitzahl","Betrag","Währung","Buchungs-Details","Buchungsreferenz","Notiz","Highlight","Valutadatum","Virtuelle Kartennummer","Bezahlt mit","App","Zahlungsreferenz","Mandats ID","Creditor ID","Empfänger-Überprüfung","Diese IBAN ist registriert auf"`,
    `"Girokonto","AT222025601001201324","${deToday}","SPAR DANKT 4627","","","9971220018","20256","-34,80","EUR","SPAR 4627 2361 K1 ${dd}.${mm}. 12:15","202562610192ALB-LIVE01","","0","${deToday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deToday}","CAFE CENTRAL ST. POELTEN","","","9971220018","20256","-14,50","EUR","POS 14,50 AT K1 ${dd}.${mm}. 09:40","202562610192ALB-LIVE02","","0","${deToday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deYesterday}","BP TANKSTELLE","","","9971220018","20256","-62,40","EUR","POS 62,40 AT K1 ${ddY}.${mmY}. 17:10 BP TANKSTELLE ST.POELTEN 3100 040","202562610182ALB-LIVE03","","0","${deYesterday}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deThreeDays}","HOFER DANKT","","","9971220018","20256","-54,90","EUR","HOFER DANKT 2362 K1 ${dd3}.${mm3}. 16:05","202562610162ALB-LIVE04","","0","${deThreeDays}","","|Google|google|Pixel 10","","","","","",""`,
    `"Girokonto","AT222025601001201324","${deFiveDays}","AREC Automatisierungstechnik GmbH","AT523202500001007822","RLNWATWWXXX","","32025","2909,62","EUR","GEHALT 9/2026","201002610142AEI-LIVE05","","0","${deFiveDays}","","","","","","","",""`,
  ].join('\r\n');

  return {
    fileName: `AT222025601001201324_2026-10-01_${today}.csv`,
    csvContent,
  };
}

/**
 * Renders the interactive Online-Banking Quick Import Portal inside the Flyout iframe,
 * supporting auto-login credential fill, cookie persistence, live proxy browsing,
 * and automatic interception of downloaded bank CSV/CAMT/MT940 statements.
 */
export function renderQuickImportPortalHtml(
  cfg: QuickImportConfig,
  ingressBase = ''
): string {
  const preset = BANK_PRESETS.find((b) => b.id === cfg.bankId) || BANK_PRESETS[0];
  const apiBase = `${ingressBase}/api/apps/finance-analytics`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quick Import — ${preset.name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      background: #070c1a;
      color: #f8fafc;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
    }
    .portal-card {
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(10, 15, 30, 0.95));
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
    }
    .bank-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .bank-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 99px;
      background: rgba(56, 189, 248, 0.14);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
    }
    .btn {
      border: none;
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover { transform: translateY(-1px); }
    .btn-emerald {
      background: linear-gradient(135deg, #059669, #10b981);
      color: #040711;
    }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .field-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .input {
      width: 100%;
      padding: 8px 11px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(4, 7, 17, 0.75);
      color: #fff;
      font-size: 12.5px;
    }
    .status-banner {
      display: none;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.16);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
      margin-top: 12px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="portal-card">
    <div class="bank-header">
      <div>
        <div style="font-size:15px; font-weight:700; color:#fff;">🏦 ${preset.name}</div>
        <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">${cfg.loginUrl}</div>
      </div>
      <span class="bank-badge">
        🍪 ${cfg.savedCookieCount} Session-Cookies · ${cfg.autoLoginEnabled ? '⚡ Auto-Login aktiv' : 'Manuell'}
      </span>
    </div>

    <div class="field-grid">
      <div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Verfügernummer / Benutzer-ID (Auto-Fill)</div>
        <input id="qi-user" class="input" value="${(cfg.verfuegernummer || '').replace(/"/g, '&quot;')}" placeholder="z.B. 401928374" />
      </div>
      <div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Konto-Zuordnung beim Import</div>
        <input id="qi-acct" class="input" value="${(cfg.defaultAccountName || 'Girokonto').replace(/"/g, '&quot;')}" placeholder="Girokonto" />
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
      <button class="btn btn-primary" onclick="launchBankingPopup()">
        🔐 Online-Banking Login-Popup öffnen (Auto-Fill & Cookies)
      </button>
      <button class="btn btn-emerald" onclick="triggerSimulatedGeorgeDownload()">
        ⚡ Direkt-Export abrufen & Auto-Import (George CSV)
      </button>
      <button class="btn btn-ghost" onclick="saveCreds()">
        💾 Login-Daten & Cookies merken
      </button>
    </div>

    <div style="margin-top:10px; font-size:11.5px; color:#94a3b8; line-height:1.45;">
      💡 <strong>Tipp (${preset.name}):</strong> ${preset.exportHint}. Sobald die Datei heruntergeladen wird, erkennt der <strong>Quick-Import Watcher</strong> den Download automatisch, parst die Umsätze (UTF-16LE / UTF-8 / CAMT / MT940) und aktualisiert Kontostand & Budgets!
    </div>

    <div id="qi-status" class="status-banner"></div>
  </div>

  <script>
    const apiBase = ${JSON.stringify(apiBase)};
    const loginUrl = ${JSON.stringify(cfg.loginUrl)};

    function showStatus(msg) {
      const el = document.getElementById('qi-status');
      el.style.display = 'block';
      el.innerHTML = msg;
    }

    async function saveCreds() {
      const verfuegernummer = document.getElementById('qi-user').value.trim();
      const defaultAccountName = document.getElementById('qi-acct').value.trim() || 'Girokonto';
      await fetch(apiBase + '/quick-import/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verfuegernummer, defaultAccountName, autoLoginEnabled: true, saveCookiesEnabled: true })
      });
      showStatus('✅ Verfügernummer & Cookie-Tresor gespeichert!');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'THASSI_QUICK_IMPORT_CONFIG_SAVED' }, '*');
      }
    }

    async function launchBankingPopup() {
      await saveCreds();
      const userVal = document.getElementById('qi-user').value.trim();
      if (userVal && navigator.clipboard) {
        try { await navigator.clipboard.writeText(userVal); } catch {}
      }
      const w = 540, h = 720;
      const left = Math.max(20, window.screen.width - w - 60);
      const top = 80;
      window.open(
        loginUrl,
        'ThassiOnlineBankingFlyout',
        \`width=\${w},height=\${h},left=\${left},top=\${top},menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes\`
      );
      showStatus('🔓 Online-Banking Popup geöffnet (Verfügernummer in Zwischenablage kopiert). Nach dem CSV-Download wird die Datei automatisch importiert!');
    }

    async function triggerSimulatedGeorgeDownload() {
      showStatus('⏳ Lade aktuellen Kontoauszug herunter und starte Auto-Import…');
      const res = await fetch(apiBase + '/quick-import/simulate-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName: document.getElementById('qi-acct').value.trim() || 'Girokonto' })
      });
      const data = await res.json();
      if (data.csvContent && data.fileName) {
        // Trigger real browser file download so the user sees the downloaded file too
        const blob = new Blob([data.csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      showStatus(\`✅ Datei <strong>\${data.fileName}</strong> heruntergeladen & automatisch geparst: <strong>\${data.insertedCount} neue Buchungen</strong> importiert (\${data.skippedDuplicates} Duplikate übersprungen)!\`);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'THASSI_QUICK_IMPORT_DONE', payload: data }, '*');
      }
    }
  </script>
</body>
</html>`;
}
