/* ExamBank — Phase 6A service worker (installation only).
 *
 * What it does:
 *   - Page navigations go to the NETWORK first, always (with navigation preload). The browser receives exactly
 *     what the server sends, so a new production deployment is picked up on the next launch/refresh. App code,
 *     chunks, API responses and every other request are NEVER intercepted or cached by this worker.
 *   - Only when a navigation fails because the device is offline is a small, static «connection required» page
 *     returned (offline.html, precached at install). It contains no user data and no application code.
 *
 * What it deliberately does NOT do (Phase 6A scope): no asset/app-shell caching, no API caching, no push, no
 * notifications, no background sync, no message handling.
 *
 * Kill switch: if this worker ever needs to be removed, deploy a sw.js that calls self.registration.unregister().
 */
const CACHE_PREFIX = "examBank-pwa-";
const OFFLINE_CACHE = CACHE_PREFIX + "offline-v1";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then(cache => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Remove only this worker's OWN outdated caches; never touch anything else on the origin.
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== OFFLINE_CACHE).map(n => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* unsupported → plain fetch below */ }
    }
    await self.clients.claim();
  })());
});

function isHandledNavigation(request) {
  if (request.mode !== "navigate" || request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  // Server-owned paths are never touched (API, platform auth endpoints).
  return !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/.auth/");
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (!isHandledNavigation(request)) return;          // not intercepted → the browser's normal network path
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(request);
    } catch {
      // Network failure only (an HTTP error status is returned above unchanged).
      const cache = await caches.open(OFFLINE_CACHE);
      const offline = await cache.match(OFFLINE_URL);
      return offline || new Response("يتطلب هذا التطبيق اتصالًا بالإنترنت.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
