import { describe, it, expect } from "vitest";
import { parseTable, promptText } from "./questionContent";

describe("parseTable / promptText - markdown table extraction (moved verbatim from StudentExamPage.tsx)", () => {
  // No question currently in the live bank happens to contain a "| ... |" table (checked against
  // all 1930 indexed questions), so this uses a realistic synthetic example in the same style as
  // the bank's IP-addressing questions to prove the extraction itself is correct.
  const tableQuestion =
    "صنّف عناوين IP التالية إلى Private أو Public:\n" +
    "| العنوان | التصنيف |\n" +
    "| --- | --- |\n" +
    "| 192.168.1.10 | |\n" +
    "| 8.8.8.8 | |\n" +
    "| 10.0.0.5 | |";

  it("extracts headers and rows, dropping the markdown separator row", () => {
    const table = parseTable(tableQuestion);
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(["العنوان", "التصنيف"]);
    expect(table!.rows).toEqual([
      ["192.168.1.10", ""],
      ["8.8.8.8", ""],
      ["10.0.0.5", ""]
    ]);
  });

  it("returns only the prose before the table as the prompt text", () => {
    expect(promptText(tableQuestion)).toBe("صنّف عناوين IP التالية إلى Private أو Public:");
  });

  it("returns null for plain text with no table lines", () => {
    const plain = "ما هو نطاق عناوين IP الخاصة من الفئة C؟";
    expect(parseTable(plain)).toBeNull();
    expect(promptText(plain)).toBe(plain);
  });

  it("returns null when only a single '|' line is present (needs at least 2 to form a table)", () => {
    const oneLiner = "VLAN 10: A و B | VLAN 20: C و D. أي جهاز يستقبل ARP؟";
    expect(parseTable(oneLiner)).toBeNull();
    expect(promptText(oneLiner)).toBe(oneLiner);
  });

  it("returns null when the table has only a header row and separator (no data rows)", () => {
    const headerOnly = "سؤال بلا بيانات:\n| رأس |\n| --- |";
    expect(parseTable(headerOnly)).toBeNull();
  });
});
