import { defineThassiApp } from '@thassi/sdk';

export interface BiometricDayRow {
  log_date: string;           // YYYY-MM-DD (Primary Key)
  steps: number;
  step_goal: number;
  current_hr: number;         // bpm
  resting_hr: number;         // bpm
  sleep_hours: number;
  active_calories: number;
  weight_kg: number;
  readiness_score: number;    // 0 - 100
  source: string;
  updated_at: string;
}

export interface WorkoutOptionRow {
  id: number;
  title: string;
  category: 'strength' | 'cardio' | 'hiit' | 'recovery';
  intensity: 'low' | 'moderate' | 'high';
  min_readiness: number;
  duration_min: number;
  target_hr_zone: string;
  est_calories: number;
  exercises: string;          // JSON array of exercise strings
  description: string;
}

export interface WorkoutLogRow {
  id: number;
  workout_date: string;
  title: string;
  category: string;
  duration_min: number;
  avg_hr: number;
  calories_burned: number;
  rpe_load: number;           // 1 - 10 effort
  notes: string;
}

const STARTER_WORKOUT_OPTIONS: Array<Omit<WorkoutOptionRow, 'id'>> = [
  {
    title: 'Upper Body Hypertrophy & Core',
    category: 'strength',
    intensity: 'high',
    min_readiness: 75,
    duration_min: 50,
    target_hr_zone: '115–145 bpm (Zone 2–3)',
    est_calories: 380,
    exercises: JSON.stringify([
      '4x8 Bench Press / Push-Ups',
      '4x10 Weighted Pull-Ups / Lat Pulldown',
      '3x12 Overhead Dumbbell Press',
      '3x12 Incline Chest Supported Row',
      '3x60s Hanging Leg Raises / Plank',
    ]),
    description: 'Compound upper-body strength session optimal when Readiness >= 75.',
  },
  {
    title: 'Lower Body Strength & Posterior Chain',
    category: 'strength',
    intensity: 'high',
    min_readiness: 78,
    duration_min: 55,
    target_hr_zone: '120–155 bpm (Zone 2–4)',
    est_calories: 440,
    exercises: JSON.stringify([
      '4x6 Barbell / Goblet Squat',
      '4x8 Romanian Deadlift (RDL)',
      '3x10 Bulgarian Split Squats',
      '3x15 Standing Calf Raises',
      '10 min Hip Mobility Finisher',
    ]),
    description: 'High-output leg & posterior chain session for peak readiness days.',
  },
  {
    title: 'Zone 2 Aerobic Base Run / Cycle',
    category: 'cardio',
    intensity: 'moderate',
    min_readiness: 60,
    duration_min: 40,
    target_hr_zone: '125–142 bpm (Strict Zone 2)',
    est_calories: 390,
    exercises: JSON.stringify([
      '5 min Easy Warm-Up Nasal Breathing',
      '30 min Continuous Zone 2 Run or Bike (conversational pace)',
      '5 min Cool-Down Walk & Calf Stretch',
    ]),
    description: 'Builds mitochondrial efficiency and lowers Resting Heart Rate without CNS fatigue.',
  },
  {
    title: 'VO2 Max Kettlebell & Row Conditioning',
    category: 'hiit',
    intensity: 'high',
    min_readiness: 82,
    duration_min: 30,
    target_hr_zone: '155–178 bpm (Zone 4–5 Intervals)',
    est_calories: 410,
    exercises: JSON.stringify([
      '5 Rounds (40s Work / 20s Rest):',
      '• Kettlebell Swings (24kg)',
      '• Burpees or Row Erg Sprint',
      '• Goblet Thrusters',
      '• Farmer Carry Hold',
    ]),
    description: 'Short, intense metabolic conditioning when resting HR is low and recovery is prime.',
  },
  {
    title: 'Active Recovery: Mobility, Yoga & 30m Walk',
    category: 'recovery',
    intensity: 'low',
    min_readiness: 0,
    duration_min: 30,
    target_hr_zone: '90–112 bpm (Zone 1 Recovery)',
    est_calories: 160,
    exercises: JSON.stringify([
      '10 min Thoracic Spine & Hip Opener Flow',
      '5 min Deep Parasympathetic Box Breathing (4-4-4-4)',
      '15 min Brisk Outdoor Walk',
    ]),
    description: 'Ideal when Readiness < 65 or after consecutive heavy training days to restore HRV & RHR.',
  },
];

/**
 * Physiological Readiness Score (0 - 100):
 * Combines Resting Heart Rate deviation from baseline (~58 bpm),
 * Sleep duration (target 7.8h), and recent workout strain.
 */
export function calculateReadinessScore(params: {
  restingHr: number;
  baselineRestingHr: number;
  sleepHours: number;
  yesterdayStrain: number; // 0 - 10
  steps: number;
}): {
  score: number;
  status: 'Peak Recovery' | 'Ready to Train' | 'Moderate / Pace Yourself' | 'Rest & Recover';
  recommendation: string;
} {
  // 1. RHR Component (up to 40 pts): Lower or equal to baseline is great
  const rhrDiff = params.restingHr - params.baselineRestingHr;
  const rhrScore = Math.max(10, Math.min(40, Math.round(34 - rhrDiff * 3.5)));

  // 2. Sleep Component (up to 40 pts): 7.8h is 40 pts
  const sleepRatio = Math.min(1.08, Math.max(0.3, params.sleepHours / 7.8));
  const sleepScore = Math.round(sleepRatio * 37);

  // 3. Recovery / Strain Balance (up to 20 pts)
  const strainPenalty = Math.max(0, (params.yesterdayStrain - 6) * 2.5);
  const balanceScore = Math.max(5, Math.min(20, Math.round(18 - strainPenalty)));

  const score = Math.max(25, Math.min(99, rhrScore + sleepScore + balanceScore));

  if (score >= 82) {
    return {
      score,
      status: 'Peak Recovery',
      recommendation:
        'Your Resting HR is well below ceiling and sleep recovery is strong. Great day for High-Intensity Strength or VO2 Max Intervals.',
    };
  }
  if (score >= 68) {
    return {
      score,
      status: 'Ready to Train',
      recommendation:
        'Solid physiological baseline today. Ideal for Upper/Lower Strength or a 40-minute Zone 2 Aerobic session.',
    };
  }
  if (score >= 54) {
    return {
      score,
      status: 'Moderate / Pace Yourself',
      recommendation:
        'Elevated RHR or moderate sleep debt detected. Prefer Zone 2 Cardio or technique work over maximal loads.',
    };
  }
  return {
    score,
    status: 'Rest & Recover',
    recommendation:
      'Prioritize nervous system recovery today: 30m outdoor walk, mobility flow, hydration, and early sleep.',
  };
}

function getHrZone(hr: number): { zone: string; color: string } {
  if (hr < 105) return { zone: 'Zone 1 • Rest / Everyday', color: '#38bdf8' };
  if (hr < 138) return { zone: 'Zone 2 • Fat Burn / Aerobic Base', color: '#4ade80' };
  if (hr < 158) return { zone: 'Zone 3 • Tempo / Cardio', color: '#facc15' };
  if (hr < 174) return { zone: 'Zone 4 • Anaerobic Threshold', color: '#fb923c' };
  return { zone: 'Zone 5 • Peak VO2 Max', color: '#f43f5e' };
}

function formatDateOffset(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Schema for Google Health & Readiness
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS daily_biometrics (
      log_date TEXT PRIMARY KEY,
      steps INTEGER NOT NULL DEFAULT 0,
      step_goal INTEGER NOT NULL DEFAULT 10000,
      current_hr INTEGER NOT NULL DEFAULT 68,
      resting_hr INTEGER NOT NULL DEFAULT 57,
      sleep_hours REAL NOT NULL DEFAULT 7.5,
      active_calories INTEGER NOT NULL DEFAULT 420,
      weight_kg REAL NOT NULL DEFAULT 85.5,
      readiness_score INTEGER NOT NULL DEFAULT 82,
      source TEXT NOT NULL DEFAULT 'hybrid',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      intensity TEXT NOT NULL,
      min_readiness INTEGER NOT NULL DEFAULT 0,
      duration_min INTEGER NOT NULL DEFAULT 45,
      target_hr_zone TEXT NOT NULL,
      est_calories INTEGER NOT NULL DEFAULT 350,
      exercises TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_date TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      avg_hr INTEGER NOT NULL DEFAULT 135,
      calories_burned INTEGER NOT NULL DEFAULT 350,
      rpe_load INTEGER NOT NULL DEFAULT 7,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);

  // Seed workout options catalog if empty
  const optCount =
    ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM workout_options')?.cnt ?? 0;
  if (optCount === 0) {
    for (const w of STARTER_WORKOUT_OPTIONS) {
      ctx.db.execute(
        `INSERT INTO workout_options
         (title, category, intensity, min_readiness, duration_min, target_hr_zone, est_calories, exercises, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          w.title,
          w.category,
          w.intensity,
          w.min_readiness,
          w.duration_min,
          w.target_hr_zone,
          w.est_calories,
          w.exercises,
          w.description,
        ]
      );
    }
  }

  // Seed 7-day biometric history if empty
  const bioCount =
    ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM daily_biometrics')?.cnt ?? 0;
  if (bioCount === 0) {
    const historySeed = [
      { daysBack: 6, steps: 9420, current_hr: 66, resting_hr: 58, sleep: 7.4, cal: 480, score: 80 },
      { daysBack: 5, steps: 11250, current_hr: 71, resting_hr: 56, sleep: 8.1, cal: 610, score: 88 },
      { daysBack: 4, steps: 7890, current_hr: 74, resting_hr: 59, sleep: 6.8, cal: 390, score: 71 },
      { daysBack: 3, steps: 10410, current_hr: 69, resting_hr: 57, sleep: 7.6, cal: 530, score: 83 },
      { daysBack: 2, steps: 12300, current_hr: 72, resting_hr: 56, sleep: 7.9, cal: 640, score: 86 },
      { daysBack: 1, steps: 8640, current_hr: 67, resting_hr: 57, sleep: 7.7, cal: 450, score: 82 },
      { daysBack: 0, steps: 6420, current_hr: 68, resting_hr: 56, sleep: 7.8, cal: 380, score: 85 },
    ];
    const nowIso = new Date().toISOString();
    for (const h of historySeed) {
      ctx.db.execute(
        `INSERT OR IGNORE INTO daily_biometrics
         (log_date, steps, step_goal, current_hr, resting_hr, sleep_hours, active_calories, weight_kg, readiness_score, source, updated_at)
         VALUES (?, ?, 10000, ?, ?, ?, ?, 85.5, ?, 'seed', ?)`,
        [formatDateOffset(h.daysBack), h.steps, h.current_hr, h.resting_hr, h.sleep, h.cal, h.score, nowIso]
      );
    }

    // Seed 2 recent workouts
    ctx.db.execute(
      `INSERT INTO workout_logs (workout_date, title, category, duration_min, avg_hr, calories_burned, rpe_load, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formatDateOffset(2),
        'Upper Body Hypertrophy & Core',
        'strength',
        50,
        132,
        395,
        8,
        'Strong bench & pull-up progression',
      ]
    );
    ctx.db.execute(
      `INSERT INTO workout_logs (workout_date, title, category, duration_min, avg_hr, calories_burned, rpe_load, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formatDateOffset(1),
        'Zone 2 Aerobic Base Run / Cycle',
        'cardio',
        40,
        134,
        380,
        6,
        'Nasal breathing steady Zone 2',
      ]
    );
  }

  /**
   * Syncs live biometrics from:
   * 1. Home Assistant wearable/companion sensors (Pixel 10 & Thomas' Pixel Watch)
   * 2. Google Fitness REST API (`ctx.google.googleFetch`) if Google OAuth2 is authorized
   * 3. Recalculates Readiness Score and publishes 5 live `sensor.thassi_google_health_*` entities to HA
   */
  async function syncHealthDataAndPublishSensors() {
    const today = formatDateOffset(0);
    let todayRow = ctx.db.queryOne<BiometricDayRow>(
      'SELECT * FROM daily_biometrics WHERE log_date = ?',
      [today]
    );

    if (!todayRow) {
      const prev = ctx.db.queryOne<BiometricDayRow>(
        'SELECT * FROM daily_biometrics ORDER BY log_date DESC LIMIT 1'
      );
      ctx.db.execute(
        `INSERT INTO daily_biometrics
         (log_date, steps, step_goal, current_hr, resting_hr, sleep_hours, active_calories, weight_kg, readiness_score, source, updated_at)
         VALUES (?, ?, 10000, ?, ?, ?, ?, ?, 82, 'auto', ?)`,
        [
          today,
          2136,
          prev?.current_hr ?? 68,
          prev?.resting_hr ?? 56,
          prev?.sleep_hours ?? 7.6,
          310,
          prev?.weight_kg ?? 85.5,
          new Date().toISOString(),
        ]
      );
      todayRow = ctx.db.queryOne<BiometricDayRow>(
        'SELECT * FROM daily_biometrics WHERE log_date = ?',
        [today]
      )!;
    }

    let steps = todayRow.steps;
    let currentHr = todayRow.current_hr;
    let restingHr = todayRow.resting_hr;
    let sleepHours = todayRow.sleep_hours;
    let weightKg = todayRow.weight_kg;
    let pixelWatchBattery: number | null = null;
    let pixelPhoneSteps: number | null = null;
    const activeSources: string[] = [];

    // A) Pull from Home Assistant Companion App Sensors (Pixel 10 & Thomas' Pixel Watch)
    try {
      const states = await ctx.ha.getStates('sensor');
      const byId = new Map(states.map((s) => [s.entity_id, s]));

      // Pixel 10 Steps sensor
      const p10Steps = Number(byId.get('sensor.pixel_10_steps_sensor')?.state);
      if (Number.isFinite(p10Steps) && p10Steps > 0) {
        pixelPhoneSteps = p10Steps;
        if (p10Steps > steps) {
          steps = p10Steps;
        }
        activeSources.push('Pixel 10');
      }

      // Pixel 10 Weight sensor (stored in grams e.g. 85500.0 g -> 85.5 kg)
      const p10WeightRaw = Number(byId.get('sensor.pixel_10_weight')?.state);
      if (Number.isFinite(p10WeightRaw) && p10WeightRaw > 0) {
        weightKg = p10WeightRaw > 500 ? Number((p10WeightRaw / 1000).toFixed(1)) : p10WeightRaw;
      }

      // Thomas' Pixel Watch battery & any enabled heart rate sensors
      const watchBat = Number(byId.get('sensor.thomas_pixel_watch_battery_level')?.state);
      if (Number.isFinite(watchBat)) {
        pixelWatchBattery = watchBat;
        activeSources.push(`Pixel Watch (${watchBat}%)`);
      }

      // Auto-detect any heart_rate or resting_heart_rate sensor on Pixel Watch / Pixel 10
      for (const st of states) {
        if (st.entity_id.startsWith('sensor.thassi_')) continue;
        const val = Number(st.state);
        if (!Number.isFinite(val) || val <= 0) continue;

        if (/resting_heart_rate/i.test(st.entity_id)) {
          restingHr = Math.round(val);
        } else if (/heart_rate|heartrate/i.test(st.entity_id)) {
          currentHr = Math.round(val);
        } else if (/daily_steps/i.test(st.entity_id) && val > steps) {
          steps = Math.round(val);
        }
      }
    } catch {
      // HA offline fallback
    }

    // B) Pull from Google Fitness REST API if Google OAuth2 is authorized
    const googleStatus = ctx.google.getStatus();
    if (googleStatus.authorized) {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const aggRes = await ctx.google.googleFetch<{
          bucket?: Array<{
            dataset?: Array<{
              dataSourceId?: string;
              point?: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }>;
            }>;
          }>;
        }>('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
          method: 'POST',
          body: JSON.stringify({
            aggregateBy: [
              { dataTypeName: 'com.google.step_count.delta' },
              { dataTypeName: 'com.google.heart_rate.bpm' },
            ],
            bucketByTime: { durationMillis: 86400000 },
            startTimeMillis: startOfDay.getTime(),
            endTimeMillis: Date.now(),
          }),
        });

        const datasets = aggRes.bucket?.[0]?.dataset || [];
        for (const ds of datasets) {
          const pts = ds.point || [];
          if (ds.dataSourceId?.includes('step_count') && pts.length > 0) {
            const fitSteps = pts.reduce((s, p) => s + (p.value?.[0]?.intVal || 0), 0);
            if (fitSteps > steps) steps = fitSteps;
            activeSources.push('Google Fit API');
          }
          if (ds.dataSourceId?.includes('heart_rate') && pts.length > 0) {
            const lastPt = pts[pts.length - 1];
            const bpm = lastPt?.value?.[0]?.fpVal || lastPt?.value?.[0]?.intVal;
            if (bpm && bpm > 35) currentHr = Math.round(bpm);
          }
        }
      } catch {
        // Ignore if Fitness API hasn't recorded points today yet
      }
    }

    // C) Calculate 7-day baseline RHR and Readiness Score
    const recentRows = ctx.db.query<BiometricDayRow>(
      'SELECT * FROM daily_biometrics ORDER BY log_date DESC LIMIT 7'
    );
    const baselineRhr =
      recentRows.length > 0
        ? recentRows.reduce((s, r) => s + r.resting_hr, 0) / recentRows.length
        : 57;

    const yesterdayWorkout = ctx.db.queryOne<WorkoutLogRow>(
      'SELECT * FROM workout_logs WHERE workout_date = ? ORDER BY id DESC LIMIT 1',
      [formatDateOffset(1)]
    );

    const readiness = calculateReadinessScore({
      restingHr,
      baselineRestingHr: baselineRhr,
      sleepHours,
      yesterdayStrain: yesterdayWorkout?.rpe_load ?? 5,
      steps,
    });

    const sourceLabel = activeSources.length > 0 ? activeSources.join(' + ') : todayRow.source;

    ctx.db.execute(
      `UPDATE daily_biometrics
       SET steps = ?, current_hr = ?, resting_hr = ?, sleep_hours = ?, weight_kg = ?, readiness_score = ?, source = ?, updated_at = ?
       WHERE log_date = ?`,
      [
        steps,
        currentHr,
        restingHr,
        sleepHours,
        weightKg,
        readiness.score,
        sourceLabel,
        new Date().toISOString(),
        today,
      ]
    );

    // D) Publish 5 Live Sensors to Home Assistant & /data/shared.db
    const hrZoneInfo = getHrZone(currentHr);
    const weeklyWorkoutsCount =
      ctx.db.queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM workout_logs WHERE workout_date >= ?',
        [formatDateOffset(7)]
      )?.cnt ?? 0;

    ctx.sharedDb.kvSet('google_health_today', {
      date: today,
      steps,
      stepGoal: todayRow.step_goal,
      currentHr,
      restingHr,
      sleepHours,
      weightKg,
      readinessScore: readiness.score,
      readinessStatus: readiness.status,
      recommendation: readiness.recommendation,
      pixelWatchBattery,
      updatedAt: new Date().toISOString(),
    });

    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor('readiness_score', readiness.score, {
        friendly_name: 'Daily Readiness Score',
        unit_of_measurement: '/100',
        icon: 'mdi:lightning-bolt-circle',
        status: readiness.status,
        recommendation: readiness.recommendation,
        resting_hr_bpm: restingHr,
        sleep_hours: sleepHours,
        weight_kg: weightKg,
      });

      await ctx.ha.publishSensor('daily_steps', steps, {
        friendly_name: 'Daily Steps',
        unit_of_measurement: 'steps',
        icon: 'mdi:walk',
        step_goal: todayRow.step_goal,
        goal_progress_pct: Math.round((steps / todayRow.step_goal) * 100),
        pixel_10_sensor: pixelPhoneSteps,
      });

      await ctx.ha.publishSensor('heart_rate', currentHr, {
        friendly_name: 'Current Heart Rate',
        unit_of_measurement: 'bpm',
        icon: 'mdi:heart-pulse',
        hr_zone: hrZoneInfo.zone,
      });

      await ctx.ha.publishSensor('resting_heart_rate', restingHr, {
        friendly_name: 'Resting Heart Rate (RHR)',
        unit_of_measurement: 'bpm',
        icon: 'mdi:heart-outline',
        baseline_7d_bpm: Number(baselineRhr.toFixed(1)),
      });

      await ctx.ha.publishSensor('weekly_workouts', weeklyWorkoutsCount, {
        friendly_name: 'Weekly Completed Workouts',
        unit_of_measurement: 'workouts',
        icon: 'mdi:dumbbell',
      });
    }

    return {
      today: ctx.db.queryOne<BiometricDayRow>(
        'SELECT * FROM daily_biometrics WHERE log_date = ?',
        [today]
      )!,
      readiness,
      hrZone: hrZoneInfo,
      baselineRhr: Number(baselineRhr.toFixed(1)),
      pixelWatchBattery,
      pixelPhoneSteps,
    };
  }

  // 2. REST API Endpoints (/api/apps/google-health/*)

  ctx.route('GET', '/dashboard', async (_req, { db, sharedDb, google }) => {
    const syncState = await syncHealthDataAndPublishSensors();
    const history = db.query<BiometricDayRow>(
      'SELECT * FROM daily_biometrics ORDER BY log_date DESC LIMIT 7'
    );
    const workoutOptions = db.query<WorkoutOptionRow>(
      'SELECT * FROM workout_options ORDER BY min_readiness DESC'
    );
    const workoutLogs = db.query<WorkoutLogRow>(
      'SELECT * FROM workout_logs ORDER BY workout_date DESC, id DESC LIMIT 20'
    );

    const mealPlannerToday = sharedDb.kvGet<{
      date: string;
      dinner: string | null;
      totalCalories: number;
      totalProtein: number;
    }>('meal_planner_today');

    return {
      ...syncState,
      history,
      workoutOptions: workoutOptions.map((w) => ({
        ...w,
        exercisesList: JSON.parse(w.exercises || '[]') as string[],
      })),
      workoutLogs,
      mealPlannerToday: mealPlannerToday || null,
      googleOAuth: google.getStatus(),
    };
  });

  // Update today's biometrics manually or from wearable quick-check
  ctx.route('POST', '/biometrics', async (req, { db }) => {
    const body = (req.body || {}) as Partial<BiometricDayRow>;
    const today = formatDateOffset(0);
    const existing = db.queryOne<BiometricDayRow>(
      'SELECT * FROM daily_biometrics WHERE log_date = ?',
      [today]
    );
    if (!existing) {
      return { status: 404, body: { error: 'Today row not initialized' } };
    }

    db.execute(
      `UPDATE daily_biometrics
       SET steps = ?,
           step_goal = ?,
           current_hr = ?,
           resting_hr = ?,
           sleep_hours = ?,
           active_calories = ?,
           weight_kg = ?,
           updated_at = ?
       WHERE log_date = ?`,
      [
        Number(body.steps ?? existing.steps),
        Number(body.step_goal ?? existing.step_goal),
        Number(body.current_hr ?? existing.current_hr),
        Number(body.resting_hr ?? existing.resting_hr),
        Number(body.sleep_hours ?? existing.sleep_hours),
        Number(body.active_calories ?? existing.active_calories),
        Number(body.weight_kg ?? existing.weight_kg),
        new Date().toISOString(),
        today,
      ]
    );

    const updated = await syncHealthDataAndPublishSensors();
    return { updated: true, ...updated };
  });

  // Log a completed workout (and add its calories to today's active burn!)
  ctx.route('POST', '/workouts/log', async (req, { db }) => {
    const body = (req.body || {}) as Partial<WorkoutLogRow>;
    if (!body.title?.trim()) {
      return { status: 400, body: { error: 'Workout title is required' } };
    }
    const today = formatDateOffset(0);
    const calBurned = Number(body.calories_burned || 350);

    db.execute(
      `INSERT INTO workout_logs (workout_date, title, category, duration_min, avg_hr, calories_burned, rpe_load, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.workout_date || today,
        body.title.trim(),
        body.category || 'strength',
        Number(body.duration_min || 45),
        Number(body.avg_hr || 138),
        calBurned,
        Number(body.rpe_load || 7),
        (body.notes || '').trim(),
      ]
    );

    // Add burned calories + estimated steps to today's biometrics
    db.execute(
      `UPDATE daily_biometrics
       SET active_calories = active_calories + ?
       WHERE log_date = ?`,
      [calBurned, today]
    );

    const updated = await syncHealthDataAndPublishSensors();
    return { logged: true, ...updated };
  });

  ctx.route('DELETE', '/workouts/log', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM workout_logs WHERE id = ?', [id]);
    await syncHealthDataAndPublishSensors();
    return { deleted: id };
  });

  // 3. Scheduled Background Cron Job (every 15 minutes)
  ctx.scheduleJob({
    id: 'sync-google-health',
    name: 'Sync Pixel Watch / Google Health & Publish Readiness Sensors',
    description:
      'Syncs daily steps, heart rate, RHR, and weight from HA & Google Fit, recalculates Readiness Score, and updates 5 HA sensors.',
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const res = await syncHealthDataAndPublishSensors();
      return `Readiness: ${res.readiness.score}/100 (${res.readiness.status}) | Steps: ${res.today.steps} | HR: ${res.today.current_hr} bpm (RHR: ${res.today.resting_hr} bpm)`;
    },
  });
});
