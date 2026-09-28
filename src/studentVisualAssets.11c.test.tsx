// @vitest-environment happy-dom
// Phase 11C — the student rank / stage artwork is served from its SIZED derivatives: every rank and stage has all of
// them, each consumer asks for the size it actually displays, the chosen `src` is 2×-sharp, `srcSet` never offers a
// file larger than a 3× screen needs, no consumer reaches an owner master, and the accessibility of every image is
// unchanged (decorative badges stay alt="" + aria-hidden; the stage ring and project hero keep their meaningful alt).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { VISUAL_SIZES, visualImgProps, type VisualImageSet } from "./studentVisualSizes";
import { RANK_VISUALS } from "./studentRankVisuals";
import { STAGE_VISUALS, stageVisual } from "./studentStageVisuals";
import { RANK_ORDER } from "./studentRank";
import AchievementFeed from "./student/AchievementFeed";
import ProjectRankHero from "./projects/ProjectRankHero";
import type { FeedPost } from "./achievements";
import type { ProjectPerformance } from "./projects/types";

afterEach(cleanup);
const MASTER = /\/(?:rank-[a-z]+|stage-\d\d)\.png(?:[?#]|$)/;          // an owner master path (no size suffix)
const SET: VisualImageSet = { 48: "a48.png", 96: "a96.png", 144: "a144.png", 256: "a256.png" };
const candidates = (srcSet: string) => srcSet.split(", ").map(c => c.split(" ")[1]);

describe("visualImgProps — the derivative a display size receives", () => {
  it.each([
    // display px → src (covers 2×) and the srcSet candidates (from the 1× cover up to the 3× cover)
    [32, "a96.png", ["48w", "96w"]],
    [40, "a96.png", ["48w", "96w", "144w"]],
    [48, "a96.png", ["48w", "96w", "144w"]],
    [72, "a144.png", ["96w", "144w", "256w"]],
    [96, "a256.png", ["96w", "144w", "256w"]],
    [125, "a256.png", ["144w", "256w"]],
  ])("%i px → src %s, candidates %j", (px, src, cand) => {
    const p = visualImgProps(SET, px as number);
    expect(p.src).toBe(src);
    expect(candidates(p.srcSet)).toEqual(cand);
    expect(p.sizes).toBe(px + "px");
  });
  it("a responsive consumer passes its own `sizes`", () => {
    expect(visualImgProps(SET, 125, "(min-width: 768px) 125px, 98px").sizes).toBe("(min-width: 768px) 125px, 98px");
  });
});

describe("mapping — every rank and stage has every derivative, and none of them is a master", () => {
  it("6 ranks × 4 sizes and 25 stages × 4 sizes, all distinct non-master URLs", () => {
    const all = [...RANK_ORDER.map(t => RANK_VISUALS[t].images), ...STAGE_VISUALS.map(v => v.images)];
    expect(all).toHaveLength(31);
    const urls = all.flatMap(set => VISUAL_SIZES.map(s => set[s]));
    for (const u of urls) { expect(u, "missing derivative").toBeTruthy(); expect(u).not.toMatch(MASTER); }
    expect(new Set(urls).size).toBe(31 * VISUAL_SIZES.length);
  });
  it("each URL is the derivative of its own size (…-<size>.png)", () => {
    for (const set of [...Object.values(RANK_VISUALS).map(v => v.images), ...STAGE_VISUALS.map(v => v.images)])
      for (const s of VISUAL_SIZES) expect(set[s]).toMatch(new RegExp("-" + s + "(\\.|-)[^/]*png(\\?[^/]*)?$"));
  });
});

describe("consumers — the right derivative, never the master, accessibility unchanged", () => {
  const base = (p: Partial<FeedPost>): FeedPost => ({ postId: "x", studentId: "s", studentDisplayName: "كريم", assignmentId: "", assignmentTitle: "", tier: "gold", percent: 0, createdAt: "2026-01-01T00:00:00.000Z", reactionCounts: { heart: 0, clap: 0, cheer: 0, fire: 0 }, myReaction: null, teacherReaction: null, teacherNote: "", ...p } as FeedPost);
  const feedProps = { error: "", shareOn: true, shareSaving: false, now: Date.parse("2026-01-02T00:00:00.000Z"), onToggleShare: () => {}, onReact: vi.fn() };

  it("achievement feed (40 px): a legacy rank badge and a 25-stage badge get the 96 px derivative + 48/96/144 srcset; decorative alt/aria kept", () => {
    render(<AchievementFeed posts={[
      base({ postId: "r", eventType: "global_rank_up", rank: { tier: "diamond", level: 5, points: 2000 } } as Partial<FeedPost>),
      base({ postId: "s", eventType: "global_rank_up", stage: { stageNumber: 9 } } as unknown as Partial<FeedPost>),
    ]} {...feedProps} />);
    const imgs = [...document.querySelectorAll("img.eb-sp-feed-rank-art")] as HTMLImageElement[];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute("src")).not.toMatch(MASTER);
      expect(img.getAttribute("sizes")).toBe("40px");
      expect(candidates(img.getAttribute("srcset") || "")).toEqual(["48w", "96w", "144w"]);
      expect(img.getAttribute("alt")).toBe(""); expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("width")).toBe("40"); expect(img.getAttribute("height")).toBe("40");
    }
    expect(imgs[0].getAttribute("src")).toBe(RANK_VISUALS.diamond.images[96]);                     // legacy six-rank event
    expect(imgs[1].className).toContain("is-stage");
    expect(imgs[1].getAttribute("src")).toBe(stageVisual(9).images[96]);                           // 25-stage event
  });

  it("project rank hero: 96 px (256 src) and compact 72 px (144 src) with the meaningful alt unchanged", () => {
    const perf = { tier: "silver", level: 3, projectStrength: 210, maxStrength: 600, grade: 70, overallProgress: 50, nextTier: "gold" } as unknown as ProjectPerformance;
    const { unmount } = render(<ProjectRankHero title="AquaSense" performance={perf} />);
    let img = screen.getByRole("img", { name: "رتبة المشروع: نمر البرق — المستوى 3" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(RANK_VISUALS.silver.images[256]);
    expect(img.getAttribute("sizes")).toBe("96px"); expect(img.getAttribute("width")).toBe("96");
    unmount();
    render(<ProjectRankHero title="AquaSense" performance={perf} compact />);
    img = screen.getByRole("img", { name: "رتبة المشروع: نمر البرق — المستوى 3" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(RANK_VISUALS.silver.images[144]);
    expect(img.getAttribute("sizes")).toBe("72px"); expect(img.getAttribute("width")).toBe("72");
  });

  it("each production consumer asks for the size it displays (source pin: 32 teacher feed / dialog, 40 feed / next stage, 48 project card, 72|96 hero, ring 98–125)", () => {
    const RAW = import.meta.glob(["./TeacherDashboard.tsx", "./students/StudentDialog.tsx", "./student/AchievementFeed.tsx", "./student/StudentProgressSection.tsx", "./projects/StudentProjectPanel.tsx", "./projects/ProjectRankHero.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const calls = (f: string) => [...RAW[f].matchAll(/visualImgProps\(([^;]*?)\)\}/g)].map(m => m[1].replace(/\s+/g, " "));
    expect(calls("./TeacherDashboard.tsx").map(c => c.split(",").pop())).toEqual(["32", "32"]);
    expect(calls("./students/StudentDialog.tsx")).toEqual(["stage.images, 32"]);
    expect(calls("./student/AchievementFeed.tsx").map(c => c.split(",").pop()!.trim())).toEqual(["40", "40"]);
    expect(calls("./student/StudentProgressSection.tsx")).toEqual(['images, 125, "(min-width: 768px) 125px, 98px"', "stage.next.images, 40"]);
    expect(calls("./projects/StudentProjectPanel.tsx")).toEqual(["rank.images, 48"]);
    expect(calls("./projects/ProjectRankHero.tsx")).toEqual(["v.images, compact ? 72 : 96"]);
    for (const src of Object.values(RAW)) { expect(src).not.toMatch(/\.image\b(?!s)/); expect(src).not.toMatch(/assets\/student-(ranks|stages)\//); }
  });

  it("the 25-stage visual of any number resolves to sized files (clamped numbers too)", () => {
    for (const n of [0, 1, 9, 25, 99]) for (const s of VISUAL_SIZES) expect(stageVisual(n).images[s]).not.toMatch(MASTER);
  });
});
