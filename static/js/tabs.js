import { S, fmt, fmtRub, toRub, fmtDate, daysUntil, activeBalance, totalBalance, hasReserve } from './state.js';
import { GET, GETC, haptic } from './api.js';
import { MONTHS } from './config.js';
import { initBarChart, initDonutChart, initDonutChartClickable } from './charts.js';
import { renderTxList, renderCatRow, renderCatRowClickable, renderAccCard, renderCmpRow, renderSubCard } from './components.js';

// forward declaration — set by app.js after import
export let openAccModal, openSubModal, openCatModal, openIncomeModal, openTransferModal,
           openChartDetail, openBudgetsModal;
export function setModalOpeners(m) {
  ({ openAccModal, openSubModal, openCatModal, openIncomeModal,
     openTransferModal, openChartDetail, openBudgetsModal } = m);
}


// ─── SKELETON HELPERS ────────────────────────────────────────
const sk = (h = 18, w = '100%', r = 8) =>
  `<div class="sk" style="height:${h}px;width:${w};border-radius:${r}px"></div>`;
const skCard = (rows = 2) => `<div class="card" style="display:flex;flex-direction:column;gap:10px;padding:16px">
  ${sk(26, '55%', 6)}${Array(rows - 1).fill(sk(14, '80%')).join('')}</div>`;
const skSection = (n = 3) => Array(n).fill(skCard()).join('');

// ─── DASHBOARD ──────────────────────────────────────────────
export async function renderDashboard() {
  const el = document.getElementById('dash-content');

  // Show skeleton if no cached data yet
  const dashKey  = `/api/stats/monthly?year=${S.expYear}&month=${S.expMonth}`;
  const cmpKey   = '/api/stats/comparison';

  if (!el._hasData) el.innerHTML = `${skCard(3)}${skSection(4)}`;

  const [monthly, comparison] = await Promise.all([
    GETC(dashKey,  () => renderDashboard()),
    GETC(cmpKey,   () => renderDashboard()),
  ]);
  el._hasData = true;
  const active = activeBalance(), total = totalBalance(), reserve = hasReserve();
  const exp = monthly.total_expenses || 0, inc = monthly.total_income || 0, net = inc - exp;
  const subMonthly = S.subscriptions.filter(s => s.is_active).reduce((s, x) =>
    s + (x.period === 'monthly' ? toRub(x.amount, x.currency) : toRub(x.amount, x.currency) / 12), 0);
  const cmpPct  = comparison.change_pct || 0;
  const cmpChip = cmpPct > 0 ? `<span class="chip up">▲ ${cmpPct}%</span>`
    : cmpPct < 0 ? `<span class="chip down">▼ ${Math.abs(cmpPct)}%</span>`
    : `<span class="chip neu">~</span>`;
  const plannedSum = S.planned.reduce((s, p) => s + p.amount, 0);
  const days       = monthly.daily || [];
  const prio       = S.accounts.find(a => a.is_priority);
  const insights   = buildInsights(comparison, exp, inc, subMonthly, S.subscriptions);

  const balCard = reserve ? `
    <div class="card" style="background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.15));border-color:rgba(99,102,241,.3)">
      <div class="card-title">Активный баланс</div>
      <div class="card-value lg">${fmtRub(active)}</div>
      <div style="font-size:11px;color:var(--hint);margin-top:4px">Всего с резервом: ${fmtRub(total)}</div>
      ${prio ? `<div class="card-sub" style="margin-top:4px">⭐ Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
      <div class="card-sub" style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">
        <span style="color:var(--green)">↑ ${fmtRub(inc)}</span>
        <span style="color:var(--red)">↓ ${fmtRub(exp)}</span>
        <span style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">= ${net >= 0 ? '+' : ''}${fmtRub(net)}</span>
        <span style="color:var(--hint)">${MONTHS[S.expMonth]}</span>
      </div>
    </div>` : `
    <div class="card" style="background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.15));border-color:rgba(99,102,241,.3)">
      <div class="card-title">Общий баланс</div>
      <div class="card-value lg">${fmtRub(total)}</div>
      ${prio ? `<div class="card-sub" style="margin-top:4px">⭐ Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
      <div class="card-sub" style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">
        <span style="color:var(--green)">↑ ${fmtRub(inc)}</span>
        <span style="color:var(--red)">↓ ${fmtRub(exp)}</span>
        <span style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">= ${net >= 0 ? '+' : ''}${fmtRub(net)}</span>
        <span style="color:var(--hint)">${MONTHS[S.expMonth]}</span>
      </div>
    </div>`;

  el.innerHTML = `
    ${balCard}
    <div class="grid3">
      <div class="card" style="padding:12px 10px">
        <div class="card-title" style="font-size:10px">Траты</div>
        <div style="font-size:17px;font-weight:700;color:var(--red)">${fmtRub(exp)}</div>
        <div style="margin-top:4px">${cmpChip}</div>
      </div>
      <div class="card" style="padding:12px 10px">
        <div class="card-title" style="font-size:10px">Доходы</div>
        <div style="font-size:17px;font-weight:700;color:var(--green)">${fmtRub(inc)}</div>
      </div>
      <div class="card" style="padding:12px 10px">
        <div class="card-title" style="font-size:10px">Подписки/мес</div>
        <div style="font-size:17px;font-weight:700">${fmtRub(subMonthly)}</div>
        <div class="card-sub">${S.subscriptions.filter(s => s.is_active).length} шт</div>
      </div>
    </div>

    ${plannedSum > 0 ? `
    <div class="card" style="border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.07)">
      <div class="card-row">
        <div>
          <div class="card-title" style="color:#10b981">Ожидаемые поступления</div>
          <div class="card-value" style="font-size:20px;color:#10b981">${fmtRub(plannedSum)}</div>
        </div>
        <span style="font-size:28px">💚</span>
      </div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
        ${S.planned.slice(0, 3).map(p => `
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span style="color:var(--hint)">${p.description || 'Поступление'}${p.expected_date ? ' · ' + fmtDate(p.expected_date) : ''}</span>
            <span style="font-weight:600;color:#10b981">${fmtRub(p.amount)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${insights.length > 0 ? `
    <div class="sec-hdr"><span class="sec-title">Инсайты</span></div>
    ${insights.map(i => `<div class="insight" style="background:${i.bg}">
      <span class="insight-ico">${i.ico}</span>
      <div class="insight-text">${i.text}</div>
    </div>`).join('')}` : ''}

    <div class="sec-hdr"><span class="sec-title">Расходы по дням — ${MONTHS[S.expMonth]}</span></div>
    <div class="card" style="padding:12px"><div class="chart-wrap sm"><canvas id="chart-daily"></canvas></div></div>

    <div class="sec-hdr"><span class="sec-title">Сравнение с прошлым месяцем</span></div>
    <div class="card">
      <div class="card-row" style="margin-bottom:12px">
        <div>
          <div class="card-title">Этот месяц</div>
          <div style="font-size:18px;font-weight:700">${fmtRub(comparison.current?.total || 0)}</div>
        </div>
        <div>${cmpChip}</div>
        <div style="text-align:right">
          <div class="card-title">Прошлый</div>
          <div style="font-size:18px;font-weight:700">${fmtRub(comparison.previous?.total || 0)}</div>
        </div>
      </div>
      ${(comparison.comparison || []).slice(0, 7).map(renderCmpRow).join('')}
    </div>

    ${(monthly.by_category || []).length > 0 ? `
    <div class="sec-hdr"><span class="sec-title">Топ категорий</span></div>
    <div class="cat-list">
      ${(monthly.by_category || []).slice(0, 5).map(c => renderCatRow(c, exp)).join('')}
    </div>` : ''}

    ${checkUpcomingSubs().length > 0 ? `
    <div class="sec-hdr"><span class="sec-title">Скоро списания</span></div>
    ${checkUpcomingSubs().map(s => `
      <div class="card card-row" style="margin-bottom:8px;border-color:rgba(239,68,68,.25)">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:10px;background:${s.color}22;display:flex;align-items:center;justify-content:center;font-size:20px">${s.icon}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${s.name}</div>
            <div style="font-size:12px;color:var(--hint)">${fmtDate(s.next_date)}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">${s.currency === 'USD' ? '$' + fmt(s.amount, 2) : fmtRub(s.amount)}</div>
          <span class="sub-days soon">через ${daysUntil(s.next_date)} д.</span>
        </div>
      </div>`).join('')}` : ''}
  `;

  if (days.length > 0) initBarChart('chart-daily', days.map(d => d.date.slice(8)), days.map(d => d.total));

  // Animate the main balance number
  const balEl = el.querySelector('.card-value.lg');
  if (balEl && window.__animateCount) {
    const target = reserve ? active : total;
    window.__animateCount(balEl, 0, target);
  }
}

function buildInsights(cmp, exp, inc, subMonthly, subs) {
  const insights = [], prev = cmp.previous?.total || 0, curr = cmp.current?.total || 0;
  if (prev > 0 && curr > prev * 1.2)
    insights.push({ ico: '⚠️', bg: 'rgba(239,68,68,.08)', text: `<strong>Расходы выросли на ${cmp.change_pct}%</strong> по сравнению с прошлым месяцем` });
  if (prev > 0 && curr < prev * 0.8)
    insights.push({ ico: '🎉', bg: 'rgba(16,185,129,.08)', text: `<strong>Отлично!</strong> Расходы снизились на ${Math.abs(cmp.change_pct)}% по сравнению с прошлым месяцем` });
  if (inc > 0 && exp > inc * 0.9)
    insights.push({ ico: '📉', bg: 'rgba(245,158,11,.08)', text: `Расходы составляют <strong>${Math.round(exp / inc * 100)}% от доходов</strong>. Стоит контролировать траты` });
  const topCat = (cmp.comparison || []).find(c => c.change_pct > 50 && c.curr_amount > 500);
  if (topCat)
    insights.push({ ico: topCat.icon, bg: 'rgba(139,92,246,.08)', text: `<strong>${topCat.name}</strong> выросли на ${topCat.change_pct}% по сравнению с прошлым месяцем` });
  const soonSubs = subs.filter(s => s.is_active && daysUntil(s.next_date) !== null && daysUntil(s.next_date) >= 0 && daysUntil(s.next_date) <= 3);
  if (soonSubs.length > 0)
    insights.push({ ico: '📋', bg: 'rgba(99,102,241,.08)', text: `<strong>${soonSubs.length} подписк${soonSubs.length === 1 ? 'а' : 'и'}</strong> списывается в ближайшие 3 дня` });
  return insights.slice(0, 3);
}

function checkUpcomingSubs() {
  return S.subscriptions.filter(s => {
    if (!s.is_active || !s.next_date) return false;
    const d = daysUntil(s.next_date);
    return d !== null && d >= 0 && d <= 5;
  }).sort((a, b) => (a.next_date || '').localeCompare(b.next_date || ''));
}

// ─── BALANCE ────────────────────────────────────────────────
export async function renderBalance() {
  const el = document.getElementById('bal-content');
  const active = activeBalance(), total = totalBalance();
  const rsrvAccs = S.accounts.filter(a => a.is_reserve);
  const actAccs  = S.accounts.filter(a => !a.is_reserve);
  const prio     = S.accounts.find(a => a.is_priority);
  const donutAccs = actAccs.length > 1 ? actAccs : [];

  el.innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(6,182,212,.1));border-color:rgba(16,185,129,.3)">
      <div class="card-title">Активный баланс</div>
      <div class="card-value lg">${fmtRub(active)}</div>
      ${rsrvAccs.length > 0 ? `<div style="font-size:11px;color:var(--hint);margin-top:5px">Всего с резервом: ${fmtRub(total)}</div>` : ''}
      ${prio ? `<div class="card-sub" style="margin-top:6px">Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
    </div>

    ${donutAccs.length > 0 ? `
    <div class="card" style="padding:14px">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="donut-wrap"><canvas id="chart-bal-donut"></canvas>
          <div class="donut-center"><span class="amt">${actAccs.length}</span><span class="lbl">счетов</span></div>
        </div>
        <div style="flex:1;min-width:0">
          ${actAccs.map(a => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">
              <span style="font-size:14px">${a.icon}</span>
              <div style="flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name}</div>
              <span style="font-size:13px;font-weight:600;white-space:nowrap">
                ${a.currency === 'USD' ? '$' + fmt(a.balance, 2) : fmtRub(a.balance)}
              </span>
            </div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="sec-hdr">
      <span class="sec-title">Счета</span>
      <div style="display:flex;gap:8px">
        <button class="sec-btn" id="btn-open-transfer" style="color:var(--link)">⇄ Перевод</button>
        <button class="sec-btn" id="btn-add-account">+ Добавить</button>
      </div>
    </div>
    <div class="acc-list">${actAccs.map((a, i) => renderAccCard(a, active, i, actAccs.length)).join('')}</div>

    ${rsrvAccs.length > 0 ? `
    <div class="sec-hdr">
      <span class="sec-title" style="color:var(--hint)">Резервные счета</span>
      <span style="font-size:12px;color:var(--hint)">${fmtRub(rsrvAccs.reduce((s, a) => s + toRub(a.balance, a.currency), 0))}</span>
    </div>
    <div class="acc-list">${rsrvAccs.map((a, i) => renderAccCard(a, total, i, rsrvAccs.length, true)).join('')}</div>` : ''}

    <div class="sec-hdr">
      <span class="sec-title">🎯 Цели накопления</span>
      <button class="sec-btn" id="btn-add-goal">+ Добавить</button>
    </div>
    ${S.goals.length === 0
      ? `<div class="card"><div style="text-align:center;color:var(--hint);padding:12px;font-size:13px">Нет целей. Начни копить на мечту!</div></div>`
      : S.goals.map(g => {
          const pct = g.target_amount > 0 ? Math.min(Math.round(g.saved_amount / g.target_amount * 100), 100) : 0;
          const remaining = Math.max(g.target_amount - g.saved_amount, 0);
          const barColor = pct >= 100 ? 'var(--green)' : g.color;
          const daysLeft = g.deadline ? daysUntil(g.deadline) : null;
          return `<div class="card" style="margin-bottom:8px;cursor:pointer" data-action="open-goal" data-id="${g.id}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="width:42px;height:42px;border-radius:12px;background:${g.color}22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${g.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</div>
                <div style="font-size:11px;color:var(--hint);margin-top:2px">${g.description || ''}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:13px;font-weight:700;color:${barColor}">${fmtRub(g.saved_amount)}</div>
                <div style="font-size:11px;color:var(--hint)">из ${fmtRub(g.target_amount)}</div>
              </div>
            </div>
            <div style="height:8px;background:var(--divider);border-radius:4px;overflow:hidden;margin-bottom:6px">
              <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .5s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint)">
              <span>${pct}%${daysLeft !== null ? ` · ${daysLeft >= 0 ? daysLeft + ' дн' : 'просрочено'}` : ''}</span>
              ${pct < 100 ? `<span>осталось ${fmtRub(remaining)}</span>` : `<span style="color:var(--green);font-weight:600">✅ Цель достигнута!</span>`}
            </div>
            ${pct < 100 ? `<div style="margin-top:10px;display:flex;gap:6px">
              <button class="btn btn-success btn-sm" data-action="deposit-goal" data-id="${g.id}" style="flex:1">💰 Пополнить</button>
              <button class="btn btn-secondary btn-sm" data-action="open-goal" data-id="${g.id}">✎</button>
            </div>` : ''}
          </div>`;
        }).join('')}

    <div class="sec-hdr">
      <span class="sec-title">Планируемые поступления</span>
      <button class="sec-btn" id="btn-add-planned">+ Добавить</button>
    </div>
    ${S.planned.length === 0
      ? `<div class="card"><div style="text-align:center;color:var(--hint);padding:12px;font-size:13px">Нет планируемых поступлений</div></div>`
      : S.planned.map(p => `
        <div class="card card-row" style="margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:600">${p.description || 'Поступление'}</div>
            ${p.expected_date ? `<div style="font-size:12px;color:var(--hint);margin-top:2px">📅 ${fmtDate(p.expected_date)}</div>` : ''}
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span style="font-size:16px;font-weight:700;color:var(--green)">${fmtRub(p.amount)}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" data-action="receive-planned" data-id="${p.id}">✓ Получено</button>
              <button class="btn btn-danger btn-sm" data-action="del-planned" data-id="${p.id}">✕</button>
            </div>
          </div>
        </div>`).join('')}
    <div style="height:10px"></div>
  `;

  if (donutAccs.length > 0)
    initDonutChart('chart-bal-donut', actAccs.map(a => a.name), actAccs.map(a => Math.max(toRub(a.balance, a.currency), 0)), actAccs.map(a => a.color));
  document.getElementById('btn-add-account').addEventListener('click', () => openAccModal());
  document.getElementById('btn-add-planned').addEventListener('click', () => { const { openModal } = window.__modals; openModal('ov-planned'); });
  document.getElementById('btn-open-transfer').addEventListener('click', () => openTransferModal());
  document.getElementById('btn-add-goal').addEventListener('click', () => window.__modals.openGoalModal());
  el.querySelectorAll('[data-action="open-goal"]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); window.__modals.openGoalModal(parseInt(btn.dataset.id)); }));
  el.querySelectorAll('[data-action="deposit-goal"]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); window.__modals.openGoalDepositModal(parseInt(btn.dataset.id)); }));
}

// ─── EXPENSES ───────────────────────────────────────────────
export async function renderExpenses() {
  const el = document.getElementById('exp-content');
  const m2 = String(S.expMonth).padStart(2, '0');
  const lastDay   = new Date(S.expYear, S.expMonth, 0).getDate();  // правильный последний день месяца
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
    GETC(mKey,  () => renderExpenses()),
    GETC(txKey, () => renderExpenses()),
    GETC(blKey, () => renderExpenses()),
  ]);
  el._hasData = true;
  const cats  = monthly.by_category || [];
  const total = monthly.total_expenses || 0;
  const txs   = txData.transactions || [];
  const limits = budgetData.budget_limits || [];

  // Build budget map: category_id → limit object
  const budgetMap = {};
  limits.forEach(bl => { budgetMap[bl.category_id] = bl; });

  // Check for budget warnings
  const warnings = limits.filter(bl => bl.spent >= bl.amount * 0.8);

  el.innerHTML = `
    <div class="month-nav">
      <button id="exp-prev">‹</button>
      <div class="month-label">${MONTHS[S.expMonth]} ${S.expYear}</div>
      <button id="exp-next">›</button>
    </div>

    ${warnings.length > 0 ? `
    <div class="card" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06);margin-bottom:10px;padding:12px 14px">
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
    ${txs.length > 0 ? renderTxList(txs) : `<div style="text-align:center;color:var(--hint);padding:16px;font-size:13px">Нет трат за этот месяц</div>`}

    <div class="sec-hdr">
      <span class="sec-title">Категории</span>
      <button class="sec-btn" id="btn-add-cat">+ Добавить</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${S.categories.map(c => `
        <div data-action="open-cat" data-id="${c.id}" style="display:flex;align-items:center;gap:4px;background:${c.color}22;border:1px solid ${c.color}44;border-radius:20px;padding:4px 10px;font-size:12px;cursor:pointer">
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

// ─── SUBSCRIPTIONS ──────────────────────────────────────────
export async function renderSubscriptions() {
  const el = document.getElementById('sub-content');
  const monthly = S.subscriptions.filter(s => s.is_active).reduce((s, x) =>
    s + (x.period === 'monthly' ? toRub(x.amount, x.currency) : toRub(x.amount, x.currency) / 12), 0);
  const yearly = S.subscriptions.filter(s => s.is_active).reduce((s, x) =>
    s + (x.period === 'yearly' ? toRub(x.amount, x.currency) : toRub(x.amount, x.currency) * 12), 0);
  const sorted = [...S.subscriptions].sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return (a.next_date || '').localeCompare(b.next_date || '');
  });

  const PERIOD_LABELS = { daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', yearly: 'Ежегодно' };

  const renderRecurCard = r => {
    const du = daysUntil(r.next_date);
    const typeColor = r.type === 'income' ? 'var(--green)' : 'var(--red)';
    const typeSign  = r.type === 'income' ? '+' : '−';
    const daysLabel = du === null ? '' : du <= 0 ? 'Сегодня!' : `через ${du} дн`;
    const daysClass = du !== null && du <= 1 ? 'soon' : du !== null && du <= 5 ? 'mid' : 'ok';
    return `<div class="sub-card ${r.is_active ? '' : 'sub-inactive'}" style="cursor:pointer" data-action="open-recur" data-id="${r.id}">
      <div class="sub-card-top">
        <div class="sub-ico" style="background:${r.color}22">${r.icon}</div>
        <div class="sub-info">
          <div class="sub-name">${r.name}</div>
          <div class="sub-meta">${PERIOD_LABELS[r.period] || r.period}${r.day_of_month ? `, ${r.day_of_month}-го` : ''}${r.account_name ? ` · ${r.account_name}` : ''}</div>
          ${r.next_date ? `<div class="sub-days ${daysClass}">${daysLabel || fmtDate(r.next_date)}</div>` : ''}
        </div>
        <div class="sub-right">
          <div class="sub-amt" style="color:${typeColor}">${typeSign} ${fmtRub(r.amount)}</div>
          <div class="sub-period">${r.category_name ? r.category_icon + ' ' + r.category_name : ''}</div>
        </div>
      </div>
      ${r.is_active ? `<div class="sub-card-bottom">
        <button class="btn btn-secondary btn-sm" data-action="apply-recur" data-id="${r.id}" style="flex:1">▶ Применить сейчас</button>
        <button class="btn btn-secondary btn-sm" data-action="toggle-recur" data-id="${r.id}">⏸</button>
      </div>` : `<div class="sub-card-bottom">
        <button class="btn btn-secondary btn-sm" data-action="toggle-recur" data-id="${r.id}" style="flex:1">▶ Включить</button>
      </div>`}
    </div>`;
  };

  el.innerHTML = `
    <div class="grid2">
      <div class="card" style="background:linear-gradient(135deg,rgba(99,102,241,.2),rgba(139,92,246,.1));border-color:rgba(99,102,241,.3)">
        <div class="card-title">В месяц</div>
        <div class="card-value" style="font-size:22px">${fmtRub(monthly)}</div>
        <div class="card-sub">${S.subscriptions.filter(s => s.is_active).length} активных</div>
      </div>
      <div class="card">
        <div class="card-title">В год</div>
        <div class="card-value" style="font-size:22px">${fmtRub(yearly)}</div>
        <div class="card-sub">~${fmtRub(monthly)} /мес</div>
      </div>
    </div>
    <div class="sec-hdr">
      <span class="sec-title">Подписки</span>
      <button class="sec-btn" id="btn-add-sub">+ Добавить</button>
    </div>
    ${sorted.length === 0
      ? `<div class="empty"><div class="empty-ico">📋</div><div class="empty-text">Нет подписок</div></div>`
      : sorted.map(s => renderSubCard(s)).join('')}

    <div class="sec-hdr" style="margin-top:8px">
      <span class="sec-title">🔄 Повторяющиеся</span>
      <button class="sec-btn" id="btn-add-recur">+ Добавить</button>
    </div>
    ${S.recurring.length === 0
      ? `<div class="card"><div style="text-align:center;color:var(--hint);padding:12px;font-size:13px">Зарплата, аренда, другие регулярные операции</div></div>`
      : S.recurring.map(r => renderRecurCard(r)).join('')}
    <div style="height:10px"></div>
  `;
  document.getElementById('btn-add-sub').onclick = () => openSubModal();
  document.getElementById('btn-add-recur').onclick = () => window.__modals.openRecurModal();
  el.querySelectorAll('[data-action="open-recur"]').forEach(btn =>
    btn.addEventListener('click', e => {
      if (e.target.closest('[data-action="apply-recur"]') || e.target.closest('[data-action="toggle-recur"]')) return;
      window.__modals.openRecurModal(parseInt(btn.dataset.id));
    }));
  el.querySelectorAll('[data-action="apply-recur"]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); window.__modals.applyRecur(parseInt(btn.dataset.id), btn); }));
  el.querySelectorAll('[data-action="toggle-recur"]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); window.__modals.toggleRecur(parseInt(btn.dataset.id)); }));
}

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
    <div style="position:relative;margin-bottom:12px">
      <input type="search" id="hist-search" class="finput" placeholder="🔍 Поиск по описанию..." value="${S.histSearch || ''}"
        style="padding-left:12px">
    </div>
    <div id="hist-result">
      <div style="text-align:center;color:var(--hint);padding:24px;font-size:13px">Выберите период и нажмите OK</div>
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
    res.innerHTML = '<div style="text-align:center;color:var(--hint);padding:24px">Загрузка...</div>';
  }

  let url = `/api/transactions?start_date=${S.histStart}&end_date=${S.histEnd}&limit=${LIMIT}&offset=${S.histOffset}`;
  if (S.histSearch && S.histSearch.trim()) url += `&search=${encodeURIComponent(S.histSearch.trim())}`;

  const data   = await GET(url);
  const newTxs = data.transactions || [];
  const stats  = data.stats || {};

  // Accumulate transaction rows for display
  if (S.histOffset === 0) S.histTxs = [];
  S.histTxs = (S.histTxs || []).concat(newTxs);

  if (S.histOffset === 0 && newTxs.length === 0) {
    res.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-text">Нет транзакций за период</div></div>';
    return;
  }

  // Stats always come from the server (full period, no pagination)
  const totExp  = stats.total_expense || 0;
  const totInc  = stats.total_income  || 0;
  const totCount = stats.total_count  || 0;
  const topCats = stats.top_categories || [];

  const hasMore    = newTxs.length === LIMIT;
  const loadedCount = S.histTxs.length;
  const loadMoreBtn = hasMore
    ? `<button class="btn btn-secondary" id="btn-hist-more" style="margin:12px auto;display:block">Загрузить ещё (показано ${loadedCount} из ${totCount})</button>`
    : '';

  res.innerHTML = `
    <div class="grid2" style="margin-bottom:10px">
      <div class="card"><div class="card-title">Траты</div><div style="font-size:20px;font-weight:700;color:var(--red)">${fmtRub(totExp)}</div></div>
      <div class="card"><div class="card-title">Доходы</div><div style="font-size:20px;font-weight:700;color:var(--green)">${fmtRub(totInc)}</div></div>
    </div>
    ${topCats.length > 0 && !S.histSearch ? `
    <div class="sec-hdr"><span class="sec-title">Топ категорий</span></div>
    <div class="cat-list" style="margin-bottom:10px">
      ${topCats.map(c => renderCatRowClickable(c, totExp, S.histStart, S.histEnd)).join('')}
    </div>` : ''}
    <div class="sec-hdr"><span class="sec-title">${totCount} транзакций${loadedCount < totCount ? ` · показано ${loadedCount}` : ''}</span></div>
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
