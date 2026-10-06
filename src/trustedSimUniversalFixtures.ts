// Phase 20A.1 — TEST-ONLY fixtures for the universal SmartSim contract. Nothing in the application imports this module (a guard test
// pins it); it is NOT in the shared server build and registers nothing by itself. It proves that future simulators of very different
// subjects (physics, mathematics 2D / 3D, chemistry, biology 3D, geography terrain) fit ONE SmartSim architecture: a code-owned plugin
// with an exact descriptor, a strict JSON config that embeds the universal scene, semantic actions, a replay-derived canonical state and
// typed checks (domain-specific ones plus the opt-in generic rule library). No domain science lives here or in the core.
//
// `createUniversalTestPlugin(lib, spec)` builds a domain-neutral selection / placement / value plugin from the universal helpers. `lib`
// is the module namespace that provides them: the TypeScript sources in client tests, the generated CommonJS shared build in server
// tests — the SAME authority either way.
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

/** The subset of the universal helpers a test plugin composes (identical exports in src/ and in the shared server build). */
export type UniversalLib = {
  validateUniversalSimConfig(raw: unknown, descriptor: SmartSimPluginDescriptorV1): { ok: true; config: unknown } | { ok: false; issues: { code: string; message: string; path?: string }[] };
  initialUniversalState(): unknown;
  normalizeUniversalAction(raw: unknown, config: unknown, descriptor: SmartSimPluginDescriptorV1): { ok: true; action: unknown } | { ok: false; code: string };
  applyUniversalAction(state: unknown, action: unknown): unknown;
  canonicalUniversalState(state: unknown): unknown;
  universalRuleView(state: unknown, config: unknown): SmartSimRuleView;
};

export type UniversalTestPluginSpec = {
  key: string;
  version?: number;
  label?: string;
  domain: string;
  sceneKinds: string[];
  rendererFamilies: string[];
  capabilities: string[];
  actionKinds: string[];
  genericRules: string[];
  assetKinds?: string[];
  tools?: string[];
  accessibility?: string[];
};

/** The exact descriptor a spec declares (data only — what a real plugin would export next to its code). */
export function universalTestDescriptor(spec: UniversalTestPluginSpec): SmartSimPluginDescriptorV1 {
  const threeD = spec.sceneKinds.includes("3d");
  return {
    descriptorVersion: 1,
    key: spec.key,
    version: spec.version ?? 1,
    label: spec.label ?? "محاكاة اختبار " + spec.key,
    domain: spec.domain,
    sceneKinds: [...spec.sceneKinds],
    rendererFamilies: [...spec.rendererFamilies],
    capabilities: [...spec.capabilities],
    actionKinds: [...spec.actionKinds],
    checkKinds: ["selection.count"],
    genericRules: [...spec.genericRules],
    assetKinds: [...(spec.assetKinds ?? [])],
    tools: [...(spec.tools ?? ["select"])],
    accessibility: [...(spec.accessibility ?? ["keyboardAlternative", "objectList", "semanticLabels"])],
    supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: spec.sceneKinds.includes("2d"), threeDimensional: threeD }
  };
}

type Check = { id: string; label: string; weight: number; kind: string; count: number };
/** A domain-neutral TEST plugin: its own (plugin-owned) check kind `selection.count` plus whatever generic rules it opts into. */
export function createUniversalTestPlugin(lib: UniversalLib, spec: UniversalTestPluginSpec) {
  const descriptor = universalTestDescriptor(spec);
  return {
    key: descriptor.key,
    version: descriptor.version,
    label: descriptor.label,
    maxActions: 200,
    checkKinds: ["selection.count"],
    descriptor,
    validateConfig: (raw: unknown) => lib.validateUniversalSimConfig(raw, descriptor),
    createRuntime: () => lib.initialUniversalState(),
    normalizeAction: (raw: unknown, config: unknown) => lib.normalizeUniversalAction(raw, config, descriptor),
    applyAction: (runtime: unknown, action: unknown) => lib.applyUniversalAction(runtime, action),
    canonicalState: (runtime: unknown) => lib.canonicalUniversalState(runtime),
    serializeState: (state: unknown) => JSON.stringify(state),
    validateCheck: (raw: Record<string, unknown>) => {
      const keys = Object.keys(raw).sort().join(",");
      if (raw.kind !== "selection.count" || keys !== "count,id,kind,label,weight" || !Number.isInteger(raw.count) || (raw.count as number) < 0 || (raw.count as number) > 500)
        return { ok: false as const, issues: [{ code: "TEST_CHECK_INVALID", message: "invalid selection.count check" }] };
      return { ok: true as const, check: raw as unknown as Check };
    },
    evaluateCheck: (check: Check, state: unknown) => {
      const n = ((state as { selected?: unknown[] }).selected ?? []).length;
      return { expected: String(check.count), actual: String(n), passed: n === check.count };
    },
    ruleView: (state: unknown, config: unknown) => lib.universalRuleView(state, config)
  };
}

// ── Cross-domain fixtures (descriptors + configs) — FUTURE simulators, expressed with today's contracts only ─────────────────────────
const scene2d = (objects: Record<string, unknown>[]) => ({ v: 1, space: "2d", objects });
const scene3d = (objects: Record<string, unknown>[]) => ({ v: 1, space: "3d", objects });

/** A simple object-selection simulator (the end-to-end proof: config → action → replay → canonical state → generic rule → score). */
export const SELECTION_SPEC: UniversalTestPluginSpec = {
  key: "testSelection", domain: "general", sceneKinds: ["2d"], rendererFamilies: ["svg2d"],
  capabilities: ["scene.2d", "object.select", "object.label"], actionKinds: ["object.select", "object.deselect"],
  genericRules: ["objectSelected@1", "objectNotSelected@1", "setEquals@1"]
};
export const SELECTION_CONFIG = {
  v: 1,
  scene: scene2d([
    { id: "a", primitive: "node", label: "A", transform: { x: 0.2, y: 0.5 } },
    { id: "b", primitive: "node", label: "B", transform: { x: 0.5, y: 0.5 } },
    { id: "c", primitive: "node", label: "C", transform: { x: 0.8, y: 0.5 } }
  ]),
  requiredCapabilities: ["scene.2d", "object.select"]
};

/** Physics — free fall (future physicsMotion / freeFall plugin). The core knows nothing about gravity. */
export const FREE_FALL_SPEC: UniversalTestPluginSpec = {
  key: "freeFall", domain: "physics", sceneKinds: ["2d"], rendererFamilies: ["canvas2d"],
  capabilities: ["scene.2d", "simulation.play", "simulation.pause", "simulation.scrub", "point.place"], actionKinds: ["value.set", "point.place"],
  genericRules: ["numericNear@1", "pointNear@1"], tools: ["play", "pause", "scrub", "placePoint"]
};
export const FREE_FALL_CONFIG = {
  v: 1,
  scene: scene2d([{ id: "ball", primitive: "body", label: "الكرة", transform: { x: 0, y: 20 } }, { id: "impact", primitive: "marker", label: "نقطة الارتطام" }, { id: "dropTime", primitive: "label", label: "زمن السقوط (ث)" }]),
  requiredCapabilities: ["scene.2d", "simulation.play", "simulation.scrub"]
};

/** Mathematics 3D — rotatable function surface z = f(x, y) (future functionSurface3d plugin). No expression evaluation in the core. */
export const SURFACE_3D_SPEC: UniversalTestPluginSpec = {
  key: "functionSurface3d", domain: "mathematics", sceneKinds: ["3d"], rendererFamilies: ["webgl3d"],
  capabilities: ["scene.3d", "camera.rotate", "camera.zoom", "object.select", "point.place", "graph.3d"], actionKinds: ["object.select", "point.place"],
  genericRules: ["pointNear@1", "objectSelected@1"], tools: ["select", "placePoint", "rotateView", "zoomView"]
};
export const SURFACE_3D_CONFIG = {
  v: 1,
  scene: { ...scene3d([{ id: "surface1", primitive: "surface", label: "z = f(x, y)" }, { id: "critical1", primitive: "point", label: "نقطة حرجة" }]), camera: { position: { x: 4, y: 4, z: 6 }, target: { x: 0, y: 0, z: 0 }, fov: 50 } },
  requiredCapabilities: ["scene.3d", "camera.rotate", "camera.zoom", "object.select"]
};

/** Chemistry — periodic table selection (future periodicTable plugin). Stable element symbols are the semantic ids. */
export const PERIODIC_TABLE_SPEC: UniversalTestPluginSpec = {
  key: "periodicTable", domain: "chemistry", sceneKinds: ["2d"], rendererFamilies: ["table"],
  capabilities: ["scene.2d", "object.select", "object.label"], actionKinds: ["object.select", "object.deselect"], genericRules: ["setEquals@1", "objectSelected@1"]
};
export const PERIODIC_TABLE_CONFIG = {
  v: 1,
  scene: scene2d(["H", "He", "Li", "Be", "Na", "K"].map((id, i) => ({ id, primitive: "node", label: id, transform: { x: i, y: 0 } }))),
  requiredCapabilities: ["scene.2d", "object.select", "object.label"]
};

/** Chemistry — equation balancing (future chemistryEquation plugin): coefficients are semantic values; balancing science stays in the plugin. */
export const EQUATION_SPEC: UniversalTestPluginSpec = {
  key: "chemistryEquation", domain: "chemistry", sceneKinds: ["2d"], rendererFamilies: ["custom"],
  capabilities: ["scene.2d", "object.label"], actionKinds: ["value.set"], genericRules: ["numericNear@1"], tools: ["select"]
};
export const EQUATION_CONFIG = {
  v: 1,
  scene: scene2d([{ id: "h2", primitive: "label", label: "H₂" }, { id: "o2", primitive: "label", label: "O₂" }, { id: "h2o", primitive: "label", label: "H₂O" }])
};

/** Biology 3D — rotatable human anatomy (future anatomy3d plugin) over a TRUSTED mesh asset; the organ's semantic id is the authority. */
export const ANATOMY_3D_SPEC: UniversalTestPluginSpec = {
  key: "anatomy3d", domain: "biology", sceneKinds: ["3d"], rendererFamilies: ["webgl3d"],
  capabilities: ["scene.3d", "camera.rotate", "camera.zoom", "object.select", "object.label", "asset.mesh3d"], actionKinds: ["object.select", "object.deselect"],
  genericRules: ["objectSelected@1", "objectNotSelected@1", "setEquals@1"], assetKinds: ["mesh3d"], tools: ["select", "rotateView", "zoomView"]
};
export const HUMAN_BODY_ASSET = Object.freeze({ key: "human-body", version: 1, kind: "mesh3d", mime: "model/gltf-binary", byteSize: 2048, sha256: "a".repeat(64), source: "anatomy/human-body-v1.glb", capabilities: ["asset.mesh3d", "object.select"] });
export const ANATOMY_3D_CONFIG = {
  v: 1,
  scene: scene3d([
    { id: "body", primitive: "mesh", label: "جسم الإنسان", asset: { assetKey: "human-body", assetVersion: 1 } },
    { id: "liver", primitive: "region", label: "الكبد", parent: "body", semanticLabel: "الكبد — عضو في الجهة اليمنى العليا من البطن" },
    { id: "heart", primitive: "region", label: "القلب", parent: "body" },
    { id: "stomach", primitive: "region", label: "المعدة", parent: "body" }
  ]),
  requiredCapabilities: ["scene.3d", "camera.rotate", "camera.zoom", "object.select", "object.label"]
};

/** Geography — 3D terrain with elevation (future terrainMap plugin) over a TRUSTED terrain asset; terrain triangles are never answers. */
export const TERRAIN_SPEC: UniversalTestPluginSpec = {
  key: "terrainMap", domain: "geography", sceneKinds: ["3d"], rendererFamilies: ["webgl3d", "map2d"],
  capabilities: ["scene.3d", "camera.rotate", "camera.zoom", "measure.distance", "measure.elevation", "point.place", "asset.terrain"], actionKinds: ["point.place"],
  genericRules: ["pointNear@1"], assetKinds: ["terrain"], tools: ["placePoint", "measureDistance", "measureElevation", "rotateView", "zoomView"]
};
export const GALILEE_TERRAIN_ASSET = Object.freeze({ key: "galilee-terrain", version: 1, kind: "terrain", mime: "application/json", byteSize: 4096, sha256: "b".repeat(64), source: "terrain/galilee-v1.json", capabilities: ["asset.terrain", "measure.elevation"] });
export const TERRAIN_CONFIG = {
  v: 1,
  scene: scene3d([{ id: "terrain", primitive: "mesh", label: "تضاريس الجليل", asset: { assetKey: "galilee-terrain", assetVersion: 1 } }, { id: "summit", primitive: "marker", label: "القمة" }]),
  requiredCapabilities: ["scene.3d", "camera.rotate", "measure.elevation", "point.place"]
};

export const CROSS_DOMAIN_FIXTURES = Object.freeze([
  { name: "physics / free fall", spec: FREE_FALL_SPEC, config: FREE_FALL_CONFIG },
  { name: "mathematics / 3D function surface", spec: SURFACE_3D_SPEC, config: SURFACE_3D_CONFIG },
  { name: "chemistry / periodic table", spec: PERIODIC_TABLE_SPEC, config: PERIODIC_TABLE_CONFIG },
  { name: "chemistry / equation balancing", spec: EQUATION_SPEC, config: EQUATION_CONFIG },
  { name: "biology / 3D anatomy", spec: ANATOMY_3D_SPEC, config: ANATOMY_3D_CONFIG },
  { name: "geography / 3D terrain", spec: TERRAIN_SPEC, config: TERRAIN_CONFIG }
]);
export const TEST_ASSETS = Object.freeze([HUMAN_BODY_ASSET, GALILEE_TERRAIN_ASSET]);
