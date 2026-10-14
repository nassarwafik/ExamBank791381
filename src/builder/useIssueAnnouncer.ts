import { useEffect, useRef, useState } from "react";
import { issueSummaryText } from "./issueIndex";

/** How long the counts must stay unchanged before they are announced. */
export const ISSUE_SETTLE_MS = 900;

/**
 * Phase 21E.2 (D) — the text of the builder's polite live region. It changes only when the error / warning COUNTS change and
 * stay stable for `settleMs` (typing a question text does not announce on every keystroke), and never on first render
 * (opening an exam is not news). The region itself is always mounted by the caller, so assistive technology registers it
 * before the first update.
 * K3 (C-F5) — `identity` names the exam being edited. App keeps the same builder instance when another exam opens (no key), so a
 * new identity counts as a first render: its counts become the baseline (never announced) and the previous exam's sentence is
 * cleared when it opens (a pending one is cancelled), so it can never come back later either.
 */
export function useIssueAnnouncer(errors: number, warnings: number, settleMs = ISSUE_SETTLE_MS, identity = ""): string {
  const [text, setText] = useState("");
  const last = useRef({ identity, key: errors + "/" + warnings });
  useEffect(() => {
    const key = errors + "/" + warnings;
    if (last.current.identity !== identity) { last.current = { identity, key }; setText(""); return; }   // another exam: a new baseline
    if (key === last.current.key) return;
    const t = window.setTimeout(() => { last.current = { identity, key }; setText(issueSummaryText(errors, warnings)); }, settleMs);
    return () => window.clearTimeout(t);
  }, [errors, warnings, settleMs, identity]);
  return text;
}
