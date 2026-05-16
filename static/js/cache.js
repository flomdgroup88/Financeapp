// ─── SWR CACHE (sessionStorage + in-memory) ──────────────────
// Stale-While-Revalidate: возвращает кэш мгновенно,
// фоном обновляет данные с сервера.
//
// sessionStorage сохраняет кэш при навигации и F5,
// но очищается при закрытии вкладки (в отличие от localStorage).
// In-memory Map нужен для скорости — чтение из sessionStorage
// медленнее из-за JSON.parse.

const _mem   = new Map();   // key → { data, ts }  (быстрый in-memory слой)
const TTL    = 45_000;      // 45 секунд
const PREFIX = 'swrc:';     // префикс ключей в sessionStorage

function _ssGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _ssSet(key, entry) {
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch {}
}

function _ssDel(key) {
  try { sessionStorage.removeItem(PREFIX + key); } catch {}
}

function _ssKeys() {
  const keys = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
  } catch {}
  return keys;
}

export function getCached(key) {
  // 1. Проверяем in-memory
  let e = _mem.get(key);
  if (!e) {
    // 2. Пробуем sessionStorage (после перезагрузки страницы)
    e = _ssGet(key);
    if (e) _mem.set(key, e);
  }
  if (!e) return null;
  if (Date.now() - e.ts > TTL) {
    _mem.delete(key);
    _ssDel(key);
    return null;
  }
  return e.data;
}

export function setCached(key, data) {
  const entry = { data, ts: Date.now() };
  _mem.set(key, entry);
  _ssSet(key, entry);
}

// Инвалидируем все ключи, начинающиеся с переданных префиксов
export function invalidate(...prefixes) {
  // in-memory
  for (const key of _mem.keys()) {
    if (prefixes.some(p => key.startsWith(p))) _mem.delete(key);
  }
  // sessionStorage
  for (const key of _ssKeys()) {
    if (prefixes.some(p => key.startsWith(p))) _ssDel(key);
  }
}
