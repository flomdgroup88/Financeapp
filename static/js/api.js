import { S } from './state.js';
import { getCached, setCached, invalidate } from './cache.js';

// ─── TELEGRAM ───────────────────────────────────────────────
export const tg     = window.Telegram?.WebApp;
export const haptic = (t = 'light') => tg?.HapticFeedback?.impactOccurred(t);

// ─── SAFE AREA (работает и в Telegram, и в PWA) ─────────────
(function initSafeArea() {
  if (tg) {
    tg.expand();
    tg.disableVerticalSwipes?.();
    function applyTgSafeArea() {
      const top = tg.safeAreaInset?.top ?? tg.contentSafeAreaInset?.top ?? 0;
      if (top > 0) { document.documentElement.style.setProperty('--safe-t', top + 'px'); return true; }
      return false;
    }
    if (!applyTgSafeArea()) tg.onEvent?.('viewportChanged', applyTgSafeArea);
    return;
  }
  const probe = document.createElement('div');
  probe.style.cssText = ['position:fixed','top:0','left:0','width:0','height:0',
    'padding-top:env(safe-area-inset-top,0px)','pointer-events:none','visibility:hidden'].join(';');
  document.documentElement.appendChild(probe);
  const measured = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.documentElement.removeChild(probe);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  const safeTop = measured > 0 ? measured : (isStandalone ? 44 : 0);
  if (safeTop > 0) document.documentElement.style.setProperty('--safe-t', safeTop + 'px');
})();

const TG_INIT_DATA = tg?.initData || '';

// ─── ЛОКАЛЬНАЯ СЕССИЯ ────────────────────────────────────────
export const localAuth = {
  get token()  { return localStorage.getItem('fin_session_token') || ''; },
  set token(v) { if (v) localStorage.setItem('fin_session_token', v); else localStorage.removeItem('fin_session_token'); },
  clear()      { this.token = ''; },
};

// ─── TOAST HELPER ───────────────────────────────────────────
function showErrorToast(msg) {
  // Не показываем «Нет связи» если уже виден офлайн-баннер или устройство офлайн
  if (!navigator.onLine || document.getElementById('offline-banner')) return;
  const t = document.createElement('div');
  t.textContent = '⚠️ ' + msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
    background:'#ef4444', color:'#fff', padding:'10px 18px',
    borderRadius:'12px', fontSize:'13px', zIndex:9999,
    boxShadow:'0 4px 12px rgba(0,0,0,.3)', pointerEvents:'none',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── HTTP ───────────────────────────────────────────────────
const API = window.location.origin;

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TG_INIT_DATA)    headers['X-Telegram-Init-Data'] = TG_INIT_DATA;
  if (localAuth.token) headers['X-Session-Token']       = localAuth.token;
  try {
    const r = await fetch(API + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) {
      if (TG_INIT_DATA) { showErrorToast('Ошибка авторизации. Перезапустите приложение.'); throw new Error('401'); }
      localAuth.clear();
      window.__showAuthScreen?.();
      return {};
    }
    return r.json();
  } catch (err) {
    showErrorToast('Нет связи с сервером');
    console.error('API error:', method, path, err);
    return {};
  }
}

export const GET  = p      => req('GET',    p);
export const POST = (p, b) => req('POST',   p, b);
export const PUT  = (p, b) => req('PUT',    p, b);
export const DEL  = p      => req('DELETE', p);

// ─── AUTH API ───────────────────────────────────────────────
export async function authSetup(username, password) {
  const r = await fetch(`${API}/api/auth/setup`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username, password}) });
  return r.json();
}
export async function authLogin(username, password) {
  const r = await fetch(`${API}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username, password}) });
  return r.json();
}
export async function authLogout() {
  await fetch(`${API}/api/auth/logout`, { method:'POST', headers:{'Content-Type':'application/json','X-Session-Token':localAuth.token} });
  localAuth.clear();
}
export async function authStatus() {
  const r = await fetch(`${API}/api/auth/status`);
  return r.json();
}

// ─── CACHED GET (Stale-While-Revalidate) ────────────────────
// _swr: map debounceKey → timer — prevents cascade renders when
// multiple GETC calls share the same onUpdate callback.
const _swrTimers = new Map();

export async function GETC(path, onUpdate, debounceKey) {
  const cached = getCached(path);
  if (cached !== null) {
    GET(path).then(fresh => {
      const freshStr = JSON.stringify(fresh);
      if (freshStr !== JSON.stringify(cached)) {
        setCached(path, fresh);
        if (onUpdate) {
          if (debounceKey) {
            // Collapse multiple concurrent callbacks into one render
            clearTimeout(_swrTimers.get(debounceKey));
            _swrTimers.set(debounceKey, setTimeout(() => {
              _swrTimers.delete(debounceKey);
              onUpdate(fresh);
            }, 80));
          } else {
            onUpdate(fresh);
          }
        }
      }
    }).catch(() => {});
    return cached;
  }
  const data = await GET(path);
  setCached(path, data);
  return data;
}

// ─── CACHE INVALIDATION HELPERS ─────────────────────────────
export const bust      = (...prefixes) => invalidate(...prefixes);
export const bustTx    = () => bust('/api/transactions', '/api/stats', '/api/budget-limits', '/api/accounts');
export const bustAcc   = () => bust('/api/accounts');
export const bustSub   = () => bust('/api/subscriptions', '/api/accounts');
export const bustGoals = () => bust('/api/goals', '/api/accounts');
export const bustRecur = () => bust('/api/recurring', '/api/accounts', '/api/transactions', '/api/stats');

// ─── DATA LOADERS ───────────────────────────────────────────
const OFFLINE_CACHE_KEY = 'fin_offline_bootstrap';

function persistBootstrap(d) { try { localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(d)); } catch {} }
function loadCachedBootstrap() { try { const r = localStorage.getItem(OFFLINE_CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

// ─── КЭШ ИСТОРИИ ТРАНЗАКЦИЙ (для офлайн-доступа) ────────────
const HIST_CACHE_KEY = 'fin_hist_cache';
const HIST_CACHE_MAX = 15;    // максимум записей
const HIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

export function cacheHistoryResponse(urlKey, data) {
  try {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(HIST_CACHE_KEY) || '{}'); } catch {}
    // Удаляем старые записи если превышен лимит
    const keys = Object.keys(cache);
    if (keys.length >= HIST_CACHE_MAX) {
      const oldest = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))[0];
      delete cache[oldest];
    }
    cache[urlKey] = { data, ts: Date.now() };
    localStorage.setItem(HIST_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function getCachedHistoryResponse(urlKey) {
  try {
    const cache = JSON.parse(localStorage.getItem(HIST_CACHE_KEY) || '{}');
    const entry = cache[urlKey];
    if (!entry) return null;
    if (Date.now() - entry.ts > HIST_CACHE_TTL) return null;
    return entry.data;
  } catch { return null; }
}

// ─── ОФЛАЙН-ОЧЕРЕДЬ ОПЕРАЦИЙ ─────────────────────────────────
// Хранит все мутирующие операции: POST, PUT, DELETE
// Формат: { method, path, body, ts, id }

const OP_QUEUE_KEY = 'fin_op_queue';

export function getOpQueue() {
  try { return JSON.parse(localStorage.getItem(OP_QUEUE_KEY) || '[]'); } catch { return []; }
}

function saveOpQueue(q) { try { localStorage.setItem(OP_QUEUE_KEY, JSON.stringify(q)); } catch {} }

// Добавить операцию в очередь
export function enqueueOp(method, path, body = null) {
  const q = getOpQueue();
  q.push({ method, path, body, ts: Date.now(), id: Math.random().toString(36).slice(2) });
  saveOpQueue(q);
}

// Обратная совместимость: enqueueTx / getTxQueue
export function enqueueTx(body) { enqueueOp('POST', '/api/transactions', body); }
export function getTxQueue()    { return getOpQueue().filter(op => op.method === 'POST' && op.path === '/api/transactions'); }

// Обновить баланс в офлайн-кэше
export function patchOfflineBalance(accId, delta) {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const acc = (data.accounts || []).find(a => a.id === accId);
    if (acc) { acc.balance += delta; localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(data)); }
  } catch {}
}

// Отправить всю очередь операций на сервер
export async function flushTxQueue() {
  const q = getOpQueue();
  if (!q.length) return 0;

  const headers = { 'Content-Type': 'application/json' };
  if (TG_INIT_DATA)    headers['X-Telegram-Init-Data'] = TG_INIT_DATA;
  if (localAuth.token) headers['X-Session-Token']       = localAuth.token;

  const failed = [];
  let synced = 0;

  for (const item of q) {
    try {
      const r = await fetch(API + item.path, {
        method:  item.method,
        headers,
        body:    item.body ? JSON.stringify(item.body) : undefined,
      });
      if (r.ok || r.status === 201 || r.status === 204) synced++;
      else failed.push(item);
    } catch { failed.push(item); }
  }

  saveOpQueue(failed);
  return synced;
}

export async function loadAll() {
  const splSub = document.getElementById('spl-sub');
  if (splSub) splSub.textContent = 'Загружаем данные…';
  let d = null;
  S._offline = false;

  try {
    d = await GET('/api/bootstrap');
    if (!d || (!d.accounts && !d.categories)) throw new Error('empty bootstrap');
    persistBootstrap(d);
  } catch {
    const cached = loadCachedBootstrap();
    if (cached) {
      d = cached;
      S._offline = true;
      if (splSub) splSub.textContent = '📵 Офлайн-режим';
    } else {
      if (splSub) splSub.textContent = '❌ Ошибка загрузки';
      throw new Error('bootstrap failed and no offline cache');
    }
  }

  if (!S._offline && splSub) splSub.textContent = 'Готово ✓';

  S.accounts      = d.accounts       || [];
  S.usdRate       = parseFloat(d.usd_rate || 90);
  S.categories    = d.categories     || [];
  S.subscriptions = d.subscriptions  || [];
  S.planned       = d.planned_income || [];
  S.goals         = d.goals          || [];
  S.recurring     = d.recurring      || [];
  const usdEl = document.getElementById('cfg-usd');
  if (usdEl) usdEl.value = S.usdRate;
}

export async function reloadAccounts() {
  const data = await GET('/api/accounts');
  S.accounts = data.accounts || [];
  S.usdRate  = parseFloat(data.usd_rate || 90);
  bustAcc();
}

export async function reloadSubscriptions() {
  const data = await GET('/api/subscriptions');
  S.subscriptions = data.subscriptions || [];
  bustSub();
}
