export type ClassLifecycleStatus = "active" | "archived";

export interface ClassLifecycleFields {
  status?: string;
  active?: boolean;
}

export function normalizeClassStatus(classroom: ClassLifecycleFields | null | undefined): ClassLifecycleStatus {
  if (classroom?.status === "archived") return "archived";
  if (classroom?.active === false) return "archived";
  return "active";
}
