// @vitest-environment happy-dom
// 791381s Phase 8A (docs/enterprise-791381s-enrichment-plan.md §11.2) — the summary booklet points at the 36 Exam Library
// trainings from its units' «تدريبات الوحدة» pages: each item exactly once, as a metadata-only enrichment card whose
// `requiredModuleId` is the API's 791381s release module (one source of truth: the server registry). The content never
// carries a title, a question or a key; the trainings are never study activities (their own 40-point bucket, no double
// count); on the practice page they sit in their own section after the running score, which counts the questions only.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import manifest from "./manifest";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentModule, ContentPage, LibraryTrainingBlock } from "../types";
import LearningPageRenderer, { type ReaderPageHeader } from "../../reader/LearningPageRenderer";
import type { LibraryTrainingHost } from "../../training/types";
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../../api/src/lib/learning-training-registry.js";

afterEach(cleanup);
const CID = "791381s";
const reg = apiRegistry as unknown as {
  listLearningTrainings: () => { trainingId: string; label: string; title: string }[];
  trainingReleaseModuleFor: (id: string, courseId: string) => string | null;
};
const studyIndexPath = fileURLToPath(new URL("../../../../api/src/data/learning-study/" + CID + ".json", import.meta.url));

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}

describe("the 36 trainings in the summary booklet", () => {
  it("each item exactly once, on the «تدريبات الوحدة» page of its release unit (F01–F06 on unit 36), gated by the API's module", async () => {
    const mods = await loadAll();
    const placed: { block: LibraryTrainingBlock; page: ContentPage; moduleId: string }[] = [];
    for (const m of mods) for (const l of m.lessons) for (const p of l.pages) for (const b of p.blocks) {
      if (b.type === "library-training") placed.push({ block: b, page: p, moduleId: m.id });
    }
    const all = reg.listLearningTrainings();
    expect(placed.map(x => x.block.trainingId).sort()).toEqual(all.map(t => t.trainingId).sort());
    for (const { block, page, moduleId } of placed) {
      const id = block.trainingId;
      const release = reg.trainingReleaseModuleFor(id, CID);
      expect(block.requiredModuleId, id).toBe(release);
      expect(page.layout, id).toBe("practice");
      expect(moduleId, id).toBe(id.startsWith("F") ? CID + "-m36" : release);
      expect(block.origin, id).toBe("teacher-enrichment");
      expect(block.label, id).toBe(all.find(t => t.trainingId === id)!.label);
      expect(block.id, id).toBe(page.id.replace(CID + "-", "") + "-lib-" + id.toLowerCase());
      expect(Object.keys(block).sort(), id).toEqual(["id", "label", "origin", "requiredModuleId", "trainingId", "type"]);
      // the cards come after every exercise of the page
      const at = page.blocks.indexOf(block);
      expect(page.blocks.slice(at).every(b => b.type === "library-training"), id).toBe(true);
    }
  }, 30000);

  it("the cards never carry a training's library title (the API discloses it only when the item is available)", async () => {
    const cards = (await loadAll()).flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks.filter(b => b.type === "library-training"))));
    expect(cards).toHaveLength(36);
    const json = JSON.stringify(cards);
    for (const t of reg.listLearningTrainings()) expect(json.includes(t.title), t.trainingId).toBe(false);
  }, 30000);

  it("no training id is a study activity of 791381s (one 40-point bucket per item, never counted twice)", () => {
    const index = readFileSync(studyIndexPath, "utf8");
    expect(index).not.toMatch(/-lib-[tf]\d\d"|library-training|"T\d\d"|"F0\d"/);
  });
});

describe("«تدريبات الوحدة» with trainings — the cards sit after the score and are not part of it", () => {
  it("unit 3: the score counts the questions only; the two cards are in «تدريبات من مكتبة الامتحانات» after it, and «أعد كل الأسئلة» leaves them", async () => {
    const mod = await loadBundledModuleContent(CID, CID + "-m03");
    const page = mod.lessons.flatMap(l => l.pages).find(p => p.layout === "practice")!;
    const questions = page.blocks.filter(b => b.type === "practice").length;
    const header: ReaderPageHeader = { courseId: CID, pageTitle: page.title, moduleTitle: mod.title, lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 }, source: page.source };
    const opened: string[] = [];
    const host: LibraryTrainingHost = {
      status: id => (id === "T03" ? { kind: "available", title: "عنوان من الخادم", best: null } : { kind: "unavailable" }),
      onOpen: id => { opened.push(id); },
    };
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} training={host} />);
    expect(container.querySelector(".learning-unit-practice-score")!.textContent).toContain("أجبت عن 0 من " + questions);
    const section = container.querySelector(".learning-unit-practice-library")!;
    expect(section.querySelector("h3")!.textContent).toBe("تدريبات من مكتبة الامتحانات");
    expect([...section.querySelectorAll(".learning-reader-training-code")].map(n => n.textContent)).toEqual(["T03", "T04"]);
    expect(container.querySelector(".learning-unit-practice-items .learning-reader-training")).toBeNull();
    // the section follows the score in document order
    const score = container.querySelector(".learning-unit-practice-score")!;
    expect(score.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("عنوان من الخادم")).toBeTruthy();
    const start = [...section.querySelectorAll("button")].filter(b => /ابدأ التدريب/.test(b.textContent || ""));
    expect(start.map(b => (b as HTMLButtonElement).disabled)).toEqual([false, true]);       // T03 available, T04 not yet
    fireEvent.click(start[0]);
    expect(opened).toEqual(["T03"]);
    fireEvent.click(screen.getAllByRole("radio")[0]);                                       // answer one question …
    fireEvent.click(screen.getByRole("button", { name: "أعد كل الأسئلة" }));                // … then reset the page
    expect(container.querySelectorAll(".learning-unit-practice-library .learning-reader-training")).toHaveLength(2);
  }, 30000);
});
