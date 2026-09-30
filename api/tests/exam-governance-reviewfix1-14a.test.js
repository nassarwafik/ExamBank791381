import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import { manifestName, eventName } from "../src/lib/exam-governance-model.js";
import { resolveGovernanceCapabilities, describeCapabilitySource } from "../src/lib/exam-governance-capabilities.js";
import { handler as assignments } from "../src/functions/manage-assignments.js";

// Phase 14A — Independent Review Fix 1 (fail-first on e1a7b1d):
//   Blocker 1 — a manifest CAS must never commit without its immutable audit event (commit + audit-repair protocol);
//   Blocker 2 — the published-revision loader must use the ONE validated manifest authority (fail closed on corruption);
//   Blocker 3 — a malformed capability configuration must fail SAFE (zero mutation capabilities), never open;
//   Hardening — a revision written before its metadata / manifest never lingers unreferenced.

const ALL = ["author", "review", "approve", "publish"];
const actor = (id = "teacher-1", capabilities = ALL) => ({ id, capabilities });
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

// A storage-fault harness over the faithful memory container: `shouldFail(name)` is consulted on every upload; a true
// answer raises a 500-like storage error INSTEAD of writing. Reads and listings are untouched.
function faulty(mem) {
  const base = mem.container;
  const state = { shouldFail: () => false, failures: [] };
  const container = {
    getBlobClient: name => base.getBlobClient(name),
    listBlobsFlat: prefix => base.listBlobsFlat(prefix),
    getBlockBlobClient(name) {
      const real = base.getBlockBlobClient(name);
      return { async upload(...args) { if (state.shouldFail(name)) { state.failures.push(name); const e = new Error("simulated storage outage"); e.statusCode = 500; throw e; } return real.upload(...args); } };
    }
  };
  return { container, state };
}
const failOnce = (state, pattern) => { let used = false; state.shouldFail = name => { if (!used && pattern.test(name)) { used = true; return true; } return false; }; };
const failAlways = (state, pattern) => { state.shouldFail = name => pattern.test(name); };
const noFail = state => { state.shouldFail = () => false; };
const expectErr = async (p, status, code) => { let e = null; try { await p; } catch (x) { e = x; } expect(e, "expected an error").not.toBeNull(); expect(e.status, e.message).toBe(status); if (code) expect(e.code).toBe(code); return e; };

let mem, f, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => { mem = createMemoryContainer(); f = faulty(mem); c = f.container; clock = Date.parse("2026-10-01T08:00:00.000Z"); deps = { now: tick }; });
const events = () => mem.names("exam-governance/EX-1/events/").sort().map(n => mem.getJson(n));
const manifest = () => mem.getJson(manifestName("EX-1"));
const enable = (requestId = "req-enable", exam = validExam()) => GOV.enableGovernance(c, { examId: "EX-1", exam, actor: actor(), requestId }, deps);
const rev = (exam, sv, requestId) => GOV.createRevision(c, { examId: "EX-1", exam, actor: actor(), requestId, expectedStateVersion: sv }, deps);
const submit = (m, requestId) => GOV.submitForReview(c, { examId: "EX-1", revisionId: m.latestRevisionId, actor: actor(), requestId, expectedStateVersion: m.stateVersion }, deps);
const approve = (m, requestId) => GOV.approve(c, { examId: "EX-1", actor: actor(), requestId, expectedStateVersion: m.stateVersion }, deps);
const publish = (m, requestId, a = actor()) => GOV.publish(c, { examId: "EX-1", actor: a, requestId, expectedStateVersion: m.stateVersion }, deps);
const toApproved = async () => { const e = await enable(); const s = await submit(e.manifest, "s1"); return approve(s.manifest, "a1"); };
const assertAuditConsistent = () => {
  const m = manifest(); const evs = events();
  expect(evs.length, "event blobs == eventCount").toBe(m.eventCount);
  expect(evs.map(e => e.sequence)).toEqual(evs.map((_, i) => i + 1));
  for (const ev of evs) expect(eventName("EX-1", ev.sequence, ev.eventId)).toBe(mem.names("exam-governance/EX-1/events/").sort()[ev.sequence - 1]);
};

describe("Blocker 1 — commit + audit-repair protocol", () => {
  it("A1 — enable: event write fails after the manifest CAS; the retry of the SAME requestId repairs exactly one event and mutates nothing else", async () => {
    failOnce(f.state, /\/events\//);
    await expect(enable()).rejects.toBeTruthy();
    expect(manifest()).toMatchObject({ stateVersion: 1, eventCount: 1 });
    expect(events()).toHaveLength(0);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    noFail(f.state);
    const r = await enable();
    expect(r.replayed).toBe(true);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    expect(manifest()).toMatchObject({ stateVersion: 1, eventCount: 1 });
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ type: "governance-enabled", sequence: 1, actorId: "teacher-1", requestId: "req-enable", revisionId: manifest().latestRevisionId, toState: "draft" });
    assertAuditConsistent();
  });
  it("A2 — createRevision: revision + manifest commit, event fails; retry repairs one revision-created event, no duplicate revision, no stateVersion increment", async () => {
    const e = await enable();
    failOnce(f.state, /\/events\//);
    await expect(rev(validExam({ title: "v2" }), e.manifest.stateVersion, "R2")).rejects.toBeTruthy();
    expect(manifest()).toMatchObject({ stateVersion: 2, latestRevisionNumber: 2, eventCount: 2 });
    expect(events()).toHaveLength(1);
    noFail(f.state);
    const r = await rev(validExam({ title: "v2 edited meanwhile" }), e.manifest.stateVersion, "R2");
    expect(r.replayed).toBe(true);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(2);
    expect(manifest()).toMatchObject({ stateVersion: 2, latestRevisionNumber: 2, eventCount: 2 });
    expect(events()).toHaveLength(2);
    expect(events()[1]).toMatchObject({ type: "revision-created", sequence: 2, revisionId: manifest().latestRevisionId, fromState: "draft", toState: "draft", requestId: "R2" });
    assertAuditConsistent();
  });
  it("A3 — publish: CAS commits, the published event fails; the retry repairs the exact event; publication time / actor / revision stay the original server values; no second transition", async () => {
    const a = await toApproved();
    failOnce(f.state, /\/events\//);
    await expect(publish(a.manifest, "P1", actor("publisher-1"))).rejects.toBeTruthy();
    const committed = manifest();
    expect(committed).toMatchObject({ lifecycleState: "published", publishedRevisionId: a.manifest.approvedRevisionId, publishedBy: "publisher-1", stateVersion: a.manifest.stateVersion + 1, eventCount: 4 });
    expect(events().filter(x => x.type === "published")).toHaveLength(0);
    noFail(f.state);
    const r = await publish(a.manifest, "P1", actor("publisher-1"));
    expect(r.replayed).toBe(true);
    const after = manifest();
    expect(after.publishedAt).toBe(committed.publishedAt);
    expect(after.publishedBy).toBe("publisher-1");
    expect(after.stateVersion).toBe(committed.stateVersion);
    expect(after.publishedRevisionId).toBe(committed.publishedRevisionId);
    const pub = events().filter(x => x.type === "published");
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ sequence: 4, actorId: "publisher-1", occurredAt: committed.publishedAt, revisionId: committed.publishedRevisionId, fromState: "approved", toState: "published", requestId: "P1" });
    assertAuditConsistent();
  });
  it("A4 — replay with the event already present: no duplicate event, replay succeeds", async () => {
    const a = await toApproved();
    const p = await publish(a.manifest, "P1");
    expect(events()).toHaveLength(4);
    const again = await publish(a.manifest, "P1");
    expect(again.replayed).toBe(true);
    expect(again.manifest.publishedAt).toBe(p.manifest.publishedAt);
    expect(events()).toHaveLength(4);
    assertAuditConsistent();
  });
  it("A5 — an event at the authoritative name that CONFLICTS with the committed descriptor fails closed and is never overwritten", async () => {
    const a = await toApproved();
    failOnce(f.state, /\/events\//);
    await expect(publish(a.manifest, "P1")).rejects.toBeTruthy();
    const m = manifest();
    const cmd = m.commands.find(x => x.requestId === "P1");
    expect(cmd.audit).toMatchObject({ sequence: 4, type: "published" });
    const name = eventName("EX-1", cmd.audit.sequence, cmd.audit.eventId);
    const forged = { schemaVersion: 1, eventId: cmd.audit.eventId, examId: "EX-1", type: "published", actorId: "intruder", occurredAt: "1999-01-01T00:00:00.000Z", requestId: "P1", sequence: 4 };
    mem.setJson(name, forged);
    noFail(f.state);
    await expectErr(publish(a.manifest, "P1"), 500, "AUDIT_INTEGRITY");
    expect(mem.getJson(name)).toEqual(forged);
    expect(manifest().stateVersion).toBe(m.stateVersion);
  });
  it("repair failure is NOT a successful replay: a retryable error, committed state untouched, and a later retry still repairs", async () => {
    const a = await toApproved();
    failAlways(f.state, /\/events\//);
    await expect(publish(a.manifest, "P1")).rejects.toBeTruthy();
    const committed = manifest();
    const e = await expectErr(publish(a.manifest, "P1"), 503, "AUDIT_EVENT_PENDING");
    expect(e.message).toBeTruthy();
    expect(manifest()).toEqual(committed);
    expect(events().filter(x => x.type === "published")).toHaveLength(0);
    noFail(f.state);
    const r = await publish(a.manifest, "P1");
    expect(r.replayed).toBe(true);
    expect(events().filter(x => x.type === "published")).toHaveLength(1);
    assertAuditConsistent();
  });
  it("A6 — after a mix of repaired and normal commands, eventCount equals the persisted, contiguous event sequence (no holes)", async () => {
    failOnce(f.state, /\/events\//);
    await expect(enable()).rejects.toBeTruthy();
    noFail(f.state); await enable();
    let m = manifest();
    failOnce(f.state, /\/events\//);
    await expect(rev(validExam({ title: "v2" }), m.stateVersion, "R2")).rejects.toBeTruthy();
    noFail(f.state); await rev(validExam({ title: "v2" }), m.stateVersion, "R2");
    m = manifest();
    const s = await submit(m, "S1");
    failOnce(f.state, /\/events\//);
    await expect(approve(s.manifest, "A1")).rejects.toBeTruthy();
    noFail(f.state); const a = await approve(s.manifest, "A1");
    const p = await publish(a.manifest, "P1");
    expect(p.manifest.eventCount).toBe(5);
    expect(events().map(x => x.type)).toEqual(["governance-enabled", "revision-created", "submitted-for-review", "approved", "published"]);
    assertAuditConsistent();
  });
  it("a losing CAS never leaves a false event (the event is created only after the manifest committed)", async () => {
    const e = await enable();
    let fired = false;
    const racy = createMemoryContainer({}, { beforeConditionalUpload: (name, api) => { if (fired || !name.endsWith("manifest.json")) return; fired = true; const cur = api.getJson(name); api.setJson(name, { ...cur, stateVersion: cur.stateVersion + 1, lifecycleState: "in-review", reviewRevisionId: cur.latestRevisionId }); } });
    for (const n of mem.names("")) racy.setJson(n, mem.getJson(n));
    await expectErr(GOV.submitForReview(racy.container, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "loser", expectedStateVersion: 1 }, deps), 409, "STALE_STATE");
    expect(racy.names("exam-governance/EX-1/events/")).toHaveLength(1);
  });
});

describe("Blocker 2 — the published loader uses the ONE validated manifest authority", () => {
  const corrupt = mutate => { const m = manifest(); mutate(m); mem.setJson(manifestName("EX-1"), m); };
  const publishedSetup = async () => { const a = await toApproved(); return publish(a.manifest, "P1"); };
  it("M1 — invalid lifecycleState → MANIFEST_CORRUPT (never the revision, even though it is hash-valid)", async () => {
    await publishedSetup();
    corrupt(m => { m.lifecycleState = "final"; });
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
  });
  it("M2 — invalid stateVersion → fail closed", async () => {
    await publishedSetup();
    corrupt(m => { m.stateVersion = "4"; });
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
  });
  it("M3 — malformed lineage / pointer contract → fail closed (published without pointer; pointer outside the lineage; lineage missing)", async () => {
    await publishedSetup();
    const good = manifest();
    corrupt(m => { m.revisions = "not-a-lineage"; });
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
    mem.setJson(manifestName("EX-1"), good);
    corrupt(m => { m.revisions = []; });
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
    mem.setJson(manifestName("EX-1"), good);
    corrupt(m => { m.approvedRevisionId = "ghost"; });
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
    mem.setJson(manifestName("EX-1"), good);
    expect((await GOV.loadPublishedRevision(c, "EX-1", deps)).revisionId).toBe(good.publishedRevisionId);
  });
  it("M4 — assignment path: malformed manifest with a valid published revision → creation refused, nothing stored, browser snapshot unused, no legacy fallback", async () => {
    await publishedSetup();
    corrupt(m => { m.lifecycleState = "final"; });
    mem.setJson("platform/classes/c1.json", { classId: "c1", name: "الصف", active: true });
    const adeps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1", role: "teacher" } }), getContainer: () => c, ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
    const r = await assignments({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot: validExam({ title: "من المتصفح" }) }) }, adeps);
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.jsonBody.code).toBe("MANIFEST_CORRUPT");
    expect(mem.names("platform/assignments/")).toEqual([]);
    await expectErr(GOV.resolveGovernedExamSource(c, "EX-1", deps), 500, "MANIFEST_CORRUPT");
  });
  it("M5 — an absent manifest stays legacy (not governed); a present valid one is governed", async () => {
    expect(await GOV.resolveGovernedExamSource(c, "EX-1", deps)).toEqual({ governed: false });
    await publishedSetup();
    expect((await GOV.resolveGovernedExamSource(c, "EX-1", deps)).governed).toBe(true);
  });
});

describe("Blocker 3 — malformed capability configuration fails SAFE", () => {
  const teacher = { role: "teacher", sub: "t1" };
  it("C1 — no variable: the documented single-teacher baseline", () => {
    expect(resolveGovernanceCapabilities(teacher, {})).toEqual(ALL);
    expect(resolveGovernanceCapabilities(teacher, { GOVERNANCE_CAPABILITIES: "" })).toEqual(ALL);
    expect(describeCapabilitySource({})).toBe("default-single-teacher");
  });
  it("C2 — valid configuration: subject mapping unchanged", () => {
    const env = { GOVERNANCE_CAPABILITIES: JSON.stringify({ default: ["author"], users: { approver: ["approve", "publish"] } }) };
    expect(resolveGovernanceCapabilities(teacher, env)).toEqual(["author"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "approver" }, env)).toEqual(["approve", "publish"]);
    expect(describeCapabilitySource(env)).toBe("configured");
  });
  it("C3 — malformed NON-EMPTY configuration: ZERO capabilities for every teacher, reported as configuration-error", () => {
    for (const raw of ["{not json", "[\"author\"]", "42", "{\"default\":[\"author\"],", "null"]) {
      expect(resolveGovernanceCapabilities(teacher, { GOVERNANCE_CAPABILITIES: raw }), raw).toEqual([]);
      expect(describeCapabilitySource({ GOVERNANCE_CAPABILITIES: raw }), raw).toBe("configuration-error");
    }
  });
  it("C5 — client-supplied role / capabilities never override the server configuration", () => {
    const env = { GOVERNANCE_CAPABILITIES: JSON.stringify({ default: ["author"] }) };
    expect(resolveGovernanceCapabilities({ ...teacher, capabilities: ALL, governanceRole: "approver", role: "teacher" }, env)).toEqual(["author"]);
    expect(resolveGovernanceCapabilities({ role: "student", sub: "s1", capabilities: ALL }, env)).toEqual([]);
    expect(resolveGovernanceCapabilities({ role: "approver", sub: "s1" }, {})).toEqual([]);
  });
});

describe("Hardening — partial pre-CAS artifacts never linger", () => {
  it("enable: revision written, metadata write fails → no manifest, no orphan revision", async () => {
    failOnce(f.state, /\/revision-meta\//);
    await expect(enable()).rejects.toBeTruthy();
    expect(mem.has(manifestName("EX-1"))).toBe(false);
    expect(mem.names("exam-governance/EX-1/revisions/")).toEqual([]);
    expect(mem.names("exam-governance/EX-1/revision-meta/")).toEqual([]);
    noFail(f.state);
    const r = await enable();
    expect(r.replayed).toBe(false);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
  });
  it("createRevision: revision written, metadata write fails → manifest unchanged, no orphan revision; the same requestId then succeeds normally", async () => {
    const e = await enable();
    const before = JSON.stringify(manifest());
    failOnce(f.state, /\/revision-meta\//);
    await expect(rev(validExam({ title: "v2" }), e.manifest.stateVersion, "R2")).rejects.toBeTruthy();
    expect(JSON.stringify(manifest())).toBe(before);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    expect(mem.names("exam-governance/EX-1/revision-meta/")).toHaveLength(1);
    noFail(f.state);
    const r = await rev(validExam({ title: "v2" }), e.manifest.stateVersion, "R2");
    expect(r.created).toBe(true); expect(r.replayed).toBe(false);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(2);
    expect(mem.names("exam-governance/EX-1/revision-meta/")).toHaveLength(2);
  });
  it("createRevision: both written, manifest CAS loses → both cleaned (unchanged behaviour)", async () => {
    const e = await enable();
    let fired = false;
    const racy = createMemoryContainer({}, { beforeConditionalUpload: (name, api) => { if (fired || !name.endsWith("manifest.json")) return; fired = true; const cur = api.getJson(name); api.setJson(name, { ...cur, stateVersion: cur.stateVersion + 1 }); } });
    for (const n of mem.names("")) racy.setJson(n, mem.getJson(n));
    await expectErr(GOV.createRevision(racy.container, { examId: "EX-1", exam: validExam({ title: "v2" }), actor: actor(), requestId: "R2", expectedStateVersion: e.manifest.stateVersion }, deps), 409, "STALE_STATE");
    expect(racy.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    expect(racy.names("exam-governance/EX-1/revision-meta/")).toHaveLength(1);
  });
});
