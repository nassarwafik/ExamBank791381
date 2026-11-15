import type { AccessHistoryEntry } from "./ownerApi";

// Owner Console «المواد» — the access draft that changes ONLY the course entitlement of a teacher's current revision.

export type CoursesDraft = {
  presetId: string; presetVersion: number; grants: string[]; denies: string[]; reason: string;
  courses?: string[]; widgets?: string[]; games?: string[]; appearance?: AccessHistoryEntry["appearance"];
};

/** The draft that keeps everything of `head` but the course entitlement (`courses` null = every published course). */
export function coursesDraft(head: AccessHistoryEntry, courses: string[] | null, reason: string): CoursesDraft | null {
  if (!head.valid || !head.preset) return null;
  return {
    presetId: head.preset.id, presetVersion: head.preset.version, grants: [...head.grants], denies: [...head.denies], reason,
    ...(courses ? { courses: [...courses].sort() } : {}),
    ...(Array.isArray(head.widgets) ? { widgets: [...head.widgets] } : {}),
    ...(Array.isArray(head.games) ? { games: [...head.games] } : {}),
    ...(head.appearance && Object.keys(head.appearance).length ? { appearance: head.appearance } : {})
  };
}
