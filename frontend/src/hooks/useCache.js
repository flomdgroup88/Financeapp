import { useRef } from "react";

const DB_NAME = "vault_cache";
const STORE   = "cache";
const TTL     = 45_000;

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

const memCache = new Map();

export default function useCache() {
  const inFlight = useRef(new Map());

  async function getCache(key, fetcher) {
    // 1. Memory
    const mem = memCache.get(key);
    if (mem && Date.now() - mem.ts < TTL) return mem.value;

    // 2. Deduplicate in-flight requests
    if (inFlight.current.has(key)) return inFlight.current.get(key);

    const promise = (async () => {
      try {
        const data = await fetcher();
        memCache.set(key, { value: data, ts: Date.now() });
        idbSet(key, data);
        return data;
      } finally {
        inFlight.current.delete(key);
      }
    })();

    inFlight.current.set(key, promise);
    return promise;
  }

  async function getOfflineCache(key) {
    const mem = memCache.get(key);
    if (mem) return mem.value;
    const idb = await idbGet(key);
    return idb?.value || null;
  }

  function invalidate(key) {
    if (key) {
      memCache.delete(key);
    } else {
      memCache.clear();
    }
  }

  async function setCache(key, value) {
    memCache.set(key, { value, ts: Date.now() });
    await idbSet(key, value);
  }

  return { getCache, getOfflineCache, invalidate, setCache };
}
