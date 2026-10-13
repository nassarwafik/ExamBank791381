// Phase 21E.3 — IN-PLACE recovery of a lazy component whose JavaScript chunk failed to load, without reloading the page.
//
// WHY NOT lazyWithRetry: lazyWithRetry recovers a stale deployment with one full page reload. Inside a running exam a reload
// is a page exit: a strict attempt ends (pagehide strict exit) and the newest unsaved edit can be lost. Exam renderers
// therefore never reload; they recover here, in place, when the student presses «إعادة المحاولة».
//
// WHAT THE BROWSER DOES (measured in Chromium 141 on Vite production builds, docs/enterprise-ux-premium-21e3.md §3.2):
//   - a module whose fetch failed stays failed for the page's lifetime: importing the same URL again rejects at once;
//   - a module graph that failed evaluates NOTHING (evaluation starts only after every module was fetched and linked);
//   - the rejection names the ENTRY URL even when a dependency failed;
//   - an import map inserted later is honoured for referrers that have not resolved anything yet.
//
// THE MODEL (v3 of the design record, review fix 1):
//   1. The first load is the unchanged factory (the normal path is exactly today's path).
//   2. A retry first calls the original factory again (free in Chromium; recovers browsers that do not cache failures, and
//      never creates a second module instance).
//   3. Only if that fails again, only for an entry URL that the browser itself reported for THIS chunk, and only when the
//      browser is one that keeps a failed module failed (Chromium's wording, measured in §3.2 — so the original can never
//      evaluate later), one serialized "remapped" attempt imports `<entry>?r=<g>.` under a scoped import map that redirects,
//      for the retry graph only, every module whose original record can never evaluate: the entry, every modulepreload that
//      failed, and every module on a static-import path to such a module (or to an already recovered one). Healthy side
//      modules keep their normal URL, so every module is evaluated at most once; a recovered module keeps its recovered URL
//      for every later graph.
//   4. Before a retry, EVERY stylesheet that failed in this page is re-linked with a fresh URL and awaited (bounded); if one of
//      the loader's OWN stylesheets still fails, the retry fails (the card stays) — a question never renders without its
//      stylesheet. Another loader's stylesheet that stays down never fails this retry (review fix 2), but it is re-linked too,
//      because Vite links a shared stylesheet only for the first load that needs it: a later loader that also needs it never
//      sees it as its own (review fix 3). For the same reason a FIRST load in a page where a stylesheet already failed re-links
//      the failed ones first, so a sibling question sharing it renders styled. That wait never fails the load and is short
//      (`firstCss`, 3 s): a stylesheet that stalls must not hold an unrelated part back for the whole stylesheet bound.
//   5. The remap and the stylesheet re-links are bounded in time. A recovery that stalls stops blocking the queue; until it
//      settles, its modules are "in flight" and any other recovery that would need one of them is refused (never a second copy).
//      The retry's first step re-calls the original factory, which is the browser's own import: it is not bounded here (the
//      card shows «جارٍ إعادة المحاولة…» and the student can move on).
//
// SAFETY: every URL used (import, import map, source read, stylesheet) is rebuilt from a same-origin `<BASE>assets/` path
// whose file name matches `<name>-<8 base36>.js|.css` — never a value from exam data, never a query or fragment from the
// error text. Modules of the static student shell, which are evaluated before any exam renders, are never remapped
// (defence in depth). No global error hook, no reload. A retry happens only when the student presses «إعادة المحاولة», or
// once, bounded, when a first load fails in a page that already recovered modules this graph may share. Unit tests drive the
// logic through an injected environment; the real behaviour is certified in Chromium by
// scripts/check-student-exam-browser-21e3.mjs.
import { createElement, lazy, type ComponentType } from "react";

export type RecoveryEnv = {
  /** Page origin and base path (Vite BASE_URL, always ending with "/"). */
  origin: string;
  base: string;
  /** The document whose <head> receives stylesheets and import maps; null outside a browser (recovery disabled). */
  doc: Document | null;
  importUrl: (url: string) => Promise<unknown>;
  fetchText: (url: string) => Promise<string>;
  /** Upper bounds (ms) of one source read, one recovery import, one stylesheet relink, all source reads of one recovery, and a
   *  first load's wait for a stylesheet that failed in the page. */
  timeouts?: { source?: number; import?: number; css?: number; total?: number; firstCss?: number };
};

/** Chunks of the static student shell (index + StudentPortal + the exam page's own static closure) and engines that install
 *  globals behind their own import(). They are evaluated before any exam question renders or never through a remap, so they
 *  can never be poisoned during an exam; they are refused as defence in depth (the bundle guard checks that every name exists
 *  in the build and that no recoverable component is declared for one of them). Lazily loaded registries such as
 *  trustedSimPlugins / smartSimUiRegistry are NOT here: they load with their question, and when they are poisoned their
 *  original never evaluated, so the remap keeps them single-instance (review fix 1, finding R1-4). */
export const NEVER_REMAP: ReadonlySet<string> = new Set([
  "index", "rolldown-runtime", "react", "StudentPortal", "StudentQuestionCard", "studentAttemptContext",
  "RichPrompt", "RichContentRenderer", "PresentationRoot", "monacoEngine", "echartsEngine", "echartsAdvanced",
]);

const HASHED = /^([A-Za-z0-9_-]+)-[0-9a-z]{8}\.(js|css)$/;

/** The canonical absolute URL of an application asset, or null. Accepts only `<origin><base>assets/<name>-<hash>.<ext>` with no
 *  credentials, query or fragment; `name`, when given, must match exactly. */
export function trustedAssetUrl(raw: string, env: Pick<RecoveryEnv, "origin" | "base">, ext: "js" | "css" = "js", name?: string): string | null {
  let u: URL;
  try { u = new URL(raw, env.origin + env.base); } catch { return null; }
  if (u.origin !== env.origin || u.username || u.password || u.search || u.hash) return null;
  const prefix = env.base + "assets/";
  if (!u.pathname.startsWith(prefix)) return null;
  const file = u.pathname.slice(prefix.length);
  const m = HASHED.exec(file);
  if (!m || m[2] !== ext || (name !== undefined && m[1] !== name)) return null;
  return env.origin + u.pathname;
}

/** The chunk name of a trusted asset URL (`…/assets/HotspotView-abcd1234.js` → `HotspotView`). */
export const assetName = (url: string): string => HASHED.exec(url.slice(url.lastIndexOf("/") + 1))?.[1] ?? "";

const ENTRY_FAILURE = [/^Failed to fetch dynamically imported module: (\S+)$/, /^error loading dynamically imported module: (\S+)$/];
/** The failed entry URL of THIS chunk, taken only from the browser's own dynamic-import TypeError (Chromium / Firefox wording). */
export function failedEntryUrl(err: unknown, chunkName: string, env: Pick<RecoveryEnv, "origin" | "base">): string | null {
  const e = err as { name?: unknown; message?: unknown } | null;
  if (!e || e.name !== "TypeError" || typeof e.message !== "string") return null;
  for (const re of ENTRY_FAILURE) { const m = re.exec(e.message); if (m) return trustedAssetUrl(m[1], env, "js", chunkName); }
  return null;
}
/** True when the dynamic-import failure comes from a browser that keeps a failed module failed for the page's lifetime
 *  (Chromium's wording; measured in §3.2). Only then can a remapped copy never meet a later evaluation of the original, so only
 *  then is the remap allowed. Other wordings (Firefox) keep the original-only retry. */
export function failureIsCached(err: unknown): boolean {
  const e = err as { name?: unknown; message?: unknown } | null;
  return !!e && e.name === "TypeError" && typeof e.message === "string" && ENTRY_FAILURE[0].test(e.message);
}
/** The stylesheet URL of Vite's `Unable to preload CSS for <url>` failure, validated like every other asset URL. */
export function failedCssUrl(err: unknown, env: Pick<RecoveryEnv, "origin" | "base">): string | null {
  const msg = (err as { message?: unknown } | null)?.message;
  const m = typeof msg === "string" ? /^Unable to preload CSS for (\S+)$/.exec(msg) : null;
  return m ? trustedAssetUrl(m[1], env, "css") : null;
}

/** The static import specifiers of a production chunk: the `import … from "./x.js"`, `import "./x.js"` and
 *  `export … from "./x.js"` statements at its head (after Vite's optional `const __vite__mapDeps=…` line and comments),
 *  stopping at the first other token. Dynamic `import()` calls are not static edges and are never returned. */
/** The header-statement pattern (sticky). scripts/check-bundle-budget.mjs carries the same source and checks it on every chunk of
 *  the production build; a unit test pins that the two are identical. */
export const STATIC_IMPORT_HEADER_SOURCE = String.raw`(?:\s|\/\*[\s\S]*?\*\/)*(import|export)\s*(?:([\w$*{][^;"']*?)\s*from\s*)?(["'])(\.\/[^"']+?\.js)\3\s*;?`;
export function parseStaticImports(src: string): string[] {
  const out: string[] = [];
  let i = /^const __vite__mapDeps=[^\n]*\n/.exec(src)?.[0].length ?? 0;
  const re = new RegExp(STATIC_IMPORT_HEADER_SOURCE, "y");
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m || (m[1] === "export" && !m[2])) break;
    out.push(m[4]);
    i = re.lastIndex;
  }
  return out;
}

/** Modules to remap for one retry: the entry plus every module of its graph that is poisoned (a failed preload, a failed entry,
 *  an already recovered module whose original stays poisoned) or can reach one through static imports. Healthy side modules
 *  and recovered modules are excluded (recovered ones are mapped onto their recovered URL instead). Cycles are handled by a
 *  fixed point. `edgesOf` returns the known static neighbours of a module. */
export async function remapSet(entry: string, poisoned: (u: string) => boolean, recovered: (u: string) => boolean, edgesOf: (u: string) => Promise<string[]>): Promise<string[]> {
  const graph = new Map<string, string[]>(), stack = [entry];
  while (stack.length) {
    const u = stack.pop() as string;
    if (graph.has(u)) continue;
    const out = recovered(u) ? [] : await edgesOf(u);
    graph.set(u, out);
    for (const v of out) if (!graph.has(v)) stack.push(v);
  }
  const bad = new Set([...graph.keys()].filter(u => u === entry || poisoned(u)));
  for (let changed = true; changed;) {
    changed = false;
    for (const [u, out] of graph) if (!bad.has(u) && out.some(v => bad.has(v))) { bad.add(u); changed = true; }
  }
  return [...bad].filter(u => !recovered(u));
}

type LinkState = "pending" | "ok" | "failed";
const COMPONENT_TYPES = new Set([Symbol.for("react.memo"), Symbol.for("react.forward_ref"), Symbol.for("react.lazy")]);
/** A component TYPE (function / class, memo, forwardRef, lazy) — never an element or another object. */
const isComponent = (c: unknown): c is ComponentType<unknown> =>
  typeof c === "function" || (!!c && typeof c === "object" && COMPONENT_TYPES.has((c as { $$typeof?: symbol }).$$typeof as symbol));
/** The component of a SHARED chunk's namespace: such a chunk exports the module's namespace object (tagged "Module") instead
 *  of `default`, and the compiled import picks it (`import(…).then(e => e.<name>)`). Exactly one such export must exist. */
export function pickShared(ns: unknown): unknown {
  if (!ns || typeof ns !== "object") return undefined;
  const hits = Object.values(ns as Record<string, unknown>).filter(v => !!v && typeof v === "object"
    && (v as Record<symbol, unknown>)[Symbol.toStringTag] === "Module" && isComponent((v as { default?: unknown }).default));
  return hits.length === 1 ? (hits[0] as { default: unknown }).default : undefined;
}
// `total` bounds all source reads of one recovery together (review fix 2): a chain of slow reads never holds the queue for long.
const DEFAULT_TIMEOUTS = { source: 15000, import: 20000, css: 15000, total: 30000, firstCss: 3000 };
const within = <T,>(p: Promise<T>, ms: number, code: string): Promise<T> => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(code)), ms);
  p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

/** Attached to every error a recoverable load throws: the loader that failed, so the boundary that caught the error retries
 *  exactly the loaders below it (never another question's). */
export const RECOVERY_HANDLE = Symbol.for("examBank.recoveryHandle");
export type RecoveryHandle = { rearm: () => boolean; retry: () => Promise<boolean> };
/** The failed loader carried by an error caught by a boundary, if any. */
export const recoveryHandleOf = (err: unknown): RecoveryHandle | null =>
  err && typeof err === "object" ? ((err as Record<symbol, unknown>)[RECOVERY_HANDLE] as RecoveryHandle | undefined) ?? null : null;

export type RecoveryRuntime = {
  lazyComponent<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>, options?: { shared?: boolean }): ComponentType<P>;
  /** Re-arms every lazy component whose last load failed (the next render loads again); returns how many were re-armed. */
  rearmFailed(): number;
  /** Re-arms the given failed loaders (default: every failed one) AND starts their loads now; resolves true when every one of
   *  them loaded (so the next render shows them), false when one failed again (its card stays). True at once for none. */
  retryFailed(handles?: RecoveryHandle[]): Promise<boolean>;
  /** Test / certification view of the runtime state. */
  snapshot(): { settled: Record<string, string>; preloads: Record<string, LinkState>; css: Record<string, LinkState>; inflight: string[]; generation: number };
};

export function createRecoveryRuntime(env: RecoveryEnv): RecoveryRuntime {
  const limits = { ...DEFAULT_TIMEOUTS, ...(env.timeouts || {}) };
  const preloads = new Map<string, LinkState>(), cssLinks = new Map<string, LinkState>(), settled = new Map<string, string>();
  const failedEntries = new Set<string>(), failedCss = new Set<string>(), inflight = new Set<string>(), edgeCache = new Map<string, string[]>();
  const pendingRearm = new Set<RecoveryHandle>();
  let generation = 0, queue: Promise<unknown> = Promise.resolve();

  const newLinks = () => env.doc ? [...env.doc.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"],link[rel="stylesheet"]')] : [];
  // Vite inserts the modulepreload AND stylesheet links of a dynamic import synchronously, so the links that appear during the
  // factory call are exactly the modules / stylesheets first requested by this load; their load / error events have not fired yet.
  const trackNew = (before: Set<HTMLLinkElement>, mine: Set<string>) => {
    for (const link of newLinks()) {
      if (before.has(link)) continue;
      const css = link.rel === "stylesheet";
      const url = trustedAssetUrl(link.getAttribute("href") || "", env, css ? "css" : "js");
      const states = css ? cssLinks : preloads;
      if (url && css) mine.add(url);
      if (!url || states.has(url)) continue;
      states.set(url, "pending");
      link.addEventListener("load", () => states.set(url, "ok"), { once: true });
      link.addEventListener("error", () => { states.set(url, "failed"); if (css) failedCss.add(url); }, { once: true });
    }
  };
  const known = (u: string) => preloads.has(u) || failedEntries.has(u) || settled.has(u);
  const edgesOf = async (u: string) => {
    let edges = edgeCache.get(u);
    if (!edges) {
      edges = parseStaticImports(await within(env.fetchText(u), limits.source, "recovery-timeout")).map(s => trustedAssetUrl(new URL(s, u).href, env)).filter((x): x is string => !!x);
      edgeCache.set(u, edges);
    }
    return edges.filter(known);
  };
  const serialized = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  /** One fresh link per failed stylesheet at a time (concurrent loads share it); true when it loaded within the bound. A link
   *  that fails or times out is removed and the stylesheet stays recorded as failed. */
  const relinking = new Map<string, Promise<boolean>>();
  const relink = (doc: Document, css: string): Promise<boolean> => {
    const running = relinking.get(css);
    if (running) return running;
    const p = new Promise<boolean>(resolve => {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = css + "?r=" + (++generation) + ".";
      const t = setTimeout(() => done(false), limits.css);
      function done(ok: boolean) {
        clearTimeout(t);
        relinking.delete(css);
        if (ok) { failedCss.delete(css); cssLinks.set(css, "ok"); } else link.remove();
        resolve(ok);
      }
      link.addEventListener("load", () => done(true), { once: true });
      link.addEventListener("error", () => done(false), { once: true });
      doc.head.appendChild(link);
    });
    relinking.set(css, p);
    return p;
  };
  /** Re-links EVERY stylesheet that failed in this page and waits for all of them (each bounded). Only one of the loader's OWN
   *  stylesheets that is still down fails the load (review fix 2: another question's stylesheet that stays down never blocks
   *  this card); the others are re-linked because this loader may need them without having requested them (review fix 3). */
  const relinkFailedCss = async (own: Set<string>) => {
    const doc = env.doc;
    if (!doc || !failedCss.size) return;
    await Promise.all([...failedCss].map(css => relink(doc, css)));
    if ([...own].some(css => failedCss.has(css))) throw new Error("recovery-css");
  };
  const remapped = (entry: string) => serialized(async () => {
    const hit = settled.get(entry);
    if (hit) return env.importUrl(hit);
    if (!env.doc) throw new Error("recovery-unavailable");
    const poisoned = (u: string) => preloads.get(u) === "failed" || failedEntries.has(u) || settled.has(u);
    const set = await within(remapSet(entry, poisoned, u => settled.has(u), edgesOf), limits.total, "recovery-timeout");
    if (set.some(u => NEVER_REMAP.has(assetName(u)))) throw new Error("recovery-refused");
    // A stalled earlier recovery may still evaluate these modules under its own generation: never start a second copy.
    if (set.some(u => inflight.has(u))) throw new Error("recovery-busy");
    const g = ++generation, url = (u: string) => u + "?r=" + g + ".";
    const imports: Record<string, string> = {};
    settled.forEach((v, k) => { imports[k] = v; });
    for (const u of set) imports[u] = url(u);
    const scopes: Record<string, Record<string, string>> = {};
    for (const u of set) scopes[url(u)] = imports;
    const supports = (globalThis as { HTMLScriptElement?: { supports?: (t: string) => boolean } }).HTMLScriptElement?.supports;
    if (!supports || supports("importmap")) {
      const script = env.doc.createElement("script");
      script.type = "importmap";
      script.textContent = JSON.stringify({ scopes });
      env.doc.head.appendChild(script);
    }
    for (const u of set) inflight.add(u);
    const importing = env.importUrl(url(entry)).then(mod => {
      for (const u of set) { settled.set(u, url(u)); failedEntries.delete(u); }
      return mod;
    }).finally(() => { for (const u of set) inflight.delete(u); });
    // The queue never waits longer than the bound; a late success still records its modules as recovered (above).
    return within(importing, limits.import, "recovery-timeout");
  });

  return {
    lazyComponent<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>, options: { shared?: boolean } = {}) {
      let entry: string | null = null, cached = false, attempts = 0, failed = false;
      // The stylesheets this loader's own loads requested or named in their failure: its retry re-links those that failed (Vite
      // rejects on the FIRST failing stylesheet; another one of the same load may report its error later).
      const ownCss = new Set<string>();
      const original = (): Promise<unknown> => {
        const before = new Set(newLinks()), requested = new Set<string>();
        let p: Promise<unknown>;
        try { p = factory(); } catch (e) { p = Promise.reject(e); }
        trackNew(before, requested);
        for (const u of requested) ownCss.add(u);
        return p.catch((err: unknown) => {
          const e = failedEntryUrl(err, chunkName, env);
          if (e) { entry = e; cached = failureIsCached(err); if (!settled.has(e)) failedEntries.add(e); }
          const css = failedCssUrl(err, env);
          if (css) { failedCss.add(css); ownCss.add(css); }
          throw err;
        });
      };
      const load = async (): Promise<{ default: ComponentType<P> }> => {
        attempts += 1;
        try {
          // A retry re-links and awaits every failed stylesheet (fails closed on its own). A first load in a page where a stylesheet
          // already failed gives it a short chance to come back before the question renders (it has no own stylesheet yet, so
          // it never fails here; a stall only delays it by `firstCss`).
          if (attempts > 1) await relinkFailedCss(ownCss);
          else if (failedCss.size > 0) await within(relinkFailedCss(ownCss), limits.firstCss, "recovery-timeout").catch(() => undefined);
          let viaRemap = false;
          const mod = await original().catch((err: unknown) => {
            // A retry, or a first load in a page that already recovered modules this graph may share, takes the remapped
            // path — only in a browser that keeps failed modules failed (otherwise the original retry is the safe one).
            if (entry && cached && (attempts > 1 || settled.size > 0)) { viaRemap = true; return remapped(entry); }
            throw err;
          }) as { default?: unknown };
          const component = viaRemap && options.shared ? pickShared(mod) : mod?.default;
          if (!isComponent(component)) throw new Error("recovery-shape");
          return { default: component as ComponentType<P> };
        } catch (err) {
          failed = true;
          pendingRearm.add(handle);
          if (err && typeof err === "object") { try { (err as Record<symbol, unknown>)[RECOVERY_HANDLE] = handle; } catch { /* a frozen error: the boundary retries every failed loader */ } }
          throw err;
        }
      };
      let current: ComponentType<P> = lazy(load);
      const handle: RecoveryHandle = {
        rearm() { if (!failed) return false; failed = false; current = lazy(load); return true; },
        retry() {
          if (!failed) return Promise.resolve(true);
          failed = false;
          const loading = load();
          current = lazy(() => loading);
          // Review fix 3: once loaded, the component itself is rendered (no second suspension). A lazy wrapper would render its
          // empty fallback for one commit first, so the recovered part would change the page's height twice — scroll anchoring
          // compensates only the first change, and the content under a still pointer moved.
          return loading.then(m => { current = m.default; return true; }, () => false);
        },
      };
      const Recoverable = (props: P) => createElement(current, props);
      Recoverable.displayName = "Recoverable(" + chunkName + ")";
      return Recoverable;
    },
    rearmFailed() {
      let n = 0;
      for (const h of [...pendingRearm]) { pendingRearm.delete(h); if (h.rearm()) n += 1; }
      return n;
    },
    retryFailed(handles?: RecoveryHandle[]) {
      const list = handles ?? [...pendingRearm];
      for (const h of list) pendingRearm.delete(h);
      return Promise.all(list.map(h => h.retry())).then(all => all.every(Boolean));
    },
    snapshot() {
      return { settled: Object.fromEntries(settled), preloads: Object.fromEntries(preloads), css: Object.fromEntries(cssLinks), inflight: [...inflight], generation };
    },
  };
}

const browserEnv = (): RecoveryEnv => {
  const hasDoc = typeof document !== "undefined" && typeof location !== "undefined";
  return {
    origin: hasDoc ? location.origin : "",
    base: import.meta.env.BASE_URL || "/",
    doc: hasDoc ? document : null,
    importUrl: url => import(/* @vite-ignore */ url),
    fetchText: async url => {
      const ctl = typeof AbortController === "undefined" ? null : new AbortController();
      const t = ctl ? setTimeout(() => ctl.abort(), DEFAULT_TIMEOUTS.source) : 0;
      try {
        const r = await fetch(url, { credentials: "same-origin", signal: ctl?.signal });
        if (!r.ok) throw new Error("source " + r.status);
        return await r.text();
      } finally { if (t) clearTimeout(t); }
    },
  };
};
const runtime = createRecoveryRuntime(browserEnv());

/** A lazy component that can be recovered in place after a chunk-load failure (see the model above). `chunkName` is the
 *  emitted chunk's base name (the imported file's base name); the bundle guard checks that it exists and exports default. */
export function recoverableLazy<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  return runtime.lazyComponent(chunkName, factory);
}
/** Like recoverableLazy, for a component whose module the bundler placed in a SHARED chunk (the compiled import picks the
 *  module's namespace export, `import(…).then(e => e.<name>)`): a remapped copy is resolved through that namespace export. */
export function recoverableSharedLazy<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  return runtime.lazyComponent(chunkName, factory, { shared: true });
}
/** Re-arms every failed recoverable component without loading it yet (the next render loads it). */
export function rearmFailedLoads(): number {
  return runtime.rearmFailed();
}
/** «إعادة المحاولة»: re-arms the given failed loaders (default: every failed one) and loads them now; true when all loaded. */
export function retryFailedLoads(handles?: RecoveryHandle[]): Promise<boolean> {
  return runtime.retryFailed(handles);
}
/** Certification view (read-only). */
export const recoverySnapshot = () => runtime.snapshot();
