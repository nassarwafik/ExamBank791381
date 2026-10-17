// Phase L.6b — the answer material never reaches the browser (the data guard itself: src/learning/content/servedBodies.l6b.test.ts).
// Over the REAL book: every block that can be checked is served with `serverCheck`; the study set a served page names equals the authored page's and the study index's; and the server's check
// index holds exactly the authored keys (the study index's, for study activities) and feedback.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { COURSE_CONTENT_MODULE_IDS, loadCourseManifest } from "../content/registry";
import { loadBundledModuleContent } from "../content/bundledModules";
import type { ContentBlock, ContentModule, ContentPage, PracticeBlock, PracticeTableBlock } from "../content/types";
import { buildCheckIndex, servedBlock, servedModuleBody, type CheckIndex } from "./checkIndex";
import { studyActivityIds, studyActivityOf } from "./eligibility";
import { readerCourse, ANSWER_KEY } from "../reader/readerFixtures";

const C = "791381";
const data = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL("../../../api/src/data/" + path, import.meta.url)), "utf8"));
const servedModule = (moduleId: string): ContentModule => data("learning-content/" + C + "/" + moduleId + ".json");
const pagesOf = (m: ContentModule): ContentPage[] => m.lessons.flatMap(l => l.pages);
const STUDY_INDEX = data("learning-study/" + C + ".json") as { pages: Record<string, { moduleId: string; activities: Record<string, unknown> }> };
const CHECK_INDEX = data("learning-check/" + C + ".json") as CheckIndex;
const MODULES = COURSE_CONTENT_MODULE_IDS[C];

describe("L.6b — the served module bodies and the check index", () => {
  it("every authored checkable block is served with `serverCheck`, nothing else is; the served study set = the authored = the study index", async () => {
    let checkable = 0;
    for (const moduleId of MODULES) {
      const authored = await loadBundledModuleContent(C, moduleId), served = servedModule(moduleId);
      const servedPages = new Map(pagesOf(served).map(p => [p.id, p]));
      for (const page of pagesOf(authored)) {
        const sp = servedPages.get(page.id)!;
        page.blocks.forEach((block, i) => {
          const sb = sp.blocks[i] as PracticeBlock | PracticeTableBlock;
          expect(sb.id).toBe(block.id);
          const expected = (block.type === "practice" || block.type === "practice-table") && (studyActivityOf({ ...block, studyEligible: undefined } as ContentBlock) !== null);
          if (expected) checkable++;
          expect(sb.serverCheck === true, block.id).toBe(expected);
          if (block.type === "practice" || block.type === "practice-table") expect(sb.studyEligible, block.id).toBe(block.studyEligible);   // the opt-out travels
        });
        const ids = studyActivityIds(page);
        expect(studyActivityIds(sp), page.id).toEqual(ids);
        expect(ids, page.id).toEqual(Object.keys(STUDY_INDEX.pages[page.id]?.activities ?? {}));
      }
    }
    expect(checkable).toBe(479);
  }, 30000);

  it("the check index: 479 checkable blocks, the 475 study ones carry exactly the study index's key, 4 self-checks are study: false", () => {
    let study = 0, self = 0;
    for (const [pageId, page] of Object.entries(CHECK_INDEX.pages)) {
      for (const [id, a] of Object.entries(page.activities)) {
        const indexed = STUDY_INDEX.pages[pageId]?.activities[id];
        if (a.study) { study++; expect(indexed, id).toEqual(a.key); expect(STUDY_INDEX.pages[pageId].moduleId).toBe(page.moduleId); }
        else { self++; expect(indexed, id).toBeUndefined(); }
      }
    }
    for (const [pageId, page] of Object.entries(STUDY_INDEX.pages)) for (const id of Object.keys(page.activities)) expect(CHECK_INDEX.pages[pageId].activities[id]?.study, id).toBe(true);
    expect([study, self]).toEqual([475, 4]);
  });

  it("the check index keeps every authored message, hint ladder and explanation (the server's feedback is the book's)", async () => {
    const authored = await buildCheckIndex(C, await loadCourseManifest(C), loadBundledModuleContent);
    expect(JSON.parse(JSON.stringify(authored))).toEqual(CHECK_INDEX);
    const withHints = Object.values(CHECK_INDEX.pages).flatMap(p => Object.values(p.activities)).filter(a => (a.feedback.hints ?? []).length > 0).length;
    const withExplanation = Object.values(CHECK_INDEX.pages).flatMap(p => Object.values(p.activities)).filter(a => a.feedback.explanation).length;
    expect(withHints).toBeGreaterThan(300);
    expect(withExplanation).toBeGreaterThan(300);
  }, 30000);
});

describe("L.6b — servedBlock", () => {
  const rich = readerCourse.modules[0].lessons[0].pages[0];
  const prac = rich.blocks.find(b => b.id === "p1-prac")!;
  it("a keyed question keeps its prompt, option ids and texts, gains `serverCheck`, and loses every secret", () => {
    const served = servedBlock(prac);
    expect(served).toEqual({ id: "p1-prac", type: "practice", origin: "teacher-enrichment", serverCheck: true, question: { kind: "multipleChoice", prompt: "أي وضع لجهاز واحد؟", options: [{ id: "o1", text: "Access" }, { id: "o2", text: "Trunk" }] } });
    const json = JSON.stringify(served);
    for (const secret of [ANSWER_KEY.hint, ...ANSWER_KEY.hints, ANSWER_KEY.correctFeedback, ANSWER_KEY.incorrectFeedback, ANSWER_KEY.explanation]) expect(json).not.toContain(secret);
    expect(json).not.toContain("correct");
  });
  it("a short answer loses its answer; a question with no key is stripped but not marked; other blocks are unchanged", () => {
    const short = readerCourse.modules[0].lessons[0].pages[1].blocks[1];
    expect(JSON.stringify(servedBlock(short))).not.toContain(ANSWER_KEY.shortAnswer);
    expect((servedBlock(short) as PracticeBlock).serverCheck).toBe(true);
    const open: ContentBlock = { id: "o", type: "practice", origin: "teacher-enrichment", question: { kind: "shortInput", prompt: "اشرح", feedback: { hints: ["H"] } } };
    expect(servedBlock(open)).toEqual({ id: "o", type: "practice", origin: "teacher-enrichment", question: { kind: "shortInput", prompt: "اشرح" } });
    const text = rich.blocks[1];
    expect(servedBlock(text)).toBe(text);
  });
  it("a practice-table loses every cell key and keeps the choices; an authored `serverCheck` is never trusted", () => {
    const table: PracticeTableBlock = { id: "t", type: "practice-table", origin: "book", studyEligible: false, headers: ["A", "B"], rows: [["x", { kind: "select", options: ["1", "2"], key: "2" }]] };
    expect(servedBlock(table)).toEqual({ id: "t", type: "practice-table", origin: "book", studyEligible: false, serverCheck: true, headers: ["A", "B"], rows: [["x", { kind: "select", options: ["1", "2"] }]] });
    const unkeyed = { id: "u", type: "practice", origin: "book", serverCheck: true, question: { kind: "shortInput", prompt: "?" } } as ContentBlock;
    expect((servedBlock(unkeyed) as PracticeBlock).serverCheck).toBeUndefined();
  });
  it("servedModuleBody keeps the structure (ids, order, titles) and strips every page", () => {
    const m = readerCourse.modules[0];
    const served = servedModuleBody(m);
    expect(served.lessons.map(l => l.pages.map(p => p.id))).toEqual(m.lessons.map(l => l.pages.map(p => p.id)));
    expect(JSON.stringify(served)).not.toContain(ANSWER_KEY.shortAnswer);
    expect(JSON.stringify(m)).toContain(ANSWER_KEY.shortAnswer);                 // pure: the authored module is untouched
  });
});
