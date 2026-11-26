import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import type { ActivityCheckResult, LearningActivityProps } from "../activities/engine";
import { IconCheck, IconClose } from "../../icons";
import { networkBuildDraftKey, readNetworkBuildView } from "./labConfig";
import type { LabDeviceKind } from "../../studentTools/networkLab";
import "./lab.css";

// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — a BUILD-THE-NETWORK exercise in the Reader (`simulation` / `network-build`
// v1). The learner starts from an EMPTY network in the book's network lab (the student tool «مختبر الشبكات» in its plain mode: the
// device kinds the task offers, networkTopology@2's ports and replay), adds the devices, connects the cables and configures them.
//
//   • The network is kept as a draft in this browser (per exercise) so a reload loses nothing; the shell's «إعادة تعيين» empties it.
//   • «تحقّق من شبكتي» sends the network ({ config, actions }) through the HOST's `check` seam; the SERVER validates, replays and judges
//     it goal by goal. The reply carries a verdict per goal (booleans), the message and — after a wrong check — the hints, after a right
//     one the explanation. The browser holds no check, no expected value and no solution.
//   • A verdict belongs to the network it judged: any change clears it. A transport failure or a retryable server error says
//     «تعذّر التحقق» — never a wrong answer.
//   • Without a `check` seam (an authored body, a host without study) the exercise is build-only and says so.
// The builder is its own lazy chunk (the platform rule: no module imports a networkTopology@2 surface statically).
const NetworkLabTool = lazy(() => import("../../studentTools/NetworkLabTool"));

type Network = { config: Record<string, unknown>; actions: unknown[] };
type CheckState =
  | { kind: "idle" }
  | { kind: "pending"; stamp: string }
  | { kind: "done"; stamp: string; result: ActivityCheckResult }
  | { kind: "error"; stamp: string };

const ISSUE_TEXT: Readonly<Record<string, string>> = {
  NETWORK_INVALID: "تعذّر قراءة شبكتك كما بنيتها. إن تكرر ذلك فاضغط «ابدأ من جديد».",
  KIND_NOT_ALLOWED: "في شبكتك جهاز من نوع لا يطلبه هذا التمرين؛ احذفه ثم تحقّق مرة أخرى.",
  ACTIONS_INVALID: "بعض إعدادات الأجهزة لا تنطبق على شبكتك الحالية (ربما حذفت جهازًا ثم أضفته). امسح إعدادات الأجهزة وأعد برمجتها.",
};

export default function NetworkBuildActivity({ block, commands, emit, check }: LearningActivityProps) {
  const task = useMemo(() => readNetworkBuildView(block.config), [block.config]);
  const draftKey = networkBuildDraftKey(block.id);
  // after the shell's reset the builder starts FRESH: an empty network, and this exercise's draft is removed
  const [firstReset] = useState(commands.reset);
  const [network, setNetwork] = useState<{ net: Network; epoch: number } | null>(null);
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const seq = useRef(0);
  const baseId = useId();
  const net = network && network.epoch === commands.reset ? network.net : null;
  const stamp = net ? JSON.stringify(net) : "";
  const current = state.kind !== "idle" && net && state.stamp === stamp ? state : null;
  const result = current?.kind === "done" ? current.result : null;

  if (!task) return <p className="learning-lab-unavailable" role="note">تعذّر عرض هذا التمرين في هذا الإصدار.</p>;

  const empty = !net || (Array.isArray(net.config.devices) && net.config.devices.length === 0);
  const runCheck = () => {
    if (!check || !net || empty || current?.kind === "pending") return;
    const mine = ++seq.current, at = stamp, sent = JSON.parse(stamp) as Network;
    setState({ kind: "pending", stamp: at });
    emit({ type: "interaction", activityId: block.id, name: "check" });
    check({ kind: "network-build", config: sent.config, actions: sent.actions })
      .then(r => { if (seq.current === mine) setState({ kind: "done", stamp: at, result: r }); })
      .catch(() => { if (seq.current === mine) setState({ kind: "error", stamp: at }); });
  };
  const reached = (id: string) => !!result && (result.correct || result.parts?.[id] === true);
  const passed = result ? task.goals.filter(g => reached(g.id)).length : 0;
  const issue = result && !result.correct && result.issue ? ISSUE_TEXT[result.issue.code] : undefined;
  const statusText = !current ? ""
    : current.kind === "pending" ? "جارٍ فحص شبكتك على الخادم…"
    : current.kind === "error" ? "تعذّر التحقق من شبكتك الآن. حاول مرة أخرى بعد قليل."
    : current.result.correct ? "✓ أحسنت — شبكتك تحقق كل الأهداف."
    : "✕ تحقّق " + passed + " من " + task.goals.length + " أهداف — راجع الأهداف المعلّمة ثم حاول مرة أخرى.";
  const fb = result?.feedback;

  return (
    <div className="learning-lab learning-build" data-testid="network-build">
      <p className="learning-lab-intro" id={baseId + "-intro"}>{task.intro}</p>
      <section className="learning-lab-goals" aria-labelledby={baseId + "-goals"}>
        <p className="learning-lab-goals-title" id={baseId + "-goals"}>ابنِ شبكة تحقق الأهداف</p>
        <ol className="learning-lab-goal-list">
          {task.goals.map(g => (
            <li key={g.id} className={"learning-lab-goal" + (result ? (reached(g.id) ? " is-right" : " is-wrong") : "")}>
              <span className="learning-lab-goal-label">{g.label}</span>
              {result && (reached(g.id)
                ? <span className="learning-lab-mark is-right"><IconCheck size={14} aria-hidden="true" /><span className="learning-lab-sr">تحقّق</span></span>
                : <span className="learning-lab-mark is-wrong"><IconClose size={14} aria-hidden="true" /><span className="learning-lab-sr">لم يتحقّق بعد</span></span>)}
            </li>
          ))}
        </ol>
      </section>
      <div className="learning-lab-stage learning-build-stage">
        <Suspense fallback={<p className="learning-lab-note" role="status">جارٍ تحميل مختبر الشبكات…</p>}>
          <NetworkLabTool key={commands.reset} draftKey={draftKey} fresh={commands.reset !== firstReset} exercise={{ kinds: task.kinds as LabDeviceKind[] }}
            onLabChange={lab => setNetwork({ net: { config: lab.config as unknown as Record<string, unknown>, actions: lab.actions }, epoch: commands.reset })} />
        </Suspense>
      </div>
      <div className="learning-lab-check">
        {check ? (
          <button type="button" className="eb-button is-primary learning-lab-check-btn" disabled={empty || current?.kind === "pending"} onClick={runCheck} aria-describedby={baseId + "-status"}>
            تحقّق من شبكتي
          </button>
        ) : (
          <p className="learning-lab-note">ابنِ الشبكة وجرّبها بنفسك. التحقق من الشبكة متاح داخل المنصة عندما تكون الوحدة منشورة لصفك.</p>
        )}
        {check && empty && !current && <p className="learning-lab-note">ابدأ بإضافة الأجهزة وتوصيلها، ثم اضغط «تحقّق من شبكتي».</p>}
        <p className={"learning-lab-status" + (result ? (result.correct ? " is-right" : " is-wrong") : current?.kind === "error" ? " is-error" : "")} id={baseId + "-status"} role="status" aria-live="polite">{statusText}</p>
        {issue && <p className="learning-lab-message" data-testid="network-build-issue">{issue}</p>}
        {fb?.message && <p className="learning-lab-message">{fb.message}</p>}
        {result && !result.correct && fb?.hints && fb.hints.length > 0 && (
          <ul className="learning-lab-hints" aria-label="تلميحات">{fb.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>
        )}
        {result?.correct && fb?.explanation && <p className="learning-lab-explanation">{fb.explanation}</p>}
        {result && result.study === false && <p className="learning-lab-note">تمرين للتدريب: لا يُحسب في نقاط القوة.</p>}
        {result && result.study !== false && result.correct && result.persisted && <p className="learning-lab-note">✓ سُجِّل إنجاز هذا التمرين في نقاط قوتك.</p>}
        {result && result.study !== false && result.correct && !result.persisted && result.alreadyCompleted && <p className="learning-lab-note">أنجزت هذا التمرين سابقًا، وهو محسوب في نقاط قوتك.</p>}
      </div>
    </div>
  );
}
