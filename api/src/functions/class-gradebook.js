// Class gradebook GB2 (docs/enterprise-class-gradebook-gb.md §4.1, §4.5) — «سجل العلامات الصفي», teacher only.
//
//   GET  /api/class-gradebook?classId=…                    the scheme, the columns, the rows (computed by lib/gradebook/compute.js)
//   GET  /api/class-gradebook?classId=…&resource=sources   the class's assignments and projects a scheme may pick
//   GET  /api/class-gradebook?classId=…&resource=copy-classes          GB8: this teacher's other classes that have a scheme
//   GET  /api/class-gradebook?classId=…&resource=copy&from=<classId>   GB8: that class's scheme proposed for this class (nothing saved)
//   POST { action: "scheme.save",  classId, etag, scheme }  validate and save the scheme (If-Match: a stale etag is 409)
//   POST { action: "entries.save", classId, items }         manual marks and the teacher's excused / zero decisions (stale guard per cell)
//   POST { action: "part.approve",  classId, categoryId, schemeRevision }   GB6: approve one complete part (frozen snapshot, locked)
//   POST { action: "part.reopen",   classId, categoryId, reason }           GB6: reopen an approved part (explicit, with a reason, audited)
//   POST { action: "final.approve", classId, schemeRevision }               GB6: approve the final mark (every part approved and unchanged)
//   POST { action: "final.reopen",  classId, reason }                       GB6: reopen the final mark
//
// Authority (AGENTS.md §10): the teacher's session and tenancy (another teacher's class is reported as missing); the capability of each
// action (owner decision O1, 2026-11-18: the assignment capabilities — reading needs assignments.assignment.view, writing
// assignments.grading.grade); project columns only for a session that also holds projects.tracker.view (otherwise withheld, never
// read); an archived class is read-only; a storage error is a 503, never an empty gradebook. The output is marks and states only: no
// answer key, no per-question grade, no code or password.
//
// GB6 (owner decisions 2026-11-18): approving and reopening need assignments.results.release; an approved part's columns, weights and
// cells are locked (scheme.save / entries.save refuse them), the approved final locks the whole scheme; reopening comes before any
// change. A part is approved only when complete and released (lib/gradebook/approval.js); students read the frozen snapshot through
// /api/student-gradebook, never a live value.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { sessionGrants } = require("../lib/access/session-grants");
const storage = require("../lib/platform-storage");
const { loadDocs, loadEntries, listEntries } = require("../lib/classes-students-read-cache");
const { tenantOf, canAccessDocument } = require("../lib/teacher-tenancy");
const { isStudentInClass } = require("../lib/class-membership");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isReportableAssessment } = require("../lib/assignment-lifecycle");
const { isSafeId, cleanText } = require("../lib/roster-input");
const { recordAuditEvent } = require("../lib/audit-log");
const { getSupportedClassProgramCodes, classHasProject } = require("../lib/project-tracker/class-programs");
const { isSupportedProject, getProjectMeta } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const { validateScheme } = require("../lib/gradebook/scheme");
const { proposeCopy } = require("../lib/gradebook/copy");
const { listClassSources } = require("../lib/gradebook/class-sources");
const { assignmentEvidence, MISSING_SOURCE, UNCLASSIFIED } = require("../lib/gradebook/evidence");
const { projectEvidenceFromProgress } = require("../lib/gradebook/project-source");
const { computeGradebook, roundForDisplay, DECISIONS } = require("../lib/gradebook/compute");
const {
  readApprovals, normalizeReason, lockedItems, sameStructure, partReadiness, partSnapshot, partDrift, finalReadiness,
  finalSnapshot, finalDrift, withHistory, REASON_MIN, REASON_MAX
} = require("../lib/gradebook/approval");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGN_PREFIX = "platform/assignments/";
const SUB_PREFIX = "platform/submissions/";
const schemeName = classId => "platform/gradebooks/" + classId + "/scheme.json";
const entriesName = classId => "platform/gradebooks/" + classId + "/entries.json";
const approvalsName = classId => "platform/gradebooks/" + classId + "/approvals.json";
const PROJECTS_CAPABILITY = "projects.tracker.view";
const MAX_ENTRY_ITEMS = 300;
const ACTIONS = ["scheme.save", "entries.save", "part.approve", "part.reopen", "final.approve", "final.reopen"];

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, body) => ({ status, headers: NO_STORE, jsonBody: body });
const bad = (error, code = "INVALID_REQUEST", extra = {}) => reply(400, { ok: false, code, error, ...extra });
const notFound = () => reply(404, { ok: false, code: "CLASS_NOT_FOUND", error: "الصف غير موجود." });
const unavailable = () => reply(503, { ok: false, code: "GRADEBOOK_UNAVAILABLE", error: "تعذّر قراءة سجل العلامات الآن. أعد المحاولة بعد قليل." });
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/** Expected sentinel errors that end a request with a known answer (never a storage failure). */
class Refusal extends Error { constructor(response) { super("refused"); this.response = response; } }

function studentName(u) {
  return String(u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim());
}

/** The class, when it exists and this teacher may see it; null otherwise (another teacher's class is reported as missing). */
async function loadClass(c, dl, classId, tenant) {
  const doc = await dl(c, CLASS_PREFIX + classId + ".json");
  if (!doc || !canAccessDocument(doc, tenant)) return null;
  return doc;
}

/** The class's students (home members not archived, and students shared into it), in Arabic name order. */
async function loadRoster(c, classId, deps) {
  const users = await (deps.loadDocs || loadDocs)(c, USER_PREFIX);
  return users
    .filter(u => u && u.role === "student" && isSafeId(String(u.userId || "")) && isStudentInClass(u, classId))
    .map(u => ({ studentId: String(u.userId), displayName: studentName(u), code: String(u.code || "") }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

/** Rounds every value of a computed gradebook for display (D6), keeping the full-precision value beside it. */
function withDisplay(rows) {
  return rows.map(r => ({
    studentId: r.studentId,
    cells: Object.fromEntries(Object.entries(r.cells).map(([id, cell]) => [id, cell.percent === undefined ? cell : { ...cell, display: roundForDisplay(cell.percent) }])),
    categories: Object.fromEntries(Object.entries(r.categories).map(([id, cat]) => [id, { ...cat, display: roundForDisplay(cat.value) }])),
    final: { ...r.final, display: roundForDisplay(r.final.value) }
  }));
}

// ------------------------------------------------------------------------------------------------------------------- GET
/**
 * The ONE computation of a class's gradebook as this teacher sees it, shared by the read and by the approvals (GB6): what is approved is
 * exactly what the table shows. Returns null when there is no scheme; throws Refusal(503) on a corrupt stored document.
 */
async function buildGradebook(c, classroom, grants, deps) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const withEtag = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const classId = classroom.classId;
  const [schemeDoc, entriesDoc, approvalsDoc, students] = await Promise.all([withEtag(c, schemeName(classId)), withEtag(c, entriesName(classId)), dl(c, approvalsName(classId)), loadRoster(c, classId, deps)]);
  const approvals = readApprovals(approvalsDoc, classId);
  if (!approvals) throw new Refusal(unavailable());          // a corrupt approvals document is never read as «nothing approved»
  const projectsAllowed = grants.has(PROJECTS_CAPABILITY);
  const out = { classId, students, schemeDoc, entriesDoc, approvals, projectsAllowed, scheme: null };
  if (!schemeDoc.value) return out;

  const scheme = schemeDoc.value;
  if (!isPlainObject(scheme) || !Array.isArray(scheme.categories)) throw new Refusal(unavailable());
  const items = scheme.categories.flatMap(cat => (isPlainObject(cat) && Array.isArray(cat.items) ? cat.items : []));
  const ids = students.map(s => s.studentId);
  const evidence = new Map();     // itemId → Map(studentId → evidence)
  const titles = new Map();
  const map = deps.mapConcurrent || storage.mapConcurrent;
  const limit = (deps.getReadConcurrency || storage.getReadConcurrency)();
  const now = deps.now ? new Date(deps.now()) : new Date();

  // GB7 — the assignment columns are read CONCURRENTLY, and their submissions through the shared ETag-verified document cache (the
  // Reports Center's rule, classes-students-read-cache): each assignment's submissions are LISTED on every request — so nothing is
  // stale — and a submission is downloaded only when it is new or its ETag changed. Measured at 40 students × 30 columns
  // (api/tests/class-gradebook-perf-gb7.test.js): a repeat open no longer downloads the 1 120 submissions again.
  const roster = new Set(ids);
  const assignmentIds = [...new Set(items.filter(i => isPlainObject(i) && isPlainObject(i.source) && i.source.kind === "assignment" && isSafeId(i.source.assignmentId)).map(i => i.source.assignmentId))];
  const assignmentDocs = new Map();
  const submissions = new Map();       // assignmentId → Map(studentId → submission document)
  await map(assignmentIds, limit, async id => {
    const a = await dl(c, ASSIGN_PREFIX + id + ".json");
    if (!a || String(a.classId || "") !== classId || !isReportableAssessment(a)) return;   // a missing source: its results are never read
    assignmentDocs.set(id, a);
    const prefix = SUB_PREFIX + id + "/";
    const listed = (await (deps.listEntries || listEntries)(c, prefix)).filter(e => roster.has(e.name.slice(prefix.length, -".json".length)));
    const docs = await (deps.loadEntries || loadEntries)(c, listed);
    submissions.set(id, new Map(listed.map((e, i) => [e.name.slice(prefix.length, -".json".length), docs[i]])));
  });

  for (const item of items) {
    if (!isPlainObject(item) || !isPlainObject(item.source)) continue;
    const src = item.source;
    const all = e => new Map(ids.map(id => [id, e]));
    if (src.kind === "assignment") {
      const a = assignmentDocs.get(src.assignmentId);
      if (!a) { evidence.set(item.itemId, all(MISSING_SOURCE)); titles.set(item.itemId, ""); continue; }
      titles.set(item.itemId, String(a.title || ""));
      const subs = submissions.get(src.assignmentId) || new Map();
      evidence.set(item.itemId, new Map(ids.map(id => [id, assignmentEvidence(subs.has(id) ? subs.get(id) : null)])));
    } else if (src.kind === "project") {
      const code = String(src.projectCode || "");
      titles.set(item.itemId, isSupportedProject(code) ? getProjectMeta(code).title : "");
      if (!projectsAllowed) { evidence.set(item.itemId, all(UNCLASSIFIED)); continue; }   // withheld below; never read
      if (!isSupportedProject(code) || !classHasProject(classroom, code)) { evidence.set(item.itemId, all(MISSING_SOURCE)); continue; }
      const { config, view } = await svc.readClassView(c, code, classroom);
      const workDef = svc.workingDefinition(code, config);
      const entries = await svc.loadProgressEntries(c, code, classId, students, view);
      evidence.set(item.itemId, new Map(entries.map(e => [String(e.studentId), projectEvidenceFromProgress(workDef, e.progress, now)])));
    } else if (src.kind === "manual") {
      titles.set(item.itemId, String(src.title || ""));
    }
  }

  const result = computeGradebook({
    scheme, studentIds: ids, entries: isPlainObject(entriesDoc.value) && isPlainObject(entriesDoc.value.cells) ? entriesDoc.value.cells : {},
    evidenceOf: (item, studentId) => (evidence.get(item.itemId) && evidence.get(item.itemId).get(studentId)) || UNCLASSIFIED
  });
  if (!result.ok) throw new Refusal(unavailable());      // a corrupt stored scheme is never half-computed
  const withheldItems = new Set(projectsAllowed ? [] : result.columns.filter(col => col.source.kind === "project").map(col => col.itemId));
  return { ...out, scheme, result, titles, assignmentDocs, withheldItems, nowMs: now.getTime() };
}

/** GB6 — the teacher's view of the approvals: what is approved, whether it changed since, whether each part may be approved now. */
function approvalsSummary(g) {
  const { approvals } = g;
  const parts = {};
  for (const [categoryId, part] of Object.entries(approvals.parts)) {
    parts[categoryId] = { approvedAt: String(part.approvedAt || ""), schemeRevision: Number(part.schemeRevision) || 0, drift: partDrift(part.snapshot, g) };
  }
  const readiness = { parts: {}, final: finalReadiness(g, approvals) };
  for (const cat of g.scheme.categories) if (!approvals.parts[cat.categoryId]) readiness.parts[cat.categoryId] = partReadiness(cat.categoryId, g);
  return {
    approvals: {
      revision: Number(approvals.revision) || 0, parts,
      final: approvals.final ? { approvedAt: String(approvals.final.approvedAt || ""), drift: finalDrift(approvals.final.snapshot, g) } : null,
      // who approved / reopened is in the audit log; the page shows what happened, when, and why
      history: approvals.history.slice(-20).map(h => ({ action: String(h.action || ""), ...(h.categoryId ? { categoryId: String(h.categoryId) } : {}), at: String(h.at || ""), ...(h.reason ? { reason: String(h.reason) } : {}) }))
    },
    readiness
  };
}

async function readGradebook(c, classroom, auth, grants, deps) {
  const g = await buildGradebook(c, classroom, grants, deps);
  const { classId, students, schemeDoc, entriesDoc } = g;
  const readOnly = normalizeClassStatus(classroom) === "archived";
  const base = { ok: true, classId, className: String(classroom.name || ""), readOnly, students, etags: { scheme: schemeDoc.etag, entries: entriesDoc.etag }, withheld: g.projectsAllowed ? [] : ["projects"] };
  if (!g.scheme) return reply(200, { ...base, scheme: null, columns: [], rows: [], warnings: [] });
  const { scheme, result, titles, withheldItems } = g;
  const ids = students.map(s => s.studentId);

  const rows = withDisplay(result.rows).map(r => {
    if (!withheldItems.size) return r;
    const cells = { ...r.cells };
    for (const id of withheldItems) cells[id] = { state: "withheld" };
    return { ...r, cells };
  });
  const columns = result.columns.map(col => ({ ...col, title: titles.get(col.itemId) || "" }));
  // GB5 — the teacher's own entries as stored (a typed score or an excused / zero decision), so the page can show the score it edits
  // and send the value it saw (`expected`). Only the scheme's columns and the roster's students; never a withheld column; never who /
  // when (the audit keeps that).
  const storedCells = isPlainObject(entriesDoc.value) && isPlainObject(entriesDoc.value.cells) ? entriesDoc.value.cells : {};
  const entries = {};
  for (const col of result.columns) {
    if (withheldItems.has(col.itemId) || !isPlainObject(storedCells[col.itemId])) continue;
    const byStudent = {};
    for (const id of ids) { const v = cellValue(storedCells[col.itemId][id]); if (v) byStudent[id] = v; }
    if (Object.keys(byStudent).length) entries[col.itemId] = byStudent;
  }
  return reply(200, {
    ...base,
    scheme: { revision: Number(scheme.revision) || 0, categories: scheme.categories, updatedAt: String(scheme.updatedAt || "") },
    schemeStatus: result.status, columns, rows, warnings: result.warnings, entries,
    ...approvalsSummary(g)
  });
}

// ------------------------------------------------------------------------------------------------------------------- GB8 copy
/** This teacher's other classes (archived ones too: last year's scheme is a good start) that have a scheme, newest first. */
async function readCopyClasses(c, classroom, auth, deps) {
  const tenant = tenantOf(auth.user);
  const classes = (await (deps.loadDocs || loadDocs)(c, CLASS_PREFIX))
    .filter(d => d && isSafeId(String(d.classId || "")) && d.classId !== classroom.classId && canAccessDocument(d, tenant));
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const schemes = await (deps.mapConcurrent || storage.mapConcurrent)(classes, (deps.getReadConcurrency || storage.getReadConcurrency)(), d => dl(c, schemeName(d.classId)));
  const out = classes.map((d, i) => ({ d, s: schemes[i] }))
    .filter(({ s }) => isPlainObject(s) && Array.isArray(s.categories) && s.categories.length)
    .map(({ d, s }) => ({
      classId: String(d.classId), name: String(d.name || ""), schoolYear: String(d.schoolYear || ""), archived: normalizeClassStatus(d) === "archived",
      categories: s.categories.length, items: s.categories.reduce((n, cat) => n + (isPlainObject(cat) && Array.isArray(cat.items) ? cat.items.length : 0), 0),
      updatedAt: String(s.updatedAt || "")
    }))
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  return reply(200, { ok: true, classId: classroom.classId, classes: out });
}

/** Another class's scheme mapped onto this class (lib/gradebook/copy.js). The source is read only if this teacher may see it. */
async function readCopy(c, classroom, auth, grants, fromId, deps) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  if (!isSafeId(fromId) || fromId === classroom.classId) return bad("الصف المصدر غير صالح.");
  const source = await loadClass(c, dl, fromId, tenantOf(auth.user));
  if (!source) return reply(404, { ok: false, code: "SOURCE_NOT_FOUND", error: "الصف المصدر غير موجود." });
  const scheme = await dl(c, schemeName(fromId));
  if (!isPlainObject(scheme) || !Array.isArray(scheme.categories) || !scheme.categories.length) return reply(404, { ok: false, code: "SOURCE_HAS_NO_SCHEME", error: "لا يوجد مخطط علامات في الصف المصدر." });
  const sourceIds = [...new Set(scheme.categories.flatMap(cat => (isPlainObject(cat) && Array.isArray(cat.items) ? cat.items : []))
    .filter(i => isPlainObject(i) && isPlainObject(i.source) && i.source.kind === "assignment" && isSafeId(i.source.assignmentId)).map(i => i.source.assignmentId))];
  const docs = await (deps.mapConcurrent || storage.mapConcurrent)(sourceIds, (deps.getReadConcurrency || storage.getReadConcurrency)(), id => dl(c, ASSIGN_PREFIX + id + ".json"));
  const sourceAssignments = new Map(sourceIds.map((id, i) => [id, docs[i] && String(docs[i].classId || "") === fromId ? docs[i] : undefined]));
  const targetAssignments = (await (deps.loadDocs || loadDocs)(c, ASSIGN_PREFIX))
    .filter(a => a && String(a.classId || "") === classroom.classId && isReportableAssessment(a) && isSafeId(String(a.assignmentId || "")));
  const projectsAllowed = grants.has(PROJECTS_CAPABILITY);
  const proposal = proposeCopy({ scheme, sourceAssignments, targetAssignments, targetProjects: new Set(projectsAllowed ? getSupportedClassProgramCodes(classroom) : []), projectsAllowed });
  for (const cat of proposal.categories) for (const item of cat.items) if (item.source.kind === "project") item.title = getProjectMeta(item.source.projectCode).title;
  return reply(200, { ok: true, classId: classroom.classId, from: { classId: fromId, name: String(source.name || "") }, ...proposal });
}

async function readSources(c, classroom, grants, deps) {
  const { assignments, projects } = await listClassSources(c, classroom, grants.has(PROJECTS_CAPABILITY), deps);
  return reply(200, { ok: true, classId: classroom.classId, assignments, projects, withheld: grants.has(PROJECTS_CAPABILITY) ? [] : ["projects"] });
}

// ------------------------------------------------------------------------------------------------------------------- scheme.save
async function saveScheme(c, classroom, body, auth, grants, deps) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const withEtag = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const upload = deps.uploadJsonConditional || storage.uploadJsonConditional;
  const classId = classroom.classId;
  if (!Object.prototype.hasOwnProperty.call(body, "etag") || !(body.etag === null || (typeof body.etag === "string" && body.etag))) {
    return bad("يجب إرسال نسخة المخطط التي فُتحت (etag)، أو null لمخطط جديد.");
  }
  const input = body.scheme;
  if (!isPlainObject(input) || !Array.isArray(input.categories)) return bad("مخطط العلامات غير صالح.", "SCHEME_INVALID");
  const rawItems = input.categories.flatMap(cat => (isPlainObject(cat) && Array.isArray(cat.items) ? cat.items : []));
  const sources = rawItems.map(i => (isPlainObject(i) && isPlainObject(i.source) ? i.source : {}));
  if (sources.some(s => s.kind === "project") && !grants.has(PROJECTS_CAPABILITY)) {
    return reply(403, { ok: false, code: "CAPABILITY_DENIED", error: "أعمدة المشاريع تحتاج صلاحية «رؤية متابعة المشاريع».", capability: PROJECTS_CAPABILITY });
  }
  const assignmentIds = [...new Set(sources.filter(s => s.kind === "assignment" && isSafeId(s.assignmentId)).map(s => s.assignmentId))].slice(0, 400);
  const docs = await (deps.mapConcurrent || storage.mapConcurrent)(assignmentIds, (deps.getReadConcurrency || storage.getReadConcurrency)(), id => dl(c, ASSIGN_PREFIX + id + ".json"));
  const context = { classId, assignments: new Map(assignmentIds.map((id, i) => [id, docs[i]]).filter(([, d]) => d)), projectCodes: getSupportedClassProgramCodes(classroom) };
  const v = validateScheme(input, context);
  if (!v.ok) return bad("مخطط العلامات غير صالح.", "SCHEME_INVALID", { errors: v.errors });
  const locked = await approvalLock(c, classId, deps);
  if (locked.final) return reply(409, { ok: false, code: "FINAL_APPROVED", error: "العلامة النهائية معتمدة؛ أعد فتحها قبل تعديل المخطط." });
  const changed = Object.entries(locked.parts).filter(([categoryId, part]) => {
    const cat = v.scheme.categories.find(x => x.categoryId === categoryId);
    return !cat || !sameStructure(lockedItems(cat), part.snapshot.items.map(({ itemId, weight, source }) => ({ itemId, weight, source })));
  }).map(([categoryId]) => categoryId);
  if (changed.length) return reply(409, { ok: false, code: "PART_APPROVED", error: "لا يمكن تعديل أعمدة جزء معتمد أو حذفه؛ أعد فتحه أولًا.", categoryIds: changed });

  const current = await withEtag(c, schemeName(classId));
  if ((current.etag || null) !== body.etag) return reply(409, { ok: false, code: "STALE_SCHEME", error: "عُدّل المخطط في مكان آخر بعد أن فتحته. أعد التحميل ثم احفظ.", etag: current.etag });
  const revision = (current.value && Number(current.value.revision)) || 0;
  const doc = { ...v.scheme, classId, revision: revision + 1, status: v.status, updatedAt: new Date().toISOString(), updatedBy: String(auth.user && auth.user.sub || "") };
  let etag;
  try { etag = await upload(c, schemeName(classId), doc, current.etag); }
  catch (e) {
    if (storage.isConcurrencyConflict(e)) return reply(409, { ok: false, code: "STALE_SCHEME", error: "عُدّل المخطط في مكان آخر بعد أن فتحته. أعد التحميل ثم احفظ." });
    throw e;
  }
  const itemsCount = v.scheme.categories.reduce((n, cat) => n + cat.items.length, 0);
  await (deps.recordAuditEvent || recordAuditEvent)(c, { actor: auth.user && auth.user.sub, action: "gradebook.scheme.save", targetType: "class", targetId: classId, targetLabel: String(classroom.name || ""),
    details: { classId, revision: doc.revision, status: v.status, categories: v.scheme.categories.length, items: itemsCount, sumIssues: v.sumIssues } });
  return reply(200, { ok: true, etag, revision: doc.revision, status: v.status, sumIssues: v.sumIssues });
}

// ------------------------------------------------------------------------------------------------------------------- entries.save
const twoDecimals = n => Math.abs(n * 100 - Math.round(n * 100)) <= 1e-9;
/** A cell value as stored and compared: { decision } | { score } | null. */
function cellValue(entry) {
  if (!isPlainObject(entry)) return null;
  if (entry.decision !== undefined) return { decision: entry.decision };
  if (entry.score !== undefined) return { score: entry.score };
  return null;
}
const sameValue = (a, b) => JSON.stringify(cellValue(a)) === JSON.stringify(cellValue(b));

function checkEntryItem(raw, index, itemsById, roster, projectsAllowed) {
  const err = (code, error) => ({ index, code, error });
  if (!isPlainObject(raw)) return err("ITEM_INVALID", "عنصر غير صالح.");
  const item = isSafeId(raw.itemId) ? itemsById.get(raw.itemId) : null;
  if (!item) return err("ITEM_UNKNOWN", "العمود غير موجود في المخطط.");
  if (!isSafeId(raw.studentId) || !roster.has(raw.studentId)) return err("STUDENT_NOT_IN_CLASS", "الطالب لا ينتمي إلى هذا الصف.");
  if (item.source.kind === "project" && !projectsAllowed) return err("WITHHELD", "أعمدة المشاريع تحتاج صلاحية «رؤية متابعة المشاريع».");
  if (!Object.prototype.hasOwnProperty.call(raw, "expected")) return err("EXPECTED_REQUIRED", "يجب إرسال القيمة التي ظهرت قبل التعديل (expected).");
  if (raw.expected !== null && cellValue(raw.expected) === null) return err("EXPECTED_INVALID", "القيمة السابقة غير صالحة.");
  const v = raw.value;
  if (v === null) return null;
  if (!isPlainObject(v)) return err("VALUE_INVALID", "القيمة غير صالحة.");
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "decision") return DECISIONS.includes(v.decision) ? null : err("VALUE_INVALID", "القرار غير معروف.");
  if (keys.length === 1 && keys[0] === "score") {
    if (item.source.kind !== "manual") return err("SCORE_NOT_MANUAL", "تُكتب العلامة فقط في الأعمدة التي يرصدها المعلم.");
    const s = v.score;
    if (typeof s !== "number" || !Number.isFinite(s) || s < 0 || s > item.source.maxScore || !twoDecimals(s)) return err("SCORE_INVALID", "العلامة يجب أن تكون بين 0 و" + item.source.maxScore + "، بمنزلتين عشريتين على الأكثر.");
    return null;
  }
  return err("VALUE_INVALID", "القيمة غير صالحة.");
}

async function saveEntries(c, classroom, body, auth, grants, deps) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const mutate = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const classId = classroom.classId;
  const items = body.items;
  if (!Array.isArray(items) || !items.length || items.length > MAX_ENTRY_ITEMS) return bad("يجب إرسال من 1 إلى " + MAX_ENTRY_ITEMS + " تعديلًا.");
  const scheme = await dl(c, schemeName(classId));
  if (!isPlainObject(scheme) || !Array.isArray(scheme.categories)) return reply(409, { ok: false, code: "NO_SCHEME", error: "احفظ مخطط العلامات أولًا." });
  const itemsById = new Map(scheme.categories.flatMap(cat => (isPlainObject(cat) && Array.isArray(cat.items) ? cat.items : [])).filter(i => isPlainObject(i) && isPlainObject(i.source)).map(i => [i.itemId, i]));
  const roster = new Set((await loadRoster(c, classId, deps)).map(s => s.studentId));
  const projectsAllowed = grants.has(PROJECTS_CAPABILITY);
  const errors = items.map((raw, i) => checkEntryItem(raw, i, itemsById, roster, projectsAllowed)).filter(Boolean);
  const seen = new Set();
  items.forEach((raw, i) => { const k = isPlainObject(raw) ? raw.itemId + "/" + raw.studentId : ""; if (k && seen.has(k)) errors.push({ index: i, code: "DUPLICATE", error: "الخلية مكررة في الطلب." }); seen.add(k); });
  if (errors.length) return bad("بعض التعديلات غير صالحة؛ لم يُحفظ شيء.", "ENTRIES_INVALID", { errors });
  const locked = await approvalLock(c, classId, deps);
  const lockedItemIds = new Map(Object.entries(locked.parts).flatMap(([categoryId, part]) => part.snapshot.items.map(i => [i.itemId, categoryId])));
  const blocked = items.map((raw, index) => (lockedItemIds.has(raw.itemId) ? { index, categoryId: lockedItemIds.get(raw.itemId) } : null)).filter(Boolean);
  if (blocked.length) return reply(409, { ok: false, code: "PART_APPROVED", error: "هذه الخلايا في جزء معتمد؛ أعد فتحه قبل التعديل. لم يُحفظ شيء.", errors: blocked });

  const at = new Date().toISOString(), by = String(auth.user && auth.user.sub || "");
  let applied = [], stale = [];
  const NOTHING = new Error("nothing to apply");
  let written = null;
  try {
    written = await mutate(c, entriesName(classId), current => {
      applied = []; stale = [];
      const doc = isPlainObject(current) ? current : { schemaVersion: 1, classId, revision: 0, cells: {} };
      if (!isPlainObject(doc.cells)) throw new Refusal(unavailable());
      const cells = { ...doc.cells };
      for (const raw of items) {
        const byStudent = isPlainObject(cells[raw.itemId]) ? { ...cells[raw.itemId] } : {};
        const now = Object.prototype.hasOwnProperty.call(byStudent, raw.studentId) ? byStudent[raw.studentId] : null;
        if (!sameValue(now, raw.expected)) { stale.push({ itemId: raw.itemId, studentId: raw.studentId, current: cellValue(now) }); continue; }
        if (raw.value === null) delete byStudent[raw.studentId];
        else byStudent[raw.studentId] = { ...raw.value, at, by };
        cells[raw.itemId] = byStudent;
        applied.push({ itemId: raw.itemId, studentId: raw.studentId, from: cellValue(now), to: cellValue(raw.value) });
      }
      if (!applied.length) throw NOTHING;
      return { ...doc, schemaVersion: 1, classId, cells, revision: (Number(doc.revision) || 0) + 1, updatedAt: at, updatedBy: by };
    });
  } catch (e) {
    if (e === NOTHING) return reply(409, { ok: false, code: "STALE_ENTRIES", error: "تغيّرت هذه الخلايا في مكان آخر؛ لم يُحفظ شيء.", applied: [], stale });
    if (e instanceof storage.StorageConflictError) return reply(409, { ok: false, code: "SAVE_CONFLICT", error: "تعارض في الحفظ، أعد المحاولة." });
    throw e;
  }
  await (deps.recordAuditEvent || recordAuditEvent)(c, { actor: by, action: "gradebook.entries.save", targetType: "class", targetId: classId, targetLabel: String(classroom.name || ""),
    details: { classId, revision: written.revision, applied: applied.length, stale: stale.length, changes: applied.slice(0, 300) } });
  return reply(200, { ok: true, revision: written.revision, applied: applied.map(({ itemId, studentId }) => ({ itemId, studentId })), stale });
}

// ------------------------------------------------------------------------------------------------------------------- GB6 approvals
/** The class's approvals for a lock check; a corrupt document refuses the write (fail closed: never read as «nothing approved»). */
async function approvalLock(c, classId, deps) {
  const approvals = readApprovals(await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(c, approvalsName(classId)), classId);
  if (!approvals) throw new Refusal(unavailable());
  return approvals;
}

const staleScheme = () => reply(409, { ok: false, code: "STALE_SCHEME", error: "تغيّر المخطط بعد أن فتحت السجل. أعد التحميل ثم اعتمد." });
const notReady = (issues, code = "PART_NOT_READY") => reply(409, { ok: false, code, error: issues.map(i => i.message).join(" "), issues });

/** Writes the approvals document (read-modify-write with retry). `change(doc)` returns the new document, or throws a Refusal. */
async function writeApprovals(c, classId, deps, change) {
  const mutate = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  try {
    return await mutate(c, approvalsName(classId), current => {
      const doc = readApprovals(current, classId);
      if (!doc) throw new Refusal(unavailable());
      const next = change(doc);
      return { ...next, schemaVersion: 1, classId, revision: (Number(doc.revision) || 0) + 1 };
    });
  } catch (e) {
    if (e instanceof storage.StorageConflictError) return reply(409, { ok: false, code: "SAVE_CONFLICT", error: "تعارض في الحفظ، أعد المحاولة." });
    throw e;
  }
}

async function audit(c, deps, auth, classroom, action, details) {
  await (deps.recordAuditEvent || recordAuditEvent)(c, { actor: auth.user && auth.user.sub, action, targetType: "class", targetId: classroom.classId, targetLabel: String(classroom.name || ""), details: { classId: classroom.classId, ...details } });
}

async function approve(c, classroom, body, auth, grants, deps, action) {
  const classId = classroom.classId;
  const isPart = action === "part.approve";
  if (isPart && !isSafeId(body.categoryId)) return bad("categoryId غير صالح.");
  if (!Number.isInteger(body.schemeRevision) || body.schemeRevision < 1) return bad("يجب إرسال نسخة المخطط التي ظهرت (schemeRevision).");
  const g = await buildGradebook(c, classroom, grants, deps);
  if (!g.scheme) return reply(409, { ok: false, code: "NO_SCHEME", error: "احفظ مخطط العلامات أولًا." });
  if ((Number(g.scheme.revision) || 0) !== body.schemeRevision) return staleScheme();
  const at = new Date(g.nowMs).toISOString(), by = String(auth.user && auth.user.sub || "");

  if (isPart) {
    const categoryId = body.categoryId;
    if (!g.scheme.categories.some(cat => cat.categoryId === categoryId)) return reply(404, { ok: false, code: "PART_NOT_FOUND", error: "الجزء غير موجود في المخطط." });
    if (g.approvals.parts[categoryId]) return reply(200, { ok: true, unchanged: true, revision: Number(g.approvals.revision) || 0 });   // a repeated approval changes nothing
    const ready = partReadiness(categoryId, g);
    if (!ready.ready) return notReady(ready.issues);
    const snapshot = partSnapshot(categoryId, g, g.titles);
    const written = await writeApprovals(c, classId, deps, doc => {
      if (doc.parts[categoryId]) throw new Refusal(reply(200, { ok: true, unchanged: true, revision: Number(doc.revision) || 0 }));
      if (doc.final) throw new Refusal(reply(409, { ok: false, code: "FINAL_APPROVED", error: "العلامة النهائية معتمدة؛ أعد فتحها أولًا." }));
      return { ...doc, parts: { ...doc.parts, [categoryId]: { approvedAt: at, approvedBy: by, schemeRevision: body.schemeRevision, snapshot } }, history: withHistory(doc, { action: "part.approve", categoryId, at, by }) };
    });
    if (written.status) return written;
    await audit(c, deps, auth, classroom, "gradebook.part.approve", { categoryId, schemeRevision: body.schemeRevision, revision: written.revision, students: Object.keys(snapshot.students).length, items: snapshot.items.length });
    return reply(200, { ok: true, revision: written.revision, categoryId, approvedAt: at });
  }

  if (g.approvals.final) return reply(200, { ok: true, unchanged: true, revision: Number(g.approvals.revision) || 0 });
  const ready = finalReadiness(g, g.approvals);
  if (!ready.ready) return notReady(ready.issues, "FINAL_NOT_READY");
  const snapshot = finalSnapshot(g);
  const approvedParts = JSON.stringify(Object.keys(g.approvals.parts).sort());
  const written = await writeApprovals(c, classId, deps, doc => {
    if (doc.final) throw new Refusal(reply(200, { ok: true, unchanged: true, revision: Number(doc.revision) || 0 }));
    // the parts checked above must still be the approved ones (none reopened meanwhile)
    if (JSON.stringify(Object.keys(doc.parts).sort()) !== approvedParts || Object.keys(doc.parts).some(id => doc.parts[id].approvedAt !== g.approvals.parts[id].approvedAt)) {
      throw new Refusal(reply(409, { ok: false, code: "APPROVALS_CHANGED", error: "تغيّرت اعتمادات الأجزاء في مكان آخر. أعد التحميل ثم اعتمد." }));
    }
    return { ...doc, final: { approvedAt: at, approvedBy: by, schemeRevision: body.schemeRevision, snapshot }, history: withHistory(doc, { action: "final.approve", at, by }) };
  });
  if (written.status) return written;
  await audit(c, deps, auth, classroom, "gradebook.final.approve", { schemeRevision: body.schemeRevision, revision: written.revision, students: Object.keys(snapshot.students).length });
  return reply(200, { ok: true, revision: written.revision, approvedAt: at });
}

async function reopen(c, classroom, body, auth, deps, action) {
  const classId = classroom.classId;
  const isPart = action === "part.reopen";
  if (isPart && !isSafeId(body.categoryId)) return bad("categoryId غير صالح.");
  const reason = normalizeReason(body.reason, cleanText);
  if (!reason) return bad("اكتب سبب إعادة الفتح (من " + REASON_MIN + " إلى " + REASON_MAX + " حرفًا).", "REASON_REQUIRED");
  const at = (deps.now ? new Date(deps.now()) : new Date()).toISOString(), by = String(auth.user && auth.user.sub || "");
  let previous = null;
  const written = await writeApprovals(c, classId, deps, doc => {
    if (isPart) {
      const part = doc.parts[body.categoryId];
      if (!part) throw new Refusal(reply(409, { ok: false, code: "NOT_APPROVED", error: "هذا الجزء غير معتمد." }));
      if (doc.final) throw new Refusal(reply(409, { ok: false, code: "FINAL_APPROVED", error: "العلامة النهائية معتمدة؛ أعد فتحها قبل إعادة فتح جزء." }));
      previous = { approvedAt: part.approvedAt, schemeRevision: part.schemeRevision };
      const parts = { ...doc.parts };
      delete parts[body.categoryId];
      return { ...doc, parts, history: withHistory(doc, { action: "part.reopen", categoryId: body.categoryId, at, by, reason }) };
    }
    if (!doc.final) throw new Refusal(reply(409, { ok: false, code: "NOT_APPROVED", error: "العلامة النهائية غير معتمدة." }));
    previous = { approvedAt: doc.final.approvedAt, schemeRevision: doc.final.schemeRevision };
    return { ...doc, final: null, history: withHistory(doc, { action: "final.reopen", at, by, reason }) };
  });
  if (written.status) return written;
  await audit(c, deps, auth, classroom, isPart ? "gradebook.part.reopen" : "gradebook.final.reopen", { ...(isPart ? { categoryId: body.categoryId } : {}), reason, revision: written.revision, previous });
  return reply(200, { ok: true, revision: written.revision });
}

// ------------------------------------------------------------------------------------------------------------------- handler
async function handler(request, deps = {}, obs = null) {
  try {
    const auth = await requireTeacherSession(request, deps);
    if (!auth.ok) return auth.response;
    const isGet = request.method === "GET";
    let body = {};
    if (!isGet) { try { body = await request.json(); } catch { body = null; } }
    const action = !isGet && isPlainObject(body) && ACTIONS.includes(body.action) ? body.action : "";
    const capabilityDenial = await requireCapability(auth, "class-gradebook.js", isGet ? "GET" : (action || "*"), deps, obs);
    if (capabilityDenial) return capabilityDenial;
    if (!isGet && !isPlainObject(body)) return bad("طلب غير صالح.");
    if (!isGet && !action) return bad("الإجراء غير معروف.", "UNKNOWN_ACTION");

    const params = isGet ? new URL(request.url).searchParams : null;
    const classId = String(isGet ? params.get("classId") || "" : body.classId || "");
    if (!isSafeId(classId)) return bad("classId غير صالح.");
    const c = deps.container || (deps.getContainer || storage.getContainer)();
    const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
    const classroom = await loadClass(c, dl, classId, tenantOf(auth.user));
    if (!classroom) return notFound();
    const grants = await (deps.sessionGrants || sessionGrants)(auth.user, deps, obs);
    if (!grants.ok) return grants.response;

    if (isGet) {
      const resource = params.get("resource");
      if (resource === "sources") return await readSources(c, classroom, grants, deps);
      if (resource === "copy-classes") return await readCopyClasses(c, classroom, auth, deps);
      if (resource === "copy") return await readCopy(c, classroom, auth, grants, String(params.get("from") || ""), deps);
      return await readGradebook(c, classroom, auth, grants, deps);
    }
    if (normalizeClassStatus(classroom) === "archived") return reply(409, { ok: false, code: "CLASS_ARCHIVED", error: "الصف مؤرشف؛ سجل علاماته للقراءة فقط." });
    if (action === "scheme.save") return await saveScheme(c, classroom, body, auth, grants, deps);
    if (action === "part.approve" || action === "final.approve") return await approve(c, classroom, body, auth, grants, deps, action);
    if (action === "part.reopen" || action === "final.reopen") return await reopen(c, classroom, body, auth, deps, action);
    return await saveEntries(c, classroom, body, auth, grants, deps);
  } catch (e) {
    if (e instanceof Refusal) return e.response;
    obs?.logWarn?.("gradebook.unavailable", { reason: e && e.code ? String(e.code) : "error" });
    return unavailable();
  }
}

app.http("classGradebook", { methods: ["GET", "POST"], authLevel: "anonymous", route: "class-gradebook", handler: withObservability("class-gradebook", handler) });
module.exports = { handler };
