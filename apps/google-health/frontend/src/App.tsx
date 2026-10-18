import React, { useEffect, useState } from 'react';
import { createAppClient, type GoogleOAuthStatus } from '@thassi/sdk/client';

const api = createAppClient('google-health');

interface BiometricDayRow {
  log_date: string;
  steps: number;
  step_goal: number;
  current_hr: number;
  resting_hr: number;
  sleep_hours: number;
  active_calories: number;
  weight_kg: number;
  readiness_score: number;
  source: string;
  updated_at: string;
}

interface WorkoutOption {
  id: number;
  title: string;
  category: 'strength' | 'cardio' | 'hiit' | 'recovery';
  intensity: 'low' | 'moderate' | 'high';
  min_readiness: number;
  duration_min: number;
  target_hr_zone: string;
  est_calories: number;
  exercisesList: string[];
  description: string;
}

interface WorkoutLogRow {
  id: number;
  workout_date: string;
  title: string;
  category: string;
  duration_min: number;
  avg_hr: number;
  calories_burned: number;
  rpe_load: number;
  notes: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'workouts' | 'history'>('overview');
  const [today, setToday] = useState<BiometricDayRow | null>(null);
  const [readiness, setReadiness] = useState<{
    score: number;
    status: string;
    recommendation: string;
  } | null>(null);
  const [hrZone, setHrZone] = useState<{ zone: string; color: string }>({
    zone: 'Zone 1',
    color: '#38bdf8',
  });
  const [baselineRhr, setBaselineRhr] = useState<number>(0);
  const [hrvMs, setHrvMs] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [floors, setFloors] = useState<number | null>(null);
  const [respiratoryRate, setRespiratoryRate] = useState<number | null>(null);
  const [haConnected, setHaConnected] = useState<boolean>(false);
  const [pixelWatchBattery, setPixelWatchBattery] = useState<number | null>(null);
  const [history, setHistory] = useState<BiometricDayRow[]>([]);
  const [workoutOptions, setWorkoutOptions] = useState<WorkoutOption[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogRow[]>([]);
  const [mealPlannerToday, setMealPlannerToday] = useState<{
    dinner: string | null;
    totalCalories: number;
    totalProtein: number;
  } | null>(null);
  const [googleOAuth, setGoogleOAuth] = useState<GoogleOAuthStatus | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('recommended');
  const [toast, setToast] = useState<string | null>(null);

  // Quick Biometrics Adjust Form
  const [editSteps, setEditSteps] = useState('');
  const [editHr, setEditHr] = useState('');
  const [editRhr, setEditRhr] = useState('');
  const [editSleep, setEditSleep] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDashboard = async () => {
    const data = await api.get<{
      today: BiometricDayRow;
      readiness: { score: number; status: string; recommendation: string };
      hrZone: { zone: string; color: string };
      baselineRhr: number;
      hrvMs?: number | null;
      distanceKm?: number | null;
      floors?: number | null;
      respiratoryRate?: number | null;
      haConnected?: boolean;
      pixelWatchBattery: number | null;
      history: BiometricDayRow[];
      workoutOptions: WorkoutOption[];
      workoutLogs: WorkoutLogRow[];
      mealPlannerToday: { dinner: string | null; totalCalories: number; totalProtein: number } | null;
      googleOAuth: GoogleOAuthStatus;
    }>('/dashboard');

    setToday(data.today);
    setReadiness(data.readiness);
    setHrZone(data.hrZone);
    setBaselineRhr(data.baselineRhr);
    setHrvMs(data.hrvMs ?? null);
    setDistanceKm(data.distanceKm ?? null);
    setFloors(data.floors ?? null);
    setRespiratoryRate(data.respiratoryRate ?? null);
    setHaConnected(Boolean(data.haConnected));
    setPixelWatchBattery(data.pixelWatchBattery);
    setHistory(data.history);
    setWorkoutOptions(data.workoutOptions);
    setWorkoutLogs(data.workoutLogs);
    setMealPlannerToday(data.mealPlannerToday);
    setGoogleOAuth(data.googleOAuth);

    setEditSteps(String(data.today.steps));
    setEditHr(String(data.today.current_hr));
    setEditRhr(String(data.today.resting_hr));
    setEditSleep(String(data.today.sleep_hours));
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleUpdateBiometrics = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/biometrics', {
      steps: Number(editSteps),
      current_hr: Number(editHr),
      resting_hr: Number(editRhr),
      sleep_hours: Number(editSleep),
    });
    notify('Updated biometrics, recalculated Readiness Score, and synced to Home Assistant!');
    await loadDashboard();
  };

  const handleLogWorkout = async (opt: WorkoutOption) => {
    await api.post('/workouts/log', {
      title: opt.title,
      category: opt.category,
      duration_min: opt.duration_min,
      avg_hr: opt.intensity === 'high' ? 152 : opt.intensity === 'moderate' ? 135 : 108,
      calories_burned: opt.est_calories,
      rpe_load: opt.intensity === 'high' ? 8 : opt.intensity === 'moderate' ? 6 : 3,
      notes: `Completed ${opt.duration_min}m ${opt.category} session (${opt.target_hr_zone})`,
    });
    notify(`Logged "${opt.title}" (+${opt.est_calories} kcal active burn) & updated HA sensors!`);
    await loadDashboard();
  };

  const score = readiness?.score ?? 0;
  const readinessColor =
    score >= 80 ? '#4ade80' : score >= 65 ? '#38bdf8' : score >= 50 ? '#facc15' : '#f43f5e';
  const stepPct = today && today.step_goal > 0 ? Math.min(100, Math.round((today.steps / today.step_goal) * 100)) : 0;

  const filteredWorkouts = workoutOptions.filter((w) => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'recommended') return score >= w.min_readiness;
    return w.category === categoryFilter;
  });

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px' }}>
      {/* Header */}
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
            ❤️ Google Health, Biometrics & Readiness
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            HA Connection:{' '}
            <strong style={{ color: haConnected ? '#4ade80' : '#f43f5e' }}>
              {haConnected ? 'Connected' : 'Disconnected'}
            </strong>{' '}
            • Source: <strong>{today?.source || 'No Data'}</strong>
            {pixelWatchBattery !== null && (
              <span>
                {' '}
                • ⌚ Pixel Watch: <strong>{pixelWatchBattery}%</strong>
              </span>
            )}
            <span>
              {' '}
              • ⚖️ Weight:{' '}
              <strong>{today?.weight_kg && today.weight_kg > 0 ? `${today.weight_kg} kg` : 'No data in Health Connect'}</strong>
            </span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={activeTab === 'overview' ? btnPrimary : btnTab}
          >
            ⚡ Readiness & Vitals
          </button>
          <button
            onClick={() => setActiveTab('workouts')}
            style={activeTab === 'workouts' ? btnPrimary : btnTab}
          >
            🏋️ Workout Options ({workoutOptions.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={activeTab === 'history' ? btnPrimary : btnTab}
          >
            📈 Biometrics & Logs ({workoutLogs.length})
          </button>
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0284c7',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {/* 4 Core Biometric Hero Cards: Readiness Score, Daily Steps, Current HR, Resting HR */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* 1. Readiness Score */}
        <div style={heroCard(readinessColor)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={heroLabel}>⚡ Readiness Score</span>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 99,
                background: `${readinessColor}22`,
                color: readinessColor,
                fontWeight: 700,
              }}
            >
              {readiness?.status || 'No Data'}
            </span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: readinessColor, margin: '8px 0 4px' }}>
            {score > 0 ? score : '—'}
            <span style={{ fontSize: 16, color: '#64748b', fontWeight: 500 }}>/100</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Sleep: <strong>{today?.sleep_hours ? `${today.sleep_hours}h` : 'No data'}</strong> • Resp:{' '}
            <strong>{respiratoryRate ? `${respiratoryRate} bpm` : '—'}</strong>
          </div>
        </div>

        {/* 2. Daily Steps */}
        <div style={heroCard('#38bdf8')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={heroLabel}>👟 Daily Steps</span>
            <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>{stepPct}%</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '8px 0 6px' }}>
            {today && today.steps > 0 ? today.steps.toLocaleString() : 'No data'}
            <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              {' '}
              / {(today?.step_goal ?? 10000).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Distance: <strong>{distanceKm ? `${distanceKm} km` : '—'}</strong> • Floors:{' '}
            <strong>{floors ?? '—'}</strong> • Burn: <strong>{today?.active_calories || '—'} kcal</strong>
          </div>
        </div>

        {/* 3. Current Heart Rate */}
        <div style={heroCard(hrZone.color)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={heroLabel}>❤️ Current Heart Rate</span>
            <span style={{ fontSize: 11, color: hrZone.color, fontWeight: 600 }}>Health Connect</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '8px 0 4px' }}>
            {today && today.current_hr > 0 ? today.current_hr : 'No data'}{' '}
            <span style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>bpm</span>
          </div>
          <div style={{ fontSize: 12, color: hrZone.color, fontWeight: 600 }}>{hrZone.zone}</div>
        </div>

        {/* 4. Resting Heart Rate (RHR) & HRV */}
        <div style={heroCard('#a855f7')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={heroLabel}>🌙 Resting HR & HRV</span>
            <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 600 }}>
              HRV: {hrvMs ? `${hrvMs} ms` : 'No data'}
            </span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '8px 0 4px' }}>
            {today && today.resting_hr > 0 ? today.resting_hr : 'No data'}{' '}
            <span style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>bpm</span>
          </div>
          <div style={{ fontSize: 12, color: '#4ade80' }}>
            {today && today.resting_hr > 0
              ? `7d baseline: ${baselineRhr} bpm`
              : 'Waiting for Health Connect RHR'}
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Coach Recommendation & Top Matched Workouts */}
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, color: readinessColor }}>
                🧠 Today&apos;s Physiological Readiness & Workout Guidance
              </h3>
              <p style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.5, margin: '0 0 16px' }}>
                {readiness?.recommendation}
              </p>

              <h4 style={{ margin: '0 0 10px', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>
                Recommended Workouts for Readiness {score}/100
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {workoutOptions
                  .filter((w) => score >= w.min_readiness)
                  .slice(0, 3)
                  .map((w) => (
                    <div
                      key={w.id}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc' }}>
                          {w.title}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          ⏱️ {w.duration_min} min • 🎯 {w.target_hr_zone} • 🔥 ~{w.est_calories} kcal
                        </div>
                      </div>
                      <button
                        onClick={() => void handleLogWorkout(w)}
                        style={{ ...btnPrimary, whiteSpace: 'nowrap', fontSize: 12 }}
                      >
                        ▶ Start / Log
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Cross-App Nutrition & Energy Balance with Meal Planner */}
            {mealPlannerToday && (
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0, color: '#fb923c' }}>
                  🍲 Nutrition & Energy Balance (Synced with Meal Planner)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ background: '#0f172a', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Planned Intake</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fb923c' }}>
                      {mealPlannerToday.totalCalories} kcal
                    </div>
                  </div>
                  <div style={{ background: '#0f172a', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Planned Protein</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>
                      {mealPlannerToday.totalProtein}g
                    </div>
                  </div>
                  <div style={{ background: '#0f172a', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Active Burn Today</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8' }}>
                      {today?.active_calories ?? 380} kcal
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Quick Biometrics Check-In & HA Sensor List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <form onSubmit={handleUpdateBiometrics} style={cardStyle}>
              <h3 style={{ marginTop: 0, color: '#38bdf8' }}>⚙️ Update Vitals / Check-In</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
                Adjusting these values immediately recalculates your Readiness Score and updates your Home Assistant sensors.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Daily Steps</label>
                  <input
                    type="number"
                    value={editSteps}
                    onChange={(e) => setEditSteps(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Current HR (bpm)</label>
                  <input
                    type="number"
                    value={editHr}
                    onChange={(e) => setEditHr(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Resting HR (bpm)</label>
                  <input
                    type="number"
                    value={editRhr}
                    onChange={(e) => setEditRhr(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Sleep Duration (h)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editSleep}
                    onChange={(e) => setEditSleep(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                Recalculate Readiness & Sync to HA
              </button>
            </form>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>🏠 Published Home Assistant Sensors</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <code>sensor.thassi_google_health_readiness_score</code>
                <code>sensor.thassi_google_health_daily_steps</code>
                <code>sensor.thassi_google_health_heart_rate</code>
                <code>sensor.thassi_google_health_resting_heart_rate</code>
                <code>sensor.thassi_google_health_weekly_workouts</code>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 0, marginTop: 10 }}>
                Google Fit OAuth:{' '}
                <strong style={{ color: googleOAuth?.authorized ? '#4ade80' : '#facc15' }}>
                  {googleOAuth?.authorized ? 'Connected' : 'Configure in Thassi Hub'}
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'workouts' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {[
              { id: 'recommended', label: `✨ Matched to Readiness (${score}/100)` },
              { id: 'all', label: 'All Workouts' },
              { id: 'strength', label: '🏋️ Strength' },
              { id: 'cardio', label: '🏃 Zone 2 Cardio' },
              { id: 'hiit', label: '🔥 HIIT / VO2 Max' },
              { id: 'recovery', label: '🧘 Recovery & Mobility' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id)}
                style={categoryFilter === f.id ? btnPrimary : btnTab}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 18,
            }}
          >
            {filteredWorkouts.map((w) => {
              const isOptimal = score >= w.min_readiness;
              return (
                <div
                  key={w.id}
                  style={{
                    ...cardStyle,
                    borderColor: isOptimal ? '#38bdf8' : '#334155',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: '#0f172a',
                          color: '#38bdf8',
                          fontWeight: 700,
                        }}
                      >
                        {w.category} • {w.intensity} intensity
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: isOptimal ? '#4ade80' : '#facc15',
                        }}
                      >
                        Min Readiness: {w.min_readiness}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>{w.title}</h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px' }}>
                      {w.description}
                    </p>

                    <div
                      style={{
                        fontSize: 12,
                        color: '#cbd5e1',
                        background: '#0f172a',
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ marginBottom: 6, color: '#38bdf8', fontWeight: 600 }}>
                        ⏱️ {w.duration_min} min • 🎯 {w.target_hr_zone} • 🔥 ~{w.est_calories} kcal
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {w.exercisesList.map((ex, i) => (
                          <li key={i} style={{ marginBottom: 3 }}>
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => void handleLogWorkout(w)}
                    style={{ ...btnPrimary, width: '100%' }}
                  >
                    ✓ Complete & Log Workout (+{w.est_calories} kcal)
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>📈 7-Day Biometrics & Readiness Trend</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Date</th>
                  <th style={{ padding: 8 }}>Readiness</th>
                  <th style={{ padding: 8 }}>Steps</th>
                  <th style={{ padding: 8 }}>RHR</th>
                  <th style={{ padding: 8 }}>Sleep</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.log_date} style={{ borderBottom: '1px solid #0f172a' }}>
                    <td style={{ padding: 8 }}>{h.log_date}</td>
                    <td style={{ padding: 8, fontWeight: 700, color: '#4ade80' }}>
                      {h.readiness_score}/100
                    </td>
                    <td style={{ padding: 8 }}>{h.steps.toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{h.resting_hr} bpm</td>
                    <td style={{ padding: 8 }}>{h.sleep_hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>🏋️ Completed Workout Log</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workoutLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    background: '#0f172a',
                    borderRadius: 10,
                    padding: 12,
                    border: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{log.title}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {log.workout_date} • {log.duration_min}m • Avg HR: {log.avg_hr} bpm • 🔥{' '}
                      {log.calories_burned} kcal
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await api.delete(`/workouts/log?id=${log.id}`);
                      await loadDashboard();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function heroCard(accent: string): React.CSSProperties {
  return {
    background: '#1e293b',
    border: '1px solid #334155',
    borderTop: `3px solid ${accent}`,
    borderRadius: 14,
    padding: 18,
  };
}

const heroLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textTransform: 'uppercase',
  fontWeight: 600,
};

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
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnTab: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
};
