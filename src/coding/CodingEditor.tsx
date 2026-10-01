import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { codingLanguage, utf8ByteLength } from "../codingQuestion";
import "./coding.css";

// Phase 17A — the ONE reusable code editor (student response, teacher starter code / reference solutions). Lazy-loaded with the
// coding renderer / editor chunks; it never enters the initial graph and adds NO dependency: a native <textarea> (the most
// robust screen-reader, mobile-keyboard and IME surface there is) plus a line-number gutter rendered as ONE text node.
//   • always LTR + monospace, whatever the RTL page around it; horizontal scrolling stays inside the editor;
//   • Tab / Shift+Tab indent / outdent by the language's indent unit (registry data, never a language branch); Enter keeps
//     the current indentation and adds one unit after an opening ':' '{' '(' '['; Esc then Tab leaves the editor (no trap);
//   • edits go through document.execCommand("insertText") when the browser supports it, so native undo / redo keep working;
//   • a change above maxBytes (UTF-8) is refused with an Arabic message; a size indicator appears near the limit;
//   • no syntax highlighter, no language server, no autocomplete, no evaluation — the source is only ever TEXT.
// State is the parent's canonical value (Answer / question config): nothing is persisted here.
type Props = { value: string; onChange: (next: string) => void; language: string; label: string; readOnly?: boolean; maxBytes?: number; minRows?: number };
const OPENERS = /[:{([]\s*$/;

export default function CodingEditor({ value, onChange, language, label, readOnly = false, maxBytes, minRows = 8 }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLPreElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null), tabReleased = useRef(false);
  const [refused, setRefused] = useState(false);
  const hintId = useId();
  const unit = codingLanguage(language)?.indentUnit ?? "    ";
  const lines = useMemo(() => { let n = 1; for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) n++; return n; }, [value]);
  const numbers = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join("\n"), [lines]);
  const bytes = useMemo(() => utf8ByteLength(value), [value]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current, el = ta.current;
    if (sel && el) { pendingSelection.current = null; el.setSelectionRange(sel[0], sel[1]); }
  }, [value]);

  const accept = (next: string): boolean => {
    if (maxBytes !== undefined && utf8ByteLength(next) > maxBytes) { setRefused(true); return false; }
    setRefused(false);
    onChange(next);
    return true;
  };
  /** Replace [start, end) with text and place the caret / selection; native insertText first (keeps the undo stack). */
  const replace = (start: number, end: number, text: string, selStart: number, selEnd = selStart) => {
    const el = ta.current!;
    const next = value.slice(0, start) + text + value.slice(end);
    if (maxBytes !== undefined && utf8ByteLength(next) > maxBytes) { setRefused(true); return; }
    pendingSelection.current = [selStart, selEnd];
    el.setSelectionRange(start, end);
    const native = typeof document.execCommand === "function" && document.queryCommandSupported?.("insertText") && document.execCommand("insertText", false, text) && el.value === next;
    if (!native) accept(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (e.key === "Escape") { tabReleased.current = true; return; }
    if (e.key === "Tab") {
      if (tabReleased.current || e.ctrlKey || e.metaKey || e.altKey) { tabReleased.current = false; return; }   // let focus move
      e.preventDefault();
      const s = el.selectionStart, end = el.selectionEnd, lineStart = value.lastIndexOf("\n", s - 1) + 1;
      if (!e.shiftKey && s === end) { replace(s, end, unit, s + unit.length); return; }
      const blockEnd = end > s && value[end - 1] === "\n" ? end - 1 : end;
      const block = value.slice(lineStart, blockEnd), rows = block.split("\n");
      const outdent = (r: string) => (r.startsWith(unit) ? r.slice(unit.length) : r.startsWith("\t") ? r.slice(1) : r.replace(/^ {1,4}/, ""));
      const changed = rows.map(r => (e.shiftKey ? outdent(r) : unit + r)).join("\n");
      const firstDelta = e.shiftKey ? changed.split("\n")[0].length - rows[0].length : unit.length;
      replace(lineStart, blockEnd, changed, s === end ? Math.max(lineStart, s + firstDelta) : lineStart, s === end ? Math.max(lineStart, s + firstDelta) : lineStart + changed.length);
      return;
    }
    tabReleased.current = false;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = el.selectionStart, end = el.selectionEnd, lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const before = value.slice(lineStart, s), indent = /^[ \t]*/.exec(before)![0];
      const text = "\n" + indent + (OPENERS.test(before) ? unit : "");
      e.preventDefault();
      replace(s, end, text, s + text.length);
    }
  };

  const near = maxBytes !== undefined && bytes >= maxBytes * 0.8;
  return (
    <div className="cx-code-editor" dir="ltr">
      <div className="cx-code-frame">
        <pre ref={gutter} className="cx-code-gutter" data-testid="code-gutter" aria-hidden="true">{numbers}</pre>
        <textarea
          ref={ta}
          className="cx-code-input"
          dir="ltr"
          aria-label={label}
          aria-describedby={hintId}
          aria-invalid={refused || undefined}
          value={value}
          rows={Math.max(minRows, Math.min(lines + 1, 30))}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
          onChange={e => { accept(e.target.value); }}
          onKeyDown={onKeyDown}
          onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        />
      </div>
      <div className="cx-code-meta">
        <span id={hintId}>{readOnly ? "للقراءة فقط" : "Tab للمسافة البادئة، Shift+Tab لإزالتها، Esc ثم Tab للخروج من المحرر."}</span>
        {near && <span className={"cx-code-size" + (near ? " is-near" : "")} data-testid="code-size">{bytes} / {maxBytes} بايت</span>}
      </div>
      {refused && <p className="cx-code-alert" role="alert">تجاوز الكود الحد الأقصى المسموح لحجمه ({maxBytes} بايت)؛ لم يُقبل التعديل الأخير.</p>}
    </div>
  );
}
