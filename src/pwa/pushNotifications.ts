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

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
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

/**
 * On load, WITHOUT prompting: if permission is already granted and this browser already has a subscription, make sure
 * the server has it. Returns true when an existing subscription is active for this student.
 */
export async function syncExistingPush(client: PushClient, win: Window = window): Promise<boolean> {
  if (!isPushSupported(win) || notificationPermission(win) !== "granted") return false;
  const reg = await currentRegistration(win);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return false;
  const json = sub.toJSON();
  if (!json.endpoint) return false;
  const key = syncKey(client, json.endpoint);
  if (!synced.has(key)) {
    await client.subscribe(json);
    synced.add(key);
  }
  return true;
}

export type EnableResult = "enabled" | "default" | "denied" | "unsupported" | "unavailable" | "error";

/**
 * The student clicked «تفعيل الإشعارات». Permission is requested FIRST (still inside the click), then this browser is
 * subscribed with the server's VAPID key and the subscription is stored for the signed-in student.
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
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) {   // server key rotated → replace this subscription
      await client.unsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
    const json = sub.toJSON();
    await client.subscribe(json);
    if (json.endpoint) synced.add(syncKey(client, json.endpoint));
    return "enabled";
  } catch {
    return "error";
  }
}
