import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { codingLanguage, utf8ByteLength } from "../codingQuestion";
import { getEditorEngineLoader, type EditorEngine, type EditorEngineHandle } from "./editor/editorEngine";
import { editorLanguageMode } from "./editor/editorOptions";
import "./coding.css";

// Phase 17A / 17F-C1 — the ONE reusable code editor (student response, teacher starter code / reference solutions). Lazy-loaded with
// the coding renderer / editor chunks; it never enters the initial graph. Two surfaces, one contract (value / onChange / language /
// readOnly / maxBytes / label / minRows), one authority — the parent's canonical value (Answer / question config):
//   • the NATIVE editor (below): a <textarea> + line-number gutter, no dependency. It paints first, and it is the deliberate choice on
//     phones / touch-primary devices, when the rich engine cannot load, and in DOMs without a layout engine (unit tests);
//   • the PROFESSIONAL editor (17F-C1): the Monaco engine behind its own lazy chunk (editor/editorEngine.ts), taking the SAME source
//     over when it resolves — syntax highlighting for Python / Java / C#, line numbers, bracket matching, auto-closing pairs,
//     auto-indent, find / replace, folding; NO autocomplete / IntelliSense / hints / snippets / ghost text (editor/editorOptions.ts).
//   Both: always LTR + monospace inside the RTL page, horizontal scrolling inside the editor, Tab / Shift+Tab indentation, Esc then
//   Tab (or Ctrl+M in the rich editor) leaves the editor, a change above maxBytes (UTF-8) is refused with an Arabic message, and the
//   source is only ever TEXT: nothing is persisted here, nothing is executed, nothing leaves the page.
type Props = { value: string; onChange: (next: string) => void; language: string; label: string; readOnly?: boolean; maxBytes?: number; minRows?: number };
const OPENERS = /[:{([]\s*$/;
const MAX_ROWS = 30, RICH_LINE_HEIGHT = 22, RICH_PADDING = 20;
const countLines = (s: string) => { let n = 1; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };
const NATIVE_HINT = "Tab للمسافة البادئة، Shift+Tab لإزالتها، Esc ثم Tab للخروج من المحرر.";
const RICH_HINT = "Tab للمسافة البادئة، Shift+Tab لإزالتها، Esc ثم Tab (أو Ctrl+M) للخروج من المحرر، Ctrl+F للبحث.";
const READ_ONLY_HINT = "للقراءة فقط";

export default function CodingEditor(props: Props) {
  const [loader] = useState(() => getEditorEngineLoader());
  const [rich, setRich] = useState<{ engine: EditorEngine; handover: { offset: number } | null } | null>(null);
  const nativeInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!loader) return;
    let live = true;
    loader().then(engine => {
      if (!live) return;
      const ta = nativeInput.current;                                               // a keyboard user mid-typing keeps focus + caret
      setRich({ engine, handover: ta && document.activeElement === ta ? { offset: ta.selectionStart } : null });
    }, () => { /* the engine chunk did not load (offline, blocked): the native editor simply stays */ });
    return () => { live = false; };
  }, [loader]);
  return rich ? <RichCodingEditor {...props} engine={rich.engine} handover={rich.handover} /> : <NativeCodingEditor {...props} inputRef={nativeInput} />;
}

/** Shared meta row: the hint (aria-describedby target), the byte indicator near the limit and the refusal alert. */
function EditorMeta({ hintId, hint, bytes, maxBytes, refused }: { hintId: string; hint: string; bytes: number; maxBytes?: number; refused: boolean }) {
  const near = maxBytes !== undefined && bytes >= maxBytes * 0.8;
  return <>
    <div className="cx-code-meta">
      <span id={hintId}>{hint}</span>
      {near && <span className="cx-code-size is-near" data-testid="code-size">{bytes} / {maxBytes} بايت</span>}
    </div>
    {refused && <p className="cx-code-alert" role="alert">تجاوز الكود الحد الأقصى المسموح لحجمه ({maxBytes} بايت)؛ لم يُقبل التعديل الأخير.</p>}
  </>;
}

// ——— the professional editor: React owns the value, the engine handle owns the DOM ———————————————————————————————————————
function RichCodingEditor({ engine, handover, value, onChange, language, label, readOnly = false, maxBytes, minRows = 8 }: Props & { engine: EditorEngine; handover: { offset: number } | null }) {
  const host = useRef<HTMLDivElement>(null), handle = useRef<EditorEngineHandle | null>(null);
  const synced = useRef(value);                                                      // the last text both sides agree on
  const latest = useRef({ onChange, maxBytes });
  useEffect(() => { latest.current = { onChange, maxBytes }; });                   // read by accept() at event time, never in render
  const [refused, setRefused] = useState(false);
  const hintId = useId();
  const unit = codingLanguage(language)?.indentUnit ?? "    ";
  const lines = useMemo(() => countLines(value), [value]);
  const bytes = useMemo(() => utf8ByteLength(value), [value]);
  const initial = useRef({ language, label, readOnly, unit, handover });

  useLayoutEffect(() => {                                                            // created ONCE per engine; props sync below
    const start = initial.current;
    const h = engine.create(host.current!, {
      value: synced.current, languageMode: editorLanguageMode(start.language), label: start.label, readOnly: start.readOnly, describedBy: hintId, indentUnit: start.unit,
      accept: next => {
        const { maxBytes: limit, onChange: emit } = latest.current;
        if (limit !== undefined && utf8ByteLength(next) > limit) { setRefused(true); return false; }
        setRefused(false);
        synced.current = next;
        emit(next);
        return true;
      }
    });
    handle.current = h;
    if (start.handover) { h.focus(); h.setCursorOffset(start.handover.offset); }
    return () => { h.dispose(); handle.current = null; };
  }, [engine, hintId]);
  useEffect(() => { if (value !== synced.current) { synced.current = value; handle.current?.setValue(value); } }, [value]);
  useSync(editorLanguageMode(language), mode => handle.current?.setLanguage(mode));
  useSync(readOnly, ro => handle.current?.setReadOnly(ro));
  useSync(label, l => handle.current?.setLabel(l));
  useSync(refused, flag => handle.current?.setInvalid(flag));

  const rows = Math.max(minRows, Math.min(lines + 1, MAX_ROWS));
  return (
    <div className="cx-code-editor cx-code-editor--rich" dir="ltr" data-editor-engine={engine.kind}>
      <div ref={host} className="cx-code-frame cx-code-rich" data-testid="code-rich-host" style={{ height: rows * RICH_LINE_HEIGHT + RICH_PADDING }} />
      <EditorMeta hintId={hintId} hint={readOnly ? READ_ONLY_HINT : RICH_HINT} bytes={bytes} maxBytes={maxBytes} refused={refused} />
    </div>
  );
}
/** Applies `apply` when `dep` CHANGES after mount (the initial value is part of create()). */
function useSync<T>(dep: T, apply: (next: T) => void) {
  const prev = useRef(dep);
  useEffect(() => { if (prev.current !== dep) { prev.current = dep; apply(dep); } });
}

// ——— the native editor (Phase 17A, unchanged contract) ——————————————————————————————————————————————————————————————————
function NativeCodingEditor({ value, onChange, language, label, readOnly = false, maxBytes, minRows = 8, inputRef }: Props & { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const ta = inputRef, gutter = useRef<HTMLPreElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null), tabReleased = useRef(false);
  const [refused, setRefused] = useState(false);
  const hintId = useId();
  const unit = codingLanguage(language)?.indentUnit ?? "    ";
  const lines = useMemo(() => countLines(value), [value]);
  const numbers = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join("\n"), [lines]);
  const bytes = useMemo(() => utf8ByteLength(value), [value]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current, el = ta.current;
    if (sel && el) { pendingSelection.current = null; el.setSelectionRange(sel[0], sel[1]); }
  }, [value, ta]);

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

  return (
    <div className="cx-code-editor" dir="ltr" data-editor-engine="native">
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
          rows={Math.max(minRows, Math.min(lines + 1, MAX_ROWS))}
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
      <EditorMeta hintId={hintId} hint={readOnly ? READ_ONLY_HINT : NATIVE_HINT} bytes={bytes} maxBytes={maxBytes} refused={refused} />
    </div>
  );
}
