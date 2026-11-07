// @vitest-environment happy-dom
// Tadris+ QR-3 — «الأجهزة المرتبطة» on the QR page and the student's server-side sign-out, against a mocked API (test data only;
// design docs/enterprise-qr-login-qr3.md): the list is this tab's own account (Bearer), newest first, «هذا الجهاز» has no
// «إنهاء»; ending another device calls the server with its id and refreshes; a pre-QR-3 student session is explained; a 401 returns
// to «سجّل الدخول»; the owner's QR page shows no device list; the student's own sign-out ends the server session (keepalive), and
// does nothing without a session.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";

vi.mock("./qrScanner", () => ({ cameraAvailable: () => false, decodeQr: async () => null, decodeQrFile: async () => null }));
import QrApp from "./QrApp";
import { endStudentServerSession } from "../student/studentServerLogout";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string>; keepalive?: boolean };
let calls: Call[] = [];
let answers: Record<string, Array<{ status: number; body: unknown }>> = {};
const answer = (path: string, ...list: Array<{ status: number; body: unknown }>) => { answers[path] = list; };
const H = (n: string) => "a".repeat(63) + n;
const devices = (untracked = false) => ({
  ok: true, role: "student", untracked,
  devices: [
    { id: H("2"), via: "qr", device: { browser: "Edge", os: "Windows" }, createdAt: "2026-11-07T10:00:00Z", expiresAt: "2026-11-07T22:00:00Z", current: false },
    { id: H("1"), via: "login", device: { browser: "Chrome", os: "Android" }, createdAt: "2026-11-07T09:00:00Z", expiresAt: "2026-11-07T21:00:00Z", current: true }
  ]
});

beforeEach(() => {
  calls = []; answers = {};
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {}, headers: { ...(init.headers as Record<string, string>) }, keepalive: init.keepalive });
    const queue = answers[url] || [];
    const next = queue.length > 1 ? queue.shift()! : queue[0] || { status: 404, body: { ok: false, error: "غير موجود." } };
    return { ok: next.status < 300, status: next.status, json: async () => next.body } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("QR-3 «الأجهزة المرتبطة»", () => {
  it("lists this account's devices with how and when they signed in; «هذا الجهاز» has no «إنهاء»", async () => {
    sessionStorage.setItem("examBankBuilderToken", "student-session");
    window.history.replaceState(null, "", "/#/qr-scan");
    answer("/api/session-devices/list", { status: 200, body: devices() });
    render(<QrApp />);
    const section = await screen.findByRole("region", { name: "الأجهزة المرتبطة" });
    const items = await within(section).findAllByRole("listitem");
    expect(items.map(i => i.textContent?.includes("هذا الجهاز"))).toEqual([false, true]);
    expect(items[0].textContent).toContain("Edge على Windows");
    expect(items[0].textContent).toContain("بالباركود");
    expect(items[1].textContent).toContain("بكلمة المرور");
    expect(within(items[0]).getByRole("button", { name: "إنهاء" })).toBeTruthy();
    expect(within(items[1]).queryByRole("button")).toBeNull();
    expect(calls[0]).toMatchObject({ url: "/api/session-devices/list", headers: { Authorization: "Bearer student-session" } });
  });

  it("«إنهاء» ends that device by its id and refreshes the list", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-session");
    window.history.replaceState(null, "", "/#/qr-scan");
    const after = { ...devices(), role: "teacher", devices: [devices().devices[1]] };
    answer("/api/session-devices/list", { status: 200, body: { ...devices(), role: "teacher" } }, { status: 200, body: after });
    answer("/api/session-devices/end", { status: 200, body: { ok: true, ended: true, current: false } });
    render(<QrApp />);
    fireEvent.click(await screen.findByRole("button", { name: "إنهاء" }));
    expect((await screen.findByText(/انتهت جلسة/)).textContent).toContain("Edge على Windows");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(calls.map(c => [c.url, c.body])).toEqual([
      ["/api/session-devices/list", {}], ["/api/session-devices/end", { id: H("2") }], ["/api/session-devices/list", {}]
    ]);
  });

  it("a student session from before QR-3 is explained (it cannot be listed)", async () => {
    sessionStorage.setItem("examBankBuilderToken", "old-student-session");
    window.history.replaceState(null, "", "/#/qr-scan");
    answer("/api/session-devices/list", { status: 200, body: { ok: true, role: "student", untracked: true, devices: [] } });
    render(<QrApp />);
    expect((await screen.findByText(/بدأت قبل تحديث الأجهزة المرتبطة/)).textContent).toContain("تسجيل الدخول من جديد");
  });

  it("a 401 (the session ended elsewhere) returns to «سجّل الدخول»", async () => {
    sessionStorage.setItem("examBankBuilderToken", "ended-session");
    window.history.replaceState(null, "", "/#/qr-scan");
    answer("/api/session-devices/list", { status: 401, body: { ok: false, code: "SESSION_REQUIRED", error: "سجّل الدخول أولًا." } });
    render(<QrApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("سجّل الدخول إلى تدريس+ على هذا الجهاز أولًا");
  });

  it("the owner's QR page shows no device list (owner decision)", async () => {
    sessionStorage.setItem("tadrisOwnerToken", "owner-session");
    window.history.replaceState(null, "", "/#/owner-qr-scan");
    render(<QrApp />);
    await screen.findByRole("heading", { name: "ربط جهاز آخر بحساب المالك" });
    expect(screen.queryByRole("region", { name: "الأجهزة المرتبطة" })).toBeNull();
    expect(calls.filter(c => c.url.startsWith("/api/session-devices"))).toEqual([]);
  });
});

describe("QR-3 the student's own sign-out ends the server session", () => {
  it("fires /api/session-devices/logout with this tab's token, keepalive; nothing without a session", () => {
    endStudentServerSession();
    expect(calls).toEqual([]);
    sessionStorage.setItem("examBankBuilderToken", "student-session");
    endStudentServerSession();
    expect(calls).toEqual([{ url: "/api/session-devices/logout", body: {}, headers: { Authorization: "Bearer student-session", "Content-Type": "application/json" }, keepalive: true }]);
  });
});
