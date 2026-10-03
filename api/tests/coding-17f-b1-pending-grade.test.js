import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17F-B1 — server side of "TECHNICAL GRADING DELAY ≠ ACADEMIC ZERO". The UI shows a neutral headline ONLY from the
// server's authoritative aggregate (autoGradingStatus / legacy autoGradingPending); these tests pin the server contract the
// UI relies on, and that the student projection gains nothing teacher-only.
//   UX7  a teacher override of the coding question → NO open status is projected (17E-D F3), so the mark (even 0) is shown
//   UX10 the student result projection never carries teacher-only coding evidence or internals
//   plus: an outage (retryable) keeps the score provisional and the aggregate open — the UI's only trigger for the dash
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const official = () => require_("../src/lib/coding/official-grading.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const PUBLIC_RESULT_KEYS = new Set(["attemptNumber", "submittedAt", "score", "totalMarks", "percentage", "manualReviewMarks", "finalized", "gradingStatus", "teacherFeedback", "timedOut", "startedAt", "endsAt", "extendedEndsAt", "endedAt", "endReason", "pauseCount", "autoGradingPending", "autoGradingStatus"]);
const TEACHER_ONLY = /cg_[A-Za-z0-9_-]{8,}|"jobId"|targetRef|"revision"|technicalCode|gradingKey|answerHash|questionFingerprint|"cases"|passedCount|testCount|passedWeight|automaticScore|effectiveScore|compilePreview|"delivery"|lease|automaticAttempts|exhausted|"recovery"|"override"|callback|runner|HMAC|EXECUTION_|RUNNER_|stdout|stderr|expected/;
const attemptWith = (targets, over = {}) => ({ codingGrading: { version: 1, targets }, ...over });
const T = (state, over = {}) => ({ mode: "hiddenTests", state, revision: 1, jobId: "cg_ABCDEFGHIJKLMNOPQRST", gradingKey: "k".repeat(64), updatedAt: new Date().toISOString(), ...over });

describe("17F-B1 UX7 — a teacher override removes the open state from the student projection (the 0 is then a real, authoritative 0)", () => {
  it("retryable target + manual override of the same question → autoGradingStatus undefined and autoGradingPending false", () => {
    const o = official();
    const overridden = attemptWith({ q1: T("retryable", { technicalCode: "EXECUTION_UNAVAILABLE" }) }, { manualOverrides: { q1: { score: 0 } } });
    expect(o.studentCodingGradingStatus(overridden)).toBeUndefined();
    expect(o.autoGradingPending(overridden)).toBe(false);
    // without the override the same attempt is OPEN (retrying) — the ONLY trigger of the neutral headline
    const open = attemptWith({ q1: T("retryable", { technicalCode: "EXECUTION_UNAVAILABLE" }) });
    expect(o.studentCodingGradingStatus(open)).toBe("retrying");
    expect(o.autoGradingPending(open)).toBe(true);
  });
  it("every open state the UI withholds for is exactly the server vocabulary: queued / processing / retrying / delayed; complete is not open", () => {
    const o = official();
    expect(o.studentCodingGradingStatus(attemptWith({ q1: T("pending") }))).toBe("queued");
    expect(o.studentCodingGradingStatus(attemptWith({ q1: T("dispatched") }))).toBe("processing");
    expect(o.studentCodingGradingStatus(attemptWith({ q1: T("retryable") }))).toBe("retrying");
    expect(o.studentCodingGradingStatus(attemptWith({ q1: T("retryable", { recovery: { exhausted: true } }) }))).toBe("delayed");
    expect(o.studentCodingGradingStatus(attemptWith({ q1: T("complete", { result: { outcome: "scored" } }) }))).toBe("complete");
  });
});

describe("17F-B1 UX10 — the student result projection gains nothing teacher-only (real handler, runner outage)", () => {
  it("submit while the runner is down → provisional, open, and only the public key set", async () => {
    const ctx = F.seed();
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch("throw") };
    const r = await submission().handler(F.studentRequest(F.submitBody({ auto1: F.code("print(1)\n"), sa1: { kind: "text", value: "x" } })), deps, quiet);
    expect(r.status).toBe(200);
    const g = await submission().handler(F.studentRequest(null, "GET"), deps, quiet);
    const lr = g.jsonBody.state.latestResult;
    expect(lr.autoGradingStatus).toBe("retrying");
    expect(lr.autoGradingPending).toBe(true);
    expect(lr.gradingStatus).toBe("pendingReview");
    expect(lr.finalized).toBe(false);
    for (const k of Object.keys(lr)) expect(PUBLIC_RESULT_KEYS.has(k), "unexpected public key " + k).toBe(true);
    expect(JSON.stringify(g.jsonBody)).not.toMatch(TEACHER_ONLY);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(TEACHER_ONLY);
  });
});
