// Phase 20G.3 — the ONE legacy table authority (pure, no React): how a legacy question's markdown "| … |" table is parsed and which control the
// student card draws for each data row. StudentQuestionCard renders from it and the server grader (compiled through the shared build) decides
// the table's grading mode from it, so the renderer and the grader can never disagree about whether a row is a select, a checkbox or free text.
// parseTable / resolveTableRowOptions moved here verbatim from questionContent.tsx (which re-exports them); the check-box phrasing moved
// verbatim from StudentQuestionCard.tableCheckbox.

export type ParsedTable = { headers: string[]; rows: string[][] };

export function parseTable(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith("|") && x.endsWith("|"));
  if (lines.length < 2) return null;
  const split = (x: string) => x.slice(1, -1).split("|").map(y => y.trim());
  const all = lines.map(split), headers = all[0], rows = all.slice(1).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c.replace(/\s/g, ""))));
  return rows.length ? { headers, rows } : null;
}

export type RowOption = { value?: string; label?: string; text?: string };
export type RowField = { order?: number; kind?: string; options?: RowOption[] };
export type TableRowOptionsSource = { fields?: RowField[]; wordBank?: string[]; options?: RowOption[] };

// Resolves which dropdown values (if any) a student should be offered for one row of a table
// question, in priority order: (1) that row's own field.options - the per-row answer set a
// teacher/AI explicitly assigned; (2) field.kind==="boolean" - a genuine true/false row, rendered
// as "صحيح"/"غير صحيح" but carrying the plain "true"/"false" values assignment-grading.js's
// gradeTable already accepts; (3) the question's shared wordBank, only as a fallback when the
// question has fields at all (so a wordBank meant for an unrelated fillBlank question never leaks
// into an unrelated table). Returns null when none of these apply, meaning: fall back to the
// legacy free-text/checkbox rendering untouched - this is what keeps old exams working exactly as
// before, since they never populate `fields` for their table rows.
export function resolveTableRowOptions(q: TableRowOptionsSource, rowIndex: number): { values: string[]; isBoolean: boolean } | null {
  const fields = q.fields || [];
  const field = fields.find(f => f.order === rowIndex) ?? fields[rowIndex];

  if (field?.options?.length) {
    const values = field.options.map(o => o.value ?? o.text ?? o.label ?? "").filter(Boolean);
    if (values.length) return { values, isBoolean: false };
  }

  if (field?.kind === "boolean") {
    return { values: ["true", "false"], isBoolean: true };
  }

  if (fields.length && Array.isArray(q.wordBank) && q.wordBank.length) {
    return { values: q.wordBank, isBoolean: false };
  }

  return null;
}

/** The legacy check-box table phrasing: the question text asks the student to tick rows. */
export function isCheckboxTableText(text: unknown): boolean {
  return /وضع علامة|✓|خاص بالشبكات الخاصة\?|private\?/i.test(String(text ?? ""));
}

export type LegacyTableCellControl = "select" | "checkbox" | "text";
/** The control StudentQuestionCard draws for one data row of a legacy table: a select when the row has options, else a checkbox when the
 *  question is check-box phrased, else a free-text input. */
export function legacyTableCellControl(q: TableRowOptionsSource & { text?: unknown }, rowIndex: number): LegacyTableCellControl {
  if (resolveTableRowOptions(q, rowIndex)) return "select";
  return isCheckboxTableText(q.text) ? "checkbox" : "text";
}
