import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface CsvImportOptions {
  /** Override auto-detected delimiter (',' or ';' or '\t') */
  delimiter?: string;
  /** Drop and recreate the table before importing */
  replaceTable?: boolean;
  /** Convert European decimal commas (e.g. "1.234,56" or "-45,90") in numeric columns to floats */
  parseEuropeanDecimals?: boolean;
}

export interface CsvImportResult {
  tableName: string;
  columns: { name: string; type: 'INTEGER' | 'REAL' | 'TEXT' }[];
  insertedRows: number;
  delimiterUsed: string;
}

export interface TableColumnSummary {
  name: string;
  type: string;
  nonNullCount: number;
  distinctCount: number;
  min?: number | string | null;
  max?: number | string | null;
  sum?: number | null;
  avg?: number | null;
}

export interface TableSummary {
  tableName: string;
  rowCount: number;
  columns: TableColumnSummary[];
}

/**
 * Robust CSV parser supporting RFC-4180 quotes and auto-detection of ',' vs ';' vs '\t'
 * (Especially useful for German/European financial bank exports).
 */
export function parseCsv(csvText: string, explicitDelimiter?: string): {
  headers: string[];
  rows: string[][];
  delimiter: string;
} {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return { headers: [], rows: [], delimiter: explicitDelimiter || ',' };
  }

  const firstLine = normalized.split('\n')[0] || '';
  const delimiter =
    explicitDelimiter ||
    (firstLine.split(';').length > firstLine.split(',').length
      ? ';'
      : firstLine.split('\t').length > firstLine.split(',').length
        ? '\t'
        : ',');

  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== '')) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      parsedRows.push(currentRow);
    }
  }

  if (parsedRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const headers = parsedRows[0].map((h, idx) => sanitizeIdentifier(h || `col_${idx + 1}`, idx));
  const rows = parsedRows.slice(1);
  return { headers, rows, delimiter };
}

export function sanitizeIdentifier(raw: string, fallbackIndex = 0): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `col_${cleaned || fallbackIndex}`;
  }
  return cleaned;
}

function parsePotentialNumber(val: string, parseEuropeanDecimals: boolean): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  if (parseEuropeanDecimals) {
    // Handle European decimal formats with or without thousand-separator dots (e.g. "3450,00", "1.234,56", "-45,90")
    if (
      (/^-?\d+,\d+$/.test(trimmed) || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) &&
      trimmed.includes(',')
    ) {
      const normalized = trimmed.replace(/\./g, '').replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export class ThassiAppDatabase {
  public readonly raw: DatabaseSync;
  public readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.raw = this.openWithAutoRecovery(dbPath);
  }

  private openWithAutoRecovery(dbPath: string): DatabaseSync {
    try {
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS _thassi_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      // Quick integrity probe on _thassi_kv
      db.prepare('SELECT COUNT(*) FROM _thassi_kv').get();
      return db;
    } catch {
      try {
        for (const suffix of ['', '-wal', '-shm']) {
          if (fs.existsSync(dbPath + suffix)) {
            fs.rmSync(dbPath + suffix, { force: true });
          }
        }
      } catch {}
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS _thassi_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    }
  }

  /** Execute raw DDL or multi-statement SQL */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /** Run a SELECT query and return typed rows */
  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.raw.prepare(sql);
    return stmt.all(...(params as [ string ])) as unknown as T[];
  }

  /** Run a SELECT query and return the first row or undefined */
  queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.raw.prepare(sql);
    return stmt.get(...(params as [ string ])) as unknown as T | undefined;
  }

  /** Run an INSERT / UPDATE / DELETE statement */
  execute(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.raw.prepare(sql);
    const res = stmt.run(...(params as [ string ]));
    return {
      changes: Number(res.changes),
      lastInsertRowid: res.lastInsertRowid,
    };
  }

  /** Key-Value convenience store for app settings, cursors, or state */
  kvGet<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const row = this.queryOne<{ value: string }>(
      'SELECT value FROM _thassi_kv WHERE key = ?',
      [key]
    );
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  kvSet<T = unknown>(key: string, value: T): void {
    this.execute(
      `INSERT INTO _thassi_kv (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()]
    );
  }

  kvDelete(key: string): void {
    this.execute('DELETE FROM _thassi_kv WHERE key = ?', [key]);
  }

  /**
   * Import CSV text directly into a SQLite table with automatic column type inference.
   * Ideal for bank statement exports, Google Health exports, or custom datasets.
   */
  importCsvToTable(
    rawTableName: string,
    csvText: string,
    options: CsvImportOptions = {}
  ): CsvImportResult {
    const tableName = sanitizeIdentifier(rawTableName);
    const parseEuro = options.parseEuropeanDecimals ?? true;
    const { headers, rows, delimiter } = parseCsv(csvText, options.delimiter);

    if (headers.length === 0) {
      throw new Error('CSV contains no headers or rows');
    }

    // Deduplicate headers if needed
    const seen = new Map<string, number>();
    const uniqueHeaders = headers.map((h) => {
      const count = seen.get(h) || 0;
      seen.set(h, count + 1);
      return count === 0 ? h : `${h}_${count + 1}`;
    });

    // Infer column types across non-empty values
    const columns = uniqueHeaders.map((name, colIdx) => {
      let allIntegers = true;
      let allNumbers = true;
      let hasNonEmpty = false;

      for (const row of rows) {
        const rawVal = (row[colIdx] ?? '').trim();
        if (!rawVal) continue;
        hasNonEmpty = true;
        const num = parsePotentialNumber(rawVal, parseEuro);
        if (num === null) {
          allNumbers = false;
          allIntegers = false;
          break;
        }
        if (!Number.isInteger(num)) {
          allIntegers = false;
        }
      }

      const type: 'INTEGER' | 'REAL' | 'TEXT' = !hasNonEmpty
        ? 'TEXT'
        : allIntegers
          ? 'INTEGER'
          : allNumbers
            ? 'REAL'
            : 'TEXT';
      return { name, type };
    });

    if (options.replaceTable !== false) {
      this.exec(`DROP TABLE IF EXISTS "${tableName}";`);
    }

    const colDefs = columns.map((c) => `"${c.name}" ${c.type}`).join(', ');
    this.exec(
      `CREATE TABLE IF NOT EXISTS "${tableName}" (_id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs});`
    );

    const placeholders = columns.map(() => '?').join(', ');
    const colNames = columns.map((c) => `"${c.name}"`).join(', ');
    const insertStmt = this.raw.prepare(
      `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`
    );

    let insertedRows = 0;
    this.exec('BEGIN TRANSACTION;');
    try {
      for (const row of rows) {
        const values = columns.map((col, idx) => {
          const rawVal = (row[idx] ?? '').trim();
          if (!rawVal) return null;
          if (col.type === 'INTEGER' || col.type === 'REAL') {
            return parsePotentialNumber(rawVal, parseEuro);
          }
          return rawVal;
        });
        insertStmt.run(...(values as [ string ]));
        insertedRows++;
      }
      this.exec('COMMIT;');
    } catch (err) {
      this.exec('ROLLBACK;');
      throw err;
    }

    return {
      tableName,
      columns,
      insertedRows,
      delimiterUsed: delimiter,
    };
  }

  /** List all user tables in this database */
  listTables(): string[] {
    const rows = this.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_thassi_%' ORDER BY name`
    );
    return rows.map((r) => r.name);
  }

  /** Compute analytical summary (counts, min, max, sum, avg) for any table */
  summarizeTable(rawTableName: string): TableSummary {
    const tableName = sanitizeIdentifier(rawTableName);
    const countRow = this.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
    const rowCount = countRow?.cnt ?? 0;

    const pragmaCols = this.query<{ name: string; type: string }>(
      `PRAGMA table_info("${tableName}")`
    );

    const columns: TableColumnSummary[] = pragmaCols
      .filter((c) => c.name !== '_id')
      .map((col) => {
        const isNumeric = col.type === 'INTEGER' || col.type === 'REAL';
        if (isNumeric) {
          const stats = this.queryOne<{
            nonNull: number;
            distinctCnt: number;
            minVal: number | null;
            maxVal: number | null;
            sumVal: number | null;
            avgVal: number | null;
          }>(
            `SELECT 
              COUNT("${col.name}") as nonNull,
              COUNT(DISTINCT "${col.name}") as distinctCnt,
              MIN("${col.name}") as minVal,
              MAX("${col.name}") as maxVal,
              SUM("${col.name}") as sumVal,
              AVG("${col.name}") as avgVal
             FROM "${tableName}"`
          );
          return {
            name: col.name,
            type: col.type,
            nonNullCount: stats?.nonNull ?? 0,
            distinctCount: stats?.distinctCnt ?? 0,
            min: stats?.minVal ?? null,
            max: stats?.maxVal ?? null,
            sum: stats?.sumVal !== null && stats?.sumVal !== undefined ? Number(stats.sumVal.toFixed(2)) : null,
            avg: stats?.avgVal !== null && stats?.avgVal !== undefined ? Number(stats.avgVal.toFixed(2)) : null,
          };
        } else {
          const stats = this.queryOne<{
            nonNull: number;
            distinctCnt: number;
            minVal: string | null;
            maxVal: string | null;
          }>(
            `SELECT 
              COUNT("${col.name}") as nonNull,
              COUNT(DISTINCT "${col.name}") as distinctCnt,
              MIN("${col.name}") as minVal,
              MAX("${col.name}") as maxVal
             FROM "${tableName}"`
          );
          return {
            name: col.name,
            type: col.type || 'TEXT',
            nonNullCount: stats?.nonNull ?? 0,
            distinctCount: stats?.distinctCnt ?? 0,
            min: stats?.minVal ?? null,
            max: stats?.maxVal ?? null,
          };
        }
      });

    return {
      tableName,
      rowCount,
      columns,
    };
  }
}
