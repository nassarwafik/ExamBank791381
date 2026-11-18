// @vitest-environment happy-dom
//
// Hotfix — a teacher page switch starts at the top of the page. Before it, the shell never reset the document's scroll: on a phone,
// opening «الصفوف والطلاب» from the menu could land the teacher mid-page (the offset the menu tap left, then followed by the browser
// while the new page loaded — measured at 672 px in the U.1 harness). The reset happens only when the ACTIVE destination really
// changes: a navigation that is cancelled (for example «leave with unsaved changes?» answered «no») or a re-render keeps the place.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import TeacherAppShell from "./TeacherAppShell";
import type { TeacherNavState } from "./teacherNav";

const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });
const shell = (nav: TeacherNavState) => (
  <TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={() => {}} onLogout={() => {}}><p>محتوى</p></TeacherAppShell>
);

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
  scrollTo = vi.fn();
  (window as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Hotfix — the teacher shell returns to the top on a page switch", () => {
  it("does not scroll on the first render (a reload keeps the browser's own position)", () => {
    render(shell(state()));
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it("scrolls to the top when the active destination changes", () => {
    const view = render(shell(state({ workspaceTab: "dashboard" })));
    view.rerender(shell(state({ workspaceTab: "students" })));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    view.rerender(shell(state({ teacherView: "reports" })));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
  it("keeps the place when the destination does not change (a re-render, or a navigation that was cancelled)", () => {
    const view = render(shell(state({ workspaceTab: "students" })));
    view.rerender(shell(state({ workspaceTab: "students", projectList: [{ projectCode: "899373", title: "مشروع" }] })));
    view.rerender(shell(state({ workspaceTab: "students" })));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
