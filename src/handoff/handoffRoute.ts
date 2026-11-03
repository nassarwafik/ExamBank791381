// Tadris+ P4-D — the owner → own-teacher-workspace handoff page (owner decision D19): `#/handoff/<ticket>`. The ticket is 32 random
// bytes (base64url, 43 characters), one-time, valid 60 seconds, issued by the Owner Console; it sits in the URL FRAGMENT, which
// browsers never send to a server, and the page removes it from the address bar at once. Tiny on purpose: this module ships in
// the initial bundle, the handoff page does not.
const HANDOFF_HASH = /^#\/handoff(?:\/([A-Za-z0-9_-]{43}))?\/?$/;

export function isHandoffLocation(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  return HANDOFF_HASH.test(String(hash || ""));
}

/** The ticket in the hash, or "" (also after the page has removed it). */
export function handoffTokenFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): string {
  const m = HANDOFF_HASH.exec(String(hash || ""));
  return m && m[1] ? m[1] : "";
}

export const HANDOFF_BARE_HASH = "#/handoff";
