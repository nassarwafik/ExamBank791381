import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { IconSearch } from "../icons";
import { matchDestinations, type QuickNavDestination } from "./quickNav";

// UX-R2 — the top bar's search field. It does ONE honest thing: jump to a destination of the teacher shell by typing part of
// its name (the platform has no global content search yet; that is R18). WAI-ARIA combobox with a list popup: the input
// keeps focus, the highlighted option is announced through aria-activedescendant, ArrowDown / ArrowUp move, Enter opens the
// highlighted (or only) match, Escape closes the list and then clears the text. No data fetching, no routing authority:
// the shell's own onNavigate does the navigation.
type Props = { destinations: readonly QuickNavDestination[]; onNavigate: (id: string) => void; className?: string };

export default function QuickNavSearch({ destinations, onNavigate, className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const listId = "eb-quicknav-list-" + uid;
  const optionId = (i: number) => "eb-quicknav-opt-" + uid + "-" + i;
  const matches = useMemo(() => matchDestinations(destinations, query), [destinations, query]);
  const shown = open && matches.length > 0;
  const current = Math.min(active, Math.max(0, matches.length - 1));

  function choose(d: QuickNavDestination) {
    setQuery("");
    setOpen(false);
    setActive(0);
    onNavigate(d.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(e.key === "ArrowDown" ? 0 : Math.max(0, matches.length - 1)); return; }
      if (!matches.length) return;
      setActive(i => (e.key === "ArrowDown" ? (Math.min(i, matches.length - 1) + 1) % matches.length : (Math.min(i, matches.length - 1) - 1 + matches.length) % matches.length));
    } else if (e.key === "Enter") {
      if (open && matches.length) { e.preventDefault(); choose(matches[current]); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); }
      else if (query) { e.preventDefault(); setQuery(""); }
    }
  }

  return (
    <div className={"eb-quicknav" + (className ? " " + className : "")}>
      <span className="eb-quicknav-icon" aria-hidden="true"><IconSearch size={18} /></span>
      <input
        ref={inputRef}
        type="search"
        className="eb-quicknav-input"
        role="combobox"
        aria-label="انتقل إلى صفحة"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? optionId(current) : undefined}
        placeholder="انتقل إلى صفحة… (الطلاب، الواجبات، التقارير)"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { if (query) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="الصفحات" className="eb-quicknav-list" hidden={!shown}>
        {shown && matches.map((d, i) => (
          <li
            key={d.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            className={"eb-quicknav-option" + (i === current ? " is-active" : "")}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(d)}
          >
            {d.label}
          </li>
        ))}
      </ul>
      {/* A live region WITHOUT role="status": the page keeps a single status element (its loading fallback). */}
      <span className="eb-visually-hidden eb-quicknav-live" aria-live="polite">
        {open && query && !matches.length ? "لا توجد صفحة بهذا الاسم" : ""}
      </span>
    </div>
  );
}
