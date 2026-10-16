// Phase 21F.5 — the Studio's positional operations (insert at a position, drag-and-drop placement), pure.
import { describe, it, expect } from "vitest";
import { insertQuestionAt, placeQuestion } from "./studioOps";
import type { BuilderQuestion, BuilderSection } from "../examTypes";

const q = (id: string) => ({ examQuestionId: id, presentationType: "trueFalse", text: id, marks: 1, answer: { correct: true } }) as unknown as BuilderQuestion;
const secs = (): BuilderSection[] => [
  { id: "a", title: "أ", gradingPolicy: "all", questions: [q("a1"), q("a2"), q("a3")], scenarios: [{ id: "sc", title: "س", sources: [], questionIds: ["a2", "a3"] }] } as unknown as BuilderSection,
  { id: "b", title: "ب", gradingPolicy: "all", questions: [q("b1"), q("b2")] } as unknown as BuilderSection
];
const ids = (s: BuilderSection[], i: number) => s[i].questions.map(x => x.examQuestionId);

describe("21F.5 insertQuestionAt", () => {
  it("inserts before the given position, clamps out-of-range positions, ignores an unknown section", () => {
    expect(ids(insertQuestionAt(secs(), "a", 0, q("n")), 0)).toEqual(["n", "a1", "a2", "a3"]);
    expect(ids(insertQuestionAt(secs(), "a", 2, q("n")), 0)).toEqual(["a1", "a2", "n", "a3"]);
    expect(ids(insertQuestionAt(secs(), "a", 99, q("n")), 0)).toEqual(["a1", "a2", "a3", "n"]);
    expect(ids(insertQuestionAt(secs(), "a", -4, q("n")), 0)).toEqual(["n", "a1", "a2", "a3"]);
    const s = secs();
    expect(insertQuestionAt(s, "zz", 0, q("n"))).toBe(s);
  });
});

describe("21F.5 placeQuestion", () => {
  it("moves inside a section to the pointed position (before the item there now)", () => {
    expect(ids(placeQuestion(secs(), "a", "a1", "a", 3), 0)).toEqual(["a2", "a3", "a1"]);
    expect(ids(placeQuestion(secs(), "a", "a3", "a", 0), 0)).toEqual(["a3", "a1", "a2"]);
    expect(ids(placeQuestion(secs(), "a", "a1", "a", 2), 0)).toEqual(["a2", "a1", "a3"]);
  });
  it("a drop on its own place is a no-op (same array: no history step)", () => {
    const s = secs();
    expect(placeQuestion(s, "a", "a2", "a", 1)).toBe(s);
    expect(placeQuestion(s, "a", "a2", "a", 2)).toBe(s);
  });
  it("moves across sections to the pointed position; the question leaves its scenario", () => {
    const out = placeQuestion(secs(), "a", "a2", "b", 1);
    expect(ids(out, 0)).toEqual(["a1", "a3"]);
    expect(ids(out, 1)).toEqual(["b1", "a2", "b2"]);
    expect(out[0].scenarios?.[0].questionIds).toEqual(["a3"]);
    expect(ids(placeQuestion(secs(), "a", "a1", "b", 9), 1)).toEqual(["b1", "b2", "a1"]);
  });
  it("unknown question or section: unchanged", () => {
    const s = secs();
    expect(placeQuestion(s, "a", "zz", "b", 0)).toBe(s);
    expect(placeQuestion(s, "a", "a1", "zz", 0)).toBe(s);
  });
});
