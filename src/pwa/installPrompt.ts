// Phase 6A — optional installation of the web app (Android/Chromium install prompt, iOS/iPadOS guidance).
// Phase 10C — reliable access: the «ليس الآن» dismissal expires (7 days), and a browser that never fires
// `beforeinstallprompt` still gets a quiet manual-install path instead of nothing.
//
// The browser fires `beforeinstallprompt` early (often before any React view that could show a button exists), so
// the event is captured ONCE at startup (`initInstallPrompt`, called from main.tsx) and kept here. The browser's
// own mini-infobar is suppressed (preventDefault) so installation is offered only by the app's small, dismissible
// card / the permanent top-bar entry, and the prompt opens only after an explicit user click.
//
// Nothing here touches authentication, sessions, the API or notification permission. Environment detection is
// used ONLY to pick which install guidance / wording to show — never for application behaviour.

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/** Chromium's BeforeInstallPromptEvent (not in the TS DOM lib). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export type InstallState = {
  /** A captured install prompt is available (Chromium: Android Chrome, Samsung Internet, Edge, desktop Chrome). */
  promptAvailable: boolean;
  /** `appinstalled` fired in this page's lifetime. */
  installedNow: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { promptAvailable: false, installedNow: false };
const listeners = new Set<() => void>();
let initialisedFor: Window | null = null;

// Per-device convenience memory: only WHEN the student closed the install card (a timestamp — never credentials or
// personal data). Phase 10C: the dismissal is temporary (7 days), so «ليس الآن» can never hide installation for
// good; a missing / unreadable / malformed / future-dated value simply means «not dismissed». Storage may be
// unavailable → the card simply shows again.
export const INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A stored timestamp this far in the future is a clock anomaly (device clock moved back) → not a valid dismissal. */
const CLOCK_SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000;
export const DISMISSED_AT_KEY = "examBankPwaInstallCardDismissedAt";
/** Phase 6A's permanent boolean flag — no longer read (it could hide the card forever); removed when we next write. */
const LEGACY_DISMISSED_KEY = "examBankPwaInstallCardDismissed";

function emit(next: InstallState) {
  state = next;
  listeners.forEach(l => l());
}

export function rememberCardDismissed(now: number = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Math.floor(now)));
    localStorage.removeItem(LEGACY_DISMISSED_KEY);
  } catch { /* storage unavailable */ }
}
/** Pure: is a stored dismissal timestamp still in force at `now`? Anything not a plain positive integer, or dated more
 *  than a day in the future, is treated as «not dismissed» (never as «hidden»). */
export function isDismissalActive(raw: string | null | undefined, now: number = Date.now()): boolean {
  if (raw === null || raw === undefined) return false;
  const text = String(raw).trim();
  if (!/^\d{1,16}$/.test(text)) return false;
  const at = Number(text);
  if (!Number.isFinite(at) || at <= 0) return false;
  const age = now - at;
  if (age < -CLOCK_SKEW_TOLERANCE_MS) return false;
  return age < INSTALL_DISMISS_TTL_MS;
}
export function wasCardDismissed(now: number = Date.now()): boolean {
  try { return isDismissalActive(localStorage.getItem(DISMISSED_AT_KEY), now); } catch { return false; }
}

/** Capture the install prompt for this window. Idempotent per window. */
export function initInstallPrompt(win: Window = window): void {
  if (initialisedFor === win) return;
  initialisedFor = win;
  win.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();                       // no automatic browser banner; the app offers it on user action
    deferred = event as BeforeInstallPromptEvent;
    emit({ ...state, promptAvailable: true });
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
    emit({ promptAvailable: false, installedNow: true });
  });
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getInstallState(): InstallState { return state; }

/** Open the captured browser install prompt. Must be called from a user gesture (a button click). */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;                               // a prompt can be shown only once per captured event
  emit({ ...state, promptAvailable: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      emit({ promptAvailable: false, installedNow: true });
      return "accepted";
    }
    return "dismissed";
  } catch {
    return "dismissed";
  }
}

/** Running as the installed app (Android/desktop display-mode, or iOS home-screen web app). */
export function isStandalone(win: Window = window): boolean {
  try {
    if (typeof win.matchMedia === "function") {
      for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
        if (win.matchMedia(`(display-mode: ${mode})`).matches) return true;
      }
    }
  } catch { /* matchMedia unavailable */ }
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iPhone / iPad (including iPadOS, which reports a desktop "Macintosh" user agent but has touch). iOS exposes no
 * install API, so this is the one place where the platform — not a capability — decides which guidance to show.
 */
export function isAppleMobile(win: Window = window): boolean {
  const nav = win.navigator;
  const ua = nav.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

/** Android — used ONLY to word the manual-install hint (menu item names differ from desktop). */
export function isAndroid(win: Window = window): boolean {
  return /Android/i.test(win.navigator.userAgent || "");
}

/** A touch-first (phone/tablet) device — used only to word the install button. */
export function isTouchFirst(win: Window = window): boolean {
  try { return typeof win.matchMedia === "function" && win.matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

export type InstallGuidance =
  | { kind: "installed" }          // standalone, or installed in this page's lifetime → never ask again
  | { kind: "prompt" }             // Chromium install prompt captured → install button (native prompt on click)
  | { kind: "ios" }                // iPhone/iPad → Share → Add to Home Screen steps
  | { kind: "manual" };            // not installed, no native prompt right now → quiet browser-menu guidance

export function installGuidance(win: Window, s: InstallState): InstallGuidance {
  if (s.installedNow || isStandalone(win)) return { kind: "installed" };
  if (s.promptAvailable) return { kind: "prompt" };
  if (isAppleMobile(win)) return { kind: "ios" };
  return { kind: "manual" };
}

/** The one sentence that always applies when the native prompt is not available. */
export const MANUAL_INSTALL_MESSAGE = "يمكنك تثبيت ExamBank من قائمة المتصفح واستخدامه كتطبيق مستقل.";
/** The device-specific menu hint (wording only — behaviour never depends on it). */
export function manualInstallHint(win: Window): string {
  return isAndroid(win)
    ? "افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
    : "افتح قائمة المتصفح واختر «تثبيت ExamBank» أو «تثبيت التطبيق».";
}

/** Test-only: forget the captured prompt and listeners' state. */
export function __resetInstallPromptForTests() {
  deferred = null;
  state = { promptAvailable: false, installedNow: false };
  initialisedFor = null;
}
