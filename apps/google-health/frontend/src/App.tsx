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

type ActiveTab = 'overview' | 'workouts' | 'history' | 'sources';

function formatUpdatedAt(raw?: string | null): { formatted: string; relative: string; isStale: boolean } {
  if (!raw) {
    return { formatted: 'Keine Zeitangabe', relative: 'Nie synchronisiert', isStale: true };
  }
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { formatted: raw, relative: 'Zeitstempel ungeprüft', isStale: false };
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  let relative = 'gerade eben';
  if (diffMin >= 1 && diffMin < 60) {
    relative = `vor ${diffMin} Min.`;
  } else if (diffMin >= 60 && diffMin < 1440) {
    const hours = Math.floor(diffMin / 60);
    relative = `vor ${hours} Std.`;
  } else if (diffMin >= 1440) {
    const days = Math.floor(diffMin / 1440);
    relative = `vor ${days} Tag${days > 1 ? 'en' : ''}`;
  }

  const formatted = parsed.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    formatted,
    relative,
    isStale: diffMin > 360,
  };
}

function StatusDot({ status }: { status: 'ok' | 'warn' | 'danger' }) {
  const color =
    status === 'ok'
      ? 'var(--status-ok)'
      : status === 'warn'
        ? 'var(--status-warn)'
        : 'var(--status-danger)';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [today, setToday] = useState<BiometricDayRow | null>(null);
  const [readiness, setReadiness] = useState<{
    score: number;
    status: string;
    recommendation: string;
  } | null>(null);
  const [hrZone, setHrZone] = useState<{ zone: string; color: string }>({
    zone: 'Zone 1',
    color: '#a1a1aa',
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
  const [loading, setLoading] = useState<boolean>(true);

  // Manual Biometrics Form
  const [editSteps, setEditSteps] = useState('');
  const [editHr, setEditHr] = useState('');
  const [editRhr, setEditRhr] = useState('');
  const [editSleep, setEditSleep] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
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
    notify('Biometrie-Daten gespeichert, Readiness neu berechnet und mit Home Assistant synchronisiert.');
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
    notify(`Training "${opt.title}" protokolliert (+${opt.est_calories} kcal) und an Home Assistant übertragen.`);
    await loadDashboard();
  };

  const score = readiness?.score ?? 0;
  const stepGoal = today?.step_goal && today.step_goal > 0 ? today.step_goal : 10000;
  const stepPct = today ? Math.min(100, Math.round((today.steps / stepGoal) * 100)) : 0;

  const hasSourceData = Boolean(today?.source && today.source !== 'No Data');
  const hasStepsOrHr = Boolean(today && (today.steps > 0 || today.current_hr > 0));
  const hasSleepData = Boolean(today && today.sleep_hours > 0);
  const hasWeightData = Boolean(today && today.weight_kg > 0);

  const recency = formatUpdatedAt(today?.updated_at);
  const sourceLabel = hasSourceData ? today!.source : 'Keine Sensordaten';

  // User Action Required conditions
  const missingBiometrics = !today || (today.steps === 0 && today.current_hr === 0) || today.source === 'No Data';
  const missingHa = !haConnected;
  const missingOAuth = !googleOAuth?.authorized;
  const actionRequired = missingBiometrics || missingHa || missingOAuth;

  const actionReasons: string[] = [];
  if (missingBiometrics) {
    actionReasons.push('Noch keine aktuellen Biometrie-Daten für heute vorhanden (Schritte & Puls = 0)');
  }
  if (missingHa) {
    actionReasons.push('Home Assistant Verbindung getrennt');
  }
  if (missingOAuth) {
    actionReasons.push('Google Fit OAuth noch nicht autorisiert');
  }

  const filteredWorkouts = workoutOptions.filter((w) => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'recommended') return score >= w.min_readiness;
    return w.category === categoryFilter;
  });

  const readinessStatusDot: 'ok' | 'warn' | 'danger' =
    score >= 65 && hasSourceData ? 'ok' : score >= 45 && hasSourceData ? 'warn' : 'danger';

  const stepsStatusDot: 'ok' | 'warn' | 'danger' =
    today && today.steps >= stepGoal * 0.5
      ? 'ok'
      : today && today.steps > 0
        ? 'warn'
        : 'danger';

  const hrStatusDot: 'ok' | 'warn' | 'danger' =
    today && today.current_hr > 0 && today.resting_hr > 0
      ? 'ok'
      : today && (today.current_hr > 0 || today.resting_hr > 0)
        ? 'warn'
        : 'danger';

  const sleepWeightStatusDot: 'ok' | 'warn' | 'danger' =
    hasSleepData && hasWeightData ? 'ok' : hasSleepData || hasWeightData ? 'warn' : 'danger';

  return (
    <div
      style={{
        maxWidth: 1440,
        padding: '32px 48px',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top Header Zone */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 16,
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Health &amp; Biometrics
          </h1>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--text-muted)',
            }}
          >
            FIT · READINESS · HA-SYNC
          </span>
        </div>

        {/* Data Freshness & Connection Status Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={haConnected ? 'ok' : 'danger'} />
            <span>{haConnected ? 'HA Verbunden' : 'HA Getrennt'}</span>
          </span>

          <span style={{ color: 'var(--text-muted)' }}>·</span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={hasSourceData ? 'ok' : 'warn'} />
            <span>Quelle:</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {sourceLabel}
            </span>
          </span>

          <span style={{ color: 'var(--text-muted)' }}>·</span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusDot
              status={
                pixelWatchBattery !== null
                  ? pixelWatchBattery > 20
                    ? 'ok'
                    : 'warn'
                  : 'warn'
              }
            />
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {pixelWatchBattery !== null ? `Watch: ${pixelWatchBattery}%` : 'Keine Watch-Daten'}
            </span>
          </span>

          <span style={{ color: 'var(--text-muted)' }}>·</span>

          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: recency.isStale ? 'var(--text-secondary)' : 'var(--text-muted)',
            }}
          >
            Stand: {recency.formatted} ({recency.relative})
          </span>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            style={btnSecondary}
          >
            {loading ? 'Lädt...' : 'Aktualisieren'}
          </button>
        </div>
      </header>

      {/* User Input Required / Sensor Sync Alert Banner */}
      {actionRequired && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            padding: '12px 16px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--line-hairline)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusDot status={missingBiometrics && missingHa ? 'danger' : 'warn'} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              Benutzereingabe / Sensor-Sync erforderlich:
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {actionReasons.join(' · ')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            style={btnPrimary}
          >
            Manuelle Eingabe &amp; Quellen
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--line-focus)',
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status="ok" />
            <span>{toast}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Schließen
          </button>
        </div>
      )}

      {/* 4-Column Hairline KPI Strip */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        {/* KPI 1: READINESS SCORE */}
        <div
          style={{
            padding: '24px 24px 24px 0',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={sectionLabelStyle}>READINESS SCORE</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <StatusDot status={readinessStatusDot} />
              <span>{readiness?.status || 'Keine Daten'}</span>
            </span>
          </div>
          <div style={heroMetricStyle}>
            {score > 0 ? score : '—'}
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>
              {' '}
              / 100
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            {hasSourceData && score > 0
              ? `Live berechnet · Quelle: ${today?.source}`
              : 'Eingabe erforderlich · Sensordaten fehlen'}
          </div>
        </div>

        {/* KPI 2: SCHRITTE & AKTIVITÄT */}
        <div
          style={{
            padding: '24px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={sectionLabelStyle}>SCHRITTE &amp; AKTIVITÄT</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}
            >
              <StatusDot status={stepsStatusDot} />
              <span>{stepPct}%</span>
            </span>
          </div>
          <div style={heroMetricStyle}>
            {today && today.steps > 0 ? today.steps.toLocaleString('de-DE') : '0'}
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>
              {' '}
              / {stepGoal.toLocaleString('de-DE')}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            {today && today.steps > 0
              ? `Live-Daten · ${today.active_calories || 0} kcal · ${distanceKm ? `${distanceKm} km` : 'Distanz ausstehend'}`
              : 'Eingabe erforderlich · Keine Schritte für heute'}
          </div>
        </div>

        {/* KPI 3: HERZFREQUENZ & HRV */}
        <div
          style={{
            padding: '24px',
            borderRight: '1px solid var(--line-hairline)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={sectionLabelStyle}>HERZFREQUENZ &amp; HRV</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}
            >
              <StatusDot status={hrStatusDot} />
              <span>{today && today.current_hr > 0 ? hrZone.zone : 'Kein Signal'}</span>
            </span>
          </div>
          <div style={heroMetricStyle}>
            {today && today.current_hr > 0 ? today.current_hr : '—'}
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>
              {' '}
              bpm
            </span>
            <span
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                fontWeight: 400,
                marginLeft: 12,
              }}
            >
              RHR: {today && today.resting_hr > 0 ? `${today.resting_hr} bpm` : '—'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            {today && (today.current_hr > 0 || today.resting_hr > 0)
              ? `7T-Basis: ${baselineRhr || '—'} bpm · HRV: ${hrvMs !== null ? `${hrvMs} ms` : 'Keine Daten'}`
              : 'Eingabe erforderlich · Kein Puls-Signal'}
          </div>
        </div>

        {/* KPI 4: SCHLAF & GEWICHT */}
        <div style={{ padding: '24px 0 24px 24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={sectionLabelStyle}>SCHLAF &amp; GEWICHT</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <StatusDot status={sleepWeightStatusDot} />
              <span>{hasSleepData ? 'Schlaf erfasst' : 'Schlaf fehlt'}</span>
            </span>
          </div>
          <div style={heroMetricStyle}>
            {hasSleepData ? `${today!.sleep_hours} h` : '—'}
            <span
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                fontWeight: 400,
                marginLeft: 12,
              }}
            >
              {hasWeightData ? `${today!.weight_kg} kg` : '— kg'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            {hasSleepData || hasWeightData
              ? `Gewicht: ${hasWeightData ? `${today!.weight_kg} kg` : 'Fehlt'} · Atmung: ${respiratoryRate ? `${respiratoryRate} /min` : '—'}`
              : 'Eingabe erforderlich · Schlaf & Gewicht fehlen'}
          </div>
        </div>
      </section>

      {/* Clean Text-Link Navigation Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: 28,
          borderBottom: '1px solid var(--line-hairline)',
          marginBottom: 32,
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'overview' as const, label: 'Übersicht & Vitalwerte' },
          { id: 'workouts' as const, label: `Workouts & Training (${workoutOptions.length})` },
          { id: 'history' as const, label: `7-Tage Verlauf (${history.length})` },
          { id: 'sources' as const, label: 'Manuelle Eingabe & Quellen' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '1px solid var(--text-primary)'
                  : '1px solid transparent',
                padding: '14px 0',
                fontSize: 13.5,
                fontWeight: 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* TAB 1: Übersicht & Vitalwerte */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {/* Physiological Readiness Recommendation Strip */}
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span style={sectionLabelStyle}>READINESS-EMPFEHLUNG &amp; TAGESSTATUS</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                SCORE {score}/100 · {readiness?.status || 'NO DATA'}
              </span>
            </div>
            <div
              style={{
                padding: '16px 0',
                borderBottom: '1px solid var(--line-hairline)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, maxWidth: 880 }}>
                {readiness?.recommendation ||
                  'Noch keine ausreichenden Biometrie-Daten für eine fundierte Tagesempfehlung vorhanden.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('workouts')}
                  style={btnSecondary}
                >
                  Passende Workouts ({workoutOptions.filter((w) => score >= w.min_readiness).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sources')}
                  style={btnSecondary}
                >
                  Werte anpassen
                </button>
              </div>
            </div>
          </section>

          {/* Detailed Vitals Hairline Table */}
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span style={sectionLabelStyle}>DETAILLIERTE VITALWERTE HEUTE ({today?.log_date || '—'})</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                HEALTH CONNECT · HOME ASSISTANT
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-hairline)', textAlign: 'left' }}>
                  <th style={thStyle}>METRIK</th>
                  <th style={thStyle}>SENSOR / QUELLE</th>
                  <th style={thStyle}>REFERENZ / ZIEL</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>MESSWERT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: 'Ruhepuls (RHR) vs. Baseline',
                    sensor: 'sensor.thassi_google_health_resting_heart_rate',
                    ref: baselineRhr > 0 ? `7-Tage-Basis: ${baselineRhr} bpm` : 'Keine Baseline',
                    value: today && today.resting_hr > 0 ? `${today.resting_hr} bpm` : '—',
                    status: today && today.resting_hr > 0 ? ('ok' as const) : ('warn' as const),
                    statusText:
                      today && today.resting_hr > 0
                        ? baselineRhr > 0
                          ? `${today.resting_hr - baselineRhr > 0 ? '+' : ''}${today.resting_hr - baselineRhr} bpm zur Basis`
                          : 'Erfasst'
                        : 'Eingabe nötig',
                  },
                  {
                    name: 'Aktuelle Herzfrequenz & Zone',
                    sensor: 'sensor.thassi_google_health_heart_rate',
                    ref: hrZone.zone,
                    value: today && today.current_hr > 0 ? `${today.current_hr} bpm` : '—',
                    status: today && today.current_hr > 0 ? ('ok' as const) : ('warn' as const),
                    statusText: today && today.current_hr > 0 ? hrZone.zone : 'Kein Live-Puls',
                  },
                  {
                    name: 'Herzfrequenzvariabilität (HRV)',
                    sensor: 'health_connect.hrv_rmssd',
                    ref: 'Erholungsindikator (RMSSD)',
                    value: hrvMs !== null ? `${hrvMs} ms` : '—',
                    status: hrvMs !== null ? ('ok' as const) : ('warn' as const),
                    statusText: hrvMs !== null ? 'Live-Messwert' : 'Keine Sensordaten',
                  },
                  {
                    name: 'Schritte & Tagesziel',
                    sensor: 'sensor.thassi_google_health_daily_steps',
                    ref: `Tagesziel: ${stepGoal.toLocaleString('de-DE')}`,
                    value: today && today.steps > 0 ? today.steps.toLocaleString('de-DE') : '0',
                    status: stepsStatusDot,
                    statusText:
                      today && today.steps > 0 ? `${stepPct}% erreicht` : 'Keine Schritte erfasst',
                  },
                  {
                    name: 'Zurückgelegte Distanz',
                    sensor: 'health_connect.distance_daily',
                    ref: 'Tagesdistanz',
                    value: distanceKm !== null ? `${distanceKm} km` : '—',
                    status: distanceKm !== null ? ('ok' as const) : ('warn' as const),
                    statusText: distanceKm !== null ? 'Synchronisiert' : 'Keine Sensordaten',
                  },
                  {
                    name: 'Etagen / Höhenmeter',
                    sensor: 'health_connect.floors_climbed',
                    ref: 'Barometer / Watch',
                    value: floors !== null ? `${floors} Etagen` : '—',
                    status: floors !== null ? ('ok' as const) : ('warn' as const),
                    statusText: floors !== null ? 'Synchronisiert' : 'Keine Sensordaten',
                  },
                  {
                    name: 'Atemfrequenz (Schlaf)',
                    sensor: 'health_connect.respiratory_rate',
                    ref: '12–20 Atemzüge/min',
                    value: respiratoryRate !== null ? `${respiratoryRate} /min` : '—',
                    status: respiratoryRate !== null ? ('ok' as const) : ('warn' as const),
                    statusText: respiratoryRate !== null ? 'Normalbereich' : 'Keine Sensordaten',
                  },
                  {
                    name: 'Schlafdauer',
                    sensor: 'health_connect.sleep_duration',
                    ref: 'Ziel: 7.5 – 8.5 h',
                    value: hasSleepData ? `${today!.sleep_hours} h` : '—',
                    status: hasSleepData ? ('ok' as const) : ('warn' as const),
                    statusText: hasSleepData ? 'Protokolliert' : 'Eingabe nötig',
                  },
                  {
                    name: 'Körpergewicht',
                    sensor: 'health_connect.weight_kg',
                    ref: 'Health Connect Körperwerte',
                    value: hasWeightData ? `${today!.weight_kg} kg` : '—',
                    status: hasWeightData ? ('ok' as const) : ('warn' as const),
                    statusText: hasWeightData ? 'Erfasst' : 'Keine Daten in Health Connect',
                  },
                ].map((row) => (
                  <tr key={row.name} style={trStyle}>
                    <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {row.name}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {row.sensor}
                    </td>
                    <td style={tdStyle}>{row.ref}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                      }}
                    >
                      {row.value}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 6,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <StatusDot status={row.status} />
                        <span>{row.statusText}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Meal Planner Coupling Section */}
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span style={sectionLabelStyle}>MEAL-PLANNER KALORIEN &amp; PROTEIN KOPPLUNG</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                MEALS · ENERGY BALANCE
              </span>
            </div>

            {mealPlannerToday ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ padding: '18px 24px 18px 0', borderRight: '1px solid var(--line-hairline)' }}>
                  <div style={sectionLabelStyle}>GEPLANTE AUFNAHME</div>
                  <div style={{ ...heroMetricStyle, fontSize: 22, marginTop: 6 }}>
                    {mealPlannerToday.totalCalories.toLocaleString('de-DE')} kcal
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Aus aktuellem Tagesplan
                  </div>
                </div>

                <div style={{ padding: '18px 24px', borderRight: '1px solid var(--line-hairline)' }}>
                  <div style={sectionLabelStyle}>GEPLANTES PROTEIN</div>
                  <div style={{ ...heroMetricStyle, fontSize: 22, marginTop: 6 }}>
                    {mealPlannerToday.totalProtein} g
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Makronährstoff-Ziel
                  </div>
                </div>

                <div style={{ padding: '18px 24px', borderRight: '1px solid var(--line-hairline)' }}>
                  <div style={sectionLabelStyle}>AKTIVER VERBRAUCH HEUTE</div>
                  <div style={{ ...heroMetricStyle, fontSize: 22, marginTop: 6 }}>
                    {(today?.active_calories ?? 0).toLocaleString('de-DE')} kcal
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Workouts &amp; Bewegung
                  </div>
                </div>

                <div style={{ padding: '18px 0 18px 24px' }}>
                  <div style={sectionLabelStyle}>HAUPTMAHLZEIT / DINNER</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginTop: 8,
                    }}
                  >
                    {mealPlannerToday.dinner || 'Kein Gericht geplant'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Netto: {(mealPlannerToday.totalCalories - (today?.active_calories ?? 0)).toLocaleString('de-DE')} kcal
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '16px 0',
                  borderBottom: '1px solid var(--line-hairline)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <StatusDot status="warn" />
                <span>Für heute sind noch keine Mahlzeiten im Meal-Planner hinterlegt.</span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: Workouts & Training */}
      {activeTab === 'workouts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <section>
            {/* Sub-filter text links */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[
                  { id: 'recommended', label: `Passend zu Readiness (${score}/100)` },
                  { id: 'all', label: `Alle (${workoutOptions.length})` },
                  { id: 'strength', label: 'Strength' },
                  { id: 'cardio', label: 'Zone 2 Cardio' },
                  { id: 'hiit', label: 'HIIT / VO2 Max' },
                  { id: 'recovery', label: 'Recovery & Mobility' },
                ].map((f) => {
                  const active = categoryFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCategoryFilter(f.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        fontSize: 12.5,
                        fontWeight: active ? 500 : 400,
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        textDecoration: active ? 'underline' : 'none',
                        textUnderlineOffset: 6,
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                {filteredWorkouts.length} EINHEITEN
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-hairline)', textAlign: 'left' }}>
                  <th style={thStyle}>READINESS-MATCH</th>
                  <th style={thStyle}>WORKOUT &amp; ÜBUNGEN</th>
                  <th style={thStyle}>KATEGORIE / INTENSITÄT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>DAUER &amp; ZONE</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>VERBRAUCH</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>AKTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkouts.map((w) => {
                  const isOptimal = score >= w.min_readiness;
                  return (
                    <tr key={w.id} style={trStyle}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: isOptimal ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                        >
                          <StatusDot status={isOptimal ? 'ok' : 'warn'} />
                          <span>
                            {isOptimal ? `Optimal (≥${w.min_readiness})` : `Min. ${w.min_readiness}`}
                          </span>
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 460 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13.5 }}>
                          {w.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {w.description}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            marginTop: 4,
                          }}
                        >
                          {w.exercisesList.join(' · ')}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {w.category.toUpperCase()} · {w.intensity.toUpperCase()}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {w.duration_min} min · {w.target_hr_zone}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ~{w.est_calories} kcal
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => void handleLogWorkout(w)}
                          style={btnPrimary}
                        >
                          Training loggen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Logged Workouts Table */}
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <span style={sectionLabelStyle}>PROTOKOLLIERTE WORKOUTS ({workoutLogs.length})</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                sensor.thassi_google_health_weekly_workouts
              </span>
            </div>

            {workoutLogs.length === 0 ? (
              <div
                style={{
                  padding: '20px 0',
                  borderBottom: '1px solid var(--line-hairline)',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                Noch keine protokollierten Trainings vorhanden.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line-hairline)', textAlign: 'left' }}>
                    <th style={thStyle}>DATUM</th>
                    <th style={thStyle}>EINHEIT</th>
                    <th style={thStyle}>KATEGORIE</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>DAUER</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Ø PULS</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>AKTIVE KCAL</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>RPE</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>AKTION</th>
                  </tr>
                </thead>
                <tbody>
                  {workoutLogs.map((log) => (
                    <tr key={log.id} style={trStyle}>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {log.workout_date}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {log.title}
                        </div>
                        {log.notes && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {log.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {log.category.toUpperCase()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {log.duration_min} min
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {log.avg_hr} bpm
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {log.calories_burned} kcal
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {log.rpe_load}/10
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.delete(`/workouts/log?id=${log.id}`);
                            notify(`Training "${log.title}" wurde gelöscht.`);
                            await loadDashboard();
                          }}
                          style={btnSecondary}
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: 7-Tage Verlauf */}
      {activeTab === 'history' && (
        <section>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 12,
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            <span style={sectionLabelStyle}>7-TAGE BIOMETRIE &amp; READINESS VERLAUF</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              {history.length} TAGESDATENSÄTZE
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-hairline)', textAlign: 'left' }}>
                <th style={thStyle}>DATUM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>READINESS</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>SCHRITTE</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>SCHLAF</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>RUHEPULS</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>AKTIVE KCAL</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>QUELLE</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const rowHasData = h.source && h.source !== 'No Data' && (h.steps > 0 || h.resting_hr > 0);
                const rDot: 'ok' | 'warn' | 'danger' =
                  h.readiness_score >= 65 && rowHasData
                    ? 'ok'
                    : h.readiness_score >= 45 && rowHasData
                      ? 'warn'
                      : 'danger';
                return (
                  <tr key={h.log_date} style={trStyle}>
                    <td
                      style={{
                        ...tdStyle,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                      }}
                    >
                      {h.log_date}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 6,
                          color: 'var(--text-primary)',
                        }}
                      >
                        <StatusDot status={rDot} />
                        <span>{h.readiness_score}/100</span>
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {h.steps.toLocaleString('de-DE')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {h.sleep_hours > 0 ? `${h.sleep_hours} h` : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {h.resting_hr > 0 ? `${h.resting_hr} bpm` : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {h.active_calories > 0 ? `${h.active_calories} kcal` : '0 kcal'}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: rowHasData ? 'var(--text-secondary)' : 'var(--text-muted)',
                      }}
                    >
                      {h.source && h.source !== 'No Data' ? h.source : 'Keine Sensordaten'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 4: Manuelle Eingabe & Quellen */}
      {activeTab === 'sources' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 48,
            alignItems: 'start',
          }}
        >
          {/* Left: Manual Biometrics Override Form */}
          <section>
            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: 20,
              }}
            >
              <div style={sectionLabelStyle}>MANUELLE BIOMETRIE-EINGABE (HEUTE)</div>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Überschreibt oder ergänzt die heutigen Tageswerte, berechnet den Readiness-Score neu
                und publiziert die aktualisierten Werte direkt an Home Assistant.
              </p>
            </div>

            <form onSubmit={(e) => void handleUpdateBiometrics(e)}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div>
                  <label style={labelStyle}>TAGESSCHRITTE</label>
                  <input
                    type="number"
                    min="0"
                    value={editSteps}
                    onChange={(e) => setEditSteps(e.target.value)}
                    style={inputStyle}
                    placeholder="z. B. 8500"
                  />
                </div>

                <div>
                  <label style={labelStyle}>AKTUELLER PULS (BPM)</label>
                  <input
                    type="number"
                    min="0"
                    value={editHr}
                    onChange={(e) => setEditHr(e.target.value)}
                    style={inputStyle}
                    placeholder="z. B. 68"
                  />
                </div>

                <div>
                  <label style={labelStyle}>RUHEPULS / RHR (BPM)</label>
                  <input
                    type="number"
                    min="0"
                    value={editRhr}
                    onChange={(e) => setEditRhr(e.target.value)}
                    style={inputStyle}
                    placeholder="z. B. 56"
                  />
                </div>

                <div>
                  <label style={labelStyle}>SCHLAFDAUER (STUNDEN)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editSleep}
                    onChange={(e) => setEditSleep(e.target.value)}
                    style={inputStyle}
                    placeholder="z. B. 7.5"
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 16,
                  borderTop: '1px solid var(--line-hairline)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  POST /biometrics
                </span>
                <button type="submit" style={btnPrimary}>
                  Werte speichern &amp; HA synchronisieren
                </button>
              </div>
            </form>
          </section>

          {/* Right: Sensor Sources, Google OAuth & Home Assistant Entities */}
          <section>
            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div style={sectionLabelStyle}>VERBINDUNGSSTATUS &amp; SENSOR-QUELLEN</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
              <tbody>
                <tr style={trStyle}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>Home Assistant Bridge</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={haConnected ? 'ok' : 'danger'} />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {haConnected ? 'Verbunden' : 'Getrennt'}
                      </span>
                    </span>
                  </td>
                </tr>

                <tr style={trStyle}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>Google Fit / Health OAuth</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={googleOAuth?.authorized ? 'ok' : 'warn'} />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {googleOAuth?.authorized
                          ? 'Autorisiert'
                          : 'Nicht autorisiert (In Thassi Hub konfigurieren)'}
                      </span>
                    </span>
                  </td>
                </tr>

                <tr style={trStyle}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>Aktive Datenquelle heute</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={hasSourceData ? 'ok' : 'warn'} />
                      <span style={{ color: 'var(--text-primary)' }}>{sourceLabel}</span>
                    </span>
                  </td>
                </tr>

                <tr style={trStyle}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>Pixel Watch Akku-Sensor</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={pixelWatchBattery !== null ? 'ok' : 'warn'} />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {pixelWatchBattery !== null ? `${pixelWatchBattery}%` : 'Keine Watch-Daten'}
                      </span>
                    </span>
                  </td>
                </tr>

                <tr style={trStyle}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>Letzter Datensatz-Stand</td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {recency.formatted} ({recency.relative})
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              style={{
                paddingBottom: 12,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div style={sectionLabelStyle}>PUBLIZIERTE HOME ASSISTANT ENTITÄTEN</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                {
                  id: 'sensor.thassi_google_health_readiness_score',
                  val: `${score}/100`,
                },
                {
                  id: 'sensor.thassi_google_health_daily_steps',
                  val: `${(today?.steps ?? 0).toLocaleString('de-DE')} steps`,
                },
                {
                  id: 'sensor.thassi_google_health_heart_rate',
                  val: `${today?.current_hr ?? 0} bpm`,
                },
                {
                  id: 'sensor.thassi_google_health_resting_heart_rate',
                  val: `${today?.resting_hr ?? 0} bpm`,
                },
                {
                  id: 'sensor.thassi_google_health_weekly_workouts',
                  val: `${workoutLogs.length} logs`,
                },
              ].map((entity) => (
                <div
                  key={entity.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{entity.id}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{entity.val}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const heroMetricStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 400,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px 10px 0',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const trStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--line-hairline)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 12px 12px 0',
  color: 'var(--text-secondary)',
  fontVariantNumeric: 'tabular-nums',
  verticalAlign: 'top',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--line-hairline)',
  borderRadius: 4,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  background: '#fafafa',
  color: '#09090b',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--line-hairline)',
  cursor: 'pointer',
};
