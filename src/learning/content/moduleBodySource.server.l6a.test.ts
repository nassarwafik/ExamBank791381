// Phase L.6a — the app's module-body transport: the path, the caller's headers, a revalidated read, and typed errors (a refused,
// missing, unauthorised or malformed answer is never handed to the Reader as a body).
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadModuleBody, ModuleBodyError } from "./moduleBodySource.server";

afterEach(() => vi.restoreAllMocks());
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body } as Response);
const MOD = { id: "791381-m01", title: "x", order: 1, lessons: [] };

describe("moduleBodySource.server", () => {
  it("GETs the module with the session headers and no-cache; returns the module", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { ok: true, courseId: "791381", module: MOD }));
    expect(await loadModuleBody("791381", "791381-m01", { "x-student-token": "s" })).toEqual(MOD);
    expect(f).toHaveBeenCalledWith("/api/learning-content/791381/791381-m01", { headers: { "x-student-token": "s" }, cache: "no-cache" });
    await loadModuleBody("79/1", "a b", {}).catch(() => null);                     // (the stub's body is for m01 → refused as foreign)
    expect(f.mock.calls[1][0]).toBe("/api/learning-content/79%2F1/a%20b");
  });

  it("maps refusals to typed errors carrying the server's message; never returns a foreign or malformed body", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    const cases: Array<[Response, string, number]> = [
      [res(403, { ok: false, error: "هذه الوحدة غير متاحة لصفك بعد." }), "unavailable", 403],
      [res(404, { ok: false, error: "هذه الوحدة غير موجودة." }), "not-found", 404],
      [res(401, { ok: false }), "unauthorized", 401],
      [res(200, { ok: true, module: { ...MOD, id: "791381-m02" } }), "invalid", 200],
      [res(200, { ok: true, module: { id: "791381-m01" } }), "invalid", 200],
      [res(500, { ok: false }), "invalid", 500],
    ];
    for (const [r, code, status] of cases) {
      f.mockResolvedValueOnce(r);
      const e = await loadModuleBody("791381", "791381-m01").catch(x => x);
      expect(e).toBeInstanceOf(ModuleBodyError);
      expect(e).toMatchObject({ code, status });
    }
    f.mockResolvedValueOnce(res(403, { ok: false, error: "هذه الوحدة غير متاحة لصفك بعد." }));
    expect((await loadModuleBody("791381", "791381-m01").catch(x => x)).message).toBe("هذه الوحدة غير متاحة لصفك بعد.");
    f.mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadModuleBody("791381", "791381-m01").catch(x => x)).toMatchObject({ code: "network", status: 0 });
  });
});
