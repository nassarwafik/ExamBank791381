// Phase 21Q — quality checks on a composed exam, computed by CODE (no model judgement). They are WARNINGS shown to the teacher in the
// composer verdict before «فتح في المحرر»: they never block, never change a question and never grade anything. Each one names the questions
// it concerns so the teacher can fix them. The checks look at what a student could exploit or what the teacher asked for:
//   • ANSWER POSITION: the correct option of the multiple-choice questions sits at the same position too often (guessable);
//   • LONGEST OPTION: the correct option is the strictly longest one too often (a classic give-away);
//   • ANSWER LEAK: the stem already contains the answer (the correct option, the model answer or a blank's word);
//   • TRUE / FALSE BALANCE: every true/false question has the same answer;
//   • NEAR-DUPLICATE STEMS: two questions say almost the same thing (exact duplicates are already reported);
//   • MARKS CONCENTRATION: one question carries a large share of the exam's marks;
//   • DIFFICULTY: the drafted questions' difficulty drifted from the requested level or profile (the plan check covers only the plan).
// Composite child parts are judged like questions (a child MCQ is still a guessable MCQ).
import type { BuilderQuestion, StructuredExam } from "../examTypes";
import type { ComposerIssue } from "./composerLimits";
import type { AiExamIntentV1 } from "./composerIntent";

type Rec = Record<string, unknown>;
export const QUALITY_LIMITS = Object.freeze({
  minMcq: 4, positionShare: 0.8, longestShare: 0.75, minTf: 4, nearDuplicate: 0.8, minTokens: 5, leakChars: 4,
  minQuestionsForConcentration: 4, concentrationShare: 0.4, difficultyLevelShare: 0.5, profileTolerance: 20
});
const Q = QUALITY_LIMITS;

const norm = (s: unknown) => String(s ?? "").replace(/[ً-ٰٟـ]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const tokens = (s: unknown) => new Set(norm(s).split(" ").filter(t => t.length >= 2));
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n / (a.size + b.size - n || 1); };
/** `needle` appears in `hay` as a whole run of words (never inside a longer word). */
const containsWords = (hay: string, needle: string) => needle.length > 0 && (" " + hay + " ").includes(" " + needle + " ");
/** Like containsWords, also accepting a one-letter Arabic proclitic (و ف ب ل ك) glued to the word: «الشبكة والنقل» names both options. */
const mentions = (hay: string, needle: string) => containsWords(hay, needle) || ["و", "ف", "ب", "ل", "ك"].some(p => containsWords(hay, p + needle));

type Unit = { id: string; type: string; text: string; node: Rec; marks: number };
/** Every gradable unit: each question, and each composite child part (ids "question::part"). */
function units(exam: StructuredExam): Unit[] {
  const out: Unit[] = [];
  for (const s of exam.sections || []) for (const q of (s.questions || []) as BuilderQuestion[]) {
    const r = q as unknown as Rec;
    if (q.presentationType === "composite") {
      for (const g of (((r.composite as Rec | undefined)?.groups as Rec[] | undefined) ?? [])) for (const p of ((g.parts as Rec[] | undefined) ?? []))
        out.push({ id: q.examQuestionId, type: String(p.type), text: String(p.text ?? ""), node: p, marks: Number(p.marks) || 0 });
    } else out.push({ id: q.examQuestionId, type: q.presentationType, text: String(q.text ?? ""), node: r, marks: Number(q.marks) || 0 });
  }
  return out;
}
const optionTexts = (n: Rec) => (Array.isArray(n.options) ? (n.options as Rec[]).map(o => String((o && typeof o === "object" ? o.text : o) ?? "")) : []);
const correctIndex = (n: Rec) => { const a = n.answer as Rec | undefined; const i = a && typeof a.correctOptionIndex === "number" ? a.correctOptionIndex : -1; return Number.isInteger(i) ? i : -1; };

export function qualityWarnings(exam: StructuredExam, intent?: AiExamIntentV1 | null, difficultyOf?: (questionId: string) => string | undefined): ComposerIssue[] {
  const out: ComposerIssue[] = [];
  const all = units(exam);

  // ── multiple choice: position bias, longest-option give-away, leak ──
  const mcq = all.filter(u => u.type === "multipleChoice" && correctIndex(u.node) >= 0 && optionTexts(u.node).length >= 2);
  if (mcq.length >= Q.minMcq) {
    const byPos = new Map<number, Unit[]>();
    for (const u of mcq) { const i = correctIndex(u.node); byPos.set(i, [...(byPos.get(i) ?? []), u]); }
    const [pos, list] = [...byPos.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (list.length / mcq.length >= Q.positionShare) out.push({ code: "COMPOSER_ANSWER_POSITION_BIAS", message: "الإجابة الصحيحة في " + list.length + " من " + mcq.length + " أسئلة اختيار من متعدد هي الخيار رقم " + (pos + 1) + "؛ نوّع موضعها حتى لا تُخمَّن.", questionId: list[0].id });
    const longest = mcq.filter(u => { const o = optionTexts(u.node), c = correctIndex(u.node); return o.length >= 3 && o.every((t, i) => i === c || t.trim().length < o[c].trim().length); });
    if (longest.length / mcq.length >= Q.longestShare) out.push({ code: "COMPOSER_LONGEST_OPTION", message: "الإجابة الصحيحة هي الخيار الأطول في " + longest.length + " من " + mcq.length + " أسئلة اختيار من متعدد؛ وازن أطوال الخيارات حتى لا تكشف الإجابة.", questionId: longest[0].id });
  }
  for (const u of all) {
    const stem = norm(u.text);
    let leaked: string | null = null;
    if (u.type === "multipleChoice") {
      const o = optionTexts(u.node).map(norm), c = correctIndex(u.node);
      if (c >= 0 && o[c] && o[c].length >= Q.leakChars && containsWords(stem, o[c]) && !o.some((t, i) => i !== c && t && mentions(stem, t))) leaked = optionTexts(u.node)[c];
    } else if (u.type === "shortAnswer") {
      const a = String(((u.node.answer as Rec | undefined)?.text) ?? "");
      if (norm(a).length >= Q.leakChars && containsWords(stem, norm(a))) leaked = a;
    } else if (u.type === "fillBlank") {
      const w = ((u.node.fields as Rec[] | undefined) ?? []).map(f => String(f.correct ?? "")).find(c => norm(c).length >= Q.leakChars && containsWords(stem, norm(c)));
      if (w) leaked = w;
    }
    if (leaked !== null) out.push({ code: "COMPOSER_ANSWER_LEAK", message: "نص السؤال يحتوي الإجابة «" + leaked.slice(0, 60) + "»؛ أعد صياغته حتى لا يكشفها.", questionId: u.id });
  }

  // ── true / false balance ──
  const tf = all.filter(u => u.type === "trueFalse" && typeof (u.node.answer as Rec | undefined)?.correct === "boolean");
  if (tf.length >= Q.minTf && new Set(tf.map(u => (u.node.answer as Rec).correct)).size === 1)
    out.push({ code: "COMPOSER_TF_BALANCE", message: "إجابة كل أسئلة صح أو خطأ (" + tf.length + ") هي «" + ((tf[0].node.answer as Rec).correct ? "صح" : "خطأ") + "»؛ نوّعها حتى لا يجيب الطالب الإجابة نفسها في كل مرة.", questionId: tf[0].id });

  // ── near-duplicate stems (exact duplicates are COMPOSER_DUPLICATE_STEM) ──
  const stems = all.map(u => ({ u, t: tokens(u.text), n: norm(u.text) })).filter(x => x.t.size >= Q.minTokens);
  const flagged = new Set<string>();
  for (let i = 0; i < stems.length; i++) for (let j = i + 1; j < stems.length; j++) {
    const a = stems[i], b = stems[j];
    if (a.n === b.n || flagged.has(b.u.id + "|" + b.u.text)) continue;
    if (jaccard(a.t, b.t) >= Q.nearDuplicate) { flagged.add(b.u.id + "|" + b.u.text); out.push({ code: "COMPOSER_NEAR_DUPLICATE_STEM", message: "سؤالان متشابهان جدًا في الصياغة؛ غيّر أحدهما ليقيس شيئًا مختلفًا.", questionId: b.u.id }); }
  }

  // ── marks concentration (whole questions) ──
  const questions = (exam.sections || []).flatMap(s => (s.questions || []) as BuilderQuestion[]);
  const total = questions.reduce((n, q) => n + (Number(q.marks) || 0), 0);
  if (questions.length >= Q.minQuestionsForConcentration && total > 0) for (const q of questions) if ((Number(q.marks) || 0) / total > Q.concentrationShare)
    out.push({ code: "COMPOSER_MARKS_CONCENTRATION", message: "سؤال واحد يحمل " + Math.round((Number(q.marks) / total) * 100) + "% من علامة الامتحان؛ وزّع العلامات حتى لا يحسم سؤال واحد النتيجة.", questionId: q.examQuestionId });

  // ── difficulty of the drafted questions vs the request (by marks) ──
  if (intent && difficultyOf && total > 0) {
    const share: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    let known = 0;
    for (const q of questions) { const d = difficultyOf(q.examQuestionId); if (d && d in share) { share[d] += Number(q.marks) || 0; known += Number(q.marks) || 0; } }
    if (known > 0) {
      const pct = (d: string) => Math.round((share[d] / known) * 100);
      if (intent.difficultyProfile) {
        for (const d of ["easy", "medium", "hard"] as const) if (Math.abs(pct(d) - intent.difficultyProfile[d]) > Q.profileTolerance)
          out.push({ code: "COMPOSER_DIFFICULTY_DRIFT", message: "نسبة علامات الأسئلة «" + d + "» " + pct(d) + "% والمطلوب " + intent.difficultyProfile[d] + "%." });
      } else if (intent.difficulty !== "mixed" && share[intent.difficulty] / known < Q.difficultyLevelShare)
        out.push({ code: "COMPOSER_DIFFICULTY_DRIFT", message: "المطلوب امتحان «" + intent.difficulty + "»، لكن " + pct(intent.difficulty) + "% فقط من العلامات لأسئلة بهذا المستوى." });
    }
  }
  return out;
}
