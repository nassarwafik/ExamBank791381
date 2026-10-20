// Phase R-2 — the teacher shell's session-expired handler, provided by ReportsCenter to every report view (an authoritative 401
// from /api/reports ends the teacher session, exactly like TeacherPlatform's onSessionExpired).
import { createContext } from "react";

export const ReportSessionContext = createContext<(() => void) | undefined>(undefined);
