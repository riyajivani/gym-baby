import { db } from '../db/database.js';

const SETTINGS_KEY = 'settings';

/**
 * Retrieves all application settings.
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const record = await db.settings.get(SETTINGS_KEY);
  return record ? record.value : { weekStartDay: 'Monday' };
}

/**
 * Updates application settings.
 * @param {Object} newSettings 
 * @returns {Promise<Object>}
 */
export async function updateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await db.settings.put({ key: SETTINGS_KEY, value: merged });
  return merged;
}

/**
 * Gets a single setting value by key name.
 * @param {string} key 
 * @param {*} defaultValue 
 * @returns {Promise<*>}
 */
export async function getSetting(key, defaultValue = null) {
  const settings = await getSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * Sets a single setting value by key name.
 * @param {string} key 
 * @param {*} value 
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await updateSettings(settings);
}
