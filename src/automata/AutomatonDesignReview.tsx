import { useMemo } from "react";
import { readAutomatonConfig, type Machine } from "../learning/activities/automaton";
import { labLayout } from "../studentTools/automataLab";
import { Diagram } from "../learning/activities/automatonDiagram";
import { buildScene } from "../learning/activities/automatonScene";
import { issueText } from "../learning/activities/automatonDesign";
import { projectAutomatonDesignConfigForStudent } from "../automatonDesignQuestion";
import "../learning/activities/activities.css";
import "../learning/activities/automatonDesign.css";

/**
 * AUTO-A8b — the teacher's review of an automatonDesign@1 answer (lazy, teacher only): the student's machine and the reference machine,
 * drawn as the book draws them, and the grader's stored verdict in words — the shortest word on which the two machines disagree («الكلمة
 * abb يجب أن تُقبل، لكن آلة الطالب ترفضها») or the public rule of the question the student's machine broke. The verdict is the one the
 * server stored with the grade (`autoGrade.automatonFeedback`); nothing is re-judged here. AUTO-A9 — each machine is drawn where its
 * author put its states (the saved `layout`; the book's automatic layout for the rest).
 */
type Feedback = { counterexample?: { word: string; shouldAccept: boolean }; issue?: { code: string; state?: string; symbol?: string; max?: number } };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);

function drawable(kind: "DFA" | "NFA", alphabet: string[], raw: unknown): Machine | null {
  if (!isObj(raw)) return null;
  // the reference may be an NFA for a DFA question, and a student's machine may break a rule: both are DRAWN as non-deterministic
  const read = readAutomatonConfig({ automaton: { kind: "NFA", alphabet, states: raw.states, start: raw.start, accept: raw.accept, transitions: raw.transitions } });
  void kind;
  return read ? read.machine : null;
}
/** AUTO-A9 — a saved layout (cells of the machine's states) or none: the rest is the book's automatic layout (labLayout). */
const layoutOf = (raw: unknown): Record<string, [number, number]> | undefined => {
  if (!isObj(raw)) return undefined;
  const out: Record<string, [number, number]> = {};
  for (const [q, c] of Object.entries(raw)) if (Array.isArray(c) && c.length === 2 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 20)) out[q] = [c[0], c[1]];
  return out;
};
function Drawing({ title, machine, layout, ids, testId }: { title: string; machine: Machine | null; layout?: Record<string, [number, number]>; ids: string; testId: string }) {
  const scene = useMemo(() => (machine ? buildScene(machine, labLayout(machine, layout)) : null), [machine, layout]);
  return (
    <figure className="ad-review-figure" data-testid={testId}>
      <figcaption>{title}</figcaption>
      {machine && scene ? <Diagram machine={machine} scene={scene} step={{ active: [], used: [] }} ids={ids} live={false} /> : <p className="learning-autodesign-help">لا يمكن رسم هذه الآلة.</p>}
    </figure>
  );
}

export default function AutomatonDesignReview({ answer, answerKey, config, feedback }: { answer: unknown; answerKey: unknown; config: unknown; feedback?: unknown }) {
  const cfg = useMemo(() => projectAutomatonDesignConfigForStudent(config), [config]);
  if (!cfg) return <p className="vq-unavailable" role="note">تعذّر عرض قواعد السؤال.</p>;
  const mine = isObj(answer) && answer.kind === "automatonDesign" ? drawable(cfg.machine, cfg.alphabet, answer.machine) : null;
  const ref = isObj(answerKey) ? drawable(cfg.machine, cfg.alphabet, answerKey.reference) : null;
  const f = isObj(feedback) ? (feedback as Feedback) : null;
  const ce = f && isObj(f.counterexample) && typeof f.counterexample.word === "string" ? f.counterexample : null;
  const issue = f && isObj(f.issue) && typeof f.issue.code === "string" ? f.issue : null;
  return (
    <div className="ad-review" dir="rtl" data-testid="automaton-design-review">
      <p className="ad-review-rules">{cfg.machine === "DFA" ? "أوتومات منتهٍ حتمي" : "أوتومات منتهٍ غير حتمي"} · الأبجدية <span dir="ltr">{"{" + cfg.alphabet.join(", ") + "}"}</span> · حتى {cfg.maxStates} حالات{cfg.complete ? " · كامل" : ""}</p>
      {ce && (
        <p className="ad-review-verdict" data-testid="automaton-review-word">
          الكلمة <bdi dir="ltr" className="learning-autodesign-mono">{shown(ce.word)}</bdi>{" "}
          {ce.shouldAccept ? "يجب أن تُقبل، لكن آلة الطالب ترفضها" : "يجب أن تُرفض، لكن آلة الطالب تقبلها"} — أقصر كلمة تختلف فيها الآلتان.
        </p>
      )}
      {issue && <p className="ad-review-verdict" data-testid="automaton-review-issue">آلة الطالب تخالف قاعدة في السؤال: {issueText(issue)}</p>}
      <div className="ad-review-pair">
        {answer === undefined || answer === null ? <p className="learning-autodesign-help">لم يُسجّل الطالب آلة.</p> : <Drawing title="آلة الطالب" machine={mine} layout={isObj(answer) ? layoutOf(answer.layout) : undefined} ids="adr-mine" testId="automaton-review-student" />}
        <Drawing title="الآلة النموذجية" machine={ref} layout={isObj(answerKey) ? layoutOf(answerKey.layout) : undefined} ids="adr-ref" testId="automaton-review-reference" />
      </div>
    </div>
  );
}
