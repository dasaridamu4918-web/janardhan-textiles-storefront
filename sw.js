// Janardhan Textiles Service Worker — Network-First for API & Images (never serves stale swapped images)
const CACHE_NAME = "jt-storefront-v5";
const STATIC_PRECACHE = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Always network-first for API, uploads, product images, and JS bundles so updates & ?v= cache-busts appear immediately
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/public/images/") ||
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && !url.pathname.startsWith("/api/admin")) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
