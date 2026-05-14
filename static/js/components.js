import { S, fmt, fmtRub, toRub, fmtDate, daysUntil } from './state.js';

// ─── TRANSACTION LIST ────────────────────────────────────────
export function renderTxList(txs, allowEdit = true) {
  let html = '<div class="tx-list">';
  let lastDate = '';
  txs.forEach(t => {
    if (t.date !== lastDate) {
      html += `<div class="tx-date-hdr">${fmtDate(t.date)}</div>`;
      lastDate = t.date;
    }
    const isTfr = t.type === 'transfer';
    const color = isTfr ? '#818cf8' : t.category_color || '#6366f1';
    const icon  = isTfr ? '↔️' : t.category_icon || '📦';
    const catN  = isTfr ? 'Перевод' : (t.category_name || (t.type === 'income' ? 'Доход' : 'Прочее'));
    const sign  = t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '';
    const cls   = t.type === 'expense' ? 'exp' : t.type === 'income' ? 'inc' : 'tfr';
    const editBtn = (!isTfr && allowEdit)
      ? `<span class="tx-action-btn" data-action="edit-tx" data-id="${t.id}" title="Редактировать">✎</span>`
      : '';
    html += `<div class="tx-row">
      <div class="tx-ico" style="background:${color}22">${icon}</div>
      <div class="tx-info">
        <div class="tx-title">${t.description || catN}</div>
        <div class="tx-sub">${catN}${t.account_name ? ' · ' + t.account_name : ''}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${cls}">${sign}${fmtRub(t.amount)}</div>
        <div style="display:flex;gap:6px;margin-top:2px;justify-content:flex-end">
          ${editBtn}
          <span class="tx-action-btn" data-action="del-tx" data-id="${t.id}" title="Удалить">✕</span>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

// ─── CATEGORY ROW ────────────────────────────────────────────
export function renderCatRow(c, total, budgetMap = {}) {
  const pct    = total > 0 ? Math.round(c.total / total * 100) : 0;
  const budget = budgetMap[c.id];
  let budgetHtml = '';
  if (budget) {
    const bPct    = Math.min(Math.round(c.total / budget.amount * 100), 100);
    const bColor  = bPct >= 100 ? '#ef4444' : bPct >= 80 ? '#f59e0b' : '#10b981';
    const remain  = budget.amount - c.total;
    budgetHtml = `
      <div class="budget-bar-wrap" style="margin-top:5px">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${bPct}%;background:${bColor}"></div>
        </div>
        <div class="budget-meta">
          <span style="color:${bColor};font-weight:600">${bPct}% от лимита</span>
          <span>${remain >= 0 ? 'осталось ' + fmtRub(remain) : 'перерасход ' + fmtRub(-remain)}</span>
        </div>
      </div>`;
  }
  return `<div class="cat-row">
    <div class="cat-ico-box" style="background:${c.color || '#6366f1'}22">${c.icon || '📦'}</div>
    <div class="cat-info">
      <div class="cat-name">${c.name || 'Прочее'}</div>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${c.color || '#6366f1'}"></div></div>
      ${budgetHtml}
    </div>
    <div class="cat-right">
      <div class="cat-amt">${fmtRub(c.total)}</div>
      <div class="cat-pct">${pct}%</div>
    </div>
  </div>`;
}

export function renderCatRowClickable(c, total, startDate, endDate, budgetMap = {}) {
  const pct    = total > 0 ? Math.round(c.total / total * 100) : 0;
  const budget = budgetMap[c.id];
  let budgetHtml = '';
  if (budget) {
    const bPct   = Math.min(Math.round(c.total / budget.amount * 100), 100);
    const bColor = bPct >= 100 ? '#ef4444' : bPct >= 80 ? '#f59e0b' : '#10b981';
    const remain = budget.amount - c.total;
    budgetHtml = `
      <div class="budget-bar-wrap" style="margin-top:5px">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${bPct}%;background:${bColor}"></div>
        </div>
        <div class="budget-meta">
          <span style="color:${bColor};font-weight:600">${bPct}%</span>
          <span>${remain >= 0 ? fmtRub(remain) + ' осталось' : 'перерасход ' + fmtRub(-remain)}</span>
        </div>
      </div>`;
  }
  const name = (c.name || '').replace(/'/g, "\\'");
  return `<div class="cat-row" data-action="open-cat-detail"
      data-cat-id="${c.id}" data-cat-name="${name}"
      data-cat-icon="${c.icon || '📦'}" data-cat-color="${c.color || '#6366f1'}"
      data-start="${startDate}" data-end="${endDate}">
    <div class="cat-ico-box" style="background:${c.color || '#6366f1'}22">${c.icon || '📦'}</div>
    <div class="cat-info">
      <div class="cat-name">${c.name || 'Прочее'}</div>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${c.color || '#6366f1'}"></div></div>
      ${budgetHtml}
    </div>
    <div class="cat-right">
      <div class="cat-amt">${fmtRub(c.total)}</div>
      <div class="cat-pct">${pct}% 🔍</div>
    </div>
  </div>`;
}

// ─── ACCOUNT CARD ────────────────────────────────────────────
export function renderAccCard(a, totalForPct, idx, total, isReserveSection = false) {
  const rub    = toRub(a.balance, a.currency);
  const pct    = totalForPct > 0 ? Math.round(rub / totalForPct * 100) : 0;
  const bal    = a.currency === 'USD'
    ? `<div class="v">$${fmt(a.balance, 2)}</div><div class="c">${fmtRub(rub)}</div>`
    : `<div class="v">${fmtRub(a.balance)}</div>`;
  return `<div class="acc-card ${a.is_reserve ? 'reserve-card' : ''}" data-action="open-acc" data-id="${a.id}">
    <div class="acc-ico" style="background:${a.color}22">${a.icon}</div>
    <div class="acc-info">
      <div class="acc-name">${a.name}</div>
      <div class="acc-sub">${pct}% от ${isReserveSection ? 'резерва' : 'активного'}</div>
      ${a.is_priority ? `<span class="priority-badge">⭐ Приоритет</span>` : ''}
      ${a.is_reserve  ? `<span class="reserve-badge">🔒 Резерв</span>` : ''}
    </div>
    <div class="acc-bal">${bal}</div>
    <div class="acc-actions" onclick="event.stopPropagation()">
      <button class="sort-btn" ${idx === 0 ? 'disabled style="opacity:.3"' : ''} data-action="move-acc" data-id="${a.id}" data-dir="up">▲</button>
      <button class="sort-btn" ${idx === total - 1 ? 'disabled style="opacity:.3"' : ''} data-action="move-acc" data-id="${a.id}" data-dir="down">▼</button>
    </div>
  </div>`;
}

// ─── COMPARISON ROW ──────────────────────────────────────────
export function renderCmpRow(r) {
  const cls  = r.change_pct > 0 ? 'up' : r.change_pct < 0 ? 'down' : 'neu';
  const sign = r.change_pct > 0 ? '▲ ' : r.change_pct < 0 ? '▼ ' : '';
  const max  = Math.max(r.curr_amount, r.prev_amount, 1);
  return `<div class="cmp-row">
    <span class="cmp-ico">${r.icon || '📦'}</span>
    <div class="cmp-info">
      <div class="cmp-name">${r.name}</div>
      <div class="cmp-bars">
        <div class="cmp-bar" style="width:${Math.round(r.curr_amount / max * 80)}%;background:${r.color || '#6366f1'}"></div>
        <div class="cmp-bar" style="width:${Math.round(r.prev_amount / max * 80)}%;background:${r.color || '#6366f1'};opacity:.3"></div>
      </div>
    </div>
    <div class="cmp-right">
      <span class="cmp-chip chip ${cls}">${sign}${Math.abs(r.change_pct)}%</span>
      <div class="cmp-prev">${fmtRub(r.prev_amount)}</div>
    </div>
  </div>`;
}

// ─── SUB CARD ────────────────────────────────────────────────
export function renderSubCard(s) {
  const days = daysUntil(s.next_date);
  let daysClass = 'ok', daysText = '';
  if (days != null) {
    if      (days < 0)  { daysText = 'Просрочена'; daysClass = 'soon'; }
    else if (days === 0){ daysText = 'Сегодня!';   daysClass = 'soon'; }
    else                { daysText = `через ${days} д.`; daysClass = days < 3 ? 'soon' : days < 10 ? 'mid' : 'ok'; }
  }
  const amtDisp = s.currency === 'USD' ? `$${fmt(s.amount, 2)}` : fmtRub(s.amount);
  const monthly = s.period === 'monthly' ? toRub(s.amount, s.currency) : toRub(s.amount, s.currency) / 12;
  let billingInfo = '';
  if (s.period === 'monthly' && s.billing_day) billingInfo = `каждое ${s.billing_day}-е`;
  else if (s.next_date) billingInfo = fmtDate(s.next_date);

  return `<div class="sub-card ${s.is_active ? '' : 'sub-inactive'}" data-action="open-sub" data-id="${s.id}">
    <div class="sub-card-top">
      <div class="sub-ico" style="background:${s.color || '#6366f1'}22">${s.icon || '🔔'}</div>
      <div class="sub-info">
        <div class="sub-name">${s.name}</div>
        <div class="sub-meta">${s.description || ''}${billingInfo ? ' · ' + billingInfo : ''}</div>
        ${days != null ? `<span class="sub-days ${daysClass}">${daysText}</span>` : ''}
      </div>
      <div class="sub-right">
        <div class="sub-amt">${amtDisp}</div>
        <div class="sub-period">${s.period === 'monthly' ? '/мес' : '/год'}</div>
        ${s.period === 'yearly' ? `<div style="font-size:10px;color:var(--hint)">${fmtRub(monthly)}/мес</div>` : ''}
        <button class="toggle ${s.is_active ? 'on' : ''}" style="margin-top:6px"
          data-action="toggle-sub" data-id="${s.id}" onclick="event.stopPropagation()"></button>
      </div>
    </div>
    ${s.is_active ? `
    <div class="sub-card-bottom">
      <button class="btn btn-sm" style="flex:1;background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.2)"
        data-action="charge-sub" data-id="${s.id}" onclick="event.stopPropagation()">💳 Списать</button>
    </div>` : ''}
  </div>`;
}
