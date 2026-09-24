// Phase 6A — optional installation of the web app (Android/Chromium install prompt, iOS/iPadOS guidance).
//
// The browser fires `beforeinstallprompt` early (often before any React view that could show a button exists), so
// the event is captured ONCE at startup (`initInstallPrompt`, called from main.tsx) and kept here. The browser's
// own mini-infobar is suppressed (preventDefault) so installation is offered only by the app's small, dismissible
// card and the prompt opens only after an explicit user click.
//
// Nothing here touches authentication, sessions, the API or notification permission. Environment detection is
// used ONLY to pick which install guidance to show — never for application behaviour.

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

// Per-device convenience memory: only «the student closed the install card» (never credentials or personal data).
// Storage may be unavailable → the card simply shows again.
const DISMISSED_KEY = "examBankPwaInstallCardDismissed";

function emit(next: InstallState) {
  state = next;
  listeners.forEach(l => l());
}

function remember(key: string) {
  try { localStorage.setItem(key, "1"); } catch { /* storage unavailable */ }
}
function recalled(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

export function rememberCardDismissed() { remember(DISMISSED_KEY); }
export function wasCardDismissed() { return recalled(DISMISSED_KEY); }

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

/** A touch-first (phone/tablet) device — used only to word the install button. */
export function isTouchFirst(win: Window = window): boolean {
  try { return typeof win.matchMedia === "function" && win.matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

export type InstallGuidance =
  | { kind: "installed" }          // standalone, or installed in this page's lifetime → never ask again
  | { kind: "prompt" }             // Chromium install prompt captured → install button
  | { kind: "ios" }                // iPhone/iPad → Share → Add to Home Screen steps
  | { kind: "none" };              // desktop / non-installable / unknown → show nothing

export function installGuidance(win: Window, s: InstallState): InstallGuidance {
  if (s.installedNow || isStandalone(win)) return { kind: "installed" };
  if (s.promptAvailable) return { kind: "prompt" };
  if (isAppleMobile(win)) return { kind: "ios" };
  return { kind: "none" };
}

/** Test-only: forget the captured prompt and listeners' state. */
export function __resetInstallPromptForTests() {
  deferred = null;
  state = { promptAvailable: false, installedNow: false };
  initialisedFor = null;
}
