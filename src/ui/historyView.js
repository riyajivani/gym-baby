/**
 * History Screen View
 * Displays completed workouts timeline, detailed exercise breakdowns, tracked set logs, and volume summaries.
 */

import { appState, reloadHistory } from '../state.js';
import { deleteWorkout } from '../repositories/workoutRepository.js';
import { formatLongDate, formatTime, formatDuration } from '../utils/formatters.js';
import { handleExportBackup } from '../utils/backup.js';
import { showCustomConfirm } from './dialogs.js';
import { renderHomeScreen } from './homeView.js';
import { switchTab } from './navigation.js';

// Set of workout IDs that are currently expanded in the view
const expandedWorkoutIds = new Set();

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
      <div class="card text-center" style="padding: 32px 20px;">
        <div style="font-size: 2.2rem; margin-bottom: 10px;">📋o</div>
        <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 6px;">No Workouts in History</h3>
        <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 16px; max-width: 280px; margin-left: auto; margin-right: auto;">
          Complete a workout session or import past gym logs from Settings to see your tracked exercises and sets here.
        </p>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" id="btnHistEmptyStart">+ Start Workout</button>
          <button class="btn btn-outline-subtle btn-sm" id="btnHistEmptySettings">⚙ Import Past Logs</button>
        </div>
      </div>
    `;

    document.getElementById('btnHistEmptyStart')?.addEventListener('click', () => switchTab('workout'));
    document.getElementById('btnHistEmptySettings')?.addEventListener('click', () => switchTab('settings'));
    return;
  }

  // 1. Toolbar above list (Workout count + Expand/Collapse All)
  const allExpanded = appState.history.length > 0 && appState.history.every(h => expandedWorkoutIds.has(h.id));
  const toolbar = document.createElement('div');
  toolbar.className = 'history-toolbar';
  toolbar.innerHTML = `
    <span class="history-count-badge">
      ${appState.history.length} Workout${appState.history.length === 1 ? '' : 's'} Logged
    </span>
    <button class="btn btn-sm btn-outline-subtle btn-hist-toggle-all" id="btnToggleAllHistory">
      ${allExpanded ? 'Collapse All ▴' : 'Expand All ▾'}
    </button>
  `;
  container.appendChild(toolbar);

  toolbar.querySelector('#btnToggleAllHistory')?.addEventListener('click', () => {
    if (allExpanded) {
      expandedWorkoutIds.clear();
    } else {
      appState.history.forEach(h => expandedWorkoutIds.add(h.id));
    }
    renderHistoryScreen();
  });

  // 2. Render each workout card
  appState.history.forEach(hist => {
    let vol = 0;
    let completedSetsCount = 0;
    let totalSetsCount = 0;

    const exercises = hist.exercises || [];
    exercises.forEach(e => {
      (e.sets || []).forEach(s => {
        totalSetsCount++;
        if (s.completed) {
          completedSetsCount++;
          vol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        }
      });
    });

    // Duration calculation
    let durationText = '';
    if (hist.durationMinutes) {
      durationText = formatDuration(hist.durationMinutes);
    } else if (hist.startedAt && hist.completedAt) {
      const diffMins = Math.round((hist.completedAt - hist.startedAt) / 60000);
      if (diffMins > 0 && diffMins < 720) {
        durationText = formatDuration(diffMins);
      }
    }

    const hasCardio = Array.isArray(hist.cardio) && hist.cardio.length > 0;
    const isExpanded = expandedWorkoutIds.has(hist.id);

    // Build exercises breakdown HTML
    let exercisesHtml = '';
    if (exercises.length === 0) {
      exercisesHtml = `<div class="text-muted" style="font-size:0.76rem; padding: 6px 0;">No individual exercises recorded for this workout.</div>`;
    } else {
      exercisesHtml = exercises.map((ex, exIdx) => {
        const exSets = ex.sets || [];
        const exCompleted = exSets.filter(s => s.completed);
        const exVol = exCompleted.reduce((sum, s) => sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0);

        // Find best set (heaviest weight, then highest reps)
        let bestSet = null;
        exCompleted.forEach(s => {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps) || 0;
          if (!bestSet || w > bestSet.w || (w === bestSet.w && r > bestSet.r)) {
            bestSet = { w, r };
          }
        });

        // Target scheme / weight description
        const targetDesc = [ex.targetScheme, ex.target || (ex.targetWeight ? `${ex.targetWeight} kg` : '')].filter(Boolean).join(' · ');

        // Sets table rows
        let setsRowsHtml = '';
        if (exSets.length === 0) {
          setsRowsHtml = `<tr><td colspan="5" class="text-muted" style="text-align:center; padding:8px;">No sets recorded</td></tr>`;
        } else {
          setsRowsHtml = exSets.map((s, sIdx) => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps) || 0;
            const setVol = w * r;
            const isSetDone = Boolean(s.completed);

            return `
              <tr>
                <td class="hist-set-num">Set ${s.setNumber || (sIdx + 1)}</td>
                <td class="hist-set-val">${w} kg</td>
                <td class="hist-set-val">${r} reps</td>
                <td class="hist-set-vol">${setVol > 0 ? `${setVol.toLocaleString()} kg` : '—'}</td>
                <td>
                  ${isSetDone
                ? `<span class="hist-set-status-badge completed">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Done
                       </span>`
                : `<span class="hist-set-status-badge skipped">Incomplete</span>`
              }
                </td>
              </tr>
            `;
          }).join('');
        }

        return `
          <div class="hist-exercise-block">
            <div class="hist-ex-header">
              <div class="hist-ex-title">${exIdx + 1}. ${ex.name}</div>
              <span class="hist-ex-category">${ex.category || 'Exercise'}</span>
            </div>

            <div class="hist-ex-meta-row">
              ${targetDesc ? `<span class="hist-meta-pill">🎯 Target: <strong>${targetDesc}</strong></span>` : ''}
              ${ex.rir !== null && ex.rir !== undefined ? `<span class="hist-meta-pill" style="color:var(--primary);">⚡ <strong>RIR ${ex.rir}</strong></span>` : ''}
              ${exVol > 0 ? `<span class="hist-meta-pill">⚡ <strong>${exVol.toLocaleString()} kg</strong> vol</span>` : ''}
              ${bestSet ? `<span class="hist-meta-pill">🏆 Top: <strong>${bestSet.w} kg × ${bestSet.r}</strong></span>` : ''}
            </div>

            <table class="hist-sets-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>Weight</th>
                  <th>Reps</th>
                  <th>Vol</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${setsRowsHtml}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
    }

    // Build Cardio section HTML
    let cardioHtml = '';
    if (hasCardio) {
      const cardioItemsHtml = hist.cardio.map(c => {
        const timeVal = c.time || (c.durationMinutes ? `${c.durationMinutes} min` : null);
        const distVal = c.distance || (c.distanceKm ? `${c.distanceKm} km` : null);
        const speedVal = c.speed ? `${c.speed} km/h` : null;
        const inclineVal = c.incline ? `${c.incline}%` : null;
        const calVal = c.calories ? `${c.calories} kcal` : null;

        return `
          <div class="hist-cardio-box">
            <div class="hist-cardio-title">
              <span>🏃</span>
              <span>Cardio: ${c.name || 'Cardio Activity'}</span>
            </div>
            <div class="hist-cardio-grid">
              ${timeVal ? `<div class="hist-cardio-stat"><span class="hist-cardio-lbl">Time</span><span class="hist-cardio-val">${timeVal}</span></div>` : ''}
              ${distVal ? `<div class="hist-cardio-stat"><span class="hist-cardio-lbl">Distance</span><span class="hist-cardio-val">${distVal}</span></div>` : ''}
              ${speedVal ? `<div class="hist-cardio-stat"><span class="hist-cardio-lbl">Speed</span><span class="hist-cardio-val">${speedVal}</span></div>` : ''}
              ${inclineVal ? `<div class="hist-cardio-stat"><span class="hist-cardio-lbl">Incline</span><span class="hist-cardio-val">${inclineVal}</span></div>` : ''}
              ${calVal ? `<div class="hist-cardio-stat"><span class="hist-cardio-lbl">Calories</span><span class="hist-cardio-val">${calVal}</span></div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      cardioHtml = cardioItemsHtml;
    }

    // Build Workout Metadata Footer
    const timeDetails = [];
    if (hist.startedAt) timeDetails.push(`Started ${formatTime(hist.startedAt)}`);
    if (hist.completedAt) timeDetails.push(`Finished ${formatTime(hist.completedAt)}`);
    if (durationText) timeDetails.push(`Duration: ${durationText}`);

    const card = document.createElement('div');
    card.className = `history-card-mobile ${isExpanded ? 'expanded' : ''}`;
    card.dataset.id = hist.id;

    card.innerHTML = `
      <!-- Card Summary Header (Clickable to toggle) -->
      <div class="hist-card-summary" role="button" tabindex="0" aria-expanded="${isExpanded}" title="Click to view exercises and tracked data">
        <div class="hist-top-row">
          <div class="hist-title-group">
            <h3 class="hist-title">${hist.name || 'Workout Session'}</h3>
            <div class="hist-meta-line">
              <span class="hist-date">${formatLongDate(hist.date)}</span>
              ${durationText ? `<span class="hist-duration-badge">⏱️ ${durationText}</span>` : ''}
            </div>
          </div>
          <button class="hist-expand-btn" type="button" aria-label="Toggle workout details">
            <span class="hist-expand-hint">${isExpanded ? 'Hide' : 'View'}</span>
            <svg class="hist-chevron ${isExpanded ? 'rotated' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>

        <div class="hist-chips-row">
          <span class="hist-chip">${exercises.length} Exercise${exercises.length === 1 ? '' : 's'}</span>
          <span class="hist-chip"> ${completedSetsCount} Set${completedSetsCount === 1 ? '' : 's'}</span>
          <span class="hist-chip chip-highlight">${vol.toLocaleString()} kg</span>
          ${hist.bodyWeight ? `<span class="hist-chip">${hist.bodyWeight} kg BW</span>` : ''}
          ${hasCardio ? `<span class="hist-chip chip-cardio"> Cardio</span>` : ''}
        </div>

        <div class="hist-click-hint">
          <span>${isExpanded ? 'Tap to collapse' : 'Tap to see exercises & tracked data'}</span>
          <span style="font-size: 0.8rem;">${isExpanded ? '▴' : '▾'}</span>
        </div>
      </div>

      <!-- Expandable Detail Body -->
      <div class="hist-details-body" style="display: ${isExpanded ? 'block' : 'none'};">
        <div class="hist-details-heading">
          <span class="hist-details-title">Exercises & Tracked Sets</span>
          <span style="font-size:0.72rem; color:var(--text-dim);">${exercises.length} exercises logged</span>
        </div>

        <div class="hist-exercises-list">
          ${exercisesHtml}
        </div>

        ${cardioHtml}

        <div class="hist-meta-footer">
          <div><strong>Total Volume Lifted:</strong> ${vol.toLocaleString()} kg across ${completedSetsCount} completed sets</div>
          ${timeDetails.length > 0 ? `<div><strong>Time:</strong> ${timeDetails.join(' • ')}</div>` : ''}
          ${hist.bodyWeight ? `<div><strong>Body Weight:</strong> ${hist.bodyWeight} kg</div>` : ''}
        </div>

        <div class="hist-actions-row">
          <button class="btn btn-sm btn-outline-subtle btn-collapse-hist" data-id="${hist.id}" type="button">
            Close Details
          </button>
          <button class="btn btn-sm btn-subtle btn-del-hist" data-id="${hist.id}" type="button" title="Delete workout">
            Delete Workout
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // 3. Event Listeners for Expand/Collapse and Actions
  container.querySelectorAll('.history-card-mobile').forEach(card => {
    const histId = card.dataset.id;
    const summary = card.querySelector('.hist-card-summary');
    const detailsBody = card.querySelector('.hist-details-body');
    const chevron = card.querySelector('.hist-chevron');
    const expandHint = card.querySelector('.hist-expand-hint');
    const clickHint = card.querySelector('.hist-click-hint');

    const toggleCard = (e) => {
      // Don't toggle if clicking on interactive buttons inside
      if (e?.target?.closest('button') && !e.target.closest('.hist-expand-btn')) {
        return;
      }

      const isOpen = expandedWorkoutIds.has(histId);
      if (isOpen) {
        expandedWorkoutIds.delete(histId);
        card.classList.remove('expanded');
        if (detailsBody) detailsBody.style.display = 'none';
        if (chevron) chevron.classList.remove('rotated');
        if (expandHint) expandHint.textContent = 'View';
        if (clickHint) clickHint.innerHTML = `<span>Tap to see exercises & tracked data</span><span style="font-size: 0.8rem;">▾</span>`;
        summary.setAttribute('aria-expanded', 'false');
      } else {
        expandedWorkoutIds.add(histId);
        card.classList.add('expanded');
        if (detailsBody) detailsBody.style.display = 'block';
        if (chevron) chevron.classList.add('rotated');
        if (expandHint) expandHint.textContent = 'Hide';
        if (clickHint) clickHint.innerHTML = `<span>Tap to collapse</span><span style="font-size: 0.8rem;">▴</span>`;
        summary.setAttribute('aria-expanded', 'true');
      }

      // Update toolbar toggle-all button state
      const toggleAllBtn = document.getElementById('btnToggleAllHistory');
      if (toggleAllBtn) {
        const nowAllExpanded = appState.history.every(h => expandedWorkoutIds.has(h.id));
        toggleAllBtn.textContent = nowAllExpanded ? 'Collapse All ▴' : 'Expand All ▾';
      }
    };

    // Click on summary header toggles expand/collapse
    summary.addEventListener('click', toggleCard);

    // Keyboard support (Enter or Space)
    summary.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCard(e);
      }
    });

    // Close Details button inside expanded section
    const btnCollapse = card.querySelector('.btn-collapse-hist');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', (e) => {
        e.stopPropagation();
        expandedWorkoutIds.delete(histId);
        card.classList.remove('expanded');
        if (detailsBody) detailsBody.style.display = 'none';
        if (chevron) chevron.classList.remove('rotated');
        if (expandHint) expandHint.textContent = 'View';
        if (clickHint) clickHint.innerHTML = `<span>Tap to see exercises & tracked data</span><span style="font-size: 0.8rem;">▾</span>`;
        summary.setAttribute('aria-expanded', 'false');
      });
    }

    // Delete workout button handler
    const btnDel = card.querySelector('.btn-del-hist');
    if (btnDel) {
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const confirmed = await showCustomConfirm({
          title: 'Delete Completed Workout?',
          message: 'Are you sure you want to delete this workout from your history? This cannot be undone.',
          okText: 'Delete Workout',
          isDangerous: true
        });
        if (confirmed) {
          expandedWorkoutIds.delete(id);
          await deleteWorkout(id);
          renderHistoryScreen();
          renderHomeScreen();
        }
      });
    }
  });
}

