import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_ITEM_KINDS, COMPOSER_RICH_BLOCKS, COMPOSER_SIM_PLUGINS, detectUnsupportedCapabilities, composerNetScenario } from "./composerCatalog";
import { normalizeComposerIntent, intentAllowedKinds } from "./composerIntent";
import { normalizePlanShape, validatePlan, buildPlanSchema } from "./composerPlan";
import { mapAiRichBlocks } from "./composerRich";
import { buildSimFromSpec, simFreeCreditIssues } from "./composerSim";
import { normalizeSectionDraft, buildSectionDraftSchema, normalizeComposerItem } from "./composerDraft";
import { composerVerdict, withComposerHistory, verifyAiQuestion } from "./composerExam";
import { examRevision, stableStringify } from "./composerRevision";
import { buildAiSafeProjection, payloadIsSafe } from "./composerProjection";
import { normalizeComposerPatch, applyComposerPatch, patchGroups, isPatchShape, modeScopeOk, buildPatchSchema, type AiExamPatchV1 } from "./composerPatch";
import { composerReducer, initialComposer } from "./composerState";
import { COMPOSER_LIMITS } from "./composerLimits";
import { impactTime, impactSpeed, peakHeight } from "../physicsFreeFallModel";
import { net2TemplateById } from "../networkTopology2/net2Templates";
import { questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 20F — the composer DOMAIN CORE: catalog derived from the registries, strict intent / plan / item normalizers (malicious model
// outputs fail closed), code-built SmartSim (expected values by code, numeric key probes, no free credit), assembly verdict, AI-safe
// projection, scope-locked patches with stale protection, the state machine. Fail-first on 20d5a48 (the modules do not exist).
const intent = (over: Record<string, unknown> = {}) => { const r = normalizeComposerIntent({ v: 1, subject: "الشبكات", language: "ar", totalMarks: 20, ...over }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.intent; };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const manual = (): StructuredExam => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/fixtures/presentation-20d1/A-classic-arabic.json"), "utf8"));
const fixture = (rel: string): StructuredExam => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/fixtures", rel), "utf8"));
const plan2 = () => normalizePlanShape(F.plan("t", "networkLab", [F.planSection("أ", [F.planItem("multipleChoice", 4), F.planItem("composite", 6, { simulator: "networkTopology", scenario: "roas" })]), F.planSection("ب", [F.planItem("openResponse", 10)])]));

describe("20F-CAT capability catalog: one source of truth, derived from the production registries", () => {
  it("every item kind maps to a registered production type at an exact supported version (never 'latest')", () => {
    const c = buildComposerCatalog();
    expect(c.questionTypes.map(t => t.kind)).toEqual([...COMPOSER_ITEM_KINDS]);
    for (const t of c.questionTypes) { expect(questionTypeDefinition(t.key)).toBeTruthy(); expect(supportsQuestionTypeVersion(t.key, t.version)).toBe(true); expect(Number.isInteger(t.version)).toBe(true); }
    expect(c.questionTypes.find(t => t.kind === "coding")!.version).toBe(2);
    expect(c.smartSim.map(p => p.pluginKey + "@" + p.pluginVersion)).toEqual(["networkTopology@2", "physicsFreeFall@1", "functionStudy2d@1"]);
    expect(JSON.stringify(c)).not.toMatch(/latest/i);
  });
  it("the catalog never offers unsupported capabilities, images, raw markup or extra languages", () => {
    const c = buildComposerCatalog();
    expect(COMPOSER_RICH_BLOCKS).not.toContain("image"); expect(COMPOSER_RICH_BLOCKS).not.toContain("figure"); expect(COMPOSER_RICH_BLOCKS).not.toContain("columns");
    expect(c.codingLanguages).toEqual(["python", "java", "csharp"]);
    expect(c.networkScenarios.map(s => s.id)).toEqual(["roas", "dhcp", "vtp", "portsec", "wireless", "capstone"]);
    expect(JSON.stringify(c.networkScenarios)).not.toMatch(/ospf|eigrp|\bacl\b|\bnat\b/i);
    expect(detectUnsupportedCapabilities("أنشئ سؤال SmartSim OSPF مع ACL و NAT").map(u => u.id)).toEqual(["ospf", "acl", "nat"]);
    const p = catalogForPrompt();
    expect(p).toContain("networkTopology@2"); expect(p).toContain("NOT supported");
    expect(COMPOSER_SIM_PLUGINS.every(x => composerNetScenario("roas") && x.pluginVersion >= 1)).toBe(true);
  });
});

describe("20F-INT intent: strict, bounded, structured controls win", () => {
  it("normalizes a valid intent with defaults and direction from language", () => {
    const i = intent({ language: "en" });
    expect(i.direction).toBe("ltr"); expect(i.difficulty).toBe("mixed"); expect(i.capabilities.composite).toBe(true); expect(i.capabilities.visual).toBe(false);
  });
  it("refuses unknown / prototype keys, bad marks, unknown types / presets, over-long or control-character text", () => {
    expect(codes(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, extra: 1 }))).toEqual(["INTENT_MALFORMED"]);
    expect(codes(normalizeComposerIntent(JSON.parse('{"v":1,"subject":"x","totalMarks":10,"__proto__":{"a":1}}')))).toEqual(["INTENT_MALFORMED"]);
    for (const totalMarks of [0, 1.5, -5, 1001, "100", NaN]) expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks }).ok, String(totalMarks)).toBe(false);
    expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, allowedQuestionTypes: ["essayLatest"] }).ok).toBe(false);
    expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, presentationPreset: "neonHacker" }).ok).toBe(false);
    expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, teacherInstruction: "x".repeat(COMPOSER_LIMITS.instructionChars + 1) }).ok).toBe(false);
    expect(normalizeComposerIntent({ v: 1, subject: "x\u0000y", totalMarks: 10 }).ok).toBe(false);
    expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, difficultyProfile: { easy: 50, medium: 30, hard: 30 } }).ok).toBe(false);
  });
  it("feature toggles remove kinds; an empty allowed set is refused; unsupported requests are detected", () => {
    expect(intentAllowedKinds(intent({ capabilities: { composite: false, smartSim: false, coding: false } }))).not.toEqual(expect.arrayContaining(["composite", "smartSim", "coding"]));
    expect(normalizeComposerIntent({ v: 1, subject: "x", totalMarks: 10, allowedQuestionTypes: ["coding"], capabilities: { coding: false } })).toMatchObject({ ok: false, issues: [{ code: "INTENT_NO_TYPES" }] });
    expect(intent({ teacherInstruction: "أضف محاكاة OSPF" }).unsupportedRequested.map(u => u.id)).toEqual(["ospf"]);
  });
});

describe("20F-PLAN plan: code-owned marks arithmetic and catalog rules", () => {
  it("a valid plan passes; the preset chosen by the teacher overrides the model's (warning)", () => {
    const p = plan2(); expect(p.ok).toBe(true); if (!p.ok) return;
    const v = validatePlan(p.plan, intent({ presentationPreset: "classicPaper" }));
    expect(v.blocking).toEqual([]); expect(v.plan.presentationPreset).toBe("classicPaper"); expect(v.warnings.map(w => w.code)).toContain("PLAN_PRESET_OVERRIDDEN");
  });
  it("never trusts the model's arithmetic: total mismatch, section mismatch, section count", () => {
    const p = normalizePlanShape(F.plan("t", "default", [{ ...F.planSection("أ", [F.planItem("multipleChoice", 4)]), marks: 5 }])); if (!p.ok) throw new Error();
    expect(validatePlan(p.plan, intent()).blocking.map(i => i.code)).toEqual(expect.arrayContaining(["PLAN_TOTAL_MISMATCH", "PLAN_SECTION_MARKS_MISMATCH"]));
    const q = plan2(); if (!q.ok) throw new Error();
    expect(validatePlan(q.plan, intent({ sectionTarget: 3 })).blocking.map(i => i.code)).toContain("PLAN_SECTION_COUNT");
  });
  it("kinds / simulators / scenarios / excluded topics are enforced", () => {
    const bad = normalizePlanShape(F.plan("t", "default", [F.planSection("أ", [F.planItem("smartSim", 10), F.planItem("multipleChoice", 5, { simulator: "physicsFreeFall" }), F.planItem("composite", 5, { scenario: "roas", topic: "OSI" })])])); if (!bad.ok) throw new Error();
    const b = validatePlan(bad.plan, intent({ excludedTopics: ["OSI"] })).blocking.map(i => i.code);
    expect(b).toEqual(expect.arrayContaining(["PLAN_SIMULATOR_REQUIRED", "PLAN_SIMULATOR_UNEXPECTED", "PLAN_SCENARIO_UNEXPECTED", "PLAN_TOPIC_EXCLUDED"]));
    const p = plan2(); if (!p.ok) throw new Error();
    expect(validatePlan(p.plan, intent({ capabilities: { composite: false } })).blocking.map(i => i.code)).toContain("PLAN_KIND_NOT_ALLOWED");
  });
  it("malformed plans fail closed (extra key, prototype key, fractional marks, unknown kind / scenario / preset)", () => {
    const good = F.plan("t", "default", [F.planSection("أ", [F.planItem("multipleChoice", 4)])]);
    expect(normalizePlanShape({ ...good, extra: 1 }).ok).toBe(false);
    expect(normalizePlanShape(JSON.parse(JSON.stringify(good).replace('"title":"t"', '"title":"t","__proto__":{"x":1}'))).ok).toBe(false);
    expect(normalizePlanShape(F.plan("t", "default", [F.planSection("أ", [F.planItem("multipleChoice", 1.5)])])).ok).toBe(false);
    expect(normalizePlanShape(F.plan("t", "default", [F.planSection("أ", [F.planItem("essay", 4)])])).ok).toBe(false);
    expect(normalizePlanShape(F.plan("t", "default", [F.planSection("أ", [F.planItem("smartSim", 4, { simulator: "networkTopology", scenario: "ospfLab" })])])).ok).toBe(false);
    expect(normalizePlanShape(F.plan("t", "hacker", [F.planSection("أ", [F.planItem("multipleChoice", 4)])])).ok).toBe(false);
    expect(JSON.stringify(buildPlanSchema())).toContain('"additionalProperties":false');
  });
});

describe("20F-RICH AI rich blocks → RichContentV1 (20D.1 vocabulary only, canonical validator decides)", () => {
  it("maps tables / CLI / code / math / callouts; technical blocks stay LTR blocks", () => {
    const r = mapAiRichBlocks([F.table(["أ", "ب"], [["1"], ["2", "3"]], "جدول"), F.cli("SW1# show vlan"), F.rb("code", { language: "python", source: "print(1)" }), F.math("x^2"), F.callout("انتبه", "warning", "ملاحظة")]);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.richContent!.blocks.map(b => b.type)).toEqual(["table", "cli", "code", "math", "callout"]);
    expect((r.richContent!.blocks[0] as { rows: string[][] }).rows[0]).toEqual(["1", ""]);
  });
  it("refuses raw HTML / script / style / SVG / javascript: URLs / unknown blocks / extra keys / images", () => {
    for (const text of ["<script>alert(1)</script>", "<style>body{}</style>", "<svg onload=x>", "javascript:alert(1)", "<iframe src=x>", "<img src=x>"]) expect(mapAiRichBlocks([F.rb("paragraph", { text })]).ok, text).toBe(false);
    expect(mapAiRichBlocks([F.rb("image", {})]).ok).toBe(false);
    expect(mapAiRichBlocks([{ ...F.rb("paragraph", { text: "x" }), href: "https://evil" }]).ok).toBe(false);
    expect(mapAiRichBlocks([F.rb("columns")]).ok).toBe(false);
    expect(mapAiRichBlocks(Array(COMPOSER_LIMITS.richBlocks + 1).fill(F.rb("divider"))).ok).toBe(false);
  });
});

describe("20F-SIM SmartSim through the catalog: code-owned config and private checks, no free credit", () => {
  it("networkTopology@2: the scenario IS the production template (config + checks)", () => {
    const r = buildSimFromSpec(F.netSim("roas")); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.envelope).toEqual({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: net2TemplateById("roas")!.config() });
    expect(r.value.checks).toEqual(net2TemplateById("roas")!.checks());
  });
  it("physicsFreeFall@1: every expected value is computed by code from the model", () => {
    const r = buildSimFromSpec(F.physSim(30, 10, 10, ["maxHeight", "apexTime", "impactTime", "impactSpeed"], ["impactPoint", "apexPoint"])); expect(r.ok).toBe(true); if (!r.ok) return;
    const m = { initialHeight: 30, initialVelocity: 10, gravity: 10 };
    const byId = Object.fromEntries(r.value.checks.map(c => [c.id, c]));
    expect(byId["max-height"].expected).toBeCloseTo(peakHeight(m), 6);
    expect(byId["apex-time"].expected).toBeCloseTo(1, 6);
    expect((byId["impact-point"].expected as { x: number }).x).toBeCloseTo(impactTime(m), 5);
    expect(byId["impact-speed"].kind).toBe("physics.impactSpeed"); void impactSpeed;
    expect(JSON.stringify(F.physSim(30, 10, 10, ["maxHeight"]))).not.toMatch(/expected/);
  });
  it("physics refuses apex tasks for a drop, a probe time outside the flight, an out-of-bounds model", () => {
    expect(codes(buildSimFromSpec(F.physSim(20, 0, 9.8, ["maxHeight"])))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.physSim(20, 0, 9.8, ["heightAtTime"], [], 5)))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.physSim(20000, 0, 9.8, ["impactTime"])))).toContain("AI_SIM_CONFIG_INVALID");
  });
  it("functionStudy2d@1: the AI's key is numerically probed — an inconsistent key is refused", () => {
    expect(buildSimFromSpec(F.funcSim({})).ok).toBe(true);
    expect(codes(buildSimFromSpec(F.funcSim({ yIntercept: 3 })))).toEqual(["AI_FUNCTION_KEY_INCONSISTENT"]);
    expect(codes(buildSimFromSpec(F.funcSim({ verticalAsymptotes: [-2, 2] })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
    expect(codes(buildSimFromSpec(F.funcSim({ xIntercepts: [3] })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
    expect(codes(buildSimFromSpec(F.funcSim({ source: "eval(x)" })))).toContain("AI_SIM_CONFIG_INVALID");
  });
  it("unknown plugins, mixed payloads and prototype keys fail closed", () => {
    expect(buildSimFromSpec({ ...F.netSim("roas"), plugin: "ospfSim" }).ok).toBe(false);
    expect(buildSimFromSpec({ ...F.netSim("roas"), physics: (F.physSim(1, 0, 9.8, ["impactTime"]) as { physics: unknown }).physics }).ok).toBe(false);
    expect(buildSimFromSpec(JSON.parse('{"plugin":"networkTopology","title":"","instructions":"","network":{"scenario":"roas","__proto__":{}},"physics":null,"function":null}')).ok).toBe(false);
  });
  it("NO FREE CREDIT: a key that already passes on the untouched initial state is refused", () => {
    const env = { schemaVersion: 1 as const, pluginKey: "networkTopology", pluginVersion: 2, config: net2TemplateById("capstone")!.config() };
    expect(simFreeCreditIssues(env, [{ id: "free", label: "free", weight: 1, kind: "switch.hostname", deviceId: "sw1", value: "Switch" }], "x").map(i => i.code)).toEqual(["AI_SIM_FREE_CREDIT"]);
    expect(simFreeCreditIssues(env, net2TemplateById("capstone")!.checks() as never, "x")).toEqual([]);
  });
});

describe("20F-DRAFT section items: 19A normalizer reused unchanged, composite / SmartSim gates, code-owned ids and marks", () => {
  const p = plan2(); if (!p.ok) throw new Error();
  const sec = p.plan.sections[0];
  const okItems = () => ({ items: [F.item("multipleChoice", { question: { ...F.mcq("س", ["أ", "ب"]), marks: 99 } }), F.item("composite", { composite: F.composite("ن", F.simContext(F.netSim("roas")), [F.group([F.part("smartSim", 4, { linked: true, simChecks: ["k1", "k2"] }), F.part("multipleChoice", 2, { linked: true, question: F.mcq("ب", ["1", "2"]) })])]) })] });
  it("valid section: code-owned ids, plan marks (the model's marks ignored), one shared context", () => {
    const r = normalizeSectionDraft(okItems(), sec, 0, { nonce: "abc123" }); expect(r.ok, JSON.stringify(r)).toBe(true); if (!r.ok) return;
    expect(r.section.questions.map(q => q.examQuestionId)).toEqual(["aiabc123-1-1", "aiabc123-1-2"]);
    expect(r.section.questions.map(q => q.marks)).toEqual([4, 6]);
    expect(((r.section.questions[1] as unknown as { composite: { contexts: unknown[] } }).composite.contexts).length).toBe(1);
  });
  it("item count / kind / payload mismatches are refused", () => {
    expect(codes(normalizeSectionDraft({ items: okItems().items.slice(0, 1) }, sec, 0, { nonce: "abc123" }))).toEqual(["AI_SECTION_ITEM_COUNT"]);
    expect(codes(normalizeSectionDraft({ items: [F.item("trueFalse", { question: F.tf("x", true) }), okItems().items[1]] }, sec, 0, { nonce: "abc123" }))).toEqual(["AI_ITEM_KIND_MISMATCH"]);
    expect(codes(normalizeSectionDraft({ items: [F.item("multipleChoice", { question: F.tf("x", true) }), okItems().items[1]] }, sec, 0, { nonce: "abc123" }))).toEqual(["AI_ITEM_KIND_MISMATCH"]);
    expect(codes(normalizeSectionDraft({ items: [F.item("multipleChoice", { question: F.mcq("x", ["a", "b"]), smartSim: { text: "x", sim: F.netSim("roas") } }), okItems().items[1]] }, sec, 0, { nonce: "abc123" }))).toEqual(["AI_ITEM_PAYLOAD"]);
  });
  it("composite marks must add up exactly (never redistributed); first-N needs equal marks", () => {
    const bad = okItems(); (bad.items[1] as { composite: { groups: { parts: { marks: number }[] }[] } }).composite.groups[0].parts[0].marks = 5;
    expect(codes(normalizeSectionDraft(bad, sec, 0, { nonce: "abc123" }))).toEqual(["AI_COMPOSITE_MARKS_MISMATCH"]);
    const firstN = F.item("composite", { composite: F.composite("ن", null, [F.group([F.part("multipleChoice", 4, { question: F.mcq("a", ["1", "2"]) }), F.part("multipleChoice", 2, { question: F.mcq("b", ["1", "2"]) })], { policy: "firstNAnswered", requiredAnswers: 1 })]) });
    expect(codes(normalizeComposerItem(firstN, { marks: 4, qid: "q1", request: "", path: "$" }))).toEqual(["AI_COMPOSITE_MARKS_MISMATCH"]);
  });
  it("SmartSim parts: unknown check ids, missing context, broken links, code stimulus in a part — refused", () => {
    const unknown = okItems(); (unknown.items[1] as { composite: { groups: { parts: { simChecks: string[] }[] }[] } }).composite.groups[0].parts[0].simChecks = ["k99"];
    expect(codes(normalizeSectionDraft(unknown, sec, 0, { nonce: "abc123" }))).toEqual(["AI_SIM_CHECK_UNKNOWN"]);
    const noCtx = F.item("composite", { composite: F.composite("ن", null, [F.group([F.part("smartSim", 6, { linked: true, simChecks: ["k1"] })])]) });
    expect(codes(normalizeComposerItem(noCtx, { marks: 6, qid: "q1", request: "", path: "$" }))).toEqual(["AI_COMPOSITE_SMARTSIM_CONTEXT"]);
    const stim = F.item("composite", { composite: F.composite("ن", null, [F.group([F.part("multipleChoice", 6, { question: { ...F.mcq("x", ["1", "2"]), codeStimulus: { language: "python", source: "print(1)", label: "" } } })])]) });
    expect(codes(normalizeComposerItem(stim, { marks: 6, qid: "q1", request: "", path: "$" }))).toEqual(["AI_COMPOSITE_PART_FIELD"]);
    const nested = F.item("composite", { composite: F.composite("ن", null, [F.group([F.part("composite", 6)])]) });
    expect(codes(normalizeComposerItem(nested, { marks: 6, qid: "q1", request: "", path: "$" }))).toEqual(["AI_COMPOSITE_MALFORMED"]);
  });
  it("coding drafts cannot smuggle hidden tests; unknown coding languages are refused", () => {
    const smuggled = F.item("coding", { question: { ...F.coding("x", "python"), hiddenTests: [{ input: "1", expectedOutput: "1" }] } });
    expect(normalizeComposerItem(smuggled, { marks: 5, qid: "q1", request: "", path: "$" }).ok).toBe(false);
    expect(normalizeComposerItem(F.item("coding", { question: F.coding("x", "rust") }), { marks: 5, qid: "q1", request: "", path: "$" }).ok).toBe(false);
  });
  it("hostile shapes: prototype keys, deep nesting, NaN-like strings, negative marks, unknown kinds", () => {
    expect(normalizeComposerItem(JSON.parse('{"__proto__":{"x":1}}'), { marks: 5, qid: "q1", request: "", path: "$" }).ok).toBe(false);
    let deep: Record<string, unknown> = {}; for (let i = 0; i < 500; i++) deep = { a: deep };
    expect(normalizeComposerItem(deep, { marks: 5, qid: "q1", request: "", path: "$" }).ok).toBe(false);
    const nan = okItems(); (nan.items[1] as { composite: { groups: { parts: { marks: unknown }[] }[] } }).composite.groups[0].parts[0].marks = "NaN";
    expect(normalizeSectionDraft(nan, sec, 0, { nonce: "abc123" }).ok).toBe(false);
    const neg = okItems(); (neg.items[1] as { composite: { groups: { parts: { marks: unknown }[] }[] } }).composite.groups[0].parts[0].marks = -4;
    expect(normalizeSectionDraft(neg, sec, 0, { nonce: "abc123" }).ok).toBe(false);
    expect(normalizeComposerItem(F.item("hotspotLatest"), { marks: 5, qid: "q1", request: "", path: "$" }).ok).toBe(false);
    expect(JSON.stringify(buildSectionDraftSchema())).not.toMatch(/"hiddenTests"|"checks"|"examQuestionId"/);
  });
});

describe("20F-EXAM verdict, history, revision, projection", () => {
  it("composer gates: production identities, allowed SmartSim plugins only, coding hidden-test policy, total marks", () => {
    const e = fixture("smartsim-20e/D-network-flow.json");
    const old = { ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => ({ ...q, smartSim: { ...(q as unknown as { smartSim: object }).smartSim, pluginVersion: 1, config: { v: 1, devices: [], links: [] } } })) })) } as StructuredExam;
    expect(composerVerdict(old).blocking.map(i => i.code)).toContain("COMPOSER_SIM_NOT_ALLOWED");
    const cs = fixture("composite-20d/cs.json");
    expect(composerVerdict(cs).blocking.map(i => i.code)).toContain("AI_CODING_TRUSTED_MATERIAL_FORBIDDEN");
    expect(composerVerdict(cs, { aiQuestionIds: new Set() }).blocking).toEqual([]);
    expect(composerVerdict(manual(), { intent: intent({ totalMarks: 8 }) }).blocking.map(i => i.code)).toEqual(["COMPOSER_TOTAL_MISMATCH"]);
    expect(verifyAiQuestion(cs.sections[0].questions[0]).length).toBeGreaterThan(0);
  });
  it("history is bounded and carries no prompt / reasoning; the student never receives it", () => {
    let e = manual();
    for (let i = 0; i < COMPOSER_LIMITS.historyEntries + 5; i++) e = withComposerHistory(e, { at: "t" + i, mode: "modifyExam", summary: "x".repeat(500), baseRevision: "rev1-0000000000000000", status: "applied", operations: 1, warnings: 0 });
    const h = (e.metadata as { aiComposer: { history: { summary: string; at: string }[] } }).aiComposer.history;
    expect(h.length).toBe(COMPOSER_LIMITS.historyEntries); expect(h[0].at).toBe("t5"); expect(h[0].summary.length).toBe(COMPOSER_LIMITS.historySummaryChars);
    expect(Object.keys(h[0]).sort()).toEqual(["at", "baseRevision", "mode", "operations", "status", "summary", "warnings"]);
  });
  it("revision: content hash, key-order independent, save timestamps excluded, any edit changes it", () => {
    const e = manual();
    expect(examRevision(e)).toMatch(/^rev1-[0-9a-f]{16}$/);
    expect(examRevision({ ...e, updatedAt: "x", createdAt: "y" })).toBe(examRevision(e));
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    const edited = JSON.parse(JSON.stringify(e)); edited.sections[0].questions[0].marks += 1;
    expect(examRevision(edited)).not.toBe(examRevision(e));
  });
  it("AI-safe projection: allow-list only — no answer, checks, hidden tests, rubric, guidance, model answer, media data, student data", () => {
    for (const rel of ["composite-20d/cs.json", "composite-20d/network.json", "composite-20d/physics.json", "smartsim-20e/D-network-flow.json", "composite-20d/arabic.json"]) {
      const p = buildAiSafeProjection(fixture(rel), { kind: "exam" });
      expect(p).not.toBeNull();
      const s = JSON.stringify(p);
      expect(s, rel).not.toMatch(/"answer"|hiddenTests|expectedOutput|referenceSolutions|"checks"|"rubric"|guidance|modelAnswer|correctOptionIndex|targetState|dataUrl|blobName/);
      expect(payloadIsSafe(p)).toBe(true);
    }
    expect(payloadIsSafe({ answer: 1 })).toBe(false); expect(payloadIsSafe({ studentId: "s" })).toBe(false);
  });
  it("projection is purpose-specific (out-of-scope questions are outlines) and byte-bounded", () => {
    const p = buildAiSafeProjection(manual(), { kind: "question", questionId: "a-q2" })!;
    const qs = p.sections[0].questions;
    expect(qs.find(q => q.id === "a-q2")!.outlineOnly).toBeUndefined(); expect(qs.find(q => q.id === "a-q1")!.outlineOnly).toBe(true);
    const huge = manual(); huge.sections[0].questions = Array.from({ length: 2000 }, (_, i) => ({ ...huge.sections[0].questions[0], examQuestionId: "h" + i, text: "x".repeat(500) }));
    expect(buildAiSafeProjection(huge, { kind: "exam" })).toBeNull();
  });
});

const ctxOf = (exam: StructuredExam, mode: string, scope: Record<string, unknown>) => ({ exam, mode: mode as never, scope: scope as never, nonce: "abc123", request: "r" });
describe("20F-PATCH domain patches: scope lock, protected fields, stale protection, atomic groups, no new blocking", () => {
  it("modes require their scope; only domain operations exist", () => {
    expect(modeScopeOk("presentation", { kind: "exam" })).toBe(false); expect(modeScopeOk("replaceQuestion", { kind: "question", questionId: "x" })).toBe(true);
    expect(JSON.stringify(buildPatchSchema())).not.toMatch(/"path"|"pointer"|"json"/);
    expect(codes(normalizeComposerPatch(F.patch([F.op("setJsonPath")]), ctxOf(manual(), "modifyExam", { kind: "exam" })))).toEqual(["PATCH_OP_MALFORMED"]);
  });
  it("scope lock: a question-scoped request cannot touch another question, the presentation or the structure", () => {
    const c = ctxOf(manual(), "improveContent", { kind: "question", questionId: "a-q2" });
    expect(normalizeComposerPatch(F.patch([F.op("updateQuestionText", { questionId: "a-q2", text: "نص" })]), c).ok).toBe(true);
    expect(codes(normalizeComposerPatch(F.patch([F.op("updateQuestionText", { questionId: "a-q1", text: "نص" })]), c))).toEqual(["PATCH_SCOPE_VIOLATION"]);
    expect(codes(normalizeComposerPatch(F.patch([F.op("updateQuestionMarks", { questionId: "a-q2", marks: 9 })]), c))).toEqual(["PATCH_SCOPE_VIOLATION"]);
    expect(codes(normalizeComposerPatch(F.patch([F.op("updatePresentation", { preset: "focus" })]), c))).toEqual(["PATCH_SCOPE_VIOLATION"]);
    expect(codes(normalizeComposerPatch(F.patch([F.op("removeSection", { sectionId: "a-s1" })]), c))).toEqual(["PATCH_SCOPE_VIOLATION"]);
  });
  it("targets must exist; conflicting operations and composite mark edits are refused", () => {
    const c = ctxOf(manual(), "modifyExam", { kind: "exam" });
    expect(codes(normalizeComposerPatch(F.patch([F.op("updateQuestionText", { questionId: "ghost", text: "x" })]), c))).toEqual(["PATCH_TARGET_MISSING"]);
    const item = F.item("multipleChoice", { question: F.mcq("x", ["a", "b"]) });
    expect(codes(normalizeComposerPatch(F.patch([F.op("replaceQuestion", { questionId: "a-q1", item }), F.op("removeQuestion", { questionId: "a-q1" })]), c))).toEqual(["PATCH_CONFLICT"]);
    const comp = fixture("composite-20d/arabic.json");
    expect(codes(normalizeComposerPatch(F.patch([F.op("updateQuestionMarks", { questionId: comp.sections[0].questions[0].examQuestionId, marks: 3 })]), ctxOf(comp, "modifyExam", { kind: "exam" })))).toEqual(["PATCH_COMPOSITE_MARKS"]);
  });
  it("text operations never touch answer / marks / type / id; selective apply keeps groups atomic; stale is refused", () => {
    const e = manual();
    const n = normalizeComposerPatch(F.patch([F.op("updateQuestionText", { questionId: "a-q1", text: "نص أ" }), F.op("updateQuestionRichContent", { questionId: "a-q1", richBlocks: [F.callout("ملاحظة")], richMode: "append" }), F.op("updateQuestionText", { questionId: "a-q3", text: "نص ج" })]), ctxOf(e, "modifyExam", { kind: "exam" }));
    expect(n.ok).toBe(true); if (!n.ok) return;
    expect(patchGroups(n.patch)).toEqual([[0, 1], [2]]);
    const a = applyComposerPatch(e, n.patch, { selected: [0], now: "t", request: "r" });
    expect(a.ok).toBe(true); if (!a.ok) return;
    expect(a.applied).toEqual([0, 1]);
    const [q1, , q3] = a.exam.sections[0].questions;
    expect(q1.text).toBe("نص أ"); expect(q1.answer).toEqual(e.sections[0].questions[0].answer); expect(q1.marks).toBe(e.sections[0].questions[0].marks); expect(q1.presentationType).toBe("multipleChoice");
    expect(q3.text).toBe(e.sections[0].questions[2].text);
    const edited = { ...e, title: "changed" };
    expect(applyComposerPatch(edited, n.patch, { now: "t", request: "r" })).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });
  it("a patch introducing a blocking issue is refused; a tampered patch shape is refused", () => {
    const e = manual();
    const n = normalizeComposerPatch(F.patch([F.op("removeSection", { sectionId: "a-s1" })]), ctxOf(e, "modifyExam", { kind: "exam" }));   // NO_SECTIONS
    expect(n.ok).toBe(true); if (!n.ok) return;
    expect(applyComposerPatch(e, n.patch, { now: "t", request: "r" })).toMatchObject({ ok: false, code: "PATCH_NEW_BLOCKING" });
    expect(isPatchShape({ ...n.patch, baseRevision: "latest" })).toBe(false);
    expect(applyComposerPatch(e, { ...n.patch, operations: [{ op: "exec", cmd: "rm" }] } as unknown as AiExamPatchV1, { now: "t", request: "r" }).ok).toBe(false);
  });
  it("replaceQuestion drops hidden tests only explicitly (diff warning); removeCompositePart recomputes composite marks", () => {
    const cs = fixture("composite-20d/cs.json");
    const q = cs.sections[0].questions[0];
    const n = normalizeComposerPatch(F.patch([F.op("replaceQuestion", { questionId: q.examQuestionId, item: F.item("multipleChoice", { question: F.mcq("x", ["a", "b"]) }) })]), ctxOf(cs, "replaceQuestion", { kind: "question", questionId: q.examQuestionId }));
    expect(n.ok).toBe(true);
    const comp = fixture("composite-20d/arabic.json");
    const cq = comp.sections[0].questions[0] as unknown as { examQuestionId: string; marks: number; composite: { groups: { gradingPolicy: string; parts: { id: string; marks: number }[] }[] } };
    const allGroup = cq.composite.groups.find(g => g.gradingPolicy === "all")!;
    const victim = allGroup.parts[0];
    const r = normalizeComposerPatch(F.patch([F.op("removeCompositePart", { questionId: cq.examQuestionId, partId: victim.id })]), ctxOf(comp, "modifyExam", { kind: "exam" }));
    expect(r.ok).toBe(true); if (!r.ok) return;
    const a = applyComposerPatch(comp, r.patch, { now: "t", request: "r" });
    expect(a.ok, JSON.stringify(a)).toBe(true); if (!a.ok) return;
    expect(a.exam.sections[0].questions[0].marks).toBe(cq.marks - victim.marks);
  });
});

describe("20F-SM composer state machine", () => {
  it("legal transitions only; late results after cancel are ignored; apply only from ready", () => {
    let s = composerReducer(initialComposer(), { type: "START", run: 1 });
    expect(s.name).toBe("planning");
    s = composerReducer(s, { type: "STAGE", run: 1, name: "generating", stage: "إنشاء الأسئلة" });
    s = composerReducer(s, { type: "CANCEL" }); expect(s.name).toBe("cancelled");
    expect(composerReducer(s, { type: "READY", run: 1, result: 1 }).name).toBe("cancelled");
    expect(composerReducer(s, { type: "APPLY" }).name).toBe("cancelled");
    s = composerReducer(composerReducer(s, { type: "START", run: 2 }), { type: "READY", run: 2, result: 2 });
    expect(s.name).toBe("ready");
    expect(composerReducer(s, { type: "READY", run: 1, result: 9 }).result).toBe(2);
    expect(composerReducer(composerReducer(s, { type: "APPLY" }), { type: "APPLIED" }).name).toBe("applied");
    expect(composerReducer(s, { type: "STALE" }).name).toBe("stale");
  });
});
