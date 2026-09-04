import { describe, it, expect } from "vitest";
import { parseTable, promptText, resolveTableRowOptions } from "./questionContent";

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

describe("resolveTableRowOptions - priority order for a table question's per-row dropdown", () => {
  it("prefers that row's own field.options over everything else", () => {
    const q = { fields: [{ order: 0, options: [{ value: "صالح" }, { value: "غير صالح" }] }], wordBank: ["ignored"] };
    expect(resolveTableRowOptions(q, 0)).toEqual({ values: ["صالح", "غير صالح"], isBoolean: false });
  });

  it("matches a field to its row by explicit `order`, not array position", () => {
    const q = { fields: [{ order: 1, options: [{ value: "B" }] }, { order: 0, options: [{ value: "A" }] }] };
    expect(resolveTableRowOptions(q, 0)).toEqual({ values: ["A"], isBoolean: false });
    expect(resolveTableRowOptions(q, 1)).toEqual({ values: ["B"], isBoolean: false });
  });

  it("falls back to array index when no field declares a matching `order`", () => {
    const q = { fields: [{ options: [{ value: "A" }] }, { options: [{ value: "B" }] }] };
    expect(resolveTableRowOptions(q, 1)).toEqual({ values: ["B"], isBoolean: false });
  });

  it("reads option value from value, then text, then label, dropping empties", () => {
    const q = { fields: [{ order: 0, options: [{ text: "TCP" }, { label: "UDP" }, { value: "" }] }] };
    expect(resolveTableRowOptions(q, 0)).toEqual({ values: ["TCP", "UDP"], isBoolean: false });
  });

  it("uses the صحيح/غير صحيح boolean pair when the field is genuinely kind:boolean", () => {
    const q = { fields: [{ order: 0, kind: "boolean" }] };
    expect(resolveTableRowOptions(q, 0)).toEqual({ values: ["true", "false"], isBoolean: true });
  });

  it("falls back to the question's shared wordBank only when the question has fields at all", () => {
    const q = { fields: [{ order: 0 }], wordBank: ["Class A", "Class B", "Class C"] };
    expect(resolveTableRowOptions(q, 0)).toEqual({ values: ["Class A", "Class B", "Class C"], isBoolean: false });
  });

  it("never leaks a shared wordBank into a table that has no fields at all (legacy exam)", () => {
    const q = { wordBank: ["Class A", "Class B"] };
    expect(resolveTableRowOptions(q, 0)).toBeNull();
  });

  it("returns null for a legacy question with no fields, options, or wordBank - triggers the old free-text/checkbox fallback", () => {
    expect(resolveTableRowOptions({}, 0)).toBeNull();
  });

  it("returns null when the row's field has an empty options array and is not boolean and there is no wordBank fallback", () => {
    const q = { fields: [{ order: 0, options: [] }] };
    expect(resolveTableRowOptions(q, 0)).toBeNull();
  });
});
