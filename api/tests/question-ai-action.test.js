import { describe, it, expect } from "vitest";
import { convertResult, buildPrompt, buildSchema } from "../src/functions/question-ai-action.js";
import { gradeExam } from "../src/lib/assignment-grading.js";

function baseQuestion(overrides = {}) {
  return {
    examQuestionId: "q1",
    origin: "bank",
    section: "BASIC",
    topic: "OSPF",
    difficulty: 2,
    presentationType: "open",
    marks: 5,
    text: "نص أصلي",
    options: [],
    fields: [],
    answer: {},
    wordBank: [],
    image: { exists: false, visible: false, origin: null, assets: [], prompt: null },
    history: [],
    redoStack: [],
    ...overrides
  };
}

describe("buildSchema - matching/ordering are now valid presentationType values", () => {
  it("includes matching and ordering in the enum", () => {
    const schema = buildSchema();
    expect(schema.properties.presentationType.enum).toEqual(
      expect.arrayContaining(["matching", "ordering"])
    );
  });
});

describe("buildPrompt - instructs the AI on matching/ordering specifically", () => {
  it("describes a shared options pool for matching", () => {
    const prompt = buildPrompt("modify", baseQuestion({ presentationType: "matching" }), "حوّل");
    expect(prompt).toMatch(/matching/i);
    expect(prompt).toMatch(/SAME pool for every field/i);
  });

  it("describes 1-based position answers for ordering", () => {
    const prompt = buildPrompt("modify", baseQuestion({ presentationType: "ordering" }), "حوّل");
    expect(prompt).toMatch(/ordering/i);
    expect(prompt).toMatch(/1-based position/i);
  });
});

// This is the regression proof for the pre-existing bug fix: fillBlank/wordBank questions created
// via convertQuestionType()/"بناء سؤال خارجي" used to build answer={answers:[...]}, a key
// assignment-grading.js's gradeSequence() never reads (it only reads answer.values) - meaning
// every such question graded as 0 regardless of the student's actual answer, silently.
describe("convertResult - fixes the pre-existing fillBlank/wordBank answer-shape bug", () => {
  it("builds {mode:'exactSequence', values} - not the old {answers:[...]} - for wordBank", () => {
    const result = {
      presentationType: "wordBank",
      text: "أكمل الفراغات",
      options: [],
      fields: ["بروتوكول التوجيه"],
      fieldAnswers: ["OSPF"],
      wordBank: ["OSPF", "RIP", "BGP"],
      answerText: "",
      correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "wordBank" }), "modify");
    expect(question.answer).toEqual({ mode: "exactSequence", values: ["OSPF"] });
    expect(question.answer).not.toHaveProperty("answers");
  });

  it("the fixed shape actually grades correctly via the real grading function (proof, not just shape)", () => {
    const result = {
      presentationType: "wordBank", text: "أكمل الفراغات", options: [],
      fields: ["بروتوكول التوجيه"], fieldAnswers: ["OSPF"], wordBank: ["OSPF", "RIP"],
      answerText: "", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "wordBank" }), "modify");
    const exam = { questions: [{ examQuestionId: "q1", marks: 5, answer: question.answer }] };
    const graded = gradeExam(exam, { q1: { kind: "sequence", values: ["OSPF"] } });
    expect(graded.questions[0].score).toBe(5);
    expect(graded.questions[0].correct).toBe(true);
  });

  it("same fix applies to fillBlank", () => {
    const result = {
      presentationType: "fillBlank", text: "أكمل", options: [],
      fields: ["الفراغ الأول"], fieldAnswers: ["255.255.255.0"], wordBank: [],
      answerText: "", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "fillBlank" }), "modify");
    expect(question.answer).toEqual({ mode: "exactSequence", values: ["255.255.255.0"] });
  });
});

describe("convertResult - matching (طابق)", () => {
  it("builds one field per left-hand term, all sharing the same options pool", () => {
    const result = {
      presentationType: "matching", text: "طابق كل بروتوكول بالطبقة الصحيحة",
      options: [], fields: ["HTTP", "IP"], fieldAnswers: ["طبقة التطبيقات", "طبقة الشبكة"],
      wordBank: ["طبقة التطبيقات", "طبقة الشبكة"], answerText: "", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "matching" }), "modify");

    expect(question.fields.map(f => f.label)).toEqual(["HTTP", "IP"]);
    expect(question.fields[0].options.map(o => o.text)).toEqual(["طبقة التطبيقات", "طبقة الشبكة"]);
    expect(question.fields[1].options.map(o => o.text)).toEqual(question.fields[0].options.map(o => o.text));
    expect(question.answer).toEqual({ mode: "exactSequence", values: ["طبقة التطبيقات", "طبقة الشبكة"] });

    const exam = { questions: [{ examQuestionId: "q1", marks: 4, answer: question.answer }] };
    const graded = gradeExam(exam, { q1: { kind: "sequence", values: ["طبقة التطبيقات", "طبقة الشبكة"] } });
    expect(graded.questions[0].score).toBe(4);
  });

  it("'بناء سؤال خارجي' (action: external) works identically since it reuses the same convertResult path", () => {
    const result = {
      presentationType: "matching", text: "طابق البروتوكولات بمنافذها",
      options: [], fields: ["HTTP", "DNS"], fieldAnswers: ["80", "53"],
      wordBank: ["80", "53"], answerText: "", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "matching" }), "external");
    expect(question.origin).toBe("ai-generated");
    expect(question.presentationType).toBe("matching");
    expect(question.answer).toEqual({ mode: "exactSequence", values: ["80", "53"] });
  });
});

describe("convertResult - ordering (رتّب)", () => {
  it("builds one field per item and a deterministic 1..N word bank regardless of what the AI returned", () => {
    const result = {
      presentationType: "ordering", text: "رتّب خطوات عملية DHCP",
      options: [], fields: ["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP Ack"],
      fieldAnswers: ["1", "2", "3", "4"], wordBank: ["should", "be", "ignored"],
      answerText: "", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "ordering" }), "modify");

    expect(question.fields.map(f => f.label)).toEqual(["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP Ack"]);
    expect(question.fields.every(f => f.options.length === 0)).toBe(true);
    expect(question.wordBank).toEqual(["1", "2", "3", "4"]);
    expect(question.answer).toEqual({ mode: "exactSequence", values: ["1", "2", "3", "4"] });

    const exam = { questions: [{ examQuestionId: "q1", marks: 4, answer: question.answer }] };
    const graded = gradeExam(exam, { q1: { kind: "sequence", values: ["1", "2", "3", "4"] } });
    expect(graded.questions[0].score).toBe(4);
  });
});

describe("convertResult - unaffected existing types (regression)", () => {
  it("multipleChoice still builds correctOptionIndex/correctAnswer exactly as before", () => {
    const result = {
      presentationType: "multipleChoice", text: "أي بروتوكول؟", options: ["TCP", "UDP"],
      fields: [], fieldAnswers: [], wordBank: [], answerText: "", correctOptionIndex: 1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "multipleChoice" }), "modify");
    expect(question.answer).toEqual({ correctOptionIndex: 1, correctAnswer: "UDP" });
  });

  it("open still builds a plain answerText answer", () => {
    const result = {
      presentationType: "open", text: "اشرح", options: [], fields: [], fieldAnswers: [],
      wordBank: [], answerText: "الشرح الصحيح", correctOptionIndex: -1
    };
    const question = convertResult(result, baseQuestion({ presentationType: "open" }), "modify");
    expect(question.answer).toEqual({ text: "الشرح الصحيح" });
  });

  it("falls back to the original presentationType when the AI returns an invalid one", () => {
    const result = { presentationType: "not-a-real-type", text: "س", options: [], fields: [], fieldAnswers: [], wordBank: [], answerText: "", correctOptionIndex: -1 };
    const question = convertResult(result, baseQuestion({ presentationType: "open" }), "modify");
    expect(question.presentationType).toBe("open");
  });
});
