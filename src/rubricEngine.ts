// Phase 19E — the domain-neutral RUBRIC engine. Pure (no React, no DOM, no network, no AI): compiled into the shared server build and
// reusable by any manually graded / hybrid question type.
//
// A rubric is ORDERED criteria; each criterion has a stable id, a title, an optional public description, a PRIVATE teacher guidance
// text, maxPoints > 0 and 2..8 levels { id, label, points, description }. Every criterion has a level at maxPoints and a level at 0,
// level points are unique, finite, non-negative, ≤ maxPoints and have at most 2 decimals. `allowCustomPoints` lets the teacher award
// bounded intermediate points on that criterion instead of a level. Nothing is ever repaired: a malformed rubric is refused.
//
// Scoring (server authority): awarded = Σ per-criterion award (a level's OWN points, or validated custom points), total = Σ maxPoints,
// score = round2(questionMarks × awarded / total). Every criterion must be awarded exactly once; unknown criteria / levels, forged
// totals and prototype keys are refused. Client arithmetic never counts.
export const RUBRIC_VERSION = 1;
export const RUBRIC_LIMITS = Object.freeze({ criteria: 12, levelsMin: 2, levels: 8, titleChars: 120, descriptionChars: 600, guidanceChars: 1000, levelLabelChars: 60, maxPoints: 100, totalPoints: 1000 });

export type RubricLevel = { id: string; label: string; points: number; description: string };
export type RubricCriterion = { id: string; title: string; description: string; maxPoints: number; allowCustomPoints: boolean; guidance: string; levels: RubricLevel[] };
export type RubricV1 = { v: 1; criteria: RubricCriterion[] };
export type RubricIssue = { code: string; message: string; severity: "error"; path?: string };
export type PublicRubric = { totalPoints: number; criteria: { title: string; description: string; maxPoints: number; levels: { label: string; points: number; description: string }[] }[] };
export type RubricAward = { levelId: string | null; points: number };
export type RubricAwards = Record<string, RubricAward>;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
export const isRubricId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v);
/** Finite, ≥ 0 and exactly representable with at most 2 decimals (no hidden rounding of authored or awarded points). */
const isPoints = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && Number(v.toFixed(2)) === v;
/** The project's canonical score rounding (assignment-grading / attempt rebuild): 2 decimals. */
export const round2 = (n: number) => Number(Number(n || 0).toFixed(2));
const err = (code: string, message: string, path?: string): RubricIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const text = (v: unknown, max: number, required: boolean) => typeof v === "string" && v.length <= max && (!required || v.trim() !== "");

const M = {
  invalid: "سلم التقييم غير صالح.",
  version: "إصدار سلم التقييم غير مدعوم.",
  count: "أضف من 1 إلى " + RUBRIC_LIMITS.criteria + " معيارًا في سلم التقييم.",
  criterion: "معيار في سلم التقييم يحتوي حقولًا غير معروفة أو غير صالحة.",
  id: "معرّف غير صالح (حرف إنجليزي أولًا، حتى 32 حرفًا).",
  dupId: "معرّف المعيار مكرر.",
  text: "نص المعيار أو المستوى فارغ أو أطول من المسموح.",
  points: "الدرجة القصوى للمعيار يجب أن تكون عددًا موجبًا حتى " + RUBRIC_LIMITS.maxPoints + " وبمنزلتين عشريتين على الأكثر.",
  levels: "لكل معيار من " + RUBRIC_LIMITS.levelsMin + " إلى " + RUBRIC_LIMITS.levels + " مستويات.",
  level: "مستوى أداء يحتوي حقولًا غير معروفة أو غير صالحة.",
  dupLevel: "معرّف المستوى مكرر داخل المعيار.",
  levelPoints: "درجة المستوى يجب أن تكون بين 0 والدرجة القصوى للمعيار وبمنزلتين عشريتين على الأكثر.",
  dupPoints: "لا يجوز أن يتساوى مستويان في الدرجة داخل المعيار نفسه.",
  maxMissing: "يجب أن يكون في كل معيار مستوى يساوي الدرجة القصوى.",
  zeroMissing: "يجب أن يكون في كل معيار مستوى بدرجة صفر.",
  total: "مجموع درجات سلم التقييم أكبر من المسموح (" + RUBRIC_LIMITS.totalPoints + ")."
};

export type RubricResult = { ok: true; rubric: RubricV1; issues: [] } | { ok: false; issues: RubricIssue[] };
/** Strict validation of a published / authored rubric; returns the canonical rubric (optional fields explicit) or every issue. */
export function validateRubric(raw: unknown, path = "rubric"): RubricResult {
  const issues: RubricIssue[] = [];
  if (!isPlain(raw) || !onlyKeys(raw, ["v", "criteria"])) return { ok: false, issues: [err("RUBRIC_INVALID", M.invalid, path)] };
  if (raw.v !== RUBRIC_VERSION) issues.push(err("RUBRIC_VERSION_UNSUPPORTED", M.version, path + ".v"));
  const list = raw.criteria;
  if (!Array.isArray(list) || list.length === 0 || list.length > RUBRIC_LIMITS.criteria) return { ok: false, issues: [...issues, err("RUBRIC_CRITERIA_COUNT", M.count, path + ".criteria")] };
  const criteria: RubricCriterion[] = [];
  const ids = new Set<string>();
  let total = 0;
  list.forEach((c, i) => {
    const p = path + ".criteria." + i;
    if (!isPlain(c) || !onlyKeys(c, ["id", "title", "description", "maxPoints", "allowCustomPoints", "guidance", "levels"])) { issues.push(err("RUBRIC_CRITERION_INVALID", M.criterion, p)); return; }
    const before = issues.length;
    if (!isRubricId(c.id)) issues.push(err("RUBRIC_ID_INVALID", M.id, p + ".id"));
    else if (ids.has(c.id)) issues.push(err("RUBRIC_ID_DUPLICATE", M.dupId, p + ".id"));
    else ids.add(c.id);
    if (!text(c.title, RUBRIC_LIMITS.titleChars, true)) issues.push(err("RUBRIC_TEXT_INVALID", M.text, p + ".title"));
    if (own(c, "description") && !text(c.description, RUBRIC_LIMITS.descriptionChars, false)) issues.push(err("RUBRIC_TEXT_INVALID", M.text, p + ".description"));
    if (own(c, "guidance") && !text(c.guidance, RUBRIC_LIMITS.guidanceChars, false)) issues.push(err("RUBRIC_TEXT_INVALID", M.text, p + ".guidance"));
    if (own(c, "allowCustomPoints") && typeof c.allowCustomPoints !== "boolean") issues.push(err("RUBRIC_CRITERION_INVALID", M.criterion, p + ".allowCustomPoints"));
    const max = c.maxPoints;
    const maxOk = isPoints(max) && max > 0 && max <= RUBRIC_LIMITS.maxPoints;
    if (!maxOk) issues.push(err("RUBRIC_POINTS_INVALID", M.points, p + ".maxPoints"));
    const levels: RubricLevel[] = [];
    const ll = c.levels;
    if (!Array.isArray(ll) || ll.length < RUBRIC_LIMITS.levelsMin || ll.length > RUBRIC_LIMITS.levels) issues.push(err("RUBRIC_LEVELS_COUNT", M.levels, p + ".levels"));
    else {
      const levelIds = new Set<string>(), points = new Set<number>();
      ll.forEach((l, j) => {
        const lp = p + ".levels." + j;
        if (!isPlain(l) || !onlyKeys(l, ["id", "label", "points", "description"])) { issues.push(err("RUBRIC_LEVEL_INVALID", M.level, lp)); return; }
        if (!isRubricId(l.id)) issues.push(err("RUBRIC_ID_INVALID", M.id, lp + ".id"));
        else if (levelIds.has(l.id)) issues.push(err("RUBRIC_LEVEL_ID_DUPLICATE", M.dupLevel, lp + ".id"));
        else levelIds.add(l.id);
        if (!text(l.label, RUBRIC_LIMITS.levelLabelChars, true)) issues.push(err("RUBRIC_TEXT_INVALID", M.text, lp + ".label"));
        if (own(l, "description") && !text(l.description, RUBRIC_LIMITS.descriptionChars, false)) issues.push(err("RUBRIC_TEXT_INVALID", M.text, lp + ".description"));
        if (!isPoints(l.points) || (maxOk && l.points > (max as number))) issues.push(err("RUBRIC_LEVEL_POINTS_INVALID", M.levelPoints, lp + ".points"));
        else if (points.has(l.points)) issues.push(err("RUBRIC_LEVEL_POINTS_DUPLICATE", M.dupPoints, lp + ".points"));
        else points.add(l.points);
        levels.push({ id: l.id as string, label: typeof l.label === "string" ? l.label : "", points: l.points as number, description: typeof l.description === "string" ? l.description : "" });
      });
      if (maxOk && !points.has(max as number)) issues.push(err("RUBRIC_LEVEL_MAX_MISSING", M.maxMissing, p + ".levels"));
      if (!points.has(0)) issues.push(err("RUBRIC_LEVEL_ZERO_MISSING", M.zeroMissing, p + ".levels"));
    }
    if (issues.length !== before) return;
    total += max as number;
    criteria.push({ id: c.id as string, title: c.title as string, description: typeof c.description === "string" ? c.description : "", maxPoints: max as number, allowCustomPoints: c.allowCustomPoints === true, guidance: typeof c.guidance === "string" ? c.guidance : "", levels });
  });
  if (!issues.length && total > RUBRIC_LIMITS.totalPoints) issues.push(err("RUBRIC_TOTAL_TOO_LARGE", M.total, path + ".criteria"));
  return issues.length ? { ok: false, issues } : { ok: true, rubric: { v: 1, criteria }, issues: [] };
}

/** Σ criterion maxPoints of a VALID rubric. */
export const rubricTotalPoints = (rubric: RubricV1) => round2(rubric.criteria.reduce((s, c) => s + c.maxPoints, 0));

/** The ONE student projection of a valid rubric: titles, public descriptions, max points, level labels / points / descriptions. */
export function projectRubricForStudent(rubric: RubricV1): PublicRubric {
  return {
    totalPoints: rubricTotalPoints(rubric),
    criteria: rubric.criteria.map(c => ({ title: c.title, description: c.description, maxPoints: c.maxPoints, levels: c.levels.map(l => ({ label: l.label, points: l.points, description: l.description })) }))
  };
}

export type RubricAwardsResult = { ok: true; awards: RubricAwards; awarded: number } | { ok: false; code: string; criterionId?: string };
/**
 * Binds a teacher's awards `{ criterionId: { levelId } | { points } }` to a VALID rubric. Every criterion exactly once; a level is looked
 * up in THAT criterion only; custom points only where `allowCustomPoints`, finite, 0..maxPoints, ≤ 2 decimals. Anything else refused.
 */
export function bindRubricAwards(rubric: RubricV1, raw: unknown): RubricAwardsResult {
  if (!isPlain(raw)) return { ok: false, code: "RUBRIC_AWARDS_INVALID" };
  const byId = new Map(rubric.criteria.map(c => [c.id, c]));
  for (const k of Object.keys(raw)) if (FORBIDDEN_KEYS.has(k) || !byId.has(k)) return { ok: false, code: "RUBRIC_AWARD_UNKNOWN_CRITERION", criterionId: k };
  const awards: RubricAwards = {};
  let awarded = 0;
  for (const c of rubric.criteria) {
    if (!own(raw, c.id)) return { ok: false, code: "RUBRIC_AWARD_INCOMPLETE", criterionId: c.id };
    const a = raw[c.id];
    if (isPlain(a) && onlyKeys(a, ["levelId"]) && typeof a.levelId === "string") {
      const level = c.levels.find(l => l.id === a.levelId);
      if (!level) return { ok: false, code: "RUBRIC_AWARD_UNKNOWN_LEVEL", criterionId: c.id };
      awards[c.id] = { levelId: level.id, points: level.points };
    } else if (isPlain(a) && onlyKeys(a, ["points"]) && own(a, "points")) {
      if (!c.allowCustomPoints) return { ok: false, code: "RUBRIC_AWARD_CUSTOM_NOT_ALLOWED", criterionId: c.id };
      if (!isPoints(a.points) || a.points > c.maxPoints) return { ok: false, code: "RUBRIC_AWARD_POINTS_INVALID", criterionId: c.id };
      awards[c.id] = { levelId: null, points: a.points };
    } else return { ok: false, code: "RUBRIC_AWARD_INVALID", criterionId: c.id };
    awarded += awards[c.id].points;
  }
  return { ok: true, awards, awarded: round2(awarded) };
}

export type RubricScoreResult = { ok: true; score: number; awarded: number; total: number; awards: RubricAwards } | { ok: false; code: string; criterionId?: string };
/** The official rubric score: validated published rubric + bound awards + valid question marks, else no score (never repaired). */
export function scoreRubric(input: { rubric: unknown; awards: unknown; maxMarks: unknown }): RubricScoreResult {
  const r = validateRubric(input.rubric);
  const maxMarks = input.maxMarks;
  if (!r.ok || typeof maxMarks !== "number" || !Number.isFinite(maxMarks) || maxMarks <= 0) return { ok: false, code: "RUBRIC_AUTHORITY_INVALID" };
  const b = bindRubricAwards(r.rubric, input.awards);
  if (!b.ok) return b;
  const total = rubricTotalPoints(r.rubric);
  const score = Math.min(maxMarks, Math.max(0, round2((maxMarks * b.awarded) / total)));
  return { ok: true, score, awarded: b.awarded, total, awards: b.awards };
}

const lvl = (id: string, label: string, points: number) => ({ id, label, points, description: "" });
/** A useful 10-point default (content 4, reasoning 3, organization 2, terminology 1); the question's marks scale it proportionally. */
export const defaultRubric = (): RubricV1 => ({
  v: 1,
  criteria: [
    { id: "content", title: "المحتوى والدقة", description: "صحة الأفكار والمفاهيم واكتمالها", maxPoints: 4, allowCustomPoints: false, guidance: "", levels: [lvl("excellent", "ممتاز", 4), lvl("good", "جيد", 3), lvl("fair", "مقبول", 2), lvl("weak", "ضعيف", 1), lvl("none", "غير موجود", 0)] },
    { id: "reasoning", title: "الشرح والتعليل", description: "وضوح التعليل وترابط الحجج", maxPoints: 3, allowCustomPoints: false, guidance: "", levels: [lvl("excellent", "ممتاز", 3), lvl("good", "جيد", 2), lvl("weak", "ضعيف", 1), lvl("none", "غير موجود", 0)] },
    { id: "organization", title: "التنظيم والوضوح", description: "تسلسل الأفكار ووضوح العرض", maxPoints: 2, allowCustomPoints: false, guidance: "", levels: [lvl("good", "واضح ومنظم", 2), lvl("fair", "مقبول", 1), lvl("none", "غير منظم", 0)] },
    { id: "terminology", title: "المصطلحات والدقة اللغوية", description: "استخدام المصطلحات الصحيحة", maxPoints: 1, allowCustomPoints: false, guidance: "", levels: [lvl("good", "دقيق", 1), lvl("none", "غير دقيق", 0)] }
  ]
});
