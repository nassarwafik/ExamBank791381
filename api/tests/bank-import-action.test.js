import { describe, it, expect } from "vitest";
import { partitionQuestionsBySectionValidity } from "../src/functions/bank-import-action.js";

function q(overrides = {}) {
  return { importedQuestionId: "imp-1-1", section: "BASIC", ...overrides };
}

describe("partitionQuestionsBySectionValidity (bank-commit section gate)", () => {
  it("accepts a question with section BASIC", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "BASIC" })]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("accepts a question with section INFRASTRUCTURE", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "INFRASTRUCTURE" })]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("rejects a question with section LEGACY", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "LEGACY" })]);
    expect(accepted).toHaveLength(0);
    expect(skipped).toEqual([{ importedQuestionId: "imp-1-1", reason: "invalid-section", section: "LEGACY" }]);
  });

  it("rejects a question with section null", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: null })]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].reason).toBe("invalid-section");
  });

  it("rejects a question with section undefined (field omitted)", () => {
    const question = { importedQuestionId: "imp-1-1" };
    const { accepted, skipped } = partitionQuestionsBySectionValidity([question]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].section).toBeNull();
  });

  it("rejects an arbitrary/random section value", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "SOMETHING_RANDOM" })]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].section).toBe("SOMETHING_RANDOM");
  });

  it("partitions a mixed batch correctly, keeping only the valid ones", () => {
    const questions = [
      q({ importedQuestionId: "a", section: "BASIC" }),
      q({ importedQuestionId: "b", section: "LEGACY" }),
      q({ importedQuestionId: "c", section: "INFRASTRUCTURE" }),
      q({ importedQuestionId: "d", section: undefined })
    ];
    const { accepted, skipped } = partitionQuestionsBySectionValidity(questions);
    expect(accepted.map(x => x.importedQuestionId)).toEqual(["a", "c"]);
    expect(skipped.map(x => x.importedQuestionId)).toEqual(["b", "d"]);
  });
});
