/**
 * Central Application State Management
 * Single source of truth for workouts, routines, active session, and preferences.
 */

import { getWorkoutHistory } from './repositories/workoutRepository.js';
import { getTemplates, getDefaultTemplate } from './repositories/templateRepository.js';
import { getActiveSession, saveActiveSession, clearActiveSession } from './repositories/sessionRepository.js';
import { getSettings, updateSettings } from './repositories/settingsRepository.js';

export const appState = {
  history: [],
  templates: [],
  selectedTemplateId: 'tpl-upper-body',
  activeSession: null,
  currentExerciseIndex: 0,
  settings: { weekStartDay: 'Monday' },
  muscleChartInstance: null,

  // Concurrency & Guard Flags
  isStartingWorkout: false,
  isFinishingWorkout: false
};

/**
 * Loads all initial data from IndexedDB into application state
 */
export async function loadInitialState() {
  appState.settings = await getSettings();
  appState.templates = await getTemplates();
  appState.selectedTemplateId = appState.settings.selectedTemplateId || appState.templates[0]?.id || 'tpl-upper-body';
  appState.history = await getWorkoutHistory();

  appState.activeSession = await getActiveSession();
  if (appState.activeSession) {
    appState.currentExerciseIndex = appState.activeSession.currentExerciseIndex || 0;
  } else {
    appState.currentExerciseIndex = 0;
  }

  return appState;
}

/**
 * Re-fetches completed workouts history from IndexedDB
 */
export async function reloadHistory() {
  appState.history = await getWorkoutHistory();
  return appState.history;
}

/**
 * Re-fetches templates from IndexedDB
 */
export async function reloadTemplates() {
  appState.templates = await getTemplates();
  return appState.templates;
}

/**
 * Re-fetches settings from IndexedDB
 */
export async function reloadSettings() {
  appState.settings = await getSettings();
  return appState.settings;
}

/**
 * Updates selected template ID and persists to settings in IndexedDB
 */
export async function setSelectedTemplateId(templateId) {
  appState.selectedTemplateId = templateId;
  appState.settings.selectedTemplateId = templateId;
  await updateSettings(appState.settings);
}

/**
 * Persists the current active session state to IndexedDB
 */
export async function persistActiveSession() {
  if (appState.activeSession) {
    appState.activeSession.currentExerciseIndex = appState.currentExerciseIndex;
    await saveActiveSession(appState.activeSession);
  }
}

/**
 * Clears the active workout session in both state and IndexedDB
 */
export async function clearActiveSessionState() {
  await clearActiveSession();
  appState.activeSession = null;
  appState.currentExerciseIndex = 0;
}
