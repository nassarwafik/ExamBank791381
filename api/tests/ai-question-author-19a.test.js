import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler, MAX_REQUEST_CHARS } from "../src/functions/ai-question-author.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { gradeExam } from "../src/lib/assignment-grading.js";

// Phase 19A — POST /api/ai-question-author: a teacher's natural-language request → ONE AI-proposed draft → the deterministic
// shared normalizer → the SAME canonical validators manual authoring uses. The endpoint never publishes or mutates an exam; it
// returns a canonical question for the teacher to insert as a draft (finalization gates still apply), or a refusal with the
// canonical issues. New-function suite (fail-first on 91b1f3d8: the endpoint does not exist).
const require_ = createRequire(import.meta.url);
const { validateNetworkCliQuestion } = require_("../src/lib/shared-finalization/networkCliQuestion.js");
const { validateInlineClozeQuestion } = require_("../src/lib/shared-finalization/inlineClozeQuestion.js");
const auth = () => ({ ok: true, user: { sub: "teacher" } });
const deny = () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "unauthorized" } } });
const req = body => ({ json: async () => body });
const iface = (over = {}) => ({ name: "", mode: "", accessVlan: 0, nativeVlan: 0, adminState: "", ipAddress: "", subnetMask: "", ...over });
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null };
const base = over => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "س", marks: 4, ...NONE, ...over });
const SWITCH = base({
  intent: "networkCli", text: "أنشئ VLAN 20 باسم SALES واجعل Fa0/5 منفذ access فيها وGi0/1 trunk مع native VLAN 99.", marks: 6,
  networkCli: { scoring: "proportional", initialHostname: "Switch", initialVlans: [], initialInterfaces: [], targetHostname: "", targetVlans: [{ id: 20, name: "SALES" }, { id: 99, name: "" }], targetInterfaces: [iface({ name: "Fa0/5", mode: "access", accessVlan: 20 }), iface({ name: "Gi0/1", mode: "trunk", nativeVlan: 99 })] }
});
const CLOZE = base({
  intent: "inlineCloze", text: "أكمل الفقرة.", marks: 4,
  inlineCloze: { scoring: "allOrNothing", pieces: [
    { kind: "text", text: "بروتوكول ", accepted: [], caseSensitive: false, options: [], correctIndex: -1 },
    { kind: "textBlank", text: "", accepted: ["DHCP"], caseSensitive: false, options: [], correctIndex: -1 },
    { kind: "text", text: " يعمل في طبقة ", accepted: [], caseSensitive: false, options: [], correctIndex: -1 },
    { kind: "dropdown", text: "", accepted: [], caseSensitive: false, options: ["Application", "Transport"], correctIndex: 0 }
  ] }
});
const call = async (body, ai, deps = {}) => {
  const calls = [];
  const r = await handler(req(body), { requireBuilderAuth: auth, callTextJson: async args => { calls.push(args); if (ai instanceof Error) throw ai; return { result: typeof ai === "function" ? ai(args) : ai }; }, ...deps });
  return { r, calls };
};

describe("19A /api/ai-question-author — boundary", () => {
  it("requires the teacher session (no AI call on an anonymous request)", async () => {
    const { r, calls } = await call({ request: "x" }, SWITCH, { requireBuilderAuth: deny });
    expect(r.status).toBe(401); expect(calls).toEqual([]);
  });
  it("refuses an empty, non-string or over-long request before any AI call", async () => {
    for (const body of [{}, { request: "" }, { request: "   " }, { request: 7 }, { request: "x".repeat(MAX_REQUEST_CHARS + 1) }, null]) {
      const { r, calls } = await call(body, SWITCH);
      expect(r.status, JSON.stringify(body)).toBe(400); expect(calls).toEqual([]);
    }
  });
  it("the AI receives the strict schema and the request with advisory deterministic signals — never an exam, a key or a token", async () => {
    const { calls } = await call({ request: "أنشئ سؤال محاكي سويتش" }, SWITCH);
    expect(calls.length).toBe(1);
    expect(calls[0].schema.additionalProperties).toBe(false);
    expect(calls[0].schemaName).toBe("ai_question_draft");
    expect(calls[0].prompt).toContain("أنشئ سؤال محاكي سويتش");
    expect(calls[0].prompt).toMatch(/suggested intent: networkCli/i);
  });
});

describe("19A /api/ai-question-author — networkCli generation through the canonical authority", () => {
  it("a clear switch request returns a canonical networkCli@1 question that passes the canonical validator", async () => {
    const { r } = await call({ request: "Create a network simulator question requiring VLAN 20 and native VLAN 99" }, SWITCH);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.intent).toBe("networkCli");
    const qn = r.jsonBody.question;
    expect(qn.presentationType).toBe("networkCli"); expect(qn.questionTypeVersion).toBe(1);
    expect(validateNetworkCliQuestion(qn)).toEqual([]);
  });
  it("the generated question survives canonical grading and the student projection never carries the target", () => {
    return call({ request: "switch vlan" }, SWITCH).then(({ r }) => {
      const qn = { ...r.jsonBody.question, examQuestionId: "n1" };
      const exam = { examId: "E", title: "t", sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [qn] }] };
      expect(JSON.stringify(sanitizeExamForStudent(exam))).not.toMatch(/targetState|"nativeVlan":99|"accessVlan":20|"scoring"/);
      const res = gradeExam(exam, { n1: { kind: "networkCli", commands: [], state: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } } });
      expect(res.questions[0].score).toBe(0); expect(res.questions[0].manualReview).toBe(false);
    });
  });
  it("a router-only request is refused even if the AI invents a switch contract", async () => {
    const { r } = await call({ request: "اكتب سؤال OSPF وstatic routing على الراوتر R1" }, SWITCH);
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_NETCLI_UNSUPPORTED_CAPABILITY" });
    expect(r.jsonBody.question).toBeUndefined();
  });
  it("an invalid generated contract is refused with the canonical issues (no repair, no question)", async () => {
    const broken = { ...SWITCH, networkCli: { ...SWITCH.networkCli, targetVlans: [{ id: 4095, name: "" }] } };
    const { r } = await call({ request: "switch" }, broken);
    expect(r.jsonBody.ok).toBe(false); expect(r.jsonBody.code).toBe("AI_DRAFT_INVALID");
    expect(r.jsonBody.issues.map(i => i.code)).toContain("NETCLI_TARGET_VLAN_INVALID");
    expect(r.jsonBody.question).toBeUndefined();
  });
});

describe("19A /api/ai-question-author — inlineCloze, refusals and provider failure", () => {
  it("a mixed text / dropdown request returns canonical inlineCloze@1 passing the canonical validator", async () => {
    const { r } = await call({ request: "اجعل الفراغ الأول كتابة والثاني قائمة منسدلة" }, CLOZE);
    expect(r.jsonBody.ok).toBe(true); expect(r.jsonBody.intent).toBe("inlineCloze");
    expect(validateInlineClozeQuestion(r.jsonBody.question)).toEqual([]);
    expect(r.jsonBody.question.answer.scoring).toBe("allOrNothing");
  });
  it("malformed AI output (smuggled private field / unknown key) is refused as AI_DRAFT_MALFORMED", async () => {
    const { r } = await call({ request: "switch" }, { ...SWITCH, networkCli: { ...SWITCH.networkCli, targetState: { hostname: "X" } } });
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_DRAFT_MALFORMED" });
  });
  it("simulation / coding intents are recognised and refused with guidance; the preferred type hint is passed to the prompt", async () => {
    const { r, calls } = await call({ request: "simulate with my smartsim package", preferredType: "simulation" }, base({ intent: "simulation" }));
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_TYPE_NOT_GENERATED", intent: "simulation" });
    expect(calls[0].prompt).toMatch(/preferred type: simulation/i);
    const bad = await call({ request: "x", preferredType: "dragAndDrop" }, SWITCH);   // 19D: "hotspot" became a real (refused) visual intent
    expect(bad.r.status).toBe(400);
  });
  it("a provider failure is a 502 with a safe Arabic message — never a fabricated question", async () => {
    const { r } = await call({ request: "switch" }, new Error("OPENAI_API_KEY is not configured. sk-secret"));
    expect(r.status).toBe(502); expect(r.jsonBody.ok).toBe(false); expect(r.jsonBody.code).toBe("AI_PROVIDER_FAILED");
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/sk-secret|OPENAI_API_KEY/);
  });
});
