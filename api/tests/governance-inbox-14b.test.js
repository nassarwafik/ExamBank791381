import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 14B Part I — the actor-specific Governance Review Inbox: lightweight pointer/index records under a server-derived
// actor key, validated against the authoritative manifest on every read (pointers are routing data, never authority).
// Fail-first on b9e45e8: the inbox lib / endpoint do not exist.
process.env.BANK_SETUP_KEY = "14b-inbox-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.GOVERNANCE_CAPABILITIES;

const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const GOV = await import("../src/lib/exam-governance.js");
const model = await import("../src/lib/exam-governance-model.js");
const inbox = await import("../src/lib/governance-inbox.js");
const { handler } = await import("../src/functions/governance-inbox.js");

const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (examId = "EX-1", over = {}) => ({ examId, title: "امتحان " + examId, status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });
const AUTHOR = { id: "teacher-author", capabilities: ["author"] }, REVIEWER = { id: "teacher-reviewer", capabilities: ["review"] }, APPROVER = { id: "teacher-approver", capabilities: ["approve"] }, PUBLISHER = { id: "teacher-publisher", capabilities: ["publish"] };
const directory = () => ({ mode: "assigned", actors: [AUTHOR, REVIEWER, APPROVER, PUBLISHER].map(a => ({ actorId: a.id, capabilities: a.capabilities })) });
const ASSIGN = { reviewerId: REVIEWER.id, approverId: APPROVER.id, publisherId: PUBLISHER.id };

let mem, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => { mem = createMemoryContainer(); c = mem.container; clock = Date.parse("2026-10-06T08:00:00.000Z"); deps = { now: tick, directory: directory() }; });
const enable = examId => GOV.enableGovernance(c, { examId, exam: validExam(examId), actor: AUTHOR, requestId: "R-enable-" + examId }, deps);
const submit = (examId, m, requestId = "R-submit-" + examId) => GOV.submitForReview(c, { examId, revisionId: m.latestRevisionId, actor: AUTHOR, requestId, expectedStateVersion: m.stateVersion, assignments: ASSIGN }, deps);
const decide = (examId, m, action, actor, note) => GOV.workflowDecision(c, { examId, action, actor, requestId: "R-" + action + "-" + examId + "-" + m.stateVersion, expectedStateVersion: m.stateVersion, note }, deps);
const approve = (examId, m) => GOV.approve(c, { examId, actor: APPROVER, requestId: "R-approve-" + examId, expectedStateVersion: m.stateVersion }, deps);
const tasks = (actorId, stage) => inbox.listActorTasks(c, actorId, { stage }, deps);
const pointerNames = () => mem.names(inbox.INBOX_PREFIX);

describe("14B I — inbox index (lib)", () => {
  it("I1 — the actor key is a stable hash, never the raw actor id, and every pointer lives under it", async () => {
    const key = inbox.actorKey("teacher-reviewer");
    expect(key).toMatch(/^[a-f0-9]{32,64}$/); expect(key).toBe(inbox.actorKey("teacher-reviewer")); expect(key).not.toContain("teacher");
    expect(inbox.actorKey("../evil")).toMatch(/^[a-f0-9]+$/);
    const e = await enable("EX-1"); await submit("EX-1", e.manifest);
    expect(pointerNames()).toHaveLength(1);
    expect(pointerNames()[0].startsWith(inbox.INBOX_PREFIX + key + "/")).toBe(true);
    expect(JSON.stringify(mem.getJson(pointerNames()[0]))).not.toMatch(/sections|questions|answer/);   // never an exam body
  });
  it("I2 — task stages open exactly when the transition commits: reviewer on submit, approver ONLY after review completion, publisher only after approval; closed tasks disappear", async () => {
    const e = await enable("EX-1");
    const s = await submit("EX-1", e.manifest);
    expect((await tasks(REVIEWER.id, "review")).items).toMatchObject([{ examId: "EX-1", cycleId: s.manifest.reviewWorkflow.cycleId, revisionId: e.manifest.latestRevisionId, revisionNumber: 1, stage: "review", title: "امتحان EX-1", authorId: AUTHOR.id }]);
    expect((await tasks(APPROVER.id, "approve")).items).toEqual([]);
    expect((await tasks(PUBLISHER.id, "publish")).items).toEqual([]);
    expect((await tasks(AUTHOR.id, "all")).items).toEqual([]);
    const r = await decide("EX-1", s.manifest, "complete-review", REVIEWER);
    expect((await tasks(REVIEWER.id, "review")).items).toEqual([]);
    expect((await tasks(APPROVER.id, "approve")).items).toMatchObject([{ examId: "EX-1", stage: "approve", cycleId: s.manifest.reviewWorkflow.cycleId }]);
    const a = await approve("EX-1", r.manifest);
    expect((await tasks(APPROVER.id, "approve")).items).toEqual([]);
    expect((await tasks(PUBLISHER.id, "publish")).items).toMatchObject([{ examId: "EX-1", stage: "publish" }]);
    await GOV.publish(c, { examId: "EX-1", actor: PUBLISHER, requestId: "R-publish", expectedStateVersion: a.manifest.stateVersion }, deps);
    expect((await tasks(PUBLISHER.id, "all")).items).toEqual([]);
    const counts = (await tasks(REVIEWER.id, "all")).counts; expect(counts).toEqual({ review: 0, approve: 0, publish: 0 });
  });
  it("I3 — a negative decision closes the open task; the returned draft opens nothing for anyone", async () => {
    const e = await enable("EX-1"); const s = await submit("EX-1", e.manifest);
    await decide("EX-1", s.manifest, "request-changes", REVIEWER, "أعد الصياغة");
    for (const a of [REVIEWER, APPROVER, PUBLISHER, AUTHOR]) expect((await tasks(a.id, "all")).items).toEqual([]);
  });
  it("I4 — a stale pointer (its manifest moved on without it) is never returned as a live task and is cleaned best-effort; a pointer whose manifest is missing or corrupt is skipped", async () => {
    const e = await enable("EX-1"); const s = await submit("EX-1", e.manifest);
    const live = pointerNames()[0];
    // forge a stale duplicate for another cycle + a pointer for an exam without a manifest + a pointer for a corrupt manifest
    mem.setJson(live.replace(s.manifest.reviewWorkflow.cycleId, "cyc-old"), { ...mem.getJson(live), cycleId: "cyc-old" });
    mem.setJson(inbox.INBOX_PREFIX + inbox.actorKey(REVIEWER.id) + "/review-EX-9-cyc-9.json", { ...mem.getJson(live), examId: "EX-9", cycleId: "cyc-9" });
    mem.setJson(model.manifestName("EX-7"), { schemaVersion: 1, examId: "EX-7", lifecycleState: "in-review" });
    mem.setJson(inbox.INBOX_PREFIX + inbox.actorKey(REVIEWER.id) + "/review-EX-7-cyc-7.json", { ...mem.getJson(live), examId: "EX-7", cycleId: "cyc-7" });
    const r = await tasks(REVIEWER.id, "review");
    expect(r.items).toHaveLength(1); expect(r.items[0].cycleId).toBe(s.manifest.reviewWorkflow.cycleId);
    expect(mem.has(live)).toBe(true);
    expect(pointerNames().filter(n => n.includes("cyc-old") || n.includes("EX-9"))).toEqual([]);   // stale ones cleaned
    // a pointer for the RIGHT cycle but the wrong actor is not live for that actor either
    mem.setJson(inbox.INBOX_PREFIX + inbox.actorKey(APPROVER.id) + "/review-EX-1-" + s.manifest.reviewWorkflow.cycleId + ".json", { ...mem.getJson(live), actorId: APPROVER.id });
    expect((await tasks(APPROVER.id, "review")).items).toEqual([]);
  });
  it("I5 — isTaskLive is pure and strict: stage × lifecycle × reviewStatus × assigned actor × cycle × revision must all match", () => {
    const w = { cycleId: "c1", revisionId: "rev-1", reviewerId: "r", approverId: "a", publisherId: "p", reviewStatus: "pending" };
    const ptr = (stage, actorId) => ({ stage, actorId, examId: "EX-1", cycleId: "c1", revisionId: "rev-1" });
    const m = (state, over = {}) => ({ lifecycleState: state, reviewWorkflow: { ...w, ...over } });
    expect(inbox.isTaskLive(ptr("review", "r"), m("in-review"), "r")).toBe(true);
    expect(inbox.isTaskLive(ptr("review", "r"), m("in-review", { reviewStatus: "completed" }), "r")).toBe(false);
    expect(inbox.isTaskLive(ptr("approve", "a"), m("in-review"), "a")).toBe(false);
    expect(inbox.isTaskLive(ptr("approve", "a"), m("in-review", { reviewStatus: "completed" }), "a")).toBe(true);
    expect(inbox.isTaskLive(ptr("approve", "a"), m("approved", { reviewStatus: "completed" }), "a")).toBe(false);
    expect(inbox.isTaskLive(ptr("publish", "p"), m("approved", { reviewStatus: "completed" }), "p")).toBe(true);
    expect(inbox.isTaskLive(ptr("publish", "p"), m("published", { reviewStatus: "completed" }), "p")).toBe(false);
    expect(inbox.isTaskLive(ptr("review", "r"), m("in-review", { cycleId: "c2" }), "r")).toBe(false);
    expect(inbox.isTaskLive(ptr("review", "r"), m("in-review", { revisionId: "rev-2" }), "r")).toBe(false);
    expect(inbox.isTaskLive(ptr("review", "r"), m("in-review"), "a")).toBe(false);                 // asking as a different actor
    expect(inbox.isTaskLive(ptr("review", "x"), m("in-review"), "x")).toBe(false);                 // pointer actor is not the assigned reviewer
    expect(inbox.isTaskLive(ptr("review", "r"), { lifecycleState: "in-review" }, "r")).toBe(false); // no workflow ⇒ never live
    expect(inbox.isTaskLive(ptr("review", "r"), null, "r")).toBe(false);
  });
  it("I6 — listing is bounded and newest-first; pagination walks the whole set without loading any revision body", async () => {
    for (let i = 1; i <= 7; i++) { const e = await enable("EX-" + i); await submit("EX-" + i, e.manifest); }
    const reads = [];
    const spyDeps = { ...deps, downloadJsonOrNull: async (container, name) => { reads.push(name); return mem.getJson(name); } };
    const p1 = await inbox.listActorTasks(c, REVIEWER.id, { stage: "review", limit: 3 }, spyDeps);
    expect(p1.items.map(t => t.examId)).toEqual(["EX-7", "EX-6", "EX-5"]); expect(p1.nextCursor).not.toBeNull();
    const p2 = await inbox.listActorTasks(c, REVIEWER.id, { stage: "review", limit: 3, cursor: p1.nextCursor }, spyDeps);
    expect(p2.items.map(t => t.examId)).toEqual(["EX-4", "EX-3", "EX-2"]);
    const p3 = await inbox.listActorTasks(c, REVIEWER.id, { stage: "review", limit: 3, cursor: p2.nextCursor }, spyDeps);
    expect(p3.items.map(t => t.examId)).toEqual(["EX-1"]); expect(p3.nextCursor).toBeNull();
    expect(reads.some(n => n.includes("/revisions/"))).toBe(false);
    expect(p1.counts.review).toBe(7);
  });
});

describe("14B I — /api/governance-inbox endpoint security", () => {
  const req = (token, method = "GET", query = "", body = null) => ({ method, url: "http://x/api/governance-inbox" + query, params: {}, headers: new Headers(token ? { authorization: "Bearer " + token } : {}), json: async () => body });
  const fnDeps = () => ({ getContainer: () => mem.container, now: tick, directory: directory() });
  it("S6 — the actor is ONLY the authenticated token subject: another teacher's id in the query / body changes nothing", async () => {
    const e = await enable("EX-1"); await submit("EX-1", e.manifest);
    const reviewer = createBuilderToken(REVIEWER.id), approver = createBuilderToken(APPROVER.id);
    const mine = await handler(req(reviewer, "GET", "?stage=review"), fnDeps());
    expect(mine.status).toBe(200); expect(mine.jsonBody.items).toHaveLength(1); expect(mine.jsonBody.actorId).toBe(REVIEWER.id);
    const spoofQuery = await handler(req(approver, "GET", "?stage=review&actorId=" + REVIEWER.id), fnDeps());
    expect(spoofQuery.status).toBe(200); expect(spoofQuery.jsonBody.items).toEqual([]); expect(spoofQuery.jsonBody.actorId).toBe(APPROVER.id);
    const spoofBody = await handler(req(approver, "POST", "", { action: "list", stage: "review", actorId: REVIEWER.id, sub: REVIEWER.id }), fnDeps());
    expect(spoofBody.status).toBe(200); expect(spoofBody.jsonBody.items).toEqual([]);
  });
  it("S7 — student tokens, anonymous callers and forged tokens are denied (401) and nothing is read or written", async () => {
    const e = await enable("EX-1"); await submit("EX-1", e.manifest);
    const before = pointerNames().slice();
    for (const t of [null, createStudentToken({ userId: "s1", authVersion: 1 }), "garbage", createBuilderToken(REVIEWER.id) + "x"]) {
      const r = await handler(req(t, "GET", "?stage=review"), fnDeps());
      expect(r.status, String(t)).toBe(401);
    }
    expect(pointerNames()).toEqual(before);
  });
  it("the endpoint returns lightweight tasks + counts, bounded pages, and no revision bodies", async () => {
    for (let i = 1; i <= 3; i++) { const e = await enable("EX-" + i); await submit("EX-" + i, e.manifest); }
    const r = await handler(req(createBuilderToken(REVIEWER.id), "GET", "?stage=all&limit=2"), fnDeps());
    expect(r.status).toBe(200); expect(r.jsonBody.items).toHaveLength(2); expect(r.jsonBody.nextCursor).not.toBeNull();
    expect(r.jsonBody.counts).toEqual({ review: 3, approve: 0, publish: 0 });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/sections|correctOptionIndex/);
    const huge = await handler(req(createBuilderToken(REVIEWER.id), "GET", "?stage=all&limit=99999"), fnDeps());
    expect(huge.jsonBody.items.length).toBeLessThanOrEqual(50);
  });
});
