// Phase 17F-C1 — the editor ENGINE seam between React (CodingEditor.tsx) and the professional editor runtime (Monaco).
//
// CodingEditor always paints the dependency-free native <textarea> first. If this environment can host the rich engine, the
// loader below dynamically imports the Monaco engine chunk and the component hands the SAME source over to it; the engine is a
// text-editing surface only: SmartAssess keeps the canonical value (Answer / question config) and the engine never persists,
// executes, completes or contacts anything.
//
// The handle is deliberately small: the React side needs a controlled value, a syntax mode, read-only, aria and focus — nothing
// Monaco-specific leaks into callers (CodingResponse, CodingQuestionEditor). Tests inject a fake engine through
// setEditorEngineLoader(); production only ever uses the default loader.

export type EditorEngineHandle = {
  /** The engine's current source text (always equal to the last accepted value or the last setValue()). */
  getValue(): string;
  /** Controlled update from SmartAssess (draft restore, starter reset): replaces the text, never reported back through accept(). */
  setValue(next: string): void;
  setLanguage(mode: string): void;
  setReadOnly(readOnly: boolean): void;
  setLabel(label: string): void;
  /** aria-invalid on the input (byte limit refused). */
  setInvalid(invalid: boolean): void;
  focus(): void;
  hasFocus(): boolean;
  setCursorOffset(offset: number): void;
  getCursorOffset(): number;
  layout(): void;
  dispose(): void;
};
export type EditorEngineCreateOptions = {
  value: string;
  languageMode: string;
  label: string;
  readOnly: boolean;
  /** id of the on-screen hint (aria-describedby). */
  describedBy: string;
  indentUnit: string;
  /** Called with the FULL source after every user edit. Return false to refuse it: the engine reverts to the last accepted text. */
  accept: (next: string) => boolean;
};
export type EditorEngine = { kind: string; create(host: HTMLElement, options: EditorEngineCreateOptions): EditorEngineHandle };
export type EditorEngineLoader = () => Promise<EditorEngine>;

export const MONACO_ENGINE_KIND = "monaco";
/** Below this width (the existing coding CSS breakpoint) and on touch-primary devices the native editor is the deliberate choice:
 *  Monaco does not support mobile browsers (its own FAQ), and the textarea is the robust virtual-keyboard / IME surface. */
export const NATIVE_FALLBACK_MEDIA: readonly string[] = Object.freeze(["(max-width: 600px)", "(hover: none) and (pointer: coarse)"]);

export type RichEditorEnvironment = { matchMedia?: (query: string) => { matches: boolean }; layoutProbe?: () => boolean };

/** Does the current browser lay elements out at all? Monaco measures fonts and lines through real layout; a DOM without a layout
 *  engine (happy-dom, jsdom) must keep the native editor. One throw-away element, measured once. */
function defaultLayoutProbe(): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:10px;height:10px;pointer-events:none";
  document.body.appendChild(probe);
  const ok = probe.offsetWidth === 10 && probe.offsetHeight === 10;
  probe.remove();
  return ok;
}

/** Whether the rich engine may be loaded here. Pure given `env` (tests); the default reads the real window. */
export function richEditorAvailable(env: RichEditorEnvironment = {}): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const matchMedia = env.matchMedia ?? (typeof window.matchMedia === "function" ? (q: string) => window.matchMedia(q) : undefined);
  if (!matchMedia || typeof ResizeObserver !== "function") return false;
  for (const q of NATIVE_FALLBACK_MEDIA) if (matchMedia(q).matches) return false;
  return (env.layoutProbe ?? defaultLayoutProbe)();
}

// The default loader: ONE dynamic edge to the Monaco engine chunk (the only place in src/ that imports monaco-editor). Vite emits
// it (and Monaco's own per-language / worker edges) as lazy chunks far behind the coding question's lazy chunk.
const defaultLoader: EditorEngineLoader = () => import("./monacoEngine").then(m => m.monacoEngine);
let override: EditorEngineLoader | null | undefined;

/** The loader to use now, or null when this environment keeps the native editor. */
export function getEditorEngineLoader(): EditorEngineLoader | null {
  if (override !== undefined) return override;
  return richEditorAvailable() ? defaultLoader : null;
}
/** Test seam: a fake engine loader, `null` (force native) or `undefined` (restore the default). */
export function setEditorEngineLoader(loader: EditorEngineLoader | null | undefined): void { override = loader; }
