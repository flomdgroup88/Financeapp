import { S, fmtRub, toRub, today, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, reloadSubscriptions, loadAll } from './api.js';
import { ICONS_ACC, ICONS_SUB, ICONS_CAT, MONTHS } from './config.js';
import { renderIconPicker, renderColorPicker } from './pickers.js';
import { renderTxList } from './components.js';

// ─── TOAST ───────────────────────────────────────────────────
export function showToast(msg, duration = 2200) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.style.cssText = `
      position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 14px);left:50%;
      transform:translateX(-50%) translateY(20px);
      background:rgba(30,30,50,.96);color:#e2e8f0;
      padding:10px 20px;border-radius:24px;font-size:14px;font-weight:500;
      box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:999;
      opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;
      white-space:nowrap;max-width:90vw;text-align:center;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(el._tid);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    el._tid = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
  });
}


// ─── MODAL HELPERS ───────────────────────────────────────────
export const openModal = id => {
  const el = document.getElementById(id);
  el.classList.add('show');
  // Always scroll modal body to top when opening
  requestAnimationFrame(() => {
    const body = el.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  });
};
export const closeModal = id => document.getElementById(id).classList.remove('show');

export function initModalDismiss() {
  document.querySelectorAll('.modal-close,[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close || btn.closest('.overlay').id)));
  document.querySelectorAll('.overlay').forEach(ov =>
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); }));
}

// ─── EXPENSE MODAL ───────────────────────────────────────────
export function openExpenseModal() {
  S.selCatId = null;
  document.getElementById('e-amount').value  = '';
  document.getElementById('e-comment').value = '';
  document.getElementById('e-date').value    = today();
  const grid   = document.getElementById('e-cat-grid');
  grid.innerHTML = S.categories.map(c =>
    `<div class="cg-item" data-id="${c.id}" data-action="sel-cat">${`<span class="cg-ico">${c.icon}</span><span class="cg-lbl">${c.name}</span>`}</div>`
  ).join('');
  const accSel = document.getElementById('e-account');
  accSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}" ${a.is_priority ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  const prio = S.accounts.find(a => a.is_priority);
  if (prio) accSel.value = prio.id;
  openModal('ov-expense');
  setTimeout(() => document.getElementById('e-amount').focus(), 300);
}

export function handleSelCat(el) {
  haptic();
  S.selCatId = parseInt(el.dataset.id);
  document.querySelectorAll('#e-cat-grid .cg-item').forEach(i => i.classList.remove('sel'));
  el.classList.add('sel');
}

export async function saveExpense() {
  const amt = parseFloat(document.getElementById('e-amount').value);
  if (!amt || amt <= 0) return;
  haptic('medium');
  const accId = parseInt(document.getElementById('e-account').value);
  const body = {
    account_id:  accId, category_id: S.selCatId, amount: amt, type: 'expense',
    description: document.getElementById('e-comment').value.trim(),
    date:        document.getElementById('e-date').value,
  };
  const acc = S.accounts.find(a => a.id === accId);
  if (acc) acc.balance -= amt;
  closeModal('ov-expense');
  window.__renderCurrentTab();
  await POST('/api/transactions', body);
  reloadAccounts();
}

// ─── EDIT TRANSACTION MODAL ──────────────────────────────────
export async function openEditTxModal(txId) {
  haptic();
  S.editTxId = txId;
  S.txCatId  = null;

  // fetch the tx data
  const data = await GET(`/api/transactions?limit=500`);
  const tx   = (data.transactions || []).find(t => t.id === txId);
  if (!tx) return;

  document.getElementById('etx-amount').value  = tx.amount;
  document.getElementById('etx-date').value    = tx.date;
  document.getElementById('etx-comment').value = tx.description || '';
  document.getElementById('etx-type').value    = tx.type;

  // Account select
  const accSel = document.getElementById('etx-account');
  accSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}" ${a.id === tx.account_id ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');

  // Category grid
  S.txCatId = tx.category_id;
  const grid = document.getElementById('etx-cat-grid');
  grid.innerHTML = `<div class="cg-item ${!tx.category_id ? 'sel' : ''}" data-id="" data-action="sel-edit-cat">
    <span class="cg-ico">🚫</span><span class="cg-lbl">Без кат.</span>
  </div>` + S.categories.map(c =>
    `<div class="cg-item ${c.id === tx.category_id ? 'sel' : ''}" data-id="${c.id}" data-action="sel-edit-cat">
      <span class="cg-ico">${c.icon}</span><span class="cg-lbl">${c.name}</span>
    </div>`).join('');

  openModal('ov-edit-tx');
  setTimeout(() => document.getElementById('etx-amount').focus(), 300);
}

export function handleSelEditCat(el) {
  haptic();
  S.txCatId = el.dataset.id ? parseInt(el.dataset.id) : null;
  document.querySelectorAll('#etx-cat-grid .cg-item').forEach(i => i.classList.remove('sel'));
  el.classList.add('sel');
}

export async function saveEditTx() {
  const amt = parseFloat(document.getElementById('etx-amount').value);
  if (!amt || amt <= 0) return;
  haptic('medium');
  const body = {
    account_id:  parseInt(document.getElementById('etx-account').value) || null,
    category_id: S.txCatId || null,
    amount:      amt,
    type:        document.getElementById('etx-type').value,
    description: document.getElementById('etx-comment').value.trim(),
    date:        document.getElementById('etx-date').value,
  };
  await withLoading('btn-save-edit-tx', async () => {
    const res = await PUT(`/api/transactions/${S.editTxId}`, body);
    if (res.ok) {
      closeModal('ov-edit-tx');
      await reloadAccounts();
      window.__renderCurrentTab();
      showToast('✅ Транзакция обновлена');
    }
  });
}

// ─── INCOME MODAL ────────────────────────────────────────────
export function openIncomeModal() {
  document.getElementById('i-amount').value  = '';
  document.getElementById('i-comment').value = '';
  document.getElementById('i-date').value    = today();
  const accSel = document.getElementById('i-account');
  accSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}" ${a.is_priority ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  const prio = S.accounts.find(a => a.is_priority);
  if (prio) accSel.value = prio.id;
  openModal('ov-income');
  setTimeout(() => document.getElementById('i-amount').focus(), 300);
}

export async function saveIncome() {
  const amt = parseFloat(document.getElementById('i-amount').value);
  if (!amt || amt <= 0) return;
  haptic('medium');
  const accId = parseInt(document.getElementById('i-account').value);
  const body = {
    account_id: accId, amount: amt, type: 'income',
    description: document.getElementById('i-comment').value.trim(),
    date:        document.getElementById('i-date').value,
  };
  const acc = S.accounts.find(a => a.id === accId);
  if (acc) acc.balance += amt;
  closeModal('ov-income');
  window.__renderCurrentTab();
  await POST('/api/transactions', body);
  reloadAccounts();
}

// ─── TRANSFER MODAL ──────────────────────────────────────────
export function openTransferModal(fromId) {
  const prio   = S.accounts.find(a => a.is_priority);
  const fromSel = document.getElementById('t-from');
  const toSel   = document.getElementById('t-to');
  fromSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}">${a.icon} ${a.name} (${a.currency === 'USD' ? '$' + a.balance.toFixed(2) : fmtRub(a.balance)})${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  toSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}">${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  if (fromId) fromSel.value = fromId;
  else if (prio) fromSel.value = prio.id;
  const fromV  = parseInt(fromSel.value);
  const toOpts = S.accounts.filter(a => a.id !== fromV);
  if (toOpts.length > 0) toSel.value = toOpts[0].id;
  document.getElementById('t-amount').value = '';
  document.getElementById('t-desc').value   = '';
  document.getElementById('t-date').value   = today();
  document.getElementById('t-conv-hint').style.display = 'none';
  openModal('ov-transfer');
  setTimeout(() => document.getElementById('t-amount').focus(), 300);
}

export function updateConvHint() {
  const fromId  = parseInt(document.getElementById('t-from').value);
  const toId    = parseInt(document.getElementById('t-to').value);
  const fromAcc = S.accounts.find(a => a.id === fromId);
  const toAcc   = S.accounts.find(a => a.id === toId);
  const amt     = parseFloat(document.getElementById('t-amount').value) || 0;
  const hint    = document.getElementById('t-conv-hint');
  if (!fromAcc || !toAcc || fromAcc.currency === toAcc.currency || !amt) { hint.style.display = 'none'; return; }
  let convAmt;
  if (fromAcc.currency === 'USD' && toAcc.currency === 'RUB') convAmt = `≈ ${fmtRub(amt * S.usdRate)}`;
  else if (fromAcc.currency === 'RUB' && toAcc.currency === 'USD') convAmt = `≈ $${(amt / S.usdRate).toFixed(2)}`;
  if (convAmt) { hint.textContent = `Получит: ${convAmt} (курс ${S.usdRate} ₽/$)`; hint.style.display = 'block'; }
  else hint.style.display = 'none';
}

export async function saveTransfer() {
  const fromId = parseInt(document.getElementById('t-from').value);
  const toId   = parseInt(document.getElementById('t-to').value);
  const amt    = parseFloat(document.getElementById('t-amount').value);
  if (!amt || amt <= 0 || fromId === toId) return;
  haptic('medium');
  await withLoading('btn-save-transfer', async () => {
    const res = await POST('/api/transfers', {
      from_id: fromId, to_id: toId, amount: amt,
      description: document.getElementById('t-desc').value.trim(),
      date: document.getElementById('t-date').value,
    });
    if (res.ok) {
      closeModal('ov-transfer');
      await reloadAccounts();
      window.__renderCurrentTab();
    }
  });
}

// ─── ACCOUNT MODAL ───────────────────────────────────────────
export function openAccModal(id) {
  S.editAccId = id || null; S.accPriority = false; S.accReserve = false; S.accIcon = '💰'; S.accColor = '#6366f1';
  document.getElementById('acc-modal-title').textContent = id ? 'Редактировать счёт' : 'Добавить счёт';
  document.getElementById('btn-del-account').style.display = id ? 'block' : 'none';
  if (id) {
    const a = S.accounts.find(x => x.id === id);
    if (a) {
      document.getElementById('a-name').value     = a.name;
      document.getElementById('a-balance').value  = a.balance;
      document.getElementById('a-currency').value = a.currency;
      S.accPriority = !!a.is_priority; S.accReserve = !!a.is_reserve;
      S.accIcon = a.icon; S.accColor = a.color;
    }
  } else {
    document.getElementById('a-name').value     = '';
    document.getElementById('a-balance').value  = '0';
    document.getElementById('a-currency').value = 'RUB';
  }
  document.getElementById('a-priority').classList.toggle('on', S.accPriority);
  document.getElementById('a-reserve').classList.toggle('on', S.accReserve);
  renderIconPicker('a-icon-picker', ICONS_ACC, S.accIcon, v => { S.accIcon = v; });
  renderColorPicker('a-color-picker', S.accColor, v => { S.accColor = v; });
  openModal('ov-account');
  setTimeout(() => document.getElementById('a-name').focus(), 300);
}

export async function saveAccount() {
  const name = document.getElementById('a-name').value.trim();
  if (!name) return;
  haptic('medium');
  const body = {
    name, balance: parseFloat(document.getElementById('a-balance').value) || 0,
    currency: document.getElementById('a-currency').value,
    is_priority: S.accPriority, is_reserve: S.accReserve,
    icon: S.accIcon, color: S.accColor,
  };
  await withLoading('btn-save-account', async () => {
    if (S.editAccId) await PUT(`/api/accounts/${S.editAccId}`, body);
    else             await POST('/api/accounts', body);
    closeModal('ov-account');
    await loadAll();
    window.__renderCurrentTab();
  });
}

export async function deleteAccount() {
  if (!S.editAccId || !confirm('Удалить счёт? Транзакции сохранятся.')) return;
  await DEL(`/api/accounts/${S.editAccId}`);
  closeModal('ov-account');
  await loadAll();
  window.__renderCurrentTab();
}

// ─── SUBSCRIPTION MODAL ──────────────────────────────────────
export function onSubPeriodChange() {
  const period = document.getElementById('s-period').value;
  document.getElementById('s-billing-day-wrap').style.display = period === 'monthly' ? 'block' : 'none';
  document.getElementById('s-next-date-wrap').style.display   = period === 'yearly'  ? 'block' : 'none';
}

export function openSubModal(id) {
  S.editSubId = id || null; S.subIcon = '🔔'; S.subColor = '#6366f1';
  document.getElementById('sub-modal-title').textContent = id ? 'Редактировать подписку' : 'Добавить подписку';
  document.getElementById('btn-del-sub').style.display = id ? 'block' : 'none';
  const accSel = document.getElementById('s-account-id');
  accSel.innerHTML = `<option value="">Приоритетный (авто)</option>`
    + S.accounts.map(a => `<option value="${a.id}">${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  if (id) {
    const s = S.subscriptions.find(x => x.id === id);
    if (s) {
      document.getElementById('s-name').value        = s.name;
      document.getElementById('s-amount').value      = s.amount;
      document.getElementById('s-currency').value    = s.currency;
      document.getElementById('s-period').value      = s.period;
      document.getElementById('s-billing-day').value = s.billing_day || '';
      document.getElementById('s-next-date').value   = s.next_date || '';
      document.getElementById('s-desc').value        = s.description || '';
      document.getElementById('s-account-id').value  = s.account_id || '';
      S.subIcon = s.icon; S.subColor = s.color;
    }
  } else {
    ['s-name', 's-amount', 's-billing-day', 's-next-date', 's-desc'].forEach(i => { document.getElementById(i).value = ''; });
    document.getElementById('s-currency').value   = 'RUB';
    document.getElementById('s-period').value     = 'monthly';
    document.getElementById('s-account-id').value = '';
  }
  onSubPeriodChange();
  renderIconPicker('s-icon-picker', ICONS_SUB, S.subIcon, v => { S.subIcon = v; });
  renderColorPicker('s-color-picker', S.subColor, v => { S.subColor = v; });
  openModal('ov-sub');
  setTimeout(() => document.getElementById('s-name').focus(), 300);
}

export async function saveSub() {
  const name   = document.getElementById('s-name').value.trim();
  const amount = parseFloat(document.getElementById('s-amount').value) || 0;
  if (!name || !amount) return;
  haptic('medium');
  const period     = document.getElementById('s-period').value;
  const billingDay = period === 'monthly' ? parseInt(document.getElementById('s-billing-day').value) || null : null;
  const nextDate   = period === 'yearly'  ? document.getElementById('s-next-date').value || null : null;
  const accountId  = document.getElementById('s-account-id').value || null;
  const body = {
    name, amount, currency: document.getElementById('s-currency').value,
    period, billing_day: billingDay, next_date: nextDate,
    account_id: accountId ? parseInt(accountId) : null,
    description: document.getElementById('s-desc').value.trim(),
    icon: S.subIcon, color: S.subColor,
  };
  await withLoading('btn-save-sub', async () => {
    if (S.editSubId) await PUT(`/api/subscriptions/${S.editSubId}`, body);
    else             await POST('/api/subscriptions', body);
    closeModal('ov-sub');
    await reloadSubscriptions();
    window.__renderTab('subscriptions');
  });
}

export async function deleteSub() {
  if (!S.editSubId) return;
  await DEL(`/api/subscriptions/${S.editSubId}`);
  closeModal('ov-sub');
  await reloadSubscriptions();
  window.__renderTab('subscriptions');
}

export async function chargeSub(id, btn) {
  haptic('medium');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await POST(`/api/subscriptions/${id}/charge`, {});
    if (res.ok) {
      const sub = S.subscriptions.find(s => s.id === id);
      if (sub) sub.next_date = res.next_date;
      const acc = S.accounts.find(a => a.id === res.account_id);
      if (acc && sub) acc.balance -= sub.amount;
      haptic('success');
      window.__renderTab('subscriptions');
      reloadAccounts();
    }
  } finally { btn.disabled = false; btn.textContent = orig; }
}

export async function toggleSub(id) {
  await PUT(`/api/subscriptions/${id}/toggle`);
  await reloadSubscriptions();
  window.__renderTab('subscriptions');
}

// ─── CATEGORY MODAL ──────────────────────────────────────────
export function openCatModal(id) {
  S.editCatId = id || null; S.catIcon = '📦'; S.catColor = '#6366f1';
  document.getElementById('cat-modal-title').textContent = id ? 'Редактировать категорию' : 'Новая категория';
  document.getElementById('btn-del-cat').style.display = id ? 'block' : 'none';
  if (id) {
    const c = S.categories.find(x => x.id === id);
    if (c) { document.getElementById('c-name').value = c.name; S.catIcon = c.icon; S.catColor = c.color; }
  } else { document.getElementById('c-name').value = ''; }
  renderIconPicker('c-icon-picker', ICONS_CAT, S.catIcon, v => { S.catIcon = v; });
  renderColorPicker('c-color-picker', S.catColor, v => { S.catColor = v; });
  openModal('ov-cat');
  setTimeout(() => document.getElementById('c-name').focus(), 300);
}

export async function saveCat() {
  const name = document.getElementById('c-name').value.trim();
  if (!name) return;
  haptic('medium');
  const body = { name, icon: S.catIcon, color: S.catColor };
  await withLoading('btn-save-cat', async () => {
    if (S.editCatId) await PUT(`/api/categories/${S.editCatId}`, body);
    else             await POST('/api/categories', body);
    closeModal('ov-cat');
    const data = await GET('/api/categories');
    S.categories = data.categories || [];
    window.__renderCurrentTab();
  });
}

export async function deleteCat() {
  if (!S.editCatId) return;
  await DEL(`/api/categories/${S.editCatId}`);
  closeModal('ov-cat');
  const data = await GET('/api/categories');
  S.categories = data.categories || [];
  window.__renderCurrentTab();
}

// ─── CHART DRILLDOWN ────────────────────────────────────────

export async function openChartDetail(catId, catName, catIcon, catColor, startDate, endDate) {
  haptic();
  document.getElementById('cd-title').textContent = `${catIcon} ${catName}`;
  document.getElementById('cd-summary').innerHTML = '<div style="color:var(--hint);padding:8px 0">Загружаю...</div>';
  document.getElementById('cd-txlist').innerHTML  = '';
  openModal('ov-chart-detail');

  const data  = await GET(`/api/transactions?category_id=${catId}&start_date=${startDate}&end_date=${endDate}&type=expense`);
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

// ─── PLANNED INCOME ──────────────────────────────────────────
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
    window.__renderCurrentTab();
  });
}

export async function receivePlanned(id) {
  const accId = S.accounts.find(a => a.is_priority && !a.is_reserve)?.id
    || S.accounts.find(a => !a.is_reserve)?.id || S.accounts[0]?.id;
  if (!accId) return alert('Добавьте счёт');
  await PUT(`/api/planned-income/${id}/receive?account_id=${accId}`);
  await loadAll();
  window.__renderCurrentTab();
}

export async function deletePlanned(id) {
  await DEL(`/api/planned-income/${id}`);
  const data = await GET('/api/planned-income');
  S.planned  = data.planned_income || [];
  window.__renderCurrentTab();
}

// ─── DELETE TRANSACTION ──────────────────────────────────────
export async function deleteTx(id) {
  haptic();
  await DEL(`/api/transactions/${id}`);
  await reloadAccounts();
  window.__renderCurrentTab();
}

// ─── SETTINGS ────────────────────────────────────────────────
export async function saveSettings() {
  const rate = parseFloat(document.getElementById('cfg-usd').value) || 90;
  await POST('/api/settings', { usd_rate: rate });
  S.usdRate = rate;
  closeModal('ov-settings');
  window.__renderCurrentTab();
}

// ─── BUDGET LIMITS MODAL ─────────────────────────────────────
export async function openBudgetsModal(year, month) {
  const data   = await GET(`/api/budget-limits?year=${year}&month=${month}`);
  const limits = data.budget_limits || [];

  // Build a lookup
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
    closeModal('ov-budgets');
    await window.__renderCurrentTab();
    showToast('✅ Лимиты сохранены');
  });
}

// ─── MOVE ACCOUNT ────────────────────────────────────────────
export async function moveAccount(id, direction) {
  haptic();
  await PUT(`/api/accounts/${id}/move`, { direction });
  await reloadAccounts();
  window.__renderCurrentTab();
}
