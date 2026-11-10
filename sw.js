// Offline cache. Bump VERSION whenever a cached file changes.
const VERSION = "duftfinder-v2";
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

// Network first for the page itself (so updates arrive), cache first for everything else.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
