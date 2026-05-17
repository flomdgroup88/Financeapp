// sw.js — сервис-воркер для PWA-режима
// Кэширует оболочку приложения, API-запросы всегда идут в сеть

// Версию меняем при каждом деплое — это сбрасывает старый кэш у пользователей
const CACHE = 'finance-shell-v3';
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

// Fetch — стратегия: API всегда в сеть, остальное из кэша
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API-запросы — только сеть (никогда не кэшируем данные)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Всё остальное — сначала кэш, при промахе — сеть, потом кэшируем
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Кэшируем только успешные GET-ответы
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/'));  // Оффлайн — возвращаем главную
    })
  );
});
