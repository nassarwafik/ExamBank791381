import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { studentExam, handler as studentAssignmentHandler } from "../src/functions/student-assignment.js";
import { cleanExam } from "../src/functions/save-exam-artifact.js";
import { verifySignedAssetParams } from "../src/lib/builder-auth.js";

// Phase 13C-A — F5: the Blueprint and question assessmentMeta are TEACHER planning data and never reach a student; an
// approved activity descriptor (student-visible interactive context) does, minus any field content could use to claim
// trust or name code, and minus any secret-looking config key. Existing secrecy (answers, hidden media, 13B bank image
// re-signing) is unchanged. ONE sanitizer.

process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-13b";
const blueprint = { schemaVersion: 1, subject: { id: "physics", label: "الفيزياء" }, topics: [{ id: "MOTION", label: "الحركة" }], objectives: [{ id: "o1", label: "يحسب", topicId: "MOTION" }], constraints: [{ id: "c1", dimension: "topic", ref: "MOTION", metric: "marks", unit: "percent", target: 40 }], targets: { totalMarks: 50 } };
const activity = { id: "act-1", kind: "simulation", key: "projectile", version: 1, title: "محاكاة المقذوف", description: "غيّر الزاوية", config: { angle: 45, speed: 20, labels: ["أ", "ب"] } };
const hostileActivity = { ...activity, assessmentSafe: true, trusted: true, component: "Evil", module: "../x", load: "import('x')", src: "http://e", html: "<script>", config: { angle: 45, answer: "SECRET-ANS", correctOptionIndex: 2, nested: { solution: "S", ok: 1 }, hint: "H" } };
const exam = () => ({
  examId: "e1", title: "t", schemaVersion: 2, blueprint,
  sections: [{
    id: "s1", title: "S", gradingPolicy: "all", stimuli: { g1: { title: "مشترك", text: "نص", activity: hostileActivity } },
    questions: [
      { examQuestionId: "q1", presentationType: "multipleChoice", text: "س1", marks: 5, groupId: "g1", options: [{ text: "أ", correct: true }, { text: "ب" }], answer: { correctOptionIndex: 0 }, hint: "تلميح", assessmentMeta: { primaryTopicId: "MOTION", objectiveIds: ["o1"], difficulty: 3, cognitiveLevel: "apply" }, activity: hostileActivity },
      { examQuestionId: "q2", presentationType: "compound", text: "مركب", marks: 6, assessmentMeta: { primaryTopicId: "MOTION" }, parts: [{ id: "p1", type: "fillBlank", text: "أ", marks: 3, fields: [{ id: "f1", label: "ف", correct: "42" }], answer: { mode: "exactSequence", values: ["42"] }, assessmentMeta: { difficulty: 2 }, activity: activity }] },
      { examQuestionId: "q3", presentationType: "shortAnswer", text: "مخفي", marks: 1, answer: { text: "SECRET-3" }, image: { exists: true, visible: false, assets: [{ id: "a", origin: "bank", blobName: "bank/h.png", contentType: "image/png" }] } },
      { examQuestionId: "q4", presentationType: "shortAnswer", text: "صورة بنك", marks: 1, answer: { text: "SECRET-4" }, image: { exists: true, visible: true, assets: [{ id: "b", origin: "bank", blobName: "bank/v.png", contentType: "image/png" }] } }
    ]
  }]
});

describe("F5 — teacher planning data never reaches the student", () => {
  it("M10 — the blueprint is stripped; assessmentMeta is stripped from questions AND parts; the payload contains none of the planning vocabulary", () => {
    const s = sanitizeExamForStudent(exam());
    expect(s).not.toHaveProperty("blueprint");
    expect(s.sections[0].questions[0]).not.toHaveProperty("assessmentMeta");
    expect(s.sections[0].questions[1]).not.toHaveProperty("assessmentMeta");
    expect(s.sections[0].questions[1].parts[0]).not.toHaveProperty("assessmentMeta");
    const text = JSON.stringify(s);
    expect(text).not.toContain("blueprint"); expect(text).not.toContain("assessmentMeta"); expect(text).not.toContain("primaryTopicId"); expect(text).not.toContain("cognitiveLevel"); expect(text).not.toContain("MOTION");
  });
  it("M11 — existing answer secrecy is intact alongside the new rules: answer keys, option flags, field.correct, hints, part answers", () => {
    const s = sanitizeExamForStudent(exam());
    const text = JSON.stringify(s);
    for (const secret of ["SECRET-ANS", "SECRET-3", "SECRET-4", "\"correct\":true", "\"correct\":\"42\"", "correctOptionIndex", "تلميح", "solution"]) expect(text).not.toContain(secret);
    expect(s.sections[0].questions[0].hint).toBe("");                                                    // legacy-identical blanking is kept
    expect(s.sections[0].questions[0].answer).toEqual({}); expect(s.sections[0].questions[1].parts[0].answer).toBeUndefined();
    expect(s.sections[0].questions[1].parts[0].fields[0]).not.toHaveProperty("correct");
  });
  it("an activity descriptor reaches the student as data only: allowlisted fields, trust claims and executable fields dropped, secret-looking config keys stripped recursively (question, part and stimulus scope)", () => {
    const s = sanitizeExamForStudent(exam());
    const expected = { id: "act-1", kind: "simulation", key: "projectile", version: 1, title: "محاكاة المقذوف", description: "غيّر الزاوية", config: { angle: 45, nested: { ok: 1 } } };
    expect(s.sections[0].questions[0].activity).toEqual(expected);
    expect(s.sections[0].stimuli.g1.activity).toEqual(expected);
    expect(s.sections[0].questions[1].parts[0].activity).toEqual(activity);
    const text = JSON.stringify(s);
    for (const k of ["assessmentSafe", "trusted", "component", "module", "\"load\"", "\"src\"", "html", "<script>", "Evil", "SECRET-ANS"]) expect(text).not.toContain(k);
    expect(s.sections[0].questions[0].activity.config).not.toHaveProperty("hint");
  });
  it("hidden media stays hidden and the 13B re-signing still happens at delivery (hydrate → sanitize order)", async () => {
    const store = new Map();
    store.set("platform/classes/c1.json", { classId: "c1", name: "الصف", active: true });
    store.set("platform/assignments/a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 1, questionCount: 4, totalMarks: 13, examSnapshot: cleanExam(exam()) });
    const deps = { requireActiveStudentSession: async () => ({ ok: true, container: {}, student: { studentId: "st1", classId: "c1" } }), downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null), uploadJson: async () => { throw new Error("no writes"); } };
    const r = await studentAssignmentHandler({ method: "GET", url: "http://x/api/student-assignment/a1", params: { assignmentId: "a1" }, headers: new Map() }, deps);
    expect(r.status).toBe(200);
    const ex = r.jsonBody.assignment.exam;
    expect(ex).not.toHaveProperty("blueprint");
    expect(ex.sections[0].questions[2].image).toEqual({ exists: true, visible: false });
    const url = ex.sections[0].questions[3].image.assets[0].dataUrl;
    const u = new URL(url, "http://x");
    expect(verifySignedAssetParams(u.searchParams.get("blob"), u.searchParams.get("exp"), u.searchParams.get("sig"))).toBe(true);
    const text = JSON.stringify(r.jsonBody);
    expect(text).not.toContain("bank/h.png"); expect(text).not.toContain("SECRET"); expect(text).not.toContain("assessmentMeta"); expect(text).not.toContain("blueprint");
    // the stored snapshot (server side) still carries the blueprint — teacher data is kept, only the student copy is stripped
    expect(store.get("platform/assignments/a1.json").examSnapshot.blueprint).toEqual(blueprint);
    expect(studentExam(exam())).not.toHaveProperty("blueprint");
  });
  it("legacy exams without any planning data sanitize exactly as before (byte-identical to the pre-13C-A sanitizer output shape)", () => {
    const legacy = { examId: "L", title: "قديم", sections: [{ id: "s", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q", presentationType: "shortAnswer", text: "x", marks: 1, answer: { text: "a" } }] }] };
    expect(sanitizeExamForStudent(legacy)).toEqual({ examId: "L", title: "قديم", revisionHistory: [], sections: [{ id: "s", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "q", presentationType: "shortAnswer", text: "x", marks: 1, answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: [] }] }] });
  });
});
