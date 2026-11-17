import { describe, it, expect } from "vitest";
import { questionRiskFor, questionDisplayText, studentToolAnswerRisks } from "./studentToolsRisk";
import type { StudentToolsSpecV1 } from "./studentToolsSpec";

const q = (text: string, extra: Record<string, unknown> = {}) => ({ examQuestionId: "q-" + text.length, type: "shortAnswer", text, ...extra });

describe("T3 — answer-risk heuristics", () => {
  it.each([
    "ما عنوان الشبكة للعنوان 192.168.1.10/26؟", "احسب عنوان البث", "ما قناع الشبكة المناسب؟", "قسّم الشبكة إلى 4 شبكات فرعية",
    "كم عدد الأجهزة في الشبكة؟", "Find the broadcast address", "10.0.0.1"
  ])("IPv4 calculator: %s", t => expect(questionRiskFor("ipv4Calculator", q(t))).toBe(true));
  it.each(["عرّف بروتوكول TCP", "ما وظيفة الموجّه؟", "اكتب 3.14", "الإصدار 1.2.3"])("not IPv4: %s", t => expect(questionRiskFor("ipv4Calculator", q(t))).toBe(false));

  it.each([
    "حوّل العدد 45 إلى النظام الثنائي", "اكتب العدد بالنظام الست عشري", "ما قيمة (1011)₂ بالنظام العشري؟", "Convert 0x2F to decimal",
    "ما الرقم الثماني المقابل؟", "binary representation"
  ])("base converter: %s", t => expect(questionRiskFor("baseConverter", q(t))).toBe(true));
  it.each(["احسب 45 + 12", "ما عنوان الشبكة؟", "عرّف نظام التشغيل"])("not a conversion: %s", t => expect(questionRiskFor("baseConverter", q(t))).toBe(false));

  it("plotter: graph-reading question types only; calculator: never named", () => {
    expect(questionRiskFor("graphPlotter", q("اختر النقطة", { type: "functionGraphSelection" }))).toBe(true);
    expect(questionRiskFor("graphPlotter", q("ارسم الدالة"))).toBe(false);
    expect(questionRiskFor("calculator", q("احسب 2 + 2"))).toBe(false);
  });

  it("reads parts, options and rich content; never answers, hints or teacher notes", () => {
    expect(questionRiskFor("baseConverter", q("السؤال", { parts: [{ text: "حوّل إلى الثنائي" }] }))).toBe(true);
    expect(questionRiskFor("baseConverter", q("اختر", { options: [{ text: "0x1F" }] }))).toBe(true);
    expect(questionRiskFor("baseConverter", q("السؤال", { stemRichContent: { blocks: [{ type: "paragraph", text: "النظام الثنائي" }] } }))).toBe(true);
    const secret = q("ما الناتج؟", { answer: { text: "النظام الثنائي 192.168.1.0" }, hint: "الثنائي", teacherNote: "subnet" });
    expect(questionRiskFor("baseConverter", secret)).toBe(false);
    expect(questionRiskFor("ipv4Calculator", secret)).toBe(false);
    expect(questionDisplayText(secret)).toBe("ما الناتج؟");
  });

  it("is bounded on deep or huge input", () => {
    let deep: Record<string, unknown> = { text: "الثنائي" };
    for (let i = 0; i < 50; i++) deep = { parts: [deep] };
    expect(questionRiskFor("baseConverter", deep)).toBe(false);
    expect(() => questionDisplayText({ parts: Array.from({ length: 5000 }, () => ({ text: "x" })) })).not.toThrow();
  });
});

describe("T3 — risks per exam follow the section overrides", () => {
  const exam = { sections: [
    { id: "s1", title: "الأنظمة", questions: [q("حوّل 13 إلى الثنائي"), q("عرّف البت")] },
    { id: "s2", title: "الشبكات", questions: [q("ما عنوان البث للشبكة 10.0.0.0/8؟"), q("حوّل FF من الست عشري")] }
  ] };
  const spec: StudentToolsSpecV1 = { version: 1, tools: [
    { id: "calculator", variant: "basic", angleUnit: "deg" },
    { id: "baseConverter", bases: [2, 10, 16], showSteps: false },
    { id: "ipv4Calculator", showBinary: false, allowSubnetting: false }
  ] };
  it("names each hit with its section and position, per tool, calculator omitted", () => {
    expect(studentToolAnswerRisks(exam, spec)).toEqual([
      { tool: "baseConverter", hits: [{ sectionId: "s1", questionId: exam.sections[0].questions[0].examQuestionId, label: "الأنظمة · السؤال 1" }, { sectionId: "s2", questionId: exam.sections[1].questions[1].examQuestionId, label: "الشبكات · السؤال 2" }] },
      { tool: "ipv4Calculator", hits: [{ sectionId: "s2", questionId: exam.sections[1].questions[0].examQuestionId, label: "الشبكات · السؤال 1" }] }
    ]);
  });
  it("a section where the tool is off is not reported", () => {
    const r = studentToolAnswerRisks(exam, { ...spec, sectionOverrides: { s2: { disabled: ["baseConverter", "ipv4Calculator"] } } });
    expect(r).toEqual([{ tool: "baseConverter", hits: [{ sectionId: "s1", questionId: exam.sections[0].questions[0].examQuestionId, label: "الأنظمة · السؤال 1" }] }]);
  });
  it("no spec, no risks", () => expect(studentToolAnswerRisks(exam, undefined)).toEqual([]));
});
