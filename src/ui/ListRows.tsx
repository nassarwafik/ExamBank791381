import type { ReactNode } from "react";
import { IconEdit } from "../icons";

/**
 * UX-R3 — ListRows / ListRow: the reference's core pattern — a list of ≥ 44 px rows separated by hairlines, each one:
 * [icon] · title (+ a muted context after it) · muted meta · status · an inline action. A real list (ul / li), so assistive
 * technology announces "n items"; the icon is decorative (aria-hidden) and the title stays the row's text. Presentation only:
 * the caller passes formatted content and its own controls.
 */
export function ListRows({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return <ul className={"eb-list" + (className ? " " + className : "")} aria-label={label}>{children}</ul>;
}

export type ListRowProps = {
  icon?: ReactNode;
  title: ReactNode;
  context?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function ListRow({ icon, title, context, meta, status, action, className }: ListRowProps) {
  return (
    <li className={"eb-list-row" + (className ? " " + className : "")}>
      {icon && <span className="eb-list-icon" aria-hidden="true">{icon}</span>}
      <span className="eb-list-main">
        <span className="eb-list-title">{title}</span>
        {context !== undefined && context !== null && context !== "" && <span className="eb-list-context">{context}</span>}
      </span>
      {meta !== undefined && meta !== null && meta !== "" && <span className="eb-list-meta">{meta}</span>}
      {status && <span className="eb-list-status">{status}</span>}
      {action && <span className="eb-list-action">{action}</span>}
    </li>
  );
}

/** The reference's inline row action: a quiet text button with a leading glyph («تعديل» with a pencil by default). Its
 *  visible text is its name; `describedBy` can point at the row title so the action is unambiguous ("تعديل — أحمد"). */
export function RowAction({ label = "تعديل", icon, onClick, describedBy, disabled }: { label?: string; icon?: ReactNode; onClick: () => void; describedBy?: string; disabled?: boolean }) {
  return (
    <button type="button" className="eb-row-action" onClick={onClick} aria-describedby={describedBy} disabled={disabled}>
      <span aria-hidden="true" className="eb-row-action-icon">{icon ?? <IconEdit size={16} />}</span>
      {label}
    </button>
  );
}
