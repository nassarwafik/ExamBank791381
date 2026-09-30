import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import * as model from "../src/lib/exam-governance-model.js";
import * as inbox from "../src/lib/governance-inbox.js";

// Phase 14B §45 — concurrency / race matrix R1–R12 against the faithful ETag memory container (R13 is a UI race, covered in
// src/governance/ReviewInboxPage.14b.test.tsx; R14 is a configuration race, covered in the function suite).
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });
const AUTHOR = { id: "teacher-author", capabilities: ["author"] }, REVIEWER = { id: "teacher-reviewer", capabilities: ["review"] }, APPROVER = { id: "teacher-approver", capabilities: ["approve"] }, PUBLISHER = { id: "teacher-publisher", capabilities: ["publish"] }, OUTSIDER = { id: "teacher-outsider", capabilities: ["approve", "review", "publish"] };
const directory = (actors = [AUTHOR, REVIEWER, APPROVER, PUBLISHER, OUTSIDER]) => ({ mode: "assigned", actors: actors.map(a => ({ actorId: a.id, capabilities: a.capabilities })) });
const ASSIGN = { reviewerId: REVIEWER.id, approverId: APPROVER.id, publisherId: PUBLISHER.id };

// Storage-fault harness: uploads and deletes can be made to fail by name pattern; reads / listings untouched.
function faulty(mem) {
  const base = mem.container;
  const state = { failUpload: () => false, failDelete: () => false, uploads: [] };
  const container = {
    getBlobClient(name) { const real = base.getBlobClient(name); return { download: () => real.download(), async deleteIfExists() { if (state.failDelete(name)) { const e = new Error("simulated delete outage"); e.statusCode = 500; throw e; } return real.deleteIfExists(); } }; },
    listBlobsFlat: prefix => base.listBlobsFlat(prefix),
    getBlockBlobClient(name) { const real = base.getBlockBlobClient(name); return { async upload(...args) { if (state.failUpload(name)) { const e = new Error("simulated storage outage"); e.statusCode = 500; throw e; } state.uploads.push(name); return real.upload(...args); } }; }
  };
  return { container, state };
}
let mem, hooks, f, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => { hooks = {}; mem = createMemoryContainer({}, hooks); f = faulty(mem); c = f.container; clock = Date.parse("2026-10-07T08:00:00.000Z"); deps = { now: tick, directory: directory() }; });
const manifest = () => mem.getJson(model.manifestName("EX-1"));
const events = () => mem.names("exam-governance/EX-1/events/").sort().map(n => mem.getJson(n));
const decisions = () => mem.names("exam-governance/EX-1/decisions/");
const pointers = () => mem.names(inbox.INBOX_PREFIX);
const expectErr = async (p, status, code) => { let e = null; try { await p; } catch (x) { e = x; } expect(e, "expected an error").not.toBeNull(); expect(e.status, e.message).toBe(status); if (code) expect(e.code, e.message).toBe(code); return e; };
const enable = () => GOV.enableGovernance(c, { examId: "EX-1", exam: validExam(), actor: AUTHOR, requestId: "R-enable" }, deps);
const submit = (m, requestId = "R-submit", actor = AUTHOR) => GOV.submitForReview(c, { examId: "EX-1", revisionId: m.latestRevisionId, actor, requestId, expectedStateVersion: m.stateVersion, assignments: ASSIGN }, deps);
const decide = (m, action, actor, note, requestId = "R-" + action) => GOV.workflowDecision(c, { examId: "EX-1", action, actor, requestId, expectedStateVersion: m.stateVersion, note }, deps);
const approve = (m, actor = APPROVER, requestId = "R-approve") => GOV.approve(c, { examId: "EX-1", actor, requestId, expectedStateVersion: m.stateVersion }, deps);
const publish = (m, actor = PUBLISHER, requestId = "R-publish") => GOV.publish(c, { examId: "EX-1", actor, requestId, expectedStateVersion: m.stateVersion }, deps);
const tasks = (actorId, stage) => inbox.listActorTasks(c, actorId, { stage }, deps);
// One competitor commit injected right before a CAS write of the manifest: the pending CAS observes a changed ETag (412).
const competeOnce = () => { let fired = false; hooks.beforeConditionalUpload = (name, api) => { if (fired || !name.endsWith("/manifest.json")) return; fired = true; api.setJson(name, api.getJson(name)); }; };

describe("14B §45 — race matrix", () => {
  it("R1 — two clients submit the same draft state simultaneously: exactly one CAS wins, one cycle exists, the loser's pre-CAS pointer is cleaned", async () => {
    const e = await enable();
    const results = await Promise.allSettled([submit(e.manifest, "R-s-a"), submit(e.manifest, "R-s-b")]);
    const ok = results.filter(r => r.status === "fulfilled"), ko = results.filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1); expect(ko).toHaveLength(1); expect(ko[0].reason.code).toBe("STALE_STATE");
    const m = manifest(); expect(m.stateVersion).toBe(2); expect(m.reviewWorkflow.cycleId).toBe(ok[0].value.manifest.reviewWorkflow.cycleId);
    expect(pointers()).toHaveLength(1);                                                            // the winner's reviewer task only
    expect((await tasks(REVIEWER.id, "review")).items).toHaveLength(1);
  });
  it("R2 — the author withdraws while the reviewer has the task open: the reviewer's decision (old stateVersion) is a 409 conflict and applies nothing", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    const opened = s.manifest;                                                                     // what the reviewer's screen saw
    await decide(opened, "withdraw-review", AUTHOR);
    await expectErr(decide(opened, "complete-review", REVIEWER, "ok"), 409, "STALE_STATE");
    await expectErr(decide(opened, "request-changes", REVIEWER, "x", "R-rc"), 409, "STALE_STATE");
    expect(manifest().lifecycleState).toBe("draft"); expect(decisions().filter(n => n.includes("review-completed"))).toEqual([]);
    expect(mem.names("exam-governance/EX-1/decisions/").map(n => mem.getJson(n).decision)).toEqual(["withdrawn"]);
  });
  it("R3 — complete review twice with the SAME requestId: one decision, one event, one stateVersion increment", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    const a = await decide(s.manifest, "complete-review", REVIEWER, "ok", "R-x"); const b = await decide(s.manifest, "complete-review", REVIEWER, "ok", "R-x");
    expect(b.replayed).toBe(true); expect(manifest().stateVersion).toBe(a.manifest.stateVersion);
    expect(decisions()).toHaveLength(1); expect(events().filter(x => x.type === "review-completed")).toHaveLength(1);
    expect(pointers().filter(n => n.includes("approve-"))).toHaveLength(1);
  });
  it("R4 — complete review twice with DIFFERENT requestIds from the same state, concurrently: exactly one CAS succeeds, one decision record, the loser's record is cleaned", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    const results = await Promise.allSettled([decide(s.manifest, "complete-review", REVIEWER, "one", "R-1"), decide(s.manifest, "complete-review", REVIEWER, "two", "R-2")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected").map(r => r.reason.code)).toEqual(["STALE_STATE"]);
    expect(manifest().stateVersion).toBe(s.manifest.stateVersion + 1);
    expect(decisions()).toHaveLength(1); expect(events().filter(x => x.type === "review-completed")).toHaveLength(1);
    expect((await tasks(APPROVER.id, "approve")).items).toHaveLength(1);
  });
  it("R5 — the assigned approver tries to approve before the reviewer completed review: rejected, nothing changes", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    await expectErr(approve(s.manifest), 409, "REVIEW_NOT_COMPLETED");
    expect(manifest()).toMatchObject({ lifecycleState: "in-review", stateVersion: s.manifest.stateVersion });
  });
  it("R6 — an unassigned actor holding `approve` is not the assigned approver: rejected", async () => {
    const e = await enable(); const s = await submit(e.manifest); const r = await decide(s.manifest, "complete-review", REVIEWER);
    await expectErr(approve(r.manifest, OUTSIDER), 403, "NOT_ASSIGNED");
    await expectErr(approve(r.manifest, { id: OUTSIDER.id, capabilities: ["author", "review", "approve", "publish"] }, "R-a2"), 403, "NOT_ASSIGNED");
    expect(manifest().lifecycleState).toBe("in-review");
  });
  it("R7 — the assigned approver lost `approve` after assignment: rejected (capability AND assignment are both required)", async () => {
    const e = await enable(); const s = await submit(e.manifest); const r = await decide(s.manifest, "complete-review", REVIEWER);
    deps.directory = directory([AUTHOR, REVIEWER, { id: APPROVER.id, capabilities: ["review"] }, PUBLISHER, OUTSIDER]);
    await expectErr(approve(r.manifest, { id: APPROVER.id, capabilities: ["review"] }), 403);
    await expectErr(approve(r.manifest, APPROVER, "R-a-stale-caps"), 403);              // a stale capability list in the request is not trusted over the directory
    expect(manifest().lifecycleState).toBe("in-review");
  });
  it("R8 — the publisher attempts to publish after the cycle returned to draft: rejected, no publication", async () => {
    const e = await enable(); const s = await submit(e.manifest); const r = await decide(s.manifest, "complete-review", REVIEWER); const a = await approve(r.manifest);
    const back = await decide(a.manifest, "reject-publication", PUBLISHER, "ليس بعد");
    await expectErr(publish(a.manifest), 409, "STALE_STATE");
    await expectErr(publish(back.manifest, PUBLISHER, "R-p2"), 409, "ILLEGAL_TRANSITION");
    expect(manifest().publishedRevisionId).toBeUndefined();
  });
  it("R9 — the next-task pointer is created, then the manifest CAS loses: the pointer never appears as a live task (cleaned best-effort, and filtered even if cleanup failed)", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    competeOnce(); f.state.failDelete = name => name.startsWith(inbox.INBOX_PREFIX);                      // the loser cannot even clean up
    await expectErr(decide(s.manifest, "complete-review", REVIEWER, "ok"), 409, "STALE_STATE");
    expect(manifest()).toMatchObject({ lifecycleState: "in-review", stateVersion: s.manifest.stateVersion });
    expect(manifest().reviewWorkflow.reviewStatus).toBe("pending");
    expect(pointers().some(n => n.includes("/approve-"))).toBe(true);                                   // the orphan pointer physically exists…
    expect((await tasks(APPROVER.id, "approve")).items).toEqual([]);                                     // …but is never a live task
    f.state.failDelete = () => false;
    expect((await tasks(APPROVER.id, "approve")).items).toEqual([]);
    expect(pointers().some(n => n.includes("/approve-"))).toBe(false);                                  // cleaned on the next validated read
    expect((await tasks(REVIEWER.id, "review")).items).toHaveLength(1);                                   // the real task is unaffected
  });
  it("R10 — the manifest CAS succeeds but removing the closing task pointer fails: the reader filters the stale pointer; the new task is live", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    f.state.failDelete = name => name.startsWith(inbox.INBOX_PREFIX);
    const r = await decide(s.manifest, "complete-review", REVIEWER, "ok");
    expect(r.manifest.reviewWorkflow.reviewStatus).toBe("completed");
    expect(pointers().filter(n => n.includes("/review-"))).toHaveLength(1);                             // stale reviewer pointer survived
    expect((await tasks(REVIEWER.id, "review")).items).toEqual([]);
    expect((await tasks(APPROVER.id, "approve")).items).toHaveLength(1);
  });
  it("R11 — the decision record is created, then the manifest CAS loses: the unreferenced record is cleaned and never listed; a referenced record is never deleted", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    competeOnce();
    await expectErr(decide(s.manifest, "request-changes", REVIEWER, "orphan?"), 409, "STALE_STATE");
    expect(decisions()).toEqual([]); expect((await GOV.listDecisions(c, { examId: "EX-1" }, deps)).items).toEqual([]);
    expect(manifest().lifecycleState).toBe("in-review");
    const ok = await decide(manifest(), "request-changes", REVIEWER, "real", "R-rc-2");
    expect(decisions()).toHaveLength(1);
    expect(mem.getJson(decisions()[0]).decisionId).toBe(ok.manifest.lastDecision.decisionId);
  });
  it("R12 — the audit event write fails after a 14B mutation CAS: 14A audit continuity blocks the next mutation (503 AUDIT_EVENT_PENDING) until the event is repaired, then the trail is contiguous", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    f.state.failUpload = name => name.includes("/events/");
    await expect(decide(s.manifest, "complete-review", REVIEWER, "ok")).rejects.toMatchObject({ code: "AUDIT_EVENT_PENDING" });
    const committed = manifest(); expect(committed.reviewWorkflow.reviewStatus).toBe("completed"); expect(committed.eventCount).toBe(3); expect(events()).toHaveLength(2);
    await expectErr(approve(committed), 503, "AUDIT_EVENT_PENDING");                                    // the NEXT mutation is blocked (transition path)
    await expectErr(decide(committed, "withdraw-review", AUTHOR, "", "R-withdraw-blocked"), 503, "AUDIT_EVENT_PENDING");   // … and so is every 14B workflow decision
    expect(manifest()).toEqual(committed);
    expect(manifest().commands.some(x => x.requestId === "R-withdraw-blocked")).toBe(false);
    f.state.failUpload = () => false;
    const a = await approve(committed);
    expect(a.manifest.lifecycleState).toBe("approved");
    const evs = events(); expect(evs.map(x => x.type)).toEqual(["governance-enabled", "submitted-for-review", "review-completed", "approved"]);
    expect(evs[2]).toMatchObject({ actorId: REVIEWER.id, requestId: "R-complete-review", sequence: 3 });
    expect(evs[2].eventId).toBe(committed.commands.find(x => x.requestId === "R-complete-review").audit.eventId);
  });
});
