import type { QrSignedIn } from "./QrSignInPanel";

// Tadris+ QR-2 — what a sign-in page does with the session a QR sign-in gave it.

/** A teacher / student session from a QR sign-in, stored exactly as the password sign-in stores it; the app's boot check then
 *  validates it with the server (platform-session) before anything role-specific runs. */
export function storePlatformSession(s: QrSignedIn): boolean {
  if (s.role !== "teacher" && s.role !== "student") return false;
  try {
    sessionStorage.setItem("examBankBuilderToken", s.token);
    sessionStorage.setItem("examBankSessionRole", s.role);
    sessionStorage.setItem("examBankSessionDisplayName", s.displayName || "");
    return true;
  } catch { return false; }
}

/** The teacher / student sign-in page's handler: store the session, then reload so the app's boot check validates it. */
export function signInPlatformAndReload(s: QrSignedIn): void {
  if (storePlatformSession(s)) window.location.reload();
}
