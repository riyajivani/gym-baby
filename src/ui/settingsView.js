/**
 * Settings & Tools Screen View
 * Preferences, Routine Manager launcher, Backup Export/Import, Smart Notes Parser, and Data Management.
 */

import { appState, reloadHistory, reloadTemplates } from '../state.js';
import { updateSettings } from '../repositories/settingsRepository.js';
import { createWorkout } from '../repositories/workoutRepository.js';
import { clearAllWorkoutData } from '../db/database.js';
import { parseGymLog } from '../parser.js';
import { SAMPLE_FORMAT_GUIDE } from '../constants.js';
import { handleExportBackup, handleImportBackup } from '../utils/backup.js';
import { showCustomConfirm, showCustomAlert } from './dialogs.js';
import { openManageRoutinesModal } from './routineManagerModal.js';
import { renderHomeScreen } from './homeView.js';

export function initSettingsScreen() {
  const weekStartSelect = document.getElementById('weekStartSelect');
  if (weekStartSelect) {
    weekStartSelect.value = appState.settings.weekStartDay || 'Monday';
    weekStartSelect.addEventListener('change', async (e) => {
      appState.settings.weekStartDay = e.target.value;
      await updateSettings(appState.settings);
    });
  }

  const btnManageSettings = document.getElementById('btnManageRoutinesSettings');
  if (btnManageSettings) {
    btnManageSettings.addEventListener('click', () => {
      openManageRoutinesModal(appState.selectedTemplateId);
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

  // Text Parser in Settings (Expandable Utility)
  const toggleParserRow = document.getElementById('btnToggleParserRow');
  const toggleParserBtn = document.getElementById('btnToggleParser');
  const parserContainer = document.getElementById('parserBodyContainer');
  if (toggleParserRow && parserContainer) {
    toggleParserRow.addEventListener('click', () => {
      const isHidden = parserContainer.style.display === 'none';
      parserContainer.style.display = isHidden ? 'block' : 'none';
      if (toggleParserBtn) {
        toggleParserBtn.innerHTML = isHidden ? '<span>Collapse</span> ▴' : '<span>Expand</span> ▾';
      }
    });
  }

  const textarea = document.getElementById('rawTextarea');
  const btnParse = document.getElementById('btnParseText');
  const btnLoadSample = document.getElementById('btnLoadSampleText');
  const btnClear = document.getElementById('btnClearText');

  if (textarea) {
    textarea.value = '';
    updateParsePreview('');
    textarea.addEventListener('input', () => updateParsePreview(textarea.value));
  }

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
        let importedCount = 0;
        let lastBw = null;
        for (const day of parsed.days) {
          if (day.exercises.length > 0 || day.cardio.length > 0) {
            const newSessionData = {
              ...day,
              id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: day.title || 'Parsed Session',
              status: 'completed',
              completedAt: Date.now()
            };
            await createWorkout(newSessionData);
            if (day.bodyWeight) lastBw = day.bodyWeight;
            importedCount++;
          }
        }
        if (lastBw) {
          appState.settings.latestBodyWeight = lastBw;
          await updateSettings(appState.settings);
        }
        await reloadHistory();
        renderHomeScreen();
        await showCustomAlert({
          title: 'Import Complete',
          message: `Successfully imported ${importedCount} session${importedCount === 1 ? '' : 's'} (${parsed.days[0].exercises.length} exercises) into history!`,
          type: 'success'
        });
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
        okText: 'Clear',
        isDangerous: true
      });
      if (confirmed) {
        await clearAllWorkoutData();
        await reloadHistory();
        appState.activeSession = null;
        appState.currentExerciseIndex = 0;
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
        await reloadTemplates();
        await reloadHistory();
        appState.activeSession = null;
        renderHomeScreen();
        await showCustomAlert({ title: 'Reset Complete', message: 'App has been reset cleanly!', type: 'success' });
      }
    });
  }
}

export function renderSettingsScreen() {
  const weekStartSelect = document.getElementById('weekStartSelect');
  if (weekStartSelect && appState.settings.weekStartDay) {
    weekStartSelect.value = appState.settings.weekStartDay;
  }
}

export function updateParsePreview(text) {
  const previewBox = document.getElementById('parsePreviewOutput');
  const badge = document.getElementById('parseStatusBadge');
  if (!previewBox || !badge) return;

  const parsed = parseGymLog(text);
  if (!parsed || !parsed.days || parsed.days.length === 0 || (parsed.days[0].exercises.length === 0 && parsed.days[0].cardio.length === 0)) {
    badge.textContent = 'Empty';
    badge.className = 'badge badge-subtle ml-auto';
    previewBox.innerHTML = '<p class="text-muted text-xs">Paste gym text above to preview structure.</p>';
    return;
  }

  const day = parsed.days[0];
  const exCount = day.exercises ? day.exercises.length : 0;
  const cardioCount = day.cardio ? day.cardio.length : 0;

  badge.textContent = `Parsed (${exCount} Ex${cardioCount ? ' + Cardio' : ''})`;
  badge.className = 'badge badge-success ml-auto';

  let html = `<div style="font-weight:700; color:var(--primary); font-size:0.85rem; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
    <span>${day.title || 'Workout Session'}</span>
    ${day.bodyWeight ? `<span class="badge badge-subtle" style="font-size:0.75rem; font-weight:700; color:var(--text-main);">⚖️ ${day.bodyWeight} kg</span>` : ''}
  </div>`;

  // Render ALL parsed exercises
  if (day.exercises && day.exercises.length > 0) {
    day.exercises.forEach((ex, idx) => {
      const setsDesc = ex.sets.length > 0
        ? ex.sets.map(s => `${s.rawWeightText || (s.weight + ' kg')} × ${s.reps}`).join(', ')
        : (ex.targetScheme || '');
      html += `
        <div style="padding: 5px 0; border-bottom: 1px dashed var(--border-subtle); display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:600; color:var(--text-main); font-size:0.78rem;">
              ${idx + 1}. ${ex.name} <span class="text-muted" style="font-weight:normal;">(${ex.sets.length} sets)</span>
            </div>
            ${setsDesc ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:1px;">${setsDesc}</div>` : ''}
          </div>
          ${ex.target ? `<span class="badge badge-subtle" style="font-size:0.68rem; padding:1px 6px; flex-shrink:0;">${ex.target}</span>` : ''}
        </div>
      `;
    });
  }

  // Render Cardio (e.g. Incline Walking)
  if (day.cardio && day.cardio.length > 0) {
    day.cardio.forEach(c => {
      const details = [c.time, c.distance, c.speed, c.incline ? `${c.incline} incline` : ''].filter(Boolean).join(' · ');
      html += `
        <div style="font-size:0.75rem; padding: 6px 0; margin-top:4px; color:var(--text-main); font-weight:600; display:flex; align-items:center; gap:6px;">
          <span>🏃 ${c.name}</span>
          ${details ? `<span class="text-muted" style="font-weight:normal; font-size:0.7rem;">(${details})</span>` : ''}
        </div>
      `;
    });
  }

  previewBox.innerHTML = html;
}
