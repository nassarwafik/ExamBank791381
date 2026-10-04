// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import CodingEditor from "./CodingEditor";
import { setEditorEngineLoader, type EditorEngine, type EditorEngineCreateOptions, type EditorEngineHandle } from "./editor/editorEngine";
import { DEFAULT_EDITOR_PREFERENCES, lineHeightFor, type EditorPreferences } from "./workspace/editorPreferences";

// Phase 18B — CodingEditor inside the enterprise workspace. Two DEFECTS found by the 18B audit are pinned fail-first here (they fail
// on the untouched 17F baseline):
//   D1  Escape pressed INSIDE the editor bubbled to document-level listeners — in the teacher preview (ExamPreview's focus trap)
//       the preview closed while the author was merely using the editor's own «Esc ثم Tab» escape hatch;
//   D2  an engine failure AFTER creation (a Monaco model / editor method throwing during a controlled update: draft restore,
//       language switch, read-only flip) was unguarded: it propagated into React, unmounted the question subtree and the student's
//       source disappeared from the page. 18B degrades such a failure to the native editor with the canonical source intact.
// The remaining tests pin the NEW contract: UI preferences (font size, wrap, minimap, line numbers) reach the engine and the native
// editor as presentation only, the fill layout for focus mode, the loading / failure status row, and LTR inside RTL.

type FakeHandle = EditorEngineHandle & { o: EditorEngineCreateOptions; value: string; mode: string; readOnly: boolean; prefs: EditorPreferences[]; disposed: number; focused: boolean; cursor: number; setValueCalls: string[]; type(text: string): boolean };
type Faults = { setValueThrows?: boolean; setLanguageThrows?: boolean; disposeThrows?: boolean; noSetPreferences?: boolean };
function fakeEngine(kind = "fake", faults: Faults = {}) {
  const handles: FakeHandle[] = [];
  const engine: EditorEngine = {
    kind,
    create(host, o) {
      host.setAttribute("data-fake-engine", kind);
      const input = document.createElement("textarea");                     // Monaco's own input lives INSIDE the host
      input.className = "inputarea";
      host.appendChild(input);
      const h: FakeHandle = {
        o, value: o.value, mode: o.languageMode, readOnly: o.readOnly, prefs: [], disposed: 0, focused: false, cursor: 0, setValueCalls: [],
        getValue: () => h.value,
        setValue(v) { if (faults.setValueThrows) throw new Error("fault: model disposed"); h.setValueCalls.push(v); h.value = v; },
        setLanguage(m) { if (faults.setLanguageThrows) throw new Error("fault: setModelLanguage"); h.mode = m; },
        setReadOnly(r) { h.readOnly = r; }, setLabel() {}, setInvalid() {},
        focus() { h.focused = true; input.focus(); }, hasFocus: () => document.activeElement === input, setCursorOffset(n) { h.cursor = n; }, getCursorOffset: () => h.cursor, layout() {},
        dispose() { h.disposed++; if (faults.disposeThrows) throw new Error("fault: dispose"); host.innerHTML = ""; },
        type(text) { const next = h.value + text; const ok = o.accept(next); if (ok) h.value = next; return ok; }
      };
      if (!faults.noSetPreferences) h.setPreferences = p => { h.prefs.push(p); };
      handles.push(h);
      return h;
    }
  };
  return { engine, handles, loader: () => Promise.resolve(engine) };
}
const tick = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
const rich = () => screen.queryByTestId("code-rich-host");
const native = () => screen.queryByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement | null;
const editorRoot = () => document.querySelector(".cx-code-editor") as HTMLElement;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); setEditorEngineLoader(undefined); errors.mockRestore(); });

describe("18B D1 — Escape inside the editor never reaches document-level listeners (fail-first on the 17F baseline)", () => {
  it("native editor: Escape is consumed by the editor's own escape hatch and does not bubble to document; other keys still do", () => {
    setEditorEngineLoader(null);
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => { seen.push(e.key); };
    document.addEventListener("keydown", listener);
    try {
      render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
      const ta = native()!;
      fireEvent.keyDown(ta, { key: "Escape" });
      fireEvent.keyDown(ta, { key: "a" });
      expect(seen).toEqual(["a"]);
    } finally { document.removeEventListener("keydown", listener); }
  });
  it("rich editor: Escape from the engine's input surface is consumed at the editor boundary; a plain key still bubbles", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => { seen.push(e.key); };
    document.addEventListener("keydown", listener);
    try {
      render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
      await tick();
      const input = rich()!.querySelector("textarea.inputarea")!;
      fireEvent.keyDown(input, { key: "Escape" });
      fireEvent.keyDown(input, { key: "Tab" });
      expect(seen).toEqual(["Tab"]);
    } finally { document.removeEventListener("keydown", listener); }
  });
});

describe("18B D2 — an engine failure AFTER creation degrades to the native editor with the canonical source intact (fail-first)", () => {
  it("setValue throwing during a controlled restore: the native editor shows the restored source, onChange is not called, reported once", async () => {
    const f = fakeEngine("faulty", { setValueThrows: true }); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value="draft = 1\n" onChange={onChange} language="python" label="محرر الكود" />);
    await tick();
    expect(rich()).toBeTruthy();
    const restored = "restored = True  # سلام 🎉\n";
    expect(() => rerender(<CodingEditor value={restored} onChange={onChange} language="python" label="محرر الكود" />)).not.toThrow();
    await tick();
    expect(rich()).toBeNull();
    expect(native()).toBeTruthy();
    expect(native()!.value).toBe(restored);
    expect(editorRoot().getAttribute("data-engine-fallback")).toBe("runtime-failed");
    expect(onChange).not.toHaveBeenCalled();
    expect(f.handles[0].disposed).toBe(1);
    expect(errors).toHaveBeenCalledTimes(1);
    fireEvent.change(native()!, { target: { value: restored + "x = 2\n" } });                              // still editable
    expect(onChange).toHaveBeenCalledWith(restored + "x = 2\n");
  });
  it("setLanguage throwing during a language switch degrades the same way; the source is byte-identical; dispose errors cannot crash the page", async () => {
    const f = fakeEngine("faulty", { setLanguageThrows: true, disposeThrows: true }); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const src = "int x = 5;";
    const { rerender } = render(<CodingEditor value={src} onChange={onChange} language="java" label="محرر الكود" />);
    await tick();
    expect(() => rerender(<CodingEditor value={src} onChange={onChange} language="csharp" label="محرر الكود" />)).not.toThrow();
    await tick();
    expect(native()!.value).toBe(src);
    expect(onChange).not.toHaveBeenCalled();
    expect(editorRoot().getAttribute("data-engine-fallback")).toBe("runtime-failed");
  });
  it("a user typing in the rich editor when it fails gets the native editor back WITH focus (no silent focus loss)", async () => {
    const f = fakeEngine("faulty", { setValueThrows: true }); setEditorEngineLoader(f.loader);
    const { rerender } = render(<CodingEditor value="abc" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    f.handles[0].focus(); f.handles[0].cursor = 2;
    rerender(<CodingEditor value="abcd" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(document.activeElement).toBe(native());
    expect(native()!.selectionStart).toBe(2);
  });
});

describe("18B — editor UI preferences are presentation only", () => {
  const prefs: EditorPreferences = { fontSize: 18, wordWrap: true, minimap: true, lineNumbers: false };
  it("the rich engine receives the preferences after creation and on every change; value, mode and onChange are untouched", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value="print(1)" onChange={onChange} language="python" label="محرر الكود" />);
    await tick();
    const h = f.handles[0];
    expect(h.prefs).toEqual([DEFAULT_EDITOR_PREFERENCES]);
    rerender(<CodingEditor value="print(1)" onChange={onChange} language="python" label="محرر الكود" preferences={prefs} />);
    expect(h.prefs).toEqual([DEFAULT_EDITOR_PREFERENCES, prefs]);
    expect(h.value).toBe("print(1)"); expect(h.mode).toBe("python"); expect(h.setValueCalls).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
    expect(f.handles).toHaveLength(1);
  });
  it("an engine without setPreferences (older fake) is tolerated", async () => {
    const f = fakeEngine("old", { noSetPreferences: true }); setEditorEngineLoader(f.loader);
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" preferences={prefs} />);
    await tick();
    expect(rich()).toBeTruthy();
  });
  it("the rich host height follows the preferred font size (line height scales), still capped", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const { rerender } = render(<CodingEditor value={"a\nb\nc"} onChange={() => {}} language="python" label="محرر الكود" minRows={8} />);
    await tick();
    const base = parseInt(rich()!.style.height, 10);
    rerender(<CodingEditor value={"a\nb\nc"} onChange={() => {}} language="python" label="محرر الكود" minRows={8} preferences={{ ...DEFAULT_EDITOR_PREFERENCES, fontSize: 20 }} />);
    expect(parseInt(rich()!.style.height, 10)).toBe(8 * lineHeightFor(20) + (base - 8 * lineHeightFor(14)));
  });
  it("the native editor: font size through a CSS variable, soft wrap through the wrap attribute, the gutter follows the line-number preference; the value is untouched", () => {
    setEditorEngineLoader(null);
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value={"a\nb"} onChange={onChange} language="python" label="محرر الكود" />);
    expect(native()!.getAttribute("wrap")).toBe("off");
    expect(screen.getByTestId("code-gutter")).toBeTruthy();
    rerender(<CodingEditor value={"a\nb"} onChange={onChange} language="python" label="محرر الكود" preferences={prefs} />);
    expect(native()!.getAttribute("wrap")).toBe("soft");
    expect(screen.queryByTestId("code-gutter")).toBeNull();
    expect((native()!.closest(".cx-code-frame") as HTMLElement).style.getPropertyValue("--cx-font-size")).toBe("18px");
    expect(native()!.value).toBe("a\nb");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("18B — fill layout (focus mode), loading / failure status, LTR inside RTL", () => {
  it("layout='fill' drops the inline row height so CSS owns the editor size; 'auto' keeps the bounded row height", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const { rerender } = render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" layout="fill" />);
    await tick();
    expect(rich()!.style.height).toBe("");
    expect(editorRoot().getAttribute("data-editor-layout")).toBe("fill");
    rerender(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    expect(rich()!.style.height).not.toBe("");
    expect(editorRoot().getAttribute("data-editor-layout")).toBe("auto");
    expect(f.handles).toHaveLength(1);                                                                     // a layout change never re-creates the engine
  });
  it("native fill layout: the textarea has no row cap", () => {
    setEditorEngineLoader(null);
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" layout="fill" />);
    expect(native()!.hasAttribute("rows")).toBe(false);
    expect(editorRoot().getAttribute("data-editor-layout")).toBe("fill");
  });
  it("a slow engine chunk shows a polite loading status after a short delay; it disappears when the engine takes over", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (e: EditorEngine) => void;
      setEditorEngineLoader(() => new Promise<EditorEngine>(r => { resolve = r; }));
      render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
      expect(screen.queryByTestId("code-engine-status")).toBeNull();
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.getByTestId("code-engine-status").textContent).toMatch(/جارٍ تحميل المحرر المتقدم/);
      expect(screen.getByTestId("code-engine-status").getAttribute("role")).toBe("status");
      const g = fakeEngine();
      await act(async () => { resolve(g.engine); await Promise.resolve(); });
      expect(screen.queryByTestId("code-engine-status")).toBeNull();
      expect(rich()).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });
  it("a chunk that fails to load keeps the native editor, says so once (status), and marks the fallback reason", async () => {
    setEditorEngineLoader(() => Promise.reject(new Error("chunk failed")));
    render(<CodingEditor value="keep me" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(native()!.value).toBe("keep me");
    expect(screen.getByTestId("code-engine-status").textContent).toMatch(/المحرر الأساسي/);
    expect(editorRoot().getAttribute("data-engine-fallback")).toBe("load-failed");
  });
  it("without a rich engine (unsupported environment) there is no status noise and the fallback reason is explicit", () => {
    setEditorEngineLoader(null);
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    expect(screen.queryByTestId("code-engine-status")).toBeNull();
    expect(editorRoot().getAttribute("data-engine-fallback")).toBe("environment");
  });
  it("inside an RTL page the editor, its frame and its input are LTR and left-aligned; the hint row stays RTL", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    render(<div dir="rtl"><CodingEditor value="print('a')" onChange={() => {}} language="python" label="محرر الكود" /></div>);
    expect(native()!.getAttribute("dir")).toBe("ltr");
    expect(editorRoot().getAttribute("dir")).toBe("ltr");
    await tick();
    expect(editorRoot().getAttribute("dir")).toBe("ltr");
    expect(rich()!.closest("[dir]")!.getAttribute("dir")).toBe("ltr");
  });
});
