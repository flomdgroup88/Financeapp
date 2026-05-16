// modal-subscriptions.js — подписки и регулярные транзакции
// ─────────────────────────────────────────────────────────────
import { S, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, reloadSubscriptions, bustTx, bustSub } from './api.js';
import { ICONS_SUB, ICONS_RECUR } from './config.js';
import { renderIconPicker, renderColorPicker } from './pickers.js';
import { openModal, closeModal, showToast } from './modal-core.js';

// Вызывается из tabs.js где нет прямого импорта
const invalidateTab = window.__invalidateTab;

// ─── ПОДПИСКИ ────────────────────────────────────────────────
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
    window.__renderTab('subscriptions', true);
  });
}

export async function deleteSub() {
  if (!S.editSubId) return;
  await DEL(`/api/subscriptions/${S.editSubId}`);
  closeModal('ov-sub');
  await reloadSubscriptions();
  window.__renderTab('subscriptions', true);
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
      bustSub(); bustTx();
      window.__renderTab('subscriptions', true);
      reloadAccounts();
    }
  } finally { btn.disabled = false; btn.textContent = orig; }
}

export async function toggleSub(id) {
  await PUT(`/api/subscriptions/${id}/toggle`);
  await reloadSubscriptions();
  window.__renderTab('subscriptions', true);
}

// ─── РЕГУЛЯРНЫЕ ТРАНЗАКЦИИ ───────────────────────────────────
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
    document.getElementById('r-type').value       = 'expense';
    document.getElementById('r-period').value     = 'monthly';
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
  const period = document.getElementById('r-period').value;
  const body = {
    name, amount, type: document.getElementById('r-type').value, period,
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
