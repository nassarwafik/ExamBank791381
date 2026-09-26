// Learning visuals — TRUSTED GROUP for content module m20 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m20")` + a literal named export.

export { default as DmzThreeZone } from "../batch7/DmzThreeZone";
export { default as WifiRadioLink } from "../batch7/WifiRadioLink";
export { default as WirelessNetworkTypes } from "../batch7/WirelessNetworkTypes";
export { default as SsidBeacon } from "../batch7/SsidBeacon";
export { default as WifiSecurity } from "../batch7/WifiSecurity";
export { default as WifiProtectionTechnologies } from "../batch7/WifiProtectionTechnologies";
export { default as AccessPointBridge } from "../batch7/AccessPointBridge";
