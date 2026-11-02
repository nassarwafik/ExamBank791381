import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import "./console.css";

/**
 * Tadris+ P4-A — Tabs: the WAI-ARIA tabs pattern. One Tab stop (the selected tab); arrow keys move AND select following the
 * reading direction (in RTL the left arrow goes to the next tab), Home / End jump to the ends. Only the selected panel is
 * rendered; it is labelled by its tab. Presentation only: the caller owns the selection.
 */
export type TabItem = { id: string; label: string; content: ReactNode };

export default function Tabs({ label, tabs, selectedId, onSelect }: { label: string; tabs: TabItem[]; selectedId: string; onSelect: (id: string) => void }) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, tabs.findIndex(t => t.id === selectedId));
  const selected = tabs[index];

  function move(to: number) {
    const next = (to + tabs.length) % tabs.length;
    onSelect(tabs[next].id);
    refs.current[next]?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) { e.preventDefault(); move(index + 1); }
    else if (e.key === back) { e.preventDefault(); move(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(tabs.length - 1); }
  }

  return (
    <div className="eb-tabs">
      <div className="eb-tabs-list" role="tablist" aria-label={label}>
        {tabs.map((t, i) => {
          const isSelected = i === index;
          return (
            <button key={t.id} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={base + "-tab-" + t.id} aria-selected={isSelected} aria-controls={base + "-panel-" + t.id}
              tabIndex={isSelected ? 0 : -1} className="eb-tab" onClick={() => onSelect(t.id)} onKeyDown={onKeyDown}>
              {t.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="eb-tab-panel" role="tabpanel" id={base + "-panel-" + selected.id} aria-labelledby={base + "-tab-" + selected.id} tabIndex={0}>
          {selected.content}
        </div>
      )}
    </div>
  );
}
