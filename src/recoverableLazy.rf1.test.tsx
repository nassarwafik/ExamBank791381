// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — runtime regression tests for the confirmed defects of the independent review of 92f4326. Written against
// the API that already existed on 92f4326 (lazyComponent / rearmFailed / snapshot), so the fail-first run is meaningful:
//   RF1-R1  every stylesheet of a failed load is re-linked, not only the first                                   [R1-2]   fail-first
//   RF1-R2  a re-link that fails again fails the retry (never a question without its stylesheet)                 [R1-3]   fail-first
//   RF1-R3  a stalled recovery stops blocking unrelated recoveries; one that overlaps it is refused              [R1-6]   fail-first
//   RF1-R4  concurrent recoveries sharing one failed module evaluate it under ONE generation only (serialization)[R5-39]  PIN (kills R17)
//   RF1-R5  a browser that does not keep failed modules failed (non-Chromium wording) never takes the remap      [R1-7]   fail-first
//   RF1-R6  a module whose default is an element, not a component, fails closed and stays re-armable             [R1-8]   fail-first
//   RF1-R7  a recoverable error carries its loader; a scoped retry retries only that loader                      [design] new API
import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense, Component, type ComponentType, type ReactNode } from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import * as runtimeModule from "./recoverableLazy";
import { createRecoveryRuntime, type RecoveryEnv } from "./recoverableLazy";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const O = "https://exam.example";
const A = (name: string, hash = "abcd1234", ext = "js") => O + "/assets/" + name + "-" + hash + "." + ext;
const chunkError = (url: string) => new TypeError("Failed to fetch dynamically imported module: " + url);
const Ok = (label: string) => ({ default: () => <p>{label}</p> });
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>failed</p> : this.props.children; }
}
const flush = (ms = 0) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function renderLazy(C: ComponentType<object>, ms = 0) {
  const ui = render(<Suspense fallback={<i>…</i>}><Boundary><C /></Boundary></Suspense>);
  await flush(ms);
  return ui;
}
type Fake = { env: RecoveryEnv; imported: string[]; modules: Map<string, unknown>; sources: Map<string, string>; hang: Set<string>; release: Map<string, () => void>; maps: string[] };
/** A recording environment: the document head is a list (nothing is fetched); imports listed in `hang` stay pending until released. */
function fakeEnv(timeouts?: RecoveryEnv["timeouts"]): Fake & { links: HTMLLinkElement[]; appended: HTMLElement[] } {
  const imported: string[] = [], modules = new Map<string, unknown>(), sources = new Map<string, string>(), hang = new Set<string>(), release = new Map<string, () => void>(), maps: string[] = [];
  const links: HTMLLinkElement[] = [], appended: HTMLElement[] = [];
  const doc = {
    querySelectorAll: () => links,
    createElement: (t: string) => document.createElement(t),
    head: { appendChild: (n: HTMLElement) => { appended.push(n); if (n.tagName === "SCRIPT") maps.push(n.textContent || ""); return n; } },
  } as unknown as Document;
  const env: RecoveryEnv = {
    origin: O, base: "/", doc, timeouts,
    importUrl: url => {
      imported.push(url);
      const settle = () => { const m = modules.get(url.replace(/\?r=\d+\.$/, "")); return m ? Promise.resolve(m) : Promise.reject(chunkError(url)); };
      if (hang.has(url.replace(/\?r=\d+\.$/, ""))) return new Promise((resolve, reject) => release.set(url, () => settle().then(resolve, reject)));
      return new Promise(r => setTimeout(r, 5)).then(settle);
    },
    fetchText: async url => { const s = sources.get(url); if (s === undefined) throw new Error("source 404"); return s; },
  };
  return { env, imported, modules, sources, hang, release, maps, links, appended };
}
/** A Vite-like factory: inserts its modulepreload / stylesheet links synchronously, then settles. */
function viteFactory(f: { links: HTMLLinkElement[] }, deps: string[], outcome: () => Promise<unknown>) {
  return () => {
    for (const d of deps) if (!f.links.some(l => l.getAttribute("href") === d)) { const l = document.createElement("link"); l.rel = d.endsWith(".css") ? "stylesheet" : "modulepreload"; l.setAttribute("href", d); f.links.push(l); }
    return outcome() as Promise<{ default: ComponentType<object> }>;
  };
}
const fire = (f: { links: HTMLLinkElement[] }, href: string, type: "load" | "error") => f.links.find(l => l.getAttribute("href") === href)!.dispatchEvent(new Event(type));

describe("RF1-R1/R2 — stylesheets of a failed load", () => {
  it("every failed stylesheet is re-linked before the retry (not only the one the error names)", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const c1 = A("coding", "abcd1234", "css"), c2 = A("codingTemplate", "abcd1234", "css");
    let calls = 0;
    const C = rt.lazyComponent<object>("CodingTemplateResponse", viteFactory(f, [c1, c2], () => (++calls === 1 ? Promise.reject(new Error("Unable to preload CSS for " + c1)) : Promise.resolve(Ok("template")))));
    await renderLazy(C); fire(f, c1, "error"); fire(f, c2, "error");
    rt.rearmFailed(); cleanup();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><C /></Boundary></Suspense>);
    await flush();
    const relinks = f.appended.filter(n => n.tagName === "LINK") as HTMLLinkElement[];
    expect(relinks.map(l => l.getAttribute("href")!.replace(/\?r=\d+\.$/, "")).sort()).toEqual([c1, c2].sort());
    await act(async () => { for (const l of relinks) l.dispatchEvent(new Event("load")); await new Promise(r => setTimeout(r, 0)); });
    expect(ui.getByText("template")).toBeTruthy();
  });
  it("a re-link that fails again fails the retry: the part does not render without its stylesheet", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    let calls = 0;
    const C = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => (++calls === 1 ? Promise.reject(new Error("Unable to preload CSS for " + css)) : Promise.resolve(Ok("hotspot")))));
    await renderLazy(C); fire(f, css, "error");
    rt.rearmFailed(); cleanup();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><C /></Boundary></Suspense>);
    await flush();
    await act(async () => { f.appended[0].dispatchEvent(new Event("error")); await new Promise(r => setTimeout(r, 0)); });
    expect(ui.queryByText("hotspot")).toBeNull();
    expect(ui.getByText("failed")).toBeTruthy();
    expect(rt.rearmFailed()).toBe(1);                                              // still re-armable for the next retry
  });
});

describe("RF1-R3 — a stalled recovery never blocks the others; it is never duplicated", () => {
  it("a disjoint recovery completes while an earlier one stalls; an overlapping one is refused; the late success is recorded", async () => {
    const f = fakeEnv({ import: 60, source: 60 }), rt = createRecoveryRuntime(f.env);
    const E1 = A("Stalled"), E2 = A("Other");
    f.modules.set(E1, Ok("stalled")); f.modules.set(E2, Ok("other")); f.sources.set(E1, "var a;"); f.sources.set(E2, "var b;");
    f.hang.add(E1);
    const One = rt.lazyComponent<object>("Stalled", () => Promise.reject(chunkError(E1)));
    const Two = rt.lazyComponent<object>("Other", () => Promise.reject(chunkError(E2)));
    await renderLazy(One); await renderLazy(Two); cleanup();
    rt.rearmFailed();
    render(<><Suspense fallback={null}><Boundary><One /></Boundary></Suspense><Suspense fallback={null}><Boundary><Two /></Boundary></Suspense></>);
    await flush(250);                                                              // beyond the 60 ms bound
    expect(screen.getByText("other")).toBeTruthy();                                // not blocked behind the stalled one
    expect(screen.getByText("failed")).toBeTruthy();                               // the stalled one failed closed (its card)
    expect(rt.snapshot().inflight).toEqual([E1]);
    cleanup(); rt.rearmFailed();
    await renderLazy(One, 50);                                                     // overlapping the in-flight set: refused, no new import
    expect(screen.getByText("failed")).toBeTruthy();
    expect(f.imported.filter(u => u.startsWith(E1))).toEqual([E1 + "?r=1."]);
    await act(async () => { f.release.get(E1 + "?r=1.")!(); await new Promise(r => setTimeout(r, 0)); });
    expect(rt.snapshot().settled[E1]).toBe(E1 + "?r=1.");                          // the late success is recorded and reused
    expect(rt.snapshot().inflight).toEqual([]);
  });
});

describe("RF1-R4 — one failed shared module, two concurrent recoveries: ONE generation (PIN)", () => {
  it("the second remap reuses the first's recovered copy of the shared module", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E1 = A("One"), E2 = A("Two"), S = A("Shared");
    f.modules.set(E1, Ok("one")); f.modules.set(E2, Ok("two"));
    f.sources.set(E1, 'import"./Shared-abcd1234.js";'); f.sources.set(E2, 'import"./Shared-abcd1234.js";'); f.sources.set(S, "var s;");
    const One = rt.lazyComponent<object>("One", viteFactory(f, [S], () => Promise.reject(chunkError(E1))));
    const Two = rt.lazyComponent<object>("Two", viteFactory(f, [S], () => Promise.reject(chunkError(E2))));
    render(<><Suspense fallback={null}><Boundary><One /></Boundary></Suspense><Suspense fallback={null}><Boundary><Two /></Boundary></Suspense></>);
    fire(f, S, "error");
    await flush(); cleanup();
    expect(rt.rearmFailed()).toBe(2);
    render(<><Suspense fallback={null}><Boundary><One /></Boundary></Suspense><Suspense fallback={null}><Boundary><Two /></Boundary></Suspense></>);
    await flush(60);
    expect(screen.getByText("one")).toBeTruthy(); expect(screen.getByText("two")).toBeTruthy();
    const sharedTargets = new Set(f.maps.flatMap(m => Object.values(JSON.parse(m).scopes as Record<string, Record<string, string>>).map(scope => scope[S])));
    expect([...sharedTargets]).toEqual([S + "?r=1."]);                             // never a second generation of Shared
  });
});

describe("RF1-R5 — no remap where a failed module may load again later", () => {
  it("Firefox wording: the retry re-calls the original only, never imports another URL", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E = A("HotspotResponse");
    f.modules.set(E, Ok("hotspot")); f.sources.set(E, "var e;");
    const C = rt.lazyComponent<object>("HotspotResponse", () => Promise.reject(new TypeError("error loading dynamically imported module: " + E)));
    await renderLazy(C); rt.rearmFailed(); cleanup(); await renderLazy(C, 30);
    expect(screen.getByText("failed")).toBeTruthy();
    expect(f.imported).toEqual([]);
  });
});

describe("RF1-R6 — a default that is an element (not a component) fails closed", () => {
  it("the load fails (re-armable) instead of handing React an element as a component type", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const C = rt.lazyComponent<object>("Odd", () => Promise.resolve({ default: <p>element</p> as unknown as ComponentType<object> }));
    await renderLazy(C);
    expect(screen.getByText("failed")).toBeTruthy();
    expect(rt.rearmFailed()).toBe(1);
  });
});

describe("RF1-R7 — a recoverable error carries its loader; a scoped retry retries only that loader (new API)", () => {
  it("retryFailed([handle]) leaves every other failed loader alone", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const E1 = A("Mine"), E2 = A("Theirs");
    let mine = 0, theirs = 0;
    const errors: unknown[] = [];
    const Mine = rt.lazyComponent<object>("Mine", () => (++mine === 1 ? Promise.reject(chunkError(E1)) : Promise.resolve(Ok("mine"))));
    const Theirs = rt.lazyComponent<object>("Theirs", () => { theirs++; return Promise.reject(chunkError(E2)); });
    class Catch extends Component<{ children: ReactNode }, { e: unknown }> { state = { e: null as unknown }; static getDerivedStateFromError(e: unknown) { return { e }; } componentDidCatch(e: unknown) { errors.push(e); } render() { return this.state.e ? <p>failed</p> : this.props.children; } }
    render(<><Suspense fallback={null}><Catch><Mine /></Catch></Suspense><Suspense fallback={null}><Catch><Theirs /></Catch></Suspense></>);
    await flush();
    const handles = errors.map(e => runtimeModule.recoveryHandleOf(e));
    expect(handles.every(Boolean)).toBe(true);
    expect(await rt.retryFailed([handles[0]!])).toBe(true);
    expect(theirs).toBe(1);                                                        // the other question's loader was not touched
    expect(rt.rearmFailed()).toBe(1);                                              // …and is still failed, waiting for its own retry
  });
});
