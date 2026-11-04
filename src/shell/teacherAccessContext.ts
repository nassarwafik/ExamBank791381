import { createContext, useContext } from "react";
import type { TeacherAccessView } from "./teacherAccess";

/**
 * Tadris+ P8-B1 — the teacher's server-resolved access for the tools INSIDE a page (the sidebar already uses it: teacherAccess.ts).
 * PRESENTATION ONLY: every action is enforced by the server (P3-B); this only stops offering a button the server would refuse.
 * The same rule as navAllowed: no access information (an older API) or not enforced → every tool, as before; unavailable → none.
 */
export const TeacherAccessContext = createContext<TeacherAccessView | null>(null);

/** Whether the access view allows `capability` (any one of a list). */
export function canUse(access: TeacherAccessView | null | undefined, capability: string | string[]): boolean {
  if (!access) return true;
  if (access.status === "unavailable") return false;
  if (!access.enforced) return true;
  const list = Array.isArray(capability) ? capability : [capability];
  return list.some(c => access.capabilities.includes(c));
}

/** The hook: `const can = useCan(); can("students.student.create")`. */
export function useCan(): (capability: string | string[]) => boolean {
  const access = useContext(TeacherAccessContext);
  return capability => canUse(access, capability);
}
