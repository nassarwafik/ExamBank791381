import { createContext } from "react";

// Phase 17B — the smallest GENERAL renderer seam for attempt-scoped server calls. The student exam page provides the assignment
// id and a request function that adds the student's auth headers itself: a registered renderer (today: the lazy coding
// renderer's practice run) can call the authenticated API without ever seeing the token — it is not context data, not part of
// the Answer, never stored. The function only reaches same-origin "/api/…" paths. The teacher preview / builder provides
// nothing, so renderers fall back to their offline state there.
export type StudentAttemptApi = { assignmentId: string; request: (path: string, init?: RequestInit) => Promise<Response> };

export const StudentAttemptContext = createContext<StudentAttemptApi | undefined>(undefined);

// Phase 17E-B — the teacher preview marks its subtree so a renderer can tell "teacher preview" from "no execution available":
// the coding IDE then shows an explicit preview notice and never attempts to run code (it has no attempt seam there anyway).
export const TeacherPreviewContext = createContext<boolean>(false);
