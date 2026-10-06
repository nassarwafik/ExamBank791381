import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SMART_SIM_ASSET_LIMITS, registerSmartSimAsset, resolveSmartSimAsset, listSmartSimAssets, validateSmartSimAssetRef } from "./trustedSimAssets";
import { HUMAN_BODY_ASSET, GALILEE_TERRAIN_ASSET } from "./trustedSimUniversalFixtures";

// Phase 20A.1 — TRUSTED ASSETS: a code-owned metadata registry resolved by EXACT identity (assetKey + assetVersion, optional sha256
// pin). Exam JSON can only NAME a registered asset; it can never carry a URL, a path, a script, markup or a module, can never register
// an asset and never gets "latest" or another version. No real asset files are added in this phase (production registry is empty).
// New-function tests (fail-first on the post-#264 baseline a48d108: the module does not exist).
const here = path.dirname(fileURLToPath(import.meta.url));
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const reg = () => { undo.push(registerSmartSimAsset(HUMAN_BODY_ASSET)); undo.push(registerSmartSimAsset(GALILEE_TERRAIN_ASSET)); };
const SCHEMES = ["../x.glb", "../../etc/passwd", "/abs/x.glb", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://x.test/m.glb", "https://random-site/model.glb", "file:///etc/passwd", "blob:https://x/1", "anatomy\\..\\x.glb", "anatomy/./x.glb", "anatomy//x.glb", "anatomy/x.glb?x=1", "anatomy/x.glb#a", "anatomy/x.svg", "anatomy/x.html", "anatomy/x.js"];

describe("20A.1-AS — the code-owned asset registry", () => {
  it("the production registry is EMPTY (no real asset in this phase); test fixtures register and unregister exactly", () => {
    expect(listSmartSimAssets()).toEqual([]);
    reg();
    expect(listSmartSimAssets().map(a => a.key + "@" + a.version)).toEqual(["galilee-terrain@1", "human-body@1"]);
    expect(JSON.parse(JSON.stringify(listSmartSimAssets()))).toEqual(listSmartSimAssets());
    expect(SMART_SIM_ASSET_LIMITS.byteSize).toBe(64 * 1024 * 1024);
  });
  it("refuses duplicates and malformed records: unsupported kinds (svg / html / script), unsafe sources (traversal, schemes, absolute), bad hashes, sizes, mimes, capabilities", () => {
    reg();
    expect(() => registerSmartSimAsset(HUMAN_BODY_ASSET)).toThrow(/already registered/);
    const bad: Record<string, unknown>[] = [
      { kind: "svg" }, { kind: "html" }, { kind: "script" }, { kind: "module" },
      { mime: "image/svg+xml" }, { mime: "text/html" }, { mime: "application/javascript" }, { mime: "text/plain" },
      { sha256: "z".repeat(64) }, { sha256: "a".repeat(63) }, { sha256: undefined },
      { byteSize: 0 }, { byteSize: 64 * 1024 * 1024 + 1 }, { byteSize: 1.5 },
      { version: 0 }, { version: 1.5 }, { version: "1" },
      { key: "Human-Body" }, { key: "human/body" }, { key: "../human" }, { key: "__proto__" }, { key: "https://x" },
      { capabilities: ["scene.4d"] }, { capabilities: ["asset.mesh3d", "asset.mesh3d"] },
      { url: "https://x.test/m.glb" }, { module: "./m" },
      ...SCHEMES.map(source => ({ source }))
    ];
    for (const over of bad) expect(() => registerSmartSimAsset({ ...HUMAN_BODY_ASSET, key: "other-asset", ...over } as never), JSON.stringify(over)).toThrow();
  });
  it("resolution is EXACT: no other version, no coercion, no case folding, no latest", () => {
    reg();
    expect(resolveSmartSimAsset("human-body", 1)).toMatchObject({ key: "human-body", version: 1, kind: "mesh3d" });
    for (const [k, v] of [["human-body", 2], ["human-body", "1"], ["human-body", 1.5], ["Human-Body", 1], ["human-body", "latest"], ["latest", 1], ["__proto__", 1]] as const) expect(resolveSmartSimAsset(k, v), k + "@" + String(v)).toBeUndefined();
    expect(Object.isFrozen(resolveSmartSimAsset("human-body", 1))).toBe(true);
  });
});

describe("20A.1-AR — asset REFERENCES in exam JSON", () => {
  it("a valid exact reference resolves; the sha256 pin must match; kind and capabilities must be compatible", () => {
    reg();
    expect(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1 })).toEqual({ ok: true, ref: { assetKey: "human-body", assetVersion: 1 } });
    expect(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1, sha256: "a".repeat(64) }).ok).toBe(true);
    expect(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1, kind: "mesh3d" })).toEqual({ ok: true, ref: { assetKey: "human-body", assetVersion: 1, kind: "mesh3d" } });
    expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1, kind: "terrain" }))).toContain("SMARTSIM_ASSET_KIND_MISMATCH");
    expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1, sha256: "c".repeat(64) }))).toContain("SMARTSIM_ASSET_HASH_MISMATCH");
    expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1 }, { kinds: ["terrain"] }))).toContain("SMARTSIM_ASSET_KIND_MISMATCH");
    expect(validateSmartSimAssetRef({ assetKey: "galilee-terrain", assetVersion: 1 }, { kinds: ["terrain"], capabilities: ["measure.elevation"] }).ok).toBe(true);
    expect(codes(validateSmartSimAssetRef({ assetKey: "galilee-terrain", assetVersion: 1 }, { capabilities: ["asset.mesh3d"] }))).toContain("SMARTSIM_ASSET_CAPABILITY_MISSING");
  });
  it("unknown assets FAIL CLOSED (no substitution of another version even when one exists)", () => {
    expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1 }))).toContain("SMARTSIM_ASSET_UNKNOWN");
    reg();
    expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 2 }))).toContain("SMARTSIM_ASSET_UNKNOWN");
    expect(codes(validateSmartSimAssetRef({ assetKey: "skeleton", assetVersion: 1 }))).toContain("SMARTSIM_ASSET_UNKNOWN");
  });
  it("adversarial references never become trusted paths: URLs, traversal, schemes, extra keys, wrong types", () => {
    reg();
    for (const assetKey of SCHEMES) expect(codes(validateSmartSimAssetRef({ assetKey, assetVersion: 1 })), assetKey).toContain("SMARTSIM_ASSET_REF_INVALID");
    for (const extra of [{ url: "https://x" }, { src: "x.glb" }, { href: "x" }, { path: "anatomy/x.glb" }, { module: "./x" }, { script: "alert(1)" }, { kind: "html" }])
      expect(codes(validateSmartSimAssetRef({ assetKey: "human-body", assetVersion: 1, ...extra })), JSON.stringify(extra)).toContain("SMARTSIM_ASSET_REF_INVALID");
    for (const raw of [null, "human-body@1", ["human-body", 1], { assetKey: "human-body" }, { assetKey: "human-body", assetVersion: "1" }, { assetKey: "human-body", assetVersion: 1, sha256: "not-a-hash" }])
      expect(codes(validateSmartSimAssetRef(raw)), JSON.stringify(raw)).toContain("SMARTSIM_ASSET_REF_INVALID");
  });
  it("the asset module reaches no network, filesystem or dynamic code", () => {
    const code = fs.readFileSync(path.join(here, "trustedSimAssets.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|import\(|require\(|new URL|eval\(|new Function|window\.|document\./);
  });
});
