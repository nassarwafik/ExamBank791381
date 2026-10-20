// @vitest-environment happy-dom
// Phase P-5c — the project dashboard shows how many students have not started («لم يبدأوا»), from the server's
// `summary.notStartedCount` (P-5b rule). The card appears only when the server reports at least one; nothing is recomputed.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ProjectDashboard from "./ProjectDashboard";
import type { TrackMeta } from "./types";

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "pt", title: "باكيت تريسر" }] as TrackMeta[];
const SUMMARY = { studentCount: 30, avgOverall: 40, trackAverages: { book: 50, pt: 30 }, completedCount: 2, studentsReadyForReview: 3, totalReadyStages: 5, staleCount: 4, trackWeights: { book: 50, pt: 50 }, staleDays: 7 };

function mount(summary: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, summary }) }) as Response) as unknown as typeof fetch;
  render(<ProjectDashboard token="t" projectCode="899373" classId="c1" tracks={TRACKS} />);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const card = (label: string) => Array.from(document.querySelectorAll(".eb-stat-card")).find(c => c.querySelector(".eb-stat-label")?.textContent === label) as HTMLElement | undefined;

describe("P-5c — «لم يبدأوا» on the project dashboard", () => {
  it("shows the server's count with its own card, next to the unchanged «بلا تحديث» hint", async () => {
    mount({ ...SUMMARY, notStartedCount: 6 });
    await screen.findByText("لوحة المشروع");
    const c = card("لم يبدأوا");
    expect(c).toBeTruthy();
    expect(c!.querySelector(".eb-stat-value")?.textContent).toBe("6");
    expect(c!.className).toContain("tone-attention");
    expect(c!.querySelector(".eb-stat-hint")?.textContent).toBe("لم يبدأ أي مرحلة بعد");
    expect(card("مراحل جاهزة للفحص")!.querySelector(".eb-stat-hint")?.textContent).toBe("بلا تحديث 7+ أيام: 4");
  });
  it("no card when everyone started (the field is absent)", async () => {
    mount(SUMMARY);
    await screen.findByText("لوحة المشروع");
    expect(card("لم يبدأوا")).toBeUndefined();
    expect(document.querySelectorAll(".eb-stat-card")).toHaveLength(4);
  });
});
