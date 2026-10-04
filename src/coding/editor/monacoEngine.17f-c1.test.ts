// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMonacoEngine, type MonacoLike } from "./monacoAdapter";
import { EDITOR_ASSISTANCE_OFF, EDITOR_EDITING_FEATURES, SMARTASSESS_EDITOR_THEME } from "./editorOptions";
import type { EditorEngineCreateOptions } from "./editorEngine";

// Phase 17F-C1 — the Monaco ADAPTER proven against a fake Monaco API (no worker, no layout, no real Monaco): what create() is
// handed, how user edits reach SmartAssess (accept → onChange), how a refused edit is reverted, how a controlled value is
// synchronised without echo, language switching, read-only, aria, the Esc-then-Tab escape, and disposal.

type Listener<T> = (e: T) => void;
/** Fault injection: `subscribe` = every registration throws; `failSubscription` = only the N-th registration (1-based) throws;
 *  `listenerDisposeThrows` = the N-th registered listener's dispose() throws; `editorDisposeThrows` = editor.dispose() throws. */
type Faults = { createEditor?: boolean; subscribe?: boolean; failSubscription?: number; listenerDisposeThrows?: number; editorDisposeThrows?: boolean };
function fakeMonaco(faults: Faults = {}) {
  const calls = { defineTheme: [] as [string, unknown][], create: [] as Record<string, unknown>[], createModel: [] as [string, string | undefined][], setModelLanguage: [] as string[], modelSetValue: [] as string[], updateOptions: [] as Record<string, unknown>[], disposed: { editor: 0, model: 0, listeners: 0 } };
  const content: Listener<{ changes: { rangeOffset: number; rangeLength: number; text: string }[] }>[] = [];
  const keys: Listener<{ keyCode: number; preventDefault(): void; browserEvent: KeyboardEvent }>[] = [];
  const blurs: Listener<void>[] = [];
  let focused = false, position = 0;
  const model = {
    value: "", languageId: "plaintext" as string,
    getValue: () => model.value,
    setValue(v: string) { calls.modelSetValue.push(v); const old = model.value; model.value = v; position = 0; for (const cb of [...content]) cb({ changes: [{ rangeOffset: 0, rangeLength: old.length, text: v }] }); },   // real Monaco fires the content event on setValue too
    setEOL: vi.fn(), getEOL: () => "\n",
    getPositionAt: (o: number) => ({ lineNumber: 1, column: o + 1 }),
    getOffsetAt: (p: { column: number }) => p.column - 1,
    getLanguageId: () => model.languageId,
    dispose() { calls.disposed.model++; }
  };
  let registrations = 0;
  const sub = <T,>(list: Listener<T>[]) => (cb: Listener<T>) => {
    registrations++;
    const index = registrations;
    if (faults.subscribe) throw new Error("fault: subscribe");
    if (faults.failSubscription === index) throw new Error("fault: subscribe " + index);
    list.push(cb);
    return { dispose() { if (faults.listenerDisposeThrows === index) throw new Error("fault: listener dispose " + index); calls.disposed.listeners++; list.splice(list.indexOf(cb), 1); } };
  };
  let hostEl: HTMLElement | null = null;
  const editor = {
    options: {} as Record<string, unknown>,
    updateOptions(o: Record<string, unknown>) { calls.updateOptions.push(o); Object.assign(editor.options, o); },
    getModel: () => model,
    onDidChangeModelContent: sub(content), onKeyDown: sub(keys), onDidBlurEditorWidget: sub(blurs),
    focus() { focused = true; }, hasTextFocus: () => focused,
    setPosition(p: { column: number }) { position = p.column - 1; }, getPosition: () => ({ lineNumber: 1, column: position + 1 }),
    revealPositionInCenterIfOutsideViewport: vi.fn(), layout: vi.fn(),
    getDomNode: () => hostEl,
    dispose() { calls.disposed.editor++; if (faults.editorDisposeThrows) throw new Error("fault: editor dispose"); }
  };
  const monaco: MonacoLike = {
    editor: {
      defineTheme: (n, d) => { calls.defineTheme.push([n, d]); },
      createModel: (v, l) => { calls.createModel.push([v, l]); model.value = v; model.languageId = l ?? "plaintext"; return model; },
      setModelLanguage: (_m, l) => { calls.setModelLanguage.push(l); model.languageId = l; },
      create: (host, o) => { hostEl = host; calls.create.push(o); if (faults.createEditor) throw new Error("fault: editor.create"); const ta = document.createElement("textarea"); ta.className = "inputarea"; ta.setAttribute("aria-autocomplete", "both"); host.appendChild(ta); return editor; }
    },
    KeyCode: { Escape: 9, Tab: 2 }
  };
  /** Simulates the USER typing `text` at `at` (the model changes first, then Monaco fires the content event). */
  const type = (text: string, at = model.value.length) => { model.value = model.value.slice(0, at) + text + model.value.slice(at); position = at + text.length; for (const cb of [...content]) cb({ changes: [{ rangeOffset: at, rangeLength: 0, text }] }); };
  const key = (keyCode: number) => { const ev = { keyCode, preventDefault: vi.fn(), browserEvent: new KeyboardEvent("keydown") }; for (const cb of [...keys]) cb(ev); return ev; };
  const blur = () => { focused = false; for (const cb of [...blurs]) cb(); };
  const input = () => hostEl!.querySelector("textarea.inputarea") as HTMLTextAreaElement;
  return { monaco, calls, model, editor, type, key, blur, input, listeners: () => content.length + keys.length + blurs.length };
}
const opts = (over: Partial<EditorEngineCreateOptions> = {}): EditorEngineCreateOptions => ({ value: "print(1)\n", languageMode: "python", label: "محرر الكود", readOnly: false, describedBy: "hint-1", indentUnit: "    ", accept: () => true, ...over });
const flush = () => new Promise<void>(r => queueMicrotask(r));

describe("17F-C1 Monaco adapter — creation and configuration", () => {
  it("registers the SmartAssess light theme once, creates a model with the exact source + syntax mode and hands create() the frozen option set (ED1, ED6–ED19)", () => {
    const f = fakeMonaco(), engine = createMonacoEngine(f.monaco);
    expect(engine.kind).toBe("monaco");
    const host = document.createElement("div");
    engine.create(host, opts());
    engine.create(document.createElement("div"), opts({ languageMode: "java", value: "class A {}" }));
    expect(f.calls.defineTheme).toEqual([[SMARTASSESS_EDITOR_THEME.name, SMARTASSESS_EDITOR_THEME.data]]);
    expect(f.calls.createModel).toEqual([["print(1)\n", "python"], ["class A {}", "java"]]);
    const o = f.calls.create[0];
    expect(o.model).toBe(f.model);
    for (const [k, v] of Object.entries(EDITOR_ASSISTANCE_OFF)) expect(o[k]).toEqual(v);
    for (const [k, v] of Object.entries(EDITOR_EDITING_FEATURES)) expect(o[k]).toEqual(v);
    expect(o.ariaLabel).toBe("محرر الكود"); expect(o.readOnly).toBe(false); expect(o.theme).toBe("smartassess-light"); expect(o.tabSize).toBe(4);
    expect(f.model.setEOL).toHaveBeenCalled();                                                            // LF, like the textarea it replaces
  });
  it("the input element announces no autocomplete, is described by the on-screen hint and can be flagged invalid (ED11 aria, byte-limit a11y)", () => {
    const f = fakeMonaco(), h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    expect(f.input().getAttribute("aria-autocomplete")).toBe("none");
    expect(f.input().getAttribute("aria-describedby")).toBe("hint-1");
    h.setInvalid(true); expect(f.input().getAttribute("aria-invalid")).toBe("true");
    h.setInvalid(false); expect(f.input().hasAttribute("aria-invalid")).toBe(false);
    h.setReadOnly(true);                                                                                  // Monaco re-applies its own aria on option changes: ours must survive
    expect(f.input().getAttribute("aria-autocomplete")).toBe("none");
    expect(f.input().getAttribute("aria-describedby")).toBe("hint-1");
  });
});

describe("17F-C1 Monaco adapter — edits, controlled value and the byte-limit veto (ED20–ED22, M10, M12)", () => {
  it("ED20 a user edit reaches accept() with EXACTLY the model text, once per edit", () => {
    const f = fakeMonaco(), accept = vi.fn(() => true);
    createMonacoEngine(f.monaco).create(document.createElement("div"), opts({ value: "x = 1", accept }));
    f.type("\nprint(x)  # تعليق 🎉");
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith("x = 1\nprint(x)  # تعليق 🎉");
  });
  it("ED21 / M12 a controlled setValue() replaces the model WITHOUT echoing through accept(); an equal value is a no-op (undo stack kept)", () => {
    const f = fakeMonaco(), accept = vi.fn(() => true);
    const h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts({ value: "a", accept }));
    h.setValue("restored\r\nsource");
    expect(f.calls.modelSetValue).toEqual(["restored\r\nsource"]);
    expect(h.getValue()).toBe("restored\r\nsource");
    expect(accept).not.toHaveBeenCalled();
    h.setValue("restored\r\nsource");
    expect(f.calls.modelSetValue).toHaveLength(1);
  });
  it("ED22 / M10 a refused edit is reverted to the last ACCEPTED source and the caret returns to the edit point; the revert never re-enters accept()", async () => {
    const f = fakeMonaco();
    let limitHit = false;
    const accept = vi.fn((next: string) => { if (next.length > 6) { limitHit = true; return false; } return true; });
    const h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts({ value: "abc", accept }));
    f.type("de");                                                                                         // "abcde" accepted
    f.type("fg", 2);                                                                                      // "abfgcde" → 7 > 6 → refused
    await flush();
    expect(limitHit).toBe(true);
    expect(h.getValue()).toBe("abcde");
    expect(f.calls.modelSetValue).toEqual(["abcde"]);
    expect(h.getCursorOffset()).toBe(2);
    expect(accept).toHaveBeenCalledTimes(2);
    f.type("z");                                                                                          // editing continues from the accepted text
    expect(accept).toHaveBeenLastCalledWith("abcdez");
  });
});

describe("17F-C1 Monaco adapter — language, read-only, focus, escape and disposal (ED4, ED23, ED24, ED27, ED31, M11, M13)", () => {
  it("ED4 / M13 setLanguage() switches the syntax mode of the SAME model and leaves the source byte-identical", () => {
    const f = fakeMonaco(), accept = vi.fn(() => true);
    const h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts({ value: "int x = 5;", accept }));
    h.setLanguage("java"); h.setLanguage("csharp");
    expect(f.calls.setModelLanguage).toEqual(["java", "csharp"]);
    expect(f.model.getLanguageId()).toBe("csharp");
    expect(h.getValue()).toBe("int x = 5;");
    expect(f.calls.modelSetValue).toEqual([]);
    expect(accept).not.toHaveBeenCalled();
  });
  it("ED24 read-only is applied to the editor AND its DOM (no mutation path) and announced; label updates flow to ariaLabel", () => {
    const f = fakeMonaco(), h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    h.setReadOnly(true);
    expect(f.editor.options).toMatchObject({ readOnly: true, domReadOnly: true });
    h.setReadOnly(false);
    expect(f.editor.options).toMatchObject({ readOnly: false, domReadOnly: false });
    h.setLabel("محرر الكود — الحل المرجعي");
    expect(f.editor.options.ariaLabel).toBe("محرر الكود — الحل المرجعي");
  });
  it("ED31 Esc arms tab-focus mode so the NEXT Tab moves browser focus; any other key or leaving the editor disarms it", () => {
    const f = fakeMonaco(); createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    expect(f.editor.options.tabFocusMode).toBeFalsy();
    f.key(9); expect(f.editor.options.tabFocusMode).toBe(true);
    f.key(2);                                                                                             // Tab: still armed — the browser moves focus
    expect(f.editor.options.tabFocusMode).toBe(true);
    f.blur(); expect(f.editor.options.tabFocusMode).toBe(false);
    f.key(9); expect(f.editor.options.tabFocusMode).toBe(true);
    f.key(65); expect(f.editor.options.tabFocusMode).toBe(false);                                        // typing again re-captures Tab for indentation
  });
  it("focus / caret helpers drive the editor (used when the native editor hands over mid-typing)", () => {
    const f = fakeMonaco(), h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts({ value: "hello" }));
    expect(h.hasFocus()).toBe(false);
    h.focus(); expect(h.hasFocus()).toBe(true);
    h.setCursorOffset(3); expect(h.getCursorOffset()).toBe(3);
  });
  it("ED27 / M11 dispose() releases the editor, the model and every listener, and empties the host", () => {
    const f = fakeMonaco(), host = document.createElement("div");
    const h = createMonacoEngine(f.monaco).create(host, opts());
    expect(f.listeners()).toBeGreaterThan(0);
    h.dispose();
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(f.listeners()).toBe(0);
    expect(host.childElementCount).toBe(0);
    h.dispose();                                                                                          // idempotent
    expect(f.calls.disposed.editor).toBe(1);
  });
});

describe("17F-C1 Review Fix 1 — adapter partial-creation cleanup (RF1-G, RF1-H, RM3)", () => {
  it("RF1-G editor.create throws → the already created model is disposed, the host is emptied and the error is rethrown (no leak)", () => {
    const f = fakeMonaco({ createEditor: true }), host = document.createElement("div");
    expect(() => createMonacoEngine(f.monaco).create(host, opts())).toThrow("fault: editor.create");
    expect(f.calls.createModel).toHaveLength(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(f.calls.disposed.editor).toBe(0);                                                                // never created
    expect(host.childElementCount).toBe(0);
  });
  it("RF1-H the editor is created but a later setup step throws → editor AND model are disposed, listeners released, error rethrown", () => {
    const f = fakeMonaco({ subscribe: true }), host = document.createElement("div");
    expect(() => createMonacoEngine(f.monaco).create(host, opts())).toThrow("fault: subscribe");
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(f.listeners()).toBe(0);
    expect(host.childElementCount).toBe(0);
  });
});

describe("17F-C1 Review Fix 1 — browser-level anti-assist attributes on the Monaco input (RF2-A/B/C, RM4–RM6)", () => {
  const ANTI_ASSIST: [string, string][] = [["aria-autocomplete", "none"], ["autocomplete", "off"], ["autocorrect", "off"], ["autocapitalize", "off"], ["spellcheck", "false"]];
  const wait = () => new Promise<void>(r => setTimeout(r, 0));
  it("RF2-A every anti-assist attribute is explicitly present on the input right after creation", () => {
    const f = fakeMonaco(); createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    for (const [k, v] of ANTI_ASSIST) expect(f.input().getAttribute(k), k).toBe(v);
  });
  it("RF2-B when Monaco rewrites or removes one of them, the adapter restores it", async () => {
    const f = fakeMonaco(); createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    f.input().setAttribute("spellcheck", "true"); f.input().removeAttribute("autocomplete"); f.input().setAttribute("aria-autocomplete", "both"); f.input().setAttribute("autocorrect", "on");
    await wait();
    for (const [k, v] of ANTI_ASSIST) expect(f.input().getAttribute(k), k).toBe(v);
  });
  it("RF2-C setReadOnly / setLabel / setInvalid never drop them", () => {
    const f = fakeMonaco(), h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    h.setReadOnly(true); h.setLabel("x"); h.setInvalid(true); h.setReadOnly(false);
    for (const [k, v] of ANTI_ASSIST) expect(f.input().getAttribute(k), k).toBe(v);
  });
});

describe("17F-C1 Review Fix 2 — immediate subscription tracking and best-effort cleanup (RM7–RM9)", () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { errors.mockRestore(); });

  it("Fix2 RF2-A the first listener registers and the SECOND registration throws → the first listener, the editor and the model are disposed, the host is empty, the original error is rethrown", () => {
    const f = fakeMonaco({ failSubscription: 2 }), host = document.createElement("div");
    expect(() => createMonacoEngine(f.monaco).create(host, opts())).toThrow("fault: subscribe 2");
    expect(f.calls.disposed.listeners).toBe(1);
    expect(f.listeners()).toBe(0);
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(host.childElementCount).toBe(0);
  });
  it("Fix2 RF2-B the first two listeners register and the THIRD registration throws → both prior listeners, the editor and the model are disposed; original error rethrown", () => {
    const f = fakeMonaco({ failSubscription: 3 }), host = document.createElement("div");
    expect(() => createMonacoEngine(f.monaco).create(host, opts())).toThrow("fault: subscribe 3");
    expect(f.calls.disposed.listeners).toBe(2);
    expect(f.listeners()).toBe(0);
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(host.childElementCount).toBe(0);
  });
  it("Fix2 RF2-C one listener's dispose() throws → the remaining listeners are still disposed, the observer disconnected, the editor and model disposed, the host emptied; dispose() itself does not throw", () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const f = fakeMonaco({ listenerDisposeThrows: 1 }), host = document.createElement("div");
    const h = createMonacoEngine(f.monaco).create(host, opts());
    expect(f.listeners()).toBe(3);
    expect(() => h.dispose()).not.toThrow();
    expect(f.calls.disposed.listeners).toBe(2);                                                           // the two whose dispose() works
    expect(f.listeners()).toBe(1);                                                                        // only the throwing one stays registered in the fake
    expect(disconnect).toHaveBeenCalled();
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(host.childElementCount).toBe(0);
    expect(errors).toHaveBeenCalledTimes(1);                                                             // reported once, locally
    disconnect.mockRestore();
  });
  it("Fix2 RF2-D editor.dispose() throws → model disposal and host cleanup still occur; dispose() does not throw", () => {
    const f = fakeMonaco({ editorDisposeThrows: true }), host = document.createElement("div");
    const h = createMonacoEngine(f.monaco).create(host, opts());
    expect(() => h.dispose()).not.toThrow();
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(f.calls.disposed.listeners).toBe(3);
    expect(host.childElementCount).toBe(0);
  });
  it("Fix2 RF2-D' during a CREATE failure a cleanup error never masks the original setup error", () => {
    const f = fakeMonaco({ failSubscription: 2, listenerDisposeThrows: 1, editorDisposeThrows: true }), host = document.createElement("div");
    expect(() => createMonacoEngine(f.monaco).create(host, opts())).toThrow("fault: subscribe 2");
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(host.childElementCount).toBe(0);
  });
  it("Fix2 RF2-E release / dispose stays idempotent, with and without cleanup faults", () => {
    const f = fakeMonaco({ editorDisposeThrows: true }), h = createMonacoEngine(f.monaco).create(document.createElement("div"), opts());
    h.dispose(); h.dispose(); h.dispose();
    expect(f.calls.disposed.editor).toBe(1);
    expect(f.calls.disposed.model).toBe(1);
    expect(f.calls.disposed.listeners).toBe(3);
    const g = fakeMonaco(), k = createMonacoEngine(g.monaco).create(document.createElement("div"), opts());
    k.dispose(); k.dispose();
    expect(g.calls.disposed).toEqual({ editor: 1, model: 1, listeners: 3 });
  });
  it("Fix2 RF2-F the normal lifecycle is unchanged: three listeners registered immediately, all released once on dispose, no error reported", () => {
    const f = fakeMonaco(), host = document.createElement("div");
    const h = createMonacoEngine(f.monaco).create(host, opts());
    expect(f.listeners()).toBe(3);
    f.type("x");
    h.dispose();
    expect(f.calls.disposed).toEqual({ editor: 1, model: 1, listeners: 3 });
    expect(f.listeners()).toBe(0);
    expect(host.childElementCount).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });
});
