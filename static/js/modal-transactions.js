// modal-transactions.js — расходы, доходы, переводы, редактирование, удаление
// ─────────────────────────────────────────────────────────────
import { S, fmtRub, today, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, bustTx } from './api.js';
import { openModal, closeModal, showToast } from './modal-core.js';

// ─── РАСХОД ──────────────────────────────────────────────────
export function openExpenseModal() {
  S.selCatId = null;
  document.getElementById('e-amount').value  = '';
  document.getElementById('e-comment').value = '';
  document.getElementById('e-date').value    = today();
  const grid = document.getElementById('e-cat-grid');
  grid.innerHTML = S.categories.map(c =>
    `<div class="cg-item" data-id="${c.id}" data-action="sel-cat"><span class="cg-ico">${c.icon}</span><span class="cg-lbl">${c.name}</span></div>`
  ).join('');
  const accSel = document.getElementById('e-account');
  accSel.innerHTML = S.accounts.map(a =>
    `<option value="${a.id}" ${a.is_priority ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
  const prio = S.accounts.find(a => a.is_priority);
  if (prio) accSel.value = prio.id;
  openModal('ov-expense');
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

// ─── ДОХОД ───────────────────────────────────────────────────
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

// ─── ПЕРЕВОД ─────────────────────────────────────────────────
export function openTransferModal(fromId) {
  const prio    = S.accounts.find(a => a.is_priority);
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

// ─── РЕДАКТИРОВАНИЕ ───────────────────────────────────────────
export async function openEditTxModal(txId) {
  haptic();
  S.editTxId = txId;
  S.txCatId  = null;

  const data = await GET(`/api/transactions/${txId}`);
  const tx   = data.transaction;
  if (!tx) return;

  const isTransfer = tx.type === 'transfer';
  document.getElementById('etx-normal-fields').style.display   = isTransfer ? 'none' : '';
  document.getElementById('etx-transfer-fields').style.display = isTransfer ? '' : 'none';
  document.getElementById('etx-modal-title').textContent = isTransfer ? '↔️ Редактировать перевод' : '✎ Редактировать транзакцию';

  if (isTransfer) {
    const pair   = data.pair;
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
    const rawDesc   = (fromTx?.description || tx.description || '');
    const labelMatch = rawDesc.match(/^(.*?)\s*→/);
    document.getElementById('etx-transfer-desc').value = labelMatch ? labelMatch[1].trim() : '';
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
        closeModal('ov-edit-tx'); bustTx();
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
      closeModal('ov-edit-tx'); bustTx();
      await reloadAccounts();
      window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
      showToast('✅ Транзакция обновлена');
    }
  });
}

export async function deleteTx(id) {
  haptic();
  await DEL(`/api/transactions/${id}`);
  bustTx();
  await reloadAccounts();
  // Если удаление произошло в истории — перезагрузить только результаты,
  // не трогая фильтры и UI (иначе renderHistory() сбрасывает всё в исходное состояние)
  if (window.__S?.tab === 'history' && typeof window.__loadHistoryData === 'function') {
    window.__loadHistoryData();
  } else {
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  }
}
