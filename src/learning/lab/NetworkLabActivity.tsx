import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "../activities/engine";
import { IconCheck, IconClose } from "../../icons";
import { readNetworkLabView } from "./labConfig";
import "./lab.css";

// 791381s Phase 8B-2 (docs/enterprise-791381s-enrichment-plan.md §11.3) — the NETWORK LAB in the Reader: the platform's curriculum
// network simulator (networkTopology@2 — the same student workspace as the exam's smartSim questions) on a booklet task.
//
//   • The learner configures the teacher's FIXED topology through the device surfaces (router / switch CLI, PC Desktop…); the
//     workspace replays every action locally for the VIEW only. Nothing is persisted: the action list lives in React state; the
//     shell's «إعادة تعيين» returns to the initial topology (a new epoch, zero actions).
//   • «تحقّق من الإعداد» sends the action list through the HOST's `check` seam (the study host → POST /api/learning-study/…/
//     attempt). The SERVER replays and judges it; the reply carries a verdict per goal (booleans), the message and — after a
//     wrong check — the hints, after a right one the explanation. The browser holds no check, no expected value, no solution.
//   • A verdict belongs to the action list it judged: any new action clears it. A transport failure or a retryable server error
//     (a judge that could not run) says «تعذّر التحقق» — never a wrong answer.
//   • Without a `check` seam (an authored body, a host without study) the lab is explore-only and says so.
// It loads the simulator workspace itself (lazily — never the trusted-sim plugin set) and does no network itself.

// The simulator workspace is its own chunk behind a dynamic edge (the platform rule: no module imports a networkTopology@2
// surface statically) — shared and cached with the exam's smartSim questions.
const Net2Workspace = lazy(() => import("../../networkTopology2/Net2Workspace"));

type CheckState =
  | { kind: "idle" }
  | { kind: "pending"; stamp: string }
  | { kind: "done"; stamp: string; result: ActivityCheckResult }
  | { kind: "error"; stamp: string };

export default function NetworkLabActivity({ block, commands, emit, check }: LearningActivityProps) {
  const lab = useMemo(() => readNetworkLabView(block.config), [block.config]);
  const [stored, setStored] = useState<{ actions: unknown[]; epoch: number }>(() => ({ actions: [], epoch: commands.reset }));
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const seq = useRef(0);
  const baseId = useId();
  // Shell reset = a new epoch: zero actions (the teacher's initial topology) and no verdict.
  const actions = stored.epoch === commands.reset ? stored.actions : [];
  const stamp = stored.epoch === commands.reset ? JSON.stringify(stored.actions) : "[]";
  const current = state.kind !== "idle" && state.stamp === stamp && stored.epoch === commands.reset ? state : null;
  const result = current?.kind === "done" ? current.result : null;

  if (!lab) return <p className="learning-lab-unavailable" role="note">تعذّر عرض هذا المختبر في هذا الإصدار.</p>;

  const onChange = (next: unknown[]) => setStored({ actions: next, epoch: commands.reset });
  const runCheck = () => {
    if (!check || actions.length === 0 || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp, sent = [...actions];
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: block.id, name: "check" });
    check({ kind: "network-lab", actions: sent })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };
  const goalMark = (id: string) => {
    if (!result) return null;
    const ok = result.correct || result.parts?.[id] === true;
    return ok
      ? <span className="learning-lab-mark is-right"><IconCheck size={14} aria-hidden="true" /><span className="learning-lab-sr">تحقّق</span></span>
      : <span className="learning-lab-mark is-wrong"><IconClose size={14} aria-hidden="true" /><span className="learning-lab-sr">لم يتحقّق بعد</span></span>;
  };
  const passed = result ? lab.goals.filter(g => result.correct || result.parts?.[g.id] === true).length : 0;
  const statusText = !current ? ""
    : current.kind === "pending" ? "جارٍ فحص الإعداد على الخادم…"
    : current.kind === "error" ? "تعذّر التحقق من الإعداد الآن. حاول مرة أخرى بعد قليل."
    : current.result.correct ? "✓ أحسنت — تحققت كل الأهداف."
    : "✕ تحقّق " + passed + " من " + lab.goals.length + " أهداف — راجع الأهداف المعلّمة ثم حاول مرة أخرى.";
  const fb = result?.feedback;

  return (
    <div className="learning-lab" data-testid="network-lab">
      <p className="learning-lab-intro" id={baseId + "-intro"}>{lab.intro}</p>
      <section className="learning-lab-goals" aria-labelledby={baseId + "-goals"}>
        <p className="learning-lab-goals-title" id={baseId + "-goals"}>أهداف المختبر</p>
        <ol className="learning-lab-goal-list">
          {lab.goals.map(g => (
            <li key={g.id} className={"learning-lab-goal" + (result ? (result.correct || result.parts?.[g.id] ? " is-right" : " is-wrong") : "")}>
              <span className="learning-lab-goal-label">{g.label}</span>{goalMark(g.id)}
            </li>
          ))}
        </ol>
      </section>
      <div className="learning-lab-stage">
        <Suspense fallback={<p className="learning-lab-note" role="status">جارٍ تحميل محاكي الشبكة…</p>}>
          <Net2Workspace key={commands.reset} config={lab.topology} actions={actions} onChange={onChange} label={block.title} />
        </Suspense>
      </div>
      <div className="learning-lab-check">
        {check ? (
          <button type="button" className="eb-button is-primary learning-lab-check-btn" disabled={actions.length === 0 || current?.kind === "pending"} onClick={runCheck} aria-describedby={baseId + "-status"}>
            تحقّق من الإعداد
          </button>
        ) : (
          <p className="learning-lab-note">نفّذ الأوامر على الأجهزة وجرّبها بنفسك. التحقق من الإعداد متاح داخل المنصة عندما تكون الوحدة منشورة لصفك.</p>
        )}
        {check && actions.length === 0 && !current && <p className="learning-lab-note">ابدأ بتنفيذ الأوامر على الأجهزة، ثم اضغط «تحقّق من الإعداد».</p>}
        <p className={"learning-lab-status" + (result ? (result.correct ? " is-right" : " is-wrong") : current?.kind === "error" ? " is-error" : "")} id={baseId + "-status"} role="status" aria-live="polite">{statusText}</p>
        {fb?.message && <p className="learning-lab-message">{fb.message}</p>}
        {result && !result.correct && fb?.hints && fb.hints.length > 0 && (
          <ul className="learning-lab-hints" aria-label="تلميحات">{fb.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>
        )}
        {result?.correct && fb?.explanation && <p className="learning-lab-explanation">{fb.explanation}</p>}
        {result && result.study === false && <p className="learning-lab-note">مختبر للتدريب: لا يُحسب في نقاط القوة.</p>}
        {result && result.study !== false && result.correct && result.persisted && <p className="learning-lab-note">✓ سُجِّل إنجاز هذا المختبر في نقاط قوتك.</p>}
        {result && result.study !== false && result.correct && !result.persisted && result.alreadyCompleted && <p className="learning-lab-note">أنجزت هذا المختبر سابقًا، وهو محسوب في نقاط قوتك.</p>}
      </div>
    </div>
  );
}
