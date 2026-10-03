import type { EditorEngine, EditorEngineCreateOptions, EditorEngineHandle } from "./editorEngine";
import { MONACO_ENGINE_KIND } from "./editorEngine";
import { SMARTASSESS_EDITOR_THEME, editorCreateOptions } from "./editorOptions";

// Phase 17F-C1 — the Monaco ADAPTER: turns the Monaco API into the small EditorEngine handle that CodingEditor drives. It is a
// factory over a structural `MonacoLike` type so the unit tests prove it against a fake API (no worker, no layout); the engine
// module (monacoEngine.ts) is the only place the real `monaco-editor` is imported and instantiates this factory once.
//
// Contract: SmartAssess is the authority. Every user edit is offered through `accept(fullText)`; a refused edit (UTF-8 byte limit)
// is reverted to the last accepted text with the caret back at the edit point. A controlled `setValue` (draft restore, starter
// reset) replaces the model silently and is never echoed back. Nothing is persisted, executed, completed or sent anywhere.

type Position = { lineNumber: number; column: number };
type Disposable = { dispose(): void };
type ContentChange = { rangeOffset: number; rangeLength: number; text: string };
export type MonacoModelLike = { getValue(): string; setValue(value: string): void; setEOL(eol: number): void; getPositionAt(offset: number): Position; getOffsetAt(position: Position): number; getLanguageId(): string; dispose(): void };
export type MonacoEditorLike = {
  updateOptions(options: Record<string, unknown>): void;
  getModel(): MonacoModelLike | null;
  onDidChangeModelContent(listener: (e: { changes: ContentChange[] }) => void): Disposable;
  onKeyDown(listener: (e: { keyCode: number }) => void): Disposable;
  onDidBlurEditorWidget(listener: () => void): Disposable;
  focus(): void;
  hasTextFocus(): boolean;
  setPosition(position: Position): void;
  getPosition(): Position | null;
  revealPositionInCenterIfOutsideViewport(position: Position): void;
  layout(): void;
  dispose(): void;
};
export type MonacoLike = {
  editor: {
    defineTheme(name: string, data: unknown): void;
    createModel(value: string, language?: string): MonacoModelLike;
    setModelLanguage(model: MonacoModelLike, languageId: string): void;
    create(host: HTMLElement, options: Record<string, unknown>): MonacoEditorLike;
    EndOfLineSequence?: { LF: number };
  };
  KeyCode: { Escape: number; Tab: number };
};

const INPUT_SELECTOR = "textarea.inputarea, .native-edit-context";

export function createMonacoEngine(monaco: MonacoLike): EditorEngine {
  let themed = false;
  const ensureTheme = () => { if (!themed) { monaco.editor.defineTheme(SMARTASSESS_EDITOR_THEME.name, SMARTASSESS_EDITOR_THEME.data); themed = true; } };

  return {
    kind: MONACO_ENGINE_KIND,
    create(host: HTMLElement, o: EditorEngineCreateOptions): EditorEngineHandle {
      ensureTheme();
      const model = monaco.editor.createModel(o.value, o.languageMode);
      model.setEOL(monaco.editor.EndOfLineSequence?.LF ?? 0);                     // LF, exactly like the textarea it replaces
      const editor = monaco.editor.create(host, { ...editorCreateOptions({ value: o.value, languageMode: o.languageMode, label: o.label, readOnly: o.readOnly, indentUnit: o.indentUnit }), model });
      let accepted = model.getValue(), applying = false, armed = false, invalid = false, disposed = false;

      // Our aria on Monaco's input: no autocomplete is announced (there is none), the on-screen hint describes the editor and the
      // byte-limit refusal flags it invalid. Monaco rewrites some of these on option changes / focus, so they are re-applied after
      // every option update and watched by a MutationObserver.
      const input = () => host.querySelector<HTMLElement>(INPUT_SELECTOR);
      const applyAria = () => {
        const el = input();
        if (!el) return;
        if (el.getAttribute("aria-autocomplete") !== "none") el.setAttribute("aria-autocomplete", "none");
        if (el.getAttribute("aria-describedby") !== o.describedBy) el.setAttribute("aria-describedby", o.describedBy);
        if (invalid) { if (el.getAttribute("aria-invalid") !== "true") el.setAttribute("aria-invalid", "true"); }
        else if (el.hasAttribute("aria-invalid")) el.removeAttribute("aria-invalid");
      };
      applyAria();
      const observer = typeof MutationObserver === "function" ? new MutationObserver(applyAria) : null;
      const observed = input();
      if (observer && observed) observer.observe(observed, { attributes: true, attributeFilter: ["aria-autocomplete", "aria-describedby", "aria-invalid"] });
      const update = (options: Record<string, unknown>) => { editor.updateOptions(options); applyAria(); };
      const disarm = () => { armed = false; update({ tabFocusMode: false }); };

      const subscriptions: Disposable[] = [
        editor.onDidChangeModelContent(e => {
          if (applying || disposed) return;
          const next = model.getValue();
          if (o.accept(next)) { accepted = next; return; }
          // Refused: revert to the last accepted text, caret back at the edit point. Deferred — a model is never edited inside its
          // own change event — and guarded so the revert can never re-enter accept().
          const at = e.changes.length ? Math.min(...e.changes.map(c => c.rangeOffset)) : 0;
          queueMicrotask(() => {
            if (disposed) return;
            applying = true;
            try {
              model.setValue(accepted);
              const position = model.getPositionAt(Math.min(at, accepted.length));
              editor.setPosition(position);
              editor.revealPositionInCenterIfOutsideViewport(position);
            } finally { applying = false; }
          });
        }),
        // Esc arms tab-focus mode (Monaco's own escape hatch, also on Ctrl+M): the NEXT Tab moves browser focus instead of
        // indenting; any other key or leaving the editor disarms it so Tab indents again.
        editor.onKeyDown(e => {
          if (e.keyCode === monaco.KeyCode.Escape) { armed = true; update({ tabFocusMode: true }); }
          else if (e.keyCode !== monaco.KeyCode.Tab && armed) disarm();
        }),
        editor.onDidBlurEditorWidget(() => { if (armed) disarm(); })
      ];

      return {
        getValue: () => model.getValue(),
        setValue(next) {
          if (next === model.getValue()) return;                                    // no churn: the undo stack survives equal renders
          applying = true;
          try { model.setValue(next); } finally { applying = false; }
          accepted = model.getValue();
        },
        setLanguage(mode) { if (model.getLanguageId() !== mode) monaco.editor.setModelLanguage(model, mode); },
        setReadOnly(readOnly) { update({ readOnly, domReadOnly: readOnly }); },
        setLabel(label) { update({ ariaLabel: label }); },
        setInvalid(flag) { invalid = flag; applyAria(); },
        focus() { editor.focus(); },
        hasFocus: () => editor.hasTextFocus(),
        setCursorOffset(offset) { const position = model.getPositionAt(Math.max(0, Math.min(offset, model.getValue().length))); editor.setPosition(position); editor.revealPositionInCenterIfOutsideViewport(position); },
        getCursorOffset() { const p = editor.getPosition(); return p ? model.getOffsetAt(p) : 0; },
        layout() { editor.layout(); },
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const s of subscriptions) s.dispose();
          observer?.disconnect();
          editor.dispose();
          model.dispose();
          host.replaceChildren();
        }
      };
    }
  };
}
