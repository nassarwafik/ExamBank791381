// Learning visuals — TRUSTED GROUP for content module m21 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m21")` + a literal named export.

export { default as WellKnownPorts } from "../batch6/WellKnownPorts";
export { default as Ipv6Anatomy } from "../batch7/Ipv6Anatomy";
export { default as Ipv6Compression } from "../batch7/Ipv6Compression";
