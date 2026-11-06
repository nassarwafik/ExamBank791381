import { useId, type ReactNode } from "react";
import { IconChevronDown } from "../icons";

/**
 * UX-O2 — one collapsible section of the owner's access editor (design docs/enterprise-ux-owner-console-o2.md §2.1 ب). The head is a
 * real button (aria-expanded / aria-controls) named by the section title and described by its one-line summary and, when the draft
 * differs from what is saved, a «معدّل» badge. PRESENTATION ONLY: a folded section stays mounted (`hidden`), so nothing in the draft
 * is lost and what is sent is unchanged.
 */
export default function AccessSection({ title, summary, changed, open, onToggle, children }: {
  title: string; summary?: ReactNode; changed?: boolean; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={"eb-owner-section" + (open ? " is-open" : "")} aria-labelledby={id + "-head"}>
      <h3 className="eb-owner-section-title">
        <button type="button" id={id + "-head"} className="eb-owner-section-head" aria-expanded={open} aria-controls={id + "-body"}
          aria-label={title} aria-describedby={id + "-sum"} onClick={onToggle}>
          <IconChevronDown size={16} className={"eb-owner-section-chevron" + (open ? " is-open" : "")} aria-hidden="true" />
          <span className="eb-owner-section-name">{title}</span>
          <span id={id + "-sum"} className="eb-owner-section-summary">
            {summary}
            {changed && <span className="eb-owner-changed">معدّل</span>}
          </span>
        </button>
      </h3>
      <div id={id + "-body"} className="eb-owner-section-body" hidden={!open}>{children}</div>
    </section>
  );
}
