import { S } from './state.js';
import { loadAll, GET, POST, PUT, DEL, haptic, reloadAccounts, reloadSubscriptions, bustTx } from './api.js';
import { handlePickerClick } from './pickers.js';
import {
  renderDashboard, renderBalance, renderExpenses,
  renderSubscriptions, renderHistory,
  setHistPreset, loadHistoryData, setModalOpeners,
} from './tabs.js';
import {
  initModalDismiss, openModal, closeModal,
  openExpenseModal, handleSelCat, saveExpense,
  openEditTxModal, handleSelEditCat, saveEditTx,
  openIncomeModal, saveIncome,
  openTransferModal, updateConvHint, saveTransfer,
  openAccModal, saveAccount, deleteAccount,
  openSubModal, onSubPeriodChange, saveSub, deleteSub, chargeSub, toggleSub,
  openCatModal, saveCat, deleteCat,
  openChartDetail,
  savePlanned, receivePlanned, deletePlanned,
  deleteTx, saveSettings,
  openBudgetsModal, saveBudgets,
  moveAccount,
} from './modals.js';

// ─── WIRE MODAL OPENERS INTO TABS MODULE ────────────────────
setModalOpeners({
  openAccModal, openSubModal, openCatModal,
  openIncomeModal, openTransferModal, openChartDetail, openBudgetsModal,
});

// ─── EXPOSE GLOBALS FOR MODALS ───────────────────────────────
window.__modals = { openModal, closeModal };

// ─── TAB RENDER DISPATCH ─────────────────────────────────────
async function renderTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab-item').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tab}`));
  // Scroll tab content to top on every switch
  const activeTab = document.getElementById(`tab-${tab}`);
  if (activeTab) activeTab.parentElement.scrollTop = 0;

  switch (tab) {
    case 'dashboard':     await renderDashboard();     break;
    case 'balance':       await renderBalance();       break;
    case 'expenses':      await renderExpenses();      break;
    case 'subscriptions': await renderSubscriptions(); break;
    case 'history':             renderHistory();       break;
  }
}

// Expose for use from modals / tabs
window.__renderCurrentTab = () => renderTab(S.tab);
window.__renderTab = tab => renderTab(tab);

// Header buttons delegate here after module loads
window.__transferModalFn = openTransferModal;
window.__incomeModalFn   = openIncomeModal;

// ─── GLOBAL EVENT DELEGATION ─────────────────────────────────
document.addEventListener('click', async e => {
  const target = e.target;

  // Picker clicks (icon / color)
  handlePickerClick(e);

  // ── data-action dispatch ──────────────────────────────────
  const el = target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  haptic();

  switch (action) {

    // Expense category select
    case 'sel-cat':       handleSelCat(el);       break;
    case 'sel-edit-cat':  handleSelEditCat(el);   break;

    // Transaction actions
    case 'del-tx': {
      const id = parseInt(el.dataset.id);
      if (confirm('Удалить транзакцию?')) await deleteTx(id);
      break;
    }
    case 'edit-tx': {
      await openEditTxModal(parseInt(el.dataset.id));
      break;
    }

    // Account actions
    case 'open-acc': openAccModal(parseInt(el.dataset.id)); break;
    case 'move-acc': await moveAccount(parseInt(el.dataset.id), el.dataset.dir); break;

    // Subscription actions
    case 'open-sub':    openSubModal(parseInt(el.dataset.id));       break;
    case 'toggle-sub':  await toggleSub(parseInt(el.dataset.id));    break;
    case 'charge-sub':  await chargeSub(parseInt(el.dataset.id), el); break;

    // Category actions
    case 'open-cat': openCatModal(parseInt(el.dataset.id)); break;
    case 'open-cat-detail': {
      const { catId, catName, catIcon, catColor, start, end } = el.dataset;
      await openChartDetail(parseInt(catId), catName, catIcon, catColor, start, end);
      break;
    }

    // Planned income
    case 'receive-planned': await receivePlanned(parseInt(el.dataset.id)); break;
    case 'del-planned':     await deletePlanned(parseInt(el.dataset.id));  break;

    // History preset
    case 'hist-preset': setHistPreset(parseInt(el.dataset.months)); break;

    // Account detail panel open
    case 'open-acc-detail': openAccModal(parseInt(el.dataset.id)); break;
  }
});

// ─── MODAL BUTTON WIRING ─────────────────────────────────────
function wireBtn(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

// Expense modal
wireBtn('btn-open-expense',      openExpenseModal);
wireBtn('btn-save-expense',      saveExpense);

// Edit-tx modal
wireBtn('btn-save-edit-tx',      saveEditTx);

// Income modal
wireBtn('btn-open-income',       openIncomeModal);
wireBtn('btn-save-income',       saveIncome);

// Transfer modal
wireBtn('btn-save-transfer',     saveTransfer);
['t-from','t-to','t-amount'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', updateConvHint);
  if (el && id === 't-amount') el.addEventListener('input', updateConvHint);
});

// Account modal
wireBtn('btn-save-account',      saveAccount);
wireBtn('btn-del-account',       deleteAccount);
wireBtn('a-priority',            () => {
  S.accPriority = !S.accPriority;
  document.getElementById('a-priority').classList.toggle('on', S.accPriority);
});
wireBtn('a-reserve',             () => {
  S.accReserve = !S.accReserve;
  document.getElementById('a-reserve').classList.toggle('on', S.accReserve);
});

// Subscription modal
wireBtn('btn-save-sub',          saveSub);
wireBtn('btn-del-sub',           deleteSub);
wireBtn('s-period',              onSubPeriodChange);
const sPeriodEl = document.getElementById('s-period');
if (sPeriodEl) sPeriodEl.addEventListener('change', onSubPeriodChange);

// Category modal
wireBtn('btn-save-cat',          saveCat);
wireBtn('btn-del-cat',           deleteCat);

// Planned income modal
wireBtn('btn-save-planned',      savePlanned);

// Settings
wireBtn('btn-save-settings',     saveSettings);
wireBtn('btn-open-settings',     () => openModal('ov-settings'));

// Budget limits modal
wireBtn('btn-save-budgets',      saveBudgets);

// ─── FAB BUTTONS ─────────────────────────────────────────────
wireBtn('fab-expense', openExpenseModal);
wireBtn('fab-income',  openIncomeModal);

// ─── TABS ────────────────────────────────────────────────────
document.querySelectorAll('.tab-item').forEach(item => {
  item.addEventListener('click', () => {
    haptic();
    renderTab(item.dataset.tab);
  });
});

// ─── MODAL DISMISS ───────────────────────────────────────────
initModalDismiss();

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const open = document.querySelector('.overlay.show');
    if (open) closeModal(open.id);
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    const open = document.querySelector('.overlay.show');
    if (!open) return;
    const active = document.activeElement;
    // Don't trigger on textareas
    if (active && active.tagName === 'TEXTAREA') return;
    // Try to find the primary save button in open modal
    const saveBtn = open.querySelector('.btn-primary');
    if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBtn.click(); }
  }
});

// ─── BOOT ────────────────────────────────────────────────────
(async () => {
  await loadAll();
  await renderTab('dashboard');
})();
