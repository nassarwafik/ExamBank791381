import { NETWORK_CLI_LIMITS, NETWORK_CLI_MODE_LABEL, promptFor, type NetworkCliExecResult, type NetworkCliSession } from "../networkCliEngine";
import CliTerminalSurface from "./CliTerminalSurface";

// Phase 18C — the accessible terminal-style surface of the network CLI simulator (lazy chunk only; shared by the student exam,
// the teacher preview and the editor's try-out). It renders a transcript, the live prompt and ONE text input; Enter executes
// through the caller's `onSubmit` (default prevented: never a form submission), ArrowUp / ArrowDown recall the command history,
// the screen scrolls on its own, focus is visible, `disabled` turns the terminal read-only with an explicit notice. The island is
// LTR inside an RTL page: prompts, commands, interface names and IPv4 text keep their visual order. Nothing here executes
// anything — the caller runs the pure engine and hands back the entries.
// Phase 20B — the markup now lives in the device-neutral CliTerminalSurface (unchanged DOM); this wrapper feeds it the networkCli@1
// switch session (prompt, mode label, device, bounds), exactly as before.
export type NetworkCliTranscriptEntry = { input: string; prompt: string; result: NetworkCliExecResult };
export type NetworkCliTerminalProps = {
  session: NetworkCliSession;
  entries: readonly NetworkCliTranscriptEntry[];
  onSubmit: (line: string) => void;
  disabled?: boolean;
  label: string;
  /** Commands still accepted before the bounded history is full. */
  remaining: number;
  readOnlyNote?: string;
  /** A transient message (e.g. a refused over-long line) shown under the input. */
  notice?: string;
  testId?: string;
};

export default function NetworkCliTerminal({ session, entries, onSubmit, disabled, label, remaining, readOnlyNote, notice, testId }: NetworkCliTerminalProps) {
  return (
    <CliTerminalSurface
      prompt={promptFor(session)} modeLabel={NETWORK_CLI_MODE_LABEL[session.mode]} deviceName={session.state.device}
      entries={entries} onSubmit={onSubmit} disabled={disabled} label={label} remaining={remaining}
      maxCommands={NETWORK_CLI_LIMITS.commands} inputChars={NETWORK_CLI_LIMITS.inputChars} readOnlyNote={readOnlyNote} notice={notice} testId={testId}
      footnote={<>محاكاة تعليمية مبسّطة لمبدّل شبكة، ليست جهازًا حقيقيًا؛ اكتب <code>?</code> لعرض أوامر الوضع الحالي.</>}
    />
  );
}
