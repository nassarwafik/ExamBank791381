import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { school, user, instrument, NOW } from "./fixtures/analytics-school.js";
import { handler as todayHandler } from "../src/functions/teacher-today.js";
import { ATTENTION_CAP, attentionTargets, deriveProjectEvaluationAttention, loadProjectEvaluationSources } from "../src/lib/project-tracker/evaluation-attention.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";

// Phase 9C — Teacher Project Evaluation Attention: the additive `projectEvaluation` block of GET /api/teacher-today.
// Students of ACTIVE classes enrolled in a project who still have ungraded ACTIVE stages (Phase 9B evaluation
// semantics through buildProjectEvaluation — 0 is a grade, approval irrelevant, orphans ignored, no document = all
// ungraded), deterministic ordering, a display cap that never hides the counters, membership / enrollment scope,
// bounded reads (one snapshot + one progress listing per class × project, never per student), and additivity.

const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const AUTH_NONE = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const NOW_MS = Date.parse(NOW);
const req = (url = "https://x/api/teacher-today") => ({ method: "GET", url, headers: { get: () => null } });
const deps = (ctx, extra = {}) => ({ ...AUTH_OK, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), container: ctx.container, nowMs: NOW_MS, ...extra });
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589"), L: getStorageNamespace("794589") };
const ACTIVE = code => getProjectDefinition(code).stages.filter(s => s.active === true);
const activeIds = code => ACTIVE(code).map(s => s.stageId);
const doc = (code, cid, sid, scores, extra = {}) => ({ schemaVersion: 1, programCode: code, classId: cid, studentId: sid, stages: Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, { status: "in_progress", ...(v === undefined ? {} : { score: v }), updatedAt: NOW }])), history: [], updatedAt: NOW, ...extra });
/** All active stages of a project scored 100 for one student (the "fully graded" case). */
const allGraded = (code, cid, sid) => doc(code, cid, sid, Object.fromEntries(activeIds(code).map(id => [id, 100])));

/** The shared analytics school + project enrollment: c1 (active) runs 899373 + 883589, c2 (active) runs 794589, c3 (archived) runs 899373. */
function seed() {
  const s = school();
  s["platform/classes/c1.json"].programCodes = ["899373", "883589"];
  s["platform/classes/c2.json"].programCodes = ["794589"];
  s["platform/classes/c3.json"].programCodes = ["899373"];
  return s;
}
const pe = async (ctx, extra) => (await todayHandler(req(), deps(ctx, extra))).jsonBody.projectEvaluation;
const TOTAL_A = ACTIVE("899373").length, TOTAL_B = ACTIVE("883589").length, TOTAL_L = ACTIVE("794589").length;

describe("9C-B semantics — who needs evaluation", () => {
  it("H1 a member with NO progress document → every active stage ungraded (evaluationProgress 0, graded 0)", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await pe(ctx);
    const row = r.attention.find(x => x.studentId === "s01" && x.projectCode === "899373");
    expect(row).toMatchObject({ displayName: "طالب s01", classId: "c1", className: "صف 1", projectTitle: getProjectDefinition("899373").title, gradedStages: 0, totalStages: TOTAL_A, ungradedStages: TOTAL_A, evaluationProgress: 0 });
  });
  it("H2 a stage scored 0 IS graded (never counted as ungraded); H3 mixed stages count exactly the ungraded ones", async () => {
    const s = seed();
    s[NS.A.progressName("c1", "s01")] = doc("899373", "c1", "s01", { B01: 0, B02: 85, B03: undefined });
    const ctx = createMemoryContainer(s);
    const row = (await pe(ctx)).attention.find(x => x.studentId === "s01" && x.projectCode === "899373");
    expect(row).toMatchObject({ gradedStages: 2, ungradedStages: TOTAL_A - 2, totalStages: TOTAL_A, evaluationProgress: Math.round((2 / TOTAL_A) * 100) });
  });
  it("H4 every active stage graded → the student/project pair is NOT in attention and not counted", async () => {
    const s = seed();
    s[NS.A.progressName("c1", "s01")] = allGraded("899373", "c1", "s01");
    s[NS.B.progressName("c1", "s01")] = allGraded("883589", "c1", "s01");
    const ctx = createMemoryContainer(s);
    const r = await pe(ctx);
    expect(r.attention.some(x => x.studentId === "s01")).toBe(false);
    // c1 members s01 s02 s03 s04 (s05 archived): s01 fully graded in both → 3 students × 2 projects; c2: s11 s12 × 794589
    expect(r.studentsWithUngradedStages).toBe(5);
    expect(r.totalUngradedStages).toBe(3 * (TOTAL_A + TOTAL_B) + 2 * TOTAL_L);
    expect(r.projects.find(p => p.projectCode === "899373")).toMatchObject({ studentsWithUngradedStages: 3, totalUngradedStages: 3 * TOTAL_A });
  });
  it("H5 an inactive snapshot stage is neither total nor ungraded; a score on it is an orphan and ignored (H6)", async () => {
    const s = seed();
    const cfg = { ...getProjectDefinition("899373"), classId: "c1", createdAt: NOW, updatedAt: NOW };
    cfg.stages = cfg.stages.map(st => (st.stageId === "B02" ? { ...st, active: false } : st));
    s[NS.A.configName("c1")] = cfg;
    s[NS.A.progressName("c1", "s01")] = doc("899373", "c1", "s01", { B02: 90, GONE: 50, B01: 70 });   // B02 inactive + GONE unknown → orphans
    const ctx = createMemoryContainer(s);
    const row = (await pe(ctx)).attention.find(x => x.studentId === "s01" && x.projectCode === "899373");
    expect(row).toMatchObject({ totalStages: TOTAL_A - 1, gradedStages: 1, ungradedStages: TOTAL_A - 2 });
  });
  it("H7 several projects for the same student → one row per project, the student counted ONCE in the total, per-project counts separate", async () => {
    const s = seed();
    s["platform/classes/c1.json"].studentIds = ["s01"];
    for (const sid of ["s02", "s03", "s04", "s05"]) delete s["platform/users/" + sid + ".json"];
    s["platform/classes/c2.json"].programCodes = [];
    s[NS.A.progressName("c1", "s01")] = doc("899373", "c1", "s01", { B01: 10 });
    const ctx = createMemoryContainer(s);
    const r = await pe(ctx);
    expect(r.attention.map(x => [x.studentId, x.projectCode, x.ungradedStages])).toEqual([["s01", "883589", TOTAL_B], ["s01", "899373", TOTAL_A - 1]].sort((a, b) => b[2] - a[2] || (a[1] < b[1] ? -1 : 1)));
    expect(r.studentsWithUngradedStages).toBe(1);
    expect(r.totalUngradedStages).toBe(TOTAL_A - 1 + TOTAL_B);
    expect(r.projects.map(p => [p.projectCode, p.studentsWithUngradedStages, p.totalUngradedStages])).toEqual([["883589", 1, TOTAL_B], ["899373", 1, TOTAL_A - 1]]);
  });
  it("H8 several students: each current member of each enrolled class appears; H9 a project the class is NOT enrolled in never appears even if a stale document exists", async () => {
    const s = seed();
    s[NS.L.progressName("c1", "s01")] = doc("794589", "c1", "s01", {});                                // stale 794589 data of c1 (not enrolled)
    const ctx = createMemoryContainer(s);
    const r = await pe(ctx);
    const pairs = r.attention.map(x => x.studentId + ":" + x.projectCode).sort();
    expect(pairs).toEqual(["s01:883589", "s01:899373", "s02:883589", "s02:899373", "s03:883589", "s03:899373", "s04:883589", "s04:899373", "s11:794589", "s12:794589"]);
    expect(r.attention.some(x => x.studentId === "s01" && x.projectCode === "794589")).toBe(false);
    expect(r.projects.map(p => p.projectCode)).toEqual(["794589", "883589", "899373"]);
  });
  it("H10 foreign / archived students and archived classes are out of scope (canonical membership); a login-disabled member stays in", async () => {
    const s = seed();
    s["platform/users/sX.json"] = user("sX", "cX");                                                    // class does not exist
    const ctx = createMemoryContainer(s);
    const r = await pe(ctx);
    const ids = new Set(r.attention.map(x => x.studentId));
    expect(ids.has("s05")).toBe(false);                                                                  // archived student
    expect(ids.has("s21")).toBe(false);                                                                  // member of the archived class c3
    expect(ids.has("sX")).toBe(false); expect(ids.has("teacher")).toBe(false);
    expect(ids.has("s03")).toBe(true);                                                                   // active:false but not archived → member
    expect(JSON.stringify(r)).not.toContain("c3");
  });
});

describe("9C-G/C ordering and display cap", () => {
  it("H11 deterministic order: ungradedStages DESC → evaluationProgress ASC → displayName → studentId → projectCode; same inputs → same output", () => {
    const users = [user("s2", "c1", { displayName: "ياسر" }), user("s1", "c1", { displayName: "أحمد" }), user("s3", "c1", { displayName: "أحمد" }), user("s4", "c1", { displayName: "سارة" })];
    const snapshot = { ...getProjectDefinition("899373"), classId: "c1" };
    const src = (code, docs) => ({ classId: "c1", className: "صف 1", projectCode: code, snapshot: { ...snapshot, projectCode: code }, progressDocs: docs });
    const ids = activeIds("899373");
    const sources = [src("899373", [
      doc("899373", "c1", "s1", { [ids[0]]: 50 }),                                                       // 1 graded
      doc("899373", "c1", "s3", { [ids[0]]: 50 }),                                                       // 1 graded, same name as s1 → studentId tie-break
      doc("899373", "c1", "s2", Object.fromEntries(ids.slice(0, 3).map(id => [id, 0]))),                 // 3 graded (zeros count)
      doc("899373", "c1", "s4", {})                                                                       // 0 graded → most ungraded
    ])];
    const a = deriveProjectEvaluationAttention({ users, sources }), b = deriveProjectEvaluationAttention({ users: users.slice().reverse(), sources });
    expect(a.attention.map(x => x.studentId)).toEqual(["s4", "s1", "s3", "s2"]);
    expect(a).toEqual(b);
    // an equal ungraded count with a different total → lower evaluationProgress first
    const t2 = { ...snapshot, stages: snapshot.stages.map((st, i) => (i < 5 ? st : { ...st, active: false })) };  // 5 active stages
    // p (class c1, 5 active stages, 1 graded → 4 ungraded, 20%) vs q (class c2, 6 active stages, 2 graded → 4 ungraded, 33%):
    // q's name sorts first, but the lower evaluationProgress wins the tie on ungradedStages.
    const r = deriveProjectEvaluationAttention({ users: [user("p", "c1", { displayName: "ب" }), user("q", "c2", { displayName: "أ" })], sources: [
      { classId: "c1", className: "", projectCode: "899373", snapshot: t2, progressDocs: [doc("899373", "c1", "p", { [ids[0]]: 1 })] },
      { classId: "c2", className: "", projectCode: "883589", snapshot: { ...getProjectDefinition("883589"), classId: "c2", stages: getProjectDefinition("883589").stages.map((st, i) => (i < 6 ? st : { ...st, active: false })) }, progressDocs: [doc("883589", "c2", "q", { [activeIds("883589")[0]]: 1, [activeIds("883589")[1]]: 1 })] }
    ] });
    expect(r.attention.map(x => [x.studentId, x.ungradedStages, x.evaluationProgress])).toEqual([["p", 4, 20], ["q", 4, 33]]);
  });
  it("H12 the display cap (" + ATTENTION_CAP + ") trims ONLY `attention`; every counter is complete and `capped` / `attentionTotal` say so", async () => {
    const s = seed();
    for (let i = 1; i <= 30; i++) { const sid = "m" + String(i).padStart(2, "0"); s["platform/users/" + sid + ".json"] = user(sid, "c1"); }
    const ctx = createMemoryContainer(s);
    const r = await pe(ctx);
    // c1: 34 members × 2 projects + c2: 2 × 1 = 70 rows
    expect(r.attention.length).toBe(ATTENTION_CAP);
    expect(r.attentionTotal).toBe(70); expect(r.capped).toBe(true);
    expect(r.studentsWithUngradedStages).toBe(36);
    expect(r.totalUngradedStages).toBe(34 * (TOTAL_A + TOTAL_B) + 2 * TOTAL_L);
    expect(r.projects.find(p => p.projectCode === "899373").studentsWithUngradedStages).toBe(34);
    const small = deriveProjectEvaluationAttention({ users: [user("a", "c1")], sources: [{ classId: "c1", className: "", projectCode: "899373", snapshot: getProjectDefinition("899373"), progressDocs: [] }], cap: 0 });
    expect(small).toMatchObject({ attention: [], attentionTotal: 1, capped: true, studentsWithUngradedStages: 1 });
  });
});

describe("9C-C reads — bounded, never per student, never a container scan", () => {
  it("H-reads: exactly ONE snapshot download + ONE progress-folder listing per active class × enrolled project; no per-student reads; archived class untouched", async () => {
    const s = seed();
    s[NS.A.configName("c1")] = { ...getProjectDefinition("899373"), classId: "c1", createdAt: NOW, updatedAt: NOW };
    s[NS.A.progressName("c1", "s01")] = doc("899373", "c1", "s01", { B01: 5 });
    s[NS.A.progressName("c1", "s02")] = doc("899373", "c1", "s02", { B01: 5 });
    s[NS.A.progressName("c3", "s21")] = doc("899373", "c3", "s21", {});
    const ctx = createMemoryContainer(s);
    await todayHandler(req(), deps(ctx));   // Phase 12E-B: the first Today read bootstraps the assignment index (its only write)
    const st = instrument(ctx);
    const r = await todayHandler(req(), deps(ctx));
    expect(r.status).toBe(200);
    const projectLists = st.lists.filter(p => p.startsWith("platform/project-progress/") || p.startsWith("platform/project-trackers/"));
    expect(projectLists.sort()).toEqual([NS.L.progressPrefix("c2"), NS.B.progressPrefix("c1"), NS.A.progressPrefix("c1")].sort());   // 3 pairs → 3 listings
    const configReads = st.downloads.filter(n => n.startsWith("platform/project-trackers/"));
    expect(configReads.sort()).toEqual([NS.A.configName("c1"), NS.B.configName("c1"), NS.L.configName("c2")].sort());              // 3 pairs → 3 snapshot reads (missing ones are one 404 each, no write)
    const progressReads = st.downloads.filter(n => n.startsWith("platform/project-progress/"));
    expect(progressReads.sort()).toEqual([NS.A.progressName("c1", "s01"), NS.A.progressName("c1", "s02")]);                        // only the documents that exist under the listed folders
    expect(st.downloads.some(n => n.includes("/c3/"))).toBe(false);
    expect(st.uploads).toBe(0);                                                                                                       // a missing snapshot is never persisted from this read path
    expect(attentionTargets(Object.values(s).filter(d => d && d.classId && d.name)).map(t => t.classId + ":" + t.projectCode).sort()).toEqual(["c1:883589", "c1:899373", "c2:794589"]);
  });
  it("H-reads2: the sources loader is called once with the classes already listed; the derivation is pure over them (no frontend N+1 needed)", async () => {
    const ctx = createMemoryContainer(seed());
    let calls = 0, seenClasses = null;
    const r = await todayHandler(req(), deps(ctx, { loadProjectEvaluationSources: async (container, classes, d) => { calls += 1; seenClasses = classes.map(c => c.classId).sort(); return loadProjectEvaluationSources(container, classes, d); } }));
    expect(calls).toBe(1);
    expect(seenClasses).toEqual(["c1", "c2", "c3"]);
    expect(r.jsonBody.projectEvaluation.attention.length).toBeGreaterThan(0);
  });
});

describe("9C-F/K robustness, additivity, authorization", () => {
  it("H13 legacy / malformed progress documents never crash: string scores, null stages, a document without studentId, a snapshot without stages (skipped + reported)", async () => {
    const s = seed();
    s[NS.A.progressName("c1", "s01")] = { programCode: "899373", classId: "c1", studentId: "s01", stages: { B01: { status: "approved", score: "abc" }, B02: null, B03: { status: "approved", score: 0 } } };
    s[NS.A.progressName("c1", "orphan")] = { stages: { B01: { score: 50 } } };                          // no studentId → ignored
    s[NS.B.configName("c1")] = { projectCode: "883589", classId: "c1" };                                 // malformed snapshot: no stages
    const ctx = createMemoryContainer(s);
    const r = await todayHandler(req(), deps(ctx));
    expect(r.status).toBe(200);
    const p = r.jsonBody.projectEvaluation;
    expect(p.attention.find(x => x.studentId === "s01" && x.projectCode === "899373")).toMatchObject({ gradedStages: 1, ungradedStages: TOTAL_A - 1 });   // only the 0 counts
    expect(p.attention.some(x => x.projectCode === "883589")).toBe(false);
    expect(p.skipped).toEqual([{ classId: "c1", projectCode: "883589", reason: "invalid_snapshot" }]);
    expect(r.jsonBody.partial).toEqual([]);
  });
  it("H14 additive: the Phase 9A body is unchanged apart from the new block; a project-storage failure degrades ONLY that block (null + partial)", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), deps(ctx));
    expect(Object.keys(r.jsonBody).sort()).toEqual(["attention", "generatedAt", "ok", "partial", "projectEvaluation", "recent", "scope"]);
    expect(Object.keys(r.jsonBody.attention).sort()).toEqual(["activeAttempts", "notStarted", "pendingReview", "unreadMessages"]);
    expect(Object.keys(r.jsonBody.projectEvaluation).sort()).toEqual(["attention", "attentionTotal", "capped", "projects", "skipped", "studentsWithUngradedStages", "totalUngradedStages"]);
    const failing = await todayHandler(req(), deps(ctx, { loadProjectEvaluationSources: async () => { throw new Error("storage down"); } }));
    expect(failing.status).toBe(200);
    expect(failing.jsonBody.projectEvaluation).toBeNull();
    expect(failing.jsonBody.partial).toEqual(["projectEvaluation"]);
    expect(failing.jsonBody.attention.activeAttempts).toEqual(r.jsonBody.attention.activeAttempts);
    // a platform with no project enrollment at all → an explicit zero block, never null
    const s = seed(); for (const c of ["c1", "c2", "c3"]) s["platform/classes/" + c + ".json"].programCodes = [];
    const none = await todayHandler(req(), deps(createMemoryContainer(s)));
    expect(none.jsonBody.projectEvaluation).toEqual({ studentsWithUngradedStages: 0, totalUngradedStages: 0, projects: [], attentionTotal: 0, capped: false, attention: [], skipped: [] });
  });
  it("H-auth: unauthenticated → 401 and no project read; query parameters cannot widen the scope (classId / studentId in the URL are ignored)", async () => {
    const ctx = createMemoryContainer(seed());
    const st = instrument(ctx);
    const denied = await todayHandler(req(), { ...AUTH_NONE, container: ctx.container, nowMs: NOW_MS });
    expect(denied.status).toBe(401); expect(st.lists.length).toBe(0); expect(st.downloads.length).toBe(0);
    const a = await todayHandler(req(), deps(ctx));
    const b = await todayHandler(req("https://x/api/teacher-today?classId=c3&studentId=s21&projectCode=794589"), deps(ctx));
    expect(b.jsonBody.projectEvaluation).toEqual(a.jsonBody.projectEvaluation);
    expect(JSON.stringify(b.jsonBody.projectEvaluation)).not.toContain("s21");
  });
});
