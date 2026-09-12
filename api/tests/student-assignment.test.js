import { describe, it, expect } from "vitest";
import { studentExam } from "../src/functions/student-assignment.js";

describe("studentExam - the new theme field survives while the correct answer is still blanked", () => {
  it("preserves presentationTheme at the top level", () => {
    const snapshot = { presentationTheme: "compact", questions: [] };
    expect(studentExam(snapshot).presentationTheme).toBe("compact");
  });

  it("still blanks answer/hint/teacherNote/aiInstruction/history/redoStack per question, unaffected by the new field", () => {
    const snapshot = {
      presentationTheme: "compact",
      questions: [{
        examQuestionId: "q1",
        text: "نص",
        answer: { correctOptionIndex: 1 },
        hint: "تلميح",
        teacherNote: "ملاحظة",
        aiInstruction: "تعليمة",
        history: ["x"],
        redoStack: ["y"]
      }]
    };
    const result = studentExam(snapshot);
    expect(result.presentationTheme).toBe("compact");
    expect(result.questions[0]).toMatchObject({
      answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: []
    });
    expect(result.questions[0].text).toBe("نص");
  });

  it("leaves presentationTheme undefined for a legacy exam snapshot with no theme - no crash", () => {
    const snapshot = { questions: [] };
    expect(() => studentExam(snapshot)).not.toThrow();
    expect(studentExam(snapshot).presentationTheme).toBeUndefined();
  });
});

// ── SECURITY: structured-exam sanitization ────────────────────────────────
// A structured exam carries answer keys in more places than a legacy flat exam:
// section questions' answer, generalized field.correct, compound part.answer, and
// part.fields[].correct. studentExam() must strip ALL of them while keeping every
// piece of data the student needs to render and answer the exam.
describe("studentExam - structured exam is fully answer-key-safe", () => {
  const structured = {
    presentationTheme: "compact",
    sections: [
      {
        id: "core",
        title: "القسم الأول",
        instructions: "أجب عن كل الأسئلة",
        gradingPolicy: "capScore",
        maxMarks: 60,
        stimuli: { g1: { title: "طوبولوجيا", text: "شبكة مكوّنة من ثلاثة موجّهات", image: { dataUrl: "data:image/png;base64,AAA" } } },
        questions: [
          {
            examQuestionId: "core-q1",
            groupId: "g1",
            displayNumber: "1",
            text: "سؤال اختيار",
            presentationType: "multipleChoice",
            marks: 3,
            options: [{ text: "أ", isCorrect: true }, { text: "ب" }],
            answer: { correctOptionIndex: 0, correctText: "SECRET_TOP_LEVEL_ANSWER" }
          },
          {
            examQuestionId: "core-q2",
            text: "أكمل الجدول",
            presentationType: "tableFill",
            marks: 2,
            tableHeaders: ["العنوان", "جزء الشبكة"],
            tableRows: [["192.168.1.10/24", ""]],
            fields: [{ id: "f1", label: "الشبكة", row: 0, column: 1, kind: "text", correct: "SECRET_FIELD_CORRECT" }]
          }
        ]
      },
      {
        id: "specialization",
        title: "القسم الثاني",
        gradingPolicy: "firstNAnswered",
        answerUnit: "part",
        requiredAnswers: 1,
        maxMarks: 40,
        questions: [
          {
            examQuestionId: "spec-q1",
            text: "سؤال مركّب",
            marks: 10,
            parts: [
              {
                id: "a",
                type: "shortAnswer",
                text: "اشرح",
                marks: 5,
                answer: { text: "SECRET_PART_ANSWER" }
              },
              {
                id: "b",
                type: "cliFill",
                text: "أكمل الأمر",
                marks: 5,
                cli: "R1(config)# encapsulation dot1Q [[b1]]",
                fields: [{ id: "b1", label: "vlan", correct: "SECRET_PART_FIELD_CORRECT" }]
              }
            ]
          }
        ]
      }
    ]
  };

  it("removes EVERY answer-key sentinel from the sanitized payload", () => {
    const json = JSON.stringify(studentExam(structured));
    for (const secret of ["SECRET_TOP_LEVEL_ANSWER", "SECRET_FIELD_CORRECT", "SECRET_PART_ANSWER", "SECRET_PART_FIELD_CORRECT"]) {
      expect(json).not.toContain(secret);
    }
    // and the option isCorrect flag must be gone
    expect(json).not.toContain("isCorrect");
  });

  it("blanks question.answer and drops field.correct / part.answer / part.fields[].correct", () => {
    const out = studentExam(structured);
    expect(out.sections[0].questions[0].answer).toEqual({});
    expect("correct" in out.sections[0].questions[1].fields[0]).toBe(false);
    expect("answer" in out.sections[1].questions[0].parts[0]).toBe(false);
    expect("correct" in out.sections[1].questions[0].parts[1].fields[0]).toBe(false);
    expect("isCorrect" in out.sections[0].questions[0].options[0]).toBe(false);
  });

  it("KEEPS all student-visible data needed to render and answer the exam", () => {
    const out = studentExam(structured);
    // sections + rules
    expect(out.sections).toHaveLength(2);
    expect(out.sections[0].title).toBe("القسم الأول");
    expect(out.sections[0].instructions).toBe("أجب عن كل الأسئلة");
    expect(out.sections[0].gradingPolicy).toBe("capScore");
    expect(out.sections[0].maxMarks).toBe(60);
    expect(out.sections[1].requiredAnswers).toBe(1);
    // stimuli (shared material) + image metadata
    expect(out.sections[0].stimuli.g1.title).toBe("طوبولوجيا");
    expect(out.sections[0].stimuli.g1.image.dataUrl).toContain("data:image/png");
    // question text + options text + groupId + displayNumber
    const q1 = out.sections[0].questions[0];
    expect(q1.text).toBe("سؤال اختيار");
    expect(q1.options.map(o => o.text)).toEqual(["أ", "ب"]);
    expect(q1.groupId).toBe("g1");
    expect(q1.displayNumber).toBe("1");
    // table data + field labels
    const q2 = out.sections[0].questions[1];
    expect(q2.tableHeaders).toEqual(["العنوان", "جزء الشبكة"]);
    expect(q2.tableRows).toEqual([["192.168.1.10/24", ""]]);
    expect(q2.fields[0].label).toBe("الشبكة");
    expect(q2.fields[0].kind).toBe("text");
    // compound parts + CLI template
    const parts = out.sections[1].questions[0].parts;
    expect(parts.map(p => p.id)).toEqual(["a", "b"]);
    expect(parts[0].text).toBe("اشرح");
    expect(parts[1].cli).toBe("R1(config)# encapsulation dot1Q [[b1]]");
    expect(parts[1].fields[0].label).toBe("vlan");
  });

  it("does not mutate the caller's snapshot", () => {
    const snap = JSON.parse(JSON.stringify(structured));
    studentExam(snap);
    expect(snap.sections[0].questions[0].answer.correctText).toBe("SECRET_TOP_LEVEL_ANSWER");
  });
});

describe("studentExam - legacy top-level question.answer never reaches the student", () => {
  it("blanks a legacy flat question's answer key", () => {
    const legacy = { questions: [{ examQuestionId: "q1", text: "س", marks: 5, answer: { text: "SECRET_LEGACY_ANSWER" } }] };
    const json = JSON.stringify(studentExam(legacy));
    expect(json).not.toContain("SECRET_LEGACY_ANSWER");
    expect(studentExam(legacy).questions[0].answer).toEqual({});
  });
});

describe("studentExam - optional cover page reaches students safely (Q)", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAA";
  it("keeps a safe cover (banner/instructions/flags) while still stripping answer keys", () => {
    const snapshot = {
      coverPage: { enabled: true, activityType: "exam", banner: { dataUrl: PNG }, instructions: "أجب عن جميع الأسئلة.", allowedMaterials: "آلة حاسبة", showStudentName: true },
      sections: [{ id: "s", gradingPolicy: "all", questions: [
        { examQuestionId: "q1", presentationType: "multipleChoice", text: "?", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } },
        { examQuestionId: "wb", presentationType: "wordBank", text: "?", marks: 2, wordBank: ["A"], fields: [{ id: "f1", correct: "A" }] }
      ] }]
    };
    const out = studentExam(snapshot);
    // cover survives
    expect(out.coverPage.enabled).toBe(true);
    expect(out.coverPage.banner.dataUrl).toBe(PNG);
    expect(out.coverPage.instructions).toBe("أجب عن جميع الأسئلة.");
    // answers still stripped
    const json = JSON.stringify(out);
    expect(json).not.toContain("correctOptionIndex");
    expect(out.sections[0].questions[0].answer).toEqual({});
    expect(out.sections[0].questions[1].fields[0].correct).toBeUndefined();
  });

  it("drops an unsafe/external banner and any teacher-only cover key", () => {
    const out = studentExam({ coverPage: { enabled: true, banner: { dataUrl: "https://tracker.example/a.png" }, teacherSecret: "NOPE" }, sections: [] });
    expect(out.coverPage.banner).toBeUndefined();
    expect(out.coverPage.teacherSecret).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("tracker.example");
  });

  it("no coverPage → student payload has no coverPage (unchanged)", () => {
    const out = studentExam({ sections: [{ id: "s", gradingPolicy: "all", questions: [] }] });
    expect("coverPage" in out).toBe(false);
  });

  it("still strips teacher-only metadata.import alongside a cover", () => {
    const out = studentExam({ coverPage: { enabled: true }, metadata: { import: { originalExamId: "X" }, school: "المدرسة" }, sections: [] });
    expect(out.metadata.import).toBeUndefined();
    expect(out.metadata.school).toBe("المدرسة");
  });
});
