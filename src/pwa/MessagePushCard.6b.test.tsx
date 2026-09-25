// @vitest-environment happy-dom
import { StrictMode } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import MessagePushCard from "./MessagePushCard";
import {
  __resetPushSyncForTests, applicationServerKey, createPushClient, enableMessagePush, isPushSupported, PushHttpError,
  syncExistingPush, type PushClient
} from "./pushNotifications";
import StudentPortal from "../StudentPortal";

// Phase 6B — opt-in message notifications on the student side. Browsers are simulated with a fake `win` exposing
// exactly what the feature detection reads (navigator.serviceWorker, PushManager, Notification) plus a spy push
// manager; the server is a fake PushClient. No real push service, key or student is involved.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const KEY = b64url(new Uint8Array(65).fill(4));                 // a syntactically valid (fake) VAPID public key
const OTHER_KEY = b64url(new Uint8Array(65).fill(9));
const EXISTING = "https://fcm.googleapis.com/fcm/send/existing-device";
const NEW = "https://fcm.googleapis.com/fcm/send/new-device";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};

type Perm = "default" | "granted" | "denied";
function fakeSub(endpoint: string, key: string) {
  const bytes = applicationServerKey(key);
  return {
    endpoint,
    options: { applicationServerKey: bytes.buffer.slice(0) },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "p256dh-" + endpoint.slice(-6), auth: "auth" } }),
    unsubscribe: vi.fn(async () => true)
  };
}

function pushWin(o: { permission?: Perm; answer?: Perm; existing?: string | null; existingKey?: string; supported?: boolean; noWorker?: boolean; ua?: string; coarse?: boolean; subscribeFails?: boolean } = {}) {
  const Notification = {
    permission: o.permission ?? "default",
    requestPermission: vi.fn(async () => { Notification.permission = o.answer ?? "granted"; return Notification.permission; })
  };
  let current: ReturnType<typeof fakeSub> | null = o.existing ? fakeSub(o.existing, o.existingKey ?? KEY) : null;
  const existingSub = current;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
      if (o.subscribeFails) throw new DOMException("push service error", "AbortError");
      current = fakeSub(NEW, b64url(opts.applicationServerKey));
      return current;
    })
  };
  const registration = { pushManager };
  const serviceWorker = {
    getRegistration: vi.fn(async () => (o.noWorker ? undefined : registration)),
    ready: o.noWorker ? new Promise(() => {}) : Promise.resolve(registration)
  };
  const win = {
    navigator: { userAgent: o.ua ?? UA.android, maxTouchPoints: 5, ...(o.supported === false ? {} : { serviceWorker }) },
    matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" && (o.coarse ?? true) }),
    ...(o.supported === false ? {} : { PushManager: function PushManager() {}, Notification })
  } as unknown as Window;
  return { win, Notification, pushManager, serviceWorker, existingSub };
}

function fakeClient(o: { available?: boolean; key?: string; configFails?: boolean; subscribeFails?: boolean } = {}) {
  return {
    getConfig: vi.fn(async () => {
      if (o.configFails) throw new PushHttpError("down", 500);
      return { available: o.available ?? true, publicKey: o.available === false ? "" : (o.key ?? KEY) };
    }),
    subscribe: vi.fn(async (_s: PushSubscriptionJSON) => { if (o.subscribeFails) throw new PushHttpError("nope", 503, "pushUnavailable"); }),
    unsubscribe: vi.fn(async (_e: string) => {})
  } satisfies PushClient;
}

const card = () => screen.queryByRole("region", { name: "إشعارات الرسائل" });
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { __resetPushSyncForTests(); try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("1 — unsupported browsers (feature detection only)", () => {
  it("detects support only from serviceWorker + PushManager + Notification", () => {
    expect(isPushSupported(pushWin().win)).toBe(true);
    expect(isPushSupported(pushWin({ supported: false }).win)).toBe(false);
    const noPushManager = { navigator: { serviceWorker: {} }, Notification: {} } as unknown as Window;
    expect(isPushSupported(noPushManager)).toBe(false);
    const noNotification = { navigator: { serviceWorker: {} }, PushManager: function () {} } as unknown as Window;
    expect(isPushSupported(noNotification)).toBe(false);
  });

  it("iPhone Safari tab → a simple «not supported» note with the home-screen hint; nothing is requested; hiding is remembered", async () => {
    const { win } = pushWin({ supported: false, ua: UA.iphone });
    const client = fakeClient();
    const { unmount } = render(<MessagePushCard token="t" win={win} client={client} />);
    expect(card()!.textContent).toMatch(/غير مدعومة في المتصفح/);
    expect(card()!.textContent).toMatch(/الشاشة الرئيسية/);
    expect(screen.queryByRole("button", { name: "تفعيل الإشعارات" })).toBeNull();
    expect(client.getConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(card()).toBeNull();
    unmount();
    render(<MessagePushCard token="t" win={win} client={client} />);
    expect(card()).toBeNull();
  });

  it("Android in-app browser without Web Push → the note (no crash); a desktop browser without it → nothing (page unchanged)", () => {
    render(<MessagePushCard token="t" win={pushWin({ supported: false, ua: UA.android, coarse: true }).win} client={fakeClient()} />);
    expect(card()!.textContent).toMatch(/لا يدعم إشعارات الرسائل/);
    cleanup();
    const { container } = render(<MessagePushCard token="t" win={pushWin({ supported: false, ua: UA.desktop, coarse: false }).win} client={fakeClient()} />);
    expect(container.innerHTML).toBe("");
  });

  it("the server has no push configuration → the card is hidden and nothing is ever requested from the browser", async () => {
    const w = pushWin();
    const client = fakeClient({ available: false });
    const { container } = render(<MessagePushCard token="t" win={w.win} client={client} />);
    await waitFor(() => expect(client.getConfig).toHaveBeenCalledTimes(1));
    await flush();
    expect(container.innerHTML).toBe("");
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    expect(w.pushManager.subscribe).not.toHaveBeenCalled();
    expect(await enableMessagePush(client, { available: false, publicKey: "" }, w.win)).toBe("unavailable");
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("2/3/4 — permission states on load (read-only, never a prompt)", () => {
  it("default → «تفعيل الإشعارات» button; no permission prompt, no subscription, no POST", async () => {
    const w = pushWin({ permission: "default" });
    const client = fakeClient();
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    expect(await screen.findByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
    expect(card()!.getAttribute("data-state")).toBe("default");
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    expect(w.pushManager.subscribe).not.toHaveBeenCalled();
    expect(client.subscribe).not.toHaveBeenCalled();
  });

  it("denied → explanatory text, no button, no prompt", async () => {
    const w = pushWin({ permission: "denied" });
    render(<MessagePushCard token="t" win={w.win} client={fakeClient()} />);
    await waitFor(() => expect(card()?.getAttribute("data-state")).toBe("denied"));
    expect(card()!.textContent).toMatch(/مرفوضة من المتصفح/);
    expect(screen.queryByRole("button", { name: "تفعيل الإشعارات" })).toBeNull();
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("granted but this browser has no subscription → the button (no prompt: permission already given)", async () => {
    const w = pushWin({ permission: "granted", existing: null });
    const client = fakeClient();
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    expect(await screen.findByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    expect(w.pushManager.subscribe).not.toHaveBeenCalled();
    expect(client.subscribe).not.toHaveBeenCalled();
  });
});

describe("6 — granted + existing subscription: re-registered once, never duplicated", () => {
  it("shows «الإشعارات مفعلة» and POSTs the EXISTING subscription once (StrictMode double effects included)", async () => {
    const w = pushWin({ permission: "granted", existing: EXISTING });
    const client = fakeClient();
    render(<StrictMode><MessagePushCard token="t" win={w.win} client={client} /></StrictMode>);
    await waitFor(() => expect(card()?.getAttribute("data-state")).toBe("enabled"));
    expect(card()!.textContent).toContain("الإشعارات مفعلة");
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe.mock.calls[0][0]).toMatchObject({ endpoint: EXISTING });
    expect(w.pushManager.subscribe).not.toHaveBeenCalled();             // never a second browser subscription
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    // A remount / refresh of the portal in the same page session does not POST again.
    expect(await syncExistingPush(client, w.win)).toBe(true);
    expect(client.subscribe).toHaveBeenCalledTimes(1);
  });

  it("the re-registration failing is harmless: the card falls back to the button, no error banner, no prompt", async () => {
    const w = pushWin({ permission: "granted", existing: EXISTING });
    const client = fakeClient({ subscribeFails: true });
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    expect(await screen.findByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("5/7 — the click is the only thing that asks, then subscribes and stores it", () => {
  it("click → permission requested ONCE → subscribe(userVisibleOnly + server key) → POST to the backend → «الإشعارات مفعلة»", async () => {
    const w = pushWin({ permission: "default", answer: "granted" });
    const client = fakeClient();
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    const button = await screen.findByRole("button", { name: "تفعيل الإشعارات" });
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(card()?.getAttribute("data-state")).toBe("enabled"));
    expect(w.Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(w.pushManager.subscribe).toHaveBeenCalledTimes(1);
    const opts = w.pushManager.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(b64url(opts.applicationServerKey)).toBe(KEY);
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe.mock.calls[0][0]).toMatchObject({ endpoint: NEW, keys: { auth: "auth" } });
    expect(card()!.textContent).toContain("الإشعارات مفعلة");
    expect(screen.getByRole("status").textContent).toBe("تم تفعيل الإشعارات على هذا الجهاز.");
    expect(screen.queryByRole("button", { name: "تفعيل الإشعارات" })).toBeNull();
  });

  it("the student refuses in the browser prompt → «مرفوضة» (never asked again by the page); closes it → button stays with a note", async () => {
    const denied = pushWin({ answer: "denied" });
    const client = fakeClient();
    render(<MessagePushCard token="t" win={denied.win} client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل الإشعارات" }));
    await waitFor(() => expect(card()?.getAttribute("data-state")).toBe("denied"));
    expect(denied.pushManager.subscribe).not.toHaveBeenCalled();
    expect(client.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "تفعيل الإشعارات" })).toBeNull();
    cleanup();

    const dismissed = pushWin({ answer: "default" });
    render(<MessagePushCard token="t" win={dismissed.win} client={fakeClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل الإشعارات" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/لم يتم التفعيل/));
    expect(screen.getByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
    expect(dismissed.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("already granted (no subscription) → the click subscribes WITHOUT a second prompt", async () => {
    const w = pushWin({ permission: "granted", existing: null });
    const client = fakeClient();
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل الإشعارات" }));
    await waitFor(() => expect(card()?.getAttribute("data-state")).toBe("enabled"));
    expect(w.Notification.requestPermission).not.toHaveBeenCalled();
    expect(client.subscribe).toHaveBeenCalledTimes(1);
  });

  it("a subscription made with an OLD server key is replaced (server + browser) instead of kept", async () => {
    const w = pushWin({ permission: "granted", existing: EXISTING, existingKey: OTHER_KEY });
    const client = fakeClient();
    expect(await enableMessagePush(client, { available: true, publicKey: KEY }, w.win)).toBe("enabled");
    expect(client.unsubscribe).toHaveBeenCalledWith(EXISTING);
    expect(w.existingSub!.unsubscribe).toHaveBeenCalled();
    expect(w.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe.mock.calls[0][0]).toMatchObject({ endpoint: NEW });
  });

  it("the same key → the existing browser subscription is reused (no duplicate)", async () => {
    const w = pushWin({ permission: "granted", existing: EXISTING });
    const client = fakeClient();
    expect(await enableMessagePush(client, { available: true, publicKey: KEY }, w.win)).toBe("enabled");
    expect(w.pushManager.subscribe).not.toHaveBeenCalled();
    expect(client.unsubscribe).not.toHaveBeenCalled();
    expect(client.subscribe.mock.calls[0][0]).toMatchObject({ endpoint: EXISTING });
  });
});

describe("8 — failures keep the page intact", () => {
  it("the backend refusing the subscription → a retry note, the button stays, no crash, no error banner", async () => {
    const w = pushWin();
    const client = fakeClient({ subscribeFails: true });
    render(<MessagePushCard token="t" win={w.win} client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل الإشعارات" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("تعذر تفعيل الإشعارات حاليًا. حاول مرة أخرى."));
    expect(screen.getByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the push service refusing to subscribe → the same retry note", async () => {
    const w = pushWin({ subscribeFails: true });
    render(<MessagePushCard token="t" win={w.win} client={fakeClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل الإشعارات" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/حاول مرة أخرى/));
  });

  it("the config request failing → the card is simply not shown (auxiliary; never an error or a logout)", async () => {
    const client = fakeClient({ configFails: true });
    const { container } = render(<MessagePushCard token="t" win={pushWin().win} client={client} />);
    await waitFor(() => expect(client.getConfig).toHaveBeenCalled());
    await flush();
    expect(container.innerHTML).toBe("");
  });

  it("no active service worker (e.g. not a production build) → «not supported» after the click", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const w = pushWin({ permission: "granted", noWorker: true });
      const result = enableMessagePush(fakeClient(), { available: true, publicKey: KEY }, w.win);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toBe("unsupported");
      expect(w.pushManager.subscribe).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});

describe("createPushClient — the student-push API contract", () => {
  it("sends the student session headers; subscribe/unsubscribe POST their action; a refusal becomes PushHttpError", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let next: { status: number; body: unknown } = { status: 200, body: { ok: true, available: true, publicKey: KEY } };
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return { status: next.status, ok: next.status < 300, json: async () => next.body } as Response;
    }) as unknown as typeof fetch;
    const client = createPushClient("tok");
    expect(await client.getConfig()).toEqual({ available: true, publicKey: KEY });
    expect(calls[0].url).toBe("/api/student-push");
    expect(calls[0].init?.method).toBeUndefined();
    expect(calls[0].init?.headers).toMatchObject({ "x-student-token": "tok", Authorization: "Bearer tok" });

    next = { status: 200, body: { ok: true, subscribed: true } };
    await client.subscribe({ endpoint: NEW, keys: { p256dh: "p", auth: "a" } });
    expect(calls[1].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ action: "subscribe", subscription: { endpoint: NEW, keys: { p256dh: "p", auth: "a" } } });
    expect(String(calls[1].init?.body)).not.toMatch(/studentId|userId/);   // identity is the server session, never the body
    await client.unsubscribe(NEW);
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ action: "unsubscribe", endpoint: NEW });

    next = { status: 503, body: { ok: false, code: "pushUnavailable", error: "x" } };
    await expect(client.subscribe({ endpoint: NEW })).rejects.toMatchObject({ status: 503, code: "pushUnavailable" });
    next = { status: 200, body: { ok: true, available: false, publicKey: "" } };
    expect(await client.getConfig()).toEqual({ available: false, publicKey: "" });
  });
});

describe("9/10 — the student portal: never an automatic prompt; unchanged when push is unsupported", () => {
  const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
  const DASHBOARD = {
    student: { userId: "u1", code: "C-1", displayName: "سارة", classId: "c1", shareAchievements: true },
    classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null }
  };
  const mockFetch = (push: unknown) => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, DASHBOARD);
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      if (url.includes("/api/student-push") && (init?.method || "GET") === "GET") return res(200, push);
      return res(404, { ok: false });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const pushUrls = (m: ReturnType<typeof mockFetch>) => m.mock.calls.filter(c => String(c[0]).includes("/api/student-push")).map(c => (c[1]?.method || "GET") + " " + String(c[0]));

  it("a push-capable browser: after login the card offers «تفعيل الإشعارات» after the «now» section — no prompt, no subscription, no POST", async () => {
    const w = pushWin({ permission: "default" });
    const g = window as unknown as Record<string, unknown>;
    const nav = window.navigator as unknown as Record<string, unknown>;
    const before = { PushManager: g.PushManager, Notification: g.Notification, sw: Object.getOwnPropertyDescriptor(window.navigator, "serviceWorker") };
    g.PushManager = (w.win as unknown as Record<string, unknown>).PushManager;
    g.Notification = w.Notification;
    Object.defineProperty(nav, "serviceWorker", { configurable: true, value: w.serviceWorker });
    try {
      const fetchMock = mockFetch({ ok: true, available: true, publicKey: KEY });
      render(<StrictMode><StudentPortal token="t" displayName="سارة" onLogout={() => {}} /></StrictMode>);
      expect(await screen.findByText(/مرحبًا سارة/)).toBeTruthy();
      expect(await screen.findByRole("button", { name: "تفعيل الإشعارات" })).toBeTruthy();
      const region = card()!;
      expect(region.previousElementSibling?.getAttribute("aria-labelledby")).toBe("eb-sp-now-title");
      await flush();
      expect(w.Notification.requestPermission).not.toHaveBeenCalled();
      expect(w.pushManager.subscribe).not.toHaveBeenCalled();
      expect(pushUrls(fetchMock).every(u => u.startsWith("GET "))).toBe(true);
      expect(pushUrls(fetchMock).length).toBeGreaterThan(0);
    } finally {
      g.PushManager = before.PushManager;
      g.Notification = before.Notification;
      if (before.sw) Object.defineProperty(nav, "serviceWorker", before.sw); else delete nav.serviceWorker;
    }
  });

  it("a browser without Web Push (desktop): the portal makes NO push request and renders no card — exactly as before", async () => {
    const g = window as unknown as Record<string, unknown>;
    expect(isPushSupported(window) && typeof g.PushManager === "function").toBe(false);
    const fetchMock = mockFetch({ ok: true, available: true, publicKey: KEY });
    render(<StudentPortal token="t" displayName="سارة" onLogout={() => {}} />);
    expect(await screen.findByText(/مرحبًا سارة/)).toBeTruthy();
    await flush();
    expect(card()).toBeNull();
    expect(pushUrls(fetchMock)).toEqual([]);
  });
});
