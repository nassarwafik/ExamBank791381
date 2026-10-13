// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 — runtime regression tests for the re-review of eb174d1 (recovery reviewer):
//   RF2-R1  a stylesheet of ANOTHER loader that stays down never blocks this card's retry                        [RR-2]  fail-first
//           (review fix 3: it is re-linked, but its failure or a hang never fails the retry — see recoverableLazy.rf3)
//   RF2-R2  all source reads of one recovery together are bounded: a chain of slow reads frees the queue          [RR-3]  fail-first
import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense, Component, type ComponentType, type ReactNode } from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
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


describe("RF2-R1 — another card's stylesheet outage never blocks this card's retry", () => {
  // Review fix 3 (RR2-1): the other card's stylesheet IS re-linked (this loader may need it without having requested it), but
  // its failure, or a re-link that hangs, never fails this retry; the hang only delays it, within the stylesheet bound.
  const relinks = (f: { appended: HTMLElement[] }) => f.appended.filter(n => n.tagName === "LINK") as HTMLLinkElement[];
  const failRelinks = (f: { appended: HTMLElement[] }) => act(async () => { for (const l of relinks(f)) l.dispatchEvent(new Event("error")); await new Promise(r => setTimeout(r, 0)); });
  it("the hotspot's stylesheet stays down; the code stimulus (a JS failure) retries and renders", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    let calls = 0;
    const Stim = rt.lazyComponent<object>("CodeStimulusView", () => (++calls === 1 ? Promise.reject(new Error("transient")) : Promise.resolve(Ok("stimulus"))) as Promise<{ default: ComponentType<object> }>);
    await renderLazy(Hot); fire(f, css, "error");
    await renderLazy(Stim); await failRelinks(f); cleanup();
    rt.rearmFailed();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><Stim /></Boundary></Suspense>);
    await flush(); await failRelinks(f); await flush(20);
    expect(ui.getByText("stimulus")).toBeTruthy();                                 // not failed by the other card's stylesheet
    expect(relinks(f).map(l => l.getAttribute("href")!.replace(/\?r=\d+\.$/, ""))).toEqual([css, css]);
  });
  it("a re-link of the other card's stylesheet that hangs only delays the retry, within the stylesheet bound", async () => {
    const f = fakeEnv({ css: 40 }), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    let calls = 0;
    const Stim = rt.lazyComponent<object>("CodeStimulusView", () => (++calls === 1 ? Promise.reject(new Error("transient")) : Promise.resolve(Ok("stimulus"))) as Promise<{ default: ComponentType<object> }>);
    await renderLazy(Hot); fire(f, css, "error");
    await renderLazy(Stim, 80); cleanup();
    rt.rearmFailed();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><Stim /></Boundary></Suspense>);
    await flush(80);
    expect(ui.getByText("stimulus")).toBeTruthy();
  });
});

describe("RF2-R2 — the source reads of one recovery are bounded together", () => {
  it("each read is under its own bound but the recovery is cut at `total`; a disjoint recovery is not held behind it", async () => {
    const f = fakeEnv({ source: 400, import: 400, total: 60 }), rt = createRecoveryRuntime(f.env);
    const E1 = A("SlowGraph"), E2 = A("Other");
    f.modules.set(E1, Ok("slow")); f.modules.set(E2, Ok("other")); f.sources.set(E1, "var a;"); f.sources.set(E2, "var b;");
    f.env.fetchText = url => new Promise((resolve, reject) => setTimeout(() => { const s = f.sources.get(url); if (s === undefined) reject(new Error("404")); else resolve(s); }, url === E1 ? 200 : 0));
    const One = rt.lazyComponent<object>("SlowGraph", () => Promise.reject(chunkError(E1)));
    const Two = rt.lazyComponent<object>("Other", () => Promise.reject(chunkError(E2)));
    await renderLazy(One); await renderLazy(Two); cleanup();
    rt.rearmFailed();
    render(<><Suspense fallback={null}><Boundary><One /></Boundary></Suspense><Suspense fallback={null}><Boundary><Two /></Boundary></Suspense></>);
    await flush(150);                                                              // past `total` (60 ms), before the slow read (200 ms)
    expect(screen.getByText("other")).toBeTruthy();                                // not held behind the slow one
    expect(screen.getByText("failed")).toBeTruthy();                               // the slow one failed closed (its card)
  });
});
