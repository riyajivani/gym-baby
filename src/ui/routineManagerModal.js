/**
 * Routine Manager Modal
 * Handles custom routine creation, renaming, deletion, and exercise management within routines.
 */

import { appState, reloadTemplates, setSelectedTemplateId, persistActiveSession } from '../state.js';
import {
  createCustomTemplate,
  renameTemplate,
  deleteTemplate,
  addExerciseToTemplate,
  removeExerciseFromTemplate,
  seedDefaultTemplatesIfEmpty
} from '../repositories/templateRepository.js';
import { showCustomConfirm, showCustomPrompt, showCustomAlert } from './dialogs.js';
import { renderHomeScreen } from './homeView.js';
import { renderActiveWorkoutScreen } from './workoutView.js';

let currentManagingTemplateId = 'tpl-upper-body';

export function initRoutineManagerModals() {
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
      await reloadTemplates();
      await setSelectedTemplateId(created.id);

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
      const tpl = appState.templates.find(t => t.id === currentManagingTemplateId);
      if (!tpl) return;
      const newName = await showCustomPrompt({
        title: 'Rename Routine',
        message: 'Enter new name for this routine:',
        defaultValue: tpl.name,
        okText: 'Rename'
      });
      if (!newName || !newName.trim() || newName.trim() === tpl.name) return;

      await renameTemplate(tpl.id, newName.trim());
      await reloadTemplates();
      openManageRoutinesModal(tpl.id);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
      if (appState.activeSession && appState.activeSession.templateId === tpl.id) {
        appState.activeSession.name = newName.trim();
        await persistActiveSession();
        renderActiveWorkoutScreen();
      }
    });
  }

  // Delete routine button
  if (btnDeleteRoutine) {
    btnDeleteRoutine.addEventListener('click', async () => {
      const tpl = appState.templates.find(t => t.id === currentManagingTemplateId);
      if (!tpl) return;
      const confirmed = await showCustomConfirm({
        title: 'Delete Routine?',
        message: `Are you sure you want to delete routine "${tpl.name}"? This action cannot be undone.`,
        okText: 'Delete Routine',
        isDangerous: true
      });
      if (!confirmed) return;

      await deleteTemplate(tpl.id);
      await reloadTemplates();
      if (appState.templates.length === 0) {
        await seedDefaultTemplatesIfEmpty();
        await reloadTemplates();
      }
      currentManagingTemplateId = appState.templates[0]?.id || 'tpl-upper-body';
      await setSelectedTemplateId(currentManagingTemplateId);

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
      const tpl = appState.templates.find(t => t.id === currentManagingTemplateId);
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

      await reloadTemplates();
      closeAddEx();
      renderRoutineExercisesList(currentManagingTemplateId);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  }
}

export function openManageRoutinesModal(templateId) {
  const modal = document.getElementById('manageRoutinesModal');
  if (!modal) return;

  currentManagingTemplateId = templateId || appState.selectedTemplateId || appState.templates[0]?.id || 'tpl-upper-body';

  const select = document.getElementById('routineMgrSelect');
  if (select && appState.templates.length > 0) {
    select.innerHTML = appState.templates.map(t =>
      `<option value="${t.id}" ${t.id === currentManagingTemplateId ? 'selected' : ''}>${t.name}</option>`
    ).join('');
  }

  renderRoutineExercisesList(currentManagingTemplateId);
  modal.classList.add('active');
}

export function renderRoutineExercisesList(templateId) {
  const container = document.getElementById('routineExercisesList');
  const sectionTitle = document.getElementById('routineExSectionTitle');
  const badge = document.getElementById('routineExCountBadge');
  if (!container) return;

  const tpl = appState.templates.find(t => t.id === templateId);
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
      const currentTpl = appState.templates.find(t => t.id === tId);
      const ex = currentTpl?.exercises?.find(x => x.id === eId);
      const confirmed = await showCustomConfirm({
        title: 'Remove Exercise?',
        message: `Remove "${ex ? ex.name : 'this exercise'}" from ${currentTpl ? currentTpl.name : 'this routine'}?`,
        okText: 'Remove',
        isDangerous: true
      });
      if (!confirmed) return;

      await removeExerciseFromTemplate(tId, eId);
      await reloadTemplates();
      renderRoutineExercisesList(tId);
      renderHomeScreen();
      if (document.getElementById('workoutEmptyView')?.style.display !== 'none') {
        renderActiveWorkoutScreen();
      }
    });
  });
}
