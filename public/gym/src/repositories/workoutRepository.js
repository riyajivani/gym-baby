import { db } from '../db/database.js';

/**
 * Retrieves a single workout by ID, populated with its exercises and sets.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getWorkout(id) {
  if (!id) return null;
  const workout = await db.workouts.get(id);
  if (!workout) return null;

  let exercises = await db.exercises.where('workoutId').equals(id).toArray();
  if (exercises && exercises.length > 0) {
    exercises.sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const ex of exercises) {
      const sets = await db.sets.where('exerciseId').equals(ex.id).toArray();
      sets.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
      ex.sets = sets;
    }
  } else if (Array.isArray(workout.exercises) && workout.exercises.length > 0) {
    exercises = workout.exercises;
  } else {
    exercises = [];
  }

  return {
    ...workout,
    exercises
  };
}

/**
 * Retrieves all workouts in history, sorted by date descending.
 * @returns {Promise<Array<Object>>}
 */
export async function getWorkoutHistory() {
  const workouts = await db.workouts.toArray();
  
  // Filter for completed workouts (exclude any in_progress sessions)
  const completedWorkouts = workouts.filter(w => w.status !== 'in_progress');

  // Sort workouts by date descending (newest first)
  completedWorkouts.sort((a, b) => {
    if (a.date === b.date) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }
    return b.date.localeCompare(a.date);
  });

  const populated = [];
  for (const w of completedWorkouts) {
    const full = await getWorkout(w.id);
    if (full) populated.push(full);
  }

  return populated;
}

/**
 * Creates a new workout session with structured exercises and sets.
 * @param {Object} workoutData 
 * @returns {Promise<Object>}
 */
export async function createWorkout(workoutData) {
  const workoutId = workoutData.id || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newWorkout = {
    id: workoutId,
    date: workoutData.date || new Date().toISOString().split('T')[0],
    name: workoutData.name || workoutData.title || 'Workout Session',
    weekLabel: workoutData.weekLabel || workoutData.name || 'Workout Session',
    status: workoutData.status || 'completed',
    templateId: workoutData.templateId || null,
    startedAt: workoutData.startedAt || now,
    completedAt: workoutData.completedAt || now,
    durationMinutes: workoutData.durationMinutes !== undefined ? workoutData.durationMinutes : null,
    bodyWeight: workoutData.bodyWeight !== undefined ? workoutData.bodyWeight : null,
    cardio: workoutData.cardio || [],
    updatedAt: now
  };

  await db.transaction('rw', [db.workouts, db.exercises, db.sets], async () => {
    await db.workouts.put(newWorkout);

    if (workoutData.exercises && Array.isArray(workoutData.exercises)) {
      for (let exIdx = 0; exIdx < workoutData.exercises.length; exIdx++) {
        const ex = workoutData.exercises[exIdx];
        const exerciseId = ex.id || `ex-${workoutId}-${exIdx + 1}`;

        await db.exercises.put({
          id: exerciseId,
          workoutId: workoutId,
          name: ex.name,
          category: ex.category || 'Other',
          targetScheme: ex.targetScheme || '3x8-12',
          target: ex.target || '',
          targetWeight: ex.targetWeight !== undefined ? ex.targetWeight : null,
          minReps: ex.minReps !== undefined ? ex.minReps : null,
          maxReps: ex.maxReps !== undefined ? ex.maxReps : null,
          rir: ex.rir !== undefined ? ex.rir : null,
          order: exIdx + 1
        });

        if (ex.sets && Array.isArray(ex.sets)) {
          for (let setIdx = 0; setIdx < ex.sets.length; setIdx++) {
            const s = ex.sets[setIdx];
            const setId = s.id || `set-${exerciseId}-${setIdx + 1}`;

            await db.sets.put({
              id: setId,
              exerciseId: exerciseId,
              setNumber: s.setNumber || (setIdx + 1),
              targetWeight: s.targetWeight !== undefined ? parseFloat(s.targetWeight) || 0 : (ex.targetWeight || 0),
              targetReps: s.targetReps !== undefined ? parseInt(s.targetReps) || 0 : (ex.maxReps || 10),
              weight: s.weight !== undefined ? parseFloat(s.weight) || 0 : 0,
              reps: s.reps !== undefined ? parseInt(s.reps) || 0 : 0,
              completed: s.completed !== undefined ? Boolean(s.completed) : false,
              rawWeightText: s.rawWeightText || `${s.weight || 0} kg`
            });
          }
        }
      }
    }
  });

  return await getWorkout(workoutId);
}

/**
 * Updates an existing workout session and its nested exercises/sets.
 * @param {string} id 
 * @param {Object} workoutData 
 * @returns {Promise<Object>}
 */
export async function updateWorkout(id, workoutData) {
  const existing = await db.workouts.get(id);
  const now = Date.now();

  const updatedWorkout = {
    id: id,
    date: workoutData.date || existing?.date || new Date().toISOString().split('T')[0],
    name: workoutData.name || existing?.name || 'Workout Session',
    weekLabel: workoutData.weekLabel || existing?.weekLabel || workoutData.name || 'Workout Session',
    status: workoutData.status || existing?.status || 'completed',
    templateId: workoutData.templateId || existing?.templateId || null,
    startedAt: workoutData.startedAt || existing?.startedAt || null,
    completedAt: workoutData.completedAt || existing?.completedAt || null,
    durationMinutes: workoutData.durationMinutes !== undefined ? workoutData.durationMinutes : (existing?.durationMinutes || null),
    bodyWeight: workoutData.bodyWeight !== undefined ? workoutData.bodyWeight : (existing?.bodyWeight || null),
    cardio: workoutData.cardio || existing?.cardio || [],
    updatedAt: now
  };

  await db.transaction('rw', [db.workouts, db.exercises, db.sets], async () => {
    await db.workouts.put(updatedWorkout);

    // Delete existing exercises and sets for this workout
    const oldExercises = await db.exercises.where('workoutId').equals(id).toArray();
    const oldExIds = oldExercises.map(e => e.id);
    
    if (oldExIds.length > 0) {
      await db.sets.where('exerciseId').anyOf(oldExIds).delete();
      await db.exercises.where('workoutId').equals(id).delete();
    }

    // Insert new exercises & sets
    if (workoutData.exercises && Array.isArray(workoutData.exercises)) {
      for (let exIdx = 0; exIdx < workoutData.exercises.length; exIdx++) {
        const ex = workoutData.exercises[exIdx];
        const exerciseId = ex.id || `ex-${id}-${exIdx + 1}`;

        await db.exercises.put({
          id: exerciseId,
          workoutId: id,
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
            const setId = s.id || `set-${exerciseId}-${setIdx + 1}`;

            await db.sets.put({
              id: setId,
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
  });

  return await getWorkout(id);
}

/**
 * Deletes a workout session and all associated exercises and sets.
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteWorkout(id) {
  await db.transaction('rw', [db.workouts, db.exercises, db.sets], async () => {
    const exercises = await db.exercises.where('workoutId').equals(id).toArray();
    const exIds = exercises.map(e => e.id);

    if (exIds.length > 0) {
      await db.sets.where('exerciseId').anyOf(exIds).delete();
      await db.exercises.where('workoutId').equals(id).delete();
    }

    await db.workouts.delete(id);
  });
}
