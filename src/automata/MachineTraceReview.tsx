import { useMemo } from "react";
import { machineTraceAuthority, normalizeMachineTraceAnswer, gradeTrace, rowLabel } from "../machineTraceQuestion";
import MachineTraceTable from "./MachineTraceTable";
import TraceCompare, { type TraceCompareData } from "./TraceCompare";
import "./machineTrace.css";

// AUTO-A15b — the teacher's review of a machineTrace@1 answer (lazy chunk «teacher-trace-review»): the machine and the word, then the
// student's rows beside the true run with each row's part — computed here by the SAME contract the server graded with (the stored grade is
// the authority for the mark; this view explains it). A question that does not read says so; nothing is guessed.
export default function MachineTraceReview({ config, answer }: { config: unknown; answer: unknown }) {
  const view = useMemo(() => {
    const auth = machineTraceAuthority(config, {});
    if (!auth) return null;
    const norm = normalizeMachineTraceAnswer(answer ?? { kind: "machineTrace", rows: [], verdict: null });
    const ans = norm.ok ? norm.answer : { kind: "machineTrace" as const, rows: [], verdict: null };
    const g = gradeTrace(auth.machine, auth.config.word, ans);
    if (!g) return null;
    const data: TraceCompareData = {
      rows: g.truth.map((truth, k) => ({ mine: rowLabel(ans.rows[k]), truth, right: g.rows[k] })),
      verdict: { mine: ans.verdict, truth: g.trueVerdict, right: g.verdict },
    };
    return { machine: auth.machine, word: auth.config.word, data, extra: Math.max(0, ans.rows.length - g.trueRows) };
  }, [config, answer]);
  if (!view) return <p className="vq-unavailable" role="note" data-testid="trace-review-unavailable">تعذّر عرض سؤال التتبّع (إعداد لا يُقرأ).</p>;
  return (
    <div className="mt-review" dir="rtl" data-testid="machine-trace-review">
      <MachineTraceTable m={view.machine} />
      <p className="mt-word">الكلمة: <bdi dir="ltr" className="mt-word-value">{view.word === "" ? "ε" : view.word}</bdi></p>
      <TraceCompare data={view.data} testId="trace-review-compare" />
      {view.extra > 0 && <p className="mt-help" role="note">كتب الطالب {view.extra} سطرًا بعد نهاية التشغيل الصحيح؛ لا تُصحَّح.</p>}
    </div>
  );
}
