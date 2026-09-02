// Converts an HTML <table> fragment into the markdown-pipe-table convention that
// src/questionContent.tsx's parseTable()/promptText() already expect ("...\n| h |\n| --- |\n| c |").
// This is the ONLY table representation rendered anywhere in the app (Exam Builder draft, Manual
// Review, Teacher Dashboard, Student Exam) — imported tables are converted into it rather than
// inventing a second representation.

function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePipe(text) {
  return text.replace(/\|/g, "\\|");
}

// Minimal, table-only HTML tokenizer — deliberately not a general-purpose HTML parser (the mini
// DOM parser embedded in import-html-exam.js is untested/unexported and tightly coupled to
// trusted, hand-authored exam pages; writing a small dedicated table tokenizer here is lower risk
// than reaching into that file).
function extractTables(html) {
  const tables = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(String(html || ""))) !== null) {
    const rows = [];
    const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
      const cells = [];
      const cellRegex = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const text = stripTags(cellMatch[2]);
        const colspanMatch = /colspan\s*=\s*["']?(\d+)/i.exec(cellMatch[1]);
        const colspan = colspanMatch ? Math.max(1, parseInt(colspanMatch[1], 10)) : 1;
        for (let i = 0; i < colspan; i += 1) {
          cells.push(text);
        }
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push({ rows, index: tableMatch.index, raw: tableMatch[0] });
    }
  }

  return tables;
}

// rows: string[][] (first row = headers). Returns the markdown-pipe block (no leading prose).
function rowsToMarkdown(rows) {
  if (!Array.isArray(rows) || rows.length < 1) {
    return "";
  }

  const columnCount = Math.max(...rows.map(row => row.length));
  const pad = row => {
    const padded = row.slice(0, columnCount);
    while (padded.length < columnCount) {
      padded.push("");
    }
    return padded;
  };

  const headerRow = pad(rows[0]);
  const dataRows = rows.slice(1).map(pad);

  const lines = [
    "| " + headerRow.map(escapePipe).join(" | ") + " |",
    "| " + headerRow.map(() => "---").join(" | ") + " |",
    ...dataRows.map(row => "| " + row.map(escapePipe).join(" | ") + " |")
  ];

  return lines.join("\n");
}

// Converts one <table> HTML fragment directly to the markdown-pipe block used by parseTable().
function htmlTableToMarkdown(tableHtml) {
  const tables = extractTables(tableHtml);
  if (tables.length === 0) {
    return null;
  }
  return rowsToMarkdown(tables[0].rows);
}

// Converts a full HTML fragment (prose + at most one table) into the exact `text` convention
// parseTable()/promptText() read: leading prose, then a "\n" + markdown-pipe table block.
// QuestionTextBlock only ever renders promptText(text) (everything before the first "\n|") plus
// the table itself — it has no slot for content *after* a table. Any prose found after the table
// is therefore folded into the leading paragraph (ahead of the table) rather than appended after
// it, so nothing a teacher wrote is silently dropped from what actually renders on screen.
function htmlFragmentToQuestionText(html) {
  const tables = extractTables(html);

  if (tables.length === 0) {
    return stripTags(html);
  }

  const first = tables[0];
  const before = stripTags(String(html).slice(0, first.index));
  const after = stripTags(String(html).slice(first.index + first.raw.length));
  const markdown = rowsToMarkdown(first.rows);
  const prose = [before, after].filter(Boolean).join(" ");

  return prose ? prose + "\n" + markdown : markdown;
}

// Converts a WHOLE multi-question HTML document into flowing text, replacing every <table> found
// (in document order) with its markdown-pipe block in place, and stripping all other tags from the
// surrounding prose. This is the representation handed to the AI question-detection step, which
// then segments it into individual questions — as long as each table's markdown block stays
// adjacent to its own question's prose in the flowing text (which it does, since substitution is
// purely positional), an AI excerpt copied "verbatim" for one question will naturally include the
// correct prose+table shape that parseTable()/promptText() expect once it becomes that question's
// own `text` field. This is deliberately different from htmlFragmentToQuestionText above, which
// assumes exactly one question/one table and is used only for single-question contexts elsewhere.
function htmlDocumentToMarkdownText(html) {
  const source = String(html || "");
  const tables = extractTables(source);

  if (tables.length === 0) {
    return stripTags(source);
  }

  const segments = [];
  let cursor = 0;

  for (const table of tables) {
    const before = stripTags(source.slice(cursor, table.index));
    if (before) {
      segments.push(before);
    }
    segments.push(rowsToMarkdown(table.rows));
    cursor = table.index + table.raw.length;
  }

  const trailing = stripTags(source.slice(cursor));
  if (trailing) {
    segments.push(trailing);
  }

  return segments.join("\n");
}

module.exports = {
  stripTags,
  extractTables,
  rowsToMarkdown,
  htmlTableToMarkdown,
  htmlFragmentToQuestionText,
  htmlDocumentToMarkdownText
};
