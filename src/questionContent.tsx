// Shared question-text/table handling — originally defined only in StudentExamPage.tsx. Moved
// here so other read-only views (Exam Builder draft, Manual Review, Analytics drill-down, exam
// question preview) can render the same markdown-style "| ... |" tables embedded in a question's
// `text` field instead of dumping the raw text (which looks garbled once it contains a table).
// Logic is unchanged from the original — only moved and exported.

export type ParsedTable = { headers: string[]; rows: string[][] };

export function parseTable(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith("|") && x.endsWith("|"));
  if (lines.length < 2) return null;
  const split = (x: string) => x.slice(1, -1).split("|").map(y => y.trim());
  const all = lines.map(split), headers = all[0], rows = all.slice(1).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c.replace(/\s/g, ""))));
  return rows.length ? { headers, rows } : null;
}

export function promptText(text: string): string {
  const p = text.indexOf("\n|");
  return p >= 0 ? text.slice(0, p).trim() : text;
}

// Read-only rendering (no input fields) for views that only display a question, never let the
// student answer it — e.g. the teacher's Exam Builder draft, Manual Review, Analytics drill-down.
// StudentExamPage.tsx keeps its own interactive table markup (with editable cells) untouched.
export function QuestionTextBlock({ text }: { text: string }) {
  const table = parseTable(text || "");
  const prose = promptText(text || "");
  return (
    <>
      {prose && <p>{prose}</p>}
      {table && (
        <div className="question-table-wrap">
          <table>
            <thead>
              <tr>{table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
