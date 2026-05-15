// ─── SWR CACHE ───────────────────────────────────────────────
// Stale-While-Revalidate: returns cached data instantly,
// then silently fetches fresh data in background.

const _store = new Map();   // key → { data, ts }
const TTL    = 45_000;      // 45s default

export function getCached(key) {
  const e = _store.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL) { _store.delete(key); return null; }
  return e.data;
}

export function setCached(key, data) {
  _store.set(key, { data, ts: Date.now() });
}

// Invalidate all keys that start with any of the given prefixes
export function invalidate(...prefixes) {
  for (const key of _store.keys()) {
    if (prefixes.some(p => key.startsWith(p))) _store.delete(key);
  }
}

