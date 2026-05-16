// modal-misc.js — бюджеты, плановые доходы, настройки, детализация графика, годовая статистика
// ─────────────────────────────────────────────────────────────
import { S, fmtRub, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, loadAll, bustTx } from './api.js';
import { MONTHS } from './config.js';
import { renderTxList } from './components.js';
import { openModal, closeModal, showToast } from './modal-core.js';

// ─── НАСТРОЙКИ ───────────────────────────────────────────────
export async function saveSettings() {
  const rate = parseFloat(document.getElementById('cfg-usd').value) || 90;
  await POST('/api/settings', { usd_rate: rate });
  S.usdRate = rate;
  closeModal('ov-settings');
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

// ─── БЮДЖЕТЫ ─────────────────────────────────────────────────
export async function openBudgetsModal(year, month) {
  const data   = await GET(`/api/budget-limits?year=${year}&month=${month}`);
  const limits = data.budget_limits || [];
  const limitMap = {};
  limits.forEach(bl => { limitMap[bl.category_id] = bl; });

  document.getElementById('budgets-modal-title').textContent = `Бюджеты — ${MONTHS[month]}`;
  const body = document.getElementById('budgets-modal-body');
  body.innerHTML = `
    <div style="font-size:12px;color:var(--hint);margin-bottom:12px">
      Укажи лимиты трат по категориям на месяц. Оставь пустым — без лимита.
    </div>
    <div class="budget-list">
      ${S.categories.map(c => {
        const bl  = limitMap[c.id];
        const val = bl ? bl.amount : '';
        const pct = bl && bl.spent > 0 ? Math.min(Math.round(bl.spent / bl.amount * 100), 100) : 0;
        const bColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : 'var(--green)';
        return `<div class="budget-row">
          <div class="budget-cat">
            <div class="cat-ico-box" style="background:${c.color}22;width:30px;height:30px;font-size:15px">${c.icon}</div>
            <div>
              <div style="font-size:13px;font-weight:500">${c.name}</div>
              ${bl && bl.spent > 0 ? `<div style="font-size:11px;color:${bColor}">потрачено ${fmtRub(bl.spent)}</div>` : ''}
            </div>
          </div>
          <div class="budget-input-wrap">
            <input type="number" class="finput budget-input" placeholder="∞"
              data-cat-id="${c.id}" value="${val}" inputmode="decimal" style="text-align:right;padding:6px 8px;font-size:14px">
            <span style="font-size:12px;color:var(--hint);margin-left:4px">₽</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  openModal('ov-budgets');
}

export async function saveBudgets() {
  haptic('medium');
  const inputs = document.querySelectorAll('.budget-input');
  const saves  = [];
  inputs.forEach(inp => {
    const catId = parseInt(inp.dataset.catId);
    const amt   = parseFloat(inp.value) || 0;
    saves.push(POST('/api/budget-limits', { category_id: catId, amount: amt }));
  });
  await withLoading('btn-save-budgets', async () => {
    await Promise.all(saves);
    bustTx();
    closeModal('ov-budgets');
    await window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast('✅ Лимиты сохранены');
  });
}

// ─── ПЛАНОВЫЕ ДОХОДЫ ─────────────────────────────────────────
export async function savePlanned() {
  const amt = parseFloat(document.getElementById('p-amount').value) || 0;
  if (!amt) return;
  haptic('medium');
  await withLoading('btn-save-planned', async () => {
    await POST('/api/planned-income', {
      amount: amt,
      description:   document.getElementById('p-desc').value.trim(),
      expected_date: document.getElementById('p-date').value || null,
    });
    ['p-amount', 'p-desc', 'p-date'].forEach(id => { document.getElementById(id).value = ''; });
    closeModal('ov-planned');
    const data = await GET('/api/planned-income');
    S.planned  = data.planned_income || [];
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  });
}

export async function receivePlanned(id) {
  const accId = S.accounts.find(a => a.is_priority && !a.is_reserve)?.id
    || S.accounts.find(a => !a.is_reserve)?.id || S.accounts[0]?.id;
  if (!accId) return alert('Добавьте счёт');
  await PUT(`/api/planned-income/${id}/receive?account_id=${accId}`);
  await loadAll();
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

export async function deletePlanned(id) {
  await DEL(`/api/planned-income/${id}`);
  const data = await GET('/api/planned-income');
  S.planned  = data.planned_income || [];
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

// ─── ДЕТАЛИЗАЦИЯ ГРАФИКА ─────────────────────────────────────
export async function openChartDetail(catId, catName, catIcon, catColor, startDate, endDate) {
  haptic();
  document.getElementById('cd-title').textContent = `${catIcon} ${catName}`;
  document.getElementById('cd-summary').innerHTML = '<div style="color:var(--hint);padding:8px 0">Загружаю...</div>';
  document.getElementById('cd-txlist').innerHTML  = '';
  openModal('ov-chart-detail');

  const data  = await GET(`/api/transactions?category_id=${catId}&start_date=${startDate}&end_date=${endDate}&type=expense&limit=200`);
  const txs   = data.transactions || [];
  const total = txs.reduce((s, t) => s + t.amount, 0);
  const [, m, ] = startDate.split('-');
  const periodText = `${MONTHS[+m]} ${startDate.split('-')[0]}`;

  document.getElementById('cd-summary').innerHTML = `
    <div style="background:${catColor}15;border:1px solid ${catColor}30;border-radius:12px;padding:16px;margin-bottom:16px">
      <div class="cd-total" style="color:${catColor}">${fmtRub(total)}</div>
      <div class="cd-period">${periodText} · ${txs.length} транзакций</div>
    </div>`;
  document.getElementById('cd-txlist').innerHTML = txs.length > 0
    ? renderTxList(txs, true)
    : '<div class="empty"><div class="empty-text">Нет транзакций</div></div>';
}

// ─── ГОДОВАЯ СТАТИСТИКА ──────────────────────────────────────
const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

export async function openYearlyStats(year) {
  year = year || new Date().getFullYear();
  const modal = document.getElementById('ov-yearly-stats');
  const body  = modal.querySelector('.modal-body');
  body.innerHTML = _yearlyShell(year);
  openModal('ov-yearly-stats');
  const data = await GET(`/api/stats/yearly?year=${year}`);
  _yearlyContent(body, data, year);
}

function _yearlyShell(year) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button onclick="window.__yearlyNav(${year - 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">‹</button>
      <span style="font-size:18px;font-weight:700">${year}</span>
      <button onclick="window.__yearlyNav(${year + 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">›</button>
    </div>
    <div style="text-align:center;padding:40px;color:var(--hint);font-size:14px">Загрузка...</div>`;
}

function _yearlyContent(body, d, year) {
  const net = d.total_income - d.total_expenses;
  const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';
  const maxVal = Math.max(...d.monthly.map(m => Math.max(m.income, m.expenses)), 1);
  const chartH = 100, barW = 12, gap = 4, chartW = 12 * (barW * 2 + gap + 4);
  const bars = d.monthly.map((m, i) => {
    const expH = Math.round((m.expenses / maxVal) * chartH);
    const incH = Math.round((m.income  / maxVal) * chartH);
    const x    = i * (barW * 2 + gap + 4);
    return `
      <rect x="${x}" y="${chartH - incH}" width="${barW}" height="${incH}" rx="3" fill="var(--green)" opacity=".75"/>
      <rect x="${x + barW + 2}" y="${chartH - expH}" width="${barW}" height="${expH}" rx="3" fill="var(--red)" opacity=".75"/>
      <text x="${x + barW}" y="${chartH + 12}" text-anchor="middle" font-size="7" fill="var(--hint)">${MONTH_SHORT[i]}</text>
    `;
  }).join('');
  const totalExp = d.total_expenses || 1;
  const catRows = (d.by_category || []).slice(0, 8).map(c => {
    const pct = Math.round((c.total / totalExp) * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--divider)">
        <span style="font-size:20px;flex-shrink:0">${c.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;margin-bottom:4px">
            <span>${c.name}</span><span style="color:var(--hint)">${pct}%</span>
          </div>
          <div style="height:4px;background:var(--card-b);border-radius:2px">
            <div style="height:4px;width:${Math.min(100,pct)}%;background:${c.color || 'var(--accent)'};border-radius:2px"></div>
          </div>
        </div>
        <span style="font-size:13px;font-weight:700;flex-shrink:0;min-width:72px;text-align:right">${fmtRub(c.total)}</span>
      </div>`;
  }).join('');
  const bestName  = d.best_month  ? MONTH_SHORT[d.best_month.month - 1]  : '—';
  const worstName = d.worst_month ? MONTH_SHORT[d.worst_month.month - 1] : '—';
  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button onclick="window.__yearlyNav(${year - 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">‹</button>
      <span style="font-size:18px;font-weight:700">${year}</span>
      <button onclick="window.__yearlyNav(${year + 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">›</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div class="card" style="padding:12px"><div class="card-title" style="font-size:10px">Расходы за год</div><div style="font-size:18px;font-weight:700;color:var(--red)">${fmtRub(d.total_expenses)}</div></div>
      <div class="card" style="padding:12px"><div class="card-title" style="font-size:10px">Доходы за год</div><div style="font-size:18px;font-weight:700;color:var(--green)">${fmtRub(d.total_income)}</div></div>
      <div class="card" style="padding:12px"><div class="card-title" style="font-size:10px">Баланс года</div><div style="font-size:18px;font-weight:700;color:${netColor}">${net >= 0 ? '+' : ''}${fmtRub(net)}</div></div>
      <div class="card" style="padding:12px"><div class="card-title" style="font-size:10px">Средние траты/мес</div><div style="font-size:18px;font-weight:700">${fmtRub(d.avg_monthly_expense)}</div><div style="font-size:10px;color:var(--hint);margin-top:2px">${d.active_months} мес. с данными</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="card" style="padding:10px;border-color:rgba(16,185,129,.3)"><div style="font-size:10px;color:var(--hint);margin-bottom:2px">💚 Лучший месяц</div><div style="font-size:14px;font-weight:700">${bestName}</div>${d.best_month ? `<div style="font-size:11px;color:var(--green)">+${fmtRub(d.best_month.income - d.best_month.expenses)}</div>` : ''}</div>
      <div class="card" style="padding:10px;border-color:rgba(239,68,68,.3)"><div style="font-size:10px;color:var(--hint);margin-bottom:2px">🔥 Самый дорогой</div><div style="font-size:14px;font-weight:700">${worstName}</div>${d.worst_month ? `<div style="font-size:11px;color:var(--red)">${fmtRub(d.worst_month.expenses)}</div>` : ''}</div>
    </div>
    <div class="sec-hdr" style="margin-bottom:8px"><span class="sec-title">Доходы vs Расходы по месяцам</span></div>
    <div class="card" style="padding:12px;margin-bottom:16px">
      <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;color:var(--hint)">
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;opacity:.75;margin-right:4px"></span>Доходы</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--red);border-radius:2px;opacity:.75;margin-right:4px"></span>Расходы</span>
      </div>
      <svg viewBox="0 0 ${chartW} ${chartH + 16}" width="100%" xmlns="http://www.w3.org/2000/svg">${bars}</svg>
    </div>
    ${catRows ? `<div class="sec-hdr" style="margin-bottom:4px"><span class="sec-title">Топ категорий</span></div><div class="card" style="padding:0 12px">${catRows}</div><div style="text-align:center;padding:12px 0;font-size:12px;color:var(--hint)">${d.tx_count} транзакций за год</div>`
    : '<div class="empty"><div class="empty-ico">📊</div><div class="empty-text">Нет данных за этот год</div></div>'}
  `;
}

window.__yearlyNav = async (year) => {
  const modal = document.getElementById('ov-yearly-stats');
  const body  = modal.querySelector('.modal-body');
  body.innerHTML = _yearlyShell(year);
  const data = await GET(`/api/stats/yearly?year=${year}`);
  _yearlyContent(body, data, year);
};
