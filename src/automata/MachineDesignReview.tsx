import { useMemo } from "react";
import type { Machine } from "../learning/activities/automaton";
import { labLayout } from "../studentTools/automataLab";
import { Diagram } from "../learning/activities/automatonDiagram";
import { buildScene } from "../learning/activities/automatonScene";
import { issueText } from "../learning/activities/automatonDesign";
import { engineMachine, projectMachineDesignConfigForStudent, type MachineDesignConfigV1, type MachineDesignMachine } from "../machineDesignQuestion";
import "../learning/activities/activities.css";
import "../learning/activities/automatonDesign.css";

/**
 * AUTO-A11b — the teacher's review of a machineDesign@1 answer (lazy, teacher only): the student's push-down automaton / Turing machine and
 * the reference machine, drawn as the book draws them, and the grader's STORED verdict in words (`autoGrade.machineFeedback`; nothing is
 * re-judged here):
 *   • full marks — «agrees with the reference on every word (input) up to length N (K words)», with the owner's reminder that this is a
 *     check, not a proof (the teacher may change the mark, as any automatic mark);
 *   • the shortest separating word (a language) or the expected and given answers (a function);
 *   • a public rule the machine broke;
 *   • a Turing machine that did not halt — not a certain wrong: the teacher sets the mark.
 * Each machine is drawn where its author put its states (the saved `layout`), with the book's automatic layout for the rest.
 */
export type MachineFeedback = {
  agreesUpTo?: { length: number; words: number; skipped?: number };
  counterexample?: { word: string; shouldAccept?: boolean; expected?: string | null; got?: string | null };
  issue?: { code: string; max?: number };
  nohalt?: { word: string };
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shown = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);
const answerText = (a: string | null | undefined) => (a === null || a === undefined ? "لا جواب بين علامتي $" : "«" + (a === "" ? "ε" : a) + "»");

/** A machine shape as the book's engine reads it under the question's rules — or null (a machine that breaks a rule may not draw). */
function drawable(cfg: MachineDesignConfigV1, raw: unknown): Machine | null {
  if (!isObj(raw) || !Array.isArray(raw.states) || !Array.isArray(raw.accept) || !Array.isArray(raw.transitions) || typeof raw.start !== "string") return null;
  try { return engineMachine(raw as unknown as MachineDesignMachine, cfg); } catch { return null; }
}
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
      {machine && scene ? <Diagram machine={machine} scene={scene} step={{ active: [], used: [] }} ids={ids} live={false} /> : <p className="learning-autodesign-help">لا يمكن رسم هذه الآلة (تخالف قواعد السؤال).</p>}
    </figure>
  );
}

/** The stored verdict in one line for the teacher. */
export function machineVerdictText(f: MachineFeedback, compute: boolean): string | null {
  const a = f.agreesUpTo;
  if (a) return "تتفق آلة الطالب مع الآلة النموذجية على كل " + (compute ? "المدخلات" : "الكلمات") + " حتى الطول " + a.length + " (" + a.words + (compute ? " مدخلًا" : " كلمة") + ")"
    + (compute && a.skipped ? "، والكلمات الأخرى (" + a.skipped + ") ليست مدخلًا للدالة" : "") + ": العلامة كاملة. هذا فحص وليس برهانًا، ولك أن تعدّل العلامة.";
  const ce = f.counterexample;
  if (ce && ce.shouldAccept !== undefined) return "الكلمة " + shown(ce.word) + (ce.shouldAccept ? " يجب أن تُقبل، لكن آلة الطالب ترفضها" : " يجب أن تُرفض، لكن آلة الطالب تقبلها") + " — أقصر كلمة تختلف فيها الآلتان.";
  if (ce) return "على المدخل " + shown(ce.word) + " الجواب الصحيح " + answerText(ce.expected) + "، وآلة الطالب تعطي " + answerText(ce.got) + " — أقصر مدخل تختلف فيه الآلتان.";
  if (f.nohalt) return "آلة الطالب لم تتوقف على الكلمة " + shown(f.nohalt.word) + " (بعد ألف خطوة)، والآلة النموذجية تتوقف عليها. هذا ليس خطأً مؤكدًا: ضع العلامة بنفسك.";
  if (f.issue) return "آلة الطالب تخالف قاعدة في السؤال: " + issueText(f.issue);
  return null;
}

export default function MachineDesignReview({ answer, answerKey, config, feedback }: { answer: unknown; answerKey: unknown; config: unknown; feedback?: unknown }) {
  const cfg = useMemo(() => projectMachineDesignConfigForStudent(config), [config]);
  if (!cfg) return <p className="vq-unavailable" role="note">تعذّر عرض قواعد السؤال.</p>;
  const mine = isObj(answer) && answer.kind === "machineDesign" ? drawable(cfg, answer.machine) : null;
  const ref = isObj(answerKey) ? drawable(cfg, answerKey.reference) : null;
  const compute = cfg.mode === "compute";
  const line = isObj(feedback) ? machineVerdictText(feedback as MachineFeedback, compute) : null;
  const kind = cfg.machine === "PDA" ? "أوتومات مكدّس" : compute ? "آلة تورنغ تحسب دالة" : "آلة تورنغ تميّز لغة";
  return (
    <div className="ad-review" dir="rtl" data-testid="machine-design-review">
      <p className="ad-review-rules">{kind} · الأبجدية <span dir="ltr">{"{" + cfg.alphabet.join(", ") + "}"}</span> · حتى {cfg.maxStates} حالات · يُفحص حتى الطول {cfg.maxLength ?? 8}{cfg.leftEnd ? " · بداية الشريط ├" : ""}</p>
      {line && <p className="ad-review-verdict" data-testid="machine-review-verdict">{line}</p>}
      <div className="ad-review-pair">
        {answer === undefined || answer === null ? <p className="learning-autodesign-help">لم يُسجّل الطالب آلة.</p> : <Drawing title="آلة الطالب" machine={mine} layout={isObj(answer) ? layoutOf(answer.layout) : undefined} ids="mdr-mine" testId="machine-review-student" />}
        <Drawing title="الآلة النموذجية" machine={ref} layout={isObj(answerKey) ? layoutOf(answerKey.layout) : undefined} ids="mdr-ref" testId="machine-review-reference" />
      </div>
    </div>
  );
}
