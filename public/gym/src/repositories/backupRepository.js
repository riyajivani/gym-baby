import { db, insertPopulatedHistory } from '../db/database.js';
import { getWorkoutHistory } from './workoutRepository.js';
import { getSettings, updateSettings } from './settingsRepository.js';
import { seedDefaultTemplatesIfEmpty } from './templateRepository.js';

/**
 * Exports all IndexedDB workout data, templates, and settings as a JSON object.
 * @returns {Promise<Object>}
 */
export async function exportBackup() {
  const history = await getWorkoutHistory();
  const settings = await getSettings();
  let templates = [];
  try {
    templates = await db.templates.toArray();
  } catch (err) {
    console.warn('Could not export templates:', err);
  }

  const backupData = {
    app: 'Yeshu Gym',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings,
    templates: templates,
    history: history
  };

  return backupData;
}

/**
 * Validates a backup object structure.
 * @param {Object} data 
 * @returns {boolean}
 */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  // Check if either history array or activeSession + history exists
  const hasHistory = Array.isArray(data.history);
  const hasWorkouts = Array.isArray(data.workouts);
  const hasTemplates = Array.isArray(data.templates);

  if (!hasHistory && !hasWorkouts && !hasTemplates) {
    return false;
  }

  const historyList = data.history || data.workouts;
  if (!historyList || historyList.length === 0) return true;

  // Validate at least one workout object
  const sample = historyList[0];
  if (!sample || typeof sample !== 'object') return false;

  return Boolean(sample.name || sample.date || sample.exercises || sample.id);
}

/**
 * Imports a JSON backup object, validating and populating IndexedDB.
 * @param {Object} data 
 * @returns {Promise<void>}
 */
export async function importBackup(data) {
  if (!validateBackup(data)) {
    throw new Error("Invalid backup file structure. File must contain valid Yeshu Gym workout history.");
  }

  const historyList = data.history || data.workouts || [];
  const settingsData = data.settings || { weekStartDay: 'Monday' };
  const templatesList = data.templates;

  // Clear existing database tables
  await db.transaction('rw', [db.workouts, db.exercises, db.sets, db.settings, db.templates], async () => {
    await db.sets.clear();
    await db.exercises.clear();
    await db.workouts.clear();

    if (Array.isArray(templatesList) && templatesList.length > 0) {
      await db.templates.clear();
      for (const tpl of templatesList) {
        await db.templates.put(tpl);
      }
    }
  });

  // Re-populate workouts
  if (historyList.length > 0) {
    await insertPopulatedHistory(historyList);
  }

  // Ensure default templates if none were in backup
  await seedDefaultTemplatesIfEmpty();

  await updateSettings(settingsData);
}
