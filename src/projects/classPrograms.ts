// Frontend single source of truth for a classroom's project membership (mirrors the backend helper).
// Modern classroom.programCodes is authoritative once present (even []); otherwise fall back to the
// legacy classroom.programCode.
export function getClassProgramCodes(c: { programCodes?: string[]; programCode?: string } | null | undefined): string[] {
  if (!c) return [];
  if (Array.isArray(c.programCodes)) return c.programCodes.slice();
  const legacy = String(c.programCode || "").trim();
  return legacy ? [legacy] : [];
}

export function classHasProject(c: { programCodes?: string[]; programCode?: string } | null | undefined, projectCode: string): boolean {
  return getClassProgramCodes(c).includes(projectCode);
}
