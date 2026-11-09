// 899371 P0 — the question inventory of «مجمع أسئلة في أسس علم الحاسوب» stays consistent with the plan and the probes:
// it is the input of the conversion and exercise phases (docs/enterprise-899371-learning-plan.md §2, §5, §12).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "docs", "enterprise-899371-learning");
const inv = JSON.parse(readFileSync(join(DIR, "analysis", "inventory.json"), "utf8"));
const plan = readFileSync(join(ROOT, "docs", "enterprise-899371-learning-plan.md"), "utf8");
const chapters = inv.modules.filter(m => m.chapter);
const questions = chapters.flatMap(m => m.assignments.flatMap(a => a.questions.map(q => ({ ...q, section: a.section, chapter: m.chapter }))));
const allItems = [...questions, ...chapters.flatMap(m => m.summary.exercises)];
const WRITE = new Set(["WP", "WM", "WC"]);
const findingIds = new Set([...plan.matchAll(/^\| (F\d+) \|/gm)].map(m => m[1]));

describe("899371 inventory", () => {
  it("has the book's 11 chapters, framed by the opening (m00) and closing (m12) modules", () => {
    expect(inv.modules.map(m => m.moduleId)).toEqual(Array.from({ length: 13 }, (_, i) => "899371-m" + String(i).padStart(2, "0")));
    expect(chapters.map(m => m.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(inv.modules.map(m => m.batch))).toEqual(new Set(inv.batches.map(b => b.id)));
  });

  it("counts the questions of the plan's table (§2): 76 homework / tracing, 85 programming", () => {
    const per = s => chapters.map(m => m.assignments.find(a => a.section === s).questions.length);
    expect(per("homework")).toEqual([5, 15, 10, 11, 5, 5, 5, 5, 5, 5, 5]);
    expect(per("programming")).toEqual([10, 10, 10, 10, 10, 5, 10, 4, 6, 5, 5]);
    expect(questions.length).toBe(161);
  });

  it("gives every item and part a unique id and a known pattern", () => {
    const ids = allItems.flatMap(q => [q.id, ...q.parts.map(p => p.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of allItems) for (const p of q.parts) expect(Object.keys(inv.patterns)).toContain(p.pattern);
  });

  it("classifies the runner path of every write-a-program / method / class item, and only of those", () => {
    for (const q of allItems) {
      const writes = q.parts.some(p => WRITE.has(p.pattern));
      if (writes) expect(Object.keys(inv.runnerClasses), q.id).toContain(q.runner);
      else expect(q.runner, q.id).toBeUndefined();
    }
  });

  it("cites only findings that the plan's findings table defines, and only probes that exist", () => {
    expect(findingIds.size).toBeGreaterThanOrEqual(31);
    for (const q of allItems) {
      for (const f of q.findings || []) expect(findingIds, q.id + " → " + f).toContain(f);
      for (const p of q.probes || []) expect(existsSync(join(DIR, "probes", p, "probe.json")), p).toBe(true);
    }
  });

  it("links every probe's finding to the plan's findings table", () => {
    for (const q of questions) for (const p of q.probes || []) {
      const probe = JSON.parse(readFileSync(join(DIR, "probes", p, "probe.json"), "utf8"));
      if (probe.finding) expect(findingIds).toContain(probe.finding);
    }
  });
});
