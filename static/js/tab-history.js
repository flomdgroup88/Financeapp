import { S, fmtRub } from './state.js';
import { GET, haptic } from './api.js';
import { renderCatRowClickable, renderTxList } from './components.js';

// ─── HISTORY ────────────────────────────────────────────────
export function renderHistory() {
  const el  = document.getElementById('hist-content');
  const now = new Date();
  if (!S.histStart) S.histStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (!S.histEnd)   S.histEnd   = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
    <div class="sec-hdr"><span class="sec-title">Выберите период</span></div>
    <div class="date-range">
      <input type="date" id="hist-start" class="finput" value="${S.histStart}">
      <span>—</span>
      <input type="date" id="hist-end" class="finput" value="${S.histEnd}">
      <button class="btn btn-secondary btn-sm" id="btn-hist-load">OK</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${[['Этот месяц', 0], ['Прошлый', 1], ['3 мес', 3], ['Год', 12]].map(([l, b]) =>
        `<button class="btn btn-secondary btn-sm" data-action="hist-preset" data-months="${b}">${l}</button>`).join('')}
    </div>
    <div style="position:relative;margin-bottom:8px">
      <input type="search" id="hist-search" class="finput" placeholder="🔍 Поиск по описанию..."
        value="${S.histSearch || ''}" style="padding-left:12px">
    </div>
    <div class="sort-bar" id="hist-sort-bar">
      <span class="sort-label">Сортировка:</span>
      ${[['date','📅 Дата'],['amount','💰 Сумма'],['type','🔀 Тип']].map(([key, label]) => `
        <button class="btn btn-secondary btn-sm hist-sort-btn ${S.histSortBy === key ? 'active' : ''}" data-sort="${key}"
          style="display:flex;align-items:center;gap:3px">
          ${label}
          <span class="sort-arrow" style="display:${S.histSortBy === key ? 'inline' : 'none'}">
            ${S.histSortDir === 'asc' ? '↑' : '↓'}
          </span>
        </button>`).join('')}
    </div>
    <div id="hist-result">
      <div class="hist-loading">Выберите период и нажмите OK</div>
    </div>
  `;

  document.getElementById('hist-start').onchange = e => { S.histStart = e.target.value; };
  document.getElementById('hist-end').onchange   = e => { S.histEnd   = e.target.value; };
  document.getElementById('btn-hist-load').onclick = () => { S.histOffset = 0; loadHistoryData(); };

  let searchTimer;
  document.getElementById('hist-search').addEventListener('input', e => {
    S.histSearch = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { S.histOffset = 0; loadHistoryData(); }, 350);
  });

  document.querySelectorAll('.hist-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic('light');
      const key = btn.dataset.sort;
      if (S.histSortBy === key) {
        S.histSortDir = S.histSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        S.histSortBy  = key;
        S.histSortDir = 'desc';
      }
      document.querySelectorAll('.hist-sort-btn').forEach(b => {
        const isActive = b.dataset.sort === S.histSortBy;
        b.classList.toggle('active', isActive);
        b.querySelector('.sort-arrow').style.display = isActive ? 'inline' : 'none';
        if (isActive) b.querySelector('.sort-arrow').textContent = S.histSortDir === 'asc' ? '↑' : '↓';
      });
      S.histOffset = 0;
      loadHistoryData();
    });
  });
}

export function setHistPreset(monthsBack) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let startDt;
  if (monthsBack === 0) startDt = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (monthsBack === 1) { startDt = new Date(now.getFullYear(), now.getMonth() - 1, 1); end.setTime(new Date(now.getFullYear(), now.getMonth(), 0).getTime()); }
  else startDt = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  S.histStart = startDt.toISOString().slice(0, 10);
  S.histEnd   = end.toISOString().slice(0, 10);
  const hs = document.getElementById('hist-start'), he = document.getElementById('hist-end');
  if (hs) hs.value = S.histStart;
  if (he) he.value = S.histEnd;
  S.histOffset = 0;
  loadHistoryData();
}

export async function loadHistoryData() {
  haptic();
  if (!S.histOffset) S.histOffset = 0;
  const LIMIT = 50;
  const res = document.getElementById('hist-result');
  if (S.histOffset === 0) {
    res.innerHTML = '<div class="hist-loading">Загрузка...</div>';
  }

  let url = `/api/transactions?start_date=${S.histStart}&end_date=${S.histEnd}&limit=${LIMIT}&offset=${S.histOffset}&sort_by=${S.histSortBy}&sort_dir=${S.histSortDir}`;
  if (S.histSearch && S.histSearch.trim()) url += `&search=${encodeURIComponent(S.histSearch.trim())}`;

  const data   = await GET(url);
  const newTxs = data.transactions || [];
  const stats  = data.stats || {};

  if (S.histOffset === 0) S.histTxs = [];
  S.histTxs = (S.histTxs || []).concat(newTxs);

  if (S.histOffset === 0 && newTxs.length === 0) {
    res.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-text">Нет транзакций за период</div></div>';
    return;
  }

  const totExp  = stats.total_expense || 0;
  const totInc  = stats.total_income  || 0;
  const totCount = stats.total_count  || 0;
  const topCats = stats.top_categories || [];

  const hasMore     = newTxs.length === LIMIT;
  const loadedCount = S.histTxs.length;
  const loadMoreBtn = hasMore
    ? `<button class="btn btn-secondary" id="btn-hist-more" style="margin:12px auto;display:block">Загрузить ещё (показано ${loadedCount} из ${totCount})</button>`
    : '';

  res.innerHTML = `
    <div class="grid2" style="margin-bottom:10px">
      <div class="card"><div class="card-title">Траты</div><div class="hist-stat-val--red">${fmtRub(totExp)}</div></div>
      <div class="card"><div class="card-title">Доходы</div><div class="hist-stat-val--green">${fmtRub(totInc)}</div></div>
    </div>
    ${topCats.length > 0 && !S.histSearch ? `
    <div class="sec-hdr"><span class="sec-title">Топ категорий</span></div>
    <div class="cat-list" style="margin-bottom:10px">
      ${topCats.map(c => renderCatRowClickable(c, totExp, S.histStart, S.histEnd)).join('')}
    </div>` : ''}
    <div class="sec-hdr">
      <span class="sec-title">${totCount} транзакций${loadedCount < totCount ? ` · показано ${loadedCount}` : ''}</span>
    </div>
    ${renderTxList(S.histTxs)}
    ${loadMoreBtn}
  `;

  if (hasMore) {
    document.getElementById('btn-hist-more').onclick = () => {
      S.histOffset = (S.histOffset || 0) + LIMIT;
      loadHistoryData();
    };
  }
}
