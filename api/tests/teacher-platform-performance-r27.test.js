import { describe, it, expect, afterEach } from "vitest";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as classroomHandler } from "../src/functions/manage-classrooms.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as itemAnalysisHandler } from "../src/functions/assignment-item-analysis.js";
import { handler as reportsHandler } from "../src/functions/reports.js";
import { computeTeacherAnalytics } from "../src/lib/teacher-analytics-core.js";
import { listJson, mapConcurrent, downloadManyJson, setReadConcurrency, getReadConcurrency } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #27 — Teacher Platform Performance & Loading Optimization.
//
// Baseline (measured with an instrumented container): every teacher workflow read storage strictly one blob at
// a time (max 1 in flight), and the roster load downloaded EVERY achievement post in the system just to count
// likes. These tests are OPERATION-COUNT and CONCURRENCY tests over the real handlers (no timing assertions):
// bounded parallel reads, no duplicate reads, no extra writes, roster feed reads limited to roster students,
// exact scalability bounds, and byte-identical outputs versus the old sequential behaviour (read concurrency 1).

const T0 = "2026-03-01T10:00:00.000Z";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = ctx => ({ ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const get = (h, url) => ctx => h({ method: "GET", url: "https://x" + url, json: async () => ({}) }, deps(ctx));
afterEach(() => { setReadConcurrency(8); });

// Synthetic school: C classes × P students, A published assignments per class, ~80 % submissions, ~30 % feed posts.
function seed({ classes, perClass, assignmentsPerClass }) {
  const s = {}; let n = 0;
  for (let c = 1; c <= classes; c++) {
    const cid = "c" + c, ids = [];
    for (let i = 1; i <= perClass; i++) {
      const uid = "s" + (++n); ids.push(uid);
      s["platform/users/" + uid + ".json"] = { userId: uid, role: "student", active: i % 7 !== 0, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + uid, firstName: "ط", familyName: uid, code: String(100000000 + n), identityNumber: String(100000000 + n), lastLoginAt: T0 };
    }
    s["platform/classes/" + cid + ".json"] = { classId: cid, name: "صف " + c, active: true, status: "active", studentIds: ids, schoolYear: "2025-2026", updatedAt: "2026-01-01T00:00:00.000Z" };
    for (let a = 1; a <= assignmentsPerClass; a++) {
      const aid = "a" + c + "x" + a;
      s["platform/assignments/" + aid + ".json"] = { assignmentId: aid, classId: cid, status: "published", title: aid, createdAt: T0, dueAt: T0, maxAttempts: 1, totalMarks: 10, examSnapshot: { questions: [{ id: "q1", text: "س", marks: 10, topic: "جبر" }] } };
      ids.forEach((uid, k) => {
        if (k % 10 < 8) {
          const pct = 50 + ((k * 7) % 50), manual = k % 5 === 0 ? 3 : 0;
          s["platform/submissions/" + aid + "/" + uid + ".json"] = { assignmentId: aid, studentId: uid, classId: cid, attempts: [{ attemptNumber: 1, submittedAt: T0, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: manual, finalized: manual === 0, questionGrades: [{ questionId: "q1", score: pct / 10, maxMarks: 10, correct: pct >= 90, manualReview: manual > 0 }] }], activeAttempt: null };
          if (k % 10 < 3) s["platform/feed/" + cid + "/" + aid + "_" + uid + ".json"] = { postId: aid + "_" + uid, classId: cid, studentId: uid, assignmentId: aid, tier: "gold", createdAt: T0, reactions: { heart: ["x", "y"] }, teacherReaction: "clap" };
        }
      });
    }
  }
  return s;
}
function instrument(ctx) {
  const c = ctx.container, st = { lists: [], downloads: [], uploads: 0, inflight: 0, maxInflight: 0 };
  const ol = c.listBlobsFlat.bind(c);
  c.listBlobsFlat = o => { st.lists.push(o.prefix); return ol(o); };
  const og = c.getBlobClient.bind(c);
  c.getBlobClient = name => { const cl = og(name); const od = cl.download.bind(cl); cl.download = async () => { st.inflight++; st.maxInflight = Math.max(st.maxInflight, st.inflight); st.downloads.push(name); await new Promise(r => setTimeout(r, 1)); st.inflight--; return od(); }; return cl; };
  const ob = c.getBlockBlobClient.bind(c);
  c.getBlockBlobClient = name => { const b = ob(name); const ou = b.upload.bind(b); b.upload = async (...a) => { st.uploads++; return ou(...a); }; return b; };
  st.of = p => st.downloads.filter(n => n.startsWith(p)).length;
  st.dups = () => { const m = new Map(); for (const n of st.downloads) m.set(n, (m.get(n) || 0) + 1); return [...m.values()].filter(v => v > 1).length; };
  return st;
}
const strip = body => JSON.parse(JSON.stringify(body, (k, v) => (k === "generatedAt" ? undefined : v)));
// Runs a workflow twice on identical data: once with the OLD sequential behaviour (concurrency 1) and once with
// the default bounded concurrency; returns both bodies + the instrumentation of the concurrent run.
async function compare(seedOpts, run) {
  setReadConcurrency(1);
  const before = await run(createMemoryContainer(seed(seedOpts)));
  setReadConcurrency(8);
  const ctx = createMemoryContainer(seed(seedOpts));
  const st = instrument(ctx);
  const after = await run(ctx);
  return { before: strip(before), after: strip(after), st };
}
const SMALL = { classes: 1, perClass: 30, assignmentsPerClass: 6 };
const LARGE = { classes: 4, perClass: 25, assignmentsPerClass: 6 };   // 100 students, 24 assignments

describe("R27 A — bounded-concurrency read primitive", () => {
  it("A1 mapConcurrent preserves input order, respects the limit, and handles an empty list", async () => {
    let inflight = 0, max = 0;
    const out = await mapConcurrent([5, 1, 4, 2, 3, 6, 7], 3, async v => { inflight++; max = Math.max(max, inflight); await new Promise(r => setTimeout(r, v)); inflight--; return v * 10; });
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(max).toBe(3);
    expect(await mapConcurrent([], 8, async () => 1)).toEqual([]);
  });
  it("A2 the first failure rejects the whole operation (nothing swallowed) and stops scheduling further work", async () => {
    const started = [];
    await expect(mapConcurrent([1, 2, 3, 4, 5, 6, 7, 8], 2, async v => { started.push(v); await new Promise(r => setTimeout(r, 2)); if (v === 2) throw new Error("boom " + v); return v; })).rejects.toThrow("boom 2");
    expect(started.length).toBeLessThan(8);
  });
  it("A3 listJson: same documents in the same listing order as the sequential implementation; missing/non-json blobs skipped", async () => {
    const seedDocs = {}; for (let i = 0; i < 40; i++) seedDocs["platform/things/t" + String(i).padStart(2, "0") + ".json"] = { i };
    const ctx = createMemoryContainer(seedDocs);
    ctx.container.getBlockBlobClient("platform/things/not-json.txt").upload("x", 1, {});
    setReadConcurrency(1); const sequential = await listJson(ctx.container, "platform/things/");
    setReadConcurrency(8); const st = instrument(ctx); const concurrent = await listJson(ctx.container, "platform/things/");
    expect(concurrent).toEqual(sequential);
    expect(concurrent.map(d => d.i)).toEqual([...Array(40).keys()]);
    expect(st.maxInflight).toBe(8);
    expect(st.dups()).toBe(0);
    expect(await downloadManyJson(ctx.container, ["platform/things/t01.json", "platform/things/missing.json"])).toEqual([{ i: 1 }, null]);
  });
  it("A4 a non-404 storage error inside listJson still rejects (no silent degradation)", async () => {
    const ctx = createMemoryContainer({ "platform/things/a.json": { a: 1 }, "platform/things/b.json": { b: 1 } });
    const og = ctx.container.getBlobClient.bind(ctx.container);
    ctx.container.getBlobClient = name => { const cl = og(name); if (name.endsWith("b.json")) cl.download = async () => { const e = new Error("Server busy"); e.statusCode = 503; throw e; }; return cl; };
    await expect(listJson(ctx.container, "platform/things/")).rejects.toThrow("Server busy");
    expect(getReadConcurrency()).toBe(8);
  });
});

describe("R27 B — roster load (GET /api/students?classId=)", () => {
  const roster = get(studentHandler, "/api/students?classId=c1&includeArchived=1");
  it("B1 identical output to the sequential implementation; reads run in parallel; no duplicate reads; no writes", async () => {
    const { before, after, st } = await compare(LARGE, roster);
    expect(after).toEqual(before);
    expect(after.jsonBody.students).toHaveLength(25);
    expect(st.maxInflight).toBeGreaterThan(1);                 // pre-R27: always 1
    expect(st.maxInflight).toBeLessThanOrEqual(8);
    expect(st.dups()).toBe(0);
    expect(st.uploads).toBe(0);                                // roster index already synchronized → zero writes (R25)
  });
  it("B2 feed posts are read ONLY for roster students (selected by blob name), not every post in the system", async () => {
    const ctx = createMemoryContainer(seed(LARGE));
    const st = instrument(ctx);
    const r = await roster(ctx);
    const allPosts = ctx.names("platform/feed/").length, c1Posts = ctx.names("platform/feed/c1/").length;
    expect(allPosts).toBeGreaterThan(c1Posts);
    expect(st.of("platform/feed/")).toBe(c1Posts);              // pre-R27: allPosts (216 here)
    expect(r.jsonBody.students.find(s => s.userId === "s1").likesCount).toBe(6 * 3);   // 6 assignments × (2 hearts + teacher)
  });
  it("B3 an unparseable feed blob name is still downloaded and counted by the post's own studentId (never skipped)", async () => {
    const ctx = createMemoryContainer({ ...seed(SMALL), "platform/feed/c1/legacy-post.json": { postId: "legacy-post", classId: "c1", studentId: "s2", reactions: { fire: ["a"] } } });
    const st = instrument(ctx);
    const r = await roster(ctx);
    expect(st.downloads).toContain("platform/feed/c1/legacy-post.json");
    expect(r.jsonBody.students.find(s => s.userId === "s2").likesCount).toBe(6 * 3 + 1);
  });
  it("B4 scalability: downloads are exactly users + roster submissions + roster posts (+1 class read for the R25 index) — no O(N²)", async () => {
    const ctx = createMemoryContainer(seed(LARGE));
    const st = instrument(ctx);
    await roster(ctx);
    const users = ctx.names("platform/users/").length, subs = ctx.names("platform/submissions/").filter(n => /\/s(1|[2-9]|1\d|2[0-5])\.json$/.test(n)).length, posts = ctx.names("platform/feed/c1/").length;
    expect(st.downloads.length).toBe(users + subs + posts + 1);
    expect(st.lists.filter(p => p === "platform/users/")).toHaveLength(1);
  });
});

describe("R27 C — gradebook, item analysis, profile: identical results, parallel reads, bounded counts", () => {
  it("C1 assignment-results: same body; users read once; one submission read per member; parallel", async () => {
    const { before, after, st } = await compare(LARGE, get(resultsHandler, "/api/assignment-results?assignmentId=a1x1"));
    expect(after).toEqual(before);
    expect(after.jsonBody.stats.students).toBe(25);
    expect(after.jsonBody.stats.pendingReview).toBeGreaterThan(0);        // R23 grading authority visible in the parallel path
    expect(st.of("platform/users/")).toBe(100);
    expect(st.of("platform/submissions/")).toBe(25);
    expect(st.maxInflight).toBeGreaterThan(1);
    expect(st.dups()).toBe(0); expect(st.uploads).toBe(0);
  });
  it("C2 assignment-item-analysis: same body; bounded reads; parallel", async () => {
    const { before, after, st } = await compare(LARGE, get(itemAnalysisHandler, "/api/assignment-item-analysis?assignmentId=a1x1"));
    expect(after).toEqual(before);
    expect(after.jsonBody.studentsInClass).toBe(25);
    expect(st.of("platform/submissions/")).toBe(25);
    expect(st.maxInflight).toBeGreaterThan(1); expect(st.dups()).toBe(0); expect(st.uploads).toBe(0);
  });
  it("C3 student profile: same body (R26 population, R23 grading); one submission read per assignment; parallel", async () => {
    const { before, after, st } = await compare(LARGE, get(studentHandler, "/api/students?profileUserId=s1"));
    expect(after).toEqual(before);
    expect(after.jsonBody.profile.stats.assigned).toBe(6);
    expect(st.of("platform/submissions/")).toBe(24);
    expect(st.maxInflight).toBeGreaterThan(1); expect(st.dups()).toBe(0); expect(st.uploads).toBe(0);
  });
});

describe("R27 D — reports and analytics: identical results, parallel reads", () => {
  it("D1 class / assignments / student reports are byte-identical and read in parallel with no duplicate reads", async () => {
    for (const url of ["/api/reports?type=class&classId=c1", "/api/reports?type=assignments&classId=c1", "/api/reports?type=student&studentId=s1"]) {
      const { before, after, st } = await compare(LARGE, get(reportsHandler, url));
      expect(after).toEqual(before);
      expect(st.maxInflight).toBeGreaterThan(1); expect(st.dups()).toBe(0); expect(st.uploads).toBe(0);
    }
  });
  it("D2 teacher analytics (global + class scope) is identical and reads its four prefixes concurrently", async () => {
    for (const opts of [{}, { classId: "c1" }, { classId: "c1", studentId: "s3" }]) {
      const { before, after, st } = await compare(LARGE, ctx => computeTeacherAnalytics(ctx.container, opts));
      expect(after).toEqual(before);
      expect(st.maxInflight).toBeGreaterThan(4);                 // pre-R27: 4 (one sequential chain per prefix)
      expect(st.dups()).toBe(0); expect(st.uploads).toBe(0);
    }
  });
  it("D3 GET /api/classrooms is untouched: one classes listing, no user reads, sequential is fine", async () => {
    const ctx = createMemoryContainer(seed(LARGE));
    const st = instrument(ctx);
    const r = await get(classroomHandler, "/api/classrooms")(ctx);
    expect(r.jsonBody.classes).toHaveLength(4);
    expect(st.lists).toEqual(["platform/classes/"]);
    expect(st.of("platform/users/")).toBe(0);
  });
});
