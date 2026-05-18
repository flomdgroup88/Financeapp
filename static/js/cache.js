/**
 * cache.js — SWR-кэш поверх IndexedDB
 *
 * Двухслойный:
 *   1. in-memory Map — мгновенно (~0ms)
 *   2. IndexedDB     — персистентен между вкладками и перезагрузками (~0.1ms)
 */

import { cacheGet, cacheSet, cacheInvalidate } from './idb.js';

const _mem = new Map();   // key → { data, ts }
const TTL  = 45_000;      // 45 секунд

// ── Sync read from memory (instant) ─────────────────────────────────────────
export function getCachedSync(key) {
  const e = _mem.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL) { _mem.delete(key); return null; }
  return e.data;
}

// ── Async read (memory → IDB) ────────────────────────────────────────────────
export async function getCached(key) {
  const sync = getCachedSync(key);
  if (sync !== null) return sync;
  // Промах в памяти — ищем в IDB (после перезагрузки страницы)
  const data = await cacheGet(key);
  if (data !== null) {
    _mem.set(key, { data, ts: Date.now() });
    return data;
  }
  return null;
}

// ── Write (memory + IDB) ────────────────────────────────────────────────────
export function setCached(key, data) {
  _mem.set(key, { data, ts: Date.now() });
  cacheSet(key, data); // не ждём — IDB асинхронно
}

// ── Invalidate by prefix ─────────────────────────────────────────────────────
export function invalidate(...prefixes) {
  for (const key of _mem.keys()) {
    if (prefixes.some(p => key.startsWith(p))) _mem.delete(key);
  }
  cacheInvalidate(...prefixes);
}
