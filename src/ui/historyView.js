/**
 * History Screen View
 * Displays completed workouts timeline, exercise volume summaries, and allows deletion.
 */

import { appState, reloadHistory } from '../state.js';
import { deleteWorkout } from '../repositories/workoutRepository.js';
import { formatLongDate } from '../utils/formatters.js';
import { handleExportBackup } from '../utils/backup.js';
import { showCustomConfirm } from './dialogs.js';
import { renderHomeScreen } from './homeView.js';

export function initHistoryScreen() {
  const btnExport = document.getElementById('btnExportJSONHistory');
  if (btnExport) {
    btnExport.addEventListener('click', handleExportBackup);
  }
}

export async function renderHistoryScreen() {
  await reloadHistory();
  const container = document.getElementById('historyContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!appState.history || appState.history.length === 0) {
    container.innerHTML = `
      <div class="card text-center" style="padding: 24px;">
        <p class="text-muted">No saved workouts in history.</p>
      </div>
    `;
    return;
  }

  appState.history.forEach(hist => {
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

  // Delete workout button handler
  container.querySelectorAll('.btn-del-hist').forEach(btn => {
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
