import { parseCsv } from '@thassi/sdk';
import {
  autoCategorizeTransaction,
  detectRecurringFlag,
  normalizePayeeName,
} from './categorizer.js';
import type { TransactionRow } from '../shared/finance-types.js';

export type ParsedTransactionInput = Omit<TransactionRow, 'id'> & {
  tx_ref: string;
};

export interface BankStatementParseResult {
  format: 'CSV' | 'CAMT.053' | 'MT940' | 'JSON';
  transactions: ParsedTransactionInput[];
  detectedAccountName?: string;
  detectedIban?: string;
  detectedClosingBalance?: number | null;
}

export function decodeBankFileBuffer(buf: Buffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length >= 2) {
    // Sparkasse / George UTF-16LE BOM
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes);
    }
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export function parseEuroAmount(raw: string | number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const str = String(raw || '').trim();
  if (!str) return 0;

  let isNegative = false;
  if (
    str.startsWith('-') ||
    str.endsWith('-') ||
    (str.startsWith('(') && str.endsWith(')')) ||
    /\b(soll|dbit|debit|abgang)\b/i.test(str)
  ) {
    isNegative = true;
  }

  let cleaned = str.replace(/[€$£a-zA-Z\s()+-]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -Math.abs(n) : n;
}

export function normalizeDateString(raw: string): string {
  const trimmed = String(raw || '').trim();
  // Match DD.MM.YYYY or DD.MM.YY (Austrian/German bank format)
  const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (deMatch) {
    const yr = deMatch[3].length === 2 ? `20${deMatch[3]}` : deMatch[3];
    return `${yr}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`;
  }
  // Match YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  // Match YYMMDD (MT940)
  const mtMatch = trimmed.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (mtMatch) {
    const yr = Number(mtMatch[1]) > 70 ? `19${mtMatch[1]}` : `20${mtMatch[1]}`;
    return `${yr}-${mtMatch[2]}-${mtMatch[3]}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export function computeTransactionRef(
  txDate: string,
  amount: number,
  payee: string,
  notes: string,
  explicitRef = ''
): string {
  if (explicitRef.trim()) {
    return `${explicitRef.trim()}:${amount.toFixed(2)}`;
  }
  const key = `${txDate}|${amount.toFixed(2)}|${payee.toLowerCase().trim()}|${notes
    .toLowerCase()
    .trim()
    .slice(0, 80)}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `auto-${txDate}-${(hash >>> 0).toString(16)}`;
}

function parseCamtXml(xmlText: string, defaultAccountName: string): BankStatementParseResult {
  const transactions: ParsedTransactionInput[] = [];
  let detectedClosingBalance: number | null = null;

  // Extract Closing Balance (<Bal>...<ClsgBkBal> or <PRCD>/<CLBD>)
  const balBlocks = xmlText.match(/<Bal[\s\S]*?<\/Bal>/gi) || [];
  for (const blk of balBlocks) {
    if (/CLBD|ITBD|PRCD/i.test(blk)) {
      const amtMatch = blk.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
      const indMatch = blk.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
      if (amtMatch) {
        const val = parseEuroAmount(amtMatch[1]);
        const isDbt = indMatch && /DBIT/i.test(indMatch[1]);
        detectedClosingBalance = isDbt ? -Math.abs(val) : Math.abs(val);
      }
    }
  }

  const ntryBlocks = xmlText.match(/<Ntry[\s\S]*?<\/Ntry>/gi) || [];
  ntryBlocks.forEach((ntry, idx) => {
    const amtMatch = ntry.match(/<Amt[^>]*>([^<]+)<\/Amt>/i);
    const indMatch = ntry.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/i);
    const dtMatch =
      ntry.match(/<BookgDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i) ||
      ntry.match(/<ValDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i);
    const ustrdMatch = ntry.match(/<Ustrd>([^<]+)<\/Ustrd>/i);
    const nmMatches = Array.from(ntry.matchAll(/<Nm>([^<]+)<\/Nm>/gi)).map((m) => m[1].trim());
    const refMatch = ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i);

    if (!amtMatch) return;
    const rawAmt = parseEuroAmount(amtMatch[1]);
    const isDebit = indMatch && /DBIT/i.test(indMatch[1]);
    const signedAmt = isDebit ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    if (Math.abs(signedAmt) < 0.005) return;

    const txDate = dtMatch ? normalizeDateString(dtMatch[1]) : new Date().toISOString().slice(0, 10);
    const rawNotes = (ustrdMatch ? ustrdMatch[1] : '').trim();
    const rawPayee = nmMatches[0] || '';
    const payee = normalizePayeeName(rawPayee, rawNotes);
    const category = autoCategorizeTransaction(payee, rawNotes, signedAmt);
    const isRecurring = detectRecurringFlag(payee, rawNotes, category);
    const txRef = computeTransactionRef(
      txDate,
      signedAmt,
      payee,
      rawNotes,
      refMatch ? refMatch[1] : `camt-${idx}`
    );

    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(signedAmt.toFixed(2)),
      account: defaultAccountName,
      is_recurring: isRecurring,
      notes: rawNotes.slice(0, 180),
      tx_ref: txRef,
    });
  });

  return {
    format: 'CAMT.053',
    transactions,
    detectedAccountName: defaultAccountName,
    detectedClosingBalance,
  };
}

function parseMt940Text(text: string, defaultAccountName: string): BankStatementParseResult {
  const transactions: ParsedTransactionInput[] = [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  let detectedClosingBalance: number | null = null;
  const balMatch = normalized.match(/:62[FM]:([CD])(\d{6})([A-Z]{3})([\d,]+)/i);
  if (balMatch) {
    const val = parseEuroAmount(balMatch[4]);
    detectedClosingBalance = balMatch[1].toUpperCase() === 'D' ? -Math.abs(val) : Math.abs(val);
  }

  const regex61 =
    /:61:([^\n]+)(?:\n([^:][^\n]*))*\n?(?::86:([\s\S]*?)(?=\n:\d{2}[A-Z]?:|\n-\}|\n$|$))?/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex61.exec(normalized)) !== null) {
    const line61 = match[1].trim();
    const raw86 = (match[3] || '').replace(/\n/g, '');
    const m61 = line61.match(/^(\d{6})(?:\d{4})?(R?[CD])([A-Z]?)(\d+[,.]\d{0,2})/i);
    if (!m61) continue;

    const txDate = normalizeDateString(m61[1]);
    const isDebit = m61[2].toUpperCase().endsWith('D');
    const rawAmt = parseEuroAmount(m61[4]);
    const signedAmt = isDebit ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    if (Math.abs(signedAmt) < 0.005) continue;

    let notes = raw86;
    let rawPayee = '';
    if (raw86.includes('?')) {
      const subfields = raw86.split('?');
      const purposeParts: string[] = [];
      const nameParts: string[] = [];
      for (const sf of subfields) {
        const code = sf.slice(0, 2);
        const val = sf.slice(2).trim();
        if (code >= '20' && code <= '29') purposeParts.push(val);
        else if (code === '32' || code === '33') nameParts.push(val);
      }
      notes = purposeParts.join(' ').trim();
      rawPayee = nameParts.join(' ').trim();
    }

    const payee = normalizePayeeName(rawPayee, notes);
    const category = autoCategorizeTransaction(payee, notes, signedAmt);
    const isRecurring = detectRecurringFlag(payee, notes, category);
    const txRef = computeTransactionRef(txDate, signedAmt, payee, notes, `mt940-${idx++}`);

    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(signedAmt.toFixed(2)),
      account: defaultAccountName,
      is_recurring: isRecurring,
      notes: notes.slice(0, 180),
      tx_ref: txRef,
    });
  }

  return {
    format: 'MT940',
    transactions,
    detectedAccountName: defaultAccountName,
    detectedClosingBalance,
  };
}

export function parseBankStatementContent(
  rawText: string,
  defaultAccountName = 'Girokonto'
): BankStatementParseResult {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { format: 'CSV', transactions: [] };
  }

  if (trimmed.startsWith('<?xml') || /<BkToCstmr|<Ntry>/i.test(trimmed)) {
    return parseCamtXml(trimmed, defaultAccountName);
  }

  if (trimmed.includes(':61:') && (trimmed.includes(':20:') || trimmed.includes(':86:'))) {
    return parseMt940Text(trimmed, defaultAccountName);
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.transactions || parsed.bookings || parsed.rows || [];
      if (Array.isArray(list)) {
        const transactions: ParsedTransactionInput[] = [];
        for (const item of list) {
          const amt = parseEuroAmount(item.amount ?? item.betrag ?? 0);
          if (Math.abs(amt) < 0.005) continue;
          const txDate = normalizeDateString(item.tx_date || item.date || item.buchungsdatum || '');
          const rawPayee = String(item.payee || item.counterparty || item.partnername || '');
          const notes = String(item.notes || item.description || item.verwendungszweck || '');
          const payee = normalizePayeeName(rawPayee, notes);
          const category =
            item.category || autoCategorizeTransaction(payee, notes, amt);
          const isRecurring =
            item.is_recurring !== undefined
              ? Number(Boolean(item.is_recurring))
              : detectRecurringFlag(payee, notes, category);
          const txRef = computeTransactionRef(
            txDate,
            amt,
            payee,
            notes,
            String(item.ref || item.tx_ref || '')
          );
          transactions.push({
            tx_date: txDate,
            payee,
            category,
            amount: Number(amt.toFixed(2)),
            account: String(item.account || defaultAccountName),
            is_recurring: isRecurring,
            notes: notes.slice(0, 180),
            tx_ref: txRef,
          });
        }
        return {
          format: 'JSON',
          transactions,
          detectedAccountName: defaultAccountName,
          detectedClosingBalance:
            typeof parsed.closingBalance === 'number' ? parsed.closingBalance : null,
        };
      }
    } catch {
      // Fallback to CSV
    }
  }

  const { headers, rows } = parseCsv(trimmed);
  if (headers.length === 0 || rows.length === 0) {
    return { format: 'CSV', transactions: [] };
  }

  const findIdx = (patterns: RegExp[]) =>
    headers.findIndex((h) => patterns.some((p) => p.test(h)));

  const accountIdx = findIdx([/^eigener_kontoname$|^eigener kontoname$|^account$/i]);
  const ownIbanIdx = findIdx([/^eigene_iban$|^eigene iban$/i]);
  const dateIdx = Math.max(0, findIdx([/buchungsdatum|date|datum|buchungstag|valuta/i]));
  const payeeIdx = findIdx([/partnername|payee|empfaenger|auftraggeber|merchant|title/i]);
  const detailsIdx = findIdx([
    /buchungs_details|buchungs-details|buchungstext|description|verwendungszweck/i,
  ]);
  const payRefIdx = findIdx([/zahlungsreferenz|notiz/i]);
  const bookingRefIdx = findIdx([/buchungsreferenz|reference_id|tx_ref/i]);
  const mandateIdx = findIdx([/mandats_id|mandats id|creditor_id|creditor id/i]);
  const amountIdx = findIdx([/^betrag$|amount|umsatz|wert|summe/i]);
  const balanceIdx = findIdx([/^kontostand$|^saldo$|^balance$/i]);
  const catIdx = findIdx([/category|kategorie/i]);

  let detectedAccountName = defaultAccountName;
  let detectedIban: string | undefined;
  let detectedClosingBalance: number | null = null;

  const transactions: ParsedTransactionInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (balanceIdx >= 0 && detectedClosingBalance === null && row[balanceIdx]?.trim()) {
      const bal = parseEuroAmount(row[balanceIdx]);
      if (bal !== 0) detectedClosingBalance = bal;
    }

    const rawDate = row[dateIdx] || '';
    const rawAmt = amountIdx >= 0 ? row[amountIdx] || '0' : row[row.length - 1] || '0';
    const amt = parseEuroAmount(rawAmt);
    if (Math.abs(amt) < 0.005) continue;

    const partner = payeeIdx >= 0 ? (row[payeeIdx] || '').trim() : '';
    const details = detailsIdx >= 0 ? (row[detailsIdx] || '').trim() : '';
    const payRef = payRefIdx >= 0 ? (row[payRefIdx] || '').trim() : '';
    const bookingRef = bookingRefIdx >= 0 ? (row[bookingRefIdx] || '').trim() : '';
    const mandate = mandateIdx >= 0 ? (row[mandateIdx] || '').trim() : '';
    const acct =
      (accountIdx >= 0 && row[accountIdx]?.trim()) || defaultAccountName.trim() || 'Girokonto';

    if (accountIdx >= 0 && row[accountIdx]?.trim()) {
      detectedAccountName = row[accountIdx].trim();
    }
    if (ownIbanIdx >= 0 && row[ownIbanIdx]?.trim() && !detectedIban) {
      detectedIban = row[ownIbanIdx].trim();
    }

    const notes = [details, payRef].filter(Boolean).join(' • ').slice(0, 180);
    const payee = normalizePayeeName(partner, notes);
    const txDate = normalizeDateString(rawDate);
    const explicitCat = catIdx >= 0 ? (row[catIdx] || '').trim() : '';
    const category = explicitCat || autoCategorizeTransaction(payee, notes, amt);
    const isRecurring = detectRecurringFlag(payee, notes, category, Boolean(mandate));
    const txRef = computeTransactionRef(txDate, amt, payee, notes, bookingRef);

    transactions.push({
      tx_date: txDate,
      payee,
      category,
      amount: Number(amt.toFixed(2)),
      account: acct,
      is_recurring: isRecurring,
      notes,
      tx_ref: txRef,
    });
  }

  return {
    format: 'CSV',
    transactions,
    detectedAccountName,
    detectedIban,
    detectedClosingBalance,
  };
}
