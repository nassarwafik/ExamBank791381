// @vitest-environment happy-dom
// Tadris+ P7-B2 — the games pages follow the server: the student's page lists only the games open to their teacher (`services.games`),
// the teacher's page only the games open to them (the session's `access.games`); without that information (an older API) every
// game, as before. The student portal shows no «الألعاب» entry when no game is open. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StudentGamesPage from "./StudentGamesPage";
import TeacherGamesPage from "./TeacherGamesPage";
import StudentPortal from "../StudentPortal";
import { parseTeacherAccess } from "../shell/teacherAccess";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const titles = () => Array.from(document.querySelectorAll(".eb-game-cards > li")).map(li => li.textContent || "");

describe("P7-B2 — the games pages list only the open games", () => {
  it("student: only the open games; none → no card; absent → every game", () => {
    render(<StudentGamesPage token="t" onBack={() => {}} openGames={["live-challenge"]} />);
    expect(titles().join("|")).toMatch(/التحدّي المباشر/);
    expect(titles().join("|")).not.toMatch(/تحدّي أنظمة العد/);
    cleanup();
    render(<StudentGamesPage token="t" onBack={() => {}} openGames={[]} />);
    expect(titles()).toEqual([]);
    cleanup();
    render(<StudentGamesPage token="t" onBack={() => {}} />);
    expect(titles()).toHaveLength(2);
  });
  it("teacher: only the open games; absent → every game; the session answer is parsed", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as Response) as unknown as typeof fetch;
    render(<TeacherGamesPage token="t" openGames={["number-conversion"]} />);
    expect(screen.queryByText("التحدّي المباشر")).toBeNull();
    expect(screen.getAllByText("تحدّي أنظمة العد").length).toBeGreaterThan(0);
    expect(parseTeacherAccess({ status: "ok", enforced: true, capabilities: [], games: ["live-challenge", 3] })).toEqual({ status: "ok", enforced: true, capabilities: [], games: ["live-challenge"] });
    expect(parseTeacherAccess({ status: "ok", enforced: false, capabilities: [] })).toEqual({ status: "ok", enforced: false, capabilities: [] });
  });
});

const res = (body: unknown) => Promise.resolve({ status: 200, ok: true, json: async () => body } as Response);
function portal(games?: string[]) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res({ ok: true, student: { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null }, strength: null, recognition: null, study: { lastActivity: null } });
    if (url.includes("/api/student-notifications")) return res({ ok: true, messages: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false }, events: { unread: 0, capped: false }, bell: { unread: 0, capped: false }, services: { messages: true, ...(games ? { games } : {}) } });
    if (url.includes("/api/achievement-feed")) return res({ ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res({ ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res({ ok: true, materials: [] });
    return res({ ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="t" displayName="أحمد" onLogout={() => {}} />);
}
const gamesEntry = () => screen.queryAllByRole("button").filter(b => /^الألعاب/.test((b.textContent || "").trim()));

describe("P7-B2 — the student portal's «الألعاب» entry", () => {
  it("no open game: no entry; some games (or no information): the entry", async () => {
    portal([]);
    await screen.findByRole("region", { name: "أكمل من حيث توقفت" });
    await waitFor(() => expect(gamesEntry()).toEqual([]));
    cleanup();
    for (const games of [["number-conversion"], undefined]) {
      portal(games);
      await screen.findByRole("region", { name: "أكمل من حيث توقفت" });
      await waitFor(() => expect(gamesEntry().length).toBeGreaterThan(0));
      cleanup();
    }
  });
});
