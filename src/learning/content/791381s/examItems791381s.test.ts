// 791381s Phase 8C-3 (docs/enterprise-791381s-enrichment-plan.md §11.4, §19) — the booklet's ADVANCED exam items:
//   • the private store (api/src/data/learning-exam-items/791381s.json) passes the platform's own validation (allowlisted types,
//     the shared per-type validators, the unit registry) and every question carries an explanation;
//   • exactly one metadata-only `exam-item` card per stored item, on the «تدريبات الوحدة» page of the item's own unit, right after
//     the unit's questions (before any network lab / Exam Library card) — and no card points at a missing item;
//   • the official grader accepts each item's authored key in full and refuses a wrong answer (a parametric question is answered
//     from the instance the learner is shown);
//   • nothing of the store reaches a served module body (no key, no explanation).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentModule } from "../types";
// @ts-expect-error — untyped CommonJS server modules, imported on purpose to cross-check the store with the real authorities.
import * as storeLib from "../../../../api/src/lib/learning-exam-items.js";
// @ts-expect-error — idem (the official grader).
import * as grading from "../../../../api/src/lib/assignment-grading.js";
// @ts-expect-error — idem (the student projection).
import * as sanitizer from "../../../../api/src/lib/student-exam-sanitize.js";

type Q = { examQuestionId: string; presentationType: string; text: string; options?: { id: string }[]; matrix?: unknown; categorization?: unknown; answer: Record<string, unknown> };
type Item = { moduleId: string; label: string; examSnapshot: { sections: { questions: Q[] }[] }; feedback?: Record<string, { explanation: string }> };
const CID = "791381s";
const store = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../api/src/data/learning-exam-items/" + CID + ".json", import.meta.url)), "utf8")) as { schemaVersion: number; courseId: string; items: Record<string, Item> };
const lib = storeLib as unknown as { validateExamItem: (c: string, id: string, item: unknown) => string[]; examItemContext: (c: string, id: string, u: string) => unknown };
const { gradeExam } = grading as unknown as { gradeExam: (e: unknown, a: unknown, ctx?: unknown) => { score: number; totalMarks: number; questions: { questionId: string; correct: boolean }[] } };
const { sanitizeExamForStudent } = sanitizer as unknown as { sanitizeExamForStudent: (e: unknown, o?: unknown) => { sections: { questions: Q[] }[] } };
const questionsOf = (item: Item) => item.examSnapshot.sections.flatMap(s => s.questions);

/** The authored key of one question as a learner's answer; a parametric one is solved from the instance the learner sees. */
function rightAnswer(q: Q, shown: Q): unknown {
  const a = q.answer;
  switch (q.presentationType) {
    case "multipleSelect": return { kind: "multiChoice", optionIds: a.correctOptionIds };
    case "matrix": return { kind: "fields", values: a.correctColumnByRow };
    case "categorization": return { kind: "fields", values: a.correctCategoryByItem };
    case "numericResponse": return { kind: "numeric", value: String(a.expected) };
    case "parametricNumeric": {
      const expr = String(a.expression);
      if (expr === "2^h - 2") return { kind: "numeric", value: String(2 ** Number(shown.text.match(/\d+/)![0]) - 2) };
      const bits = shown.text.match(/[01]{8}/)![0];
      return { kind: "numeric", value: String(parseInt(bits, 2)) };
    }
  }
  throw new Error("no right answer for " + q.presentationType);
}

describe("the private store", () => {
  it("passes the platform's validation; every question carries an explanation", () => {
    expect(store).toMatchObject({ schemaVersion: 1, courseId: CID });
    const ids = Object.keys(store.items);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const [id, item] of Object.entries(store.items)) {
      expect(lib.validateExamItem(CID, id, item), id).toEqual([]);
      for (const q of questionsOf(item)) expect(item.feedback?.[q.examQuestionId]?.explanation, id + "/" + q.examQuestionId).toBeTruthy();
    }
    const types = new Set(Object.values(store.items).flatMap(i => questionsOf(i).map(q => q.presentationType)));
    for (const t of ["multipleSelect", "matrix", "categorization", "numericResponse", "parametricNumeric"]) expect(types.has(t), t).toBe(true);
  });

  it("the official grader accepts each item's authored key in full (parametric: from the shown instance) and refuses a wrong answer", () => {
    for (const [id, item] of Object.entries(store.items)) {
      for (const learner of ["u1", "u2"]) {
        const ctx = lib.examItemContext(CID, id, learner);
        const shown = sanitizeExamForStudent(item.examSnapshot, ctx).sections.flatMap(s => s.questions);
        const answers = Object.fromEntries(questionsOf(item).map((q, i) => [q.examQuestionId, rightAnswer(q, shown[i])]));
        const g = gradeExam(item.examSnapshot, answers, ctx);
        expect(g.questions.every(x => x.correct), id + "/" + learner).toBe(true);
        expect(g.score, id).toBe(g.totalMarks);
        const wrong = gradeExam(item.examSnapshot, { [questionsOf(item)[0].examQuestionId]: { kind: "numeric", value: "-1" } }, ctx);
        expect(wrong.questions[0].correct, id + " wrong").toBe(false);
      }
    }
  });
});

describe("the cards in the units", () => {
  it("one metadata-only card per item, on its own unit's practice page, after the questions and before any lab / library card", async () => {
    const seen: string[] = [];
    for (const ref of manifest.modules) {
      const mod: ContentModule = await loadBundledModuleContent(CID, ref.id);
      for (const page of mod.lessons.flatMap(l => l.pages)) {
        page.blocks.forEach((b, at) => {
          if (b.type !== "exam-item") return;
          seen.push(b.itemId);
          const item = store.items[b.itemId];
          expect(item, b.id + " points at a stored item").toBeTruthy();
          expect(item.moduleId, b.id).toBe(ref.id);
          expect(page.layout, b.id).toBe("practice");
          expect(b.label, b.id).toBe(item.label);
          expect(Object.keys(b).sort(), b.id).toEqual(["id", "itemId", "label", "origin", "type"]);
          expect(page.blocks.slice(0, at).every(x => x.type === "practice" || x.type === "practice-table"), b.id + " follows the questions").toBe(true);
          expect(page.blocks.slice(at + 1).every(x => x.type === "simulation" || x.type === "library-training"), b.id + " precedes only labs / library cards").toBe(true);
        });
      }
    }
    expect(seen.sort()).toEqual(Object.keys(store.items).sort());
  }, 60000);

  it("no served module body carries the store's keys or explanations", () => {
    const secrets = Object.values(store.items).flatMap(item => Object.values(item.feedback ?? {}).map(f => f.explanation));
    for (const ref of manifest.modules) {
      const json = readFileSync(fileURLToPath(new URL("../../../../api/src/data/learning-content/" + CID + "/" + ref.id + ".json", import.meta.url)), "utf8");
      expect(json, ref.id).not.toMatch(/correctOptionIds|correctColumnByRow|correctCategoryByItem|"expression"/);
      for (const e of secrets) expect(json.includes(e), ref.id).toBe(false);
    }
  });
});
