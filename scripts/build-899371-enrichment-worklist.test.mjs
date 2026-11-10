// 899371 P10 (docs/enterprise-899371-enrichment-plan.md §7) — the work list of the second plan is exactly what its builder makes from
// the P0 inventory, the served course and the P7 lab, and it says where every one of the book's 161 questions is and what it gets.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildWorklist, OUT, INVENTORY, SCENES, CHECK_CLASS, CORRECTED } from "./build-899371-enrichment-worklist.mjs";

const ROOT = process.cwd();
const committed = JSON.parse(readFileSync(OUT, "utf8"));
const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
const pages = new Map();
for (const f of readdirSync(join(ROOT, "api/src/data/learning-content/899371")).filter(f => f.endsWith(".json"))) {
  const m = JSON.parse(readFileSync(join(ROOT, "api/src/data/learning-content/899371", f), "utf8"));
  for (const l of m.lessons) for (const p of l.pages) pages.set(p.id, { ...p, lessonId: l.id });
}

describe("899371 P10 — the work list", () => {
  it("is exactly the build of the inventory, the served course and the P7 lab (regenerating changes no byte)", () => {
    expect(JSON.stringify(buildWorklist(), null, 1) + "\n").toBe(readFileSync(OUT, "utf8"));
  });

  it("places every one of the 161 book questions exactly once, on a page of its own chapter's homework / programming lesson", () => {
    const want = inventory.modules.flatMap(m => (m.assignments || []).flatMap(a => a.questions.map(q => q.id)));
    expect(want).toHaveLength(161);
    expect(committed.questions.map(q => q.id)).toEqual(want);
    for (const q of committed.questions) {
      const page = pages.get(q.pageId);
      expect(page, q.id).toBeDefined();
      expect(page.lessonId, q.id).toBe(`899371-${q.chapter}-${q.section === "homework" ? "l02" : "l03"}`);
      expect(page.title, q.id).toMatch(new RegExp(`^(السؤال ${q.number}|الأسئلة (\\d+)–(\\d+))$`));
      for (const p of q.programs) expect(page.blocks.find(b => b.id === p.blockId)?.language, q.id + " " + p.blockId).toBe("csharp");
    }
  });

  it("the tracks follow the patterns and the decisions; the totals are pinned", () => {
    expect(committed.decisions).toEqual({ D1: "teacher-release", D2: "follows-D1", D3: "badge-only", D4: "no-runner-change", D5: "corrected-by-owner", D6: "scenes-as-listed" });
    for (const q of committed.questions) {
      expect(q.trace, q.id).toBe(q.patterns.some(p => ["PO", "TT", "EX", "TV"].includes(p)) && q.programs.length > 0);
      // D5 closed by the owner (2026-11-10, P16): the six corrected questions are checked; every other one keeps its P0 class
      if (q.patterns.some(p => ["WP", "WM", "WC"].includes(p))) expect(q.solve, q.id).toBe(CORRECTED.includes(q.id) ? "check" : CHECK_CLASS[q.runnerClass]);
      else expect(q.solve, q.id).toBeNull();
      expect(q.gate, q.id).toBe(q.trace || q.solve ? "teacher-release" : null);   // D1 / D2: every book solution and output tracer is gated
    }
    expect(committed.totals).toEqual({
      questions: 161, trace: 70, solve: 80, tryInput: 13,
      solveByClass: { check: 69, "check-small-n": 5, "run-only-until-corrected": 0, "run-only": 6 }, solveFromLab: 36, scenes: 33,
    });
    // exactly the six that waited (P0 class needs-correction), each flagged as corrected
    expect(committed.questions.filter(q => q.corrected).map(q => q.id).sort()).toEqual([...CORRECTED].sort());
    expect(committed.questions.filter(q => q.runnerClass === "needs-correction").map(q => q.id).sort()).toEqual([...CORRECTED].sort());
  });

  it("every P7 coding-lab question is reused once, by the book question it was built on", () => {
    const lab = committed.questions.filter(q => q.lab);
    expect(new Set(lab.map(q => q.lab)).size).toBe(36);
    for (const q of lab) {
      const [, mid, k] = /^CL899371-(\d\d)-Q(\d\d)$/.exec(q.lab);
      const authored = JSON.parse(readFileSync(join(ROOT, "scripts/coding-lab-899371", `m${mid}.json`), "utf8")).questions[Number(k) - 1];
      expect(authored.book, q.lab).toBe(q.id);
    }
  });

  it("the 33 scenes sit on book pages of their chapter's summary lesson, three per chapter, ids unique", () => {
    expect(committed.scenes).toEqual(JSON.parse(JSON.stringify(SCENES)));
    expect(new Set(SCENES.map(s => s.id)).size).toBe(33);
    for (const s of SCENES) {
      const page = pages.get(s.pageId);
      expect(page?.lessonId, s.id).toBe(`899371-${s.chapter}-l01`);
      expect(page.blocks.some(b => b.origin === "book"), s.id).toBe(true);
    }
    const perChapter = {};
    for (const s of SCENES) perChapter[s.chapter] = (perChapter[s.chapter] || 0) + 1;
    expect(Object.values(perChapter).every(n => n === 3)).toBe(true);
    expect(Object.keys(perChapter)).toHaveLength(11);
  });
});
