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
function buildAuthScreen(mode = 'login') {
  return `
  <div id="auth-screen" style="
    position:fixed;inset:0;z-index:9999;
    background:var(--bg);
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    padding:24px;
  ">
    <div style="width:100%;max-width:360px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:52px;margin-bottom:10px">💰</div>
        <div style="font-size:22px;font-weight:700">Финансы</div>
        <div style="font-size:13px;color:var(--hint);margin-top:4px">
          ${mode === 'setup' ? 'Создайте аккаунт для входа' : 'Войдите в свой аккаунт'}
        </div>
      </div>

      <div id="auth-error" style="
        display:none;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);
        border-radius:10px;padding:10px 14px;margin-bottom:14px;
        color:#f87171;font-size:13px;text-align:center;
      "></div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <input id="auth-username" type="text" autocomplete="username"
          placeholder="Логин" style="
          background:var(--surface);border:1px solid var(--border);
          border-radius:12px;padding:13px 15px;
          font-size:16px;color:var(--text);width:100%;outline:none;
          font-family:inherit;
        ">
        <input id="auth-password" type="password" autocomplete="${mode === 'setup' ? 'new-password' : 'current-password'}"
          placeholder="Пароль${mode === 'setup' ? ' (минимум 6 символов)' : ''}" style="
          background:var(--surface);border:1px solid var(--border);
          border-radius:12px;padding:13px 15px;
          font-size:16px;color:var(--text);width:100%;outline:none;
          font-family:inherit;
        ">
      </div>

      <button id="auth-submit" style="
        width:100%;padding:14px;border:none;border-radius:12px;
        background:var(--accent);color:#fff;
        font-size:16px;font-weight:700;cursor:pointer;
        transition:opacity .15s;margin-bottom:12px;
      ">
        ${mode === 'setup' ? 'Создать аккаунт' : 'Войти'}
      </button>

      <div style="text-align:center">
        <button id="auth-toggle" style="
          background:none;border:none;color:var(--hint);
          font-size:13px;cursor:pointer;text-decoration:underline;
        ">
          ${mode === 'setup' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
        </button>
      </div>
    </div>
  </div>`;
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
    submitBtn.textContent = '...';
    errBox.style.display = 'none';

    const fn   = mode === 'setup' ? authSetup : authLogin;
    const data = await fn(username, password);

    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'setup' ? 'Создать аккаунт' : 'Войти';

    if (data.error) { showErr(data.error); return; }

    // Успех — показываем состояние загрузки прямо на экране входа
    submitBtn.disabled = true;
    submitBtn.textContent = 'Загружаем…';
    errBox.style.display = 'none';
    usernameI.disabled = true;
    passwordI.disabled = true;

    // Сохраняем токен и загружаем приложение
    localAuth.token = data.token;
    document.getElementById('auth-screen').remove();
    await bootApp();
  }

  submitBtn.onclick = submit;
  passwordI.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  toggleBtn.onclick = () => showAuthScreen(mode === 'setup' ? 'login' : 'setup');

  // Глобальный хук — вызывается из api.js при 401
  window.__showAuthScreen = () => showAuthScreen('login');
}

// ─── BOOT ────────────────────────────────────────────────────
async function bootApp() {
  // 1. Загружаем все базовые данные (один bootstrap-запрос)
  try {
    await loadAll();
  } catch (err) {
    console.error('bootApp: loadAll failed', err);
    // Show error toast
    const t = document.createElement('div');
    t.innerHTML = '❌ Не удалось загрузить данные. <button onclick="location.reload()" style="margin-left:8px;padding:4px 14px;border-radius:16px;border:none;background:#fff;color:#ef4444;font-size:13px;cursor:pointer">Повторить</button>';
    Object.assign(t.style, {position:'fixed',bottom:'80px',left:'50%',transform:'translateX(-50%)',background:'#ef4444',color:'#fff',padding:'10px 18px',borderRadius:'12px',fontSize:'13px',zIndex:'9999',boxShadow:'0 4px 12px rgba(0,0,0,.3)',textAlign:'center',whiteSpace:'nowrap'});
    document.body.appendChild(t);
    return;
  }

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
    await bootApp();
    return;
  }

  if (localAuth.token) {
    // Есть сохранённый токен — пробуем сразу загрузить
    // api.js сам вызовет __showAuthScreen если 401
    await bootApp();
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


