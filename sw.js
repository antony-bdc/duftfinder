// Offline cache. Bump VERSION whenever a cached file changes.
const VERSION = "duftfinder-v3";
const FILES = [
  "./", "./index.html", "./app.js", "./engine.js", "./perfumes.js", "./bottle.js", "./manifest.webmanifest",
  "./vendor/gsap.min.js", "./vendor/Flip.min.js",
  "./fonts/instrument-serif-latin-400-normal.woff2", "./fonts/instrument-serif-latin-400-italic.woff2",
  "./fonts/inter-tight-latin-400-normal.woff2", "./fonts/inter-tight-latin-500-normal.woff2",
  "./fonts/inter-tight-latin-600-normal.woff2", "./icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for everything, so a new deploy is used right away; the cache is only the offline fallback.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res.clone();
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))),
  );
});
