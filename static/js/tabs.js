// ─── tabs.js — shared barrel ──────────────────────────────
// Modal opener variables — set by app.js via setModalOpeners()
// Each tab file imports these as live bindings (ES module live export).
export let openAccModal, openSubModal, openCatModal, openIncomeModal, openTransferModal,
           openChartDetail, openBudgetsModal;

export function setModalOpeners(m) {
  ({ openAccModal, openSubModal, openCatModal, openIncomeModal,
     openTransferModal, openChartDetail, openBudgetsModal } = m);
}

// ─── SKELETON HELPERS ─────────────────────────────────────
export const sk = (h = 18, w = '100%', r = 8) =>
  `<div class="sk" style="height:${h}px;width:${w};border-radius:${r}px"></div>`;
export const skCard = (rows = 2) =>
  `<div class="card" style="display:flex;flex-direction:column;gap:10px;padding:16px">
  ${sk(26, '55%', 6)}${Array(rows - 1).fill(sk(14, '80%')).join('')}</div>`;
export const skSection = (n = 3) => Array(n).fill(skCard()).join('');

// ─── RE-EXPORTS (app.js imports from here) ────────────────
export { renderDashboard }    from './tab-dashboard.js';
export { renderBalance }      from './tab-balance.js';
export { renderExpenses }     from './tab-expenses.js';
export { renderSubscriptions } from './tab-subscriptions.js';
export { renderHistory, setHistPreset, loadHistoryData } from './tab-history.js';
