import { Platform } from 'react-native';
import { supabase } from './supabase';

// ---------- Types ----------

export interface RunActivity {
  date: string;       // YYYY-MM-DD
  distanceKm: number;
  durationMinutes: number;
}

// ---------- iOS (Apple HealthKit) ----------

async function requestHealthKitPermissions(): Promise<boolean> {
  const AppleHealthKit = require('react-native-health').default;
  const permissions = {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
        AppleHealthKit.Constants.Permissions.Workout,
      ],
    },
  };

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(permissions, (err: any) => {
      resolve(!err);
    });
  });
}

async function fetchHealthKitRuns(sinceDaysAgo: number = 30): Promise<RunActivity[]> {
  const AppleHealthKit = require('react-native-health').default;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - sinceDaysAgo);

  return new Promise((resolve) => {
    AppleHealthKit.getSamples(
      {
        typeIdentifier: 'HKWorkoutTypeIdentifier',
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      (err: any, results: any[]) => {
        if (err || !results) {
          resolve([]);
          return;
        }

        const runs: RunActivity[] = results
          .filter(
            (w: any) =>
              w.activityName === 'Running' ||
              w.activityId === 37 || // HKWorkoutActivityTypeRunning
              w.workoutActivityType === 37,
          )
          .map((w: any) => {
            const start = new Date(w.start || w.startDate);
            const end = new Date(w.end || w.endDate);
            const durationMin = (end.getTime() - start.getTime()) / 60000;
            const distKm = w.distance ? Number(w.distance) / 1000 : 0;
            return {
              date: start.toISOString().slice(0, 10),
              distanceKm: Math.round(distKm * 100) / 100,
              durationMinutes: Math.round(durationMin),
            };
          });

        resolve(runs);
      },
    );
  });
}

// ---------- Android (Health Connect) ----------

async function requestHealthConnectPermissions(): Promise<boolean> {
  try {
    const {
      initialize,
      requestPermission,
    } = require('expo-health-connect');

    const initialized = await initialize();
    if (!initialized) return false;

    await requestPermission([
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'Distance' },
    ]);

    return true;
  } catch (e) {
    console.warn('Health Connect permission error', e);
    return false;
  }
}

async function fetchHealthConnectRuns(sinceDaysAgo: number = 30): Promise<RunActivity[]> {
  try {
    const { readRecords } = require('expo-health-connect');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - sinceDaysAgo);

    const result = await readRecords('ExerciseSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    const runs: RunActivity[] = (result || [])
      .filter(
        (session: any) =>
          session.exerciseType === 'running' ||
          session.exerciseType === 56 || // EXERCISE_TYPE_RUNNING
          session.exerciseType === 'RUNNING',
      )
      .map((session: any) => {
        const start = new Date(session.startTime);
        const end = new Date(session.endTime);
        const durationMin = (end.getTime() - start.getTime()) / 60000;

        let distKm = 0;
        if (session.distance) {
          distKm = Number(session.distance) / 1000;
        }

        return {
          date: start.toISOString().slice(0, 10),
          distanceKm: Math.round(distKm * 100) / 100,
          durationMinutes: Math.round(durationMin),
        };
      });

    return runs;
  } catch (e) {
    console.warn('Health Connect read error', e);
    return [];
  }
}

// ---------- Cross-platform public API ----------

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return requestHealthKitPermissions();
  }
  return requestHealthConnectPermissions();
}

export async function fetchRuns(sinceDaysAgo: number = 30): Promise<RunActivity[]> {
  if (Platform.OS === 'ios') {
    return fetchHealthKitRuns(sinceDaysAgo);
  }
  return fetchHealthConnectRuns(sinceDaysAgo);
}

/**
 * Sync health data to Supabase for the given member.
 * Skips duplicates by checking (member_id, run_date, distance_km).
 * Returns the count of newly inserted runs.
 */
export async function syncRunsToSupabase(memberId: string): Promise<number> {
  const runs = await fetchRuns(30);
  if (runs.length === 0) return 0;

  // Fetch existing logs for duplicate check
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: existing } = await supabase
    .from('running_logs')
    .select('run_date, distance_km')
    .eq('member_id', memberId)
    .gte('run_date', thirtyDaysAgo.toISOString().slice(0, 10));

  const existingSet = new Set(
    (existing || []).map(
      (r: any) => `${r.run_date}_${Number(r.distance_km)}`,
    ),
  );

  const newRuns = runs.filter(
    (r) => !existingSet.has(`${r.date}_${r.distanceKm}`),
  );

  if (newRuns.length === 0) return 0;

  // Insert new runs
  const rows = newRuns.map((r) => ({
    member_id: memberId,
    run_date: r.date,
    distance_km: r.distanceKm,
    duration_minutes: r.durationMinutes,
    memo: '건강 앱 자동 동기화',
  }));

  const { error } = await supabase.from('running_logs').insert(rows);
  if (error) throw error;

  // Update monthly_records for each affected month
  const affectedMonths = new Set(
    newRuns.map((r) => {
      const d = new Date(r.date);
      return `${d.getFullYear()}-${d.getMonth() + 1}`;
    }),
  );

  for (const ym of affectedMonths) {
    const [yearStr, monthStr] = ym.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data: logs } = await supabase
      .from('running_logs')
      .select('distance_km')
      .eq('member_id', memberId)
      .gte('run_date', startDate)
      .lt('run_date', endDate);

    const totalKm = (logs || []).reduce(
      (sum: number, l: any) => sum + Number(l.distance_km),
      0,
    );

    const { data: existingRecord } = await supabase
      .from('monthly_records')
      .select('id, achieved_km')
      .eq('member_id', memberId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (existingRecord) {
      await supabase
        .from('monthly_records')
        .update({ achieved_km: totalKm })
        .eq('id', existingRecord.id);
    } else {
      await supabase.from('monthly_records').insert({
        member_id: memberId,
        year,
        month,
        goal_km: 0,
        achieved_km: totalKm,
      });
    }
  }

  return newRuns.length;
}
