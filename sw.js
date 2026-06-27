// ═══════════════════════════════════════════
//  كووورة Service Worker v3
//  Cache-First للأصول | Network-First للـ API
// ═══════════════════════════════════════════
const V          = 'koora-v3';
const CACHE_APP  = V + '-app';
const CACHE_API  = V + '-api';
const CACHE_IMG  = V + '-img';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(c => c.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('koora-') && ![CACHE_APP,CACHE_API,CACHE_IMG].includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // API Backend → Network-First
  if (url.pathname.includes('/api/')) {
    e.respondWith(networkFirst(e.request, CACHE_API, 6000));
    return;
  }

  // TheSportsDB → Timed cache (10 min)
  if (url.hostname.includes('thesportsdb.com')) {
    e.respondWith(timedCache(e.request, CACHE_API, 600));
    return;
  }

  // Images → Cache-First
  if (/\.(png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request, CACHE_IMG));
    return;
  }

  // Google Fonts → Cache-First
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis')) {
    e.respondWith(cacheFirst(e.request, CACHE_APP));
    return;
  }

  // App Shell → Cache-First
  e.respondWith(cacheFirst(e.request, CACHE_APP));
});

// ── STRATEGIES ──────────────────────────────────────────────
async function networkFirst(req, name, ms) {
  const cache = await caches.open(name);
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res   = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || offline();
  }
}

async function timedCache(req, name, maxAge) {
  const cache  = await caches.open(name);
  const cached = await cache.match(req);
  if (cached) {
    const age = (Date.now() - new Date(cached.headers.get('sw-time')||0)) / 1000;
    if (age < maxAge) return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) {
      const h = new Headers(res.headers);
      h.set('sw-time', new Date().toISOString());
      cache.put(req, new Response(await res.clone().blob(), { status: res.status, headers: h }));
    }
    return res;
  } catch { return cached || offline(); }
}

async function cacheFirst(req, name) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(name);
      cache.put(req, res.clone());
    }
    return res;
  } catch { return offline(); }
}

function offline() {
  return new Response(
    JSON.stringify({ success: false, offline: true, message: 'لا يوجد اتصال' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(d.title || 'كووورة ⚽', {
    body: d.body || 'يوجد تحديث جديد',
    icon: '/icon-192.png', badge: '/icon-72.png',
    dir: 'rtl', lang: 'ar',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
