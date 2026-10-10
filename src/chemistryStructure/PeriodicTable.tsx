import { useState, type KeyboardEvent } from "react";
import { CHEM_ELEMENTS, type ChemElement } from "../chemistry/elements";
import { elementInfo } from "./chemView";

// Phase 21D-D.1 — the periodic table of the catalog (periods 1–4, 18 IUPAC groups; presentation, LTR like printed tables). Browsing
// (focus / hover / arrow keys) shows information and is never recorded. When the question asks the student to choose elements, a cell
// press toggles the choice — the ONLY answer this table can produce. Keyboard: one tab stop, arrows move, Home / End jump within a period,
// Enter / Space choose.
type Props = { mode: "basic" | "detailed"; selectable: boolean; selected: readonly string[]; max: number; disabled?: boolean; label?: string; onToggle: (symbol: string) => void };
const at = (period: number, group: number) => CHEM_ELEMENTS.find(e => e.period === period && e.group === group);
function neighbour(e: ChemElement, key: string): ChemElement | undefined {
  const row = CHEM_ELEMENTS.filter(x => x.period === e.period);
  if (key === "ArrowRight") return row.find(x => x.group > e.group);
  if (key === "ArrowLeft") return [...row].reverse().find(x => x.group < e.group);
  if (key === "Home") return row[0];
  if (key === "End") return row[row.length - 1];
  const period = e.period + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0);
  if (period === e.period) return undefined;
  const candidates = CHEM_ELEMENTS.filter(x => x.period === period);
  return at(period, e.group) ?? candidates.sort((a, b) => Math.abs(a.group - e.group) - Math.abs(b.group - e.group))[0];
}
export default function PeriodicTable({ mode, selectable, selected, max, disabled, label, onToggle }: Props) {
  const [focus, setFocus] = useState(selected[0] ?? "H");
  const current = CHEM_ELEMENTS.find(e => e.symbol === focus) ?? CHEM_ELEMENTS[0];
  const full = selected.length >= max;
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, el: ChemElement) => {
    const next = neighbour(el, e.key);
    if (next) { e.preventDefault(); setFocus(next.symbol); (e.currentTarget.parentElement?.querySelector("[data-symbol='" + next.symbol + "']") as HTMLButtonElement | null)?.focus(); }
  };
  return (
    <section className="chem-ptable" data-testid="chem-ptable" aria-label="الجدول الدوري (الدورات 1–4)">
      {selectable && label && <p className="chem-task-label">{label}{max > 1 ? " (حتى " + max + ")" : ""}</p>}
      <div className="chem-ptable-scroll">
        <div className="chem-ptable-grid" role="group" aria-label="عناصر الجدول الدوري">
          {CHEM_ELEMENTS.map(el => {
            const on = selected.includes(el.symbol);
            return (
              <button key={el.symbol} type="button" data-symbol={el.symbol} className={"chem-cell is-" + el.category + (on ? " is-selected" : "")} style={{ gridColumn: el.group, gridRow: el.period }}
                tabIndex={el.symbol === current.symbol ? 0 : -1} aria-pressed={selectable ? on : undefined} aria-label={elementInfo(el, mode)}
                disabled={selectable && !!disabled} onFocus={() => setFocus(el.symbol)} onMouseEnter={() => setFocus(el.symbol)} onKeyDown={e => onKey(e, el)}
                onClick={() => { setFocus(el.symbol); if (selectable && !disabled && (on || !full || max === 1)) onToggle(el.symbol); }}>
                <small>{el.z}</small><b>{el.symbol}</b>
              </button>
            );
          })}
        </div>
      </div>
      <p className="chem-ptable-info" aria-live="polite" data-testid="chem-ptable-info">{elementInfo(current, mode)}</p>
    </section>
  );
}
