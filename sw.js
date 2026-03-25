const CACHE_NAME = 'jadlospis-v5' // Zmień numer wersji!
const ASSETS = ['index.html', 'style.css', 'script.js', 'manifest.json']

// Instalacja
self.addEventListener('install', e => {
	e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)))
})

// Obsługa zapytań
self.addEventListener('fetch', e => {
	// Jeśli zapytanie dotyczy Firebase, pozwól mu lecieć prosto do sieci
	if (e.request.url.includes('firebaseio.com') || e.request.url.includes('gstatic.com')) {
		return fetch(e.request)
	}

	e.respondWith(
		caches.match(e.request).then(res => {
			return res || fetch(e.request)
		}),
	)
})
