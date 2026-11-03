// @vitest-environment happy-dom
// Trial accounts — the teacher's own trial notice in the teacher shell (test data only): the end date while the trial runs; a
// warning (role="alert") in the last days, as the server decides; nothing for a permanent account or a malformed answer.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import TeacherAppShell from "./TeacherAppShell";
import TrialNotice, { parseTeacherTrial, daysLeft, type TeacherTrialView } from "./TrialNotice";
import type { TeacherNavState } from "./teacherNav";

const NOW = Date.parse("2026-11-02T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const nav: TeacherNavState = { teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] };
const shell = (trial: TeacherTrialView | null) => render(
  <TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={vi.fn() as never} onLogout={vi.fn()} trial={trial}>
    <p>محتوى الصفحة</p>
  </TeacherAppShell>
);

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("trial accounts — the teacher's trial notice", () => {
  it("parses only a well-formed server answer", () => {
    expect(parseTeacherTrial(null)).toBeNull();
    expect(parseTeacherTrial({})).toBeNull();
    expect(parseTeacherTrial({ endsAt: "soon" })).toBeNull();
    expect(parseTeacherTrial({ endsAt: "2026-11-10T10:00:00.000Z" })).toEqual({ endsAt: "2026-11-10T10:00:00.000Z", endingSoon: false });
    expect(parseTeacherTrial({ endsAt: "2026-11-10T10:00:00.000Z", endingSoon: true })).toEqual({ endsAt: "2026-11-10T10:00:00.000Z", endingSoon: true });
  });

  it("days left round up and never fall below one", () => {
    expect(daysLeft(new Date(NOW + 3 * DAY).toISOString(), NOW)).toBe(3);
    expect(daysLeft(new Date(NOW + 2 * DAY + 1).toISOString(), NOW)).toBe(3);
    expect(daysLeft(new Date(NOW + 1000).toISOString(), NOW)).toBe(1);
    expect(daysLeft(new Date(NOW - 1000).toISOString(), NOW)).toBe(1);
  });

  it("a running trial: the end date and the days left, as a status line", () => {
    render(<TrialNotice trial={{ endsAt: new Date(NOW + 10 * DAY).toISOString(), endingSoon: false }} nowMs={NOW} />);
    const s = screen.getByRole("status");
    expect(s.textContent).toContain("حسابك تجريبي حتى");
    expect(s.textContent).toContain("10 أيام");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the last days (server says endingSoon): a warning alert with what happens next", () => {
    render(<TrialNotice trial={{ endsAt: new Date(NOW + 2 * DAY).toISOString(), endingSoon: true }} nowMs={NOW} />);
    const a = screen.getByRole("alert");
    expect(a.textContent).toContain("تنبيه: تنتهي تجربتك خلال يومين");
    expect(a.textContent).toContain("يتوقف دخولك");
    expect(a.textContent).toContain("تبقى بياناتك محفوظة");
  });

  it("the shell shows the notice above the page content, and nothing for a permanent account", () => {
    shell({ endsAt: new Date(Date.now() + 10 * DAY).toISOString(), endingSoon: false });
    const main = screen.getByRole("main");
    expect(main.firstElementChild?.className).toContain("eb-trial-notice");
    expect(screen.getByText("محتوى الصفحة")).toBeTruthy();
    cleanup();
    shell(null);
    expect(document.querySelector(".eb-trial-notice")).toBeNull();
  });
});
