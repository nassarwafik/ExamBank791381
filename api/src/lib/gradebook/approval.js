// Class gradebook GB6 (docs/enterprise-class-gradebook-gb.md §4.8) — approving a part («اعتماد الجزء») and the final mark. PURE: the route
// computes the gradebook (compute.js) and reads the sources; this module decides whether a part may be approved, freezes what is
// approved, and compares it later with what the gradebook shows now.
//
// Owner decisions (GB6, 2026-11-18): approval is PER PART; an approved part is LOCKED (its columns and its marks), and reopening it is an
// explicit, recorded step with a reason; students see APPROVED parts only (their own items and part mark; the final once it is approved).
//
// Safety (AGENTS.md §10): a part is approved only when it is COMPLETE — every student's every cell is a mark («graded»), the teacher's
// «صفر» or «معفى»; never a result awaiting review, a missing submission, a missing source, an unclassified or a withheld cell — and only
// when every included assignment's results are already released to students. What students see is the SNAPSHOT frozen at approval,
// never a live value: a mark that changes afterwards (a regrade, a new student) is reported to the teacher as drift, and reaches students
// only through reopen → approve again.
const { roundForDisplay } = require("./compute");
const { sumsTo100 } = require("./scheme");
const { resultsReleased } = require("../results-release");

const SCHEMA_VERSION = 1;
const FINAL_CELL_STATES = new Set(["graded", "zero", "excused"]);
const HISTORY_LIMIT = 100;
const REASON_MIN = 3, REASON_MAX = 300;
const EPS = 1e-9;
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

const ISSUE_MESSAGES = Object.freeze({
  NO_STUDENTS: "لا يوجد طلاب في الصف.",
  PART_SUM: "أوزان عناصر الجزء لا تساوي 100%.",
  PART_INCOMPLETE: "يوجد خلايا غير مكتملة (بانتظار التصحيح، أو لم يُسلَّم، أو مصدر محذوف). سجّل علامة أو قرارًا «معفى» / «صفر» لكل خلية.",
  PART_WITHHELD: "الجزء يحوي أعمدة مشاريع لا تملك صلاحية رؤيتها.",
  RESULTS_NOT_RELEASED: "نتائج بعض واجبات الجزء لم تُنشر للطلاب بعد.",
  SCHEME_DRAFT: "مخطط العلامات مسودة: مجموع الأوزان لا يساوي 100%.",
  PARTS_NOT_APPROVED: "يجب اعتماد كل الأجزاء أولًا.",
  PART_DRIFT: "تغيّرت علامات جزء معتمد بعد اعتماده؛ أعد فتحه واعتمده من جديد.",
  FINAL_INCOMPLETE: "العلامة النهائية غير مكتملة لبعض الطلاب."
});
const issue = (code, extra = {}) => ({ code, message: ISSUE_MESSAGES[code], ...extra });

/** An empty approvals document. */
const emptyApprovals = classId => ({ schemaVersion: SCHEMA_VERSION, classId, revision: 0, parts: {}, final: null, history: [] });

/** A stored approvals document re-checked before use: the document, or null when it is corrupt (the caller fails closed). */
function readApprovals(doc, classId) {
  if (doc === null || doc === undefined) return emptyApprovals(classId);
  if (!isPlainObject(doc) || !isPlainObject(doc.parts) || (doc.final !== null && doc.final !== undefined && !isPlainObject(doc.final))) return null;
  for (const p of Object.values(doc.parts)) if (!isPlainObject(p) || !isPlainObject(p.snapshot) || !Array.isArray(p.snapshot.items) || !isPlainObject(p.snapshot.students)) return null;
  if (doc.final && !isPlainObject(doc.final.snapshot)) return null;
  return { ...doc, final: doc.final || null, history: Array.isArray(doc.history) ? doc.history : [] };
}

/** A reopen reason: cleaned text of REASON_MIN..REASON_MAX characters; else null. */
function normalizeReason(value, cleanText) {
  if (typeof value !== "string") return null;
  const text = cleanText(value);
  const n = Array.from(text).length;
  return n >= REASON_MIN && n <= REASON_MAX ? text : null;
}

/** The structure a part's approval locks: its items' ids, weights and sources (a manual column's maximum included). */
const lockedItems = category => category.items.map(i => ({ itemId: i.itemId, weight: i.weight, source: i.source }));
const sameStructure = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether one part may be approved now.
 *   ctx = { scheme, result (computeGradebook), withheldItems: Set, assignmentDocs: Map, nowMs }
 * Returns { ready, issues: [{ code, message, … }] }.
 */
function partReadiness(categoryId, ctx) {
  const category = ctx.scheme.categories.find(c => c.categoryId === categoryId);
  if (!category) return { ready: false, issues: [issue("PART_SUM")] };
  const issues = [];
  if (!ctx.result.rows.length) issues.push(issue("NO_STUDENTS"));
  if (!sumsTo100(category.items.map(i => i.weight))) issues.push(issue("PART_SUM"));
  const withheld = category.items.filter(i => ctx.withheldItems.has(i.itemId)).map(i => i.itemId);
  if (withheld.length) issues.push(issue("PART_WITHHELD", { itemIds: withheld }));
  let cells = 0;
  const students = new Set();
  for (const row of ctx.result.rows) {
    for (const i of category.items) {
      if (ctx.withheldItems.has(i.itemId)) continue;
      const cell = row.cells[i.itemId];
      if (!cell || !FINAL_CELL_STATES.has(cell.state)) { cells++; students.add(row.studentId); }
    }
  }
  if (cells) issues.push(issue("PART_INCOMPLETE", { cells, students: students.size }));
  const unreleased = category.items
    .filter(i => i.source.kind === "assignment")
    .filter(i => { const a = ctx.assignmentDocs.get(i.source.assignmentId); return !a || !resultsReleased(a, ctx.nowMs); })
    .map(i => i.itemId);
  if (unreleased.length) issues.push(issue("RESULTS_NOT_RELEASED", { itemIds: unreleased }));
  return { ready: !issues.length, issues };
}

/** What a part's approval freezes: the part as the teacher sees it, and every student's cells and part mark (full precision). */
function partSnapshot(categoryId, ctx, titles) {
  const category = ctx.scheme.categories.find(c => c.categoryId === categoryId);
  const students = {};
  for (const row of ctx.result.rows) {
    const cells = {};
    for (const i of category.items) {
      const cell = row.cells[i.itemId];
      cells[i.itemId] = cell.percent === undefined ? { state: cell.state } : { state: cell.state, percent: cell.percent };
    }
    const cat = row.categories[categoryId];
    students[row.studentId] = { value: cat.value, ...(cat.allExcused ? { allExcused: true } : {}), cells };
  }
  return {
    categoryId, title: String(category.title || ""), weight: category.weight,
    items: lockedItems(category).map(i => ({ ...i, title: titles.get(i.itemId) || "" })),
    students
  };
}

const sameNumber = (a, b) => (a === null || a === undefined || b === null || b === undefined ? (a ?? null) === (b ?? null) : Math.abs(a - b) <= EPS);

/**
 * How the gradebook now differs from an approved part: { structure: the part's columns changed, students: rows that differ }. A part
 * with a column this teacher may not see (withheld) cannot be compared: { structure, students: null } — unknown, never «unchanged».
 */
function partDrift(snapshot, ctx) {
  const category = ctx.scheme.categories.find(c => c.categoryId === snapshot.categoryId);
  const structure = !category || !sameStructure(lockedItems(category), snapshot.items.map(({ itemId, weight, source }) => ({ itemId, weight, source })));
  if (!structure && snapshot.items.some(i => ctx.withheldItems.has(i.itemId))) return { structure, students: null };
  let students = 0;
  const live = new Set();
  for (const row of ctx.result.rows) {
    live.add(row.studentId);
    const frozen = snapshot.students[row.studentId];
    if (!frozen) { students++; continue; }                       // a student who joined the class after the approval
    if (structure) { students++; continue; }
    // same columns (checked above) and same cells ⇒ the same part mark: it is computed from them alone
    let differs = false;
    for (const i of snapshot.items) {
      const now = row.cells[i.itemId], then = frozen.cells && frozen.cells[i.itemId];
      if (!now || !then || now.state !== then.state || !sameNumber(now.percent, then.percent)) differs = true;
    }
    if (differs) students++;
  }
  for (const id of Object.keys(snapshot.students)) if (!live.has(id)) students++;   // a student who left the class
  return { structure, students };
}

/** Whether the final mark may be approved now: an active scheme, every part approved and unchanged, every final mark complete. */
function finalReadiness(ctx, approvals) {
  const issues = [];
  if (!ctx.result.rows.length) issues.push(issue("NO_STUDENTS"));
  if (ctx.result.status !== "active") issues.push(issue("SCHEME_DRAFT"));
  const notApproved = ctx.scheme.categories.filter(c => !approvals.parts[c.categoryId]).map(c => c.categoryId);
  if (notApproved.length) issues.push(issue("PARTS_NOT_APPROVED", { categoryIds: notApproved }));
  const withheld = ctx.result.columns.filter(col => ctx.withheldItems.has(col.itemId)).map(col => col.itemId);
  if (withheld.length) issues.push(issue("PART_WITHHELD", { itemIds: withheld }));
  const drifted = ctx.scheme.categories.filter(c => approvals.parts[c.categoryId]).filter(c => { const d = partDrift(approvals.parts[c.categoryId].snapshot, ctx); return d.structure || d.students !== 0; }).map(c => c.categoryId);
  if (drifted.length) issues.push(issue("PART_DRIFT", { categoryIds: drifted }));
  const incomplete = ctx.result.rows.filter(r => r.final.status !== "complete" || r.final.value === null).length;
  if (incomplete) issues.push(issue("FINAL_INCOMPLETE", { students: incomplete }));
  return { ready: !issues.length, issues };
}

function finalSnapshot(ctx) {
  const students = {};
  for (const row of ctx.result.rows) students[row.studentId] = { value: row.final.value, ...(row.final.adjusted ? { adjusted: true } : {}) };
  return { weights: Object.fromEntries(ctx.scheme.categories.map(c => [c.categoryId, c.weight])), students };
}

function finalDrift(snapshot, ctx) {
  const weights = Object.fromEntries(ctx.scheme.categories.map(c => [c.categoryId, c.weight]));
  const structure = JSON.stringify(weights) !== JSON.stringify(snapshot.weights);
  if (!structure && ctx.withheldItems.size) return { structure, students: null };     // a withheld column: unknown, never «unchanged»
  let students = 0;
  const live = new Set();
  for (const row of ctx.result.rows) {
    live.add(row.studentId);
    const frozen = snapshot.students[row.studentId];
    if (structure || !frozen || !sameNumber(row.final.value, frozen.value)) students++;
  }
  for (const id of Object.keys(snapshot.students)) if (!live.has(id)) students++;
  return { structure, students };
}

/** An entry of the approval history (kept in the document, bounded; the audit log keeps every one for 400 days). */
function withHistory(doc, entry) {
  return [...(doc.history || []), entry].slice(-HISTORY_LIMIT);
}

/**
 * What one student may see of a class's approvals: the approved parts (their own cells and part mark, rounded for display) whose
 * assignments' results are still released now, and the approved final mark when every part of it is shown. `withheldItems` is the set
 * of item ids whose results are not visible now (read by the route, fail closed).
 */
function studentApprovedView(approvals, studentId, withheldItems) {
  const parts = [];
  for (const [categoryId, part] of Object.entries(approvals.parts)) {
    const mine = part.snapshot.students[studentId];
    if (!mine || part.snapshot.items.some(i => withheldItems.has(i.itemId))) continue;
    parts.push({
      categoryId, title: part.snapshot.title, weight: part.snapshot.weight, approvedAt: String(part.approvedAt || ""),
      value: mine.value, display: roundForDisplay(mine.value), ...(mine.allExcused ? { allExcused: true } : {}),
      items: part.snapshot.items.map(i => {
        const cell = (mine.cells && mine.cells[i.itemId]) || { state: "unclassified" };
        return { itemId: i.itemId, title: i.title, weight: i.weight, kind: i.source.kind, state: cell.state, display: cell.percent === undefined ? null : roundForDisplay(cell.percent) };
      })
    });
  }
  let final = null;
  if (approvals.final) {      // shown only when every part it combines is shown to this student
    const mine = approvals.final.snapshot.students[studentId];
    const covered = Object.keys(approvals.final.snapshot.weights || {}).every(id => parts.some(p => p.categoryId === id));
    if (mine && covered) final = { value: mine.value, display: roundForDisplay(mine.value), approvedAt: String(approvals.final.approvedAt || "") };
  }
  return { parts, final };
}

module.exports = {
  SCHEMA_VERSION, HISTORY_LIMIT, REASON_MIN, REASON_MAX, ISSUE_MESSAGES,
  emptyApprovals, readApprovals, normalizeReason, lockedItems, sameStructure,
  partReadiness, partSnapshot, partDrift, finalReadiness, finalSnapshot, finalDrift, withHistory, studentApprovedView
};
