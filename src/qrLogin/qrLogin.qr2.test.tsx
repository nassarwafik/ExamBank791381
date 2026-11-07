// @vitest-environment happy-dom
// Tadris+ QR-2 — the QR sign-in screens against a mocked API (test data only; design docs/enterprise-qr-login-qr1.md):
//   routes: only this site's QR addresses are recognised; a scanned QR of another site / look-alike host / the other namespace is
//           refused before any request;
//   the QR itself: what is drawn decodes back to exactly the address (jsQR round trip);
//   the new device: start → QR + number → poll (pending … session once) → the session handed over; denied / expired handled;
//           no polling while the page is hidden;
//   the approving device: no session → nothing is called; a token in the address is removed at once; inspect → device + network
//           warning + 3 numbers → approve with the picked number / «لست أنا»; the owner's step-up is asked when required;
//   the platform session is stored exactly like a password sign-in; an owner answer is never stored as a platform session.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, act } from "@testing-library/react";
import jsQR from "jsqr";

const scanner = vi.hoisted(() => ({ text: null as string | null }));
vi.mock("./qrScanner", () => ({
  cameraAvailable: () => false,
  decodeQr: async () => scanner.text,
  decodeQrFile: async () => scanner.text
}));

import { isQrLocation, qrRouteFromHash, parseScannedQr, qrAddress, QR_SCAN_HASH, OWNER_QR_SCAN_HASH } from "./qrRoute";
import { qrPathData } from "./qrMatrix";
import { qrApi, deviceLabel } from "./qrApi";
import { storePlatformSession } from "./qrSession";
import QrSignInPanel from "./QrSignInPanel";
import QrApp from "./QrApp";

const T = "Qr_pair-0123456789abcdefghijklmnopqrstuvwxy";       // 43 characters, like the server's tokens
const T2 = "Qr_pair-ZYXWVUTSRQPONMLKJIHGFEDCBA987654321";
const SECRET = "Poll_sec-0123456789abcdefghijklmnopqrstuvwx";
const ORIGIN = "https://tadris.example";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };
let calls: Call[] = [];
let answers: Record<string, Array<{ status: number; body: unknown }>> = {};
const answer = (path: string, ...list: Array<{ status: number; body: unknown }>) => { answers[path] = list; };

beforeEach(() => {
  calls = []; answers = {}; scanner.text = null;
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {}, headers: { ...(init.headers as Record<string, string>) } });
    const queue = answers[url] || [];
    const next = queue.length > 1 ? queue.shift()! : queue[0] || { status: 404, body: { ok: false, code: "NOT_FOUND", error: "غير موجود." } };
    return { ok: next.status < 300, status: next.status, json: async () => next.body } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("QR-2 routes", () => {
  it("recognises the four QR addresses only", () => {
    expect([T.length, T2.length]).toEqual([43, 43]);
    expect(qrRouteFromHash(QR_SCAN_HASH)).toEqual({ ns: "platform", token: "" });
    expect(qrRouteFromHash(OWNER_QR_SCAN_HASH)).toEqual({ ns: "owner", token: "" });
    expect(qrRouteFromHash("#/qr-login/" + T)).toEqual({ ns: "platform", token: T });
    expect(qrRouteFromHash("#/owner-qr-login/" + T)).toEqual({ ns: "owner", token: T });
    for (const h of ["", "#/owner", "#/qr-login/short", "#/qr-login/" + T + "x", "#/qr-scanX", "#/handoff/" + T, "#/owner/qr-scan"]) expect(isQrLocation(h)).toBe(false);
  });
  it("a scanned QR is accepted only as an address of THIS site", () => {
    expect(parseScannedQr(ORIGIN + "/#/qr-login/" + T, ORIGIN)).toEqual({ ns: "platform", token: T });
    expect(parseScannedQr(ORIGIN + "/#/owner-qr-login/" + T, ORIGIN)).toEqual({ ns: "owner", token: T });
    for (const text of ["https://evil.example/#/qr-login/" + T, "https://tadris.example.evil.example/#/qr-login/" + T, "http://tadris.example/#/qr-login/" + T,
      ORIGIN + "/#/qr-scan", ORIGIN + "/#/qr-login/short", "#/qr-login/" + T, "just text", ""]) expect(parseScannedQr(text, ORIGIN)).toBeNull();
  });
  it("the QR address is this site's origin and path with the server's fragment", () => {
    expect(qrAddress("#/qr-login/" + T, ORIGIN, "/")).toBe(ORIGIN + "/#/qr-login/" + T);
  });
});

describe("QR-2 the drawn QR code", () => {
  it("decodes back to exactly the address (jsQR round trip), with a white quiet zone", () => {
    const text = ORIGIN + "/#/owner-qr-login/" + T;
    const { size, d } = qrPathData(text);
    const scale = 4, px = size * scale;
    const data = new Uint8ClampedArray(px * px * 4).fill(255);
    for (const m of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      const x0 = Number(m[1]) * scale, y0 = Number(m[2]) * scale;
      expect(Number(m[1])).toBeGreaterThanOrEqual(4);
      for (let y = y0; y < y0 + scale; y++) for (let x = x0; x < x0 + scale; x++) { const i = (y * px + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
    }
    expect(jsQR(data, px, px)?.data).toBe(text);
  });
});

describe("QR-2 the new device's panel", () => {
  const start = { ok: true, pairingToken: T, qrPath: "#/qr-login/" + T, pollSecret: SECRET, matchCode: 47, expiresAt: new Date(Date.now() + 90_000).toISOString(), expiresInSeconds: 90, pollIntervalMs: 1000 };

  it("shows the QR and the number, polls with the pairing token AND the secret, and hands over the session once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answer("/api/qr-login/start", { status: 200, body: start });
    answer("/api/qr-login/poll", { status: 200, body: { ok: true, status: "pending" } }, { status: 200, body: { ok: true, role: "student", token: "student-session", userCode: "S1", displayName: "طالب" } });
    const signedIn = vi.fn();
    render(<QrSignInPanel ns="platform" onSignedIn={signedIn} onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: "رمز الدخول بالباركود" })).toBeTruthy();
    expect(screen.getByText("47")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await waitFor(() => expect(signedIn).toHaveBeenCalledTimes(1));
    expect(signedIn).toHaveBeenCalledWith({ role: "student", token: "student-session", displayName: "طالب" });
    const polls = calls.filter(c => c.url === "/api/qr-login/poll");
    expect(polls.length).toBe(2);
    expect(polls[0].body).toEqual({ pairingToken: T, pollSecret: SECRET });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(calls.filter(c => c.url === "/api/qr-login/poll").length).toBe(2);          // no polling after the session
  });

  it("a refusal from the phone: the message and «عرض رمز جديد» (a new pairing)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answer("/api/qr-login/start", { status: 200, body: start });
    answer("/api/qr-login/poll", { status: 410, body: { ok: false, code: "QR_DENIED", error: "رُفض." } });
    render(<QrSignInPanel ns="platform" onSignedIn={() => {}} onClose={() => {}} />);
    await screen.findByRole("img", { name: "رمز الدخول بالباركود" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect((await screen.findByRole("alert")).textContent).toContain("رُفض طلب الدخول");
    fireEvent.click(screen.getByRole("button", { name: "عرض رمز جديد" }));
    await waitFor(() => expect(calls.filter(c => c.url === "/api/qr-login/start").length).toBe(2));
  });

  it("an expired code renews itself; nothing is polled while the page is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answer("/api/qr-login/start", { status: 200, body: { ...start, expiresAt: new Date(Date.now() + 1500).toISOString() } });
    answer("/api/qr-login/poll", { status: 200, body: { ok: true, status: "pending" } });
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<QrSignInPanel ns="platform" onSignedIn={() => {}} onClose={() => {}} />);
    await screen.findByRole("img", { name: "رمز الدخول بالباركود" });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(calls.filter(c => c.url === "/api/qr-login/poll")).toEqual([]);
    expect(calls.filter(c => c.url === "/api/qr-login/start").length).toBe(1);        // hidden: not renewed either
    hidden.mockReturnValue("visible");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await waitFor(() => expect(calls.filter(c => c.url === "/api/qr-login/start").length).toBe(2));
  });

  it("the owner panel uses the owner's routes only", async () => {
    answer("/api/owner-qr-login/start", { status: 200, body: { ...start, qrPath: "#/owner-qr-login/" + T } });
    render(<QrSignInPanel ns="owner" onSignedIn={() => {}} onClose={() => {}} />);
    await screen.findByRole("img", { name: "رمز الدخول بالباركود" });
    expect(calls.map(c => c.url)).toEqual(["/api/owner-qr-login/start"]);
  });
});

describe("QR-2 the approving device", () => {
  const inspect = { ok: true, role: "teacher", device: { browser: "Chrome", os: "Windows" }, sameNetwork: true, matchOptions: [31, 47, 82], expiresAt: new Date(Date.now() + 60_000).toISOString() };

  it("without a session on this tab nothing is called", async () => {
    window.history.replaceState(null, "", "/#/qr-login/" + T);
    render(<QrApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("سجّل الدخول");
    expect(calls).toEqual([]);
  });

  it("a token in the address is removed at once; inspect → 3 numbers → approve with the picked one, this tab's session as Bearer", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-session");
    window.history.replaceState(null, "", "/#/qr-login/" + T);
    answer("/api/qr-login-approve/inspect", { status: 200, body: inspect });
    answer("/api/qr-login-approve/approve", { status: 200, body: { ok: true, status: "approved" } });
    render(<QrApp />);
    expect(window.location.href).not.toContain(T);
    expect(window.location.hash).toBe("#/qr-scan");
    expect((await screen.findByText("Chrome على Windows")).textContent).toBe("Chrome على Windows");
    expect(screen.getAllByRole("button").filter(b => /^\d+$/.test(b.textContent || "")).map(b => b.textContent)).toEqual(["31", "47", "82"]);
    fireEvent.click(screen.getByRole("button", { name: "47" }));
    expect((await screen.findByText(/تمت الموافقة/)).textContent).toContain("سيُفتح حسابك");
    expect(calls.map(c => [c.url, c.body, c.headers.Authorization])).toEqual([
      ["/api/qr-login-approve/inspect", { pairingToken: T }, "Bearer teacher-session"],
      ["/api/qr-login-approve/approve", { pairingToken: T, matchCode: 47 }, "Bearer teacher-session"]
    ]);
  });

  it("another network is flagged; «لست أنا» refuses", async () => {
    sessionStorage.setItem("examBankBuilderToken", "student-session");
    window.history.replaceState(null, "", "/#/qr-login/" + T);
    answer("/api/qr-login-approve/inspect", { status: 200, body: { ...inspect, sameNetwork: false } });
    answer("/api/qr-login-approve/deny", { status: 200, body: { ok: true, status: "denied" } });
    render(<QrApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("ليس على شبكتك");
    fireEvent.click(screen.getByRole("button", { name: "لست أنا — ارفض الطلب" }));
    await waitFor(() => expect(calls.map(c => c.url)).toContain("/api/qr-login-approve/deny"));
    expect((await screen.findByRole("alert")).textContent).toContain("رُفض طلب الدخول");
  });

  it("a scanned photo: another site's QR and the other namespace's QR are refused before any request; this site's QR is inspected", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-session");
    window.history.replaceState(null, "", "/#/qr-scan");
    answer("/api/qr-login-approve/inspect", { status: 200, body: inspect });
    render(<QrApp />);
    const photo = () => document.querySelector<HTMLInputElement>(".eb-qr-photo input")!;
    const take = async (text: string) => { scanner.text = text; fireEvent.change(photo(), { target: { files: [new File(["x"], "qr.png", { type: "image/png" })] } }); };
    await take("https://evil.example/#/qr-login/" + T);
    expect((await screen.findByRole("alert")).textContent).toContain("ليس رمز دخول");
    await take(window.location.origin + "/#/owner-qr-login/" + T);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("رمز دخول مالك المنصة"));
    expect(calls).toEqual([]);
    await take(window.location.origin + "/#/qr-login/" + T2);
    await waitFor(() => expect(calls.map(c => [c.url, c.body])).toEqual([["/api/qr-login-approve/inspect", { pairingToken: T2 }]]));
  });

  it("the owner: x-owner-token only; a required step-up is asked, then the same number is approved", async () => {
    sessionStorage.setItem("tadrisOwnerToken", "owner-session");
    sessionStorage.setItem("examBankBuilderToken", "teacher-session-must-not-be-sent");
    window.history.replaceState(null, "", "/#/owner-qr-login/" + T);
    answer("/api/owner-qr-login-approve/inspect", { status: 200, body: { ...inspect, role: "owner" } });
    answer("/api/owner-qr-login-approve/approve", { status: 403, body: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } }, { status: 200, body: { ok: true, status: "approved" } });
    answer("/api/owner-session/step-up", { status: 200, body: { ok: true } });
    render(<QrApp />);
    fireEvent.click(await screen.findByRole("button", { name: "82" }));
    const field = await screen.findByLabelText(/رمز التحقق/);
    fireEvent.change(field, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد والموافقة" }));
    expect((await screen.findByText(/تمت الموافقة/)).textContent).toContain("سيُفتح حسابك");
    expect(calls.map(c => [c.url, c.body])).toEqual([
      ["/api/owner-qr-login-approve/inspect", { pairingToken: T }],
      ["/api/owner-qr-login-approve/approve", { pairingToken: T, matchCode: 82 }],
      ["/api/owner-session/step-up", { code: "123456" }],
      ["/api/owner-qr-login-approve/approve", { pairingToken: T, matchCode: 82 }]
    ]);
    for (const c of calls) { expect(c.headers["x-owner-token"]).toBe("owner-session"); expect(c.headers.Authorization).toBeUndefined(); }
  });

  it("a closed request shows the server's reason", async () => {
    sessionStorage.setItem("examBankBuilderToken", "teacher-session");
    window.history.replaceState(null, "", "/#/qr-login/" + T);
    answer("/api/qr-login-approve/inspect", { status: 410, body: { ok: false, code: "QR_EXPIRED", error: "انتهت صلاحية الرمز. اطلب من الجهاز الآخر عرض رمز جديد." } });
    render(<QrApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("انتهت صلاحية الرمز");
  });
});

describe("QR-2 sessions and answers", () => {
  it("a teacher / student session is stored exactly like a password sign-in; an owner answer never is", () => {
    expect(storePlatformSession({ role: "teacher", token: "t-token", displayName: "معلم" })).toBe(true);
    expect([sessionStorage.getItem("examBankBuilderToken"), sessionStorage.getItem("examBankSessionRole"), sessionStorage.getItem("examBankSessionDisplayName")]).toEqual(["t-token", "teacher", "معلم"]);
    sessionStorage.clear();
    expect(storePlatformSession({ role: "owner", token: "o-token", displayName: "" })).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
  it("a poll answer of the other namespace's role is refused", async () => {
    answer("/api/qr-login/poll", { status: 200, body: { ok: true, role: "owner", token: "o-token", owner: { displayName: "مالك" } } });
    expect((await qrApi.poll("platform", T, SECRET)).ok).toBe(false);
    answer("/api/owner-qr-login/poll", { status: 200, body: { ok: true, role: "owner", token: "o-token", owner: { displayName: "مالك" } } });
    expect(await qrApi.poll("owner", T, SECRET)).toEqual({ ok: true, status: 200, data: { status: "signed-in", role: "owner", token: "o-token", displayName: "مالك" } });
  });
  it("device words read naturally, unknown parts named as unknown", () => {
    expect(deviceLabel({ browser: "Safari", os: "iOS" })).toBe("Safari على iOS");
    expect(deviceLabel({ browser: "unknown", os: "unknown" })).toBe("متصفح غير معروف على نظام غير معروف");
  });
});
