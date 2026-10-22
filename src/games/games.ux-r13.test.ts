// UX-R13 — the games pages in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R13). Presentation only: game
// rules, scores, timers, sessions and stored values are pinned by the games suites (catalog, card, number conversion, live
// challenge). These guards pin the UX-R13 block at the end of games.css (scoped, token-only, the mode tags and edge untouched)
// and the two fixes: the monospace token is defined (the room code read an undefined --eb-font-mono and fell back to the body
// font), and the teacher shell's game views no longer paint the student portal's gradient band.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const gamesSrc = read("games", "games.css"), tokens = strip(read("design-tokens.css"));
const block = strip(gamesSrc.slice(gamesSrc.lastIndexOf("/*", gamesSrc.indexOf("UX-R13"))));
/** The declarations of the rule whose selector list is exactly `sel` (at a line start) inside the block. */
const rule = (sel: string) => {
  const m = block.match(new RegExp("\\n" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = block.indexOf(m![0]) + m![0].length;
  return block.slice(i, block.indexOf("}", i)).trim();
};

describe("UX-R13 — the fixes", () => {
  it("--eb-font-mono is defined once in design-tokens.css, as a monospace stack ending in the generic family", () => {
    const defs = [...tokens.matchAll(/--eb-font-mono:\s*([^;]+);/g)].map(m => m[1]);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatch(/^ui-monospace,.*\bmonospace$/);
    expect(strip(gamesSrc)).toMatch(/\.eb-lc-code-input\{ font-family:var\(--eb-font-mono\);/);
  });

  it("inside the teacher shell a game view drops the student portal's background and full-screen height", () => {
    expect(rule(".eb-shell-content .eb-games-surface")).toBe("background:transparent; min-height:0;");
    // the student destination itself keeps its surface (the rule is scoped to the teacher shell's content)
    expect(strip(gamesSrc)).toMatch(/\.eb-games-surface\{ display:flex;[^}]*min-height:100dvh; \}/);
  });
});

describe("UX-R13 — the block itself", () => {
  it("is the last thing in games.css and appears once", () => {
    expect(gamesSrc.indexOf("UX-R13")).toBe(gamesSrc.lastIndexOf("UX-R13"));
    expect(gamesSrc.indexOf("UX-R13")).toBeGreaterThan(gamesSrc.indexOf("/* ---------- Live Challenge Generator"));
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
  });

  it("scopes every rule to the games classes and keeps the mode tags and the restrained mode edge", () => {
    const sels = (block.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    expect(sels.length).toBeGreaterThan(10);
    for (const s of sels) expect(s).toMatch(/^\.eb-(game-card|ncgame|ncb|lc)\b|^\.eb-shell-content \.eb-games-surface$/);
    expect(block).not.toMatch(/is-mode-|eb-game-mode|eb-game-soon|eb-status-badge/);
  });
});

describe("UX-R13 — the pages", () => {
  it("game cards are flat 8 px cards with a quiet action (one dark button per card otherwise)", () => {
    expect(rule(".eb-game-card")).toBe("border-radius:var(--eb-r);");
    expect(rule(".eb-game-card .eb-game-card-action.eb-button.is-primary")).toBe("background:var(--eb-surface); border-color:var(--eb-line-2); color:var(--eb-text-heading);");
  });

  it("the game panels take the 8 px radius and the live-challenge cards lose their shadow and 3 px primary rule", () => {
    expect(rule(".eb-ncgame-path, .eb-ncgame-answer, .eb-lc-card, .eb-lc-saved-item, .eb-lc-exam-card, .eb-lc-file")).toBe("border-radius:var(--eb-r);");
    expect(rule(".eb-ncb")).toBe("border-radius:var(--eb-r);");
    expect(rule(".eb-lc-card")).toBe("box-shadow:none;");
    expect(rule(".eb-lc-headcard")).toBe("border-block-start:1px solid var(--eb-line);");
  });

  it("the selected path, assistance level and question source read as the grey pill", () => {
    expect(rule(".eb-ncgame-path.is-selected")).toBe("background:var(--eb-chrome-active); border-color:var(--eb-text-heading);");
    expect(rule('.eb-ncgame-level-row .eb-chip-button[aria-pressed="true"]')).toBe("background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); font-weight:var(--eb-fw-bold);");
    expect(rule('.eb-lc-srcswitch-btn[aria-pressed="true"]')).toBe("background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); box-shadow:none;");
  });

  it("white text on the primary and success fills names the surface token (no colour change)", () => {
    const css = strip(gamesSrc);
    expect(css).not.toMatch(/color:#fff(?![0-9a-fA-F])/);
    expect(css).toContain(".eb-ncb-bit.is-on{ background:var(--eb-primary); border-color:var(--eb-primary); color:var(--eb-surface); }");
  });
});
