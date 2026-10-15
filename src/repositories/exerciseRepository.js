import { db } from '../db/database.js';

/**
 * Saves or updates a specific set for an exercise.
 * @param {string} exerciseId 
 * @param {number} setNumber 
 * @param {Object} setObj ({ weight, reps, completed, rawWeightText })
 * @returns {Promise<Object>}
 */
export async function saveExerciseSet(exerciseId, setNumber, setObj) {
  const existingSets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  let targetSet = existingSets.find(s => s.setNumber === setNumber);

  const setId = targetSet ? targetSet.id : `set-${exerciseId}-${setNumber}`;
  const updatedSet = {
    id: setId,
    exerciseId: exerciseId,
    setNumber: setNumber,
    weight: setObj.weight !== undefined ? parseFloat(setObj.weight) || 0 : (targetSet?.weight || 0),
    reps: setObj.reps !== undefined ? parseInt(setObj.reps) || 0 : (targetSet?.reps || 0),
    completed: setObj.completed !== undefined ? Boolean(setObj.completed) : (targetSet?.completed ?? true),
    rawWeightText: setObj.rawWeightText || `${setObj.weight || targetSet?.weight || 0} kg`
  };

  await db.sets.put(updatedSet);

  // Update parent workout's updatedAt timestamp
  const ex = await db.exercises.get(exerciseId);
  if (ex && ex.workoutId) {
    await db.workouts.update(ex.workoutId, { updatedAt: Date.now() });
  }

  return updatedSet;
}

/**
 * Retrieves the performance history of an exercise across all workout sessions.
 * @param {string} exerciseName 
 * @returns {Promise<Array<Object>>}
 */
export async function getExerciseHistory(exerciseName) {
  if (!exerciseName) return [];

  const lowerTarget = exerciseName.trim().toLowerCase();
  const allExercises = await db.exercises.toArray();
  const matchingEx = allExercises.filter(e => e.name.trim().toLowerCase() === lowerTarget);

  const historyEntries = [];

  for (const ex of matchingEx) {
    const workout = await db.workouts.get(ex.workoutId);
    if (!workout) continue;

    const sets = await db.sets.where('exerciseId').equals(ex.id).toArray();
    sets.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));

    let maxWeight = 0;
    let maxReps = 0;
    let totalVolume = 0;

    sets.forEach(s => {
      if (s.completed) {
        totalVolume += (s.weight * s.reps);
        if (s.weight > maxWeight || (s.weight === maxWeight && s.reps > maxReps)) {
          maxWeight = s.weight;
          maxReps = s.reps;
        }
      }
    });

    const est1RM = maxWeight > 0 ? parseFloat((maxWeight * (1 + maxReps / 30)).toFixed(1)) : 0;

    historyEntries.push({
      workoutId: workout.id,
      date: workout.date,
      workoutName: workout.name,
      exerciseName: ex.name,
      targetScheme: ex.targetScheme,
      target: ex.target,
      rir: ex.rir,
      sets: sets,
      maxWeight,
      maxReps,
      totalVolume,
      est1RM
    });
  }

  // Sort by workout date descending
  historyEntries.sort((a, b) => b.date.localeCompare(a.date));
  return historyEntries;
}

/**
 * Adds an exercise to a workout session.
 * @param {string} workoutId 
 * @param {Object} exerciseData 
 * @returns {Promise<Object>}
 */
export async function addExerciseToWorkout(workoutId, exerciseData) {
  const existing = await db.exercises.where('workoutId').equals(workoutId).toArray();
  const newOrder = existing.length + 1;
  const exerciseId = exerciseData.id || `ex-${workoutId}-${Date.now()}`;

  const newEx = {
    id: exerciseId,
    workoutId: workoutId,
    name: exerciseData.name,
    category: exerciseData.category || 'Other',
    targetScheme: exerciseData.targetScheme || '3x8-12',
    target: exerciseData.target || '',
    rir: exerciseData.rir !== undefined ? exerciseData.rir : 1,
    order: newOrder
  };

  await db.transaction('rw', [db.exercises, db.sets, db.workouts], async () => {
    await db.exercises.put(newEx);

    const sets = exerciseData.sets || [
      { setNumber: 1, weight: 20, reps: 10, completed: true },
      { setNumber: 2, weight: 20, reps: 10, completed: true },
      { setNumber: 3, weight: 20, reps: 10, completed: true }
    ];

    for (let setIdx = 0; setIdx < sets.length; setIdx++) {
      const s = sets[setIdx];
      await db.sets.put({
        id: `set-${exerciseId}-${setIdx + 1}`,
        exerciseId: exerciseId,
        setNumber: s.setNumber || (setIdx + 1),
        weight: parseFloat(s.weight) || 0,
        reps: parseInt(s.reps) || 0,
        completed: Boolean(s.completed),
        rawWeightText: s.rawWeightText || `${s.weight || 0} kg`
      });
    }

    await db.workouts.update(workoutId, { updatedAt: Date.now() });
  });

  return newEx;
}

/**
 * Deletes an exercise and its sets from IndexedDB.
 * @param {string} exerciseId 
 * @returns {Promise<void>}
 */
export async function deleteExercise(exerciseId) {
  const ex = await db.exercises.get(exerciseId);
  await db.transaction('rw', [db.exercises, db.sets, db.workouts], async () => {
    await db.sets.where('exerciseId').equals(exerciseId).delete();
    await db.exercises.delete(exerciseId);

    if (ex && ex.workoutId) {
      await db.workouts.update(ex.workoutId, { updatedAt: Date.now() });
    }
  });
}
