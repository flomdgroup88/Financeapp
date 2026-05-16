// modals.js — точка входа, реэкспортирует всё из отдельных модулей.
// Ни один внешний файл менять не нужно — импорты из 'modals.js' продолжат работать.
//
// Структура:
//   modal-core.js          — toast, openModal, closeModal, initModalDismiss
//   modal-transactions.js  — расход, доход, перевод, редактирование, удаление
//   modal-accounts.js      — счета (добавить, редактировать, удалить, переместить)
//   modal-categories.js    — категории
//   modal-subscriptions.js — подписки + регулярные транзакции
//   modal-goals.js         — цели накоплений
//   modal-misc.js          — бюджеты, плановые доходы, настройки, графики, годовая статистика

export { showToast, openModal, closeModal, initModalDismiss } from './modal-core.js';

export {
  openExpenseModal, handleSelCat, saveExpense,
  openIncomeModal,  saveIncome,
  openTransferModal, updateConvHint, saveTransfer,
  openEditTxModal,  handleSelEditCat, saveEditTx,
  deleteTx,
} from './modal-transactions.js';

export {
  openAccModal, saveAccount, deleteAccount, moveAccount,
} from './modal-accounts.js';

export {
  openCatModal, saveCat, deleteCat,
} from './modal-categories.js';

export {
  onSubPeriodChange, openSubModal, saveSub, deleteSub, chargeSub, toggleSub,
  openRecurModal, onRecurPeriodChange, handleSelRecurCat, saveRecur, deleteRecur, applyRecur, toggleRecur,
} from './modal-subscriptions.js';

export {
  openGoalModal, saveGoal, deleteGoal,
  openGoalDepositModal, saveGoalDeposit,
} from './modal-goals.js';

export {
  saveSettings,
  openBudgetsModal, saveBudgets,
  savePlanned, receivePlanned, deletePlanned,
  openChartDetail,
  openYearlyStats,
} from './modal-misc.js';
