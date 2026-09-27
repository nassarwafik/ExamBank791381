// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 10A — login hero redesign, brand icon refresh, reports spacing polish.
//  • BrandMark: one shared SVG mark (decorative, sized by prop, unique gradient id per instance, tile optional).
//  • Icon set: favicon.svg + public/pwa PNGs carry the SAME artwork; index.html links the SVG and a 32px PNG fallback;
//    the manifest keeps its four icons; every PNG is real, of the declared size and under the 6A size budget.
//  • Brand mark wiring: the teacher sidebar, the student top bar and the login hero render BrandMark — no "EB" text tile.
//  • Login hero: masked (fading) constellation, brand row, kicker / headline / lead / three points, the two role chips
//    (their accessible text unchanged), the form untouched; CSS stays RTL-safe, no animation added, phone banner compact.
//  (Reports spacing is guarded structurally in shell/sidebarContentSpacing.guards.test.ts.)
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import BrandMark from "./ui/BrandMark";
import App from "./App";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const png = (rel: string) => { const b = readFileSync(resolve(ROOT, rel)); expect(b.subarray(1, 4).toString()).toBe("PNG"); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BrandMark", () => {
  it("is decorative, sized by prop, and two instances never share a gradient id", () => {
    const { container } = render(<div><BrandMark size={36} /><BrandMark size={52} rounded={false} className="x" /></div>);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
    for (const s of svgs) { expect(s.getAttribute("aria-hidden")).toBe("true"); expect(s.getAttribute("focusable")).toBe("false"); expect(s.getAttribute("viewBox")).toBe("0 0 512 512"); }
    expect(svgs[0].getAttribute("width")).toBe("36"); expect(svgs[1].getAttribute("height")).toBe("52");
    expect(svgs[1].getAttribute("class")).toBe("x");
    const tiles = container.querySelectorAll("rect[width='512']");
    expect(tiles[0].getAttribute("rx")).toBe("112"); expect(tiles[1].getAttribute("rx")).toBe("0");
    const ids = Array.from(container.querySelectorAll("linearGradient")).map(g => g.id);
    expect(new Set(ids).size).toBe(2);
    expect(tiles[0].getAttribute("fill")).toBe("url(#" + ids[0] + ")"); expect(tiles[1].getAttribute("fill")).toBe("url(#" + ids[1] + ")");
    expect(container.querySelectorAll("circle").length).toBe(8);                                      // (three nodes + one satellite) × 2 marks
    expect(container.querySelectorAll("rect[rx='24']").length).toBe(6);                                // three bars per mark
    expect(container.textContent).toBe("");                                                            // no "EB" text
  });
});

describe("icon set + wiring", () => {
  it("favicon.svg carries the BrandMark artwork (tile, three bars, four nodes) and index.html links it plus a 32px PNG fallback", () => {
    const svg = read("public/favicon.svg");
    expect(svg).toContain('rx="112"');
    expect((svg.match(/<rect x="198" /g) || []).length).toBe(3);
    expect((svg.match(/<circle /g) || []).length).toBe(4);
    expect(svg).not.toMatch(/EB|<text/);
    const html = read("index.html");
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/pwa/favicon-32.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png" />');
  });
  it("public/pwa holds the full refreshed set at the declared sizes, each under the 6A budget; the manifest still lists its four icons", () => {
    const want: Record<string, number> = { "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-192.png": 192, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180, "favicon-32.png": 32 };
    for (const [name, size] of Object.entries(want)) {
      const p = png("public/pwa/" + name);
      expect([p.w, p.h], name).toEqual([size, size]);
      expect(p.bytes, name).toBeLessThan(20000);
    }
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(["pwa/icon-192.png", "pwa/icon-512.png", "pwa/icon-maskable-192.png", "pwa/icon-maskable-512.png"]);
    for (const i of manifest.icons) expect(existsSync(resolve(ROOT, "public", i.src))).toBe(true);
  });
  it("the teacher sidebar, the student top bar and the login hero render BrandMark instead of an 'EB' text tile", () => {
    for (const f of ["src/shell/TeacherAppShell.tsx", "src/shell/StudentShell.tsx", "src/App.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("<BrandMark size={");
      expect(src, f).not.toMatch(/aria-hidden="true">EB</);
    }
    expect(read("src/shell.css")).toContain(".eb-brand-mark svg { display: block; width: 100%; height: 100%; }");
    expect(read("src/platform.css")).toContain(".student-logo svg { display: block; width: 100%; height: 100%; }");
  });
});

describe("login hero (Phase 10A)", () => {
  const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
  it("renders the redesigned hero around an UNCHANGED login form; the role chips keep their accessible text", async () => {
    globalThis.fetch = vi.fn(() => res(401, { ok: false })) as unknown as typeof fetch;
    render(<App />);
    const form = await screen.findByRole("heading", { level: 1, name: "ExamBank 791381" });
    expect(form).toBeTruthy();
    expect(document.querySelector("form.auth-form")).toBeTruthy();
    expect(document.querySelector('input[autocomplete="username"]')).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    const hero = document.querySelector(".auth-brand") as HTMLElement;
    expect(hero).toBeTruthy();
    expect(hero.querySelector(".auth-logo svg[aria-hidden='true']")).toBeTruthy();                     // BrandMark, decorative
    expect(hero.textContent).not.toMatch(/\bEB\b/);
    const net = hero.querySelector("svg.auth-net") as SVGSVGElement;
    expect(net.getAttribute("aria-hidden")).toBe("true");
    expect(net.querySelector("mask")).toBeTruthy();                                                    // the constellation fades out
    expect(net.querySelector("g[mask]")).toBeTruthy();
    expect(net.querySelectorAll("path").length).toBeGreaterThanOrEqual(5);
    expect(within(hero).getByRole("heading", { level: 2, name: "منصة الامتحانات والتدريب الذكي لشبكات الاتصال" })).toBeTruthy();
    expect(hero.querySelector(".auth-kicker")!.textContent).toContain("شبكات الاتصال");
    expect(hero.querySelector(".auth-lead")!.textContent).toContain("في مساحة واحدة");
    const points = within(hero).getByRole("list", { name: "ما تقدّمه المنصة" });
    expect(within(points).getAllByRole("listitem").length).toBe(3);
    expect(points.querySelectorAll("svg[aria-hidden='true']").length).toBe(3);
    const note = hero.querySelector(".login-role-note") as HTMLElement;
    expect(note.textContent?.replace(/\s+/g, " ").trim()).toBe("معلم طالب");                          // UX-8b contract kept
    expect(note.querySelectorAll('svg[aria-hidden="true"]').length).toBe(2);
    expect(hero.querySelector(".auth-brand-foot")).toBeNull();                                         // nothing pinned to the bottom edge
  });
  it("CSS: hero clips its illustration, uses logical/RTL-safe properties, adds no animation, and collapses to a compact banner on phones", () => {
    const css = read("src/login-pro.css");
    const norm = css.replace(/\s+/g, "");
    expect(norm).toContain(".auth-brand{position:relative;overflow:hidden;");
    expect(norm).toContain(".auth-net{position:absolute;inset-block-start:0;inset-inline:0;width:100%;height:auto;pointer-events:none;");
    expect(read("src/App.tsx")).not.toContain("preserveAspectRatio=");                                  // the bundle guard's lazy-visual signature must stay out of the initial chunk
    expect(norm).toContain(".auth-brand>:not(.auth-net){position:relative;z-index:1;}");
    expect(norm).toContain(".auth-brand.auth-features.login-role-note{display:flex;flex-wrap:wrap;");            // pills, not bars
    expect(norm).toContain(".auth-brand.login-role-note.auth-feature{display:inline-flex;");
    expect(norm).toContain("@media(max-width:900px){.auth{grid-template-columns:1fr;}");
    expect(norm).toContain(".auth-kicker,.auth-points,.auth-brand.auth-features.login-role-note{display:none;}");
    expect(css).not.toMatch(/(?:margin|padding)-(?:left|right)\s*:/);
    expect(css).not.toMatch(/\b(?:left|right)\s*:/);
    expect((css.match(/@keyframes/g) || []).length).toBe(1);                                            // only the pre-existing card fade-in
    expect(css).not.toMatch(/\.auth-(?:brand|net|hero|points|kicker)[^{]*\{[^}]*animation/);
  });
});
