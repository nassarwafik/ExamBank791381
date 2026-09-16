import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as obs from "../src/lib/observability.js";
import { createRequire } from "node:module";
// The handlers `require` platform-storage (CJS); an ESM import would yield a second class instance and
// break the handler's `instanceof StorageConflictError` check, so load the same CJS instance they use.
const { StorageConflictError } = createRequire(import.meta.url)("../src/lib/platform-storage.js");
import { getStorageNamespace, getProjectDefinition } from "../src/lib/project-tracker/registry.js";
import { buildClassSnapshotFromDefault } from "../src/lib/project-794589-template.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as teacherAnalytics } from "../src/functions/teacher-analytics.js";
import { handler as teacherAnalyticsAi } from "../src/functions/teacher-analytics-ai.js";
import { handler as teacherFeed } from "../src/functions/teacher-achievement-feed.js";
import { handler as reports } from "../src/functions/reports.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as legacyTracker } from "../src/functions/project-794589.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as studentProject } from "../src/functions/student-project.js";
import { handler as studentProfile } from "../src/functions/student-profile.js";
import { handler as studentFeed } from "../src/functions/achievement-feed.js";
import { handler as itemAnalysis } from "../src/functions/assignment-item-analysis.js";
import { handler as studentDashboard } from "../src/functions/student-dashboard.js";

// Roadmap #31 — Observability & Error-Path Parity for Platform Routes.
//
// Pre-R31, eleven platform routes were registered without withObservability and ended in a bare
// `catch { return 500 }`: no X-Request-ID, no log line, nothing to correlate. These tests drive the REAL
// handlers through the REAL wrapper (withObservability(route, handler)) with the log sink captured and prove:
//   A. exactly the approved inventory is wrapped (source guard) — fails on pre-R31 main;
//   B. success responses are unchanged (status + body deep-equal to the bare handler) and carry X-Request-ID;
//   C. an unexpected storage/service failure keeps the exact generic 500 body, carries X-Request-ID and is
//      logged EXACTLY ONCE through the safe path (error class only — never the raw message, token, body or
//      student data); the wrapper never logs the same exception a second time;
//   D. expected 400 / 401 / 403 / 404 / 503 paths keep their status and body;
//   E. student-dashboard (already wrapped) now reports its inner swallowed failure, once.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = f => readFileSync(path.join(HERE, "..", "src", "functions", f + ".js"), "utf8");
const INVENTORY = {
  // frontend-used platform routes that were unwrapped
  "teacher-analytics": "teacher.analytics.error", "teacher-analytics-ai": "teacher.analyticsAi.error", "teacher-achievement-feed": "teacher.feed.error",
  reports: "reports.error", "project-tracker": "project.tracker.error", "student-project-tracker": "student.projectTracker.error",
  "student-profile": "student.profile.error", "achievement-feed": "student.feed.error", "assignment-item-analysis": "assignment.itemAnalysis.error",
  // legacy compatibility routes (no current frontend caller)
  "project-794589": "project.legacy794589.error", "student-project": "student.project.error"
};

// ── log capture ──
let records = [];
beforeEach(() => { records = []; obs.setSink(r => records.push(r)); });
afterEach(() => { obs.resetSink(); delete process.env.ZAI_API_KEY; });
const serialized = () => JSON.stringify(records);
const errorEvents = () => records.filter(r => typeof r.event === "string" && r.event.endsWith(".error"));

// ── sensitive markers that must never reach a log line ──
const RAW_MESSAGE = "SECRET-RAW-FAILURE", TOKEN = "tok-SECRET-123", STUDENT_NAME = "طالب سرّي", IDENTITY = "987654321", BODY_MARKER = "bodySecretValue";
const MARKERS = [RAW_MESSAGE, TOKEN, STUDENT_NAME, IDENTITY, BODY_MARKER];
function assertSafeLogs() { const s = serialized(); for (const m of MARKERS) expect(s).not.toContain(m); }
function assertLoggedOnce(event, status = 500) {
  const errs = errorEvents();
  expect(errs).toHaveLength(1); expect(errs[0].event).toBe(event); expect(errs[0].level).toBe("error");
  expect(errs[0].error).toBeTruthy(); expect(errs[0].error.errorClass).toBeTruthy(); expect("message" in errs[0].error).toBe(false); expect("stack" in errs[0].error).toBe(false);
  expect(records.filter(r => r.event === "http.request.exception")).toHaveLength(0);           // the wrapper did NOT double-log
  const done = records.filter(r => r.event === "http.request.failed" || r.event === "http.request.completed");
  expect(done).toHaveLength(1); expect(done[0].status).toBe(status);
  assertSafeLogs();
}
const rid = r => r.headers && r.headers["X-Request-ID"];
function expectHeader(r) { expect(rid(r)).toMatch(/^[A-Za-z0-9._-]{1,80}$/); }

// ── requests / deps ──
const headers = { get: k => (String(k).toLowerCase() === "authorization" ? "Bearer " + TOKEN : null) };
const GET = url => ({ method: "GET", url: "https://x" + url, headers, json: async () => ({}) });
const POST = (url, body) => ({ method: "POST", url: "https://x" + url, headers, json: async () => ({ ...body, [BODY_MARKER]: BODY_MARKER }) });
const AUTH_OK = () => ({ ok: true, user: { sub: "teacher-1" } });
const AUTH_NO = () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } });
const teacherDeps = (ctx, auth = AUTH_OK) => ({ requireBuilderAuth: auth, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const studentDeps = (ctx, id = "s1", ok = true) => ({
  requireActiveStudentSession: async () => ok ? { ok: true, container: ctx.container, user: { sub: id }, student: ctx.getJson("platform/users/" + id + ".json") } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } },
  container: ctx.container, getContainer: () => ctx.container
});
// Makes ONE blob's download throw an unexpected (non-404) storage error carrying secrets in its message.
function failDownload(ctx, name) {
  const orig = ctx.container.getBlobClient.bind(ctx.container);
  ctx.container.getBlobClient = n => { const cl = orig(n); if (n === name) cl.download = async () => { const e = new Error(RAW_MESSAGE + " " + TOKEN); e.statusCode = 503; throw e; }; return cl; };
  return ctx;
}
const strip = body => JSON.parse(JSON.stringify(body, (k, v) => (k === "generatedAt" ? undefined : v)));
// Runs the BARE handler and the WRAPPED handler on identical seeds: same status, same body, header only on the wrapped one.
async function parity(route, handler, makeSeed, makeDeps, request) {
  const bare = await handler(request, makeDeps(createMemoryContainer(makeSeed())));
  const wrapped = await obs.withObservability(route, handler)(request, makeDeps(createMemoryContainer(makeSeed())));
  expect(wrapped.status).toBe(bare.status); expect(strip(wrapped.jsonBody)).toEqual(strip(bare.jsonBody));
  expect(rid(bare)).toBeUndefined(); expectHeader(wrapped);
  expect(errorEvents()).toHaveLength(0);
  return wrapped;
}

// ── seeds ──
const NOW = "2026-03-01T10:00:00.000Z";
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: STUDENT_NAME + " " + id, firstName: STUDENT_NAME, familyName: id, code: IDENTITY, identityNumber: IDENTITY, lastLoginAt: NOW, avatarId: "a1", shareAchievements: true, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: ["s1"], programCodes: [], createdAt: NOW, updatedAt: "2026-01-01T00:00:00.000Z", ...extra });
function school(extra = {}) {
  const s = {
    "platform/classes/c1.json": room("c1", extra.c1 || {}), "platform/classes/cArch.json": room("cArch", { active: false, status: "archived", studentIds: [], programCodes: ["899373"] }),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1", { active: false }),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", createdAt: NOW, dueAt: NOW, maxAttempts: 1, totalMarks: 10, attemptModelVersion: 2, examSnapshot: { questions: [{ id: "q1", text: "س", marks: 10, topic: "جبر" }] } },
    "platform/submissions/a1/s1.json": { assignmentId: "a1", studentId: "s1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: NOW, score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: 8, maxMarks: 10, correct: true, manualReview: false }] }], activeAttempt: null },
    "platform/feed/c1/a1_s1.json": { postId: "a1_s1", classId: "c1", studentId: "s1", assignmentId: "a1", studentDisplayName: STUDENT_NAME, assignmentTitle: "واجب", tier: "gold", createdAt: NOW, reactions: { heart: ["s2"] }, teacherReaction: null, teacherNote: "" }
  };
  return s;
}
const projectSchool = () => { const s = school({ c1: { programCodes: ["899373", "794589"] } }); const ns = getStorageNamespace("899373"); const st = getProjectDefinition("899373").stages[0].stageId; s[ns.progressName("c1", "s1")] = { programCode: "899373", classId: "c1", studentId: "s1", stages: { [st]: { status: "approved", updatedAt: NOW } }, history: [], updatedAt: NOW }; s[getStorageNamespace("794589").configName("c1")] = buildClassSnapshotFromDefault("c1", NOW); return s; };

// ═══════════════════════════════════════════════════════════════════════════
describe("A. inventory / source guard — exactly the approved routes are wrapped", () => {
  it("A1 all 11 approved routes register through withObservability and export their handler; no inline handler or silent 500 catch remains", () => {
    for (const route of Object.keys(INVENTORY)) {
      const src = SRC(route);
      expect(src.match(new RegExp('withObservability\\("' + route + '",\\s*handler\\)', "g")) || []).toHaveLength(1);
      expect(src).toMatch(/module\.exports\s*=\s*\{\s*handler\s*\}/);
      expect(src).not.toMatch(/handler:\s*async request\s*=>/);
      expect(src).toContain('logError("' + INVENTORY[route] + '"');
      expect(src).not.toMatch(/catch\s*\{\s*return\s*\{\s*status:\s*500/);          // the old silent generic catch is gone
    }
  });
  it("A2 student-dashboard stays wrapped and its inner catch now reports the swallowed exception", () => {
    const src = SRC("student-dashboard");
    expect(src).toMatch(/withObservability\("student-dashboard",handler\)/); expect(src).toContain('logError("student.dashboard.error"');
  });
  it("A3 the approved inventory is exactly 9 frontend-used routes + 2 legacy routes", () => {
    expect(Object.keys(INVENTORY).sort()).toEqual(["achievement-feed", "assignment-item-analysis", "project-794589", "project-tracker", "reports", "student-profile", "student-project", "student-project-tracker", "teacher-achievement-feed", "teacher-analytics", "teacher-analytics-ai"]);
  });
});

describe("teacher-analytics", () => {
  const W = obs.withObservability("teacher-analytics", teacherAnalytics);
  it("B success parity + X-Request-ID", async () => { const r = await parity("teacher-analytics", teacherAnalytics, school, teacherDeps, GET("/api/teacher-analytics")); expect(r.jsonBody.kpis.activeStudents).toBe(2); });
  it("C unexpected storage failure → same generic 500, header, one safe logError", async () => {
    const r = await W(GET("/api/teacher-analytics"), teacherDeps(failDownload(createMemoryContainer(school()), "platform/users/s1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر جلب تحليلات المعلم حاليًا." }); expectHeader(r); assertLoggedOnce("teacher.analytics.error");
  });
  it("D 401 unchanged, nothing logged as an error", async () => { const r = await W(GET("/api/teacher-analytics"), teacherDeps(createMemoryContainer(school()), AUTH_NO)); expect(r.status).toBe(401); expectHeader(r); expect(errorEvents()).toHaveLength(0); });
});

describe("teacher-analytics-ai", () => {
  const W = obs.withObservability("teacher-analytics-ai", teacherAnalyticsAi);
  it("C missing AI configuration is an unexpected failure → same generic 500, header, one safe logError (message not logged)", async () => {
    delete process.env.ZAI_API_KEY;
    const r = await W(POST("/api/teacher-analytics-ai", { classId: "c1" }), teacherDeps(createMemoryContainer(school())));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر إجراء التحليل الذكي حاليًا." }); expectHeader(r); assertLoggedOnce("teacher.analyticsAi.error");
    expect(serialized()).not.toContain("ZAI_API_KEY");
  });
  it("D 401 unchanged", async () => { const r = await W(POST("/api/teacher-analytics-ai", {}), teacherDeps(createMemoryContainer(school()), AUTH_NO)); expect(r.status).toBe(401); expectHeader(r); expect(errorEvents()).toHaveLength(0); });
});

describe("teacher-achievement-feed", () => {
  const W = obs.withObservability("teacher-achievement-feed", teacherFeed);
  it("B GET parity", async () => { const r = await parity("teacher-achievement-feed", teacherFeed, school, teacherDeps, GET("/api/teacher-achievement-feed")); expect(r.jsonBody.posts).toHaveLength(1); });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/teacher-achievement-feed"), teacherDeps(failDownload(createMemoryContainer(school()), "platform/feed/c1/a1_s1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تنفيذ عملية الإشعارات حاليًا." }); expectHeader(r); assertLoggedOnce("teacher.feed.error");
  });
  it("D 400 (missing ids / invalid reaction), 404 (missing post), 503 (persistent conflict) unchanged", async () => {
    const ctx = createMemoryContainer(school());
    expect((await W(POST("/api/teacher-achievement-feed", { action: "react" }), teacherDeps(ctx))).status).toBe(400);
    expect((await W(POST("/api/teacher-achievement-feed", { action: "react", classId: "c1", postId: "a1_s1", reaction: "nope" }), teacherDeps(ctx))).jsonBody).toEqual({ ok: false, error: "ردّ الفعل غير صالح." });
    const r404 = await W(POST("/api/teacher-achievement-feed", { action: "react", classId: "c1", postId: "ghost", reaction: "clap" }), teacherDeps(ctx));
    expect(r404.status).toBe(404); expect(r404.jsonBody).toEqual({ ok: false, error: "المنشور غير موجود." }); expectHeader(r404);
    const busy = createMemoryContainer(school(), { beforeConditionalUpload: (name, api) => { if (name === "platform/feed/c1/a1_s1.json") api.setJson(name, api.getJson(name)); } });
    const r503 = await W(POST("/api/teacher-achievement-feed", { action: "setNote", classId: "c1", postId: "a1_s1", note: "n" }), teacherDeps(busy));
    expect(r503.status).toBe(503); expect(r503.jsonBody.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.");
    expect(errorEvents()).toHaveLength(0); assertSafeLogs();
  });
});

describe("reports", () => {
  const W = obs.withObservability("reports", reports);
  it("B filters + class report parity", async () => {
    await parity("reports", reports, school, teacherDeps, GET("/api/reports?type=filters"));
    const r = await parity("reports", reports, school, teacherDeps, GET("/api/reports?type=class&classId=c1")); expect(r.jsonBody.kpis.assignments).toBe(1);
  });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/reports?type=class&classId=c1"), teacherDeps(failDownload(createMemoryContainer(school()), "platform/classes/c1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تجهيز التقرير حاليًا." }); expectHeader(r); assertLoggedOnce("reports.error");
  });
  it("D 400 / 404 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(school());
    expect((await W(GET("/api/reports?type=class"), teacherDeps(ctx))).jsonBody).toEqual({ ok: false, error: "classId مطلوب." });
    expect((await W(GET("/api/reports?type=class&classId=nope"), teacherDeps(ctx))).status).toBe(404);
    expect((await W(GET("/api/reports?type=filters"), teacherDeps(ctx, AUTH_NO))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0);
  });
});

describe("project-tracker (generic)", () => {
  const W = obs.withObservability("project-tracker", tracker);
  it("B projects catalogue + classes parity", async () => {
    await parity("project-tracker", tracker, projectSchool, teacherDeps, GET("/api/project-tracker?resource=projects"));
    const r = await parity("project-tracker", tracker, projectSchool, teacherDeps, GET("/api/project-tracker?projectCode=899373&resource=classes")); expect(r.jsonBody.classes.map(c => c.classId)).toEqual(["c1", "cArch"]); // catalogue lists archived enrolled classes too (with their status)
  });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/project-tracker?projectCode=899373&resource=classes"), teacherDeps(failDownload(createMemoryContainer(projectSchool()), "platform/classes/c1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." }); expectHeader(r); assertLoggedOnce("project.tracker.error");
  });
  it("D 400 / 404 / 403 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(projectSchool());
    expect((await W(GET("/api/project-tracker?projectCode=899373&resource=summary"), teacherDeps(ctx))).jsonBody).toEqual({ ok: false, error: "classId مطلوب." });
    expect((await W(GET("/api/project-tracker?projectCode=899373&resource=summary&classId=nope"), teacherDeps(ctx))).status).toBe(404);
    expect((await W(POST("/api/project-tracker", { projectCode: "899373", action: "program.activate", classId: "cArch" }), teacherDeps(ctx))).status).toBe(403);
    expect((await W(GET("/api/project-tracker?resource=projects"), teacherDeps(ctx, AUTH_NO))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0);
  });
});

describe("project-794589 (legacy)", () => {
  const W = obs.withObservability("project-794589", legacyTracker);
  it("B classes parity", async () => { const r = await parity("project-794589", legacyTracker, projectSchool, teacherDeps, GET("/api/project-794589?resource=classes")); expect(r.jsonBody.classes.map(c => c.classId)).toEqual(["c1"]); });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/project-794589?resource=classes"), teacherDeps(failDownload(createMemoryContainer(projectSchool()), "platform/classes/c1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." }); expectHeader(r); assertLoggedOnce("project.legacy794589.error");
  });
  it("D 403 (not enrolled) / 404 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(projectSchool());
    expect((await W(GET("/api/project-794589?resource=summary&classId=cArch"), teacherDeps(ctx))).status).toBe(403);
    expect((await W(GET("/api/project-794589?resource=summary&classId=nope"), teacherDeps(ctx))).status).toBe(404);
    expect((await W(GET("/api/project-794589?resource=classes"), teacherDeps(ctx, AUTH_NO))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0);
  });
});

describe("student-project-tracker", () => {
  const W = obs.withObservability("student-project-tracker", studentTracker);
  it("B parity", async () => { const r = await parity("student-project-tracker", studentTracker, projectSchool, ctx => studentDeps(ctx), GET("/api/student-project-tracker")); expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["899373", "794589"]); });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/student-project-tracker"), studentDeps(failDownload(createMemoryContainer(projectSchool()), "platform/classes/c1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." }); expectHeader(r); assertLoggedOnce("student.projectTracker.error");
  });
  it("D 401 unchanged", async () => { const r = await W(GET("/api/student-project-tracker"), studentDeps(createMemoryContainer(projectSchool()), "s1", false)); expect(r.status).toBe(401); expectHeader(r); expect(errorEvents()).toHaveLength(0); });
});

describe("student-project (legacy)", () => {
  const W = obs.withObservability("student-project", studentProject);
  it("B parity (enrolled and not enrolled)", async () => {
    const r = await parity("student-project", studentProject, projectSchool, ctx => studentDeps(ctx), GET("/api/student-project")); expect(r.jsonBody.enrolled).toBe(true);
    const r2 = await parity("student-project", studentProject, school, ctx => studentDeps(ctx), GET("/api/student-project")); expect(r2.jsonBody).toEqual({ ok: true, enrolled: false });
  });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/student-project"), studentDeps(failDownload(createMemoryContainer(projectSchool()), "platform/classes/c1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." }); expectHeader(r); assertLoggedOnce("student.project.error");
  });
  it("D 401 unchanged", async () => { const r = await W(GET("/api/student-project"), studentDeps(createMemoryContainer(projectSchool()), "s1", false)); expect(r.status).toBe(401); expect(errorEvents()).toHaveLength(0); });
});

describe("student-profile", () => {
  const W = obs.withObservability("student-profile", studentProfile);
  it("B setAvatar parity", async () => { const r = await parity("student-profile", studentProfile, school, ctx => studentDeps(ctx), POST("/api/student-profile", { action: "setAvatar", avatarId: "a3" })); expect(r.jsonBody).toEqual({ ok: true, avatarId: "a3" }); });
  it("C unexpected failure inside the mutation → generic 500 + one safe logError", async () => {
    const ctx = createMemoryContainer(school());
    const r = await W(POST("/api/student-profile", { action: "setAvatar", avatarId: "a3" }), { ...studentDeps(ctx), mutateJsonWithRetry: async () => { throw new Error(RAW_MESSAGE + " " + TOKEN); } });
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحديث الأيقونة حاليًا." }); expectHeader(r); assertLoggedOnce("student.profile.error");
  });
  it("D 400 / 404 / 503 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(school());
    expect((await W(POST("/api/student-profile", { action: "setAvatar", avatarId: "zzz" }), studentDeps(ctx))).jsonBody).toEqual({ ok: false, error: "الأيقونة غير صالحة." });
    ctx.setJson("platform/users/s9.json", user("s9", "c1")); const missing = { ...studentDeps(ctx, "s9") }; ctx.container.getBlobClient("platform/users/s9.json").deleteIfExists();
    expect((await W(POST("/api/student-profile", { action: "setAvatar", avatarId: "a2" }), missing)).status).toBe(404);
    expect((await W(POST("/api/student-profile", { action: "setAvatar", avatarId: "a2" }), { ...studentDeps(ctx), mutateJsonWithRetry: async () => { throw new StorageConflictError("conflict"); } })).status).toBe(503);
    expect((await W(POST("/api/student-profile", { action: "setAvatar", avatarId: "a2" }), studentDeps(ctx, "s1", false))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0); assertSafeLogs();
  });
});

describe("achievement-feed (student)", () => {
  const W = obs.withObservability("achievement-feed", studentFeed);
  it("B GET parity", async () => { const r = await parity("achievement-feed", studentFeed, school, ctx => studentDeps(ctx), GET("/api/achievement-feed")); expect(r.jsonBody.posts).toHaveLength(1); });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/achievement-feed"), studentDeps(failDownload(createMemoryContainer(school()), "platform/feed/c1/a1_s1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحميل إنجازات الصف حاليًا." }); expectHeader(r); assertLoggedOnce("student.feed.error");
  });
  it("D 400 / 404 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(school());
    expect((await W(POST("/api/achievement-feed", { action: "react", postId: "a1_s1", reaction: "nope" }), studentDeps(ctx))).status).toBe(400);
    expect((await W(POST("/api/achievement-feed", { action: "react", postId: "ghost", reaction: "clap" }), studentDeps(ctx))).status).toBe(404);
    expect((await W(GET("/api/achievement-feed"), studentDeps(ctx, "s1", false))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0);
  });
});

describe("assignment-item-analysis", () => {
  const W = obs.withObservability("assignment-item-analysis", itemAnalysis);
  it("B parity", async () => { const r = await parity("assignment-item-analysis", itemAnalysis, school, teacherDeps, GET("/api/assignment-item-analysis?assignmentId=a1")); expect(r.jsonBody.studentsSubmitted).toBe(1); });
  it("C failure → generic 500 + one safe logError", async () => {
    const r = await W(GET("/api/assignment-item-analysis?assignmentId=a1"), teacherDeps(failDownload(createMemoryContainer(school()), "platform/submissions/a1/s1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحليل أسئلة الواجب حاليًا." }); expectHeader(r); assertLoggedOnce("assignment.itemAnalysis.error");
  });
  it("D 400 / 404 / 401 unchanged", async () => {
    const ctx = createMemoryContainer(school());
    expect((await W(GET("/api/assignment-item-analysis"), teacherDeps(ctx))).status).toBe(400);
    expect((await W(GET("/api/assignment-item-analysis?assignmentId=nope"), teacherDeps(ctx))).jsonBody).toEqual({ ok: false, error: "الواجب غير موجود." });
    expect((await W(GET("/api/assignment-item-analysis?assignmentId=a1"), teacherDeps(ctx, AUTH_NO))).status).toBe(401);
    expect(errorEvents()).toHaveLength(0);
  });
});

describe("E. student-dashboard — inner swallowed failure is now observable, exactly once", () => {
  const W = obs.withObservability("student-dashboard", studentDashboard);
  it("E1 injected submission-read failure → same generic 500, header, ONE student.dashboard.error, no wrapper double-log", async () => {
    const r = await W(GET("/api/student-dashboard"), studentDeps(failDownload(createMemoryContainer(school()), "platform/submissions/a1/s1.json")));
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تحميل لوحة الطالب حاليًا." }); expectHeader(r); assertLoggedOnce("student.dashboard.error");
  });
  it("E2 success path unchanged and logs no error", async () => {
    const r = await parity("student-dashboard", studentDashboard, school, ctx => studentDeps(ctx), GET("/api/student-dashboard")); expect(r.jsonBody.stats.assigned).toBe(1);
  });
});
