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

  // Purge any legacy seed/dummy biometrics and workouts so only real wearable & user data remain
  ctx.db.execute("DELETE FROM daily_biometrics WHERE source = 'seed'");
  ctx.db.execute(
    "DELETE FROM workout_logs WHERE notes IN ('Strong bench & pull-up progression', 'Nasal breathing steady Zone 2')"
  );

  let lastGoogleFitSyncMs = 0;
  let lastHaPublishMs = 0;

  const HA_HEALTH_ENTITY_IDS = [
    'sensor.pixel_10_daily_steps',
    'sensor.thomas_pixel_watch_daily_steps',
    'sensor.pixel_10_steps_sensor',
    'sensor.thomas_pixel_watch_heart_rate',
    'sensor.pixel_10_heart_rate',
    'sensor.pixel_10_resting_heart_rate',
    'sensor.pixel_10_heart_rate_variability',
    'sensor.pixel_10_sleep_duration',
    'sensor.pixel_10_total_calories_burned',
    'sensor.pixel_10_active_calories_burned',
    'sensor.pixel_10_daily_distance',
    'sensor.pixel_10_daily_floors',
    'sensor.pixel_10_respiratory_rate',
    'sensor.pixel_10_weight',
    'sensor.thomas_pixel_watch_battery_level',
  ] as const;

  /**
   * Syncs live biometrics from:
   * 1. Home Assistant wearable/companion sensors (Pixel 10 & Thomas' Pixel Watch)
   * 2. Google Fitness REST API (`ctx.google.googleFetch`) if Google OAuth2 is authorized
   * 3. Recalculates Readiness Score and publishes 5 live `sensor.thassi_google_health_*` entities to HA
   */
  async function syncHealthDataAndPublishSensors(options: { fastMode?: boolean } = {}) {
    const fastMode = Boolean(options.fastMode);
    const nowMs = Date.now();
    const today = formatDateOffset(0);
    let todayRow = ctx.db.queryOne<BiometricDayRow>(
      'SELECT * FROM daily_biometrics WHERE log_date = ?',
      [today]
    );

    if (!todayRow) {
      ctx.db.execute(
        `INSERT INTO daily_biometrics
         (log_date, steps, step_goal, current_hr, resting_hr, sleep_hours, active_calories, weight_kg, readiness_score, source, updated_at)
         VALUES (?, 0, 10000, 0, 0, 0, 0, 0, 0, 'ha_sensors', ?)`,
        [today, new Date().toISOString()]
      );
      todayRow = ctx.db.queryOne<BiometricDayRow>(
        'SELECT * FROM daily_biometrics WHERE log_date = ?',
        [today]
      )!;
    }

    let steps = todayRow.source === 'manual' ? todayRow.steps : 0;
    let currentHr = todayRow.source === 'manual' ? todayRow.current_hr : 0;
    let restingHr = todayRow.source === 'manual' ? todayRow.resting_hr : 0;
    let sleepHours = todayRow.source === 'manual' ? todayRow.sleep_hours : 0;
    let activeCalories = todayRow.source === 'manual' ? todayRow.active_calories : 0;
    let weightKg = todayRow.source === 'manual' ? todayRow.weight_kg : 0;
    let hrvMs: number | null = null;
    let distanceKm: number | null = null;
    let floors: number | null = null;
    let respiratoryRate: number | null = null;
    let pixelWatchBattery: number | null = null;
    let pixelPhoneSteps: number | null = null;
    const activeSources: string[] = [];
    let haConnected = false;

    // A) Pull from Home Assistant Companion App Sensors (Pixel 10 & Thomas' Pixel Watch)
    // Fetch only the specific wearable entities in parallel for sub-50ms response time
    try {
      const entityResults = await Promise.all(
        HA_HEALTH_ENTITY_IDS.map((id) => ctx.ha.getState(id).catch(() => null))
      );
      const byId = new Map<string, { state: string }>();
      for (const st of entityResults) {
        if (st && st.entity_id) {
          byId.set(st.entity_id, st);
          haConnected = true;
        }
      }

      // Prefer Health Connect daily_steps (16,060) over hardware steps_sensor since reboot (21,623)
      const p10DailySteps = Number(byId.get('sensor.pixel_10_daily_steps')?.state);
      const watchDailySteps = Number(byId.get('sensor.thomas_pixel_watch_daily_steps')?.state);
      const p10BootSteps = Number(byId.get('sensor.pixel_10_steps_sensor')?.state);

      if (Number.isFinite(p10DailySteps) && p10DailySteps > 0) {
        steps = Math.round(p10DailySteps);
        pixelPhoneSteps = steps;
        activeSources.push('Pixel 10 Health Connect');
      } else if (Number.isFinite(watchDailySteps) && watchDailySteps > 0) {
        steps = Math.round(watchDailySteps);
        pixelPhoneSteps = steps;
        activeSources.push('Pixel Watch');
      } else if (Number.isFinite(p10BootSteps) && p10BootSteps > 0) {
        steps = Math.round(p10BootSteps);
        pixelPhoneSteps = steps;
        activeSources.push('Pixel 10 Pedometer');
      }

      // Heart Rate & Resting Heart Rate
      const watchHr = Number(byId.get('sensor.thomas_pixel_watch_heart_rate')?.state);
      const p10Hr = Number(byId.get('sensor.pixel_10_heart_rate')?.state);
      if (Number.isFinite(watchHr) && watchHr > 0) {
        currentHr = Math.round(watchHr);
      } else if (Number.isFinite(p10Hr) && p10Hr > 0) {
        currentHr = Math.round(p10Hr);
      }

      const p10Rhr = Number(byId.get('sensor.pixel_10_resting_heart_rate')?.state);
      if (Number.isFinite(p10Rhr) && p10Rhr > 0) {
        restingHr = Math.round(p10Rhr);
      }

      // Heart Rate Variability (HRV)
      const p10Hrv = Number(byId.get('sensor.pixel_10_heart_rate_variability')?.state);
      if (Number.isFinite(p10Hrv) && p10Hrv > 0) {
        hrvMs = Math.round(p10Hrv);
      }

      // Sleep Duration (Health Connect reports minutes e.g. 511.0 min -> 8.5 h)
      const p10SleepRaw = Number(byId.get('sensor.pixel_10_sleep_duration')?.state);
      if (Number.isFinite(p10SleepRaw) && p10SleepRaw > 0) {
        sleepHours =
          p10SleepRaw > 1000
            ? Number((p10SleepRaw / 3600).toFixed(1))
            : p10SleepRaw > 24
            ? Number((p10SleepRaw / 60).toFixed(1))
            : Number(p10SleepRaw.toFixed(1));
      }

      // Calories Burned
      const p10TotalCal = Number(byId.get('sensor.pixel_10_total_calories_burned')?.state);
      const p10ActiveCal = Number(byId.get('sensor.pixel_10_active_calories_burned')?.state);
      if (Number.isFinite(p10TotalCal) && p10TotalCal > 0) {
        activeCalories = Math.round(p10TotalCal);
      } else if (Number.isFinite(p10ActiveCal) && p10ActiveCal > 0) {
        activeCalories = Math.round(p10ActiveCal);
      }

      // Daily Distance & Floors & Respiratory Rate
      const p10DistM = Number(byId.get('sensor.pixel_10_daily_distance')?.state);
      if (Number.isFinite(p10DistM) && p10DistM > 0) {
        distanceKm = Number((p10DistM / 1000).toFixed(2));
      }
      const p10Floors = Number(byId.get('sensor.pixel_10_daily_floors')?.state);
      if (Number.isFinite(p10Floors) && p10Floors > 0) {
        floors = Math.round(p10Floors);
      }
      const p10Resp = Number(byId.get('sensor.pixel_10_respiratory_rate')?.state);
      if (Number.isFinite(p10Resp) && p10Resp > 0) {
        respiratoryRate = Number(p10Resp.toFixed(1));
      }

      // Weight sensor (only if not 'unknown')
      const p10WeightRaw = Number(byId.get('sensor.pixel_10_weight')?.state);
      if (Number.isFinite(p10WeightRaw) && p10WeightRaw > 0) {
        weightKg = p10WeightRaw > 500 ? Number((p10WeightRaw / 1000).toFixed(1)) : p10WeightRaw;
      }

      // Thomas' Pixel Watch battery
      const watchBat = Number(byId.get('sensor.thomas_pixel_watch_battery_level')?.state);
      if (Number.isFinite(watchBat)) {
        pixelWatchBattery = watchBat;
        activeSources.push(`Pixel Watch (${watchBat}%)`);
      }
    } catch {
      // HA offline fallback
    }

    // B) Pull from Google Fitness REST API if Google OAuth2 is authorized (throttled in fastMode so it never blocks real-time HA polling)
    const googleStatus = ctx.google.getStatus();
    if (googleStatus.authorized && (!fastMode || nowMs - lastGoogleFitSyncMs > 30000)) {
      lastGoogleFitSyncMs = nowMs;
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
      'SELECT * FROM daily_biometrics WHERE resting_hr > 0 ORDER BY log_date DESC LIMIT 7'
    );
    const baselineRhr =
      recentRows.length > 0
        ? recentRows.reduce((s, r) => s + r.resting_hr, 0) / recentRows.length
        : restingHr || 65;

    const yesterdayWorkout = ctx.db.queryOne<WorkoutLogRow>(
      'SELECT * FROM workout_logs WHERE workout_date = ? ORDER BY id DESC LIMIT 1',
      [formatDateOffset(1)]
    );

    const hasRealMetrics = steps > 0 || currentHr > 0 || restingHr > 0 || sleepHours > 0;
    const readiness = hasRealMetrics
      ? calculateReadinessScore({
          restingHr: restingHr || 65,
          baselineRestingHr: baselineRhr,
          sleepHours: sleepHours || 7.0,
          yesterdayStrain: yesterdayWorkout?.rpe_load ?? 5,
          steps,
        })
      : {
          score: 0,
          status: 'Rest & Recover' as const,
          recommendation: 'No live biometric data received from Home Assistant or Google Fit yet.',
        };

    const sourceLabel = activeSources.length > 0 ? activeSources.join(' + ') : 'no_connection';

    ctx.db.execute(
      `UPDATE daily_biometrics
       SET steps = ?, current_hr = ?, resting_hr = ?, sleep_hours = ?, active_calories = ?, weight_kg = ?, readiness_score = ?, source = ?, updated_at = ?
       WHERE log_date = ?`,
      [
        steps,
        currentHr,
        restingHr,
        sleepHours,
        activeCalories,
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

    const livePayload = {
      date: today,
      steps,
      stepGoal: todayRow.step_goal,
      currentHr,
      restingHr,
      hrvMs,
      sleepHours,
      activeCalories,
      distanceKm,
      floors,
      respiratoryRate,
      weightKg: weightKg > 0 ? weightKg : null,
      readinessScore: readiness.score,
      readinessStatus: readiness.status,
      recommendation: readiness.recommendation,
      pixelWatchBattery,
      source: sourceLabel,
      updatedAt: new Date().toISOString(),
    };

    ctx.sharedDb.kvSet('google_health_today', livePayload);

    const shouldPublishHa = !fastMode || nowMs - lastHaPublishMs > 10000;
    if (shouldPublishHa && haConnected) {
      lastHaPublishMs = nowMs;
      const publishAll = async () => {
        await Promise.all([
          ctx.ha.publishSensor('readiness_score', readiness.score, {
            friendly_name: 'Daily Readiness Score',
            unit_of_measurement: '/100',
            icon: 'mdi:lightning-bolt-circle',
            status: readiness.status,
            recommendation: readiness.recommendation,
            resting_hr_bpm: restingHr,
            sleep_hours: sleepHours,
            weight_kg: weightKg,
          }),
          ctx.ha.publishSensor('daily_steps', steps, {
            friendly_name: 'Daily Steps',
            unit_of_measurement: 'steps',
            icon: 'mdi:walk',
            step_goal: todayRow.step_goal,
            goal_progress_pct: Math.round((steps / todayRow.step_goal) * 100),
            pixel_10_sensor: pixelPhoneSteps,
          }),
          ctx.ha.publishSensor('heart_rate', currentHr, {
            friendly_name: 'Current Heart Rate',
            unit_of_measurement: 'bpm',
            icon: 'mdi:heart-pulse',
            hr_zone: hrZoneInfo.zone,
          }),
          ctx.ha.publishSensor('resting_heart_rate', restingHr, {
            friendly_name: 'Resting Heart Rate (RHR)',
            unit_of_measurement: 'bpm',
            icon: 'mdi:heart-outline',
            baseline_7d_bpm: Number(baselineRhr.toFixed(1)),
          }),
          ctx.ha.publishSensor('weekly_workouts', weeklyWorkoutsCount, {
            friendly_name: 'Weekly Completed Workouts',
            unit_of_measurement: 'workouts',
            icon: 'mdi:dumbbell',
          }),
        ]);
      };
      if (fastMode) {
        void publishAll().catch(() => {});
      } else {
        await publishAll().catch(() => {});
      }
    }

    return {
      today: ctx.db.queryOne<BiometricDayRow>(
        'SELECT * FROM daily_biometrics WHERE log_date = ?',
        [today]
      )!,
      live: livePayload,
      readiness,
      hrZone: hrZoneInfo,
      baselineRhr: Number(baselineRhr.toFixed(1)),
      hrvMs,
      distanceKm,
      floors,
      respiratoryRate,
      pixelWatchBattery,
      pixelPhoneSteps,
      haConnected,
    };
  }

  // 2. REST API Endpoints (/api/apps/google-health/*)

  ctx.route('GET', '/live', async () => {
    const syncState = await syncHealthDataAndPublishSensors({ fastMode: true });
    return syncState.live;
  });

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
