import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import { manifestName, eventName } from "../src/lib/exam-governance-model.js";

// Phase 14A — Final Independent Review Blocker (fail-first on cf5b8fc): a committed governance mutation whose audit event is
// still missing must NEVER be pushed out of the bounded command ring unresolved. The server enforces audit continuity:
// before ANY new state-changing mutation, the most recent committed command's event is ensured (repaired from its committed
// descriptor, accepted when identical, AUDIT_INTEGRITY when conflicting, AUDIT_EVENT_PENDING when the repair write fails —
// and then the new mutation does NOT execute). mutation N committed ⇒ event N exists ⇒ only then may mutation N+1 commit.

const ALL = ["author", "review", "approve", "publish"];
const actor = (id = "teacher-1", capabilities = ALL) => ({ id, capabilities });
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

// Storage-fault harness over the faithful memory container: every upload is recorded; `shouldFail(name)` may raise a
// 500-like storage error INSTEAD of writing. Reads / listings untouched.
function faulty(mem) {
  const base = mem.container;
  const state = { shouldFail: () => false, uploads: [] };
  const container = {
    getBlobClient: name => base.getBlobClient(name),
    listBlobsFlat: prefix => base.listBlobsFlat(prefix),
    getBlockBlobClient(name) {
      const real = base.getBlockBlobClient(name);
      return { async upload(...args) { if (state.shouldFail(name)) { const e = new Error("simulated storage outage"); e.statusCode = 500; throw e; } state.uploads.push(name); return real.upload(...args); } };
    }
  };
  return { container, state };
}
const failWhile = (state, pattern) => { state.shouldFail = name => pattern.test(name); };
const noFail = state => { state.shouldFail = () => false; };
const expectErr = async (p, status, code) => { let e = null; try { await p; } catch (x) { e = x; } expect(e, "expected an error").not.toBeNull(); expect(e.status, e.message).toBe(status); if (code) expect(e.code).toBe(code); return e; };

let mem, f, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => { mem = createMemoryContainer(); f = faulty(mem); c = f.container; clock = Date.parse("2026-10-02T08:00:00.000Z"); deps = { now: tick }; });
const events = () => mem.names("exam-governance/EX-1/events/").sort().map(n => mem.getJson(n));
const manifest = () => mem.getJson(manifestName("EX-1"));
const enable = () => GOV.enableGovernance(c, { examId: "EX-1", exam: validExam(), actor: actor(), requestId: "req-enable" }, deps);
const rev = (title, sv, requestId) => GOV.createRevision(c, { examId: "EX-1", exam: validExam({ title }), actor: actor(), requestId, expectedStateVersion: sv }, deps);
const submit = (m, requestId) => GOV.submitForReview(c, { examId: "EX-1", revisionId: m.latestRevisionId, actor: actor(), requestId, expectedStateVersion: m.stateVersion }, deps);
const approve = (m, requestId) => GOV.approve(c, { examId: "EX-1", actor: actor(), requestId, expectedStateVersion: m.stateVersion }, deps);
const publish = (m, requestId, a = actor("publisher-1")) => GOV.publish(c, { examId: "EX-1", actor: a, requestId, expectedStateVersion: m.stateVersion }, deps);
const toDraft = (sv, requestId) => GOV.returnToDraft(c, { examId: "EX-1", actor: actor(), requestId, expectedStateVersion: sv }, deps);
const assertContiguous = () => {
  const m = manifest(); const evs = events();
  expect(evs.length, "event blobs == eventCount").toBe(m.eventCount);
  expect(evs.map(e => e.sequence)).toEqual(evs.map((_, i) => i + 1));
};
// approved → publish whose CAS commits but whose event write fails (the audit gap under test)
async function publishedWithGap() {
  const e = await enable(); const s = await submit(e.manifest, "S1"); const a = await approve(s.manifest, "A1");
  failWhile(f.state, /\/events\//);
  await expect(publish(a.manifest, "P1")).rejects.toBeTruthy();
  const committed = manifest();
  expect(committed).toMatchObject({ lifecycleState: "published", eventCount: 4, stateVersion: 4 });
  expect(events()).toHaveLength(3);
  return committed;
}

describe("Final blocker — server-enforced audit continuity", () => {
  it("F1 — a pending published event blocks the NEXT mutation while storage still fails: 503 AUDIT_EVENT_PENDING, no commit, no stateVersion advance, no new event", async () => {
    const committed = await publishedWithGap();
    const uploadsBefore = f.state.uploads.length;
    await expectErr(toDraft(committed.stateVersion, "D-new"), 503, "AUDIT_EVENT_PENDING");
    expect(manifest()).toEqual(committed);
    expect(events()).toHaveLength(3);
    expect(f.state.uploads.length).toBe(uploadsBefore);                    // nothing was written at all
    expect(manifest().commands.some(x => x.requestId === "D-new")).toBe(false);
  });
  it("F2 — storage recovered: the pending published event is repaired EXACTLY first, then the new mutation proceeds; events contiguous, no duplicate, original actor / time / requestId", async () => {
    const committed = await publishedWithGap();
    noFail(f.state);
    const d = await toDraft(committed.stateVersion, "D-new");
    expect(d.manifest).toMatchObject({ lifecycleState: "draft", stateVersion: 5, eventCount: 5, publishedRevisionId: committed.publishedRevisionId });
    const evs = events();
    expect(evs.map(x => x.type)).toEqual(["governance-enabled", "submitted-for-review", "approved", "published", "returned-to-draft"]);
    const pub = evs[3];
    expect(pub).toMatchObject({ sequence: 4, actorId: "publisher-1", occurredAt: committed.publishedAt, requestId: "P1", revisionId: committed.publishedRevisionId, fromState: "approved", toState: "published" });
    expect(pub.eventId).toBe(committed.commands.find(x => x.requestId === "P1").audit.eventId);
    expect(evs.filter(x => x.type === "published")).toHaveLength(1);
    expect(evs[4]).toMatchObject({ sequence: 5, requestId: "D-new", actorId: "teacher-1" });
    assertContiguous();
  });
  it("F3 — an unresolved audit can never be evicted from the bounded command ring: 70 attempted mutations are all refused until the gap is repaired; afterwards the trail is complete", async () => {
    const committed = await publishedWithGap();
    const pendingName = eventName("EX-1", 4, committed.commands.find(x => x.requestId === "P1").audit.eventId);
    // storage now fails ONLY for the pending event's own blob: a new mutation could write ITS event, but must not be allowed to
    failWhile(f.state, new RegExp(pendingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (let i = 0; i < 70; i++) {
      const m = manifest();
      const attempt = i % 2 === 0 ? toDraft(m.stateVersion, "D" + i) : rev("v" + i, m.stateVersion, "R" + i);
      await expectErr(attempt, 503, "AUDIT_EVENT_PENDING");
      expect(manifest()).toEqual(committed);                                 // never advanced, never re-ringed
    }
    expect(manifest().commands.some(x => x.requestId === "P1")).toBe(true); // the descriptor is still effective
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);   // no revision was created by a refused command
    noFail(f.state);
    const d = await toDraft(committed.stateVersion, "D-final");
    expect(d.manifest.stateVersion).toBe(5);
    expect(events()[3]).toMatchObject({ type: "published", occurredAt: committed.publishedAt, actorId: "publisher-1", requestId: "P1" });
    assertContiguous();
    // and the same requestId replay still works (Review Fix 1 behaviour kept)
    const again = await publish({ stateVersion: 3 }, "P1");
    expect(again.replayed).toBe(true);
    expect(events().filter(x => x.type === "published")).toHaveLength(1);
  });
  it("F4 — a CONFLICTING event at the committed descriptor's authoritative name blocks every newer mutation with AUDIT_INTEGRITY; nothing advances, nothing is overwritten", async () => {
    const committed = await publishedWithGap();
    const cmd = committed.commands.find(x => x.requestId === "P1");
    const name = eventName("EX-1", cmd.audit.sequence, cmd.audit.eventId);
    const forged = { schemaVersion: 1, eventId: cmd.audit.eventId, examId: "EX-1", type: "published", actorId: "intruder", occurredAt: "1999-01-01T00:00:00.000Z", requestId: "P1", sequence: 4 };
    mem.setJson(name, forged);
    noFail(f.state);
    await expectErr(toDraft(committed.stateVersion, "D-new"), 500, "AUDIT_INTEGRITY");
    await expectErr(rev("v2", committed.stateVersion, "R-new"), 500, "AUDIT_INTEGRITY");
    expect(manifest()).toEqual(committed);
    expect(mem.getJson(name)).toEqual(forged);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    expect(events()).toHaveLength(4);
  });
  it("F5 — the normal path stays cheap: when the previous event exists and matches, the next mutation proceeds with exactly one manifest write and one event write, no duplicate event, unchanged lifecycle semantics", async () => {
    const e = await enable(); const s = await submit(e.manifest, "S1"); const a = await approve(s.manifest, "A1"); const p = await publish(a.manifest, "P1");
    expect(events()).toHaveLength(4);
    f.state.uploads.length = 0;
    const d = await toDraft(p.manifest.stateVersion, "D1");
    expect(d.manifest).toMatchObject({ lifecycleState: "draft", stateVersion: 5, eventCount: 5, publishedRevisionId: p.manifest.publishedRevisionId });
    expect(f.state.uploads.filter(n => n.endsWith("manifest.json"))).toHaveLength(1);
    expect(f.state.uploads.filter(n => n.includes("/events/"))).toHaveLength(1);
    expect(f.state.uploads).toHaveLength(2);
    expect(events()).toHaveLength(5);
    assertContiguous();
    // illegal transition still refused without any write
    f.state.uploads.length = 0;
    await expectErr(approve(d.manifest, "A-bad"), 409, "ILLEGAL_TRANSITION");
    expect(f.state.uploads).toHaveLength(0);
  });
  it("F6 — immediate same-request replay is unchanged: repairs the missing event, replayed=true, no second stateVersion increment, no duplicate", async () => {
    const committed = await publishedWithGap();
    noFail(f.state);
    const r = await publish({ stateVersion: 3 }, "P1");
    expect(r.replayed).toBe(true);
    expect(manifest().stateVersion).toBe(committed.stateVersion);
    expect(manifest().publishedAt).toBe(committed.publishedAt);
    expect(events().filter(x => x.type === "published")).toHaveLength(1);
    assertContiguous();
    const again = await publish({ stateVersion: 3 }, "P1");
    expect(again.replayed).toBe(true);
    expect(events()).toHaveLength(4);
  });
  it("enable / createRevision gaps are covered by the same preflight (revision-created event pending blocks the next command until repaired)", async () => {
    const e = await enable();
    failWhile(f.state, /\/events\//);
    await expect(rev("v2", e.manifest.stateVersion, "R2")).rejects.toBeTruthy();
    const committed = manifest();
    expect(committed).toMatchObject({ stateVersion: 2, eventCount: 2 });
    expect(events()).toHaveLength(1);
    await expectErr(submit(committed, "S-new"), 503, "AUDIT_EVENT_PENDING");
    expect(manifest()).toEqual(committed);
    noFail(f.state);
    const s = await submit(committed, "S-new");
    expect(s.manifest.stateVersion).toBe(3);
    expect(events().map(x => x.type)).toEqual(["governance-enabled", "revision-created", "submitted-for-review"]);
    assertContiguous();
  });
});
