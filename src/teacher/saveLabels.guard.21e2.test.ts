// Phase 21E.2 (F) — guard: the teacher save / finalize vocabulary lives in ONE table (src/teacher/saveLabels.ts). A listed
// literal written directly as button text or a string anywhere else in teacher UI source fails this test, so the labels
// can no longer drift (21E.0 audit T-4: «حفظ التعديلات» vs «حفظ التغييرات», a bare «حفظ», emoji-prefixed variants …).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SAVE_LABELS } from "./saveLabels";

const ROOT = join(__dirname, "..");
const LISTED = ["حفظ مسودة", "حفظ التعديلات", "حفظ التغييرات", "حفظ واعتماد التصحيح", "حفظ التمديد", "حفظ إعادة الفتح", "اعتماد نهائي", "حفظ الامتحان", "حفظ"];
// Not teacher authoring / results UI: student answer workspaces and the shared network simulator (owned elsewhere).
const OUT_OF_SCOPE = ["functionStudy" + sep, "networkTopology2" + sep, "student" + sep, "StudentExamPage.tsx", "StudentQuestionCard.tsx"];
// Reviewed exceptions, each with its reason. Keep this list short; a new entry needs a design-record line.
const ALLOWED: Record<string, string> = {
  // The compact per-stage score button in a table row: its accessible name is «حفظ علامة المرحلة <id>» (contextual).
  "projects/ProjectStudentDetail.tsx|حفظ": "contextual aria-label",
  // TEMPORARY — these two files are edited by the open PR #300 (21E.1 slice 2); they move onto the table right after it merges.
  "StructuredExamBuilder.tsx|حفظ مسودة": "pending #300",
  "StructuredExamBuilder.tsx|اعتماد نهائي": "pending #300",
  "App.tsx|حفظ الامتحان": "pending #300"
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}
// A literal as JSX text (optionally after one glyph such as «💾» / «✓») or as a whole quoted string.
const pattern = (l: string) => new RegExp("(>\\s*(?:[^\\s<>{}\"]{1,2}\\s)?" + l + "\\s*<)|([\"'`](?:[^\\s\"'`]{1,2}\\s)?" + l + "[\"'`])", "g");

describe("21E.2 F — one save-label table", () => {
  it("the table names distinct operations with distinct labels (an approval is never an ordinary save)", () => {
    const values = Object.values(SAVE_LABELS);
    expect(new Set(values).size).toBe(values.length);
    expect(SAVE_LABELS.finalizeExam).toContain("اعتماد");
    expect(SAVE_LABELS.saveGradingDecision).toContain("اعتماد");
    expect(SAVE_LABELS.saveDraft).not.toContain("اعتماد");
    expect(SAVE_LABELS.saveChanges).not.toContain("اعتماد");
  });

  it("no listed save / finalize literal appears in teacher UI source outside the table", () => {
    const hits: string[] = [];
    for (const file of files(ROOT)) {
      const rel = relative(ROOT, file);
      if (OUT_OF_SCOPE.some(prefix => rel.startsWith(prefix) || rel.includes(sep + prefix) || rel === prefix)) continue;
      const src = readFileSync(file, "utf8");
      for (const literal of LISTED) {
        for (const m of src.matchAll(pattern(literal))) {
          if (ALLOWED[rel.split(sep).join("/") + "|" + literal]) continue;
          hits.push(rel + ":" + (src.slice(0, m.index).split("\n").length) + " " + m[0]);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
