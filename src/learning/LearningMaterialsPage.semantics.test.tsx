// @vitest-environment happy-dom
// Teacher Learning Materials inside the REAL TeacherAppShell with the REAL Reader: the shell owns the page's single
// <main id="eb-main">; the Reader's content column is a <div class="learning-reader-main"> — never a nested <main> —
// through the normal Reader, page navigation, presentation mode (enter, navigate, exit) and close / reopen.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import TeacherAppShell from "../shell/TeacherAppShell";
import LearningMaterialsPage from "./LearningMaterialsPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });
const SLOW = { timeout: 8000 }, T = 30000;
const nav = { teacherView: "learning", workspaceTab: "exam", projectCode: "", projectList: [] } as never;

const landmarks = () => {
  const mains = Array.from(document.querySelectorAll("main"));
  const column = document.querySelector(".learning-reader-main");
  return {
    mains: mains.map(m => m.id || m.className),
    nested: mains.filter(m => m.parentElement?.closest("main")).length,
    roleMain: document.querySelectorAll("[role=main]").length,
    column: column ? column.tagName + "." + column.className : null,
    columnInsideShellMain: !!column?.closest("main#eb-main"),
  };
};
const EMBEDDED = { mains: ["eb-main"], nested: 0, roleMain: 0, column: "DIV.learning-reader-main", columnInsideShellMain: true };

describe("Teacher Reader inside the teacher shell — exactly one <main> (the shell's)", () => {
  it("normal → next page → presentation (navigate) → exit → back to overview → reopen: one <main>, the column is a <div>", async () => {
    render(
      <TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={vi.fn()} onLogout={vi.fn()}>
        <LearningMaterialsPage />
      </TeacherAppShell>,
    );
    expect(landmarks()).toEqual({ ...EMBEDDED, column: null, columnInsideShellMain: false });   // library: shell only
    fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(landmarks(), "normal").toEqual(EMBEDDED);

    const firstTitle = document.querySelector(".learning-reader-page-title")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => expect(document.querySelector(".learning-reader-page-title")?.textContent).not.toBe(firstTitle), SLOW);
    expect(landmarks(), "next page").toEqual(EMBEDDED);

    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")?.classList.contains("is-presentation")).toBe(true));
    expect(landmarks(), "presentation").toEqual(EMBEDDED);
    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(landmarks(), "presentation → previous").toEqual(EMBEDDED);
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")?.classList.contains("is-presentation")).toBe(false));
    expect(landmarks(), "presentation exited").toEqual(EMBEDDED);

    fireEvent.click(screen.getByRole("button", { name: "العودة إلى نظرة الكتاب" }));
    await screen.findByRole("button", { name: "بدء القراءة" });
    expect(landmarks(), "closed").toEqual({ ...EMBEDDED, column: null, columnInsideShellMain: false });
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(landmarks(), "reopened").toEqual(EMBEDDED);
  }, T);
});
