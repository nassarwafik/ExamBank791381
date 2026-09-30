import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import { manifestName, revisionName, revisionMetaName, eventName } from "../src/lib/exam-governance-model.js";
import { canonicalizeExamContent, contentHashOf } from "../src/lib/exam-canonical.js";
import { resolveGovernanceCapabilities } from "../src/lib/exam-governance-capabilities.js";

// Phase 14A — the server-owned governance authority, driven through the REAL platform-storage optimistic-concurrency
// helpers against the faithful in-memory container (ETag CAS semantics). Fail-first on 6918ce1: G1 manifest, G2
// immutable revisions, G3 legal transitions, G4 CAS, G5 immutable audit events, G6 server finalization gate, G7 publish
// authority, G10 capability enforcement.

const ALL = ["author", "review", "approve", "publish"];
const actor = (id = "teacher-1", capabilities = ALL) => ({ id, capabilities });
const mcq = (id, marks = 2, over = {}) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-09-01T00:00:00.000Z",
  sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });
const brokenExam = () => validExam({ sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", 2, { answer: undefined })] }] });   // structural error: no auto-grade key

let mem, c, clock, deps;
const tick = () => { clock += 1000; return new Date(clock).toISOString(); };
beforeEach(() => {
  mem = createMemoryContainer(); c = mem.container; clock = Date.parse("2026-09-30T10:00:00.000Z");
  deps = { now: tick };
});
const enable = (exam = validExam(), a = actor(), requestId = "req-enable") => GOV.enableGovernance(c, { examId: exam.examId, exam, actor: a, requestId }, deps);
const rev = (exam, sv, requestId = "req-rev-" + sv, a = actor()) => GOV.createRevision(c, { examId: exam.examId, exam, actor: a, requestId, expectedStateVersion: sv }, deps);
const submit = (m, requestId = "req-submit-" + m.stateVersion, a = actor(), extra = {}) => GOV.submitForReview(c, { examId: m.examId, revisionId: m.latestRevisionId, actor: a, requestId, expectedStateVersion: m.stateVersion, ...extra }, deps);
const approve = (m, requestId = "req-approve-" + m.stateVersion, a = actor(), extra = {}) => GOV.approve(c, { examId: m.examId, actor: a, requestId, expectedStateVersion: m.stateVersion, ...extra }, deps);
const publish = (m, requestId = "req-publish-" + m.stateVersion, a = actor(), extra = {}) => GOV.publish(c, { examId: m.examId, actor: a, requestId, expectedStateVersion: m.stateVersion, ...extra }, deps);
const toDraft = (m, requestId = "req-draft-" + m.stateVersion, a = actor()) => GOV.returnToDraft(c, { examId: m.examId, actor: a, requestId, expectedStateVersion: m.stateVersion }, deps);
const status = (examId = "EX-1") => GOV.getGovernanceStatus(c, examId, deps);
const expectErr = async (p, status, code) => { let e = null; try { await p; } catch (x) { e = x; } expect(e, "expected an error").not.toBeNull(); expect(e.status, e.message).toBe(status); if (code) expect(e.code).toBe(code); return e; };
const events = () => mem.names("exam-governance/EX-1/events/").sort().map(n => mem.getJson(n));
const fullCycle = async () => { const e = await enable(); const s = await submit(e.manifest); const a = await approve(s.manifest); return publish(a.manifest); };

describe("14A G1 — server governance manifest (opt-in, never inferred)", () => {
  it("a legacy exam has no governance: status is not governed and reading it creates NO blob", async () => {
    mem.setJson("exams/EX-1.json", { kind: "saved-exam", exam: validExam({ status: "final" }) });
    const s = await status();
    expect(s).toEqual({ governed: false, manifest: null });
    expect(mem.names("exam-governance/")).toEqual([]);
  });
  it("enableGovernance creates manifest + immutable revision 1 + one event with server timestamp/actor; an old status:final is NOT treated as published", async () => {
    const r = await enable(validExam({ status: "final" }));
    expect(r.manifest).toMatchObject({ examId: "EX-1", lifecycleState: "draft", stateVersion: 1, latestRevisionNumber: 1, createdBy: "teacher-1" });
    expect(r.manifest.publishedRevisionId).toBeUndefined();
    expect(mem.has(manifestName("EX-1"))).toBe(true);
    expect(mem.has(revisionName("EX-1", r.manifest.latestRevisionId))).toBe(true);
    expect(mem.has(revisionMetaName("EX-1", 1, r.manifest.latestRevisionId))).toBe(true);
    const stored = mem.getJson(revisionName("EX-1", r.manifest.latestRevisionId));
    expect(stored).toMatchObject({ schemaVersion: 1, examId: "EX-1", revisionNumber: 1, createdBy: "teacher-1", createdAt: "2026-09-30T10:00:01.000Z" });
    expect(stored.contentHash).toBe(contentHashOf(canonicalizeExamContent(validExam({ status: "final" }))));
    expect(stored.exam).toEqual(canonicalizeExamContent(validExam({ status: "final" })));
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ type: "governance-enabled", examId: "EX-1", actorId: "teacher-1", requestId: "req-enable", revisionId: r.manifest.latestRevisionId, toState: "draft" });
    expect((await status()).governed).toBe(true);
  });
  it("enabling twice is a conflict (no second manifest, no second revision); the exam id in the body must match", async () => {
    await enable();
    await expectErr(enable(validExam(), actor(), "req-enable-2"), 409, "ALREADY_GOVERNED");
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    await expectErr(GOV.enableGovernance(c, { examId: "EX-2", exam: validExam({ examId: "EX-9" }), actor: actor(), requestId: "x" }, deps), 400, "INVALID");
    await expectErr(GOV.enableGovernance(c, { examId: "../x", exam: validExam({ examId: "../x" }), actor: actor(), requestId: "x" }, deps), 400, "INVALID");
  });
});

describe("14A G2 — immutable revisions", () => {
  it("r1 then r2: monotonic numbers, r1 bytes unchanged, r2 sourceRevisionId = r1, hashes stable; identical content creates no new revision", async () => {
    const e = await enable();
    const r1Name = revisionName("EX-1", e.manifest.latestRevisionId);
    const r1Bytes = mem.store.get(r1Name).content.toString("utf8");
    const changed = validExam({ title: "امتحان معدّل" });
    const r2 = await rev(changed, e.manifest.stateVersion);
    expect(r2.created).toBe(true);
    expect(r2.manifest.latestRevisionNumber).toBe(2);
    expect(r2.manifest.stateVersion).toBe(2);
    expect(r2.revision.sourceRevisionId).toBe(e.manifest.latestRevisionId);
    expect(mem.store.get(r1Name).content.toString("utf8")).toBe(r1Bytes);
    expect(r2.revision.contentHash).toBe(contentHashOf(canonicalizeExamContent(changed)));
    const again = await rev(changed, r2.manifest.stateVersion, "req-rev-same");
    expect(again.created).toBe(false);
    expect(again.manifest.latestRevisionNumber).toBe(2);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(2);
  });
  it("a revision blob can never be overwritten (create-only write) — P3", async () => {
    const e = await enable();
    await expectErr(GOV.writeRevisionDocument(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, revisionNumber: 1, createdAt: "x", createdBy: "x", contentHash: "0".repeat(64), exam: validExam() }), 409, "IMMUTABLE");
    const stored = mem.getJson(revisionName("EX-1", e.manifest.latestRevisionId));
    expect(stored.createdBy).toBe("teacher-1");
  });
  it("createRevision requires draft state, the author capability and a matching exam id; the exam body is canonicalized (signed bank URLs never persisted)", async () => {
    const e = await enable();
    const s = await submit(e.manifest);
    await expectErr(rev(validExam({ title: "x" }), s.manifest.stateVersion, "req-rev-frozen"), 409, "ILLEGAL_TRANSITION");
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
    const d = await toDraft(s.manifest);
    await expectErr(rev(validExam({ title: "x" }), d.manifest.stateVersion, "req-rev-noauth", actor("t2", ["review"])), 403, "FORBIDDEN");
    await expectErr(GOV.createRevision(c, { examId: "EX-1", exam: validExam({ examId: "OTHER" }), actor: actor(), requestId: "req-rev-badid", expectedStateVersion: d.manifest.stateVersion }, deps), 400, "INVALID");
    const bank = { id: "img", origin: "bank", blobName: "bank/img.png", contentType: "image/png", dataUrl: "/api/question-image?blob=bank/img.png&exp=1&sig=s" };
    const withBank = validExam({ title: "y", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", 2, { image: { exists: true, visible: true, assets: [bank] } })] }] });
    const r = await rev(withBank, d.manifest.stateVersion, "req-rev-bank");
    expect(JSON.stringify(mem.getJson(revisionName("EX-1", r.revision.revisionId)))).not.toContain("sig=");
  });
});

describe("14A G3 — legal / illegal transitions on the server", () => {
  it("draft → in-review → approved → published, each binding the exact revision, each bumping stateVersion, each emitting one event", async () => {
    const e = await enable();
    const s = await submit(e.manifest);
    expect(s.manifest).toMatchObject({ lifecycleState: "in-review", stateVersion: 2, reviewRevisionId: e.manifest.latestRevisionId });
    const a = await approve(s.manifest);
    expect(a.manifest).toMatchObject({ lifecycleState: "approved", stateVersion: 3, approvedRevisionId: e.manifest.latestRevisionId });
    const p = await publish(a.manifest);
    expect(p.manifest).toMatchObject({ lifecycleState: "published", stateVersion: 4, publishedRevisionId: e.manifest.latestRevisionId, publishedBy: "teacher-1" });
    expect(p.manifest.publishedAt).toBe("2026-09-30T10:00:05.000Z");
    expect(events().map(x => x.type)).toEqual(["governance-enabled", "submitted-for-review", "approved", "published"]);
    expect(events().map(x => [x.fromState, x.toState])).toEqual([[undefined, "draft"], ["draft", "in-review"], ["in-review", "approved"], ["approved", "published"]]);
  });
  it("illegal transitions are refused with 409 and mutate NOTHING (draft→approved, draft→published, in-review→published, approved→in-review)", async () => {
    const e = await enable();
    const before = JSON.stringify(mem.getJson(manifestName("EX-1")));
    await expectErr(approve(e.manifest, "x1"), 409, "ILLEGAL_TRANSITION");
    await expectErr(publish(e.manifest, "x2"), 409, "ILLEGAL_TRANSITION");
    expect(JSON.stringify(mem.getJson(manifestName("EX-1")))).toBe(before);
    const s = await submit(e.manifest);
    await expectErr(publish(s.manifest, "x3"), 409, "ILLEGAL_TRANSITION");
    await expectErr(submit(s.manifest, "x4"), 409, "ILLEGAL_TRANSITION");
    const a = await approve(s.manifest);
    await expectErr(submit(a.manifest, "x5"), 409, "ILLEGAL_TRANSITION");          // approved → in-review is not designed
    expect(events()).toHaveLength(3);
    expect(mem.getJson(manifestName("EX-1")).stateVersion).toBe(3);
  });
  it("a client cannot inject a target state: transition() validates against the table", async () => {
    const e = await enable();
    await expectErr(GOV.transition(c, { examId: "EX-1", to: "published", actor: actor(), requestId: "inj", expectedStateVersion: e.manifest.stateVersion }, deps), 409, "ILLEGAL_TRANSITION");
    await expectErr(GOV.transition(c, { examId: "EX-1", to: "final", actor: actor(), requestId: "inj2", expectedStateVersion: e.manifest.stateVersion }, deps), 400, "INVALID");
  });
  it("return to draft from in-review / approved / published keeps the published revision intact and clears review/approval pointers", async () => {
    const p = await fullCycle();
    const d = await toDraft(p.manifest);
    expect(d.manifest).toMatchObject({ lifecycleState: "draft", publishedRevisionId: p.manifest.publishedRevisionId, publishedAt: p.manifest.publishedAt, stateVersion: 5 });
    expect(d.manifest.reviewRevisionId).toBeUndefined();
    expect(d.manifest.approvedRevisionId).toBeUndefined();
    const r2 = await rev(validExam({ title: "v2" }), d.manifest.stateVersion);
    expect(r2.manifest.publishedRevisionId).toBe(p.manifest.publishedRevisionId);         // publication untouched by a new draft revision (P14)
    expect(r2.manifest.latestRevisionNumber).toBe(2);
    const published = await GOV.loadPublishedRevision(c, "EX-1", deps);
    expect(published.revisionId).toBe(p.manifest.publishedRevisionId);
    expect(published.exam.title).toBe("امتحان");
  });
});

describe("14A G4 — optimistic concurrency", () => {
  it("correct expectedStateVersion succeeds; a stale one is 409 STALE_STATE and mutates nothing (no event, no revision)", async () => {
    const e = await enable();
    const r2 = await rev(validExam({ title: "v2" }), e.manifest.stateVersion);
    await expectErr(rev(validExam({ title: "v3" }), e.manifest.stateVersion, "stale-rev"), 409, "STALE_STATE");
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(2);
    await expectErr(submit({ ...r2.manifest, stateVersion: 1 }, "stale-submit"), 409, "STALE_STATE");
    expect(events()).toHaveLength(2);
    expect(mem.getJson(manifestName("EX-1")).lifecycleState).toBe("draft");
  });
  it("two concurrent transitions from the same known version: exactly one wins, the loser gets 409 and cannot overwrite the winner (ETag CAS) — P4/P5", async () => {
    const e = await enable();
    let fired = false;
    const racy = createMemoryContainer({}, { beforeConditionalUpload: (name, api) => { if (fired || !name.endsWith("manifest.json")) return; fired = true; const cur = api.getJson(name); api.setJson(name, { ...cur, lifecycleState: "in-review", reviewRevisionId: cur.latestRevisionId, stateVersion: cur.stateVersion + 1 }); } });
    for (const n of mem.names("")) racy.setJson(n, mem.getJson(n));
    const err = await expectErr(GOV.submitForReview(racy.container, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "loser", expectedStateVersion: 1 }, deps), 409, "STALE_STATE");
    expect(err.message).toMatch(/تغيرت حالة الامتحان/);
    const m = racy.getJson(manifestName("EX-1"));
    expect(m.stateVersion).toBe(2);
    expect(m.commands.some(x => x.requestId === "loser")).toBe(false);
    expect(racy.names("exam-governance/EX-1/events/")).toHaveLength(1);
  });
  it("a stale publish cannot supersede a newer manifest state", async () => {
    const e = await enable(); const s = await submit(e.manifest); const a = await approve(s.manifest);
    const d = await toDraft(a.manifest);
    await expectErr(publish(a.manifest, "stale-publish"), 409, "STALE_STATE");
    expect(mem.getJson(manifestName("EX-1"))).toMatchObject({ lifecycleState: "draft", stateVersion: d.manifest.stateVersion });
    expect(mem.getJson(manifestName("EX-1")).publishedRevisionId).toBeUndefined();
  });
  it("expectedStateVersion is mandatory for every mutation", async () => {
    const e = await enable();
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "no-sv" }, deps), 400, "INVALID");
    await expectErr(GOV.createRevision(c, { examId: "EX-1", exam: validExam(), actor: actor(), requestId: "no-sv2" }, deps), 400, "INVALID");
  });
});

describe("14A — idempotency (requestId)", () => {
  it("retrying the SAME completed command replays the result: no duplicate revision, no double increment, no duplicate event, no double publish — P18", async () => {
    const e = await enable();
    const r2 = await rev(validExam({ title: "v2" }), e.manifest.stateVersion, "R2");
    const replay = await rev(validExam({ title: "v2 (client edited meanwhile)" }), e.manifest.stateVersion, "R2");
    expect(replay.replayed).toBe(true);
    expect(replay.manifest.stateVersion).toBe(r2.manifest.stateVersion);
    expect(replay.manifest.latestRevisionId).toBe(r2.manifest.latestRevisionId);
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(2);
    expect(events()).toHaveLength(2);
    const s = await submit(r2.manifest, "S1"); const a = await approve(s.manifest, "A1"); const p = await publish(a.manifest, "P1");
    const pAgain = await GOV.publish(c, { examId: "EX-1", actor: actor(), requestId: "P1", expectedStateVersion: a.manifest.stateVersion }, deps);
    expect(pAgain.replayed).toBe(true);
    expect(pAgain.manifest.publishedAt).toBe(p.manifest.publishedAt);
    expect(events().filter(x => x.type === "published")).toHaveLength(1);
    expect(mem.getJson(manifestName("EX-1")).stateVersion).toBe(p.manifest.stateVersion);
  });
  it("a DIFFERENT command reusing a completed requestId fails safely (409 REQUEST_ID_CONFLICT) without mutation", async () => {
    const e = await enable();
    const r2 = await rev(validExam({ title: "v2" }), e.manifest.stateVersion, "SHARED");
    await expectErr(submit(r2.manifest, "SHARED"), 409, "REQUEST_ID_CONFLICT");
    expect(mem.getJson(manifestName("EX-1")).lifecycleState).toBe("draft");
    expect(events()).toHaveLength(2);
  });
  it("requestId is required and validated", async () => {
    const e = await enable();
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), expectedStateVersion: 1 }, deps), 400, "INVALID");
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "x".repeat(300), expectedStateVersion: 1 }, deps), 400, "INVALID");
  });
});

describe("14A G6 — server-authoritative finalization gate on submission", () => {
  it("draft → in-review is refused (422) when the SERVER finalization decision blocks; the client's canFinalize flag is ignored — P12/P13", async () => {
    const e = await enable(brokenExam());
    const err = await expectErr(submit(e.manifest, "sub-broken", actor(), { canFinalize: true, decision: { canFinalize: true } }), 422, "FINALIZATION_REFUSED");
    expect(err.details).toMatchObject({ structuralErrors: 1 });
    expect(JSON.stringify(err.details)).not.toMatch(/correctOptionIndex|"text":"سؤال/);          // no exam body in the refusal
    expect(mem.getJson(manifestName("EX-1")).lifecycleState).toBe("draft");
    expect(events()).toHaveLength(1);
  });
  it("submission evaluates the STORED revision, never a client body; revisionId must be the exact latest revision", async () => {
    const e = await enable(brokenExam());
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, exam: validExam(), actor: actor(), requestId: "sub-body", expectedStateVersion: 1 }, deps), 422, "FINALIZATION_REFUSED");
    const fixed = await rev(validExam(), e.manifest.stateVersion, "fix");
    await expectErr(GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "sub-old", expectedStateVersion: fixed.manifest.stateVersion }, deps), 409, "REVISION_MISMATCH");
    const ok = await submit(fixed.manifest, "sub-ok");
    expect(ok.manifest.reviewRevisionId).toBe(fixed.manifest.latestRevisionId);
    expect(ok.decision).toMatchObject({ canFinalize: true });
  });
  it("the finalization authority is injectable for tests and defaults to the shared server finalization", async () => {
    const e = await enable();
    let seen = null;
    const s = await GOV.submitForReview(c, { examId: "EX-1", revisionId: e.manifest.latestRevisionId, actor: actor(), requestId: "sub-inj", expectedStateVersion: 1 }, { ...deps, finalize: exam => { seen = exam; return { canFinalize: false, blockers: [{ kind: "quality", id: "g" }], warnings: [], structuralErrors: [], policyBlockers: [] }; } }).catch(x => x);
    expect(s.status).toBe(422);
    expect(seen.examId).toBe("EX-1");
  });
});

describe("14A G7 — approval and publication bind exact stored revisions", () => {
  it("approve binds reviewRevisionId; a client exam body / revisionId is ignored — P7", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    const a = await approve(s.manifest, "ap", actor(), { exam: validExam({ title: "EVIL" }), revisionId: "rev-evil" });
    expect(a.manifest.approvedRevisionId).toBe(s.manifest.reviewRevisionId);
    expect(mem.getJson(revisionName("EX-1", a.manifest.approvedRevisionId)).exam.title).toBe("امتحان");
    expect(mem.names("exam-governance/EX-1/revisions/")).toHaveLength(1);
  });
  it("publish binds approvedRevisionId with server time and authenticated actor; client publishedRevisionId / publishedBy / publishedAt are ignored — P2/P8/P9/P10", async () => {
    const e = await enable(); const s = await submit(e.manifest); const a = await approve(s.manifest);
    const p = await publish(a.manifest, "pub", actor("teacher-1"), { publishedRevisionId: "rev-evil", revisionId: "rev-evil", publishedBy: "someone-else", publishedAt: "1999-01-01T00:00:00.000Z", occurredAt: "1999-01-01T00:00:00.000Z", actorId: "spoof" });
    expect(p.manifest.publishedRevisionId).toBe(a.manifest.approvedRevisionId);
    expect(p.manifest.publishedBy).toBe("teacher-1");
    expect(p.manifest.publishedAt).toBe("2026-09-30T10:00:05.000Z");
    const ev = events().at(-1);
    expect(ev).toMatchObject({ type: "published", actorId: "teacher-1", occurredAt: "2026-09-30T10:00:05.000Z", revisionId: a.manifest.approvedRevisionId });
  });
  it("capabilities are enforced per action from the server actor, never from the request — P11", async () => {
    const e = await enable();
    await expectErr(submit(e.manifest, "s-rev", actor("r", ["review"])), 403, "FORBIDDEN");
    const s = await submit(e.manifest, "s-ok", actor("a", ["author"]));
    await expectErr(approve(s.manifest, "ap-author", actor("a", ["author"])), 403, "FORBIDDEN");
    await expectErr(approve(s.manifest, "ap-body", actor("a", ["author"]), { role: "approver", capabilities: ALL, governanceRole: "approver" }), 403, "FORBIDDEN");
    const a = await approve(s.manifest, "ap-ok", actor("ap", ["approve"]));
    await expectErr(publish(a.manifest, "pub-approver", actor("ap", ["approve"])), 403, "FORBIDDEN");
    const p = await publish(a.manifest, "pub-ok", actor("pb", ["publish"]));
    expect(p.manifest.publishedBy).toBe("pb");
    expect(events().map(x => x.actorId)).toEqual(["teacher-1", "a", "ap", "pb"]);
    expect(events()).toHaveLength(4);        // failed / forbidden attempts emit no event
  });
});

describe("14A — published revision loader (fail closed) and legacy coexistence", () => {
  it("not governed → NOT_GOVERNED; governed without publication → NO_PUBLISHED_REVISION; missing/corrupt referenced revision → PUBLISHED_REVISION_UNAVAILABLE (never the latest draft) — P17", async () => {
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 404, "NOT_GOVERNED");
    const e = await enable();
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 409, "NO_PUBLISHED_REVISION");
    const p = await (async () => { const s = await submit(e.manifest); const a = await approve(s.manifest); return publish(a.manifest); })();
    const d = await toDraft(p.manifest); await rev(validExam({ title: "draft-after-publish" }), d.manifest.stateVersion);
    const pub = await GOV.loadPublishedRevision(c, "EX-1", deps);
    expect(pub.exam.title).toBe("امتحان");
    expect(pub.revisionId).toBe(p.manifest.publishedRevisionId);
    mem.store.delete(revisionName("EX-1", p.manifest.publishedRevisionId));
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 409, "PUBLISHED_REVISION_UNAVAILABLE");
    const m = mem.getJson(manifestName("EX-1")); m.publishedRevisionId = "ghost"; mem.setJson(manifestName("EX-1"), m);
    await expectErr(GOV.loadPublishedRevision(c, "EX-1", deps), 409, "PUBLISHED_REVISION_UNAVAILABLE");
  });
  it("resolveGovernedExamSource: legacy → {governed:false}; governed+published → the exact revision; governed unpublished → error", async () => {
    expect(await GOV.resolveGovernedExamSource(c, "EX-1", deps)).toEqual({ governed: false });
    expect(await GOV.resolveGovernedExamSource(c, "", deps)).toEqual({ governed: false });
    const p = await fullCycle();
    const src = await GOV.resolveGovernedExamSource(c, "EX-1", deps);
    expect(src.governed).toBe(true); expect(src.revision.revisionId).toBe(p.manifest.publishedRevisionId);
    const d = await toDraft(p.manifest); await rev(validExam({ title: "new" }), d.manifest.stateVersion);
    expect((await GOV.resolveGovernedExamSource(c, "EX-1", deps)).revision.exam.title).toBe("امتحان");
    const e2 = await GOV.enableGovernance(c, { examId: "EX-2", exam: validExam({ examId: "EX-2" }), actor: actor(), requestId: "e2" }, deps);
    expect(e2.manifest.lifecycleState).toBe("draft");
    await expectErr(GOV.resolveGovernedExamSource(c, "EX-2", deps), 409, "NO_PUBLISHED_REVISION");
  });
  it("legacy exam blobs are never rewritten or repurposed by governance", async () => {
    mem.setJson("exams/EX-1.json", { kind: "saved-exam", savedAt: "2026-01-01T00:00:00.000Z", exam: validExam({ status: "final" }) });
    const before = JSON.stringify(mem.getJson("exams/EX-1.json"));
    await fullCycle();
    expect(JSON.stringify(mem.getJson("exams/EX-1.json"))).toBe(before);
  });
});

describe("14A G5 — immutable audit events", () => {
  it("one event per successful mutation with server actor/time and requestId; events reference revision ids and never carry the exam body, tokens or answer keys — P20", async () => {
    const p = await fullCycle();
    const evs = events();
    expect(evs).toHaveLength(4);
    for (const ev of evs) {
      expect(ev).toMatchObject({ schemaVersion: 1, examId: "EX-1", actorId: "teacher-1" });
      expect(typeof ev.eventId).toBe("string"); expect(typeof ev.occurredAt).toBe("string"); expect(typeof ev.requestId).toBe("string");
      expect("exam" in ev).toBe(false);
      const s = JSON.stringify(ev);
      expect(s).not.toMatch(/correctOptionIndex|"sections"|"questions"|token|Bearer|answer/i);
    }
    expect(evs[3].revisionId).toBe(p.manifest.publishedRevisionId);
    expect(evs.map(e => e.sequence)).toEqual([1, 2, 3, 4]);
  });
  it("event blobs are create-only (never overwritten)", async () => {
    await enable();
    const name = mem.names("exam-governance/EX-1/events/")[0];
    const ev = mem.getJson(name);
    await expectErr(GOV.writeEventDocument(c, { ...ev, actorId: "forged" }), 409, "IMMUTABLE");
    expect(mem.getJson(name).actorId).toBe("teacher-1");
    expect(eventName("EX-1", ev.sequence, ev.eventId)).toBe(name);
  });
  it("history readers: revisions newest-first with metadata only (no exam body) and bounded pages; events newest-first paginated", async () => {
    const e = await enable();
    let m = e.manifest;
    for (let i = 2; i <= 5; i++) m = (await rev(validExam({ title: "v" + i }), m.stateVersion)).manifest;
    const page1 = await GOV.listRevisions(c, { examId: "EX-1", limit: 2 }, deps);
    expect(page1.items.map(x => x.revisionNumber)).toEqual([5, 4]);
    expect(page1.items[0]).toMatchObject({ revisionId: m.latestRevisionId, createdBy: "teacher-1", title: "v5", questionCount: 2 });
    expect("exam" in page1.items[0]).toBe(false);
    expect(page1.items[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(page1.items[0].roles).toEqual(["latest"]);
    const page2 = await GOV.listRevisions(c, { examId: "EX-1", limit: 2, cursor: page1.nextCursor }, deps);
    expect(page2.items.map(x => x.revisionNumber)).toEqual([3, 2]);
    const page3 = await GOV.listRevisions(c, { examId: "EX-1", limit: 2, cursor: page2.nextCursor }, deps);
    expect(page3.items.map(x => x.revisionNumber)).toEqual([1]); expect(page3.nextCursor).toBe(null);
    const evPage = await GOV.listEvents(c, { examId: "EX-1", limit: 3 }, deps);
    expect(evPage.items.map(x => x.sequence)).toEqual([5, 4, 3]);
    const evPage2 = await GOV.listEvents(c, { examId: "EX-1", limit: 3, cursor: evPage.nextCursor }, deps);
    expect(evPage2.items.map(x => x.sequence)).toEqual([2, 1]); expect(evPage2.nextCursor).toBe(null);
    const loaded = await GOV.loadRevision(c, { examId: "EX-1", revisionId: page2.items[0].revisionId }, deps);
    expect(loaded.exam.title).toBe("v3");
    await expectErr(GOV.loadRevision(c, { examId: "EX-1", revisionId: "nope" }, deps), 404, "REVISION_NOT_FOUND");
  });
});

describe("14A G10 — server capability resolver", () => {
  it("unconfigured deployment: every authenticated teacher holds all four capabilities (documented single-teacher baseline); students / anonymous hold none", () => {
    const env = {};
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "t1" }, env)).toEqual(ALL);
    expect(resolveGovernanceCapabilities({ role: "student", sub: "s1" }, env)).toEqual([]);
    expect(resolveGovernanceCapabilities(null, env)).toEqual([]);
    expect(resolveGovernanceCapabilities({ role: "teacher" }, env)).toEqual([]);
    // client-supplied role / capabilities on the payload are never trusted
    expect(resolveGovernanceCapabilities({ role: "student", sub: "s1", capabilities: ALL, governanceRole: "approver" }, env)).toEqual([]);
  });
  it("configured deployment: GOVERNANCE_CAPABILITIES JSON maps subjects to capabilities with an optional default; malformed config falls back to the baseline", () => {
    const env = { GOVERNANCE_CAPABILITIES: JSON.stringify({ default: ["author"], users: { reviewer: ["review"], approver: ["approve", "publish"], both: ["author", "review"] } }) };
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "t1" }, env)).toEqual(["author"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "reviewer" }, env)).toEqual(["review"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "approver" }, env)).toEqual(["approve", "publish"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "both" }, env)).toEqual(["author", "review"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "t1" }, { GOVERNANCE_CAPABILITIES: JSON.stringify({ users: { x: ["author"] } }) })).toEqual([]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "t1" }, { GOVERNANCE_CAPABILITIES: JSON.stringify({ default: ["author", "bogus"] }) })).toEqual(["author"]);
    expect(resolveGovernanceCapabilities({ role: "teacher", sub: "t1" }, { GOVERNANCE_CAPABILITIES: "{not json" })).toEqual(ALL);
    expect(resolveGovernanceCapabilities({ role: "student", sub: "reviewer" }, env)).toEqual([]);
  });
});
