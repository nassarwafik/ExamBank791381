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
  regenerateRecoveryCodes: (token: string) => call<{ ok: true; recoveryCodes: string[] }>("/api/owner-session/recovery-codes", { method: "POST", token, body: {} }),
  // Tadris+ P10-C — the owner's own credentials (step-up + the current password). After a change the server ends every other
  // owner session and answers this device's NEW token (or signInAgain when it could not open one).
  changePassword: (token: string, body: { currentPassword: string; newPassword: string }) =>
    call<CredentialChange>("/api/owner-session/password", { method: "POST", token, body }),
  beginTotpReenrol: (token: string, body: { currentPassword: string }) =>
    call<{ ok: true; totp: TotpEnrolment; expiresInSeconds: number }>("/api/owner-session/totp-begin", { method: "POST", token, body }),
  confirmTotpReenrol: (token: string, body: { code: string }) =>
    call<CredentialChange & { recoveryCodes: string[] }>("/api/owner-session/totp-confirm", { method: "POST", token, body })
};
export type CredentialChange = { ok: true; token?: string; expiresInSeconds?: number; signInAgain?: boolean };

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
export type AccessPreset = { id: string; version: number; label: string; description: string; capabilities: string[]; /** P5-B4: false = superseded by a newer version of the same preset */ current?: boolean };
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
export type AccessCapability = { id: string; module: string; moduleLabel: string; label: string; ownerOnly: boolean; requires?: string[]; reserved?: boolean; reservedNote?: string };   // P10-K: reserved
/** P7-A2 — a dashboard widget of the server's registry (lib/dashboard-widgets.js): the page that shows it and what it needs. */
export type DashboardWidget = { id: string; page: "today" | "analytics"; label: string; capabilities: string[] };
/** P7-B2 — an educational game of the server's registry (lib/game-catalog.js) and the capability it needs. */
export type EducationalGame = { id: string; label: string; capability: string };
/** P8-A2 — a part of the teacher's appearance the owner can restrict (lib/appearance-registry.js). */
export type AppearancePart = { part: string; values: string[]; fallback: string; capability: string };
/** P8-A2 — the owner's appearance restriction: a part → only these values (absent = every value). */
export type AppearanceRestriction = Record<string, string[]>;
/** P5-A — a course of the catalog as the owner sees it. */
export type CatalogCourse = { courseId: string; title: string; subject: string; modules: number; status: "published" | "archived"; updatedAt: string; updatedBy: string };
/** P4-B1 — one immutable revision of a teacher's access, re-validated by the server (newest first). */
export type AccessHistoryEntry = {
  revisionId: string; parentRevisionId: string | null; preset: { id: string; version: number } | null; grants: string[]; denies: string[];
  /** P5-A — the course entitlement: null = every published course; an array = only those. */
  courses?: string[] | null;
  /** P7-A2 — the widget entitlement: null = every widget; an array = only those. */
  widgets?: string[] | null;
  /** P7-B2 — the game entitlement: null = every game; an array = only those. */
  games?: string[] | null;
  /** P8-A2 — the appearance restriction (null = every value of every part). */
  appearance?: AppearanceRestriction | null;
  reason: string; createdAt: string; createdBy: string; valid: boolean; code?: string; capabilities: string[];
};
/** P4-B1 — what the server's resolver gives the account right now, and whether the owner's mode enforces it. */
export type EffectiveAccess = {
  accountStatus: TeacherStatus; mode: AccessMode; enforced: boolean;
  access: { status: "ok" | "unavailable"; source?: string; code?: string; revisionId: string | null; preset: { id: string; version: number } | null; capabilities: string[]; courses?: string[] | null; widgets?: string[] | null; games?: string[] | null; appearance?: AppearanceRestriction | null };
};
export type ReadinessTeacher = {
  accountId: string; username: string; displayName: string; status: TeacherStatus;
  access: { revisionId: string; preset: { id: string; version: number } } | null; defaultAccess: "legacy-full" | "none" | null;
  wouldDeny: { capability: string; count: number; lastAt: string }[];
};
export const ownerAccessApi = {
  get: (token: string) => call<{ ok: true; mode: AccessMode; presets: AccessPreset[]; capabilities: AccessCapability[]; widgets?: DashboardWidget[]; games?: EducationalGame[]; appearance?: AppearancePart[] }>("/api/owner-access", { token }),
  readiness: (token: string) => call<{ ok: true; mode: AccessMode; ready: boolean; teachers: ReadinessTeacher[] }>("/api/owner-access/readiness", { token }),
  setMode: (token: string, mode: "legacy" | "observe" | "enforce") => call<{ ok: true; mode: AccessMode }>("/api/owner-access/mode", { method: "POST", token, body: { mode } }),
  assign: (token: string, body: { accountId: string; presetId: string; presetVersion: number; baseRevisionId: string | null; grants?: string[]; denies?: string[]; reason?: string; courses?: string[] | null; widgets?: string[] | null; games?: string[] | null; appearance?: AppearanceRestriction | null }) =>
    call<{ ok: true; accountId: string; access: TeacherAccess; capabilities: string[]; courses?: string[] | null; widgets?: string[] | null; games?: string[] | null; appearance?: AppearanceRestriction | null }>("/api/owner-access/assign", { method: "POST", token, body }),
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

// Tadris+ P6-D — each teacher's own exam bank (/api/owner-library). Every library exam has an audience: «all» (every teacher's bank)
// or «selected» (only the teachers listed). Every change needs a recent step-up.
export type LibraryAudience = "all" | "selected";
export type OwnerLibraryItem = {
  libraryItemId: string; title: string; category: string; questionCount: number; totalMarks: number;
  audience: LibraryAudience; teachers: string[]; decided: boolean;
  /** Tadris+ P6-E — an exam the owner imported (IMP-nnn), and whether it is an exam or a training. */
  imported?: boolean; activityType?: LibraryActivityType;
  /** Tadris+ P6-F — sent by a teacher; the version it replaces / the version that replaced it. */
  fromTeacher?: boolean; replaces?: string; replacedBy?: string;
};
/** Tadris+ P6-F — an exam a teacher (or the owner's own workspace) sent to the platform bank. */
export type LibrarySubmissionStatus = "pending" | "published" | "declined" | "withdrawn" | "superseded";
export type OwnerSubmission = {
  submissionId: string; teacherId: string; teacherName: string; title: string; questionCount: number; totalMarks: number; status: LibrarySubmissionStatus;
  submittedAt: string; sentBy: "teacher" | "owner"; governed: boolean; decidedAt?: string; reason?: string; libraryItemId?: string;
};
export type OwnerSubmissionDetail = {
  submission: OwnerSubmission; exam: Record<string, unknown>; replaces: { libraryItemId: string; title: string } | null;
  finalization: { canFinalize: boolean } | null; blockers: string[];
};
export type OwnSavedExam = { blobName: string; title: string; savedAt: string; questionCount: number };
export type LibraryActivityType = "exam" | "training";
/** Tadris+ P6-E — what the owner publishes: one prepared structured exam (the server decides it is ready). */
export type LibraryImportInput = { exam: unknown; title: string; category: string; activityType: LibraryActivityType; description: string; sourceFileName: string };
export type OwnerLibraryTeacher = { accountId: string; displayName: string; username: string; status: string };
export const ownerLibraryApi = {
  list: (token: string) => call<{ ok: true; items: OwnerLibraryItem[]; teachers: OwnerLibraryTeacher[] }>("/api/owner-library", { token }),
  setAudience: (token: string, itemId: string, audience: LibraryAudience, teachers: string[]) =>
    call<{ ok: true; item: Pick<OwnerLibraryItem, "libraryItemId" | "audience" | "teachers" | "decided"> }>("/api/owner-library/set-audience", { method: "POST", token, body: { itemId, audience, teachers } }),
  setTeacher: (token: string, accountId: string, include: string[], exclude: string[]) =>
    call<{ ok: true; accountId: string; added: string[]; removed: string[] }>("/api/owner-library/set-teacher", { method: "POST", token, body: { accountId, include, exclude } }),
  importExam: (token: string, input: LibraryImportInput) =>
    call<{ ok: true; item: OwnerLibraryItem }>("/api/owner-library/import", { method: "POST", token, body: input }),
  // Tadris+ P6-F — the exams teachers send
  submissions: (token: string) => call<{ ok: true; submissions: OwnerSubmission[]; pending: number }>("/api/owner-library/submissions", { token }),
  submission: (token: string, id: string) => call<{ ok: true } & OwnerSubmissionDetail>("/api/owner-library/submission?id=" + encodeURIComponent(id), { token }),
  publishSubmission: (token: string, submissionId: string, input: { title: string; category: string; activityType: LibraryActivityType; description: string }) =>
    call<{ ok: true; item: OwnerLibraryItem; submissionId: string; replaces?: string; replacementPending?: boolean }>("/api/owner-library/publish-submission", { method: "POST", token, body: { submissionId, ...input } }),
  declineSubmission: (token: string, submissionId: string, reason: string) =>
    call<{ ok: true; submission: OwnerSubmission }>("/api/owner-library/decline-submission", { method: "POST", token, body: { submissionId, reason } }),
  completeReplacement: (token: string, libraryItemId: string) =>
    call<{ ok: true; libraryItemId: string; replaces: string }>("/api/owner-library/complete-replacement", { method: "POST", token, body: { libraryItemId } }),
  ownExams: (token: string) => call<{ ok: true; linked: boolean; exams: OwnSavedExam[] }>("/api/owner-library/own-exams", { token }),
  takeOwn: (token: string, blobName: string) => call<{ ok: true; submission: OwnerSubmission }>("/api/owner-library/take-own", { method: "POST", token, body: { blobName } })
};

// Tadris+ P5-B4 — the owner adds students to a teacher's class (/api/owner-classes): one, or a list after the server preview. The
// temporary passwords come back once, in the answer only.
export type OwnerStudentRow = { firstName: string; familyName: string; identityNumber: string };
// Tadris+ P11-A — "existing": the identity number already has an account in ANOTHER class (`existingStudent` names it); the owner may
// add that same account to this class too (enroll), instead of the transfer that takes the student away from the first teacher.
export type OwnerExistingStudent = { userId: string; displayName: string; classId: string; className: string; active: boolean; archived: boolean };
export type OwnerImportPreviewRow = OwnerStudentRow & { index?: number; status: "valid" | "duplicate" | "invalid" | "existing"; error?: string; message?: string; existingStudent?: OwnerExistingStudent | null };
export type OwnerEnrollResult = { ok: true; enrolled: number; already: number; failed: number; students: Array<{ userId: string; displayName: string; identityNumber: string }>; errors: Array<{ userId: string; code: string; error: string }> };
export type OwnerCredential = { userId?: string; firstName?: string; familyName?: string; displayName?: string; identityNumber?: string; code: string; password: string; recovered?: boolean };
export const ownerStudentsApi = {
  add: (token: string, classId: string, row: OwnerStudentRow & { password?: string }) =>
    call<{ ok: true; student: { userId: string; firstName: string; familyName: string; displayName: string; identityNumber: string; code: string }; temporaryPassword: string }>("/api/owner-classes/add-student", { method: "POST", token, body: { classId, ...row } }),
  preview: (token: string, classId: string, students: OwnerStudentRow[]) =>
    call<{ ok: true; preview: OwnerImportPreviewRow[]; valid: number; duplicates: number; invalid: number; existing?: number }>("/api/owner-classes/preview-import", { method: "POST", token, body: { classId, students } }),
  // P11-A — existing accounts join this class too (the same account: no password, the first teacher keeps the student)
  enroll: (token: string, classId: string, userIds: string[]) =>
    call<OwnerEnrollResult>("/api/owner-classes/enroll-students", { method: "POST", token, body: { classId, userIds } }),
  unenroll: (token: string, classId: string, userId: string) =>
    call<{ ok: true; removed: boolean }>("/api/owner-classes/unenroll-student", { method: "POST", token, body: { classId, userId } }),
  import: (token: string, classId: string, students: OwnerStudentRow[], importId: string) =>
    call<{ ok: true; imported: number; failed: number; duplicates: number; recovered: number; credentials: OwnerCredential[]; errors: Array<OwnerStudentRow & { error: string }> }>("/api/owner-classes/import-students", { method: "POST", token, body: { classId, students, importId } })
};

// Tadris+ P5-B3a — moving a whole class to another teacher (/api/owner-classes): preview first, then the transfer (step-up).
export type ClassTransferPreview = {
  classId: string; className: string; status: OwnerClassStatus; from: string; to: string;
  students: { total: number; archived: number; foreign: number }; assignments: { total: number; byStatus: Record<string, number> }; pendingGrading: number;
};
export type ClassTransferLedger = { transferId: string; complete: boolean; resumed: boolean; students: { moved: number; skipped: number; failed: number } };
export const ownerTransferApi = {
  preview: (token: string, classId: string, toAccountId: string) =>
    call<{ ok: true; preview: ClassTransferPreview }>("/api/owner-classes/transfer-preview?classId=" + encodeURIComponent(classId) + "&toAccountId=" + encodeURIComponent(toAccountId), { token }),
  transfer: (token: string, classId: string, toAccountId: string, expectedFromAccountId: string, reason: string) =>
    call<{ ok: true; ledger: ClassTransferLedger }>("/api/owner-classes/transfer", { method: "POST", token, body: { classId, toAccountId, expectedFromAccountId, reason } })
};

// Tadris+ P5-B3b — one student into another teacher's class (/api/owner-classes).
export type OwnerRosterStudent = { userId: string; displayName: string; identityNumber: string; active: boolean; archived: boolean; shared?: boolean };   // P11-A: shared = added from another class
export type StudentTransferPreview = { userId: string; displayName: string; archived: boolean; fromClassId: string; fromClassName: string; from: string; toClassId: string; toClassName: string; to: string; pendingGrading: number };
export const ownerStudentTransferApi = {
  roster: (token: string, classId: string) => call<{ ok: true; classId: string; students: OwnerRosterStudent[] }>("/api/owner-classes/students?classId=" + encodeURIComponent(classId), { token }),
  preview: (token: string, userId: string, toClassId: string) =>
    call<{ ok: true; preview: StudentTransferPreview }>("/api/owner-classes/student-transfer-preview?userId=" + encodeURIComponent(userId) + "&toClassId=" + encodeURIComponent(toClassId), { token }),
  transfer: (token: string, userId: string, fromClassId: string, toClassId: string, reason: string) =>
    call<{ ok: true; ledger: { transferId: string; complete: boolean } }>("/api/owner-classes/student-transfer", { method: "POST", token, body: { userId, fromClassId, toClassId, reason } })
};

// Tadris+ P7-B1 — owner decision D14: ONE conversation, read only, for a written reason (each opening needs its own reason and a
// recent second-factor check, and is recorded in the owner's audit log and in the teacher's activity log).
export type OwnerConversationMessage = { messageId: string; kind: string; senderRole: string; senderDisplayName: string; body: string; createdAt: string; deleted?: boolean; editedAt?: string };
export const ownerConversationsApi = {
  // Tadris+ P11-B — `conversation`: the shared class whose conversation is opened (a student added to another teacher's class has a
  // separate conversation with that teacher); omitted = the student's conversation with the home teacher.
  open: (token: string, studentId: string, reason: string, before?: string, conversation?: string) =>
    call<{ ok: true; student: { userId: string; displayName: string }; messages: OwnerConversationMessage[]; hasMore: boolean }>("/api/owner-conversations/open", { method: "POST", token, body: { studentId, reason, ...(before ? { before } : {}), ...(conversation ? { conversation } : {}) } })
};

// Tadris+ P9-A2 — «البيانات القديمة» (/api/owner-legacy-classes, P9-A1): the owner's decision for every class without an owner —
// a teacher, «يبقى مشتركًا» or «أرشفة». Preview (a dry run), apply (only on the preview's digest), undo (only when nothing changed
// since). Every POST needs a recent second-factor check and (apply / undo) a reason; the server decides everything.
export type LegacyDecision = "assign" | "shared" | "archive";
export type LegacyVisibility = { kind: "shared" } | { kind: "legacy-owner"; accountId: string } | { kind: "teacher"; accountId: string };
export type LegacyClass = {
  classId: string; name: string; grade: string; schoolYear: string; status: string;
  students: { total: number; archived: number; withOwner: number }; assignments: { total: number; byStatus: Record<string, number> };
  decision: { migrationId: string; decision: LegacyDecision; toAccountId: string; at: string; by: string } | null;
};
export type LegacyChange = { path: string; type: "class" | "student"; userId?: string; field: string; before: string | null; after: string; archived?: boolean; outcome?: string };
export type LegacyPlan = {
  classId: string; className: string; status: string; decision: LegacyDecision; to: string;
  changes: LegacyChange[]; untouched: { userId: string; ownerId: string; reason: string }[];
  students: { total: number; changed: number; untouched: number }; pendingGrading: number;
  visibility: { before: LegacyVisibility; after: LegacyVisibility; studentServicesFollow: string }; digest: string;
};
export type LegacyLedger = {
  migrationId: string; classId: string; className: string; decision: LegacyDecision; to: string; reason: string; by: string; at: string;
  status: "pending" | "applied" | "undone" | "refused"; changes: LegacyChange[]; untouched: { userId: string }[];
  undoneAt?: string; undoReason?: string; refusedCode?: string;
};
export const ownerLegacyApi = {
  inventory: (token: string) => call<{ ok: true; visibilityToday: LegacyVisibility; classes: LegacyClass[] }>("/api/owner-legacy-classes", { token }),
  ledger: (token: string) => call<{ ok: true; ledgers: LegacyLedger[] }>("/api/owner-legacy-classes/ledger", { token }),
  preview: (token: string, classId: string, decision: LegacyDecision, toAccountId: string) =>
    call<{ ok: true; plan: LegacyPlan }>("/api/owner-legacy-classes/preview", { method: "POST", token, body: { classId, decision, ...(decision === "assign" ? { toAccountId } : {}) } }),
  apply: (token: string, body: { classId: string; decision: LegacyDecision; toAccountId: string; reason: string; previewDigest: string; requestKey: string }) =>
    call<{ ok: true; ledger: LegacyLedger; duplicate?: boolean }>("/api/owner-legacy-classes/apply", { method: "POST", token, body: { ...body, ...(body.decision === "assign" ? {} : { toAccountId: undefined }) } }),
  undo: (token: string, migrationId: string, reason: string) =>
    call<{ ok: true; ledger: LegacyLedger }>("/api/owner-legacy-classes/undo", { method: "POST", token, body: { migrationId, reason } })
};
