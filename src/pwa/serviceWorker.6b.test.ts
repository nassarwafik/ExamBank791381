// Phase 6B — public/sw.js `push` → notification and `notificationclick` → focus/open. The worker source runs in a
// sandbox with a minimal ServiceWorkerGlobalScope (registration.showNotification, clients.matchAll/openWindow).
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const SW_SOURCE = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://white-grass-0ce642c10.7.azurestaticapps.net";
const SCOPE = ORIGIN + "/";

type Handler = (event: Record<string, unknown>) => void;
type Client = { url: string; focus: ReturnType<typeof vi.fn> };

function loadWorker(opts: { windows?: Client[]; noOpenWindow?: boolean } = {}) {
  const handlers: Record<string, Handler[]> = {};
  const showNotification = vi.fn(async (_title: string, _options: Record<string, unknown>) => {});
  const matchAll = vi.fn(async (_query: unknown) => opts.windows || []);
  const openWindow = vi.fn(async (_url: string) => ({}));
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    registration: { scope: SCOPE, showNotification, navigationPreload: { enable: vi.fn(async () => {}) } },
    clients: { claim: vi.fn(async () => {}), matchAll, ...(opts.noOpenWindow ? {} : { openWindow }) },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (type: string, fn: Handler) => { (handlers[type] ||= []).push(fn); }
  };
  vm.runInNewContext(SW_SOURCE, { self, caches: {}, fetch: vi.fn(), Request, Response, URL, Promise, console });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waited: Promise<unknown>[] = [];
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => { waited.push(p); } };
    for (const h of handlers[type] || []) h(event);
    expect(waited).toHaveLength(1);                                   // the browser keeps the worker alive for it
    return Promise.all(waited);
  };
  const pushData = (value: unknown) => ({ json: () => (typeof value === "string" ? JSON.parse(value) : value) });
  return { handlers, self, showNotification, matchAll, openWindow, dispatch, pushData };
}

const notification = (url?: unknown) => ({ close: vi.fn(), data: url === undefined ? undefined : { url } });

describe("service worker — push → notification (Phase 6B)", () => {
  it("shows the server's notification: title, generic body, tag, Arabic RTL, app icon, same-origin click URL", async () => {
    const w = loadWorker();
    await w.dispatch("push", { data: w.pushData({ type: "message", title: "رسالة جديدة", body: "لديك رسالة جديدة من المعلم.", url: "./", tag: "eb-message" }) });
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = w.showNotification.mock.calls[0];
    expect(title).toBe("رسالة جديدة");
    expect(options).toMatchObject({
      body: "لديك رسالة جديدة من المعلم.", tag: "eb-message", renotify: true, lang: "ar", dir: "rtl",
      icon: SCOPE + "pwa/icon-192.png", data: { url: SCOPE }
    });
  });

  it("a push WITHOUT a payload still shows the generic message notification", async () => {
    const w = loadWorker();
    await w.dispatch("push", {});
    expect(w.showNotification).toHaveBeenCalledWith("رسالة جديدة", expect.objectContaining({ body: "لديك رسالة جديدة من المعلم.", tag: "eb-message", data: { url: SCOPE } }));
  });

  it("a malformed / non-JSON / non-object payload never throws and falls back to the generic notification", async () => {
    for (const data of [{ json: () => { throw new SyntaxError("Unexpected token"); } }, { json: () => null }, { json: () => 42 }]) {
      const w = loadWorker();
      await w.dispatch("push", { data });
      expect(w.showNotification).toHaveBeenCalledWith("رسالة جديدة", expect.objectContaining({ body: "لديك رسالة جديدة من المعلم.", data: { url: SCOPE } }));
    }
    const w = loadWorker();
    await w.dispatch("push", { data: w.pushData({ title: "   ", body: 7, tag: "" }) });   // blank / wrong types → defaults
    expect(w.showNotification).toHaveBeenCalledWith("رسالة جديدة", expect.objectContaining({ body: "لديك رسالة جديدة من المعلم.", tag: "eb-message" }));
  });

  it("an off-origin or out-of-scope URL in the payload is never used (falls back to the app root)", async () => {
    for (const url of ["https://evil.example/phish", "javascript:alert(1)", "//evil.example/x", "http://[bad"]) {
      const w = loadWorker();
      await w.dispatch("push", { data: w.pushData({ url }) });
      expect(w.showNotification.mock.calls[0][1]).toMatchObject({ data: { url: SCOPE } });
    }
    const w = loadWorker();
    await w.dispatch("push", { data: w.pushData({ url: "./?view=messages" }) });
    expect(w.showNotification.mock.calls[0][1]).toMatchObject({ data: { url: SCOPE + "?view=messages" } });
  });

  it("over-long text is trimmed (a notification can never be flooded)", async () => {
    const w = loadWorker();
    await w.dispatch("push", { data: w.pushData({ title: "ع".repeat(500), body: "ب".repeat(500) }) });
    const [title, options] = w.showNotification.mock.calls[0];
    expect(title.length).toBe(80);
    expect(String(options.body).length).toBe(160);
  });
});

describe("service worker — notification click (Phase 6B)", () => {
  it("focuses an already-open ExamBank window (no navigation → the student's screen is kept)", async () => {
    const other = { url: "https://example.com/", focus: vi.fn(async () => {}) };
    const app = { url: SCOPE + "#portal", focus: vi.fn(async () => {}) };
    const w = loadWorker({ windows: [other, app] });
    const n = notification(SCOPE);
    await w.dispatch("notificationclick", { notification: n });
    expect(n.close).toHaveBeenCalled();
    expect(w.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(app.focus).toHaveBeenCalledTimes(1);
    expect(other.focus).not.toHaveBeenCalled();
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("no open window → opens the app (the notification's same-origin URL)", async () => {
    const w = loadWorker({ windows: [] });
    const n = notification(SCOPE + "?view=messages");
    await w.dispatch("notificationclick", { notification: n });
    expect(n.close).toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledWith(SCOPE + "?view=messages");
  });

  it("missing or hostile click data → opens the app root, never another site", async () => {
    for (const n of [notification(), notification("https://evil.example/"), { close: vi.fn(), data: null }]) {
      const w = loadWorker({ windows: [{ url: "https://evil.example/", focus: vi.fn(async () => {}) }] });
      await w.dispatch("notificationclick", { notification: n });
      expect(w.openWindow).toHaveBeenCalledWith(SCOPE);
    }
  });

  it("a browser without clients.openWindow does not throw", async () => {
    const w = loadWorker({ windows: [], noOpenWindow: true });
    await expect(w.dispatch("notificationclick", { notification: notification(SCOPE) })).resolves.toBeDefined();
  });
});
