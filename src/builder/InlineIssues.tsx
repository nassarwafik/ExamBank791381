import { IconWarning, IconClose } from "../icons";
import type { StructuredIssue } from "../examQuality";
import "./builder-issues.css";

/**
 * InlineIssues — Phase 21E.2 (D): the canonical issues of ONE question (or section), rendered next to it. A labelled group
 * (no live region of its own — the builder announces count changes once, politely), errors first, each with a text severity
 * so colour is never the only signal. `id` lets the card's controls reference it.
 */
export default function InlineIssues({ id, issues, label }: { id: string; issues: readonly StructuredIssue[]; label: string }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return (
    <div className="sb-inline-issues" id={id} role="group" aria-label={label} data-severity={sorted[0].severity}>
      <ul>
        {sorted.map(i => (
          <li key={i.id} className={i.severity === "error" ? "is-error" : "is-warning"} data-code={i.code}>
            <span className="sb-inline-issue-icon" aria-hidden="true">{i.severity === "error" ? <IconClose size={14} /> : <IconWarning size={14} />}</span>
            <span className="sb-inline-issue-kind">{i.severity === "error" ? "خطأ:" : "تنبيه:"}</span> {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
