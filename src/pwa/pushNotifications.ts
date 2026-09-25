// Phase 6B — opt-in Web Push for new teacher messages (student side).
//
// Nothing here runs a permission prompt by itself: `enableMessagePush` is called ONLY from the student's click on
// «تفعيل الإشعارات», and it asks for permission first (inside that user gesture). On load the page may only READ the
// current state and, when permission was already granted, re-register this browser's existing subscription with the
// server (idempotent — the server keeps one entry per endpoint). The subscription is tied to the student by the
// server session, never by an id sent from here.

export type PushConfig = { available: boolean; publicKey: string };

export interface PushClient {
  /** A non-reversible fingerprint of the signed-in session (never the token itself); scopes the per-tab dedupe. */
  readonly sessionKey?: string;
  getConfig(): Promise<PushConfig>;
  subscribe(subscription: PushSubscriptionJSON): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
}

export class PushHttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = "") { super(message); this.status = status; this.code = code; }
}

/** FNV-1a (32-bit) of the token: enough to tell sessions apart in memory, and the token itself is not kept. */
export function sessionFingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + ":" + token.length.toString(36);
}

export function createPushClient(token: string): PushClient {
  const headers = { "x-student-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const post = async (body: unknown) => {
    const r = await fetch("/api/student-push", { method: "POST", headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; code?: string };
    if (!r.ok || !j.ok) throw new PushHttpError(j.error || "تعذر حفظ إعداد الإشعارات.", r.status, j.code || "");
  };
  return {
    sessionKey: sessionFingerprint(token),
    async getConfig() {
      const r = await fetch("/api/student-push", { headers });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; available?: boolean; publicKey?: string };
      if (!r.ok || !j.ok) throw new PushHttpError("تعذر التحقق من الإشعارات.", r.status);
      return { available: j.available === true && typeof j.publicKey === "string" && !!j.publicKey, publicKey: String(j.publicKey || "") };
    },
    subscribe: subscription => post({ action: "subscribe", subscription }),
    unsubscribe: endpoint => post({ action: "unsubscribe", endpoint })
  };
}

/** Feature detection only (no user-agent sniffing): service worker + Push API + Notifications. */
export function isPushSupported(win: Window = window): boolean {
  try {
    return "serviceWorker" in win.navigator && !!win.navigator.serviceWorker && "PushManager" in win && "Notification" in win;
  } catch { return false; }
}

export type PermissionState = "default" | "granted" | "denied";
export function notificationPermission(win: Window = window): PermissionState {
  try {
    const p = (win as Window & { Notification?: { permission?: string } }).Notification?.permission;
    return p === "granted" || p === "denied" ? p : "default";
  } catch { return "default"; }
}

/** VAPID public key (base64url) → the byte array PushManager.subscribe expects. */
export function applicationServerKey(publicKey: string): Uint8Array {
  const padded = publicKey + "=".repeat((4 - (publicKey.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** base64url (padding optional) → bytes, or null when it is not valid base64url. */
export function decodeBase64Url(value: string): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return null;
  try { return applicationServerKey(value.replace(/=+$/, "")); } catch { return null; }
}

/** The raw bytes of a PushSubscriptionOptions.applicationServerKey: an ArrayBuffer per spec; typed-array/DataView
 *  views are tolerated. Checked by tag (not instanceof) so a buffer from another realm is still recognised. */
function keyBytes(value: unknown): Uint8Array | null {
  if (!value || typeof value !== "object") return null;
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return new Uint8Array(value as ArrayBuffer);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

/** Byte-for-byte comparison of a subscription's applicationServerKey with the server's base64url VAPID public key. */
export function sameApplicationServerKey(subscriptionKey: unknown, serverPublicKey: string): boolean {
  const a = keyBytes(subscriptionKey);
  const b = decodeBase64Url(serverPublicKey);
  if (!a || !b || a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Does this browser subscription belong to the server's CURRENT VAPID key?
 *  - "match": created with the current key → it can receive pushes.
 *  - "mismatch": created with another key (the server key was rotated) or without one → the push service rejects every
 *    push signed with the current key (401/403), so it must be replaced.
 *  - "unknown": the browser does not expose PushSubscription.options at all → cannot be verified (kept as before).
 */
export type SubscriptionKeyState = "match" | "mismatch" | "unknown";
export function subscriptionKeyState(sub: PushSubscription, serverPublicKey: string): SubscriptionKeyState {
  const options = (sub as unknown as { options?: { applicationServerKey?: unknown } | null }).options;
  if (!options) return "unknown";
  return sameApplicationServerKey(options.applicationServerKey, serverPublicKey) ? "match" : "mismatch";
}

/** The already-registered service worker (never waits for one to install). */
async function currentRegistration(win: Window): Promise<ServiceWorkerRegistration | null> {
  try { return (await win.navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
}
/** Wait (bounded) for the active service worker — it is registered after page load in production builds. */
async function readyRegistration(win: Window, ms = 8000): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      win.navigator.serviceWorker.ready,
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })
    ]);
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

// One re-registration per (signed-in session, endpoint) per page lifetime: React StrictMode / remounts do not POST
// again, but a DIFFERENT student signing in on the same tab (logout does not reload the page) registers the device
// for themself. Keyed by a session fingerprint — the token is never stored here.
const synced = new Set<string>();
const syncKey = (client: PushClient, endpoint: string) => (client.sessionKey || "") + "|" + endpoint;
export function __resetPushSyncForTests() { synced.clear(); }

/** Result of the page-load check: healthy and registered, nothing to do, or a subscription that needs repair. */
export type ExistingPushState = "enabled" | "none" | "repair";

/**
 * On load, WITHOUT prompting: if permission is already granted and this browser already has a subscription made with
 * the server's CURRENT VAPID key, make sure the server has it ("enabled"). A subscription made with another key (the
 * server key was rotated) is NOT registered — it can never receive a push — and is reported as "repair" so the page can
 * offer «إعادة تفعيل الإشعارات». Nothing here asks for permission or replaces a subscription.
 */
export async function syncExistingPush(client: PushClient, config: PushConfig, win: Window = window): Promise<ExistingPushState> {
  if (!config.available || !isPushSupported(win) || notificationPermission(win) !== "granted") return "none";
  const reg = await currentRegistration(win);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return "none";
  const json = sub.toJSON();
  if (!json.endpoint) return "none";
  if (subscriptionKeyState(sub, config.publicKey) === "mismatch") return "repair";
  const key = syncKey(client, json.endpoint);
  if (!synced.has(key)) {
    await client.subscribe(json);
    synced.add(key);
  }
  return "enabled";
}

export type EnableResult = "enabled" | "default" | "denied" | "unsupported" | "unavailable" | "error";

/**
 * The student clicked «تفعيل الإشعارات» or «إعادة تفعيل الإشعارات». Permission is requested FIRST (still inside the click)
 * and only when it is not already granted; then this browser is subscribed with the server's CURRENT VAPID key and the
 * subscription is stored for the signed-in student. A subscription made with another key is removed and replaced;
 * "enabled" is returned only when a subscription with the current key has been registered with the server.
 */
export async function enableMessagePush(client: PushClient, config: PushConfig, win: Window = window): Promise<EnableResult> {
  if (!isPushSupported(win)) return "unsupported";
  if (!config.available) return "unavailable";
  let permission = notificationPermission(win);
  if (permission === "denied") return "denied";
  if (permission !== "granted") {
    try { permission = (await (win as Window & typeof globalThis).Notification.requestPermission()) as PermissionState; }
    catch { return "error"; }
    if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  }
  try {
    const reg = await readyRegistration(win);
    if (!reg) return "unsupported";                                  // no service worker (e.g. not a production build)
    const key = applicationServerKey(config.publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && subscriptionKeyState(sub, config.publicKey) === "mismatch") {   // server key rotated → replace it
      await client.unsubscribe(sub.endpoint).catch(() => {});                  // best effort: stop sends to the dead one
      const removed = await sub.unsubscribe().catch(() => false);
      if (!removed) return "error";                                           // still bound to the old key → retry later
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
    if (subscriptionKeyState(sub, config.publicKey) === "mismatch") return "error";   // never report a stale key as enabled
    const json = sub.toJSON();
    await client.subscribe(json);
    if (json.endpoint) synced.add(syncKey(client, json.endpoint));
    return "enabled";
  } catch {
    return "error";
  }
}
