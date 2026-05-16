// modal-goals.js — цели накоплений
// ─────────────────────────────────────────────────────────────
import { S, fmtRub, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic } from './api.js';
import { openModal, closeModal, showToast } from './modal-core.js';

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
}

export async function saveGoalDeposit() {
  const amt = parseFloat(document.getElementById('gdep-amount').value) || 0;
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
