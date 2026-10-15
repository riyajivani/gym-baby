/**
 * Workout Screen View
 * Interactive in-progress session tracker with exercise stepper, tactile set checkmarks, steppers, RIR pills, and cardio logging.
 */

import { appState, setSelectedTemplateId, persistActiveSession, clearActiveSessionState } from '../state.js';
import { getPreviousExercisePerformance } from '../repositories/sessionRepository.js';
import { RIR_DESCRIPTIONS } from '../constants.js';
import { formatShortDate } from '../utils/formatters.js';
import { showCustomConfirm } from './dialogs.js';
import { startRestIntervalTimer } from './restTimer.js';
import { openWorkoutCompletionModal, openBodyWeightModal } from './modals.js';
import { openManageRoutinesModal } from './routineManagerModal.js';
import { handleStartOrResumeWorkout, renderHomeScreen } from './homeView.js';

export function initWorkoutScreen() {
  const btnNext = document.getElementById('btnNextExercise');
  const btnPrev = document.getElementById('btnPrevExercise');
  const btnFinishTop = document.getElementById('btnWorkoutFinishTop');
  const btnDiscardTop = document.getElementById('btnWorkoutDiscardTop');
  const btnAddEx = document.getElementById('btnAddExerciseBtn');
  const weightChip = document.getElementById('workoutWeightChip');

  if (btnNext) btnNext.addEventListener('click', handleNextExercise);

  if (btnPrev) {
    btnPrev.addEventListener('click', async () => {
      if (appState.currentExerciseIndex > 0) {
        appState.currentExerciseIndex--;
        await persistActiveSession();
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
        await setSelectedTemplateId(select.value);
      }
      handleStartOrResumeWorkout();
    });
  }

  const btnEmptyManage = document.getElementById('btnWorkoutEmptyManage');
  if (btnEmptyManage) {
    btnEmptyManage.addEventListener('click', () => {
      const select = document.getElementById('workoutEmptyRoutineSelect');
      const curId = select ? select.value : appState.selectedTemplateId;
      openManageRoutinesModal(curId);
    });
  }
}

export async function handleDiscardActiveWorkoutFromHeader() {
  const confirmed = await showCustomConfirm({
    title: 'Discard Workout?',
    message: 'Are you sure you want to discard this workout session? Unsaved progress will be lost.',
    okText: 'Discard',
    isDangerous: true
  });
  if (!confirmed) return;

  await clearActiveSessionState();
  renderActiveWorkoutScreen();
  renderHomeScreen();
}

export function renderActiveWorkoutScreen() {
  const activeView = document.getElementById('workoutActiveView');
  const emptyView = document.getElementById('workoutEmptyView');

  // Check if an unfinished workout session is active
  const hasActiveSession = Boolean(appState.activeSession && appState.activeSession.status === 'in_progress');

  if (!hasActiveSession) {
    if (activeView) activeView.style.display = 'none';
    if (emptyView) emptyView.style.display = 'block';

    // Populate empty view routine select
    const emptySelect = document.getElementById('workoutEmptyRoutineSelect');
    if (emptySelect && appState.templates.length > 0) {
      emptySelect.innerHTML = appState.templates.map(t =>
        `<option value="${t.id}" ${t.id === appState.selectedTemplateId ? 'selected' : ''}>${t.name} (${(t.exercises || []).length} exercises)</option>`
      ).join('');
      emptySelect.onchange = async (e) => {
        await setSelectedTemplateId(e.target.value);
      };
    }
    return;
  }

  // Active workout is in progress!
  if (emptyView) emptyView.style.display = 'none';
  if (activeView) activeView.style.display = 'block';

  const titleEl = document.getElementById('sessionTitleDisplay');
  if (titleEl) titleEl.textContent = appState.activeSession.name || 'Workout Session';

  const weightChipVal = document.getElementById('workoutWeightChipVal');
  if (weightChipVal) {
    weightChipVal.textContent = appState.activeSession.bodyWeight ? `${appState.activeSession.bodyWeight} kg` : '-- kg';
  }

  const exercises = appState.activeSession.exercises || [];
  const totalExercises = exercises.length;

  // Stepper Progress Header
  const stepLabel = document.getElementById('exerciseStepLabel');
  const stepPercent = document.getElementById('exerciseStepPercent');
  const progressBar = document.getElementById('exerciseProgressBar');

  if (totalExercises > 0) {
    const curStep = Math.min(appState.currentExerciseIndex + 1, totalExercises);
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
    } else if (appState.currentExerciseIndex >= totalExercises - 1) {
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
    btnPrev.style.visibility = (totalExercises > 0 && appState.currentExerciseIndex > 0) ? 'visible' : 'hidden';
  }

  // Cardio Section
  renderCardioInputs();
}

export function renderExercisePillStrip(exercises) {
  const strip = document.getElementById('exercisePillStrip');
  if (!strip) return;
  strip.innerHTML = '';

  exercises.forEach((ex, idx) => {
    const isDone = (ex.sets || []).length > 0 && ex.sets.every(s => s.completed);
    const pill = document.createElement('button');
    pill.className = `ex-pill ${idx === appState.currentExerciseIndex ? 'active' : ''} ${isDone ? 'done' : ''}`;
    pill.textContent = `${idx + 1}. ${ex.name}`;
    pill.addEventListener('click', async () => {
      appState.currentExerciseIndex = idx;
      await persistActiveSession();
      renderActiveWorkoutScreen();
    });
    strip.appendChild(pill);
  });
}

export function renderCurrentExerciseCard(exercises) {
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

  const ex = exercises[appState.currentExerciseIndex] || exercises[0];

  // Lookup previous workout performance
  const prevPerf = ex.previousPerformance || getPreviousExercisePerformance(ex.name, appState.history);

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

export function bindCurrentExerciseEvents(ex) {
  // Steppers: Weight Minus & Plus
  document.querySelectorAll('.btn-w-minus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sIdx = parseInt(e.currentTarget.dataset.set);
      const input = document.querySelector(`.input-set-weight[data-set="${sIdx}"]`);
      let val = parseFloat(input.value) || 0;
      val = Math.max(0, val - (val > 10 ? 2.5 : 1));
      input.value = val;
      ex.sets[sIdx].weight = val;
      await persistActiveSession();
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
      await persistActiveSession();
    });
  });

  // Direct Weight Input
  document.querySelectorAll('.input-set-weight').forEach(input => {
    input.addEventListener('change', async (e) => {
      const sIdx = parseInt(e.target.dataset.set);
      const val = parseFloat(e.target.value) || 0;
      ex.sets[sIdx].weight = val;
      await persistActiveSession();
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
      await persistActiveSession();
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
      await persistActiveSession();
    });
  });

  // Direct Reps Input
  document.querySelectorAll('.input-set-reps').forEach(input => {
    input.addEventListener('change', async (e) => {
      const sIdx = parseInt(e.target.dataset.set);
      const val = parseInt(e.target.value) || 0;
      ex.sets[sIdx].reps = val;
      await persistActiveSession();
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

      await persistActiveSession();
      renderExercisePillStrip(appState.activeSession.exercises);
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
      await persistActiveSession();
      renderCurrentExerciseCard(appState.activeSession.exercises);
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

      await persistActiveSession();
    });
  });
}

export async function handleNextExercise() {
  if (!appState.activeSession) return;
  const exercises = appState.activeSession.exercises || [];
  if (exercises.length === 0) {
    document.getElementById('addExerciseModal')?.classList.add('active');
    return;
  }
  if (appState.currentExerciseIndex < exercises.length - 1) {
    appState.currentExerciseIndex++;
    await persistActiveSession();
    renderActiveWorkoutScreen();

    // Scroll to top of exercise smoothly
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
  } else {
    // Reached end of exercises -> open completion summary modal
    openWorkoutCompletionModal();
  }
}

export function renderCardioInputs() {
  const container = document.getElementById('cardioDetailsContainer');
  if (!container || !appState.activeSession) return;

  if (!appState.activeSession.cardio || appState.activeSession.cardio.length === 0) {
    appState.activeSession.cardio = [{
      name: 'Incline Walking',
      time: '2 min',
      distance: '0.15 km',
      incline: '10%',
      speed: '4.0 km/h'
    }];
  }

  const c = appState.activeSession.cardio[0];

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

export function bindCardioEvents(c) {
  const tIn = document.getElementById('cTimeInput');
  const dIn = document.getElementById('cDistInput');
  const iIn = document.getElementById('cInclInput');
  const sIn = document.getElementById('cSpeedInput');

  const saveCardio = async () => {
    c.time = `${tIn.value} min`;
    c.distance = `${dIn.value} km`;
    c.incline = `${iIn.value}%`;
    c.speed = `${sIn.value} km/h`;
    await persistActiveSession();
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
