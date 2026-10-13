import { useEffect, useRef, useState } from "react";
import { issueSummaryText } from "./issueIndex";

/**
 * Phase 21E.2 (D) — the text of the builder's polite live region. It changes only when the error / warning COUNTS change and
 * stay stable for `settleMs` (typing a question text does not announce on every keystroke), and never on first render
 * (opening an exam is not news). The region itself is always mounted by the caller, so assistive technology registers it
 * before the first update.
 */
export function useIssueAnnouncer(errors: number, warnings: number, settleMs = 900): string {
  const [text, setText] = useState("");
  const last = useRef<string>(errors + "/" + warnings);
  useEffect(() => {
    const key = errors + "/" + warnings;
    if (key === last.current) return;
    const t = window.setTimeout(() => { last.current = key; setText(issueSummaryText(errors, warnings)); }, settleMs);
    return () => window.clearTimeout(t);
  }, [errors, warnings, settleMs]);
  return text;
}
