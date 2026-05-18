/**
 * api.js — HTTP-клиент + офлайн/IDB слой
 *
 * Изменения v2:
 *   - bootstrap и история хранятся в IndexedDB (offlineGet/offlineSet)
 *   - очередь операций хранится в IndexedDB (queuePush/queueGetAll/queueDelete)
 *   - кэш GET живёт в IDB через cache.js
 *   - при старте прогреваем memory-кэш из IDB чтобы первый рендер был мгновенным
 *   - убран localStorage (кроме сессионного токена — он должен быть строковым)
 */

import { S } from './state.js';
import { getCached, getCachedSync, setCached, invalidate } from './cache.js';
import { offlineGet, offlineSet, offlinePatch, queuePush, queueGetAll, queueDelete } from './idb.js';

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
const _swrTimers = new Map();

export async function GETC(path, onUpdate, debounceKey) {
  // Сначала пробуем синхронно из памяти — рендерим мгновенно
  const memHit = getCachedSync(path);
  if (memHit !== null) {
    // Фоновое обновление с сервера
    GET(path).then(fresh => {
      if (!fresh || !Object.keys(fresh).length) return;
      const freshStr = JSON.stringify(fresh);
      if (freshStr !== JSON.stringify(memHit)) {
        setCached(path, fresh);
        if (onUpdate) {
          if (debounceKey) {
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
    return memHit;
  }

  // Промах в памяти — пробуем IDB (после перезагрузки)
  const cached = await getCached(path);
  if (cached !== null) {
    GET(path).then(fresh => {
      if (!fresh || !Object.keys(fresh).length) return;
      const freshStr = JSON.stringify(fresh);
      if (freshStr !== JSON.stringify(cached)) {
        setCached(path, fresh);
        if (onUpdate) {
          if (debounceKey) {
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

  // Ничего нет — запрашиваем с сервера
  const data = await GET(path);
  if (data && Object.keys(data).length) setCached(path, data);
  return data;
}

// ─── CACHE INVALIDATION HELPERS ─────────────────────────────
export const bust      = (...prefixes) => invalidate(...prefixes);
export const bustTx    = () => bust('/api/transactions', '/api/stats', '/api/budget-limits', '/api/accounts');
export const bustAcc   = () => bust('/api/accounts');
export const bustSub   = () => bust('/api/subscriptions', '/api/accounts');
export const bustGoals = () => bust('/api/goals', '/api/accounts');
export const bustRecur = () => bust('/api/recurring', '/api/accounts', '/api/transactions', '/api/stats');

// ─── BOOTSTRAP (офлайн через IDB) ───────────────────────────
const BOOTSTRAP_KEY = 'bootstrap';
const HIST_KEY_PREFIX = 'hist:';

export async function cacheHistoryResponse(urlKey, data) {
  await offlineSet(HIST_KEY_PREFIX + urlKey, data);
}

export async function getCachedHistoryResponse(urlKey) {
  return offlineGet(HIST_KEY_PREFIX + urlKey);
}

// ─── ОЧЕРЕДЬ ОПЕРАЦИЙ (через IDB) ────────────────────────────
export async function enqueueOp(method, path, body = null) {
  await queuePush({ method, path, body, id: Math.random().toString(36).slice(2) });
}

export function enqueueTx(body) { return enqueueOp('POST', '/api/transactions', body); }

export async function getTxQueue() {
  const all = await queueGetAll();
  return all.filter(op => op.method === 'POST' && op.path === '/api/transactions');
}

export async function getOpQueue() {
  return queueGetAll();
}

// Обновить баланс в офлайн-кэше (IDB)
export async function patchOfflineBalance(accId, delta) {
  await offlinePatch(BOOTSTRAP_KEY, data => {
    const acc = (data.accounts || []).find(a => a.id === accId);
    if (acc) acc.balance += delta;
    return data;
  });
}

// Отправить всю очередь на сервер
export async function flushTxQueue() {
  const queue = await queueGetAll();
  if (!queue.length) return 0;

  const headers = { 'Content-Type': 'application/json' };
  if (TG_INIT_DATA)    headers['X-Telegram-Init-Data'] = TG_INIT_DATA;
  if (localAuth.token) headers['X-Session-Token']       = localAuth.token;

  let synced = 0;
  for (const item of queue) {
    try {
      const r = await fetch(API + item.path, {
        method:  item.method,
        headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (r.ok || r.status === 201 || r.status === 204) {
        await queueDelete(item.id);
        synced++;
      }
    } catch { /* оставляем в очереди */ }
  }
  return synced;
}

// ─── LOAD ALL (с IDB-офлайном) ───────────────────────────────
export async function loadAll() {
  const splSub = document.getElementById('spl-sub');
  if (splSub) splSub.textContent = 'Загружаем данные…';
  let d = null;
  S._offline = false;

  try {
    d = await GET('/api/bootstrap');
    if (!d || (!d.accounts && !d.categories)) throw new Error('empty bootstrap');
    await offlineSet(BOOTSTRAP_KEY, d);
    // Прогреваем memory-кэш из свежих данных для мгновенных рендеров
    _warmMemoryCache(d);
  } catch {
    const cached = await offlineGet(BOOTSTRAP_KEY);
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

// Прогрев in-memory кэша — чтобы первый рендер каждого таба был мгновенным
function _warmMemoryCache(bootstrap) {
  if (bootstrap.accounts) {
    setCached('/api/accounts', { accounts: bootstrap.accounts, usd_rate: bootstrap.usd_rate });
  }
  if (bootstrap.categories) {
    setCached('/api/categories', { categories: bootstrap.categories });
  }
  if (bootstrap.subscriptions) {
    setCached('/api/subscriptions', { subscriptions: bootstrap.subscriptions });
  }
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
