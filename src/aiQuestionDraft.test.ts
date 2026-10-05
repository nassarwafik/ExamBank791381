import { describe, it, expect } from "vitest";
import { AI_AUTHOR_INTENTS, buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft } from "./aiQuestionDraft";
import { validateNetworkCliAnswerKey, validateNetworkCliConfig, projectNetworkCliConfigForStudent } from "./networkCliQuestion";
import { validateInlineClozeAnswerKey, validateInlineClozeConfig, projectInlineClozeConfigForStudent } from "./inlineClozeQuestion";
import { validateStructuredExam } from "./examQuality";
import type { BuilderQuestion } from "./examTypes";

// Phase 19A — AI-assisted question authoring. The AI only PROPOSES a typed draft; the deterministic normalizer maps it to the
// canonical node of the chosen type and the SAME canonical validators manual authoring uses decide validity (networkCli
// validateNetworkCliQuestion / inlineCloze validateInlineClozeQuestion / the structured-exam quality gate). Nothing is repaired
// after the fact: an invalid contract is refused with the validator's issues. New-function suite (fail-first on 91b1f3d8: the
// module does not exist).
const iface = (over: Record<string, unknown> = {}) => ({ name: "", mode: "", accessVlan: 0, nativeVlan: 0, adminState: "", ipAddress: "", subnetMask: "", ...over });
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null };
const draft = (over: Record<string, unknown> = {}) => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "اشرح", marks: 2, ...NONE, ...over });
const switchDraft = (net: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => draft({
  intent: "networkCli", text: "اضبط المبدّل: أنشئ VLAN 10 و20 واربط المنافذ واجعل g0/1 trunk بـ native VLAN 99.", marks: 8,
  networkCli: {
    scoring: "proportional", initialHostname: "Switch", initialVlans: [], initialInterfaces: [],
    targetHostname: "BR1-SW1",
    targetVlans: [{ id: 10, name: "STAFF" }, { id: 20, name: "SALES" }, { id: 99, name: "" }],
    targetInterfaces: [iface({ name: "FastEthernet0/5", mode: "access", accessVlan: 10 }), iface({ name: "fa0/6", mode: "access", accessVlan: 20 }), iface({ name: "Gi0/1", mode: "trunk", nativeVlan: 99 }), iface({ name: "vlan 20", ipAddress: "192.168.20.2", subnetMask: "255.255.255.0" })],
    ...net
  },
  ...over
});
const clozeDraft = (pieces: unknown[], over: Record<string, unknown> = {}) => draft({ intent: "inlineCloze", text: "أكمل الفقرة التالية.", marks: 4, inlineCloze: { scoring: "proportional", pieces }, ...over });
const piece = (over: Record<string, unknown>) => ({ kind: "text", text: "", accepted: [], caseSensitive: false, options: [], correctIndex: -1, ...over });
const okQuestion = (r: ReturnType<typeof normalizeAiQuestionDraft>): BuilderQuestion => { expect(r.ok, JSON.stringify(r)).toBe(true); return (r as { question: BuilderQuestion }).question; };
const structuredErrors = (q: BuilderQuestion) => validateStructuredExam({ title: "t", sections: [{ id: "s", title: "s", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [q] }] } as never).filter(i => i.severity === "error");

describe("19A AI authoring — intent vocabulary, strict schema and prompt", () => {
  it("the AI can deliberately select networkCli and inlineCloze, distinguish fillBlank / simulation / coding, and declare 'unsupported'", () => {
    for (const intent of ["multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "networkCli", "simulation", "coding", "unsupported"]) expect(AI_AUTHOR_INTENTS).toContain(intent);
    expect(buildAiAuthorSchema().properties.intent.enum).toEqual([...AI_AUTHOR_INTENTS]);
  });
  it("the schema is strict at every object level (additionalProperties false, every property required) — the AI can never add a field", () => {
    const walk = (s: Record<string, unknown>, path: string) => {
      const options = (Array.isArray(s.anyOf) ? s.anyOf : [s]) as Record<string, unknown>[];
      for (const o of options) {
        if (o.type === "object" || (Array.isArray(o.type) && o.type.includes("object"))) {
          expect(o.additionalProperties, path).toBe(false);
          expect([...(o.required as string[])].sort(), path).toEqual(Object.keys(o.properties as object).sort());
          for (const [k, v] of Object.entries(o.properties as Record<string, Record<string, unknown>>)) walk(v, path + "." + k);
        }
        if (o.type === "array") walk(o.items as Record<string, unknown>, path + "[]");
      }
    };
    walk(buildAiAuthorSchema() as unknown as Record<string, unknown>, "$");
    expect(JSON.stringify(buildAiAuthorSchema())).not.toMatch(/targetState|"answer"|examQuestionId|"id":\{"type":"string"/);
  });
  it("the prompt names the exact networkCli V1 capability scope, the inventory, the refusals and the cloze rules", () => {
    const p = buildAiAuthorPrompt("أنشئ سؤال محاكي سويتش", classifyAuthorRequest("أنشئ سؤال محاكي سويتش"));
    for (const s of ["networkCli", "inlineCloze", "FastEthernet0/1", "GigabitEthernet0/1", "native VLAN", "unsupportedCapabilities", "router", "ambiguous", "dropdown", "textBlank"]) expect(p).toContain(s);
    expect(p).toMatch(/never (?:put|include|reveal)/i);
  });
});

describe("19A AI authoring — deterministic request signals (advisory, never the sole authority)", () => {
  it("Arabic and English simulator requests are recognised as networkCli candidates; router-only capabilities are flagged as unsupported", () => {
    for (const r of ["أنشئ سؤال محاكي سويتش", "ابنِ سؤال VLAN 10 و20 مع trunk", "اطلب من الطالب إنشاء VLANs وربط المنافذ", "Create a Cisco-like switch CLI question", "Create a network simulator question requiring VLAN 20 and native VLAN 99"])
      expect(classifyAuthorRequest(r).suggestedIntent, r).toBe("networkCli");
    expect(classifyAuthorRequest("اكتب سؤال OSPF على الراوتر R1").unsupportedCapabilities.length).toBeGreaterThan(0);
    expect(classifyAuthorRequest("Configure static routing and ACL on router R1").unsupportedCapabilities).toEqual(expect.arrayContaining(["router"]));
  });
  it("cloze / dropdown wording is recognised in Arabic and English", () => {
    for (const r of ["اكتب فقرة فيها 4 فراغات", "اجعل الفراغ الأول كتابة والثاني قائمة منسدلة", "Create a cloze paragraph with three blanks", "Create an inline fill-in passage mixing dropdowns and text answers"])
      expect(classifyAuthorRequest(r).suggestedIntent, r).toBe("inlineCloze");
  });
});

describe("19A AI authoring — networkCli drafts pass the canonical validators or are refused", () => {
  it("a VLAN / access / trunk / native VLAN / SVI draft becomes a canonical networkCli@1 node that passes the same validators as manual authoring", () => {
    const q = okQuestion(normalizeAiQuestionDraft(switchDraft(), { request: "ابنِ سؤال VLAN 10 و20 مع trunk" }));
    expect(q.presentationType).toBe("networkCli");
    expect(q.questionTypeVersion).toBe(1);
    expect(validateNetworkCliConfig(q.networkCli).ok).toBe(true);
    const key = validateNetworkCliAnswerKey(q.answer);
    expect(key.ok).toBe(true);
    expect(key.ok && Object.keys(key.key.targetState.interfaces ?? {}).sort()).toEqual(["f0/5", "f0/6", "g0/1", "vlan20"]);
    expect(key.ok && key.key.checks).toBe(1 + 3 + 2 + 2 + 2 + 2 + 2);   // hostname + 3 VLANs + 2 names + 3 ports×2 + SVI address/mask
    expect(structuredErrors(q)).toEqual([]);
  });
  it("hostname-only, allOrNothing and an initial state are mapped faithfully (no invented fields)", () => {
    const q = okQuestion(normalizeAiQuestionDraft(switchDraft({ scoring: "allOrNothing", initialHostname: "LAB", initialVlans: [{ id: 30, name: "OLD" }], initialInterfaces: [iface({ name: "f0/2", adminState: "shutdown" })], targetVlans: [], targetInterfaces: [] }), { request: "switch hostname" }));
    expect(q.networkCli).toEqual({ device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB", vlans: { "30": { name: "OLD" } }, interfaces: { "f0/2": { shutdown: true } } } });
    expect(q.answer).toEqual({ targetState: { hostname: "BR1-SW1", vlans: {}, interfaces: {} }, scoring: "allOrNothing" });
  });
  it("a malformed generated public config / target is REFUSED with the canonical issues — never repaired", () => {
    const bad = [
      switchDraft({ targetVlans: [{ id: 4095, name: "" }] }),
      switchDraft({ targetVlans: [{ id: 1002, name: "" }] }),
      switchDraft({ targetInterfaces: [iface({ name: "FastEthernet0/48", mode: "access", accessVlan: 10 })] }),
      switchDraft({ targetInterfaces: [iface({ name: "Serial0/0/0", ipAddress: "10.0.0.1", subnetMask: "255.0.0.0" })] }),
      switchDraft({ targetInterfaces: [iface({ name: "f0/5", ipAddress: "10.0.0.1", subnetMask: "255.255.255.0" })] }),
      switchDraft({ targetInterfaces: [iface({ name: "vlan20", ipAddress: "192.168.20.0", subnetMask: "255.255.255.0" })] }),
      switchDraft({ initialInterfaces: [iface({ name: "g0/9" })] }),
      switchDraft({ targetHostname: "", targetVlans: [], targetInterfaces: [] }),
      switchDraft({ scoring: "bestEffort" })
    ];
    for (const d of bad) {
      const r = normalizeAiQuestionDraft(d, { request: "switch" });
      expect(r.ok, JSON.stringify(d.networkCli)).toBe(false);
      expect(!r.ok && r.code).toBe("AI_DRAFT_INVALID");
      expect(!r.ok && r.issues.length).toBeGreaterThan(0);
    }
  });
  it("two aliases of the same interface in one draft are refused (no silent merge)", () => {
    const r = normalizeAiQuestionDraft(switchDraft({ targetInterfaces: [iface({ name: "f0/5", mode: "access", accessVlan: 10 }), iface({ name: "FastEthernet0/5", accessVlan: 20 })] }), { request: "switch" });
    expect(r.ok).toBe(false); expect(!r.ok && r.code).toBe("AI_DRAFT_INVALID");
  });
  it("an unsupported router-only request never becomes a switch contract, even when the AI tries", () => {
    const routerRequest = "اكتب سؤال OSPF على الراوتر R1 مع ACL";
    const viaSignals = normalizeAiQuestionDraft(switchDraft(), { request: routerRequest });
    expect(viaSignals.ok).toBe(false); expect(!viaSignals.ok && viaSignals.code).toBe("AI_NETCLI_UNSUPPORTED_CAPABILITY");
    const declared = normalizeAiQuestionDraft(switchDraft({}, { unsupportedCapabilities: ["static routing"] }), { request: "switch question with static routing" });
    expect(declared.ok).toBe(false); expect(!declared.ok && declared.code).toBe("AI_NETCLI_UNSUPPORTED_CAPABILITY");
    const ambiguous = normalizeAiQuestionDraft(switchDraft({}, { confidence: "ambiguous" }), { request: "network question" });
    expect(ambiguous.ok).toBe(false); expect(!ambiguous.ok && ambiguous.code).toBe("AI_NETCLI_AMBIGUOUS");
  });
  it("targetState secrecy: the student projection of a generated question carries no target, no expected hostname, no VLAN names to configure", () => {
    const q = okQuestion(normalizeAiQuestionDraft(switchDraft(), { request: "switch" }));
    expect(JSON.stringify(projectNetworkCliConfigForStudent(q.networkCli))).not.toMatch(/BR1-SW1|STAFF|SALES|192\.168\.20\.2|targetState/);
  });
});

describe("19A AI authoring — inlineCloze drafts", () => {
  const mixed = [
    piece({ text: "يعمل البروتوكول " }), piece({ kind: "textBlank", accepted: ["IP", "Internet Protocol"] }),
    piece({ text: " في الطبقة الثالثة، وعنوان MAC يعمل في " }), piece({ kind: "dropdown", options: ["Physical", "Data Link", "Network"], correctIndex: 1 }),
    piece({ text: "." })
  ];
  it("a mixed text / dropdown draft becomes canonical inlineCloze@1 with stable ids, passing the canonical validator and the quality gate", () => {
    const q = okQuestion(normalizeAiQuestionDraft(clozeDraft(mixed), { request: "اجعل الفراغ الأول كتابة والثاني قائمة منسدلة" }));
    expect(q.presentationType).toBe("inlineCloze"); expect(q.questionTypeVersion).toBe(1);
    const cfg = validateInlineClozeConfig(q.inlineCloze);
    expect(cfg.ok).toBe(true);
    expect(cfg.ok && cfg.config.segments.filter(s => s.type === "blank").map(s => s.id)).toEqual(["b1", "b2"]);
    expect(validateInlineClozeAnswerKey(q.answer, q.inlineCloze)).toMatchObject({ ok: true, key: { scoring: "proportional", parts: 2, blanks: { b2: { control: "dropdown", correctOptionId: "o2" } } } });
    expect(structuredErrors(q)).toEqual([]);
    expect(JSON.stringify(projectInlineClozeConfigForStudent(q.inlineCloze))).not.toMatch(/Internet Protocol|correctOptionId|accepted/);
  });
  it("English request with three text blanks; empty text pieces are dropped and adjacent text merged (presentation only)", () => {
    const q = okQuestion(normalizeAiQuestionDraft(clozeDraft([piece({ text: "TCP is " }), piece({ text: "" }), piece({ text: "a " }), piece({ kind: "textBlank", accepted: ["connection-oriented"] }), piece({ text: " protocol; UDP is " }), piece({ kind: "textBlank", accepted: ["connectionless"] }), piece({ text: "; HTTP uses port " }), piece({ kind: "textBlank", accepted: ["80"] })], { text: "Complete the passage." }), { request: "Create a cloze paragraph with three blanks" }));
    const cfg = validateInlineClozeConfig(q.inlineCloze);
    expect(cfg.ok && cfg.config.segments[0]).toEqual({ type: "text", text: "TCP is a " });
    expect(cfg.ok && cfg.config.segments.filter(s => s.type === "blank").length).toBe(3);
  });
  it("an invalid AI cloze contract is refused by the canonical validator (dropdown index out of range, one option, empty accepted list, no blanks)", () => {
    for (const pieces of [
      [piece({ text: "A " }), piece({ kind: "dropdown", options: ["x", "y"], correctIndex: 5 })],
      [piece({ text: "A " }), piece({ kind: "dropdown", options: ["x"], correctIndex: 0 })],
      [piece({ text: "A " }), piece({ kind: "textBlank", accepted: [] })],
      [piece({ text: "no blanks here" })],
      [piece({ text: "A " }), piece({ kind: "dropdown", options: ["Same", "same"], correctIndex: 0 })]
    ]) {
      const r = normalizeAiQuestionDraft(clozeDraft(pieces), { request: "cloze" });
      expect(r.ok, JSON.stringify(pieces)).toBe(false); expect(!r.ok && r.code).toBe("AI_DRAFT_INVALID");
    }
  });
});

describe("19A AI authoring — ordinary families, refusals and malformed AI output", () => {
  it("ordinary fillBlank stays the legacy fillBlank (never re-interpreted as inlineCloze) and passes the quality gate", () => {
    const q = okQuestion(normalizeAiQuestionDraft(draft({ intent: "fillBlank", text: "أكمل: بروتوكول ____ يوزع العناوين.", fillBlank: { blanks: [{ label: "", correctText: "DHCP" }] } }), { request: "fill blank" }));
    expect(q.presentationType).toBe("fillBlank"); expect(q.questionTypeVersion).toBeUndefined();
    expect(q.fields?.[0]).toMatchObject({ kind: "text", correct: "DHCP" });
    expect(q.answer).toEqual({ mode: "exactSequence", values: ["DHCP"] });
    expect(structuredErrors(q)).toEqual([]);
  });
  it("multipleChoice / trueFalse / shortAnswer are generated canonically", () => {
    const mc = okQuestion(normalizeAiQuestionDraft(draft({ intent: "multipleChoice", text: "أي طبقة؟", multipleChoice: { options: ["1", "2", "3", "4"], correctIndex: 2 } }), { request: "mcq" }));
    expect(mc.options).toEqual([{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }]); expect(mc.answer).toEqual({ correctOptionIndex: 2 });
    expect(structuredErrors(mc)).toEqual([]);
    const tf = okQuestion(normalizeAiQuestionDraft(draft({ intent: "trueFalse", text: "VLAN تقسم مجال البث.", trueFalse: { correct: true } }), { request: "tf" }));
    expect(tf.answer).toEqual({ correct: true });
    const sa = okQuestion(normalizeAiQuestionDraft(draft({ shortAnswer: { modelAnswer: "تقسيم منطقي" } }), { request: "sa" }));
    expect(sa.presentationType).toBe("shortAnswer");
    expect(normalizeAiQuestionDraft(draft({ intent: "multipleChoice", multipleChoice: { options: ["a", "b"], correctIndex: 7 } }), { request: "x" })).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
  });
  // Phase 19F — coding is now generated from its PUBLIC material only (src/aiCodingModes.19f.test.ts); a coding intent WITHOUT that
  // payload is still refused and nothing (least of all a hidden test) is invented.
  it("simulation is recognised but never generated (it needs a teacher package); coding without a payload is refused; 'unsupported' is refused", () => {
    expect(normalizeAiQuestionDraft(draft({ intent: "simulation" }), { request: "smartsim" })).toMatchObject({ ok: false, code: "AI_TYPE_NOT_GENERATED", intent: "simulation" });
    expect(normalizeAiQuestionDraft(draft({ intent: "coding" }), { request: "python" })).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID", intent: "coding", issues: [{ code: "AI_TYPE_PAYLOAD_MISSING" }] });
    expect(normalizeAiQuestionDraft(draft({ intent: "unsupported", explanation: "router labs are not supported" }), { request: "router" })).toMatchObject({ ok: false, code: "AI_REQUEST_UNSUPPORTED" });
  });
  it("malformed AI output fails closed: unknown keys, smuggled private fields, prototype keys, wrong types, unknown intent", () => {
    const cases: unknown[] = [
      null, "text", [], { ...draft(), extra: 1 },
      { ...switchDraft(), networkCli: { ...(switchDraft().networkCli as unknown as Record<string, unknown>), targetState: { hostname: "X" } } },
      { ...switchDraft(), answer: { targetState: {} } },
      JSON.parse(JSON.stringify(draft()).replace("{", '{"__proto__":{"polluted":1},')),
      { ...draft(), marks: "2" }, { ...draft(), marks: 0 }, { ...draft(), intent: "dragAndDrop" },   // 19D: "hotspot" became a real (refused) visual intent
      clozeDraft([{ ...piece({ kind: "textBlank", accepted: ["x"] }), correct: true }])
    ];
    for (const c of cases) {
      const r = normalizeAiQuestionDraft(c, { request: "x" });
      expect(r.ok, JSON.stringify(c)).toBe(false);
      expect(!r.ok && ["AI_DRAFT_MALFORMED", "AI_INTENT_UNKNOWN"]).toContain(!r.ok && r.code);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("the generated node carries no unexpected public field: only the canonical keys of its type", () => {
    const q = okQuestion(normalizeAiQuestionDraft(switchDraft(), { request: "switch" }));
    expect(Object.keys(q).sort()).toEqual(["answer", "examQuestionId", "marks", "networkCli", "presentationType", "questionTypeVersion", "text"]);
    const c = okQuestion(normalizeAiQuestionDraft(clozeDraft([piece({ text: "A " }), piece({ kind: "textBlank", accepted: ["b"] })]), { request: "cloze" }));
    expect(Object.keys(c).sort()).toEqual(["answer", "examQuestionId", "inlineCloze", "marks", "presentationType", "questionTypeVersion", "text"]);
  });
});
