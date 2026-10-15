/**
 * Home Screen View
 * Displays active routine, quick stats, weekly consistency, progressive overload, and workout starter.
 */

import { appState, setSelectedTemplateId, clearActiveSessionState } from '../state.js';
import { getDefaultTemplate } from '../repositories/templateRepository.js';
import { createSessionFromTemplate, saveActiveSession } from '../repositories/sessionRepository.js';
import { formatShortDate } from '../utils/formatters.js';
import { showCustomConfirm, showCustomAlert } from './dialogs.js';
import { switchTab } from './navigation.js';
import { openBodyWeightModal } from './modals.js';
import { openManageRoutinesModal } from './routineManagerModal.js';

export function initHomeScreen() {
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
      await setSelectedTemplateId(e.target.value);
      renderHomeScreen();
    });
  }

  const btnManageHome = document.getElementById('btnManageRoutinesHome');
  if (btnManageHome) {
    btnManageHome.addEventListener('click', () => {
      openManageRoutinesModal(appState.selectedTemplateId);
    });
  }
}

export async function renderHomeScreen() {
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
  if (tplSelect && appState.templates.length > 0) {
    tplSelect.innerHTML = appState.templates.map(t =>
      `<option value="${t.id}" ${t.id === appState.selectedTemplateId ? 'selected' : ''}>${t.name}</option>`
    ).join('');
  }

  // Get active selected template
  const currentTemplate = appState.templates.find(t => t.id === appState.selectedTemplateId) || appState.templates[0] || (await getDefaultTemplate());

  const titleEl = document.getElementById('homeWorkoutTitle');
  const subEl = document.getElementById('homeWorkoutSub');
  const weightEl = document.getElementById('homeWeightDisplay');
  const lastEl = document.getElementById('homeLastWorkoutDisplay');
  const btnTextEl = document.getElementById('btnStartWorkoutText');
  const inProgressBanner = document.getElementById('homeInProgressBanner');
  const inProgressText = document.getElementById('homeInProgressText');
  const btnDiscard = document.getElementById('btnDiscardActiveWorkout');

  // Check if an unfinished workout session is active
  const hasActiveSession = Boolean(appState.activeSession && appState.activeSession.status === 'in_progress');

  if (hasActiveSession) {
    if (inProgressBanner) inProgressBanner.style.display = 'inline-flex';
    if (inProgressText) {
      const elapsed = Math.max(1, Math.round((Date.now() - (appState.activeSession.startedAt || Date.now())) / 60000));
      inProgressText.textContent = `In Progress · ${elapsed}m elapsed`;
    }
    if (btnTextEl) btnTextEl.textContent = 'RESUME WORKOUT';
    if (btnDiscard) btnDiscard.style.display = 'block';

    if (titleEl) titleEl.textContent = `${appState.activeSession.name} (Active)`;
    if (subEl) subEl.textContent = `${(appState.activeSession.exercises || []).length} exercises · Step ${appState.currentExerciseIndex + 1}`;
  } else {
    if (inProgressBanner) inProgressBanner.style.display = 'none';
    if (btnTextEl) btnTextEl.textContent = 'START WORKOUT';
    if (btnDiscard) btnDiscard.style.display = 'none';

    if (titleEl) titleEl.textContent = currentTemplate.name || 'Upper Body';
    const exCount = (currentTemplate.exercises || []).length;
    if (subEl) subEl.textContent = `${exCount} exercises · ~45 min`;
  }

  // Latest body weight
  const latestWeight = appState.activeSession?.bodyWeight || (appState.history[0]?.bodyWeight) || appState.settings.latestBodyWeight || null;
  if (weightEl) weightEl.textContent = latestWeight ? `${latestWeight} kg` : '-- kg';

  // Last workout from history matching the template
  const matchingLastWorkout = appState.history.length > 0 ? appState.history[0] : null;
  if (matchingLastWorkout && lastEl) {
    const formattedDate = formatShortDate(matchingLastWorkout.date);
    lastEl.textContent = `${matchingLastWorkout.name?.replace(/\s*\([^)]*\)/, '') || 'Workout'} · ${formattedDate}`;
  } else if (lastEl) {
    lastEl.textContent = 'None yet';
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
    const thisWeekCount = appState.history.filter(h => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo;
    }).length;
    weeklyCountEl.textContent = `${thisWeekCount} Workout${thisWeekCount === 1 ? '' : 's'} Completed`;
  }

  // Progressive Overload Highlights
  const progressListEl = document.getElementById('homeProgressList');
  if (progressListEl) {
    if (appState.history.length === 0) {
      progressListEl.innerHTML = `
        <li style="color:var(--text-muted); font-size: 0.85rem; padding: 4px 0;">
          No workouts logged yet. Start a workout to see progressive overload highlights here!
        </li>
      `;
    } else {
      const latest = appState.history[0];
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

export async function handleStartOrResumeWorkout() {
  if (appState.isStartingWorkout) return;
  appState.isStartingWorkout = true;

  try {
    // 1. If an active session is currently in progress: resume it
    if (appState.activeSession && appState.activeSession.status === 'in_progress') {
      switchTab('workout');
      return;
    }

    // 2. Otherwise create a fresh session from the selected template
    const template = appState.templates.find(t => t.id === appState.selectedTemplateId) || await getDefaultTemplate();

    // Instantiate fresh workout session
    appState.activeSession = createSessionFromTemplate(template, appState.history);
    appState.currentExerciseIndex = 0;

    // Persist immediately to IndexedDB
    await saveActiveSession(appState.activeSession);

    // Switch to Workout screen
    switchTab('workout');
  } catch (err) {
    console.error('Error starting workout session:', err);
    await showCustomAlert({ title: 'Error', message: 'Failed to start workout. Please try again.', type: 'error' });
  } finally {
    appState.isStartingWorkout = false;
  }
}

export async function handleDiscardActiveWorkout() {
  const confirmed = await showCustomConfirm({
    title: 'Discard In-Progress Workout?',
    message: 'Are you sure you want to discard your unfinished workout session? All logged sets for this session will be lost.',
    okText: 'Discard Workout',
    isDangerous: true
  });
  if (!confirmed) return;

  await clearActiveSessionState();
  renderHomeScreen();
}
