import { useContext, useMemo, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import NetworkCliTerminal, { type NetworkCliTranscriptEntry } from "../../networkCli/NetworkCliTerminal";
import { NETWORK_CLI_LIMITS, executeCommand, promptFor, replayCommands, type NetworkCliSession } from "../../networkCliEngine";
import { projectNetworkCliConfigForStudent } from "../../networkCliQuestion";
import { TeacherPreviewContext } from "../studentAttemptContext";

// Phase 18C — networkCli@1 student renderer (lazy). ONE component for the student exam AND the teacher preview (ExamPreview renders
// the same StudentQuestionCard). It reads ONLY the allow-listed public projection of `q.networkCli` (device + initial state) — a
// teacher-side question handed to it can never put the target state into the DOM — runs the pure engine in the browser for
// immediate educational feedback, and emits the canonical Answer {kind:"networkCli", commands, state} through the generic
// onAnswer seam: the EXISTING autosave / restore / pause / submit pipeline persists it (no second persistence system).
// The session (mode, selection, transcript) is never stored: it is rebuilt by replaying the bounded command history, which is
// exactly what the server does at ingest and the grader does at grading time. Practice feedback here is never a grade.
type Live = { key: string; session: NetworkCliSession; entries: NetworkCliTranscriptEntry[] };
const historyKey = (commands: readonly string[] | undefined) => (commands ?? []).join("\u0000");

export default function NetworkCliResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectNetworkCliConfigForStudent((q as { networkCli?: unknown }).networkCli), [q]);
  const preview = useContext(TeacherPreviewContext);
  const stored = answer?.kind === "networkCli" && Array.isArray(answer.commands) ? answer.commands.filter((c): c is string => typeof c === "string") : [];
  const storedKey = historyKey(stored);
  const [live, setLive] = useState<Live | null>(null);
  const [notice, setNotice] = useState("");

  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="ncli-unavailable">إعداد محاكي الشبكة لهذا السؤال غير متوفر في هذا الإصدار؛ لا يمكن عرض الطرفية.</p>;

  // The live session follows the STORED history: on first render, after a restore / resume (a different history than the one this
  // component emitted) or when the question changes, the history is replayed from the question's initial state.
  const initialKey = JSON.stringify(cfg.initialState);
  const current: Live = live && live.key === initialKey + "|" + storedKey ? live : (() => {
    const r = replayCommands(cfg.initialState, stored);
    return { key: initialKey + "|" + storedKey, session: r.session, entries: r.entries };
  })();

  const submit = (line: string) => {
    if (disabled) return;
    if (current.entries.length >= NETWORK_CLI_LIMITS.commands) return;
    const prompt = promptFor(current.session);
    const r = executeCommand(current.session, line);
    if (r.result.status === "refused") { setNotice(r.result.output[0] + (r.result.hint ? " — " + r.result.hint : "")); return; }
    if (r.result.status === "empty") return;
    setNotice("");
    const commands = [...current.entries.map(e => e.input), line];
    const next: Live = { key: initialKey + "|" + historyKey(commands), session: r.session, entries: [...current.entries, { input: line, prompt, result: r.result }] };
    setLive(next);
    onAnswer({ kind: "networkCli", commands, state: r.session.state });
  };

  return (
    <div className="iex-network-cli" data-testid="ncli-response">
      {preview && <p className="ncli-readonly" data-testid="ncli-preview-note">معاينة المعلم: الطرفية تعمل بالحالة الابتدائية نفسها التي يراها الطالب؛ لا يُحفظ شيء هنا.</p>}
      <NetworkCliTerminal session={current.session} entries={current.entries} onSubmit={submit} disabled={disabled} label={labelPrefix} remaining={Math.max(0, NETWORK_CLI_LIMITS.commands - current.entries.length)} notice={notice || undefined} testId="ncli-terminal" />
    </div>
  );
}
