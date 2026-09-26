// Learning visuals — TRUSTED GROUP for content module m16 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m16")` + a literal named export.

export { default as CollisionDomains } from "../batch4/CollisionDomains";
export { default as BroadcastDomain } from "../batch4/BroadcastDomain";
export { default as StpLoopBlocking } from "../batch4/StpLoopBlocking";
export { default as HalfFullDuplex } from "../batch4/HalfFullDuplex";
export { default as LocalhostLoopback } from "../batch4/LocalhostLoopback";
export { default as ApipaFallback } from "../batch4/ApipaFallback";
