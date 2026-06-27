// ════════════════════════════════════════════
//  كووورة Service Worker v2
//  استراتيجية: Cache-First للملفات، Network-First للـ API
// ════════════════════════════════════════════

const VERSION   = 'koora-v2';
const CACHE_APP = VERSION + '-app';
const CACHE_API = VERSION + '-api';
const CACHE_IMG = VERSION + '-img';

// الملفات الأساسية - تُحمَّل فور التثبيت
const APP_SHELL = [
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://cdn.tailwindcss.com',
];

// ════════════════════════════
//  INSTALL - حفظ App Shell
// ════════════════════════════
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ════════════════════════════
//  ACTIVATE - تنظيف القديم
// ════════════════════════════
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('koora-') && k !== CACHE_APP && k !== CACHE_API && k !== CACHE_IMG)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ════════════════════════════
//  FETCH - استراتيجيات التخزين
// ════════════════════════════
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API Backend → Network-First (بيانات حديثة دائماً، fallback للكاش)
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(event.request, CACHE_API, 5000));
    return;
  }

  // 2. TheSportsDB API → Network-First مع كاش 10 دقائق
  if (url.hostname.includes('thesportsdb.com')) {
    event.respondWith(networkFirstTimed(event.request, CACHE_API, 600));
    return;
  }

  // 3. صور الفرق واللاعبين → Cache-First (تُحفظ أول مرة)
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg)$/) || url.hostname.includes('thesportsdb.com')) {
    event.respondWith(cacheFirst(event.request, CACHE_IMG));
    return;
  }

  // 4. Google Fonts & Tailwind → Cache-First
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(cacheFirst(event.request, CACHE_APP));
    return;
  }

  // 5. App Shell → Cache-First
  event.respondWith(cacheFirst(event.request, CACHE_APP));
});

// ════════════════════════════
//  استراتيجية: Network-First
// ════════════════════════════
async function networkFirst(request, cacheName, timeout = 4000) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineResponse();
  }
}

// ════════════════════════════
//  Network-First مع انتهاء الصلاحية
// ════════════════════════════
async function networkFirstTimed(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const cachedDate = new Date(cached.headers.get('sw-cached-at') || 0);
    const age = (Date.now() - cachedDate.getTime()) / 1000;
    if (age < maxAgeSeconds) return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      // أضف header لوقت الكاش
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', new Date().toISOString());
      const cachedResponse = new Response(await response.clone().blob(), { headers });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    return cached || offlineResponse();
  }
}

// ════════════════════════════
//  استراتيجية: Cache-First
// ════════════════════════════
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

// ════════════════════════════
//  Offline Fallback
// ════════════════════════════
function offlineResponse() {
  return new Response(
    JSON.stringify({ success: false, offline: true, message: 'لا يوجد اتصال بالإنترنت' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

// ════════════════════════════
//  PUSH NOTIFICATIONS (مستقبلاً)
// ════════════════════════════
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'كووورة', {
      body: data.body || 'يوجد تحديث جديد',
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
