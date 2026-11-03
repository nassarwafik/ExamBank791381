// @vitest-environment happy-dom
// Tadris+ P4-D — the handoff page (#/handoff/<ticket>, owner decision D19) against a mocked API (test data only):
//   the ticket is read once and removed from the address bar; any owner token in this tab is removed; a successful redeem stores
//   an ordinary teacher session exactly like a teacher sign-in (never the ticket) and opens the teacher app; a refused ticket is
//   one clear message with the way back; without a ticket nothing is called.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import HandoffApp from "./HandoffApp";
import { isHandoffLocation, handoffTokenFromHash } from "./handoffRoute";

type Call = { url: string; body: Record<string, string> };
let calls: Call[] = [];
let answer: { status: number; body: unknown } = { status: 404, body: {} };
const TICKET = "Hnd_off-0123456789abcdefghijklmnopqrstuvwxy";
let replaced: string[] = [];

beforeEach(() => {
  calls = []; replaced = [];
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState(null, "", "/#/handoff/" + TICKET);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as unknown as Response;
  }));
  vi.spyOn(window.location, "replace").mockImplementation((u: string | URL) => { replaced.push(String(u)); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("P4-D handoff route", () => {
  it("recognises #/handoff and #/handoff/<43-char ticket> only", () => {
    expect(TICKET).toHaveLength(43);
    expect([isHandoffLocation("#/handoff/" + TICKET), isHandoffLocation("#/handoff"), handoffTokenFromHash("#/handoff/" + TICKET)]).toEqual([true, true, TICKET]);
    for (const h of ["", "#/owner", "#/handoff/short", "#/handoff/" + TICKET + "x", "#/handoffX", "#/invite/" + TICKET]) expect(isHandoffLocation(h)).toBe(false);
  });
});

describe("P4-D the handoff page", () => {
  it("redeems the ticket once, stores an ordinary teacher session (never the ticket), removes any owner token, opens the app", async () => {
    sessionStorage.setItem("tadrisOwnerToken", "owner-token-that-must-not-stay");
    answer = { status: 200, body: { ok: true, role: "teacher", token: "teacher-session-token", userCode: "w.nassar", displayName: "وفيق", expiresInSeconds: 43200 } };
    render(<HandoffApp />);
    await waitFor(() => expect(replaced).toEqual(["/"]));
    expect(calls).toEqual([{ url: "/api/owner-handoff/redeem", body: { token: TICKET } }]);
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("teacher-session-token");
    expect(sessionStorage.getItem("examBankSessionRole")).toBe("teacher");
    expect(sessionStorage.getItem("examBankSessionDisplayName")).toBe("وفيق");
    expect(sessionStorage.getItem("tadrisOwnerToken")).toBeNull();
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TICKET);
    expect(window.history.state).toBeNull();
    expect(document.location.href).not.toContain(TICKET);
  });

  it("a refused ticket: the server's message and the way back; nothing stored", async () => {
    answer = { status: 401, body: { ok: false, code: "HANDOFF_USED", error: "رابط الانتقال غير صالح أو انتهت صلاحيته." } };
    render(<HandoffApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("رابط الانتقال غير صالح");
    expect(screen.getByRole("link", { name: "العودة إلى لوحة المالك" }).getAttribute("href")).toBe("/#/owner");
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
    expect(replaced).toEqual([]);
  });

  it("an answer that is not a teacher session is refused (nothing stored)", async () => {
    answer = { status: 200, body: { ok: true, role: "student", token: "x" } };
    render(<HandoffApp />);
    await screen.findByRole("alert");
    expect(sessionStorage.getItem("examBankBuilderToken")).toBeNull();
  });

  it("without a ticket (e.g. after a reload) the page explains what to do and calls nothing", async () => {
    window.history.replaceState(null, "", "/#/handoff");
    render(<HandoffApp />);
    expect((await screen.findByRole("alert")).textContent).toContain("رابط الانتقال غير مكتمل");
    expect(calls).toEqual([]);
  });
});
