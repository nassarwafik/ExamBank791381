// Class gradebook GB1 (docs/enterprise-class-gradebook-gb.md §4.3, §4.7) — the ONE computation of a class's gradebook. PURE: the route
// reads the scheme, the teacher's entries, the roster and each item's evidence; this module only combines them. The UI displays what it
// returns and never computes a grade.
//
// Each cell is resolved IN THIS ORDER:
//   1. teacher decision "excused"  → excused        (not counted: its weight is shared among the category's other counted items)
//   2. teacher decision "zero"     → zero           (counted as 0 %; the evidence under it is returned too, so a conflict shows)
//   3. manual column, typed score  → graded
//   4–6. source evidence "final"   → graded         (assignment: latest final attempt; project: the project grade)
//   5. source evidence "pending"   → pending        (not counted; the final becomes provisional)
//   7. nothing                     → missing «—»    (not counted; the final becomes incomplete) — NEVER a zero
//   8. source gone                 → missingSource  (not counted; the final becomes incomplete) — NEVER a zero
//   9. anything else               → unclassified   (not counted; the final becomes incomplete) — fail closed
//
//   category = Σ p·w over counted items / Σ w over counted items          (no counted item ⇒ no value)
//   final    = Σ category·W over categories with a value / Σ W of those   (rescaled ⇒ adjusted: true)
//
// Weights are never rescaled to fix a sum (invariant 3): a category whose item weights do not add up to 100 has no value, and a scheme
// whose sums are not all 100 has no final mark. Values are full precision; roundForDisplay gives the one decimal the UI shows (D6).
const { isSafeId } = require("../roster-input");
const { normalizeWeight, sumsTo100, SOURCE_KINDS } = require("./scheme");
const { manualEvidence } = require("./evidence");

const DECISIONS = Object.freeze(["excused", "zero"]);
const COUNTED = new Set(["zero", "graded"]);
const INCOMPLETE = new Set(["missing", "missingSource", "unclassified"]);
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/** The one decimal the gradebook shows (D6). null stays null. */
function roundForDisplay(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 10) / 10;
}

/** A stored scheme re-checked before it is used (a corrupt document is refused, never half-computed). */
function structurallyValid(scheme) {
  if (!isPlainObject(scheme) || !Array.isArray(scheme.categories) || !scheme.categories.length) return false;
  const ids = new Set();
  for (const c of scheme.categories) {
    if (!isPlainObject(c) || !isSafeId(c.categoryId) || normalizeWeight(c.weight) === null || !Array.isArray(c.items) || !c.items.length) return false;
    for (const i of c.items) {
      if (!isPlainObject(i) || !isSafeId(i.itemId) || ids.has(i.itemId) || normalizeWeight(i.weight) === null) return false;
      if (!isPlainObject(i.source) || !SOURCE_KINDS.includes(i.source.kind)) return false;
      ids.add(i.itemId);
    }
  }
  return true;
}

/** The teacher's entry for one cell, classified: { decision } | { score } | null (no entry) | "corrupt". */
function readEntry(entry) {
  if (entry === undefined || entry === null) return null;
  if (!isPlainObject(entry)) return "corrupt";
  const hasDecision = entry.decision !== undefined, hasScore = entry.score !== undefined;
  if (hasDecision && !hasScore && DECISIONS.includes(entry.decision)) return { decision: entry.decision };
  if (hasScore && !hasDecision) return { score: entry.score };
  return "corrupt";
}

/** The evidence of a cell from its source, the teacher's entry aside. */
function sourceEvidence(item, studentId, entry, evidenceOf) {
  if (item.source.kind === "manual") return manualEvidence(entry && entry !== "corrupt" ? entry.score : undefined, item.source.maxScore);
  const e = evidenceOf(item, studentId);
  if (!isPlainObject(e)) return { kind: "unclassified" };
  if (e.kind === "final") return typeof e.percent === "number" && Number.isFinite(e.percent) && e.percent >= 0 && e.percent <= 100 ? e : { kind: "unclassified" };
  if (e.kind === "pending" || e.kind === "none" || e.kind === "missingSource") return e;
  return { kind: "unclassified" };
}

function resolveCell(item, studentId, rawEntry, evidenceOf) {
  const entry = readEntry(rawEntry);
  if (entry === "corrupt") return { state: "unclassified" };
  if (entry && entry.score !== undefined && item.source.kind !== "manual") return { state: "unclassified" };   // a typed score belongs to a manual column only
  if (entry && entry.decision === "excused") return { state: "excused" };
  if (entry && entry.decision === "zero") {
    const under = sourceEvidence(item, studentId, null, evidenceOf);
    const cell = { state: "zero", percent: 0 };
    if (under.kind === "final" || under.kind === "pending") cell.evidence = under.kind === "final" ? { kind: "final", percent: under.percent } : { kind: "pending" };
    return cell;
  }
  const e = sourceEvidence(item, studentId, entry, evidenceOf);
  if (e.kind === "final") return { state: "graded", percent: e.percent };
  if (e.kind === "pending") return { state: "pending" };
  if (e.kind === "none") return { state: "missing" };
  if (e.kind === "missingSource") return { state: "missingSource" };
  return { state: "unclassified" };
}

/**
 * Compute a class's gradebook.
 *   scheme      — a scheme as validateScheme returns it (re-checked here)
 *   studentIds  — the class roster, in display order
 *   entries     — { [itemId]: { [studentId]: { decision: "excused" | "zero" } | { score } } } (the teacher's entries; may be {})
 *   evidenceOf  — (item, studentId) => evidence (evidence.js) for assignment and project items
 * Returns { ok: true, status: "active" | "draft", columns, rows, warnings } or { ok: false, code: "SCHEME_INVALID" }.
 */
function computeGradebook({ scheme, studentIds, entries, evidenceOf }) {
  if (!structurallyValid(scheme) || !Array.isArray(studentIds) || typeof evidenceOf !== "function") return { ok: false, code: "SCHEME_INVALID" };
  const cellsOf = isPlainObject(entries) ? entries : {};
  const categoryComplete = new Map(scheme.categories.map(c => [c.categoryId, sumsTo100(c.items.map(i => i.weight))]));
  const schemeActive = sumsTo100(scheme.categories.map(c => c.weight)) && [...categoryComplete.values()].every(Boolean);
  const columns = [];
  for (const c of scheme.categories) for (const i of c.items) columns.push({ itemId: i.itemId, categoryId: c.categoryId, weight: i.weight, source: i.source });
  const missingSourceItems = new Set();
  const seen = new Set();
  const rows = [];
  for (const studentId of studentIds) {
    if (typeof studentId !== "string" || seen.has(studentId)) continue;
    seen.add(studentId);
    const cells = {}, categories = {};
    let anyIncomplete = false, anyPending = false;
    for (const c of scheme.categories) {
      let sumW = 0, sumPW = 0, excused = 0;
      for (const i of c.items) {
        const byStudent = isPlainObject(cellsOf[i.itemId]) ? cellsOf[i.itemId] : {};
        const cell = resolveCell(i, studentId, Object.prototype.hasOwnProperty.call(byStudent, studentId) ? byStudent[studentId] : undefined, evidenceOf);
        cells[i.itemId] = cell;
        if (cell.state === "missingSource") missingSourceItems.add(i.itemId);
        if (cell.state === "excused") excused++;
        if (INCOMPLETE.has(cell.state)) anyIncomplete = true;
        if (cell.state === "pending") anyPending = true;
        if (COUNTED.has(cell.state)) { sumW += i.weight; sumPW += cell.percent * i.weight; }
      }
      const complete = categoryComplete.get(c.categoryId);
      const value = complete && sumW > 0 ? sumPW / sumW : null;
      categories[c.categoryId] = { value, ...(complete ? {} : { draft: true }), ...(excused === c.items.length ? { allExcused: true } : {}) };
    }
    let final;
    if (!schemeActive) final = { value: null, status: "draft" };
    else {
      let sumW = 0, sumVW = 0, withoutValue = 0;
      for (const c of scheme.categories) {
        const v = categories[c.categoryId].value;
        if (v !== null) { sumW += c.weight; sumVW += v * c.weight; } else withoutValue++;
      }
      const status = anyIncomplete ? "incomplete" : anyPending ? "provisional" : "complete";
      final = sumW > 0 ? { value: sumVW / sumW, status, ...(withoutValue ? { adjusted: true } : {}) } : { value: null, status };
    }
    rows.push({ studentId, cells, categories, final });
  }
  const warnings = [...missingSourceItems].map(itemId => ({ itemId, code: "MISSING_SOURCE" }));
  return { ok: true, status: schemeActive ? "active" : "draft", columns, rows, warnings };
}

module.exports = { computeGradebook, roundForDisplay, DECISIONS };
