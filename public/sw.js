/* Tadris+ (formerly ExamBank) — Phase 6A service worker (installation only).
 *
 * What it does:
 *   - Page navigations go to the NETWORK first, always (with navigation preload). The browser receives exactly
 *     what the server sends, so a new production deployment is picked up on the next launch/refresh. App code,
 *     chunks, API responses and every other request are NEVER intercepted or cached by this worker.
 *   - Only when a navigation fails because the device is offline is a small, static «connection required» page
 *     returned (offline.html, precached at install). It contains no user data and no application code.
 *
 * Phase 6B — message notifications: a `push` from the server shows a short notification (fixed, generic text by
 * default: never message content), and clicking it focuses an open Tadris+ window or opens the app. The page asks
 * for permission and subscribes only after an explicit student action; this worker never does.
 *
 * Visual lab V14 — the OFFLINE C# LAB (owner decision 2026-11-24; docs/enterprise-csharp-visual-lab-plan.md §24): when, and only when,
 * the learner taps «تنزيل للعمل بلا إنترنت» on /lab.html, the page asks this worker (a `lab-pack` message) to store the files listed
 * in /offline-lab.json — the lab page, its scripts and styles, and the C# lab's runtime: static public files only, never /api/, never
 * book content — in one cache (examBank-pwa-lab-<version>). Those files are then served NETWORK FIRST and from that cache only when
 * the network fails, so a page that is online always gets the deployed files. An offline navigation, when the pack is stored, opens
 * the lab page (else offline.html as before). «حذف من الجهاز» deletes the cache.
 *
 * What it deliberately does NOT do: no app-shell caching (outside the lab pack the learner asked for), no API caching, no background
 * sync, no app badges.
 *
 * Kill switch: if this worker ever needs to be removed, deploy a sw.js that calls self.registration.unregister().
 */
const CACHE_PREFIX = "examBank-pwa-";
// BRAND-005 — v2: the offline page changed (Tadris+); the activate step deletes v1. The prefix is an internal cache name and stays.
const OFFLINE_CACHE = CACHE_PREFIX + "offline-v2";
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
    // Remove only this worker's OWN outdated caches; never touch anything else on the origin. The lab pack the learner stored is
    // theirs (V14): it stays until they remove it or download a newer one.
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== OFFLINE_CACHE && !n.startsWith(LAB_CACHE_PREFIX)).map(n => caches.delete(n)));
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

// ---------- V14: the offline C# lab pack ----------
const LAB_CACHE_PREFIX = CACHE_PREFIX + "lab-";
const LAB_PACK_URL = "/offline-lab.json";
const LAB_PAGE = "/lab.html";
/** The only paths a pack may list: the lab page, the built assets, the lab's worker and runtime files. Never /api/ or content. */
const LAB_ALLOWED = /^\/(?:lab\.html|assets\/[A-Za-z0-9._-]{1,200}|csharp-lab\/worker\.js|csharp-lab\/_framework\/[A-Za-z0-9._-]{1,200})$/;
const LAB_MAX_FILES = 2000;

/** Whether a pack is stored: unknown (null) until looked up (at start, then by every offline navigation and pack message). Files
 *  are intercepted ONLY once a pack is known to be stored: without one, nothing outside navigations is ever intercepted. */
let labStored = null;
async function labCache() {
  const name = (await caches.keys()).find(n => n.startsWith(LAB_CACHE_PREFIX));
  labStored = !!name;
  return name ? { name, cache: await caches.open(name) } : null;
}
function isLabFile(request) {
  if (request.method !== "GET" || request.mode === "navigate") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && LAB_ALLOWED.test(url.pathname);
}
/** A pack file: the network first (the deployed file), the stored copy only when the network fails. */
async function labFile(request) {
  try { return await fetch(request); }
  catch (error) {
    const stored = await labCache();
    const hit = stored && await stored.cache.match(new URL(request.url).pathname);
    if (hit) return hit;
    throw error;
  }
}

/** Reads and checks /offline-lab.json: every listed path must be one LAB_ALLOWED allows. */
async function readPack() {
  const res = await fetch(LAB_PACK_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("pack " + res.status);
  const pack = await res.json();
  if (!pack || pack.available !== true || typeof pack.version !== "string" || !/^[0-9a-f]{8,64}$/.test(pack.version)) throw new Error("no pack");
  if (!Array.isArray(pack.files) || pack.files.length < 2 || pack.files.length > LAB_MAX_FILES || !pack.files.includes(LAB_PAGE)
    || !pack.files.every(f => typeof f === "string" && LAB_ALLOWED.test(f))) throw new Error("bad pack");
  return pack;
}
async function installPack(report) {
  const pack = await readPack();
  const name = LAB_CACHE_PREFIX + pack.version;
  const cache = await caches.open(name);
  try {
    let done = 0;
    for (const f of pack.files) {
      if (!(await cache.match(f))) {
        const res = await fetch(new Request(f, { cache: "reload" }));
        if (!res.ok) throw new Error(f + " " + res.status);
        await cache.put(f, res);
      }
      report({ state: "installing", done: ++done, total: pack.files.length });
    }
  } catch (error) {
    await caches.delete(name);                         // never a half pack
    throw error;
  }
  const names = await caches.keys();
  await Promise.all(names.filter(n => n.startsWith(LAB_CACHE_PREFIX) && n !== name).map(n => caches.delete(n)));
  labStored = true;
  return { version: pack.version, files: pack.files.length, bytes: pack.bytes };
}
async function packStatus() {
  const stored = await labCache();
  return stored ? { state: "installed", version: stored.name.slice(LAB_CACHE_PREFIX.length), files: (await stored.cache.keys()).length } : { state: "none" };
}

labCache().catch(() => null);   // known from the start whenever possible

self.addEventListener("message", event => {
  const m = event.data || {};
  if (m.type !== "lab-pack" || !event.source) return;
  const reply = data => event.source.postMessage({ type: "lab-pack", ...data });
  event.waitUntil((async () => {
    try {
      if (m.action === "status") reply(await packStatus());
      else if (m.action === "install") reply({ state: "installed", ...(await installPack(p => reply(p))) });
      else if (m.action === "remove") {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n.startsWith(LAB_CACHE_PREFIX)).map(n => caches.delete(n)));
        labStored = false;
        reply({ state: "none" });
      }
    } catch (error) {
      reply({ state: "error", message: String(error && error.message || error) });
    }
  })());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  // V14 — a pack file, when a pack is stored: the network first, the stored copy offline (no pack: not intercepted at all)
  if (labStored === null && typeof caches !== "undefined") event.waitUntil(labCache().catch(() => null));
  if (labStored === true && isLabFile(request)) { event.respondWith(labFile(request)); return; }
  if (!isHandledNavigation(request)) return;          // not intercepted → the browser's normal network path
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(request);
    } catch {
      // Network failure only (an HTTP error status is returned above unchanged).
      // V14: with the lab pack stored, an offline navigation opens the offline C# lab.
      const stored = await labCache();
      const page = stored && await stored.cache.match(LAB_PAGE);
      if (page) return new URL(request.url).pathname === LAB_PAGE ? page : Response.redirect(new URL(LAB_PAGE, self.location.origin).href, 302);
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
