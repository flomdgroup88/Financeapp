import { S } from './state.js';
import { fmtRub } from './state.js';
import { haptic } from './api.js';

export function initBarChart(id, labels, data) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: 'rgba(99,102,241,.7)', borderRadius: 4, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtRub(c.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { display: false } },
    },
  });
}

export function initDonutChart(id, labels, data, colors) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtRub(c.raw)}` } } },
    },
  });
}

export function initDonutChartClickable(id, labels, data, colors, catIds, startDate, endDate, onClickCat) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (canvas._chart) canvas._chart.destroy();
  const catObjects = catIds.map(cid => S.categories.find(c => c.id === cid) || { id: cid, name: 'Прочее', icon: '📦', color: '#6366f1' });
  canvas._chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtRub(c.raw)}` } } },
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          haptic();
          const idx = elements[0].index;
          const cat = catObjects[idx];
          if (cat && onClickCat) onClickCat(cat, labels[idx], colors[idx], startDate, endDate);
        }
      },
    },
  });
}
