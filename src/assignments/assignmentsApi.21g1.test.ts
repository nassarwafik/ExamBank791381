// Phase 21G.1 — the workspace's ONE request helper: the teacher token on both accepted headers, a JSON body, and a refused request
// becomes an Error carrying the server's own message.
import { describe, it, expect, vi, afterEach } from "vitest";
import { assignmentsApi, fmt } from "./assignmentsApi";

afterEach(() => { vi.restoreAllMocks(); });
const answer = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body }) as unknown as Response;

describe("assignmentsApi", () => {
  it("sends the token on both headers with a JSON content type and returns the body", async () => {
    const fetchMock = vi.fn(async () => answer(200, { ok: true, assignments: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await assignmentsApi("tok-1")<{ assignments: unknown[] }>("/api/assignments", { method: "POST", body: "{}", headers: { "X-Extra": "1" } });
    expect(r.assignments).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const h = new Headers(init.headers);
    expect(url).toBe("/api/assignments");
    expect(init.method).toBe("POST");
    expect([h.get("content-type"), h.get("x-builder-token"), h.get("authorization"), h.get("x-extra")]).toEqual(["application/json", "tok-1", "Bearer tok-1", "1"]);
  });
  it("a refused request throws the server's message (or a generic one)", async () => {
    globalThis.fetch = vi.fn(async () => answer(404, { ok: false, error: "الواجب غير موجود." })) as unknown as typeof fetch;
    await expect(assignmentsApi("t")("/api/assignments")).rejects.toThrow("الواجب غير موجود.");
    globalThis.fetch = vi.fn(async () => answer(400, { ok: false })) as unknown as typeof fetch;
    await expect(assignmentsApi("t")("/api/assignments")).rejects.toThrow("حدث خطأ.");
  });
  it("formats an empty date as «بدون موعد»", () => {
    expect(fmt("")).toBe("بدون موعد");
  });
});
