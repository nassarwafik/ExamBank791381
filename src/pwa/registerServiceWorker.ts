// Phase 6A — register the installation service worker (public/sw.js) in PRODUCTION builds only.
//
// The worker never caches application code or API data (see public/sw.js), so a new deployment is always served
// from the network. `updateViaCache: "none"` makes the browser re-check sw.js itself without the HTTP cache.
// Registration failure is harmless: the site keeps working as an ordinary website.

type Options = { enabled?: boolean; base?: string; win?: Window };

export function registerServiceWorker({ enabled = import.meta.env.PROD, base = import.meta.env.BASE_URL, win = window }: Options = {}): void {
  if (!enabled) return;
  const nav = win.navigator;
  if (!("serviceWorker" in nav) || !nav.serviceWorker) return;
  const register = () => {
    nav.serviceWorker.register(base + "sw.js", { scope: base, updateViaCache: "none" }).catch(err => {
      console.warn("[pwa] service worker registration failed", err instanceof Error ? err.message : err);
    });
  };
  // After load, so registration never competes with the first render.
  if (win.document.readyState === "complete") register();
  else win.addEventListener("load", register, { once: true });
}
