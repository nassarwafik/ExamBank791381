// Reports R-6 — an assessment is dated by its PUBLICATION in the reports (docs/enterprise-reports-period-basis-r6.md; owner decision
// D-2, refined by option (ب) on 2026-11-12): the period, the order and every shown date follow the moment students could take it —
// the later of `publishedAt` (stamped by the server at the FIRST publication) and `openAt` (a scheduled assessment). A document
// published before R-6 has no `publishedAt` and keeps its creation date (the documented fallback), counted in `periodBasis.fallback`
// so the page can say so. Nothing is migrated. TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { handler: reports } = require("../src/functions/reports.js");
const { handler: assignments } = require("../src/functions/manage-assignments.js");
const dr = require("../src/lib/reports/date-range.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const DAY = 86400000;
const NOW = Date.now();
const ago = days => new Date(NOW - days * DAY).toISOString();
const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const stu = (userId, displayName) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName });
const final = percentage => ({ attemptNumber: 1, submittedAt: ago(1), score: percentage / 10, totalMarks: 10, percentage, manualReviewMarks: 0, finalized: true });
const doc = (aid, sid, ...attempts) => ({ assignmentId: aid, studentId: sid, classId: "c1", attempts, activeAttempt: null });
const asg = (id, extra) => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, totalMarks: 10, ...extra });

// late:   created as a draft 60 days ago, published 3 days ago, handed in yesterday → it belongs to «آخر 7 أيام»
// old:    published 40 days ago (stamped) → never in «آخر 7 أيام»
// legacy: published before R-6 (no publishedAt), created 2 days ago → its creation date, counted as a fallback
// sched:  created and published 5 days ago, opens in 3 days → not yet in the last 7 days; dated by its opening
const seed = () => createMemoryContainer({
  [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2"], schoolYear: "2025-2026" },
  [UP + "s1.json"]: stu("s1", "أحمد"), [UP + "s2.json"]: stu("s2", "بلال"),
  [AP + "late.json"]: asg("late", { createdAt: ago(60), publishedAt: ago(3) }),
  [AP + "old.json"]: asg("old", { createdAt: ago(45), publishedAt: ago(40) }),
  [AP + "legacy.json"]: asg("legacy", { createdAt: ago(2) }),
  [AP + "sched.json"]: asg("sched", { createdAt: ago(5), publishedAt: ago(5), openAt: new Date(NOW + 3 * DAY).toISOString() }),
  [SP + "late/s1.json"]: doc("late", "s1", final(80)), [SP + "late/s2.json"]: doc("late", "s2", final(60)),
  [SP + "old/s1.json"]: doc("old", "s1", final(50))
});
const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status).toBe(200); return r.jsonBody; };
const last7 = "&from=" + ago(7).slice(0, 10) + "&to=" + new Date(NOW).toISOString().slice(0, 10);
const day = iso => iso.slice(0, 10);

describe("R-6 — the period, the order and the dates follow the publication", () => {
  it("assessments report: «آخر 7 أيام» holds the assessment published 3 days ago (created 60 days ago) and the legacy one; not the scheduled one", async () => {
    const body = await report(seed(), "type=assignments&classId=c1" + last7);
    expect(body.perAssignment.map(r => [r.assignmentId, r.date])).toEqual([["late", day(ago(3))], ["legacy", day(ago(2))]]);
  });
  it("every assessment, oldest publication first, each dated by its publication (the scheduled one by its opening)", async () => {
    const body = await report(seed(), "type=assignments&classId=c1");
    expect(body.perAssignment.map(r => [r.assignmentId, r.date])).toEqual([
      ["old", day(ago(40))], ["late", day(ago(3))], ["legacy", day(ago(2))], ["sched", day(new Date(NOW + 3 * DAY).toISOString())]
    ]);
    expect(body.periodBasis).toEqual({ basis: "published", fallback: 1 });
  });
  it("class report: KPIs, the assessment points and the basis of the last 7 days", async () => {
    const body = await report(seed(), "type=class&classId=c1" + last7);
    expect(body.kpis.assignments).toBe(2);
    expect(body.insights.assessments.map(p => [p.assignmentId, p.date])).toEqual([["late", day(ago(3))], ["legacy", day(ago(2))]]);
    expect(body.periodBasis).toEqual({ basis: "published", fallback: 1 });
  });
  it("student report: the same assessments in the last 7 days, dated by publication", async () => {
    const body = await report(seed(), "type=student&studentId=s1" + last7);
    expect(body.academic.assessmentCount).toBe(2);
    expect(body.insights.assessments.map(p => p.assignmentId)).toEqual(["late", "legacy"]);
    expect(body.insights.assessments.find(p => p.assignmentId === "late").date).toBe(day(ago(3)));
    expect(body.periodBasis).toEqual({ basis: "published", fallback: 1 });
  });
  it("hub overview: the month trend files each assessment under its publication month", async () => {
    const body = await report(seed(), "type=overview" + last7);
    expect(body.overview.totals.assessments).toBe(2);
    expect(body.overview.trend.reduce((n, m) => n + m.assessments, 0)).toBe(2);
    expect(body.periodBasis).toEqual({ basis: "published", fallback: 1 });
  });
});

describe("R-6 — reportDateOf (pure)", () => {
  it("publication; the later opening of a scheduled assessment; the creation date of a document without publication (a fallback)", () => {
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-02-01T00:00:00.000Z" })).toEqual({ iso: "2026-02-01T00:00:00.000Z", fallback: false });
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-02-01T00:00:00.000Z", openAt: "2026-02-10T08:00:00.000Z" })).toEqual({ iso: "2026-02-10T08:00:00.000Z", fallback: false });
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-02-01T00:00:00.000Z", openAt: "2026-01-20T08:00:00.000Z" })).toEqual({ iso: "2026-02-01T00:00:00.000Z", fallback: false });
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", openAt: "2026-03-01T00:00:00.000Z" })).toEqual({ iso: "2026-01-01T00:00:00.000Z", fallback: true });
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "not a date" })).toEqual({ iso: "2026-01-01T00:00:00.000Z", fallback: true });
    expect(dr.reportDateOf({ createdAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-02-01T00:00:00.000Z", openAt: "garbage" })).toEqual({ iso: "2026-02-01T00:00:00.000Z", fallback: false });
  });
});

describe("R-6 — the server stamps publishedAt at the FIRST publication, and only there", () => {
  const setup = () => createMemoryContainer({ [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", active: true } });
  const mdeps = mem => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: mem.container, getContainer: () => mem.container, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} });
  const exam = { examId: "", title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 10, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] };
  const post = (mem, body) => assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: { get: () => null }, json: async () => body }, mdeps(mem));
  const stored = (mem, id) => mem.getJson(AP + id + ".json");
  const create = async (mem, extra) => (await post(mem, { action: "create", classId: "c1", title: "واجب", examSnapshot: exam, ...extra })).jsonBody.assignment.assignmentId;
  const isIso = v => typeof v === "string" && Number.isFinite(Date.parse(v));

  it("created as published → stamped (its creation moment); a browser's publishedAt is ignored", async () => {
    const mem = setup();
    const id = await create(mem, { publish: true, publishedAt: "2020-01-01T00:00:00.000Z" });
    const a = stored(mem, id);
    expect(a.publishedAt).toBe(a.createdAt);
  });
  it("a draft carries none; draft → published stamps it; unpublish → republish keeps the FIRST; archive / restore keep it", async () => {
    const mem = setup();
    const id = await create(mem, { publish: false, publishedAt: "2020-01-01T00:00:00.000Z" });
    expect(stored(mem, id).publishedAt).toBeUndefined();
    expect((await post(mem, { action: "setstatus", assignmentId: id, status: "published" })).status).toBe(200);
    const first = stored(mem, id).publishedAt;
    expect(isIso(first)).toBe(true);
    await post(mem, { action: "setstatus", assignmentId: id, status: "draft" });
    expect(stored(mem, id).publishedAt).toBe(first);
    await new Promise(r => setTimeout(r, 5));
    await post(mem, { action: "setstatus", assignmentId: id, status: "published", publishedAt: "2030-01-01T00:00:00.000Z" });
    expect(stored(mem, id).publishedAt).toBe(first);
    await post(mem, { action: "archive", assignmentId: id });
    expect(stored(mem, id).publishedAt).toBe(first);
    await post(mem, { action: "restore", assignmentId: id });
    expect(stored(mem, id)).toMatchObject({ status: "published", publishedAt: first });
  });
  it("a document published before R-6 (no publishedAt) is never stamped by a restore; a later real publication stamps it", async () => {
    const mem = setup();
    mem.setJson(AP + "legacy.json", asg("legacy", { createdAt: ago(30), status: "archived", archivedFromStatus: "published", examSnapshot: exam }));
    await post(mem, { action: "restore", assignmentId: "legacy" });
    expect(stored(mem, "legacy")).toMatchObject({ status: "published" });
    expect(stored(mem, "legacy").publishedAt).toBeUndefined();
    // re-sending «published» to it (a retry / index repair) is not a publication either
    expect((await post(mem, { action: "setstatus", assignmentId: "legacy", status: "published" })).status).toBe(200);
    expect(stored(mem, "legacy").publishedAt).toBeUndefined();
    // a real publication after R-6 (unpublished, then published again) is the first one recorded
    await post(mem, { action: "setstatus", assignmentId: "legacy", status: "draft" });
    await post(mem, { action: "setstatus", assignmentId: "legacy", status: "published" });
    expect(isIso(stored(mem, "legacy").publishedAt)).toBe(true);
  });
});
