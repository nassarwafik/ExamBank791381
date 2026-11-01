// Tadris+ P2-A2b — «تسجيل الخروج» ends the teacher's session on the server too (P2-A2a /api/teacher-session/logout).
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { endTeacherServerSession } from "./teacherServerLogout";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("P2-A2b server sign-out", () => {
  it("POSTs the logout with the teacher token in x-builder-token, keepalive, no-store", () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    endTeacherServerSession("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/teacher-session/logout");
    expect(init).toMatchObject({ method: "POST", keepalive: true, cache: "no-store" });
    expect((init.headers as Record<string, string>)["x-builder-token"]).toBe("tok-1");
  });
  it("no token → no call; a failing network never throws (the local sign-out proceeds)", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchMock);
    endTeacherServerSession("");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => endTeacherServerSession("tok")).not.toThrow();
    await Promise.resolve();
  });
  it("App: only the teacher's own sign-out button calls it — never the 401 / expiry paths (handleLogout itself does not)", () => {
    const app = readFileSync(path.join(import.meta.dirname, "..", "App.tsx"), "utf8");
    expect(app).toContain("onLogout={() => leavePlatformThen(() => { endTeacherServerSession(token); handleLogout(); })}");
    const start = app.indexOf("function handleLogout() {");
    const body = app.slice(start, app.indexOf("\n  }\n", start));
    expect(body).not.toContain("endTeacherServerSession");
    expect(app.match(/endTeacherServerSession\(/g)?.length).toBe(1);
  });
});
