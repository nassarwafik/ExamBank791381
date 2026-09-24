import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { handler as assignmentHandler } from "../src/functions/student-assignment.js";

// Hidden question media must never reach the student. The student browser is student-controlled: anything the
// API returns is visible to the student, whether or not the React renderer draws it. These tests inspect the
// SERIALIZED student payload produced by the real sanitizer (and by the real student-assignment endpoint).
//
// Media model (examTypes BuilderQuestion; renderer StudentQuestionCard.imageList; editor questionMedia):
//   image:  { exists, visible, assets:[{ dataUrl, … }] }  — the canonical image; the teacher's hide/show sets `visible`
//   images: [{ dataUrl, … }]                               — the legacy fallback, rendered only when the canonical
//                                                            image is not shown
// Canonical HIDDEN = exists && assets non-empty && visible === false (exactly the editor's isImageHidden).

const png = tag => "data:image/png;base64," + Buffer.from(tag).toString("base64");
const HIDDEN = png("HIDDEN-BYTES"), SHOWN = png("SHOWN-BYTES"), LEGACY = png("LEGACY-BYTES");
const exam = questions => ({ examId: "e1", title: "t", sections: [{ id: "s1", title: "S", gradingPolicy: "all", questions }] });
const q = (over = {}) => ({ examQuestionId: "q1", presentationType: "shortAnswer", text: "t", marks: 1, answer: { text: "SECRET-ANSWER" }, ...over });
const payload = x => JSON.stringify(sanitizeExamForStudent(x));
const studentQ = x => sanitizeExamForStudent(x).sections[0].questions[0];

describe("hidden question media never reaches the student payload", () => {
  it("A hidden modern image: no dataUrl / bytes in the student payload", () => {
    const x = exam([q({ image: { exists: true, visible: false, origin: "uploaded", assets: [{ id: "a1", dataUrl: HIDDEN, contentType: "image/png" }] } })]);
    expect(payload(x)).not.toContain(HIDDEN);
    expect(payload(x)).not.toContain("dataUrl");
    expect(studentQ(x).image).toEqual({ exists: true, visible: false });
  });

  it("B visible modern image: kept exactly (legitimate images are not removed)", () => {
    const x = exam([q({ image: { exists: true, visible: true, assets: [{ id: "a1", dataUrl: SHOWN, contentType: "image/png" }] } })]);
    expect(studentQ(x).image).toEqual({ exists: true, visible: true, assets: [{ id: "a1", dataUrl: SHOWN, contentType: "image/png" }] });
  });

  it("C hidden canonical + legacy images[]: neither the hidden bytes nor the fallback reach the student", () => {
    const x = exam([q({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] })]);
    const s = payload(x);
    expect(s).not.toContain(HIDDEN);
    expect(s).not.toContain(LEGACY);
    expect(studentQ(x).images).toEqual([]);
  });

  it("D legacy-only images[] (no canonical image, or the legacy default {exists:false}) still reach the student", () => {
    // incl. a malformed {exists,visible} without an assets array: the renderer falls back to images[] — unchanged.
    for (const image of [undefined, { exists: false, visible: false, origin: null, assets: [], prompt: null }, { exists: true, visible: true }]) {
      const x = exam([q({ ...(image ? { image } : {}), images: [{ dataUrl: LEGACY }] })]);
      expect(studentQ(x).images).toEqual([{ dataUrl: LEGACY }]);
    }
  });

  it("D' a shown canonical image shadows images[] (never rendered) — only the rendered image is sent", () => {
    const x = exam([q({ image: { exists: true, visible: true, assets: [{ dataUrl: SHOWN }] }, images: [{ dataUrl: LEGACY }] })]);
    expect(studentQ(x).image.assets).toEqual([{ dataUrl: SHOWN }]);
    expect(payload(x)).not.toContain(LEGACY);
  });

  it("a hidden image on a compound PART and on a legacy flat exam question is stripped the same way", () => {
    const flat = { examId: "e", questions: [q({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] })] };
    expect(JSON.stringify(sanitizeExamForStudent(flat))).not.toContain(HIDDEN);
    expect(JSON.stringify(sanitizeExamForStudent(flat))).not.toContain(LEGACY);
    const compound = exam([q({ presentationType: "compound", parts: [{ id: "p1", type: "shortAnswer", text: "p", answer: { text: "PART-SECRET" }, image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] }] })]);
    const part = studentQ(compound).parts[0];
    expect(JSON.stringify(part)).not.toContain(HIDDEN);
    expect(JSON.stringify(part)).not.toContain(LEGACY);
  });

  it("the teacher's stored exam is never modified (hiding is not deletion)", () => {
    const x = exam([q({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] })]);
    const before = JSON.stringify(x);
    sanitizeExamForStudent(x);
    expect(JSON.stringify(x)).toBe(before);
  });

  it("F answer sanitization is unchanged next to the media rule", () => {
    const x = exam([
      q({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN, prompt: "P" }], prompt: "P" }, hint: "H", teacherNote: "N" }),
      { examQuestionId: "q2", presentationType: "multipleChoice", text: "m", marks: 1, options: [{ text: "a", correct: true }, { text: "b" }], answer: { correctOptionIndex: 0 } },
      { examQuestionId: "q3", presentationType: "compound", text: "c", marks: 2, parts: [{ id: "p", type: "fields", answer: { x: 1 }, fields: [{ id: "f", correct: "CORRECT-FIELD" }] }] }
    ]);
    const out = sanitizeExamForStudent(x).sections[0].questions;
    expect(out[0].answer).toEqual({});
    expect(out[1].answer).toEqual({});
    expect(out[1].options[0]).toEqual({ text: "a" });
    expect(out[2].parts[0].answer).toBeUndefined();
    expect(out[2].parts[0].fields[0]).toEqual({ id: "f" });
    const s = JSON.stringify(out);
    for (const secret of ["SECRET-ANSWER", "CORRECT-FIELD", "\"prompt\"", "\"hint\":\"H\"", "\"teacherNote\":\"N\""]) expect(s).not.toContain(secret);
  });
});

describe("the real student endpoint (GET /api/student-assignment) enforces it", () => {
  function deps(examSnapshot) {
    const store = new Map([
      ["platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" }],
      ["platform/classes/c1.json", { classId: "c1", status: "active" }],
      ["platform/assignments/asg1.json", { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 1, durationMinutes: 0, title: "امتحان", questionCount: 1, totalMarks: 1, dueAt: new Date(Date.now() + 3600_000).toISOString(), examSnapshot }]
    ]);
    return { requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }), getContainer: () => ({}), downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null) };
  }
  const get = { method: "GET", params: { assignmentId: "asg1" }, json: async () => ({}) };

  it("hidden image (+ legacy fallback) bytes are absent from the HTTP response; a visible image is present", async () => {
    const hidden = await assignmentHandler(get, deps(exam([q({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] })])));
    expect(hidden.status).toBe(200);
    const body = JSON.stringify(hidden.jsonBody);
    expect(body).toContain("\"examQuestionId\":\"q1\"");
    expect(body).not.toContain(HIDDEN);
    expect(body).not.toContain(LEGACY);
    const shown = await assignmentHandler(get, deps(exam([q({ image: { exists: true, visible: true, assets: [{ dataUrl: SHOWN }] } })])));
    expect(JSON.stringify(shown.jsonBody)).toContain(SHOWN);
  });
});
