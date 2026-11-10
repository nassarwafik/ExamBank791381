// @vitest-environment happy-dom
// Hotfix — `openStudentView` must wait for the view it is asked for. «المشاريع» joins the portal's view bar only once the project
// panel's own read answers (projectsAvailable), so the bar can already hold its other buttons while that read is in flight. The
// testkit used to take the bar's buttons as soon as ANY existed and fail when «المشاريع» was not among them yet — a race that broke
// `StudentPortal.ux7a` on a slow CI runner (post-merge run of main bdfeff00). These two cases make the late button deterministic.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { openStudentView } from "./portalViews.testkit";
import StudentPortal from "../StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const later = <T,>(ms: number, v: () => Promise<T>) => new Promise<T>(r => setTimeout(() => r(v()), ms));

function LateBar({ onProjects }: { onProjects: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 80); return () => clearTimeout(t); }, []);
  return (
    <nav aria-label="أقسام بوابة الطالب">
      <button type="button">اليوم</button>
      <button type="button">الواجبات</button>
      {late && <button type="button" onClick={onProjects}>المشاريع</button>}
    </nav>
  );
}

describe("hotfix: openStudentView waits for the view it is asked for", () => {
  it("a view button that joins the bar after the others is still found and clicked", async () => {
    const onProjects = vi.fn();
    render(<LateBar onProjects={onProjects} />);
    await openStudentView("المشاريع");
    expect(onProjects).toHaveBeenCalledTimes(1);
  });

  it("the real portal with a slow project read: «المشاريع» is reached once the read answers", async () => {
    const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
    const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
    const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
    const tracker = { ok: true, enrolled: true, className: "الصف", projects: [{ projectCode: "794589", title: "مشروع الكتاب", tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }],
      summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 50, trackProgress: { book: 50 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 1 }, readyForReviewCount: 0, complete: false },
      stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة الفصل الأول", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة الأولى", order: 1 }],
      progress: { B01: { status: "approved" } }, nextStages: { book: null } }] };
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats });
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      if (url.includes("/api/student-project-tracker")) return later(300, () => res(200, tracker));   // the bar is up well before this answers
      if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
      return res(404, { ok: false });
    }) as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="أحمد" onLogout={() => {}} />);
    await screen.findByRole("navigation", { name: "أقسام بوابة الطالب" });
    await openStudentView("المشاريع");
    expect(await screen.findByRole("region", { name: "مشاريعي" })).toBeTruthy();
  });
});
