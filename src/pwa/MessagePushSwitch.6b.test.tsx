// @vitest-environment happy-dom
import { StrictMode, useState } from "react";
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentPortal from "../StudentPortal";
import { __resetPushSyncForTests, applicationServerKey } from "./pushNotifications";

// Phase 6B follow-up — a shared browser TAB: student A signs in (device registered for A), signs out WITHOUT a page
// reload (App.handleLogout only resets state), student B signs in. The existing browser PushSubscription must be
// registered for B exactly once, so the server moves the device to B. The real StudentPortal is mounted, and
// /api/student-push is served by the REAL backend handler (student session + push-subscriptions) against the
// in-memory blob container — nothing is sent anywhere.

const nodeRequire = createRequire(import.meta.url);
const { handler: studentPush } = nodeRequire("../../api/src/functions/student-push.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");
const { endpointId, endpointDocName, studentDocName } = nodeRequire("../../api/src/lib/push-subscriptions.js");

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const TOKENS: Record<string, string> = { "token-A": A, "token-B": B };
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const KEY = b64url(new Uint8Array(65).fill(4));
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/shared-family-tablet";
const BROWSER_KEYS = { p256dh: b64url(new Uint8Array(65).fill(7)), auth: b64url(new Uint8Array(16).fill(8)) };

type Post = { token: string; body: { action?: string; subscription?: { endpoint?: string } } };

function setUp() {
  const student = (userId: string, name: string) => ({ schemaVersion: 3, role: "student", userId, displayName: name, code: "C-" + name, classId: "c1", active: true, archived: false, authVersion: 1 });
  const ctx = createMemoryContainer({ ["platform/users/" + A + ".json"]: student(A, "أحمد"), ["platform/users/" + B + ".json"]: student(B, "بسمة") });
  const posts: Post[] = [];
  const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    const token = headers["x-student-token"] || "";
    if (url.includes("/api/student-dashboard")) {
      const id = TOKENS[token];
      return res(200, { student: { userId: id, displayName: id === A ? "أحمد" : "بسمة", code: "C", classId: "c1" }, classroom: null, assignments: [], stats: { assigned: 0, completed: 0, average: null } });
    }
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-push")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (method === "POST") posts.push({ token, body });
      const r = await studentPush({ method, url: "https://x" + url, headers: { get: () => null }, json: async () => body }, {
        container: ctx.container,
        requireStudentAuth: () => (TOKENS[token] ? { ok: true, user: { sub: TOKENS[token], sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }),
        pushConfig: () => ({ available: true, publicKey: KEY, privateKey: "unused-in-this-test", subject: "mailto:a@b.c" })
      });
      return res(r.status, r.jsonBody);
    }
    return res(404, { ok: false });
  }) as unknown as typeof fetch;

  // A push-capable browser that ALREADY holds a subscription with the server key (permission granted earlier).
  const Notification = { permission: "granted", requestPermission: vi.fn(async () => "granted") };
  const subscription = {
    endpoint: ENDPOINT, options: { applicationServerKey: applicationServerKey(KEY).buffer.slice(0) },
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: BROWSER_KEYS }), unsubscribe: vi.fn(async () => true)
  };
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() } };
  const g = window as unknown as Record<string, unknown>;
  const saved = { PushManager: g.PushManager, Notification: g.Notification, sw: Object.getOwnPropertyDescriptor(window.navigator, "serviceWorker") };
  g.PushManager = function PushManager() {};
  g.Notification = Notification;
  Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => registration, ready: Promise.resolve(registration) } });
  const restore = () => {
    g.PushManager = saved.PushManager; g.Notification = saved.Notification;
    if (saved.sw) Object.defineProperty(window.navigator, "serviceWorker", saved.sw); else delete (window.navigator as unknown as Record<string, unknown>).serviceWorker;
  };
  const owner = () => (ctx.getJson(endpointDocName(endpointId(ENDPOINT))) || {}).studentId;
  const listed = (id: string) => ((ctx.getJson(studentDocName(id)) || {}).subscriptions || []).map((s: { endpoint: string }) => s.endpoint);
  return { posts, Notification, registration, restore, owner, listed };
}

/** Like App: one tab, the token swaps on logout, no page reload (module state survives). */
function Tab({ first, next, onRender }: { first: string; next: string; onRender?: () => void }) {
  const [token, setToken] = useState(first);
  const [tick, setTick] = useState(0);
  onRender?.();
  return (
    <>
      <button type="button" onClick={() => setTick(t => t + 1)}>rerender {tick}</button>
      <StudentPortal key={token} token={token} displayName={token === "token-A" ? "أحمد" : "بسمة"} onLogout={() => setToken(next)} />
    </>
  );
}

let env: ReturnType<typeof setUp>;
beforeEach(() => { __resetPushSyncForTests(); env = setUp(); });
afterEach(() => { cleanup(); env.restore(); vi.restoreAllMocks(); });

const postsFor = (token: string) => env.posts.filter(p => p.token === token && p.body.action === "subscribe");

describe("shared tab: A → logout (no reload) → B", () => {
  it("B's existing browser subscription is registered for B exactly once and the server makes B the owner", async () => {
    render(<StrictMode><Tab first="token-A" next="token-B" /></StrictMode>);
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(env.owner()).toBe(A));
    expect(postsFor("token-A")).toHaveLength(1);                            // StrictMode double effects → still one POST
    expect(screen.getByRole("region", { name: "إشعارات الرسائل" }).textContent).toContain("الإشعارات مفعلة");

    fireEvent.click(screen.getByRole("button", { name: /تسجيل الخروج/ }));  // same tab, same module state
    await screen.findByText(/مرحبًا بسمة/);
    await waitFor(() => expect(env.owner()).toBe(B));
    expect(postsFor("token-B")).toHaveLength(1);
    expect(postsFor("token-B")[0].body.subscription?.endpoint).toBe(ENDPOINT);
    expect(env.listed(B)).toEqual([ENDPOINT]);
    expect(env.listed(A)).toEqual([]);                                     // the device left A
    await waitFor(() => expect(screen.getByRole("region", { name: "إشعارات الرسائل" }).textContent).toContain("الإشعارات مفعلة"));

    // Re-renders of B's portal never POST again.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /^rerender/ }));
    await new Promise(r => setTimeout(r, 0));
    expect(postsFor("token-B")).toHaveLength(1);
    expect(postsFor("token-A")).toHaveLength(1);

    // Never a permission prompt and never a second browser subscription — the existing one is reused.
    expect(env.Notification.requestPermission).not.toHaveBeenCalled();
    expect(env.registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("the dedupe never keeps the raw token in memory: the client exposes only a fingerprint", async () => {
    const { createPushClient } = await import("./pushNotifications");
    const client = createPushClient("token-A-very-secret-value");
    expect(client.sessionKey).toBeTruthy();
    expect(String(client.sessionKey)).not.toContain("secret");
    expect(createPushClient("token-B").sessionKey).not.toBe(createPushClient("token-A").sessionKey);
    expect(createPushClient("token-A").sessionKey).toBe(createPushClient("token-A").sessionKey);
  });
});
