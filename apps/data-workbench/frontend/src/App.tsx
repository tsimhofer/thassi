import React, { useEffect, useState } from 'react';
import {
  createAppClient,
  type TableSummary,
  type ThassiJobStatus,
  type HaConnectionStatus,
} from '@thassi/sdk/client';

const api = createAppClient('data-workbench');

interface NoteItem {
  id: number;
  title: string;
  category: string;
  content: string;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'csv' | 'notes' | 'ha'>('csv');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('meals');
  const [noteContent, setNoteContent] = useState('');

  // CSV & SQLite Analyzer state
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableSummary, setTableSummary] = useState<TableSummary | null>(null);
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [csvTableName, setCsvTableName] = useState('my_dataset');
  const [csvText, setCsvText] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM notes LIMIT 20;');
  const [sqlResult, setSqlResult] = useState<Record<string, unknown>[]>([]);

  // HA & Jobs state
  const [haStatus, setHaStatus] = useState<HaConnectionStatus | null>(null);
  const [jobs, setJobs] = useState<ThassiJobStatus[]>([]);
  const [sensorSlug, setSensorSlug] = useState('monthly_grocery_spend');
  const [sensorVal, setSensorVal] = useState('195.00');
  const [sensorUnit, setSensorUnit] = useState('EUR');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = async () => {
    try {
      const [notesRes, tablesRes, haRes, jobsRes] = await Promise.all([
        api.get<{ notes: NoteItem[] }>('/notes'),
        api.db.listTables(),
        api.ha.getStatus(),
        api.jobs.list(),
      ]);
      setNotes(notesRes.notes);
      setTables(tablesRes.tables);
      setHaStatus(haRes);
      setJobs(jobsRes.jobs);
      if (tablesRes.tables.length > 0 && !selectedTable) {
        await inspectTable(tablesRes.tables[0]);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const inspectTable = async (tbl: string) => {
    setSelectedTable(tbl);
    setSqlQuery(`SELECT * FROM "${tbl}" LIMIT 25;`);
    try {
      const [sum, rowsRes] = await Promise.all([
        api.db.summarizeTable(tbl),
        api.db.queryTable(tbl, 25),
      ]);
      setTableSummary(sum);
      setTableRows(rowsRes.rows);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleLoadSampleCsv = async () => {
    try {
      await api.post('/seed-sample-csv');
      showToast('Imported sample European Bank CSV into SQLite table "finance_october"!');
      const tablesRes = await api.db.listTables();
      setTables(tablesRes.tables);
      await inspectTable('finance_october');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportCustomCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    try {
      const res = await api.db.importCsv(csvTableName, csvText, true);
      showToast(`Imported ${res.insertedRows} rows into SQLite table "${res.tableName}"!`);
      setCsvText('');
      const tablesRes = await api.db.listTables();
      setTables(tablesRes.tables);
      await inspectTable(res.tableName);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRunSql = async () => {
    try {
      const res = await api.db.runSql(sqlQuery);
      setSqlResult(res.rows);
      showToast(`Returned ${res.rows.length} row(s)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    try {
      await api.post('/notes', {
        title: noteTitle,
        category: noteCategory,
        content: noteContent,
      });
      setNoteTitle('');
      setNoteContent('');
      showToast('Saved to SQLite!');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteNote = async (id: number) => {
    await api.delete(`/notes?id=${id}`);
    await loadAll();
  };

  const handlePublishSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.ha.publishSensor(sensorSlug, sensorVal, {
        unit_of_measurement: sensorUnit,
        friendly_name: `Thassi ${sensorSlug}`,
      });
      showToast(`Published ${res.entity_id} = ${res.state} ${sensorUnit} to Home Assistant!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTriggerJob = async (jobId: string) => {
    try {
      const res = await api.jobs.trigger(jobId);
      showToast(res.job.lastResult || res.job.lastError || 'Job finished');
      const jobsRes = await api.jobs.list();
      setJobs(jobsRes.jobs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>
            Personal Data Workbench
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 14 }}>
            Full-Stack TypeScript App • Persistent SQLite (`/data/apps/data-workbench.db`) • Home Assistant Bridge
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['csv', 'notes', 'ha'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: activeTab === tab ? '#38bdf8' : '#334155',
                background: activeTab === tab ? '#0284c7' : '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {tab === 'csv' && '📊 CSV & SQLite Analyzer'}
              {tab === 'notes' && `📝 Notes & Meal Log (${notes.length})`}
              {tab === 'ha' && '🏠 Home Assistant & Cron Jobs'}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0369a1',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {activeTab === 'csv' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>1. Import CSV Dataset</h3>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              Automatically detects `,` or `;` delimiters and European decimal formats (`1.234,56`) for bank or health exports.
            </p>
            <button onClick={handleLoadSampleCsv} style={{ ...btnPrimary, width: '100%', marginBottom: 16 }}>
              ⚡ Load Sample Bank Statement CSV
            </button>

            <form onSubmit={handleImportCustomCsv}>
              <label style={labelStyle}>Target SQLite Table Name</label>
              <input
                value={csvTableName}
                onChange={(e) => setCsvTableName(e.target.value)}
                style={inputStyle}
                placeholder="e.g. finance_2026 or health_sleep"
              />
              <label style={labelStyle}>Paste CSV Content</label>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                style={inputStyle}
                placeholder="Date;Category;Amount&#10;2026-10-18;Groceries;-42,50"
              />
              <button type="submit" style={{ ...btnSecondary, width: '100%' }}>
                Import CSV into SQLite
              </button>
            </form>

            <hr style={{ borderColor: '#334155', margin: '20px 0' }} />
            <h4 style={{ margin: '0 0 8px' }}>Tables in Database ({tables.length})</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tables.map((t) => (
                <button
                  key={t}
                  onClick={() => inspectTable(t)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #38bdf8',
                    background: selectedTable === t ? '#0284c7' : 'transparent',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {tableSummary && (
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>
                  Table Summary: <code>{tableSummary.tableName}</code> ({tableSummary.rowCount} rows)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Column</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Distinct</th>
                        <th style={thStyle}>Min</th>
                        <th style={thStyle}>Max</th>
                        <th style={thStyle}>Sum</th>
                        <th style={thStyle}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableSummary.columns.map((c) => (
                        <tr key={c.name}>
                          <td style={tdStyle}>
                            <strong>{c.name}</strong>
                          </td>
                          <td style={tdStyle}>
                            <code>{c.type}</code>
                          </td>
                          <td style={tdStyle}>{c.distinctCount}</td>
                          <td style={tdStyle}>{String(c.min ?? '-')}</td>
                          <td style={tdStyle}>{String(c.max ?? '-')}</td>
                          <td style={tdStyle}>{c.sum !== undefined && c.sum !== null ? c.sum : '-'}</td>
                          <td style={tdStyle}>{c.avg !== undefined && c.avg !== null ? c.avg : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Interactive SQL Query Runner</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0, fontFamily: 'monospace' }}
                />
                <button onClick={handleRunSql} style={btnPrimary}>
                  Run SQL
                </button>
              </div>

              {(sqlResult.length > 0 ? sqlResult : tableRows).length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: 320 }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {Object.keys((sqlResult.length > 0 ? sqlResult : tableRows)[0]).map((k) => (
                          <th key={k} style={thStyle}>
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(sqlResult.length > 0 ? sqlResult : tableRows).map((r, i) => (
                        <tr key={i}>
                          {Object.values(r).map((v, j) => (
                            <td key={j} style={tdStyle}>
                              {String(v ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <form onSubmit={handleAddNote} style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>New Note / Meal Plan Entry</h3>
            <label style={labelStyle}>Title</label>
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Wednesday Dinner or Budget Note"
            />
            <label style={labelStyle}>Category</label>
            <select
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value)}
              style={inputStyle}
            >
              <option value="meals">🍲 Meals & Nutrition</option>
              <option value="finance">💶 Finance</option>
              <option value="health">🏃 Health & Fitness</option>
              <option value="calendar">📅 Calendar</option>
              <option value="general">📌 General Note</option>
            </select>
            <label style={labelStyle}>Content</label>
            <textarea
              rows={4}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              style={inputStyle}
              placeholder="Write details..."
            />
            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Save Entry to SQLite
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notes.map((n) => (
              <div
                key={n.id}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: '#0284c7',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    {n.category}
                  </span>
                  <h4 style={{ margin: '0 0 6px' }}>{n.title}</h4>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14 }}>{n.content}</p>
                </div>
                <button
                  onClick={() => handleDeleteNote(n.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ha' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Publish Custom Sensor to Home Assistant</h3>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              Status:{' '}
              <strong style={{ color: haStatus?.connected ? '#4ade80' : '#facc15' }}>
                {haStatus?.message || 'Checking...'}
              </strong>
            </p>
            <form onSubmit={handlePublishSensor}>
              <label style={labelStyle}>Sensor Slug (creates `sensor.thassi_data_workbench_&lt;slug&gt;`)</label>
              <input
                value={sensorSlug}
                onChange={(e) => setSensorSlug(e.target.value)}
                style={inputStyle}
              />
              <label style={labelStyle}>State Value</label>
              <input
                value={sensorVal}
                onChange={(e) => setSensorVal(e.target.value)}
                style={inputStyle}
              />
              <label style={labelStyle}>Unit of Measurement</label>
              <input
                value={sensorUnit}
                onChange={(e) => setSensorUnit(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={btnPrimary}>
                Publish Sensor to Home Assistant
              </button>
            </form>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Background Cron Jobs</h3>
            {jobs.map((j) => (
              <div
                key={j.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#0f172a',
                  border: '1px solid #334155',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{j.name}</strong>
                  <button onClick={() => handleTriggerJob(j.id)} style={btnSecondary}>
                    ▶ Run Now
                  </button>
                </div>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0' }}>{j.description}</p>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Every {j.intervalMinutes}m • Runs: {j.runCount} • Status: <code>{j.status}</code>
                  {j.lastResult && <div>Last result: {j.lastResult}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 20,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #38bdf8',
  background: 'transparent',
  color: '#38bdf8',
  fontWeight: 600,
  cursor: 'pointer',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #334155',
  color: '#94a3b8',
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #0f172a',
};
