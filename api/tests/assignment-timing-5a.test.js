import { describe, it, expect, beforeEach } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { attemptState, timerState, effectiveDueAt } from "../src/lib/assignment-availability.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5A — class-wide time & deadline extension (updateTiming). The class extension changes TIME
// AVAILABILITY only; the server-authoritative attempt lifecycle stays the sole authority. These tests prove:
//   • the shared availability authority (effectiveDueAt = max(dueAt, override); eligibility after extension);
//   • timed-attempt immutability (an already-started attempt keeps its authoritative end; a NEW attempt uses
//     the new default duration; a class dueAt extension never manufactures extra active-attempt time);
//   • the manage-assignments updateTiming action (auth/validation/persistence/no-mutation/CAS/audit);
//   • the student behaviour end-to-end (A/B/C over a shared store: an eligible student reopens, an exhausted
//     one does not, and no attempt array is ever touched).

const AID = "asg1";
const AP = "platform/assignments/" + AID + ".json";
const SUB = "platform/submissions/" + AID + "/";
const NOW = 1_700_000_000_000;              // fixed instant for the PURE helper tests
const iso = ms => new Date(ms).toISOString();
const MIN = 60000;
const future = ms => new Date(Date.now() + ms).toISOString();   // real-clock helpers for the handler (uses Date.now)
const past = ms => new Date(Date.now() - ms).toISOString();
class StorageConflictError extends Error {}

// ────────────────────────────────────────────────────────────────────────────
// 1) SHARED AVAILABILITY — eligibility after a class extension (pure attemptState)
// ────────────────────────────────────────────────────────────────────────────
const asg = (extra = {}) => ({ status: "published", maxAttempts: 2, attemptModelVersion: 2, ...extra });
const completed = n => ({ attemptNumber: n, submittedAt: iso(NOW), score: 5, totalMarks: 10, percentage: 50, finalized: true });

describe("Phase 5A availability — expired → extended eligibility (maxAttempts 2)", () => {
  const expired = asg({ dueAt: iso(NOW - 1000) });
  const extended = asg({ dueAt: iso(NOW + 10 * MIN) });
  const subA = { attempts: [] };
  const subB = { attempts: [completed(1)] };
  const subC = { attempts: [completed(1), completed(2)] };

  it("before extension: every student is CLOSED (deadline passed) — none may start", () => {
    for (const s of [subA, subB, subC]) {
      const st = attemptState(expired, s, NOW);
      expect(st.availability).toBe("closed");
      expect(st.canAttempt).toBe(false);
    }
  });
  it("A (0 attempts) after extension: attemptsUsed 0, allowedAttempts 2, eligible for attempt 1", () => {
    const st = attemptState(extended, subA, NOW);
    expect(st.availability).toBe("open");
    expect(st.attemptsUsed).toBe(0);
    expect(st.allowedAttempts).toBe(2);
    expect(st.canAttempt).toBe(true);
  });
  it("B (1 of 2 used) after extension: attemptsUsed 1, allowedAttempts 2, eligible for attempt 2", () => {
    const st = attemptState(extended, subB, NOW);
    expect(st.availability).toBe("open");
    expect(st.attemptsUsed).toBe(1);
    expect(st.allowedAttempts).toBe(2);
    expect(st.canAttempt).toBe(true);
  });
  it("C (2 of 2 used) after extension: OPEN by date but attempts EXHAUSTED — cannot start another", () => {
    const st = attemptState(extended, subC, NOW);
    expect(st.availability).toBe("open");     // availability is open …
    expect(st.attemptsUsed).toBe(2);
    expect(st.allowedAttempts).toBe(2);
    expect(st.canAttempt).toBe(false);        // … but eligibility is false (exhausted)
  });
  it("explicit per-student allowedAttempts > maxAttempts is preserved after extension", () => {
    // maxAttempts 1, but the teacher previously granted this student a 2nd attempt; 1 used → still eligible.
    const st = attemptState(asg({ maxAttempts: 1, dueAt: iso(NOW + 10 * MIN) }), { allowedAttempts: 2, attempts: [completed(1)] }, NOW);
    expect(st.allowedAttempts).toBe(2);
    expect(st.attemptsUsed).toBe(1);
    expect(st.canAttempt).toBe(true);
  });
});

describe("Phase 5A availability — effectiveDueAt = max(dueAt, override) (extension-only overrides)", () => {
  const G15 = iso(NOW + 15 * MIN), O12 = iso(NOW + 12 * MIN), O18 = iso(NOW + 18 * MIN);
  it("global 15 / override 12 → 15 (class extension overtakes an older override)", () => {
    expect(effectiveDueAt(asg({ dueAt: G15 }), { dueAtOverride: O12 })).toBe(G15);
  });
  it("global 15 / override 18 → 18 (a longer accommodation survives the class extension)", () => {
    expect(effectiveDueAt(asg({ dueAt: G15 }), { dueAtOverride: O18 })).toBe(O18);
  });
  it("global 15 / no override → 15; no global / valid override → override; malformed → safe (no throw)", () => {
    expect(effectiveDueAt(asg({ dueAt: G15 }), null)).toBe(G15);
    expect(effectiveDueAt(asg({ dueAt: "" }), { dueAtOverride: O12 })).toBe(O12);
    expect(() => effectiveDueAt(asg({ dueAt: "bad" }), { dueAtOverride: "worse" })).not.toThrow();
    expect(attemptState(asg({ dueAt: "bad" }), { dueAtOverride: "worse" }, NOW).availability).toBe("open");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2) TIMED ATTEMPTS — immutability of an already-started attempt (pure timerState)
// ────────────────────────────────────────────────────────────────────────────
describe("Phase 5A timed attempts — duration edit never touches a live attempt", () => {
  const activeSub = endsAt => ({ attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(NOW), endsAt, status: "started" } });
  it("changing the assignment default duration (30 → 60) does NOT recompute a started attempt's end", () => {
    const started = activeSub(iso(NOW + 30 * MIN));           // started under the 30-min default
    const before = timerState(asg({ durationMinutes: 30 }), started, NOW + 5 * MIN);
    expect(before.attemptDurationEndsAt).toBe(iso(NOW + 30 * MIN));
    // Teacher later edits the assignment default to 60 — the SAME stored attempt keeps its authoritative end.
    const after = timerState(asg({ durationMinutes: 60 }), started, NOW + 5 * MIN);
    expect(after.attemptDurationEndsAt).toBe(iso(NOW + 30 * MIN));   // NOT NOW+60
    expect(after.effectiveAttemptEndsAt).toBe(iso(NOW + 30 * MIN));
  });
  it("a class dueAt extension does not manufacture extra active-attempt duration (min(duration, due))", () => {
    const started = activeSub(iso(NOW + 30 * MIN));
    const clipped = timerState(asg({ durationMinutes: 30, dueAt: iso(NOW + 10 * MIN) }), started, NOW);
    expect(clipped.effectiveAttemptEndsAt).toBe(iso(NOW + 10 * MIN));    // due-clipped before extension
    const extended = timerState(asg({ durationMinutes: 30, dueAt: iso(NOW + 120 * MIN) }), started, NOW);
    expect(extended.effectiveAttemptEndsAt).toBe(iso(NOW + 30 * MIN));   // extension lifts the clip up to the duration only
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3) manage-assignments updateTiming — the class-wide timing action
// ────────────────────────────────────────────────────────────────────────────
function seedAssignment(over = {}) {
  return { schemaVersion: 2, attemptModelVersion: 2, assignmentId: AID, classId: "c1", className: "الحادي عشر", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: past(60 * MIN), maxAttempts: 2, durationMinutes: 30, sourceExamId: "", sourceExamTitle: "امتحان", questionCount: 1, totalMarks: 10, examSnapshot: { title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10, answer: { text: "SECRET" } }] }, createdBy: "t1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over };
}
let store, audits;
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
    withAssignmentLock: async (_c, _id, fn) => fn(),
    ...extra
  };
}
const post = (body, deps = manageDeps()) => manageHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => body }, deps);

beforeEach(() => { store = new Map(); audits = []; });

describe("Phase 5A updateTiming — backend action", () => {
  it("teacher auth is required (rejected request returns the auth response)", async () => {
    store.set(AP, seedAssignment());
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(60 * MIN) }, manageDeps({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "unauth" } } }) }));
    expect(r.status).toBe(401);
    expect(audits).toHaveLength(0);
  });
  it("unknown assignment → 404", async () => {
    const r = await post({ action: "updateTiming", assignmentId: "nope", dueAt: future(60 * MIN) });
    expect(r.status).toBe(404);
  });
  it("archived assignment → 409 (restore first)", async () => {
    const seeded = seedAssignment({ status: "archived" });
    store.set(AP, seeded);
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(60 * MIN) });
    expect(r.status).toBe(409);
    expect(store.get(AP).dueAt).toBe(seeded.dueAt);   // unchanged
    expect(audits).toHaveLength(0);
  });
  it("invalid date → 400", async () => {
    store.set(AP, seedAssignment());
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: "not-a-date" });
    expect(r.status).toBe(400);
    expect(audits).toHaveLength(0);
  });
  it("non-future extension (past date) → 400", async () => {
    store.set(AP, seedAssignment());
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: past(10 * MIN) });
    expect(r.status).toBe(400);
  });
  it("shortening an existing FUTURE deadline → 400 (extension-only)", async () => {
    store.set(AP, seedAssignment({ dueAt: future(120 * MIN) }));
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(30 * MIN) });
    expect(r.status).toBe(400);
  });
  it("success: persists dueAt; status / maxAttempts / examSnapshot untouched; audit emitted once", async () => {
    store.set(AP, seedAssignment());
    const newDue = future(120 * MIN);
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: newDue });
    expect(r.status).toBe(200);
    const a = store.get(AP);
    expect(a.dueAt).toBe(newDue);
    expect(r.jsonBody.assignment.dueAt).toBe(newDue);
    expect(a.status).toBe("published");                 // status unchanged
    expect(a.maxAttempts).toBe(2);                       // maxAttempts unchanged
    expect(a.examSnapshot).toEqual(seedAssignment().examSnapshot);   // examSnapshot unchanged
    expect(a.durationMinutes).toBe(30);                 // duration not supplied → unchanged
    const timing = audits.filter(e => e.action === "assignment.updateTiming");
    expect(timing).toHaveLength(1);
    expect(timing[0].details).toMatchObject({ assignmentId: AID, newDueAt: newDue, previousDurationMinutes: 30, newDurationMinutes: 30 });
    expect(timing[0].details).not.toHaveProperty("answer");   // no exam/student content in the audit
  });
  it("success: persists durationMinutes when supplied (60), and untimed (0) is accepted", async () => {
    store.set(AP, seedAssignment());
    const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(120 * MIN), durationMinutes: 60 });
    expect(r.status).toBe(200);
    expect(store.get(AP).durationMinutes).toBe(60);
    expect(r.jsonBody.assignment.durationMinutes).toBe(60);
    const r2 = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(130 * MIN), durationMinutes: 0 });
    expect(r2.status).toBe(200);
    expect(store.get(AP).durationMinutes).toBe(0);
  });
  it("invalid durationMinutes (fractional / >1440) → 400, nothing persisted", async () => {
    store.set(AP, seedAssignment());
    for (const bad of [1.5, 1441, -5]) {
      const r = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(120 * MIN), durationMinutes: bad });
      expect(r.status, String(bad)).toBe(400);
    }
    expect(store.get(AP).durationMinutes).toBe(30);   // untouched
  });
  it("no submission/attempt mutation — a seeded submission is byte-identical after updateTiming", async () => {
    store.set(AP, seedAssignment());
    const sub = { assignmentId: AID, studentId: "u1", classId: "c1", attempts: [completed(1)], activeAttempt: null, draftAnswers: { q1: "x" } };
    store.set(SUB + "u1.json", structuredClone(sub));
    await post({ action: "updateTiming", assignmentId: AID, dueAt: future(120 * MIN), durationMinutes: 45 });
    expect(store.get(SUB + "u1.json")).toEqual(sub);   // attempts / drafts / grades all unchanged
  });
  it("CAS conflict follows existing conventions → 503 (real mutate + persistent etag conflict)", async () => {
    // Drive the REAL platform-storage mutateJsonWithRetry against a memory container whose etag is bumped
    // before every conditional write, so the CAS retry loop exhausts and throws the module's own
    // StorageConflictError — proving updateTiming surfaces it as the standard 503, like the other actions.
    const audited = [];
    const mem = createMemoryContainer({ [AP]: seedAssignment() }, { beforeConditionalUpload: (name, api) => { if (name === AP) api.setJson(name, api.getJson(name)); } });
    const r = await manageHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "updateTiming", assignmentId: AID, dueAt: future(120 * MIN) }) }, {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
      getContainer: () => mem.container,
      recordAuditEvent: async (_c, ev) => { audited.push(ev); }
    });
    expect(r.status).toBe(503);
    expect(r.jsonBody.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.");
    expect(audited).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4) NEW attempt after a duration edit uses the NEW default duration (submission startAttempt)
// ────────────────────────────────────────────────────────────────────────────
describe("Phase 5A — a NEW attempt uses the edited default duration", () => {
  it("startAttempt after the default was raised to 60 stamps endsAt = start + 60 min", async () => {
    const s = new Map();
    s.set(AP, seedAssignment({ durationMinutes: 60, dueAt: future(180 * MIN) }));   // default already edited to 60
    const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي" };
    const deps = {
      requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
      downloadJsonOrNull: async (_c, k) => (s.has(k) ? structuredClone(s.get(k)) : null),
      mutateJsonWithRetry: async (_c, k, fn) => { const cur = s.has(k) ? structuredClone(s.get(k)) : null; const next = await fn(cur); s.set(k, structuredClone(next)); return next; },
      withAssignmentLock: async (_c, _id, fn) => fn(),
      StorageConflictError
    };
    const r = await submissionHandler({ method: "POST", url: "http://x", params: { assignmentId: AID }, headers: { get: () => null }, json: async () => ({ action: "startAttempt" }) }, deps);
    expect(r.status).toBe(200);
    const aa = r.jsonBody.state.activeAttempt;
    expect(new Date(aa.endsAt).getTime() - new Date(aa.startedAt).getTime()).toBe(60 * MIN);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5) STUDENT BEHAVIOUR END-TO-END — teacher extension over a shared store (A/B/C)
// ────────────────────────────────────────────────────────────────────────────
function dashDeps(sharedStore, student) {
  return {
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
    downloadJsonOrNull: async (_c, k) => (sharedStore.has(k) ? structuredClone(sharedStore.get(k)) : null),
    listJson: async (_c, prefix) => [...sharedStore.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v))
  };
}
const dashReq = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });
const card = async (sharedStore, userId) => {
  const r = await dashboardHandler(dashReq(), dashDeps(sharedStore, { userId, classId: "c1", code: userId, displayName: userId, active: true }));
  return r.jsonBody.assignments.find(a => a.assignmentId === AID);
};

describe("Phase 5A student behaviour — extension reopens only students with attempts left", () => {
  it("A/B/C: closed before extension; after a real teacher updateTiming A & B may start, C may not; no attempts touched", async () => {
    store.set(AP, seedAssignment({ maxAttempts: 2, durationMinutes: 0, dueAt: past(60 * MIN) }));   // expired
    store.set(SUB + "A.json", { assignmentId: AID, studentId: "A", classId: "c1", attempts: [], activeAttempt: null });
    store.set(SUB + "B.json", { assignmentId: AID, studentId: "B", classId: "c1", attempts: [completed(1)], activeAttempt: null });
    store.set(SUB + "C.json", { assignmentId: AID, studentId: "C", classId: "c1", attempts: [completed(1), completed(2)], activeAttempt: null });
    const snapshotB = structuredClone(store.get(SUB + "B.json"));
    const snapshotC = structuredClone(store.get(SUB + "C.json"));

    // before: deadline passed → nobody may start
    for (const u of ["A", "B", "C"]) {
      const c = await card(store, u);
      expect(c.availability).toBe("closed");
      expect(c.canAttempt).toBe(false);
    }

    // teacher extends the whole class into the future (one authoritative updateTiming)
    const ext = await post({ action: "updateTiming", assignmentId: AID, dueAt: future(120 * MIN) });
    expect(ext.status).toBe(200);

    // after: A (0/2) and B (1/2) reopen; C (2/2) stays unavailable
    const a = await card(store, "A"), b = await card(store, "B"), c = await card(store, "C");
    expect(a.availability).toBe("open"); expect(a.canAttempt).toBe(true);
    expect(b.availability).toBe("open"); expect(b.canAttempt).toBe(true);
    expect(c.availability).toBe("open"); expect(c.canAttempt).toBe(false);   // open by date, exhausted attempts

    // the extension NEVER touched any attempt array / grade
    expect(store.get(SUB + "B.json")).toEqual(snapshotB);
    expect(store.get(SUB + "C.json")).toEqual(snapshotC);
  });
});
