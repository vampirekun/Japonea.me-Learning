const CACHE_NAME = "japonea-learning-v5";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./courses.html",
  "./courses.css",
  "./courses.js",
  "./styles.css",
  "./reduced-motion.css",
  "./app.js",
  "./manifest.json",
  "./data/batches.json",
  "./data/courses/n5.json",
  "./assets/cropped-japoneame-1.png",
  "./assets/japonea-logo.svg",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response.ok || response.type === "opaque") return response;
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, response.clone()))
            .catch(() => undefined)
            .then(() => response);
        })
        .catch((error) => {
          if (event.request.mode !== "navigate") throw error;
          return caches.match("./index.html").then((fallback) => {
            if (fallback) return fallback;
            throw error;
          });
        });
    })
  );
});
