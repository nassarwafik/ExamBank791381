/* ExamBank — Phase 6A service worker (installation only).
 *
 * What it does:
 *   - Page navigations go to the NETWORK first, always (with navigation preload). The browser receives exactly
 *     what the server sends, so a new production deployment is picked up on the next launch/refresh. App code,
 *     chunks, API responses and every other request are NEVER intercepted or cached by this worker.
 *   - Only when a navigation fails because the device is offline is a small, static «connection required» page
 *     returned (offline.html, precached at install). It contains no user data and no application code.
 *
 * Phase 6B — message notifications: a `push` from the server shows a short notification (fixed, generic text by
 * default: never message content), and clicking it focuses an open ExamBank window or opens the app. The page asks
 * for permission and subscribes only after an explicit student action; this worker never does.
 *
 * What it deliberately does NOT do: no asset/app-shell caching, no API caching, no background sync, no message
 * handling, no app badges.
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

// ---------- Phase 6B: push → notification ----------
const DEFAULT_NOTIFICATION = { title: "رسالة جديدة", body: "لديك رسالة جديدة من المعلم.", tag: "eb-message", url: "./" };

function textOr(value, fallback, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}
/** Only a same-origin path inside this worker's scope may be opened; anything else falls back to the app root. */
function safeAppUrl(value) {
  try {
    const url = new URL(typeof value === "string" && value ? value : "./", self.registration.scope);
    if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) return url.href;
  } catch { /* malformed → fallback */ }
  return new URL("./", self.registration.scope).href;
}
function readPushData(event) {
  if (!event.data) return {};
  try { const data = event.data.json(); return data && typeof data === "object" ? data : {}; }
  catch { return {}; }                                       // malformed / non-JSON payload → generic notification
}

self.addEventListener("push", event => {
  const data = readPushData(event);
  const title = textOr(data.title, DEFAULT_NOTIFICATION.title, 80);
  const options = {
    body: textOr(data.body, DEFAULT_NOTIFICATION.body, 160),
    tag: textOr(data.tag, DEFAULT_NOTIFICATION.tag, 64),
    renotify: true,
    icon: new URL("pwa/icon-192.png", self.registration.scope).href,
    lang: "ar",
    dir: "rtl",
    data: { url: safeAppUrl(data.url) }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = safeAppUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(c => c.url && c.url.startsWith(self.registration.scope));
    if (existing && "focus" in existing) return existing.focus();   // keep the student's current screen (no reload)
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  })());
});
