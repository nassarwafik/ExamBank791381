// Tadris+ P1-A2 — the owner screens' transport to the P1-A routes (/api/owner-bootstrap, /api/owner-login, /api/owner-session).
// The owner token travels ONLY in the `x-owner-token` header and is kept in its own sessionStorage key (closing the tab ends
// the browser side of the session). It is never mixed with the teacher / student token, and those are never sent here.
// The server is the only authority: these helpers just carry the request and map the answer to a typed result.

export const OWNER_TOKEN_KEY = "tadrisOwnerToken";

export type OwnerProfile = { accountId: string; username: string; displayName: string };
export type OwnerSessionView = {
  owner: OwnerProfile;
  session: { expiresAt: string; stepUpValidUntil: string | null };
  recoveryCodesRemaining: number;
};
export type BootstrapState = "open" | "completed" | "unavailable";
export type TotpEnrolment = { issuer: string; account: string; secret: string; uri: string };

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; error: string };

const NETWORK_ERROR = "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.";
const GENERIC_ERROR = "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى.";

export function readOwnerToken(): string {
  try { return sessionStorage.getItem(OWNER_TOKEN_KEY) || ""; } catch { return ""; }
}
export function writeOwnerToken(token: string): void {
  try { sessionStorage.setItem(OWNER_TOKEN_KEY, token); } catch { /* private mode: the session simply ends with the page */ }
}
export function clearOwnerToken(): void {
  try { sessionStorage.removeItem(OWNER_TOKEN_KEY); } catch { /* nothing stored */ }
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; token?: string } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["x-owner-token"] = init.token;
  let response: Response;
  try {
    response = await fetch(path, { method: init.method || "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store", credentials: "same-origin" });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", error: NETWORK_ERROR };
  }
  let json: Record<string, unknown> = {};
  try { json = (await response.json()) as Record<string, unknown>; } catch { json = {}; }
  if (response.ok && json.ok !== false) return { ok: true, status: response.status, data: json as unknown as T };
  const error = typeof json.error === "string" && json.error ? json.error : response.status === 429 ? "محاولات كثيرة. حاول مرة أخرى بعد قليل." : GENERIC_ERROR;
  return { ok: false, status: response.status, code: typeof json.code === "string" ? json.code : "HTTP_" + response.status, error };
}

export const ownerApi = {
  bootstrapState: () => call<{ ok: true; state: BootstrapState; removeBootstrapSettings?: boolean }>("/api/owner-bootstrap"),
  bootstrapBegin: (body: { token: string; username: string; displayName: string; password: string }) =>
    call<{ ok: true; totp: TotpEnrolment; expiresInSeconds: number }>("/api/owner-bootstrap/begin", { method: "POST", body }),
  bootstrapConfirm: (body: { token: string; code: string }) =>
    call<{ ok: true; owner: OwnerProfile; recoveryCodes: string[] }>("/api/owner-bootstrap/confirm", { method: "POST", body }),
  login: (body: { username: string; password: string; code?: string; recoveryCode?: string }) =>
    call<{ ok: true; token: string; expiresInSeconds: number; owner: OwnerProfile; recoveryCodesRemaining: number }>("/api/owner-login", { method: "POST", body }),
  session: (token: string) => call<OwnerSessionView & { ok: true }>("/api/owner-session", { token }),
  logout: (token: string) => call<{ ok: true }>("/api/owner-session/logout", { method: "POST", token, body: {} }),
  stepUp: (token: string, body: { code?: string; recoveryCode?: string }) =>
    call<OwnerSessionView & { ok: true }>("/api/owner-session/step-up", { method: "POST", token, body }),
  revokeAll: (token: string) => call<{ ok: true }>("/api/owner-session/revoke-all", { method: "POST", token, body: {} }),
  regenerateRecoveryCodes: (token: string) => call<{ ok: true; recoveryCodes: string[] }>("/api/owner-session/recovery-codes", { method: "POST", token, body: {} })
};

// Tadris+ P2-A2b — the owner's teacher management (P2-A2a /api/owner-teachers). Every change needs a recent step-up; the
// caller handles STEP_UP_REQUIRED by asking for a code and retrying.
export type TeacherStatus = "invited" | "active" | "suspended";
export type ManagedTeacher = {
  accountId: string; username: string; displayName: string; fullName: string; email: string; phone: string;
  subjects: string[]; notes: string; organizationId: string; status: TeacherStatus; hasPassword: boolean;
  invitation: { purpose: "invite" | "reset"; expiresAt: string } | null; createdAt: string; updatedAt: string; lastLoginAt: string;
  /** P2-B — "shared-password-workspace" for the imported account of the old shared-password sign-in; "console" otherwise. */
  origin?: "console" | "shared-password-workspace";
};
/** P2-B — whether the owner may import the shared-password workspace now (once), and if not, why. */
export type LegacyImportState = { available: true } | { available: false; reason: "NOT_SHARED_PASSWORD_MODE" | "LEGACY_DATA_OWNER_SET" | "ALREADY_IMPORTED"; accountId?: string };
export type TeacherInvitationLink = { invitationPath: string; purpose: "invite" | "reset"; expiresAt: string };
export type TeacherDraft = { username: string; displayName: string; fullName?: string; email?: string; phone?: string; subjects?: string[]; notes?: string };
export type TeacherAction = "reinvite" | "reset" | "suspend" | "reactivate" | "end-sessions";

export const ownerTeachersApi = {
  list: (token: string) => call<{ ok: true; teachers: ManagedTeacher[]; legacyImport?: LegacyImportState }>("/api/owner-teachers", { token }),
  create: (token: string, draft: TeacherDraft) => call<{ ok: true; teacher: ManagedTeacher; invitation: TeacherInvitationLink }>("/api/owner-teachers/create", { method: "POST", token, body: draft }),
  importLegacy: (token: string, draft: TeacherDraft) => call<{ ok: true; teacher: ManagedTeacher; invitation: TeacherInvitationLink }>("/api/owner-teachers/import-legacy", { method: "POST", token, body: draft }),
  act: (token: string, action: TeacherAction, accountId: string) =>
    call<{ ok: true; teacher: ManagedTeacher; invitation?: TeacherInvitationLink }>("/api/owner-teachers/" + action, { method: "POST", token, body: { accountId } })
};

/** The full link the owner sends: this site + the invitation path (the token stays in the URL fragment). */
export function invitationUrl(invitationPath: string, location: { origin: string; pathname: string } = window.location): string {
  return location.origin + location.pathname + invitationPath;
}

/** "ABCDEFGH…" → "ABCD EFGH …" for reading and typing the TOTP secret by hand. */
export function groupSecret(secret: string): string {
  return String(secret || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
