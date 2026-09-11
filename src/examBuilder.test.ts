import { describe, it, expect } from "vitest";
import { gradeExam } from "../api/src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { isStructuredExam, examHasQuestions, examQuestionCount } from "./examTypes";
import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import {
  newSection,
  newQuestion,
  newPart,
  newField,
  addSection,
  deleteSection,
  updateSection,
  moveSection,
  duplicateQuestion,
  moveQuestion,
  moveQuestionToSection,
  changeQuestionType,
  toggleTableCell,
  addTableColumn,
  cliPlaceholders,
  applyPreset,
  legacyToStructured,
  toSavedStructuredExam,
  computeTotalMarks,
  countQuestions,
  ordinalLabel,
  moveMcqOption,
  deleteMcqOption,
  buildMatchingPatch,
  updateQuestion,
  changeSectionPolicy
} from "./examBuilderState";
import { validateStructuredExam, hasBlockingErrors } from "./examQuality";

function exam(sections: BuilderSection[], over: Partial<StructuredExam> = {}): StructuredExam {
  return { examId: "EXAM-TEST", title: "امتحان اختبار", sections, ...over };
}

// TEST 1 — a legacy flat exam stays legacy (isStructuredExam false); its editor is untouched.
describe("TEST 1: legacy exam stays legacy", () => {
  it("isStructuredExam is false for a flat questions[] exam", () => {
    expect(isStructuredExam({ examId: "x", questions: [{ examQuestionId: "q1" }] })).toBe(false);
    expect(isStructuredExam({ examId: "x", sections: [] })).toBe(true);
  });
});

// TEST 2 — non-destructive legacy → structured conversion preserves everything.
describe("TEST 2: legacyToStructured preserves questions/ids/answers/marks/images", () => {
  it("wraps legacy questions in one section without losing data", () => {
    const legacy = {
      examId: "EXAM-1",
      title: "قديم",
      presentationTheme: "compact",
      metadata: { school: "مدرسة" },
      questions: [
        { examQuestionId: "q1", text: "س1", marks: 3, presentationType: "multipleChoice", options: [{ text: "أ" }], answer: { correctOptionIndex: 0 }, image: { exists: true, assets: [{ dataUrl: "data:img" }] } }
      ]
    };
    const out = legacyToStructured(legacy);
    expect(isStructuredExam(out)).toBe(true);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].gradingPolicy).toBe("all");
    const q = out.sections[0].questions[0];
    expect(q.examQuestionId).toBe("q1");
    expect(q.marks).toBe(3);
    expect((q.answer as { correctOptionIndex: number }).correctOptionIndex).toBe(0);
    expect(q.image?.assets?.[0].dataUrl).toBe("data:img");
    expect(out.presentationTheme).toBe("compact");
    expect(out.metadata).toEqual({ school: "مدرسة" });
  });
});

// TEST 3 — section add / edit / delete / reorder.
describe("TEST 3: section CRUD + reorder", () => {
  it("adds, updates, reorders and deletes sections immutably", () => {
    let sections: BuilderSection[] = [];
    const a = newSection({ title: "أ" });
    const b = newSection({ title: "ب" });
    sections = addSection(addSection(sections, a), b);
    expect(sections.map(s => s.title)).toEqual(["أ", "ب"]);
    sections = updateSection(sections, a.id, { title: "أ-معدّل", instructions: "تعليمات" });
    expect(sections[0].title).toBe("أ-معدّل");
    expect(sections[0].instructions).toBe("تعليمات");
    const before = sections;
    sections = moveSection(sections, b.id, -1);
    expect(sections.map(s => s.title)).toEqual(["ب", "أ-معدّل"]);
    expect(before).not.toBe(sections); // immutable
    sections = deleteSection(sections, a.id);
    expect(sections.map(s => s.title)).toEqual(["ب"]);
  });
});

// TEST 4 — capScore settings serialize correctly.
describe("TEST 4: capScore serialization", () => {
  it("preset fills capScore + maxMarks and totals cap at maxMarks", () => {
    let sections = addSection([], newSection());
    sections = applyPreset(sections, sections[0].id, "core-2026");
    expect(sections[0].gradingPolicy).toBe("capScore");
    expect(sections[0].maxMarks).toBe(60);
    // 24×3 = 72 raw, but total marks reflect the cap 60
    const qs = Array.from({ length: 24 }, (_, i) => newQuestion("multipleChoice", { examQuestionId: "c" + i, marks: 3 }));
    sections = updateSection(sections, sections[0].id, { questions: qs });
    expect(computeTotalMarks(exam(sections))).toBe(60);
  });
});

// TEST 5 — firstNAnswered at part level serializes correctly.
describe("TEST 5: firstNAnswered part level", () => {
  it("preset fills firstNAnswered/part/requiredAnswers/maxMarks", () => {
    let sections = addSection([], newSection());
    sections = applyPreset(sections, sections[0].id, "infra-2026");
    expect(sections[0]).toMatchObject({ gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 8, maxMarks: 40 });
  });
});

// TEST 6 & 7 — compound with 8 parts; labels/marks survive save/load.
describe("TEST 6/7: compound question with 8 parts survives round-trip", () => {
  it("builds 8 parts and preserves labels + marks through JSON save/load", () => {
    const parts = Array.from({ length: 8 }, (_, i) => newPart("multipleChoice", { marks: 5, label: ordinalLabel(i), options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }));
    const compound = newQuestion("compound", { examQuestionId: "q25", displayNumber: "25", text: "سؤال مركّب", marks: 40, parts });
    const section = newSection({ gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 8, maxMarks: 40, questions: [compound] });
    const saved = toSavedStructuredExam(exam([section]));
    const reloaded = JSON.parse(JSON.stringify(saved)) as StructuredExam;
    const rp = reloaded.sections[0].questions[0].parts!;
    expect(rp).toHaveLength(8);
    expect(rp.map(p => p.label)).toEqual(["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح"]);
    expect(rp.every(p => p.marks === 5)).toBe(true);
    expect(reloaded.sections[0].questions[0].displayNumber).toBe("25");
  });
});

// TEST 8 — multiTrueFalse fields + correct answers survive save/load AND grade correctly.
describe("TEST 8: multiTrueFalse survives round-trip and grades via the real engine", () => {
  it("keeps field.correct and yields partial credit", () => {
    const q = newQuestion("multiTrueFalse", {
      examQuestionId: "mtf1",
      text: "حدد الصحيح",
      marks: 3,
      fields: [
        newField({ id: "s1", statement: "عبارة 1", kind: "boolean", correct: true }),
        newField({ id: "s2", statement: "عبارة 2", kind: "boolean", correct: false }),
        newField({ id: "s3", statement: "عبارة 3", kind: "boolean", correct: true })
      ]
    });
    const e = exam([newSection({ gradingPolicy: "all", questions: [q] })]);
    const reloaded = JSON.parse(JSON.stringify(toSavedStructuredExam(e))) as StructuredExam;
    const result = gradeExam(reloaded, { mtf1: { kind: "fields", values: { s1: "true", s2: "true", s3: "true" } } });
    expect(result.questions[0].score).toBeCloseTo(2, 5); // 2 of 3 correct
  });
});

// TEST 9 — tableFill with TWO editable cells in the SAME row grades each cell independently.
describe("TEST 9: tableFill two editable cells in one row", () => {
  it("toggles two answer cells in row 0 and grades per-cell", () => {
    let q = newQuestion("tableFill", { examQuestionId: "t1", text: "أكمل", marks: 2, tableHeaders: ["العنوان", "الشبكة", "المضيف"], tableRows: [["192.168.1.10/24", "", ""]], fields: [] });
    q = toggleTableCell(q, 0, 1);
    q = toggleTableCell(q, 0, 2);
    // assign correct answers to the two cells
    q = { ...q, fields: q.fields!.map((f, i) => ({ ...f, correct: i === 0 ? "192.168.1.0" : "0.0.0.10" })) };
    expect(q.fields).toHaveLength(2);
    expect(q.fields!.every(f => f.row === 0)).toBe(true);
    const e = exam([newSection({ questions: [q] })]);
    const [f0, f1] = q.fields!;
    const result = gradeExam(e, { t1: { kind: "fields", values: { [f0.id]: "192.168.1.0", [f1.id]: "WRONG" } } });
    expect(result.questions[0].score).toBe(1); // one of two cells correct
  });
});

// TEST 10 — CLI placeholders validate correctly.
describe("TEST 10: cliFill placeholder validation", () => {
  it("extracts [[id]] placeholders and flags a placeholder with no matching field", () => {
    expect(cliPlaceholders("a [[vlan]] b [[ip]]")).toEqual(["vlan", "ip"]);
    const q = newQuestion("cliFill", { examQuestionId: "cli1", text: "أكمل", marks: 5, cli: "encapsulation dot1Q [[vlan]]\nip address [[ip]] 255.255.255.0", fields: [newField({ id: "vlan", label: "vlan", correct: "20" })] });
    const issues = validateStructuredExam(exam([newSection({ questions: [q] })]));
    expect(issues.some(i => i.code === "CLI_PLACEHOLDER_NO_FIELD")).toBe(true); // [[ip]] has no field
    expect(hasBlockingErrors(issues)).toBe(true);
  });
});

// TEST 11 — shared stimulus stored once; questions reference it by groupId.
describe("TEST 11: shared stimulus stored once, referenced by groupId", () => {
  it("keeps one stimulus entry and two questions referencing it", () => {
    const section = newSection({
      stimuli: { topo1: { title: "المخطط", text: "اعتمد على المخطط", image: { dataUrl: "data:img" } } },
      questions: [
        newQuestion("multipleChoice", { examQuestionId: "q11", groupId: "topo1", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 }, marks: 2 }),
        newQuestion("multipleChoice", { examQuestionId: "q12", groupId: "topo1", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 }, marks: 2 })
      ]
    });
    expect(Object.keys(section.stimuli!)).toEqual(["topo1"]);
    expect(section.questions.filter(q => q.groupId === "topo1")).toHaveLength(2);
    const issues = validateStructuredExam(exam([section]));
    expect(issues.some(i => i.code === "STIMULUS_MISSING")).toBe(false);
  });
  it("warns when a question references a missing stimulus", () => {
    const section = newSection({ stimuli: {}, questions: [newQuestion("shortAnswer", { examQuestionId: "q1", text: "س", marks: 1, groupId: "ghost" })] });
    const issues = validateStructuredExam(exam([section]));
    expect(issues.some(i => i.code === "STIMULUS_MISSING")).toBe(true);
  });
});

// TEST 12 — structured saved exam reopens correctly (round-trip identity of canonical content).
describe("TEST 12: structured saved exam reopens", () => {
  it("toSavedStructuredExam keeps sections canonical and JSON round-trips", () => {
    const section = newSection({ title: "قسم", questions: [newQuestion("shortAnswer", { examQuestionId: "q1", text: "س", marks: 4 })] });
    const saved = toSavedStructuredExam(exam([section], { presentationTheme: "modern" }));
    const reloaded = JSON.parse(JSON.stringify(saved)) as StructuredExam;
    expect(isStructuredExam(reloaded)).toBe(true);
    expect(reloaded.sections[0].questions[0].examQuestionId).toBe("q1");
    expect(reloaded.presentationTheme).toBe("modern");
    expect(reloaded.totalMarks).toBe(4);
  });
});

// TEST 13 — a structured exam has the shape assignment creation consumes (count + marks).
describe("TEST 13: structured exam is assignment-ready", () => {
  it("computes question count and total marks the way the backend examStats does", () => {
    const s1 = newSection({ gradingPolicy: "capScore", maxMarks: 60, questions: [newQuestion("multipleChoice", { marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })] });
    const s2 = newSection({ gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 8, maxMarks: 40, questions: [newQuestion("compound", { marks: 40, parts: [newPart("shortAnswer", { marks: 5 })] })] });
    const e = exam([s1, s2]);
    expect(countQuestions(e)).toBe(2);
    expect(computeTotalMarks(e)).toBe(100); // 60 (cap) + 40 (cap)
  });
});

// TEST 14 — validation detects duplicate internal IDs.
describe("TEST 14: duplicate internal id detection", () => {
  it("flags two questions sharing an examQuestionId as an error", () => {
    const q1: BuilderQuestion = newQuestion("shortAnswer", { examQuestionId: "dup", text: "أ", marks: 1 });
    const q2: BuilderQuestion = newQuestion("shortAnswer", { examQuestionId: "dup", text: "ب", marks: 1 });
    const issues = validateStructuredExam(exam([newSection({ questions: [q1, q2] })]));
    expect(issues.some(i => i.code === "DUPLICATE_ID" && i.severity === "error")).toBe(true);
  });
});

// TEST 15 — validation detects missing firstN requiredAnswers.
describe("TEST 15: firstNAnswered missing requiredAnswers", () => {
  it("flags a firstNAnswered section without requiredAnswers as a blocking error", () => {
    const section = newSection({ gradingPolicy: "firstNAnswered", requiredAnswers: null, questions: [newQuestion("shortAnswer", { text: "س", marks: 1 })] });
    const issues = validateStructuredExam(exam([section]));
    expect(issues.some(i => i.code === "FIRSTN_NO_REQUIRED" && i.severity === "error")).toBe(true);
  });
});

// TEST 16 — the security sanitizer still strips every teacher-side secret the builder produces.
describe("TEST 16: sanitizer removes all builder-produced answer keys", () => {
  it("no question.answer, field.correct, part.answer or part field.correct reaches the student", () => {
    const compound = newQuestion("compound", {
      examQuestionId: "qc",
      text: "مركّب",
      marks: 10,
      parts: [
        newPart("shortAnswer", { marks: 5, answer: { text: "SECRET_PART_ANSWER" } }),
        newPart("cliFill", { marks: 5, cli: "x [[b]]", fields: [newField({ id: "b", correct: "SECRET_PART_FIELD_CORRECT" })] })
      ]
    });
    const q = newQuestion("multiTrueFalse", { examQuestionId: "qf", text: "س", marks: 3, fields: [newField({ id: "s1", statement: "ع", kind: "boolean", correct: true })], answer: { note: "SECRET_TOP_LEVEL_ANSWER" } });
    const built = exam([newSection({ questions: [q, compound] })]);
    const json = JSON.stringify(sanitizeExamForStudent(built));
    expect(json).not.toContain("SECRET_PART_ANSWER");
    expect(json).not.toContain("SECRET_PART_FIELD_CORRECT");
    expect(json).not.toContain("SECRET_TOP_LEVEL_ANSWER");
    // student-visible structure survives
    const safe = sanitizeExamForStudent(built) as StructuredExam;
    expect(safe.sections[0].questions[0].fields![0].statement).toBe("ع");
    expect(safe.sections[0].questions[1].parts![1].cli).toBe("x [[b]]");
  });
});

// Extra: question move/duplicate/move-across-sections and type change keep ids stable/fresh correctly.
describe("question operations", () => {
  it("duplicate gives a fresh id but keeps displayNumber; move across sections preserves the object", () => {
    const s1 = newSection({ title: "1", questions: [newQuestion("shortAnswer", { examQuestionId: "a", displayNumber: "7", text: "س", marks: 1 })] });
    const s2 = newSection({ title: "2" });
    let sections = [s1, s2];
    sections = duplicateQuestion(sections, s1.id, "a");
    expect(sections[0].questions).toHaveLength(2);
    expect(sections[0].questions[1].examQuestionId).not.toBe("a");
    expect(sections[0].questions[1].displayNumber).toBe("7");
    sections = moveQuestionToSection(sections, s1.id, "a", s2.id);
    expect(sections[0].questions.find(q => q.examQuestionId === "a")).toBeUndefined();
    expect(sections[1].questions.find(q => q.examQuestionId === "a")).toBeTruthy();
    sections = moveQuestion(sections, sections[0].id, sections[0].questions[0].examQuestionId, 0);
    const changed = changeQuestionType(newQuestion("shortAnswer", { examQuestionId: "z", text: "keep", marks: 2 }), "multipleChoice");
    expect(changed.examQuestionId).toBe("z");
    expect(changed.text).toBe("keep");
    expect(changed.options).toHaveLength(2);
  });
  it("addTableColumn extends headers and every row", () => {
    let q = newQuestion("tableFill", { tableHeaders: ["a"], tableRows: [["x"], ["y"]] });
    q = addTableColumn(q, "b");
    expect(q.tableHeaders).toEqual(["a", "b"]);
    expect(q.tableRows).toEqual([["x", ""], ["y", ""]]);
  });
});

// End-to-end smoke: build the manual-smoke-test exam entirely from the builder helpers, save it,
// reload it (JSON round-trip = reopen), then GRADE a sample submission and SANITIZE for students —
// proving the whole builder → save → reopen → assignment/grading → student pipeline is coherent.
describe("SMOKE: full structured exam builds, reopens, grades and sanitizes end-to-end", () => {
  it("2 sections (capScore + firstN part-level compound with mixed parts + shared stimulus)", () => {
    // Section 1 — capScore 60
    const s1 = newSection({ title: "القسم الأول — الأساس", gradingPolicy: "capScore", maxMarks: 60, stimuli: { topo: { title: "المخطط", text: "اعتمد على المخطط" } } });
    let s1q = [
      newQuestion("multipleChoice", { examQuestionId: "c1", groupId: "topo", marks: 3, text: "MCQ", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }),
      newQuestion("multiTrueFalse", { examQuestionId: "c2", groupId: "topo", marks: 3, text: "صح/خطأ", fields: [newField({ id: "a", statement: "1", kind: "boolean", correct: true }), newField({ id: "b", statement: "2", kind: "boolean", correct: false }), newField({ id: "c", statement: "3", kind: "boolean", correct: true })] })
    ];
    let t = newQuestion("tableFill", { examQuestionId: "c3", marks: 2, text: "جدول", tableHeaders: ["العنوان", "الشبكة", "المضيف"], tableRows: [["192.168.1.10/24", "", ""]], fields: [] });
    t = toggleTableCell(t, 0, 1); t = toggleTableCell(t, 0, 2);
    t = { ...t, fields: t.fields!.map((f, i) => ({ ...f, correct: i === 0 ? "192.168.1.0" : "0.0.0.10" })) };
    s1q = [...s1q, t];
    const section1 = { ...s1, questions: s1q };

    // Section 2 — firstNAnswered, part unit, 8 required, compound Q25 with 8 parts incl. mixed types
    const parts = [
      newPart("multipleChoice", { id: "p1", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }),
      newPart("trueFalse", { id: "p2", marks: 5, answer: { correct: true } }),
      newPart("cliFill", { id: "p3", marks: 5, cli: "encapsulation dot1Q [[vlan]]", fields: [newField({ id: "vlan", correct: "20" })] }),
      newPart("tableFill", { id: "p4", marks: 5, tableHeaders: ["x", "y"], tableRows: [["a", ""]], fields: [newField({ id: "t4", row: 0, column: 1, correct: "z" })] }),
      newPart("shortAnswer", { id: "p5", marks: 5 }),
      newPart("multipleChoice", { id: "p6", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } }),
      newPart("multipleChoice", { id: "p7", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }),
      newPart("multipleChoice", { id: "p8", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })
    ];
    const q25 = newQuestion("compound", { examQuestionId: "q25", displayNumber: "25", marks: 40, text: "سؤال مركّب", parts });
    const section2 = newSection({ title: "القسم الثاني — البنى التحتية", gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 8, maxMarks: 40, questions: [q25] });

    const built = exam([section1, section2], { presentationTheme: "compact" });

    // no blocking errors (shortAnswer part with no key is a warning, not an error)
    const issues = validateStructuredExam(built);
    expect(issues.filter(i => i.severity === "error")).toEqual([]);

    // save + reopen
    const reopened = JSON.parse(JSON.stringify(toSavedStructuredExam(built))) as StructuredExam;
    expect(reopened.totalMarks).toBe(100);
    expect(countQuestions(reopened)).toBe(4);
    expect(reopened.sections[1].questions[0].parts).toHaveLength(8);

    // grade a submission via the real engine
    const t4id = reopened.sections[0].questions[2].fields![0].id;
    const t4id2 = reopened.sections[0].questions[2].fields![1].id;
    const grade = gradeExam(reopened, {
      c1: { kind: "choice", index: 0 },
      c2: { kind: "fields", values: { a: "true", b: "false", c: "true" } },
      c3: { kind: "fields", values: { [t4id]: "192.168.1.0", [t4id2]: "0.0.0.10" } },
      q25: { kind: "compound", parts: { p1: { kind: "choice", index: 0 }, p2: { kind: "choice", index: 0 }, p3: { kind: "fields", values: { vlan: "20" } } } }
    });
    expect(grade.totalMarks).toBe(100);
    expect(grade.score).toBeGreaterThan(0);

    // sanitize for students — no answer keys leak
    const safe = JSON.stringify(sanitizeExamForStudent(reopened));
    expect(safe).not.toContain("correctOptionIndex");
    expect(safe.includes("\"correct\":")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Review-fix regressions (PR #52 round 2)
// ─────────────────────────────────────────────────────────────────────────

// Fix 1/2/11 — active exam & assignment source work for a NATIVE structured exam with no questions[].
describe("REVIEW 1/2: native structured exam is assignment-ready with no top-level questions[]", () => {
  it("examHasQuestions/examQuestionCount count sections, and legacyToStructured drops questions[]", () => {
    const native = exam([
      newSection({ questions: [newQuestion("shortAnswer", { text: "a", marks: 1 }), newQuestion("shortAnswer", { text: "b", marks: 1 }), newQuestion("shortAnswer", { text: "c", marks: 1 })] }),
      newSection({ questions: [newQuestion("shortAnswer", { text: "d", marks: 1 }), newQuestion("shortAnswer", { text: "e", marks: 1 }), newQuestion("shortAnswer", { text: "f", marks: 1 }), newQuestion("shortAnswer", { text: "g", marks: 1 }), newQuestion("shortAnswer", { text: "h", marks: 1 })] })
    ]);
    expect("questions" in native).toBe(false);
    expect(examQuestionCount(native)).toBe(8); // 3 + 5
    expect(examHasQuestions(native)).toBe(true);
    expect(examQuestionCount({ examId: "x", questions: [{}, {}] })).toBe(2); // legacy still works
  });

  it("legacyToStructured removes the top-level questions[] (no stale duplicate) but keeps the data in the section", () => {
    const legacy = { examId: "L", title: "قديم", questions: [{ examQuestionId: "q1", text: "س", marks: 3, answer: { correctOptionIndex: 1 }, image: { assets: [{ dataUrl: "d" }] } }] };
    const structured = legacyToStructured(legacy);
    expect("questions" in structured).toBe(false);
    expect(structured.sections[0].questions[0].examQuestionId).toBe("q1");
    expect((structured.sections[0].questions[0].answer as { correctOptionIndex: number }).correctOptionIndex).toBe(1);
    // editing the structured question does not resurrect a second copy
    const edited = { ...structured, sections: updateQuestion(structured.sections, structured.sections[0].id, "q1", { text: "معدّل" }) };
    expect("questions" in toSavedStructuredExam(edited)).toBe(false);
    expect(edited.sections[0].questions[0].text).toBe("معدّل");
  });
});

// Fix 6 — MCQ option move/delete keep correctOptionIndex pointing at the SAME option.
describe("REVIEW 6: MCQ reorder/delete preserve the correct answer", () => {
  const q = () => newQuestion("multipleChoice", { options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer: { correctOptionIndex: 1 } }); // B correct
  it("moving the correct option follows it", () => {
    expect((moveMcqOption(q(), 1, -1).answer as { correctOptionIndex: number }).correctOptionIndex).toBe(0);
  });
  it("moving a non-correct option across the correct one shifts the index", () => {
    // move C (index 2) up past B (index 1): B goes from 1 -> 2
    expect((moveMcqOption(q(), 2, -1).answer as { correctOptionIndex: number }).correctOptionIndex).toBe(2);
    // move A (index 0) down past B: B goes from 1 -> 0
    expect((moveMcqOption(q(), 0, 1).answer as { correctOptionIndex: number }).correctOptionIndex).toBe(0);
  });
  it("deleting before the correct option decrements the index; after it leaves it", () => {
    expect((deleteMcqOption(q(), 0).answer as { correctOptionIndex: number }).correctOptionIndex).toBe(0);
    expect((deleteMcqOption(q(), 2).answer as { correctOptionIndex: number }).correctOptionIndex).toBe(1);
  });
  it("deleting the correct option UNSETS the answer (never silently picks another)", () => {
    expect(deleteMcqOption(q(), 1).answer).toEqual({});
  });
});

// Fix 5 — compound parts run type-specific validation; firstN exceeding units is a blocking error.
describe("REVIEW 5: type-aware compound validation + firstN-exceeds error", () => {
  it("a malformed cliFill PART is a blocking error, not just a generic warning", () => {
    const compound = newQuestion("compound", { examQuestionId: "qc", text: "م", marks: 10, parts: [
      newPart("cliFill", { id: "a", marks: 5, cli: "ip address [[ip]]", fields: [] }) // [[ip]] has no field
    ] });
    const issues = validateStructuredExam(exam([newSection({ questions: [compound] })]));
    expect(issues.some(i => i.code === "CLI_PLACEHOLDER_NO_FIELD" && i.severity === "error")).toBe(true);
    expect(hasBlockingErrors(issues)).toBe(true);
  });
  it("firstNAnswered requiredAnswers greater than available units is now a blocking error", () => {
    const section = newSection({ gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 5, questions: [newQuestion("shortAnswer", { text: "a", marks: 1 }), newQuestion("shortAnswer", { text: "b", marks: 1 })] });
    const issues = validateStructuredExam(exam([section]));
    expect(issues.some(i => i.code === "FIRSTN_EXCEEDS" && i.severity === "error")).toBe(true);
  });
});

// Fix 10 — an unset multiTrueFalse correct answer is flagged until explicitly chosen.
describe("REVIEW 10: multiTrueFalse unset correct is flagged", () => {
  it("a field with undefined correct is a blocking error; a boolean correct is fine", () => {
    const bad = newQuestion("multiTrueFalse", { text: "س", marks: 2, fields: [newField({ id: "s1", statement: "1", kind: "boolean" })] });
    expect(validateStructuredExam(exam([newSection({ questions: [bad] })])).some(i => i.code === "FIELD_NO_CORRECT" && i.severity === "error")).toBe(true);
    const good = newQuestion("multiTrueFalse", { text: "س", marks: 2, fields: [newField({ id: "s1", statement: "1", kind: "boolean", correct: false })] });
    expect(validateStructuredExam(exam([newSection({ questions: [good] })])).some(i => i.code === "FIELD_NO_CORRECT")).toBe(false);
  });
});

// Fix 8 — standalone fillBlank with NO word bank grades via free-text exactSequence values.
describe("REVIEW 8: fillBlank with empty wordBank is answerable + gradeable", () => {
  it("grades free-text sequence values (the shape the text inputs produce)", () => {
    const q = newQuestion("fillBlank", { examQuestionId: "fb", text: "أكمل", marks: 2, wordBank: [], fields: [newField({ id: "b1", correct: "APIPA" }), newField({ id: "b2", correct: "169.254" })], answer: { mode: "exactSequence", values: ["APIPA", "169.254"] } });
    const result = gradeExam(exam([newSection({ questions: [q] })]), { fb: { kind: "sequence", values: ["APIPA", "wrong"] } });
    expect(result.questions[0].score).toBe(1); // one of two blanks correct
  });
});

// Fix 9 — a compound matching part carries per-field options and grades correctly.
describe("REVIEW 9: compound matching part has selectable options and grades", () => {
  it("buildMatchingPatch stores rights on field.options and the part grades via the engine", () => {
    const patch = buildMatchingPatch([{ left: "HTTP", right: "تطبيقات" }, { left: "IP", right: "شبكة" }]);
    expect(patch.fields!.every(f => f.kind === "select" && (f.options || []).length === 2)).toBe(true);
    const part = newPart("matching", { id: "mp", marks: 4, ...patch });
    const compound = newQuestion("compound", { examQuestionId: "qm", text: "طابق", marks: 4, parts: [part] });
    const result = gradeExam(exam([newSection({ questions: [compound] })]), { qm: { kind: "compound", parts: { mp: { kind: "table", values: ["تطبيقات", "شبكة"] } } } });
    expect(result.questions[0].score).toBe(4);
  });
});

// Fix 4 — draft may save with errors; final blocked by errors; status survives round-trip.
describe("REVIEW 4: draft vs final", () => {
  it("an invalid exam has blocking errors (final blocked) yet a draft payload round-trips its status", () => {
    const invalid = exam([newSection({ gradingPolicy: "firstNAnswered", requiredAnswers: null, questions: [newQuestion("shortAnswer", { text: "س", marks: 1 })] })]);
    expect(hasBlockingErrors(validateStructuredExam(invalid))).toBe(true); // final would be blocked
    const draft = { ...toSavedStructuredExam(invalid), status: "draft" as const };
    const reloaded = JSON.parse(JSON.stringify(draft)) as StructuredExam;
    expect(reloaded.status).toBe("draft"); // draft saved despite errors
    const valid = exam([newSection({ gradingPolicy: "all", questions: [newQuestion("multipleChoice", { text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })] })]);
    expect(hasBlockingErrors(validateStructuredExam(valid))).toBe(false);
    expect((JSON.parse(JSON.stringify({ ...toSavedStructuredExam(valid), status: "final" as const })) as StructuredExam).status).toBe("final");
  });
});

// Fix 8 (compound) — a fillBlank PART with empty wordBank grades via field.correct (fields answer).
describe("REVIEW 8 (compound): fillBlank part with empty wordBank grades", () => {
  it("grades a compound fillBlank part through the engine using field.correct", () => {
    const part = newPart("fillBlank", { id: "fp", marks: 2, wordBank: [], fields: [newField({ id: "b1", correct: "APIPA" }), newField({ id: "b2", correct: "169.254" })] });
    const compound = newQuestion("compound", { examQuestionId: "qf", text: "أكمل", marks: 2, parts: [part] });
    const result = gradeExam(exam([newSection({ questions: [compound] })]), { qf: { kind: "compound", parts: { fp: { kind: "fields", values: { b1: "APIPA", b2: "169.254" } } } } });
    expect(result.questions[0].score).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Review-fix regressions (PR #52 round 3)
// ─────────────────────────────────────────────────────────────────────────

// Fix 1 — grading-policy state transitions clear stale settings; validation requires a positive cap;
// an "all" section can never score above its total.
describe("REVIEW 1: grading-policy transitions & maxMarks validation", () => {
  it("capScore 60 → all clears maxMarks (and first-N fields)", () => {
    const cap = { gradingPolicy: "capScore" as const, maxMarks: 60, requiredAnswers: null, answerUnit: "question" as const };
    expect(changeSectionPolicy(cap, "all")).toEqual({ gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" });
  });
  it("firstN 40 → all clears maxMarks and requiredAnswers", () => {
    const fn = { gradingPolicy: "firstNAnswered" as const, maxMarks: 40, requiredAnswers: 8, answerUnit: "part" as const };
    expect(changeSectionPolicy(fn, "all")).toEqual({ gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" });
  });
  it("all → capScore keeps a null cap the teacher must fill (and validation blocks a missing cap)", () => {
    const patch = changeSectionPolicy({ gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" }, "capScore");
    expect(patch).toMatchObject({ gradingPolicy: "capScore", requiredAnswers: null, answerUnit: "question", maxMarks: null });
    const section = newSection({ ...patch, questions: [newQuestion("multipleChoice", { text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })] });
    expect(validateStructuredExam(exam([section])).some(i => i.code === "MAXMARKS_REQUIRED" && i.severity === "error")).toBe(true);
  });
  it("an 'all' section that carries a stale maxMarks is flagged, and grading never exceeds the total", () => {
    // 24×3 = 72 questions; policy 'all' must total 72 and never cap at a leftover 60.
    const qs = Array.from({ length: 24 }, (_, i) => newQuestion("multipleChoice", { examQuestionId: "a" + i, marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }));
    // simulate stale data: 'all' with a leftover cap
    const stale = exam([newSection({ gradingPolicy: "all", maxMarks: 60, questions: qs })]);
    expect(validateStructuredExam(stale).some(i => i.code === "ALL_HAS_MAXMARKS" && i.severity === "error")).toBe(true);
    const answers: Record<string, { kind: "choice"; index: number }> = {};
    qs.forEach(q => (answers[q.examQuestionId] = { kind: "choice", index: 0 }));
    const g = gradeExam(stale, answers);
    expect(g.totalMarks).toBe(72); // NOT 60
    expect(g.score).toBe(72);
    expect(g.score).toBeLessThanOrEqual(g.totalMarks);
    expect(computeTotalMarks(stale)).toBe(72);
  });
  it("the 2025/2026 presets still produce valid sections", () => {
    const withQ = (over: Partial<BuilderSection>) => newSection({ ...over, questions: [newQuestion("compound", { text: "م", marks: 5, parts: [newPart("multipleChoice", { marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })] })] });
    let s = addSection([], newSection()); s = applyPreset(s, s[0].id, "core-2026");
    expect(validateStructuredExam(exam([{ ...s[0], questions: [newQuestion("multipleChoice", { text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } })] }])).some(i => i.code === "MAXMARKS_REQUIRED")).toBe(false);
    let f = addSection([], newSection()); f = applyPreset(f, f[0].id, "infra-2026");
    expect(validateStructuredExam(exam([withQ({ ...f[0] })])).some(i => i.code === "MAXMARKS_REQUIRED" || i.code === "FIRSTN_NO_REQUIRED")).toBe(false);
  });
});

// Fix 2 — auto-graded structured types with missing/incomplete keys block FINAL but allow DRAFT.
describe("REVIEW 2: auto-graded types require answer keys for finalization", () => {
  const wrap = (q: BuilderQuestion) => exam([newSection({ gradingPolicy: "all", questions: [q] })]);
  const codes = (q: BuilderQuestion) => validateStructuredExam(wrap(q)).filter(i => i.severity === "error").map(i => i.code);

  it("incomplete fillBlank → blocking error (draft still allowed conceptually)", () => {
    const q = newQuestion("fillBlank", { text: "أكمل", marks: 2, wordBank: [], fields: [newField({ id: "b1", correct: "" }), newField({ id: "b2", correct: "x" })], answer: { mode: "exactSequence", values: ["", "x"] } });
    expect(codes(q)).toContain("FIELD_NO_CORRECT");
    expect(hasBlockingErrors(validateStructuredExam(wrap(q)))).toBe(true);
  });
  it("incomplete wordBank (correct not reachable) → blocking error", () => {
    const q = newQuestion("wordBank", { text: "أكمل", marks: 2, wordBank: ["OSPF", "RIP"], fields: [newField({ id: "b1", kind: "select", correct: "GHOST" })], answer: { mode: "exactSequence", values: ["GHOST"] } });
    expect(codes(q)).toContain("CORRECT_NOT_IN_CHOICES");
  });
  it("incomplete ordering (answer.values count mismatch) → blocking error", () => {
    const q = newQuestion("ordering", { text: "رتّب", marks: 3, wordBank: ["1", "2", "3"], fields: [newField({ id: "a", correct: "1" }), newField({ id: "b", correct: "2" }), newField({ id: "c", correct: "3" })], answer: { mode: "exactSequence", values: ["1"] } });
    expect(codes(q)).toContain("ANSWER_SEQUENCE_MISMATCH");
  });
  it("matching with one incomplete pair → blocking error", () => {
    const q = newQuestion("matching", { text: "طابق", marks: 4, ...buildMatchingPatch([{ left: "HTTP", right: "تطبيقات" }, { left: "IP", right: "" }]) });
    expect(codes(q)).toContain("MATCH_INCOMPLETE_PAIR");
  });
  it("complete versions finalize cleanly", () => {
    const fill = newQuestion("fillBlank", { text: "أكمل", marks: 2, wordBank: [], fields: [newField({ id: "b1", correct: "APIPA" }), newField({ id: "b2", correct: "169.254" })], answer: { mode: "exactSequence", values: ["APIPA", "169.254"] } });
    expect(hasBlockingErrors(validateStructuredExam(wrap(fill)))).toBe(false);
    const match = newQuestion("matching", { text: "طابق", marks: 4, ...buildMatchingPatch([{ left: "HTTP", right: "تطبيقات" }, { left: "IP", right: "شبكة" }]) });
    expect(hasBlockingErrors(validateStructuredExam(wrap(match)))).toBe(false);
  });
  it("shortAnswer with NO model answer still finalizes (manual review is allowed)", () => {
    const q = newQuestion("shortAnswer", { text: "اشرح", marks: 5, answer: {} });
    expect(hasBlockingErrors(validateStructuredExam(wrap(q)))).toBe(false);
  });
  it("the same key rules apply to a compound PART (fillBlank part missing a key blocks final)", () => {
    const part = newPart("fillBlank", { id: "fp", marks: 2, wordBank: [], fields: [newField({ id: "b1", correct: "" })], answer: { mode: "exactSequence", values: [""] } });
    const compound = newQuestion("compound", { examQuestionId: "qc", text: "م", marks: 2, parts: [part] });
    expect(hasBlockingErrors(validateStructuredExam(exam([newSection({ questions: [compound] })])))).toBe(true);
  });
});
