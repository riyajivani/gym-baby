/**
 * Settings & Tools Screen View
 * Preferences, Routine Manager launcher, Backup Export/Import, Smart Notes Parser, and Data Management.
 */

import { db, clearAllWorkoutData } from '../db/database.js';
import { appState, reloadHistory, reloadTemplates } from '../state.js';
import { updateSettings } from '../repositories/settingsRepository.js';
import { createWorkout } from '../repositories/workoutRepository.js';
import { createCustomTemplate } from '../repositories/templateRepository.js';
import { parseGymLog } from '../parser.js';
import { SAMPLE_FORMAT_GUIDE } from '../constants.js';
import { handleExportBackup, handleImportBackup } from '../utils/backup.js';
import { showCustomConfirm, showCustomAlert } from './dialogs.js';
import { openManageRoutinesModal } from './routineManagerModal.js';
import { renderHomeScreen } from './homeView.js';

let latestParsedDays = [];

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

        // Read any dates modified in the preview UI
        const dateInputs = document.querySelectorAll('.parsed-day-date-input');
        dateInputs.forEach(input => {
          const dayIdx = parseInt(input.dataset.dayIndex);
          if (parsed.days[dayIdx] && input.value) {
            parsed.days[dayIdx].date = input.value;
          }
        });

        // 1. Import Workouts into History
        for (const day of parsed.days) {
          if (day.exercises.length > 0 || day.cardio.length > 0) {
            const newSessionData = {
              ...day,
              id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: day.routineName || day.title || 'Workout Session',
              weekLabel: day.routineName || day.title || 'Workout Session',
              date: day.date || new Date().toISOString().split('T')[0],
              status: 'completed',
              completedAt: Date.now()
            };
            await createWorkout(newSessionData);
            if (day.bodyWeight) lastBw = day.bodyWeight;
            importedCount++;

            // 2. Also automatically synchronize/populate Routine Templates in Manage Routines!
            // Clean routine name e.g. "Push Day", "Pull Day", "Legs + Core", "Upper Body", "Arms + Shoulders + Core"
            const routineTitle = day.routineName || day.title || 'Workout Routine';
            await syncRoutineTemplate(routineTitle, day.exercises, day.cardio);
          }
        }

        if (lastBw) {
          appState.settings.latestBodyWeight = lastBw;
          await updateSettings(appState.settings);
        }

        await reloadHistory();
        await reloadTemplates();
        renderHomeScreen();

        await showCustomAlert({
          title: 'Import & Routine Setup Complete!',
          message: `Successfully imported ${importedCount} workouts into History with their exact dates, and automatically set up your Routines (Push Day, Pull Day, Legs + Core, Upper Body, Arms + Shoulders + Core)!`,
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

/**
 * Synchronizes routine templates without touching historical workouts
 */
async function syncRoutineTemplate(routineName, exercises, cardio = []) {
  if (!exercises || exercises.length === 0) return;

  const currentTemplates = await db.templates.toArray();
  const lowerName = routineName.toLowerCase();

  // Find matching template
  let targetTpl = currentTemplates.find(t => {
    const tLower = t.name.toLowerCase();
    if (tLower === lowerName) return true;
    if (lowerName === 'push day' && (t.id === 'tpl-push-day' || tLower.includes('push'))) return true;
    if (lowerName === 'pull day' && (t.id === 'tpl-pull-day' || tLower.includes('pull'))) return true;
    if ((lowerName.includes('legs') || lowerName.includes('leg')) && (t.id === 'tpl-leg-day' || tLower.includes('leg'))) return true;
    if (lowerName === 'upper body' && (t.id === 'tpl-upper-body' || tLower.includes('upper'))) return true;
    if (lowerName.includes('arms') && tLower.includes('arms')) return true;
    return false;
  });

  if (!targetTpl) {
    targetTpl = await createCustomTemplate(routineName);
  } else {
    targetTpl.name = routineName;
  }

  // Convert exercises into template format with targets
  const tplExercises = exercises.map((ex, idx) => {
    let bestWeight = null;
    (ex.sets || []).forEach(s => {
      if (s.weight > 0 && (bestWeight === null || s.weight > bestWeight)) {
        bestWeight = s.weight;
      }
    });

    return {
      id: `tpl-ex-${targetTpl.id}-${idx + 1}-${Date.now()}`,
      templateId: targetTpl.id,
      name: ex.name,
      order: idx + 1,
      targetSets: ex.sets.length || 3,
      targetScheme: ex.targetScheme || `${ex.sets.length || 3}×8–12`,
      target: ex.target || (bestWeight ? `${bestWeight} kg` : '35 kg'),
      targetWeight: bestWeight || (ex.sets[0] ? ex.sets[0].weight : null),
      category: ex.category || 'Other'
    };
  });

  targetTpl.exercises = tplExercises;
  targetTpl.cardio = (cardio || []).map(c => ({ ...c }));
  targetTpl.updatedAt = Date.now();

  await db.templates.put(targetTpl);
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
    latestParsedDays = [];
    return;
  }

  latestParsedDays = parsed.days;
  const totalDays = parsed.days.length;
  let totalEx = 0;
  parsed.days.forEach(d => { totalEx += (d.exercises || []).length; });

  badge.textContent = `${totalDays} Day${totalDays === 1 ? '' : 's'} (${totalEx} Ex Total)`;
  badge.className = 'badge badge-success ml-auto';

  let html = '';

  parsed.days.forEach((day, dIdx) => {
    const exCount = (day.exercises || []).length;
    const cardioCount = (day.cardio || []).length;

    html += `
      <div style="background:var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; flex-wrap:wrap; gap:6px;">
          <div>
            <span style="font-weight:700; color:var(--primary); font-size:0.88rem;">${day.routineName || day.title}</span>
            <span class="text-muted" style="font-size:0.75rem; margin-left:4px;">(${exCount} exercises${cardioCount ? ' + cardio' : ''})</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="date" class="parsed-day-date-input" data-day-index="${dIdx}" value="${day.date}" style="color-scheme:dark; font-size:0.76rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px; padding:3px 6px; outline:none;" title="Adjust workout date" />
            ${day.bodyWeight ? `<span class="badge badge-subtle" style="font-size:0.72rem; font-weight:700; color:var(--text-main);">⚖️ ${day.bodyWeight} kg</span>` : ''}
          </div>
        </div>
    `;

    // Render exercises
    (day.exercises || []).forEach((ex, idx) => {
      const setsDesc = ex.sets.length > 0
        ? ex.sets.map(s => `${s.rawWeightText || (s.weight + ' kg')} × ${s.reps}`).join(', ')
        : (ex.targetScheme || '');
      const rirBadge = ex.rir !== null && ex.rir !== undefined ? `<span style="color:var(--primary); font-size:0.68rem; margin-left:4px;">(RIR ${ex.rir})</span>` : '';

      html += `
        <div style="padding: 4px 0; border-bottom: 1px dashed var(--border-subtle); display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:600; color:var(--text-main); font-size:0.76rem;">
              ${idx + 1}. ${ex.name} <span class="text-muted" style="font-weight:normal;">(${ex.sets.length} sets)</span>${rirBadge}
            </div>
            ${setsDesc ? `<div style="font-size:0.68rem; color:var(--text-dim); margin-top:1px;">${setsDesc}</div>` : ''}
          </div>
          ${ex.target ? `<span class="badge badge-subtle" style="font-size:0.68rem; padding:1px 6px; flex-shrink:0;">${ex.target}</span>` : ''}
        </div>
      `;
    });

    // Render cardio
    (day.cardio || []).forEach(c => {
      const details = [c.time, c.distance, c.speed, c.incline ? `${c.incline} incline` : ''].filter(Boolean).join(' · ');
      html += `
        <div style="font-size:0.72rem; padding: 4px 0; margin-top:4px; color:var(--text-main); font-weight:600; display:flex; align-items:center; gap:6px;">
          <span>🏃 ${c.name}</span>
          ${details ? `<span class="text-muted" style="font-weight:normal; font-size:0.68rem;">(${details})</span>` : ''}
        </div>
      `;
    });

    html += `</div>`;
  });

  previewBox.innerHTML = html;

  // Bind change on date inputs to keep state in sync
  previewBox.querySelectorAll('.parsed-day-date-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.dayIndex);
      if (latestParsedDays[idx]) {
        latestParsedDays[idx].date = e.target.value;
      }
    });
  });
}
