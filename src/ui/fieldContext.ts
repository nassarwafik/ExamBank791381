import { createContext, useId } from "react";

/** Phase 21E.2 — provided by a question card when its field issues must be shown now (independent of focus history). */
export const FieldRevealContext = createContext(false);

/** Stable, DOM-safe ids for one field frame (control, help, error). */
export function useFieldIds(prefix = "eb-field") {
  const base = prefix + "-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return { id: base, helpId: base + "-help", errorId: base + "-error" };
}
