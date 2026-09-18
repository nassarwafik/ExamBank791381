// Learning Materials — Phase 3A: Arabic labels for the interactive-activity families. Kept in its own tiny module
// so both the engine shell and the reader can reuse them (and so component files export only components).
import type { ActivityBlockType } from "../content/types";

/** The in-stage kicker shown above an activity (or its fallback). */
export const ACTIVITY_KIND_LABEL: Record<ActivityBlockType, string> = {
  "simulation": "محاكاة تفاعلية",
  "animation": "رسم متحرك",
  "guided": "نشاط موجّه خطوة بخطوة",
  "interactive-diagram": "مخطط تفاعلي",
};

/** The short enrichment-surface tag the reader puts on the provenance wrapper (non-color-only labelling). */
export const ACTIVITY_ENRICHMENT_LABEL: Record<ActivityBlockType, string> = {
  "simulation": "محاكاة",
  "animation": "رسم متحرك",
  "guided": "نشاط موجّه",
  "interactive-diagram": "مخطط تفاعلي",
};
