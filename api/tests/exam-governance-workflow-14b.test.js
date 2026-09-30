import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import * as model from "../src/lib/exam-governance-model.js";

// Phase 14B Parts B–H — the Assigned review workflow INSIDE the 14A lifecycle (no new lifecycle state). Fail-first on
// b9e45e8: the authority ignores assignments, lets any `approve` holder approve, has no review completion, no decision
// records and lets the generic return-to-draft bypass the workflow — so W2–W12 fail behaviourally on the baseline.
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

const AUTHOR = { id: "teacher-author", capabilities: ["author"] };
const REVIEWER = { id: "teacher-reviewer", capabilities: ["review"] };
const APPROVER = { id: "teacher-approver", capabilities: ["approve"] };
const PUBLISHER = { id: "teacher-publisher", capabilities: ["publish"] };
const OUTSIDER = { id: "teacher-outsider", capabilities: ["review", "approve", "publish"] };   // holds capabilities, never assigned
const directory = (actors = [AUTHOR, REVIEWER, APPROVER, PUBLISHER, OUTSIDER]) => ({ mode: "assigned", actors: actors.map(a => ({ actorId: a.id, capabilities: a.capabilities })) });
const ASSIGN = { reviewerId: REVIEWER.id, approverId: APPROVER.id, publisherId: PUBLISHER.id };

let mem, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => { mem = createMemoryContainer(); c = mem.container; clock = Date.parse("2026-10-05T08:00:00.000Z"); deps = { now: tick, directory: directory() }; });
const manifest = () => mem.getJson(model.manifestName("EX-1"));
const events = () => mem.names("exam-governance/EX-1/events/").sort().map(n => mem.getJson(n));
const decisions = () => mem.names("exam-governance/EX-1/decisions/").sort().map(n => mem.getJson(n));
const expectErr = async (p, status, code) => { let e = null; try { await p; } catch (x) { e = x; } expect(e, "expected an error").not.toBeNull(); expect(e.status, e.message).toBe(status); if (code) expect(e.code, e.message).toBe(code); return e; };

const enable = (a = AUTHOR) => GOV.enableGovernance(c, { examId: "EX-1", exam: validExam(), actor: a, requestId: "R-enable" }, deps);
const submit = (m, requestId = "R-submit", over = {}) => GOV.submitForReview(c, { examId: "EX-1", revisionId: m.latestRevisionId, actor: AUTHOR, requestId, expectedStateVersion: m.stateVersion, assignments: ASSIGN, ...over }, deps);
const decide = (m, action, actor, over = {}, requestId = "R-" + action) => GOV.workflowDecision(c, { examId: "EX-1", action, actor, requestId, expectedStateVersion: m.stateVersion, ...over }, deps);
const approve = (m, actor = APPROVER, requestId = "R-approve", over = {}) => GOV.approve(c, { examId: "EX-1", actor, requestId, expectedStateVersion: m.stateVersion, ...over }, deps);
const publish = (m, actor = PUBLISHER, requestId = "R-publish") => GOV.publish(c, { examId: "EX-1", actor, requestId, expectedStateVersion: m.stateVersion }, deps);
const toDraft = (m, actor = AUTHOR, requestId = "R-draft") => GOV.returnToDraft(c, { examId: "EX-1", actor, requestId, expectedStateVersion: m.stateVersion }, deps);
async function submitted() { const e = await enable(); const s = await submit(e.manifest); return s.manifest; }
async function reviewed() { const m = await submitted(); const r = await decide(m, "complete-review", REVIEWER, { note: "المراجعة تمت" }); return r.manifest; }
async function approved() { const m = await reviewed(); const a = await approve(m); return a.manifest; }

describe("14B W — submit for review with assignments (Assigned mode)", () => {
  it("W1 — the workflow cycle is server-owned: fresh cycleId, exact revision, author, reviewer, approver, publisher, server time, reviewStatus pending; the client cycleId is ignored", async () => {
    const e = await enable();
    const s = await submit(e.manifest, "R-submit", { cycleId: "evil-cycle" });
    const w = s.manifest.reviewWorkflow;
    expect(s.manifest.lifecycleState).toBe("in-review");
    expect(w).toMatchObject({ revisionId: e.manifest.latestRevisionId, revisionNumber: 1, authorId: AUTHOR.id, reviewerId: REVIEWER.id, approverId: APPROVER.id, publisherId: PUBLISHER.id, submittedBy: AUTHOR.id, reviewStatus: "pending" });
    expect(typeof w.cycleId).toBe("string"); expect(w.cycleId).not.toBe("evil-cycle"); expect(w.cycleId.length).toBeGreaterThan(8);
    expect(w.submittedAt).toBe(s.manifest.updatedAt);
    expect(model.validateManifest(manifest())).toEqual([]);
    expect(manifest().reviewWorkflow).toEqual(w);
  });
  it("W2 — assignments are validated on the server: missing / unknown actor / actor without the capability / free-text identity ⇒ refused, nothing written", async () => {
    const e = await enable();
    for (const bad of [undefined, {}, { ...ASSIGN, reviewerId: "nobody" }, { ...ASSIGN, approverId: REVIEWER.id }, { ...ASSIGN, publisherId: AUTHOR.id }, { ...ASSIGN, reviewerId: "أ. مراجع" }, { ...ASSIGN, reviewerId: { actorId: REVIEWER.id } }]) {
      await expectErr(submit(e.manifest, "R-bad-" + JSON.stringify(bad), { assignments: bad }), 400, "WORKFLOW_ASSIGNMENT_INVALID");
    }
    expect(manifest().lifecycleState).toBe("draft"); expect(manifest().stateVersion).toBe(1); expect(manifest().reviewWorkflow).toBeUndefined();
    expect(mem.names("exam-governance-inbox/")).toEqual([]);
  });
  it("W3 — strict separation of duties: any duplicate participant identity (author included) is refused on the server", async () => {
    const e = await enable();
    const dup = [
      { reviewerId: AUTHOR.id, approverId: APPROVER.id, publisherId: PUBLISHER.id },
      { reviewerId: REVIEWER.id, approverId: AUTHOR.id, publisherId: PUBLISHER.id },
      { reviewerId: REVIEWER.id, approverId: APPROVER.id, publisherId: AUTHOR.id },
      { reviewerId: OUTSIDER.id, approverId: OUTSIDER.id, publisherId: PUBLISHER.id },
      { reviewerId: OUTSIDER.id, approverId: APPROVER.id, publisherId: OUTSIDER.id },
      { reviewerId: REVIEWER.id, approverId: OUTSIDER.id, publisherId: OUTSIDER.id }
    ];
    const author = { id: AUTHOR.id, capabilities: ["author", "review", "approve", "publish"] };   // even an author holding every capability
    deps.directory = directory([author, REVIEWER, APPROVER, PUBLISHER, OUTSIDER]);
    for (const a of dup) await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: author, requestId: "R-" + JSON.stringify(a), expectedStateVersion: 1, assignments: a }, deps), 400, "WORKFLOW_ASSIGNMENT_INVALID");
    expect(manifest().stateVersion).toBe(1);
  });
  it("W4 — in single-teacher mode (no assigned directory) the 14A flow is unchanged: no assignments needed, no workflow recorded", async () => {
    deps.directory = undefined;
    const e = await enable({ id: "t1", capabilities: ["author", "review", "approve", "publish"] });
    const s = await GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: { id: "t1", capabilities: ["author", "review", "approve", "publish"] }, requestId: "s", expectedStateVersion: 1 }, deps);
    expect(s.manifest.lifecycleState).toBe("in-review"); expect(s.manifest.reviewWorkflow).toBeUndefined();
    const a = await GOV.approve(c, { examId: "EX-1", actor: { id: "t1", capabilities: ["approve"] }, requestId: "a", expectedStateVersion: 2 }, deps);
    expect(a.manifest.lifecycleState).toBe("approved");
    const d = await GOV.returnToDraft(c, { examId: "EX-1", actor: { id: "t1", capabilities: ["author"] }, requestId: "d", expectedStateVersion: 3 }, deps);
    expect(d.manifest.lifecycleState).toBe("draft");
  });
  it("W5 — in Assigned mode a submission WITHOUT assignments is refused (never downgraded to the single-teacher flow)", async () => {
    const e = await enable();
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: AUTHOR, requestId: "s", expectedStateVersion: 1 }, deps), 400, "WORKFLOW_ASSIGNMENT_INVALID");
    expect(manifest().lifecycleState).toBe("draft");
  });
});

describe("14B W — Reviewer decisions", () => {
  it("W6 — complete review: lifecycle stays in-review, reviewStatus completed, reviewedAt / reviewedBy server values, stateVersion + eventCount advance, immutable event + decision record", async () => {
    const m = await submitted();
    const r = await decide(m, "complete-review", REVIEWER, { note: "  تمت المراجعة، لا ملاحظات  ", reviewedBy: "evil", reviewedAt: "1999-01-01T00:00:00.000Z" });
    expect(r.manifest.lifecycleState).toBe("in-review");
    expect(r.manifest.reviewWorkflow).toMatchObject({ cycleId: m.reviewWorkflow.cycleId, reviewStatus: "completed", reviewedBy: REVIEWER.id });
    expect(r.manifest.reviewWorkflow.reviewedAt).toBe(r.manifest.updatedAt); expect(r.manifest.reviewedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(r.manifest.stateVersion).toBe(m.stateVersion + 1); expect(r.manifest.eventCount).toBe(m.eventCount + 1);
    const evs = events(); expect(evs[evs.length - 1]).toMatchObject({ type: "review-completed", actorId: REVIEWER.id, sequence: r.manifest.eventCount, fromState: "in-review", toState: "in-review" });
    expect(JSON.stringify(evs)).not.toMatch(/تمت المراجعة/);                         // the note never enters the audit event
    const ds = decisions(); expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ schemaVersion: 1, examId: "EX-1", cycleId: m.reviewWorkflow.cycleId, revisionId: m.reviewRevisionId, stage: "review", decision: "review-completed", actorId: REVIEWER.id, note: "تمت المراجعة، لا ملاحظات" });
    expect(ds[0].occurredAt).toBe(r.manifest.reviewWorkflow.reviewedAt);
    expect(r.manifest.reviewWorkflow.reviewDecisionId).toBe(ds[0].decisionId);
    expect(model.validateManifest(manifest())).toEqual([]);
  });
  it("W7 — only the ASSIGNED reviewer may complete / request changes: an unassigned holder of `review`, the approver and the author are refused (403), nothing changes", async () => {
    const m = await submitted();
    for (const a of [OUTSIDER, APPROVER, AUTHOR, { ...AUTHOR, capabilities: ["author", "review"] }]) {
      await expectErr(decide(m, "complete-review", a, {}, "R-cr-" + a.id), 403);
      await expectErr(decide(m, "request-changes", a, { note: "x" }, "R-rc-" + a.id), 403);
    }
    expect(manifest().stateVersion).toBe(m.stateVersion); expect(decisions()).toEqual([]);
  });
  it("W8 — request changes REQUIRES a note (empty / whitespace / oversized refused, nothing written); with a note the exam returns to draft, the cycle becomes history, the publication pointer is untouched", async () => {
    const e = await enable(); const s = await submit(e.manifest); const r = await decide(s.manifest, "complete-review", REVIEWER); const a = await approve(r.manifest); const p = await publish(a.manifest);
    const d1 = await toDraft(p.manifest);                                                   // new lineage after publication (author)
    const rev2 = await GOV.createRevision(c, { examId: "EX-1", exam: validExam({ title: "v2" }), actor: AUTHOR, requestId: "R-rev2", expectedStateVersion: d1.manifest.stateVersion }, deps);
    const s2 = await submit(rev2.manifest, "R-submit-2");
    const decisionsBefore = decisions().length;
    for (const note of [undefined, "", "   \n\t ", "x".repeat(2001)]) await expectErr(decide(s2.manifest, "request-changes", REVIEWER, { note }, "R-rc-" + String(note).length), 400);
    expect(manifest().lifecycleState).toBe("in-review"); expect(decisions()).toHaveLength(decisionsBefore);   // nothing written for a refused note
    const rc = await decide(s2.manifest, "request-changes", REVIEWER, { note: "أعد صياغة السؤال الثاني" });
    expect(rc.manifest).toMatchObject({ lifecycleState: "draft", publishedRevisionId: p.manifest.publishedRevisionId, publishedRevisionNumber: 1 });
    expect(rc.manifest.reviewWorkflow).toBeUndefined(); expect(rc.manifest.reviewRevisionId).toBeUndefined();
    expect(rc.manifest.lastDecision).toMatchObject({ stage: "review", decision: "changes-requested", actorId: REVIEWER.id, cycleId: s2.manifest.reviewWorkflow.cycleId, revisionId: rev2.manifest.latestRevisionId });
    const ds = decisions(); expect(ds[ds.length - 1]).toMatchObject({ decision: "changes-requested", note: "أعد صياغة السؤال الثاني", actorId: REVIEWER.id, decisionId: rc.manifest.lastDecision.decisionId });
    const evs = events(); expect(evs[evs.length - 1]).toMatchObject({ type: "changes-requested", fromState: "in-review", toState: "draft", decisionId: rc.manifest.lastDecision.decisionId });
    expect(JSON.stringify(evs)).not.toMatch(/أعد صياغة/);
    // a new content revision must enter a NEW cycle: resubmitting creates a different cycleId
    const rev3 = await GOV.createRevision(c, { examId: "EX-1", exam: validExam({ title: "v3" }), actor: AUTHOR, requestId: "R-rev3", expectedStateVersion: rc.manifest.stateVersion }, deps);
    const s3 = await submit(rev3.manifest, "R-submit-3");
    expect(s3.manifest.reviewWorkflow.cycleId).not.toBe(s2.manifest.reviewWorkflow.cycleId);
    expect(s3.manifest.reviewWorkflow.revisionId).toBe(rev3.manifest.latestRevisionId);
  });
});

describe("14B W — Approver decisions", () => {
  it("W9 — approval is impossible before the reviewer completed review, even for the assigned approver (409 REVIEW_NOT_COMPLETED)", async () => {
    const m = await submitted();
    await expectErr(approve(m), 409, "REVIEW_NOT_COMPLETED");
    expect(manifest().lifecycleState).toBe("in-review"); expect(manifest().stateVersion).toBe(m.stateVersion);
  });
  it("W10 — only the ASSIGNED approver may approve: an unassigned `approve` holder, the reviewer and the author are refused; the assigned approver binds the review revision through the 14A authority", async () => {
    const m = await reviewed();
    for (const a of [OUTSIDER, REVIEWER, { ...AUTHOR, capabilities: ["author", "approve"] }, { id: REVIEWER.id, capabilities: ["review", "approve"] }]) await expectErr(approve(m, a, "R-a-" + a.id), 403);
    const a = await approve(m, APPROVER, "R-approve", { revisionId: "rev-evil", approvedBy: "evil", note: "موافق" });
    expect(a.manifest).toMatchObject({ lifecycleState: "approved", approvedRevisionId: m.reviewRevisionId, approvedBy: APPROVER.id });
    expect(a.manifest.reviewWorkflow).toMatchObject({ cycleId: m.reviewWorkflow.cycleId, reviewStatus: "completed", approvedBy: APPROVER.id });
    expect(a.manifest.reviewWorkflow.approvedAt).toBe(a.manifest.approvedAt);
    const ds = decisions(); expect(ds[ds.length - 1]).toMatchObject({ stage: "approval", decision: "approved", note: "موافق", actorId: APPROVER.id });
    expect(model.validateManifest(manifest())).toEqual([]);
  });
  it("W11 — reject approval REQUIRES a note and returns to draft with a persisted decision; only the assigned approver after completed review", async () => {
    const m = await reviewed();
    await expectErr(decide(m, "reject-approval", APPROVER, {}), 400, "NOTE_REQUIRED");
    await expectErr(decide(m, "reject-approval", OUTSIDER, { note: "x" }), 403);
    await expectErr(decide(m, "reject-approval", REVIEWER, { note: "x" }), 403);
    const r = await decide(m, "reject-approval", APPROVER, { note: "الأوزان غير متوازنة" });
    expect(r.manifest).toMatchObject({ lifecycleState: "draft" }); expect(r.manifest.reviewWorkflow).toBeUndefined(); expect(r.manifest.approvedRevisionId).toBeUndefined();
    expect(r.manifest.lastDecision).toMatchObject({ stage: "approval", decision: "approval-rejected", actorId: APPROVER.id });
    expect(decisions().some(d => d.decision === "approval-rejected" && d.note === "الأوزان غير متوازنة")).toBe(true);
    expect(events()[events().length - 1]).toMatchObject({ type: "approval-rejected", toState: "draft" });
    // before review completion the approver cannot reject either (the approver task does not exist yet)
    const m2 = await (async () => { const rev = await GOV.createRevision(c, { examId: "EX-1", exam: validExam({ title: "v2" }), actor: AUTHOR, requestId: "R-rev2", expectedStateVersion: r.manifest.stateVersion }, deps); return (await submit(rev.manifest, "R-submit-2")).manifest; })();
    await expectErr(decide(m2, "reject-approval", APPROVER, { note: "x" }, "R-ra-early"), 409, "REVIEW_NOT_COMPLETED");
  });
});

describe("14B W — Publisher, withdrawal and the bypass rule", () => {
  it("W12 — only the ASSIGNED publisher may publish the approved revision of the SAME cycle; the 14A publication authority is reused (publishedRevisionId = approvedRevisionId, server time / actor)", async () => {
    const m = await approved();
    for (const a of [OUTSIDER, APPROVER, REVIEWER, { ...AUTHOR, capabilities: ["author", "publish"] }]) await expectErr(publish(m, a, "R-p-" + a.id), 403);
    const p = await publish(m);
    expect(p.manifest).toMatchObject({ lifecycleState: "published", publishedRevisionId: m.approvedRevisionId, publishedBy: PUBLISHER.id });
    expect(p.manifest.reviewWorkflow).toMatchObject({ cycleId: m.reviewWorkflow.cycleId, publishedBy: PUBLISHER.id });
    expect(model.validateManifest(manifest())).toEqual([]);
    const published = await GOV.loadPublishedRevision(c, "EX-1", deps);
    expect(published.revisionId).toBe(m.approvedRevisionId);
    // after publication the AUTHOR opens a new lineage (published → draft); the publication and the completed cycle stay historical
    const d = await toDraft(p.manifest);
    expect(d.manifest).toMatchObject({ lifecycleState: "draft", publishedRevisionId: m.approvedRevisionId }); expect(d.manifest.reviewWorkflow).toBeUndefined();
    await expectErr(toDraft(p.manifest, OUTSIDER, "R-draft-outsider"), 403);
  });
  it("W13 — the assigned publisher may refuse publication with a REQUIRED note (approved → draft); nobody else can", async () => {
    const m = await approved();
    await expectErr(decide(m, "reject-publication", PUBLISHER, {}), 400, "NOTE_REQUIRED");
    for (const a of [OUTSIDER, APPROVER, AUTHOR]) await expectErr(decide(m, "reject-publication", a, { note: "x" }, "R-rp-" + a.id), 403);
    const r = await decide(m, "reject-publication", PUBLISHER, { note: "تاريخ الامتحان غير مناسب" });
    expect(r.manifest.lifecycleState).toBe("draft"); expect(r.manifest.reviewWorkflow).toBeUndefined();
    expect(r.manifest.lastDecision).toMatchObject({ stage: "publication", decision: "publication-rejected", actorId: PUBLISHER.id });
    expect(decisions()[decisions().length - 1]).toMatchObject({ decision: "publication-rejected", note: "تاريخ الامتحان غير مناسب" });
    expect(events()[events().length - 1]).toMatchObject({ type: "publication-rejected", fromState: "approved", toState: "draft" });
  });
  it("W14 — the cycle AUTHOR may withdraw an item still under review (optional note); another author, the reviewer and the approver cannot", async () => {
    const m = await submitted();
    const otherAuthor = { id: "teacher-author-2", capabilities: ["author"] };
    deps.directory = directory([AUTHOR, otherAuthor, REVIEWER, APPROVER, PUBLISHER, OUTSIDER]);
    for (const a of [otherAuthor, REVIEWER, APPROVER, OUTSIDER]) await expectErr(decide(m, "withdraw-review", a, {}, "R-w-" + a.id), 403);
    const w = await decide(m, "withdraw-review", AUTHOR, { note: "سأضيف سؤالًا" });
    expect(w.manifest.lifecycleState).toBe("draft"); expect(w.manifest.reviewWorkflow).toBeUndefined();
    expect(w.manifest.lastDecision).toMatchObject({ stage: "author", decision: "withdrawn", actorId: AUTHOR.id });
    expect(events()[events().length - 1]).toMatchObject({ type: "review-withdrawn", actorId: AUTHOR.id, toState: "draft" });
    expect(decisions()[decisions().length - 1]).toMatchObject({ decision: "withdrawn", note: "سأضيف سؤالًا", actorId: AUTHOR.id });
  });
  it("W15 — BYPASS RULE: while a workflow cycle is active the generic return-to-draft is refused for everyone (409 WORKFLOW_ACTION_REQUIRED); explicit workflow actions are the only way out", async () => {
    const m = await submitted();
    // holders of the generic return-to-draft capability (author / review from in-review) hit the workflow rule; everyone else stays refused by capability
    for (const a of [AUTHOR, REVIEWER, OUTSIDER, { id: AUTHOR.id, capabilities: ["author", "review", "approve", "publish"] }]) await expectErr(toDraft(m, a, "R-d-" + a.id + a.capabilities.length), 409, "WORKFLOW_ACTION_REQUIRED");
    for (const a of [APPROVER, PUBLISHER]) await expectErr(toDraft(m, a, "R-d-" + a.id), 403);
    expect(manifest().lifecycleState).toBe("in-review"); expect(manifest().stateVersion).toBe(m.stateVersion); expect(decisions()).toEqual([]);
    const a = await approve((await decide(m, "complete-review", REVIEWER)).manifest);
    for (const x of [AUTHOR, APPROVER, OUTSIDER]) await expectErr(toDraft(a.manifest, x, "R-d2-" + x.id), 409, "WORKFLOW_ACTION_REQUIRED");
    for (const x of [REVIEWER, PUBLISHER]) await expectErr(toDraft(a.manifest, x, "R-d3-" + x.id), 403);
    expect(manifest().lifecycleState).toBe("approved");
  });
  it("W16 — the cycle never retargets: after a return to draft the workflow is gone; approving / publishing against the OLD cycle is refused; a new revision needs a new cycle", async () => {
    const m = await reviewed();
    const w = await decide(m, "withdraw-review", AUTHOR);
    await expectErr(approve(m, APPROVER, "R-approve-old"), 409);                       // stale state (the cycle ended)
    await expectErr(publish(w.manifest, PUBLISHER, "R-publish-old"), 409);            // draft has nothing approved
    const rev = await GOV.createRevision(c, { examId: "EX-1", exam: validExam({ title: "v2" }), actor: AUTHOR, requestId: "R-rev2", expectedStateVersion: w.manifest.stateVersion }, deps);
    const s2 = await submit(rev.manifest, "R-submit-2");
    expect(s2.manifest.reviewWorkflow.cycleId).not.toBe(m.reviewWorkflow.cycleId);
    expect(s2.manifest.reviewWorkflow.reviewStatus).toBe("pending");                   // a fresh cycle starts unreviewed
  });
});

describe("14B W — configuration changes during a cycle (§39) and idempotency (§28)", () => {
  it("W17 — the assigned actor must STILL be assigned AND still hold the capability at action time; a removed actor or a lost capability fails closed, nobody is substituted", async () => {
    const m = await submitted();
    deps.directory = directory([AUTHOR, { id: REVIEWER.id, capabilities: [] }, APPROVER, PUBLISHER, OUTSIDER]);   // reviewer lost `review`
    await expectErr(decide(m, "complete-review", { id: REVIEWER.id, capabilities: [] }), 403);
    await expectErr(decide(m, "complete-review", OUTSIDER, {}, "R-cr-outsider"), 403);
    deps.directory = directory([AUTHOR, APPROVER, PUBLISHER, OUTSIDER]);                                              // reviewer removed entirely
    await expectErr(decide(m, "complete-review", REVIEWER, {}, "R-cr-removed"), 403);
    expect(manifest().reviewWorkflow.reviewerId).toBe(REVIEWER.id);                                                   // never reassigned
    expect(manifest().stateVersion).toBe(m.stateVersion);
    const w = await decide(m, "withdraw-review", AUTHOR);                                                            // the author can still withdraw and resubmit later
    expect(w.manifest.lifecycleState).toBe("draft");
  });
  it("W18 — replaying the SAME committed decision request returns the recorded outcome: one decision record, one event, one stateVersion increment; another command with the same requestId is REQUEST_ID_CONFLICT", async () => {
    const m = await submitted();
    const first = await decide(m, "complete-review", REVIEWER, { note: "ok" }, "R-same");
    const again = await decide(m, "complete-review", REVIEWER, { note: "ok" }, "R-same");
    expect(again.replayed).toBe(true); expect(again.manifest.stateVersion).toBe(first.manifest.stateVersion);
    expect(decisions()).toHaveLength(1); expect(events().filter(e => e.type === "review-completed")).toHaveLength(1);
    expect(manifest().stateVersion).toBe(first.manifest.stateVersion);
    await expectErr(decide(first.manifest, "request-changes", REVIEWER, { note: "different" }, "R-same"), 409, "REQUEST_ID_CONFLICT");
    await expectErr(approve(first.manifest, APPROVER, "R-same"), 409, "REQUEST_ID_CONFLICT");
  });
  it("W19 — decision records are immutable, contain no exam body / credentials, and are listable newest-first with a bounded page; a referenced record is never deleted", async () => {
    const m = await reviewed();
    const rej = await decide(m, "reject-approval", APPROVER, { note: "ملاحظة الاعتماد" });
    const ds = decisions();
    for (const d of ds) { expect(Object.keys(d).sort()).toEqual(["actorId", "cycleId", "decision", "decisionId", "examId", "note", "occurredAt", "revisionId", "revisionNumber", "schemaVersion", "sequence", "stage"]); expect(JSON.stringify(d)).not.toMatch(/sections|questions|token|password/i); }
    const name = mem.names("exam-governance/EX-1/decisions/").find(n => n.includes(rej.manifest.lastDecision.decisionId));
    await expect(GOV.writeDecisionDocument(c, mem.getJson(name))).rejects.toMatchObject({ code: "IMMUTABLE" });
    const page = await GOV.listDecisions(c, { examId: "EX-1", limit: 1 }, deps);
    expect(page.items).toHaveLength(1); expect(page.items[0].decision).toBe("approval-rejected"); expect(page.nextCursor).not.toBeNull();
    const rest = await GOV.listDecisions(c, { examId: "EX-1", cursor: page.nextCursor, limit: 10 }, deps);
    expect(rest.items.map(d => d.decision)).toEqual(["review-completed"]);
    const one = await GOV.loadDecision(c, { examId: "EX-1", decisionId: rej.manifest.lastDecision.decisionId }, deps);
    expect(one.note).toBe("ملاحظة الاعتماد");
    expect(mem.names("exam-governance/EX-1/decisions/")).toHaveLength(2);
  });
});

describe("14B W — manifest workflow validation (fail closed)", () => {
  it("W20 — validateManifest refuses malformed workflow state and accepts 14A manifests without workflow data", async () => {
    await reviewed();
    const good = manifest();
    expect(model.validateManifest(good)).toEqual([]);
    const legacy = { ...good }; delete legacy.reviewWorkflow;                                   // a 14A in-review manifest stays valid
    expect(model.validateManifest(legacy)).toEqual([]);
    const bad = mutate => { const x = JSON.parse(JSON.stringify(good)); mutate(x); return model.validateManifest(x); };
    expect(bad(x => { x.reviewWorkflow.revisionId = "rev-other"; })).not.toEqual([]);           // workflow revision ≠ reviewRevisionId
    expect(bad(x => { delete x.reviewWorkflow.reviewerId; })).not.toEqual([]);
    expect(bad(x => { x.reviewWorkflow.approverId = x.reviewWorkflow.reviewerId; })).not.toEqual([]);   // separation of duties
    expect(bad(x => { x.reviewWorkflow.reviewStatus = "reviewed"; })).not.toEqual([]);
    expect(bad(x => { x.reviewWorkflow.cycleId = ""; })).not.toEqual([]);
    expect(bad(x => { x.lifecycleState = "approved"; x.approvedRevisionId = x.reviewRevisionId; x.reviewWorkflow.reviewStatus = "pending"; })).not.toEqual([]);   // approved without completed review
    expect(bad(x => { x.lifecycleState = "published"; x.approvedRevisionId = x.reviewRevisionId; x.publishedRevisionId = x.latestRevisionId + "x"; x.revisions.push({ revisionId: x.latestRevisionId + "x", revisionNumber: 9 }); })).not.toEqual([]);   // published ≠ the cycle's revision
    expect(bad(x => { x.lifecycleState = "draft"; delete x.reviewRevisionId; })).not.toEqual([]);   // draft never carries an active cycle
    // a malformed workflow never authorizes publication: the loader fails closed
    mem.setJson(model.manifestName("EX-1"), (() => { const x = JSON.parse(JSON.stringify(good)); x.lifecycleState = "published"; x.approvedRevisionId = x.reviewRevisionId; x.publishedRevisionId = x.reviewRevisionId; x.reviewWorkflow.reviewStatus = "pending"; return x; })());
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
  });
});
