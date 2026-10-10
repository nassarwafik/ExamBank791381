import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeshAssetService } from "./meshAssetClient";

// Phase 21D-B.2 — the App-owned mesh asset client: the token goes in headers only (never the body or a URL), the file name is
// percent-encoded, responses map to explicit outcomes, and a malformed server row can never become a model reference.
const SHA = "a".repeat(64);
type Sent = { method: string; url: string; headers: Record<string, string>; body: unknown };
function fakeXhr(status: number, response: unknown) {
  const sent: Sent[] = [];
  class X {
    status = 0; responseText = ""; upload = { onprogress: null as null | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) };
    onload: null | (() => void) = null; onerror: null | (() => void) = null;
    private s: Sent = { method: "", url: "", headers: {}, body: null };
    open(method: string, url: string) { this.s.method = method; this.s.url = url; }
    setRequestHeader(k: string, v: string) { this.s.headers[k] = v; }
    send(body: unknown) {
      this.s.body = body; sent.push(this.s);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      this.status = status; this.responseText = typeof response === "string" ? response : JSON.stringify(response);
      if (status === 0) this.onerror?.(); else this.onload?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", X);
  return sent;
}
const deps = (rows: unknown[] = []) => ({ requestJson: vi.fn(async () => ({ assets: rows })) as never, authHeaders: () => ({ Authorization: "Bearer T0KEN" }) });
const record = { sha256: SHA, byteLength: 2048, triangles: 12, vertices: 8, materials: 1, textures: 0, parts: [{ id: "box", triangles: 12 }], name: "box.glb", uploadedAt: "2026-10-10T00:00:00Z" };

describe("21D-B.2 mesh asset client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads the raw file with the auth headers and an encoded name; reports progress; maps created / exists", async () => {
    const sent = fakeXhr(201, { ok: true, status: "created", asset: record });
    const progress = vi.fn();
    const file = new File([new Uint8Array(10)], "قلب نموذج.glb");
    const r = await createMeshAssetService(deps()).upload(file, progress);
    expect(r).toEqual({ status: "created", asset: record });
    expect(sent[0]).toMatchObject({ method: "POST", url: "/api/mesh-assets/upload" });
    expect(sent[0].headers).toMatchObject({ Authorization: "Bearer T0KEN", "x-file-name": encodeURIComponent("قلب نموذج.glb"), "Content-Type": "application/octet-stream" });
    expect(sent[0].body).toBe(file);
    expect(sent[0].url).not.toContain("T0KEN");
    expect(progress).toHaveBeenCalledWith(0.5);
    fakeXhr(200, { ok: true, status: "exists", asset: record });
    expect((await createMeshAssetService(deps()).upload(file)).status).toBe("exists");
  });

  it("server refusals keep their reasons; other failures are explained; a malformed success is an error, never an asset", async () => {
    fakeXhr(400, { ok: false, status: "rejected", issues: [{ code: "MESH_ASSET_EXTENSION", path: "extensionsUsed", message: "امتداد غير مدعوم." }] });
    expect(await createMeshAssetService(deps()).upload(new File(["x"], "a.glb"))).toEqual({ status: "rejected", issues: [{ code: "MESH_ASSET_EXTENSION", path: "extensionsUsed", message: "امتداد غير مدعوم." }] });
    fakeXhr(413, "not json");
    expect(await createMeshAssetService(deps()).upload(new File(["x"], "a.glb"))).toEqual({ status: "error", message: "حجم النموذج يتجاوز الحد المسموح." });
    fakeXhr(401, {});
    expect((await createMeshAssetService(deps()).upload(new File(["x"], "a.glb"))).status).toBe("error");
    fakeXhr(0, "");
    expect(await createMeshAssetService(deps()).upload(new File(["x"], "a.glb"))).toEqual({ status: "error", message: "تعذّر الاتصال بالخادم أثناء رفع النموذج." });
    fakeXhr(201, { ok: true, status: "created", asset: { ...record, sha256: "../../etc" } });
    expect((await createMeshAssetService(deps()).upload(new File(["x"], "a.glb"))).status).toBe("error");
  });

  it("lists only well-formed records", async () => {
    const rows = await createMeshAssetService(deps([record, { ...record, sha256: "XYZ" }, null, { ...record, parts: "nope" }, { ...record, byteLength: 1.5 }])).list();
    expect(rows).toEqual([record]);
  });
});
