// @vitest-environment happy-dom
// Tadris+ P2-A2b — the teacher invitation / reset page against a mocked P2-A2a API (test data only):
//   the token is read once and REMOVED from the address bar; inspect → greeting with the username; local checks (≥ 12, confirmation)
//   → accept → done (sign-in link); an unusable link is one clear message; a missing token explains what to do; nothing is stored.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import InviteApp from "./InviteApp";
import { isInviteLocation, inviteTokenFromHash } from "./inviteRoute";

type Call = { url: string; body: Record<string, string> };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => { status: number; body: unknown }> = {};
const TOKEN = "Abc_def-0123456789abcdefghijklmnopqrstuvwxy";

beforeEach(() => {
  calls = []; routes = {};
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState(null, "", "/#/invite/" + TOKEN);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, body: init.body ? JSON.parse(String(init.body)) : {} };
    calls.push(c);
    const h = routes[url];
    const r = h ? h(c) : { status: 404, body: { ok: false } };
    return { ok: r.status < 300, status: r.status, json: async () => r.body } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("P2-A2b invite route", () => {
  it("recognises #/invite and #/invite/<43-char token> only", () => {
    expect(TOKEN).toHaveLength(43);
    expect(isInviteLocation("#/invite/" + TOKEN)).toBe(true);
    expect(isInviteLocation("#/invite")).toBe(true);
    for (const h of ["", "#/owner", "#/invite/short", "#/invite/" + TOKEN + "x", "#/inviteX"]) expect(isInviteLocation(h)).toBe(false);
    expect(inviteTokenFromHash("#/invite/" + TOKEN)).toBe(TOKEN);
    expect(inviteTokenFromHash("#/invite")).toBe("");
  });
  it("main.tsx mounts the invite entry on its own surface; the page itself is only imported lazily", () => {
    const main = readFileSync(path.join(import.meta.dirname, "..", "main.tsx"), "utf8");
    const entry = readFileSync(path.join(import.meta.dirname, "InviteEntry.tsx"), "utf8");
    expect(main).toMatch(/surface === 'invite' \? <InviteEntry \/>/);
    expect(main).not.toMatch(/InviteApp/);
    expect(entry).toMatch(/lazy\(lazyWithRetry\(\(\) => import\("\.\/InviteApp"\)/);
  });
});

describe("P2-A2b invite page", () => {
  it("reads the token once, removes it from the address bar, greets the teacher, sets the password, then points to sign-in", async () => {
    routes["/api/teacher-invitation/inspect"] = () => ({ status: 200, body: { ok: true, displayName: "سارة", username: "t.sara", purpose: "invite", expiresAt: "2026-11-04T10:00:00Z" } });
    routes["/api/teacher-invitation/accept"] = () => ({ status: 200, body: { ok: true, username: "t.sara" } });
    render(<InviteApp />);
    expect(await screen.findByRole("heading", { name: "تفعيل حسابك" })).toBeTruthy();
    expect(window.location.hash).toBe("#/invite");
    expect(window.location.href).not.toContain(TOKEN);
    expect(calls[0]).toEqual({ url: "/api/teacher-invitation/inspect", body: { token: TOKEN } });
    expect(screen.getByText("t.sara")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور" }));
    expect((await screen.findByRole("alert")).textContent).toContain("12");
    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/), { target: { value: "a long teacher passphrase" } });
    fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور"), { target: { value: "a long teacher passphrase!" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور" }));
    expect((await screen.findByRole("alert")).textContent).toContain("لا يطابقها");
    expect(calls.some(c => c.url.endsWith("/accept"))).toBe(false);

    fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور"), { target: { value: "a long teacher passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور" }));
    expect(await screen.findByRole("heading", { name: /تم تفعيل حسابك/ })).toBeTruthy();
    expect(calls.find(c => c.url.endsWith("/accept"))!.body).toEqual({ token: TOKEN, password: "a long teacher passphrase" });
    expect(screen.getByRole("link", { name: "الذهاب إلى صفحة الدخول" })).toBeTruthy();
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TOKEN);
  });

  it("a reset link says so", async () => {
    routes["/api/teacher-invitation/inspect"] = () => ({ status: 200, body: { ok: true, displayName: "سارة", username: "t.sara", purpose: "reset", expiresAt: "2026-11-04T10:00:00Z" } });
    render(<InviteApp />);
    expect(await screen.findByRole("heading", { name: "إعادة تعيين كلمة المرور" })).toBeTruthy();
  });

  it("an unusable link is one clear message; the server's policy message is shown on accept", async () => {
    routes["/api/teacher-invitation/inspect"] = () => ({ status: 404, body: { ok: false, code: "INVITATION_INVALID", error: "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من إدارة المنصة." } });
    render(<InviteApp />);
    expect(await screen.findByRole("heading", { name: "لا يمكن استخدام هذا الرابط" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("اطلب رابطًا جديدًا");
  });

  it("the server refusing the password shows its message and keeps the form", async () => {
    routes["/api/teacher-invitation/inspect"] = () => ({ status: 200, body: { ok: true, displayName: "سارة", username: "t.sara", purpose: "invite", expiresAt: "x" } });
    routes["/api/teacher-invitation/accept"] = () => ({ status: 400, body: { ok: false, code: "PASSWORD_CONTAINS_USERNAME", error: "كلمة المرور يجب ألا تحتوي اسم المستخدم." } });
    render(<InviteApp />);
    await screen.findByRole("heading", { name: "تفعيل حسابك" });
    fireEvent.change(screen.getByLabelText(/^كلمة المرور الجديدة/), { target: { value: "my t.sara passphrase" } });
    fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور"), { target: { value: "my t.sara passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور" }));
    expect((await screen.findByRole("alert")).textContent).toContain("يجب ألا تحتوي اسم المستخدم");
    expect(screen.getByRole("button", { name: "حفظ كلمة المرور" })).toBeTruthy();
  });

  it("without a token (e.g. after a reload) the page explains what to do and calls nothing", async () => {
    window.history.replaceState(null, "", "/#/invite");
    render(<InviteApp />);
    expect(await screen.findByRole("heading", { name: "رابط الدعوة غير مكتمل" })).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
