// Teacher self-profile client (builder-authenticated; the server always acts on the token subject — no teacher id
// is ever sent). Display-name authority order on the client: profile displayName → session displayName → "المعلم".
export type TeacherProfile = {
  teacherId: string;
  displayName: string;
  hasCustomName: boolean;
  avatarId: string;
  profilePhoto: { version: number; updatedAt: string } | null;
  updatedAt: string;
};

export const DEFAULT_TEACHER_NAME = "المعلم";

export function teacherHeaders(token: string): Record<string, string> {
  return { "x-builder-token": token, Authorization: "Bearer " + token };
}

export function resolveTeacherDisplayName(profile: TeacherProfile | null | undefined, sessionDisplayName: string | null | undefined): string {
  return (profile && profile.displayName) || (sessionDisplayName || "").trim() || DEFAULT_TEACHER_NAME;
}

export function normalizeTeacherProfile(raw: unknown): TeacherProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const photo = r.profilePhoto && typeof r.profilePhoto === "object" && Number((r.profilePhoto as { version?: unknown }).version) > 0
    ? { version: Number((r.profilePhoto as { version: unknown }).version), updatedAt: String((r.profilePhoto as { updatedAt?: unknown }).updatedAt || "") } : null;
  return { teacherId: String(r.teacherId || ""), displayName: String(r.displayName || "").trim() || DEFAULT_TEACHER_NAME, hasCustomName: r.hasCustomName === true, avatarId: String(r.avatarId || ""), profilePhoto: photo, updatedAt: String(r.updatedAt || "") };
}

async function call(token: string, init: RequestInit = {}): Promise<TeacherProfile> {
  const r = await fetch("/api/teacher-profile", { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...teacherHeaders(token) } });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; profile?: unknown };
  if (!r.ok || !j.ok) throw new Error(j.error || "حدث خطأ.");
  const profile = normalizeTeacherProfile(j.profile);
  if (!profile) throw new Error("حدث خطأ.");
  return profile;
}

export const teacherProfileApi = {
  load: (token: string) => call(token),
  setAvatar: (token: string, avatarId: string) => call(token, { method: "POST", body: JSON.stringify({ action: "setAvatar", avatarId }) }),
  setDisplayName: (token: string, displayName: string) => call(token, { method: "POST", body: JSON.stringify({ action: "setDisplayName", displayName }) }),
  uploadPhoto: (token: string, dataUrl: string) => call(token, { method: "POST", body: JSON.stringify({ action: "uploadPhoto", dataUrl }) }),
  removePhoto: (token: string) => call(token, { method: "POST", body: JSON.stringify({ action: "removePhoto" }) }),
};
