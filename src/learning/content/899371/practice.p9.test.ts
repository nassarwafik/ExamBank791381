// 899371 P9 (docs/enterprise-899371-learning-plan.md §22) — «كل تمرين مربوط بنص صفحته»: each of the 110 self-study exercises names
// the summary page of the book that teaches what it practises, and an ANCHOR — a word or a piece of code that must stand in that page's
// own book text. So the link is checked against the text, not trusted:
//   • every exercise has { pageId, anchor }; the page is a book page of a chapter's summary lesson (l01), never an exercise page;
//   • the anchor is in that page's BOOK blocks (the served body — what the Reader shows);
//   • the converter carries the link onto the exercise's served block (`reviewPageId`), and the content validator accepts it;
//   • the validator refuses a link to an unknown page or to an exercise page.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateLearningCourseContent } from "../validation";
import { cloneCourse } from "../content.fixtures";
import type { LearningCourseContent } from "../types";

const ROOT = process.cwd();
const PRACTICE = join(ROOT, "src/learning/content/899371/practice");
const SERVED = join(ROOT, "api/src/data/learning-content/899371");
type Item = { question: { kind: string }; review?: { pageId: string; anchor: string } };
type Block = { id: string; type: string; origin?: string; reviewPageId?: string };
type Page = { id: string; title: string; layout?: string; blocks: Block[] };
const modules = readdirSync(SERVED).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(join(SERVED, f), "utf8")) as { id: string; lessons: { id: string; pages: Page[] }[] });
const pages = new Map(modules.flatMap(m => m.lessons.flatMap(l => l.pages.map(p => [p.id, { ...p, lessonId: l.id }] as const))));
const bookText = (p: Page) => {
  const out: string[] = [];
  const walk = (o: unknown): void => { if (typeof o === "string") out.push(o); else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (!["id", "type", "origin", "dir", "language", "layout", "kind"].includes(k)) walk(v); };
  p.blocks.filter(b => b.origin === "book").forEach(walk);
  return out.join("\n");
};
const files = readdirSync(PRACTICE).filter(f => /^m\d\d\.json$/.test(f)).sort();
const items = files.flatMap(f => (JSON.parse(readFileSync(join(PRACTICE, f), "utf8")).items as Item[]).map((it, i) => ({ mid: f.slice(0, 3), i, it })));

describe("899371 P9 — every exercise is linked to its page's text", () => {
  it("110 exercises, each with a review page of a summary lesson and an anchor that stands in that page's book text", () => {
    expect(items).toHaveLength(110);
    for (const { mid, i, it } of items) {
      const where = mid + "." + i;
      expect(it.review, where).toBeDefined();
      const page = pages.get(it.review!.pageId);
      expect(page, where + " " + it.review!.pageId).toBeDefined();
      expect(page!.lessonId, where).toMatch(/^899371-m\d\d-l01$/);
      expect(page!.layout === "practice" || page!.layout === "opener", where).toBe(false);
      expect(it.review!.anchor.trim().length, where).toBeGreaterThan(0);
      expect(bookText(page!).includes(it.review!.anchor), where + " the anchor «" + it.review!.anchor + "» is in «" + page!.title + "»").toBe(true);
    }
  });
  it("the served exercise blocks carry exactly the authored links, in order", () => {
    const served = modules.flatMap(m => m.lessons.flatMap(l => l.pages.filter(p => p.layout === "practice").flatMap(p => p.blocks.filter(b => b.type === "practice"))));
    expect(served).toHaveLength(110);
    expect(served.map(b => b.reviewPageId)).toEqual(items.map(x => x.it.review!.pageId));
  });
  it("the content validator refuses a link to an unknown page or to an exercise page, and accepts a lesson page", () => {
    const course = cloneCourse() as LearningCourseContent;
    const all = course.modules.flatMap(m => m.lessons.flatMap(l => l.pages));
    const practice = all.flatMap(p => p.blocks).find(b => b.type === "practice") as { reviewPageId?: string } | undefined;
    expect(practice).toBeDefined();
    const lessonPage = all.find(p => p.layout !== "practice" && p.layout !== "opener")!;
    const codes = () => validateLearningCourseContent(course).map(i => i.code);
    practice!.reviewPageId = lessonPage.id;
    expect(codes()).not.toContain("invalid-review-page");
    practice!.reviewPageId = "no-such-page";
    expect(codes()).toContain("invalid-review-page");
    const practicePage = all.find(p => p.layout === "practice");
    if (practicePage) { practice!.reviewPageId = practicePage.id; expect(codes()).toContain("invalid-review-page"); }
  });
});
