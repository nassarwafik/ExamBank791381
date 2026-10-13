// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — runtime regression tests for the final review of 593fd47 (recovery reviewer):
//   RF3-R1  a retried card re-links a failed stylesheet it needs but that ANOTHER loader requested first (Vite links a shared
//           stylesheet once, so the later loader never sees it as its own); it renders only after that re-link     [RR2-1]  fail-first
//   RF3-R2  a FIRST load in a page where a stylesheet already failed re-links it before rendering (a sibling question that
//           shares it no longer renders unstyled when the stylesheet is back)                                       [RR2-2]  fail-first
//   RF3-R3  the card's OWN stylesheet that stays down still fails its retry (the fail-closed rule is unchanged)            pin
//   RF3-R4  loads that start together share one re-link of a failed stylesheet (never one link per load)                  new
import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense, Component, type ComponentType, type ReactNode } from "react";
import { render, act, cleanup } from "@testing-library/react";
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


const relinks = (f: { appended: HTMLElement[] }) => f.appended.filter(n => n.tagName === "LINK") as HTMLLinkElement[];
const settleRelinks = (f: { appended: HTMLElement[] }, type: "load" | "error") => act(async () => { for (const l of relinks(f)) l.dispatchEvent(new Event(type)); await new Promise(r => setTimeout(r, 0)); });
const bare = (l: HTMLLinkElement) => l.getAttribute("href")!.replace(/\?r=\d+\.$/, "");

describe("RF3-R1 — a retry re-links a failed stylesheet that another loader requested first", () => {
  it("the hotspot linked VisualCanvas.css (it failed); the label diagram needs it too but Vite never linked it for that load", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css"), labelJs = A("LabelDiagramResponse");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    let calls = 0;
    // Vite's preload helper skips a stylesheet that is already linked: this factory requests nothing new for VisualCanvas.css.
    const Label = rt.lazyComponent<object>("LabelDiagramResponse", viteFactory(f, [css], () => (++calls === 1 ? Promise.reject(new TypeError("Failed to fetch dynamically imported module: " + labelJs)) : Promise.resolve(Ok("label")))));
    await renderLazy(Hot); fire(f, css, "error");
    await renderLazy(Label); await settleRelinks(f, "error"); await flush(10);    // still down at the first load: the label's card
    const before = relinks(f).length;
    cleanup(); rt.rearmFailed();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><Label /></Boundary></Suspense>);
    await flush(10);
    const fresh = relinks(f).slice(before);
    expect(fresh.map(bare)).toEqual([css]);                                         // re-linked for the label's retry
    expect(ui.queryByText("label")).toBeNull();                                     // …and awaited before the label renders
    await act(async () => { fresh[0].dispatchEvent(new Event("load")); await new Promise(r => setTimeout(r, 10)); });
    expect(ui.getByText("label")).toBeTruthy();
  });
});

describe("RF3-R2 — a first load re-links a stylesheet that already failed in this page", () => {
  it("the hotspot's VisualCanvas.css failed; opening the label diagram re-links it and renders after it loaded", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    const Label = rt.lazyComponent<object>("LabelDiagramResponse", viteFactory(f, [css], () => Promise.resolve(Ok("label"))));
    await renderLazy(Hot); fire(f, css, "error");
    const ui = await renderLazy(Label, 10);
    expect(relinks(f).map(bare)).toEqual([css]);
    expect(ui.queryByText("label")).toBeNull();                                     // not before its stylesheet is back
    await settleRelinks(f, "load"); await flush(10);
    expect(ui.getByText("label")).toBeTruthy();
    expect(rt.snapshot().css[css]).toBe("ok");
  });
  it("when that stylesheet is still down the first load is not failed by it (it is not known to be this loader's)", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    const Stim = rt.lazyComponent<object>("CodeStimulusView", () => Promise.resolve(Ok("stimulus")) as Promise<{ default: ComponentType<object> }>);
    await renderLazy(Hot); fire(f, css, "error");
    const ui = await renderLazy(Stim, 10);
    await settleRelinks(f, "error"); await flush(10);
    expect(ui.getByText("stimulus")).toBeTruthy();
  });
});

describe("RF3-R3 — the card's own stylesheet that stays down still fails its retry", () => {
  it("re-linked, fails again: the card stays and stays re-armable", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    let calls = 0;
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => (++calls === 1 ? Promise.reject(new Error("Unable to preload CSS for " + css)) : Promise.resolve(Ok("hotspot")))));
    await renderLazy(Hot); fire(f, css, "error"); cleanup();
    rt.rearmFailed();
    const ui = render(<Suspense fallback={<i>…</i>}><Boundary><Hot /></Boundary></Suspense>);
    await flush(); await settleRelinks(f, "error"); await flush(10);
    expect(ui.queryByText("hotspot")).toBeNull();
    expect(ui.getByText("failed")).toBeTruthy();
    expect(rt.rearmFailed()).toBe(1);
  });
});

describe("RF3-R4 — concurrent loads share one re-link", () => {
  it("two sibling questions open together while VisualCanvas.css is down: one fresh link, both wait for it", async () => {
    const f = fakeEnv(), rt = createRecoveryRuntime(f.env);
    const css = A("VisualCanvas", "abcd1234", "css");
    const Hot = rt.lazyComponent<object>("HotspotResponse", viteFactory(f, [css], () => Promise.reject(new Error("Unable to preload CSS for " + css))));
    const Label = rt.lazyComponent<object>("LabelDiagramResponse", viteFactory(f, [css], () => Promise.resolve(Ok("label"))));
    const Chart = rt.lazyComponent<object>("ChartSelectionResponse", () => Promise.resolve(Ok("chart")) as Promise<{ default: ComponentType<object> }>);
    await renderLazy(Hot); fire(f, css, "error"); cleanup();
    const ui = render(<><Suspense fallback={null}><Boundary><Label /></Boundary></Suspense><Suspense fallback={null}><Boundary><Chart /></Boundary></Suspense></>);
    await flush(10);
    expect(relinks(f)).toHaveLength(1);
    await settleRelinks(f, "load"); await flush(10);
    expect(ui.getByText("label")).toBeTruthy();
    expect(ui.getByText("chart")).toBeTruthy();
    expect(relinks(f)).toHaveLength(1);
  });
});
