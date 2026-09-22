import { describe, it, expect } from "vitest";
import { BUILDER_QUESTION_TYPES, BUILDER_PART_TYPES, QUESTION_TYPE_LABELS } from "./examTypes";

// The canonical, ordered type registries shared by every authoring surface. These pin the 11-type contract so a
// future composer (Live Challenge) cannot silently narrow the authorable set.
const EXPECTED = [
  "multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank",
  "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound",
];

describe("canonical builder question-type registries", () => {
  it("lists exactly the 11 canonical question types, in stable order, with no duplicates", () => {
    expect([...BUILDER_QUESTION_TYPES]).toEqual(EXPECTED);
    expect(BUILDER_QUESTION_TYPES.length).toBe(11);
    expect(new Set(BUILDER_QUESTION_TYPES).size).toBe(11);
  });
  it("includes compound for top-level questions but excludes it from part types (no nested compound)", () => {
    expect(BUILDER_QUESTION_TYPES).toContain("compound");
    expect(BUILDER_PART_TYPES).not.toContain("compound");
    expect([...BUILDER_PART_TYPES]).toEqual(EXPECTED.filter(t => t !== "compound"));
    expect(BUILDER_PART_TYPES.length).toBe(10);
    expect(new Set(BUILDER_PART_TYPES).size).toBe(10);
  });
  it("has a label for every question type (labels remain the display source of truth)", () => {
    for (const t of BUILDER_QUESTION_TYPES) expect(QUESTION_TYPE_LABELS[t]).toBeTruthy();
    expect(Object.keys(QUESTION_TYPE_LABELS).length).toBe(11);
  });
  it("is runtime-immutable (frozen), matching the games-catalog registry convention", () => {
    expect(Object.isFrozen(BUILDER_QUESTION_TYPES)).toBe(true);
    expect(Object.isFrozen(BUILDER_PART_TYPES)).toBe(true);
  });
});
