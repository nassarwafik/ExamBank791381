// Phase 13C-B — GUIDED BANK DISCOVERY (pure). A live coverage row may open the EXISTING Question Bank picker with an EXACT
// prefilled filter — only for dimensions the bank index can faithfully represent (topic id, difficulty 1..5, and the four
// bank presentation types via the documented 13B name bridge). Anything else has NO bank action: no label matching, no
// fuzzy similarity, no guessing. The teacher stays in control: nothing is selected or inserted automatically.
import type { CoverageItem } from "./assessmentBlueprintCoverage";
import { EMPTY_FILTERS, type BankFilters, type BankPresentationType } from "./bank/bankQuestionModel";

export type BankPickerFocus = { topic?: string; difficulty?: number; presentationType?: BankPresentationType };
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
