// sw.js — Service Worker для PWA
// v5: полная офлайн-поддержка — кэш оболочки + API-данных + транзакций

const CACHE = 'finance-shell-v5';
const SHELL = [
  '/',
  '/static/app-bundle.min.js',
  '/static/style.min.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://telegram.org/js/telegram-web-app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// ── Установка: кэшируем оболочку ──────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Активация: удаляем старые кэши ────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Хелпер: безопасный fetch с таймаутом ──────────────────────
function fetchWithTimeout(request, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request)
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

// ── Стратегия: Network-first с кэш-фоллбэком ──────────────────
function networkFirstWithCache(event, cacheName) {
  event.respondWith(
    fetchWithTimeout(event.request)
      .then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(cacheName).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response(JSON.stringify({}), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
  );
}

// ── Fetch handler ──────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Bootstrap и stats — Network-first с долгосрочным кэшем для офлайна
  if (e.request.method === 'GET' && (
    url.pathname === '/api/bootstrap' ||
    url.pathname === '/api/stats'     ||
    url.pathname.startsWith('/api/accounts')
  )) {
    networkFirstWithCache(e, CACHE);
    return;
  }

  // История транзакций — Network-first с кэшем (основа офлайн-истории)
  if (e.request.method === 'GET' && url.pathname === '/api/transactions') {
    networkFirstWithCache(e, CACHE);
    return;
  }

  // Мутирующие API-запросы (POST/PUT/DELETE) — только сеть
  // Офлайн-случай обрабатывается на уровне JS-очереди в api.js
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ ok: false, offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Статика — Cache-first, при промахе сеть + кэшируем
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});
