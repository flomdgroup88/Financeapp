/**
 * idb.js — тонкая обёртка над IndexedDB
 *
 * Хранилища:
 *   cache   — SWR-кэш GET-запросов { key, data, ts }
 *   offline — bootstrap + история для офлайн-режима
 *   queue   — очередь мутаций (POST/PUT/DELETE)
 *
 * Все функции асинхронные, но очень быстрые (~0.1ms vs ~5ms у fetch).
 */

const DB_NAME    = 'finapp';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('offline')) {
        db.createObjectStore('offline', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = e => reject(e.target.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t   = db.transaction(store, mode);
    const s   = t.objectStore(store);
    const req = fn(s);
    if (req) {
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror    = e  => reject(e.target.error);
    }
  }));
}

// ── CACHE store ───────────────────────────────────────────────────────────────
const CACHE_TTL = 45_000; // 45 секунд

export async function cacheGet(key) {
  try {
    const row = await tx('cache', 'readonly', s => s.get(key));
    if (!row) return null;
    if (Date.now() - row.ts > CACHE_TTL) { cacheDelete(key); return null; }
    return row.data;
  } catch { return null; }
}

export async function cacheSet(key, data) {
  try { await tx('cache', 'readwrite', s => s.put({ key, data, ts: Date.now() })); }
  catch {}
}

export async function cacheDelete(key) {
  try { await tx('cache', 'readwrite', s => s.delete(key)); } catch {}
}

export async function cacheInvalidate(...prefixes) {
  try {
    const db  = await openDB();
    const t   = db.transaction('cache', 'readwrite');
    const s   = t.objectStore('cache');
    const req = s.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (prefixes.some(p => cursor.key.startsWith(p))) cursor.delete();
      cursor.continue();
    };
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = rej; });
  } catch {}
}

// ── OFFLINE store ─────────────────────────────────────────────────────────────
export async function offlineGet(key) {
  try {
    const row = await tx('offline', 'readonly', s => s.get(key));
    return row ? row.data : null;
  } catch { return null; }
}

export async function offlineSet(key, data) {
  try { await tx('offline', 'readwrite', s => s.put({ key, data })); } catch {}
}

export async function offlinePatch(key, patchFn) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t   = db.transaction('offline', 'readwrite');
      const s   = t.objectStore('offline');
      const req = s.get(key);
      req.onsuccess = e => {
        const row = e.target.result;
        if (!row) { resolve(null); return; }
        const patched = patchFn(row.data);
        s.put({ key, data: patched });
        resolve(patched);
      };
      req.onerror = e => reject(e.target.error);
    });
  } catch { return null; }
}

// ── QUEUE store ───────────────────────────────────────────────────────────────
export async function queuePush(item) {
  try { await tx('queue', 'readwrite', s => s.add({ ...item, ts: Date.now() })); }
  catch {}
}

export async function queueGetAll() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t   = db.transaction('queue', 'readonly');
      const req = t.objectStore('queue').getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  } catch { return []; }
}

export async function queueDelete(id) {
  try { await tx('queue', 'readwrite', s => s.delete(id)); } catch {}
}

export async function queueClear() {
  try { await tx('queue', 'readwrite', s => s.clear()); } catch {}
}
