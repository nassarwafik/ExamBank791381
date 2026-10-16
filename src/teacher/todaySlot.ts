// Phase 21H.2 — the dashboard's ONE scope. TeacherPlatform provides how to render the live Today hub; the (lazy) analytics
// Dashboard renders it right under its own scope bar with the page's class and its single refresh. A context (not a prop)
// keeps the Dashboard's lazy boundary exactly as it was.
import { createContext, type ReactNode } from "react";

export type TodayScope = { classId: string; refreshSignal: number };
export const TodaySlot = createContext<((scope: TodayScope) => ReactNode) | null>(null);
