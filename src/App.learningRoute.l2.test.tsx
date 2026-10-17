// @vitest-environment happy-dom
// Phase L.2 — the teacher app honours a Learning Materials link: signing in with #/learning/… in the URL opens
// «المواد التعليمية» at that place instead of the default first page; leaving the page through the sidebar removes the
// fragment, and without one the app starts exactly where it always did.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true, classes: [], students: [], assignments: [], exams: [], posts: [], projects: [], events: [] });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;
afterEach(() => { cleanup(); history.replaceState(null, "", location.pathname); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("L.2 — the teacher app opens a Learning Materials link", () => {
  it("a book link opens «المواد التعليمية» at that book; the sidebar away clears the fragment", async () => {
    history.replaceState(null, "", location.pathname + "#/learning/791381");
    installFetch();
    render(<App />);
    await login();
    expect(await screen.findByRole("button", { name: "بدء القراءة" })).toBeTruthy();
    expect(h1()).toBe("المواد التعليمية");
    expect(location.hash).toBe("#/learning/791381");
    const sidebar = screen.getByRole("complementary", { name: "التنقل الرئيسي" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "الصفوف والطلاب" }));
    expect(h1()).toBe("الصفوف والطلاب");
    expect(location.hash).toBe("");
  }, 30000);                                                      // the App + the lazy Learning page load cold here

  it("without a fragment the app starts on its usual page", async () => {
    installFetch();
    render(<App />);
    await login();
    await screen.findByRole("heading", { level: 1 });
    expect(h1()).not.toBe("المواد التعليمية");
    expect(location.hash).toBe("");
  }, 30000);
});
