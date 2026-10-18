import { describe, it, expect, afterEach, vi } from "vitest";
import { createUserDirectoryCache, invalidateUserDirectory, DEFAULT_TTL_MS } from "../src/lib/project-tracker/user-directory-cache.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P-2 — the short-lived user-directory cache behind the Project Tracker's READ views (owner decision: 20 s).
//   Unit: reuse within the TTL, rescan after it, one shared in-flight scan, failures never cached, TTL 0 / no URL → no
//   cache, per-URL isolation, invalidate.
//   Contract over the REAL handler (a container that carries a storage URL, as production clients do): the workspace
//   tabs share ONE users scan; a student moved to another class keeps showing in the read views for at most the TTL,
//   while every WRITE checks membership directly at once (a cached list never authorizes anything).

const NOW = "2026-10-01T00:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const c = url => ({ url });

describe("P-2 user-directory cache — unit", () => {
  it("reuses one scan within the TTL and rescans after it", async () => {
    let t = 0, scans = 0;
    const cache = createUserDirectoryCache({ ttlMs: 1000, now: () => t, scan: async () => [++scans] });
    expect(await cache.list(c("u"))).toEqual([1]);
    t = 999; expect(await cache.list(c("u"))).toEqual([1]);
    t = 1000; expect(await cache.list(c("u"))).toEqual([2]);
    expect(scans).toBe(2);
  });
  it("concurrent callers share ONE in-flight scan", async () => {
    let scans = 0, release = () => {};
    const gate = new Promise(r => { release = r; });
    const cache = createUserDirectoryCache({ ttlMs: 1000, now: () => 0, scan: async () => { scans++; await gate; return ["x"]; } });
    const all = Promise.all([cache.list(c("u")), cache.list(c("u")), cache.list(c("u"))]);
    release();
    expect(await all).toEqual([["x"], ["x"], ["x"]]);
    expect(scans).toBe(1);
  });
  it("never caches a failed scan", async () => {
    let n = 0;
    const cache = createUserDirectoryCache({ ttlMs: 1000, now: () => 0, scan: async () => { n++; if (n === 1) throw new Error("storage down"); return ["ok"]; } });
    await expect(cache.list(c("u"))).rejects.toThrow("storage down");
    expect(await cache.list(c("u"))).toEqual(["ok"]);
    expect(n).toBe(2);
  });
  it("TTL 0 disables caching; a container without a URL is never cached", async () => {
    let n = 0;
    const off = createUserDirectoryCache({ ttlMs: 0, now: () => 0, scan: async () => ++n });
    await off.list(c("u")); await off.list(c("u"));
    expect(n).toBe(2);
    const on = createUserDirectoryCache({ ttlMs: 1000, now: () => 0, scan: async () => ++n });
    await on.list({}); await on.list({});
    expect(n).toBe(4);
    expect(on.size()).toBe(0);
  });
  it("isolates storage URLs and can be invalidated", async () => {
    let n = 0;
    const cache = createUserDirectoryCache({ ttlMs: 1000, now: () => 0, scan: async container => container.url + ++n });
    expect(await cache.list(c("a"))).toBe("a1");
    expect(await cache.list(c("b"))).toBe("b2");
    expect(await cache.list(c("a"))).toBe("a1");
    cache.invalidate(c("a"));
    expect(await cache.list(c("a"))).toBe("a3");
  });
  it("reads the TTL from PROJECT_USER_CACHE_TTL_MS (default 20 s; junk falls back to the default)", async () => {
    let t = 0, n = 0;
    const cache = createUserDirectoryCache({ now: () => t, scan: async () => ++n });
    vi.stubEnv("PROJECT_USER_CACHE_TTL_MS", "");
    await cache.list(c("u")); t = DEFAULT_TTL_MS - 1; await cache.list(c("u"));
    expect(n).toBe(1);
    vi.stubEnv("PROJECT_USER_CACHE_TTL_MS", "0");
    await cache.list(c("u"));
    expect(n).toBe(2);
    vi.stubEnv("PROJECT_USER_CACHE_TTL_MS", "banana");
    t = DEFAULT_TTL_MS + 5; await cache.list(c("u")); await cache.list(c("u"));
    expect(n).toBe(3);
  });
});

describe("P-2 user-directory cache — contract over the real handler", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  function school() {
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", createdAt: NOW, updatedAt: NOW },
      "platform/classes/c2.json": { classId: "c2", name: "صف 2", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", createdAt: NOW, updatedAt: NOW },
      "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, classId: "c1", displayName: "سامي", code: "S1" },
      "platform/users/s2.json": { userId: "s2", role: "student", active: true, archived: false, classId: "c1", displayName: "سلمى", code: "S2" }
    });
    let userLists = 0;
    const url = "https://contract.example/" + Math.random();                    // a fresh URL per test: no cross-test sharing
    const container = new Proxy(ctx.container, {
      get(target, prop) {
        if (prop === "url") return url;
        if (prop === "listBlobsFlat") return opts => { if (opts && opts.prefix === "platform/users/") userLists++; return target.listBlobsFlat(opts); };
        const v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container, getContainer: () => container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
    const get = async (resource, classId = "c1") => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, resource, classId }), json: async () => ({}) }, deps)).jsonBody;
    const post = async body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, deps);
    return { ctx, get, post, lists: () => userLists, container };
  }

  it("the workspace tabs share ONE users scan within the TTL", async () => {
    const s = school();
    await s.get("summary"); await s.get("students"); await s.get("board"); await s.get("analytics");
    expect(s.lists()).toBe(1);
    invalidateUserDirectory(s.container);
  });

  it("a moved student leaves the read views within the TTL, while writes check membership at once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T10:00:00.000Z"));
    const s = school();
    expect((await s.get("students")).students.map(x => x.studentId)).toEqual(["سامي", "سلمى"].map((_, i) => "s" + (i + 1)));
    s.ctx.setJson("platform/users/s2.json", { userId: "s2", role: "student", active: true, archived: false, classId: "c2", displayName: "سلمى", code: "S2" });
    // Within the TTL the read view may still list the moved student…
    vi.setSystemTime(new Date("2026-10-01T10:00:10.000Z"));
    expect((await s.get("students")).students.map(x => x.studentId)).toContain("s2");
    // …but no write for c1 accepts them: membership is read directly from the user document.
    const w = await s.post({ action: "progress.update", studentId: "s2", stageId: "B01", status: "approved" });
    expect(w.status).toBe(404);
    expect(s.ctx.getJson(NS.progressName("c1", "s2"))).toBeNull();
    // After the TTL the read view is exact again.
    vi.setSystemTime(new Date("2026-10-01T10:00:21.000Z"));
    expect((await s.get("students")).students.map(x => x.studentId)).toEqual(["s1"]);
    invalidateUserDirectory(s.container);
  });

  it("the student profile returns the newest 50 events; evaluation still sees the whole history", async () => {
    const s = school();
    const history = Array.from({ length: 120 }, (_, k) => ({ eventId: "e" + k, stageId: "B01", type: k === 3 ? "score" : "status", toStatus: "approved", toScore: k === 3 ? 90 : undefined, actor: "t", createdAt: new Date(Date.UTC(2026, 0, 1, 0, k)).toISOString() }));
    s.ctx.setJson(NS.progressName("c1", "s1"), { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: { B01: { status: "approved", score: 90 } }, history });
    const r = (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, resource: "student", classId: "c1", studentId: "s1" }), json: async () => ({}) }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: s.container, getContainer: () => s.container })).jsonBody;
    expect(r.history).toHaveLength(50);
    expect(r.history[0].eventId).toBe("e70");
    expect(r.history.at(-1).eventId).toBe("e119");
    expect(r.evaluation.updatedAt).toBe(history[3].createdAt);                       // the score event (#3) is outside the 50 returned
    invalidateUserDirectory(s.container);
  });

  it("PROJECT_USER_CACHE_TTL_MS=0 restores a scan per request", async () => {
    vi.stubEnv("PROJECT_USER_CACHE_TTL_MS", "0");
    const s = school();
    await s.get("summary"); await s.get("students");
    expect(s.lists()).toBe(2);
  });
});
