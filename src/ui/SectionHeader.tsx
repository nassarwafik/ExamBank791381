import type { ReactNode } from "react";

/**
 * SectionHeader — the one heading row used by every dashboard section and card.
 * The caller chooses the heading level so the page keeps a strict h1 → h2 → h3
 * outline (the shell owns the h1). `count` renders as a chip next to the title,
 * `actions` are laid out at the inline-end.
 */
export type SectionHeaderProps = {
  title: ReactNode;
  level?: 2 | 3;
  id?: string;
  description?: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
};

export default function SectionHeader({ title, level = 2, id, description, count, actions, className = "" }: SectionHeaderProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={("eb-section-header " + className).trim()}>
      <div className="eb-section-header-text">
        <Heading id={id} className="eb-section-title">
          {title}
          {typeof count === "number" && <span className="eb-section-count">{count}</span>}
        </Heading>
        {description !== undefined && description !== null && description !== "" && <p className="eb-section-description">{description}</p>}
      </div>
      {actions && <div className="eb-section-actions">{actions}</div>}
    </div>
  );
}
