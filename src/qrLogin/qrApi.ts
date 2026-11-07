import type { QrNamespace } from "./qrRoute";

// Tadris+ QR-2 — the transport to the QR-1 routes. Two namespaces, kept apart exactly as the server keeps them:
//   platform (teacher / student): /api/qr-login + /api/qr-login-approve, the approver's token as `Authorization: Bearer`
//   owner:                        /api/owner-qr-login + /api/owner-qr-login-approve, the owner token in `x-owner-token` only
// The server is the only authority; these helpers carry the request and map the answer to a typed result.

export const PLATFORM_TOKEN_KEY = "examBankBuilderToken";
export const OWNER_TOKEN_KEY = "tadrisOwnerToken";

export type QrResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; error: string };
export type QrStart = { pairingToken: string; qrPath: string; pollSecret: string; matchCode: number; expiresAt: string; expiresInSeconds: number; pollIntervalMs: number };
export type QrPoll =
  | { status: "pending" }
  | { status: "signed-in"; role: "teacher" | "student" | "owner"; token: string; displayName: string };
export type QrInspect = { role: string; device: { browser: string; os: string }; sameNetwork: boolean; matchOptions: number[]; expiresAt: string };

const NETWORK_ERROR = "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.";
const GENERIC_ERROR = "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى.";

const loginPath = (ns: QrNamespace) => (ns === "owner" ? "/api/owner-qr-login/" : "/api/qr-login/");
const approvePath = (ns: QrNamespace) => (ns === "owner" ? "/api/owner-qr-login-approve/" : "/api/qr-login-approve/");

/** The signed-in session of THIS tab for the namespace (sessionStorage: closing the tab ends it), or "". */
export function approverToken(ns: QrNamespace): string {
  try { return sessionStorage.getItem(ns === "owner" ? OWNER_TOKEN_KEY : PLATFORM_TOKEN_KEY) || ""; } catch { return ""; }
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<QrResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: NETWORK_ERROR };
  }
  let json: Record<string, unknown> = {};
  try { json = (await response.json()) as Record<string, unknown>; } catch { json = {}; }
  if (response.ok && json.ok !== false) return { ok: true, status: response.status, data: json as unknown as T };
  const error = typeof json.error === "string" && json.error ? json.error : response.status === 429 ? "طلبات كثيرة. حاول مرة أخرى بعد قليل." : GENERIC_ERROR;
  return { ok: false, status: response.status, code: typeof json.code === "string" ? json.code : "HTTP_" + response.status, error };
}

const authHeaders = (ns: QrNamespace, token: string): Record<string, string> => (ns === "owner" ? { "x-owner-token": token } : { Authorization: "Bearer " + token });

export const qrApi = {
  start: (ns: QrNamespace) => post<QrStart>(loginPath(ns) + "start", {}),

  /** pending, or the session (normalised: the owner answer carries the owner's display name inside `owner`). */
  async poll(ns: QrNamespace, pairingToken: string, pollSecret: string): Promise<QrResult<QrPoll>> {
    const r = await post<Record<string, unknown>>(loginPath(ns) + "poll", { pairingToken, pollSecret });
    if (!r.ok) return r;
    const d = r.data;
    if (d.status === "pending") return { ok: true, status: r.status, data: { status: "pending" } };
    const role = d.role === "owner" || d.role === "teacher" || d.role === "student" ? d.role : null;
    if (!role || typeof d.token !== "string" || !d.token || (ns === "owner") !== (role === "owner")) return { ok: false, status: r.status, code: "QR_BAD_ANSWER", error: GENERIC_ERROR };
    const owner = d.owner && typeof d.owner === "object" ? (d.owner as Record<string, unknown>) : null;
    const displayName = typeof d.displayName === "string" ? d.displayName : owner && typeof owner.displayName === "string" ? owner.displayName : "";
    return { ok: true, status: r.status, data: { status: "signed-in", role, token: d.token, displayName } };
  },

  inspect: (ns: QrNamespace, token: string, pairingToken: string) => post<QrInspect>(approvePath(ns) + "inspect", { pairingToken }, authHeaders(ns, token)),
  approve: (ns: QrNamespace, token: string, pairingToken: string, matchCode: number) => post<{ status: "approved" }>(approvePath(ns) + "approve", { pairingToken, matchCode }, authHeaders(ns, token)),
  deny: (ns: QrNamespace, token: string, pairingToken: string) => post<{ status: "denied" }>(approvePath(ns) + "deny", { pairingToken }, authHeaders(ns, token)),
  /** The owner's recent step-up (the authenticator code), needed to approve an owner sign-in. */
  ownerStepUp: (token: string, code: string) => post<{ ok: true }>("/api/owner-session/step-up", { code }, { "x-owner-token": token })
};

/** Fixed words from the server (never free text) in Arabic: «Chrome على Windows». */
export function deviceLabel(device: { browser: string; os: string } | null | undefined): string {
  const b = device && device.browser && device.browser !== "unknown" ? device.browser : "متصفح غير معروف";
  const o = device && device.os && device.os !== "unknown" ? device.os : "نظام غير معروف";
  return b + " على " + o;
}
