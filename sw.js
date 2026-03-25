const CACHE_NAME = 'jadlospis-v1.1'
const ASSETS = ['index.html', 'style.css', 'script.js']

// Instalacja i cachowanie plików
self.addEventListener('install', e => {
	e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)))
})

// Serwowanie plików z cache, gdy nie ma sieci
self.addEventListener('fetch', e => {
	e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)))
})
