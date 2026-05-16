import { S } from './state.js';
import { getCached, setCached, invalidate } from './cache.js';

// ─── TELEGRAM ───────────────────────────────────────────────
export const tg     = window.Telegram?.WebApp;
export const haptic = (t = 'light') => tg?.HapticFeedback?.impactOccurred(t);
if (tg) { tg.expand(); tg.disableVerticalSwipes?.(); }

const TG_INIT_DATA = tg?.initData || '';

// ─── ЛОКАЛЬНАЯ СЕССИЯ ────────────────────────────────────────
// Токен хранится в localStorage; при каждом запросе идёт в заголовке
export const localAuth = {
  get token()  { return localStorage.getItem('fin_session_token') || ''; },
  set token(v) { if (v) localStorage.setItem('fin_session_token', v); else localStorage.removeItem('fin_session_token'); },
  clear()      { this.token = ''; },
};

// ─── HTTP ───────────────────────────────────────────────────
const API = window.location.origin;

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TG_INIT_DATA)         headers['X-Telegram-Init-Data'] = TG_INIT_DATA;
  if (localAuth.token)      headers['X-Session-Token']       = localAuth.token;

  const r = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    // Токен истёк или недействителен — показываем экран входа
    localAuth.clear();
    window.__showAuthScreen?.();
    return {};
  }
  return r.json();
}

export const GET  = p      => req('GET',    p);
export const POST = (p, b) => req('POST',   p, b);
export const PUT  = (p, b) => req('PUT',    p, b);
export const DEL  = p      => req('DELETE', p);

// ─── AUTH API (без авторизации) ─────────────────────────────
export async function authSetup(username, password) {
  const r = await fetch(`${API}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

export async function authLogin(username, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

export async function authLogout() {
  await fetch(`${API}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': localAuth.token,
    },
  });
  localAuth.clear();
}

export async function authStatus() {
  const r = await fetch(`${API}/api/auth/status`);
  return r.json();
}

// ─── CACHED GET (Stale-While-Revalidate) ────────────────────
export async function GETC(path, onUpdate) {
  const cached = getCached(path);
  if (cached !== null) {
    GET(path).then(fresh => {
      const freshStr = JSON.stringify(fresh);
      if (freshStr !== JSON.stringify(cached)) {
        setCached(path, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const data = await GET(path);
  setCached(path, data);
  return data;
}

// ─── CACHE INVALIDATION HELPERS ─────────────────────────────
export const bust = (...prefixes) => invalidate(...prefixes);

export const bustTx  = () => bust('/api/transactions', '/api/stats', '/api/budget-limits', '/api/accounts');
export const bustAcc = () => bust('/api/accounts');
export const bustSub = () => bust('/api/subscriptions', '/api/accounts');
export const bustGoals = () => bust('/api/goals', '/api/accounts');
export const bustRecur = () => bust('/api/recurring', '/api/accounts', '/api/transactions', '/api/stats');

// ─── DATA LOADERS ───────────────────────────────────────────
export async function loadAll() {
  const [accsData, catsData, subsData, planData, goalsData, recurData] = await Promise.all([
    GET('/api/accounts'),
    GET('/api/categories'),
    GET('/api/subscriptions'),
    GET('/api/planned-income'),
    GET('/api/goals'),
    GET('/api/recurring'),
  ]);
  S.accounts      = accsData.accounts       || [];
  S.usdRate       = parseFloat(accsData.usd_rate || 90);
  S.categories    = catsData.categories     || [];
  S.subscriptions = subsData.subscriptions  || [];
  S.planned       = planData.planned_income || [];
  S.goals         = goalsData.goals         || [];
  S.recurring     = recurData.recurring     || [];
  document.getElementById('cfg-usd').value = S.usdRate;
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


// ─── CACHED GET (Stale-While-Revalidate) ────────────────────
// Returns cached data immediately if available,
// then refreshes in background and calls onUpdate(newData) if data changed.
export async function GETC(path, onUpdate) {
  const cached = getCached(path);
  if (cached !== null) {
    // Serve stale instantly, refresh silently in background
    GET(path).then(fresh => {
      const freshStr = JSON.stringify(fresh);
      if (freshStr !== JSON.stringify(cached)) {
        setCached(path, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  // Cold cache — must await
  const data = await GET(path);
  setCached(path, data);
  return data;
}

// ─── CACHE INVALIDATION HELPERS ─────────────────────────────
export const bust = (...prefixes) => invalidate(...prefixes);

// Bust everything related to transactions & derived stats
export const bustTx  = () => bust('/api/transactions', '/api/stats', '/api/budget-limits', '/api/accounts');
export const bustAcc = () => bust('/api/accounts');
export const bustSub = () => bust('/api/subscriptions', '/api/accounts');
export const bustGoals = () => bust('/api/goals', '/api/accounts');
export const bustRecur = () => bust('/api/recurring', '/api/accounts', '/api/transactions', '/api/stats');

// ─── DATA LOADERS ───────────────────────────────────────────
export async function loadAll() {
  const [accsData, catsData, subsData, planData, goalsData, recurData] = await Promise.all([
    GET('/api/accounts'),
    GET('/api/categories'),
    GET('/api/subscriptions'),
    GET('/api/planned-income'),
    GET('/api/goals'),
    GET('/api/recurring'),
  ]);
  S.accounts      = accsData.accounts       || [];
  S.usdRate       = parseFloat(accsData.usd_rate || 90);
  S.categories    = catsData.categories     || [];
  S.subscriptions = subsData.subscriptions  || [];
  S.planned       = planData.planned_income || [];
  S.goals         = goalsData.goals         || [];
  S.recurring     = recurData.recurring     || [];
  document.getElementById('cfg-usd').value = S.usdRate;
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
