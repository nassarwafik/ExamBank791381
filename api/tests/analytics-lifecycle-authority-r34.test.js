import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeTeacherAnalytics } from "../src/lib/teacher-analytics-core.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as reportsHandler } from "../src/functions/reports.js";
import { handler as trackerHandler } from "../src/functions/project-tracker.js";
import { handler as itemAnalysisHandler } from "../src/functions/assignment-item-analysis.js";
import { normalizeClassStatus } from "../src/lib/class-lifecycle.js";
import { getStorageNamespace, getProjectDefinition } from "../src/lib/project-tracker/registry.js";
import { buildClassSnapshot } from "../src/lib/project-tracker/service.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #34 — Analytics Lifecycle Authority. Every analytics population decision goes through the canonical
// helpers (normalizeClassStatus, isStudentClassMember, normalizeAssignmentStatus, classHasProject, deriveGradingStatus):
//   A. class lifecycle matrix A–F for teacher analytics (classes[].active, kpis.activeClasses, classComparison);
//   B. GLOBAL teacher analytics is CURRENT/operational: a canonical-archived class contributes nothing (C1);
//   C. an EXPLICITLY requested archived class is a HISTORICAL view and is still served unchanged;
//   D. student membership matrix (unchanged R24 semantics, regression guard);
//   E. assignment authority (published counts; draft / archived do not; canonical helper);
//   F. project analytics regression guards (stale progress, removed enrollment, archived class, projects-summary);
//   G. pending-review parity between teacher analytics and the gradebook through deriveGradingStatus;
//   H. source guard: the analytics core imports the two lifecycle authorities.
// Real compute/handlers over the in-memory container. A and B discriminate against pre-R34 main (7f10a4b).

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const T0 = "2026-02-15T00:00:00.000Z";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = ctx => ({ ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const GET = url => ({ method: "GET", url: "https://x" + url, json: async () => ({}) });
const cls = (classId, life, extra = {}) => ({ classId, name: "صف " + classId, grade: "11", schoolYear: "2026", studentIds: [], programCodes: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...life, ...extra });
const usr = (id, classId, over = {}) => ({ role: "student", userId: id, classId, displayName: "طالب " + id, code: "1" + id, active: true, archived: false, authVersion: 1, ...over });
const asg = (id, classId, over = {}) => ({ assignmentId: id, classId, title: "واجب " + id, status: "published", dueAt: "2026-03-01T00:00:00.000Z", createdAt: "2026-02-01T00:00:00.000Z", totalMarks: 10, maxAttempts: 1, examSnapshot: { questions: [{ id: "q1", text: "س", marks: 10, topic: "T" }] }, ...over });
const attempt = (pct, over = {}) => ({ attemptNumber: 1, submittedAt: T0, score: pct / 10, totalMarks: 10, percentage: pct, finalized: true, manualReviewMarks: 0, questionGrades: [{ questionId: "q1", score: pct / 10, maxMarks: 10, correct: pct === 100 }], ...over });
const sub = (aid, sid, cid, att) => ({ assignmentId: aid, studentId: sid, classId: cid, attempts: [att], activeAttempt: null });

// ---------------------------------------------------------------------------------------------------------------
describe("A. class lifecycle matrix A–F — teacher analytics agrees with normalizeClassStatus", () => {
  const LIFE = {
    A: { active: true, status: "active" }, B: { active: false, status: "archived" }, C: { active: true, status: "archived" },
    D: { active: false, status: "active" }, E: { active: true }, F: { active: false }
  };
  function seed() {
    const s = {};
    for (const k of Object.keys(LIFE)) {
      s[CP + "c" + k + ".json"] = cls("c" + k, LIFE[k], { studentIds: ["s" + k] });
      s[UP + "s" + k + ".json"] = usr("s" + k, "c" + k);
      s[AP + "a" + k + ".json"] = asg("a" + k, "c" + k);
      s[SP + "a" + k + "/s" + k + ".json"] = sub("a" + k, "s" + k, "c" + k, attempt(80));
    }
    return createMemoryContainer(s);
  }
  it("classes[].active, kpis.activeClasses and classComparison follow the canonical outcome for every row (C fails on pre-R34 main)", async () => {
    const d = await computeTeacherAnalytics(seed().container);
    const expected = { A: "active", B: "archived", C: "archived", D: "archived", E: "active", F: "archived" };
    for (const k of Object.keys(LIFE)) {
      expect(normalizeClassStatus(LIFE[k])).toBe(expected[k]);
      const row = d.classes.find(c => c.classId === "c" + k);
      expect(row.active, "classes[].active for " + k).toBe(expected[k] === "active");
      expect(d.classComparison.some(c => c.classId === "c" + k), "classComparison for " + k).toBe(expected[k] === "active");
    }
    expect(d.kpis.activeClasses).toBe(2);                                        // A + E only
    expect(d.classComparison.map(c => c.classId).sort()).toEqual(["cA", "cE"]);
    expect(d.classes).toHaveLength(6);                                            // the catalogue keeps every class
    expect(Object.keys(d.classes[0]).sort()).toEqual(["active", "classId", "grade", "name", "schoolYear", "studentCount"]); // no field added/removed
  });
});

// ---------------------------------------------------------------------------------------------------------------
// One canonical-active class (cA: sA, sB) and one canonical-archived class (cZ: zA, zB) with published assignments and
// submissions in each; zB has a pending manual review and a very low score so it would drive follow-up/pending if
// counted; cZ also has a second assignment to affect the trend.
function twoClassSeed(archivedLife = { active: false, status: "archived" }) {
  const s = {};
  s[CP + "cA.json"] = cls("cA", { active: true, status: "active" }, { studentIds: ["sA", "sB"] });
  s[CP + "cZ.json"] = cls("cZ", archivedLife, { studentIds: ["zA", "zB"] });
  s[UP + "sA.json"] = usr("sA", "cA"); s[UP + "sB.json"] = usr("sB", "cA", { active: false, lastLoginAt: T0 });
  s[UP + "zA.json"] = usr("zA", "cZ"); s[UP + "zB.json"] = usr("zB", "cZ");
  s[AP + "a1.json"] = asg("a1", "cA"); s[AP + "z1.json"] = asg("z1", "cZ"); s[AP + "z2.json"] = asg("z2", "cZ", { dueAt: "2026-03-10T00:00:00.000Z" });
  s[SP + "a1/sA.json"] = sub("a1", "sA", "cA", attempt(90));
  s[SP + "a1/sB.json"] = sub("a1", "sB", "cA", attempt(70, { finalized: false, manualReviewMarks: 3 }));   // pending review (disabled member)
  s[SP + "z1/zA.json"] = sub("z1", "zA", "cZ", attempt(100));
  s[SP + "z1/zB.json"] = sub("z1", "zB", "cZ", attempt(10, { finalized: false, manualReviewMarks: 5 }));
  s[SP + "z2/zA.json"] = sub("z2", "zA", "cZ", attempt(20));
  return createMemoryContainer(s);
}

describe("B. GLOBAL teacher analytics is current/operational — a canonical-archived class contributes nothing (C1; fails on pre-R34 main)", () => {
  for (const [label, life] of [["canonical archived {active:false,status:'archived'}", { active: false, status: "archived" }], ["inconsistent archived {active:true,status:'archived'}", { active: true, status: "archived" }], ["legacy archived {active:false}", { active: false }]]) {
    it("archived class as " + label + " is excluded from every global population and KPI", async () => {
      const d = await computeTeacherAnalytics(twoClassSeed(life).container);
      expect(d.classes.find(c => c.classId === "cZ")).toMatchObject({ active: false, studentCount: 2 }); // still catalogued
      expect(d.kpis.activeClasses).toBe(1);
      expect(d.kpis.activeStudents).toBe(2);                                    // sA + sB (disabled member counts)
      expect(d.kpis.publishedAssignments).toBe(1);
      expect(d.kpis.expectedSubmissions).toBe(2);
      expect(d.kpis.submissions).toBe(2); expect(d.kpis.missingSubmissions).toBe(0);
      expect(d.kpis.pendingReview).toBe(1);                                     // sB only — zB's pending review is not current
      expect(d.kpis.lateSubmissions).toBe(0);
      expect(d.kpis.average).toBe(80); expect(d.kpis.highest).toBe(90); expect(d.kpis.lowest).toBe(70);
      expect(d.submissionStatus).toEqual({ submitted: 2, missing: 0, pendingReview: 1, late: 0 });
      expect(d.gradeDistribution.reduce((n, b) => n + b.count, 0)).toBe(2);
      expect(d.gradeDistribution.find(b => b.label === "أقل من 60").count).toBe(0); // zB's 10% and zA's 20% are not current
      expect(d.assignmentTrend.map(a => a.assignmentId)).toEqual(["a1"]);
      expect(d.classComparison.map(c => c.classId)).toEqual(["cA"]);
      expect(d.students.map(s => s.userId).sort()).toEqual(["sA", "sB"]);
      expect(d.followUp.map(s => s.userId)).not.toContain("zB");
      expect(d.topImprovers.map(s => s.userId)).not.toContain("zA");
      expect(d.topicAnalytics.reduce((n, t) => n + t.gradedQuestions, 0)).toBe(2);
      expect(d.kpis.neverLogged).toBe(1);                                       // sA only
      expect(d.insights.some(i => i.text.includes("تسليمات ناقصة"))).toBe(false);
    });
  }
  it("the active class metrics are exactly what a class-scoped request for it returns (global = union of active classes)", async () => {
    const ctx = twoClassSeed();
    const global = await computeTeacherAnalytics(ctx.container);
    const scoped = await computeTeacherAnalytics(ctx.container, { classId: "cA" });
    for (const k of ["activeStudents", "publishedAssignments", "expectedSubmissions", "submissions", "missingSubmissions", "pendingReview", "average", "highest", "lowest"]) expect(global.kpis[k], k).toBe(scoped.kpis[k]);
    expect(global.students).toEqual(scoped.students);
  });
  it("submissions of the archived class stay stored and are NOT deleted or rewritten by analytics", async () => {
    const ctx = twoClassSeed();
    const before = ctx.names().sort();
    await computeTeacherAnalytics(ctx.container);
    expect(ctx.names().sort()).toEqual(before);
    expect(ctx.getJson(SP + "z1/zB.json").attempts[0].percentage).toBe(10);
  });
});

describe("C. an EXPLICITLY requested archived class stays a historical view (unchanged)", () => {
  for (const [label, life] of [["canonical archived", { active: false, status: "archived" }], ["inconsistent archived", { active: true, status: "archived" }]]) {
    it(label + ": classId=cZ returns its members, assignments, submissions and pending review; no rejection", async () => {
      const d = await computeTeacherAnalytics(twoClassSeed(life).container, { classId: "cZ" });
      expect(d.scope).toMatchObject({ classId: "cZ", className: "صف cZ" });
      expect(d.kpis.activeStudents).toBe(2);
      expect(d.kpis.publishedAssignments).toBe(2);
      expect(d.kpis.expectedSubmissions).toBe(4); expect(d.kpis.submissions).toBe(3); expect(d.kpis.missingSubmissions).toBe(1);
      expect(d.kpis.pendingReview).toBe(1);
      expect(d.students.map(s => s.userId).sort()).toEqual(["zA", "zB"]);
      expect(d.assignmentTrend.map(a => a.assignmentId)).toEqual(["z1", "z2"]);
      expect(d.followUp.map(s => s.userId)).toContain("zB");
      expect(d.classComparison.map(c => c.classId)).toEqual(["cA"]);           // comparison stays canonical-active (unchanged rule)
      expect(d.kpis.activeClasses).toBe(1);
      const detail = await computeTeacherAnalytics(twoClassSeed(life).container, { classId: "cZ", studentId: "zB" });
      expect(detail.studentDetail).toMatchObject({ userId: "zB", completed: 1, missing: 1 });
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe("D. student membership matrix — canonical isStudentClassMember semantics unchanged (regression guard)", () => {
  function seed() {
    const s = {};
    s[CP + "cA.json"] = cls("cA", { active: true, status: "active" }, { studentIds: ["sA", "sB", "sC", "sF", "sD"] });
    s[CP + "cZ.json"] = cls("cZ", { active: true, status: "active" }, { studentIds: ["sD"] });
    s[UP + "sA.json"] = usr("sA", "cA");
    s[UP + "sB.json"] = usr("sB", "cA", { active: false });
    s[UP + "sC.json"] = usr("sC", "cA", { archived: true, active: false });
    s[UP + "sD.json"] = usr("sD", "cZ");                                          // moved; old submission under cA remains
    s[UP + "sE.json"] = { role: "teacher", userId: "sE", classId: "cA", displayName: "معلم", active: true };
    s[UP + "sG.json"] = { role: "student", userId: "sG", classId: "cA", displayName: "قديم", code: "1sG" }; // legacy: no active/archived
    s[AP + "aA.json"] = asg("aA", "cA");
    for (const id of ["sA", "sB", "sC", "sD", "sE", "sF", "sG"]) s[SP + "aA/" + id + ".json"] = sub("aA", id, "cA", attempt(80));
    return createMemoryContainer(s);
  }
  it("disabled and legacy members counted; archived, moved, non-student and index-only ghost excluded; stale submissions never resurrect membership", async () => {
    const ctx = seed();
    const d = await computeTeacherAnalytics(ctx.container, { classId: "cA" });
    expect(d.students.map(s => s.userId).sort()).toEqual(["sA", "sB", "sG"]);
    expect(d.kpis).toMatchObject({ activeStudents: 3, expectedSubmissions: 3, submissions: 3, average: 80 });
    expect(d.classComparison.find(c => c.classId === "cA")).toMatchObject({ students: 3, submitted: 3 });
    const gb = (await resultsHandler(GET("/api/assignment-results?assignmentId=aA"), deps(ctx))).jsonBody;
    expect(gb.students.map(s => s.studentId).sort()).toEqual(["sA", "sB", "sG"]); expect(gb.stats).toMatchObject({ students: 3, submitted: 3 });
    const ia = (await itemAnalysisHandler(GET("/api/assignment-item-analysis?assignmentId=aA"), deps(ctx))).jsonBody;
    expect(ia).toMatchObject({ studentsInClass: 3, studentsSubmitted: 3 });
    const rs = (await reportsHandler(GET("/api/reports?type=classStudents&classId=cA"), deps(ctx))).jsonBody;
    expect(rs.students.map(s => s.studentId).sort()).toEqual(["sA", "sB", "sG"]);
    // the moved student counts in the NEW class only, and the global scope lists them once
    const g = await computeTeacherAnalytics(ctx.container);
    expect(g.students.map(s => s.userId).sort()).toEqual(["sA", "sB", "sD", "sG"]);
    expect(g.classComparison.find(c => c.classId === "cZ")).toMatchObject({ students: 1, assignments: 0 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("E. assignment authority — teacher analytics is 'takeable now' through normalizeAssignmentStatus (behavior-neutral)", () => {
  function seed() {
    const s = {};
    s[CP + "cA.json"] = cls("cA", { active: true, status: "active" }, { studentIds: ["sA"] });
    s[UP + "sA.json"] = usr("sA", "cA");
    s[AP + "p.json"] = asg("p", "cA");
    s[AP + "d.json"] = asg("d", "cA", { status: "draft" });
    s[AP + "ap.json"] = asg("ap", "cA", { status: "archived", archivedFromStatus: "published", archivedAt: T0 });
    s[AP + "ad.json"] = asg("ad", "cA", { status: "archived", archivedFromStatus: "draft" });
    s[AP + "u.json"] = asg("u", "cA", { status: "weird" });                     // unknown → draft (never auto-published)
    s[AP + "n.json"] = asg("n", "cA", { status: undefined });
    for (const id of ["p", "d", "ap", "ad", "u", "n"]) s[SP + id + "/sA.json"] = sub(id, "sA", "cA", attempt(60));
    return createMemoryContainer(s);
  }
  it("only status 'published' counts; draft, archived (from published or draft), unknown and missing status do not", async () => {
    const d = await computeTeacherAnalytics(seed().container);
    expect(d.kpis.publishedAssignments).toBe(1); expect(d.assignmentTrend.map(a => a.assignmentId)).toEqual(["p"]);
    expect(d.kpis.expectedSubmissions).toBe(1); expect(d.kpis.submissions).toBe(1);
    expect(d.classComparison[0]).toMatchObject({ assignments: 1, submitted: 1 });
  });
  it("reports keep the wider historical predicate (published + archived-from-published) — intentionally different, unchanged", async () => {
    const r = (await reportsHandler(GET("/api/reports?type=class&classId=cA"), deps(seed()))).jsonBody;
    expect(r.kpis.assignments).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("F. project analytics — canonical enrollment / lifecycle / membership already hold (regression guards)", () => {
  const ns = getStorageNamespace("899373");
  const stage = getProjectDefinition("899373").stages[0].stageId;
  const progress = (cid, sid) => ({ programCode: "899373", classId: cid, studentId: sid, stages: { [stage]: { status: "ready_for_review" } }, history: [], updatedAt: T0 });
  function seed() {
    const s = {};
    s[CP + "cA.json"] = cls("cA", { active: true, status: "active" }, { programCodes: ["899373"], studentIds: ["sA", "sB", "sC", "sD"] });
    s[CP + "cR.json"] = cls("cR", { active: true, status: "active" }, { programCodes: [], studentIds: ["rA"] });          // enrollment REMOVED (blobs remain)
    s[CP + "cX.json"] = cls("cX", { active: true, status: "archived" }, { programCodes: ["899373"], studentIds: ["xA"] }); // archived (inconsistent doc)
    s[UP + "sA.json"] = usr("sA", "cA"); s[UP + "sB.json"] = usr("sB", "cA", { active: false }); s[UP + "sC.json"] = usr("sC", "cA", { archived: true, active: false }); s[UP + "sD.json"] = usr("sD", "cZ");
    s[UP + "rA.json"] = usr("rA", "cR"); s[UP + "xA.json"] = usr("xA", "cX");
    for (const cid of ["cA", "cR", "cX"]) s[ns.configName(cid)] = buildClassSnapshot(getProjectDefinition("899373"), cid, T0);
    for (const sid of ["sA", "sB", "sC", "sD", "ghost"]) s[ns.progressName("cA", sid)] = progress("cA", sid);
    s[ns.progressName("cR", "rA")] = progress("cR", "rA"); s[ns.progressName("cX", "xA")] = progress("cX", "xA");
    return createMemoryContainer(s);
  }
  it("stale progress of archived / moved / ghost students does not count; disabled member counts", async () => {
    const ctx = seed();
    const sum = (await trackerHandler(GET("/api/project-tracker?projectCode=899373&resource=summary&classId=cA"), deps(ctx))).jsonBody;
    expect(sum.summary).toMatchObject({ studentCount: 2, totalReadyStages: 2, studentsReadyForReview: 2 });
    const cards = (await trackerHandler(GET("/api/project-tracker?projectCode=899373&resource=students&classId=cA"), deps(ctx))).jsonBody;
    expect(cards.students.map(s => s.studentId).sort()).toEqual(["sA", "sB"]);
    const ready = (await reportsHandler(GET("/api/reports?type=ready&projectCode=899373&classId=cA"), deps(ctx))).jsonBody;
    expect(ready.totalReady).toBe(2);
    expect(ctx.has(ns.progressName("cA", "sC"))).toBe(true);                    // stored, not counted
  });
  it("removed enrollment disappears from the catalogue and refuses class views; archived class is readOnly on explicit view and excluded from projects-summary", async () => {
    const ctx = seed();
    const catalogue = (await trackerHandler(GET("/api/project-tracker?projectCode=899373&resource=classes"), deps(ctx))).jsonBody;
    expect(catalogue.classes.map(c => [c.classId, c.status])).toEqual([["cA", "active"], ["cX", "archived"]]);
    expect((await trackerHandler(GET("/api/project-tracker?projectCode=899373&resource=summary&classId=cR"), deps(ctx))).status).toBe(400);
    const archived = (await trackerHandler(GET("/api/project-tracker?projectCode=899373&resource=summary&classId=cX"), deps(ctx))).jsonBody;
    expect(archived.readOnly).toBe(true); expect(archived.summary.studentCount).toBe(1);
    const ps = (await trackerHandler(GET("/api/project-tracker?resource=projects-summary"), deps(ctx))).jsonBody;
    expect(ps).toEqual({ ok: true, totalReadyForReview: 2, byProject: { "794589": 0, "883589": 0, "899373": 2 } }); // cA only: not cR (removed), not cX (archived)
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("G. pending-review parity — teacher analytics and the gradebook both follow deriveGradingStatus", () => {
  const SHAPES = {
    manualModern: attempt(60, { finalized: true, manualReviewMarks: 4 }),      // manual marks override finalized:true → pending
    finalizedFalse: attempt(60, { finalized: false, manualReviewMarks: 0 }),   // pending
    legacyManual: (() => { const a = attempt(60, { manualReviewMarks: 4 }); delete a.finalized; return a; })(), // legacy pending
    legacyClean: (() => { const a = attempt(60, { manualReviewMarks: 0 }); delete a.finalized; return a; })(),  // legacy final
    finalizedTrue: attempt(60, { finalized: true, manualReviewMarks: 0 })      // final
  };
  it("kpis.pendingReview, classComparison.pendingReview and gradebook stats.pendingReview agree for every result shape", async () => {
    const s = {};
    s[CP + "cA.json"] = cls("cA", { active: true, status: "active" }, { studentIds: Object.keys(SHAPES) });
    s[AP + "aA.json"] = asg("aA", "cA");
    for (const [sid, att] of Object.entries(SHAPES)) { s[UP + sid + ".json"] = usr(sid, "cA"); s[SP + "aA/" + sid + ".json"] = sub("aA", sid, "cA", att); }
    const ctx = createMemoryContainer(s);
    const d = await computeTeacherAnalytics(ctx.container);
    const gb = (await resultsHandler(GET("/api/assignment-results?assignmentId=aA"), deps(ctx))).jsonBody;
    expect(d.kpis.pendingReview).toBe(3);
    expect(d.classComparison[0].pendingReview).toBe(3);
    expect(d.assignmentTrend[0].pendingReview).toBe(3);
    expect(gb.stats.pendingReview).toBe(3); expect(gb.stats.finalized).toBe(2);
    expect(gb.students.filter(x => x.gradingStatus === "pendingReview").map(x => x.studentId).sort()).toEqual(["finalizedFalse", "legacyManual", "manualModern"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("H. source guard — the analytics core imports the lifecycle authorities and never re-derives them from raw flags", () => {
  it("teacher-analytics-core requires class-lifecycle and assignment-lifecycle; class activity is not the raw active flag", () => {
    const src = readFileSync(new URL("../src/lib/teacher-analytics-core.js", import.meta.url), "utf8");
    expect(src).toContain('require("./class-lifecycle")');
    expect(src).toContain('require("./assignment-lifecycle")');
    expect(src).toContain('normalizeClassStatus(item) === "active"');
    expect(src).not.toMatch(/active:\s*item\.active !== false/);
    expect(src).not.toMatch(/item\.status === "published"/);
  });
});
