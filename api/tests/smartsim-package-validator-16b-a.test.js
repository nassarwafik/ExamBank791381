import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { validateSmartSimPackage, SMARTSIM_LIMITS } from "../src/lib/smartsim/package-validator.js";
import { validateSmartSimManifest } from "../src/lib/shared-finalization/smartsimManifest.js";
import { contentTypeFor, ALLOWED_PACKAGE_EXTENSIONS } from "../src/lib/smartsim/mime-map.js";
import { writeZip, vanillaPackage, reactDistPackage, sourceOnlyPackage, manifestOf, VANILLA_INDEX } from "./fixtures/smartsim-zip.js";

// Phase 16B-A — the server-authoritative SmartSim package validator. Uploaded archives are attacker-controlled: extension,
// MIME, filenames, manifest and ZIP metadata are never trusted. Fail-first on 6bb3b97 (no validator / manifest module).
const codes = r => r.issues.filter(i => i.severity === "error").map(i => i.code);
const has = (r, code) => codes(r).includes(code);

describe("S2 / S15 / S16 — SmartSim manifest v1 (server-authoritative, shared build)", () => {
  it("accepts the minimal valid manifest and rejects wrong schemaVersion / bad ids / unsafe entries / unsupported runtime", () => {
    expect(validateSmartSimManifest(manifestOf()).ok).toBe(true);
    expect(validateSmartSimManifest(manifestOf({ schemaVersion: 2 })).issues.map(i => i.code)).toContain("MANIFEST_SCHEMA_VERSION");
    expect(validateSmartSimManifest(manifestOf({ packageId: "Bad Id" })).issues.map(i => i.code)).toContain("MANIFEST_PACKAGE_ID");
    expect(validateSmartSimManifest(manifestOf({ packageVersion: 0 })).issues.map(i => i.code)).toContain("MANIFEST_PACKAGE_VERSION");
    expect(validateSmartSimManifest(manifestOf({ packageVersion: 1.5 })).issues.map(i => i.code)).toContain("MANIFEST_PACKAGE_VERSION");
    expect(validateSmartSimManifest(manifestOf({ runtime: "native" })).issues.map(i => i.code)).toContain("MANIFEST_RUNTIME");
    expect(validateSmartSimManifest(manifestOf({ runtimeVersion: 9 })).issues.map(i => i.code)).toContain("RUNTIME_UNSUPPORTED");
    expect(validateSmartSimManifest(manifestOf({ responseSchemaVersion: 7 })).issues.map(i => i.code)).toContain("RESPONSE_SCHEMA_UNSUPPORTED");
    expect(validateSmartSimManifest(manifestOf({ title: "x".repeat(500) })).issues.map(i => i.code)).toContain("MANIFEST_TITLE");
    expect(validateSmartSimManifest(manifestOf({ capabilities: "yes" })).issues.map(i => i.code)).toContain("MANIFEST_CAPABILITIES");
    for (const entry of ["../x.html", "/dist/index.html", "https://evil.example/index.html", "http://x/y", "file:///etc/passwd", "data:text/html,hi", "javascript:alert(1)", "blob:x", "dist\\index.html", "dist/..\\..\\x.html", "C:\\dist\\index.html", "dist/index.html\u0000.txt", "source/index.html", "index.html"]) {
      expect(validateSmartSimManifest(manifestOf({ entry })).issues.map(i => i.code), entry).toContain("ENTRY_UNSAFE");
    }
    expect(validateSmartSimManifest(null).ok).toBe(false); expect(validateSmartSimManifest("{}").ok).toBe(false);
  });
});

describe("S4 / S5 / S6 — package acceptance", () => {
  it("S4 accepts the minimal Vanilla single-file package (manifest + dist/index.html) and reports a structured result", () => {
    const r = validateSmartSimPackage(vanillaPackage());
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(r.manifest.packageId).toBe("counter-sim"); expect(r.packageHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.fileCount).toBe(2); expect(r.compressedBytes).toBeGreaterThan(0); expect(r.uncompressedBytes).toBeGreaterThan(r.fileCount);
    expect(r.files.map(f => f.path).sort()).toEqual(["dist/index.html", "manifest.json"]);
    expect(r.files.find(f => f.path === "dist/index.html").contentType).toBe("text/html; charset=utf-8");
    expect(r.externalResources).toEqual([]); expect(r.selfContained).toBe(true);
  });
  it("S5 accepts a prebuilt React/Vite dist package; source/ and README are ignored (never persisted, never served)", () => {
    const r = validateSmartSimPackage(reactDistPackage());
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(r.files.map(f => f.path).sort()).toEqual(["dist/assets/index-abc123.css", "dist/assets/index-abc123.js", "dist/index.html", "manifest.json"]);
    expect(r.files.some(f => f.path.startsWith("source/"))).toBe(false);
    expect(r.ignoredPaths).toEqual(expect.arrayContaining(["source/src/App.tsx", "README.md"]));
    expect(r.issues.some(i => i.code === "SOURCE_IGNORED" && i.severity === "warning")).toBe(true);
  });
  it("S6 rejects a source-only React/TypeScript project (no executable dist): ENTRY_MISSING, never a build attempt", () => {
    const r = validateSmartSimPackage(sourceOnlyPackage());
    expect(r.ok).toBe(false); expect(has(r, "ENTRY_MISSING")).toBe(true);
  });
});

describe("S3 / S7–S14 — ZIP safety", () => {
  it("S3 rejects non-ZIP bytes regardless of name / declared type (magic + structure), and a ZIP with a garbage prefix", () => {
    expect(has(validateSmartSimPackage(Buffer.from("<html>not a zip</html>")), "INVALID_ZIP")).toBe(true);
    expect(has(validateSmartSimPackage(Buffer.from("PK\u0003\u0004garbage")), "INVALID_ZIP")).toBe(true);
    expect(has(validateSmartSimPackage(Buffer.alloc(0)), "INVALID_ZIP")).toBe(true);
  });
  it("S7 rejects path traversal entries (../, dist/../../x, backslash variants)", () => {
    for (const name of ["../evil.html", "dist/../../evil.html", "dist/..\\evil.html", "..\\evil.js", "dist/sub/../../../etc/passwd"]) {
      const r = validateSmartSimPackage(vanillaPackage({}, [{ name, data: "x" }]));
      expect(has(r, "PATH_TRAVERSAL"), name).toBe(true);
    }
  });
  it("S8 rejects absolute Unix / Windows drive / UNC paths and NUL bytes", () => {
    for (const name of ["/etc/passwd", "C:\\Windows\\x.js", "C:/x.js", "\\\\server\\share\\x.js", "dist/a\u0000.html"]) {
      const r = validateSmartSimPackage(vanillaPackage({}, [{ name, data: "x" }]));
      expect(has(r, "PATH_TRAVERSAL") || has(r, "UNSUPPORTED_FILE_TYPE"), name).toBe(true);
      expect(r.ok, name).toBe(false);
    }
  });
  it("S9 rejects symbolic-link entries", () => {
    const r = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/link.js", data: "../../etc/passwd", symlink: true }]));
    expect(has(r, "SYMLINK_NOT_ALLOWED")).toBe(true);
  });
  it("S10 rejects an oversized archive without reading it", () => {
    const r = validateSmartSimPackage(Buffer.alloc(SMARTSIM_LIMITS.maxArchiveBytes + 1, 0x50), { limits: SMARTSIM_LIMITS });
    expect(has(r, "ARCHIVE_TOO_LARGE")).toBe(true);
  });
  it("S11 rejects an oversized expanded package (declared AND actual sizes; a bomb-like ratio; a size lie)", () => {
    const limits = { ...SMARTSIM_LIMITS, maxUncompressedBytes: 200_000, maxFileBytes: 150_000, maxCompressionRatio: 50 };
    const big = Buffer.alloc(180_000, 0x41);
    const r1 = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/big.js", data: big }]), { limits });
    expect(has(r1, "FILE_TOO_LARGE") || has(r1, "ZIP_BOMB"), codes(r1).join()).toBe(true);
    const r2 = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/a.js", data: Buffer.alloc(120_000, 0x41) }, { name: "dist/b.js", data: Buffer.alloc(120_000, 0x42) }]), { limits });
    expect(has(r2, "PACKAGE_TOO_LARGE") || has(r2, "ZIP_BOMB"), codes(r2).join()).toBe(true);
    // a lie: declares 10 bytes but inflates to 120 KB → the bounded inflater refuses, never trusting the header
    const r3 = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/lie.js", data: Buffer.alloc(120_000, 0x41), uncompressedSizeOverride: 10 }]), { limits: { ...limits, maxFileBytes: 100_000 } });
    expect(r3.ok).toBe(false); expect(has(r3, "ZIP_BOMB") || has(r3, "FILE_TOO_LARGE") || has(r3, "INVALID_ZIP"), codes(r3).join()).toBe(true);
    // a highly compressible blob beyond the ratio bound
    const r4 = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/z.js", data: Buffer.alloc(140_000, 0x20) }]), { limits: { ...limits, maxCompressionRatio: 20, maxFileBytes: 1_000_000, maxUncompressedBytes: 1_000_000 } });
    expect(has(r4, "ZIP_BOMB"), codes(r4).join()).toBe(true);
    // a bomb-like member HIDDEN next to a large incompressible member: the archive-wide ratio stays ordinary (~1.7×), so only the
    // per-member ratio check can catch it (SM5 mutation kills)
    const noise = Buffer.alloc(200_000); for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761 + 12345) >>> 24;
    const r5 = validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/noise.png", data: noise, method: 0 }, { name: "dist/z.js", data: Buffer.alloc(140_000, 0x20) }]), { limits: { ...limits, maxCompressionRatio: 20, maxFileBytes: 1_000_000, maxUncompressedBytes: 1_000_000 } });
    expect(has(r5, "ZIP_BOMB"), codes(r5).join()).toBe(true);
    expect(r5.compressedBytes).toBeGreaterThan(150_000);
  });
  it("S12 rejects too many files", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: "dist/f" + i + ".js", data: "x" }));
    const r = validateSmartSimPackage(vanillaPackage({}, many), { limits: { ...SMARTSIM_LIMITS, maxFileCount: 20 } });
    expect(has(r, "TOO_MANY_FILES")).toBe(true);
  });
  it("S13 rejects duplicate normalized paths (exact duplicates, ./ prefixes and case collisions)", () => {
    expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/index.html", data: "<html></html>" }])), "DUPLICATE_PATH")).toBe(true);
    expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name: "./dist/index.html", data: "<html></html>" }])), "DUPLICATE_PATH")).toBe(true);
    expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/Index.html", data: "<html></html>" }])), "DUPLICATE_PATH")).toBe(true);
  });
  it("S14 rejects a package without manifest.json at the root (a nested manifest does not count) and an invalid manifest", () => {
    expect(has(validateSmartSimPackage(writeZip([{ name: "dist/index.html", data: VANILLA_INDEX }, { name: "dist/manifest.json", data: JSON.stringify(manifestOf()) }])), "MANIFEST_MISSING")).toBe(true);
    expect(has(validateSmartSimPackage(writeZip([{ name: "manifest.json", data: "{not json" }, { name: "dist/index.html", data: VANILLA_INDEX }])), "MANIFEST_INVALID")).toBe(true);
    expect(has(validateSmartSimPackage(vanillaPackage({ schemaVersion: 3 })), "MANIFEST_INVALID")).toBe(true);
  });
  it("S16 rejects an entry outside dist / a missing entry file / a non-HTML entry", () => {
    expect(has(validateSmartSimPackage(vanillaPackage({ entry: "dist/app.html" })), "ENTRY_MISSING")).toBe(true);
    expect(has(validateSmartSimPackage(writeZip([{ name: "manifest.json", data: JSON.stringify(manifestOf({ entry: "dist/app.js" })) }, { name: "dist/app.js", data: "1" }, { name: "dist/index.html", data: VANILLA_INDEX }])), "ENTRY_NOT_HTML")).toBe(true);
    expect(has(validateSmartSimPackage(vanillaPackage({ entry: "index.html" })), "MANIFEST_INVALID") || has(validateSmartSimPackage(vanillaPackage({ entry: "index.html" })), "ENTRY_OUTSIDE_DIST")).toBe(true);
  });
  it("nested archives and executable / unknown file types are rejected; the allow-list is explicit", () => {
    expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/inner.zip", data: vanillaPackage() }])), "NESTED_ARCHIVE")).toBe(true);
    expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name: "dist/inner.smartsim", data: vanillaPackage() }])), "NESTED_ARCHIVE")).toBe(true);
    for (const name of ["dist/run.exe", "dist/lib.dll", "dist/lib.so", "dist/run.sh", "dist/x.bat", "dist/x.ps1", "dist/x.jar", "dist/x.py", "dist/x.php", "dist/x.wasm", "dist/noext"]) {
      expect(has(validateSmartSimPackage(vanillaPackage({}, [{ name, data: "x" }])), "UNSUPPORTED_FILE_TYPE"), name).toBe(true);
    }
    for (const ext of [".html", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff2", ".txt"]) expect(ALLOWED_PACKAGE_EXTENSIONS).toContain(ext);
    for (const ext of [".exe", ".wasm", ".sh", ".php"]) expect(ALLOWED_PACKAGE_EXTENSIONS).not.toContain(ext);
    expect(contentTypeFor("dist/a.js")).toMatch(/javascript/); expect(contentTypeFor("dist/a.css")).toBe("text/css; charset=utf-8"); expect(contentTypeFor("dist/a.svg")).toBe("image/svg+xml"); expect(contentTypeFor("dist/a.wasm")).toBeNull();
  });
});

describe("S17 — external resources are rejected (defense in depth before the sandbox / CSP)", () => {
  const withIndex = html => writeZip([{ name: "manifest.json", data: JSON.stringify(manifestOf()) }, { name: "dist/index.html", data: html }]);
  it("external script / stylesheet / image / fetch / WebSocket / EventSource / base href are blocking EXTERNAL_RESOURCE issues with the offending path", () => {
    const cases = [
      `<html><head><script src="https://cdn.example/x.js"></script></head><body></body></html>`,
      `<html><head><link rel="stylesheet" href="https://cdn.example/x.css"></head><body></body></html>`,
      `<html><body><img src="http://img.example/a.png"></body></html>`,
      `<html><body><script>fetch("https://api.example/data")</script></body></html>`,
      `<html><body><script>new WebSocket("wss://x.example")</script></body></html>`,
      `<html><body><script>new EventSource("/events")</script></body></html>`,
      `<html><head><base href="https://evil.example/"></head><body></body></html>`,
      `<html><body><iframe src="https://evil.example/"></iframe></body></html>`,
      `<html><body><script src="//cdn.example/x.js"></script></body></html>`
    ];
    for (const html of cases) {
      const r = validateSmartSimPackage(withIndex(html));
      expect(has(r, "EXTERNAL_RESOURCE"), html).toBe(true);
      expect(r.issues.find(i => i.code === "EXTERNAL_RESOURCE").path).toBe("dist/index.html");
      expect(r.selfContained).toBe(false);
    }
  });
  it("relative package-local assets, data: images and protocol-free text are fine; an external URL inside a JS asset is caught too", () => {
    expect(validateSmartSimPackage(reactDistPackage()).externalResources).toEqual([]);
    expect(validateSmartSimPackage(withIndex(`<html><body><img src="data:image/png;base64,iVBORw0KGgo="><img src="./assets/a.png"><p>see https://example.com in text</p></body></html>`)).ok).toBe(true);
    const r = validateSmartSimPackage(writeZip([{ name: "manifest.json", data: JSON.stringify(manifestOf()) }, { name: "dist/index.html", data: `<html><body><script src="./a.js"></script></body></html>` }, { name: "dist/a.js", data: `fetch("https://telemetry.example/x")` }]));
    expect(has(r, "EXTERNAL_RESOURCE")).toBe(true); expect(r.issues.find(i => i.code === "EXTERNAL_RESOURCE").path).toBe("dist/a.js");
  });
});

describe("hash and determinism", () => {
  it("the packageHash is the SHA-256 of the exact uploaded bytes (never client-supplied); identical bytes → identical hash; one changed byte → different hash", () => {
    const a = vanillaPackage(), b = vanillaPackage(), c = vanillaPackage({ description: "Counts clicks!" });
    expect(validateSmartSimPackage(a).packageHash).toBe(validateSmartSimPackage(b).packageHash);
    expect(validateSmartSimPackage(a).packageHash).not.toBe(validateSmartSimPackage(c).packageHash);
    const deflated = zlib.deflateRawSync(Buffer.from("x")); expect(deflated.length).toBeGreaterThan(0);
  });
});
