// Learning visuals — TRUSTED GROUP for content module m17 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m17")` + a literal named export.

export { default as AttackTargets } from "../batch4/AttackTargets";
export { default as DosVsDdos } from "../batch4/DosVsDdos";
export { default as HijackingVsMitm } from "../batch4/HijackingVsMitm";
export { default as PhishingVsSpoofing } from "../batch4/PhishingVsSpoofing";
export { default as SecureTwoPillars } from "../batch4/SecureTwoPillars";
export { default as VpnTunnel } from "../batch4/VpnTunnel";
export { default as HttpsSecureChannel } from "../batch4/HttpsSecureChannel";
