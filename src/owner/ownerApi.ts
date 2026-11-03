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
  /** P3-A — the access the owner assigned, or null (the account's default: none for a console account, today's for t_legacy). */
  access?: TeacherAccess | null;
  /** P4-B1 — when and why the owner suspended the account (empty unless suspended; never shown to the teacher). */
  suspendedAt?: string; suspendedReason?: string;
  /** Trial accounts — null for a permanent account; `ended` is decided by the server's clock. */
  trial?: TeacherTrial | null;
  /** P4-C — the school the owner linked the teacher to (null = none). */
  schoolId?: string | null;
};
/** `endingSoon`: a running trial in its last days (the server's clock and window, like `ended`). */
export type TeacherTrial = { days: number; endsAt: string; ended: boolean; endingSoon?: boolean };
/** The trial lengths the owner picks from (the server accepts any whole number of days from 1 to 90). */
export const TRIAL_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type TeacherAccess = { revisionId: string; preset: { id: string; version: number }; grants: number; denies: number };
export type AccessPreset = { id: string; version: number; label: string; description: string; capabilities: string[] };
export type AccessMode = "legacy" | "observe" | "enforce" | "invalid";
/** P2-B — whether the owner may import the shared-password workspace now (once), and if not, why. */
export type LegacyImportState = { available: true } | { available: false; reason: "NOT_SHARED_PASSWORD_MODE" | "LEGACY_DATA_OWNER_SET" | "ALREADY_IMPORTED"; accountId?: string };
export type TeacherInvitationLink = { invitationPath: string; purpose: "invite" | "reset"; expiresAt: string };
export type TeacherDraft = {
  username: string; displayName: string; fullName?: string; email?: string; phone?: string; subjects?: string[]; notes?: string; presetId?: string; presetVersion?: number;
  /** P4-B2 — individual changes to the preset (the wizard's «copy from a teacher»), and a note kept with the first revision. */
  grants?: string[]; denies?: string[]; accessReason?: string;
  /** P5-A — the course entitlement (null / absent = every published course). */
  courses?: string[] | null;
  /** Trial accounts — a trial of this many days (1–90); absent = a permanent account. */
  trialDays?: number;
};
export type TeacherAction = "reinvite" | "reset" | "suspend" | "reactivate" | "end-sessions";
export type TeacherProfileFields = { displayName: string; fullName: string; email: string; phone: string; subjects: string[]; notes: string };

export const ownerTeachersApi = {
  list: (token: string) => call<{ ok: true; teachers: ManagedTeacher[]; legacyImport?: LegacyImportState }>("/api/owner-teachers", { token }),
  create: (token: string, draft: TeacherDraft) => call<{ ok: true; teacher: ManagedTeacher; invitation: TeacherInvitationLink }>("/api/owner-teachers/create", { method: "POST", token, body: draft }),
  importLegacy: (token: string, draft: TeacherDraft) => call<{ ok: true; teacher: ManagedTeacher; invitation: TeacherInvitationLink }>("/api/owner-teachers/import-legacy", { method: "POST", token, body: draft }),
  act: (token: string, action: TeacherAction, accountId: string, extra: { reason?: string } = {}) =>
    call<{ ok: true; teacher: ManagedTeacher; invitation?: TeacherInvitationLink }>("/api/owner-teachers/" + action, { method: "POST", token, body: { accountId, ...extra } }),
  /** Trial accounts — `extend-trial` adds `days` to the trial; `end-trial` makes the account permanent. */
  trial: (token: string, action: "extend-trial" | "end-trial", accountId: string, days?: number) =>
    call<{ ok: true; teacher: ManagedTeacher }>("/api/owner-teachers/" + action, { method: "POST", token, body: action === "extend-trial" ? { accountId, days } : { accountId } }),
  /** P4-B1 — the teacher's details (never the username: it is the sign-in name and stays fixed). */
  update: (token: string, accountId: string, fields: TeacherProfileFields) =>
    call<{ ok: true; teacher: ManagedTeacher }>("/api/owner-teachers/update", { method: "POST", token, body: { accountId, ...fields } })
};

// Tadris+ P3-A — teacher capabilities (/api/owner-access). Assigning needs a recent step-up like every owner change.
export type AccessCapability = { id: string; module: string; moduleLabel: string; label: string; ownerOnly: boolean; requires?: string[] };
/** P5-A — a course of the catalog as the owner sees it. */
export type CatalogCourse = { courseId: string; title: string; subject: string; modules: number; status: "published" | "archived"; updatedAt: string; updatedBy: string };
/** P4-B1 — one immutable revision of a teacher's access, re-validated by the server (newest first). */
export type AccessHistoryEntry = {
  revisionId: string; parentRevisionId: string | null; preset: { id: string; version: number } | null; grants: string[]; denies: string[];
  /** P5-A — the course entitlement: null = every published course; an array = only those. */
  courses?: string[] | null;
  reason: string; createdAt: string; createdBy: string; valid: boolean; code?: string; capabilities: string[];
};
/** P4-B1 — what the server's resolver gives the account right now, and whether the owner's mode enforces it. */
export type EffectiveAccess = {
  accountStatus: TeacherStatus; mode: AccessMode; enforced: boolean;
  access: { status: "ok" | "unavailable"; source?: string; code?: string; revisionId: string | null; preset: { id: string; version: number } | null; capabilities: string[]; courses?: string[] | null };
};
export type ReadinessTeacher = {
  accountId: string; username: string; displayName: string; status: TeacherStatus;
  access: { revisionId: string; preset: { id: string; version: number } } | null; defaultAccess: "legacy-full" | "none" | null;
  wouldDeny: { capability: string; count: number; lastAt: string }[];
};
export const ownerAccessApi = {
  get: (token: string) => call<{ ok: true; mode: AccessMode; presets: AccessPreset[]; capabilities: AccessCapability[] }>("/api/owner-access", { token }),
  readiness: (token: string) => call<{ ok: true; mode: AccessMode; ready: boolean; teachers: ReadinessTeacher[] }>("/api/owner-access/readiness", { token }),
  setMode: (token: string, mode: "legacy" | "observe" | "enforce") => call<{ ok: true; mode: AccessMode }>("/api/owner-access/mode", { method: "POST", token, body: { mode } }),
  assign: (token: string, body: { accountId: string; presetId: string; presetVersion: number; baseRevisionId: string | null; grants?: string[]; denies?: string[]; reason?: string; courses?: string[] | null }) =>
    call<{ ok: true; accountId: string; access: TeacherAccess; capabilities: string[]; courses?: string[] | null }>("/api/owner-access/assign", { method: "POST", token, body }),
  /** P5-A — every course with its catalog status (owner decision D12). */
  catalog: (token: string) => call<{ ok: true; courses: CatalogCourse[] }>("/api/owner-access/catalog", { token }),
  courseStatus: (token: string, courseId: string, status: "published" | "archived") =>
    call<{ ok: true; courseId: string; status: "published" | "archived" }>("/api/owner-access/course-status", { method: "POST", token, body: { courseId, status } }),
  history: (token: string, accountId: string) =>
    call<{ ok: true; accountId: string; currentRevisionId: string | null; entries: AccessHistoryEntry[]; truncated: boolean; limit: number }>("/api/owner-access/history?accountId=" + encodeURIComponent(accountId), { token }),
  effective: (token: string, accountId: string) =>
    call<EffectiveAccess & { ok: true; accountId: string }>("/api/owner-access/effective?accountId=" + encodeURIComponent(accountId), { token }),
  rollback: (token: string, body: { accountId: string; revisionId: string; baseRevisionId: string | null; reason?: string }) =>
    call<{ ok: true; accountId: string; restoredFrom: string; access: TeacherAccess; capabilities: string[] }>("/api/owner-access/rollback", { method: "POST", token, body })
};

/**
 * Tadris+ P4-B2 — a teacher's CURRENT access as the server re-validated it (the head of their history), to copy to another
 * teacher. Refused when the teacher has no assigned access yet, or when it cannot be trusted. The copy is then saved like any
 * assignment, so the server validates it again.
 */
export async function currentAccessOf(token: string, accountId: string): Promise<ApiResult<AccessHistoryEntry>> {
  const r = await ownerAccessApi.history(token, accountId);
  if (!r.ok) return r;
  const head = r.data.currentRevisionId ? r.data.entries.find(e => e.revisionId === r.data.currentRevisionId) : undefined;
  if (!head) return { ok: false, status: 409, code: "COPY_SOURCE_NO_ACCESS", error: "لم تُحدَّد صلاحيات لهذا المعلم بعد، فلا شيء يُنسخ." };
  if (!head.valid || !head.preset) return { ok: false, status: 409, code: "COPY_SOURCE_INVALID", error: "صلاحيات هذا المعلم الحالية غير صالحة، فلا يمكن نسخها." };
  return { ok: true, status: 200, data: head };
}

// Tadris+ P4-C — school identities (/api/owner-schools). Every change needs a recent step-up.
export type ManagedSchool = { schoolId: string; name: string; logo: { version: number; updatedAt: string } | null; teachers: number };
export const ownerSchoolsApi = {
  list: (token: string) => call<{ ok: true; schools: ManagedSchool[] }>("/api/owner-schools", { token }),
  create: (token: string, name: string) => call<{ ok: true; school: ManagedSchool }>("/api/owner-schools/create", { method: "POST", token, body: { name } }),
  rename: (token: string, schoolId: string, name: string) => call<{ ok: true; school: Omit<ManagedSchool, "teachers"> }>("/api/owner-schools/rename", { method: "POST", token, body: { schoolId, name } }),
  uploadLogo: (token: string, schoolId: string, dataUrl: string) => call<{ ok: true; school: Omit<ManagedSchool, "teachers"> }>("/api/owner-schools/logo", { method: "POST", token, body: { schoolId, dataUrl } }),
  removeLogo: (token: string, schoolId: string) => call<{ ok: true; school: Omit<ManagedSchool, "teachers"> }>("/api/owner-schools/remove-logo", { method: "POST", token, body: { schoolId } }),
  link: (token: string, accountId: string, schoolId: string | null) => call<{ ok: true; accountId: string; schoolId: string | null }>("/api/owner-schools/link", { method: "POST", token, body: { accountId, schoolId } })
};
export const ownerSchoolLogoUrl = (schoolId: string) => "/api/owner-schools/logo?schoolId=" + encodeURIComponent(schoolId);

// Tadris+ P4-D — owner decision D19: the owner's own teacher account (/api/owner-handoff). Linking and opening need a step-up.
export type LinkedTeacher = { accountId: string; username: string; displayName: string; status: string; usable: boolean; reason: string | null };
export const ownerHandoffApi = {
  get: (token: string) => call<{ ok: true; linked: LinkedTeacher | null }>("/api/owner-handoff", { token }),
  link: (token: string, accountId: string | null) => call<{ ok: true; linked: LinkedTeacher | null }>("/api/owner-handoff/link", { method: "POST", token, body: { accountId } }),
  issue: (token: string) => call<{ ok: true; handoffPath: string; expiresAt: string }>("/api/owner-handoff/issue", { method: "POST", token, body: {} })
};

/** The full link the owner sends: this site + the invitation path (the token stays in the URL fragment). */
export function invitationUrl(invitationPath: string, location: { origin: string; pathname: string } = window.location): string {
  return location.origin + location.pathname + invitationPath;
}

/** "ABCDEFGH…" → "ABCD EFGH …" for reading and typing the TOTP secret by hand. */
export function groupSecret(secret: string): string {
  return String(secret || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

// Tadris+ P5-B2 — owner decision D18 (revised): the owner creates and manages a teacher's classes (/api/owner-classes). Every change
// needs a recent step-up. A class created here is the teacher's own (they see it and add their students to it).
export type OwnerClassStatus = "active" | "archived";
export type OwnerClass = {
  classId: string; name: string; grade: string; schoolYear: string; status: OwnerClassStatus; studentCount: number;
  programCodes: string[]; createdAt: string; archivedAt: string;
};
export type OwnerClassFields = { name: string; grade: string; schoolYear: string };
export type OwnerClassLifecycle = "archive" | "unarchive" | "graduate";
export const ownerClassesApi = {
  list: (token: string, accountId: string) => call<{ ok: true; accountId: string; classes: OwnerClass[] }>("/api/owner-classes?accountId=" + encodeURIComponent(accountId), { token }),
  create: (token: string, accountId: string, fields: OwnerClassFields, requestKey: string) =>
    call<{ ok: true; classroom: OwnerClass; duplicate?: boolean }>("/api/owner-classes/create", { method: "POST", token, body: { accountId, ...fields, requestKey } }),
  update: (token: string, classId: string, fields: OwnerClassFields) =>
    call<{ ok: true; classId: string; changed: boolean }>("/api/owner-classes/update", { method: "POST", token, body: { classId, ...fields } }),
  lifecycle: (token: string, action: OwnerClassLifecycle, classId: string) =>
    call<{ ok: true; status: OwnerClassStatus }>("/api/owner-classes/" + action, { method: "POST", token, body: { classId } })
};
