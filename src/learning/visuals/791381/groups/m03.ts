// Learning visuals — TRUSTED GROUP for content module m03 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m03")` + a literal named export.

export { default as CliInterface } from "../batch5/CliInterface";
export { default as CliModeLadder } from "../batch5/CliModeLadder";
export { default as SwitchPortsMap } from "../batch5/SwitchPortsMap";
export { default as SviInterface } from "../batch5/SviInterface";
export { default as VlanSegmentation } from "../batch5/VlanSegmentation";
export { default as VlanAccessTrunkTerms } from "../batch5/VlanAccessTrunkTerms";
export { default as VlanExampleTopology } from "../batch5/VlanExampleTopology";
export { default as CreateVlan } from "../batch5/CreateVlan";
export { default as AccessPortToVlan } from "../batch5/AccessPortToVlan";
export { default as SviGateway } from "../batch5/SviGateway";
export { default as TaggedUntaggedNative } from "../batch5/TaggedUntaggedNative";
