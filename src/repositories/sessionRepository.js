import { db } from '../db/database.js';
import { createWorkout } from './workoutRepository.js';

const ACTIVE_SESSION_STORAGE_KEY = 'yeshugym_active_session';
const ACTIVE_SESSION_SETTING_KEY = 'active_workout_session';

/**
 * Retrieves the currently active in-progress workout session, if any.
 * Checks IndexedDB settings and localStorage for recovery after refresh/restart.
 * @returns {Promise<Object|null>}
 */
export async function getActiveSession() {
  try {
    // 1. Check IndexedDB settings store
    const dbRecord = await db.settings.get(ACTIVE_SESSION_SETTING_KEY);
    if (dbRecord && dbRecord.value && dbRecord.value.status === 'in_progress') {
      return dbRecord.value;
    }

    // 2. Fallback to localStorage
    if (typeof localStorage !== 'undefined') {
      const localRaw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || localStorage.getItem('forgegym_active_session');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (parsed && parsed.status === 'in_progress') {
          // Sync back into IndexedDB
          await db.settings.put({ key: ACTIVE_SESSION_SETTING_KEY, value: parsed });
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching active session:', err);
  }
  return null;
}

/**
 * Persists the active in-progress workout session locally.
 * Writes to both IndexedDB settings and localStorage for fast synchronous persistence.
 * @param {Object} session 
 * @returns {Promise<void>}
 */
export async function saveActiveSession(session) {
  if (!session) return;
  session.updatedAt = Date.now();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    await db.settings.put({ key: ACTIVE_SESSION_SETTING_KEY, value: session });
  } catch (err) {
    console.warn('Error saving active session:', err);
  }
}

/**
 * Clears the active session from local persistence (after completion or cancel).
 * @returns {Promise<void>}
 */
export async function clearActiveSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      localStorage.removeItem('forgegym_active_session');
    }
    await db.settings.delete(ACTIVE_SESSION_SETTING_KEY);
  } catch (err) {
    console.warn('Error clearing active session:', err);
  }
}

/**
 * Finds the most recent previous completed workout performance for an exercise.
 * @param {string} exerciseName 
 * @param {Array<Object>} historyList 
 * @returns {Object|null} { workoutDate, workoutName, sets, rir }
 */
export function getPreviousExercisePerformance(exerciseName, historyList) {
  if (!exerciseName || !Array.isArray(historyList) || historyList.length === 0) {
    return null;
  }

  const targetName = exerciseName.trim().toLowerCase();

  // Ensure history is ordered by date descending
  const sorted = [...historyList].sort((a, b) => {
    if (a.date === b.date) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }
    return (b.date || '').localeCompare(a.date || '');
  });

  for (const workout of sorted) {
    // Only search completed sessions
    if (workout.status === 'in_progress') continue;

    const matchEx = (workout.exercises || []).find(e =>
      e.name && e.name.trim().toLowerCase() === targetName
    );

    if (matchEx && Array.isArray(matchEx.sets) && matchEx.sets.length > 0) {
      return {
        workoutDate: workout.date,
        workoutName: workout.name,
        sets: matchEx.sets.map(s => ({
          setNumber: s.setNumber,
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0,
          completed: Boolean(s.completed)
        })),
        rir: matchEx.rir !== undefined && matchEx.rir !== null ? matchEx.rir : null
      };
    }
  }

  return null;
}

/**
 * Creates a fresh, uncompleted workout session from a template.
 * Sets start incomplete, target values are preserved, and previous performance is prefilled.
 * @param {Object} template 
 * @param {Array<Object>} historyList 
 * @param {Object} options 
 * @returns {Object} Fresh workout session
 */
export function createSessionFromTemplate(template, historyList = [], options = {}) {
  const sessionId = options.id || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const dateStr = options.date || new Date().toISOString().split('T')[0];

  const exercises = (template.exercises || []).map((tplEx, exIdx) => {
    const exerciseId = `ex-${sessionId}-${exIdx + 1}`;
    const previous = getPreviousExercisePerformance(tplEx.name, historyList);

    const targetSetsCount = tplEx.targetSets || 3;
    const sets = [];

    for (let setIdx = 0; setIdx < targetSetsCount; setIdx++) {
      const prevSet = previous?.sets?.[setIdx];

      // Prefill weight from previous workout where available, otherwise use template target weight
      const weight = prevSet?.weight !== undefined
        ? prevSet.weight
        : (tplEx.targetWeight !== undefined ? tplEx.targetWeight : 35);

      // Prefill suggested reps from previous workout where available, otherwise use template max reps
      const reps = prevSet?.reps !== undefined
        ? prevSet.reps
        : (tplEx.maxReps || 10);

      sets.push({
        id: `set-${exerciseId}-${setIdx + 1}`,
        exerciseId: exerciseId,
        setNumber: setIdx + 1,
        // Preserve template target values separately
        targetWeight: tplEx.targetWeight !== undefined ? tplEx.targetWeight : 35,
        targetReps: tplEx.maxReps || 10,
        // Actual values for today (prefilled for convenience)
        weight: weight,
        reps: reps,
        // Never copy previous completion status - always start incomplete!
        completed: false
      });
    }

    return {
      id: exerciseId,
      workoutId: sessionId,
      templateExerciseId: tplEx.id || null,
      name: tplEx.name,
      order: tplEx.order || (exIdx + 1),
      category: tplEx.category || 'Other',
      targetScheme: tplEx.targetScheme || `${targetSetsCount}×${tplEx.minReps || 8}–${tplEx.maxReps || 12}`,
      target: tplEx.target || `${tplEx.targetWeight || 35} kg`,
      targetWeight: tplEx.targetWeight,
      minReps: tplEx.minReps,
      maxReps: tplEx.maxReps,
      rir: null,
      sets: sets,
      previousPerformance: previous ? {
        date: previous.workoutDate,
        workoutName: previous.workoutName,
        sets: previous.sets,
        rir: previous.rir
      } : null
    };
  });

  // Deep clone cardio
  const cardio = (template.cardio || []).map(c => ({ ...c }));

  // Determine starting body weight from options or latest history
  let bodyWeight = null;
  if (options.bodyWeight !== undefined && options.bodyWeight !== null) {
    bodyWeight = options.bodyWeight;
  } else if (historyList.length > 0) {
    const withWeight = historyList.find(h => h.bodyWeight);
    if (withWeight) bodyWeight = withWeight.bodyWeight;
  }

  return {
    id: sessionId,
    templateId: template.id || null,
    name: template.name || 'Workout Session',
    weekLabel: template.name || 'Workout Session',
    date: dateStr,
    startedAt: now,
    completedAt: null,
    durationMinutes: null,
    status: 'in_progress',
    currentExerciseIndex: 0,
    bodyWeight: bodyWeight,
    exercises: exercises,
    cardio: cardio,
    updatedAt: now
  };
}

/**
 * Completes an active workout session, saves it permanently to IndexedDB,
 * and clears the in-progress session.
 * @param {Object} session 
 * @param {Object} completionData ({ bodyWeight, durationMinutes })
 * @returns {Promise<Object>} The saved completed workout
 */
export async function finishSession(session, completionData = {}) {
  if (!session) {
    throw new Error('No active session provided to finish.');
  }

  const now = Date.now();
  const startedAt = session.startedAt || now;
  const elapsedMinutes = Math.max(1, Math.round((now - startedAt) / 60000));
  const finalDuration = completionData.durationMinutes !== undefined
    ? completionData.durationMinutes
    : elapsedMinutes;

  const finalBodyWeight = completionData.bodyWeight !== undefined
    ? completionData.bodyWeight
    : (session.bodyWeight || null);

  const completedSession = {
    ...session,
    status: 'completed',
    completedAt: now,
    durationMinutes: finalDuration,
    bodyWeight: finalBodyWeight,
    updatedAt: now
  };

  // Save to IndexedDB workouts table
  const savedWorkout = await createWorkout(completedSession);

  // Clear active session from temporary persistence
  await clearActiveSession();

  return savedWorkout;
}
