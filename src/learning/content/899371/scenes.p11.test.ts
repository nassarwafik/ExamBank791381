// 899371 enrichment P11 (docs/enterprise-899371-enrichment-plan.md §3.1, §8) — the animated scenes (animation / csharp-scene / v1):
//   • WHICH and WHERE: the scenes of the served course are exactly the work list's scenes of the chapters done so far (P10 SCENES, D6),
//     each on its summary page, right after the book block it explains (and anything already attached to that block), never inside the
//     book's own blocks (the book lock is untouched: bookLock.test.ts);
//   • WHAT: each block is the authored scene as data (scenes/mNN.json), teacher-enrichment, labelled «مشهد متحرك: …», and it reads back
//     through the engine's own strict validator into 4–24 steps, each with a sentence; the description is there;
//   • the style guide's rules that data can break: code in a sentence is marked (`…`), no step is silent.
import { describe, it, expect } from "vitest";
import manifest from "./manifest";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule } from "../types";
import { readSceneConfig, SCENE_LIMITS } from "../../activities/csharpScene";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { readScenes, sceneBlock, addScenes, SCENE_TITLE } from "../../../../scripts/convert-899371.mjs";
// @ts-expect-error — plain ESM tools shared with the P10 work list; untyped on purpose.
import { SCENES } from "../../../../scripts/build-899371-enrichment-worklist.mjs";

const CID = "899371";
const DONE = ["m01", "m02", "m03", "m04"];   // P11: chapters 1–4 (P12 adds 5–11)
type Anim = Extract<ContentBlock, { type: "animation" }>;
type Authored = { module: string; id: string; page: string; after: string; title: string; config: { alt: string; steps: { say: string }[] } };
const authored = readScenes() as Authored[];
const planned = (SCENES as { id: string; chapter: string; pageId: string }[]).filter(s => DONE.includes(s.chapter));

async function served() {
  const out: { page: string; blocks: ContentBlock[]; block: Anim; at: number }[] = [];
  for (const m of manifest.modules) {
    const mod = (await loadBundledModuleContent(CID, m.id)) as ContentModule;
    for (const l of mod.lessons) for (const p of l.pages) p.blocks.forEach((b, at) => {
      if (b.type === "animation" && (b as Anim).animationType === "csharp-scene") out.push({ page: p.id, blocks: p.blocks, block: b as Anim, at });
    });
  }
  return out;
}

describe("899371 P11 — the animated scenes", () => {
  it("are exactly the work list's scenes of chapters 1–4, in its order, each on the summary page it names", async () => {
    expect(planned).toHaveLength(12);
    expect(authored.map(s => [s.id, s.module, `${CID}-${s.module}-l01-${s.page}`])).toEqual(planned.map(s => [s.id, s.chapter, s.pageId]));
    const all = await served();
    // (in page order: on a page, a scene anchored earlier comes first)
    const key = (x: string[]) => x.join(" ");
    expect(all.map(x => key([x.block.id, x.page])).sort()).toEqual(authored.map(s => key([`${s.module}-l01-${s.page}-scene-${s.id.slice(4)}`, `${CID}-${s.module}-l01-${s.page}`])).sort());
    expect(all).toHaveLength(12);
  });

  it("each sits right after the book block it explains (after anything already attached to it), never between book blocks it splits", async () => {
    const all = await served();
    for (const s of authored) {
      const x = all.find(a => a.block.id.endsWith("-scene-" + s.id.slice(4)))!;
      const anchor = x.blocks.findIndex(b => b.id === s.after);
      expect(anchor, s.id).toBeGreaterThanOrEqual(0);
      expect(x.blocks[anchor].origin, s.id).toBe("book");
      expect(x.at, s.id).toBeGreaterThan(anchor);
      for (const b of x.blocks.slice(anchor + 1, x.at)) expect(b.origin, s.id + " / " + b.id).toBe("teacher-enrichment");
    }
  });

  it("each block is the authored scene as data: enrichment, «مشهد متحرك: …», the engine's identity and controls", async () => {
    for (const x of await served()) {
      const s = authored.find(a => x.block.id.endsWith("-scene-" + a.id.slice(4)))!;
      expect(x.block).toEqual(sceneBlock(s));
      expect([x.block.origin, x.block.version, x.block.title]).toEqual(["teacher-enrichment", 1, SCENE_TITLE + ": " + s.title]);
      expect(x.block.capabilities).toEqual({ fullscreen: true, reset: true, animated: true, interactive: true });
    }
  });

  it("each reads back through the engine's validator: a description, 4–24 steps, a sentence on every step, code marked in pairs", async () => {
    for (const x of await served()) {
      const c = readSceneConfig(x.block.config);
      expect(c, x.block.id).not.toBeNull();
      expect(c!.alt.trim().length, x.block.id).toBeGreaterThan(20);
      expect(c!.frames.length, x.block.id).toBeGreaterThanOrEqual(4);
      expect(c!.frames.length, x.block.id).toBeLessThanOrEqual(SCENE_LIMITS.steps);
      for (const say of c!.says) {
        expect(say.trim().length, x.block.id).toBeGreaterThan(3);
        expect((say.split("`").length - 1) % 2, x.block.id + ": " + say).toBe(0);
        // a C# call or operator written bare in an Arabic sentence would reorder; it must sit inside `…`
        expect(say.replace(/`[^`]*`/g, ""), x.block.id + ": " + say).not.toMatch(/[A-Za-z]+\.[A-Za-z]+\(|[A-Za-z_]\w*\s*(==|>=|<=|&&|\|\||\+=)\s*\w/);
      }
    }
  });

  it("the converter refuses a scene it cannot place faithfully: no page, an anchor that is not a book block, a bad or repeated id", () => {
    const page = () => ({ id: CID + "-m01-l01-p02", blocks: [
      { id: "m01-l01-p02-b01", origin: "book" }, { id: "m01-l01-p02-b01-clarify", origin: "teacher-enrichment" }, { id: "m01-l01-p02-b02", origin: "book" }] });
    const mods = () => [{ lessons: [{ pages: [page()] }] }];
    const s = (over: Record<string, unknown>) => ({ module: "m01", id: "m01-x", page: "p02", after: "m01-l01-p02-b01", title: "x", config: {}, ...over });
    const placed = mods();
    addScenes(placed, [s({})]);
    // after the anchor AND the clarification attached to it, before the next book block
    expect(placed[0].lessons[0].pages[0].blocks.map(b => b.id)).toEqual(["m01-l01-p02-b01", "m01-l01-p02-b01-clarify", "m01-l01-p02-scene-x", "m01-l01-p02-b02"]);
    expect(() => addScenes(mods(), [s({ page: "p09" })])).toThrow(/no page/);
    expect(() => addScenes(mods(), [s({ after: "m01-l01-p02-b01-clarify" })])).toThrow(/not a book block/);
    expect(() => addScenes(mods(), [s({ after: "m01-l01-p02-b77" })])).toThrow(/not a book block/);
    expect(() => addScenes(mods(), [s({ id: "m02-x" })])).toThrow(/bad or duplicate id/);
    expect(() => addScenes(mods(), [s({}), s({})])).toThrow(/bad or duplicate id/);
  });
});
