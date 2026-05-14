import { S } from './state.js';

// ─── TELEGRAM ───────────────────────────────────────────────
export const tg     = window.Telegram?.WebApp;
export const haptic = (t = 'light') => tg?.HapticFeedback?.impactOccurred(t);
if (tg) { tg.expand(); tg.disableVerticalSwipes?.(); }

const TG_INIT_DATA = tg?.initData || '';

// ─── HTTP ───────────────────────────────────────────────────
const API = window.location.origin;
async function req(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': TG_INIT_DATA },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { console.error('Unauthorized'); return {}; }
  return r.json();
}
export const GET  = p     => req('GET',    p);
export const POST = (p, b) => req('POST',  p, b);
export const PUT  = (p, b) => req('PUT',   p, b);
export const DEL  = p     => req('DELETE', p);

// ─── DATA LOADERS ───────────────────────────────────────────
export async function loadAll() {
  const [accsData, catsData, subsData, planData] = await Promise.all([
    GET('/api/accounts'),
    GET('/api/categories'),
    GET('/api/subscriptions'),
    GET('/api/planned-income'),
  ]);
  S.accounts      = accsData.accounts      || [];
  S.usdRate       = parseFloat(accsData.usd_rate || 90);
  S.categories    = catsData.categories    || [];
  S.subscriptions = subsData.subscriptions || [];
  S.planned       = planData.planned_income || [];
  document.getElementById('cfg-usd').value = S.usdRate;
}

export async function reloadAccounts() {
  const data = await GET('/api/accounts');
  S.accounts = data.accounts || [];
  S.usdRate  = parseFloat(data.usd_rate || 90);
}

export async function reloadSubscriptions() {
  const data = await GET('/api/subscriptions');
  S.subscriptions = data.subscriptions || [];
}
