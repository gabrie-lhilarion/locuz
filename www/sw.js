/**
 * Locuz Service worker
 */

const currentCacheName = "locuz-v-~VERSION";

self.addEventListener("install", function(e) {
	console.log("Install event triggered. New updates available.");
	const filesToCache = ["/", "/manifest.json", "/style.css", "/script.js", "/axios.min.js", "/vue.min.js"];

	// Deleting the previous version of cache
	e.waitUntil(
		caches.keys().then(function(cacheNames) {
			return Promise.all(
				cacheNames.filter((cacheName) => cacheName != currentCacheName).map((cacheName) => caches.delete(cacheName))
			);
		})
	);

	// add the files to cache
	e.waitUntil(
		caches.open(currentCacheName).then(function(cache) {
			return cache.addAll(filesToCache);
		})
	);
});

self.addEventListener("fetch", function(event) {
	event.respondWith(
		caches.match(event.request).then(function(cache) {
			return cache || fetch(event.request);
		})
	);
});
