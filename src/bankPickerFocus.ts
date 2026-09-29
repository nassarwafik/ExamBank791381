// Phase 13C-B — GUIDED BANK DISCOVERY (pure). A live coverage row may open the EXISTING Question Bank picker with an EXACT
// prefilled filter — only for dimensions the bank index can faithfully represent (topic id, difficulty 1..5, and the four
// bank presentation types via the documented 13B name bridge). Anything else has NO bank action: no label matching, no
// fuzzy similarity, no guessing. The teacher stays in control: nothing is selected or inserted automatically.
import type { CoverageItem } from "./assessmentBlueprintCoverage";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { EMPTY_FILTERS, type BankFilters, type BankPresentationType } from "./bank/bankQuestionModel";

export type BankPickerFocus = { topic?: string; difficulty?: number; presentationType?: BankPresentationType };
/** Review Fix 1 / R1 — the DATA-owned scope a Bank service declares (who its questions are for). The service owner sets it
 *  (App: the 791381 bank declares `{ subjectId: "networking", courseId: "791381" }`); the core only compares stable ids. */
export type BankPickerScope = { subjectId: string; curriculumId?: string; courseId?: string };
const sameId = (a: unknown, b: unknown): boolean => typeof a === "string" && typeof b === "string" && a.length > 0 && a === b;
/** Generic compatibility rule: the Blueprint's subject id must equal the bank's; every scope the bank ALSO declares (course /
 *  curriculum) must equal the Blueprint's corresponding stable id. Unknown scope or missing Blueprint → incompatible. */
export function isBankScopeCompatible(blueprint: AssessmentBlueprintV1 | undefined | null, scope: BankPickerScope | undefined | null): boolean {
  if (!blueprint || !scope) return false;
  if (!sameId(blueprint.subject?.id, scope.subjectId)) return false;
  if (scope.courseId !== undefined && !sameId(blueprint.course?.id, scope.courseId)) return false;
  if (scope.curriculumId !== undefined && !sameId(blueprint.curriculum?.id, scope.curriculumId)) return false;
  return true;
}
/** The guided-discovery entry point: an exact focus ONLY when the Blueprint is compatible with the bank's declared scope. */
export function guidedBankFocusForCoverageItem(item: CoverageItem, blueprint: AssessmentBlueprintV1 | undefined | null, scope: BankPickerScope | undefined | null): BankPickerFocus | null {
  return isBankScopeCompatible(blueprint, scope) ? bankFocusForCoverageItem(item) : null;
}
/** Builder question type → bank presentation type. Exact names only; `shortAnswer` ↔ `open` is the 13B canonical bridge. */
const TYPE_BRIDGE: Record<string, BankPresentationType> = { multipleChoice: "multipleChoice", fillBlank: "fillBlank", wordBank: "wordBank", shortAnswer: "open" };

export function bankFocusForCoverageItem(item: CoverageItem): BankPickerFocus | null {
  if (item.kind !== "constraint" || item.relation === "unassessable" || !item.ref) return null;
  switch (item.dimension) {
    case "topic": return { topic: item.ref };
    case "difficulty": return /^[1-5]$/.test(item.ref) ? { difficulty: Number(item.ref) } : null;
    case "questionType": { const t = TYPE_BRIDGE[item.ref]; return t ? { presentationType: t } : null; }
    default: return null;
  }
}
export function bankFiltersFromFocus(focus?: BankPickerFocus | null): BankFilters & { topic: string } {
  return {
    ...EMPTY_FILTERS, topic: focus?.topic ?? "",
    difficulty: focus?.difficulty !== undefined ? String(focus.difficulty) : "",
    type: focus?.presentationType ?? ""
  };
}
export function focusKey(focus?: BankPickerFocus | null): string { return focus ? JSON.stringify(focus) : ""; }
