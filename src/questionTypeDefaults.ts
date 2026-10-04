// Phase 16A — CODE-OWNED default shapes for registered question types (pure; compiled into the shared build). The legacy 11
// keep their exact factory shapes inside examBuilderState.applyTypeDefaults (byte-for-byte); this registry seeds the Wave 1
// and plugin types. Review Fix 1 / R1: defaults are bound to (key, version) — a NEW question is seeded with the defaults of
// the catalog's CURRENT version and stamped with it; an existing V1 node is only ever seeded with V1 defaults.
// `ensure(key, value)` never overwrites what the caller provided. (The authored-content heuristic behind the type-change
// confirmation lives in src/questionTypes/typeContent.ts — builder-only, outside the initial graph.)
import { createVersionedRegistry } from "./questionTypeCatalog";

export type EnsureFn = (key: string, value: unknown) => void;
export type TypeDefaults = (ensure: EnsureFn, newId: (prefix: string) => string) => void;
const defaults = createVersionedRegistry<TypeDefaults>("type defaults");
export const registerTypeDefaults = (key: string, version: number, fn: TypeDefaults): (() => void) => defaults.register(key, version, fn);
/** True when an implementation exists for EXACTLY (key, version) — never for a neighbouring version. */
export const hasRegisteredTypeDefaults = (key: unknown, version: unknown): boolean => typeof key === "string" && Number.isInteger(version) && defaults.has(key, version as number);
/** Applies the defaults registered for the EXACT identity (the version is the stored / decided one, never "latest"). */
export function applyRegisteredTypeDefaults(key: unknown, version: unknown, ensure: EnsureFn, newId: (prefix: string) => string): boolean {
  if (typeof key !== "string" || !Number.isInteger(version)) return false;
  const hit = defaults.resolve(key, version);
  if (!hit || hit.version !== version) return false;
  hit.impl(ensure, newId);
  return true;
}

registerTypeDefaults("multipleSelect", 1, (ensure, newId) => {
  ensure("options", [{ id: newId("opt"), text: "" }, { id: newId("opt"), text: "" }]);
  ensure("answer", { correctOptionIds: [], scoring: "allOrNothing" });
});
registerTypeDefaults("numericResponse", 1, ensure => {
  ensure("numeric", { unitRequired: false });
  ensure("answer", { mode: "tolerance", expected: 0, tolerance: 0 });
});
registerTypeDefaults("matrix", 1, (ensure, newId) => {
  ensure("matrix", { rows: [{ id: newId("row"), label: "" }], columns: [{ id: newId("col"), label: "" }, { id: newId("col"), label: "" }] });
  ensure("answer", { correctColumnByRow: {} });
});
// Phase 16B-A — a new simulation question carries NO package yet (the teacher picks / uploads one; finalization blocks until
// the exact reference is pinned) and NO answer key (`answer` is reserved for the 16B-B assertion engine).
registerTypeDefaults("simulation", 1, () => { /* identity only: presentationType + questionTypeVersion */ });
// Phase 17A — a new coding question: one allowed language, empty starter code / samples, bounded default limits; the PRIVATE key
// (hidden tests, comparator, reference solutions) lives under `answer`. Literal on purpose (initial graph): parity-tested
// against defaultCodingConfig() / defaultCodingAnswerKey() in src/codingQuestion.ts.
const CODING_DEFAULT_CONFIG = () => ({ allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [] });
// Phase 17A — coding@1: the HISTORICAL private key shape (no compile-error policy field: a compile error is an automatic 0).
// A stored coding@1 node without an answer key is seeded with exactly this shape — never with coding@2 semantics.
registerTypeDefaults("coding", 1, ensure => {
  ensure("coding", CODING_DEFAULT_CONFIG());
  ensure("answer", { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} });
});
// Phase 17F-C2 (Review Fix 1) — coding@2: the NEW-AUTHORING version. A new coding question routes a compile error to teacher review
// (`compileErrorPolicy: "manualReview"`, explicit — coding@2 requires the policy to be stated).
registerTypeDefaults("coding", 2, ensure => {
  ensure("coding", CODING_DEFAULT_CONFIG());
  ensure("answer", { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, compileErrorPolicy: "manualReview" });
});
// Phase 18C — networkCli@1: a default switch (hostname «Switch», empty VLAN database, untouched ports) and an EMPTY private target
// (finalization blocks until the teacher sets at least one check). Literal on purpose (initial graph); parity-tested against
// defaultNetworkCliConfig() / defaultNetworkCliAnswerKey() in src/networkCliQuestion.ts.
registerTypeDefaults("networkCli", 1, ensure => {
  ensure("networkCli", { device: "switch", initialState: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } });
  ensure("answer", { targetState: {}, scoring: "proportional" });
});
// Phase 19A — inlineCloze@1: a one-blank passage and a key whose EMPTY accepted list blocks finalization until the teacher answers.
// Literal on purpose (initial graph); parity-tested against defaultInlineClozeConfig() / defaultInlineClozeAnswerKey().
registerTypeDefaults("inlineCloze", 1, ensure => {
  ensure("inlineCloze", { v: 1, segments: [{ type: "text", text: "اكتب النص هنا، ثم أدرج فراغًا: " }, { type: "blank", id: "b1", control: "text" }] });
  ensure("answer", { scoring: "proportional", blanks: { b1: { accepted: [], caseSensitive: false } } });
});
// Phase 19B — parametricNumeric@1: two bounded integer variables and a key whose EMPTY expression blocks finalization.
// Literal on purpose (initial graph); parity-tested against defaultParametricNumericConfig() / defaultParametricNumericAnswerKey().
registerTypeDefaults("parametricNumeric", 1, ensure => {
  ensure("parametric", { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 1, max: 10, step: 1 }, { id: "b", kind: "int", min: 1, max: 10, step: 1 }], constraints: [], response: { unit: "none" } });
  ensure("answer", { expression: "", mode: "tolerance", tolerance: 0 });
});
registerTypeDefaults("categorization", 1, (ensure, newId) => {
  ensure("categorization", { categories: [{ id: newId("cat"), label: "" }, { id: newId("cat"), label: "" }], items: [{ id: newId("item"), label: "" }] });
  ensure("answer", { correctCategoryByItem: {} });
});
