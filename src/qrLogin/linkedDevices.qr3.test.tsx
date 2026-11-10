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

  // Tadris+ QR-4 (owner request) — the owner's QR page lists the owner's devices too, through the owner's routes only.
  it("the owner's QR page lists the owner's devices with the owner token only", async () => {
    sessionStorage.setItem("tadrisOwnerToken", "owner-session");
    sessionStorage.setItem("examBankBuilderToken", "teacher-session-must-not-be-sent");
    window.history.replaceState(null, "", "/#/owner-qr-scan");
    answer("/api/owner-session/devices", { status: 200, body: { ...devices(), role: "owner" } });
    render(<QrApp />);
    const section = await screen.findByRole("region", { name: "الأجهزة المرتبطة" });
    expect(await within(section).findAllByRole("listitem")).toHaveLength(2);
    expect(calls.map(c => [c.url, c.headers["x-owner-token"], c.headers.Authorization])).toEqual([["/api/owner-session/devices", "owner-session", undefined]]);
  });

  it("ending an owner device asks for the authenticator code when the server requires a step-up, then ends the same device", async () => {
    sessionStorage.setItem("tadrisOwnerToken", "owner-session");
    window.history.replaceState(null, "", "/#/owner-qr-scan");
    answer("/api/owner-session/devices", { status: 200, body: { ...devices(), role: "owner" } }, { status: 200, body: { ...devices(), role: "owner", devices: [devices().devices[1]] } });
    answer("/api/owner-session/end-device", { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } }, { status: 200, body: { ok: true, ended: true, current: false } });
    answer("/api/owner-session/step-up", { status: 200, body: { ok: true } });
    render(<QrApp />);
    fireEvent.click(await screen.findByRole("button", { name: "إنهاء" }));
    fireEvent.change(await screen.findByLabelText(/رمز التحقق من تطبيق المصادقة/), { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد وإنهاء الجلسة" }));
    expect((await screen.findByText(/انتهت جلسة/)).textContent).toContain("Edge على Windows");
    // The notice renders first; the list refresh (the 5th request) is sent by the effect that runs after that render. Wait for the
    // refreshed list (one device left), as the teacher / student test above does, before reading the requests — asserting at once
    // raced that effect and failed once under a loaded full run (4 requests seen instead of 5).
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(calls.map(c => [c.url, c.body])).toEqual([
      ["/api/owner-session/devices", {}],
      ["/api/owner-session/end-device", { id: H("2") }],
      ["/api/owner-session/step-up", { code: "123456" }],
      ["/api/owner-session/end-device", { id: H("2") }],
      ["/api/owner-session/devices", {}]
    ]);
    for (const c of calls) expect(c.headers.Authorization).toBeUndefined();
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
