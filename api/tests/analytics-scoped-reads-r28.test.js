import { describe, it, expect, afterEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

// The core is CommonJS and `require`s platform-storage itself. Under vitest an ESM `import` of platform-storage
// would be a SEPARATE module instance (its read-concurrency seam would never reach the core), so both are loaded
// through the same CommonJS require chain the production code uses.
const require = createRequire(import.meta.url);
const core = require("../src/lib/teacher-analytics-core.js");
const { setReadConcurrency, getReadConcurrency } = require("../src/lib/platform-storage.js");

// Roadmap #28 — Scope-Aware Teacher Analytics Submission Reads.
//
// Pre-R28 the analytics core listed AND downloaded every blob under platform/submissions/ although it only ever
// consulted the submission map for assignments in its own population (published + inside the date range). These
// are OPERATION-COUNT tests over the real core + the real in-memory container: the submissions prefix is still
// listed exactly once, but only blobs under candidate assignment folders are downloaded; the output is deep-equal
// to the full-scan pipeline (same code with the prefilter disabled through the test seam) for every scope; the
// blob name is only a prefilter (document ids stay authoritative after download); errors still reject.

const { computeTeacherAnalytics, selectSubmissionNames, submissionPathAssignmentId } = core;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUB = "platform/submissions/";
const NOW = "2026-03-10T10:00:00.000Z", OLD = "2025-03-10T10:00:00.000Z";
const FROM = Date.parse("2026-02-01T00:00:00.000Z"), TO = Date.parse("2026-04-01T00:00:00.000Z");
const FULL_SCAN = { selectSubmissionNames: names => names };   // the pre-R28 pipeline: download every listed blob
afterEach(() => { setReadConcurrency(8); });

function user(uid, cid, extra = {}) {
  return { userId: uid, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + uid, firstName: "ط", familyName: uid, code: "1000000" + uid.slice(-2).padStart(2, "0"), identityNumber: "1000000" + uid.slice(-2).padStart(2, "0"), lastLoginAt: NOW, ...extra };
}
function assignment(aid, cid, status, date, extra = {}) {
  return { assignmentId: aid, classId: cid, status, title: "واجب " + aid, createdAt: date, dueAt: date, maxAttempts: 1, totalMarks: 10, examSnapshot: { questions: [{ id: "q1", text: "س", marks: 6, topic: "جبر" }, { id: "q2", text: "ص", marks: 4, topic: "هندسة" }] }, ...extra };
}
function submission(aid, sid, cid, pct, { pending = false, legacy = false } = {}, date = NOW) {
  const doc = { assignmentId: aid, studentId: sid, attempts: [{ attemptNumber: 1, submittedAt: date, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: pending ? 2 : 0, finalized: !pending, questionGrades: [{ questionId: "q1", score: pct >= 60 ? 6 : 3, maxMarks: 6, correct: pct >= 60, manualReview: false }, { questionId: "q2", score: pending ? 0 : 4, maxMarks: 4, correct: !pending, manualReview: pending }] }], activeAttempt: null };
  if (!legacy) doc.classId = cid;
  return doc;
}

// A school with every population case the analytics has to get right:
//   c1 (active): 4 members incl. one login-disabled (active:false) + one ARCHIVED student (not a member) + a
//      user of another class c2; c3 is an archived class.
//   assignments of c1: P1/P2 published now, P_old published a year ago (outside the range), D draft,
//      AP archived-from-published, AD archived-from-draft, LA legacy archived (no archivedFromStatus);
//      c2: P3 published; c3: P4 published (archived class — still "active:false" in the class list).
//   submissions exist for EVERY assignment (the archived ones carry real history), incl. pending/manual-review,
//   legacy documents without classId, an archived student's submission and a mismatch blob (see mismatch()).
function school({ history = 0, mismatch = false } = {}) {
  const s = {};
  s["platform/classes/c1.json"] = { classId: "c1", name: "صف 1", grade: "7", schoolYear: "2025-2026", active: true, status: "active", studentIds: ["s01", "s02", "s03", "s04"] };
  s["platform/classes/c2.json"] = { classId: "c2", name: "صف 2", grade: "8", schoolYear: "2025-2026", active: true, status: "active", studentIds: ["s11", "s12"] };
  s["platform/classes/c3.json"] = { classId: "c3", name: "صف 3", grade: "9", schoolYear: "2024-2025", active: false, status: "archived", studentIds: ["s21"] };
  for (const [uid, cid, extra] of [["s01", "c1"], ["s02", "c1"], ["s03", "c1", { active: false }], ["s04", "c1"], ["s05", "c1", { archived: true, active: false }], ["s11", "c2"], ["s12", "c2", { lastLoginAt: "" }], ["s21", "c3"]]) s["platform/users/" + uid + ".json"] = user(uid, cid, extra || {});
  s["platform/users/teacher.json"] = { userId: "teacher", role: "teacher", displayName: "معلم" };
  const A = {
    P1: assignment("P1", "c1", "published", NOW), P2: assignment("P2", "c1", "published", "2026-03-12T10:00:00.000Z"),
    P_old: assignment("P_old", "c1", "published", OLD), D: assignment("D", "c1", "draft", NOW),
    AP: assignment("AP", "c1", "archived", NOW, { archivedFromStatus: "published", archivedAt: NOW }),
    AD: assignment("AD", "c1", "archived", NOW, { archivedFromStatus: "draft", archivedAt: NOW }),
    LA: assignment("LA", "c1", "archived", NOW), P3: assignment("P3", "c2", "published", NOW), P4: assignment("P4", "c3", "published", NOW)
  };
  for (const a of Object.values(A)) s["platform/assignments/" + a.assignmentId + ".json"] = a;
  const put = (aid, sid, cid, pct, o, date) => { s[SUB + aid + "/" + sid + ".json"] = submission(aid, sid, cid, pct, o, date); };
  put("P1", "s01", "c1", 92); put("P1", "s02", "c1", 55, { pending: true }); put("P1", "s03", "c1", 71, { legacy: true }); put("P1", "s05", "c1", 40);
  put("P2", "s01", "c1", 88); put("P2", "s04", "c1", 61, { pending: true }); put("P2", "s11", "c2", 99);   // s11 is not a member of c1
  put("P_old", "s01", "c1", 30, {}, OLD); put("P_old", "s02", "c1", 35, {}, OLD);
  put("D", "s01", "c1", 100); put("AP", "s01", "c1", 77, {}, OLD); put("AP", "s02", "c1", 64, { legacy: true }, OLD);
  put("AD", "s01", "c1", 50); put("LA", "s01", "c1", 81, {}, OLD); put("P3", "s11", "c2", 90); put("P3", "s12", "c2", 45, { pending: true }); put("P4", "s21", "c3", 70);
  // Large archived history (prior years): `history` archived-from-published assignments × 4 submissions each.
  for (let i = 1; i <= history; i++) {
    const aid = "H" + i;
    s["platform/assignments/" + aid + ".json"] = assignment(aid, "c1", "archived", OLD, { archivedFromStatus: "published", archivedAt: OLD });
    for (const sid of ["s01", "s02", "s03", "s04"]) put(aid, sid, "c1", 50 + i % 40, {}, OLD);
  }
  if (mismatch) {
    // (a) blob under a CANDIDATE folder whose document belongs to an archived assignment: downloaded, keyed by
    //     the document (never consulted) → harmless over-inclusion.
    s[SUB + "P1/hand-edited-a.json"] = submission("AP", "s04", "c1", 15);
    // (b) blob under a NON-candidate folder whose document claims a candidate assignment: the documented
    //     boundary — not downloaded (see test H2).
    s[SUB + "AP/hand-edited-b.json"] = submission("P2", "s02", "c1", 13);
  }
  return s;
}
function instrument(ctx) {
  const c = ctx.container, st = { lists: [], downloads: [], uploads: 0, inflight: 0, maxInflight: 0, subInflight: 0, maxSubInflight: 0, fail: new Map() };
  const ol = c.listBlobsFlat.bind(c);
  c.listBlobsFlat = o => { st.lists.push(o.prefix); return ol(o); };
  const og = c.getBlobClient.bind(c);
  c.getBlobClient = name => {
    const cl = og(name); const od = cl.download.bind(cl);
    cl.download = async () => {
      if (st.fail.has(name)) { const e = new Error("storage failure " + name); e.statusCode = st.fail.get(name); throw e; }
      const sub = name.startsWith(SUB);
      st.inflight++; st.maxInflight = Math.max(st.maxInflight, st.inflight);
      if (sub) { st.subInflight++; st.maxSubInflight = Math.max(st.maxSubInflight, st.subInflight); }
      st.downloads.push(name); await new Promise(r => setTimeout(r, 1));
      st.inflight--; if (sub) st.subInflight--;
      return od();
    };
    return cl;
  };
  const ob = c.getBlockBlobClient.bind(c);
  c.getBlockBlobClient = name => { const b = ob(name); const ou = b.upload.bind(b); b.upload = async (...a) => { st.uploads++; return ou(...a); }; return b; };
  st.subs = () => st.downloads.filter(n => n.startsWith(SUB)).sort();
  st.dups = () => { const m = new Map(); for (const n of st.downloads) m.set(n, (m.get(n) || 0) + 1); return [...m.values()].filter(v => v > 1).length; };
  return st;
}
const strip = body => JSON.parse(JSON.stringify(body, (k, v) => (k === "generatedAt" ? undefined : v)));
// Runs the same scope twice on identical data: full scan (prefilter disabled) and R28; returns both + counters.
async function compare(seed, scope) {
  const ref = await computeTeacherAnalytics(createMemoryContainer(seed).container, scope, FULL_SCAN);
  const ctx = createMemoryContainer(seed); const st = instrument(ctx);
  const out = await computeTeacherAnalytics(ctx.container, scope);
  return { ref: strip(ref), out: strip(out), st };
}
const folders = names => [...new Set(names.map(n => n.slice(SUB.length).split("/")[0]))].sort();
const SCOPES = { global: {}, class: { classId: "c1" }, student: { classId: "c1", studentId: "s02" }, range: { fromMs: FROM, toMs: TO }, rangeClass: { classId: "c2", fromMs: FROM, toMs: TO }, studentGlobal: { studentId: "s11" } };

describe("A. selector — conservative name prefilter (pure)", () => {
  it("A1 keeps names whose folder segment is a candidate id, drops other folders, preserves listing order", () => {
    const names = [SUB + "a2/s1.json", SUB + "a1/s9.json", SUB + "a3/s1.json", SUB + "a1/s1.json"];
    expect(selectSubmissionNames(names, new Set(["a1"]))).toEqual([SUB + "a1/s9.json", SUB + "a1/s1.json"]);
    expect(selectSubmissionNames(names, new Set(["a1", "a3"]))).toEqual([SUB + "a1/s9.json", SUB + "a3/s1.json", SUB + "a1/s1.json"]);
  });
  it("A2 is exact on the folder segment (underscores/dots/prefixes never match by substring)", () => {
    const names = [SUB + "a1_x/s.json", SUB + "a1.json/s.json", SUB + "xa1/s.json", SUB + "a1/s.json"];
    expect(selectSubmissionNames(names, new Set(["a1"]))).toEqual([SUB + "a1/s.json"]);
    expect(submissionPathAssignmentId(SUB + "a1_x/s.json")).toBe("a1_x");
    expect(submissionPathAssignmentId(SUB + "1c3e/deep/er/s.json")).toBe("1c3e");
  });
  it("A3 over-includes anything it cannot parse: flat names, nested names under a candidate, names outside the prefix, empty candidate set", () => {
    const flat = SUB + "flat.json", nested = SUB + "a1/deep/x.json", outside = "elsewhere/a9/s.json", other = SUB + "a9/s.json";
    expect(selectSubmissionNames([flat, nested, outside, other], new Set(["a1"]))).toEqual([flat, nested, outside]);
    expect(selectSubmissionNames([flat, nested, outside, other], new Set())).toEqual([flat, outside]);
    expect(submissionPathAssignmentId(flat)).toBeNull(); expect(submissionPathAssignmentId(outside)).toBeNull(); expect(submissionPathAssignmentId(SUB + "/x.json")).toBeNull();
    expect(selectSubmissionNames(undefined, new Set(["a1"]))).toEqual([]);
  });
});

describe("B. semantic equivalence — R28 output deep-equals the full-scan pipeline for every scope", () => {
  for (const [label, scope] of Object.entries(SCOPES)) {
    it("B " + label + " scope", async () => {
      const { ref, out } = await compare(school({ history: 3 }), scope);
      expect(out).toEqual(ref);
      // the population under test is non-trivial: members only, pending review counted through deriveGradingStatus.
      // Roadmap #34 (C1): the GLOBAL scope is current/operational — the archived class c3 (s21, P4) no longer counts.
      if (label === "global") { expect(out.kpis.activeStudents).toBe(6); expect(out.kpis.publishedAssignments).toBe(4); expect(out.kpis.pendingReview).toBe(3); }
      if (label === "class") { expect(out.kpis.activeStudents).toBe(4); expect(out.kpis.publishedAssignments).toBe(3); expect(out.kpis.submissions).toBe(7); }
      if (label === "student") { expect(out.studentDetail?.userId).toBe("s02"); expect(out.studentDetail.completed).toBe(2); }
      if (label === "range") { expect(out.kpis.publishedAssignments).toBe(3); expect(out.classComparison.map(c => c.classId)).toEqual(expect.arrayContaining(["c1", "c2"])); }
    });
  }
  it("B7 population invariants hold in the R28 output (archived/inactive/other-class/draft/archived assignments, legacy submissions)", async () => {
    const { out } = await compare(school(), { classId: "c1" });
    expect(out.students.map(s => s.userId).sort()).toEqual(["s01", "s02", "s03", "s04"]);               // s05 archived → not a member; s03 login-disabled stays
    expect(out.assignmentTrend.map(a => a.assignmentId).sort()).toEqual(["P1", "P2", "P_old"]);        // draft/archived never in the population
    const p1 = out.assignmentTrend.find(a => a.assignmentId === "P1");
    expect(p1.submitted).toBe(3); expect(p1.pendingReview).toBe(1);                                    // s01, s02 (pending), s03 legacy w/o classId; s05 archived excluded
    expect(out.kpis.expectedSubmissions).toBe(12); expect(out.kpis.submissions).toBe(7); expect(out.kpis.missingSubmissions).toBe(5);
  });
});

describe("C. operation counts — one submissions list, downloads only under candidate assignment folders", () => {
  it("C1 lists every prefix exactly once (submissions listed once, as before) and writes nothing", async () => {
    const { st } = await compare(school({ history: 5 }), {});
    expect(st.lists.filter(p => p === SUB)).toHaveLength(1);
    expect(st.lists.sort()).toEqual(["platform/assignments/", "platform/classes/", SUB, "platform/users/"]);
    expect(st.uploads).toBe(0); expect(st.dups()).toBe(0);
  });
  it("C2 global scope downloads exactly the blobs of published assignments (all classes) — never draft/archived/history folders", async () => {
    const { st } = await compare(school({ history: 5 }), {});
    expect(folders(st.subs())).toEqual(["P1", "P2", "P3", "P4", "P_old"]);
    expect(st.subs()).toHaveLength(4 + 3 + 2 + 2 + 1);
    // users/classes/assignments are still read in full (membership authority = user documents)
    expect(st.downloads.filter(n => n.startsWith("platform/users/"))).toHaveLength(9);
    expect(st.downloads.filter(n => n.startsWith("platform/assignments/"))).toHaveLength(9 + 5);
  });
  it("C3 date-range scope downloads only in-range published assignment folders", async () => {
    const { st } = await compare(school({ history: 5 }), { fromMs: FROM, toMs: TO });
    expect(folders(st.subs())).toEqual(["P1", "P2", "P3", "P4"]);
  });
  it("C4 class scope keeps the same download set as global (classComparison needs every class's published work) — documented, not a regression", async () => {
    const g = await compare(school({ history: 5 }), {}); const c = await compare(school({ history: 5 }), { classId: "c1" });
    expect(c.st.subs()).toEqual(g.st.subs());
  });
  it("C5 an empty population (range with nothing published) downloads zero submissions but still lists once", async () => {
    const { st, out, ref } = await compare(school({ history: 5 }), { fromMs: Date.parse("2030-01-01T00:00:00.000Z"), toMs: Date.parse("2030-02-01T00:00:00.000Z") });
    expect(st.subs()).toEqual([]); expect(st.lists.filter(p => p === SUB)).toHaveLength(1); expect(out).toEqual(ref);
  });
});

describe("D. concurrency — R27 ceiling respected", () => {
  it("D1 submission downloads run in parallel but never above the configured read concurrency", async () => {
    const { st } = await compare(school({ history: 40 }), {});
    expect(st.maxSubInflight).toBeGreaterThan(1); expect(st.maxSubInflight).toBeLessThanOrEqual(getReadConcurrency());
    expect(st.maxInflight).toBeLessThanOrEqual(4 * getReadConcurrency());                                 // lists phase: 3 listJson + names
  });
  it("D2 with read concurrency 1 the same output is produced strictly sequentially", async () => {
    setReadConcurrency(1);
    const { st, out, ref } = await compare(school({ history: 3 }), { classId: "c1" });
    expect(st.maxInflight).toBeLessThanOrEqual(3); expect(st.maxSubInflight).toBe(1); expect(out).toEqual(ref);
  });
});

describe("E. error semantics — no partial academic data", () => {
  it("E1 a non-404 failure on a SELECTED submission blob rejects the computation (same as before)", async () => {
    const ctx = createMemoryContainer(school()); const st = instrument(ctx); st.fail.set(SUB + "P1/s02.json", 500);
    await expect(computeTeacherAnalytics(ctx.container, {})).rejects.toThrow(/storage failure/);
    await expect(computeTeacherAnalytics(ctx.container, {}, FULL_SCAN)).rejects.toThrow(/storage failure/);
  });
  it("E2 a failure on a NON-candidate blob (archived history) cannot affect the request because it is never downloaded", async () => {
    const ctx = createMemoryContainer(school({ history: 2 })); const st = instrument(ctx); st.fail.set(SUB + "H1/s01.json", 500);
    const out = strip(await computeTeacherAnalytics(ctx.container, {}));
    expect(out).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(school({ history: 2 })).container, {}, FULL_SCAN)));
    expect(st.downloads).not.toContain(SUB + "H1/s01.json");
  });
  it("E3 a listed blob that vanishes before download (404 → null) is ignored exactly as before", async () => {
    const ctx = createMemoryContainer(school()); const st = instrument(ctx);
    const ol = ctx.container.listBlobsFlat.bind(ctx.container);
    ctx.container.listBlobsFlat = o => { const it = ol(o); return (async function* () { for await (const b of it) yield b; if (o.prefix === SUB) yield { name: SUB + "P1/gone.json" }; })(); };
    const out = strip(await computeTeacherAnalytics(ctx.container, {}));
    expect(out).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(school()).container, {}, FULL_SCAN)));
    expect(st.lists.filter(p => p === SUB)).toHaveLength(1);
  });
});

describe("F. AI analytics reuse — one canonical optimized computation", () => {
  const read = f => readFileSync(path.join(HERE, "..", "src", f), "utf8");
  it("F1 teacher-analytics-ai.js calls computeTeacherAnalytics and performs no submission/list scan of its own", () => {
    const src = read("functions/teacher-analytics-ai.js");
    expect(src).toMatch(/computeTeacherAnalytics\(container/);
    expect(src).not.toMatch(/platform\/submissions|listJson\(|listBlobNames\(|downloadManyJson\(|downloadJsonOrNull\(/);
  });
  it("F2 teacher-analytics.js (dashboard endpoint) is the same single computation and still maps failures to 500", () => {
    const src = read("functions/teacher-analytics.js");
    expect(src).toMatch(/computeTeacherAnalytics\(container/); expect(src).not.toMatch(/platform\/submissions|listJson\(/); expect(src).toMatch(/status: 500/);
  });
  it("F3 the core lists the submissions prefix exactly once and never consults the roster index or another predicate", () => {
    const src = read("lib/teacher-analytics-core.js");
    expect(src.match(/listBlobNames\(container, SUBMISSION_PREFIX\)/g)).toHaveLength(1);
    expect(src).not.toMatch(/listJson\(container, SUBMISSION_PREFIX\)/); expect(src).not.toMatch(/studentIds/);
    expect(src).toMatch(/isStudentClassMember\(item, item\.classId\)/); expect(src).toMatch(/deriveGradingStatus\(record\.attempt\)/);
  });
});

describe("G. scalability — archived history no longer drives current-scope downloads", () => {
  it("G1 the current-scope submission download set is identical with 0, 20 and 200 archived assignments of history", async () => {
    const a = await compare(school({ history: 0 }), {}); const b = await compare(school({ history: 20 }), {}); const c = await compare(school({ history: 200 }), {});
    expect(b.st.subs()).toEqual(a.st.subs()); expect(c.st.subs()).toEqual(a.st.subs());
    expect(c.st.subs()).toHaveLength(12);
    // the full scan would have downloaded the history too (the pre-R28 cost)
    expect(Object.keys(school({ history: 200 })).filter(n => n.startsWith(SUB))).toHaveLength(12 + 5 + 800);
    for (const r of [a, b, c]) { expect(r.out).toEqual(r.ref); expect(r.st.lists.filter(p => p === SUB)).toHaveLength(1); }
  });
  it("G2 only assignment documents grow with history (still read in full), not submissions", async () => {
    const c = await compare(school({ history: 200 }), { classId: "c1" });
    expect(c.st.downloads.filter(n => n.startsWith("platform/assignments/"))).toHaveLength(209);
    expect(c.st.subs()).toHaveLength(12);
  });
});

describe("H. path/document mismatch — the name is a prefilter, the document is the authority", () => {
  it("H1 a blob under a candidate folder whose document belongs to another assignment is downloaded and keyed by the document (harmless over-inclusion, output identical)", async () => {
    const seed = school({ mismatch: true }); delete seed[SUB + "AP/hand-edited-b.json"];
    const { ref, out, st } = await compare(seed, {});
    expect(out).toEqual(ref); expect(st.downloads).toContain(SUB + "P1/hand-edited-a.json");
    expect(out.assignmentTrend.find(a => a.assignmentId === "P1").submitted).toBe(3);                    // s04's misplaced doc never counts for P1
  });
  it("H2 documented boundary: a blob under a NON-candidate folder whose document claims a candidate assignment is not downloaded — the result equals the full scan of a store without that blob", async () => {
    const seed = school({ mismatch: true });
    const { out, st } = await compare(seed, {});
    expect(st.downloads).not.toContain(SUB + "AP/hand-edited-b.json");
    const without = school({ mismatch: true }); delete without[SUB + "AP/hand-edited-b.json"];
    expect(out).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(without).container, {}, FULL_SCAN)));
    // and the full scan of the SAME store shows what the boundary costs: s02 would have been counted as submitted for P2
    const full = strip(await computeTeacherAnalytics(createMemoryContainer(seed).container, {}, FULL_SCAN));
    expect(full.assignmentTrend.find(a => a.assignmentId === "P2").submitted).toBe(out.assignmentTrend.find(a => a.assignmentId === "P2").submitted + 1);
  });
});
