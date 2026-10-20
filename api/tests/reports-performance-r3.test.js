// Phase R-3 — Reports Center read cost (docs/reports-center-audit.md, P1-2). OPERATION-COUNT tests over the REAL reports handler
// and the in-memory container (no timing assertions):
//   A. a report reads the user documents ONCE per request — a class enrolled in two projects used to scan every user of the
//      platform three times (the report's roster + one project-tracker roster per project);
//   B. the users / classes / assignments / submissions listings go through the shared ETag-verified document cache: a repeated
//      request over unchanged storage downloads none of those documents again (the listings are still made every time, so
//      nothing can be stale), and the bodies are identical;
//   C. correctness by construction: a document changed between two requests is downloaded again and the report reflects it.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { handler: reports } = require("../src/functions/reports.js");
const { getProjectDefinition, getStorageNamespace } = require("../src/lib/project-tracker/registry.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const NOW = "2026-03-01T10:00:00.000Z";
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589") };
const progress = (code, cid, sid, statuses) => {
  const ids = getProjectDefinition(code).stages.filter(s => s.active !== false).slice(0, statuses.length).map(s => s.stageId);
  return { programCode: code, classId: cid, studentId: sid, stages: Object.fromEntries(ids.map((id, i) => [id, { status: statuses[i], updatedAt: NOW }])), history: [], updatedAt: NOW };
};
const final = pct => ({ attemptNumber: 1, submittedAt: NOW, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: 0, finalized: true });
function school() {
  const s = {
    "platform/classes/c1.json": { classId: "c1", name: "صف أ", status: "active", active: true, schoolYear: "2025-2026", programCodes: ["899373", "883589"], studentIds: ["s1", "s2", "s3"] },
    "platform/classes/c2.json": { classId: "c2", name: "صف ب", status: "active", active: true, schoolYear: "2025-2026", programCodes: [], studentIds: ["s9"] }
  };
  for (const [id, cid] of [["s1", "c1"], ["s2", "c1"], ["s3", "c1"], ["s9", "c2"]]) s["platform/users/" + id + ".json"] = { userId: id, role: "student", active: true, archived: false, classId: cid, displayName: "طالب " + id };
  for (const aid of ["a1", "a2", "a3"]) {
    s["platform/assignments/" + aid + ".json"] = { assignmentId: aid, classId: "c1", status: "published", title: "واجب " + aid, createdAt: NOW, totalMarks: 10 };
    s["platform/submissions/" + aid + "/s1.json"] = { assignmentId: aid, studentId: "s1", attempts: [final(80)] };
    s["platform/submissions/" + aid + "/s2.json"] = { assignmentId: aid, studentId: "s2", attempts: [final(60)] };
  }
  s["platform/assignments/b1.json"] = { assignmentId: "b1", classId: "c2", status: "published", title: "واجب ب", createdAt: NOW, totalMarks: 10 };
  s[NS.A.progressName("c1", "s1")] = progress("899373", "c1", "s1", ["approved", "ready_for_review"]);
  s[NS.B.progressName("c1", "s1")] = progress("883589", "c1", "s1", ["in_progress"]);
  return s;
}
function instrument(ctx) {
  const c = ctx.container, st = { lists: [], downloads: [] };
  const ol = c.listBlobsFlat.bind(c);
  c.listBlobsFlat = o => { st.lists.push(o.prefix); return ol(o); };
  const og = c.getBlobClient.bind(c);
  c.getBlobClient = name => { const cl = og(name); const od = cl.download.bind(cl); cl.download = async (...a) => { st.downloads.push(name); return od(...a); }; return cl; };
  st.listsOf = p => st.lists.filter(x => x === p).length;
  st.downloadsUnder = p => st.downloads.filter(n => n.startsWith(p)).length;
  st.reset = () => { st.lists.length = 0; st.downloads.length = 0; };
  return st;
}
const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status).toBe(200); return r.jsonBody; };
const COLD = ["platform/users/", "platform/assignments/", "platform/submissions/", "platform/classes/"];

describe("R-3 A — one users read per request", () => {
  it("class report of a class in two projects lists the users ONCE (was 3: roster + one per project)", async () => {
    const ctx = createMemoryContainer(school()), st = instrument(ctx);
    const body = await report(ctx, "type=class&classId=c1");
    expect(body.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    expect(st.listsOf("platform/users/")).toBe(1);
    expect(st.downloadsUnder("platform/users/")).toBe(4);              // each user document once, not three times
  });
});

describe("R-3 B — repeated reports over unchanged storage reuse the ETag-verified documents", () => {
  for (const qs of ["type=class&classId=c1", "type=assignments&classId=c1", "type=filters", "type=classStudents&classId=c1"]) {
    it(qs + ": the second request lists again but downloads no unchanged user / class / assignment / submission document", async () => {
      const ctx = createMemoryContainer(school()), st = instrument(ctx);
      const first = await report(ctx, qs);
      st.reset();
      const second = await report(ctx, qs);
      expect(second).toEqual(first);
      // the one direct read of the named class (loadClass) is a single document by name, not a listing — it stays
      expect(st.downloads.filter(n => COLD.some(p => n.startsWith(p)) && n !== "platform/classes/c1.json")).toEqual([]);
      expect(st.lists.length).toBeGreaterThan(0);                      // freshness: the listings are still made
    });
  }
});

describe("R-3 C — a changed document is always read again", () => {
  it("a submission changed between two assignments reports is downloaded again and the figures follow it", async () => {
    const ctx = createMemoryContainer(school()), st = instrument(ctx);
    const first = await report(ctx, "type=assignments&classId=c1");
    expect(first.perAssignment[0].average).toBe(70);
    ctx.setJson("platform/submissions/a1/s2.json", { assignmentId: "a1", studentId: "s2", attempts: [final(100)] });
    st.reset();
    const second = await report(ctx, "type=assignments&classId=c1");
    expect(second.perAssignment[0].average).toBe(90);
    expect(st.downloads.filter(n => n.startsWith("platform/submissions/"))).toEqual(["platform/submissions/a1/s2.json"]);
  });
  it("a student added between two class reports appears (the users listing is not cached)", async () => {
    const ctx = createMemoryContainer(school());
    expect((await report(ctx, "type=classStudents&classId=c1")).students).toHaveLength(3);
    ctx.setJson("platform/users/s4.json", { userId: "s4", role: "student", active: true, archived: false, classId: "c1", displayName: "طالب s4" });
    expect((await report(ctx, "type=classStudents&classId=c1")).students.map(s => s.studentId)).toContain("s4");
  });
});
