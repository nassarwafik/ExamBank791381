// Phase 6A — the installation service worker (public/sw.js), the Web App Manifest, icons, Apple metadata and the
// Azure Static Web Apps config. The worker source is executed in a sandbox with a minimal ServiceWorkerGlobalScope.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { registerServiceWorker } from "./registerServiceWorker";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const SW_SOURCE = read("public/sw.js");
const ORIGIN = "https://white-grass-0ce642c10.7.azurestaticapps.net";

type Handler = (event: Record<string, unknown>) => void;
function loadWorker(opts: { online?: boolean; existingCaches?: string[] } = {}) {
  const handlers: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, Response>>((opts.existingCaches || []).map(n => [n, new Map()]));
  const put = vi.fn();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (req: Request) => { store.set(new URL(req.url, ORIGIN).pathname, new Response("<html>offline</html>", { headers: { "Content-Type": "text/html" } })); },
      match: async (url: string) => store.get(new URL(url, ORIGIN + "/").pathname)?.clone(),   // like CacheStorage: a fresh copy
      put
    };
  };
  const caches = { open, keys: async () => [...stores.keys()], delete: vi.fn(async (n: string) => stores.delete(n)) };
  const network = vi.fn(async (req: Request | string) => {
    if (opts.online === false) throw new TypeError("Failed to fetch");
    return new Response("network:" + (typeof req === "string" ? req : req.url), { status: 200 });
  });
  const registration = { navigationPreload: { enable: vi.fn(async () => {}) } };
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    registration,
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (type: string, fn: Handler) => { (handlers[type] ||= []).push(fn); }
  };
  const RequestWithBase = class extends Request { constructor(input: string, init?: RequestInit) { super(new URL(input, ORIGIN + "/").href, init); } };
  vm.runInNewContext(SW_SOURCE, { self, caches, fetch: network, Request: RequestWithBase, Response, URL, Promise, console });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> | undefined, responded: Promise<Response> | undefined;
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => { waited = p; }, respondWith: (p: Promise<Response>) => { responded = p; } };
    for (const h of handlers[type] || []) h(event);
    if (waited) await waited;
    return { responded: responded ? await responded : undefined };
  };
  const fetchEvent = (path: string, init: { mode?: string; method?: string; preload?: Promise<Response | undefined> } = {}) =>
    dispatch("fetch", { request: { url: new URL(path, ORIGIN).href, mode: init.mode || "no-cors", method: init.method || "GET" }, preloadResponse: init.preload ?? Promise.resolve(undefined) });
  return { handlers, stores, put, caches, network, registration, self, dispatch, fetchEvent };
}

describe("service worker — installation only, never stale, never private data", () => {
  it("install precaches ONLY the static offline page; activate removes only its own old caches", async () => {
    const w = loadWorker({ existingCaches: ["examBank-pwa-offline-v0", "some-other-app-cache"] });
    await w.dispatch("install");
    expect([...w.stores.get("examBank-pwa-offline-v1")!.keys()]).toEqual(["/offline.html"]);
    expect(w.self.skipWaiting).toHaveBeenCalled();
    await w.dispatch("activate");
    expect(w.caches.delete).toHaveBeenCalledTimes(1);
    expect(w.caches.delete).toHaveBeenCalledWith("examBank-pwa-offline-v0");
    expect(w.stores.has("some-other-app-cache")).toBe(true);
    expect(w.registration.navigationPreload.enable).toHaveBeenCalled();
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it("API calls, scripts, chunks, styles, images and cross-origin requests are NOT intercepted", async () => {
    const w = loadWorker();
    for (const path of ["/api/student-dashboard", "/api/messages?kind=unread-summary", "/assets/index-abc.js", "/assets/index.css", "/pwa/icon-192.png", "/manifest.webmanifest"]) {
      expect((await w.fetchEvent(path)).responded).toBeUndefined();
    }
    expect((await w.fetchEvent("/api/platform-login", { mode: "navigate", method: "POST" })).responded).toBeUndefined();
    expect((await w.fetchEvent("/api/student-dashboard", { mode: "navigate" })).responded).toBeUndefined();
    expect((await w.fetchEvent("/.auth/login/aad", { mode: "navigate" })).responded).toBeUndefined();
    expect((await w.fetchEvent("https://example.com/", { mode: "navigate" })).responded).toBeUndefined();
    expect(w.network).not.toHaveBeenCalled();
  });

  it("online navigation → the NETWORK response (fresh deployment), nothing written to any cache", async () => {
    const w = loadWorker();
    await w.dispatch("install");
    const r = await w.fetchEvent("/", { mode: "navigate" });
    expect(await r.responded!.text()).toBe("network:" + ORIGIN + "/");
    const pre = await w.fetchEvent("/", { mode: "navigate", preload: Promise.resolve(new Response("preloaded")) });
    expect(await pre.responded!.text()).toBe("preloaded");
    expect(w.put).not.toHaveBeenCalled();
  });

  it("offline navigation → the static «connection required» page; an HTTP error is passed through unchanged", async () => {
    const off = loadWorker({ online: false });
    await off.dispatch("install");
    const r = await off.fetchEvent("/", { mode: "navigate" });
    expect(await r.responded!.text()).toBe("<html>offline</html>");
    const preloadFail = await off.fetchEvent("/", { mode: "navigate", preload: Promise.reject(new TypeError("offline")) });
    expect(await preloadFail.responded!.text()).toBe("<html>offline</html>");
    const on = loadWorker();
    const err = await on.fetchEvent("/", { mode: "navigate", preload: Promise.resolve(new Response("server error", { status: 500 })) });
    expect(err.responded!.status).toBe(500);
  });

  it("no push, notification, sync or message handling; no tokens in the worker", () => {
    const w = loadWorker();
    expect(Object.keys(w.handlers).sort()).toEqual(["activate", "fetch", "install"]);
    expect(SW_SOURCE).not.toMatch(/pushManager|showNotification|requestPermission|Notification\(|setAppBadge|examBankBuilderToken|Authorization|localStorage|sessionStorage|indexedDB/);
    expect(SW_SOURCE).not.toMatch(/cache\.put|cache\.addAll|importScripts/);
  });
});

describe("offline page", () => {
  it("is static Arabic RTL, says an internet connection is required, loads nothing external", () => {
    const html = read("public/offline.html");
    expect(html).toMatch(/<html lang="ar" dir="rtl">/);
    expect(html).toMatch(/يحتاج ExamBank إلى اتصال بالإنترنت/);
    expect(html).not.toMatch(/<script|src=|href=|@import|url\(/);
  });
});

describe("Web App Manifest + icons + Apple metadata", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const pngSize = (p: string) => { const b = readFileSync(resolve(ROOT, "public", p)); expect(b.subarray(1, 4).toString()).toBe("PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

  it("defines an installable standalone app with relative (deployment-safe) URLs", () => {
    expect(manifest).toMatchObject({ name: "ExamBank 791381", short_name: "ExamBank", start_url: "./", scope: "./", id: "./", display: "standalone", lang: "ar", dir: "rtl" });
    expect(manifest.description).toBeTruthy();
    expect(manifest.orientation).toBe("any");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(JSON.stringify(manifest)).not.toMatch(/"\/|https?:/);                  // no absolute paths or hosts
  });

  it("icons: 192 + 512 (any) and 192 + 512 (maskable), real PNGs of the declared size, small", () => {
    const want = [["192x192", "any"], ["512x512", "any"], ["192x192", "maskable"], ["512x512", "maskable"]];
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => [i.sizes, i.purpose])).toEqual(want);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src).join("x")).toBe(icon.sizes);
      expect(readFileSync(resolve(ROOT, "public", icon.src)).length).toBeLessThan(20000);
    }
    expect(pngSize("pwa/apple-touch-icon.png")).toEqual([180, 180]);
  });

  it("index.html links the manifest, theme colour, Apple title/icon and keeps the ordinary viewport", () => {
    const html = read("index.html");
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/pwa\/apple-touch-icon\.png" \/>/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="ExamBank" \/>/);
    expect(html).toMatch(/<meta name="theme-color" content="#0f172a" \/>/);
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1.0" \/>/);
    for (const href of ["manifest.webmanifest", "pwa/apple-touch-icon.png", "sw.js", "offline.html"]) expect(existsSync(resolve(ROOT, "public", href))).toBe(true);
  });

  it("Azure Static Web Apps: sw.js and the manifest are revalidated, the manifest has its MIME type", () => {
    const config = JSON.parse(read("public/staticwebapp.config.json"));
    expect(config.platform).toEqual({ apiRuntime: "node:22" });
    expect(config.routes).toEqual([
      { route: "/sw.js", headers: { "Cache-Control": "no-cache" } },
      { route: "/manifest.webmanifest", headers: { "Cache-Control": "no-cache" } }
    ]);
    expect(config.mimeTypes[".webmanifest"]).toBe("application/manifest+json");
    expect(config.navigationFallback).toBeUndefined();                         // routing unchanged
  });
});

describe("registerServiceWorker", () => {
  const winWith = (sw: unknown, readyState = "complete") => {
    const listeners: Record<string, () => void> = {};
    return { navigator: sw === undefined ? {} : { serviceWorker: sw }, document: { readyState }, addEventListener: (t: string, f: () => void) => { listeners[t] = f; }, listeners } as unknown as Window & { listeners: Record<string, () => void> };
  };
  it("development build → never registers", () => {
    const register = vi.fn(async () => ({}));
    registerServiceWorker({ enabled: false, base: "/", win: winWith({ register }) });
    expect(register).not.toHaveBeenCalled();
  });
  it("production → registers /sw.js for the app scope, bypassing the HTTP cache for update checks", () => {
    const register = vi.fn(async () => ({}));
    registerServiceWorker({ enabled: true, base: "/", win: winWith({ register }) });
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });
  it("waits for load when the page is still loading; unsupported browsers and failures are harmless", async () => {
    const register = vi.fn(async () => ({}));
    const win = winWith({ register }, "loading");
    registerServiceWorker({ enabled: true, base: "/", win });
    expect(register).not.toHaveBeenCalled();
    win.listeners.load();
    expect(register).toHaveBeenCalledTimes(1);
    expect(() => registerServiceWorker({ enabled: true, base: "/", win: winWith(undefined) })).not.toThrow();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerServiceWorker({ enabled: true, base: "/", win: winWith({ register: vi.fn(async () => { throw new Error("SecurityError"); }) }) });
    await new Promise(r => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
  });
});
