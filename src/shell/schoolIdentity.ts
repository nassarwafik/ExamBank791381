// Tadris+ P4-C — the school identity shown at the top of the teacher shell and the student portal (presentation only). It comes
// with the sign-in answer and the session probe (no extra request), only when the account has a school; the logo bytes come from
// /api/school-logo, which serves the CALLER's own school only. Absent / malformed → null → nothing is shown (zero change).
export type SchoolIdentity = { schoolId: string; name: string; logoVersion: number | null };
export type SchoolBadgeView = { name: string; logoUrl: string | null };

export function parseSchoolIdentity(value: unknown): SchoolIdentity | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { schoolId?: unknown; name?: unknown; logo?: unknown };
  if (typeof v.schoolId !== "string" || !/^sch_[a-f0-9]{16}$/.test(v.schoolId)) return null;
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name) return null;
  const logo = v.logo && typeof v.logo === "object" ? Number((v.logo as { version?: unknown }).version) : 0;
  return { schoolId: v.schoolId, name, logoVersion: Number.isFinite(logo) && logo > 0 ? logo : null };
}

export const SCHOOL_LOGO_URL = "/api/school-logo";
