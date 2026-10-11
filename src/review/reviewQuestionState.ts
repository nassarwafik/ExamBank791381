// UX-003 — the ONE derivation of a reviewed question's state for the teacher grading workspace, from the SERVER review
// projection only (GET /api/assignment-review): `autoGrade` (the attempt's canonical questionGrade after the shared rebuild —
// `manualReview` is false once a teacher override exists), `manualScore` (the stored override) and `studentAnswer`. Colour is
// never the carrier: every state has a text label and an icon. A pending manual review is NEVER shown as incorrect. A draft
// mark the teacher typed but has not saved is reported as a provisional state (`draft: true`) so the navigator can show what the
// save will produce without ever claiming it is saved.
export type ReviewState = "pending" | "correct" | "incorrect" | "partial" | "unanswered";
/** RF1 — the REVIEW MODE is reported separately from the answer outcome: who decided the mark and whether it is saved.
 *  pending = awaiting manual review · auto = automatically evaluated, no override · manual = a teacher override is STORED on the
 *  server · draft = the teacher typed a value that differs from what is stored (nothing saved yet). */
export type ReviewMode = "pending" | "auto" | "manual" | "draft";
export type ReviewFilter = "all" | "pending" | "manual" | "auto" | "draft" | "correct" | "incorrect" | "partial";

export type ReviewQuestionLike = {
  marks: number;
  autoGrade: { score?: number; maxMarks?: number; countedMaxMarks?: number; manualReview?: boolean } | null;
  manualScore: number | null;
  studentAnswer: unknown;
};

export type ReviewQuestionInfo = {
  state: ReviewState;
  /** Who decided the mark and whether it is saved (see ReviewMode). */
  mode: ReviewMode;
  /** A teacher mark (or rubric) is stored for the question on the server (mode === "manual", or "draft" over a stored one). */
  graded: boolean;
  /** The state reflects a typed, unsaved mark. */
  draft: boolean;
  /** The mark the state is derived from (draft → saved override → automatic). */
  effective: number;
  max: number;
  answered: boolean;
};

export const STATE_LABEL: Record<ReviewState, string> = {
  pending: "بانتظار التصحيح اليدوي",
  correct: "إجابة صحيحة",
  incorrect: "إجابة خاطئة",
  partial: "إجابة جزئية",
  unanswered: "لم يُجب الطالب"
};
export const STATE_ICON: Record<ReviewState, string> = { pending: "⏳", correct: "✓", incorrect: "✗", partial: "◐", unanswered: "—" };
export const MODE_LABEL: Record<ReviewMode, string> = {
  pending: "بانتظار المعلم",
  auto: "تصحيح آلي",
  manual: "تصحيح يدوي محفوظ",
  draft: "تعديل غير محفوظ"
};

export const REVIEW_FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "pending", label: "يحتاج إلى تصحيح يدوي" },
  { id: "manual", label: "تم تصحيحه يدويًا" },
  { id: "auto", label: "مُصحَّح آليًا" },
  { id: "draft", label: "تعديلات غير محفوظة" },
  { id: "correct", label: "إجابة صحيحة" },
  { id: "incorrect", label: "إجابة خاطئة" },
  { id: "partial", label: "إجابة جزئية" }
];

const EPS = 1e-9;

export function isAnswered(a: unknown): boolean {
  if (a === null || a === undefined) return false;
  if (typeof a === "string") return a.trim().length > 0;
  if (Array.isArray(a)) return a.some(isAnswered);
  if (typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (o.kind === "text") return isAnswered(o.value);
    if (o.kind === "choice") return Number.isInteger(Number(o.index));
    if (o.kind === "sequence" || o.kind === "fields" || o.kind === "table") return isAnswered(o.values);
    return Object.values(o).some(v => isAnswered(v));
  }
  return true;
}

/** `draftScore` is the raw text of the teacher's mark input ("" = untouched). */
export function reviewQuestionInfo(q: ReviewQuestionLike, draftScore?: string): ReviewQuestionInfo {
  const g = q.autoGrade;
  const max = Number(g?.countedMaxMarks ?? g?.maxMarks ?? q.marks ?? 0) || 0;
  const graded = q.manualScore !== null && q.manualScore !== undefined;
  const answered = isAnswered(q.studentAnswer);
  const raw = draftScore === undefined ? "" : String(draftScore).trim();
  const draft = raw !== "" && Number.isFinite(Number(raw));
  const effective = draft ? Math.min(max, Math.max(0, Number(raw))) : graded ? Number(q.manualScore) : Number(g?.score ?? 0);
  let state: ReviewState;
  if (!draft && g?.manualReview === true) state = "pending";
  else if (!draft && !graded && !answered) state = "unanswered";
  else if (max > 0 && effective >= max - EPS) state = "correct";
  else if (effective <= EPS) state = "incorrect";
  else state = "partial";
  const mode: ReviewMode = draft ? "draft" : state === "pending" ? "pending" : graded ? "manual" : "auto";
  return { state, mode, graded, draft, effective: Number(effective.toFixed(2)), max, answered };
}

export function matchesReviewFilter(info: ReviewQuestionInfo, filter: ReviewFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "pending": case "manual": case "auto": case "draft": return info.mode === filter;
    default: return info.state === filter;
  }
}

/** Mode counts partition the questions (pending + manual + auto + draft = all); outcome counts are exclusive of each other. */
export type ReviewCounts = Record<ReviewFilter, number>;
export function reviewCounts(infos: ReviewQuestionInfo[]): ReviewCounts {
  const c: ReviewCounts = { all: infos.length, pending: 0, manual: 0, auto: 0, draft: 0, correct: 0, incorrect: 0, partial: 0 };
  for (const i of infos) {
    c[i.mode]++;
    if (i.state === "correct" || i.state === "incorrect" || i.state === "partial") c[i.state]++;
  }
  return c;
}

/** RF1 — a reload of the SAME attempt (after a save, a coding regrade or a manual refresh) must never discard what the teacher typed:
 *  `fresh` is the server's new per-key state, `prevBaseline` what the inputs were loaded from before, `local` what they hold now.
 *  Every key whose local value differs from its previous baseline is an unsaved edit and is kept over the fresh value; everything
 *  else takes the server's value. Pure; the caller decides the new baseline (= fresh) so `dirty` stays true exactly for kept edits. */
export function mergeUnsavedEdits<T>(prevBaseline: Record<string, T>, local: Record<string, T>, fresh: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...fresh };
  for (const [k, v] of Object.entries(local)) {
    if (JSON.stringify(v) !== JSON.stringify(prevBaseline[k])) out[k] = v;
  }
  return out;
}

/** Index of the next question (after `from`, wrapping) that matches the filter; -1 when none. */
export function nextMatching(infos: ReviewQuestionInfo[], from: number, filter: ReviewFilter, direction: 1 | -1 = 1): number {
  const n = infos.length;
  for (let step = 1; step <= n; step++) {
    const i = ((from + direction * step) % n + n) % n;
    if (matchesReviewFilter(infos[i], filter)) return i;
  }
  return -1;
}

/** The correct option index of a legacy choice question, from the TEACHER-ONLY key the review projection carries (never from a
 *  student payload). `truefalse` keys may store `{ correct: boolean }` (index 0 = صحيح), exactly as the server grader reads them. */
export function correctOptionIndex(expectedAnswer: unknown, type: string): number | null {
  const k = expectedAnswer && typeof expectedAnswer === "object" ? expectedAnswer as Record<string, unknown> : null;
  if (!k) return null;
  const idx = k.correctOptionIndex;
  if (idx !== null && idx !== undefined && idx !== "" && Number.isInteger(Number(idx))) return Number(idx);
  if (type.toLowerCase() === "truefalse" && typeof k.correct === "boolean") return k.correct ? 0 : 1;
  return null;
}

/** Human text of a legacy choice key («الخيار 3 — الراوتر»); null when the key is not a choice key (the caller keeps its rendering). */
export function choiceKeyText(expectedAnswer: unknown, type: string, options: { text?: string; label?: string; value?: string }[] | undefined): string | null {
  const t = type.toLowerCase();
  if (t !== "multiplechoice" && t !== "truefalse") return null;
  const idx = correctOptionIndex(expectedAnswer, t);
  if (idx === null) return null;
  const opts = options && options.length ? options : t === "truefalse" ? [{ text: "صحيح" }, { text: "غير صحيح" }] : [];
  const o = opts[idx];
  const text = o ? String(o.text ?? o.label ?? o.value ?? "").trim() : "";
  return "الخيار " + (idx + 1) + (text ? " — " + text : "");
}
