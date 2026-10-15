/**
 * Application Modals
 * Workout Completion Summary, Add Exercise to Active Workout, and Quick Body Weight.
 */

import { appState, reloadHistory, persistActiveSession } from '../state.js';
import { finishSession } from '../repositories/sessionRepository.js';
import { updateSettings } from '../repositories/settingsRepository.js';
import { showCustomAlert } from './dialogs.js';
import { switchTab } from './navigation.js';
import { renderHomeScreen } from './homeView.js';
import { renderActiveWorkoutScreen } from './workoutView.js';
import { initRoutineManagerModals } from './routineManagerModal.js';

export function initModals() {
  // Add Exercise to Active Workout Modal
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

      if (!appState.activeSession) {
        await showCustomAlert({ title: 'No Active Workout', message: 'Start a workout session first to add an exercise to it.', type: 'info' });
        closeAddModal();
        return;
      }

      const exerciseId = `ex-${appState.activeSession.id}-${(appState.activeSession.exercises || []).length + 1}`;
      const newEx = {
        id: exerciseId,
        workoutId: appState.activeSession.id,
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

      if (!appState.activeSession.exercises) appState.activeSession.exercises = [];
      appState.activeSession.exercises.push(newEx);
      appState.currentExerciseIndex = appState.activeSession.exercises.length - 1;
      appState.activeSession.currentExerciseIndex = appState.currentExerciseIndex;

      await persistActiveSession();
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
        if (appState.activeSession) {
          appState.activeSession.bodyWeight = val;
          await persistActiveSession();
        } else {
          appState.settings.latestBodyWeight = val;
          await updateSettings(appState.settings);
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

/**
 * Opens Workout Completion Summary Modal with duration, volume, and bodyweight metrics
 */
export function openWorkoutCompletionModal() {
  if (!appState.activeSession) return;
  const modal = document.getElementById('workoutCompleteModal');
  if (!modal) return;

  // Calculate volume & completed sets
  let totalVol = 0;
  let totalSets = 0;
  (appState.activeSession.exercises || []).forEach(ex => {
    (ex.sets || []).forEach(s => {
      if (s.completed) {
        totalSets++;
        totalVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
      }
    });
  });

  // Calculate duration
  const now = Date.now();
  const started = appState.activeSession.startedAt || now;
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
  if (exEl) exEl.textContent = `${(appState.activeSession.exercises || []).length}`;
  if (setsEl) setsEl.textContent = `${totalSets}`;

  const currentBw = appState.activeSession.bodyWeight || (appState.history[0]?.bodyWeight) || appState.settings.latestBodyWeight || null;
  if (weightInput) weightInput.value = currentBw || '';
  if (weightRef) weightRef.textContent = currentBw ? `Previous: ${currentBw} kg` : 'No weight recorded yet';

  if (cardioVal) {
    if (appState.activeSession.cardio && appState.activeSession.cardio.length > 0) {
      const c = appState.activeSession.cardio[0];
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
      if (appState.isFinishingWorkout) return;
      appState.isFinishingWorkout = true;
      btnDone.disabled = true;

      try {
        const customWeight = weightInput && parseFloat(weightInput.value) ? parseFloat(weightInput.value) : (currentBw || null);

        // Finish session, save permanently, clear active session
        await finishSession(appState.activeSession, {
          bodyWeight: customWeight,
          durationMinutes: elapsedMinutes
        });

        // Reset state
        appState.activeSession = null;
        appState.currentExerciseIndex = 0;

        // Refresh completed workouts history
        await reloadHistory();

        // Close modal and transition back to Home
        modal.classList.remove('active');
        switchTab('home');
      } catch (err) {
        console.error('Error completing workout:', err);
        await showCustomAlert({ title: 'Error', message: 'Could not save workout. Please try again.', type: 'error' });
      } finally {
        appState.isFinishingWorkout = false;
        btnDone.disabled = false;
      }
    };
  }
}

/**
 * Opens quick body weight update modal
 */
export function openBodyWeightModal() {
  const modal = document.getElementById('bodyWeightModal');
  const input = document.getElementById('quickBwInput');
  const ref = document.getElementById('quickBwRef');
  if (modal && input) {
    const currentWeight = appState.activeSession?.bodyWeight || (appState.history[0]?.bodyWeight) || appState.settings.latestBodyWeight || null;
    input.value = currentWeight || '';
    if (ref) ref.textContent = currentWeight ? `Previous: ${currentWeight} kg` : 'No weight recorded yet';
    modal.classList.add('active');
    input.focus();
  }
}
