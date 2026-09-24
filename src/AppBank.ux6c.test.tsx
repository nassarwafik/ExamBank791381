// @vitest-environment happy-dom
//
// UX-6c — App-level navigation for the Exam Bank destination: the sidebar group head is a real destination that
// opens the management page; the Builder and Import links (its children) still open their surfaces; the builder /
// import breadcrumb leads back to the bank; entering the bank adds exactly its two loads; leaving to the import
// surface and returning reloads the bank so newly imported questions are visible.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";
import App from "./App";

const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }] }];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const q = (id: string, text: string) => ({ id, sourceId: "import-x", sourceKind: "import", official: false, questionNumber: "1", section: "BASIC", topic: "T", difficulty: 2, difficultyLabel: "", type: "shortAnswer", presentationType: "open", text, options: [], fields: [], answer: { mode: "manual", values: [] }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" });
let bankQuestions = [q("import-x-1", "سؤال مستورد أول")];
let calls: string[] = [];

function installFetch() {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url.replace(/^https?:\/\/[^/]+/, ""));
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: PROJECTS });
      return res(200, { ok: true });
    }
    if (url.includes("/api/bank-questions")) return res(200, { ok: true, questions: bankQuestions });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [] });
    if (url.includes("/api/students")) return res(200, { ok: true, students: [] });
    if (url.includes("/api/assignments")) return res(200, { ok: true, assignments: [] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const nav = (label: string) => within(sidebar()).getByRole("button", { name: label });
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => {
  calls = []; bankQuestions = [q("import-x-1", "سؤال مستورد أول")];
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-6c — Exam Bank navigation", () => {
  it("بنك الامتحانات is a real sidebar destination inside its group: clicking it opens the management page with its own h1; Builder and Import links still work and remain the group's children", async () => {
    render(<App />); await login();
    await screen.findByRole("heading", { level: 1 });
    const group = within(sidebar()).getByRole("group", { name: "بنك الامتحانات" });
    const links = within(group).getAllByRole("button").map(b => b.textContent?.trim());
    expect(links).toEqual(["بنك الامتحانات", "باني الامتحان", "استيراد من ملف"]);
    expect(within(group).getByRole("button", { name: "بنك الامتحانات" }).className).toContain("eb-nav-group-head");
    expect(within(group).getByRole("button", { name: "باني الامتحان" }).className).toContain("eb-nav-child");
    const before = calls.length;
    fireEvent.click(nav("بنك الامتحانات"));
    expect(h1()).toBe("بنك الامتحانات");
    expect(nav("بنك الامتحانات").getAttribute("aria-current")).toBe("page");
    await screen.findByRole("region", { name: "بنك الامتحانات" });
    await screen.findByText("عدد الأسئلة");
    // exactly the two entry loads; App's pre-existing per-view effect also re-reads the project summary on any view change (unchanged),
    // and the ONE teacher self-profile read of the session (identity) may still be in flight from login.
    // (App's global badge reads — project-tracker summary, teacher-profile, Phase 5D unread-messages summary — are not bank loads.)
    await waitFor(() => expect(calls.slice(before).filter(u => !u.includes("/api/project-tracker") && !u.includes("/api/teacher-profile") && !u.includes("/api/messages?kind=unread-summary")).sort()).toEqual(["/api/bank-questions", "/api/saved-exams"]));
    expect(within(sidebar()).getAllByRole("button").filter(b => b.getAttribute("aria-current") === "page")).toHaveLength(1);
    fireEvent.click(nav("باني الامتحان"));
    expect(h1()).toBe("باني الامتحان"); expect(document.querySelector(".builder-content")).toBeTruthy();
    fireEvent.click(nav("استيراد من ملف"));
    expect(h1()).toBe("استيراد من ملف"); expect(await screen.findByText("استيراد أسئلة من ملف")).toBeTruthy();
  });
  it("the breadcrumb ancestor «بنك الامتحانات» on the builder and import pages leads to the management page", async () => {
    render(<App />); await login();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(nav("استيراد من ملف"));
    const crumbs = screen.getByRole("navigation", { name: "مسار الصفحة" });
    fireEvent.click(within(crumbs).getByRole("button", { name: "بنك الامتحانات" }));
    expect(h1()).toBe("بنك الامتحانات");
    await screen.findByRole("region", { name: "بنك الامتحانات" });
  });
  it("the page's actions route through App: «إنشاء امتحان جديد» opens the builder, «استيراد أسئلة» opens the import surface; returning to the bank reloads it so imported questions show up", async () => {
    render(<App />); await login();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(nav("بنك الامتحانات"));
    await screen.findByText("عدد الأسئلة");
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    await screen.findByText("سؤال مستورد أول");
    expect(screen.queryByText("سؤال مستورد ثانٍ")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "استيراد" }));
    expect(h1()).toBe("استيراد من ملف");
    bankQuestions = [q("import-x-1", "سؤال مستورد أول"), q("import-y-1", "سؤال مستورد ثانٍ")];   // an import committed meanwhile
    const before = calls.filter(u => u === "/api/bank-questions").length;
    fireEvent.click(nav("بنك الامتحانات"));
    await screen.findByText("عدد الأسئلة");
    await waitFor(() => expect(calls.filter(u => u === "/api/bank-questions").length).toBe(before + 1));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء امتحان جديد" }));                      // overview action (the page re-entered on its overview)
    expect(h1()).toBe("باني الامتحان");
    fireEvent.click(nav("بنك الامتحانات"));
    await screen.findByText("عدد الأسئلة");
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    await screen.findByText("سؤال مستورد ثانٍ");
  });
});
