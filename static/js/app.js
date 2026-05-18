import { S } from './state.js';
import { loadAll, GET, GETC, haptic, reloadAccounts, reloadSubscriptions, bustTx, authLogin, authSetup, authLogout, authStatus, localAuth } from './api.js';
import { getCached } from './cache.js';
import { handlePickerClick, renderIconPicker, renderColorPicker } from './pickers.js';
import { ICONS_GOAL, ICONS_RECUR } from './config.js';
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
  openGoalModal, saveGoal, deleteGoal, openGoalDepositModal, saveGoalDeposit,
  openRecurModal, onRecurPeriodChange, handleSelRecurCat, saveRecur, deleteRecur, applyRecur, toggleRecur,
  openYearlyStats,
} from './modals.js';

// ─── WIRE MODAL OPENERS INTO TABS MODULE ────────────────────
setModalOpeners({
  openAccModal, openSubModal, openCatModal,
  openIncomeModal, openTransferModal, openChartDetail, openBudgetsModal,
});

// ─── EXPOSE GLOBALS ──────────────────────────────────────────
window.__modals         = {
  openModal, closeModal,
  openGoalModal, openGoalDepositModal,
  openRecurModal, applyRecur, toggleRecur,
  openYearlyStats,
};
window.__pickers        = { renderIconPicker, renderColorPicker };
window.__ICONS_GOAL     = ICONS_GOAL;
window.__ICONS_RECUR    = ICONS_RECUR;
window.__transferModalFn = openTransferModal;
window.__incomeModalFn   = openIncomeModal;

// ─── TAB KEEP-ALIVE ──────────────────────────────────────────
// Avoid re-rendering a tab if it was rendered < TAB_TTL ms ago
const TAB_TTL        = 28_000;   // ms — slightly less than cache TTL
const tabLastRender  = {};
const TAB_RENDERERS  = {
  dashboard:     renderDashboard,
  balance:       renderBalance,
  expenses:      renderExpenses,
  subscriptions: renderSubscriptions,
  history:       renderHistory,
};

// Force next render even if keep-alive says "fresh"
export function invalidateTab(...tabs) {
  tabs.forEach(t => { tabLastRender[t] = 0; });
}
window.__invalidateTab = invalidateTab;

// ─── TAB RENDER DISPATCH ─────────────────────────────────────
async function renderTab(tab, force = false) {
  const now  = Date.now();
  const stale = now - (tabLastRender[tab] || 0) > TAB_TTL;

  // Switch nav + visibility immediately (no await = instant)
  S.tab = tab;
  document.querySelectorAll('.tab-item').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tab}`));

  // Scroll main content area to top
  const mainEl = document.getElementById('main');
  if (mainEl) mainEl.scrollTop = 0;

  // Skip heavy re-render if tab is fresh and has content
  const contentEl = document.getElementById(`tab-${tab}`);
  const hasContent = contentEl && contentEl.firstElementChild?.children.length > 0;

  if (!force && !stale && hasContent && tab !== 'history') return;

  tabLastRender[tab] = now;
  await TAB_RENDERERS[tab]?.();
}

window.__renderCurrentTab = (force) => renderTab(S.tab, force);
window.__S = S;
window.__loadHistoryData = () => loadHistoryData();
window.__renderTab        = (tab, force) => renderTab(tab, force);
// Force-render (called after mutations)
window.__forceRenderCurrentTab = () => renderTab(S.tab, true);

// ─── PREFETCH ON IDLE ────────────────────────────────────────
// After boot, fill the cache for all tabs while browser idles
function prefetchAll() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const m2      = String(m).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();   // правильный последний день месяца
  const start = `${y}-${m2}-01`, end = `${y}-${m2}-${lastDay}`;

  // Fire-and-forget — just warm the cache
  GETC(`/api/stats/monthly?year=${y}&month=${m}`);
  GETC('/api/stats/comparison');
  GETC(`/api/transactions?type=expense&start_date=${start}&end_date=${end}&limit=200`);
  GETC(`/api/budget-limits?year=${y}&month=${m}`);
}

// ─── ANIMATED NUMBER COUNTER ────────────────────────────────
// Smooth count-up animation for numeric elements
export function animateCount(el, fromVal, toVal, duration = 550) {
  if (!el || fromVal === toVal) return;
  const startTime = performance.now();
  const diff = toVal - fromVal;
  const fmt  = n => Math.round(Math.abs(n)).toLocaleString('ru-RU');
  const sign = toVal < 0 ? '−' : '';

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    // easeOutExpo
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    const current = fromVal + diff * eased;
    el.textContent = sign + fmt(current) + ' ₽';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
window.__animateCount = animateCount;

// ─── GLOBAL EVENT DELEGATION ─────────────────────────────────
document.addEventListener('click', async e => {
  handlePickerClick(e);

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  haptic();

  switch (action) {
    case 'sel-cat':       handleSelCat(el);       break;
    case 'sel-edit-cat':  handleSelEditCat(el);   break;

    case 'del-tx': {
      const id = parseInt(el.dataset.id);
      if (confirm('Удалить транзакцию?')) await deleteTx(id);
      break;
    }
    case 'edit-tx':       await openEditTxModal(parseInt(el.dataset.id)); break;

    case 'open-acc':      openAccModal(parseInt(el.dataset.id));          break;
    case 'move-acc':      await moveAccount(parseInt(el.dataset.id), el.dataset.dir); break;

    case 'open-sub':      openSubModal(parseInt(el.dataset.id));          break;
    case 'toggle-sub':    await toggleSub(parseInt(el.dataset.id));       break;
    case 'charge-sub':    await chargeSub(parseInt(el.dataset.id), el);   break;

    case 'open-cat':      openCatModal(parseInt(el.dataset.id));          break;
    case 'open-cat-detail': {
      const { catId, catName, catIcon, catColor, start, end } = el.dataset;
      await openChartDetail(parseInt(catId), catName, catIcon, catColor, start, end);
      break;
    }

    case 'receive-planned': await receivePlanned(parseInt(el.dataset.id)); break;
    case 'del-planned':     await deletePlanned(parseInt(el.dataset.id));  break;

    case 'hist-preset':   setHistPreset(parseInt(el.dataset.months));     break;
    case 'open-acc-detail': openAccModal(parseInt(el.dataset.id));        break;

    case 'sel-recur-cat': handleSelRecurCat(el); break;
  }
});

// ─── MODAL BUTTON WIRING ─────────────────────────────────────
function wireBtn(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

wireBtn('btn-open-expense',  openExpenseModal);
wireBtn('btn-save-expense',  saveExpense);
wireBtn('btn-save-edit-tx',  saveEditTx);
wireBtn('btn-open-income',   openIncomeModal);
wireBtn('btn-save-income',   saveIncome);
wireBtn('btn-save-transfer', saveTransfer);

['t-from','t-to','t-amount'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', updateConvHint);
  if (el && id === 't-amount') el.addEventListener('input', updateConvHint);
});

wireBtn('btn-save-account', saveAccount);
wireBtn('btn-del-account',  deleteAccount);
wireBtn('a-priority', () => {
  S.accPriority = !S.accPriority;
  document.getElementById('a-priority').classList.toggle('on', S.accPriority);
});
wireBtn('a-reserve', () => {
  S.accReserve = !S.accReserve;
  document.getElementById('a-reserve').classList.toggle('on', S.accReserve);
});

wireBtn('btn-save-sub',  saveSub);
wireBtn('btn-del-sub',   deleteSub);
const sPeriodEl = document.getElementById('s-period');
if (sPeriodEl) sPeriodEl.addEventListener('change', onSubPeriodChange);

wireBtn('btn-save-cat',       saveCat);
wireBtn('btn-del-cat',        deleteCat);
wireBtn('btn-save-planned',   savePlanned);
wireBtn('btn-save-settings',  saveSettings);
wireBtn('btn-open-settings',  () => openModal('ov-settings'));
wireBtn('btn-logout', async () => {
  if (!confirm('Выйти из аккаунта?')) return;
  await authLogout();
  // Перезагружаем страницу — покажется экран входа
  window.location.reload();
});
wireBtn('btn-save-budgets',   saveBudgets);
wireBtn('btn-save-goal',      saveGoal);
wireBtn('btn-del-goal',       deleteGoal);
wireBtn('btn-save-goal-deposit', saveGoalDeposit);
wireBtn('btn-save-recur',     saveRecur);
wireBtn('btn-del-recur',      deleteRecur);
wireBtn('fab-expense',        openExpenseModal);
wireBtn('fab-income',         openIncomeModal);
const rPeriodEl = document.getElementById('r-period');
if (rPeriodEl) rPeriodEl.addEventListener('change', onRecurPeriodChange);

// ─── TABS ────────────────────────────────────────────────────
document.querySelectorAll('.tab-item').forEach(item => {
  item.addEventListener('click', () => {
    haptic();
    renderTab(item.dataset.tab);
  });
});

// ─── MODAL DISMISS ───────────────────────────────────────────
initModalDismiss();

// ─── VOICE INPUT ─────────────────────────────────────────────
(function initVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return; // Browser doesn't support — buttons just won't appear

  let activeRecog = null;

  document.addEventListener('click', e => {
    const btn = e.target.closest('.voice-btn');
    if (!btn) return;

    // If already listening — stop
    if (activeRecog) {
      activeRecog.stop();
      activeRecog = null;
      document.querySelectorAll('.voice-btn.listening').forEach(b => b.classList.remove('listening'));
      return;
    }

    const targetId = btn.dataset.target;
    const textarea = document.getElementById(targetId);
    if (!textarea) return;

    haptic();

    const recog = new SR();
    recog.lang = 'ru-RU';
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      btn.classList.add('listening');
      btn.textContent = '⏹';
      activeRecog = recog;
    };

    recog.onresult = e => {
      const text = e.results[0][0].transcript;
      // Append to existing text, or set if empty
      textarea.value = textarea.value
        ? textarea.value + ' ' + text
        : text;
      haptic('success');
    };

    recog.onerror = err => {
      if (err.error === 'not-allowed') {
        alert('Нет доступа к микрофону. Разреши в настройках браузера.');
      }
    };

    recog.onend = () => {
      btn.classList.remove('listening');
      btn.textContent = '🎤';
      activeRecog = null;
    };

    recog.start();
  });
})();

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const open = document.querySelector('.overlay.show');
    if (open) closeModal(open.id);
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    const open = document.querySelector('.overlay.show');
    if (!open) return;
    if (document.activeElement?.tagName === 'TEXTAREA') return;
    const saveBtn = open.querySelector('.btn-primary');
    if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBtn.click(); }
  }
});

// ─── AUTH SCREEN ─────────────────────────────────────────────
// ─── AUTH SCREEN STYLES ──────────────────────────────────────
(function injectAuthStyles() {
  if (document.getElementById('auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-styles';
  s.textContent = `
    @keyframes auth-float-in {
      from { opacity:0; transform:translateY(28px) scale(.97); }
      to   { opacity:1; transform:translateY(0)    scale(1);   }
    }
    @keyframes auth-fade-in {
      from { opacity:0; } to { opacity:1; }
    }
    @keyframes auth-orb-pulse {
      0%,100% { transform:scale(1)   translateY(0);   opacity:.55; }
      50%      { transform:scale(1.1) translateY(-8px); opacity:.8;  }
    }
    @keyframes auth-orb2-pulse {
      0%,100% { transform:scale(1)   translateY(0);   opacity:.4; }
      50%      { transform:scale(1.08) translateY(6px); opacity:.65; }
    }
    @keyframes auth-spin {
      to { transform:rotate(360deg); }
    }
    @keyframes auth-shimmer {
      0%   { background-position:200% center; }
      100% { background-position:-200% center; }
    }
    @keyframes auth-bar {
      0%   { width:0%;   opacity:.9; }
      60%  { width:75%;  opacity:1;  }
      100% { width:100%; opacity:0;  }
    }
    @keyframes auth-check-draw {
      from { stroke-dashoffset:40; }
      to   { stroke-dashoffset:0;  }
    }

    #auth-screen {
      position:fixed;inset:0;z-index:9999;
      background:#0f0f1a;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      padding:24px;
      overflow:hidden;
    }

    /* Декоративные орбы */
    .auth-orb {
      position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none;
    }
    .auth-orb-1 {
      width:280px;height:280px;
      background:radial-gradient(circle, rgba(99,102,241,.35) 0%, transparent 70%);
      top:-60px;left:-60px;
      animation:auth-orb-pulse 6s ease-in-out infinite;
    }
    .auth-orb-2 {
      width:220px;height:220px;
      background:radial-gradient(circle, rgba(139,92,246,.3) 0%, transparent 70%);
      bottom:-40px;right:-40px;
      animation:auth-orb2-pulse 8s ease-in-out infinite;
    }
    .auth-orb-3 {
      width:140px;height:140px;
      background:radial-gradient(circle, rgba(99,102,241,.2) 0%, transparent 70%);
      bottom:30%;left:10%;
      animation:auth-orb-pulse 10s ease-in-out infinite reverse;
    }

    /* Сетка-точки (тонкая) */
    #auth-screen::before {
      content:'';position:absolute;inset:0;
      background-image:radial-gradient(circle, rgba(99,102,241,.12) 1px, transparent 1px);
      background-size:32px 32px;
      pointer-events:none;
    }

    /* Карточка формы */
    .auth-card {
      position:relative;z-index:1;
      width:100%;max-width:360px;
      background:rgba(26,26,46,.8);
      border:1px solid rgba(99,102,241,.2);
      border-radius:20px;
      padding:32px 28px;
      backdrop-filter:blur(20px);
      animation:auth-float-in .5s cubic-bezier(.22,.68,0,1.2) both;
    }

    /* Логотип */
    .auth-logo-wrap {
      display:flex;flex-direction:column;align-items:center;margin-bottom:28px;
      animation:auth-float-in .5s cubic-bezier(.22,.68,0,1.2) .05s both;
    }
    .auth-logo-ring {
      width:64px;height:64px;border-radius:18px;
      background:linear-gradient(135deg,rgba(99,102,241,.3),rgba(139,92,246,.3));
      border:1px solid rgba(99,102,241,.4);
      display:flex;align-items:center;justify-content:center;
      font-size:30px;margin-bottom:14px;
      box-shadow:0 0 24px rgba(99,102,241,.25);
    }
    .auth-title {
      font-size:22px;font-weight:700;color:#e2e8f0;letter-spacing:-.3px;
    }
    .auth-subtitle {
      font-size:13px;color:#64748b;margin-top:4px;text-align:center;
    }

    /* Поля ввода */
    .auth-field {
      position:relative;margin-bottom:12px;
      animation:auth-float-in .45s cubic-bezier(.22,.68,0,1.2) both;
    }
    .auth-field:nth-child(1) { animation-delay:.1s; }
    .auth-field:nth-child(2) { animation-delay:.16s; }

    .auth-input-icon {
      position:absolute;left:13px;top:50%;transform:translateY(-50%);
      font-size:17px;color:#64748b;pointer-events:none;transition:color .2s;
    }
    .auth-input {
      width:100%;background:rgba(15,15,26,.6);
      border:1px solid rgba(99,102,241,.18);
      border-radius:12px;padding:13px 15px 13px 40px;
      font-size:15px;color:#e2e8f0;outline:none;
      font-family:inherit;transition:border-color .2s,box-shadow .2s;
      -webkit-appearance:none;box-sizing:border-box;
    }
    .auth-input::placeholder { color:#64748b; }
    .auth-input:focus {
      border-color:rgba(99,102,241,.6);
      box-shadow:0 0 0 3px rgba(99,102,241,.12);
    }
    .auth-input:focus + .auth-input-icon { color:#6366f1; }

    /* Кнопка */
    .auth-btn {
      width:100%;padding:14px;border:none;border-radius:12px;
      background:linear-gradient(135deg,#6366f1,#818cf8);
      color:#fff;font-size:16px;font-weight:700;cursor:pointer;
      transition:opacity .15s,transform .1s;
      margin-top:4px;margin-bottom:12px;
      font-family:inherit;letter-spacing:-.2px;
      box-shadow:0 4px 16px rgba(99,102,241,.35);
      animation:auth-float-in .45s cubic-bezier(.22,.68,0,1.2) .22s both;
    }
    .auth-btn:active { opacity:.85;transform:scale(.98); }
    .auth-btn:disabled { opacity:.5;cursor:not-allowed;transform:none; }

    /* Переключатель режима */
    .auth-toggle-wrap {
      text-align:center;
      animation:auth-float-in .45s cubic-bezier(.22,.68,0,1.2) .28s both;
    }
    .auth-toggle-btn {
      background:none;border:none;color:#64748b;
      font-size:13px;cursor:pointer;
      font-family:inherit;
      transition:color .2s;
    }
    .auth-toggle-btn:hover { color:#a5b4fc; }

    /* Ошибка */
    .auth-error {
      display:none;
      background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.22);
      border-radius:10px;padding:10px 14px;margin-bottom:14px;
      color:#f87171;font-size:13px;text-align:center;
    }

    /* ── Экран загрузки ─────────────────────────────── */
    #auth-loading {
      position:fixed;inset:0;z-index:10000;
      background:#0f0f1a;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:0;
      animation:auth-fade-in .25s ease both;
      overflow:hidden;
    }
    #auth-loading::before {
      content:'';position:absolute;inset:0;
      background-image:radial-gradient(circle, rgba(99,102,241,.1) 1px, transparent 1px);
      background-size:32px 32px;pointer-events:none;
    }
    .auth-loading-orb1 {
      position:absolute;width:350px;height:350px;border-radius:50%;
      background:radial-gradient(circle, rgba(99,102,241,.28) 0%, transparent 65%);
      filter:blur(50px);top:-80px;left:-80px;
      animation:auth-orb-pulse 5s ease-in-out infinite;
    }
    .auth-loading-orb2 {
      position:absolute;width:260px;height:260px;border-radius:50%;
      background:radial-gradient(circle, rgba(139,92,246,.22) 0%, transparent 65%);
      filter:blur(40px);bottom:-50px;right:-50px;
      animation:auth-orb2-pulse 7s ease-in-out infinite;
    }

    .auth-loading-logo {
      position:relative;z-index:1;
      width:80px;height:80px;border-radius:22px;
      background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.25));
      border:1px solid rgba(99,102,241,.3);
      display:flex;align-items:center;justify-content:center;
      font-size:38px;margin-bottom:28px;
      box-shadow:0 0 32px rgba(99,102,241,.2);
      animation:auth-float-in .5s cubic-bezier(.22,.68,0,1.2) both;
    }
    .auth-loading-title {
      position:relative;z-index:1;
      font-size:20px;font-weight:700;
      background:linear-gradient(90deg,#818cf8,#e2e8f0,#818cf8);
      background-size:200% auto;
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      background-clip:text;
      animation:auth-shimmer 2.5s linear infinite,auth-float-in .5s cubic-bezier(.22,.68,0,1.2) .05s both;
      margin-bottom:8px;letter-spacing:-.3px;
    }
    .auth-loading-sub {
      position:relative;z-index:1;
      font-size:13px;color:#64748b;margin-bottom:36px;
      animation:auth-float-in .5s ease .12s both;
    }
    .auth-loading-bar-wrap {
      position:relative;z-index:1;
      width:180px;height:3px;background:rgba(99,102,241,.12);
      border-radius:99px;overflow:hidden;margin-bottom:28px;
    }
    .auth-loading-bar {
      height:100%;
      background:linear-gradient(90deg,#6366f1,#818cf8,#6366f1);
      background-size:200% 100%;
      border-radius:99px;
      animation:auth-bar 2.2s cubic-bezier(.4,0,.2,1) forwards,
                auth-shimmer 1.2s linear infinite;
    }
    .auth-loading-dots {
      position:relative;z-index:1;
      display:flex;gap:6px;
    }
    .auth-loading-dots span {
      width:6px;height:6px;border-radius:50%;
      background:#6366f1;opacity:.3;
      animation:auth-orb-pulse 1.2s ease-in-out infinite;
    }
    .auth-loading-dots span:nth-child(2) { animation-delay:.2s; }
    .auth-loading-dots span:nth-child(3) { animation-delay:.4s; }
  `;
  document.head.appendChild(s);
})();

function buildAuthScreen(mode = 'login') {
  return `
  <div id="auth-screen">
    <div class="auth-orb auth-orb-1"></div>
    <div class="auth-orb auth-orb-2"></div>
    <div class="auth-orb auth-orb-3"></div>

    <div class="auth-card">
      <div class="auth-logo-wrap">
        <div class="auth-logo-ring">💰</div>
        <div class="auth-title">Финансы</div>
        <div class="auth-subtitle">
          ${mode === 'setup' ? 'Создайте аккаунт для входа' : 'Войдите в свой аккаунт'}
        </div>
      </div>

      <div id="auth-error" class="auth-error"></div>

      <div style="display:flex;flex-direction:column">
        <div class="auth-field">
          <input id="auth-username" class="auth-input" type="text"
            autocomplete="username" placeholder="Логин">
          <span class="auth-input-icon">👤</span>
        </div>
        <div class="auth-field">
          <input id="auth-password" class="auth-input" type="password"
            autocomplete="${mode === 'setup' ? 'new-password' : 'current-password'}"
            placeholder="Пароль${mode === 'setup' ? ' (мин. 6 символов)' : ''}">
          <span class="auth-input-icon">🔒</span>
        </div>
      </div>

      <button id="auth-submit" class="auth-btn">
        ${mode === 'setup' ? 'Создать аккаунт' : 'Войти'}
      </button>

      <div class="auth-toggle-wrap">
        <button id="auth-toggle" class="auth-toggle-btn">
          ${mode === 'setup' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
        </button>
      </div>
    </div>
  </div>`;
}

function showLoadingScreen() {
  const el = document.createElement('div');
  el.id = 'auth-loading';
  el.innerHTML = `
    <div class="auth-loading-orb1"></div>
    <div class="auth-loading-orb2"></div>
    <div class="auth-loading-logo">💰</div>
    <div class="auth-loading-title">Загружаем данные</div>
    <div class="auth-loading-sub">Это займёт секунду…</div>
    <div class="auth-loading-bar-wrap">
      <div class="auth-loading-bar"></div>
    </div>
    <div class="auth-loading-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function showAuthScreen(mode = 'login') {
  // Убираем старый экран если есть
  document.getElementById('auth-screen')?.remove();
  document.body.insertAdjacentHTML('beforeend', buildAuthScreen(mode));

  const submitBtn = document.getElementById('auth-submit');
  const toggleBtn = document.getElementById('auth-toggle');
  const errBox    = document.getElementById('auth-error');
  const usernameI = document.getElementById('auth-username');
  const passwordI = document.getElementById('auth-password');

  function showErr(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }

  async function submit() {
    const username = usernameI.value.trim();
    const password = passwordI.value.trim();
    if (!username || !password) { showErr('Заполните все поля'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Проверяем…';
    errBox.style.display = 'none';

    const fn   = mode === 'setup' ? authSetup : authLogin;
    const data = await fn(username, password);

    if (data.error) {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'setup' ? 'Создать аккаунт' : 'Войти';
      showErr(data.error);
      return;
    }

    // Успех — показываем красивый экран загрузки
    localAuth.token = data.token;
    document.getElementById('auth-screen').remove();
    showLoadingScreen();
    await bootApp();
    document.getElementById('auth-loading')?.remove();
  }

  submitBtn.onclick = submit;
  passwordI.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  toggleBtn.onclick = () => showAuthScreen(mode === 'setup' ? 'login' : 'setup');

  // Глобальный хук — вызывается из api.js при 401
  window.__showAuthScreen = () => showAuthScreen('login');
}

// ─── OFFLINE BANNER ──────────────────────────────────────────
function showOfflineBanner() {
  if (document.getElementById('offline-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.innerHTML = `
    <span>📵 Офлайн — данные могут быть устаревшими</span>
    <button onclick="location.reload()" id="offline-retry-btn">Обновить</button>
  `;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    background: '#92400e',
    color: '#fef3c7',
    padding: '8px 16px',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    zIndex: '9998',
    boxShadow: '0 2px 8px rgba(0,0,0,.3)',
  });
  const btn = banner.querySelector('#offline-retry-btn');
  Object.assign(btn.style, {
    padding: '4px 14px',
    borderRadius: '16px',
    border: 'none',
    background: '#fef3c7',
    color: '#92400e',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: '0',
  });
  document.body.prepend(banner);
  // Сдвигаем контент вниз, чтобы баннер не перекрывал шапку
  document.documentElement.style.setProperty('--offline-banner-h', '37px');
}

function hideOfflineBanner() {
  const b = document.getElementById('offline-banner');
  if (b) b.remove();
  document.documentElement.style.removeProperty('--offline-banner-h');
}

// Слушаем события сети
window.addEventListener('online', () => {
  if (S._offline) {
    // Сеть вернулась — перезагружаемся, чтобы получить свежие данные
    hideOfflineBanner();
    location.reload();
  }
});
window.addEventListener('offline', () => {
  if (!S._offline) showOfflineBanner();
});

// ─── BOOT ────────────────────────────────────────────────────
async function bootApp() {
  // 1. Загружаем все базовые данные (один bootstrap-запрос или офлайн-кэш)
  try {
    await loadAll();
  } catch (err) {
    console.error('bootApp: loadAll failed', err);
    // Нет данных даже в офлайн-кэше
    const t = document.createElement('div');
    t.innerHTML = '❌ Нет данных. Подключитесь к сети. <button onclick="location.reload()" style="margin-left:8px;padding:4px 14px;border-radius:16px;border:none;background:#fff;color:#ef4444;font-size:13px;cursor:pointer">Повторить</button>';
    Object.assign(t.style, {position:'fixed',bottom:'80px',left:'50%',transform:'translateX(-50%)',background:'#ef4444',color:'#fff',padding:'10px 18px',borderRadius:'12px',fontSize:'13px',zIndex:'9999',boxShadow:'0 4px 12px rgba(0,0,0,.3)',textAlign:'center',whiteSpace:'nowrap'});
    document.body.appendChild(t);
    return;
  }

  // Показываем баннер офлайн-режима, если данные взяты из кэша
  if (S._offline) showOfflineBanner();

  // 2. Рендерим дашборд через renderTab (корректно ставит активную вкладку)
  await renderTab('dashboard');

  // 4. Тихий pre-render баланса и подписок БЕЗ переключения вкладки.
  //    Вызываем рендереры напрямую — S уже заполнен loadAll(), рендер мгновенный.
  //    renderTab() нельзя — он меняет S.tab и active-классы, ломая навигацию.
  try {
    await renderBalance();
    tabLastRender['balance'] = Date.now();
  } catch (e) { console.warn('pre-render balance', e); }

  try {
    await renderSubscriptions();
    tabLastRender['subscriptions'] = Date.now();
  } catch (e) { console.warn('pre-render subscriptions', e); }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchAll, { timeout: 2500 });
  } else {
    setTimeout(prefetchAll, 1500);
  }
}

(async () => {
  // Всегда вешаем глобальный хук — на случай протухшего токена в середине сессии
  window.__showAuthScreen = () => showAuthScreen('login');

  const tgHasData = !!window.Telegram?.WebApp?.initData;

  if (tgHasData) {
    // Внутри Telegram — авторизация через initData, экран входа не нужен
    const _ld = showLoadingScreen();
    await bootApp();
    _ld.remove();
    return;
  }

  if (localAuth.token) {
    // Есть сохранённый токен — пробуем сразу загрузить
    // api.js сам вызовет __showAuthScreen если 401
    const _ld = showLoadingScreen();
    await bootApp();
    _ld.remove();
    return;
  }

  // Нет токена — смотрим, есть ли уже хоть один пользователь
  const status = await authStatus().catch(() => ({ telegram: false, local_auth_configured: false }));

  if (status.telegram && !tgHasData) {
    // BOT_TOKEN настроен но открыто вне Telegram — показываем пояснение
    showAuthScreen('login');
    return;
  }

  // Показываем нужный экран
  showAuthScreen(status.local_auth_configured ? 'login' : 'setup');
})();


