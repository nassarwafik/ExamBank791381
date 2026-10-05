import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 19C — Independent Review Fix 1 on the SERVER (the only producer of student projections).
//   RF1: a display format never becomes a hidden-precision side channel in the delivered payload (sanitizer AND the real student
//        GET handler): d = 29.5 shown with fixed 0 as "30" ⇒ the payload never carries 29.5; speed 9.8333… shown as "9.83" ⇒ never
//        9.833…; grading and the teacher review keep the exact values.
//   RF2: a valid v2 question showing more than 20 symbols (base + derived) is delivered and accepted by the shared reader.
// Fail-first on 3c85e17. Pins: fixture identity asg-17c-auto / S1 / pq2 attempt 1 ⇒ d = 29.5, t = 3, speed = 9.833333333333334.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const shared = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
const PHYS = { v: 2, generatorVersion: 2, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5, format: { kind: "fixed", decimals: 0 } }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 }], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: ["speed > 1"], response: { unit: "label", label: "م" } };
const TEXT = "قطع جسم مسافة تقريبية {{d}} مترًا بسرعة تقريبية {{speed}} م/ث خلال {{t}} ثانية. ما المسافة الدقيقة؟";
const pq = (over = {}) => ({ examQuestionId: "pq2", presentationType: "parametricNumeric", questionTypeVersion: 1, text: TEXT, marks: 3, parametric: JSON.parse(JSON.stringify(PHYS)), answer: { expression: "d", mode: "tolerance", tolerance: 0 }, ...over });
const exam = questions => ({ examId: "E19C", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const num = value => ({ kind: "numeric", value });
const CTX = { parametric: { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 } };
const SHOWN_TEXT = "قطع جسم مسافة تقريبية 30 مترًا بسرعة تقريبية 9.83 م/ث خلال 3 ثانية. ما المسافة الدقيقة؟";
const SHOWN = { v: 1, status: "ready", generatorVersion: 2, values: { d: 30, speed: 9.83, t: 3 }, response: { unit: "label", label: "م" } };
const HIDDEN = /29\.5|9\.833|d \/ t|speed > 1|"expression"|"constraints"|"derivedVariables"|"tolerance"|"format"|"decimals"/;

describe("19C RF1 — server delivery carries only the displayed precision", () => {
  it("sanitizer: formatted base AND derived values are delivered as displayed; exact values never leave the server", () => {
    const s = sanitizeExamForStudent(exam([pq()]), CTX).sections[0].questions[0];
    expect(s.text).toBe(SHOWN_TEXT);
    expect(s.parametric).toEqual(SHOWN);
    expect(JSON.stringify(s)).not.toMatch(HIDDEN);
    expect(shared.readParametricStudentProjection(s.parametric)).toEqual(SHOWN);
  });
  it("grading and the teacher review still use the exact official values (29.5 is right, the displayed 30 is wrong)", () => {
    const g = r => r.questions.find(x => x.questionId === "pq2");
    expect(g(gradeExam(exam([pq()]), { pq2: num("29.5") }, CTX))).toMatchObject({ score: 3, correct: true, manualReview: false });
    expect(g(gradeExam(exam([pq()]), { pq2: num("30") }, CTX))).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(shared.parametricReviewInstance(pq(), { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionKey: "pq2" })).toMatchObject({ ok: true, values: { d: 29.5, t: 3 }, derived: { speed: 9.833333333333334 }, expected: 29.5 });
  });
  it("the real student GET handler delivers the same display-only projection", async () => {
    const studentAssignment = require_("../src/functions/student-assignment.js");
    const snapshot = { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [pq()] }] };
    const ctx = F.seed({ a: F.assignment({ examSnapshot: snapshot, totalMarks: 3, questionCount: 1 }) });
    const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() };
    const r = await studentAssignment.handler(F.studentRequest(undefined, "GET"), deps);
    expect(r.status).toBe(200);
    const q = r.jsonBody.assignment.exam.sections[0].questions[0];
    expect(q.text).toBe(SHOWN_TEXT); expect(q.parametric).toEqual(SHOWN);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(HIDDEN);
  });
});

describe("19C RF2 — more than 20 visible symbols on the server", () => {
  it("a valid v2 question showing 20 base + 2 derived symbols is delivered ready and accepted by the shared reader", () => {
    const vars = Array.from({ length: 20 }, (_, i) => ({ id: "x" + (i + 1), kind: "integer", min: 1, max: 5 }));
    const n = pq({ text: "القيم: " + [...vars.map(v => v.id), "y1", "y2"].map(s => "{{" + s + "}}").join(" ، "), parametric: { v: 2, generatorVersion: 2, variables: vars, derivedVariables: [{ id: "y1", expression: "x1 + 1" }, { id: "y2", expression: "x2 * 2" }], constraints: [], response: { unit: "none" } }, answer: { expression: "y1", mode: "tolerance", tolerance: 0 } });
    expect(shared.validateParametricNumericQuestion(n)).toEqual([]);
    const s = sanitizeExamForStudent(exam([n]), CTX).sections[0].questions[0];
    expect(s.parametric.status).toBe("ready"); expect(Object.keys(s.parametric.values)).toHaveLength(22);
    expect(shared.readParametricStudentProjection(s.parametric)).toEqual(s.parametric);
    expect(shared.readParametricStudentProjection({ ...s.parametric, values: Object.fromEntries(Array.from({ length: 41 }, (_, i) => ["s" + i, i])) })).toBeNull();
  });
});
