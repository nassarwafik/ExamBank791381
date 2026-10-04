import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { codingLanguage, utf8ByteLength } from "../codingQuestion";
import { getEditorEngineLoader, type EditorEngine, type EditorEngineHandle } from "./editor/editorEngine";
import { editorLanguageMode } from "./editor/editorOptions";
import { DEFAULT_EDITOR_PREFERENCES, lineHeightFor, type EditorPreferences } from "./workspace/editorPreferences";
import "./coding.css";

// Phase 17A / 17F-C1 / 18B — the ONE reusable code editor (student response, teacher starter code / reference solutions). Lazy-loaded
// with the coding renderer / editor chunks; it never enters the initial graph. Two surfaces, one contract (value / onChange / language /
// readOnly / maxBytes / label / minRows), one authority — the parent's canonical value (Answer / question config):
//   • the NATIVE editor (below): a <textarea> + line-number gutter, no dependency. It paints first, and it is the deliberate choice on
//     phones / touch-primary devices, when the rich engine cannot load, and in DOMs without a layout engine (unit tests);
//   • the PROFESSIONAL editor (17F-C1): the Monaco engine behind its own lazy chunk (editor/editorEngine.ts), taking the SAME source
//     over when it resolves — syntax highlighting for Python / Java / C#, line numbers, bracket matching, auto-closing pairs,
//     auto-indent, find / replace, folding; NO autocomplete / IntelliSense / hints / snippets / ghost text (editor/editorOptions.ts).
//   Both: always LTR + monospace inside the RTL page, horizontal scrolling inside the editor, Tab / Shift+Tab indentation, Esc then
//   Tab (or Ctrl+M in the rich editor) leaves the editor, a change above maxBytes (UTF-8) is refused with an Arabic message, and the
//   source is only ever TEXT: nothing is persisted here, nothing is executed, nothing leaves the page.
// Phase 18B adds, without changing that contract:
//   • `preferences` — device-level PRESENTATION (font size, wrap, minimap, line numbers; workspace/editorPreferences.ts). They reach
//     the engine through setPreferences() and the native editor through CSS / attributes; they never touch the value or onChange;
//   • `layout="fill"` — the focus-mode layout: the editor stops sizing itself by line count and lets the workspace CSS own its height;
//   • engine LIFECYCLE states: a polite loading row when the engine chunk is slow, an explicit fallback reason (environment /
//     load-failed / create-failed / runtime-failed), and the RUNTIME degrade path: an engine method throwing AFTER creation (model
//     disposed, option update failure…) is caught here, the engine is released best-effort and the native editor is restored with
//     the canonical value — the student's source is never lost to an editor component failure, nothing is re-emitted;
//   • the Escape BOUNDARY: Escape pressed on either editor surface is consumed here (it is the editor's own escape hatch) and never
//     bubbles to document-level listeners — a surrounding overlay (the teacher preview's focus trap) can no longer close by accident.
type Props = { value: string; onChange: (next: string) => void; language: string; label: string; readOnly?: boolean; maxBytes?: number; minRows?: number; preferences?: EditorPreferences; layout?: "auto" | "fill" };
const OPENERS = /[:{([]\s*$/;
const MAX_ROWS = 30, RICH_PADDING = 20;
/** The loading row appears only when the engine chunk is genuinely slow (a cached chunk resolves long before this). */
export const ENGINE_STATUS_DELAY_MS = 250;
const countLines = (s: string) => { let n = 1; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };
const NATIVE_HINT = "Tab للمسافة البادئة، Shift+Tab لإزالتها، Esc ثم Tab للخروج من المحرر.";
const RICH_HINT = "Tab للمسافة البادئة، Shift+Tab لإزالتها، Esc ثم Tab (أو Ctrl+M) للخروج من المحرر، Ctrl+F للبحث.";
const READ_ONLY_HINT = "للقراءة فقط";
const ENGINE_LOADING = "جارٍ تحميل المحرر المتقدم… يمكنك الكتابة الآن؛ لن يضيع شيء.";
const ENGINE_LOAD_FAILED = "تعذّر تحميل المحرر المتقدم؛ المحرر الأساسي يعمل بكامل وظائفه.";
const ENGINE_BROKEN = "تعذّر تشغيل المحرر المتقدم؛ تمت العودة إلى المحرر الأساسي دون فقدان الكود.";

type Handover = { offset: number } | null;
export type EngineFallbackReason = "environment" | "load-failed" | "create-failed" | "runtime-failed";
/** The engine state of ONE mount: native (first paint / loading) → rich (engine handle alive) → or `failed`, which is permanent for
 *  this mount: a rich engine that could not be created or that broke at runtime is never retried in a render loop (Review Fix 1). */
type EngineState = { status: "native" } | { status: "rich"; engine: EditorEngine; handover: Handover } | { status: "failed"; restore: Handover; reason: Exclude<EngineFallbackReason, "environment"> };
const stopEscape = (e: KeyboardEvent) => { if (e.key === "Escape") e.stopPropagation(); };

export default function CodingEditor(props: Props) {
  const [loader] = useState(() => getEditorEngineLoader());
  const [state, setState] = useState<EngineState>({ status: "native" });
  const [slow, setSlow] = useState(false);
  const nativeInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!loader) return;
    let live = true;
    loader().then(engine => {
      if (!live) return;
      const ta = nativeInput.current;                                               // a keyboard user mid-typing keeps focus + caret
      const handover: Handover = ta && document.activeElement === ta ? { offset: ta.selectionStart } : null;
      setState(s => (s.status === "failed" ? s : { status: "rich", engine, handover }));
    }, () => { if (live) setState(s => (s.status === "native" ? { status: "failed", restore: null, reason: "load-failed" } : s)); });   // offline / blocked chunk: the native editor stays, and says so
    return () => { live = false; };
  }, [loader]);
  useEffect(() => {                                                                  // the loading row, only after a real delay
    if (!loader || state.status !== "native") return;
    const t = setTimeout(() => setSlow(true), ENGINE_STATUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [loader, state.status]);
  // Review Fix 1: a synchronous engine.create failure is local to this editor. The adapter has already released whatever Monaco
  // allocated; here the native editor is restored at once (same source, no onChange, focus + caret back if the user was typing)
  // and the engine stays disabled for the rest of this mount. Reported, never thrown into the exam page.
  const onCreateFailure = (error: unknown, handover: Handover) => {
    console.error("[CodingEditor] the rich editor engine could not be created; the native editor stays.", error);
    setState({ status: "failed", restore: handover, reason: "create-failed" });
  };
  // Phase 18B: the same discipline for a failure AFTER creation (the engine is already released by the rich editor).
  const onRuntimeFailure = (error: unknown, restore: Handover, cleanupErrors: unknown[]) => {
    console.error("[CodingEditor] the rich editor engine failed at runtime; the native editor is restored with the current source.", error, ...cleanupErrors);
    setState({ status: "failed", restore, reason: "runtime-failed" });
  };
  if (state.status === "rich") return <RichCodingEditor {...props} engine={state.engine} handover={state.handover} onCreateFailure={onCreateFailure} onRuntimeFailure={onRuntimeFailure} />;
  const reason: EngineFallbackReason | undefined = !loader ? "environment" : state.status === "failed" ? state.reason : undefined;
  const engineStatus = state.status === "failed" ? (state.reason === "load-failed" ? ENGINE_LOAD_FAILED : ENGINE_BROKEN) : loader && slow ? ENGINE_LOADING : undefined;
  return <NativeCodingEditor {...props} inputRef={nativeInput} restore={state.status === "failed" ? state.restore : null} fallback={reason} engineStatus={engineStatus} />;
}

/** Shared meta row: the hint (aria-describedby target), the byte indicator near the limit, the refusal alert and the engine status. */
function EditorMeta({ hintId, hint, bytes, maxBytes, refused, engineStatus }: { hintId: string; hint: string; bytes: number; maxBytes?: number; refused: boolean; engineStatus?: string }) {
  const near = maxBytes !== undefined && bytes >= maxBytes * 0.8;
  return <>
    <div className="cx-code-meta">
      <span id={hintId}>{hint}</span>
      {near && <span className="cx-code-size is-near" data-testid="code-size">{bytes} / {maxBytes} بايت</span>}
    </div>
    {refused && <p className="cx-code-alert" role="alert">تجاوز الكود الحد الأقصى المسموح لحجمه ({maxBytes} بايت)؛ لم يُقبل التعديل الأخير.</p>}
    {engineStatus && <p className="cx-engine-status" role="status" data-testid="code-engine-status">{engineStatus}</p>}
  </>;
}

// ——— the professional editor: React owns the value, the engine handle owns the DOM ———————————————————————————————————————
type RichProps = Props & { engine: EditorEngine; handover: Handover; onCreateFailure: (error: unknown, handover: Handover) => void; onRuntimeFailure: (error: unknown, restore: Handover, cleanupErrors: unknown[]) => void };
function RichCodingEditor({ engine, handover, onCreateFailure, onRuntimeFailure, value, onChange, language, label, readOnly = false, maxBytes, minRows = 8, preferences = DEFAULT_EDITOR_PREFERENCES, layout = "auto" }: RichProps) {
  const host = useRef<HTMLDivElement>(null), handle = useRef<EditorEngineHandle | null>(null);
  const synced = useRef(value);                                                      // the last text both sides agree on
  const latest = useRef({ onChange, maxBytes, readOnly, onRuntimeFailure });
  useEffect(() => { latest.current = { onChange, maxBytes, readOnly, onRuntimeFailure }; });   // read at event time, never in render
  const [refused, setRefused] = useState(false);
  const hintId = useId();
  const unit = codingLanguage(language)?.indentUnit ?? "    ";
  const lines = useMemo(() => countLines(value), [value]);
  const bytes = useMemo(() => utf8ByteLength(value), [value]);
  const initial = useRef({ language, label, readOnly, unit, handover, onCreateFailure, preferences });

  // Phase 18B — every post-creation engine call goes through here: a throw releases the engine (best effort, every error collected)
  // and hands the native editor the caret if the user was typing. One report, no rethrow, no second attempt in this mount.
  const degrade = (error: unknown) => {
    const h = handle.current;
    handle.current = null;
    const cleanup: unknown[] = [];
    let restore: Handover = null;
    if (h) {
      try { if (h.hasFocus()) restore = { offset: h.getCursorOffset() }; } catch (e) { cleanup.push(e); }
      try { h.dispose(); } catch (e) { cleanup.push(e); }
    }
    latest.current.onRuntimeFailure(error, restore, cleanup);
  };
  const guard = (op: (h: EditorEngineHandle) => void) => {
    const h = handle.current;
    if (!h) return;
    try { op(h); } catch (error) { degrade(error); }
  };

  useLayoutEffect(() => {                                                            // created ONCE per engine; props sync below
    const start = initial.current;
    let h: EditorEngineHandle;
    try {
      h = engine.create(host.current!, {
        value: synced.current, languageMode: editorLanguageMode(start.language), label: start.label, readOnly: start.readOnly, describedBy: hintId, indentUnit: start.unit,
        accept: next => {
          const { maxBytes: limit, onChange: emit, readOnly: locked } = latest.current;
          if (locked) return false;                                                   // defence in depth: a read-only editor never emits
          if (limit !== undefined && utf8ByteLength(next) > limit) { setRefused(true); return false; }
          setRefused(false);
          synced.current = next;
          emit(next);
          return true;
        }
      });
    } catch (error) {
      start.onCreateFailure(error, start.handover);                                // → native editor, before this frame paints
      return;
    }
    handle.current = h;
    guard(x => x.setPreferences?.(start.preferences));
    if (start.handover) guard(x => { x.focus(); x.setCursorOffset(start.handover!.offset); });
    return () => {
      const live = handle.current;
      handle.current = null;
      if (!live) return;                                                             // already released by the degrade path
      try { live.dispose(); } catch (error) { console.error("[CodingEditor] releasing the rich editor engine failed; the page continues.", error); }
    };
  }, [engine, hintId]);
  useEffect(() => { if (value !== synced.current) { synced.current = value; guard(h => h.setValue(value)); } }, [value]);
  useSync(editorLanguageMode(language), mode => guard(h => h.setLanguage(mode)));
  useSync(readOnly, ro => guard(h => h.setReadOnly(ro)));
  useSync(label, l => guard(h => h.setLabel(l)));
  useSync(refused, flag => guard(h => h.setInvalid(flag)));
  useSync(preferences, p => guard(h => h.setPreferences?.(p)));

  const rows = Math.max(minRows, Math.min(lines + 1, MAX_ROWS));
  const style = layout === "fill" ? undefined : { height: rows * lineHeightFor(preferences.fontSize) + RICH_PADDING };
  return (
    <div className="cx-code-editor cx-code-editor--rich" dir="ltr" data-editor-engine={engine.kind} data-editor-layout={layout}>
      <div ref={host} className="cx-code-frame cx-code-rich" data-testid="code-rich-host" style={style} onKeyDown={stopEscape} />
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
type NativeProps = Props & { inputRef: RefObject<HTMLTextAreaElement | null>; restore?: Handover; fallback?: EngineFallbackReason; engineStatus?: string };
function NativeCodingEditor({ value, onChange, language, label, readOnly = false, maxBytes, minRows = 8, preferences = DEFAULT_EDITOR_PREFERENCES, layout = "auto", inputRef, restore = null, fallback, engineStatus }: NativeProps) {
  const ta = inputRef, gutter = useRef<HTMLPreElement>(null);
  useEffect(() => {                                                                  // Review Fix 1: focus + caret back after a failed hand-over
    const el = ta.current;
    if (restore && el) { el.focus(); el.setSelectionRange(restore.offset, restore.offset); }
  }, [restore, ta]);
  const pendingSelection = useRef<[number, number] | null>(null), tabReleased = useRef(false);
  const [refused, setRefused] = useState(false);
  const hintId = useId();
  const unit = codingLanguage(language)?.indentUnit ?? "    ";
  const lines = useMemo(() => countLines(value), [value]);
  const numbers = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join("\n"), [lines]);
  const bytes = useMemo(() => utf8ByteLength(value), [value]);
  // Line numbers are drawn only when they can be TRUE: a soft-wrapped line spans several visual rows, so the gutter is hidden with
  // wrap on (the rich engine numbers wrapped lines itself).
  const showGutter = preferences.lineNumbers && !preferences.wordWrap;

  useLayoutEffect(() => {
    const sel = pendingSelection.current, el = ta.current;
    if (sel && el) { pendingSelection.current = null; el.setSelectionRange(sel[0], sel[1]); }
  }, [value, ta]);

  const accept = (next: string): boolean => {
    if (readOnly) return false;                                                      // defence in depth: a read-only editor never emits
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
    if (e.key === "Escape") { e.stopPropagation(); if (!readOnly) tabReleased.current = true; return; }   // the editor's own escape hatch, never the page's
    if (readOnly || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
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

  const frameStyle = { "--cx-font-size": preferences.fontSize + "px" } as CSSProperties;
  return (
    <div className="cx-code-editor" dir="ltr" data-editor-engine="native" data-engine-fallback={fallback} data-editor-layout={layout}>
      <div className="cx-code-frame" style={frameStyle}>
        {showGutter && <pre ref={gutter} className="cx-code-gutter" data-testid="code-gutter" aria-hidden="true">{numbers}</pre>}
        <textarea
          ref={ta}
          className="cx-code-input"
          dir="ltr"
          aria-label={label}
          aria-describedby={hintId}
          aria-invalid={refused || undefined}
          value={value}
          rows={layout === "fill" ? undefined : Math.max(minRows, Math.min(lines + 1, MAX_ROWS))}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap={preferences.wordWrap ? "soft" : "off"}
          onChange={e => { accept(e.target.value); }}
          onKeyDown={onKeyDown}
          onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        />
      </div>
      <EditorMeta hintId={hintId} hint={readOnly ? READ_ONLY_HINT : NATIVE_HINT} bytes={bytes} maxBytes={maxBytes} refused={refused} engineStatus={engineStatus} />
    </div>
  );
}
