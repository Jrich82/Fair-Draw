/* Fair-Draw service worker: offline cache of the static app only.
   The cache key derives from APP_CONFIG.VERSION in config.js (the single
   version constant) — bump it there whenever any cached file changes.
   `npm run check` fails if ASSETS lists a file that does not exist.
   Network responses from drand, Twitch or any other origin are NEVER cached. */
importScripts('config.js')
const VERSION = 'app-cache-v' + self.APP_CONFIG.VERSION
const ASSETS = [
  './', 'index.html', 'config.js', 'engine.js', 'engine.js?v=3', 'visual.js', 'fun.js', 'fun.css',
  'vendor/qrcode.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png'
]
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return // drand/Twitch: straight to network
  // Network first (so updates land), cache fallback for offline.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches.open(VERSION).then(c => c.put(e.request, copy))
    }
    return res
  }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith('/') || url.pathname.endsWith('index.html') })
    .then(r => r || caches.match('index.html'))))
})
