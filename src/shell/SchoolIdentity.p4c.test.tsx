// @vitest-environment happy-dom
// Tadris+ P4-C — the school identity at the top of the teacher shell and the student portal (test data only):
//   no school → nothing at all (zero change); a school → its name (and its logo once loaded, decorative: the name is written);
//   App-level: the school comes with the sign-in answer (no extra request); the logo is read from /api/school-logo with the
//   teacher's own headers, and only when the school has a logo; signing out forgets it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "../App";
import TeacherAppShell from "./TeacherAppShell";
import StudentShell from "./StudentShell";
import { parseSchoolIdentity } from "./schoolIdentity";
import type { TeacherNavState } from "./teacherNav";

const SCHOOL = { schoolId: "sch_00112233445566aa", name: "مدرسة النور", logo: { version: 3, updatedAt: "2026-11-02T10:00:00.000Z" } };
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body, blob: async () => new Blob(["x"], { type: "image/webp" }) } as Response);
const nav = (): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] });
const badge = () => screen.queryByRole("group", { name: /^المدرسة: / });

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
  URL.createObjectURL = vi.fn(() => "blob:school-logo") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P4-C parseSchoolIdentity", () => {
  it("absent / malformed → null; a valid one → name + logo version (or null)", () => {
    expect(parseSchoolIdentity(undefined)).toBeNull();
    expect(parseSchoolIdentity({ schoolId: "../x", name: "a" })).toBeNull();
    expect(parseSchoolIdentity({ schoolId: SCHOOL.schoolId, name: "   " })).toBeNull();
    expect(parseSchoolIdentity(SCHOOL)).toEqual({ schoolId: SCHOOL.schoolId, name: "مدرسة النور", logoVersion: 3 });
    expect(parseSchoolIdentity({ ...SCHOOL, logo: null })).toEqual({ schoolId: SCHOOL.schoolId, name: "مدرسة النور", logoVersion: null });
  });
});

describe("P4-C the shells", () => {
  it("the teacher shell: nothing without a school; the name and the logo with one", () => {
    const shell = (school?: { name: string; logoUrl: string | null }) => render(
      <TeacherAppShell nav={nav()} projectReadyTotal={0} displayName="المعلم" onNavigate={vi.fn()} onLogout={vi.fn()} school={school}><p>x</p></TeacherAppShell>);
    shell();
    expect(badge()).toBeNull();
    expect(document.querySelector(".eb-school-badge")).toBeNull();
    cleanup();
    shell({ name: "مدرسة النور", logoUrl: "blob:logo" });
    const b = badge()!;
    expect(b.textContent).toBe("مدرسة النور");
    expect(b.querySelector("img")!.getAttribute("src")).toBe("blob:logo");
    expect(b.querySelector("img")!.getAttribute("alt")).toBe("");                 // decorative: the name is written next to it
    expect(b.closest("header")).toBeTruthy();
    cleanup();
    shell({ name: "مدرسة النور", logoUrl: null });
    expect(badge()!.querySelector("img")).toBeNull();                              // no broken image while it loads / without one
  });
  it("the student portal top bar: nothing without a school; the school with one", () => {
    render(<StudentShell studentName="طالب" onLogout={vi.fn()}><p>x</p></StudentShell>);
    expect(badge()).toBeNull();
    cleanup();
    render(<StudentShell studentName="طالب" onLogout={vi.fn()} school={{ name: "مدرسة النور", logoUrl: "blob:logo" }}><p>x</p></StudentShell>);
    expect(badge()!.closest(".student-topbar")).toBeTruthy();
    expect(badge()!.textContent).toBe("مدرسة النور");
  });
});

describe("P4-C App — the school comes with the sign-in answer", () => {
  function installFetch(school: unknown) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input); calls.push({ url, headers: (init.headers || {}) as Record<string, string> });
      if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم", ...(school ? { school } : {}) });
      if (url.includes("/api/school-logo")) return res(200, {});
      if (url.includes("/api/project-tracker")) return res(200, url.includes("projects-summary") ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
      if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
      return res(200, { ok: true, classes: [], students: [], assignments: [], exams: [] });
    }) as unknown as typeof fetch;
    return calls;
  }
  async function login() {
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "t.sara" } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
    fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
    await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
  }

  it("with a school: the badge, and the logo from /api/school-logo with the teacher's own headers (no session probe)", async () => {
    const calls = installFetch(SCHOOL);
    render(<App />); await login();
    await waitFor(() => expect(badge()!.querySelector("img")?.getAttribute("src")).toBe("blob:school-logo"));
    expect(badge()!.textContent).toBe("مدرسة النور");
    const logo = calls.filter(c => c.url.startsWith("/api/school-logo"));
    expect(logo.map(c => c.url)).toEqual(["/api/school-logo?v=3"]);
    expect(logo[0].headers).toMatchObject({ "x-builder-token": "teacher-token" });
    expect(calls.some(c => c.url.includes("/api/platform-session"))).toBe(false);
  });

  it("without a school: no badge and no logo request", async () => {
    const calls = installFetch(null);
    render(<App />); await login();
    expect(badge()).toBeNull();
    expect(calls.some(c => c.url.includes("/api/school-logo"))).toBe(false);
  });

  it("signing out forgets it: the next teacher (without a school) never sees the previous one's", async () => {
    let school: unknown = SCHOOL;
    const calls = installFetch(null);
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).includes("/api/platform-login")
      ? res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم", ...(school ? { school } : {}) })
      : base(input, init)) as unknown as typeof fetch;
    render(<App />); await login();
    await waitFor(() => expect(badge()).toBeTruthy());
    fireEvent.click(document.querySelector(".app-sidebar-logout") as HTMLElement);
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toBeTruthy());
    school = null;
    await login();
    expect(badge()).toBeNull();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("a school without a logo: the name only, no logo request", async () => {
    const calls = installFetch({ ...SCHOOL, logo: null });
    render(<App />); await login();
    await waitFor(() => expect(badge()).toBeTruthy());
    expect(badge()!.querySelector("img")).toBeNull();
    expect(calls.some(c => c.url.includes("/api/school-logo"))).toBe(false);
  });
});
