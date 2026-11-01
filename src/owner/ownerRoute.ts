// Tadris+ P1-A2 — the platform owner's area lives under its own hash route, `#/owner` (sign-in / home) and `#/owner/setup`
// (one-time bootstrap). It is a separate surface: the teacher / student app is not mounted there, and the owner app is not
// mounted anywhere else. This module is tiny on purpose — it ships in the initial bundle; the owner screens do not.

export type OwnerView = "home" | "setup";

const OWNER_HASH = /^#\/owner(?:\/(setup))?\/?$/;

export function isOwnerLocation(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  return OWNER_HASH.test(String(hash || ""));
}

export function ownerViewFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): OwnerView {
  const m = OWNER_HASH.exec(String(hash || ""));
  return m && m[1] === "setup" ? "setup" : "home";
}

export const OWNER_HOME_HASH = "#/owner";
export const OWNER_SETUP_HASH = "#/owner/setup";
