// PERF-1 — READ-COST BASELINE: what one teacher's gradebook and reports cost as OTHER teachers' data grows.
//
// The platform stores every document of every teacher under one flat prefix per kind (platform/users/, platform/classes/,
// platform/assignments/, platform/submissions/). Phase 12E-B gave the two hottest read paths (student dashboard, teacher
// Today) a per-class index; the routes measured here still list and download the WHOLE prefix and then keep the teacher's
// own documents. This file pins that scaling on purpose (BASELINE), exactly like 12E-A did before 12E-B: the response of
// teacher A is identical whatever the other teachers hold, while the number of storage reads grows with their data.
//
// REAL handlers (class-gradebook.js, reports.js) over the REAL in-memory container, counted by tests/helpers/read-cost.js.
// Stubbed only: the teacher session and the capability grants. A fresh fixture per measurement is a COLD instance (the
// ETag-verified document cache keeps one slot per container object); a second request on the same fixture is WARM.
// The measured formulas and the recommended follow-up are in docs/read-cost-baseline-perf1.md. A phase that adds class-scoped
// reads for these routes is expected to replace the BASELINE expectations below, together with that change and its proof.
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const gradebook = require("../src/functions/class-gradebook.js");
const { handler: reports } = require("../src/functions/reports.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const { instrumentReadCost } = require("./helpers/read-cost.js");

const UP = "platform/users/", CP = "platform/classes/", AP = "platform/assignments/", SP = "platform/submissions/";
const NOW = "2026-03-01T10:00:00.000Z";
const TEACHER = "teacher-a";
const AUTH = { ok: true, user: { ver: 2, role: "teacher", sub: TEACHER, am: "multi-user" } };
const final = pct => ({ attemptNumber: 1, submittedAt: NOW, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: 0, finalized: true });

// Teacher A: one class, STUDENTS students, ASSIGNMENTS published assignments, every submission present, a gradebook scheme over them.
// `others` other teachers, each with the same shape (their own class, students, assignments and submissions).
const STUDENTS = 10, ASSIGNMENTS = 4;
function school(others) {
  const seed = {};
  const teacher = (owner, classId) => {
    seed[CP + classId + ".json"] = { classId, name: "صف " + classId, status: "active", active: true, schoolYear: "2025-2026", ownerId: owner, programCodes: [] };
    for (let s = 0; s < STUDENTS; s++) {
      const sid = classId + "-s" + s;
      seed[UP + sid + ".json"] = { userId: sid, role: "student", active: true, archived: false, classId, ownerId: owner, displayName: "طالب " + sid, code: "C" + sid };
    }
    for (let a = 0; a < ASSIGNMENTS; a++) {
      const aid = classId + "-a" + a;
      seed[AP + aid + ".json"] = { assignmentId: aid, classId, ownerId: owner, status: "published", title: "واجب " + aid, createdAt: NOW, publishedAt: NOW, totalMarks: 10 };
      for (let s = 0; s < STUDENTS; s++) seed[SP + aid + "/" + classId + "-s" + s + ".json"] = { assignmentId: aid, studentId: classId + "-s" + s, attempts: [final(50 + ((s * 7 + a * 3) % 50))] };
    }
  };
  teacher(TEACHER, "ca");
  for (let t = 0; t < others; t++) teacher("teacher-o" + t, "co" + t);
  seed["platform/gradebooks/ca/scheme.json"] = {
    schemaVersion: 1, classId: "ca", revision: 1, updatedAt: NOW,
    categories: [{ categoryId: "all", title: "الكل", weight: 100, items: Array.from({ length: ASSIGNMENTS }, (_, a) => ({ itemId: "i" + a, weight: 100 / ASSIGNMENTS, source: { kind: "assignment", assignmentId: "ca-a" + a } })) }]
  };
  return seed;
}
const deps = ctx => ({ requireBuilderAuth: () => AUTH, container: ctx.container, getContainer: () => ctx.container, sessionGrants: async () => ({ ok: true, has: () => true }), recordAuditEvent: async () => {} });
const req = url => ({ method: "GET", url, headers: { get: () => "" } });
const ROUTES = {
  "gradebook (GET)": ctx => gradebook.handler(req("http://x/api/class-gradebook?classId=ca"), deps(ctx)),
  "gradebook sources (GET resource=sources)": ctx => gradebook.handler(req("http://x/api/class-gradebook?classId=ca&resource=sources"), deps(ctx)),
  "class report (type=class)": ctx => reports(req("https://x/api/reports?type=class&classId=ca"), deps(ctx)),
  "reports overview (type=overview)": ctx => reports(req("https://x/api/reports?type=overview"), deps(ctx))
};

async function measure(route, others) {
  const ctx = createMemoryContainer(school(others)), rc = instrumentReadCost(ctx.container);
  const cold = await ROUTES[route](ctx);
  expect(cold.status, route + " cold").toBe(200);
  const coldOps = rc.snapshot();
  const by = { users: rc.downloadsOf(UP), classes: rc.downloadsOf(CP), assignments: rc.downloadsOf(AP), submissions: rc.downloadsOf(SP) };
  const listed = { users: rc.listsOf(UP), classes: rc.listsOf(CP), assignments: rc.listsOf(AP), submissionsWhole: rc.listsOf(SP), submissionFolders: rc.listsUnder(SP) - rc.listsOf(SP) };
  rc.reset();
  const warm = await ROUTES[route](ctx);
  expect(warm.jsonBody, route + " warm = cold").toEqual(cold.jsonBody);
  return { body: cold.jsonBody, downloads: coldOps.downloads, lists: coldOps.lists, by, listed, warmDownloads: rc.snapshot().downloads, warmLists: rc.snapshot().lists };
}

// Per other teacher: 1 class + STUDENTS users + ASSIGNMENTS assignments (+ STUDENTS × ASSIGNMENTS submissions, never downloaded here).
const PER_TEACHER = { classes: 1, users: STUDENTS, assignments: ASSIGNMENTS };

describe("PERF-1 BASELINE — teacher A's response does not depend on other teachers, its read cost does", () => {
  for (const route of Object.keys(ROUTES)) {
    it(route + ": identical body for 0 / 5 / 20 other teachers; cold downloads grow with their documents", async () => {
      const m0 = await measure(route, 0), m5 = await measure(route, 5), m20 = await measure(route, 20);
      // Tenancy holds: nothing of another teacher reaches the body.
      // (the in-memory fixture numbers its ETags in seed order, so a body's `etags` differ by construction: compared without them)
      const same = b => { const { etags: _etags, ...rest } = b || {}; return rest; };
      expect(same(m5.body)).toEqual(same(m0.body));
      expect(same(m20.body)).toEqual(same(m0.body));
      expect(JSON.stringify(m20.body)).not.toMatch(/teacher-o\d|co\d+-/);
      // BASELINE: every extra teacher adds the documents of the prefixes this route scans (cold instance).
      const grow = (a, b, k) => (b - a) / k;
      const perTeacher = { users: grow(m0.by.users, m20.by.users, 20), classes: grow(m0.by.classes, m20.by.classes, 20), assignments: grow(m0.by.assignments, m20.by.assignments, 20), submissions: grow(m0.by.submissions, m20.by.submissions, 20) };
      const scanned = BASELINE[route];
      expect(perTeacher).toEqual(Object.fromEntries(Object.keys(perTeacher).map(k => [k, scanned.includes(k) ? PER_TEACHER[k] : 0])));
      // Linear, not accidental: 5 teachers cost exactly a quarter of the growth of 20.
      expect(m20.downloads - m0.downloads).toBe(4 * (m5.downloads - m0.downloads));
      // The submissions of other teachers are never DOWNLOADED (only teacher A's own folders are read).
      expect(m20.by.submissions).toBe(m0.by.submissions);
      // Listings stay constant in count (one per scanned prefix, plus teacher A's own submission folders) …
      expect(m20.lists).toBe(m0.lists);
      // … and a warm instance downloads none of the scanned documents again (ETag-verified cache), but still lists them all.
      expect(m20.warmDownloads).toBeLessThan(m20.downloads);
      expect(m20.warmLists).toBe(m20.lists);
      MEASURED[route] = { cold0: m0.downloads, cold5: m5.downloads, cold20: m20.downloads, perTeacher, lists: m0.lists, listed: m0.listed, warm20: m20.warmDownloads };
    });
  }
});

// Which of the four prefixes each route downloads whole (measured at the commit that adds this file).
const BASELINE = {
  "gradebook (GET)": ["users"],
  "gradebook sources (GET resource=sources)": ["assignments"],
  "class report (type=class)": ["users", "assignments"],
  "reports overview (type=overview)": ["users", "classes", "assignments"]
};
const MEASURED = {};
// PERF1_PRINT=1 prints the measured table (the numbers in docs/read-cost-baseline-perf1.md).
afterAll(() => { if (process.env.PERF1_PRINT === "1") console.log("PERF1 " + JSON.stringify(MEASURED, null, 2)); });
