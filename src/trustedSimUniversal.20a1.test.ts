import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SMART_SIM_VOCABULARY_VERSION, SMART_SIM_CAPABILITIES, SMART_SIM_DOMAINS, SMART_SIM_RENDERER_FAMILIES, SMART_SIM_SCENE_KINDS, SMART_SIM_TOOLS,
  SMART_SIM_ACCESSIBILITY_FEATURES, SMART_SIM_PRIMITIVES, SMART_SIM_RELATION_KINDS, SMART_SIM_ASSET_KINDS, isSmartSimCapability
} from "./trustedSimVocabulary";
import { SMART_SIM_DESCRIPTOR_VERSION, SMART_SIM_DESCRIPTOR_LIMITS, validateSmartSimDescriptor, type SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import { registerSmartSimPlugin, resolveSmartSimPlugin, resolveSmartSimDescriptor, listSmartSimPluginDescriptors } from "./trustedSimRegistry";
import { validateSmartSimEnvelope, projectSmartSimForStudent, validateSmartSimQuestion } from "./trustedSimPlugins";
import { smartSimAuthoringCatalog } from "./trustedSimCatalog";
import { NETWORK_CHECK_KINDS, networkTopologyPluginV1 } from "./networkTopologyPlugin";
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "./networkTopology/networkTopologyTemplates";
import { QUESTION_TYPE_CATALOG } from "./questionTypeCatalog";
import * as universal from "./trustedSimSemanticActions";
import { createUniversalTestPlugin, SELECTION_SPEC, universalTestDescriptor } from "./trustedSimUniversalFixtures";

// Phase 20A.1 — the universal SmartSim contract: a versioned, bounded VOCABULARY; an exact, code-owned, immutable plugin DESCRIPTOR
// validated at registration (identity, label and check kinds must match the plugin's code); a data-only descriptor listing and a
// safe AUTHORING CATALOG (no function, module, secret or question answer); and backward-compatibility pins: the persisted smartSim@1
// envelope and networkTopology@1 are unchanged, the question-type catalog stays at 24 types.
// New-function tests (fail-first on the post-#264 baseline a48d108: the vocabulary / descriptor / catalog modules do not exist).
const here = path.dirname(fileURLToPath(import.meta.url));
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const NET_DESCRIPTOR = (): SmartSimPluginDescriptorV1 => JSON.parse(JSON.stringify(listSmartSimPluginDescriptors().find(d => d.key === "networkTopology")));
const walk = (v: unknown, visit: (v: unknown, k: string) => void, k = ""): void => {
  visit(v, k);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, visit, String(i)));
  else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, visit, kk);
};

describe("20A.1-V — a versioned, bounded vocabulary (metadata, never behaviour)", () => {
  it("version 1; capability names are namespaced, unique and frozen; the target capabilities exist", () => {
    expect(SMART_SIM_VOCABULARY_VERSION).toBe(1);
    expect(Object.isFrozen(SMART_SIM_CAPABILITIES)).toBe(true);
    expect(new Set(SMART_SIM_CAPABILITIES).size).toBe(SMART_SIM_CAPABILITIES.length);
    expect(SMART_SIM_CAPABILITIES.length).toBeLessThanOrEqual(128);
    for (const c of SMART_SIM_CAPABILITIES) expect(c).toMatch(/^[a-z][a-z0-9]*(\.[a-z0-9][A-Za-z0-9]*)+$/);
    for (const c of ["scene.2d", "scene.3d", "camera.pan", "camera.zoom", "camera.rotate", "object.select", "object.drag", "object.label", "point.place", "line.draw",
      "region.select", "graph.2d", "graph.3d", "network.cli", "network.links", "simulation.play", "simulation.pause", "simulation.scrub", "measure.distance",
      "measure.angle", "measure.elevation", "asset.mesh3d", "asset.image", "asset.dataset", "asset.terrain"]) expect(isSmartSimCapability(c), c).toBe(true);
    for (const c of ["scene.4d", "perfectScore", "SCENE.2D", "scene.2d ", "", "__proto__", "constructor", 7, null]) expect(isSmartSimCapability(c), String(c)).toBe(false);
  });
  it("domains, renderer families, scene kinds, tools, accessibility features, primitives, relation kinds and asset kinds are closed lists", () => {
    expect([...SMART_SIM_DOMAINS]).toEqual(["networking", "mathematics", "physics", "chemistry", "biology", "geography", "general"]);
    expect([...SMART_SIM_RENDERER_FAMILIES]).toEqual(["custom", "svg2d", "canvas2d", "graph2d", "webgl3d", "map2d", "table", "terminal", "form"]);
    expect([...SMART_SIM_SCENE_KINDS]).toEqual(["2d", "3d"]);
    expect([...SMART_SIM_PRIMITIVES]).toEqual(["point", "line", "segment", "vector", "curve", "surface", "region", "node", "edge", "label", "image", "mesh", "body", "marker", "group"]);
    expect([...SMART_SIM_RELATION_KINDS]).toEqual(["connectedTo", "contains", "parentOf", "labelFor"]);
    expect([...SMART_SIM_ASSET_KINDS]).toEqual(["image", "mesh3d", "texture", "dataset", "map", "terrain", "molecule", "anatomy"]);
    for (const t of ["select", "drag", "placePoint", "drawLine", "measureDistance", "rotateView", "zoomView", "play", "pause", "scrub", "connect", "terminal"]) expect(SMART_SIM_TOOLS).toContain(t);
    for (const a of ["keyboardAlternative", "semanticLabels", "objectList", "toolLabels"]) expect(SMART_SIM_ACCESSIBILITY_FEATURES).toContain(a);
    for (const list of [SMART_SIM_DOMAINS, SMART_SIM_RENDERER_FAMILIES, SMART_SIM_SCENE_KINDS, SMART_SIM_TOOLS, SMART_SIM_ACCESSIBILITY_FEATURES, SMART_SIM_PRIMITIVES, SMART_SIM_RELATION_KINDS, SMART_SIM_ASSET_KINDS]) expect(Object.isFrozen(list)).toBe(true);
    // no active-content asset kind exists (SVG / HTML / script would be markup or code)
    for (const bad of ["svg", "html", "script", "module", "shader", "wasm"]) expect(SMART_SIM_ASSET_KINDS as readonly string[]).not.toContain(bad);
  });
});

describe("20A.1-D — the plugin DESCRIPTOR: exact, strict, immutable, data only", () => {
  it("the networkTopology@1 descriptor is valid, deep-frozen and declares exactly what the plugin does", () => {
    const d = resolveSmartSimDescriptor("networkTopology", 1)!;
    expect(d).toBeDefined(); expect(Object.isFrozen(d)).toBe(true); expect(Object.isFrozen(d.capabilities)).toBe(true); expect(Object.isFrozen(d.supports)).toBe(true);
    expect(d).toEqual({
      descriptorVersion: 1, key: "networkTopology", version: 1, label: networkTopologyPluginV1.label, domain: "networking", sceneKinds: ["2d"],
      rendererFamilies: ["svg2d", "terminal", "form"],
      capabilities: ["scene.2d", "object.select", "object.label", "network.links", "network.cli", "network.hostConfig", "network.ping"],
      actionKinds: ["pc.setAddress", "pc.setMask", "pc.setGateway", "pc.setDns", "switch.command", "router.command"],
      checkKinds: Object.keys(NETWORK_CHECK_KINDS), genericRules: [], assetKinds: [],
      tools: ["select", "terminal", "form", "probe"], accessibility: ["keyboardAlternative", "objectList", "semanticLabels", "toolLabels", "textTranscript"],
      supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
    });
    expect(validateSmartSimDescriptor(NET_DESCRIPTOR())).toMatchObject({ ok: true });
    expect(SMART_SIM_DESCRIPTOR_VERSION).toBe(1);
    expect(SMART_SIM_DESCRIPTOR_LIMITS).toMatchObject({ listItems: 64 });
  });
  it("refuses unknown / duplicate vocabulary, unknown keys (module / component / renderer paths), functions, bad versions, oversized lists and inconsistencies", () => {
    const d = NET_DESCRIPTOR();
    const with_ = (over: Record<string, unknown>) => codes(validateSmartSimDescriptor({ ...d, ...over }));
    expect(with_({ capabilities: [...d.capabilities, "scene.4d"] })).toContain("SMARTSIM_DESCRIPTOR_CAPABILITY_UNKNOWN");
    expect(with_({ capabilities: [...d.capabilities, "scene.2d"] })).toContain("SMARTSIM_DESCRIPTOR_DUPLICATE");
    expect(with_({ actionKinds: [...d.actionKinds, "router.command"] })).toContain("SMARTSIM_DESCRIPTOR_DUPLICATE");
    expect(with_({ checkKinds: [...d.checkKinds, "pc.address"] })).toContain("SMARTSIM_DESCRIPTOR_DUPLICATE");
    expect(with_({ domain: "astrology" })).toContain("SMARTSIM_DESCRIPTOR_DOMAIN_UNKNOWN");
    expect(with_({ rendererFamilies: ["webgl4d"] })).toContain("SMARTSIM_DESCRIPTOR_RENDERER_UNKNOWN");
    expect(with_({ tools: ["teleport"] })).toContain("SMARTSIM_DESCRIPTOR_TOOL_UNKNOWN");
    expect(with_({ accessibility: ["mindReading"] })).toContain("SMARTSIM_DESCRIPTOR_ACCESSIBILITY_UNKNOWN");
    expect(with_({ assetKinds: ["svg"] })).toContain("SMARTSIM_DESCRIPTOR_ASSET_KIND_UNKNOWN");
    expect(with_({ sceneKinds: ["4d"] })).toContain("SMARTSIM_DESCRIPTOR_SCENE_KIND_UNKNOWN");
    for (const k of ["component", "module", "rendererModule", "import", "grader", "path", "url", "validateConfig"]) expect(with_({ [k]: "./renderers/foo" }), k).toContain("SMARTSIM_DESCRIPTOR_UNKNOWN_KEY");
    expect(with_({ label: () => "x" })).toContain("SMARTSIM_DESCRIPTOR_LABEL_INVALID");
    expect(with_({ capabilities: [() => "scene.2d"] })).toContain("SMARTSIM_DESCRIPTOR_CAPABILITY_UNKNOWN");
    expect(with_({ descriptorVersion: 2 })).toContain("SMARTSIM_DESCRIPTOR_VERSION_UNSUPPORTED");
    expect(with_({ version: 1.5 })).toContain("SMARTSIM_DESCRIPTOR_IDENTITY_INVALID");
    expect(with_({ key: "__proto__" })).toContain("SMARTSIM_DESCRIPTOR_IDENTITY_INVALID");
    expect(with_({ actionKinds: Array.from({ length: 65 }, (_, i) => "a.k" + i) })).toContain("SMARTSIM_DESCRIPTOR_TOO_MANY");
    expect(with_({ actionKinds: [] })).toContain("SMARTSIM_DESCRIPTOR_ACTIONS_EMPTY");
    expect(with_({ checkKinds: [] })).toContain("SMARTSIM_DESCRIPTOR_CHECKS_EMPTY");
    expect(with_({ actionKinds: ["Router Command"] })).toContain("SMARTSIM_DESCRIPTOR_ACTION_KIND_INVALID");
    // presentation-only gestures can never be declared as academic actions
    for (const a of ["camera.rotate", "camera.zoom", "view.pan", "pointer.down", "mouse.move", "wheel.delta"]) expect(with_({ actionKinds: [a] }), a).toContain("SMARTSIM_DESCRIPTOR_ACTION_PRESENTATION_ONLY");
    expect(with_({ supports: { ...d.supports, threeDimensional: true } })).toContain("SMARTSIM_DESCRIPTOR_INCONSISTENT");
    expect(with_({ sceneKinds: ["2d", "3d"] })).toContain("SMARTSIM_DESCRIPTOR_INCONSISTENT");                       // 3d scene without scene.3d capability
    expect(with_({ supports: { ...d.supports, teleport: true } })).toContain("SMARTSIM_DESCRIPTOR_SUPPORTS_INVALID");
    expect(with_({ supports: { ...d.supports, offline: "yes" } })).toContain("SMARTSIM_DESCRIPTOR_SUPPORTS_INVALID");
    expect(with_({ genericRules: ["perfectScore@1"] })).toContain("SMARTSIM_DESCRIPTOR_RULE_UNKNOWN");
    expect(with_({ genericRules: ["objectSelected"] })).toContain("SMARTSIM_DESCRIPTOR_RULE_UNKNOWN");                   // unversioned
    expect(with_({ genericRules: ["objectSelected@2"] })).toContain("SMARTSIM_DESCRIPTOR_RULE_UNKNOWN");                 // future version
    expect(with_({ checkKinds: [...d.checkKinds, "objectSelected@1"], genericRules: ["objectSelected@1"] })).toContain("SMARTSIM_DESCRIPTOR_DUPLICATE");
    expect(codes(validateSmartSimDescriptor(null))).toContain("SMARTSIM_DESCRIPTOR_INVALID");
    expect(codes(validateSmartSimDescriptor(JSON.parse('{"__proto__":{"x":1}}')))).not.toEqual([]);
  });
  it("registration REQUIRES a matching code-owned descriptor: identity, label and check kinds must agree; generic rules need a ruleView", () => {
    const base = createUniversalTestPlugin(universal, SELECTION_SPEC);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: undefined } as never)).toThrow(/descriptor/);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: { ...base.descriptor, key: "otherKey" } })).toThrow(/descriptor/);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: { ...base.descriptor, version: 2 } })).toThrow(/descriptor/);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: { ...base.descriptor, label: "تسمية أخرى" } })).toThrow(/descriptor/);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: { ...base.descriptor, checkKinds: ["selection.other"] } })).toThrow(/descriptor/);
    expect(() => registerSmartSimPlugin({ ...base, ruleView: undefined } as never)).toThrow(/ruleView/);
    expect(() => registerSmartSimPlugin({ ...base, descriptor: { ...base.descriptor, capabilities: ["scene.2d", "scene.2d"] } })).toThrow(/descriptor/);
    expect(resolveSmartSimPlugin("testSelection", 1)).toBeUndefined();
    undo.push(registerSmartSimPlugin(base));
    expect(resolveSmartSimDescriptor("testSelection", 1)).toEqual(universalTestDescriptor(SELECTION_SPEC));
    expect(() => registerSmartSimPlugin(createUniversalTestPlugin(universal, SELECTION_SPEC))).toThrow(/already registered/);
  });
  it("exact version: a v2 descriptor never answers for v1 (and vice versa); no coercion, no latest", () => {
    undo.push(registerSmartSimPlugin(createUniversalTestPlugin(universal, { ...SELECTION_SPEC, version: 2, label: "اختيار v2" })));
    expect(resolveSmartSimDescriptor("testSelection", 1)).toBeUndefined();
    expect(resolveSmartSimDescriptor("testSelection", 2)!.label).toBe("اختيار v2");
    for (const v of ["2", 2.0000001, 0, null, undefined]) expect(resolveSmartSimDescriptor("testSelection", v), String(v)).toBeUndefined();
    expect(resolveSmartSimDescriptor("networkTopology", 3)).toBeUndefined();   // Phase 20C: @2 is now registered; @3 is the unknown version
    expect(resolveSmartSimDescriptor("NetworkTopology", 1)).toBeUndefined();
  });
  it("the listing is DATA ONLY (plain JSON, no functions), deterministic, and a copy (mutating it never changes the registry)", () => {
    undo.push(registerSmartSimPlugin(createUniversalTestPlugin(universal, SELECTION_SPEC)));
    const list = listSmartSimPluginDescriptors();
    expect(list.map(d => d.key + "@" + d.version)).toEqual(["functionStudy2d@1", "networkTopology@1", "networkTopology@2", "physicsFreeFall@1", "testSelection@1"]);   // Phase 20A.2 pilots + 20C networkTopology@2 included
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    walk(list, v => expect(typeof v).not.toBe("function"));
    (list.find(d => d.key === "networkTopology")!.capabilities as string[]).push?.("scene.3d");
    expect(resolveSmartSimDescriptor("networkTopology", 1)!.capabilities).not.toContain("scene.3d");
  });
});

describe("20A.1-C — the AUTHORING / AI-composer catalog: safe metadata only", () => {
  it("lists exactly the production plugins with their declared metadata; plain data; no function / module / grader / secret / answer", () => {
    const c = smartSimAuthoringCatalog();
    expect(c).toMatchObject({ catalogVersion: 1, vocabularyVersion: 1, descriptorVersion: 1 });
    expect(c.plugins.map(p => p.key + "@" + p.version)).toEqual(["functionStudy2d@1", "networkTopology@1", "networkTopology@2", "physicsFreeFall@1"]);   // Phase 20A.2 pilots + 20C networkTopology@2 included
    expect(c.plugins.find(p => p.key === "networkTopology")).toMatchObject({ domain: "networking", capabilities: expect.arrayContaining(["scene.2d", "network.cli"]), actionKinds: expect.arrayContaining(["router.command"]), checkKinds: expect.arrayContaining(["reachability", "router.ipAddress"]) });
    expect(c.genericRules.map(r => r.id)).toEqual(["numericNear@1", "objectNotSelected@1", "objectSelected@1", "orderEquals@1", "pointNear@1", "relationExists@1", "setEquals@1"]);
    expect([...c.capabilities]).toEqual([...SMART_SIM_CAPABILITIES]);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    walk(c, (v, k) => {
      expect(typeof v, k).not.toBe("function");
      expect(k).not.toMatch(/^(validate|evaluate|apply|normalize|create|serialize|canonical|ruleView|reviewDetails|module|import|component|grader|path|url|secret|answer|checks|weight)/i);
    });
    expect(JSON.stringify(c)).not.toMatch(/192\.168|BR1-SW|reach-pc|=>|\bfunction\s*[\w$]*\s*\(|require\(|import\(/);   // function SYNTAX (the 20A.2 plugin key "functionStudy2d" is data)
  });
  it("a code-registered (test) plugin appears with its opt-in generic rules; nothing exam data says can add one", () => {
    undo.push(registerSmartSimPlugin(createUniversalTestPlugin(universal, SELECTION_SPEC)));
    const p = smartSimAuthoringCatalog().plugins.find(x => x.key === "testSelection")!;
    expect(p.genericRules).toEqual(["objectSelected@1", "objectNotSelected@1", "setEquals@1"]);
    expect(p.actionKinds).toEqual(["object.select", "object.deselect"]);
    // an envelope can only NAME an identity: a descriptor / capabilities / rules smuggled into it are refused
    for (const extra of [{ descriptor: universalTestDescriptor(SELECTION_SPEC) }, { capabilities: ["scene.3d"] }, { rules: [{ kind: "perfectScore", value: true }] }, { component: "AnatomyRenderer" }, { module: "./renderers/foo" }])
      expect(codes(validateSmartSimEnvelope({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: routerTwoSwitchesFourPcsTemplate(), ...extra }))).toContain("SMARTSIM_ENVELOPE_UNKNOWN_KEY");
  });
});

describe("20A.1-P — backward compatibility PINS (persisted data unchanged)", () => {
  it("a networkTopology@1 envelope stays valid BYTE-FOR-BYTE: no new required envelope / config field; the projection is unchanged", () => {
    const env = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: routerTwoSwitchesFourPcsTemplate() };
    const text = JSON.stringify(env);
    const r = validateSmartSimEnvelope(JSON.parse(text));
    expect(r.ok).toBe(true);
    expect(JSON.stringify(projectSmartSimForStudent(JSON.parse(text)))).toBe(text);
    expect(Object.keys(env).sort()).toEqual(["config", "pluginKey", "pluginVersion", "schemaVersion"]);
    expect(validateSmartSimQuestion({ presentationType: "smartSim", questionTypeVersion: 1, smartSim: env, answer: { scoring: "proportional", checks: twoLanDemoChecks() } })).toEqual([]);
  });
  it("the question-type catalog stays at 24 (smartSim is ONE generic type; future domains are plugins, not types)", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(27);   /* 20D adds composite (after compound) · 21A.1 adds chartSelection (after composite) · 21A.2 adds functionGraphSelection (after chartSelection) */
    expect(QUESTION_TYPE_CATALOG.filter(d => /simulation|smartSim/i.test(d.key)).map(d => d.key).sort()).toEqual(["simulation", "smartSim"]);
  });
  it("networkTopology@1 does NOT accept generic rules it never opted into", () => {
    const key = { scoring: "proportional", checks: [...twoLanDemoChecks(), { id: "sel", label: "x", weight: 1, kind: "objectSelected@1", objectId: "r1" }] };
    const issues = validateSmartSimQuestion({ presentationType: "smartSim", questionTypeVersion: 1, smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: routerTwoSwitchesFourPcsTemplate() }, answer: key });
    expect(issues.map(i => i.code)).toContain("SMARTSIM_CHECK_KIND_UNKNOWN");
  });
  it("the UI registry still resolves ONLY through literal repository import() edges; nothing reads a module / component name from data", () => {
    const src = fs.readFileSync(path.join(here, "trustedSim/smartSimUiRegistry.ts"), "utf8");
    const imports = [...src.matchAll(/import\(([^)]*)\)/g)].map(m => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).toMatch(/^"\.\.\/[A-Za-z0-9/]+"$/);   // Phase 20C: literal paths may contain digits (networkTopology2/); still no dots, variables or data
    expect(src).not.toMatch(/import\([^")]/); expect(src).not.toMatch(/\bconfig\.(component|module|renderer)/);
    for (const f of ["trustedSimVocabulary.ts", "trustedSimDescriptor.ts", "trustedSimScene.ts", "trustedSimAssets.ts", "trustedSimSemanticActions.ts", "trustedSimRules.ts", "trustedSimCatalog.ts"]) {
      const code = fs.readFileSync(path.join(here, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/\bimport\(|\brequire\(|\beval\(|new Function|Function\(|fetch\(|XMLHttpRequest|Math\.random|Date\.now|setTimeout|setInterval|globalThis|window\.|document\./);
    }
  });
});
