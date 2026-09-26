// Learning visuals — TRUSTED GROUP for content module m09 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m09")` + a literal named export.

export { default as HubFlood } from "../batch2/HubFlood";
export { default as SwitchUnicast } from "../batch2/SwitchUnicast";
export { default as RouterNetworks } from "../batch2/RouterNetworks";
