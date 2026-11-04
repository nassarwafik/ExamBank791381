// @vitest-environment happy-dom
// Tadris+ P7-B1 — the student portal follows the server's `services` (with every unified count snapshot): when the student's teacher
// offers no messaging, there is no «الرسائل» entry, no messages chip in «اليوم» and no «فتح الرسائل» in the bell. An older API
// without `services` keeps every entry, as before. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const counts = (services?: { messages: boolean }) => ({ ok: true, messages: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false }, events: { unread: 0, capped: false }, bell: { unread: 0, capped: false }, ...(services ? { services } : {}) });
function mount(services?: { messages: boolean }) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, { ok: true, student: { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null }, strength: null, recognition: null, study: { lastActivity: null } });
    if (url.includes("/api/student-notifications")) return res(200, counts(services));
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="t" displayName="أحمد" onLogout={() => {}} />);
}
const messagesEntry = () => screen.queryAllByRole("button").filter(b => /^الرسائل/.test((b.textContent || "").trim()));

describe("P7-B1 student portal — the messaging entries follow `services.messages`", () => {
  it("no messaging from the teacher: no «الرسائل» entry and no messages chip", async () => {
    mount({ messages: false });
    await screen.findByRole("region", { name: "أكمل من حيث توقفت" });
    await waitFor(() => expect(messagesEntry()).toEqual([]));
    expect(screen.queryByRole("button", { name: "افتح رسائل المعلم" })).toBeNull();
  });
  it("messaging offered — and an older API without `services`: the entries as before", async () => {
    for (const services of [{ messages: true }, undefined]) {
      mount(services);
      await screen.findByRole("region", { name: "أكمل من حيث توقفت" });
      await waitFor(() => expect(messagesEntry().length).toBeGreaterThan(0));
      expect(screen.getByRole("button", { name: "افتح رسائل المعلم" })).toBeTruthy();
      cleanup();
    }
  });
});
