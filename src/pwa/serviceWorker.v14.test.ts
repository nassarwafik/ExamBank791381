// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24; owner decision 2026-11-24) — the service worker's offline C# lab pack.
// The worker source (public/sw.js) runs in a sandbox with a CacheStorage that really stores, and a network that can be cut.
//   • `lab-pack` install stores EXACTLY the files /offline-lab.json lists — refused when one is not a lab file (/api/, book content…);
//     a failed file leaves no half pack; a newer pack replaces the older; «remove» deletes it; status says which is stored;
//   • without a stored pack nothing but navigations is intercepted (as before V14); with one, its files are served NETWORK FIRST and
//     from the store only when the network fails; /api/ never;
//   • offline, with the pack: a navigation opens /lab.html (else offline.html, as before); activate keeps the learner's pack.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const SW_SOURCE = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://tadris.example";
type Handler = (event: Record<string, unknown>) => void;
const PACK = { available: true, version: "0123456789abcdef", bytes: 30, files: ["/lab.html", "/assets/lab-a1.js", "/csharp-lab/worker.js", "/csharp-lab/_framework/dotnet.js"] };

function loadWorker(opts: { pack?: unknown; failFile?: string } = {}) {
  const handlers: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, string>>();
  const path = (u: string | Request) => new URL(typeof u === "string" ? u : u.url, ORIGIN + "/").pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (req: Request) => { store.set(path(req), "offline page"); },
      put: async (req: Request | string, res: Response) => { store.set(path(req), await res.text()); },
      match: async (req: Request | string) => (store.has(path(req)) ? new Response(store.get(path(req))!, { status: 200 }) : undefined),
      keys: async () => [...store.keys()].map(k => new Request(ORIGIN + k)),
    };
  };
  const caches = { open, keys: async () => [...stores.keys()], delete: vi.fn(async (n: string) => stores.delete(n)) };
  let online = true;
  const network = vi.fn(async (req: Request | string) => {
    const p = path(req);
    if (!online) throw new TypeError("Failed to fetch");
    if (p === "/offline-lab.json") return new Response(JSON.stringify(opts.pack ?? PACK), { status: 200 });
    if (p === opts.failFile) return new Response("missing", { status: 404 });
    return new Response("network:" + p, { status: 200 });
  });
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    registration: { navigationPreload: { enable: vi.fn(async () => {}) }, scope: ORIGIN + "/" },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (type: string, fn: Handler) => { (handlers[type] ||= []).push(fn); },
  };
  const RequestWithBase = class extends Request { constructor(input: string | Request, init?: RequestInit) { super(typeof input === "string" ? new URL(input, ORIGIN + "/").href : input, init); } };
  vm.runInNewContext(SW_SOURCE, { self, caches, fetch: network, Request: RequestWithBase, Response, URL, Promise, console });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waited: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => { waited.push(p); }, respondWith: (p: Promise<Response>) => { responded = p; } };
    for (const h of handlers[type] || []) h(event);
    await Promise.all(waited);
    return { responded: responded ? await responded.catch(e => e as Error) : undefined };
  };
  const replies: Record<string, unknown>[] = [];
  const message = (action: string) => dispatch("message", { data: { type: "lab-pack", action }, source: { postMessage: (m: Record<string, unknown>) => replies.push(m) } });
  const get = (p: string, mode = "no-cors") => dispatch("fetch", { request: new Request(ORIGIN + p, { mode: mode === "navigate" ? "same-origin" : (mode as RequestMode) }) as Request & { mode: string },
    preloadResponse: Promise.resolve(undefined) });
  const nav = (p: string) => dispatch("fetch", { request: { url: ORIGIN + p, mode: "navigate", method: "GET" }, preloadResponse: Promise.resolve(undefined) });
  const settle = () => new Promise(r => setTimeout(r, 0));
  return { stores, caches, network, replies, message, get, nav, dispatch, settle, offline: () => { online = false; } };
}

describe("V14 — the offline lab pack", () => {
  it("install stores exactly the listed files, reports progress, then says it is installed", async () => {
    const w = loadWorker();
    await w.message("install");
    expect([...w.stores.get("examBank-pwa-lab-0123456789abcdef")!.keys()].sort()).toEqual([...PACK.files].sort());
    expect(w.replies.at(-1)).toMatchObject({ type: "lab-pack", state: "installed", version: "0123456789abcdef", files: 4 });
    expect(w.replies.filter(r => r.state === "installing").map(r => r.done)).toEqual([1, 2, 3, 4]);
    await w.message("status");
    expect(w.replies.at(-1)).toMatchObject({ state: "installed", version: "0123456789abcdef", files: 4 });
  });
  it("a pack listing anything that is not a lab file (an API path, a course file, another site) is refused: nothing is stored", async () => {
    for (const bad of ["/api/student-tools/csharp-run?library=899271d", "/courses/899271d/m01.json", "https://evil.example/x.js", "/csharp-lab/../api/x"]) {
      const w = loadWorker({ pack: { ...PACK, files: [...PACK.files, bad] } });
      await w.message("install");
      expect(w.replies.at(-1)).toMatchObject({ state: "error" });
      expect([...w.stores.keys()].some(n => n.startsWith("examBank-pwa-lab-"))).toBe(false);
    }
    const none = loadWorker({ pack: { available: false, version: "", files: [] } });
    await none.message("install");
    expect(none.replies.at(-1)).toMatchObject({ state: "error" });
  });
  it("a file that fails leaves no half pack", async () => {
    const w = loadWorker({ failFile: "/csharp-lab/_framework/dotnet.js" });
    await w.message("install");
    expect(w.replies.at(-1)).toMatchObject({ state: "error" });
    expect(w.stores.has("examBank-pwa-lab-0123456789abcdef")).toBe(false);
  });
  it("a newer pack replaces the older; remove deletes it", async () => {
    const w = loadWorker();
    await w.message("install");
    const newer = loadWorker({ pack: { ...PACK, version: "fedcba9876543210" } });
    newer.stores.set("examBank-pwa-lab-0123456789abcdef", new Map([["/lab.html", "old"]]));
    await newer.message("install");
    expect([...newer.stores.keys()].filter(n => n.startsWith("examBank-pwa-lab-"))).toEqual(["examBank-pwa-lab-fedcba9876543210"]);
    await newer.message("remove");
    expect([...newer.stores.keys()].filter(n => n.startsWith("examBank-pwa-lab-"))).toEqual([]);
    await newer.message("status");
    expect(newer.replies.at(-1)).toMatchObject({ state: "none" });
  });
  it("a message that is not a lab-pack message is ignored", async () => {
    const w = loadWorker();
    const replies: unknown[] = [];
    await w.dispatch("message", { data: { type: "skip-waiting" }, source: { postMessage: (m: unknown) => replies.push(m) } });
    expect(replies).toEqual([]);
    expect(w.network).not.toHaveBeenCalled();
  });
});

describe("V14 — serving", () => {
  it("without a stored pack, nothing but navigations is intercepted (as before V14)", async () => {
    const w = loadWorker();
    await w.settle();
    for (const p of ["/assets/lab-a1.js", "/csharp-lab/_framework/dotnet.js", "/lab.html", "/api/student-dashboard"]) expect((await w.get(p)).responded).toBeUndefined();
  });
  it("with the pack: its files network first; when the network fails, the stored copy; /api/ never", async () => {
    const w = loadWorker();
    await w.message("install");
    const online = await w.get("/csharp-lab/_framework/dotnet.js");
    expect(await (online.responded as Response).text()).toBe("network:/csharp-lab/_framework/dotnet.js");
    w.offline();
    const offline = await w.get("/csharp-lab/_framework/dotnet.js");
    expect(await (offline.responded as Response).text()).toBe("network:/csharp-lab/_framework/dotnet.js");   // the copy stored at install
    expect((await w.get("/api/student-dashboard")).responded).toBeUndefined();
    expect((await w.get("/assets/other-app-chunk.js")).responded).toBeInstanceOf(Error);   // not in the pack, offline: no invented copy
  });
  it("offline, with the pack, a navigation opens the lab (the lab page itself from the store); without it, offline.html as before", async () => {
    const w = loadWorker();
    await w.dispatch("install");
    await w.message("install");
    w.offline();
    const root = (await w.nav("/")).responded as Response;
    expect([root.status, root.headers.get("Location")]).toEqual([302, ORIGIN + "/lab.html"]);
    expect(await ((await w.nav("/lab.html")).responded as Response).text()).toBe("network:/lab.html");
    const bare = loadWorker();
    await bare.dispatch("install");
    bare.offline();
    expect(await ((await bare.nav("/")).responded as Response).text()).toBe("offline page");
  });
  it("activate keeps the learner's pack (it removes only the worker's own outdated caches)", async () => {
    const w = loadWorker();
    await w.message("install");
    w.stores.set("examBank-pwa-offline-v1", new Map());
    await w.dispatch("activate");
    expect(w.stores.has("examBank-pwa-lab-0123456789abcdef")).toBe(true);
    expect(w.stores.has("examBank-pwa-offline-v1")).toBe(false);
  });
});
