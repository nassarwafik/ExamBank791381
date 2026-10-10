import { freeFallClassroomConfig } from "../physicsFreeFall/freeFallTemplates";
import { motionStarterConfig } from "../physicsMotion/motionTemplates";
import { labStarterConfig } from "../physicsLab/labTemplates";

// Phase 20A.2 — the starting PUBLIC config the authoring host puts in place when a teacher picks a trusted plugin (UI only; lazy with the
// authoring host). Code-owned and keyed by EXACT identity; an identity without a starter starts from an empty object (the canonical
// validator then shows what is missing). The private key always restarts EMPTY: checks are plugin-specific and never carried over.
const STARTERS: ReadonlyMap<string, () => unknown> = new Map<string, () => unknown>([
  ["networkTopology@1", () => ({ v: 1, devices: [], links: [] })],
  ["networkTopology@2", () => ({ v: 2, devices: [], links: [] })],
  ["physicsFreeFall@1", () => freeFallClassroomConfig()],
  ["physicsMotion@1", () => motionStarterConfig()],
  ["physicsLab@1", () => labStarterConfig()],
  ["functionStudy2d@1", () => ({ v: 1, expression: { language: 2, variable: "x", source: "x^2-4" }, window: { xMin: -5, xMax: 5, yMin: -6, yMax: 6, sampleCount: 401 }, tasks: { domainExclusions: false, xIntercepts: true, yIntercept: true, verticalAsymptotes: false, horizontalAsymptotes: false, extrema: true, monotonicIntervals: true } })]
]);
export const smartSimStarterConfig = (key: string, version: number): unknown => { const f = STARTERS.get(key + "@" + version); return f ? f() : {}; };
