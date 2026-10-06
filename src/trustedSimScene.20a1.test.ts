import { describe, it, expect, afterEach } from "vitest";
import { SMART_SIM_SCENE_VERSION, SMART_SIM_SCENE_LIMITS, validateSmartSimScene, semanticScene, sceneObjectIds } from "./trustedSimScene";
import { registerSmartSimAsset } from "./trustedSimAssets";
import {
  UNIVERSAL_ACTION_KINDS, isPresentationActionType, validateUniversalSimConfig, initialUniversalState, normalizeUniversalAction, applyUniversalAction,
  canonicalUniversalState, universalRuleView
} from "./trustedSimSemanticActions";
import { universalTestDescriptor, SELECTION_SPEC, SELECTION_CONFIG, ANATOMY_3D_SPEC, ANATOMY_3D_CONFIG, HUMAN_BODY_ASSET, GALILEE_TERRAIN_ASSET, FREE_FALL_SPEC, FREE_FALL_CONFIG, SURFACE_3D_SPEC, SURFACE_3D_CONFIG } from "./trustedSimUniversalFixtures";

// Phase 20A.1 — the universal SCENE (authored, public, DATA ONLY: stable semantic ids, a small primitive vocabulary, bounded 2D / 3D
// transforms, data-only relations, a presentation-only camera, trusted asset references) and the universal SEMANTIC ACTIONS (academic
// intent, never gestures; a neutral replay state). Strict allow-list schemas: anything not explicitly permitted is refused.
// New-function tests (fail-first on the post-#264 baseline a48d108: the modules do not exist).
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const obj = (id: string, extra: Record<string, unknown> = {}) => ({ id, primitive: "node", ...extra });
const s2 = (objects: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, space: "2d", objects, ...extra });
const s3 = (objects: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, space: "3d", objects, ...extra });
const withAssets = () => { undo.push(registerSmartSimAsset(HUMAN_BODY_ASSET)); undo.push(registerSmartSimAsset(GALILEE_TERRAIN_ASSET)); };

describe("20A.1-S — SmartSimSceneV1: a strict, bounded, data-only world description", () => {
  it("valid 2D and 3D scenes canonicalize deterministically (canonical key order; relations by id; authored object order kept)", () => {
    expect(SMART_SIM_SCENE_VERSION).toBe(1);
    expect(SMART_SIM_SCENE_LIMITS).toMatchObject({ objects: 500, relations: 1000, idChars: 64, labelChars: 120, coordinate: 1e6 });
    const raw = s2([{ label: "B", primitive: "node", id: "b", transform: { y: 2, x: 1 } }, obj("a", { label: "A" })],
      { relations: [{ id: "r2", kind: "connectedTo", from: "b", to: "a" }, { id: "r1", kind: "labelFor", from: "a", to: "b" }], camera: { zoom: 2, center: { y: 0, x: 0 } } });
    const r = validateSmartSimScene(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.scene)).toBe(JSON.stringify({ v: 1, space: "2d", objects: [{ id: "b", primitive: "node", label: "B", transform: { x: 1, y: 2 } }, { id: "a", primitive: "node", label: "A" }],
      relations: [{ id: "r1", kind: "labelFor", from: "a", to: "b" }, { id: "r2", kind: "connectedTo", from: "b", to: "a" }], camera: { center: { x: 0, y: 0 }, zoom: 2 } }));
    expect(validateSmartSimScene(r.scene)).toEqual(r);                                                             // idempotent
    expect(sceneObjectIds(r.scene)).toEqual(["b", "a"]);
    const r3 = validateSmartSimScene(s3([obj("s", { primitive: "surface", transform: { x: 0, y: 0, z: 1, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 1, y: 1, z: 2 } } })], { camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, fov: 45 } }));
    expect(r3.ok).toBe(true);
  });
  it("stable semantic ids: duplicates, prototype names, bad shapes and oversized ids are refused (never an array index)", () => {
    expect(codes(validateSmartSimScene(s2([obj("a"), obj("a")])))).toContain("SMARTSIM_SCENE_OBJECT_ID_DUPLICATE");
    for (const id of ["__proto__", "constructor", "prototype", "", "1abc", "a b", "a/b", "../x", "a".repeat(65), 3, null]) expect(codes(validateSmartSimScene(s2([obj(id as string)]))), String(id)).toContain("SMARTSIM_SCENE_OBJECT_ID_INVALID");
    for (const id of ["H", "He", "liver", "surface1", "r1-g0_0"]) expect(validateSmartSimScene(s2([obj(id)])).ok, id).toBe(true);
  });
  it("only the small primitive vocabulary; the core never interprets domain names", () => {
    for (const p of ["atom", "router", "organ", "Node", "script", ""]) expect(codes(validateSmartSimScene(s2([{ id: "x", primitive: p }]))), p).toContain("SMARTSIM_SCENE_PRIMITIVE_UNKNOWN");
  });
  it("strict allow-lists at EVERY level refuse executable / markup / module / handler / URL fields", () => {
    const bad = ["script", "javascript", "html", "srcdoc", "module", "component", "rendererModule", "grader", "handler", "onClick", "onLoad", "eval", "function", "shaderSource", "url", "href", "src", "style", "data"];
    for (const k of bad) {
      expect(codes(validateSmartSimScene({ ...s2([obj("a")]), [k]: "x" })), "scene." + k).toContain("SMARTSIM_SCENE_UNKNOWN_KEY");
      expect(codes(validateSmartSimScene(s2([obj("a", { [k]: "x" })]))), "object." + k).toContain("SMARTSIM_SCENE_UNKNOWN_KEY");
      expect(codes(validateSmartSimScene(s2([obj("a", { transform: { x: 0, y: 0, [k]: 1 } })]))), "transform." + k).toContain("SMARTSIM_SCENE_TRANSFORM_INVALID");
      expect(codes(validateSmartSimScene(s2([obj("a"), obj("b")], { relations: [{ id: "r", kind: "connectedTo", from: "a", to: "b", [k]: "x" }] }))), "relation." + k).toContain("SMARTSIM_SCENE_RELATION_INVALID");
      expect(codes(validateSmartSimScene(s2([obj("a")], { camera: { center: { x: 0, y: 0 }, zoom: 1, [k]: "x" } }))), "camera." + k).toContain("SMARTSIM_SCENE_CAMERA_INVALID");
    }
    expect(codes(validateSmartSimScene(s2([obj("a", { label: () => "x" })])))).toContain("SMARTSIM_SCENE_LABEL_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a", { tags: [{ html: "<b>" }] })])))).toContain("SMARTSIM_SCENE_TAGS_INVALID");
    expect(codes(validateSmartSimScene(JSON.parse('{"v":1,"space":"2d","objects":[{"id":"a","primitive":"node","__proto__":{"polluted":true}}]}')))).toContain("SMARTSIM_SCENE_UNKNOWN_KEY");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("finite, bounded transforms: NaN / Infinity / out-of-range / wrong-dimension values are refused", () => {
    for (const t of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: -Infinity, y: 0 }, { x: 1e7, y: 0 }, { x: "1", y: 0 }, { x: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, rotation: 400 }, { x: 0, y: 0, scale: 0 }, { x: 0, y: 0, scale: -1 }, { x: 0, y: 0, scale: 2000 }])
      expect(codes(validateSmartSimScene(s2([obj("a", { transform: t })]))), JSON.stringify(t)).toContain("SMARTSIM_SCENE_TRANSFORM_INVALID");
    for (const t of [{ x: 0, y: 0 }, { x: 0, y: 0, z: NaN }, { x: 0, y: 0, z: 0, rotation: 90 }, { x: 0, y: 0, z: 0, rotation: { x: 0, y: 0 } }, { x: 0, y: 0, z: 0, scale: { x: 1, y: 1 } }, { x: 0, y: 0, z: 0, matrix: [1, 0, 0, 1] }])
      expect(codes(validateSmartSimScene(s3([obj("a", { transform: t })]))), JSON.stringify(t)).toContain("SMARTSIM_SCENE_TRANSFORM_INVALID");
  });
  it("bounds: objects ≤ 500, relations ≤ 1000, labels ≤ 120 (no control characters), tags ≤ 16", () => {
    expect(codes(validateSmartSimScene(s2(Array.from({ length: 501 }, (_, i) => obj("o" + i)))))).toContain("SMARTSIM_SCENE_TOO_MANY_OBJECTS");
    expect(validateSmartSimScene(s2(Array.from({ length: 500 }, (_, i) => obj("o" + i)))).ok).toBe(true);
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: "r" + i, kind: "connectedTo", from: "a", to: "b" }));
    expect(codes(validateSmartSimScene(s2([obj("a"), obj("b")], { relations: many })))).toContain("SMARTSIM_SCENE_TOO_MANY_RELATIONS");
    expect(codes(validateSmartSimScene(s2([obj("a", { label: "x".repeat(121) })])))).toContain("SMARTSIM_SCENE_LABEL_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a", { label: "a\u0000b" })])))).toContain("SMARTSIM_SCENE_LABEL_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a", { tags: Array.from({ length: 17 }, (_, i) => "t" + i) })])))).toContain("SMARTSIM_SCENE_TAGS_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a", { semanticLabel: "x".repeat(201) })])))).toContain("SMARTSIM_SCENE_LABEL_INVALID");
  });
  it("relations are DATA (the plugin decides meaning): known kinds only, existing distinct endpoints, unique ids; parents form a tree of groups / meshes", () => {
    const two = [obj("a"), obj("b")];
    expect(codes(validateSmartSimScene(s2(two, { relations: [{ id: "r", kind: "tangent", from: "a", to: "b" }] })))).toContain("SMARTSIM_SCENE_RELATION_KIND_UNKNOWN");
    expect(codes(validateSmartSimScene(s2(two, { relations: [{ id: "r", kind: "connectedTo", from: "a", to: "zz" }] })))).toContain("SMARTSIM_SCENE_RELATION_INVALID");
    expect(codes(validateSmartSimScene(s2(two, { relations: [{ id: "r", kind: "connectedTo", from: "a", to: "a" }] })))).toContain("SMARTSIM_SCENE_RELATION_INVALID");
    expect(codes(validateSmartSimScene(s2(two, { relations: [{ id: "r", kind: "connectedTo", from: "a", to: "b" }, { id: "r", kind: "contains", from: "a", to: "b" }] })))).toContain("SMARTSIM_SCENE_RELATION_ID_DUPLICATE");
    expect(codes(validateSmartSimScene(s2([obj("a", { parent: "zz" })])))).toContain("SMARTSIM_SCENE_PARENT_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a", { parent: "a" })])))).toContain("SMARTSIM_SCENE_PARENT_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("g1", { primitive: "group", parent: "g2" }), obj("g2", { primitive: "group", parent: "g1" })])))).toContain("SMARTSIM_SCENE_PARENT_INVALID");
    expect(codes(validateSmartSimScene(s2([obj("a"), obj("b", { parent: "a" })])))).toContain("SMARTSIM_SCENE_PARENT_INVALID");   // a node cannot contain objects
    expect(validateSmartSimScene(s2([obj("g", { primitive: "group" }), obj("b", { parent: "g" })])).ok).toBe(true);
  });
  it("the camera is PRESENTATION: bounded, dimension-checked, and semanticScene() drops it (two cameras, one semantic scene)", () => {
    for (const cam of [{ center: { x: 0, y: 0 }, zoom: 0 }, { center: { x: 0, y: 0 }, zoom: 1000 }, { position: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0, z: 0 } }, { center: { x: NaN, y: 0 }, zoom: 1 }])
      expect(codes(validateSmartSimScene(s2([obj("a")], { camera: cam }))), JSON.stringify(cam)).toContain("SMARTSIM_SCENE_CAMERA_INVALID");
    expect(codes(validateSmartSimScene(s3([obj("a")], { camera: { position: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0, z: 0 }, fov: 179 } })))).toContain("SMARTSIM_SCENE_CAMERA_INVALID");
    const a = validateSmartSimScene(s3([obj("a")], { camera: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 } } }));
    const b = validateSmartSimScene(s3([obj("a")], { camera: { position: { x: 9, y: 1, z: -5 }, target: { x: 1, y: 1, z: 1 }, fov: 80 } }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) { expect(semanticScene(a.scene)).toEqual(semanticScene(b.scene)); expect(semanticScene(a.scene)).not.toHaveProperty("camera"); }
  });
  it("version and space are exact; a scene v2 is never read as v1", () => {
    expect(codes(validateSmartSimScene({ ...s2([obj("a")]), v: 2 }))).toContain("SMARTSIM_SCENE_VERSION_UNSUPPORTED");
    expect(codes(validateSmartSimScene({ ...s2([obj("a")]), v: "1" }))).toContain("SMARTSIM_SCENE_VERSION_UNSUPPORTED");
    expect(codes(validateSmartSimScene({ ...s2([obj("a")]), space: "4d" }))).toContain("SMARTSIM_SCENE_SPACE_INVALID");
    expect(codes(validateSmartSimScene({ v: 1, space: "2d" }))).toContain("SMARTSIM_SCENE_OBJECTS_INVALID");
    expect(codes(validateSmartSimScene("scene"))).toContain("SMARTSIM_SCENE_INVALID");
  });
  it("assets: a mesh / image needs a TRUSTED exact asset reference of a compatible kind; unknown assets fail closed", () => {
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "mesh" })])))).toContain("SMARTSIM_SCENE_ASSET_REQUIRED");
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "mesh", asset: { assetKey: "human-body", assetVersion: 1 } })])))).toContain("SMARTSIM_ASSET_UNKNOWN");
    withAssets();
    expect(validateSmartSimScene(s3([obj("body", { primitive: "mesh", asset: { assetKey: "human-body", assetVersion: 1 } })])).ok).toBe(true);
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "mesh", asset: { assetKey: "human-body", assetVersion: 2 } })])))).toContain("SMARTSIM_ASSET_UNKNOWN");
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "image", asset: { assetKey: "human-body", assetVersion: 1 } })])))).toContain("SMARTSIM_ASSET_KIND_MISMATCH");
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "mesh", asset: { url: "https://random-site/model.glb" } })])))).toContain("SMARTSIM_ASSET_REF_INVALID");
    expect(codes(validateSmartSimScene(s3([obj("body", { primitive: "node", asset: { assetKey: "human-body", assetVersion: 1 } })])))).toContain("SMARTSIM_SCENE_ASSET_UNEXPECTED");
  });
});

describe("20A.1-A — SEMANTIC actions are the academic truth; gestures and camera never are", () => {
  const D = universalTestDescriptor(SELECTION_SPEC);
  const cfg = () => { const r = validateUniversalSimConfig(SELECTION_CONFIG, D); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
  it("presentation gestures are recognised and refused as academic actions", () => {
    for (const t of ["camera.rotate", "camera.zoom", "camera.pan", "view.reset", "pointer.down", "mouse.move", "wheel.delta", "hover.enter", "ui.tab", "render.frame"]) expect(isPresentationActionType(t), t).toBe(true);
    for (const t of ["object.select", "point.place", "router.command", "pc.setAddress", "value.set", "simulation.run"]) expect(isPresentationActionType(t), t).toBe(false);
    expect(normalizeUniversalAction({ type: "camera.rotate", x: 10 }, cfg(), D)).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
    expect([...UNIVERSAL_ACTION_KINDS]).toEqual(["object.select", "object.deselect", "point.place", "value.set", "sequence.push", "sequence.clear"]);
  });
  it("strict semantic shapes: declared type, exact keys, existing semantic ids, finite values in the scene's dimension", () => {
    const c = cfg();
    expect(normalizeUniversalAction({ type: "object.select", objectId: "b" }, c, D)).toEqual({ ok: true, action: { type: "object.select", objectId: "b" } });
    for (const bad of [{ type: "object.select", objectId: "zz" }, { type: "object.select", objectId: "b", screenX: 100 }, { type: "object.select" }, { type: "object.select", objectId: "__proto__" },
      { type: "point.place", pointId: "b", position: { x: 1, y: 2 } }, { type: "value.set", valueId: "b", value: 2 }, { type: "teleport", objectId: "b" }, null, "object.select"])
      expect(normalizeUniversalAction(bad, c, D).ok, JSON.stringify(bad)).toBe(false);                            // point.place / value.set are not declared by this plugin
    const FF = universalTestDescriptor(FREE_FALL_SPEC);
    const fc = validateUniversalSimConfig(FREE_FALL_CONFIG, FF);
    expect(fc.ok).toBe(true);
    if (!fc.ok) return;
    expect(normalizeUniversalAction({ type: "point.place", pointId: "impact", position: { x: 3, y: 0 } }, fc.config, FF).ok).toBe(true);
    for (const bad of [{ type: "point.place", pointId: "impact", position: { x: 3, y: 0, z: 1 } }, { type: "point.place", pointId: "impact", position: { x: NaN, y: 0 } }, { type: "point.place", pointId: "ball", position: { x: 1, y: 1 } },
      { type: "value.set", valueId: "dropTime", value: Infinity }, { type: "value.set", valueId: "dropTime", value: "2" }, { type: "value.set", valueId: "dropTime", value: 1e12 }])
      expect(normalizeUniversalAction(bad, fc.config, FF).ok, JSON.stringify(bad)).toBe(false);
  });
  it("the neutral replay state is canonical (sorted selection, keyed points / values), pure and deterministic", () => {
    const c = cfg();
    let s = initialUniversalState();
    const frozen = Object.freeze(s);
    for (const a of [{ type: "object.select", objectId: "c" }, { type: "object.select", objectId: "a" }, { type: "object.select", objectId: "c" }, { type: "object.deselect", objectId: "a" }, { type: "object.select", objectId: "b" }]) {
      const n = normalizeUniversalAction(a, c, D); if (!n.ok) throw new Error(n.code); s = applyUniversalAction(s, n.action);
    }
    expect(frozen).toEqual(initialUniversalState());
    expect(canonicalUniversalState(s)).toEqual({ v: 1, selected: ["b", "c"], points: {}, values: {}, sequence: [] });
    expect(JSON.stringify(canonicalUniversalState(s))).toBe(JSON.stringify(canonicalUniversalState(JSON.parse(JSON.stringify(s)))));
    expect(universalRuleView(canonicalUniversalState(s), c)).toEqual({ ids: ["a", "b", "c"], selected: ["b", "c"], points: {}, values: {}, sequence: [], relations: [] });
  });
  it("the universal config composes scene + declared capabilities; JSON can never grant a capability, a renderer or a rule", () => {
    expect(validateUniversalSimConfig(SELECTION_CONFIG, D).ok).toBe(true);
    const c = (over: Record<string, unknown>, d = D) => codes(validateUniversalSimConfig({ ...SELECTION_CONFIG, ...over }, d));
    expect(c({ requiredCapabilities: ["scene.2d", "camera.rotate"] })).toContain("SMARTSIM_CAPABILITY_UNDECLARED");
    expect(c({ requiredCapabilities: ["scene.2d", "scene.4d"] })).toContain("SMARTSIM_CAPABILITY_UNKNOWN");
    expect(c({ requiredCapabilities: ["scene.2d", "scene.2d"] })).toContain("SMARTSIM_CAPABILITY_DUPLICATE");
    expect(c({ scene: { v: 1, space: "3d", objects: [{ id: "a", primitive: "node" }] } })).toContain("SMARTSIM_CONFIG_SCENE_KIND_UNSUPPORTED");
    for (const k of ["rules", "renderer", "component", "module", "grader", "capabilities", "descriptor"]) expect(c({ [k]: k === "rules" ? [{ kind: "perfectScore", value: true }] : "x" }), k).toContain("SMARTSIM_CONFIG_UNKNOWN_KEY");
    expect(c({ v: 2 })).toContain("SMARTSIM_CONFIG_VERSION_UNSUPPORTED");
    withAssets();
    const A = universalTestDescriptor(ANATOMY_3D_SPEC);
    expect(validateUniversalSimConfig(ANATOMY_3D_CONFIG, A).ok).toBe(true);
    const terrainBody = { ...ANATOMY_3D_CONFIG, scene: { ...ANATOMY_3D_CONFIG.scene, objects: [{ id: "t", primitive: "mesh", asset: { assetKey: "galilee-terrain", assetVersion: 1 } }] } };
    expect(codes(validateUniversalSimConfig(terrainBody, A))).toContain("SMARTSIM_ASSET_KIND_UNDECLARED");      // a terrain asset in a plugin that declared only mesh3d
    const S = universalTestDescriptor(SURFACE_3D_SPEC);
    expect(validateUniversalSimConfig(SURFACE_3D_CONFIG, S).ok).toBe(true);
    expect(codes(validateUniversalSimConfig(SURFACE_3D_CONFIG, D))).toContain("SMARTSIM_CONFIG_SCENE_KIND_UNSUPPORTED");
  });
});
