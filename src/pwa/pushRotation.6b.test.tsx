// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import MessagePushCard from "./MessagePushCard";
import {
  __resetPushSyncForTests, applicationServerKey, decodeBase64Url, sameApplicationServerKey, subscriptionKeyState,
  syncExistingPush, type PushClient
} from "./pushNotifications";

// Phase 6B — VAPID key ROTATION. The server now signs with K2, but this browser still holds a PushSubscription created
// with the old key K1; a push signed with K2 is rejected by the push service (401/403), so that subscription can never
// deliver again. Page load must NOT re-register it as if it were healthy, must NOT claim «الإشعارات مفعلة», and must offer
// an in-app repair.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const K1 = b64url(new Uint8Array(65).fill(4));
const K2 = b64url(new Uint8Array(65).fill(9));
const OLD = "https://fcm.googleapis.com/fcm/send/created-with-K1";
const NEW = "https://fcm.googleapis.com/fcm/send/created-with-K2";

type Opts = {
  permission?: "granted" | "default" | "denied";
  existing?: { key: string | null } | "no-options" | null;        // null → no subscription at all
  unsubscribe?: "ok" | "false" | "throw";
  subscribe?: "ok" | "throw" | "returns-K1";
  newEndpoint?: string;
};
/** A push-capable browser whose current subscription (if any) was made with `existing.key`. */
function browser(o: Opts = {}) {
  const Notification = { permission: o.permission ?? "granted", requestPermission: vi.fn(async () => { Notification.permission = "granted"; return "granted"; }) };
  const mk = (endpoint: string, key: string | null | "no-options") => ({
    endpoint,
    ...(key === "no-options" ? {} : { options: { userVisibleOnly: true, applicationServerKey: key === null ? null : applicationServerKey(key).buffer.slice(0) } }),
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "p-" + endpoint.slice(-2), auth: "a" } }),
    unsubscribe: vi.fn(async () => {
      if (o.unsubscribe === "throw") throw new DOMException("unsubscribe failed", "AbortError");
      if (o.unsubscribe === "false") return false;
      current = null; return true;
    })
  });
  let current: ReturnType<typeof mk> | null =
    o.existing === undefined ? mk(OLD, K1) : o.existing === null ? null : o.existing === "no-options" ? mk(OLD, "no-options") : mk(OLD, o.existing.key);
  const initial = current;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
      if (o.subscribe === "throw") throw new DOMException("push service unavailable", "AbortError");
      if (current) throw new DOMException("A subscription with a different applicationServerKey already exists", "InvalidStateError");
      current = mk(o.newEndpoint ?? NEW, o.subscribe === "returns-K1" ? K1 : b64url(opts.applicationServerKey));
      return current;
    })
  };
  const registration = { pushManager };
  const win = {
    navigator: { userAgent: "x", maxTouchPoints: 0, serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
    matchMedia: () => ({ matches: false }), PushManager: function PushManager() {}, Notification
  } as unknown as Window;
  return { win, Notification, pushManager, initial, current: () => current };
}
function server(publicKey: string, o: { postFails?: number } = {}) {
  let failures = o.postFails ?? 0;
  const posted: PushSubscriptionJSON[] = [];
  return {
    posted,
    sessionKey: "session-A",
    getConfig: vi.fn(async () => ({ available: true, publicKey })),
    subscribe: vi.fn(async (s: PushSubscriptionJSON) => { if (failures > 0) { failures--; throw new Error("registration failed"); } posted.push(s); }),
    unsubscribe: vi.fn(async (_e: string) => {})
  } satisfies PushClient & { posted: PushSubscriptionJSON[] };
}
const card = () => screen.getByRole("region", { name: "إشعارات الرسائل" });
const settled = async (fn: () => void) => { await waitFor(fn); await new Promise(r => setTimeout(r, 0)); };

function rotatedBrowser() {
  const Notification = { permission: "granted", requestPermission: vi.fn(async () => "granted") };
  const old = {
    endpoint: OLD, options: { applicationServerKey: applicationServerKey(K1).buffer.slice(0) },
    toJSON: () => ({ endpoint: OLD, expirationTime: null, keys: { p256dh: "p", auth: "a" } }), unsubscribe: vi.fn(async () => true)
  };
  const pushManager = { getSubscription: vi.fn(async () => old), subscribe: vi.fn() };
  const registration = { pushManager };
  const win = {
    navigator: { userAgent: "x", maxTouchPoints: 0, serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
    matchMedia: () => ({ matches: false }), PushManager: function PushManager() {}, Notification
  } as unknown as Window;
  return { win, Notification, pushManager, old };
}
const serverWith = (publicKey: string) => ({
  getConfig: vi.fn(async () => ({ available: true, publicKey })),
  subscribe: vi.fn(async (_s: PushSubscriptionJSON) => {}),
  unsubscribe: vi.fn(async (_e: string) => {})
}) satisfies PushClient;

beforeEach(() => { __resetPushSyncForTests(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("A — rotation regression (subscription made with K1, server now K2)", () => {
  it("page load detects the mismatch: the old subscription is not registered as healthy, the card does not say «مفعلة», and a repair action exists", async () => {
    const b = rotatedBrowser();
    const server = serverWith(K2);
    render(<MessagePushCard token="t" win={b.win} client={server} />);
    await waitFor(() => expect(server.getConfig).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("region", { name: "إشعارات الرسائل" })).not.toBeNull());
    await new Promise(r => setTimeout(r, 0));
    const card = screen.getByRole("region", { name: "إشعارات الرسائل" });
    expect(server.subscribe).not.toHaveBeenCalled();                         // the K1 subscription is NOT re-registered
    expect(card.getAttribute("data-state")).not.toBe("enabled");
    expect(card.textContent).not.toContain("الإشعارات مفعلة");
    expect(screen.getByRole("button", { name: "إعادة تفعيل الإشعارات" })).toBeTruthy();
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();         // detection never prompts
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();                   // nothing is replaced without the student's click
  });
});

describe("B — repair click (permission already granted)", () => {
  it("replaces the K1 subscription with a K2 one, registers it once, never prompts, and becomes enabled", async () => {
    const b = browser();
    const srv = server(K2);
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();
    expect(srv.unsubscribe).toHaveBeenCalledWith(OLD);                       // the dead registration is dropped server-side
    expect(b.initial!.unsubscribe).toHaveBeenCalledTimes(1);                  // …and in the browser
    expect(b.pushManager.subscribe).toHaveBeenCalledTimes(1);
    const opts = b.pushManager.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(b64url(opts.applicationServerKey)).toBe(K2);
    expect(srv.subscribe).toHaveBeenCalledTimes(1);
    expect(srv.posted.map(p => p.endpoint)).toEqual([NEW]);                   // never the K1 subscription
    expect(card().textContent).toContain("الإشعارات مفعلة");
    expect(screen.getByRole("status").textContent).toBe("تمت إعادة تفعيل الإشعارات على هذا الجهاز.");
    expect(screen.queryByRole("button", { name: "إعادة تفعيل الإشعارات" })).toBeNull();
  });

  it("after the repair, a remount in the same session is healthy and does not POST again", async () => {
    const b = browser();
    const srv = server(K2);
    const first = render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    first.unmount();
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(srv.subscribe).toHaveBeenCalledTimes(1);
    expect(b.pushManager.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("C — same key (subscription made with the current key K2)", () => {
  it("is registered as before (once, even under StrictMode), never replaced, never prompts, and shows «مفعلة»", async () => {
    const b = browser({ existing: { key: K2 } });
    const srv = server(K2);
    render(<StrictMode><MessagePushCard token="t" win={b.win} client={srv} /></StrictMode>);
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(card().textContent).toContain("الإشعارات مفعلة");
    expect(srv.posted.map(p => p.endpoint)).toEqual([OLD]);
    expect(b.initial!.unsubscribe).not.toHaveBeenCalled();
    expect(srv.unsubscribe).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("D — permission default", () => {
  it("nothing is requested on load (even with an old K1 subscription present); the prompt appears only after the click", async () => {
    for (const existing of [null, { key: K1 }] as const) {
      __resetPushSyncForTests();
      const b = browser({ permission: "default", existing });
      const srv = server(K2);
      render(<MessagePushCard token="t" win={b.win} client={srv} />);
      const button = await screen.findByRole("button", { name: "تفعيل الإشعارات" });
      await new Promise(r => setTimeout(r, 0));
      expect(b.Notification.requestPermission).not.toHaveBeenCalled();
      expect(srv.subscribe).not.toHaveBeenCalled();
      expect(b.pushManager.subscribe).not.toHaveBeenCalled();
      fireEvent.click(button);
      await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
      expect(b.Notification.requestPermission).toHaveBeenCalledTimes(1);   // user action only
      expect(b64url(b.pushManager.subscribe.mock.calls[0][0].applicationServerKey)).toBe(K2);
      expect(srv.posted.map(p => p.endpoint)).toEqual([NEW]);
      cleanup();
    }
  });
});

describe("E — permission denied", () => {
  it("no subscription attempt, no POST, no button, an understandable message", async () => {
    const b = browser({ permission: "denied" });
    const srv = server(K2);
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    await settled(() => expect(card().getAttribute("data-state")).toBe("denied"));
    expect(card().textContent).toMatch(/مرفوضة من المتصفح/);
    expect(screen.queryByRole("button")).toBeNull();
    expect(b.pushManager.getSubscription).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(srv.subscribe).not.toHaveBeenCalled();
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("F — failed repair never reports «مفعلة» and keeps a retry path", () => {
  const expectStillRepairable = async () => {
    await settled(() => expect(screen.getByRole("status").textContent).toBe("تعذرت إعادة تفعيل الإشعارات حاليًا. حاول مرة أخرى."));
    expect(card().getAttribute("data-state")).toBe("repair");
    expect(card().textContent).not.toContain("الإشعارات مفعلة");
    expect(screen.getByRole("button", { name: "إعادة تفعيل الإشعارات" })).toBeTruthy();
  };
  for (const [label, opts] of [
    ["the browser refuses to unsubscribe the K1 subscription (resolves false)", { unsubscribe: "false" }],
    ["unsubscribing the K1 subscription throws", { unsubscribe: "throw" }]
  ] as const) {
    it(label + " → no new subscription, nothing registered", async () => {
      const b = browser(opts);
      const srv = server(K2);
      render(<MessagePushCard token="t" win={b.win} client={srv} />);
      fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
      await expectStillRepairable();
      expect(b.pushManager.subscribe).not.toHaveBeenCalled();
      expect(srv.subscribe).not.toHaveBeenCalled();
      expect(b.Notification.requestPermission).not.toHaveBeenCalled();
    });
  }
  it("the new subscribe() fails → still repairable; nothing registered", async () => {
    const b = browser({ subscribe: "throw" });
    const srv = server(K2);
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await expectStillRepairable();
    expect(srv.subscribe).not.toHaveBeenCalled();
  });
  it("the browser hands back a subscription that is STILL bound to K1 → not registered, not enabled", async () => {
    const b = browser({ subscribe: "returns-K1" });
    const srv = server(K2);
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await expectStillRepairable();
    expect(srv.subscribe).not.toHaveBeenCalled();
  });
  it("the server registration (POST) fails → still repairable; the retry registers the K2 subscription once and succeeds", async () => {
    const b = browser();
    const srv = server(K2, { postFails: 1 });
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await expectStillRepairable();
    expect(srv.posted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(srv.posted.map(p => p.endpoint)).toEqual([NEW]);
    expect(b.pushManager.subscribe).toHaveBeenCalledTimes(1);                 // the K2 subscription is reused on retry
    expect(b.Notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("G — dedupe never suppresses a repaired subscription", () => {
  it("K2 healthy (synced) → server rotates to K3 mid-session → remount offers repair → the repaired K3 subscription is POSTed even with the SAME endpoint", async () => {
    const K3 = b64url(new Uint8Array(65).fill(3));
    const b = browser({ existing: { key: K2 }, newEndpoint: OLD });             // the push service reuses the endpoint
    const srv = server(K2);
    const first = render(<MessagePushCard token="t" win={b.win} client={srv} />);
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(srv.posted.map(p => p.endpoint)).toEqual([OLD]);                    // "session-A|OLD" is now in the dedupe set
    first.unmount();
    srv.getConfig.mockResolvedValue({ available: true, publicKey: K3 });
    render(<MessagePushCard token="t" win={b.win} client={srv} />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة تفعيل الإشعارات" }));
    await settled(() => expect(card().getAttribute("data-state")).toBe("enabled"));
    expect(b64url(b.pushManager.subscribe.mock.calls[0][0].applicationServerKey)).toBe(K3);
    expect(srv.posted.map(p => p.endpoint)).toEqual([OLD, OLD]);               // the repaired registration was NOT skipped
  });
});

describe("key comparison helpers", () => {
  const bytes = (k: string) => applicationServerKey(k);
  it("ArrayBuffer, Uint8Array, DataView and offset views compare by bytes", () => {
    expect(sameApplicationServerKey(bytes(K2).buffer.slice(0), K2)).toBe(true);
    expect(sameApplicationServerKey(bytes(K2), K2)).toBe(true);
    expect(sameApplicationServerKey(new DataView(bytes(K2).buffer.slice(0)), K2)).toBe(true);
    const padded = new Uint8Array(70); padded.set(bytes(K2), 3);
    expect(sameApplicationServerKey(padded.subarray(3, 68), K2)).toBe(true);   // a view into a larger buffer
    expect(sameApplicationServerKey(padded, K2)).toBe(false);                   // …but not the whole buffer
  });
  it("different, truncated, missing or undecodable keys never match", () => {
    expect(sameApplicationServerKey(bytes(K1).buffer.slice(0), K2)).toBe(false);
    expect(sameApplicationServerKey(bytes(K2).slice(0, 64), K2)).toBe(false);
    for (const missing of [null, undefined, "", {}, [], 42]) expect(sameApplicationServerKey(missing, K2)).toBe(false);
    expect(sameApplicationServerKey(new ArrayBuffer(0), "")).toBe(false);
    expect(sameApplicationServerKey(bytes(K2), "not base64url!")).toBe(false);
  });
  it("base64url decoding accepts padded or unpadded input and rejects anything else", () => {
    expect(decodeBase64Url(K2)).toEqual(bytes(K2));
    expect(decodeBase64Url(K2 + "=")).toEqual(bytes(K2));
    expect(decodeBase64Url("a+b/c")).toBeNull();
    expect(decodeBase64Url("%%")).toBeNull();
  });
  it("subscriptionKeyState: match / mismatch (other or no key) / unknown (browser exposes no options)", () => {
    const sub = (options: unknown) => ({ endpoint: OLD, ...(options === undefined ? {} : { options }) }) as unknown as PushSubscription;
    expect(subscriptionKeyState(sub({ applicationServerKey: bytes(K2).buffer.slice(0) }), K2)).toBe("match");
    expect(subscriptionKeyState(sub({ applicationServerKey: bytes(K1).buffer.slice(0) }), K2)).toBe("mismatch");
    expect(subscriptionKeyState(sub({ applicationServerKey: null }), K2)).toBe("mismatch");
    expect(subscriptionKeyState(sub(undefined), K2)).toBe("unknown");
  });
  it("syncExistingPush: mismatch → 'repair' without any POST; unknown key → registered as before; no subscription → 'none'", async () => {
    const mismatch = browser();
    const s1 = server(K2);
    expect(await syncExistingPush(s1, { available: true, publicKey: K2 }, mismatch.win)).toBe("repair");
    expect(s1.subscribe).not.toHaveBeenCalled();
    const unknown = browser({ existing: "no-options" });
    const s2 = server(K2);
    expect(await syncExistingPush(s2, { available: true, publicKey: K2 }, unknown.win)).toBe("enabled");
    expect(s2.posted.map(p => p.endpoint)).toEqual([OLD]);
    const none = browser({ existing: null });
    expect(await syncExistingPush(server(K2), { available: true, publicKey: K2 }, none.win)).toBe("none");
    expect(await syncExistingPush(server(K2), { available: false, publicKey: "" }, browser({ existing: { key: K2 } }).win)).toBe("none");
  });
});
