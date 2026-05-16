// modal-accounts.js — модальные окна счетов
// ─────────────────────────────────────────────────────────────
import { S, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic, reloadAccounts, loadAll, bustAcc } from './api.js';
import { ICONS_ACC } from './config.js';
import { renderIconPicker, renderColorPicker } from './pickers.js';
import { openModal, closeModal } from './modal-core.js';

export function openAccModal(id) {
  S.editAccId = id || null; S.accPriority = false; S.accReserve = false;
  S.accIcon = '💰'; S.accColor = '#6366f1';
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

export async function moveAccount(id, direction) {
  haptic();
  await PUT(`/api/accounts/${id}/move`, { direction });
  await reloadAccounts();
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}
