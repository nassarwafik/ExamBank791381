// Phase 21G.1 — the ONE request helper of the assignments workspace (extracted unchanged from AssignmentsPanel): JSON body, the
// teacher token on both headers the API accepts, and a non-2xx answer becomes an Error whose message is the server's Arabic error
// with its tracking code.
import { withTrackingCode } from "../lib/requestTrace";

export type AssignmentsApi = <T>(url: string, options?: RequestInit) => Promise<T>;

export function assignmentsApi(token: string): AssignmentsApi {
  return async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    const h = new Headers(options.headers || {}); h.set("Content-Type", "application/json"); h.set("x-builder-token", token); h.set("Authorization", "Bearer " + token);
    const r = await fetch(url, { ...options, headers: h }), j = await r.json() as T & { error?: string };
    if (!r.ok) throw new Error(withTrackingCode(j.error || "حدث خطأ.", r.status, r));
    return j;
  };
}

// ISO → <input type="datetime-local"> value (local wall-clock), and "now + h hours" in the same form.
export const localDate = (h: number) => { const d = new Date(Date.now() + h * 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const toLocalInput = (iso: string) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fmt = (v: string) => (v ? new Date(v).toLocaleString("ar") : "بدون موعد");
