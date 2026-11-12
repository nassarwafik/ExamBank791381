// @vitest-environment happy-dom
//
// Tadris+ P11-C — a student of several classes sees the projects of each class in ONE panel: the server names the class that runs
// each project (`className`) and marks the project of an archived class read-only (`readOnly`) while the others still take
// «أنجزتها». A student of one class (no such fields) sees exactly what they saw before. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";

const project = (code: string, title: string, extra: Record<string, unknown> = {}) => ({ projectCode: code, title, tracks: [{ trackId: "book", title: "الكتاب", icon: "" }], summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 40, trackProgress: { book: 40 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false }, stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة", order: 1 }], progress: {}, nextStages: { book: null }, ...extra });
function serve(body: unknown) {
  globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => body }) as Response) as unknown as typeof fetch;
}
const cardClass = (title: string) => [...document.querySelectorAll(".eb-sp-project-card")].find(a => a.querySelector("h3")?.textContent === title)?.querySelector("[data-testid='project-class']")?.textContent ?? null;
const openProject = async (title: string) => {
  const card = [...document.querySelectorAll(".eb-sp-project-card")].find(a => a.querySelector("h3")?.textContent === title) as HTMLElement;
  fireEvent.click(card.querySelector("button") as HTMLButtonElement);
  await waitFor(() => expect(document.querySelector(".eb-sp-project[data-project-code]")).not.toBeNull());
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P11-C the student's projects across classes", () => {
  it("each card names the class that runs the project", async () => {
    serve({ ok: true, enrolled: true, className: "صف الحاسوب", projects: [project("P1", "مشروع الكتاب", { className: "صف الحاسوب" }), project("P2", "مشروع الشبكة", { className: "صف الشبكات" })] });
    render(<StudentProjectPanel token="t1" />);
    await waitFor(() => expect(document.querySelectorAll(".eb-sp-project-card")).toHaveLength(2));
    expect(cardClass("مشروع الكتاب")).toBe("صف الحاسوب");
    expect(cardClass("مشروع الشبكة")).toBe("صف الشبكات");
  });
  it("the project of an archived class is read-only; the project of the open class still takes «أنجزتها»", async () => {
    serve({ ok: true, enrolled: true, className: "صف الشبكات", projects: [project("P1", "مشروع الكتاب", { className: "صف الحاسوب", readOnly: true }), project("P2", "مشروع الشبكة", { className: "صف الشبكات" })] });
    render(<StudentProjectPanel token="t1" />);
    await waitFor(() => expect(document.querySelectorAll(".eb-sp-project-card")).toHaveLength(2));
    await openProject("مشروع الكتاب");
    expect(screen.getByTestId("project-read-only")).toBeTruthy();
    expect(document.querySelectorAll(".eb-sp-done-btn")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    await openProject("مشروع الشبكة");
    expect(screen.queryByTestId("project-read-only")).toBeNull();
    expect(document.querySelectorAll(".eb-sp-done-btn").length).toBeGreaterThan(0);
  });
  it("a student of one class: no class line on the card (the response of before)", async () => {
    serve({ ok: true, enrolled: true, className: "الصف", projects: [project("P1", "مشروع الكتاب"), project("P2", "مشروع الشبكة")] });
    render(<StudentProjectPanel token="t1" />);
    await waitFor(() => expect(document.querySelectorAll(".eb-sp-project-card")).toHaveLength(2));
    expect(document.querySelector("[data-testid='project-class']")).toBeNull();
  });
});
