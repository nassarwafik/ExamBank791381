import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { normalizeToolUsage, mergeToolUsage, toolUsageForTeacher, draftToolUsageCounts, MAX_OPENS } from "../src/lib/student-tool-usage.js";

// Phase T8 — the record of which student tools a student opened during an attempt (docs/enterprise-student-tools-t.md §15).
//
// The client only REPORTS cumulative counts; the API keeps only tools the published exam offers, never lets a count go down, stamps the
// times itself, and shows the record to the teacher in the review. It never touches grading or the student's result projection.
// Every route test runs the REAL handlers on the in-memory blob store with the REAL grader.

const S1 = "11111111-1111-1111-1111-111111111111";
const CID = "c1";
const MIN = 60000;
const T0 = Date.UTC(2026, 10, 18, 8, 0, 0);
const iso = ms => new Date(ms).toISOString();
const TOOLS = { version: 1, tools: [{ id: "calculator", variant: "scientific", angleUnit: "deg" }, { id: "scratchPad", drawing: true }] };
const EXAM = { studentTools: TOOLS, questions: [
  { examQuestionId: "q1", presentationType: "multipleChoice", text: "س1", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } },
  { examQuestionId: "q2", presentationType: "multipleChoice", text: "س2", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } }
] };
const A1 = { kind: "choice", index: 0 };

let ctx;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: CID, active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + CID + ".json"]: { classId: CID, name: "الصف", active: true, studentIds: [] }
  });
});
afterEach(() => { vi.useRealTimers(); });
const at = ms => vi.setSystemTime(ms);

const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const SD = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} });
const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T());
const results = (aid, body) => resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ assignmentId: aid, studentId: S1, ...body }) }, T());
const review = aid => reviewHandler({ method: "GET", url: "https://x/api/assignment-review?assignmentId=" + aid + "&studentId=" + S1 + "&attemptNumber=1" }, T());
const sub = (aid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: { get: () => null }, json: async () => body }, SD());
const getState = async aid => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: { get: () => null } }, SD())).jsonBody.state;
const idOf = st => ({ expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt, ...(st.activeAttempt.attemptEpoch ? { expectedAttemptEpoch: st.activeAttempt.attemptEpoch } : {}) });
const doc = aid => ctx.getJson("platform/submissions/" + aid + "/" + S1 + ".json");

async function create(extra = {}) {
  const r = await manage({ action: "create", classId: CID, title: "امتحان", examSnapshot: EXAM, publish: true, maxAttempts: 2, openAt: iso(T0 - MIN), dueAt: iso(T0 + 24 * 60 * MIN), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}
async function start(aid) {
  const r = await sub(aid, { action: "startAttempt" });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.state;
}

describe("normalizeToolUsage — the report is untrusted input", () => {
  it("keeps only tools the published exam offers, with integer counts 1–999, in the spec's order", () => {
    expect(normalizeToolUsage({ scratchPad: 2, calculator: 5 }, EXAM)).toEqual({ calculator: 5, scratchPad: 2 });
    expect(Object.keys(normalizeToolUsage({ scratchPad: 2, calculator: 5 }, EXAM))).toEqual(["calculator", "scratchPad"]);
    expect(normalizeToolUsage({ calculator: 5000 }, EXAM)).toEqual({ calculator: MAX_OPENS });
  });
  it("drops tools the exam does not offer, malformed counts and non-object reports", () => {
    expect(normalizeToolUsage({ ipv4Calculator: 3, calculator: 1 }, EXAM)).toEqual({ calculator: 1 });
    for (const bad of [0, -1, 1.5, "3", null, true, NaN, Infinity]) expect(normalizeToolUsage({ calculator: bad }, EXAM)).toEqual({});
    for (const bad of [null, [], "x", 3, undefined]) expect(normalizeToolUsage(bad, EXAM)).toEqual({});
    expect(normalizeToolUsage(JSON.parse('{"__proto__":{"calculator":3}}'), EXAM)).toEqual({});
  });
  it("an exam without tools, or with a malformed spec, records nothing", () => {
    expect(normalizeToolUsage({ calculator: 3 }, { questions: [] })).toEqual({});
    expect(normalizeToolUsage({ calculator: 3 }, { studentTools: { version: 2, tools: [] } })).toEqual({});
    expect(normalizeToolUsage({ calculator: 3 }, null)).toEqual({});
  });
});

describe("mergeToolUsage — a count never goes down, and the server owns the times", () => {
  it("a first report stamps first and last seen; a higher count moves only last seen; a lower or equal one changes nothing", () => {
    const a = mergeToolUsage(null, { calculator: 2 }, EXAM, "2026-11-18T08:01:00.000Z");
    expect(a).toEqual({ calculator: { opens: 2, firstSeenAt: "2026-11-18T08:01:00.000Z", lastSeenAt: "2026-11-18T08:01:00.000Z" } });
    const b = mergeToolUsage(a, { calculator: 4 }, EXAM, "2026-11-18T08:05:00.000Z");
    expect(b.calculator).toEqual({ opens: 4, firstSeenAt: "2026-11-18T08:01:00.000Z", lastSeenAt: "2026-11-18T08:05:00.000Z" });
    expect(mergeToolUsage(b, { calculator: 1 }, EXAM, "2026-11-18T08:09:00.000Z")).toEqual(b);
    expect(mergeToolUsage(b, { calculator: 4 }, EXAM, "2026-11-18T08:09:00.000Z")).toEqual(b);
    expect(mergeToolUsage(b, {}, EXAM, "2026-11-18T08:09:00.000Z")).toEqual(b);
  });
  it("a damaged stored record is read as nothing, and an empty result is null", () => {
    expect(mergeToolUsage({ calculator: { opens: "x" } }, {}, EXAM, "2026-11-18T08:00:00.000Z")).toBeNull();
    expect(mergeToolUsage({ calculator: "bad" }, { calculator: 1 }, EXAM, "2026-11-18T08:00:00.000Z").calculator.opens).toBe(1);
    expect(mergeToolUsage(null, {}, EXAM)).toBeNull();
  });
  it("the teacher view and the student's resume counts read only well-formed entries", () => {
    expect(toolUsageForTeacher({ toolUsage: { calculator: { opens: 3, firstSeenAt: "a", lastSeenAt: "b" }, scratchPad: { opens: 0 } } })).toEqual([{ toolId: "calculator", opens: 3, firstSeenAt: "a", lastSeenAt: "b" }]);
    expect(toolUsageForTeacher({})).toEqual([]);
    expect(draftToolUsageCounts({ draftToolUsage: { calculator: { opens: 3 }, scratchPad: "x" } })).toEqual({ calculator: 3 });
  });
});

describe("the submission routes carry the record; grading never sees it", () => {
  it("saveDraft keeps the record with the draft, the state gives the student their own counts back, and submit moves it to the attempt", async () => {
    const aid = await create();
    let st = await start(aid);
    at(T0 + MIN);
    expect((await sub(aid, { action: "saveDraft", answers: { q1: A1 }, toolUsage: { calculator: 2 }, ...idOf(st) })).status).toBe(200);
    expect(doc(aid).draftToolUsage).toEqual({ calculator: { opens: 2, firstSeenAt: iso(T0 + MIN), lastSeenAt: iso(T0 + MIN) } });
    st = await getState(aid);
    expect(st.draftToolUsage).toEqual({ calculator: 2 });
    at(T0 + 3 * MIN);
    const r = await sub(aid, { action: "submit", answers: { q1: A1 }, toolUsage: { calculator: 3, scratchPad: 1 }, ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.toolUsage).toEqual({
      calculator: { opens: 3, firstSeenAt: iso(T0 + MIN), lastSeenAt: iso(T0 + 3 * MIN) },
      scratchPad: { opens: 1, firstSeenAt: iso(T0 + 3 * MIN), lastSeenAt: iso(T0 + 3 * MIN) }
    });
    expect(doc(aid).draftToolUsage).toBeUndefined();
    // the student's result projection never carries it
    expect(JSON.stringify(r.jsonBody)).not.toContain("toolUsage");
    expect(JSON.stringify(await getState(aid))).not.toContain("oolUsage");
    // grading is exactly the grading of the same answers without the record
    expect(attempt.score).toBe(2);
    expect(attempt.finalized).toBe(true);
  });

  it("the same submission without the field is byte-for-byte the historical attempt (no toolUsage key at all)", async () => {
    const aid = await create();
    const st = await start(aid);
    await sub(aid, { action: "saveDraft", answers: { q1: A1 }, ...idOf(st) });
    expect(doc(aid).draftToolUsage).toBeUndefined();
    await sub(aid, { action: "submit", answers: { q1: A1 }, ...idOf(st) });
    expect(Object.keys(doc(aid).attempts[0])).not.toContain("toolUsage");
  });

  it("an older or retried report never lowers the stored count", async () => {
    const aid = await create();
    const st = await start(aid);
    await sub(aid, { action: "saveDraft", answers: {}, toolUsage: { calculator: 5 }, ...idOf(st) });
    await sub(aid, { action: "saveDraft", answers: {}, toolUsage: { calculator: 2 }, ...idOf(st) });
    await sub(aid, { action: "saveDraft", answers: {}, toolUsage: { calculator: 5 }, ...idOf(st) });
    expect(doc(aid).draftToolUsage.calculator.opens).toBe(5);
    await sub(aid, { action: "submit", answers: {}, toolUsage: { calculator: 1 }, ...idOf(st) });
    expect(doc(aid).attempts[0].toolUsage.calculator.opens).toBe(5);
  });

  it("a tool the exam does not offer is never stored, whatever the client sends", async () => {
    const aid = await create();
    const st = await start(aid);
    await sub(aid, { action: "saveDraft", answers: {}, toolUsage: { ipv4Calculator: 9, graphPlotter: 1 }, ...idOf(st) });
    expect(doc(aid).draftToolUsage).toBeUndefined();
  });

  it("a timed attempt that runs out keeps the draft record (the finalizing client's own report merged in)", async () => {
    const aid = await create({ durationMinutes: 10 });
    const st = await start(aid);
    at(T0 + 2 * MIN);
    await sub(aid, { action: "saveDraft", answers: { q1: A1 }, toolUsage: { scratchPad: 2 }, ...idOf(st) });
    at(T0 + 11 * MIN);
    const r = await sub(aid, { action: "finalizeTimedOutAttempt", toolUsage: { scratchPad: 3 } });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.endReason).toBe("timedOut");
    expect(attempt.toolUsage.scratchPad).toEqual({ opens: 3, firstSeenAt: iso(T0 + 2 * MIN), lastSeenAt: iso(T0 + 11 * MIN) });
    expect(doc(aid).draftToolUsage).toBeUndefined();
  });

  it("a pause keeps the record with the paused draft, and the resumed attempt continues it", async () => {
    const aid = await create({ durationMinutes: 30 });
    const name = "platform/assignments/" + aid + ".json";
    ctx.setJson(name, { ...ctx.getJson(name), attemptModelVersion: 3, attemptPolicy: "pausable" });   // the pausable attempt model
    let st = await start(aid);
    expect(st.attemptModelVersion).toBe(3);
    const p = await sub(aid, { action: "pauseAttempt", answers: { q1: A1 }, toolUsage: { calculator: 1 }, ...idOf(st) });
    expect(p.status, JSON.stringify(p.jsonBody)).toBe(200);
    expect(doc(aid).draftToolUsage.calculator.opens).toBe(1);
    st = p.jsonBody.state;
    expect(st.draftToolUsage).toEqual({ calculator: 1 });
    const r = await sub(aid, { action: "resumeAttempt", ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    st = r.jsonBody.state;
    await sub(aid, { action: "submit", answers: { q1: A1 }, toolUsage: { calculator: 2 }, ...idOf(st) });
    expect(doc(aid).attempts[0].toolUsage.calculator.opens).toBe(2);
  });

  it("the teacher ending the attempt records the draft's tools on the completed attempt", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await sub(aid, { action: "saveDraft", answers: { q1: A1 }, toolUsage: { calculator: 4 }, ...idOf(st) });
    const r = await results(aid, { action: "endActiveAttempt", ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.endReason).toBe("teacherEnded");
    expect(attempt.toolUsage.calculator.opens).toBe(4);
    expect(doc(aid).draftToolUsage).toBeUndefined();
  });

  it("a new attempt starts with no record (the previous attempt keeps its own)", async () => {
    const aid = await create();
    let st = await start(aid);
    await sub(aid, { action: "submit", answers: { q1: A1 }, toolUsage: { calculator: 2 }, ...idOf(st) });
    st = await start(aid);
    expect(st.draftToolUsage).toBeUndefined();
    await sub(aid, { action: "submit", answers: { q1: A1 }, ...idOf(st) });
    const [first, second] = doc(aid).attempts;
    expect(first.toolUsage.calculator.opens).toBe(2);
    expect(second.toolUsage).toBeUndefined();
  });
});

describe("the teacher's review shows the record", () => {
  it("GET assignment-review returns the attempt's tools in the spec's order; an attempt without tool use has no field", async () => {
    const aid = await create();
    const st = await start(aid);
    await sub(aid, { action: "submit", answers: { q1: A1 }, toolUsage: { scratchPad: 1, calculator: 3 }, ...idOf(st) });
    const g = await review(aid);
    expect(g.status).toBe(200);
    expect(g.jsonBody.attempt.toolUsage).toEqual([
      { toolId: "calculator", opens: 3, firstSeenAt: iso(T0), lastSeenAt: iso(T0) },
      { toolId: "scratchPad", opens: 1, firstSeenAt: iso(T0), lastSeenAt: iso(T0) }
    ]);
    const aid2 = await create({ title: "ثان" });
    const st2 = await start(aid2);
    await sub(aid2, { action: "submit", answers: { q1: A1 }, ...idOf(st2) });
    const g2 = await reviewHandler({ method: "GET", url: "https://x/api/assignment-review?assignmentId=" + aid2 + "&studentId=" + S1 + "&attemptNumber=1" }, T());
    expect(g2.jsonBody.attempt.toolUsage).toBeUndefined();
  });
});
