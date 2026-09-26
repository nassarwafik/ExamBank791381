// Learning visuals — TRUSTED GROUP for content module ch1 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/ch1")` + a literal named export.

export { default as NetworkConnectedDevices } from "../chapter1/NetworkConnectedDevices";
export { default as NetworkUsesMap } from "../chapter1/NetworkUsesMap";
export { default as SharedPrinterDiagram } from "../chapter1/SharedPrinterDiagram";
export { default as NetworkBuildingBlocks } from "../chapter1/NetworkBuildingBlocks";
export { default as NetworkManagementCycle } from "../chapter1/NetworkManagementCycle";
