// Phase 9C — Teacher Project Evaluation Attention: WHICH students still have project stages the teacher has not
// graded, aggregated for the Teacher Today Hub in the SAME single request the hub already makes.
//
// Read strategy (Part C): the hub already holds every classroom and every user document. For each ACTIVE class ×
// each project the class is enrolled in (class-programs.getSupportedClassProgramCodes — the ONE enrollment predicate),
// exactly TWO storage operations run, with bounded concurrency: the class's project snapshot (one blob; a missing
// snapshot falls back to the registry's default definition IN MEMORY, exactly as the student tracker and the
// projects-summary read do — nothing is written) and ONE listing of that class's progress folder under the project's
// own storage namespace (every member's document at once). No per-student reads, no full-container scan, no cache,
// no persistence. A class×project whose snapshot is malformed (no stages array) is skipped and reported in
// `skipped` so a corrupt snapshot can never blank the whole hub.
//
// Semantics (Part B/E): the evaluation of ONE student in ONE project is ALWAYS evaluation.buildProjectEvaluation
// (the Phase 9B authority — never re-implemented here): totalStages = the snapshot's ACTIVE stages, a stage is graded
// when it carries any valid score (0 IS a grade; approval is irrelevant), orphan scores are ignored, a missing
// progress document means every active stage is ungraded. A student appears in `attention` only as a CURRENT member
// (lib/class-membership — archived students never) of an ACTIVE class enrolled in that project, with
// ungradedStages > 0. Nothing here touches workflow progress, performance.grade, Strength, ranks or the contracts
// of score.set / score.clear.
//
// Ordering (Part G): ungradedStages DESC → evaluationProgress ASC → displayName (Arabic collation) → studentId →
// projectCode; the list is deterministic for identical inputs. Display cap (Part C): `attention` carries at most
// ATTENTION_CAP rows; every counter (students, stages, per-project figures, `attentionTotal`) is computed over ALL
// rows and never hidden by the cap (`capped` says whether rows were cut).
const { downloadJsonOrNull, listJson, mapConcurrent, getReadConcurrency } = require("../platform-storage");
const { getProjectDefinition, getStorageNamespace } = require("./registry");
const { getSupportedClassProgramCodes } = require("./class-programs");
const { buildClassSnapshot, workingDefinition } = require("./service");
const { buildProjectEvaluation } = require("./evaluation");
const { normalizeClassStatus } = require("../class-lifecycle");
const { isStudentClassMember } = require("../class-membership");

const ATTENTION_CAP = 20;

const studentName = u => String(u.displayName || [u.firstName, u.familyName].filter(Boolean).join(" ") || u.code || u.userId || "");
const isActiveClass = c => !!c && !!c.classId && normalizeClassStatus(c) === "active";

/** The (active class × enrolled project) pairs the hub has to look at — derived from documents already loaded. */
function attentionTargets(classes) {
  const out = [];
  for (const c of Array.isArray(classes) ? classes : []) {
    if (!isActiveClass(c)) continue;
    for (const projectCode of getSupportedClassProgramCodes(c)) out.push({ classId: String(c.classId), className: String(c.name || ""), projectCode });
  }
  return out;
}

/**
 * Loads the two documents each target needs (snapshot + the class's progress folder under the project namespace),
 * with bounded concurrency. `deps` is the test seam (downloadJsonOrNull / listJson / mapConcurrent / getReadConcurrency).
 * Returns [{ classId, className, projectCode, snapshot, progressDocs }] aligned with the targets.
 */
async function loadProjectEvaluationSources(container, classes, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const lj = deps.listJson || listJson;
  const mc = deps.mapConcurrent || mapConcurrent;
  const limit = (deps.getReadConcurrency || getReadConcurrency)();
  const targets = attentionTargets(classes);
  return mc(targets, limit, async t => {
    const ns = getStorageNamespace(t.projectCode);
    const [stored, progressDocs] = await Promise.all([dl(container, ns.configName(t.classId)), lj(container, ns.progressPrefix(t.classId))]);
    // A missing snapshot = the registry default, in memory only (the same fallback the student tracker uses); a
    // present-but-malformed one is kept as-is so the derivation can skip and report it.
    const snapshot = stored === null || stored === undefined ? buildClassSnapshot(getProjectDefinition(t.projectCode), t.classId, new Date(0).toISOString()) : stored;
    return { ...t, snapshot, progressDocs: Array.isArray(progressDocs) ? progressDocs : [] };
  });
}

const collator = new Intl.Collator("ar");
function compareRows(a, b) {
  return b.ungradedStages - a.ungradedStages
    || a.evaluationProgress - b.evaluationProgress
    || collator.compare(a.displayName, b.displayName)
    || (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0)
    || (a.projectCode < b.projectCode ? -1 : a.projectCode > b.projectCode ? 1 : 0);
}

/**
 * Pure derivation (exported for tests): the hub's `projectEvaluation` block from already-loaded documents.
 *   users    — every user document (members are selected with the canonical class-membership predicate);
 *   sources  — loadProjectEvaluationSources() output (only active, enrolled class×project pairs);
 *   cap      — display cap for `attention` (default ATTENTION_CAP).
 */
function deriveProjectEvaluationAttention({ users, sources, cap = ATTENTION_CAP }) {
  const rows = [], skipped = [];
  const perProject = new Map();
  const studentIds = new Set();
  for (const src of Array.isArray(sources) ? sources : []) {
    if (!src || !src.snapshot || !Array.isArray(src.snapshot.stages)) { skipped.push({ classId: src && src.classId, projectCode: src && src.projectCode, reason: "invalid_snapshot" }); continue; }
    const definition = getProjectDefinition(src.projectCode);
    const workDef = workingDefinition(src.projectCode, src.snapshot);
    const byStudent = new Map();
    for (const doc of src.progressDocs || []) if (doc && typeof doc === "object" && doc.studentId) byStudent.set(String(doc.studentId), doc);
    const members = (Array.isArray(users) ? users : []).filter(u => u && u.role === "student" && isStudentClassMember(u, src.classId));
    let projectStudents = 0, projectStages = 0;
    for (const u of members) {
      const studentId = String(u.userId);
      const e = buildProjectEvaluation(workDef, byStudent.get(studentId) || null);   // the ONE evaluation authority
      if (e.ungradedStages <= 0) continue;
      projectStudents += 1; projectStages += e.ungradedStages; studentIds.add(studentId);
      rows.push({
        studentId, displayName: studentName(u), classId: src.classId, className: src.className,
        projectCode: src.projectCode, projectTitle: definition.title,
        gradedStages: e.gradedStages, totalStages: e.totalStages, ungradedStages: e.ungradedStages, evaluationProgress: e.evaluationProgress
      });
    }
    const agg = perProject.get(src.projectCode) || { projectCode: src.projectCode, title: definition.title, studentsWithUngradedStages: 0, totalUngradedStages: 0 };
    agg.studentsWithUngradedStages += projectStudents; agg.totalUngradedStages += projectStages;
    perProject.set(src.projectCode, agg);
  }
  rows.sort(compareRows);
  const limit = Math.max(0, Number(cap) || 0);
  return {
    studentsWithUngradedStages: studentIds.size,
    totalUngradedStages: rows.reduce((n, r) => n + r.ungradedStages, 0),
    projects: [...perProject.values()].sort((a, b) => (a.projectCode < b.projectCode ? -1 : a.projectCode > b.projectCode ? 1 : 0)),
    attentionTotal: rows.length,
    capped: rows.length > limit,
    attention: rows.slice(0, limit),
    skipped
  };
}

module.exports = { ATTENTION_CAP, attentionTargets, loadProjectEvaluationSources, deriveProjectEvaluationAttention };
