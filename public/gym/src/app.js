/**
 * Yeshu Gym Tracker — Application Bootstrap & Orchestrator
 * Clean, modular entry point initializing local database, navigation router, and screen controllers.
 */


// Database & State Management
import { initDatabase } from './db/database.js';
import { loadInitialState } from './state.js';

// Connectivity & Router
import { initNetworkAndPwaStatus } from './ui/pwa.js';
import { initNavigation, registerTabRenderer, switchTab } from './ui/navigation.js';

// Screen Views & Controllers
import { initHomeScreen, renderHomeScreen } from './ui/homeView.js';
import { initWorkoutScreen, renderActiveWorkoutScreen } from './ui/workoutView.js';
import { initHistoryScreen, renderHistoryScreen } from './ui/historyView.js';
import { initProgressScreen, renderProgressScreen } from './ui/progressView.js';
import { initSettingsScreen, renderSettingsScreen } from './ui/settingsView.js';

// Interactive Overlays & Modals
import { initRestTimer } from './ui/restTimer.js';
import { initModals } from './ui/modals.js';
import { initCustomSelects } from './ui/customSelect.js';

// Register PWA Service Worker for offline gym usage
// PWA registration skipped in hosted preview

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Network connectivity detection & PWA install prompts
  initNetworkAndPwaStatus();

  // 2. Initialize Dexie IndexedDB (creates schema v1 & upgrades to v2)
  await initDatabase();

  // 3. Load Settings, Templates, Completed Workout History, and Active Session
  await loadInitialState();

  // 4. Register View Renderers for Bottom Tab Router
  registerTabRenderer('home', renderHomeScreen);
  registerTabRenderer('workout', renderActiveWorkoutScreen);
  registerTabRenderer('history', renderHistoryScreen);
  registerTabRenderer('progress', renderProgressScreen);
  registerTabRenderer('settings', renderSettingsScreen);

  // 5. Initialize UI Event Handlers across Views
  initNavigation();
  initHomeScreen();
  initWorkoutScreen();
  initHistoryScreen();
  initProgressScreen();
  initSettingsScreen();
  initRestTimer();
  initModals();
  initCustomSelects();

  // 6. Restore saved active tab across page refreshes (default to home)
  let initialTab = 'home';
  try {
    initialTab = localStorage.getItem('yeshu_active_tab') || 'home';
  } catch (e) {}

  // 7. Initial render of home for baseline data, then transition to saved tab
  await renderHomeScreen();
  if (initialTab !== 'home') {
    switchTab(initialTab);
  }
});
