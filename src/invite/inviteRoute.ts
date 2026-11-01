// Tadris+ P2-A2b — a teacher's invitation / password-reset page lives under its own hash route: `#/invite/<token>`. The token is
// 32 random bytes (base64url, 43 characters) issued once by the owner (P2-A2a). It sits in the URL FRAGMENT, which browsers never
// send to a server; the page reads it once and immediately removes it from the address bar and history. Tiny on purpose: this
// module ships in the initial bundle, the invitation page does not.

const INVITE_HASH = /^#\/invite(?:\/([A-Za-z0-9_-]{43}))?\/?$/;

export function isInviteLocation(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  return INVITE_HASH.test(String(hash || ""));
}

/** The invitation token in the hash, or "" (also after the page has removed it). */
export function inviteTokenFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): string {
  const m = INVITE_HASH.exec(String(hash || ""));
  return m && m[1] ? m[1] : "";
}

export const INVITE_BARE_HASH = "#/invite";
