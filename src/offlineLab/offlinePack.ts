/**
 * Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — the offline lab page's side of the lab pack: what the deployed pack
 * is (/offline-lab.json, read when online) and what this device stored (asked of the service worker, public/sw.js, by a `lab-pack`
 * message). The worker stores only on the learner's explicit «تنزيل»; this module only asks and listens.
 */
export type PackInfo = { available: boolean; version: string; bytes: number; files: number };
export type PackReply =
  | { state: "none" }
  | { state: "installing"; done: number; total: number }
  | { state: "installed"; version: string; files: number }
  | { state: "error"; message: string };

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The deployed pack (null: unreachable — offline, or no answer). */
export async function readPackInfo(fetcher: typeof fetch = fetch): Promise<PackInfo | null> {
  try {
    const res = await fetcher("/offline-lab.json", { cache: "no-store" });
    if (!res.ok) return null;
    const p = rec(await res.json());
    return { available: p.available === true, version: typeof p.version === "string" ? p.version : "", bytes: num(p.bytes), files: Array.isArray(p.files) ? p.files.length : 0 };
  } catch { return null; }
}

/** A reply of the worker, read strictly (anything else is ignored). */
export function readReply(data: unknown): PackReply | null {
  const m = rec(data);
  if (m.type !== "lab-pack") return null;
  if (m.state === "none") return { state: "none" };
  if (m.state === "installing") return { state: "installing", done: num(m.done), total: num(m.total) };
  if (m.state === "installed" && typeof m.version === "string") return { state: "installed", version: m.version, files: num(m.files) };
  if (m.state === "error") return { state: "error", message: typeof m.message === "string" ? m.message.slice(0, 200) : "" };
  return null;
}

/** Talks to the page's service worker: `send` an action, `listen` to its replies. null when this browser has no service worker. */
export function packChannel(nav: Navigator = navigator): { send(action: "status" | "install" | "remove"): Promise<void>; listen(cb: (r: PackReply) => void): () => void } | null {
  const sw = (nav as Navigator & { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
  if (!sw) return null;
  return {
    async send(action) {
      const target = sw.controller ?? (await sw.ready).active;
      target?.postMessage({ type: "lab-pack", action });
    },
    listen(cb) {
      const on = (e: MessageEvent) => { const r = readReply(e.data); if (r) cb(r); };
      sw.addEventListener("message", on);
      return () => sw.removeEventListener("message", on);
    },
  };
}
