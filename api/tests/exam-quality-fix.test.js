import { describe, it, expect } from "vitest";
import { buildQualityFixPatch, buildPrompt, buildSchema } from "../src/functions/exam-quality-fix.js";
import { gradeExam } from "../src/lib/assignment-grading.js";

describe("buildSchema - the AI response shape can never include fields it should never change", () => {
  it("has no topic/difficulty/section/marks/origin/images property anywhere in the schema", () => {
    const schema = buildSchema();
    const keys = Object.keys(schema.properties);
    expect(keys).not.toEqual(expect.arrayContaining(["topic", "difficulty", "section", "marks", "origin", "images", "examQuestionId"]));
  });

  it("forbids any property outside the explicit list via additionalProperties:false", () => {
    expect(buildSchema().additionalProperties).toBe(false);
  });
});

describe("buildPrompt - instructs the AI on what it must not do", () => {
  it("forbids replacing the question and forbids changing difficulty/section/topic/marks", () => {
    const prompt = buildPrompt({ text: "س", presentationType: "open" }, ["MISSING_ANSWER"]);
    expect(prompt).toMatch(/must not replace this question/i);
    expect(prompt).toMatch(/difficulty, section, topic, or marks/i);
  });

  it("includes the detected issue codes verbatim", () => {
    const prompt = buildPrompt({ text: "س", presentationType: "open" }, ["MISSING_FIELDS", "TABLE_MISSING_OPTIONS"]);
    expect(prompt).toContain("MISSING_FIELDS, TABLE_MISSING_OPTIONS");
  });

  it("gives table-specific instructions with the actual row labels when the question has a table", () => {
    const text = "صنّف صلاحية العناوين:\n| العنوان | الحالة |\n| --- | --- |\n| 192.168.1.10 | |\n| 127.0.0.1 | |";
    const prompt = buildPrompt({ text, presentationType: "open" }, ["TABLE_MISSING_OPTIONS"]);
    expect(prompt).toContain("2 data row(s)");
    expect(prompt).toContain("192.168.1.10, 127.0.0.1");
  });
});

describe("buildQualityFixPatch - multipleChoice", () => {
  it("builds options and a correctOptionIndex/correctAnswer pair", () => {
    const patch = buildQualityFixPatch(
      { presentationType: "multipleChoice", options: ["TCP", "UDP", "IP", "ARP"], correctOptionIndex: 1, fields: [], fieldAnswers: [], wordBank: [], text: "أي بروتوكول لا يضمن التسليم؟" },
      { presentationType: "multipleChoice", text: "أي بروتوكول لا يضمن التسليم؟", answer: {} }
    );
    expect(patch.options.map(o => o.text)).toEqual(["TCP", "UDP", "IP", "ARP"]);
    expect(patch.answer).toEqual({ correctOptionIndex: 1, correctAnswer: "UDP" });
  });

  it("only ever returns the patchable fields - never topic/difficulty/section/marks/origin, since it never reads them from the AI result", () => {
    const patch = buildQualityFixPatch(
      { presentationType: "multipleChoice", options: ["A", "B"], correctOptionIndex: 0, fields: [], fieldAnswers: [], wordBank: [], text: "س" },
      { presentationType: "multipleChoice", text: "س", answer: {} }
    );
    expect(Object.keys(patch).sort()).toEqual(["answer", "fields", "options", "presentationType", "text", "wordBank"].sort());
  });
});

describe("buildQualityFixPatch - table questions (the most important scenario)", () => {
  const question = {
    presentationType: "open",
    text: "صنّف صلاحية العناوين التالية:\n| العنوان | الحالة |\n| --- | --- |\n| 192.168.1.10 | |\n| 169.254.10.20 | |",
    answer: {}
  };

  it("builds one field per row with inferred options, and an answer.text pairMap gradeTable already understands", () => {
    const aiResult = {
      presentationType: "open",
      text: question.text,
      options: [],
      fields: [
        { label: "192.168.1.10", options: ["صالح", "غير صالح"], isBoolean: false },
        { label: "169.254.10.20", options: ["صالح", "غير صالح"], isBoolean: false }
      ],
      fieldAnswers: ["صالح", "غير صالح"],
      wordBank: []
    };

    const patch = buildQualityFixPatch(aiResult, question);

    expect(patch.fields).toHaveLength(2);
    expect(patch.fields[0].options.map(o => o.value)).toEqual(["صالح", "غير صالح"]);
    expect(patch.fields[0].kind).toBe("select");
    expect(patch.answer.text).toBe("192.168.1.10=صالح;169.254.10.20=غير صالح");

    // Cross-check against the REAL grading function - proves the patch this endpoint produces is
    // actually gradeable by assignment-grading.js with zero grading-code changes.
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text: patch.text, answer: patch.answer }] };
    const correct = gradeExam(exam, { q1: { kind: "table", values: ["صالح", "غير صالح"] } });
    expect(correct.questions[0].score).toBe(4);
    expect(correct.questions[0].correct).toBe(true);

    const wrong = gradeExam(exam, { q1: { kind: "table", values: ["غير صالح", "غير صالح"] } });
    expect(wrong.questions[0].score).toBe(2);
  });

  it("marks a genuinely boolean row with kind:boolean, empty options, and a true/false (not Arabic) fieldAnswer that the student's select actually submits", () => {
    const boolQuestion = { presentationType: "open", text: "حدد صحة كل عبارة:\n| العبارة | الحكم |\n| --- | --- |\n| DHCP يعمل على منفذ 67 | |", answer: {} };
    const aiResult = {
      presentationType: "open", text: boolQuestion.text, options: [],
      fields: [{ label: "DHCP يعمل على منفذ 67", options: ["صحيح", "غير صحيح"], isBoolean: true }],
      fieldAnswers: ["true"], wordBank: []
    };

    const patch = buildQualityFixPatch(aiResult, boolQuestion);

    expect(patch.fields[0]).toMatchObject({ kind: "boolean", options: [] });
    expect(patch.answer.text).toBe("DHCP يعمل على منفذ 67=true");

    const exam = { questions: [{ examQuestionId: "q1", marks: 2, text: patch.text, answer: patch.answer }] };
    const graded = gradeExam(exam, { q1: { kind: "table", values: ["true"] } });
    expect(graded.questions[0].score).toBe(2);
  });
});

describe("buildQualityFixPatch - fillBlank/wordBank (non-table) uses the existing exactSequence answer shape", () => {
  it("returns {mode:'exactSequence', values} - the shape assignment-grading.js's gradeSequence actually reads", () => {
    const patch = buildQualityFixPatch(
      { presentationType: "wordBank", text: "أكمل:", options: [], fields: [{ label: "بروتوكول التوجيه", options: ["OSPF", "RIP"], isBoolean: false }], fieldAnswers: ["OSPF"], wordBank: ["OSPF", "RIP"] },
      { presentationType: "wordBank", text: "أكمل:", answer: {} }
    );
    expect(patch.answer).toEqual({ mode: "exactSequence", values: ["OSPF"] });

    const exam = { questions: [{ examQuestionId: "q1", marks: 3, answer: patch.answer }] };
    const graded = gradeExam(exam, { q1: { kind: "sequence", values: ["OSPF"] } });
    expect(graded.questions[0].score).toBe(3);
  });
});

describe("buildQualityFixPatch - falls back to the original presentationType when the AI returns an invalid one", () => {
  it("ignores a garbage presentationType instead of trusting it", () => {
    const patch = buildQualityFixPatch(
      { presentationType: "not-a-real-type", text: "س", options: [], fields: [], fieldAnswers: [], wordBank: [] },
      { presentationType: "open", text: "س", answer: {} }
    );
    expect(patch.presentationType).toBe("open");
  });
});
