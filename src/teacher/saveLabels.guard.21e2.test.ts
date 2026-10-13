// Phase 21E.2 (F) — guard: the teacher save / finalize vocabulary lives in ONE table (src/teacher/saveLabels.ts). A listed
// literal written directly as button text or a string anywhere else in teacher UI source fails this test, so the labels
// can no longer drift (21E.0 audit T-4: «حفظ التعديلات» vs «حفظ التغييرات», a bare «حفظ», emoji-prefixed variants …).
// RF3 I-4 — the save STATUS entries are scanned too (the builder's status said «⏳ جارٍ الحفظ» next to the button's «جارٍ الحفظ…»).
// Fail-first on 8bd4cc2: SAVE_STATE_LABELS did not exist, and the builder's own status table / App's legacy status line wrote the
// status literals («محفوظ», «تغييرات غير محفوظة», «نسخة مسترجعة — غير محفوظة»).
// RF4 B-06 / A-10 / B-01 — the builder's status says «محفوظ — معتمد نهائيًا» after an approval (a draft save says «محفوظ») and
// «تعذّر الحفظ: …» after a failed save: both entries live in the table and are refused anywhere else. Fail-first on 1fa3d21: neither
// entry existed (SAVE_LABELS.savedFinal / saveFailed undefined).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SAVE_LABELS, SAVE_STATE_LABELS } from "./saveLabels";

const ROOT = join(__dirname, "..");
const LISTED = ["حفظ مسودة", "حفظ التعديلات", "حفظ التغييرات", "حفظ واعتماد التصحيح", "حفظ التمديد", "حفظ إعادة الفتح", "اعتماد نهائي", "حفظ الامتحان", "حفظ",
  // RF3 I-4 — the save-status sentences (a status line renders SAVE_STATE_LABELS, its glyph a separate aria-hidden decoration).
  "محفوظ", "تغييرات غير محفوظة", "نسخة مسترجعة — غير محفوظة",
  // RF4 B-06 / A-10 — the approved status and the failed-save status are the table's too.
  "محفوظ — معتمد نهائيًا", "تعذّر الحفظ"];
// Not teacher save actions: the student exam surfaces, and the two shared SmartSim answer workspaces whose «حفظ» commits a
// SIMULATED configuration / measurement inside the simulation (rendered for students, and as a preview in the editors). The
// teacher editors / review views next to them (FunctionStudyEditor / Review, Net2Editor / Review …) ARE guarded.
const OUT_OF_SCOPE = ["student" + sep, "StudentExamPage.tsx", "StudentQuestionCard.tsx", join("functionStudy", "FunctionStudyWorkspace.tsx"), join("networkTopology2", "Net2Panels.tsx")];
// Reviewed exceptions, each with its reason. Keep this list short; a new entry needs a design-record line. An entry with `after`
// exempts only the use written right after that text (every other use of the literal in the file is still refused).
const ALLOWED: Record<string, string | { reason: string; after: string }> = {
  // The compact per-stage score button in a table row: its accessible name is «حفظ علامة المرحلة <id>» (contextual).
  "projects/ProjectStudentDetail.tsx|حفظ": "contextual aria-label",
  // RF3 I-4 — the 13A unsaved-work confirmation's TITLE (a dialog's name, not the status; api/tests/assessment-presets-guards-15a
  // pins this one literal). The builder's status must still read SAVE_STATE_LABELS.
  "StructuredExamBuilder.tsx|تغييرات غير محفوظة": { reason: "unsaved-work confirmation title", after: "title: " },
  // RF3 I-4 — chemistry: «✓ محفوظ» says a balanced equation CONSERVES mass (a result row), not that work was saved.
  "chemistryReactions/ConservationPanel.tsx|محفوظ": "conservation of mass, not a save state"
};
const allowed = (rel: string, literal: string, src: string, at: number) => {
  const a = ALLOWED[rel.split(sep).join("/") + "|" + literal];
  return !!a && (typeof a === "string" || src.slice(Math.max(0, at - a.after.length), at) === a.after);
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}
// A literal as JSX text (optionally after an icon glyph such as «💾» / «✓» / «✏️», never after a word) or a whole quoted string.
const pattern = (l: string) => new RegExp("(>\\s*(?:[^\\s<>{}\"\\p{L}]{1,3}\\s?)?" + l + "\\s*<)|([\"'`](?:[^\\s\"'`\\p{L}]{1,3}\\s?)?" + l + "[\"'`])", "gu");

describe("21E.2 F — one save-label table", () => {
  it("the pattern catches icon-prefixed variants and never a sentence that merely contains the words", () => {
    const hit = (src: string) => [...src.matchAll(pattern("حفظ التعديلات"))].length > 0;
    for (const s of ['<b>حفظ التعديلات</b>', '"💾 حفظ التعديلات"', '"💾حفظ التعديلات"', '"✏️ حفظ التعديلات"', "'حفظ التعديلات'", '`حفظ التعديلات`']) expect(hit(s), s).toBe(true);
    for (const s of ['"تم حفظ التعديلات"', '<p>لم حفظ التعديلات</p>', '"تم حفظ التعديلات."', '"حفظ التعديلات الأخيرة"']) expect(hit(s), s).toBe(false);
    // RF3 I-4 — the status variants the builder used to write (glyph + words) are caught; a sentence that merely contains them is not.
    const status = (l: string, src: string) => [...src.matchAll(pattern(l))].length > 0;
    for (const [l, s] of [["محفوظ", '"✓ محفوظ"'], ["محفوظ", "<span>✓ محفوظ</span>"], ["تغييرات غير محفوظة", '"● تغييرات غير محفوظة"'], ["نسخة مسترجعة — غير محفوظة", '"↺ نسخة مسترجعة — غير محفوظة"'], ["محفوظ", '{ text: "محفوظ" }']]) expect(status(l, s), s).toBe(true);
    for (const [l, s] of [["محفوظ", '"غير محفوظ"'], ["محفوظ", "<span>(محفوظ)</span>"], ["تغييرات غير محفوظة", '"توجد تغييرات غير محفوظة في هذا الامتحان."']]) expect(status(l, s), s).toBe(false);
  });
  it("the table names distinct operations with distinct labels (an approval is never an ordinary save)", () => {
    const values = Object.values(SAVE_LABELS);
    expect(new Set(values).size).toBe(values.length);
    expect(SAVE_LABELS.finalizeExam).toContain("اعتماد");
    expect(SAVE_LABELS.saveGradingDecision).toContain("اعتماد");
    expect(SAVE_LABELS.saveDraft).not.toContain("اعتماد");
    expect(SAVE_LABELS.saveChanges).not.toContain("اعتماد");
  });

  it("RF3 I-4 — the save status says one plain sentence per state, from the table; «جارٍ الحفظ…» is the same string as the buttons'", () => {
    expect(SAVE_STATE_LABELS).toEqual({ saved: "محفوظ", dirty: "تغييرات غير محفوظة", saving: "جارٍ الحفظ…", recovered: "نسخة مسترجعة — غير محفوظة" });
    expect(SAVE_STATE_LABELS.saving).toBe(SAVE_LABELS.saving);
    for (const [state, text] of Object.entries(SAVE_STATE_LABELS)) {
      expect(text, state).toMatch(/^\p{L}/u);                                          // a sentence: no leading glyph
      expect(/\p{Extended_Pictographic}|[✓●↺⏳]/u.test(text), state).toBe(false);
      expect(text, state).not.toContain("اعتماد");                                    // a status is never an approval
    }
    expect(new Set(Object.values(SAVE_STATE_LABELS)).size).toBe(4);
  });

  it("RF4 B-06 / A-10 — an approval's status and a failed save's status are plain sentences of the table, distinct from every other entry", () => {
    expect(SAVE_LABELS.savedFinal).toBe("محفوظ — معتمد نهائيًا");
    expect(SAVE_LABELS.saveFailed).toBe("تعذّر الحفظ");
    expect(SAVE_LABELS.savedFinal.startsWith(SAVE_LABELS.saved + " — ")).toBe(true);              // a saved state, said whole
    expect(SAVE_LABELS.savedFinal).toContain("معتمد نهائيًا");                                       // … that names the approval
    expect(SAVE_LABELS.savedFinal).not.toContain(SAVE_LABELS.finalizeExam);                          // a status, not the action
    for (const text of [SAVE_LABELS.savedFinal, SAVE_LABELS.saveFailed]) {
      expect(text).toMatch(/^\p{L}/u);
      expect(/\p{Extended_Pictographic}|[✓●↺⏳]/u.test(text), text).toBe(false);
      expect(Object.values(SAVE_STATE_LABELS)).not.toContain(text);
    }
    // the guard refuses both literals written elsewhere (glyph-prefixed too), never a sentence that merely contains them
    const hit = (l: string, src: string) => [...src.matchAll(pattern(l))].length > 0;
    for (const s of ['"✓ محفوظ — معتمد نهائيًا"', "<span>محفوظ — معتمد نهائيًا</span>", "'محفوظ — معتمد نهائيًا'"]) expect(hit("محفوظ — معتمد نهائيًا", s), s).toBe(true);
    for (const s of ['"تعذّر الحفظ"', "<b>تعذّر الحفظ</b>", "`تعذّر الحفظ`"]) expect(hit("تعذّر الحفظ", s), s).toBe(true);
    for (const s of ['"تعذّر الحفظ الآن"', "<p>لقد تعذّر الحفظ</p>", '"محفوظ — معتمد نهائيًا منذ أمس"']) expect(hit(s.includes("تعذّر") ? "تعذّر الحفظ" : "محفوظ — معتمد نهائيًا", s), s).toBe(false);
    expect(LISTED).toEqual(expect.arrayContaining([SAVE_LABELS.savedFinal, SAVE_LABELS.saveFailed]));
  });

  it("no listed save / finalize literal appears in teacher UI source outside the table", () => {
    const hits: string[] = [];
    for (const file of files(ROOT)) {
      const rel = relative(ROOT, file);
      if (OUT_OF_SCOPE.some(prefix => rel.startsWith(prefix) || rel.includes(sep + prefix) || rel === prefix)) continue;
      const src = readFileSync(file, "utf8");
      for (const literal of LISTED) {
        for (const m of src.matchAll(pattern(literal))) {
          if (allowed(rel, literal, src, m.index ?? 0)) continue;
          hits.push(rel + ":" + (src.slice(0, m.index).split("\n").length) + " " + m[0]);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
