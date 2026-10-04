// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createMonacoEngine, type MonacoLike } from "./monacoAdapter";
import { EDITOR_BASE_OPTIONS, editorPreferenceOptions } from "./editorOptions";
import { DEFAULT_EDITOR_PREFERENCES, lineHeightFor } from "../workspace/editorPreferences";
import type { EditorEngineCreateOptions } from "./editorEngine";

// Phase 18B — editor UI preferences through the Monaco adapter: ONE pure mapping (editorOptions.ts) from the device-level
// preferences to Monaco presentation options, applied with updateOptions on a live editor. Never a model change, never an
// accept() / onChange, never a new editor; the anti-assist attributes on the input survive the option update.

function fakeMonaco() {
  const calls = { updateOptions: [] as Record<string, unknown>[], modelSetValue: [] as string[], create: 0 };
  const model = { value: "print(1)\n", getValue: () => model.value, setValue(v: string) { calls.modelSetValue.push(v); model.value = v; }, setEOL: vi.fn(), getPositionAt: (o: number) => ({ lineNumber: 1, column: o + 1 }), getOffsetAt: (p: { column: number }) => p.column - 1, getLanguageId: () => "python", dispose() {} };
  let hostEl: HTMLElement | null = null;
  const editor = { updateOptions(o: Record<string, unknown>) { calls.updateOptions.push(o); hostEl!.querySelector("textarea")!.setAttribute("aria-autocomplete", "both"); }, getModel: () => model, onDidChangeModelContent: () => ({ dispose() {} }), onKeyDown: () => ({ dispose() {} }), onDidBlurEditorWidget: () => ({ dispose() {} }), focus() {}, hasTextFocus: () => false, setPosition() {}, getPosition: () => null, revealPositionInCenterIfOutsideViewport() {}, layout() {}, dispose() {} };
  const monaco: MonacoLike = {
    editor: { defineTheme() {}, createModel: () => model, setModelLanguage() {}, create: host => { calls.create++; hostEl = host; const ta = document.createElement("textarea"); ta.className = "inputarea"; host.appendChild(ta); return editor; } },
    KeyCode: { Escape: 9, Tab: 2 }
  };
  return { monaco, calls, input: () => hostEl!.querySelector("textarea.inputarea") as HTMLTextAreaElement };
}
const opts = (accept = vi.fn(() => true)): EditorEngineCreateOptions => ({ value: "print(1)\n", languageMode: "python", label: "محرر الكود", readOnly: false, describedBy: "hint-1", indentUnit: "    ", accept });

describe("18B Monaco adapter — preferences", () => {
  it("the pure mapping: font size + derived line height, wrap on/off, minimap, line numbers — nothing else; defaults reproduce the base options", () => {
    expect(editorPreferenceOptions(DEFAULT_EDITOR_PREFERENCES)).toEqual({ fontSize: 14, lineHeight: 22, wordWrap: "off", minimap: { enabled: false }, lineNumbers: "on" });
    expect(editorPreferenceOptions(DEFAULT_EDITOR_PREFERENCES)).toEqual({ fontSize: EDITOR_BASE_OPTIONS.fontSize, lineHeight: EDITOR_BASE_OPTIONS.lineHeight, wordWrap: EDITOR_BASE_OPTIONS.wordWrap, minimap: EDITOR_BASE_OPTIONS.minimap, lineNumbers: EDITOR_BASE_OPTIONS.lineNumbers });
    expect(editorPreferenceOptions({ fontSize: 18, wordWrap: true, minimap: true, lineNumbers: false })).toEqual({ fontSize: 18, lineHeight: lineHeightFor(18), wordWrap: "on", minimap: { enabled: true }, lineNumbers: "off" });
    expect(Object.keys(editorPreferenceOptions(DEFAULT_EDITOR_PREFERENCES)).sort()).toEqual(["fontSize", "lineHeight", "lineNumbers", "minimap", "wordWrap"]);
  });
  it("setPreferences applies exactly the mapping through updateOptions, touches no model text, fires no accept, creates no editor, and re-hardens the input", () => {
    const f = fakeMonaco();
    const accept = vi.fn(() => true);
    const h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts(accept));
    expect(f.calls.create).toBe(1);
    h.setPreferences!({ fontSize: 16, wordWrap: true, minimap: false, lineNumbers: true });
    expect(f.calls.updateOptions.at(-1)).toEqual({ fontSize: 16, lineHeight: lineHeightFor(16), wordWrap: "on", minimap: { enabled: false }, lineNumbers: "on" });
    expect(f.calls.modelSetValue).toEqual([]);
    expect(accept).not.toHaveBeenCalled();
    expect(f.calls.create).toBe(1);
    expect(h.getValue()).toBe("print(1)\n");
    expect(f.input().getAttribute("aria-autocomplete")).toBe("none");                                     // Monaco rewrote it; the adapter restored it
  });
  it("after dispose, setPreferences is a no-op (never touches a released editor)", () => {
    const f = fakeMonaco();
    const h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    h.dispose();
    const n = f.calls.updateOptions.length;
    expect(() => h.setPreferences!(DEFAULT_EDITOR_PREFERENCES)).not.toThrow();
    expect(f.calls.updateOptions.length).toBe(n);
  });
});
