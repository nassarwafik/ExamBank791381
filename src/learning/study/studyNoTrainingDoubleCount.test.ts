// NO T/F DOUBLE COUNT — a `library-training` block embedded in Learning Materials is NEVER a Study-Practice activity:
// it belongs only to its canonical 40-point Learning-Practice bucket (the same T/F id the Training Library opens).
// Module Study points come from the eligible in-page exercises alone. This pins the eligibility rule the Reader AND
// the server index generator share, and the committed server index built from it.
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { eligibleStudyActivities, studyActivityOf } from "./eligibility";
import type { ContentBlock } from "../content/types";
const req_ = createRequire(import.meta.url);

const training: ContentBlock = { type: "library-training", id: "m02-l03-p01-train", trainingId: "T10", label: "تدريب 10" } as unknown as ContentBlock;
const practice: ContentBlock = { type: "practice", id: "m02-l03-p01-q1", question: { kind: "multipleChoice", prompt: "؟", options: [{ id: "a", text: "1", correct: true }, { id: "b", text: "2" }] } } as unknown as ContentBlock;

describe("Study eligibility vs library-training blocks", () => {
  it("a library-training block is never an eligible study activity; a practice block on the same page is", () => {
    expect(studyActivityOf(training)).toBeNull();
    const specs = eligibleStudyActivities({ blocks: [training, practice, training] });
    expect(specs.map(s => s.activityId)).toEqual(["m02-l03-p01-q1"]);
    expect(specs.some(s => s.activityId === "T10" || s.activityId.includes("train"))).toBe(false);
  });
  it("the committed server index (built from the same rule) contains no training id and no library-training block id", () => {
    const index = req_("../../../api/src/data/learning-study/791381.json") as { pages: Record<string, { activities: Record<string, unknown> }> };
    const ids = Object.values(index.pages).flatMap(p => Object.keys(p.activities));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) { expect(id).not.toMatch(/^(T\d\d|F0\d)$/); expect(id).not.toMatch(/train/i); }
  });
});
