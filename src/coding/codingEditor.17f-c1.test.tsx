// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import CodingEditor from "./CodingEditor";
import { getEditorEngineLoader, richEditorAvailable, setEditorEngineLoader, type EditorEngine, type EditorEngineCreateOptions, type EditorEngineHandle } from "./editor/editorEngine";

// Phase 17F-C1 — ONE CodingEditor, two surfaces: the dependency-free native <textarea> (first paint, phones / touch devices,
// happy-dom, engine failure) and the professional engine (Monaco) that takes over when its lazy chunk resolves. These tests drive
// the React side with a FAKE engine (the Monaco adapter has its own suite) and prove the controlled-value / autosave contract,
// the byte limit, language switching, read-only, focus hand-over, bounded layout, disposal and the source-level lazy / privacy guards.

type FakeHandle = EditorEngineHandle & { o: EditorEngineCreateOptions; value: string; mode: string; readOnly: boolean; label: string; invalid: boolean; disposed: number; focused: boolean; cursor: number; setValueCalls: string[]; type(text: string): boolean };
function fakeEngine(kind = "fake") {
  const handles: FakeHandle[] = [];
  const engine: EditorEngine = {
    kind,
    create(host, o) {
      host.setAttribute("data-fake-engine", kind);
      const h: FakeHandle = {
        o, value: o.value, mode: o.languageMode, readOnly: o.readOnly, label: o.label, invalid: false, disposed: 0, focused: false, cursor: 0, setValueCalls: [],
        getValue: () => h.value, setValue(v) { h.setValueCalls.push(v); h.value = v; }, setLanguage(m) { h.mode = m; }, setReadOnly(r) { h.readOnly = r; }, setLabel(l) { h.label = l; }, setInvalid(i) { h.invalid = i; },
        focus() { h.focused = true; }, hasFocus: () => h.focused, setCursorOffset(n) { h.cursor = n; }, getCursorOffset: () => h.cursor, layout() {}, dispose() { h.disposed++; host.innerHTML = ""; },
        type(text) { const next = h.value + text; const ok = o.accept(next); if (ok) h.value = next; return ok; }
      };
      handles.push(h);
      return h;
    }
  };
  return { engine, handles, loader: () => Promise.resolve(engine) };
}
const tick = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
/** A user edit in the fake engine, inside act() (it may set React state: refusal / alert). */
const typeIn = (h: FakeHandle, text: string) => { let ok = false; act(() => { ok = h.type(text); }); return ok; };
const rich = () => screen.queryByTestId("code-rich-host");
const native = () => screen.queryByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement | null;
afterEach(() => { cleanup(); setEditorEngineLoader(undefined); });

describe("17F-C1 CodingEditor — engine selection", () => {
  it("in this (happy-dom) environment the default loader is null: richEditorAvailable() is false, so no suite ever loads Monaco; the checks are explicit", () => {
    expect(richEditorAvailable()).toBe(false);
    expect(getEditorEngineLoader()).toBeNull();
    const ok = { matchMedia: () => ({ matches: false }), layoutProbe: () => true };
    expect(richEditorAvailable(ok)).toBe(true);
    expect(richEditorAvailable({ ...ok, matchMedia: (q: string) => ({ matches: q.includes("max-width") }) })).toBe(false);                   // phone width → native
    expect(richEditorAvailable({ ...ok, matchMedia: (q: string) => ({ matches: q.includes("pointer: coarse") }) })).toBe(false);             // touch-primary device → native
    expect(richEditorAvailable({ ...ok, layoutProbe: () => false })).toBe(false);                                                            // no layout engine → native
  });
  it("without a rich engine the native textarea editor renders with its original contract (gutter, LTR, label) and is marked native", () => {
    setEditorEngineLoader(null);
    render(<CodingEditor value={"a\nb"} onChange={() => {}} language="python" label="محرر الكود" />);
    const ta = native()!;
    expect(ta.className).toContain("cx-code-input");
    expect(screen.getByTestId("code-gutter").textContent).toBe("1\n2");
    expect(ta.closest(".cx-code-editor")!.getAttribute("data-editor-engine")).toBe("native");
    expect(ta.closest(".cx-code-editor")!.getAttribute("dir")).toBe("ltr");
    expect(rich()).toBeNull();
  });
  it("the native editor paints FIRST and the rich engine takes over when its lazy chunk resolves, receiving the exact value, mode, label and read-only state (ED1, ED32)", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    render(<CodingEditor value={"def main():\n    pass\n"} onChange={() => {}} language="python" label="محرر الكود" />);
    expect(native()).toBeTruthy();
    await tick();
    expect(native()).toBeNull();
    const host = rich()!;
    expect(host.getAttribute("data-fake-engine")).toBe("fake");
    expect(host.closest(".cx-code-editor")!.getAttribute("data-editor-engine")).toBe("fake");
    expect(host.closest(".cx-code-editor")!.getAttribute("dir")).toBe("ltr");
    expect(f.handles).toHaveLength(1);
    expect(f.handles[0].o).toMatchObject({ value: "def main():\n    pass\n", languageMode: "python", label: "محرر الكود", readOnly: false, indentUnit: "    " });
    expect(f.handles[0].o.describedBy).toBeTruthy();
    expect(document.getElementById(f.handles[0].o.describedBy)!.textContent).toMatch(/Esc ثم Tab/);
  });
  it("an engine that fails to load (offline, blocked chunk) leaves the native editor in place and editing keeps working", async () => {
    setEditorEngineLoader(() => Promise.reject(new Error("chunk failed")));
    const onChange = vi.fn();
    render(<CodingEditor value="x" onChange={onChange} language="python" label="محرر الكود" />);
    await tick();
    expect(rich()).toBeNull();
    fireEvent.change(native()!, { target: { value: "xy" } });
    expect(onChange).toHaveBeenCalledWith("xy");
  });
});

describe("17F-C1 CodingEditor — controlled value, autosave integrity and the byte limit (ED20–ED22, M10, M12)", () => {
  it("ED20 / ED21 an edit emits exactly the text; an equal re-render never touches the engine; an external change (restore) is pushed once and never echoed", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value="x = 1" onChange={onChange} language="python" label="محرر الكود" />);
    await tick();
    const h = f.handles[0];
    expect(typeIn(h, "\nprint(x)  # ✓")).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("x = 1\nprint(x)  # ✓");
    rerender(<CodingEditor value={"x = 1\nprint(x)  # ✓"} onChange={onChange} language="python" label="محرر الكود" />);
    expect(h.setValueCalls).toEqual([]);
    rerender(<CodingEditor value={"restored = True\r\n"} onChange={onChange} language="python" label="محرر الكود" />);
    expect(h.setValueCalls).toEqual(["restored = True\r\n"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(f.handles).toHaveLength(1);                                                                     // no re-creation on render
  });
  it("ED22 / M10 the UTF-8 byte limit is enforced on rich edits with multibyte text: refused edits never reach onChange, the Arabic alert appears, the input is flagged invalid; the next edit within the limit clears it", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    render(<CodingEditor value="abc" onChange={onChange} language="python" label="محرر الكود" maxBytes={12} />);
    await tick();
    const h = f.handles[0];
    expect(typeIn(h, "🎉🎉🎉")).toBe(false);                                                                   // 3 + 12 = 15 bytes > 12
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/الحد الأقصى|12 بايت/);
    expect(h.invalid).toBe(true);
    expect(typeIn(h, "é")).toBe(true);                                                                        // 3 + 2 = 5 bytes
    expect(onChange).toHaveBeenCalledWith("abcé");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.invalid).toBe(false);
  });
  it("the size indicator near the limit and read-only hint stay with the rich editor (ED24)", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const { rerender } = render(<CodingEditor value={"x".repeat(900)} onChange={() => {}} language="python" label="محرر الكود" maxBytes={1024} />);
    await tick();
    expect(screen.getByTestId("code-size").textContent).toMatch(/900 \/ 1024/);
    rerender(<CodingEditor value={"x".repeat(900)} onChange={() => {}} language="python" label="محرر الكود" maxBytes={1024} readOnly />);
    expect(f.handles[0].readOnly).toBe(true);
    expect(document.getElementById(f.handles[0].o.describedBy)!.textContent).toBe("للقراءة فقط");
  });
});

describe("17F-C1 CodingEditor — language switching, focus hand-over, layout and disposal (ED4, ED23, ED27, ED31, ED33, M11, M13)", () => {
  it("ED4 / ED23 / M13 a language change switches the syntax mode of the live editor and never rewrites or re-emits the source", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value="int x = 5;" onChange={onChange} language="java" label="محرر الكود" />);
    await tick();
    const h = f.handles[0];
    expect(h.mode).toBe("java");
    rerender(<CodingEditor value="int x = 5;" onChange={onChange} language="csharp" label="محرر الكود" />);
    expect(h.mode).toBe("csharp");
    expect(h.value).toBe("int x = 5;");
    expect(h.setValueCalls).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<CodingEditor value="print(5)" onChange={onChange} language="python" label="محرر الكود" />);  // the per-language draft restore: mode + value together
    expect(h.mode).toBe("python");
    expect(h.setValueCalls).toEqual(["print(5)"]);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("ED31 a keyboard user typing in the native editor is handed over to the rich editor WITH focus and caret; the hint documents Esc-then-Tab and Ctrl+M", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    render(<CodingEditor value="hello world" onChange={() => {}} language="python" label="محرر الكود" />);
    const ta = native()!;
    ta.focus(); ta.setSelectionRange(5, 5);
    expect(document.activeElement).toBe(ta);
    await tick();
    expect(f.handles[0].focused).toBe(true);
    expect(f.handles[0].cursor).toBe(5);
    expect(document.getElementById(f.handles[0].o.describedBy)!.textContent).toMatch(/Ctrl\+M/);
  });
  it("ED33 the rich host height follows the line count between minRows and a 30-row cap (long sources scroll INSIDE the editor)", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const { rerender } = render(<CodingEditor value={"a\nb\nc"} onChange={() => {}} language="python" label="محرر الكود" minRows={8} />);
    await tick();
    const short = parseInt(rich()!.style.height, 10);
    rerender(<CodingEditor value={Array.from({ length: 200 }, (_, i) => "line " + i).join("\n")} onChange={() => {}} language="python" label="محرر الكود" minRows={8} />);
    const long = parseInt(rich()!.style.height, 10);
    rerender(<CodingEditor value={Array.from({ length: 400 }, (_, i) => "line " + i).join("\n")} onChange={() => {}} language="python" label="محرر الكود" minRows={8} />);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(parseInt(rich()!.style.height, 10)).toBe(long);                                                 // capped
    expect(rich()!.className).toContain("cx-code-rich");
  });
  it("ED27 / M11 unmounting disposes the engine handle exactly once; a late-resolving loader after unmount creates nothing", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const { unmount } = render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(f.handles[0].disposed).toBe(0);
    unmount();
    expect(f.handles[0].disposed).toBe(1);
    let resolve!: (e: EditorEngine) => void;
    setEditorEngineLoader(() => new Promise<EditorEngine>(r => { resolve = r; }));
    const g = fakeEngine("late");
    const second = render(<CodingEditor value="y" onChange={() => {}} language="python" label="محرر الكود" />);
    second.unmount();
    await act(async () => { resolve(g.engine); await new Promise(r => setTimeout(r, 0)); });
    expect(g.handles).toHaveLength(0);
  });
});

describe("17F-C1 Review Fix 1 — engine.create failure falls back to the native editor (RF1-A…F, RM1, RM2)", () => {
  /** An engine whose create() throws (always, or only the first `failTimes` calls); counts every attempt. */
  function throwingEngine(failTimes = Infinity) {
    const inner = fakeEngine("throwing");
    let attempts = 0;
    const engine: EditorEngine = { kind: "throwing", create(host, o) { attempts++; if (attempts <= failTimes) throw new Error("fault: engine.create"); return inner.engine.create(host, o); } };
    return { engine, inner, loader: () => Promise.resolve(engine), attempts: () => attempts };
  }
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { errors.mockRestore(); });

  it("RF1-A a rejecting loader keeps the native editor (unchanged behaviour)", async () => {
    setEditorEngineLoader(() => Promise.reject(new Error("chunk failed")));
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(native()).toBeTruthy(); expect(rich()).toBeNull();
  });
  it("RF1-B / RF1-C / RF1-D the loader resolves but engine.create throws → the native editor is restored immediately and usable; no onChange; source byte-identical", async () => {
    const t = throwingEngine(); setEditorEngineLoader(t.loader);
    const onChange = vi.fn();
    const src = "def main():\n    print('سلام 🎉')\n";
    render(<CodingEditor value={src} onChange={onChange} language="python" label="محرر الكود" />);
    await tick();
    const ta = native();
    expect(ta).toBeTruthy();
    expect(rich()).toBeNull();
    expect(ta!.value).toBe(src);
    expect(onChange).not.toHaveBeenCalled();
    expect(ta!.closest(".cx-code-editor")!.getAttribute("data-editor-engine")).toBe("native");
    expect(ta!.closest(".cx-code-editor")!.getAttribute("data-engine-fallback")).toBe("create-failed");
    fireEvent.change(ta!, { target: { value: src + "x = 1\n" } });                                     // still usable
    expect(onChange).toHaveBeenCalledWith(src + "x = 1\n");
    expect(errors).toHaveBeenCalledTimes(1);                                                             // reported once, locally, not thrown into React
  });
  it("RF1-E a failed engine is NOT retried on later renders (value / language / readOnly changes): exactly one create attempt", async () => {
    const t = throwingEngine(1); setEditorEngineLoader(t.loader);                                    // would succeed on a retry — must never get one
    const { rerender } = render(<CodingEditor value="a" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(t.attempts()).toBe(1);
    rerender(<CodingEditor value="b" onChange={() => {}} language="java" label="محرر الكود" readOnly />);
    rerender(<CodingEditor value="c" onChange={() => {}} language="csharp" label="محرر الكود" />);
    await tick();
    expect(t.attempts()).toBe(1);
    expect(rich()).toBeNull();
    expect(native()!.value).toBe("c");
  });
  it("RF1-F focus: a user typing in the native editor when the failing hand-over happens gets the native editor back WITH focus and caret", async () => {
    const t = throwingEngine(); setEditorEngineLoader(t.loader);
    render(<CodingEditor value="hello world" onChange={() => {}} language="python" label="محرر الكود" />);
    const before = native()!;
    before.focus(); before.setSelectionRange(5, 5);
    await tick();
    const after = native()!;
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBe(5);
  });
  it("RF1-F unmount after a failed creation: nothing to dispose, no second error, no leak", async () => {
    const t = throwingEngine(); setEditorEngineLoader(t.loader);
    const { unmount } = render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    await tick();
    expect(() => unmount()).not.toThrow();
    expect(t.inner.handles).toHaveLength(0);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe("17F-C1 Review Fix 1 — native textarea anti-assist contract (RF2-D)", () => {
  it("the native textarea keeps autocomplete=off, autocorrect=off, autocapitalize=off, spellcheck=false", () => {
    setEditorEngineLoader(null);
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    const ta = native()!;
    expect(ta.getAttribute("autocomplete")).toBe("off");
    expect(ta.getAttribute("autocorrect")).toBe("off");
    expect(ta.getAttribute("autocapitalize")).toBe("off");
    expect(ta.getAttribute("spellcheck")).toBe("false");
  });
});

describe("17F-C1 source guards — lazy boundary, no CDN, no completion contributions (ED25, ED26, ED34, M9, M14)", () => {
  const root = path.resolve(__dirname, "..");
  /** Source without `//` comments (the comments NAME what is excluded; the guards check what the code does). */
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/[^"'\n]*$/gm, "");
  const srcFiles = (fs.readdirSync(root, { recursive: true }) as string[]).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".d.ts"));
  it("ED26 / M9 only the Monaco engine module imports monaco-editor; CodingEditor reaches it ONLY through a dynamic import() in the engine loader", () => {
    const importers = srcFiles.filter(f => /from\s+["']monaco-editor|import\s+["']monaco-editor/.test(read(f)));
    expect(importers).toEqual(["coding/editor/monacoEngine.ts"]);
    expect(read("coding/CodingEditor.tsx")).not.toMatch(/monaco/i);
    expect(read("coding/editor/editorEngine.ts")).toMatch(/import\(\s*["']\.\/monacoEngine["']\s*\)/);
    expect(read("coding/editor/editorEngine.ts")).not.toMatch(/^import .*monacoEngine/m);
  });
  it("ED11–ED19 (defence in depth) the engine module never imports a Monaco contribution that could offer solution assistance", () => {
    const src = read("coding/editor/monacoEngine.ts");
    for (const forbidden of ["contrib/suggest", "contrib/parameterHints", "contrib/inlineCompletions", "contrib/snippet", "contrib/codeAction", "contrib/codelens", "contrib/rename", "contrib/gotoSymbol", "contrib/inlayHints", "contrib/hover", "contrib/links", "contrib/format", "contrib/dropOrPasteInto", "quickAccess", "editor.main", "languages/features", "register.all", "editor.all", "monaco-editor\"", "monaco-editor'"]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
    for (const required of ["languages/definitions/python/register", "languages/definitions/java/register", "languages/definitions/csharp/register", "contrib/bracketMatching", "contrib/folding", "features/find/register", "toggleTabFocusMode", "editor.worker"]) {
      expect(src, required).toContain(required);
    }
  });
  it("ED34 / M14 editor assets are our own: no http(s) / CDN reference in the editor modules; the worker is a bundled ?worker module", () => {
    for (const f of ["coding/editor/monacoEngine.ts", "coding/editor/monacoAdapter.ts", "coding/editor/editorEngine.ts", "coding/editor/editorOptions.ts", "coding/CodingEditor.tsx"]) {
      const src = read(f).replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/https?:\/\//);
      expect(src, f).not.toMatch(/cdn|unpkg|jsdelivr/i);
    }
    expect(read("coding/editor/monacoEngine.ts")).toMatch(/editor\.worker\.js\?worker/);
    expect(read("coding/editor/monacoEngine.ts")).toMatch(/MonacoEnvironment/);
  });
  it("ED25 the production bundle guard knows the Monaco payload signatures and the no-completion signatures", () => {
    const guard = fs.readFileSync(path.resolve(root, "..", "scripts", "check-bundle-budget.mjs"), "utf8");
    expect(guard).toMatch(/MONACO_SIGNATURES/);
    expect(guard).toMatch(/COMPLETION_SIGNATURES/);
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
  });
});
