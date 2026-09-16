// Roadmap #33 — Legacy 794589 Convergence: shared GOLDEN fixtures. One realistic historical school (V2 snapshot with
// progress + 25 history events, an empty project, a V1 snapshot without progress, a V1 snapshot WITH meaningful
// progress, an archived class, a class whose 794589 enrollment was removed, a legacy-scalar class, and a two-project
// 899373/883589 class), one scenario list, and one runner that drives the REAL handlers of whatever checkout
// `loadHandlers(apiRoot)` points at over identical in-memory blobs and returns a fully NORMALIZED record
// (status, body, audit records, storage delta) per scenario.
//
// The golden file (r33-golden.json) was produced by this exact module against UNPATCHED main
// 656fa4e69b995c2590d4c93890db0029b2595083 under a fixed Date; the convergence test replays the same scenarios on
// the current code and demands equality. The only normalized values are the genuinely nondeterministic ones:
// UUIDs (progress history eventIds) and audit blob names (random suffix). Every timestamp is deterministic because
// callers fake Date (vi.useFakeTimers({ toFake: ["Date"], now: FIXED_NOW })).
const path = require("node:path");

const FIXED_NOW = "2026-09-20T10:00:00.000Z";
const CP = "platform/classes/", UP = "platform/users/", AUDIT = "platform/audit/";
const LEGACY_CONFIG = "platform/project-trackers/classes/", LEGACY_PROGRESS = "platform/project-progress/";

function loadHandlers(apiRoot) {
  const r = rel => require(path.join(apiRoot, rel));
  return {
    legacy: r("src/functions/project-794589.js").handler,
    generic: r("src/functions/project-tracker.js").handler,
    studentLegacy: r("src/functions/student-project.js").handler,
    studentGeneric: r("src/functions/student-project-tracker.js").handler,
    template: r("src/lib/project-794589-template.js"),
    registry: r("src/lib/project-tracker/registry.js"),
    service: r("src/lib/project-tracker/service.js"),
    memory: r("tests/fixtures/memory-container.js")
  };
}

const user = (userId, classId, over = {}) => ({ role: "student", userId, classId, displayName: "طالب " + userId, firstName: "ط", familyName: userId, code: "10000000" + userId.slice(-1), active: true, archived: false, authVersion: 1, ...over });
const cls = (classId, over = {}) => ({ classId, name: "صف " + classId, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: ["794589"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });

// A V1-era (pre-upgrade) 794589 snapshot with a DIFFERENT stage set, as production classes created before the
// template bump still carry.
function v1Snapshot(classId) {
  const mk = (stageId, track, groupId, title, order) => ({ stageId, track, groupId, title, order, weight: 1, required: true, active: true });
  return {
    schemaVersion: 1, programCode: "794589", classId, templateVersion: 1,
    trackWeights: { book: 60, packetTracer: 40 }, config: { staleDays: 5, lateThreshold: 3, balanceWarningThreshold: 20 },
    groups: [{ groupId: "gb", track: "book", title: "الكتاب", order: 1 }, { groupId: "gp", track: "packetTracer", title: "PT", order: 2 }],
    stages: [mk("B01", "book", "gb", "قديم ١", 1), mk("B02", "book", "gb", "قديم ٢", 2), mk("P01", "packetTracer", "gp", "PT قديم ١", 1), mk("P02", "packetTracer", "gp", "PT قديم ٢", 2)],
    createdAt: "2025-09-01T00:00:00.000Z", updatedAt: "2025-09-01T00:00:00.000Z"
  };
}
const progressDoc = (programCode, classId, studentId, stages, history = []) => ({ schemaVersion: 1, programCode, classId, studentId, startedAt: "2025-10-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z", stages, history });

function seedSchool(h) {
  const s = {};
  const nsL = h.registry.getStorageNamespace("794589"), nsA = h.registry.getStorageNamespace("899373"), nsB = h.registry.getStorageNamespace("883589");
  // c1: V2 snapshot + meaningful progress. s1 member (progress + 25 history), s2 disabled member, s3 ARCHIVED (has
  // stale progress), s4 foreign (class c9).
  s[CP + "c1.json"] = cls("c1", { studentIds: ["s1", "s2"] });
  s[nsL.configName("c1")] = h.template.buildClassSnapshotFromDefault("c1", "2026-01-05T00:00:00.000Z");
  s[UP + "s1.json"] = user("s1", "c1"); s[UP + "s2.json"] = user("s2", "c1", { active: false }); s[UP + "s3.json"] = user("s3", "c1", { archived: true, active: false }); s[UP + "s4.json"] = user("s4", "c9");
  const history = Array.from({ length: 25 }, (_, i) => ({ eventId: "hist-" + String(i).padStart(2, "0"), stageId: "B01", type: "status", fromStatus: "not_started", toStatus: "in_progress", actor: "teacher-0", createdAt: "2026-01-1" + (i % 9) + "T00:00:00.000Z" }));
  s[nsL.progressName("c1", "s1")] = progressDoc("794589", "c1", "s1", {
    B01: { status: "approved", approvedAt: "2026-01-20T00:00:00.000Z", approvedBy: "teacher-0", updatedAt: "2026-01-20T00:00:00.000Z" },
    B02: { status: "ready_for_review", note: "ملاحظة", updatedAt: "2026-02-01T00:00:00.000Z" },
    P01: { status: "in_progress", updatedAt: "2026-02-01T00:00:00.000Z" }
  }, history);
  s[nsL.progressName("c1", "s3")] = progressDoc("794589", "c1", "s3", { B01: { status: "approved", approvedAt: "2026-01-10T00:00:00.000Z" } });
  // c2: EMPTY active project (no snapshot, no progress); s5 member.
  s[CP + "c2.json"] = cls("c2", { studentIds: ["s5"] }); s[UP + "s5.json"] = user("s5", "c2");
  // c3: V1 snapshot, NO meaningful progress → auto-upgrade candidate; s6 member.
  s[CP + "c3.json"] = cls("c3", { studentIds: ["s6"] }); s[nsL.configName("c3")] = v1Snapshot("c3"); s[UP + "s6.json"] = user("s6", "c3");
  s[nsL.progressName("c3", "s6")] = progressDoc("794589", "c3", "s6", { B01: { status: "not_started" } });
  // c4: V1 snapshot WITH meaningful progress → must never be touched; s7 member.
  s[CP + "c4.json"] = cls("c4", { studentIds: ["s7"] }); s[nsL.configName("c4")] = v1Snapshot("c4"); s[UP + "s7.json"] = user("s7", "c4");
  s[nsL.progressName("c4", "s7")] = progressDoc("794589", "c4", "s7", { B01: { status: "approved", approvedAt: "2025-11-01T00:00:00.000Z" }, P01: { status: "ready_for_review" } });
  // cA: ARCHIVED class, V1 snapshot + progress; s8 member.
  s[CP + "cA.json"] = cls("cA", { active: false, status: "archived", archivedAt: "2026-06-01T00:00:00.000Z", studentIds: ["s8"] }); s[nsL.configName("cA")] = v1Snapshot("cA"); s[UP + "s8.json"] = user("s8", "cA");
  s[nsL.progressName("cA", "s8")] = progressDoc("794589", "cA", "s8", { B01: { status: "approved", approvedAt: "2025-11-01T00:00:00.000Z" } });
  // cN: 794589 enrollment REMOVED (now 899373 only) but leftover 794589 blobs; s9 member.
  s[CP + "cN.json"] = cls("cN", { programCodes: ["899373"], studentIds: ["s9"] }); s[nsL.configName("cN")] = v1Snapshot("cN"); s[UP + "s9.json"] = user("s9", "cN");
  // cL: legacy scalar programCode only, no snapshot; s10 member.
  const cL = cls("cL", { studentIds: ["s10"] }); delete cL.programCodes; cL.programCode = "794589"; s[CP + "cL.json"] = cL; s[UP + "s10.json"] = user("s10", "cL");
  // g1: generic two-project class (899373 + 883589) with snapshots and progress; s11 member.
  s[CP + "g1.json"] = cls("g1", { programCodes: ["899373", "883589"], studentIds: ["s11"] }); s[UP + "s11.json"] = user("s11", "g1");
  s[nsA.configName("g1")] = h.service.buildClassSnapshot(h.registry.getProjectDefinition("899373"), "g1", "2026-02-01T00:00:00.000Z");
  s[nsB.configName("g1")] = h.service.buildClassSnapshot(h.registry.getProjectDefinition("883589"), "g1", "2026-02-01T00:00:00.000Z");
  s[nsA.progressName("g1", "s11")] = progressDoc("899373", "g1", "s11", { B01: { status: "approved", approvedAt: "2026-03-01T00:00:00.000Z" }, A01: { status: "ready_for_review" } });
  s[nsB.progressName("g1", "s11")] = progressDoc("883589", "g1", "s11", { V01: { status: "in_progress" } });
  return s;
}

// ---- scenarios -------------------------------------------------------------------------------------------------
const L = "/api/project-794589", G = "/api/project-tracker";
const t = (id, route, method, url, body, extra = {}) => ({ id, route, method, url, body, ...extra });
const teacherPairs = [
  // [suffix, resource-or-action, query params / body, extra]
  ["classes", "GET", { resource: "classes" }],
  ["template.c1", "GET", { resource: "template", classId: "c1" }],
  ["template.c2.lazyCreate", "GET", { resource: "template", classId: "c2" }],
  ["template.c3.v1NoProgress", "GET", { resource: "template", classId: "c3" }],
  ["template.c4.v1Progress", "GET", { resource: "template", classId: "c4" }],
  ["template.cA.archived", "GET", { resource: "template", classId: "cA" }],
  ["template.cN.notEnrolled", "GET", { resource: "template", classId: "cN" }],
  ["template.cL.legacyScalar", "GET", { resource: "template", classId: "cL" }],
  ["template.missingClass", "GET", { resource: "template", classId: "nope" }],
  ["template.noClassId", "GET", { resource: "template" }],
  ["unknownResource", "GET", { resource: "zzz", classId: "c1" }],
  ["student.c1.s1", "GET", { resource: "student", classId: "c1", studentId: "s1" }],
  ["student.c1.s2.disabled", "GET", { resource: "student", classId: "c1", studentId: "s2" }],
  ["student.c1.s3.archived", "GET", { resource: "student", classId: "c1", studentId: "s3" }],
  ["student.c1.s4.foreign", "GET", { resource: "student", classId: "c1", studentId: "s4" }],
  ["student.c1.ghost", "GET", { resource: "student", classId: "c1", studentId: "ghost" }],
  ["student.c4.s7.v1", "GET", { resource: "student", classId: "c4", studentId: "s7" }],
  ["student.noId", "GET", { resource: "student", classId: "c1" }],
  ["summary.c1", "GET", { resource: "summary", classId: "c1" }],
  ["summary.cA.archived", "GET", { resource: "summary", classId: "cA" }],
  ["students.c1", "GET", { resource: "students", classId: "c1" }],
  ["analytics.c1", "GET", { resource: "analytics", classId: "c1" }],
  ["activate.c2", "POST", { action: "program.activate", classId: "c2" }],
  ["activate.cA.archived", "POST", { action: "program.activate", classId: "cA" }],
  ["update.approve", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", status: "approved" }],
  ["update.status", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", status: "in_progress" }],
  ["update.noteOnly", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", note: "n2" }],
  ["update.noChange", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B02", status: "ready_for_review" }],
  ["update.invalidStatus", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", status: "bogus" }],
  ["update.foreign", "POST", { action: "progress.update", classId: "c1", studentId: "s4", stageId: "B03", status: "approved" }],
  ["update.archivedStudent", "POST", { action: "progress.update", classId: "c1", studentId: "s3", stageId: "B03", status: "approved" }],
  ["update.ghost", "POST", { action: "progress.update", classId: "c1", studentId: "ghost", stageId: "B03", status: "approved" }],
  ["update.badStage", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "NOPE", status: "approved" }],
  ["update.archivedClass", "POST", { action: "progress.update", classId: "cA", studentId: "s8", stageId: "B01", status: "approved" }],
  ["update.notEnrolled", "POST", { action: "progress.update", classId: "cN", studentId: "s9", stageId: "B01", status: "approved" }],
  ["update.missingIds", "POST", { action: "progress.update", classId: "c1", studentId: "s1" }],
  ["update.conflict", "POST", { action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", status: "approved" }, { conflictOn: LEGACY_PROGRESS + "c1/s1.json" }],
  ["update.lazyCreateEmptyClass", "POST", { action: "progress.update", classId: "c2", studentId: "s5", stageId: "B01", status: "in_progress" }],
  ["reset.c1", "POST", { action: "project.reset", classId: "c1" }],
  ["reset.c2.empty", "POST", { action: "project.reset", classId: "c2" }],
  ["reset.cA.archived", "POST", { action: "project.reset", classId: "cA" }],
  ["reset.cN.notEnrolled", "POST", { action: "project.reset", classId: "cN" }],
  ["templateUpdate.c1", "POST", { action: "template.update", classId: "c1", template: { config: { staleDays: 9 } } }],
  ["templateUpdate.c2.lazyCreate", "POST", { action: "template.update", classId: "c2", template: { trackWeights: { book: 70, packetTracer: 30 } } }],
  ["templateUpdate.conflict", "POST", { action: "template.update", classId: "c1", template: { config: { staleDays: 9 } } }, { conflictOn: LEGACY_CONFIG + "c1.json" }],
  ["unknownAction", "POST", { action: "zzz", classId: "c1" }],
  ["post.noClassId", "POST", { action: "program.activate" }],
  ["post.missingClass", "POST", { action: "program.activate", classId: "nope" }]
];
function qs(params) { return Object.entries(params).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&"); }
const SCENARIOS = [];
for (const [suffix, method, p, extra] of teacherPairs) {
  if (method === "GET") {
    SCENARIOS.push(t("L." + suffix, "legacy", "GET", L + "?" + qs(p), undefined, extra));
    SCENARIOS.push(t("G794589." + suffix, "generic", "GET", G + "?" + qs({ projectCode: "794589", ...p }), undefined, extra));
  } else {
    SCENARIOS.push(t("L." + suffix, "legacy", "POST", L, p, extra));
    SCENARIOS.push(t("G794589." + suffix, "generic", "POST", G, { projectCode: "794589", ...p }, extra));
  }
}
// Generic-only regression for the other projects (must be untouched by R33).
const gen = (id, method, p) => SCENARIOS.push(method === "GET" ? t(id, "generic", "GET", G + "?" + qs(p)) : t(id, "generic", "POST", G, p));
gen("G899373.classes", "GET", { projectCode: "899373", resource: "classes" });
gen("G899373.template.g1", "GET", { projectCode: "899373", resource: "template", classId: "g1" });
gen("G899373.student.g1.s11", "GET", { projectCode: "899373", resource: "student", classId: "g1", studentId: "s11" });
gen("G899373.summary.g1", "GET", { projectCode: "899373", resource: "summary", classId: "g1" });
gen("G899373.students.g1", "GET", { projectCode: "899373", resource: "students", classId: "g1" });
gen("G899373.analytics.g1", "GET", { projectCode: "899373", resource: "analytics", classId: "g1" });
gen("G899373.template.c1.notEnrolled", "GET", { projectCode: "899373", resource: "template", classId: "c1" });
gen("G899373.template.cN.enrolled", "GET", { projectCode: "899373", resource: "template", classId: "cN" });
gen("G899373.update.approve", "POST", { projectCode: "899373", action: "progress.update", classId: "g1", studentId: "s11", stageId: "A01", status: "approved" });
gen("G899373.update.foreign", "POST", { projectCode: "899373", action: "progress.update", classId: "g1", studentId: "s1", stageId: "A01", status: "approved" });
gen("G899373.reset.g1", "POST", { projectCode: "899373", action: "project.reset", classId: "g1" });
gen("G899373.templateUpdate.g1", "POST", { projectCode: "899373", action: "template.update", classId: "g1", template: { config: { staleDays: 3 } } });
gen("G883589.template.g1", "GET", { projectCode: "883589", resource: "template", classId: "g1" });
gen("G883589.student.g1.s11", "GET", { projectCode: "883589", resource: "student", classId: "g1", studentId: "s11" });
gen("G883589.update.status", "POST", { projectCode: "883589", action: "progress.update", classId: "g1", studentId: "s11", stageId: "V01", status: "ready_for_review" });
gen("G883589.reset.g1", "POST", { projectCode: "883589", action: "project.reset", classId: "g1" });
gen("G.projects", "GET", { resource: "projects" });
gen("G.projectsSummary", "GET", { resource: "projects-summary" });
gen("G.unsupportedProject", "GET", { projectCode: "000000", resource: "classes" });
gen("G.noProjectCode", "GET", { resource: "classes" });
// Student routes (identical seeds; the session helper is mocked identically for both — its own gates are shared).
for (const sid of ["s1", "s2", "s3", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "nobody"]) {
  SCENARIOS.push(t("SL." + sid, "studentLegacy", "GET", "/api/student-project", undefined, { studentId: sid }));
  SCENARIOS.push(t("SG." + sid, "studentGeneric", "GET", "/api/student-project-tracker", undefined, { studentId: sid }));
}

// ---- runner ----------------------------------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") { const out = {}; for (const k of Object.keys(value)) out[k] = normalize(value[k]); return out; }
  if (typeof value === "string" && UUID_RE.test(value)) return "<UUID>";
  return value === undefined ? null : value;
}
function conflictHook(name) {
  // Every CAS write to `name` observes a changed ETag → the real retry loop exhausts → StorageConflictError.
  return { beforeConditionalUpload: (blob, api) => { if (blob === name) api.setJson(blob, api.getJson(blob)); } };
}
function storeSnapshot(ctx) {
  const out = {};
  for (const name of ctx.names()) { if (name.startsWith(AUDIT)) continue; out[name] = JSON.stringify(normalize(ctx.getJson(name))); }
  return out;
}
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };

async function runScenario(h, sc) {
  const ctx = h.memory.createMemoryContainer(seedSchool(h), sc.conflictOn ? conflictHook(sc.conflictOn) : {});
  const before = storeSnapshot(ctx);
  const audits = [];
  const req = { method: sc.method, url: "https://x" + sc.url, json: async () => sc.body || {} };
  let res;
  if (sc.route === "legacy" || sc.route === "generic") {
    const deps = { ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
    res = await (sc.route === "legacy" ? h.legacy : h.generic)(req, deps);
  } else {
    const student = ctx.getJson(UP + sc.studentId + ".json");
    const deps = { requireActiveStudentSession: async () => student ? { ok: true, user: { sub: sc.studentId }, student, container: ctx.container } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "الجلسة غير صالحة." } } } };
    res = await (sc.route === "studentLegacy" ? h.studentLegacy : h.studentGeneric)(req, deps);
  }
  const after = storeSnapshot(ctx);
  const added = Object.keys(after).filter(n => !(n in before)).sort();
  const removed = Object.keys(before).filter(n => !(n in after)).sort();
  const changed = Object.keys(after).filter(n => n in before && before[n] !== after[n]).sort();
  const docs = {};
  for (const n of [...added, ...changed]) docs[n] = JSON.parse(after[n]);
  const systemAudits = ctx.names().filter(n => n.startsWith(AUDIT)).map(n => normalize(ctx.getJson(n))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { status: res.status, body: normalize(res.jsonBody), audits: normalize(audits), storage: { added, removed, changed, docs }, systemAudits };
}

async function runAll(h) {
  const out = {};
  for (const sc of SCENARIOS) out[sc.id] = await runScenario(h, sc);
  return out;
}

module.exports = { FIXED_NOW, LEGACY_CONFIG, LEGACY_PROGRESS, CP, UP, AUDIT, SCENARIOS, loadHandlers, seedSchool, runScenario, runAll, normalize };
