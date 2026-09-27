// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import InstallAppCard from "./InstallAppCard";
import InstallAppEntry from "./InstallAppEntry";
import {
  __resetInstallPromptForTests, DISMISSED_AT_KEY, INSTALL_DISMISS_TTL_MS, initInstallPrompt, installGuidance, isAppleMobile,
  isDismissalActive, isStandalone, manualInstallHint, wasCardDismissed
} from "./installPrompt";
import { BRAND_ICON_SRC } from "../ui/BrandMark";
import StudentShell from "../shell/StudentShell";
import StudentPortal from "../StudentPortal";

// Phase 6A — optional installation card. Browsers are simulated with a fake `win` (user agent, touch points,
// display-mode media queries) for environment detection; the install prompt is a real `beforeinstallprompt`-typed
// event dispatched on the page window, exactly as Chromium delivers it.
// Phase 10C — reliable access: the dismissal expires after 7 days (timestamp, safe against bad storage / clocks), a
// browser without a native prompt still gets manual guidance, a permanent top-bar entry exists whenever the app is
// not installed, and the card's mark is the official app icon.

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipados: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};
const DAY = 24 * 60 * 60 * 1000;

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
const card = () => screen.queryByRole("region", { name: /تثبيت التطبيق|تثبيت ExamBank/ });
const manualCard = () => screen.queryByRole("region", { name: "تثبيت ExamBank" });
const entry = () => screen.queryByRole("button", { name: "تثبيت التطبيق" });
const dismissedAt = (ms: number) => localStorage.setItem(DISMISSED_AT_KEY, String(ms));

let requestPermission: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetInstallPromptForTests();
  try { localStorage.clear(); } catch { /* ignore */ }
  initInstallPrompt(window);
  // A Notification API spy: installation must never ask for notification permission.
  requestPermission = vi.fn(async () => "default");
  (globalThis as unknown as { Notification: unknown }).Notification = Object.assign(function Notification() {}, { permission: "default", requestPermission });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Android / Chromium — install prompt", () => {
  it("no prompt yet → the quiet manual card (never nothing); beforeinstallprompt → an install button (the browser banner is suppressed)", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    render(<InstallAppCard win={win} />);
    expect(manualCard()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تثبيت التطبيق على/ })).toBeNull();
    const { event } = firePrompt();
    expect(event.defaultPrevented).toBe(true);
    const button = screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" });
    expect(button.tagName).toBe("BUTTON");
    expect(screen.getByRole("region", { name: "تثبيت التطبيق" })).toBeTruthy();
    expect(manualCard()).toBeNull();                                            // the manual guidance yields to the real prompt
    expect(screen.queryByText(/إضافة إلى الشاشة الرئيسية/)).toBeNull();          // never iOS steps on Android
  });

  it("the prompt opens ONLY on click; accepted → the card DISAPPEARS (installed = no install UI, no notice, no status)", async () => {
    const win = fakeWin({ ua: UA.samsung, touch: 5, coarse: true });
    const { container } = render(<InstallAppCard win={win} />);
    const { prompt } = firePrompt("accepted");
    expect(prompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /تثبيت/ })).toBeNull();
    expect(screen.queryByText(/قائمة المتصفح/)).toBeNull();
  });

  it("declined → the calm note AND the manual guidance (never masked); can be hidden; a later prompt works again", async () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    render(<InstallAppCard win={win} />);
    firePrompt("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(await screen.findByText(/لم يتم التثبيت/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("لم يتم التثبيت.");
    expect(screen.queryByRole("button", { name: "تثبيت التطبيق على الهاتف" })).toBeNull();
    const region = manualCard()!;                                                 // the consumed prompt falls back to the manual path
    expect(region).toBeTruthy();
    expect(within(region).getByText("يمكنك تثبيت ExamBank من قائمة المتصفح واستخدامه كتطبيق مستقل.")).toBeTruthy();
    expect(within(region).getByText("افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».")).toBeTruthy();
    expect(within(region).getAllByRole("button").map(b => b.textContent)).toEqual(["ليس الآن"]);   // one dismiss control, no extra «إخفاء»
    const again = firePrompt("accepted");                                         // Chromium may offer it again later
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    expect(again.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(card()).toBeNull());                              // accepted → gone
  });

  it("declined on desktop → desktop-worded manual guidance under the note; «ليس الآن» hides it for 7 days", async () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.desktopChrome })} />);
    firePrompt("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على هذا الجهاز" }));
    await screen.findByText(/لم يتم التثبيت/);
    expect(screen.getByText("افتح قائمة المتصفح واختر «تثبيت ExamBank» أو «تثبيت التطبيق».")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(card()).toBeNull();
    expect(localStorage.getItem(DISMISSED_AT_KEY)).toMatch(/^\d+$/);
  });

  it("appinstalled (installed from the browser menu) → the card disappears", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    const { container } = render(<InstallAppCard win={win} />);
    firePrompt();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(container.innerHTML).toBe("");
  });

  it("«ليس الآن» hides the card and is remembered on this device as a TIMESTAMP (not asked on every login)", () => {
    const win = fakeWin({ ua: UA.android, touch: 5, coarse: true });
    const first = render(<InstallAppCard win={win} />);
    firePrompt();
    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(first.container.innerHTML).toBe("");
    const stored = Number(localStorage.getItem(DISMISSED_AT_KEY));
    expect(stored).toBeGreaterThanOrEqual(before); expect(stored).toBeLessThanOrEqual(Date.now());
    expect(localStorage.getItem("examBankPwaInstallCardDismissed")).toBeNull();  // the old permanent flag is never written
    first.unmount();
    const second = render(<InstallAppCard win={win} />);
    expect(second.container.innerHTML).toBe("");
  });
});

describe("Phase 10C — the dismissal is temporary (7 days) and safe", () => {
  const win = () => fakeWin({ ua: UA.android, touch: 5, coarse: true });
  it("dismissed today → the main card is hidden (prompt or manual)", () => {
    dismissedAt(Date.now() - 60_000);
    const { container } = render(<InstallAppCard win={win()} />);
    expect(container.innerHTML).toBe("");
    firePrompt();
    expect(container.innerHTML).toBe("");
  });
  it("dismissed 6 days ago → still hidden", () => {
    dismissedAt(Date.now() - 6 * DAY);
    expect(wasCardDismissed()).toBe(true);
    expect(render(<InstallAppCard win={win()} />).container.innerHTML).toBe("");
  });
  it("dismissed 8 days ago → the card is eligible again", () => {
    dismissedAt(Date.now() - 8 * DAY);
    expect(wasCardDismissed()).toBe(false);
    render(<InstallAppCard win={win()} />);
    expect(manualCard()).toBeTruthy();
  });
  it("the boundary is exactly the TTL, evaluated against the injected clock", () => {
    const now = 1_800_000_000_000;
    expect(isDismissalActive(String(now - INSTALL_DISMISS_TTL_MS + 1), now)).toBe(true);
    expect(isDismissalActive(String(now - INSTALL_DISMISS_TTL_MS), now)).toBe(false);
    expect(INSTALL_DISMISS_TTL_MS).toBe(7 * DAY);
  });
  it.each([["garbage", "yesterday"], ["empty", ""], ["negative", "-5"], ["float", "1.5e12"], ["NaN", "NaN"], ["object", "[object Object]"], ["huge", "9".repeat(40)]])(
    "malformed stored timestamp (%s) → treated as NOT dismissed, nothing thrown", (_n, raw) => {
      localStorage.setItem(DISMISSED_AT_KEY, raw);
      expect(wasCardDismissed()).toBe(false);
      render(<InstallAppCard win={win()} />);
      expect(manualCard()).toBeTruthy();
    });
  it("clock anomalies: a timestamp far in the future (clock moved back) is not a dismissal; a small skew still is", () => {
    const now = Date.now();
    expect(isDismissalActive(String(now + 3 * DAY), now)).toBe(false);
    expect(isDismissalActive(String(now + 60 * 60 * 1000), now)).toBe(true);
    dismissedAt(now + 3 * DAY);
    render(<InstallAppCard win={win()} />);
    expect(manualCard()).toBeTruthy();
  });
  it("the Phase 6A permanent flag alone no longer hides anything (it is cleared on the next dismissal)", () => {
    localStorage.setItem("examBankPwaInstallCardDismissed", "1");
    render(<InstallAppCard win={win()} />);
    expect(manualCard()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(localStorage.getItem("examBankPwaInstallCardDismissed")).toBeNull();
    expect(localStorage.getItem(DISMISSED_AT_KEY)).toMatch(/^\d+$/);
  });
  it("storage unavailable (throws) → the card shows; dismissing does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<InstallAppCard win={win()} />);
    expect(manualCard()).toBeTruthy();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }))).not.toThrow();
  });
  it("no personal data: only the one timestamp key is written", () => {
    render(<InstallAppCard win={win()} />);
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(Object.keys(localStorage)).toEqual([DISMISSED_AT_KEY]);
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
  it("installed → no card, no prompt button, no manual guidance, no permanent entry", () => {
    const win = fakeWin({ ua: UA.desktopChrome, displayMode: "standalone" });
    const a = render(<><InstallAppCard win={win} /><InstallAppEntry win={win} /></>);
    firePrompt();
    expect(a.container.innerHTML).toBe("");
    expect(installGuidance(win, { promptAvailable: true, installedNow: false })).toEqual({ kind: "installed" });
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
    expect(localStorage.getItem(DISMISSED_AT_KEY)).toMatch(/^\d+$/);            // same 7-day memory as «ليس الآن»
  });
  it("macOS Safari (no touch) is not treated as iOS", () => {
    expect(isAppleMobile(fakeWin({ ua: UA.macSafari, touch: 0 }))).toBe(false);
  });
});

describe("Phase 10C — no native prompt, not installed → manual install guidance (never null)", () => {
  it("desktop Chromium without a prompt → the quiet «تثبيت ExamBank» card with the browser-menu path, desktop wording", () => {
    const win = fakeWin({ ua: UA.desktopChrome });
    render(<InstallAppCard win={win} />);
    const region = manualCard()!;
    expect(region).toBeTruthy();
    expect(within(region).getByText("يمكنك تثبيت ExamBank من قائمة المتصفح واستخدامه كتطبيق مستقل.")).toBeTruthy();
    expect(within(region).getByText("افتح قائمة المتصفح واختر «تثبيت ExamBank» أو «تثبيت التطبيق».")).toBeTruthy();
    expect(within(region).queryByRole("button", { name: /تثبيت التطبيق على/ })).toBeNull();
    expect(within(region).queryByRole("list")).toBeNull();                       // no iOS steps on desktop
    expect(within(region).getByRole("button", { name: "ليس الآن" })).toBeTruthy();
    expect(installGuidance(fakeWin({ ua: UA.macSafari }), { promptAvailable: false, installedNow: false })).toEqual({ kind: "manual" });
  });
  it("Android without a prompt → the same card with Android wording; wording never changes behaviour", () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    expect(screen.getByText("افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».")).toBeTruthy();
    expect(manualInstallHint(fakeWin({ ua: UA.samsung }))).toContain("إضافة إلى الشاشة الرئيسية");
    expect(manualInstallHint(fakeWin({ ua: UA.desktopChrome }))).toContain("تثبيت ExamBank");
  });
  it("desktop Chromium WITH a prompt → an install button worded for the device", () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.desktopChrome })} />);
    firePrompt();
    expect(screen.getByRole("button", { name: "تثبيت التطبيق على هذا الجهاز" })).toBeTruthy();
    expect(manualCard()).toBeNull();
  });
  it("a window without matchMedia / storage still works", () => {
    const win = { navigator: { userAgent: UA.android, maxTouchPoints: 0 } } as unknown as Window;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => render(<InstallAppCard win={win} />)).not.toThrow();
    expect(manualCard()).toBeTruthy();
  });
});

describe("Phase 10C — the official icon", () => {
  it("the card's mark is the official Phase 10B app icon (BrandMark → /pwa/icon-192.png), not an «EB» tile", () => {
    render(<InstallAppCard win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    firePrompt();
    const mark = card()!.querySelector(".eb-install-mark") as HTMLElement;
    expect(mark.textContent).toBe("");
    const img = mark.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(BRAND_ICON_SRC);
    expect(img.getAttribute("alt")).toBe(""); expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(BRAND_ICON_SRC).toBe("/pwa/icon-192.png");
  });
});

describe("Phase 10C — permanent install entry (student top bar)", () => {
  it("exists whenever the app is not installed — even while the main card is dismissed — and never opens anything by itself", () => {
    dismissedAt(Date.now() - 60_000);                                            // the card is hidden for a week…
    const win = fakeWin({ ua: UA.desktopChrome });
    render(<><InstallAppCard win={win} /><InstallAppEntry win={win} /></>);
    expect(card()).toBeNull();
    expect(entry()).toBeTruthy();                                                // …the entry is still there
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("hidden when standalone / installed; disappears on appinstalled", () => {
    const standalone = fakeWin({ ua: UA.android, touch: 5, coarse: true, displayMode: "standalone" });
    const a = render(<InstallAppEntry win={standalone} />);
    expect(a.container.innerHTML).toBe("");
    a.unmount();
    const b = render(<InstallAppEntry win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    expect(entry()).toBeTruthy();
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(b.container.innerHTML).toBe("");
  });
  it("prompt available → the click opens the NATIVE prompt (only then); accepted → the entry disappears", async () => {
    render(<InstallAppEntry win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    const { prompt } = firePrompt("accepted");
    expect(prompt).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(entry()!);
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(entry()).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("prompt declined → the guidance dialog opens so a path remains", async () => {
    render(<InstallAppEntry win={fakeWin({ ua: UA.desktopChrome })} />);
    firePrompt("dismissed");
    fireEvent.click(entry()!);
    const dialog = await screen.findByRole("dialog", { name: "تثبيت ExamBank" });
    expect(within(dialog).getByText("افتح قائمة المتصفح واختر «تثبيت ExamBank» أو «تثبيت التطبيق».")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(entry()).toBeTruthy();
  });
  it("iPhone → the click shows the Add-to-Home-Screen steps in a dialog", async () => {
    render(<InstallAppEntry win={fakeWin({ ua: UA.iphone, touch: 5, coarse: true, iosStandalone: false })} />);
    fireEvent.click(entry()!);
    const dialog = await screen.findByRole("dialog", { name: "تثبيت ExamBank" });
    expect(within(dialog).getByRole("list", { name: "خطوات الإضافة إلى الشاشة الرئيسية" })).toBeTruthy();
    expect(within(dialog).queryByText(/قائمة المتصفح/)).toBeNull();
  });
  it("Android / desktop without a prompt → the click shows the manual guidance in a dialog (device wording)", async () => {
    render(<InstallAppEntry win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    fireEvent.click(entry()!);
    const dialog = await screen.findByRole("dialog", { name: "تثبيت ExamBank" });
    expect(within(dialog).getByText("يمكنك تثبيت ExamBank من قائمة المتصفح واستخدامه كتطبيق مستقل.")).toBeTruthy();
    expect(within(dialog).getByText("افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».")).toBeTruthy();
    expect(within(dialog).queryByRole("list")).toBeNull();
  });
  it("StudentShell renders the entry in the top bar when not installed, and not at all when standalone", () => {
    const matchMedia = window.matchMedia;
    render(<StudentShell studentName="سارة" onLogout={() => {}}><p>x</p></StudentShell>);
    const bar = document.querySelector("header.student-topbar") as HTMLElement;
    const e = within(bar).getByRole("button", { name: "تثبيت التطبيق" });
    expect(e.className).toContain("student-topbar-link");
    expect(e.className).toContain("eb-student-install-entry");
    cleanup();
    window.matchMedia = ((q: string) => ({ matches: q === "(display-mode: standalone)", media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      render(<StudentShell studentName="سارة" onLogout={() => {}}><p>x</p></StudentShell>);
      expect(screen.queryByRole("button", { name: "تثبيت التطبيق" })).toBeNull();
      expect(screen.getByRole("button", { name: /تسجيل الخروج/ })).toBeTruthy();
    } finally { window.matchMedia = matchMedia; }
  });
});

describe("no notification permission — ever", () => {
  it("rendering, prompting, installing, dismissing, the manual card and the entry dialog never request notification permission", async () => {
    render(<><InstallAppCard win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} /><InstallAppEntry win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} /></>);
    fireEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    fireEvent.click(entry()!);
    await screen.findByRole("dialog");
    cleanup(); localStorage.clear();
    __resetInstallPromptForTests(); initInstallPrompt(window);
    const accepted = render(<InstallAppCard win={fakeWin({ ua: UA.android, touch: 5, coarse: true })} />);
    firePrompt("accepted");
    fireEvent.click(screen.getByRole("button", { name: "تثبيت التطبيق على الهاتف" }));
    await waitFor(() => expect(accepted.container.innerHTML).toBe(""));
    cleanup();
    __resetInstallPromptForTests(); initInstallPrompt(window);                     // a fresh page on an iPhone
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
  it("the manual card, then the prompt card, inside the signed-in portal; the top-bar entry is present; no extra API request is made", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD);
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      return res(404, { ok: false });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="سارة" onLogout={() => {}} />);
    expect(await screen.findByText(/مرحبًا سارة/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "تثبيت التطبيق" })).toBeNull();      // happy-dom: desktop, no prompt…
    expect(screen.getByRole("region", { name: "تثبيت ExamBank" })).toBeTruthy();     // …so the quiet manual card
    expect(within(document.querySelector("header.student-topbar") as HTMLElement).getByRole("button", { name: "تثبيت التطبيق" })).toBeTruthy();
    firePrompt();
    await waitFor(() => expect(screen.getByRole("region", { name: "تثبيت التطبيق" })).toBeTruthy());
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls.every(u => u.includes("/api/"))).toBe(true);
    expect(urls.some(u => /manifest|sw\.js|install/i.test(u))).toBe(false);
  });
});
