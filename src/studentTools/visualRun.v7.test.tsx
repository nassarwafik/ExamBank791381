// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { validateStudentTools, validateBookStudentTools, csharpVisualAllowedInBook, csharpRunAllowedInBook, type StudentToolsSpecV1 } from "./studentToolsSpec";
import StudentToolsEditor from "./StudentToolsEditor";
import StudentToolDock from "./StudentToolDock";
import CourseToolDock from "./CourseToolDock";
import { DESKTOP_QUERY, resetDeviceLabForTests } from "./deviceCSharpLab";
import { courseStudentTools } from "./courseTools";

// Visual lab V7 (docs/enterprise-csharp-visual-lab-plan.md §15; owner decision 2026-11-23) — «تشغيل مرئي» for STUDENTS, when the
// class's teacher turns it on for the book:
//   • the tool contract: `allowVisual` on the book's C# editor — additive (off by default; the canonical form carries it only when
//     true, so every saved spec keeps its shape), strict (a boolean, and only together with running);
//   • the teacher's book-tools dialog: a second option under «السماح بتشغيل الكود», usable only when running is on; switching running
//     off takes it away too; an exam's tools never offer it;
//   • the reader: a student gets «تشغيل مرئي» on a desktop only when the class's book tools allow it; a phone never; an exam never.
afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.unstubAllGlobals(); });
const desktop = (on: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY ? on : false, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => { desktop(true); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, library: "", available: true }), { status: 200 }))); });

const tools = (csharp: Record<string, unknown>) => ({ version: 1, tools: [{ id: "csharpEditor", ...csharp }] });
const VISUAL: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: true, allowVisual: true }] };
const RUN: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: true }] };

describe("V7 — the tool contract", () => {
  it("allowVisual: true (with running) is kept; false or absent is the shape saved before (no key)", () => {
    expect(validateBookStudentTools(tools({ allowRun: true, allowVisual: true }))).toMatchObject({ ok: true, value: VISUAL });
    expect(validateBookStudentTools(tools({ allowRun: true, allowVisual: false }))).toMatchObject({ ok: true, value: RUN });
    expect(validateBookStudentTools(tools({ allowRun: true }))).toMatchObject({ ok: true, value: RUN });
    expect((validateBookStudentTools(tools({ allowRun: true, allowVisual: false })) as { value: StudentToolsSpecV1 }).value.tools[0]).not.toHaveProperty("allowVisual");
    expect(csharpVisualAllowedInBook(VISUAL)).toBe(true);
    expect(csharpVisualAllowedInBook(RUN)).toBe(false);
    expect(csharpVisualAllowedInBook(undefined)).toBe(false);
    // defensive: even a spec that never passed the validator gets no visual run without running
    expect(csharpVisualAllowedInBook({ version: 1, tools: [{ id: "csharpEditor", allowRun: false, allowVisual: true }] } as StudentToolsSpecV1)).toBe(false);
  });
  it("strict: visual without running, or a non-boolean, makes the whole spec invalid", () => {
    expect(validateStudentTools(tools({ allowRun: false, allowVisual: true })).ok).toBe(false);
    expect(validateStudentTools(tools({ allowRun: true, allowVisual: "yes" })).ok).toBe(false);
    expect(validateStudentTools(tools({ allowRun: true, allowVisual: 1 })).ok).toBe(false);
    expect(validateStudentTools(tools({ allowRun: true, allowVisual: null })).ok).toBe(false);
  });
  it("pin: the book's built-in sets never turn it on (the teacher chooses, per class)", () => {
    for (const id of ["899271d", "899371"]) {
      const set = courseStudentTools(id);
      if (set) { expect(csharpVisualAllowedInBook(set)).toBe(false); expect(csharpRunAllowedInBook(set)).toBe(true); }
    }
  });
});

describe("V7 — the teacher's choice", () => {
  it("in a book: the visual option waits for running; on adds allowVisual; switching running off takes it away", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const write = { version: 1 as const, tools: [{ id: "csharpEditor" as const, allowRun: false }] };
    const r = render(<StudentToolsEditor value={write} sections={[]} place="book" onChange={onChange} />);
    const visual = () => screen.getByRole("checkbox", { name: /السماح بالتشغيل المرئي خطوة خطوة/ }) as HTMLInputElement;
    expect(visual().disabled).toBe(true);
    r.rerender(<StudentToolsEditor value={RUN} sections={[]} place="book" onChange={onChange} />);
    expect(visual().disabled).toBe(false);
    fireEvent.click(visual());
    expect(onChange.mock.calls.at(-1)![0]).toEqual(VISUAL);
    r.rerender(<StudentToolsEditor value={VISUAL} sections={[]} place="book" onChange={onChange} />);
    expect(visual().checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /السماح بتشغيل الكود للتدريب/ }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual({ version: 1, tools: [{ id: "csharpEditor", allowRun: false }] });
  });
  it("in an exam: no running option and no visual option", () => {
    render(<StudentToolsEditor value={RUN} sections={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole("checkbox", { name: /السماح بالتشغيل المرئي/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /السماح بتشغيل الكود/ })).toBeNull();
  });
});

async function openEditorIn(ui: React.ReactElement) {
  render(ui);
  fireEvent.click(await screen.findByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
  const panel = screen.getByRole("dialog", { name: "محرر C#" });
  return panel;
}

describe("V7 — who sees «تشغيل مرئي» in the book", () => {
  it("a student (not the teacher's reader) on a desktop: only when the class's book tools allow it", async () => {
    for (const [bookTools, expected] of [[VISUAL, true], [RUN, false], [undefined, false]] as const) {
      const panel = await openEditorIn(<CourseToolDock courseId="899271d" bookTools={bookTools} runHeaders={{ Authorization: "Bearer S" }} />);
      await within(panel).findByRole("button", { name: "تشغيل" });
      expect({ bookTools: !!bookTools && bookTools === VISUAL, button: !!within(panel).queryByRole("button", { name: "تشغيل مرئي" }) }).toEqual({ bookTools: bookTools === VISUAL, button: expected });
      cleanup(); resetDeviceLabForTests();
    }
  });
  it("a student on a phone: never (the phone keeps the server path, which cannot record)", async () => {
    desktop(false);
    const panel = await openEditorIn(<CourseToolDock courseId="899271d" bookTools={VISUAL} runHeaders={{ Authorization: "Bearer S" }} />);
    await within(panel).findByRole("button", { name: "تشغيل" });
    expect(within(panel).queryByRole("button", { name: "تشغيل مرئي" })).toBeNull();
  });
  it("an exam: never — its tool bar has no runner at all, whatever the spec says", async () => {
    const panel = await openEditorIn(<StudentToolDock studentTools={VISUAL} />);
    await within(panel).findByTestId("csharp-editor-tool");
    expect(within(panel).queryByRole("button", { name: "تشغيل مرئي" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
  });
});
