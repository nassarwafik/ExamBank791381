import { describe, it, expect } from "vitest";
import { htmlTableToMarkdown, htmlFragmentToQuestionText, htmlDocumentToMarkdownText } from "../src/lib/table-markdown.js";

// parseTable/promptText are re-implemented verbatim here (byte-for-byte matching
// src/questionContent.tsx) purely to prove htmlTableToMarkdown's output round-trips through the
// real parsing contract, without adding a cross-directory TS/JSX import into an api/ vitest file.
function parseTableRef(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith("|") && x.endsWith("|"));
  if (lines.length < 2) return null;
  const split = x => x.slice(1, -1).split("|").map(y => y.trim());
  const all = lines.map(split), headers = all[0], rows = all.slice(1).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c.replace(/\s/g, ""))));
  return rows.length ? { headers, rows } : null;
}

function promptTextRef(text) {
  const p = text.indexOf("\n|");
  return p >= 0 ? text.slice(0, p).trim() : text;
}

describe("htmlTableToMarkdown", () => {
  it("converts a simple table with headers and data rows", () => {
    const html = "<table><tr><th>Class</th><th>IP Address</th></tr><tr><td>Private</td><td>192.168.1.5</td></tr><tr><td>Public</td><td>8.8.8.8</td></tr></table>";
    const markdown = htmlTableToMarkdown(html);
    const parsed = parseTableRef(markdown);
    expect(parsed).not.toBeNull();
    expect(parsed.headers).toEqual(["Class", "IP Address"]);
    expect(parsed.rows).toEqual([["Private", "192.168.1.5"], ["Public", "8.8.8.8"]]);
  });

  it("duplicates a colspan cell's text across the spanned columns", () => {
    const html = "<table><tr><th colspan=\"2\">Header</th></tr><tr><td>a</td><td>b</td></tr></table>";
    const markdown = htmlTableToMarkdown(html);
    const parsed = parseTableRef(markdown);
    expect(parsed.headers).toEqual(["Header", "Header"]);
  });

  it("keeps empty cells as empty strings, not dropped", () => {
    const html = "<table><tr><th>A</th><th>B</th></tr><tr><td></td><td>x</td></tr></table>";
    const parsed = parseTableRef(htmlTableToMarkdown(html));
    expect(parsed.rows).toEqual([["", "x"]]);
  });

  it("returns null for HTML with no table", () => {
    expect(htmlTableToMarkdown("<p>no table here</p>")).toBeNull();
  });

  it("escapes a literal pipe character inside a cell", () => {
    const html = "<table><tr><th>A</th></tr><tr><td>a|b</td></tr></table>";
    const markdown = htmlTableToMarkdown(html);
    expect(markdown).toContain("a\\|b");
  });
});

describe("htmlFragmentToQuestionText", () => {
  it("puts prose before the table and the table renders via the real parseTable/promptText contract", () => {
    const html = "<p>Classify these addresses:</p><table><tr><th>IP</th><th>Class</th></tr><tr><td>10.0.0.1</td><td>Private</td></tr></table>";
    const text = htmlFragmentToQuestionText(html);
    expect(promptTextRef(text)).toBe("Classify these addresses:");
    const table = parseTableRef(text);
    expect(table.headers).toEqual(["IP", "Class"]);
    expect(table.rows).toEqual([["10.0.0.1", "Private"]]);
  });

  it("folds trailing prose after the table into the leading paragraph instead of dropping it", () => {
    const html = "<table><tr><th>A</th></tr><tr><td>1</td></tr></table><p>Note: answer in the table above.</p>";
    const text = htmlFragmentToQuestionText(html);
    expect(promptTextRef(text)).toContain("Note: answer in the table above.");
  });

  it("returns plain stripped text when there is no table", () => {
    expect(htmlFragmentToQuestionText("<p>Just a question, no table.</p>")).toBe("Just a question, no table.");
  });
});

describe("htmlDocumentToMarkdownText", () => {
  it("preserves multiple tables in document order, each adjacent to its own surrounding prose", () => {
    const html =
      "<p>Question 1: classify these.</p>" +
      "<table><tr><th>IP</th></tr><tr><td>10.0.0.1</td></tr></table>" +
      "<p>Question 2: DHCP stages.</p>" +
      "<table><tr><th>Stage</th></tr><tr><td>Discover</td></tr></table>";

    const text = htmlDocumentToMarkdownText(html);

    const firstTableIndex = text.indexOf("| IP |");
    const secondTableIndex = text.indexOf("| Stage |");
    const q1Index = text.indexOf("Question 1");
    const q2Index = text.indexOf("Question 2");

    expect(q1Index).toBeGreaterThanOrEqual(0);
    expect(firstTableIndex).toBeGreaterThan(q1Index);
    expect(q2Index).toBeGreaterThan(firstTableIndex);
    expect(secondTableIndex).toBeGreaterThan(q2Index);
  });

  it("returns plain stripped text when the document has no tables", () => {
    expect(htmlDocumentToMarkdownText("<p>No tables here at all.</p>")).toBe("No tables here at all.");
  });

  it("keeps trailing prose after the last table", () => {
    const html = "<table><tr><th>A</th></tr><tr><td>1</td></tr></table><p>Final note.</p>";
    expect(htmlDocumentToMarkdownText(html)).toContain("Final note.");
  });
});
