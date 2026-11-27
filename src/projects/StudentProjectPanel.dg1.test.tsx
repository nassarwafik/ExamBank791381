// @vitest-environment happy-dom
// DG1 (docs/enterprise-diagram-editor-design.md) — «مخططات المشروع» on the student's project page: a card under the project's own
// cards opens «محرّر المخططات» in place of the project view (its own lazy chunk), and «العودة إلى المشروع» brings the project back.
// Opening it sends nothing: the only request is the page's own project read.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const STAGES = [{ stageId: "BK01", track: "book", groupId: "g1", title: "بداية الكتاب", order: 1, weight: 1, required: true, active: true }];
const PROJECT = {
  projectCode: "899373", title: "مشروع 899373", tracks: [{ trackId: "book", title: "الكتاب" }],
  summary: { studentId: "s1", displayName: "ليان", code: "P1", overallProgress: 0, trackProgress: { book: 0 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 },
    readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false },
  stages: STAGES, groups: [{ groupId: "g1", track: "book", title: "الفصل الأول", order: 1 }], progress: {}, nextStages: { book: STAGES[0] }
};

describe("DG1 — the project page offers the diagram editor", () => {
  it("the card opens the editor in place of the project; «العودة إلى المشروع» returns; nothing more is requested", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, enrolled: true, className: "الصف", projects: [PROJECT] }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StudentProjectPanel token="t" contributions={[]} />);
    const open = await screen.findByTestId("open-diagram-editor");
    expect(open.closest(".eb-sp-diagrams-card")!.textContent).toMatch(/UML و ERD و DSD و DFD/);
    const reads = fetchMock.mock.calls.length;
    fireEvent.click(open);
    expect(await screen.findByTestId("diagram-editor", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByTestId("project-diagrams").textContent).toMatch(/مخططات المشروع/);
    expect(screen.queryByText("بداية الكتاب")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشروع/ }));
    expect(await screen.findByTestId("open-diagram-editor")).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBe(reads);
  });
});
