// Class gradebook GB7 — the read cost of «سجل العلامات» at the size the design record names (§5: a class of 40 students × 30 columns:
// 28 assignments and 2 manual columns, every submission present). The REAL route over the in-memory container, wrapped to count every
// download and listing and to add a fixed latency to each, so the numbers are storage round trips, not CPU.
//
//   - the values are checked against an independent computation (the change may not move a single mark);
//   - a repeated open of an unchanged gradebook downloads only the gradebook's own documents and the scheme's assignments — never the
//     1 120 submissions again (the shared ETag-verified document cache: listings still made on every request, so nothing is stale);
//   - one changed submission is downloaded again, and its new mark is shown at once;
//   - the columns are read concurrently: the first open's wall time stays within a bound a sequential column loop cannot meet.
// TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const gradebook = require("../src/functions/class-gradebook.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const STUDENTS = 40, ASSIGNMENTS = 28, LATENCY_MS = 4;
const A = { ok: true, user: { ver: 2, role: "teacher", sub: "teacher-perf", am: "multi-user" } };
const req = (method, body, url = "http://x/api/class-gradebook") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The mark of student s in assignment a: deterministic, varied, out of 20.
const mark = (s, a) => (s * 7 + a * 3) % 21;

function instrumented(mem) {
  const counts = { downloads: 0, lists: 0, submissionDownloads: 0 };
  const container = {
    ...mem.container,
    getBlobClient: name => {
      const real = mem.container.getBlobClient(name);
      return { ...real, download: async () => { counts.downloads++; if (name.startsWith("platform/submissions/")) counts.submissionDownloads++; await sleep(LATENCY_MS); return real.download(); } };
    },
    listBlobsFlat: opts => { counts.lists++; const it = mem.container.listBlobsFlat(opts); return (async function* () { await sleep(LATENCY_MS); yield* it; })(); }
  };
  return { container, counts, reset: () => { counts.downloads = 0; counts.lists = 0; counts.submissionDownloads = 0; } };
}

async function setup() {
  const mem = createMemoryContainer();
  const plain = { requireBuilderAuth: () => A, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, sessionGrants: async () => ({ ok: true, has: () => true }) };
  const classId = (await classrooms.handler(req("POST", { action: "create", name: "صف الأداء", grade: "11", schoolYear: "2026-2027" }), plain)).jsonBody.classroom.classId;
  const students = Array.from({ length: STUDENTS }, (_, i) => "stu" + String(i).padStart(3, "0"));
  students.forEach((id, i) => mem.setJson("platform/users/" + id + ".json", { userId: id, role: "student", classId, displayName: "طالب " + i, firstName: "طالب", familyName: String(i), code: "P" + i }));
  const assignments = Array.from({ length: ASSIGNMENTS }, (_, i) => "asg" + String(i).padStart(3, "0"));
  assignments.forEach((id, a) => {
    mem.setJson("platform/assignments/" + id + ".json", { assignmentId: id, classId, title: "واجب " + a, status: "published", totalMarks: 20 });
    students.forEach((s, si) => mem.setJson("platform/submissions/" + id + "/" + s + ".json", { assignmentId: id, studentId: s, attempts: [{ attemptNumber: 1, score: mark(si, a), totalMarks: 20, percentage: mark(si, a) * 5, finalized: true, manualReviewMarks: 0 }] }));
  });
  // Two parts: 28 assignments (equal weights 25 / 3.57 …) are awkward — use 4 + 24 + 2 manual so every sum is exactly 100.
  const items = (ids, w) => ids.map(id => ({ itemId: "i_" + id, weight: w, source: { kind: "assignment", assignmentId: id } }));
  const scheme = { categories: [
    { categoryId: "monthly", title: "الشهري", weight: 20, items: items(assignments.slice(0, 4), 25) },
    { categoryId: "term", title: "الفصل", weight: 60, items: [...items(assignments.slice(4, 24), 5)] },
    { categoryId: "final", title: "النهائي", weight: 20, items: [...items(assignments.slice(24, 28), 20), { itemId: "paper1", weight: 10, source: { kind: "manual", title: "ورقي 1", maxScore: 20 } }, { itemId: "paper2", weight: 10, source: { kind: "manual", title: "ورقي 2", maxScore: 20 } }] }
  ] };
  const saved = await gradebook.handler(req("POST", { action: "scheme.save", classId, etag: null, scheme }), plain);
  expect(saved.jsonBody).toMatchObject({ ok: true, status: "active" });
  const cells = { paper1: {}, paper2: {} };
  students.forEach((s, si) => { cells.paper1[s] = { score: (si % 20) + 0.5 }; cells.paper2[s] = { score: 20 - (si % 20) }; });
  mem.setJson("platform/gradebooks/" + classId + "/entries.json", { schemaVersion: 1, classId, revision: 1, cells });
  // The independent expectation (full precision) of each student's final mark.
  const expected = students.map((s, si) => {
    const pct = a => mark(si, a) * 5;
    const avg = list => list.reduce((x, y) => x + y, 0) / list.length;
    const monthly = avg([0, 1, 2, 3].map(pct));
    const term = avg(Array.from({ length: 20 }, (_, k) => pct(k + 4)));
    const fin = (avg([24, 25, 26, 27].map(pct)) * 80 + ((si % 20) + 0.5) * 5 * 10 + (20 - (si % 20)) * 5 * 10) / 100;
    return (monthly * 20 + term * 60 + fin * 20) / 100;
  });
  const meter = instrumented(mem);
  const get = () => gradebook.handler(req("GET", null, "http://x/api/class-gradebook?classId=" + classId), { ...plain, container: meter.container, getContainer: () => meter.container });
  return { mem, classId, students, assignments, expected, meter, get };
}

describe("GB7 — «سجل العلامات» at 40 students × 30 columns", () => {
  it("every final mark equals the independent computation", async () => {
    const s = await setup();
    const g = (await s.get()).jsonBody;
    expect(g.rows).toHaveLength(STUDENTS);
    expect(g.columns).toHaveLength(30);
    const byId = new Map(g.rows.map(r => [r.studentId, r]));
    s.students.forEach((id, i) => {
      const r = byId.get(id);
      expect(r.final.status).toBe("complete");
      expect(r.final.value).toBeCloseTo(s.expected[i], 9);
    });
  }, 60000);

  it("first open: the 1 120 submissions are read once, the columns concurrently; a repeat open of an unchanged gradebook reads none of them", async () => {
    const s = await setup();
    s.meter.reset();
    const t0 = Date.now();
    expect((await s.get()).status).toBe(200);
    const first = { ...s.meter.counts, ms: Date.now() - t0 };
    expect(first.submissionDownloads).toBe(STUDENTS * ASSIGNMENTS);
    // A sequential column loop costs at least ASSIGNMENTS × (1 assignment read + ⌈40 / 8⌉ submission rounds) round trips.
    const sequentialFloorMs = ASSIGNMENTS * (1 + Math.ceil(STUDENTS / 8)) * LATENCY_MS;
    expect(first.ms).toBeLessThan(sequentialFloorMs);

    s.meter.reset();
    expect((await s.get()).status).toBe(200);
    const repeat = { ...s.meter.counts };
    expect(repeat.submissionDownloads).toBe(0);
    // class, scheme, entries, approvals (GB6: one more document, the frozen approvals) + the scheme's assignment documents
    expect(repeat.downloads).toBeLessThanOrEqual(4 + ASSIGNMENTS);
    console.info("GB7 read cost — first open:", JSON.stringify(first), "· repeat open:", JSON.stringify(repeat), "· sequential floor (ms):", sequentialFloorMs);
  }, 60000);

  it("one changed submission is read again, and its new mark is shown at once (nothing stale)", async () => {
    const s = await setup();
    await s.get();
    const name = "platform/submissions/" + s.assignments[0] + "/" + s.students[0] + ".json";
    s.mem.setJson(name, { ...s.mem.getJson(name), attempts: [{ attemptNumber: 1, score: 20, totalMarks: 20, percentage: 100, finalized: true, manualReviewMarks: 0 }] });
    s.meter.reset();
    const g = (await s.get()).jsonBody;
    expect(s.meter.counts.submissionDownloads).toBe(1);
    const cell = g.rows.find(r => r.studentId === s.students[0]).cells["i_" + s.assignments[0]];
    expect(cell).toMatchObject({ state: "graded", display: 100 });
  }, 60000);
});
