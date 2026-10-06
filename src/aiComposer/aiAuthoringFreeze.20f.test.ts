import { describe, it, expect } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import { AI_AUTHOR_INTENTS, AI_GENERATED_TYPES, AI_AUTHOR_LIMITS, buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft, verifyAiQuestionNode } from "../aiQuestionDraft";
import { AI_SCENARIO_LIMITS, AI_SCENARIO_SOURCE_KINDS, buildAiScenarioPrompt, buildAiScenarioSchema, normalizeAiScenarioDraft } from "../aiScenarioDraft";

// Phase 20F — FREEZE PINS of the existing AI-assisted authoring (19A single question, 19B–19F families, 19G scenario). The 20F composer
// EXTENDS this layer and reuses the per-question normalizer unchanged; these digests were captured on baseline 20d5a48 (twice, identical)
// and must stay byte-identical: vocabulary, limits, the strict schemas, the prompts, the advisory request signals and the normalizer's
// decisions (accepted nodes AND refusals, incl. the coding hidden-test policy). Capture mode: CAPTURE_20F_PINS=<file>.
const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);
const iface = (over: Record<string, unknown> = {}) => ({ name: "", mode: "", accessVlan: 0, nativeVlan: 0, adminState: "", ipAddress: "", subnetMask: "", ...over });
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
const draft = (over: Record<string, unknown> = {}) => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "اشرح", marks: 2, ...NONE, ...over });
const piece = (over: Record<string, unknown>) => ({ kind: "text", text: "", accepted: [], caseSensitive: false, options: [], correctIndex: -1, ...over });

const REQUESTS = [
  "أنشئ سؤال اختيار من متعدد عن طبقات OSI", "أنشئ سؤال محاكي سويتش VLAN 10 و20 وtrunk", "اضبط OSPF على الراوتر", "أكمل الفقرة التالية بقوائم منسدلة عن DHCP",
  "اكتب برنامج بايثون يطبع مجموع عددين", "تتبع تنفيذ البرنامج التالي في جدول", "اشرح الفرق بين TCP و UDP مع سلم تقدير", "Create a parametric question with random numbers for each student",
  "سم أجزاء الخلية على الرسم", "انقر على الراوتر في الصورة", "Import a .smartsim simulation package", "Explain the code below"
];
const DRAFTS: Record<string, unknown> = {
  shortAnswer: draft({ text: "اشرح مفهوم VLAN", shortAnswer: { modelAnswer: "شبكة منطقية" } }),
  mcq: draft({ intent: "multipleChoice", text: "ما الطبقة الثالثة؟", marks: 1, multipleChoice: { options: ["Network", "Transport", "Session"], correctIndex: 0 } }),
  mcqBadIndex: draft({ intent: "multipleChoice", text: "ما الطبقة الثالثة؟", marks: 1, multipleChoice: { options: ["Network", "Transport"], correctIndex: 5 } }),
  tf: draft({ intent: "trueFalse", text: "IPv4 = 32 bit", trueFalse: { correct: true } }),
  fill: draft({ intent: "fillBlank", text: "أكمل", fillBlank: { blanks: [{ label: "المنفذ", correctText: "80" }] } }),
  cloze: draft({ intent: "inlineCloze", text: "أكمل الفقرة", marks: 4, inlineCloze: { scoring: "proportional", pieces: [piece({ text: "بروتوكول " }), piece({ kind: "dropdown", options: ["DHCP", "DNS"], correctIndex: 0 }), piece({ text: " يوزّع العناوين." })] } }),
  netcli: draft({ intent: "networkCli", text: "اضبط المبدّل", marks: 6, networkCli: { scoring: "proportional", initialHostname: "Switch", initialVlans: [], initialInterfaces: [], targetHostname: "SW1", targetVlans: [{ id: 10, name: "STAFF" }], targetInterfaces: [iface({ name: "fa0/1", mode: "access", accessVlan: 10 })] } }),
  netcliRouter: draft({ intent: "networkCli", text: "اضبط OSPF", marks: 6, unsupportedCapabilities: ["ospf"], networkCli: { scoring: "proportional", initialHostname: "R", initialVlans: [], initialInterfaces: [], targetHostname: "R1", targetVlans: [], targetInterfaces: [] } }),
  coding: draft({ intent: "coding", text: "اكتب برنامجًا يطبع مجموع عددين", marks: 5, coding: { mode: "writeProgram", language: "python", starterCode: "", publicExamples: [{ input: "1 2", sampleOutput: "3" }] } }),
  codingSmuggled: { ...(draft({ intent: "coding", text: "x", marks: 5, coding: { mode: "writeProgram", language: "python", starterCode: "", publicExamples: [] } }) as object), hiddenTests: [{ input: "1", expectedOutput: "1" }] },
  simulation: draft({ intent: "simulation", text: "محاكاة" }),
  unsupported: draft({ intent: "unsupported", text: "?" }),
  proto: JSON.parse('{"__proto__":{"x":1},"intent":"shortAnswer"}'),
  open: draft({ intent: "openResponse", text: "قارن بين TCP و UDP", marks: 6, openResponse: { profile: "compare", instructions: "", minChars: 0, maxChars: 1500, rubricVisibility: "hidden", criteria: [
    { title: "الدقة", description: "دقة المقارنة", guidance: "سرّي", maxScore: 4, allowCustomScore: false, levels: [{ label: "كامل", score: 4, description: "" }, { label: "صفر", score: 0, description: "" }] }], modelAnswer: "TCP موثوق" } }),
  parametric: draft({ intent: "parametricNumeric", text: "احسب {{a}} + {{b}}", marks: 2, parametricNumeric: { variables: [{ name: "a", kind: "integer", min: 1, max: 9, step: 1, format: { kind: "plain", decimals: 0 } }, { name: "b", kind: "integer", min: 1, max: 9, step: 1, format: { kind: "plain", decimals: 0 } }], derivedVariables: [], constraints: [], answerExpression: "a+b", mode: "tolerance", tolerance: 0, below: 0, above: 0, unitMode: "none", unitLabel: "", unit: "" } })
};
const SCENARIO = { title: "سيناريو", instructions: "اقرأ", explanation: "", sources: [{ kind: "text", title: "نص", text: "شبكة مدرسة", headers: [], rows: [], language: "", source: "" }], questions: [DRAFTS.shortAnswer, DRAFTS.mcq] };

function capture() {
  const out: Record<string, unknown> = {
    vocabulary: { intents: [...AI_AUTHOR_INTENTS], generated: [...AI_GENERATED_TYPES], limits: AI_AUTHOR_LIMITS, scenarioLimits: AI_SCENARIO_LIMITS, sourceKinds: [...AI_SCENARIO_SOURCE_KINDS] },
    schemas: { question: sha(buildAiAuthorSchema()), scenario: sha(buildAiScenarioSchema()) }
  };
  out.signals = REQUESTS.map(r => classifyAuthorRequest(r));
  out.prompts = REQUESTS.map(r => sha(buildAiAuthorPrompt(r, classifyAuthorRequest(r))));
  out.preferredPrompt = sha(buildAiAuthorPrompt(REQUESTS[0], classifyAuthorRequest(REQUESTS[0]), "trueFalse"));
  out.scenarioPrompts = REQUESTS.slice(0, 4).map(r => sha(buildAiScenarioPrompt(r, classifyAuthorRequest(r))));
  out.normalize = Object.fromEntries(Object.entries(DRAFTS).map(([k, d]) => {
    const r = normalizeAiQuestionDraft(d, { request: "x" }) as Record<string, unknown>;
    return [k, { ok: r.ok, code: r.code ?? null, digest: sha(r) }];
  }));
  const sc = normalizeAiScenarioDraft(SCENARIO, { request: "x" }) as Record<string, unknown>;
  out.scenario = { ok: sc.ok, code: sc.code ?? null, digest: sha(sc) };
  const codingNode = (normalizeAiQuestionDraft(DRAFTS.coding, { request: "x" }) as { question?: Record<string, unknown> }).question!;
  const tampered = { ...codingNode, answer: { ...(codingNode.answer as object), hiddenTests: [{ id: "h1", input: "1", expectedOutput: "1", weight: 1 }], gradingMode: "hiddenTests" } };
  const v = verifyAiQuestionNode(tampered) as Record<string, unknown>;
  out.codingPolicy = { ok: v.ok, code: v.code ?? null, digest: sha(v) };
  return out;
}

const PIN = {"vocabulary":{"intents":["multipleChoice","trueFalse","shortAnswer","fillBlank","inlineCloze","networkCli","parametricNumeric","openResponse","hotspot","labelDiagram","simulation","coding","tableFill","unsupported"],"generated":["multipleChoice","trueFalse","shortAnswer","fillBlank","inlineCloze","networkCli","parametricNumeric","openResponse","tableFill","coding"],"limits":{"requestChars":2000,"textChars":4000,"explanationChars":1000,"capabilities":20,"capabilityChars":100,"options":8,"fillBlanks":10,"pieces":100,"pieceOptions":12,"accepted":20,"stringChars":500,"vlans":64,"interfaces":32,"paramVariables":20,"paramConstraints":20,"rubricCriteria":12,"rubricLevels":8,"tableColumns":6,"tableRows":20,"tableAnswerCells":60,"publicExamples":10,"codeChars":16000},"scenarioLimits":{"requestChars":2000,"sources":4,"questions":6,"titleChars":200,"instructionsChars":2000,"explanationChars":1000,"textChars":8000,"codeChars":16000,"tableColumns":6,"tableRows":20,"cellChars":200},"sourceKinds":["text","table","code"]},"schemas":{"question":"77a11a6b448156eb58a41bb8","scenario":"d930db63c39bc5b22d4eaf46"},"signals":[{"suggestedIntent":null,"unsupportedCapabilities":[]},{"suggestedIntent":"networkCli","unsupportedCapabilities":[]},{"suggestedIntent":null,"unsupportedCapabilities":["router","ospf"]},{"suggestedIntent":"inlineCloze","unsupportedCapabilities":["dhcp"]},{"suggestedIntent":"coding","unsupportedCapabilities":[]},{"suggestedIntent":"tableFill","unsupportedCapabilities":[]},{"suggestedIntent":"openResponse","unsupportedCapabilities":[],"suggestedProfile":"explain"},{"suggestedIntent":"parametricNumeric","unsupportedCapabilities":[]},{"suggestedIntent":"labelDiagram","unsupportedCapabilities":[]},{"suggestedIntent":"hotspot","unsupportedCapabilities":["router"]},{"suggestedIntent":"simulation","unsupportedCapabilities":[]},{"suggestedIntent":"openResponse","unsupportedCapabilities":[],"suggestedProfile":"explain"}],"prompts":["b4ac61db07e152c4ea8a5e32","6dcbef374cc85603c06a4bff","d248a4d7470e353070ecf5a2","0327d14785dda5a535a5ca7f","a1d6fef4a46cb1d8cd2e8df1","7b9e1f2294b65889a6b1958f","a3480e82320c43e837767408","d3e8c74549af95640cd8506a","f47171426e0ca6385fb6eb8f","772bd15b9ffa0bbb93527a8f","8b5b035fb7df20f2ab0c4fa4","741ad3d5878b15c959e0d624"],"preferredPrompt":"fded884e0d428c99b0de091b","scenarioPrompts":["7da7d7f363f5cb30d4566455","f1cde2a46e648267c9a36e46","6d201cb233296c8ad76ae91f","48ba540474a9258d5811ed97"],"normalize":{"shortAnswer":{"ok":true,"code":null,"digest":"2f9c473255ce3b7ea27dbe82"},"mcq":{"ok":true,"code":null,"digest":"92044794624916d1d71f054a"},"mcqBadIndex":{"ok":false,"code":"AI_DRAFT_INVALID","digest":"0785bc150688da2ac3d696af"},"tf":{"ok":true,"code":null,"digest":"14f45580e6aa0768feead181"},"fill":{"ok":true,"code":null,"digest":"ab52abade0dff597c71bb13f"},"cloze":{"ok":true,"code":null,"digest":"cb752e3133f274397115d04c"},"netcli":{"ok":true,"code":null,"digest":"035c38472e81acde390f9262"},"netcliRouter":{"ok":false,"code":"AI_NETCLI_UNSUPPORTED_CAPABILITY","digest":"8383fb9cdb51598bb9ce06e2"},"coding":{"ok":true,"code":null,"digest":"52a46bdec53da1198666038d"},"codingSmuggled":{"ok":false,"code":"AI_DRAFT_MALFORMED","digest":"db526e779dae3f7b62f14b90"},"simulation":{"ok":false,"code":"AI_TYPE_NOT_GENERATED","digest":"669e7577b0c5d564351cd174"},"unsupported":{"ok":false,"code":"AI_REQUEST_UNSUPPORTED","digest":"0a925f607272dd8ec1e2ab58"},"proto":{"ok":false,"code":"AI_DRAFT_MALFORMED","digest":"db526e779dae3f7b62f14b90"},"open":{"ok":true,"code":null,"digest":"b4d3adf707f4ebcf76d197e9"},"parametric":{"ok":true,"code":null,"digest":"b1dcd66a38890941a92f479c"}},"scenario":{"ok":true,"code":null,"digest":"0f2ac26f318e579c0934eeca"},"codingPolicy":{"ok":false,"code":"AI_DRAFT_INVALID","digest":"289c86ec5b1fe282abf3cd1d"}} as Record<string, unknown>;

describe("20F-FZ existing AI authoring is frozen (pins captured on 20d5a48)", () => {
  it("capture / compare", () => {
    const now = capture();
    if (process.env.CAPTURE_20F_PINS) { fs.writeFileSync(process.env.CAPTURE_20F_PINS, JSON.stringify(now)); return; }
    expect(now).toEqual(PIN);
  });
});
