// @vitest-environment happy-dom
// Phase L.2 — the teacher app honours a Learning Materials link: signing in with #/learning/… in the URL opens
// «المواد التعليمية» at that place instead of the default first page; leaving the page through the sidebar removes the
// fragment, and without one the app starts exactly where it always did.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const late = <T,>(p: Promise<T>) => new Promise<T>(resolve => setTimeout(() => resolve(p), 50));
function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    // the sign-in answers LATE, as on a loaded machine: the login page (which has its own h1) is still there meanwhile
    if (url.includes("/api/platform-login")) return late(res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" }));
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
    // wait for what only the signed-in app has: the login page has an h1 of its own, so «any h1» could be met before sign-in ends
    await screen.findByRole("complementary", { name: "التنقل الرئيسي" });
    expect(h1()).not.toBe("المواد التعليمية");
    expect(location.hash).toBe("");
  }, 30000);
});
