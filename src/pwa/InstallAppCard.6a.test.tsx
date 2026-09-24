// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act, waitFor } from "@testing-library/react";
import InstallAppCard from "./InstallAppCard";
import { __resetInstallPromptForTests, initInstallPrompt, installGuidance, isAppleMobile, isStandalone } from "./installPrompt";
import StudentPortal from "../StudentPortal";

// Phase 6A — optional installation card. Browsers are simulated with a fake `win` (user agent, touch points,
// display-mode media queries) for environment detection; the install prompt is a real `beforeinstallprompt`-typed
// event dispatched on the page window, exactly as Chromium delivers it.

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipados: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};

function fakeWin(o: { ua: string; touch?: number; displayMode?: string; iosStandalone?: boolean; coarse?: boolean }): Window {
  return {
    navigator: { userAgent: o.ua, maxTouchPoints: o.touch ?? 0, ...(o.iosStandalone !== undefined ? { standalone: o.iosStandalone } : {}) },
    matchMedia: (q: string) => ({ matches: (o.displayMode ? q === `(display-mode: ${o.displayMode})` : false) || (q === "(pointer: coarse)" && !!o.coarse) })
  } as unknown as Window;
}

type Choice = "accepted" | "dismissed";
function firePrompt(outcome: Choice = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}

let requestPermission: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetInstallPromptForTests();
  try { localStorage.clear(); } catch { /* ignore */ }
  initInstallPrompt(window);
  // A Notification API spy: Phase 6A must never ask for notification permission.
  requestPermission = vi.fn(async () => "default");
  (globalThis as unknown as { Notification: unknown }).Notification = Object.assign(function Notification() {}, { permission: "default", requestPermission });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Android / Chromium — install prompt", () => {
  it("no prompt yet → nothing; beforeinstallprompt → an install button (the browser banner is suppressed)", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    const { container } = render(<InstallAppCard win={win} />);
    expect(container.innerHTML).toBe("");
    const { event } = firePrompt();
    expect(event.defaultPrevented).toBe(true);
    const button = screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" });
    expect(button.tagName).toBe("BUTTON");
    expect(screen.getByRole("region", { name: "تثبيت التطبيق" })).toBeTruthy();
    expect(screen.queryByText(/إضافة إلى الشاشة الرئيسية/)).toBeNull();          // never iOS steps on Android
  });

  it("the prompt opens ONLY on click; accepted → confirmation, no further install asks", async () => {
    const win = fakeWin({ ua: UA.samsung, touch: 5, coarse: true });
    render(<InstallAppCard win={win} />);
    const { prompt } = firePrompt("accepted");
    expect(prompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/تم تثبيت التطبيق/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تثبيت التطبيق/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/تم تثبيت التطبيق/);
  });

  it("dismissed → a calm note, no broken state, the card can be hidden; a later prompt works again", async () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    render(<InstallAppCard win={win} />);
    firePrompt("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(await screen.findByText(/لم يتم التثبيت/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تثبيت التطبيق على الهاتف" })).toBeNull();
    const again = firePrompt("accepted");                                         // Chromium may offer it again later
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(again.prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/تم تثبيت التطبيق/)).toBeTruthy();
  });

  it("appinstalled (installed from the browser menu) → the card disappears", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    const { container } = render(<InstallAppCard win={win} />);
    firePrompt();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(container.innerHTML).toBe("");
  });

  it("«ليس الآن» hides the card and is remembered on this device (not asked on every login)", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    const first = render(<InstallAppCard win={win} />);
    firePrompt();
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(first.container.innerHTML).toBe("");
    first.unmount();
    const second = render(<InstallAppCard win={win} />);
    expect(second.container.innerHTML).toBe("");
  });
});

describe("already installed / standalone", () => {
  it.each(["standalone", "fullscreen", "minimal-ui"])("display-mode: %s → nothing, even with a captured prompt", mode => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true, displayMode: mode });
    const { container } = render(<InstallAppCard win={win} />);
    firePrompt();
    expect(container.innerHTML).toBe("");
    expect(isStandalone(win)).toBe(true);
  });
  it("iOS home-screen web app (navigator.standalone) → no Add-to-Home-Screen steps", () => {
    const win = fakeWin({ ua: UA.iphone, touch: 5, coarse: true, iosStandalone: true });
    const { container } = render(<InstallAppCard win={win} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("iPhone / iPad Safari — Add to Home Screen guidance", () => {
  it.each([["iPhone", UA.iphone], ["iPadOS (desktop-class UA + touch)", UA.ipados]])("%s → the three steps, no install button", (_n, ua) => {
    const win = fakeWin({ ua, touch: 5, coarse: true, iosStandalone: false });
    render(<InstallAppCard win={win} />);
    const steps = screen.getByRole("list", { name: "خطوات الإضافة إلى الشاشة الرئيسية" });
    const items = Array.from(steps.querySelectorAll("li")).map(li => li.textContent);
    expect(items[0]).toMatch(/افتح قائمة المشاركة/);
    expect(items[1]).toBe("اختر «إضافة إلى الشاشة الرئيسية»");
    expect(items[2]).toBe("اضغط «إضافة»");
    expect(screen.queryByRole("button", { name: /تثبيت التطبيق/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("macOS Safari (no touch) is not treated as iOS", () => {
    expect(isAppleMobile(fakeWin({ ua: UA.macSafari, touch: 0 }))).toBe(false);
  });
});

describe("desktop / non-installable", () => {
  it("desktop without an install prompt → nothing rendered, nothing thrown", () => {
    const { container } = render(<InstallAppCard win={fakeWin({ ua: UA.desktopChrome })} />);
    expect(container.innerHTML).toBe("");
    expect(installGuidance(fakeWin({ ua: UA.macSafari }), { promptAvailable: false, installedNow: false })).toEqual({ kind: "none" });
  });
  it("desktop Chromium WITH a prompt → an install button worded for the device", () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.desktopChrome })} />);
    firePrompt();
    expect(screen.getByRole("button", { name: "تثبيت التطبيق على هذا الجهاز" })).toBeTruthy();
  });
  it("a window without matchMedia / storage still works", () => {
    const win = { navigator: { userAgent: UA.android, maxTouchPoints: 0 } } as unknown as Window;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => render(<InstallAppCard win={win} />)).not.toThrow();
  });
});

describe("no notification permission in Phase 6A", () => {
  it("rendering, prompting, installing and dismissing never request notification permission", async () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    firePrompt("accepted");
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    await screen.findByText(/تم تثبيت التطبيق/);
    cleanup();
    __resetInstallPromptForTests();                                                // a fresh page on an iPhone
    render(<InstallAppCard win={fakeWin({ ua: UA.iphone, touch: 5, coarse: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("student portal placement", () => {
  const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
  const DASHBOARD = {
    student: { userId: "u1", code: "C-1", displayName: "سارة", classId: "c1", shareAchievements: true },
    classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null }
  };
  it("a captured prompt shows the card inside the signed-in portal; no extra API request is made", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD);
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      return res(404, { ok: false });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="سارة" onLogout={() => {}} />);
    expect(await screen.findByText(/مرحبًا سارة/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "تثبيت التطبيق" })).toBeNull();      // happy-dom: desktop, no prompt
    firePrompt();
    await waitFor(() => expect(screen.getByRole("region", { name: "تثبيت التطبيق" })).toBeTruthy());
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls.every(u => u.includes("/api/"))).toBe(true);
    expect(urls.some(u => /manifest|sw\.js|install/i.test(u))).toBe(false);
  });
});
