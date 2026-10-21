import type { ReactNode } from "react";

/**
 * UX-R3 — SubNav: the reference's settings-style text navigation beside a page's content (classes of a roster, the report
 * catalogue, assignment states). A named <nav> of real buttons in optional labelled groups; the current item is a grey pill
 * with aria-current="page" (text and weight mark it too, never colour alone); an optional muted count sits on the end side
 * and stays inside the item's accessible name. Presentation only: the caller owns the selection.
 */
export type SubNavItem = { id: string; label: string; count?: ReactNode; countLabel?: string };
export type SubNavGroup = { label?: string; items: SubNavItem[] };

export default function SubNav({ label, groups, currentId, onSelect, className }: { label: string; groups: SubNavGroup[]; currentId?: string; onSelect: (id: string) => void; className?: string }) {
  return (
    <nav className={"eb-subnav" + (className ? " " + className : "")} aria-label={label}>
      {groups.map((g, gi) => (
        <div key={g.label || gi} className="eb-subnav-group" role={g.label ? "group" : undefined} aria-label={g.label}>
          {g.label && <p className="eb-subnav-label" aria-hidden="true">{g.label}</p>}
          {g.items.map(item => {
            const current = item.id === currentId;
            return (
              <button key={item.id} type="button" className={"eb-subnav-item" + (current ? " is-current" : "")} aria-current={current ? "page" : undefined} onClick={() => onSelect(item.id)}>
                <span className="eb-subnav-text">{item.label}</span>
                {item.count !== undefined && item.count !== null && item.count !== "" && (
                  <span className="eb-subnav-count">
                    {item.count}
                    {item.countLabel && <span className="eb-visually-hidden"> {item.countLabel}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
