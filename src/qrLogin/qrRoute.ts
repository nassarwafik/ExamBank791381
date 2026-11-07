// Tadris+ QR-2 — the QR sign-in's own surface (design docs/enterprise-qr-login-qr1.md §6, QR-2): the SIGNED-IN device scans and
// approves here. Four addresses, two namespaces (the server keeps them apart, QR-1):
//   #/qr-scan                    a teacher's or a student's device opens the scanner
//   #/owner-qr-scan              the owner's device opens the scanner
//   #/qr-login/<token>           the address a teacher / student QR holds (the scanner reads it; opened directly it goes to the
//   #/owner-qr-login/<token>     same confirmation)
// The token is 32 random bytes (base64url, 43 characters) in the URL FRAGMENT, which browsers never send to a server. Tiny on
// purpose: this module ships in the initial bundle; the scanner page does not.

export type QrNamespace = "platform" | "owner";
export type QrRoute = { ns: QrNamespace; token: string };

const SCAN_HASH = /^#\/(owner-)?qr-scan\/?$/;
const LINK_HASH = /^#\/(owner-)?qr-login\/([A-Za-z0-9_-]{43})\/?$/;
const current = () => (typeof window === "undefined" ? "" : window.location.hash);

export const QR_SCAN_HASH = "#/qr-scan";
export const OWNER_QR_SCAN_HASH = "#/owner-qr-scan";

export function isQrLocation(hash: string = current()): boolean {
  const h = String(hash || "");
  return SCAN_HASH.test(h) || LINK_HASH.test(h);
}

/** The namespace of the address, and the pairing token when the address holds one (otherwise ""). Null when not a QR address. */
export function qrRouteFromHash(hash: string = current()): QrRoute | null {
  const h = String(hash || "");
  const scan = SCAN_HASH.exec(h);
  if (scan) return { ns: scan[1] ? "owner" : "platform", token: "" };
  const link = LINK_HASH.exec(h);
  if (link) return { ns: link[1] ? "owner" : "platform", token: link[2] };
  return null;
}

/**
 * The pairing a scanned QR names, ONLY when it is an address of THIS site (same origin) with a QR sign-in fragment. Anything else
 * (another site's QR, a look-alike host, plain text) is refused, so the scanner never approves a request it did not recognise.
 */
export function parseScannedQr(text: string, origin: string = typeof window === "undefined" ? "" : window.location.origin): QrRoute | null {
  let url: URL;
  try { url = new URL(String(text || "").trim()); } catch { return null; }
  if (!origin || url.origin !== origin) return null;
  const route = qrRouteFromHash(url.hash);
  return route && route.token ? route : null;
}

/** The full address a new device's QR shows, for `qrPath` as the server answered it ("#/qr-login/<token>"). */
export function qrAddress(qrPath: string, origin: string = window.location.origin, pathname: string = window.location.pathname): string {
  return origin + pathname + qrPath;
}
