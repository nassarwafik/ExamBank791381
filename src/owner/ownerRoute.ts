// Tadris+ P1-A2 — the platform owner's area lives under its own hash route, `#/owner` (sign-in / home) and `#/owner/setup`
// (one-time bootstrap). It is a separate surface: the teacher / student app is not mounted there, and the owner app is not
// mounted anywhere else. This module is tiny on purpose — it ships in the initial bundle; the owner screens do not.
// Tadris+ P4-A — the Owner Console sections: `#/owner/teachers` and `#/owner/access` (any other sub-path is not the owner's).

export type OwnerView = "home" | "setup" | "teachers" | "access";
export type OwnerSection = "home" | "teachers" | "access";

const OWNER_HASH = /^#\/owner(?:\/(setup|teachers|access))?\/?$/;

export function isOwnerLocation(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  return OWNER_HASH.test(String(hash || ""));
}

export function ownerViewFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): OwnerView {
  const m = OWNER_HASH.exec(String(hash || ""));
  return m && m[1] ? (m[1] as OwnerView) : "home";
}

export const OWNER_HOME_HASH = "#/owner";
export const OWNER_SETUP_HASH = "#/owner/setup";
/** The address of a console section. */
export const ownerSectionHash = (section: OwnerSection): string => (section === "home" ? OWNER_HOME_HASH : OWNER_HOME_HASH + "/" + section);
