import { S, fmtRub } from './state.js';
import { GETC, haptic } from './api.js';
import { MONTHS } from './config.js';
import { initDonutChartClickable } from './charts.js';
import { renderCatRowClickable, renderTxList } from './components.js';
import { openIncomeModal, openCatModal, openChartDetail, openBudgetsModal, skCard, skSection } from './tabs.js';

// ─── EXPENSES ───────────────────────────────────────────────
export async function renderExpenses() {
  const el   = document.getElementById('exp-content');
  const m2   = String(S.expMonth).padStart(2, '0');
  const lastDay   = new Date(S.expYear, S.expMonth, 0).getDate();
  const startDate = `${S.expYear}-${m2}-01`, endDate = `${S.expYear}-${m2}-${lastDay}`;

  const mKey  = `/api/stats/monthly?year=${S.expYear}&month=${S.expMonth}`;
  const txKey = `/api/transactions?type=expense&start_date=${startDate}&end_date=${endDate}&limit=200`;
  const blKey = `/api/budget-limits?year=${S.expYear}&month=${S.expMonth}`;

  if (!el._hasData) el.innerHTML = `<div class="month-nav" style="margin-bottom:12px">
    <button id="exp-prev">‹</button>
    <div class="month-label">${MONTHS[S.expMonth]} ${S.expYear}</div>
    <button id="exp-next">›</button>
  </div>${skCard(2)}${skSection(3)}`;

  const [monthly, txData, budgetData] = await Promise.all([
    GETC(mKey,  () => renderExpenses(), 'renderExpenses'),
    GETC(txKey, () => renderExpenses(), 'renderExpenses'),
    GETC(blKey, () => renderExpenses(), 'renderExpenses'),
  ]);
  el._hasData = true;

  const cats  = monthly.by_category || [];
  const total = monthly.total_expenses || 0;
  const txs   = txData.transactions || [];
  const limits = budgetData.budget_limits || [];
  const budgetMap = {};
  limits.forEach(bl => { budgetMap[bl.category_id] = bl; });
  const warnings = limits.filter(bl => bl.spent >= bl.amount * 0.8);

  el.innerHTML = `
    <div class="month-nav">
      <button id="exp-prev">‹</button>
      <div class="month-label">${MONTHS[S.expMonth]} ${S.expYear}</div>
      <button id="exp-next">›</button>
    </div>

    ${warnings.length > 0 ? `
    <div class="card card--accent-red" style="margin-bottom:10px;padding:12px 14px">
      <div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:6px">⚠️ Бюджет почти исчерпан</div>
      ${warnings.map(bl => {
        const pct = Math.round(bl.spent / bl.amount * 100);
        const color = pct >= 100 ? '#ef4444' : '#f59e0b';
        return `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span>${bl.category_icon} ${bl.category_name}</span>
          <span style="color:${color};font-weight:600">${fmtRub(bl.spent)} / ${fmtRub(bl.amount)} (${pct}%)</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="card" style="padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="card-title">Всего трат</div>
          <div class="card-value">${fmtRub(total)}</div>
          <div class="card-sub">${txs.length} транзакций</div>
        </div>
        ${cats.length > 0 ? `
        <div class="donut-wrap clickable" style="width:100px;height:100px" id="exp-donut-wrap">
          <canvas id="chart-exp-donut"></canvas>
          <div class="donut-center"><span class="lbl" style="font-size:9px">нажми</span></div>
        </div>` : ''}
      </div>
    </div>

    ${cats.length > 0 ? `
    <div class="sec-hdr">
      <span class="sec-title">По категориям</span>
      <button class="sec-btn" id="btn-manage-budgets">🎯 Бюджеты</button>
    </div>
    <div class="cat-list">
      ${cats.map(c => renderCatRowClickable(c, total, startDate, endDate, budgetMap)).join('')}
    </div>
    ` : `<div class="empty"><div class="empty-ico">💸</div><div class="empty-text">В этом месяце нет трат</div></div>`}

    <div class="sec-hdr">
      <span class="sec-title">Транзакции</span>
      <button class="sec-btn" id="btn-add-income-exp">+ Доход</button>
    </div>
    ${txs.length > 0 ? renderTxList(txs) : `<div class="txt-center-hint">Нет трат за этот месяц</div>`}

    <div class="sec-hdr">
      <span class="sec-title">Категории</span>
      <button class="sec-btn" id="btn-add-cat">+ Добавить</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${S.categories.map(c => `
        <div data-action="open-cat" data-id="${c.id}"
          class="cat-chip" style="background:${c.color}22;border:1px solid ${c.color}44">
          <span>${c.icon}</span><span>${c.name}</span>
        </div>`).join('')}
    </div>
  `;

  if (cats.length > 0)
    initDonutChartClickable('chart-exp-donut', cats.map(c => c.name || 'Прочее'), cats.map(c => c.total),
      cats.map(c => c.color || '#6366f1'), cats.map(c => c.id), startDate, endDate,
      (cat, label, color) => openChartDetail(cat.id, label, cat.icon, color, startDate, endDate));

  document.getElementById('exp-prev').onclick = () => {
    haptic();
    if (S.expMonth === 1) { S.expMonth = 12; S.expYear--; } else S.expMonth--;
    document.getElementById('exp-content')._hasData = false;
    renderExpenses();
  };
  document.getElementById('exp-next').onclick = () => {
    haptic();
    if (S.expMonth === 12) { S.expMonth = 1; S.expYear++; } else S.expMonth++;
    document.getElementById('exp-content')._hasData = false;
    renderExpenses();
  };
  document.getElementById('btn-add-income-exp').onclick = () => openIncomeModal();
  document.getElementById('btn-add-cat').onclick = () => openCatModal();
  const budgetBtn = document.getElementById('btn-manage-budgets');
  if (budgetBtn) budgetBtn.onclick = () => openBudgetsModal(S.expYear, S.expMonth);
}
