/**
 * Progress & Analytics Screen View
 * Interactive 1RM calculator, Chart.js volume distribution chart, and exercise performance breakdown.
 */

import Chart from 'chart.js/auto';
import { appState } from '../state.js';
import { autoDetectCategory } from '../parser.js';

export function initProgressScreen() {
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

export function renderProgressScreen() {
  const categories = { Chest: 0, Back: 0, Shoulders: 0, Arms: 0, Legs: 0, Core: 0 };
  const currentExList = appState.activeSession?.exercises || (appState.history[0]?.exercises) || [];

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
    if (appState.muscleChartInstance) {
      appState.muscleChartInstance.destroy();
    }

    appState.muscleChartInstance = new Chart(ctx, {
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
