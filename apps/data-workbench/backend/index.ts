import { defineThassiApp } from '@thassi/sdk';

interface NoteItem {
  id: number;
  title: string;
  category: string;
  content: string;
  created_at: string;
}

const SAMPLE_FINANCE_CSV = `Date;Description;Category;Amount_EUR;Account
2026-10-01;Salary October;Income;3450,00;Checking
2026-10-03;REWE Supermarket;Groceries;-84,50;Checking
2026-10-05;Stadtwerke Electricity;Utilities;-115,00;Checking
2026-10-07;Weekly Meal Prep Market;Groceries;-62,30;Checking
2026-10-10;Fitness Studio Membership;Health;-39,90;Checking
2026-10-12;Index ETF Savings Plan;Investments;-500,00;Brokerage
2026-10-15;Bio Market Groceries;Groceries;-48,20;Checking
2026-10-17;Pharmacy & Supplements;Health;-24,80;Checking`;

export default defineThassiApp((ctx) => {
  // 1. Initialize persistent SQLite schema for this app
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Seed initial welcome note if table is empty
  const existingCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notes')?.cnt ?? 0;
  if (existingCount === 0) {
    const now = new Date().toISOString();
    ctx.db.execute(
      'INSERT INTO notes (title, category, content, created_at) VALUES (?, ?, ?, ?)',
      [
        'Welcome to Thassi Data Workbench',
        'general',
        'This note is stored in your persistent /data/apps/data-workbench.db SQLite database. Try importing a CSV or publishing a sensor to Home Assistant!',
        now,
      ]
    );
    ctx.db.execute(
      'INSERT INTO notes (title, category, content, created_at) VALUES (?, ?, ?, ?)',
      [
        'Sunday Meal Prep Idea',
        'meals',
        'Roasted salmon bowls with quinoa, steamed broccoli, and tahini dressing (approx. 650 kcal, 45g protein).',
        now,
      ]
    );
  }

  // 2. Custom API Routes (/api/apps/data-workbench/*)
  ctx.route('GET', '/notes', (_req, { db }) => {
    const notes = db.query<NoteItem>('SELECT * FROM notes ORDER BY id DESC');
    return { notes };
  });

  ctx.route('POST', '/notes', (req, { db }) => {
    const body = (req.body || {}) as Partial<NoteItem>;
    if (!body.title || !body.content) {
      return { status: 400, body: { error: 'Both title and content are required' } };
    }
    const createdAt = new Date().toISOString();
    const res = db.execute(
      'INSERT INTO notes (title, category, content, created_at) VALUES (?, ?, ?, ?)',
      [body.title.trim(), (body.category || 'general').trim(), body.content.trim(), createdAt]
    );
    return {
      note: {
        id: res.lastInsertRowid,
        title: body.title.trim(),
        category: (body.category || 'general').trim(),
        content: body.content.trim(),
        created_at: createdAt,
      },
    };
  });

  ctx.route('DELETE', '/notes', (req, { db }) => {
    const id = Number(req.query.id);
    if (!id) {
      return { status: 400, body: { error: 'Missing ?id parameter' } };
    }
    db.execute('DELETE FROM notes WHERE id = ?', [id]);
    return { deleted: id };
  });

  // Load sample European-formatted financial dataset into SQLite for instant testing
  ctx.route('POST', '/seed-sample-csv', (_req, { db }) => {
    const result = db.importCsvToTable('finance_october', SAMPLE_FINANCE_CSV, {
      replaceTable: true,
      parseEuropeanDecimals: true,
    });
    const summary = db.summarizeTable('finance_october');
    const byCategory = db.query<{ category: string; total: number; tx_count: number }>(
      `SELECT category, ROUND(SUM(amount_eur), 2) as total, COUNT(*) as tx_count
       FROM finance_october
       GROUP BY category
       ORDER BY total ASC`
    );
    return { result, summary, byCategory };
  });

  // 3. Scheduled Background Job (runs every 30 mins and can be triggered manually in the UI)
  ctx.scheduleJob({
    id: 'sync-workbench-metrics',
    name: 'Sync Workbench Metrics to Home Assistant',
    description: 'Counts notes & datasets in SQLite and publishes sensor.thassi_data_workbench_notes_count to Home Assistant.',
    intervalMinutes: 30,
    runOnStart: false,
    handler: async () => {
      const noteCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notes')?.cnt ?? 0;
      const tables = ctx.db.listTables();
      const status = await ctx.ha.getStatus();

      if (status.connected) {
        await ctx.ha.publishSensor('notes_count', noteCount, {
          friendly_name: 'Thassi Workbench Notes',
          unit_of_measurement: 'notes',
          icon: 'mdi:notebook-check',
          sqlite_tables: tables,
        });
        return `Published sensor.thassi_data_workbench_notes_count = ${noteCount} (${tables.length} tables)`;
      }
      return `SQLite has ${noteCount} notes across ${tables.length} tables (HA token not configured yet, skipped sensor publish)`;
    },
  });
});
