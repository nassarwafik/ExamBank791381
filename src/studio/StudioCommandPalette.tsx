import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Dialog from "../ui/Dialog";
import { IconSearch } from "../icons";

// Phase 21F.5 — the Studio command palette (Ctrl / ⌘ + K): every Studio action by name — go to a step or a question, add a question
// of a type, open a tool, preview, save. A combobox over a listbox (↑ / ↓ move the active option, Enter runs it, Escape closes);
// the search ignores Arabic diacritics. Commands are given by the workspace: the palette runs exactly the handlers the buttons run.

export type StudioCommand = { id: string; label: string; group: string; keywords?: string; run: () => void; disabled?: boolean };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[ً-ْ]/g, "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim();

export default function StudioCommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: StudioCommand[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const base = "st-cmd-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputRef = useRef<HTMLInputElement>(null);
  const q = norm(query);
  const visible = useMemo(() => commands.filter(c => !c.disabled && (!q || norm(c.label + " " + c.group + " " + (c.keywords ?? "")).includes(q))).slice(0, 60), [commands, q]);
  const at = Math.min(active, Math.max(0, visible.length - 1));
  const run = (c: StudioCommand | undefined) => { if (!c) return; onClose(); setQuery(""); setActive(0); window.setTimeout(c.run, 0); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((at + 1) % Math.max(1, visible.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((at - 1 + visible.length) % Math.max(1, visible.length)); }
    else if (e.key === "Enter") { e.preventDefault(); run(visible[at]); }
  };
  return (
    <Dialog open={open} size="md" title="الأوامر" onClose={() => { onClose(); setQuery(""); setActive(0); }} className="st-cmd-dialog" initialFocusRef={inputRef}>
      <div className="st-drawer st-cmd" dir="rtl">
        <label className="st-cmd-search" htmlFor={base + "-input"}>
          <IconSearch size={16} aria-hidden="true" />
          <span className="st-visually-hidden">ابحث عن أمر</span>
          <input ref={inputRef} id={base + "-input"} type="text" role="combobox" aria-expanded="true" aria-controls={base + "-list"} aria-autocomplete="list"
            aria-activedescendant={visible[at] ? base + "-" + visible[at].id : undefined} value={query} placeholder="اكتب أمرًا أو رقم سؤال…"
            onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
        </label>
        <ul className="st-cmd-list" role="listbox" id={base + "-list"} aria-label="الأوامر">
          {visible.length === 0 && <li className="st-cmd-empty" role="presentation">لا توجد أوامر مطابقة.</li>}
          {visible.map((c, i) => {
            const head = i === 0 || visible[i - 1].group !== c.group ? c.group : null;
            return (
              <li key={c.id} role="presentation">
                {head && <span className="st-cmd-group" aria-hidden="true">{head}</span>}
                <div role="option" id={base + "-" + c.id} aria-selected={i === at} className={"st-cmd-item" + (i === at ? " is-active" : "")}
                  onMouseMove={() => setActive(i)} onClick={() => run(c)}>{c.label}</div>
              </li>
            );
          })}
        </ul>
        <p className="st-cmd-hint"><kbd>↑</kbd><kbd>↓</kbd> للتنقل · <kbd>Enter</kbd> للتنفيذ · <kbd>Esc</kbd> للإغلاق</p>
      </div>
    </Dialog>
  );
}
