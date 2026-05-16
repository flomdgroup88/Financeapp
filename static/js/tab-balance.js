import { S, fmt, fmtRub, toRub, fmtDate, daysUntil, activeBalance, totalBalance } from './state.js';
import { openAccModal, openTransferModal } from './tabs.js';
import { initDonutChart } from './charts.js';
import { renderAccCard } from './components.js';

// ─── BALANCE ────────────────────────────────────────────────
export async function renderBalance() {
  const el = document.getElementById('bal-content');
  const active   = activeBalance(), total = totalBalance();
  const rsrvAccs = S.accounts.filter(a => a.is_reserve);
  const actAccs  = S.accounts.filter(a => !a.is_reserve);
  const prio     = S.accounts.find(a => a.is_priority);
  const donutAccs = actAccs.length > 1 ? actAccs : [];

  el.innerHTML = `
    <div class="card card--accent-green">
      <div class="card-title">Активный баланс</div>
      <div class="card-value lg">${fmtRub(active)}</div>
      ${rsrvAccs.length > 0 ? `<div class="text-hint" style="font-size:11px;margin-top:5px">Всего с резервом: ${fmtRub(total)}</div>` : ''}
      ${prio ? `<div class="card-sub" style="margin-top:6px">Приоритет: ${prio.icon} ${prio.name}</div>` : ''}
    </div>

    ${donutAccs.length > 0 ? `
    <div class="card" style="padding:14px">
      <div class="acc-donut-row">
        <div class="donut-wrap"><canvas id="chart-bal-donut"></canvas>
          <div class="donut-center"><span class="amt">${actAccs.length}</span><span class="lbl">счетов</span></div>
        </div>
        <div class="acc-donut-legend">
          ${actAccs.map(a => `
            <div class="acc-legend-item">
              <span class="acc-legend-icon">${a.icon}</span>
              <div class="acc-legend-name">${a.name}</div>
              <span class="acc-legend-bal">
                ${a.currency === 'USD' ? '$' + fmt(a.balance, 2) : fmtRub(a.balance)}
              </span>
            </div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="sec-hdr">
      <span class="sec-title">Счета</span>
      <div style="display:flex;gap:8px">
        <button class="sec-btn text-link" id="btn-open-transfer">⇄ Перевод</button>
        <button class="sec-btn" id="btn-add-account">+ Добавить</button>
      </div>
    </div>
    <div class="acc-list">${actAccs.map((a, i) => renderAccCard(a, active, i, actAccs.length)).join('')}</div>

    ${rsrvAccs.length > 0 ? `
    <div class="sec-hdr">
      <span class="sec-title text-hint">Резервные счета</span>
      <span class="reserve-header-amt">${fmtRub(rsrvAccs.reduce((s, a) => s + toRub(a.balance, a.currency), 0))}</span>
    </div>
    <div class="acc-list">${rsrvAccs.map((a, i) => renderAccCard(a, total, i, rsrvAccs.length, true)).join('')}</div>` : ''}

    <div class="sec-hdr">
      <span class="sec-title">🎯 Цели накопления</span>
      <button class="sec-btn" id="btn-add-goal">+ Добавить</button>
    </div>
    ${S.goals.length === 0
      ? `<div class="card"><div class="empty-hint">Нет целей. Начни копить на мечту!</div></div>`
      : S.goals.map(g => {
          const pct = g.target_amount > 0 ? Math.min(Math.round(g.saved_amount / g.target_amount * 100), 100) : 0;
          const remaining = Math.max(g.target_amount - g.saved_amount, 0);
          const barColor = pct >= 100 ? 'var(--green)' : g.color;
          const daysLeft = g.deadline ? daysUntil(g.deadline) : null;
          return `<div class="card goal-card" data-action="open-goal" data-id="${g.id}">
            <div class="flex-row" style="margin-bottom:10px">
              <div class="goal-ico" style="background:${g.color}22">${g.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</div>
                <div style="font-size:11px;color:var(--hint);margin-top:2px">${g.description || ''}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:13px;font-weight:700;color:${barColor}">${fmtRub(g.saved_amount)}</div>
                <div style="font-size:11px;color:var(--hint)">из ${fmtRub(g.target_amount)}</div>
              </div>
            </div>
            <div class="goal-progress">
              <div class="goal-progress-bar" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint)">
              <span>${pct}%${daysLeft !== null ? ` · ${daysLeft >= 0 ? daysLeft + ' дн' : 'просрочено'}` : ''}</span>
              ${pct < 100
                ? `<span>осталось ${fmtRub(remaining)}</span>`
                : `<span class="text-green" style="font-weight:600">✅ Цель достигнута!</span>`}
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
      ? `<div class="card"><div class="empty-hint">Нет планируемых поступлений</div></div>`
      : S.planned.map(p => `
        <div class="card card-row" style="margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:600">${p.description || 'Поступление'}</div>
            ${p.expected_date ? `<div style="font-size:12px;color:var(--hint);margin-top:2px">📅 ${fmtDate(p.expected_date)}</div>` : ''}
          </div>
          <div class="planned-item">
            <span class="stat-val--green" style="font-size:16px">${fmtRub(p.amount)}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" data-action="receive-planned" data-id="${p.id}">✓ Получено</button>
              <button class="btn btn-danger btn-sm" data-action="del-planned" data-id="${p.id}">✕</button>
            </div>
          </div>
        </div>`).join('')}
    <div class="spacer-10"></div>
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
