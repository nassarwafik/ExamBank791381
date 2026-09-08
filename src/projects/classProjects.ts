// Frontend single source of truth for a classroom's project membership (mirrors the backend helper).
// Modern classroom.projectCodes is authoritative once present (even []); otherwise fall back to the
// legacy classroom.programCode.
export function getClassProjectCodes(c: { projectCodes?: string[]; programCode?: string } | null | undefined): string[] {
  if (!c) return [];
  if (Array.isArray(c.projectCodes)) return c.projectCodes.slice();
  const legacy = String(c.programCode || "").trim();
  return legacy ? [legacy] : [];
}

export function classHasProject(c: { projectCodes?: string[]; programCode?: string } | null | undefined, projectCode: string): boolean {
  return getClassProjectCodes(c).includes(projectCode);
}
