// Phase 21G.1 — the ONE request helper of the assignments workspace: JSON body, the teacher token on both headers the API
// accepts, and a non-2xx answer becomes an Error whose message is the server's Arabic error with its tracking code.
// Batch 5 (F1): built on teacherFetch (an expired session signs the teacher out; never English or parser text).
import { teacherFetchJson } from "../teacherFetch";

export type AssignmentsApi = <T>(url: string, options?: RequestInit) => Promise<T>;

export function assignmentsApi(token: string): AssignmentsApi {
  return function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    return teacherFetchJson<T>(token, url, options);
  };
}

// ISO → <input type="datetime-local"> value (local wall-clock), and "now + h hours" in the same form.
export const localDate = (h: number) => { const d = new Date(Date.now() + h * 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const toLocalInput = (iso: string) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fmt = (v: string) => (v ? new Date(v).toLocaleString("ar") : "بدون موعد");
