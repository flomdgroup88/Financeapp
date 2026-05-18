// sw.js — сервис-воркер для PWA-режима
// v4: офлайн-поддержка — кэш оболочки + кэш bootstrap-данных

const CACHE = 'finance-shell-v4';
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

// Установка — кэшируем оболочку
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Активация — удаляем старые кэши
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — стратегия по типу запроса
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // /api/bootstrap — Network-first с кэш-фоллбэком для офлайн-доступа
  if (url.pathname === '/api/bootstrap' && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(cached =>
          cached || new Response(JSON.stringify({}), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    );
    return;
  }

  // Остальные API-запросы — только сеть, при ошибке возвращаем пустой JSON
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({}), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Статика — сначала кэш, при промахе — сеть + кэшируем
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
