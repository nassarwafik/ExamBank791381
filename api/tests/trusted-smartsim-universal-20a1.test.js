import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { evaluateServerFinalization } from "../src/lib/server-finalization.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 20A.1 — the universal SmartSim contract on the SERVER, through the generated shared build (one TypeScript source): code-owned
// descriptors (data-only listing, production = networkTopology@1 only); a TEST-ONLY universal plugin registered into the server's own
// registry is validated, ingested (replayed state, presentation gestures refused), graded with opt-in generic rules, sanitized and
// finalized by the REAL pipeline; unknown rules fail closed; networkTopology@1 / simulation@1 are unchanged (pins); the client and the
// server copies agree on a corpus. New-function tests (fail-first on the post-#264 baseline a48d108) except the labelled PINS.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const loadShared = name => require_("../src/lib/shared-finalization/" + name + ".js");
const fixtures = () => import("../../src/trustedSimUniversalFixtures.ts");
const g = (r, id) => r.questions.find(x => x.questionId === id);
const exam = questions => ({ examId: "E20A1", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const undo = [];
afterEach(() => { while (undo.length) undo.pop()(); });
const NEW_MODULES = ["trustedSimVocabulary", "trustedSimDescriptor", "trustedSimScene", "trustedSimAssets", "trustedSimSemanticActions", "trustedSimRules", "trustedSimCatalog"];

async function withSelection() {
  const f = await fixtures();
  const plugin = f.createUniversalTestPlugin(loadShared("trustedSimSemanticActions"), f.SELECTION_SPEC);
  undo.push(loadShared("trustedSimRegistry").registerSmartSimPlugin(plugin));
  const CHECKS = [
    { id: "sel-b", label: "اختر B", weight: 2, kind: "objectSelected@1", objectId: "b" },
    { id: "not-a", label: "لا تختر A", weight: 1, kind: "objectNotSelected@1", objectId: "a" },
    { id: "one", label: "عنصر واحد", weight: 1, kind: "selection.count", count: 1 }
  ];
  const q = (over = {}) => ({ examQuestionId: "u1", presentationType: "smartSim", questionTypeVersion: 1, text: "اختر B", marks: 8, smartSim: { schemaVersion: 1, pluginKey: "testSelection", pluginVersion: 1, config: f.SELECTION_CONFIG }, answer: { scoring: "proportional", checks: CHECKS }, ...over });
  const ans = (actions, state = {}) => ({ kind: "smartSim", pluginKey: "testSelection", pluginVersion: 1, actions, state });
  return { f, q, ans, CHECKS };
}

describe("20A.1-S1 — descriptors and the authoring catalog on the server", () => {
  it("production = networkTopology@1 + the 20A.2 pilots, each with a descriptor; the listing / catalog are plain data and IDENTICAL to the client build", async () => {
    const reg = loadShared("trustedSimRegistry"); loadShared("trustedSimPlugins");
    expect(reg.listSmartSimPluginDescriptors().map(d => d.key + "@" + d.version)).toEqual(["functionStudy2d@1", "networkTopology@1", "physicsFreeFall@1"]);
    const cat = loadShared("trustedSimCatalog").smartSimAuthoringCatalog();
    expect(JSON.parse(JSON.stringify(cat))).toEqual(cat);
    const ts = await import("../../src/trustedSimCatalog.ts");
    expect(cat).toEqual(ts.smartSimAuthoringCatalog());
    expect(reg.resolveSmartSimDescriptor("networkTopology", 2)).toBeUndefined();
  });
  it("every new pure module is in SHARED_ENTRIES and its committed server copy reaches no I/O, dynamic code, timers or randomness", () => {
    for (const m of NEW_MODULES) {
      expect(SHARED_ENTRIES, m).toContain("src/" + m + ".ts");
      const code = fs.readFileSync(path.join(repo, "api/src/lib/shared-finalization", m + ".js"), "utf8");
      expect(code, m).not.toMatch(/\beval\(|new Function|fetch\(|XMLHttpRequest|import\(|Math\.random|Date\.now|setTimeout|setInterval|process\.|require\("(fs|http|https|net|child_process)"\)/);
    }
    expect(SHARED_ENTRIES).not.toContain("src/trustedSimUniversalFixtures.ts");
  });
});

describe("20A.1-S2 — the end-to-end server proof with a TEST-ONLY universal plugin", () => {
  it("finalization passes; gradeExam replays the actions and applies generic rules with weighted partial credit", async () => {
    const { q, ans } = await withSelection();
    expect(evaluateServerFinalization(exam([q()])).canFinalize).toBe(true);
    expect(g(gradeExam(exam([q()]), { u1: ans([{ type: "object.select", objectId: "b" }]) }), "u1")).toMatchObject({ score: 8, correct: true, manualReview: false });
    expect(g(gradeExam(exam([q()]), { u1: ans([{ type: "object.select", objectId: "a" }, { type: "object.select", objectId: "b" }]) }), "u1")).toMatchObject({ score: 4, manualReview: false });
    expect(resolveGrader("smartSim", 1)).toBeTypeOf("function");
  });
  it("ingest binds the REPLAYED state (forged state discarded) and refuses presentation gestures / forged keys", async () => {
    const { q, ans } = await withSelection();
    const forged = { v: 1, selected: ["b"], points: {}, values: {}, sequence: [] };
    const r = normalizeDraftAnswers({ u1: { ...ans([{ type: "object.select", objectId: "c" }], forged), score: 8, checks: [] } }, exam([q()]));
    expect(r.rejected).toEqual([]);
    expect(r.answers.u1).toEqual({ kind: "smartSim", pluginKey: "testSelection", pluginVersion: 1, actions: [{ type: "object.select", objectId: "c" }], state: { v: 1, selected: ["c"], points: {}, values: {}, sequence: [] } });
    // a forged state earns NOTHING beyond the initial state (only "A not selected" holds initially: 1 of 4 weight → 2 of 8)
    expect(g(gradeExam(exam([q()]), { u1: ans([]) }), "u1")).toMatchObject({ score: 2 });
    expect(g(gradeExam(exam([q()]), { u1: ans([], forged) }), "u1")).toMatchObject({ score: 2 });
    for (const gesture of [{ type: "camera.rotate", x: 10 }, { type: "pointer.down", screenX: 3, screenY: 4 }, { type: "wheel.delta", delta: 120 }])
      expect(normalizeDraftAnswers({ u1: ans([gesture]) }, exam([q()])).rejected, gesture.type).toEqual([{ id: "u1", code: "SMARTSIM_ACTION_PRESENTATION_ONLY" }]);
  });
  it("JSON never grants grading authority: a smuggled perfectScore / unversioned / non-opted-in rule fails closed and blocks finalization", async () => {
    const { q, ans, CHECKS } = await withSelection();
    for (const bad of [{ id: "x", label: "x", weight: 1, kind: "perfectScore", value: true }, { id: "x", label: "x", weight: 1, kind: "perfectScore@1", value: true }, { id: "x", label: "x", weight: 1, kind: "objectSelected", objectId: "b" }, { id: "x", label: "x", weight: 1, kind: "numericNear@1", valueId: "b", expected: 1, tolerance: 1 }]) {
      const node = q({ answer: { scoring: "proportional", checks: [...CHECKS, bad] } });
      expect(g(gradeExam(exam([node]), { u1: ans([{ type: "object.select", objectId: "b" }]) }), "u1"), bad.kind).toMatchObject({ score: 0, manualReview: true });
      expect(evaluateServerFinalization(exam([node])).canFinalize, bad.kind).toBe(false);
    }
    // a scene-level "rules" array or renderer / component field is refused by the strict config contract (withheld from students too)
    for (const extra of [{ rules: [{ kind: "perfectScore", value: true }] }, { renderer: "./renderers/foo" }, { component: "AnatomyRenderer" }]) {
      const f = await fixtures();
      const node = q({ smartSim: { schemaVersion: 1, pluginKey: "testSelection", pluginVersion: 1, config: { ...f.SELECTION_CONFIG, ...extra } } });
      expect(evaluateServerFinalization(exam([node])).canFinalize, Object.keys(extra)[0]).toBe(false);
      expect(sanitizeExamForStudent(exam([node])).sections[0].questions[0].smartSim, Object.keys(extra)[0]).toBeUndefined();
    }
  });
  it("the student receives the canonical public scene only (no private check, weight or expected id)", async () => {
    const { q, f } = await withSelection();
    const out = sanitizeExamForStudent(exam([q()])).sections[0].questions[0];
    expect(out.smartSim.config.scene.objects.map(o => o.id)).toEqual(["a", "b", "c"]);
    expect(out.answer).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(/sel-b|not-a|objectSelected|"weight"|"checks"/);
    expect(f.SELECTION_CONFIG.scene.objects.length).toBe(3);
  });
  it("a 3D test plugin over a trusted mesh asset: undeclared capabilities and unknown assets fail closed on the server", async () => {
    const f = await fixtures();
    const assets = loadShared("trustedSimAssets");
    for (const a of f.TEST_ASSETS) undo.push(assets.registerSmartSimAsset(a));
    undo.push(loadShared("trustedSimRegistry").registerSmartSimPlugin(f.createUniversalTestPlugin(loadShared("trustedSimSemanticActions"), f.ANATOMY_3D_SPEC)));
    const node = config => ({ examQuestionId: "an1", presentationType: "smartSim", questionTypeVersion: 1, text: "حدّد الكبد", marks: 2, smartSim: { schemaVersion: 1, pluginKey: "anatomy3d", pluginVersion: 1, config }, answer: { scoring: "proportional", checks: [{ id: "liver", label: "الكبد", weight: 1, kind: "objectSelected@1", objectId: "liver" }] } });
    expect(evaluateServerFinalization(exam([node(f.ANATOMY_3D_CONFIG)])).canFinalize).toBe(true);
    expect(g(gradeExam(exam([node(f.ANATOMY_3D_CONFIG)]), { an1: { kind: "smartSim", pluginKey: "anatomy3d", pluginVersion: 1, actions: [{ type: "object.select", objectId: "liver" }], state: {} } }), "an1")).toMatchObject({ score: 2 });
    expect(evaluateServerFinalization(exam([node({ ...f.ANATOMY_3D_CONFIG, requiredCapabilities: [...f.ANATOMY_3D_CONFIG.requiredCapabilities, "measure.angle"] })])).canFinalize).toBe(false);
    const v2 = { ...f.ANATOMY_3D_CONFIG, scene: { ...f.ANATOMY_3D_CONFIG.scene, objects: f.ANATOMY_3D_CONFIG.scene.objects.map(o => (o.id === "body" ? { ...o, asset: { assetKey: "human-body", assetVersion: 2 } } : o)) } };
    expect(evaluateServerFinalization(exam([node(v2)])).canFinalize).toBe(false);
    expect(g(gradeExam(exam([node(v2)]), { an1: { kind: "smartSim", pluginKey: "anatomy3d", pluginVersion: 1, actions: [{ type: "object.select", objectId: "liver" }], state: {} } }), "an1")).toMatchObject({ score: 0, manualReview: true });
  });
});

describe("20A.1-S3 — PINS: networkTopology@1 and simulation@1 are unchanged", () => {
  const M24 = "255.255.255.0";
  const pc = (id, a, gw) => [{ type: "pc.setAddress", deviceId: id, value: a }, { type: "pc.setMask", deviceId: id, value: M24 }, { type: "pc.setGateway", deviceId: id, value: gw }];
  const sw = (id, ...c) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
  const rt = (id, ...c) => c.map(command => ({ type: "router.command", deviceId: id, command }));
  const FULL = [...pc("pc1", "192.168.10.10", "192.168.10.254"), ...pc("pc2", "192.168.10.20", "192.168.10.254"), ...pc("pc3", "192.168.20.10", "192.168.20.254"), ...pc("pc4", "192.168.20.20", "192.168.20.254"),
    ...sw("sw1", "enable", "configure terminal", "hostname BR1-SW1", "end"), ...sw("sw2", "enable", "configure terminal", "hostname BR1-SW2", "end"),
    ...rt("r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0", "no shutdown", "end")];
  it("PIN — the persisted networkTopology@1 envelope is accepted byte-for-byte, finalizes and still grades 23 / 23 (no migration)", async () => {
    const t = await import("../../src/networkTopology/networkTopologyTemplates.ts");
    const env = JSON.parse(JSON.stringify({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: t.routerTwoSwitchesFourPcsTemplate() }));
    const node = { examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "اضبط الشبكة بحيث تتصل الشبكتان", marks: 23, smartSim: env, answer: { scoring: "proportional", checks: t.twoLanDemoChecks() } };
    expect(evaluateServerFinalization(exam([node])).canFinalize).toBe(true);
    expect(g(gradeExam(exam([node]), { t1: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: FULL, state: {} } }), "t1")).toMatchObject({ score: 23, correct: true });
    expect(JSON.stringify(sanitizeExamForStudent(exam([node])).sections[0].questions[0].smartSim)).toBe(JSON.stringify(env));
  });
  it("PIN — a simulation@1 package cannot claim trusted capabilities: the manifest keeps exactly its five booleans, no plugin identity, and the grader stays manual", () => {
    const manifest = loadShared("smartsimManifest");
    const r = manifest.validateSmartSimManifest({ schemaVersion: 1, packageId: "evil-sim", packageVersion: 1, title: "x", entry: "dist/index.html", runtime: "web", runtimeVersion: 1, responseSchemaVersion: 1,
      capabilities: { autosave: true, "scene.3d": true, trusted: true, partialCredit: true }, pluginKey: "networkTopology", descriptor: { capabilities: ["scene.3d"] } });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.manifest.capabilities).sort()).toEqual(["autosave", "offline", "partialCredit", "reset", "restore"]);
    expect(r.manifest).not.toHaveProperty("pluginKey"); expect(r.manifest).not.toHaveProperty("descriptor");
    expect(resolveGrader("simulation", 1)({}, { kind: "simulation", state: { score: 100, trusted: true } }, 10)).toEqual({ score: 0, manualReview: true, correct: false });
    expect(loadShared("trustedSimPlugins").listSmartSimPlugins().map(d => d.key)).toEqual(["networkTopology", "physicsFreeFall", "functionStudy2d"]);
  });
});

describe("20A.1-S4 — client / server parity on a corpus (one TypeScript source)", () => {
  it("scene, descriptor, asset-reference and rule results are identical in src/ and in the generated shared build", async () => {
    const pairs = [["trustedSimScene", "validateSmartSimScene"], ["trustedSimDescriptor", "validateSmartSimDescriptor"], ["trustedSimAssets", "validateSmartSimAssetRef"]];
    const corpus = [
      { v: 1, space: "2d", objects: [{ id: "a", primitive: "node", transform: { x: 1, y: 2 } }] }, { v: 1, space: "3d", objects: [{ id: "a", primitive: "nope" }] }, { v: 2 }, null,
      { descriptorVersion: 1, key: "x", version: 1 }, { assetKey: "human-body", assetVersion: 1 }, { assetKey: "https://x", assetVersion: 1 }, { v: 1, space: "2d", objects: [{ id: "__proto__", primitive: "node" }] }
    ];
    for (const [mod, fn] of pairs) {
      const ts = await import("../../src/" + mod + ".ts");
      for (const c of corpus) expect(loadShared(mod)[fn](c), mod + " " + JSON.stringify(c)).toEqual(ts[fn](c));
    }
    const rulesTs = await import("../../src/trustedSimRules.ts"), rulesJs = loadShared("trustedSimRules");
    const view = { ids: ["a", "b", "p"], selected: ["b"], points: { p: { x: 1, y: 1 } }, values: { a: 2 }, sequence: ["a", "b"], relations: [] };
    for (const check of [{ id: "k", label: "k", weight: 1, kind: "objectSelected@1", objectId: "b" }, { id: "k", label: "k", weight: 1, kind: "pointNear@1", pointId: "p", expected: { x: 1, y: 1.1 }, tolerance: 0.2 }, { id: "k", label: "k", weight: 1, kind: "numericNear@1", valueId: "a", expected: 3, tolerance: 0.5 }, { id: "k", label: "k", weight: 1, kind: "perfectScore@1" }]) {
      const a = rulesTs.validateSmartSimRuleCheck(check, view), b = rulesJs.validateSmartSimRuleCheck(check, view);
      expect(b).toEqual(a);
      if (a.ok) expect(rulesJs.evaluateSmartSimRuleCheck(b.check, view)).toEqual(rulesTs.evaluateSmartSimRuleCheck(a.check, view));
    }
    expect(rulesJs.listSmartSimRules()).toEqual(rulesTs.listSmartSimRules());
  });
});
