// @vitest-environment happy-dom
// Phase 21E.3 — in-place chunk recovery (src/recoverableLazy.ts): URL trust, header parsing, the remap set, and the runtime driven
// through an injected environment (the real browser behaviour is certified in Chromium by scripts/check-student-exam-browser-21e3.mjs).
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Suspense, type ComponentType } from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import {
  trustedAssetUrl, failedEntryUrl, failedCssUrl, parseStaticImports, remapSet, createRecoveryRuntime, assetName, NEVER_REMAP,
  STATIC_IMPORT_HEADER_SOURCE, type RecoveryEnv,
} from "./recoverableLazy";

const O = "https://exam.example";
const ENV = { origin: O, base: "/" };
const A = (name: string, hash = "abcd1234", ext = "js") => O + "/assets/" + name + "-" + hash + "." + ext;
const chunkError = (url: string) => Object.assign(new TypeError("Failed to fetch dynamically imported module: " + url));

describe("trustedAssetUrl — only same-origin <base>assets/<name>-<8 base36>.<ext>, rebuilt without query / fragment", () => {
  it("accepts the canonical forms (absolute and relative)", () => {
    expect(trustedAssetUrl(A("HotspotView"), ENV)).toBe(A("HotspotView"));
    expect(trustedAssetUrl("/assets/HotspotView-abcd1234.js", ENV)).toBe(A("HotspotView"));
    expect(trustedAssetUrl("assets/HotspotView-abcd1234.js", ENV)).toBe(A("HotspotView"));
    expect(trustedAssetUrl(A("a-b_c"), ENV, "js", "a-b_c")).toBe(A("a-b_c"));
    expect(trustedAssetUrl(A("Chart", "0a1b2c3d", "css"), ENV, "css")).toBe(A("Chart", "0a1b2c3d", "css"));
    expect(trustedAssetUrl("https://exam.example/app/assets/X-abcd1234.js", { origin: O, base: "/app/" })).toBe("https://exam.example/app/assets/X-abcd1234.js");
  });
  it.each([
    ["another origin", "https://evil.example/assets/HotspotView-abcd1234.js"],
    ["protocol-relative", "//evil.example/assets/HotspotView-abcd1234.js"],
    ["another scheme", "http://exam.example/assets/HotspotView-abcd1234.js"],
    ["another port", "https://exam.example:8443/assets/HotspotView-abcd1234.js"],
    ["credentials", "https://user:pw@exam.example/assets/HotspotView-abcd1234.js"],
    ["a query", A("HotspotView") + "?r=1"],
    ["a fragment", A("HotspotView") + "#x"],
    ["the API", O + "/api/student-submission/abcd1234.js"],
    ["outside assets", O + "/HotspotView-abcd1234.js"],
    ["a sub-directory", O + "/assets/x/HotspotView-abcd1234.js"],
    ["path traversal", O + "/assets/../api/HotspotView-abcd1234.js"],
    ["encoded traversal", O + "/assets/%2e%2e/HotspotView-abcd1234.js"],
    ["a short hash", O + "/assets/HotspotView-abcd123.js"],
    ["an upper-case hash", O + "/assets/HotspotView-ABCD1234.js"],
    ["a non-js file", O + "/assets/HotspotView-abcd1234.mjs"],
    ["a data URL", "data:text/javascript,alert(1)"],
    ["javascript:", "javascript:alert(1)"],
    ["a blob URL", "blob:https://exam.example/0e9f"],
    ["garbage", "::::"],
  ])("refuses %s", (_label, raw) => {
    expect(trustedAssetUrl(raw, ENV)).toBeNull();
  });
  it("refuses a different chunk name when one is required, and css for js", () => {
    expect(trustedAssetUrl(A("HotspotView"), ENV, "js", "LabelDiagramResponse")).toBeNull();
    expect(trustedAssetUrl(A("HotspotView"), ENV, "css")).toBeNull();
    expect(assetName(A("rolldown-runtime"))).toBe("rolldown-runtime");
  });
});

describe("failedEntryUrl / failedCssUrl — the URL is taken only from the browser's own wording", () => {
  it("Chromium and Firefox wordings name the failed entry of THIS chunk", () => {
    expect(failedEntryUrl(chunkError(A("HotspotResponse")), "HotspotResponse", ENV)).toBe(A("HotspotResponse"));
    expect(failedEntryUrl(new TypeError("error loading dynamically imported module: " + A("HotspotResponse")), "HotspotResponse", ENV)).toBe(A("HotspotResponse"));
  });
  it.each([
    ["an Error (not a TypeError)", new Error("Failed to fetch dynamically imported module: " + A("HotspotResponse"))],
    ["Safari (no URL)", new TypeError("Importing a module script failed.")],
    ["extra text after the URL", new TypeError("Failed to fetch dynamically imported module: " + A("HotspotResponse") + " because")],
    ["another chunk's URL", chunkError(A("HotspotView"))],
    ["a foreign origin", chunkError("https://evil.example/assets/HotspotResponse-abcd1234.js")],
    ["the API", chunkError(O + "/api/x/HotspotResponse-abcd1234.js")],
    ["a URL with a query", chunkError(A("HotspotResponse") + "?r=1")],
    ["a non-error", "Failed to fetch dynamically imported module: " + A("HotspotResponse")],
    ["null", null],
  ])("ignores %s", (_label, err) => {
    expect(failedEntryUrl(err, "HotspotResponse", ENV)).toBeNull();
  });
  it("reads Vite's CSS preload failure, validated like every asset", () => {
    expect(failedCssUrl(new Error("Unable to preload CSS for " + A("VisualCanvas", "abcd1234", "css")), ENV)).toBe(A("VisualCanvas", "abcd1234", "css"));
    expect(failedCssUrl(new Error("Unable to preload CSS for https://evil.example/assets/x-abcd1234.css"), ENV)).toBeNull();
    expect(failedCssUrl(new Error("Unable to preload CSS for " + A("VisualCanvas")), ENV)).toBeNull();
  });
});

describe("parseStaticImports — the static import edges at a chunk's head, nothing else", () => {
  it("reads named, default, bare and export-from statements after the mapDeps line and comments", () => {
    const src = 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/x-aaaaaaaa.js"])))=>i.map(i=>d[i]);\n'
      + 'import{t as e}from"./react-jk3r217h.js";/* empty css             */import z from"./Chem-fykkggpj.js";import"./side-00000000.js";'
      + 'export{a as b}from"./re-11111111.js";var q=1;import("./lazy-22222222.js");const s=\'import x from "./str-33333333.js"\';';
    expect(parseStaticImports(src)).toEqual(["./react-jk3r217h.js", "./Chem-fykkggpj.js", "./side-00000000.js", "./re-11111111.js"]);
  });
  it("a re-export stub, an empty chunk and a chunk that starts with code", () => {
    expect(parseStaticImports('import{t as e}from"./HotspotView-o19h91wx.js";export{e as default};')).toEqual(["./HotspotView-o19h91wx.js"]);
    expect(parseStaticImports("")).toEqual([]);
    expect(parseStaticImports('var a=1;import{x}from"./late-44444444.js";')).toEqual([]);
  });
  it("is the same pattern the bundle guard runs on every production chunk", () => {
    const guard = fs.readFileSync(path.join(__dirname, "..", "scripts", "check-bundle-budget.mjs"), "utf8");
    const m = /export const STATIC_IMPORT_HEADER_SOURCE = String\.raw`([^`]*)`;/.exec(guard);
    expect(m?.[1]).toBe(STATIC_IMPORT_HEADER_SOURCE);
  });
});

describe("remapSet — only modules whose original can never evaluate", () => {
  const graph: Record<string, string[]> = { E: ["mid", "side"], mid: ["leaf"], leaf: [], side: ["shared"], shared: [] };
  const edges = async (u: string) => graph[u] ?? [];
  it("the entry alone when nothing below it failed", async () => {
    expect((await remapSet("E", () => false, () => false, edges)).sort()).toEqual(["E"]);
  });
  it("a failed leaf brings its ancestors on the path, never the healthy side branch", async () => {
    expect((await remapSet("E", u => u === "leaf", () => false, edges)).sort()).toEqual(["E", "leaf", "mid"]);
  });
  it("a recovered module is not remapped again, but a plain importer of it is", async () => {
    const recovered = (u: string) => u === "leaf";
    expect((await remapSet("E", u => u === "leaf", recovered, edges)).sort()).toEqual(["E", "mid"]);
  });
  it("cycles reach a fixed point", async () => {
    const g: Record<string, string[]> = { E: ["a"], a: ["b"], b: ["a", "f"], f: [] };
    expect((await remapSet("E", u => u === "f", () => false, async u => g[u] ?? [])).sort()).toEqual(["E", "a", "b", "f"]);
    const h: Record<string, string[]> = { E: ["a"], a: ["E"] };
    expect((await remapSet("E", () => false, () => false, async u => h[u] ?? [])).sort()).toEqual(["E", "a"]);
  });
  it("a source that cannot be read fails the attempt (nothing is guessed)", async () => {
    await expect(remapSet("E", () => false, () => false, async () => { throw new Error("source 503"); })).rejects.toThrow("source 503");
  });
});

// ---- the runtime, end to end, through an injected environment ----
type Fake = { env: RecoveryEnv; imported: string[]; fetched: string[]; modules: Map<string, unknown>; sources: Map<string, string>; failImport: Set<string> };
function fakeEnv(): Fake {
  const imported: string[] = [], fetched: string[] = [], modules = new Map<string, unknown>(), sources = new Map<string, string>(), failImport = new Set<string>();
  const env: RecoveryEnv = {
    origin: O, base: "/", doc: document,
    importUrl: async url => { imported.push(url); if (failImport.has(url)) throw chunkError(url); const m = modules.get(url.replace(/\?r=\d+\.$/, "")); if (!m) throw chunkError(url); return m; },
    fetchText: async url => { fetched.push(url); const s = sources.get(url); if (s === undefined) throw new Error("source 404"); return s; },
  };
  return { env, imported, fetched, modules, sources, failImport };
}
/** A Vite-like factory: inserts the modulepreload links of its dependencies synchronously, then rejects / resolves. */
function viteFactory(_entry: string, deps: string[], outcome: () => Promise<{ default: ComponentType<object> }>) {
  return () => {
    for (const d of deps) if (!document.head.querySelector('link[href="' + d + '"]')) { const l = document.createElement("link"); l.rel = "modulepreload"; l.href = d; document.head.appendChild(l); }
    return outcome();
  };
}
const fire = (href: string, type: "load" | "error") => document.head.querySelector('link[href="' + href + '"]')!.dispatchEvent(new Event(type));
const Ok = (label: string) => ({ default: () => <p>{label}</p> });
async function renderLazy(C: ComponentType<object>) {
  const ui = render(<Suspense fallback={<i>…</i>}><Boundary><C /></Boundary></Suspense>);
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return ui;
}
import { Component, type ReactNode } from "react";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>failed</p> : this.props.children; }
}
const cleanHead = () => { document.head.querySelectorAll("link,script").forEach(n => n.remove()); };

describe("createRecoveryRuntime — the measured model (v3)", () => {
  it("success path: the original factory only — no import, no fetch, no import map", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const factory = vi.fn(() => Promise.resolve(Ok("hello")));
    const C = rt.lazyComponent<object>("Hello", factory);
    await renderLazy(C);
    expect(screen.getByText("hello")).toBeTruthy();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(f.imported).toEqual([]); expect(f.fetched).toEqual([]);
    expect(document.querySelectorAll('script[type="importmap"]').length).toBe(0);
    expect(rt.rearmFailed()).toBe(0);
  });

  it("entry failure: the retry re-calls the original, then imports <entry>?r=1. under a map scoped to the retry URL only", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("HotspotResponse"), V = A("HotspotView");
    f.modules.set(E, Ok("hotspot")); f.sources.set(E, 'import{t as e}from"./HotspotView-abcd1234.js";export{e as default};'); f.sources.set(V, "var x=1;");
    const factory = vi.fn(viteFactory(E, [V], () => Promise.reject(chunkError(E))));
    const C = rt.lazyComponent<object>("HotspotResponse", factory);
    await renderLazy(C);
    fire(V, "load");
    expect(screen.getByText("failed")).toBeTruthy();
    expect(rt.rearmFailed()).toBe(1);
    cleanup(); await renderLazy(C);
    expect(screen.getByText("hotspot")).toBeTruthy();
    expect(factory).toHaveBeenCalledTimes(2);                          // the original first, every time
    expect(f.imported).toEqual([E + "?r=1."]);                         // then exactly one validated retry URL
    const map = JSON.parse(document.querySelector('script[type="importmap"]')!.textContent || "{}");
    expect(Object.keys(map.scopes)).toEqual([E + "?r=1."]);            // the healthy HotspotView keeps its normal URL
    expect(map.scopes[E + "?r=1."]).toEqual({ [E]: E + "?r=1." });
    expect(rt.snapshot().settled).toEqual({ [E]: E + "?r=1." });
  });

  it("dependency failure: the failed preload and every module on the path are remapped; a healthy sibling never is", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("HotspotResponse"), V = A("HotspotView"), C2 = A("VisualCanvas"), G = A("visualGeometry");
    f.modules.set(E, Ok("hotspot"));
    f.sources.set(E, 'import{t as e}from"./HotspotView-abcd1234.js";export{e as default};');
    f.sources.set(V, 'import{a}from"./VisualCanvas-abcd1234.js";import{b}from"./visualGeometry-abcd1234.js";var v=1;');
    f.sources.set(C2, 'import{b}from"./visualGeometry-abcd1234.js";var c=1;'); f.sources.set(G, "var g=1;");
    const C = rt.lazyComponent<object>("HotspotResponse", viteFactory(E, [V, C2, G], () => Promise.reject(chunkError(E))));
    await renderLazy(C);
    fire(V, "load"); fire(C2, "error"); fire(G, "load");
    rt.rearmFailed(); cleanup(); await renderLazy(C);
    expect(screen.getByText("hotspot")).toBeTruthy();
    const scopes = JSON.parse(document.querySelector('script[type="importmap"]')!.textContent || "{}").scopes;
    expect(Object.keys(scopes).sort()).toEqual([C2 + "?r=1.", E + "?r=1.", V + "?r=1."].sort());
    expect(scopes[E + "?r=1."]).toEqual({ [E]: E + "?r=1.", [V]: V + "?r=1.", [C2]: C2 + "?r=1." });   // visualGeometry: never
    expect(f.imported).toEqual([E + "?r=1."]);
  });

  it("two wrappers of one chunk and a later graph reuse the recovered URL: one evaluation, no second generation", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("CodingResponse");
    f.modules.set(E, Ok("coding")); f.sources.set(E, "var c=1;");
    const one = rt.lazyComponent<object>("CodingResponse", viteFactory(E, [], () => Promise.reject(chunkError(E))));
    const two = rt.lazyComponent<object>("CodingResponse", viteFactory(E, [], () => Promise.reject(chunkError(E))));
    await renderLazy(one); cleanup(); await renderLazy(two); cleanup();
    expect(rt.rearmFailed()).toBe(2);
    await renderLazy(one); cleanup(); await renderLazy(two);
    expect(f.imported).toEqual([E + "?r=1.", E + "?r=1."]);              // the same record both times
    expect(rt.snapshot().generation).toBe(1);
    expect(document.querySelectorAll('script[type="importmap"]').length).toBe(1);
  });

  it("a first load in a page that already recovered modules takes the remapped path at once (no extra card)", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("HotspotResponse"), L = A("LabelDiagramResponse"), V = A("VisualCanvas");
    f.modules.set(E, Ok("hotspot")); f.modules.set(L, Ok("label"));
    f.sources.set(E, 'import"./VisualCanvas-abcd1234.js";'); f.sources.set(L, 'import"./VisualCanvas-abcd1234.js";'); f.sources.set(V, "var v=1;");
    const H = rt.lazyComponent<object>("HotspotResponse", viteFactory(E, [V], () => Promise.reject(chunkError(E))));
    await renderLazy(H); fire(V, "error"); rt.rearmFailed(); cleanup(); await renderLazy(H); cleanup();
    expect(rt.snapshot().settled[V]).toBe(V + "?r=1.");
    const Lab = rt.lazyComponent<object>("LabelDiagramResponse", viteFactory(L, [], () => Promise.reject(chunkError(L))));
    await renderLazy(Lab);
    expect(screen.getByText("label")).toBeTruthy();                    // the poisoned VisualCanvas is mapped onto its recovered copy
    const maps = [...document.querySelectorAll('script[type="importmap"]')].map(s => JSON.parse(s.textContent || "{}").scopes);
    expect(maps[1][L + "?r=2."]).toEqual({ [V]: V + "?r=1.", [E]: E + "?r=1.", [L]: L + "?r=2." });
  });

  it.each([
    ["a foreign origin", "https://evil.example/assets/HotspotResponse-abcd1234.js"],
    ["the API", O + "/api/x/HotspotResponse-abcd1234.js"],
    ["another chunk", A("HotspotView")],
    ["a query", A("HotspotResponse") + "?x=1"],
  ])("a forged failure naming %s never reaches the importer", async (_l, url) => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const C = rt.lazyComponent<object>("HotspotResponse", () => Promise.reject(chunkError(url)));
    await renderLazy(C); rt.rearmFailed(); cleanup(); await renderLazy(C);
    expect(screen.getByText("failed")).toBeTruthy();
    expect(f.imported).toEqual([]); expect(f.fetched).toEqual([]);
    expect(document.querySelectorAll('script[type="importmap"]').length).toBe(0);
  });

  it("a module that must never be evaluated twice refuses the remap (no import, the card stays)", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("SmartSimResponse"), P = A("trustedSimPlugins");
    expect(NEVER_REMAP.has("trustedSimPlugins")).toBe(true);
    f.modules.set(E, Ok("sim")); f.sources.set(E, 'import"./trustedSimPlugins-abcd1234.js";'); f.sources.set(P, "var p=1;");
    const C = rt.lazyComponent<object>("SmartSimResponse", viteFactory(E, [P], () => Promise.reject(chunkError(E))));
    await renderLazy(C); fire(P, "error"); rt.rearmFailed(); cleanup(); await renderLazy(C);
    expect(screen.getByText("failed")).toBeTruthy();
    expect(f.imported).toEqual([]);
  });

  it("a CSS dependency failure re-links a validated ?r= stylesheet, then re-calls the original (no JS remap)", async () => {
    cleanHead(); const f = fakeEnv();
    // The page <head> is recorded instead of attached, so the test environment never fetches the stylesheet.
    const appended: HTMLElement[] = [];
    const doc = { querySelectorAll: () => [], createElement: (t: string) => document.createElement(t), head: { appendChild: (n: HTMLElement) => { appended.push(n); return n; } } } as unknown as Document;
    const rt = createRecoveryRuntime({ ...f.env, doc });
    const css = A("VisualCanvas", "abcd1234", "css");
    let calls = 0;
    const C = rt.lazyComponent<object>("HotspotResponse", () => (++calls === 1 ? Promise.reject(new Error("Unable to preload CSS for " + css)) : Promise.resolve(Ok("hotspot"))) as Promise<{ default: ComponentType<object> }>);
    await renderLazy(C); rt.rearmFailed(); cleanup();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><C /></Boundary></Suspense>);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const link = appended[0] as HTMLLinkElement;
    expect(appended.length).toBe(1);
    expect(link.rel).toBe("stylesheet");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/exam\.example\/assets\/VisualCanvas-abcd1234\.css\?r=\d+\.$/);
    await act(async () => { link.dispatchEvent(new Event("load")); await new Promise(r => setTimeout(r, 0)); });
    expect(ui.getByText("hotspot")).toBeTruthy();
    expect(calls).toBe(2);
    expect(f.imported).toEqual([]);
  });

  it("retryable (shared chunk without default): a retry never imports another URL", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("CodeStimulusView");
    const C = rt.lazyComponent<object>("CodeStimulusView", () => Promise.reject(chunkError(E)), { remap: false });
    await renderLazy(C); rt.rearmFailed(); cleanup(); await renderLazy(C);
    expect(f.imported).toEqual([]);
  });

  it("a recovered module that is not a component fails closed", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("Odd");
    f.modules.set(E, { n: {} }); f.sources.set(E, "var o=1;");
    const C = rt.lazyComponent<object>("Odd", () => Promise.reject(chunkError(E)));
    await renderLazy(C); rt.rearmFailed(); cleanup(); await renderLazy(C);
    expect(screen.getByText("failed")).toBeTruthy();
  });

  it("concurrent retries are serialized into distinct generations", async () => {
    cleanHead(); const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E1 = A("One"), E2 = A("Two");
    f.modules.set(E1, Ok("one")); f.modules.set(E2, Ok("two")); f.sources.set(E1, "var a;"); f.sources.set(E2, "var b;");
    const One = rt.lazyComponent<object>("One", () => Promise.reject(chunkError(E1))), Two = rt.lazyComponent<object>("Two", () => Promise.reject(chunkError(E2)));
    const both = () => render(<><Suspense fallback={null}><Boundary><One /></Boundary></Suspense><Suspense fallback={null}><Boundary><Two /></Boundary></Suspense></>);
    both();
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(rt.rearmFailed()).toBe(2); cleanup();
    both();
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(screen.getByText("one")).toBeTruthy(); expect(screen.getByText("two")).toBeTruthy();
    expect(f.imported.sort()).toEqual([E1 + "?r=1.", E2 + "?r=2."].sort());
  });
});

