import { S, fmtRub, toRub, today, withLoading, fmtDate } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, reloadSubscriptions, loadAll, bustTx, bustAcc, bustSub } from './api.js';
import { ICONS_ACC, ICONS_SUB, ICONS_CAT, ICONS_GOAL, ICONS_RECUR, MONTHS } from './config.js';
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

  // ── Keyboard / textarea comfort fix ──────────────────────────
  // When textarea inside a modal gets focus, wait for iOS keyboard (~350ms)
  // then scroll it into view inside the modal-body.
  document.addEventListener('focusin', e => {
    const field = e.target;
    if (!field.matches('textarea, input')) return;
    const modalBody = field.closest('.modal-body');
    if (!modalBody) return;
    setTimeout(() => {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 380);
  });

  // visualViewport fires when keyboard opens/closes on mobile.
  // Shrink the modal so it fits above the keyboard.
  if (window.visualViewport) {
    const onVpResize = () => {
      const vvh = window.visualViewport.height;
      const wh  = window.innerHeight;
      const keyboardH = Math.max(0, wh - vvh);
      document.querySelectorAll('.overlay.show .modal').forEach(modal => {
        modal.style.maxHeight = keyboardH > 80 ? `${vvh * 0.97}px` : '';
      });
      if (keyboardH > 80) {
        const focused = document.activeElement;
        if (focused && focused.closest('.modal-body')) {
          setTimeout(() => focused.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      }
    };
    window.visualViewport.addEventListener('resize', onVpResize);
    window.visualViewport.addEventListener('scroll', onVpResize);
  }
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
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  await POST('/api/transactions', body);
  bustTx();
  reloadAccounts();
}

// ─── EDIT TRANSACTION MODAL ──────────────────────────────────
export async function openEditTxModal(txId) {
  haptic();
  S.editTxId = txId;
  S.txCatId  = null;

  // fetch the tx data
  const data = await GET(`/api/transactions/${txId}`);
  const tx   = data.transaction;
  if (!tx) return;

  const isTransfer = tx.type === 'transfer';
  document.getElementById('etx-normal-fields').style.display   = isTransfer ? 'none' : '';
  document.getElementById('etx-transfer-fields').style.display = isTransfer ? '' : 'none';
  document.getElementById('etx-modal-title').textContent = isTransfer ? '↔️ Редактировать перевод' : '✎ Редактировать транзакцию';

  if (isTransfer) {
    const pair = data.pair;

    // Determine from/to: "from" has "→" in description, "to" has "←"
    const isFrom = tx.description && tx.description.includes('→');
    const fromTx = isFrom ? tx   : pair;
    const toTx   = isFrom ? pair : tx;

    const fromSel = document.getElementById('etx-from-account');
    const toSel   = document.getElementById('etx-to-account');
    fromSel.innerHTML = S.accounts.map(a =>
      `<option value="${a.id}" ${a.id === (fromTx?.account_id) ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
    toSel.innerHTML = S.accounts.map(a =>
      `<option value="${a.id}" ${a.id === (toTx?.account_id) ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');

    document.getElementById('etx-transfer-amount').value = fromTx?.amount || tx.amount;
    document.getElementById('etx-transfer-date').value   = tx.date;
    // Extract label from description (strip " → AccountName")
    const rawDesc = (fromTx?.description || tx.description || '');
    const labelMatch = rawDesc.match(/^(.*?)\s*→/);
    document.getElementById('etx-transfer-desc').value  = labelMatch ? labelMatch[1].trim() : '';

    // Store which tx is the "from" side for saving
    S.editTxFromId = fromTx?.id || txId;
  } else {
    document.getElementById('etx-amount').value  = tx.amount;
    document.getElementById('etx-date').value    = tx.date;
    document.getElementById('etx-comment').value = tx.description || '';
    document.getElementById('etx-type').value    = tx.type;

    const accSel = document.getElementById('etx-account');
    accSel.innerHTML = S.accounts.map(a =>
      `<option value="${a.id}" ${a.id === tx.account_id ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');

    S.txCatId = tx.category_id;
    const grid = document.getElementById('etx-cat-grid');
    grid.innerHTML = `<div class="cg-item ${!tx.category_id ? 'sel' : ''}" data-id="" data-action="sel-edit-cat">
      <span class="cg-ico">🚫</span><span class="cg-lbl">Без кат.</span>
    </div>` + S.categories.map(c =>
      `<div class="cg-item ${c.id === tx.category_id ? 'sel' : ''}" data-id="${c.id}" data-action="sel-edit-cat">
        <span class="cg-ico">${c.icon}</span><span class="cg-lbl">${c.name}</span>
      </div>`).join('');
  }

  openModal('ov-edit-tx');
  setTimeout(() => {
    const focusEl = isTransfer
      ? document.getElementById('etx-transfer-amount')
      : document.getElementById('etx-amount');
    focusEl?.focus();
  }, 300);
}

export function handleSelEditCat(el) {
  haptic();
  S.txCatId = el.dataset.id ? parseInt(el.dataset.id) : null;
  document.querySelectorAll('#etx-cat-grid .cg-item').forEach(i => i.classList.remove('sel'));
  el.classList.add('sel');
}

export async function saveEditTx() {
  // Check if we're editing a transfer
  const transferFields = document.getElementById('etx-transfer-fields');
  const isTransfer = transferFields && transferFields.style.display !== 'none';

  if (isTransfer) {
    const amt = parseFloat(document.getElementById('etx-transfer-amount').value);
    if (!amt || amt <= 0) return;
    haptic('medium');
    const body = {
      account_id:    parseInt(document.getElementById('etx-from-account').value) || null,
      to_account_id: parseInt(document.getElementById('etx-to-account').value)   || null,
      amount:        amt,
      description:   document.getElementById('etx-transfer-desc').value.trim(),
      date:          document.getElementById('etx-transfer-date').value,
    };
    const txId = S.editTxFromId || S.editTxId;
    await withLoading('btn-save-edit-tx', async () => {
      const res = await PUT(`/api/transactions/${txId}`, body);
      if (res.ok) {
        closeModal('ov-edit-tx');
        bustTx();
        await reloadAccounts();
        window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
        showToast('✅ Перевод обновлён');
      }
    });
    return;
  }

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
      bustTx();
      await reloadAccounts();
      window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
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
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  await POST('/api/transactions', body);
  bustTx();
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
      bustTx();
      await reloadAccounts();
      window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
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
    bustAcc();
    await loadAll();
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  });
}

export async function deleteAccount() {
  if (!S.editAccId || !confirm('Удалить счёт? Транзакции сохранятся.')) return;
  await DEL(`/api/accounts/${S.editAccId}`);
  closeModal('ov-account');
  bustAcc();
  await loadAll();
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
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
    invalidateTab && invalidateTab('subscriptions'); window.__renderTab('subscriptions', true);
  });
}

export async function deleteSub() {
  if (!S.editSubId) return;
  await DEL(`/api/subscriptions/${S.editSubId}`);
  closeModal('ov-sub');
  await reloadSubscriptions();
  invalidateTab && invalidateTab('subscriptions'); window.__renderTab('subscriptions', true);
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
      bustSub();
      bustTx();
      invalidateTab && invalidateTab('subscriptions'); window.__renderTab('subscriptions', true);
      reloadAccounts();
    }
  } finally { btn.disabled = false; btn.textContent = orig; }
}

export async function toggleSub(id) {
  await PUT(`/api/subscriptions/${id}/toggle`);
  await reloadSubscriptions();
  invalidateTab && invalidateTab('subscriptions'); window.__renderTab('subscriptions', true);
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
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  });
}

export async function deleteCat() {
  if (!S.editCatId) return;
  await DEL(`/api/categories/${S.editCatId}`);
  closeModal('ov-cat');
  const data = await GET('/api/categories');
  S.categories = data.categories || [];
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

// ─── CHART DRILLDOWN ────────────────────────────────────────

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

// ─── DELETE TRANSACTION ──────────────────────────────────────
export async function deleteTx(id) {
  haptic();
  await DEL(`/api/transactions/${id}`);
  bustTx();
  await reloadAccounts();
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

// ─── SETTINGS ────────────────────────────────────────────────
export async function saveSettings() {
  const rate = parseFloat(document.getElementById('cfg-usd').value) || 90;
  await POST('/api/settings', { usd_rate: rate });
  S.usdRate = rate;
  closeModal('ov-settings');
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
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
    bustTx();   // budget-limits share the bustTx prefix /api/budget-limits
    closeModal('ov-budgets');
    await window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast('✅ Лимиты сохранены');
  });
}

// ─── MOVE ACCOUNT ────────────────────────────────────────────
export async function moveAccount(id, direction) {
  haptic();
  await PUT(`/api/accounts/${id}/move`, { direction });
  await reloadAccounts();
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

// ─── SAVINGS GOALS ───────────────────────────────────────────
export function openGoalModal(id) {
  S.editGoalId = id || null; S.goalIcon = '🎯'; S.goalColor = '#6366f1';
  document.getElementById('goal-modal-title').textContent = id ? 'Редактировать цель' : 'Новая цель';
  document.getElementById('btn-del-goal').style.display = id ? 'block' : 'none';
  if (id) {
    const g = S.goals.find(x => x.id === id);
    if (g) {
      document.getElementById('g-name').value     = g.name;
      document.getElementById('g-target').value   = g.target_amount;
      document.getElementById('g-saved').value    = g.saved_amount;
      document.getElementById('g-desc').value     = g.description || '';
      document.getElementById('g-deadline').value = g.deadline || '';
      S.goalIcon = g.icon; S.goalColor = g.color;
    }
  } else {
    ['g-name', 'g-target', 'g-saved', 'g-desc', 'g-deadline'].forEach(i => { document.getElementById(i).value = ''; });
  }
  const { renderIconPicker, renderColorPicker } = window.__pickers;
  renderIconPicker('g-icon-picker', window.__ICONS_GOAL, S.goalIcon, v => { S.goalIcon = v; });
  renderColorPicker('g-color-picker-goal', S.goalColor, v => { S.goalColor = v; });
  openModal('ov-goal');
  setTimeout(() => document.getElementById('g-name').focus(), 300);
}

export async function saveGoal() {
  const name   = document.getElementById('g-name').value.trim();
  const target = parseFloat(document.getElementById('g-target').value) || 0;
  if (!name || target <= 0) return;
  haptic('medium');
  const body = {
    name, target_amount: target,
    saved_amount: parseFloat(document.getElementById('g-saved').value) || 0,
    description: document.getElementById('g-desc').value.trim(),
    deadline: document.getElementById('g-deadline').value || null,
    icon: S.goalIcon, color: S.goalColor,
  };
  await withLoading('btn-save-goal', async () => {
    if (S.editGoalId) await PUT(`/api/goals/${S.editGoalId}`, body);
    else              await POST('/api/goals', body);
    closeModal('ov-goal');
    const data = await GET('/api/goals');
    S.goals = data.goals || [];
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast(S.editGoalId ? '✅ Цель обновлена' : '🎯 Цель создана!');
  });
}

export async function deleteGoal() {
  if (!S.editGoalId) return;
  await DEL(`/api/goals/${S.editGoalId}`);
  closeModal('ov-goal');
  const data = await GET('/api/goals');
  S.goals = data.goals || [];
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

export function openGoalDepositModal(id) {
  S.editGoalId = id;
  const g = S.goals.find(x => x.id === id);
  if (!g) return;
  document.getElementById('gdep-goal-name').textContent = `${g.icon} ${g.name}`;
  const remaining = Math.max(g.target_amount - g.saved_amount, 0);
  document.getElementById('gdep-amount').value = '';
  document.getElementById('gdep-amount').placeholder = `До цели: ${remaining.toLocaleString('ru-RU')} ₽`;
  const accSel = document.getElementById('gdep-account');
  accSel.innerHTML = `<option value="">Только отметить (без списания)</option>` +
    S.accounts.filter(a => !a.is_reserve).map(a =>
      `<option value="${a.id}" ${a.is_priority ? 'selected' : ''}>${a.icon} ${a.name}</option>`).join('');
  openModal('ov-goal-deposit');
  setTimeout(() => document.getElementById('gdep-amount').focus(), 300);
}

export async function saveGoalDeposit() {
  const amt   = parseFloat(document.getElementById('gdep-amount').value) || 0;
  if (!amt || amt <= 0) return;
  haptic('medium');
  const accId = document.getElementById('gdep-account').value || null;
  await withLoading('btn-save-goal-deposit', async () => {
    const res = await POST(`/api/goals/${S.editGoalId}/deposit`, {
      amount: amt, account_id: accId ? parseInt(accId) : null,
    });
    if (res.ok) {
      const g = S.goals.find(x => x.id === S.editGoalId);
      if (g) g.saved_amount = res.saved_amount;
      if (accId) {
        const acc = S.accounts.find(a => a.id === parseInt(accId));
        if (acc) acc.balance -= amt;
      }
      closeModal('ov-goal-deposit');
      window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
      showToast('💰 Накопления обновлены!');
    }
  });
}

// ─── RECURRING TRANSACTIONS ──────────────────────────────────
export function openRecurModal(id) {
  S.editRecurId = id || null; S.recurIcon = '🔄'; S.recurColor = '#6366f1'; S.recurCatId = null;
  document.getElementById('recur-modal-title').textContent = id ? 'Редактировать регулярную' : 'Добавить регулярную';
  document.getElementById('btn-del-recur').style.display = id ? 'block' : 'none';
  const accSel = document.getElementById('r-account-id');
  accSel.innerHTML = `<option value="">Приоритетный (авто)</option>` +
    S.accounts.map(a => `<option value="${a.id}">${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  const buildCatGrid = () => {
    const grid = document.getElementById('r-cat-grid');
    grid.innerHTML = `<div class="cg-item ${!S.recurCatId ? 'sel' : ''}" data-id="" data-action="sel-recur-cat">
      <span class="cg-ico">🚫</span><span class="cg-lbl">Без кат.</span>
    </div>` + S.categories.map(c =>
      `<div class="cg-item ${c.id === S.recurCatId ? 'sel' : ''}" data-id="${c.id}" data-action="sel-recur-cat">
        <span class="cg-ico">${c.icon}</span><span class="cg-lbl">${c.name}</span>
      </div>`).join('');
  };
  if (id) {
    const r = S.recurring.find(x => x.id === id);
    if (r) {
      document.getElementById('r-name').value        = r.name;
      document.getElementById('r-amount').value      = r.amount;
      document.getElementById('r-type').value        = r.type;
      document.getElementById('r-period').value      = r.period;
      document.getElementById('r-day').value         = r.day_of_month || '';
      document.getElementById('r-desc').value        = r.description || '';
      document.getElementById('r-account-id').value  = r.account_id || '';
      S.recurIcon = r.icon; S.recurColor = r.color; S.recurCatId = r.category_id || null;
    }
  } else {
    ['r-name', 'r-amount', 'r-day', 'r-desc'].forEach(i => { document.getElementById(i).value = ''; });
    document.getElementById('r-type').value      = 'expense';
    document.getElementById('r-period').value    = 'monthly';
    document.getElementById('r-account-id').value = '';
  }
  onRecurPeriodChange();
  buildCatGrid();
  const { renderIconPicker, renderColorPicker } = window.__pickers;
  renderIconPicker('r-icon-picker', window.__ICONS_RECUR, S.recurIcon, v => { S.recurIcon = v; });
  renderColorPicker('r-color-picker-recur', S.recurColor, v => { S.recurColor = v; });
  openModal('ov-recur');
  setTimeout(() => document.getElementById('r-name').focus(), 300);
}

export function onRecurPeriodChange() {
  const period = document.getElementById('r-period').value;
  document.getElementById('r-day-wrap').style.display = period === 'monthly' ? 'block' : 'none';
}

export function handleSelRecurCat(el) {
  haptic();
  S.recurCatId = el.dataset.id ? parseInt(el.dataset.id) : null;
  document.querySelectorAll('#r-cat-grid .cg-item').forEach(i => i.classList.remove('sel'));
  el.classList.add('sel');
}

export async function saveRecur() {
  const name   = document.getElementById('r-name').value.trim();
  const amount = parseFloat(document.getElementById('r-amount').value) || 0;
  if (!name || amount <= 0) return;
  haptic('medium');
  const period  = document.getElementById('r-period').value;
  const body = {
    name, amount, type: document.getElementById('r-type').value,
    period,
    day_of_month: period === 'monthly' ? parseInt(document.getElementById('r-day').value) || 1 : null,
    category_id: S.recurCatId || null,
    account_id: document.getElementById('r-account-id').value ? parseInt(document.getElementById('r-account-id').value) : null,
    description: document.getElementById('r-desc').value.trim(),
    icon: S.recurIcon, color: S.recurColor,
  };
  await withLoading('btn-save-recur', async () => {
    if (S.editRecurId) await PUT(`/api/recurring/${S.editRecurId}`, body);
    else               await POST('/api/recurring', body);
    closeModal('ov-recur');
    const data = await GET('/api/recurring');
    S.recurring = data.recurring || [];
    window.__renderTab('subscriptions', true);
    showToast(S.editRecurId ? '✅ Регулярная обновлена' : '🔄 Регулярная добавлена!');
  });
}

export async function deleteRecur() {
  if (!S.editRecurId) return;
  await DEL(`/api/recurring/${S.editRecurId}`);
  closeModal('ov-recur');
  const data = await GET('/api/recurring');
  S.recurring = data.recurring || [];
  window.__renderTab('subscriptions', true);
}

export async function applyRecur(id, btn) {
  haptic('medium');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await POST(`/api/recurring/${id}/apply`, {});
    if (res.ok) {
      const r = S.recurring.find(x => x.id === id);
      if (r) r.next_date = res.next_date;
      const acc = S.accounts.find(a => a.id === res.account_id);
      if (acc && r) acc.balance += (r.type === 'income' ? r.amount : -r.amount);
      haptic('success');
      const data = await GET('/api/recurring');
      S.recurring = data.recurring || [];
      window.__renderTab('subscriptions', true);
      reloadAccounts();
      showToast(r ? `✅ ${r.name} применено` : '✅ Применено');
    }
  } finally { btn.disabled = false; btn.textContent = orig; }
}

export async function toggleRecur(id) {
  await PUT(`/api/recurring/${id}/toggle`);
  const data = await GET('/api/recurring');
  S.recurring = data.recurring || [];
  window.__renderTab('subscriptions', true);
}

// ─── YEARLY STATS MODAL ──────────────────────────────────────
const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

export async function openYearlyStats(year) {
  year = year || new Date().getFullYear();
  const modal = document.getElementById('ov-yearly-stats');
  const body  = modal.querySelector('.modal-body');

  // Show year selector + loading state
  body.innerHTML = renderYearlyShell(year);
  openModal('ov-yearly-stats');

  const data = await GET(`/api/stats/yearly?year=${year}`);
  renderYearlyContent(body, data, year);
}

function renderYearlyShell(year) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button onclick="window.__yearlyNav(${year - 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">‹</button>
      <span style="font-size:18px;font-weight:700">${year}</span>
      <button onclick="window.__yearlyNav(${year + 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">›</button>
    </div>
    <div style="text-align:center;padding:40px;color:var(--hint);font-size:14px">Загрузка...</div>`;
}

function renderYearlyContent(body, d, year) {
  const net = d.total_income - d.total_expenses;
  const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';

  // Build SVG bar chart (income vs expenses per month)
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

  // Category rows
  const totalExp = d.total_expenses || 1;
  const catRows = (d.by_category || []).slice(0, 8).map(c => {
    const pct = Math.round((c.total / totalExp) * 100);
    const barPct = Math.min(100, pct);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--divider)">
        <span style="font-size:20px;flex-shrink:0">${c.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;margin-bottom:4px">
            <span>${c.name}</span><span style="color:var(--hint)">${pct}%</span>
          </div>
          <div style="height:4px;background:var(--card-b);border-radius:2px">
            <div style="height:4px;width:${barPct}%;background:${c.color || 'var(--accent)'};border-radius:2px"></div>
          </div>
        </div>
        <span style="font-size:13px;font-weight:700;flex-shrink:0;min-width:72px;text-align:right">${fmtRub(c.total)}</span>
      </div>`;
  }).join('');

  const bestMonthName  = d.best_month  ? MONTH_SHORT[d.best_month.month - 1]  : '—';
  const worstMonthName = d.worst_month ? MONTH_SHORT[d.worst_month.month - 1] : '—';

  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button onclick="window.__yearlyNav(${year - 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">‹</button>
      <span style="font-size:18px;font-weight:700">${year}</span>
      <button onclick="window.__yearlyNav(${year + 1})" style="background:var(--card);border:1px solid var(--card-b);border-radius:8px;color:var(--text);width:36px;height:36px;font-size:18px;cursor:pointer">›</button>
    </div>

    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div class="card" style="padding:12px">
        <div class="card-title" style="font-size:10px">Расходы за год</div>
        <div style="font-size:18px;font-weight:700;color:var(--red)">${fmtRub(d.total_expenses)}</div>
      </div>
      <div class="card" style="padding:12px">
        <div class="card-title" style="font-size:10px">Доходы за год</div>
        <div style="font-size:18px;font-weight:700;color:var(--green)">${fmtRub(d.total_income)}</div>
      </div>
      <div class="card" style="padding:12px">
        <div class="card-title" style="font-size:10px">Баланс года</div>
        <div style="font-size:18px;font-weight:700;color:${netColor}">${net >= 0 ? '+' : ''}${fmtRub(net)}</div>
      </div>
      <div class="card" style="padding:12px">
        <div class="card-title" style="font-size:10px">Средние траты/мес</div>
        <div style="font-size:18px;font-weight:700">${fmtRub(d.avg_monthly_expense)}</div>
        <div style="font-size:10px;color:var(--hint);margin-top:2px">${d.active_months} мес. с данными</div>
      </div>
    </div>

    <!-- Mini highlights -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="card" style="padding:10px;border-color:rgba(16,185,129,.3)">
        <div style="font-size:10px;color:var(--hint);margin-bottom:2px">💚 Лучший месяц</div>
        <div style="font-size:14px;font-weight:700">${bestMonthName}</div>
        ${d.best_month ? `<div style="font-size:11px;color:var(--green)">+${fmtRub(d.best_month.income - d.best_month.expenses)}</div>` : ''}
      </div>
      <div class="card" style="padding:10px;border-color:rgba(239,68,68,.3)">
        <div style="font-size:10px;color:var(--hint);margin-bottom:2px">🔥 Самый дорогой</div>
        <div style="font-size:14px;font-weight:700">${worstMonthName}</div>
        ${d.worst_month ? `<div style="font-size:11px;color:var(--red)">${fmtRub(d.worst_month.expenses)}</div>` : ''}
      </div>
    </div>

    <!-- Monthly bar chart -->
    <div class="sec-hdr" style="margin-bottom:8px">
      <span class="sec-title">Доходы vs Расходы по месяцам</span>
    </div>
    <div class="card" style="padding:12px;margin-bottom:16px">
      <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;color:var(--hint)">
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;opacity:.75;margin-right:4px"></span>Доходы</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--red);border-radius:2px;opacity:.75;margin-right:4px"></span>Расходы</span>
      </div>
      <svg viewBox="0 0 ${chartW} ${chartH + 16}" width="100%" xmlns="http://www.w3.org/2000/svg">${bars}</svg>
    </div>

    <!-- Category breakdown -->
    ${catRows ? `
    <div class="sec-hdr" style="margin-bottom:4px"><span class="sec-title">Топ категорий</span></div>
    <div class="card" style="padding:0 12px">
      ${catRows}
    </div>
    <div style="text-align:center;padding:12px 0;font-size:12px;color:var(--hint)">${d.tx_count} транзакций за год</div>` : 
    '<div class="empty"><div class="empty-ico">📊</div><div class="empty-text">Нет данных за этот год</div></div>'}
  `;
}

window.__yearlyNav = async (year) => {
  const modal = document.getElementById('ov-yearly-stats');
  const body  = modal.querySelector('.modal-body');
  body.innerHTML = renderYearlyShell(year);
  const data = await GET(`/api/stats/yearly?year=${year}`);
  renderYearlyContent(body, data, year);
};
