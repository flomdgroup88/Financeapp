import { S, fmt, fmtRub, toRub, fmtDate, daysUntil, activeBalance, totalBalance, hasReserve } from './state.js';
import { GETC } from './api.js';
import { MONTHS } from './config.js';
import { initBarChart } from './charts.js';
import { renderCatRow, renderCmpRow } from './components.js';
import { openChartDetail, openBudgetsModal, skCard, skSection } from './tabs.js';

// ─── DASHBOARD ──────────────────────────────────────────────
export async function renderDashboard() {
  const el = document.getElementById('dash-content');

  const dashKey = `/api/stats/monthly?year=${S.expYear}&month=${S.expMonth}`;
  const cmpKey  = '/api/stats/comparison';

  if (!el._hasData) el.innerHTML = `${skCard(3)}${skSection(4)}`;

  const [monthly, comparison] = await Promise.all([
    GETC(dashKey, () => renderDashboard()),
    GETC(cmpKey,  () => renderDashboard()),
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
  const days    = monthly.daily || [];
  const prio    = S.accounts.find(a => a.is_priority);
  const insights = buildInsights(comparison, exp, inc, subMonthly, S.subscriptions);

  const balFooter = `
    <div class="flex-row--wrap" style="margin-top:8px">
      <span class="text-green">↑ ${fmtRub(inc)}</span>
      <span class="text-red">↓ ${fmtRub(exp)}</span>
      <span style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">= ${net >= 0 ? '+' : ''}${fmtRub(net)}</span>
      <span class="text-hint">${MONTHS[S.expMonth]}</span>
    </div>`;

  const balCard = reserve ? `
    <div class="card card--accent-purple">
      <div class="card-title">Активный баланс</div>
      <div class="card-value lg">${fmtRub(active)}</div>
      <div class="text-hint" style="font-size:11px;margin-top:4px">Всего с резервом: ${fmtRub(total)}</div>
      ${prio ? `<div class="card-sub" style="margin-top:4px">⭐ Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
      ${balFooter}
    </div>` : `
    <div class="card card--accent-purple">
      <div class="card-title">Общий баланс</div>
      <div class="card-value lg">${fmtRub(total)}</div>
      ${prio ? `<div class="card-sub" style="margin-top:4px">⭐ Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
      ${balFooter}
    </div>`;

  el.innerHTML = `
    ${balCard}
    <div class="grid3">
      <div class="card card--compact">
        <div class="card-title card-title--sm">Траты</div>
        <div class="stat-val--red">${fmtRub(exp)}</div>
        <div style="margin-top:4px">${cmpChip}</div>
      </div>
      <div class="card card--compact">
        <div class="card-title card-title--sm">Доходы</div>
        <div class="stat-val--green">${fmtRub(inc)}</div>
      </div>
      <div class="card card--compact">
        <div class="card-title card-title--sm">Подписки/мес</div>
        <div class="stat-val">${fmtRub(subMonthly)}</div>
        <div class="card-sub">${S.subscriptions.filter(s => s.is_active).length} шт</div>
      </div>
    </div>

    ${plannedSum > 0 ? `
    <div class="card card--accent-emerald">
      <div class="card-row">
        <div>
          <div class="card-title card-title--green">Ожидаемые поступления</div>
          <div class="card-value--green">${fmtRub(plannedSum)}</div>
        </div>
        <span style="font-size:28px">💚</span>
      </div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
        ${S.planned.slice(0, 3).map(p => `
          <div class="planned-row">
            <span class="text-hint">${p.description || 'Поступление'}${p.expected_date ? ' · ' + fmtDate(p.expected_date) : ''}</span>
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
    <div class="card card--chart"><div class="chart-wrap sm"><canvas id="chart-daily"></canvas></div></div>

    <div class="sec-hdr"><span class="sec-title">Сравнение с прошлым месяцем</span></div>
    <div class="card">
      <div class="card-row" style="margin-bottom:12px">
        <div>
          <div class="card-title">Этот месяц</div>
          <div class="stat-val--md">${fmtRub(comparison.current?.total || 0)}</div>
        </div>
        <div>${cmpChip}</div>
        <div style="text-align:right">
          <div class="card-title">Прошлый</div>
          <div class="stat-val--md">${fmtRub(comparison.previous?.total || 0)}</div>
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
      <div class="card card-row card--accent-soon" style="margin-bottom:8px">
        <div class="flex-row">
          <div class="sub-ico-box" style="background:${s.color}22">${s.icon}</div>
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

    <div style="padding:4px 0 16px">
      <button onclick="window.__modals.openYearlyStats(${new Date().getFullYear()})" class="btn-yearly">
        📊 Годовая статистика
      </button>
    </div>
  `;

  if (days.length > 0) initBarChart('chart-daily', days.map(d => d.date.slice(8)), days.map(d => d.total));

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
