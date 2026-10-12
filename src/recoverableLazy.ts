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
// THE MODEL (v3 of the design record):
//   1. The first load is the unchanged factory (the normal path is exactly today's path).
//   2. A retry first calls the original factory again (free in Chromium; recovers browsers that do not cache failures, and
//      never creates a second module instance).
//   3. Only if that fails again, and only for an entry URL that the browser itself reported for THIS chunk, one serialized
//      "remapped" attempt imports `<entry>?r=<g>.` under a scoped import map that redirects, for the retry graph only, every
//      module whose original record can never evaluate: the entry, every modulepreload that failed, and every module on a
//      static-import path to such a module (or to an already recovered one). Healthy side modules keep their normal URL, so
//      every module is evaluated at most once; a recovered module keeps its recovered URL for every later graph.
//   4. A CSS dependency that failed is re-linked with a fresh URL before the retry.
//
// SAFETY: every URL used (import, import map, source read, stylesheet) is rebuilt from a same-origin `<BASE>assets/` path
// whose file name matches `<name>-<8 base36>.js|.css` — never a value from exam data, never a query or fragment from the
// error text. Modules that must never get a second instance (the student shell, contexts, plugin registries, engines) are
// never remapped. No global error hook, no automatic retry loop, no reload. Unit tests drive the logic through an injected
// environment; the real behaviour is certified in Chromium by scripts/check-student-exam-browser-21e3.mjs.
import { createElement, lazy, type ComponentType } from "react";

export type RecoveryEnv = {
  /** Page origin and base path (Vite BASE_URL, always ending with "/"). */
  origin: string;
  base: string;
  /** The document whose <head> receives stylesheets and import maps; null outside a browser (recovery disabled). */
  doc: Document | null;
  importUrl: (url: string) => Promise<unknown>;
  fetchText: (url: string) => Promise<string>;
};

/** Chunks that must never be evaluated twice: the static student closure, React contexts, plugin registries and the engines
 *  that install globals. They are never remapped; a graph that would need them remapped stays in the safe fallback. */
export const NEVER_REMAP: ReadonlySet<string> = new Set([
  "index", "rolldown-runtime", "react", "StudentPortal", "StudentQuestionCard", "studentAttemptContext", "trustedSimPlugins",
  "smartSimUiRegistry", "RichPrompt", "RichContentRenderer", "PresentationRoot", "monacoEngine", "echartsEngine", "echartsAdvanced",
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
const isComponent = (c: unknown): c is ComponentType<unknown> => typeof c === "function" || (!!c && typeof c === "object" && "$$typeof" in c);

export type RecoveryRuntime = {
  lazyComponent<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>, options?: { remap?: boolean }): ComponentType<P>;
  /** Re-arms every lazy component whose last load failed; returns how many were re-armed. */
  rearmFailed(): number;
  /** Test / certification view of the runtime state. */
  snapshot(): { settled: Record<string, string>; preloads: Record<string, LinkState>; generation: number };
};

export function createRecoveryRuntime(env: RecoveryEnv): RecoveryRuntime {
  const preloads = new Map<string, LinkState>(), settled = new Map<string, string>(), failedEntries = new Set<string>();
  const failedCss = new Set<string>(), relinkedCss = new Set<string>(), edgeCache = new Map<string, string[]>();
  const pendingRearm = new Set<() => boolean>();
  let generation = 0, queue: Promise<unknown> = Promise.resolve();

  const modulePreloads = () => env.doc ? [...env.doc.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')] : [];
  // Vite inserts the modulepreload links of a dynamic import synchronously, so the links that appear during the factory call
  // are exactly the modules first requested by this load; their load / error events have not fired yet.
  const trackNew = (before: Set<HTMLLinkElement>) => {
    for (const link of modulePreloads()) {
      if (before.has(link)) continue;
      const url = trustedAssetUrl(link.getAttribute("href") || "", env);
      if (!url || preloads.has(url)) continue;
      preloads.set(url, "pending");
      link.addEventListener("load", () => preloads.set(url, "ok"), { once: true });
      link.addEventListener("error", () => preloads.set(url, "failed"), { once: true });
    }
  };
  const known = (u: string) => preloads.has(u) || failedEntries.has(u) || settled.has(u);
  const edgesOf = async (u: string) => {
    let edges = edgeCache.get(u);
    if (!edges) {
      edges = parseStaticImports(await env.fetchText(u)).map(s => trustedAssetUrl(new URL(s, u).href, env)).filter((x): x is string => !!x);
      edgeCache.set(u, edges);
    }
    return edges.filter(known);
  };
  const serialized = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  const relinkFailedCss = async () => {
    if (!env.doc) return;
    const waits: Promise<void>[] = [];
    for (const css of failedCss) {
      if (relinkedCss.has(css)) continue;
      relinkedCss.add(css);
      const link = env.doc.createElement("link");
      link.rel = "stylesheet";
      link.href = css + "?r=" + (++generation) + ".";
      waits.push(new Promise<void>(resolve => { link.addEventListener("load", () => resolve(), { once: true }); link.addEventListener("error", () => { relinkedCss.delete(css); resolve(); }, { once: true }); setTimeout(resolve, 10000); }));
      env.doc.head.appendChild(link);
    }
    await Promise.all(waits);
  };
  const remapped = (entry: string) => serialized(async () => {
    const hit = settled.get(entry);
    if (hit) return env.importUrl(hit);
    if (!env.doc) throw new Error("recovery-unavailable");
    const poisoned = (u: string) => preloads.get(u) === "failed" || failedEntries.has(u) || settled.has(u);
    const set = await remapSet(entry, poisoned, u => settled.has(u), edgesOf);
    if (set.some(u => NEVER_REMAP.has(assetName(u)))) throw new Error("recovery-refused");
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
    const mod = await env.importUrl(url(entry));
    for (const u of set) { settled.set(u, url(u)); failedEntries.delete(u); }
    return mod;
  });

  return {
    lazyComponent<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>, options: { remap?: boolean } = {}) {
      const allowRemap = options.remap !== false;
      let entry: string | null = null, attempts = 0, failed = false;
      const original = (): Promise<unknown> => {
        const before = new Set(modulePreloads());
        let p: Promise<unknown>;
        try { p = factory(); } catch (e) { p = Promise.reject(e); }
        trackNew(before);
        return p.catch((err: unknown) => {
          const e = failedEntryUrl(err, chunkName, env);
          if (e) { entry = e; if (!settled.has(e)) failedEntries.add(e); }
          const css = failedCssUrl(err, env);
          if (css) failedCss.add(css);
          throw err;
        });
      };
      const load = async (): Promise<{ default: ComponentType<P> }> => {
        attempts += 1;
        try {
          if (attempts > 1) await relinkFailedCss();
          const mod = await original().catch((err: unknown) => {
            // A retry, or a first load in a page that already recovered modules this graph may share, takes the remapped path.
            if (allowRemap && entry && (attempts > 1 || settled.size > 0)) return remapped(entry);
            throw err;
          }) as { default?: unknown };
          if (!isComponent(mod?.default)) throw new Error("recovery-shape");
          return { default: mod.default as ComponentType<P> };
        } catch (err) {
          failed = true;
          pendingRearm.add(rearm);
          throw err;
        }
      };
      let current = lazy(load);
      function rearm() { if (!failed) return false; failed = false; current = lazy(load); return true; }
      const Recoverable = (props: P) => createElement(current as ComponentType<P>, props);
      Recoverable.displayName = "Recoverable(" + chunkName + ")";
      return Recoverable;
    },
    rearmFailed() {
      let n = 0;
      for (const r of [...pendingRearm]) { pendingRearm.delete(r); if (r()) n += 1; }
      return n;
    },
    snapshot() {
      return { settled: Object.fromEntries(settled), preloads: Object.fromEntries(preloads), generation };
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
    fetchText: async url => { const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) throw new Error("source " + r.status); return r.text(); },
  };
};
const runtime = createRecoveryRuntime(browserEnv());

/** A lazy component that can be recovered in place after a chunk-load failure (see the model above). `chunkName` is the
 *  emitted chunk's base name (the imported file's base name); the bundle guard checks that it exists and exports default. */
export function recoverableLazy<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  return runtime.lazyComponent(chunkName, factory);
}
/** Like recoverableLazy, for a chunk whose emitted module does not export `default` (a shared chunk): a retry only re-calls the
 *  original factory; it never imports the chunk under another URL. */
export function retryableLazy<P extends object>(chunkName: string, factory: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  return runtime.lazyComponent(chunkName, factory, { remap: false });
}
/** Re-arms every failed recoverable / retryable component (the recovery card's «إعادة المحاولة»). */
export function rearmFailedLoads(): number {
  return runtime.rearmFailed();
}
/** Certification view (read-only). */
export const recoverySnapshot = () => runtime.snapshot();
