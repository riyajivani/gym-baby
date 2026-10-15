import Chart from 'chart.js/auto';
import { registerSW } from 'virtual:pwa-register';

import { initDatabase, clearAllWorkoutData } from './db/database.js';
import {
  getWorkout,
  createWorkout,
  deleteWorkout,
  getWorkoutHistory
} from './repositories/workoutRepository.js';
import {
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  createCustomTemplate,
  addExerciseToTemplate,
  removeExerciseFromTemplate,
  renameTemplate,
  deleteTemplate
} from './repositories/templateRepository.js';
import {
  getActiveSession,
  saveActiveSession,
  clearActiveSession,
  createSessionFromTemplate,
  finishSession,
  getPreviousExercisePerformance
} from './repositories/sessionRepository.js';
import {
  getSettings,
  updateSettings
} from './repositories/settingsRepository.js';
import {
  exportBackup,
  importBackup
} from './repositories/backupRepository.js';

import { parseGymLog, autoDetectCategory } from './parser.js';

// Service Worker Registration for PWA
registerSW({ immediate: true });

// Core Application State
let history = []; // Array of completed historical workouts
let templates = []; // Array of reusable workout templates
let selectedTemplateId = 'tpl-upper-body';
let activeSession = null; // Currently in-progress workout session (or null)
let currentExerciseIndex = 0;
let settings = { weekStartDay: 'Monday' };
let muscleChartInstance = null;

// Concurrency & Guard Flags
let isStartingWorkout = false;
let isFinishingWorkout = false;

// Rest Timer State
let timerInterval = null;
let timerSeconds = 90;
let timerRemaining = 90;
let timerRunning = false;
let deferredInstallPrompt = null;

const RIR_DESCRIPTIONS = {
  0: 'Max effort · Muscle failure (0 reps in reserve)',
  1: '1 rep left in tank · High intensity (near failure)',
  2: '2 reps left in tank · Target hypertrophy zone',
  3: '3 reps left in tank · Moderate effort',
  4: '4+ reps left in tank · Warm-up / Comfortable effort'
};

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.log('Audio feedback triggered');
  }
}

/* ----------------------------------------------------
   CUSTOM APP DIALOGS (NO BROWSER WINDOW.CONFIRM / ALERT)
---------------------------------------------------- */
function showCustomConfirm({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  okText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmPopupTitle');
    const msgEl = document.getElementById('confirmPopupMessage');
    const okBtn = document.getElementById('btnConfirmPopupOk');
    const cancelBtn = document.getElementById('btnConfirmPopupCancel');
    const iconBox = document.getElementById('confirmPopupIconBox');

    if (!modal || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    if (isDangerous) {
      okBtn.style.background = '#ef4444';
      okBtn.style.borderColor = '#ef4444';
      if (iconBox) {
        iconBox.className = 'custom-popup-icon-box danger';
        iconBox.style.color = '#ef4444';
        iconBox.style.background = 'rgba(239, 68, 68, 0.12)';
      }
    } else {
      okBtn.style.background = 'var(--primary)';
      okBtn.style.borderColor = 'var(--primary)';
      if (iconBox) {
        iconBox.className = 'custom-popup-icon-box info';
        iconBox.style.color = 'var(--primary)';
        iconBox.style.background = 'rgba(217, 114, 91, 0.12)';
      }
    }

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.classList.add('active');
  });
}

function showCustomPrompt({
  title = 'Routine Name',
  message = 'Enter the name below:',
  defaultValue = '',
  placeholder = '',
  okText = 'Save',
  cancelText = 'Cancel'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customPromptModal');
    const titleEl = document.getElementById('promptPopupTitle');
    const msgEl = document.getElementById('promptPopupMessage');
    const input = document.getElementById('promptPopupInput');
    const okBtn = document.getElementById('btnPromptPopupOk');
    const cancelBtn = document.getElementById('btnPromptPopupCancel');

    if (!modal || !input || !okBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    input.value = defaultValue;
    input.placeholder = placeholder;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
    };

    const onOk = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}

function showCustomAlert({
  title = 'Notice',
  message = '',
  type = 'info',
  okText = 'OK'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customAlertModal');
    const titleEl = document.getElementById('alertPopupTitle');
    const msgEl = document.getElementById('alertPopupMessage');
    const okBtn = document.getElementById('btnAlertPopupOk');
    const iconBox = document.getElementById('alertPopupIconBox');

    if (!modal || !okBtn) {
      resolve();
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    okBtn.textContent = okText;

    if (iconBox) {
      if (type === 'success') {
        iconBox.className = 'custom-popup-icon-box success';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      } else if (type === 'danger' || type === 'error') {
        iconBox.className = 'custom-popup-icon-box danger';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      } else {
        iconBox.className = 'custom-popup-icon-box info';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      }
    }

    const onOk = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      resolve();
    };

    okBtn.addEventListener('click', onOk);
    modal.classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNetworkAndPwaStatus();

  // Initialize Dexie IndexedDB (creates schema v1 & upgrades to v2)
  await initDatabase();

  // Load Settings, Templates, and Completed Workout History
  settings = await getSettings();
  templates = await getTemplates();
  selectedTemplateId = settings.selectedTemplateId || templates[0]?.id || 'tpl-upper-body';
  history = await getWorkoutHistory();

  // Check for any interrupted or currently active workout session
  activeSession = await getActiveSession();
  if (activeSession) {
    currentExerciseIndex = activeSession.currentExerciseIndex || 0;
  }

  // Initialize UI Event Handlers & Views
  initNavigation();
  initHomeScreen();
  initWorkoutScreen();
  initHistoryScreen();
  initProgressScreen();
  initSettingsScreen();
  initRestTimer();
  initModals();

  // Restore saved active tab across page refreshes (default to home)
  let initialTab = 'home';
  try {
    initialTab = localStorage.getItem('yeshu_active_tab') || 'home';
  } catch (e) {}

  // Initial render of home for baseline data, then switch to saved tab
  await renderHomeScreen();
  if (initialTab !== 'home') {
    switchTab(initialTab);
  }
});

/* ----------------------------------------------------
   PWA & NETWORK STATUS
---------------------------------------------------- */
function initNetworkAndPwaStatus() {
  const offlineBadge = document.getElementById('offlineStatusBadge');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  const updateOnlineState = () => {
    if (!navigator.onLine) {
      if (offlineBadge) offlineBadge.style.display = 'inline-flex';
    } else {
      if (offlineBadge) offlineBadge.style.display = 'none';
    }
  };

  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  updateOnlineState();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaInstallBtn) pwaInstallBtn.style.display = 'block';
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          pwaInstallBtn.style.display = 'none';
        }
        deferredInstallPrompt = null;
      }
    });
  }
}

/* ----------------------------------------------------
   NAVIGATION: 5 BOTTOM TABS
---------------------------------------------------- */
function initNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      switchTab(targetTab);
    });
  });
}

function switchTab(tabName) {
  try {
    localStorage.setItem('yeshu_active_tab', tabName);
  } catch (e) {}

  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(nav => {
    nav.classList.toggle('active', nav.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.add('active');

  // Trigger screen-specific refresh
  if (tabName === 'home') {
    renderHomeScreen();
  } else if (tabName === 'workout') {
    renderActiveWorkoutScreen();
  } else if (tabName === 'history') {
    renderHistoryScreen();
  } else if (tabName === 'progress') {
    renderProgressScreen();
  } else if (tabName === 'settings') {
    renderSettingsScreen();
  }

  // Scroll to top of content
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTop = 0;
}

/* ----------------------------------------------------
   1. HOME SCREEN
   - Selected Template display (name, exercise count)
   - Template selection dropdown
   - Current body weight
   - Last completed workout
   - START WORKOUT (or RESUME WORKOUT if in-progress)
   - Discard option if in-progress
---------------------------------------------------- */
function initHomeScreen() {
  const btnStartWorkout = document.getElementById('btnStartWorkout');
  if (btnStartWorkout) {
    btnStartWorkout.addEventListener('click', handleStartOrResumeWorkout);
  }

  const btnDiscard = document.getElementById('btnDiscardActiveWorkout');
  if (btnDiscard) {
    btnDiscard.addEventListener('click', handleDiscardActiveWorkout);
  }

  const homeWeightBox = document.getElementById('homeWeightBox');
  if (homeWeightBox) {
    homeWeightBox.addEventListener('click', openBodyWeightModal);
  }

  const tplSelect = document.getElementById('homeTemplateSelect');
  if (tplSelect) {
    tplSelect.addEventListener('change', async (e) => {
      selectedTemplateId = e.target.value;
      settings.selectedTemplateId = selectedTemplateId;
      await updateSettings(settings);
      renderHomeScreen();
    });
  }

  const btnManageHome = document.getElementById('btnManageRoutinesHome');
  if (btnManageHome) {
    btnManageHome.addEventListener('click', () => {
      openManageRoutinesModal(selectedTemplateId);
    });
  }
}

async function renderHomeScreen() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  const dateDisplay = document.getElementById('homeCurrentDateDisplay');
  if (dateDisplay) dateDisplay.textContent = dateStr;

  const dayBadge = document.getElementById('homeDayOfWeekBadge');
  if (dayBadge) dayBadge.textContent = `${dayName} Session`;

  // Populate template dropdown
  const tplSelect = document.getElementById('homeTemplateSelect');
  if (tplSelect && templates.length > 0) {
    tplSelect.innerHTML = templates.map(t =>
      `<option value="${t.id}" ${t.id === selectedTemplateId ? 'selected' : ''}>${t.name}</option>`
    ).join('');
  }

  // Get active selected template
  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0] || (await getDefaultTemplate());

  const titleEl = document.getElementById('homeWorkoutTitle');
  const subEl = document.getElementById('homeWorkoutSub');
  const weightEl = document.getElementById('homeWeightDisplay');
  const lastEl = document.getElementById('homeLastWorkoutDisplay');
  const btnTextEl = document.getElementById('btnStartWorkoutText');
  const inProgressBanner = document.getElementById('homeInProgressBanner');
  const inProgressText = document.getElementById('homeInProgressText');
  const btnDiscard = document.getElementById('btnDiscardActiveWorkout');

  // Check if an unfinished workout session is active
  const hasActiveSession = Boolean(activeSession && activeSession.status === 'in_progress');

  if (hasActiveSession) {
    if (inProgressBanner) inProgressBanner.style.display = 'inline-flex';
    if (inProgressText) {
      const elapsed = Math.max(1, Math.round((Date.now() - (activeSession.startedAt || Date.now())) / 60000));
      inProgressText.textContent = `In Progress · ${elapsed}m elapsed`;
    }
    if (btnTextEl) btnTextEl.textContent = 'RESUME WORKOUT';
    if (btnDiscard) btnDiscard.style.display = 'block';

    if (titleEl) titleEl.textContent = `${activeSession.name} (Active)`;
    if (subEl) subEl.textContent = `${(activeSession.exercises || []).length} exercises · Step ${currentExerciseIndex + 1}`;
  } else {
    if (inProgressBanner) inProgressBanner.style.display = 'none';
    if (btnTextEl) btnTextEl.textContent = 'START WORKOUT';
    if (btnDiscard) btnDiscard.style.display = 'none';

    if (titleEl) titleEl.textContent = currentTemplate.name || 'Upper Body';
    const exCount = (currentTemplate.exercises || []).length;
    if (subEl) subEl.textContent = `${exCount} exercises · ~45 min`;
  }

  // Latest body weight
  const latestWeight = activeSession?.bodyWeight || (history[0]?.bodyWeight) || settings.latestBodyWeight || null;
  if (weightEl) weightEl.textContent = latestWeight ? `${latestWeight} kg` : '-- kg';

  // Last workout from history matching the template
  const matchingLastWorkout = history.length > 0 ? history[0] : null;
  if (matchingLastWorkout && lastEl) {
    const formattedDate = formatShortDate(matchingLastWorkout.date);
    lastEl.textContent = `${matchingLastWorkout.name?.replace(/\s*\([^)]*\)/, '') || 'Workout'} · ${formattedDate}`;
  } else if (lastEl) {
    lastEl.textContent = 'No workouts yet';
  }

  // Last Workout Summary Card
  const lastDateEl = document.getElementById('homeLastSummaryDate');
  const lastVolEl = document.getElementById('homeLastSummaryVol');
  const lastSetsEl = document.getElementById('homeLastSummarySets');
  const lastExEl = document.getElementById('homeLastSummaryEx');

  if (matchingLastWorkout) {
    let lastVol = 0;
    let lastSetsCount = 0;
    (matchingLastWorkout.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        if (s.completed) {
          lastSetsCount++;
          lastVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        }
      });
    });

    if (lastDateEl) lastDateEl.textContent = formatShortDate(matchingLastWorkout.date);
    if (lastVolEl) lastVolEl.textContent = `${lastVol.toLocaleString()} kg`;
    if (lastSetsEl) lastSetsEl.textContent = `${lastSetsCount}`;
    if (lastExEl) lastExEl.textContent = `${(matchingLastWorkout.exercises || []).length}`;
  } else {
    if (lastDateEl) lastDateEl.textContent = '--';
    if (lastVolEl) lastVolEl.textContent = '0 kg';
    if (lastSetsEl) lastSetsEl.textContent = '0';
    if (lastExEl) lastExEl.textContent = '0';
  }

  // Weekly workout count (completed in past 7 days)
  const weeklyCountEl = document.getElementById('homeWeeklyCount');
  if (weeklyCountEl) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekCount = history.filter(h => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo;
    }).length;
    weeklyCountEl.textContent = `${thisWeekCount} Workout${thisWeekCount === 1 ? '' : 's'} Completed`;
  }

  // Progressive Overload Highlights
  const progressListEl = document.getElementById('homeProgressList');
  if (progressListEl) {
    if (history.length === 0) {
      progressListEl.innerHTML = `
        <li style="color:var(--text-muted); font-size: 0.85rem; padding: 4px 0;">
          No workouts logged yet. Start a workout to see progressive overload highlights here!
        </li>
      `;
    } else {
      const latest = history[0];
      const items = [];
      (latest.exercises || []).forEach(ex => {
        const completedSets = (ex.sets || []).filter(s => s.completed);
        if (completedSets.length > 0) {
          const bestSet = completedSets.reduce((best, s) => (s.weight > best.weight ? s : best), completedSets[0]);
          const rirText = ex.rir !== null && ex.rir !== undefined ? ` (RIR ${ex.rir})` : '';
          items.push(`<li><strong>${ex.name}:</strong> ${bestSet.weight} kg × ${bestSet.reps} reps${rirText}.</li>`);
        }
      });
      if (items.length > 0) {
        progressListEl.innerHTML = items.slice(0, 3).join('');
      } else {
        progressListEl.innerHTML = `<li style="color:var(--text-muted); font-size: 0.85rem;">Complete your sets to track progressive overload!</li>`;
      }
    }
  }
}

async function handleStartOrResumeWorkout() {
  if (isStartingWorkout) return;
  isStartingWorkout = true;

  try {
    // 1. If an active session is currently in progress: resume it
    if (activeSession && activeSession.status === 'in_progress') {
      switchTab('workout');
      return;
    }

    // 2. Otherwise create a fresh session from the selected template
    const template = templates.find(t => t.id === selectedTemplateId) || await getDefaultTemplate();

    // Instantiate fresh workout session
    activeSession = createSessionFromTemplate(template, history);
    currentExerciseIndex = 0;

    // Persist immediately to IndexedDB/localStorage
    await saveActiveSession(activeSession);

    // Switch to Workout screen
    switchTab('workout');
  } catch (err) {
    console.error('Error starting workout session:', err);
    await showCustomAlert({ title: 'Error', message: 'Failed to start workout. Please try again.', type: 'error' });
  } finally {
    isStartingWorkout = false;
  }
}

async function handleDiscardActiveWorkout() {
  const confirmed = await showCustomConfirm({
    title: 'Discard In-Progress Workout?',
    message: 'Are you sure you want to discard your unfinished workout session? All logged sets for this session will be lost.',
    okText: 'Discard Workout',
    isDangerous: true
  });
  if (!confirmed) return;

  await clearActiveSession();
  activeSession = null;
  currentExerciseIndex = 0;
  renderHomeScreen();
}

/* ----------------------------------------------------
   2. WORKOUT SCREEN
   - Displays active in-progress workout session
   - Exercise navigation (sequential stepper)
   - Today's sets with + / - steppers, large checkmark
   - RIR pills (0, 1, 2, 3, 4+)
   - NEXT EXERCISE / FINISH WORKOUT action
   - Cardio logging
   - Workout completion summary modal with DONE
---------------------------------------------------- */
function initWorkoutScreen() {
  const btnNext = document.getElementById('btnNextExercise');
  const btnPrev = document.getElementById('btnPrevExercise');
  const btnFinishTop = document.getElementById('btnWorkoutFinishTop');
  const btnDiscardTop = document.getElementById('btnWorkoutDiscardTop');
  const btnAddEx = document.getElementById('btnAddExerciseBtn');
  const weightChip = document.getElementById('workoutWeightChip');

  if (btnNext) btnNext.addEventListener('click', handleNextExercise);

  if (btnPrev) {
    btnPrev.addEventListener('click', async () => {
      if (currentExerciseIndex > 0) {
        currentExerciseIndex--;
        if (activeSession) {
          activeSession.currentExerciseIndex = currentExerciseIndex;
          await saveActiveSession(activeSession);
        }
        renderActiveWorkoutScreen();
      }
    });
  }

  if (btnFinishTop) btnFinishTop.addEventListener('click', openWorkoutCompletionModal);
  if (btnDiscardTop) btnDiscardTop.addEventListener('click', handleDiscardActiveWorkoutFromHeader);

  if (btnAddEx) {
    btnAddEx.addEventListener('click', () => {
      document.getElementById('addExerciseModal')?.classList.add('active');
    });
  }

  if (weightChip) weightChip.addEventListener('click', openBodyWeightModal);

    // Cardio toggle button
  const btnToggleCardio = document.getElementById('btnToggleCardioLog');
  if (btnToggleCardio) {
    btnToggleCardio.addEventListener('click', () => {
      const container = document.getElementById('cardioDetailsContainer');
      if (container) {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        btnToggleCardio.textContent = isHidden ? 'Hide Cardio' : '+ Log Cardio';
        if (isHidden) renderCardioInputs();
      }
    });
  }

  // Empty view action buttons
  const btnEmptyStart = document.getElementById('btnWorkoutEmptyStart');
  if (btnEmptyStart) {
    btnEmptyStart.addEventListener('click', async () => {
      const select = document.getElementById('workoutEmptyRoutineSelect');
      if (select && select.value) {
        selectedTemplateId = select.value;
        settings.selectedTemplateId = selectedTemplateId;
        await updateSettings(settings);
      }
      handleStartOrResumeWorkout();
    });
  }

  const btnEmptyManage = document.getElementById('btnWorkoutEmptyManage');
  if (btnEmptyManage) {
    btnEmptyManage.addEventListener('click', () => {
      const select = document.getElementById('workoutEmptyRoutineSelect');
      const curId = select ? select.value : selectedTemplateId;
      openManageRoutinesModal(curId);
    });
  }
}

async function handleDiscardActiveWorkoutFromHeader() {
  const confirmed = await showCustomConfirm({
    title: 'Discard Workout?',
    message: 'Are you sure you want to discard this workout session? Unsaved progress will be lost.',
    okText: 'Discard',
    isDangerous: true
  });
  if (!confirmed) return;

  await clearActiveSession();
  activeSession = null;
  currentExerciseIndex = 0;
  renderActiveWorkoutScreen();
  renderHomeScreen();
}

function renderActiveWorkoutScreen() {
  const activeView = document.getElementById('workoutActiveView');
  const emptyView = document.getElementById('workoutEmptyView');

  // Check if an unfinished workout session is active
  const hasActiveSession = Boolean(activeSession && activeSession.status === 'in_progress');

  if (!hasActiveSession) {
    if (activeView) activeView.style.display = 'none';
    if (emptyView) emptyView.style.display = 'block';

    // Populate empty view routine select
    const emptySelect = document.getElementById('workoutEmptyRoutineSelect');
    if (emptySelect && templates.length > 0) {
      emptySelect.innerHTML = templates.map(t =>
        `<option value="${t.id}" ${t.id === selectedTemplateId ? 'selected' : ''}>${t.name} (${(t.exercises || []).length} exercises)</option>`
      ).join('');
      emptySelect.onchange = async (e) => {
        selectedTemplateId = e.target.value;
        settings.selectedTemplateId = selectedTemplateId;
        await updateSettings(settings);
      };
    }
    return;
  }

  // Active workout is in progress!
  if (emptyView) emptyView.style.display = 'none';
  if (activeView) activeView.style.display = 'block';

  const titleEl = document.getElementById('sessionTitleDisplay');
  if (titleEl) titleEl.textContent = activeSession.name || 'Workout Session';

  const weightChipVal = document.getElementById('workoutWeightChipVal');
  if (weightChipVal) {
    weightChipVal.textContent = activeSession.bodyWeight ? `${activeSession.bodyWeight} kg` : '-- kg';
  }

  const exercises = activeSession.exercises || [];
  const totalExercises = exercises.length;

  // Stepper Progress Header
  const stepLabel = document.getElementById('exerciseStepLabel');
  const stepPercent = document.getElementById('exerciseStepPercent');
  const progressBar = document.getElementById('exerciseProgressBar');

  if (totalExercises > 0) {
    const curStep = Math.min(currentExerciseIndex + 1, totalExercises);
    const pct = Math.round((curStep / totalExercises) * 100);
    if (stepLabel) stepLabel.textContent = `Exercise ${curStep} of ${totalExercises}`;
    if (stepPercent) stepPercent.textContent = `${pct}% Completed`;
    if (progressBar) progressBar.style.width = `${pct}%`;
  } else {
    if (stepLabel) stepLabel.textContent = '0 exercises in session';
    if (stepPercent) stepPercent.textContent = '0% Completed';
    if (progressBar) progressBar.style.width = '0%';
  }

  // Exercise Horizontal Pill Strip
  renderExercisePillStrip(exercises);

  // Active Exercise Card
  renderCurrentExerciseCard(exercises);

  // Next Exercise Button Label
  const btnNext = document.getElementById('btnNextExercise');
  if (btnNext) {
    if (totalExercises === 0) {
      btnNext.classList.remove('btn-finish-mode');
      btnNext.innerHTML = `
        <span>+ ADD EXERCISE</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      `;
    } else if (currentExerciseIndex >= totalExercises - 1) {
      btnNext.classList.add('btn-finish-mode');
      btnNext.innerHTML = `
        <span>FINISH WORKOUT</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else {
      btnNext.classList.remove('btn-finish-mode');
      btnNext.innerHTML = `
        <span>NEXT EXERCISE</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
    }
  }

  // Previous Exercise Button state
  const btnPrev = document.getElementById('btnPrevExercise');
  if (btnPrev) {
    btnPrev.style.visibility = (totalExercises > 0 && currentExerciseIndex > 0) ? 'visible' : 'hidden';
  }

  // Cardio Section
  renderCardioInputs();
}

function renderExercisePillStrip(exercises) {
  const strip = document.getElementById('exercisePillStrip');
  if (!strip) return;
  strip.innerHTML = '';

  exercises.forEach((ex, idx) => {
    const isDone = (ex.sets || []).length > 0 && ex.sets.every(s => s.completed);
    const pill = document.createElement('button');
    pill.className = `ex-pill ${idx === currentExerciseIndex ? 'active' : ''} ${isDone ? 'done' : ''}`;
    pill.textContent = `${idx + 1}. ${ex.name}`;
    pill.addEventListener('click', async () => {
      currentExerciseIndex = idx;
      if (activeSession) {
        activeSession.currentExerciseIndex = currentExerciseIndex;
        await saveActiveSession(activeSession);
      }
      renderActiveWorkoutScreen();
    });
    strip.appendChild(pill);
  });
}

function renderCurrentExerciseCard(exercises) {
  const container = document.getElementById('activeExerciseContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!exercises || exercises.length === 0) {
    container.innerHTML = `
      <div class="card text-center" style="padding: 24px;">
        <p class="text-muted">No exercises in this workout session.</p>
        <button class="btn btn-primary btn-sm mt-2" id="btnEmptyAddEx">+ Add Exercise</button>
      </div>
    `;
    document.getElementById('btnEmptyAddEx')?.addEventListener('click', () => {
      document.getElementById('addExerciseModal')?.classList.add('active');
    });
    return;
  }

  const ex = exercises[currentExerciseIndex] || exercises[0];

  // Lookup previous workout performance
  const prevPerf = ex.previousPerformance || getPreviousExercisePerformance(ex.name, history);

  const card = document.createElement('div');
  card.className = 'active-exercise-card';

  // Last workout sets text representation
  let lastWorkoutHtml = '';
  if (prevPerf && prevPerf.sets && prevPerf.sets.length > 0) {
    const setsListHtml = prevPerf.sets.map((s, i) =>
      `<span class="last-set-line">Set ${i + 1}: ${s.weight} kg × ${s.reps} reps</span>`
    ).join('');
    const rirText = prevPerf.rir !== null && prevPerf.rir !== undefined ? ` • Final RIR: ${prevPerf.rir}` : '';
    lastWorkoutHtml = `
      <div class="last-workout-box">
        <div class="last-workout-title">Last Workout (${prevPerf.date ? formatShortDate(prevPerf.date) : 'Previous'})${rirText}</div>
        <div class="last-sets-list">
          ${setsListHtml}
        </div>
      </div>
    `;
  } else if (ex.target) {
    lastWorkoutHtml = `
      <div class="last-workout-box">
        <div class="last-workout-title">Target Standard</div>
        <div class="last-sets-list">
          <span class="last-set-line">${ex.target}</span>
        </div>
      </div>
    `;
  }

  // Today's sets rows
  const setsHtml = (ex.sets || []).map((s, sIdx) => `
    <div class="set-mobile-row ${s.completed ? 'completed' : ''}" data-set="${sIdx}">
      <span class="set-index-label">Set ${sIdx + 1}</span>

      <!-- Weight Stepper -->
      <div class="stepper-input-group">
        <button class="stepper-btn btn-w-minus" data-set="${sIdx}">−</button>
        <input type="number" step="0.5" class="stepper-val-input input-set-weight" data-set="${sIdx}" value="${s.weight}" />
        <span class="stepper-unit">kg</span>
        <button class="stepper-btn btn-w-plus" data-set="${sIdx}">+</button>
      </div>

      <!-- Reps Stepper -->
      <div class="stepper-input-group">
        <button class="stepper-btn btn-r-minus" data-set="${sIdx}">−</button>
        <input type="number" class="stepper-val-input input-set-reps" data-set="${sIdx}" value="${s.reps}" />
        <span class="stepper-unit">reps</span>
        <button class="stepper-btn btn-r-plus" data-set="${sIdx}">+</button>
      </div>

      <!-- Tactile Checkmark Button -->
      <button class="btn-set-check ${s.completed ? 'active' : ''}" data-set="${sIdx}" title="Mark Set Done">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
    </div>
  `).join('');

  // RIR Pills
  const currentRir = ex.rir !== undefined && ex.rir !== null ? ex.rir : 1;
  const rirExplanation = RIR_DESCRIPTIONS[currentRir] || RIR_DESCRIPTIONS[1];

  card.innerHTML = `
    <div class="ex-main-header">
      <div>
        <h3 class="ex-name-title">${ex.name}</h3>
        <div class="ex-target-scheme-row">
          <span>${ex.targetScheme || '3×6–10'}</span>
          <span>•</span>
          <span>Target: <strong class="target-val-bold">${ex.target || `${ex.targetWeight || 35} kg`}</strong></span>
        </div>
      </div>
      <span class="ex-category-badge">${ex.category || 'Chest'}</span>
    </div>

    <!-- Last Workout Reference -->
    ${lastWorkoutHtml}

    <!-- Today's Sets -->
    <div class="today-sets-header">Today's Sets</div>
    <div class="set-rows-container">
      ${setsHtml}
    </div>

    <button class="btn-add-set-row" id="btnAddSetToCurrentEx">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      <span>+ Add Set</span>
    </button>

    <!-- RIR Section (After final set) -->
    <div class="rir-section">
      <div class="rir-header-group">
        <span class="rir-title">RIR (Reps In Reserve)</span>
        <span class="rir-sub-explainer">After final set</span>
      </div>
      <div class="rir-pill-row">
        <button class="rir-pill-btn ${currentRir === 0 ? 'active' : ''}" data-rir="0">0</button>
        <button class="rir-pill-btn ${currentRir === 1 ? 'active' : ''}" data-rir="1">1</button>
        <button class="rir-pill-btn ${currentRir === 2 ? 'active' : ''}" data-rir="2">2</button>
        <button class="rir-pill-btn ${currentRir === 3 ? 'active' : ''}" data-rir="3">3</button>
        <button class="rir-pill-btn ${currentRir >= 4 ? 'active' : ''}" data-rir="4">4+</button>
      </div>
      <div class="rir-meaning-text" id="rirExplainerText">${rirExplanation}</div>
    </div>
  `;

  container.appendChild(card);
  bindCurrentExerciseEvents(ex);
}

function bindCurrentExerciseEvents(ex) {
  // Steppers: Weight Minus & Plus
  document.querySelectorAll('.btn-w-minus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const input = document.querySelector(`.input-set-weight[data-set="${sIdx}"]`);
      let val = parseFloat(input.value) || 0;
      val = Math.max(0, val - (val > 10 ? 2.5 : 1));
      input.value = val;
      ex.sets[sIdx].weight = val;
      await saveActiveSession(activeSession);
    });
  });

  document.querySelectorAll('.btn-w-plus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const input = document.querySelector(`.input-set-weight[data-set="${sIdx}"]`);
      let val = parseFloat(input.value) || 0;
      val += (val >= 10 ? 2.5 : 1);
      input.value = val;
      ex.sets[sIdx].weight = val;
      await saveActiveSession(activeSession);
    });
  });

  // Direct Weight Input
  document.querySelectorAll('.input-set-weight').forEach(input => {
    input.addEventListener('change', async (e) => {
      const sIdx = parseInt(e.target.dataset.set);
      const val = parseFloat(e.target.value) || 0;
      ex.sets[sIdx].weight = val;
      await saveActiveSession(activeSession);
    });
  });

  // Steppers: Reps Minus & Plus
  document.querySelectorAll('.btn-r-minus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const input = document.querySelector(`.input-set-reps[data-set="${sIdx}"]`);
      let val = parseInt(input.value) || 0;
      val = Math.max(1, val - 1);
      input.value = val;
      ex.sets[sIdx].reps = val;
      await saveActiveSession(activeSession);
    });
  });

  document.querySelectorAll('.btn-r-plus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const input = document.querySelector(`.input-set-reps[data-set="${sIdx}"]`);
      let val = parseInt(input.value) || 0;
      val += 1;
      input.value = val;
      ex.sets[sIdx].reps = val;
      await saveActiveSession(activeSession);
    });
  });

  // Direct Reps Input
  document.querySelectorAll('.input-set-reps').forEach(input => {
    input.addEventListener('change', async (e) => {
      const sIdx = parseInt(e.target.dataset.set);
      const val = parseInt(e.target.value) || 0;
      ex.sets[sIdx].reps = val;
      await saveActiveSession(activeSession);
    });
  });

  // Tactile Checkmark Button (Tap to complete set)
  document.querySelectorAll('.btn-set-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const isDone = !ex.sets[sIdx].completed;
      ex.sets[sIdx].completed = isDone;

      // Visual update
      e.currentTarget.classList.toggle('active', isDone);
      const row = document.querySelector(`.set-mobile-row[data-set="${sIdx}"]`);
      if (row) row.classList.toggle('completed', isDone);

      // Trigger rest timer on completed set
      if (isDone) {
        startRestIntervalTimer();
      }

      await saveActiveSession(activeSession);
      renderExercisePillStrip(activeSession.exercises);
    });
  });

  // Add Set Button
  const btnAddSet = document.getElementById('btnAddSetToCurrentEx');
  if (btnAddSet) {
    btnAddSet.addEventListener('click', async () => {
      const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : { weight: 35, reps: 10 };
      ex.sets.push({
        id: `set-${ex.id}-${ex.sets.length + 1}-${Date.now()}`,
        setNumber: ex.sets.length + 1,
        weight: lastSet.weight,
        reps: lastSet.reps,
        completed: false
      });
      await saveActiveSession(activeSession);
      renderCurrentExerciseCard(activeSession.exercises);
    });
  }

  // RIR Pills
  document.querySelectorAll('.rir-pill-btn').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      const rirVal = parseInt(e.currentTarget.dataset.rir);
      ex.rir = rirVal;

      document.querySelectorAll('.rir-pill-btn').forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const explainer = document.getElementById('rirExplainerText');
      if (explainer) {
        explainer.textContent = RIR_DESCRIPTIONS[rirVal] || '';
      }

      await saveActiveSession(activeSession);
    });
  });
}

async function handleNextExercise() {
  if (!activeSession) return;
  const exercises = activeSession.exercises || [];
  if (exercises.length === 0) {
    document.getElementById('addExerciseModal')?.classList.add('active');
    return;
  }
  if (currentExerciseIndex < exercises.length - 1) {
    currentExerciseIndex++;
    activeSession.currentExerciseIndex = currentExerciseIndex;
    await saveActiveSession(activeSession);
    renderActiveWorkoutScreen();

    // Scroll to top of exercise smoothly
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
  } else {
    // Reached end of exercises -> open completion summary modal
    openWorkoutCompletionModal();
  }
}

/* ----------------------------------------------------
   CARDIO LOGGING (COMPACT & SIMPLE)
---------------------------------------------------- */
function renderCardioInputs() {
  const container = document.getElementById('cardioDetailsContainer');
  if (!container || !activeSession) return;

  if (!activeSession.cardio || activeSession.cardio.length === 0) {
    activeSession.cardio = [{
      name: 'Incline Walking',
      time: '2 min',
      distance: '0.15 km',
      incline: '10%',
      speed: '4.0 km/h'
    }];
  }

  const c = activeSession.cardio[0];

  let timeVal = parseInt(c.time) || 2;
  let distVal = parseFloat(c.distance) || 0.15;
  let inclVal = parseInt(c.incline) || 10;
  let speedVal = parseFloat(c.speed) || 4.0;

  container.innerHTML = `
    <div class="cardio-grid-inputs">
      <div class="cardio-field-cell">
        <div class="cardio-field-lbl">Time</div>
        <div class="stepper-input-group">
          <button class="stepper-btn" id="cTimeMinus">−</button>
          <input type="number" class="stepper-val-input" id="cTimeInput" value="${timeVal}" />
          <span class="stepper-unit">min</span>
          <button class="stepper-btn" id="cTimePlus">+</button>
        </div>
      </div>

      <div class="cardio-field-cell">
        <div class="cardio-field-lbl">Distance</div>
        <div class="stepper-input-group">
          <button class="stepper-btn" id="cDistMinus">−</button>
          <input type="number" step="0.05" class="stepper-val-input" id="cDistInput" value="${distVal}" />
          <span class="stepper-unit">km</span>
          <button class="stepper-btn" id="cDistPlus">+</button>
        </div>
      </div>

      <div class="cardio-field-cell">
        <div class="cardio-field-lbl">Incline</div>
        <div class="stepper-input-group">
          <button class="stepper-btn" id="cInclMinus">−</button>
          <input type="number" class="stepper-val-input" id="cInclInput" value="${inclVal}" />
          <span class="stepper-unit">%</span>
          <button class="stepper-btn" id="cInclPlus">+</button>
        </div>
      </div>

      <div class="cardio-field-cell">
        <div class="cardio-field-lbl">Speed</div>
        <div class="stepper-input-group">
          <button class="stepper-btn" id="cSpeedMinus">−</button>
          <input type="number" step="0.5" class="stepper-val-input" id="cSpeedInput" value="${speedVal}" />
          <span class="stepper-unit">km/h</span>
          <button class="stepper-btn" id="cSpeedPlus">+</button>
        </div>
      </div>
    </div>
  `;

  bindCardioEvents(c);
}

function bindCardioEvents(c) {
  const tIn = document.getElementById('cTimeInput');
  const dIn = document.getElementById('cDistInput');
  const iIn = document.getElementById('cInclInput');
  const sIn = document.getElementById('cSpeedInput');

  const saveCardio = async () => {
    c.time = `${tIn.value} min`;
    c.distance = `${dIn.value} km`;
    c.incline = `${iIn.value}%`;
    c.speed = `${sIn.value} km/h`;
    await saveActiveSession(activeSession);
  };

  document.getElementById('cTimeMinus')?.addEventListener('click', () => {
    tIn.value = Math.max(1, (parseInt(tIn.value) || 1) - 1);
    saveCardio();
  });
  document.getElementById('cTimePlus')?.addEventListener('click', () => {
    tIn.value = (parseInt(tIn.value) || 1) + 1;
    saveCardio();
  });

  document.getElementById('cDistMinus')?.addEventListener('click', () => {
    dIn.value = Math.max(0.05, ((parseFloat(dIn.value) || 0.1) - 0.05)).toFixed(2);
    saveCardio();
  });
  document.getElementById('cDistPlus')?.addEventListener('click', () => {
    dIn.value = ((parseFloat(dIn.value) || 0.1) + 0.05).toFixed(2);
    saveCardio();
  });

  document.getElementById('cInclMinus')?.addEventListener('click', () => {
    iIn.value = Math.max(0, (parseInt(iIn.value) || 0) - 1);
    saveCardio();
  });
  document.getElementById('cInclPlus')?.addEventListener('click', () => {
    iIn.value = (parseInt(iIn.value) || 0) + 1;
    saveCardio();
  });

  document.getElementById('cSpeedMinus')?.addEventListener('click', () => {
    sIn.value = Math.max(0.5, ((parseFloat(sIn.value) || 4.0) - 0.5)).toFixed(1);
    saveCardio();
  });
  document.getElementById('cSpeedPlus')?.addEventListener('click', () => {
    sIn.value = ((parseFloat(sIn.value) || 4.0) + 0.5).toFixed(1);
    saveCardio();
  });
}

/* ----------------------------------------------------
   WORKOUT COMPLETION SUMMARY MODAL
   - Clean metrics: Duration, Volume, Exercises, Sets, Body Weight, Cardio
   - DONE button with double-tap protection
---------------------------------------------------- */
function openWorkoutCompletionModal() {
  if (!activeSession) return;
  const modal = document.getElementById('workoutCompleteModal');
  if (!modal) return;

  // Calculate volume & completed sets
  let totalVol = 0;
  let totalSets = 0;
  (activeSession.exercises || []).forEach(ex => {
    (ex.sets || []).forEach(s => {
      if (s.completed) {
        totalSets++;
        totalVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
      }
    });
  });

  // Calculate duration
  const now = Date.now();
  const started = activeSession.startedAt || now;
  const elapsedMinutes = Math.max(1, Math.round((now - started) / 60000));

  const durationEl = document.getElementById('compDuration');
  const volumeEl = document.getElementById('compVolume');
  const exEl = document.getElementById('compExercises');
  const setsEl = document.getElementById('compSets');
  const weightInput = document.getElementById('compWeightInput');
  const weightRef = document.getElementById('compWeightRef');
  const cardioVal = document.getElementById('compCardioVal');

  if (durationEl) durationEl.textContent = `${elapsedMinutes} min`;
  if (volumeEl) volumeEl.textContent = `${totalVol.toLocaleString()} kg`;
  if (exEl) exEl.textContent = `${(activeSession.exercises || []).length}`;
  if (setsEl) setsEl.textContent = `${totalSets}`;

  const currentBw = activeSession.bodyWeight || (history[0]?.bodyWeight) || settings.latestBodyWeight || null;
  if (weightInput) weightInput.value = currentBw || '';
  if (weightRef) weightRef.textContent = currentBw ? `Previous: ${currentBw} kg` : 'No weight recorded yet';

  if (cardioVal) {
    if (activeSession.cardio && activeSession.cardio.length > 0) {
      const c = activeSession.cardio[0];
      cardioVal.textContent = `${c.name || 'Cardio'} · ${c.time || '2 min'} (${c.distance || '0.15 km'})`;
    } else {
      cardioVal.textContent = 'No cardio logged';
    }
  }

  modal.classList.add('active');

  const btnDone = document.getElementById('btnCompleteDone');
  if (btnDone) {
    btnDone.onclick = async () => {
      // Prevent repeated taps from creating duplicate entries
      if (isFinishingWorkout) return;
      isFinishingWorkout = true;
      btnDone.disabled = true;

      try {
        const customWeight = weightInput && parseFloat(weightInput.value) ? parseFloat(weightInput.value) : (currentBw || null);

        // Finish session, save permanently, clear active session
        await finishSession(activeSession, {
          bodyWeight: customWeight,
          durationMinutes: elapsedMinutes
        });

        // Reset state
        activeSession = null;
        currentExerciseIndex = 0;

        // Refresh completed workouts history
        history = await getWorkoutHistory();

        // Close modal and transition back to Home
        modal.classList.remove('active');
        switchTab('home');
      } catch (err) {
        console.error('Error completing workout:', err);
        await showCustomAlert({ title: 'Error', message: 'Could not save workout. Please try again.', type: 'error' });
      } finally {
        isFinishingWorkout = false;
        btnDone.disabled = false;
      }
    };
  }
}

/* ----------------------------------------------------
   3. HISTORY SCREEN
---------------------------------------------------- */
function initHistoryScreen() {
  const btnExport = document.getElementById('btnExportJSONHistory');
  if (btnExport) {
    btnExport.addEventListener('click', handleExportBackup);
  }
}

async function renderHistoryScreen() {
  history = await getWorkoutHistory();
  const container = document.getElementById('historyContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="card text-center" style="padding: 24px;">
        <p class="text-muted">No saved workouts in history.</p>
      </div>
    `;
    return;
  }

  history.forEach(hist => {
    let vol = 0;
    let setsCount = 0;
    (hist.exercises || []).forEach(e => {
      (e.sets || []).forEach(s => {
        if (s.completed) {
          setsCount++;
          vol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        }
      });
    });

    const card = document.createElement('div');
    card.className = 'history-card-mobile';
    card.innerHTML = `
      <div class="hist-top-row">
        <div>
          <h3 class="hist-title">${hist.name || 'Workout Session'}</h3>
          <span class="hist-date">${formatLongDate(hist.date)}</span>
        </div>
      </div>
      <div class="hist-chips-row">
        <span class="hist-chip">${(hist.exercises || []).length} Exercises</span>
        <span class="hist-chip">${setsCount} Sets</span>
        <span class="hist-chip">${vol.toLocaleString()} kg</span>
        <span class="hist-chip">${hist.bodyWeight ? `${hist.bodyWeight} kg BW` : 'BW not recorded'}</span>
      </div>
      <div class="hist-actions-row">
        <button class="btn btn-sm btn-subtle btn-del-hist" data-id="${hist.id}">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Delete workout
  document.querySelectorAll('.btn-del-hist').forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.dataset.id;
      const confirmed = await showCustomConfirm({
        title: 'Delete Completed Workout?',
        message: 'Are you sure you want to delete this workout from your history? This cannot be undone.',
        okText: 'Delete Workout',
        isDangerous: true
      });
      if (confirmed) {
        await deleteWorkout(id);
        renderHistoryScreen();
        renderHomeScreen();
      }
    };
  });
}

/* ----------------------------------------------------
   4. PROGRESS & 1RM SCREEN
---------------------------------------------------- */
function initProgressScreen() {
  const calcW = document.getElementById('calcWeight');
  const calcR = document.getElementById('calcReps');
  const wMinus = document.getElementById('calcWMinus');
  const wPlus = document.getElementById('calcWPlus');
  const rMinus = document.getElementById('calcRMinus');
  const rPlus = document.getElementById('calcRPlus');

  const update1RM = () => {
    const w = parseFloat(calcW.value) || 0;
    const r = parseInt(calcR.value) || 0;

    const res1 = document.getElementById('res1RM');
    const res3 = document.getElementById('res3RM');
    const res5 = document.getElementById('res5RM');
    const res10 = document.getElementById('res10RM');

    if (w > 0 && r > 0) {
      const epley1RM = w * (1 + r / 30);
      if (res1) res1.textContent = `${epley1RM.toFixed(1)} kg`;
      if (res3) res3.textContent = `${(epley1RM * 0.90).toFixed(1)} kg`;
      if (res5) res5.textContent = `${(epley1RM * 0.85).toFixed(1)} kg`;
      if (res10) res10.textContent = `${(epley1RM * 0.75).toFixed(1)} kg`;
    } else {
      if (res1) res1.textContent = '-- kg';
      if (res3) res3.textContent = '-- kg';
      if (res5) res5.textContent = '-- kg';
      if (res10) res10.textContent = '-- kg';
    }
  };

  if (calcW) calcW.addEventListener('input', update1RM);
  if (calcR) calcR.addEventListener('input', update1RM);

  if (wMinus) {
    wMinus.addEventListener('click', () => {
      const current = parseFloat(calcW.value) || 20;
      calcW.value = Math.max(1, current - 2.5);
      update1RM();
    });
  }
  if (wPlus) {
    wPlus.addEventListener('click', () => {
      const current = parseFloat(calcW.value) || 0;
      calcW.value = current + 2.5;
      update1RM();
    });
  }
  if (rMinus) {
    rMinus.addEventListener('click', () => {
      const current = parseInt(calcR.value) || 2;
      calcR.value = Math.max(1, current - 1);
      update1RM();
    });
  }
  if (rPlus) {
    rPlus.addEventListener('click', () => {
      const current = parseInt(calcR.value) || 0;
      calcR.value = current + 1;
      update1RM();
    });
  }

  update1RM();
}

function renderProgressScreen() {
  const categories = { Chest: 0, Back: 0, Shoulders: 0, Arms: 0, Legs: 0, Core: 0 };
  const currentExList = activeSession?.exercises || (history[0]?.exercises) || [];

  currentExList.forEach(ex => {
    const cat = ex.category || autoDetectCategory(ex.name);
    let vol = 0;
    (ex.sets || []).forEach(s => {
      if (s.completed) vol += (s.weight * s.reps);
    });
    if (categories[cat] !== undefined) {
      categories[cat] += vol;
    } else {
      categories.Chest += vol;
    }
  });

  const chartEl = document.getElementById('muscleVolumeChart');
  if (chartEl) {
    const ctx = chartEl.getContext('2d');
    if (muscleChartInstance) {
      muscleChartInstance.destroy();
    }

    muscleChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(categories),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: '#d9725b',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
          y: { grid: { color: '#edf2f7' }, ticks: { color: '#64748b', font: { size: 10 } } }
        }
      }
    });
  }

  // Exercise Statistics Table
  const tbody = document.getElementById('analyticsTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    if (currentExList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No workout data recorded yet. Complete a workout to see exercise breakdown.</td></tr>';
    } else {
      currentExList.forEach(ex => {
        let maxW = 0;
        let maxR = 0;
        let vol = 0;

        (ex.sets || []).forEach(s => {
          const v = (s.weight * s.reps);
          vol += v;
          if (s.weight > maxW || (s.weight === maxW && s.reps > maxR)) {
            maxW = s.weight;
            maxR = s.reps;
          }
        });

        const est1RM = maxW > 0 ? (maxW * (1 + maxR / 30)).toFixed(1) + ' kg' : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:700;">${ex.name}</td>
          <td>${ex.target || ''}</td>
          <td>${maxW > 0 ? `${maxW} kg × ${maxR}` : '--'}</td>
          <td style="font-weight:700; color:var(--primary);">${vol > 0 ? `${vol.toLocaleString()} kg` : '0 kg'}</td>
          <td><strong>${est1RM}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

/* ----------------------------------------------------
   5. SETTINGS SCREEN
---------------------------------------------------- */
function initSettingsScreen() {
  const weekStartSelect = document.getElementById('weekStartSelect');
  if (weekStartSelect) {
    weekStartSelect.value = settings.weekStartDay || 'Monday';
    weekStartSelect.addEventListener('change', async (e) => {
      settings.weekStartDay = e.target.value;
      await updateSettings(settings);
    });
  }

  const btnManageSettings = document.getElementById('btnManageRoutinesSettings');
  if (btnManageSettings) {
    btnManageSettings.addEventListener('click', () => {
      openManageRoutinesModal(selectedTemplateId);
    });
  }

  const btnExport = document.getElementById('btnExportJSON');
  const btnImport = document.getElementById('btnImportJSON');
  const importInput = document.getElementById('importFileInput');

  if (btnExport) btnExport.addEventListener('click', handleExportBackup);
  if (btnImport && importInput) {
    btnImport.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleImportBackup);
  }

  // Text Parser in Settings
  const textarea = document.getElementById('rawTextarea');
  const btnParse = document.getElementById('btnParseText');
  const btnLoadSample = document.getElementById('btnLoadSampleText');
  const btnClear = document.getElementById('btnClearText');

  if (textarea) {
    textarea.value = '';
    updateParsePreview('');
    textarea.addEventListener('input', () => updateParsePreview(textarea.value));
  }

  const SAMPLE_FORMAT_GUIDE = `Bench Press — 3×8–12
Target: 40 kg
• Set 1: 40 kg × 10
• Set 2: 40 kg × 10
• Set 3: 40 kg × 8
• Approx. RIR final set: 2

Incline Dumbbell Press — 3×8–12
Target: 15 kg
• Set 1: 15 kg × 10
• Set 2: 15 kg × 10
• Set 3: 15 kg × 8`;

  if (btnLoadSample && textarea) {
    btnLoadSample.addEventListener('click', () => {
      textarea.value = SAMPLE_FORMAT_GUIDE;
      updateParsePreview(textarea.value);
    });
  }

  if (btnClear && textarea) {
    btnClear.addEventListener('click', () => {
      textarea.value = '';
      updateParsePreview('');
    });
  }

  if (btnParse && textarea) {
    btnParse.addEventListener('click', async () => {
      const parsed = parseGymLog(textarea.value);
      if (parsed && parsed.days && parsed.days.length > 0) {
        // Save as a completed session into history
        const newSessionData = {
          ...parsed.days[0],
          id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: parsed.days[0].title || 'Parsed Session',
          status: 'completed',
          completedAt: Date.now()
        };
        await createWorkout(newSessionData);
        history = await getWorkoutHistory();
        renderHomeScreen();
        await showCustomAlert({ title: 'Import Complete', message: 'Workout session successfully imported into history!', type: 'success' });
      } else {
        await showCustomAlert({ title: 'Parse Error', message: 'Could not parse workout text. Please check format.', type: 'error' });
      }
    });
  }

  // Clear All Workout Data Button
  const btnClearAll = document.getElementById('btnClearAllData');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm({
        title: 'Clear All Workout Data?',
        message: 'Are you sure you want to permanently clear all workout history and active session data? This cannot be undone.',
        okText: 'Clear Everything',
        isDangerous: true
      });
      if (confirmed) {
        await clearAllWorkoutData();
        history = await getWorkoutHistory();
        activeSession = null;
        currentExerciseIndex = 0;
        renderHomeScreen();
        await showCustomAlert({ title: 'Data Cleared', message: 'All workout data has been cleared. You are ready to log fresh workouts!', type: 'success' });
      }
    });
  }

  // Restore Default Sample Routine (if present)
  const btnReset = document.getElementById('btnResetSampleData');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm({
        title: 'Reset Application?',
        message: 'Clear existing data and reset to a clean state?',
        okText: 'Reset App',
        isDangerous: true
      });
      if (confirmed) {
        await clearAllWorkoutData();
        templates = await getTemplates();
        history = await getWorkoutHistory();
        activeSession = null;
        renderHomeScreen();
        await showCustomAlert({ title: 'Reset Complete', message: 'App has been reset cleanly!', type: 'success' });
      }
    });
  }
}

function renderSettingsScreen() {
  const weekStartSelect = document.getElementById('weekStartSelect');
  if (weekStartSelect && settings.weekStartDay) {
    weekStartSelect.value = settings.weekStartDay;
  }
}

function updateParsePreview(text) {
  const previewBox = document.getElementById('parsePreviewOutput');
  const badge = document.getElementById('parseStatusBadge');
  if (!previewBox || !badge) return;

  const parsed = parseGymLog(text);
  if (!parsed || !parsed.days || parsed.days.length === 0) {
    badge.textContent = 'Empty';
    previewBox.innerHTML = '<p class="text-muted text-xs">Paste gym text above to preview structure.</p>';
    return;
  }

  badge.textContent = `Parsed (${parsed.days[0].exercises.length} Ex)`;
  let html = `<div style="font-weight:700; color:var(--primary);">${parsed.days[0].title}</div>`;
  parsed.days[0].exercises.slice(0, 4).forEach(ex => {
    html += `<div style="font-size:0.75rem; margin-top:3px;">• ${ex.name} (${ex.sets.length} sets)</div>`;
  });
  previewBox.innerHTML = html;
}

/* ----------------------------------------------------
   REST TIMER
---------------------------------------------------- */
function initRestTimer() {
  const quickBtn = document.getElementById('timerQuickBtn');
  const closeBtn = document.getElementById('closeTimerBtn');
  const toggleBtn = document.getElementById('btnToggleTimer');
  const resetBtn = document.getElementById('btnResetTimer');
  const overlay = document.getElementById('timerOverlay');

  if (quickBtn) {
    quickBtn.addEventListener('click', () => {
      if (overlay) overlay.classList.add('active');
    });
  }

  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('active');
    });
  }

  document.querySelectorAll('.timer-preset-btn').forEach(preset => {
    preset.addEventListener('click', (e) => {
      document.querySelectorAll('.timer-preset-btn').forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      timerSeconds = parseInt(e.currentTarget.dataset.seconds);
      resetRestTimer();
    });
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (timerRunning) {
        pauseRestTimer();
      } else {
        startRestTimerCountdown();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetRestTimer);
  }
}

function startRestIntervalTimer() {
  timerRemaining = timerSeconds;
  updateTimerClockDisplay();
  startRestTimerCountdown();
}

function startRestTimerCountdown() {
  timerRunning = true;
  const toggleBtn = document.getElementById('btnToggleTimer');
  if (toggleBtn) toggleBtn.textContent = 'Pause Rest';

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (timerRemaining > 0) {
      timerRemaining--;
      updateTimerClockDisplay();
    } else {
      pauseRestTimer();
      playBeep();
      const overlay = document.getElementById('timerOverlay');
      if (overlay) overlay.classList.remove('active');
    }
  }, 1000);
}

function pauseRestTimer() {
  timerRunning = false;
  const toggleBtn = document.getElementById('btnToggleTimer');
  if (toggleBtn) toggleBtn.textContent = 'Start Rest';
  if (timerInterval) clearInterval(timerInterval);
}

function resetRestTimer() {
  pauseRestTimer();
  timerRemaining = timerSeconds;
  updateTimerClockDisplay();
}

function updateTimerClockDisplay() {
  const m = Math.floor(timerRemaining / 60).toString().padStart(2, '0');
  const s = (timerRemaining % 60).toString().padStart(2, '0');
  const str = `${m}:${s}`;
  const clock = document.getElementById('timerClock');
  const quick = document.getElementById('quickTimerText');
  if (clock) clock.textContent = str;
  if (quick) quick.textContent = str;
}

/* ----------------------------------------------------
   MODALS: ADD EXERCISE & BODY WEIGHT
---------------------------------------------------- */
function initModals() {
  // Add Exercise Modal
  const addModal = document.getElementById('addExerciseModal');
  const closeAddExBtn = document.getElementById('closeAddExBtn');
  const btnCancelAddEx = document.getElementById('btnCancelAddEx');
  const btnConfirmAddEx = document.getElementById('btnConfirmAddEx');

  const closeAddModal = () => {
    if (addModal) addModal.classList.remove('active');
  };

  if (closeAddExBtn) closeAddExBtn.addEventListener('click', closeAddModal);
  if (btnCancelAddEx) btnCancelAddEx.addEventListener('click', closeAddModal);

  if (btnConfirmAddEx) {
    btnConfirmAddEx.addEventListener('click', async () => {
      const name = document.getElementById('newExName').value.trim();
      const scheme = document.getElementById('newExScheme').value.trim();
      const target = document.getElementById('newExTarget').value.trim();
      const category = document.getElementById('newExCategory').value;

      if (!name) {
        await showCustomAlert({ title: 'Missing Name', message: 'Please enter an exercise name.', type: 'error' });
        return;
      }

      if (!activeSession) {
        await showCustomAlert({ title: 'No Active Workout', message: 'Start a workout session first to add an exercise to it.', type: 'info' });
        closeAddModal();
        return;
      }

      const exerciseId = `ex-${activeSession.id}-${(activeSession.exercises || []).length + 1}`;
      const newEx = {
        id: exerciseId,
        workoutId: activeSession.id,
        name,
        targetScheme: scheme || '3×8–12',
        target: target || '35 kg',
        category: category || 'Other',
        sets: [
          { id: `set-${exerciseId}-1`, exerciseId, setNumber: 1, weight: 35, reps: 10, completed: false },
          { id: `set-${exerciseId}-2`, exerciseId, setNumber: 2, weight: 35, reps: 10, completed: false },
          { id: `set-${exerciseId}-3`, exerciseId, setNumber: 3, weight: 35, reps: 10, completed: false }
        ],
        rir: 2
      };

      if (!activeSession.exercises) activeSession.exercises = [];
      activeSession.exercises.push(newEx);
      currentExerciseIndex = activeSession.exercises.length - 1;
      activeSession.currentExerciseIndex = currentExerciseIndex;

      await saveActiveSession(activeSession);
      renderActiveWorkoutScreen();
      closeAddModal();
      document.getElementById('newExName').value = '';
    });
  }

  // Quick Body Weight Modal
  const bwModal = document.getElementById('bodyWeightModal');
  const closeBwBtn = document.getElementById('closeBodyWeightBtn');
  const btnCancelBw = document.getElementById('btnCancelBodyWeight');
  const btnSaveBw = document.getElementById('btnSaveBodyWeight');

  const closeBwModal = () => {
    if (bwModal) bwModal.classList.remove('active');
  };

  if (closeBwBtn) closeBwBtn.addEventListener('click', closeBwModal);
  if (btnCancelBw) btnCancelBw.addEventListener('click', closeBwModal);

    if (btnSaveBw) {
    btnSaveBw.addEventListener('click', async () => {
      const val = parseFloat(document.getElementById('quickBwInput').value);
      if (val && val > 30) {
        if (activeSession) {
          activeSession.bodyWeight = val;
          await saveActiveSession(activeSession);
        } else {
          settings.latestBodyWeight = val;
          await updateSettings(settings);
        }
        renderHomeScreen();
        const chipVal = document.getElementById('workoutWeightChipVal');
        if (chipVal) chipVal.textContent = `${val} kg`;
      }
      closeBwModal();
    });
  }

  // Routine Manager Modal
  initRoutineManagerModals();
}

let currentManagingTemplateId = 'tpl-upper-body';

function initRoutineManagerModals() {
  const manageModal = document.getElementById('manageRoutinesModal');
  const closeManageBtn = document.getElementById('closeManageRoutinesBtn');
  const closeManageBottom = document.getElementById('btnCloseManageRoutinesBottom');
  const routineSelect = document.getElementById('routineMgrSelect');
  const btnNewRoutine = document.getElementById('btnNewRoutinePrompt');
  const btnRenameRoutine = document.getElementById('btnRenameRoutine');
  const btnDeleteRoutine = document.getElementById('btnDeleteRoutine');
  const btnAddExOpen = document.getElementById('btnAddExToRoutineOpen');

  // Add Exercise to Routine Modal
  const addExModal = document.getElementById('addExToRoutineModal');
  const closeAddExToRoutineBtn = document.getElementById('closeAddExToRoutineBtn');
  const btnCancelAddExToRoutine = document.getElementById('btnCancelAddExToRoutine');
  const btnSaveExToRoutine = document.getElementById('btnSaveExToRoutine');

  const closeManage = () => {
    if (manageModal) manageModal.classList.remove('active');
  };
  const closeAddEx = () => {
    if (addExModal) addExModal.classList.remove('active');
  };

  if (closeManageBtn) closeManageBtn.addEventListener('click', closeManage);
  if (closeManageBottom) closeManageBottom.addEventListener('click', closeManage);
  if (closeAddExToRoutineBtn) closeAddExToRoutineBtn.addEventListener('click', closeAddEx);
  if (btnCancelAddExToRoutine) btnCancelAddExToRoutine.addEventListener('click', closeAddEx);

  // When routine selection changes in Manager
  if (routineSelect) {
    routineSelect.addEventListener('change', (e) => {
      currentManagingTemplateId = e.target.value;
      renderRoutineExercisesList(currentManagingTemplateId);
    });
  }

  // + New Routine button
  if (btnNewRoutine) {
    btnNewRoutine.addEventListener('click', async () => {
      const routineName = await showCustomPrompt({
        title: 'New Routine',
        message: 'Enter routine name (e.g. Pull Day, Leg Day, Arms):',
        placeholder: 'e.g. Pull Day, Leg Day',
        okText: 'Create Routine'
      });
      if (!routineName || !routineName.trim()) return;

      const created = await createCustomTemplate(routineName.trim());
      templates = await getTemplates();
      selectedTemplateId = created.id;
      settings.selectedTemplateId = selectedTemplateId;
      await updateSettings(settings);

      openManageRoutinesModal(created.id);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  }

  // Rename routine button
  if (btnRenameRoutine) {
    btnRenameRoutine.addEventListener('click', async () => {
      const tpl = templates.find(t => t.id === currentManagingTemplateId);
      if (!tpl) return;
      const newName = await showCustomPrompt({
        title: 'Rename Routine',
        message: 'Enter new name for this routine:',
        defaultValue: tpl.name,
        okText: 'Rename'
      });
      if (!newName || !newName.trim() || newName.trim() === tpl.name) return;

      await renameTemplate(tpl.id, newName.trim());
      templates = await getTemplates();
      openManageRoutinesModal(tpl.id);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
      if (activeSession && activeSession.templateId === tpl.id) {
        activeSession.name = newName.trim();
        await saveActiveSession(activeSession);
        renderActiveWorkoutScreen();
      }
    });
  }

  // Delete routine button
  if (btnDeleteRoutine) {
    btnDeleteRoutine.addEventListener('click', async () => {
      const tpl = templates.find(t => t.id === currentManagingTemplateId);
      if (!tpl) return;
      const confirmed = await showCustomConfirm({
        title: 'Delete Routine?',
        message: `Are you sure you want to delete routine "${tpl.name}"? This action cannot be undone.`,
        okText: 'Delete Routine',
        isDangerous: true
      });
      if (!confirmed) return;

      await deleteTemplate(tpl.id);
      templates = await getTemplates();
      if (templates.length === 0) {
        await seedDefaultTemplatesIfEmpty();
        templates = await getTemplates();
      }
      currentManagingTemplateId = templates[0]?.id || 'tpl-upper-body';
      selectedTemplateId = currentManagingTemplateId;
      settings.selectedTemplateId = selectedTemplateId;
      await updateSettings(settings);

      openManageRoutinesModal(currentManagingTemplateId);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  }

  // Open Add Exercise Modal
  if (btnAddExOpen) {
    btnAddExOpen.addEventListener('click', () => {
      const tpl = templates.find(t => t.id === currentManagingTemplateId);
      const title = document.getElementById('addExToRoutineTitle');
      if (title && tpl) title.textContent = `Add Exercise to ${tpl.name}`;

      // Reset inputs
      const nameInput = document.getElementById('routineExNameInput');
      const setsInput = document.getElementById('routineExSetsInput');
      const repsInput = document.getElementById('routineExRepsInput');
      const weightInput = document.getElementById('routineExWeightInput');

      if (nameInput) nameInput.value = '';
      if (setsInput) setsInput.value = '3';
      if (repsInput) repsInput.value = '8–12';
      if (weightInput) weightInput.value = '';

      if (addExModal) addExModal.classList.add('active');
      if (nameInput) nameInput.focus();
    });
  }

  // Save Exercise to Routine
  if (btnSaveExToRoutine) {
    btnSaveExToRoutine.addEventListener('click', async () => {
      const name = document.getElementById('routineExNameInput')?.value.trim();
      const sets = parseInt(document.getElementById('routineExSetsInput')?.value) || 3;
      const reps = document.getElementById('routineExRepsInput')?.value.trim() || '8–12';
      const weight = document.getElementById('routineExWeightInput')?.value.trim();
      const category = document.getElementById('routineExCategorySelect')?.value || 'Other';

      if (!name) {
        await showCustomAlert({
          title: 'Exercise Name Required',
          message: 'Please enter an exercise name.',
          type: 'error'
        });
        return;
      }

      await addExerciseToTemplate(currentManagingTemplateId, {
        name,
        targetSets: sets,
        targetScheme: `${sets}×${reps}`,
        targetWeight: weight ? parseFloat(weight) : null,
        category
      });

      templates = await getTemplates();
      closeAddEx();
      renderRoutineExercisesList(currentManagingTemplateId);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  }
}

function openManageRoutinesModal(templateId) {
  const modal = document.getElementById('manageRoutinesModal');
  if (!modal) return;

  currentManagingTemplateId = templateId || selectedTemplateId || templates[0]?.id || 'tpl-upper-body';

  const select = document.getElementById('routineMgrSelect');
  if (select && templates.length > 0) {
    select.innerHTML = templates.map(t =>
      `<option value="${t.id}" ${t.id === currentManagingTemplateId ? 'selected' : ''}>${t.name}</option>`
    ).join('');
  }

  renderRoutineExercisesList(currentManagingTemplateId);
  modal.classList.add('active');
}

function renderRoutineExercisesList(templateId) {
  const container = document.getElementById('routineExercisesList');
  const sectionTitle = document.getElementById('routineExSectionTitle');
  const badge = document.getElementById('routineExCountBadge');
  if (!container) return;

  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) {
    container.innerHTML = '<p class="text-muted text-xs p-2">Routine not found.</p>';
    return;
  }

  if (sectionTitle) sectionTitle.textContent = `Exercises in ${tpl.name}`;
  const exercises = tpl.exercises || [];
  if (badge) badge.textContent = `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`;

  if (exercises.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 0.85rem;">
        No exercises in <strong>${tpl.name}</strong> yet.<br/>Tap <strong>+ Add Exercise</strong> below to add one!
      </div>
    `;
    return;
  }

  container.innerHTML = exercises.map((ex, idx) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding: 10px 8px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));">
      <div>
        <div style="font-weight:600; font-size:0.9rem; color:var(--text-main);">${idx + 1}. ${ex.name}</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
          ${ex.targetScheme || `${ex.targetSets || 3} sets`} · Target: <strong style="color:var(--primary, #d9725b);">${ex.target || (ex.targetWeight ? `${ex.targetWeight} kg` : 'Bodyweight')}</strong> · <span class="badge badge-subtle" style="font-size:0.7rem; padding:1px 6px;">${ex.category || 'Other'}</span>
        </div>
      </div>
      <button class="btn btn-sm btn-subtle btn-del-routine-ex" data-tpl="${tpl.id}" data-ex="${ex.id}" style="color:#ef4444; padding:6px 10px;" title="Remove Exercise">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `).join('');

  // Wire up remove exercise buttons
  container.querySelectorAll('.btn-del-routine-ex').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tId = e.currentTarget.dataset.tpl;
      const eId = e.currentTarget.dataset.ex;
      const tpl = templates.find(t => t.id === tId);
      const ex = tpl?.exercises?.find(x => x.id === eId);
      const confirmed = await showCustomConfirm({
        title: 'Remove Exercise?',
        message: `Remove "${ex ? ex.name : 'this exercise'}" from ${tpl ? tpl.name : 'this routine'}?`,
        okText: 'Remove',
        isDangerous: true
      });
      if (!confirmed) return;

      await removeExerciseFromTemplate(tId, eId);
      templates = await getTemplates();
      renderRoutineExercisesList(tId);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  });
}

function openBodyWeightModal() {
  const modal = document.getElementById('bodyWeightModal');
  const input = document.getElementById('quickBwInput');
  const ref = document.getElementById('quickBwRef');
  if (modal && input) {
    const currentWeight = activeSession?.bodyWeight || (history[0]?.bodyWeight) || settings.latestBodyWeight || null;
    input.value = currentWeight || '';
    if (ref) ref.textContent = currentWeight ? `Previous: ${currentWeight} kg` : 'No weight recorded yet';
    modal.classList.add('active');
    input.focus();
  }
}

async function handleExportBackup() {
  try {
    const backupData = await exportBackup();
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yeshugym_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    await showCustomAlert({
      title: 'Export Failed',
      message: 'Failed to export backup data.',
      type: 'error'
    });
  }
}

async function handleImportBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const confirmed = await showCustomConfirm({
        title: 'Restore Backup?',
        message: 'Restore this backup into IndexedDB? This will replace current workout history and templates.',
        okText: 'Restore Backup',
        isDangerous: true
      });
      if (confirmed) {
        await importBackup(parsed);
        history = await getWorkoutHistory();
        templates = await getTemplates();
        settings = await getSettings();
        activeSession = null;
        renderHomeScreen();
        await showCustomAlert({
          title: 'Import Successful',
          message: 'Backup successfully imported!',
          type: 'success'
        });
      }
    } catch (err) {
      await showCustomAlert({
        title: 'Import Error',
        message: 'Error reading JSON file: ' + err.message,
        type: 'error'
      });
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
