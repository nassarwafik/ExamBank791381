// Phase L.5 — the annotations transport: paths, the student's headers, a quiet read failure (null), a write failure that
// carries the server's message, and a defensive parse of whatever the server answers.
import { describe, it, expect, afterEach, vi } from "vitest";
import { asAnnotations, createAnnotationsClient, AnnotationsError } from "./annotationsClient";

afterEach(() => vi.restoreAllMocks());
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
const H = { "x-student-token": "s", Authorization: "Bearer s" };

describe("annotationsClient", () => {
  it("GET reads the course; a failure of any kind resolves to null", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(res({ ok: true, bookmarks: [{ pageId: "p1", at: "t" }], notes: [], highlights: [] }));
    const c = createAnnotationsClient(H);
    expect(await c.get("791381")).toEqual({ bookmarks: [{ pageId: "p1", at: "t" }], notes: [], highlights: [] });
    expect(f.mock.calls[0][0]).toBe("/api/learning-annotations/791381");
    expect(f.mock.calls[0][1]).toMatchObject({ headers: H });
    f.mockResolvedValueOnce(res({ ok: false }, 403));
    expect(await c.get("791381")).toBeNull();
    f.mockRejectedValueOnce(new TypeError("offline"));
    expect(await c.get("791381")).toBeNull();
  });

  it("each write posts its action and body; a refusal rejects with the server's message; offline has a fallback", async () => {
    const ok = res({ ok: true, bookmarks: [], notes: [], highlights: [] });
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok);
    const c = createAnnotationsClient(H);
    await c.bookmark("791381", "p1", true);
    await c.note("791381", "p1", "نص");
    await c.highlight("791381", "p1", "مقطع");
    await c.unhighlight("791381", "p1", "h1");
    expect(f.mock.calls.map(([u, i]) => [u, JSON.parse(String((i as RequestInit).body))])).toEqual([
      ["/api/learning-annotations/791381/bookmark", { pageId: "p1", on: true }],
      ["/api/learning-annotations/791381/note", { pageId: "p1", text: "نص" }],
      ["/api/learning-annotations/791381/highlight", { pageId: "p1", quote: "مقطع" }],
      ["/api/learning-annotations/791381/unhighlight", { pageId: "p1", id: "h1" }],
    ]);
    expect(f.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { ...H, "Content-Type": "application/json" } });
    f.mockResolvedValueOnce(res({ ok: false, error: "تجاوزت الحد المسموح" }, 413));
    await expect(c.note("791381", "p1", "x")).rejects.toMatchObject({ status: 413, message: "تجاوزت الحد المسموح" });
    f.mockRejectedValueOnce(new TypeError("offline"));
    const e = await c.bookmark("791381", "p1", false).catch(x => x);
    expect(e).toBeInstanceOf(AnnotationsError);
    expect(e.message).toBe("تعذر حفظ التغيير الآن. حاول مرة أخرى.");
  });

  it("parses defensively: not ok → null; malformed entries are dropped one by one", () => {
    expect(asAnnotations({ ok: false })).toBeNull();
    expect(asAnnotations(null)).toBeNull();
    expect(asAnnotations({ ok: true, bookmarks: [{ pageId: "p1", at: "t" }, { at: "t" }, "x"], notes: [{ pageId: "p1" }, { pageId: "p2", text: "n", updatedAt: "t" }], highlights: [{ pageId: "p1", id: "h", quote: "q", createdAt: "t" }, { pageId: "p1", quote: "q" }] }))
      .toEqual({ bookmarks: [{ pageId: "p1", at: "t" }], notes: [{ pageId: "p2", text: "n", updatedAt: "t" }], highlights: [{ pageId: "p1", id: "h", quote: "q", createdAt: "t" }] });
  });
});
