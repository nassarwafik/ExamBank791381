// Learning visuals — TRUSTED GROUP for content module m07 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m07")` + a literal named export.

export { default as IpIdentity } from "../batch2/IpIdentity";
export { default as Ipv4VsIpv6 } from "../batch2/Ipv4VsIpv6";
export { default as PrivatePublicIp } from "../batch2/PrivatePublicIp";
export { default as StaticDynamicIp } from "../batch2/StaticDynamicIp";
