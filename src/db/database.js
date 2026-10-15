import Dexie from 'dexie';
import { parseGymLog } from '../parser.js';
import { seedDefaultTemplatesIfEmpty } from '../repositories/templateRepository.js';

export const db = new Dexie('YeshuGymDB');

// Define database schema
db.version(1).stores({
  workouts: 'id, date, name, weekLabel, updatedAt',
  exercises: 'id, workoutId, name, category',
  sets: 'id, exerciseId, setNumber',
  settings: 'key'
});

db.version(2).stores({
  workouts: 'id, date, name, weekLabel, status, updatedAt',
  templates: 'id, name, updatedAt'
});


/**
 * Permanently clears all workout sessions, exercises, sets, and active sessions
 * while leaving routine templates intact.
 */
export async function clearAllWorkoutData() {
  await db.transaction('rw', [db.workouts, db.exercises, db.sets, db.settings, db.templates], async () => {
    await db.sets.clear();
    await db.exercises.clear();
    await db.workouts.clear();
    await db.settings.delete('active_workout_session');
  });

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('yeshugym_active_session');
      localStorage.removeItem('forgegym_active_session');
      localStorage.removeItem('yeshu_gym_tracker_data_v8_complete');
    } catch (e) {
      console.warn('Could not clear localStorage keys:', e);
    }
  }

  // Ensure default templates are kept/seeded
  await seedDefaultTemplatesIfEmpty();

  // Ensure default settings
  const existingSettings = await db.settings.get('settings');
  if (!existingSettings) {
    await db.settings.put({ key: 'settings', value: { weekStartDay: 'Monday' } });
  }
}

/**
 * Initializes the database cleanly with routine templates and no preloaded mock data
 */
export async function initDatabase() {
  // Ensure default templates are seeded
  await seedDefaultTemplatesIfEmpty();

  // One-time automatic cleanup to wipe legacy mock/sample data
  const CLEAN_FLAG_KEY = 'yeshu_gym_clean_data_v1';
  let hasBeenCleaned = false;
  try {
    if (typeof localStorage !== 'undefined') {
      hasBeenCleaned = localStorage.getItem(CLEAN_FLAG_KEY) === 'true';
    }
  } catch (e) {}

  if (!hasBeenCleaned) {
    await clearAllWorkoutData();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CLEAN_FLAG_KEY, 'true');
      }
    } catch (e) {}
    return;
  }

  // Ensure default settings exist
  const existingSettings = await db.settings.get('settings');
  if (!existingSettings) {
    await db.settings.put({ key: 'settings', value: { weekStartDay: 'Monday' } });
  }
}

/**
 * Helper to bulk insert populated sessions into normalized tables (workouts, exercises, sets)
 */
export async function insertPopulatedHistory(historyList) {
  await db.transaction('rw', [db.workouts, db.exercises, db.sets], async () => {
    for (const session of historyList) {
      const workoutId = session.id || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Put Workout
      await db.workouts.put({
        id: workoutId,
        date: session.date || new Date().toISOString().split('T')[0],
        name: session.name || session.title || 'Workout Session',
        weekLabel: session.weekLabel || session.name || 'Workout Session',
        status: session.status || 'completed',
        bodyWeight: session.bodyWeight !== undefined ? session.bodyWeight : null,
        cardio: session.cardio || [],
        updatedAt: Date.now()
      });

      // Put Exercises & Sets
      if (session.exercises && Array.isArray(session.exercises)) {
        for (let exIdx = 0; exIdx < session.exercises.length; exIdx++) {
          const ex = session.exercises[exIdx];
          const exerciseId = ex.id || `ex-${workoutId}-${exIdx + 1}`;

          await db.exercises.put({
            id: exerciseId,
            workoutId: workoutId,
            name: ex.name,
            category: ex.category || 'Other',
            targetScheme: ex.targetScheme || '3x8-12',
            target: ex.target || '',
            rir: ex.rir !== undefined ? ex.rir : null,
            order: exIdx + 1
          });

          if (ex.sets && Array.isArray(ex.sets)) {
            for (let setIdx = 0; setIdx < ex.sets.length; setIdx++) {
              const s = ex.sets[setIdx];
              const setKey = s.id || `set-${exerciseId}-${setIdx + 1}`;

              await db.sets.put({
                id: setKey,
                exerciseId: exerciseId,
                setNumber: s.setNumber || (setIdx + 1),
                weight: s.weight !== undefined ? parseFloat(s.weight) || 0 : 0,
                reps: s.reps !== undefined ? parseInt(s.reps) || 0 : 0,
                completed: s.completed !== undefined ? Boolean(s.completed) : true,
                rawWeightText: s.rawWeightText || `${s.weight || 0} kg`
              });
            }
          }
        }
      }
    }
  });
}
