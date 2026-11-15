/*
 * Panda Chat service worker — deliberately minimal.
 *
 * The chat is realtime, so pages and API calls are NEVER served from cache.
 * Only immutable build assets and app icons are cached (cache-first) to make
 * the installed app start instantly and work briefly offline.
 */
const CACHE = "pc-static-v5";
const PRECACHE = ["/manifest.webmanifest", "/icons/icon-32.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* New-message notifications (v1.6.0): clicking focuses the open app or opens
 * the conversation — the ONLY reliable path on Android / installed PWA. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin)) {
          void client.focus();
          if ("navigate" in client && !client.url.startsWith(url)) void client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/favicon.ico";
  if (!cacheable) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch (err) {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
