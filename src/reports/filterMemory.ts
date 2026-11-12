// Phase R-5d — what the Reports Center remembers of the teacher's last choice ON THIS DEVICE (the devicePrefs store: the browser's
// localStorage only, never sent to the server), and the active filters in words.
// Kept: the school year, the class id, the project code and the period key. NOT kept: a student (no student identifier is
// written to the device), dates typed by hand, the track of a project. Every value is validated on read, and an id the loaded
// options do not offer is dropped by the Reports Center before any request — so a stale or foreign value can never ask for a
// report (the server decides access on every request anyway). Presentation only: no permission depends on any of it.
import { readDevicePref, writeDevicePref } from "../ui/devicePrefs";
import type { Period } from "./period";

export type RememberedFilters = { schoolYear: string; classId: string; projectCode: string; period: Period };
export const REMEMBER_KEY = "reports.filters";
const NOTHING: RememberedFilters = { schoolYear: "", classId: "", projectCode: "", period: "all" };
const MAX_ID = 120;
const text = (v: unknown) => (typeof v === "string" && v.length <= MAX_ID ? v : "");

function parse(v: unknown): RememberedFilters | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const period: Period = o.period === "7" || o.period === "30" ? o.period : "all";       // «مخصص» is never remembered
  return { schoolYear: text(o.schoolYear), classId: text(o.classId), projectCode: text(o.projectCode), period };
}

export function readRememberedFilters(): RememberedFilters {
  return readDevicePref(REMEMBER_KEY, parse) ?? NOTHING;
}

/** Stores the choice; nothing chosen is the key's absence. A custom period is stored as «كل الفترة». */
export function rememberFilters(f: RememberedFilters): void {
  const period: Period = f.period === "7" || f.period === "30" ? f.period : "all";
  const empty = !f.schoolYear && !f.classId && !f.projectCode && period === "all";
  writeDevicePref(REMEMBER_KEY, empty ? null : { schoolYear: f.schoolYear, classId: f.classId, projectCode: f.projectCode, period });
}

export type FilterChip = { key: string; label: string; value: string };
/** The filters in force, in the order the filter bar shows them; an empty value is no chip. */
export function activeFilterChips(f: { schoolYear: string; project: string; className: string; student: string; period: string }): FilterChip[] {
  return ([
    { key: "schoolYear", label: "السنة الدراسية", value: f.schoolYear },
    { key: "project", label: "المشروع", value: f.project },
    { key: "class", label: "الصف", value: f.className },
    { key: "student", label: "الطالب", value: f.student },
    { key: "period", label: "الفترة", value: f.period }
  ] as FilterChip[]).filter(c => !!c.value);
}
