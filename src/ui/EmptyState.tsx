import type { ReactNode } from "react";

/** EmptyState — one shape for "nothing here yet": a title, an optional explanation and an optional primary action. */
export default function EmptyState({ title, description, action, compact = false }: { title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={"eb-empty" + (compact ? " is-compact" : "")}>
      <p className="eb-empty-title">{title}</p>
      {description && <p className="eb-empty-description">{description}</p>}
      {action && <div className="eb-empty-action">{action}</div>}
    </div>
  );
}
