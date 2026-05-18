// modal-transactions.js — расходы, доходы, переводы, редактирование, удаление
import { S, fmtRub, today, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, bustTx,
         enqueueTx, enqueueOp, patchOfflineBalance, getTxQueue, getOpQueue } from './api.js';
import { openModal, closeModal, showToast } from './modal-core.js';

// ─── ТРАТА / ДОХОД (единый модал) ───────────────────────────
let _txMode = 'expense';

function _setTxMode(mode) {
  _txMode = mode;
  const isIncome = mode === 'income';
  document.getElementById('toggle-expense').classList.toggle('active', !isIncome);
  document.getElementById('toggle-income').classList.toggle('active', isIncome);
  const catSection = document.getElementById('e-cat-section');
  if (catSection) catSection.style.display = isIncome ? 'none' : '';
  const title = document.getElementById('e-modal-title');
  const btn   = document.getElementById('btn-save-expense');
  if (title) title.textContent = isIncome ? 'Добавить доход' : 'Добавить трату';
  if (btn)   btn.textContent   = isIncome ? 'Добавить доход' : 'Добавить трату';
  if (btn) { btn.style.background = isIncome ? '#10b981' : ''; btn.style.borderColor = isIncome ? '#10b981' : ''; }
}

export function openExpenseModal() {
  _txMode = 'expense';
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
  _setTxMode('expense');
  const btnExp = document.getElementById('toggle-expense');
  const btnInc = document.getElementById('toggle-income');
  btnExp.onclick = () => { haptic(); _setTxMode('expense'); };
  btnInc.onclick = () => { haptic(); _setTxMode('income'); };
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
  const isIncome = _txMode === 'income';
  const body = {
    account_id:  accId,
    category_id: isIncome ? null : (S.selCatId || null),
    amount:      amt,
    type:        _txMode,
    description: document.getElementById('e-comment').value.trim(),
    date:        document.getElementById('e-date').value,
  };

  // Оптимистичное обновление
  const delta = isIncome ? amt : -amt;
  const acc = S.accounts.find(a => a.id === accId);
  if (acc) acc.balance += delta;
  patchOfflineBalance(accId, delta);
  closeModal('ov-expense');
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();

  if (!navigator.onLine) {
    enqueueTx(body);
    const pending = getOpQueue().length;
    showToast(`📵 Сохранено офлайн${pending > 1 ? ' · ' + pending + ' в очереди' : ''}`);
    _updateOfflineBannerCount();
    return;
  }

  await POST('/api/transactions', body);
  bustTx();
  reloadAccounts(); // fire-and-forget balance update
  // Force a fresh render so the new transaction appears immediately
  // (cache was just busted — GETC will do real requests now)
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}

export function openIncomeModal() {
  openExpenseModal();
  requestAnimationFrame(() => _setTxMode('income'));
}
export async function saveIncome() { await saveExpense(); }

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

  const body = {
    from_id:     fromId,
    to_id:       toId,
    amount:      amt,
    description: document.getElementById('t-desc').value.trim(),
    date:        document.getElementById('t-date').value,
  };

  // ── Офлайн: оптимистичное обновление + очередь ───────────
  if (!navigator.onLine) {
    // Обновляем балансы в памяти
    const fromAcc = S.accounts.find(a => a.id === fromId);
    const toAcc   = S.accounts.find(a => a.id === toId);
    if (fromAcc) { fromAcc.balance -= amt; patchOfflineBalance(fromId, -amt); }
    if (toAcc)   {
      // При конвертации валют используем текущий курс
      const toAmt = (fromAcc?.currency === 'USD' && toAcc?.currency === 'RUB')
        ? amt * S.usdRate
        : (fromAcc?.currency === 'RUB' && toAcc?.currency === 'USD')
          ? amt / S.usdRate
          : amt;
      toAcc.balance += toAmt;
      patchOfflineBalance(toId, toAmt);
    }
    enqueueOp('POST', '/api/transfers', body);
    closeModal('ov-transfer');
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast(`📵 Перевод сохранён офлайн`);
    _updateOfflineBannerCount();
    return;
  }

  await withLoading('btn-save-transfer', async () => {
    const res = await POST('/api/transfers', body);
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

  // Если офлайн — ищем транзакцию в истории S.histTxs
  if (!navigator.onLine) {
    const tx = (S.histTxs || []).find(t => t.id === txId);
    if (!tx) {
      showToast('📵 Редактирование недоступно офлайн');
      return;
    }
    _populateEditModal(tx, null);
    openModal('ov-edit-tx');
    return;
  }

  const data = await GET(`/api/transactions/${txId}`);
  const tx   = data.transaction;
  if (!tx) return;
  _populateEditModal(tx, data.pair);
  openModal('ov-edit-tx');
  setTimeout(() => {
    const isTransfer = tx.type === 'transfer';
    const focusEl = isTransfer
      ? document.getElementById('etx-transfer-amount')
      : document.getElementById('etx-amount');
    focusEl?.focus();
  }, 300);
}

function _populateEditModal(tx, pair) {
  const isTransfer = tx.type === 'transfer';
  document.getElementById('etx-normal-fields').style.display   = isTransfer ? 'none' : '';
  document.getElementById('etx-transfer-fields').style.display = isTransfer ? '' : 'none';
  document.getElementById('etx-modal-title').textContent = isTransfer ? '↔️ Редактировать перевод' : '✎ Редактировать транзакцию';

  if (isTransfer) {
    const isFrom = tx.description && tx.description.includes('→');
    const fromTx = isFrom ? tx : pair;
    const toTx   = isFrom ? pair : tx;
    const fromSel = document.getElementById('etx-from-account');
    const toSel   = document.getElementById('etx-to-account');
    fromSel.innerHTML = S.accounts.map(a =>
      `<option value="${a.id}" ${a.id === (fromTx?.account_id) ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
    toSel.innerHTML = S.accounts.map(a =>
      `<option value="${a.id}" ${a.id === (toTx?.account_id) ? 'selected' : ''}>${a.icon} ${a.name}${a.is_reserve ? ' 🔒' : ''}</option>`).join('');
    document.getElementById('etx-transfer-amount').value = fromTx?.amount || tx.amount;
    document.getElementById('etx-transfer-date').value   = tx.date;
    const rawDesc    = (fromTx?.description || tx.description || '');
    const labelMatch = rawDesc.match(/^(.*?)\s*→/);
    document.getElementById('etx-transfer-desc').value = labelMatch ? labelMatch[1].trim() : '';
    S.editTxFromId = fromTx?.id || S.editTxId;
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

    // ── Офлайн ───────────────────────────────────────────────
    if (!navigator.onLine) {
      enqueueOp('PUT', `/api/transactions/${txId}`, body);
      closeModal('ov-edit-tx');
      showToast('📵 Изменение сохранено офлайн');
      _updateOfflineBannerCount();
      return;
    }

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

  // ── Офлайн ───────────────────────────────────────────────
  if (!navigator.onLine) {
    enqueueOp('PUT', `/api/transactions/${S.editTxId}`, body);
    // Оптимистично обновляем в S.histTxs
    const idx = (S.histTxs || []).findIndex(t => t.id === S.editTxId);
    if (idx !== -1) Object.assign(S.histTxs[idx], { amount: body.amount, type: body.type, description: body.description, date: body.date, category_id: body.category_id });
    closeModal('ov-edit-tx');
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast('📵 Изменение сохранено офлайн');
    _updateOfflineBannerCount();
    return;
  }

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

  // ── Офлайн: ставим в очередь ─────────────────────────────
  if (!navigator.onLine) {
    enqueueOp('DELETE', `/api/transactions/${id}`);
    // Оптимистично убираем из S.histTxs
    if (S.histTxs) S.histTxs = S.histTxs.filter(t => t.id !== id);
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
    showToast('📵 Удаление отложено до онлайна');
    _updateOfflineBannerCount();
    return;
  }

  await DEL(`/api/transactions/${id}`);
  bustTx();
  await reloadAccounts();
  if (window.__S?.tab === 'history' && typeof window.__loadHistoryData === 'function') {
    window.__loadHistoryData();
  } else {
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  }
}

// ─── ОБНОВИТЬ СЧЁТЧИК В ОФЛАЙН-БАННЕРЕ ───────────────────────
function _updateOfflineBannerCount() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const pending = getOpQueue().length;
  const span = banner.querySelector('span');
  if (span) span.innerHTML = `📵 Офлайн${pending > 0 ? ' · <b>' + pending + ' в очереди</b>' : ''}`;
}
