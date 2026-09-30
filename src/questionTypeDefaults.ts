// Phase 16A — CODE-OWNED default shapes for registered question types (pure; compiled into the shared build). The legacy 11
// keep their exact factory shapes inside examBuilderState.applyTypeDefaults (byte-for-byte); this registry seeds the Wave 1
// and plugin types. `ensure(key, value)` never overwrites what the caller provided. (The authored-content heuristic behind the
// type-change confirmation lives in src/questionTypes/typeContent.ts — builder-only, outside the initial graph.)
export type EnsureFn = (key: string, value: unknown) => void;
export type TypeDefaults = (ensure: EnsureFn, newId: (prefix: string) => string) => void;
const defaults = new Map<string, TypeDefaults>();
export function registerTypeDefaults(key: string, fn: TypeDefaults): () => void { defaults.set(key, fn); return () => { defaults.delete(key); }; }
export const hasRegisteredTypeDefaults = (key: unknown): boolean => typeof key === "string" && defaults.has(key);
export function applyRegisteredTypeDefaults(key: unknown, ensure: EnsureFn, newId: (prefix: string) => string): boolean {
  const fn = typeof key === "string" ? defaults.get(key) : undefined;
  if (!fn) return false;
  fn(ensure, newId);
  return true;
}

registerTypeDefaults("multipleSelect", (ensure, newId) => {
  ensure("options", [{ id: newId("opt"), text: "" }, { id: newId("opt"), text: "" }]);
  ensure("answer", { correctOptionIds: [], scoring: "allOrNothing" });
});
registerTypeDefaults("numericResponse", ensure => {
  ensure("numeric", { unitRequired: false });
  ensure("answer", { mode: "tolerance", expected: 0, tolerance: 0 });
});
registerTypeDefaults("matrix", (ensure, newId) => {
  ensure("matrix", { rows: [{ id: newId("row"), label: "" }], columns: [{ id: newId("col"), label: "" }, { id: newId("col"), label: "" }] });
  ensure("answer", { correctColumnByRow: {} });
});
registerTypeDefaults("categorization", (ensure, newId) => {
  ensure("categorization", { categories: [{ id: newId("cat"), label: "" }, { id: newId("cat"), label: "" }], items: [{ id: newId("item"), label: "" }] });
  ensure("answer", { correctCategoryByItem: {} });
});
