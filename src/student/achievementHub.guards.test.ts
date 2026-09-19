// Structural guards for the new surfaces' CSS (Achievement Hub tiles, project cards / hero / circle, photo field,
// teacher identity): token-only spacing, no fixed pixel widths on flexible surfaces (no horizontal overflow at
// 360–430px), responsive breakpoints present, and the project rank uses the SAME six artworks (no new image set).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
const rule = (css: string, selector: string) => { const i = css.indexOf(selector + "{"); const j = css.indexOf("}", i); return i < 0 ? "" : css.slice(i, j).replace(/\s+/g, ""); };

describe("Achievement Hub + project performance CSS", () => {
  const portal = read("studentportal-pro.css"), perf = read("projects/performance.css");
  it("recognition tiles are a 3-column grid with min-width:0 (no overflow) and token gaps; project cards go single-column first", () => {
    expect(rule(portal, ".eb-sp-recognition")).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(rule(portal, ".eb-sp-recognition")).toContain("min-width:0");
    expect(rule(portal, ".eb-sp-project-cards")).toContain("grid-template-columns:1fr");
    expect(portal).toMatch(/@media \(min-width: 768px\)\{[\s\S]*\.eb-sp-project-cards\{ grid-template-columns:repeat\(auto-fill, minmax\(280px, 1fr\)\)/);
  });
  it("the hero / circle / stage-score rules use tokens only and no fixed widths beyond the circle's own size prop; the hero becomes a row from 768px", () => {
    expect(perf.replace(/@media[^{]*\{/g, "")).not.toMatch(/(^|[^-])width:\s*\d{3,}px/);
    expect(perf).toMatch(/@media \(min-width: 768px\)\{[\s\S]*\.eb-prh\{ flex-direction:row/);
    expect(rule(perf, ".eb-prh")).toContain("min-width:0");
    for (const m of perf.matchAll(/var\(--([a-z0-9-]+)\)/g)) expect(m[1].startsWith("eb-"), m[1]).toBe(true);
  });
  it("the project rank reuses the six existing rank images — no new artwork files", () => {
    const assets = readdirSync(path.join(process.cwd(), "src", "assets", "student-ranks")).filter(f => /^rank-/.test(f)).sort();
    expect(assets).toEqual(["rank-beginner.png", "rank-bronze.png", "rank-diamond.png", "rank-gold.png", "rank-legendary.png", "rank-silver.png"]);
    expect(read("projects/projectPerformance.ts")).toContain("RANK_VISUALS");
    expect(read("projects/projectPerformance.ts")).not.toMatch(/\.png|\.svg|\.webp/);
  });
});

describe("identity / photo CSS", () => {
  it("the sidebar identity hides the name on the compact rail and the tablet rail; the photo field and dialog use logical, token-based spacing", () => {
    const shell = read("shell.css"), parts = read("page-parts.css");
    expect(shell).toContain(".eb-shell.is-compact .eb-teacher-identity-name { display: none; }");
    expect(shell).toMatch(/@media \(min-width: 1024px\) and \(max-width: 1279px\) \{[\s\S]*\.eb-teacher-identity-name \{ display: none; \}/);
    expect(rule(parts, ".eb-student-photo")).toContain("gap:var(--eb-space-3)");
    expect(parts).not.toMatch(/\.eb-(student-photo|teacher-profile)[^{]*\{[^}]*(width|height):\s*\d{3,}px/);
    expect(rule(parts, ".eb-profile-avatar-img")).toContain("object-fit:cover");
  });
});
