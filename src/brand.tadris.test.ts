/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_NAME, BRAND_TAGLINE, BRAND_TITLE } from "./brand";

// BRAND-005 / PWA-006 — the Tadris+ identity contract: the visible product name is Tadris+ («التعليم المتكامل») on every
// surface the owner listed (tab, login, shells, install cards, offline page, manifest, Apple metadata); the approved artwork is
// the icon set at every size (real PNGs, declared sizes, RGBA tiles for `any`, opaque full-bleed for `maskable` / Apple); the
// maskable icons keep their content inside the circular safe zone (decoded pixel check, not a promise); and the PWA identity
// that existing installations depend on (id, start_url, scope, display, lang, dir) is byte-identical to the previous manifest,
// while the icon URLs carry a version query so launchers re-fetch the artwork.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const bytes = (rel: string) => readFileSync(resolve(ROOT, rel));

type Png = { w: number; h: number; colourType: number; rgba: (x: number, y: number) => [number, number, number, number] };
/** Minimal PNG decoder for the icon contract: 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA), all five filters. */
function decodePng(buf: Buffer): Png {
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], colourType = buf[25], interlace = buf[28];
  expect(depth).toBe(8); expect(interlace).toBe(0); expect([2, 6]).toContain(colourType);
  const bpp = colourType === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let p = 8; p < buf.length;) { const len = buf.readUInt32BE(p), type = buf.subarray(p + 4, p + 8).toString(); if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, prev = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0, b = y > 0 ? out[prev + i] : 0, c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0, x = raw[src + i];
      let v: number;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, colourType, rgba: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2], bpp === 4 ? out[o + 3] : 255]; } };
}
const NAVY = [3, 28, 64];
const isNavy = (p: number[]) => Math.abs(p[0] - NAVY[0]) <= 24 && Math.abs(p[1] - NAVY[1]) <= 24 && Math.abs(p[2] - NAVY[2]) <= 24;

describe("BRAND-005 — the visible product identity is Tadris+", () => {
  it("brand constants", () => {
    expect(BRAND_NAME).toBe("Tadris+");
    expect(BRAND_TAGLINE).toBe("التعليم المتكامل");
    expect(BRAND_TITLE).toBe("Tadris+ — التعليم المتكامل");
  });
  it("tab title, description, Apple title and theme colour", () => {
    const html = read("index.html");
    expect(html).toContain("<title>Tadris+ — التعليم المتكامل</title>");
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Tadris+" />');
    expect(html).toContain('<meta name="theme-color" content="#031c40" />');
    expect(html).toMatch(/<meta name="description" content="Tadris\+ — التعليم المتكامل[^"]*" \/>/);
    expect(html).not.toMatch(/ExamBank/);
  });
  it("no user-visible «ExamBank» remains on the listed surfaces (identifiers and comments excluded)", () => {
    const surfaces = ["src/App.tsx", "src/shell/TeacherAppShell.tsx", "src/shell/StudentShell.tsx", "src/pwa/InstallAppCard.tsx", "src/pwa/InstallAppEntry.tsx", "src/pwa/MessagePushCard.tsx", "src/pwa/installPrompt.ts", "src/pwa/InstallGuidanceViews.tsx", "src/meshModels/MeshModel3DView.tsx", "src/TeacherDashboard.tsx", "public/offline.html", "public/manifest.webmanifest"];
    for (const f of surfaces) {
      const code = read(f).split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n")
        .replace(/ExamBankPage/g, "").replace(/ExamBank791381-Recovery-V1/g, "").replace(/examBank[A-Za-z]*/g, "");
      expect(code, f).not.toMatch(/ExamBank/);
    }
    expect(read("src/shell/TeacherAppShell.tsx")).toContain('<bdi dir="ltr">{BRAND_NAME}</bdi><small>{BRAND_TAGLINE}</small>');   // LTR island: the "+" never flips in RTL
    expect(read("src/shell/StudentShell.tsx")).toContain('<h1><bdi dir="ltr">{BRAND_NAME}</bdi></h1>');
    expect(read("src/App.tsx")).toContain('<h1 className="auth-welcome"><bdi dir="ltr">{BRAND_NAME}</bdi></h1>');
    expect(read("public/offline.html")).toMatch(/Tadris\+ — التعليم المتكامل/);
  });
});

describe("PWA-006 — manifest identity and the approved icon set", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  it("visible names are Tadris+; the installed identity (id / start_url / scope / display / lang / dir) is unchanged for a safe upgrade", () => {
    expect(manifest).toMatchObject({ id: "./", start_url: "./", scope: "./", display: "standalone", lang: "ar", dir: "rtl", orientation: "any", name: "Tadris+", short_name: "Tadris+", theme_color: "#031c40", background_color: "#031c40", categories: ["education"] });
    expect(manifest.description).toContain("التعليم المتكامل");
    expect(JSON.stringify(manifest)).not.toMatch(/"\/|https?:|ExamBank/);
  });
  it("icon URLs carry the version query so existing installations re-fetch the artwork", () => {
    for (const i of manifest.icons) expect(i.src).toMatch(/^pwa\/icon-(maskable-)?(192|512)\.png\?v=tadris1$/);
    for (const href of ["/pwa/favicon-16.png?v=tadris1", "/pwa/favicon-32.png?v=tadris1", "/pwa/favicon-48.png?v=tadris1", "/pwa/icon-192.png?v=tadris1", "/pwa/apple-touch-icon.png?v=tadris1"]) expect(read("index.html")).toContain('href="' + href + '"');
    expect(read("src/ui/BrandMark.tsx")).toContain('BRAND_ICON_SRC = "/pwa/icon-192.png?v=tadris1"');
  });
  it("every icon is a real PNG of its declared size and kind: RGBA tiles with transparent corners for `any` / favicons, opaque navy full-bleed for maskable + Apple", () => {
    const any: [string, number][] = [["favicon-16.png", 16], ["favicon-32.png", 32], ["favicon-48.png", 48], ["icon-192.png", 192], ["icon-512.png", 512]];
    for (const [f, size] of any) {
      const p = decodePng(bytes("public/pwa/" + f));
      expect([p.w, p.h, p.colourType], f).toEqual([size, size, 6]);
      expect(p.rgba(0, 0)[3], f + " corner alpha").toBe(0);                                   // transparent outside the rounded tile
      expect(isNavy(p.rgba(Math.round(size / 2), Math.round(size * 0.1))), f + " tile is navy").toBe(true);
    }
    for (const [f, size] of [["icon-maskable-192.png", 192], ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]] as [string, number][]) {
      const p = decodePng(bytes("public/pwa/" + f));
      expect([p.w, p.h, p.colourType], f).toEqual([size, size, 2]);
      expect(isNavy(p.rgba(1, 1)), f + " full-bleed navy").toBe(true);
    }
    expect(bytes("public/pwa/icon-512.png").length).toBeLessThan(360000);
    expect(bytes("public/pwa/icon-192.png").length).toBeLessThan(96000);
    expect(bytes("public/pwa/tadris-logo-480.png").length).toBeLessThan(200000);
  });
  it("maskable icons keep every non-background pixel inside the circular safe zone (radius 40 %) — measured, not assumed", () => {
    for (const f of ["icon-maskable-192.png", "icon-maskable-512.png"]) {
      const p = decodePng(bytes("public/pwa/" + f));
      const c = p.w / 2, r = p.w * 0.4;
      let outside = 0, content = 0;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        if (isNavy(p.rgba(x, y))) continue;
        content++;
        if ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 > r * r) outside++;
      }
      expect(content, f + " has artwork").toBeGreaterThan(p.w * p.h * 0.1);
      expect(outside, f + " pixels outside the safe circle").toBe(0);
    }
  });
  it("the service worker precaches the rebranded offline page under a NEW cache version and keeps the push icon file", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain('const OFFLINE_CACHE = CACHE_PREFIX + "offline-v2";');
    expect(sw).toContain('"pwa/icon-192.png"');
    expect(read("public/offline.html")).toContain("يحتاج Tadris+ إلى اتصال بالإنترنت");
  });
});
