// @vitest-environment happy-dom
//
// The classic builder's access bar offers the way back to the Exam Studio. A teacher who pressed «الواجهة الكلاسيكية» on the
// Studio's exams home used to find no visible way back from the classic page (the only one sat inside the open builder's tools
// menu, as «تجربة استوديو الامتحان (جديد)»), so the exams list seemed to have disappeared. Through the REAL App with a mocked
// teacher API: the button is on the classic bar, it switches the layout and stores the choice, and the round trip works.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { STUDIO_LAYOUT_KEY } from "./studio/studioPreference";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
async function openBuilder() {
  const nav = await screen.findByRole("button", { name: "باني الامتحان" }, { timeout: 8000 });
  await click(nav);
}

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  sessionStorage.setItem("examBankBuilderToken", "teacher-token");
  sessionStorage.setItem("examBankSessionRole", "teacher");
  sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("classic builder — the way back to the Exam Studio", () => {
  it("the classic access bar shows «العودة إلى استوديو الامتحان»; it opens the Studio's exams home and stores the choice; the round trip works", async () => {
    localStorage.setItem(STUDIO_LAYOUT_KEY, "classic");
    render(<App />);
    await openBuilder();
    expect(await screen.findByRole("button", { name: /الامتحانات المحفوظة/ })).toBeTruthy();       // the classic bar
    expect(screen.queryByRole("button", { name: "الواجهة الكلاسيكية" })).toBeNull();

    await click(screen.getByRole("button", { name: /العودة إلى استوديو الامتحان/ }));
    expect(localStorage.getItem(STUDIO_LAYOUT_KEY)).toBe("studio");
    const classic = await screen.findByRole("button", { name: "الواجهة الكلاسيكية" }, { timeout: 8000 });   // the Studio's exams home
    expect(screen.queryByRole("button", { name: /العودة إلى استوديو الامتحان/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /الامتحانات المحفوظة/ })).toBeNull();

    await click(classic);
    expect(localStorage.getItem(STUDIO_LAYOUT_KEY)).toBe("classic");
    expect(await screen.findByRole("button", { name: /العودة إلى استوديو الامتحان/ })).toBeTruthy();
  });

  it("the Studio's exams home (the default layout) does not show the button", async () => {
    render(<App />);
    await openBuilder();
    expect(await screen.findByRole("button", { name: "الواجهة الكلاسيكية" }, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /العودة إلى استوديو الامتحان/ })).toBeNull();
  });
});
