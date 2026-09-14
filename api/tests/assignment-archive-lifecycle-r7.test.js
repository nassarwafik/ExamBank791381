import { describe, it, expect, beforeEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as assignmentHandler } from "../src/functions/student-assignment.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { normalizeAssignmentStatus, applyAssignmentArchive, applyAssignmentRestore } from "../src/lib/assignment-lifecycle.js";

// Roadmap #7 — assignment archive/restore/purge lifecycle. Deterministic tests over an in-memory blob
// store through each handler's DI seam.

const AID = "asg1";
const AP = "platform/assignments/" + AID + ".json";
const SUB = "platform/submissions/" + AID + "/";
class StorageConflictError extends Error {}

let store, audits;
function seedAssignment(over = {}) {
  store.set(AP, { schemaVersion: 2, attemptModelVersion: 2, assignmentId: AID, classId: "c1", className: "الحادي عشر", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 60, sourceExamId: "", sourceExamTitle: "امتحان", questionCount: 1, totalMarks: 10, examSnapshot: { title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10, answer: { text: "SECRET" } }] }, createdBy: "t1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
}
function manageDeps(extra = {}) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null),
    uploadJson: async (_c, k, v) => { store.set(k, structuredClone(v)); },
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix) && k.endsWith(".json")).map(([, v]) => structuredClone(v)),
    listBlobNames: async (_c, prefix) => [...store.keys()].filter(k => k.startsWith(prefix) && k.endsWith(".json")),
    deleteBlob: async (_c, k) => { store.delete(k); },
    mutateJsonWithRetry: async (_c, k, fn) => { const cur = store.has(k) ? structuredClone(store.get(k)) : null; const next = await fn(cur); store.set(k, structuredClone(next)); return next; },
    StorageConflictError,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    ...extra
  };
}
const post = (body, deps = manageDeps()) => manageHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => body }, deps);

beforeEach(() => { store = new Map(); audits = []; });

describe("R7 lifecycle lib (pure)", () => {
  it("normalize: unknown => draft, never auto-published", () => {
    expect(normalizeAssignmentStatus({ status: "published" })).toBe("published");
    expect(normalizeAssignmentStatus({ status: "archived" })).toBe("archived");
    expect(normalizeAssignmentStatus({ status: "weird" })).toBe("draft");
    expect(normalizeAssignmentStatus({})).toBe("draft");
  });
  it("archive remembers prior status + stamps metadata; restore returns to it and clears metadata", () => {
    const arch = applyAssignmentArchive({ status: "published", title: "x" }, { actor: "t1", now: "N" });
    expect(arch.status).toBe("archived"); expect(arch.archivedFromStatus).toBe("published"); expect(arch.archivedBy).toBe("t1"); expect(arch.archivedAt).toBe("N");
    const rest = applyAssignmentRestore(arch, { now: "N2" });
    expect(rest.status).toBe("published"); expect("archivedAt" in rest).toBe(false); expect("archivedFromStatus" in rest).toBe(false);
  });
  it("restore of a legacy archived doc (no archivedFromStatus) => draft (never auto-publish)", () => {
    expect(applyAssignmentRestore({ status: "archived" }, { now: "N" }).status).toBe("draft");
  });
});

describe("R7 archive", () => {
  it("A: published archive => status archived, archivedFromStatus published; audit recorded", async () => {
    seedAssignment({ status: "published" });
    const r = await post({ action: "archive", assignmentId: AID });
    expect(r.status).toBe(200); expect(r.jsonBody.archived).toBe(true);
    expect(store.get(AP).status).toBe("archived");
    expect(store.get(AP).archivedFromStatus).toBe("published");
    expect(r.jsonBody.assignment.status).toBe("archived");
    expect(audits.some(e => e.action === "assignment.archive" && e.details.previousStatus === "published")).toBe(true);
  });
  it("B: draft archive => status archived, archivedFromStatus draft", async () => {
    seedAssignment({ status: "draft" });
    await post({ action: "archive", assignmentId: AID });
    expect(store.get(AP).status).toBe("archived");
    expect(store.get(AP).archivedFromStatus).toBe("draft");
  });
  it("C: archive preserves examSnapshot and all core fields", async () => {
    seedAssignment({ status: "published" });
    await post({ action: "archive", assignmentId: AID });
    const a = store.get(AP);
    expect(a.examSnapshot.questions[0].answer.text).toBe("SECRET"); // untouched
    expect(a.durationMinutes).toBe(60); expect(a.maxAttempts).toBe(1); expect(a.attemptModelVersion).toBe(2);
  });
  it("D/E: archive preserves completed + active + draft submission documents untouched", async () => {
    seedAssignment({ status: "published" });
    const completed = { assignmentId: AID, studentId: "s1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "T", score: 5, totalMarks: 10, percentage: 50, finalized: true }], activeAttempt: null, draftAnswers: {} };
    const active = { assignmentId: AID, studentId: "s2", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", status: "started" }, draftAnswers: { q1: { kind: "text", value: "a" } }, draftSavedAt: "T" };
    store.set(SUB + "s1.json", completed); store.set(SUB + "s2.json", active);
    await post({ action: "archive", assignmentId: AID, confirmActiveAttempts: true });
    expect(store.get(SUB + "s1.json")).toEqual(completed);
    expect(store.get(SUB + "s2.json")).toEqual(active); // activeAttempt/draft untouched
  });
  it("F: active attempts require explicit confirmActiveAttempts (409 requiresConfirmation)", async () => {
    seedAssignment({ status: "published" });
    store.set(SUB + "s2.json", { assignmentId: AID, studentId: "s2", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", status: "started" } });
    const r = await post({ action: "archive", assignmentId: AID });
    expect(r.status).toBe(409); expect(r.jsonBody.requiresConfirmation).toBe(true); expect(r.jsonBody.impact.activeAttempts).toBe(1);
    expect(store.get(AP).status).toBe("published"); // not archived without confirmation
  });
  it("G: confirmed archive does not alter the active attempt", async () => {
    seedAssignment({ status: "published" });
    const active = { assignmentId: AID, studentId: "s2", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", status: "started" } };
    store.set(SUB + "s2.json", structuredClone(active));
    const r = await post({ action: "archive", assignmentId: AID, confirmActiveAttempts: true });
    expect(r.status).toBe(200); expect(store.get(SUB + "s2.json")).toEqual(active);
  });
  it("H: legacy action:'delete' ARCHIVES (blob still exists), never physical deletion", async () => {
    seedAssignment({ status: "published" });
    const r = await post({ action: "delete", assignmentId: AID });
    expect(r.status).toBe(200); expect(r.jsonBody.legacyDeleteRedirected).toBe(true); expect(r.jsonBody.archived).toBe(true);
    expect(store.has(AP)).toBe(true);                 // NOT deleted
    expect(store.get(AP).status).toBe("archived");
    expect(audits.some(e => e.action === "assignment.archive" && e.details.requestedAction === "delete")).toBe(true);
  });
  it("archive is idempotent (already archived => alreadyArchived, no metadata rewrite)", async () => {
    seedAssignment({ status: "archived", archivedAt: "ORIG", archivedFromStatus: "published" });
    const r = await post({ action: "archive", assignmentId: AID });
    expect(r.status).toBe(200); expect(r.jsonBody.alreadyArchived).toBe(true);
    expect(store.get(AP).archivedAt).toBe("ORIG");
  });
});

describe("R7 restore", () => {
  it("W: restore a published-origin archived assignment => published", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published", archivedAt: "T" });
    const r = await post({ action: "restore", assignmentId: AID });
    expect(r.status).toBe(200); expect(r.jsonBody.restored).toBe(true); expect(store.get(AP).status).toBe("published");
    expect("archivedAt" in store.get(AP)).toBe(false);
    expect(audits.some(e => e.action === "assignment.restore" && e.details.restoredStatus === "published")).toBe(true);
  });
  it("X: restore a draft-origin archived assignment => draft", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "draft", archivedAt: "T" });
    await post({ action: "restore", assignmentId: AID });
    expect(store.get(AP).status).toBe("draft");
  });
  it("Y: restore a legacy archived assignment (no archivedFromStatus) => draft", async () => {
    seedAssignment({ status: "archived" });
    await post({ action: "restore", assignmentId: AID });
    expect(store.get(AP).status).toBe("draft");
  });
  it("restore of a non-archived assignment => 409", async () => {
    seedAssignment({ status: "published" });
    expect((await post({ action: "restore", assignmentId: AID })).status).toBe(409);
  });
});

describe("R7 setstatus / setmaxattempts hardening", () => {
  it("Z: setstatus cannot archive (status:'archived' => 400)", async () => {
    seedAssignment({ status: "published" });
    expect((await post({ action: "setStatus", assignmentId: AID, status: "archived" })).status).toBe(400);
    expect(store.get(AP).status).toBe("published");
  });
  it("AA: setstatus on an archived assignment is rejected (must restore first, 409)", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    expect((await post({ action: "setStatus", assignmentId: AID, status: "published" })).status).toBe(409);
    expect(store.get(AP).status).toBe("archived");
  });
  it("AB: setmaxattempts on an archived assignment is blocked (409)", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    expect((await post({ action: "setMaxAttempts", assignmentId: AID, maxAttempts: 3 })).status).toBe(409);
    expect(store.get(AP).maxAttempts).toBe(1);
  });
});

describe("R7 deleteImpact", () => {
  it("AC: counts submissionDocuments / completedAttempts / activeAttempts / draftDocuments", async () => {
    seedAssignment({ status: "published" });
    store.set(SUB + "s1.json", { attempts: [{ attemptNumber: 1 }, { attemptNumber: 2 }], activeAttempt: null, draftAnswers: {} }); // 2 completed
    store.set(SUB + "s2.json", { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z" }, draftAnswers: {} }); // active
    store.set(SUB + "s3.json", { attempts: [], activeAttempt: null, draftAnswers: { q1: { kind: "text", value: "x" } }, draftSavedAt: "T" }); // draft only
    const r = await post({ action: "deleteImpact", assignmentId: AID });
    const im = r.jsonBody.impact;
    expect(im.submissionDocuments).toBe(3);
    expect(im.completedAttempts).toBe(2);
    expect(im.studentsWithCompletedAttempts).toBe(1);
    expect(im.activeAttempts).toBe(1);
    expect(im.draftDocuments).toBe(1);
    expect(im.canPurge).toBe(false); // not archived + has history
  });
});

describe("R7 purge", () => {
  it("AD: purge of a non-archived assignment is rejected (409); blob remains", async () => {
    seedAssignment({ status: "published" });
    const r = await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" });
    expect(r.status).toBe(409); expect(store.has(AP)).toBe(true);
  });
  it("AE: purge blocked by a completed submission (blockedByHistory)", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    store.set(SUB + "s1.json", { attempts: [{ attemptNumber: 1 }] });
    const r = await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" });
    expect(r.status).toBe(409); expect(r.jsonBody.blockedByHistory).toBe(true); expect(store.has(AP)).toBe(true);
  });
  it("AF: purge blocked by a draft-only submission", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    store.set(SUB + "s1.json", { attempts: [], activeAttempt: null, draftAnswers: { q1: 1 }, draftSavedAt: "T" });
    expect((await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" })).status).toBe(409);
    expect(store.has(AP)).toBe(true);
  });
  it("AG: purge blocked by an active-attempt submission", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    store.set(SUB + "s1.json", { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z" } });
    expect((await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" })).status).toBe(409);
    expect(store.has(AP)).toBe(true);
  });
  it("AH: purge confirmation mismatch rejected (400)", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    expect((await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "wrong" })).status).toBe(400);
    expect((await post({ action: "purge", assignmentId: AID, confirmAssignmentId: "nope", confirmTitle: "واجب" })).status).toBe(400);
    expect(store.has(AP)).toBe(true);
  });
  it("AI: purge of an archived, zero-history assignment with exact confirmation succeeds", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    const r = await post({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" });
    expect(r.status).toBe(200); expect(r.jsonBody.purged).toBe(true);
    expect(store.has(AP)).toBe(false); // physically deleted (only the assignment blob)
    expect(audits.some(e => e.action === "assignment.purge" && e.details.previousStatus === "archived")).toBe(true);
  });
  it("AJ: purge race — a submission appearing just before the delete aborts the purge (assignment remains)", async () => {
    seedAssignment({ status: "archived", archivedFromStatus: "published" });
    const deleted = [];
    // Simulate a student submission that lands between the teacher's earlier impact check and this purge:
    // the purge's own pre-delete re-list must SEE it and abort.
    const racingDeps = manageDeps({
      listBlobNames: async (_c, prefix) => (prefix.startsWith(SUB) ? [SUB + "sX.json"] : [...store.keys()].filter(k => k.startsWith(prefix))),
      listJson: async () => [{ attempts: [{ attemptNumber: 1 }] }],
      deleteBlob: async (_c, k) => { deleted.push(k); store.delete(k); }
    });
    const r = await postWithRacing({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" }, racingDeps);
    expect(r.status).toBe(409); expect(r.jsonBody.blockedByHistory).toBe(true);
    expect(deleted).toHaveLength(0);      // nothing deleted
    expect(store.has(AP)).toBe(true);     // assignment remains
  });
});
function postWithRacing(body, deps) { return manageHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => body }, deps); }

// ── student-submission — archived/draft blocks writes; GET stays readable ────
const SP = "platform/submissions/" + AID + "/stu-1.json";
function subDeps() {
  const s = new Map();
  s.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  s.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  return { s, deps: {
    requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (s.has(k) ? structuredClone(s.get(k)) : null),
    mutateJsonWithRetry: async (_c, k, fn) => { const cur = s.has(k) ? structuredClone(s.get(k)) : null; const next = await fn(cur); s.set(k, next); return next; },
    StorageConflictError, gradeExam: () => ({ score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }), recordAchievementIfEligible: async () => {}
  } };
}
const sCall = (deps, action) => submissionHandler({ method: "POST", params: { assignmentId: AID }, json: async () => ({ action }) }, deps);

describe("R7 student-submission archived gate", () => {
  it("K: GET remains readable while archived (historical review)", async () => {
    const { s, deps } = subDeps();
    s.set(AP, { assignmentId: AID, classId: "c1", status: "archived", durationMinutes: 60, attemptModelVersion: 2, examSnapshot: {} });
    s.set(SP, { assignmentId: AID, studentId: "stu-1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "T", score: 5, totalMarks: 10, percentage: 50, finalized: true }], activeAttempt: null });
    const r = await submissionHandler({ method: "GET", params: { assignmentId: AID }, json: async () => ({}) }, deps);
    expect(r.status).toBe(200); expect(r.jsonBody.state.latestResult.score).toBe(5);
  });
  for (const action of ["startAttempt", "saveDraft", "submit", "finalizeTimedOutAttempt"]) {
    it(`L/M/N/O: ${action} while archived => 403`, async () => {
      const { s, deps } = subDeps();
      s.set(AP, { assignmentId: AID, classId: "c1", status: "archived", durationMinutes: 60, attemptModelVersion: 2, examSnapshot: {} });
      const r = await sCall(deps, action);
      expect(r.status).toBe(403); expect(r.jsonBody.error).toBe("الواجب غير متاح حاليًا.");
    });
  }
});

describe("R7 student-assignment archived body gate", () => {
  it("J: an archived assignment returns 404 and never exposes the exam body", async () => {
    const s = new Map();
    s.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
    s.set("platform/classes/c1.json", { classId: "c1", status: "active" });
    s.set(AP, { assignmentId: AID, classId: "c1", status: "archived", durationMinutes: 60, attemptModelVersion: 2, examSnapshot: { sections: [{ id: "s", questions: [{ text: "SECRET-BODY" }] }] } });
    const deps = { requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }), getContainer: () => ({}), downloadJsonOrNull: async (_c, k) => (s.has(k) ? structuredClone(s.get(k)) : null) };
    const r = await assignmentHandler({ method: "GET", params: { assignmentId: AID }, json: async () => ({}) }, deps);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.jsonBody)).not.toContain("SECRET-BODY");
  });
});

// ── assignment-results — teacher B2B actions blocked while archived; GET works ─
function resDeps() {
  const s = new Map();
  s.set(AP, { assignmentId: AID, classId: "c1", status: "archived", archivedFromStatus: "published", maxAttempts: 1, durationMinutes: 60, dueAt: "", title: "واجب", totalMarks: 10 });
  s.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  s.set("platform/submissions/" + AID + "/stu-1.json", { assignmentId: AID, studentId: "stu-1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "T", score: 5, totalMarks: 10, percentage: 50, finalized: true }], activeAttempt: null });
  return { s, deps: {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (s.has(k) ? structuredClone(s.get(k)) : null),
    listJson: async (_c, prefix) => [...s.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c, k, fn) => { const cur = s.has(k) ? structuredClone(s.get(k)) : null; const next = await fn(cur); s.set(k, next); return next; },
    StorageConflictError, recordAuditEvent: async () => {}
  } };
}
const resPost = (deps, body) => resultsHandler({ method: "POST", url: "http://x/assignment-results", json: async () => body }, deps);

describe("R7 assignment-results archived block", () => {
  it("P: GET results still works while archived", async () => {
    const { deps } = resDeps();
    const r = await resultsHandler({ method: "GET", url: "http://x/assignment-results?assignmentId=" + AID, json: async () => ({}) }, deps);
    expect(r.status).toBe(200); expect(r.jsonBody.students).toHaveLength(1);
  });
  for (const [label, body] of [["Q allowRetry", { action: "allowRetry" }], ["R reopenStudent", { action: "reopenStudent", reopenUntil: "2026-02-01T00:00:00.000Z" }], ["S setDueAtOverride", { action: "setDueAtOverride", dueAtOverride: "2026-02-01T00:00:00.000Z" }], ["T extendActiveAttempt", { action: "extendActiveAttempt", newEndsAt: "2026-02-01T00:00:00.000Z" }]]) {
    it(`${label} while archived => 409`, async () => {
      const { deps } = resDeps();
      const r = await resPost(deps, { assignmentId: AID, studentId: "stu-1", ...body });
      expect(r.status).toBe(409);
      expect(r.jsonBody.error).toContain("مؤرشف");
    });
  }
});
