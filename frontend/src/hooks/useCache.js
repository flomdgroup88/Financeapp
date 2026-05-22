import { useRef } from "react";

// ── TTL-настройки ─────────────────────────────────────────────────────────
const MEM_TTL     = 45_000;           // 45 s — короткий TTL для RAM
const LS_TTL      = 24 * 60 * 60_000; // 24 h — localStorage для стабильных данных

// Ключи, которые меняются редко (категории, счета, подписки и т.п.
// приходят в составе bootstrap).
const STABLE_KEYS = new Set(["bootstrap", "categories", "accounts"]);

const LS_PREFIX   = "fin_cache:";

// ── localStorage helpers (синхронные, с TTL) ──────────────────────────────
function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw);
    if (Date.now() - ts > LS_TTL) {
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    // localStorage может быть переполнен — не критично
  }
}

function lsDel(key) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch {}
}

function lsClear() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── IndexedDB helpers (асинхронные, offline-fallback без срока) ───────────
const DB_NAME = "vault_cache";
const STORE   = "cache";

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = reject;
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, value, ts: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

// ── In-memory cache (сбрасывается при перезагрузке) ──────────────────────
const memCache = new Map();

// ── Hook ──────────────────────────────────────────────────────────────────
export default function useCache() {
  const inFlight = useRef(new Map());

  async function getCache(key, fetcher) {
    // 1. RAM — самый быстрый слой, короткий TTL
    const mem = memCache.get(key);
    if (mem && Date.now() - mem.ts < MEM_TTL) return mem.value;

    // 2. localStorage — переживает перезагрузку, только для стабильных данных
    if (STABLE_KEYS.has(key)) {
      const ls = lsGet(key);
      if (ls !== null) {
        // Прогреваем RAM, чтобы повторные обращения не читали LS снова
        memCache.set(key, { value: ls, ts: Date.now() });
        return ls;
      }
    }

    // 3. Дедупликация параллельных запросов
    if (inFlight.current.has(key)) return inFlight.current.get(key);

    const promise = (async () => {
      try {
        const data = await fetcher();
        memCache.set(key, { value: data, ts: Date.now() });
        // Пишем в оба персистентных слоя
        if (STABLE_KEYS.has(key)) lsSet(key, data);
        idbSet(key, data); // async, не ждём
        return data;
      } finally {
        inFlight.current.delete(key);
      }
    })();

    inFlight.current.set(key, promise);
    return promise;
  }

  // Offline-fallback: IDB без ограничения по времени
  async function getOfflineCache(key) {
    const mem = memCache.get(key);
    if (mem) return mem.value;
    // Сначала пробуем localStorage (синхронно, быстрее)
    if (STABLE_KEYS.has(key)) {
      const ls = lsGet(key);
      if (ls !== null) return ls;
    }
    const idb = await idbGet(key);
    return idb?.value || null;
  }

  function invalidate(key) {
    if (key) {
      memCache.delete(key);
      lsDel(key);
    } else {
      memCache.clear();
      lsClear();
    }
  }

  async function setCache(key, value) {
    memCache.set(key, { value, ts: Date.now() });
    if (STABLE_KEYS.has(key)) lsSet(key, value);
    await idbSet(key, value);
  }

  return { getCache, getOfflineCache, invalidate, setCache };
}
