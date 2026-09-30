import { describe, it, expect } from "vitest";
import { BUILDER_QUESTION_TYPES, BUILDER_PART_TYPES, QUESTION_TYPE_LABELS } from "./examTypes";
import { QUESTION_TYPE_CATALOG, LEGACY_QUESTION_TYPE_KEYS, compoundPartTypeKeys } from "./questionTypeCatalog";

// The canonical, ordered type registries shared by every authoring surface. Phase 16A migrated this pin: the 11 historical
// types remain present FIRST, in their stable order, with unchanged labels; membership, order and labels now derive from the
// ONE Question Type Catalog (a future composer cannot silently narrow the authorable set, and no second list can drift).
const LEGACY = [
  "multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank",
  "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound",
];
const LEGACY_LABELS: Record<string, string> = { multipleChoice: "اختيار من متعدد", trueFalse: "صح أو خطأ", multiTrueFalse: "صح/خطأ متعدد", shortAnswer: "إجابة قصيرة / مفتوحة", fillBlank: "إكمال فراغات", wordBank: "مخزن كلمات", matching: "مطابقة", ordering: "ترتيب", tableFill: "إكمال جدول", cliFill: "أوامر CLI", compound: "سؤال مركّب" };

describe("canonical builder question-type registries", () => {
  it("keeps the 11 historical types first, in stable order, with no duplicates, and mirrors the catalog exactly", () => {
    expect([...BUILDER_QUESTION_TYPES].slice(0, 11)).toEqual(LEGACY);
    expect([...LEGACY_QUESTION_TYPE_KEYS]).toEqual(LEGACY);
    expect([...BUILDER_QUESTION_TYPES]).toEqual(QUESTION_TYPE_CATALOG.map(d => d.key));
    expect(new Set(BUILDER_QUESTION_TYPES).size).toBe(BUILDER_QUESTION_TYPES.length);
  });
  it("includes compound for top-level questions but excludes it from part types (no nested compound); part types = the compound-capable catalog types", () => {
    expect(BUILDER_QUESTION_TYPES).toContain("compound");
    expect(BUILDER_PART_TYPES).not.toContain("compound");
    expect([...BUILDER_PART_TYPES]).toEqual(compoundPartTypeKeys());
    expect([...BUILDER_PART_TYPES].slice(0, 10)).toEqual(LEGACY.filter(t => t !== "compound"));
    expect(new Set(BUILDER_PART_TYPES).size).toBe(BUILDER_PART_TYPES.length);
  });
  it("has a label for every question type and the 11 historical labels are unchanged (labels remain the display source of truth)", () => {
    for (const t of BUILDER_QUESTION_TYPES) expect(QUESTION_TYPE_LABELS[t]).toBeTruthy();
    for (const [k, label] of Object.entries(LEGACY_LABELS)) expect(QUESTION_TYPE_LABELS[k as keyof typeof QUESTION_TYPE_LABELS]).toBe(label);
    expect(Object.keys(QUESTION_TYPE_LABELS).length).toBe(QUESTION_TYPE_CATALOG.length);
  });
  it("is runtime-immutable (frozen), matching the games-catalog registry convention", () => {
    expect(Object.isFrozen(BUILDER_QUESTION_TYPES)).toBe(true);
    expect(Object.isFrozen(BUILDER_PART_TYPES)).toBe(true);
  });
});
