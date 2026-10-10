import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Hotfix — the teacher review payload carried the chart / function-graph configurations but NOT scene3DSelection (Phase 21C): the review
// screen's Scene3DSelectionReview received no scene, so the teacher could not see the 3D question the student answered (the score itself
// stays server-computed). Fail-first on bb14d0c / 8ff966f, through the REAL submission and review handlers.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const q3d = () => JSON.parse(fs.readFileSync(path.join(root, "docs/fixtures/interactive-3d-21c/ExamBank_21C_Interactive_3D_Acceptance.json"), "utf8")).sections[3].questions[0];

describe("hotfix — the teacher review carries the 3D scene configuration", () => {
  it("submit a 3D answer, then the review question carries scene3DSelection (with the key and the student's targets)", async () => {
    const q = q3d();
    const ctx = F.seed({ a: F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [q] }] }, totalMarks: q.marks, questionCount: 1 }) });
    const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-hf", role: "teacher" } }), getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() };
    const answer = { kind: "scene3DSelection", sceneId: q.scene3DSelection.scene.id, targets: ["object:leftVentricle"] };
    const s = await require_("../src/functions/student-submission.js").handler(F.studentRequest(F.submitBody({ [q.examQuestionId]: answer })), deps, { logInfo() {}, logWarn() {}, logError() {} });
    expect(s.status).toBe(200);
    const rv = await require_("../src/functions/assignment-review.js").handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps);
    expect(rv.status).toBe(200);
    const r = rv.jsonBody.questions.find(x => x.questionId === q.examQuestionId);
    expect(r.studentAnswer).toEqual(answer);
    expect(r.expectedAnswer).toEqual(q.answer);
    expect(r.scene3DSelection).toEqual(q.scene3DSelection);
  });
});
