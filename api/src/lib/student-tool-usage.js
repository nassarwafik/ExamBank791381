// Phase T8 — the record of which student tools a student opened during an attempt (docs/enterprise-student-tools-t.md §15).
//
// The student client REPORTS: `toolUsage: { <toolId>: <opens> }`, the attempt's cumulative count of openings per tool, rides on
// saveDraft / pauseAttempt (kept with the draft as `draftToolUsage`) and on the finalizing actions (submit, timeout, integrity exit).
// The server owns the record:
//
//   1. the report is UNTRUSTED input. normalizeToolUsage keeps only tools the PUBLISHED exam actually offers (the frozen
//      `examSnapshot.studentTools`, canonical form) with an integer count of 1–999; anything else is dropped, and nothing malformed is
//      ever stored;
//   2. mergeToolUsage is monotonic: a count never goes down (a second device, a reload, a retried request or an older report can only
//      keep or raise it), so the same report applied twice changes nothing. The server stamps when it first and last saw a tool;
//   3. the record is INFORMATION FOR THE TEACHER ONLY. It never reaches grading, a score, the student's result projection, an analytic
//      or an audit event. A forged report can only make the teacher read a wrong count, which the record does not present as proof.
//
// Clients that never send the field, exams without tools, and legacy attempts are byte-for-byte unchanged.
const { projectStudentToolsForStudent } = require("./shared-finalization/studentTools/studentToolsSpec");

const MAX_OPENS = 999;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const setOwn = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

/** The tool ids the published exam offers, in the spec's canonical order ([] when it offers none or the spec is unreadable). */
function offeredToolIds(exam) {
  let spec = null;
  try { spec = projectStudentToolsForStudent(isObj(exam) ? exam.studentTools : undefined); } catch { spec = null; }
  return spec && Array.isArray(spec.tools) ? spec.tools.map(t => t.id) : [];
}

/** normalizeToolUsage(raw, exam) → { [toolId]: opens } — only offered tools, integer counts 1–999, in the spec's order. */
function normalizeToolUsage(raw, exam) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const id of offeredToolIds(exam)) {
    if (!own(raw, id)) continue;
    const n = raw[id];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) continue;
    setOwn(out, id, Math.min(n, MAX_OPENS));
  }
  return out;
}

/** The stored form of one tool's record, or null when the value is not one (a damaged document is read as nothing). */
function storedEntry(v) {
  if (!isObj(v) || typeof v.opens !== "number" || !Number.isInteger(v.opens) || v.opens < 1) return null;
  return { opens: Math.min(v.opens, MAX_OPENS), firstSeenAt: typeof v.firstSeenAt === "string" ? v.firstSeenAt : "", lastSeenAt: typeof v.lastSeenAt === "string" ? v.lastSeenAt : "" };
}

/** mergeToolUsage(stored, report, exam, nowIso) → the new stored record { [toolId]: { opens, firstSeenAt, lastSeenAt } } (null when empty).
 *  `report` comes from normalizeToolUsage. A count only rises; the times are the server's. Tools no longer offered are dropped. */
function mergeToolUsage(stored, report, exam, nowIso) {
  const now = typeof nowIso === "string" && nowIso ? nowIso : new Date().toISOString();
  const prev = isObj(stored) ? stored : {};
  const next = isObj(report) ? report : {};
  const out = {};
  for (const id of offeredToolIds(exam)) {
    const before = own(prev, id) ? storedEntry(prev[id]) : null;
    const reported = own(next, id) ? next[id] : 0;
    if (!before && !reported) continue;
    if (!before) { setOwn(out, id, { opens: reported, firstSeenAt: now, lastSeenAt: now }); continue; }
    setOwn(out, id, reported > before.opens ? { opens: reported, firstSeenAt: before.firstSeenAt || now, lastSeenAt: now } : before);
  }
  return Object.keys(out).length ? out : null;
}

/** Applies a report to the submission's draft record (`draftToolUsage`). An absent report leaves the record exactly as it is. */
function draftToolUsagePatch(doc, rawReport, exam, nowIso) {
  if (rawReport === undefined) return;
  const merged = mergeToolUsage(doc.draftToolUsage, normalizeToolUsage(rawReport, exam), exam, nowIso);
  if (merged) doc.draftToolUsage = merged; else delete doc.draftToolUsage;
}

/** The finalized attempt's record: the draft record merged with the finalizing request's own report. Null when nothing was used. */
function attemptToolUsage(doc, rawReport, exam, nowIso) {
  return mergeToolUsage(doc && doc.draftToolUsage, rawReport === undefined ? {} : normalizeToolUsage(rawReport, exam), exam, nowIso);
}

/** The student's own counts for resuming a draft on another device or after a reload ({} when there are none). Counts only. */
function draftToolUsageCounts(doc) {
  const r = doc && isObj(doc.draftToolUsage) ? doc.draftToolUsage : null;
  const out = {};
  if (!r) return out;
  for (const k of Object.keys(r)) { const e = storedEntry(r[k]); if (e) setOwn(out, k, e.opens); }
  return out;
}

/** The teacher's view of a finalized attempt: [{ toolId, opens, firstSeenAt, lastSeenAt }] in the stored order ([] when none). */
function toolUsageForTeacher(attempt) {
  const r = attempt && isObj(attempt.toolUsage) ? attempt.toolUsage : null;
  if (!r) return [];
  const out = [];
  for (const k of Object.keys(r)) { const e = storedEntry(r[k]); if (e) out.push({ toolId: k, ...e }); }
  return out;
}

module.exports = { MAX_OPENS, offeredToolIds, normalizeToolUsage, mergeToolUsage, draftToolUsagePatch, attemptToolUsage, draftToolUsageCounts, toolUsageForTeacher };
