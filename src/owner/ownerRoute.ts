// Tadris+ P1-A2 — the platform owner's area lives under its own hash route, `#/owner` (sign-in / home) and `#/owner/setup`
// (one-time bootstrap). It is a separate surface: the teacher / student app is not mounted there, and the owner app is not
// mounted anywhere else. This module is tiny on purpose — it ships in the initial bundle; the owner screens do not.
// Tadris+ P4-A — the Owner Console sections: `#/owner/teachers` and `#/owner/access` (any other sub-path is not the owner's).
// Tadris+ P4-B1 — one teacher's page: `#/owner/teachers/<accountId>` (a managed id `t_` + 16 hex, or the imported `t_legacy`).
// Only `teachers` takes an id; `setup` and `access` never do. The id only chooses what to load — the server decides access.

// Tadris+ P4-C — `#/owner/schools`: the school identities (name + logo) and which teachers belong to each.

// Tadris+ P5-A2 — `#/owner/courses`: the course catalog (published / archived, owner decision D12).
export type OwnerView = "home" | "setup" | "teachers" | "access" | "schools" | "courses";
export type OwnerSection = "home" | "teachers" | "access" | "schools" | "courses";

const OWNER_HASH = /^#\/owner(?:\/(setup|access|schools|courses)|\/(teachers)(?:\/(t_[a-f0-9]{16}|t_legacy))?)?\/?$/;

export function isOwnerLocation(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  return OWNER_HASH.test(String(hash || ""));
}

export function ownerViewFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): OwnerView {
  const m = OWNER_HASH.exec(String(hash || ""));
  return m && (m[1] || m[2]) ? ((m[1] || m[2]) as OwnerView) : "home";
}

/** The teacher whose page the address opens (`#/owner/teachers/<accountId>`), or null. */
export function ownerTeacherFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): string | null {
  const m = OWNER_HASH.exec(String(hash || ""));
  return m && m[3] ? m[3] : null;
}

export const OWNER_HOME_HASH = "#/owner";
export const OWNER_SETUP_HASH = "#/owner/setup";
/** The address of a console section. */
export const ownerSectionHash = (section: OwnerSection): string => (section === "home" ? OWNER_HOME_HASH : OWNER_HOME_HASH + "/" + section);
/** The address of one teacher's page. */
export const ownerTeacherHash = (accountId: string): string => OWNER_HOME_HASH + "/teachers/" + accountId;
