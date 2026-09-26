// Learning visuals — TRUSTED GROUP for content module m11 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m11")` + a literal named export.

export { default as UtpVsStp } from "../batch3/UtpVsStp";
export { default as MacFrameDelivery } from "../batch3/MacFrameDelivery";
