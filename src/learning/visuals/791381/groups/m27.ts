// Learning visuals — TRUSTED GROUP for content module m27 (Phase 8E-6 lazy-loading granularity).
//
// A statically-authored barrel over the registered SVG components of ONE content module, so the Reader fetches the
// module's visuals as one small chunk the first time a page of that module shows a visual, then serves the rest of
// the module from the cache. Repo-authored literal re-exports only — content never names a path; the registry
// (registry.ts) maps each visualId to a literal `import("./791381/groups/m27")` + a literal named export.

export { default as AdminDistance } from "../batch6/AdminDistance";
export { default as RoutingUpdateTypes } from "../batch6/RoutingUpdateTypes";
export { default as OspfTopology } from "../batch6/OspfTopology";
export { default as ShowIpRoute } from "../batch6/ShowIpRoute";
export { default as RoutingMethodsOverview } from "../batch8/RoutingMethodsOverview";
export { default as StaticRoutePath } from "../batch8/StaticRoutePath";
export { default as EigrpMetricAdaptation } from "../batch8/EigrpMetricAdaptation";
