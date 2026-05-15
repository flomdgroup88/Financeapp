import { S } from './state.js';
import { fmtRub } from './state.js';
import { haptic } from './api.js';

// ─── SMART CHART UPDATE ──────────────────────────────────────
// Update existing chart data instead of destroy+recreate (much faster)
function updateOrCreate(canvas, config) {
  if (canvas._chart) {
    try {
      const c = canvas._chart;
      const newDs = config.data.datasets[0];
      c.data.labels   = config.data.labels;
      c.data.datasets[0].data            = newDs.data;
      c.data.datasets[0].backgroundColor = newDs.backgroundColor;
      c.update('none');   // 'none' = no animation on update = instant
      return;
    } catch (_) {
      canvas._chart.destroy();
    }
  }
  canvas._chart = new Chart(canvas.getContext('2d'), config);
}

export function initBarChart(id, labels, data) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  updateOrCreate(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(99,102,241,.7)',
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => fmtRub(c.raw) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: { display: false },
      },
    },
  });
}

export function initDonutChart(id, labels, data, colors) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  updateOrCreate(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtRub(c.raw)}` } },
      },
    },
  });
}

export function initDonutChartClickable(id, labels, data, colors, catIds, startDate, endDate, onClickCat) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const catObjects = catIds.map(cid =>
    S.categories.find(c => c.id === cid) || { id: cid, name: 'Прочее', icon: '📦', color: '#6366f1' }
  );
  // Always recreate clickable charts to re-bind onClick closure
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
  canvas._chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtRub(c.raw)}` } },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        haptic();
        const cat = catObjects[elements[0].index];
        if (cat && onClickCat) onClickCat(cat, labels[elements[0].index], colors[elements[0].index], startDate, endDate);
      },
    },
  });
}
