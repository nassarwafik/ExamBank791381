// Phase 14A — the ONE "is this answer answered?" predicate, extracted verbatim from StudentQuestionCard.tsx into a pure,
// React-free module so the exam structure helpers (examStructure → examCover → examPreviewModel → examBuilderState →
// examQuality → examFinalization) can be compiled for the server governance authority without pulling a React component.
// StudentQuestionCard re-exports it, so every existing importer keeps the same function.
export type FieldValue = string | boolean | string[];
// Answer is a discriminated union. The first four members are the ORIGINAL shapes and are kept
// byte-for-byte so every stored draft / submitted attempt still loads and grades. "fields" and
// "compound" are the additive new shapes for generalized field questions and compound questions.
export type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string}|{kind:"fields";values:Record<string,FieldValue>}|{kind:"compound";parts:Record<string,Answer>};

const nonEmptyValue = (v: unknown) => (typeof v === "boolean" ? v : String(v ?? "").trim() !== "");
export function answered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.kind === "choice") return Number.isInteger(a.index);
  if (a.kind === "text") return !!a.value.trim();
  if (a.kind === "sequence" || a.kind === "table") return a.values.some(nonEmptyValue);
  if (a.kind === "fields") return Object.values(a.values).some(v => (Array.isArray(v) ? v.some(nonEmptyValue) : nonEmptyValue(v)));
  if (a.kind === "compound") return Object.values(a.parts).some(answered);
  return false;
}
