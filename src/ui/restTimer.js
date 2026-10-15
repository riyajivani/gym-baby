/**
 * Rest Interval Timer
 * Supports preset intervals (60s, 90s, 2m, 3m), manual start/pause/reset, and audio chime.
 */

import { playBeep } from '../utils/audio.js';

let timerInterval = null;
let timerSeconds = 90;
let timerRemaining = 90;
let timerRunning = false;

export function initRestTimer() {
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

export function startRestIntervalTimer() {
  timerRemaining = timerSeconds;
  updateTimerClockDisplay();
  startRestTimerCountdown();
}

export function startRestTimerCountdown() {
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

export function pauseRestTimer() {
  timerRunning = false;
  const toggleBtn = document.getElementById('btnToggleTimer');
  if (toggleBtn) toggleBtn.textContent = 'Start Rest';
  if (timerInterval) clearInterval(timerInterval);
}

export function resetRestTimer() {
  pauseRestTimer();
  timerRemaining = timerSeconds;
  updateTimerClockDisplay();
}

export function updateTimerClockDisplay() {
  const m = Math.floor(timerRemaining / 60).toString().padStart(2, '0');
  const s = (timerRemaining % 60).toString().padStart(2, '0');
  const str = `${m}:${s}`;
  const clock = document.getElementById('timerClock');
  const quick = document.getElementById('quickTimerText');
  if (clock) clock.textContent = str;
  if (quick) quick.textContent = str;
}
