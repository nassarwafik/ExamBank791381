import { describe, it, expect, afterEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { SUB, FROM, TO, school, instrument, strip } from "./fixtures/analytics-school.js";

// The core is CommonJS and `require`s platform-storage itself (see analytics-scoped-reads-r28.test.js).
const require = createRequire(import.meta.url);
const core = require("../src/lib/teacher-analytics-core.js");
const { setReadConcurrency, getReadConcurrency } = require("../src/lib/platform-storage.js");
const { computeTeacherAnalytics, submissionFolder, submissionPath } = core;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Phase 8E-3 — Analytics Scope Reads Optimization.
//
// Roadmap #28 stopped downloading archived/draft/history submissions, but a CLASS scope still listed the whole
// platform/submissions/ prefix and downloaded the same submission set as GLOBAL, and a STUDENT scope did the same
// although it consults ONE blob per scoped assignment. These are OPERATION-COUNT + EQUIVALENCE tests over the real
// core + the real in-memory container:
//   • GLOBAL is untouched (one prefix listing + candidate prefilter — the R28 suite still proves it);
//   • CLASS lists only the selected class's candidate assignment FOLDERS and downloads only those blobs;
//   • STUDENT lists nothing under submissions and requests exactly platform/submissions/{assignmentId}/{studentId}.json
//     for every scoped assignment, after the Phase 8A scope validation;
//   • the output deep-equals the pre-8E-3 pipeline (same code through the `scopedSubmissionReads:false` seam) AND the
//     pre-R28 full scan; document authority, 404 / error semantics and the R27 concurrency ceiling are unchanged.
const BEFORE = { scopedSubmissionReads: false };                                 // the pre-8E-3 read path (= main before this PR)
const FULL_SCAN = { selectSubmissionNames: names => names, scopedSubmissionReads: false };  // the pre-R28 full scan
afterEach(() => { setReadConcurrency(8); });

// Runs one scope three ways on identical data: pre-R28 full scan, pre-8E-3 (BEFORE, instrumented) and 8E-3 (instrumented).
async function compare(seed, scope) {
  const full = strip(await computeTeacherAnalytics(createMemoryContainer(seed).container, scope, FULL_SCAN));
  const bctx = createMemoryContainer(seed); const before = instrument(bctx);
  const ref = strip(await computeTeacherAnalytics(bctx.container, scope, BEFORE));
  const ctx = createMemoryContainer(seed); const st = instrument(ctx);
  const out = strip(await computeTeacherAnalytics(ctx.container, scope));
  return { full, ref, out, before, st };
}
const P = (aid, sid) => submissionPath(aid, sid);
const CLASS_C1 = { classId: "c1" }, STUDENT_S01 = { classId: "c1", studentId: "s01" };

describe("A. semantic equivalence — CLASS and STUDENT outputs deep-equal the pre-8E-3 pipeline and the pre-R28 full scan", () => {
  const CASES = {
    "class": CLASS_C1,
    "class + date range": { classId: "c1", fromMs: FROM, toMs: TO },
    "student (pending manual review on P1, P2 not submitted)": { classId: "c1", studentId: "s02" },
    "student + date range": { classId: "c1", studentId: "s01", fromMs: FROM, toMs: TO },
    "archived explicit class (historical view)": { classId: "c3" },
    "student of an archived explicit class": { classId: "c3", studentId: "s21" },
    "login-disabled but academically active member (legacy submission without classId)": { classId: "c1", studentId: "s03" },
    "second class (c2) — its own published work only": { classId: "c2" },
    "second class + range": { classId: "c2", fromMs: FROM, toMs: TO }
  };
  for (const [label, scope] of Object.entries(CASES)) {
    it("A " + label, async () => {
      const { full, ref, out } = await compare(school({ history: 3, foreign: 4, published: 2 }), scope);
      expect(out).toEqual(ref); expect(out).toEqual(full);
    });
  }
  it("A-values the equivalent outputs carry the expected population semantics (pending review, disabled member, archived student excluded, legacy doc)", async () => {
    const c1 = (await compare(school(), CLASS_C1)).out;
    expect(c1.students.map(s => s.userId).sort()).toEqual(["s01", "s02", "s03", "s04"]);      // s05 archived → excluded; s03 login-disabled → member
    expect(c1.kpis).toMatchObject({ activeStudents: 4, publishedAssignments: 3, submissions: 7, expectedSubmissions: 12, missingSubmissions: 5, pendingReview: 2 });
    expect(c1.classComparison).toEqual([]);
    const s02 = (await compare(school(), { classId: "c1", studentId: "s02" })).out;
    expect(s02.studentDetail).toMatchObject({ userId: "s02", assigned: 3, completed: 2, missing: 1 }); expect(s02.kpis.pendingReview).toBe(1);
    const s03 = (await compare(school(), { classId: "c1", studentId: "s03" })).out;
    expect(s03.studentDetail).toMatchObject({ userId: "s03", assigned: 3, completed: 1, missing: 2 });  // its only submission is the legacy P1 document (no classId)
    expect(s03.kpis.average).toBe(71);
    const c3 = (await compare(school(), { classId: "c3" })).out;
    expect(c3.students.map(s => s.userId)).toEqual(["s21"]); expect(c3.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 1, submissions: 1 });
    await expect(computeTeacherAnalytics(createMemoryContainer(school()).container, { classId: "c1", studentId: "s05" })).rejects.toMatchObject({ httpStatus: 400 });
    await expect(computeTeacherAnalytics(createMemoryContainer(school()).container, { classId: "c1", studentId: "s05" }, BEFORE)).rejects.toMatchObject({ httpStatus: 400 });
  });
  it("A-global the GLOBAL scope is byte-for-byte the R28 pipeline (same reads, same output)", async () => {
    const { ref, out, before, st } = await compare(school({ history: 3, foreign: 4 }), {});
    expect(out).toEqual(ref); expect(st.lists.sort()).toEqual(before.lists.sort()); expect(st.subs()).toEqual(before.subs());
    expect(st.lists.filter(p => p === SUB)).toHaveLength(1);
  });
});

describe("B. CLASS operation counts — only the selected class's candidate folders are listed and downloaded", () => {
  it("B1 c1: no whole-prefix listing; exactly its published/date-valid folders; exactly its 9 blobs; nothing of c2 / c3 / foreign classes", async () => {
    const { st, before, out, ref } = await compare(school({ history: 5, foreign: 50 }), CLASS_C1);
    expect(out).toEqual(ref);
    expect(st.lists).not.toContain(SUB);
    expect(st.subLists().sort()).toEqual([submissionFolder("P1"), submissionFolder("P2"), submissionFolder("P_old")]);
    expect(st.lists.filter(p => !p.startsWith(SUB)).sort()).toEqual(["platform/assignments/", "platform/classes/", "platform/users/"]);
    expect(st.subs()).toEqual([P("P1", "s01"), P("P1", "s02"), P("P1", "s03"), P("P1", "s05"), P("P2", "s01"), P("P2", "s04"), P("P2", "s11"), P("P_old", "s01"), P("P_old", "s02")]);
    expect(st.subs().some(n => /\/(P3|P4|PF\d+|D|AP|AD|LA|H\d+)\//.test(n))).toBe(false);
    expect(st.uploads).toBe(0); expect(st.dups()).toBe(0);
    // BEFORE (pre-8E-3): one whole-prefix listing + every published class's candidate blobs (12 + 50 foreign)
    expect(before.subLists()).toEqual([SUB]); expect(before.subs()).toHaveLength(62);
  });
  it("B2 c1 + date range lists only the in-range folders (P_old excluded) and downloads 7 blobs", async () => {
    const { st, before, out, ref } = await compare(school({ history: 5, foreign: 50 }), { classId: "c1", fromMs: FROM, toMs: TO });
    expect(out).toEqual(ref);
    expect(st.subLists().sort()).toEqual([submissionFolder("P1"), submissionFolder("P2")]); expect(st.subs()).toHaveLength(7);
    expect(before.subLists()).toEqual([SUB]); expect(before.subs()).toHaveLength(4 + 3 + 2 + 1 + 50);
  });
  it("B3 c2 and the archived explicit class c3 each read their own folder(s) only", async () => {
    const c2 = await compare(school({ foreign: 10 }), { classId: "c2" });
    expect(c2.st.subLists()).toEqual([submissionFolder("P3")]); expect(c2.st.subs()).toEqual([P("P3", "s11"), P("P3", "s12")]); expect(c2.out).toEqual(c2.ref);
    const c3 = await compare(school({ foreign: 10 }), { classId: "c3" });
    expect(c3.st.subLists()).toEqual([submissionFolder("P4")]); expect(c3.st.subs()).toEqual([P("P4", "s21")]); expect(c3.out).toEqual(c3.ref);
  });
  it("B4 large unrelated-class and history populations do not change c1's submission reads (before: they did)", async () => {
    const small = await compare(school(), CLASS_C1);
    const big = await compare(school({ history: 200, foreign: 200 }), CLASS_C1);
    expect(big.st.subs()).toEqual(small.st.subs()); expect(big.st.subLists().sort()).toEqual(small.st.subLists().sort());
    expect(big.st.subs()).toHaveLength(9); expect(big.out).toEqual(big.ref);
    expect(big.before.subs()).toHaveLength(12 + 200);                                            // pre-8E-3: every foreign class's blob
    expect(big.st.downloads.filter(n => n.startsWith("platform/assignments/"))).toHaveLength(9 + 200 + 200);  // assignments are still read in full
  });
  it("B5 a class with no candidate assignment lists nothing under submissions and downloads nothing", async () => {
    const seed = school(); delete seed["platform/assignments/P4.json"];
    const { st, out, ref } = await compare(seed, { classId: "c3" });
    expect(st.subLists()).toEqual([]); expect(st.subs()).toEqual([]); expect(out).toEqual(ref);
  });
  it("B6 document authority is unchanged: a blob under a c1 candidate folder whose document claims another assignment is downloaded but keyed by the document", async () => {
    const seed = school({ mismatch: true }); delete seed[SUB + "AP/hand-edited-b.json"];
    const { st, out, ref } = await compare(seed, CLASS_C1);
    expect(out).toEqual(ref); expect(st.downloads).toContain(SUB + "P1/hand-edited-a.json");
    expect(out.assignmentTrend.find(a => a.assignmentId === "P1").submitted).toBe(3);
  });
});

describe("C. STUDENT operation counts — zero submission listings, exact canonical paths only", () => {
  it("C1 s01: no listing under submissions; exactly one exact path per scoped assignment; no classmate / foreign path", async () => {
    const { st, before, out, ref } = await compare(school({ history: 5, foreign: 50 }), STUDENT_S01);
    expect(out).toEqual(ref);
    expect(st.subLists()).toEqual([]);
    expect(st.lists.sort()).toEqual(["platform/assignments/", "platform/classes/", "platform/users/"]);
    expect(st.subs()).toEqual([P("P1", "s01"), P("P2", "s01"), P("P_old", "s01")]);
    expect(st.downloads.filter(n => n.startsWith(SUB) && !n.endsWith("/s01.json"))).toEqual([]);
    expect(st.uploads).toBe(0); expect(st.dups()).toBe(0);
    expect(before.subLists()).toEqual([SUB]); expect(before.subs()).toHaveLength(62);                // pre-8E-3: same as the class/global set
  });
  it("C2 a missing canonical path is requested once, returns null and counts as 'not submitted' — no fallback scan", async () => {
    const { st, out, ref } = await compare(school(), { classId: "c1", studentId: "s02" });
    expect(out).toEqual(ref);
    expect(st.subs()).toEqual([P("P1", "s02"), P("P2", "s02"), P("P_old", "s02")]);                   // P2/s02.json does not exist → requested, 404 → null
    expect(st.subLists()).toEqual([]);
    expect(out.studentDetail).toMatchObject({ assigned: 3, completed: 2, missing: 1 });
    expect(out.assignmentTrend.find(a => a.assignmentId === "P2")).toMatchObject({ students: 1, submitted: 0, missing: 1 });
  });
  it("C3 student + date range requests only the in-range assignments' paths", async () => {
    const { st, out, ref } = await compare(school({ published: 3 }), { classId: "c1", studentId: "s04", fromMs: FROM, toMs: TO });
    expect(out).toEqual(ref);
    expect(st.subs()).toEqual([P("P1", "s04"), P("P2", "s04"), P("PX1", "s04"), P("PX2", "s04"), P("PX3", "s04")]);
    expect(st.subLists()).toEqual([]);
  });
  it("C4 a rejected / invalid student never widens to the class: the scope fails BEFORE any submission read", async () => {
    for (const [scope, status] of [[{ classId: "c1", studentId: "s05" }, 400], [{ classId: "c1", studentId: "s11" }, 400], [{ classId: "c1", studentId: "ghost" }, 404], [{ studentId: "s01" }, 400], [{ classId: "c3", studentId: "s01" }, 400]]) {
      const ctx = createMemoryContainer(school({ foreign: 5 })); const st = instrument(ctx);
      await expect(computeTeacherAnalytics(ctx.container, scope)).rejects.toMatchObject({ name: "AnalyticsScopeError", httpStatus: status });
      expect(st.subLists()).toEqual([]); expect(st.subs()).toEqual([]);
    }
  });
  it("C5 large unrelated populations do not change the student's reads (before: every published class's blobs were downloaded)", async () => {
    const small = await compare(school(), STUDENT_S01);
    const big = await compare(school({ history: 200, foreign: 200 }), STUDENT_S01);
    expect(big.st.subs()).toEqual(small.st.subs()); expect(big.st.subs()).toHaveLength(3); expect(big.out).toEqual(big.ref);
    expect(big.before.subs()).toHaveLength(12 + 200);
  });
});

describe("D. error behavior — selected reads still reject; unrelated blobs are never read", () => {
  it("D1 a non-404 failure on a SELECTED class submission blob rejects the class computation (before and after)", async () => {
    for (const deps of [undefined, BEFORE]) {
      const ctx = createMemoryContainer(school()); const st = instrument(ctx); st.fail.set(P("P1", "s02"), 500);
      await expect(computeTeacherAnalytics(ctx.container, CLASS_C1, deps)).rejects.toThrow(/storage failure/);
    }
  });
  it("D2 a non-404 failure on the STUDENT's exact path rejects the student computation", async () => {
    const ctx = createMemoryContainer(school()); const st = instrument(ctx); st.fail.set(P("P2", "s01"), 503);
    await expect(computeTeacherAnalytics(ctx.container, STUDENT_S01)).rejects.toThrow(/storage failure/);
  });
  it("D3 a 404 on the student's exact path is 'missing' (null), exactly like a blob that never existed", async () => {
    const ctx = createMemoryContainer(school()); const st = instrument(ctx); st.fail.set(P("P1", "s01"), 404);
    const out = strip(await computeTeacherAnalytics(ctx.container, STUDENT_S01));
    const seed = school(); delete seed[P("P1", "s01")];
    expect(out).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(seed).container, STUDENT_S01, BEFORE)));
    expect(out.studentDetail).toMatchObject({ completed: 2, missing: 1 });
  });
  it("D4 failures in OTHER classes' / other students' / history blobs cannot affect a class or student scope — those blobs are never read (before: the class scope DID read them and rejected)", async () => {
    const poison = st => { st.fail.set(P("P3", "s11"), 500); st.fail.set(P("P4", "s21"), 500); st.fail.set(P("PF1", "f001"), 500); st.fail.set(SUB + "H1/s01.json", 500); };
    const c = createMemoryContainer(school({ history: 2, foreign: 3 })); const cst = instrument(c); poison(cst);
    const cOut = strip(await computeTeacherAnalytics(c.container, CLASS_C1));
    expect(cOut).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(school({ history: 2, foreign: 3 })).container, CLASS_C1, BEFORE)));
    const b = createMemoryContainer(school({ history: 2, foreign: 3 })); const bst = instrument(b); poison(bst);
    await expect(computeTeacherAnalytics(b.container, CLASS_C1, BEFORE)).rejects.toThrow(/storage failure/);
    // student: even a classmate's blob (P1/s02) may be poisoned — s01's scope never touches it
    const s = createMemoryContainer(school({ history: 2, foreign: 3 })); const sst = instrument(s); poison(sst); sst.fail.set(P("P1", "s02"), 500);
    const sOut = strip(await computeTeacherAnalytics(s.container, STUDENT_S01));
    expect(sOut).toEqual(strip(await computeTeacherAnalytics(createMemoryContainer(school({ history: 2, foreign: 3 })).container, STUDENT_S01, BEFORE)));
    for (const st of [cst, sst]) for (const n of [P("P3", "s11"), P("P4", "s21"), P("PF1", "f001"), SUB + "H1/s01.json"]) expect(st.downloads).not.toContain(n);
    expect(sst.downloads).not.toContain(P("P1", "s02"));
  });
  it("D5 a class folder listing failure rejects (no partial academic data)", async () => {
    const ctx = createMemoryContainer(school());
    const ol = ctx.container.listBlobsFlat.bind(ctx.container);
    ctx.container.listBlobsFlat = o => { if (o.prefix === submissionFolder("P2")) throw new Error("listing failure"); return ol(o); };
    await expect(computeTeacherAnalytics(ctx.container, CLASS_C1)).rejects.toThrow(/listing failure/);
  });
});

describe("E. AI reuse — one canonical computation, no independent submission scan", () => {
  const read = f => readFileSync(path.join(HERE, "..", "src", f), "utf8");
  it("E1 teacher-analytics-ai.js and teacher-analytics.js call computeTeacherAnalytics and never touch submissions themselves", () => {
    for (const f of ["functions/teacher-analytics-ai.js", "functions/teacher-analytics.js"]) {
      const src = read(f);
      expect(src).toMatch(/computeTeacherAnalytics\(container/);
      expect(src).not.toMatch(/platform\/submissions|listJson\(|listBlobNames\(|downloadManyJson\(|downloadJsonOrNull\(|submissionPath|submissionFolder/);
    }
  });
  it("E2 the core has ONE whole-prefix submissions listing (the global path), exact student paths, and no roster authority", () => {
    const src = read("lib/teacher-analytics-core.js");
    expect(src.match(/listBlobNames\(container, SUBMISSION_PREFIX\)/g)).toHaveLength(1);
    expect(src).toMatch(/globalReads \? listBlobNames\(container, SUBMISSION_PREFIX\)/);                      // never for a scoped class/student read
    expect(src).toMatch(/submissionPath\(item\.assignmentId, requestedStudentId\)/);
    expect(src).not.toMatch(/studentIds/);
    expect(src).toMatch(/isStudentClassMember\(item, item\.classId\)/); expect(src).toMatch(/deriveGradingStatus\(record\.attempt\)/);
    expect(src).toMatch(/normalizeAssignmentStatus\(item\) === "published"/); expect(src).toMatch(/normalizeClassStatus\(item\) === "active"/);
  });
  it("E3 the AI handler's prompt is built from the same scoped result (a class scope carries no other class)", async () => {
    const { handler } = require("../src/functions/teacher-analytics-ai.js");
    const ctx = createMemoryContainer(school({ foreign: 3 })); const st = instrument(ctx);
    let prompt = "";
    const deps = { requireBuilderAuth: () => ({ ok: true }), container: ctx.container, createAiClient: async () => ({ chat: { completions: { create: async ({ messages }) => { prompt = messages[1].content; return { choices: [{ message: { content: "نصيحة" } }] }; } } } }) };
    const r = await handler({ method: "POST", url: "https://x/api/teacher-analytics-ai", json: async () => ({ classId: "c1", studentId: "s01" }) }, deps);
    expect(r.status).toBe(200); expect(prompt).toContain("طالب s01"); expect(prompt).not.toMatch(/s02|s03|s04|f001/);
    expect(st.subLists()).toEqual([]); expect(st.subs()).toEqual([P("P1", "s01"), P("P2", "s01"), P("P_old", "s01")]);
  });
});

describe("F. concurrency — the R27 bounded download ceiling holds for scoped reads", () => {
  it("F1 CLASS downloads run in parallel but never above the configured read concurrency", async () => {
    setReadConcurrency(3);
    const { st, out, ref } = await compare(school({ published: 12 }), CLASS_C1);
    expect(out).toEqual(ref); expect(st.subs()).toHaveLength(9 + 48);
    expect(st.maxSubInflight).toBeGreaterThan(1); expect(st.maxSubInflight).toBeLessThanOrEqual(getReadConcurrency());
  });
  it("F2 STUDENT exact reads run in parallel but never above the configured read concurrency", async () => {
    setReadConcurrency(3);
    const { st, out, ref } = await compare(school({ published: 12 }), STUDENT_S01);
    expect(out).toEqual(ref); expect(st.subs()).toHaveLength(15);
    expect(st.maxSubInflight).toBeGreaterThan(1); expect(st.maxSubInflight).toBeLessThanOrEqual(getReadConcurrency());
  });
  it("F3 with read concurrency 1 both scopes are strictly sequential and still equivalent", async () => {
    setReadConcurrency(1);
    for (const scope of [CLASS_C1, STUDENT_S01]) {
      const { st, out, ref } = await compare(school({ published: 4 }), scope);
      expect(out).toEqual(ref); expect(st.maxSubInflight).toBe(1);
    }
  });
});
