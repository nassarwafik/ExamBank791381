import { describe, it, expect, vi } from "vitest";
import { createRestrictedReaderContentApi, RestrictedModuleError } from "./restrictedContentApi";
import type { ReaderContentApi } from "./readerContentApi";
import manifest from "../content/791381/manifest";
import { orderedModules } from "../content/navigation";

// Class Learning Materials — the student's constrained content API: hidden modules are invisible to the manifest,
// reported as absent by hasModule, and NEVER reach the underlying loader.
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
function fakeBase(): ReaderContentApi & { loads: string[]; loadModule: ReturnType<typeof vi.fn> } {
  const loads: string[] = [];
  const loadModule = vi.fn(async (_c: string, m: string) => { loads.push(m); return { id: m, title: m, order: 1, lessons: [] }; });
  return { loadManifest: async () => manifest, hasModule: (_c, m) => [M01, M02, M07].includes(m), loadModule, loads };
}

describe("createRestrictedReaderContentApi — allowed m01, m02", () => {
  it("hasModule: m01 true, m02 true, m07 false (also false for anything the base does not have, or another course)", () => {
    const api = createRestrictedReaderContentApi("791381", [M01, M02], fakeBase());
    expect(api.hasModule("791381", M01)).toBe(true);
    expect(api.hasModule("791381", M02)).toBe(true);
    expect(api.hasModule("791381", M07)).toBe(false);
    expect(api.hasModule("791381", "791381-m03")).toBe(false);
    expect(api.hasModule("999999", M01)).toBe(false);
  });
  it("loadModule(m07) rejects with RestrictedModuleError BEFORE the base loader is invoked; allowed modules pass through", async () => {
    const base = fakeBase();
    const api = createRestrictedReaderContentApi("791381", [M01, M02], base);
    await expect(api.loadModule("791381", M07)).rejects.toBeInstanceOf(RestrictedModuleError);
    await expect(api.loadModule("791381", "791381-m999")).rejects.toMatchObject({ code: "module-not-released" });
    expect(base.loadModule).not.toHaveBeenCalled();
    await api.loadModule("791381", M02);
    expect(base.loads).toEqual([M02]);
  });
  it("loadManifest returns the FILTERED manifest (m01, m02 only) and never mutates the base manifest", async () => {
    const before = JSON.stringify(manifest);
    const api = createRestrictedReaderContentApi("791381", [M02, M01], fakeBase());
    const m = await api.loadManifest("791381");
    expect(orderedModules(m).map(x => x.id)).toEqual([M01, M02]);
    expect(JSON.stringify(m)).not.toContain("عناوين IP");
    expect(JSON.stringify(manifest)).toBe(before);
  });
  it("an empty allow-list yields a manifest with no modules and denies every module", async () => {
    const base = fakeBase();
    const api = createRestrictedReaderContentApi("791381", [], base);
    expect((await api.loadManifest("791381")).modules).toEqual([]);
    expect(api.hasModule("791381", M01)).toBe(false);
    await expect(api.loadModule("791381", M01)).rejects.toBeInstanceOf(RestrictedModuleError);
    expect(base.loads).toEqual([]);
  });
  it("defaults to the real registry API when no base is given (still a pure adapter — no import triggered here)", () => {
    const api = createRestrictedReaderContentApi("791381", [M01]);
    expect(api.hasModule("791381", M01)).toBe(true);
    expect(api.hasModule("791381", M07)).toBe(false);
  });
});
