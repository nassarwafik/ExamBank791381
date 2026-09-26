// Learning visuals — TRUSTED GROUP for content module m04 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m04")` + a literal named export.

export { default as TrunkMultiVlan } from "../batch6/TrunkMultiVlan";
export { default as Dot1qTagFrame } from "../batch6/Dot1qTagFrame";
export { default as RouterOnAStick } from "../batch6/RouterOnAStick";
export { default as InterVlanFlow } from "../batch6/InterVlanFlow";
export { default as InterSwitchTrunkPorts } from "../batch7/InterSwitchTrunkPorts";
export { default as SubinterfacesVlan1020 } from "../batch7/SubinterfacesVlan1020";
export { default as SubinterfacesVlan3040 } from "../batch7/SubinterfacesVlan3040";
export { default as Sw6RouterTrunk } from "../followup/Sw6RouterTrunk";
