// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import StudentToolDock from "./StudentToolDock";
import { defaultStudentToolConfig, type StudentToolsSpecV1 } from "./studentToolsSpec";

// Phase E1 (owner request: «اريد ان تعطى امكانية للمحرر ان يكون على كل الشاشة كما فعلنا مع المادة») — the C# editor's panel can fill
// the screen, as the Reader's «وضع العرض» does (the same useFullscreenOverlay):
//   • a «ملء الشاشة» toggle in the C# editor panel's header only (no other tool has it);
//   • full screen: the panel is the overlay (is-fullscreen, the dock above the page), the page behind does not scroll, the editor is
//     taller, the drag offset does not apply; the code typed stays (the same element: nothing remounts);
//   • Escape leaves full screen and keeps the panel open; a second Escape closes it; ✕ in full screen leaves and closes. Escape INSIDE
//     the code box stays the editor's own (CodingEditor: it releases Tab, never the page's key) — as it never closed the panel either;
//   • the browser's own full screen is asked for best-effort, and an exam already in full screen is left alone.

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.style.overflow = ""; });

const TOOLS: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: false }, defaultStudentToolConfig("calculator")] };
async function openTool(name: string) {
  fireEvent.click(screen.getByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name }));
  return screen.getByRole("dialog", { name });
}
async function openEditor() {
  render(<StudentToolDock studentTools={TOOLS} />);
  const panel = await openTool("محرر C#");
  await within(panel).findByTestId("csharp-editor-tool");
  return panel;
}
const code = (panel: HTMLElement) => within(panel).getByLabelText("كود C#") as HTMLTextAreaElement;
const escape = (el: Element) => fireEvent.keyDown(el, { key: "Escape" });

describe("E1 — the C# editor in full screen", () => {
  it("the toggle is in the C# editor's header only", async () => {
    render(<StudentToolDock studentTools={TOOLS} />);
    const calc = await openTool("آلة حاسبة علمية");
    expect(within(calc).queryByTestId("tool-fullscreen")).toBeNull();
    const editor = await openTool("محرر C#");
    await within(editor).findByTestId("csharp-editor-tool");
    const toggle = within(editor).getByRole("button", { name: "ملء الشاشة" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
  it("full screen: the panel is the overlay, above the page, the page does not scroll, the editor taller; the code stays", async () => {
    const panel = await openEditor();
    fireEvent.change(code(panel), { target: { value: "class A { }" } });
    const rowsBefore = Number(code(panel).getAttribute("rows"));
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    expect(panel.classList.contains("is-fullscreen")).toBe(true);
    expect(screen.getByTestId("student-tool-dock").classList.contains("has-fullscreen")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(panel).getByRole("button", { name: "الخروج من ملء الشاشة" }).getAttribute("aria-pressed")).toBe("true");
    expect(code(panel).value).toBe("class A { }");
    expect(Number(code(panel).getAttribute("rows"))).toBeGreaterThan(rowsBefore);
    fireEvent.click(within(panel).getByRole("button", { name: "الخروج من ملء الشاشة" }));
    expect(panel.classList.contains("is-fullscreen")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(code(panel).value).toBe("class A { }");
  });
  it("Escape leaves full screen and keeps the panel; a second Escape closes the panel", async () => {
    const panel = await openEditor();
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    await act(async () => { escape(within(panel).getByRole("button", { name: "نسخ الكود" })); });
    expect(panel.classList.contains("is-fullscreen")).toBe(false);
    expect((panel as HTMLElement).hidden).toBe(false);
    escape(within(panel).getByRole("button", { name: "نسخ الكود" }));
    expect((panel as HTMLElement).hidden).toBe(true);
  });
  it("pin: Escape INSIDE the code box stays the editor's own (it releases Tab), as before: full screen stays", async () => {
    const panel = await openEditor();
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    escape(code(panel));
    expect(panel.classList.contains("is-fullscreen")).toBe(true);
    expect((panel as HTMLElement).hidden).toBe(false);
  });
  it("✕ in full screen leaves full screen and closes the panel; reopened, it is a normal panel again", async () => {
    const panel = await openEditor();
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق محرر C#" }));
    expect((panel as HTMLElement).hidden).toBe(true);
    expect(document.body.style.overflow).toBe("");
    const again = await openTool("محرر C#");
    expect(again.classList.contains("is-fullscreen")).toBe(false);
    expect(screen.getByTestId("student-tool-dock").classList.contains("has-fullscreen")).toBe(false);
  });
  it("a panel dragged aside fills the screen without its offset, and gets its place back after", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
    const panel = await openEditor();
    const head = panel.querySelector(".stt-panel-head")!;
    fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(head, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(head, { pointerId: 1 });
    expect((panel as HTMLElement).style.transform).toBe("translate(100px, 50px)");
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    expect((panel as HTMLElement).style.transform).toBe("");
    fireEvent.pointerDown(head, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(head, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(head, { pointerId: 2 });
    fireEvent.click(within(panel).getByRole("button", { name: "الخروج من ملء الشاشة" }));
    expect((panel as HTMLElement).style.transform).toBe("translate(100px, 50px)");   // a full-screen panel does not move
  });
  it("an exam section that does not allow the editor closes it and leaves full screen (the page is unlocked)", async () => {
    const spec: StudentToolsSpecV1 = { ...TOOLS, sectionOverrides: { mental: { disabled: ["csharpEditor"] } } };
    const r = render(<StudentToolDock studentTools={spec} sectionId="s1" />);
    const panel = await openTool("محرر C#");
    await within(panel).findByTestId("csharp-editor-tool");
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    expect(document.body.style.overflow).toBe("hidden");
    r.rerender(<StudentToolDock studentTools={spec} sectionId="mental" />);
    expect((panel as HTMLElement).hidden).toBe(true);
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("student-tool-dock").classList.contains("has-fullscreen")).toBe(false);
  });
  it("the browser's own full screen is asked for best-effort; an exam already full screen is left alone", async () => {
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    const panel = await openEditor();
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(within(panel).getByRole("button", { name: "الخروج من ملء الشاشة" }));
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.body });   // the exam's own session
    fireEvent.click(within(panel).getByRole("button", { name: "ملء الشاشة" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(panel.classList.contains("is-fullscreen")).toBe(true);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  });
});
