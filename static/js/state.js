// ─── STATE ──────────────────────────────────────────────────
export const S = {
  tab: 'dashboard',
  accounts: [], categories: [], subscriptions: [], planned: [],
  usdRate: 90,
  expYear:  new Date().getFullYear(),
  expMonth: new Date().getMonth() + 1,
  histStart: '', histEnd: '', histSearch: '', histOffset: 0, histTxs: [],
  selCatId: null,
  editAccId: null, editSubId: null, editCatId: null, editTxId: null, editTxFromId: null,
  accPriority: false, accReserve: false, accIcon: '💰', accColor: '#6366f1',
  subIcon: '🔔',  subColor: '#6366f1',
  catIcon: '📦',  catColor: '#6366f1',
  txCatId: null,  // used by tx-edit modal
};

// ─── FORMATTERS ─────────────────────────────────────────────
export const fmt     = (n, d = 0) => Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtRub  = n => fmt(n) + ' ₽';
export const toRub   = (a, c) => c === 'USD' ? a * S.usdRate : a;
export const today   = () => new Date().toISOString().slice(0, 10);
export const fmtDate = d => {
  if (!d) return '';
  const [, m, day] = d.split('-');
  const MONTHS_GEN = ['','января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${day} ${MONTHS_GEN[+m]}`;
};
export const daysUntil = d => d ? Math.round((new Date(d) - new Date(today())) / 864e5) : null;

// ─── BALANCE HELPERS ─────────────────────────────────────────
export const activeBalance = () =>
  S.accounts.filter(a => !a.is_reserve).reduce((s, a) => s + toRub(a.balance, a.currency), 0);
export const totalBalance = () =>
  S.accounts.reduce((s, a) => s + toRub(a.balance, a.currency), 0);
export const hasReserve = () =>
  S.accounts.some(a => a.is_reserve);

// ─── LOADING HELPER ─────────────────────────────────────────
export async function withLoading(btnId, fn) {
  const btn  = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try { await fn(); }
  finally { btn.disabled = false; btn.textContent = orig; }
}
