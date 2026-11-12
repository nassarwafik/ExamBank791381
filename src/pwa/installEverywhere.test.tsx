// @vitest-environment happy-dom
//
// PWA-INSTALL-ALL — «تثبيت التطبيق» for every account type (owner request: «طبعا للجميع»).
// Before this change only the student portal offered installation, while the app suppresses the browser's own install banner
// on every page (installPrompt.ts, Phase 6A): a teacher or the owner had no install control anywhere. Now the same entry
// (`useInstallEntryState`: the captured browser prompt first, else the guidance dialog; nothing once installed) is offered in
//   • the teacher's sidebar, in the account group above «تسجيل الخروج» (the «المزيد» menu on a phone);
//   • the owner's account menu, above «تسجيل الخروج»;
//   • the two sign-in pages (teacher / student, and owner), under «الدخول بالباركود».
// These surfaces load at startup (or, for the owner, with the console), so the guidance dialog is a lazy chunk fetched on the
// first open: every dialog assertion waits for it.
// This file imports only modules that exist on the baseline, so it also runs there (fail-first: 871eca17).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import TeacherAppShell from "../shell/TeacherAppShell";
import OwnerAccountMenu from "../owner/OwnerAccountMenu";
import OwnerApp from "../owner/OwnerApp";
import { __resetInstallPromptForTests, initInstallPrompt } from "./installPrompt";
import type { TeacherNavState } from "../shell/teacherNav";
import type { OwnerSessionView } from "../owner/ownerApi";

const INSTALL = "تثبيت التطبيق";
const SLOW = { timeout: 8000 };
let standalone = false;

function firePrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}
const guidance = () => screen.queryAllByRole("dialog").find(d => (d.textContent || "").includes("التثبيت اختياري"));
const guidanceShown = () => waitFor(() => expect(guidance()).toBeTruthy(), SLOW);
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

beforeEach(() => {
  standalone = false;
  __resetInstallPromptForTests();
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  window.history.replaceState(null, "", "/");
  window.matchMedia = ((q: string) => ({ matches: standalone && q === "(display-mode: standalone)", media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  initInstallPrompt(window);
  globalThis.fetch = vi.fn(async () => res(404, { ok: false })) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------- teacher ----------
const nav: TeacherNavState = { teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] };
function mountTeacher() {
  const onLogout = vi.fn();
  render(<TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={() => {}} onLogout={onLogout}><p>محتوى</p></TeacherAppShell>);
  return { onLogout };
}
const sidebar = () => document.getElementById("eb-sidebar") as HTMLElement;
const account = () => within(sidebar()).getByRole("group", { name: "الحساب" });

describe("PWA-INSTALL-ALL — the teacher's sidebar", () => {
  it("the account group offers «تثبيت التطبيق» above «تسجيل الخروج», which stays the sidebar's last control", () => {
    mountTeacher();
    const labels = within(account()).getAllByRole("button").map(b => (b.textContent || "").trim());
    expect(labels).toEqual([INSTALL, "تسجيل الخروج"]);
    const all = within(sidebar()).getAllByRole("button");
    expect((all[all.length - 1].textContent || "").trim()).toBe("تسجيل الخروج");
    // an ordinary sidebar row: the compact rail hides its label and keeps the tooltip
    const entry = within(account()).getByRole("button", { name: INSTALL });
    expect(entry.className).toContain("eb-nav-link");
    expect(entry.getAttribute("title")).toBe(INSTALL);
    expect(entry.querySelector(".eb-nav-label")?.textContent).toBe(INSTALL);
  });

  it("no browser prompt → the click opens the guidance dialog (nothing opens by itself) and never signs out", async () => {
    const { onLogout } = mountTeacher();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(account()).getByRole("button", { name: INSTALL }));
    await guidanceShown();
    expect(guidance()!.textContent).toContain("قائمة المتصفح");
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("a captured browser prompt opens ONLY on the click; accepted → the entry disappears", async () => {
    mountTeacher();
    const { event, prompt } = firePrompt("accepted");
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    fireEvent.click(within(account()).getByRole("button", { name: INSTALL }));
    await waitFor(() => expect(within(account()).queryByRole("button", { name: INSTALL })).toBeNull());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a declined browser prompt leaves the manual path: the guidance dialog opens", async () => {
    mountTeacher();
    const { prompt } = firePrompt("dismissed");
    fireEvent.click(within(account()).getByRole("button", { name: INSTALL }));
    await guidanceShown();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(within(account()).getByRole("button", { name: INSTALL })).toBeTruthy();
  });

  it("on a phone the entry is in the menu; choosing it closes the menu and the guidance dialog stays", async () => {
    mountTeacher();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    expect(sidebar().getAttribute("role")).toBe("dialog");
    fireEvent.click(within(sidebar()).getByRole("button", { name: INSTALL }));
    expect(sidebar().getAttribute("role")).toBeNull();                      // the menu closed
    await guidanceShown();
  });

  it("installed (standalone) → no install entry; the account group is «تسجيل الخروج» alone, as before", () => {
    standalone = true;
    mountTeacher();
    expect(within(account()).getAllByRole("button").map(b => (b.textContent || "").trim())).toEqual(["تسجيل الخروج"]);
    expect(screen.queryByRole("button", { name: INSTALL })).toBeNull();
  });
});

// ---------- owner ----------
const VIEW = { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null } } as unknown as OwnerSessionView;
function openOwnerMenu() {
  fireEvent.click(screen.getByRole("button", { name: "حساب مالك المنصة" }));
  return screen.getByRole("group", { name: "حساب مالك المنصة" });
}

describe("PWA-INSTALL-ALL — the owner's account menu", () => {
  it("offers «تثبيت التطبيق» above «تسجيل الخروج» (still last, still the warning action)", () => {
    render(<OwnerAccountMenu token="owner-token" view={VIEW} onAccount={() => {}} onSignedOut={() => {}} />);
    const items = within(openOwnerMenu()).getAllByRole("button").map(b => (b.textContent || "").trim());
    expect(items).toEqual(["حسابك وأمانه", "ربط جهاز آخر بالباركود", INSTALL, "تسجيل الخروج"]);
  });

  it("the click opens the guidance dialog, which stays after the menu closed; no request is sent and nobody is signed out", async () => {
    const onSignedOut = vi.fn();
    render(<OwnerAccountMenu token="owner-token" view={VIEW} onAccount={() => {}} onSignedOut={onSignedOut} />);
    fireEvent.click(within(openOwnerMenu()).getByRole("button", { name: INSTALL }));
    expect(screen.queryByRole("group", { name: "حساب مالك المنصة" })).toBeNull();
    await guidanceShown();
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("installed (standalone) → the menu is as before", () => {
    standalone = true;
    render(<OwnerAccountMenu token="owner-token" view={VIEW} onAccount={() => {}} onSignedOut={() => {}} />);
    expect(within(openOwnerMenu()).getAllByRole("button").map(b => (b.textContent || "").trim())).toEqual(["حسابك وأمانه", "ربط جهاز آخر بالباركود", "تسجيل الخروج"]);
  });
});

// ---------- sign-in pages ----------
async function mountSignIn() {
  vi.resetModules();
  const { default: App } = await import("../App");
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /الدخول بالباركود/ })).toBeTruthy(), SLOW);
}
async function mountOwnerSignIn() {
  window.location.hash = "#/owner";
  globalThis.fetch = vi.fn(async (url: string) => (String(url) === "/api/owner-bootstrap" ? res(200, { ok: true, state: "unavailable" }) : res(404, { ok: false }))) as unknown as typeof fetch;
  render(<OwnerApp />);
  await screen.findByRole("heading", { name: "دخول مالك المنصة" });
}
const requests = () => (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;

describe("PWA-INSTALL-ALL — the sign-in pages", () => {
  it("teacher / student page: «تثبيت التطبيق» under «الدخول بالباركود»; the click opens the guidance dialog and sends nothing", async () => {
    await mountSignIn();
    const qr = screen.getByRole("button", { name: /الدخول بالباركود/ });
    const entry = screen.getByRole("button", { name: INSTALL });
    expect(entry.className).toBe("eb-install-signin");
    expect(qr.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entry.closest("form")).toBeNull();                               // never part of the sign-in form
    expect(entry.getAttribute("type")).toBe("button");
    const before = requests();
    fireEvent.click(entry);
    await guidanceShown();
    expect(requests()).toBe(before);
  }, 20000);

  it("teacher / student page, installed (standalone) → no install entry", async () => {
    standalone = true;
    await mountSignIn();
    expect(screen.queryByRole("button", { name: INSTALL })).toBeNull();
  }, 20000);

  it("owner page: the same entry under «الدخول بالباركود»; the click opens the guidance dialog and sends nothing", async () => {
    await mountOwnerSignIn();
    const qr = screen.getByRole("button", { name: /الدخول بالباركود/ });
    const entry = screen.getByRole("button", { name: INSTALL });
    expect(entry.className).toBe("eb-install-signin");
    expect(qr.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entry.closest("form")).toBeNull();
    const before = requests();
    fireEvent.click(entry);
    await guidanceShown();
    expect(requests()).toBe(before);
  });

  it("owner page, installed (standalone) → no install entry", async () => {
    standalone = true;
    await mountOwnerSignIn();
    expect(screen.queryByRole("button", { name: INSTALL })).toBeNull();
  });
});
