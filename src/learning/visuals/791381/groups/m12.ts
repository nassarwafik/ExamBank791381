// Learning visuals — TRUSTED GROUP for content module m12 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m12")` + a literal named export.

export { default as MessageTypes } from "../batch3/MessageTypes";
export { default as UnicastMulticast } from "../batch3/UnicastMulticast";
export { default as StorageUnits } from "../batch3/StorageUnits";
export { default as MessageStructure } from "../batch3/MessageStructure";
export { default as BroadcastMessageStructure } from "../batch5/BroadcastMessageStructure";
