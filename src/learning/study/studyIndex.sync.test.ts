// Study Practice Strength — the committed SERVER key index (api/src/data/learning-study/791381.json) must equal the
// index derived from the real content through the shared eligibility rule. When content changes (a new exercise, a
// renamed block id, a changed key) this test fails until `npm run build:learning-study-index` is re-run — so the
// client's notion of "eligible" and the server's key index can never drift apart. It also pins the eligibility
// rule itself and the identity strategy (block ids, unique per course).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { loadCourseManifest, loadModuleContent } from "../content/registry";
import { buildStudyIndex } from "./buildIndex";
import { eligibleStudyActivities, practiceQuestionKey, practiceTableKey, normalizeStudyText } from "./eligibility";
import type { ContentPage, PracticeTableBlock } from "../content/types";

const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../api/src/data/learning-study/791381.json", import.meta.url)), "utf8"));

describe("the committed server index equals the content-derived one", () => {
  it("byte-for-byte structural equality (run `npm run build:learning-study-index` after content changes)", async () => {
    const manifest = await loadCourseManifest("791381");
    const derived = await buildStudyIndex("791381", manifest, loadModuleContent);
    expect(committed).toEqual(derived);
    expect(derived.schemaVersion).toBe(1); expect(derived.courseId).toBe("791381");
  }, 60000);
  it("pins the current footprint: 230 pages, 475 eligible activities (257 MC · 91 T/F · 67 short input · 60 tables), ALL 28 modules (m01: 9, m02: 13); every id unique and page-scoped", () => {
    const pages = Object.entries(committed.pages as Record<string, { moduleId: string; activities: Record<string, { kind: string }> }>);
    expect(pages.length).toBe(230);
    const kinds: Record<string, number> = {};
    const ids = new Set<string>();
    const modules = new Set<string>();
    for (const [pageId, p] of pages) {
      modules.add(p.moduleId);
      expect(pageId.startsWith(p.moduleId + "-")).toBe(true);
      for (const [id, key] of Object.entries(p.activities)) {
        expect(ids.has(id), id).toBe(false); ids.add(id);
        expect(id.startsWith(pageId.replace("791381-", "") + "-")).toBe(true);     // the block id names its page: stable, page-scoped identity
        kinds[key.kind] = (kinds[key.kind] || 0) + 1;
      }
    }
    expect(ids.size).toBe(475);
    expect(kinds).toEqual({ multipleChoice: 257, trueFalse: 91, shortInput: 67, "practice-table": 60 });
    expect(modules.size).toBe(28);
    const perModule: Record<string, number> = {};
    for (const [, p] of pages) perModule[p.moduleId] = (perModule[p.moduleId] || 0) + Object.keys(p.activities).length;
    expect(perModule["791381-m01"]).toBe(9); expect(perModule["791381-m02"]).toBe(13);
    for (let i = 1; i <= 28; i++) expect(perModule["791381-m" + String(i).padStart(2, "0")], "m" + i).toBeGreaterThan(0);
  });
});

describe("the eligibility rule", () => {
  const page = (blocks: ContentPage["blocks"]): Pick<ContentPage, "blocks"> => ({ blocks });
  it("keyed multipleChoice / trueFalse / shortInput and practice tables are eligible; fillBlank, unkeyed questions, CLI simulations, reading blocks are not", () => {
    const table: PracticeTableBlock = { id: "t", type: "practice-table", origin: "book", headers: ["a", "b"], rows: [["x", { kind: "select", options: ["1", "2"], key: "2" }], ["y", "plain"]] };
    const specs = eligibleStudyActivities(page([
      { id: "q1", type: "practice", origin: "teacher-enrichment", question: { kind: "multipleChoice", prompt: "p", options: [{ id: "a", text: "A" }, { id: "b", text: "B", correct: true }] } },
      { id: "q2", type: "practice", origin: "teacher-enrichment", question: { kind: "trueFalse", prompt: "p", answer: false } },
      { id: "q3", type: "practice", origin: "teacher-enrichment", question: { kind: "shortInput", prompt: "p", answer: "  Access  " } },
      { id: "q4", type: "practice", origin: "teacher-enrichment", question: { kind: "fillBlank", prompt: "p", answers: ["x"] } },
      { id: "q5", type: "practice", origin: "teacher-enrichment", question: { kind: "multipleChoice", prompt: "p", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] } },
      { id: "q6", type: "practice", origin: "teacher-enrichment", question: { kind: "trueFalse", prompt: "p" } },
      { id: "q7", type: "practice", origin: "teacher-enrichment", question: { kind: "shortInput", prompt: "p", answer: "   " } },
      table,
      { id: "sim", type: "simulation", origin: "teacher-enrichment", simulationType: "cli-terminal", version: 1, title: "x", description: "y" } as never,
      { id: "txt", type: "text", origin: "book", spans: [{ text: "reading" }] },
    ]));
    expect(specs.map(s => s.activityId)).toEqual(["q1", "q2", "q3", "t"]);
    expect(specs[0].key).toEqual({ kind: "multipleChoice", correct: ["b"] });
    expect(specs[1].key).toEqual({ kind: "trueFalse", answer: false });
    expect(specs[2].key).toEqual({ kind: "shortInput", answer: "access" });
    expect(specs[3].key).toEqual({ kind: "practice-table", cells: { "0:1": "2" } });
    expect(practiceQuestionKey({ kind: "fillBlank", prompt: "p", answers: ["x"] })).toBeNull();
    expect(practiceTableKey({ ...table, rows: [["x", "y"]] })).toBeNull();
    expect(normalizeStudyText("  Switch  Port ")).toBe("switch port");
  });
});
