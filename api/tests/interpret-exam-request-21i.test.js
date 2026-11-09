import { describe, it, expect } from "vitest";
import { normalizePlan, buildSchema, buildInstructions, buildInterpretResult } from "../src/functions/interpret-exam-request.js";

// Phase 21I — the builder prompt is no longer networking-only. The analysis returns, next to the unchanged bank plan, a code-owned ROUTE
// (bank for networking; the AI Full Exam Composer for every other subject) and the composer's pre-fill.
const TOPICS = { topics: [{ code: "IP_ADDRESSING", name: "IPv4 Addressing", parent: null }, { code: "DHCP", name: "DHCP", parent: "NETWORK_SERVICES" }] };
const raw = (subject, over = {}) => ({
  title: "", totalQuestions: 10, requestedQuestionCount: 10, totalMarks: 100,
  sectionTargets: { BASIC: 6, INFRASTRUCTURE: 4 }, difficultyTargets: { "1": 2, "2": 3, "3": 3, "4": 2, "5": 0 },
  topicTargets: [{ topic: "DHCP", count: 3 }], excludedTopics: ["IP_ADDRESSING"],
  typeTargets: { multipleChoice: 0, fillBlank: 0, wordBank: 0, open: 0 }, minimums: { images: 0, cli: 0, calculations: 0 },
  rules: { excludeNeedsReview: true, avoidSameFamily: true, preferOfficialSources: true, avoidPreviouslyUsed: false, recentExamCount: 0 },
  explanation: "", subject, ...over
});
const subject = (domain, over = {}) => ({ domain, label: "", language: "ar", sourcePreference: "unspecified", questionCountExplicit: true, durationMinutes: 0, course: "", grade: "", topics: [], ...over });

describe("21I normalizePlan default title names the request's subject (fail-first: it was «امتحان شبكات» for every request)", () => {
  it("a physics request without a title is not called a networking exam", () => {
    const plan = normalizePlan(raw(subject("physics", { label: "فيزياء" })), "أريد امتحان فيزياء عن السقوط الحر والتسارع");
    expect(plan.title).not.toBe("امتحان شبكات");
    expect(plan.title).toBe("امتحان فيزياء");
  });
  it("a programming request with no AI subject at all is titled from the request's own words", () => {
    expect(normalizePlan({ totalQuestions: 5 }, "Create a Python programming exam about loops and arrays").title).toBe("امتحان البرمجة");
  });
  it("a networking request keeps its networking title; an explicit AI title always wins", () => {
    expect(normalizePlan({ totalQuestions: 5 }, "امتحان شبكات عن VLAN وOSPF وDHCP").title).toBe("امتحان شبكات الاتصال");
    expect(normalizePlan({ totalQuestions: 5, title: "امتحان الفصل الأول" }, "فيزياء").title).toBe("امتحان الفصل الأول");
  });
});

describe("21I buildInterpretResult — route + composer pre-fill", () => {
  it("networking: bank route, plan unchanged (topic targets kept), composer offered as an alternative", () => {
    const r = buildInterpretResult(raw(subject("networking")), "امتحان شبكات من 10 أسئلة عن DHCP وIPv4 وVLAN", TOPICS, "openai", "m");
    expect(r.ok).toBe(true);
    expect(r.route).toMatchObject({ v: 1, route: "bank", domain: "networking", allowedRoutes: ["bank", "composer"] });
    expect(r.plan.topicTargets).toEqual([{ topic: "DHCP", count: 3 }]);
    expect(r.plan.excludedTopics).toEqual(["IP_ADDRESSING"]);
    expect(r.plan.subjectDomain).toBe("networking");
    expect(r.topics).toBe(TOPICS.topics);
    expect(r.composerPrefill).toMatchObject({ v: 1, subject: "شبكات الاتصال" });
  });
  it("physics: composer route, networking topic codes the model guessed are dropped, the pre-fill carries the request", () => {
    const prompt = "أريد امتحان فيزياء من 10 أسئلة عن السقوط الحر والمقذوفات، مدته 45 دقيقة";
    const r = buildInterpretResult(raw(subject("physics", { label: "فيزياء — الحركة", durationMinutes: 45, grade: "11", topics: ["السقوط الحر"] })), prompt, TOPICS, "glm", "m");
    expect(r.route).toMatchObject({ route: "composer", domain: "physics", allowedRoutes: ["composer"], needsConfirmation: false });
    expect(r.plan.topicTargets).toEqual([]);
    expect(r.plan.excludedTopics).toEqual([]);
    expect(r.composerPrefill).toMatchObject({ subject: "فيزياء — الحركة", grade: "11", durationMinutes: 45, questionTarget: 10, totalMarks: 100, instruction: prompt, requiredTopics: ["السقوط الحر"] });
    expect(r.composerPrefill.capabilities).toMatchObject({ smartSim: true, coding: false });
  });
  it("the networking-heavy analysis prompt misleading the model is caught: a physics request is never sent to the networking bank", () => {
    const r = buildInterpretResult(raw(subject("networking")), "امتحان فيزياء عن البندول والنابض والتسارع", TOPICS, "qwen", "m");
    expect(r.route).toMatchObject({ route: "composer", domain: "physics", needsConfirmation: true });
    expect(r.plan.topicTargets).toEqual([]);
  });
  it("a non-strict provider that omitted `subject` still routes (deterministic fallback)", () => {
    const { subject: _omit, ...noSubject } = raw(subject("x"));
    const r = buildInterpretResult(noSubject, "Create a Java programming exam with 3 coding questions about arrays and loops", TOPICS, "glm", "m");
    expect(r.route).toMatchObject({ route: "composer", domain: "programming", language: "en" });
    expect(r.composerPrefill.capabilities.coding).toBe(true);
    expect(r.composerPrefill.questionTarget).toBeNull();            // the count was not declared explicit by the model
  });
});

describe("21I provider schema and instructions", () => {
  it("the strict schema requires `subject` with closed enums, and every object lists all its properties as required (strict mode)", () => {
    const schema = buildSchema(["DHCP"]);
    expect(schema.required).toContain("subject");
    const s = schema.properties.subject;
    expect(s.properties.domain.enum).toEqual(["networking", "programming", "physics", "chemistry", "mathematics", "mixed", "other"]);
    expect(s.properties.language.enum).toEqual(["ar", "en", "he"]);
    expect(s.properties.sourcePreference.enum).toEqual(["bank", "newQuestions", "unspecified"]);
    const walk = node => {
      if (node && node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
        Object.values(node.properties).forEach(walk);
      }
      if (node && node.type === "array") walk(node.items);
    };
    walk(schema);
  });
  it("the instructions describe a multi-subject platform and restrict the bank rules to networking", () => {
    const text = buildInstructions(TOPICS);
    expect(text).toContain("subject.domain");
    expect(text).toContain("البرمجة");
    expect(text).toContain("لا تصنّف الطلب networking إلا إذا كان عن شبكات الاتصال صراحة");
    expect(text).toContain("مخزن الأسئلة المصنف يغطي شبكات الاتصال (791381) فقط");
  });
});
