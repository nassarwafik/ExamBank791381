// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createPortal } from "react-dom";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import CodingWorkspace from "./CodingWorkspace";
import { setEditorEngineLoader, type EditorEngine, type EditorEngineCreateOptions, type EditorEngineHandle } from "../editor/editorEngine";
import { EDITOR_PREFERENCES_KEY, resetEditorPreferencesForTests, type EditorPreferences } from "./editorPreferences";

// Phase 18B — the enterprise coding WORKSPACE: toolbar (language + contract version, editor preferences, focus toggle, caller
// slots), the one CodingEditor, caller panels, and an application-level FOCUS MODE that is a CSS-class change on the SAME tree
// (nothing remounts, so not a single source character can be lost). Keyboard: Escape exits only from outside the editor surface
// (inside, Escape keeps its editor meaning), Tab cycles inside the expanded workspace, the rest of the page is inert while it is
// expanded, and the exit control is always reachable. Preferences change presentation only.

type FakeHandle = EditorEngineHandle & { value: string; mode: string; readOnly: boolean; prefs: EditorPreferences[]; disposed: number; setValueCalls: string[] };
function fakeEngine() {
  const handles: FakeHandle[] = [];
  const engine: EditorEngine = {
    kind: "fake",
    create(host, o: EditorEngineCreateOptions) {
      const input = document.createElement("textarea"); input.className = "inputarea"; input.setAttribute("aria-label", o.label); host.appendChild(input);
      const h: FakeHandle = {
        value: o.value, mode: o.languageMode, readOnly: o.readOnly, prefs: [], disposed: 0, setValueCalls: [],
        getValue: () => h.value, setValue(v) { h.setValueCalls.push(v); h.value = v; }, setLanguage(m) { h.mode = m; }, setReadOnly(r) { h.readOnly = r; }, setLabel() {}, setInvalid() {},
        focus() { input.focus(); }, hasFocus: () => document.activeElement === input, setCursorOffset() {}, getCursorOffset: () => 0, layout() {}, dispose() { h.disposed++; host.innerHTML = ""; },
        setPreferences(p) { h.prefs.push(p); }
      };
      handles.push(h);
      return h;
    }
  };
  return { engine, handles, loader: () => Promise.resolve(engine) };
}
const tick = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
const root = () => screen.getByTestId("ws");
const toggle = () => screen.getByTestId("coding-focus-toggle") as HTMLButtonElement;
const native = () => screen.queryByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement | null;
const inFocus = () => root().getAttribute("data-focus-mode") === "true";
function Portaled() { return createPortal(<button type="button" data-testid="portaled">خارج</button>, document.body); }
const base = { value: "print('hi')\n", language: "python", label: "محرر الكود", testId: "ws", title: "السؤال 1" };

beforeEach(() => { setEditorEngineLoader(null); resetEditorPreferencesForTests(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); setEditorEngineLoader(undefined); resetEditorPreferencesForTests(); vi.restoreAllMocks(); });

describe("18B workspace — structure and accessibility", () => {
  it("renders a named group with a toolbar (caller start slot, language badge, preferences, focus toggle, caller end slot), the editor panel and the caller's panels, in that DOM order", () => {
    render(<CodingWorkspace {...base} onChange={() => {}} languageVersion={1} toolbarStart={<button type="button">لغة</button>} toolbarEnd={<button type="button">استعادة</button>} editorFooter={<p data-testid="footer">حدود</p>}><div data-testid="panels">لوحات</div></CodingWorkspace>);
    const ws = root();
    expect(ws.getAttribute("role")).toBe("group");
    expect(ws.getAttribute("aria-label")).toBe("مساحة العمل البرمجية — السؤال 1");
    const order = [screen.getByText("لغة"), screen.getByTestId("coding-workspace-language"), screen.getByText("إعدادات المحرر"), toggle(), screen.getByText("استعادة"), native()!, screen.getByTestId("footer"), screen.getByTestId("panels")];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, String(i)).toBeTruthy();
    expect(screen.getByTestId("coding-workspace-language").textContent).toBe("Python · v1");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(toggle().getAttribute("aria-label")).toBe("وضع التركيز (توسيع محرر الكود)");
    expect(toggle().getAttribute("type")).toBe("button");                                                  // never a form submit
    expect(inFocus()).toBe(false);
  });
  it("inside an RTL page the toolbar and panels keep the page direction while the editor is LTR", () => {
    render(<div dir="rtl"><CodingWorkspace {...base} onChange={() => {}} /></div>);
    expect(root().closest("[dir]")!.getAttribute("dir")).toBe("rtl");
    expect(screen.getByTestId("coding-workspace-toolbar").closest("[dir]")!.getAttribute("dir")).toBe("rtl");
    expect(native()!.closest("[dir]")!.getAttribute("dir")).toBe("ltr");
    fireEvent.click(toggle());
    expect(native()!.closest("[dir]")!.getAttribute("dir")).toBe("ltr");
    expect(root().getAttribute("dir")).toBeNull();                                                          // the page direction still governs the chrome
  });
  it("every toolbar control is a real button / native control with an accessible name (keyboard reachable, no tabindex tricks)", () => {
    render(<CodingWorkspace {...base} onChange={() => {}} />);
    fireEvent.click(screen.getByText("إعدادات المحرر"));
    expect(screen.getByRole("combobox", { name: "حجم الخط" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "التفاف الأسطر" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "الخريطة المصغّرة" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "أرقام الأسطر" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "إعدادات المحرر" }).textContent).toMatch(/هذا الجهاز فقط/);
    expect(root().querySelector("[tabindex]:not([tabindex='-1']):not(button):not(input):not(select):not(textarea):not(summary)")).toBeNull();
  });
});

describe("18B workspace — focus mode preserves the source and the engine", () => {
  it("native: enter / exit is a class change on the same tree — same textarea element, same value, no onChange", () => {
    const onChange = vi.fn();
    render(<CodingWorkspace {...base} onChange={onChange} />);
    const ta = native()!;
    fireEvent.click(toggle());
    expect(inFocus()).toBe(true);
    expect(root().className).toContain("is-focus");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(toggle().getAttribute("aria-label")).toBe("الخروج من وضع التركيز");
    expect(native()).toBe(ta);
    expect(ta.value).toBe(base.value);
    expect(ta.closest(".cx-code-editor")!.getAttribute("data-editor-layout")).toBe("fill");
    fireEvent.click(toggle());
    expect(inFocus()).toBe(false);
    expect(native()).toBe(ta);
    expect(ta.value).toBe(base.value);
    expect(ta.closest(".cx-code-editor")!.getAttribute("data-editor-layout")).toBe("auto");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("rich: the engine handle survives enter / exit (no dispose, no re-create, no setValue), value / mode untouched", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    render(<CodingWorkspace {...base} onChange={() => {}} />);
    await tick();
    const h = f.handles[0];
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(f.handles).toHaveLength(1);
    expect(h.disposed).toBe(0);
    expect(h.setValueCalls).toEqual([]);
    expect(h.value).toBe(base.value); expect(h.mode).toBe("python");
  });
  it("a source typed while expanded is exactly what leaves the workspace; a resize / orientation change changes nothing", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    const { rerender } = render(<CodingWorkspace {...base} onChange={onChange} />);
    await tick();
    fireEvent.click(toggle());
    const h = f.handles[0];
    act(() => { h.value = base.value + "x = 1\n"; });
    expect(h.value).toBe("print('hi')\nx = 1\n");
    act(() => { window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("orientationchange")); });
    rerender(<CodingWorkspace {...base} value={"print('hi')\nx = 1\n"} onChange={onChange} />);
    expect(f.handles).toHaveLength(1);
    expect(h.disposed).toBe(0);
    expect(h.value).toBe("print('hi')\nx = 1\n");
    expect(inFocus()).toBe(true);
  });
  it("focus mode exits by itself when the workspace becomes read-only (attempt no longer writable) and cannot be entered while read-only", () => {
    const { rerender } = render(<CodingWorkspace {...base} onChange={() => {}} />);
    fireEvent.click(toggle());
    expect(inFocus()).toBe(true);
    rerender(<CodingWorkspace {...base} onChange={() => {}} readOnly />);
    expect(inFocus()).toBe(false);
    expect(native()!.readOnly).toBe(true);
    expect(toggle().disabled).toBe(false);                                                                  // read-only review may still expand to READ
    fireEvent.click(toggle());
    expect(inFocus()).toBe(true);
    expect(native()!.readOnly).toBe(true);
  });
});

describe("18B workspace — keyboard: Escape, Tab cycling, inert page, no form submission", () => {
  it("Escape on a toolbar control exits; Escape INSIDE the editor keeps its editor meaning (no exit); Escape in a portaled dialog is ignored", () => {
    render(<CodingWorkspace {...base} onChange={() => {}}><Portaled /></CodingWorkspace>);
    fireEvent.click(toggle());
    const ta = native()!;
    ta.focus();
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(inFocus()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("portaled"), { key: "Escape" });
    expect(inFocus()).toBe(true);
    toggle().focus();
    fireEvent.keyDown(toggle(), { key: "Escape" });
    expect(inFocus()).toBe(false);
    expect(document.activeElement).toBe(toggle());                                                           // focus stays where the user was
  });
  it("Escape outside the editor never bubbles to document-level listeners while expanded (a surrounding overlay cannot close by accident)", () => {
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => { seen.push(e.key); };
    document.addEventListener("keydown", listener);
    try {
      render(<CodingWorkspace {...base} onChange={() => {}} />);
      fireEvent.click(toggle());
      fireEvent.keyDown(toggle(), { key: "Escape" });
      expect(inFocus()).toBe(false);
      expect(seen).toEqual([]);
      fireEvent.keyDown(toggle(), { key: "Escape" });                                                       // not expanded: Escape is not ours
      expect(seen).toEqual(["Escape"]);
    } finally { document.removeEventListener("keydown", listener); }
  });
  it("Tab cycles inside the expanded workspace (last → first, first → last) and is not intercepted when collapsed", () => {
    render(<CodingWorkspace {...base} onChange={() => {}} toolbarStart={<button type="button">لغة</button>}><button type="button">تشغيل</button></CodingWorkspace>);
    const first = screen.getByText("لغة"), last = screen.getByText("تشغيل");
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(true);                                             // collapsed: default not prevented
    fireEvent.click(toggle());
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(fireEvent.keyDown(first, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);
    toggle().focus();
    expect(fireEvent.keyDown(toggle(), { key: "Tab" })).toBe(true);                                          // mid-list: the browser handles Tab
  });
  it("while expanded the rest of the page is inert (hidden page controls cannot be reached or submitted); it is restored exactly on exit, including elements that were already inert", () => {
    render(<div><button type="button" data-testid="page-submit">تسليم</button><div dir="rtl"><CodingWorkspace {...base} onChange={() => {}} /></div><div data-testid="already" inert>x</div></div>);
    const submit = screen.getByTestId("page-submit"), already = screen.getByTestId("already");
    fireEvent.click(toggle());
    expect(submit.hasAttribute("inert")).toBe(true);
    expect(already.hasAttribute("inert")).toBe(true);
    expect(root().hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(toggle());
    expect(submit.hasAttribute("inert")).toBe(false);
    expect(already.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("");
  });
  it("unmounting while expanded restores the page (no stuck inert, no stuck scroll lock)", () => {
    const { unmount } = render(<div><button type="button" data-testid="page-submit">تسليم</button><CodingWorkspace {...base} onChange={() => {}} /></div>);
    fireEvent.click(toggle());
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelector("[inert]")).toBeNull();
  });
  it("inside a <form>, toggling focus mode and the preference controls never submit the form; Enter in the editor never submits", () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={onSubmit}><CodingWorkspace {...base} onChange={() => {}} /></form>);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText("إعدادات المحرر"));
    fireEvent.click(screen.getByRole("checkbox", { name: "التفاف الأسطر" }));
    fireEvent.keyDown(native()!, { key: "Enter" });
    fireEvent.click(toggle());
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("announces focus-mode changes through a polite status line", () => {
    render(<CodingWorkspace {...base} onChange={() => {}} />);
    const status = screen.getByTestId("coding-focus-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
    fireEvent.click(toggle());
    expect(status.textContent).toMatch(/وضع التركيز مفعّل/);
    fireEvent.click(toggle());
    expect(status.textContent).toMatch(/تم الخروج من وضع التركيز/);
  });
});

describe("18B workspace — preferences reach the editor, never the value", () => {
  it("font size / wrap / minimap / line numbers go to the engine through setPreferences and to storage; onChange, value and mode are untouched", async () => {
    const f = fakeEngine(); setEditorEngineLoader(f.loader);
    const onChange = vi.fn();
    render(<CodingWorkspace {...base} onChange={onChange} />);
    await tick();
    const h = f.handles[0];
    fireEvent.click(screen.getByText("إعدادات المحرر"));
    fireEvent.change(screen.getByRole("combobox", { name: "حجم الخط" }), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "التفاف الأسطر" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "الخريطة المصغّرة" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "أرقام الأسطر" }));
    expect(h.prefs.at(-1)).toEqual({ fontSize: 16, wordWrap: true, minimap: true, lineNumbers: false });
    expect(JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_KEY)!)).toEqual({ fontSize: 16, wordWrap: true, minimap: true, lineNumbers: false });
    expect(onChange).not.toHaveBeenCalled();
    expect(h.value).toBe(base.value); expect(h.mode).toBe("python"); expect(h.setValueCalls).toEqual([]);
    expect(f.handles).toHaveLength(1);
  });
  it("a stored preference applies to a fresh workspace (device-level), and the language / version badge is unaffected", () => {
    localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify({ fontSize: 20, wordWrap: true, minimap: false, lineNumbers: true }));
    resetEditorPreferencesForTests({ keepStorage: true });
    render(<CodingWorkspace {...base} onChange={() => {}} languageVersion={1} language="java" />);
    expect(native()!.getAttribute("wrap")).toBe("soft");
    expect((native()!.closest(".cx-code-frame") as HTMLElement).style.getPropertyValue("--cx-font-size")).toBe("20px");
    expect(screen.getByTestId("coding-workspace-language").textContent).toBe("Java · v1");
  });
});
