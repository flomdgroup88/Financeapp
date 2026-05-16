import { S, fmtRub, toRub, fmtDate, daysUntil } from './state.js';
import { openSubModal } from './tabs.js';
import { renderSubCard } from './components.js';

const PERIOD_LABELS = { daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', yearly: 'Ежегодно' };

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

  el.innerHTML = `
    <div class="grid2">
      <div class="card card--accent-purple">
        <div class="card-title">В месяц</div>
        <div class="card-value stat-val--lg">${fmtRub(monthly)}</div>
        <div class="card-sub">${S.subscriptions.filter(s => s.is_active).length} активных</div>
      </div>
      <div class="card">
        <div class="card-title">В год</div>
        <div class="card-value stat-val--lg">${fmtRub(yearly)}</div>
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
      ? `<div class="card"><div class="empty-hint">Зарплата, аренда, другие регулярные операции</div></div>`
      : S.recurring.map(r => renderRecurCard(r)).join('')}
    <div class="spacer-10"></div>
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

function renderRecurCard(r) {
  const du = daysUntil(r.next_date);
  const typeColor = r.type === 'income' ? 'var(--green)' : 'var(--red)';
  const typeSign  = r.type === 'income' ? '+' : '−';
  const daysLabel = du === null ? '' : du <= 0 ? 'Сегодня!' : `через ${du} дн`;
  const daysClass = du !== null && du <= 1 ? 'soon' : du !== null && du <= 5 ? 'mid' : 'ok';
  return `<div class="sub-card ${r.is_active ? '' : 'sub-inactive'}" data-action="open-recur" data-id="${r.id}">
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
    ${r.is_active
      ? `<div class="sub-card-bottom">
           <button class="btn btn-secondary btn-sm" data-action="apply-recur" data-id="${r.id}" style="flex:1">▶ Применить сейчас</button>
           <button class="btn btn-secondary btn-sm" data-action="toggle-recur" data-id="${r.id}">⏸</button>
         </div>`
      : `<div class="sub-card-bottom">
           <button class="btn btn-secondary btn-sm" data-action="toggle-recur" data-id="${r.id}" style="flex:1">▶ Включить</button>
         </div>`}
  </div>`;
}
