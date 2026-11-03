import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as assignments } from "../src/functions/manage-assignments.js";
import { handler as governance } from "../src/functions/exam-governance.js";
import * as GOV from "../src/lib/exam-governance.js";

// Tadris+ P6-B — risk S6: «the PUBLISHED revision is resolved without an ownership check» (IDOR). TEST data only.
// A governed exam's assignment binds the server's published revision (Phase 14A, answer keys included). Before P6-B, ANY teacher
// who sent `examSnapshot: { examId: <another teacher's governed exam> }` got that teacher's published content and keys bound to
// their own class. Now the governed revision is used only by a teacher who may access that exam (the tenancy rule of its saved
// exam, exactly like enabling governance — QA2-7); anyone else is answered like a missing exam (404, §7.9). Single-workspace mode
// (no tenant) and the owner keep today's behaviour byte-for-byte.
// The same IDOR on the governance route itself: a console account (an isolated tenant) could read another teacher's revisions
// (answer keys included) and even create / approve / publish a revision on that exam — which its owner's next assignment then
// bound. Now a console account reaches an exam's governance only when it may access that exam; BUILDER_USERS colleagues keep the
// shared review workflow (21G §3, pinned in qa2-phase3-authority.test.js).

const ALL = ["author", "review", "approve", "publish"];
const A = "t_00112233445566aa", B = "t_00112233445566bb";
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const exam = (over = {}) => ({ examId: "EX-1", title: "امتحان سارة", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

let mem, c, clock;
const gov = () => ({ now: () => new Date((clock += 1000)).toISOString() });
async function publishGoverned(owner = A) {
  const actor = { id: owner, capabilities: ALL };
  const e = exam();
  mem.setJson("exams/EX-1.json", { ...e, ownerId: owner });                           // the saved exam belongs to its teacher
  const en = await GOV.enableGovernance(c, { examId: "EX-1", exam: e, actor, requestId: "en" }, gov());
  const s = await GOV.submitForReview(c, { examId: "EX-1", revisionId: en.manifest.latestRevisionId, actor, requestId: "s", expectedStateVersion: en.manifest.stateVersion }, gov());
  const a = await GOV.approve(c, { examId: "EX-1", actor, requestId: "a", expectedStateVersion: s.manifest.stateVersion }, gov());
  return GOV.publish(c, { examId: "EX-1", actor, requestId: "p", expectedStateVersion: a.manifest.stateVersion }, gov());
}
const deps = user => ({
  requireBuilderAuth: () => ({ ok: true, user }), getContainer: () => c, now: () => new Date((clock += 1000)).toISOString(),
  ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {}
});
const create = (user, classId, examSnapshot) => assignments({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId, title: "واجب", publish: true, examSnapshot }) }, deps(user));
const stored = r => mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");

beforeEach(() => {
  delete process.env.GOVERNANCE_CAPABILITIES; delete process.env.LEGACY_DATA_OWNER; delete process.env.BUILDER_USERS;
  mem = createMemoryContainer({
    "platform/classes/cA.json": { classId: "cA", name: "صف سارة", active: true, ownerId: A },
    "platform/classes/cB.json": { classId: "cB", name: "صف عمر", active: true, ownerId: B }
  });
  c = mem.container;
  clock = Date.parse("2026-11-03T10:00:00.000Z");
});

describe("P6-B fail-first — another teacher's governed exam", () => {
  it("cannot be bound to my class by sending its examId (no content, no keys): answered like a missing exam", async () => {
    await publishGoverned(A);
    const r = await create({ sub: B, am: "multi-user" }, "cB", { examId: "EX-1", title: "x", questions: [mcq("mine")] });
    expect([r.status, r.jsonBody.code]).toEqual([404, "EXAM_NOT_FOUND"]);
    expect(mem.names("platform/assignments/")).toEqual([]);
  });
});

describe("P6-B the owner of a governed exam is unchanged", () => {
  it("its teacher binds the published revision exactly as before (managed or BUILDER_USERS sessions)", async () => {
    await publishGoverned(A);
    for (const user of [{ sub: A, am: "multi-user" }, { sub: A, am: "managed" }]) {
      const r = await create(user, "cA", { examId: "EX-1", title: "ignored", questions: [mcq("mine")] });
      expect(r.status).toBe(200);
      expect(stored(r).source).toMatchObject({ kind: "governed-revision", examId: "EX-1" });
      expect(JSON.stringify(stored(r).examSnapshot)).not.toContain("mine");                 // the server's revision, not the browser's
    }
  });
  it("single-workspace mode (no tenant) keeps today's behaviour", async () => {
    await publishGoverned("teacher");
    mem.setJson("exams/EX-1.json", { ...exam() });                                         // unowned
    mem.setJson("platform/classes/cS.json", { classId: "cS", name: "صف", active: true });
    const r = await create({ sub: "teacher" }, "cS", { examId: "EX-1", questions: [mcq("mine")] });
    expect(r.status).toBe(200);
    expect(stored(r).source).toMatchObject({ kind: "governed-revision" });
  });
  it("an unowned (pre-tenancy) governed exam: the imported workspace may use it, a console account may not", async () => {
    await publishGoverned("teacher");
    mem.setJson("exams/EX-1.json", { ...exam() });
    mem.setJson("platform/classes/cL.json", { classId: "cL", name: "صف قديم", active: true, ownerId: "t_legacy" });
    expect((await create({ sub: "t_legacy", am: "managed" }, "cL", { examId: "EX-1", questions: [mcq("x")] })).status).toBe(200);
    expect((await create({ sub: B, am: "managed" }, "cB", { examId: "EX-1", questions: [mcq("x")] })).jsonBody.code).toBe("EXAM_NOT_FOUND");
  });
  it("a governed exam without a saved document falls back to its manifest's creator", async () => {
    await publishGoverned(A);
    mem.store.delete("exams/EX-1.json");
    expect((await create({ sub: A, am: "managed" }, "cA", { examId: "EX-1", questions: [mcq("x")] })).status).toBe(200);
    expect((await create({ sub: B, am: "managed" }, "cB", { examId: "EX-1", questions: [mcq("x")] })).jsonBody.code).toBe("EXAM_NOT_FOUND");
  });
  it("a non-governed exam id that is someone else's saved exam is unaffected here (the snapshot is the browser's, as before)", async () => {
    mem.setJson("exams/EX-9.json", { ...exam({ examId: "EX-9" }), ownerId: A });
    const r = await create({ sub: B, am: "managed" }, "cB", { examId: "EX-9", title: "x", questions: [mcq("mine")] });
    expect(r.status).toBe(200);
    expect(stored(r).source).toBeUndefined();
  });
});

const route = (user, body) => governance({ method: "POST", url: "http://x/api/exam-governance", headers: new Headers(), json: async () => body }, deps({ ver: 2, role: "teacher", ...user }));
const manifestNow = () => mem.getJson("exam-governance/EX-1/manifest.json");

describe("P6-B fail-first — the governance route, another teacher's exam (console accounts)", () => {
  it("B cannot read A's revisions or the published one (no content, no keys): answered like an exam that does not exist", async () => {
    const p = await publishGoverned(A);
    const b = { sub: B, am: "managed" };
    for (const body of [{ action: "published" }, { action: "revision", revisionId: p.manifest.publishedRevisionId }, { action: "revisions" }, { action: "events" }, { action: "decisions" }]) {
      const r = await route(b, { examId: "EX-1", ...body });
      expect([body.action, r.status, r.jsonBody.code]).toEqual([body.action, 404, "NOT_GOVERNED"]);
      expect(JSON.stringify(r.jsonBody)).not.toContain("correctOptionIndex");
    }
    const st = await route(b, { action: "status", examId: "EX-1" });
    expect([st.status, st.jsonBody.governed, st.jsonBody.manifest]).toEqual([200, false, null]);
  });
  it("B cannot take A's exam over (return to draft → new revision → submit → approve → publish); A's next assignment keeps her content", async () => {
    await publishGoverned(A);
    const before = JSON.stringify(manifestNow());
    const b = { sub: B, am: "managed" };
    let m = manifestNow();
    const chain = [["return-to-draft", () => ({})], ["create-revision", () => ({ exam: exam({ title: "مزروع", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("مزروع من عمر")] }] }) })],
      ["submit-review", () => ({ revisionId: m.latestRevisionId })], ["approve", () => ({})], ["publish", () => ({})]];
    const seen = [];
    for (const [action, extra] of chain) {
      const r = await route(b, { action, examId: "EX-1", requestId: "b-" + action, expectedStateVersion: m.stateVersion, ...extra() });
      if (r.jsonBody.manifest) m = r.jsonBody.manifest;
      seen.push([action, r.status, r.jsonBody.code]);
    }
    expect(seen).toEqual(chain.map(([action]) => [action, 404, "NOT_GOVERNED"]));
    expect((await route(b, { action: "enable", examId: "EX-1", exam: exam(), requestId: "b-en" })).jsonBody.code).toBe("NOT_FOUND");
    expect(JSON.stringify(manifestNow())).toBe(before);
    const own = await create({ sub: A, am: "managed" }, "cA", { examId: "EX-1", questions: [mcq("x")] });
    expect(JSON.stringify(stored(own).examSnapshot)).not.toContain("مزروع");
  });
});

describe("P6-B the governance route — unchanged for the exam's owner and for shared workspaces", () => {
  it("A (console account) runs the whole lifecycle on her own exam through the route", async () => {
    mem.setJson("exams/EX-1.json", { ...exam(), ownerId: A });
    const a = { sub: A, am: "managed" };
    const e = await route(a, { action: "enable", examId: "EX-1", exam: exam(), requestId: "e" });
    expect(e.status).toBe(200);
    const s = await route(a, { action: "submit-review", examId: "EX-1", revisionId: e.jsonBody.manifest.latestRevisionId, requestId: "s", expectedStateVersion: e.jsonBody.manifest.stateVersion });
    const ap = await route(a, { action: "approve", examId: "EX-1", requestId: "a", expectedStateVersion: s.jsonBody.manifest.stateVersion });
    expect((await route(a, { action: "publish", examId: "EX-1", requestId: "p", expectedStateVersion: ap.jsonBody.manifest.stateVersion })).status).toBe(200);
    expect((await route(a, { action: "published", examId: "EX-1" })).status).toBe(200);
    expect((await route(a, { action: "status", examId: "EX-1" })).jsonBody.governed).toBe(true);
  });
  it("without a saved exam, the manifest's creator decides (A reads, B does not)", async () => {
    await publishGoverned(A);
    mem.store.delete("exams/EX-1.json");
    expect((await route({ sub: A, am: "managed" }, { action: "published", examId: "EX-1" })).status).toBe(200);
    expect((await route({ sub: B, am: "managed" }, { action: "published", examId: "EX-1" })).jsonBody.code).toBe("NOT_GOVERNED");
  });
  it("the saved exam decides over the manifest's creator (governance enabled before the console, the exam since stamped as A's)", async () => {
    await publishGoverned("teacher");
    mem.setJson("exams/EX-1.json", { ...exam(), ownerId: A });
    expect((await route({ sub: A, am: "managed" }, { action: "published", examId: "EX-1" })).status).toBe(200);
    expect((await route({ sub: B, am: "managed" }, { action: "published", examId: "EX-1" })).jsonBody.code).toBe("NOT_GOVERNED");
    expect((await create({ sub: A, am: "managed" }, "cA", { examId: "EX-1", questions: [mcq("x")] })).status).toBe(200);
    expect((await create({ sub: B, am: "managed" }, "cB", { examId: "EX-1", questions: [mcq("x")] })).jsonBody.code).toBe("EXAM_NOT_FOUND");
  });
  it("an exam id nobody saved or governed stays free: a console account may enable it", async () => {
    expect((await route({ sub: B, am: "managed" }, { action: "enable", examId: "EX-NEW", exam: exam({ examId: "EX-NEW" }), requestId: "n" })).status).toBe(200);
  });
  it("BUILDER_USERS colleagues and the single workspace keep the shared review workflow (21G §3)", async () => {
    await publishGoverned("teacher-a");
    mem.setJson("exams/EX-1.json", { ...exam(), ownerId: "teacher-a" });
    expect((await route({ sub: "teacher-b", am: "multi-user" }, { action: "published", examId: "EX-1" })).status).toBe(200);
    expect((await route({ sub: "teacher" }, { action: "published", examId: "EX-1" })).status).toBe(200);
  });
});
