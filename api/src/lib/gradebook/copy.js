// Class gradebook GB8 (docs/enterprise-class-gradebook-gb.md §4.9) — «نسخ من صف آخر»: a proposal of another class's scheme for this
// class. PURE: the route reads both classes and their assignments; this module maps the source scheme onto the target class.
//
// Owner decisions (GB8, 2026-11-21): the teacher copies from one of their classes (no stored templates), and an assignment column is
// matched to the target class's assignment made from the SAME EXAM (`sourceExamId`).
//   - parts (titles, weights) and manual columns (title, maximum) are copied as they are;
//   - an assignment column maps to the ONE reportable target assignment with the same non-empty sourceExamId; none, several, or a source
//     assignment that is gone → the column is not copied and is listed (NO_MATCH / AMBIGUOUS / SOURCE_MISSING / DUPLICATE);
//   - a project column is copied only when the target class has that project and the teacher may see projects;
//   - nothing is rescaled (invariant 3): a part that loses a column keeps the other weights, so it is a draft until the teacher adds
//     the replacement — never a silent redistribution.
// The proposal carries no ids: the page gives every part and column a NEW id, so a copied column never inherits marks stored under
// an id of the target's older scheme.
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

const REASONS = Object.freeze({
  NO_MATCH: "لا يوجد في هذا الصف واجب من الامتحان نفسه.",
  AMBIGUOUS: "يوجد في هذا الصف أكثر من واجب من الامتحان نفسه؛ اختر أحدها.",
  SOURCE_MISSING: "الواجب في الصف المصدر لم يعد موجودًا.",
  DUPLICATE: "الواجب المطابق مستخدم في عمود آخر من المخطط.",
  PROJECT_NOT_IN_CLASS: "المشروع غير مفعّل في هذا الصف.",
  WITHHELD: "أعمدة المشاريع تحتاج صلاحية «رؤية متابعة المشاريع»."
});

/**
 * ctx = {
 *   scheme:            the source class's stored scheme
 *   sourceAssignments: Map(assignmentId → document | undefined)   the source scheme's assignments
 *   targetAssignments: [document]                                  the target class's reportable assignments
 *   targetProjects:    Set(projectCode)                            the target class's projects
 *   projectsAllowed:   boolean
 * }
 * Returns { categories: [{ title, weight, items: [{ weight, source, title }] }], unmatched: [{ category, title, weight, kind, code, reason, candidates? }], copied }.
 */
function proposeCopy(ctx) {
  const byExam = new Map();
  for (const a of ctx.targetAssignments) {
    const exam = String(a.sourceExamId || "");
    if (!exam) continue;
    if (!byExam.has(exam)) byExam.set(exam, []);
    byExam.get(exam).push(a);
  }
  const used = new Set();
  const unmatched = [];
  let copied = 0;
  const categories = (Array.isArray(ctx.scheme.categories) ? ctx.scheme.categories : []).filter(isPlainObject).map(cat => {
    const items = [];
    for (const item of Array.isArray(cat.items) ? cat.items : []) {
      if (!isPlainObject(item) || !isPlainObject(item.source)) continue;
      const src = item.source;
      const miss = (code, title, extra = {}) => unmatched.push({ category: String(cat.title || ""), title, weight: item.weight, kind: src.kind, code, reason: REASONS[code], ...extra });
      if (src.kind === "manual") {
        items.push({ weight: item.weight, source: { kind: "manual", title: src.title, maxScore: src.maxScore }, title: String(src.title || "") });
        copied++;
      } else if (src.kind === "assignment") {
        const a = ctx.sourceAssignments.get(src.assignmentId);
        if (!a) { miss("SOURCE_MISSING", ""); continue; }
        const title = String(a.title || "");
        const exam = String(a.sourceExamId || "");
        const matches = exam ? byExam.get(exam) || [] : [];
        if (!matches.length) { miss("NO_MATCH", title); continue; }
        if (matches.length > 1) { miss("AMBIGUOUS", title, { candidates: matches.map(m => String(m.title || "")) }); continue; }
        const target = matches[0];
        if (used.has(target.assignmentId)) { miss("DUPLICATE", title); continue; }
        used.add(target.assignmentId);
        items.push({ weight: item.weight, source: { kind: "assignment", assignmentId: String(target.assignmentId) }, title: String(target.title || "") });
        copied++;
      } else if (src.kind === "project") {
        const code = String(src.projectCode || "");
        if (!ctx.projectsAllowed) { miss("WITHHELD", ""); continue; }
        if (!ctx.targetProjects.has(code)) { miss("PROJECT_NOT_IN_CLASS", code); continue; }
        items.push({ weight: item.weight, source: { kind: "project", projectCode: code }, title: code });
        copied++;
      }
    }
    return { title: String(cat.title || ""), weight: cat.weight, items };
  });
  return { categories, unmatched, copied };
}

module.exports = { proposeCopy, REASONS };
